
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

// In chat.js, change these variable declarations:
window.callState = {
    isCaller: false,
    isReceivingCall: false,
    callType: null,
    remoteUserId: null,
    callId: null,
    callStartTime: null
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

// Global Variables
let currentUser = null;
let currentUserData = null;
let currentChat = null;
let currentChatId = null;
let unsubscribeIncomingCalls = null;
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
const emojiPicker = document.getElementById('emojiPicker');
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

// ADD NETWORK STATUS DETECTION
function setupNetworkMonitoring() {
    // Handle online/offline events
    window.addEventListener('online', () => {
        console.log('App is online');
        showToast('Connection restored', 'success');
        // Try to reconnect Firestore
        firebase.firestore().enableNetwork().then(() => {
            console.log('Firestore reconnected');
            // Reload user data
            if (currentUser) {
                loadUserData();
            }
        });
    });

    window.addEventListener('offline', () => {
        console.log('App is offline');
        showToast('You are offline', 'warning');
    });

    // Initial check
    if (!navigator.onLine) {
        showToast('You are currently offline', 'warning');
    }
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
    setupImageErrorHandling();
    setupGlobalErrorHandling();
    setupNetworkMonitoring();
    setupRingtoneSettings();
    fixAllBrokenImages();

    // Initialize call system
    if (window.initializeCallSystem) {
        window.initializeCallSystem();
    }

    // FIXED: Add modal event listeners early so buttons work immediately
    setupModalEventListeners();

    // Check if user is logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('User authenticated:', user.uid);
            currentUser = user;
            
            // 🔥 Notify call.js that user is authenticated
            if (window.onUserAuthenticated) {
                window.onUserAuthenticated();
            }
            
            loadUserData();
        } else {
            // User signed out
            window.location.href = 'index.html';
        }
    });
}
function getDefaultAvatar(name = 'User') {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff`;
}

// Update your getDefaultCover function:
function getDefaultCover() {
    return 'data:image/svg+xml;base64,' + btoa(`
        <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#7C3AED"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
                  font-family="Arial" font-size="20" fill="white">Cover Image</text>
        </svg>
    `);
}

// FIXED: Comprehensive Image Error Handling
function setupImageErrorHandling() {
    // Handle all image loading errors
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            console.log('Image failed to load:', e.target.src);
            
            // Don't try to fix data URLs or already fixed images
            if (e.target.src.startsWith('data:') || e.target.classList.contains('error-handled')) {
                return;
            }
            
            // Skip empty preview images
            if ((e.target.src === '' || !e.target.src) && 
                (e.target.alt.includes('preview') || e.target.alt.includes('Preview') || 
                 e.target.classList.contains('hidden'))) {
                console.log('Skipping empty preview image error');
                return;
            }
            
            // Set fallback based on context
            if (e.target.src.includes('IMAGE_URL') || 
                !e.target.src || 
                e.target.src.includes('127.0.0.1') ||
                e.target.src.includes('chat.html') ||
                !e.target.src.startsWith('http') ||
                e.target.src === 'http://127.0.0.1:5500/IMAGE_URL') {
                
                const userName = e.target.alt || 'User';
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=7C3AED&color=fff`;
                console.log('Fixed broken image with fallback:', userName);
            }
            
            e.target.classList.add('error-handled');
        }
    }, true);
}

