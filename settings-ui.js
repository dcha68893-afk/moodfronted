// =============================================
// SETTINGS UI - COMPLETE IMPLEMENTATION v6.0.0
// ENHANCED PARENT COMMUNICATION | FULL SECTION SUPPORT
// INTEGRATED WITH CORE HARDENING | UI FAILSAFE
// SILENT BACKGROUND OPERATIONS | NO VISUAL NOISE
// =============================================

import {
    // Core state
    currentUser,
    userSettings,
    currentSection,
    unsavedChanges,
    blockedUsers,
    activeSessions,
    userContacts,
    userGroups,
    
    // Auth state
    authReady,
    apiInitialized,
    backgroundTasksStarted,
    tokenReady,
    tokenAvailable,
    tokenInitialized,
    parentCommunicationReady,
    parentSessionReceived,
    parentOrigin,
    parentSessionData,
    sessionValidated,
    
    // Constants
    MAX_API_RETRIES,
    AUTH_CHECK_INTERVAL,
    TOKEN_CHECK_INTERVAL,
    MAX_HANDSHAKE_ATTEMPTS,
    HANDSHAKE_RETRY_INTERVAL,
    
    // Defaults
    DEFAULT_SETTINGS,
    SETTINGS_MENU,
    PARENT_MESSAGE_TYPES,
    
    // Core functions
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
    saveSettings as coreSaveSettings,
    notifyParentAuthState,
    notifyParentAuthError,
    loadFromLocalStorage,
    updateUserUI,
    initializeUI as coreInitializeUI,
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
    isReady,
    
    // Enhanced exports from hardened core
    getCoreDiagnostics,
    getHealthMetrics,
    forceRecovery,
    handshakeState,
    connectionQuality,
    StartupGovernor,
    SessionClient,
    ReliabilityEngine,
    DiagnosticsAgent,
    CompatibilityBridge,
    MultiModuleCoordinator,
    IframeEnvironment,
    SafeStorage,
    IframeTransport,
    IframeHandshakeAuthority,
    RecoveryManager,
    NavigationGuard,
    UIFailsafe
} from './settings-core.js';

// =============================================
// UI STATE VARIABLES - ENHANCED
// =============================================
let colorPicker = null;
let uiInitialized = false;
let currentModal = null;
let pendingPhotoData = null;
let searchDebounceTimer = null;
let sectionLoadInProgress = false;
let uiReady = false;
let uiComponentsInitialized = false;
let activeModals = new Set();
let pendingUIUpdates = new Map();
let uiRenderQueue = [];
let uiErrorCount = 0;
let maxUIErrors = 10;
let uiRecoveryTimer = null;
let lastUIAction = 0;
let uiThrottleEnabled = false;

// Silent mode - don't show console noise in production
const SILENT_MODE = !window.__IFRAME_DEBUG__;

function debugLog(...args) {
    if (!SILENT_MODE && window.__IFRAME_DEBUG__) {
        console.log('[UI-DEBUG]', ...args);
    }
}

// =============================================
// UI ERROR BOUNDARY (ENHANCED)
// =============================================
const UIErrorBoundary = {
    _errors: [],
    _maxErrors: 20,
    _handlers: new Set(),
    _silent: true,
    
    wrap(fn, context = 'unknown') {
        return function(...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                UIErrorBoundary.capture(error, context, args);
                
                // Silent recovery - no user visible message
                if (UIErrorBoundary._errors.length > 5) {
                    attemptUIRecovery();
                }
                
                return null;
            }
        };
    },
    
    capture(error, context, args) {
        const errorEntry = {
            message: error.message,
            stack: error.stack,
            context,
            args: args ? JSON.stringify(args).substring(0, 100) : null,
            timestamp: Date.now(),
            timeStr: new Date().toISOString()
        };
        
        this._errors.push(errorEntry);
        if (this._errors.length > this._maxErrors) {
            this._errors.shift();
        }
        
        uiErrorCount++;
        
        // Only log if debug mode
        if (!SILENT_MODE) {
            console.error(`[UI Error][${context}]`, error, args);
        }
        
        // Log to diagnostics silently
        if (DiagnosticsAgent) {
            DiagnosticsAgent.error(error, `ui_${context}`);
        }
    },
    
    getErrors() {
        return [...this._errors];
    },
    
    clear() {
        this._errors = [];
        uiErrorCount = 0;
    }
};

// =============================================
// UI INITIALIZATION - SILENT BACKGROUND
// =============================================

export async function initializeUI() {
    if (uiInitialized) return;
    
    const wrappedInit = UIErrorBoundary.wrap(async function() {
        debugLog('[SettingsUI] Initializing UI components');
        
        // Check sandbox mode silently
        const sandboxInfo = IframeEnvironment ? IframeEnvironment.getInfo() : { features: { isSandboxed: false } };
        
        // Wait for core silently
        const coreReady = await waitForCore(8000);
        if (!coreReady) {
            debugLog('[SettingsUI] Core not ready, showing loading state silently');
            showLoadingState();
            
            // Set up retry silently
            setTimeout(() => {
                if (!uiInitialized) {
                    initializeUI();
                }
            }, 2000);
            return;
        }
        
        // Build menu structure
        buildSettingsMenu();
        
        // Setup all event listeners silently
        setupEventListeners();
        
        // Update user status display silently
        updateUserStatus();
        
        // Initialize color picker silently
        initializeColorPicker();
        
        // Load initial section silently
        if (currentSection) {
            await loadSection(currentSection);
        }
        
        // Update user name preview
        updateUserPreview();
        
        // Setup visibility tracking silently
        setupUIVisibilityTracking();
        
        // Register with core for updates silently
        registerForCoreUpdates();
        
        // Setup keyboard shortcuts silently
        setupKeyboardShortcuts();
        
        // Setup network-aware UI adjustments silently
        setupNetworkAwareUI();
        
        uiInitialized = true;
        uiReady = true;
        
        // Dispatch UI ready event silently
        dispatchUIReady();
        
        debugLog('[SettingsUI] UI initialization complete');
        
    }, 'initializeUI');
    
    await wrappedInit();
}

// Wait for core with timeout
function waitForCore(timeout = 5000) {
    return new Promise((resolve) => {
        if (isReady) {
            resolve(true);
            return;
        }
        
        const timeoutId = setTimeout(() => {
            resolve(false);
        }, timeout);
        
        onReady(() => {
            clearTimeout(timeoutId);
            resolve(true);
        });
    });
}

// Show loading state (minimal, no console noise)
function showLoadingState() {
    const contentContainer = document.getElementById('settingsContent');
    if (!contentContainer) return;
    
    // Only show loading if content is empty
    if (contentContainer.children.length === 0 || 
        contentContainer.innerHTML.includes('Initializing')) {
        contentContainer.innerHTML = `
            <div class="settings-section" style="text-align: center; padding: 50px;">
                <div class="section-header">
                    <h3><i class="fas fa-spinner fa-spin section-icon"></i> Loading Settings</h3>
                </div>
            </div>
        `;
    }
}

