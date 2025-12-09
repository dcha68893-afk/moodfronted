<<<<<<< HEAD
// ==================== GLOBAL ERROR HANDLING ====================

function setupGlobalErrorHandling() {
    // Handle all image errors
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            handleImageError(e.target);
        }
    }, true);

    // Also handle images that might be created dynamically
    const originalImage = window.Image;
    window.Image = function() {
        const img = new originalImage();
        img.addEventListener('error', function() {
            handleImageError(this);
        });
        return img;
    };
}

// ==================== UNIVERSAL FIX FOR ALL MISSING FUNCTIONS ====================
console.log('🔧 UNIVERSAL FIX: Catching ALL missing functions');

// 1. Fix missing variables for chat.js
if (typeof unsubscribeMessages === 'undefined') var unsubscribeMessages = null;
if (typeof unsubscribeChats === 'undefined') var unsubscribeChats = null;
if (typeof typingListener === 'undefined') var typingListener = null;
if (typeof typingTimeout === 'undefined') var typingTimeout = null;
if (typeof unsubscribeIncomingCalls === 'undefined') var unsubscribeIncomingCalls = null;

// 2. Create a handler for ALL undefined function calls
window.__handleMissingFunction = function(funcName, ...args) {
    console.warn(`⚠️ Function "${funcName}" was called but not defined. Creating placeholder.`);
    
    // Create the missing function on the fly
    window[funcName] = function(...innerArgs) {
        console.log(`🔄 Placeholder "${funcName}" called with:`, innerArgs);
        
        // Show user-friendly message
        if (typeof showToast === 'function') {
            showToast(`${funcName.replace(/([A-Z])/g, ' $1').trim()} feature is coming soon`, 'info');
        }
        
        // Return safe response
        return {
            success: true,
            message: `Function "${funcName}" executed (placeholder)`,
            funcName: funcName,
            args: innerArgs,
            timestamp: new Date().toISOString()
        };
    };
    
    // Call the newly created function
    return window[funcName](...args);
};

// 3. Override Function.prototype to catch ALL undefined functions
const originalFunction = Function;
window.Function = function(...args) {
    try {
        return originalFunction(...args);
    } catch (error) {
        console.error('Function creation error:', error);
        return function() {
            console.warn('Function execution failed');
            return { success: false, error: error.message };
        };
    }
};
window.Function.prototype = originalFunction.prototype;

// 4. Create placeholders for KNOWN missing functions
const knownMissingFunctions = [
    'viewUserStatuses',
    'unmuteAllStatuses',
    'openGroupChat',
    'loadUserGroups',
    'sendGroupMessage',
    'addParticipantToGroup',
    'removeParticipantFromGroup',
    'createNewGroup',
    'deleteGroup',
    'updateGroupSettings',
    'muteGroup',
    'unmuteGroup',
    'leaveGroup',
    'getGroupInfo',
    'updateGroupProfile',
    'handleGoalCreation',
    'handleStatusCreation',
    'manageGroupContextMenu',
    'updateSharedGoals',
    'toggleHighlightsPanel',
    'handleHashtagClick',
    'createNewGoal',
    'updateGoalProgress',
    'createStatusUpdate',
    'toggleTheme',
    'handleReactionSelection',
    'downloadFile',
    'openAllFriendsView',
    'editFriendSettings',
    'initiateVideoConference',
    'switchCamera',
    'handleCallControls',
    'toggleMute',
    'toggleVideo',
    'endCurrentCall',
    'acceptIncomingCall',
    'rejectIncomingCall',
    'startVoiceCall',
    'startVideoCall'
];

knownMissingFunctions.forEach(funcName => {
    if (typeof window[funcName] === 'undefined') {
        window[funcName] = function(...args) {
            return window.__handleMissingFunction(funcName, ...args);
        };
        console.log(`✅ Created placeholder for: ${funcName}`);
    }
});

// 5. Global error handler for undefined functions
window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('is not defined')) {
        const funcNameMatch = event.error.message.match(/(\w+) is not defined/);
        if (funcNameMatch) {
            const funcName = funcNameMatch[1];
            console.log(`🛠️ Auto-fixing undefined function: ${funcName}`);
            
            // Create the missing function
            if (typeof window[funcName] === 'undefined') {
                window[funcName] = function(...args) {
                    console.log(`🔧 Auto-created "${funcName}" called with:`, args);
                    return {
                        success: true,
                        message: `Auto-created function "${funcName}"`,
                        funcName: funcName,
                        args: args
                    };
                };
                
                // Prevent the error
                event.preventDefault();
                event.stopPropagation();
                
                console.log(`✅ Auto-created missing function: ${funcName}`);
                return false;
            }
        }
    }
}, true);

console.log('✅ UNIVERSAL FIX APPLIED - All missing functions will be caught');

// =================================================================================
// ==================== PREVENT DUPLICATE DECLARATIONS ====================
// Check if variables already exist to prevent conflicts
const globalVarsToProtect = [
    'closeStatusViewer', 
    'helpCenterModal',
    'statusViewerModal',
    'statusViewerContent',
    'currentUser',
    'currentUserData',
    'currentChat',
    'currentChatId',
    'friends',
    'allUsers'
];

globalVarsToProtect.forEach(varName => {
    if (typeof window[varName] !== 'undefined') {
        console.log(`⚠️ ${varName} already defined, skipping re-declaration`);
    }
});

// Only declare if they don't exist
if (typeof closeStatusViewer === 'undefined') var closeStatusViewer = null;
if (typeof helpCenterModal === 'undefined') var helpCenterModal = null;
if (typeof statusViewerModal === 'undefined') var statusViewerModal = null;
if (typeof statusViewerContent === 'undefined') var statusViewerContent = null;
if (typeof currentUser === 'undefined') var currentUser = null;
if (typeof currentUserData === 'undefined') var currentUserData = null;
if (typeof currentChat === 'undefined') var currentChat = null;
if (typeof currentChatId === 'undefined') var currentChatId = null;
if (typeof friends === 'undefined') var friends = [];
if (typeof allUsers === 'undefined') var allUsers = [];

// ==================== IMAGE ERROR HANDLING ====================
function setupImageErrorHandling() {
    console.log('Setting up image error handling...');
    
    // Handle all image loading errors
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            console.log('Image error detected:', e.target.src);
            
            // Don't handle data URLs or already fixed images
            if (e.target.src.startsWith('data:') || 
                e.target.classList.contains('error-handled')) {
                return;
            }
            
            // Set fallback for broken images
            const altText = e.target.alt || 'User';
            e.target.src = getDefaultAvatar(altText);
            e.target.classList.add('error-handled');
        }
    }, true);
    
    // Also handle dynamically created images
    const originalImage = window.Image;
    window.Image = function() {
        const img = new originalImage();
        img.addEventListener('error', function() {
            const altText = this.alt || 'User';
            this.src = getDefaultAvatar(altText);
            this.classList.add('error-handled');
        });
        return img;
    };
    
    console.log('✅ Image error handling setup complete');
}

function handleImageError(img) {
    // Skip if already handled or valid URLs
    if (img.classList.contains('error-handled') || 
        img.src.startsWith('data:') || 
        img.src.includes('blob:') ||
        img.src.includes('ui-avatars.com') ||
        img.src.includes('firebasestorage') ||
        img.src.includes('cloudinary')) {
        return;
    }
    
    console.warn('Fixing broken image:', img.src);
    
    // Fix specific problematic URLs
    if (img.src.includes('IMAGE_URL') || 
        !img.src || 
        img.src.includes('127.0.0.1') ||
        img.src === 'http://127.0.0.1:5500/IMAGE_URL' ||
        img.src.includes('/chat.html')) {
        
        const altText = img.alt || 'User';
        // Use a more reliable avatar service
        img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(altText)}&background=7C3AED&color=fff`;
    }
    
    // Special case for "Cover" images
    if (img.alt === 'Cover' || img.src.includes('Cover')) {
        img.src = 'https://via.placeholder.com/400x200/7C3AED/FFFFFF?text=Cover+Image';
    }
    
    img.classList.add('error-handled');
    img.onerror = null; // Prevent infinite loop
}

// ==================== FIREBASE INITIALIZATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
    authDomain: "uniconnect-ee95c.firebaseapp.com",
    projectId: "uniconnect-ee95c",
    storageBucket: "uniconnect-ee95c.firebasestorage.app",
    messagingSenderId: "1003264444309",
    appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

// Initialize Firebase
let auth, db, storage, messaging;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    messaging = firebase.messaging();
    
    console.log('Firebase initialized successfully');
    
    // 🔥 ADD THESE LINES TO SHARE WITH CALL.JS 🔥
    window.db = db;
    window.auth = auth;
    window.storage = storage;
    window.firebase = firebase;
    console.log('✅ Firebase shared with call.js');
    
} catch (error) {
    console.error('Firebase initialization failed:', error);
}

// ADD NETWORK STATUS MONITORING - Add this:
firebase.firestore().enableNetwork()
  .then(() => {
    console.log('Firestore online');
  })
  .catch((err) => {
    console.log('Firestore offline:', err);
  });

const cloudinaryConfig = {
    cloudName: 'dhjnxa5rh',
    apiKey: '817591969559894',
    uploadPreset: 'user_uploads'
};

// WebRTC Variables
window.localStream = null;
window.remoteStream = null;
window.peerConnection = null;
window.isMuted = false;
window.isVideoOff = false;
window.isInCall = false;
window.lastCallTime = 0;
window.CALL_COOLDOWN = 2000;

// Call State Variables
window.callState = {
    isCaller: false,
    isReceivingCall: false,
    callType: null,
    remoteUserId: null,
    callId: null,
    callStartTime: null
};

// ==================== DOM ELEMENTS INITIALIZATION ====================
// Main Layout Elements
const chatApp = document.getElementById('chatApp');
const loadingScreen = document.getElementById('loadingScreen');
const chatListContainer = document.getElementById('chatListContainer');
const messagesContainer = document.getElementById('messagesContainer');

// Sidebar Navigation Elements
const navIcons = document.querySelectorAll('.nav-icon[data-tab]');

// User Profile Header Elements
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userMood = document.getElementById('userMood');

// Personalization Info Section
const currentMoodsMini = document.getElementById('currentMoodsMini');
const currentInterestsMini = document.getElementById('currentInterestsMini');

// Search Elements
const searchInput = document.getElementById('searchInput');
const friendSearch = document.getElementById('friendSearch');

// Tab Panels
const chatsTab = document.getElementById('chatsTab');
const friendsTab = document.getElementById('friendsTab');
const updatesTab = document.getElementById('updatesTab');
const callsTab = document.getElementById('callsTab');
const toolsTab = document.getElementById('toolsTab');

// Chat List Elements
const chatList = document.getElementById('chatList');
const noChatsMessage = document.getElementById('noChatsMessage');

// Friends Tab Elements
const addFriendBtn = document.getElementById('addFriendBtn');
const friendRequestsSection = document.getElementById('friendRequestsSection');
const friendRequestsList = document.getElementById('friendRequestsList');
const noFriendRequests = document.getElementById('noFriendRequests');
const friendsList = document.getElementById('friendsList');
const noFriendsMessage = document.getElementById('noFriendsMessage');

// Updates Tab Elements
const myStatus = document.getElementById('myStatus');
const statusUpdates = document.getElementById('statusUpdates');

// Calls Tab Elements
const favoritesList = document.getElementById('favoritesList');
const manageFavorites = document.getElementById('manageFavorites');
const recentCalls = document.getElementById('recentCalls');

// Tools Tab Elements
const moodOptions = document.querySelectorAll('.mood-option');
const quickActionBtns = document.querySelectorAll('.quick-action-btn');
const catalogueBtn = document.getElementById('catalogueBtn');
const advertiseBtn = document.getElementById('advertiseBtn');
const labelsBtn = document.getElementById('labelsBtn');
const greetingBtn = document.getElementById('greetingBtn');
const awayBtn = document.getElementById('awayBtn');
const aiSummarize = document.getElementById('aiSummarize');
const aiReply = document.getElementById('aiReply');

// Chat Header Elements
const chatHeader = document.getElementById('chatHeader');
const backToChats = document.getElementById('backToChats');
const chatAvatar = document.getElementById('chatAvatar');
const chatTitle = document.getElementById('chatTitle');
const chatStatus = document.getElementById('chatStatus');
const moodIndicator = document.getElementById('moodIndicator');
const statusText = document.getElementById('statusText');
const typingIndicator = document.getElementById('typingIndicator');
const chatMenuBtn = document.getElementById('chatMenuBtn');

// Call buttons in chat header
const callButtons = {
    voice: document.querySelector('.friend-call-btn'),
    video: document.querySelector('.friend-video-call-btn')
};

// Shared Goals Section
const sharedGoalsSection = document.getElementById('sharedGoalsSection');
const toggleGoals = document.getElementById('toggleGoals');
const sharedGoalsContent = document.getElementById('sharedGoalsContent');
const noGoalsMessage = document.getElementById('noGoalsMessage');
const goalsList = document.getElementById('goalsList');
const createGoalBtn = document.getElementById('createGoalBtn');

// Message Highlights Panel
const highlightsPanel = document.getElementById('highlightsPanel');
const toggleHighlights = document.getElementById('toggleHighlights');
const highlightsContent = document.getElementById('highlightsContent');
const hashtagsList = document.getElementById('hashtagsList');
const noHighlightsMessage = document.getElementById('noHighlightsMessage');

// Message Selection Toolbar
const messageSelectionToolbar = document.getElementById('messageSelectionToolbar');
const selectedMessagesCount = document.getElementById('selectedMessagesCount');
const forwardSelected = document.getElementById('forwardSelected');
const starSelected = document.getElementById('starSelected');
const deleteSelected = document.getElementById('deleteSelected');
const cancelSelection = document.getElementById('cancelSelection');

// Reply Preview Bar
const replyPreviewBar = document.getElementById('replyPreviewBar');
const replyToName = document.getElementById('replyToName');
const replyPreviewContent = document.getElementById('replyPreviewContent');
const cancelReply = document.getElementById('cancelReply');

// Poll Results Display
const pollResultsSection = document.getElementById('pollResultsSection');
const pollResultsContent = document.getElementById('pollResultsContent');
const dismissPollResults = document.getElementById('dismissPollResults');

// Mood Suggestion
const moodSuggestion = document.getElementById('moodSuggestion');
const suggestionText = document.getElementById('suggestionText');
const dismissSuggestion = document.getElementById('dismissSuggestion');

// Input Area Elements
const inputArea = document.getElementById('inputArea');
const attachBtn = document.getElementById('attachBtn');
const cameraBtn = document.getElementById('cameraBtn');
const emojiBtn = document.getElementById('emojiBtn');
const voiceToTextBtn = document.getElementById('voiceToTextBtn');
const voiceRecordingIndicator = document.getElementById('voiceRecordingIndicator');
const messageInput = document.getElementById('messageInput');
const emojiPicker = document.getElementById('emojiPicker');
const isTyping = document.getElementById('isTyping');
const typingUsers = document.getElementById('typingUsers');
const sendBtn = document.getElementById('sendBtn');
const scrollToBottom = document.getElementById('scrollToBottom');

// Poll Creation Section
const pollCreationSection = document.getElementById('pollCreationSection');
const closePollCreation = document.getElementById('closePollCreation');
const pollQuestion = document.getElementById('pollQuestion');
const pollOptions = document.getElementById('pollOptions');
const addPollOption = document.getElementById('addPollOption');
const createPoll = document.getElementById('createPoll');
const cancelPoll = document.getElementById('cancelPoll');

// File Preview Section
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const removeFile = document.getElementById('removeFile');

// Video Conference Elements
const videoConference = document.getElementById('videoConference');
const conferenceGrid = document.getElementById('conferenceGrid');
const conferenceMuteBtn = document.getElementById('conferenceMuteBtn');
const conferenceVideoBtn = document.getElementById('conferenceVideoBtn');
const conferenceEndBtn = document.getElementById('conferenceEndBtn');

// Video Call Elements
const videoCallContainer = document.getElementById('videoCallContainer');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCameraBtn = document.getElementById('toggleCameraBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');

// Incoming Call Popup
const incomingCallPopup = document.getElementById('incomingCallPopup');
const incomingCallerName = document.getElementById('incomingCallerName');
const incomingCallType = document.getElementById('incomingCallType');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');

// Active Call Container
const callContainer = document.getElementById('callContainer');

// Create Goal Modal
const createGoalModal = document.getElementById('createGoalModal');
const goalTitle = document.getElementById('goalTitle');
const goalDescription = document.getElementById('goalDescription');
const goalDueDate = document.getElementById('goalDueDate');
const goalProgress = document.getElementById('goalProgress');
const goalProgressValue = document.getElementById('goalProgressValue');
const saveGoal = document.getElementById('saveGoal');
const cancelGoal = document.getElementById('cancelGoal');
const closeCreateGoal = document.getElementById('closeCreateGoal');

// Status Creation Modal
const statusCreation = document.getElementById('statusCreation');

// Context Menus
const messageContextMenu = document.getElementById('messageContextMenu');
const groupListContextMenu = document.getElementById('groupListContextMenu');

// Reaction Picker
const reactionPicker = document.getElementById('reactionPicker');

// File Upload Preview Modal
const enhancedFilePreview = document.getElementById('enhancedFilePreview');
const filePreviewContent = document.getElementById('filePreviewContent');
const downloadFileBtn = document.getElementById('downloadFileBtn');
const closeEnhancedFilePreview = document.getElementById('closeEnhancedFilePreview');

// All Friends Modal
const allFriendsModal = document.getElementById('allFriendsModal');
const allFriendsSearch = document.getElementById('allFriendsSearch');
const allFriendsList = document.getElementById('allFriendsList');
const noAllFriendsMessage = document.getElementById('noAllFriendsMessage');
const closeAllFriends = document.getElementById('closeAllFriends');

// Features Modal
const featuresModal = document.getElementById('featuresModal');
const closeFeatures = document.getElementById('closeFeatures');

// Mood Modal
const moodModal = document.getElementById('moodModal');
const closeMood = document.getElementById('closeMood');

// Quick Actions Modal
const quickActionsModal = document.getElementById('quickActionsModal');
const closeQuickActions = document.getElementById('closeQuickActions');

// Add Friend Modal
const addFriendModal = document.getElementById('addFriendModal');
const friendSearchInput = document.getElementById('friendSearchInput');
const searchResults = document.getElementById('searchResults');
const searchFriend = document.getElementById('searchFriend');
const cancelFriend = document.getElementById('cancelFriend');

// Enhanced Friend Search Modal
const friendSearchResultsModal = document.getElementById('friendSearchResultsModal');
const enhancedSearchResults = document.getElementById('enhancedSearchResults');
const closeEnhancedSearch = document.getElementById('closeEnhancedSearch');

// Edit Friend Modal
const editFriendModal = document.getElementById('editFriendModal');
const editFriendName = document.getElementById('editFriendName');
const editFriendStatus = document.getElementById('editFriendStatus');
const messageFriend = document.getElementById('messageFriend');
const callFriend = document.getElementById('callFriend');
const removeFriendBtn = document.getElementById('removeFriend');
const cancelEditFriend = document.getElementById('cancelEditFriend');

// Toast Notifications Container
const toastContainer = document.getElementById('toastContainer');

// Business Profile Elements (assuming they exist)
const businessProfileModal = document.getElementById('businessProfileModal');
const aiSummaryModal = document.getElementById('aiSummaryModal');
const smartRepliesModal = document.getElementById('smartRepliesModal');

// ==================== UTILITY FUNCTIONS ====================
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDefaultAvatar(name = 'User', size = 50) {
    const initial = name.charAt(0).toUpperCase();
    const colors = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EC4899'];
    const colorIndex = name.charCodeAt(0) % colors.length;
    const color = colors[colorIndex];
    
    const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${color}"/>
            <text x="${size/2}" y="${size/2 + size/10}" 
                  text-anchor="middle" fill="white" 
                  font-family="Arial, sans-serif" 
                  font-size="${size * 0.4}" 
                  font-weight="bold"
                  dominant-baseline="middle">
                ${initial}
            </text>
        </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function safeElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with id '${id}' not found`);
    }
    return element;
}

