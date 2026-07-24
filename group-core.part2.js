/**
 * PART 2/3 — API & OPERATIONS
 * API gateway, data loading, core operations
 */
catch(() => {});
                }

                this.groupMessages[groupId] = messages;
                
                try {
                    SafeStorage.setItem(`group_messages_${groupId}`, messages);
                } catch (e) {}
                
                this.emit('group:messages-loaded', { groupId, messages });
                debugLog(`Loaded ${messages.length} messages`);
                return { success: true, data: messages };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to load messages:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get group messages
    getGroupMessages(groupId) {
        return this.groupMessages[groupId] || [];
    },
    
    // Save group messages
    saveGroupMessages(groupId, messages) {
        const existing = this.groupMessages[groupId] || [];
        const merged = [];
        const seen = new Map();
        
        [...existing, ...(Array.isArray(messages) ? messages : [])].forEach(message => {
            if (!message) return;
            const key = String(message.id || message.localId || message.clientRequestId || `msg_${merged.length}`);
            const normalized = {
                ...message,
                groupId: message.groupId || groupId,
                createdAt: message.createdAt || message.timestamp || message.sentAt || new Date().toISOString(),
                timestamp: message.timestamp || message.createdAt || message.sentAt || new Date().toISOString()
            };
            
            if (seen.has(key)) {
                merged[seen.get(key)] = { ...merged[seen.get(key)], ...normalized };
                return;
            }
            
            seen.set(key, merged.length);
            merged.push(normalized);
        });
        
        merged.sort((a, b) => {
            const aTime = new Date(a.createdAt || a.timestamp || 0).getTime();
            const bTime = new Date(b.createdAt || b.timestamp || 0).getTime();
            if (aTime !== bTime) return aTime - bTime;
            return Number(a.id || 0) - Number(b.id || 0);
        });
        
        this.groupMessages[groupId] = merged.slice(-100);
        
        try {
            SafeStorage.setItem(`group_messages_${groupId}`, this.groupMessages[groupId]);
        } catch (e) {}
    },
    
    // Add group message
    addGroupMessage(groupId, message) {
        if (!groupId || !message) return;

        // PHASE10: Check deletion registry — never resurrect deleted messages
        const _delReg = window.__PHASE10_DeletionRegistry;
        if (_delReg && message.id && _delReg.isDeleted('message', String(message.id))) return;

        const messages = this.groupMessages[groupId] || [];

        // PHASE10: Robust dedup — check id AND localId to prevent duplicates on echo
        const msgId      = String(message.id     || '');
        const msgLocalId = String(message.localId || '');
        const isDup = messages.some(m => {
            const mId = String(m.id || '');
            const mLid = String(m.localId || '');
            return (msgId && (mId === msgId || mLid === msgId)) ||
                   (msgLocalId && (mId === msgLocalId || mLid === msgLocalId));
        });
        if (isDup) {
            // If we have a server id now but had only localId, patch in-place
            const existing = messages.find(m =>
                msgLocalId && (String(m.id) === msgLocalId || String(m.localId) === msgLocalId)
            );
            if (existing && msgId && msgId !== msgLocalId) {
                Object.assign(existing, { ...message, id: msgId });
                try { SafeStorage.setItem(`group_messages_${groupId}`, messages); } catch(e) {}
                this.emit('group:message-received', { groupId, message: existing });
            }
            return;
        }

        messages.push(message);

        if (messages.length > 200) {
            messages.splice(0, messages.length - 200);
        }

        this.groupMessages[groupId] = messages;

        try {
            SafeStorage.setItem(`group_messages_${groupId}`, messages);
        } catch (e) {}

        this.incrementGroupUnreadCount(groupId);

        this.emit('group:message-received', { groupId, message });
    },
    
    // Get group unread count
    getGroupUnreadCount(groupId) {
        return this.groupUnreadCounts[groupId] || 0;
    },
    
    // Increment group unread count
    incrementGroupUnreadCount(groupId) {
        if (!groupId) return;
        
        if (currentChatGroup && currentChatGroup.id === groupId) {
            return;
        }
        
        const count = (this.groupUnreadCounts[groupId] || 0) + 1;
        this.groupUnreadCounts[groupId] = count;
        
        try {
            SafeStorage.setItem(`group_unread_${groupId}`, count);
        } catch (e) {}
        
        this.emit('group:unread-count-updated', { groupId, count });
    },
    
    // Reset group unread count
    resetGroupUnreadCount(groupId) {
        if (!groupId) return;
        
        this.groupUnreadCounts[groupId] = 0;
        
        try {
            SafeStorage.setItem(`group_unread_${groupId}`, 0);
        } catch (e) {}
        
        this.emit('group:unread-count-updated', { groupId, count: 0 });
    },
    
    // Mark message as seen
    markMessageAsSeen(groupId, messageId, userId) {
        if (!groupId || !messageId || !userId) return;
        
        const messages = this.groupMessages[groupId];
        if (!messages) return;
        
        const message = messages.find(m => m.id === messageId);
        if (!message) return;
        
        if (!message.seenBy) {
            message.seenBy = [];
        }
        
        if (!message.seenBy.includes(userId)) {
            message.seenBy.push(userId);
        }
        
        this.saveGroupMessages(groupId, messages);
    },
    
    // Handle typing indicator
    handleTyping(groupId, userId, isTyping) {
        if (!groupId || !userId) return;
        
        if (!this.groupTypingUsers[groupId]) {
            this.groupTypingUsers[groupId] = {};
        }
        
        if (isTyping) {
            this.groupTypingUsers[groupId][userId] = Date.now();
        } else {
            delete this.groupTypingUsers[groupId][userId];
        }
        
        this.emit('group:typing', { groupId, userId, isTyping });
    },
    
    // Get current user (from session memory)
    getCurrentUser() {
        return session.user || this.currentUser;
    },
    
    // Check if ready for group operations
    isReady() {
        return LifecycleState.isActive() && parentReady && sessionReady;
    }
};