function setupFriendEventListeners() {
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;

    // Event delegation for all friend actions
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
            
            // Check if call system is available
            if (window.startVoiceCallWithFriend) {
                startVoiceCallWithFriend(friendId, friendName);
            } else {
                console.error('Call system not initialized');
                showToast('Call feature not available', 'error');
            }
        }

        
        // Video call button
        if (e.target.closest('.friend-video-call-btn')) {
            const btn = e.target.closest('.friend-video-call-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Video calling:', friendName, friendId);
            
            // Check if call system is available
            if (window.startVideoCallWithFriend) {
                startVideoCallWithFriend(friendId, friendName);
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

function setupRingtoneSettings() {
    console.log('Setting up ringtone settings...');
    
    const ringtoneSelect = document.getElementById('ringtoneSelect');
    if (!ringtoneSelect) {
        console.log('Ringtone select element not found');
        return;
    }
    
    // Available ringtones
    const ringtones = [
        { id: 'default', name: 'Default Beep', file: null },
        { id: 'classic', name: 'Classic Ring', file: 'classic_ring.mp3' },
        { id: 'digital', name: 'Digital Tone', file: 'digital_tone.mp3' },
        { id: 'melody', name: 'Melody', file: 'melody.mp3' }
    ];
    
    // Clear existing options
    ringtoneSelect.innerHTML = '';
    
    // Populate select
    ringtones.forEach(ringtone => {
        const option = document.createElement('option');
        option.value = ringtone.id;
        option.textContent = ringtone.name;
        ringtoneSelect.appendChild(option);
    });
    
    // Load saved ringtone
    const savedRingtone = localStorage.getItem('kynecta-ringtone') || 'default';
    ringtoneSelect.value = savedRingtone;
    
    // Save on change
    ringtoneSelect.addEventListener('change', function() {
        localStorage.setItem('kynecta-ringtone', this.value);
        showToast('Ringtone setting saved', 'success');
    });
    
    console.log('✅ Ringtone settings initialized');
}

async function loadUserData() {
    try {
        console.log('Loading user data for:', currentUser.uid);

        console.log('Performing comprehensive cleanup...');

       
        

        // 6. Unsubscribe from listeners
        if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
        if (unsubscribeChats) { unsubscribeChats(); unsubscribeChats = null; }
        if (typingListener) { typingListener(); typingListener = null; }

        // 7. Clear typing timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
        }

        // 8. Reset chat state
        currentChat = null;
        currentChatId = null;

        console.log('Cleanup completed. Starting user data load...');

        // Load user document
        const userDoc = await db.collection('users').doc(currentUser.uid).get();

        if (userDoc.exists) {
            currentUserData = userDoc.data();

            console.log('User data loaded:', {
                displayName: currentUserData.displayName,
                email: currentUserData.email,
                status: currentUserData.status
            });

            initializeUserData();

        } else {
            console.log('Creating new user document');

            currentUserData = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email.split('@')[0],
                photoURL: currentUser.photoURL ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        currentUser.displayName || currentUser.email
                    )}&background=7C3AED&color=fff`,
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

        // Update status
        await db.collection('users').doc(currentUser.uid).update({
            status: 'online',
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Load UI & listeners
        showChatApp();
        setupEventListeners();
        loadUserSettings();
        loadFriends();
        loadAllUsers();
        initEmojiPicker();
        loadChatsTemporary();
        requestNotificationPermission();
        setupToolsListeners();
        listenForFriendRequests();
        
        // ==================== STALE CALL CLEANUP ON STARTUP ====================

       
        // Initialize business fields
        initializeBusinessDocument(currentUser.uid);

    } catch (error) {
        console.error('Error in loadUserData:', error);
    }
}

// KEEP YOUR ORIGINAL initializeUserData
function initializeUserData() {
    console.log('Initializing UI with user data');

    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    if (userName) userName.textContent = currentUserData.displayName;
    if (userAvatar) userAvatar.src = currentUserData.photoURL;

    const settingsUserName = document.getElementById('settingsUserName');
    const settingsProfilePic = document.getElementById('settingsProfilePic');
    if (settingsUserName) settingsUserName.textContent = currentUserData.displayName;
    if (settingsProfilePic) settingsProfilePic.src = currentUserData.photoURL;

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
    try {
        // Try to load from localStorage first
        const savedSettings = localStorage.getItem('kynecta-settings');
        if (savedSettings) {
            userSettings = JSON.parse(savedSettings);
            console.log('Settings loaded from localStorage');
        }
        
        // Then try to load from Firestore
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).get().then(doc => {
                if (doc.exists && doc.data().settings) {
                    userSettings = { ...userSettings, ...doc.data().settings };
                    console.log('Settings loaded from Firestore');
                    
                    // Save merged settings back to localStorage
                    localStorage.setItem('kynecta-settings', JSON.stringify(userSettings));
                }
                
                // Apply settings and update UI
                applyUserSettings();
                updateSettingsUI();
            }).catch(error => {
                console.error('Error loading settings from Firestore:', error);
                // Still apply whatever settings we have
                applyUserSettings();
                updateSettingsUI();
            });
        } else {
            // Apply settings for non-logged in users
            applyUserSettings();
            updateSettingsUI();
        }
        
    } catch (error) {
        console.error('Error loading settings:', error);
        // Use default settings
        userSettings = getDefaultSettings();
        applyUserSettings();
    }
}

// NEW FUNCTION: Update Settings UI with current values
function updateSettingsUI() {
    if (!userSettings) {
        console.log('No user settings to update UI');
        return;
    }
    
    console.log('Updating settings UI...');
    
    // Update theme selector
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = userSettings.chat?.displayTheme || 'light';
        console.log('Theme selector updated:', themeSelect.value);
    }
    
    // Update notification toggles
    const notificationToggle = document.getElementById('notificationToggle');
    if (notificationToggle) {
        notificationToggle.checked = userSettings.security?.notifications !== false;
    }
    
    // Update privacy settings
    const lastSeenPrivacy = document.getElementById('lastSeenPrivacy');
    if (lastSeenPrivacy) {
        lastSeenPrivacy.value = userSettings.privacy?.lastSeen || 'everyone';
    }
    
    const readReceiptsPrivacy = document.getElementById('readReceiptsPrivacy');
    if (readReceiptsPrivacy) {
        readReceiptsPrivacy.checked = userSettings.privacy?.readReceipts !== false;
    }
    
    // Update chat settings
    const enterKeySendsToggle = document.getElementById('enterKeySendsToggle');
    if (enterKeySendsToggle) {
        enterKeySendsToggle.checked = userSettings.chat?.enterKeySends !== false;
    }
    
    // Update accessibility settings
    const largeTextToggle = document.getElementById('largeTextToggle');
    if (largeTextToggle) {
        largeTextToggle.checked = userSettings.accessibility?.largeText || false;
    }
    
    const highContrastToggle = document.getElementById('highContrastToggle');
    if (highContrastToggle) {
        highContrastToggle.checked = userSettings.accessibility?.highContrast || false;
    }
    
    // Update font size selector
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    if (fontSizeSelect) {
        fontSizeSelect.value = userSettings.chat?.fontSize || 'medium';
    }
    
    console.log('Settings UI updated successfully');
}

// NEW FUNCTION: Get default settings
function getDefaultSettings() {
    return {
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
}

// NEW FUNCTION: Save all settings
function saveSettings() {
    try {
        console.log('Saving settings...');
        
        // Collect all settings from the UI
        const settings = {
            security: {
                notifications: document.getElementById('notificationToggle')?.checked ?? true,
                passkeys: document.getElementById('passkeyToggle')?.checked ?? false,
                twoStepVerification: document.getElementById('twoStepToggle')?.checked ?? false
            },
            privacy: {
                lastSeen: document.getElementById('lastSeenPrivacy')?.value || 'everyone',
                profilePhoto: document.getElementById('profilePhotoPrivacy')?.value || 'everyone',
                about: document.getElementById('aboutPrivacy')?.value || 'everyone',
                status: document.getElementById('statusPrivacy')?.value || 'everyone',
                readReceipts: document.getElementById('readReceiptsPrivacy')?.checked ?? true,
                disappearingMessages: document.getElementById('disappearingMessagesPrivacy')?.value || 'off',
                calls: document.getElementById('callsPrivacy')?.value || 'everyone'
            },
            chat: {
                displayTheme: document.getElementById('themeSelect')?.value || 'light',
                defaultChatTheme: document.getElementById('chatThemeSelect')?.value || 'purple',
                fontSize: document.getElementById('fontSizeSelect')?.value || 'medium',
                enterKeySends: document.getElementById('enterKeySendsToggle')?.checked ?? true,
                mediaVisibility: document.getElementById('mediaVisibilityToggle')?.checked ?? true
            },
            accessibility: {
                largeText: document.getElementById('largeTextToggle')?.checked ?? false,
                highContrast: document.getElementById('highContrastToggle')?.checked ?? false,
                screenReader: document.getElementById('screenReaderToggle')?.checked ?? true,
                reducedMotion: document.getElementById('reducedMotionToggle')?.checked ?? false,
                voiceControl: document.getElementById('voiceControlToggle')?.checked ?? false
            }
        };

        // Save to localStorage
        localStorage.setItem('kynecta-settings', JSON.stringify(settings));
        
        // Update global settings object
        userSettings = settings;
        
        // Apply settings immediately
        applyUserSettings();
        
        // Save to Firestore if user is logged in
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).update({
                settings: settings,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(error => {
                console.error('Error saving settings to Firestore:', error);
            });
        }
        
        showToast('Settings saved successfully!', 'success');
        return true;
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
        return false;
    }
}
function saveUserSettings() {
    localStorage.setItem('kynecta-settings', JSON.stringify(userSettings));
}

function applyUserSettings() {
    if (!userSettings) return;
    
    // Apply theme
    setTheme(userSettings.chat.displayTheme);
    
    // Apply font size
    document.body.style.fontSize = userSettings.accessibility.largeText ? '18px' : '16px';
    
    // Apply high contrast
    if (userSettings.accessibility.highContrast) {
        document.body.classList.add('high-contrast');
    } else {
        document.body.classList.remove('high-contrast');
    }
    
    // Apply reduced motion
    if (userSettings.accessibility.reducedMotion) {
        document.body.classList.add('reduce-motion');
    } else {
        document.body.classList.remove('reduce-motion');
    }
    
    // Update enter key behavior
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        if (userSettings.chat.enterKeySends) {
            messageInput.setAttribute('data-enter-sends', 'true');
        } else {
            messageInput.setAttribute('data-enter-sends', 'false');
        }
    }
    
    console.log('Settings applied successfully');
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
// Audio Recording Implementation
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

function setupAudioRecording() {
    const recordBtn = document.getElementById('recordBtn'); // Add this button to your UI
    
    if (recordBtn) {
        recordBtn.addEventListener('click', toggleRecording);
    }
}

async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            sendAudioMessage(audioBlob);
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        // Update UI to show recording state
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
            recordBtn.classList.add('recording');
        }
        
        showToast("🎤 Recording... Click again to stop", "info");
        
    } catch (error) {
        console.error("Error starting recording:", error);
        showToast("Error accessing microphone", "error");
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI back to normal
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            recordBtn.classList.remove('recording');
        }
        
        showToast("✅ Recording sent", "success");
    }
}

async function sendAudioMessage(audioBlob) {
    if (!currentChatId) return;
    
    try {
        // Upload audio to storage
        const storageRef = firebase.storage().ref();
        const audioRef = storageRef.child(`audio_messages/${currentChatId}/${Date.now()}.wav`);
        
        const snapshot = await audioRef.put(audioBlob);
        const audioUrl = await snapshot.ref.getDownloadURL();
        
        // Create message
        const message = {
            text: "Audio message",
            senderId: currentUser.uid,
            senderName: currentUserData.displayName,
            chatId: currentChatId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            type: 'audio',
            audio: {
                url: audioUrl,
                duration: 0 // You can calculate this
            }
        };
        
        await firebase.firestore().collection('messages').add(message);
        
        // Update chat
        await firebase.firestore().collection('chats').doc(currentChatId).update({
            lastMessage: "🎤 Audio message",
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error("Error sending audio message:", error);
        showToast("Error sending audio message", "error");
    }
}

// ADD THIS near top of file after variable declarations
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
                        <img class="w-14 h-14 rounded-full object-cover border-2 border-purple-200 friend-avatar" 
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
                
                <div class="flex items-center space-x-3 ml-4">
                    <!-- Voice Call Button with new HTML structure -->
                    <i class="fas fa-phone text-xl cursor-pointer hover:scale-110 transition-transform friend-call-btn" 
                       data-id="${friend.id}" 
                       data-name="${friend.displayName}"
                       title="Voice Call"></i>
                    
                    <!-- Video Call Button with new HTML structure -->
                    <i class="fas fa-video text-xl cursor-pointer hover:scale-110 transition-transform friend-video-call-btn" 
                       data-id="${friend.id}" 
                       data-name="${friend.displayName}"
                       title="Video Call"></i>
                    
                    <!-- Chat Button with new structure -->
                    <i class="fas fa-comment text-xl cursor-pointer hover:scale-110 transition-transform friend-chat-btn" 
                       data-id="${friend.id}" 
                       data-name="${friend.displayName}"
                       title="Chat"></i>
                    
                    <!-- More Options Button -->
                    <div class="relative">
                        <i class="fas fa-ellipsis-v text-xl cursor-pointer hover:scale-110 transition-transform friend-options-btn"></i>
                        <div class="friend-options-menu absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10 hidden min-w-32">
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
        
        const avatar = friendItem.querySelector('.friend-avatar');
        safeImageLoad(avatar, friend.photoURL, friend.displayName);
        friendsList.appendChild(friendItem);
    });

    // Add event listeners using event delegation
    friendsList.addEventListener('click', function(e) {
        // Voice Call button
        if (e.target.classList.contains('friend-call-btn') || e.target.closest('.friend-call-btn')) {
            const btn = e.target.classList.contains('friend-call-btn') ? e.target : e.target.closest('.friend-call-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('📞 Voice call clicked:', friendName, friendId);
            
            // Check if call system is ready
            if (window.startVoiceCallWithFriend) {
                window.startVoiceCallWithFriend(friendId, friendName);
            } else {
                console.error('❌ Call system not initialized');
                showToast('Call system not ready. Please refresh the page.', 'error');
            }
        }
        
        // Video Call button
        if (e.target.classList.contains('friend-video-call-btn') || e.target.closest('.friend-video-call-btn')) {
            const btn = e.target.classList.contains('friend-video-call-btn') ? e.target : e.target.closest('.friend-video-call-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('🎥 Video call clicked:', friendName, friendId);
            
            // Check if call system is ready
            if (window.startVideoCallWithFriend) {
                window.startVideoCallWithFriend(friendId, friendName);
            } else {
                console.error('❌ Call system not initialized');
                showToast('Call system not ready. Please refresh the page.', 'error');
            }
        }
        
        // Chat button
        if (e.target.classList.contains('friend-chat-btn') || e.target.closest('.friend-chat-btn')) {
            const btn = e.target.classList.contains('friend-chat-btn') ? e.target : e.target.closest('.friend-chat-btn');
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            console.log('Starting chat with:', friendName, friendId);
            startChat(friendId, friendName);
        }
        
        // Options button toggle
        if (e.target.classList.contains('friend-options-btn') || e.target.closest('.friend-options-btn')) {
            const btn = e.target.classList.contains('friend-options-btn') ? e.target : e.target.closest('.friend-options-btn');
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
    
    console.log('✅ Friends rendered with new icon buttons');
}
// In chat.js, after friends are rendered, add:
window.dispatchEvent(new CustomEvent('friendsRendered'));

// Then in call.js, listen for this event:
window.addEventListener('friendsRendered', () => {
    console.log('🎯 Friends rendered, adding call buttons');
    setTimeout(() => {
        window.addCallButtonsToFriendList();
        window.addCallButtonsToChat();
    }, 100);
});


// Add this to your setupEventListeners function or initApp
function fixChatInputSize() {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.style.minHeight = '60px';
        messageInput.style.padding = '15px';
        messageInput.style.fontSize = '16px';
        messageInput.style.lineHeight = '1.5';
    }
    
    const inputArea = document.getElementById('inputArea');
    if (inputArea) {
        inputArea.style.minHeight = '80px';
        inputArea.style.padding = '10px';
    }
}

// Call this function in your initApp
document.addEventListener('DOMContentLoaded', function() {
    fixChatInputSize();
});


function viewFriendProfile(friendId) {
    console.log('Viewing friend profile:', friendId);
   if (friend.features && Object.keys(friend.features).length > 0) {
    renderFeatures(friend.features); // existing function to show actual features
} else {
    // Only show "coming soon" if truly empty
    document.getElementById('friendFeaturesContainer').innerHTML = '<p>Features coming soon</p>';
}
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

// FIXED: Real-Time Message Loading with duplicate prevention
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
    let loadedMessageIds = new Set(); // Track loaded messages to prevent duplicates
    
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

function fixAllBrokenImages() {
    document.querySelectorAll('img').forEach(img => {
        if (img.src.includes('IMAGE_URL') || img.src.includes('127.0.0.1')) {
            const altText = img.alt || 'User';
            img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(altText)}&background=7C3AED&color=fff`;
        }
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

// REPLACE THIS:
async function uploadProfilePicture(file) {
    showToast("🔄 Uploading profile picture...", "info");

    try {
        // STEP 1: Upload to Cloudinary using the new function
        const downloadURL = await uploadToCloudinary(file);
        
        console.log('✅ Cloudinary URL:', downloadURL);

        // STEP 2: UPDATE FIREBASE FIRESTORE 
        // This is how other users (who read your user data) will see the new picture.
        await db.collection('users').doc(currentUser.uid).update({
            photoURL: downloadURL
        });
        
        // STEP 3: UPDATE LOCAL UI 
        // This is how you see the picture change instantly.
        currentUserData.photoURL = downloadURL; // Update local data
        
        // Find all elements that display the user's profile picture and update their source
        const profilePics = document.querySelectorAll('.user-profile-pic');
        profilePics.forEach(img => {
            img.src = downloadURL;
        });
        
        showToast("✅ Profile picture saved successfully!", "success");
        
        // Hide the modal/settings screen
        document.getElementById('settingsModal').classList.add('hidden');

    } catch (error) {
        console.error("Profile picture upload failed:", error);
        // Show the user-friendly error message from the catch block
        showToast(`❌ Upload failed: ${error.message}`, "error");
    }
}
function safeImageLoad(imgElement, src, fallbackText = '') {
    if (!imgElement) return;
    
    imgElement.onerror = function() {
        console.log('Image failed to load:', src);
        // Use fallback avatar
        if (fallbackText) {
            const initial = fallbackText.charAt(0).toUpperCase();
            imgElement.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackText)}&background=7C3AED&color=fff`;
        } else {
            imgElement.src = 'https://ui-avatars.com/api/?name=User&background=7C3AED&color=fff';
        }
        imgElement.onerror = null; // Prevent infinite loop
    };
    
    imgElement.src = src;
}
// WITH THIS:
async function uploadProfilePicture(file) {
    try {
        showToast("🔄 Uploading profile picture...", "info");
        
        // Validate file
        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Please select a valid image file (JPEG, PNG, etc.)');
        }
        
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            throw new Error('Image size should be less than 5MB');
        }

        console.log('Starting upload for file:', file.name, file.type, file.size);
        
        // Upload to Cloudinary
        const downloadURL = await uploadToCloudinary(file);
        
        console.log('✅ Cloudinary URL received:', downloadURL);

        // Update Firebase Firestore
        await db.collection('users').doc(currentUser.uid).update({
            photoURL: downloadURL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update local data
        currentUserData.photoURL = downloadURL;
        
        // Update ALL profile pictures in UI - FIXED SELECTOR
        const profilePics = document.querySelectorAll('img[src*="profile"], .user-profile-pic, #userAvatar, #settingsProfilePic, #profilePicPreview');
        profilePics.forEach(img => {
            console.log('Updating profile pic:', img);
            img.src = downloadURL + '?t=' + Date.now(); // Cache bust
        });
        
        showToast("✅ Profile picture saved successfully!", "success");
        
        // Close modal after successful upload
        setTimeout(() => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) settingsModal.classList.add('hidden');
        }, 1500);

    } catch (error) {
        console.error("❌ Profile picture upload failed:", error);
        showToast(`❌ Upload failed: ${error.message}`, "error");
    }
}
// REPLACE THE uploadCoverPicture FUNCTION (around line 1250):
async function uploadCoverPicture(file) {
    try {
        showToast("🔄 Uploading cover picture...", "info");
        
        // Validate file
        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Please select a valid image file');
        }
        
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('Image size should be less than 5MB');
        }

        console.log('Starting cover upload to Cloudinary:', file.name);
        
        // UPLOAD TO CLOUDINARY (SAME AS PROFILE PICTURE)
        const { cloudName, uploadPreset } = cloudinaryConfig;
        const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);
        formData.append('folder', 'USER_UPLOAD_cover_photos'); // Different folder
        formData.append('timestamp', Date.now().toString());

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (response.ok && data.secure_url) {
            console.log('✅ Cover picture uploaded:', data.secure_url);
            
            // Update user document in Firestore
            await db.collection('users').doc(currentUser.uid).update({
                coverURL: data.secure_url,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update current user data
            currentUserData.coverURL = data.secure_url;
            
            // Update UI
            const profileCoverPreview = document.getElementById('profileCoverPreview');
            if (profileCoverPreview) {
                profileCoverPreview.src = data.secure_url + '?t=' + Date.now();
            }
            
            showToast('✅ Cover picture updated successfully!', 'success');
        } else {
            throw new Error(data.error?.message || 'Upload failed');
        }
        
    } catch (error) {
        console.error('Error uploading cover picture:', error);
        showToast(`❌ Error uploading cover picture: ${error.message}`, 'error');
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
// Initialize business document for new users - UPDATED
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


// Call this in your initApp function
// Function to send automatic greeting message
function sendGreetingMessage(chatId, otherUserId) {
    const businessDocRef = firebase.firestore().collection('business').doc(otherUserId);
    
    businessDocRef.get().then((doc) => {
        if (doc.exists) {
            const businessData = doc.data();
            
            // Check if this is the first message in the chat
            firebase.firestore().collection('chats').doc(chatId).collection('messages')
                .orderBy('timestamp', 'asc')
                .limit(1)
                .get()
                .then((snapshot) => {
                    // If no messages exist, send greeting
                    if (snapshot.empty && businessData.greetingMessage) {
                        const greetingMessage = {
                            text: businessData.greetingMessage,
                            senderId: otherUserId,
                            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                            type: 'greeting',
                            isAutoMessage: true
                        };
                        
                        firebase.firestore().collection('chats').doc(chatId).collection('messages')
                            .add(greetingMessage)
                            .then(() => {
                                console.log('Greeting message sent');
                            });
                    }
                });
        }
    });
}

// Call this when a new chat is created
function createNewChat(otherUserId, otherUserName) {
    // ... your existing chat creation code ...
    
    // After creating chat, send greeting message
    setTimeout(() => {
        sendGreetingMessage(newChatId, otherUserId);
    }, 1000);
}
// Show away message in chat
function showAwayMessageInChat(awayMessage) {
    // Remove existing away message if any
    const existingAwayMessage = document.getElementById('awayMessageBanner');
    if (existingAwayMessage) {
        existingAwayMessage.remove();
    }
    
    // Create away message banner
    const awayBanner = document.createElement('div');
    awayBanner.id = 'awayMessageBanner';
    awayBanner.className = 'bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4';
    awayBanner.innerHTML = `
        <div class="flex items-center">
            <div class="flex-shrink-0">
                <i class="fas fa-clock text-yellow-400"></i>
            </div>
            <div class="ml-3">
                <p class="text-sm text-yellow-700">
                    <span class="font-medium">Away Message:</span> ${awayMessage}
                </p>
            </div>
        </div>
    `;
    
    // Insert at the top of messages container
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.insertBefore(awayBanner, messagesContainer.firstChild);
    }
}

// Call this when a user is created or logs in
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        initializeBusinessDocument(user.uid);
        // ... your existing code
    }
});

// Input validation helper
function validateInput(value, fieldName) {
    if (!value || value.trim() === '') {
        showToast(`Please enter ${fieldName}`, 'warning');
        return false;
    }
    return true;
}

// Updated save functions with better validation
document.getElementById('saveGreeting')?.addEventListener('click', () => {
    const greetingMessage = document.getElementById('greetingMessage')?.value;
    
    if (!validateInput(greetingMessage, 'a greeting message')) return;
    
    if (currentUser) {
        firebase.firestore().collection('business').doc(currentUser.uid).set({
            greetingMessage: greetingMessage,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            showToast('Greeting message saved!', 'success');
            document.getElementById('greetingModal').classList.add('hidden');
        }).catch(error => {
            showToast('Error saving greeting: ' + error.message, 'error');
        });
    }
});

// Load existing business data when modals open
function loadBusinessData() {
    if (!currentUser) return;
    
    const businessDocRef = firebase.firestore().collection('business').doc(currentUser.uid);
    
    businessDocRef.get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            
            // Pre-fill greeting message
            if (data.greetingMessage && document.getElementById('greetingMessage')) {
                document.getElementById('greetingMessage').value = data.greetingMessage;
            }
            
            // Pre-fill away message
            if (data.awayMessage && document.getElementById('awayMessage')) {
                document.getElementById('awayMessage').value = data.awayMessage;
            }
            
            if (data.awayEnabled !== undefined && document.getElementById('awayEnabled')) {
                document.getElementById('awayEnabled').checked = data.awayEnabled;
            }
        }
    }).catch(error => {
        console.error('Error loading business data:', error);
    });
}

// Call this when business modals open
document.getElementById('greetingBtn')?.addEventListener('click', () => {
    document.getElementById('greetingModal').classList.remove('hidden');
    loadBusinessData();
});

document.getElementById('awayBtn')?.addEventListener('click', () => {
    document.getElementById('awayModal').classList.remove('hidden');
    loadBusinessData();
});
// Integration with OpenAI API (example)
async function generateAISummaryWithAPI(messages) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer YOUR_OPENAI_API_KEY`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that summarizes conversations. Provide a concise summary highlighting key points, decisions, and action items.'
                    },
                    {
                        role: 'user',
                        content: `Please summarize this conversation:\n\n${messages.map(m => `${m.sender}: ${m.text}`).join('\n')}`
                    }
                ],
                max_tokens: 500
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('AI API error:', error);
        // Fallback to local summary
        return generateConversationSummary(messages);
    }
}