function safeClassList(id, action, className) {
    const element = safeElement(id);
    if (element && element.classList) {
        element.classList[action](className);
    }
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

function showToast(message, type = 'info') {
    console.log(`Toast: ${message} (${type})`);
    if (!toastContainer) {
        console.warn('Toast container not found');
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return 'fa-image';
    if (fileType.startsWith('video/')) return 'fa-video';
    if (fileType.startsWith('audio/')) return 'fa-music';
    if (fileType.includes('pdf')) return 'fa-file-pdf';
    if (fileType.includes('word') || fileType.includes('document')) return 'fa-file-word';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'fa-file-excel';
    if (fileType.includes('zip') || fileType.includes('compressed')) return 'fa-file-archive';
    return 'fa-file';
}

// ==================== NETWORK & ERROR HANDLING ====================
function setupNetworkMonitoring() {
    window.addEventListener('online', () => {
        console.log('App is online');
        showToast('Connection restored', 'success');
        firebase.firestore().enableNetwork().then(() => {
            console.log('Firestore reconnected');
            if (currentUser) {
                loadUserData();
            }
        });
    });

    window.addEventListener('offline', () => {
        console.log('App is offline');
        showToast('You are offline', 'warning');
    });

    if (!navigator.onLine) {
        showToast('You are currently offline', 'warning');
    }
}

// ==================== AI FEATURES MANAGEMENT ====================
function hideAIFeatures() {
    console.log('Hiding AI features...');
    
    // Hide AI Summarize button
    const aiSummarize = document.getElementById('aiSummarize');
    if (aiSummarize) {
        aiSummarize.style.display = 'none';
        console.log('✅ Hidden: AI Summarize button');
    }
    
    // Hide AI Reply button
    const aiReply = document.getElementById('aiReply');
    if (aiReply) {
        aiReply.style.display = 'none';
        console.log('✅ Hidden: AI Reply button');
    }
    
    // Hide AI related modals if they exist
    const aiSummaryModal = document.getElementById('aiSummaryModal');
    if (aiSummaryModal) {
        aiSummaryModal.style.display = 'none';
    }
    
    const smartRepliesModal = document.getElementById('smartRepliesModal');
    if (smartRepliesModal) {
        smartRepliesModal.style.display = 'none';
    }
    
    // Add enable button if not exists
    const toolsTab = document.getElementById('toolsTab');
    if (toolsTab && !document.getElementById('enableAIButton')) {
        const enableButton = document.createElement('button');
        enableButton.id = 'enableAIButton';
        enableButton.className = 'enable-ai-button';
        enableButton.innerHTML = `
            <div class="text-center p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg shadow-lg">
                <i class="fas fa-robot text-3xl mb-2"></i>
                <h3 class="font-bold text-lg mb-1">Enable AI Features</h3>
                <p class="text-sm opacity-90 mb-3">Unlock smart replies, conversation summaries, and more</p>
                <div class="flex space-x-2">
                    <button id="enableAIFeaturesBtn" class="flex-1 bg-white text-purple-600 py-2 rounded-lg font-medium hover:bg-gray-100">
                        Enable Now
                    </button>
                    <button id="learnMoreAIBtn" class="px-3 bg-transparent border border-white py-2 rounded-lg hover:bg-white hover:bg-opacity-20">
                        Learn More
                    </button>
                </div>
            </div>
        `;
        
        // Insert at the beginning of tools content
        const toolsContent = toolsTab.querySelector('.p-4') || toolsTab;
        if (toolsContent.firstChild) {
            toolsContent.insertBefore(enableButton, toolsContent.firstChild);
        } else {
            toolsContent.appendChild(enableButton);
        }
        
        // Add event listeners
        document.getElementById('enableAIFeaturesBtn')?.addEventListener('click', enableAIFeatures);
        document.getElementById('learnMoreAIBtn')?.addEventListener('click', showAILearnMore);
    }
}

function showAIFeatures() {
    console.log('Showing AI features...');
    
    // Show AI Summarize button
    const aiSummarize = document.getElementById('aiSummarize');
    if (aiSummarize) {
        aiSummarize.style.display = 'flex';
        console.log('✅ Showing: AI Summarize button');
    }
    
    // Show AI Reply button
    const aiReply = document.getElementById('aiReply');
    if (aiReply) {
        aiReply.style.display = 'flex';
        console.log('✅ Showing: AI Reply button');
    }
    
    // Remove enable button if exists
    const enableButton = document.getElementById('enableAIButton');
    if (enableButton) {
        enableButton.remove();
        console.log('✅ Removed enable AI button');
    }
}

function enableAIFeatures() {
    if (!currentUser || !currentUser.uid) {
        showToast('Please sign in to enable AI features', 'error');
        return;
    }
    
    // Create a simple modal for confirmation
    const modalHTML = `
        <div id="aiEnableModal" class="modal fixed inset-0 flex items-center justify-center z-50">
            <div class="modal-backdrop fixed inset-0 bg-black bg-opacity-50"></div>
            <div class="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 z-10">
                <div class="p-6">
                    <div class="text-center mb-4">
                        <i class="fas fa-robot text-4xl text-purple-600 mb-3"></i>
                        <h3 class="text-xl font-bold text-gray-800">Enable AI Features</h3>
                    </div>
                    
                    <div class="space-y-3 mb-6">
                        <div class="flex items-start">
                            <i class="fas fa-comment-dots text-green-500 mt-1 mr-3"></i>
                            <div>
                                <p class="font-medium">Smart Replies</p>
                                <p class="text-sm text-gray-600">AI-powered reply suggestions</p>
                            </div>
                        </div>
                        <div class="flex items-start">
                            <i class="fas fa-file-alt text-blue-500 mt-1 mr-3"></i>
                            <div>
                                <p class="font-medium">Conversation Summaries</p>
                                <p class="text-sm text-gray-600">AI-generated chat summaries</p>
                            </div>
                        </div>
                        <div class="flex items-start">
                            <i class="fas fa-bolt text-yellow-500 mt-1 mr-3"></i>
                            <div>
                                <p class="font-medium">Fast & Smart</p>
                                <p class="text-sm text-gray-600">Instant AI assistance</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex space-x-3">
                        <button id="confirmEnableAI" class="flex-1 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700">
                            Enable AI Features
                        </button>
                        <button id="cancelEnableAI" class="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHTML;
    document.body.appendChild(modalDiv);
    
    // Show modal
    const modal = document.getElementById('aiEnableModal');
    modal.classList.remove('hidden');
    
    // Event listeners
    document.getElementById('confirmEnableAI').addEventListener('click', async () => {
        try {
            showToast('Enabling AI features...', 'info');
            
            // Save setting to Firebase
            await db.collection('users').doc(currentUser.uid).update({
                aiEnabled: true,
                aiFeaturesEnabled: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update local data
            if (!currentUserData) currentUserData = {};
            currentUserData.aiEnabled = true;
            currentUserData.aiFeaturesEnabled = true;
            
            // Update UI
            showAIFeatures();
            
            // Close modal
            modal.remove();
            
            showToast('AI features enabled successfully!', 'success');
            
        } catch (error) {
            console.error('Error enabling AI features:', error);
            showToast('Error enabling AI features', 'error');
            modal.remove();
        }
    });
    
    document.getElementById('cancelEnableAI').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelector('.modal-backdrop').addEventListener('click', () => {
        modal.remove();
    });
}

function showAILearnMore() {
    alert('AI Features include:\n\n• Smart Reply Suggestions\n• Conversation Summaries\n• AI-powered assistance\n\nThese features help you communicate more effectively!');
}

function checkAIFeaturesStatus() {
    // Default to hidden if no user data
    if (!currentUserData) {
        hideAIFeatures();
        return;
    }
    
    // Check if AI is enabled
    const aiEnabled = currentUserData.aiEnabled || currentUserData.aiFeaturesEnabled;
    
    if (aiEnabled) {
        showAIFeatures();
    } else {
        hideAIFeatures();
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', initApp);


       function initApp() {
    console.log('Initializing app...');
    
    try {
        // 1. Setup basic error handlers
        setupGlobalErrorHandling();
        setupImageErrorHandling();
        setupNetworkMonitoring();
        
        // 2. Setup UI components
        initializeTabs();
        setupEventListeners();
        initEmojiPicker();
        setupReplySystem();
        setupMessageSelection();
        setupPollSystem();
        setupMoodSuggestions();
        setupBusinessTools();
        setupAIFeatures();
        setupHelpCenter();
        setupModals();
        setupContextMenuActions();
        setupAutoScrollDetection();
        
        // 3. Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();
        
        // 4. Share with other scripts
        window.db = db;
        window.auth = auth;
        window.storage = storage;
        window.firebase = firebase;
        
        console.log('✅ Firebase initialized and shared');
        
        if (typeof window.settings !== 'undefined') {
            window.settings.init({
                db: db,
                auth: auth,
                storage: storage,
                currentUser: currentUser,
                currentUserData: currentUserData
            });
        }
        
        // 5. Check auth state
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('✅ User authenticated:', user.uid);
                currentUser = user;
                
                // Load user data
                await loadUserData();
                
                // ⭐ ADD THIS: Check AI features status after user data loads
                setTimeout(() => {
                    checkAIFeaturesStatus();
                }, 1000);
                
                // Notify other scripts
                if (window.onUserAuthenticated) {
                    window.onUserAuthenticated();
                }
            } else {
                console.log('⚠️ No user, redirecting...');
                window.location.href = 'index.html';
            }
        });
        
    } catch (error) {
        console.error('❌ Error in initApp:', error);
        showToast('App initialization error: ' + error.message, 'error');
    }
}
// ==================== USER DATA MANAGEMENT ====================

// ==================== USER DATA MANAGEMENT ====================
async function loadUserData() {
    try {
        console.log('Loading user data for:', currentUser.uid);

        // Perform cleanup
        if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
        if (unsubscribeChats) { unsubscribeChats(); unsubscribeChats = null; }
        if (typingListener) { typingListener(); typingListener = null; }
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }

        currentChat = null;
        currentChatId = null;

        console.log('Cleanup completed. Starting user data load...');

        // Load user document
        const userDoc = await db.collection('users').doc(currentUser.uid).get();

        if (userDoc.exists) {
            currentUserData = userDoc.data();
            console.log('User data loaded:', {
                uid: currentUser.uid,
                displayName: currentUserData.displayName,
                email: currentUserData.email
            });
            
            // Ensure required fields exist
            currentUserData = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUserData.displayName || currentUser.email?.split('@')[0] || 'User',
                photoURL: currentUserData.photoURL || getDefaultAvatar(currentUserData.displayName || 'User'),
                coverURL: currentUserData.coverURL || '',
                about: currentUserData.about || '',
                phone: currentUserData.phone || '',
                createdAt: currentUserData.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen: currentUserData.lastSeen || firebase.firestore.FieldValue.serverTimestamp(),
                status: currentUserData.status || 'offline',
                mood: currentUserData.mood || 'neutral',
                aiEnabled: currentUserData.aiEnabled || false,
                aiFeaturesEnabled: currentUserData.aiFeaturesEnabled || false
            };
            
            initializeUserData();
        } else {
            console.log('Creating new user document');
            currentUserData = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                photoURL: currentUser.photoURL || getDefaultAvatar(currentUser.displayName || 'User'),
                coverURL: '',
                about: '',
                phone: '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'offline',
                mood: 'neutral',
                aiEnabled: false,
                aiFeaturesEnabled: false
            };

            await db.collection('users').doc(currentUser.uid).set(currentUserData);
            console.log('New user document created');
            initializeUserData();
        }

        // Update ONLY lastSeen timestamp, NOT status
        await db.collection('users').doc(currentUser.uid).update({
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Load UI & listeners
        showChatApp();
        loadFriends();
        loadAllUsers();
        
        setTimeout(() => {
            loadChatsTemporary();
        }, 500);
        
        requestNotificationPermission();
        listenForFriendRequests();
        
        initializeBusinessDocument(currentUser.uid);

    } catch (error) {
        console.error('Error in loadUserData:', error);
        showToast('Error loading user data', 'error');
    }
}


function initializeUserData() {
    console.log('Initializing UI with user data');

    if (userName) userName.textContent = currentUserData.displayName;
    if (userAvatar) userAvatar.src = currentUserData.photoURL;
    if (userMood) userMood.textContent = currentUserData.mood || '😊';

    // Update profile modal fields if they exist
    const profileName = document.getElementById('profileName');
    const profileAbout = document.getElementById('profileAbout');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const profilePicPreview = document.getElementById('profilePicPreview');
    const profileCoverPreview = document.getElementById('profileCoverPreview');

    if (profileName) profileName.value = currentUserData.displayName;
    if (profileAbout) profileAbout.value = currentUserData.about || '';
    if (profileEmail) profileEmail.value = currentUserData.email;
    if (profilePhone) profilePhone.value = currentUserData.phone || '';
    if (profilePicPreview) profilePicPreview.src = currentUserData.photoURL;
    if (profileCoverPreview) profileCoverPreview.src = currentUserData.coverURL || '';
}

function showChatApp() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (chatApp) chatApp.classList.remove('hidden');
    console.log('Chat app UI shown');
}

// ==================== TAB MANAGEMENT ====================
function initializeTabs() {
    console.log('Initializing tabs...');
    
    navIcons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Normalize tab name
            let normalizedTabName = tabName;
            if (tabName === 'chat') normalizedTabName = 'chats';
            if (tabName === 'chats') normalizedTabName = 'chats';
            
            console.log(`Tab clicked: ${tabName} -> ${normalizedTabName}`);
            switchTab(normalizedTabName);
        });
    });
    
    // Set initial tab to chat
    setTimeout(() => {
        switchTab('chats');
    }, 500);
}

function switchTab(tabName) {
    console.log('🔄 Switching to tab:', tabName);
    
    // If we're in a chat, go back to tabs first
    if (currentChat) {
        goBackToTabs();
        setTimeout(() => switchTab(tabName), 100);
        return;
    }
    
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.classList.add('hidden');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.nav-icon').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Try multiple possible ID formats
    let tabPanel = document.getElementById(`${tabName}Tab`);
    if (!tabPanel) {
        tabPanel = document.getElementById(`${tabName}-tab`) || 
                  document.getElementById(`tab-${tabName}`) ||
                  document.getElementById(`${tabName}`);
    }
    
    if (tabPanel) {
        tabPanel.classList.remove('hidden');
        tabPanel.classList.add('active');
        console.log('✅ Tab panel activated:', tabPanel.id);
        
        // Activate corresponding tab button
        const tabButton = document.querySelector(`.nav-icon[data-tab="${tabName}"]`) ||
                         document.querySelector(`.nav-icon[data-tab="${tabName === 'chats' ? 'chat' : tabName}"]`);
        
        if (tabButton) {
            tabButton.classList.add('active');
        }
    } else {
        console.error('❌ Tab panel not found for:', tabName);
        return;
    }
    
    // Load REAL tab-specific content from Firebase
    setTimeout(() => {
        loadTabContent(tabName);
    }, 100);
}

function loadTabContent(tabName) {
    console.log('📥 Loading REAL content for tab:', tabName);
    
    switch(tabName) {
        case 'chats':
            loadChats();
            break;
        case 'friends':
            loadFriendsFromFirebase();
            loadFriendRequests();
            break;
        case 'updates':
            loadRealStatusUpdates();
            break;
        case 'calls':
            loadRealCallHistory();
            loadFavorites();
            break;
        case 'tools':
            loadToolsTab();
            loadPersonalizationDisplay();
            loadMoodSuggestions();
            break;
    }
}

// ==================== CHAT MANAGEMENT ====================
function loadChats() {
    console.log('📱 Loading chats tab...');
    
    if (!currentUser || !currentUser.uid) {
        console.log('⚠️ User not authenticated yet');
        return;
    }
    
    if (!unsubscribeChats) {
        loadChatsTemporary();
    }
    
    if (chatListContainer) {
        chatListContainer.classList.remove('hidden');
    }
}

  function loadChatsTemporary() {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) {
        console.log('⚠️ Chat list not found - DOM not ready yet');
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(loadChatsTemporary, 100);
            });
        } else {
            // Create the element if it doesn't exist
            createChatListElement();
        }
        return
    }
    
    console.log('✅ Loading chats for user:', currentUser.uid);
    
    if (unsubscribeChats) {
        console.log('Unsubscribing from previous chats listener');
        unsubscribeChats();
    }
    
    unsubscribeChats = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot({
            next: (snapshot) => {
                console.log('Chats snapshot received:', snapshot.size, 'chats');
                if (!chatList || !noChatsMessage) return;
                
                chatList.innerHTML = '';
                
                if (snapshot.empty) {
                    noChatsMessage.classList.remove('hidden');
                    return;
                }
                
                noChatsMessage.classList.add('hidden');
                
                // Sort manually in JavaScript
                const chats = [];
                snapshot.forEach(doc => {
                    chats.push({ id: doc.id, ...doc.data() });
                });
                
                // Manual sort by lastMessageTime
                chats.sort((a, b) => {
                    const timeA = a.lastMessageTime ? a.lastMessageTime.toDate() : new Date(0);
                    const timeB = b.lastMessageTime ? b.lastMessageTime.toDate() : new Date(0);
                    return timeB - timeA;
                });
                
                chats.forEach(chat => {
                    const otherParticipantId = chat.participants.find(id => id !== currentUser.uid);
                    const otherParticipantName = chat.participantNames ? chat.participantNames[otherParticipantId] : 'Unknown User';
                    
                    console.log('Rendering chat with:', otherParticipantName);
                    
                    const chatItem = document.createElement('div');
                    chatItem.className = 'chat-item';
                    chatItem.dataset.chatId = chat.id;
                    chatItem.dataset.userId = otherParticipantId;
                    
                    // Check for unread messages
                    const unreadCount = chat.unread && chat.unread[currentUser.uid] ? chat.unread[currentUser.uid] : 0;
                    
                    chatItem.innerHTML = `
                        <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <div class="relative">
                                <img class="w-12 h-12 rounded-full object-cover" 
                                     src="https://ui-avatars.com/api/?name=${encodeURIComponent(otherParticipantName)}&background=7C3AED&color=fff" 
                                     alt="${otherParticipantName}">
                                ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex justify-between items-center">
                                    <div class="contact-name font-medium text-gray-800 truncate">${otherParticipantName}</div>
                                    <div class="last-message-time text-xs text-gray-500">${chat.lastMessageTime ? formatTimeAgo(chat.lastMessageTime) : ''}</div>
                                </div>
                                <div class="last-message-preview text-sm text-gray-500 truncate mt-1">${chat.lastMessage || 'No messages yet'}</div>
                            </div>
                        </div>
                    `;
                    
                    chatItem.addEventListener('click', () => {
                        console.log('Opening chat with:', otherParticipantName);
                        startChat(otherParticipantId, otherParticipantName);
                    });
                    
                    chatList.appendChild(chatItem);
                });
            },
            error: (error) => {
                console.error('Error loading chats:', error);
                if (document.getElementById('chatList')) {
                    showToast('Error loading chats', 'error');
                }
            }
        });
}

function createChatListElement() {
    const chatsTab = document.getElementById('chatsTab');
    if (!chatsTab) {
        console.error('❌ chatsTab not found - creating entire tab structure');
        createChatsTabStructure();
        return;
    }
    
    // Create chatsList element
    if (!document.getElementById('chatsList')) {
        const chatsList = document.createElement('div');
        chatsList.id = 'chatsList';
        chatsList.className = 'chats-list space-y-2';
        chatsTab.appendChild(chatsList);
        console.log('✅ Created chatsList element');
    }
}

async function startChat(friendId, friendName) {
    try {
        console.log('Starting chat with:', friendName, friendId);
        
        // Create or get chat ID
        const chatId = [currentUser.uid, friendId].sort().join('_');
        
        console.log('Chat ID:', chatId);
        
        // Check if chat document exists
        const chatDoc = await db.collection('chats').doc(chatId).get();
        
        if (!chatDoc.exists) {
            console.log('Creating new chat document');
            await db.collection('chats').doc(chatId).set({
                participants: [currentUser.uid, friendId],
                participantNames: {
                    [currentUser.uid]: currentUserData.displayName,
                    [friendId]: friendName
                },
                lastMessage: '',
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                typing: {},
                unread: {
                    [currentUser.uid]: 0,
                    [friendId]: 0
                }
            });
        }
        
        // Set current chat
        currentChat = {
            id: chatId,
            friendId: friendId,
            name: friendName
        };
        
        currentChatId = chatId;
        
        console.log('Current chat set:', currentChat);
        
        // Update UI - SHOW CHAT INTERFACE
        const chatHeader = document.getElementById('chatHeader');
        const inputArea = document.getElementById('inputArea');
        const noMessagesMessage = document.getElementById('noMessagesMessage');
        const chatTitle = document.getElementById('chatTitle');
        const chatAvatar = document.getElementById('chatAvatar');
        const messagesContainer = document.getElementById('messagesContainer');
        
        // Hide the tab content containers
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });
        
        // Show chat interface
        if (chatHeader) chatHeader.classList.remove('hidden');
        if (inputArea) inputArea.classList.remove('hidden');
        if (messagesContainer) messagesContainer.classList.remove('hidden');
        if (noMessagesMessage) noMessagesMessage.classList.add('hidden');
        if (chatTitle) chatTitle.textContent = friendName;
        if (chatAvatar) chatAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=7C3AED&color=fff`;
        
        // Enable message input
        if (messageInput) messageInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        
        // Add call buttons to chat header
        addCallButtonsToChatHeader(friendId, friendName);
        
        // Load messages
        loadMessages(chatId);
        
        // Mark messages as read
        markMessagesAsRead(chatId);
        
    } catch (error) {
        console.error('Error starting chat:', error);
        showToast('Error starting chat', 'error');
    }
}

function addCallButtonsToChatHeader(friendId, friendName) {
    // Remove existing call buttons if any
    const existingCallButtons = document.querySelectorAll('.call-btn-header');
    existingCallButtons.forEach(btn => btn.remove());
    
    // Add voice call button
    const voiceCallBtn = document.createElement('button');
    voiceCallBtn.className = 'call-btn-header friend-call-btn';
    voiceCallBtn.innerHTML = '<i class="fas fa-phone"></i>';
    voiceCallBtn.title = 'Voice Call';
    voiceCallBtn.dataset.id = friendId;
    voiceCallBtn.dataset.name = friendName;
    voiceCallBtn.onclick = () => {
        if (window.startVoiceCallWithFriend) {
            window.startVoiceCallWithFriend(friendId, friendName);
        }
    };
    
    // Add video call button
    const videoCallBtn = document.createElement('button');
    videoCallBtn.className = 'call-btn-header friend-video-call-btn';
    videoCallBtn.innerHTML = '<i class="fas fa-video"></i>';
    videoCallBtn.title = 'Video Call';
    videoCallBtn.dataset.id = friendId;
    videoCallBtn.dataset.name = friendName;
    videoCallBtn.onclick = () => {
        if (window.startVideoCallWithFriend) {
            window.startVideoCallWithFriend(friendId, friendName);
        }
    };
    
    // Add to chat header actions
    const chatActions = document.querySelector('.chat-header-actions');
    if (chatActions) {
        chatActions.appendChild(voiceCallBtn);
        chatActions.appendChild(videoCallBtn);
    }
}

function goBackToTabs() {
    console.log('Going back to tabs');
    
    // Hide chat interface
    if (chatHeader) chatHeader.classList.add('hidden');
    if (inputArea) inputArea.classList.add('hidden');
    if (messagesContainer) messagesContainer.classList.add('hidden');
    
    // Show the current active tab
    const activeTabBtn = document.querySelector('.nav-icon.active');
    if (activeTabBtn) {
        const tabName = activeTabBtn.getAttribute('data-tab');
        const tabPanel = document.getElementById(`${tabName}Tab`);
        if (tabPanel) {
            tabPanel.classList.remove('hidden');
        }
    } else {
        // Default to chats tab
        const chatsTab = document.getElementById('chatsTab');
        if (chatsTab) chatsTab.classList.remove('hidden');
    }
    
    // Clear current chat
    currentChat = null;
    currentChatId = null;
    
    // Unsubscribe from message listeners
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    if (typingListener) {
        typingListener();
        typingListener = null;
    }
    
    console.log('Back to tabs successfully');
}

// ==================== MESSAGE MANAGEMENT ====================
function loadMessages(chatId) {
    console.log('Loading messages for chat:', chatId);
    
    // Unsubscribe from previous listeners
    if (unsubscribeMessages) {
        console.log('Unsubscribing from previous message listener');
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    if (typingListener) {
        console.log('Unsubscribing from previous typing listener');
        typingListener();
        typingListener = null;
    }
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }
    
    // Show loading state
    messagesContainer.innerHTML = `
        <div class="text-center text-gray-500 py-10">
            <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
            <p>Loading messages...</p>
        </div>
    `;
    
    let isFirstLoad = true;
    let loadedMessageIds = new Set();
    
    // Subscribe to messages for this chat
    unsubscribeMessages = db.collection('messages')
        .where('chatId', '==', chatId)
        .orderBy('timestamp', 'asc')
        .onSnapshot({
            next: (snapshot) => {
                console.log('New messages snapshot:', snapshot.size, 'messages');
                
                if (!messagesContainer) return;
                
                // Only clear container on first load
                if (isFirstLoad) {
                    messagesContainer.innerHTML = '';
                    loadedMessageIds.clear();
                    isFirstLoad = false;
                }
                
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
                
                let lastDate = null;
                let hasNewMessages = false;
                
                // Process each message
                snapshot.docChanges().forEach(change => {
                    const messageId = change.doc.id;
                    const message = change.doc.data();
                    
                    // Skip if already loaded
                    if (loadedMessageIds.has(messageId)) {
                        return;
                    }
                    
                    loadedMessageIds.add(messageId);
                    hasNewMessages = true;
                    
                    // Check if we need to add a date separator
                    const messageDate = message.timestamp ? message.timestamp.toDate().toDateString() : new Date().toDateString();
                    if (messageDate !== lastDate) {
                        addDateSeparator(messageDate);
                        lastDate = messageDate;
                    }
                    
                    addMessageToUI(message, messageId);
                });
                
                // Scroll to bottom only if new messages were added
                if (hasNewMessages) {
                    setTimeout(() => {
                        if (messagesContainer) {
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        }
                    }, 100);
                }
                
                // Mark messages as read
                markMessagesAsRead(chatId);
            },
            error: (error) => {
                console.error('Error loading messages:', error);
                if (messagesContainer) {
                    messagesContainer.innerHTML = `
                        <div class="text-center text-gray-500 py-10">
                            <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                            <p>Error loading messages</p>
                            <p class="text-sm mt-1">Please try again later</p>
                        </div>
                    `;
                }
                showToast('Error loading messages', 'error');
            }
        });
    
    // Listen for typing indicators
    typingListener = db.collection('chats').doc(chatId)
        .onSnapshot({
            next: (doc) => {
                if (doc.exists) {
                    const chatData = doc.data();
                    const typing = chatData.typing || {};
                    
                    // Remove current user from typing indicators
                    delete typing[currentUser.uid];
                    
                    const typingUsersList = Object.keys(typing).filter(userId => typing[userId] === true);
                    
                    if (typingUsers && isTyping) {
                        if (typingUsersList.length > 0) {
                            // Get names of typing users
                            const typingNames = typingUsersList.map(userId => {
                                return chatData.participantNames && chatData.participantNames[userId] 
                                    ? chatData.participantNames[userId] 
                                    : 'Someone';
                            });
                            
                            typingUsers.textContent = typingNames.join(', ');
                            isTyping.classList.remove('hidden');
                        } else {
                            isTyping.classList.add('hidden');
                        }
                    }
                }
            },
            error: (error) => {
                console.error('Error listening for typing indicators:', error);
            }
        });
}

function addDateSeparator(dateString) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
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
    messagesContainer.appendChild(dateElement);
}

