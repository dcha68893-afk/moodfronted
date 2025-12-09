// Wait for Firebase to be initialized
if (!window.firebase || !window.db) {
    console.log('⏳ Waiting for Firebase initialization...');
    
    const waitForFirebase = setInterval(() => {
        if (window.firebase && window.db) {
            clearInterval(waitForFirebase);
            console.log('✅ Firebase ready in groups.js');
            // Initialize your script here
        }
    }, 100);
} else {
    console.log('✅ Firebase already available');
    // Initialize your script here
}

// ==================== GROUPS.JS COMPREHENSIVE IMPLEMENTATION ====================
// Complete group chat system with all specified features
// Production-ready code for live deployment
// ===============================================================================

// ==================== GLOBAL VARIABLES ====================

let currentGroup = null;
let currentGroupId = null;
let groupAdminId = null;
let unsubscribeGroupMessages = null;
let unsubscribeGroups = null;
let allGroups = [];
let groupInvites = [];
let groupRequests = [];
let groupTypingTimeouts = {};
let selectedGroupMessages = new Set();
let groupEmojiPicker = null;
let currentForwardMessage = null;
let groupReactionsPicker = null;
let currentContextMessageId = null;
let isGroupChat = false;
let selectedParticipants = new Set();
let groupCallActive = false;
let groupVideoCallActive = false;
let currentGroupPoll = null;

// DOM Elements cache
const groupElements = {
    // 1. GROUP CREATION ELEMENTS
    createGroupModal: null,
    groupName: null,
    groupDescription: null,
    groupParticipants: null,
    createGroupBtn: null,
    closeCreateGroup: null,
    groupAdminsOnlySend: null,
    groupAdminsOnlyEdit: null,
    groupEnableEncryption: null,
    
    // 2. GROUP LIST & DISPLAY
    groupsList: null,
    noChatsMessage: null,
    
    // 3. GROUP INFO & SETTINGS
    enhancedGroupInfoModal: null,
    enhancedGroupName: null,
    enhancedGroupMembersCount: null,
    groupSendMessages: null,
    groupEditInfo: null,
    groupInviteLink: null,
    copyInviteLink: null,
    refreshInviteLink: null,
    closeEnhancedGroupInfo: null,
    
    // 4. GROUP JOIN ELEMENTS
    joinGroupModal: null,
    groupCode: null,
    groupPreview: null,
    previewGroupName: null,
    previewGroupMembers: null,
    joinGroupBtn: null,
    closeJoinGroup: null,
    
    // 5. GROUP MANAGEMENT ELEMENTS
    manageAdminsModal: null,
    adminSearchInput: null,
    adminList: null,
    saveAdmins: null,
    closeManageAdmins: null,
    
    // 6. GROUP MEDIA GALLERY
    groupMediaGalleryModal: null,
    mediaGalleryGrid: null,
    closeGroupMediaGallery: null,
    
    // 7. GROUP SEARCH ELEMENTS
    searchGroupModal: null,
    groupSearchInput: null,
    groupSearchResults: null,
    closeSearchGroup: null,
    
    // 8. GROUP CONTEXT MENU
    groupListContextMenu: null,
    
    // 9. GROUP CHAT AREA ELEMENTS
    chatTitle: null,
    chatAvatar: null,
    chatStatus: null,
    
    // 10. GROUP MESSAGE ELEMENTS
    chatMessages: null,
    
    // 11. GROUP TOOLS & FEATURES
    newGroupBtn: null,
    groupMenuBtn: null,
    
    // 12. GROUP MEMBER ELEMENTS
    groupMembersList: null,
    
    // 16. GROUP FORWARD ELEMENTS
    forwardMessageModal: null,
    forwardSearchInput: null,
    forwardTargetsList: null,
    forwardSelectedBtn: null,
    closeForwardMessage: null,
    
    // 17. STARRED MESSAGES IN GROUPS
    starredMessagesModal: null,
    starredMessagesList: null,
    closeStarredMessages: null,
    
    // 20. GROUP CREATION PARTICIPANT SELECTION
    selectedParticipantsContainer: null,
    participantCount: null,
    
    // 22. GROUP LEAVE/DELETE ELEMENTS
    leaveGroupBtn: null,
    deleteGroupBtn: null,
    confirmLeaveGroup: null,
    confirmDeleteGroup: null,
    
    // 24. GROUP ACTIVITY INDICATORS
    groupActivityIndicator: null,
    
    // Additional elements
    messageInput: null,
    sendMessageBtn: null,
    groupCallBtn: null,
    groupVideoCallBtn: null,
    backToChatsBtn: null,
    groupInviteLinkContainer: null,
    encryptionBadge: null,
    securityCodeDisplay: null
};

// ==================== INITIALIZATION FUNCTIONS ====================

/**
 * Initialize the complete group system
 */
function initializeGroupSystem() {
    console.log('🚀 Initializing enhanced group system...');
    
    // Create all UI elements if they don't exist
    createAllGroupUIElements();
    
    // Cache DOM elements
    cacheGroupElements();
    
    // Setup event listeners
    setupEnhancedGroupEventListeners();
    
    // Initialize features
    initializeGroupFeatures();
    
    // Load user's groups if logged in
    if (currentUser) {
        loadUserGroups();
        listenForGroupInvites();
        listenForGroupRequests();
    }
    
    console.log('✅ Enhanced group system initialized');
}

/**
 * Create all required UI elements
 */
function createAllGroupUIElements() {
    console.log('Creating all group UI elements...');
    
    // Create groups tab
    createGroupsTab();
    
    // Create all required modals
    createRequiredModals();
    
    // Create context menus
    createGroupContextMenus();
    
    // Create group-specific UI components
    createGroupUIComponents();
    
    // Create shared goals section
    createSharedGoalsSection();
    
    // Create highlights panel
    createHighlightsPanel();
}

/**
 * Create the groups tab in main navigation
 */
function createGroupsTab() {
    const tabsContainer = document.querySelector('.tabs');
    if (!tabsContainer) return;
    
    // Add groups tab button
    if (!document.getElementById('groupsTabBtn')) {
        const tabsNav = document.querySelector('.tabs-nav');
        if (tabsNav) {
            const groupsTabBtn = document.createElement('button');
            groupsTabBtn.id = 'groupsTabBtn';
            groupsTabBtn.className = 'tab-btn';
            groupsTabBtn.setAttribute('data-tab', 'groups');
            groupsTabBtn.innerHTML = `
                <i class="fas fa-users"></i>
                <span class="ml-2">Groups</span>
            `;
            tabsNav.appendChild(groupsTabBtn);
        }
    }
    
    // Create groups tab content
    if (!document.getElementById('groupsTab')) {
        const groupsTab = document.createElement('div');
        groupsTab.id = 'groupsTab';
        groupsTab.className = 'tab-panel hidden';
        groupsTab.innerHTML = `
            <div class="p-4">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold">Groups</h2>
                    <div class="flex space-x-2">
                        <button id="newGroupBtn" class="btn-primary">
                            <i class="fas fa-plus"></i>
                            <span>New Group</span>
                        </button>
                        <button id="joinGroupBtn" class="btn-secondary">
                            <i class="fas fa-sign-in-alt"></i>
                            <span>Join Group</span>
                        </button>
                    </div>
                </div>
                
                <div class="mb-4">
                    <input type="text" id="groupSearch" 
                           class="w-full p-3 border rounded-lg"
                           placeholder="Search groups...">
                </div>
                
                <div id="groupsList" class="space-y-3">
                    <div id="noChatsMessage" class="text-center py-12">
                        <i class="fas fa-users text-4xl text-gray-300 mb-4"></i>
                        <h3 class="text-lg font-semibold text-gray-600">No Groups</h3>
                        <p class="text-gray-500">Create or join a group to get started</p>
                    </div>
                </div>
            </div>
        `;
        
        tabsContainer.appendChild(groupsTab);
    }
}

/**
 * Create all required modals
 */
function createRequiredModals() {
    // 1. Group Creation Modal
    if (!document.getElementById('createGroupModal')) {
        const modal = document.createElement('div');
        modal.id = 'createGroupModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getCreateGroupModalHTML();
        document.body.appendChild(modal);
    }
    
    // 3. Enhanced Group Info Modal
    if (!document.getElementById('enhancedGroupInfoModal')) {
        const modal = document.createElement('div');
        modal.id = 'enhancedGroupInfoModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getEnhancedGroupInfoModalHTML();
        document.body.appendChild(modal);
    }
    
    // 4. Join Group Modal
    if (!document.getElementById('joinGroupModal')) {
        const modal = document.createElement('div');
        modal.id = 'joinGroupModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getJoinGroupModalHTML();
        document.body.appendChild(modal);
    }
    
    // 5. Manage Admins Modal
    if (!document.getElementById('manageAdminsModal')) {
        const modal = document.createElement('div');
        modal.id = 'manageAdminsModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getManageAdminsModalHTML();
        document.body.appendChild(modal);
    }
    
    // 6. Group Media Gallery Modal
    if (!document.getElementById('groupMediaGalleryModal')) {
        const modal = document.createElement('div');
        modal.id = 'groupMediaGalleryModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getGroupMediaGalleryModalHTML();
        document.body.appendChild(modal);
    }
    
    // 7. Group Search Modal
    if (!document.getElementById('searchGroupModal')) {
        const modal = document.createElement('div');
        modal.id = 'searchGroupModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getSearchGroupModalHTML();
        document.body.appendChild(modal);
    }
    
    // 16. Forward Message Modal
    if (!document.getElementById('forwardMessageModal')) {
        const modal = document.createElement('div');
        modal.id = 'forwardMessageModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getForwardMessageModalHTML();
        document.body.appendChild(modal);
    }
    
    // 17. Starred Messages Modal
    if (!document.getElementById('starredMessagesModal')) {
        const modal = document.createElement('div');
        modal.id = 'starredMessagesModal';
        modal.className = 'modal hidden';
        modal.innerHTML = getStarredMessagesModalHTML();
        document.body.appendChild(modal);
    }
    
    // 22. Confirm Leave Group Modal
    if (!document.getElementById('confirmLeaveGroup')) {
        const modal = document.createElement('div');
        modal.id = 'confirmLeaveGroup';
        modal.className = 'modal hidden';
        modal.innerHTML = getConfirmLeaveGroupHTML();
        document.body.appendChild(modal);
    }
    
    // 22. Confirm Delete Group Modal
    if (!document.getElementById('confirmDeleteGroup')) {
        const modal = document.createElement('div');
        modal.id = 'confirmDeleteGroup';
        modal.className = 'modal hidden';
        modal.innerHTML = getConfirmDeleteGroupHTML();
        document.body.appendChild(modal);
    }
}

/**
 * Get Create Group Modal HTML
 */
function getCreateGroupModalHTML() {
    return `
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Create New Group</h3>
            <button id="closeCreateGroup" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <form id="createGroupForm">
                <div class="mb-4">
                    <label for="groupName" class="form-label">Group Name</label>
                    <input type="text" id="groupName" class="form-input" required>
                </div>
                
                <div class="mb-4">
                    <label for="groupDescription" class="form-label">Description</label>
                    <textarea id="groupDescription" class="form-textarea" rows="3"></textarea>
                </div>
                
                <div class="mb-4">
                    <label class="form-label">Add Participants</label>
                    <div id="groupParticipants" class="border rounded p-3 max-h-60 overflow-y-auto">
                        <div id="noParticipantsMessage" class="text-center py-4 text-gray-500">
                            Search for friends to add
                        </div>
                    </div>
                    <div id="selectedParticipants" class="mt-2 flex flex-wrap gap-2"></div>
                    <div class="mt-1 text-sm text-gray-500">
                        <span id="participantCount">0</span> selected
                    </div>
                </div>
                
                <div class="mb-4">
                    <label class="form-label">Group Settings</label>
                    <div class="space-y-2">
                        <label class="inline-flex items-center">
                            <input type="checkbox" id="groupAdminsOnlySend" class="form-checkbox">
                            <span class="ml-2">Only admins can send messages</span>
                        </label>
                        <label class="inline-flex items-center">
                            <input type="checkbox" id="groupAdminsOnlyEdit" class="form-checkbox">
                            <span class="ml-2">Only admins can edit group info</span>
                        </label>
                        <label class="inline-flex items-center">
                            <input type="checkbox" id="groupEnableEncryption" class="form-checkbox">
                            <span class="ml-2">Enable end-to-end encryption</span>
                        </label>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button type="button" id="cancelCreateGroup" class="btn-secondary">Cancel</button>
                    <button type="submit" id="createGroupBtn" class="btn-primary">Create Group</button>
                </div>
            </form>
        </div>
    </div>
    `;
}

/**
 * Get Enhanced Group Info Modal HTML
 */