// Integration for smart replies with AI
async function generateSmartRepliesWithAPI(messages) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer YOUR_OPENAI_API_KEY`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that suggests 5 appropriate and friendly reply options for a conversation. Return only the reply options as a JSON array.'
                    },
                    {
                        role: 'user',
                        content: `Based on this conversation context, suggest 5 reply options:\n\n${messages.map(m => `${m.isYou ? 'You' : 'Them'}: ${m.text}`).join('\n')}`
                    }
                ],
                max_tokens: 200
            })
        });
        
        const data = await response.json();
        const replies = JSON.parse(data.choices[0].message.content);
        return replies;
    } catch (error) {
        console.error('AI API error:', error);
        // Fallback to local smart replies
        return generateSmartReplies(messages);
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
function setupToolsListeners() {

    // FEATURES
    document.getElementById("featuresBtn")?.addEventListener("click", () => {
        document.getElementById("featuresModal").classList.remove("hidden", "opacity-0");
    });
    document.getElementById("closeFeatures")?.addEventListener("click", () => {
        document.getElementById("featuresModal").classList.add("hidden");
    });

    // MOOD
    document.getElementById("currentMoodBtn")?.addEventListener("click", () => {
        document.getElementById("moodModal").classList.remove("hidden");
    });
    document.getElementById("closeMood")?.addEventListener("click", () => {
        document.getElementById("moodModal").classList.add("hidden");
    });
    // QUICK ACTIONS / SETTINGS - missing listeners (add these inside setupToolsListeners)
    document.getElementById('settingsSettingsBtn')?.addEventListener('click', () => {
        // open the settings modal (your HTML contains a settings modal). If you used id 'settingsModal' adjust accordingly.
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('hidden');
    });

    document.getElementById('storageSettingsBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('storageSettingsModal');
        if (modal) modal.classList.remove('hidden');
    });

    document.getElementById('inviteContactBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('inviteFriendsModal');
        if (modal) modal.classList.remove('hidden');
    });

    // Business tools
    // Business tools - UPDATED WITH ACTUAL MODALS
document.getElementById('catalogueBtn')?.addEventListener('click', () => {
    document.getElementById('catalogueModal')?.classList.remove('hidden');
});

document.getElementById('advertiseBtn')?.addEventListener('click', () => {
    document.getElementById('advertiseModal')?.classList.remove('hidden');
});

document.getElementById('labelsBtn')?.addEventListener('click', () => {
    document.getElementById('labelsModal')?.classList.remove('hidden');
});

document.getElementById('greetingBtn')?.addEventListener('click', () => {
    document.getElementById('greetingModal')?.classList.remove('hidden');
});

document.getElementById('awayBtn')?.addEventListener('click', () => {
    document.getElementById('awayModal')?.classList.remove('hidden');
});
// Close listeners for business modals
document.getElementById('closeCatalogue')?.addEventListener('click', () => {
    document.getElementById('catalogueModal').classList.add('hidden');
});

document.getElementById('closeAdvertise')?.addEventListener('click', () => {
    document.getElementById('advertiseModal').classList.add('hidden');
});

document.getElementById('closeLabels')?.addEventListener('click', () => {
    document.getElementById('labelsModal').classList.add('hidden');
});

document.getElementById('closeGreeting')?.addEventListener('click', () => {
    document.getElementById('greetingModal').classList.add('hidden');
});

document.getElementById('closeAway')?.addEventListener('click', () => {
    document.getElementById('awayModal').classList.add('hidden');
});
// BUSINESS TOOLS SAVE/CREATE BUTTONS - FIXED VERSION
document.getElementById('saveCatalogue')?.addEventListener('click', () => {
    const productName = document.getElementById('productName')?.value;
    const productPrice = document.getElementById('productPrice')?.value;
    
    if (!productName) {
        showToast('Please enter a product name', 'warning');
        return;
    }
    
    if (currentUser) {
        firebase.firestore().collection('business').doc(currentUser.uid).collection('products').add({
            name: productName,
            price: parseFloat(productPrice) || 0,
            description: document.getElementById('productDescription')?.value || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast('Product added to catalogue!', 'success');
            document.getElementById('catalogueModal').classList.add('hidden');
            // Clear form
            document.getElementById('productName').value = '';
            document.getElementById('productPrice').value = '';
            document.getElementById('productDescription').value = '';
        }).catch(error => {
            showToast('Error adding product: ' + error.message, 'error');
        });
    }
});

document.getElementById('launchCampaign')?.addEventListener('click', () => {
    const adTitle = document.getElementById('adTitle')?.value;
    const targetAudience = document.getElementById('targetAudience')?.value;
    const budget = document.getElementById('adBudget')?.value;
    
    if (!adTitle) {
        showToast('Please enter an ad title', 'warning');
        return;
    }
    
    if (currentUser) {
        firebase.firestore().collection('business').doc(currentUser.uid).collection('campaigns').add({
            title: adTitle,
            audience: targetAudience,
            budget: parseFloat(budget) || 0,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast('Advertising campaign launched!', 'success');
            document.getElementById('advertiseModal').classList.add('hidden');
            // Clear form
            document.getElementById('adTitle').value = '';
            document.getElementById('adBudget').value = '';
        }).catch(error => {
            showToast('Error launching campaign: ' + error.message, 'error');
        });
    }
});

document.getElementById('createLabel')?.addEventListener('click', () => {
    const labelName = document.getElementById('newLabelName')?.value;
    const labelColor = document.getElementById('labelColor')?.value;
    
    if (!labelName) {
        showToast('Please enter a label name', 'warning');
        return;
    }
    
    if (currentUser) {
        firebase.firestore().collection('business').doc(currentUser.uid).collection('labels').add({
            name: labelName,
            color: labelColor,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast('Label created successfully!', 'success');
            document.getElementById('labelsModal').classList.add('hidden');
            // Clear form
            document.getElementById('newLabelName').value = '';
        }).catch(error => {
            showToast('Error creating label: ' + error.message, 'error');
        });
    }
});

document.getElementById('saveGreeting')?.addEventListener('click', () => {
    const greetingMessage = document.getElementById('greetingMessage')?.value;
    
    if (!greetingMessage) {
        showToast('Please enter a greeting message', 'warning');
        return;
    }
    
    if (currentUser) {
        // Use set with merge: true to create or update the document
        firebase.firestore().collection('business').doc(currentUser.uid).set({
            greetingMessage: greetingMessage,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            showToast('Greeting message saved!', 'success');
            document.getElementById('greetingModal').classList.add('hidden');
        }).catch(error => {
            showToast('Error saving greeting: ' + error.message, 'error');
        });
    }
});

document.getElementById('saveAway')?.addEventListener('click', () => {
    const awayMessage = document.getElementById('awayMessage')?.value;
    const awayEnabled = document.getElementById('awayEnabled')?.checked;
    
    if (!awayMessage) {
        showToast('Please enter an away message', 'warning');
        return;
    }
    
    if (currentUser) {
        // Use set with merge: true to create or update the document
        firebase.firestore().collection('business').doc(currentUser.uid).set({
            awayMessage: awayMessage,
            awayEnabled: awayEnabled,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            showToast('Away message settings saved!', 'success');
            document.getElementById('awayModal').classList.add('hidden');
        }).catch(error => {
            showToast('Error saving away message: ' + error.message, 'error');
        });
    }
});

    // AI Features
    document.getElementById('aiSummarize')?.addEventListener('click', () => {
        showToast('Summarizing conversation...', 'info');
        // TODO: implement summarizeChat() using your existing messages load
    });
    document.getElementById('aiReply')?.addEventListener('click', () => {
        showToast('Generating smart reply...', 'info');
        // TODO: implement smartReply()
    });

    document.querySelectorAll(".mood-option").forEach(option => {
        option.addEventListener("click", () => {
            let selectedMood = option.dataset.mood;
            showToast("Mood updated: " + selectedMood, "success");
            document.getElementById("moodModal").classList.add("hidden");

            // Save mood to Firestore
            if (currentUser) {
                firebase.firestore().collection("users").doc(currentUser.uid).update({
                    mood: selectedMood
                });
            }
        });
    });
    

    // QUICK ACTIONS
    document.getElementById("quickActionsBtn")?.addEventListener("click", () => {
        document.getElementById("quickActionsModal").classList.remove("hidden");
    });
    document.getElementById("closeQuickActions")?.addEventListener("click", () => {
        document.getElementById("quickActionsModal").classList.add("hidden");
    });
}
// CLOSE Invite Friends Modal
document.getElementById("closeInviteFriends")?.addEventListener("click", () => {
    document.getElementById("inviteFriendsModal").classList.add("hidden");
});

// CLOSE Quick Actions Modal
document.getElementById("closeQuickActions")?.addEventListener("click", () => {
    document.getElementById("quickActionsModal").classList.add("hidden");
});

// CLOSE Settings Modal
document.getElementById("closeSettings")?.addEventListener("click", () => {
    document.getElementById("settingsModal").classList.add("hidden");
});

// CLOSE Storage Settings Modal
document.getElementById("closeStorageSettings")?.addEventListener("click", () => {
    document.getElementById("storageSettingsModal").classList.add("hidden");
});
// INVITE FRIENDS LINKS
// FIXED: WhatsApp Invite Function
document.getElementById("shareWhatsapp")?.addEventListener("click", () => {
    try {
        const inviteMessage = "Join me on Kynecta! Download the app to chat and connect with me. ";
        const inviteLink = "https://yourappwebsite.com/download"; // Replace with your actual app link
        
        // Method 1: Direct WhatsApp share (most reliable)
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(inviteMessage + inviteLink)}`;
        
        // Open in new window
        const newWindow = window.open(whatsappUrl, '_blank', 'width=600,height=400');
        
        if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
            // Fallback: Try mobile WhatsApp
            const mobileWhatsappUrl = `whatsapp://send?text=${encodeURIComponent(inviteMessage + inviteLink)}`;
            window.location.href = mobileWhatsappUrl;
            
            // Final fallback
            setTimeout(() => {
                showToast("Could not open WhatsApp. Please copy the message manually.", "warning");
                navigator.clipboard.writeText(inviteMessage + inviteLink).then(() => {
                    showToast("Invite message copied to clipboard!", "success");
                });
            }, 1000);
        }
        
    } catch (error) {
        console.error("Error sharing to WhatsApp:", error);
        showToast("Error sharing to WhatsApp", "error");
    }
});