// Show fallback UI (minimal, no console noise)
function showFallbackUI() {
    const contentContainer = document.getElementById('settingsContent');
    if (!contentContainer) return;
    
    // Only show if we're actually in fallback mode
    if (UIFailsafe && UIFailsafe.isInFallback()) {
        contentContainer.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-exclamation-triangle section-icon" style="color: var(--warning-color);"></i> Limited Mode</h3>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 20px;">
                        <p>Working in limited mode</p>
                        <button class="action-btn primary" id="retryConnectionBtn" style="display: none;">Retry</button>
                    </div>
                </div>
            </div>
        `;
        
        const retryBtn = document.getElementById('retryConnectionBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                if (UIFailsafe) UIFailsafe.exitFallbackMode();
            });
        }
    }
}

// Setup UI visibility tracking
function setupUIVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Page became visible - refresh UI if needed silently
            if (currentSection && !sectionLoadInProgress) {
                setTimeout(() => {
                    loadSection(currentSection);
                }, 100);
            }
            
            // Update status silently
            updateUserStatus();
        }
    });
}

// Register for core updates
function registerForCoreUpdates() {
    window.addEventListener('coreDataUpdated', (event) => {
        const { dataType, data } = event.detail;
        
        if (dataType === 'settings' && currentSection) {
            loadSection(currentSection);
        } else if (dataType === 'user' && currentSection === 'profile') {
            loadSection('profile');
            updateUserPreview();
        }
    });
    
    window.addEventListener('tokenReady', () => {
        // Silent update
        updateUserStatus();
        if (currentSection) {
            loadSection(currentSection);
        }
    });
    
    window.addEventListener('tokenLost', () => {
        // Silent update
        updateUserStatus();
        if (UIFailsafe) UIFailsafe.enterFallbackMode();
    });
    
    // Listen for governor state changes silently
    if (StartupGovernor && StartupGovernor.onTransition) {
        StartupGovernor.onTransition((oldState, newState) => {
            updateConnectionState(newState);
        });
    }
    
    // Listen for session updates silently
    if (SessionClient && SessionClient.on) {
        SessionClient.on('session_updated', () => {
            updateUserPreview();
            updateUserStatus();
        });
    }
}

// Update connection state in UI (silent)
function updateConnectionState(state) {
    const statusIndicator = document.getElementById('userStatusIndicator');
    const statusText = document.getElementById('userStatusText');
    
    if (!statusIndicator || !statusText) return;
    
    switch(state) {
        case 'ACTIVE':
            statusIndicator.style.backgroundColor = 'var(--success-color)';
            statusText.textContent = 'Online';
            break;
            
        case 'DEGRADED':
            statusIndicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = 'Connected';
            break;
            
        case 'RECOVERING':
        case 'HANDSHAKING':
            statusIndicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = 'Connecting...';
            break;
            
        case 'FAILED':
            statusIndicator.style.backgroundColor = 'var(--danger-color)';
            statusText.textContent = 'Offline';
            break;
            
        default:
            statusIndicator.style.backgroundColor = 'var(--text-secondary)';
            statusText.textContent = 'Initializing...';
    }
}

// Dispatch UI ready event
function dispatchUIReady() {
    const event = new CustomEvent('settingsUIReady', {
        detail: {
            timestamp: Date.now(),
            currentSection,
            authenticated: checkAuthenticationState()
        }
    });
    window.dispatchEvent(event);
}

// Update user preview
function updateUserPreview() {
    const userNamePreview = document.getElementById('userNamePreview');
    const userAvatarPreview = document.getElementById('userAvatarPreview');
    
    if (userNamePreview && currentUser) {
        userNamePreview.textContent = currentUser.displayName || currentUser.name || 'User';
    }
    
    if (userAvatarPreview && currentUser) {
        if (currentUser.photoURL || userSettings?.profile?.photoUrl) {
            const photoUrl = currentUser.photoURL || userSettings.profile.photoUrl;
            userAvatarPreview.style.backgroundImage = `url(${photoUrl})`;
            userAvatarPreview.style.backgroundSize = 'cover';
            userAvatarPreview.style.backgroundPosition = 'center';
            userAvatarPreview.innerHTML = '';
        } else {
            const initials = currentUser.displayName ? 
                currentUser.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
                'U';
            userAvatarPreview.innerHTML = `<span style="color: white; font-size: 18px;">${initials}</span>`;
            userAvatarPreview.style.backgroundImage = '';
        }
    }
}

// Setup network-aware UI
function setupNetworkAwareUI() {
    if (!ReliabilityEngine) return;
    
    const updateForNetwork = () => {
        const quality = connectionQuality || 'unknown';
        const statusIndicator = document.getElementById('userStatusIndicator');
        
        if (quality === 'poor' || quality === 'degraded') {
            document.body.classList.add('slow-connection');
        } else {
            document.body.classList.remove('slow-connection');
        }
    };
    
    // Listen for network changes silently
    if (ReliabilityEngine.on) {
        ReliabilityEngine.on('degraded', updateForNetwork);
    }
}

// =============================================
// KEYBOARD SHORTCUTS (ENHANCED)
// =============================================
function setupKeyboardShortcuts() {
    const wrappedHandler = UIErrorBoundary.wrap(function(e) {
        // Don't trigger if in input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }
        
        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (unsavedChanges) {
                saveSettings();
            }
        }
        
        // Escape to close modal
        if (e.key === 'Escape' && activeModals.size > 0) {
            const lastModal = Array.from(activeModals).pop();
            closeModal(lastModal);
        }
        
        // Ctrl/Cmd + F to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('settingsSearch');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
    }, 'keyboardShortcut');
    
    document.addEventListener('keydown', wrappedHandler);
}

// =============================================
// BUILD SETTINGS MENU - ENHANCED
// =============================================
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
        
        // Check authentication requirement
        const hasAuth = checkAuthenticationState();
        if (item.requiresAuth && !hasAuth) {
            menuItem.style.opacity = '0.5';
            menuItem.style.pointerEvents = 'none';
            menuItem.setAttribute('title', 'Sign in required');
        }
        
        menuItem.setAttribute('data-section', item.id);
        
        menuItem.innerHTML = `
            <div class="menu-icon">
                <i class="${item.icon}"></i>
            </div>
            <div class="menu-text">${item.title}</div>
            ${item.badge ? `<div class="menu-badge">${item.badge}</div>` : ''}
        `;
        
        menuItem.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (item.requiresAuth && !hasAuth) {
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
    
    // Add connection status indicator silently
    addConnectionStatusIndicator();
}

// Add connection status indicator to menu
function addConnectionStatusIndicator() {
    const menuContainer = document.getElementById('settingsMenu');
    if (!menuContainer) return;
    
    const statusItem = document.createElement('div');
    statusItem.className = 'menu-item';
    statusItem.style.opacity = '0.7';
    statusItem.style.cursor = 'default';
    statusItem.style.borderTop = '1px solid var(--border-color)';
    statusItem.style.marginTop = '10px';
    
    const governorState = StartupGovernor ? StartupGovernor.getState() : 'unknown';
    
    let statusIcon = 'fa-circle';
    let statusColor = 'var(--warning-color)';
    let statusText = governorState;
    
    if (governorState === 'ACTIVE') {
        statusIcon = 'fa-check-circle';
        statusColor = 'var(--success-color)';
        statusText = 'Connected';
    } else if (governorState === 'DEGRADED') {
        statusIcon = 'fa-exclamation-triangle';
        statusColor = 'var(--warning-color)';
        statusText = 'Limited';
    } else if (governorState === 'FAILED') {
        statusIcon = 'fa-times-circle';
        statusColor = 'var(--danger-color)';
        statusText = 'Offline';
    } else if (governorState === 'RECOVERING') {
        statusIcon = 'fa-sync fa-spin';
        statusColor = 'var(--warning-color)';
        statusText = 'Reconnecting';
    }
    
    statusItem.innerHTML = `
        <div class="menu-icon">
            <i class="fas ${statusIcon}" style="color: ${statusColor};"></i>
        </div>
        <div class="menu-text">Status: ${statusText}</div>
    `;
    
    menuContainer.appendChild(statusItem);
}

// =============================================
// LOAD SECTION - ENHANCED WITH ERROR HANDLING
// =============================================
export async function loadSection(sectionId) {
    if (sectionLoadInProgress) {
        uiRenderQueue.push(sectionId);
        return;
    }
    
    sectionLoadInProgress = true;
    lastUIAction = Date.now();
    
    try {
        if (!checkAuthenticationState() && sectionId !== 'profile') {
            sectionLoadInProgress = false;
            return;
        }
        
        currentSection = sectionId;
        unsavedChanges = false;
        
        updateSectionTitle(sectionId);
        updateSaveButton();
        
        const contentContainer = document.getElementById('settingsContent');
        if (!contentContainer) {
            sectionLoadInProgress = false;
            return;
        }
        
        contentContainer.scrollTop = 0;
        
        // Show minimal loading
        contentContainer.innerHTML = `
            <div class="settings-section" style="text-align: center; padding: 30px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color);"></i>
            </div>
        `;
        
        // Small delay to show loading
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Load the actual section
        const loadFunctions = {
            'profile': loadProfileSection,
            'security': loadSecuritySection,
            'privacy': loadPrivacySection,
            'chat': loadChatSection,
            'friends': loadFriendsSection,
            'groups': loadGroupsSection,
            'calls': loadCallsSection,
            'status': loadStatusSection,
            'notifications': loadNotificationsSection,
            'appearance': loadAppearanceSection,
            'storage': loadStorageSection,
            'mood': loadMoodSection,
            'advanced': loadAdvancedSection,
            'backup': loadBackupSection,
            'danger': loadDangerSection
        };
        
        const loadFn = loadFunctions[sectionId];
        if (loadFn) {
            await UIErrorBoundary.wrap(loadFn, `loadSection_${sectionId}`)(contentContainer);
        } else {
            contentContainer.innerHTML = '<p>Section not found</p>';
        }
        
        // Process queued section loads
        if (uiRenderQueue.length > 0) {
            const nextSection = uiRenderQueue.shift();
            if (nextSection !== sectionId) {
                setTimeout(() => loadSection(nextSection), 100);
            }
        }
        
    } catch (error) {
        debugLog(`[SettingsUI] Error loading section ${sectionId}:`, error);
        
        const contentContainer = document.getElementById('settingsContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="settings-section">
                    <div class="section-header">
                        <h3><i class="fas fa-exclamation-triangle section-icon" style="color: var(--danger-color);"></i> Error</h3>
                    </div>
                    <div class="section-body">
                        <p style="color: var(--danger-color);">${escapeHtml(error.message)}</p>
                    </div>
                </div>
            `;
        }
        
    } finally {
        sectionLoadInProgress = false;
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
        profile: 'Manage your personal information',
        security: 'Secure your account',
        privacy: 'Control who can see your information',
        chat: 'Customize your chat experience',
        friends: 'Manage friend connections',
        groups: 'Group participation preferences',
        calls: 'Calling preferences',
        status: 'Status updates',
        notifications: 'Notification preferences',
        appearance: 'Customize the look and feel',
        storage: 'Monitor storage usage',
        mood: 'Mood-based features',
        advanced: 'Advanced configuration',
        backup: 'Backup and restore',
        danger: 'Irreversible actions'
    };
    
    return descriptions[sectionId] || 'Configure settings';
}

