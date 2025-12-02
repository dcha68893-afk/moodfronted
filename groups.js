// ==================== GROUP SYSTEM ====================
// A comprehensive group chat system for Kynecta with WhatsApp-like features

// Group state variables
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

// DOM Elements for groups
const groupChatHeader = document.getElementById('groupChatHeader');
const groupInputArea = document.getElementById('groupInputArea');
const groupMessagesContainer = document.getElementById('groupMessagesContainer');
const groupTitle = document.getElementById('groupTitle');
const groupAvatar = document.getElementById('groupAvatar');
const groupParticipantCount = document.getElementById('groupParticipantCount');
const noGroupMessagesMessage = document.getElementById('noGroupMessagesMessage');

// Message context menu state
let groupMessageContextMenu = null;
let currentContextMessageId = null;

function initializeGroupSystem() {
    console.log('Initializing enhanced group system...');
    
    // Create group-related UI elements if they don't exist
    createGroupUIElements();
    
    // Load user's groups
    loadUserGroups();
    
    // Listen for group invites
    listenForGroupInvites();
    
    // Listen for join requests (if user is admin of any groups)
    listenForGroupRequests();
    
    // Setup group event listeners
    setupGroupEventListeners();
    
    // Initialize typing indicators
    initializeGroupTypingIndicators();
    
    // Initialize emoji picker
    initializeGroupEmojiPicker();
    
    console.log('✅ Enhanced group system initialized');
}

