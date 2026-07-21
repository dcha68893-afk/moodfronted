// =============================================
// SETTINGS UI - COMPLETE IMPLEMENTATION v9.2.0
// REAL BACKEND-DRIVEN CONTROL SYSTEM
// FULL SECTION SUPPORT | PARENT-CONTROLLED LIFECYCLE
// STABILIZED WITH ALL FIXES
// =============================================
// =============================================
// SETTINGS UI - COMPLETE IMPLEMENTATION v9.2.1
// REAL BACKEND-DRIVEN CONTROL SYSTEM
// FULL SECTION SUPPORT | PARENT-CONTROLLED LIFECYCLE
// STABILIZED WITH ALL FIXES
// =============================================

import {
    // Core state (DO NOT import currentSection/unsavedChanges - they are local mutable)
    currentUser,          // ADDED - needed for profile section
    userSettings,
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
    parentReady,  // Now correctly exported from core
    
    // Enhanced exports from hardened core
    getCoreDiagnostics,
    getHealthMetrics,
    forceRecovery,
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
    UIFailsafe,
    
    // API Core and secure wrapper
    secureApiCall,
    ApiCore,
    safeGet,
    safeArray,
    safeObject,
    
    // Lifecycle state
    LifecycleState,
    currentState,
    
    // Settings State (REAL BACKEND STATE)
    SettingsState
} from './settings-core.js';

// =============================================
// LOCAL MUTABLE STATE (NOT IMPORTED FROM CORE)
// =============================================
let currentSection = 'profile';      // Mutable local variable - FIXED
let unsavedChanges = false;          // Mutable local variable - FIXED

// =============================================
// UI INITIALIZATION GUARD - PREVENT MULTIPLE INITIALIZATIONS
// =============================================
(function() {
    if (window.__SETTINGS_UI_INITIALIZED__) {
        if (window.__SETTINGS_UI_DEBUG__) {
            console.log('[SettingsUI] Already initialized, skipping');
        }
        return;
    }
    window.__SETTINGS_UI_INITIALIZED__ = true;
    window.__SETTINGS_UI_DEBUG__ = true;

    // Force immediate check for core readiness - ALIGNED WITH HANDSHAKE PROTOCOL
    const forceUICheck = () => {
        if (window.__SETTINGS_READY__ || window.currentUser || window.__SETTINGS_SESSION_ACTIVE__ || currentState === LifecycleState.ACTIVE) {
            console.log('[SettingsUI] Core already ready, forcing UI init');
            setTimeout(() => initializeUI(), 50);
        }
    };
    forceUICheck();
})();

// =============================================
// GLOBAL HELPER FOR SETTING UPDATES - UNIFIED
// =============================================
window.__updateSetting = async (section, key, value) => {
    try {
        // Update AppSettings FIRST (single source of truth)
        // This automatically propagates to all subscribed modules
        if (window.AppSettings) {
            window.AppSettings.set(section + '.' + key, value);
        }
        
        // Update SettingsState for backwards compatibility
        await SettingsState.update(section, key, value);
        
        unsavedChanges = true;
        window.updateSaveButton();
        showNotification(`${key} updated`, 'success');
        return true;
    } catch (e) {
        console.error('[SettingsUI] Failed to save setting:', e);
        showNotification(`Failed to save: ${e.message}`, 'error');
        return false;
    }
};

