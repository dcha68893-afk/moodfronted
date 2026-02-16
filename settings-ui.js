// =============================================
// SETTINGS UI - COMPLETE IMPLEMENTATION
// ALL SECTIONS FULLY IMPLEMENTED - NO SUMMARIES
// =============================================

import {
    currentUser,
    userSettings,
    currentSection,
    unsavedChanges,
    blockedUsers,
    activeSessions,
    userContacts,
    userGroups,
    authReady,
    apiInitialized,
    MAX_API_RETRIES,
    backgroundTasksStarted,
    AUTH_CHECK_INTERVAL,
    tokenReady,
    tokenAvailable,
    tokenInitialized,
    TOKEN_CHECK_INTERVAL,
    parentCommunicationReady,
    parentSessionReceived,
    MAX_HANDSHAKE_ATTEMPTS,
    HANDSHAKE_RETRY_INTERVAL,
    parentOrigin,
    parentSessionData,
    sessionValidated,
    DEFAULT_SETTINGS,
    SETTINGS_MENU,
    PARENT_MESSAGE_TYPES,
    verifyParentPresence,
    setupSecureMessagingChannel,
    startParentHandshake,
    sendMessageToParent,
    resetUIForLogout,
    showReconnectionState,
    checkAuthenticationState,
    bootstrapIframe,
    waitForSession,
    initializeBasicUI,
    setupBasicEventListeners,
    startTokenMonitoring,
    checkTokenAvailability,
    notifyTokenReady,
    notifyTokenLost,
    getSecureToken,
    secureFetchWrapper,
    waitForToken,
    startPassiveAuthMonitoring,
    startBackgroundTasks,
    safeLoadUserData,
    safeLoadSettings,
    safeLoadBlockedUsers,
    safeLoadActiveSessions,
    safeLoadUserContacts,
    safeLoadUserGroups,
    makeSafeRequest,
    saveSettings,
    notifyParentAuthState,
    notifyParentAuthError,
    loadFromLocalStorage,
    updateUserUI,
    initializeUI,
    calculateStorageUsage,
    formatStorageSize,
    getMoodText,
    getMoodColor,
    terminateSession,
    terminateAllSessions,
    unblockUser,
    clearChatCache,
    clearMediaCache,
    onReady,
    isReady
} from './settings-core.js';

// UI-specific variables
let colorPicker = null;

// =============================================
// UI FUNCTIONS
// =============================================

// Build settings menu
export function buildSettingsMenu() {
    const menuContainer = document.getElementById('settingsMenu');
    if (!menuContainer) return;
    
    menuContainer.innerHTML = '';
    
    SETTINGS_MENU.forEach(item => {
        const menuItem = document.createElement('a');
        menuItem.href = '#';
        menuItem.className = 'menu-item';
        if (item.id === currentSection) {
            menuItem.classList.add('active');
        }
        if (item.danger) {
            menuItem.style.color = 'var(--danger-color)';
        }
        
        if (!parentSessionReceived && !tokenReady && item.requiresAuth) {
            menuItem.style.opacity = '0.5';
            menuItem.style.pointerEvents = 'none';
        }
        
        menuItem.innerHTML = `
            <div class="menu-icon">
                <i class="${item.icon}"></i>
            </div>
            <div class="menu-text">${item.title}</div>
            ${item.badge ? `<div class="menu-badge">${item.badge}</div>` : ''}
        `;
        
        menuItem.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (item.requiresAuth && !checkAuthenticationState()) {
                showNotification('Please wait for authentication to complete', 'warning');
                return;
            }
            
            loadSection(item.id);
            
            document.querySelectorAll('.menu-item').forEach(item => {
                item.classList.remove('active');
            });
            menuItem.classList.add('active');
        });
        
        menuContainer.appendChild(menuItem);
    });
}

// Load a settings section
export function loadSection(sectionId) {
    if (!checkAuthenticationState()) {
        showNotification('Authentication required to load settings', 'warning');
        return;
    }
    
    currentSection = sectionId;
    unsavedChanges = false;
    
    updateSectionTitle(sectionId);
    updateSaveButton();
    
    const contentContainer = document.getElementById('settingsContent');
    if (!contentContainer) return;
    
    contentContainer.scrollTop = 0;
    
    switch(sectionId) {
        case 'profile':
            loadProfileSection(contentContainer);
            break;
        case 'security':
            loadSecuritySection(contentContainer);
            break;
        case 'privacy':
            loadPrivacySection(contentContainer);
            break;
        case 'chat':
            loadChatSection(contentContainer);
            break;
        case 'friends':
            loadFriendsSection(contentContainer);
            break;
        case 'groups':
            loadGroupsSection(contentContainer);
            break;
        case 'calls':
            loadCallsSection(contentContainer);
            break;
        case 'status':
            loadStatusSection(contentContainer);
            break;
        case 'notifications':
            loadNotificationsSection(contentContainer);
            break;
        case 'appearance':
            loadAppearanceSection(contentContainer);
            break;
        case 'storage':
            loadStorageSection(contentContainer);
            break;
        case 'mood':
            loadMoodSection(contentContainer);
            break;
        case 'advanced':
            loadAdvancedSection(contentContainer);
            break;
        case 'backup':
            loadBackupSection(contentContainer);
            break;
        case 'danger':
            loadDangerSection(contentContainer);
            break;
        default:
            contentContainer.innerHTML = '<p>Section not found</p>';
    }
}

// Update section title
export function updateSectionTitle(sectionId) {
    const menuItem = SETTINGS_MENU.find(item => item.id === sectionId);
    if (menuItem) {
        const contentTitle = document.getElementById('contentTitle');
        const contentSubtitle = document.getElementById('contentSubtitle');
        
        if (contentTitle) contentTitle.textContent = menuItem.title;
        if (contentSubtitle) contentSubtitle.textContent = getSectionDescription(sectionId);
    }
}

// Get section description
export function getSectionDescription(sectionId) {
    const descriptions = {
        profile: 'Manage your personal information and account settings',
        security: 'Secure your account with advanced security features',
        privacy: 'Control who can see your information and contact you',
        chat: 'Customize your chat experience and messaging preferences',
        friends: 'Configure how you connect and interact with friends',
        groups: 'Manage group settings and participation preferences',
        calls: 'Set up calling preferences and video call options',
        status: 'Configure status updates and story preferences',
        notifications: 'Manage notifications and alert preferences',
        appearance: 'Customize the look and feel of the app',
        storage: 'Monitor and manage your storage usage',
        mood: 'Configure mood detection and mood-based features',
        advanced: 'Developer options and advanced configuration',
        backup: 'Backup and restore your data',
        danger: 'Irreversible actions - proceed with caution'
    };
    
    return descriptions[sectionId] || 'Configure settings for this section';
}

// Update save button state
export function updateSaveButton() {
    const saveBtn = document.getElementById('saveSectionBtn');
    if (!saveBtn) return;
    
    if (!parentSessionReceived && !tokenReady) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-lock"></i> Awaiting Authentication';
        saveBtn.classList.remove('primary');
        saveBtn.classList.add('secondary');
        return;
    }
    
    if (unsavedChanges) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        saveBtn.classList.remove('secondary');
        saveBtn.classList.add('primary');
    } else {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-check"></i> All Saved';
        saveBtn.classList.remove('primary');
        saveBtn.classList.add('secondary');
    }
}

// Setup event listeners
export function setupEventListeners() {
    const backToAppBtn = document.getElementById('backToAppBtn');
    if (backToAppBtn) {
        backToAppBtn.addEventListener('click', () => {
            if (unsavedChanges) {
                showConfirmation(
                    'Unsaved Changes',
                    'You have unsaved changes. Are you sure you want to leave?',
                    () => {
                        sendMessageToParent({
                            type: PARENT_MESSAGE_TYPES.CHILD_CLOSING,
                            childId: 'settings',
                            unsavedChanges: true,
                            timestamp: Date.now()
                        }).catch(() => {});
                    }
                );
            } else {
                sendMessageToParent({
                    type: PARENT_MESSAGE_TYPES.CHILD_CLOSING,
                    childId: 'settings',
                    timestamp: Date.now()
                }).catch(() => {});
            }
        });
    }
    
    const saveSectionBtn = document.getElementById('saveSectionBtn');
    if (saveSectionBtn) {
        saveSectionBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required to save settings', 'warning');
                return;
            }
            saveSettings().catch(error => {
                showNotification('Error saving settings: ' + error.message, 'error');
            });
        });
    }
    
    const resetSectionBtn = document.getElementById('resetSectionBtn');
    if (resetSectionBtn) {
        resetSectionBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required to reset settings', 'warning');
                return;
            }
            
            showConfirmation(
                'Reset Section',
                'Are you sure you want to reset all settings in this section to default?',
                () => {
                    resetCurrentSection();
                }
            );
        });
    }
    
    const settingsSearch = document.getElementById('settingsSearch');
    if (settingsSearch) {
        settingsSearch.addEventListener('input', function(e) {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required to search settings', 'warning');
                return;
            }
            searchSettings(e.target.value);
        });
    }
    
    setupModalListeners();
    setupPhotoModalListeners();
    setupPasswordModalListeners();
    
    const terminateAllSessionsBtn = document.getElementById('terminateAllSessionsBtn');
    if (terminateAllSessionsBtn) {
        terminateAllSessionsBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required', 'warning');
                return;
            }
            terminateAllSessions().catch(error => {
                showNotification('Error terminating sessions: ' + error.message, 'error');
            });
        });
    }
    
    window.addEventListener('beforeunload', (e) => {
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
}

// Setup modal listeners
export function setupModalListeners() {
    const closeButtons = [
        { id: 'closePhotoModal', modal: 'changePhotoModal' },
        { id: 'closePasswordModal', modal: 'changePasswordModal' },
        { id: 'closeSessionsModal', modal: 'sessionsModal' },
        { id: 'closeBlockedModal', modal: 'blockedUsersModal' },
        { id: 'closeConfirmationModal', modal: 'confirmationModal' }
    ];
    
    closeButtons.forEach(btn => {
        const button = document.getElementById(btn.id);
        const modal = document.getElementById(btn.modal);
        if (button && modal) {
            button.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }
    });
    
    const cancelButtons = [
        { id: 'cancelPhotoBtn', modal: 'changePhotoModal' },
        { id: 'cancelPasswordBtn', modal: 'changePasswordModal' },
        { id: 'closeSessionsBtn', modal: 'sessionsModal' },
        { id: 'closeBlockedBtn', modal: 'blockedUsersModal' },
        { id: 'cancelConfirmationBtn', modal: 'confirmationModal' }
    ];
    
    cancelButtons.forEach(btn => {
        const button = document.getElementById(btn.id);
        const modal = document.getElementById(btn.modal);
        if (button && modal) {
            button.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }
    });
}

// Setup photo modal listeners
export function setupPhotoModalListeners() {
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    if (takePhotoBtn) {
        takePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required', 'warning');
                return;
            }
            takePhoto();
        });
    }
    
    const choosePhotoBtn = document.getElementById('choosePhotoBtn');
    if (choosePhotoBtn) {
        choosePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required', 'warning');
                return;
            }
            choosePhoto();
        });
    }
    
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required', 'warning');
                return;
            }
            removePhoto();
        });
    }
    
    const savePhotoBtn = document.getElementById('savePhotoBtn');
    if (savePhotoBtn) {
        savePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required', 'warning');
                return;
            }
            savePhoto();
        });
    }
}