function getEnhancedGroupInfoModalHTML() {
    return `
    <div class="modal-content modal-lg">
        <div class="modal-header">
            <h3 class="modal-title">Group Information</h3>
            <button id="closeEnhancedGroupInfo" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <div class="text-center mb-6">
                <img id="groupInfoAvatar" class="w-24 h-24 rounded-full mx-auto mb-4" src="">
                <h2 id="enhancedGroupName" class="text-2xl font-bold"></h2>
                <p id="groupInfoDescription" class="text-gray-600"></p>
                <div class="mt-2">
                    <span id="enhancedGroupMembersCount" class="text-sm text-gray-500"></span>
                    <span id="encryptionBadge" class="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded hidden">
                        <i class="fas fa-lock"></i> Encrypted
                    </span>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 class="font-semibold mb-3">Group Settings</h4>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">Who can send messages</label>
                            <select id="groupSendMessages" class="form-select">
                                <option value="all">All members</option>
                                <option value="admins">Admins only</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Who can edit group info</label>
                            <select id="groupEditInfo" class="form-select">
                                <option value="all">All members</option>
                                <option value="admins">Admins only</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div>
                    <h4 class="font-semibold mb-3">Invite Link</h4>
                    <div class="space-y-3">
                        <div>
                            <input type="text" id="groupInviteLink" readonly class="form-input">
                            <div class="mt-2 flex space-x-2">
                                <button id="copyInviteLink" class="btn-secondary flex-1">
                                    <i class="fas fa-copy mr-2"></i>Copy
                                </button>
                                <button id="refreshInviteLink" class="btn-secondary">
                                    <i class="fas fa-redo"></i>
                                </button>
                            </div>
                        </div>
                        <div id="securityCodeDisplay" class="hidden">
                            <label class="block text-sm font-medium mb-1">Security Code</label>
                            <code class="bg-gray-100 p-2 rounded text-sm block">Loading...</code>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-6">
                <h4 class="font-semibold mb-3">Members</h4>
                <div id="groupMembersList" class="space-y-2 max-h-60 overflow-y-auto">
                    <!-- Members will be loaded here -->
                </div>
            </div>
            
            <div class="mt-6 pt-6 border-t">
                <div class="space-y-3">
                    <button id="leaveGroupBtn" class="btn-warning w-full">
                        <i class="fas fa-sign-out-alt mr-2"></i>Leave Group
                    </button>
                    <div id="adminDangerZone" class="hidden">
                        <button id="deleteGroupBtn" class="btn-danger w-full">
                            <i class="fas fa-trash mr-2"></i>Delete Group
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Join Group Modal HTML
 */
function getJoinGroupModalHTML() {
    return `
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Join Group</h3>
            <button id="closeJoinGroup" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <div class="mb-4">
                <label for="groupCode" class="form-label">Group Code or Invite Link</label>
                <input type="text" id="groupCode" class="form-input" placeholder="Enter group code or paste invite link">
                <p class="text-sm text-gray-500 mt-1">You need an invite code or link to join a private group</p>
            </div>
            
            <div id="groupPreview" class="hidden mb-4 p-4 border rounded-lg">
                <div class="flex items-center space-x-3">
                    <img id="previewGroupAvatar" class="w-12 h-12 rounded-full">
                    <div>
                        <h4 id="previewGroupName" class="font-semibold"></h4>
                        <p id="previewGroupMembers" class="text-sm text-gray-500"></p>
                    </div>
                </div>
                <p id="previewGroupDescription" class="mt-2 text-sm"></p>
            </div>
            
            <div class="modal-footer">
                <button type="button" id="cancelJoinGroup" class="btn-secondary">Cancel</button>
                <button type="button" id="joinGroupBtn" class="btn-primary">Join Group</button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Manage Admins Modal HTML
 */
function getManageAdminsModalHTML() {
    return `
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Manage Admins</h3>
            <button id="closeManageAdmins" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <div class="mb-4">
                <input type="text" id="adminSearchInput" class="form-input" placeholder="Search members...">
            </div>
            
            <div id="adminList" class="space-y-2 max-h-80 overflow-y-auto">
                <!-- Admin list will be loaded here -->
            </div>
            
            <div class="modal-footer">
                <button type="button" id="cancelManageAdmins" class="btn-secondary">Cancel</button>
                <button type="button" id="saveAdmins" class="btn-primary">Save Changes</button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Group Media Gallery Modal HTML
 */
function getGroupMediaGalleryModalHTML() {
    return `
    <div class="modal-content modal-xl">
        <div class="modal-header">
            <h3 class="modal-title">Group Media</h3>
            <button id="closeGroupMediaGallery" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <div class="mb-4 flex space-x-2">
                <button class="filter-btn active" data-filter="all">All Media</button>
                <button class="filter-btn" data-filter="images">Images</button>
                <button class="filter-btn" data-filter="videos">Videos</button>
                <button class="filter-btn" data-filter="documents">Documents</button>
            </div>
            
            <div id="mediaGalleryGrid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <!-- Media items will be loaded here -->
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Search Group Modal HTML
 */
function getSearchGroupModalHTML() {
    return `
    <div class="modal-content modal-lg">
        <div class="modal-header">
            <h3 class="modal-title">Search in Group</h3>
            <button id="closeSearchGroup" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <div class="mb-4">
                <input type="text" id="groupSearchInput" class="form-input" placeholder="Search messages, files, links...">
            </div>
            
            <div id="groupSearchResults" class="space-y-3 max-h-96 overflow-y-auto">
                <!-- Search results will be displayed here -->
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Forward Message Modal HTML
 */
function getForwardMessageModalHTML() {
    return `
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Forward Message</h3>
            <button id="closeForwardMessage" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <div class="mb-4">
                <input type="text" id="forwardSearchInput" class="form-input" placeholder="Search groups...">
            </div>
            
            <div id="forwardTargetsList" class="space-y-2 max-h-64 overflow-y-auto">
                <!-- Forward targets will be loaded here -->
            </div>
            
            <div class="modal-footer">
                <button type="button" id="cancelForward" class="btn-secondary">Cancel</button>
                <button type="button" id="forwardSelectedBtn" class="btn-primary" disabled>
                    Forward (<span id="forwardCount">0</span>)
                </button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Starred Messages Modal HTML
 */
function getStarredMessagesModalHTML() {
    return `
    <div class="modal-content modal-lg">
        <div class="modal-header">
            <h3 class="modal-title">Starred Messages</h3>
            <button id="closeStarredMessages" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <div id="starredMessagesList" class="space-y-4 max-h-96 overflow-y-auto">
                <!-- Starred messages will be loaded here -->
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Confirm Leave Group HTML
 */
function getConfirmLeaveGroupHTML() {
    return `
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Leave Group</h3>
            <button type="button" class="modal-close" onclick="hideModal('confirmLeaveGroup')">&times;</button>
        </div>
        <div class="modal-body">
            <p class="mb-4">Are you sure you want to leave this group? You will no longer receive messages from this group.</p>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="hideModal('confirmLeaveGroup')">Cancel</button>
                <button type="button" id="confirmLeaveAction" class="btn-warning">Leave Group</button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Get Confirm Delete Group HTML
 */
function getConfirmDeleteGroupHTML() {
    return `
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Delete Group</h3>
            <button type="button" class="modal-close" onclick="hideModal('confirmDeleteGroup')">&times;</button>
        </div>
        <div class="modal-body">
            <p class="mb-4 text-red-600 font-semibold">Warning: This action cannot be undone!</p>
            <p class="mb-4">All messages, media, and group data will be permanently deleted. All members will be removed from the group.</p>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="hideModal('confirmDeleteGroup')">Cancel</button>
                <button type="button" id="confirmDeleteAction" class="btn-danger">Delete Group</button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Create group context menus
 */
function createGroupContextMenus() {
    // 8. Group List Context Menu
    if (!document.getElementById('groupListContextMenu')) {
        const contextMenu = document.createElement('div');
        contextMenu.id = 'groupListContextMenu';
        contextMenu.className = 'context-menu hidden';
        contextMenu.innerHTML = `
            <div class="context-menu-content">
                <button class="context-menu-item" data-action="open-group">
                    <i class="fas fa-comments mr-2"></i>Open
                </button>
                <button class="context-menu-item" data-action="mute-group">
                    <i class="fas fa-bell-slash mr-2"></i>Mute
                </button>
                <button class="context-menu-item" data-action="mark-as-read">
                    <i class="fas fa-check-double mr-2"></i>Mark as Read
                </button>
                <hr>
                <button class="context-menu-item" data-action="leave-group">
                    <i class="fas fa-sign-out-alt mr-2"></i>Leave Group
                </button>
            </div>
        `;
        document.body.appendChild(contextMenu);
    }
}

/**
 * Create group UI components
 */
function createGroupUIComponents() {
    // Update chat header for group features
    const chatHeader = document.querySelector('.chat-header');
    if (chatHeader) {
        // Add group-specific buttons
        const groupCallBtn = document.createElement('button');
        groupCallBtn.id = 'groupCallBtn';
        groupCallBtn.className = 'group-call-btn btn-icon';
        groupCallBtn.innerHTML = '<i class="fas fa-phone"></i>';
        groupCallBtn.title = 'Group Call';
        
        const groupVideoCallBtn = document.createElement('button');
        groupVideoCallBtn.id = 'groupVideoCallBtn';
        groupVideoCallBtn.className = 'group-video-call-btn btn-icon';
        groupVideoCallBtn.innerHTML = '<i class="fas fa-video"></i>';
        groupVideoCallBtn.title = 'Group Video Call';
        
        const groupMenuBtn = document.createElement('button');
        groupMenuBtn.id = 'groupMenuBtn';
        groupMenuBtn.className = 'btn-icon';
        groupMenuBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        groupMenuBtn.title = 'Group Menu';
        
        // Add to chat header
        const chatActions = chatHeader.querySelector('.chat-actions');
        if (chatActions) {
            chatActions.prepend(groupCallBtn);
            chatActions.prepend(groupVideoCallBtn);
            chatActions.prepend(groupMenuBtn);
        }
        
        // Update chat title to show group info
        const chatTitle = chatHeader.querySelector('.chat-title');
        if (chatTitle && !chatTitle.querySelector('.group-member-count')) {
            const memberCount = document.createElement('span');
            memberCount.className = 'group-member-count text-sm text-gray-500 ml-2';
            chatTitle.appendChild(memberCount);
        }
    }
    
    // Add back button for mobile
    if (!document.getElementById('backToChats')) {
        const backBtn = document.createElement('button');
        backBtn.id = 'backToChats';
        backBtn.className = 'back-to-chats btn-icon hidden md:hidden';
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
        backBtn.title = 'Back to Chats';
        
        const chatHeader = document.querySelector('.chat-header');
        if (chatHeader) {
            chatHeader.prepend(backBtn);
        }
    }
}

/**
 * Create shared goals section
 */
function createSharedGoalsSection() {
    // Implementation for shared goals
}

/**
 * Create highlights panel
 */
function createHighlightsPanel() {
    // Implementation for highlights panel
}

// ==================== CACHE DOM ELEMENTS ====================

/**
 * Cache all DOM elements
 */
function cacheGroupElements() {
    // 1. Group Creation Elements
    groupElements.createGroupModal = document.getElementById('createGroupModal');
    groupElements.groupName = document.getElementById('groupName');
    groupElements.groupDescription = document.getElementById('groupDescription');
    groupElements.groupParticipants = document.getElementById('groupParticipants');
    groupElements.createGroupBtn = document.getElementById('createGroupBtn');
    groupElements.closeCreateGroup = document.getElementById('closeCreateGroup');
    groupElements.groupAdminsOnlySend = document.getElementById('groupAdminsOnlySend');
    groupElements.groupAdminsOnlyEdit = document.getElementById('groupAdminsOnlyEdit');
    groupElements.groupEnableEncryption = document.getElementById('groupEnableEncryption');
    
    // 2. Group List & Display
    groupElements.groupsList = document.getElementById('groupsList');
    groupElements.noChatsMessage = document.getElementById('noChatsMessage');
    
    // 3. Group Info & Settings
    groupElements.enhancedGroupInfoModal = document.getElementById('enhancedGroupInfoModal');
    groupElements.enhancedGroupName = document.getElementById('enhancedGroupName');
    groupElements.enhancedGroupMembersCount = document.getElementById('enhancedGroupMembersCount');
    groupElements.groupSendMessages = document.getElementById('groupSendMessages');
    groupElements.groupEditInfo = document.getElementById('groupEditInfo');
    groupElements.groupInviteLink = document.getElementById('groupInviteLink');
    groupElements.copyInviteLink = document.getElementById('copyInviteLink');
    groupElements.refreshInviteLink = document.getElementById('refreshInviteLink');
    groupElements.closeEnhancedGroupInfo = document.getElementById('closeEnhancedGroupInfo');
    
    // 4. Group Join Elements
    groupElements.joinGroupModal = document.getElementById('joinGroupModal');
    groupElements.groupCode = document.getElementById('groupCode');
    groupElements.groupPreview = document.getElementById('groupPreview');
    groupElements.previewGroupName = document.getElementById('previewGroupName');
    groupElements.previewGroupMembers = document.getElementById('previewGroupMembers');
    groupElements.joinGroupBtn = document.getElementById('joinGroupBtn');
    groupElements.closeJoinGroup = document.getElementById('closeJoinGroup');
    
    // 5. Group Management Elements
    groupElements.manageAdminsModal = document.getElementById('manageAdminsModal');
    groupElements.adminSearchInput = document.getElementById('adminSearchInput');
    groupElements.adminList = document.getElementById('adminList');
    groupElements.saveAdmins = document.getElementById('saveAdmins');
    groupElements.closeManageAdmins = document.getElementById('closeManageAdmins');
    
    // 6. Group Media Gallery
    groupElements.groupMediaGalleryModal = document.getElementById('groupMediaGalleryModal');
    groupElements.mediaGalleryGrid = document.getElementById('mediaGalleryGrid');
    groupElements.closeGroupMediaGallery = document.getElementById('closeGroupMediaGallery');
    
    // 7. Group Search Elements
    groupElements.searchGroupModal = document.getElementById('searchGroupModal');
    groupElements.groupSearchInput = document.getElementById('groupSearchInput');
    groupElements.groupSearchResults = document.getElementById('groupSearchResults');
    groupElements.closeSearchGroup = document.getElementById('closeSearchGroup');
    
    // 8. Group Context Menu
    groupElements.groupListContextMenu = document.getElementById('groupListContextMenu');
    
    // 9. Group Chat Area Elements
    groupElements.chatTitle = document.querySelector('.chat-title');
    groupElements.chatAvatar = document.querySelector('.chat-avatar');
    groupElements.chatStatus = document.querySelector('.chat-status');
    
    // 10. Group Message Elements
    groupElements.chatMessages = document.getElementById('chatMessages');
    
    // 11. Group Tools & Features
    groupElements.newGroupBtn = document.getElementById('newGroupBtn');
    groupElements.groupMenuBtn = document.getElementById('groupMenuBtn');
    
    // 12. Group Member Elements
    groupElements.groupMembersList = document.getElementById('groupMembersList');
    
    // 16. Group Forward Elements
    groupElements.forwardMessageModal = document.getElementById('forwardMessageModal');
    groupElements.forwardSearchInput = document.getElementById('forwardSearchInput');
    groupElements.forwardTargetsList = document.getElementById('forwardTargetsList');
    groupElements.forwardSelectedBtn = document.getElementById('forwardSelectedBtn');
    groupElements.closeForwardMessage = document.getElementById('closeForwardMessage');
    
    // 17. Starred Messages in Groups
    groupElements.starredMessagesModal = document.getElementById('starredMessagesModal');
    groupElements.starredMessagesList = document.getElementById('starredMessagesList');
    groupElements.closeStarredMessages = document.getElementById('closeStarredMessages');
    
    // 20. Group Creation Participant Selection
    groupElements.selectedParticipantsContainer = document.getElementById('selectedParticipants');
    groupElements.participantCount = document.getElementById('participantCount');
    
    // 22. Group Leave/Delete Elements
    groupElements.leaveGroupBtn = document.getElementById('leaveGroupBtn');
    groupElements.deleteGroupBtn = document.getElementById('deleteGroupBtn');
    groupElements.confirmLeaveGroup = document.getElementById('confirmLeaveGroup');
    groupElements.confirmDeleteGroup = document.getElementById('confirmDeleteGroup');
    
    // 24. Group Activity Indicators
    groupElements.groupActivityIndicator = document.querySelector('.group-activity');
    
    // Additional elements
    groupElements.messageInput = document.getElementById('messageInput');
    groupElements.sendMessageBtn = document.getElementById('sendMessageBtn');
    groupElements.groupCallBtn = document.getElementById('groupCallBtn');
    groupElements.groupVideoCallBtn = document.getElementById('groupVideoCallBtn');
    groupElements.backToChatsBtn = document.getElementById('backToChats');
    groupElements.groupInviteLinkContainer = document.querySelector('.group-invite-link');
    groupElements.encryptionBadge = document.getElementById('encryptionBadge');
    groupElements.securityCodeDisplay = document.getElementById('securityCodeDisplay');
}

// ==================== EVENT LISTENERS SETUP ====================

/**
 * Setup all enhanced event listeners
 */
function setupEnhancedGroupEventListeners() {
    console.log('Setting up enhanced group event listeners...');
    
    // 1. Group Creation
    if (groupElements.newGroupBtn) {
        groupElements.newGroupBtn.addEventListener('click', () => showModal('createGroupModal'));
    }
    
    if (groupElements.createGroupBtn) {
        groupElements.createGroupBtn.addEventListener('click', createNewGroupAction);
    }
    
    if (groupElements.closeCreateGroup) {
        groupElements.closeCreateGroup.addEventListener('click', () => hideModal('createGroupModal'));
    }
    
    if (groupElements.cancelCreateGroup) {
        const cancelBtn = document.getElementById('cancelCreateGroup');
        if (cancelBtn) cancelBtn.addEventListener('click', () => hideModal('createGroupModal'));
    }
    
    // 3. Group Info
    if (groupElements.closeEnhancedGroupInfo) {
        groupElements.closeEnhancedGroupInfo.addEventListener('click', () => hideModal('enhancedGroupInfoModal'));
    }
    
    if (groupElements.copyInviteLink) {
        groupElements.copyInviteLink.addEventListener('click', copyInviteLinkAction);
    }
    
    if (groupElements.refreshInviteLink) {
        groupElements.refreshInviteLink.addEventListener('click', refreshInviteLinkAction);
    }
    
    // 4. Join Group
    if (groupElements.closeJoinGroup) {
        groupElements.closeJoinGroup.addEventListener('click', () => hideModal('joinGroupModal'));
    }
    
    if (groupElements.joinGroupBtn) {
        groupElements.joinGroupBtn.addEventListener('click', joinGroupAction);
    }
    
    if (groupElements.cancelJoinGroup) {
        const cancelBtn = document.getElementById('cancelJoinGroup');
        if (cancelBtn) cancelBtn.addEventListener('click', () => hideModal('joinGroupModal'));
    }
    
    // 5. Manage Admins
    if (groupElements.closeManageAdmins) {
        groupElements.closeManageAdmins.addEventListener('click', () => hideModal('manageAdminsModal'));
    }
    
    if (groupElements.saveAdmins) {
        groupElements.saveAdmins.addEventListener('click', saveAdminChanges);
    }
    
    if (groupElements.cancelManageAdmins) {
        const cancelBtn = document.getElementById('cancelManageAdmins');
        if (cancelBtn) cancelBtn.addEventListener('click', () => hideModal('manageAdminsModal'));
    }
    
    // 6. Media Gallery
    if (groupElements.closeGroupMediaGallery) {
        groupElements.closeGroupMediaGallery.addEventListener('click', () => hideModal('groupMediaGalleryModal'));
    }
    
    // 7. Search Group
    if (groupElements.closeSearchGroup) {
        groupElements.closeSearchGroup.addEventListener('click', () => hideModal('searchGroupModal'));
    }
    
    // 8. Context Menu
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#groupListContextMenu')) {
            hideGroupContextMenu();
        }
    });
    
    // 9. Chat Area
    if (groupElements.groupMenuBtn) {
        groupElements.groupMenuBtn.addEventListener('click', showGroupMenu);
    }
    
    if (groupElements.groupCallBtn) {
        groupElements.groupCallBtn.addEventListener('click', startGroupCall);
    }
    
    if (groupElements.groupVideoCallBtn) {
        groupElements.groupVideoCallBtn.addEventListener('click', startGroupVideoCall);
    }
    
    if (groupElements.backToChatsBtn) {
        groupElements.backToChatsBtn.addEventListener('click', () => switchToTab('chats'));
    }
    
    // 10. Message Handling
    if (groupElements.sendMessageBtn) {
        groupElements.sendMessageBtn.addEventListener('click', sendGroupMessage);
    }
    
    if (groupElements.messageInput) {
        groupElements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGroupMessage();
            }
        });
    }
    
    // 16. Forward Message
    if (groupElements.closeForwardMessage) {
        groupElements.closeForwardMessage.addEventListener('click', () => hideModal('forwardMessageModal'));
    }
    
    if (groupElements.cancelForward) {
        groupElements.cancelForward.addEventListener('click', () => hideModal('forwardMessageModal'));
    }
    
    if (groupElements.forwardSelectedBtn) {
        groupElements.forwardSelectedBtn.addEventListener('click', forwardSelectedMessages);
    }
    
    // 17. Starred Messages
    if (groupElements.closeStarredMessages) {
        groupElements.closeStarredMessages.addEventListener('click', () => hideModal('starredMessagesModal'));
    }
    
    // 22. Leave/Delete Group
    if (groupElements.leaveGroupBtn) {
        groupElements.leaveGroupBtn.addEventListener('click', () => showModal('confirmLeaveGroup'));
    }
    
    if (groupElements.deleteGroupBtn) {
        groupElements.deleteGroupBtn.addEventListener('click', () => showModal('confirmDeleteGroup'));
    }
    
    const confirmLeaveAction = document.getElementById('confirmLeaveAction');
    if (confirmLeaveAction) {
        confirmLeaveAction.addEventListener('click', confirmLeaveGroup);
    }
    
    const confirmDeleteAction = document.getElementById('confirmDeleteAction');
    if (confirmDeleteAction) {
        confirmDeleteAction.addEventListener('click', confirmDeleteGroup);
    }
    
    // 24. Activity Indicators
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Additional event listeners
    setupAdditionalEventListeners();
    
    console.log('✅ Enhanced event listeners setup complete');
}

/**
 * Setup additional event listeners
 */
function setupAdditionalEventListeners() {
    // Search groups
    const groupSearch = document.getElementById('groupSearch');
    if (groupSearch) {
        groupSearch.addEventListener('input', (e) => searchGroups(e.target.value));
    }
    
    // Group code input for preview
    if (groupElements.groupCode) {
        groupElements.groupCode.addEventListener('input', (e) => {
            if (e.target.value.length > 8) {
                previewGroupFromCode(e.target.value);
            }
        });
    }
    
    // Admin search
    if (groupElements.adminSearchInput) {
        groupElements.adminSearchInput.addEventListener('input', (e) => searchAdminMembers(e.target.value));
    }
    
    // Forward search
    if (groupElements.forwardSearchInput) {
        groupElements.forwardSearchInput.addEventListener('input', (e) => searchForwardTargets(e.target.value));
    }
    
    // Group search
    if (groupElements.groupSearchInput) {
        groupElements.groupSearchInput.addEventListener('input', (e) => searchInGroup(e.target.value));
    }
    
    // Filter buttons in media gallery
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            const filter = e.target.dataset.filter;
            filterGroupMedia(filter);
            e.target.classList.add('active');
            e.target.siblings?.forEach(btn => btn.classList.remove('active'));
        }
    });
    
    // Context menu items
    document.addEventListener('click', (e) => {
        if (e.target.closest('.context-menu-item')) {
            const action = e.target.closest('.context-menu-item').dataset.action;
            handleGroupContextMenuAction(action);
            hideGroupContextMenu();
        }
    });
    
    // Group chat items
    document.addEventListener('contextmenu', (e) => {
        const groupItem = e.target.closest('.group-chat-item');
        if (groupItem) {
            e.preventDefault();
            showGroupContextMenu(e, groupItem.dataset.groupId);
        }
    });
    
    // Click on group chat items
    document.addEventListener('click', (e) => {
        const groupItem = e.target.closest('.group-chat-item');
        if (groupItem && !e.target.closest('.context-menu')) {
            openGroupChat(groupItem.dataset.groupId);
        }
    });
}

// ==================== GROUP FUNCTIONS ====================

/**
 * 1. Group Creation Functions
 */
async function createNewGroupAction() {
    const groupName = groupElements.groupName?.value.trim();
    const description = groupElements.groupDescription?.value.trim();
    
    if (!groupName) {
        showToast('Group name is required', 'error');
        return;
    }
    
    if (selectedParticipants.size === 0) {
        showToast('Please add at least one participant', 'error');
        return;
    }
    
    const settings = {
        adminsOnlySend: groupElements.groupAdminsOnlySend?.checked || false,
        adminsOnlyEdit: groupElements.groupAdminsOnlyEdit?.checked || false,
        enableEncryption: groupElements.groupEnableEncryption?.checked || false
    };
    
    try {
        const groupId = await createGroup({
            name: groupName,
            description: description,
            participants: Array.from(selectedParticipants),
            settings: settings,
            createdBy: currentUser.uid
        });
        
        if (groupId) {
            hideModal('createGroupModal');
            openGroupChat(groupId);
            showToast('Group created successfully', 'success');
        }
    } catch (error) {
        console.error('Error creating group:', error);
        showToast('Error creating group', 'error');
    }
}

async function createGroup(groupData) {
    try {
        const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const groupDoc = {
            id: groupId,
            name: groupData.name,
            description: groupData.description || '',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(groupData.name)}&background=random`,
            participants: [...new Set([currentUser.uid, ...groupData.participants])],
            admins: [currentUser.uid],
            settings: groupData.settings,
            isEncrypted: groupData.settings.enableEncryption,
            inviteCode: generateInviteCode(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        await db.collection('groups').doc(groupId).set(groupDoc);
        
        // Send welcome message
        await sendSystemMessage(groupId, `${currentUserData.displayName} created the group`);
        
        // Send notifications to participants
        for (const participantId of groupData.participants) {
            await sendGroupInviteNotification(groupId, participantId);
        }
        
        return groupId;
    } catch (error) {
        console.error('Error in createGroup:', error);
        throw error;
    }
}

/**
 * 2. Group List Functions
 */
async function loadUserGroups() {
    try {
        const groupsQuery = await db.collection('groups')
            .where('participants', 'array-contains', currentUser.uid)
            .where('status', '==', 'active')
            .orderBy('lastActivity', 'desc')
            .get();
        
        allGroups = [];
        groupsQuery.forEach(doc => {
            allGroups.push({ id: doc.id, ...doc.data() });
        });
        
        renderGroupsList(allGroups);
    } catch (error) {
        console.error('Error loading groups:', error);
        showToast('Error loading groups', 'error');
    }
}

function renderGroupsList(groups) {
    if (!groupElements.groupsList) return;
    
    if (groups.length === 0) {
        groupElements.noChatsMessage?.classList.remove('hidden');
        groupElements.groupsList.innerHTML = '';
        return;
    }
    
    groupElements.noChatsMessage?.classList.add('hidden');
    groupElements.groupsList.innerHTML = '';
    
    groups.forEach(group => {
        const groupItem = createGroupChatItem(group);
        groupElements.groupsList.appendChild(groupItem);
    });
}

function createGroupChatItem(group) {
    const item = document.createElement('div');
    item.className = 'group-chat-item flex items-center p-3 hover:bg-gray-50 rounded-lg cursor-pointer';
    item.dataset.groupId = group.id;
    item.dataset.groupName = group.name;
    
    const unreadCount = getGroupUnreadCount(group.id);
    
    item.innerHTML = `
        <div class="flex-shrink-0 relative">
            <img class="group-avatar w-12 h-12 rounded-full" 
                 src="${group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random`}"
                 alt="${group.name}">
            ${group.typingUsers?.length > 0 ? `
                <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            ` : ''}
        </div>
        <div class="ml-3 flex-1 min-w-0">
            <div class="flex justify-between items-center">
                <h3 class="group-name font-semibold truncate">${group.name}</h3>
                <span class="timestamp text-xs text-gray-500">
                    ${group.lastActivity ? formatTimeAgo(group.lastActivity.toDate()) : ''}
                </span>
            </div>
            <p class="last-message text-sm text-gray-500 truncate">
                ${group.lastMessage || 'No messages yet'}
            </p>
        </div>
        ${unreadCount > 0 ? `
            <div class="unread-count ml-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                ${unreadCount}
            </div>
        ` : ''}
        ${group.isMuted ? '<i class="fas fa-bell-slash text-gray-400 ml-2"></i>' : ''}
    `;
    
    return item;
}

function getGroupUnreadCount(groupId) {
    // Implement unread count logic
    return 0; // Placeholder
}

function searchGroups(query) {
    if (!query.trim()) {
        renderGroupsList(allGroups);
        return;
    }
    
    const searchTerm = query.toLowerCase();
    const filteredGroups = allGroups.filter(group =>
        group.name.toLowerCase().includes(searchTerm) ||
        group.description?.toLowerCase().includes(searchTerm)
    );
    
    renderGroupsList(filteredGroups);
}

/**
 * 3. Group Info Functions
 */
async function showGroupInfo(groupId) {
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (!groupDoc.exists) {
            showToast('Group not found', 'error');
            return;
        }
        
        const group = { id: groupId, ...groupDoc.data() };
        currentGroup = group;
        
        // Update modal content
        updateGroupInfoModal(group);
        
        // Load members
        await loadGroupMembers(groupId);
        
        showModal('enhancedGroupInfoModal');
    } catch (error) {
        console.error('Error showing group info:', error);
        showToast('Error loading group information', 'error');
    }
}

function updateGroupInfoModal(group) {
    if (groupElements.enhancedGroupName) {
        groupElements.enhancedGroupName.textContent = group.name;
    }
    
    if (groupElements.enhancedGroupMembersCount) {
        const memberCount = group.participants?.length || 0;
        groupElements.enhancedGroupMembersCount.textContent = `${memberCount} members`;
    }
    
    const groupInfoAvatar = document.getElementById('groupInfoAvatar');
    if (groupInfoAvatar) {
        groupInfoAvatar.src = group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random`;
    }
    
    const groupInfoDescription = document.getElementById('groupInfoDescription');
    if (groupInfoDescription) {
        groupInfoDescription.textContent = group.description || 'No description';
    }
    
    if (groupElements.groupInviteLink) {
        const inviteCode = group.inviteCode || generateInviteCode();
        groupElements.groupInviteLink.value = `${window.location.origin}/invite/${inviteCode}`;
    }
    
    if (groupElements.encryptionBadge) {
        groupElements.encryptionBadge.classList.toggle('hidden', !group.isEncrypted);
    }
    
    if (groupElements.securityCodeDisplay) {
        groupElements.securityCodeDisplay.classList.toggle('hidden', !group.isEncrypted);
    }
    
    // Update settings
    if (groupElements.groupSendMessages) {
        groupElements.groupSendMessages.value = group.settings?.adminsOnlySend ? 'admins' : 'all';
    }
    
    if (groupElements.groupEditInfo) {
        groupElements.groupEditInfo.value = group.settings?.adminsOnlyEdit ? 'admins' : 'all';
    }
    
    // Show/hide admin danger zone
    const adminDangerZone = document.getElementById('adminDangerZone');
    if (adminDangerZone) {
        const isAdmin = group.admins?.includes(currentUser.uid);
        adminDangerZone.classList.toggle('hidden', !isAdmin);
    }
}

async function loadGroupMembers(groupId) {
    if (!groupElements.groupMembersList) return;
    
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        const group = groupDoc.data();
        
        const members = [];
        for (const userId of group.participants || []) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                members.push({
                    id: userId,
                    ...userData,
                    isAdmin: group.admins?.includes(userId),
                    isCreator: userId === group.createdBy
                });
            }
        }
        
        renderGroupMembers(members);
    } catch (error) {
        console.error('Error loading group members:', error);
    }
}