// Create necessary UI elements for groups
function createGroupUIElements() {
    // Add groups tab if it doesn't exist
    if (!document.getElementById('groupsTab')) {
        const tabsContainer = document.querySelector('.tabs');
        if (tabsContainer) {
            const groupsTab = document.createElement('div');
            groupsTab.id = 'groupsTab';
            groupsTab.className = 'tab-panel hidden';
            groupsTab.innerHTML = `
                <div class="p-4">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-gray-800">Groups</h2>
                        <div class="flex space-x-2">
                            <button id="createGroupBtn" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Create Group
                            </button>
                            <button id="joinGroupBtn" class="btn-secondary">
                                <i class="fas fa-sign-in-alt mr-2"></i>Join Group
                            </button>
                        </div>
                    </div>
                    
                    <!-- Group Search -->
                    <div class="mb-4">
                        <input type="text" id="groupSearch" placeholder="Search groups..." 
                               class="w-full p-3 border border-gray-300 rounded-lg">
                    </div>
                    
                    <!-- Groups List -->
                    <div id="groupsList" class="space-y-3">
                        <div class="text-center text-gray-500 py-8">
                            <i class="fas fa-users text-4xl mb-3 text-gray-300 block"></i>
                            <p>No groups yet</p>
                            <p class="text-sm mt-1">Create or join a group to get started</p>
                        </div>
                    </div>
                    
                    <!-- Group Invites -->
                    <div id="groupInvitesSection" class="hidden mt-6">
                        <h3 class="text-lg font-semibold mb-3 text-gray-700">Group Invites</h3>
                        <div id="groupInvitesList" class="space-y-2"></div>
                    </div>
                </div>
            `;
            
            // Find the right position to insert (after calls tab)
            const callsTab = document.getElementById('callsTab');
            if (callsTab) {
                callsTab.parentNode.insertBefore(groupsTab, callsTab.nextSibling);
            } else {
                tabsContainer.appendChild(groupsTab);
            }
        }
    }
    
    // Add groups button to tabs navigation
    if (!document.getElementById('groupsTabBtn')) {
        const tabsNav = document.querySelector('.tabs-nav');
        if (tabsNav) {
            const groupsTabBtn = document.createElement('button');
            groupsTabBtn.id = 'groupsTabBtn';
            groupsTabBtn.className = 'tab-btn text-gray-500';
            groupsTabBtn.setAttribute('data-tab', 'groups');
            groupsTabBtn.innerHTML = `
                <i class="fas fa-users"></i>
                <span class="ml-2">Groups</span>
            `;
            tabsNav.appendChild(groupsTabBtn);
            
            // Add click event
            groupsTabBtn.addEventListener('click', () => {
                switchToTab('groups');
            });
        }
    }
    
    // Create group chat container if it doesn't exist
    if (!document.getElementById('groupChatContainer')) {
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            const groupChatContainer = document.createElement('div');
            groupChatContainer.id = 'groupChatContainer';
            groupChatContainer.className = 'hidden flex-1 flex flex-col';
            groupChatContainer.innerHTML = `
                <!-- Group Chat Header -->
                <div id="groupChatHeader" class="chat-header hidden">
                    <div class="flex items-center">
                        <button id="backToGroups" class="md:hidden mr-3">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="flex items-center space-x-3 flex-1">
                            <div class="relative">
                                <img id="groupAvatar" class="w-12 h-12 rounded-full" 
                                     src="https://ui-avatars.com/api/?name=Group&background=7C3AED&color=fff">
                                <div id="groupOnlineIndicator" class="w-3 h-3 bg-green-500 rounded-full border-2 border-white absolute -bottom-1 -right-1 hidden"></div>
                            </div>
                            <div class="flex-1">
                                <h2 id="groupTitle" class="font-semibold text-lg">Group Name</h2>
                                <div class="flex items-center space-x-2 text-sm text-gray-500">
                                    <span id="groupParticipantCount">0 members</span>
                                    <span>•</span>
                                    <span id="groupTypingIndicator" class="text-purple-600 hidden">
                                        <i class="fas fa-pencil-alt"></i> typing...
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="flex space-x-3">
                            <button id="groupVoiceCallBtn" class="p-2 hover:bg-gray-200 rounded-full">
                                <i class="fas fa-phone text-xl"></i>
                            </button>
                            <button id="groupVideoCallBtn" class="p-2 hover:bg-gray-200 rounded-full">
                                <i class="fas fa-video text-xl"></i>
                            </button>
                            <button id="groupInfoBtn" class="p-2 hover:bg-gray-200 rounded-full">
                                <i class="fas fa-info-circle text-xl"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Reply Preview -->
                <div id="groupReplyPreview" class="hidden bg-gray-100 border-l-4 border-purple-500 p-3 mx-4 mt-4 rounded">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="text-sm font-semibold text-purple-600" id="groupReplySender"></div>
                            <div class="text-sm text-gray-600 truncate" id="groupReplyText"></div>
                        </div>
                        <button id="cancelGroupReply" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Group Messages Container -->
                <div id="groupMessagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
                    <div id="noGroupMessagesMessage" class="text-center text-gray-500 py-10">
                        <i class="fas fa-comments text-4xl mb-3 text-gray-300 block"></i>
                        <p>No messages yet</p>
                        <p class="text-sm mt-1">Send a message to start the conversation</p>
                    </div>
                </div>
                
                <!-- Selection Toolbar -->
                <div id="groupSelectionToolbar" class="hidden bg-white border-t p-4 flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <span id="groupSelectedCount" class="font-semibold">0 selected</span>
                    </div>
                    <div class="flex space-x-2">
                        <button id="groupForwardSelected" class="p-2 text-blue-600 hover:bg-blue-50 rounded">
                            <i class="fas fa-share"></i>
                        </button>
                        <button id="groupStarSelected" class="p-2 text-yellow-600 hover:bg-yellow-50 rounded">
                            <i class="fas fa-star"></i>
                        </button>
                        <button id="groupDeleteSelected" class="p-2 text-red-600 hover:bg-red-50 rounded">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button id="groupCancelSelection" class="p-2 text-gray-600 hover:bg-gray-100 rounded">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Group Input Area -->
                <div id="groupInputArea" class="p-4 border-t hidden">
                    <div class="flex items-center space-x-3">
                        <button id="groupEmojiBtn" class="p-3 hover:bg-gray-200 rounded-full">
                            <i class="fas fa-smile text-xl"></i>
                        </button>
                        <button id="groupAttachBtn" class="p-3 hover:bg-gray-200 rounded-full">
                            <i class="fas fa-paperclip text-xl"></i>
                        </button>
                        <div class="flex-1 relative">
                            <input type="text" id="groupMessageInput" placeholder="Type a message..." 
                                   class="w-full p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500">
                            <div id="groupEmojiPickerContainer" class="absolute bottom-full mb-2 right-0 z-50 hidden"></div>
                        </div>
                        <button id="groupSendBtn" class="p-3 bg-purple-600 text-white rounded-full hover:bg-purple-700">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                        <button id="groupRecordBtn" class="p-3 hover:bg-gray-200 rounded-full hidden">
                            <i class="fas fa-microphone text-xl"></i>
                        </button>
                    </div>
                    
                    <!-- File Preview for Groups -->
                    <div id="groupFilePreview" class="hidden mt-3 p-3 bg-gray-100 rounded-lg">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <i class="fas fa-file text-2xl text-gray-600"></i>
                                <div>
                                    <div id="groupFileName" class="font-medium"></div>
                                    <div id="groupFileSize" class="text-sm text-gray-500"></div>
                                </div>
                            </div>
                            <button id="groupRemoveFile" class="text-red-500 hover:text-red-700">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="mt-2">
                            <div class="h-1 bg-gray-300 rounded-full overflow-hidden">
                                <div id="groupUploadProgressBar" class="h-full bg-green-500 w-0"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            chatContainer.appendChild(groupChatContainer);
        }
    }
    
    // Create group info modal
    if (!document.getElementById('groupInfoModal')) {
        const groupInfoModal = document.createElement('div');
        groupInfoModal.id = 'groupInfoModal';
        groupInfoModal.className = 'modal hidden';
        groupInfoModal.innerHTML = `
            <div class="modal-content max-w-2xl">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Group Info</h3>
                    <button id="closeGroupInfo" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- Group Header -->
                    <div class="text-center mb-6">
                        <div class="relative mx-auto w-32 h-32 mb-4">
                            <img id="groupInfoAvatar" class="w-full h-full rounded-full object-cover border-4 border-white shadow-lg" 
                                 src="https://ui-avatars.com/api/?name=Group&background=7C3AED&color=fff">
                            <button id="changeGroupAvatar" class="absolute bottom-0 right-0 bg-purple-600 text-white p-2 rounded-full">
                                <i class="fas fa-camera"></i>
                            </button>
                        </div>
                        <h2 id="groupInfoName" class="text-2xl font-bold mb-2">Group Name</h2>
                        <p id="groupInfoDescription" class="text-gray-600 mb-2">Group description</p>
                        <p id="groupInfoMeta" class="text-sm text-gray-500">Created on • 0 members</p>
                        <div class="mt-2">
                            <span id="encryptionIndicator" class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <i class="fas fa-lock mr-1"></i> End-to-end encrypted
                            </span>
                        </div>
                    </div>
                    
                    <!-- Group Actions -->
                    <div class="grid grid-cols-2 gap-3 mb-6">
                        <button id="muteGroupBtn" class="action-btn">
                            <i class="fas fa-bell-slash"></i>
                            <span>Mute</span>
                        </button>
                        <button id="groupMediaBtn" class="action-btn">
                            <i class="fas fa-photo-video"></i>
                            <span>Media</span>
                        </button>
                        <button id="groupStarredBtn" class="action-btn">
                            <i class="fas fa-star"></i>
                            <span>Starred</span>
                        </button>
                        <button id="groupSearchBtn" class="action-btn">
                            <i class="fas fa-search"></i>
                            <span>Search</span>
                        </button>
                    </div>
                    
                    <!-- Group Settings -->
                    <div class="mb-6">
                        <h4 class="font-semibold mb-3">Group Settings</h4>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-700">Send Messages</span>
                                <select id="groupSendMessagesSetting" class="border rounded p-2">
                                    <option value="all">All participants</option>
                                    <option value="admins">Admins only</option>
                                </select>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-700">Edit Group Info</span>
                                <select id="groupEditInfoSetting" class="border rounded p-2">
                                    <option value="admins">Admins only</option>
                                    <option value="all">All participants</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Participants Section -->
                    <div class="mb-6">
                        <div class="flex justify-between items-center mb-3">
                            <h4 class="font-semibold">Participants</h4>
                            <button id="addParticipantBtn" class="text-purple-600 hover:text-purple-800">
                                <i class="fas fa-user-plus"></i> Add
                            </button>
                        </div>
                        <div id="groupParticipantsList" class="space-y-2 max-h-60 overflow-y-auto"></div>
                    </div>
                    
                    <!-- Admin Actions (only for admins) -->
                    <div id="adminActionsSection" class="hidden">
                        <div class="border-t pt-4">
                            <h4 class="font-semibold mb-3 text-red-600">Admin Actions</h4>
                            <div class="space-y-2">
                                <button id="editGroupInfoBtn" class="admin-btn">
                                    <i class="fas fa-edit"></i> Edit Group Info
                                </button>
                                <button id="manageAdminsBtn" class="admin-btn">
                                    <i class="fas fa-user-shield"></i> Manage Admins
                                </button>
                                <button id="groupSettingsBtn" class="admin-btn">
                                    <i class="fas fa-cog"></i> Group Settings
                                </button>
                                <button id="deleteGroupBtn" class="admin-btn text-red-600">
                                    <i class="fas fa-trash"></i> Delete Group
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Invite Link -->
                    <div class="border-t pt-4 mb-4">
                        <h4 class="font-semibold mb-3">Invite Link</h4>
                        <div class="flex space-x-2">
                            <input type="text" id="groupInviteLink" readonly 
                                   class="flex-1 p-3 border border-gray-300 rounded-lg bg-gray-50">
                            <button id="copyInviteLink" class="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button id="refreshInviteLink" class="px-4 py-3 bg-gray-200 rounded-lg hover:bg-gray-300">
                                <i class="fas fa-redo"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Member Actions -->
                    <div class="border-t pt-4">
                        <button id="leaveGroupBtn" class="w-full p-3 text-red-600 hover:bg-red-50 rounded-lg">
                            <i class="fas fa-sign-out-alt"></i> Leave Group
                        </button>
                        <button id="reportGroupBtn" class="w-full p-3 text-red-600 hover:bg-red-50 rounded-lg mt-2">
                            <i class="fas fa-flag"></i> Report Group
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(groupInfoModal);
    }
    
    // Create group creation modal
    if (!document.getElementById('createGroupModal')) {
        const createGroupModal = document.createElement('div');
        createGroupModal.id = 'createGroupModal';
        createGroupModal.className = 'modal hidden';
        createGroupModal.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Create New Group</h3>
                    <button id="closeCreateGroup" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-4">
                        <!-- Group Name -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                            <input type="text" id="newGroupName" 
                                   class="w-full p-3 border border-gray-300 rounded-lg" 
                                   placeholder="Enter group name" required>
                        </div>
                        
                        <!-- Group Description -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                            <textarea id="newGroupDescription" 
                                      class="w-full p-3 border border-gray-300 rounded-lg" 
                                      rows="2" placeholder="Describe your group"></textarea>
                        </div>
                        
                        <!-- Group Privacy -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Group Privacy</label>
                            <select id="newGroupPrivacy" class="w-full p-3 border border-gray-300 rounded-lg">
                                <option value="public">Public - Anyone can join</option>
                                <option value="private">Private - Invite only</option>
                                <option value="hidden">Hidden - Admin adds members</option>
                            </select>
                        </div>
                        
                        <!-- Group Settings -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Initial Settings</label>
                            <div class="space-y-2">
                                <label class="flex items-center">
                                    <input type="checkbox" id="newGroupOnlyAdminsPost" class="mr-2">
                                    <span class="text-sm">Only admins can send messages</span>
                                </label>
                                <label class="flex items-center">
                                    <input type="checkbox" id="newGroupOnlyAdminsEdit" class="mr-2" checked>
                                    <span class="text-sm">Only admins can edit group info</span>
                                </label>
                                <label class="flex items-center">
                                    <input type="checkbox" id="newGroupEncrypted" class="mr-2" checked>
                                    <span class="text-sm">Enable end-to-end encryption</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Add Participants -->
                        <div>
                            <div class="flex justify-between items-center mb-2">
                                <label class="block text-sm font-medium text-gray-700">Add Participants</label>
                                <span id="selectedCount" class="text-sm text-gray-500">0 selected</span>
                            </div>
                            <input type="text" id="searchParticipants" 
                                   class="w-full p-3 border border-gray-300 rounded-lg mb-3" 
                                   placeholder="Search friends...">
                            <div id="participantsList" class="max-h-60 overflow-y-auto border rounded-lg p-2">
                                <!-- Friends list will be populated here -->
                            </div>
                        </div>
                        
                        <!-- Create Button -->
                        <div class="pt-4">
                            <button id="createGroupActionBtn" class="w-full p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                Create Group
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(createGroupModal);
    }
    
    // Create group join modal
    if (!document.getElementById('joinGroupModal')) {
        const joinGroupModal = document.createElement('div');
        joinGroupModal.id = 'joinGroupModal';
        joinGroupModal.className = 'modal hidden';
        joinGroupModal.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Join Group</h3>
                    <button id="closeJoinGroup" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-4">
                        <!-- Search Groups -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Search Groups</label>
                            <input type="text" id="searchGroups" 
                                   class="w-full p-3 border border-gray-300 rounded-lg" 
                                   placeholder="Search by name or invite code...">
                        </div>
                        
                        <!-- Group Invite Code -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Or Enter Invite Code/Link</label>
                            <div class="flex space-x-2">
                                <input type="text" id="groupInviteCode" 
                                       class="flex-1 p-3 border border-gray-300 rounded-lg" 
                                       placeholder="e.g., GROUP-123456 or https://...">
                                <button id="joinByCodeBtn" class="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                    Join
                                </button>
                            </div>
                        </div>
                        
                        <!-- Public Groups List -->
                        <div id="publicGroupsList" class="max-h-60 overflow-y-auto">
                            <!-- Public groups will be populated here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(joinGroupModal);
    }
    
    // Create group media gallery modal
    if (!document.getElementById('groupMediaModal')) {
        const groupMediaModal = document.createElement('div');
        groupMediaModal.id = 'groupMediaModal';
        groupMediaModal.className = 'modal hidden';
        groupMediaModal.innerHTML = `
            <div class="modal-content max-w-4xl">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Group Media</h3>
                    <button id="closeGroupMedia" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="mb-4">
                        <div class="flex space-x-2">
                            <button class="media-filter-btn active" data-filter="all">All Media</button>
                            <button class="media-filter-btn" data-filter="images">Images</button>
                            <button class="media-filter-btn" data-filter="videos">Videos</button>
                            <button class="media-filter-btn" data-filter="documents">Documents</button>
                        </div>
                    </div>
                    <div id="groupMediaGallery" class="grid grid-cols-4 gap-4">
                        <!-- Media items will be loaded here -->
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(groupMediaModal);
    }
    
    // Create starred messages modal
    if (!document.getElementById('groupStarredModal')) {
        const groupStarredModal = document.createElement('div');
        groupStarredModal.id = 'groupStarredModal';
        groupStarredModal.className = 'modal hidden';
        groupStarredModal.innerHTML = `
            <div class="modal-content max-w-4xl">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Starred Messages</h3>
                    <button id="closeGroupStarred" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="groupStarredMessages" class="space-y-4">
                        <!-- Starred messages will be loaded here -->
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(groupStarredModal);
    }
    
    // Create search in group modal
    if (!document.getElementById('groupSearchModal')) {
        const groupSearchModal = document.createElement('div');
        groupSearchModal.id = 'groupSearchModal';
        groupSearchModal.className = 'modal hidden';
        groupSearchModal.innerHTML = `
            <div class="modal-content max-w-4xl">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Search in Group</h3>
                    <button id="closeGroupSearch" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="mb-4">
                        <input type="text" id="searchInGroupInput" 
                               class="w-full p-3 border border-gray-300 rounded-lg" 
                               placeholder="Search messages...">
                    </div>
                    <div id="groupSearchResults" class="space-y-4">
                        <!-- Search results will appear here -->
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(groupSearchModal);
    }
    
    // Create message context menu
    if (!document.getElementById('groupMessageContextMenu')) {
        const contextMenu = document.createElement('div');
        contextMenu.id = 'groupMessageContextMenu';
        contextMenu.className = 'fixed hidden bg-white rounded-lg shadow-lg border border-gray-200 z-50 min-w-48';
        contextMenu.innerHTML = `
            <div class="py-1">
                <button class="context-menu-item" data-action="reply">
                    <i class="fas fa-reply mr-2"></i>Reply
                </button>
                <button class="context-menu-item" data-action="forward">
                    <i class="fas fa-share mr-2"></i>Forward
                </button>
                <button class="context-menu-item" data-action="star">
                    <i class="far fa-star mr-2"></i>Star
                </button>
                <hr class="my-1">
                <button class="context-menu-item" data-action="copy">
                    <i class="fas fa-copy mr-2"></i>Copy
                </button>
                <button class="context-menu-item" data-action="select">
                    <i class="fas fa-check-square mr-2"></i>Select
                </button>
                <hr class="my-1">
                <button class="context-menu-item text-red-600" data-action="delete-for-me">
                    <i class="fas fa-trash mr-2"></i>Delete for me
                </button>
                <button class="context-menu-item text-red-600" data-action="delete-for-everyone">
                    <i class="fas fa-trash-alt mr-2"></i>Delete for everyone
                </button>
                <hr class="my-1">
                <button class="context-menu-item" data-action="report">
                    <i class="fas fa-flag mr-2"></i>Report
                </button>
            </div>
        `;
        document.body.appendChild(contextMenu);
    }
    
    // Create forward modal
    if (!document.getElementById('forwardGroupMessageModal')) {
        const forwardModal = document.createElement('div');
        forwardModal.id = 'forwardGroupMessageModal';
        forwardModal.className = 'modal hidden';
        forwardModal.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Forward Message</h3>
                    <button id="closeForwardModal" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="mb-4">
                        <input type="text" id="forwardSearch" 
                               class="w-full p-3 border border-gray-300 rounded-lg" 
                               placeholder="Search chats or groups...">
                    </div>
                    <div id="forwardTargetList" class="max-h-96 overflow-y-auto">
                        <!-- Forward targets will appear here -->
                    </div>
                    <div class="mt-4 flex justify-end space-x-3">
                        <button id="cancelForward" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                            Cancel
                        </button>
                        <button id="confirmForward" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                            Forward
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(forwardModal);
    }
    
    // Create manage admins modal
    if (!document.getElementById('manageAdminsModal')) {
        const manageAdminsModal = document.createElement('div');
        manageAdminsModal.id = 'manageAdminsModal';
        manageAdminsModal.className = 'modal hidden';
        manageAdminsModal.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold">Manage Admins</h3>
                    <button id="closeManageAdmins" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="mb-4">
                        <input type="text" id="searchAdmins" 
                               class="w-full p-3 border border-gray-300 rounded-lg" 
                               placeholder="Search participants...">
                    </div>
                    <div id="adminManagementList" class="max-h-96 overflow-y-auto">
                        <!-- Participants with admin toggle will appear here -->
                    </div>
                    <div class="mt-4 flex justify-end">
                        <button id="saveAdminChanges" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(manageAdminsModal);
    }
}

// Load user's groups
function loadUserGroups() {
    if (!currentUser) return;
    
    console.log('Loading user groups...');
    
    // Unsubscribe from previous listeners
    if (unsubscribeGroups) {
        unsubscribeGroups();
    }
    
    unsubscribeGroups = db.collection('groups')
        .where('participants', 'array-contains', currentUser.uid)
        .where('status', '==', 'active')
        .onSnapshot({
            next: (snapshot) => {
                console.log('Groups snapshot:', snapshot.size, 'groups');
                allGroups = [];
                
                snapshot.forEach(doc => {
                    const group = {
                        id: doc.id,
                        ...doc.data()
                    };
                    allGroups.push(group);
                });
                
                renderGroupsList(allGroups);
                
                // Update real-time indicators
                updateGroupRealTimeIndicators();
            },
            error: (error) => {
                console.error('Error loading groups:', error);
                showToast('Error loading groups', 'error');
            }
        });
}

// Render groups list
function renderGroupsList(groups) {
    const groupsList = document.getElementById('groupsList');
    if (!groupsList) return;
    
    groupsList.innerHTML = '';
    
    if (groups.length === 0) {
        groupsList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-users text-4xl mb-3 text-gray-300 block"></i>
                <p>No groups yet</p>
                <p class="text-sm mt-1">Create or join a group to get started</p>
            </div>
        `;
        return;
    }
    
    // Sort by last activity
    groups.sort((a, b) => {
        const timeA = a.lastMessageTime?.toDate() || a.createdAt?.toDate() || new Date(0);
        const timeB = b.lastMessageTime?.toDate() || b.createdAt?.toDate() || new Date(0);
        return timeB - timeA;
    });
    
    groups.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer';
        groupItem.dataset.groupId = group.id;
        
        // Calculate unread count
        const unreadCount = getGroupUnreadCount(group.id);
        
        // Format last message
        let lastMessage = group.lastMessage || 'No messages yet';
        if (lastMessage.length > 50) {
            lastMessage = lastMessage.substring(0, 50) + '...';
        }
        
        // Format timestamp
        const lastTime = group.lastMessageTime ? formatTimeAgo(group.lastMessageTime) : 'New group';
        
        // Check if group is muted
        const userMutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '{}');
        const isMuted = userMutedGroups[group.id];
        
        groupItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="relative">
                    <img class="w-12 h-12 rounded-full object-cover" 
                         src="${group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=7C3AED&color=fff`}" 
                         alt="${group.name}">
                    ${isMuted ? '<div class="absolute -top-1 -right-1 bg-gray-600 text-white p-1 rounded-full text-xs"><i class="fas fa-bell-slash"></i></div>' : ''}
                    ${group.isEncrypted ? '<div class="absolute -bottom-1 -left-1 bg-green-600 text-white p-1 rounded-full text-xs"><i class="fas fa-lock"></i></div>' : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start">
                        <h3 class="font-semibold text-gray-800 truncate">${group.name}</h3>
                        <span class="text-xs text-gray-500">${lastTime}</span>
                    </div>
                    <p class="text-sm text-gray-500 truncate">${lastMessage}</p>
                    <div class="flex items-center justify-between mt-1">
                        <div class="flex items-center space-x-2">
                            <span class="text-xs text-gray-400">${group.participants?.length || 0} members</span>
                            ${group.isTyping && group.typingUsers?.length > 0 ? `
                                <span class="text-xs text-purple-600">
                                    <i class="fas fa-pencil-alt"></i> ${group.typingUsers.length} typing
                                </span>
                            ` : ''}
                        </div>
                        ${unreadCount > 0 ? `
                            <span class="bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                ${unreadCount}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Add click event
        groupItem.addEventListener('click', () => {
            openGroupChat(group.id);
        });
        
        // Add context menu
        groupItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showGroupContextMenu(e, group.id);
        });
        
        groupsList.appendChild(groupItem);
    });
}

// Get unread count for group
function getGroupUnreadCount(groupId) {
    const unreadCounts = JSON.parse(localStorage.getItem('groupUnreadCounts') || '{}');
    return unreadCounts[groupId] || 0;
}

// Update real-time indicators
function updateGroupRealTimeIndicators() {
    // Subscribe to typing indicators for all groups
    allGroups.forEach(group => {
        db.collection('groups').doc(group.id).onSnapshot(doc => {
            if (doc.exists) {
                const groupData = doc.data();
                updateGroupTypingIndicator(group.id, groupData.typingUsers || []);
            }
        });
    });
}

// Open group chat
async function openGroupChat(groupId) {
    try {
        console.log('Opening group chat:', groupId);
        
        // Get group data
        const groupDoc = await db.collection('groups').doc(groupId).get();
        
        if (!groupDoc.exists) {
            showToast('Group not found', 'error');
            return;
        }
        
        const groupData = groupDoc.data();
        
        // Set current group
        currentGroup = {
            id: groupId,
            ...groupData
        };
        currentGroupId = groupId;
        
        // Check if user is admin
        groupAdminId = groupData.createdBy;
        const isAdmin = groupData.admins?.includes(currentUser.uid);
        
        // Update UI
        updateGroupChatUI(groupData);
        
        // Load group messages
        loadGroupMessages(groupId);
        
        // Listen for typing indicators
        listenForGroupTyping(groupId);
        
        // Update read receipts
        updateGroupReadReceipts(groupId);
        
        // Reset unread count
        resetGroupUnreadCount(groupId);
        
        // Hide other chat containers
        const chatContainer = document.getElementById('chatContainer');
        const groupChatContainer = document.getElementById('groupChatContainer');
        
        if (chatContainer) chatContainer.classList.add('hidden');
        if (groupChatContainer) groupChatContainer.classList.remove('hidden');
        
        // Hide groups list on mobile
        if (window.innerWidth < 768) {
            const tabsContainer = document.querySelector('.tabs');
            if (tabsContainer) tabsContainer.classList.add('hidden');
        }
        
        console.log('Group chat opened:', groupData.name);
        
    } catch (error) {
        console.error('Error opening group chat:', error);
        showToast('Error opening group chat', 'error');
    }
}

// Update group chat UI
function updateGroupChatUI(groupData) {
    // Update header
    if (groupTitle) groupTitle.textContent = groupData.name;
    if (groupAvatar) {
        groupAvatar.src = groupData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(groupData.name)}&background=7C3AED&color=fff`;
    }
    if (groupParticipantCount) {
        const memberCount = groupData.participants?.length || 0;
        groupParticipantCount.textContent = `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;
    }
    
    // Show/hide elements
    if (groupChatHeader) groupChatHeader.classList.remove('hidden');
    if (groupInputArea) groupInputArea.classList.remove('hidden');
    if (noGroupMessagesMessage) noGroupMessagesMessage.classList.add('hidden');
    
    // Enable input if allowed
    const groupMessageInput = document.getElementById('groupMessageInput');
    const groupSendBtn = document.getElementById('groupSendBtn');
    
    const canSend = groupData.settings?.sendMessages === 'all' || 
                   groupData.admins?.includes(currentUser.uid);
    
    if (groupMessageInput) {
        groupMessageInput.disabled = !canSend;
        groupMessageInput.placeholder = canSend ? 'Type a message...' : 'Only admins can send messages';
    }
    if (groupSendBtn) groupSendBtn.disabled = !canSend;
    
    // Update admin actions visibility
    const adminActionsSection = document.getElementById('adminActionsSection');
    if (adminActionsSection) {
        const isAdmin = groupData.admins?.includes(currentUser.uid);
        adminActionsSection.classList.toggle('hidden', !isAdmin);
    }
    
    // Update encryption indicator
    const encryptionIndicator = document.getElementById('encryptionIndicator');
    if (encryptionIndicator) {
        encryptionIndicator.classList.toggle('hidden', !groupData.isEncrypted);
    }
}

// Load group messages
function loadGroupMessages(groupId) {
    console.log('Loading group messages for:', groupId);
    
    // Unsubscribe from previous listeners
    if (unsubscribeGroupMessages) {
        unsubscribeGroupMessages();
        unsubscribeGroupMessages = null;
    }
    
    const messagesContainer = groupMessagesContainer || document.getElementById('groupMessagesContainer');
    if (!messagesContainer) return;
    
    // Show loading state
    messagesContainer.innerHTML = `
        <div class="text-center text-gray-500 py-10">
            <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
            <p>Loading messages...</p>
        </div>
    `;
    
    let loadedMessageIds = new Set();
    let lastLoadedDate = null;
    
    // Subscribe to group messages
    unsubscribeGroupMessages = db.collection('groupMessages')
        .where('groupId', '==', groupId)
        .where('deletedFor', 'not-in', [currentUser.uid])
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot({
            next: async (snapshot) => {
                console.log('Group messages snapshot:', snapshot.size, 'messages');
                
                if (snapshot.empty) {
                    messagesContainer.innerHTML = `
                        <div class="text-center text-gray-500 py-10">
                            <i class="fas fa-comments text-4xl mb-3 text-gray-300 block"></i>
                            <p>No messages yet</p>
                            <p class="text-sm mt-1">Send a message to start the conversation</p>
                        </div>
                    `;
                    return;
                }
                
                // Clear only on first load
                if (loadedMessageIds.size === 0) {
                    messagesContainer.innerHTML = '';
                }
                
                const messages = [];
                snapshot.forEach(doc => {
                    messages.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                // Sort by timestamp for display
                messages.sort((a, b) => {
                    const timeA = a.timestamp?.toDate() || new Date(0);
                    const timeB = b.timestamp?.toDate() || new Date(0);
                    return timeA - timeB;
                });
                
                // Clear and render all messages
                messagesContainer.innerHTML = '';
                lastLoadedDate = null;
                
                for (const message of messages) {
                    if (loadedMessageIds.has(message.id)) continue;
                    loadedMessageIds.add(message.id);
                    
                    // Add date separator if needed
                    const messageDate = message.timestamp ? message.timestamp.toDate().toDateString() : new Date().toDateString();
                    if (messageDate !== lastLoadedDate) {
                        addGroupDateSeparator(messageDate, messagesContainer);
                        lastLoadedDate = messageDate;
                    }
                    
                    // Add message to UI
                    await addGroupMessageToUI(message, messagesContainer);
                }
                
                // Scroll to bottom
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
                
                // Update read receipts
                updateMessageReadReceipts(groupId, messages);
                
            },
            error: (error) => {
                console.error('Error loading group messages:', error);
                messagesContainer.innerHTML = `
                    <div class="text-center text-gray-500 py-10">
                        <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                        <p>Error loading messages</p>
                        <p class="text-sm mt-1">Please try again later</p>
                    </div>
                `;
                showToast('Error loading group messages', 'error');
            }
        });
}

// Add group message to UI
async function addGroupMessageToUI(message, container) {
    const messageElement = document.createElement('div');
    
    const isSent = message.senderId === currentUser.uid;
    const messageTime = message.timestamp ? message.timestamp.toDate().toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    }) : 'Just now';
    
    messageElement.className = `group-message-container ${isSent ? 'sent' : 'received'} cursor-pointer hover:bg-gray-50 p-2 rounded-lg`;
    messageElement.dataset.messageId = message.id;
    
    // Get sender info
    let senderName = message.senderName || 'Unknown';
    let senderAvatar = null;
    
    if (message.senderId !== 'system') {
        try {
            const userDoc = await db.collection('users').doc(message.senderId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                senderName = userData.displayName || senderName;
                senderAvatar = userData.photoURL;
            }
        } catch (error) {
            console.error('Error fetching sender info:', error);
        }
    }
    
    // Check if message is starred
    const isStarred = message.starredBy?.includes(currentUser.uid) || false;
    
    // Check read receipts
    const readBy = message.readBy || [];
    const isRead = readBy.length > 0;
    
    // Different styling for system messages
    if (message.type === 'system') {
        messageElement.className = 'system-message';
        messageElement.innerHTML = `
            <div class="text-center text-gray-500 text-sm py-2">
                <span class="bg-gray-100 px-3 py-1 rounded-full">${escapeHtml(message.text)}</span>
            </div>
        `;
    } else if (message.deletedForEveryone) {
        // Deleted message
        messageElement.innerHTML = `
            <div class="message-bubble ${isSent ? 'message-sent' : 'message-received'} opacity-50">
                <div class="message-text italic text-gray-400">This message was deleted</div>
            </div>
        `;
    } else {
        // Regular message with enhanced features
        let messageContent = '';
        
        if (message.type === 'file') {
            messageContent = renderFileMessage(message);
        } else if (message.forwardedFrom) {
            messageContent = renderForwardedMessage(message);
        } else if (message.replyTo) {
            messageContent = renderReplyMessage(message);
        } else {
            messageContent = `
                <div class="message-text">${escapeHtml(message.text)}</div>
            `;
        }
        
        messageElement.innerHTML = `
            <div class="flex ${isSent ? 'justify-end' : 'justify-start'}">
                <div class="max-w-2xl">
                    ${!isSent ? `
                        <div class="flex items-center space-x-2 mb-1">
                            ${senderAvatar ? `
                                <img src="${senderAvatar}" class="w-6 h-6 rounded-full">
                            ` : ''}
                            <span class="sender-name text-xs font-semibold text-gray-600">
                                ${senderName}
                            </span>
                        </div>
                    ` : ''}
                    
                    <div class="message-bubble ${isSent ? 'message-sent' : 'message-received'} relative group">
                        ${messageContent}
                        
                        <div class="message-time flex justify-between items-center mt-1 pt-1 border-t border-gray-100">
                            <span class="text-xs text-gray-500">${messageTime}</span>
                            <div class="flex items-center space-x-1">
                                ${isStarred ? '<i class="fas fa-star text-yellow-500 text-xs"></i>' : ''}
                                ${isSent ? `
                                    <span class="status-icons text-xs">
                                        ${isRead ? '<i class="fas fa-check-double text-blue-500"></i>' : 
                                          message.status === 'delivered' ? '<i class="fas fa-check-double text-gray-400"></i>' : 
                                          '<i class="fas fa-check text-gray-400"></i>'}
                                    </span>
                                ` : ''}
                                ${message.isEncrypted ? '<i class="fas fa-lock text-green-500 text-xs"></i>' : ''}
                            </div>
                        </div>
                        
                        <!-- Context menu trigger (hover only on desktop) -->
                        <div class="message-context-trigger absolute -right-8 top-1/2 transform -translate-y-1/2 hidden group-hover:block">
                            <button class="p-1 text-gray-400 hover:text-gray-600">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                    </div>
                    
                    ${isSent && isRead ? `
                        <div class="read-receipts flex justify-end mt-1">
                            <div class="flex items-center space-x-1">
                                <span class="text-xs text-gray-400">Read by ${readBy.length}</span>
                                <div class="flex -space-x-1">
                                    ${readBy.slice(0, 3).map(userId => `
                                        <div class="w-4 h-4 rounded-full bg-gray-300 border border-white"></div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // Add event listeners
    messageElement.addEventListener('click', (e) => {
        if (!e.target.closest('.message-context-trigger')) {
            handleGroupMessageClick(message.id);
        }
    });
    
    messageElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showGroupMessageContextMenu(e, message);
    });
    
    container.appendChild(messageElement);
}