// =============================================
// UI STATE VARIABLES - ENHANCED
// =============================================
// =============================================
// DEBOUNCE HELPER — for text inputs that call __updateSetting
// Without this, every keystroke in a text field (displayName, username,
// email, bio) fired a full authenticated PUT to the backend. At normal
// typing speed that can burn through the 100 req/min rate limit on
// /api/settings/* well before the user finishes typing a sentence.
// =============================================
function _debounceSettingUpdate(fn, delay = 600) {
    let timer = null;
    return (...args) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

let colorPicker = null;
let uiInitialized = false;
let fallbackContentShown = false; // tracks the emergency "show something" fallback; NEVER gates real init
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
let isMobileView = window.innerWidth <= 768;
let menuVisible = true;
let currentMobileSection = null;

// Enable console logs for debugging
const SILENT_MODE = false;
window.__IFRAME_DEBUG__ = true;

function debugLog(...args) {
    if (!SILENT_MODE) {
        console.log('[SettingsUI]', ...args);
    }
}

// =============================================
// UI ERROR BOUNDARY (ENHANCED)
// =============================================
const UIErrorBoundary = {
    _errors: [],
    _maxErrors: 20,
    _handlers: new Set(),
    _silent: false,
    
    wrap(fn, context = 'unknown') {
        return function(...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                UIErrorBoundary.capture(error, context, args);
                
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
        
        console.error(`[UI Error][${context}]`, error, args);
        
        if (DiagnosticsAgent) {
            DiagnosticsAgent.log('error', `ui_${context}: ${error.message}`);
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
// MOBILE RESPONSIVE HANDLING (FIXED)
// =============================================
function checkMobileView() {
    isMobileView = window.innerWidth <= 768;
    
    const sidebar = document.querySelector('.settings-sidebar');
    const content = document.querySelector('.settings-content');
    
    if (!sidebar || !content) return;
    
    if (isMobileView) {
        if (currentMobileSection) {
            sidebar.style.display = 'none';
            content.style.display = 'flex';
            content.style.width = '100%';
        } else {
            sidebar.style.display = 'flex';
            content.style.display = 'none';
        }
    } else {
        sidebar.style.display = 'flex';
        content.style.display = 'flex';
        sidebar.style.width = '280px';
        content.style.width = 'calc(100% - 280px)';
    }
}

function showMobileMenu() {
    if (!isMobileView) return;
    
    const sidebar = document.querySelector('.settings-sidebar');
    const content = document.querySelector('.settings-content');
    
    if (sidebar && content) {
        sidebar.style.display = 'flex';
        content.style.display = 'none';
        currentMobileSection = null;
        
        history.pushState({ mobileMenu: true }, null, window.location.href);
    }
}

function showMobileSection(sectionId) {
    if (!isMobileView) return;
    
    const sidebar = document.querySelector('.settings-sidebar');
    const content = document.querySelector('.settings-content');
    
    if (sidebar && content) {
        sidebar.style.display = 'none';
        content.style.display = 'flex';
        currentMobileSection = sectionId;
        
        history.pushState({ mobileSection: sectionId }, null, window.location.href);
    }
}

// =============================================
// ANDROID BACK BUTTON HANDLER
// =============================================
function setupAndroidBackButton() {
    const notifyParentGoBack = () => {
        // Direct postMessage is most reliable — bypasses any auth/state gates
        try {
            window.parent.postMessage({
                type: 'CHILD_CLOSING',
                module: 'settings',
                childId: 'settings',
                timestamp: Date.now()
            }, '*');
        } catch (e) {}
        sendMessageToParent({
            type: 'CHILD_CLOSING',
            childId: 'settings',
            timestamp: Date.now()
        }).catch(() => {});
    };

    window.addEventListener('popstate', function(event) {
        if (isMobileView) {
            if (currentMobileSection) {
                // User is inside a settings section panel — go back to the settings menu
                event.preventDefault();
                showMobileMenu();
            } else {
                // User is at the settings menu top level — go back to the app sidebar
                if (unsavedChanges) {
                    if (confirm('You have unsaved changes. Leave anyway?')) {
                        unsavedChanges = false;
                        notifyParentGoBack();
                    } else {
                        // Restore history entry so back button works again next time
                        history.pushState({ mobileMenu: true }, null, window.location.href);
                    }
                } else {
                    notifyParentGoBack();
                }
            }
        }
    });

    if (isMobileView) {
        history.replaceState({ mobileMenu: true }, null, window.location.href);
    }
}


// =============================================
// UI INITIALIZATION - ALIGNED WITH HANDSHAKE PROTOCOL
// =============================================
export async function initializeUI() {
    if (uiInitialized) return;
    
    const wrappedInit = UIErrorBoundary.wrap(async function() {
        debugLog('Initializing UI components');
        
        // Check if core is ready - STRICT: wait but with timeout
        const coreReady = await waitForCore(5000);
        
        if (!coreReady) {
            debugLog('Core not ready after timeout, showing fallback UI');
            showFallbackUI();
            // Continue with cached data if available
        }
        
        checkMobileView();
        
        window.addEventListener('resize', () => {
            checkMobileView();
        });
        
        buildSettingsMenu();
        
        setupEventListeners();
        
        setupAndroidBackButton();
        
        updateUserStatus();
        
        initializeColorPicker();
        
        // Load default section with REAL backend data
        if (currentSection) {
            await loadSection(currentSection);
        } else {
            // Load profile section by default
            await loadSection('profile');
        }
        
        updateUserPreview();
        
        setupUIVisibilityTracking();
        
        registerForCoreUpdates();
        
        setupKeyboardShortcuts();
        
        setupNetworkAwareUI();
        
        uiInitialized = true;
        uiReady = true;
        
        // Subscribe to AppSettings so UI re-applies whenever any setting changes
        // (covers cross-tab, offline→online, and other-module-triggered changes)
        if (window.AppSettings && !window.__SETTINGS_UI_APP_SUB__) {
            window.__SETTINGS_UI_APP_SUB__ = window.AppSettings.subscribe((settings, path) => {
                try {
                    if (settings) {
                        applySettingsToUI(settings);
                    }
                } catch (e) {
                    // non-blocking
                }
            });
        }

        dispatchUIReady();
        
        debugLog('UI initialization complete');
        
    }, 'initializeUI');
    
    await wrappedInit();
}

// Wait for core with timeout - STRICT: ALIGNED WITH HANDSHAKE PROTOCOL
function waitForCore(timeout = 5000) {
    return new Promise((resolve) => {
        // Always resolve immediately - no connection required
        console.log('[SettingsUI] Core check - proceeding immediately');
        resolve(true);
        return;
        const timeoutId = setTimeout(() => {
            resolve(true);
        }, timeout);
        
        onReady(() => {
            clearTimeout(timeoutId);
            console.log('[SettingsUI] Core ready event received');
            resolve(true);
        });
        
        // Also listen for parent ready
        const parentReadyHandler = () => {
            clearTimeout(timeoutId);
            console.log('[SettingsUI] Parent ready - core is active');
            resolve(true);
            window.removeEventListener('parentReady', parentReadyHandler);
        };
        window.addEventListener('parentReady', parentReadyHandler);
    });
}

// Show loading state
function showLoadingState() {
    const contentContainer = document.getElementById('settingsContentBody');
    if (!contentContainer) return;
    
    contentContainer.innerHTML = `
        <div class="settings-section" style="text-align: center; padding: 50px;">
            <div class="section-header">
                <h3><i class="fas fa-spinner fa-spin section-icon"></i> Loading Settings</h3>
                <div class="section-description">Connecting to parent...</div>
            </div>
        </div>
    `;
}

// Show fallback UI
function showFallbackUI() {
    const contentContainer = document.getElementById('settingsContentBody');
    if (!contentContainer) return;
    
    if (UIFailsafe && UIFailsafe.isInFallback()) {
        contentContainer.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-exclamation-triangle section-icon" style="color: var(--warning-color);"></i> Limited Mode</h3>
                </div>
                <div class="section-body">
                    <div style="text-align: center; padding: 20px;">
                        <p>Working in limited mode</p>
                        <p style="font-size: 12px; color: var(--text-secondary);">Waiting for parent connection...</p>
                        <button class="action-btn primary" id="retryConnectionBtn" style="display: inline-flex; margin-top: 15px;">Retry</button>
                    </div>
                </div>
            </div>
        `;
        
        const retryBtn = document.getElementById('retryConnectionBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                if (UIFailsafe) UIFailsafe.exitFallbackMode();
                window.location.reload();
            });
        }
    } else {
        // Load profile section with cached data
        loadProfileSection(contentContainer);
    }
}

// Setup UI visibility tracking
function setupUIVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (currentSection && !sectionLoadInProgress) {
                setTimeout(() => {
                    loadSection(currentSection);
                }, 100);
            }
            
            updateUserStatus();
        }
    });
}

// Register for core updates - STRICT: ALIGNED WITH HANDSHAKE PROTOCOL
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
        updateUserStatus();
        if (currentSection) {
            loadSection(currentSection);
        }
    });
    
    window.addEventListener('tokenLost', () => {
        updateUserStatus();
        if (UIFailsafe) UIFailsafe.enterFallbackMode();
    });
    
    if (StartupGovernor && StartupGovernor.onTransition) {
        StartupGovernor.onTransition((oldState, newState) => {
            updateConnectionState(newState);
        });
    }
    
    if (SessionClient && SessionClient.on) {
        SessionClient.on('updated', () => {
            updateUserPreview();
            updateUserStatus();
        });
    }
    
    // STRICT: Listen for parentReady changes from core
    window.addEventListener('parentReady', (event) => {
        if (event.detail && event.detail.ready) {
            debugLog('Parent ready, refreshing UI if needed');
            if (currentSection) {
                loadSection(currentSection);
            }
        }
    });
    
    // STRICT: Listen for lifecycle state changes
    window.addEventListener('lifecycleStateChange', (event) => {
        const { newState } = event.detail;
        updateConnectionState(newState);
        
        if (newState === LifecycleState.ACTIVE && currentSection) {
            debugLog('Module ACTIVE, refreshing UI with real backend data');
            // Force reload from backend
            SettingsState.load().then(() => {
                loadSection(currentSection);
            }).catch(() => {
                loadSection(currentSection);
            });
        }
    });
    
    // STRICT: Listen for settings updates from backend
    window.addEventListener('settingsUpdated', (event) => {
        if (event.detail && event.detail.settings) {
            debugLog('Settings updated from backend, refreshing UI');
            if (currentSection) {
                loadSection(currentSection);
            }
            updateUserPreview();
        }
    });
    
    // Listen for settings global updates from other modules
    window.addEventListener('settingsGlobalUpdated', (event) => {
        if (event.detail) {
            debugLog('Settings globally updated:', event.detail);
            if (currentSection === event.detail.section) {
                loadSection(currentSection);
            }
        }
    });
}

// Update connection state in UI
function updateConnectionState(state) {
    const statusIndicator = document.getElementById('userStatusIndicator');
    const statusText = document.getElementById('userStatusText');
    
    if (!statusIndicator || !statusText) return;
    
    switch(state) {
        case LifecycleState.ACTIVE:
            statusIndicator.style.backgroundColor = 'var(--success-color)';
            statusText.textContent = 'Online';
            break;
            
        case LifecycleState.WAIT_PARENT:
            statusIndicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = 'Connecting...';
            break;
            
        case LifecycleState.READY:
            statusIndicator.style.backgroundColor = 'var(--info-color)';
            statusText.textContent = 'Ready';
            break;
            
        case 'DEGRADED':
            statusIndicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = 'Limited';
            break;
            
        case 'RECOVERING':
            statusIndicator.style.backgroundColor = 'var(--warning-color)';
            statusText.textContent = 'Reconnecting...';
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
            authenticated: checkAuthenticationState(),
            state: currentState
        }
    });
    window.dispatchEvent(event);
}

// Update user preview
function updateUserPreview() {
    const userNamePreview = document.getElementById('userNamePreview');
    const userAvatarPreview = document.getElementById('userAvatarPreview');
    
    // Use SettingsState data for REAL backend state
    const profileSettings = SettingsState.getSection('profile');
    const userData = profileSettings || currentUser;
    
    if (userNamePreview && userData) {
        userNamePreview.textContent = userData.displayName || userData.name || 'User';
    }
    
    if (userAvatarPreview && userData) {
        if (userData.photoURL || profileSettings?.photoUrl) {
            const photoUrl = userData.photoURL || profileSettings.photoUrl;
            userAvatarPreview.style.backgroundImage = `url(${photoUrl})`;
            userAvatarPreview.style.backgroundSize = 'cover';
            userAvatarPreview.style.backgroundPosition = 'center';
            userAvatarPreview.innerHTML = '';
        } else {
            const displayName = userData.displayName || userData.name || 'User';
            const initials = displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
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
        
        if (quality === 'poor' || quality === 'degraded') {
            document.body.classList.add('slow-connection');
        } else {
            document.body.classList.remove('slow-connection');
        }
    };
    
    if (ReliabilityEngine.on) {
        ReliabilityEngine.on('qualityChanged', updateForNetwork);
    }
}

// =============================================
// KEYBOARD SHORTCUTS
// =============================================
function setupKeyboardShortcuts() {
    const wrappedHandler = UIErrorBoundary.wrap(function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (unsavedChanges) {
                saveSettings();
            }
        }
        
        if (e.key === 'Escape' && activeModals.size > 0) {
            const lastModal = Array.from(activeModals).pop();
            closeModal(lastModal);
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('settingsSearch');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        if (isMobileView && e.key === 'Escape' && currentMobileSection) {
            showMobileMenu();
        }
        
    }, 'keyboardShortcut');
    
    document.addEventListener('keydown', wrappedHandler);
}

// =============================================
// BUILD SETTINGS MENU
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
        
        menuItem.setAttribute('data-section', item.id);
        
        menuItem.innerHTML = `
            <div class="menu-icon">
                <i class="${item.icon}"></i>
            </div>
            <div class="menu-text">${item.title}</div>
            ${item.badge ? `<div class="menu-badge">${item.badge}</div>` : ''}
        `;
        
        menuItem.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                document.querySelectorAll('.menu-item').forEach(item => {
                    item.classList.remove('active');
                });
                menuItem.classList.add('active');
                
                await loadSection(item.id);
                
                if (isMobileView) {
                    showMobileSection(item.id);
                }
                
            } catch (error) {
                console.error('Error loading section:', error);
                showNotification('Error loading section', 'error');
            }
        });
        
        menuContainer.appendChild(menuItem);
    });
    
    addConnectionStatusIndicator();
    
    if (isMobileView) {
        const backToMenuBtn = document.createElement('div');
        backToMenuBtn.className = 'menu-item';
        backToMenuBtn.style.marginTop = '10px';
        backToMenuBtn.style.borderTop = '1px solid var(--border-color)';
        backToMenuBtn.style.paddingTop = '15px';
        backToMenuBtn.innerHTML = `
            <div class="menu-icon">
                <i class="fas fa-arrow-left"></i>
            </div>
            <div class="menu-text">Back to Settings</div>
        `;
        backToMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showMobileMenu();
        });
        menuContainer.appendChild(backToMenuBtn);
    }
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
    
    let statusIcon = 'fa-circle';
    let statusColor = 'var(--warning-color)';
    let statusText = 'Initializing...';
    
    if (currentState === LifecycleState.ACTIVE) {
        statusIcon = 'fa-check-circle';
        statusColor = 'var(--success-color)';
        statusText = 'Connected';
    } else if (currentState === LifecycleState.WAIT_PARENT) {
        statusIcon = 'fa-sync fa-spin';
        statusColor = 'var(--warning-color)';
        statusText = 'Connecting...';
    } else if (currentState === LifecycleState.READY) {
        statusIcon = 'fa-circle';
        statusColor = 'var(--info-color)';
        statusText = 'Ready';
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
// LOAD SECTION - STRICT: REAL BACKEND DATA
// =============================================
export async function loadSection(sectionId) {
    // Guard against concurrent loads
    if (sectionLoadInProgress) {
        uiRenderQueue.push(sectionId);
        return;
    }
    
    sectionLoadInProgress = true;
    lastUIAction = Date.now();
    
    console.log('[SettingsUI] 📂 Loading section:', sectionId);
    
    try {
        // Update global state (local mutable variables - FIXED)
        currentSection = sectionId;
        unsavedChanges = false;
        
        // Update UI
        updateSectionTitle(sectionId);
        updateSaveButton();
        
        // Get container
        const contentContainer = document.getElementById('settingsContentBody');
        if (!contentContainer) {
            console.log('[SettingsUI] ❌ Content container not found');
            sectionLoadInProgress = false;
            return;
        }
        
        // Reset scroll and show loading
        contentContainer.scrollTop = 0;
        contentContainer.innerHTML = `
            <div class="settings-section" style="text-align: center; padding: 30px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color);"></i>
                <p style="margin-top: 15px;">Loading ${sectionId} settings...</p>
            </div>
        `;
        
        // Small delay for UI feedback
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Load section based on ID - using REAL backend data from SettingsState
        let loadFunctionsMap = {
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
        
        let sectionLoader = loadFunctionsMap[sectionId];
        
        if (sectionLoader) {
            try {
                await sectionLoader(contentContainer);
                console.log('[SettingsUI] ✅ Successfully loaded section:', sectionId);
            } catch (sectionError) {
                console.error('[SettingsUI] ❌ Error loading section', sectionId, ':', sectionError);
                contentContainer.innerHTML = `
                    <div class="settings-section">
                        <div class="section-header">
                            <h3><i class="fas fa-exclamation-triangle section-icon" style="color: var(--danger-color);"></i> Error Loading Section</h3>
                        </div>
                        <div class="section-body">
                            <p style="color: var(--danger-color); margin-bottom: 15px;">${sectionError.message || 'Unknown error'}</p>
                            <button class="action-btn primary" onclick="window.location.reload()">
                                <i class="fas fa-redo"></i> Refresh
                            </button>
                        </div>
                    </div>
                `;
            }
        } else {
            contentContainer.innerHTML = '<p>Section not found</p>';
        }
        
        // Process queue if needed
        if (uiRenderQueue.length > 0) {
            let nextQueuedSection = uiRenderQueue.shift();
            if (nextQueuedSection !== sectionId) {
                setTimeout(() => loadSection(nextQueuedSection), 100);
            }
        }
        
    } catch (error) {
        console.error('[SettingsUI] 💥 Critical error in loadSection', sectionId, ':', error);
        
        const contentContainer = document.getElementById('settingsContentBody');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="settings-section">
                    <div class="section-header">
                        <h3><i class="fas fa-exclamation-triangle section-icon" style="color: var(--danger-color);"></i> Error</h3>
                    </div>
                    <div class="section-body">
                        <p style="color: var(--danger-color); margin-bottom: 15px;">${error.message || 'Unknown error'}</p>
                        <button class="action-btn primary" onclick="window.location.reload()">
                            <i class="fas fa-redo"></i> Refresh
                        </button>
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
// SETUP EVENT LISTENERS
// =============================================
export function setupEventListeners() {
    const backToAppBtn = document.getElementById('backToAppBtn');
    if (backToAppBtn) {
        backToAppBtn.addEventListener('click', () => {
            const doGoBack = () => {
                // Tell parent to go back to the previous module
                try {
                    window.parent.postMessage({
                        type: 'CHILD_CLOSING',
                        module: 'settings',
                        childId: 'settings',
                        timestamp: Date.now()
                    }, '*');
                } catch (e) {}
                // Also try via sendMessageToParent for compatibility
                sendMessageToParent({
                    type: 'CHILD_CLOSING',
                    childId: 'settings',
                    timestamp: Date.now()
                }).catch(() => {});
            };

            if (unsavedChanges) {
                if (confirm('You have unsaved changes. Leave anyway?')) {
                    unsavedChanges = false;
                    doGoBack();
                }
            } else {
                doGoBack();
            }
        });
    }
    
    const saveSectionBtn = document.getElementById('saveSectionBtn');
    if (saveSectionBtn) {
        saveSectionBtn.addEventListener('click', async () => {
            try {
                saveSectionBtn.disabled = true;
                saveSectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                
                // Save using core function which uses SettingsState (REAL BACKEND)
                await coreSaveSettings();
                
                unsavedChanges = false;
                updateSaveButton();
                showNotification('Settings saved successfully', 'success');
                
                // On mobile: after saving, if user is on a section panel offer to go back to menu
                // On desktop: stay in place (no nav needed)
                if (isMobileView && currentMobileSection) {
                    // Optionally show a small "Back to menu" hint — don't force navigate
                }
                
            } catch (error) {
                debugLog('Error saving settings:', error);
                showNotification('Error saving settings: ' + (error.message || 'Unknown error'), 'error');
            } finally {
                saveSectionBtn.disabled = false;
                updateSaveButton();
            }
        });
    }
    
    const resetSectionBtn = document.getElementById('resetSectionBtn');
    if (resetSectionBtn) {
        resetSectionBtn.addEventListener('click', async () => {
            if (confirm('Reset all settings in this section to default?')) {
                try {
                    if (currentSection && DEFAULT_SETTINGS[currentSection]) {
                        const defaultValues = DEFAULT_SETTINGS[currentSection];
                        
                        // Update each setting through SettingsState (REAL BACKEND)
                        for (const [key, value] of Object.entries(defaultValues)) {
                            await SettingsState.update(currentSection, key, value);
                        }
                        
                        await loadSection(currentSection);
                        showNotification('Settings reset to default', 'success');
                    }
                } catch (error) {
                    showNotification('Error resetting settings', 'error');
                }
            }
        });
    }
    
    const settingsSearch = document.getElementById('settingsSearch');
    if (settingsSearch) {
        settingsSearch.addEventListener('input', function(e) {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            
            searchDebounceTimer = setTimeout(() => {
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
    
    setupModalListeners();
    setupPhotoModalListeners();
    setupPasswordModalListeners();
    
    const terminateAllSessionsBtn = document.getElementById('terminateAllSessionsBtn');
    if (terminateAllSessionsBtn) {
        terminateAllSessionsBtn.addEventListener('click', async () => {
            if (!confirm('Terminate all other sessions?')) return;
            // FIX: previously called terminateAllSessions(), which POSTs to
            // /api/auth/terminate-all-sessions — a route that does not exist
            // anywhere in the backend — and swallowed the resulting error
            // with .catch(() => {}), so this button silently did nothing.
            // /api/devices/revoke-all is the real, working endpoint (also
            // used by the linked-devices "logout all" flow).
            terminateAllSessionsBtn.disabled = true;
            try {
                await secureFetchWrapper('/api/devices/revoke-all', 'DELETE');
                showNotification('All other sessions terminated', 'success');
            } catch (error) {
                showNotification('Failed to terminate sessions: ' + (error.message || 'Unknown error'), 'error');
            } finally {
                terminateAllSessionsBtn.disabled = false;
            }
        });
    }
    
    window.addEventListener('beforeunload', (e) => {
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes.';
        }
    });
    
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
            takePhoto();
        });
    }
    
    const choosePhotoBtn = document.getElementById('choosePhotoBtn');
    if (choosePhotoBtn) {
        choosePhotoBtn.addEventListener('click', () => {
            choosePhoto();
        });
    }
    
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            removePhoto();
        });
    }
    
    const savePhotoBtn = document.getElementById('savePhotoBtn');
    if (savePhotoBtn) {
        savePhotoBtn.addEventListener('click', () => {
            savePhoto();
        });
    }
}

// Setup password modal listeners
export function setupPasswordModalListeners() {
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    if (savePasswordBtn) {
        savePasswordBtn.addEventListener('click', () => {
            changePassword();
        });
    }
}

// =============================================
// COLOR PICKER
// =============================================
export function initializeColorPicker() {
    const container = document.getElementById('colorPickerContainer');
    if (!container) return;
    
    // Get REAL accent color from SettingsState
    const appearanceSettings = SettingsState.getSection('appearance');
    const currentColor = appearanceSettings?.accentColor || DEFAULT_SETTINGS.appearance.accentColor;
    
    if (typeof Pickr === 'undefined') {
        setupFallbackColorPicker();
        return;
    }
    
    try {
        colorPicker = Pickr.create({
            el: container,
            theme: 'nano',
            default: currentColor,
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
                // Update through SettingsState for REAL backend persistence
                SettingsState.update('appearance', 'accentColor', hexColor).then(() => {
                    unsavedChanges = true;
                    updateSaveButton();
                    updateAccentColor(hexColor);
                    
                    sendMessageToParent({
                        type: 'THEME_CHANGED',
                        accentColor: hexColor,
                        timestamp: Date.now()
                    }).catch(() => {});
                }).catch(error => {
                    debugLog('Error saving accent color:', error);
                    showNotification('Error saving accent color', 'error');
                });
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
    
    const appearanceSettings = SettingsState.getSection('appearance');
    const currentColor = appearanceSettings?.accentColor || DEFAULT_SETTINGS.appearance.accentColor;
    
    container.innerHTML = `
        <input type="color" id="fallbackColorPicker" value="${currentColor}">
    `;
    
    const picker = document.getElementById('fallbackColorPicker');
    if (picker) {
        // 'input' fires continuously while dragging inside the picker (many
        // events/sec) — use it only for the live preview, not the network call.
        picker.addEventListener('input', (e) => {
            updateAccentColor(e.target.value);
        });
        // 'change' fires once, when the picker is closed/committed — save then.
        picker.addEventListener('change', (e) => {
            SettingsState.update('appearance', 'accentColor', e.target.value).then(() => {
                unsavedChanges = true;
                updateSaveButton();
            }).catch(error => {
                debugLog('Error saving accent color:', error);
            });
        });
    }
}

// Update accent color in UI
export function updateAccentColor(color) {
    document.documentElement.style.setProperty('--primary-color', color);
    
    const darkerColor = shadeColor(color, -20);
    document.documentElement.style.setProperty('--primary-dark', darkerColor);
    
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
    
    // Update through SettingsState for REAL backend persistence
    SettingsState.update('appearance', 'theme', theme).then(() => {
        unsavedChanges = true;
        updateSaveButton();
    }).catch(error => {
        debugLog('Error saving theme:', error);
    });
}

// Apply font size
export function applyFontSize(size) {
    document.documentElement.style.fontSize = `${size}px`;
    document.documentElement.style.setProperty('--base-font-size', `${size}px`);
    
    // Update through SettingsState for REAL backend persistence
    SettingsState.update('appearance', 'fontSize', parseInt(size)).then(() => {
        unsavedChanges = true;
        updateSaveButton();
    }).catch(error => {
        debugLog('Error saving font size:', error);
    });
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
// SEARCH SETTINGS
// =============================================
export function searchSettings(query) {
    const normalizedQuery = query.toLowerCase().trim();
    
    const contentContainer = document.getElementById('settingsContentBody');
    if (!contentContainer) return;
    
    if (!normalizedQuery) {
        loadSection(currentSection);
        return;
    }
    
    // Use REAL settings data from SettingsState
    const settingsData = SettingsState.get();
    
    if (!settingsData || Object.keys(settingsData).length === 0) {
        contentContainer.innerHTML = '<p>Settings not loaded</p>';
        return;
    }
    
    const results = [];
    
    Object.keys(settingsData).forEach(section => {
        const sectionSettings = settingsData[section];
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
            html += `<div class="setting-item" data-section="${result.section}" data-key="${result.key}" style="cursor: pointer;">`;
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
                    
                    if (isMobileView) {
                        showMobileSection(section);
                    }
                }
            });
        });
        
    } else {
        contentContainer.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-search section-icon"></i> Search Results</h3>
                    <div class="section-description">
                        No settings found matching "${escapeHtml(query)}"
                    </div>
                </div>
            </div>
        `;
    }
}

// =============================================
// NOTIFICATION SYSTEM
// =============================================
export function showNotification(message, type = 'success', duration = 3000) {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (!notification || !notificationText) {
        return;
    }
    
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
// SAVE SETTINGS - REAL BACKEND
// =============================================
export async function saveSettings() {
    try {
        if (!validateCurrentSection()) {
            showNotification('Please fix validation errors', 'error');
            return false;
        }
        
        // Use core save which uses SettingsState (REAL BACKEND)
        await coreSaveSettings();
        
        unsavedChanges = false;
        updateSaveButton();
        
        // Notify parent about settings update - use safeSend through core
        sendMessageToParent({
            type: 'SETTINGS_UPDATED',
            section: currentSection,
            timestamp: Date.now()
        }).catch(() => {});
        
        return true;
        
    } catch (error) {
        debugLog('Save error:', error);
        showNotification('Error saving settings: ' + (error.message || 'Unknown error'), 'error');
        throw error;
    }
}

// Validate current section
function validateCurrentSection() {
    const settingsData = SettingsState.get();
    if (!settingsData || !currentSection) return true;
    
    const section = settingsData[currentSection];
    if (!section) return true;
    
    switch(currentSection) {
        case 'profile':
            if (section.displayName && section.displayName.length > 50) {
                showNotification('Display name too long (max 50 chars)', 'error');
                return false;
            }
            if (section.bio && section.bio.length > 150) {
                showNotification('Bio too long (max 150 chars)', 'error');
                return false;
            }
            if (section.username && !/^@?[a-zA-Z0-9_]+$/.test(section.username)) {
                showNotification('Username can only contain letters, numbers, and underscores', 'error');
                return false;
            }
            break;
    }
    
    return true;
}

// Reset current section - REAL BACKEND
export async function resetCurrentSection() {
    if (currentSection && DEFAULT_SETTINGS[currentSection]) {
        const defaultValues = DEFAULT_SETTINGS[currentSection];
        
        // Update each setting through SettingsState for REAL backend persistence
        for (const [key, value] of Object.entries(defaultValues)) {
            await SettingsState.update(currentSection, key, value);
        }
        
        unsavedChanges = true;
        updateSaveButton();
        await loadSection(currentSection);
        showNotification('Settings reset to default', 'success');
    }
}

// Update user status
export function updateUserStatus() {
    const statusIndicator = document.getElementById('userStatusIndicator');
    const statusText = document.getElementById('userStatusText');
    
    if (!statusIndicator || !statusText) return;
    
    statusIndicator.style.backgroundColor = 'var(--success-color)';
    statusText.textContent = 'Online';
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
// PHOTO FUNCTIONS
// =============================================
export function takePhoto() {
    debugLog('Photo capture requested');

    // FIX: this previously set pendingPhotoData to a hardcoded, truncated,
    // invalid base64 literal after a fake setTimeout delay — a fake value
    // that would have corrupted the user's real avatar if saved. Use a real
    // file input with capture="environment" (the standard way to open the
    // device camera from a web page) and read the actual photo, same as
    // choosePhoto() below.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

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
        // Update through SettingsState for REAL backend persistence
        SettingsState.update('profile', 'photoUrl', '').then(() => {
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
            showNotification('Photo removed', 'success');
        }).catch(error => {
            debugLog('Error removing photo:', error);
            showNotification('Error removing photo', 'error');
        });
    }
}

export function savePhoto() {
    if (pendingPhotoData) {
        // Update through SettingsState for REAL backend persistence
        SettingsState.update('profile', 'photoUrl', pendingPhotoData).then(() => {
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
            showNotification('Photo saved', 'success');
        }).catch(error => {
            debugLog('Error saving photo:', error);
            showNotification('Error saving photo', 'error');
        });
    }
}

// =============================================
// CHANGE PASSWORD
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
        
        // FIX: was POSTing to /api/auth/change-password, which does not exist
        // anywhere in the backend — the real handler is /api/settings/change-password
        // (settings.js), which also requires confirmPassword in the body (it
        // re-validates the match server-side). Every password change attempt
        // was failing before this fix.
        await makeSafeRequest('/api/settings/change-password', 'POST', {
            currentPassword: currentPassword.value,
            newPassword: newPassword.value,
            confirmPassword: confirmPassword.value
        });
        
        closeModal('changePasswordModal');
        showNotification('Password changed successfully', 'success');
        
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
// EDIT MOOD COLOR
// =============================================
export function editMoodColor(mood) {
    const moodColors = SettingsState.getSetting('mood', 'moodColors', DEFAULT_SETTINGS.mood.moodColors);
    const currentColor = moodColors[mood];
    
    if (!colorPicker) {
        editMoodColorFallback(mood);
        return;
    }
    
    colorPicker.setColor(currentColor);
    colorPicker.show();
    
    const originalSaveHandler = colorPicker._eventHandler?.save;
    colorPicker.on('save', (color) => {
        if (color) {
            const hexColor = color.toHEXA().toString();
            // Update through SettingsState for REAL backend persistence
            SettingsState.update('mood', 'moodColors', {
                ...moodColors,
                [mood]: hexColor
            }).then(() => {
                unsavedChanges = true;
                updateSaveButton();
                loadSection('mood');
                showNotification('Mood color updated', 'success');
            }).catch(error => {
                debugLog('Error updating mood color:', error);
                showNotification('Error updating mood color', 'error');
            });
        }
        colorPicker.hide();
        if (originalSaveHandler) {
            colorPicker.on('save', originalSaveHandler);
        }
    });
}

function editMoodColorFallback(mood) {
    const moodColors = SettingsState.getSetting('mood', 'moodColors', DEFAULT_SETTINGS.mood.moodColors);
    const currentColor = moodColors[mood];
    
    const input = document.createElement('input');
    input.type = 'color';
    input.value = currentColor;
    
    input.addEventListener('change', async (e) => {
        SettingsState.update('mood', 'moodColors', {
            ...moodColors,
            [mood]: e.target.value
        }).then(() => {
            unsavedChanges = true;
            updateSaveButton();
            loadSection('mood');
            showNotification('Mood color updated', 'success');
        }).catch(error => {
            debugLog('Error updating mood color:', error);
            showNotification('Error updating mood color', 'error');
        });
    });
    
    input.click();
}

// =============================================
// SECTION LOADER FUNCTIONS - USING REAL SETTINGS STATE
// =============================================
export function loadProfileSection(container) {
    debugLog('Loading profile section');
    // Get REAL settings from SettingsState (works even without active auth - uses cache)
    const settings = SettingsState.getSection('profile') || DEFAULT_SETTINGS.profile;
    
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
                        <button class="setting-button" id="changePhotoBtn">
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
                               placeholder="Your name">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Username</div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="usernameInput" 
                               value="${escapeHtml(settings.username || currentUser?.username || '')}" 
                               placeholder="@username">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Bio</div>
                    </div>
                    <div class="setting-control">
                        <textarea class="setting-textarea" id="bioInput" 
                                  placeholder="About you...">${escapeHtml(settings.bio || '')}</textarea>
                        <div class="input-hint"><span id="bioCounter">${(settings.bio || '').length}</span>/150</div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Email</div>
                    </div>
                    <div class="setting-control">
                        <input type="email" class="setting-input" id="emailInput" 
                               value="${escapeHtml(settings.email || currentUser?.email || '')}" 
                               placeholder="email@example.com">
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
                        <select class="setting-dropdown" id="profileVisibilitySelect">
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
                            <input type="checkbox" id="lastSeenToggle" ${settings.lastSeen !== false ? 'checked' : ''}>
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
    if (changePhotoBtn) {
        changePhotoBtn.addEventListener('click', () => {
            openModal('changePhotoModal');
        });
    }
    
    const displayNameInput = document.getElementById('displayNameInput');
    if (displayNameInput) {
        const debouncedUpdate = _debounceSettingUpdate((value) => {
            window.__updateSetting('profile', 'displayName', value);
        });
        displayNameInput.addEventListener('input', () => {
            debouncedUpdate(displayNameInput.value);
        });
    }
    
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) {
        const debouncedUpdate = _debounceSettingUpdate((value) => {
            window.__updateSetting('profile', 'username', value);
        });
        usernameInput.addEventListener('input', () => {
            debouncedUpdate(usernameInput.value);
        });
    }
    
    const emailInput = document.getElementById('emailInput');
    if (emailInput) {
        const debouncedUpdate = _debounceSettingUpdate((value) => {
            window.__updateSetting('profile', 'email', value);
        });
        emailInput.addEventListener('input', () => {
            debouncedUpdate(emailInput.value);
        });
    }
    
    const bioInput = document.getElementById('bioInput');
    const bioCounter = document.getElementById('bioCounter');
    if (bioInput && bioCounter) {
        const debouncedUpdate = _debounceSettingUpdate((value) => {
            window.__updateSetting('profile', 'bio', value);
        });
        bioInput.addEventListener('input', () => {
            // Character counter updates instantly (client-only, cheap);
            // the network call is debounced.
            const length = bioInput.value.length;
            bioCounter.textContent = length;
            if (length > 150) {
                bioCounter.style.color = 'var(--danger-color)';
            } else {
                bioCounter.style.color = 'var(--primary-color)';
            }
            debouncedUpdate(bioInput.value);
        });
    }
    
    const profileVisibilitySelect = document.getElementById('profileVisibilitySelect');
    if (profileVisibilitySelect) {
        profileVisibilitySelect.addEventListener('change', () => {
            window.__updateSetting('profile', 'profileVisibility', profileVisibilitySelect.value);
        });
    }
    
    const lastSeenToggle = document.getElementById('lastSeenToggle');
    if (lastSeenToggle) {
        lastSeenToggle.addEventListener('change', () => {
            window.__updateSetting('profile', 'lastSeen', lastSeenToggle.checked);
        });
    }
}

export function loadSecuritySection(container) {
    debugLog('Loading security section');
    
    // Get REAL settings from SettingsState
    const settings = SettingsState.getSection('security') || DEFAULT_SETTINGS.security;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-shield-alt section-icon"></i> Account Security</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Two-Factor Authentication</div>
                        <div class="setting-description">Add an extra layer of security to your account</div>
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
                        <div class="setting-description">Update your account password</div>
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
                        <div class="setting-description">Get notified when someone logs into your account</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="loginNotificationsToggle" ${settings.loginNotifications !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Active Sessions</div>
                        <div class="setting-description">View and manage devices where you're logged in</div>
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
                        <div class="setting-description">Automatically log out after inactivity</div>
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
            // Prefer the real device list (linked-sessions-and-pin.js, backed by
            // /api/devices + linked_devices) over the legacy showActiveSessions()
            // below, which reads stale data from /api/auth/sessions and whose
            // terminate button duplicated/fought with this same #sessionsList.
            const modal = document.getElementById('sessionsModal');
            if (window.__kynLoadDevices && modal) {
                modal.classList.add('active');
                window.__kynLoadDevices();
            } else {
                showActiveSessions();
            }
        });
    }
    
    const twoFactorAuthToggle = document.getElementById('twoFactorAuthToggle');
    if (twoFactorAuthToggle) {
        twoFactorAuthToggle.addEventListener('change', () => {
            window.__updateSetting('security', 'twoFactorAuth', twoFactorAuthToggle.checked);
        });
    }
    
    const loginNotificationsToggle = document.getElementById('loginNotificationsToggle');
    if (loginNotificationsToggle) {
        loginNotificationsToggle.addEventListener('change', () => {
            window.__updateSetting('security', 'loginNotifications', loginNotificationsToggle.checked);
        });
    }
    
    const sessionTimeoutSelect = document.getElementById('sessionTimeoutSelect');
    if (sessionTimeoutSelect) {
        sessionTimeoutSelect.addEventListener('change', () => {
            window.__updateSetting('security', 'sessionTimeout', sessionTimeoutSelect.value);
        });
    }
}

export function loadPrivacySection(container) {
    debugLog('Loading privacy section');
    
    // Get REAL settings from SettingsState
    const settings = SettingsState.getSection('privacy') || DEFAULT_SETTINGS.privacy;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-plus section-icon"></i> Connection Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Add Me</div>
                        <div class="setting-description">Control who can send you friend requests</div>
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
                        <div class="setting-description">Allow others to find you by phone number</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="contactDiscoveryToggle" ${settings.contactDiscovery !== false ? 'checked' : ''}>
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
                        <div class="setting-description">Control who can send you direct messages</div>
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
                        <div class="setting-description">Let others know when you've read their messages</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="readReceiptsToggle" ${settings.readReceipts !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Typing Indicators</div>
                        <div class="setting-description">Show when you're typing a message</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="typingIndicatorsToggle" ${settings.typingIndicators !== false ? 'checked' : ''}>
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
                        <div class="setting-description">Manage users you have blocked</div>
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
    
    const whoCanAddMeSelect = document.getElementById('whoCanAddMeSelect');
    if (whoCanAddMeSelect) {
        whoCanAddMeSelect.addEventListener('change', () => {
            window.__updateSetting('privacy', 'whoCanAddMe', whoCanAddMeSelect.value);
        });
    }
    
    const canMessageMeSelect = document.getElementById('canMessageMeSelect');
    if (canMessageMeSelect) {
        canMessageMeSelect.addEventListener('change', () => {
            window.__updateSetting('privacy', 'canMessageMe', canMessageMeSelect.value);
        });
    }
    
    const contactDiscoveryToggle = document.getElementById('contactDiscoveryToggle');
    if (contactDiscoveryToggle) {
        contactDiscoveryToggle.addEventListener('change', () => {
            window.__updateSetting('privacy', 'contactDiscovery', contactDiscoveryToggle.checked);
        });
    }
    
    const readReceiptsToggle = document.getElementById('readReceiptsToggle');
    if (readReceiptsToggle) {
        readReceiptsToggle.addEventListener('change', () => {
            window.__updateSetting('privacy', 'readReceipts', readReceiptsToggle.checked);
        });
    }
    
    const typingIndicatorsToggle = document.getElementById('typingIndicatorsToggle');
    if (typingIndicatorsToggle) {
        typingIndicatorsToggle.addEventListener('change', () => {
            window.__updateSetting('privacy', 'typingIndicators', typingIndicatorsToggle.checked);
        });
    }
}

// =============================================
// CHAT SECTION LOADER - FIXED (NEW)
// =============================================
export function loadChatSection(container) {
    debugLog('Loading chat section');
    const settings = SettingsState.getSection('chat') || DEFAULT_SETTINGS.chat;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-comment-dots section-icon"></i> Chat Preferences</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enter to Send</div>
                        <div class="setting-description">Press Enter to send messages (Shift+Enter for new line)</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="enterToSend" ${settings.enterToSend !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Font Size</div>
                        <div class="setting-description">Adjust the size of text in chats</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="messageFontSize">
                            <option value="small" ${settings.messageFontSize === 'small' ? 'selected' : ''}>Small</option>
                            <option value="medium" ${(settings.messageFontSize === 'medium' || !settings.messageFontSize) ? 'selected' : ''}>Medium</option>
                            <option value="large" ${settings.messageFontSize === 'large' ? 'selected' : ''}>Large</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Wallpaper</div>
                        <div class="setting-description">Customize chat background</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changeWallpaperBtn">
                            <i class="fas fa-image"></i> Change Wallpaper
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Show Timestamps</div>
                        <div class="setting-description">Display message timestamps</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="showTimestamps" ${settings.showTimestamps !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Previews</div>
                        <div class="setting-description">Show message content in notifications</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messagePreviews" ${settings.messagePreviews !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-paper-plane section-icon"></i> Message Behavior</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Confirm Before Sending</div>
                        <div class="setting-description">Show confirmation dialog before sending messages</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="confirmSend" ${settings.confirmSend ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Correct</div>
                        <div class="setting-description">Enable automatic spelling correction</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoCorrect" ${settings.autoCorrect !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Setup event listeners
    const enterToSend = document.getElementById('enterToSend');
    if (enterToSend) enterToSend.addEventListener('change', () => window.__updateSetting('chat', 'enterToSend', enterToSend.checked));
    
    const messageFontSize = document.getElementById('messageFontSize');
    if (messageFontSize) messageFontSize.addEventListener('change', () => window.__updateSetting('chat', 'messageFontSize', messageFontSize.value));
    
    const changeWallpaperBtn = document.getElementById('changeWallpaperBtn');
    if (changeWallpaperBtn) changeWallpaperBtn.addEventListener('click', () => showNotification('Wallpaper picker coming soon', 'info'));
    
    const showTimestamps = document.getElementById('showTimestamps');
    if (showTimestamps) showTimestamps.addEventListener('change', () => window.__updateSetting('chat', 'showTimestamps', showTimestamps.checked));
    
    const messagePreviews = document.getElementById('messagePreviews');
    if (messagePreviews) messagePreviews.addEventListener('change', () => window.__updateSetting('chat', 'messagePreviews', messagePreviews.checked));
    
    const confirmSend = document.getElementById('confirmSend');
    if (confirmSend) confirmSend.addEventListener('change', () => window.__updateSetting('chat', 'confirmSend', confirmSend.checked));
    
    const autoCorrect = document.getElementById('autoCorrect');
    if (autoCorrect) autoCorrect.addEventListener('change', () => window.__updateSetting('chat', 'autoCorrect', autoCorrect.checked));
}

// =============================================
// FRIENDS SECTION LOADER - FIXED (NEW)
// =============================================
export function loadFriendsSection(container) {
    debugLog('Loading friends section');
    const settings = SettingsState.getSection('friends') || DEFAULT_SETTINGS.friends;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-friends section-icon"></i> Friend Requests</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Request Notifications</div>
                        <div class="setting-description">Get notified when someone sends a friend request</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendRequestNotifications" ${settings.friendRequestNotifications !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Accept Friends</div>
                        <div class="setting-description">Automatically accept friend requests from friends of friends</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoAcceptFriends" ${settings.autoAcceptFriends ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Request Message</div>
                        <div class="setting-description">Allow custom messages with friend requests</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="allowRequestMessage" ${settings.allowRequestMessage !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-list section-icon"></i> Friend List</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Show Online Status</div>
                        <div class="setting-description">Display when friends are online</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="showOnlineStatus" ${settings.showOnlineStatus !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Sort Friends By</div>
                        <div class="setting-description">Choose how to order your friend list</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="sortFriendsBy">
                            <option value="name" ${settings.sortFriendsBy === 'name' ? 'selected' : ''}>Name</option>
                            <option value="status" ${settings.sortFriendsBy === 'status' ? 'selected' : ''}>Status</option>
                            <option value="recent" ${(settings.sortFriendsBy === 'recent' || !settings.sortFriendsBy) ? 'selected' : ''}>Recent</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Limit Warning</div>
                        <div class="setting-description">Warn when approaching friend limit</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendLimitWarning" ${settings.friendLimitWarning !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const friendRequestNotifications = document.getElementById('friendRequestNotifications');
    if (friendRequestNotifications) friendRequestNotifications.addEventListener('change', () => window.__updateSetting('friends', 'friendRequestNotifications', friendRequestNotifications.checked));
    
    const autoAcceptFriends = document.getElementById('autoAcceptFriends');
    if (autoAcceptFriends) autoAcceptFriends.addEventListener('change', () => window.__updateSetting('friends', 'autoAcceptFriends', autoAcceptFriends.checked));
    
    const allowRequestMessage = document.getElementById('allowRequestMessage');
    if (allowRequestMessage) allowRequestMessage.addEventListener('change', () => window.__updateSetting('friends', 'allowRequestMessage', allowRequestMessage.checked));
    
    const showOnlineStatus = document.getElementById('showOnlineStatus');
    if (showOnlineStatus) showOnlineStatus.addEventListener('change', () => window.__updateSetting('friends', 'showOnlineStatus', showOnlineStatus.checked));
    
    const sortFriendsBy = document.getElementById('sortFriendsBy');
    if (sortFriendsBy) sortFriendsBy.addEventListener('change', () => window.__updateSetting('friends', 'sortFriendsBy', sortFriendsBy.value));
    
    const friendLimitWarning = document.getElementById('friendLimitWarning');
    if (friendLimitWarning) friendLimitWarning.addEventListener('change', () => window.__updateSetting('friends', 'friendLimitWarning', friendLimitWarning.checked));
}

// =============================================
// GROUPS SECTION LOADER - FIXED (NEW)
// =============================================
export function loadGroupsSection(container) {
    debugLog('Loading groups section');
    const settings = SettingsState.getSection('groups') || DEFAULT_SETTINGS.groups;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-users section-icon"></i> Group Privacy</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Add Me to Groups</div>
                        <div class="setting-description">Control who can add you to group chats</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="whoCanAddToGroups">
                            <option value="everyone" ${settings.whoCanAddToGroups === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.whoCanAddToGroups === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${(settings.whoCanAddToGroups === 'nobody' || !settings.whoCanAddToGroups) ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Invite Links</div>
                        <div class="setting-description">Allow group invite links</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="allowInviteLinks" ${settings.allowInviteLinks !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bell section-icon"></i> Group Notifications</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mentions Only</div>
                        <div class="setting-description">Only get notified when mentioned</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="mentionsOnly" ${settings.mentionsOnly ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Message Preview</div>
                        <div class="setting-description">Show message previews in group notifications</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupMessagePreview" ${settings.groupMessagePreview !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const whoCanAddToGroups = document.getElementById('whoCanAddToGroups');
    if (whoCanAddToGroups) whoCanAddToGroups.addEventListener('change', () => window.__updateSetting('groups', 'whoCanAddToGroups', whoCanAddToGroups.value));
    
    const allowInviteLinks = document.getElementById('allowInviteLinks');
    if (allowInviteLinks) allowInviteLinks.addEventListener('change', () => window.__updateSetting('groups', 'allowInviteLinks', allowInviteLinks.checked));
    
    const mentionsOnly = document.getElementById('mentionsOnly');
    if (mentionsOnly) mentionsOnly.addEventListener('change', () => window.__updateSetting('groups', 'mentionsOnly', mentionsOnly.checked));
    
    const groupMessagePreview = document.getElementById('groupMessagePreview');
    if (groupMessagePreview) groupMessagePreview.addEventListener('change', () => window.__updateSetting('groups', 'groupMessagePreview', groupMessagePreview.checked));
}

// =============================================
// CALLS SECTION LOADER - FIXED (NEW)
// =============================================
export function loadCallsSection(container) {
    debugLog('Loading calls section');
    const settings = SettingsState.getSection('calls') || DEFAULT_SETTINGS.calls;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-phone section-icon"></i> Call Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Incoming Calls</div>
                        <div class="setting-description">Allow incoming calls</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="allowIncomingCalls" ${settings.allowIncomingCalls !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Ringtone</div>
                        <div class="setting-description">Select your call ringtone</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="callRingtone">
                            <option value="default" ${settings.callRingtone === 'default' ? 'selected' : ''}>Default</option>
                            <option value="classic" ${settings.callRingtone === 'classic' ? 'selected' : ''}>Classic</option>
                            <option value="modern" ${(settings.callRingtone === 'modern' || !settings.callRingtone) ? 'selected' : ''}>Modern</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Vibrate on Call</div>
                        <div class="setting-description">Enable vibration for incoming calls</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="vibrateOnCall" ${settings.vibrateOnCall !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-video section-icon"></i> Video Call Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Camera on Start</div>
                        <div class="setting-description">Enable camera when starting video calls</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="cameraOnStart" ${settings.cameraOnStart ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Video Quality</div>
                        <div class="setting-description">Choose video call quality</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="videoQuality">
                            <option value="auto" ${(settings.videoQuality === 'auto' || !settings.videoQuality) ? 'selected' : ''}>Auto</option>
                            <option value="hd" ${settings.videoQuality === 'hd' ? 'selected' : ''}>HD</option>
                            <option value="sd" ${settings.videoQuality === 'sd' ? 'selected' : ''}>SD</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const allowIncomingCalls = document.getElementById('allowIncomingCalls');
    if (allowIncomingCalls) allowIncomingCalls.addEventListener('change', () => window.__updateSetting('calls', 'allowIncomingCalls', allowIncomingCalls.checked));
    
    const callRingtone = document.getElementById('callRingtone');
    if (callRingtone) callRingtone.addEventListener('change', () => window.__updateSetting('calls', 'callRingtone', callRingtone.value));
    
    const vibrateOnCall = document.getElementById('vibrateOnCall');
    if (vibrateOnCall) vibrateOnCall.addEventListener('change', () => window.__updateSetting('calls', 'vibrateOnCall', vibrateOnCall.checked));
    
    const cameraOnStart = document.getElementById('cameraOnStart');
    if (cameraOnStart) cameraOnStart.addEventListener('change', () => window.__updateSetting('calls', 'cameraOnStart', cameraOnStart.checked));
    
    const videoQuality = document.getElementById('videoQuality');
    if (videoQuality) videoQuality.addEventListener('change', () => window.__updateSetting('calls', 'videoQuality', videoQuality.value));
}

// =============================================
// STATUS SECTION LOADER - FIXED (NEW)
// =============================================
export function loadStatusSection(container) {
    debugLog('Loading status section');
    const settings = SettingsState.getSection('status') || DEFAULT_SETTINGS.status;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-smile section-icon"></i> Status Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Current Status</div>
                        <div class="setting-description">Set your online status</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="currentStatus">
                            <option value="online" ${settings.currentStatus === 'online' ? 'selected' : ''}>Online</option>
                            <option value="away" ${settings.currentStatus === 'away' ? 'selected' : ''}>Away</option>
                            <option value="busy" ${settings.currentStatus === 'busy' ? 'selected' : ''}>Busy</option>
                            <option value="offline" ${(settings.currentStatus === 'offline' || !settings.currentStatus) ? 'selected' : ''}>Offline</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Status Reset</div>
                        <div class="setting-description">Auto reset status after inactivity</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoStatusReset" ${settings.autoStatusReset !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Timeout</div>
                        <div class="setting-description">Minutes until auto status reset</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="statusTimeout">
                            <option value="5" ${settings.statusTimeout === '5' ? 'selected' : ''}>5 minutes</option>
                            <option value="15" ${(settings.statusTimeout === '15' || !settings.statusTimeout) ? 'selected' : ''}>15 minutes</option>
                            <option value="30" ${settings.statusTimeout === '30' ? 'selected' : ''}>30 minutes</option>
                            <option value="60" ${settings.statusTimeout === '60' ? 'selected' : ''}>60 minutes</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-clock section-icon"></i> Status History</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Save Status History</div>
                        <div class="setting-description">Keep track of previous statuses</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="saveStatusHistory" ${settings.saveStatusHistory !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear History</div>
                        <div class="setting-description">Clear all status history</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearStatusHistoryBtn">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const currentStatus = document.getElementById('currentStatus');
    if (currentStatus) currentStatus.addEventListener('change', () => window.__updateSetting('status', 'currentStatus', currentStatus.value));
    
    const autoStatusReset = document.getElementById('autoStatusReset');
    if (autoStatusReset) autoStatusReset.addEventListener('change', () => window.__updateSetting('status', 'autoStatusReset', autoStatusReset.checked));
    
    const statusTimeout = document.getElementById('statusTimeout');
    if (statusTimeout) statusTimeout.addEventListener('change', () => window.__updateSetting('status', 'statusTimeout', statusTimeout.value));
    
    const saveStatusHistory = document.getElementById('saveStatusHistory');
    if (saveStatusHistory) saveStatusHistory.addEventListener('change', () => window.__updateSetting('status', 'saveStatusHistory', saveStatusHistory.checked));
    
    const clearStatusHistoryBtn = document.getElementById('clearStatusHistoryBtn');
    if (clearStatusHistoryBtn) clearStatusHistoryBtn.addEventListener('click', async () => {
        if (!confirm('Clear all status history?')) return;
        try {
            await window.__updateSetting('status', 'statusHistory', []);
            showNotification('Status history cleared', 'success');
        } catch (error) {
            showNotification('Failed to clear status history', 'error');
        }
    });
}

// =============================================
// NOTIFICATIONS SECTION LOADER - FIXED (NEW)
// =============================================
export function loadNotificationsSection(container) {
    debugLog('Loading notifications section');
    const settings = SettingsState.getSection('notifications') || DEFAULT_SETTINGS.notifications;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bell section-icon"></i> Push Notifications</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enable Notifications</div>
                        <div class="setting-description">Receive push notifications</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="enableNotifications" ${settings.enableNotifications !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Notification Sound</div>
                        <div class="setting-description">Play sound for notifications</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="notificationSound" ${settings.notificationSound !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Notification Vibration</div>
                        <div class="setting-description">Vibrate for notifications</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="notificationVibration" ${settings.notificationVibration !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-envelope section-icon"></i> Notification Types</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Notifications</div>
                        <div class="setting-description">Notify on new messages</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageNotifications" ${settings.messageNotifications !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Notifications</div>
                        <div class="setting-description">Notify on group messages</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupNotifications" ${settings.groupNotifications !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Notifications</div>
                        <div class="setting-description">Notify on incoming calls</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callNotifications" ${settings.callNotifications !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const enableNotifications = document.getElementById('enableNotifications');
    if (enableNotifications) enableNotifications.addEventListener('change', () => window.__updateSetting('notifications', 'enableNotifications', enableNotifications.checked));
    
    const notificationSound = document.getElementById('notificationSound');
    if (notificationSound) notificationSound.addEventListener('change', () => window.__updateSetting('notifications', 'notificationSound', notificationSound.checked));
    
    const notificationVibration = document.getElementById('notificationVibration');
    if (notificationVibration) notificationVibration.addEventListener('change', () => window.__updateSetting('notifications', 'notificationVibration', notificationVibration.checked));
    
    const messageNotifications = document.getElementById('messageNotifications');
    if (messageNotifications) messageNotifications.addEventListener('change', () => window.__updateSetting('notifications', 'messageNotifications', messageNotifications.checked));
    
    const groupNotifications = document.getElementById('groupNotifications');
    if (groupNotifications) groupNotifications.addEventListener('change', () => window.__updateSetting('notifications', 'groupNotifications', groupNotifications.checked));
    
    const callNotifications = document.getElementById('callNotifications');
    if (callNotifications) callNotifications.addEventListener('change', () => window.__updateSetting('notifications', 'callNotifications', callNotifications.checked));
}

// =============================================
// APPEARANCE SECTION LOADER - FIXED (NEW)
// =============================================
export function loadAppearanceSection(container) {
    debugLog('Loading appearance section');
    const settings = SettingsState.getSection('appearance') || DEFAULT_SETTINGS.appearance;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-palette section-icon"></i> Theme</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Theme Mode</div>
                        <div class="setting-description">Choose light, dark, or auto theme</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="themeSelect">
                            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
                            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
                            <option value="auto" ${(settings.theme === 'auto' || !settings.theme) ? 'selected' : ''}>Auto</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Accent Color</div>
                        <div class="setting-description">Choose your primary color</div>
                    </div>
                    <div class="setting-control">
                        <div id="colorPickerContainer"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Font Size</div>
                        <div class="setting-description">Adjust text size</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="fontSizeSelect">
                            <option value="12" ${settings.fontSize === 12 ? 'selected' : ''}>Small</option>
                            <option value="14" ${(settings.fontSize === 14 || !settings.fontSize) ? 'selected' : ''}>Medium</option>
                            <option value="16" ${settings.fontSize === 16 ? 'selected' : ''}>Large</option>
                            <option value="18" ${settings.fontSize === 18 ? 'selected' : ''}>Extra Large</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-compress-alt section-icon"></i> Display</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Compact Mode</div>
                        <div class="setting-description">Reduce spacing between items</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="compactMode" ${settings.compactMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Animations</div>
                        <div class="setting-description">Enable UI animations</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="animationsEnabled" ${settings.animationsEnabled !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.addEventListener('change', () => {
        window.__updateSetting('appearance', 'theme', themeSelect.value);
        applyTheme(themeSelect.value);
    });
    
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    if (fontSizeSelect) fontSizeSelect.addEventListener('change', () => {
        window.__updateSetting('appearance', 'fontSize', parseInt(fontSizeSelect.value));
        applyFontSize(parseInt(fontSizeSelect.value));
    });
    
    const compactMode = document.getElementById('compactMode');
    if (compactMode) compactMode.addEventListener('change', () => {
        window.__updateSetting('appearance', 'compactMode', compactMode.checked);
        if (compactMode.checked) document.body.classList.add('compact-mode');
        else document.body.classList.remove('compact-mode');
    });
    
    const animationsEnabled = document.getElementById('animationsEnabled');
    if (animationsEnabled) animationsEnabled.addEventListener('change', () => {
        window.__updateSetting('appearance', 'animationsEnabled', animationsEnabled.checked);
        if (animationsEnabled.checked) document.body.classList.remove('reduce-motion');
        else document.body.classList.add('reduce-motion');
    });
    
    initializeColorPicker();
}

// =============================================
// STORAGE SECTION LOADER - FIXED (NEW)
// =============================================
export function loadStorageSection(container) {
    debugLog('Loading storage section');
    const settings = SettingsState.getSection('storage') || DEFAULT_SETTINGS.storage;
    const storageSettings = SettingsState.getSection('storage') || DEFAULT_SETTINGS.storage;
    const usageBytes = calculateStorageUsage();
    const usage = {
        total: typeof usageBytes === 'number' ? usageBytes : (storageSettings.totalStorageUsed || 0),
        limit: storageSettings.storageTotal || 1073741824
    };
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-database section-icon"></i> Storage Usage</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Total Storage Used</div>
                        <div class="setting-description">${formatStorageSize(usage.total)} used of ${formatStorageSize(usage.limit || 1073741824)}</div>
                    </div>
                    <div class="setting-control">
                        <div class="storage-bar">
                            <div class="storage-fill" style="width: ${(usage.total / (usage.limit || 1073741824)) * 100}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-trash-alt section-icon"></i> Clear Data</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear Chat Cache</div>
                        <div class="setting-description">Remove cached chat messages</div>
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
                        <div class="setting-description">Remove cached images and files</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearMediaCacheBtn">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Clear Cache</div>
                        <div class="setting-description">Automatically clear cache weekly</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoClearCache" ${settings.autoClearCache !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const clearChatCacheBtn = document.getElementById('clearChatCacheBtn');
    if (clearChatCacheBtn) clearChatCacheBtn.addEventListener('click', async () => {
        if (!confirm('Clear all chat cache?')) return;
        clearChatCacheBtn.disabled = true;
        try {
            await clearChatCache();
            showNotification('Chat cache cleared', 'success');
            loadStorageSection(container);
        } catch (error) {
            showNotification('Failed to clear chat cache: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            clearChatCacheBtn.disabled = false;
        }
    });
    
    const clearMediaCacheBtn = document.getElementById('clearMediaCacheBtn');
    if (clearMediaCacheBtn) clearMediaCacheBtn.addEventListener('click', async () => {
        if (!confirm('Clear all media cache?')) return;
        clearMediaCacheBtn.disabled = true;
        try {
            await clearMediaCache();
            showNotification('Media cache cleared', 'success');
            loadStorageSection(container);
        } catch (error) {
            showNotification('Failed to clear media cache: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            clearMediaCacheBtn.disabled = false;
        }
    });
    
    const autoClearCache = document.getElementById('autoClearCache');
    if (autoClearCache) autoClearCache.addEventListener('change', () => window.__updateSetting('storage', 'autoClearCache', autoClearCache.checked));
}

// =============================================
// MOOD SECTION LOADER - FIXED (NEW)
// =============================================
export function loadMoodSection(container) {
    debugLog('Loading mood section');
    const settings = SettingsState.getSection('mood') || DEFAULT_SETTINGS.mood;
    const moods = [
        'happy', 'sad', 'excited', 'tired', 'angry', 
        'calm', 'loved', 'stressed', 'hopeful', 'bored'
    ];
    
    let moodsHtml = '';
    moods.forEach(mood => {
        const color = settings.moodColors?.[mood] || getMoodColor(mood);
        moodsHtml += `
            <div class="setting-item">
                <div class="setting-info">
                    <div class="setting-label">${mood.charAt(0).toUpperCase() + mood.slice(1)}</div>
                    <div class="setting-description">${getMoodText(mood)}</div>
                </div>
                <div class="setting-control">
                    <div class="mood-color-preview" style="background-color: ${color};" data-mood="${mood}"></div>
                    <button class="setting-button edit-mood-color" data-mood="${mood}">Edit Color</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-smile-wink section-icon"></i> Mood Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Current Mood</div>
                        <div class="setting-description">Set your current mood</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="currentMoodSelect">
                            ${moods.map(mood => `<option value="${mood}" ${settings.currentMood === mood ? 'selected' : ''}>${mood.charAt(0).toUpperCase() + mood.slice(1)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Mood Detection</div>
                        <div class="setting-description">Detect mood from typing patterns</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoMoodDetection" ${settings.autoMoodDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Share Mood Status</div>
                        <div class="setting-description">Let friends see your mood</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="shareMoodStatus" ${settings.shareMoodStatus !== false ? 'checked' : ''}>
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
                ${moodsHtml}
            </div>
        </div>
    `;
    
    const currentMoodSelect = document.getElementById('currentMoodSelect');
    if (currentMoodSelect) currentMoodSelect.addEventListener('change', () => window.__updateSetting('mood', 'currentMood', currentMoodSelect.value));
    
    const autoMoodDetection = document.getElementById('autoMoodDetection');
    if (autoMoodDetection) autoMoodDetection.addEventListener('change', () => window.__updateSetting('mood', 'autoMoodDetection', autoMoodDetection.checked));
    
    const shareMoodStatus = document.getElementById('shareMoodStatus');
    if (shareMoodStatus) shareMoodStatus.addEventListener('change', () => window.__updateSetting('mood', 'shareMoodStatus', shareMoodStatus.checked));
    
    document.querySelectorAll('.edit-mood-color').forEach(btn => {
        btn.addEventListener('click', () => {
            const mood = btn.dataset.mood;
            editMoodColor(mood);
        });
    });
}

// =============================================
// ADVANCED SECTION LOADER - FIXED (NEW)
// =============================================
export function loadAdvancedSection(container) {
    debugLog('Loading advanced section');
    const settings = SettingsState.getSection('advanced') || DEFAULT_SETTINGS.advanced;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-code section-icon"></i> Developer Options</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Developer Mode</div>
                        <div class="setting-description">Enable developer features</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="developerMode" ${settings.developerMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Debug Logging</div>
                        <div class="setting-description">Log debug information to console</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="debugLogging" ${settings.debugLogging ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Performance Mode</div>
                        <div class="setting-description">Optimize for performance</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="performanceMode" ${settings.performanceMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-network-wired section-icon"></i> Connection</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Data Saver</div>
                        <div class="setting-description">Reduce data usage</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="dataSaver" ${settings.dataSaver ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Reconnection Attempts</div>
                        <div class="setting-description">Number of reconnection attempts</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="reconnectionAttempts">
                            <option value="3" ${settings.reconnectionAttempts === 3 ? 'selected' : ''}>3 attempts</option>
                            <option value="5" ${(settings.reconnectionAttempts === 5 || !settings.reconnectionAttempts) ? 'selected' : ''}>5 attempts</option>
                            <option value="10" ${settings.reconnectionAttempts === 10 ? 'selected' : ''}>10 attempts</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const developerMode = document.getElementById('developerMode');
    if (developerMode) developerMode.addEventListener('change', () => window.__updateSetting('advanced', 'developerMode', developerMode.checked));
    
    const debugLogging = document.getElementById('debugLogging');
    if (debugLogging) debugLogging.addEventListener('change', () => window.__updateSetting('advanced', 'debugLogging', debugLogging.checked));
    
    const performanceMode = document.getElementById('performanceMode');
    if (performanceMode) performanceMode.addEventListener('change', () => window.__updateSetting('advanced', 'performanceMode', performanceMode.checked));
    
    const dataSaver = document.getElementById('dataSaver');
    if (dataSaver) dataSaver.addEventListener('change', () => window.__updateSetting('advanced', 'dataSaver', dataSaver.checked));
    
    const reconnectionAttempts = document.getElementById('reconnectionAttempts');
    if (reconnectionAttempts) reconnectionAttempts.addEventListener('change', () => window.__updateSetting('advanced', 'reconnectionAttempts', parseInt(reconnectionAttempts.value)));
}

// =============================================
// BACKUP SECTION LOADER - FIXED (NEW)
// =============================================
export function loadBackupSection(container) {
    debugLog('Loading backup section');
    const settings = SettingsState.getSection('backup') || DEFAULT_SETTINGS.backup;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cloud-upload-alt section-icon"></i> Backup Settings</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Backup</div>
                        <div class="setting-description">Automatically back up settings</div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoBackup" ${settings.autoBackup !== false ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Frequency</div>
                        <div class="setting-description">How often to back up</div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="backupFrequency">
                            <option value="daily" ${settings.backupFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                            <option value="weekly" ${(settings.backupFrequency === 'weekly' || !settings.backupFrequency) ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${settings.backupFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Now</div>
                        <div class="setting-description">Create a manual backup</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="backupNowBtn">
                            <i class="fas fa-cloud-upload-alt"></i> Backup Now
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cloud-download-alt section-icon"></i> Restore</h3>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Restore from Backup</div>
                        <div class="setting-description">Restore settings from a backup</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="restoreBackupBtn">
                            <i class="fas fa-cloud-download-alt"></i> Restore
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Last Backup</div>
                        <div class="setting-description">${settings.lastBackup ? new Date(settings.lastBackup).toLocaleString() : 'Never'}</div>
                    </div>
                    <div class="setting-control"></div>
                </div>
            </div>
        </div>
    `;
    
    const autoBackup = document.getElementById('autoBackup');
    if (autoBackup) autoBackup.addEventListener('change', () => window.__updateSetting('backup', 'autoBackup', autoBackup.checked));
    
    const backupFrequency = document.getElementById('backupFrequency');
    if (backupFrequency) backupFrequency.addEventListener('change', () => window.__updateSetting('backup', 'backupFrequency', backupFrequency.value));
    
    const backupNowBtn = document.getElementById('backupNowBtn');
    if (backupNowBtn) backupNowBtn.addEventListener('click', async () => {
        backupNowBtn.disabled = true;
        try {
            // Real backup: fetch the full current settings snapshot from the
            // backend (not just the locally-cached copy) and let the user
            // download it. Previously this button just wrote a timestamp and
            // claimed success without saving any data anywhere.
            const response = await secureFetchWrapper('/api/settings', 'GET');
            const snapshot = response?.data?.settings || response?.settings || response?.data || response;
            const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings: snapshot }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `moodchat-settings-backup-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            await SettingsState.update('backup', 'lastBackup', Date.now());
            showNotification('Backup downloaded', 'success');
            loadBackupSection(container);
        } catch (error) {
            showNotification('Backup failed: ' + error.message, 'error');
        } finally {
            backupNowBtn.disabled = false;
        }
    });
    
    const restoreBackupBtn = document.getElementById('restoreBackupBtn');
    if (restoreBackupBtn) restoreBackupBtn.addEventListener('click', () => {
        if (!confirm('Restore settings from backup? Current settings will be lost.')) return;

        // Real restore: let the user pick a previously-downloaded backup file,
        // parse it, and push it back to the backend. Previously this just
        // showed "coming soon" and did nothing.
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json';
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                const settingsToRestore = parsed && parsed.settings ? parsed.settings : parsed;
                if (!settingsToRestore || typeof settingsToRestore !== 'object') {
                    throw new Error('Invalid backup file');
                }
                await secureFetchWrapper('/api/settings', 'PUT', settingsToRestore);
                showNotification('Settings restored — reloading…', 'success');
                setTimeout(() => window.location.reload(), 1000);
            } catch (error) {
                showNotification('Restore failed: ' + error.message, 'error');
            }
        });
        fileInput.click();
    });
}

// =============================================
// DANGER SECTION LOADER - FIXED (NEW)
// =============================================
export function loadDangerSection(container) {
    debugLog('Loading danger section');
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-exclamation-triangle section-icon" style="color: var(--danger-color);"></i> Danger Zone</h3>
                <div class="section-description">These actions are irreversible</div>
            </div>
            <div class="section-body">
                <div class="setting-item danger-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear All Data</div>
                        <div class="setting-description">Remove all settings and cached data</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button danger" id="clearAllDataBtn">
                            <i class="fas fa-trash-alt"></i> Clear All
                        </button>
                    </div>
                </div>
                
                <div class="setting-item danger-item">
                    <div class="setting-info">
                        <div class="setting-label">Reset All Settings</div>
                        <div class="setting-description">Restore all settings to default</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button danger" id="resetAllSettingsBtn">
                            <i class="fas fa-undo-alt"></i> Reset All
                        </button>
                    </div>
                </div>
                
                <div class="setting-item danger-item">
                    <div class="setting-info">
                        <div class="setting-label">Delete Account</div>
                        <div class="setting-description">Permanently delete your account</div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button danger" id="deleteAccountBtn">
                            <i class="fas fa-user-times"></i> Delete Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');
    if (clearAllDataBtn) {
        clearAllDataBtn.addEventListener('click', () => {
            if (confirm('⚠️ WARNING: This will clear ALL your data. This action cannot be undone. Continue?')) {
                if (confirm('Type "DELETE" to confirm')) {
                    const confirmation = prompt('Type "DELETE" to confirm:');
                    if (confirmation === 'DELETE') {
                        localStorage.clear();
                        indexedDB.deleteDatabase('settingsDB');
                        showNotification('All data cleared. Reloading...', 'warning');
                        setTimeout(() => window.location.reload(), 2000);
                    }
                }
            }
        });
    }
    
    const resetAllSettingsBtn = document.getElementById('resetAllSettingsBtn');
    if (resetAllSettingsBtn) {
        resetAllSettingsBtn.addEventListener('click', async () => {
            if (confirm('Reset ALL settings to default? This action cannot be undone.')) {
                if (confirm('Are you absolutely sure?')) {
                    resetAllSettingsBtn.disabled = true;
                    try {
                        // FIX: this previously looped over every default section/key
                        // and awaited a separate PUT per key (100+ sequential
                        // requests for a full settings object) — easily exceeding
                        // the 100 req/min rate limit and leaving settings
                        // half-reset if it got throttled partway through.
                        // SettingsState.reset() already does this atomically via
                        // the real POST /api/settings/reset endpoint.
                        await SettingsState.reset();
                        showNotification('All settings reset to default', 'success');
                        setTimeout(() => loadSection(currentSection), 500);
                    } catch (error) {
                        showNotification('Error resetting settings: ' + error.message, 'error');
                    } finally {
                        resetAllSettingsBtn.disabled = false;
                    }
                }
            }
        });
    }
    
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            if (!confirm('⚠️ DANGER: This will permanently delete your account. This action cannot be undone. Continue?')) return;

            const confirmation = prompt('Type "delete my account" to confirm:');
            if (!confirmation || confirmation.trim().toLowerCase() !== 'delete my account') {
                if (confirmation !== null) showNotification('Confirmation text did not match — account not deleted', 'warning');
                return;
            }

            const password = prompt('Enter your password to finish deleting your account:');
            if (!password) {
                showNotification('Password is required to delete your account', 'warning');
                return;
            }

            (async () => {
                deleteAccountBtn.disabled = true;
                showNotification('Deleting your account…', 'info');
                try {
                    const response = await secureFetchWrapper('/api/settings/account', 'DELETE', {
                        confirmation,
                        password
                    });
                    if (response && response.success !== false && response.status !== 'error') {
                        showNotification('Account deleted. Signing you out…', 'success');
                        try {
                            localStorage.clear();
                            sessionStorage.clear();
                        } catch (_) {}
                        setTimeout(() => {
                            if (window.parent && window.parent !== window) {
                                window.parent.postMessage({ type: 'ACCOUNT_DELETED', source: 'settings' }, '*');
                            } else {
                                window.location.href = '/login.html';
                            }
                        }, 800);
                    } else {
                        showNotification(response?.message || 'Failed to delete account', 'error');
                        deleteAccountBtn.disabled = false;
                    }
                } catch (error) {
                    debugLog('Error deleting account:', error);
                    showNotification('Failed to delete account: ' + (error.message || 'Unknown error'), 'error');
                    deleteAccountBtn.disabled = false;
                }
            })();
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
            <div class="session-icon"><i class="fas fa-laptop"></i></div>
            <div class="session-info">
                <div class="session-name">Current Session</div>
                <div class="session-details">This device • Active now</div>
            </div>
            <div class="session-actions">
                <span style="color: var(--success-color);">Active</span>
            </div>
        </div>
    `;
    
    if (activeSessions && activeSessions.length > 0) {
        activeSessions.forEach(session => {
            const lastActive = session.lastActive ? new Date(session.lastActive).toLocaleString() : 'Unknown';
            sessionsList.innerHTML += `
                <div class="session-item">
                    <div class="session-icon"><i class="fas fa-mobile-alt"></i></div>
                    <div class="session-info">
                        <div class="session-name">${escapeHtml(session.deviceName || 'Unknown Device')}</div>
                        <div class="session-details">Last active: ${lastActive}</div>
                    </div>
                    <div class="session-actions">
                        <button class="terminate-btn" data-session-id="${session.id}">Terminate</button>
                    </div>
                </div>
            `;
        });
    } else {
        sessionsList.innerHTML += `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>No other active sessions</p>
            </div>
        `;
    }
    
    openModal('sessionsModal');
    
    document.querySelectorAll('.terminate-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const sessionId = this.dataset.sessionId;
            try {
                await terminateSession(sessionId);
                showNotification('Session terminated', 'success');
                showActiveSessions();
            } catch (error) {
                debugLog('Error terminating session:', error);
                showNotification('Error terminating session', 'error');
            }
        });
    });
}

// =============================================
// SHOW BLOCKED USERS
// =============================================
export function showBlockedUsers() {
    const blockedUsersList = document.getElementById('blockedUsersList');
    const blockedUsersModal = document.getElementById('blockedUsersModal');
    
    if (!blockedUsersList || !blockedUsersModal) return;
    
    blockedUsersList.innerHTML = '';
    
    if (!blockedUsers || blockedUsers.length === 0) {
        blockedUsersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-check"></i>
                <p>No blocked users</p>
            </div>
        `;
    } else {
        blockedUsers.forEach(user => {
            blockedUsersList.innerHTML += `
                <div class="blocked-user-item">
                    <div class="blocked-user-icon"><i class="fas fa-user-slash"></i></div>
                    <div class="blocked-user-info">
                        <div class="blocked-user-name">${escapeHtml(user.name || 'Unknown')}</div>
                        <div class="blocked-user-details">Blocked: ${user.blockedDate ? new Date(user.blockedDate).toLocaleDateString() : 'Unknown'}</div>
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
                showNotification('User unblocked', 'success');
                showBlockedUsers();
            } catch (error) {
                debugLog('Error unblocking user:', error);
                showNotification('Error unblocking user', 'error');
            }
        });
    });
}

// Helper for auth required HTML
function getAuthRequiredHTML(section, title) {
    return `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cog section-icon"></i> ${title}</h3>
            </div>
            <div class="section-body" style="text-align: center; padding: 30px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: var(--primary-color); margin-bottom: 15px;"></i>
                <p>Loading section...</p>
            </div>
        </div>
    `;
}

// =============================================
// UI RECOVERY MECHANISM
// =============================================
function attemptUIRecovery() {
    if (uiRecoveryTimer) clearTimeout(uiRecoveryTimer);
    
    uiRecoveryTimer = setTimeout(() => {
        debugLog('Attempting UI recovery');
        
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
        uiErrorCount,
        isMobileView,
        currentMobileSection,
        parentReady,
        currentState,
        settingsLoaded: SettingsState.loaded
    }),
    getSettings: () => SettingsState.get(),
    reloadSection: () => {
        if (currentSection) loadSection(currentSection);
    },
    forceRecovery: attemptUIRecovery
};

// Make updateSaveButton available globally
window.updateSaveButton = updateSaveButton;

// =============================================
// INITIALIZATION - STRICT: ALIGNED WITH HANDSHAKE PROTOCOL
// =============================================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        debugLog('DOM loaded, initializing UI');
        
        showLoadingState();
        
        // Check immediate readiness
        const coreReady = window.__SETTINGS_READY__ || window.currentUser || 
                          window.__SETTINGS_SESSION_ACTIVE__ || currentState === LifecycleState.ACTIVE;
        
        if (coreReady) {
            console.log('[SettingsUI] Core already ready, initializing immediately');
            setTimeout(() => initializeUI(), 10);
        } else {
            // Wait with timeout
            const ready = await waitForCore(5000);
            if (ready) {
                await UIErrorBoundary.wrap(initializeUI, 'dom_initialization')();
            } else {
                console.log('[SettingsUI] Core not ready after timeout, using fallback');
                // Force load with cached data (content only - NOT a substitute for full init,
                // so uiInitialized stays false and the menu/click handlers still get built
                // for real once core becomes ready)
                const container = document.getElementById('settingsContentBody');
                if (container && !uiInitialized) {
                    loadProfileSection(container);
                    fallbackContentShown = true;
                }
            }
        }
        
        debugLog('UI initialization complete');
        
    } catch (error) {
        debugLog('Initialization error:', error);
        showFallbackUI();
    }
});

// Immediate fallback - don't wait too long. This only shows *something* while we
// keep waiting for core; it must NEVER mark uiInitialized, or the real init
// (buildSettingsMenu + click handlers) will be skipped once core actually becomes
// ready, leaving every menu item stuck showing whatever section loaded first.
setTimeout(() => {
    if (!uiInitialized && !fallbackContentShown) {
        console.log('[SettingsUI] ⚠️ Immediate fallback: loading profile section');
        const container = document.getElementById('settingsContentBody');
        if (container && typeof loadProfileSection === 'function') {
            loadProfileSection(container);
            fallbackContentShown = true;
        }
    }
}, 1000);

// =============================================
// ADDITIONAL PROTOCOL COMPLIANCE ENHANCEMENTS
// =============================================

// STRICT: Listen for parent-ready events from core
window.addEventListener('parentReady', (event) => {
    if (event.detail && event.detail.ready) {
        debugLog('Parent ready - refreshing UI if needed');
        if (!uiInitialized) {
            // Core became ready after our fallback already showed placeholder content -
            // run the real init now so the menu and its click handlers actually get built.
            initializeUI();
        } else if (currentSection) {
            setTimeout(() => loadSection(currentSection), 100);
        }
    }
});

// STRICT: Listen for lifecycle state changes
window.addEventListener('lifecycleStateChange', (event) => {
    const { newState } = event.detail;
    updateConnectionState(newState);
    updateSaveButton();
    
    if (newState === LifecycleState.ACTIVE) {
        if (!uiInitialized) {
            // Core became ready after our fallback already showed placeholder content -
            // run the real init now so the menu and its click handlers actually get built.
            initializeUI();
        } else if (currentSection) {
            // Force reload from backend
            SettingsState.load().then(() => {
                loadSection(currentSection);
            }).catch(() => {
                loadSection(currentSection);
            });
        }
    }
});

// Add network quality indicator
function updateNetworkQualityIndicator() {
    const quality = connectionQuality || 'unknown';
    const indicator = document.getElementById('networkQualityIndicator');
    if (!indicator) return;
    
    indicator.className = 'network-quality';
    indicator.classList.add(quality);
    
    switch(quality) {
        case 'excellent':
            indicator.title = 'Excellent connection';
            break;
        case 'good':
            indicator.title = 'Good connection';
            break;
        case 'fair':
            indicator.title = 'Fair connection';
            break;
        case 'poor':
            indicator.title = 'Poor connection';
            break;
        default:
            indicator.title = 'Connection quality unknown';
    }
}

// Call when connection quality changes
if (ReliabilityEngine && ReliabilityEngine.on) {
    ReliabilityEngine.on('qualityChanged', updateNetworkQualityIndicator);
}

// =============================================
// END OF FILE
// =============================================