document.getElementById("shareFacebook")?.addEventListener("click", () => {
    const inviteMessage = "Join me on Kynecta!";
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://yourappwebsite.com')}&quote=${encodeURIComponent(inviteMessage)}`;
    window.open(facebookUrl, '_blank');
});

document.getElementById("shareEmail")?.addEventListener("click", () => {
    const subject = "Join me on Kynecta!";
    const body = "Hey! I'm using Kynecta to chat and connect. Download the app so we can chat there!\n\nDownload link: https://yourappwebsite.com";
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

// Add missing QR Code functionality
document.getElementById("shareQR")?.addEventListener("click", () => {
    showToast("Generating QR code...", "info");
    generateQRCode();
});

// Add missing Copy Link functionality
// FIXED: Copy Invite Link Function
document.getElementById("copyInviteLink")?.addEventListener("click", () => {
    try {
        // Create a unique invite link with user ID
        const inviteLink = `https://yourappwebsite.com/invite/${currentUser?.uid || 'user'}`;
        
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(inviteLink).then(() => {
                showToast("✅ Invite link copied to clipboard!", "success");
                console.log("Invite link copied:", inviteLink);
            }).catch(err => {
                // Fallback for older browsers
                useFallbackCopy(inviteLink);
            });
        } else {
            // Use fallback method
            useFallbackCopy(inviteLink);
        }
        
    } catch (error) {
        console.error("Error copying invite link:", error);
        showToast("❌ Error copying invite link", "error");
    }
});

// Fallback copy method
function useFallbackCopy(text) {
    try {
        const tempInput = document.createElement('input');
        tempInput.value = text;
        tempInput.style.position = 'absolute';
        tempInput.style.left = '-9999px';
        document.body.appendChild(tempInput);
        tempInput.select();
        tempInput.setSelectionRange(0, 99999); // For mobile devices
        
        const successful = document.execCommand('copy');
        document.body.removeChild(tempInput);
        
        if (successful) {
            showToast("✅ Invite link copied to clipboard!", "success");
        } else {
            throw new Error('execCommand failed');
        }
    } catch (err) {
        // Last resort - show the link for manual copy
        showToast("📋 Please copy this link manually: " + text, "info");
    }
}
// FIXED: SMS Invite Function
document.getElementById("shareSMS")?.addEventListener("click", () => {
    try {
        const smsMessage = "Join me on Kynecta! Download the app to chat with me: https://yourappwebsite.com/download";
        
        // Proper SMS URL format
        const smsUrl = `sms:?body=${encodeURIComponent(smsMessage)}`;
        
        // Try to open SMS app
        window.location.href = smsUrl;
        
        // Fallback in case it doesn't work
        setTimeout(() => {
            // If we're still on the same page, offer manual copy
            if (window.location.href.includes('chat.html')) {
                navigator.clipboard.writeText(smsMessage).then(() => {
                    showToast("SMS message copied to clipboard!", "success");
                });
            }
        }, 500);
        
    } catch (error) {
        console.error("Error sharing via SMS:", error);
        showToast("Error sharing via SMS", "error");
    }
});

// NOTIFICATIONS SETTINGS
document.getElementById("notificationsSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("notificationsSettingsModal").classList.remove("hidden");
});

// CHAT SETTINGS
document.getElementById("chatSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("chatSettingsModal").classList.remove("hidden");
});

// AVATAR SETTINGS - Add missing listener
document.getElementById("avatarSettingsBtn")?.addEventListener("click", () => {
    showToast("Opening avatar editor...", "info");
    // Open profile settings modal for avatar editing
    document.getElementById("profileSettingsModal").classList.remove("hidden");
});
// ACCESSIBILITY SETTINGS
document.getElementById("accessibilityBtn")?.addEventListener("click", () => {
    document.getElementById("accessibilitySettingsModal").classList.remove("hidden");
});

// LANGUAGE SETTINGS
document.getElementById("languageSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("languageSettingsModal").classList.remove("hidden");
});

// ACCOUNT SETTINGS
document.getElementById("accountSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("accountSettingsModal").classList.remove("hidden");
});

// SECURITY NOTIFICATIONS - Use account settings modal instead
document.getElementById("securitySettingsBtn")?.addEventListener("click", () => {
    document.getElementById("accountSettingsModal").classList.remove("hidden");
});

// FAVORITES SETTINGS
document.getElementById("favoritesSettingsBtn")?.addEventListener("click", () => {
    document.getElementById("favoritesSettingsModal").classList.remove("hidden");
});

// HELP SETTINGS
document.getElementById("helpCenterBtn")?.addEventListener("click", () => {
    document.getElementById("helpCenterModal").classList.remove("hidden");
});
// APP INFO SETTINGS
document.getElementById("appInfoBtn")?.addEventListener("click", () => {
    document.getElementById("appInfoModal").classList.remove("hidden");
});
document.getElementById("closeNotifications")?.addEventListener("click", () => {
    document.getElementById("notificationsSettingsModal").classList.add("hidden");
});

document.getElementById("saveNotifications")?.addEventListener("click", () => {
    // Save logic here
    document.getElementById("notificationsSettingsModal").classList.add("hidden");
});
// Add these close listeners
document.getElementById("closeProfileSettings")?.addEventListener("click", () => {
    document.getElementById("profileSettingsModal").classList.add("hidden");
});

document.getElementById("closePrivacySettings")?.addEventListener("click", () => {
    document.getElementById("privacySettingsModal").classList.add("hidden");
});

document.getElementById("closeAccountSettings")?.addEventListener("click", () => {
    document.getElementById("accountSettingsModal").classList.add("hidden");
});

document.getElementById("closeAccessibilitySettings")?.addEventListener("click", () => {
    document.getElementById("accessibilitySettingsModal").classList.add("hidden");
});

document.getElementById("closeLanguageSettings")?.addEventListener("click", () => {
    document.getElementById("languageSettingsModal").classList.add("hidden");
});

document.getElementById("closeChatSettings")?.addEventListener("click", () => {
    document.getElementById("chatSettingsModal").classList.add("hidden");
});

document.getElementById("closeFavoritesSettings")?.addEventListener("click", () => {
    document.getElementById("favoritesSettingsModal").classList.add("hidden");
});

document.getElementById("closeHelpCenter")?.addEventListener("click", () => {
    document.getElementById("helpCenterModal").classList.add("hidden");
});

document.getElementById("closeAppInfo")?.addEventListener("click", () => {
    document.getElementById("appInfoModal").classList.add("hidden");
});
// Quick Actions functionality
document.querySelectorAll("#quickActionsModal button").forEach(button => {
    button.addEventListener("click", (e) => {
        const action = e.target.textContent || e.target.closest('button').textContent;
        showToast(`Quick action: ${action}`, "info");
        document.getElementById("quickActionsModal").classList.add("hidden");
    });
});
document.getElementById("contactUsBtn")?.addEventListener("click", () => {
    // Open contact modal or redirect
    showToast("Opening contact form...", "info");
    // You can create a contact modal or use mailto:
    window.location.href = "mailto:support@kynecta.com?subject=Support Request";
});
// PROFILE SETTINGS SAVE
document.getElementById("saveProfile")?.addEventListener("click", () => {
    const name = document.getElementById("profileName").value;
    const about = document.getElementById("profileAbout").value;
    const email = document.getElementById("profileEmail").value;
    const phone = document.getElementById("profilePhone").value;

    if (currentUser) {
        firebase.firestore().collection("users").doc(currentUser.uid).update({
            displayName: name,
            about: about,
            email: email,
            phone: phone,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast("Profile updated successfully!", "success");
            document.getElementById("profileSettingsModal").classList.add("hidden");
            loadUserData(currentUser.uid); // Refresh user data
        }).catch((error) => {
            showToast("Error updating profile: " + error.message, "error");
        });
    }
});

// PRIVACY SETTINGS SAVE
document.getElementById("savePrivacy")?.addEventListener("click", () => {
    const privacySettings = {
        lastSeen: document.getElementById("lastSeenPrivacy").value,
        profilePhoto: document.getElementById("profilePhotoPrivacy").value,
        about: document.getElementById("aboutPrivacy").value,
        status: document.getElementById("statusPrivacy").value,
        readReceipts: document.getElementById("readReceiptsPrivacy").checked,
        disappearingMessages: document.getElementById("disappearingMessagesPrivacy").value,
        calls: document.getElementById("callsPrivacy").value
    };

    if (currentUser) {
        firebase.firestore().collection("users").doc(currentUser.uid).update({
            privacySettings: privacySettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast("Privacy settings saved!", "success");
            document.getElementById("privacySettingsModal").classList.add("hidden");
        }).catch((error) => {
            showToast("Error saving privacy settings: " + error.message, "error");
        });
    }
});

// ACCESSIBILITY SETTINGS SAVE
document.getElementById("saveAccessibility")?.addEventListener("click", () => {
    const accessibilitySettings = {
        darkMode: document.getElementById("darkModeToggle").checked,
        fontSize: document.getElementById("fontSizeSelect").value,
        highContrast: document.getElementById("highContrastToggle").checked,
        screenReader: document.getElementById("screenReaderToggle").checked,
        reduceAnimations: document.getElementById("reduceAnimationsToggle").checked,
        textToSpeech: document.getElementById("textToSpeechToggle").checked
    };

    if (currentUser) {
        firebase.firestore().collection("users").doc(currentUser.uid).update({
            accessibilitySettings: accessibilitySettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast("Accessibility settings saved!", "success");
            document.getElementById("accessibilitySettingsModal").classList.add("hidden");
            applyAccessibilitySettings(accessibilitySettings);
        }).catch((error) => {
            showToast("Error saving accessibility settings: " + error.message, "error");
        });
    }
});