// Update save button state
export function updateSaveButton() {
    const saveBtn = document.getElementById('saveSectionBtn');
    if (!saveBtn) return;
    
    const hasAuth = checkAuthenticationState();
    
    if (!hasAuth && currentSection !== 'profile') {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-lock"></i> Sign In Required';
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
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
        saveBtn.classList.remove('primary');
        saveBtn.classList.add('secondary');
    }
}

// =============================================
// SETUP EVENT LISTENERS - ENHANCED
// =============================================
export function setupEventListeners() {
    // Back to app button
    const backToAppBtn = document.getElementById('backToAppBtn');
    if (backToAppBtn) {
        backToAppBtn.addEventListener('click', () => {
            if (unsavedChanges) {
                if (confirm('You have unsaved changes. Leave anyway?')) {
                    sendMessageToParent({
                        type: PARENT_MESSAGE_TYPES.CHILD_CLOSING,
                        childId: 'settings',
                        unsavedChanges: true,
                        timestamp: Date.now()
                    }).catch(() => {});
                }
            } else {
                sendMessageToParent({
                    type: PARENT_MESSAGE_TYPES.CHILD_CLOSING,
                    childId: 'settings',
                    timestamp: Date.now()
                }).catch(() => {});
            }
        });
    }
    
    // Save button
    const saveSectionBtn = document.getElementById('saveSectionBtn');
    if (saveSectionBtn) {
        saveSectionBtn.addEventListener('click', async () => {
            if (!checkAuthenticationState()) {
                return;
            }
            
            try {
                saveSectionBtn.disabled = true;
                saveSectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                
                await saveSettings();
                
            } catch (error) {
                debugLog('Error saving settings:', error);
            } finally {
                saveSectionBtn.disabled = false;
                updateSaveButton();
            }
        });
    }
    
    // Reset button
    const resetSectionBtn = document.getElementById('resetSectionBtn');
    if (resetSectionBtn) {
        resetSectionBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                return;
            }
            
            if (confirm('Reset all settings in this section to default?')) {
                resetCurrentSection();
            }
        });
    }
    
    // Search input
    const settingsSearch = document.getElementById('settingsSearch');
    if (settingsSearch) {
        settingsSearch.addEventListener('input', function(e) {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            
            searchDebounceTimer = setTimeout(() => {
                if (!checkAuthenticationState()) {
                    return;
                }
                searchSettings(e.target.value);
            }, 300);
        });
        
        settingsSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                settingsSearch.value = '';
                if (currentSection) {
                    loadSection(currentSection);
                }
            }
        });
    }
    
    // Modal listeners
    setupModalListeners();
    setupPhotoModalListeners();
    setupPasswordModalListeners();
    
    // Session management
    const terminateAllSessionsBtn = document.getElementById('terminateAllSessionsBtn');
    if (terminateAllSessionsBtn) {
        terminateAllSessionsBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) {
                return;
            }
            
            if (confirm('Terminate all other sessions?')) {
                terminateAllSessions().catch(() => {});
            }
        });
    }
    
    // Before unload
    window.addEventListener('beforeunload', (e) => {
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes.';
        }
    });
    
    // Handle online/offline silently
    window.addEventListener('online', () => {
        if (currentSection) {
            loadSection(currentSection);
        }
    });
    
    window.addEventListener('offline', () => {
        document.body.classList.add('offline');
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
                closeModal(btn.modal);
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
                closeModal(btn.modal);
            });
        }
    });
    
    // Close on overlay click
    const modals = ['changePhotoModal', 'changePasswordModal', 'sessionsModal', 'blockedUsersModal', 'confirmationModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modalId);
                }
            });
        }
    });
}

// Close modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        activeModals.delete(modalId);
        document.body.style.overflow = '';
    }
}

// Open modal
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        activeModals.add(modalId);
        document.body.style.overflow = 'hidden';
    }
}

// Setup photo modal listeners
export function setupPhotoModalListeners() {
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    if (takePhotoBtn) {
        takePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) return;
            takePhoto();
        });
    }
    
    const choosePhotoBtn = document.getElementById('choosePhotoBtn');
    if (choosePhotoBtn) {
        choosePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) return;
            choosePhoto();
        });
    }
    
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) return;
            removePhoto();
        });
    }
    
    const savePhotoBtn = document.getElementById('savePhotoBtn');
    if (savePhotoBtn) {
        savePhotoBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) return;
            savePhoto();
        });
    }
}