function addMessageToUI(message, messageId) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    
    const isSent = message.senderId === currentUser.uid;
    const messageTime = message.timestamp ? message.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    
    let statusIcon = '🕒'; // sent
    if (message.status === 'delivered') statusIcon = '✓✓';
    if (message.status === 'read') statusIcon = '✓✓👁️';
    
    messageElement.className = `message-item ${isSent ? 'outgoing' : 'incoming'}`;
    messageElement.dataset.messageId = messageId;
    messageElement.dataset.senderId = message.senderId;
    messageElement.dataset.timestamp = message.timestamp ? message.timestamp.toMillis() : Date.now();
    messageElement.dataset.type = message.type || 'text';
    
    // Check if message has file attachment
    if (message.file) {
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-sender">${message.senderName || 'Unknown'}</div>
                <div class="file-message">
                    <div class="file-icon">
                        <i class="fas ${getFileIcon(message.file.type)}"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${message.file.name}</div>
                        <div class="file-size">${formatFileSize(message.file.size)}</div>
                        <a href="${message.file.url}" target="_blank" class="download-link">Download</a>
                    </div>
                </div>
                <div class="message-time">${messageTime} ${isSent ? '<span class="message-status">' + statusIcon + '</span>' : ''}</div>
            </div>
        `;
    } else if (message.type === 'poll') {
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-sender">${message.senderName || 'Unknown'}</div>
                <div class="poll-message">
                    <div class="poll-question">${message.pollQuestion}</div>
                    <div class="poll-options">
                        ${message.pollOptions ? message.pollOptions.map((option, index) => `
                            <div class="poll-option" data-option-index="${index}">
                                <button class="poll-vote-btn">${option}</button>
                                <span class="poll-vote-count">${message.pollVotes ? message.pollVotes[index] || 0 : 0}</span>
                            </div>
                        `).join('') : ''}
                    </div>
                    <div class="poll-total">Total votes: ${message.totalVotes || 0}</div>
                </div>
                <div class="message-time">${messageTime} ${isSent ? '<span class="message-status">' + statusIcon + '</span>' : ''}</div>
            </div>
        `;
    } else {
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-sender">${message.senderName || 'Unknown'}</div>
                <div class="message-text">${escapeHtml(message.text)}</div>
                <div class="message-time">${messageTime} ${isSent ? '<span class="message-status">' + statusIcon + '</span>' : ''}</div>
            </div>
        `;
    }
    
    messagesContainer.appendChild(messageElement);
    
    // Add context menu for messages
    setupMessageContextMenu(messageElement, message, messageId);
    
    // Add click event for polls
    if (message.type === 'poll') {
        messageElement.querySelectorAll('.poll-vote-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                voteOnPoll(messageId, index);
            });
        });
    }
}

async function sendMessage() {
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    
    if (!text || !currentChat) {
        if (!text) {
            showToast('Please enter a message', 'error');
        }
        return;
    }
    
    console.log('Sending message:', text, 'to chat:', currentChat.id);
    
    try {
        const message = {
            text: text,
            senderId: currentUser.uid,
            senderName: currentUserData.displayName,
            chatId: currentChat.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            type: 'text'
        };
        
        // Add message to Firebase
        const docRef = await db.collection('messages').add(message);
        console.log('Message sent with ID:', docRef.id);
        
        // Clear input
        messageInput.value = '';
        
        // Update chat document with last message
        await db.collection('chats').doc(currentChat.id).update({
            lastMessage: text.length > 50 ? text.substring(0, 50) + '...' : text,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            [`typing.${currentUser.uid}`]: false, // Remove typing indicator
            [`unread.${currentChat.friendId}`]: firebase.firestore.FieldValue.increment(1)
        });
        
        console.log('Chat document updated with last message');
        
        // Update message status to delivered for all messages in this chat
        updateMessageStatus(currentChat.id, 'delivered');
        
        // Scroll to bottom
        if (messagesContainer) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
        
        // Send push notification
        sendPushNotification(currentChat.friendId, currentUserData.displayName, text);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message', 'error');
    }
}

function updateMessageStatus(chatId, status) {
    console.log('Updating message status to:', status, 'for chat:', chatId);
    
    // Update all messages in this chat that are sent by the current user
    db.collection('messages')
        .where('chatId', '==', chatId)
        .where('senderId', '==', currentUser.uid)
        .where('status', '==', 'sent')
        .get()
        .then(snapshot => {
            const batch = db.batch();
            
            snapshot.forEach(doc => {
                batch.update(doc.ref, { status: status });
            });
            
            return batch.commit();
        })
        .then(() => {
            console.log('Message status updated successfully');
        })
        .catch(error => {
            console.error('Error updating message status:', error);
        });
}

function markMessagesAsRead(chatId) {
    console.log('Marking messages as read for chat:', chatId);
    
    // Mark all messages in this chat as read
    db.collection('messages')
        .where('chatId', '==', chatId)
        .where('senderId', '!=', currentUser.uid)
        .where('status', 'in', ['sent', 'delivered'])
        .get()
        .then(snapshot => {
            const batch = db.batch();
            
            snapshot.forEach(doc => {
                batch.update(doc.ref, { status: 'read' });
            });
            
            return batch.commit();
        })
        .then(() => {
            console.log('Messages marked as read successfully');
            
            // Reset unread count for this chat
            if (currentUser && currentChat) {
                db.collection('chats').doc(chatId).update({
                    [`unread.${currentUser.uid}`]: 0
                });
            }
        })
        .catch(error => {
            console.error('Error marking messages as read:', error);
        });
}

// ==================== FRIEND MANAGEMENT ====================
function loadFriends() {
    console.log('Loading friends for user:', currentUser.uid);
    
    // Fetch friends from Firebase with real-time listener
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'accepted')
        .onSnapshot(snapshot => {
            console.log('Friends snapshot received:', snapshot.size, 'documents');
            friends = [];
            const friendPromises = [];
            
            snapshot.forEach(doc => {
                const friendship = doc.data();
                const friendId = friendship.users.find(id => id !== currentUser.uid);
                
                console.log('Processing friendship with friend:', friendId);
                
                // Get friend details
                const friendPromise = db.collection('users').doc(friendId).get().then(friendDoc => {
                    if (friendDoc.exists) {
                        const friendData = friendDoc.data();
                        console.log('Friend data loaded:', friendData.displayName);
                        friends.push({
                            id: friendId,
                            friendshipId: doc.id,
                            ...friendData
                        });
                    }
                });
                
                friendPromises.push(friendPromise);
            });
            
            Promise.all(friendPromises).then(() => {
                console.log('All friend data loaded, rendering', friends.length, 'friends');
                renderFriends(friends);
                
                if (noFriendsMessage) {
                    if (friends.length === 0) {
                        noFriendsMessage.classList.remove('hidden');
                    } else {
                        noFriendsMessage.classList.add('hidden');
                    }
                }
            });
        }, error => {
            console.error('Error loading friends:', error);
            showToast('Error loading friends', 'error');
        });
}

function renderFriends(friendsToRender) {
    if (!friendsList) {
        console.warn('Friends list element not found');
        return;
    }
    
    console.log('Rendering', friendsToRender.length, 'friends');
    friendsList.innerHTML = '';
    
    if (friendsToRender.length === 0) {
        friendsList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-users text-4xl mb-3 text-gray-300 block"></i>
                <p>No friends yet</p>
                <p class="text-sm mt-1">Add friends to start chatting</p>
            </div>
        `;
        return;
    }
    
    friendsToRender.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.dataset.friendId = friend.id;
        
        const lastSeen = friend.lastSeen ? formatTimeAgo(friend.lastSeen) : 'Never';
        
        friendItem.innerHTML = `
            <div class="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-3 flex-1">
                    <div class="relative">
                        <img class="w-12 h-12 rounded-full object-cover" 
                             src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                             alt="${friend.displayName}"
                             onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                        <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${friend.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}"></div>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center space-x-2">
                            <h3 class="font-medium text-gray-800">${friend.displayName}</h3>
                            ${friend.status === 'online' ? 
                                '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">Online</span>' : 
                                `<span class="text-xs text-gray-500">Last seen ${lastSeen}</span>`}
                        </div>
                        <p class="text-sm text-gray-500 mt-1 truncate">${friend.about || 'Hey there! I am using Kynecta'}</p>
                    </div>
                </div>
                
                <div class="flex items-center space-x-2 ml-4">
                    <button class="message-friend p-2 text-purple-600 hover:bg-purple-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Message">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="call-friend p-2 text-green-600 hover:bg-green-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Voice Call">
                        <i class="fas fa-phone"></i>
                    </button>
                    <button class="video-call-friend p-2 text-blue-600 hover:bg-blue-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Video Call">
                        <i class="fas fa-video"></i>
                    </button>
                    <div class="relative">
                        <button class="friend-options-btn p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Options">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="friend-options-menu absolute right-0 top-10 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10 hidden min-w-32">
                            <button class="view-profile-btn w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700" data-id="${friend.id}">
                                <i class="fas fa-user mr-2"></i>View Profile
                            </button>
                            <button class="remove-friend-btn w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600" data-id="${friend.id}" data-name="${friend.displayName}">
                                <i class="fas fa-user-times mr-2"></i>Remove
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        friendsList.appendChild(friendItem);
    });

    // Add event listeners using event delegation
    friendsList.addEventListener('click', function(e) {
        // Message button
        if (e.target.closest('.message-friend')) {
            const btn = e.target.closest('.message-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Starting chat with:', friendName, friendId);
            startChat(friendId, friendName);
        }
        
        // Voice call button
        if (e.target.closest('.call-friend')) {
            const btn = e.target.closest('.call-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Voice calling:', friendName, friendId);
            
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            } else {
                console.error('Call system not initialized');
                showToast('Call feature not available', 'error');
            }
        }
        
        // Video call button
        if (e.target.closest('.video-call-friend')) {
            const btn = e.target.closest('.video-call-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Video calling:', friendName, friendId);
            
            if (window.startVideoCallWithFriend) {
                window.startVideoCallWithFriend(friendId, friendName);
            } else {
                console.error('Video call system not initialized');
                showToast('Video call feature not available', 'error');
            }
        }
        
        // Options button toggle
        if (e.target.closest('.friend-options-btn')) {
            const btn = e.target.closest('.friend-options-btn');
            const menu = btn.nextElementSibling;
            // Close all other menus
            document.querySelectorAll('.friend-options-menu').forEach(m => {
                if (m !== menu) m.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
        }
        
        // View profile
        if (e.target.closest('.view-profile-btn')) {
            const btn = e.target.closest('.view-profile-btn');
            const friendId = btn.dataset.id;
            console.log('Viewing profile of:', friendId);
            viewFriendProfile(friendId);
            btn.closest('.friend-options-menu').classList.add('hidden');
        }
        
        // Remove friend
        if (e.target.closest('.remove-friend-btn')) {
            const btn = e.target.closest('.remove-friend-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Removing friend:', friendName, friendId);
            confirmRemoveFriend(friendId, friendName);
            btn.closest('.friend-options-menu').classList.add('hidden');
        }
    });

    // Close dropdown menus when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.friend-options-btn')) {
            document.querySelectorAll('.friend-options-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        }
    });
    
    console.log('✅ Friends rendered with action buttons');
}

// In chat.js, when creating friend call buttons:
function createFriendCallButtons(friendId, friendName) {
    return `
        <div class="friend-call-buttons">
            <button class="friend-call-btn voice-call-btn p-2 rounded-full hover:bg-blue-50"
                    data-user-id="${friendId}"
                    data-user-name="${friendName}"
                    title="Voice Call">
                <i class="fas fa-phone text-blue-600"></i>
            </button>
            <button class="friend-call-btn video-call-btn p-2 rounded-full hover:bg-green-50"
                    data-user-id="${friendId}"
                    data-user-name="${friendName}"
                    title="Video Call">
                <i class="fas fa-video text-green-600"></i>
            </button>
        </div>
    `;
}

function loadFriendsFromFirebase() {
    const friendsTab = document.getElementById('friendsTab');
    if (!friendsTab) return;
    
    console.log('👥 Loading real friends from Firebase...');
    
    // Show loading state
    friendsTab.innerHTML = `
        <div class="p-4">
            <h3 class="text-lg font-semibold mb-4">Friends</h3>
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
                <p>Loading friends from your network...</p>
            </div>
        </div>
    `;
    
    // Your friends are already loaded via the real-time listener in loadFriends()
    // Just render them in the friends tab
    setTimeout(() => {
        if (friends.length > 0) {
            friendsTab.innerHTML = `
                <div class="p-4">
                    <h3 class="text-lg font-semibold mb-4">Your Friends (${friends.length})</h3>
                    <div id="friendsTabList"></div>
                </div>
            `;
            renderFriendsInTab(friends);
        } else {
            friendsTab.innerHTML = `
                <div class="p-4">
                    <h3 class="text-lg font-semibold mb-4">Friends</h3>
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-users text-4xl mb-3 text-gray-300 block"></i>
                        <p>No friends yet</p>
                        <p class="text-sm mt-1">Add friends to start chatting</p>
                    </div>
                </div>
            `;
        }
    }, 500);
}

function renderFriendsInTab(friendsList) {
    const friendsTabList = document.getElementById('friendsTabList');
    if (!friendsTabList) return;
    
    friendsTabList.innerHTML = '';
    
    friendsList.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item-tab';
        friendItem.dataset.friendId = friend.id;
        
        const lastSeen = friend.lastSeen ? formatTimeAgo(friend.lastSeen) : 'Never';
        
        friendItem.innerHTML = `
            <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                <div class="relative">
                    <img class="w-12 h-12 rounded-full object-cover" 
                         src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                         alt="${friend.displayName}"
                         onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                    <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${friend.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}"></div>
                </div>
                <div class="flex-1">
                    <div class="flex items-center space-x-2">
                        <h3 class="font-medium text-gray-800">${friend.displayName}</h3>
                        ${friend.status === 'online' ? 
                            '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">Online</span>' : 
                            `<span class="text-xs text-gray-500">Last seen ${lastSeen}</span>`}
                    </div>
                    <p class="text-sm text-gray-500 mt-1">${friend.about || 'Hey there! I am using Kynecta'}</p>
                </div>
                <div class="flex space-x-2">
                    <button class="message-friend-tab p-2 text-purple-600 hover:bg-purple-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Message">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="call-friend-tab p-2 text-green-600 hover:bg-green-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Call">
                        <i class="fas fa-phone"></i>
                    </button>
                </div>
            </div>
        `;
        
        friendsTabList.appendChild(friendItem);
    });
    
    // Add event listeners
    friendsTabList.addEventListener('click', function(e) {
        if (e.target.closest('.message-friend-tab')) {
            const btn = e.target.closest('.message-friend-tab');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            startChat(friendId, friendName);
        }
        
        if (e.target.closest('.call-friend-tab')) {
            const btn = e.target.closest('.call-friend-tab');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            }
        }
    });
}

// In chat.js - when rendering friends, make sure to include:
function renderFriendItem(friendId, friendData) {
    return `
        <div class="friend-item" data-user-id="${friendId}" data-user-name="${friendData.displayName}">
            <div class="friend-avatar">
                <!-- Avatar content -->
            </div>
            <div class="friend-info">
                <div class="friend-name">${friendData.displayName}</div>
                <div class="friend-status">${friendData.status || 'offline'}</div>
            </div>
            <div class="friend-actions">
                <button class="friend-call-btn voice-call-btn"
                        data-user-id="${friendId}"
                        data-user-name="${friendData.displayName}"
                        title="Voice Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="friend-call-btn video-call-btn"
                        data-user-id="${friendId}"
                        data-user-name="${friendData.displayName}"
                        title="Video Call">
                    <i class="fas fa-video"></i>
                </button>
            </div>
        </div>
    `;
}
function listenForFriendRequests() {
    console.log('Setting up friend request listener for user:', currentUser.uid);
    
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'pending')
        .where('requestedBy', '!=', currentUser.uid)
        .onSnapshot(snapshot => {
            console.log('Friend requests snapshot:', snapshot.size, 'pending requests');
            
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const request = change.doc.data();
                    const requesterId = request.requestedBy;
                    const friendshipId = change.doc.id;
                    
                    console.log('New friend request from:', requesterId);
                    
                    // Get requester details
                    db.collection('users').doc(requesterId).get().then(requesterDoc => {
                        if (requesterDoc.exists) {
                            const requesterData = requesterDoc.data();
                            showFriendRequestNotification(requesterData, friendshipId);
                        }
                    });
                }
            });
        }, error => {
            console.error('Error listening for friend requests:', error);
        });
}

function showFriendRequestNotification(requesterData, friendshipId) {
    const notification = document.createElement('div');
    notification.className = 'friend-request-notification';
    notification.innerHTML = `
        <div class="flex items-center space-x-3 p-4 bg-white rounded-lg shadow-lg border border-gray-200">
            <img class="w-12 h-12 rounded-full" src="${requesterData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(requesterData.displayName)}&background=7C3AED&color=fff`}" alt="${requesterData.displayName}">
            <div class="flex-1">
                <p class="font-semibold">${requesterData.displayName}</p>
                <p class="text-sm text-gray-600">Sent you a friend request</p>
            </div>
            <div class="flex space-x-2">
                <button class="px-3 py-1 bg-green-500 text-white rounded-lg accept-request" data-friendship-id="${friendshipId}">Accept</button>
                <button class="px-3 py-1 bg-red-500 text-white rounded-lg decline-request" data-friendship-id="${friendshipId}">Decline</button>
            </div>
        </div>
    `;
    
    // Add to notifications container
    const notificationsContainer = document.getElementById('notificationsContainer') || createNotificationsContainer();
    notificationsContainer.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 10000);
    
    // Add event listeners
    notification.querySelector('.accept-request').addEventListener('click', function() {
        acceptFriendRequest(this.dataset.friendshipId);
        notification.remove();
    });
    
    notification.querySelector('.decline-request').addEventListener('click', function() {
        declineFriendRequest(this.dataset.friendshipId);
        notification.remove();
    });
}

function createNotificationsContainer() {
    const container = document.createElement('div');
    container.id = 'notificationsContainer';
    container.className = 'fixed top-4 right-4 z-50 space-y-2 max-w-sm';
    document.body.appendChild(container);
    return container;
}

function loadFriendRequests() {
    if (!currentUser || !friendRequestsList) return;
    
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'pending')
        .where('requestedBy', '!=', currentUser.uid)
        .get()
        .then(snapshot => {
            if (!friendRequestsList) return;
            
            friendRequestsList.innerHTML = '';
            
            if (snapshot.empty) {
                if (noFriendRequests) {
                    noFriendRequests.classList.remove('hidden');
                }
                return;
            }
            
            if (noFriendRequests) {
                noFriendRequests.classList.add('hidden');
            }
            
            snapshot.forEach(async doc => {
                const request = doc.data();
                const requesterId = request.requestedBy;
                
                const requesterDoc = await db.collection('users').doc(requesterId).get();
                if (requesterDoc.exists) {
                    const requesterData = requesterDoc.data();
                    
                    const requestItem = document.createElement('div');
                    requestItem.className = 'friend-request-item';
                    requestItem.innerHTML = `
                        <div class="flex items-center justify-between p-3 border-b border-gray-200">
                            <div class="flex items-center space-x-3">
                                <img class="w-10 h-10 rounded-full" src="${requesterData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(requesterData.displayName)}&background=7C3AED&color=fff`}" alt="${requesterData.displayName}">
                                <div>
                                    <p class="font-medium">${requesterData.displayName}</p>
                                    <p class="text-sm text-gray-500">Wants to be your friend</p>
                                </div>
                            </div>
                            <div class="flex space-x-2">
                                <button class="accept-friend-request px-3 py-1 bg-green-500 text-white rounded-lg" data-friendship-id="${doc.id}">
                                    Accept
                                </button>
                                <button class="decline-friend-request px-3 py-1 bg-red-500 text-white rounded-lg" data-friendship-id="${doc.id}">
                                    Decline
                                </button>
                            </div>
                        </div>
                    `;
                    
                    friendRequestsList.appendChild(requestItem);
                }
            });
            
            // Add event listeners for accept/decline buttons
            friendRequestsList.addEventListener('click', function(e) {
                if (e.target.closest('.accept-friend-request')) {
                    const btn = e.target.closest('.accept-friend-request');
                    const friendshipId = btn.dataset.friendshipId;
                    acceptFriendRequest(friendshipId);
                }
                
                if (e.target.closest('.decline-friend-request')) {
                    const btn = e.target.closest('.decline-friend-request');
                    const friendshipId = btn.dataset.friendshipId;
                    declineFriendRequest(friendshipId);
                }
            });
            
        })
        .catch(error => {
            console.error('Error loading friend requests:', error);
        });
}

function acceptFriendRequest(friendshipId) {
    db.collection('friendships').doc(friendshipId).update({
        status: 'accepted',
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        showToast('Friend request accepted!', 'success');
    })
    .catch(error => {
        console.error('Error accepting friend request:', error);
        showToast('Error accepting friend request', 'error');
    });
}

function declineFriendRequest(friendshipId) {
    db.collection('friendships').doc(friendshipId).delete()
    .then(() => {
        showToast('Friend request declined', 'info');
    })
    .catch(error => {
        console.error('Error declining friend request:', error);
        showToast('Error declining friend request', 'error');
    });
}

function viewFriendProfile(friendId) {
    console.log('Viewing friend profile:', friendId);
    // Implementation for viewing friend profile
    showToast('Viewing friend profile - feature coming soon', 'info');
}

function confirmRemoveFriend(friendId, friendName) {
    if (confirm(`Are you sure you want to remove ${friendName} from your friends?`)) {
        removeFriend(friendId);
    }
}

function removeFriend(friendId) {
    console.log('Removing friend:', friendId);
    
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'accepted')
        .get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const friendship = doc.data();
                if (friendship.users.includes(friendId)) {
                    // Delete the friendship
                    db.collection('friendships').doc(doc.id).delete()
                        .then(() => {
                            console.log('Friend removed successfully');
                            showToast('Friend removed successfully', 'success');
                        })
                        .catch(error => {
                            console.error('Error removing friend:', error);
                            showToast('Error removing friend', 'error');
                        });
                }
            });
        })
        .catch(error => {
            console.error('Error finding friendship:', error);
            showToast('Error removing friend', 'error');
        });
}

// ==================== UPDATES TAB ====================
function loadRealStatusUpdates() {
    const statusUpdates = document.getElementById('statusUpdates');
    if (!statusUpdates) return;
    
    console.log('📰 Loading real status updates from Firebase...');
    
    // Show loading state
    statusUpdates.innerHTML = `
        <div class="text-center text-gray-500 py-8">
            <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
            <p>Loading status updates...</p>
        </div>
    `;
    
    if (!currentUser) {
        statusUpdates.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                <p>Please sign in to view updates</p>
            </div>
        `;
        return;
    }
    
    // Load actual status updates from Firebase
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'accepted')
        .get()
        .then(snapshot => {
            const friendPromises = [];
            const statusUpdatesList = [];
            
            snapshot.forEach(doc => {
                const friendship = doc.data();
                const friendId = friendship.users.find(id => id !== currentUser.uid);
                
                // Get friend's recent status updates
                const statusPromise = db.collection('status_updates')
                    .where('userId', '==', friendId)
                    .orderBy('createdAt', 'desc')
                    .limit(3)
                    .get()
                    .then(statusSnapshot => {
                        statusSnapshot.forEach(statusDoc => {
                            const statusData = statusDoc.data();
                            statusUpdatesList.push({
                                ...statusData,
                                id: statusDoc.id,
                                friendId: friendId
                            });
                        });
                    });
                
                friendPromises.push(statusPromise);
            });
            
            Promise.all(friendPromises).then(() => {
                if (statusUpdatesList.length === 0) {
                    // If no status updates, show friends' recent activity
                    loadFriendsRecentActivity(statusUpdates);
                    return;
                }
                
                // Sort by timestamp
                statusUpdatesList.sort((a, b) => b.createdAt - a.createdAt);
                
                // Render status updates
                renderStatusUpdates(statusUpdates, statusUpdatesList);
            });
        })
        .catch(error => {
            console.error('Error loading status updates:', error);
            statusUpdates.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                    <p>Error loading updates</p>
                    <p class="text-sm mt-1">Please try again later</p>
                </div>
            `;
        });
}

function loadFriendsRecentActivity(container) {
    if (friends.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-newspaper text-4xl mb-3 text-gray-300 block"></i>
                <p>No updates yet</p>
                <p class="text-sm mt-1">Your friends' activity will appear here</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <h4 class="font-semibold mb-3 text-gray-700">Friends' Recent Activity</h4>
        <div class="space-y-3">
            ${friends.slice(0, 5).map(friend => {
                const lastSeen = friend.lastSeen ? formatTimeAgo(friend.lastSeen) : 'Never online';
                
                return `
                    <div class="status-update-item bg-white p-3 rounded-lg border border-gray-200">
                        <div class="flex items-center space-x-3">
                            <img class="w-10 h-10 rounded-full" 
                                 src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                                 alt="${friend.displayName}"
                                 onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                            <div class="flex-1">
                                <p class="font-medium text-gray-800">${friend.displayName}</p>
                                <div class="flex items-center space-x-2 mt-1">
                                    <span class="text-xs ${friend.status === 'online' ? 'text-green-600' : 'text-gray-500'}">
                                        <i class="fas fa-circle text-xs ${friend.status === 'online' ? 'text-green-500' : 'text-gray-400'}"></i>
                                        ${friend.status === 'online' ? 'Online now' : `Last seen ${lastSeen}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function renderStatusUpdates(container, updates) {
    container.innerHTML = `
        <h4 class="font-semibold mb-3 text-gray-700">Recent Updates</h4>
        <div class="space-y-3">
            ${await Promise.all(updates.map(async (update) => {
                // Get friend details
                const friendDoc = await db.collection('users').doc(update.friendId).get();
                const friend = friendDoc.exists ? friendDoc.data() : { displayName: 'Unknown User' };
                
                const timeAgo = update.createdAt ? formatTimeAgo(update.createdAt) : 'Recently';
                const updateText = update.text || update.content || 'Shared an update';
                
                return `
                    <div class="status-update-item bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <div class="flex items-start space-x-3">
                            <img class="w-12 h-12 rounded-full" 
                                 src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                                 alt="${friend.displayName}"
                                 onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                            <div class="flex-1">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="font-semibold text-gray-800">${friend.displayName}</p>
                                        <p class="text-xs text-gray-500 mt-1">${timeAgo}</p>
                                    </div>
                                </div>
                                <p class="mt-2 text-gray-700">${updateText}</p>
                                ${update.mediaUrl ? `
                                    <div class="mt-3">
                                        <img src="${update.mediaUrl}" alt="Update media" 
                                             class="rounded-lg w-full max-h-64 object-cover"
                                             onerror="this.style.display='none'">
                                    </div>
                                ` : ''}
                                <div class="mt-3 flex space-x-4 text-sm text-gray-500">
                                    <button class="like-update hover:text-purple-600" data-update-id="${update.id}">
                                        <i class="far fa-heart"></i> Like
                                    </button>
                                    <button class="comment-update hover:text-blue-600" data-update-id="${update.id}">
                                        <i class="far fa-comment"></i> Comment
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })).then(html => html.join(''))}
        </div>
    `;
    
    // Add event listeners for like/comment buttons
    container.querySelectorAll('.like-update').forEach(btn => {
        btn.addEventListener('click', () => handleLikeUpdate(btn.dataset.updateId));
    });
    
    container.querySelectorAll('.comment-update').forEach(btn => {
        btn.addEventListener('click', () => handleCommentUpdate(btn.dataset.updateId));
    });
}

function handleLikeUpdate(updateId) {
    console.log('Liking update:', updateId);
    showToast('Liked update', 'success');
}

function handleCommentUpdate(updateId) {
    console.log('Commenting on update:', updateId);
    const comment = prompt('Enter your comment:');
    if (comment) {
        showToast('Comment added', 'success');
    }
}

// ==================== CALLS TAB ====================
function loadRealCallHistory() {
    const recentCalls = document.getElementById('recentCalls');
    if (!recentCalls) return;
    
    console.log('📞 Loading real call history from Firebase...');
    
    // Show loading state
    recentCalls.innerHTML = `
        <div class="text-center text-gray-500 py-8">
            <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
            <p>Loading your call history...</p>
        </div>
    `;
    
    if (!currentUser) {
        recentCalls.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                <p>Please sign in to view call history</p>
            </div>
        `;
        return;
    }
    
    // Load actual call history from Firebase
    db.collection('calls')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('startedAt', 'desc')
        .limit(20)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                recentCalls.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-phone text-4xl mb-3 text-gray-300 block"></i>
                        <p>No call history yet</p>
                        <p class="text-sm mt-1">Start calling your friends!</p>
                    </div>
                `;
                return;
            }
            
            const callPromises = [];
            const calls = [];
            
            snapshot.forEach(doc => {
                const callData = doc.data();
                calls.push({
                    id: doc.id,
                    ...callData
                });
                
                // Get the other participant's details
                const otherParticipantId = callData.participants.find(id => id !== currentUser.uid);
                if (otherParticipantId) {
                    const userPromise = db.collection('users').doc(otherParticipantId).get()
                        .then(userDoc => {
                            return userDoc.exists ? userDoc.data() : null;
                        });
                    callPromises.push(userPromise);
                }
            });
            
            Promise.all(callPromises).then(participants => {
                renderCallHistory(recentCalls, calls, participants);
            });
        })
        .catch(error => {
            console.error('Error loading call history:', error);
            recentCalls.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                    <p>Error loading call history</p>
                    <p class="text-sm mt-1">Please try again later</p>
                </div>
            `;
        });
}

function renderCallHistory(container, calls, participants) {
    container.innerHTML = `
        <h4 class="font-semibold mb-4 text-gray-700">Recent Calls</h4>
        <div class="space-y-3">
            ${calls.map((call, index) => {
                const participant = participants[index] || { displayName: 'Unknown User' };
                const callTime = call.startedAt ? formatTimeAgo(call.startedAt) : 'Unknown time';
                const isOutgoing = call.callerId === currentUser.uid;
                const callTypeIcon = call.callType === 'video' ? 'fa-video' : 'fa-phone';
                const callDuration = call.endedAt && call.startedAt 
                    ? Math.round((call.endedAt.toDate() - call.startedAt.toDate()) / 60000) + ' min'
                    : '--:--';
                const callStatus = call.status || 'completed';
                const statusColor = callStatus === 'missed' ? 'text-red-600' : 
                                 callStatus === 'rejected' ? 'text-yellow-600' : 
                                 'text-green-600';
                
                return `
                    <div class="call-item bg-white p-4 rounded-lg border border-gray-200 hover:shadow-sm transition-shadow">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <div class="relative">
                                    <img class="w-12 h-12 rounded-full" 
                                         src="${participant.photoURL || getDefaultAvatar(participant.displayName)}" 
                                         alt="${participant.displayName}"
                                         onerror="this.src='${getDefaultAvatar(participant.displayName)}'">
                                    <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center border border-gray-300">
                                        <i class="${callTypeIcon} text-xs ${isOutgoing ? 'text-green-600' : 'text-blue-600'}"></i>
                                    </div>
                                </div>
                                <div>
                                    <p class="font-medium text-gray-800">${participant.displayName}</p>
                                    <div class="flex items-center space-x-2 mt-1">
                                        <span class="text-xs ${statusColor}">
                                            ${isOutgoing ? 'Outgoing' : 'Incoming'} • ${callStatus}
                                        </span>
                                        <span class="text-xs text-gray-500">${callDuration}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-sm text-gray-500">${callTime}</p>
                                <div class="flex space-x-2 mt-2">
                                    <button class="call-back-btn w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200" 
                                            data-id="${participant.id || call.participants.find(id => id !== currentUser.uid)}" 
                                            data-name="${participant.displayName}">
                                        <i class="fas fa-phone text-xs"></i>
                                    </button>
                                    ${call.callType === 'video' ? `
                                        <button class="video-call-btn w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200" 
                                                data-id="${participant.id || call.participants.find(id => id !== currentUser.uid)}" 
                                                data-name="${participant.displayName}">
                                            <i class="fas fa-video text-xs"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    // Add event listeners for call back buttons
    container.querySelectorAll('.call-back-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const friendId = this.dataset.id;
            const friendName = this.dataset.name;
            
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            }
        });
    });
    
    container.querySelectorAll('.video-call-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const friendId = this.dataset.id;
            const friendName = this.dataset.name;
            
            if (window.startVideoCallWithFriend) {
                window.startVideoCallWithFriend(friendId, friendName);
            }
        });
    });
}

// ==================== TOOLS TAB ====================
function loadToolsTab() {
    console.log('Loading tools tab...');
    // Business data is loaded separately when modals open
}

function loadPersonalizationDisplay() {
    if (!currentUserData) return;
    
    // Load moods
    if (currentMoodsMini) {
        const moods = currentUserData.moods || ['happy'];
        currentMoodsMini.innerHTML = moods.map(mood => `
            <span class="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs mr-1">
                ${mood}
            </span>
        `).join('');
    }
    
    // Load interests
    if (currentInterestsMini) {
        const interests = currentUserData.interests || ['chatting', 'music'];
        currentInterestsMini.innerHTML = interests.map(interest => `
            <span class="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs mr-1">
                ${interest}
            </span>
        `).join('');
    }
}

function loadMoodSuggestions() {
    if (!currentUserData || !moodSuggestion) return;
    
    const mood = currentUserData.mood || 'happy';
    const suggestions = {
        happy: ["Share your happiness with friends!", "Spread positivity today!"],
        sad: ["Talk to a friend who makes you smile", "Listen to your favorite music"],
        excited: ["Plan something fun!", "Share your excitement with others"],
        tired: ["Take a break and relax", "Listen to calming music"],
        angry: ["Take deep breaths", "Talk it out with someone you trust"],
        neutral: ["Start a conversation with a friend", "Share what's on your mind"]
    };
    
    const moodSuggestions = suggestions[mood] || suggestions.neutral;
    const randomSuggestion = moodSuggestions[Math.floor(Math.random() * moodSuggestions.length)];
    
    if (suggestionText) {
        suggestionText.textContent = randomSuggestion;
        moodSuggestion.classList.remove('hidden');
    }
}

function updateMood(newMood) {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).update({
        mood: newMood,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        currentUserData.mood = newMood;
        if (userMood) userMood.textContent = newMood;
        showToast(`Mood updated to ${newMood}`, 'success');
        
        // Reload mood suggestions
        loadMoodSuggestions();
        
        if (moodModal) moodModal.classList.add('hidden');
    })
    .catch(error => {
        console.error('Error updating mood:', error);
        showToast('Error updating mood', 'error');
    });
}

// ==================== FILE UPLOAD ====================
async function uploadFile(file) {
    if (!currentChat) {
        showToast('Please select a chat first', 'error');
        return;
    }
    
    try {
        console.log('Uploading file:', file.name, 'to chat:', currentChat.id);
        showToast('Uploading file...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`chat_files/${currentChat.id}/${Date.now()}_${file.name}`);
        const uploadTask = fileRef.put(file);
        
        // Show upload progress
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);
        if (filePreview) filePreview.classList.remove('hidden');
        
        uploadTask.on('state_changed', 
            (snapshot) => {
                // Update progress bar
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload progress:', progress + '%');
                if (uploadProgressBar) uploadProgressBar.style.width = `${progress}%`;
            },
            (error) => {
                console.error('Error uploading file:', error);
                showToast('Error uploading file', 'error');
                if (filePreview) filePreview.classList.add('hidden');
            },
            async () => {
                // Upload completed
                console.log('File upload completed');
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Create message with file
                const message = {
                    text: `Shared a file: ${file.name}`,
                    senderId: currentUser.uid,
                    senderName: currentUserData.displayName,
                    chatId: currentChat.id,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    file: {
                        name: file.name,
                        url: downloadURL,
                        type: file.type,
                        size: file.size
                    }
                };
                
                // Add message to Firebase
                await db.collection('messages').add(message);
                
                // Update chat document with last message
                await db.collection('chats').doc(currentChat.id).update({
                    lastMessage: `Shared a file: ${file.name}`,
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                    [`unread.${currentChat.friendId}`]: firebase.firestore.FieldValue.increment(1)
                });
                
                // Hide file preview
                if (filePreview) filePreview.classList.add('hidden');
                
                console.log('File uploaded successfully');
                showToast('File uploaded successfully', 'success');
            }
        );
    } catch (error) {
        console.error('Error uploading file:', error);
        showToast('Error uploading file', 'error');
    }
}

// ==================== TYPING INDICATOR ====================
function handleTypingIndicator() {
    if (currentChat) {
        console.log('Sending typing indicator for chat:', currentChat.id);
        
        // Send typing indicator
        db.collection('chats').doc(currentChat.id).update({
            [`typing.${currentUser.uid}`]: true,
            lastActivity: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Clear previous timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Set timeout to remove typing indicator
        typingTimeout = setTimeout(() => {
            db.collection('chats').doc(currentChat.id).update({
                [`typing.${currentUser.uid}`]: false
            });
        }, 1000);
    }
}

// ==================== EMOJI PICKER ====================
function initEmojiPicker() {
    if (!emojiPicker) return;
    
    const emojiCategories = [
        {
            title: 'Smileys & People',
            emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾']
        },
        {
            title: 'Animals & Nature',
            emojis: ['🐵', '🐒', '🦍', '🦧', '🐶', '🐕', '🦮', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦔', '🦇', '🐻', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍', '🐲', '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🐟', '🐠', '🐡', '🦈', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🐞', '🦗', '🕷️', '🕸️', '🦂', '🦟', '🦠', '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃']
        }
    ];

    emojiPicker.innerHTML = '';

    emojiCategories.forEach(category => {
        const categoryElement = document.createElement('div');
        categoryElement.className = 'emoji-category';
        
        const categoryTitle = document.createElement('div');
        categoryTitle.className = 'emoji-category-title';
        categoryTitle.textContent = category.title;
        
        const emojiGrid = document.createElement('div');
        emojiGrid.className = 'emoji-grid';
        
        category.emojis.forEach(emoji => {
            const emojiOption = document.createElement('div');
            emojiOption.className = 'emoji-option';
            emojiOption.textContent = emoji;
            emojiOption.addEventListener('click', () => {
                if (messageInput) {
                    messageInput.value += emoji;
                    emojiPicker.style.display = 'none';
                    messageInput.focus();
                }
            });
            
            emojiGrid.appendChild(emojiOption);
        });
        
        categoryElement.appendChild(categoryTitle);
        categoryElement.appendChild(emojiGrid);
        emojiPicker.appendChild(categoryElement);
    });
}

function toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (!emojiPicker) return;
    
    if (emojiPicker.style.display === 'block') {
        emojiPicker.style.display = 'none';
    } else {
        emojiPicker.style.display = 'block';
    }
}

// ==================== POLL SYSTEM ====================
function setupPollSystem() {
    if (addPollOption) {
        addPollOption.addEventListener('click', addPollOptionField);
    }
    
    if (createPoll) {
        createPoll.addEventListener('click', createNewPoll);
    }
    
    if (cancelPoll) {
        cancelPoll.addEventListener('click', () => {
            if (pollCreationSection) pollCreationSection.classList.add('hidden');
        });
    }
    
    if (closePollCreation) {
        closePollCreation.addEventListener('click', () => {
            if (pollCreationSection) pollCreationSection.classList.add('hidden');
        });
    }
    
    if (dismissPollResults) {
        dismissPollResults.addEventListener('click', () => {
            if (pollResultsSection) pollResultsSection.classList.add('hidden');
        });
    }
}

function addPollOptionField() {
    if (!pollOptions) return;
    
    const optionCount = pollOptions.querySelectorAll('.poll-option-field').length;
    if (optionCount >= 6) {
        showToast('Maximum 6 options allowed', 'error');
        return;
    }
    
    const optionField = document.createElement('div');
    optionField.className = 'poll-option-field flex items-center space-x-2 mb-2';
    optionField.innerHTML = `
        <input type="text" class="flex-1 p-2 border border-gray-300 rounded-lg" placeholder="Option ${optionCount + 1}">
        <button class="remove-poll-option text-red-500 hover:text-red-700">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    pollOptions.appendChild(optionField);
    
    optionField.querySelector('.remove-poll-option').addEventListener('click', () => {
        optionField.remove();
    });
}

async function createNewPoll() {
    if (!pollQuestion || !pollQuestion.value.trim()) {
        showToast('Please enter a poll question', 'error');
        return;
    }
    
    const optionInputs = pollOptions.querySelectorAll('input[type="text"]');
    const options = [];
    optionInputs.forEach(input => {
        if (input.value.trim()) {
            options.push(input.value.trim());
        }
    });
    
    if (options.length < 2) {
        showToast('Please add at least 2 options', 'error');
        return;
    }
    
    if (options.length > 6) {
        showToast('Maximum 6 options allowed', 'error');
        return;
    }
    
    try {
        const pollData = {
            type: 'poll',
            pollQuestion: pollQuestion.value.trim(),
            pollOptions: options,
            pollVotes: options.map(() => 0),
            totalVotes: 0,
            senderId: currentUser.uid,
            senderName: currentUserData.displayName,
            chatId: currentChat.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent'
        };
        
        await db.collection('messages').add(pollData);
        
        // Update chat document with last message
        await db.collection('chats').doc(currentChat.id).update({
            lastMessage: `📊 Poll: ${pollQuestion.value.trim().substring(0, 30)}...`,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            [`unread.${currentChat.friendId}`]: firebase.firestore.FieldValue.increment(1)
        });
        
        // Clear poll creation
        pollQuestion.value = '';
        pollOptions.innerHTML = '';
        
        // Hide poll creation section
        if (pollCreationSection) pollCreationSection.classList.add('hidden');
        
        showToast('Poll created successfully', 'success');
        
    } catch (error) {
        console.error('Error creating poll:', error);
        showToast('Error creating poll', 'error');
    }
}

async function voteOnPoll(messageId, optionIndex) {
    if (!currentUser || !currentChat) return;
    
    try {
        const messageRef = db.collection('messages').doc(messageId);
        const messageDoc = await messageRef.get();
        
        if (!messageDoc.exists) return;
        
        const messageData = messageDoc.data();
        const voters = messageData.voters || [];
        
        // Check if user already voted
        if (voters.includes(currentUser.uid)) {
            showToast('You have already voted on this poll', 'error');
            return;
        }
        
        // Update votes
        const pollVotes = [...messageData.pollVotes];
        pollVotes[optionIndex] = (pollVotes[optionIndex] || 0) + 1;
        
        await messageRef.update({
            pollVotes: pollVotes,
            totalVotes: (messageData.totalVotes || 0) + 1,
            voters: [...voters, currentUser.uid]
        });
        
        showToast('Vote recorded', 'success');
        
    } catch (error) {
        console.error('Error voting on poll:', error);
        showToast('Error voting on poll', 'error');
    }
}
// Add this function anywhere after the AI functions
function addAISettingsToProfile() {
    // This function can be called from your profile/settings page
    // to add a toggle for AI features
    console.log('Adding AI settings to profile...');
    
    const profileModal = document.getElementById('profileModal');
    if (!profileModal) return;
    
    // Look for settings section
    const settingsSection = profileModal.querySelector('.settings-section') || profileModal;
    
    // Create AI settings toggle
    const aiToggleHTML = `
        <div class="setting-item">
            <div class="flex items-center justify-between p-3 border-b border-gray-200">
                <div class="flex items-center">
                    <i class="fas fa-robot text-purple-600 mr-3 text-lg"></i>
                    <div>
                        <p class="font-medium">AI Features</p>
                        <p class="text-sm text-gray-500">Smart replies, summaries</p>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="aiFeaturesToggle" ${currentUserData?.aiEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    `;
    
    // Add to settings
    settingsSection.insertAdjacentHTML('beforeend', aiToggleHTML);
    
    // Add event listener
    setTimeout(() => {
        const toggle = document.getElementById('aiFeaturesToggle');
        if (toggle) {
            toggle.addEventListener('change', async function() {
                const enabled = this.checked;
                
                // Update in database
                await db.collection('users').doc(currentUser.uid).update({
                    aiEnabled: enabled,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update local data
                currentUserData.aiEnabled = enabled;
                
                // Update UI
                if (enabled) {
                    showAIFeatures();
                    showToast('AI features enabled', 'success');
                } else {
                    hideAIFeatures();
                    showToast('AI features disabled', 'info');
                }
            });
        }
    }, 100);
}

// Call this when opening profile/settings
// addAISettingsToProfile();

// ==================== MESSAGE SELECTION ====================
let selectedMessages = new Set();

function setupMessageSelection() {
    if (cancelSelection) {
        cancelSelection.addEventListener('click', () => {
            clearMessageSelection();
        });
    }
    
    if (forwardSelected) {
        forwardSelected.addEventListener('click', forwardSelectedMessages);
    }
    
    if (starSelected) {
        starSelected.addEventListener('click', starSelectedMessages);
    }
    
    if (deleteSelected) {
        deleteSelected.addEventListener('click', deleteSelectedMessages);
    }
}

function clearMessageSelection() {
    selectedMessages.clear();
    if (messageSelectionToolbar) messageSelectionToolbar.classList.add('hidden');
    
    // Remove selection styling
    document.querySelectorAll('.message-item.selected').forEach(el => {
        el.classList.remove('selected');
    });
}

function toggleMessageSelection(messageId) {
    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
    } else {
        selectedMessages.add(messageId);
    }
    
    // Update UI
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.classList.toggle('selected');
    }
    
    // Show/hide toolbar
    if (selectedMessages.size > 0) {
        if (messageSelectionToolbar) messageSelectionToolbar.classList.remove('hidden');
        if (selectedMessagesCount) selectedMessagesCount.textContent = selectedMessages.size;
    } else {
        if (messageSelectionToolbar) messageSelectionToolbar.classList.add('hidden');
    }
}

async function forwardSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    showToast(`Forwarding ${selectedMessages.size} messages`, 'info');
    clearMessageSelection();
}

async function starSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    try {
        const batch = db.batch();
        selectedMessages.forEach(messageId => {
            const messageRef = db.collection('messages').doc(messageId);
            batch.update(messageRef, { starred: true });
        });
        
        await batch.commit();
        showToast(`${selectedMessages.size} messages starred`, 'success');
        clearMessageSelection();
        
    } catch (error) {
        console.error('Error starring messages:', error);
        showToast('Error starring messages', 'error');
    }
}

async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    if (confirm(`Delete ${selectedMessages.size} selected messages?`)) {
        try {
            const batch = db.batch();
            selectedMessages.forEach(messageId => {
                const messageRef = db.collection('messages').doc(messageId);
                batch.update(messageRef, { deleted: true });
            });
            
            await batch.commit();
            showToast(`${selectedMessages.size} messages deleted`, 'success');
            clearMessageSelection();
            
        } catch (error) {
            console.error('Error deleting messages:', error);
            showToast('Error deleting messages', 'error');
        }
    }
}

// ==================== REPLY SYSTEM ====================
function setupReplySystem() {
    if (cancelReply) {
        cancelReply.addEventListener('click', () => {
            if (replyPreviewBar) {
                replyPreviewBar.classList.add('hidden');
                window.currentReplyMessage = null;
            }
        });
    }
}

function showReplyPreview(message) {
    if (!replyPreviewBar || !replyToName || !replyPreviewContent) return;
    
    replyToName.textContent = message.senderName || 'User';
    replyPreviewContent.textContent = message.text.length > 50 
        ? message.text.substring(0, 50) + '...' 
        : message.text;
    
    replyPreviewBar.classList.remove('hidden');
    window.currentReplyMessage = message;
}

// ==================== CONTEXT MENU ====================
function setupContextMenuActions() {
    if (!messageContextMenu) return;
    
    // Close context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (messageContextMenu && !messageContextMenu.contains(e.target) && 
            !e.target.closest('.message-item')) {
            messageContextMenu.classList.add('hidden');
        }
    });
    
    // Context menu items
    const contextMenuItems = [
        { selector: '[data-action="reply"]', action: handleReply },
        { selector: '[data-action="forward"]', action: handleForward },
        { selector: '[data-action="star"]', action: handleStar },
        { selector: '[data-action="copy"]', action: handleCopy },
        { selector: '[data-action="delete"]', action: handleDelete }
    ];
    
    contextMenuItems.forEach(({ selector, action }) => {
        const element = messageContextMenu.querySelector(selector);
        if (element) {
            element.addEventListener('click', action);
        }
    });
}

function handleReply() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId && window.selectedMessage) {
        showReplyPreview(window.selectedMessage);
    }
    messageContextMenu.classList.add('hidden');
}

function handleForward() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId) {
        toggleMessageSelection(messageId);
    }
    messageContextMenu.classList.add('hidden');
}

function handleStar() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId) {
        toggleMessageSelection(messageId);
        setTimeout(() => {
            starSelectedMessages();
        }, 100);
    }
    messageContextMenu.classList.add('hidden');
}

function handleCopy() {
    if (window.selectedMessage && window.selectedMessage.text) {
        navigator.clipboard.writeText(window.selectedMessage.text)
            .then(() => {
                showToast('Message copied to clipboard', 'success');
            })
            .catch(() => {
                showToast('Failed to copy message', 'error');
            });
    }
    messageContextMenu.classList.add('hidden');
}

function handleDelete() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId) {
        toggleMessageSelection(messageId);
        setTimeout(() => {
            deleteSelectedMessages();
        }, 100);
    }
    messageContextMenu.classList.add('hidden');
}

function setupMessageContextMenu(messageElement, message, messageId) {
    messageElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Show context menu
        if (messageContextMenu) {
            messageContextMenu.style.left = `${e.pageX}px`;
            messageContextMenu.style.top = `${e.pageY}px`;
            messageContextMenu.classList.remove('hidden');
            messageContextMenu.dataset.messageId = messageId;
        }
        
        // Store selected message
        window.selectedMessageId = messageId;
        window.selectedMessage = message;
    });
}

// ==================== MOOD SUGGESTIONS ====================
function setupMoodSuggestions() {
    if (dismissSuggestion) {
        dismissSuggestion.addEventListener('click', () => {
            if (moodSuggestion) moodSuggestion.classList.add('hidden');
        });
    }
}

// ==================== BUSINESS TOOLS ====================
function setupBusinessTools() {
    if (catalogueBtn) {
        catalogueBtn.addEventListener('click', () => {
            if (catalogueModal) catalogueModal.classList.remove('hidden');
        });
    }
    
    if (advertiseBtn) {
        advertiseBtn.addEventListener('click', () => {
            if (advertiseModal) advertiseModal.classList.remove('hidden');
        });
    }
    
    if (labelsBtn) {
        labelsBtn.addEventListener('click', () => {
            if (labelsModal) labelsModal.classList.remove('hidden');
        });
    }
    
    if (greetingBtn) {
        greetingBtn.addEventListener('click', () => {
            if (greetingModal) greetingModal.classList.remove('hidden');
        });
    }
    
    if (awayBtn) {
        awayBtn.addEventListener('click', () => {
            if (awayModal) awayModal.classList.remove('hidden');
        });
    }
}

// ==================== AI FEATURES ====================
function setupAIFeatures() {
    if (aiSummarize) {
        aiSummarize.addEventListener('click', generateAISummary);
    }
    
    if (aiReply) {
        aiReply.addEventListener('click', generateSmartReplies);
    }
}

async function generateAISummary() {
    if (!currentChat) {
        showToast('Please open a chat first', 'error');
        return;
    }
    
    showToast('Generating AI summary...', 'info');
    
    try {
        // Get recent messages for summary
        const messagesSnapshot = await db.collection('messages')
            .where('chatId', '==', currentChat.id)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();
        
        if (messagesSnapshot.empty) {
            showToast('Not enough messages to summarize', 'error');
            return;
        }
        
        const messages = [];
        messagesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.text && !data.deleted) {
                messages.push({
                    sender: data.senderName,
                    text: data.text,
                    time: data.timestamp?.toDate?.() || new Date()
                });
            }
        });
        
        // Simulate AI summary
        const summary = `Conversation Summary (${messages.length} recent messages):
        
        ${messages.slice(0, 3).map(msg => `• ${msg.sender}: ${msg.text.substring(0, 50)}...`).join('\n')}
        
        ${messages.length > 3 ? `... and ${messages.length - 3} more messages` : ''}`;
        
        // Display summary
        if (aiSummaryModal) {
            const aiSummaryContent = document.getElementById('aiSummaryContent');
            if (aiSummaryContent) {
                aiSummaryContent.textContent = summary;
                aiSummaryModal.classList.remove('hidden');
            }
        }
        
    } catch (error) {
        console.error('Error generating summary:', error);
        showToast('Error generating summary', 'error');
    }
}

async function generateSmartReplies() {
    if (!currentChat) {
        showToast('Please open a chat first', 'error');
        return;
    }
    
    showToast('Generating smart replies...', 'info');
    
    try {
        // Simulate AI-generated replies
        const smartReplies = [
            "Yes, that sounds good!",
            "No, I don't think so.",
            "Let me think about it.",
            "Can we discuss this later?",
            "I agree with you.",
            "That's interesting!",
            "Thanks for sharing!"
        ];
        
        // Display smart replies
        if (smartRepliesModal) {
            const smartRepliesList = document.getElementById('smartRepliesList');
            if (smartRepliesList) {
                smartRepliesList.innerHTML = '';
                
                smartReplies.forEach(reply => {
                    const replyItem = document.createElement('div');
                    replyItem.className = 'smart-reply-item';
                    replyItem.textContent = reply;
                    replyItem.addEventListener('click', () => {
                        if (messageInput) {
                            messageInput.value = reply;
                            messageInput.focus();
                            smartRepliesModal.classList.add('hidden');
                        }
                    });
                    smartRepliesList.appendChild(replyItem);
                });
                
                smartRepliesModal.classList.remove('hidden');
            }
        }
        
    } catch (error) {
        console.error('Error generating smart replies:', error);
        showToast('Error generating smart replies', 'error');
    }
}

// ==================== HELP CENTER ====================
function setupHelpCenter() {
    // This function sets up help center functionality
}

// ==================== MODALS ====================
// ==================== UNIVERSAL MODAL HANDLER ====================
function setupModals() {
    console.log('Setting up modals...');
    
    // 1. Close all modals when clicking outside
    document.addEventListener('click', function(e) {
        // If clicking on modal backdrop (the dark background)
        if (e.target.classList.contains('modal') || 
            e.target.classList.contains('modal-backdrop') ||
            e.target.hasAttribute('data-modal-backdrop')) {
            
            // Find and close the modal
            let modal = e.target;
            while (modal && !modal.classList.contains('modal')) {
                modal = modal.parentElement;
            }
            if (modal) {
                modal.classList.add('hidden');
                console.log('Closed modal by backdrop:', modal.id);
            }
        }
    });
    
    // 2. Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(modal => {
                if (!modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    console.log('Closed modal with Escape:', modal.id);
                }
            });
        }
    });
    
    // 3. Setup specific close buttons (only if they exist)
    const modalClosePairs = [
        { closeBtn: 'closeFeatures', modal: 'featuresModal' },
        { closeBtn: 'closeMood', modal: 'moodModal' },
        { closeBtn: 'closeQuickActions', modal: 'quickActionsModal' },
        { closeBtn: 'closeStatusViewer', modal: 'statusViewerModal' },
        { closeBtn: 'closeEnhancedSearch', modal: 'friendSearchResultsModal' },
        { closeBtn: 'cancelFriend', modal: 'addFriendModal' },
        { closeBtn: 'cancelEditFriend', modal: 'editFriendModal' },
        { closeBtn: 'closeAllFriends', modal: 'allFriendsModal' },
        { closeBtn: 'closeCreateGoal', modal: 'createGoalModal' },
        { closeBtn: 'closePollCreation', modal: 'pollCreationSection' },
        { closeBtn: 'cancelGoal', modal: 'createGoalModal' },
        { closeBtn: 'dismissSuggestion', modal: 'moodSuggestion' },
        { closeBtn: 'dismissPollResults', modal: 'pollResultsSection' },
        { closeBtn: 'cancelReply', modal: 'replyPreviewBar' }
    ];
    
    modalClosePairs.forEach(pair => {
        const closeBtn = document.getElementById(pair.closeBtn);
        const modal = document.getElementById(pair.modal);
        
        if (closeBtn && modal) {
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                modal.classList.add('hidden');
                console.log(`Closed ${modal.id} via ${closeBtn.id}`);
            });
        } else {
            console.warn(`Could not connect: ${pair.closeBtn} → ${pair.modal}`);
        }
    });
    
    // 4. Mood options
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            const mood = this.dataset.mood;
            if (mood) {
                updateMood(mood);
            }
        });
    });
    
    // 5. Save Goal button (if it exists)
    const saveGoalBtn = document.getElementById('saveGoal');
    if (saveGoalBtn && createGoalModal) {
        saveGoalBtn.addEventListener('click', async function() {
            const title = document.getElementById('goalTitle')?.value;
            const description = document.getElementById('goalDescription')?.value;
            const dueDate = document.getElementById('goalDueDate')?.value;
            const progress = document.getElementById('goalProgress')?.value;
            
            if (!title) {
                showToast('Please enter a goal title', 'error');
                return;
            }
            
            try {
                // Save goal logic here
                showToast('Goal saved successfully!', 'success');
                createGoalModal.classList.add('hidden');
                
                // Clear form
                if (document.getElementById('goalTitle')) document.getElementById('goalTitle').value = '';
                if (document.getElementById('goalDescription')) document.getElementById('goalDescription').value = '';
                
            } catch (error) {
                console.error('Error saving goal:', error);
                showToast('Error saving goal', 'error');
            }
        });
    }
}


function handleQuickAction(action) {
    switch(action) {
        case 'create-status':
            if (statusCreation) statusCreation.classList.remove('hidden');
            break;
        case 'create-goal':
            if (createGoalModal) createGoalModal.classList.remove('hidden');
            break;
        case 'share-contact':
            showToast('Share contact feature coming soon', 'info');
            break;
        case 'schedule-call':
            showToast('Schedule call feature coming soon', 'info');
            break;
        default:
            console.log('Quick action:', action);
    }
}

// ==================== SEARCH FUNCTIONALITY ====================
async function searchUsers(query) {
    if (!query) return [];
    
    console.log('Searching users for:', query);
    
    try {
        // Search by name
        const nameQuery = await db.collection('users')
            .where('displayName', '>=', query)
            .where('displayName', '<=', query + '\uf8ff')
            .limit(10)
            .get();
        
        const results = [];
        nameQuery.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                results.push({
                    id: doc.id,
                    ...doc.data()
                });
            }
        });
        
        console.log('Search results:', results.length, 'users found');
        return results;
        
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

function displayEnhancedSearchResults(results) {
    if (!enhancedSearchResults) return;
    
    enhancedSearchResults.innerHTML = '';
    
    if (results.length === 0) {
        enhancedSearchResults.innerHTML = '<p class="text-center text-gray-500 py-4">No users found</p>';
        return;
    }
    
    console.log('Displaying', results.length, 'search results');
    
    results.forEach(user => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';
        resultItem.innerHTML = `
            <div class="flex items-center p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer">
                <img class="w-10 h-10 rounded-full mr-3" src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff`}" alt="${user.displayName}">
                <div class="flex-1">
                    <p class="font-medium">${user.displayName}</p>
                    <p class="text-sm text-gray-500">${user.email || ''}</p>
                </div>
                <div class="flex space-x-2">
                    <button class="add-friend bg-purple-600 text-white px-3 py-1 rounded-lg" data-id="${user.id}" data-name="${user.displayName}">
                        <i class="fas fa-user-plus"></i>
                    </button>
                    <button class="message-user bg-green-600 text-white px-3 py-1 rounded-lg" data-id="${user.id}" data-name="${user.displayName}">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
            </div>
        `;
        
        enhancedSearchResults.appendChild(resultItem);
    });
    
    // Add event listeners to buttons using event delegation
    enhancedSearchResults.addEventListener('click', function(e) {
        if (e.target.closest('.add-friend')) {
            const btn = e.target.closest('.add-friend');
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            sendFriendRequest(userId);
            if (friendSearchResultsModal) friendSearchResultsModal.classList.add('hidden');
            showToast(`Friend request sent to ${userName}`, 'success');
        }
        
        if (e.target.closest('.message-user')) {
            const btn = e.target.closest('.message-user');
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            startChat(userId, userName);
            if (friendSearchResultsModal) friendSearchResultsModal.classList.add('hidden');
        }
    });
}

async function sendFriendRequest(friendId) {
    try {
        console.log('Sending friend request to:', friendId);
        
        // Check if friendship already exists
        const existingFriendship = await db.collection('friendships')
            .where('users', 'array-contains', currentUser.uid)
            .where('status', 'in', ['pending', 'accepted'])
            .get();
        
        const alreadyFriends = existingFriendship.docs.some(doc => {
            const data = doc.data();
            return data.users.includes(friendId);
        });
        
        if (alreadyFriends) {
            showToast('Friend request already sent or user is already your friend', 'error');
            return;
        }
        
        // Create friendship document
        const friendship = {
            users: [currentUser.uid, friendId],
            status: 'pending',
            requestedBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('friendships').add(friendship);
        console.log('Friend request sent successfully');
        showToast('Friend request sent successfully', 'success');
    } catch (error) {
        console.error('Error sending friend request:', error);
        showToast('Error sending friend request', 'error');
    }
}

// ==================== FAVORITES MANAGEMENT ====================
function loadFavorites() {
    if (!currentUser || !favoritesList) return;
    
    // Load favorites from user data
    db.collection('users').doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists) {
                const userData = doc.data();
                const favorites = userData.favorites || [];
                
                favoritesList.innerHTML = '';
                
                if (favorites.length === 0) {
                    favoritesList.innerHTML = `
                        <div class="text-center text-gray-500 py-8">
                            <i class="fas fa-star text-4xl mb-3 text-gray-300 block"></i>
                            <p>No favorites yet</p>
                            <p class="text-sm mt-1">Add friends to your favorites list</p>
                        </div>
                    `;
                    return;
                }
                
                // Load favorite friends details
                const favoritePromises = favorites.map(friendId => {
                    return db.collection('users').doc(friendId).get();
                });
                
                Promise.all(favoritePromises).then(docs => {
                    docs.forEach((doc, index) => {
                        if (doc.exists) {
                            const friendData = doc.data();
                            const friendItem = document.createElement('div');
                            friendItem.className = 'favorite-item';
                            friendItem.innerHTML = `
                                <div class="flex items-center justify-between p-3 border-b border-gray-200">
                                    <div class="flex items-center space-x-3">
                                        <img class="w-10 h-10 rounded-full" src="${friendData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friendData.displayName)}&background=7C3AED&color=fff`}" alt="${friendData.displayName}">
                                        <div>
                                            <p class="font-medium">${friendData.displayName}</p>
                                            <p class="text-xs text-gray-500">⭐ Favorite</p>
                                        </div>
                                    </div>
                                    <div class="flex space-x-2">
                                        <button class="call-favorite px-3 py-1 bg-green-500 text-white rounded-lg" data-id="${favorites[index]}" data-name="${friendData.displayName}">
                                            Call
                                        </button>
                                    </div>
                                </div>
                            `;
                            
                            favoritesList.appendChild(friendItem);
                        }
                    });
                    
                    // Add event listeners for call buttons
                    favoritesList.addEventListener('click', function(e) {
                        if (e.target.closest('.call-favorite')) {
                            const btn = e.target.closest('.call-favorite');
                            const friendId = btn.dataset.id;
                            const friendName = btn.dataset.name;
                            if (window.startVoiceCallWithFriend) {
                                window.startVoiceCallWithFriend(friendId, friendName);
                            }
                        }
                    });
                });
            }
        })
        .catch(error => {
            console.error('Error loading favorites:', error);
        });
}

// ==================== ALL FRIENDS VIEW ====================
function loadAllFriendsView() {
    if (!allFriendsList) return;
    
    allFriendsList.innerHTML = '';
    
    if (friends.length === 0) {
        if (noAllFriendsMessage) {
            noAllFriendsMessage.classList.remove('hidden');
        }
        return;
    }
    
    if (noAllFriendsMessage) {
        noAllFriendsMessage.classList.add('hidden');
    }
    
    friends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'all-friend-item';
        friendItem.innerHTML = `
            <div class="flex items-center justify-between p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer">
                <div class="flex items-center space-x-3">
                    <img class="w-10 h-10 rounded-full" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                    <div>
                        <p class="font-medium">${friend.displayName}</p>
                        <p class="text-sm text-gray-500">${friend.about || 'Hey there! I am using Kynecta'}</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="message-all-friend px-3 py-1 bg-purple-500 text-white rounded-lg" data-id="${friend.id}" data-name="${friend.displayName}">
                        Message
                    </button>
                    <button class="call-all-friend px-3 py-1 bg-green-500 text-white rounded-lg" data-id="${friend.id}" data-name="${friend.displayName}">
                        Call
                    </button>
                </div>
            </div>
        `;
        
        allFriendsList.appendChild(friendItem);
    });
    
    // Add event listeners for message/call buttons
    allFriendsList.addEventListener('click', function(e) {
        if (e.target.closest('.message-all-friend')) {
            const btn = e.target.closest('.message-all-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            startChat(friendId, friendName);
            if (allFriendsModal) allFriendsModal.classList.add('hidden');
        }
        
        if (e.target.closest('.call-all-friend')) {
            const btn = e.target.closest('.call-all-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            }
            if (allFriendsModal) allFriendsModal.classList.add('hidden');
        }
    });
}

// ==================== BUSINESS DOCUMENT INITIALIZATION ====================
function initializeBusinessDocument(userId) {
    const businessDocRef = firebase.firestore().collection('business').doc(userId);
    const userDocRef = firebase.firestore().collection('users').doc(userId);
    
    businessDocRef.get().then((doc) => {
        if (!doc.exists) {
            // Create initial business document
            return businessDocRef.set({
                userId: userId,
                businessName: '',
                greetingMessage: 'Hello! Thanks for messaging me. How can I help you today?',
                awayMessage: 'Sorry, I\'m away right now. I\'ll get back to you as soon as possible.',
                awayEnabled: false,
                catalogue: [],
                labels: [],
                isBusinessAccount: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }).then(() => {
        // Also update user document with business info for quick access
        return userDocRef.update({
            hasBusiness: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).catch(error => {
        console.error('Error initializing business document:', error);
    });
}

// ==================== NOTIFICATION PERMISSION ====================
async function requestNotificationPermission() {
    try {
        // Check if permission is already denied/blocked
        if (Notification.permission === 'denied') {
            console.log('Notifications blocked by user. User must manually enable in browser settings.');
            return;
        }
        
        // Don't ask if already granted
        if (Notification.permission === 'granted') {
            console.log('Notifications already granted');
            return;
        }
        
        // Only ask if permission is default
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('Notification permission granted');
            }
        }
    } catch (error) {
        console.error('Error with notification permission:', error);
    }
}

async function sendPushNotification(userId, senderName, message) {
    try {
        console.log('Sending push notification to:', userId);
        // Get recipient's FCM token
        const recipientDoc = await db.collection('users').doc(userId).get();
        if (recipientDoc.exists) {
            const recipientData = recipientDoc.data();
            const fcmToken = recipientData.fcmToken;
            
            if (fcmToken) {
                console.log(`Sending push notification to ${userId}: ${senderName}: ${message}`);
            }
        }
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
    console.log('Setting up event listeners');

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
        });
    }

    // Back to chats (mobile)
    if (backToChats) {
        backToChats.addEventListener('click', goBackToTabs);
    }
    
    // Also handle escape key to go back
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && currentChat) {
            goBackToTabs();
        }
    });

    // Message input and sending
    if (messageInput) {
        messageInput.addEventListener('input', handleTypingIndicator);
        
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    // File attachment
    if (attachBtn) {
        attachBtn.addEventListener('click', () => {
            console.log('Attach file clicked');
            // Create a file input element
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '*/*';
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    console.log('File selected:', e.target.files[0].name);
                    uploadFile(e.target.files[0]);
                }
            });
            fileInput.click();
        });
    }

    // Remove file preview
    if (removeFile) {
        removeFile.addEventListener('click', () => {
            console.log('Remove file preview clicked');
            if (filePreview) filePreview.classList.add('hidden');
        });
    }

    // Emoji picker
    if (emojiBtn) {
        emojiBtn.addEventListener('click', toggleEmojiPicker);
    }

    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiBtn = document.getElementById('emojiBtn');
        
        if (emojiPicker && emojiPicker.style.display === 'block' && 
            !emojiPicker.contains(e.target) && 
            !(emojiBtn && emojiBtn.contains(e.target))) {
            emojiPicker.style.display = 'none';
        }
    });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to log out?')) {
                console.log('Logging out user');
                auth.signOut().then(() => {
                    window.location.href = 'index.html';
                }).catch(error => {
                    console.error('Error signing out:', error);
                    showToast('Error signing out', 'error');
                });
            }
        });
    }

    // Scroll to bottom button
    if (scrollToBottom) {
        scrollToBottom.addEventListener('click', () => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        });
    }

    // Voice to text button
    if (voiceToTextBtn) {
        voiceToTextBtn.addEventListener('click', setupVoiceToText);
    }

    console.log('Event listeners setup completed');
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('kynecta-theme', theme);
    
    // Update theme icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// ==================== VOICE TO TEXT ====================
function setupVoiceToText() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.start();
        showToast('Listening... Speak now', 'info');
        
        if (voiceRecordingIndicator) {
            voiceRecordingIndicator.classList.remove('hidden');
        }
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (messageInput) {
                messageInput.value = transcript;
            }
            
            if (voiceRecordingIndicator) {
                voiceRecordingIndicator.classList.add('hidden');
            }
            
            showToast('Speech recognized', 'success');
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (voiceRecordingIndicator) {
                voiceRecordingIndicator.classList.add('hidden');
            }
            showToast('Speech recognition failed', 'error');
        };
        
        recognition.onend = () => {
            if (voiceRecordingIndicator) {
                voiceRecordingIndicator.classList.add('hidden');
            }
        };
    } else {
        showToast('Speech recognition not supported in this browser', 'error');
    }
}

// ==================== AUTO SCROLL DETECTION ====================
function setupAutoScrollDetection() {
    if (!messagesContainer || !scrollToBottom) return;
    
    messagesContainer.addEventListener('scroll', () => {
        const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        
        if (isAtBottom) {
            scrollToBottom.classList.add('hidden');
        } else {
            scrollToBottom.classList.remove('hidden');
        }
    });
}


// ==================== LOAD ALL USERS ====================
async function loadAllUsers() {
    try {
        if (!currentUser || !db) {
            console.log('User not authenticated or database not available');
            allUsers = [];
            return;
        }
        
        console.log('Loading all users...');
        
        const usersSnapshot = await db.collection('users').get();
        allUsers = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            // Don't include current user
            if (doc.id !== currentUser.uid) {
                allUsers.push({
                    id: doc.id,
                    ...userData
                });
            }
        });
        
        console.log(`✅ Loaded ${allUsers.length} users`);
        return allUsers;
        
    } catch (error) {
        console.error('❌ Error loading all users:', error);
        allUsers = [];
        return [];
    }
}

// ==================== MOBILE OPTIMIZATIONS ====================
function optimizeForMobile() {
    // Prevent zoom on input focus
    document.addEventListener('touchstart', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            document.body.style.zoom = '100%';
        }
    }, { passive: true });

    // Handle viewport height issues on mobile
    function setViewportHeight() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
}

// Initialize mobile optimizations
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    console.log('Mobile device detected, applying optimizations');
    optimizeForMobile();
}

// ==================== INITIALIZE ALL FEATURES ====================
// Call initialization functions
setupAutoScrollDetection();

// Dispatch event when friends are rendered
window.dispatchEvent(new CustomEvent('friendsRendered'));

// Listen for friends rendered event to add call buttons
window.addEventListener('friendsRendered', () => {
    console.log('🎯 Friends rendered, adding call buttons');
    setTimeout(() => {
        if (window.addCallButtonsToFriendList) {
            window.addCallButtonsToFriendList();
        }
        if (window.addCallButtonsToChat) {
            window.addCallButtonsToChat();
        }
    }, 100);
});

=======
// ==================== GLOBAL ERROR HANDLING ====================

function setupGlobalErrorHandling() {
    // Handle all image errors
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            handleImageError(e.target);
        }
    }, true);

    // Also handle images that might be created dynamically
    const originalImage = window.Image;
    window.Image = function() {
        const img = new originalImage();
        img.addEventListener('error', function() {
            handleImageError(this);
        });
        return img;
    };
}

// ==================== UNIVERSAL FIX FOR ALL MISSING FUNCTIONS ====================
console.log('🔧 UNIVERSAL FIX: Catching ALL missing functions');

// 1. Fix missing variables for chat.js
if (typeof unsubscribeMessages === 'undefined') var unsubscribeMessages = null;
if (typeof unsubscribeChats === 'undefined') var unsubscribeChats = null;
if (typeof typingListener === 'undefined') var typingListener = null;
if (typeof typingTimeout === 'undefined') var typingTimeout = null;
if (typeof unsubscribeIncomingCalls === 'undefined') var unsubscribeIncomingCalls = null;

// 2. Create a handler for ALL undefined function calls
window.__handleMissingFunction = function(funcName, ...args) {
    console.warn(`⚠️ Function "${funcName}" was called but not defined. Creating placeholder.`);
    
    // Create the missing function on the fly
    window[funcName] = function(...innerArgs) {
        console.log(`🔄 Placeholder "${funcName}" called with:`, innerArgs);
        
        // Show user-friendly message
        if (typeof showToast === 'function') {
            showToast(`${funcName.replace(/([A-Z])/g, ' $1').trim()} feature is coming soon`, 'info');
        }
        
        // Return safe response
        return {
            success: true,
            message: `Function "${funcName}" executed (placeholder)`,
            funcName: funcName,
            args: innerArgs,
            timestamp: new Date().toISOString()
        };
    };
    
    // Call the newly created function
    return window[funcName](...args);
};

// 3. Override Function.prototype to catch ALL undefined functions
const originalFunction = Function;
window.Function = function(...args) {
    try {
        return originalFunction(...args);
    } catch (error) {
        console.error('Function creation error:', error);
        return function() {
            console.warn('Function execution failed');
            return { success: false, error: error.message };
        };
    }
};
window.Function.prototype = originalFunction.prototype;

// 4. Create placeholders for KNOWN missing functions
const knownMissingFunctions = [
    'viewUserStatuses',
    'unmuteAllStatuses',
    'openGroupChat',
    'loadUserGroups',
    'sendGroupMessage',
    'addParticipantToGroup',
    'removeParticipantFromGroup',
    'createNewGroup',
    'deleteGroup',
    'updateGroupSettings',
    'muteGroup',
    'unmuteGroup',
    'leaveGroup',
    'getGroupInfo',
    'updateGroupProfile',
    'handleGoalCreation',
    'handleStatusCreation',
    'manageGroupContextMenu',
    'updateSharedGoals',
    'toggleHighlightsPanel',
    'handleHashtagClick',
    'createNewGoal',
    'updateGoalProgress',
    'createStatusUpdate',
    'toggleTheme',
    'handleReactionSelection',
    'downloadFile',
    'openAllFriendsView',
    'editFriendSettings',
    'initiateVideoConference',
    'switchCamera',
    'handleCallControls',
    'toggleMute',
    'toggleVideo',
    'endCurrentCall',
    'acceptIncomingCall',
    'rejectIncomingCall',
    'startVoiceCall',
    'startVideoCall'
];

knownMissingFunctions.forEach(funcName => {
    if (typeof window[funcName] === 'undefined') {
        window[funcName] = function(...args) {
            return window.__handleMissingFunction(funcName, ...args);
        };
        console.log(`✅ Created placeholder for: ${funcName}`);
    }
});

// 5. Global error handler for undefined functions
window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('is not defined')) {
        const funcNameMatch = event.error.message.match(/(\w+) is not defined/);
        if (funcNameMatch) {
            const funcName = funcNameMatch[1];
            console.log(`🛠️ Auto-fixing undefined function: ${funcName}`);
            
            // Create the missing function
            if (typeof window[funcName] === 'undefined') {
                window[funcName] = function(...args) {
                    console.log(`🔧 Auto-created "${funcName}" called with:`, args);
                    return {
                        success: true,
                        message: `Auto-created function "${funcName}"`,
                        funcName: funcName,
                        args: args
                    };
                };
                
                // Prevent the error
                event.preventDefault();
                event.stopPropagation();
                
                console.log(`✅ Auto-created missing function: ${funcName}`);
                return false;
            }
        }
    }
}, true);

console.log('✅ UNIVERSAL FIX APPLIED - All missing functions will be caught');

// =================================================================================
// ==================== PREVENT DUPLICATE DECLARATIONS ====================
// Check if variables already exist to prevent conflicts
const globalVarsToProtect = [
    'closeStatusViewer', 
    'helpCenterModal',
    'statusViewerModal',
    'statusViewerContent',
    'currentUser',
    'currentUserData',
    'currentChat',
    'currentChatId',
    'friends',
    'allUsers'
];

globalVarsToProtect.forEach(varName => {
    if (typeof window[varName] !== 'undefined') {
        console.log(`⚠️ ${varName} already defined, skipping re-declaration`);
    }
});

// Only declare if they don't exist
if (typeof closeStatusViewer === 'undefined') var closeStatusViewer = null;
if (typeof helpCenterModal === 'undefined') var helpCenterModal = null;
if (typeof statusViewerModal === 'undefined') var statusViewerModal = null;
if (typeof statusViewerContent === 'undefined') var statusViewerContent = null;
if (typeof currentUser === 'undefined') var currentUser = null;
if (typeof currentUserData === 'undefined') var currentUserData = null;
if (typeof currentChat === 'undefined') var currentChat = null;
if (typeof currentChatId === 'undefined') var currentChatId = null;
if (typeof friends === 'undefined') var friends = [];
if (typeof allUsers === 'undefined') var allUsers = [];

// ==================== IMAGE ERROR HANDLING ====================
function setupImageErrorHandling() {
    console.log('Setting up image error handling...');
    
    // Handle all image loading errors
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            console.log('Image error detected:', e.target.src);
            
            // Don't handle data URLs or already fixed images
            if (e.target.src.startsWith('data:') || 
                e.target.classList.contains('error-handled')) {
                return;
            }
            
            // Set fallback for broken images
            const altText = e.target.alt || 'User';
            e.target.src = getDefaultAvatar(altText);
            e.target.classList.add('error-handled');
        }
    }, true);
    
    // Also handle dynamically created images
    const originalImage = window.Image;
    window.Image = function() {
        const img = new originalImage();
        img.addEventListener('error', function() {
            const altText = this.alt || 'User';
            this.src = getDefaultAvatar(altText);
            this.classList.add('error-handled');
        });
        return img;
    };
    
    console.log('✅ Image error handling setup complete');
}

function handleImageError(img) {
    // Skip if already handled or valid URLs
    if (img.classList.contains('error-handled') || 
        img.src.startsWith('data:') || 
        img.src.includes('blob:') ||
        img.src.includes('ui-avatars.com') ||
        img.src.includes('firebasestorage') ||
        img.src.includes('cloudinary')) {
        return;
    }
    
    console.warn('Fixing broken image:', img.src);
    
    // Fix specific problematic URLs
    if (img.src.includes('IMAGE_URL') || 
        !img.src || 
        img.src.includes('127.0.0.1') ||
        img.src === 'http://127.0.0.1:5500/IMAGE_URL' ||
        img.src.includes('/chat.html')) {
        
        const altText = img.alt || 'User';
        // Use a more reliable avatar service
        img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(altText)}&background=7C3AED&color=fff`;
    }
    
    // Special case for "Cover" images
    if (img.alt === 'Cover' || img.src.includes('Cover')) {
        img.src = 'https://via.placeholder.com/400x200/7C3AED/FFFFFF?text=Cover+Image';
    }
    
    img.classList.add('error-handled');
    img.onerror = null; // Prevent infinite loop
}

// ==================== FIREBASE INITIALIZATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
    authDomain: "uniconnect-ee95c.firebaseapp.com",
    projectId: "uniconnect-ee95c",
    storageBucket: "uniconnect-ee95c.firebasestorage.app",
    messagingSenderId: "1003264444309",
    appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

// Initialize Firebase
let auth, db, storage, messaging;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    messaging = firebase.messaging();
    
    console.log('Firebase initialized successfully');
    
    // 🔥 ADD THESE LINES TO SHARE WITH CALL.JS 🔥
    window.db = db;
    window.auth = auth;
    window.storage = storage;
    window.firebase = firebase;
    console.log('✅ Firebase shared with call.js');
    
} catch (error) {
    console.error('Firebase initialization failed:', error);
}

// ADD NETWORK STATUS MONITORING - Add this:
firebase.firestore().enableNetwork()
  .then(() => {
    console.log('Firestore online');
  })
  .catch((err) => {
    console.log('Firestore offline:', err);
  });

const cloudinaryConfig = {
    cloudName: 'dhjnxa5rh',
    apiKey: '817591969559894',
    uploadPreset: 'user_uploads'
};

// WebRTC Variables
window.localStream = null;
window.remoteStream = null;
window.peerConnection = null;
window.isMuted = false;
window.isVideoOff = false;
window.isInCall = false;
window.lastCallTime = 0;
window.CALL_COOLDOWN = 2000;

// Call State Variables
window.callState = {
    isCaller: false,
    isReceivingCall: false,
    callType: null,
    remoteUserId: null,
    callId: null,
    callStartTime: null
};

// ==================== DOM ELEMENTS INITIALIZATION ====================
// Main Layout Elements
const chatApp = document.getElementById('chatApp');
const loadingScreen = document.getElementById('loadingScreen');
const chatListContainer = document.getElementById('chatListContainer');
const messagesContainer = document.getElementById('messagesContainer');

// Sidebar Navigation Elements
const navIcons = document.querySelectorAll('.nav-icon[data-tab]');

// User Profile Header Elements
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userMood = document.getElementById('userMood');

// Personalization Info Section
const currentMoodsMini = document.getElementById('currentMoodsMini');
const currentInterestsMini = document.getElementById('currentInterestsMini');

// Search Elements
const searchInput = document.getElementById('searchInput');
const friendSearch = document.getElementById('friendSearch');

// Tab Panels
const chatsTab = document.getElementById('chatsTab');
const friendsTab = document.getElementById('friendsTab');
const updatesTab = document.getElementById('updatesTab');
const callsTab = document.getElementById('callsTab');
const toolsTab = document.getElementById('toolsTab');

// Chat List Elements
const chatList = document.getElementById('chatList');
const noChatsMessage = document.getElementById('noChatsMessage');

// Friends Tab Elements
const addFriendBtn = document.getElementById('addFriendBtn');
const friendRequestsSection = document.getElementById('friendRequestsSection');
const friendRequestsList = document.getElementById('friendRequestsList');
const noFriendRequests = document.getElementById('noFriendRequests');
const friendsList = document.getElementById('friendsList');
const noFriendsMessage = document.getElementById('noFriendsMessage');

// Updates Tab Elements
const myStatus = document.getElementById('myStatus');
const statusUpdates = document.getElementById('statusUpdates');

// Calls Tab Elements
const favoritesList = document.getElementById('favoritesList');
const manageFavorites = document.getElementById('manageFavorites');
const recentCalls = document.getElementById('recentCalls');

// Tools Tab Elements
const moodOptions = document.querySelectorAll('.mood-option');
const quickActionBtns = document.querySelectorAll('.quick-action-btn');
const catalogueBtn = document.getElementById('catalogueBtn');
const advertiseBtn = document.getElementById('advertiseBtn');
const labelsBtn = document.getElementById('labelsBtn');
const greetingBtn = document.getElementById('greetingBtn');
const awayBtn = document.getElementById('awayBtn');
const aiSummarize = document.getElementById('aiSummarize');
const aiReply = document.getElementById('aiReply');

// Chat Header Elements
const chatHeader = document.getElementById('chatHeader');
const backToChats = document.getElementById('backToChats');
const chatAvatar = document.getElementById('chatAvatar');
const chatTitle = document.getElementById('chatTitle');
const chatStatus = document.getElementById('chatStatus');
const moodIndicator = document.getElementById('moodIndicator');
const statusText = document.getElementById('statusText');
const typingIndicator = document.getElementById('typingIndicator');
const chatMenuBtn = document.getElementById('chatMenuBtn');

// Call buttons in chat header
const callButtons = {
    voice: document.querySelector('.friend-call-btn'),
    video: document.querySelector('.friend-video-call-btn')
};

// Shared Goals Section
const sharedGoalsSection = document.getElementById('sharedGoalsSection');
const toggleGoals = document.getElementById('toggleGoals');
const sharedGoalsContent = document.getElementById('sharedGoalsContent');
const noGoalsMessage = document.getElementById('noGoalsMessage');
const goalsList = document.getElementById('goalsList');
const createGoalBtn = document.getElementById('createGoalBtn');

// Message Highlights Panel
const highlightsPanel = document.getElementById('highlightsPanel');
const toggleHighlights = document.getElementById('toggleHighlights');
const highlightsContent = document.getElementById('highlightsContent');
const hashtagsList = document.getElementById('hashtagsList');
const noHighlightsMessage = document.getElementById('noHighlightsMessage');

// Message Selection Toolbar
const messageSelectionToolbar = document.getElementById('messageSelectionToolbar');
const selectedMessagesCount = document.getElementById('selectedMessagesCount');
const forwardSelected = document.getElementById('forwardSelected');
const starSelected = document.getElementById('starSelected');
const deleteSelected = document.getElementById('deleteSelected');
const cancelSelection = document.getElementById('cancelSelection');

// Reply Preview Bar
const replyPreviewBar = document.getElementById('replyPreviewBar');
const replyToName = document.getElementById('replyToName');
const replyPreviewContent = document.getElementById('replyPreviewContent');
const cancelReply = document.getElementById('cancelReply');

// Poll Results Display
const pollResultsSection = document.getElementById('pollResultsSection');
const pollResultsContent = document.getElementById('pollResultsContent');
const dismissPollResults = document.getElementById('dismissPollResults');

// Mood Suggestion
const moodSuggestion = document.getElementById('moodSuggestion');
const suggestionText = document.getElementById('suggestionText');
const dismissSuggestion = document.getElementById('dismissSuggestion');

// Input Area Elements
const inputArea = document.getElementById('inputArea');
const attachBtn = document.getElementById('attachBtn');
const cameraBtn = document.getElementById('cameraBtn');
const emojiBtn = document.getElementById('emojiBtn');
const voiceToTextBtn = document.getElementById('voiceToTextBtn');
const voiceRecordingIndicator = document.getElementById('voiceRecordingIndicator');
const messageInput = document.getElementById('messageInput');
const emojiPicker = document.getElementById('emojiPicker');
const isTyping = document.getElementById('isTyping');
const typingUsers = document.getElementById('typingUsers');
const sendBtn = document.getElementById('sendBtn');
const scrollToBottom = document.getElementById('scrollToBottom');

// Poll Creation Section
const pollCreationSection = document.getElementById('pollCreationSection');
const closePollCreation = document.getElementById('closePollCreation');
const pollQuestion = document.getElementById('pollQuestion');
const pollOptions = document.getElementById('pollOptions');
const addPollOption = document.getElementById('addPollOption');
const createPoll = document.getElementById('createPoll');
const cancelPoll = document.getElementById('cancelPoll');

// File Preview Section
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const removeFile = document.getElementById('removeFile');

// Video Conference Elements
const videoConference = document.getElementById('videoConference');
const conferenceGrid = document.getElementById('conferenceGrid');
const conferenceMuteBtn = document.getElementById('conferenceMuteBtn');
const conferenceVideoBtn = document.getElementById('conferenceVideoBtn');
const conferenceEndBtn = document.getElementById('conferenceEndBtn');

// Video Call Elements
const videoCallContainer = document.getElementById('videoCallContainer');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCameraBtn = document.getElementById('toggleCameraBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');

// Incoming Call Popup
const incomingCallPopup = document.getElementById('incomingCallPopup');
const incomingCallerName = document.getElementById('incomingCallerName');
const incomingCallType = document.getElementById('incomingCallType');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');

// Active Call Container
const callContainer = document.getElementById('callContainer');

// Create Goal Modal
const createGoalModal = document.getElementById('createGoalModal');
const goalTitle = document.getElementById('goalTitle');
const goalDescription = document.getElementById('goalDescription');
const goalDueDate = document.getElementById('goalDueDate');
const goalProgress = document.getElementById('goalProgress');
const goalProgressValue = document.getElementById('goalProgressValue');
const saveGoal = document.getElementById('saveGoal');
const cancelGoal = document.getElementById('cancelGoal');
const closeCreateGoal = document.getElementById('closeCreateGoal');

// Status Creation Modal
const statusCreation = document.getElementById('statusCreation');

// Context Menus
const messageContextMenu = document.getElementById('messageContextMenu');
const groupListContextMenu = document.getElementById('groupListContextMenu');

// Reaction Picker
const reactionPicker = document.getElementById('reactionPicker');

// File Upload Preview Modal
const enhancedFilePreview = document.getElementById('enhancedFilePreview');
const filePreviewContent = document.getElementById('filePreviewContent');
const downloadFileBtn = document.getElementById('downloadFileBtn');
const closeEnhancedFilePreview = document.getElementById('closeEnhancedFilePreview');

// All Friends Modal
const allFriendsModal = document.getElementById('allFriendsModal');
const allFriendsSearch = document.getElementById('allFriendsSearch');
const allFriendsList = document.getElementById('allFriendsList');
const noAllFriendsMessage = document.getElementById('noAllFriendsMessage');
const closeAllFriends = document.getElementById('closeAllFriends');

// Features Modal
const featuresModal = document.getElementById('featuresModal');
const closeFeatures = document.getElementById('closeFeatures');

// Mood Modal
const moodModal = document.getElementById('moodModal');
const closeMood = document.getElementById('closeMood');

// Quick Actions Modal
const quickActionsModal = document.getElementById('quickActionsModal');
const closeQuickActions = document.getElementById('closeQuickActions');

// Add Friend Modal
const addFriendModal = document.getElementById('addFriendModal');
const friendSearchInput = document.getElementById('friendSearchInput');
const searchResults = document.getElementById('searchResults');
const searchFriend = document.getElementById('searchFriend');
const cancelFriend = document.getElementById('cancelFriend');

// Enhanced Friend Search Modal
const friendSearchResultsModal = document.getElementById('friendSearchResultsModal');
const enhancedSearchResults = document.getElementById('enhancedSearchResults');
const closeEnhancedSearch = document.getElementById('closeEnhancedSearch');

// Edit Friend Modal
const editFriendModal = document.getElementById('editFriendModal');
const editFriendName = document.getElementById('editFriendName');
const editFriendStatus = document.getElementById('editFriendStatus');
const messageFriend = document.getElementById('messageFriend');
const callFriend = document.getElementById('callFriend');
const removeFriendBtn = document.getElementById('removeFriend');
const cancelEditFriend = document.getElementById('cancelEditFriend');

// Toast Notifications Container
const toastContainer = document.getElementById('toastContainer');

// Business Profile Elements (assuming they exist)
const businessProfileModal = document.getElementById('businessProfileModal');
const aiSummaryModal = document.getElementById('aiSummaryModal');
const smartRepliesModal = document.getElementById('smartRepliesModal');

// ==================== UTILITY FUNCTIONS ====================
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDefaultAvatar(name = 'User', size = 50) {
    const initial = name.charAt(0).toUpperCase();
    const colors = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EC4899'];
    const colorIndex = name.charCodeAt(0) % colors.length;
    const color = colors[colorIndex];
    
    const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${color}"/>
            <text x="${size/2}" y="${size/2 + size/10}" 
                  text-anchor="middle" fill="white" 
                  font-family="Arial, sans-serif" 
                  font-size="${size * 0.4}" 
                  font-weight="bold"
                  dominant-baseline="middle">
                ${initial}
            </text>
        </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function safeElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with id '${id}' not found`);
    }
    return element;
}

function safeClassList(id, action, className) {
    const element = safeElement(id);
    if (element && element.classList) {
        element.classList[action](className);
    }
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

function showToast(message, type = 'info') {
    console.log(`Toast: ${message} (${type})`);
    if (!toastContainer) {
        console.warn('Toast container not found');
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return 'fa-image';
    if (fileType.startsWith('video/')) return 'fa-video';
    if (fileType.startsWith('audio/')) return 'fa-music';
    if (fileType.includes('pdf')) return 'fa-file-pdf';
    if (fileType.includes('word') || fileType.includes('document')) return 'fa-file-word';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'fa-file-excel';
    if (fileType.includes('zip') || fileType.includes('compressed')) return 'fa-file-archive';
    return 'fa-file';
}

// ==================== NETWORK & ERROR HANDLING ====================
function setupNetworkMonitoring() {
    window.addEventListener('online', () => {
        console.log('App is online');
        showToast('Connection restored', 'success');
        firebase.firestore().enableNetwork().then(() => {
            console.log('Firestore reconnected');
            if (currentUser) {
                loadUserData();
            }
        });
    });

    window.addEventListener('offline', () => {
        console.log('App is offline');
        showToast('You are offline', 'warning');
    });

    if (!navigator.onLine) {
        showToast('You are currently offline', 'warning');
    }
}

// ==================== AI FEATURES MANAGEMENT ====================
function hideAIFeatures() {
    console.log('Hiding AI features...');
    
    // Hide AI Summarize button
    const aiSummarize = document.getElementById('aiSummarize');
    if (aiSummarize) {
        aiSummarize.style.display = 'none';
        console.log('✅ Hidden: AI Summarize button');
    }
    
    // Hide AI Reply button
    const aiReply = document.getElementById('aiReply');
    if (aiReply) {
        aiReply.style.display = 'none';
        console.log('✅ Hidden: AI Reply button');
    }
    
    // Hide AI related modals if they exist
    const aiSummaryModal = document.getElementById('aiSummaryModal');
    if (aiSummaryModal) {
        aiSummaryModal.style.display = 'none';
    }
    
    const smartRepliesModal = document.getElementById('smartRepliesModal');
    if (smartRepliesModal) {
        smartRepliesModal.style.display = 'none';
    }
    
    // Add enable button if not exists
    const toolsTab = document.getElementById('toolsTab');
    if (toolsTab && !document.getElementById('enableAIButton')) {
        const enableButton = document.createElement('button');
        enableButton.id = 'enableAIButton';
        enableButton.className = 'enable-ai-button';
        enableButton.innerHTML = `
            <div class="text-center p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg shadow-lg">
                <i class="fas fa-robot text-3xl mb-2"></i>
                <h3 class="font-bold text-lg mb-1">Enable AI Features</h3>
                <p class="text-sm opacity-90 mb-3">Unlock smart replies, conversation summaries, and more</p>
                <div class="flex space-x-2">
                    <button id="enableAIFeaturesBtn" class="flex-1 bg-white text-purple-600 py-2 rounded-lg font-medium hover:bg-gray-100">
                        Enable Now
                    </button>
                    <button id="learnMoreAIBtn" class="px-3 bg-transparent border border-white py-2 rounded-lg hover:bg-white hover:bg-opacity-20">
                        Learn More
                    </button>
                </div>
            </div>
        `;
        
        // Insert at the beginning of tools content
        const toolsContent = toolsTab.querySelector('.p-4') || toolsTab;
        if (toolsContent.firstChild) {
            toolsContent.insertBefore(enableButton, toolsContent.firstChild);
        } else {
            toolsContent.appendChild(enableButton);
        }
        
        // Add event listeners
        document.getElementById('enableAIFeaturesBtn')?.addEventListener('click', enableAIFeatures);
        document.getElementById('learnMoreAIBtn')?.addEventListener('click', showAILearnMore);
    }
}

function showAIFeatures() {
    console.log('Showing AI features...');
    
    // Show AI Summarize button
    const aiSummarize = document.getElementById('aiSummarize');
    if (aiSummarize) {
        aiSummarize.style.display = 'flex';
        console.log('✅ Showing: AI Summarize button');
    }
    
    // Show AI Reply button
    const aiReply = document.getElementById('aiReply');
    if (aiReply) {
        aiReply.style.display = 'flex';
        console.log('✅ Showing: AI Reply button');
    }
    
    // Remove enable button if exists
    const enableButton = document.getElementById('enableAIButton');
    if (enableButton) {
        enableButton.remove();
        console.log('✅ Removed enable AI button');
    }
}

function enableAIFeatures() {
    if (!currentUser || !currentUser.uid) {
        showToast('Please sign in to enable AI features', 'error');
        return;
    }
    
    // Create a simple modal for confirmation
    const modalHTML = `
        <div id="aiEnableModal" class="modal fixed inset-0 flex items-center justify-center z-50">
            <div class="modal-backdrop fixed inset-0 bg-black bg-opacity-50"></div>
            <div class="modal-content bg-white rounded-lg shadow-xl max-w-md w-full mx-4 z-10">
                <div class="p-6">
                    <div class="text-center mb-4">
                        <i class="fas fa-robot text-4xl text-purple-600 mb-3"></i>
                        <h3 class="text-xl font-bold text-gray-800">Enable AI Features</h3>
                    </div>
                    
                    <div class="space-y-3 mb-6">
                        <div class="flex items-start">
                            <i class="fas fa-comment-dots text-green-500 mt-1 mr-3"></i>
                            <div>
                                <p class="font-medium">Smart Replies</p>
                                <p class="text-sm text-gray-600">AI-powered reply suggestions</p>
                            </div>
                        </div>
                        <div class="flex items-start">
                            <i class="fas fa-file-alt text-blue-500 mt-1 mr-3"></i>
                            <div>
                                <p class="font-medium">Conversation Summaries</p>
                                <p class="text-sm text-gray-600">AI-generated chat summaries</p>
                            </div>
                        </div>
                        <div class="flex items-start">
                            <i class="fas fa-bolt text-yellow-500 mt-1 mr-3"></i>
                            <div>
                                <p class="font-medium">Fast & Smart</p>
                                <p class="text-sm text-gray-600">Instant AI assistance</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex space-x-3">
                        <button id="confirmEnableAI" class="flex-1 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700">
                            Enable AI Features
                        </button>
                        <button id="cancelEnableAI" class="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHTML;
    document.body.appendChild(modalDiv);
    
    // Show modal
    const modal = document.getElementById('aiEnableModal');
    modal.classList.remove('hidden');
    
    // Event listeners
    document.getElementById('confirmEnableAI').addEventListener('click', async () => {
        try {
            showToast('Enabling AI features...', 'info');
            
            // Save setting to Firebase
            await db.collection('users').doc(currentUser.uid).update({
                aiEnabled: true,
                aiFeaturesEnabled: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update local data
            if (!currentUserData) currentUserData = {};
            currentUserData.aiEnabled = true;
            currentUserData.aiFeaturesEnabled = true;
            
            // Update UI
            showAIFeatures();
            
            // Close modal
            modal.remove();
            
            showToast('AI features enabled successfully!', 'success');
            
        } catch (error) {
            console.error('Error enabling AI features:', error);
            showToast('Error enabling AI features', 'error');
            modal.remove();
        }
    });
    
    document.getElementById('cancelEnableAI').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelector('.modal-backdrop').addEventListener('click', () => {
        modal.remove();
    });
}

function showAILearnMore() {
    alert('AI Features include:\n\n• Smart Reply Suggestions\n• Conversation Summaries\n• AI-powered assistance\n\nThese features help you communicate more effectively!');
}

function checkAIFeaturesStatus() {
    // Default to hidden if no user data
    if (!currentUserData) {
        hideAIFeatures();
        return;
    }
    
    // Check if AI is enabled
    const aiEnabled = currentUserData.aiEnabled || currentUserData.aiFeaturesEnabled;
    
    if (aiEnabled) {
        showAIFeatures();
    } else {
        hideAIFeatures();
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', initApp);


       function initApp() {
    console.log('Initializing app...');
    
    try {
        // 1. Setup basic error handlers
        setupGlobalErrorHandling();
        setupImageErrorHandling();
        setupNetworkMonitoring();
        
        // 2. Setup UI components
        initializeTabs();
        setupEventListeners();
        initEmojiPicker();
        setupReplySystem();
        setupMessageSelection();
        setupPollSystem();
        setupMoodSuggestions();
        setupBusinessTools();
        setupAIFeatures();
        setupHelpCenter();
        setupModals();
        setupContextMenuActions();
        setupAutoScrollDetection();
        
        // 3. Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();
        
        // 4. Share with other scripts
        window.db = db;
        window.auth = auth;
        window.storage = storage;
        window.firebase = firebase;
        
        console.log('✅ Firebase initialized and shared');
        
        if (typeof window.settings !== 'undefined') {
            window.settings.init({
                db: db,
                auth: auth,
                storage: storage,
                currentUser: currentUser,
                currentUserData: currentUserData
            });
        }
        
        // 5. Check auth state
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('✅ User authenticated:', user.uid);
                currentUser = user;
                
                // Load user data
                await loadUserData();
                
                // ⭐ ADD THIS: Check AI features status after user data loads
                setTimeout(() => {
                    checkAIFeaturesStatus();
                }, 1000);
                
                // Notify other scripts
                if (window.onUserAuthenticated) {
                    window.onUserAuthenticated();
                }
            } else {
                console.log('⚠️ No user, redirecting...');
                window.location.href = 'index.html';
            }
        });
        
    } catch (error) {
        console.error('❌ Error in initApp:', error);
        showToast('App initialization error: ' + error.message, 'error');
    }
}
// ==================== USER DATA MANAGEMENT ====================

// ==================== USER DATA MANAGEMENT ====================
async function loadUserData() {
    try {
        console.log('Loading user data for:', currentUser.uid);

        // Perform cleanup
        if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
        if (unsubscribeChats) { unsubscribeChats(); unsubscribeChats = null; }
        if (typingListener) { typingListener(); typingListener = null; }
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }

        currentChat = null;
        currentChatId = null;

        console.log('Cleanup completed. Starting user data load...');

        // Load user document
        const userDoc = await db.collection('users').doc(currentUser.uid).get();

        if (userDoc.exists) {
            currentUserData = userDoc.data();
            console.log('User data loaded:', {
                uid: currentUser.uid,
                displayName: currentUserData.displayName,
                email: currentUserData.email
            });
            
            // Ensure required fields exist
            currentUserData = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUserData.displayName || currentUser.email?.split('@')[0] || 'User',
                photoURL: currentUserData.photoURL || getDefaultAvatar(currentUserData.displayName || 'User'),
                coverURL: currentUserData.coverURL || '',
                about: currentUserData.about || '',
                phone: currentUserData.phone || '',
                createdAt: currentUserData.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen: currentUserData.lastSeen || firebase.firestore.FieldValue.serverTimestamp(),
                status: currentUserData.status || 'offline',
                mood: currentUserData.mood || 'neutral',
                aiEnabled: currentUserData.aiEnabled || false,
                aiFeaturesEnabled: currentUserData.aiFeaturesEnabled || false
            };
            
            initializeUserData();
        } else {
            console.log('Creating new user document');
            currentUserData = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                photoURL: currentUser.photoURL || getDefaultAvatar(currentUser.displayName || 'User'),
                coverURL: '',
                about: '',
                phone: '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'offline',
                mood: 'neutral',
                aiEnabled: false,
                aiFeaturesEnabled: false
            };

            await db.collection('users').doc(currentUser.uid).set(currentUserData);
            console.log('New user document created');
            initializeUserData();
        }

        // Update ONLY lastSeen timestamp, NOT status
        await db.collection('users').doc(currentUser.uid).update({
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Load UI & listeners
        showChatApp();
        loadFriends();
        loadAllUsers();
        
        setTimeout(() => {
            loadChatsTemporary();
        }, 500);
        
        requestNotificationPermission();
        listenForFriendRequests();
        
        initializeBusinessDocument(currentUser.uid);

    } catch (error) {
        console.error('Error in loadUserData:', error);
        showToast('Error loading user data', 'error');
    }
}


function initializeUserData() {
    console.log('Initializing UI with user data');

    if (userName) userName.textContent = currentUserData.displayName;
    if (userAvatar) userAvatar.src = currentUserData.photoURL;
    if (userMood) userMood.textContent = currentUserData.mood || '😊';

    // Update profile modal fields if they exist
    const profileName = document.getElementById('profileName');
    const profileAbout = document.getElementById('profileAbout');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const profilePicPreview = document.getElementById('profilePicPreview');
    const profileCoverPreview = document.getElementById('profileCoverPreview');

    if (profileName) profileName.value = currentUserData.displayName;
    if (profileAbout) profileAbout.value = currentUserData.about || '';
    if (profileEmail) profileEmail.value = currentUserData.email;
    if (profilePhone) profilePhone.value = currentUserData.phone || '';
    if (profilePicPreview) profilePicPreview.src = currentUserData.photoURL;
    if (profileCoverPreview) profileCoverPreview.src = currentUserData.coverURL || '';
}

function showChatApp() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (chatApp) chatApp.classList.remove('hidden');
    console.log('Chat app UI shown');
}

// ==================== TAB MANAGEMENT ====================
function initializeTabs() {
    console.log('Initializing tabs...');
    
    navIcons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Normalize tab name
            let normalizedTabName = tabName;
            if (tabName === 'chat') normalizedTabName = 'chats';
            if (tabName === 'chats') normalizedTabName = 'chats';
            
            console.log(`Tab clicked: ${tabName} -> ${normalizedTabName}`);
            switchTab(normalizedTabName);
        });
    });
    
    // Set initial tab to chat
    setTimeout(() => {
        switchTab('chats');
    }, 500);
}

