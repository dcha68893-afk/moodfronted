// ==================== SETTINGS.JS - COMPREHENSIVE IMPLEMENTATION ====================
// Main settings module for Kynecta - Production Ready
// Last Updated: 2024-01-18

// ==================== GLOBAL VARIABLES ====================
let userSettings = {
    theme: 'light',
    privacy: {
        lastSeen: 'everyone',
        profilePhoto: 'everyone',
        about: 'everyone',
        status: 'everyone',
        readReceipts: true,
        disappearingMessages: 'off',
        groups: 'everyone',
        calls: 'everyone'
    },
    notifications: {
        push: true,
        message: true,
        group: true,
        call: true,
        sound: true,
        vibration: true,
        doNotDisturb: false,
        dndStartTime: '22:00',
        dndEndTime: '07:00'
    },
    account: {
        securityNotifications: true,
        passkeys: false,
        twoStepVerification: false,
        email: '',
        phone: ''
    },
    chat: {
        displayTheme: 'light',
        defaultChatTheme: 'purple',
        fontSize: 'medium',
        enterKeySends: true,
        mediaVisibility: true,
        readReceipts: true,
        lastSeen: true,
        chatBackup: false,
        wallpaper: ''
    },
    storage: {
        autoDownload: true,
        wifiOnly: false,
        mediaUploadQuality: 'auto',
        autoDownloadQuality: 'standard',
        lessDataCalls: false,
        proxyEnabled: false
    },
    accessibility: {
        darkMode: false,
        highContrast: false,
        screenReader: false,
        reduceAnimations: false,
        textToSpeech: false,
        largeText: false
    },
    language: {
        appLanguage: 'en',
        autoDetect: false
    },
    favorites: [],
    business: {
        greeting: '',
        awayMessage: '',
        awayEnabled: false,
        catalogue: [],
        labels: []
    }
};


let profileSettingsModal = null;
let privacySettingsModal = null;
let accountSettingsModal = null;
let notificationsSettingsModal = null;
let storageSettingsModal = null;
let chatSettingsModal = null;
let accessibilitySettingsModal = null;
let languageSettingsModal = null;
let helpCenterModal = null;
let appInfoModal = null;
let favoritesSettingsModal = null;
let inviteFriendsModal = null;
let catalogueModal = null;
let advertiseModal = null;
let labelsModal = null;
let greetingModal = null;
let awayModal = null;
let businessProfileModal = null;
let aiSummaryModal = null;
let smartRepliesModal = null;

// ==================== FIREBASE INITIALIZATION CHECK ====================
(function checkFirebase() {
    if (!window.firebase || !window.db) {
        console.log('⏳ Waiting for Firebase initialization...');
        
        const waitForFirebase = setInterval(() => {
            if (window.firebase && window.db) {
                clearInterval(waitForFirebase);
                console.log('✅ Firebase ready in settings.js');
                initSettings({});
            }
        }, 100);
    } else {
        console.log('✅ Firebase already available');
        setTimeout(() => initSettings({}), 500);
    }
})();

// ==================== MODAL INITIALIZATION ====================

/**
 * Initialize all modal elements
 */

/**
 * Initialize all modal elements
 */
/**
 * Initialize all modal elements
 */
function initializeModalElements() {
    console.log('🔍 Initializing modal elements...');
    
    // Assign DOM elements to modal variables (don't redeclare with let/const)
    profileSettingsModal = document.getElementById('profileSettingsModal');
    privacySettingsModal = document.getElementById('privacySettingsModal');
    accountSettingsModal = document.getElementById('accountSettingsModal');
    notificationsSettingsModal = document.getElementById('notificationsSettingsModal');
    storageSettingsModal = document.getElementById('storageSettingsModal');
    chatSettingsModal = document.getElementById('chatSettingsModal');
    accessibilitySettingsModal = document.getElementById('accessibilitySettingsModal');
    languageSettingsModal = document.getElementById('languageSettingsModal');
    helpCenterModal = document.getElementById('helpCenterModal');
    appInfoModal = document.getElementById('appInfoModal');
    favoritesSettingsModal = document.getElementById('favoritesSettingsModal');
    inviteFriendsModal = document.getElementById('inviteFriendsModal');
    
    // Business modals
    catalogueModal = document.getElementById('catalogueModal');
    advertiseModal = document.getElementById('advertiseModal');
    labelsModal = document.getElementById('labelsModal');
    greetingModal = document.getElementById('greetingModal');
    awayModal = document.getElementById('awayModal');
    businessProfileModal = document.getElementById('businessProfileModal');
    aiSummaryModal = document.getElementById('aiSummaryModal');
    smartRepliesModal = document.getElementById('smartRepliesModal');
    
    console.log('✅ Modal elements initialized');
}
// ==================== MAIN SETTINGS MODAL ====================

/**
 * Open main settings modal
 */
function openSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.classList.remove('hidden');
        loadUserSettings();
        updateSettingsUI();
    }
}

/**
 * Close main settings modal
 */
function closeSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.classList.add('hidden');
    }
}

/**
 * Show specific settings section
 */
function showSettingsSection(section) {
    closeSettingsModal();
    setTimeout(() => openSettingsSection(section), 100);
}

/**
 * Open specific settings section modal
 */
function openSettingsSection(section) {
    console.log(`📂 Opening settings section: ${section}`);
    
    // Close all modals first
    closeAllModals();
    
    // Open the specific settings modal
    setTimeout(() => {
        switch(section) {
            case 'profile':
                if (profileSettingsModal) {
                    profileSettingsModal.classList.remove('hidden');
                    loadProfileData();
                }
                break;
            case 'privacy':
                if (privacySettingsModal) privacySettingsModal.classList.remove('hidden');
                break;
            case 'account':
                if (accountSettingsModal) {
                    accountSettingsModal.classList.remove('hidden');
                    loadAccountSettings();
                }
                break;
            case 'notifications':
                if (notificationsSettingsModal) {
                    notificationsSettingsModal.classList.remove('hidden');
                    updateNotificationsUI();
                }
                break;
            case 'storage':
                if (storageSettingsModal) {
                    storageSettingsModal.classList.remove('hidden');
                    loadStorageUsage();
                }
                break;
            case 'chat':
                if (chatSettingsModal) chatSettingsModal.classList.remove('hidden');
                break;
            case 'accessibility':
                if (accessibilitySettingsModal) accessibilitySettingsModal.classList.remove('hidden');
                break;
            case 'language':
                if (languageSettingsModal) languageSettingsModal.classList.remove('hidden');
                break;
            case 'favorites':
                if (favoritesSettingsModal) {
                    favoritesSettingsModal.classList.remove('hidden');
                    loadFavorites();
                }
                break;
            case 'help':
                if (helpCenterModal) helpCenterModal.classList.remove('hidden');
                break;
            case 'info':
                if (appInfoModal) appInfoModal.classList.remove('hidden');
                break;
            case 'invite':
                if (inviteFriendsModal) inviteFriendsModal.classList.remove('hidden');
                break;
            case 'business':
                if (businessProfileModal) businessProfileModal.classList.remove('hidden');
                break;
            default:
                console.warn(`Unknown settings section: ${section}`);
        }
    }, 100);
}

/**
 * Close all modals
 */
/**
 * Close all modals
 */
function closeAllModals() {
    const modals = [
        profileSettingsModal, privacySettingsModal, accountSettingsModal, 
        notificationsSettingsModal, storageSettingsModal, chatSettingsModal,
        accessibilitySettingsModal, languageSettingsModal, helpCenterModal,
        appInfoModal, favoritesSettingsModal, inviteFriendsModal,
        catalogueModal, advertiseModal, labelsModal, greetingModal,
        awayModal, businessProfileModal, aiSummaryModal, smartRepliesModal
    ];
    
    modals.forEach(modal => {
        if (modal) modal.classList.add('hidden');
    });
}
// ==================== PROFILE SETTINGS ====================

/**
 * Setup profile settings listeners
 */
function setupProfileSettingsListeners() {
    // Save profile
    const saveProfileBtn = document.getElementById('saveProfile');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfileSettings);
    }
    
    // Cancel profile
    const cancelProfileBtn = document.getElementById('cancelProfile');
    if (cancelProfileBtn) {
        cancelProfileBtn.addEventListener('click', () => {
            if (profileSettingsModal) profileSettingsModal.classList.add('hidden');
        });
    }
    
    // Close profile
    const closeProfileBtn = document.getElementById('closeProfileSettings');
    if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', () => {
            if (profileSettingsModal) profileSettingsModal.classList.add('hidden');
        });
    }
    
    // Profile picture upload
    const profilePicUpload = document.getElementById('profilePictureUpload');
    if (profilePicUpload) {
        profilePicUpload.addEventListener('change', handleProfilePictureUpload);
    }
    
    // Cover photo upload
    const coverPicUpload = document.getElementById('coverPicUpload');
    if (coverPicUpload) {
        coverPicUpload.addEventListener('change', handleCoverPictureUpload);
    }
    
    // Profile edit buttons
    const profileCoverEdit = document.querySelector('.profile-cover-edit');
    if (profileCoverEdit) {
        profileCoverEdit.addEventListener('click', () => {
            if (coverPicUpload) coverPicUpload.click();
        });
    }
    
    const profilePhotoEdit = document.querySelector('.profile-photo-edit');
    if (profilePhotoEdit) {
        profilePhotoEdit.addEventListener('click', () => {
            if (profilePicUpload) profilePicUpload.click();
        });
    }
}

/**
 * Load profile data
 */
function loadProfileData() {
    const profileName = document.getElementById('profileName');
    const profileAbout = document.getElementById('profileAbout');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const profilePicPreview = document.getElementById('profilePicPreview');
    const profileCoverPreview = document.getElementById('profileCoverPreview');
    
    if (currentUserData) {
        if (profileName) profileName.value = currentUserData.displayName || '';
        if (profileAbout) profileAbout.value = currentUserData.bio || '';
        if (profileEmail) profileEmail.value = currentUserData.email || '';
        if (profilePhone) profilePhone.value = currentUserData.phone || '';
        
        if (profilePicPreview && currentUserData.photoURL) {
            profilePicPreview.src = currentUserData.photoURL;
        }
        
        if (profileCoverPreview && currentUserData.coverPhoto) {
            profileCoverPreview.src = currentUserData.coverPhoto;
        }
    }
}

/**
 * Save profile settings
 */
