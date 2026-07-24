/**
 * PART 3/3 — UI BRIDGE & PUBLIC API
 * UI bridge, public API, initialization
 */
t.setSelectionRange(_selStart, _selEnd); } catch (_) {}
            }
        }
        
        newChatInput.addEventListener('input', () => {
            try {
                adjustTextareaHeight();
                updateGroupPrimaryActionState();
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

function renderMembersList(memberDetails) {
    try {
        const memberList = safeGetElement('#memberManagementList');
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
                success = (await GroupCore.promoteToAdmin(groupData.id, memberId)).success;
                await secureApiCall(`/groups/${groupData.id}/members/${memberId}/promote`, { method: 'POST' }).catch(() => {});
                logTransparencyAction(groupData.id, 'Promoted member to admin', memberId);
                break;
            case 'demote':
                success = (await GroupCore.demoteFromAdmin(groupData.id, memberId)).success;
                await secureApiCall(`/groups/${groupData.id}/members/${memberId}/demote`, { method: 'POST' }).catch(() => {});
                logTransparencyAction(groupData.id, 'Demoted admin to member', memberId);
                break;
            case 'remove':
                if (confirm('Are you sure you want to remove this member from the group?')) {
                    success = (await GroupCore.removeMember(groupData.id, memberId)).success;
                    await secureApiCall(`/groups/${groupData.id}/members/${memberId}`, { method: 'DELETE' }).catch(() => {});
                    logTransparencyAction(groupData.id, 'Removed member from group', memberId);
                }
                break;
        }
        
        if (success) {
            loadGroupMembersForManagement(groupData);
        }
    } catch (error) {}
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
    } catch (error) {}
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
const joinGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'joinGroup', groupId });
        return;
    }
    
    try {
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const response = await GroupCore.sendJoinRequest(groupId);
        
        if (!response || !response.success) {
            return;
        }
        
        const detailsResponse = await GroupCore.getGroupDetails(groupId).catch(() => null);
        const updatedGroup = detailsResponse?.data || GroupCore.getGroupById(groupId) || response.data || { id: groupId };
        
        const existingIndex = groups.findIndex(g => String(g.id) === String(groupId));
        if (existingIndex !== -1) {
            groups[existingIndex] = updatedGroup;
        } else {
            groups.push(updatedGroup);
        }
        
        const joinedIndex = joinedGroups.findIndex(g => String(g.id) === String(groupId));
        if (joinedIndex === -1) joinedGroups.push(updatedGroup);
        else joinedGroups[joinedIndex] = updatedGroup;
        groupInvites = groupInvites.filter(invite => String(invite.groupId) !== String(groupId));
        
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
        
    } catch (error) {}
};

const leaveGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'leaveGroup', groupId });
        return;
    }
    
    try {
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const response = await GroupCore.leaveGroup(groupId);
        
        if (!response || !response.success) {
            return;
        }
        
        groups = groups.filter(g => g.id !== groupId);
        joinedGroups = joinedGroups.filter(g => g.id !== groupId);
        adminGroups = adminGroups.filter(g => g.id !== groupId);
        
        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();
        
        const groupDetailsPanel = safeGetElement('#groupDetailsPanel');
        if (groupDetailsPanel && groupDetailsPanel.classList.contains('active')) {
            groupDetailsPanel.classList.remove('active');
            selectedGroup = null;
        }
        
        if (currentChatGroup && currentChatGroup.id === groupId) {
            if (typeof closeGroupChatMobile === 'function') {
                closeGroupChatMobile();
            }
            currentChatGroup = null;
        }
        
        // Use safeSend for parent communication
        safeSend('MEMBER_REMOVED', {
            groupId,
            userId: session.user?.uid || session.user?.id,
            timestamp: Date.now()
        });
        
    } catch (error) {}
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
            return;
        }

        // Update local state — add to joinedGroups
        const detailsResponse = await GroupCore.getGroupDetails(groupId).catch(() => null);
        const groupData = detailsResponse?.data || response.data?.group || GroupCore.getGroupById(groupId);
        if (groupData) {
            const upsert = (list) => {
                const idx = list.findIndex(g => String(g.id) === String(groupId));
                if (idx === -1) list.push(groupData);
                else list[idx] = groupData;
            };
            upsert(joinedGroups);
            upsert(groups);
        }
        groupInvites = groupInvites.filter(inv => (inv.id || inv.inviteId) !== inviteId);
        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();
        const groupInviteModal = safeGetElement('#groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
    } catch (error) {}
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
            return;
        }

        groupInvites = groupInvites.filter(invite => (invite.id || invite.inviteId) !== inviteId);

        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();

        const groupInviteModal = safeGetElement('#groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
    } catch (error) {}
}

function leaveGroupConfirm(groupData) {
    try {
        if (confirm(`Are you sure you want to leave "${groupData.name}"? You will need to be invited again to rejoin.`)) {
            leaveGroupOnline(groupData.id);
        }
    } catch (error) {}
}

