// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
    authDomain: "uniconnect-ee95c.firebaseapp.com",
    projectId: "uniconnect-ee95c",
    storageBucket: "uniconnect-ee95c.firebasestorage.app",
    messagingSenderId: "1003264444309",
    appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const messaging = firebase.messaging();

// Cloudinary Configuration
const cloudinaryConfig = {
    cloudName: 'dhjnxa5rh',
    apiKey: '817591969559894',
    uploadPreset: 'kynecta_uploads'
};

// Global Variables
let currentUser = null;
let currentUserData = null;
let currentChat = null;
let isInCall = false;
let friends = [];
let allUsers = [];
let userSettings = {
    security: {
        notifications: true,
        passkeys: false,
        twoStepVerification: false
    },
    privacy: {
        lastSeen: 'everyone',
        profilePhoto: 'everyone',
        about: 'everyone',
        status: 'everyone',
        readReceipts: true,
        disappearingMessages: 'off',
        groups: 'everyone',
        avatarStickers: true,
        calls: 'everyone',
        contact: 'everyone',
        appLock: false,
        cameraEffects: true
    },
    notifications: {
        conversationTones: true,
        reminders: true,
        vibrate: true,
        notificationLight: true,
        lightColor: '#7C3AED',
        highPriorityNotifications: true,
        reactionNotifications: true
    },
    storage: {
        lessDataCalls: false,
        proxyEnabled: false,
        mediaUploadQuality: 'auto',
        autoDownloadQuality: 'standard'
    },
    chat: {
        displayTheme: 'light',
        defaultChatTheme: 'purple',
        fontSize: 'medium',
        enterKeySends: true,
        mediaVisibility: true
    },
    accessibility: {
        largeText: false,
        highContrast: false,
        screenReader: true,
        reducedMotion: false,
        voiceControl: false
    },
    language: {
        appLanguage: 'en'
    },
    favorites: []
};
let userStatuses = [];
let unsubscribeMessages = null;
let unsubscribeChats = null;
let currentEditingFriendId = null;
let typingTimeout = null;
let typingListener = null;

// WebRTC Variables
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let isMuted = false;
let isVideoOff = false;
// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Signaling state
let callState = {
    isCaller: false,
    isReceivingCall: false,
    callType: null, // 'video' or 'voice'
    remoteUserId: null
};

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const chatApp = document.getElementById('chatApp');
const settingsModal = document.getElementById('settingsModal');
const addFriendModal = document.getElementById('addFriendModal');
const friendSearchResultsModal = document.getElementById('friendSearchResultsModal');
const editFriendModal = document.getElementById('editFriendModal');
const profileSettingsModal = document.getElementById('profileSettingsModal');
const privacySettingsModal = document.getElementById('privacySettingsModal');
const accountSettingsModal = document.getElementById('accountSettingsModal');
const accessibilitySettingsModal = document.getElementById('accessibilitySettingsModal');
const notificationsSettingsModal = document.getElementById('notificationsSettingsModal');
const storageSettingsModal = document.getElementById('storageSettingsModal');
const languageSettingsModal = document.getElementById('languageSettingsModal');
const chatSettingsModal = document.getElementById('chatSettingsModal');
const favoritesSettingsModal = document.getElementById('favoritesSettingsModal');
const helpCenterModal = document.getElementById('helpCenterModal');
const appInfoModal = document.getElementById('appInfoModal');
const inviteFriendsModal = document.getElementById('inviteFriendsModal');
const statusCreation = document.getElementById('statusCreation');
const videoConferenceModal = document.getElementById('videoConferenceModal');
const emojiPicker = document.getElementById('emojiPicker');
const createGroupModal = document.getElementById('createGroupModal');
const joinGroupModal = document.getElementById('joinGroupModal');
const allFriendsModal = document.getElementById('allFriendsModal');

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
// Safety function to check if element exists
function safeElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with id '${id}' not found`);
    }
    return element;
}

// Safe version of classList operations
function safeClassList(id, action, className) {
    const element = safeElement(id);
    if (element && element.classList) {
        element.classList[action](className);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    console.log('Initializing app...');
    // Check if user is logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('User authenticated:', user.uid);
            currentUser = user;
            loadUserData();
        } else {
            console.log('No user found, redirecting to login');
            // Redirect to login if not authenticated
            window.location.href = 'login.html';
        }
    });
}

async function loadUserData() {
    try {
        console.log('Loading user data for:', currentUser.uid);
        async function loadUserData() {
    try {
        // ... existing code ...
        
        showChatApp();
        setupEventListeners();
        loadUserSettings();
        loadStatusUpdates();
        loadFriends();
        loadAllUsers();
        initEmojiPicker();
        loadChatsTemporary();
        requestNotificationPermission();
        
        // Start listening for friend requests
        listenForFriendRequests();
        
        // NEW: Start listening for incoming calls
        listenForIncomingCalls();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Error loading user data', 'error');
    }
}
        // Get user document from Firestore
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            currentUserData = userDoc.data();
            console.log('User data loaded:', currentUserData);
            initializeUserData();
        } else {
            console.log('Creating new user document');
            // Create user document if it doesn't exist
            currentUserData = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email.split('@')[0],
                photoURL: currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email)}&background=7C3AED&color=fff`,
                coverURL: '',
                about: 'Life without Christ is motion without meaning',
                phone: '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'online',
                mood: 'happy'
            };
            
            await db.collection('users').doc(currentUser.uid).set(currentUserData);
            console.log('New user document created');
            initializeUserData();
        }
        
        showChatApp();
        setupEventListeners();
        loadUserSettings();
        loadStatusUpdates();
        loadFriends();
        loadAllUsers();
        initEmojiPicker();
        loadChatsTemporary();
        requestNotificationPermission();
        
        // Start listening for friend requests
        listenForFriendRequests();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Error loading user data', 'error');
    }
}

function initializeUserData() {
    console.log('Initializing UI with user data');
    // Set user info in UI
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    
    if (userName) userName.textContent = currentUserData.displayName;
    if (userAvatar) userAvatar.src = currentUserData.photoURL;
    
    // Update settings modal with user data
    const settingsUserName = document.getElementById('settingsUserName');
    const settingsProfilePic = document.getElementById('settingsProfilePic');
    
    if (settingsUserName) settingsUserName.textContent = currentUserData.displayName;
    if (settingsProfilePic) settingsProfilePic.src = currentUserData.photoURL;
    
    // Update profile settings with user data
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
    
    // Load user preferences
    loadUserPreferences();
}

function showChatApp() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (chatApp) chatApp.classList.remove('hidden');
    console.log('Chat app UI shown');
}

function loadUserPreferences() {
    const theme = localStorage.getItem('kynecta-theme') || 'light';
    setTheme(theme);
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('kynecta-theme', theme);
    
    // Update theme icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        if (theme === 'dark') {
            themeIcon.className = 'fas fa-sun';
        } else {
            themeIcon.className = 'fas fa-moon';
        }
    }
}

function showToast(message, type = 'info') {
    console.log(`Toast: ${message} (${type})`);
    const toastContainer = document.getElementById('toastContainer');
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

function loadUserSettings() {
    // Load settings from localStorage or use defaults
    const savedSettings = localStorage.getItem('kynecta-settings');
    if (savedSettings) {
        userSettings = JSON.parse(savedSettings);
    }
    
    // Apply settings to UI
    applyUserSettings();
}

function saveUserSettings() {
    localStorage.setItem('kynecta-settings', JSON.stringify(userSettings));
}

function applyUserSettings() {
    // Apply theme
    setTheme(userSettings.chat.displayTheme);
    
    // Apply accessibility settings
    applyAccessibilitySettings();
    
    // Apply chat settings
    applyChatSettings();
}

function applyAccessibilitySettings() {
    // Font size
    document.body.style.fontSize = userSettings.accessibility.largeText ? '18px' : '16px';
    
    // High contrast
    if (userSettings.accessibility.highContrast) {
        document.body.classList.add('high-contrast');
    } else {
        document.body.classList.remove('high-contrast');
    }
    
    // Reduced motion
    if (userSettings.accessibility.reducedMotion) {
        document.body.classList.add('reduce-motion');
    } else {
        document.body.classList.remove('reduce-motion');
    }
}

function applyChatSettings() {
    // Enter key sends
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        if (userSettings.chat.enterKeySends) {
            messageInput.setAttribute('data-enter-sends', 'true');
        } else {
            messageInput.setAttribute('data-enter-sends', 'false');
        }
    }
}