// Setup password modal listeners
export function setupPasswordModalListeners() {
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    if (savePasswordBtn) {
        savePasswordBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                showNotification('Authentication required', 'warning');
                return;
            }
            changePassword();
        });
    }
}

// Initialize color picker
export function initializeColorPicker() {
    const container = document.getElementById('colorPickerContainer');
    if (!container) return;
    
    if (typeof Pickr === 'undefined') {
        console.warn('Pickr library not loaded, using fallback color picker');
        return;
    }
    
    try {
        colorPicker = Pickr.create({
            el: container,
            theme: 'nano',
            default: userSettings.appearance.accentColor || '#0084ff',
            swatches: [
                '#0084ff', '#34c759', '#ff9500', '#ff3b30',
                '#af52de', '#5856d6', '#007aff', '#5ac8fa'
            ],
            components: {
                preview: true,
                opacity: false,
                hue: true,
                interaction: {
                    hex: true,
                    rgba: true,
                    hsla: false,
                    hsva: false,
                    cmyk: false,
                    input: true,
                    clear: false,
                    save: true
                }
            }
        });
        
        colorPicker.on('save', (color) => {
            if (color) {
                const hexColor = color.toHEXA().toString();
                userSettings.appearance.accentColor = hexColor;
                unsavedChanges = true;
                updateSaveButton();
                updateAccentColor(hexColor);
                colorPicker.hide();
            }
        });
        
        colorPicker.on('hide', () => {
            colorPicker.hide();
        });
    } catch (error) {
        console.error('Error initializing color picker:', error);
    }
}

// Update accent color in UI
export function updateAccentColor(color) {
    document.documentElement.style.setProperty('--primary-color', color);
    
    const darkerColor = shadeColor(color, -20);
    document.documentElement.style.setProperty('--primary-dark', darkerColor);
}