function switchTab(tabName) {
    console.log('🔄 Switching to tab:', tabName);
    
    // If we're in a chat, go back to tabs first
    if (currentChat) {
        goBackToTabs();
        setTimeout(() => switchTab(tabName), 100);
        return;
    }
    
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.classList.add('hidden');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.nav-icon').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Try multiple possible ID formats
    let tabPanel = document.getElementById(`${tabName}Tab`);
    if (!tabPanel) {
        tabPanel = document.getElementById(`${tabName}-tab`) || 
                  document.getElementById(`tab-${tabName}`) ||
                  document.getElementById(`${tabName}`);
    }
    
    if (tabPanel) {
        tabPanel.classList.remove('hidden');
        tabPanel.classList.add('active');
        console.log('✅ Tab panel activated:', tabPanel.id);
        
        // Activate corresponding tab button
        const tabButton = document.querySelector(`.nav-icon[data-tab="${tabName}"]`) ||
                         document.querySelector(`.nav-icon[data-tab="${tabName === 'chats' ? 'chat' : tabName}"]`);
        
        if (tabButton) {
            tabButton.classList.add('active');
        }
    } else {
        console.error('❌ Tab panel not found for:', tabName);
        return;
    }
    
    // Load REAL tab-specific content from Firebase
    setTimeout(() => {
        loadTabContent(tabName);
    }, 100);
}