// Initialize GroupCore
GroupCore.init();

// =============================================
// SINGLE MESSAGE LISTENER - ONE INSTANCE
// =============================================
// =============================================
// SINGLE MESSAGE LISTENER - ONE INSTANCE
// =============================================
if (typeof window !== 'undefined' && !window.__GROUPS_MESSAGE_LISTENER_SET__) {
    window.__GROUPS_MESSAGE_LISTENER_SET__ = true;
    
    // ✅ ENHANCED: Setup WebSocket event listeners for real-time member sync
    function setupGroupRealtimeListeners() {
        // Bind to WebSocket service if available
        if (window.wsService?.on) {
            ['group:member_added', 'group:member_removed', 'group:member_role_changed', 
             'group:member_joined', 'group:member_left'].forEach(eventName => {
                window.wsService.on(eventName, (payload) => {
                    handleGroupMemberEvent(eventName, payload);
                });
            });
        }
        
        // Bind to KynectaRealtime singleton if available
        // FIX: Use a module-level Set to prevent duplicate listener registration on reconnect
        if (!window.__groupCoreListenersRegistered) {
            window.__groupCoreListenersRegistered = new Set();
        }
        if (window.KynectaRealtime?.on) {
            ['group:member_added', 'group:member_removed', 'group:member_role_changed',
             'group:member_joined', 'group:member_left'].forEach(eventName => {
                if (window.__groupCoreListenersRegistered.has(eventName)) return;
                window.__groupCoreListenersRegistered.add(eventName);
                window.KynectaRealtime.on(eventName, (payload) => {
                    handleGroupMemberEvent(eventName, payload);
                });
            });
        }

        // FIX: Listen for kyn:group:message CustomEvents dispatched by app.realtime.socket.js
        // This ensures group messages arrive even if the postMessage relay is slow
        if (!window.__groupCoreListenersRegistered.has('kyn:group:message')) {
            window.__groupCoreListenersRegistered.add('kyn:group:message');
            window.addEventListener('kyn:group:message', function(evt) {
                try {
                    const msg = evt.detail;
                    if (!msg || !msg.groupId) return;
                    // Only handle if this group is currently open
                    const activeGid = window._activeGroupId || (GroupCore && GroupCore._state && GroupCore._state.activeGroupId);
                    if (String(msg.groupId) !== String(activeGid)) return;
                    if (GroupCore && typeof GroupCore.handleGroupMessage === 'function') {
                        GroupCore.handleGroupMessage(msg);
                    } else if (GroupCore && typeof GroupCore.addGroupMessage === 'function') {
                        GroupCore.addGroupMessage(msg.groupId, msg);
                    }
                } catch(_) {}
            });
        }
        
        // Bridge from DOM CustomEvents
        window.addEventListener('group:member_added', (evt) => {
            if (evt.detail) handleGroupMemberEvent('group:member_added', evt.detail);
        });
        
        window.addEventListener('group:member_removed', (evt) => {
            if (evt.detail) handleGroupMemberEvent('group:member_removed', evt.detail);
        });
        
        window.addEventListener('group:member_role_changed', (evt) => {
            if (evt.detail) handleGroupMemberEvent('group:member_role_changed', evt.detail);
        });

        // FIX: Listen for group:refresh_needed — server tells this user to sync
        const _handleRefreshNeeded = (payload) => {
            if (!LifecycleState.isActive() || !sessionReady) return;
            if (typeof syncGroupsFromServer === 'function') syncGroupsFromServer().catch(() => {});
            if (typeof syncGroupInvitesFromServer === 'function') syncGroupInvitesFromServer().catch(() => {});
        };
        if (window.wsService && window.wsService.on && !window.__groupCoreListenersRegistered.has('wsService:group:refresh_needed')) {
            window.__groupCoreListenersRegistered.add('wsService:group:refresh_needed');
            window.wsService.on('group:refresh_needed', _handleRefreshNeeded);
        }
        if (window.KynectaRealtime && window.KynectaRealtime.on && !window.__groupCoreListenersRegistered.has('rt:group:refresh_needed')) {
            window.__groupCoreListenersRegistered.add('rt:group:refresh_needed');
            window.KynectaRealtime.on('group:refresh_needed', _handleRefreshNeeded);
        }

        // FIX: Listen for GROUP_MEMBER_ADDED socket event
        const _handleMemberAddedSocket = (payload) => {
            if (!payload || !payload.groupId) return;
            const currentUserId = getCurrentUserLocal()?.id || getCurrentUserLocal()?.uid;
            if (String(payload.userId) === String(currentUserId) || String(payload.memberId) === String(currentUserId)) {
                if (LifecycleState.isActive() && sessionReady) {
                    setTimeout(() => {
                        if (typeof syncGroupsFromServer === 'function') syncGroupsFromServer().catch(() => {});
                    }, 300);
                }
            }
            MessageRouter.handleMemberAdded({ payload: {
                groupId: payload.groupId,
                member: payload.member || { userId: payload.userId || payload.memberId }
            }});
        };
        if (window.wsService && window.wsService.on) {
            ['GROUP_MEMBER_ADDED', 'group:member:joined'].forEach(ev => {
                if (!window.__groupCoreListenersRegistered.has('ws:' + ev)) {
                    window.__groupCoreListenersRegistered.add('ws:' + ev);
                    window.wsService.on(ev, _handleMemberAddedSocket);
                }
            });
        }
        if (window.KynectaRealtime && window.KynectaRealtime.on) {
            ['GROUP_MEMBER_ADDED', 'group:member:joined'].forEach(ev => {
                if (!window.__groupCoreListenersRegistered.has('rt:' + ev)) {
                    window.__groupCoreListenersRegistered.add('rt:' + ev);
                    window.KynectaRealtime.on(ev, _handleMemberAddedSocket);
                }
            });
        }

        // BUGFIX: window.__groupCoreRefreshInvitations was referenced below (twice) but
        // never defined anywhere in the codebase, so both "typeof === 'function'" checks
        // always failed and neither branch ever refreshed anything -- an invitation
        // arriving via the kyn: custom event or the parent postMessage relay never showed
        // up until the invites panel was manually closed and reopened.
        if (typeof window.__groupCoreRefreshInvitations !== 'function') {
            window.__groupCoreRefreshInvitations = function() {
                try { if (document.getElementById('inviteBody') && typeof window.loadReceivedInvites === 'function') window.loadReceivedInvites(); } catch (_) {}
                try { if (typeof window.renderGroupInvitesSecure === 'function') window.renderGroupInvitesSecure(); } catch (_) {}
            };
        }

        // PHASE14 FIX P1: Listen for group invitation received socket event
        // Backend emits 'group:invitation:received' but group-core had no listener.
        if (!window.__groupCoreListenersRegistered.has('p14:group:invitation:received')) {
            window.__groupCoreListenersRegistered.add('p14:group:invitation:received');
            window.addEventListener('kyn:group:invitation:received', function(evt) {
                const d = evt.detail || {};
                if (typeof window.__groupCoreRefreshInvitations === 'function') {
                    window.__groupCoreRefreshInvitations();
                }
                try { window.dispatchEvent(new CustomEvent('groupInvitationReceived', { detail: d })); } catch(_) {}
            });
            window.addEventListener('message', function(evt) {
                if (!evt.data || typeof evt.data !== 'object') return;
                if (evt.data.type === 'REALTIME_EVENT:group:invitation:received') {
                    const d = evt.data.payload || {};
                    if (typeof window.__groupCoreRefreshInvitations === 'function') {
                        window.__groupCoreRefreshInvitations();
                    }
                    try { window.dispatchEvent(new CustomEvent('groupInvitationReceived', { detail: d })); } catch(_) {}
                }
            });
        }

        // P1 FIX: Disappearing messages — clear UI when server fires expired event
        if (!window.__groupCoreListenersRegistered.has('p1:group:messages:disappeared')) {
            window.__groupCoreListenersRegistered.add('p1:group:messages:disappeared');
            window.addEventListener('kyn:group:messages:disappeared', function(evt) {
                const { groupId } = evt.detail || {};
                if (!groupId) return;
                const activeGid = window._activeGroupId;
                if (String(groupId) === String(activeGid)) {
                    // Reload messages to reflect deletions
                    if (typeof loadGroupChatMessages === 'function') {
                        loadGroupChatMessages(groupId).catch(() => {});
                    }
                }
            });
        }

        // P1 FIX: Pinned messages — refresh pinned banner in group header
        if (!window.__groupCoreListenersRegistered.has('p1:group:message:pinned')) {
            window.__groupCoreListenersRegistered.add('p1:group:message:pinned');
            window.addEventListener('kyn:group:message:pinned', function(evt) {
                const { groupId, messageId } = evt.detail || {};
                if (!groupId) return;
                // Update local group record
                const group = GroupCore.getGroupById(groupId);
                if (group) {
                    if (!Array.isArray(group.pinnedMessageIds)) group.pinnedMessageIds = [];
                    if (!group.pinnedMessageIds.includes(messageId)) group.pinnedMessageIds.push(messageId);
                    GroupCore.updateGroupInLists(group);
                }
                // Show banner toast
                try {
                    if (typeof showToast === 'function') showToast('📌 A message was pinned', 'info');
                } catch (_) {}
            });
            window.addEventListener('kyn:group:message:unpinned', function(evt) {
                const { groupId, messageId } = evt.detail || {};
                if (!groupId) return;
                const group = GroupCore.getGroupById(groupId);
                if (group && Array.isArray(group.pinnedMessageIds)) {
                    group.pinnedMessageIds = group.pinnedMessageIds.filter(id => id !== messageId);
                    GroupCore.updateGroupInLists(group);
                }
            });
        }

        // P2 FIX: Poll closed — update UI
        if (!window.__groupCoreListenersRegistered.has('p2:group:poll:closed')) {
            window.__groupCoreListenersRegistered.add('p2:group:poll:closed');
            window.addEventListener('kyn:group:poll:closed', function(evt) {
                const { groupId, pollId } = evt.detail || {};
                if (!groupId) return;
                try {
                    // Update any visible poll UI
                    const pollEl = document.querySelector(`[data-poll-id="${pollId}"]`);
                    if (pollEl) {
                        pollEl.classList.add('poll-closed');
                        const badge = pollEl.querySelector('.poll-status');
                        if (badge) badge.textContent = 'Closed';
                    }
                    if (typeof showToast === 'function') showToast('📊 A poll has closed', 'info');
                } catch (_) {}
            });
        }

        // P2 FIX: Settings updated — sync moderation engine
        if (!window.__groupCoreListenersRegistered.has('p2:group:settings:updated')) {
            window.__groupCoreListenersRegistered.add('p2:group:settings:updated');
            window.addEventListener('kyn:group:settings:updated', function(evt) {
                const { groupId, settings } = evt.detail || {};
                if (!groupId || !settings) return;
                const group = GroupCore.getGroupById(groupId);
                if (group) {
                    Object.assign(group, settings);
                    GroupCore.updateGroupInLists(group);
                    // Re-sync moderation engine
                    const modEng = window.__GroupModerationEngine;
                    if (modEng?.syncFromGroup) modEng.syncFromGroup(group);
                }
            });
        }

        // P2 FIX: Group verified — update verified badge in UI
        if (!window.__groupCoreListenersRegistered.has('p2:group:verified')) {
            window.__groupCoreListenersRegistered.add('p2:group:verified');
            window.addEventListener('kyn:group:verified', function(evt) {
                const { groupId } = evt.detail || {};
                if (!groupId) return;
                const group = GroupCore.getGroupById(groupId);
                if (group) {
                    group.isVerified = true;
                    GroupCore.updateGroupInLists(group);
                }
                if (String(groupId) === String(window._activeGroupId)) {
                    const badge = document.querySelector('.group-verified-badge');
                    if (badge) badge.style.display = 'inline-flex';
                }
            });
        }
    }
    
    // ✅ ENHANCED: Handle real-time group member events
    function handleGroupMemberEvent(eventName, data) {
        // member event received
        
        try {
            const { groupId, memberId, role, userId, member } = data || {};
            
            if (!groupId || !memberId) {
                console.warn('[GroupsCore] Invalid member event data:', data);
                return;
            }
            
            // Update local group data
            const groupIndex = groups.findIndex(g => g.id === groupId);
            if (groupIndex === -1) return;
            
            const group = groups[groupIndex];
            if (!group) return;
            
            switch (eventName) {
                case 'group:member_added':
                case 'group:member_joined':
                    if (member && !group.members.find(m => m.id === member.id)) {
                        group.members.push(member);
                    }
                    // member added
                    break;
                    
                case 'group:member_removed':
                case 'group:member_left': {
                    // CRITICAL FIX: Only remove from members list, NOT from myGroups
                    // unless the event explicitly says the current user left (leaveGroup action)
                    group.members = group.members.filter(m => m.id !== memberId);
                    // Check if this is the current user being removed by someone else
                    const _myId = session && (session.userId || (session.user && session.user.id));
                    if (_myId && String(memberId) === String(_myId) && !data._selfLeave) {
                        // Current user was removed by admin — update myGroups
                        if (typeof myGroups !== 'undefined') {
                            myGroups = myGroups.filter(g => g.id !== groupId);
                        }
                        if (GroupCore && GroupCore.myGroups) {
                            GroupCore.myGroups = GroupCore.myGroups.filter(g => g.id !== groupId);
                        }
                    }
                    break;
                }
                    
                case 'group:member_role_changed':
                    const memberToUpdate = group.members.find(m => m.id === memberId);
                    if (memberToUpdate && role) {
                        memberToUpdate.role = role;
                    }
                    // role changed
                    break;
            }
            
            // Emit events for UI updates
            window.dispatchEvent(new CustomEvent('group:updated', {
                detail: { group, eventName, member, groupId }
            }));
            
            // Emit to EventBus for cross-module sync
            if (window.EventBus?.emit) {
                window.EventBus.emit('group:member_updated', {
                    group, eventName, member, groupId
                });
            }
            
            // Update UI if this group is currently active
            if (currentChatGroup && currentChatGroup.id === groupId) {
                renderGroupMembers();
            }
            
        } catch (error) {
            console.error('[GroupsCore] Failed to handle member event:', error);
        }
    }
    
    // Initialize real-time listeners
    setupGroupRealtimeListeners();
    
    window.addEventListener('message', (event) => {
        try {
            const data = event.data;
            
            // ── OFFLINE-FIRST: Apply per-key setting changes immediately ──
            if (data && (data.type === 'SETTING_CHANGED' || data.type === 'SETTINGS_UPDATED')) {
                const payload = data.payload || data;

                if (data.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
                    const { section, key, value } = payload;
                    applySettingToGroupModule(section, key, value);
                    window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));
                    debugLog(`Setting changed: ${section}.${key} = ${value}`);
                }
                if (data.type === 'SETTINGS_UPDATED' && payload.settings) {
                    const s = payload.settings;
                    Object.entries(s).forEach(([sec, secVal]) => {
                        if (secVal && typeof secVal === 'object')
                            Object.entries(secVal).forEach(([k, v]) => applySettingToGroupModule(sec, k, v));
                    });
                    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));
                    debugLog('Settings updated:', s);
                }
                return;
            }
            
            // Normal message handling
            ParentMessaging.handleIncoming(event);
        } catch (error) {
            console.error(`[${MODULE_NAME}] Error handling message:`, error);
        }
    });
}