// Setup password modal listeners
export function setupPasswordModalListeners() {
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    if (savePasswordBtn) {
        savePasswordBtn.addEventListener('click', () => {
            if (!checkAuthenticationState()) return;
            changePassword();
        });
    }
}

// =============================================
// COLOR PICKER - ENHANCED
// =============================================
export function initializeColorPicker() {
    const container = document.getElementById('colorPickerContainer');
    if (!container) return;
    
    if (typeof Pickr === 'undefined') {
        setupFallbackColorPicker();
        return;
    }
    
    try {
        colorPicker = Pickr.create({
            el: container,
            theme: 'nano',
            default: userSettings?.appearance?.accentColor || '#0084ff',
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
                if (userSettings?.appearance) {
                    userSettings.appearance.accentColor = hexColor;
                    unsavedChanges = true;
                    updateSaveButton();
                    updateAccentColor(hexColor);
                    
                    sendMessageToParent({
                        type: 'THEME_CHANGED',
                        accentColor: hexColor,
                        timestamp: Date.now()
                    }).catch(() => {});
                }
            }
            colorPicker.hide();
        });
        
        colorPicker.on('hide', () => {
            colorPicker.hide();
        });
        
    } catch (error) {
        debugLog('Error initializing color picker:', error);
        setupFallbackColorPicker();
    }
}

// Fallback color picker
function setupFallbackColorPicker() {
    const container = document.getElementById('colorPickerContainer');
    if (!container) return;
    
    container.innerHTML = `
        <input type="color" id="fallbackColorPicker" value="${userSettings?.appearance?.accentColor || '#0084ff'}">
    `;
    
    const picker = document.getElementById('fallbackColorPicker');
    if (picker) {
        picker.addEventListener('input', (e) => {
            if (userSettings?.appearance) {
                userSettings.appearance.accentColor = e.target.value;
                unsavedChanges = true;
                updateSaveButton();
                updateAccentColor(e.target.value);
            }
        });
    }
}

// Update accent color in UI
export function updateAccentColor(color) {
    document.documentElement.style.setProperty('--primary-color', color);
    
    const darkerColor = shadeColor(color, -20);
    document.documentElement.style.setProperty('--primary-dark', darkerColor);
    
    // Update meta theme color
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.name = 'theme-color';
        document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.content = color;
}

// Apply theme
export function applyTheme(theme) {
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
        document.documentElement.style.colorScheme = 'dark';
    } else {
        document.body.classList.remove('dark-theme');
        document.documentElement.style.colorScheme = 'light';
    }
    
    if (userSettings?.appearance) {
        userSettings.appearance.theme = theme;
        unsavedChanges = true;
    }
}