function loadStatusUpdates() {
    const statusUpdates = document.getElementById('statusUpdates');
    if (!statusUpdates) return;
    
    // Load statuses from Firebase
    db.collection('statuses')
        .where('userId', '==', currentUser.uid)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                statusUpdates.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-images text-4xl mb-3 text-gray-300 block"></i>
                        <p>No status updates yet</p>
                        <p class="text-sm mt-1">Share a photo, video, or text update</p>
                    </div>
                `;
                return;
            }
            
            statusUpdates.innerHTML = '';
            snapshot.forEach(doc => {
                const status = doc.data();
                const statusElement = document.createElement('div');
                statusElement.className = 'flex items-center space-x-3 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer';
                
                let statusContent = '';
                if (status.type === 'emoji') {
                    statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-green-500 flex items-center justify-center text-white text-xl">${status.content}</div>`;
                } else if (status.type === 'text') {
                    statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-teal-500 flex items-center justify-center text-white"><i class="fas fa-font"></i></div>`;
                } else if (status.type === 'image') {
                    statusContent = `<div class="w-12 h-12 rounded-full bg-cover bg-center" style="background-image: url('${status.content}')"></div>`;
                } else if (status.type === 'video') {
                    statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center text-white"><i class="fas fa-video"></i></div>`;
                } else if (status.type === 'audio') {
                    statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center text-white"><i class="fas fa-music"></i></div>`;
                }
                
                statusElement.innerHTML = `
                    ${statusContent}
                    <div>
                        <p class="font-medium">${status.userDisplayName}</p>
                        <p class="text-sm text-gray-500">${formatTimeAgo(status.timestamp)}</p>
                    </div>
                `;
                
                statusUpdates.appendChild(statusElement);
            });
        })
        .catch(error => {
            console.error('Error loading status updates:', error);
            statusUpdates.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                    <p>Error loading status updates</p>
                    <p class="text-sm mt-1">Please try again later</p>
                </div>
            `;
        });
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    
    const now = new Date();
    const time = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return time.toLocaleDateString();
}

function openStatusCreation() {
    if (statusCreation) statusCreation.style.display = 'flex';
    resetStatusCreation();
}

function resetStatusCreation() {
    // Reset all previews
    const emojiPreview = document.getElementById('emojiPreview');
    const textPreview = document.getElementById('textPreview');
    const imagePreview = document.getElementById('imagePreview');
    const videoPreview = document.getElementById('videoPreview');
    const audioPreview = document.getElementById('audioPreview');
    
    if (emojiPreview) emojiPreview.classList.remove('hidden');
    if (textPreview) textPreview.classList.add('hidden');
    if (imagePreview) imagePreview.classList.add('hidden');
    if (videoPreview) videoPreview.classList.add('hidden');
    if (audioPreview) audioPreview.classList.add('hidden');
    
    // Reset active option
    document.querySelectorAll('.status-option').forEach(option => {
        option.classList.remove('active');
    });
    const emojiOption = document.querySelector('.status-option[data-type="emoji"]');
    if (emojiOption) emojiOption.classList.add('active');
    
    // Reset content
    if (emojiPreview) emojiPreview.textContent = '😊';
    const statusTextInput = document.getElementById('statusTextInput');
    if (statusTextInput) statusTextInput.value = '';
    const statusImagePreview = document.getElementById('statusImagePreview');
    if (statusImagePreview) statusImagePreview.classList.add('hidden');
    const statusVideoPreview = document.getElementById('statusVideoPreview');
    if (statusVideoPreview) statusVideoPreview.classList.add('hidden');
    const statusAudioPreview = document.getElementById('statusAudioPreview');
    if (statusAudioPreview) statusAudioPreview.classList.add('hidden');
}

async function uploadToCloudinary(file, resourceType = 'image') {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', cloudinaryConfig.uploadPreset);
        formData.append('cloud_name', cloudinaryConfig.cloudName);
        
        fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                resolve(data.secure_url);
            } else {
                reject(new Error('Upload failed'));
            }
        })
        .catch(error => {
            reject(error);
        });
    });
}

async function postStatus(type, content) {
    try {
        let finalContent = content;
        
        // Handle file uploads to Cloudinary
        if (type === 'image' || type === 'video' || type === 'audio') {
            showToast('Uploading media...', 'info');
            
            // For demo purposes, we'll use a placeholder
            // In a real app, you would get the file and upload it
            if (type === 'image') {
                finalContent = 'https://res.cloudinary.com/dhjnxa5rh/image/upload/v1621234567/placeholder.jpg';
            } else if (type === 'video') {
                finalContent = 'https://res.cloudinary.com/dhjnxa5rh/video/upload/v1621234567/placeholder.mp4';
            } else if (type === 'audio') {
                finalContent = 'https://res.cloudinary.com/dhjnxa5rh/audio/upload/v1621234567/placeholder.mp3';
            }
        }
        
        const newStatus = {
            type: type,
            content: finalContent,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            userId: currentUser.uid,
            userDisplayName: currentUserData.displayName,
            userPhotoURL: currentUserData.photoURL
        };
        
        // Save to Firestore
        await db.collection('statuses').add(newStatus);
        
        // Update UI
        loadStatusUpdates();
        showToast('Status posted successfully', 'success');
    } catch (error) {
        console.error('Error posting status:', error);
        showToast('Error posting status', 'error');
    }
}

// FIXED: Real-time friend loading with proper listeners
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
                
                const noFriendsMessage = document.getElementById('noFriendsMessage');
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

// NEW: Listen for incoming friend requests
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

// NEW: Show friend request notification
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

// NEW: Create notifications container if it doesn't exist
function createNotificationsContainer() {
    const container = document.createElement('div');
    container.id = 'notificationsContainer';
    container.className = 'fixed top-4 right-4 z-50 space-y-2 max-w-sm';
    document.body.appendChild(container);
    return container;
}

// NEW: Accept friend request
async function acceptFriendRequest(friendshipId) {
    try {
        console.log('Accepting friend request:', friendshipId);
        await db.collection('friendships').doc(friendshipId).update({
            status: 'accepted',
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Friend request accepted', 'success');
        // Friends list will automatically update due to real-time listener
    } catch (error) {
        console.error('Error accepting friend request:', error);
        showToast('Error accepting friend request', 'error');
    }
}

// NEW: Decline friend request
async function declineFriendRequest(friendshipId) {
    try {
        console.log('Declining friend request:', friendshipId);
        await db.collection('friendships').doc(friendshipId).delete();
        showToast('Friend request declined', 'info');
    } catch (error) {
        console.error('Error declining friend request:', error);
        showToast('Error declining friend request', 'error');
    }
}

function loadAllUsers() {
    console.log('Loading all users');
    // Fetch all registered users from Firebase
    db.collection('users')
        .where('uid', '!=', currentUser.uid)
        .onSnapshot(snapshot => {
            allUsers = [];
            snapshot.forEach(doc => {
                allUsers.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log('Loaded', allUsers.length, 'other users');
        }, error => {
            console.error('Error loading users:', error);
        });
}

async function searchUsers(query) {
    if (!query) return [];
    
    console.log('Searching users for:', query);
    // Search by name, email, or phone
    const nameResults = allUsers.filter(user => 
        user.displayName && user.displayName.toLowerCase().includes(query.toLowerCase())
    );
    
    const emailResults = allUsers.filter(user => 
        user.email && user.email.toLowerCase().includes(query.toLowerCase())
    );
    
    const phoneResults = allUsers.filter(user => 
        user.phone && user.phone.includes(query)
    );
    
    // Combine and remove duplicates
    const allResults = [...nameResults, ...emailResults, ...phoneResults];
    const uniqueResults = allResults.filter((user, index, self) => 
        index === self.findIndex(u => u.id === user.id)
    );
    
    console.log('Search results:', uniqueResults.length, 'users found');
    return uniqueResults;
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

function removeFriend(friendId) {
    console.log('Removing friend:', friendId);
    // Find the friendship document
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

function renderFriends(friendsToRender) {
    const friendsList = document.getElementById('friendsList');
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
        friendItem.className = 'friend-item bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-200 hover:shadow-md transition-shadow';
        friendItem.dataset.friendId = friend.id;
        friendItem.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4 flex-1">
                    <div class="relative">
                        <img class="w-14 h-14 rounded-full object-cover border-2 border-purple-200" 
                             src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" 
                             alt="${friend.displayName}">
                        <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${friend.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}"></div>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center space-x-2">
                            <h3 class="font-semibold text-gray-800">${friend.displayName}</h3>
                            ${friend.status === 'online' ? '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Online</span>' : ''}
                        </div>
                        <p class="text-sm text-gray-500 mt-1">${friend.about || 'Hey there! I am using Kynecta'}</p>
                        <div class="flex items-center space-x-3 mt-2 text-xs text-gray-400">
                            ${friend.email ? `<span><i class="fas fa-envelope mr-1"></i>${friend.email}</span>` : ''}
                            ${friend.phone ? `<span><i class="fas fa-phone mr-1"></i>${friend.phone}</span>` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="flex items-center space-x-2 ml-4">
                    <!-- Chat Button -->
                    <button class="friend-chat-btn flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors shadow-sm" 
                            data-id="${friend.id}" 
                            data-name="${friend.displayName}">
                        <i class="fas fa-comment"></i>
                        <span>Chat</span>
                    </button>
                    
                    <!-- Voice Call Button -->
                    <button class="friend-call-btn flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm" 
                            data-id="${friend.id}" 
                            data-name="${friend.displayName}">
                        <i class="fas fa-phone"></i>
                        <span>Call</span>
                    </button>
                    
                    <!-- Video Call Button -->
                    <button class="friend-video-call-btn flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm" 
                            data-id="${friend.id}" 
                            data-name="${friend.displayName}">
                        <i class="fas fa-video"></i>
                        <span>Video</span>
                    </button>
                    
                    <!-- More Options Button -->
                    <div class="relative">
                        <button class="friend-options-btn w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="friend-options-menu absolute right-0 top-12 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10 hidden min-w-32">
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
        // Chat button
        if (e.target.closest('.friend-chat-btn')) {
            const btn = e.target.closest('.friend-chat-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Starting chat with:', friendName, friendId);
            startChat(friendId, friendName);
        }
        
        // Voice call button
        if (e.target.closest('.friend-call-btn')) {
            const btn = e.target.closest('.friend-call-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Calling:', friendName, friendId);
            startVoiceCallWithFriend(friendId, friendName);
        }
        
        // Video call button
        if (e.target.closest('.friend-video-call-btn')) {
            const btn = e.target.closest('.friend-video-call-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Video calling:', friendName, friendId);
            startVideoCallWithFriend(friendId, friendName);
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
            // Close the menu
            btn.closest('.friend-options-menu').classList.add('hidden');
        }
        
        // Remove friend
        if (e.target.closest('.remove-friend-btn')) {
            const btn = e.target.closest('.remove-friend-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Removing friend:', friendName, friendId);
            confirmRemoveFriend(friendId, friendName);
            // Close the menu
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
}
// Enhanced call functions for friends list
function startVoiceCallWithFriend(friendId, friendName) {
    console.log('Starting voice call with friend:', friendName, friendId);
    
    // Set current chat for the call
    const chatId = [currentUser.uid, friendId].sort().join('_');
    currentChat = {
        id: chatId,
        friendId: friendId,
        name: friendName
    };
    
    showToast(`Calling ${friendName}...`, 'info');
    startVoiceCall();
}

function startVideoCallWithFriend(friendId, friendName) {
    console.log('Starting video call with friend:', friendName, friendId);
    
    // Set current chat for the call
    const chatId = [currentUser.uid, friendId].sort().join('_');
    currentChat = {
        id: chatId,
        friendId: friendId,
        name: friendName
    };
    
    showToast(`Starting video call with ${friendName}...`, 'info');
    startVideoCall();
}

function viewFriendProfile(friendId) {
    console.log('Viewing friend profile:', friendId);
    // For now, show a toast. You can implement a proper profile view modal later
    showToast('Friend profile view - Feature coming soon!', 'info');
}

function confirmRemoveFriend(friendId, friendName) {
    if (confirm(`Are you sure you want to remove ${friendName} from your friends?`)) {
        removeFriend(friendId);
    }
}

function openEditFriendModal(friendId, name, status) {
    currentEditingFriendId = friendId;
    const editFriendName = document.getElementById('editFriendName');
    const editFriendStatus = document.getElementById('editFriendStatus');
    
    if (editFriendName) editFriendName.value = name;
    if (editFriendStatus) editFriendStatus.value = status;
    if (editFriendModal) editFriendModal.classList.remove('hidden');
}

function searchFriends(query) {
    console.log('Searching friends for:', query);
    if (!query) {
        renderFriends(friends);
        return;
    }
    
    const filteredFriends = friends.filter(friend => 
        friend.displayName.toLowerCase().includes(query.toLowerCase()) ||
        (friend.email && friend.email.toLowerCase().includes(query.toLowerCase())) ||
        (friend.phone && friend.phone.includes(query))
    );
    
    renderFriends(filteredFriends);
    
    const noFriendsMessage = document.getElementById('noFriendsMessage');
    if (noFriendsMessage) {
        if (filteredFriends.length === 0) {
            noFriendsMessage.classList.remove('hidden');
            noFriendsMessage.innerHTML = `
                <i class="fas fa-search text-4xl mb-3 text-gray-300 block"></i>
                <p>No friends found</p>
                <p class="text-sm mt-1">Try a different search term</p>
            `;
        } else {
            noFriendsMessage.classList.add('hidden');
        }
    }
}

// FIXED: Chat Session Management with proper real-time updates
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
            // Create new chat document
            await db.collection('chats').doc(chatId).set({
                participants: [currentUser.uid, friendId],
                participantNames: {
                    [currentUser.uid]: currentUserData.displayName,
                    [friendId]: friendName
                },
                lastMessage: '',
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                typing: {}
            });
        }
        
        // Set current chat
        currentChat = {
            id: chatId,
            friendId: friendId,
            name: friendName
        };
        
        console.log('Current chat set:', currentChat);
        
        // Update UI
        const chatHeader = document.getElementById('chatHeader');
        const inputArea = document.getElementById('inputArea');
        const noMessagesMessage = document.getElementById('noMessagesMessage');
        const chatTitle = document.getElementById('chatTitle');
        const chatAvatar = document.getElementById('chatAvatar');
        
        if (chatHeader) chatHeader.classList.remove('hidden');
        if (inputArea) inputArea.classList.remove('hidden');
        if (noMessagesMessage) noMessagesMessage.classList.add('hidden');
        if (chatTitle) chatTitle.textContent = friendName;
        if (chatAvatar) chatAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=7C3AED&color=fff`;
        
        // Enable message input
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        
        if (messageInput) messageInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        
        // Load messages
        loadMessages(chatId);
        
        // Mark messages as read
        markMessagesAsRead(chatId);
        
        // Hide friend list on mobile
        if (window.innerWidth < 768) {
            const chatListContainer = document.getElementById('chatListContainer');
            if (chatListContainer) chatListContainer.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error starting chat:', error);
        showToast('Error starting chat', 'error');
    }
}
// FIXED: Real-Time Message Loading with proper error handling
function loadMessages(chatId) {
    console.log('Loading messages for chat:', chatId);
    
    // Unsubscribe from previous listeners
    if (unsubscribeMessages) {
        console.log('Unsubscribing from previous message listener');
        unsubscribeMessages();
    }
    if (typingListener) {
        console.log('Unsubscribing from previous typing listener');
        typingListener();
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
    
    // Subscribe to messages for this chat
    unsubscribeMessages = db.collection('messages')
        .where('chatId', '==', chatId)
        .orderBy('timestamp', 'asc')
        .onSnapshot({
            next: (snapshot) => {
                console.log('New messages snapshot:', snapshot.size, 'messages');
                
                if (!messagesContainer) return;
                
                messagesContainer.innerHTML = '';
                
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
                const messages = [];
                
                // First, collect all messages
                snapshot.forEach(doc => {
                    const message = doc.data();
                    messages.push({
                        id: doc.id,
                        ...message
                    });
                });
                
                // Sort by timestamp to ensure correct order
                messages.sort((a, b) => {
                    const timeA = a.timestamp ? a.timestamp.toDate() : new Date(0);
                    const timeB = b.timestamp ? b.timestamp.toDate() : new Date(0);
                    return timeA - timeB;
                });
                
                // Then render them
                messages.forEach(message => {
                    // Check if we need to add a date separator
                    const messageDate = message.timestamp ? message.timestamp.toDate().toDateString() : new Date().toDateString();
                    if (messageDate !== lastDate) {
                        addDateSeparator(messageDate);
                        lastDate = messageDate;
                    }
                    
                    addMessageToUI(message, message.id);
                });
                
                // Scroll to bottom
                setTimeout(() => {
                    if (messagesContainer) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                }, 100);
                
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
                    
                    const typingUsers = Object.keys(typing).filter(userId => typing[userId] === true);
                    
                    const typingUsersElement = document.getElementById('typingUsers');
                    const isTypingElement = document.getElementById('isTyping');
                    
                    if (typingUsersElement && isTypingElement) {
                        if (typingUsers.length > 0) {
                            // Get names of typing users
                            const typingNames = typingUsers.map(userId => {
                                return chatData.participantNames && chatData.participantNames[userId] 
                                    ? chatData.participantNames[userId] 
                                    : 'Someone';
                            });
                            
                            typingUsersElement.textContent = typingNames.join(', ');
                            isTypingElement.classList.remove('hidden');
                        } else {
                            isTypingElement.classList.add('hidden');
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
    
    messageElement.className = `message-container ${isSent ? 'sent' : 'received'}`;
    
    // Check if message has file attachment
    if (message.file) {
        messageElement.innerHTML = `
            <div class="message-bubble ${isSent ? 'message-sent' : 'message-received'}">
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
                <div class="message-time">${messageTime} ${isSent ? statusIcon : ''}</div>
            </div>
        `;
    } else {
        messageElement.innerHTML = `
            <div class="message-bubble ${isSent ? 'message-sent' : 'message-received'}">
                <div class="message-text">${escapeHtml(message.text)}</div>
                <div class="message-time">${messageTime} ${isSent ? statusIcon : ''}</div>
            </div>
        `;
    }
    
    messagesContainer.appendChild(messageElement);
}

// Helper function to get file icon based on file type
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

// Helper function to escape HTML for security
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// FIXED: Send Message with proper real-time updates
// FIXED: Send Message with proper real-time updates
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    
    if (!text || !currentChat) {
        console.log('Cannot send message: no text or no current chat');
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
            status: 'sent'
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
            [`typing.${currentUser.uid}`]: false // Remove typing indicator
        });
        
        console.log('Chat document updated with last message');
        
        // Update message status to delivered for all messages in this chat
        updateMessageStatus(currentChat.id, 'delivered');
        
        // Scroll to bottom
        const messagesContainer = document.getElementById('messagesContainer');
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
        })
        .catch(error => {
            console.error('Error marking messages as read:', error);
        });
}

// FIXED: File/Media Upload with proper error handling
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
        const filePreview = document.getElementById('filePreview');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        const uploadProgressBar = document.getElementById('uploadProgressBar');
        
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
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// FIXED: Load chats with proper real-time updates
function loadChatsTemporary() {
    console.log('Loading chats for user:', currentUser.uid);
    
    if (unsubscribeChats) {
        console.log('Unsubscribing from previous chats listener');
        unsubscribeChats();
    }
    
    const chatList = document.getElementById('chatList');
    const noChatsMessage = document.getElementById('noChatsMessage');
    
    // Safety check - if elements don't exist, return early
    if (!chatList || !noChatsMessage) {
        console.error('Chat list elements not found');
        return;
    }
    
    unsubscribeChats = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot({
            next: (snapshot) => {
                console.log('Chats snapshot received:', snapshot.size, 'chats');
                // Double-check elements still exist
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
                    return timeB - timeA; // Descending order
                });
                
                chats.forEach(chat => {
                    const otherParticipantId = chat.participants.find(id => id !== currentUser.uid);
                    const otherParticipantName = chat.participantNames ? chat.participantNames[otherParticipantId] : 'Unknown User';
                    
                    console.log('Rendering chat with:', otherParticipantName);
                    
                    const chatItem = document.createElement('div');
                    chatItem.className = 'contact-item';
                    chatItem.dataset.chatId = chat.id;
                    chatItem.dataset.otherUserId = otherParticipantId;
                    
                    chatItem.innerHTML = `
                        <div class="contact-avatar">
                            <img class="w-12 h-12 rounded-full object-cover" src="https://ui-avatars.com/api/?name=${encodeURIComponent(otherParticipantName)}&background=7C3AED&color=fff" alt="${otherParticipantName}">
                        </div>
                        <div class="contact-info">
                            <div class="contact-name">${otherParticipantName}</div>
                            <div class="contact-status">${chat.lastMessage || 'No messages yet'}</div>
                        </div>
                        <div class="last-seen">
                            ${chat.lastMessageTime ? formatTimeAgo(chat.lastMessageTime) : ''}
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
                // Check if elements exist before showing toast
                if (document.getElementById('chatList')) {
                    showToast('Error loading chats', 'error');
                }
            }
        });
}

function startCall(friendId, friendName) {
    console.log('Starting call with:', friendName, friendId);
    // For now, just show a toast notification
    showToast(`Calling ${friendName}...`, 'info');
    
    // In a real implementation, you would integrate with a WebRTC service
    // and show the call interface
}

// FIXED: Update Profile with proper error handling
async function updateProfile() {
    try {
        const name = document.getElementById('profileName')?.value.trim();
        const about = document.getElementById('profileAbout')?.value.trim();
        const email = document.getElementById('profileEmail')?.value.trim();
        const phone = document.getElementById('profilePhone')?.value.trim();
        
        if (!name) {
            showToast('Display name is required', 'error');
            return;
        }
        
        console.log('Updating profile for user:', currentUser.uid);
        
        const updates = {
            displayName: name,
            about: about,
            email: email,
            phone: phone,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('users').doc(currentUser.uid).update(updates);
        
        // Update current user data
        currentUserData.displayName = name;
        currentUserData.about = about;
        currentUserData.email = email;
        currentUserData.phone = phone;
        
        // Update UI
        const userName = document.getElementById('userName');
        const settingsUserName = document.getElementById('settingsUserName');
        
        if (userName) userName.textContent = name;
        if (settingsUserName) settingsUserName.textContent = name;
        
        console.log('Profile updated successfully');
        showToast('Profile updated successfully', 'success');
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('Error updating profile', 'error');
    }
}

// FIXED: Upload Profile Picture with proper error handling
async function uploadProfilePicture(file) {
    try {
        console.log('Uploading profile picture');
        showToast('Uploading profile picture...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`profile_pictures/${currentUser.uid}/${file.name}`);
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        // Update user document
        await db.collection('users').doc(currentUser.uid).update({
            photoURL: downloadURL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update current user data
        currentUserData.photoURL = downloadURL;
        
        // Update UI
        const userAvatar = document.getElementById('userAvatar');
        const settingsProfilePic = document.getElementById('settingsProfilePic');
        const profilePicPreview = document.getElementById('profilePicPreview');
        
        if (userAvatar) userAvatar.src = downloadURL;
        if (settingsProfilePic) settingsProfilePic.src = downloadURL;
        if (profilePicPreview) profilePicPreview.src = downloadURL;
        
        console.log('Profile picture updated successfully');
        showToast('Profile picture updated successfully', 'success');
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        showToast('Error uploading profile picture', 'error');
    }
}

// FIXED: Upload Cover Picture with proper error handling
async function uploadCoverPicture(file) {
    try {
        console.log('Uploading cover picture');
        showToast('Uploading cover picture...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`cover_pictures/${currentUser.uid}/${file.name}`);
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        // Update user document
        await db.collection('users').doc(currentUser.uid).update({
            coverURL: downloadURL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update current user data
        currentUserData.coverURL = downloadURL;
        
        // Update UI
        const profileCoverPreview = document.getElementById('profileCoverPreview');
        if (profileCoverPreview) profileCoverPreview.src = downloadURL;
        
        console.log('Cover picture updated successfully');
        showToast('Cover picture updated successfully', 'success');
    } catch (error) {
        console.error('Error uploading cover picture:', error);
        showToast('Error uploading cover picture', 'error');
    }
}

// FIXED: Typing Indicator with proper real-time updates
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

// FIXED: Push Notifications with proper permission handling
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
                // Get FCM token here if needed
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
                // In a real implementation, you would send a push notification
                // through Firebase Cloud Messaging or a server
                console.log(`Sending push notification to ${userId}: ${senderName}: ${message}`);
            }
        }
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}
// FIXED: Add missing toggleMute function
function toggleMute() {
    if (!localStream) return;
    
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        isMuted = !isMuted;
        audioTracks.forEach(track => {
            track.enabled = !isMuted;
        });
        
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            if (isMuted) {
                muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                muteBtn.classList.add('bg-red-500');
                muteBtn.classList.remove('bg-gray-600');
            } else {
                muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                muteBtn.classList.remove('bg-red-500');
                muteBtn.classList.add('bg-gray-600');
            }
        }
        
        showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
    }
}

// FIXED: Add missing toggleVideo function
function toggleVideo() {
    if (!localStream) return;
    
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        isVideoOff = !isVideoOff;
        videoTracks.forEach(track => {
            track.enabled = !isVideoOff;
        });
        
        const videoToggleBtn = document.getElementById('videoToggleBtn');
        if (videoToggleBtn) {
            if (isVideoOff) {
                videoToggleBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
                videoToggleBtn.classList.add('bg-red-500');
                videoToggleBtn.classList.remove('bg-gray-600');
            } else {
                videoToggleBtn.innerHTML = '<i class="fas fa-video"></i>';
                videoToggleBtn.classList.remove('bg-red-500');
                videoToggleBtn.classList.add('bg-gray-600');
            }
        }
        
        showToast(isVideoOff ? 'Video turned off' : 'Video turned on', 'info');
    }
}
// FIXED: Enhanced Event Listeners with proper mobile support
function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Use event delegation for dynamic elements
    // Use event delegation for dynamic elements
document.addEventListener('click', function(e) {
    // Handle message friend buttons (old style - keep for backward compatibility)
    if (e.target.closest('.message-friend')) {
        const btn = e.target.closest('.message-friend');
        const friendId = btn.dataset.id;
        const friendName = btn.dataset.name;
        console.log('Message friend clicked:', friendName, friendId);
        startChat(friendId, friendName);
    }
    
    // Handle call friend buttons (old style - keep for backward compatibility)
    if (e.target.closest('.call-friend')) {
        const btn = e.target.closest('.call-friend');
        const friendId = btn.dataset.id;
        const friendName = btn.dataset.name;
        console.log('Call friend clicked:', friendName, friendId);
        startCall(friendId, friendName);
    }
    
    // Handle edit friend buttons (old style - keep for backward compatibility)
    if (e.target.closest('.edit-friend')) {
        const btn = e.target.closest('.edit-friend');
        const friendId = btn.dataset.id;
        const friendName = btn.dataset.name;
        const friendStatus = btn.dataset.status;
        console.log('Edit friend clicked:', friendName, friendId);
        openEditFriendModal(friendId, friendName, friendStatus);
    }
    
    // New enhanced friend list buttons are handled in renderFriends function
});
    
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
        });
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            console.log('Switching to tab:', tab);
            
            // Update active tab
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('tab-active');
                b.classList.add('text-gray-500');
            });
            btn.classList.add('tab-active');
            btn.classList.remove('text-gray-500');
            
            // Show active tab content
            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.classList.add('hidden');
            });
            const tabPanel = document.getElementById(`${tab}Tab`);
            if (tabPanel) tabPanel.classList.remove('hidden');
        });
    });

    // Settings modal
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            console.log('Opening settings modal');
            if (settingsModal) settingsModal.classList.remove('hidden');
        });
    }

    const closeSettings = document.getElementById('closeSettings');
    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            console.log('Closing settings modal');
            if (settingsModal) settingsModal.classList.add('hidden');
        });
    }

    // Add friend modal
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
        addFriendBtn.addEventListener('click', () => {
            console.log('Opening add friend modal');
            if (addFriendModal) addFriendModal.classList.remove('hidden');
        });
    }

    const cancelFriend = document.getElementById('cancelFriend');
    if (cancelFriend) {
        cancelFriend.addEventListener('click', () => {
            console.log('Closing add friend modal');
            if (addFriendModal) addFriendModal.classList.add('hidden');
        });
    }

    // Friend search
    const friendSearch = document.getElementById('friendSearch');
    if (friendSearch) {
        friendSearch.addEventListener('input', (e) => {
            searchFriends(e.target.value);
        });
    }

    // Enhanced friend search
    const searchFriend = document.getElementById('searchFriend');
    if (searchFriend) {
        searchFriend.addEventListener('click', async () => {
            const friendSearchInput = document.getElementById('friendSearchInput');
            if (!friendSearchInput) return;
            
            const query = friendSearchInput.value.trim();
            if (!query) {
                showToast('Please enter a search term', 'error');
                return;
            }
            
            console.log('Enhanced friend search for:', query);
            const results = await enhancedFriendSearch(query);
            displayEnhancedSearchResults(results);
            if (friendSearchResultsModal) friendSearchResultsModal.classList.remove('hidden');
            if (addFriendModal) addFriendModal.classList.add('hidden');
        });
    }

    const closeEnhancedSearch = document.getElementById('closeEnhancedSearch');
    if (closeEnhancedSearch) {
        closeEnhancedSearch.addEventListener('click', () => {
            console.log('Closing enhanced search');
            if (friendSearchResultsModal) friendSearchResultsModal.classList.add('hidden');
        });
    }

    // Edit friend modal
    const cancelEditFriend = document.getElementById('cancelEditFriend');
    if (cancelEditFriend) {
        cancelEditFriend.addEventListener('click', () => {
            console.log('Closing edit friend modal');
            if (editFriendModal) editFriendModal.classList.add('hidden');
        });
    }

    const messageFriend = document.getElementById('messageFriend');
    if (messageFriend) {
        messageFriend.addEventListener('click', () => {
            const friendId = currentEditingFriendId;
            const editFriendName = document.getElementById('editFriendName');
            const friendName = editFriendName ? editFriendName.value : 'Friend';
            console.log('Message from edit modal:', friendName, friendId);
            startChat(friendId, friendName);
            if (editFriendModal) editFriendModal.classList.add('hidden');
        });
    }

    const callFriend = document.getElementById('callFriend');
    if (callFriend) {
        callFriend.addEventListener('click', () => {
            const friendId = currentEditingFriendId;
            const editFriendName = document.getElementById('editFriendName');
            const friendName = editFriendName ? editFriendName.value : 'Friend';
            console.log('Call from edit modal:', friendName, friendId);
            startCall(friendId, friendName);
            if (editFriendModal) editFriendModal.classList.add('hidden');
        });
    }

    const removeFriend = document.getElementById('removeFriend');
    if (removeFriend) {
        removeFriend.addEventListener('click', () => {
            if (currentEditingFriendId) {
                console.log('Removing friend:', currentEditingFriendId);
                removeFriend(currentEditingFriendId);
                if (editFriendModal) editFriendModal.classList.add('hidden');
            }
        });
    }

    // Profile settings
    const profileSettingsBtn = document.getElementById('profileSettingsBtn');
    if (profileSettingsBtn) {
        profileSettingsBtn.addEventListener('click', () => {
            console.log('Opening profile settings');
            if (profileSettingsModal) profileSettingsModal.classList.remove('hidden');
            if (settingsModal) settingsModal.classList.add('hidden');
        });
    }

    const closeProfileSettings = document.getElementById('closeProfileSettings');
    if (closeProfileSettings) {
        closeProfileSettings.addEventListener('click', () => {
            console.log('Closing profile settings');
            if (profileSettingsModal) profileSettingsModal.classList.add('hidden');
        });
    }

    const saveProfile = document.getElementById('saveProfile');
    if (saveProfile) {
        saveProfile.addEventListener('click', () => {
            console.log('Saving profile');
            updateProfile();
            if (profileSettingsModal) profileSettingsModal.classList.add('hidden');
        });
    }

    const cancelProfile = document.getElementById('cancelProfile');
    if (cancelProfile) {
        cancelProfile.addEventListener('click', () => {
            console.log('Canceling profile edit');
            if (profileSettingsModal) profileSettingsModal.classList.add('hidden');
        });
    }

    // Profile picture upload
    const profilePicUpload = document.getElementById('profilePicUpload');
    if (profilePicUpload) {
        profilePicUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('Profile picture selected for upload');
                uploadProfilePicture(e.target.files[0]);
            }
        });
    }

    const profilePictureUpload = document.getElementById('profilePictureUpload');
    if (profilePictureUpload) {
        profilePictureUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('Profile picture selected for upload (alternative)');
                uploadProfilePicture(e.target.files[0]);
            }
        });
    }

    // Cover picture upload
    const coverPicUpload = document.getElementById('coverPicUpload');
    if (coverPicUpload) {
        coverPicUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('Cover picture selected for upload');
                uploadCoverPicture(e.target.files[0]);
            }
        });
    }

    // Status creation
    const myStatus = document.getElementById('myStatus');
    if (myStatus) {
        myStatus.addEventListener('click', () => {
            console.log('Opening status creation');
            openStatusCreation();
        });
    }

    const closeStatusCreation = document.getElementById('closeStatusCreation');
    if (closeStatusCreation) {
        closeStatusCreation.addEventListener('click', () => {
            console.log('Closing status creation');
            if (statusCreation) statusCreation.style.display = 'none';
        });
    }

    // Status type switching
    document.querySelectorAll('.status-option').forEach(option => {
        option.addEventListener('click', () => {
            const type = option.dataset.type;
            console.log('Status type selected:', type);
            
            // Update active option
            document.querySelectorAll('.status-option').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
            
            // Show corresponding preview
            const emojiPreview = document.getElementById('emojiPreview');
            const textPreview = document.getElementById('textPreview');
            const imagePreview = document.getElementById('imagePreview');
            const videoPreview = document.getElementById('videoPreview');
            const audioPreview = document.getElementById('audioPreview');
            
            if (emojiPreview) emojiPreview.classList.add('hidden');
            if (textPreview) textPreview.classList.add('hidden');
            if (imagePreview) imagePreview.classList.add('hidden');
            if (videoPreview) videoPreview.classList.add('hidden');
            if (audioPreview) audioPreview.classList.add('hidden');
            
            const activePreview = document.getElementById(`${type}Preview`);
            if (activePreview) activePreview.classList.remove('hidden');
        });
    });

    // Post status
    const postStatus = document.getElementById('postStatus');
    if (postStatus) {
        postStatus.addEventListener('click', () => {
            const activeOption = document.querySelector('.status-option.active');
            if (!activeOption) return;
            
            const activeType = activeOption.dataset.type;
            let content = '';
            
            if (activeType === 'emoji') {
                const emojiPreview = document.getElementById('emojiPreview');
                content = emojiPreview ? emojiPreview.textContent : '';
            } else if (activeType === 'text') {
                const statusTextInput = document.getElementById('statusTextInput');
                content = statusTextInput ? statusTextInput.value : '';
            } else if (activeType === 'image') {
                content = 'Image status'; // In real implementation, this would be the image URL
            } else if (activeType === 'video') {
                content = 'Video status'; // In real implementation, this would be the video URL
            } else if (activeType === 'audio') {
                content = 'Audio status'; // In real implementation, this would be the audio URL
            }
            
            if (content) {
                console.log('Posting status:', activeType, content);
                postStatus(activeType, content);
                if (statusCreation) statusCreation.style.display = 'none';
            } else {
                showToast('Please add content to your status', 'error');
            }
        });
    }

    // Back to chats (mobile)
    const backToChats = document.getElementById('backToChats');
    if (backToChats) {
        backToChats.addEventListener('click', () => {
            console.log('Back to chats clicked');
            const chatListContainer = document.getElementById('chatListContainer');
            if (chatListContainer) chatListContainer.classList.remove('hidden');
        });
    }

    // Message input and sending
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', handleTypingIndicator);
        
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && userSettings.chat.enterKeySends) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    // File attachment
    const attachBtn = document.getElementById('attachBtn');
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
    const removeFile = document.getElementById('removeFile');
    if (removeFile) {
        removeFile.addEventListener('click', () => {
            console.log('Remove file preview clicked');
            const filePreview = document.getElementById('filePreview');
            if (filePreview) filePreview.classList.add('hidden');
        });
    }

    // Emoji picker
    const emojiBtn = document.getElementById('emojiBtn');
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

    // Video call
    const videoCallBtn = document.getElementById('videoCallBtn');
    if (videoCallBtn) {
        videoCallBtn.addEventListener('click', startVideoCall);
    }

    // Voice call
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    if (voiceCallBtn) {
        voiceCallBtn.addEventListener('click', startVoiceCall);
    }

    // Call controls
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.addEventListener('click', toggleMute);
    }

    const videoToggleBtn = document.getElementById('videoToggleBtn');
    if (videoToggleBtn) {
        videoToggleBtn.addEventListener('click', toggleVideo);
    }

    const endCallBtn = document.getElementById('endCallBtn');
    if (endCallBtn) {
        endCallBtn.addEventListener('click', endCall);
    }

    // All Friends Modal
    const manageFavorites = document.getElementById('manageFavorites');
    if (manageFavorites) {
        manageFavorites.addEventListener('click', openAllFriendsModal);
    }

    const closeAllFriends = document.getElementById('closeAllFriends');
    if (closeAllFriends) {
        closeAllFriends.addEventListener('click', () => {
            console.log('Closing all friends modal');
            if (allFriendsModal) allFriendsModal.classList.add('hidden');
        });
    }

    // All Friends Search
    const allFriendsSearch = document.getElementById('allFriendsSearch');
    if (allFriendsSearch) {
        allFriendsSearch.addEventListener('input', (e) => {
            searchAllFriends(e.target.value);
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to log out?')) {
                console.log('Logging out user');
                auth.signOut().then(() => {
                    window.location.href = 'login.html';
                }).catch(error => {
                    console.error('Error signing out:', error);
                    showToast('Error signing out', 'error');
                });
            }
        });
    }

    // Add touch event listeners for mobile
    document.addEventListener('touchstart', function(e) {
        // Add active state for touch
        if (e.target.classList.contains('contact-item') || 
            e.target.closest('.contact-item') ||
            e.target.classList.contains('btn') ||
            e.target.closest('.btn')) {
            e.target.style.opacity = '0.7';
        }
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        // Remove active state
        if (e.target.classList.contains('contact-item') || 
            e.target.closest('.contact-item') ||
            e.target.classList.contains('btn') ||
            e.target.closest('.btn')) {
            e.target.style.opacity = '';
        }
    }, { passive: true });

    console.log('Event listeners setup completed');
}
// Enhanced Friend Search with Multiple Options
async function enhancedFriendSearch(query) {
    if (!query) return [];
    
    console.log('Enhanced friend search for:', query);
    const results = await searchUsers(query);
    return results;
}

function displayEnhancedSearchResults(results) {
    const enhancedSearchResults = document.getElementById('enhancedSearchResults');
    if (!enhancedSearchResults) return;
    
    enhancedSearchResults.innerHTML = '';
    
    if (results.length === 0) {
        enhancedSearchResults.innerHTML = '<p class="text-center text-gray-500 py-4">No users found</p>';
        return;
    }
    
    console.log('Displaying', results.length, 'search results');
    
    results.forEach(user => {
        const resultItem = document.createElement('div');
        resultItem.className = 'flex items-center p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer';
        resultItem.innerHTML = `
            <img class="w-10 h-10 rounded-full mr-3" src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff`}" alt="${user.displayName}">
            <div class="flex-1">
                <p class="font-medium">${user.displayName}</p>
                <p class="text-sm text-gray-500">${user.email || user.phone || ''}</p>
            </div>
            <div class="flex space-x-2">
                <button class="bg-purple-600 text-white px-3 py-1 rounded-lg add-friend" data-id="${user.id}" data-name="${user.displayName}">
                    <i class="fas fa-user-plus"></i>
                </button>
                <button class="bg-green-600 text-white px-3 py-1 rounded-lg message-user" data-id="${user.id}" data-name="${user.displayName}">
                    <i class="fas fa-comment"></i>
                </button>
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
            console.log('Add friend from search results:', userName, userId);
            sendFriendRequest(userId);
            if (friendSearchResultsModal) friendSearchResultsModal.classList.add('hidden');
            showToast(`Friend request sent to ${userName}`, 'success');
        }
        
        if (e.target.closest('.message-user')) {
            const btn = e.target.closest('.message-user');
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            console.log('Message user from search results:', userName, userId);
            startChat(userId, userName);
            if (friendSearchResultsModal) friendSearchResultsModal.classList.add('hidden');
        }
    });
}

// Initialize emoji picker
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
                const messageInput = document.getElementById('messageInput');
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

// WebRTC Call Implementation
// FIXED: WebRTC Call Implementation with proper permission handling
async function startVideoCall() {
    if (!currentChat) {
        showToast('Please select a chat first', 'error');
        return;
    }

    try {
        console.log('Starting video call with:', currentChat.name);
        showToast('Starting video call...', 'info');
        
        // Check if browser supports media devices
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support video calling');
        }
        
        // Request camera and microphone permissions with better error handling
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        
        console.log('Requesting media permissions with constraints:', constraints);
        
        // Get user media with proper error handling
        localStream = await navigator.mediaDevices.getUserMedia(constraints)
            .catch(error => {
                console.error('getUserMedia error:', error);
                
                // Handle specific permission errors
                if (error.name === 'NotAllowedError') {
                    throw new Error('Camera/microphone access was denied. Please allow permissions in your browser settings and try again.');
                } else if (error.name === 'NotFoundError') {
                    throw new Error('No camera found. Please check if your camera is connected properly.');
                } else if (error.name === 'NotSupportedError') {
                    throw new Error('Your browser does not support video calling. Please try using Chrome, Firefox, or Edge.');
                } else if (error.name === 'NotReadableError') {
                    throw new Error('Camera is already in use by another application. Please close other apps using the camera.');
                } else {
                    throw new Error(`Cannot access camera: ${error.message}`);
                }
            });
        
        console.log('Media permissions granted, stream obtained:', localStream);
        
        // Display local video stream
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true; // Mute local video to avoid echo
        }
        
        // Show call container
        const videoCallContainer = document.getElementById('videoCallContainer');
        if (videoCallContainer) {
            videoCallContainer.style.display = 'block';
            // Add a small delay to ensure video element is ready
            setTimeout(() => {
                if (localVideo) {
                    localVideo.play().catch(e => console.warn('Video play warning:', e));
                }
            }, 100);
        }
        
        // Set call state
        isInCall = true;
        isMuted = false;
        isVideoOff = false;
        
        console.log('Video call started successfully');
        showToast(`Video call started with ${currentChat.name}`, 'success');
        
        // In a real app, you would signal the other user here
        // For demo purposes, we'll simulate the call setup
        simulateCallSetup();
        
    } catch (error) {
        console.error('Error starting video call:', error);
        
        // Show user-friendly error messages
        let errorMessage = 'Error starting video call. ';
        
        if (error.message.includes('denied')) {
            errorMessage += 'Please allow camera and microphone permissions in your browser settings.';
            showPermissionInstructions();
        } else if (error.message.includes('No camera')) {
            errorMessage += 'No camera detected. Please check your camera connection.';
        } else if (error.message.includes('already in use')) {
            errorMessage += 'Camera is busy. Please close other applications using the camera.';
        } else {
            errorMessage += error.message;
        }
        
        showToast(errorMessage, 'error');
    }
}

async function startVoiceCall() {
    if (!currentChat) {
        showToast('Please select a chat first', 'error');
        return;
    }

    try {
        console.log('Starting voice call with:', currentChat.name);
        showToast('Starting voice call...', 'info');
        
        // Check if browser supports media devices
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support voice calling');
        }
        
        // Request only microphone permissions
        const constraints = {
            video: false,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            }
        };
        
        console.log('Requesting audio permissions with constraints:', constraints);
        
        // Get user media with proper error handling
        localStream = await navigator.mediaDevices.getUserMedia(constraints)
            .catch(error => {
                console.error('getUserMedia error:', error);
                
                // Handle specific permission errors
                if (error.name === 'NotAllowedError') {
                    throw new Error('Microphone access was denied. Please allow permissions in your browser settings and try again.');
                } else if (error.name === 'NotFoundError') {
                    throw new Error('No microphone found. Please check your audio device.');
                } else if (error.name === 'NotSupportedError') {
                    throw new Error('Your browser does not support voice calling.');
                } else if (error.name === 'NotReadableError') {
                    throw new Error('Microphone is already in use by another application.');
                } else {
                    throw new Error(`Cannot access microphone: ${error.message}`);
                }
            });
        
        console.log('Audio permissions granted, stream obtained:', localStream);
        
        // Show call container (voice call mode)
        const videoCallContainer = document.getElementById('videoCallContainer');
        if (videoCallContainer) {
            videoCallContainer.style.display = 'block';
            // Update UI for voice call
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.style.display = 'none'; // Hide video for voice call
            }
            
            // Show voice call indicator
            const callInfo = document.createElement('div');
            callInfo.id = 'voiceCallInfo';
            callInfo.innerHTML = `
                <div class="text-center text-white p-4">
                    <i class="fas fa-phone text-4xl mb-2"></i>
                    <p class="text-lg">Voice Call with ${currentChat.name}</p>
                    <p class="text-sm opacity-75">Call in progress...</p>
                </div>
            `;
            videoCallContainer.appendChild(callInfo);
        }
        
        // Set call state
        isInCall = true;
        isMuted = false;
        isVideoOff = true; // Voice call has no video
        
        console.log('Voice call started successfully');
        showToast(`Voice call started with ${currentChat.name}`, 'success');
        
        // In a real app, you would signal the other user here
        simulateCallSetup();
        
    } catch (error) {
        console.error('Error starting voice call:', error);
        
        // Show user-friendly error messages
        let errorMessage = 'Error starting voice call. ';
        
        if (error.message.includes('denied')) {
            errorMessage += 'Please allow microphone permissions in your browser settings.';
            showPermissionInstructions();
        } else if (error.message.includes('No microphone')) {
            errorMessage += 'No microphone detected. Please check your audio device.';
        } else if (error.message.includes('already in use')) {
            errorMessage += 'Microphone is busy. Please close other applications using the microphone.';
        } else {
            errorMessage += error.message;
        }
        
        showToast(errorMessage, 'error');
    }
}

// Helper function to show permission instructions
function showPermissionInstructions() {
    const instructions = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-3">
            <h4 class="font-semibold text-yellow-800 mb-2">How to enable permissions:</h4>
            <ul class="text-sm text-yellow-700 list-disc list-inside space-y-1">
                <li>Look for the camera/microphone icon in your browser's address bar</li>
                <li>Click the icon and select "Allow" for camera and microphone</li>
                <li>Refresh the page and try again</li>
                <li>If using HTTPS, ensure the site is trusted</li>
            </ul>
        </div>
    `;
    
    // You can show this in a modal or as part of the toast
    console.log('Permission instructions:', instructions);
    
    // Optionally show a modal with instructions
    showPermissionModal();
}

// Function to show permission help modal
function showPermissionModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 class="text-lg font-semibold mb-3">Camera & Microphone Permissions Required</h3>
            <p class="text-gray-600 mb-4">To make calls, please allow camera and microphone access:</p>
            <div class="bg-gray-50 p-4 rounded-lg mb-4">
                <h4 class="font-medium mb-2">Instructions:</h4>
                <ul class="text-sm text-gray-600 list-disc list-inside space-y-1">
                    <li>Look for the camera/microphone icon in your browser's address bar</li>
                    <li>Click the icon and select "Allow"</li>
                    <li>Refresh the page and try the call again</li>
                    <li>Ensure you're using HTTPS (required for media permissions)</li>
                </ul>
            </div>
            <div class="flex justify-end space-x-3">
                <button id="closePermissionHelp" class="px-4 py-2 text-gray-600 hover:text-gray-800">Close</button>
                <button id="retryCall" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Retry Call</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelector('#closePermissionHelp').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#retryCall').addEventListener('click', () => {
        document.body.removeChild(modal);
        // Retry the last call (you might want to store the last call type)
        if (currentChat) {
            startVideoCall(); // or startVoiceCall() based on context
        }
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Simulate call setup for demo purposes
function simulateCallSetup() {
    console.log('Simulating call setup...');
    // In a real implementation, this would set up WebRTC peer connection
    // and signal the other user through Firebase or a signaling server
}

// Also update the endCall function to handle voice call cleanup
function endCall() {
    console.log('Ending call');
    
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }
    
    // Hide call container
    const videoCallContainer = document.getElementById('videoCallContainer');
    if (videoCallContainer) {
        videoCallContainer.style.display = 'none';
        
        // Clean up voice call info if exists
        const voiceCallInfo = document.getElementById('voiceCallInfo');
        if (voiceCallInfo) {
            voiceCallInfo.remove();
        }
        
        // Show local video again if it was hidden
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.style.display = 'block';
            localVideo.srcObject = null;
        }
    }
    
    // Reset call state
    isInCall = false;
    isMuted = false;
    isVideoOff = false;
    
    // Reset button states
    const muteBtn = document.getElementById('muteBtn');
    const videoToggleBtn = document.getElementById('videoToggleBtn');
    if (muteBtn) muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    if (videoToggleBtn) videoToggleBtn.innerHTML = '<i class="fas fa-video"></i>';
    
    showToast('Call ended', 'info');
}

// All Friends Display Implementation
function openAllFriendsModal() {
    console.log('Opening all friends modal');
    if (allFriendsModal) allFriendsModal.classList.remove('hidden');
    renderAllFriends();
}

function renderAllFriends() {
    const allFriendsList = document.getElementById('allFriendsList');
    const noAllFriendsMessage = document.getElementById('noAllFriendsMessage');
    
    if (!allFriendsList || !noAllFriendsMessage) return;
    
    allFriendsList.innerHTML = '';
    
    if (friends.length === 0) {
        noAllFriendsMessage.classList.remove('hidden');
        return;
    }
    
    noAllFriendsMessage.classList.add('hidden');
    
    console.log('Rendering', friends.length, 'friends in all friends modal');
    
    friends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'contact-item';
        friendItem.dataset.friendId = friend.id;
        friendItem.innerHTML = `
            <div class="contact-avatar">
                <img class="w-12 h-12 rounded-full object-cover" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                ${friend.status === 'online' ? '<div class="online-indicator"></div>' : ''}
            </div>
            <div class="contact-info">
                <div class="contact-name">${friend.displayName}</div>
                <div class="contact-status">${friend.status || 'offline'}</div>
            </div>
            <div class="flex space-x-2">
                <button class="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center hover:bg-purple-200 transition-colors message-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors call-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        `;
        
        allFriendsList.appendChild(friendItem);
    });

    // Use event delegation for dynamic buttons
    allFriendsList.addEventListener('click', function(e) {
        if (e.target.closest('.message-friend-all')) {
            const btn = e.target.closest('.message-friend-all');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Message friend from all friends:', friendName, friendId);
            startChat(friendId, friendName);
            if (allFriendsModal) allFriendsModal.classList.add('hidden');
        }
        
        if (e.target.closest('.call-friend-all')) {
            const btn = e.target.closest('.call-friend-all');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Call friend from all friends:', friendName, friendId);
            startCall(friendId, friendName);
        }
    });
}

function searchAllFriends(query) {
    const allFriendsList = document.getElementById('allFriendsList');
    const noAllFriendsMessage = document.getElementById('noAllFriendsMessage');
    
    if (!allFriendsList || !noAllFriendsMessage) return;
    
    if (!query) {
        renderAllFriends();
        return;
    }
    
    const filteredFriends = friends.filter(friend => 
        friend.displayName.toLowerCase().includes(query.toLowerCase()) ||
        (friend.email && friend.email.toLowerCase().includes(query.toLowerCase())) ||
        (friend.phone && friend.phone.includes(query))
    );
    
    allFriendsList.innerHTML = '';
    
    if (filteredFriends.length === 0) {
        noAllFriendsMessage.classList.remove('hidden');
        noAllFriendsMessage.innerHTML = `
            <i class="fas fa-search text-4xl mb-3 text-gray-300 block"></i>
            <p>No friends found</p>
            <p class="text-sm mt-1">Try a different search term</p>
        `;
        return;
    }
    
    noAllFriendsMessage.classList.add('hidden');
    
    console.log('Displaying', filteredFriends.length, 'filtered friends');
    
    filteredFriends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'contact-item';
        friendItem.dataset.friendId = friend.id;
        friendItem.innerHTML = `
            <div class="contact-avatar">
                <img class="w-12 h-12 rounded-full object-cover" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                ${friend.status === 'online' ? '<div class="online-indicator"></div>' : ''}
            </div>
            <div class="contact-info">
                <div class="contact-name">${friend.displayName}</div>
                <div class="contact-status">${friend.status || 'offline'}</div>
            </div>
            <div class="flex space-x-2">
                <button class="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center hover:bg-purple-200 transition-colors message-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors call-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        `;
        
        allFriendsList.appendChild(friendItem);
    });

    // Re-add event listeners using event delegation
    allFriendsList.addEventListener('click', function(e) {
        if (e.target.closest('.message-friend-all')) {
            const btn = e.target.closest('.message-friend-all');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Message friend from filtered results:', friendName, friendId);
            startChat(friendId, friendName);
            if (allFriendsModal) allFriendsModal.classList.add('hidden');
        }
        
        if (e.target.closest('.call-friend-all')) {
            const btn = e.target.closest('.call-friend-all');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Call friend from filtered results:', friendName, friendId);
            startCall(friendId, friendName);
        }
    });
}

// Add mobile-specific optimizations
function optimizeForMobile() {
    // Prevent zoom on input focus
    document.addEventListener('touchstart', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            document.body.style.zoom = '100%';
        }
    }, { passive: true });

    // Improve touch scrolling
    document.addEventListener('touchmove', function(e) {
        // Allow natural scrolling
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

console.log('Chat application JavaScript loaded successfully');