// STORAGE SETTINGS SAVE
document.getElementById("saveStorage")?.addEventListener("click", () => {
    const storageSettings = {
        autoDownload: document.getElementById("autoDownloadToggle").checked,
        wifiOnly: document.getElementById("wifiOnlyToggle").checked,
        uploadQuality: document.getElementById("mediaUploadQuality").value
    };

    if (currentUser) {
        firebase.firestore().collection("users").doc(currentUser.uid).update({
            storageSettings: storageSettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast("Storage settings saved!", "success");
            document.getElementById("storageSettingsModal").classList.add("hidden");
        }).catch((error) => {
            showToast("Error saving storage settings: " + error.message, "error");
        });
    }
});

// LANGUAGE SETTINGS SAVE
document.getElementById("saveLanguage")?.addEventListener("click", () => {
    const languageSettings = {
        appLanguage: document.getElementById("appLanguageSelect").value,
        autoDetect: document.getElementById("autoDetectLanguageToggle").checked
    };

    if (currentUser) {
        firebase.firestore().collection("users").doc(currentUser.uid).update({
            languageSettings: languageSettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast("Language settings saved!", "success");
            document.getElementById("languageSettingsModal").classList.add("hidden");
        }).catch((error) => {
            showToast("Error saving language settings: " + error.message, "error");
        });
    }
});


// SAFE AI SMART REPLY FUNCTION
document.getElementById('aiReply')?.addEventListener('click', () => {
    if (!currentChatId) {
        showToast('❌ Please select a conversation first', 'warning');
        
        // Optional: Auto-open chat list
        if (document.getElementById('chatsTab')) {
            document.getElementById('chatsTab').classList.add('active');
            document.getElementById('friendsTab').classList.remove('active');
            document.getElementById('updatesTab').classList.remove('active');
            document.getElementById('callsTab').classList.remove('active');
            document.getElementById('toolsTab').classList.remove('active');
            showToast('💬 Please select a conversation from the chats tab', 'info');
        }
        return;
    }
    
    if (!currentUser) {
        showToast('Please log in to use AI features', 'warning');
        return;
    }
    
    showToast('💡 Generating smart replies...', 'info');
    
    firebase.firestore().collection('chats').doc(currentChatId).collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get()
        .then((snapshot) => {
            if (snapshot.empty) {
                showToast('No messages found in this conversation', 'warning');
                return;
            }
            
            const recentMessages = [];
            snapshot.forEach(doc => {
                const message = doc.data();
                if (message.text && message.type !== 'system') {
                    recentMessages.push({
                        text: message.text,
                        isYou: message.senderId === currentUser.uid
                    });
                }
            });
            
            if (recentMessages.length === 0) {
                showToast('No recent messages for context', 'warning');
                return;
            }
            
            const smartReplies = generateSmartReplies(recentMessages);
            showSmartRepliesModal(smartReplies);
            
        }).catch(error => {
            console.error('Error generating smart replies:', error);
            showToast('Error generating smart replies: ' + error.message, 'error');
        });
});

// CHAT SETTINGS SAVE
document.getElementById("saveChatSettings")?.addEventListener("click", () => {
    const chatSettings = {
        enterKeySends: document.getElementById("enterKeySendsToggle").checked,
        readReceipts: document.getElementById("readReceiptsToggle").checked,
        lastSeen: document.getElementById("lastSeenToggle").checked,
        mediaVisibility: document.getElementById("mediaVisibilityToggle").checked,
        chatBackup: document.getElementById("chatBackupToggle").checked
    };

    if (currentUser) {
        firebase.firestore().collection("users").doc(currentUser.uid).update({
            chatSettings: chatSettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast("Chat settings saved!", "success");
            document.getElementById("chatSettingsModal").classList.add("hidden");
        }).catch((error) => {
            showToast("Error saving chat settings: " + error.message, "error");
        });
    }
});

// SECURITY SETTINGS SAVE (if you have this modal)
document.getElementById("saveSettings")?.addEventListener("click", () => {
    if (saveSettings()) {
        document.getElementById("settingsModal").classList.add("hidden");
    }
});

// CANCEL BUTTONS
document.getElementById("cancelProfile")?.addEventListener("click", () => {
    document.getElementById("profileSettingsModal").classList.add("hidden");
});

document.getElementById("cancelPrivacy")?.addEventListener("click", () => {
    document.getElementById("privacySettingsModal").classList.add("hidden");
});

document.getElementById("cancelAccount")?.addEventListener("click", () => {
    document.getElementById("accountSettingsModal").classList.add("hidden");
});

document.getElementById("cancelLanguage")?.addEventListener("click", () => {
    document.getElementById("languageSettingsModal").classList.add("hidden");
});

document.getElementById("cancelChatSettings")?.addEventListener("click", () => {
    document.getElementById("chatSettingsModal").classList.add("hidden");
});

document.getElementById("cancelStorage")?.addEventListener("click", () => {
    document.getElementById("storageSettingsModal").classList.add("hidden");
});

// FIXED: Enhanced Event Listeners with proper mobile support
function setupEventListeners() {
    console.log('Setting up event listeners');
    
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
        
    
    
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
        });
    }

    
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
                    window.location.href = 'index.html';
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
});
// ADD THIS SECTION:
    console.log('Setting up settings save button...');
    
    // Settings save button
    const saveSettingsBtn = document.getElementById('saveSettings');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', function() {
            console.log('Save settings button clicked');
            if (saveSettings()) {
                document.getElementById('settingsModal').classList.add('hidden');
            }
        });
    } else {
        console.warn('Save settings button not found in DOM');
    }

}


// FIXED: Comprehensive modal event listeners setup
function setupModalEventListeners() {
    console.log('Setting up modal event listeners...');
    
    // Close buttons for all modals
    const closeButtons = [
        
        { id: 'closeFeatures', modal: 'featuresModal' },
        { id: 'closeMood', modal: 'moodModal' },
        { id: 'closeQuickActions', modal: 'quickActionsModal' },
        { id: 'closeInviteFriends', modal: 'inviteFriendsModal' },
        { id: 'closeStorageSettings', modal: 'storageSettingsModal' },
        { id: 'closeCatalogue', modal: 'catalogueModal' },
        { id: 'closeAdvertise', modal: 'advertiseModal' },
        { id: 'closeLabels', modal: 'labelsModal' },
        { id: 'closeGreeting', modal: 'greetingModal' },
        { id: 'closeAway', modal: 'awayModal' },
        { id: 'closeNotifications', modal: 'notificationsSettingsModal' },
        { id: 'closeProfileSettings', modal: 'profileSettingsModal' },
        { id: 'closePrivacySettings', modal: 'privacySettingsModal' },
        { id: 'closeAccountSettings', modal: 'accountSettingsModal' },
        { id: 'closeAccessibilitySettings', modal: 'accessibilitySettingsModal' },
        { id: 'closeLanguageSettings', modal: 'languageSettingsModal' },
        { id: 'closeChatSettings', modal: 'chatSettingsModal' },
        { id: 'closeFavoritesSettings', modal: 'favoritesSettingsModal' },
        { id: 'closeHelpCenter', modal: 'helpCenterModal' },
        { id: 'closeAppInfo', modal: 'appInfoModal' }
    ];
    
    closeButtons.forEach(button => {
        const closeBtn = document.getElementById(button.id);
        const modal = document.getElementById(button.modal);
        
        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                console.log(`Closing ${button.modal}`);
                modal.classList.add('hidden');
            });
        } else {
            console.warn(`Button or modal not found: ${button.id} -> ${button.modal}`);
        }
    });
    
    // Cancel buttons
    const cancelButtons = [
        { id: 'cancelProfile', modal: 'profileSettingsModal' },
        { id: 'cancelPrivacy', modal: 'privacySettingsModal' },
        { id: 'cancelAccount', modal: 'accountSettingsModal' },
        { id: 'cancelLanguage', modal: 'languageSettingsModal' },
        { id: 'cancelChatSettings', modal: 'chatSettingsModal' },
        { id: 'cancelStorage', modal: 'storageSettingsModal' }
    ];
    
    cancelButtons.forEach(button => {
        const cancelBtn = document.getElementById(button.id);
        const modal = document.getElementById(button.modal);
        
        if (cancelBtn && modal) {
            cancelBtn.addEventListener('click', () => {
                console.log(`Canceling ${button.modal}`);
                modal.classList.add('hidden');
            });
        }
    });
    
    // Save buttons - add basic functionality
    const saveButtons = [
        { id: 'saveProfile', modal: 'profileSettingsModal', action: updateProfile },
        { id: 'savePrivacy', modal: 'privacySettingsModal', action: () => showToast('Privacy settings saved!', 'success') },
        { id: 'saveAccessibility', modal: 'accessibilitySettingsModal', action: () => showToast('Accessibility settings saved!', 'success') },
        { id: 'saveStorage', modal: 'storageSettingsModal', action: () => showToast('Storage settings saved!', 'success') },
        { id: 'saveLanguage', modal: 'languageSettingsModal', action: () => showToast('Language settings saved!', 'success') },
        { id: 'saveChatSettings', modal: 'chatSettingsModal', action: () => showToast('Chat settings saved!', 'success') },
        { id: 'saveNotifications', modal: 'notificationsSettingsModal', action: () => showToast('Notification settings saved!', 'success') }
    ];
    
    saveButtons.forEach(button => {
        const saveBtn = document.getElementById(button.id);
        const modal = document.getElementById(button.modal);
        
        if (saveBtn && modal) {
            saveBtn.addEventListener('click', () => {
                console.log(`Saving ${button.modal}`);
                if (button.action) {
                    button.action();
                }
                modal.classList.add('hidden');
            });
        }
    });
    
    // Business tool save buttons
    const businessSaveButtons = [
        { id: 'saveCatalogue', modal: 'catalogueModal' },
        { id: 'launchCampaign', modal: 'advertiseModal' },
        { id: 'createLabel', modal: 'labelsModal' },
        { id: 'saveGreeting', modal: 'greetingModal' },
        { id: 'saveAway', modal: 'awayModal' }
    ];
    
    businessSaveButtons.forEach(button => {
        const saveBtn = document.getElementById(button.id);
        const modal = document.getElementById(button.modal);
        
        if (saveBtn && modal) {
            saveBtn.addEventListener('click', () => {
                console.log(`Saving ${button.modal}`);
                // These already have their own save logic in setupToolsListeners
                modal.classList.add('hidden');
            });
        }
    });
    
    console.log('Modal event listeners setup completed');
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


// ADD PERMISSION INSTRUCTIONS FUNCTION:
function showPermissionInstructions() {
    const instructions = `
        <div class="permission-instructions">
            <h3>How to Enable Camera/Microphone Permissions</h3>
            <div class="browser-instructions">
                <div class="browser-chrome">
                    <strong>Chrome:</strong>
                    <ol>
                        <li>Click the lock/camera icon in the address bar</li>
                        <li>Change "Camera" and "Microphone" to "Allow"</li>
                        <li>Refresh the page and try again</li>
                    </ol>
                </div>
                <div class="browser-firefox">
                    <strong>Firefox:</strong>
                    <ol>
                        <li>Click the camera icon in the address bar</li>
                        <li>Select "Allow" for camera and microphone</li>
                        <li>Check "Remember this decision"</li>
                        <li>Refresh the page</li>
                    </ol>
                </div>
                <div class="browser-edge">
                    <strong>Edge:</strong>
                    <ol>
                        <li>Click the camera icon in the address bar</li>
                        <li>Toggle camera and microphone to "Allow"</li>
                        <li>Refresh the page</li>
                    </ol>
                </div>
                <div class="browser-safari">
                    <strong>Safari:</strong>
                    <ol>
                        <li>Go to Safari → Preferences → Websites</li>
                        <li>Find Camera/Microphone and set to "Allow"</li>
                        <li>Refresh the page</li>
                    </ol>
                </div>
            </div>
            <button onclick="closePermissionInstructions()" class="btn-primary">Got it</button>
        </div>
    `;
    
    // Create and show instructions modal
    const modal = document.createElement('div');
    modal.className = 'permission-modal';
    modal.innerHTML = instructions;
    document.body.appendChild(modal);
}