// Helper function to update group theme when settings change
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
    
    moduleInitialized = true;
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

// =============================================
// SAFE INPUT VALIDATION
// =============================================
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

// =============================================
// STATUS MACHINE - One Message Only Per State Change
// =============================================
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

// =============================================
// ACTION QUEUE MANAGEMENT
// =============================================
const groupActionQueue = [];
let isProcessingQueue = false;

function queueGroupAction(action) {
    groupActionQueue.push(action);
    
    if (!isProcessingQueue && LifecycleState.isActive() && sessionReady) {
        processGroupActionQueue();
    }
}

function processGroupActionQueue() {
    if (isProcessingQueue) return;
    if (groupActionQueue.length === 0) return;
    
    if (!LifecycleState.isActive() || !sessionReady) {
        return;
    }
    
    isProcessingQueue = true;
    
    const actions = [...groupActionQueue];
    groupActionQueue.length = 0;
    
    // Process synchronously without setTimeout
    actions.forEach(action => {
        try {
            if (typeof action === 'function') {
                action();
            } else if (action && action.type) {
                switch (action.type) {
                    case 'createGroup':
                        GroupCore.createGroup(action.data).catch(() => {});
                        break;
                    case 'updateGroup':
                        GroupCore.updateGroup(action.groupId, action.data).catch(() => {});
                        break;
                    case 'deleteGroup':
                        GroupCore.deleteGroup(action.groupId).catch(() => {});
                        break;
                    case 'addMember':
                        GroupCore.addMember(action.groupId, action.userId, action.role).catch(() => {});
                        break;
                    case 'removeMember':
                        GroupCore.removeMember(action.groupId, action.userId).catch(() => {});
                        break;
                    case 'leaveGroup':
                        GroupCore.leaveGroup(action.groupId).catch(() => {});
                        break;
                    case 'promoteToAdmin':
                        GroupCore.promoteToAdmin(action.groupId, action.userId).catch(() => {});
                        break;
                    case 'demoteFromAdmin':
                        GroupCore.demoteFromAdmin(action.groupId, action.userId).catch(() => {});
                        break;
                    case 'sendJoinRequest':
                        GroupCore.sendJoinRequest(action.groupId, action.message).catch(() => {});
                        break;
                    case 'approveJoinRequest':
                        GroupCore.approveJoinRequest(action.groupId, action.requestId, action.userId).catch(() => {});
                        break;
                    case 'rejectJoinRequest':
                        GroupCore.rejectJoinRequest(action.groupId, action.requestId, action.userId).catch(() => {});
                        break;
                    case 'sendMessage':
                        if (action.groupId && action.content) {
                            GroupCore.sendGroupMessage(action.groupId, action.content, action.topic, action.anonymous).catch(() => {});
                        } else if (action.fn && typeof action.fn === 'function') {
                            action.fn();
                        }
                        break;
                    case 'joinGroup':
                        if (action.groupId) {
                            GroupCore.sendJoinRequest(action.groupId, '').catch(() => {});
                        }
                        break;
                    case 'changeMemberRole':
                        if (action.groupId && action.userId && action.role === 'admin') {
                            GroupCore.promoteToAdmin(action.groupId, action.userId).catch(() => {});
                        } else if (action.groupId && action.userId) {
                            GroupCore.demoteFromAdmin(action.groupId, action.userId).catch(() => {});
                        }
                        break;
                }
            }
        } catch (e) {}
    });
    
    isProcessingQueue = false;
    
    if (groupActionQueue.length > 0) {
        processGroupActionQueue();
    }
}