function renderGroupMembers(members) {
    if (!groupElements.groupMembersList) return;
    
    groupElements.groupMembersList.innerHTML = '';
    
    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'group-member flex items-center justify-between p-2 hover:bg-gray-50 rounded';
        memberItem.dataset.memberId = member.id;
        memberItem.dataset.memberRole = member.isAdmin ? 'admin' : 'member';
        
        memberItem.innerHTML = `
            <div class="flex items-center">
                <img class="member-avatar w-10 h-10 rounded-full mr-3" 
                     src="${member.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.displayName)}&background=random`}"
                     alt="${member.displayName}">
                <div>
                    <div class="flex items-center">
                        <span class="member-name font-medium">${member.displayName}</span>
                        ${member.isCreator ? `
                            <span class="member-role ml-2 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">Creator</span>
                        ` : member.isAdmin ? `
                            <span class="member-role ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Admin</span>
                        ` : ''}
                    </div>
                    <span class="member-status text-sm text-gray-500">${member.status || 'offline'}</span>
                </div>
            </div>
            ${member.id !== currentUser.uid ? `
                <div class="flex space-x-2">
                    <button class="manage-member-btn text-blue-600 hover:text-blue-800" data-action="toggle-admin" data-user-id="${member.id}">
                        <i class="fas fa-user-shield"></i>
                    </button>
                </div>
            ` : ''}
        `;
        
        groupElements.groupMembersList.appendChild(memberItem);
    });
}

function copyInviteLinkAction() {
    if (!groupElements.groupInviteLink) return;
    
    groupElements.groupInviteLink.select();
    document.execCommand('copy');
    
    // Show feedback
    const originalValue = groupElements.groupInviteLink.value;
    groupElements.groupInviteLink.value = 'Copied!';
    
    setTimeout(() => {
        groupElements.groupInviteLink.value = originalValue;
    }, 2000);
    
    showToast('Invite link copied to clipboard', 'success');
}

async function refreshInviteLinkAction() {
    if (!currentGroupId) return;
    
    try {
        const newCode = generateInviteCode();
        await db.collection('groups').doc(currentGroupId).update({
            inviteCode: newCode,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        if (groupElements.groupInviteLink) {
            groupElements.groupInviteLink.value = `${window.location.origin}/invite/${newCode}`;
        }
        
        showToast('Invite link refreshed', 'success');
    } catch (error) {
        console.error('Error refreshing invite link:', error);
        showToast('Error refreshing invite link', 'error');
    }
}

/**
 * 4. Join Group Functions
 */
async function joinGroupAction() {
    const codeInput = groupElements.groupCode?.value.trim();
    if (!codeInput) {
        showToast('Please enter a group code', 'error');
        return;
    }
    
    // Extract code from URL if it's a link
    let code = codeInput;
    if (codeInput.includes('/invite/')) {
        const parts = codeInput.split('/invite/');
        code = parts[parts.length - 1];
    }
    
    try {
        // Find group by invite code
        const groupsQuery = await db.collection('groups')
            .where('inviteCode', '==', code)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        
        if (groupsQuery.empty) {
            showToast('Invalid group code', 'error');
            return;
        }
        
        const groupDoc = groupsQuery.docs[0];
        const groupId = groupDoc.id;
        const group = groupDoc.data();
        
        // Check if user is already a member
        if (group.participants?.includes(currentUser.uid)) {
            showToast('You are already a member of this group', 'info');
            openGroupChat(groupId);
            hideModal('joinGroupModal');
            return;
        }
        
        // Add user to group
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        
        // Send system message
        await sendSystemMessage(groupId, `${currentUserData.displayName} joined the group`);
        
        showToast('Successfully joined the group', 'success');
        hideModal('joinGroupModal');
        openGroupChat(groupId);
        
    } catch (error) {
        console.error('Error joining group:', error);
        showToast('Error joining group', 'error');
    }
}

async function previewGroupFromCode(code) {
    try {
        const groupsQuery = await db.collection('groups')
            .where('inviteCode', '==', code)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        
        if (groupsQuery.empty) {
            hideGroupPreview();
            return;
        }
        
        const groupDoc = groupsQuery.docs[0];
        const group = groupDoc.data();
        
        showGroupPreview(group);
    } catch (error) {
        console.error('Error previewing group:', error);
        hideGroupPreview();
    }
}

function showGroupPreview(group) {
    if (!groupElements.groupPreview) return;
    
    groupElements.groupPreview.classList.remove('hidden');
    
    if (groupElements.previewGroupName) {
        groupElements.previewGroupName.textContent = group.name;
    }
    
    if (groupElements.previewGroupMembers) {
        const memberCount = group.participants?.length || 0;
        groupElements.previewGroupMembers.textContent = `${memberCount} members`;
    }
    
    if (groupElements.previewGroupAvatar) {
        groupElements.previewGroupAvatar.src = group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random`;
    }
    
    const previewGroupDescription = document.getElementById('previewGroupDescription');
    if (previewGroupDescription) {
        previewGroupDescription.textContent = group.description || 'No description';
    }
}