// ADD FUNCTION TO CLOSE INSTRUCTIONS:
function closePermissionInstructions() {
    const modal = document.querySelector('.permission-modal');
    if (modal) {
        modal.remove();
    }
}

// UPDATE THE CLEANUP FUNCTION:
function cleanupMediaStream() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }
    
    // Hide video call container
    const videoCallContainer = document.getElementById('videoCallContainer');
    if (videoCallContainer) {
        videoCallContainer.style.display = 'none';
        videoCallContainer.classList.add('hidden');
        videoCallContainer.classList.remove('audio-only');
    }
}


// THEN THE REST OF YOUR VIDEO CALL FUNCTIONS:

// REPLACE THE startVideoCall FUNCTION (around line 3300):
async function startVideoCall() {
    if (!currentChat) {
        showToast('Please select a chat first', 'error');
        return;
    }

    try {
        console.log('Starting video call with:', currentChat.name);
        showToast('Starting video call...', 'info');
        
        // Check browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support video calling. Please use Chrome, Firefox, or Edge.');
        }

        // First, check if we already have permissions
        let hasVideoPermission = false;
        let hasAudioPermission = false;
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            hasVideoPermission = devices.some(device => device.kind === 'videoinput' && device.deviceId !== '');
            hasAudioPermission = devices.some(device => device.kind === 'audioinput' && device.deviceId !== '');
        } catch (e) {
            console.log('Could not enumerate devices:', e);
        }

        // Request camera and microphone permissions with progressive approach
        let constraints = {
            video: false,
            audio: false
        };

        // If we don't have permissions, request them step by step
        if (!hasVideoPermission || !hasAudioPermission) {
            console.log('Requesting permissions step by step...');
            
            // First request audio only (more likely to be granted)
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('✅ Audio permission granted');
                audioStream.getTracks().forEach(track => track.stop()); // Clean up
                hasAudioPermission = true;
                constraints.audio = true;
            } catch (audioError) {
                console.warn('Audio permission denied:', audioError);
                showToast('Microphone access is required for video calls', 'error');
            }

            // Then request video
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                console.log('✅ Video permission granted');
                videoStream.getTracks().forEach(track => track.stop()); // Clean up
                hasVideoPermission = true;
                constraints.video = {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                };
            } catch (videoError) {
                console.warn('Video permission denied:', videoError);
                showToast('Camera access is required for video calls', 'error');
            }
        } else {
            // We already have permissions, request both
            constraints = {
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
        }

        // Check if we have at least audio permission
        if (!hasAudioPermission && !hasVideoPermission) {
            throw new Error('Camera and microphone permissions are required for video calls');
        }

        console.log('Requesting media stream with constraints:', constraints);
        
        // Get the final media stream
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Media stream obtained successfully');
        
        // Display local video stream if video is available
        const localVideo = document.getElementById('localVideo');
        const videoCallContainer = document.getElementById('videoCallContainer');
        
        if (localVideo && constraints.video) {
            localVideo.srcObject = localStream;
            localVideo.muted = true; // Mute local video to avoid echo
            
            // Wait for video to load
            localVideo.onloadedmetadata = () => {
                localVideo.play().catch(e => {
                    console.warn('Video play warning:', e);
                });
            };
            
            // Handle video loading errors
            localVideo.onerror = (e) => {
                console.error('Video loading error:', e);
                showToast('Error loading video stream', 'error');
            };
        } else if (!constraints.video) {
            // Video permission was denied, show placeholder
            console.log('Video permission not granted, showing audio-only call');
            showToast('Video call started (audio only)', 'info');
        }
        
        // Show call container
        if (videoCallContainer) {
            videoCallContainer.style.display = 'block';
            videoCallContainer.classList.remove('hidden');
            
            // If no video, show audio-only UI
            if (!constraints.video) {
                videoCallContainer.classList.add('audio-only');
            }
        }
        
        // Set call state
        isInCall = true;
        isMuted = false;
        isVideoOff = !constraints.video; // Video is off if permission was denied
        
        // Update UI buttons
        updateCallButtons();
        
        console.log('Video call started successfully');
        showToast(`Video call started with ${currentChat.name}`, 'success');
        
        // Start WebRTC connection
        if (currentChat.friendId) {
            await startCall(currentChat.friendId, 'video', currentChat.name);
        }
        
    } catch (error) {
        console.error('Error starting video call:', error);
        
        // User-friendly error messages
        let errorMessage = 'Cannot start video call. ';
        
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Camera/microphone permission denied. ';
            errorMessage += 'Please allow permissions in your browser settings and try again.';
            showPermissionInstructions();
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No camera or microphone found. ';
            errorMessage += 'Please check if your devices are connected properly.';
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Camera/microphone is already in use by another application.';
        } else if (error.name === 'OverconstrainedError') {
            errorMessage = 'Cannot find camera with required specifications. ';
            errorMessage += 'Trying with default settings...';
            // Retry with simpler constraints
            setTimeout(() => startVideoCallWithSimpleConstraints(), 1000);
            return;
        } else if (error.name === 'TypeError') {
            errorMessage = 'Media constraints are not valid.';
        } else {
            errorMessage += error.message;
        }
        
        showToast(errorMessage, 'error');
        
        // Reset call state
        isInCall = false;
        cleanupMediaStream();
    }
}

// ADD THIS NEW FUNCTION FOR SIMPLER CONSTRAINTS RETRY:
async function startVideoCallWithSimpleConstraints() {
    try {
        console.log('Retrying with simpler constraints...');
        
        const simpleConstraints = {
            video: true,
            audio: true
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(simpleConstraints);
        console.log('✅ Media stream obtained with simple constraints');
        
        // Continue with call setup...
        const localVideo = document.getElementById('localVideo');
        const videoCallContainer = document.getElementById('videoCallContainer');
        
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            
            localVideo.onloadedmetadata = () => {
                localVideo.play().catch(e => console.warn('Video play warning:', e));
            };
        }
        
        if (videoCallContainer) {
            videoCallContainer.style.display = 'block';
            videoCallContainer.classList.remove('hidden');
            videoCallContainer.classList.remove('audio-only');
        }
        
        isInCall = true;
        isMuted = false;
        isVideoOff = false;
        updateCallButtons();
        
        showToast(`Video call started with ${currentChat.name}`, 'success');
        
        if (currentChat.friendId) {
            await startCall(currentChat.friendId, 'video', currentChat.name);
        }
        
    } catch (error) {
        console.error('Error with simple constraints:', error);
        showToast('Failed to start video call even with basic settings', 'error');
        isInCall = false;
        cleanupMediaStream();
    }
}

// ADD PERMISSION INSTRUCTIONS FUNCTION:
function showPermissionInstructions() {
    const instructions = `
        <div class="permission-instructions">
            <h3>How to Enable Camera/Microphone Permissions</h3>
            <div class="browser-instructions">
                <div class="browser-chrome">
                    <strong>Chrome:</strong>
                    <ol>
                        <li>Click the lock/camera icon in the address bar</li>
                        <li>Change "Camera" and "Microphone" to "Allow"</li>
                        <li>Refresh the page and try again</li>
                    </ol>
                </div>
                <div class="browser-firefox">
                    <strong>Firefox:</strong>
                    <ol>
                        <li>Click the camera icon in the address bar</li>
                        <li>Select "Allow" for camera and microphone</li>
                        <li>Check "Remember this decision"</li>
                        <li>Refresh the page</li>
                    </ol>
                </div>
                <div class="browser-edge">
                    <strong>Edge:</strong>
                    <ol>
                        <li>Click the camera icon in the address bar</li>
                        <li>Toggle camera and microphone to "Allow"</li>
                        <li>Refresh the page</li>
                    </ol>
                </div>
                <div class="browser-safari">
                    <strong>Safari:</strong>
                    <ol>
                        <li>Go to Safari → Preferences → Websites</li>
                        <li>Find Camera/Microphone and set to "Allow"</li>
                        <li>Refresh the page</li>
                    </ol>
                </div>
            </div>
            <button onclick="closePermissionInstructions()" class="btn-primary">Got it</button>
        </div>
    `;
    
    // Create and show instructions modal
    const modal = document.createElement('div');
    modal.className = 'permission-modal';
    modal.innerHTML = instructions;
    document.body.appendChild(modal);
}

// ADD FUNCTION TO CLOSE INSTRUCTIONS:
function closePermissionInstructions() {
    const modal = document.querySelector('.permission-modal');
    if (modal) {
        modal.remove();
    }
}

// UPDATE THE CLEANUP FUNCTION:
function cleanupMediaStream() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }
    
    // Hide video call container
    const videoCallContainer = document.getElementById('videoCallContainer');
    if (videoCallContainer) {
        videoCallContainer.style.display = 'none';
        videoCallContainer.classList.add('hidden');
        videoCallContainer.classList.remove('audio-only');
    }
}

// UPDATE THE updateCallButtons FUNCTION TO HANDLE AUDIO-ONLY:
function updateCallButtons() {
    const muteBtn = document.querySelector('.call-mute');
    const videoBtn = document.querySelector('.call-video');
    
    if (muteBtn) {
        muteBtn.innerHTML = isMuted ? '🎤' : '🔇';
        muteBtn.title = isMuted ? 'Unmute' : 'Mute';
    }
    
    if (videoBtn) {
        if (isVideoOff) {
            videoBtn.innerHTML = '📹';
            videoBtn.title = 'Turn video on';
            videoBtn.style.opacity = '0.5';
        } else {
            videoBtn.innerHTML = '📷';
            videoBtn.title = 'Turn video off';
            videoBtn.style.opacity = '1';
        }
    }
}

// UPDATE startVoiceCall FUNCTION:
async function startVoiceCall() {
    if (!currentChat) {
        showToast('Please select a chat first', 'error');
        disableCallButtons(false); // Re-enable buttons
        return;
    }

    try {
        console.log('Starting voice call with:', currentChat.name);
        showToast('Starting voice call...', 'info');
        
        // Check browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support voice calling.');
        }

        // Request ONLY microphone permissions - NO CAMERA
        const constraints = {
            video: false, // Explicitly false for voice calls
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            }
        };
        
        console.log('Requesting microphone permissions...');
        
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Microphone access granted');
        
        // Show call container (voice call mode)
        const videoCallContainer = document.getElementById('videoCallContainer');
        if (videoCallContainer) {
            videoCallContainer.style.display = 'block';
            videoCallContainer.classList.remove('hidden');
            
            // Hide local video for voice call
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.style.display = 'none';
            }
            
            // Show voice call indicator
            let voiceCallInfo = document.getElementById('voiceCallInfo');
            if (!voiceCallInfo) {
                voiceCallInfo = document.createElement('div');
                voiceCallInfo.id = 'voiceCallInfo';
                voiceCallInfo.className = 'text-center text-white p-4';
                voiceCallInfo.innerHTML = `
                    <div class="bg-purple-600 rounded-lg p-6">
                        <i class="fas fa-phone text-4xl mb-2"></i>
                        <p class="text-lg font-semibold">Voice Call with ${currentChat.name}</p>
                        <p class="text-sm opacity-75">Call in progress...</p>
                    </div>
                `;
                videoCallContainer.appendChild(voiceCallInfo);
            }
        }
        
        // Set call state
        isInCall = true;
        isMuted = false;
        isVideoOff = true; // Voice call has no video
        
        // Update UI buttons
        updateCallButtons();
        
        console.log('Voice call started successfully');
        showToast(`Voice call started with ${currentChat.name}`, 'success');
        
        // Start WebRTC connection
        if (currentChat.friendId) {
            await startCall(currentChat.friendId, 'voice', currentChat.name);
        }
        
    } catch (error) {
        console.error('Error starting voice call:', error);
        disableCallButtons(false); // Re-enable buttons on error
        
        let errorMessage = 'Cannot access microphone. ';
        
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Please allow microphone permissions in your browser settings.';
            showPermissionInstructions();
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No microphone found. Please check your audio device.';
        } else if (error.name === 'NotReadableError') {
            errorMessage += 'Microphone is already in use by another application.';
        } else {
            errorMessage += error.message;
        }
        
        showToast(errorMessage, 'error');
    }
}