// Render file message
function renderFileMessage(message) {
    const file = message.file || {};
    const fileType = file.type || '';
    
    if (fileType.startsWith('image/')) {
        return `
            <div class="file-message">
                <img src="${file.url}" alt="${file.name}" 
                     class="max-w-xs rounded-lg cursor-pointer hover:opacity-90"
                     onclick="previewGroupImage('${file.url}')">
                <div class="mt-2">
                    <div class="text-sm font-medium">${file.name}</div>
                    <div class="text-xs text-gray-500">${formatFileSize(file.size)}</div>
                </div>
            </div>
        `;
    } else if (fileType.startsWith('video/')) {
        return `
            <div class="file-message">
                <video src="${file.url}" controls 
                       class="max-w-xs rounded-lg"></video>
                <div class="mt-2">
                    <div class="text-sm font-medium">${file.name}</div>
                    <div class="text-xs text-gray-500">${formatFileSize(file.size)}</div>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="file-message">
                <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                    <i class="fas fa-file text-2xl text-gray-600"></i>
                    <div class="flex-1">
                        <div class="text-sm font-medium truncate">${file.name}</div>
                        <div class="text-xs text-gray-500">${formatFileSize(file.size)}</div>
                    </div>
                    <a href="${file.url}" target="_blank" 
                       class="text-purple-600 hover:text-purple-800">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            </div>
        `;
    }
}

// Render forwarded message
function renderForwardedMessage(message) {
    return `
        <div class="forwarded-message border-l-4 border-gray-300 pl-3 mb-2">
            <div class="text-xs text-gray-500 mb-1">
                <i class="fas fa-share mr-1"></i> Forwarded
            </div>
            <div class="bg-gray-50 p-2 rounded">
                <div class="text-sm font-semibold">${message.forwardedFrom}</div>
                <div class="text-sm truncate">${escapeHtml(message.text)}</div>
            </div>
        </div>
    `;
}

// Render reply message
function renderReplyMessage(message) {
    return `
        <div class="reply-message border-l-4 border-purple-500 pl-3 mb-2">
            <div class="text-xs text-gray-500 mb-1">
                <i class="fas fa-reply mr-1"></i> ${message.replyToSender || 'Reply'}
            </div>
            <div class="bg-gray-50 p-2 rounded">
                <div class="text-sm truncate">${escapeHtml(message.replyToText || '')}</div>
            </div>
        </div>
        <div class="message-text mt-2">${escapeHtml(message.text)}</div>
    `;
}

// Add date separator for group messages
function addGroupDateSeparator(dateString, container) {
    const dateElement = document.createElement('div');
    dateElement.className = 'date-separator';
    
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    let displayDate = dateString;
    if (dateString === today) {
        displayDate = 'Today';
    } else if (dateString === yesterday) {
        displayDate = 'Yesterday';
    } else {
        displayDate = new Date(dateString).toLocaleDateString();
    }
    
    dateElement.innerHTML = `<span>${displayDate}</span>`;
    container.appendChild(dateElement);
}