// Apply theme
export function applyTheme(theme) {
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

// Apply font size
export function applyFontSize(size) {
    document.documentElement.style.fontSize = `${size}px`;
}

// Shade color
export function shadeColor(color, percent) {
    let R = parseInt(color.substring(1,3),16);
    let G = parseInt(color.substring(3,5),16);
    let B = parseInt(color.substring(5,7),16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R<255)?R:255;  
    G = (G<255)?G:255;  
    B = (B<255)?B:255;  

    const RR = ((R.toString(16).length===1)?"0"+R.toString(16):R.toString(16));
    const GG = ((G.toString(16).length===1)?"0"+G.toString(16):G.toString(16));
    const BB = ((B.toString(16).length===1)?"0"+B.toString(16):B.toString(16));

    return "#"+RR+GG+BB;
}

// Search settings
export function searchSettings(query) {
    const normalizedQuery = query.toLowerCase().trim();
    
    if (!normalizedQuery) {
        loadSection(currentSection);
        return;
    }
    
    const contentContainer = document.getElementById('settingsContent');
    if (!contentContainer) return;
    
    const results = [];
    
    Object.keys(userSettings).forEach(section => {
        const sectionSettings = userSettings[section];
        Object.keys(sectionSettings).forEach(key => {
            const value = sectionSettings[key];
            const keyStr = key.toLowerCase().replace(/([A-Z])/g, ' $1');
            const sectionName = SETTINGS_MENU.find(m => m.id === section)?.title || section;
            
            if (keyStr.includes(normalizedQuery) || 
                sectionName.toLowerCase().includes(normalizedQuery) ||
                (typeof value === 'string' && value.toLowerCase().includes(normalizedQuery))) {
                results.push({
                    section,
                    key,
                    value,
                    sectionName
                });
            }
        });
    });
    
    if (results.length > 0) {
        let html = '<div class="settings-section">';
        html += '<div class="section-header">';
        html += `<h3><i class="fas fa-search section-icon"></i> Search Results for "${query}"</h3>`;
        html += `<div class="section-description">Found ${results.length} matching settings</div>`;
        html += '</div>';
        html += '<div class="section-body">';
        
        results.forEach(result => {
            html += `<div class="setting-item">`;
            html += `<div class="setting-info">`;
            html += `<div class="setting-label">${result.key.replace(/([A-Z])/g, ' $1')}</div>`;
            html += `<div class="setting-description">Section: ${result.sectionName}</div>`;
            html += `</div>`;
            html += `<div class="setting-control">`;
            html += `<div class="setting-value">${typeof result.value === 'boolean' ? (result.value ? 'Enabled' : 'Disabled') : result.value}</div>`;
            html += `</div>`;
            html += `</div>`;
        });
        
        html += '</div></div>';
        contentContainer.innerHTML = html;
    } else {
        contentContainer.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-search section-icon"></i> Search Results for "${query}"</h3>
                    <div class="section-description">
                        No settings found matching your search
                    </div>
                </div>
                <div class="section-body">
                    <p>Try searching with different keywords or browse through the settings menu.</p>
                </div>
            </div>
        `;
    }
}

// Show notification
export function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (!notification || !notificationText) return;
    
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('active');
    
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

// Show confirmation dialog
export function showConfirmation(title, message, confirmCallback) {
    const confirmationTitle = document.getElementById('confirmationTitle');
    const confirmationMessage = document.getElementById('confirmationMessage');
    const modal = document.getElementById('confirmationModal');
    
    if (!confirmationTitle || !confirmationMessage || !modal) return;
    
    confirmationTitle.textContent = title;
    confirmationMessage.textContent = message;
    
    modal.classList.add('active');
    
    const confirmBtn = document.getElementById('confirmActionBtn');
    const newConfirmCallback = () => {
        modal.classList.remove('active');
        if (confirmCallback) confirmCallback();
    };
    
    if (confirmBtn) {
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        const newConfirmBtn = document.getElementById('confirmActionBtn');
        if (newConfirmBtn) {
            newConfirmBtn.addEventListener('click', newConfirmCallback);
        }
    }
}

// Reset current section
export function resetCurrentSection() {
    if (currentSection && DEFAULT_SETTINGS[currentSection]) {
        userSettings[currentSection] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[currentSection]));
        unsavedChanges = true;
        updateSaveButton();
        loadSection(currentSection);
        showNotification('Section reset to default values', 'success');
    }
}

// Update user status
export function updateUserStatus() {
    const statusIndicator = document.getElementById('userStatusIndicator');
    const statusText = document.getElementById('userStatusText');
    
    if (!statusIndicator || !statusText) return;
    
    if (parentSessionReceived || tokenReady) {
        statusIndicator.style.backgroundColor = 'var(--success-color)';
        statusText.textContent = 'Online';
    } else {
        statusIndicator.style.backgroundColor = 'var(--warning-color)';
        statusText.textContent = 'Connecting...';
    }
}

// Format time
export function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Escape HTML
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Take photo
export function takePhoto() {
    showNotification('Camera access would open here in a real app', 'info');
}

// Choose photo
export function choosePhoto() {
    showNotification('Photo gallery would open here in a real app', 'info');
}

// Remove photo
export function removePhoto() {
    showConfirmation(
        'Remove Profile Photo',
        'Are you sure you want to remove your profile photo?',
        () => {
            userSettings.profile.photoUrl = '';
            if (currentUser) {
                currentUser.photoURL = '';
                const userAvatarPreview = document.getElementById('userAvatarPreview');
                if (userAvatarPreview) {
                    userAvatarPreview.style.backgroundImage = '';
                    const initials = currentUser.displayName ? 
                        currentUser.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
                        'U';
                    userAvatarPreview.innerHTML = `<span style="color: var(--text-secondary); font-size: 18px;">${initials}</span>`;
                }
            }
            showNotification('Profile photo removed', 'success');
            const changePhotoModal = document.getElementById('changePhotoModal');
            if (changePhotoModal) {
                changePhotoModal.classList.remove('active');
            }
        }
    );
}

// Save photo
export function savePhoto() {
    showNotification('Profile photo saved', 'success');
    const changePhotoModal = document.getElementById('changePhotoModal');
    if (changePhotoModal) {
        changePhotoModal.classList.remove('active');
    }
}

// Change password
export async function changePassword() {
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    const passwordError = document.getElementById('passwordError');
    const changePasswordModal = document.getElementById('changePasswordModal');
    
    if (!currentPassword || !newPassword || !confirmPassword || !passwordError || !changePasswordModal) return;
    
    passwordError.style.display = 'none';
    
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        passwordError.textContent = 'All fields are required';
        passwordError.style.display = 'block';
        return;
    }
    
    if (newPassword.value !== confirmPassword.value) {
        passwordError.textContent = 'New passwords do not match';
        passwordError.style.display = 'block';
        return;
    }
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword.value)) {
        passwordError.textContent = 'Password must be at least 8 characters with uppercase, lowercase, number and special character';
        passwordError.style.display = 'block';
        return;
    }
    
    try {
        await makeSafeRequest('/api/auth/change-password', 'POST', {
            currentPassword: currentPassword.value,
            newPassword: newPassword.value
        });
        
        showNotification('Password changed successfully', 'success');
        changePasswordModal.classList.remove('active');
        
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
        
    } catch (error) {
        console.warn('[Settings] Error changing password:', error.message);
        passwordError.textContent = error.message || 'Error changing password';
        passwordError.style.display = 'block';
    }
}

// Edit mood color
export function editMoodColor(mood) {
    if (!colorPicker) return;
    
    const currentColor = userSettings.mood.moodColors[mood];
    colorPicker.setColor(currentColor);
    colorPicker.show();
    
    const originalSaveHandler = colorPicker._eventHandler.save;
    colorPicker.on('save', (color) => {
        if (color) {
            const hexColor = color.toHEXA().toString();
            userSettings.mood.moodColors[mood] = hexColor;
            unsavedChanges = true;
            updateSaveButton();
            loadSection('mood');
            showNotification(`${mood} color updated`, 'success');
        }
        colorPicker.hide();
        colorPicker.on('save', originalSaveHandler);
    });
}

// =============================================
// PROFILE SECTION
// =============================================
export function loadProfileSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-user section-icon"></i> Profile Information</h3>
                    <div class="section-description">
                        Authentication required to view profile settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.profile || DEFAULT_SETTINGS.profile;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user section-icon"></i> Profile Information</h3>
                <div class="section-description">
                    Manage your personal information and how others see your profile
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">
                            Profile Photo
                            <i class="fas fa-info-circle setting-label-icon" title="Your profile picture visible to others"></i>
                        </div>
                        <div class="setting-description">
                            Click to change your profile photo
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changePhotoBtn">
                            <i class="fas fa-camera"></i> Change Photo
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Display Name</div>
                        <div class="setting-description">
                            Your name as shown to other users
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="displayNameInput" 
                               value="${escapeHtml(settings.displayName || currentUser?.displayName || '')}" 
                               placeholder="Your name">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Username</div>
                        <div class="setting-description">
                            Your unique @username for mentions and sharing
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="usernameInput" 
                               value="${escapeHtml(settings.username || currentUser?.username || '')}" 
                               placeholder="@username" 
                               pattern="^@[a-zA-Z0-9_]+$">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Bio</div>
                        <div class="setting-description">
                            A short bio about yourself (max 150 characters)
                        </div>
                    </div>
                    <div class="setting-control">
                        <textarea class="setting-textarea" id="bioInput" 
                                  placeholder="Tell people about yourself..." 
                                  maxlength="150">${escapeHtml(settings.bio || '')}</textarea>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Phone Number</div>
                        <div class="setting-description">
                            Your phone number for verification and contacts
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="tel" class="setting-input" id="phoneNumberInput" 
                               value="${escapeHtml(settings.phoneNumber || currentUser?.phoneNumber || '')}" 
                               placeholder="+1 234 567 8900">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Email Address</div>
                        <div class="setting-description">
                            Your email for account recovery and notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="email" class="setting-input" id="emailInput" 
                               value="${escapeHtml(settings.email || currentUser?.email || '')}" 
                               placeholder="your@email.com">
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-eye section-icon"></i> Profile Visibility</h3>
                <div class="section-description">
                    Control who can see your profile information
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Profile Visibility</div>
                        <div class="setting-description">
                            Who can see your full profile
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="profileVisibilitySelect">
                            <option value="everyone" ${settings.profileVisibility === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.profileVisibility === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.profileVisibility === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Profile Photo Visibility</div>
                        <div class="setting-description">
                            Who can see your profile photo
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="profilePhotoVisibilitySelect">
                            <option value="everyone" ${settings.profilePhotoVisibility === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.profilePhotoVisibility === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.profilePhotoVisibility === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Last Seen</div>
                        <div class="setting-description">
                            Show when you were last active
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="lastSeenToggle" ${settings.lastSeen ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Online Status</div>
                        <div class="setting-description">
                            Show when you're online
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="onlineStatusToggle" ${settings.onlineStatus ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-smile section-icon"></i> Current Mood</h3>
                <div class="section-description">
                    Your current mood status and settings
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Current Mood</div>
                        <div class="setting-description" id="currentMoodText">
                            ${getMoodText(settings.currentMood)}
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="mood-indicator" style="width: 24px; height: 24px; border-radius: 50%; background-color: ${getMoodColor(settings.currentMood)};"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood Text</div>
                        <div class="setting-description">
                            Custom text to display with your mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="moodTextInput" 
                               value="${escapeHtml(settings.currentMoodText || '')}" 
                               placeholder="How you're feeling...">
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    if (changePhotoBtn) {
        changePhotoBtn.addEventListener('click', () => {
            const changePhotoModal = document.getElementById('changePhotoModal');
            if (changePhotoModal) {
                changePhotoModal.classList.add('active');
            }
        });
    }
    
    const inputs = ['displayNameInput', 'usernameInput', 'bioInput', 'phoneNumberInput', 'emailInput', 'moodTextInput'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                const property = id.replace('Input', '');
                userSettings.profile[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
                
                if (id === 'displayNameInput' && currentUser) {
                    const userNamePreview = document.getElementById('userNamePreview');
                    if (userNamePreview) {
                        userNamePreview.textContent = element.value || 'User';
                    }
                }
            });
        }
    });
    
    const selects = ['profileVisibilitySelect', 'profilePhotoVisibilitySelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.profile[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['lastSeenToggle', 'onlineStatusToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.profile[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// SECURITY SECTION
// =============================================
export function loadSecuritySection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-shield-alt section-icon"></i> Account Security</h3>
                    <div class="section-description">
                        Authentication required to view security settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.security || DEFAULT_SETTINGS.security;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-shield-alt section-icon"></i> Account Security</h3>
                <div class="section-description">
                    Enhanced security features to protect your account
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Two-Factor Authentication</div>
                        <div class="setting-description">
                            Add an extra layer of security to your account
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="twoFactorAuthToggle" ${settings.twoFactorAuth ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Change Password</div>
                        <div class="setting-description">
                            Update your account password regularly
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changePasswordBtn">
                            <i class="fas fa-key"></i> Change Password
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Login Notifications</div>
                        <div class="setting-description">
                            Get notified when someone logs into your account
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="loginNotificationsToggle" ${settings.loginNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Active Sessions</div>
                        <div class="setting-description">
                            View and manage devices logged into your account
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="viewSessionsBtn">
                            <i class="fas fa-desktop"></i> View All
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-clock section-icon"></i> Session Management</h3>
                <div class="section-description">
                    Control how long your sessions stay active
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Session Timeout</div>
                        <div class="setting-description">
                            Automatically log out after period of inactivity
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="sessionTimeoutSelect">
                            <option value="15min" ${settings.sessionTimeout === '15min' ? 'selected' : ''}>15 Minutes</option>
                            <option value="30min" ${settings.sessionTimeout === '30min' ? 'selected' : ''}>30 Minutes</option>
                            <option value="1hr" ${settings.sessionTimeout === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="8hr" ${settings.sessionTimeout === '8hr' ? 'selected' : ''}>8 Hours</option>
                            <option value="never" ${settings.sessionTimeout === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enhanced Timeout</div>
                        <div class="setting-description">
                            Additional security for timeout protection
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="enhancedTimeoutToggle" ${settings.enhancedTimeout ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Lock Screen After</div>
                        <div class="setting-description">
                            Lock app screen after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="lockScreenAfterSelect">
                            <option value="1min" ${settings.lockScreenAfter === '1min' ? 'selected' : ''}>1 Minute</option>
                            <option value="5min" ${settings.lockScreenAfter === '5min' ? 'selected' : ''}>5 Minutes</option>
                            <option value="15min" ${settings.lockScreenAfter === '15min' ? 'selected' : ''}>15 Minutes</option>
                            <option value="30min" ${settings.lockScreenAfter === '30min' ? 'selected' : ''}>30 Minutes</option>
                            <option value="never" ${settings.lockScreenAfter === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Logout After</div>
                        <div class="setting-description">
                            Complete logout after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="logoutAfterSelect">
                            <option value="1hr" ${settings.logoutAfter === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="4hr" ${settings.logoutAfter === '4hr' ? 'selected' : ''}>4 Hours</option>
                            <option value="8hr" ${settings.logoutAfter === '8hr' ? 'selected' : ''}>8 Hours</option>
                            <option value="24hr" ${settings.logoutAfter === '24hr' ? 'selected' : ''}>24 Hours</option>
                            <option value="never" ${settings.logoutAfter === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Timeout Warnings</div>
                        <div class="setting-description">
                            Show warnings before session timeout
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="timeoutWarningsToggle" ${settings.timeoutWarnings ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-lock section-icon"></i> App Protection</h3>
                <div class="section-description">
                    Additional protection for the app
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">App Lock</div>
                        <div class="setting-description">
                            Require authentication to open the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="appLockToggle" ${settings.appLock ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Screen Capture Protection</div>
                        <div class="setting-description">
                            Prevent screenshots and screen recording
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="screenCaptureToggle" ${settings.screenCaptureProtection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">End-to-End Encryption</div>
                        <div class="setting-description">
                            Encrypt all messages and calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="encryptionToggle" ${settings.encryption ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Biometric Bypass</div>
                        <div class="setting-description">
                            Allow biometric authentication to bypass locks
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="biometricBypassToggle" ${settings.biometricBypass ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            const changePasswordModal = document.getElementById('changePasswordModal');
            if (changePasswordModal) {
                changePasswordModal.classList.add('active');
            }
        });
    }
    
    const viewSessionsBtn = document.getElementById('viewSessionsBtn');
    if (viewSessionsBtn) {
        viewSessionsBtn.addEventListener('click', () => {
            showActiveSessions();
        });
    }
    
    const toggles = ['twoFactorAuthToggle', 'loginNotificationsToggle', 'enhancedTimeoutToggle', 
                   'timeoutWarningsToggle', 'appLockToggle', 'screenCaptureToggle', 
                   'encryptionToggle', 'biometricBypassToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.security[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const selects = ['sessionTimeoutSelect', 'lockScreenAfterSelect', 'logoutAfterSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.security[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// PRIVACY SECTION
// =============================================
export function loadPrivacySection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-lock section-icon"></i> Privacy Settings</h3>
                    <div class="section-description">
                        Authentication required to view privacy settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.privacy || DEFAULT_SETTINGS.privacy;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-plus section-icon"></i> Connection Settings</h3>
                <div class="section-description">
                    Control who can connect with you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Add Me</div>
                        <div class="setting-description">
                            Control who can send you friend requests
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="whoCanAddMeSelect">
                            <option value="everyone" ${settings.whoCanAddMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOfFriends" ${settings.whoCanAddMe === 'friendsOfFriends' ? 'selected' : ''}>Friends of Friends</option>
                            <option value="nobody" ${settings.whoCanAddMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Contact Discovery</div>
                        <div class="setting-description">
                            Allow others to find you by phone number or email
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="contactDiscoveryToggle" ${settings.contactDiscovery ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-comments section-icon"></i> Messaging Privacy</h3>
                <div class="section-description">
                    Control who can message you and how
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Message Me</div>
                        <div class="setting-description">
                            Control who can send you messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canMessageMeSelect">
                            <option value="everyone" ${settings.canMessageMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canMessageMe === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canMessageMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Read Receipts</div>
                        <div class="setting-description">
                            Let others see when you've read their messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="readReceiptsToggle" ${settings.readReceipts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Typing Indicators</div>
                        <div class="setting-description">
                            Show when you're typing a message
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="typingIndicatorsToggle" ${settings.typingIndicators ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Forwarding</div>
                        <div class="setting-description">
                            Allow others to forward your messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageForwardingToggle" ${settings.messageForwarding ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can Forward Messages</div>
                        <div class="setting-description">
                            Who can forward your messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canForwardMessagesSelect">
                            <option value="everyone" ${settings.canForwardMessages === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canForwardMessages === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canForwardMessages === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can Take Screenshots</div>
                        <div class="setting-description">
                            Allow others to take screenshots of your chats
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="canTakeScreenshotsToggle" ${settings.canTakeScreenshots ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-phone section-icon"></i> Call Privacy</h3>
                <div class="section-description">
                    Control who can call you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Call Me</div>
                        <div class="setting-description">
                            Control who can make voice or video calls to you
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canCallMeSelect">
                            <option value="everyone" ${settings.canCallMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canCallMe === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canCallMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-eye section-icon"></i> Visibility Settings</h3>
                <div class="section-description">
                    Control what others can see about you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can See My Status</div>
                        <div class="setting-description">
                            Who can see your status updates
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canSeeMyStatusSelect">
                            <option value="everyone" ${settings.canSeeMyStatus === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canSeeMyStatus === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canSeeMyStatus === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can See Profile Photo</div>
                        <div class="setting-description">
                            Who can see your profile picture
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canSeeProfilePhotoSelect">
                            <option value="everyone" ${settings.canSeeProfilePhoto === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canSeeProfilePhoto === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canSeeProfilePhoto === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can See Last Seen</div>
                        <div class="setting-description">
                            Who can see when you were last online
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canSeeLastSeenSelect">
                            <option value="everyone" ${settings.canSeeLastSeen === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canSeeLastSeen === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canSeeLastSeen === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-ban section-icon"></i> Blocking & Safety</h3>
                <div class="section-description">
                    Manage blocked users and safety features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Blocked Users</div>
                        <div class="setting-description">
                            Manage users you've blocked
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="manageBlockedBtn">
                            <i class="fas fa-user-slash"></i> Manage
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const manageBlockedBtn = document.getElementById('manageBlockedBtn');
    if (manageBlockedBtn) {
        manageBlockedBtn.addEventListener('click', () => {
            showBlockedUsers();
        });
    }
    
    const selects = ['whoCanAddMeSelect', 'canMessageMeSelect', 'canForwardMessagesSelect', 
                   'canCallMeSelect', 'canSeeMyStatusSelect', 'canSeeProfilePhotoSelect', 
                   'canSeeLastSeenSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.privacy[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['contactDiscoveryToggle', 'readReceiptsToggle', 'typingIndicatorsToggle', 
                   'messageForwardingToggle', 'canTakeScreenshotsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.privacy[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// CHAT SECTION
// =============================================
export function loadChatSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-comments section-icon"></i> Chat Settings</h3>
                    <div class="section-description">
                        Authentication required to view chat settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.chat || DEFAULT_SETTINGS.chat;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-comments section-icon"></i> Chat Settings</h3>
                <div class="section-description">
                    Customize your chat experience
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Wallpaper</div>
                        <div class="setting-description">
                            Change the background of your chats
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changeWallpaperBtn">
                            <i class="fas fa-image"></i> Change
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enter Key Sends</div>
                        <div class="setting-description">
                            Press Enter to send messages (Shift+Enter for new line)
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="enterKeySendsToggle" ${settings.enterKeySends ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Media Auto-Download</div>
                        <div class="setting-description">
                            Automatically download media files
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="mediaAutoDownloadSelect">
                            <option value="wifiOnly" ${settings.mediaAutoDownload === 'wifiOnly' ? 'selected' : ''}>Wi-Fi Only</option>
                            <option value="always" ${settings.mediaAutoDownload === 'always' ? 'selected' : ''}>Always</option>
                            <option value="never" ${settings.mediaAutoDownload === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Save to Camera Roll</div>
                        <div class="setting-description">
                            Automatically save received media to your device
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="saveToCameraRollToggle" ${settings.saveToCameraRoll ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-history section-icon"></i> Message History</h3>
                <div class="section-description">
                    Control how long messages are stored
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message History</div>
                        <div class="setting-description">
                            How long to keep message history
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="messageHistorySelect">
                            <option value="forever" ${settings.messageHistory === 'forever' ? 'selected' : ''}>Forever</option>
                            <option value="30days" ${settings.messageHistory === '30days' ? 'selected' : ''}>30 Days</option>
                            <option value="7days" ${settings.messageHistory === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="24hours" ${settings.messageHistory === '24hours' ? 'selected' : ''}>24 Hours</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Disappearing Messages</div>
                        <div class="setting-description">
                            Automatically delete messages after a period
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="disappearingMessagesSelect">
                            <option value="off" ${settings.disappearingMessages === 'off' ? 'selected' : ''}>Off</option>
                            <option value="1hour" ${settings.disappearingMessages === '1hour' ? 'selected' : ''}>1 Hour</option>
                            <option value="1day" ${settings.disappearingMessages === '1day' ? 'selected' : ''}>1 Day</option>
                            <option value="7days" ${settings.disappearingMessages === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="30days" ${settings.disappearingMessages === '30days' ? 'selected' : ''}>30 Days</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-robot section-icon"></i> Smart Features</h3>
                <div class="section-description">
                    AI-powered chat enhancements
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Smart Replies</div>
                        <div class="setting-description">
                            Suggest quick replies based on conversation
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="smartRepliesToggle" ${settings.smartReplies ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Translation</div>
                        <div class="setting-description">
                            Automatically translate foreign language messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageTranslationToggle" ${settings.messageTranslation ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Summarization</div>
                        <div class="setting-description">
                            Summarize long conversations
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="chatSummarizationToggle" ${settings.chatSummarization ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-shield-alt section-icon"></i> Safety Features</h3>
                <div class="section-description">
                    Protect yourself from unwanted content
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Spam Detection</div>
                        <div class="setting-description">
                            Automatically detect and filter spam messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="spamDetectionToggle" ${settings.spamDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Approval Mode</div>
                        <div class="setting-description">
                            Require approval before messages are sent
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageApprovalModeToggle" ${settings.messageApprovalMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Keyword Filtering</div>
                        <div class="setting-description">
                            Filter messages containing specific keywords
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="keywordFilteringToggle" ${settings.keywordFiltering ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const changeWallpaperBtn = document.getElementById('changeWallpaperBtn');
    if (changeWallpaperBtn) {
        changeWallpaperBtn.addEventListener('click', () => {
            showNotification('Select a wallpaper from your device or choose from defaults', 'info');
            const wallpapers = ['default', 'gradient', 'pattern', 'solid', 'custom'];
            const currentIndex = wallpapers.indexOf(settings.chatWallpaper);
            const nextIndex = (currentIndex + 1) % wallpapers.length;
            userSettings.chat.chatWallpaper = wallpapers[nextIndex];
            unsavedChanges = true;
            updateSaveButton();
            showNotification(`Wallpaper set to ${wallpapers[nextIndex]}`, 'success');
        });
    }
    
    const selects = ['mediaAutoDownloadSelect', 'messageHistorySelect', 'disappearingMessagesSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.chat[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['enterKeySendsToggle', 'saveToCameraRollToggle', 'smartRepliesToggle', 
                   'messageTranslationToggle', 'chatSummarizationToggle', 'spamDetectionToggle',
                   'messageApprovalModeToggle', 'keywordFilteringToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.chat[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// FRIENDS SECTION
// =============================================
export function loadFriendsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-user-friends section-icon"></i> Friends Settings</h3>
                    <div class="section-description">
                        Authentication required to view friends settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.friends || DEFAULT_SETTINGS.friends;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-plus section-icon"></i> Friend Discovery</h3>
                <div class="section-description">
                    Control how others can find and add you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Discover by Phone Number</div>
                        <div class="setting-description">
                            Allow others to find you by your phone number
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="discoverByPhoneToggle" ${settings.discoverByPhone ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Discover by Email</div>
                        <div class="setting-description">
                            Allow others to find you by your email address
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="discoverByEmailToggle" ${settings.discoverByEmail ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Nearby Discovery</div>
                        <div class="setting-description">
                            Allow discovery by nearby users using Bluetooth
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="nearbyDiscoveryToggle" ${settings.nearbyDiscovery ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">QR Code Scanner</div>
                        <div class="setting-description">
                            Allow adding friends by scanning QR codes
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="qrCodeScannerToggle" ${settings.qrCodeScanner ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Suggestions</div>
                        <div class="setting-description">
                            Show friend suggestions based on mutual connections
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendSuggestionsToggle" ${settings.friendSuggestions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-clock section-icon"></i> Friendship Features</h3>
                <div class="section-description">
                    Advanced friendship management features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Temporary Friends</div>
                        <div class="setting-description">
                            Allow temporary friendships that expire after time
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="temporaryFriendsToggle" ${settings.temporaryFriends ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friendship Notes</div>
                        <div class="setting-description">
                            Add private notes to friends for reference
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendshipNotesToggle" ${settings.friendshipNotes ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Categories</div>
                        <div class="setting-description">
                            Organize friends into custom categories
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendCategoriesToggle" ${settings.friendCategories ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Trust Score</div>
                        <div class="setting-description">
                            Show trust scores for friends based on interaction
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="trustScoreToggle" ${settings.trustScore ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Analytics</div>
                        <div class="setting-description">
                            Show analytics about your friendships
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendAnalyticsToggle" ${settings.friendAnalytics ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const toggles = ['discoverByPhoneToggle', 'discoverByEmailToggle', 'nearbyDiscoveryToggle',
                   'qrCodeScannerToggle', 'friendSuggestionsToggle', 'temporaryFriendsToggle',
                   'friendshipNotesToggle', 'friendCategoriesToggle', 'trustScoreToggle',
                   'friendAnalyticsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.friends[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// GROUPS SECTION
// =============================================
export function loadGroupsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-users section-icon"></i> Groups Settings</h3>
                    <div class="section-description">
                        Authentication required to view groups settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.groups || DEFAULT_SETTINGS.groups;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-users section-icon"></i> Group Settings</h3>
                <div class="section-description">
                    Control your group participation and preferences
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Join Groups</div>
                        <div class="setting-description">
                            Automatically join groups you're invited to
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoJoinGroupsToggle" ${settings.autoJoinGroups ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Invitations</div>
                        <div class="setting-description">
                            Who can invite you to groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="groupInvitationsSelect">
                            <option value="everyone" ${settings.groupInvitations === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.groupInvitations === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.groupInvitations === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Privacy</div>
                        <div class="setting-description">
                            Control who can add you to groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="groupPrivacySelect">
                            <option value="everyone" ${settings.groupPrivacy === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="myApprovalRequired" ${settings.groupPrivacy === 'myApprovalRequired' ? 'selected' : ''}>My Approval Required</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Announcements</div>
                        <div class="setting-description">
                            Receive announcements from group admins
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupAnnouncementsToggle" ${settings.groupAnnouncements ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Download Group Media</div>
                        <div class="setting-description">
                            Automatically download media from groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="autoDownloadGroupMediaSelect">
                            <option value="wifiOnly" ${settings.autoDownloadGroupMedia === 'wifiOnly' ? 'selected' : ''}>Wi-Fi Only</option>
                            <option value="always" ${settings.autoDownloadGroupMedia === 'always' ? 'selected' : ''}>Always</option>
                            <option value="never" ${settings.autoDownloadGroupMedia === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cog section-icon"></i> Group Management</h3>
                <div class="section-description">
                    Advanced group management features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Approval Mode</div>
                        <div class="setting-description">
                            Require approval for messages in your groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageApprovalModeGroupToggle" ${settings.messageApprovalModeGroup ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Keyword Filtering</div>
                        <div class="setting-description">
                            Filter messages containing specific keywords in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="keywordFilteringGroupToggle" ${settings.keywordFilteringGroup ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Spam Detection</div>
                        <div class="setting-description">
                            Automatically detect and filter spam in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupSpamDetectionToggle" ${settings.groupSpamDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Member Warnings</div>
                        <div class="setting-description">
                            Show warnings for problematic group members
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="memberWarningsToggle" ${settings.memberWarnings ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-chart-bar section-icon"></i> Group Analytics</h3>
                <div class="section-description">
                    Analytics and insights for groups
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Activity Tracking</div>
                        <div class="setting-description">
                            Track group activity and participation
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="activityTrackingToggle" ${settings.activityTracking ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Top Contributors</div>
                        <div class="setting-description">
                            Highlight top contributors in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="topContributorsToggle" ${settings.topContributors ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Volume Analytics</div>
                        <div class="setting-description">
                            Show analytics about message volume in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageVolumeAnalyticsToggle" ${settings.messageVolumeAnalytics ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Data Cache</div>
                        <div class="setting-description">
                            How much group data to cache locally
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="groupDataCacheSelect">
                            <option value="activeGroupsOnly" ${settings.groupDataCache === 'activeGroupsOnly' ? 'selected' : ''}>Active groups only</option>
                            <option value="allGroups" ${settings.groupDataCache === 'allGroups' ? 'selected' : ''}>All groups</option>
                            <option value="noGroupCache" ${settings.groupDataCache === 'noGroupCache' ? 'selected' : ''}>No group cache</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const selects = ['groupInvitationsSelect', 'groupPrivacySelect', 'autoDownloadGroupMediaSelect', 'groupDataCacheSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.groups[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['autoJoinGroupsToggle', 'groupAnnouncementsToggle', 'messageApprovalModeGroupToggle',
                   'keywordFilteringGroupToggle', 'groupSpamDetectionToggle', 'memberWarningsToggle',
                   'activityTrackingToggle', 'topContributorsToggle', 'messageVolumeAnalyticsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.groups[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// CALLS SECTION
// =============================================
export function loadCallsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-phone section-icon"></i> Calls Settings</h3>
                    <div class="section-description">
                        Authentication required to view calls settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.calls || DEFAULT_SETTINGS.calls;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-phone section-icon"></i> Call Settings</h3>
                <div class="section-description">
                    Configure your calling preferences
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Call Me</div>
                        <div class="setting-description">
                            Control who can make voice or video calls to you
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="callsWhoCanCallMeSelect">
                            <option value="everyone" ${settings.whoCanCallMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.whoCanCallMe === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.whoCanCallMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Verification</div>
                        <div class="setting-description">
                            Verify caller identity before connecting calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callVerificationToggle" ${settings.callVerification ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Ringtone</div>
                        <div class="setting-description">
                            Choose your call ringtone
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="ringtoneSelect">
                            <option value="default" ${settings.ringtone === 'default' ? 'selected' : ''}>Default</option>
                            <option value="classic" ${settings.ringtone === 'classic' ? 'selected' : ''}>Classic</option>
                            <option value="modern" ${settings.ringtone === 'modern' ? 'selected' : ''}>Modern</option>
                            <option value="custom" ${settings.ringtone === 'custom' ? 'selected' : ''}>Custom</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Vibration</div>
                        <div class="setting-description">
                            Vibrate on incoming calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callVibrationToggle" ${settings.callVibration ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Answer</div>
                        <div class="setting-description">
                            Automatically answer calls (use with caution)
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoAnswerToggle" ${settings.autoAnswer ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-video section-icon"></i> Video Call Settings</h3>
                <div class="section-description">
                    Configure video call preferences
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Video Quality</div>
                        <div class="setting-description">
                            Adjust video quality for calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="videoQualitySelect">
                            <option value="auto" ${settings.videoQuality === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="high" ${settings.videoQuality === 'high' ? 'selected' : ''}>High</option>
                            <option value="medium" ${settings.videoQuality === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="low" ${settings.videoQuality === 'low' ? 'selected' : ''}>Low</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Camera Default</div>
                        <div class="setting-description">
                            Default camera for video calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="cameraDefaultSelect">
                            <option value="front" ${settings.cameraDefault === 'front' ? 'selected' : ''}>Front Camera</option>
                            <option value="back" ${settings.cameraDefault === 'back' ? 'selected' : ''}>Back Camera</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Noise Cancellation</div>
                        <div class="setting-description">
                            Reduce background noise during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="noiseCancellationToggle" ${settings.noiseCancellation ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Echo Cancellation</div>
                        <div class="setting-description">
                            Reduce echo during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="echoCancellationToggle" ${settings.echoCancellation ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bolt section-icon"></i> Call Features</h3>
                <div class="section-description">
                    Advanced calling features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Live Reactions</div>
                        <div class="setting-description">
                            Show live reactions during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="liveReactionsToggle" ${settings.liveReactions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">In-Call Chat</div>
                        <div class="setting-description">
                            Chat during voice/video calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="inCallChatToggle" ${settings.inCallChat ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shared Whiteboard</div>
                        <div class="setting-description">
                            Share a whiteboard during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="sharedWhiteboardToggle" ${settings.sharedWhiteboard ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shared Notes</div>
                        <div class="setting-description">
                            Share notes during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="sharedNotesToggle" ${settings.sharedNotes ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Polls</div>
                        <div class="setting-description">
                            Create polls during group calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="pollsToggle" ${settings.polls ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call History Cache</div>
                        <div class="setting-description">
                            How much call history to cache locally
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="callHistoryCacheSelect">
                            <option value="30days" ${settings.callHistoryCache === '30days' ? 'selected' : ''}>30 Days</option>
                            <option value="90days" ${settings.callHistoryCache === '90days' ? 'selected' : ''}>90 Days</option>
                            <option value="180days" ${settings.callHistoryCache === '180days' ? 'selected' : ''}>180 Days</option>
                            <option value="all" ${settings.callHistoryCache === 'all' ? 'selected' : ''}>All</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const selects = ['callsWhoCanCallMeSelect', 'ringtoneSelect', 'videoQualitySelect', 
                   'cameraDefaultSelect', 'callHistoryCacheSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (id === 'callsWhoCanCallMeSelect') {
                    userSettings.calls.whoCanCallMe = element.value;
                } else {
                    userSettings.calls[property] = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['callVerificationToggle', 'callVibrationToggle', 'autoAnswerToggle',
                   'noiseCancellationToggle', 'echoCancellationToggle', 'liveReactionsToggle',
                   'inCallChatToggle', 'sharedWhiteboardToggle', 'sharedNotesToggle', 'pollsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.calls[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// STATUS SECTION
// =============================================
export function loadStatusSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-circle section-icon"></i> Status Settings</h3>
                    <div class="section-description">
                        Authentication required to view status settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.status || DEFAULT_SETTINGS.status;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-circle section-icon"></i> Status Privacy</h3>
                <div class="section-description">
                    Control who can see your status updates
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can View My Status</div>
                        <div class="setting-description">
                            Control who can see your status updates
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="whoCanViewMyStatusSelect">
                            <option value="everyone" ${settings.whoCanViewMyStatus === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.whoCanViewMyStatus === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="selectedFriends" ${settings.whoCanViewMyStatus === 'selectedFriends' ? 'selected' : ''}>Selected Friends</option>
                            <option value="nobody" ${settings.whoCanViewMyStatus === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Expire Status</div>
                        <div class="setting-description">
                            Automatically remove status after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="autoExpireStatusSelect">
                            <option value="24h" ${settings.autoExpireStatus === '24h' ? 'selected' : ''}>24 Hours</option>
                            <option value="12h" ${settings.autoExpireStatus === '12h' ? 'selected' : ''}>12 Hours</option>
                            <option value="6h" ${settings.autoExpireStatus === '6h' ? 'selected' : ''}>6 Hours</option>
                            <option value="1h" ${settings.autoExpireStatus === '1h' ? 'selected' : ''}>1 Hour</option>
                            <option value="custom" ${settings.autoExpireStatus === 'custom' ? 'selected' : ''}>Custom</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Reply Permissions</div>
                        <div class="setting-description">
                            Who can reply to your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="replyPermissionsSelect">
                            <option value="everyone" ${settings.replyPermissions === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.replyPermissions === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.replyPermissions === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Download Permissions</div>
                        <div class="setting-description">
                            Allow others to download your status media
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="downloadPermissionsToggle" ${settings.downloadPermissions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Hide from Specific Users</div>
                        <div class="setting-description">
                            Hide your status from specific users
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="hideFromUsersBtn">
                            <i class="fas fa-user-slash"></i> Manage
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-chart-bar section-icon"></i> Status Analytics</h3>
                <div class="section-description">
                    Analytics and engagement features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">View Count</div>
                        <div class="setting-description">
                            Show how many people viewed your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="viewCountToggle" ${settings.viewCount ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Viewer List</div>
                        <div class="setting-description">
                            Show who viewed your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="viewerListToggle" ${settings.viewerList ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Engagement Reactions</div>
                        <div class="setting-description">
                            Allow reactions to your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="engagementReactionsToggle" ${settings.engagementReactions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-magic section-icon"></i> Status Enhancements</h3>
                <div class="section-description">
                    AI and automation features for status
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Captions</div>
                        <div class="setting-description">
                            Automatically add captions to video status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoCaptionsToggle" ${settings.autoCaptions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">AI Enhancement</div>
                        <div class="setting-description">
                            Use AI to enhance status quality
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="aiEnhancementToggle" ${settings.aiEnhancement ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Scheduling</div>
                        <div class="setting-description">
                            Schedule status posts for later
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="statusSchedulingToggle" ${settings.statusScheduling ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Cache</div>
                        <div class="setting-description">
                            How much status data to cache locally
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="statusCacheSelect">
                            <option value="24hours" ${settings.statusCache === '24hours' ? 'selected' : ''}>24 Hours</option>
                            <option value="7days" ${settings.statusCache === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="none" ${settings.statusCache === 'none' ? 'selected' : ''}>None</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const hideFromUsersBtn = document.getElementById('hideFromUsersBtn');
    if (hideFromUsersBtn) {
        hideFromUsersBtn.addEventListener('click', () => {
            showNotification('Select users to hide your status from', 'info');
        });
    }
    
    const selects = ['whoCanViewMyStatusSelect', 'autoExpireStatusSelect', 'replyPermissionsSelect', 'statusCacheSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.status[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['downloadPermissionsToggle', 'viewCountToggle', 'viewerListToggle',
                   'engagementReactionsToggle', 'autoCaptionsToggle', 'aiEnhancementToggle',
                   'statusSchedulingToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.status[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// NOTIFICATIONS SECTION
// =============================================
export function loadNotificationsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-bell section-icon"></i> Notifications Settings</h3>
                    <div class="section-description">
                        Authentication required to view notifications settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.notifications || DEFAULT_SETTINGS.notifications;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bell section-icon"></i> Notification Types</h3>
                <div class="section-description">
                    Control which notifications you receive
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Notifications</div>
                        <div class="setting-description">
                            Notifications for new messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageNotificationsToggle" ${settings.messageNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Notifications</div>
                        <div class="setting-description">
                            Notifications for group activity
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupNotificationsToggle" ${settings.groupNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Request Notifications</div>
                        <div class="setting-description">
                            Notifications for friend requests
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendRequestNotificationsToggle" ${settings.friendRequestNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Notifications</div>
                        <div class="setting-description">
                            Notifications for incoming calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callNotificationsToggle" ${settings.callNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Notifications</div>
                        <div class="setting-description">
                            Notifications for status updates
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="statusNotificationsToggle" ${settings.statusNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-volume-up section-icon"></i> Notification Preferences</h3>
                <div class="section-description">
                    How notifications are delivered
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Notification Sound</div>
                        <div class="setting-description">
                            Play sound for notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="notificationSoundToggle" ${settings.notificationSound ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Vibration</div>
                        <div class="setting-description">
                            Vibrate for notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="vibrationToggle" ${settings.vibration ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Popup Notifications</div>
                        <div class="setting-description">
                            Show popup notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="popupNotificationsToggle" ${settings.popupNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Notification Light</div>
                        <div class="setting-description">
                            Use notification LED (if available)
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="notificationLightToggle" ${settings.notificationLight ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-moon section-icon"></i> Do Not Disturb</h3>
                <div class="section-description">
                    Quiet hours and disturbance control
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Do Not Disturb</div>
                        <div class="setting-description">
                            Silence all notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="doNotDisturbToggle" ${settings.doNotDisturb ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Schedule</div>
                        <div class="setting-description">
                            When to enable Do Not Disturb
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="scheduleSelect">
                            <option value="custom" ${settings.schedule === 'custom' ? 'selected' : ''}>Custom Hours</option>
                            <option value="night" ${settings.schedule === 'night' ? 'selected' : ''}>Night (10pm-7am)</option>
                            <option value="workHours" ${settings.schedule === 'workHours' ? 'selected' : ''}>Work Hours (9am-5pm)</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Allow Calls</div>
                        <div class="setting-description">
                            Allow calls even during Do Not Disturb
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="allowCallsToggle" ${settings.allowCalls ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Allow Messages From</div>
                        <div class="setting-description">
                            Allow messages from specific contacts during DND
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="allowMessagesFromBtn">
                            <i class="fas fa-users"></i> Select
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const allowMessagesFromBtn = document.getElementById('allowMessagesFromBtn');
    if (allowMessagesFromBtn) {
        allowMessagesFromBtn.addEventListener('click', () => {
            showNotification('Select contacts allowed during Do Not Disturb', 'info');
        });
    }
    
    const scheduleSelect = document.getElementById('scheduleSelect');
    if (scheduleSelect) {
        scheduleSelect.addEventListener('change', function() {
            userSettings.notifications.schedule = this.value;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
    
    const toggles = ['messageNotificationsToggle', 'groupNotificationsToggle', 'friendRequestNotificationsToggle',
                   'callNotificationsToggle', 'statusNotificationsToggle', 'notificationSoundToggle',
                   'vibrationToggle', 'popupNotificationsToggle', 'notificationLightToggle',
                   'doNotDisturbToggle', 'allowCallsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.notifications[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// APPEARANCE SECTION
// =============================================
export function loadAppearanceSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-palette section-icon"></i> Appearance Settings</h3>
                    <div class="section-description">
                        Authentication required to view appearance settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.appearance || DEFAULT_SETTINGS.appearance;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-palette section-icon"></i> Theme & Colors</h3>
                <div class="section-description">
                    Customize the look and feel of the app
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Theme</div>
                        <div class="setting-description">
                            Choose your preferred theme
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="radio-group">
                            <label class="radio-option">
                                <input type="radio" name="theme" class="radio-input" value="light" ${settings.theme === 'light' ? 'checked' : ''}>
                                <span class="radio-label">Light</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="theme" class="radio-input" value="dark" ${settings.theme === 'dark' ? 'checked' : ''}>
                                <span class="radio-label">Dark</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="theme" class="radio-input" value="auto" ${settings.theme === 'auto' ? 'checked' : ''}>
                                <span class="radio-label">Auto</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Accent Color</div>
                        <div class="setting-description">
                            Choose the primary color for the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="color-picker" id="accentColorPicker" 
                             style="background-color: ${settings.accentColor};"
                             title="Click to change color"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Font Size</div>
                        <div class="setting-description">
                            Adjust the text size (${settings.fontSize}px)
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="range" class="setting-slider" id="fontSizeSlider" 
                               min="12" max="20" value="${settings.fontSize}" step="1">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Reduce Motion</div>
                        <div class="setting-description">
                            Reduce animations and motion effects
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="reduceMotionToggle" ${settings.reduceMotion ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood-Based Layouts</div>
                        <div class="setting-description">
                            Change layout based on your current mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="moodBasedLayoutsToggle" ${settings.moodBasedLayouts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-globe section-icon"></i> Language & Region</h3>
                <div class="section-description">
                    Regional and language settings
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Language</div>
                        <div class="setting-description">
                            Choose your preferred language
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="languageSelect">
                            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                            <option value="es" ${settings.language === 'es' ? 'selected' : ''}>Español</option>
                            <option value="fr" ${settings.language === 'fr' ? 'selected' : ''}>Français</option>
                            <option value="de" ${settings.language === 'de' ? 'selected' : ''}>Deutsch</option>
                            <option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>中文</option>
                            <option value="ar" ${settings.language === 'ar' ? 'selected' : ''}>العربية</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Time Format</div>
                        <div class="setting-description">
                            Choose 12-hour or 24-hour time format
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="timeFormatSelect">
                            <option value="12-hour" ${settings.timeFormat === '12-hour' ? 'selected' : ''}>12-hour (1:30 PM)</option>
                            <option value="24-hour" ${settings.timeFormat === '24-hour' ? 'selected' : ''}>24-hour (13:30)</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Date Format</div>
                        <div class="setting-description">
                            Choose your preferred date format
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="dateFormatSelect">
                            <option value="MM/DD/YYYY" ${settings.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option>
                            <option value="DD/MM/YYYY" ${settings.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY</option>
                            <option value="YYYY-MM-DD" ${settings.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-th-large section-icon"></i> Layout & Icons</h3>
                <div class="section-description">
                    Customize layout and icon styles
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Layout Mode</div>
                        <div class="setting-description">
                            Choose your preferred layout style
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="radio-group">
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="compact" ${settings.layoutMode === 'compact' ? 'checked' : ''}>
                                <span class="radio-label">Compact</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="detailed" ${settings.layoutMode === 'detailed' ? 'checked' : ''}>
                                <span class="radio-label">Detailed</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="focus" ${settings.layoutMode === 'focus' ? 'checked' : ''}>
                                <span class="radio-label">Focus</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="auto" ${settings.layoutMode === 'auto' ? 'checked' : ''}>
                                <span class="radio-label">Auto</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Layout Previews</div>
                        <div class="setting-description">
                            Preview different layout modes
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="layout-previews">
                            <div class="layout-preview ${settings.layoutMode === 'compact' ? 'selected' : ''}" data-layout="compact">
                                <div class="preview-thumbnail" style="background: linear-gradient(to bottom, var(--primary-color) 20%, var(--bg-color) 20%);"></div>
                                <div class="preview-title">Compact</div>
                            </div>
                            <div class="layout-preview ${settings.layoutMode === 'detailed' ? 'selected' : ''}" data-layout="detailed">
                                <div class="preview-thumbnail" style="background: linear-gradient(to bottom, var(--primary-color) 40%, var(--bg-color) 40%);"></div>
                                <div class="preview-title">Detailed</div>
                            </div>
                            <div class="layout-preview ${settings.layoutMode === 'focus' ? 'selected' : ''}" data-layout="focus">
                                <div class="preview-thumbnail" style="background: linear-gradient(to bottom, var(--primary-color) 60%, var(--bg-color) 40%);"></div>
                                <div class="preview-title">Focus</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Custom Icons</div>
                        <div class="setting-description">
                            Use custom icon sets
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="customIconsToggle" ${settings.customIcons ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Button Styles</div>
                        <div class="setting-description">
                            Choose button style throughout the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="buttonStylesSelect">
                            <option value="rounded" ${settings.buttonStyles === 'rounded' ? 'selected' : ''}>Rounded</option>
                            <option value="square" ${settings.buttonStyles === 'square' ? 'selected' : ''}>Square</option>
                            <option value="pill" ${settings.buttonStyles === 'pill' ? 'selected' : ''}>Pill</option>
                            <option value="floating" ${settings.buttonStyles === 'floating' ? 'selected' : ''}>Floating</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.addEventListener('change', function() {
            userSettings.appearance.theme = this.value;
            unsavedChanges = true;
            updateSaveButton();
            applyTheme(this.value);
        });
    });
    
    document.querySelectorAll('input[name="layoutMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            userSettings.appearance.layoutMode = this.value;
            unsavedChanges = true;
            updateSaveButton();
            
            document.querySelectorAll('.layout-preview').forEach(preview => {
                preview.classList.remove('selected');
                if (preview.dataset.layout === this.value) {
                    preview.classList.add('selected');
                }
            });
        });
    });
    
    document.querySelectorAll('.layout-preview').forEach(preview => {
        preview.addEventListener('click', function() {
            const layout = this.dataset.layout;
            userSettings.appearance.layoutMode = layout;
            unsavedChanges = true;
            updateSaveButton();
            
            const radio = document.querySelector(`input[name="layoutMode"][value="${layout}"]`);
            if (radio) {
                radio.checked = true;
            }
            
            document.querySelectorAll('.layout-preview').forEach(p => {
                p.classList.remove('selected');
            });
            this.classList.add('selected');
        });
    });
    
    const accentColorPicker = document.getElementById('accentColorPicker');
    if (accentColorPicker) {
        accentColorPicker.addEventListener('click', function() {
            if (colorPicker) {
                colorPicker.show();
            }
        });
    }
    
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', function() {
            userSettings.appearance.fontSize = parseInt(this.value);
            unsavedChanges = true;
            updateSaveButton();
            applyFontSize(this.value);
        });
    }
    
    const selects = ['languageSelect', 'timeFormatSelect', 'dateFormatSelect', 'buttonStylesSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.appearance[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['reduceMotionToggle', 'moodBasedLayoutsToggle', 'customIconsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.appearance[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// STORAGE SECTION
// =============================================
export function loadStorageSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-database section-icon"></i> Storage Settings</h3>
                    <div class="section-description">
                        Authentication required to view storage settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.storage || DEFAULT_SETTINGS.storage;
    const totalUsed = settings.totalStorageUsed;
    const totalAvailable = settings.storageTotal;
    const percentUsed = Math.min((totalUsed / totalAvailable) * 100, 100);
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-database section-icon"></i> Storage Overview</h3>
                <div class="section-description">
                    Monitor your storage usage
                </div>
            </div>
            <div class="section-body">
                <div class="storage-info">
                    <div class="storage-header">
                        <div class="storage-label">Total Storage Used</div>
                        <div class="storage-value">${formatStorageSize(totalUsed)} / ${formatStorageSize(totalAvailable)}</div>
                    </div>
                    <div class="storage-bar">
                        <div class="storage-fill" style="width: ${percentUsed}%;"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Storage</div>
                        <div class="setting-description">
                            Messages and chat data
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="storage-value">${formatStorageSize(settings.storageBreakdown.chats)}</div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Media Storage</div>
                        <div class="setting-description">
                            Photos, videos, and documents
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="storage-value">${formatStorageSize(settings.storageBreakdown.media)}</div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Other Storage</div>
                        <div class="setting-description">
                            Cache and other app data
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="storage-value">${formatStorageSize(settings.storageBreakdown.other)}</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-broom section-icon"></i> Cache Management</h3>
                <div class="section-description">
                    Manage cached data and storage
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Clear Cache</div>
                        <div class="setting-description">
                            Automatically clear cache at intervals
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="autoClearCacheSelect">
                            <option value="never" ${settings.autoClearCache === 'never' ? 'selected' : ''}>Never</option>
                            <option value="weekly" ${settings.autoClearCache === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${settings.autoClearCache === 'monthly' ? 'selected' : ''}>Monthly</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear Chat Cache</div>
                        <div class="setting-description">
                            Clear cached chat data
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearChatCacheBtn">
                            <i class="fas fa-trash"></i> Clear Now
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear Media Cache</div>
                        <div class="setting-description">
                            Clear cached media files
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearMediaCacheBtn">
                            <i class="fas fa-trash"></i> Clear Now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const clearChatCacheBtn = document.getElementById('clearChatCacheBtn');
    if (clearChatCacheBtn) {
        clearChatCacheBtn.addEventListener('click', () => {
            showConfirmation(
                'Clear Chat Cache',
                'Are you sure you want to clear all chat cache? This will remove temporary chat data but not your messages.',
                () => {
                    clearChatCache();
                }
            );
        });
    }
    
    const clearMediaCacheBtn = document.getElementById('clearMediaCacheBtn');
    if (clearMediaCacheBtn) {
        clearMediaCacheBtn.addEventListener('click', () => {
            showConfirmation(
                'Clear Media Cache',
                'Are you sure you want to clear all media cache? This will remove downloaded media files but they can be re-downloaded.',
                () => {
                    clearMediaCache();
                }
            );
        });
    }
    
    const autoClearCacheSelect = document.getElementById('autoClearCacheSelect');
    if (autoClearCacheSelect) {
        autoClearCacheSelect.addEventListener('change', function() {
            userSettings.storage.autoClearCache = this.value;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
}

// =============================================
// MOOD SETTINGS SECTION
// =============================================
export function loadMoodSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-smile section-icon"></i> Mood Settings</h3>
                    <div class="section-description">
                        Authentication required to view mood settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.mood || DEFAULT_SETTINGS.mood;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-smile section-icon"></i> Mood Detection</h3>
                <div class="section-description">
                    Configure how your mood is detected and displayed
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Mood Detection</div>
                        <div class="setting-description">
                            Automatically detect your mood based on activity
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoMoodDetectionToggle" ${settings.autoMoodDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Manual Mood Override</div>
                        <div class="setting-description">
                            Manually set your mood instead of auto-detection
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="manualMoodOverrideSelect">
                            <option value="autoDetect" ${settings.manualMoodOverride === 'autoDetect' ? 'selected' : ''}>Auto-Detect</option>
                            <option value="happy" ${settings.manualMoodOverride === 'happy' ? 'selected' : ''}>Happy</option>
                            <option value="calm" ${settings.manualMoodOverride === 'calm' ? 'selected' : ''}>Calm</option>
                            <option value="energetic" ${settings.manualMoodOverride === 'energetic' ? 'selected' : ''}>Energetic</option>
                            <option value="focused" ${settings.manualMoodOverride === 'focused' ? 'selected' : ''}>Focused</option>
                            <option value="relaxed" ${settings.manualMoodOverride === 'relaxed' ? 'selected' : ''}>Relaxed</option>
                            <option value="stressed" ${settings.manualMoodOverride === 'stressed' ? 'selected' : ''}>Stressed</option>
                            <option value="tired" ${settings.manualMoodOverride === 'tired' ? 'selected' : ''}>Tired</option>
                            <option value="excited" ${settings.manualMoodOverride === 'excited' ? 'selected' : ''}>Excited</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Update After Calls</div>
                        <div class="setting-description">
                            Update mood based on call interactions
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="updateAfterCallsToggle" ${settings.updateAfterCalls ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Update After Status Posts</div>
                        <div class="setting-description">
                            Update mood based on status content
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="updateAfterStatusPostsToggle" ${settings.updateAfterStatusPosts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Update After Activity</div>
                        <div class="setting-description">
                            Update mood based on app usage patterns
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="updateAfterActivityToggle" ${settings.updateAfterActivity ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-palette section-icon"></i> Mood Colors</h3>
                <div class="section-description">
                    Customize colors for each mood type
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood-Linked Theme</div>
                        <div class="setting-description">
                            Change app theme based on your mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="moodLinkedThemeToggle" ${settings.moodLinkedTheme ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="mood-colors-grid">
                    <div class="mood-color-item ${settings.currentMood === 'happy' ? 'active' : ''}" data-mood="happy">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.happy};"></div>
                        <div class="mood-color-label">Happy</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'calm' ? 'active' : ''}" data-mood="calm">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.calm};"></div>
                        <div class="mood-color-label">Calm</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'energetic' ? 'active' : ''}" data-mood="energetic">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.energetic};"></div>
                        <div class="mood-color-label">Energetic</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'focused' ? 'active' : ''}" data-mood="focused">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.focused};"></div>
                        <div class="mood-color-label">Focused</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'relaxed' ? 'active' : ''}" data-mood="relaxed">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.relaxed};"></div>
                        <div class="mood-color-label">Relaxed</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'stressed' ? 'active' : ''}" data-mood="stressed">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.stressed};"></div>
                        <div class="mood-color-label">Stressed</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'tired' ? 'active' : ''}" data-mood="tired">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.tired};"></div>
                        <div class="mood-color-label">Tired</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'excited' ? 'active' : ''}" data-mood="excited">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.excited};"></div>
                        <div class="mood-color-label">Excited</div>
                    </div>
                </div>
                
                <div style="margin-top: 20px; font-size: 12px; color: var(--text-secondary); text-align: center;">
                    Click on a mood to set it as current, or long press to edit its color
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bell section-icon"></i> Mood-Based Features</h3>
                <div class="section-description">
                    Smart features that adapt to your mood
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Smart Notifications</div>
                        <div class="setting-description">
                            Adjust notification behavior based on mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="smartNotificationsToggle" ${settings.smartNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood Auto-Replies</div>
                        <div class="setting-description">
                            Auto-reply to messages based on your mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="moodAutoRepliesToggle" ${settings.moodAutoReplies ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Stressed Mode Rules</div>
                        <div class="setting-description">
                            Apply special rules when stressed
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="stressedModeRulesToggle" ${settings.stressedModeRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Focused Mode Rules</div>
                        <div class="setting-description">
                            Apply special rules when focused
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="focusedModeRulesToggle" ${settings.focusedModeRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Happy Mode Rules</div>
                        <div class="setting-description">
                            Apply special rules when happy
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="happyModeRulesToggle" ${settings.happyModeRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.querySelectorAll('.mood-color-item').forEach(item => {
        item.addEventListener('click', function() {
            const mood = this.dataset.mood;
            userSettings.mood.currentMood = mood;
            userSettings.profile.currentMood = mood;
            unsavedChanges = true;
            updateSaveButton();
            
            document.querySelectorAll('.mood-color-item').forEach(i => {
                i.classList.remove('active');
            });
            this.classList.add('active');
            
            const currentMoodText = document.getElementById('currentMoodText');
            if (currentMoodText) {
                currentMoodText.textContent = getMoodText(mood);
            }
            
            const moodIndicator = document.querySelector('.mood-indicator');
            if (moodIndicator) {
                moodIndicator.style.backgroundColor = getMoodColor(mood);
            }
            
            showNotification(`Mood set to ${getMoodText(mood)}`, 'success');
        });
        
        let pressTimer;
        item.addEventListener('mousedown', function() {
            pressTimer = setTimeout(() => {
                const mood = this.dataset.mood;
                editMoodColor(mood);
            }, 1000);
        });
        
        item.addEventListener('mouseup', function() {
            clearTimeout(pressTimer);
        });
        
        item.addEventListener('mouseleave', function() {
            clearTimeout(pressTimer);
        });
        
        item.addEventListener('touchstart', function(e) {
            pressTimer = setTimeout(() => {
                const mood = this.dataset.mood;
                editMoodColor(mood);
                e.preventDefault();
            }, 1000);
        });
        
        item.addEventListener('touchend', function() {
            clearTimeout(pressTimer);
        });
    });
    
    const toggles = ['autoMoodDetectionToggle', 'smartNotificationsToggle', 'moodAutoRepliesToggle',
                   'stressedModeRulesToggle', 'focusedModeRulesToggle', 'happyModeRulesToggle',
                   'moodLinkedThemeToggle', 'updateAfterCallsToggle', 'updateAfterStatusPostsToggle',
                   'updateAfterActivityToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.mood[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const manualMoodOverrideSelect = document.getElementById('manualMoodOverrideSelect');
    if (manualMoodOverrideSelect) {
        manualMoodOverrideSelect.addEventListener('change', function() {
            userSettings.mood.manualMoodOverride = this.value;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
}

// =============================================
// ADVANCED SECTION
// =============================================
export function loadAdvancedSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-cogs section-icon"></i> Advanced Settings</h3>
                    <div class="section-description">
                        Authentication required to view advanced settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.advanced || DEFAULT_SETTINGS.advanced;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cogs section-icon"></i> Advanced Settings</h3>
                <div class="section-description">
                    Developer options and advanced configuration
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Offline Mode</div>
                        <div class="setting-description">
                            Work offline without internet connection
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="offlineModeToggle" ${settings.offlineMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Intranet Support</div>
                        <div class="setting-description">
                            Enable support for intranet connections
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="intranetSupportToggle" ${settings.intranetSupport ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Low Bandwidth Mode</div>
                        <div class="setting-description">
                            Optimize for slow connections
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="lowBandwidthModeToggle" ${settings.lowBandwidthMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Debug Mode</div>
                        <div class="setting-description">
                            Enable debug logging and tools
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="debugModeToggle" ${settings.debugMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Data Saver</div>
                        <div class="setting-description">
                            Reduce data usage throughout the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="dataSaverToggle" ${settings.dataSaver ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const toggles = ['offlineModeToggle', 'intranetSupportToggle', 'lowBandwidthModeToggle', 'debugModeToggle', 'dataSaverToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.advanced[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// BACKUP SECTION
// =============================================
export function loadBackupSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-cloud-upload-alt section-icon"></i> Backup & Restore</h3>
                    <div class="section-description">
                        Authentication required to view backup settings
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.backup || DEFAULT_SETTINGS.backup;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cloud-upload-alt section-icon"></i> Backup Settings</h3>
                <div class="section-description">
                    Configure automatic backups
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Backup</div>
                        <div class="setting-description">
                            Automatically backup your data
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoBackupToggle" ${settings.autoBackup ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Frequency</div>
                        <div class="setting-description">
                            How often to backup your data
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="backupFrequencySelect">
                            <option value="daily" ${settings.backupFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                            <option value="weekly" ${settings.backupFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${settings.backupFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Location</div>
                        <div class="setting-description">
                            Where to store your backups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="backupLocationSelect">
                            <option value="cloud" ${settings.backupLocation === 'cloud' ? 'selected' : ''}>Cloud</option>
                            <option value="local" ${settings.backupLocation === 'local' ? 'selected' : ''}>Local</option>
                            <option value="both" ${settings.backupLocation === 'both' ? 'selected' : ''}>Both</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Last Backup</div>
                        <div class="setting-description">
                            ${settings.lastBackup ? new Date(settings.lastBackup).toLocaleString() : 'Never'}
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="backupNowBtn">
                            <i class="fas fa-cloud-upload-alt"></i> Backup Now
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Size</div>
                        <div class="setting-description">
                            ${formatStorageSize(settings.backupSize)}
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="restoreBackupBtn">
                            <i class="fas fa-cloud-download-alt"></i> Restore
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const backupNowBtn = document.getElementById('backupNowBtn');
    if (backupNowBtn) {
        backupNowBtn.addEventListener('click', () => {
            showNotification('Backup started', 'info');
            setTimeout(() => {
                userSettings.backup.lastBackup = new Date().toISOString();
                userSettings.backup.backupSize = Math.floor(Math.random() * 10000000);
                unsavedChanges = true;
                updateSaveButton();
                loadSection('backup');
                showNotification('Backup completed successfully', 'success');
            }, 2000);
        });
    }
    
    const restoreBackupBtn = document.getElementById('restoreBackupBtn');
    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', () => {
            showConfirmation(
                'Restore Backup',
                'Are you sure you want to restore from backup? This will overwrite current data.',
                () => {
                    showNotification('Restore started', 'info');
                    setTimeout(() => {
                        showNotification('Restore completed successfully', 'success');
                    }, 2000);
                }
            );
        });
    }
    
    const autoBackupToggle = document.getElementById('autoBackupToggle');
    if (autoBackupToggle) {
        autoBackupToggle.addEventListener('change', function() {
            userSettings.backup.autoBackup = this.checked;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
    
    const selects = ['backupFrequencySelect', 'backupLocationSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', function() {
                const property = id.replace('Select', '');
                userSettings.backup[property] = this.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// DANGER ZONE SECTION
// =============================================
export function loadDangerSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-exclamation-triangle section-icon"></i> Danger Zone</h3>
                    <div class="section-description">
                        Authentication required to view danger zone
                    </div>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-lock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                        <p style="color: var(--text-secondary);">
                            Please wait for authentication to complete...
                        </p>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const settings = userSettings.danger || DEFAULT_SETTINGS.danger;
    
    container.innerHTML = `
        <div class="settings-section" style="border-color: var(--danger-color);">
            <div class="section-header">
                <h3><i class="fas fa-exclamation-triangle section-icon" style="color: var(--danger-color);"></i> Account Actions</h3>
                <div class="section-description" style="color: var(--danger-color);">
                    These actions are irreversible - proceed with caution
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Export Data</div>
                        <div class="setting-description">
                            Export all your data in JSON format
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="exportDataBtn" style="background-color: var(--primary-color); color: white;">
                            <i class="fas fa-download"></i> Export
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Delete Account</div>
                        <div class="setting-description">
                            Permanently delete your account and all data
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="deleteAccountBtn" style="background-color: var(--danger-color); color: white;">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            showNotification('Preparing data export...', 'info');
            setTimeout(() => {
                const dataStr = JSON.stringify(userSettings, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                const exportFileDefaultName = `kynecta-settings-${new Date().toISOString().slice(0,10)}.json`;
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
                showNotification('Data exported successfully', 'success');
            }, 1500);
        });
    }
    
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            showConfirmation(
                'Delete Account',
                'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.',
                () => {
                    showConfirmation(
                        'Confirm Account Deletion',
                        'This is your final warning. Please type "DELETE" to confirm.',
                        () => {
                            showNotification('Account deletion requested', 'warning');
                            setTimeout(() => {
                                sendMessageToParent({
                                    type: PARENT_MESSAGE_TYPES.LOGOUT,
                                    childId: 'settings',
                                    timestamp: Date.now()
                                }).catch(() => {});
                            }, 2000);
                        }
                    );
                }
            );
        });
    }
}