// Show permission instructions
function showPermissionInstructions() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 class="text-lg font-semibold mb-3">Camera & Microphone Permissions Required</h3>
            <p class="text-gray-600 mb-4">To make calls, please allow camera and microphone access:</p>
            <div class="bg-yellow-50 p-4 rounded-lg mb-4">
                <h4 class="font-medium mb-2">How to enable:</h4>
                <ul class="text-sm text-yellow-700 list-disc list-inside space-y-1">
                    <li>Look for the camera/microphone icon in your browser's address bar</li>
                    <li>Click the icon and select "Allow"</li>
                    <li>Refresh the page and try again</li>
                    <li>Make sure you're using HTTPS</li>
                </ul>
            </div>
            <div class="flex justify-end">
                <button id="closePermissionHelp" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    OK, I Understand
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#closePermissionHelp').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
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

console.log('Chat application JavaScript loaded successfully')
// Function to open business profile
function openBusinessProfile(userId) {
    const businessDocRef = firebase.firestore().collection('business').doc(userId);
    const userDocRef = firebase.firestore().collection('users').doc(userId);
    
    Promise.all([businessDocRef.get(), userDocRef.get()]).then(([businessDoc, userDoc]) => {
        if (businessDoc.exists && userDoc.exists) {
            const businessData = businessDoc.data();
            const userData = userDoc.data();
            
            // Update modal content
            document.getElementById('businessProfileName').textContent = userData.displayName || userData.userName;
            document.getElementById('businessProfileAvatar').src = userData.photoURL || './assets/default-avatar.png';
            
            // Show greeting message if available
            if (businessData.greetingMessage) {
                document.getElementById('businessGreetingSection').classList.remove('hidden');
                document.getElementById('businessGreetingMessage').textContent = businessData.greetingMessage;
            }
            
            // Show away message if enabled
            if (businessData.awayEnabled && businessData.awayMessage) {
                document.getElementById('businessAwaySection').classList.remove('hidden');
                document.getElementById('businessAwayMessage').textContent = businessData.awayMessage;
            }
            
            // Show catalogue if available
            if (businessData.catalogue && businessData.catalogue.length > 0) {
                document.getElementById('businessCatalogueSection').classList.remove('hidden');
                const catalogueList = document.getElementById('businessCatalogueList');
                catalogueList.innerHTML = businessData.catalogue.map(product => `
                    <div class="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                        <span class="font-medium">${product.name}</span>
                        <span class="text-green-600 font-semibold">$${product.price}</span>
                    </div>
                `).join('');
            }
            
            // Open modal
            document.getElementById('businessProfileModal').classList.remove('hidden');
        }
    }).catch(error => {
        console.error('Error loading business profile:', error);
        showToast('Error loading business profile', 'error');
    });
}

// Close business profile modal
document.getElementById('closeBusinessProfile')?.addEventListener('click', () => {
    document.getElementById('businessProfileModal').classList.add('hidden');
});

// Start chat from business profile
document.getElementById('startBusinessChat')?.addEventListener('click', () => {
    // Get the user ID from somewhere (you might need to store it when opening the modal)
    const businessUserId = document.getElementById('businessProfileModal').getAttribute('data-user-id');
    if (businessUserId) {
        createNewChat(businessUserId, document.getElementById('businessProfileName').textContent);
        document.getElementById('businessProfileModal').classList.add('hidden');
    }
});
// Add business profile button to chat header
function addBusinessProfileButton(otherUserId) {
    const chatHeader = document.getElementById('chatHeader');
    const existingButton = document.getElementById('businessProfileBtn');
    
    if (!existingButton) {
        const businessProfileBtn = document.createElement('button');
        businessProfileBtn.id = 'businessProfileBtn';
        businessProfileBtn.className = 'bg-green-500 text-white p-2 rounded-xl hover:bg-green-600 transition-colors ml-2';
        businessProfileBtn.innerHTML = '<i class="fas fa-store"></i>';
        businessProfileBtn.title = 'View Business Profile';
        businessProfileBtn.addEventListener('click', () => {
            openBusinessProfile(otherUserId);
        });
        
        const chatActions = chatHeader.querySelector('.flex.space-x-3');
        if (chatActions) {
            chatActions.appendChild(businessProfileBtn);
        }
    }
}

// In your loadChat function, add this:
// In your chat selection function (this might be called loadChat or similar)
function loadChat(chatId, otherUserId, otherUserName, otherUserAvatar) {
    // Update global variables
    currentChatId = chatId;
    currentOtherUserId = otherUserId;
    currentOtherUserName = otherUserName;
    
    console.log('Loading chat:', chatId, 'with user:', otherUserName);
    
    // Your existing chat loading code...
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('inputArea').classList.remove('hidden');
    document.getElementById('noMessagesMessage').classList.add('hidden');
    
    // Update chat header
    document.getElementById('chatTitle').textContent = otherUserName;
    document.getElementById('chatAvatar').src = otherUserAvatar || './assets/default-avatar.png';
    
    // Load messages for this chat
    loadMessages(chatId);
    
    // Load business info if available
    loadBusinessInfoForChat(otherUserId);
}

// Also update when creating a new chat
function createNewChat(otherUserId, otherUserName, otherUserAvatar = '') {
    const chatId = generateChatId(currentUser.uid, otherUserId);
    
    // Update global variables
    currentChatId = chatId;
    currentOtherUserId = otherUserId;
    currentOtherUserName = otherUserName;
    
    console.log('Creating new chat:', chatId);
    
    // Check if chat already exists
    firebase.firestore().collection('chats').doc(chatId).get()
        .then((doc) => {
            if (!doc.exists) {
                // Create new chat
                return firebase.firestore().collection('chats').doc(chatId).set({
                    participants: [currentUser.uid, otherUserId],
                    participantNames: {
                        [currentUser.uid]: currentUserData.displayName || currentUserData.userName,
                        [otherUserId]: otherUserName
                    },
                    participantAvatars: {
                        [currentUser.uid]: currentUserData.photoURL || '',
                        [otherUserId]: otherUserAvatar || ''
                    },
                    lastMessage: '',
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        })
        .then(() => {
            // Load the newly created chat
            loadChat(chatId, otherUserId, otherUserName, otherUserAvatar);
            showToast(`Started chat with ${otherUserName}`, 'success');
        })
        .catch((error) => {
            console.error('Error creating chat:', error);
            showToast('Error creating chat', 'error');
        });
}
// In your renderChats function, add business badges
function renderChats(chats) {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';
    
    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item p-3 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors';
        chatItem.setAttribute('data-chat-id', chat.id);
        chatItem.setAttribute('data-other-user-id', chat.otherUserId);
        
        let businessBadge = '';
        if (chat.isBusinessAccount) {
            businessBadge = '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full ml-2">Business</span>';
        }
        
        chatItem.innerHTML = `
            <div class="flex items-center">
                <img src="${chat.avatar}" alt="${chat.name}" class="w-12 h-12 rounded-xl object-cover">
                <div class="ml-3 flex-1">
                    <div class="flex items-center">
                        <h4 class="font-semibold text-gray-900">${chat.name}</h4>
                        ${businessBadge}
                    </div>
                    <p class="text-sm text-gray-500 truncate">${chat.lastMessage || 'No messages yet'}</p>
                </div>
                <div class="text-right">
                    <span class="text-xs text-gray-400">${formatTime(chat.timestamp)}</span>
                    ${chat.unreadCount > 0 ? `<span class="ml-2 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">${chat.unreadCount}</span>` : ''}
                </div>
            </div>
        `;
        
        chatList.appendChild(chatItem);
    });
}
// AI SUMMARIZE CONVERSATION - ACTUAL IMPLEMENTATION
document.getElementById('aiSummarize')?.addEventListener('click', () => {
    if (!currentChatId) {
        showToast('Please select a conversation first', 'warning');
        return;
    }
    
    showToast('Summarizing conversation...', 'info');
    
    // Get recent messages for summarization
    firebase.firestore().collection('chats').doc(currentChatId).collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get()
        .then((snapshot) => {
            const messages = [];
            snapshot.forEach(doc => {
                const message = doc.data();
                if (message.text && message.type !== 'system') {
                    messages.push({
                        text: message.text,
                        sender: message.senderId === currentUser.uid ? 'You' : 'Them',
                        time: message.timestamp?.toDate().toLocaleTimeString() || ''
                    });
                }
            });
            
            if (messages.length === 0) {
                showToast('No messages to summarize', 'warning');
                return;
            }
            
            // Reverse to get chronological order
            messages.reverse();
            
            // Generate summary using AI (you can replace this with actual AI API)
            const summary = generateConversationSummary(messages);
            
            // Show summary in a modal or directly in chat
            showAISummaryModal(summary, messages.length);
            
        }).catch(error => {
            console.error('Error summarizing conversation:', error);
            showToast('Error summarizing conversation', 'error');
        });
});

// Generate conversation summary
function generateConversationSummary(messages) {
    // This is a simple rule-based summary - replace with actual AI API call
    const totalMessages = messages.length;
    const yourMessages = messages.filter(m => m.sender === 'You').length;
    const theirMessages = messages.filter(m => m.sender === 'Them').length;
    
    // Extract key topics (simple keyword extraction)
    const allText = messages.map(m => m.text).join(' ').toLowerCase();
    const commonWords = ['hello', 'hi', 'hey', 'ok', 'yes', 'no', 'thanks', 'thank you'];
    const words = allText.split(/\s+/).filter(word => 
        word.length > 3 && !commonWords.includes(word)
    );
    
    // Count word frequency
    const wordCount = {};
    words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // Get top 3 topics
    const topics = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => word);
    
    // Generate summary
    const summary = `
        🤖 **Conversation Summary**
        
        📊 **Statistics:**
        • Total messages: ${totalMessages}
        • Your messages: ${yourMessages}
        • Their messages: ${theirMessages}
        
        🔍 **Key Topics:**
        ${topics.map(topic => `• ${topic}`).join('\n')}
        
        💬 **Recent Activity:**
        ${messages.slice(-3).map(m => `• ${m.sender}: "${m.text.substring(0, 50)}${m.text.length > 50 ? '...' : ''}"`).join('\n')}
    `;
    
    return summary;
}
// FIXED: Load Privacy Settings
function loadPrivacySettings() {
    if (!currentUser) return;
    
    // Load current privacy settings
    const privacySettings = currentUserData.privacySettings || userSettings.privacy;
    
    // Set form values
    const lastSeenPrivacy = document.getElementById("lastSeenPrivacy");
    const profilePhotoPrivacy = document.getElementById("profilePhotoPrivacy");
    const aboutPrivacy = document.getElementById("aboutPrivacy");
    const statusPrivacy = document.getElementById("statusPrivacy");
    const readReceiptsPrivacy = document.getElementById("readReceiptsPrivacy");
    const disappearingMessagesPrivacy = document.getElementById("disappearingMessagesPrivacy");
    const callsPrivacy = document.getElementById("callsPrivacy");
    
    if (lastSeenPrivacy) lastSeenPrivacy.value = privacySettings.lastSeen || 'everyone';
    if (profilePhotoPrivacy) profilePhotoPrivacy.value = privacySettings.profilePhoto || 'everyone';
    if (aboutPrivacy) aboutPrivacy.value = privacySettings.about || 'everyone';
    if (statusPrivacy) statusPrivacy.value = privacySettings.status || 'everyone';
    if (readReceiptsPrivacy) readReceiptsPrivacy.checked = privacySettings.readReceipts !== false;
    if (disappearingMessagesPrivacy) disappearingMessagesPrivacy.value = privacySettings.disappearingMessages || 'off';
    if (callsPrivacy) callsPrivacy.value = privacySettings.calls || 'everyone';
}

// Call this when privacy modal opens
document.getElementById("privacySettingsBtn")?.addEventListener("click", () => {
    document.getElementById("privacySettingsModal").classList.remove("hidden");
    loadPrivacySettings();
});
// FIXED: Security Settings Implementation
function loadSecuritySettings() {
    if (!currentUser) return;
    
    const securitySettings = currentUserData.securitySettings || userSettings.security;
    
    // Set security toggles
    const securityNotifications = document.getElementById("securityNotifications");
    const passkeyToggle = document.getElementById("passkeyToggle");
    const twoStepVerification = document.getElementById("twoStepVerification");
    
    if (securityNotifications) securityNotifications.checked = securitySettings.notifications !== false;
    if (passkeyToggle) passkeyToggle.checked = securitySettings.passkeys || false;
    if (twoStepVerification) twoStepVerification.checked = securitySettings.twoStepVerification || false;
}