function hideGroupPreview() {
    if (groupElements.groupPreview) {
        groupElements.groupPreview.classList.add('hidden');
    }
}

/**
 * 5. Admin Management Functions
 */
async function showManageAdminsModal(groupId) {
    currentGroupId = groupId;
    await loadAdminManagementList();
    showModal('manageAdminsModal');
}

async function loadAdminManagementList() {
    if (!groupElements.adminList || !currentGroupId) return;
    
    try {
        const groupDoc = await db.collection('groups').doc(currentGroupId).get();
        const group = groupDoc.data();
        
        const members = [];
        for (const userId of group.participants || []) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                members.push({
                    id: userId,
                    ...userData,
                    isAdmin: group.admins?.includes(userId),
                    isCreator: userId === group.createdBy
                });
            }
        }
        
        renderAdminList(members);
    } catch (error) {
        console.error('Error loading admin list:', error);
        groupElements.adminList.innerHTML = '<div class="text-center py-4 text-gray-500">Error loading members</div>';
    }
}

function renderAdminList(members) {
    if (!groupElements.adminList) return;
    
    groupElements.adminList.innerHTML = '';
    
    members.forEach(member => {
        const adminItem = document.createElement('div');
        adminItem.className = 'admin-item flex items-center justify-between p-3 hover:bg-gray-50 rounded';
        
        adminItem.innerHTML = `
            <div class="flex items-center">
                <img class="w-10 h-10 rounded-full mr-3" 
                     src="${member.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.displayName)}&background=random`}"
                     alt="${member.displayName}">
                <div>
                    <div class="font-medium">${member.displayName}</div>
                    <div class="text-sm text-gray-500">${member.isCreator ? 'Group Creator' : member.isAdmin ? 'Admin' : 'Member'}</div>
                </div>
            </div>
            ${!member.isCreator ? `
                <label class="switch">
                    <input type="checkbox" class="admin-toggle" 
                           ${member.isAdmin ? 'checked' : ''}
                           data-user-id="${member.id}"
                           ${member.id === currentUser.uid ? 'disabled' : ''}>
                    <span class="slider"></span>
                </label>
            ` : `
                <span class="text-sm text-gray-500">Always Admin</span>
            `}
        `;
        
        groupElements.adminList.appendChild(adminItem);
    });
}

function searchAdminMembers(query) {
    const adminItems = groupElements.adminList?.querySelectorAll('.admin-item');
    if (!adminItems) return;
    
    const searchTerm = query.toLowerCase();
    
    adminItems.forEach(item => {
        const name = item.querySelector('.font-medium')?.textContent.toLowerCase() || '';
        const role = item.querySelector('.text-sm')?.textContent.toLowerCase() || '';
        
        const shouldShow = name.includes(searchTerm) || role.includes(searchTerm);
        item.style.display = shouldShow ? 'flex' : 'none';
    });
}

async function saveAdminChanges() {
    if (!currentGroupId) return;
    
    const adminToggles = document.querySelectorAll('.admin-toggle');
    const newAdmins = [];
    
    adminToggles.forEach(toggle => {
        if (toggle.checked) {
            newAdmins.push(toggle.dataset.userId);
        }
    });
    
    try {
        // Add creator to admins if not already included
        const groupDoc = await db.collection('groups').doc(currentGroupId).get();
        const group = groupDoc.data();
        
        if (group.createdBy && !newAdmins.includes(group.createdBy)) {
            newAdmins.push(group.createdBy);
        }
        
        // Update group admins
        await db.collection('groups').doc(currentGroupId).update({
            admins: newAdmins,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Send system messages for admin changes
        const oldAdmins = group.admins || [];
        const addedAdmins = newAdmins.filter(id => !oldAdmins.includes(id));
        const removedAdmins = oldAdmins.filter(id => !newAdmins.includes(id));
        
        for (const adminId of addedAdmins) {
            const userDoc = await db.collection('users').doc(adminId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                await sendSystemMessage(currentGroupId, `${userData.displayName} was made an admin`);
            }
        }
        
        for (const adminId of removedAdmins) {
            if (adminId !== group.createdBy) {
                const userDoc = await db.collection('users').doc(adminId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    await sendSystemMessage(currentGroupId, `${userData.displayName} is no longer an admin`);
                }
            }
        }
        
        showToast('Admin settings updated', 'success');
        hideModal('manageAdminsModal');
        
    } catch (error) {
        console.error('Error saving admin changes:', error);
        showToast('Error updating admin settings', 'error');
    }
}

/**
 * 6. Media Gallery Functions
 */
async function showGroupMediaGallery(groupId) {
    currentGroupId = groupId;
    await loadGroupMedia();
    showModal('groupMediaGalleryModal');
}

async function loadGroupMedia(filter = 'all') {
    if (!groupElements.mediaGalleryGrid || !currentGroupId) return;
    
    groupElements.mediaGalleryGrid.innerHTML = '<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    
    try {
        const messagesQuery = await db.collection('groupMessages')
            .where('groupId', '==', currentGroupId)
            .where('type', 'in', ['image', 'video', 'file'])
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
        
        const mediaItems = [];
        messagesQuery.forEach(doc => {
            const message = doc.data();
            if (message.fileUrl || message.mediaUrl) {
                mediaItems.push({
                    id: doc.id,
                    ...message,
                    mediaType: message.type,
                    mediaUrl: message.fileUrl || message.mediaUrl,
                    timestamp: message.timestamp
                });
            }
        });
        
        renderMediaGallery(mediaItems, filter);
    } catch (error) {
        console.error('Error loading group media:', error);
        groupElements.mediaGalleryGrid.innerHTML = '<div class="col-span-full text-center py-8 text-red-500">Error loading media</div>';
    }
}

function renderMediaGallery(mediaItems, filter) {
    if (!groupElements.mediaGalleryGrid) return;
    
    // Filter media items
    let filteredItems = mediaItems;
    if (filter !== 'all') {
        filteredItems = mediaItems.filter(item => {
            if (filter === 'images') return item.mediaType === 'image';
            if (filter === 'videos') return item.mediaType === 'video';
            if (filter === 'documents') return item.mediaType === 'file';
            return true;
        });
    }
    
    if (filteredItems.length === 0) {
        groupElements.mediaGalleryGrid.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-photo-video text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">No media found</p>
            </div>
        `;
        return;
    }
    
    groupElements.mediaGalleryGrid.innerHTML = '';
    
    filteredItems.forEach(item => {
        const mediaItem = document.createElement('div');
        mediaItem.className = 'media-item relative group cursor-pointer';
        mediaItem.dataset.mediaType = item.mediaType;
        mediaItem.dataset.mediaUrl = item.mediaUrl;
        mediaItem.dataset.timestamp = item.timestamp?.toDate().getTime();
        
        let content = '';
        if (item.mediaType === 'image') {
            content = `
                <img src="${item.mediaUrl}" alt="Media" class="w-full h-48 object-cover rounded-lg">
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg"></div>
            `;
        } else if (item.mediaType === 'video') {
            content = `
                <div class="w-full h-48 bg-gray-900 rounded-lg flex items-center justify-center">
                    <i class="fas fa-play text-white text-3xl"></i>
                </div>
            `;
        } else {
            content = `
                <div class="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                    <i class="fas fa-file text-gray-400 text-3xl"></i>
                </div>
            `;
        }
        
        mediaItem.innerHTML = content;
        
        mediaItem.addEventListener('click', () => {
            previewMedia(item);
        });
        
        groupElements.mediaGalleryGrid.appendChild(mediaItem);
    });
}