const showGroupDetails = async function(groupData, type) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => showGroupDetails(groupData, type));
        return;
    }
    
    try {
        if (!groupData) return;
        
        selectedGroup = groupData;
        
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
            groups = serverGroups;
            myGroups = serverMyGroups;
            joinedGroups = serverJoinedGroups;
            adminGroups = serverAdminGroups;
            
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
        const response = await secureApiCall('/groups/invites/user', { silent: true });
        
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

// =============================================
// CORE FUNCTIONS (PRESERVED)
// =============================================
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
        const GC = (typeof window !== 'undefined' && window.GroupCore) ? window.GroupCore : null;
        const liveGroups      = (GC && Array.isArray(GC.groups))       ? GC.groups       : groups;
        const liveMyGroups    = (GC && Array.isArray(GC.myGroups))     ? GC.myGroups     : myGroups;
        const liveJoined      = (GC && Array.isArray(GC.joinedGroups)) ? GC.joinedGroups : joinedGroups;
        const liveAdmin       = (GC && Array.isArray(GC.adminGroups))  ? GC.adminGroups  : adminGroups;
        // groupInvites IS kept correctly in sync by syncGroupInvitesFromServer(), so no GC fallback needed there.

        const totalGroupsEl = safeGetElement('#totalGroups');
        const activeGroupsEl = safeGetElement('#activeGroups');
        const totalMembersEl = safeGetElement('#totalMembers');
        const myGroupsCountEl = safeGetElement('#myGroupsCount');
        const joinedCountEl = safeGetElement('#joinedCount');
        const invitesCountEl = safeGetElement('#invitesCount');
        const adminCountEl = safeGetElement('#adminCount');

        if (totalGroupsEl) totalGroupsEl.textContent = liveGroups.length;

        const activeGroups = liveGroups.filter(g => g.lastActivity && (Date.now() - new Date(g.lastActivity).getTime()) < 86400000).length;
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
                groups = liveGroups;
                myGroups = liveMyGroups;
                joinedGroups = liveJoined;
                adminGroups = liveAdmin;
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
window.updateGroupCounts = updateGroupCounts;

function updateCurrentSection() {
    try {
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
    } catch (error) {}
}

function renderAllGroups() {
    try {
        const allGroupsList = safeGetElement('#allGroupsList');
        if (!allGroupsList) return;

        // FIX (all-groups-empty-real-data): this used to read the bare
        // `groups` module variable, which requestGroupList() never touches
        // directly and which only got backfilled as a side effect of
        // updateGroupCounts() having already run. If this rendered first —
        // e.g. on initial tab load — it saw an empty array and showed "No
        // groups yet" even though the server had real groups, while the
        // Discover modal's "My Groups" tab (which reads window.GroupCore
        // directly, with its own API fallback) displayed them correctly.
        // Mirror that: prefer live GroupCore data and de-dupe across
        // groups/myGroups/joinedGroups like Discover does.
        const GC = (typeof window !== 'undefined' && window.GroupCore) ? window.GroupCore : null;
        const seenAll = new Set();
        const liveAll = [
            ...((GC && GC.groups) || groups || []),
            ...((GC && GC.myGroups) || myGroups || []),
            ...((GC && GC.joinedGroups) || joinedGroups || []),
        ].filter(g => {
            if (!g || !g.id) return false;
            const key = String(g.id);
            if (seenAll.has(key)) return false;
            seenAll.add(key);
            return true;
        });

        allGroupsList.innerHTML = '';

        if (liveAll.length === 0) {
            if (GC && typeof GC.requestGroupList === 'function' && !GC._allGroupsFetchInFlight) {
                GC._allGroupsFetchInFlight = true;
                allGroupsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading groups…</p>
                    </div>
                `;
                GC.requestGroupList().then(() => {
                    GC._allGroupsFetchInFlight = false;
                    renderAllGroups();
                }).catch(() => {
                    GC._allGroupsFetchInFlight = false;
                    allGroupsList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-users"></i>
                            <p>No groups yet</p>
                            <p class="subtext">Create or join groups to start connecting</p>
                        </div>
                    `;
                });
                return;
            }
            allGroupsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No groups yet</p>
                    <p class="subtext">Create or join groups to start connecting</p>
                </div>
            `;
            return;
        }
        
        liveAll.forEach(group => {
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
    } catch (error) {}
}

function renderMyGroups() {
    try {
        const myGroupsList = safeGetElement('#myGroupsList');
        if (!myGroupsList) return;
        
        myGroupsList.innerHTML = '';

        // FIX (all-groups-empty-real-data): prefer live GroupCore data over
        // the bare module variable — see renderAllGroups() above for why.
        const GC_my = (typeof window !== 'undefined' && window.GroupCore) ? window.GroupCore : null;
        const liveMyGroups = (GC_my && Array.isArray(GC_my.myGroups)) ? GC_my.myGroups : myGroups;

        if (liveMyGroups.length === 0) {
            myGroupsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No groups created yet</p>
                    <p class="subtext">Create your first group to get started</p>
                </div>
            `;
            return;
        }
        
        liveMyGroups.forEach(group => {
            if (matchesFilters(group)) {
                addGroupItem(group, myGroupsList, 'my_group');
            }
        });
    } catch (error) {}
}

function renderJoinedGroups() {
    try {
        const joinedList = safeGetElement('#joinedList');
        if (!joinedList) return;
        
        joinedList.innerHTML = '';

        // FIX (all-groups-empty-real-data): prefer live GroupCore data over
        // the bare module variable — see renderAllGroups() above for why.
        const GC_joined = (typeof window !== 'undefined' && window.GroupCore) ? window.GroupCore : null;
        const liveJoinedGroups = (GC_joined && Array.isArray(GC_joined.joinedGroups)) ? GC_joined.joinedGroups : joinedGroups;

        if (liveJoinedGroups.length === 0) {
            joinedList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus"></i>
                    <p>No joined groups yet</p>
                    <p class="subtext">Join groups to see them here</p>
                </div>
            `;
            return;
        }
        
        liveJoinedGroups.forEach(group => {
            if (matchesFilters(group)) {
                addGroupItem(group, joinedList, 'joined');
            }
        });
    } catch (error) {}
}

function renderGroupInvites() {
    try {
        const invitesList = safeGetElement('#invitesList');
        if (!invitesList) return;
        
        invitesList.innerHTML = '';
        
        if (groupInvites.length === 0) {
            invitesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-envelope"></i>
                    <p>No pending invitations</p>
                    <p class="subtext">You'll see group invitations here</p>
                </div>
            `;
            return;
        }
        
        groupInvites.forEach(invite => {
            if (matchesFilters(invite)) {
                addGroupItem(invite, invitesList, 'group_invite');
            }
        });
    } catch (error) {}
}