// =============================================
// GLOBAL VARIABLES (PRESERVED FOR BACKWARD COMPATIBILITY)
// =============================================
// =============================================
// SAFE ARRAY / OBJECT HELPERS
// =============================================
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

let currentUser = null; // Will be updated from session
let userData = null;    // Will be updated from session
let groups = [];
let myGroups = [];
let joinedGroups = [];
let groupInvites = [];
let adminGroups = [];
let selectedGroup = null;
let currentTypeFilter = 'all';
let currentSearchTerm = '';
let isLoadedFromLocalStorage = false;
let isMobile = false;
let pendingGroupActions = [];
let offlineOverlayDismissed = false;
let friends = [];
let selectedFriends = [];

let groupMessages = {};
let groupUnreadCounts = {};
let groupTypingUsers = {};
let currentChatGroup = null;

// =============================================
// UNIQUE FEATURES VARIABLES (PRESERVED)
// =============================================
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

// =============================================
// CHAT & CALL VARIABLES (PRESERVED)
// =============================================
let chatMessagesList = [];
let isTyping = false;
let callInProgress = false;
let callStartTime = null;
let callTimer = null;
let localStream = null;
let peerConnections = {};

// =============================================
// UNIQUE FEATURES STATE (PRESERVED)
// =============================================
let currentParticipationMode = 'normal';
let isSilentMode = false;
let isAnonymousMode = false;
let groupNotes = {};
let groupEvents = {};
let transparencyLog = [];
let energySuggestions = [];