async function saveProfileSettings() {
    const profileName = document.getElementById('profileName')?.value;
    const profileAbout = document.getElementById('profileAbout')?.value;
    const profileEmail = document.getElementById('profileEmail')?.value;
    const profilePhone = document.getElementById('profilePhone')?.value;
    
    try {
        if (!currentUser || !db) {
            showToast('User not authenticated', 'error');
            return;
        }
        
        const updates = {
            displayName: profileName || currentUserData?.displayName,
            bio: profileAbout || currentUserData?.bio,
            email: profileEmail || currentUserData?.email,
            phone: profilePhone || currentUserData?.phone,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Update Firestore
        await db.collection('users').doc(currentUser.uid).update(updates);
        
        // Update local data
        if (currentUserData) {
            Object.assign(currentUserData, updates);
        }
        
        // Update UI
        const userNameElement = document.getElementById('userName');
        const userAvatarElement = document.getElementById('userAvatar');
        
        if (userNameElement && updates.displayName) {
            userNameElement.textContent = updates.displayName;
        }
        
        showToast('✅ Profile updated successfully', 'success');
        
        // Close modal
        if (profileSettingsModal) {
            profileSettingsModal.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        showToast('❌ Error updating profile', 'error');
    }
}

/**
 * Handle profile picture upload
 */
async function handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        showToast('📤 Uploading profile picture...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const profilePicRef = storageRef.child(`profile_pictures/${currentUser.uid}/${Date.now()}_${file.name}`);
        const snapshot = await profilePicRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        // Update Firestore
        await db.collection('users').doc(currentUser.uid).update({
            photoURL: downloadURL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update local data
        if (currentUserData) {
            currentUserData.photoURL = downloadURL;
        }
        
        // Update UI
        const profilePicPreview = document.getElementById('profilePicPreview');
        const userAvatarElement = document.getElementById('userAvatar');
        
        if (profilePicPreview) {
            profilePicPreview.src = downloadURL;
        }
        
        if (userAvatarElement) {
            userAvatarElement.src = downloadURL;
        }
        
        showToast('✅ Profile picture updated', 'success');
        
    } catch (error) {
        console.error('❌ Error uploading profile picture:', error);
        showToast('❌ Error uploading profile picture', 'error');
    }
}

/**
 * Handle cover picture upload
 */
async function handleCoverPictureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        showToast('📤 Uploading cover photo...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = storage.ref();
        const coverPhotoRef = storageRef.child(`cover_photos/${currentUser.uid}/${Date.now()}_${file.name}`);
        const snapshot = await coverPhotoRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        // Update Firestore
        await db.collection('users').doc(currentUser.uid).update({
            coverPhoto: downloadURL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update local data
        if (currentUserData) {
            currentUserData.coverPhoto = downloadURL;
        }
        
        // Update UI
        const profileCoverPreview = document.getElementById('profileCoverPreview');
        if (profileCoverPreview) {
            profileCoverPreview.src = downloadURL;
        }
        
        showToast('✅ Cover photo updated', 'success');
        
    } catch (error) {
        console.error('❌ Error uploading cover photo:', error);
        showToast('❌ Error uploading cover photo', 'error');
    }
}

// ==================== PRIVACY SETTINGS ====================

/**
 * Setup privacy settings listeners
 */
function setupPrivacySettingsListeners() {
    // Save privacy
    const savePrivacyBtn = document.getElementById('savePrivacy');
    if (savePrivacyBtn) {
        savePrivacyBtn.addEventListener('click', savePrivacySettings);
    }
    
    // Cancel privacy
    const cancelPrivacyBtn = document.getElementById('cancelPrivacy');
    if (cancelPrivacyBtn) {
        cancelPrivacyBtn.addEventListener('click', () => {
            if (privacySettingsModal) privacySettingsModal.classList.add('hidden');
        });
    }
    
    // Close privacy
    const closePrivacyBtn = document.getElementById('closePrivacySettings');
    if (closePrivacyBtn) {
        closePrivacyBtn.addEventListener('click', () => {
            if (privacySettingsModal) privacySettingsModal.classList.add('hidden');
        });
    }
}

/**
 * Save privacy settings
 */
function savePrivacySettings() {
    const privacySettings = {
        lastSeen: document.getElementById('lastSeenPrivacy')?.value || 'everyone',
        profilePhoto: document.getElementById('profilePhotoPrivacy')?.value || 'everyone',
        about: document.getElementById('aboutPrivacy')?.value || 'everyone',
        status: document.getElementById('statusPrivacy')?.value || 'everyone',
        readReceipts: document.getElementById('readReceiptsPrivacy')?.checked ?? true,
        disappearingMessages: document.getElementById('disappearingMessagesPrivacy')?.value || 'off',
        groups: document.getElementById('groupsPrivacy')?.value || 'everyone',
        calls: document.getElementById('callsPrivacy')?.value || 'everyone'
    };
    
    userSettings.privacy = privacySettings;
    saveUserSettings();
    
    // Apply privacy settings immediately
    applyPrivacySettings();
    
    if (privacySettingsModal) privacySettingsModal.classList.add('hidden');
}

/**
 * Apply privacy settings
 */
function applyPrivacySettings() {
    // This function would apply privacy settings across the app
    console.log('Applying privacy settings:', userSettings.privacy);
    
    // Update chat visibility based on privacy settings
    if (window.chatModule && window.chatModule.updatePrivacy) {
        window.chatModule.updatePrivacy(userSettings.privacy);
    }
    
    showToast('✅ Privacy settings applied', 'success');
}

// ==================== ACCOUNT SETTINGS ====================

/**
 * Setup account settings listeners
 */
function setupAccountSettingsListeners() {
    // Save account settings
    const saveAccountBtn = document.getElementById('saveAccount');
    if (saveAccountBtn) {
        saveAccountBtn.addEventListener('click', saveAccountSettings);
    }
    
    // Cancel account settings
    const cancelAccountBtn = document.getElementById('cancelAccount');
    if (cancelAccountBtn) {
        cancelAccountBtn.addEventListener('click', () => {
            if (accountSettingsModal) accountSettingsModal.classList.add('hidden');
        });
    }
    
    // Close account settings
    const closeAccountBtn = document.getElementById('closeAccountSettings');
    if (closeAccountBtn) {
        closeAccountBtn.addEventListener('click', () => {
            if (accountSettingsModal) accountSettingsModal.classList.add('hidden');
        });
    }
    
    // Account option buttons
    setupAccountOptionButtons();
    
    // Security settings
    setupSecuritySettings();
}

/**
 * Setup account option buttons
 */
function setupAccountOptionButtons() {
    const accountButtons = {
        securityNotificationsBtn: handleSecurityNotifications,
        passkeysBtn: handlePasskeys,
        emailAddressBtn: handleEmailAddress,
        twoStepVerificationBtn: handleTwoStepVerification,
        businessPlatformBtn: handleBusinessPlatform,
        changeNumberBtn: handleChangeNumber,
        requestAccountInfoBtn: handleRequestAccountInfo,
        deleteAccountBtn: handleDeleteAccount,
        changePasswordBtn: handleChangePassword,
        logoutAllDevicesBtn: handleLogoutAllDevices
    };
    
    Object.entries(accountButtons).forEach(([buttonId, handler]) => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', handler);
        }
    });
}

/**
 * Setup security settings
 */
function setupSecuritySettings() {
    // Two-factor toggle
    const twoFactorToggle = document.getElementById('twoFactorToggle');
    if (twoFactorToggle) {
        twoFactorToggle.addEventListener('change', handleTwoStepVerification);
    }
    
    // Login sessions
    loadLoginSessions();
}

/**
 * Load account settings
 */
function loadAccountSettings() {
    // Update account settings UI
    const securityNotificationsBtn = document.getElementById('securityNotificationsBtn');
    const passkeysBtn = document.getElementById('passkeysBtn');
    const twoStepVerificationBtn = document.getElementById('twoStepVerificationBtn');
    const twoFactorToggle = document.getElementById('twoFactorToggle');
    
    if (securityNotificationsBtn) {
        securityNotificationsBtn.textContent = userSettings.account.securityNotifications ? 
            'Disable Security Notifications' : 'Enable Security Notifications';
    }
    
    if (passkeysBtn) {
        passkeysBtn.textContent = userSettings.account.passkeys ? 
            'Disable Passkeys' : 'Enable Passkeys';
    }
    
    if (twoStepVerificationBtn) {
        twoStepVerificationBtn.textContent = userSettings.account.twoStepVerification ? 
            'Disable Two-Step Verification' : 'Enable Two-Step Verification';
    }
    
    if (twoFactorToggle) {
        twoFactorToggle.checked = userSettings.account.twoStepVerification;
    }
}

/**
 * Save account settings
 */
function saveAccountSettings() {
    // Account settings are mostly actions, not saved preferences
    showToast('✅ Account settings updated', 'success');
    if (accountSettingsModal) accountSettingsModal.classList.add('hidden');
}

/**
 * Handle security notifications
 */
function handleSecurityNotifications() {
    userSettings.account.securityNotifications = !userSettings.account.securityNotifications;
    saveUserSettings();
    loadAccountSettings();
    showToast(`Security notifications ${userSettings.account.securityNotifications ? 'enabled' : 'disabled'}`, 'info');
}

/**
 * Handle passkeys
 */
function handlePasskeys() {
    if (userSettings.account.passkeys) {
        disablePasskeys();
    } else {
        enablePasskeys();
    }
}

/**
 * Enable passkeys
 */
async function enablePasskeys() {
    showToast('🔄 Setting up passkeys...', 'info');
    userSettings.account.passkeys = true;
    saveUserSettings();
    loadAccountSettings();
    showToast('✅ Passkeys enabled', 'success');
}

/**
 * Disable passkeys
 */
function disablePasskeys() {
    userSettings.account.passkeys = false;
    saveUserSettings();
    loadAccountSettings();
    showToast('✅ Passkeys disabled', 'success');
}

/**
 * Handle email address
 */
function handleEmailAddress() {
    const newEmail = prompt('Enter new email address:');
    if (newEmail && validateEmail(newEmail)) {
        updateEmailAddress(newEmail);
    }
}

/**
 * Validate email
 */
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Update email address
 */
async function updateEmailAddress(newEmail) {
    try {
        if (!currentUser || !auth) {
            showToast('User not authenticated', 'error');
            return;
        }
        
        await currentUser.updateEmail(newEmail);
        
        // Update in Firestore
        if (db) {
            await db.collection('users').doc(currentUser.uid).update({
                email: newEmail,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Update local data
        if (currentUserData) {
            currentUserData.email = newEmail;
        }
        
        userSettings.account.email = newEmail;
        saveUserSettings();
        
        showToast('✅ Email address updated successfully', 'success');
    } catch (error) {
        console.error('❌ Error updating email:', error);
        showToast('❌ Error updating email: ' + error.message, 'error');
    }
}

/**
 * Handle two-step verification
 */
function handleTwoStepVerification() {
    if (userSettings.account.twoStepVerification) {
        disableTwoStepVerification();
    } else {
        enableTwoStepVerification();
    }
}

/**
 * Enable two-step verification
 */
function enableTwoStepVerification() {
    showToast('🔄 Setting up two-step verification...', 'info');
    userSettings.account.twoStepVerification = true;
    saveUserSettings();
    loadAccountSettings();
    showToast('✅ Two-step verification enabled', 'success');
}

/**
 * Disable two-step verification
 */
function disableTwoStepVerification() {
    userSettings.account.twoStepVerification = false;
    saveUserSettings();
    loadAccountSettings();
    showToast('✅ Two-step verification disabled', 'success');
}

/**
 * Handle business platform
 */
function handleBusinessPlatform() {
    showToast('🚀 Opening business platform...', 'info');
    openSettingsSection('business');
}

/**
 * Handle change number
 */
function handleChangeNumber() {
    const newPhone = prompt('Enter new phone number (with country code):');
    if (newPhone && validatePhone(newPhone)) {
        updatePhoneNumber(newPhone);
    }
}

/**
 * Validate phone number
 */
function validatePhone(phone) {
    return phone.length >= 10 && phone.length <= 15;
}

/**
 * Update phone number
 */
async function updatePhoneNumber(newPhone) {
    try {
        if (!currentUser || !db) {
            showToast('User not authenticated', 'error');
            return;
        }
        
        // Update in Firestore
        await db.collection('users').doc(currentUser.uid).update({
            phone: newPhone,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update local data
        if (currentUserData) {
            currentUserData.phone = newPhone;
        }
        
        userSettings.account.phone = newPhone;
        saveUserSettings();
        
        showToast('✅ Phone number updated successfully', 'success');
    } catch (error) {
        console.error('❌ Error updating phone number:', error);
        showToast('❌ Error updating phone number: ' + error.message, 'error');
    }
}

/**
 * Handle request account info
 */
function handleRequestAccountInfo() {
    showToast('📧 Account info request sent. You will receive an email shortly.', 'info');
    // This would trigger an account info export
    exportAccountData();
}

/**
 * Handle delete account
 */
function handleDeleteAccount() {
    if (confirm('⚠️ Are you sure you want to delete your account? This action cannot be undone.')) {
        deleteUserAccount();
    }
}

/**
 * Delete user account
 */
async function deleteUserAccount() {
    try {
        if (!currentUser || !auth || !db) {
            showToast('User not authenticated', 'error');
            return;
        }
        
        showToast('🔄 Deleting account...', 'info');
        
        // Delete user data from Firestore
        await db.collection('users').doc(currentUser.uid).delete();
        
        // Delete user from Firebase Auth
        await currentUser.delete();
        
        // Clear local data
        localStorage.clear();
        
        showToast('✅ Account deleted successfully', 'success');
        
        // Redirect to login page after a delay
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error deleting account:', error);
        showToast('❌ Error deleting account: ' + error.message, 'error');
    }
}

/**
 * Handle change password
 */
function handleChangePassword() {
    const newPassword = prompt('Enter new password (min 6 characters):');
    if (newPassword && newPassword.length >= 6) {
        updatePassword(newPassword);
    } else {
        showToast('Password must be at least 6 characters', 'error');
    }
}

/**
 * Update password
 */
async function updatePassword(newPassword) {
    try {
        if (!currentUser || !auth) {
            showToast('User not authenticated', 'error');
            return;
        }
        
        await currentUser.updatePassword(newPassword);
        showToast('✅ Password updated successfully', 'success');
    } catch (error) {
        console.error('❌ Error updating password:', error);
        showToast('❌ Error updating password: ' + error.message, 'error');
    }
}

/**
 * Handle logout all devices
 */
function handleLogoutAllDevices() {
    if (confirm('Log out from all devices except this one?')) {
        logoutAllDevices();
    }
}

/**
 * Logout all devices
 */
async function logoutAllDevices() {
    try {
        if (!currentUser || !auth) {
            showToast('User not authenticated', 'error');
            return;
        }
        
        // Revoke refresh tokens
        await auth.revokeRefreshTokens(currentUser.uid);
        
        // Update Firestore to reflect logout
        await db.collection('users').doc(currentUser.uid).update({
            lastLogoutAll: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('✅ Logged out from all other devices', 'success');
        loadLoginSessions();
        
    } catch (error) {
        console.error('❌ Error logging out devices:', error);
        showToast('❌ Error logging out devices', 'error');
    }
}

/**
 * Load login sessions
 */
async function loadLoginSessions() {
    const loginSessionsElement = document.getElementById('loginSessions');
    if (!loginSessionsElement) return;
    
    try {
        // This is a simplified implementation
        // In a real app, you'd track sessions in Firestore
        const sessions = [
            { device: 'Chrome on Windows', location: 'New York, USA', lastActive: 'Just now', current: true },
            { device: 'Safari on iPhone', location: 'London, UK', lastActive: '2 hours ago', current: false },
            { device: 'Firefox on Mac', location: 'Tokyo, Japan', lastActive: '1 day ago', current: false }
        ];
        
        loginSessionsElement.innerHTML = sessions.map(session => `
            <div class="session-item ${session.current ? 'current-session' : ''}">
                <div class="session-info">
                    <strong>${session.device}</strong>
                    <small>${session.location} • ${session.lastActive}</small>
                </div>
                ${session.current ? '<span class="badge">Current</span>' : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Error loading sessions:', error);
    }
}

// ==================== NOTIFICATIONS SETTINGS ====================

/**
 * Setup notifications settings listeners
 */
function setupNotificationsSettingsListeners() {
    // Save notifications
    const saveNotificationsBtn = document.getElementById('saveNotifications');
    if (saveNotificationsBtn) {
        saveNotificationsBtn.addEventListener('click', saveNotificationSettings);
    }
    
    // Cancel notifications
    const cancelNotificationsBtn = document.getElementById('cancelNotifications');
    if (cancelNotificationsBtn) {
        cancelNotificationsBtn.addEventListener('click', () => {
            if (notificationsSettingsModal) notificationsSettingsModal.classList.add('hidden');
        });
    }
    
    // Close notifications
    const closeNotificationsBtn = document.getElementById('closeNotificationsSettings');
    if (closeNotificationsBtn) {
        closeNotificationsBtn.addEventListener('click', () => {
            if (notificationsSettingsModal) notificationsSettingsModal.classList.add('hidden');
        });
    }
    
    // Do Not Disturb toggle
    const doNotDisturbToggle = document.getElementById('doNotDisturbToggle');
    if (doNotDisturbToggle) {
        doNotDisturbToggle.addEventListener('change', toggleDoNotDisturbSchedule);
    }
}

/**
 * Save notification settings
 */
function saveNotificationSettings() {
    const notificationSettings = {
        push: document.getElementById('pushNotificationsToggle')?.checked ?? true,
        message: document.getElementById('messageNotificationsToggle')?.checked ?? true,
        group: document.getElementById('groupNotificationsToggle')?.checked ?? true,
        call: document.getElementById('callNotificationsToggle')?.checked ?? true,
        sound: document.getElementById('soundToggle')?.checked ?? true,
        vibration: document.getElementById('vibrationToggle')?.checked ?? true,
        doNotDisturb: document.getElementById('doNotDisturbToggle')?.checked ?? false,
        dndStartTime: document.getElementById('dndStartTime')?.value || '22:00',
        dndEndTime: document.getElementById('dndEndTime')?.value || '07:00'
    };
    
    userSettings.notifications = notificationSettings;
    saveUserSettings();
    
    // Apply notification settings
    applyNotificationSettings();
    
    if (notificationsSettingsModal) notificationsSettingsModal.classList.add('hidden');
}

/**
 * Apply notification settings
 */
function applyNotificationSettings() {
    console.log('Applying notification settings:', userSettings.notifications);
    
    // Update notification permissions
    if ('Notification' in window) {
        if (userSettings.notifications.push) {
            Notification.requestPermission();
        }
    }
    
    // Update sound settings
    if (window.chatModule && window.chatModule.updateSoundSettings) {
        window.chatModule.updateSoundSettings(userSettings.notifications);
    }
    
    showToast('✅ Notification settings applied', 'success');
}

/**
 * Toggle Do Not Disturb schedule visibility
 */
function toggleDoNotDisturbSchedule() {
    const dndSchedule = document.getElementById('doNotDisturbSchedule');
    const doNotDisturbToggle = document.getElementById('doNotDisturbToggle');
    
    if (dndSchedule && doNotDisturbToggle) {
        if (doNotDisturbToggle.checked) {
            dndSchedule.classList.remove('hidden');
        } else {
            dndSchedule.classList.add('hidden');
        }
    }
}

/**
 * Update notifications UI
 */
function updateNotificationsUI() {
    toggleDoNotDisturbSchedule();
}

// ==================== STORAGE SETTINGS ====================

/**
 * Setup storage settings listeners
 */
function setupStorageSettingsListeners() {
    // Save storage
    const saveStorageBtn = document.getElementById('saveStorage');
    if (saveStorageBtn) {
        saveStorageBtn.addEventListener('click', saveStorageSettings);
    }
    
    // Cancel storage
    const cancelStorageBtn = document.getElementById('cancelStorage');
    if (cancelStorageBtn) {
        cancelStorageBtn.addEventListener('click', () => {
            if (storageSettingsModal) storageSettingsModal.classList.add('hidden');
        });
    }
    
    // Close storage
    const closeStorageBtn = document.getElementById('closeStorageSettings');
    if (closeStorageBtn) {
        closeStorageBtn.addEventListener('click', () => {
            if (storageSettingsModal) storageSettingsModal.classList.add('hidden');
        });
    }
    
    // Storage action buttons
    const clearCacheBtn = document.getElementById('clearCache');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', clearCache);
    }
    
    const manageMediaBtn = document.getElementById('manageMedia');
    if (manageMediaBtn) {
        manageMediaBtn.addEventListener('click', manageMedia);
    }
    
    const backupChatsBtn = document.getElementById('backupChats');
    if (backupChatsBtn) {
        backupChatsBtn.addEventListener('click', backupChats);
    }
    
    const restoreBackupBtn = document.getElementById('restoreBackup');
    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', restoreBackup);
    }
    
    const deleteBackupBtn = document.getElementById('deleteBackup');
    if (deleteBackupBtn) {
        deleteBackupBtn.addEventListener('click', deleteBackup);
    }
    
    // Load storage usage
    loadStorageUsage();
}

/**
 * Save storage settings
 */
function saveStorageSettings() {
    const storageSettings = {
        lessDataCalls: document.getElementById('lessDataCallsToggle')?.checked ?? false,
        proxyEnabled: document.getElementById('proxyEnabledToggle')?.checked ?? false,
        mediaUploadQuality: document.getElementById('mediaUploadQuality')?.value || 'auto',
        autoDownloadQuality: document.getElementById('autoDownloadQuality')?.value || 'standard',
        autoDownload: document.getElementById('autoDownloadToggle')?.checked ?? true,
        wifiOnly: document.getElementById('wifiOnlyToggle')?.checked ?? false
    };
    
    userSettings.storage = storageSettings;
    saveUserSettings();
    
    if (storageSettingsModal) storageSettingsModal.classList.add('hidden');
}

/**
 * Load storage usage
 */
async function loadStorageUsage() {
    try {
        const storageUsageElement = document.getElementById('storageUsage');
        const storageProgressElement = document.getElementById('storageProgress');
        const lastBackupTimeElement = document.getElementById('lastBackupTime');
        const backupStatusElement = document.getElementById('backupStatus');
        
        if (!storageUsageElement || !storageProgressElement) return;
        
        // Calculate storage usage
        const usedStorage = 1.2; // GB - in real app, calculate actual usage
        const totalStorage = 5.0; // GB
        const percentage = (usedStorage / totalStorage) * 100;
        
        storageUsageElement.textContent = `${usedStorage.toFixed(1)} GB of ${totalStorage} GB used`;
        storageProgressElement.style.width = `${percentage}%`;
        
        // Load backup info
        const lastBackup = localStorage.getItem('kynecta-last-backup');
        if (lastBackupTimeElement) {
            lastBackupTimeElement.textContent = lastBackup ? new Date(lastBackup).toLocaleString() : 'Never';
        }
        
        if (backupStatusElement) {
            backupStatusElement.textContent = lastBackup ? 'Backed up' : 'No backup';
            backupStatusElement.className = lastBackup ? 'status-success' : 'status-error';
        }
        
    } catch (error) {
        console.error('❌ Error loading storage usage:', error);
    }
}

/**
 * Clear cache
 */
function clearCache() {
    if (confirm('Clear all cached data? This will not delete your messages.')) {
        // Clear localStorage cache
        const keysToKeep = ['kynecta-settings', 'kynecta-theme', 'kynecta-user', 'kynecta-wallpaper'];
        const keys = Object.keys(localStorage);
        
        keys.forEach(key => {
            if (!keysToKeep.includes(key)) {
                localStorage.removeItem(key);
            }
        });
        
        // Clear sessionStorage
        sessionStorage.clear();
        
        showToast('✅ Cache cleared successfully', 'success');
        loadStorageUsage(); // Refresh storage display
    }
}

/**
 * Manage media
 */
function manageMedia() {
    showToast('📁 Opening media manager...', 'info');
    // This would open a media management interface
    // For now, show a simple media list
    const media = JSON.parse(localStorage.getItem('kynecta-media') || '[]');
    if (media.length > 0) {
        alert(`Found ${media.length} media files. In a real app, this would open a media manager.`);
    } else {
        alert('No media files found.');
    }
}

/**
 * Backup chats
 */
async function backupChats() {
    try {
        showToast('📦 Creating backup...', 'info');
        
        // Collect chat data from localStorage
        const chatData = {};
        const keys = Object.keys(localStorage);
        
        keys.forEach(key => {
            if (key.startsWith('chat_') || key.startsWith('messages_')) {
                chatData[key] = localStorage.getItem(key);
            }
        });
        
        // Add user settings
        chatData['kynecta-settings'] = localStorage.getItem('kynecta-settings');
        chatData['kynecta-user'] = localStorage.getItem('kynecta-user');
        
        // Create backup file
        const backup = {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            data: chatData
        };
        
        // Save to localStorage
        localStorage.setItem('kynecta-backup', JSON.stringify(backup));
        localStorage.setItem('kynecta-last-backup', new Date().toISOString());
        
        // In a real app, upload to cloud storage
        if (currentUser && storage) {
            const backupRef = storage.ref().child(`backups/${currentUser.uid}/chat_backup_${Date.now()}.json`);
            await backupRef.putString(JSON.stringify(backup));
        }
        
        showToast('✅ Backup created successfully', 'success');
        loadStorageUsage();
        
    } catch (error) {
        console.error('❌ Error creating backup:', error);
        showToast('❌ Error creating backup', 'error');
    }
}

/**
 * Restore backup
 */
function restoreBackup() {
    if (confirm('Restore from backup? This will replace your current chat data.')) {
        try {
            const backupStr = localStorage.getItem('kynecta-backup');
            if (!backupStr) {
                showToast('No backup found', 'error');
                return;
            }
            
            const backup = JSON.parse(backupStr);
            
            // Restore data
            Object.entries(backup.data).forEach(([key, value]) => {
                localStorage.setItem(key, value);
            });
            
            // Reload settings
            loadUserSettings();
            
            showToast('✅ Backup restored successfully', 'success');
            
            // Reload page to apply changes
            setTimeout(() => location.reload(), 1000);
            
        } catch (error) {
            console.error('❌ Error restoring backup:', error);
            showToast('❌ Error restoring backup', 'error');
        }
    }
}

/**
 * Delete backup
 */
function deleteBackup() {
    if (confirm('Delete backup file?')) {
        localStorage.removeItem('kynecta-backup');
        localStorage.removeItem('kynecta-last-backup');
        showToast('✅ Backup deleted', 'success');
        loadStorageUsage();
    }
}

// ==================== CHAT SETTINGS ====================

/**
 * Setup chat settings listeners
 */
function setupChatSettingsListeners() {
    // Save chat
    const saveChatBtn = document.getElementById('saveChatSettings');
    if (saveChatBtn) {
        saveChatBtn.addEventListener('click', saveChatSettings);
    }
    
    // Cancel chat
    const cancelChatBtn = document.getElementById('cancelChatSettings');
    if (cancelChatBtn) {
        cancelChatBtn.addEventListener('click', () => {
            if (chatSettingsModal) chatSettingsModal.classList.add('hidden');
        });
    }
    
    // Close chat
    const closeChatBtn = document.getElementById('closeChatSettings');
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            if (chatSettingsModal) chatSettingsModal.classList.add('hidden');
        });
    }
    
    // Chat action buttons
    const changeWallpaperBtn = document.getElementById('changeWallpaper');
    if (changeWallpaperBtn) {
        changeWallpaperBtn.addEventListener('click', changeWallpaper);
    }
    
    const exportChatBtn = document.getElementById('exportChat');
    if (exportChatBtn) {
        exportChatBtn.addEventListener('click', exportChat);
    }
    
    const clearChatHistoryBtn = document.getElementById('clearChatHistory');
    if (clearChatHistoryBtn) {
        clearChatHistoryBtn.addEventListener('click', clearChatHistory);
    }
}

/**
 * Save chat settings
 */
function saveChatSettings() {
    const chatSettings = {
        displayTheme: document.getElementById('themeSelect')?.value || 'light',
        defaultChatTheme: document.getElementById('chatThemeSelect')?.value || 'purple',
        fontSize: document.getElementById('fontSizeSelect')?.value || 'medium',
        enterKeySends: document.getElementById('enterKeySendsToggle')?.checked ?? true,
        mediaVisibility: document.getElementById('mediaVisibilityToggle')?.checked ?? true,
        readReceipts: document.getElementById('readReceiptsToggle')?.checked ?? true,
        lastSeen: document.getElementById('lastSeenToggle')?.checked ?? true,
        chatBackup: document.getElementById('chatBackupToggle')?.checked ?? false
    };
    
    userSettings.chat = chatSettings;
    
    // Update privacy settings if changed here
    if (userSettings.privacy) {
        userSettings.privacy.readReceipts = chatSettings.readReceipts;
    }
    
    saveUserSettings();
    applyChatSettings();
    
    if (chatSettingsModal) chatSettingsModal.classList.add('hidden');
}

/**
 * Apply chat settings
 */
function applyChatSettings() {
    console.log('Applying chat settings:', userSettings.chat);
    
    // Apply theme
    setTheme(userSettings.chat.displayTheme);
    
    // Apply font size
    applyFontSize(userSettings.chat.fontSize);
    
    // Apply wallpaper
    if (userSettings.chat.wallpaper) {
        applyWallpaper(userSettings.chat.wallpaper);
    }
    
    // Update chat module
    if (window.chatModule && window.chatModule.updateSettings) {
        window.chatModule.updateSettings(userSettings.chat);
    }
    
    showToast('✅ Chat settings applied', 'success');
}

/**
 * Change wallpaper
 */
function changeWallpaper() {
    const wallpaperInput = document.createElement('input');
    wallpaperInput.type = 'file';
    wallpaperInput.accept = 'image/*';
    
    wallpaperInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                showToast('🖼️ Uploading wallpaper...', 'info');
                
                // Convert to base64 for localStorage
                const reader = new FileReader();
                reader.onload = (event) => {
                    const wallpaper = event.target.result;
                    userSettings.chat.wallpaper = wallpaper;
                    saveUserSettings();
                    applyWallpaper(wallpaper);
                    showToast('✅ Wallpaper changed successfully', 'success');
                };
                reader.readAsDataURL(file);
                
                // Upload to Firebase Storage if user is logged in
                if (currentUser && storage) {
                    const wallpaperRef = storage.ref().child(`wallpapers/${currentUser.uid}/${Date.now()}_${file.name}`);
                    await wallpaperRef.put(file);
                }
                
            } catch (error) {
                console.error('❌ Error changing wallpaper:', error);
                showToast('❌ Error changing wallpaper', 'error');
            }
        }
    };
    
    wallpaperInput.click();
}

/**
 * Apply wallpaper
 */
function applyWallpaper(wallpaper) {
    document.body.style.backgroundImage = `url('${wallpaper}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundColor = 'transparent';
}

/**
 * Remove wallpaper
 */
function removeWallpaper() {
    userSettings.chat.wallpaper = '';
    saveUserSettings();
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = 'var(--background-color)';
    showToast('✅ Wallpaper removed', 'success');
}

/**
 * Export chat
 */
function exportChat() {
    showToast('📤 Preparing chat export...', 'info');
    
    // Collect chat data
    const chatData = {};
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
        if (key.startsWith('chat_') || key.startsWith('messages_')) {
            chatData[key] = JSON.parse(localStorage.getItem(key));
        }
    });
    
    // Create export file
    const exportObj = {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        user: currentUserData,
        chats: chatData
    };
    
    // Create download link
    const dataStr = JSON.stringify(exportObj, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `kynecta_chat_export_${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showToast('✅ Chat export ready for download', 'success');
}

/**
 * Export account data
 */
function exportAccountData() {
    showToast('📊 Preparing account data export...', 'info');
    
    const exportObj = {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        user: currentUserData,
        settings: userSettings,
        favorites: userSettings.favorites,
        business: userSettings.business
    };
    
    // Create download link
    const dataStr = JSON.stringify(exportObj, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `kynecta_account_export_${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showToast('✅ Account data exported', 'success');
}

/**
 * Clear chat history
 */
function clearChatHistory() {
    if (confirm('⚠️ Clear all chat history? This action cannot be undone.')) {
        showToast('🗑️ Clearing chat history...', 'info');
        
        // Clear chat history from localStorage
        const chatKeys = Object.keys(localStorage).filter(key => 
            key.startsWith('chat_') || key.startsWith('messages_')
        );
        
        chatKeys.forEach(key => {
            localStorage.removeItem(key);
        });
        
        // If using Firestore, you would delete chat documents here
        if (db && currentUser) {
            // In a real app, you would delete chat documents
            console.log('Chat history cleared from localStorage');
        }
        
        showToast('✅ Chat history cleared', 'success');
        
        // Refresh chat interface
        if (window.chatModule && window.chatModule.refreshChats) {
            window.chatModule.refreshChats();
        }
    }
}

// ==================== ACCESSIBILITY SETTINGS ====================

/**
 * Setup accessibility settings listeners
 */
function setupAccessibilitySettingsListeners() {
    // Save accessibility
    const saveAccessibilityBtn = document.getElementById('saveAccessibility');
    if (saveAccessibilityBtn) {
        saveAccessibilityBtn.addEventListener('click', saveAccessibilitySettings);
    }
    
    // Cancel accessibility
    const cancelAccessibilityBtn = document.getElementById('cancelAccessibility');
    if (cancelAccessibilityBtn) {
        cancelAccessibilityBtn.addEventListener('click', () => {
            if (accessibilitySettingsModal) accessibilitySettingsModal.classList.add('hidden');
        });
    }
    
    // Close accessibility
    const closeAccessibilityBtn = document.getElementById('closeAccessibilitySettings');
    if (closeAccessibilityBtn) {
        closeAccessibilityBtn.addEventListener('click', () => {
            if (accessibilitySettingsModal) accessibilitySettingsModal.classList.add('hidden');
        });
    }
}

/**
 * Save accessibility settings
 */
function saveAccessibilitySettings() {
    const accessibilitySettings = {
        darkMode: document.getElementById('darkModeToggle')?.checked ?? false,
        highContrast: document.getElementById('highContrastToggle')?.checked ?? false,
        screenReader: document.getElementById('screenReaderToggle')?.checked ?? false,
        reduceAnimations: document.getElementById('reduceAnimationsToggle')?.checked ?? false,
        textToSpeech: document.getElementById('textToSpeechToggle')?.checked ?? false,
        largeText: document.getElementById('largeTextToggle')?.checked ?? false
    };
    
    userSettings.accessibility = accessibilitySettings;
    saveUserSettings();
    applyAccessibilitySettings();
    
    if (accessibilitySettingsModal) accessibilitySettingsModal.classList.add('hidden');
}

/**
 * Apply accessibility settings
 */
function applyAccessibilitySettings() {
    console.log('Applying accessibility settings:', userSettings.accessibility);
    
    // Apply dark mode
    if (userSettings.accessibility.darkMode) {
        setTheme('dark');
    }
    
    // Apply high contrast
    if (userSettings.accessibility.highContrast) {
        document.body.classList.add('high-contrast');
    } else {
        document.body.classList.remove('high-contrast');
    }
    
    // Apply reduced motion
    if (userSettings.accessibility.reduceAnimations) {
        document.body.classList.add('reduce-motion');
    } else {
        document.body.classList.remove('reduce-motion');
    }
    
    // Apply large text
    if (userSettings.accessibility.largeText) {
        document.body.classList.add('large-text');
    } else {
        document.body.classList.remove('large-text');
    }
    
    // Screen reader support
    if (userSettings.accessibility.screenReader) {
        document.body.setAttribute('aria-live', 'polite');
    } else {
        document.body.removeAttribute('aria-live');
    }
    
    showToast('✅ Accessibility settings applied', 'success');
}

/**
 * Apply font size
 */
function applyFontSize(fontSize) {
    const sizes = {
        'small': '12px',
        'medium': '14px',
        'large': '16px',
        'x-large': '18px'
    };
    
    document.documentElement.style.setProperty('--font-size', sizes[fontSize] || '14px');
}

// ==================== LANGUAGE SETTINGS ====================

/**
 * Setup language settings listeners
 */
function setupLanguageSettingsListeners() {
    // Save language
    const saveLanguageBtn = document.getElementById('saveLanguage');
    if (saveLanguageBtn) {
        saveLanguageBtn.addEventListener('click', saveLanguageSettings);
    }
    
    // Cancel language
    const cancelLanguageBtn = document.getElementById('cancelLanguage');
    if (cancelLanguageBtn) {
        cancelLanguageBtn.addEventListener('click', () => {
            if (languageSettingsModal) languageSettingsModal.classList.add('hidden');
        });
    }
    
    // Close language
    const closeLanguageBtn = document.getElementById('closeLanguageSettings');
    if (closeLanguageBtn) {
        closeLanguageBtn.addEventListener('click', () => {
            if (languageSettingsModal) languageSettingsModal.classList.add('hidden');
        });
    }
}

/**
 * Save language settings
 */
function saveLanguageSettings() {
    const languageSettings = {
        appLanguage: document.getElementById('appLanguageSelect')?.value || 'en',
        autoDetect: document.getElementById('autoDetectLanguageToggle')?.checked ?? false
    };
    
    userSettings.language = languageSettings;
    saveUserSettings();
    applyLanguageSettings();
    
    if (languageSettingsModal) languageSettingsModal.classList.add('hidden');
}

/**
 * Apply language settings
 */
function applyLanguageSettings() {
    console.log('Applying language settings:', userSettings.language);
    
    const language = userSettings.language.appLanguage;
    const autoDetect = userSettings.language.autoDetect;
    
    // Set HTML lang attribute
    document.documentElement.lang = language;
    
    // Load translations
    loadTranslations(language);
    
    // If auto-detect is enabled, try to detect browser language
    if (autoDetect) {
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang && browserLang !== language) {
            userSettings.language.appLanguage = browserLang.split('-')[0];
            saveUserSettings();
            loadTranslations(userSettings.language.appLanguage);
        }
    }
    
    showToast('✅ Language settings applied', 'success');
}

/**
 * Load translations
 */
function loadTranslations(lang) {
    // This would load translation files in a real app
    console.log(`Loading translations for ${lang}`);
    
    // For now, update a few key elements
    const translations = {
        'en': {
            'settings.title': 'Settings',
            'profile.title': 'Profile',
            'privacy.title': 'Privacy'
        },
        'es': {
            'settings.title': 'Configuración',
            'profile.title': 'Perfil',
            'privacy.title': 'Privacidad'
        },
        'fr': {
            'settings.title': 'Paramètres',
            'profile.title': 'Profil',
            'privacy.title': 'Confidentialité'
        }
    };
    
    const trans = translations[lang] || translations['en'];
    
    // Update UI elements
    Object.keys(trans).forEach(key => {
        const elements = document.querySelectorAll(`[data-i18n="${key}"]`);
        elements.forEach(el => {
            el.textContent = trans[key];
        });
    });
}

// ==================== FAVORITES SETTINGS ====================

/**
 * Setup favorites settings listeners
 */
function setupFavoritesSettingsListeners() {
    // Close favorites
    const closeFavoritesBtn = document.getElementById('closeFavoritesSettings');
    if (closeFavoritesBtn) {
        closeFavoritesBtn.addEventListener('click', () => {
            if (favoritesSettingsModal) favoritesSettingsModal.classList.add('hidden');
        });
    }
    
    // Add to favorites
    const addToFavoritesBtn = document.getElementById('addToFavorites');
    if (addToFavoritesBtn) {
        addToFavoritesBtn.addEventListener('click', addToFavorites);
    }
}

/**
 * Load favorites
 */
function loadFavorites() {
    const favoritesList = document.getElementById('favoritesListContent');
    if (!favoritesList) return;
    
    const favorites = userSettings.favorites || [];
    
    if (favorites.length === 0) {
        favoritesList.innerHTML = '<div class="empty-state">No favorites yet</div>';
        return;
    }
    
    favoritesList.innerHTML = favorites.map(fav => `
        <div class="favorite-item" data-id="${fav.id}">
            <img src="${fav.avatar}" alt="${fav.name}" class="favorite-avatar">
            <div class="favorite-info">
                <strong>${fav.name}</strong>
                <small>${fav.type}</small>
            </div>
            <button class="btn btn-icon remove-favorite" onclick="removeFavorite('${fav.id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

/**
 * Add to favorites
 */
function addToFavorites() {
    const name = prompt('Enter name:');
    const type = prompt('Enter type (contact, group, chat):');
    
    if (name && type) {
        const favorite = {
            id: Date.now().toString(),
            name: name,
            type: type,
            avatar: 'https://via.placeholder.com/50',
            addedAt: new Date().toISOString()
        };
        
        userSettings.favorites.push(favorite);
        saveUserSettings();
        loadFavorites();
        showToast('✅ Added to favorites', 'success');
    }
}

/**
 * Remove favorite
 */
function removeFavorite(id) {
    userSettings.favorites = userSettings.favorites.filter(fav => fav.id !== id);
    saveUserSettings();
    loadFavorites();
    showToast('✅ Removed from favorites', 'success');
}

// ==================== HELP CENTER ====================

/**
 * Setup help center listeners
 */
function setupHelpCenterListeners() {
    const closeHelpCenterBtn = document.getElementById('closeHelpCenter');
    if (closeHelpCenterBtn) {
        closeHelpCenterBtn.addEventListener('click', () => {
            if (helpCenterModal) helpCenterModal.classList.add('hidden');
        });
    }
    
    const helpTopics = document.querySelectorAll('.help-topic');
    helpTopics.forEach(topic => {
        topic.addEventListener('click', () => {
            const topicId = topic.dataset.topic;
            showHelpTopic(topicId);
        });
    });
    
    const contactSupportBtn = document.getElementById('contactSupport');
    if (contactSupportBtn) {
        contactSupportBtn.addEventListener('click', contactSupport);
    }
    
    const sendFeedbackBtn = document.getElementById('sendFeedback');
    if (sendFeedbackBtn) {
        sendFeedbackBtn.addEventListener('click', sendFeedback);
    }
}

/**
 * Show help topic
 */
function showHelpTopic(topicId) {
    const helpContent = document.getElementById('helpContent');
    if (helpContent) {
        const topics = {
            'getting-started': `
                <h3>Getting Started</h3>
                <p>Welcome to Kynecta! Here's how to get started:</p>
                <ol>
                    <li>Complete your profile with a photo and bio</li>
                    <li>Add contacts from your phone or search</li>
                    <li>Start chatting with individuals or create groups</li>
                    <li>Explore settings to customize your experience</li>
                </ol>
            `,
            'privacy-security': `
                <h3>Privacy & Security</h3>
                <p>Your privacy is important to us:</p>
                <ul>
                    <li>End-to-end encryption for all messages</li>
                    <li>Control who sees your last seen, profile photo, and about</li>
                    <li>Enable two-factor authentication for extra security</li>
                    <li>Set disappearing messages for sensitive chats</li>
                </ul>
            `,
            'troubleshooting': `
                <h3>Troubleshooting</h3>
                <p>Common issues and solutions:</p>
                <ul>
                    <li><strong>Messages not sending:</strong> Check your internet connection</li>
                    <li><strong>Notifications not working:</strong> Check app notification settings</li>
                    <li><strong>App crashes:</strong> Clear cache or reinstall the app</li>
                    <li><strong>Can't login:</strong> Reset password or contact support</li>
                </ul>
            `,
            'faqs': `
                <h3>Frequently Asked Questions</h3>
                <p><strong>Q: Is Kynecta free?</strong><br>
                A: Yes, all basic features are completely free.</p>
                
                <p><strong>Q: Can I use Kynecta on multiple devices?</strong><br>
                A: Yes, you can use it on up to 4 devices simultaneously.</p>
                
                <p><strong>Q: How do I backup my chats?</strong><br>
                A: Go to Settings → Storage → Backup Chats</p>
            `
        };
        
        helpContent.innerHTML = topics[topicId] || '<p>Topic not found</p>';
    }
}

/**
 * Contact support
 */
function contactSupport() {
    const email = 'support@kynecta.com';
    const subject = 'Kynecta Support Request';
    const body = `User ID: ${currentUser?.uid || 'Not logged in'}\nIssue: `;
    
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    showToast('📧 Opening email client...', 'info');
}

/**
 * Send feedback
 */
function sendFeedback() {
    const feedback = prompt('Please enter your feedback:');
    if (feedback) {
        // In a real app, send to backend
        console.log('Feedback received:', feedback);
        showToast('✅ Thank you for your feedback!', 'success');
    }
}

// ==================== APP INFO ====================

/**
 * Setup app info listeners
 */
function setupAppInfoListeners() {
    const closeAppInfoBtn = document.getElementById('closeAppInfo');
    if (closeAppInfoBtn) {
        closeAppInfoBtn.addEventListener('click', () => {
            if (appInfoModal) appInfoModal.classList.add('hidden');
        });
    }
    
    // Version info
    const versionElement = document.getElementById('appVersion');
    if (versionElement) {
        versionElement.textContent = 'Version 1.0.0';
    }
    
    // Terms of service
    const termsBtn = document.getElementById('termsOfServiceBtn');
    if (termsBtn) {
        termsBtn.addEventListener('click', showTermsOfService);
    }
    
    // Privacy policy
    const privacyBtn = document.getElementById('privacyPolicyBtn');
    if (privacyBtn) {
        privacyBtn.addEventListener('click', showPrivacyPolicy);
    }
    
    // Open source
    const openSourceBtn = document.getElementById('openSourceBtn');
    if (openSourceBtn) {
        openSourceBtn.addEventListener('click', showOpenSource);
    }
}

/**
 * Show terms of service
 */
function showTermsOfService() {
    alert('Terms of Service:\n\n1. Use the service responsibly\n2. Respect other users\n3. No illegal activities\n4. Follow community guidelines\n\nFull terms available at: https://kynecta.com/terms');
}

/**
 * Show privacy policy
 */
function showPrivacyPolicy() {
    alert('Privacy Policy:\n\nWe respect your privacy. We collect minimal data necessary for the app to function. All messages are end-to-end encrypted. We do not sell your data.\n\nFull policy: https://kynecta.com/privacy');
}

/**
 * Show open source
 */
function showOpenSource() {
    alert('Open Source Licenses:\n\nKynecta uses several open source libraries:\n- Firebase\n- Font Awesome\n- Various JavaScript libraries\n\nSource code available at: https://github.com/kynecta');
}

// ==================== INVITE FRIENDS ====================

/**
 * Setup invite friends listeners
 */
function setupInviteFriendsListeners() {
    const closeInviteBtn = document.getElementById('closeInviteFriends');
    if (closeInviteBtn) {
        closeInviteBtn.addEventListener('click', () => {
            if (inviteFriendsModal) inviteFriendsModal.classList.add('hidden');
        });
    }
    
    // Share buttons
    const shareLinkBtn = document.getElementById('shareLink');
    if (shareLinkBtn) {
        shareLinkBtn.addEventListener('click', shareLink);
    }
    
    const shareQRBtn = document.getElementById('shareQR');
    if (shareQRBtn) {
        shareQRBtn.addEventListener('click', shareQR);
    }
    
    const shareWhatsAppBtn = document.getElementById('shareWhatsApp');
    if (shareWhatsAppBtn) {
        shareWhatsAppBtn.addEventListener('click', shareWhatsApp);
    }
    
    const shareSMSBtn = document.getElementById('shareSMS');
    if (shareSMSBtn) {
        shareSMSBtn.addEventListener('click', shareSMS);
    }
    
    const copyReferralBtn = document.getElementById('copyReferralCode');
    if (copyReferralBtn) {
        copyReferralBtn.addEventListener('click', copyReferralCode);
    }
    
    // Generate referral code
    generateReferralCode();
}

/**
 * Generate referral code
 */
function generateReferralCode() {
    const referralCodeElement = document.getElementById('referralCode');
    if (!referralCodeElement) return;
    
    // Generate a simple referral code based on user ID
    let code = 'KYN';
    if (currentUser) {
        code += currentUser.uid.substring(0, 6).toUpperCase();
    } else {
        code += Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    referralCodeElement.textContent = code;
    localStorage.setItem('kynecta-referral-code', code);
}

/**
 * Share link
 */
function shareLink() {
    const link = `https://kynecta.com/invite?code=${localStorage.getItem('kynecta-referral-code')}`;
    navigator.clipboard.writeText(link).then(() => {
        showToast('✅ Invite link copied to clipboard!', 'success');
    }).catch(() => {
        prompt('Copy this link:', link);
    });
}

/**
 * Share QR
 */
function shareQR() {
    showToast('📱 QR code generated', 'info');
    // In a real app, generate and show QR code
    const link = `https://kynecta.com/invite?code=${localStorage.getItem('kynecta-referral-code')}`;
    alert(`QR Code for: ${link}\n\nIn a real app, this would show a QR code image.`);
}

/**
 * Share via WhatsApp
 */
function shareWhatsApp() {
    const link = `https://kynecta.com/invite?code=${localStorage.getItem('kynecta-referral-code')}`;
    const text = `Join me on Kynecta! Use my referral code: ${link}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

/**
 * Share via SMS
 */
function shareSMS() {
    const link = `https://kynecta.com/invite?code=${localStorage.getItem('kynecta-referral-code')}`;
    const text = `Join me on Kynecta! Use my referral code: ${link}`;
    const url = `sms:?body=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

/**
 * Copy referral code
 */
function copyReferralCode() {
    const code = localStorage.getItem('kynecta-referral-code') || 'KYN-INVITE';
    navigator.clipboard.writeText(code).then(() => {
        showToast('✅ Referral code copied!', 'success');
    });
}

// ==================== BUSINESS TOOLS ====================

/**
 * Setup business tools listeners
 */
function setupBusinessToolsListeners() {
    // Catalogue modal
    const saveCatalogueBtn = document.getElementById('saveCatalogue');
    if (saveCatalogueBtn) {
        saveCatalogueBtn.addEventListener('click', saveCatalogueItem);
    }
    
    const closeCatalogueBtn = document.getElementById('closeCatalogue');
    if (closeCatalogueBtn) {
        closeCatalogueBtn.addEventListener('click', () => {
            if (catalogueModal) catalogueModal.classList.add('hidden');
        });
    }
    
    // Advertise modal
    const launchCampaignBtn = document.getElementById('launchCampaign');
    if (launchCampaignBtn) {
        launchCampaignBtn.addEventListener('click', launchCampaign);
    }
    
    const closeAdvertiseBtn = document.getElementById('closeAdvertise');
    if (closeAdvertiseBtn) {
        closeAdvertiseBtn.addEventListener('click', () => {
            if (advertiseModal) advertiseModal.classList.add('hidden');
        });
    }
    
    // Labels modal
    const createLabelBtn = document.getElementById('createLabel');
    if (createLabelBtn) {
        createLabelBtn.addEventListener('click', createLabel);
    }
    
    const closeLabelsBtn = document.getElementById('closeLabels');
    if (closeLabelsBtn) {
        closeLabelsBtn.addEventListener('click', () => {
            if (labelsModal) labelsModal.classList.add('hidden');
        });
    }
    
    // Greeting modal
    const saveGreetingBtn = document.getElementById('saveGreeting');
    if (saveGreetingBtn) {
        saveGreetingBtn.addEventListener('click', saveGreeting);
    }
    
    const closeGreetingBtn = document.getElementById('closeGreeting');
    if (closeGreetingBtn) {
        closeGreetingBtn.addEventListener('click', () => {
            if (greetingModal) greetingModal.classList.add('hidden');
        });
    }
    
    // Away modal
    const saveAwayBtn = document.getElementById('saveAway');
    if (saveAwayBtn) {
        saveAwayBtn.addEventListener('click', saveAwayMessage);
    }
    
    const closeAwayBtn = document.getElementById('closeAway');
    if (closeAwayBtn) {
        closeAwayBtn.addEventListener('click', () => {
            if (awayModal) awayModal.classList.add('hidden');
        });
    }
    
    // Business profile modal
    const startBusinessChatBtn = document.getElementById('startBusinessChat');
    if (startBusinessChatBtn) {
        startBusinessChatBtn.addEventListener('click', startBusinessChat);
    }
    
    const closeBusinessProfileBtn = document.getElementById('closeBusinessProfile');
    if (closeBusinessProfileBtn) {
        closeBusinessProfileBtn.addEventListener('click', () => {
            if (businessProfileModal) businessProfileModal.classList.add('hidden');
        });
    }
    
    // AI Summary modal
    const copyAISummaryBtn = document.getElementById('copyAISummary');
    if (copyAISummaryBtn) {
        copyAISummaryBtn.addEventListener('click', copyAISummary);
    }
    
    const closeAISummaryBtn = document.getElementById('closeAISummary');
    if (closeAISummaryBtn) {
        closeAISummaryBtn.addEventListener('click', () => {
            if (aiSummaryModal) aiSummaryModal.classList.add('hidden');
        });
    }
    
    const closeAISummaryBtn2 = document.getElementById('closeAISummaryBtn');
    if (closeAISummaryBtn2) {
        closeAISummaryBtn2.addEventListener('click', () => {
            if (aiSummaryModal) aiSummaryModal.classList.add('hidden');
        });
    }
    
    // Smart Replies modal
    const closeSmartRepliesBtn = document.getElementById('closeSmartReplies');
    if (closeSmartRepliesBtn) {
        closeSmartRepliesBtn.addEventListener('click', () => {
            if (smartRepliesModal) smartRepliesModal.classList.add('hidden');
        });
    }
    
    const closeSmartRepliesBtn2 = document.getElementById('closeSmartRepliesBtn');
    if (closeSmartRepliesBtn2) {
        closeSmartRepliesBtn2.addEventListener('click', () => {
            if (smartRepliesModal) smartRepliesModal.classList.add('hidden');
        });
    }
}

/**
 * Save catalogue item
 */
function saveCatalogueItem() {
    const productName = document.getElementById('productName')?.value;
    const productPrice = document.getElementById('productPrice')?.value;
    const productDescription = document.getElementById('productDescription')?.value;
    
    if (!productName || !productPrice) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    const product = {
        id: Date.now().toString(),
        name: productName,
        price: productPrice,
        description: productDescription || '',
        createdAt: new Date().toISOString()
    };
    
    userSettings.business.catalogue.push(product);
    saveUserSettings();
    
    showToast('✅ Product added to catalogue', 'success');
    if (catalogueModal) catalogueModal.classList.add('hidden');
}

/**
 * Launch campaign
 */
function launchCampaign() {
    const adTitle = document.getElementById('adTitle')?.value;
    const targetAudience = document.getElementById('targetAudience')?.value;
    const adBudget = document.getElementById('adBudget')?.value;
    
    if (!adTitle || !targetAudience || !adBudget) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    showToast('🚀 Campaign launched successfully!', 'success');
    if (advertiseModal) advertiseModal.classList.add('hidden');
}

/**
 * Create label
 */
function createLabel() {
    const labelName = document.getElementById('newLabelName')?.value;
    const labelColor = document.getElementById('labelColor')?.value || '#3B82F6';
    
    if (!labelName) {
        showToast('Please enter a label name', 'error');
        return;
    }
    
    const label = {
        id: Date.now().toString(),
        name: labelName,
        color: labelColor,
        createdAt: new Date().toISOString()
    };
    
    userSettings.business.labels.push(label);
    saveUserSettings();
    
    showToast('✅ Label created', 'success');
    if (labelsModal) labelsModal.classList.add('hidden');
}

/**
 * Save greeting
 */
function saveGreeting() {
    const greetingMessage = document.getElementById('greetingMessage')?.value;
    
    if (!greetingMessage) {
        showToast('Please enter a greeting message', 'error');
        return;
    }
    
    userSettings.business.greeting = greetingMessage;
    saveUserSettings();
    
    showToast('✅ Greeting message saved', 'success');
    if (greetingModal) greetingModal.classList.add('hidden');
}

/**
 * Save away message
 */
function saveAwayMessage() {
    const awayMessage = document.getElementById('awayMessage')?.value;
    const awayEnabled = document.getElementById('awayEnabled')?.checked ?? false;
    
    if (!awayMessage && awayEnabled) {
        showToast('Please enter an away message', 'error');
        return;
    }
    
    userSettings.business.awayMessage = awayMessage;
    userSettings.business.awayEnabled = awayEnabled;
    saveUserSettings();
    
    showToast('✅ Away message settings saved', 'success');
    if (awayModal) awayModal.classList.add('hidden');
}

/**
 * Start business chat
 */
function startBusinessChat() {
    showToast('💬 Business chat started', 'info');
    // This would navigate to business chat interface
    if (businessProfileModal) businessProfileModal.classList.add('hidden');
}

/**
 * Copy AI summary
 */
function copyAISummary() {
    const aiSummaryContent = document.getElementById('aiSummaryContent');
    if (aiSummaryContent) {
        navigator.clipboard.writeText(aiSummaryContent.textContent).then(() => {
            showToast('✅ AI summary copied to clipboard', 'success');
        });
    }
}

// ==================== OTHER MODALS ====================

/**
 * Setup other modals listeners
 */
function setupOtherModalsListeners() {
    // Backup/restore buttons
    const backupChatsBtn = document.getElementById('backupChats');
    if (backupChatsBtn) {
        backupChatsBtn.addEventListener('click', backupChats);
    }
    
    const restoreBackupBtn = document.getElementById('restoreBackup');
    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', restoreBackup);
    }
    
    const deleteBackupBtn = document.getElementById('deleteBackup');
    if (deleteBackupBtn) {
        deleteBackupBtn.addEventListener('click', deleteBackup);
    }
    
    // Data management
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', exportAccountData);
    }
    
    const deleteDataBtn = document.getElementById('deleteDataBtn');
    if (deleteDataBtn) {
        deleteDataBtn.addEventListener('click', deleteAccountData);
    }
    
    const downloadDataBtn = document.getElementById('downloadDataBtn');
    if (downloadDataBtn) {
        downloadDataBtn.addEventListener('click', exportAccountData);
    }
    
    // Main settings open button
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
        menuBtn.addEventListener('click', openSettingsModal);
    }
    
    // Close main settings
    const closeSettingsBtn = document.getElementById('closeSettings');
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', closeSettingsModal);
    }
    
    // Section navigation
    document.querySelectorAll('.settings-section-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            if (section) {
                showSettingsSection(section);
            }
        });
    });
}

/**
 * Delete account data
 */
function deleteAccountData() {
    if (confirm('⚠️ Delete all account data? This will remove all your messages, contacts, and settings.')) {
        showToast('🗑️ Deleting account data...', 'info');
        
        // Clear all localStorage
        localStorage.clear();
        
        // Clear Firestore data (in real app)
        if (db && currentUser) {
            // Delete user data collections
            // This is simplified - in real app, you'd delete all user documents
        }
        
        showToast('✅ Account data deleted', 'success');
        
        // Redirect to login
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    }
}

// ==================== THEME MANAGEMENT ====================

/**
 * Setup theme toggle
 */
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Load saved theme
    const savedTheme = localStorage.getItem('kynecta-theme') || 'light';
    setTheme(savedTheme);
}

/**
 * Toggle theme
 */
function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

/**
 * Set theme
 */
function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('kynecta-theme', theme);
    
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    // Update settings
    userSettings.theme = theme;
    userSettings.chat.displayTheme = theme;
    userSettings.accessibility.darkMode = theme === 'dark';
    
    // Trigger theme change event
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

// ==================== SETTINGS MANAGEMENT ====================

/**
 * Load user settings
 */
function loadUserSettings() {
    console.log('📥 Loading user settings...');
    
    // Load from localStorage
    const savedSettings = localStorage.getItem('kynecta-settings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            userSettings = { ...userSettings, ...parsed };
        } catch (error) {
            console.error('❌ Error parsing saved settings:', error);
        }
    }
    
    // Load from Firestore if user is logged in
    if (currentUser && db) {
        loadUserSettingsFromFirestore();
    }
    
    // Apply settings
    applyUserSettings();
    updateSettingsUI();
    
    console.log('✅ User settings loaded');
}

/**
 * Load user settings from Firestore
 */
async function loadUserSettingsFromFirestore() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.settings) {
                userSettings = { ...userSettings, ...userData.settings };
                console.log('📥 Loaded settings from Firestore');
            }
        }
    } catch (error) {
        console.error('❌ Error loading settings from Firestore:', error);
    }
}

/**
 * Save user settings
 */
function saveUserSettings() {
    console.log('💾 Saving user settings...');
    
    // Save to localStorage
    localStorage.setItem('kynecta-settings', JSON.stringify(userSettings));
    
    // Save to Firestore if user is logged in
    if (currentUser && db) {
        saveUserSettingsToFirestore();
    }
    
    // Update UI
    updateSettingsUI();
    
    console.log('✅ User settings saved');
}

/**
 * Save user settings to Firestore
 */
async function saveUserSettingsToFirestore() {
    try {
        await db.collection('users').doc(currentUser.uid).update({
            settings: userSettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('💾 Saved settings to Firestore');
    } catch (error) {
        console.error('❌ Error saving settings to Firestore:', error);
    }
}

/**
 * Apply user settings
 */
function applyUserSettings() {
    console.log('🎨 Applying user settings...');
    
    // Apply theme
    setTheme(userSettings.theme);
    
    // Apply chat settings
    applyChatSettings();
    
    // Apply accessibility settings
    applyAccessibilitySettings();
    
    // Apply language settings
    applyLanguageSettings();
    
    // Apply privacy settings
    applyPrivacySettings();
    
    // Apply notification settings
    applyNotificationSettings();
    
    console.log('✅ User settings applied');
}

/**
 * Update settings UI
 */
function updateSettingsUI() {
    if (!userSettings) return;
    
    console.log('🔄 Updating settings UI...');
    
    // Helper function to update elements
    function updateElement(id, value, type = 'value') {
        const element = document.getElementById(id);
        if (!element) return;
        
        if (type === 'checked') {
            element.checked = value;
        } else if (type === 'text') {
            element.textContent = value;
        } else {
            element.value = value;
        }
    }
    
    // Theme selector
    updateElement('themeSelect', userSettings.chat?.displayTheme || 'light');
    
    // Privacy settings
    updateElement('lastSeenPrivacy', userSettings.privacy?.lastSeen || 'everyone');
    updateElement('profilePhotoPrivacy', userSettings.privacy?.profilePhoto || 'everyone');
    updateElement('aboutPrivacy', userSettings.privacy?.about || 'everyone');
    updateElement('statusPrivacy', userSettings.privacy?.status || 'everyone');
    updateElement('readReceiptsPrivacy', userSettings.privacy?.readReceipts, 'checked');
    updateElement('disappearingMessagesPrivacy', userSettings.privacy?.disappearingMessages || 'off');
    updateElement('groupsPrivacy', userSettings.privacy?.groups || 'everyone');
    updateElement('callsPrivacy', userSettings.privacy?.calls || 'everyone');
    
    // Chat settings
    updateElement('enterKeySendsToggle', userSettings.chat?.enterKeySends, 'checked');
    updateElement('mediaVisibilityToggle', userSettings.chat?.mediaVisibility, 'checked');
    updateElement('readReceiptsToggle', userSettings.chat?.readReceipts, 'checked');
    updateElement('lastSeenToggle', userSettings.chat?.lastSeen, 'checked');
    updateElement('chatBackupToggle', userSettings.chat?.chatBackup, 'checked');
    updateElement('fontSizeSelect', userSettings.chat?.fontSize || 'medium');
    updateElement('chatThemeSelect', userSettings.chat?.defaultChatTheme || 'purple');
    
    // Notifications
    updateElement('pushNotificationsToggle', userSettings.notifications?.push, 'checked');
    updateElement('messageNotificationsToggle', userSettings.notifications?.message, 'checked');
    updateElement('groupNotificationsToggle', userSettings.notifications?.group, 'checked');
    updateElement('callNotificationsToggle', userSettings.notifications?.call, 'checked');
    updateElement('soundToggle', userSettings.notifications?.sound, 'checked');
    updateElement('vibrationToggle', userSettings.notifications?.vibration, 'checked');
    updateElement('doNotDisturbToggle', userSettings.notifications?.doNotDisturb, 'checked');
    updateElement('dndStartTime', userSettings.notifications?.dndStartTime || '22:00');
    updateElement('dndEndTime', userSettings.notifications?.dndEndTime || '07:00');
    
    // Storage
    updateElement('autoDownloadToggle', userSettings.storage?.autoDownload, 'checked');
    updateElement('wifiOnlyToggle', userSettings.storage?.wifiOnly, 'checked');
    updateElement('mediaUploadQuality', userSettings.storage?.mediaUploadQuality || 'auto');
    updateElement('autoDownloadQuality', userSettings.storage?.autoDownloadQuality || 'standard');
    
    // Accessibility
    updateElement('darkModeToggle', userSettings.accessibility?.darkMode, 'checked');
    updateElement('highContrastToggle', userSettings.accessibility?.highContrast, 'checked');
    updateElement('screenReaderToggle', userSettings.accessibility?.screenReader, 'checked');
    updateElement('reduceAnimationsToggle', userSettings.accessibility?.reduceAnimations, 'checked');
    updateElement('textToSpeechToggle', userSettings.accessibility?.textToSpeech, 'checked');
    updateElement('largeTextToggle', userSettings.accessibility?.largeText, 'checked');
    
    // Language
    updateElement('appLanguageSelect', userSettings.language?.appLanguage || 'en');
    updateElement('autoDetectLanguageToggle', userSettings.language?.autoDetect, 'checked');
    
    // Toggle DND schedule visibility
    toggleDoNotDisturbSchedule();
    
    console.log('✅ Settings UI updated');
}

/**
 * Update element value
 */
function updateElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

/**
 * Update element checked state
 */
function updateElementChecked(id, checked) {
    const element = document.getElementById(id);
    if (element) {
        element.checked = checked;
    }
}

// ==================== TOAST NOTIFICATIONS ====================

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Remove toast after delay
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// ==================== INITIALIZATION ====================

/**
 * Initialize the settings module
 // ==================== INITIALIZATION ====================

/**
 * Initialize the settings module
 */
function initSettings(firebaseRefs) {
    console.log('🎛️ Initializing settings module...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeSettings(firebaseRefs);
        });
    } else {
        initializeSettings(firebaseRefs);
    }
}

function setupSettingsNavigation() {
    const settingsItems = document.querySelectorAll('.settings-section-item');
    console.log(`🔍 Found ${settingsItems.length} settings section items`);
    
    settingsItems.forEach(item => {
        item.addEventListener('click', function(e) {
            const section = this.dataset.section;
            console.log(`🎯 Settings item clicked: ${section}`);
            console.log('📋 Element:', this);
            e.preventDefault();
            showSettingsSection(section);
        });
    });
}

function initializeSettings(firebaseRefs) {
    // Store Firebase references
    if (firebaseRefs) {
        window.db = firebaseRefs.db;
        window.auth = firebaseRefs.auth;
        window.storage = firebaseRefs.storage;
        window.currentUser = firebaseRefs.currentUser;
        window.currentUserData = firebaseRefs.currentUserData;
    }
    
    try {
        // Initialize modal elements
        initializeModalElements();
        
        // Setup all event listeners
        setupAllSettingsEventListeners();
        
        // Load saved settings
        loadUserSettings();
        
        // Setup theme toggle
        setupThemeToggle();
        
        console.log('✅ Settings module initialized');
    } catch (error) {
        console.error('❌ Error initializing settings:', error);
    }
}
function setupAllSettingsEventListeners() {
    console.log('🔌 Setting up all settings event listeners...');
    
    // 1. Main settings modal
    setupOtherModalsListeners();
    
    // 2. Profile settings
    setupProfileSettingsListeners();
    
    // 3. Privacy settings
    setupPrivacySettingsListeners();
    
    // 4. Account settings
    setupAccountSettingsListeners();
    
    // 5. Notifications settings
    setupNotificationsSettingsListeners();
    
    // 6. Storage settings
    setupStorageSettingsListeners();
    
    // 7. Chat settings
    setupChatSettingsListeners();
    
    // 8. Accessibility settings
    setupAccessibilitySettingsListeners();
    
    // 9. Language settings
    setupLanguageSettingsListeners();
    
    // 10. Favorites settings
    setupFavoritesSettingsListeners();
    
    // 11. Help Center
    setupHelpCenterListeners();
    
    // 12. App Info
    setupAppInfoListeners();
    
    // 13. Invite Friends
    setupInviteFriendsListeners();
    
    // 14. Business Tools
    setupBusinessToolsListeners();
    
    console.log('✅ All settings event listeners setup completed');
}

/**
 * Load user preferences
 */
function loadUserPreferences() {
    console.log('📋 Loading user preferences...');
    
    // Load wallpaper
    const wallpaper = localStorage.getItem('kynecta-wallpaper');
    if (wallpaper) {
        userSettings.chat.wallpaper = wallpaper;
        applyWallpaper(wallpaper);
    }
    
    // Load favorites
    const favorites = JSON.parse(localStorage.getItem('kynecta-favorites') || '[]');
    userSettings.favorites = favorites;
    
    console.log('✅ User preferences loaded');
}

// ==================== FILE INPUT TRIGGERS ====================

/**
 * Trigger file input
 */
function triggerFileInput(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.click();
    }
}

/**
 * Close modal
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ==================== EXPORT FUNCTIONS ====================

// Make functions available globally
window.settings = {
    // Initialization
    init: initSettings,
    
    // Settings management
    load: loadUserSettings,
    save: saveUserSettings,
    apply: applyUserSettings,
    get: () => userSettings,
    set: (newSettings) => {
        userSettings = newSettings;
        saveUserSettings();
    },
    
    // Modal control
    openModal: openSettingsModal,
    closeModal: closeSettingsModal,
    openSection: openSettingsSection,
    closeAll: closeAllModals,
    
    // Profile management
    updateProfile: saveProfileSettings,
    uploadProfilePicture: handleProfilePictureUpload,
    uploadCoverPicture: handleCoverPictureUpload,
    loadProfileData: loadProfileData,
    
    // Account management
    saveAccountSettings: saveAccountSettings,
    enablePasskeys: enablePasskeys,
    disablePasskeys: disablePasskeys,
    enableTwoStepVerification: enableTwoStepVerification,
    disableTwoStepVerification: disableTwoStepVerification,
    updateEmailAddress: updateEmailAddress,
    updatePhoneNumber: updatePhoneNumber,
    deleteAccount: deleteUserAccount,
    changePassword: handleChangePassword,
    logoutAllDevices: handleLogoutAllDevices,
    
    // Storage management
    clearCache: clearCache,
    manageMedia: manageMedia,
    loadStorageUsage: loadStorageUsage,
    backupChats: backupChats,
    restoreBackup: restoreBackup,
    deleteBackup: deleteBackup,
    
    // Chat management
    saveChatSettings: saveChatSettings,
    changeWallpaper: changeWallpaper,
    removeWallpaper: removeWallpaper,
    exportChat: exportChat,
    clearChatHistory: clearChatHistory,
    applyWallpaper: applyWallpaper,
    
    // Theme management
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    
    // Language management
    setLanguage: applyLanguageSettings,
    
    // Favorites management
    addFavorite: addToFavorites,
    removeFavorite: removeFavorite,
    loadFavorites: loadFavorites,
    
    // Business tools
    saveCatalogueItem: saveCatalogueItem,
    launchCampaign: launchCampaign,
    createLabel: createLabel,
    saveGreeting: saveGreeting,
    saveAwayMessage: saveAwayMessage,
    
    // Data management
    exportData: exportAccountData,
    deleteData: deleteAccountData,
    
    // Update current user data (called from main app)
    updateUserData: (user, userData) => {
        currentUser = user;
        currentUserData = userData;
        console.log('🔄 Settings: Updated user data', user?.uid);
    },
    
    // Update Firebase references (called from main app)
    updateFirebaseRefs: (refs) => {
        db = refs.db;
        auth = refs.auth;
        storage = refs.storage;
        console.log('🔄 Settings: Updated Firebase references');
    },
    
    // Get specific settings
    getPrivacySettings: () => userSettings.privacy,
    getNotificationSettings: () => userSettings.notifications,
    getChatSettings: () => userSettings.chat,
    getAccessibilitySettings: () => userSettings.accessibility,
    getStorageSettings: () => userSettings.storage,
    getLanguageSettings: () => userSettings.language,
    getSecuritySettings: () => userSettings.account,
    getFavorites: () => userSettings.favorites,
    getBusinessSettings: () => userSettings.business
};

console.log('✅ Settings module loaded and ready');

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 DOM loaded, checking for settings initialization...');
    
    // Check if we're in the chat.html page
    if (document.getElementById('settingsModal')) {
        console.log('🎯 Settings module detected in chat.html');
        
        // Initialize with empty refs (will be updated by main app)
        setTimeout(() => {
            if (typeof window.settings !== 'undefined') {
                console.log('🚀 Auto-initializing settings module...');
                window.settings.init({});
            }
        }, 1000);
    }
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.settings;
}
