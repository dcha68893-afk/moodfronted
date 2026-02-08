// =============================================
// GROUPS UI FUNCTIONS
// INTEGRATED WITH GROUPS CORE SYSTEM
// =============================================

// Import core functions and state
import {
    // State variables
    currentUser, userData, groups, myGroups, joinedGroups, groupInvites, adminGroups,
    selectedGroup, currentTypeFilter, currentSearchTerm, isLoadedFromLocalStorage,
    isMobile, pendingGroupActions, offlineOverlayDismissed, friends, selectedFriends,
    
    // Feature variables
    groupPurposes, groupMoods, postingRules, participationModes, groupTopics,
    groupTypes, groupThemes, groupRoles,
    
    // Chat & Call variables
    currentChatGroup, chatMessagesList, isTyping, callInProgress, callStartTime,
    callTimer, localStream, peerConnections,
    
    // Unique features state
    currentParticipationMode, isSilentMode, isAnonymousMode, groupNotes, groupEvents,
    transparencyLog, energySuggestions,
    
    // Local storage keys
    LOCAL_STORAGE_KEYS,
    
    // Flags and state
    isPageInitialized, authReady, authCheckComplete, backgroundSyncRunning, syncIntervalId,
    apiInitialized, tokenReadyPromise, tokenReadyResolve, tokenReadyReject, tokenQueue,
    isProcessingTokenQueue,
    
    // Parent connection
    parentConnection, PARENT_MESSAGE_TYPES, SESSION_SCHEMA,
    
    // Parent coordination functions
    initializeParentConnection, verifyParentPresence, setupParentMessageListener,
    handleParentMessage, startHandshakeProtocol, scheduleHandshakeRetry,
    sendMessageToParent, handleParentReady, handleSessionData, validateSessionData,
    updateLocalStateFromSession, handleSessionUpdate, handleLogout, clearLocalSessionState,
    handleParentUnavailable, sendStatusToParent, handleLegacySessionMessage,
    enableProtectedUI, disableProtectedUI, showReconnectState, startBackgroundProcesses,
    stopBackgroundProcesses,
    
    // Token management
    initializeTokenSystem, waitForTokenReady, getUnifiedToken, saveUnifiedToken,
    migrateLegacyTokens, getCurrentUser,
    
    // API functions
    queueApiCall, processTokenQueue, secureApiCall, safeApiCall,
    
    // Main initialization
    initGroupPage, loadUserDataInBackground, updateUserUI,
    
    // Core group functions
    loadCachedDataInstantly, loadUniqueFeaturesData, calculateGroupPulse,
    updateGroupCounts, updateCurrentSection, renderAllGroups, addGroupItem,
    handleGroupAction,
    
    // Background sync
    startBackgroundSync, backgroundSyncWithServer,
    
    // Chat and group management
    openGroupChat, updateChatHeaderUniqueFeatures, checkPostingRules,
    updateParticipationModeButtons, loadUniqueFeaturesPanels, loadGroupNotes,
    loadGroupEvents, generateUniqueEventsForUser, hashCode, loadTransparencyLog,
    generateInitialTransparencyLog, analyzeGroupEnergy, generateSimulatedMessages,
    closeGroupChatMobile, hideAllPanels, loadGroupChatMessages, addMessageToChat,
    addSystemMessage, saveMessageToCache, sendGroupMessage, toggleSilentMode,
    toggleAnonymousMode, reactToMessage, replyToMessage, deleteMessage,
    setupTypingListener, stopTypingIndicator, adjustTextareaHeight, formatMessageTime,
    
    // Admin management
    openAdminManagement, loadGroupMembersForManagement, generateSimulatedMembers,
    renderMembersList, handleMemberAction, logTransparencyAction,
    loadGroupSettingsForManagement, loadUniqueFeaturesForManagement,
    updatePostingRulesUI, saveGroupSettings,
    
    // Friend selection
    showFriendSelection, renderFriendSelection, updateSelectedFriendsList,
    removeSelectedFriend,
    
    // Group creation and joining
    createGroupOnline, joinGroupOnline, leaveGroupOnline, acceptGroupInvite,
    declineGroupInvite, leaveGroupConfirm,
    
    // Group details
    showGroupDetails, loadGroupDetails, showGroupOptions, viewGroupNotes,
    viewGroupEvents, viewGroupAnalytics, loadGroupAnalytics, renderAnalyticsChart,
    changePurposeMood, updatePostingRules, viewChangeHistory, showOptionsModal,
    shareGroup, muteGroup, favoriteGroup, reportGroup, blockGroup, showGroupQRCode,
    downloadQRCode, copyInviteLink, inviteMembers, editGroupInfo, manageRoles,
    createEvent, saveNewEvent, createPoll, addPollOption, removePollOption,
    saveNewPoll, voteOnPoll, showGroupInviteDetails,
    
    // Data sync
    syncGroupsFromServer, syncGroupInvitesFromServer, syncUniqueFeaturesData,
    matchesFilters, matchesSearch, filterGroupsByType, searchGroups,
    saveGroupsToLocalStorage,
    
    // Utility functions
    formatTimeAgo, formatDate, showNotification, processPendingOfflineActions,
    updateCreateGroupPostingRulesUI
} from './group-core.js';