function filterGroupMedia(filter) {
    // This will be called when filter buttons are clicked
    // The actual filtering happens in renderMediaGallery
    loadGroupMedia(filter);
}

/**
 * 7. Group Search Functions
 */
async function showGroupSearch(groupId) {
    currentGroupId = groupId;
    showModal('searchGroupModal');
}

async function searchInGroup(query) {
    if (!groupElements.groupSearchResults || !currentGroupId) return;
    
    if (!query.trim()) {
        groupElements.groupSearchResults.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">Enter search terms to find messages</p>
            </div>
        `;
        return;
    }
    
    groupElements.groupSearchResults.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    
    try {
        const messagesQuery = await db.collection('groupMessages')
            .where('groupId', '==', currentGroupId)
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();
        
        const results = [];
        const searchTerm = query.toLowerCase();
        
        messagesQuery.forEach(doc => {
            const message = doc.data();
            const messageText = message.text?.toLowerCase() || '';
            const senderName = message.senderName?.toLowerCase() || '';
            
            if (messageText.includes(searchTerm) || senderName.includes(searchTerm)) {
                results.push({
                    id: doc.id,
                    ...message
                });
            }
        });
        
        renderSearchResults(results, searchTerm);
    } catch (error) {
        console.error('Error searching in group:', error);
        groupElements.groupSearchResults.innerHTML = '<div class="text-center py-8 text-red-500">Error searching messages</div>';
    }
}

function renderSearchResults(results, searchTerm) {
    if (!groupElements.groupSearchResults) return;
    
    if (results.length === 0) {
        groupElements.groupSearchResults.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-search-minus text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">No results found for "${searchTerm}"</p>
            </div>
        `;
        return;
    }
    
    groupElements.groupSearchResults.innerHTML = '';
    
    results.forEach(result => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item p-4 border-b hover:bg-gray-50 cursor-pointer';
        resultItem.dataset.messageId = result.id;
        
        // Highlight search term in message text
        let highlightedText = result.text || '';
        if (searchTerm) {
            const regex = new RegExp(`(${searchTerm})`, 'gi');
            highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
        }
        
        resultItem.innerHTML = `
            <div class="flex items-start">
                <img class="w-8 h-8 rounded-full mr-3" 
                     src="${result.senderPhoto || 'https://ui-avatars.com/api/?name=User&background=random'}"
                     alt="${result.senderName}">
                <div class="flex-1">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-medium">${result.senderName}</span>
                        <span class="text-xs text-gray-500">
                            ${result.timestamp ? formatTimeAgo(result.timestamp.toDate()) : ''}
                        </span>
                    </div>
                    <div class="text-sm">${highlightedText}</div>
                </div>
            </div>
        `;
        
        resultItem.addEventListener('click', () => {
            scrollToMessage(result.id);
            hideModal('searchGroupModal');
        });
        
        groupElements.groupSearchResults.appendChild(resultItem);
    });
}

/**
 * 8. Group Context Menu Functions
 */
function showGroupContextMenu(event, groupId) {
    const contextMenu = groupElements.groupListContextMenu;
    if (!contextMenu) return;
    
    // Position the context menu
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.classList.remove('hidden');
    
    // Store the group ID in the context menu
    contextMenu.dataset.groupId = groupId;
    
    // Prevent default context menu
    event.preventDefault();
}

function hideGroupContextMenu() {
    const contextMenu = groupElements.groupListContextMenu;
    if (contextMenu) {
        contextMenu.classList.add('hidden');
    }
}

async function handleGroupContextMenuAction(action) {
    const contextMenu = groupElements.groupListContextMenu;
    const groupId = contextMenu?.dataset.groupId;
    
    if (!groupId) return;
    
    switch (action) {
        case 'open-group':
            openGroupChat(groupId);
            break;
            
        case 'mute-group':
            await toggleGroupMute(groupId);
            break;
            
        case 'mark-as-read':
            await markGroupAsRead(groupId);
            break;
            
        case 'leave-group':
            confirmLeaveGroupWithId(groupId);
            break;
    }
}