// Send group message
async function sendGroupMessage() {
    const messageInput = document.getElementById('groupMessageInput');
    if (!messageInput || !currentGroup) return;
    
    const text = messageInput.value.trim();
    if (!text) {
        showToast('Please enter a message', 'error');
        return;
    }
    
    // Check if user can send messages
    const canSend = currentGroup.settings?.sendMessages === 'all' || 
                   currentGroup.admins?.includes(currentUser.uid);
    if (!canSend) {
        showToast('Only admins can send messages in this group', 'error');
        return;
    }
    
    console.log('Sending group message:', text);
    
    try {
        // Check for reply
        const replyPreview = document.getElementById('groupReplyPreview');
        let replyData = null;
        
        if (replyPreview && !replyPreview.classList.contains('hidden')) {
            const replyMessageId = replyPreview.dataset.messageId;
            if (replyMessageId) {
                const replyDoc = await db.collection('groupMessages').doc(replyMessageId).get();
                if (replyDoc.exists) {
                    const replyMessage = replyDoc.data();
                    replyData = {
                        messageId: replyMessageId,
                        text: replyMessage.text,
                        senderId: replyMessage.senderId,
                        senderName: replyMessage.senderName
                    };
                }
            }
        }
        
        const message = {
            text: text,
            senderId: currentUser.uid,
            senderName: currentUserData.displayName,
            groupId: currentGroup.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            type: 'text',
            isEncrypted: currentGroup.isEncrypted || false,
            readBy: [],
            starredBy: []
        };
        
        // Add reply data if exists
        if (replyData) {
            message.replyTo = replyData.messageId;
            message.replyToText = replyData.text;
            message.replyToSender = replyData.senderName;
        }
        
        // Add message to Firebase
        const messageRef = await db.collection('groupMessages').add(message);
        
        // Update group's last message
        await db.collection('groups').doc(currentGroup.id).update({
            lastMessage: text.length > 50 ? text.substring(0, 50) + '...' : text,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            lastActivity: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Clear input and reply preview
        messageInput.value = '';
        if (replyPreview) {
            replyPreview.classList.add('hidden');
        }
        
        // Update message status for sender
        await updateGroupMessageStatus(currentGroup.id, 'delivered', messageRef.id);
        
        // Clear typing indicator
        clearGroupTypingIndicator();
        
        // Send push notifications to group members (except sender)
        await sendGroupPushNotification(currentGroup.id, currentUserData.displayName, text);
        
        console.log('Group message sent successfully');
        
    } catch (error) {
        console.error('Error sending group message:', error);
        showToast('Error sending message', 'error');
    }
}

// Update group message status
async function updateGroupMessageStatus(groupId, status, messageId = null) {
    try {
        let query = db.collection('groupMessages')
            .where('groupId', '==', groupId)
            .where('senderId', '==', currentUser.uid)
            .where('status', '==', 'sent');
        
        if (messageId) {
            // Update specific message
            await db.collection('groupMessages').doc(messageId).update({
                status: status,
                ...(status === 'delivered' ? { deliveredAt: firebase.firestore.FieldValue.serverTimestamp() } : {})
            });
        } else {
            // Update all sent messages
            const snapshot = await query.get();
            const batch = db.batch();
            
            snapshot.forEach(doc => {
                batch.update(doc.ref, { 
                    status: status,
                    ...(status === 'delivered' ? { deliveredAt: firebase.firestore.FieldValue.serverTimestamp() } : {})
                });
            });
            
            if (snapshot.size > 0) {
                await batch.commit();
            }
        }
        
        console.log('Group message status updated to:', status);
        
    } catch (error) {
        console.error('Error updating group message status:', error);
    }
}

// Update read receipts
async function updateGroupReadReceipts(groupId) {
    try {
        // Mark all undelivered messages as read
        const messagesQuery = await db.collection('groupMessages')
            .where('groupId', '==', groupId)
            .where('senderId', '!=', currentUser.uid)
            .where('readBy', 'not-array-contains', currentUser.uid)
            .get();
        
        const batch = db.batch();
        messagesQuery.forEach(doc => {
            batch.update(doc.ref, {
                readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
        });
        
        if (messagesQuery.size > 0) {
            await batch.commit();
            console.log('Read receipts updated for', messagesQuery.size, 'messages');
        }
        
    } catch (error) {
        console.error('Error updating read receipts:', error);
    }
}

// Update message read receipts
function updateMessageReadReceipts(groupId, messages) {
    // Update UI with read receipts
    messages.forEach(message => {
        if (message.senderId === currentUser.uid && message.readBy?.length > 0) {
            updateMessageReadStatusUI(message.id, message.readBy);
        }
    });
}

// Update message read status UI
function updateMessageReadStatusUI(messageId, readBy) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const statusIcons = messageElement.querySelector('.status-icons');
        if (statusIcons) {
            statusIcons.innerHTML = '<i class="fas fa-check-double text-blue-500"></i>';
            
            // Add read receipts indicator
            const readReceiptsDiv = messageElement.querySelector('.read-receipts');
            if (!readReceiptsDiv) {
                const receiptDiv = document.createElement('div');
                receiptDiv.className = 'read-receipts flex justify-end mt-1';
                receiptDiv.innerHTML = `
                    <div class="flex items-center space-x-1">
                        <span class="text-xs text-gray-400">Read by ${readBy.length}</span>
                    </div>
                `;
                messageElement.querySelector('.max-w-2xl').appendChild(receiptDiv);
            }
        }
    }
}

// Initialize typing indicators
function initializeGroupTypingIndicators() {
    const messageInput = document.getElementById('groupMessageInput');
    if (!messageInput) return;
    
    let typingTimeout;
    
    messageInput.addEventListener('input', () => {
        // Clear previous timeout
        if (typingTimeout) clearTimeout(typingTimeout);
        
        // Send typing indicator
        sendGroupTypingIndicator(true);
        
        // Set timeout to clear typing indicator
        typingTimeout = setTimeout(() => {
            sendGroupTypingIndicator(false);
        }, 2000);
    });
    
    messageInput.addEventListener('blur', () => {
        sendGroupTypingIndicator(false);
    });
}

// Send typing indicator
async function sendGroupTypingIndicator(isTyping) {
    if (!currentGroupId) return;
    
    try {
        await db.collection('groups').doc(currentGroupId).update({
            typingUsers: isTyping ? 
                firebase.firestore.FieldValue.arrayUnion(currentUser.uid) :
                firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
    } catch (error) {
        console.error('Error sending typing indicator:', error);
    }
}

// Listen for group typing
function listenForGroupTyping(groupId) {
    db.collection('groups').doc(groupId).onSnapshot(doc => {
        if (doc.exists) {
            const groupData = doc.data();
            const typingUsers = groupData.typingUsers || [];
            
            // Filter out current user
            const otherTypingUsers = typingUsers.filter(uid => uid !== currentUser.uid);
            
            updateGroupTypingIndicator(groupId, otherTypingUsers);
        }
    });
}

// Update group typing indicator
async function updateGroupTypingIndicator(groupId, typingUsers) {
    const typingIndicator = document.getElementById('groupTypingIndicator');
    if (!typingIndicator) return;
    
    if (typingUsers.length > 0) {
        // Get names of typing users
        const userNames = [];
        for (const userId of typingUsers.slice(0, 2)) {
            try {
                const userDoc = await db.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    userNames.push(userDoc.data().displayName || 'User');
                }
            } catch (error) {
                console.error('Error getting user info:', error);
            }
        }
        
        let typingText = '';
        if (userNames.length === 1) {
            typingText = `${userNames[0]} is typing...`;
        } else if (userNames.length === 2) {
            typingText = `${userNames[0]} and ${userNames[1]} are typing...`;
        } else if (typingUsers.length > 2) {
            typingText = `${typingUsers.length} people are typing...`;
        }
        
        typingIndicator.innerHTML = `<i class="fas fa-pencil-alt"></i> ${typingText}`;
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
}

// Clear typing indicator
function clearGroupTypingIndicator() {
    const typingIndicator = document.getElementById('groupTypingIndicator');
    if (typingIndicator) {
        typingIndicator.classList.add('hidden');
    }
}

// Initialize emoji picker
function initializeGroupEmojiPicker() {
    const emojiBtn = document.getElementById('groupEmojiBtn');
    const emojiContainer = document.getElementById('groupEmojiPickerContainer');
    const messageInput = document.getElementById('groupMessageInput');
    
    if (!emojiBtn || !emojiContainer || !messageInput) return;
    
    // Simple emoji list
    const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', 
                   '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
                   '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
                   '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
                   '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
                   '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
                   '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
                   '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
                   '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
                   '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾',
                   '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
                   '😾'];
    
    // Create emoji picker
    emojiContainer.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-h-48 overflow-y-auto grid grid-cols-8 gap-2">
            ${emojis.map(emoji => `
                <button class="emoji-btn text-2xl hover:bg-gray-100 rounded p-1" data-emoji="${emoji}">
                    ${emoji}
                </button>
            `).join('')}
        </div>
    `;
    
    // Toggle emoji picker
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiContainer.classList.toggle('hidden');
    });
    
    // Add emoji to input
    emojiContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-btn')) {
            const emoji = e.target.dataset.emoji;
            messageInput.value += emoji;
            messageInput.focus();
            emojiContainer.classList.add('hidden');
        }
    });
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiContainer.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiContainer.classList.add('hidden');
        }
    });
}

// Handle group message click
function handleGroupMessageClick(messageId) {
    if (selectedGroupMessages.size > 0) {
        // Toggle selection
        toggleMessageSelection(messageId);
    }
}

// Toggle message selection
function toggleMessageSelection(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    if (selectedGroupMessages.has(messageId)) {
        selectedGroupMessages.delete(messageId);
        messageElement.classList.remove('bg-blue-50', 'border', 'border-blue-200');
    } else {
        selectedGroupMessages.add(messageId);
        messageElement.classList.add('bg-blue-50', 'border', 'border-blue-200');
    }
    
    updateSelectionToolbar();
}

// Update selection toolbar
function updateSelectionToolbar() {
    const toolbar = document.getElementById('groupSelectionToolbar');
    const selectedCount = document.getElementById('groupSelectedCount');
    
    if (selectedGroupMessages.size > 0) {
        toolbar.classList.remove('hidden');
        selectedCount.textContent = `${selectedGroupMessages.size} selected`;
    } else {
        toolbar.classList.add('hidden');
    }
}

// Show group message context menu
function showGroupMessageContextMenu(e, message) {
    e.preventDefault();
    
    const contextMenu = document.getElementById('groupMessageContextMenu');
    currentContextMessageId = message.id;
    
    // Update context menu based on message
    const starBtn = contextMenu.querySelector('[data-action="star"]');
    if (starBtn) {
        const isStarred = message.starredBy?.includes(currentUser.uid);
        starBtn.innerHTML = isStarred ? 
            '<i class="fas fa-star mr-2"></i>Unstar' :
            '<i class="far fa-star mr-2"></i>Star';
    }
    
    // Show delete for everyone only for sender or admin
    const deleteForEveryoneBtn = contextMenu.querySelector('[data-action="delete-for-everyone"]');
    if (deleteForEveryoneBtn) {
        const canDeleteForEveryone = message.senderId === currentUser.uid || 
                                    currentGroup?.admins?.includes(currentUser.uid);
        deleteForEveryoneBtn.style.display = canDeleteForEveryone ? 'block' : 'none';
    }
    
    // Position and show menu
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.classList.remove('hidden');
    
    // Close menu when clicking elsewhere
    const closeMenu = () => {
        contextMenu.classList.add('hidden');
        document.removeEventListener('click', closeMenu);
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 100);
}

// Show group context menu
function showGroupContextMenu(e, groupId) {
    e.preventDefault();
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'fixed bg-white rounded-lg shadow-lg border border-gray-200 z-50 min-w-48';
    contextMenu.innerHTML = `
        <div class="py-1">
            <button class="context-menu-item" data-action="open-group">
                <i class="fas fa-comments mr-2"></i>Open
            </button>
            <button class="context-menu-item" data-action="mute-group">
                <i class="fas fa-bell-slash mr-2"></i>Mute
            </button>
            <button class="context-menu-item" data-action="mark-as-read">
                <i class="fas fa-check-double mr-2"></i>Mark as read
            </button>
            <hr class="my-1">
            <button class="context-menu-item text-red-600" data-action="leave-group">
                <i class="fas fa-sign-out-alt mr-2"></i>Leave group
            </button>
        </div>
    `;
    
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    document.body.appendChild(contextMenu);
    
    // Add event listeners
    contextMenu.addEventListener('click', (menuEvent) => {
        const action = menuEvent.target.closest('[data-action]')?.dataset.action;
        
        switch (action) {
            case 'open-group':
                openGroupChat(groupId);
                break;
            case 'mute-group':
                toggleGroupMute(groupId, true);
                break;
            case 'mark-as-read':
                resetGroupUnreadCount(groupId);
                break;
            case 'leave-group':
                if (confirm('Are you sure you want to leave this group?')) {
                    leaveGroup(groupId);
                }
                break;
        }
        
        document.body.removeChild(contextMenu);
    });
    
    // Close menu when clicking elsewhere
    const closeMenu = () => {
        if (document.body.contains(contextMenu)) {
            document.body.removeChild(contextMenu);
        }
        document.removeEventListener('click', closeMenu);
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 100);
}

// Reset group unread count
function resetGroupUnreadCount(groupId) {
    const unreadCounts = JSON.parse(localStorage.getItem('groupUnreadCounts') || '{}');
    delete unreadCounts[groupId];
    localStorage.setItem('groupUnreadCounts', JSON.stringify(unreadCounts));
    
    // Update UI
    const groupItem = document.querySelector(`[data-group-id="${groupId}"]`);
    if (groupItem) {
        const unreadBadge = groupItem.querySelector('.bg-purple-500');
        if (unreadBadge) {
            unreadBadge.remove();
        }
    }
}

// Create new group with enhanced features
async function createNewGroup(groupName, description, privacy, participantIds, settings = {}) {
    try {
        if (!groupName.trim()) {
            showToast('Group name is required', 'error');
            return;
        }
        
        console.log('Creating new group:', groupName);
        showToast('Creating group...', 'info');
        
        // Generate group ID
        const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Prepare participants (creator + selected friends)
        const participants = [currentUser.uid, ...participantIds];
        
        // Generate invite link
        const inviteCode = generateInviteCode();
        const inviteLink = `${window.location.origin}/invite/${inviteCode}`;
        
        // Create group document with enhanced settings
        const groupData = {
            id: groupId,
            name: groupName.trim(),
            description: description?.trim() || '',
            privacy: privacy || 'private',
            participants: participants,
            createdBy: currentUser.uid,
            admins: [currentUser.uid], // Creator is admin
            avatar: '',
            isMuted: false,
            status: 'active',
            inviteCode: inviteCode,
            inviteLink: inviteLink,
            settings: {
                sendMessages: settings.onlyAdminsPost ? 'admins' : 'all',
                editInfo: settings.onlyAdminsEdit ? 'admins' : 'all',
                ...settings
            },
            isEncrypted: settings.isEncrypted || false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: '',
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
            typingUsers: []
        };
        
        // Add to Firestore
        await db.collection('groups').doc(groupId).set(groupData);
        
        // Send system message
        await sendSystemMessage(groupId, `${currentUserData.displayName} created the group`);
        
        // Send notification to added participants
        for (const participantId of participantIds) {
            await sendSystemMessage(groupId, `${currentUserData.displayName} added you to the group`);
        }
        
        console.log('Group created successfully:', groupId);
        showToast('Group created successfully!', 'success');
        
        // Open the new group chat
        openGroupChat(groupId);
        
        // Close modal
        const modal = document.getElementById('createGroupModal');
        if (modal) modal.classList.add('hidden');
        
        return groupId;
        
    } catch (error) {
        console.error('Error creating group:', error);
        showToast('Error creating group: ' + error.message, 'error');
        return null;
    }
}

// Generate invite code
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'GROUP-';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Send system message to group
async function sendSystemMessage(groupId, text) {
    try {
        const message = {
            text: text,
            senderId: 'system',
            senderName: 'System',
            groupId: groupId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'system',
            status: 'sent'
        };
        
        await db.collection('groupMessages').add(message);
        
    } catch (error) {
        console.error('Error sending system message:', error);
    }
}

// Add participant to group
async function addParticipantToGroup(groupId, userId) {
    try {
        if (!currentGroup || !currentGroup.admins?.includes(currentUser.uid)) {
            showToast('Only group admins can add participants', 'error');
            return;
        }
        
        // Get user info
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            showToast('User not found', 'error');
            return;
        }
        
        const userData = userDoc.data();
        
        // Add to group participants
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        
        // Send system message
        await sendSystemMessage(groupId, `${currentUserData.displayName} added ${userData.displayName} to the group`);
        
        // Send notification to added user
        sendGroupInviteNotification(groupId, userId);
        
        showToast(`${userData.displayName} added to group`, 'success');
        
        // Reload group info
        if (currentGroupId === groupId) {
            openGroupChat(groupId);
        }
        
    } catch (error) {
        console.error('Error adding participant:', error);
        showToast('Error adding participant', 'error');
    }
}

// Remove participant from group
async function removeParticipantFromGroup(groupId, userId) {
    try {
        if (!currentGroup || !currentGroup.admins?.includes(currentUser.uid)) {
            showToast('Only group admins can remove participants', 'error');
            return;
        }
        
        // Check if trying to remove self
        if (userId === currentUser.uid) {
            showToast('You cannot remove yourself. Use "Leave Group" instead.', 'warning');
            return;
        }
        
        // Get user info
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : { displayName: 'User' };
        
        // Remove from group participants
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayRemove(userId)
        });
        
        // Remove from admins if they were admin
        await db.collection('groups').doc(groupId).update({
            admins: firebase.firestore.FieldValue.arrayRemove(userId)
        });
        
        // Send system message
        await sendSystemMessage(groupId, `${userData.displayName} was removed from the group`);
        
        showToast(`${userData.displayName} removed from group`, 'success');
        
        // Reload group info
        if (currentGroupId === groupId) {
            openGroupChat(groupId);
        }
        
    } catch (error) {
        console.error('Error removing participant:', error);
        showToast('Error removing participant', 'error');
    }
}

// Leave group
async function leaveGroup(groupId) {
    try {
        if (!confirm('Are you sure you want to leave this group?')) {
            return;
        }
        
        console.log('Leaving group:', groupId);
        
        // Remove user from participants
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
        
        // Remove from admins if they were admin
        await db.collection('groups').doc(groupId).update({
            admins: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
        
        // Send system message
        await sendSystemMessage(groupId, `${currentUserData.displayName} left the group`);
        
        // Clear current group if it's the one we're leaving
        if (currentGroupId === groupId) {
            currentGroup = null;
            currentGroupId = null;
            
            // Show groups list
            const groupChatContainer = document.getElementById('groupChatContainer');
            const chatContainer = document.getElementById('chatContainer');
            
            if (groupChatContainer) groupChatContainer.classList.add('hidden');
            if (chatContainer) chatContainer.classList.remove('hidden');
        }
        
        showToast('You left the group', 'success');
        
        // Reload groups list
        loadUserGroups();
        
    } catch (error) {
        console.error('Error leaving group:', error);
        showToast('Error leaving group', 'error');
    }
}

// Delete group (admin only)
async function deleteGroup(groupId) {
    try {
        if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
            return;
        }
        
        console.log('Deleting group:', groupId);
        
        // Verify user is admin
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (!groupDoc.exists || !groupDoc.data().admins?.includes(currentUser.uid)) {
            showToast('Only group admins can delete the group', 'error');
            return;
        }
        
        // Update group status to deleted (soft delete)
        await db.collection('groups').doc(groupId).update({
            status: 'deleted',
            deletedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Clear current group if it's the one being deleted
        if (currentGroupId === groupId) {
            currentGroup = null;
            currentGroupId = null;
            
            // Show groups list
            const groupChatContainer = document.getElementById('groupChatContainer');
            const chatContainer = document.getElementById('chatContainer');
            
            if (groupChatContainer) groupChatContainer.classList.add('hidden');
            if (chatContainer) chatContainer.classList.remove('hidden');
        }
        
        showToast('Group deleted successfully', 'success');
        
        // Reload groups list
        loadUserGroups();
        
    } catch (error) {
        console.error('Error deleting group:', error);
        showToast('Error deleting group', 'error');
    }
}

// Update group info
async function updateGroupInfo(groupId, updates) {
    try {
        if (!currentGroup || !currentGroup.admins?.includes(currentUser.uid)) {
            showToast('Only group admins can update group info', 'error');
            return;
        }
        
        console.log('Updating group info:', groupId, updates);
        
        await db.collection('groups').doc(groupId).update({
            ...updates,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Send system message if name changed
        if (updates.name && updates.name !== currentGroup.name) {
            await sendSystemMessage(groupId, 
                `${currentUserData.displayName} changed the group name to "${updates.name}"`);
        }
        
        if (updates.description) {
            await sendSystemMessage(groupId, 
                `${currentUserData.displayName} updated the group description`);
        }
        
        showToast('Group info updated', 'success');
        
        // Reload group if it's the current one
        if (currentGroupId === groupId) {
            openGroupChat(groupId);
        }
        
    } catch (error) {
        console.error('Error updating group info:', error);
        showToast('Error updating group info', 'error');
    }
}

// Mute/unmute group
async function toggleGroupMute(groupId, mute) {
    try {
        // Store user's mute preference in their settings
        const userMutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '{}');
        userMutedGroups[groupId] = mute;
        localStorage.setItem('mutedGroups', JSON.stringify(userMutedGroups));
        
        // Update UI
        const muteBtn = document.getElementById('muteGroupBtn');
        if (muteBtn) {
            muteBtn.innerHTML = mute ? 
                '<i class="fas fa-bell"></i><span>Unmute</span>' :
                '<i class="fas fa-bell-slash"></i><span>Mute</span>';
        }
        
        showToast(mute ? 'Group muted' : 'Group unmuted', 'success');
        
    } catch (error) {
        console.error('Error toggling group mute:', error);
    }
}

// Make member admin
async function makeMemberAdmin(groupId, userId) {
    try {
        if (!currentGroup || currentGroup.createdBy !== currentUser.uid) {
            showToast('Only group creator can make admins', 'error');
            return;
        }
        
        // Get user info
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : { displayName: 'User' };
        
        // Add to admins
        await db.collection('groups').doc(groupId).update({
            admins: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        
        // Send system message
        await sendSystemMessage(groupId, 
            `${currentUserData.displayName} made ${userData.displayName} an admin`);
        
        showToast(`${userData.displayName} is now an admin`, 'success');
        
        // Reload group info
        if (currentGroupId === groupId) {
            openGroupChat(groupId);
        }
        
    } catch (error) {
        console.error('Error making member admin:', error);
        showToast('Error making member admin', 'error');
    }
}

// Star/unstar message
async function toggleMessageStar(messageId, star = true) {
    try {
        const messageRef = db.collection('groupMessages').doc(messageId);
        
        if (star) {
            await messageRef.update({
                starredBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
            showToast('Message starred', 'success');
        } else {
            await messageRef.update({
                starredBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
            showToast('Message unstarred', 'info');
        }
        
        // Update UI
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const starIcon = messageElement.querySelector('.fa-star');
            if (starIcon) {
                starIcon.classList.toggle('far', !star);
                starIcon.classList.toggle('fas', star);
                starIcon.classList.toggle('text-yellow-500', star);
            }
        }
        
    } catch (error) {
        console.error('Error toggling message star:', error);
        showToast('Error updating message', 'error');
    }
}

// Delete message
async function deleteGroupMessage(messageId, forEveryone = false) {
    try {
        const messageRef = db.collection('groupMessages').doc(messageId);
        const messageDoc = await messageRef.get();
        
        if (!messageDoc.exists) {
            showToast('Message not found', 'error');
            return;
        }
        
        const messageData = messageDoc.data();
        
        if (forEveryone) {
            // Only sender or admin can delete for everyone
            const canDelete = messageData.senderId === currentUser.uid || 
                             currentGroup?.admins?.includes(currentUser.uid);
            
            if (!canDelete) {
                showToast('You can only delete your own messages', 'error');
                return;
            }
            
            await messageRef.update({
                deletedForEveryone: true,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deletedBy: currentUser.uid
            });
            
            showToast('Message deleted for everyone', 'success');
        } else {
            // Delete only for current user
            await messageRef.update({
                deletedFor: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
            
            // Remove message from UI
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
            
            showToast('Message deleted', 'success');
        }
        
    } catch (error) {
        console.error('Error deleting message:', error);
        showToast('Error deleting message', 'error');
    }
}

// Reply to message
function replyToGroupMessage(message) {
    const replyPreview = document.getElementById('groupReplyPreview');
    const replySender = document.getElementById('groupReplySender');
    const replyText = document.getElementById('groupReplyText');
    
    if (replyPreview && replySender && replyText) {
        replySender.textContent = message.senderName || 'Unknown';
        replyText.textContent = message.text.length > 100 ? 
            message.text.substring(0, 100) + '...' : message.text;
        replyPreview.dataset.messageId = message.id;
        replyPreview.classList.remove('hidden');
        
        // Scroll to input
        document.getElementById('groupMessageInput')?.focus();
    }
}

// Forward message
async function forwardGroupMessage(messageId) {
    try {
        const messageDoc = await db.collection('groupMessages').doc(messageId).get();
        if (!messageDoc.exists) {
            showToast('Message not found', 'error');
            return;
        }
        
        const message = messageDoc.data();
        openForwardMessageModal(message);
        
    } catch (error) {
        console.error('Error forwarding message:', error);
        showToast('Error forwarding message', 'error');
    }
}

// Open forward message modal
function openForwardMessageModal(message) {
    const modal = document.getElementById('forwardGroupMessageModal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    modal.dataset.messageId = message.id;
    modal.dataset.messageData = JSON.stringify(message);
    
    loadForwardTargets();
}

// Load forward targets
async function loadForwardTargets() {
    const targetList = document.getElementById('forwardTargetList');
    if (!targetList) return;
    
    targetList.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    
    try {
        // Load groups
        const groupsSnapshot = await db.collection('groups')
            .where('participants', 'array-contains', currentUser.uid)
            .where('status', '==', 'active')
            .get();
        
        // Load friends
        const friendsList = friends || [];
        
        targetList.innerHTML = '';
        
        // Add groups
        groupsSnapshot.forEach(doc => {
            const group = { id: doc.id, ...doc.data(), type: 'group' };
            if (group.id !== currentGroupId) { // Don't show current group
                addForwardTarget(group, targetList);
            }
        });
        
        // Add friends
        friendsList.forEach(friend => {
            addForwardTarget({ ...friend, type: 'user' }, targetList);
        });
        
        // Add event listeners
        targetList.addEventListener('change', () => {
            updateForwardButton();
        });
        
    } catch (error) {
        console.error('Error loading forward targets:', error);
        targetList.innerHTML = '<div class="text-center py-4 text-red-500">Error loading targets</div>';
    }
}

// Add forward target to list
function addForwardTarget(target, container) {
    const targetItem = document.createElement('label');
    targetItem.className = 'flex items-center space-x-3 p-3 hover:bg-gray-100 rounded cursor-pointer';
    
    const avatar = target.photoURL || 
                  (target.type === 'group' ? 
                   `https://ui-avatars.com/api/?name=${encodeURIComponent(target.name)}&background=7C3AED&color=fff` :
                   `https://ui-avatars.com/api/?name=${encodeURIComponent(target.displayName)}&background=7C3AED&color=fff`);
    
    targetItem.innerHTML = `
        <input type="checkbox" class="forward-target-checkbox" 
               value="${target.id}" data-type="${target.type}">
        <img src="${avatar}" class="w-10 h-10 rounded-full">
        <div class="flex-1">
            <div class="font-medium">${target.type === 'group' ? target.name : target.displayName}</div>
            <div class="text-sm text-gray-500">${target.type === 'group' ? 'Group' : 'Chat'}</div>
        </div>
    `;
    
    container.appendChild(targetItem);
}

// Update forward button
function updateForwardButton() {
    const selectedCount = document.querySelectorAll('.forward-target-checkbox:checked').length;
    const confirmBtn = document.getElementById('confirmForward');
    
    if (confirmBtn) {
        confirmBtn.disabled = selectedCount === 0;
        confirmBtn.textContent = selectedCount > 0 ? 
            `Forward (${selectedCount})` : 'Forward';
    }
}

// Confirm forward
async function confirmForward() {
    const modal = document.getElementById('forwardGroupMessageModal');
    const messageId = modal?.dataset.messageId;
    const messageData = modal?.dataset.messageData ? JSON.parse(modal.dataset.messageData) : null;
    
    if (!messageId || !messageData) {
        showToast('Message data not found', 'error');
        return;
    }
    
    const selectedCheckboxes = document.querySelectorAll('.forward-target-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        showToast('Please select at least one target', 'error');
        return;
    }
    
    try {
        showToast('Forwarding message...', 'info');
        
        for (const checkbox of selectedCheckboxes) {
            const targetId = checkbox.value;
            const targetType = checkbox.dataset.type;
            
            const forwardMessage = {
                text: messageData.text,
                senderId: currentUser.uid,
                senderName: currentUserData.displayName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'sent',
                type: messageData.type,
                forwardedFrom: messageData.senderName || 'Unknown',
                originalMessageId: messageId,
                isEncrypted: messageData.isEncrypted || false
            };
            
            if (targetType === 'group') {
                forwardMessage.groupId = targetId;
                await db.collection('groupMessages').add(forwardMessage);
            } else {
                forwardMessage.receiverId = targetId;
                // For user chats, you'd add to your private messages collection
                // await db.collection('messages').add(forwardMessage);
            }
        }
        
        showToast('Message forwarded successfully', 'success');
        modal.classList.add('hidden');
        
    } catch (error) {
        console.error('Error forwarding message:', error);
        showToast('Error forwarding message', 'error');
    }
}

// Copy message text
function copyMessageText(message) {
    if (!message.text) return;
    
    navigator.clipboard.writeText(message.text).then(() => {
        showToast('Message copied to clipboard', 'success');
    }).catch(err => {
        console.error('Error copying text:', err);
        showToast('Error copying message', 'error');
    });
}

// Report message
async function reportGroupMessage(messageId, reason = 'inappropriate') {
    try {
        await db.collection('reports').add({
            messageId: messageId,
            reporterId: currentUser.uid,
            groupId: currentGroupId,
            reason: reason,
            reportedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });
        
        showToast('Message reported. Thank you for keeping our community safe.', 'success');
        
    } catch (error) {
        console.error('Error reporting message:', error);
        showToast('Error reporting message', 'error');
    }
}

// Load group media
async function loadGroupMedia(groupId, filter = 'all') {
    try {
        let query = db.collection('groupMessages')
            .where('groupId', '==', groupId)
            .where('type', '==', 'file')
            .orderBy('timestamp', 'desc')
            .limit(50);
        
        const snapshot = await query.get();
        const gallery = document.getElementById('groupMediaGallery');
        
        if (!gallery) return;
        
        gallery.innerHTML = '';
        
        if (snapshot.empty) {
            gallery.innerHTML = '<div class="col-span-4 text-center py-8 text-gray-500">No media found</div>';
            return;
        }
        
        snapshot.forEach(doc => {
            const message = doc.data();
            const file = message.file;
            
            if (!file || !file.url) return;
            
            // Apply filter
            if (filter !== 'all') {
                if (filter === 'images' && !file.type?.startsWith('image/')) return;
                if (filter === 'videos' && !file.type?.startsWith('video/')) return;
                if (filter === 'documents' && file.type?.startsWith('image/') || file.type?.startsWith('video/')) return;
            }
            
            const mediaItem = document.createElement('div');
            mediaItem.className = 'media-item cursor-pointer';
            
            if (file.type?.startsWith('image/')) {
                mediaItem.innerHTML = `
                    <img src="${file.url}" alt="${file.name}" 
                         class="w-full h-32 object-cover rounded-lg hover:opacity-90"
                         onclick="previewGroupImage('${file.url}')">
                    <div class="mt-1 text-xs text-gray-500 truncate">${file.name}</div>
                `;
            } else if (file.type?.startsWith('video/')) {
                mediaItem.innerHTML = `
                    <div class="relative">
                        <video src="${file.url}" class="w-full h-32 object-cover rounded-lg"></video>
                        <div class="absolute inset-0 flex items-center justify-center">
                            <i class="fas fa-play text-white text-2xl bg-black bg-opacity-50 p-2 rounded-full"></i>
                        </div>
                    </div>
                    <div class="mt-1 text-xs text-gray-500 truncate">${file.name}</div>
                `;
            } else {
                mediaItem.innerHTML = `
                    <div class="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                        <i class="fas fa-file text-3xl text-gray-400"></i>
                    </div>
                    <div class="mt-1 text-xs text-gray-500 truncate">${file.name}</div>
                `;
            }
            
            gallery.appendChild(mediaItem);
        });
        
    } catch (error) {
        console.error('Error loading group media:', error);
        const gallery = document.getElementById('groupMediaGallery');
        if (gallery) {
            gallery.innerHTML = '<div class="col-span-4 text-center py-8 text-red-500">Error loading media</div>';
        }
    }
}

// Preview group image
function previewGroupImage(imageUrl) {
    const previewModal = document.createElement('div');
    previewModal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
    previewModal.innerHTML = `
        <div class="relative max-w-4xl max-h-full">
            <button onclick="this.closest('.fixed').remove()" 
                    class="absolute -top-10 right-0 text-white text-2xl">
                <i class="fas fa-times"></i>
            </button>
            <img src="${imageUrl}" class="max-w-full max-h-screen">
        </div>
    `;
    document.body.appendChild(previewModal);
}

// Load starred messages
async function loadGroupStarredMessages(groupId) {
    try {
        const snapshot = await db.collection('groupMessages')
            .where('groupId', '==', groupId)
            .where('starredBy', 'array-contains', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .get();
        
        const container = document.getElementById('groupStarredMessages');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-star text-4xl mb-3 text-gray-300 block"></i>
                    <p>No starred messages</p>
                </div>
            `;
            return;
        }
        
        snapshot.forEach(doc => {
            const message = { id: doc.id, ...doc.data() };
            const messageElement = createStarredMessageElement(message);
            container.appendChild(messageElement);
        });
        
    } catch (error) {
        console.error('Error loading starred messages:', error);
        const container = document.getElementById('groupStarredMessages');
        if (container) {
            container.innerHTML = '<div class="text-center py-8 text-red-500">Error loading starred messages</div>';
        }
    }
}

// Create starred message element
function createStarredMessageElement(message) {
    const element = document.createElement('div');
    element.className = 'bg-white rounded-lg p-4 border border-gray-200';
    
    const time = message.timestamp ? message.timestamp.toDate().toLocaleString() : 'Unknown time';
    
    element.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="font-semibold">${message.senderName || 'Unknown'}</div>
            <div class="text-sm text-gray-500">${time}</div>
        </div>
        <div class="mb-3">${escapeHtml(message.text)}</div>
        <div class="flex justify-end space-x-2">
            <button class="text-blue-600 hover:text-blue-800 text-sm" 
                    onclick="openGroupChat('${message.groupId}')">
                <i class="fas fa-comment mr-1"></i>Go to chat
            </button>
            <button class="text-red-600 hover:text-red-800 text-sm" 
                    onclick="toggleMessageStar('${message.id}', false)">
                <i class="fas fa-star mr-1"></i>Unstar
            </button>
        </div>
    `;
    
    return element;
}

// Search in group
async function searchInGroup(query) {
    if (!query.trim() || !currentGroupId) return;
    
    try {
        const snapshot = await db.collection('groupMessages')
            .where('groupId', '==', currentGroupId)
            .where('text', '>=', query)
            .where('text', '<=', query + '\uf8ff')
            .orderBy('text')
            .limit(20)
            .get();
        
        const resultsContainer = document.getElementById('groupSearchResults');
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';
        
        if (snapshot.empty) {
            resultsContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p>No messages found</p>
                </div>
            `;
            return;
        }
        
        snapshot.forEach(doc => {
            const message = { id: doc.id, ...doc.data() };
            const resultElement = createSearchResultElement(message);
            resultsContainer.appendChild(resultElement);
        });
        
    } catch (error) {
        console.error('Error searching in group:', error);
        const resultsContainer = document.getElementById('groupSearchResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<div class="text-center py-8 text-red-500">Error searching messages</div>';
        }
    }
}

// Create search result element
function createSearchResultElement(message) {
    const element = document.createElement('div');
    element.className = 'bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md cursor-pointer';
    
    const time = message.timestamp ? message.timestamp.toDate().toLocaleString() : 'Unknown time';
    
    element.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="font-semibold">${message.senderName || 'Unknown'}</div>
            <div class="text-sm text-gray-500">${time}</div>
        </div>
        <div class="mb-3">${escapeHtml(message.text)}</div>
        <div class="text-right">
            <button class="text-purple-600 hover:text-purple-800 text-sm" 
                    onclick="scrollToMessage('${message.id}')">
                <i class="fas fa-arrow-right mr-1"></i>Go to message
            </button>
        </div>
    `;
    
    return element;
}

// Scroll to message
function scrollToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight the message
        messageElement.classList.add('bg-yellow-50', 'border', 'border-yellow-200');
        setTimeout(() => {
            messageElement.classList.remove('bg-yellow-50', 'border', 'border-yellow-200');
        }, 3000);
    }
    
    // Close search modal
    const searchModal = document.getElementById('groupSearchModal');
    if (searchModal) {
        searchModal.classList.add('hidden');
    }
}

// Listen for group invites
function listenForGroupInvites() {
    if (!currentUser) return;
    
    db.collection('groupInvites')
        .where('userId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot({
            next: (snapshot) => {
                console.log('Group invites snapshot:', snapshot.size, 'invites');
                groupInvites = [];
                
                snapshot.forEach(doc => {
                    groupInvites.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                renderGroupInvites();
            },
            error: (error) => {
                console.error('Error listening for group invites:', error);
            }
        });
}

// Render group invites
function renderGroupInvites() {
    const invitesSection = document.getElementById('groupInvitesSection');
    const invitesList = document.getElementById('groupInvitesList');
    
    if (!invitesSection || !invitesList) return;
    
    invitesList.innerHTML = '';
    
    if (groupInvites.length === 0) {
        invitesSection.classList.add('hidden');
        return;
    }
    
    invitesSection.classList.remove('hidden');
    
    groupInvites.forEach(invite => {
        const inviteItem = document.createElement('div');
        inviteItem.className = 'bg-blue-50 border border-blue-200 rounded-lg p-4';
        inviteItem.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-semibold text-blue-800">Invitation to join group</h4>
                    <p class="text-sm text-blue-600 mt-1">You've been invited to join a group</p>
                    <p class="text-xs text-gray-500 mt-2">Invite code: ${invite.inviteCode}</p>
                </div>
                <div class="flex space-x-2">
                    <button class="accept-invite-btn px-3 py-1 bg-green-500 text-white rounded-lg text-sm" 
                            data-invite-id="${invite.id}" data-group-id="${invite.groupId}">
                        Accept
                    </button>
                    <button class="decline-invite-btn px-3 py-1 bg-red-500 text-white rounded-lg text-sm" 
                            data-invite-id="${invite.id}">
                        Decline
                    </button>
                </div>
            </div>
        `;
        
        invitesList.appendChild(inviteItem);
    });
    
    // Add event listeners
    invitesList.addEventListener('click', function(e) {
        if (e.target.classList.contains('accept-invite-btn') || e.target.closest('.accept-invite-btn')) {
            const btn = e.target.classList.contains('accept-invite-btn') ? 
                e.target : e.target.closest('.accept-invite-btn');
            const inviteId = btn.dataset.inviteId;
            const groupId = btn.dataset.groupId;
            acceptGroupInvite(inviteId, groupId);
        }
        
        if (e.target.classList.contains('decline-invite-btn') || e.target.closest('.decline-invite-btn')) {
            const btn = e.target.classList.contains('decline-invite-btn') ? 
                e.target : e.target.closest('.decline-invite-btn');
            const inviteId = btn.dataset.inviteId;
            declineGroupInvite(inviteId);
        }
    });
}

// Accept group invite
async function acceptGroupInvite(inviteId, groupId) {
    try {
        console.log('Accepting group invite:', inviteId);
        
        // Get invite details
        const inviteDoc = await db.collection('groupInvites').doc(inviteId).get();
        if (!inviteDoc.exists) {
            showToast('Invite not found', 'error');
            return;
        }
        
        const inviteData = inviteDoc.data();
        
        // Add user to group participants
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        
        // Update invite status
        await db.collection('groupInvites').doc(inviteId).update({
            status: 'accepted',
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Send system message to group
        await sendSystemMessage(groupId, 
            `${currentUserData.displayName} joined the group via invitation`);
        
        showToast('You joined the group!', 'success');
        
        // Open the group
        openGroupChat(groupId);
        
    } catch (error) {
        console.error('Error accepting group invite:', error);
        showToast('Error accepting invite', 'error');
    }
}

// Decline group invite
async function declineGroupInvite(inviteId) {
    try {
        await db.collection('groupInvites').doc(inviteId).update({
            status: 'declined',
            declinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('Invite declined', 'info');
        
    } catch (error) {
        console.error('Error declining group invite:', error);
        showToast('Error declining invite', 'error');
    }
}

// Listen for group join requests (for admins)
function listenForGroupRequests() {
    if (!currentUser) return;
    
    // Only listen if user is admin of any groups
    const adminGroups = allGroups.filter(g => g.admins?.includes(currentUser.uid));
    if (adminGroups.length === 0) return;
    
    db.collection('groupRequests')
        .where('groupId', 'in', adminGroups.map(g => g.id))
        .where('status', '==', 'pending')
        .onSnapshot({
            next: (snapshot) => {
                console.log('Group requests snapshot:', snapshot.size, 'requests');
                groupRequests = [];
                
                snapshot.forEach(doc => {
                    groupRequests.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                // Show notification badge if there are pending requests
                const groupsTabBtn = document.getElementById('groupsTabBtn');
                if (groupsTabBtn && groupRequests.length > 0) {
                    groupsTabBtn.classList.add('has-notification');
                    const badge = document.createElement('span');
                    badge.className = 'absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center';
                    badge.textContent = groupRequests.length;
                    groupsTabBtn.style.position = 'relative';
                    groupsTabBtn.appendChild(badge);
                }
            },
            error: (error) => {
                console.error('Error listening for group requests:', error);
            }
        });
}

// Send group push notification
async function sendGroupPushNotification(groupId, senderName, message) {
    try {
        // Get group participants
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (!groupDoc.exists) return;
        
        const groupData = groupDoc.data();
        const participants = groupData.participants || [];
        
        // Send notification to each participant (except sender)
        for (const participantId of participants) {
            if (participantId === currentUser.uid) continue;
            
            // Check if user has muted this group
            const userMutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '{}');
            if (userMutedGroups[groupId]) continue;
            
            // Get participant's FCM token and send notification
            const participantDoc = await db.collection('users').doc(participantId).get();
            if (participantDoc.exists) {
                const participantData = participantDoc.data();
                const fcmToken = participantData.fcmToken;
                
                if (fcmToken) {
                    console.log(`Sending group notification to ${participantId}: ${senderName}: ${message}`);
                    // Actual FCM implementation would go here
                    
                    // For now, just update notification count
                    updateGroupUnreadCount(participantId, groupId);
                }
            }
        }
        
    } catch (error) {
        console.error('Error sending group push notification:', error);
    }
}

// Update group unread count
function updateGroupUnreadCount(userId, groupId) {
    const unreadCounts = JSON.parse(localStorage.getItem('groupUnreadCounts') || '{}');
    unreadCounts[groupId] = (unreadCounts[groupId] || 0) + 1;
    localStorage.setItem('groupUnreadCounts', JSON.stringify(unreadCounts));
}

// Send group invite notification
async function sendGroupInviteNotification(groupId, userId) {
    try {
        // Create invite document
        await db.collection('groupInvites').add({
            groupId: groupId,
            userId: userId,
            invitedBy: currentUser.uid,
            inviteCode: currentGroup?.inviteCode || generateInviteCode(),
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error('Error sending group invite notification:', error);
    }
}
// Setup group event listeners - COMPLETE VERSION
function setupGroupEventListeners() {
    console.log('Setting up enhanced group event listeners...');
    
    // ==================== MODAL CONTROLS ====================
    
    // Close modals when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });
    
    // Close modals with ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                modal.classList.add('hidden');
            });
        }
    });
    
    // Tab switching
    document.addEventListener('click', function(e) {
        if (e.target.closest('#groupsTabBtn')) {
            e.preventDefault();
            switchToTab('groups');
        }
    });
    
    // ==================== CREATE GROUP MODAL ====================
    
    // Create group button - with event delegation
    document.addEventListener('click', function(e) {
        if (e.target.closest('#createGroupBtn')) {
            e.preventDefault();
            const modal = document.getElementById('createGroupModal');
            if (modal) {
                modal.classList.remove('hidden');
                // Load friends for selection
                setTimeout(() => {
                    loadFriendsForGroupCreation();
                }, 100);
            }
        }
    });
    
    // Close create group modal
    document.getElementById('closeCreateGroup')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('createGroupModal').classList.add('hidden');
    });
    
    // Create group action
    document.getElementById('createGroupActionBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        createGroupAction();
    });
    
    // Enter key in group name field
    document.getElementById('newGroupName')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createGroupAction();
        }
    });
    
    // Search participants in create modal
    document.getElementById('searchParticipants')?.addEventListener('input', function(e) {
        searchFriendsForGroupCreation(e.target.value);
    });
    
    // ==================== JOIN GROUP MODAL ====================
    
    // Join group button
    document.addEventListener('click', function(e) {
        if (e.target.closest('#joinGroupBtn')) {
            e.preventDefault();
            const modal = document.getElementById('joinGroupModal');
            if (modal) {
                modal.classList.remove('hidden');
                loadPublicGroups();
            }
        }
    });
    
    // Close join group modal
    document.getElementById('closeJoinGroup')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('joinGroupModal').classList.add('hidden');
    });
    
    // Join by code button
    document.getElementById('joinByCodeBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        joinGroupByCode();
    });
    
    // Enter key in invite code field
    document.getElementById('groupInviteCode')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            joinGroupByCode();
        }
    });
    
    // Search public groups
    document.getElementById('searchGroups')?.addEventListener('input', function(e) {
        searchPublicGroups(e.target.value);
    });
    
    // ==================== GROUP CHAT ====================
    
    // Send group message button
    document.getElementById('groupSendBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        sendGroupMessage();
    });
    
    // Enter key in group message input
    document.getElementById('groupMessageInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendGroupMessage();
        }
    });
    
    // Cancel reply in group chat
    document.getElementById('cancelGroupReply')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('groupReplyPreview').classList.add('hidden');
    });
    
    // Back to groups (mobile)
    document.getElementById('backToGroups')?.addEventListener('click', (e) => {
        e.preventDefault();
        const groupChatContainer = document.getElementById('groupChatContainer');
        const tabsContainer = document.querySelector('.tabs');
        
        if (groupChatContainer) groupChatContainer.classList.add('hidden');
        if (tabsContainer) tabsContainer.classList.remove('hidden');
        switchToTab('groups');
    });
    
    // Group info button
    document.getElementById('groupInfoBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentGroupId) {
            showGroupInfoModal(currentGroupId);
        }
    });
    
    // ==================== GROUP INFO MODAL ====================
    
    // Close group info modal
    document.getElementById('closeGroupInfo')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('groupInfoModal').classList.add('hidden');
    });
    
    // Leave group button
    document.getElementById('leaveGroupBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentGroupId && confirm('Are you sure you want to leave this group?')) {
            leaveGroup(currentGroupId);
            document.getElementById('groupInfoModal').classList.add('hidden');
        }
    });
    
    // Mute/unmute group
    document.getElementById('muteGroupBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentGroupId) {
            const userMutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '{}');
            const isMuted = userMutedGroups[currentGroupId];
            toggleGroupMute(currentGroupId, !isMuted);
        }
    });
    
    // Delete group (admin only)
    document.getElementById('deleteGroupBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentGroupId && confirm('Are you sure you want to delete this group? This cannot be undone.')) {
            deleteGroup(currentGroupId);
            document.getElementById('groupInfoModal').classList.add('hidden');
        }
    });
    
    // Group media button
    document.getElementById('groupMediaBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentGroupId) {
            document.getElementById('groupMediaModal').classList.remove('hidden');
            loadGroupMedia(currentGroupId);
        }
    });
    
    // Group starred messages button
    document.getElementById('groupStarredBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentGroupId) {
            document.getElementById('groupStarredModal').classList.remove('hidden');
            loadGroupStarredMessages(currentGroupId);
        }
    });
    
    // Group search button
    document.getElementById('groupSearchBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentGroupId) {
            document.getElementById('groupSearchModal').classList.remove('hidden');
        }
    });
    
    // Copy invite link
    document.getElementById('copyInviteLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        const inviteLink = document.getElementById('groupInviteLink');
        if (inviteLink) {
            inviteLink.select();
            document.execCommand('copy');
            showToast('Invite link copied!', 'success');
        }
    });
    
    // Refresh invite link
    document.getElementById('refreshInviteLink')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (currentGroupId && currentGroup?.admins?.includes(currentUser.uid)) {
            const newCode = generateInviteCode();
            const newLink = `${window.location.origin}/invite/${newCode}`;
            
            await updateGroupInfo(currentGroupId, {
                inviteCode: newCode,
                inviteLink: newLink
            });
            
            document.getElementById('groupInviteLink').value = newLink;
            showToast('Invite link refreshed!', 'success');
        }
    });
    
    // Add participant button
    document.getElementById('addParticipantBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openAddParticipantModal();
    });
    
    // Change group avatar
    document.getElementById('changeGroupAvatar')?.addEventListener('click', (e) => {
        e.preventDefault();
        triggerGroupAvatarUpload();
    });
    
    // Edit group info button
    document.getElementById('editGroupInfoBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openEditGroupInfoModal();
    });
    
    // Manage admins button
    document.getElementById('manageAdminsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openManageAdminsModal();
    });
    
    // Group settings changes
    document.getElementById('groupSendMessagesSetting')?.addEventListener('change', async (e) => {
        if (currentGroupId && currentGroup?.admins?.includes(currentUser.uid)) {
            await updateGroupInfo(currentGroupId, {
                'settings.sendMessages': e.target.value
            });
        }
    });
    
    document.getElementById('groupEditInfoSetting')?.addEventListener('change', async (e) => {
        if (currentGroupId && currentGroup?.admins?.includes(currentUser.uid)) {
            await updateGroupInfo(currentGroupId, {
                'settings.editInfo': e.target.value
            });
        }
    });
    
    // ==================== GROUP MEDIA MODAL ====================
    
    // Close group media modal
    document.getElementById('closeGroupMedia')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('groupMediaModal').classList.add('hidden');
    });
    
    // Media filter buttons (event delegation)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('media-filter-btn')) {
            e.preventDefault();
            // Update active button
            document.querySelectorAll('.media-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            e.target.classList.add('active');
            
            // Reload media with filter
            const filter = e.target.dataset.filter;
            if (currentGroupId) {
                loadGroupMedia(currentGroupId, filter);
            }
        }
    });
    
    // ==================== GROUP STARRED MODAL ====================
    
    // Close group starred modal
    document.getElementById('closeGroupStarred')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('groupStarredModal').classList.add('hidden');
    });
    
    // ==================== GROUP SEARCH MODAL ====================
    
    // Close group search modal
    document.getElementById('closeGroupSearch')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('groupSearchModal').classList.add('hidden');
    });
    
    // Search in group input
    document.getElementById('searchInGroupInput')?.addEventListener('input', function(e) {
        searchInGroup(e.target.value);
    });
    
    document.getElementById('searchInGroupInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchInGroup(e.target.value);
        }
    });
    
    // ==================== GROUP ATTACHMENTS ====================
    
    // Group attach button
    document.getElementById('groupAttachBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!currentGroup) {
            showToast('Please select a group first', 'error');
            return;
        }
        
        const canSend = currentGroup.settings?.sendMessages === 'all' || 
                       currentGroup.admins?.includes(currentUser.uid);
        if (!canSend) {
            showToast('Only admins can send messages', 'error');
            return;
        }
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '*/*';
        fileInput.multiple = true;
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                Array.from(e.target.files).forEach(file => {
                    uploadGroupFile(file);
                });
            }
        });
        fileInput.click();
    });
    
    // Remove file preview
    document.getElementById('groupRemoveFile')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('groupFilePreview').classList.add('hidden');
    });
    
    // ==================== SELECTION TOOLBAR ====================
    
    // Forward selected messages
    document.getElementById('groupForwardSelected')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (selectedGroupMessages.size > 0) {
            const firstMessageId = Array.from(selectedGroupMessages)[0];
            forwardGroupMessage(firstMessageId);
        }
    });
    
    // Star selected messages
    document.getElementById('groupStarSelected')?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (selectedGroupMessages.size > 0) {
            for (const messageId of selectedGroupMessages) {
                await toggleMessageStar(messageId, true);
            }
            selectedGroupMessages.clear();
            updateSelectionToolbar();
            showToast('Messages starred', 'success');
        }
    });
    
    // Delete selected messages
    document.getElementById('groupDeleteSelected')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (selectedGroupMessages.size > 0) {
            if (confirm(`Delete ${selectedGroupMessages.size} selected messages?`)) {
                selectedGroupMessages.forEach(messageId => {
                    deleteGroupMessage(messageId, false);
                });
                selectedGroupMessages.clear();
                updateSelectionToolbar();
            }
        }
    });
    
    // Cancel selection
    document.getElementById('groupCancelSelection')?.addEventListener('click', (e) => {
        e.preventDefault();
        selectedGroupMessages.forEach(messageId => {
            const element = document.querySelector(`[data-message-id="${messageId}"]`);
            if (element) {
                element.classList.remove('bg-blue-50', 'border', 'border-blue-200');
            }
        });
        selectedGroupMessages.clear();
        updateSelectionToolbar();
    });
    
    // ==================== MESSAGE CONTEXT MENU ====================
    
    // Message context menu (event delegation)
    document.addEventListener('click', (e) => {
        const contextMenu = document.getElementById('groupMessageContextMenu');
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.classList.add('hidden');
        }
    });
    
    // ==================== FORWARD MODAL ====================
    
    // Close forward modal
    document.getElementById('closeForwardModal')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('forwardGroupMessageModal').classList.add('hidden');
    });
    
    // Cancel forward
    document.getElementById('cancelForward')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('forwardGroupMessageModal').classList.add('hidden');
    });
    
    // Confirm forward
    document.getElementById('confirmForward')?.addEventListener('click', (e) => {
        e.preventDefault();
        confirmForward();
    });
    
    // ==================== MANAGE ADMINS MODAL ====================
    
    // Close manage admins modal
    document.getElementById('closeManageAdmins')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('manageAdminsModal').classList.add('hidden');
    });
    
    // Save admin changes
    document.getElementById('saveAdminChanges')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveAdminChanges();
    });
    
    // ==================== DYNAMIC ELEMENTS (Event Delegation) ====================
    
    // Event delegation for dynamic elements
    
    // Group items click
    document.addEventListener('click', function(e) {
        const groupItem = e.target.closest('.group-item');
        if (groupItem && groupItem.dataset.groupId) {
            e.preventDefault();
            openGroupChat(groupItem.dataset.groupId);
        }
    });
    
    // Join public group buttons
    document.addEventListener('click', function(e) {
        const joinBtn = e.target.closest('.join-public-group-btn');
        if (joinBtn && joinBtn.dataset.groupId) {
            e.preventDefault();
            joinPublicGroup(joinBtn.dataset.groupId);
        }
    });
    
    // Accept/decline group invites
    document.addEventListener('click', function(e) {
        if (e.target.closest('.accept-invite-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.accept-invite-btn');
            acceptGroupInvite(btn.dataset.inviteId, btn.dataset.groupId);
        }
        
        if (e.target.closest('.decline-invite-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.decline-invite-btn');
            declineGroupInvite(btn.dataset.inviteId);
        }
    });
    
    // Group message clicks
    document.addEventListener('click', function(e) {
        const messageElement = e.target.closest('[data-message-id]');
        if (messageElement && selectedGroupMessages.size > 0) {
            e.preventDefault();
            const messageId = messageElement.dataset.messageId;
            toggleMessageSelection(messageId);
        }
    });
    
    // Group emoji button
    document.getElementById('groupEmojiBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const emojiContainer = document.getElementById('groupEmojiPickerContainer');
        if (emojiContainer) {
            emojiContainer.classList.toggle('hidden');
        }
    });
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        const emojiContainer = document.getElementById('groupEmojiPickerContainer');
        const emojiBtn = document.getElementById('groupEmojiBtn');
        
        if (emojiContainer && !emojiContainer.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiContainer.classList.add('hidden');
        }
    });
    
    // Add emoji to message
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-btn') || e.target.closest('.emoji-btn')) {
            const btn = e.target.classList.contains('emoji-btn') ? e.target : e.target.closest('.emoji-btn');
            const emoji = btn.dataset.emoji;
            const messageInput = document.getElementById('groupMessageInput');
            if (messageInput) {
                messageInput.value += emoji;
                messageInput.focus();
            }
            document.getElementById('groupEmojiPickerContainer').classList.add('hidden');
        }
    });
    
    console.log('✅ Enhanced group event listeners setup complete');
}

// Create group action - UPDATED
async function createGroupAction() {
    const groupName = document.getElementById('newGroupName')?.value.trim();
    const description = document.getElementById('newGroupDescription')?.value.trim();
    const privacy = document.getElementById('newGroupPrivacy')?.value;
    
    const onlyAdminsPost = document.getElementById('newGroupOnlyAdminsPost')?.checked || false;
    const onlyAdminsEdit = document.getElementById('newGroupOnlyAdminsEdit')?.checked || true;
    const isEncrypted = document.getElementById('newGroupEncrypted')?.checked || false;
    
    if (!groupName) {
        showToast('Group name is required', 'error');
        document.getElementById('newGroupName')?.focus();
        return;
    }
    
    // Get selected participants
    const selectedCheckboxes = document.querySelectorAll('.participant-checkbox:checked');
    const participantIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    // Validate participant IDs
    const validParticipantIds = participantIds.filter(id => 
        id && id !== 'undefined' && id !== currentUser.uid
    );
    
    if (validParticipantIds.length === 0) {
        showToast('Please select at least one friend to add to the group', 'error');
        return;
    }
    
    console.log(`Creating group with ${validParticipantIds.length} participants:`, validParticipantIds);
    
    const settings = {
        onlyAdminsPost,
        onlyAdminsEdit,
        isEncrypted
    };
    
    await createNewGroup(groupName, description, privacy, validParticipantIds, settings);
}
// Join group by code
async function joinGroupByCode() {
    const inviteInput = document.getElementById('groupInviteCode')?.value.trim();
    
    if (!inviteInput) {
        showToast('Please enter an invite code or link', 'error');
        return;
    }
    
    // Extract code from URL if it's a link
    let inviteCode = inviteInput;
    if (inviteInput.includes('/invite/')) {
        const parts = inviteInput.split('/invite/');
        inviteCode = parts[parts.length - 1];
    }
    
    try {
        // Find group by invite code
        const groupsQuery = await db.collection('groups')
            .where('inviteCode', '==', inviteCode)
            .where('status', '==', 'active')
            .get();
        
        if (groupsQuery.empty) {
            showToast('Invalid invite code or group not found', 'error');
            return;
        }
        
        const groupDoc = groupsQuery.docs[0];
        const groupId = groupDoc.id;
        const groupData = groupDoc.data();
        
        // Check if user is already a member
        if (groupData.participants?.includes(currentUser.uid)) {
            showToast('You are already a member of this group', 'info');
            openGroupChat(groupId);
            return;
        }
        
        // Check group privacy
        if (groupData.privacy === 'private' || groupData.privacy === 'hidden') {
            // Send join request
            await db.collection('groupRequests').add({
                groupId: groupId,
                userId: currentUser.uid,
                userName: currentUserData.displayName,
                userPhoto: currentUserData.photoURL,
                status: 'pending',
                requestedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            showToast('Join request sent to group admin', 'success');
            
        } else if (groupData.privacy === 'public') {
            // Join directly
            await db.collection('groups').doc(groupId).update({
                participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
            
            // Send system message
            await sendSystemMessage(groupId, 
                `${currentUserData.displayName} joined the group`);
            
            showToast('You joined the group!', 'success');
            openGroupChat(groupId);
        }
        
        // Close modal
        document.getElementById('joinGroupModal').classList.add('hidden');
        
    } catch (error) {
        console.error('Error joining group by code:', error);
        showToast('Error joining group', 'error');
    }
}

// Load friends for group creation - UPDATED
async function loadFriendsForGroupCreation() {
    const participantsList = document.getElementById('participantsList');
    if (!participantsList) {
        console.error('❌ participantsList element not found');
        showToast('Error loading participants list', 'error');
        return;
    }
    
    // Show loading state
    participantsList.innerHTML = `
        <div class="text-center py-8">
            <i class="fas fa-spinner fa-spin text-3xl text-purple-500 mb-3 block"></i>
            <p class="text-gray-600">Loading friends...</p>
        </div>
    `;
    
    try {
        // Check if friends are already loaded in main chat system
        if (!window.friends || window.friends.length === 0) {
            console.log('Friends array not found, trying to load from chat system...');
            
            // Try to get friends from main chat system
            if (typeof window.getAllFriends === 'function') {
                console.log('Calling getAllFriends from chat system...');
                window.friends = await window.getAllFriends();
            } 
            // Try alternative function name
            else if (typeof window.loadFriends === 'function') {
                console.log('Calling loadFriends from chat system...');
                await window.loadFriends();
            }
            
            // If still no friends, fetch directly
            if (!window.friends || window.friends.length === 0) {
                console.log('Fetching friends directly...');
                window.friends = await fetchFriendsDirectly();
            }
        }
        
        // Check again
        if (!window.friends || window.friends.length === 0) {
            console.log('No friends found after all attempts');
            participantsList.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-user-friends text-4xl text-gray-300 mb-3 block"></i>
                    <h4 class="font-semibold text-gray-700 mb-2">No Friends Yet</h4>
                    <p class="text-gray-500 text-sm mb-4">Add some friends first to create a group</p>
                    <button onclick="switchToTab('chats')" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                        Go to Chats
                    </button>
                </div>
            `;
            return;
        }
        
        console.log(`✅ Loaded ${window.friends.length} friends for group creation:`, window.friends);
        
        // Clear and render friends list
        participantsList.innerHTML = '';
        
        window.friends.forEach((friend, index) => {
            const friendItem = document.createElement('div');
            friendItem.className = 'friend-item flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors duration-150';
            friendItem.innerHTML = `
                <div class="flex items-center space-x-3 flex-1">
                    <div class="relative">
                        <img class="w-10 h-10 rounded-full object-cover" 
                             src="${friend.photoURL || friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName || friend.name || 'User')}&background=7C3AED&color=fff&bold=true`}" 
                             alt="${friend.displayName || friend.name || 'User'}"
                             onerror="this.src='https://ui-avatars.com/api/?name=User&background=7C3AED&color=fff'">
                        <div class="absolute bottom-0 right-0 w-3 h-3 ${friend.status === 'online' ? 'bg-green-500' : 'bg-gray-400'} rounded-full border-2 border-white"></div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-medium text-gray-800 truncate">${friend.displayName || friend.name || 'Unknown User'}</h4>
                        <p class="text-sm text-gray-500 truncate">${friend.email || friend.username || friend.status || ''}</p>
                    </div>
                </div>
                <input type="checkbox" 
                       class="participant-checkbox w-5 h-5 text-purple-600 rounded focus:ring-purple-500" 
                       value="${friend.id || friend.uid || index}"
                       data-name="${friend.displayName || friend.name || 'User'}">
            `;
            
            participantsList.appendChild(friendItem);
        });
        
        // Add event listeners for checkboxes
        const checkboxes = participantsList.querySelectorAll('.participant-checkbox');
        const selectedCount = document.getElementById('selectedCount');
        
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const label = this.closest('.friend-item');
                if (this.checked) {
                    label.classList.add('bg-purple-50', 'border', 'border-purple-200');
                    label.classList.remove('hover:bg-gray-50');
                } else {
                    label.classList.remove('bg-purple-50', 'border', 'border-purple-200');
                    label.classList.add('hover:bg-gray-50');
                }
                
                // Update count
                const selected = participantsList.querySelectorAll('.participant-checkbox:checked').length;
                if (selectedCount) {
                    selectedCount.textContent = `${selected} selected`;
                    selectedCount.classList.toggle('text-purple-600', selected > 0);
                }
            });
        });
        
        // Add search functionality
        const searchInput = document.getElementById('searchParticipants');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                const query = e.target.value.toLowerCase().trim();
                const friendItems = participantsList.querySelectorAll('.friend-item');
                
                friendItems.forEach(item => {
                    const name = item.querySelector('h4').textContent.toLowerCase();
                    const email = item.querySelector('p').textContent.toLowerCase();
                    const isVisible = name.includes(query) || email.includes(query);
                    item.style.display = isVisible ? 'flex' : 'none';
                });
            });
        }
        
    } catch (error) {
        console.error('❌ Error loading friends for group creation:', error);
        participantsList.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-exclamation-triangle text-4xl text-red-300 mb-3 block"></i>
                <h4 class="font-semibold text-gray-700 mb-2">Error Loading Friends</h4>
                <p class="text-gray-500 text-sm">${error.message || 'Please try again'}</p>
                <button onclick="loadFriendsForGroupCreation()" class="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                    Retry
                </button>
            </div>
        `;
    }
}
// Search friends for group creation - UPDATED VERSION
function searchFriendsForGroupCreation(query) {
    const participantsList = document.getElementById('participantsList');
    if (!participantsList || !window.friends || window.friends.length === 0) {
        loadFriendsForGroupCreation(); // Reload if empty
        return;
    }
    
    if (!query || query.trim() === '') {
        // Show all friends when search is cleared
        loadFriendsForGroupCreation();
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    const filteredFriends = window.friends.filter(friend => 
        (friend.displayName && friend.displayName.toLowerCase().includes(searchTerm)) ||
        (friend.name && friend.name.toLowerCase().includes(searchTerm)) ||
        (friend.email && friend.email.toLowerCase().includes(searchTerm)) ||
        (friend.username && friend.username.toLowerCase().includes(searchTerm))
    );
    
    participantsList.innerHTML = '';
    
    if (filteredFriends.length === 0) {
        participantsList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-search text-3xl mb-3 text-gray-300 block"></i>
                <p>No friends found for "${query}"</p>
            </div>
        `;
        return;
    }
    
    filteredFriends.forEach(friend => {
        const friendItem = document.createElement('label');
        friendItem.className = 'flex items-center justify-between p-3 hover:bg-gray-100 rounded cursor-pointer';
        friendItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <img class="w-10 h-10 rounded-full" 
                     src="${friend.photoURL || friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName || friend.name)}&background=7C3AED&color=fff`}" 
                     alt="${friend.displayName || friend.name}">
                <div>
                    <p class="font-medium">${friend.displayName || friend.name}</p>
                    <p class="text-sm text-gray-500">${friend.status || 'offline'}</p>
                </div>
            </div>
            <input type="checkbox" class="participant-checkbox" value="${friend.id || friend.uid}">
        `;
        
        participantsList.appendChild(friendItem);
    });
}

// Load public groups
async function loadPublicGroups() {
    const publicGroupsList = document.getElementById('publicGroupsList');
    if (!publicGroupsList) return;
    
    try {
        const publicGroupsQuery = await db.collection('groups')
            .where('privacy', '==', 'public')
            .where('status', '==', 'active')
            .limit(20)
            .get();
        
        publicGroupsList.innerHTML = '';
        
        if (publicGroupsQuery.empty) {
            publicGroupsList.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <p>No public groups available</p>
                </div>
            `;
            return;
        }
        
        publicGroupsQuery.forEach(doc => {
            const group = {
                id: doc.id,
                ...doc.data()
            };
            
            // Skip groups user is already in
            if (group.participants?.includes(currentUser.uid)) return;
            
            const groupItem = document.createElement('div');
            groupItem.className = 'group-item bg-white rounded-lg p-4 mb-3 border border-gray-200 hover:shadow-md cursor-pointer';
            groupItem.dataset.groupId = group.id;
            groupItem.innerHTML = `
                <div class="flex items-center space-x-3">
                    <img class="w-12 h-12 rounded-full" 
                         src="${group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=7C3AED&color=fff`}" 
                         alt="${group.name}">
                    <div class="flex-1">
                        <h4 class="font-semibold">${group.name}</h4>
                        <p class="text-sm text-gray-500">${group.description || 'No description'}</p>
                        <div class="flex items-center justify-between mt-2">
                            <span class="text-xs text-gray-400">${group.participants?.length || 0} members</span>
                            <button class="join-public-group-btn px-3 py-1 bg-green-500 text-white rounded-lg text-sm" 
                                    data-group-id="${group.id}">
                                Join
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            publicGroupsList.appendChild(groupItem);
        });
        
        // Add join event listeners
        publicGroupsList.addEventListener('click', function(e) {
            if (e.target.closest('.join-public-group-btn')) {
                const btn = e.target.closest('.join-public-group-btn');
                const groupId = btn.dataset.groupId;
                joinPublicGroup(groupId);
            }
        });
        
    } catch (error) {
        console.error('Error loading public groups:', error);
        publicGroupsList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <p>Error loading groups</p>
            </div>
        `;
    }
}

// Join public group
async function joinPublicGroup(groupId) {
    try {
        // Add user to group
        await db.collection('groups').doc(groupId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        
        // Send system message
        await sendSystemMessage(groupId, 
            `${currentUserData.displayName} joined the group`);
        
        showToast('You joined the group!', 'success');
        
        // Close modal and open group
        document.getElementById('joinGroupModal').classList.add('hidden');
        openGroupChat(groupId);
        
    } catch (error) {
        console.error('Error joining public group:', error);
        showToast('Error joining group', 'error');
    }
}

// Search public groups
async function searchPublicGroups(query) {
    const publicGroupsList = document.getElementById('publicGroupsList');
    if (!publicGroupsList || !query) {
        loadPublicGroups();
        return;
    }
    
    try {
        const publicGroupsQuery = await db.collection('groups')
            .where('privacy', '==', 'public')
            .where('status', '==', 'active')
            .get();
        
        publicGroupsList.innerHTML = '';
        
        const filteredGroups = [];
        publicGroupsQuery.forEach(doc => {
            const group = {
                id: doc.id,
                ...doc.data()
            };
            
            // Skip groups user is already in
            if (group.participants?.includes(currentUser.uid)) return;
            
            // Filter by name or description
            if (group.name.toLowerCase().includes(query.toLowerCase()) ||
                (group.description && group.description.toLowerCase().includes(query.toLowerCase()))) {
                filteredGroups.push(group);
            }
        });
        
        if (filteredGroups.length === 0) {
            publicGroupsList.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <p>No groups found</p>
                </div>
            `;
            return;
        }
        
        filteredGroups.forEach(group => {
            const groupItem = document.createElement('div');
            groupItem.className = 'group-item bg-white rounded-lg p-4 mb-3 border border-gray-200 hover:shadow-md cursor-pointer';
            groupItem.dataset.groupId = group.id;
            groupItem.innerHTML = `
                <div class="flex items-center space-x-3">
                    <img class="w-12 h-12 rounded-full" 
                         src="${group.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=7C3AED&color=fff`}" 
                         alt="${group.name}">
                    <div class="flex-1">
                        <h4 class="font-semibold">${group.name}</h4>
                        <p class="text-sm text-gray-500">${group.description || 'No description'}</p>
                        <div class="flex items-center justify-between mt-2">
                            <span class="text-xs text-gray-400">${group.participants?.length || 0} members</span>
                            <button class="join-public-group-btn px-3 py-1 bg-green-500 text-white rounded-lg text-sm" 
                                    data-group-id="${group.id}">
                                Join
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            publicGroupsList.appendChild(groupItem);
        });
        
    } catch (error) {
        console.error('Error searching public groups:', error);
    }
}

// Search groups in main list
function searchGroups(query) {
    const groupsList = document.getElementById('groupsList');
    if (!groupsList || !allGroups || allGroups.length === 0) return;
    
    if (!query) {
        renderGroupsList(allGroups);
        return;
    }
    
    const filteredGroups = allGroups.filter(group => 
        group.name.toLowerCase().includes(query.toLowerCase()) ||
        (group.description && group.description.toLowerCase().includes(query.toLowerCase()))
    );
    
    renderGroupsList(filteredGroups);
}

// Show group info modal
async function showGroupInfoModal(groupId) {
    try {
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (!groupDoc.exists) {
            showToast('Group not found', 'error');
            return;
        }
        
        const groupData = groupDoc.data();
        
        // Update modal content
        document.getElementById('groupInfoName').textContent = groupData.name;
        document.getElementById('groupInfoDescription').textContent = groupData.description || 'No description';
        document.getElementById('groupInfoAvatar').src = 
            groupData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(groupData.name)}&background=7C3AED&color=fff`;
        
        // Update invite link
        const inviteLinkInput = document.getElementById('groupInviteLink');
        if (inviteLinkInput) {
            inviteLinkInput.value = groupData.inviteLink || `${window.location.origin}/invite/${groupData.inviteCode}`;
        }
        
        // Format creation date
        const createdDate = groupData.createdAt?.toDate() || new Date();
        document.getElementById('groupInfoMeta').textContent = 
            `Created on ${createdDate.toLocaleDateString()} • ${groupData.participants?.length || 0} members`;
        
        // Update settings
        const sendMessagesSetting = document.getElementById('groupSendMessagesSetting');
        const editInfoSetting = document.getElementById('groupEditInfoSetting');
        
        if (sendMessagesSetting) {
            sendMessagesSetting.value = groupData.settings?.sendMessages || 'all';
        }
        if (editInfoSetting) {
            editInfoSetting.value = groupData.settings?.editInfo || 'admins';
        }
        
        // Load participants
        await loadGroupParticipants(groupId, groupData.participants);
        
        // Show admin actions if user is admin
        const adminActionsSection = document.getElementById('adminActionsSection');
        if (adminActionsSection) {
            const isAdmin = groupData.admins?.includes(currentUser.uid);
            adminActionsSection.classList.toggle('hidden', !isAdmin);
        }
        
        // Update mute button state
        const muteBtn = document.getElementById('muteGroupBtn');
        if (muteBtn) {
            const userMutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '{}');
            const isMuted = userMutedGroups[groupId];
            muteBtn.innerHTML = isMuted ? 
                '<i class="fas fa-bell"></i><span>Unmute</span>' :
                '<i class="fas fa-bell-slash"></i><span>Mute</span>';
        }
        
        // Show encryption indicator
        const encryptionIndicator = document.getElementById('encryptionIndicator');
        if (encryptionIndicator) {
            encryptionIndicator.classList.toggle('hidden', !groupData.isEncrypted);
        }
        
        // Show modal
        document.getElementById('groupInfoModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error showing group info:', error);
        showToast('Error loading group info', 'error');
    }
}

// Load group participants
async function loadGroupParticipants(groupId, participantIds) {
    const participantsList = document.getElementById('groupParticipantsList');
    if (!participantsList || !participantIds) return;
    
    participantsList.innerHTML = '';
    
    // Get group data to check admins
    const groupDoc = await db.collection('groups').doc(groupId).get();
    const groupData = groupDoc.exists ? groupDoc.data() : { admins: [] };
    
    // Load each participant
    const participantPromises = participantIds.map(async (userId) => {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            return {
                id: userId,
                ...userDoc.data()
            };
        }
        return null;
    });
    
    const participants = (await Promise.all(participantPromises)).filter(p => p !== null);
    
    // Sort: admins first, then by name
    participants.sort((a, b) => {
        const aIsAdmin = groupData.admins?.includes(a.id);
        const bIsAdmin = groupData.admins?.includes(b.id);
        
        if (aIsAdmin && !bIsAdmin) return -1;
        if (!aIsAdmin && bIsAdmin) return 1;
        
        return a.displayName?.localeCompare(b.displayName);
    });
    
    // Render participants
    participants.forEach(participant => {
        const isAdmin = groupData.admins?.includes(participant.id);
        const isSelf = participant.id === currentUser.uid;
        
        const participantItem = document.createElement('div');
        participantItem.className = 'flex items-center justify-between p-2 hover:bg-gray-100 rounded';
        participantItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <img class="w-10 h-10 rounded-full" 
                     src="${participant.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.displayName)}&background=7C3AED&color=fff`}" 
                     alt="${participant.displayName}">
                <div>
                    <p class="font-medium">
                        ${participant.displayName}
                        ${isSelf ? ' (You)' : ''}
                    </p>
                    <p class="text-sm text-gray-500">
                        ${isAdmin ? 'Admin' : 'Member'}
                        ${participant.status === 'online' ? ' • Online' : ''}
                    </p>
                </div>
            </div>
            ${!isSelf && groupData.admins?.includes(currentUser.uid) ? `
                <div class="flex space-x-1">
                    ${!isAdmin ? `
                        <button class="make-admin-btn p-1 text-blue-600 hover:text-blue-800" 
                                data-user-id="${participant.id}" title="Make Admin">
                            <i class="fas fa-user-shield"></i>
                        </button>
                    ` : ''}
                    <button class="remove-participant-btn p-1 text-red-600 hover:text-red-800" 
                            data-user-id="${participant.id}" title="Remove">
                        <i class="fas fa-user-times"></i>
                    </button>
                </div>
            ` : ''}
        `;
        
        participantsList.appendChild(participantItem);
    });
    
    // Add event listeners for admin actions
    participantsList.addEventListener('click', function(e) {
        if (e.target.closest('.make-admin-btn')) {
            const btn = e.target.closest('.make-admin-btn');
            const userId = btn.dataset.userId;
            makeMemberAdmin(groupId, userId);
        }
        
        if (e.target.closest('.remove-participant-btn')) {
            const btn = e.target.closest('.remove-participant-btn');
            const userId = btn.dataset.userId;
            if (confirm('Remove this member from the group?')) {
                removeParticipantFromGroup(groupId, userId);
            }
        }
    });
}

// Upload file to group
async function uploadGroupFile(file) {
    if (!currentGroup) {
        showToast('Please select a group first', 'error');
        return;
    }
    
    // Check if user can send messages
    const canSend = currentGroup.settings?.sendMessages === 'all' || 
                   currentGroup.admins?.includes(currentUser.uid);
    if (!canSend) {
        showToast('Only admins can send messages in this group', 'error');
        return;
    }
    
    try {
        console.log('Uploading file to group:', file.name);
        showToast('Uploading file...', 'info');
        
        // Show file preview
        const filePreview = document.getElementById('groupFilePreview');
        const fileName = document.getElementById('groupFileName');
        const fileSize = document.getElementById('groupFileSize');
        
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);
        if (filePreview) filePreview.classList.remove('hidden');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`group_files/${currentGroup.id}/${Date.now()}_${file.name}`);
        const uploadTask = fileRef.put(file);
        
        // Track upload progress
        const progressBar = document.getElementById('groupUploadProgressBar');
        
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload progress:', progress + '%');
                if (progressBar) progressBar.style.width = `${progress}%`;
            },
            (error) => {
                console.error('Error uploading file:', error);
                showToast('Error uploading file', 'error');
                if (filePreview) filePreview.classList.add('hidden');
            },
            async () => {
                // Upload completed
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Create message with file
                const message = {
                    text: `Shared a file: ${file.name}`,
                    senderId: currentUser.uid,
                    senderName: currentUserData.displayName,
                    groupId: currentGroup.id,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    type: 'file',
                    file: {
                        name: file.name,
                        url: downloadURL,
                        type: file.type,
                        size: file.size
                    },
                    isEncrypted: currentGroup.isEncrypted || false
                };
                
                // Add message to Firebase
                await db.collection('groupMessages').add(message);
                
                // Update group's last message
                await db.collection('groups').doc(currentGroup.id).update({
                    lastMessage: `Shared a file: ${file.name}`,
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                    lastActivity: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Hide file preview
                if (filePreview) filePreview.classList.add('hidden');
                
                console.log('File uploaded to group successfully');
                showToast('File uploaded successfully', 'success');
            }
        );
        
    } catch (error) {
        console.error('Error uploading group file:', error);
        showToast('Error uploading file', 'error');
    }
}

// Open add participant modal
function openAddParticipantModal() {
    // Create modal for adding participants
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div class="modal-header mb-4">
                <h3 class="text-xl font-semibold">Add Participants</h3>
                <button id="closeAddParticipant" class="text-gray-500 hover:text-gray-700 float-right">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <input type="text" id="searchAddParticipants" 
                       class="w-full p-3 border border-gray-300 rounded-lg mb-4" 
                       placeholder="Search friends...">
                
                <div id="addParticipantsList" class="max-h-64 overflow-y-auto border rounded-lg p-2">
                    <!-- Friends list will be populated here -->
                </div>
                
                <div class="mt-4 flex justify-end space-x-3">
                    <button id="cancelAddParticipant" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        Cancel
                    </button>
                    <button id="confirmAddParticipants" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                        Add Selected
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load friends for selection
    loadFriendsForAdding(modal);
    
    // Add event listeners
    modal.querySelector('#closeAddParticipant').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#cancelAddParticipant').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#confirmAddParticipants').addEventListener('click', () => {
        const selectedCheckboxes = modal.querySelectorAll('.add-participant-checkbox:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
        
        if (selectedIds.length === 0) {
            showToast('Please select at least one friend', 'error');
            return;
        }
        
        // Add each selected friend to the group
        selectedIds.forEach(userId => {
            addParticipantToGroup(currentGroupId, userId);
        });
        
        document.body.removeChild(modal);
    });
    
    // Search functionality
    modal.querySelector('#searchAddParticipants').addEventListener('input', (e) => {
        searchFriendsForAdding(modal, e.target.value);
    });
    
    // Close when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function loadFriendsForAdding(modal) {
    const participantsList = modal.querySelector('#addParticipantsList');
    if (!participantsList || !friends || friends.length === 0) {
        participantsList.innerHTML = '<p class="text-center text-gray-500 py-4">No friends available</p>';
        return;
    }
    
    // Filter out friends already in the group
    const groupParticipants = currentGroup?.participants || [];
    const availableFriends = friends.filter(friend => !groupParticipants.includes(friend.id));
    
    if (availableFriends.length === 0) {
        participantsList.innerHTML = '<p class="text-center text-gray-500 py-4">All friends are already in the group</p>';
        return;
    }
    
    participantsList.innerHTML = '';
    
    availableFriends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'flex items-center justify-between p-2 hover:bg-gray-100 rounded';
        friendItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <img class="w-10 h-10 rounded-full" 
                     src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" 
                     alt="${friend.displayName}">
                <div>
                    <p class="font-medium">${friend.displayName}</p>
                    <p class="text-sm text-gray-500">${friend.status || 'offline'}</p>
                </div>
            </div>
            <input type="checkbox" class="add-participant-checkbox" value="${friend.id}">
        `;
        
        participantsList.appendChild(friendItem);
    });
}