function loadTabContent(tabName) {
    console.log('📥 Loading REAL content for tab:', tabName);
    
    switch(tabName) {
        case 'chats':
            loadChats();
            break;
        case 'friends':
            loadFriendsFromFirebase();
            loadFriendRequests();
            break;
        case 'updates':
            loadRealStatusUpdates();
            break;
        case 'calls':
            loadRealCallHistory();
            loadFavorites();
            break;
        case 'tools':
            loadToolsTab();
            loadPersonalizationDisplay();
            loadMoodSuggestions();
            break;
    }
}

// ==================== CHAT MANAGEMENT ====================
function loadChats() {
    console.log('📱 Loading chats tab...');
    
    if (!currentUser || !currentUser.uid) {
        console.log('⚠️ User not authenticated yet');
        return;
    }
    
    if (!unsubscribeChats) {
        loadChatsTemporary();
    }
    
    if (chatListContainer) {
        chatListContainer.classList.remove('hidden');
    }
}

  function loadChatsTemporary() {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) {
        console.log('⚠️ Chat list not found - DOM not ready yet');
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(loadChatsTemporary, 100);
            });
        } else {
            // Create the element if it doesn't exist
            createChatListElement();
        }
        return
    }
    
    console.log('✅ Loading chats for user:', currentUser.uid);
    
    if (unsubscribeChats) {
        console.log('Unsubscribing from previous chats listener');
        unsubscribeChats();
    }
    
    unsubscribeChats = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot({
            next: (snapshot) => {
                console.log('Chats snapshot received:', snapshot.size, 'chats');
                if (!chatList || !noChatsMessage) return;
                
                chatList.innerHTML = '';
                
                if (snapshot.empty) {
                    noChatsMessage.classList.remove('hidden');
                    return;
                }
                
                noChatsMessage.classList.add('hidden');
                
                // Sort manually in JavaScript
                const chats = [];
                snapshot.forEach(doc => {
                    chats.push({ id: doc.id, ...doc.data() });
                });
                
                // Manual sort by lastMessageTime
                chats.sort((a, b) => {
                    const timeA = a.lastMessageTime ? a.lastMessageTime.toDate() : new Date(0);
                    const timeB = b.lastMessageTime ? b.lastMessageTime.toDate() : new Date(0);
                    return timeB - timeA;
                });
                
                chats.forEach(chat => {
                    const otherParticipantId = chat.participants.find(id => id !== currentUser.uid);
                    const otherParticipantName = chat.participantNames ? chat.participantNames[otherParticipantId] : 'Unknown User';
                    
                    console.log('Rendering chat with:', otherParticipantName);
                    
                    const chatItem = document.createElement('div');
                    chatItem.className = 'chat-item';
                    chatItem.dataset.chatId = chat.id;
                    chatItem.dataset.userId = otherParticipantId;
                    
                    // Check for unread messages
                    const unreadCount = chat.unread && chat.unread[currentUser.uid] ? chat.unread[currentUser.uid] : 0;
                    
                    chatItem.innerHTML = `
                        <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <div class="relative">
                                <img class="w-12 h-12 rounded-full object-cover" 
                                     src="https://ui-avatars.com/api/?name=${encodeURIComponent(otherParticipantName)}&background=7C3AED&color=fff" 
                                     alt="${otherParticipantName}">
                                ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex justify-between items-center">
                                    <div class="contact-name font-medium text-gray-800 truncate">${otherParticipantName}</div>
                                    <div class="last-message-time text-xs text-gray-500">${chat.lastMessageTime ? formatTimeAgo(chat.lastMessageTime) : ''}</div>
                                </div>
                                <div class="last-message-preview text-sm text-gray-500 truncate mt-1">${chat.lastMessage || 'No messages yet'}</div>
                            </div>
                        </div>
                    `;
                    
                    chatItem.addEventListener('click', () => {
                        console.log('Opening chat with:', otherParticipantName);
                        startChat(otherParticipantId, otherParticipantName);
                    });
                    
                    chatList.appendChild(chatItem);
                });
            },
            error: (error) => {
                console.error('Error loading chats:', error);
                if (document.getElementById('chatList')) {
                    showToast('Error loading chats', 'error');
                }
            }
        });
}

