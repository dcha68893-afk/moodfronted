/**
 * GROUP CORE — BRIDGE & PUBLIC API
 * Rendering, UI event wiring, background sync loop, modal/menu actions,
 * and the public initGroupPage()/loadUserDataInBackground()/updateUserUI()
 * entry points consumed by group-ui.js.
 *
 * This file is one of three cooperating modules that together replace the
 * former single group-core.js (9,361 lines). It is a real, independently
 * loadable ES module — not an arbitrary text slice — with explicit imports
 * and exports wiring it to the other two.
 *
 * Files: group-core-bootstrap.js -> group-core-operations.js -> group-core-bridge.js
 */

import {
    GroupCore,
    LifecycleState,
    MODULE_NAME,
    MessageRouter,
    ParentMessaging,
    SafeStorage,
    adminGroups,
    authCheckComplete,
    authReady,
    backgroundSyncRunning,
    currentChatGroup,
    currentUser,
    debugLog,
    groupInvites,
    groups,
    isMobile,
    joinedGroups,
    myGroups,
    parentReady,
    requestSession,
    selectedGroup,
    session,
    sessionReady,
    sessionReceived,
    setAuthReady,
    setBackgroundSyncRunning,
    setIsMobile,
    setSessionReadyFlag,
    setSyncIntervalId,
    syncIntervalId,
    userData
} from './group-core-bootstrap.js';
import {
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
} from './group-core-operations.js';

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
    setBackgroundSyncRunning(true);

    // Sync immediately without setTimeout
    backgroundSyncWithServer();
    setSyncIntervalId(setInterval(() => {
      try {
        if (sessionReady || sessionReceived) {
          backgroundSyncWithServer();
        } else {
          clearInterval(syncIntervalId);
          setSyncIntervalId(null);
          setBackgroundSyncRunning(false);
        }
      } catch (error) {}
    }, 30000));
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

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            initializeModule();
        } catch (error) {
            console.error(`[${MODULE_NAME}] Initialization error:`, error);
        }
    });
}

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
    setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', () => {
      setIsMobile(window.innerWidth <= 768);
    });
  } catch (error) {}
}

// =============================================
// MISSING FUNCTION EXPORTS (PRESERVED)
// =============================================

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
        if (window.__allowInviteLinks === false) {
            if (typeof showNotification === 'function') {
                showNotification('Invite links are turned off in your settings.', 'error');
            }
            return;
        }

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

// ============================================================================
// These used to be empty placeholder stubs kept only so the export list
// below wouldn't throw "undefined export" errors. None of them were ever
// called from any button or menu in the app. The real, working
// implementations of everything they were meant to do already exist
// elsewhere (the group chat menu in group.html, the GroupOS Tools panel,
// and openAdminManagement()) — these now delegate to those instead of
// silently doing nothing.
// ============================================================================
function _openGroupToolsTab(tabName) {
    try {
        if (!document.getElementById('groupOSOverlay') && typeof window._openGroupOSPanel === 'function') {
            window._openGroupOSPanel();
        }
        // GroupOS.mount() is async; give it a moment to attach before switching tabs.
        setTimeout(() => {
            if (window.GroupOS && typeof window.GroupOS.openTab === 'function') {
                window.GroupOS.openTab(tabName);
            }
        }, 400);
    } catch (error) {}
}

function showGroupOptions(groupData) {
    try {
        const btn = document.getElementById('chatMoreBtn');
        if (btn) btn.click();
    } catch (error) {}
}

function showOptionsModal() {
    showGroupOptions(currentChatGroup);
}

function addPollOption() {
    _openGroupToolsTab('polls'); // GroupOS's own poll-creation modal manages its option inputs internally
}

function removePollOption() {
    _openGroupToolsTab('polls');
}

function saveNewPoll() {
    _openGroupToolsTab('polls');
}

function createPoll() {
    try {
        _openGroupToolsTab('polls');
        setTimeout(() => { if (window.GroupOS && typeof window.GroupOS.createPoll === 'function') window.GroupOS.createPoll(); }, 500);
    } catch (error) {}
}

function voteOnPoll(pollId, optionId) {
    try {
        if (window.GroupOS && typeof window.GroupOS.vote === 'function') window.GroupOS.vote(pollId, optionId);
    } catch (error) {}
}

function saveNewEvent() {
    _openGroupToolsTab('events');
}

function createEvent() {
    try {
        _openGroupToolsTab('events');
        setTimeout(() => { if (window.GroupOS && typeof window.GroupOS.createEvent === 'function') window.GroupOS.createEvent(); }, 500);
    } catch (error) {}
}

function viewGroupNotes() {
    _openGroupToolsTab('notes');
}

function viewGroupEvents() {
    _openGroupToolsTab('events');
}

function viewGroupAnalytics() {
    _openGroupToolsTab('analytics');
}

function renderAnalyticsChart() {
    _openGroupToolsTab('analytics'); // GroupOS renders its own chart once mounted
}

function loadGroupAnalytics() {
    _openGroupToolsTab('analytics');
    return { success: true };
}

function changePurposeMood() {
    try {
        if (typeof window.openSub === 'function') { window.__gcCurGroup = currentChatGroup; window.openSub('purpose'); }
    } catch (error) {}
}

function viewChangeHistory() {
    try {
        if (typeof window.openSub === 'function') { window.__gcCurGroup = currentChatGroup; window.openSub('info'); }
    } catch (error) {}
}