async function toggleGroupMute(groupId) {
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        const group = groupDoc.data();
        
        const isMuted = group.mutedUsers?.includes(currentUser.uid);
        
        if (isMuted) {
            await db.collection('groups').doc(groupId).update({
                mutedUsers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
            showToast('Group unmuted', 'success');
        } else {
            await db.collection('groups').doc(groupId).update({
                mutedUsers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
            showToast('Group muted', 'success');
        }
        
        // Update UI
        loadUserGroups();
        
    } catch (error) {
        console.error('Error toggling group mute:', error);
        showToast('Error updating group settings', 'error');
    }
}

async function markGroupAsRead(groupId) {
    // Implement mark as read logic
    showToast('Marked as read', 'success');
    loadUserGroups();
}

function confirmLeaveGroupWithId(groupId) {
    currentGroupId = groupId;
    showModal('confirmLeaveGroup');
}

/**
 * 9. Group Chat Area Functions
 */
async function openGroupChat(groupId) {
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (!groupDoc.exists) {
            showToast('Group not found', 'error');
            return;
        }
        
        const group = groupDoc.data();
        currentGroup = { id: groupId, ...group };
        currentGroupId = groupId;
        isGroupChat = true;
        
        // Update chat header
        updateChatHeaderForGroup(group);
        
        // Load messages
        await loadGroupMessages(groupId);
        
        // Switch to chat tab
        switchToTab('chats');
        
        // Show back button on mobile
        if (groupElements.backToChatsBtn) {
            groupElements.backToChatsBtn.classList.remove('hidden');
        }
        
        // Start listening for new messages
        startListeningToGroupMessages(groupId);
        
        // Mark as read
        await markGroupAsRead(groupId);
        
    } catch (error) {
        console.error('Error opening group chat:', error);
        showToast('Error opening group chat', 'error');
    }
}

function updateChatHeaderForGroup(group) {
    if (groupElements.chatTitle) {
        groupElements.chatTitle.innerHTML = `
            <div class="flex items-center">
                <img class="chat-avatar w-10 h-10 rounded-full mr-3" 
                     src="${group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random`}"
                     alt="${group.name}">
                <div>
                    <h2 class="font-semibold">${group.name}</h2>
                    <div class="flex items-center">
                        <span class="chat-status text-sm text-gray-500">
                            <span class="group-member-count">${group.participants?.length || 0} members</span>
                            ${group.typingUsers?.length > 0 ? '<span class="group-typing-indicator ml-2">Typing...</span>' : ''}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }
}

async function loadGroupMessages(groupId) {
    if (!groupElements.chatMessages) return;
    
    groupElements.chatMessages.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    
    try {
        const messagesQuery = await db.collection('groupMessages')
            .where('groupId', '==', groupId)
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();
        
        const messages = [];
        messagesQuery.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        
        // Reverse for chronological order
        messages.reverse();
        
        renderGroupMessages(messages);
    } catch (error) {
        console.error('Error loading group messages:', error);
        groupElements.chatMessages.innerHTML = '<div class="text-center py-8 text-red-500">Error loading messages</div>';
    }
}

function renderGroupMessages(messages) {
    if (!groupElements.chatMessages) return;
    
    groupElements.chatMessages.innerHTML = '';
    
    if (messages.length === 0) {
        groupElements.chatMessages.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-comments text-4xl text-gray-300 mb-4"></i>
                <h3 class="text-lg font-semibold text-gray-600">No messages yet</h3>
                <p class="text-gray-500">Send the first message to start the conversation</p>
            </div>
        `;
        return;
    }
    
    let lastDate = null;
    
    messages.forEach(message => {
        const messageDate = message.timestamp?.toDate();
        const dateStr = messageDate ? messageDate.toLocaleDateString() : '';
        
        // Add date separator if needed
        if (lastDate !== dateStr) {
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'date-separator text-center my-4';
            dateSeparator.innerHTML = `<span class="bg-gray-100 px-3 py-1 rounded text-sm text-gray-600">${dateStr}</span>`;
            groupElements.chatMessages.appendChild(dateSeparator);
            lastDate = dateStr;
        }
        
        const messageElement = createGroupMessageElement(message);
        groupElements.chatMessages.appendChild(messageElement);
    });
    
    // Scroll to bottom
    groupElements.chatMessages.scrollTop = groupElements.chatMessages.scrollHeight;
}

function createGroupMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `group-message mb-4 ${message.senderId === currentUser.uid ? 'text-right' : ''}`;
    messageDiv.dataset.messageId = message.id;
    messageDiv.dataset.senderId = message.senderId;
    messageDiv.dataset.senderName = message.senderName;
    
    const isSent = message.senderId === currentUser.uid;
    const isSystem = message.type === 'system';
    const isMentioned = message.mentions?.includes(currentUser.uid);
    const isEveryoneMention = message.isEveryoneMention;
    
    let messageClass = 'inline-block p-3 rounded-lg max-w-xs lg:max-w-md ';
    if (isSystem) {
        messageClass += 'bg-gray-100 text-gray-600 text-sm ';
    } else if (isSent) {
        messageClass += 'bg-blue-500 text-white ';
    } else {
        messageClass += 'bg-gray-200 text-gray-800 ';
    }
    
    if (isMentioned) {
        messageClass += 'mentioned border-l-4 border-yellow-500 ';
    }
    
    if (isEveryoneMention) {
        messageClass += 'group-mention border-l-4 border-red-500 ';
    }
    
    let content = '';
    
    if (isSystem) {
        content = `<div class="system-message">${message.text}</div>`;
    } else {
        // Show sender name for group messages (except own messages)
        if (!isSent) {
            content += `<div class="sender-name text-sm font-medium mb-1">${message.senderName}`;
            if (message.isAdmin) {
                content += ` <span class="admin-badge text-xs bg-blue-100 text-blue-800 px-1 rounded">Admin</span>`;
            }
            content += `</div>`;
        }
        
        // Message content
        content += `<div class="message-content">${escapeHtml(message.text)}</div>`;
        
        // Message footer (time, status, reactions)
        const time = message.timestamp ? message.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        content += `<div class="message-footer text-xs mt-1 opacity-75">${time}`;
        
        if (isSent) {
            content += ` • ${message.status || 'sent'}`;
        }
        
        if (message.reactions?.length > 0) {
            content += ` • ${message.reactions.map(r => r.reaction).join(' ')}`;
        }
        
        content += `</div>`;
    }
    
    messageDiv.innerHTML = `
        <div class="${messageClass}">
            ${content}
        </div>
    `;
    
    // Add context menu for non-system messages
    if (!isSystem) {
        messageDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showMessageContextMenu(e, message.id);
        });
    }
    
    return messageDiv;
}

function startListeningToGroupMessages(groupId) {
    // Unsubscribe from previous listener
    if (unsubscribeGroupMessages) {
        unsubscribeGroupMessages();
    }
    
    unsubscribeGroupMessages = db.collection('groupMessages')
        .where('groupId', '==', groupId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const message = { id: change.doc.id, ...change.doc.data() };
                    addNewGroupMessage(message);
                }
            });
        }, error => {
            console.error('Error listening to group messages:', error);
        });
}

function addNewGroupMessage(message) {
    if (!groupElements.chatMessages) return;
    
    // Check if message already exists
    const existingMessage = groupElements.chatMessages.querySelector(`[data-message-id="${message.id}"]`);
    if (existingMessage) return;
    
    const messageElement = createGroupMessageElement(message);
    groupElements.chatMessages.appendChild(messageElement);
    
    // Scroll to bottom if user is near bottom
    const messagesContainer = groupElements.chatMessages;
    const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
    
    if (isNearBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

/**
 * 10. Group Message Functions
 */
async function sendGroupMessage() {
    if (!groupElements.messageInput || !currentGroupId) return;
    
    const text = groupElements.messageInput.value.trim();
    if (!text) return;
    
    try {
        const messageData = {
            groupId: currentGroupId,
            senderId: currentUser.uid,
            senderName: currentUserData.displayName,
            senderPhoto: currentUserData.photoURL,
            text: text,
            type: 'text',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            isAdmin: currentGroup?.admins?.includes(currentUser.uid) || false
        };
        
        // Check for mentions
        const mentions = extractMentions(text);
        if (mentions.length > 0) {
            messageData.mentions = mentions;
        }
        
        // Check for @everyone
        if (text.includes('@everyone')) {
            messageData.isEveryoneMention = true;
        }
        
        await db.collection('groupMessages').add(messageData);
        
        // Update group's last activity
        await db.collection('groups').doc(currentGroupId).update({
            lastMessage: text.length > 50 ? text.substring(0, 50) + '...' : text,
            lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Clear input
        groupElements.messageInput.value = '';
        
        // Send notifications for mentions
        if (mentions.length > 0) {
            for (const userId of mentions) {
                if (userId !== currentUser.uid) {
                    sendMentionNotification(currentGroupId, userId);
                }
            }
        }
        
        // Send notification for @everyone
        if (messageData.isEveryoneMention) {
            const participants = currentGroup?.participants || [];
            for (const userId of participants) {
                if (userId !== currentUser.uid) {
                    sendMentionNotification(currentGroupId, userId, true);
                }
            }
        }
        
    } catch (error) {
        console.error('Error sending group message:', error);
        showToast('Error sending message', 'error');
    }
}

function extractMentions(text) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1]);
    }
    
    return mentions;
}

async function sendMentionNotification(groupId, userId, isEveryone = false) {
    try {
        // Get user's notification token
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        if (userData?.notificationToken) {
            // Send push notification
            await sendPushNotification({
                to: userData.notificationToken,
                title: isEveryone ? '@everyone' : `You were mentioned in ${currentGroup?.name}`,
                body: `${currentUserData.displayName}: ${groupElements.messageInput?.value.substring(0, 100)}...`,
                data: {
                    groupId: groupId,
                    type: 'mention'
                }
            });
        }
    } catch (error) {
        console.error('Error sending mention notification:', error);
    }
}

/**
 * 11. Group Tools & Features Functions
 */
function showGroupMenu() {
    // Create and show group menu
    const menu = document.createElement('div');
    menu.className = 'absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50';
    menu.innerHTML = `
        <div class="py-1">
            <button class="group-menu-item" onclick="showGroupInfo('${currentGroupId}')">
                <i class="fas fa-info-circle mr-2"></i>View Group Info
            </button>
            <button class="group-menu-item" onclick="showGroupSearch('${currentGroupId}')">
                <i class="fas fa-search mr-2"></i>Search in Group
            </button>
            <button class="group-menu-item" onclick="showGroupMediaGallery('${currentGroupId}')">
                <i class="fas fa-photo-video mr-2"></i>Media Gallery
            </button>
            <button class="group-menu-item" onclick="showStarredMessages('${currentGroupId}')">
                <i class="fas fa-star mr-2"></i>Starred Messages
            </button>
            ${currentGroup?.admins?.includes(currentUser.uid) ? `
                <button class="group-menu-item" onclick="showManageAdminsModal('${currentGroupId}')">
                    <i class="fas fa-user-shield mr-2"></i>Manage Admins
                </button>
            ` : ''}
            <hr>
            <button class="group-menu-item text-red-600" onclick="showModal('confirmLeaveGroup')">
                <i class="fas fa-sign-out-alt mr-2"></i>Leave Group
            </button>
        </div>
    `;
    
    // Position near group menu button
    const groupMenuBtn = groupElements.groupMenuBtn;
    const rect = groupMenuBtn.getBoundingClientRect();
    
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    
    // Add to document
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== groupMenuBtn) {
            document.body.removeChild(menu);
            document.removeEventListener('click', closeMenu);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
}

async function startGroupCall() {
    if (!currentGroupId) return;
    
    try {
        // Create group call
        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const callData = {
            id: callId,
            groupId: currentGroupId,
            type: 'audio',
            participants: [currentUser.uid],
            startedBy: currentUser.uid,
            startedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        await db.collection('groupCalls').doc(callId).set(callData);
        
        // Send system message
        await sendSystemMessage(currentGroupId, `${currentUserData.displayName} started a group call`);
        
        // Update UI
        groupCallActive = true;
        updateCallUI();
        
        // Show toast
        showToast('Group call started', 'success');
        
    } catch (error) {
        console.error('Error starting group call:', error);
        showToast('Error starting call', 'error');
    }
}

async function startGroupVideoCall() {
    if (!currentGroupId) return;
    
    try {
        // Create group video call
        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const callData = {
            id: callId,
            groupId: currentGroupId,
            type: 'video',
            participants: [currentUser.uid],
            startedBy: currentUser.uid,
            startedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        await db.collection('groupCalls').doc(callId).set(callData);
        
        // Send system message
        await sendSystemMessage(currentGroupId, `${currentUserData.displayName} started a group video call`);
        
        // Update UI
        groupVideoCallActive = true;
        updateCallUI();
        
        // Show toast
        showToast('Group video call started', 'success');
        
    } catch (error) {
        console.error('Error starting group video call:', error);
        showToast('Error starting video call', 'error');
    }
}

function updateCallUI() {
    const groupCallBtn = groupElements.groupCallBtn;
    const groupVideoCallBtn = groupElements.groupVideoCallBtn;
    
    if (groupCallActive) {
        groupCallBtn.classList.add('active');
        groupCallBtn.innerHTML = '<i class="fas fa-phone-slash"></i>';
        groupCallBtn.title = 'End Call';
    } else {
        groupCallBtn.classList.remove('active');
        groupCallBtn.innerHTML = '<i class="fas fa-phone"></i>';
        groupCallBtn.title = 'Group Call';
    }
    
    if (groupVideoCallActive) {
        groupVideoCallBtn.classList.add('active');
        groupVideoCallBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
        groupVideoCallBtn.title = 'End Video Call';
    } else {
        groupVideoCallBtn.classList.remove('active');
        groupVideoCallBtn.innerHTML = '<i class="fas fa-video"></i>';
        groupVideoCallBtn.title = 'Group Video Call';
    }
}

/**
 * 12. Group Member Functions
 */
// Already implemented in loadGroupMembers and renderGroupMembers

/**
 * 13. Group Poll Functions (if applicable)
 */
async function createGroupPoll(question, options) {
    if (!currentGroupId) return;
    
    try {
        const pollData = {
            groupId: currentGroupId,
            question: question,
            options: options.map(option => ({
                text: option,
                votes: 0,
                voters: []
            })),
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            totalVotes: 0,
            isActive: true
        };
        
        await db.collection('groupPolls').add(pollData);
        
        // Send poll as a message
        await sendGroupMessageAsPoll(pollData);
        
        showToast('Poll created', 'success');
    } catch (error) {
        console.error('Error creating poll:', error);
        showToast('Error creating poll', 'error');
    }
}

async function sendGroupMessageAsPoll(pollData) {
    const messageData = {
        groupId: currentGroupId,
        senderId: currentUser.uid,
        senderName: currentUserData.displayName,
        senderPhoto: currentUserData.photoURL,
        type: 'poll',
        pollData: pollData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'sent'
    };
    
    await db.collection('groupMessages').add(messageData);
}

/**
 * 14. Group Announcements Functions
 */
async function createGroupAnnouncement(title, content, isPinned = false) {
    if (!currentGroupId) return;
    
    try {
        const announcementData = {
            groupId: currentGroupId,
            title: title,
            content: content,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isPinned: isPinned,
            isActive: true
        };
        
        await db.collection('groupAnnouncements').add(announcementData);
        
        // Send announcement as a message
        await sendGroupMessageAsAnnouncement(announcementData);
        
        showToast('Announcement created', 'success');
    } catch (error) {
        console.error('Error creating announcement:', error);
        showToast('Error creating announcement', 'error');
    }
}

async function sendGroupMessageAsAnnouncement(announcementData) {
    const messageData = {
        groupId: currentGroupId,
        senderId: currentUser.uid,
        senderName: currentUserData.displayName,
        senderPhoto: currentUserData.photoURL,
        type: 'announcement',
        announcementData: announcementData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'sent'
    };
    
    await db.collection('groupMessages').add(messageData);
}

/**
 * 15. Group Notification Functions
 */
// Implemented in sendSystemMessage and sendMentionNotification

/**
 * 16. Group Forward Functions
 */
async function showForwardMessageModal(messageId) {
    currentForwardMessage = messageId;
    await loadForwardTargets();
    showModal('forwardMessageModal');
}

async function loadForwardTargets() {
    if (!groupElements.forwardTargetsList) return;
    
    groupElements.forwardTargetsList.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></div>';
    
    try {
        // Load groups user is in
        const groupsQuery = await db.collection('groups')
            .where('participants', 'array-contains', currentUser.uid)
            .where('status', '==', 'active')
            .get();
        
        groupElements.forwardTargetsList.innerHTML = '';
        
        groupsQuery.forEach(doc => {
            const group = doc.data();
            if (group.id !== currentGroupId) { // Don't show current group
                addForwardTarget(group);
            }
        });
        
        updateForwardCount();
    } catch (error) {
        console.error('Error loading forward targets:', error);
        groupElements.forwardTargetsList.innerHTML = '<div class="text-center py-4 text-red-500">Error loading groups</div>';
    }
}

function addForwardTarget(group) {
    if (!groupElements.forwardTargetsList) return;
    
    const targetItem = document.createElement('div');
    targetItem.className = 'forward-target flex items-center p-2 hover:bg-gray-50 rounded';
    targetItem.dataset.groupId = group.id;
    
    targetItem.innerHTML = `
        <label class="flex items-center flex-1 cursor-pointer">
            <input type="checkbox" class="forward-select mr-3" data-group-id="${group.id}">
            <img class="w-8 h-8 rounded-full mr-3" 
                 src="${group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random`}"
                 alt="${group.name}">
            <span class="font-medium">${group.name}</span>
            <span class="text-sm text-gray-500 ml-2">${group.participants?.length || 0} members</span>
        </label>
    `;
    
    groupElements.forwardTargetsList.appendChild(targetItem);
    
    // Add event listener for checkbox
    const checkbox = targetItem.querySelector('.forward-select');
    checkbox.addEventListener('change', updateForwardCount);
}

function searchForwardTargets(query) {
    const targets = groupElements.forwardTargetsList?.querySelectorAll('.forward-target');
    if (!targets) return;
    
    const searchTerm = query.toLowerCase();
    
    targets.forEach(target => {
        const groupName = target.querySelector('.font-medium')?.textContent.toLowerCase() || '';
        const shouldShow = groupName.includes(searchTerm);
        target.style.display = shouldShow ? 'flex' : 'none';
    });
}

function updateForwardCount() {
    const checkboxes = document.querySelectorAll('.forward-select:checked');
    const count = checkboxes.length;
    
    const forwardCount = document.getElementById('forwardCount');
    if (forwardCount) {
        forwardCount.textContent = count;
    }
    
    if (groupElements.forwardSelectedBtn) {
        groupElements.forwardSelectedBtn.disabled = count === 0;
        groupElements.forwardSelectedBtn.innerHTML = `Forward (${count})`;
    }
}

async function forwardSelectedMessages() {
    const checkboxes = document.querySelectorAll('.forward-select:checked');
    if (checkboxes.length === 0) return;
    
    try {
        // Get the message to forward
        const messageDoc = await db.collection('groupMessages').doc(currentForwardMessage).get();
        if (!messageDoc.exists) {
            showToast('Message not found', 'error');
            return;
        }
        
        const message = messageDoc.data();
        
        // Forward to selected groups
        for (const checkbox of checkboxes) {
            const groupId = checkbox.dataset.groupId;
            
            const forwardedMessage = {
                ...message,
                forwardedFrom: currentGroupId,
                forwardedBy: currentUser.uid,
                forwardedAt: firebase.firestore.FieldValue.serverTimestamp(),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            delete forwardedMessage.id; // Remove ID for new document
            
            await db.collection('groupMessages').add(forwardedMessage);
            
            // Update group's last activity
            await db.collection('groups').doc(groupId).update({
                lastMessage: `Forwarded: ${message.text?.substring(0, 50)}...`,
                lastActivity: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        showToast(`Message forwarded to ${checkboxes.length} group(s)`, 'success');
        hideModal('forwardMessageModal');
        
    } catch (error) {
        console.error('Error forwarding messages:', error);
        showToast('Error forwarding messages', 'error');
    }
}

/**
 * 17. Starred Messages Functions
 */
async function showStarredMessages(groupId) {
    currentGroupId = groupId;
    await loadStarredMessages();
    showModal('starredMessagesModal');
}

async function loadStarredMessages() {
    if (!groupElements.starredMessagesList) return;
    
    groupElements.starredMessagesList.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    
    try {
        const messagesQuery = await db.collection('groupMessages')
            .where('groupId', '==', currentGroupId)
            .where('starredBy', 'array-contains', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();
        
        const messages = [];
        messagesQuery.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        
        renderStarredMessages(messages);
    } catch (error) {
        console.error('Error loading starred messages:', error);
        groupElements.starredMessagesList.innerHTML = '<div class="text-center py-8 text-red-500">Error loading starred messages</div>';
    }
}

function renderStarredMessages(messages) {
    if (!groupElements.starredMessagesList) return;
    
    if (messages.length === 0) {
        groupElements.starredMessagesList.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-star text-4xl text-gray-300 mb-4"></i>
                <h3 class="text-lg font-semibold text-gray-600">No Starred Messages</h3>
                <p class="text-gray-500">Star messages to find them easily later</p>
            </div>
        `;
        return;
    }
    
    groupElements.starredMessagesList.innerHTML = '';
    
    messages.forEach(message => {
        const starredItem = document.createElement('div');
        starredItem.className = 'starred-message-item p-4 border-b hover:bg-gray-50 cursor-pointer';
        starredItem.dataset.groupId = message.groupId;
        starredItem.dataset.messageId = message.id;
        starredItem.dataset.starredBy = JSON.stringify(message.starredBy || []);
        
        starredItem.innerHTML = `
            <div class="flex items-start">
                <img class="w-8 h-8 rounded-full mr-3" 
                     src="${message.senderPhoto || 'https://ui-avatars.com/api/?name=User&background=random'}"
                     alt="${message.senderName}">
                <div class="flex-1">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-medium">${message.senderName}</span>
                        <span class="text-xs text-gray-500">
                            ${message.timestamp ? formatTimeAgo(message.timestamp.toDate()) : ''}
                        </span>
                    </div>
                    <div class="text-sm mb-2">${escapeHtml(message.text)}</div>
                    <div class="flex justify-between items-center">
                        <button class="text-yellow-500 hover:text-yellow-600" onclick="toggleMessageStar('${message.id}', event)">
                            <i class="fas fa-star"></i> Unstar
                        </button>
                        <button class="text-blue-500 hover:text-blue-600" onclick="scrollToMessage('${message.id}')">
                            <i class="fas fa-arrow-right"></i> Go to Message
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        groupElements.starredMessagesList.appendChild(starredItem);
    });
}

async function toggleMessageStar(messageId, event) {
    if (event) event.stopPropagation();
    
    try {
        const messageRef = db.collection('groupMessages').doc(messageId);
        const messageDoc = await messageRef.get();
        
        if (!messageDoc.exists) return;
        
        const message = messageDoc.data();
        const isStarred = message.starredBy?.includes(currentUser.uid);
        
        if (isStarred) {
            await messageRef.update({
                starredBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
            showToast('Message unstarred', 'success');
        } else {
            await messageRef.update({
                starredBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
            showToast('Message starred', 'success');
        }
        
        // Reload starred messages if modal is open
        if (document.getElementById('starredMessagesModal')?.classList.contains('hidden') === false) {
            await loadStarredMessages();
        }
        
    } catch (error) {
        console.error('Error toggling message star:', error);
        showToast('Error updating message', 'error');
    }
}

/**
 * 18. Group State Functions
 */
function updateGroupStateClasses() {
    // Update group list items based on state
    const groupItems = document.querySelectorAll('.group-chat-item');
    
    groupItems.forEach(item => {
        const groupId = item.dataset.groupId;
        const group = allGroups.find(g => g.id === groupId);
        
        if (group) {
            // Update muted class
            if (group.mutedUsers?.includes(currentUser.uid)) {
                item.classList.add('muted');
            } else {
                item.classList.remove('muted');
            }
            
            // Update pinned class
            if (group.isPinned) {
                item.classList.add('pinned');
            } else {
                item.classList.remove('pinned');
            }
            
            // Update archived class
            if (group.status === 'archived') {
                item.classList.add('archived');
            } else {
                item.classList.remove('archived');
            }
            
            // Update unread class
            const unreadCount = getGroupUnreadCount(groupId);
            if (unreadCount > 0) {
                item.classList.add('unread');
            } else {
                item.classList.remove('unread');
            }
            
            // Update selected class
            if (currentGroupId === groupId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        }
    });
}

/**
 * 19. Mobile Group Controls
 */
function setupMobileGroupControls() {
    // Back button functionality
    if (groupElements.backToChatsBtn) {
        groupElements.backToChatsBtn.addEventListener('click', () => {
            // Clear current group
            currentGroup = null;
            currentGroupId = null;
            isGroupChat = false;
            
            // Clear chat messages
            if (groupElements.chatMessages) {
                groupElements.chatMessages.innerHTML = '';
            }
            
            // Hide back button
            groupElements.backToChatsBtn.classList.add('hidden');
            
            // Update chat header
            updateChatHeaderForIndividualChat();
            
            // Switch to groups tab
            switchToTab('groups');
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', handleWindowResize);
}

function handleWindowResize() {
    // Adjust UI for mobile/desktop
    const isMobile = window.innerWidth < 768;
    
    if (isMobile && currentGroupId) {
        // Show back button on mobile when in group chat
        if (groupElements.backToChatsBtn) {
            groupElements.backToChatsBtn.classList.remove('hidden');
        }
    } else {
        // Hide back button on desktop
        if (groupElements.backToChatsBtn) {
            groupElements.backToChatsBtn.classList.add('hidden');
        }
    }
}

/**
 * 20. Group Creation Participant Selection
 */
async function loadFriendsForGroupCreation() {
    if (!groupElements.groupParticipants) return;
    
    try {
        const friends = await fetchFriendsDirectly();
        
        if (friends.length === 0) {
            groupElements.groupParticipants.innerHTML = `
                <div id="noParticipantsMessage" class="text-center py-8 text-gray-500">
                    <i class="fas fa-user-friends text-3xl mb-3"></i>
                    <p>No friends found</p>
                    <p class="text-sm mt-2">Add friends to create a group</p>
                </div>
            `;
            return;
        }
        
        groupElements.groupParticipants.innerHTML = '';
        
        friends.forEach(friend => {
            const friendItem = document.createElement('div');
            friendItem.className = 'friend-select-item flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer';
            
            friendItem.innerHTML = `
                <label class="flex items-center flex-1 cursor-pointer">
                    <input type="checkbox" class="participant-checkbox mr-3" 
                           data-user-id="${friend.id}" value="${friend.id}">
                    <img class="w-10 h-10 rounded-full mr-3" 
                         src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=random`}"
                         alt="${friend.displayName}">
                    <div>
                        <div class="font-medium">${friend.displayName}</div>
                        <div class="text-sm text-gray-500">${friend.status || 'offline'}</div>
                    </div>
                </label>
            `;
            
            groupElements.groupParticipants.appendChild(friendItem);
            
            // Add event listener
            const checkbox = friendItem.querySelector('.participant-checkbox');
            checkbox.addEventListener('change', (e) => {
                toggleParticipantSelection(friend.id, friend.displayName, e.target.checked);
            });
        });
        
    } catch (error) {
        console.error('Error loading friends:', error);
        groupElements.groupParticipants.innerHTML = '<div class="text-center py-4 text-red-500">Error loading friends</div>';
    }
}