// =============================================
// LOCAL STORAGE KEYS (NON-AUTH ONLY)
// =============================================
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

// =============================================
// SECURE API WRAPPER - UPDATED TO USE apiRequest
// =============================================
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

// =============================================
// SECURE API CALL FUNCTION - UPDATED TO USE apiRequest
// =============================================
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

// =============================================
// TOKEN MANAGEMENT - UPDATED TO USE SESSION ONLY
// =============================================
let tokenQueue = [];
let isProcessingTokenQueue = false;
let tokenReadyPromise = null;
let tokenReadyResolve = null;
let tokenReadyReject = null;

let authReady = false;
let authCheckComplete = false;
let apiInitialized = false;

let isPageInitialized = false;
let syncIntervalId = null;
let backgroundSyncRunning = false;

let __PARENT_READY__ = false;
let __SESSION_READY__ = false;
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
            authCheckComplete = true;
        }
    } catch (error) {}
}

async function waitForTokenReady() {
    try {
        // Check session memory first
        if (session.token) {
            authReady = true;
            authCheckComplete = true;
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

// =============================================
// QUEUE API CALL SYSTEM - UPDATED TO USE SESSION
// =============================================
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

// =============================================
// GROUP MEMBER MANAGEMENT FUNCTIONS (PRESERVED)
// =============================================
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
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserDeleteGroup(group, currentUser?.uid || currentUser?.id)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    groups = groups.filter(g => g.id !== groupId);
    myGroups = myGroups.filter(g => g.id !== groupId);
    adminGroups = adminGroups.filter(g => g.id !== groupId);
    joinedGroups = joinedGroups.filter(g => g.id !== groupId);
    groupInvites = groupInvites.filter(invite => invite.groupId !== groupId && invite.id !== groupId);
    
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
            currentChatGroup = null;
        }
    }
    
    // Use safeSend for parent communication
    safeSend('GROUP_DELETED', {
        groupId,
        timestamp: Date.now()
    });
    
    return { success: true };
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

// =============================================
// ONLINE OPERATIONS (API) - UPDATED WITH SESSION CHECK
// =============================================
const addMemberOnline = async function(groupId, userId, role = 'member') {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'addMember', groupId, userId, role });
        return;
    }
    
    GroupCore.addMember(groupId, userId, role).catch(() => {});
};