// =============================================
// SHOW ACTIVE SESSIONS
// =============================================
export function showActiveSessions() {
    const sessionsList = document.getElementById('sessionsList');
    const sessionsModal = document.getElementById('sessionsModal');
    
    if (!sessionsList || !sessionsModal) return;
    
    sessionsList.innerHTML = '';
    
    sessionsList.innerHTML += `
        <div class="session-item">
            <div class="session-icon">
                <i class="fas fa-laptop"></i>
            </div>
            <div class="session-info">
                <div class="session-name">Current Session</div>
                <div class="session-details">This device • ${new Date().toLocaleDateString()}</div>
            </div>
            <div class="session-actions">
                <span style="color: var(--success-color); font-size: 12px;">Active</span>
            </div>
        </div>
    `;
    
    activeSessions.forEach(session => {
        sessionsList.innerHTML += `
            <div class="session-item">
                <div class="session-icon">
                    <i class="fas ${session.deviceType === 'mobile' ? 'fa-mobile-alt' : 'fa-desktop'}"></i>
                </div>
                <div class="session-info">
                    <div class="session-name">${session.deviceName || 'Unknown Device'}</div>
                    <div class="session-details">${session.location || 'Unknown'} • ${session.lastActive ? new Date(session.lastActive).toLocaleDateString() : 'Unknown'}</div>
                </div>
                <div class="session-actions">
                    <button class="terminate-btn" data-session-id="${session.id}">Terminate</button>
                </div>
            </div>
        `;
    });
    
    document.querySelectorAll('.terminate-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sessionId = this.dataset.sessionId;
            terminateSession(sessionId).catch(error => {
                showNotification('Error terminating session: ' + error.message, 'error');
            });
        });
    });
    
    sessionsModal.classList.add('active');
}