// Apply font size
export function applyFontSize(size) {
    document.documentElement.style.fontSize = `${size}px`;
    document.documentElement.style.setProperty('--base-font-size', `${size}px`);
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

// =============================================
// SEARCH SETTINGS - ENHANCED
// =============================================
export function searchSettings(query) {
    const normalizedQuery = query.toLowerCase().trim();
    
    const contentContainer = document.getElementById('settingsContent');
    if (!contentContainer) return;
    
    if (!normalizedQuery) {
        loadSection(currentSection);
        return;
    }
    
    if (!userSettings) {
        contentContainer.innerHTML = '<p>Settings not loaded</p>';
        return;
    }
    
    const results = [];
    
    Object.keys(userSettings).forEach(section => {
        const sectionSettings = userSettings[section];
        if (!sectionSettings || typeof sectionSettings !== 'object') return;
        
        Object.keys(sectionSettings).forEach(key => {
            const value = sectionSettings[key];
            const keyStr = key.toLowerCase().replace(/([A-Z])/g, ' $1').trim();
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
        html += `<h3><i class="fas fa-search section-icon"></i> Search Results</h3>`;
        html += `<div class="section-description">Found ${results.length} matching settings</div>`;
        html += '</div>';
        html += '<div class="section-body">';
        
        results.forEach(result => {
            html += `<div class="setting-item" data-section="${result.section}" data-key="${result.key}">`;
            html += `<div class="setting-info">`;
            html += `<div class="setting-label">${result.key.replace(/([A-Z])/g, ' $1').trim()}</div>`;
            html += `<div class="setting-description">Section: ${escapeHtml(result.sectionName)}</div>`;
            html += `</div>`;
            html += `<div class="setting-control">`;
            
            if (typeof result.value === 'boolean') {
                html += `<span class="setting-value">${result.value ? 'On' : 'Off'}</span>`;
            } else if (result.value === null || result.value === undefined) {
                html += `<span class="setting-value">Not set</span>`;
            } else {
                html += `<span class="setting-value">${escapeHtml(String(result.value))}</span>`;
            }
            
            html += `</div>`;
            html += `</div>`;
        });
        
        html += '</div></div>';
        contentContainer.innerHTML = html;
        
        document.querySelectorAll('.setting-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                if (section) {
                    loadSection(section);
                }
            });
            item.style.cursor = 'pointer';
        });
        
    } else {
        contentContainer.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-search section-icon"></i> Search Results</h3>
                    <div class="section-description">
                        No settings found
                    </div>
                </div>
            </div>
        `;
    }
}

// =============================================
// NOTIFICATION SYSTEM - SILENT (MINIMAL)
// =============================================
export function showNotification(message, type = 'success', duration = 3000) {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (!notification || !notificationText) {
        return;
    }
    
    // Clear any existing timeout
    if (notification._timeout) {
        clearTimeout(notification._timeout);
    }
    
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('active');
    
    notification._timeout = setTimeout(() => {
        notification.classList.remove('active');
    }, duration);
}

// Show confirmation dialog
export function showConfirmation(title, message, confirmCallback, cancelCallback = null) {
    const confirmationTitle = document.getElementById('confirmationTitle');
    const confirmationMessage = document.getElementById('confirmationMessage');
    const modal = document.getElementById('confirmationModal');
    
    if (!confirmationTitle || !confirmationMessage || !modal) return;
    
    confirmationTitle.textContent = title;
    confirmationMessage.textContent = message;
    
    openModal('confirmationModal');
    
    const confirmBtn = document.getElementById('confirmActionBtn');
    if (confirmBtn) {
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', () => {
            closeModal('confirmationModal');
            if (confirmCallback) confirmCallback();
        });
    }
    
    const cancelBtn = document.getElementById('cancelConfirmationBtn');
    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        newCancelBtn.addEventListener('click', () => {
            closeModal('confirmationModal');
            if (cancelCallback) cancelCallback();
        });
    }
}

// =============================================
// SAVE SETTINGS - ENHANCED
// =============================================
export async function saveSettings() {
    try {
        if (!validateCurrentSection()) {
            return false;
        }
        
        await coreSaveSettings();
        
        unsavedChanges = false;
        updateSaveButton();
        
        await sendMessageToParent({
            type: 'SETTINGS_UPDATED',
            section: currentSection,
            timestamp: Date.now()
        }).catch(() => {});
        
        return true;
        
    } catch (error) {
        debugLog('[SettingsUI] Save error:', error);
        throw error;
    }
}

// Validate current section
function validateCurrentSection() {
    if (!userSettings || !currentSection) return true;
    
    const section = userSettings[currentSection];
    if (!section) return true;
    
    switch(currentSection) {
        case 'profile':
            if (section.displayName && section.displayName.length > 50) {
                return false;
            }
            if (section.bio && section.bio.length > 150) {
                return false;
            }
            if (section.username && !/^@?[a-zA-Z0-9_]+$/.test(section.username)) {
                return false;
            }
            break;
    }
    
    return true;
}

// Reset current section
export function resetCurrentSection() {
    if (currentSection && DEFAULT_SETTINGS[currentSection]) {
        userSettings[currentSection] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[currentSection]));
        unsavedChanges = true;
        updateSaveButton();
        loadSection(currentSection);
    }
}

// Update user status
export function updateUserStatus() {
    const statusIndicator = document.getElementById('userStatusIndicator');
    const statusText = document.getElementById('userStatusText');
    
    if (!statusIndicator || !statusText) return;
    
    const hasAuth = checkAuthenticationState();
    const governorState = StartupGovernor ? StartupGovernor.getState() : 'unknown';
    
    if (hasAuth) {
        if (governorState === 'ACTIVE') {
            statusIndicator.style.backgroundColor = 'var(--success-color)';
            statusText.textContent = 'Online';
        } else if (governorState === 'DEGRADED') {
            statusIndicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = 'Connected';
        } else {
            statusIndicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = 'Connecting...';
        }
    } else if (parentSessionReceived || tokenReady) {
        statusIndicator.style.backgroundColor = 'var(--success-color)';
        statusText.textContent = 'Online';
    } else {
        statusIndicator.style.backgroundColor = 'var(--warning-color)';
        statusText.textContent = handshakeState === 'pending' ? 'Connecting...' : 'Offline';
    }
}

// Format time
export function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// Escape HTML
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// PHOTO FUNCTIONS - ENHANCED
// =============================================
export function takePhoto() {
    debugLog('Photo capture requested');
    
    setTimeout(() => {
        pendingPhotoData = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
        updatePhotoPreview(pendingPhotoData);
    }, 500);
}

export function choosePhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                pendingPhotoData = event.target.result;
                updatePhotoPreview(pendingPhotoData);
            };
            reader.readAsDataURL(file);
        }
    };
    
    input.click();
}

function updatePhotoPreview(dataUrl) {
    const preview = document.getElementById('photoPreview');
    if (preview) {
        preview.style.backgroundImage = `url(${dataUrl})`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
    }
}

export function removePhoto() {
    if (confirm('Remove your profile photo?')) {
        userSettings.profile.photoUrl = '';
        if (currentUser) {
            currentUser.photoURL = '';
        }
        
        const userAvatarPreview = document.getElementById('userAvatarPreview');
        if (userAvatarPreview) {
            userAvatarPreview.style.backgroundImage = '';
            const initials = currentUser?.displayName ? 
                currentUser.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
                'U';
            userAvatarPreview.innerHTML = `<span style="color: white; font-size: 18px;">${initials}</span>`;
        }
        
        unsavedChanges = true;
        updateSaveButton();
        
        closeModal('changePhotoModal');
    }
}

export function savePhoto() {
    if (pendingPhotoData) {
        userSettings.profile.photoUrl = pendingPhotoData;
        if (currentUser) {
            currentUser.photoURL = pendingPhotoData;
        }
        
        const userAvatarPreview = document.getElementById('userAvatarPreview');
        if (userAvatarPreview) {
            userAvatarPreview.style.backgroundImage = `url(${pendingPhotoData})`;
            userAvatarPreview.style.backgroundSize = 'cover';
            userAvatarPreview.style.backgroundPosition = 'center';
            userAvatarPreview.innerHTML = '';
        }
        
        unsavedChanges = true;
        updateSaveButton();
        pendingPhotoData = null;
        
        closeModal('changePhotoModal');
    }
}

// =============================================
// CHANGE PASSWORD - ENHANCED
// =============================================
export async function changePassword() {
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    const passwordError = document.getElementById('passwordError');
    
    if (!currentPassword || !newPassword || !confirmPassword || !passwordError) return;
    
    passwordError.style.display = 'none';
    passwordError.textContent = '';
    
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        passwordError.textContent = 'All fields required';
        passwordError.style.display = 'block';
        return;
    }
    
    if (newPassword.value !== confirmPassword.value) {
        passwordError.textContent = 'Passwords do not match';
        passwordError.style.display = 'block';
        return;
    }
    
    try {
        setPasswordInputsDisabled(true);
        
        await makeSafeRequest('/api/auth/change-password', 'POST', {
            currentPassword: currentPassword.value,
            newPassword: newPassword.value
        });
        
        closeModal('changePasswordModal');
        
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
        
    } catch (error) {
        passwordError.textContent = error.message || 'Error changing password';
        passwordError.style.display = 'block';
    } finally {
        setPasswordInputsDisabled(false);
    }
}

function setPasswordInputsDisabled(disabled) {
    const inputs = ['currentPassword', 'newPassword', 'confirmPassword'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.disabled = disabled;
    });
    
    const saveBtn = document.getElementById('savePasswordBtn');
    if (saveBtn) {
        saveBtn.disabled = disabled;
        saveBtn.innerHTML = disabled ? '<i class="fas fa-spinner fa-spin"></i> Changing...' : 'Change Password';
    }
}

// =============================================
// EDIT MOOD COLOR - ENHANCED
// =============================================
export function editMoodColor(mood) {
    if (!colorPicker) {
        editMoodColorFallback(mood);
        return;
    }
    
    const currentColor = userSettings.mood.moodColors[mood];
    colorPicker.setColor(currentColor);
    colorPicker.show();
    
    const originalSaveHandler = colorPicker._eventHandler?.save;
    colorPicker.on('save', (color) => {
        if (color) {
            const hexColor = color.toHEXA().toString();
            userSettings.mood.moodColors[mood] = hexColor;
            unsavedChanges = true;
            updateSaveButton();
            loadSection('mood');
        }
        colorPicker.hide();
        if (originalSaveHandler) {
            colorPicker.on('save', originalSaveHandler);
        }
    });
}

function editMoodColorFallback(mood) {
    const currentColor = userSettings.mood.moodColors[mood];
    
    const input = document.createElement('input');
    input.type = 'color';
    input.value = currentColor;
    
    input.addEventListener('change', (e) => {
        userSettings.mood.moodColors[mood] = e.target.value;
        unsavedChanges = true;
        updateSaveButton();
        loadSection('mood');
    });
    
    input.click();
}

// =============================================
// PROFILE SECTION - ENHANCED
// =============================================
export function loadProfileSection(container) {
    const hasAuth = checkAuthenticationState();
    const settings = userSettings?.profile || DEFAULT_SETTINGS.profile;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user section-icon"></i> Profile Information</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Profile Photo</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changePhotoBtn" ${!hasAuth ? 'disabled' : ''}>
                            <i class="fas fa-camera"></i> Change
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Display Name</div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="displayNameInput" 
                               value="${escapeHtml(settings.displayName || currentUser?.displayName || '')}" 
                               placeholder="Your name"
                               ${!hasAuth ? 'disabled' : ''}>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Username</div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="usernameInput" 
                               value="${escapeHtml(settings.username || currentUser?.username || '')}" 
                               placeholder="@username"
                               ${!hasAuth ? 'disabled' : ''}>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Bio</div>
                    </div>
                    <div class="setting-control">
                        <textarea class="setting-textarea" id="bioInput" 
                                  placeholder="About you..." 
                                  ${!hasAuth ? 'disabled' : ''}>${escapeHtml(settings.bio || '')}</textarea>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Email</div>
                    </div>
                    <div class="setting-control">
                        <input type="email" class="setting-input" id="emailInput" 
                               value="${escapeHtml(settings.email || currentUser?.email || '')}" 
                               placeholder="email@example.com"
                               ${!hasAuth ? 'disabled' : ''}>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-eye section-icon"></i> Profile Visibility</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Profile Visibility</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="profileVisibilitySelect" ${!hasAuth ? 'disabled' : ''}>
                            <option value="everyone" ${settings.profileVisibility === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.profileVisibility === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.profileVisibility === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Last Seen</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="lastSeenToggle" ${settings.lastSeen ? 'checked' : ''} ${!hasAuth ? 'disabled' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupProfileEventListeners();
}

function setupProfileEventListeners() {
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    if (changePhotoBtn && !changePhotoBtn.disabled) {
        changePhotoBtn.addEventListener('click', () => {
            openModal('changePhotoModal');
        });
    }
    
    const inputs = ['displayNameInput', 'usernameInput', 'bioInput', 'emailInput'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element && !element.disabled) {
            element.addEventListener('input', () => {
                const property = id.replace('Input', '');
                if (property === 'displayName') {
                    userSettings.profile.displayName = element.value;
                } else if (property === 'username') {
                    userSettings.profile.username = element.value;
                } else if (property === 'bio') {
                    userSettings.profile.bio = element.value;
                } else if (property === 'email') {
                    userSettings.profile.email = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const selects = ['profileVisibilitySelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element && !element.disabled) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (property === 'profileVisibility') {
                    userSettings.profile.profileVisibility = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['lastSeenToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element && !element.disabled) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'lastSeen') {
                    userSettings.profile.lastSeen = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// SECURITY SECTION - ENHANCED
// =============================================
export function loadSecuritySection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('security', 'Security');
        return;
    }
    
    const settings = userSettings.security || DEFAULT_SETTINGS.security;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-shield-alt section-icon"></i> Account Security</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Two-Factor Authentication</div>
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
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changePasswordBtn">
                            <i class="fas fa-key"></i> Change
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Login Notifications</div>
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
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="viewSessionsBtn">
                            <i class="fas fa-desktop"></i> View
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-clock section-icon"></i> Session Management</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Session Timeout</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="sessionTimeoutSelect">
                            <option value="15min" ${settings.sessionTimeout === '15min' ? 'selected' : ''}>15 Minutes</option>
                            <option value="30min" ${settings.sessionTimeout === '30min' ? 'selected' : ''}>30 Minutes</option>
                            <option value="1hr" ${settings.sessionTimeout === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="8hr" ${settings.sessionTimeout === '8hr' ? 'selected' : ''}>8 Hours</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupSecurityEventListeners();
}

function setupSecurityEventListeners() {
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            openModal('changePasswordModal');
        });
    }
    
    const viewSessionsBtn = document.getElementById('viewSessionsBtn');
    if (viewSessionsBtn) {
        viewSessionsBtn.addEventListener('click', () => {
            showActiveSessions();
        });
    }
    
    const toggles = ['twoFactorAuthToggle', 'loginNotificationsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'twoFactorAuth') {
                    userSettings.security.twoFactorAuth = element.checked;
                } else if (property === 'loginNotifications') {
                    userSettings.security.loginNotifications = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const selects = ['sessionTimeoutSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (property === 'sessionTimeout') {
                    userSettings.security.sessionTimeout = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// PRIVACY SECTION - ENHANCED
// =============================================
export function loadPrivacySection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('privacy', 'Privacy');
        return;
    }
    
    const settings = userSettings.privacy || DEFAULT_SETTINGS.privacy;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-plus section-icon"></i> Connection Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Add Me</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="whoCanAddMeSelect">
                            <option value="everyone" ${settings.whoCanAddMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.whoCanAddMe === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.whoCanAddMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Contact Discovery</div>
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
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Message Me</div>
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
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="typingIndicatorsToggle" ${settings.typingIndicators ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-ban section-icon"></i> Blocked Users</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Blocked Users</div>
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
    
    setupPrivacyEventListeners();
}

function setupPrivacyEventListeners() {
    const manageBlockedBtn = document.getElementById('manageBlockedBtn');
    if (manageBlockedBtn) {
        manageBlockedBtn.addEventListener('click', () => {
            showBlockedUsers();
        });
    }
    
    const selects = ['whoCanAddMeSelect', 'canMessageMeSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (property === 'whoCanAddMe') {
                    userSettings.privacy.whoCanAddMe = element.value;
                } else if (property === 'canMessageMe') {
                    userSettings.privacy.canMessageMe = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['contactDiscoveryToggle', 'readReceiptsToggle', 'typingIndicatorsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'contactDiscovery') {
                    userSettings.privacy.contactDiscovery = element.checked;
                } else if (property === 'readReceipts') {
                    userSettings.privacy.readReceipts = element.checked;
                } else if (property === 'typingIndicators') {
                    userSettings.privacy.typingIndicators = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// CHAT SECTION - ENHANCED
// =============================================
export function loadChatSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('chat', 'Chat');
        return;
    }
    
    const settings = userSettings.chat || DEFAULT_SETTINGS.chat;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-comments section-icon"></i> Chat Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enter Key Sends</div>
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
                        <div class="setting-label">Message History</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="messageHistorySelect">
                            <option value="forever" ${settings.messageHistory === 'forever' ? 'selected' : ''}>Forever</option>
                            <option value="30days" ${settings.messageHistory === '30days' ? 'selected' : ''}>30 Days</option>
                            <option value="7days" ${settings.messageHistory === '7days' ? 'selected' : ''}>7 Days</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupChatEventListeners();
}

function setupChatEventListeners() {
    const selects = ['mediaAutoDownloadSelect', 'messageHistorySelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (property === 'mediaAutoDownload') {
                    userSettings.chat.mediaAutoDownload = element.value;
                } else if (property === 'messageHistory') {
                    userSettings.chat.messageHistory = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['enterKeySendsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'enterKeySends') {
                    userSettings.chat.enterKeySends = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// FRIENDS SECTION - ENHANCED
// =============================================
export function loadFriendsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('friends', 'Friends');
        return;
    }
    
    const settings = userSettings.friends || DEFAULT_SETTINGS.friends;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-plus section-icon"></i> Friend Discovery</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Discover by Phone</div>
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
                        <div class="setting-label">Friend Suggestions</div>
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
    `;
    
    setupFriendsEventListeners();
}

function setupFriendsEventListeners() {
    const toggles = ['discoverByPhoneToggle', 'discoverByEmailToggle', 'friendSuggestionsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'discoverByPhone') {
                    userSettings.friends.discoverByPhone = element.checked;
                } else if (property === 'discoverByEmail') {
                    userSettings.friends.discoverByEmail = element.checked;
                } else if (property === 'friendSuggestions') {
                    userSettings.friends.friendSuggestions = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// GROUPS SECTION - ENHANCED
// =============================================
export function loadGroupsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('groups', 'Groups');
        return;
    }
    
    const settings = userSettings.groups || DEFAULT_SETTINGS.groups;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-users section-icon"></i> Group Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Invitations</div>
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
                        <div class="setting-label">Group Announcements</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupAnnouncementsToggle" ${settings.groupAnnouncements ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupGroupsEventListeners();
}

function setupGroupsEventListeners() {
    const selects = ['groupInvitationsSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (property === 'groupInvitations') {
                    userSettings.groups.groupInvitations = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['groupAnnouncementsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'groupAnnouncements') {
                    userSettings.groups.groupAnnouncements = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// CALLS SECTION - ENHANCED
// =============================================
export function loadCallsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('calls', 'Calls');
        return;
    }
    
    const settings = userSettings.calls || DEFAULT_SETTINGS.calls;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-phone section-icon"></i> Call Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Call Me</div>
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
                        <div class="setting-label">Call Vibration</div>
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
                        <div class="setting-label">Video Quality</div>
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
            </div>
        </div>
    `;
    
    setupCallsEventListeners();
}

function setupCallsEventListeners() {
    const selects = ['callsWhoCanCallMeSelect', 'videoQualitySelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                if (id === 'callsWhoCanCallMeSelect') {
                    userSettings.calls.whoCanCallMe = element.value;
                } else if (id === 'videoQualitySelect') {
                    userSettings.calls.videoQuality = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const toggles = ['callVibrationToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'callVibration') {
                    userSettings.calls.callVibration = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// STATUS SECTION - ENHANCED
// =============================================
export function loadStatusSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('status', 'Status');
        return;
    }
    
    const settings = userSettings.status || DEFAULT_SETTINGS.status;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-circle section-icon"></i> Status Privacy</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can View My Status</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="whoCanViewMyStatusSelect">
                            <option value="everyone" ${settings.whoCanViewMyStatus === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.whoCanViewMyStatus === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.whoCanViewMyStatus === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Expire Status</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="autoExpireStatusSelect">
                            <option value="24h" ${settings.autoExpireStatus === '24h' ? 'selected' : ''}>24 Hours</option>
                            <option value="12h" ${settings.autoExpireStatus === '12h' ? 'selected' : ''}>12 Hours</option>
                            <option value="6h" ${settings.autoExpireStatus === '6h' ? 'selected' : ''}>6 Hours</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupStatusEventListeners();
}

function setupStatusEventListeners() {
    const selects = ['whoCanViewMyStatusSelect', 'autoExpireStatusSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (property === 'whoCanViewMyStatus') {
                    userSettings.status.whoCanViewMyStatus = element.value;
                } else if (property === 'autoExpireStatus') {
                    userSettings.status.autoExpireStatus = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// NOTIFICATIONS SECTION - ENHANCED
// =============================================
export function loadNotificationsSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('notifications', 'Notifications');
        return;
    }
    
    const settings = userSettings.notifications || DEFAULT_SETTINGS.notifications;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bell section-icon"></i> Notification Types</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Notifications</div>
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
                        <div class="setting-label">Call Notifications</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callNotificationsToggle" ${settings.callNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupNotificationsEventListeners();
}

function setupNotificationsEventListeners() {
    const toggles = ['messageNotificationsToggle', 'groupNotificationsToggle', 'callNotificationsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'messageNotifications') {
                    userSettings.notifications.messageNotifications = element.checked;
                } else if (property === 'groupNotifications') {
                    userSettings.notifications.groupNotifications = element.checked;
                } else if (property === 'callNotifications') {
                    userSettings.notifications.callNotifications = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// =============================================
// APPEARANCE SECTION - ENHANCED
// =============================================
export function loadAppearanceSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('appearance', 'Appearance');
        return;
    }
    
    const settings = userSettings.appearance || DEFAULT_SETTINGS.appearance;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-palette section-icon"></i> Theme & Colors</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Theme</div>
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
                    </div>
                    <div class="setting-control">
                        <div class="color-picker" id="accentColorPicker" 
                             style="background-color: ${settings.accentColor};"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Font Size</div>
                    </div>
                    <div class="setting-control">
                        <input type="range" class="setting-slider" id="fontSizeSlider" 
                               min="12" max="20" value="${settings.fontSize}" step="1">
                        <span id="fontSizeValue" style="margin-left: 10px;">${settings.fontSize}px</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-globe section-icon"></i> Language</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Language</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="languageSelect">
                            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                            <option value="es" ${settings.language === 'es' ? 'selected' : ''}>Español</option>
                            <option value="fr" ${settings.language === 'fr' ? 'selected' : ''}>Français</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupAppearanceEventListeners();
}

function setupAppearanceEventListeners() {
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.addEventListener('change', function() {
            userSettings.appearance.theme = this.value;
            unsavedChanges = true;
            updateSaveButton();
            applyTheme(this.value);
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
    const fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeSlider && fontSizeValue) {
        fontSizeSlider.addEventListener('input', function() {
            userSettings.appearance.fontSize = parseInt(this.value);
            fontSizeValue.textContent = this.value + 'px';
            unsavedChanges = true;
            updateSaveButton();
            applyFontSize(this.value);
        });
    }
    
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            userSettings.appearance.language = this.value;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
}

// =============================================
// STORAGE SECTION - ENHANCED
// =============================================
export function loadStorageSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('storage', 'Storage');
        return;
    }
    
    const settings = userSettings.storage || DEFAULT_SETTINGS.storage;
    const totalUsed = settings.totalStorageUsed || 0;
    const totalAvailable = settings.storageTotal || 1024 * 1024 * 1024;
    const percentUsed = Math.min((totalUsed / totalAvailable) * 100, 100);
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-database section-icon"></i> Storage Overview</h3>
            </div>
            <div class="section-body">
                <div class="storage-info">
                    <div class="storage-header">
                        <span class="storage-label">Total Used</span>
                        <span class="storage-value">${formatStorageSize(totalUsed)}</span>
                    </div>
                    <div class="storage-bar">
                        <div class="storage-fill" style="width: ${percentUsed}%;"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Storage</div>
                    </div>
                    <div class="setting-control">
                        <span>${formatStorageSize(settings.storageBreakdown?.chats || 0)}</span>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Media Storage</div>
                    </div>
                    <div class="setting-control">
                        <span>${formatStorageSize(settings.storageBreakdown?.media || 0)}</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-broom section-icon"></i> Cache Management</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear Chat Cache</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearChatCacheBtn">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear Media Cache</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearMediaCacheBtn">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupStorageEventListeners();
}

function setupStorageEventListeners() {
    const clearChatCacheBtn = document.getElementById('clearChatCacheBtn');
    if (clearChatCacheBtn) {
        clearChatCacheBtn.addEventListener('click', () => {
            if (confirm('Clear all chat cache?')) {
                clearChatCache().catch(() => {});
            }
        });
    }
    
    const clearMediaCacheBtn = document.getElementById('clearMediaCacheBtn');
    if (clearMediaCacheBtn) {
        clearMediaCacheBtn.addEventListener('click', () => {
            if (confirm('Clear all media cache?')) {
                clearMediaCache().catch(() => {});
            }
        });
    }
}

// =============================================
// MOOD SETTINGS SECTION - ENHANCED
// =============================================
export function loadMoodSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('mood', 'Mood');
        return;
    }
    
    const settings = userSettings.mood || DEFAULT_SETTINGS.mood;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-smile section-icon"></i> Mood Detection</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Mood Detection</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoMoodDetectionToggle" ${settings.autoMoodDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-palette section-icon"></i> Mood Colors</h3>
            </div>
            <div class="section-body">
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
                </div>
            </div>
        </div>
    `;
    
    setupMoodEventListeners();
}

function setupMoodEventListeners() {
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
        });
        
        let pressTimer;
        item.addEventListener('mousedown', function() {
            pressTimer = setTimeout(() => {
                const mood = this.dataset.mood;
                editMoodColor(mood);
            }, 1000);
        });
        
        item.addEventListener('mouseup', () => clearTimeout(pressTimer));
        item.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    });
    
    const autoMoodDetectionToggle = document.getElementById('autoMoodDetectionToggle');
    if (autoMoodDetectionToggle) {
        autoMoodDetectionToggle.addEventListener('change', function() {
            userSettings.mood.autoMoodDetection = this.checked;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
}

// =============================================
// ADVANCED SECTION - ENHANCED
// =============================================
export function loadAdvancedSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('advanced', 'Advanced');
        return;
    }
    
    const settings = userSettings.advanced || DEFAULT_SETTINGS.advanced;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cogs section-icon"></i> Advanced Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Offline Mode</div>
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
                        <div class="setting-label">Debug Mode</div>
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
                        <div class="setting-label">Clear Local Data</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearLocalDataBtn">
                            <i class="fas fa-broom"></i> Clear
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupAdvancedEventListeners();
}