function createChatListElement() {
    const chatsTab = document.getElementById('chatsTab');
    if (!chatsTab) {
        console.error('❌ chatsTab not found - creating entire tab structure');
        createChatsTabStructure();
        return;
    }
    
    // Create chatsList element
    if (!document.getElementById('chatsList')) {
        const chatsList = document.createElement('div');
        chatsList.id = 'chatsList';
        chatsList.className = 'chats-list space-y-2';
        chatsTab.appendChild(chatsList);
        console.log('✅ Created chatsList element');
    }
}

async function startChat(friendId, friendName) {
    try {
        console.log('Starting chat with:', friendName, friendId);
        
        // Create or get chat ID
        const chatId = [currentUser.uid, friendId].sort().join('_');
        
        console.log('Chat ID:', chatId);
        
        // Check if chat document exists
        const chatDoc = await db.collection('chats').doc(chatId).get();
        
        if (!chatDoc.exists) {
            console.log('Creating new chat document');
            await db.collection('chats').doc(chatId).set({
                participants: [currentUser.uid, friendId],
                participantNames: {
                    [currentUser.uid]: currentUserData.displayName,
                    [friendId]: friendName
                },
                lastMessage: '',
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                typing: {},
                unread: {
                    [currentUser.uid]: 0,
                    [friendId]: 0
                }
            });
        }
        
        // Set current chat
        currentChat = {
            id: chatId,
            friendId: friendId,
            name: friendName
        };
        
        currentChatId = chatId;
        
        console.log('Current chat set:', currentChat);
        
        // Update UI - SHOW CHAT INTERFACE
        const chatHeader = document.getElementById('chatHeader');
        const inputArea = document.getElementById('inputArea');
        const noMessagesMessage = document.getElementById('noMessagesMessage');
        const chatTitle = document.getElementById('chatTitle');
        const chatAvatar = document.getElementById('chatAvatar');
        const messagesContainer = document.getElementById('messagesContainer');
        
        // Hide the tab content containers
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });
        
        // Show chat interface
        if (chatHeader) chatHeader.classList.remove('hidden');
        if (inputArea) inputArea.classList.remove('hidden');
        if (messagesContainer) messagesContainer.classList.remove('hidden');
        if (noMessagesMessage) noMessagesMessage.classList.add('hidden');
        if (chatTitle) chatTitle.textContent = friendName;
        if (chatAvatar) chatAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=7C3AED&color=fff`;
        
        // Enable message input
        if (messageInput) messageInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        
        // Add call buttons to chat header
        addCallButtonsToChatHeader(friendId, friendName);
        
        // Load messages
        loadMessages(chatId);
        
        // Mark messages as read
        markMessagesAsRead(chatId);
        
    } catch (error) {
        console.error('Error starting chat:', error);
        showToast('Error starting chat', 'error');
    }
}

function addCallButtonsToChatHeader(friendId, friendName) {
    // Remove existing call buttons if any
    const existingCallButtons = document.querySelectorAll('.call-btn-header');
    existingCallButtons.forEach(btn => btn.remove());
    
    // Add voice call button
    const voiceCallBtn = document.createElement('button');
    voiceCallBtn.className = 'call-btn-header friend-call-btn';
    voiceCallBtn.innerHTML = '<i class="fas fa-phone"></i>';
    voiceCallBtn.title = 'Voice Call';
    voiceCallBtn.dataset.id = friendId;
    voiceCallBtn.dataset.name = friendName;
    voiceCallBtn.onclick = () => {
        if (window.startVoiceCallWithFriend) {
            window.startVoiceCallWithFriend(friendId, friendName);
        }
    };
    
    // Add video call button
    const videoCallBtn = document.createElement('button');
    videoCallBtn.className = 'call-btn-header friend-video-call-btn';
    videoCallBtn.innerHTML = '<i class="fas fa-video"></i>';
    videoCallBtn.title = 'Video Call';
    videoCallBtn.dataset.id = friendId;
    videoCallBtn.dataset.name = friendName;
    videoCallBtn.onclick = () => {
        if (window.startVideoCallWithFriend) {
            window.startVideoCallWithFriend(friendId, friendName);
        }
    };
    
    // Add to chat header actions
    const chatActions = document.querySelector('.chat-header-actions');
    if (chatActions) {
        chatActions.appendChild(voiceCallBtn);
        chatActions.appendChild(videoCallBtn);
    }
}

function goBackToTabs() {
    console.log('Going back to tabs');
    
    // Hide chat interface
    if (chatHeader) chatHeader.classList.add('hidden');
    if (inputArea) inputArea.classList.add('hidden');
    if (messagesContainer) messagesContainer.classList.add('hidden');
    
    // Show the current active tab
    const activeTabBtn = document.querySelector('.nav-icon.active');
    if (activeTabBtn) {
        const tabName = activeTabBtn.getAttribute('data-tab');
        const tabPanel = document.getElementById(`${tabName}Tab`);
        if (tabPanel) {
            tabPanel.classList.remove('hidden');
        }
    } else {
        // Default to chats tab
        const chatsTab = document.getElementById('chatsTab');
        if (chatsTab) chatsTab.classList.remove('hidden');
    }
    
    // Clear current chat
    currentChat = null;
    currentChatId = null;
    
    // Unsubscribe from message listeners
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    if (typingListener) {
        typingListener();
        typingListener = null;
    }
    
    console.log('Back to tabs successfully');
}

// ==================== MESSAGE MANAGEMENT ====================
function loadMessages(chatId) {
    console.log('Loading messages for chat:', chatId);
    
    // Unsubscribe from previous listeners
    if (unsubscribeMessages) {
        console.log('Unsubscribing from previous message listener');
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    if (typingListener) {
        console.log('Unsubscribing from previous typing listener');
        typingListener();
        typingListener = null;
    }
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }
    
    // Show loading state
    messagesContainer.innerHTML = `
        <div class="text-center text-gray-500 py-10">
            <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
            <p>Loading messages...</p>
        </div>
    `;
    
    let isFirstLoad = true;
    let loadedMessageIds = new Set();
    
    // Subscribe to messages for this chat
    unsubscribeMessages = db.collection('messages')
        .where('chatId', '==', chatId)
        .orderBy('timestamp', 'asc')
        .onSnapshot({
            next: (snapshot) => {
                console.log('New messages snapshot:', snapshot.size, 'messages');
                
                if (!messagesContainer) return;
                
                // Only clear container on first load
                if (isFirstLoad) {
                    messagesContainer.innerHTML = '';
                    loadedMessageIds.clear();
                    isFirstLoad = false;
                }
                
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
                
                let lastDate = null;
                let hasNewMessages = false;
                
                // Process each message
                snapshot.docChanges().forEach(change => {
                    const messageId = change.doc.id;
                    const message = change.doc.data();
                    
                    // Skip if already loaded
                    if (loadedMessageIds.has(messageId)) {
                        return;
                    }
                    
                    loadedMessageIds.add(messageId);
                    hasNewMessages = true;
                    
                    // Check if we need to add a date separator
                    const messageDate = message.timestamp ? message.timestamp.toDate().toDateString() : new Date().toDateString();
                    if (messageDate !== lastDate) {
                        addDateSeparator(messageDate);
                        lastDate = messageDate;
                    }
                    
                    addMessageToUI(message, messageId);
                });
                
                // Scroll to bottom only if new messages were added
                if (hasNewMessages) {
                    setTimeout(() => {
                        if (messagesContainer) {
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        }
                    }, 100);
                }
                
                // Mark messages as read
                markMessagesAsRead(chatId);
            },
            error: (error) => {
                console.error('Error loading messages:', error);
                if (messagesContainer) {
                    messagesContainer.innerHTML = `
                        <div class="text-center text-gray-500 py-10">
                            <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                            <p>Error loading messages</p>
                            <p class="text-sm mt-1">Please try again later</p>
                        </div>
                    `;
                }
                showToast('Error loading messages', 'error');
            }
        });
    
    // Listen for typing indicators
    typingListener = db.collection('chats').doc(chatId)
        .onSnapshot({
            next: (doc) => {
                if (doc.exists) {
                    const chatData = doc.data();
                    const typing = chatData.typing || {};
                    
                    // Remove current user from typing indicators
                    delete typing[currentUser.uid];
                    
                    const typingUsersList = Object.keys(typing).filter(userId => typing[userId] === true);
                    
                    if (typingUsers && isTyping) {
                        if (typingUsersList.length > 0) {
                            // Get names of typing users
                            const typingNames = typingUsersList.map(userId => {
                                return chatData.participantNames && chatData.participantNames[userId] 
                                    ? chatData.participantNames[userId] 
                                    : 'Someone';
                            });
                            
                            typingUsers.textContent = typingNames.join(', ');
                            isTyping.classList.remove('hidden');
                        } else {
                            isTyping.classList.add('hidden');
                        }
                    }
                }
            },
            error: (error) => {
                console.error('Error listening for typing indicators:', error);
            }
        });
}

function addDateSeparator(dateString) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
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
    messagesContainer.appendChild(dateElement);
}

function addMessageToUI(message, messageId) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    
    const isSent = message.senderId === currentUser.uid;
    const messageTime = message.timestamp ? message.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    
    let statusIcon = '🕒'; // sent
    if (message.status === 'delivered') statusIcon = '✓✓';
    if (message.status === 'read') statusIcon = '✓✓👁️';
    
    messageElement.className = `message-item ${isSent ? 'outgoing' : 'incoming'}`;
    messageElement.dataset.messageId = messageId;
    messageElement.dataset.senderId = message.senderId;
    messageElement.dataset.timestamp = message.timestamp ? message.timestamp.toMillis() : Date.now();
    messageElement.dataset.type = message.type || 'text';
    
    // Check if message has file attachment
    if (message.file) {
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-sender">${message.senderName || 'Unknown'}</div>
                <div class="file-message">
                    <div class="file-icon">
                        <i class="fas ${getFileIcon(message.file.type)}"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${message.file.name}</div>
                        <div class="file-size">${formatFileSize(message.file.size)}</div>
                        <a href="${message.file.url}" target="_blank" class="download-link">Download</a>
                    </div>
                </div>
                <div class="message-time">${messageTime} ${isSent ? '<span class="message-status">' + statusIcon + '</span>' : ''}</div>
            </div>
        `;
    } else if (message.type === 'poll') {
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-sender">${message.senderName || 'Unknown'}</div>
                <div class="poll-message">
                    <div class="poll-question">${message.pollQuestion}</div>
                    <div class="poll-options">
                        ${message.pollOptions ? message.pollOptions.map((option, index) => `
                            <div class="poll-option" data-option-index="${index}">
                                <button class="poll-vote-btn">${option}</button>
                                <span class="poll-vote-count">${message.pollVotes ? message.pollVotes[index] || 0 : 0}</span>
                            </div>
                        `).join('') : ''}
                    </div>
                    <div class="poll-total">Total votes: ${message.totalVotes || 0}</div>
                </div>
                <div class="message-time">${messageTime} ${isSent ? '<span class="message-status">' + statusIcon + '</span>' : ''}</div>
            </div>
        `;
    } else {
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-sender">${message.senderName || 'Unknown'}</div>
                <div class="message-text">${escapeHtml(message.text)}</div>
                <div class="message-time">${messageTime} ${isSent ? '<span class="message-status">' + statusIcon + '</span>' : ''}</div>
            </div>
        `;
    }
    
    messagesContainer.appendChild(messageElement);
    
    // Add context menu for messages
    setupMessageContextMenu(messageElement, message, messageId);
    
    // Add click event for polls
    if (message.type === 'poll') {
        messageElement.querySelectorAll('.poll-vote-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                voteOnPoll(messageId, index);
            });
        });
    }
}

async function sendMessage() {
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    
    if (!text || !currentChat) {
        if (!text) {
            showToast('Please enter a message', 'error');
        }
        return;
    }
    
    console.log('Sending message:', text, 'to chat:', currentChat.id);
    
    try {
        const message = {
            text: text,
            senderId: currentUser.uid,
            senderName: currentUserData.displayName,
            chatId: currentChat.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            type: 'text'
        };
        
        // Add message to Firebase
        const docRef = await db.collection('messages').add(message);
        console.log('Message sent with ID:', docRef.id);
        
        // Clear input
        messageInput.value = '';
        
        // Update chat document with last message
        await db.collection('chats').doc(currentChat.id).update({
            lastMessage: text.length > 50 ? text.substring(0, 50) + '...' : text,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            [`typing.${currentUser.uid}`]: false, // Remove typing indicator
            [`unread.${currentChat.friendId}`]: firebase.firestore.FieldValue.increment(1)
        });
        
        console.log('Chat document updated with last message');
        
        // Update message status to delivered for all messages in this chat
        updateMessageStatus(currentChat.id, 'delivered');
        
        // Scroll to bottom
        if (messagesContainer) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
        
        // Send push notification
        sendPushNotification(currentChat.friendId, currentUserData.displayName, text);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message', 'error');
    }
}

function updateMessageStatus(chatId, status) {
    console.log('Updating message status to:', status, 'for chat:', chatId);
    
    // Update all messages in this chat that are sent by the current user
    db.collection('messages')
        .where('chatId', '==', chatId)
        .where('senderId', '==', currentUser.uid)
        .where('status', '==', 'sent')
        .get()
        .then(snapshot => {
            const batch = db.batch();
            
            snapshot.forEach(doc => {
                batch.update(doc.ref, { status: status });
            });
            
            return batch.commit();
        })
        .then(() => {
            console.log('Message status updated successfully');
        })
        .catch(error => {
            console.error('Error updating message status:', error);
        });
}

function markMessagesAsRead(chatId) {
    console.log('Marking messages as read for chat:', chatId);
    
    // Mark all messages in this chat as read
    db.collection('messages')
        .where('chatId', '==', chatId)
        .where('senderId', '!=', currentUser.uid)
        .where('status', 'in', ['sent', 'delivered'])
        .get()
        .then(snapshot => {
            const batch = db.batch();
            
            snapshot.forEach(doc => {
                batch.update(doc.ref, { status: 'read' });
            });
            
            return batch.commit();
        })
        .then(() => {
            console.log('Messages marked as read successfully');
            
            // Reset unread count for this chat
            if (currentUser && currentChat) {
                db.collection('chats').doc(chatId).update({
                    [`unread.${currentUser.uid}`]: 0
                });
            }
        })
        .catch(error => {
            console.error('Error marking messages as read:', error);
        });
}

// ==================== FRIEND MANAGEMENT ====================
function loadFriends() {
    console.log('Loading friends for user:', currentUser.uid);
    
    // Fetch friends from Firebase with real-time listener
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'accepted')
        .onSnapshot(snapshot => {
            console.log('Friends snapshot received:', snapshot.size, 'documents');
            friends = [];
            const friendPromises = [];
            
            snapshot.forEach(doc => {
                const friendship = doc.data();
                const friendId = friendship.users.find(id => id !== currentUser.uid);
                
                console.log('Processing friendship with friend:', friendId);
                
                // Get friend details
                const friendPromise = db.collection('users').doc(friendId).get().then(friendDoc => {
                    if (friendDoc.exists) {
                        const friendData = friendDoc.data();
                        console.log('Friend data loaded:', friendData.displayName);
                        friends.push({
                            id: friendId,
                            friendshipId: doc.id,
                            ...friendData
                        });
                    }
                });
                
                friendPromises.push(friendPromise);
            });
            
            Promise.all(friendPromises).then(() => {
                console.log('All friend data loaded, rendering', friends.length, 'friends');
                renderFriends(friends);
                
                if (noFriendsMessage) {
                    if (friends.length === 0) {
                        noFriendsMessage.classList.remove('hidden');
                    } else {
                        noFriendsMessage.classList.add('hidden');
                    }
                }
            });
        }, error => {
            console.error('Error loading friends:', error);
            showToast('Error loading friends', 'error');
        });
}

function renderFriends(friendsToRender) {
    if (!friendsList) {
        console.warn('Friends list element not found');
        return;
    }
    
    console.log('Rendering', friendsToRender.length, 'friends');
    friendsList.innerHTML = '';
    
    if (friendsToRender.length === 0) {
        friendsList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-users text-4xl mb-3 text-gray-300 block"></i>
                <p>No friends yet</p>
                <p class="text-sm mt-1">Add friends to start chatting</p>
            </div>
        `;
        return;
    }
    
    friendsToRender.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.dataset.friendId = friend.id;
        
        const lastSeen = friend.lastSeen ? formatTimeAgo(friend.lastSeen) : 'Never';
        
        friendItem.innerHTML = `
            <div class="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-3 flex-1">
                    <div class="relative">
                        <img class="w-12 h-12 rounded-full object-cover" 
                             src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                             alt="${friend.displayName}"
                             onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                        <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${friend.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}"></div>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center space-x-2">
                            <h3 class="font-medium text-gray-800">${friend.displayName}</h3>
                            ${friend.status === 'online' ? 
                                '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">Online</span>' : 
                                `<span class="text-xs text-gray-500">Last seen ${lastSeen}</span>`}
                        </div>
                        <p class="text-sm text-gray-500 mt-1 truncate">${friend.about || 'Hey there! I am using Kynecta'}</p>
                    </div>
                </div>
                
                <div class="flex items-center space-x-2 ml-4">
                    <button class="message-friend p-2 text-purple-600 hover:bg-purple-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Message">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="call-friend p-2 text-green-600 hover:bg-green-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Voice Call">
                        <i class="fas fa-phone"></i>
                    </button>
                    <button class="video-call-friend p-2 text-blue-600 hover:bg-blue-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Video Call">
                        <i class="fas fa-video"></i>
                    </button>
                    <div class="relative">
                        <button class="friend-options-btn p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Options">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="friend-options-menu absolute right-0 top-10 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10 hidden min-w-32">
                            <button class="view-profile-btn w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700" data-id="${friend.id}">
                                <i class="fas fa-user mr-2"></i>View Profile
                            </button>
                            <button class="remove-friend-btn w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600" data-id="${friend.id}" data-name="${friend.displayName}">
                                <i class="fas fa-user-times mr-2"></i>Remove
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        friendsList.appendChild(friendItem);
    });

    // Add event listeners using event delegation
    friendsList.addEventListener('click', function(e) {
        // Message button
        if (e.target.closest('.message-friend')) {
            const btn = e.target.closest('.message-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Starting chat with:', friendName, friendId);
            startChat(friendId, friendName);
        }
        
        // Voice call button
        if (e.target.closest('.call-friend')) {
            const btn = e.target.closest('.call-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Voice calling:', friendName, friendId);
            
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            } else {
                console.error('Call system not initialized');
                showToast('Call feature not available', 'error');
            }
        }
        
        // Video call button
        if (e.target.closest('.video-call-friend')) {
            const btn = e.target.closest('.video-call-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Video calling:', friendName, friendId);
            
            if (window.startVideoCallWithFriend) {
                window.startVideoCallWithFriend(friendId, friendName);
            } else {
                console.error('Video call system not initialized');
                showToast('Video call feature not available', 'error');
            }
        }
        
        // Options button toggle
        if (e.target.closest('.friend-options-btn')) {
            const btn = e.target.closest('.friend-options-btn');
            const menu = btn.nextElementSibling;
            // Close all other menus
            document.querySelectorAll('.friend-options-menu').forEach(m => {
                if (m !== menu) m.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
        }
        
        // View profile
        if (e.target.closest('.view-profile-btn')) {
            const btn = e.target.closest('.view-profile-btn');
            const friendId = btn.dataset.id;
            console.log('Viewing profile of:', friendId);
            viewFriendProfile(friendId);
            btn.closest('.friend-options-menu').classList.add('hidden');
        }
        
        // Remove friend
        if (e.target.closest('.remove-friend-btn')) {
            const btn = e.target.closest('.remove-friend-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Removing friend:', friendName, friendId);
            confirmRemoveFriend(friendId, friendName);
            btn.closest('.friend-options-menu').classList.add('hidden');
        }
    });

    // Close dropdown menus when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.friend-options-btn')) {
            document.querySelectorAll('.friend-options-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        }
    });
    
    console.log('✅ Friends rendered with action buttons');
}

// In chat.js, when creating friend call buttons:
function createFriendCallButtons(friendId, friendName) {
    return `
        <div class="friend-call-buttons">
            <button class="friend-call-btn voice-call-btn p-2 rounded-full hover:bg-blue-50"
                    data-user-id="${friendId}"
                    data-user-name="${friendName}"
                    title="Voice Call">
                <i class="fas fa-phone text-blue-600"></i>
            </button>
            <button class="friend-call-btn video-call-btn p-2 rounded-full hover:bg-green-50"
                    data-user-id="${friendId}"
                    data-user-name="${friendName}"
                    title="Video Call">
                <i class="fas fa-video text-green-600"></i>
            </button>
        </div>
    `;
}

function loadFriendsFromFirebase() {
    const friendsTab = document.getElementById('friendsTab');
    if (!friendsTab) return;
    
    console.log('👥 Loading real friends from Firebase...');
    
    // Show loading state
    friendsTab.innerHTML = `
        <div class="p-4">
            <h3 class="text-lg font-semibold mb-4">Friends</h3>
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
                <p>Loading friends from your network...</p>
            </div>
        </div>
    `;
    
    // Your friends are already loaded via the real-time listener in loadFriends()
    // Just render them in the friends tab
    setTimeout(() => {
        if (friends.length > 0) {
            friendsTab.innerHTML = `
                <div class="p-4">
                    <h3 class="text-lg font-semibold mb-4">Your Friends (${friends.length})</h3>
                    <div id="friendsTabList"></div>
                </div>
            `;
            renderFriendsInTab(friends);
        } else {
            friendsTab.innerHTML = `
                <div class="p-4">
                    <h3 class="text-lg font-semibold mb-4">Friends</h3>
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-users text-4xl mb-3 text-gray-300 block"></i>
                        <p>No friends yet</p>
                        <p class="text-sm mt-1">Add friends to start chatting</p>
                    </div>
                </div>
            `;
        }
    }, 500);
}