// =============================================
// UI SPECIFIC FUNCTIONS
// =============================================

/**
 * Check if device is mobile
 */
export function checkMobile() {
    isMobile = window.innerWidth <= 768;
    console.log('[Groups iframe] Mobile detection:', isMobile);
}

/**
 * Setup event listeners for UI
 */
export function setupEventListeners() {
    console.log('[Groups iframe] Setting up UI event listeners...');
    
    // Category tabs
    const allTab = document.getElementById('allTab');
    const myGroupsTab = document.getElementById('myGroupsTab');
    const joinedTab = document.getElementById('joinedTab');
    const invitesTab = document.getElementById('invitesTab');
    const adminTab = document.getElementById('adminTab');
    
    const allGroupsSection = document.getElementById('allGroupsSection');
    const myGroupsSection = document.getElementById('myGroupsSection');
    const joinedSection = document.getElementById('joinedSection');
    const invitesSection = document.getElementById('invitesSection');
    const adminSection = document.getElementById('adminSection');
    
    if (allTab) {
        allTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (allGroupsSection) allGroupsSection.classList.add('active');
            updateCurrentSection();
        });
    }
    
    if (myGroupsTab) {
        myGroupsTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (myGroupsSection) myGroupsSection.classList.add('active');
            updateCurrentSection();
        });
    }
    
    if (joinedTab) {
        joinedTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (joinedSection) joinedSection.classList.add('active');
            updateCurrentSection();
        });
    }
    
    if (invitesTab) {
        invitesTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (invitesSection) invitesSection.classList.add('active');
            updateCurrentSection();
        });
    }
    
    if (adminTab) {
        adminTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (adminSection) adminSection.classList.add('active');
            updateCurrentSection();
        });
    }
    
    // Type filter buttons
    document.querySelectorAll('.type-filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            filterGroupsByType(type);
        });
    });
    
    // Search input
    const groupSearch = document.getElementById('groupSearch');
    if (groupSearch) {
        groupSearch.addEventListener('input', function() {
            searchGroups(this.value);
        });
    }
    
    // Create group button
    const createGroupBtn = document.getElementById('createGroupBtn');
    const createGroupModal = document.getElementById('createGroupModal');
    
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => {
            // Check if we have authentication
            if (!parentConnection.handshakeComplete && !getCurrentUser()) {
                showNotification('Please log in to create groups', 'error');
                return;
            }
            
            if (createGroupModal) {
                createGroupModal.classList.add('active');
                const basicTab = document.querySelector('.create-group-tab[data-tab="basic"]');
                if (basicTab) basicTab.click();
                
                // Reset form
                const groupNameInput = document.getElementById('groupNameInput');
                const groupDescriptionInput = document.getElementById('groupDescriptionInput');
                const groupTopicInput = document.getElementById('groupTopicInput');
                const groupTypeSelect = document.getElementById('groupTypeSelect');
                const welcomeMessageInput = document.getElementById('welcomeMessageInput');
                const groupRulesInput = document.getElementById('groupRulesInput');
                const approveNewMembers = document.getElementById('approveNewMembers');
                const onlyAdminsCanPost = document.getElementById('onlyAdminsCanPost');
                const allowMediaSharing = document.getElementById('allowMediaSharing');
                const enableDisappearingMessages = document.getElementById('enableDisappearingMessages');
                const groupPurposeSelect = document.getElementById('groupPurposeSelect');
                const postingRulesSelect = document.getElementById('postingRulesSelect');
                const enableReadOnlyMode = document.getElementById('enableReadOnlyMode');
                const enableReactOnlyMode = document.getElementById('enableReactOnlyMode');
                const enableAnonymousMode = document.getElementById('enableAnonymousMode');
                
                if (groupNameInput) groupNameInput.value = '';
                if (groupDescriptionInput) groupDescriptionInput.value = '';
                if (groupTopicInput) groupTopicInput.value = '';
                if (groupTypeSelect) groupTypeSelect.value = 'private';
                if (welcomeMessageInput) welcomeMessageInput.value = '';
                if (groupRulesInput) groupRulesInput.value = '1. Be respectful to all members\n2. No spam or self-promotion\n3. Keep discussions relevant to the group topic\n4. No hate speech or harassment';
                if (approveNewMembers) approveNewMembers.checked = true;
                if (onlyAdminsCanPost) onlyAdminsCanPost.checked = false;
                if (allowMediaSharing) allowMediaSharing.checked = true;
                if (enableDisappearingMessages) enableDisappearingMessages.checked = false;
                if (groupPurposeSelect) groupPurposeSelect.value = '';
                if (postingRulesSelect) postingRulesSelect.value = 'everyone';
                if (enableReadOnlyMode) enableReadOnlyMode.checked = false;
                if (enableReactOnlyMode) enableReactOnlyMode.checked = false;
                if (enableAnonymousMode) enableAnonymousMode.checked = false;
                
                document.querySelectorAll('.theme-option').forEach(option => {
                    const icon = option.querySelector('i');
                    if (icon) icon.style.display = 'none';
                });
                const blueThemeOption = document.querySelector('.theme-option[data-theme="blue"]');
                if (blueThemeOption) {
                    const icon = blueThemeOption.querySelector('i');
                    if (icon) icon.style.display = 'inline';
                }
                
                document.querySelectorAll('.mood-option').forEach(option => {
                    const icon = option.querySelector('i');
                    if (icon) icon.style.display = 'none';
                });
                const calmMoodOption = document.querySelector('.mood-option[data-mood="calm"]');
                if (calmMoodOption) {
                    const icon = calmMoodOption.querySelector('i');
                    if (icon) icon.style.display = 'inline';
                }
                
                document.querySelectorAll('.reaction-option').forEach(option => {
                    option.classList.remove('selected');
                });
                
                updateCreateGroupPostingRulesUI();
            }
        });
    }
    
    // Create group modal tabs
    document.querySelectorAll('.create-group-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            document.querySelectorAll('.create-group-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.create-group-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const targetContent = document.getElementById(`createGroupTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
    
    // Create group form submission
    const createGroupForm = document.getElementById('createGroupForm');
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const groupNameInput = document.getElementById('groupNameInput');
            const groupDescriptionInput = document.getElementById('groupDescriptionInput');
            const groupTopicInput = document.getElementById('groupTopicInput');
            const groupTypeSelect = document.getElementById('groupTypeSelect');
            const welcomeMessageInput = document.getElementById('welcomeMessageInput');
            const groupRulesInput = document.getElementById('groupRulesInput');
            const approveNewMembers = document.getElementById('approveNewMembers');
            const onlyAdminsCanPost = document.getElementById('onlyAdminsCanPost');
            const allowMediaSharing = document.getElementById('allowMediaSharing');
            const enableDisappearingMessages = document.getElementById('enableDisappearingMessages');
            const groupPurposeSelect = document.getElementById('groupPurposeSelect');
            const postingRulesSelect = document.getElementById('postingRulesSelect');
            const quietStart = document.getElementById('quietStart');
            const quietEnd = document.getElementById('quietEnd');
            const postingStart = document.getElementById('postingStart');
            const postingEnd = document.getElementById('postingEnd');
            const enableReadOnlyMode = document.getElementById('enableReadOnlyMode');
            const enableReactOnlyMode = document.getElementById('enableReactOnlyMode');
            const enableAnonymousMode = document.getElementById('enableAnonymousMode');
            
            if (!groupNameInput || !groupNameInput.value.trim()) {
                showNotification('Please enter a group name', 'error');
                return;
            }
            
            const selectedTheme = document.querySelector('.theme-option.selected');
            const selectedMood = document.querySelector('.mood-option.selected');
            const selectedReactions = Array.from(document.querySelectorAll('.reaction-option.selected'))
                .map(opt => opt.dataset.reaction);
            
            const groupData = {
                name: groupNameInput.value.trim(),
                description: groupDescriptionInput ? groupDescriptionInput.value.trim() : '',
                topic: groupTopicInput ? groupTopicInput.value.trim() : '',
                privacy: groupTypeSelect ? groupTypeSelect.value : 'private',
                theme: selectedTheme ? selectedTheme.dataset.theme : 'blue',
                welcomeMessage: welcomeMessageInput ? welcomeMessageInput.value.trim() : '',
                rules: groupRulesInput ? groupRulesInput.value.split('\n').filter(rule => rule.trim()) : [],
                moderationSettings: {
                    approveNewMembers: approveNewMembers ? approveNewMembers.checked : true,
                    onlyAdminsCanPost: onlyAdminsCanPost ? onlyAdminsCanPost.checked : false,
                    allowMediaSharing: allowMediaSharing ? allowMediaSharing.checked : true,
                    disappearingMessages: enableDisappearingMessages ? enableDisappearingMessages.checked : false
                },
                joinQuestions: [],
                customReactions: selectedReactions.length > 0 ? selectedReactions : ['👍', '❤️', '😂'],
                badges: ['star', 'fire'],
                purpose: groupPurposeSelect ? groupPurposeSelect.value : '',
                mood: selectedMood ? selectedMood.dataset.mood : '',
                postingRule: postingRulesSelect ? postingRulesSelect.value : 'everyone',
                quietHours: postingRulesSelect && postingRulesSelect.value === 'quiet_hours' ? {
                    start: quietStart ? quietStart.value : '22:00',
                    end: quietEnd ? quietEnd.value : '08:00'
                } : {},
                scheduledPosting: postingRulesSelect && postingRulesSelect.value === 'scheduled' ? {
                    start: postingStart ? postingStart.value : '09:00',
                    end: postingEnd ? postingEnd.value : '18:00'
                } : {},
                participationModes: {
                    readOnly: enableReadOnlyMode ? enableReadOnlyMode.checked : false,
                    reactOnly: enableReactOnlyMode ? enableReactOnlyMode.checked : false,
                    anonymous: enableAnonymousMode ? enableAnonymousMode.checked : false
                }
            };
            
            createGroupOnline(groupData);
        });
    }
    
    // Add members button
    const addMembersBtn = document.getElementById('addMembersBtn');
    if (addMembersBtn) {
        addMembersBtn.addEventListener('click', showFriendSelection);
    }
    
    // Theme selection
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.theme-option').forEach(opt => {
                const icon = opt.querySelector('i');
                if (icon) icon.style.display = 'none';
            });
            
            const icon = this.querySelector('i');
            if (icon) icon.style.display = 'inline';
            
            document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    // Mood selection
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.mood-option').forEach(opt => {
                const icon = opt.querySelector('i');
                if (icon) icon.style.display = 'none';
            });
            
            const icon = this.querySelector('i');
            if (icon) icon.style.display = 'inline';
            
            document.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    // Reaction selection
    document.querySelectorAll('.reaction-option').forEach(option => {
        option.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
    });
    
    // Posting rules select
    const postingRulesSelect = document.getElementById('postingRulesSelect');
    if (postingRulesSelect) {
        postingRulesSelect.addEventListener('change', updateCreateGroupPostingRulesUI);
    }
    
    // Friend selection modal close
    const friendSelectionClose = document.getElementById('friendSelectionClose');
    if (friendSelectionClose) {
        friendSelectionClose.addEventListener('click', () => {
            const friendSelectionModal = document.getElementById('friendSelectionModal');
            if (friendSelectionModal) {
                friendSelectionModal.classList.remove('active');
            }
        });
    }
    
    // Confirm friend selection
    const confirmFriendSelectionBtn = document.getElementById('confirmFriendSelectionBtn');
    if (confirmFriendSelectionBtn) {
        confirmFriendSelectionBtn.addEventListener('click', () => {
            const friendSelectionModal = document.getElementById('friendSelectionModal');
            if (friendSelectionModal) {
                friendSelectionModal.classList.remove('active');
            }
            showNotification(`${selectedFriends.length} friends selected`, 'success');
        });
    }
    
    // Create group modal close
    const createGroupClose = document.getElementById('createGroupClose');
    if (createGroupClose) {
        createGroupClose.addEventListener('click', () => {
            const createGroupModal = document.getElementById('createGroupModal');
            if (createGroupModal) {
                createGroupModal.classList.remove('active');
            }
        });
    }
    
    // Group details close
    const groupDetailsClose = document.getElementById('groupDetailsClose');
    if (groupDetailsClose) {
        groupDetailsClose.addEventListener('click', () => {
            const groupDetailsPanel = document.getElementById('groupDetailsPanel');
            if (groupDetailsPanel) {
                groupDetailsPanel.classList.remove('active');
                if (isMobile) {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) sidebar.style.display = 'flex';
                }
            }
        });
    }
    
    // Group chat send button
    const chatSendBtn = document.getElementById('chatSendBtn');
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendGroupMessage);
    }
    
    // Chat input enter key
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGroupMessage();
            }
        });
        
        chatInput.addEventListener('input', adjustTextareaHeight);
    }
    
    // Silent mode toggle
    const silentModeBtn = document.getElementById('silentModeBtn');
    if (silentModeBtn) {
        silentModeBtn.addEventListener('click', toggleSilentMode);
    }
    
    // Anonymous mode toggle
    const anonymousModeBtn = document.getElementById('anonymousModeBtn');
    if (anonymousModeBtn) {
        anonymousModeBtn.addEventListener('click', toggleAnonymousMode);
    }
    
    // Admin management tabs
    document.querySelectorAll('.admin-management-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            document.querySelectorAll('.admin-management-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.admin-management-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const targetContent = document.getElementById(`adminTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
    
    // Admin posting mode select
    const adminPostingMode = document.getElementById('adminPostingMode');
    if (adminPostingMode) {
        adminPostingMode.addEventListener('change', updatePostingRulesUI);
    }
    
    // Mood select buttons
    document.querySelectorAll('.mood-select-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.mood-select-btn').forEach(b => {
                b.classList.remove('active');
                b.style.borderWidth = '1px';
            });
            
            this.classList.add('active');
            this.style.borderWidth = '2px';
        });
    });
    
    // Save group settings
    const saveGroupSettingsBtn = document.getElementById('saveGroupSettingsBtn');
    if (saveGroupSettingsBtn) {
        saveGroupSettingsBtn.addEventListener('click', () => {
            if (selectedGroup) {
                saveGroupSettings(selectedGroup);
            }
        });
    }
    
    // Close admin management
    const adminManagementClose = document.getElementById('adminManagementClose');
    if (adminManagementClose) {
        adminManagementClose.addEventListener('click', () => {
            const adminManagementModal = document.getElementById('adminManagementModal');
            if (adminManagementModal) {
                adminManagementModal.classList.remove('active');
            }
        });
    }
    
    // Close group invite modal
    const groupInviteClose = document.getElementById('groupInviteClose');
    if (groupInviteClose) {
        groupInviteClose.addEventListener('click', () => {
            const groupInviteModal = document.getElementById('groupInviteModal');
            if (groupInviteModal) {
                groupInviteModal.classList.remove('active');
            }
        });
    }
    
    // Accept invite button
    const acceptInviteBtn = document.getElementById('acceptInviteBtn');
    if (acceptInviteBtn) {
        acceptInviteBtn.addEventListener('click', () => {
            if (window.currentInvite) {
                acceptGroupInvite(window.currentInvite);
            }
        });
    }
    
    // Decline invite button
    const declineInviteBtn = document.getElementById('declineInviteBtn');
    if (declineInviteBtn) {
        declineInviteBtn.addEventListener('click', () => {
            if (window.currentInvite) {
                declineGroupInvite(window.currentInvite);
            }
        });
    }
    
    // Copy invite link button
    const copyInviteLinkBtn = document.getElementById('copyInviteLinkBtn');
    if (copyInviteLinkBtn) {
        copyInviteLinkBtn.addEventListener('click', () => {
            const inviteLinkInput = document.getElementById('inviteLinkInput');
            if (inviteLinkInput && inviteLinkInput.value) {
                navigator.clipboard.writeText(inviteLinkInput.value);
                showNotification('Invite link copied to clipboard', 'success');
            }
        });
    }
    
    // Share invite link button
    const shareInviteLinkBtn = document.getElementById('shareInviteLinkBtn');
    if (shareInviteLinkBtn) {
        shareInviteLinkBtn.addEventListener('click', () => {
            const inviteLinkInput = document.getElementById('inviteLinkInput');
            if (inviteLinkInput && inviteLinkInput.value && navigator.share) {
                navigator.share({
                    title: 'Join my group',
                    text: 'Join my group on Knecta Chat',
                    url: inviteLinkInput.value
                });
            }
        });
    }
    
    // Notification close
    const notificationClose = document.getElementById('notificationClose');
    if (notificationClose) {
        notificationClose.addEventListener('click', () => {
            const notification = document.getElementById('notification');
            if (notification) {
                notification.classList.remove('active');
            }
        });
    }
    
    console.log('[Groups iframe] UI event listeners setup complete');
}