function setupAdvancedEventListeners() {
    const toggles = ['offlineModeToggle', 'debugModeToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                if (property === 'offlineMode') {
                    userSettings.advanced.offlineMode = element.checked;
                } else if (property === 'debugMode') {
                    userSettings.advanced.debugMode = element.checked;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    const clearLocalDataBtn = document.getElementById('clearLocalDataBtn');
    if (clearLocalDataBtn) {
        clearLocalDataBtn.addEventListener('click', () => {
            if (confirm('Clear all locally stored data? This will reset settings.')) {
                SafeStorage.clear();
                showNotification('Local data cleared', 'success');
                setTimeout(() => window.location.reload(), 1000);
            }
        });
    }
}

// =============================================
// BACKUP SECTION - ENHANCED
// =============================================
export function loadBackupSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('backup', 'Backup');
        return;
    }
    
    const settings = userSettings.backup || DEFAULT_SETTINGS.backup;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cloud-upload-alt section-icon"></i> Backup Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Backup</div>
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
                        <div class="setting-label">Backup Now</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="backupNowBtn">
                            <i class="fas fa-cloud-upload-alt"></i> Backup
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupBackupEventListeners();
}

function setupBackupEventListeners() {
    const backupNowBtn = document.getElementById('backupNowBtn');
    if (backupNowBtn) {
        backupNowBtn.addEventListener('click', () => {
            backupNowBtn.disabled = true;
            backupNowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Backing up...';
            
            setTimeout(() => {
                userSettings.backup.lastBackup = new Date().toISOString();
                unsavedChanges = true;
                updateSaveButton();
                backupNowBtn.disabled = false;
                backupNowBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Backup';
            }, 1000);
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
}

// =============================================
// DANGER ZONE SECTION - ENHANCED
// =============================================
export function loadDangerSection(container) {
    if (!checkAuthenticationState()) {
        container.innerHTML = getAuthRequiredHTML('danger', 'Danger Zone');
        return;
    }
    
    container.innerHTML = `
        <div class="settings-section danger-zone">
            <div class="section-header">
                <h3><i class="fas fa-exclamation-triangle section-icon"></i> Danger Zone</h3>
                <div class="section-description">Irreversible actions</div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Export Data</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="exportDataBtn">
                            <i class="fas fa-download"></i> Export
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Delete Account</div>
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
    
    setupDangerEventListeners();
}

function setupDangerEventListeners() {
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            const exportData = {
                user: currentUser,
                settings: userSettings,
                timestamp: new Date().toISOString()
            };
            
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            const exportFileDefaultName = `settings-${new Date().toISOString().slice(0,10)}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        });
    }
    
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            if (confirm('Are you absolutely sure? This cannot be undone.')) {
                if (confirm('Type DELETE to confirm')) {
                    sendMessageToParent({
                        type: PARENT_MESSAGE_TYPES.LOGOUT,
                        childId: 'settings',
                        timestamp: Date.now()
                    }).catch(() => {});
                }
            }
        });
    }
}