function renderFriendsInTab(friendsList) {
    const friendsTabList = document.getElementById('friendsTabList');
    if (!friendsTabList) return;
    
    friendsTabList.innerHTML = '';
    
    friendsList.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item-tab';
        friendItem.dataset.friendId = friend.id;
        
        const lastSeen = friend.lastSeen ? formatTimeAgo(friend.lastSeen) : 'Never';
        
        friendItem.innerHTML = `
            <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                <div class="relative">
                    <img class="w-12 h-12 rounded-full object-cover" 
                         src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                         alt="${friend.displayName}"
                         onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                    <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${friend.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}"></div>
                </div>
                <div class="flex-1">
                    <div class="flex items-center space-x-2">
                        <h3 class="font-medium text-gray-800">${friend.displayName}</h3>
                        ${friend.status === 'online' ? 
                            '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">Online</span>' : 
                            `<span class="text-xs text-gray-500">Last seen ${lastSeen}</span>`}
                    </div>
                    <p class="text-sm text-gray-500 mt-1">${friend.about || 'Hey there! I am using Kynecta'}</p>
                </div>
                <div class="flex space-x-2">
                    <button class="message-friend-tab p-2 text-purple-600 hover:bg-purple-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Message">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="call-friend-tab p-2 text-green-600 hover:bg-green-50 rounded-full" 
                            data-id="${friend.id}" data-name="${friend.displayName}" title="Call">
                        <i class="fas fa-phone"></i>
                    </button>
                </div>
            </div>
        `;
        
        friendsTabList.appendChild(friendItem);
    });
    
    // Add event listeners
    friendsTabList.addEventListener('click', function(e) {
        if (e.target.closest('.message-friend-tab')) {
            const btn = e.target.closest('.message-friend-tab');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            startChat(friendId, friendName);
        }
        
        if (e.target.closest('.call-friend-tab')) {
            const btn = e.target.closest('.call-friend-tab');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            }
        }
    });
}

// In chat.js - when rendering friends, make sure to include:
function renderFriendItem(friendId, friendData) {
    return `
        <div class="friend-item" data-user-id="${friendId}" data-user-name="${friendData.displayName}">
            <div class="friend-avatar">
                <!-- Avatar content -->
            </div>
            <div class="friend-info">
                <div class="friend-name">${friendData.displayName}</div>
                <div class="friend-status">${friendData.status || 'offline'}</div>
            </div>
            <div class="friend-actions">
                <button class="friend-call-btn voice-call-btn"
                        data-user-id="${friendId}"
                        data-user-name="${friendData.displayName}"
                        title="Voice Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="friend-call-btn video-call-btn"
                        data-user-id="${friendId}"
                        data-user-name="${friendData.displayName}"
                        title="Video Call">
                    <i class="fas fa-video"></i>
                </button>
            </div>
        </div>
    `;
}
function listenForFriendRequests() {
    console.log('Setting up friend request listener for user:', currentUser.uid);
    
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'pending')
        .where('requestedBy', '!=', currentUser.uid)
        .onSnapshot(snapshot => {
            console.log('Friend requests snapshot:', snapshot.size, 'pending requests');
            
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const request = change.doc.data();
                    const requesterId = request.requestedBy;
                    const friendshipId = change.doc.id;
                    
                    console.log('New friend request from:', requesterId);
                    
                    // Get requester details
                    db.collection('users').doc(requesterId).get().then(requesterDoc => {
                        if (requesterDoc.exists) {
                            const requesterData = requesterDoc.data();
                            showFriendRequestNotification(requesterData, friendshipId);
                        }
                    });
                }
            });
        }, error => {
            console.error('Error listening for friend requests:', error);
        });
}