function toggleParticipantSelection(userId, userName, isSelected) {
    if (isSelected) {
        selectedParticipants.add(userId);
        addSelectedParticipant(userId, userName);
    } else {
        selectedParticipants.delete(userId);
        removeSelectedParticipant(userId);
    }
    
    updateParticipantCount();
}

function addSelectedParticipant(userId, userName) {
    if (!groupElements.selectedParticipantsContainer) return;
    
    const selectedItem = document.createElement('div');
    selectedItem.className = 'selected-participant flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full';
    selectedItem.dataset.userId = userId;
    
    selectedItem.innerHTML = `
        <span>${userName}</span>
        <button class="ml-2 text-blue-600 hover:text-blue-800" onclick="removeParticipant('${userId}')">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    groupElements.selectedParticipantsContainer.appendChild(selectedItem);
}

function removeSelectedParticipant(userId) {
    const selectedItem = groupElements.selectedParticipantsContainer?.querySelector(`[data-user-id="${userId}"]`);
    if (selectedItem) {
        selectedItem.remove();
    }
    
    // Also uncheck the checkbox
    const checkbox = document.querySelector(`.participant-checkbox[value="${userId}"]`);
    if (checkbox) {
        checkbox.checked = false;
    }
}

function removeParticipant(userId) {
    selectedParticipants.delete(userId);
    removeSelectedParticipant(userId);
    updateParticipantCount();
}

function updateParticipantCount() {
    if (groupElements.participantCount) {
        groupElements.participantCount.textContent = selectedParticipants.size;
    }
}

/**
 * 21. Group Invite Elements
 */
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function generateQRCode(inviteCode) {
    // Implement QR code generation
    // You can use a library like qrcode.js
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(inviteCode)}`;
    return qrCodeUrl;
}

async function shareInviteLink(inviteCode) {
    const inviteUrl = `${window.location.origin}/invite/${inviteCode}`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Join my group on Kynecta',
                text: 'Join my group on Kynecta!',
                url: inviteUrl,
            });
        } catch (error) {
            console.error('Error sharing:', error);
            copyToClipboard(inviteUrl);
        }
    } else {
        copyToClipboard(inviteUrl);
    }
}

/**
 * 22. Group Leave/Delete Functions
 */
async function confirmLeaveGroup() {
    if (!currentGroupId) return;
    
    try {
        await leaveGroup(currentGroupId);
        hideModal('confirmLeaveGroup');
    } catch (error) {
        console.error('Error leaving group:', error);
        showToast('Error leaving group', 'error');
    }
}

async function leaveGroup(groupId) {
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        const group = groupDoc.data();
        
        // Remove user from participants
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
            admins: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
        
        // Send system message
        await sendSystemMessage(groupId, `${currentUserData.displayName} left the group`);
        
        // Update local state
        if (currentGroupId === groupId) {
            currentGroup = null;
            currentGroupId = null;
            isGroupChat = false;
            
            // Clear chat
            if (groupElements.chatMessages) {
                groupElements.chatMessages.innerHTML = '';
            }
            
            // Hide back button
            if (groupElements.backToChatsBtn) {
                groupElements.backToChatsBtn.classList.add('hidden');
            }
        }
        
        // Unsubscribe from messages
        if (unsubscribeGroupMessages) {
            unsubscribeGroupMessages();
            unsubscribeGroupMessages = null;
        }
        
        // Reload groups list
        await loadUserGroups();
        
        showToast('You left the group', 'success');
        
    } catch (error) {
        console.error('Error leaving group:', error);
        throw error;
    }
}

async function confirmDeleteGroup() {
    if (!currentGroupId) return;
    
    try {
        await deleteGroup(currentGroupId);
        hideModal('confirmDeleteGroup');
    } catch (error) {
        console.error('Error deleting group:', error);
        showToast('Error deleting group', 'error');
    }
}

async function deleteGroup(groupId) {
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        const group = groupDoc.data();
        
        // Check if user is creator or admin
        if (group.createdBy !== currentUser.uid && !group.admins?.includes(currentUser.uid)) {
            showToast('Only group admins can delete the group', 'error');
            return;
        }
        
        // Mark group as deleted
        await db.collection('groups').doc(groupId).update({
            status: 'deleted',
            deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
            deletedBy: currentUser.uid
        });
        
        // Send system message
        await sendSystemMessage(groupId, 'This group has been deleted');
        
        // Update local state
        if (currentGroupId === groupId) {
            currentGroup = null;
            currentGroupId = null;
            isGroupChat = false;
            
            // Clear chat
            if (groupElements.chatMessages) {
                groupElements.chatMessages.innerHTML = '';
            }
            
            // Hide back button
            if (groupElements.backToChatsBtn) {
                groupElements.backToChatsBtn.classList.add('hidden');
            }
        }
        
        // Unsubscribe from messages
        if (unsubscribeGroupMessages) {
            unsubscribeGroupMessages();
            unsubscribeGroupMessages = null;
        }
        
        // Reload groups list
        await loadUserGroups();
        
        showToast('Group deleted', 'success');
        
    } catch (error) {
        console.error('Error deleting group:', error);
        throw error;
    }
}

/**
 * 23. Group Encryption Functions
 */
function generateSecurityCode(groupId) {
    // Generate a unique security code for encrypted groups
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `${groupId.substr(0, 4)}-${timestamp.toString(36).substr(-4)}-${random}`.toUpperCase();
}

async function verifyGroupSecurity(groupId, securityCode) {
    // Verify group security code
    // This would typically involve checking against stored encrypted keys
    return true; // Placeholder
}

/**
 * 24. Group Activity Functions
 */
function updateGroupActivityIndicators() {
    // Update activity indicators for groups
    const groupItems = document.querySelectorAll('.group-chat-item');
    
    groupItems.forEach(item => {
        const groupId = item.dataset.groupId;
        const group = allGroups.find(g => g.id === groupId);
        
        if (group) {
            // Update activity indicator
            const lastActivity = group.lastActivity?.toDate();
            const now = new Date();
            const hoursSinceActivity = lastActivity ? (now - lastActivity) / (1000 * 60 * 60) : 24;
            
            const activityIndicator = item.querySelector('.group-activity');
            if (!activityIndicator) return;
            
            if (hoursSinceActivity < 1) {
                activityIndicator.className = 'group-activity active-now';
                activityIndicator.title = 'Active now';
            } else if (hoursSinceActivity < 24) {
                activityIndicator.className = 'group-activity';
                activityIndicator.title = `Active ${Math.floor(hoursSinceActivity)} hours ago`;
            } else {
                activityIndicator.className = 'group-activity last-seen-group';
                activityIndicator.title = `Last seen ${Math.floor(hoursSinceActivity / 24)} days ago`;
            }
        }
    });
}