const removeMemberOnline = async function(groupId, userId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'removeMember', groupId, userId });
        return;
    }
    
    GroupCore.removeMember(groupId, userId).catch(() => {});
};

const changeMemberRoleOnline = async function(groupId, userId, role) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'changeMemberRole', groupId, userId, role });
        return;
    }
    
    if (role === 'admin') {
        GroupCore.promoteToAdmin(groupId, userId).catch(() => {});
    } else {
        GroupCore.demoteFromAdmin(groupId, userId).catch(() => {});
    }
};

const deleteGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'deleteGroup', groupId });
        return;
    }
    
    GroupCore.deleteGroup(groupId).catch(() => {});
};

// =============================================
// CHAT AND GROUP MANAGEMENT FUNCTIONS (PRESERVED)
// =============================================
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
        return `
            <div class="group-message-media image">
                <img src="${escapeGroupChatAttribute(message.mediaUrl)}" alt="${safeFileName}" style="max-width: 240px; width: 100%; border-radius: 14px; display: block;" />
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
                    <div class="group-message-card" style="padding: 6px 10px 4px 10px; border-radius: 7.5px; background: ${isSent ? '#005c4b' : '#202c33'}; color: #e9edef; box-shadow: 0 1px 1px rgba(0,0,0,0.3); font-size: 14.2px; line-height: 1.45;">
                        ${replyMarkup}
                        ${buildGroupMessageBody(message)}
                        <div class="message-meta" style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; opacity: 0.8;">
                            <span class="message-time">${formatMessageTime(message.createdAt || message.timestamp || new Date())}</span>
                            ${isSent ? `<span class="message-status">${escapeGroupChatHTML(statusLabel)}</span>` : ''}
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
            currentChatGroup = null;
            // FIX: notify chat.html so it can restore its default header —
            // without this, the group-specific header icons (voice/video
            // call, more-options) stayed visible/stuck because chat.html
            // only ever learns to switch INTO group-header mode (see
            // GROUP_PANEL_OPEN below); nothing told it to switch back out.
            try {
                window.parent.postMessage({ type: 'GROUP_PANEL_CLOSE', source: 'group-module', timestamp: Date.now() }, '*');
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
            const membersResponse = await secureApiCall(`/groups/${currentChatGroup.id}/members?limit=100`, { silent: true }).catch(() => null);
            const membersPayload = normalizeMembersPayload(membersResponse?.data);
            const currentUserId = getCurrentGroupUserId();
            const participantIds = membersPayload.members
                .map(member => member.userId || member.user?.id || member.id)
                .filter(id => id && String(id) !== currentUserId);
            
            if (window.parent && typeof window.parent.__dispatchCallToIframe === 'function') {
                // FIX-GROUP-CALL-NOTICE: the 7th arg (extraCtx) carries groupId/groupName/
                // isGroupCall/participantIds through chat.html -> calls-ui.js -> calls-core.js
                // -> POST /calls. Without it, the call is indistinguishable from a 1:1 call to
                // a "user" whose id happens to equal the group id, so the backend never resolves
                // real group members and never notifies anyone else to join/decline.
                window.parent.__dispatchCallToIframe(
                    currentChatGroup.id,
                    currentChatGroup.name,
                    callType,
                    'group',
                    currentChatGroup.id,
                    'group-module',
                    { groupId: currentChatGroup.id, groupName: currentChatGroup.name, isGroupCall: true, participantIds }
                );
                return;
            }
            
            if (window.callCore?.startGroupCall) {
                window.callCore.startGroupCall(participantIds, callType, { groupId: currentChatGroup.id, groupName: currentChatGroup.name, isGroupCall: true });
            }
        };
        
        if (callBtn && !callBtn._groupVoiceBound && !callBtn._gcC) {
            callBtn._groupVoiceBound = true;
            callBtn.addEventListener('click', () => { startCall('voice').catch(() => {}); });
        }
        
        if (videoBtn && !videoBtn._groupVideoBound && !videoBtn._gcCV) {
            videoBtn._groupVideoBound = true;
            videoBtn.addEventListener('click', () => { startCall('video').catch(() => {}); });
        }
    } catch (error) {}
}

const openGroupChat = async function(groupData) {
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
        
        currentChatGroup = groupData;
        GroupCore.resetGroupUnreadCount(groupData.id);
        updateGroupChatHeader(groupData);
        renderGroupChatLoadingState('Loading messages...');
        setupGroupAttachmentControls();
        
        const sidebar = safeGetElement('#sidebar');
        const groupChatPanel = safeGetElement('#groupChatPanel');
        
        if (isMobile) {
            if (sidebar) { sidebar.style.display='none'; sidebar.classList.add('hidden'); }
            if (groupChatPanel) {
                groupChatPanel.style.display='flex';
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
            const [groupDetailsResponse, membersResponse] = await Promise.all([
                GroupCore.getGroupDetails(groupData.id).catch(() => null),
                secureApiCall(`/groups/${groupData.id}/members`, { silent: true }).catch(() => null)
            ]);
            const resolvedGroup = groupDetailsResponse?.data || GroupCore.getGroupById(groupData.id) || groupData;
            const membersPayload = normalizeMembersPayload(membersResponse?.data);
            resolvedGroup.memberCount = getGroupMemberCount(resolvedGroup, membersPayload);
            currentChatGroup = resolvedGroup;
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
                        isPublic: resolvedGroup.isPublic,
                    },
                    source: 'group-module',
                    timestamp: Date.now(),
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
                rt.emit('join', { room: `group:${groupData.id}` });
                rt.emit('join', { room: `group_${groupData.id}` });
            } else if (rt && rt._socket && typeof rt._socket.emit === 'function') {
                rt._socket.emit('join', { room: `group:${groupData.id}` });
                rt._socket.emit('join', { room: `group_${groupData.id}` });
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
        
        const tempMessage = {
            ...message,
            id: 'temp_' + Date.now()
        };
        
        addMessageToChat(tempMessage, true);
        
        try {
            const response = await GroupCore.sendGroupMessage(currentChatGroup.id, messageContent, selectedTopic, isAnonymousMode);
            
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
                anonymous: isAnonymousMode
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
                try { newChatInpu