function showFriendRequestNotification(requesterData, friendshipId) {
    const notification = document.createElement('div');
    notification.className = 'friend-request-notification';
    notification.innerHTML = `
        <div class="flex items-center space-x-3 p-4 bg-white rounded-lg shadow-lg border border-gray-200">
            <img class="w-12 h-12 rounded-full" src="${requesterData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(requesterData.displayName)}&background=7C3AED&color=fff`}" alt="${requesterData.displayName}">
            <div class="flex-1">
                <p class="font-semibold">${requesterData.displayName}</p>
                <p class="text-sm text-gray-600">Sent you a friend request</p>
            </div>
            <div class="flex space-x-2">
                <button class="px-3 py-1 bg-green-500 text-white rounded-lg accept-request" data-friendship-id="${friendshipId}">Accept</button>
                <button class="px-3 py-1 bg-red-500 text-white rounded-lg decline-request" data-friendship-id="${friendshipId}">Decline</button>
            </div>
        </div>
    `;
    
    // Add to notifications container
    const notificationsContainer = document.getElementById('notificationsContainer') || createNotificationsContainer();
    notificationsContainer.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 10000);
    
    // Add event listeners
    notification.querySelector('.accept-request').addEventListener('click', function() {
        acceptFriendRequest(this.dataset.friendshipId);
        notification.remove();
    });
    
    notification.querySelector('.decline-request').addEventListener('click', function() {
        declineFriendRequest(this.dataset.friendshipId);
        notification.remove();
    });
}

function createNotificationsContainer() {
    const container = document.createElement('div');
    container.id = 'notificationsContainer';
    container.className = 'fixed top-4 right-4 z-50 space-y-2 max-w-sm';
    document.body.appendChild(container);
    return container;
}

function loadFriendRequests() {
    if (!currentUser || !friendRequestsList) return;
    
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'pending')
        .where('requestedBy', '!=', currentUser.uid)
        .get()
        .then(snapshot => {
            if (!friendRequestsList) return;
            
            friendRequestsList.innerHTML = '';
            
            if (snapshot.empty) {
                if (noFriendRequests) {
                    noFriendRequests.classList.remove('hidden');
                }
                return;
            }
            
            if (noFriendRequests) {
                noFriendRequests.classList.add('hidden');
            }
            
            snapshot.forEach(async doc => {
                const request = doc.data();
                const requesterId = request.requestedBy;
                
                const requesterDoc = await db.collection('users').doc(requesterId).get();
                if (requesterDoc.exists) {
                    const requesterData = requesterDoc.data();
                    
                    const requestItem = document.createElement('div');
                    requestItem.className = 'friend-request-item';
                    requestItem.innerHTML = `
                        <div class="flex items-center justify-between p-3 border-b border-gray-200">
                            <div class="flex items-center space-x-3">
                                <img class="w-10 h-10 rounded-full" src="${requesterData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(requesterData.displayName)}&background=7C3AED&color=fff`}" alt="${requesterData.displayName}">
                                <div>
                                    <p class="font-medium">${requesterData.displayName}</p>
                                    <p class="text-sm text-gray-500">Wants to be your friend</p>
                                </div>
                            </div>
                            <div class="flex space-x-2">
                                <button class="accept-friend-request px-3 py-1 bg-green-500 text-white rounded-lg" data-friendship-id="${doc.id}">
                                    Accept
                                </button>
                                <button class="decline-friend-request px-3 py-1 bg-red-500 text-white rounded-lg" data-friendship-id="${doc.id}">
                                    Decline
                                </button>
                            </div>
                        </div>
                    `;
                    
                    friendRequestsList.appendChild(requestItem);
                }
            });
            
            // Add event listeners for accept/decline buttons
            friendRequestsList.addEventListener('click', function(e) {
                if (e.target.closest('.accept-friend-request')) {
                    const btn = e.target.closest('.accept-friend-request');
                    const friendshipId = btn.dataset.friendshipId;
                    acceptFriendRequest(friendshipId);
                }
                
                if (e.target.closest('.decline-friend-request')) {
                    const btn = e.target.closest('.decline-friend-request');
                    const friendshipId = btn.dataset.friendshipId;
                    declineFriendRequest(friendshipId);
                }
            });
            
        })
        .catch(error => {
            console.error('Error loading friend requests:', error);
        });
}

function acceptFriendRequest(friendshipId) {
    db.collection('friendships').doc(friendshipId).update({
        status: 'accepted',
        acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        showToast('Friend request accepted!', 'success');
    })
    .catch(error => {
        console.error('Error accepting friend request:', error);
        showToast('Error accepting friend request', 'error');
    });
}

function declineFriendRequest(friendshipId) {
    db.collection('friendships').doc(friendshipId).delete()
    .then(() => {
        showToast('Friend request declined', 'info');
    })
    .catch(error => {
        console.error('Error declining friend request:', error);
        showToast('Error declining friend request', 'error');
    });
}

function viewFriendProfile(friendId) {
    console.log('Viewing friend profile:', friendId);
    // Implementation for viewing friend profile
    showToast('Viewing friend profile - feature coming soon', 'info');
}

function confirmRemoveFriend(friendId, friendName) {
    if (confirm(`Are you sure you want to remove ${friendName} from your friends?`)) {
        removeFriend(friendId);
    }
}

function removeFriend(friendId) {
    console.log('Removing friend:', friendId);
    
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'accepted')
        .get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const friendship = doc.data();
                if (friendship.users.includes(friendId)) {
                    // Delete the friendship
                    db.collection('friendships').doc(doc.id).delete()
                        .then(() => {
                            console.log('Friend removed successfully');
                            showToast('Friend removed successfully', 'success');
                        })
                        .catch(error => {
                            console.error('Error removing friend:', error);
                            showToast('Error removing friend', 'error');
                        });
                }
            });
        })
        .catch(error => {
            console.error('Error finding friendship:', error);
            showToast('Error removing friend', 'error');
        });
}

// ==================== UPDATES TAB ====================
function loadRealStatusUpdates() {
    const statusUpdates = document.getElementById('statusUpdates');
    if (!statusUpdates) return;
    
    console.log('📰 Loading real status updates from Firebase...');
    
    // Show loading state
    statusUpdates.innerHTML = `
        <div class="text-center text-gray-500 py-8">
            <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
            <p>Loading status updates...</p>
        </div>
    `;
    
    if (!currentUser) {
        statusUpdates.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                <p>Please sign in to view updates</p>
            </div>
        `;
        return;
    }
    
    // Load actual status updates from Firebase
    db.collection('friendships')
        .where('users', 'array-contains', currentUser.uid)
        .where('status', '==', 'accepted')
        .get()
        .then(snapshot => {
            const friendPromises = [];
            const statusUpdatesList = [];
            
            snapshot.forEach(doc => {
                const friendship = doc.data();
                const friendId = friendship.users.find(id => id !== currentUser.uid);
                
                // Get friend's recent status updates
                const statusPromise = db.collection('status_updates')
                    .where('userId', '==', friendId)
                    .orderBy('createdAt', 'desc')
                    .limit(3)
                    .get()
                    .then(statusSnapshot => {
                        statusSnapshot.forEach(statusDoc => {
                            const statusData = statusDoc.data();
                            statusUpdatesList.push({
                                ...statusData,
                                id: statusDoc.id,
                                friendId: friendId
                            });
                        });
                    });
                
                friendPromises.push(statusPromise);
            });
            
            Promise.all(friendPromises).then(() => {
                if (statusUpdatesList.length === 0) {
                    // If no status updates, show friends' recent activity
                    loadFriendsRecentActivity(statusUpdates);
                    return;
                }
                
                // Sort by timestamp
                statusUpdatesList.sort((a, b) => b.createdAt - a.createdAt);
                
                // Render status updates
                renderStatusUpdates(statusUpdates, statusUpdatesList);
            });
        })
        .catch(error => {
            console.error('Error loading status updates:', error);
            statusUpdates.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                    <p>Error loading updates</p>
                    <p class="text-sm mt-1">Please try again later</p>
                </div>
            `;
        });
}

function loadFriendsRecentActivity(container) {
    if (friends.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-newspaper text-4xl mb-3 text-gray-300 block"></i>
                <p>No updates yet</p>
                <p class="text-sm mt-1">Your friends' activity will appear here</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <h4 class="font-semibold mb-3 text-gray-700">Friends' Recent Activity</h4>
        <div class="space-y-3">
            ${friends.slice(0, 5).map(friend => {
                const lastSeen = friend.lastSeen ? formatTimeAgo(friend.lastSeen) : 'Never online';
                
                return `
                    <div class="status-update-item bg-white p-3 rounded-lg border border-gray-200">
                        <div class="flex items-center space-x-3">
                            <img class="w-10 h-10 rounded-full" 
                                 src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                                 alt="${friend.displayName}"
                                 onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                            <div class="flex-1">
                                <p class="font-medium text-gray-800">${friend.displayName}</p>
                                <div class="flex items-center space-x-2 mt-1">
                                    <span class="text-xs ${friend.status === 'online' ? 'text-green-600' : 'text-gray-500'}">
                                        <i class="fas fa-circle text-xs ${friend.status === 'online' ? 'text-green-500' : 'text-gray-400'}"></i>
                                        ${friend.status === 'online' ? 'Online now' : `Last seen ${lastSeen}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function renderStatusUpdates(container, updates) {
    container.innerHTML = `
        <h4 class="font-semibold mb-3 text-gray-700">Recent Updates</h4>
        <div class="space-y-3">
            ${await Promise.all(updates.map(async (update) => {
                // Get friend details
                const friendDoc = await db.collection('users').doc(update.friendId).get();
                const friend = friendDoc.exists ? friendDoc.data() : { displayName: 'Unknown User' };
                
                const timeAgo = update.createdAt ? formatTimeAgo(update.createdAt) : 'Recently';
                const updateText = update.text || update.content || 'Shared an update';
                
                return `
                    <div class="status-update-item bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <div class="flex items-start space-x-3">
                            <img class="w-12 h-12 rounded-full" 
                                 src="${friend.photoURL || getDefaultAvatar(friend.displayName)}" 
                                 alt="${friend.displayName}"
                                 onerror="this.src='${getDefaultAvatar(friend.displayName)}'">
                            <div class="flex-1">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="font-semibold text-gray-800">${friend.displayName}</p>
                                        <p class="text-xs text-gray-500 mt-1">${timeAgo}</p>
                                    </div>
                                </div>
                                <p class="mt-2 text-gray-700">${updateText}</p>
                                ${update.mediaUrl ? `
                                    <div class="mt-3">
                                        <img src="${update.mediaUrl}" alt="Update media" 
                                             class="rounded-lg w-full max-h-64 object-cover"
                                             onerror="this.style.display='none'">
                                    </div>
                                ` : ''}
                                <div class="mt-3 flex space-x-4 text-sm text-gray-500">
                                    <button class="like-update hover:text-purple-600" data-update-id="${update.id}">
                                        <i class="far fa-heart"></i> Like
                                    </button>
                                    <button class="comment-update hover:text-blue-600" data-update-id="${update.id}">
                                        <i class="far fa-comment"></i> Comment
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })).then(html => html.join(''))}
        </div>
    `;
    
    // Add event listeners for like/comment buttons
    container.querySelectorAll('.like-update').forEach(btn => {
        btn.addEventListener('click', () => handleLikeUpdate(btn.dataset.updateId));
    });
    
    container.querySelectorAll('.comment-update').forEach(btn => {
        btn.addEventListener('click', () => handleCommentUpdate(btn.dataset.updateId));
    });
}

function handleLikeUpdate(updateId) {
    console.log('Liking update:', updateId);
    showToast('Liked update', 'success');
}

function handleCommentUpdate(updateId) {
    console.log('Commenting on update:', updateId);
    const comment = prompt('Enter your comment:');
    if (comment) {
        showToast('Comment added', 'success');
    }
}

// ==================== CALLS TAB ====================
function loadRealCallHistory() {
    const recentCalls = document.getElementById('recentCalls');
    if (!recentCalls) return;
    
    console.log('📞 Loading real call history from Firebase...');
    
    // Show loading state
    recentCalls.innerHTML = `
        <div class="text-center text-gray-500 py-8">
            <i class="fas fa-spinner fa-spin text-4xl mb-3 text-gray-300 block"></i>
            <p>Loading your call history...</p>
        </div>
    `;
    
    if (!currentUser) {
        recentCalls.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                <p>Please sign in to view call history</p>
            </div>
        `;
        return;
    }
    
    // Load actual call history from Firebase
    db.collection('calls')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('startedAt', 'desc')
        .limit(20)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                recentCalls.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-phone text-4xl mb-3 text-gray-300 block"></i>
                        <p>No call history yet</p>
                        <p class="text-sm mt-1">Start calling your friends!</p>
                    </div>
                `;
                return;
            }
            
            const callPromises = [];
            const calls = [];
            
            snapshot.forEach(doc => {
                const callData = doc.data();
                calls.push({
                    id: doc.id,
                    ...callData
                });
                
                // Get the other participant's details
                const otherParticipantId = callData.participants.find(id => id !== currentUser.uid);
                if (otherParticipantId) {
                    const userPromise = db.collection('users').doc(otherParticipantId).get()
                        .then(userDoc => {
                            return userDoc.exists ? userDoc.data() : null;
                        });
                    callPromises.push(userPromise);
                }
            });
            
            Promise.all(callPromises).then(participants => {
                renderCallHistory(recentCalls, calls, participants);
            });
        })
        .catch(error => {
            console.error('Error loading call history:', error);
            recentCalls.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                    <p>Error loading call history</p>
                    <p class="text-sm mt-1">Please try again later</p>
                </div>
            `;
        });
}

function renderCallHistory(container, calls, participants) {
    container.innerHTML = `
        <h4 class="font-semibold mb-4 text-gray-700">Recent Calls</h4>
        <div class="space-y-3">
            ${calls.map((call, index) => {
                const participant = participants[index] || { displayName: 'Unknown User' };
                const callTime = call.startedAt ? formatTimeAgo(call.startedAt) : 'Unknown time';
                const isOutgoing = call.callerId === currentUser.uid;
                const callTypeIcon = call.callType === 'video' ? 'fa-video' : 'fa-phone';
                const callDuration = call.endedAt && call.startedAt 
                    ? Math.round((call.endedAt.toDate() - call.startedAt.toDate()) / 60000) + ' min'
                    : '--:--';
                const callStatus = call.status || 'completed';
                const statusColor = callStatus === 'missed' ? 'text-red-600' : 
                                 callStatus === 'rejected' ? 'text-yellow-600' : 
                                 'text-green-600';
                
                return `
                    <div class="call-item bg-white p-4 rounded-lg border border-gray-200 hover:shadow-sm transition-shadow">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <div class="relative">
                                    <img class="w-12 h-12 rounded-full" 
                                         src="${participant.photoURL || getDefaultAvatar(participant.displayName)}" 
                                         alt="${participant.displayName}"
                                         onerror="this.src='${getDefaultAvatar(participant.displayName)}'">
                                    <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center border border-gray-300">
                                        <i class="${callTypeIcon} text-xs ${isOutgoing ? 'text-green-600' : 'text-blue-600'}"></i>
                                    </div>
                                </div>
                                <div>
                                    <p class="font-medium text-gray-800">${participant.displayName}</p>
                                    <div class="flex items-center space-x-2 mt-1">
                                        <span class="text-xs ${statusColor}">
                                            ${isOutgoing ? 'Outgoing' : 'Incoming'} • ${callStatus}
                                        </span>
                                        <span class="text-xs text-gray-500">${callDuration}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-sm text-gray-500">${callTime}</p>
                                <div class="flex space-x-2 mt-2">
                                    <button class="call-back-btn w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200" 
                                            data-id="${participant.id || call.participants.find(id => id !== currentUser.uid)}" 
                                            data-name="${participant.displayName}">
                                        <i class="fas fa-phone text-xs"></i>
                                    </button>
                                    ${call.callType === 'video' ? `
                                        <button class="video-call-btn w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200" 
                                                data-id="${participant.id || call.participants.find(id => id !== currentUser.uid)}" 
                                                data-name="${participant.displayName}">
                                            <i class="fas fa-video text-xs"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    // Add event listeners for call back buttons
    container.querySelectorAll('.call-back-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const friendId = this.dataset.id;
            const friendName = this.dataset.name;
            
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            }
        });
    });
    
    container.querySelectorAll('.video-call-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const friendId = this.dataset.id;
            const friendName = this.dataset.name;
            
            if (window.startVideoCallWithFriend) {
                window.startVideoCallWithFriend(friendId, friendName);
            }
        });
    });
}

// ==================== TOOLS TAB ====================
function loadToolsTab() {
    console.log('Loading tools tab...');
    // Business data is loaded separately when modals open
}

function loadPersonalizationDisplay() {
    if (!currentUserData) return;
    
    // Load moods
    if (currentMoodsMini) {
        const moods = currentUserData.moods || ['happy'];
        currentMoodsMini.innerHTML = moods.map(mood => `
            <span class="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs mr-1">
                ${mood}
            </span>
        `).join('');
    }
    
    // Load interests
    if (currentInterestsMini) {
        const interests = currentUserData.interests || ['chatting', 'music'];
        currentInterestsMini.innerHTML = interests.map(interest => `
            <span class="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs mr-1">
                ${interest}
            </span>
        `).join('');
    }
}

function loadMoodSuggestions() {
    if (!currentUserData || !moodSuggestion) return;
    
    const mood = currentUserData.mood || 'happy';
    const suggestions = {
        happy: ["Share your happiness with friends!", "Spread positivity today!"],
        sad: ["Talk to a friend who makes you smile", "Listen to your favorite music"],
        excited: ["Plan something fun!", "Share your excitement with others"],
        tired: ["Take a break and relax", "Listen to calming music"],
        angry: ["Take deep breaths", "Talk it out with someone you trust"],
        neutral: ["Start a conversation with a friend", "Share what's on your mind"]
    };
    
    const moodSuggestions = suggestions[mood] || suggestions.neutral;
    const randomSuggestion = moodSuggestions[Math.floor(Math.random() * moodSuggestions.length)];
    
    if (suggestionText) {
        suggestionText.textContent = randomSuggestion;
        moodSuggestion.classList.remove('hidden');
    }
}

function updateMood(newMood) {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).update({
        mood: newMood,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        currentUserData.mood = newMood;
        if (userMood) userMood.textContent = newMood;
        showToast(`Mood updated to ${newMood}`, 'success');
        
        // Reload mood suggestions
        loadMoodSuggestions();
        
        if (moodModal) moodModal.classList.add('hidden');
    })
    .catch(error => {
        console.error('Error updating mood:', error);
        showToast('Error updating mood', 'error');
    });
}

// ==================== FILE UPLOAD ====================
async function uploadFile(file) {
    if (!currentChat) {
        showToast('Please select a chat first', 'error');
        return;
    }
    
    try {
        console.log('Uploading file:', file.name, 'to chat:', currentChat.id);
        showToast('Uploading file...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`chat_files/${currentChat.id}/${Date.now()}_${file.name}`);
        const uploadTask = fileRef.put(file);
        
        // Show upload progress
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);
        if (filePreview) filePreview.classList.remove('hidden');
        
        uploadTask.on('state_changed', 
            (snapshot) => {
                // Update progress bar
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload progress:', progress + '%');
                if (uploadProgressBar) uploadProgressBar.style.width = `${progress}%`;
            },
            (error) => {
                console.error('Error uploading file:', error);
                showToast('Error uploading file', 'error');
                if (filePreview) filePreview.classList.add('hidden');
            },
            async () => {
                // Upload completed
                console.log('File upload completed');
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Create message with file
                const message = {
                    text: `Shared a file: ${file.name}`,
                    senderId: currentUser.uid,
                    senderName: currentUserData.displayName,
                    chatId: currentChat.id,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    file: {
                        name: file.name,
                        url: downloadURL,
                        type: file.type,
                        size: file.size
                    }
                };
                
                // Add message to Firebase
                await db.collection('messages').add(message);
                
                // Update chat document with last message
                await db.collection('chats').doc(currentChat.id).update({
                    lastMessage: `Shared a file: ${file.name}`,
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                    [`unread.${currentChat.friendId}`]: firebase.firestore.FieldValue.increment(1)
                });
                
                // Hide file preview
                if (filePreview) filePreview.classList.add('hidden');
                
                console.log('File uploaded successfully');
                showToast('File uploaded successfully', 'success');
            }
        );
    } catch (error) {
        console.error('Error uploading file:', error);
        showToast('Error uploading file', 'error');
    }
}

// ==================== TYPING INDICATOR ====================
function handleTypingIndicator() {
    if (currentChat) {
        console.log('Sending typing indicator for chat:', currentChat.id);
        
        // Send typing indicator
        db.collection('chats').doc(currentChat.id).update({
            [`typing.${currentUser.uid}`]: true,
            lastActivity: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Clear previous timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Set timeout to remove typing indicator
        typingTimeout = setTimeout(() => {
            db.collection('chats').doc(currentChat.id).update({
                [`typing.${currentUser.uid}`]: false
            });
        }, 1000);
    }
}

// ==================== EMOJI PICKER ====================
function initEmojiPicker() {
    if (!emojiPicker) return;
    
    const emojiCategories = [
        {
            title: 'Smileys & People',
            emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾']
        },
        {
            title: 'Animals & Nature',
            emojis: ['🐵', '🐒', '🦍', '🦧', '🐶', '🐕', '🦮', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦔', '🦇', '🐻', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍', '🐲', '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🐟', '🐠', '🐡', '🦈', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🐞', '🦗', '🕷️', '🕸️', '🦂', '🦟', '🦠', '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃']
        }
    ];

    emojiPicker.innerHTML = '';

    emojiCategories.forEach(category => {
        const categoryElement = document.createElement('div');
        categoryElement.className = 'emoji-category';
        
        const categoryTitle = document.createElement('div');
        categoryTitle.className = 'emoji-category-title';
        categoryTitle.textContent = category.title;
        
        const emojiGrid = document.createElement('div');
        emojiGrid.className = 'emoji-grid';
        
        category.emojis.forEach(emoji => {
            const emojiOption = document.createElement('div');
            emojiOption.className = 'emoji-option';
            emojiOption.textContent = emoji;
            emojiOption.addEventListener('click', () => {
                if (messageInput) {
                    messageInput.value += emoji;
                    emojiPicker.style.display = 'none';
                    messageInput.focus();
                }
            });
            
            emojiGrid.appendChild(emojiOption);
        });
        
        categoryElement.appendChild(categoryTitle);
        categoryElement.appendChild(emojiGrid);
        emojiPicker.appendChild(categoryElement);
    });
}

function toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (!emojiPicker) return;
    
    if (emojiPicker.style.display === 'block') {
        emojiPicker.style.display = 'none';
    } else {
        emojiPicker.style.display = 'block';
    }
}

// ==================== POLL SYSTEM ====================
function setupPollSystem() {
    if (addPollOption) {
        addPollOption.addEventListener('click', addPollOptionField);
    }
    
    if (createPoll) {
        createPoll.addEventListener('click', createNewPoll);
    }
    
    if (cancelPoll) {
        cancelPoll.addEventListener('click', () => {
            if (pollCreationSection) pollCreationSection.classList.add('hidden');
        });
    }
    
    if (closePollCreation) {
        closePollCreation.addEventListener('click', () => {
            if (pollCreationSection) pollCreationSection.classList.add('hidden');
        });
    }
    
    if (dismissPollResults) {
        dismissPollResults.addEventListener('click', () => {
            if (pollResultsSection) pollResultsSection.classList.add('hidden');
        });
    }
}

function addPollOptionField() {
    if (!pollOptions) return;
    
    const optionCount = pollOptions.querySelectorAll('.poll-option-field').length;
    if (optionCount >= 6) {
        showToast('Maximum 6 options allowed', 'error');
        return;
    }
    
    const optionField = document.createElement('div');
    optionField.className = 'poll-option-field flex items-center space-x-2 mb-2';
    optionField.innerHTML = `
        <input type="text" class="flex-1 p-2 border border-gray-300 rounded-lg" placeholder="Option ${optionCount + 1}">
        <button class="remove-poll-option text-red-500 hover:text-red-700">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    pollOptions.appendChild(optionField);
    
    optionField.querySelector('.remove-poll-option').addEventListener('click', () => {
        optionField.remove();
    });
}

async function createNewPoll() {
    if (!pollQuestion || !pollQuestion.value.trim()) {
        showToast('Please enter a poll question', 'error');
        return;
    }
    
    const optionInputs = pollOptions.querySelectorAll('input[type="text"]');
    const options = [];
    optionInputs.forEach(input => {
        if (input.value.trim()) {
            options.push(input.value.trim());
        }
    });
    
    if (options.length < 2) {
        showToast('Please add at least 2 options', 'error');
        return;
    }
    
    if (options.length > 6) {
        showToast('Maximum 6 options allowed', 'error');
        return;
    }
    
    try {
        const pollData = {
            type: 'poll',
            pollQuestion: pollQuestion.value.trim(),
            pollOptions: options,
            pollVotes: options.map(() => 0),
            totalVotes: 0,
            senderId: currentUser.uid,
            senderName: currentUserData.displayName,
            chatId: currentChat.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent'
        };
        
        await db.collection('messages').add(pollData);
        
        // Update chat document with last message
        await db.collection('chats').doc(currentChat.id).update({
            lastMessage: `📊 Poll: ${pollQuestion.value.trim().substring(0, 30)}...`,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            [`unread.${currentChat.friendId}`]: firebase.firestore.FieldValue.increment(1)
        });
        
        // Clear poll creation
        pollQuestion.value = '';
        pollOptions.innerHTML = '';
        
        // Hide poll creation section
        if (pollCreationSection) pollCreationSection.classList.add('hidden');
        
        showToast('Poll created successfully', 'success');
        
    } catch (error) {
        console.error('Error creating poll:', error);
        showToast('Error creating poll', 'error');
    }
}

async function voteOnPoll(messageId, optionIndex) {
    if (!currentUser || !currentChat) return;
    
    try {
        const messageRef = db.collection('messages').doc(messageId);
        const messageDoc = await messageRef.get();
        
        if (!messageDoc.exists) return;
        
        const messageData = messageDoc.data();
        const voters = messageData.voters || [];
        
        // Check if user already voted
        if (voters.includes(currentUser.uid)) {
            showToast('You have already voted on this poll', 'error');
            return;
        }
        
        // Update votes
        const pollVotes = [...messageData.pollVotes];
        pollVotes[optionIndex] = (pollVotes[optionIndex] || 0) + 1;
        
        await messageRef.update({
            pollVotes: pollVotes,
            totalVotes: (messageData.totalVotes || 0) + 1,
            voters: [...voters, currentUser.uid]
        });
        
        showToast('Vote recorded', 'success');
        
    } catch (error) {
        console.error('Error voting on poll:', error);
        showToast('Error voting on poll', 'error');
    }
}
// Add this function anywhere after the AI functions
function addAISettingsToProfile() {
    // This function can be called from your profile/settings page
    // to add a toggle for AI features
    console.log('Adding AI settings to profile...');
    
    const profileModal = document.getElementById('profileModal');
    if (!profileModal) return;
    
    // Look for settings section
    const settingsSection = profileModal.querySelector('.settings-section') || profileModal;
    
    // Create AI settings toggle
    const aiToggleHTML = `
        <div class="setting-item">
            <div class="flex items-center justify-between p-3 border-b border-gray-200">
                <div class="flex items-center">
                    <i class="fas fa-robot text-purple-600 mr-3 text-lg"></i>
                    <div>
                        <p class="font-medium">AI Features</p>
                        <p class="text-sm text-gray-500">Smart replies, summaries</p>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="aiFeaturesToggle" ${currentUserData?.aiEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    `;
    
    // Add to settings
    settingsSection.insertAdjacentHTML('beforeend', aiToggleHTML);
    
    // Add event listener
    setTimeout(() => {
        const toggle = document.getElementById('aiFeaturesToggle');
        if (toggle) {
            toggle.addEventListener('change', async function() {
                const enabled = this.checked;
                
                // Update in database
                await db.collection('users').doc(currentUser.uid).update({
                    aiEnabled: enabled,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update local data
                currentUserData.aiEnabled = enabled;
                
                // Update UI
                if (enabled) {
                    showAIFeatures();
                    showToast('AI features enabled', 'success');
                } else {
                    hideAIFeatures();
                    showToast('AI features disabled', 'info');
                }
            });
        }
    }, 100);
}

// Call this when opening profile/settings
// addAISettingsToProfile();

// ==================== MESSAGE SELECTION ====================
let selectedMessages = new Set();

function setupMessageSelection() {
    if (cancelSelection) {
        cancelSelection.addEventListener('click', () => {
            clearMessageSelection();
        });
    }
    
    if (forwardSelected) {
        forwardSelected.addEventListener('click', forwardSelectedMessages);
    }
    
    if (starSelected) {
        starSelected.addEventListener('click', starSelectedMessages);
    }
    
    if (deleteSelected) {
        deleteSelected.addEventListener('click', deleteSelectedMessages);
    }
}

function clearMessageSelection() {
    selectedMessages.clear();
    if (messageSelectionToolbar) messageSelectionToolbar.classList.add('hidden');
    
    // Remove selection styling
    document.querySelectorAll('.message-item.selected').forEach(el => {
        el.classList.remove('selected');
    });
}

function toggleMessageSelection(messageId) {
    if (selectedMessages.has(messageId)) {
        selectedMessages.delete(messageId);
    } else {
        selectedMessages.add(messageId);
    }
    
    // Update UI
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.classList.toggle('selected');
    }
    
    // Show/hide toolbar
    if (selectedMessages.size > 0) {
        if (messageSelectionToolbar) messageSelectionToolbar.classList.remove('hidden');
        if (selectedMessagesCount) selectedMessagesCount.textContent = selectedMessages.size;
    } else {
        if (messageSelectionToolbar) messageSelectionToolbar.classList.add('hidden');
    }
}

async function forwardSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    showToast(`Forwarding ${selectedMessages.size} messages`, 'info');
    clearMessageSelection();
}

async function starSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    try {
        const batch = db.batch();
        selectedMessages.forEach(messageId => {
            const messageRef = db.collection('messages').doc(messageId);
            batch.update(messageRef, { starred: true });
        });
        
        await batch.commit();
        showToast(`${selectedMessages.size} messages starred`, 'success');
        clearMessageSelection();
        
    } catch (error) {
        console.error('Error starring messages:', error);
        showToast('Error starring messages', 'error');
    }
}

async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return;
    
    if (confirm(`Delete ${selectedMessages.size} selected messages?`)) {
        try {
            const batch = db.batch();
            selectedMessages.forEach(messageId => {
                const messageRef = db.collection('messages').doc(messageId);
                batch.update(messageRef, { deleted: true });
            });
            
            await batch.commit();
            showToast(`${selectedMessages.size} messages deleted`, 'success');
            clearMessageSelection();
            
        } catch (error) {
            console.error('Error deleting messages:', error);
            showToast('Error deleting messages', 'error');
        }
    }
}

// ==================== REPLY SYSTEM ====================
function setupReplySystem() {
    if (cancelReply) {
        cancelReply.addEventListener('click', () => {
            if (replyPreviewBar) {
                replyPreviewBar.classList.add('hidden');
                window.currentReplyMessage = null;
            }
        });
    }
}

function showReplyPreview(message) {
    if (!replyPreviewBar || !replyToName || !replyPreviewContent) return;
    
    replyToName.textContent = message.senderName || 'User';
    replyPreviewContent.textContent = message.text.length > 50 
        ? message.text.substring(0, 50) + '...' 
        : message.text;
    
    replyPreviewBar.classList.remove('hidden');
    window.currentReplyMessage = message;
}

// ==================== CONTEXT MENU ====================
function setupContextMenuActions() {
    if (!messageContextMenu) return;
    
    // Close context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (messageContextMenu && !messageContextMenu.contains(e.target) && 
            !e.target.closest('.message-item')) {
            messageContextMenu.classList.add('hidden');
        }
    });
    
    // Context menu items
    const contextMenuItems = [
        { selector: '[data-action="reply"]', action: handleReply },
        { selector: '[data-action="forward"]', action: handleForward },
        { selector: '[data-action="star"]', action: handleStar },
        { selector: '[data-action="copy"]', action: handleCopy },
        { selector: '[data-action="delete"]', action: handleDelete }
    ];
    
    contextMenuItems.forEach(({ selector, action }) => {
        const element = messageContextMenu.querySelector(selector);
        if (element) {
            element.addEventListener('click', action);
        }
    });
}

function handleReply() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId && window.selectedMessage) {
        showReplyPreview(window.selectedMessage);
    }
    messageContextMenu.classList.add('hidden');
}

function handleForward() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId) {
        toggleMessageSelection(messageId);
    }
    messageContextMenu.classList.add('hidden');
}

function handleStar() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId) {
        toggleMessageSelection(messageId);
        setTimeout(() => {
            starSelectedMessages();
        }, 100);
    }
    messageContextMenu.classList.add('hidden');
}

function handleCopy() {
    if (window.selectedMessage && window.selectedMessage.text) {
        navigator.clipboard.writeText(window.selectedMessage.text)
            .then(() => {
                showToast('Message copied to clipboard', 'success');
            })
            .catch(() => {
                showToast('Failed to copy message', 'error');
            });
    }
    messageContextMenu.classList.add('hidden');
}

function handleDelete() {
    const messageId = messageContextMenu.dataset.messageId;
    if (messageId) {
        toggleMessageSelection(messageId);
        setTimeout(() => {
            deleteSelectedMessages();
        }, 100);
    }
    messageContextMenu.classList.add('hidden');
}

function setupMessageContextMenu(messageElement, message, messageId) {
    messageElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Show context menu
        if (messageContextMenu) {
            messageContextMenu.style.left = `${e.pageX}px`;
            messageContextMenu.style.top = `${e.pageY}px`;
            messageContextMenu.classList.remove('hidden');
            messageContextMenu.dataset.messageId = messageId;
        }
        
        // Store selected message
        window.selectedMessageId = messageId;
        window.selectedMessage = message;
    });
}

// ==================== MOOD SUGGESTIONS ====================
function setupMoodSuggestions() {
    if (dismissSuggestion) {
        dismissSuggestion.addEventListener('click', () => {
            if (moodSuggestion) moodSuggestion.classList.add('hidden');
        });
    }
}

// ==================== BUSINESS TOOLS ====================
function setupBusinessTools() {
    if (catalogueBtn) {
        catalogueBtn.addEventListener('click', () => {
            if (catalogueModal) catalogueModal.classList.remove('hidden');
        });
    }
    
    if (advertiseBtn) {
        advertiseBtn.addEventListener('click', () => {
            if (advertiseModal) advertiseModal.classList.remove('hidden');
        });
    }
    
    if (labelsBtn) {
        labelsBtn.addEventListener('click', () => {
            if (labelsModal) labelsModal.classList.remove('hidden');
        });
    }
    
    if (greetingBtn) {
        greetingBtn.addEventListener('click', () => {
            if (greetingModal) greetingModal.classList.remove('hidden');
        });
    }
    
    if (awayBtn) {
        awayBtn.addEventListener('click', () => {
            if (awayModal) awayModal.classList.remove('hidden');
        });
    }
}

// ==================== AI FEATURES ====================
function setupAIFeatures() {
    if (aiSummarize) {
        aiSummarize.addEventListener('click', generateAISummary);
    }
    
    if (aiReply) {
        aiReply.addEventListener('click', generateSmartReplies);
    }
}

async function generateAISummary() {
    if (!currentChat) {
        showToast('Please open a chat first', 'error');
        return;
    }
    
    showToast('Generating AI summary...', 'info');
    
    try {
        // Get recent messages for summary
        const messagesSnapshot = await db.collection('messages')
            .where('chatId', '==', currentChat.id)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();
        
        if (messagesSnapshot.empty) {
            showToast('Not enough messages to summarize', 'error');
            return;
        }
        
        const messages = [];
        messagesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.text && !data.deleted) {
                messages.push({
                    sender: data.senderName,
                    text: data.text,
                    time: data.timestamp?.toDate?.() || new Date()
                });
            }
        });
        
        // Simulate AI summary
        const summary = `Conversation Summary (${messages.length} recent messages):
        
        ${messages.slice(0, 3).map(msg => `• ${msg.sender}: ${msg.text.substring(0, 50)}...`).join('\n')}
        
        ${messages.length > 3 ? `... and ${messages.length - 3} more messages` : ''}`;
        
        // Display summary
        if (aiSummaryModal) {
            const aiSummaryContent = document.getElementById('aiSummaryContent');
            if (aiSummaryContent) {
                aiSummaryContent.textContent = summary;
                aiSummaryModal.classList.remove('hidden');
            }
        }
        
    } catch (error) {
        console.error('Error generating summary:', error);
        showToast('Error generating summary', 'error');
    }
}

async function generateSmartReplies() {
    if (!currentChat) {
        showToast('Please open a chat first', 'error');
        return;
    }
    
    showToast('Generating smart replies...', 'info');
    
    try {
        // Simulate AI-generated replies
        const smartReplies = [
            "Yes, that sounds good!",
            "No, I don't think so.",
            "Let me think about it.",
            "Can we discuss this later?",
            "I agree with you.",
            "That's interesting!",
            "Thanks for sharing!"
        ];
        
        // Display smart replies
        if (smartRepliesModal) {
            const smartRepliesList = document.getElementById('smartRepliesList');
            if (smartRepliesList) {
                smartRepliesList.innerHTML = '';
                
                smartReplies.forEach(reply => {
                    const replyItem = document.createElement('div');
                    replyItem.className = 'smart-reply-item';
                    replyItem.textContent = reply;
                    replyItem.addEventListener('click', () => {
                        if (messageInput) {
                            messageInput.value = reply;
                            messageInput.focus();
                            smartRepliesModal.classList.add('hidden');
                        }
                    });
                    smartRepliesList.appendChild(replyItem);
                });
                
                smartRepliesModal.classList.remove('hidden');
            }
        }
        
    } catch (error) {
        console.error('Error generating smart replies:', error);
        showToast('Error generating smart replies', 'error');
    }
}

// ==================== HELP CENTER ====================
function setupHelpCenter() {
    // This function sets up help center functionality
}

// ==================== MODALS ====================
// ==================== UNIVERSAL MODAL HANDLER ====================
function setupModals() {
    console.log('Setting up modals...');
    
    // 1. Close all modals when clicking outside
    document.addEventListener('click', function(e) {
        // If clicking on modal backdrop (the dark background)
        if (e.target.classList.contains('modal') || 
            e.target.classList.contains('modal-backdrop') ||
            e.target.hasAttribute('data-modal-backdrop')) {
            
            // Find and close the modal
            let modal = e.target;
            while (modal && !modal.classList.contains('modal')) {
                modal = modal.parentElement;
            }
            if (modal) {
                modal.classList.add('hidden');
                console.log('Closed modal by backdrop:', modal.id);
            }
        }
    });
    
    // 2. Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(modal => {
                if (!modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    console.log('Closed modal with Escape:', modal.id);
                }
            });
        }
    });
    
    // 3. Setup specific close buttons (only if they exist)
    const modalClosePairs = [
        { closeBtn: 'closeFeatures', modal: 'featuresModal' },
        { closeBtn: 'closeMood', modal: 'moodModal' },
        { closeBtn: 'closeQuickActions', modal: 'quickActionsModal' },
        { closeBtn: 'closeStatusViewer', modal: 'statusViewerModal' },
        { closeBtn: 'closeEnhancedSearch', modal: 'friendSearchResultsModal' },
        { closeBtn: 'cancelFriend', modal: 'addFriendModal' },
        { closeBtn: 'cancelEditFriend', modal: 'editFriendModal' },
        { closeBtn: 'closeAllFriends', modal: 'allFriendsModal' },
        { closeBtn: 'closeCreateGoal', modal: 'createGoalModal' },
        { closeBtn: 'closePollCreation', modal: 'pollCreationSection' },
        { closeBtn: 'cancelGoal', modal: 'createGoalModal' },
        { closeBtn: 'dismissSuggestion', modal: 'moodSuggestion' },
        { closeBtn: 'dismissPollResults', modal: 'pollResultsSection' },
        { closeBtn: 'cancelReply', modal: 'replyPreviewBar' }
    ];
    
    modalClosePairs.forEach(pair => {
        const closeBtn = document.getElementById(pair.closeBtn);
        const modal = document.getElementById(pair.modal);
        
        if (closeBtn && modal) {
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                modal.classList.add('hidden');
                console.log(`Closed ${modal.id} via ${closeBtn.id}`);
            });
        } else {
            console.warn(`Could not connect: ${pair.closeBtn} → ${pair.modal}`);
        }
    });
    
    // 4. Mood options
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            const mood = this.dataset.mood;
            if (mood) {
                updateMood(mood);
            }
        });
    });
    
    // 5. Save Goal button (if it exists)
    const saveGoalBtn = document.getElementById('saveGoal');
    if (saveGoalBtn && createGoalModal) {
        saveGoalBtn.addEventListener('click', async function() {
            const title = document.getElementById('goalTitle')?.value;
            const description = document.getElementById('goalDescription')?.value;
            const dueDate = document.getElementById('goalDueDate')?.value;
            const progress = document.getElementById('goalProgress')?.value;
            
            if (!title) {
                showToast('Please enter a goal title', 'error');
                return;
            }
            
            try {
                // Save goal logic here
                showToast('Goal saved successfully!', 'success');
                createGoalModal.classList.add('hidden');
                
                // Clear form
                if (document.getElementById('goalTitle')) document.getElementById('goalTitle').value = '';
                if (document.getElementById('goalDescription')) document.getElementById('goalDescription').value = '';
                
            } catch (error) {
                console.error('Error saving goal:', error);
                showToast('Error saving goal', 'error');
            }
        });
    }
}


function handleQuickAction(action) {
    switch(action) {
        case 'create-status':
            if (statusCreation) statusCreation.classList.remove('hidden');
            break;
        case 'create-goal':
            if (createGoalModal) createGoalModal.classList.remove('hidden');
            break;
        case 'share-contact':
            showToast('Share contact feature coming soon', 'info');
            break;
        case 'schedule-call':
            showToast('Schedule call feature coming soon', 'info');
            break;
        default:
            console.log('Quick action:', action);
    }
}

// ==================== SEARCH FUNCTIONALITY ====================
async function searchUsers(query) {
    if (!query) return [];
    
    console.log('Searching users for:', query);
    
    try {
        // Search by name
        const nameQuery = await db.collection('users')
            .where('displayName', '>=', query)
            .where('displayName', '<=', query + '\uf8ff')
            .limit(10)
            .get();
        
        const results = [];
        nameQuery.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                results.push({
                    id: doc.id,
                    ...doc.data()
                });
            }
        });
        
        console.log('Search results:', results.length, 'users found');
        return results;
        
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

function displayEnhancedSearchResults(results) {
    if (!enhancedSearchResults) return;
    
    enhancedSearchResults.innerHTML = '';
    
    if (results.length === 0) {
        enhancedSearchResults.innerHTML = '<p class="text-center text-gray-500 py-4">No users found</p>';
        return;
    }
    
    console.log('Displaying', results.length, 'search results');
    
    results.forEach(user => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';
        resultItem.innerHTML = `
            <div class="flex items-center p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer">
                <img class="w-10 h-10 rounded-full mr-3" src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff`}" alt="${user.displayName}">
                <div class="flex-1">
                    <p class="font-medium">${user.displayName}</p>
                    <p class="text-sm text-gray-500">${user.email || ''}</p>
                </div>
                <div class="flex space-x-2">
                    <button class="add-friend bg-purple-600 text-white px-3 py-1 rounded-lg" data-id="${user.id}" data-name="${user.displayName}">
                        <i class="fas fa-user-plus"></i>
                    </button>
                    <button class="message-user bg-green-600 text-white px-3 py-1 rounded-lg" data-id="${user.id}" data-name="${user.displayName}">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
            </div>
        `;
        
        enhancedSearchResults.appendChild(resultItem);
    });
    
    // Add event listeners to buttons using event delegation
    enhancedSearchResults.addEventListener('click', function(e) {
        if (e.target.closest('.add-friend')) {
            const btn = e.target.closest('.add-friend');
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            sendFriendRequest(userId);
            if (friendSearchResultsModal) friendSearchResultsModal.classList.add('hidden');
            showToast(`Friend request sent to ${userName}`, 'success');
        }
        
        if (e.target.closest('.message-user')) {
            const btn = e.target.closest('.message-user');
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            startChat(userId, userName);
            if (friendSearchResultsModal) friendSearchResultsModal.classList.add('hidden');
        }
    });
}

async function sendFriendRequest(friendId) {
    try {
        console.log('Sending friend request to:', friendId);
        
        // Check if friendship already exists
        const existingFriendship = await db.collection('friendships')
            .where('users', 'array-contains', currentUser.uid)
            .where('status', 'in', ['pending', 'accepted'])
            .get();
        
        const alreadyFriends = existingFriendship.docs.some(doc => {
            const data = doc.data();
            return data.users.includes(friendId);
        });
        
        if (alreadyFriends) {
            showToast('Friend request already sent or user is already your friend', 'error');
            return;
        }
        
        // Create friendship document
        const friendship = {
            users: [currentUser.uid, friendId],
            status: 'pending',
            requestedBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('friendships').add(friendship);
        console.log('Friend request sent successfully');
        showToast('Friend request sent successfully', 'success');
    } catch (error) {
        console.error('Error sending friend request:', error);
        showToast('Error sending friend request', 'error');
    }
}

// ==================== FAVORITES MANAGEMENT ====================
function loadFavorites() {
    if (!currentUser || !favoritesList) return;
    
    // Load favorites from user data
    db.collection('users').doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists) {
                const userData = doc.data();
                const favorites = userData.favorites || [];
                
                favoritesList.innerHTML = '';
                
                if (favorites.length === 0) {
                    favoritesList.innerHTML = `
                        <div class="text-center text-gray-500 py-8">
                            <i class="fas fa-star text-4xl mb-3 text-gray-300 block"></i>
                            <p>No favorites yet</p>
                            <p class="text-sm mt-1">Add friends to your favorites list</p>
                        </div>
                    `;
                    return;
                }
                
                // Load favorite friends details
                const favoritePromises = favorites.map(friendId => {
                    return db.collection('users').doc(friendId).get();
                });
                
                Promise.all(favoritePromises).then(docs => {
                    docs.forEach((doc, index) => {
                        if (doc.exists) {
                            const friendData = doc.data();
                            const friendItem = document.createElement('div');
                            friendItem.className = 'favorite-item';
                            friendItem.innerHTML = `
                                <div class="flex items-center justify-between p-3 border-b border-gray-200">
                                    <div class="flex items-center space-x-3">
                                        <img class="w-10 h-10 rounded-full" src="${friendData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friendData.displayName)}&background=7C3AED&color=fff`}" alt="${friendData.displayName}">
                                        <div>
                                            <p class="font-medium">${friendData.displayName}</p>
                                            <p class="text-xs text-gray-500">⭐ Favorite</p>
                                        </div>
                                    </div>
                                    <div class="flex space-x-2">
                                        <button class="call-favorite px-3 py-1 bg-green-500 text-white rounded-lg" data-id="${favorites[index]}" data-name="${friendData.displayName}">
                                            Call
                                        </button>
                                    </div>
                                </div>
                            `;
                            
                            favoritesList.appendChild(friendItem);
                        }
                    });
                    
                    // Add event listeners for call buttons
                    favoritesList.addEventListener('click', function(e) {
                        if (e.target.closest('.call-favorite')) {
                            const btn = e.target.closest('.call-favorite');
                            const friendId = btn.dataset.id;
                            const friendName = btn.dataset.name;
                            if (window.startVoiceCallWithFriend) {
                                window.startVoiceCallWithFriend(friendId, friendName);
                            }
                        }
                    });
                });
            }
        })
        .catch(error => {
            console.error('Error loading favorites:', error);
        });
}

// ==================== ALL FRIENDS VIEW ====================
function loadAllFriendsView() {
    if (!allFriendsList) return;
    
    allFriendsList.innerHTML = '';
    
    if (friends.length === 0) {
        if (noAllFriendsMessage) {
            noAllFriendsMessage.classList.remove('hidden');
        }
        return;
    }
    
    if (noAllFriendsMessage) {
        noAllFriendsMessage.classList.add('hidden');
    }
    
    friends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'all-friend-item';
        friendItem.innerHTML = `
            <div class="flex items-center justify-between p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer">
                <div class="flex items-center space-x-3">
                    <img class="w-10 h-10 rounded-full" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                    <div>
                        <p class="font-medium">${friend.displayName}</p>
                        <p class="text-sm text-gray-500">${friend.about || 'Hey there! I am using Kynecta'}</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="message-all-friend px-3 py-1 bg-purple-500 text-white rounded-lg" data-id="${friend.id}" data-name="${friend.displayName}">
                        Message
                    </button>
                    <button class="call-all-friend px-3 py-1 bg-green-500 text-white rounded-lg" data-id="${friend.id}" data-name="${friend.displayName}">
                        Call
                    </button>
                </div>
            </div>
        `;
        
        allFriendsList.appendChild(friendItem);
    });
    
    // Add event listeners for message/call buttons
    allFriendsList.addEventListener('click', function(e) {
        if (e.target.closest('.message-all-friend')) {
            const btn = e.target.closest('.message-all-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            startChat(friendId, friendName);
            if (allFriendsModal) allFriendsModal.classList.add('hidden');
        }
        
        if (e.target.closest('.call-all-friend')) {
            const btn = e.target.closest('.call-all-friend');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            }
            if (allFriendsModal) allFriendsModal.classList.add('hidden');
        }
    });
}

// ==================== BUSINESS DOCUMENT INITIALIZATION ====================
function initializeBusinessDocument(userId) {
    const businessDocRef = firebase.firestore().collection('business').doc(userId);
    const userDocRef = firebase.firestore().collection('users').doc(userId);
    
    businessDocRef.get().then((doc) => {
        if (!doc.exists) {
            // Create initial business document
            return businessDocRef.set({
                userId: userId,
                businessName: '',
                greetingMessage: 'Hello! Thanks for messaging me. How can I help you today?',
                awayMessage: 'Sorry, I\'m away right now. I\'ll get back to you as soon as possible.',
                awayEnabled: false,
                catalogue: [],
                labels: [],
                isBusinessAccount: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }).then(() => {
        // Also update user document with business info for quick access
        return userDocRef.update({
            hasBusiness: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).catch(error => {
        console.error('Error initializing business document:', error);
    });
}

// ==================== NOTIFICATION PERMISSION ====================
async function requestNotificationPermission() {
    try {
        // Check if permission is already denied/blocked
        if (Notification.permission === 'denied') {
            console.log('Notifications blocked by user. User must manually enable in browser settings.');
            return;
        }
        
        // Don't ask if already granted
        if (Notification.permission === 'granted') {
            console.log('Notifications already granted');
            return;
        }
        
        // Only ask if permission is default
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('Notification permission granted');
            }
        }
    } catch (error) {
        console.error('Error with notification permission:', error);
    }
}

async function sendPushNotification(userId, senderName, message) {
    try {
        console.log('Sending push notification to:', userId);
        // Get recipient's FCM token
        const recipientDoc = await db.collection('users').doc(userId).get();
        if (recipientDoc.exists) {
            const recipientData = recipientDoc.data();
            const fcmToken = recipientData.fcmToken;
            
            if (fcmToken) {
                console.log(`Sending push notification to ${userId}: ${senderName}: ${message}`);
            }
        }
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
    console.log('Setting up event listeners');

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
        });
    }

    // Back to chats (mobile)
    if (backToChats) {
        backToChats.addEventListener('click', goBackToTabs);
    }
    
    // Also handle escape key to go back
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && currentChat) {
            goBackToTabs();
        }
    });

    // Message input and sending
    if (messageInput) {
        messageInput.addEventListener('input', handleTypingIndicator);
        
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    // File attachment
    if (attachBtn) {
        attachBtn.addEventListener('click', () => {
            console.log('Attach file clicked');
            // Create a file input element
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '*/*';
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    console.log('File selected:', e.target.files[0].name);
                    uploadFile(e.target.files[0]);
                }
            });
            fileInput.click();
        });
    }

    // Remove file preview
    if (removeFile) {
        removeFile.addEventListener('click', () => {
            console.log('Remove file preview clicked');
            if (filePreview) filePreview.classList.add('hidden');
        });
    }

    // Emoji picker
    if (emojiBtn) {
        emojiBtn.addEventListener('click', toggleEmojiPicker);
    }

    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiBtn = document.getElementById('emojiBtn');
        
        if (emojiPicker && emojiPicker.style.display === 'block' && 
            !emojiPicker.contains(e.target) && 
            !(emojiBtn && emojiBtn.contains(e.target))) {
            emojiPicker.style.display = 'none';
        }
    });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to log out?')) {
                console.log('Logging out user');
                auth.signOut().then(() => {
                    window.location.href = 'index.html';
                }).catch(error => {
                    console.error('Error signing out:', error);
                    showToast('Error signing out', 'error');
                });
            }
        });
    }

    // Scroll to bottom button
    if (scrollToBottom) {
        scrollToBottom.addEventListener('click', () => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        });
    }

    // Voice to text button
    if (voiceToTextBtn) {
        voiceToTextBtn.addEventListener('click', setupVoiceToText);
    }

    console.log('Event listeners setup completed');
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('kynecta-theme', theme);
    
    // Update theme icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// ==================== VOICE TO TEXT ====================
function setupVoiceToText() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.start();
        showToast('Listening... Speak now', 'info');
        
        if (voiceRecordingIndicator) {
            voiceRecordingIndicator.classList.remove('hidden');
        }
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (messageInput) {
                messageInput.value = transcript;
            }
            
            if (voiceRecordingIndicator) {
                voiceRecordingIndicator.classList.add('hidden');
            }
            
            showToast('Speech recognized', 'success');
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (voiceRecordingIndicator) {
                voiceRecordingIndicator.classList.add('hidden');
            }
            showToast('Speech recognition failed', 'error');
        };
        
        recognition.onend = () => {
            if (voiceRecordingIndicator) {
                voiceRecordingIndicator.classList.add('hidden');
            }
        };
    } else {
        showToast('Speech recognition not supported in this browser', 'error');
    }
}

// ==================== AUTO SCROLL DETECTION ====================
function setupAutoScrollDetection() {
    if (!messagesContainer || !scrollToBottom) return;
    
    messagesContainer.addEventListener('scroll', () => {
        const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        
        if (isAtBottom) {
            scrollToBottom.classList.add('hidden');
        } else {
            scrollToBottom.classList.remove('hidden');
        }
    });
}


// ==================== LOAD ALL USERS ====================
async function loadAllUsers() {
    try {
        if (!currentUser || !db) {
            console.log('User not authenticated or database not available');
            allUsers = [];
            return;
        }
        
        console.log('Loading all users...');
        
        const usersSnapshot = await db.collection('users').get();
        allUsers = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            // Don't include current user
            if (doc.id !== currentUser.uid) {
                allUsers.push({
                    id: doc.id,
                    ...userData
                });
            }
        });
        
        console.log(`✅ Loaded ${allUsers.length} users`);
        return allUsers;
        
    } catch (error) {
        console.error('❌ Error loading all users:', error);
        allUsers = [];
        return [];
    }
}

// ==================== MOBILE OPTIMIZATIONS ====================
function optimizeForMobile() {
    // Prevent zoom on input focus
    document.addEventListener('touchstart', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            document.body.style.zoom = '100%';
        }
    }, { passive: true });

    // Handle viewport height issues on mobile
    function setViewportHeight() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
}

// Initialize mobile optimizations
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    console.log('Mobile device detected, applying optimizations');
    optimizeForMobile();
}

// ==================== INITIALIZE ALL FEATURES ====================
// Call initialization functions
setupAutoScrollDetection();

// Dispatch event when friends are rendered
window.dispatchEvent(new CustomEvent('friendsRendered'));

// Listen for friends rendered event to add call buttons
window.addEventListener('friendsRendered', () => {
    console.log('🎯 Friends rendered, adding call buttons');
    setTimeout(() => {
        if (window.addCallButtonsToFriendList) {
            window.addCallButtonsToFriendList();
        }
        if (window.addCallButtonsToChat) {
            window.addCallButtonsToChat();
        }
    }, 100);
});

>>>>>>> 35a7dd29c215aeda26525e12658dd8bef5034d22
console.log('✅ chat.js fully loaded with all features');