function renderAdminGroups() {
    try {
        const adminList = safeGetElement('#adminList');
        if (!adminList) return;
        
        adminList.innerHTML = '';

        // FIX (all-groups-empty-real-data): prefer live GroupCore data over
        // the bare module variable — see renderAllGroups() above for why.
        const GC_admin = (typeof window !== 'undefined' && window.GroupCore) ? window.GroupCore : null;
        const liveAdminGroups = (GC_admin && Array.isArray(GC_admin.adminGroups)) ? GC_admin.adminGroups : adminGroups;

        if (liveAdminGroups.length === 0) {
            adminList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-crown"></i>
                    <p>No admin groups</p>
                    <p class="subtext">You'll see groups you administer here</p>
                </div>
            `;
            return;
        }
        
        liveAdminGroups.forEach(group => {
            if (matchesFilters(group)) {
                addGroupItem(group, adminList, 'admin');
            }
        });
    } catch (error) {}
}

function addGroupItem(groupData, container, type) {
    try {
        if (!groupData || !container) return;
        
        const safeGroupData = JSON.parse(JSON.stringify(groupData));
        
        const existingItem = container.querySelector(`[data-group-id="${safeGroupData.id}"]`);
        if (existingItem) {
            existingItem.remove();
        }
        
        if (!matchesFilters(safeGroupData)) {
            return;
        }
        
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item';
        groupItem.dataset.groupId = safeGroupData.id;
        groupItem.dataset.type = type;
        
        const initials = safeGroupData.name 
            ? safeGroupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
            : 'G';
        
        const groupType = safeGroupData.type || 'private';
        const typeInfo = groupTypes[groupType];
        const theme = safeGroupData.theme || 'blue';
        const themeInfo = groupThemes[theme];
        
        const purpose = safeGroupData.purpose || '';
        const mood = safeGroupData.mood || '';
        const postingRule = safeGroupData.postingRule || 'everyone';
        const purposeInfo = purpose ? groupPurposes[purpose] : null;
        const moodInfo = mood ? groupMoods[mood] : null;
        const ruleInfo = postingRules[postingRule];
        const pulse = calculateGroupPulse(safeGroupData);
        
        const unreadCount = GroupCore.getGroupUnreadCount(safeGroupData.id) || 0;
        
        groupItem.innerHTML = `
            <div class="group-avatar" ${safeGroupData.photoURL ? `style="background-image: url('${safeGroupData.photoURL}'); background: ${themeInfo.gradient};"` : `style="background: ${themeInfo.gradient};"`}>
                ${safeGroupData.photoURL ? '' : `<span>${initials}</span>`}
                <div class="group-theme-badge ${theme}"></div>
                <div class="group-type-badge ${groupType}" title="${typeInfo ? typeInfo.name : 'Private'}">
                    <i class="${typeInfo ? typeInfo.icon : 'fas fa-lock'}"></i>
                </div>
                ${purposeInfo ? `<div class="group-purpose-badge" style="position: absolute; bottom: -5px; right: -5px; background: ${purposeInfo.color}; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px;">${purposeInfo.icon}</div>` : ''}
                ${unreadCount > 0 ? `<span class="group-unread-badge">${unreadCount}</span>` : ''}
            </div>
            <div class="group-info">
                <div class="group-name">
                    <span class="group-name-text">${safeGroupData.name || 'Unnamed Group'}</span>
                    ${pulse ? `<span class="group-pulse ${pulse.class}"><i class="fas fa-heartbeat"></i> ${pulse.text}</span>` : ''}
                    <span class="group-details">
                        ${safeGroupData.isAdmin ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : ''}
                        ${safeGroupData.isCreator ? '<span class="role-badge admin"><i class="fas fa-star"></i> Creator</span>' : ''}
                    </span>
                </div>
                <div class="group-details">
                    ${purposeInfo ? `<span class="group-purpose-tag">${purposeInfo.icon} ${purposeInfo.name}</span>` : ''}
                    ${moodInfo ? `<span class="group-mood-indicator mood-${mood}" style="background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
                    ${safeGroupData.topic ? `<span class="group-topic">${safeGroupData.topic}</span>` : ''}
                    <span class="member-count"><i class="fas fa-users"></i> ${safeGroupData.memberCount || 0}</span>
                    <span>${typeInfo ? typeInfo.name : 'Private'}</span>
                    ${safeGroupData.theme ? `<span class="theme-badge ${safeGroupData.theme}"><i class="fas fa-palette"></i> ${groupThemes[safeGroupData.theme].name}</span>` : ''}
                </div>
                ${ruleInfo ? `<div style="font-size: 11px; color: ${ruleInfo.color}; margin-top: 3px;"><i class="fas fa-comment"></i> ${ruleInfo.name}</div>` : ''}
                ${safeGroupData.description ? `<div style="font-size: 13px; color: var(--text-secondary); margin-top: 5px;">${safeGroupData.description.substring(0, 100)}${safeGroupData.description.length > 100 ? '...' : ''}</div>` : ''}
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
                showGroupDetails(safeGroupData, type);
            }
        });
        
        const actionButtons = groupItem.querySelectorAll('.group-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleGroupAction(action, safeGroupData, type, btn);
            });
        });
        
        container.appendChild(groupItem);
    } catch (error) {}
}

function handleGroupAction(action, groupData, type, button) {
    try {
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
                acceptGroupInvite(groupData);
                break;
            case 'decline-invite':
                declineGroupInvite(groupData);
                break;
            default:
                break;
        }
    } catch (error) {}
}

// =============================================
// BACKGROUND SYNC FUNCTIONS (PRESERVED)
// =============================================
let _backgroundSyncRetryCount = 0;
const MAX_BACKGROUND_RETRY = 1;

function startBackgroundSync() {
    try {
        if (backgroundSyncRunning) {
            return;
        }
        
        if (!sessionReady && !sessionReceived) {
            return;
        }
        
        backgroundSyncRunning = true;
        
        // Sync immediately without setTimeout
        backgroundSyncWithServer();
        
        syncIntervalId = setInterval(() => {
            try {
                if (sessionReady || sessionReceived) {
                    backgroundSyncWithServer();
                } else {
                    clearInterval(syncIntervalId);
                    syncIntervalId = null;
                    backgroundSyncRunning = false;
                }
            } catch (error) {}
        }, 30000);
        
        if (typeof processPendingOfflineActions === 'function') {
            processPendingOfflineActions();
        }
    } catch (error) {}
}

async function backgroundSyncWithServer() {
    if (!sessionReady && !sessionReceived) {
        return;
    }
    
    if (++_backgroundSyncRetryCount > MAX_BACKGROUND_RETRY) {
        return;
    }
    
    try {
        await syncGroupsFromServer();
        await syncGroupInvitesFromServer();
        await syncUniqueFeaturesData();
        
        SafeStorage.setItem('lastSync', Date.now().toString());
        _backgroundSyncRetryCount = 0;
    } catch (error) {}
}


// =============================================
// DOM CONTENT LOADED
// =============================================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            initializeModule();
        } catch (error) {
            console.error(`[${MODULE_NAME}] Initialization error:`, error);
        }
    });
}

// =============================================
// UI SETUP FUNCTIONS (PRESERVED)
// =============================================
let _uiBound = false;

function setupUIEventListeners() {
    try {
        if (_uiBound) return;
        _uiBound = true;
        
        const searchInput = safeGetElement('#groupSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchGroups(e.target.value);
            });
        }
        
        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterGroupsByType(e.target.dataset.type || btn.dataset.type);
            });
        });
        
        const createGroupBtn = safeGetElement('#createGroupBtn');
        if (createGroupBtn) {
            createGroupBtn.addEventListener('click', () => {
                if (!sessionReceived) {
                    requestSession();
                    return;
                }
                const createGroupModal = safeGetElement('#createGroupModal');
                if (createGroupModal) createGroupModal.classList.add('active');
            });
        }
        
        document.querySelectorAll('.category-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.category-btn').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.groups-section').forEach(s => s.classList.remove('active'));
                
                tab.classList.add('active');
                const sectionId = tab.id.replace('Tab', 'Section');
                const section = safeGetElement('#' + sectionId);
                if (section) {
                    section.classList.add('active');
                    updateCurrentSection();
                }
            });
        });
        
    } catch (error) {}
}

function setupResponsiveBehavior() {
    try {
        isMobile = window.innerWidth <= 768;
        window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });
    } catch (error) {}
}

// =============================================
// MISSING FUNCTION EXPORTS (PRESERVED)
// =============================================
function showGroupOptions(groupData) {
    try {} catch (error) {}
}

function downloadQRCode() {
    try {
        const canvas = document.querySelector('#groupQRModal canvas');
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = 'group-invite-qr.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error('[QR] downloadQRCode error:', error);
    }
}

async function showGroupQRCode() {
    try {
        const group = currentChatGroup;
        if (!group) return;

        // Fetch the invite link QR data from backend
        const res = await secureApiCall(`/groups/${group.id}/invite-link/qr`).catch(() => null);
        const inviteUrl = res?.data?.inviteUrl || `${window.location.origin}/join?token=${group.inviteLink || group.id}`;

        // Build modal
        let modal = document.getElementById('groupQRModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'groupQRModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
        modal.innerHTML = `
          <div style="background:#fff;border-radius:20px;padding:24px;max-width:320px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="font-weight:700;font-size:18px;margin-bottom:4px">Invite to ${group.name||'Group'}</div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:16px">Scan QR code to join</div>
            <canvas id="groupQRCanvas" style="width:200px;height:200px;border-radius:12px"></canvas>
            <div style="margin-top:12px;padding:8px 12px;background:#f3f4f6;border-radius:8px;font-size:11px;color:#374151;word-break:break-all;cursor:pointer" onclick="navigator.clipboard.writeText('${inviteUrl}').then(()=>this.textContent='Copied!')">${inviteUrl}</div>
            <div style="display:flex;gap:8px;margin-top:16px">
              <button onclick="downloadQRCode()" style="flex:1;padding:10px;border:none;border-radius:10px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer">⬇ Save QR</button>
              <button onclick="document.getElementById('groupQRModal').remove()" style="flex:1;padding:10px;border:none;border-radius:10px;background:#f3f4f6;color:#374151;font-weight:600;cursor:pointer">Close</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        // Generate QR code using qrcode-generator (lightweight, no external dep at runtime)
        const canvas = document.getElementById('groupQRCanvas');
        if (canvas) {
            // Try qrcode lib if loaded, else use a simple fetch approach
            if (typeof QRCode !== 'undefined') {
                new QRCode(canvas, { text: inviteUrl, width: 200, height: 200, colorDark: '#111827', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
            } else {
                // Load qrcode.js from CDN dynamically
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
                script.onload = () => {
                    if (typeof QRCode !== 'undefined') {
                        new QRCode(canvas, { text: inviteUrl, width: 200, height: 200, colorDark: '#111827', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
                    }
                };
                document.head.appendChild(script);
                // Fallback: show invite URL as text
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#f3f4f6';
                    ctx.fillRect(0, 0, 200, 200);
                    ctx.fillStyle = '#374151';
                    ctx.font = '12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Loading QR...', 100, 100);
                }
            }
        }
    } catch (error) {
        console.error('[QR] showGroupQRCode error:', error);
    }
}

function addPollOption() {
    try {} catch (error) {}
}

function removePollOption() {
    try {} catch (error) {}
}

function saveNewPoll() {
    try {} catch (error) {}
}

function voteOnPoll() {
    try {} catch (error) {}
}

function saveNewEvent() {
    try {} catch (error) {}
}

function viewGroupNotes() {
    try {} catch (error) {}
}

function viewGroupEvents() {
    try {} catch (error) {}
}

function viewGroupAnalytics() {
    try {} catch (error) {}
}

function loadGroupAnalytics() {
    try {
        return { success: true, data: {} };
    } catch (error) {
        return { success: false };
    }
}

function renderAnalyticsChart() {
    try {} catch (error) {}
}

function changePurposeMood() {
    try {} catch (error) {}
}

function viewChangeHistory() {
    try {} catch (error) {}
}

function showOptionsModal() {
    try {} catch (error) {}
}

function shareGroup() {
    try {} catch (error) {}
}

function muteGroup() {
    try {} catch (error) {}
}

function favoriteGroup() {
    try {} catch (error) {}
}

function reportGroup() {
    try {} catch (error) {}
}

function blockGroup() {
    try {} catch (error) {}
}

function copyInviteLink() {
    try {
        const inviteLinkInput = safeGetElement('#inviteLinkInput');
        if (inviteLinkInput && inviteLinkInput.value) {
            navigator.clipboard.writeText(inviteLinkInput.value);
        }
    } catch (error) {}
}

function inviteMembers() {
    try {
        showFriendSelection();
    } catch (error) {}
}

function editGroupInfo() {
    try {} catch (error) {}
}

function manageRoles() {
    try {} catch (error) {}
}

function createEvent() {
    try {} catch (error) {}
}

function createPoll() {
    try {} catch (error) {}
}

function showGroupInviteDetails() {
    try {} catch (error) {}
}

// =============================================
// MAIN INITIALIZATION FUNCTIONS
// =============================================

/**
 * Initialize the groups page
 */
export async function initGroupPage() {
    debugLog('Initializing groups page');
    
    try {
        // Load cached data first (safe to do before ACTIVE)
        loadCachedDataInstantly();
        loadUniqueFeaturesData();
        
        // Initialize token system if not already
        if (!authReady) {
            initializeTokenSystem();
        }
        
        return { success: true };
    } catch (error) {
        debugLog('Error initializing groups page:', error);
        return { success: false, error };
    }
}

/**
 * Load user data in background
 */
export async function loadUserDataInBackground() {
    try {
        if (!sessionReceived) return;
        
        // CRITICAL FIX: Use session data we already have from PARENT_READY
        // instead of calling /auth/me which causes timeout errors
        if (session && session.user && session.user.id) {
            GroupCore.currentUser = session.user;
            GroupCore.userData = {
                displayName: session.user.displayName || session.user.username || session.user.name || 'User',
                username: session.user.username || null,
                email: session.user.email || null,
                photoURL: session.user.avatar || session.user.photoURL || null
            };
            if (LifecycleState.isActive()) updateUserUI();
            authReady = true;
            __SESSION_READY__ = true;
            return;
        }
        
        // Fallback: try from localStorage session cache
        try {
            const cached = JSON.parse(localStorage.getItem('kynecta_user_cache_v8') || '{}');
            if (cached && (cached.id || cached.userId)) {
                session.user = cached;
                GroupCore.currentUser = cached;
                GroupCore.userData = {
                    displayName: cached.displayName || cached.username || 'User',
                    username: cached.username || null,
                    email: cached.email || null,
                    photoURL: cached.avatar || null
                };
                if (LifecycleState.isActive()) updateUserUI();
                authReady = true;
                __SESSION_READY__ = true;
                return;
            }
        } catch(_) {}
        
        // Last resort: call /auth/me with a short timeout to avoid hanging
        try {
            const response = await secureApiCall('/auth/me', { silent: true, timeout: 8000 });
            if (response && response.success && response.data) {
                session.user = response.data;
                GroupCore.currentUser = response.data;
                GroupCore.userData = {
                    displayName: response.data.displayName || response.data.username || 'User',
                    username: response.data.username || null,
                    email: response.data.email || null,
                    photoURL: response.data.avatar || response.data.photoURL || null
                };
                if (LifecycleState.isActive()) updateUserUI();
                authReady = true;
                __SESSION_READY__ = true;
            }
        } catch(e) {
            debugLog('loadUserDataInBackground /auth/me failed (non-fatal):', e.message);
        }
    } catch (error) {
        debugLog('Error loading user data:', error);
    }
}

/**
 * Update user UI elements
 */
export function updateUserUI() {
    try {
        if (!LifecycleState.isActive()) return;
        
        const userElements = document.querySelectorAll('.user-info, .user-avatar');
        userElements.forEach(el => {
            if (GroupCore.userData && GroupCore.userData.displayName) {
                el.textContent = GroupCore.userData.displayName;
            }
        });
    } catch (error) {
        debugLog('Error updating user UI:', error);
    }
}

// =============================================
// HELPER FUNCTIONS
// =============================================
function isGroupOperationReady() {
    return LifecycleState.isActive() && parentReady && sessionReady;
}

// =============================================
// WINDOW EXPOSURES (PRESERVED)
// =============================================
if (typeof window !== 'undefined') {
    const secureExpose = (name, fn) => {
        Object.defineProperty(window, name, {
            value: fn,
            writable: false,
            configurable: false,
            enumerable: true
        });
    };
    
    secureExpose('reactToMessage', reactToMessage);
    secureExpose('replyToMessage', replyToMessage);
    secureExpose('deleteMessage', deleteMessage);
    secureExpose('sendGroupMessage', sendGroupMessage);
    secureExpose('adjustTextareaHeight', adjustTextareaHeight);
    secureExpose('updateGroupPrimaryActionState', updateGroupPrimaryActionState);
    secureExpose('updateGroupCounts', updateGroupCounts);
    secureExpose('addMessageToChat', addMessageToChat);
    secureExpose('removeSelectedFriend', removeSelectedFriend);
    secureExpose('showGroupDetails', showGroupDetails);
    window.openGroupChat = openGroupChat; // writable so patches can intercept
    secureExpose('acceptGroupInvite', acceptGroupInvite);
    secureExpose('declineGroupInvite', declineGroupInvite);
    secureExpose('leaveGroupConfirm', leaveGroupConfirm);
    secureExpose('copyInviteLink', copyInviteLink);
    secureExpose('shareGroup', shareGroup);
    secureExpose('muteGroup', muteGroup);
    secureExpose('favoriteGroup', favoriteGroup);
    secureExpose('reportGroup', reportGroup);
    secureExpose('blockGroup', blockGroup);
    secureExpose('showGroupQRCode', showGroupQRCode);
    secureExpose('downloadQRCode', downloadQRCode);
    secureExpose('editGroupInfo', editGroupInfo);
    secureExpose('manageRoles', manageRoles);
    secureExpose('createEvent', createEvent);
    secureExpose('saveNewEvent', saveNewEvent);
    secureExpose('createPoll', createPoll);
    secureExpose('saveNewPoll', saveNewPoll);
    secureExpose('addPollOption', addPollOption);
    secureExpose('removePollOption', removePollOption);
    secureExpose('voteOnPoll', voteOnPoll);
    
    secureExpose('getAPIStats', () => API_WRAPPER.getStats());
    secureExpose('clearAPICache', () => API_WRAPPER.clearCache());
    secureExpose('getIframeDebug', () => false);
    secureExpose('getIframeState', () => ({
        lifecycle: LifecycleState.getState(),
        session: sessionReceived,
        sessionReady,
        registered: LifecycleState.isRegistered(),
        active: LifecycleState.isActive(),
        parentReady
    }));
}

// =============================================
// INVITATION WRAPPER FUNCTIONS
// export{} blocks cannot contain expressions — these plain functions
// delegate to GroupCore and can be listed as normal named exports.
// =============================================
async function inviteToGroup(groupId, inviteeId, role, msg) {
    return GroupCore.inviteToGroup(groupId, inviteeId, role, msg);
}
async function cancelInvitation(invitationId) {
    return GroupCore.cancelInvitation(invitationId);
}
async function getGroupInvitations(groupId) {
    return GroupCore.getGroupInvitations(groupId);
}


// Full per-key settings applier for group module
// ── TOP-LEVEL: accessible from all closures ──────────────────────────────────
function applySettingToGroupModule(section, key, value) {
    if (section === 'appearance') {
        if (key === 'theme') {
            var theme = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
            if (typeof updateGroupThemeOnSettingChange === 'function') updateGroupThemeOnSettingChange(theme);
        }
        if (key === 'fontSize') document.documentElement.style.fontSize = value + 'px';
        if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
        if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
        if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
        if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
    }
    if (section === 'notifications') {
        if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
        if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;
        if (key === 'groupNotifications' || key === 'enableNotifications') window.__groupNotificationsEnabled = value;
        if (key === 'messageNotifications') window.__messageNotificationsEnabled = value;
        if (key === 'callNotifications') window.__callNotificationsEnabled = value;
        if (key === 'mentionNotifications') window.__mentionNotificationsEnabled = value;
        if (key === 'desktopEnabled') window.__desktopNotificationsEnabled = value;
    }
    if (section === 'privacy') {
        if (key === 'readReceipts')     { window.__SHOW_READ_RECEIPTS = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
        if (key === 'typingIndicators') { window.__SHOW_TYPING_INDICATORS = value; document.documentElement.setAttribute('data-typing-indicators', value ? 'true' : 'false'); }
        if (key === 'onlineStatus')     window.__showOnlineStatus = value;
        if (key === 'lastSeen')         window.__showLastSeen = value;
        if (key === 'whoCanAddMe')      window.__whoCanAddMe = value;
        if (key === 'canMessageMe')     window.__canMessageMe = value;
        if (key === 'contactDiscovery') window.__contactDiscovery = value;
    }
    if (section === 'groups') {
        if (key === 'showReadReceipts' || key === 'groupReadReceipts') window.__SHOW_READ_RECEIPTS = value;
        if (key === 'typingIndicators')  window.__SHOW_TYPING_INDICATORS = value;
        if (key === 'messageSound' || key === 'groupMessageSound') window.__GROUP_MESSAGE_SOUND = value;
        if (key === 'groupInvitations') window.__groupInvitations = value;
        if (key === 'groupAnnouncements') window.__groupAnnouncements = value;
        if (key === 'allowGroupCreation') window.__allowGroupCreation = value;
        if (key === 'maxGroupSize') window.__maxGroupSize = value;
        if (key === 'groupAdminPermissions') window.__groupAdminPermissions = value;
        if (key === 'whoCanAddToGroups') window.__whoCanAddToGroups = value;
        if (key === 'allowInviteLinks') window.__allowInviteLinks = value;
        if (key === 'mentionsOnly') window.__groupMentionsOnly = value;
        if (key === 'groupMessagePreview') window.__groupMessagePreview = value;
    }
    if (section === 'chat') {
        if (key === 'enterToSend' || key === 'enterKeySends') window.__enterToSend = value;
        if (key === 'showTimestamps') { window.__showTimestamps = value; document.documentElement.setAttribute('data-show-timestamps', value ? 'true' : 'false'); }
        if (key === 'allowReactions') { window.__allowReactions = value; document.documentElement.setAttribute('data-allow-reactions', value ? 'true' : 'false'); }
        if (key === 'mediaAutoDownload' || key === 'autoDownloadMedia') window.__mediaAutoDownload = value;
        if (key === 'messagePreviews') window.__messagePreviews = value;
    }
    if (section === 'profile') {
        if (key === 'displayName') window.__currentUserDisplayName = value;
        if (key === 'photoUrl') window.__currentUserAvatar = value;
        if (key === 'lastSeen') window.__showLastSeen = value;
        if (key === 'profileVisibility') window.__profileVisibility = value;
        if (key === 'currentMood') window.__currentMood = value;
    }
    if (section === 'security') {
        // FIX (Security settings audit): this module runs inside an
        // iframe and has no access to the auth session or logout — writing
        // __sessionTimeout here did nothing because nothing (in this frame
        // or any other) ever read it. The actual inactivity timeout is now
        // enforced by SESSION_COORDINATOR in the parent frame's
        // app.core.session.js, which reads the saved value straight from
        // localStorage('knecta_settings_cache').security.sessionTimeout.
        if (key === 'sessionTimeout') window.__sessionTimeout = value; // kept for any legacy readers; not the enforcement path
    }
    if (section === 'mood') {
        if (key === 'currentMood') { window.__currentMood = value; document.documentElement.setAttribute('data-mood', value); }
        if (key === 'autoMoodDetection') window.__autoMoodDetection = value;
        if (key === 'shareMoodStatus') window.__shareMoodStatus = value;
        if (key === 'showMoodTo') window.__showMoodTo = value;
    }
    if (section === 'status') {
        if (key === 'whoCanViewMyStatus') window.__whoCanViewMyStatus = value;
        if (key === 'autoExpireStatus') window.__autoExpireStatus = value;
        if (key === 'allowStatusReplies') window.__allowStatusReplies = value;
        if (key === 'showStatusTo') window.__showStatusTo = value;
    }
    if (section === 'advanced') {
        if (key === 'developerMode' || key === 'developerTools') window.__developerMode = value;
        if (key === 'debugLogging' || key === 'debugMode') window.__debugLogging = value;
        if (key === 'performanceMode') { window.__performanceMode = value; document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false'); }
        if (key === 'dataSaver') window.__dataSaver = value;
        if (key === 'offlineMode') window.__offlineMode = value;
        if (key === 'reduceMotion') { document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); document.body.classList.toggle('reduce-motion', !!value); }
        if (key === 'experimentalFeatures') window.__experimentalFeatures = value;
    }
    if (section === 'storage') {
        if (key === 'autoClearCache') window.__autoClearCache = value;
    }
}
// ===
// ===========================================
// COMPREHENSIVE EXPORTS - ALL REQUIRED EXPORTS
// =============================================
export {
    // Core modules
    LifecycleState,
    ParentMessaging,
    MessageRouter,
    SafeStorage,
    GroupCore,
    
    // State variables
    currentUser,
    userData,
    groups,
    myGroups,
    joinedGroups,
    groupInvites,
    adminGroups,
    selectedGroup,
    currentTypeFilter,
    currentSearchTerm,
    isLoadedFromLocalStorage,
    isMobile,
    pendingGroupActions,
    offlineOverlayDismissed,
    friends,
    selectedFriends,
    groupMessages,
    groupUnreadCounts,
    groupTypingUsers,
    currentChatGroup,

    // Feature variables
    groupPurposes,
    groupMoods,
    postingRules,
    participationModes,
    groupTopics,
    groupTypes,
    groupThemes,
    groupRoles,

    // Chat & Call variables
    chatMessagesList,
    isTyping,
    callInProgress,
    callStartTime,
    callTimer,
    localStream,
    peerConnections,

    // Unique features state
    currentParticipationMode,
    isSilentMode,
    isAnonymousMode,
    groupNotes,
    groupEvents,
    transparencyLog,
    energySuggestions,

    // LOCAL STORAGE KEYS
    LOCAL_STORAGE_KEYS,

    // Flags and state
    isPageInitialized,
    authReady,
    authCheckComplete,
    backgroundSyncRunning,
    syncIntervalId,
    apiInitialized,
    tokenReadyPromise,
    tokenReadyResolve,
    tokenReadyReject,
    tokenQueue,
    isProcessingTokenQueue,
    
    // Session state
    session,
    sessionReady,
    
    // ===== FUNCTIONS - MAKE SURE ALL ARE HERE =====
    
    // Token management
    getCurrentUser,
    getCurrentUserLocal,
    getUnifiedToken,
    saveUnifiedToken,
    initializeTokenSystem,
    waitForTokenReady,
    
    // API functions
    queueApiCall,
    processTokenQueue,
    secureApiCall,
    safeApiCall,
    
    // Core group functions
    loadCachedDataInstantly,
    loadUniqueFeaturesData,
    calculateGroupPulse,
    updateGroupCounts,
    updateCurrentSection,
    renderAllGroups,
    renderMyGroups,
    renderJoinedGroups,
    renderGroupInvites,
    renderAdminGroups,
    addGroupItem,
    handleGroupAction,
    
    // Background sync
    startBackgroundSync,
    backgroundSyncWithServer,
    
    // Chat and group management
    openGroupChat,
    updateChatHeaderUniqueFeatures,
    checkPostingRules,
    updateParticipationModeButtons,
    loadUniqueFeaturesPanels,
    loadGroupNotes,
    loadGroupEvents,
    loadTransparencyLog,
    generateInitialTransparencyLog,
    analyzeGroupEnergy,
    closeGroupChatMobile,
    hideAllPanels,
    loadGroupChatMessages,
    addMessageToChat,
    addSystemMessage,
    saveMessageToCache,
    sendGroupMessage,
    sendGroupMessageOnline,
    toggleSilentMode,
    toggleAnonymousMode,
    reactToMessage,
    replyToMessage,
    deleteMessage,
    setupTypingListener,
    stopTypingIndicator,
    adjustTextareaHeight,
    formatMessageTime,
    
    // Admin management
    openAdminManagement,
    loadGroupMembersForManagement,
    renderMembersList,
    handleMemberAction,
    logTransparencyAction,
    loadGroupSettingsForManagement,
    loadUniqueFeaturesForManagement,
    updatePostingRulesUI,
    saveGroupSettings,
    
    // Friend selection
    showFriendSelection,
    renderFriendSelection,
    updateSelectedFriendsList,
    removeSelectedFriend,

    // Invitation helpers (new)
    inviteToGroup,
    cancelInvitation,
    getGroupInvitations,
    
    // Group creation and joining
    createGroupOnline,
    joinGroupOnline,
    leaveGroupOnline,
    acceptGroupInvite,
    declineGroupInvite,
    leaveGroupConfirm,
    
    // Group details
    showGroupDetails,
    loadGroupDetails,
    showGroupOptions,
    viewGroupNotes,
    viewGroupEvents,
    viewGroupAnalytics,
    loadGroupAnalytics,
    renderAnalyticsChart,
    changePurposeMood,
    viewChangeHistory,
    showOptionsModal,
    shareGroup,
    muteGroup,
    favoriteGroup,
    reportGroup,
    blockGroup,
    showGroupQRCode,
    downloadQRCode,
    copyInviteLink,
    inviteMembers,
    editGroupInfo,
    manageRoles,
    createEvent,
    saveNewEvent,
    createPoll,
    addPollOption,
    removePollOption,
    saveNewPoll,
    voteOnPoll,
    showGroupInviteDetails,
    
    // Member management
    getUserRoleInGroup,
    isUserAdmin,
    canUserManageGroup,
    canUserAddMembers,
    canUserRemoveMembers,
    canUserChangeRole,
    canUserDeleteGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    changeMemberRole,
    deleteGroup,
    updateGroupInAllLists,
    addMemberOnline,
    removeMemberOnline,
    changeMemberRoleOnline,
    deleteGroupOnline,
    
    // Data sync
    syncGroupsFromServer,
    syncGroupInvitesFromServer,
    syncUniqueFeaturesData,
    matchesFilters,
    matchesSearch,
    filterGroupsByType,
    searchGroups,
    saveGroupsToLocalStorage,
    
    // Utility functions
    formatTimeAgo,
    formatDate,
    showNotification,
    processPendingOfflineActions,
    updateCreateGroupPostingRulesUI
};
window.GroupCore = GroupCore;

// P1 FIX: Install voice recorder on GroupCore so startRecording() works in group chat
try {
    if (window.KynectaVoiceRecorder) {
        window.KynectaVoiceRecorder.install(GroupCore);
    } else {
        // VoiceRecorder loads after this module — install when ready
        window.addEventListener('load', () => {
            if (window.KynectaVoiceRecorder && !GroupCore.startRecording) {
                window.KynectaVoiceRecorder.install(GroupCore);
            }
        });
    }
} catch (_) {}
// =============================================
// SETTINGS CACHE BOOTSTRAP - OFFLINE-FIRST
// =============================================
(function bootstrapSettingsFromCache() {
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (!cached) return;
        var parsed = JSON.parse(cached);
        var settings = (parsed && parsed.data) ? parsed.data : parsed;
        if (!settings || typeof settings !== 'object') return;
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > 86400000) return;
        Object.entries(settings).forEach(function(sectionEntry) {
            var section = sectionEntry[0], sectionVal = sectionEntry[1];
            if (!sectionVal || typeof sectionVal !== 'object') return;
            Object.entries(sectionVal).forEach(function(keyEntry) {
                try { applySettingToGroupModule(section, keyEntry[0], keyEntry[1]); } catch(e) {}
            });
        });
        // settings bootstrapped;
    } catch(e) {}
    window.addEventListener('online', function() {
        try {
            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'group', source: 'group', timestamp: Date.now() }, '*');
        } catch(e) {}
    });
})();