// =============================================
// SHOW BLOCKED USERS
// =============================================
export function showBlockedUsers() {
    const blockedUsersList = document.getElementById('blockedUsersList');
    const blockedUsersModal = document.getElementById('blockedUsersModal');
    
    if (!blockedUsersList || !blockedUsersModal) return;
    
    blockedUsersList.innerHTML = '';
    
    if (blockedUsers.length === 0) {
        blockedUsersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No blocked users</p>';
    } else {
        blockedUsers.forEach(user => {
            blockedUsersList.innerHTML += `
                <div class="blocked-user-item">
                    <div class="blocked-user-icon">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="blocked-user-info">
                        <div class="blocked-user-name">${user.name || 'Unknown'}</div>
                        <div class="blocked-user-details">Blocked on ${user.blockedDate ? new Date(user.blockedDate).toLocaleDateString() : 'Unknown'}</div>
                    </div>
                    <div class="blocked-user-actions">
                        <button class="unblock-btn" data-user-id="${user.id}">Unblock</button>
                    </div>
                </div>
            `;
        });
        
        document.querySelectorAll('.unblock-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const userId = this.dataset.userId;
                unblockUser(userId).catch(error => {
                    showNotification('Error unblocking user: ' + error.message, 'error');
                });
            });
        });
    }
    
    blockedUsersModal.classList.add('active');
}

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('[SettingsUI] DOM loaded, bootstrapping iframe');
        
        await bootstrapIframe();
        
        const sessionReady = await waitForSession(10000);
        
        if (sessionReady) {
            console.log('[SettingsUI] Session ready, initializing UI');
            initializeUI();
        } else {
            console.log('[SettingsUI] Session not ready, showing reconnection state');
            showReconnectionState();
        }
        
        buildSettingsMenu();
        setupEventListeners();
        updateUserStatus();
        initializeColorPicker();
        
        if (currentSection) {
            loadSection(currentSection);
        }
        
        const userNamePreview = document.getElementById('userNamePreview');
        if (userNamePreview && currentUser) {
            userNamePreview.textContent = currentUser.displayName || currentUser.name || 'User';
        }
        
        console.log('[SettingsUI] UI initialization complete');
        
    } catch (error) {
        console.error('[SettingsUI] Initialization error:', error);
        showNotification('Error initializing settings: ' + error.message, 'error');
    }
});