// =============================================
// SHOW ACTIVE SESSIONS - ENHANCED
// =============================================
export function showActiveSessions() {
    const sessionsList = document.getElementById('sessionsList');
    const sessionsModal = document.getElementById('sessionsModal');
    
    if (!sessionsList || !sessionsModal) return;
    
    sessionsList.innerHTML = '';
    
    // Current session
    sessionsList.innerHTML += `
        <div class="session-item">
            <div class="session-icon"><i class="fas fa-laptop"></i></div>
            <div class="session-info">
                <div class="session-name">Current Session</div>
                <div class="session-details">This device</div>
            </div>
            <div class="session-actions">
                <span style="color: var(--success-color);">Active</span>
            </div>
        </div>
    `;
    
    if (activeSessions && activeSessions.length > 0) {
        activeSessions.forEach(session => {
            sessionsList.innerHTML += `
                <div class="session-item">
                    <div class="session-icon"><i class="fas fa-mobile-alt"></i></div>
                    <div class="session-info">
                        <div class="session-name">${session.deviceName || 'Unknown'}</div>
                    </div>
                    <div class="session-actions">
                        <button class="terminate-btn" data-session-id="${session.id}">Terminate</button>
                    </div>
                </div>
            `;
        });
    }
    
    openModal('sessionsModal');
    
    document.querySelectorAll('.terminate-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const sessionId = this.dataset.sessionId;
            try {
                await terminateSession(sessionId);
                showActiveSessions();
            } catch (error) {
                debugLog('Error terminating session:', error);
            }
        });
    });
}