function searchFriendsForAdding(modal, query) {
    const participantsList = modal.querySelector('#addParticipantsList');
    if (!participantsList) return;
    
    const groupParticipants = currentGroup?.participants || [];
    let filteredFriends = friends.filter(friend => !groupParticipants.includes(friend.id));
    
    if (query) {
        filteredFriends = filteredFriends.filter(friend => 
            friend.displayName.toLowerCase().includes(query.toLowerCase()) ||
            (friend.email && friend.email.toLowerCase().includes(query.toLowerCase()))
        );
    }
    
    participantsList.innerHTML = '';
    
    if (filteredFriends.length === 0) {
        participantsList.innerHTML = '<p class="text-center text-gray-500 py-4">No friends found</p>';
        return;
    }
    
    filteredFriends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'flex items-center justify-between p-2 hover:bg-gray-100 rounded';
        friendItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <img class="w-10 h-10 rounded-full" 
                     src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" 
                     alt="${friend.displayName}">
                <div>
                    <p class="font-medium">${friend.displayName}</p>
                    <p class="text-sm text-gray-500">${friend.status || 'offline'}</p>
                </div>
            </div>
            <input type="checkbox" class="add-participant-checkbox" value="${friend.id}">
        `;
        
        participantsList.appendChild(friendItem);
    });
}

// Open edit group info modal
function openEditGroupInfoModal() {
    // Create modal for editing group info
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div class="modal-header mb-4">
                <h3 class="text-xl font-semibold">Edit Group Info</h3>
                <button id="closeEditGroupInfo" class="text-gray-500 hover:text-gray-700 float-right">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                    <input type="text" id="editGroupName" 
                           class="w-full p-3 border border-gray-300 rounded-lg" 
                           value="${currentGroup?.name || ''}">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea id="editGroupDescription" 
                              class="w-full p-3 border border-gray-300 rounded-lg" 
                              rows="3">${currentGroup?.description || ''}</textarea>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Group Privacy</label>
                    <select id="editGroupPrivacy" class="w-full p-3 border border-gray-300 rounded-lg">
                        <option value="public" ${currentGroup?.privacy === 'public' ? 'selected' : ''}>Public - Anyone can join</option>
                        <option value="private" ${currentGroup?.privacy === 'private' ? 'selected' : ''}>Private - Invite only</option>
                        <option value="hidden" ${currentGroup?.privacy === 'hidden' ? 'selected' : ''}>Hidden - Admin adds members</option>
                    </select>
                </div>
                
                <div class="flex justify-end space-x-3 pt-4">
                    <button id="cancelEditGroupInfo" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        Cancel
                    </button>
                    <button id="saveGroupInfo" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelector('#closeEditGroupInfo').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#cancelEditGroupInfo').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#saveGroupInfo').addEventListener('click', () => {
        const name = modal.querySelector('#editGroupName').value.trim();
        const description = modal.querySelector('#editGroupDescription').value.trim();
        const privacy = modal.querySelector('#editGroupPrivacy').value;
        
        if (!name) {
            showToast('Group name is required', 'error');
            return;
        }
        
        updateGroupInfo(currentGroupId, {
            name: name,
            description: description,
            privacy: privacy
        });
        
        document.body.removeChild(modal);
    });
    
    // Enter key to save
    modal.querySelector('#editGroupName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            modal.querySelector('#saveGroupInfo').click();
        }
    });
    
    // Close when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Trigger group avatar upload
function triggerGroupAvatarUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadGroupAvatar(e.target.files[0]);
        }
    });
    fileInput.click();
}

// Upload group avatar
async function uploadGroupAvatar(file) {
    try {
        if (!file || !file.type.startsWith('image/')) {
            showToast('Please select a valid image file', 'error');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showToast('Image size should be less than 5MB', 'error');
            return;
        }
        
        showToast('Uploading group avatar...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`group_avatars/${currentGroupId}_${Date.now()}`);
        const uploadTask = fileRef.put(file);
        
        uploadTask.on('state_changed',
            null,
            (error) => {
                console.error('Error uploading avatar:', error);
                showToast('Error uploading avatar', 'error');
            },
            async () => {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Update group in Firestore
                await db.collection('groups').doc(currentGroupId).update({
                    avatar: downloadURL,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update UI
                const groupAvatar = document.getElementById('groupAvatar');
                const groupInfoAvatar = document.getElementById('groupInfoAvatar');
                
                if (groupAvatar) groupAvatar.src = downloadURL + '?t=' + Date.now();
                if (groupInfoAvatar) groupInfoAvatar.src = downloadURL + '?t=' + Date.now();
                
                // Send system message
                await sendSystemMessage(currentGroupId, 
                    `${currentUserData.displayName} changed the group photo`);
                
                showToast('Group avatar updated successfully!', 'success');
            }
        );
        
    } catch (error) {
        console.error('Error uploading group avatar:', error);
        showToast('Error uploading group avatar: ' + error.message, 'error');
    }
}

// Open manage admins modal
async function openManageAdminsModal() {
    const modal = document.getElementById('manageAdminsModal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    await loadAdminManagementList();
}
// Add this function to fetch friends if not available
async function fetchFriendsDirectly() {
    try {
        console.log('Fetching friends directly from Firestore...');
        
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists) {
            console.log('User document not found');
            return [];
        }
        
        const userData = userDoc.data();
        const friendIds = userData.friends || [];
        
        console.log(`Found ${friendIds.length} friend IDs:`, friendIds);
        
        if (friendIds.length === 0) {
            return [];
        }
        
        // Fetch friend details
        const friendsPromises = friendIds.map(async (friendId) => {
            try {
                const friendDoc = await db.collection('users').doc(friendId).get();
                if (friendDoc.exists) {
                    const friendData = friendDoc.data();
                    return {
                        id: friendId,
                        displayName: friendData.displayName || 'Unknown User',
                        photoURL: friendData.photoURL || null,
                        status: friendData.status || 'offline',
                        email: friendData.email || '',
                        lastSeen: friendData.lastSeen
                    };
                }
                return null;
            } catch (error) {
                console.error(`Error fetching friend ${friendId}:`, error);
                return null;
            }
        });
        
        const friends = (await Promise.all(friendsPromises)).filter(friend => friend !== null);
        console.log(`Successfully loaded ${friends.length} friends`);
        
        // Store in global variable
        window.friends = friends;
        return friends;
        
    } catch (error) {
        console.error('Error fetching friends:', error);
        return [];
    }
}
// Load admin management list
async function loadAdminManagementList() {
    const adminList = document.getElementById('adminManagementList');
    if (!adminList || !currentGroup) return;
    
    adminList.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    
    try {
        // Get all participants
        const participantPromises = currentGroup.participants.map(async (userId) => {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                return {
                    id: userId,
                    ...userDoc.data(),
                    isAdmin: currentGroup.admins?.includes(userId) || false
                };
            }
            return null;
        });
        
        const participants = (await Promise.all(participantPromises)).filter(p => p !== null);
        
        adminList.innerHTML = '';
        
        participants.forEach(participant => {
            const adminItem = document.createElement('div');
            adminItem.className = 'flex items-center justify-between p-3 hover:bg-gray-100 rounded';
            adminItem.innerHTML = `
                <div class="flex items-center space-x-3">
                    <img class="w-10 h-10 rounded-full" 
                         src="${participant.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.displayName)}&background=7C3AED&color=fff`}" 
                         alt="${participant.displayName}">
                    <div>
                        <p class="font-medium">${participant.displayName}</p>
                        <p class="text-sm text-gray-500">${participant.isAdmin ? 'Admin' : 'Member'}</p>
                    </div>
                </div>
                <div class="flex items-center">
                    <input type="checkbox" class="admin-toggle" 
                           ${participant.isAdmin ? 'checked' : ''} 
                           ${participant.id === currentGroup.createdBy ? 'disabled' : ''}
                           data-user-id="${participant.id}">
                </div>
            `;
            
            adminList.appendChild(adminItem);
        });
        
    } catch (error) {
        console.error('Error loading admin management list:', error);
        adminList.innerHTML = '<div class="text-center py-4 text-red-500">Error loading list</div>';
    }
}

// Save admin changes
async function saveAdminChanges() {
    if (!currentGroupId) return;
    
    const adminToggles = document.querySelectorAll('.admin-toggle');
    const newAdmins = [];
    
    adminToggles.forEach(toggle => {
        if (toggle.checked) {
            newAdmins.push(toggle.dataset.userId);
        }
    });
    
    // Ensure creator is always admin
    if (!newAdmins.includes(currentGroup.createdBy)) {
        newAdmins.push(currentGroup.createdBy);
    }
    
    try {
        await db.collection('groups').doc(currentGroupId).update({
            admins: newAdmins
        });
        
        // Send system message for added/removed admins
        const oldAdmins = currentGroup.admins || [];
        const addedAdmins = newAdmins.filter(admin => !oldAdmins.includes(admin));
        const removedAdmins = oldAdmins.filter(admin => !newAdmins.includes(admin));
        
        for (const adminId of addedAdmins) {
            if (adminId !== currentUser.uid) {
                const userDoc = await db.collection('users').doc(adminId).get();
                const userName = userDoc.exists ? userDoc.data().displayName : 'User';
                await sendSystemMessage(currentGroupId, 
                    `${userName} was made an admin`);
            }
        }
        
        for (const adminId of removedAdmins) {
            if (adminId !== currentGroup.createdBy) {
                const userDoc = await db.collection('users').doc(adminId).get();
                const userName = userDoc.exists ? userDoc.data().displayName : 'User';
                await sendSystemMessage(currentGroupId, 
                    `${userName} is no longer an admin`);
            }
        }
        
        showToast('Admin settings updated', 'success');
        document.getElementById('manageAdminsModal').classList.add('hidden');
        
        // Reload group info
        if (currentGroupId) {
            const groupDoc = await db.collection('groups').doc(currentGroupId).get();
            if (groupDoc.exists) {
                currentGroup = { id: currentGroupId, ...groupDoc.data() };
                showGroupInfoModal(currentGroupId);
            }
        }
        
    } catch (error) {
        console.error('Error saving admin changes:', error);
        showToast('Error updating admin settings', 'error');
    }
}


// Switch to tab
function switchToTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-active', 'text-gray-800');
        btn.classList.add('text-gray-500');
    });
    
    const tabBtn = document.getElementById(`${tabName}TabBtn`);
    if (tabBtn) {
        tabBtn.classList.add('tab-active', 'text-gray-800');
        tabBtn.classList.remove('text-gray-500');
    }
    
    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    const tabPanel = document.getElementById(`${tabName}Tab`);
    if (tabPanel) {
        tabPanel.classList.remove('hidden');
    }
    
    // Hide chat containers
    const chatContainer = document.getElementById('chatContainer');
    const groupChatContainer = document.getElementById('groupChatContainer');
    
    if (chatContainer) chatContainer.classList.add('hidden');
    if (groupChatContainer) groupChatContainer.classList.add('hidden');
    
    // Clear selections
    selectedGroupMessages.clear();
    updateSelectionToolbar();
}

// Initialize on page load - UPDATED
document.addEventListener('DOMContentLoaded', () => {
    console.log('📦 Groups system initializing...');
    
    // Wait for auth and main chat system
    const initGroups = () => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            // Create UI elements first
            createGroupUIElements();
            
            // Setup event listeners with delay to ensure DOM is ready
            setTimeout(() => {
                setupGroupEventListeners();
                
                // Initialize other group systems
                initializeGroupTypingIndicators();
                initializeGroupEmojiPicker();
                
                // Load user groups
                loadUserGroups();
                
                // Listen for invites
                listenForGroupInvites();
                
                console.log('✅ Groups system fully initialized');
            }, 500);
        } else {
            // Wait for auth
            auth.onAuthStateChanged(user => {
                if (user) {
                    setTimeout(initGroups, 1000);
                }
            });
        }
    };
    
    // Start initialization
    setTimeout(initGroups, 1000);
    
    // Add manage admins modal listeners (these elements exist from the start)
    document.getElementById('closeManageAdmins')?.addEventListener('click', () => {
        document.getElementById('manageAdminsModal').classList.add('hidden');
    });
    
    document.getElementById('saveAdminChanges')?.addEventListener('click', saveAdminChanges);
});
    
    
// Export functions for use in other files
window.GroupSystem = {
    initializeGroupSystem,
    createNewGroup,
    openGroupChat,
    loadUserGroups,
    sendGroupMessage,
    addParticipantToGroup,
    removeParticipantFromGroup,
    leaveGroup,
    deleteGroup,
    updateGroupInfo,
    toggleGroupMute,
    makeMemberAdmin,
    acceptGroupInvite,
    declineGroupInvite,
    joinPublicGroup,
    toggleMessageStar,
    deleteGroupMessage,
    replyToGroupMessage,
    forwardGroupMessage,
    copyMessageText,
    reportGroupMessage,
    loadGroupMedia,
    loadGroupStarredMessages,
    searchInGroup,
    scrollToMessage
};

console.log('✅ Enhanced group system with all features loaded successfully');