// Security settings event listeners
document.getElementById("securitySettingsBtn")?.addEventListener("click", () => {
    // Since you mentioned security is under account settings, open that modal
    document.getElementById("accountSettingsModal").classList.remove("hidden");
    loadSecuritySettings();
});

// Business platform
document.getElementById("businessPlatformBtn")?.addEventListener("click", () => {
    showToast("Opening business platform...", "info");
    // Implement business platform logic here
});

// Change number
document.getElementById("changeNumberBtn")?.addEventListener("click", () => {
    const newNumber = prompt("Enter your new phone number:");
    if (newNumber) {
        // Validate and update number
        updatePhoneNumber(newNumber);
    }
});

// Request account info
document.getElementById("requestAccountInfoBtn")?.addEventListener("click", () => {
    if (confirm("This will generate a report of your account data. Continue?")) {
        requestAccountInfo();
    }
});

// Delete account
document.getElementById("deleteAccountBtn")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
        if (confirm("This will permanently delete all your data. Type DELETE to confirm:")) {
            deleteAccount();
        }
    }
});

// Implement the security functions
async function updatePhoneNumber(newNumber) {
    try {
        // Update in Firebase Auth
        await currentUser.updatePhoneNumber(newNumber);
        
        // Update in Firestore
        await db.collection('users').doc(currentUser.uid).update({
            phone: newNumber,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast("Phone number updated successfully", "success");
    } catch (error) {
        console.error("Error updating phone number:", error);
        showToast("Error updating phone number", "error");
    }
}

async function requestAccountInfo() {
    try {
        showToast("Generating account report...", "info");
        
        // This would typically be a server-side function
        // For demo, we'll create a simple client-side report
        const userData = await db.collection('users').doc(currentUser.uid).get();
        const userMessages = await db.collection('messages')
            .where('senderId', '==', currentUser.uid)
            .limit(1000)
            .get();
            
        const report = {
            user: userData.data(),
            messageCount: userMessages.size,
            generatedAt: new Date().toISOString()
        };
        
        // Download as JSON file
        downloadJSON(report, 'kynecta_account_data.json');
        showToast("Account report downloaded", "success");
        
    } catch (error) {
        console.error("Error generating account report:", error);
        showToast("Error generating account report", "error");
    }
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function deleteAccount() {
    try {
        showToast("Deleting account...", "info");
        
        // Delete user data from Firestore
        await db.collection('users').doc(currentUser.uid).delete();
        
        // Delete user's messages
        const userMessages = await db.collection('messages')
            .where('senderId', '==', currentUser.uid)
            .get();
            
        const batch = db.batch();
        userMessages.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        // Delete user account from Firebase Auth
        await currentUser.delete();
        
        showToast("Account deleted successfully", "success");
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error("Error deleting account:", error);
        showToast("Error deleting account: " + error.message, "error");
    }
}
// COMPLETE: Setup all invite functionality
function setupAllInviteFeatures() {
    console.log("Setting up invite features...");
    
    // Check if buttons exist
    const buttons = {
        whatsapp: document.getElementById("shareWhatsapp"),
        facebook: document.getElementById("shareFacebook"),
        email: document.getElementById("shareEmail"),
        qr: document.getElementById("shareQR"),
        copy: document.getElementById("copyInviteLink"),
        sms: document.getElementById("shareSMS")
    };
    
    console.log("Found buttons:", buttons);
    
    // Setup each feature
    setupWhatsAppShare();
    setupCopyLink();
    setupSMSShare();
    
    // Setup other features
    setupQRCode();
    setupFacebookShare();
    setupEmailShare();
}

// Add these to your existing setup
function setupQRCode() {
    document.getElementById("shareQR")?.addEventListener("click", generateQRCode);
}

function setupFacebookShare() {
    document.getElementById("shareFacebook")?.addEventListener("click", function() {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://kynecta.com')}`;
        window.open(url, '_blank', 'width=600,height=400');
    });
}

function setupEmailShare() {
    document.getElementById("shareEmail")?.addEventListener("click", function() {
        const subject = "Join me on Kynecta!";
        const body = "I'm using Kynecta to chat and connect. Download the app so we can chat there!\n\nDownload: https://kynecta.com";
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
}
// ADD THIS FUNCTION: QR Code Generator
// REAL QR Code Generator
function generateQRCode() {
    try {
        let qrModal = document.getElementById('qrCodeModal');
        
        if (!qrModal) {
            qrModal = document.createElement('div');
            qrModal.id = 'qrCodeModal';
            qrModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden';
            qrModal.innerHTML = `
                <div class="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">Scan QR Code to Invite</h3>
                        <button id="closeQRCode" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="qrCodeContainer" class="flex justify-center p-4 bg-white rounded-lg border">
                        <canvas id="qrCodeCanvas" width="200" height="200"></canvas>
                    </div>
                    <div class="mt-4 text-center">
                        <p class="text-sm text-gray-500">Share your invite code: <strong>${currentUser?.uid?.substring(0, 8) || 'USER123'}</strong></p>
                        <button id="downloadQRCode" class="mt-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                            Download QR Code
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(qrModal);
            
            document.getElementById('closeQRCode')?.addEventListener('click', () => {
                qrModal.classList.add('hidden');
            });
            
            document.getElementById('downloadQRCode')?.addEventListener('click', downloadQRCode);
            
            qrModal.addEventListener('click', (e) => {
                if (e.target === qrModal) {
                    qrModal.classList.add('hidden');
                }
            });
        }
        
        // Generate actual QR code
        const inviteLink = `https://kynecta.com/invite/${currentUser?.uid || 'user'}`;
        const canvas = document.getElementById('qrCodeCanvas');
        
        QRCode.toCanvas(canvas, inviteLink, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        }, function(error) {
            if (error) {
                console.error('QR Code generation error:', error);
                showToast("Error generating QR code", "error");
            } else {
                console.log('QR Code generated successfully');
            }
        });
        
        qrModal.classList.remove('hidden');
        
    } catch (error) {
        console.error("Error generating QR code:", error);
        showToast("Error generating QR code", "error");
    }
}

// Download QR Code function
function downloadQRCode() {
    const canvas = document.getElementById('qrCodeCanvas');
    const link = document.createElement('a');
    link.download = `kynecta-invite-${currentUser?.uid?.substring(0, 8) || 'user'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast("QR Code downloaded!", "success");
}

// WITH THIS:
function setupCopyLink() {
    const copyLinkBtn = document.getElementById("copyInviteLink");
    
    if (!copyLinkBtn) {
        console.log('Copy link button not found');
        return;
    }
    
    // Remove any existing event listeners
    copyLinkBtn.replaceWith(copyLinkBtn.cloneNode(true));
    const newCopyBtn = document.getElementById("copyInviteLink");
    
    newCopyBtn.addEventListener("click", async function() {
        console.log('Copy link clicked');
        const inviteLink = `https://kynecta.com/invite/${currentUser?.uid || 'user'}`;
        
        try {
            // Method 1: Modern clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(inviteLink);
                showToast("✅ Invite link copied to clipboard!", "success");
                console.log('Copied via clipboard API');
                return;
            }
            
            // Method 2: Legacy approach
            const textArea = document.createElement("textarea");
            textArea.value = inviteLink;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "0";
            textArea.setAttribute('readonly', '');
            document.body.appendChild(textArea);
            textArea.select();
            textArea.setSelectionRange(0, 99999);
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                showToast("✅ Invite link copied to clipboard!", "success");
                console.log('Copied via execCommand');
            } else {
                throw new Error('execCommand failed');
            }
            
        } catch (error) {
            console.error("Copy failed:", error);
            showManualCopyOption(inviteLink);
        }
    });
    
    console.log('Copy link setup complete');
}

function showManualCopyOption(link) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-lg font-semibold mb-3">Copy Invite Link</h3>
            <p class="text-gray-600 mb-3">Select and copy the link below:</p>
            <input type="text" id="manualCopyInput" value="${link}" 
                   class="w-full p-3 border border-gray-300 rounded-lg mb-4 font-mono text-sm" readonly>
            <div class="flex justify-end space-x-3">
                <button id="closeManualCopy" class="px-4 py-2 text-gray-600 hover:text-gray-800">Close</button>
                <button id="copyFromInput" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    Copy Text
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = document.getElementById('manualCopyInput');
    input.select();
    
    document.getElementById('closeManualCopy').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    document.getElementById('copyFromInput').addEventListener('click', () => {
        input.select();
        try {
            document.execCommand('copy');
            showToast("✅ Link copied to clipboard!", "success");
            document.body.removeChild(modal);
        } catch (error) {
            showToast("❌ Please select and copy the text manually", "error");
        }
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}
// FIXED: WhatsApp Sharing that actually directs to user's WhatsApp
function setupWhatsAppShare() {
    const whatsappBtn = document.getElementById("shareWhatsapp");
    
    if (!whatsappBtn) return;
    
    whatsappBtn.addEventListener("click", function() {
        const message = "Join me on Kynecta! Let's chat on this amazing app. Download here: https://kynecta.com";
        const encodedMessage = encodeURIComponent(message);
        
        // Use the correct WhatsApp API URL that opens in the app directly
        const whatsappUrl = `whatsapp://send?text=${encodedMessage}`;
        
        // First try to open WhatsApp app directly
        window.location.href = whatsappUrl;
        
        // Fallback: If WhatsApp app is not available, open web version
        setTimeout(() => {
            if (!document.hidden) {
                const webWhatsappUrl = `https://web.whatsapp.com/send?text=${encodedMessage}`;
                window.open(webWhatsappUrl, '_blank');
                
                // Final fallback: Copy to clipboard
                setTimeout(() => {
                    navigator.clipboard.writeText(message).then(() => {
                        showToast("📋 Message copied! Open WhatsApp and paste it", "info");
                    });
                }, 1000);
            }
        }, 500);
    });
}
// FIXED: SMS Sharing that opens native messaging app
function setupSMSShare() {
    const smsBtn = document.getElementById("shareSMS");
    
    if (!smsBtn) return;
    
    smsBtn.addEventListener("click", function() {
        const message = "Join me on Kynecta! Download the app: https://kynecta.com";
        
        // Use proper SMS URI for mobile devices
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            // For mobile devices - opens native messaging app
            const smsUrl = `sms:&body=${encodeURIComponent(message)}`;
            window.location.href = smsUrl;
        } else {
            // For desktop - provide copy option
            navigator.clipboard.writeText(message).then(() => {
                showToast("📱 SMS message copied! Paste it in your messaging app", "success");
            }).catch(() => {
                showToast("📱 Please copy this message to send via SMS: " + message, "info");
            });
        }
        
        // Fallback check
        setTimeout(() => {
            if (window.location.href.includes('chat.html')) {
                showToast("📱 If messaging app didn't open, please send the message manually", "info");
            }
        }, 2000);
    });
}
// chat.js

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
        
        // Add safe image loading
        const avatar = friendItem.querySelector('.friend-avatar');
        if (avatar) {
            avatar.onerror = function() {
                this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`;
            };
        }
        
        friendsList.appendChild(friendItem);
    });

    // Add event listeners for friend actions
    setupFriendEventListeners();
}

// FIXED: Safe element checker for all DOM operations
function safeElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with id '${id}' not found`);
        return null;
    }
    return element;
}

function safeQuery(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.warn(`Element with selector '${selector}' not found`);
        return null;
    }
    return element;
}
function fixAllImagesOnLoad() {
    console.log('Scanning for broken images...');
    document.querySelectorAll('img').forEach(img => {
        // Skip if already handled or has valid src
        if (img.classList.contains('error-handled') || 
            img.src.startsWith('data:') ||
            (img.src && img.src.startsWith('http') && !img.src.includes('IMAGE_URL') && !img.src.includes('127.0.0.1'))) {
            return;
        }
        
        // Skip empty preview images (they're meant to be empty)
        if ((img.src === '' || !img.src) && 
            (img.alt.includes('preview') || img.alt.includes('Preview') || 
             img.classList.contains('hidden') || img.id.includes('preview'))) {
            console.log('Skipping empty preview image:', img.alt || img.id);
            return;
        }
        
        // Fix problematic images
        if (!img.src || 
            img.src.includes('IMAGE_URL') || 
            img.src.includes('127.0.0.1') ||
            img.src.includes('chat.html') ||
            !img.src.startsWith('http')) {
            
            const userName = img.alt || 'User';
            console.log('Fixing image:', img.src, '->', userName);
            img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=7C3AED&color=fff`;
            img.classList.add('error-handled');
        }
    });
}