// =============================================
// SHOW BLOCKED USERS - ENHANCED
// =============================================
export function showBlockedUsers() {
    const blockedUsersList = document.getElementById('blockedUsersList');
    const blockedUsersModal = document.getElementById('blockedUsersModal');
    
    if (!blockedUsersList || !blockedUsersModal) return;
    
    blockedUsersList.innerHTML = '';
    
    if (!blockedUsers || blockedUsers.length === 0) {
        blockedUsersList.innerHTML = '<p style="text-align: center; padding: 20px;">No blocked users</p>';
    } else {
        blockedUsers.forEach(user => {
            blockedUsersList.innerHTML += `
                <div class="blocked-user-item">
                    <div class="blocked-user-icon"><i class="fas fa-user-slash"></i></div>
                    <div class="blocked-user-info">
                        <div class="blocked-user-name">${user.name || 'Unknown'}</div>
                    </div>
                    <div class="blocked-user-actions">
                        <button class="unblock-btn" data-user-id="${user.id}">Unblock</button>
                    </div>
                </div>
            `;
        });
    }
    
    openModal('blockedUsersModal');
    
    document.querySelectorAll('.unblock-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const userId = this.dataset.userId;
            try {
                await unblockUser(userId);
                showBlockedUsers();
            } catch (error) {
                debugLog('Error unblocking user:', error);
            }
        });
    });
}

// Helper for auth required HTML
function getAuthRequiredHTML(section, title) {
    return `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-lock section-icon"></i> ${title}</h3>
                <div class="section-description">Sign in required</div>
            </div>
        </div>
    `;
}

// =============================================
// UI RECOVERY MECHANISM (SILENT)
// =============================================
function attemptUIRecovery() {
    if (uiRecoveryTimer) clearTimeout(uiRecoveryTimer);
    
    uiRecoveryTimer = setTimeout(() => {
        debugLog('[SettingsUI] Attempting UI recovery');
        
        uiErrorCount = 0;
        
        activeModals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) modal.classList.remove('active');
        });
        activeModals.clear();
        document.body.style.overflow = '';
        
        if (currentSection) {
            loadSection(currentSection);
        }
        
    }, 2000);
}

// =============================================
// EXPOSE UI DEBUG INTERFACE
// =============================================
window.__UI_DEBUG__ = {
    getErrors: () => UIErrorBoundary.getErrors(),
    clearErrors: () => UIErrorBoundary.clear(),
    getState: () => ({
        uiInitialized,
        uiReady,
        currentSection,
        unsavedChanges,
        uiErrorCount
    }),
    reloadSection: () => {
        if (currentSection) loadSection(currentSection);
    },
    forceRecovery: attemptUIRecovery
};

// =============================================
// INITIALIZATION - SILENT BACKGROUND
// =============================================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        debugLog('[SettingsUI] DOM loaded, initializing UI');
        
        showLoadingState();
        
        await waitForCore(8000);
        
        await UIErrorBoundary.wrap(initializeUI, 'dom_initialization')();
        
        debugLog('[SettingsUI] UI initialization complete');
        
    } catch (error) {
        debugLog('[SettingsUI] Initialization error:', error);
        showFallbackUI();
    }
});

// =============================================
// END OF FILE - COMPLETE UI IMPLEMENTATION
// =============================================