function shareGroup() {
    try { if (typeof window.doShareGroup === 'function') window.doShareGroup(currentChatGroup); } catch (error) {}
}

function muteGroup() {
    try { if (typeof window.toggleMute === 'function') window.toggleMute(currentChatGroup); } catch (error) {}
}

function favoriteGroup() {
    try { if (typeof window.doToggleFavorite === 'function') window.doToggleFavorite(currentChatGroup); } catch (error) {}
}

function reportGroup() {
    try { if (typeof window.doReportGroup === 'function') window.doReportGroup(currentChatGroup); } catch (error) {}
}

function blockGroup() {
    try { if (typeof window.doToggleBlock === 'function') window.doToggleBlock(currentChatGroup); } catch (error) {}
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
    try {
        if (typeof openAdminManagement === 'function') openAdminManagement(currentChatGroup);
    } catch (error) {}
}

function manageRoles() {
    try {
        if (typeof window.openSub === 'function') { window.__gcCurGroup = currentChatGroup; window.openSub('members'); }
    } catch (error) {}
}

function showGroupInviteDetails() {
    try { showGroupQRCode(); } catch (error) {}
}

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

        // mediaAutoDownload setting: when off, images render as a
        // tap-to-load placeholder (see buildGroupMessageBody); this
        // delegated listener is what actually loads them on tap.
        if (!window.__groupMediaTapListenerInstalled) {
            window.__groupMediaTapListenerInstalled = true;
            document.addEventListener('click', (event) => {
                const placeholder = event.target.closest?.('.group-media-tap-to-load');
                if (!placeholder) return;
                const url = placeholder.getAttribute('data-media-url');
                const alt = placeholder.getAttribute('data-media-alt') || 'Attachment';
                if (!url) return;
                const img = document.createElement('img');
                img.src = url;
                img.alt = alt;
                img.style.cssText = 'max-width: 240px; width: 100%; border-radius: 14px; display: block;';
                placeholder.replaceWith(img);
            });
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
      setAuthReady(true);
      setSessionReadyFlag(true);
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
        setAuthReady(true);
        setSessionReadyFlag(true);
        return;
      }
    } catch (_) {}

    // Last resort: call /auth/me with a short timeout to avoid hanging
    try {
      const response = await secureApiCall('/auth/me', {
        silent: true,
        timeout: 8000
      });
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
        setAuthReady(true);
        setSessionReadyFlag(true);
      }
    } catch (e) {
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

function isGroupOperationReady() {
    return LifecycleState.isActive() && parentReady && sessionReady;
}

// FIX (group-core split): group-core-bootstrap.js, group-core-operations.js and
// group-core-bridge.js import from one another in a genuine 3-way ES module
// cycle (bootstrap -> operations -> bridge -> bootstrap/operations). Reading a
// cross-module binding (e.g. sendGroupMessage from operations.js) synchronously
// at a module's top level, during the module graph's initial evaluation, can
// hit that binding before the module that defines it has reached its own
// initializer — a TDZ ReferenceError ("Cannot access '...' before
// initialization"). That aborts this module's evaluation partway through,
// which is also why later, unrelated code (like the DOMContentLoaded handler
// below referencing MODULE_NAME) can fail too.
// Deferring this block to a microtask lets the whole synchronous module graph
// (all three files) finish evaluating first, by which point every cross-module
// binding is initialized, before we touch any of them.
queueMicrotask(() => {
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
}); // end queueMicrotask — see FIX note above

async function inviteToGroup(groupId, inviteeId, role, msg) {
    return GroupCore.inviteToGroup(groupId, inviteeId, role, msg);
}

async function cancelInvitation(invitationId) {
    return GroupCore.cancelInvitation(invitationId);
}

async function getGroupInvitations(groupId) {
    return GroupCore.getGroupInvitations(groupId);
}

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

// FIX (group-core split): same cross-module TDZ risk as the secureExpose
// block above — GroupCore is imported from group-core-bootstrap.js, and this
// is the exact assignment group-core-patch.js polls window.GroupCore for
// (its "[patch] GroupCore never appeared" after 40 retries). Deferred to a
// microtask for the same reason: run after the whole circular module graph
// has finished its initial synchronous evaluation.
queueMicrotask(() => {
    window.GroupCore = GroupCore;

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
});

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

export {
    addGroupItem,
    addPollOption,
    applySettingToGroupModule,
    backgroundSyncWithServer,
    blockGroup,
    changePurposeMood,
    copyInviteLink,
    createEvent,
    createPoll,
    downloadQRCode,
    editGroupInfo,
    favoriteGroup,
    handleGroupAction,
    inviteMembers,
    isGroupOperationReady,
    loadGroupAnalytics,
    manageRoles,
    muteGroup,
    removePollOption,
    renderAllGroups,
    renderAnalyticsChart,
    reportGroup,
    saveNewEvent,
    saveNewPoll,
    setupResponsiveBehavior,
    setupUIEventListeners,
    shareGroup,
    showGroupInviteDetails,
    showGroupOptions,
    showGroupQRCode,
    showOptionsModal,
    startBackgroundSync,
    updateCurrentSection,
    viewChangeHistory,
    viewGroupAnalytics,
    viewGroupEvents,
    viewGroupNotes,
    voteOnPoll
};