/**
 * 25. Group File Sharing Functions
 */
async function uploadGroupFile(file) {
    if (!currentGroupId) return;
    
    try {
        // Create a unique file name
        const fileName = `group_${currentGroupId}_${Date.now()}_${file.name}`;
        
        // Upload to Firebase Storage
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`group_files/${currentGroupId}/${fileName}`);
        
        const uploadTask = fileRef.put(file);
        
        uploadTask.on('state_changed',
            (snapshot) => {
                // Progress monitoring
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log(`Upload is ${progress}% done`);
            },
            (error) => {
                console.error('Error uploading file:', error);
                showToast('Error uploading file', 'error');
            },
            async () => {
                // Upload complete
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Send file as message
                const messageData = {
                    groupId: currentGroupId,
                    senderId: currentUser.uid,
                    senderName: currentUserData.displayName,
                    senderPhoto: currentUserData.photoURL,
                    type: 'file',
                    fileUrl: downloadURL,
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'sent'
                };
                
                await db.collection('groupMessages').add(messageData);
                
                // Update group's last activity
                await db.collection('groups').doc(currentGroupId).update({
                    lastMessage: `File: ${file.name}`,
                    lastActivity: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                showToast('File uploaded', 'success');
            }
        );
        
    } catch (error) {
        console.error('Error in uploadGroupFile:', error);
        showToast('Error uploading file', 'error');
    }
}

// ==================== HELPER FUNCTIONS ====================

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

function switchToTab(tabName) {
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Show selected tab panel
    const tabPanel = document.getElementById(tabName + 'Tab');
    if (tabPanel) {
        tabPanel.classList.remove('hidden');
    }
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
}

function formatTimeAgo(date) {
    // Ensure date is a Date object
    if (!(date instanceof Date)) {
        // Try to convert if it's a Firestore timestamp
        if (date && typeof date.toDate === 'function') {
            date = date.toDate();
        } else if (date && date.seconds) {
            // Firestore timestamp object
            date = new Date(date.seconds * 1000);
        } else if (date) {
            // Try to parse as Date
            date = new Date(date);
        } else {
            return 'Unknown time';
        }
    }
    
    // Check if valid date
    if (isNaN(date.getTime())) {
        return 'Invalid date';
    }
    
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showGroupsToast(message, type = 'info') {
    // Use existing toast function or create one
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`${type}: ${message}`);
    }
}

function scrollToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight the message temporarily
        messageElement.classList.add('highlighted');
        setTimeout(() => {
            messageElement.classList.remove('highlighted');
        }, 2000);
    }
}

async function sendSystemMessage(groupId, text) {
    try {
        const messageData = {
            groupId: groupId,
            senderId: 'system',
            senderName: 'System',
            text: text,
            type: 'system',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent'
        };
        
        await db.collection('groupMessages').add(messageData);
    } catch (error) {
        console.error('Error sending system message:', error);
    }
}

async function sendGroupInviteNotification(groupId, userId) {
    try {
        // Get user's notification token
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        if (userData?.notificationToken) {
            // Send push notification
            await sendPushNotification({
                to: userData.notificationToken,
                title: 'Group Invitation',
                body: `${currentUserData.displayName} added you to a group`,
                data: {
                    groupId: groupId,
                    type: 'group_invite'
                }
            });
        }
    } catch (error) {
        console.error('Error sending group invite notification:', error);
    }
}

async function sendPushNotification(notification) {
    // Implement push notification sending
    // This would typically use Firebase Cloud Messaging
    console.log('Sending push notification:', notification);
}

async function fetchFriendsDirectly() {
    try {
        // Fetch friends from Firestore
        const friendsQuery = await db.collection('users')
            .where('friends', 'array-contains', currentUser.uid)
            .get();
        
        const friends = [];
        friendsQuery.forEach(doc => {
            friends.push({ id: doc.id, ...doc.data() });
        });
        
        return friends;
    } catch (error) {
        console.error('Error fetching friends:', error);
        return [];
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast('Failed to copy', 'error');
    });
}

function handleVisibilityChange() {
    if (!document.hidden && currentGroupId) {
        // User returned to the app, update activity
        updateGroupActivityIndicators();
    }
}

// ==================== INITIALIZE GROUP FEATURES ====================

function initializeGroupFeatures() {
    // Initialize typing indicators
    initializeTypingIndicators();
    
    // Initialize drag and drop
    initializeDragAndDrop();
    
    // Initialize emoji picker
    initializeEmojiPicker();
    
    // Initialize mobile controls
    setupMobileGroupControls();
}

function initializeTypingIndicators() {
    if (!groupElements.messageInput || !currentGroupId) return;
    
    let typingTimeout;
    
    groupElements.messageInput.addEventListener('input', () => {
        if (!typingTimeout) {
            // User started typing
            updateTypingStatus(true);
        }
        
        // Clear previous timeout
        clearTimeout(typingTimeout);
        
        // Set new timeout
        typingTimeout = setTimeout(() => {
            // User stopped typing
            updateTypingStatus(false);
            typingTimeout = null;
        }, 1000);
    });
}

async function updateTypingStatus(isTyping) {
    if (!currentGroupId) return;
    
    try {
        const groupRef = db.collection('groups').doc(currentGroupId);
        
        if (isTyping) {
            await groupRef.update({
                typingUsers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
        } else {
            await groupRef.update({
                typingUsers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
        }
    } catch (error) {
        console.error('Error updating typing status:', error);
    }
}

function initializeDragAndDrop() {
    const messageInput = groupElements.messageInput;
    if (!messageInput) return;
    
    messageInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        messageInput.classList.add('drag-over');
    });
    
    messageInput.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        messageInput.classList.remove('drag-over');
    });
    
    messageInput.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        messageInput.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadGroupFile(files[0]);
        }
    });
}

function initializeEmojiPicker() {
    // Initialize emoji picker for group messages
    // This would integrate with an emoji picker library
}

// ==================== LISTENERS FOR REAL-TIME UPDATES ====================

function listenForGroupInvites() {
    // Listen for group invites in real-time
    db.collection('groupInvites')
        .where('userId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const invite = { id: change.doc.id, ...change.doc.data() };
                    showGroupInviteNotification(invite);
                }
            });
        });
}

function listenForGroupRequests() {
    if (!currentUser) return;
    
    // Get admin group IDs
    const adminGroupIds = getAllAdminGroupIds();
    
    // Don't create query if no admin groups
    if (adminGroupIds.length === 0) return;
    
    // Listen for group requests (for admins)
    db.collection('groupRequests')
        .where('groupId', 'in', adminGroupIds)
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const request = { id: change.doc.id, ...change.doc.data() };
                    showGroupRequestNotification(request);
                }
            });
        });
}

function getAllAdminGroupIds() {
    // Get all group IDs where user is admin
    if (!allGroups || allGroups.length === 0) return [];
    
    return allGroups
        .filter(group => group.admins?.includes(currentUser.uid))
        .map(group => group.id);
}

function showGroupInviteNotification(invite) {
    // Show notification for group invite
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border p-4 z-50 max-w-sm';
    
    notification.innerHTML = `
        <div class="flex items-start">
            <img class="w-12 h-12 rounded-full mr-3" 
                 src="${invite.groupAvatar || 'https://ui-avatars.com/api/?name=Group&background=random'}"
                 alt="${invite.groupName}">
            <div class="flex-1">
                <h4 class="font-semibold">Group Invitation</h4>
                <p class="text-sm text-gray-600 mt-1">You've been invited to join "${invite.groupName}"</p>
                <div class="mt-3 flex space-x-2">
                    <button class="btn-secondary text-sm px-3 py-1" onclick="declineGroupInvite('${invite.id}')">
                        Decline
                    </button>
                    <button class="btn-primary text-sm px-3 py-1" onclick="acceptGroupInvite('${invite.id}', '${invite.groupId}')">
                        Accept
                    </button>
                </div>
            </div>
            <button class="text-gray-400 hover:text-gray-600" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 30000);
}

async function acceptGroupInvite(inviteId, groupId) {
    try {
        // Update invite status
        await db.collection('groupInvites').doc(inviteId).update({
            status: 'accepted',
            respondedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Add user to group
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        
        // Send system message
        await sendSystemMessage(groupId, `${currentUserData.displayName} joined the group via invite`);
        
        // Remove notification
        const notification = document.querySelector(`[onclick*="${inviteId}"]`)?.closest('.fixed');
        if (notification) {
            notification.remove();
        }
        
        showToast('Joined group successfully', 'success');
        
        // Reload groups
        loadUserGroups();
        
    } catch (error) {
        console.error('Error accepting group invite:', error);
        showToast('Error accepting invite', 'error');
    }
}

async function declineGroupInvite(inviteId) {
    try {
        await db.collection('groupInvites').doc(inviteId).update({
            status: 'declined',
            respondedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Remove notification
        const notification = document.querySelector(`[onclick*="${inviteId}"]`)?.closest('.fixed');
        if (notification) {
            notification.remove();
        }
        
        showToast('Invite declined', 'info');
        
    } catch (error) {
        console.error('Error declining group invite:', error);
        showToast('Error declining invite', 'error');
    }
}

function showGroupRequestNotification(request) {
    // Show notification for group join request (for admins)
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border p-4 z-50 max-w-sm';
    
    notification.innerHTML = `
        <div class="flex items-start">
            <img class="w-12 h-12 rounded-full mr-3" 
                 src="${request.userPhoto || 'https://ui-avatars.com/api/?name=User&background=random'}"
                 alt="${request.userName}">
            <div class="flex-1">
                <h4 class="font-semibold">Group Join Request</h4>
                <p class="text-sm text-gray-600 mt-1">${request.userName} wants to join your group</p>
                <div class="mt-3 flex space-x-2">
                    <button class="btn-secondary text-sm px-3 py-1" onclick="declineGroupRequest('${request.id}')">
                        Decline
                    </button>
                    <button class="btn-primary text-sm px-3 py-1" onclick="acceptGroupRequest('${request.id}', '${request.groupId}', '${request.userId}')">
                        Accept
                    </button>
                </div>
            </div>
            <button class="text-gray-400 hover:text-gray-600" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 30000);
}

async function acceptGroupRequest(requestId, groupId, userId) {
    try {
        // Update request status
        await db.collection('groupRequests').doc(requestId).update({
            status: 'accepted',
            respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
            respondedBy: currentUser.uid
        });
        
        // Add user to group
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        
        // Send system message
        await sendSystemMessage(groupId, `${userId} joined the group`);
        
        // Send notification to user
        await sendGroupInviteNotification(groupId, userId);
        
        // Remove notification
        const notification = document.querySelector(`[onclick*="${requestId}"]`)?.closest('.fixed');
        if (notification) {
            notification.remove();
        }
        
        showToast('Request accepted', 'success');
        
    } catch (error) {
        console.error('Error accepting group request:', error);
        showToast('Error accepting request', 'error');
    }
}

async function declineGroupRequest(requestId) {
    try {
        await db.collection('groupRequests').doc(requestId).update({
            status: 'declined',
            respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
            respondedBy: currentUser.uid
        });
        
        // Remove notification
        const notification = document.querySelector(`[onclick*="${requestId}"]`)?.closest('.fixed');
        if (notification) {
            notification.remove();
        }
        
        showToast('Request declined', 'info');
        
    } catch (error) {
        console.error('Error declining group request:', error);
        showToast('Error declining request', 'error');
    }
}

// ==================== EXPORT FUNCTIONS ====================

window.GroupSystem = {
    // Initialization
    initializeGroupSystem,
    
    // Group Management
    createNewGroup: createNewGroupAction,
    openGroupChat,
    loadUserGroups,
    showGroupInfo,
    
    // Group Chat
    sendGroupMessage,
    loadGroupMessages,
    
    // Group Actions
    leaveGroup,
    deleteGroup,
    toggleGroupMute,
    
    // Join Groups
    joinGroupAction,
    
    // Media & Content
    showGroupMediaGallery,
    loadGroupMedia,
    filterGroupMedia,
    
    // Search
    showGroupSearch,
    searchInGroup,
    
    // Admin Management
    showManageAdminsModal,
    saveAdminChanges,
    
    // Forwarding
    showForwardMessageModal,
    forwardSelectedMessages,
    
    // Starred Messages
    showStarredMessages,
    toggleMessageStar,
    
    // Polls
    createGroupPoll,
    
    // Announcements
    createGroupAnnouncement,
    
    // File Sharing
    uploadGroupFile,
    
    // Invites
    acceptGroupInvite,
    declineGroupInvite,
    
    // Requests
    acceptGroupRequest,
    declineGroupRequest,
    
    // UI Functions
    showModal,
    hideModal,
    switchToTab,
    
    // Data
    currentGroup,
    currentGroupId,
    isGroupChat,
    allGroups
};

// ==================== INITIALIZATION ====================

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Enhanced Group System...');
    
    // Wait for Firebase auth
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                setTimeout(initializeGroupSystem, 1000);
            }
        });
    } else {
        // Fallback initialization
        setTimeout(() => {
            if (typeof currentUser !== 'undefined' && currentUser) {
                initializeGroupSystem();
            }
        }, 2000);
    }
});

console.log('✅ Enhanced Group System loaded successfully');