/**
 * Render groups list instantly from cache
 */
export function renderGroupsListInstantly() {
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
    
    const fragment = document.createDocumentFragment();
    const groupsToRender = groups.slice(0, 15);
    
    groupsToRender.forEach(group => {
        addGroupItemInstant(group, fragment, 'group');
    });
    
    allGroupsList.appendChild(fragment);
    
    if (groups.length > 15) {
        setTimeout(() => {
            const remainingGroups = groups.slice(15);
            remainingGroups.forEach(group => {
                addGroupItemInstant(group, allGroupsList, 'group');
            });
        }, 100);
    }
    
    allGroupsList.classList.add('instant-load');
}

/**
 * Add group item instantly from cache
 */
export function addGroupItemInstant(groupData, container, type) {
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
                </span>
            </div>
            <div class="group-details">
                ${purposeInfo ? `<span class="group-purpose-tag">${purposeInfo.icon} ${purposeInfo.name}</span>` : ''}
                ${moodInfo ? `<span class="group-mood-indicator mood-${mood}" style="background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
                ${groupData.topic ? `<span class="group-topic">${groupData.topic}</span>` : ''}
                <span class="member-count"><i class="fas fa-users"></i> ${groupData.memberCount || 0}</span>
                <span>${typeInfo ? typeInfo.name : 'Private'}</span>
            </div>
            ${ruleInfo ? `<div style="font-size: 11px; color: ${ruleInfo.color}; margin-top: 3px;"><i class="fas fa-comment"></i> ${ruleInfo.name}</div>` : ''}
        </div>
        <div class="group-actions">
            <button class="group-action-btn chat" data-action="open-chat" title="Open Chat">
                <i class="fas fa-comments"></i>
            </button>
            <button class="group-action-btn" data-action="info" title="Group Info">
                <i class="fas fa-info-circle"></i>
            </button>
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
 * Render my groups
 */
export function renderMyGroups() {
    const myGroupsList = document.getElementById('myGroupsList');
    if (!myGroupsList) return;
    
    myGroupsList.innerHTML = '';
    
    if (myGroups.length === 0) {
        myGroupsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <p>You haven't created any groups yet</p>
                <p class="subtext">Create your first group to get started</p>
            </div>
        `;
        return;
    }
    
    myGroups.forEach(group => {
        if (matchesFilters(group)) {
            addGroupItem(group, myGroupsList, 'my_group');
        }
    });
    
    if (myGroupsList.children.length === 0) {
        myGroupsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No groups match your filters</p>
                <p class="subtext">Try changing your search or filter criteria</p>
            </div>
        `;
    }
}

/**
 * Render joined groups
 */
export function renderJoinedGroups() {
    const joinedList = document.getElementById('joinedList');
    if (!joinedList) return;
    
    joinedList.innerHTML = '';
    
    if (joinedGroups.length === 0) {
        joinedList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-plus"></i>
                <p>You haven't joined any groups yet</p>
                <p class="subtext">Join groups to connect with others</p>
            </div>
        `;
        return;
    }
    
    joinedGroups.forEach(group => {
        if (matchesFilters(group)) {
            addGroupItem(group, joinedList, 'joined');
        }
    });
    
    if (joinedList.children.length === 0) {
        joinedList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No groups match your filters</p>
                <p class="subtext">Try changing your search or filter criteria</p>
            </div>
        `;
    }
}

/**
 * Render group invites
 */
export function renderGroupInvites() {
    const invitesList = document.getElementById('invitesList');
    if (!invitesList) return;
    
    invitesList.innerHTML = '';
    
    if (groupInvites.length === 0) {
        invitesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-envelope"></i>
                <p>No group invitations</p>
                <p class="subtext">You'll see invitations here when you receive them</p>
            </div>
        `;
        return;
    }
    
    groupInvites.forEach(invite => {
        if (matchesFilters(invite)) {
            addGroupItem(invite, invitesList, 'group_invite');
        }
    });
    
    if (invitesList.children.length === 0) {
        invitesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No invitations match your filters</p>
                <p class="subtext">Try changing your search or filter criteria</p>
            </div>
        `;
    }
}

/**
 * Render admin groups
 */
export function renderAdminGroups() {
    const adminList = document.getElementById('adminList');
    if (!adminList) return;
    
    adminList.innerHTML = '';
    
    if (adminGroups.length === 0) {
        adminList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-crown"></i>
                <p>You're not an admin of any groups</p>
                <p class="subtext">Create a group or get promoted to admin to manage groups</p>
            </div>
        `;
        return;
    }
    
    adminGroups.forEach(group => {
        if (matchesFilters(group)) {
            addGroupItem(group, adminList, 'admin');
        }
    });
    
    if (adminList.children.length === 0) {
        adminList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No groups match your filters</p>
                <p class="subtext">Try changing your search or filter criteria</p>
            </div>
        `;
    }
}

// =============================================
// MAIN UI INITIALIZATION
// =============================================

/**
 * Initialize the UI components
 */
export function initGroupUI() {
    console.log('[Groups iframe] Initializing UI...');
    
    // STEP 2: IMMEDIATE UI RENDERING FROM CACHE (don't wait for parent)
    console.log('[Groups iframe] Loading cached data instantly for UI...');
    loadCachedDataInstantly();
    renderGroupsListInstantly();
    
    // STEP 3: Set up event listeners immediately
    console.log('[Groups iframe] Setting up event listeners...');
    setupEventListeners();
    
    // STEP 4: Check mobile and set up resize listener
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    console.log('[Groups iframe] UI initialization complete');
}

// =============================================
// GLOBAL EXPORTS FOR WINDOW ACCESS
// =============================================

// Export functions that need to be accessible from HTML onclick handlers
window.reactToMessage = reactToMessage;
window.replyToMessage = replyToMessage;
window.deleteMessage = deleteMessage;
window.removeSelectedFriend = removeSelectedFriend;
window.downloadQRCode = downloadQRCode;
window.addPollOption = addPollOption;
window.removePollOption = removePollOption;
window.saveNewPoll = saveNewPoll;
window.voteOnPoll = voteOnPoll;
window.saveNewEvent = saveNewEvent;