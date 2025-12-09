<<<<<<< HEAD
// Wait for Firebase to be initialized
if (!window.firebase || !window.db) {
    console.log('⏳ Waiting for Firebase initialization...');
    
    const waitForFirebase = setInterval(() => {
        if (window.firebase && window.db) {
            clearInterval(waitForFirebase);
            console.log('✅ Firebase ready in call.js/groups.js/status.js');
            // Initialize your script here
        }
    }, 100);
} else {
    console.log('✅ Firebase already available');
    // Initialize your script here
}
// status.js - ADD AT THE VERY TOP
// Prevent duplicate declarations
if (window.statusScriptLoaded) {
    console.log('status.js already loaded');
    // Don't re-execute
    throw new Error('status.js already loaded');
}
window.statusScriptLoaded = true;

// Use existing variables if they already exist from chat.js
if (typeof closeStatusViewer !== 'undefined') {
    // Use existing variable
    console.log('Using closeStatusViewer from chat.js');
} else {
    // Define locally
    let closeStatusViewer = null;
    // ... rest of your code
}
// ==================== GLOBAL VARIABLES ====================
let videoEditor = null;
let audioRecorder = null;
let mediaStream = null;
let currentFilter = null;
let stickerLibrary = [];
let musicLibrary = [];
let quickStatusMode = false;
let locationBasedStatuses = new Map();
let oneTimeViewStatuses = new Set();
let statusSuggestions = [];
let automaticStatusTriggers = [];
let boomerangRecorder = null;
let voiceoverRecorder = null;
let draftCleanupInterval = null;
let statusExpirationInterval = null;
let currentStatusViewing = null;
let currentStatusIndex = 0;
let statusViewTimeout = null;
let currentRecording = null;
let cameraStream = null;
let videoRecorder = null;
let recordingChunks = [];
let isRecordingVideo = false;
let recordingStartTime = null;
let statusReactionPicker = null;
let currentEditingMedia = null;
let activeStatusTimers = new Map();
let statusPlaybackInstances = new Map();
let recordingTimerInterval = null;
let voiceRecordingTimerInterval = null;
let voiceRecorder = null;
let voiceRecordingStartTime = null;

// Viewers and Reactions management
let currentStatusViewers = [];
let currentStatusReactions = [];
let currentEnhancedModalStatusId = null;

// Media input elements
let statusImageInput = null;
let statusVideoInput = null;
let statusAudioInput = null;

// DOM elements cache
let domElements = {};

// Status drafts storage
let statusDrafts = [];
let statusHighlights = [];

// Current active statuses
let activeStatuses = [];
let myActiveStatuses = [];

// ==================== STATUS PREFERENCES ====================
const statusPreferences = {
    privacy: 'myContacts',
    perStatusPrivacy: true,
    mutedUsers: [],
    blockedFromViewing: [],
    hideFromUsers: [],
    contactsExcept: [],
    readReceipts: true,
    screenshotAlerts: true,
    contentBlur: false,
    showMusicInfo: true,
    muteAllUntil: null,
    allowReplies: true,
    autoDownload: true,
    saveToGallery: true,
    allowMentions: true,
    locationBased: false,
    quickStatusEnabled: true,
    forwardWithMessage: true,
    boomerangEnabled: true,
    portraitMode: false,
    greenScreenEnabled: false,
    voiceoverEnabled: true,
    drawingTools: true,
    textOverlay: true,
    filtersEnabled: true,
    stickersEnabled: true,
    directCamera: true,
    videoTrimDuration: 30,
    maxStatusDuration: 30,
    musicIntegration: true,
    voiceStatusEnabled: true,
    statusDisappearanceOptions: '24h',
    oneTimeView: false,
    customRingColors: false,
    businessCTAs: [],
    linkInBio: '',
    quickReplies: [],
    awayMessage: '',
    detailedAnalytics: false,
    e2eEncrypted: true,
    disableSaving: false,
    blockScreenshots: true,
    statusSuggestionsEnabled: true,
    automaticStatus: false,
    chatListIntegration: true,
    quickReplyNotification: true,
    shareToSocial: true,
    enableSearch: true,
    expiryOptions: ['24h', '12h', '6h', 'custom'],
    defaultExpiry: '24h',
    statusPrivacy: 'myContacts',
    canReply: 'myContacts',
    canReact: 'myContacts'
};

// ==================== STATUS DRAFT ====================
let statusDraft = {
    type: 'text',
    content: '',
    caption: '',
    background: 'default',
    font: 'default',
    color: '#000000',
    stickers: [],
    gifs: [],
    drawings: [],
    overlays: [],
    mentions: [],
    location: null,
    music: null,
    linkPreview: null,
    scheduleTime: null,
    privacy: 'myContacts',
    selectedContacts: [],
    hideFrom: [],
    exceptContacts: [],
    perStatusPrivacy: null,
    trimStart: 0,
    trimEnd: 30,
    filters: [],
    textOverlays: [],
    doodles: [],
    boomerang: false,
    portraitEffect: false,
    greenScreen: null,
    voiceover: null,
    viewOnce: false,
    customDuration: 86400,
    ringColor: null,
    shareComment: '',
    demographics: {},
    businessLink: '',
    quickReplyTemplate: null,
    awayMessageAuto: null,
    isAutomatic: false,
    triggerType: null,
    encrypted: true,
    mediaMetadata: {},
    editingHistory: [],
    draftId: null,
    createdAt: null,
    updatedAt: null,
    expiryOption: '24h',
    expiryTime: null,
    backgroundColor: '#667eea',
    allowReactions: true,
    viewerCount: 0,
    gifUrl: null,
    stickerId: null,
    locationName: null,
    locationCoordinates: null
};

// ==================== INITIALIZATION ====================

/**
 * Initialize Status System
 */
function initStatusSystem() {
    console.log('🚀 Initializing WhatsApp Status System...');
    
    try {
        // Check if user is logged in
        if (!currentUser || !currentUser.uid) {
            // Wait for DOM and Firebase
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌐 Status system loading...');
    
    // Wait for Firebase
    const checkFirebase = setInterval(() => {
        if (window.firebase && window.firebase.auth) {
            clearInterval(checkFirebase);
            
            // Listen for auth state
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    console.log('✅ User authenticated, initializing status system');
                    initStatusSystem();
                } else {
                    console.log('⏳ Waiting for user login...');
                    // Don't initialize yet
                }
            });
        }
    }, 500);
});
            return;
        }
        
        // Initialize user data
        initializeUserData();
        
        // Create UI elements if they don't exist
        createAllUIElements();
        
        // Cache DOM elements
        cacheDOMElements();
        
        // Setup all event listeners
        setupAllEventListeners();
        
        // Load initial data
        loadAllInitialData();
        
        // Start background services
        startBackgroundServices();
        
        console.log('✅ Status System initialized successfully');
        
    } catch (error) {
        console.error('❌ Error initializing Status System:', error);
        showToast('Error initializing status system', 'error');
    }
}

/**
 * Initialize when both DOM is ready AND Firebase is ready
 */
function initializeStatusSystem() {
    console.log('📱 Initializing Status System...');
    
    // Wait for both DOM ready and Firebase ready
    const checkReady = () => {
        // Check if DOM is ready
        if (document.readyState !== 'loading') {
            // Check if Firebase is ready
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                initStatusSystem();
                return true;
            } else if (window.firebaseReady) {
                initStatusSystem();
                return true;
            }
        }
        return false;
    };
    
    // Try immediately
    if (checkReady()) {
        return;
    }
    
    // Set up listeners
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📱 DOM loaded, checking Firebase...');
        
        if (checkReady()) {
            return;
        }
        
        // If Firebase not ready yet, wait for it
        const checkInterval = setInterval(() => {
            if (checkReady()) {
                clearInterval(checkInterval);
            }
        }, 500);
        
        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (typeof initStatusSystem === 'function') {
                // Try one last time
                if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                    initStatusSystem();
                } else {
                    console.error('❌ Firebase not loaded after timeout.');
                    showToast('Firebase initialization timeout. Please refresh.', 'error');
                }
            }
        }, 10000);
    });
}

// Start initialization
initializeStatusSystem();

console.log('✅ WhatsApp Status System module loaded');

/**
 * Initialize user data and setup all components
 */
async function initializeUserData() {
    try {
        console.log('👤 Loading user data...');
        
        // Load user document
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            currentUserData = userDoc.data();
            
            // Load saved preferences
            if (currentUserData.statusPreferences) {
                Object.assign(statusPreferences, currentUserData.statusPreferences);
            }
            
            // Load drafts
            if (currentUserData.statusDrafts) {
                statusDrafts = currentUserData.statusDrafts;
            }
            
            // Load highlights
            if (currentUserData.statusHighlights) {
                statusHighlights = currentUserData.statusHighlights;
            }
            
            // Load user status settings
            if (currentUserData.userStatusSettings) {
                Object.assign(statusPreferences, currentUserData.userStatusSettings);
            }
        } else {
            // Create user document
            await createUserDocument();
        }
        
        // Setup all system components
        setupCompleteSystem();
        
    } catch (error) {
        console.error('❌ Error initializing user data:', error);
        showToast('Error loading user data', 'error');
    }
}

/**
 * Create user document if it doesn't exist
 */
async function createUserDocument() {
    try {
        const userData = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'User',
            photoURL: currentUser.photoURL || '',
            email: currentUser.email || '',
            phoneNumber: currentUser.phoneNumber || '',
            statusPreferences: statusPreferences,
            statusDrafts: [],
            statusHighlights: [],
            friends: [],
            blockedUsers: [],
            statusCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            isBusiness: false,
            privacySettings: {
                statusVisibility: 'myContacts',
                allowMentions: true,
                allowReplies: true
            },
            userStatusSettings: {
                expiryOption: '24h',
                privacy: 'myContacts',
                canReply: 'myContacts',
                canReact: 'myContacts'
            }
        };
        
        await db.collection('users').doc(currentUser.uid).set(userData);
        currentUserData = userData;
        
        console.log('✅ User document created');
        
    } catch (error) {
        console.error('❌ Error creating user document:', error);
        throw error;
    }
}

/**
 * Setup complete status system
 */
function setupCompleteSystem() {
    console.log('🛠️ Setting up complete status system...');
    
    // 1. Create all UI elements
    createAllUIElements();
    
    // 2. Cache DOM elements
    cacheDOMElements();
    
    // 3. Setup all event listeners
    setupAllEventListeners();
    
    // 4. Load all data
    loadAllInitialData();
    
    // 5. Start background services
    startBackgroundServices();
    
    console.log('✅ Status system setup complete');
}

// ==================== UI CREATION ====================

/**
 * Create all necessary UI elements
 */
function createAllUIElements() {
    console.log('🎨 Creating all status UI elements...');
    
    // Main status container
    if (!document.getElementById('statusContainer')) {
        createStatusContainer();
    }
    
    // Status creation modal
    if (!document.getElementById('statusCreationModal')) {
        createStatusCreationModal();
    }
    
    // Status viewer modal
    if (!document.getElementById('statusModal')) {
        createStatusViewerModal();
    }
    
    // Viewers modal
    if (!document.getElementById('viewersModal')) {
        createViewersModal();
    }
    
    // Enhanced viewers modal
    if (!document.getElementById('enhancedViewersModal')) {
        createEnhancedViewersModal();
    }
    
    // Reaction picker
    if (!document.getElementById('reactionPicker')) {
        createReactionPicker();
    }
    
    // Status expiry modal
    if (!document.getElementById('statusExpiryModal')) {
        createStatusExpiryModal();
    }
    
    console.log('✅ All UI elements created');
}

/**
 * Create main status container
 */
function createStatusContainer() {
    const statusContainer = document.createElement('div');
    statusContainer.id = 'statusContainer';
    statusContainer.className = 'status-container';
    statusContainer.innerHTML = `
        <div class="status-header">
            <div class="status-header-left">
                <h2><i class="fas fa-circle"></i> Status</h2>
                <div class="status-indicator">
                    <span class="status-count" id="activeStatusCount">0</span> active
                </div>
            </div>
            <div class="status-header-right">
                <button id="myStatus" class="btn-primary btn-create-status">
                    <i class="fas fa-plus"></i> New Status
                </button>
                <div class="status-actions-dropdown">
                    <button class="btn-icon" id="statusMenuBtn">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="dropdown-menu" id="statusMenu">
                        <button class="dropdown-item" id="searchStatusBtn">
                            <i class="fas fa-search"></i> Search Statuses
                        </button>
                        <button class="dropdown-item" id="muteAllStatusesBtn">
                            <i class="fas fa-bell-slash"></i> Mute All
                        </button>
                        <button class="dropdown-item" id="viewArchivedBtn">
                            <i class="fas fa-archive"></i> Archived
                        </button>
                        <button class="dropdown-item" id="statusSettingsBtn">
                            <i class="fas fa-cog"></i> Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="status-tabs">
            <button class="status-tab active" data-tab="updates">
                <i class="fas fa-eye"></i> Updates
            </button>
            <button class="status-tab" data-tab="myStatusTab">
                <i class="fas fa-user-circle"></i> My Status
            </button>
            <button class="status-tab" data-tab="highlights">
                <i class="fas fa-star"></i> Highlights
            </button>
        </div>
        
        <div class="status-content">
            <div id="updatesTab" class="status-tab-content active">
                <div class="status-updates" id="statusUpdates">
                    <div class="loading-status">
                        <div class="spinner"></div>
                        <p>Loading status updates...</p>
                    </div>
                </div>
            </div>
            
            <div id="myStatusTab" class="status-tab-content">
                <div class="my-status-section">
                    <div class="my-status-header">
                        <h3>My Status</h3>
                        <button id="quickStatusBtn" class="btn-secondary">
                            <i class="fas fa-camera"></i> Quick Status
                        </button>
                    </div>
                    <div class="my-status-list" id="myStatusList">
                        <div class="empty-state">
                            <i class="fas fa-camera"></i>
                            <h4>No status yet</h4>
                            <p>Share a photo, video, or text update</p>
                            <button id="addFirstStatusBtn" class="btn-primary">Create Status</button>
                        </div>
                    </div>
                    
                    <div class="my-drafts-section">
                        <h4>Drafts</h4>
                        <div class="drafts-list" id="draftsList">
                            <p class="no-drafts">No drafts</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="highlightsTab" class="status-tab-content">
                <div class="highlights-section" id="highlightsSection">
                    <div class="empty-state">
                        <i class="fas fa-star"></i>
                        <h4>No highlights yet</h4>
                        <p>Add your favorite statuses to highlights</p>
                        <button id="createHighlightBtn" class="btn-primary">Create Highlight</button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Status Ring Indicator -->
        <div class="status-ring-container">
            <div class="status-ring" id="statusRing">
                <div class="status-ring-inner"></div>
            </div>
        </div>
    `;
    
    // Add to main content area
    const mainContent = document.querySelector('.main-content') || document.body;
    mainContent.appendChild(statusContainer);
}

/**
 * Create status creation modal with all required elements
 */
function createStatusCreationModal() {
    const modal = document.createElement('div');
    modal.id = 'statusCreationModal';
    modal.className = 'status-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeStatusCreation"></div>
        <div class="modal-content status-creation-content">
            <div class="modal-header">
                <h3>Create Status</h3>
                <button class="modal-close" id="closeStatusCreationBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="status-options" id="statusOptions">
                <button class="status-option active" data-type="text">
                    <i class="fas fa-font"></i>
                    <span>Text</span>
                </button>
                <button class="status-option" data-type="image">
                    <i class="fas fa-image"></i>
                    <span>Photo</span>
                </button>
                <button class="status-option" data-type="video">
                    <i class="fas fa-video"></i>
                    <span>Video</span>
                </button>
                <button class="status-option" data-type="audio">
                    <i class="fas fa-microphone"></i>
                    <span>Audio</span>
                </button>
                <button class="status-option" data-type="emoji">
                    <i class="fas fa-smile"></i>
                    <span>Emoji</span>
                </button>
                <button class="status-option" data-type="gif">
                    <i class="fas fa-film"></i>
                    <span>GIF</span>
                </button>
                <button class="status-option" data-type="sticker">
                    <i class="fas fa-sticky-note"></i>
                    <span>Sticker</span>
                </button>
                <button class="status-option" data-type="location">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>Location</span>
                </button>
            </div>
            
            <!-- Hidden file inputs -->
            <input type="file" id="statusImageInput" accept="image/*" style="display: none;">
            <input type="file" id="statusVideoInput" accept="video/*" style="display: none;">
            <input type="file" id="statusAudioInput" accept="audio/*" style="display: none;">
            
            <div class="status-previews" id="statusPreviews">
                <!-- Emoji Preview -->
                <div id="emojiPreview" class="status-preview hidden">
                    <div class="emoji-selector">
                        <input type="text" id="emojiSearch" placeholder="Search emoji..." class="emoji-search">
                        <div class="emoji-grid" id="emojiGrid"></div>
                    </div>
                </div>
                
                <!-- Text Preview -->
                <div id="textPreview" class="status-preview">
                    <div class="text-customization">
                        <textarea id="statusTextInput" placeholder="Type your status here..." maxlength="500" autofocus></textarea>
                        <div class="text-tools">
                            <select id="textFont" class="text-tool">
                                <option value="default">Default Font</option>
                                <option value="arial">Arial</option>
                                <option value="comic">Comic Sans</option>
                                <option value="courier">Courier</option>
                                <option value="georgia">Georgia</option>
                                <option value="impact">Impact</option>
                            </select>
                            <input type="range" id="textSize" min="16" max="72" value="32" class="text-tool">
                            <input type="color" id="customColor" value="#000000" class="text-tool">
                            <div class="color-buttons">
                                <button class="color-btn" data-color="#667eea" style="background-color: #667eea;"></button>
                                <button class="color-btn" data-color="#764ba2" style="background-color: #764ba2;"></button>
                                <button class="color-btn" data-color="#f093fb" style="background-color: #f093fb;"></button>
                                <button class="color-btn" data-color="#f5576c" style="background-color: #f5576c;"></button>
                                <button class="color-btn" data-color="#4facfe" style="background-color: #4facfe;"></button>
                                <button class="color-btn" data-color="#00f2fe" style="background-color: #00f2fe;"></button>
                                <button class="color-btn" data-color="#43e97b" style="background-color: #43e97b;"></button>
                                <button class="color-btn" data-color="#38f9d7" style="background-color: #38f9d7;"></button>
                                <button class="color-btn" data-color="#fa709a" style="background-color: #fa709a;"></button>
                                <button class="color-btn" data-color="#fee140" style="background-color: #fee140;"></button>
                            </div>
                        </div>
                        <div class="text-preview-display" id="textPreviewDisplay">
                            <!-- Dynamic text preview will appear here -->
                        </div>
                    </div>
                </div>
                
                <!-- Image Preview -->
                <div id="imagePreview" class="status-preview hidden">
                    <div class="image-preview-container" id="statusImagePreview">
                        <img id="statusImagePreviewImg" src="" alt="Image preview" style="display: none;">
                        <div class="image-placeholder">
                            <i class="fas fa-image"></i>
                            <p>Select an image to preview</p>
                        </div>
                        <button class="btn-secondary change-media-btn" id="changeImageBtn">
                            <i class="fas fa-exchange-alt"></i> Change Image
                        </button>
                    </div>
                </div>
                
                <!-- Video Preview -->
                <div id="videoPreview" class="status-preview hidden">
                    <div class="video-preview-container" id="statusVideoPreview">
                        <video id="statusVideoPreviewVideo" controls style="display: none;"></video>
                        <div class="video-placeholder">
                            <i class="fas fa-video"></i>
                            <p>Select a video to preview</p>
                        </div>
                        <button class="btn-secondary change-media-btn" id="changeVideoBtn">
                            <i class="fas fa-exchange-alt"></i> Change Video
                        </button>
                    </div>
                </div>
                
                <!-- Audio Preview -->
                <div id="audioPreview" class="status-preview hidden">
                    <div class="audio-preview-container" id="statusAudioPreview">
                        <audio id="statusAudioPreviewAudio" controls style="display: none;"></audio>
                        <div class="audio-placeholder">
                            <i class="fas fa-volume-up"></i>
                            <p>Select audio to preview</p>
                        </div>
                        <button class="btn-secondary change-media-btn" id="changeAudioBtn">
                            <i class="fas fa-exchange-alt"></i> Change Audio
                        </button>
                        <div class="audio-recorder">
                            <button class="btn-secondary" id="recordAudioBtn">
                                <i class="fas fa-microphone"></i> Record
                            </button>
                            <button class="btn-secondary" id="stopRecordingBtn" style="display: none;">
                                <i class="fas fa-stop"></i> Stop
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- GIF Preview -->
                <div id="gifPreview" class="status-preview hidden">
                    <div class="gif-selector">
                        <input type="text" id="gifSearch" placeholder="Search GIFs..." class="gif-search">
                        <div class="gif-grid" id="gifGrid"></div>
                    </div>
                </div>
                
                <!-- Sticker Preview -->
                <div id="stickerPreview" class="status-preview hidden">
                    <div class="sticker-selector">
                        <div class="sticker-grid" id="stickerGrid"></div>
                    </div>
                </div>
                
                <!-- Location Preview -->
                <div id="locationPreview" class="status-preview hidden">
                    <div class="location-selector">
                        <input type="text" id="locationSearch" placeholder="Search location..." class="location-search">
                        <div class="location-map" id="locationMap">
                            <!-- Map will be initialized here -->
                        </div>
                        <div class="location-results" id="locationResults"></div>
                    </div>
                </div>
            </div>
            
            <!-- Status Caption -->
            <div class="status-caption-container">
                <input type="text" id="statusCaption" placeholder="Add a caption (optional)" maxlength="200">
            </div>
            
            <!-- Status Options -->
            <div class="status-options-footer">
                <div class="status-privacy">
                    <select id="statusPrivacy" class="status-privacy-select">
                        <option value="everyone">Everyone</option>
                        <option value="myContacts" selected>My Contacts</option>
                        <option value="selectedContacts">Selected Contacts</option>
                        <option value="contactsExcept">Contacts Except...</option>
                        <option value="hideFrom">Hide From...</option>
                    </select>
                </div>
                
                <div class="status-expiry">
                    <select id="statusExpiry" class="status-expiry-select">
                        <option value="86400">24 hours</option>
                        <option value="43200">12 hours</option>
                        <option value="21600">6 hours</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
            </div>
            
            <!-- Post Status Button -->
            <div class="status-actions">
                <button class="btn-secondary" id="saveDraftBtn">
                    <i class="fas fa-save"></i> Save Draft
                </button>
                <button class="btn-primary" id="postStatus">
                    <i class="fas fa-paper-plane"></i> Post Status
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create status viewer modal
 */
function createStatusViewerModal() {
    const modal = document.createElement('div');
    modal.id = 'statusModal';
    modal.className = 'status-viewer-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeStatusModalOverlay"></div>
        <div class="modal-content status-viewer-content">
            <div class="viewer-header">
                <div class="viewer-user-info">
                    <img class="status-user-avatar" id="statusUserAvatar" src="" alt="">
                    <div class="viewer-user-details">
                        <h4 id="statusUserName"></h4>
                        <div class="viewer-status-info">
                            <span id="statusTime"></span>
                        </div>
                    </div>
                </div>
                <div class="viewer-header-actions">
                    <button class="btn-icon" id="closeStatusModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="viewer-body">
                <div class="status-display-container">
                    <div class="status-nav prev">
                        <button class="nav-btn" id="prevStatusBtn">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                    </div>
                    
                    <div class="status-display-area">
                        <!-- Status content will be loaded here -->
                        <div id="statusMedia"></div>
                        <div id="statusText" class="status-text-content"></div>
                        <div id="statusCaptionDisplay" class="status-caption-display"></div>
                    </div>
                    
                    <div class="status-nav next">
                        <button class="nav-btn" id="nextStatusBtn">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Status Expiry Progress -->
                <div class="status-expiry-container">
                    <div class="expiry-progress-bar">
                        <div class="expiry-progress" id="statusExpiryProgress"></div>
                    </div>
                    <div class="expiry-info">
                        <span id="expiryTime"></span>
                        <div class="expiry-metrics">
                            <span id="viewersCount">0 viewers</span>
                            <button class="btn-text" id="viewViewersBtn">View All</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="viewer-footer">
                <div class="viewer-reactions">
                    <button class="reaction-btn" data-reaction="❤️">
                        <span>❤️</span>
                    </button>
                    <button class="reaction-btn" data-reaction="😂">
                        <span>😂</span>
                    </button>
                    <button class="reaction-btn" data-reaction="😮">
                        <span>😮</span>
                    </button>
                    <button class="reaction-btn" data-reaction="😢">
                        <span>😢</span>
                    </button>
                    <button class="reaction-btn" data-reaction="👏">
                        <span>👏</span>
                    </button>
                    <button class="reaction-btn" id="moreReactionsBtn">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                
                <div class="viewer-actions">
                    <button class="action-btn" id="replyStatusBtn">
                        <i class="fas fa-reply"></i>
                        <span>Reply</span>
                    </button>
                    <button class="action-btn" id="forwardStatusBtn">
                        <i class="fas fa-share"></i>
                        <span>Forward</span>
                    </button>
                    <button class="action-btn" id="saveStatusBtn">
                        <i class="fas fa-download"></i>
                        <span>Save</span>
                    </button>
                    <button class="action-btn" id="deleteStatusBtn" style="display: none;">
                        <i class="fas fa-trash"></i>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create viewers modal
 */
function createViewersModal() {
    const modal = document.createElement('div');
    modal.id = 'viewersModal';
    modal.className = 'viewers-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeViewersModal"></div>
        <div class="modal-content viewers-modal-content">
            <div class="modal-header">
                <h3>Viewers</h3>
                <button class="modal-close" id="closeViewersModalBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="viewers-list" id="viewersList">
                <!-- Viewers will be loaded here -->
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create enhanced viewers modal with tabs
 */
function createEnhancedViewersModal() {
    const modal = document.createElement('div');
    modal.id = 'enhancedViewersModal';
    modal.className = 'enhanced-viewers-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeEnhancedViewersModal"></div>
        <div class="modal-content enhanced-viewers-content">
            <div class="modal-header">
                <h3>Viewers & Reactions</h3>
                <button class="modal-close" id="closeEnhancedViewersModalBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="enhanced-tabs">
                <button class="tab-button active" data-tab="viewers">
                    <i class="fas fa-eye"></i>
                    <span>Viewers</span>
                    <span class="tab-count" id="viewersTabCount">0</span>
                </button>
                <button class="tab-button" data-tab="reactions">
                    <i class="fas fa-heart"></i>
                    <span>Reactions</span>
                    <span class="tab-count" id="reactionsTabCount">0</span>
                </button>
            </div>
            
            <div class="tab-content active" id="viewersTabContent">
                <div class="enhanced-viewers-list" id="enhancedViewersList">
                    <!-- Enhanced viewers list will be loaded here -->
                </div>
            </div>
            
            <div class="tab-content" id="reactionsTabContent">
                <div class="enhanced-reactions-list" id="enhancedReactionsList">
                    <!-- Reactions list will be loaded here -->
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create reaction picker
 */
function createReactionPicker() {
    const picker = document.createElement('div');
    picker.id = 'reactionPicker';
    picker.className = 'reaction-picker';
    picker.style.display = 'none';
    picker.innerHTML = `
        <div class="reaction-options">
            <button class="reaction-option" data-reaction="❤️">❤️</button>
            <button class="reaction-option" data-reaction="😍">😍</button>
            <button class="reaction-option" data-reaction="😂">😂</button>
            <button class="reaction-option" data-reaction="😮">😮</button>
            <button class="reaction-option" data-reaction="😢">😢</button>
            <button class="reaction-option" data-reaction="😡">😡</button>
            <button class="reaction-option" data-reaction="👏">👏</button>
            <button class="reaction-option" data-reaction="🔥">🔥</button>
            <button class="reaction-option" data-reaction="👍">👍</button>
            <button class="reaction-option" data-reaction="👎">👎</button>
            <button class="reaction-option" data-reaction="🎉">🎉</button>
            <button class="reaction-option" data-reaction="🤔">🤔</button>
        </div>
    `;
    
    document.body.appendChild(picker);
}

/**
 * Create status expiry modal
 */
function createStatusExpiryModal() {
    const modal = document.createElement('div');
    modal.id = 'statusExpiryModal';
    modal.className = 'status-expiry-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeExpiryModal"></div>
        <div class="modal-content expiry-modal-content">
            <div class="modal-header">
                <h3>Set Custom Duration</h3>
                <button class="modal-close" id="closeExpiryModalBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="expiry-options">
                <div class="expiry-option" data-hours="1">
                    <span>1 hour</span>
                </div>
                <div class="expiry-option" data-hours="2">
                    <span>2 hours</span>
                </div>
                <div class="expiry-option" data-hours="4">
                    <span>4 hours</span>
                </div>
                <div class="expiry-option" data-hours="8">
                    <span>8 hours</span>
                </div>
                <div class="expiry-option" data-hours="12">
                    <span>12 hours</span>
                </div>
                <div class="expiry-option" data-hours="24">
                    <span>24 hours</span>
                </div>
                <div class="expiry-option custom">
                    <input type="number" id="customHours" min="1" max="168" value="24" placeholder="Hours">
                    <span>hours</span>
                </div>
            </div>
            <div class="expiry-actions">
                <button class="btn-secondary" id="cancelExpiryBtn">Cancel</button>
                <button class="btn-primary" id="setExpiryBtn">Set Duration</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ==================== DOM ELEMENTS CACHING ====================

/**
 * Cache all DOM elements for quick access
 */
function cacheDOMElements() {
    console.log('🔍 Caching DOM elements...');
    
    // Status Creation Modal Elements
    domElements.statusCreationModal = document.getElementById('statusCreationModal');
    domElements.closeStatusCreation = document.getElementById('closeStatusCreation');
    domElements.closeStatusCreationBtn = document.getElementById('closeStatusCreationBtn');
    domElements.postStatus = document.getElementById('postStatus');
    domElements.statusCaption = document.getElementById('statusCaption');
    
    // File Inputs
    domElements.statusImageInput = document.getElementById('statusImageInput');
    domElements.statusVideoInput = document.getElementById('statusVideoInput');
    domElements.statusAudioInput = document.getElementById('statusAudioInput');
    
    // Status Options
    domElements.statusOptions = document.getElementById('statusOptions');
    domElements.statusOption = document.querySelectorAll('.status-option');
    
    // Status Previews
    domElements.statusPreviews = document.getElementById('statusPreviews');
    domElements.emojiPreview = document.getElementById('emojiPreview');
    domElements.textPreview = document.getElementById('textPreview');
    domElements.imagePreview = document.getElementById('imagePreview');
    domElements.videoPreview = document.getElementById('videoPreview');
    domElements.audioPreview = document.getElementById('audioPreview');
    domElements.gifPreview = document.getElementById('gifPreview');
    domElements.stickerPreview = document.getElementById('stickerPreview');
    domElements.locationPreview = document.getElementById('locationPreview');
    
    // Text Status Customization
    domElements.statusTextInput = document.getElementById('statusTextInput');
    domElements.textFont = document.getElementById('textFont');
    domElements.textSize = document.getElementById('textSize');
    domElements.customColor = document.getElementById('customColor');
    domElements.colorButtons = document.querySelectorAll('.color-btn');
    domElements.textPreviewDisplay = document.getElementById('textPreviewDisplay');
    
    // Media Previews
    domElements.statusImagePreviewImg = document.getElementById('statusImagePreviewImg');
    domElements.statusVideoPreviewVideo = document.getElementById('statusVideoPreviewVideo');
    domElements.statusAudioPreviewAudio = document.getElementById('statusAudioPreviewAudio');
    domElements.changeImageBtn = document.getElementById('changeImageBtn');
    domElements.changeVideoBtn = document.getElementById('changeVideoBtn');
    domElements.changeAudioBtn = document.getElementById('changeAudioBtn');
    domElements.recordAudioBtn = document.getElementById('recordAudioBtn');
    domElements.stopRecordingBtn = document.getElementById('stopRecordingBtn');
    
    // Status Options Footer
    domElements.statusPrivacy = document.getElementById('statusPrivacy');
    domElements.statusExpiry = document.getElementById('statusExpiry');
    domElements.saveDraftBtn = document.getElementById('saveDraftBtn');
    
    // Status Viewer Modal Elements
    domElements.statusModal = document.getElementById('statusModal');
    domElements.statusUserAvatar = document.getElementById('statusUserAvatar');
    domElements.statusUserName = document.getElementById('statusUserName');
    domElements.statusTime = document.getElementById('statusTime');
    domElements.closeStatusModal = document.getElementById('closeStatusModal');
    domElements.closeStatusModalOverlay = document.getElementById('closeStatusModalOverlay');
    
    // Status Display Elements
    domElements.statusMedia = document.getElementById('statusMedia');
    domElements.statusText = document.getElementById('statusText');
    domElements.statusCaptionDisplay = document.getElementById('statusCaptionDisplay');
    
    // Status Expiry & Metrics
    domElements.statusExpiryProgress = document.getElementById('statusExpiryProgress');
    domElements.expiryTime = document.getElementById('expiryTime');
    domElements.viewersCount = document.getElementById('viewersCount');
    domElements.viewViewersBtn = document.getElementById('viewViewersBtn');
    
    // Status Navigation
    domElements.prevStatusBtn = document.getElementById('prevStatusBtn');
    domElements.nextStatusBtn = document.getElementById('nextStatusBtn');
    
    // Status Interaction Buttons
    domElements.deleteStatusBtn = document.getElementById('deleteStatusBtn');
    domElements.replyStatusBtn = document.getElementById('replyStatusBtn');
    domElements.forwardStatusBtn = document.getElementById('forwardStatusBtn');
    domElements.saveStatusBtn = document.getElementById('saveStatusBtn');
    
    // Status Reactions
    domElements.reactionBtns = document.querySelectorAll('.reaction-btn');
    domElements.moreReactionsBtn = document.getElementById('moreReactionsBtn');
    domElements.reactionPicker = document.getElementById('reactionPicker');
    domElements.reactionOptions = document.querySelectorAll('.reaction-option');
    
    // Viewers & Reactions Modals
    domElements.viewersModal = document.getElementById('viewersModal');
    domElements.enhancedViewersModal = document.getElementById('enhancedViewersModal');
    domElements.viewersList = document.getElementById('viewersList');
    domElements.enhancedViewersList = document.getElementById('enhancedViewersList');
    domElements.enhancedReactionsList = document.getElementById('enhancedReactionsList');
    domElements.closeViewersModal = document.getElementById('closeViewersModal');
    domElements.closeViewersModalBtn = document.getElementById('closeViewersModalBtn');
    domElements.closeEnhancedViewersModal = document.getElementById('closeEnhancedViewersModal');
    domElements.closeEnhancedViewersModalBtn = document.getElementById('closeEnhancedViewersModalBtn');
    
    // Enhanced Viewers Tabs
    domElements.tabButtons = document.querySelectorAll('.tab-button');
    domElements.tabContents = document.querySelectorAll('.tab-content');
    domElements.viewersTabCount = document.getElementById('viewersTabCount');
    domElements.reactionsTabCount = document.getElementById('reactionsTabCount');
    
    // My Status Elements
    domElements.myStatus = document.getElementById('myStatus');
    domElements.myStatusList = document.getElementById('myStatusList');
    domElements.addFirstStatusBtn = document.getElementById('addFirstStatusBtn');
    domElements.quickStatusBtn = document.getElementById('quickStatusBtn');
    
    // Status Updates List
    domElements.statusUpdates = document.getElementById('statusUpdates');
    
    // Status Ring
    domElements.statusRing = document.getElementById('statusRing');
    domElements.statusRingInner = document.querySelector('.status-ring-inner');
    
    // Status Expiry Modal
    domElements.statusExpiryModal = document.getElementById('statusExpiryModal');
    domElements.customHours = document.getElementById('customHours');
    domElements.setExpiryBtn = document.getElementById('setExpiryBtn');
    domElements.cancelExpiryBtn = document.getElementById('cancelExpiryBtn');
    
    // Drafts
    domElements.draftsList = document.getElementById('draftsList');
    
    console.log('✅ DOM elements cached');
}

// ==================== EVENT LISTENERS SETUP ====================

/**
 * Setup ALL event listeners for the entire system
 */
function setupAllEventListeners() {
    console.log('🎯 Setting up ALL event listeners...');
    
    // Wait a bit to ensure DOM is ready
    setTimeout(() => {
        // 1. Status Creation Event Listeners
        setupStatusCreationListeners();
        
        // 2. Status Viewing Event Listeners
        setupStatusViewingListeners();
        
        // 3. Viewers & Reactions Event Listeners
        setupViewersReactionsListeners();
        
        // 4. Status Reactions Event Listeners
        setupStatusReactionsListeners();
        
        // 5. Additional Event Listeners
        setupAdditionalListeners();
        
        console.log('✅ All event listeners setup complete');
    }, 500);
}

/**
 * Setup status creation event listeners
 */
function setupStatusCreationListeners() {
    console.log('🔧 Setting up status creation listeners...');
    
    // My Status Button
    if (domElements.myStatus) {
        domElements.myStatus.addEventListener('click', openStatusCreation);
    }
    
    // Add First Status Button
    if (domElements.addFirstStatusBtn) {
        domElements.addFirstStatusBtn.addEventListener('click', openStatusCreation);
    }
    
    // Quick Status Button
    if (domElements.quickStatusBtn) {
        domElements.quickStatusBtn.addEventListener('click', openQuickStatus);
    }
    
    // Status option clicks
    if (domElements.statusOption) {
        domElements.statusOption.forEach(option => {
            option.addEventListener('click', function() {
                const type = this.dataset.type;
                switchStatusType(type);
            });
        });
    }
    
    // Close status creation
    if (domElements.closeStatusCreation) {
        domElements.closeStatusCreation.addEventListener('click', closeStatusCreation);
    }
    
    if (domElements.closeStatusCreationBtn) {
        domElements.closeStatusCreationBtn.addEventListener('click', closeStatusCreation);
    }
    
    // File input changes
    if (domElements.statusImageInput) {
        domElements.statusImageInput.addEventListener('change', handleImageUpload);
    }
    
    if (domElements.statusVideoInput) {
        domElements.statusVideoInput.addEventListener('change', handleVideoUpload);
    }
    
    if (domElements.statusAudioInput) {
        domElements.statusAudioInput.addEventListener('change', handleAudioUpload);
    }
    
    // Color selection
    if (domElements.colorButtons) {
        domElements.colorButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const color = this.dataset.color;
                customizeTextStatus({ backgroundColor: color });
            });
        });
    }
    
    // Text customization
    if (domElements.textFont) {
        domElements.textFont.addEventListener('change', function() {
            customizeTextStatus({ font: this.value });
        });
    }
    
    if (domElements.textSize) {
        domElements.textSize.addEventListener('input', function() {
            customizeTextStatus({ fontSize: this.value + 'px' });
        });
    }
    
    if (domElements.customColor) {
        domElements.customColor.addEventListener('input', function() {
            customizeTextStatus({ color: this.value });
        });
    }
    
    if (domElements.statusTextInput) {
        domElements.statusTextInput.addEventListener('input', function() {
            customizeTextStatus({ text: this.value });
        });
    }
    
    // Change media buttons
    if (domElements.changeImageBtn) {
        domElements.changeImageBtn.addEventListener('click', () => {
            domElements.statusImageInput.click();
        });
    }
    
    if (domElements.changeVideoBtn) {
        domElements.changeVideoBtn.addEventListener('click', () => {
            domElements.statusVideoInput.click();
        });
    }
    
    if (domElements.changeAudioBtn) {
        domElements.changeAudioBtn.addEventListener('click', () => {
            domElements.statusAudioInput.click();
        });
    }
    
    // Audio recording
    if (domElements.recordAudioBtn) {
        domElements.recordAudioBtn.addEventListener('click', startAudioRecording);
    }
    
    if (domElements.stopRecordingBtn) {
        domElements.stopRecordingBtn.addEventListener('click', stopAudioRecording);
    }
    
    // Post status
    if (domElements.postStatus) {
        domElements.postStatus.addEventListener('click', postNewStatus);
    }
    
    // Save draft
    if (domElements.saveDraftBtn) {
        domElements.saveDraftBtn.addEventListener('click', saveStatusDraft);
    }
    
    // Status expiry selection
    if (domElements.statusExpiry) {
        domElements.statusExpiry.addEventListener('change', function() {
            if (this.value === 'custom') {
                openStatusExpiryModal();
            } else {
                statusDraft.customDuration = parseInt(this.value);
            }
        });
    }
    
    // Status privacy selection
    if (domElements.statusPrivacy) {
        domElements.statusPrivacy.addEventListener('change', function() {
            statusDraft.privacy = this.value;
        });
    }
    
    // Status caption
    if (domElements.statusCaption) {
        domElements.statusCaption.addEventListener('input', function() {
            statusDraft.caption = this.value;
        });
    }
}

/**
 * Setup status viewing event listeners
 */
function setupStatusViewingListeners() {
    console.log('🔧 Setting up status viewing listeners...');
    
    // Status item clicks in statusUpdates
    if (domElements.statusUpdates) {
        domElements.statusUpdates.addEventListener('click', function(e) {
            const statusItem = e.target.closest('.status-update-item');
            if (statusItem) {
                e.preventDefault();
                e.stopPropagation();
                const statusId = statusItem.dataset.statusId;
                const userId = statusItem.dataset.userId;
                if (statusId) {
                    openStatusViewer(statusId);
                } else if (userId) {
                    viewUserStatuses(userId);
                }
            }
        });
    }
    
    // Close status modal
    if (domElements.closeStatusModal) {
        domElements.closeStatusModal.addEventListener('click', closeStatusViewer);
    }
    
    if (domElements.closeStatusModalOverlay) {
        domElements.closeStatusModalOverlay.addEventListener('click', closeStatusViewer);
    }
    
    // Navigation buttons
    if (domElements.prevStatusBtn) {
        domElements.prevStatusBtn.addEventListener('click', showPrevStatus);
    }
    
    if (domElements.nextStatusBtn) {
        domElements.nextStatusBtn.addEventListener('click', showNextStatus);
    }
    
    // View viewers button
    if (domElements.viewViewersBtn) {
        domElements.viewViewersBtn.addEventListener('click', function() {
            if (currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                openEnhancedViewersModal(statusId);
            }
        });
    }
    
    // Delete status button
    if (domElements.deleteStatusBtn) {
        domElements.deleteStatusBtn.addEventListener('click', function() {
            if (currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                deleteStatus(statusId);
            }
        });
    }
    
    // Reply to status
    if (domElements.replyStatusBtn) {
        domElements.replyStatusBtn.addEventListener('click', replyToStatus);
    }
    
    // Forward status
    if (domElements.forwardStatusBtn) {
        domElements.forwardStatusBtn.addEventListener('click', forwardStatus);
    }
    
    // Save status
    if (domElements.saveStatusBtn) {
        domElements.saveStatusBtn.addEventListener('click', saveStatus);
    }
}

/**
 * Setup viewers & reactions event listeners
 */
function setupViewersReactionsListeners() {
    console.log('🔧 Setting up viewers & reactions listeners...');
    
    // Tab button clicks
    if (domElements.tabButtons) {
        domElements.tabButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const tab = this.dataset.tab;
                switchEnhancedTab(tab);
            });
        });
    }
    
    // Close viewers modal
    if (domElements.closeViewersModal) {
        domElements.closeViewersModal.addEventListener('click', closeViewersModal);
    }
    
    if (domElements.closeViewersModalBtn) {
        domElements.closeViewersModalBtn.addEventListener('click', closeViewersModal);
    }
    
    // Close enhanced viewers modal
    if (domElements.closeEnhancedViewersModal) {
        domElements.closeEnhancedViewersModal.addEventListener('click', closeEnhancedViewersModal);
    }
    
    if (domElements.closeEnhancedViewersModalBtn) {
        domElements.closeEnhancedViewersModalBtn.addEventListener('click', closeEnhancedViewersModal);
    }
}

/**
 * Setup status reactions event listeners
 */
function setupStatusReactionsListeners() {
    console.log('🔧 Setting up status reactions listeners...');
    
    // Reaction buttons in viewer footer
    if (domElements.reactionBtns) {
        domElements.reactionBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const reaction = this.dataset.reaction;
                if (reaction && currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                    const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                    addReactionToStatus(statusId, reaction);
                }
            });
        });
    }
    
    // More reactions button
    if (domElements.moreReactionsBtn) {
        domElements.moreReactionsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showReactionPicker(e);
        });
    }
    
    // Reaction options in picker
    if (domElements.reactionOptions) {
        domElements.reactionOptions.forEach(option => {
            option.addEventListener('click', function() {
                const reaction = this.dataset.reaction;
                if (reaction && currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                    const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                    addReactionToStatus(statusId, reaction);
                    hideReactionPicker();
                }
            });
        });
    }
    
    // Close reaction picker when clicking outside
    document.addEventListener('click', function(e) {
        if (domElements.reactionPicker && 
            !domElements.reactionPicker.contains(e.target) && 
            !e.target.closest('.reaction-btn') &&
            domElements.reactionPicker.style.display !== 'none') {
            hideReactionPicker();
        }
    });
}

/**
 * Setup additional event listeners
 */
function setupAdditionalListeners() {
    console.log('🔧 Setting up additional listeners...');
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Escape to close modals
        if (e.key === 'Escape') {
            if (domElements.statusCreationModal && domElements.statusCreationModal.style.display !== 'none') {
                closeStatusCreation();
            } else if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
                closeStatusViewer();
            } else if (domElements.viewersModal && domElements.viewersModal.style.display !== 'none') {
                closeViewersModal();
            } else if (domElements.enhancedViewersModal && domElements.enhancedViewersModal.style.display !== 'none') {
                closeEnhancedViewersModal();
            } else if (domElements.reactionPicker && domElements.reactionPicker.style.display !== 'none') {
                hideReactionPicker();
            } else if (domElements.statusExpiryModal && domElements.statusExpiryModal.style.display !== 'none') {
                closeStatusExpiryModal();
            }
        }
        
        // Arrow keys for status navigation
        if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
            if (e.key === 'ArrowLeft') {
                showPrevStatus();
            } else if (e.key === 'ArrowRight') {
                showNextStatus();
            }
        }
    });
    
    // Status expiry modal listeners
    const closeExpiryModal = document.getElementById('closeExpiryModal');
    const closeExpiryModalBtn = document.getElementById('closeExpiryModalBtn');
    const expiryOptions = document.querySelectorAll('.expiry-option');
    
    if (closeExpiryModal) closeExpiryModal.addEventListener('click', closeStatusExpiryModal);
    if (closeExpiryModalBtn) closeExpiryModalBtn.addEventListener('click', closeStatusExpiryModal);
    
    if (domElements.cancelExpiryBtn) {
        domElements.cancelExpiryBtn.addEventListener('click', closeStatusExpiryModal);
    }
    
    if (domElements.setExpiryBtn) {
        domElements.setExpiryBtn.addEventListener('click', function() {
            const customHours = document.getElementById('customHours');
            if (customHours && customHours.value) {
                const hours = parseInt(customHours.value);
                if (hours >= 1 && hours <= 168) {
                    statusDraft.customDuration = hours * 3600;
                    if (domElements.statusExpiry) {
                        domElements.statusExpiry.value = 'custom';
                    }
                    showToast(`Duration set to ${hours} hours`, 'success');
                    closeStatusExpiryModal();
                } else {
                    showToast('Please enter a value between 1 and 168 hours', 'error');
                }
            }
        });
    }
    
    if (expiryOptions) {
        expiryOptions.forEach(option => {
            option.addEventListener('click', function() {
                if (!this.classList.contains('custom')) {
                    const hours = parseInt(this.dataset.hours);
                    statusDraft.customDuration = hours * 3600;
                    if (domElements.statusExpiry) {
                        domElements.statusExpiry.value = hours * 3600;
                    }
                    showToast(`Duration set to ${hours} hours`, 'success');
                    closeStatusExpiryModal();
                }
            });
        });
    }
    
    // Touch gestures for mobile
    if ('ontouchstart' in window) {
        setupTouchGestures();
    }
    
    // Status tabs
    const statusTabs = document.querySelectorAll('.status-tab');
    statusTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchStatusTab(tabName);
        });
    });
}

/**
 * Setup touch gestures for mobile
 */
function setupTouchGestures() {
    console.log('📱 Setting up touch gestures...');
    
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    
    document.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, false);
    
    document.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, false);
    
    function handleSwipe() {
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;
        
        // Only consider horizontal swipes with minimal vertical movement
        if (Math.abs(diffY) < 50) {
            if (diffX > 50) {
                // Swipe left - next status
                if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
                    showNextStatus();
                }
            } else if (diffX < -50) {
                // Swipe right - previous status
                if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
                    showPrevStatus();
                }
            }
        }
    }
}

// ==================== STATUS CREATION FUNCTIONS ====================

/**
 * Open status creation modal
 */
function openStatusCreation() {
    console.log('📝 Opening status creation...');
    
    // Reset draft
    resetStatusDraft();
    
    // Show modal
    if (domElements.statusCreationModal) {
        domElements.statusCreationModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Focus text input
        setTimeout(() => {
            if (domElements.statusTextInput) {
                domElements.statusTextInput.focus();
            }
        }, 100);
    }
    
    // Update UI with current settings
    updateCreationUI();
}

/**
 * Open quick status (camera mode)
 */
function openQuickStatus() {
    console.log('📸 Opening quick status...');
    quickStatusMode = true;
    openStatusCreation();
    switchStatusType('image');
    
    // In a real implementation, this would open the camera
    // For now, we'll just trigger the image input
    setTimeout(() => {
        if (domElements.statusImageInput) {
            domElements.statusImageInput.click();
        }
    }, 500);
}

/**
 * Close status creation modal
 */
function closeStatusCreation() {
    console.log('📝 Closing status creation...');
    
    if (domElements.statusCreationModal) {
        domElements.statusCreationModal.style.display = 'none';
        document.body.style.overflow = '';
        
        // Stop camera if active
        stopCamera();
        
        // Stop audio recording if active
        if (voiceRecorder && voiceRecorder.state === 'recording') {
            stopAudioRecording();
        }
        
        // Clear media previews
        clearMediaPreviews();
    }
    
    // Reset quick status mode
    quickStatusMode = false;
}

/**
 * Reset status draft to defaults
 */
function resetStatusDraft() {
    statusDraft = {
        type: 'text',
        content: '',
        caption: '',
        background: 'default',
        font: 'default',
        color: '#000000',
        stickers: [],
        gifs: [],
        drawings: [],
        overlays: [],
        mentions: [],
        location: null,
        music: null,
        linkPreview: null,
        scheduleTime: null,
        privacy: statusPreferences.privacy,
        selectedContacts: [],
        hideFrom: [],
        exceptContacts: [],
        perStatusPrivacy: null,
        trimStart: 0,
        trimEnd: 30,
        filters: [],
        textOverlays: [],
        doodles: [],
        boomerang: false,
        portraitEffect: false,
        greenScreen: null,
        voiceover: null,
        viewOnce: false,
        customDuration: 86400,
        ringColor: null,
        shareComment: '',
        demographics: {},
        businessLink: '',
        quickReplyTemplate: null,
        awayMessageAuto: null,
        isAutomatic: false,
        triggerType: null,
        encrypted: statusPreferences.e2eEncrypted,
        mediaMetadata: {},
        editingHistory: [],
        draftId: generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        expiryOption: '24h',
        expiryTime: null,
        backgroundColor: '#667eea',
        allowReactions: true,
        viewerCount: 0,
        gifUrl: null,
        stickerId: null,
        locationName: null,
        locationCoordinates: null
    };
}

/**
 * Update creation UI with current draft settings
 */
function updateCreationUI() {
    // Update privacy option
    if (domElements.statusPrivacy) {
        domElements.statusPrivacy.value = statusDraft.privacy;
    }
    
    // Update expiry option
    if (domElements.statusExpiry) {
        domElements.statusExpiry.value = statusDraft.customDuration.toString();
    }
    
    // Update caption
    if (domElements.statusCaption) {
        domElements.statusCaption.value = statusDraft.caption || '';
    }
    
    // Update text preview
    customizeTextStatus();
}

/**
 * Switch status type
 * @param {string} type - Status type to switch to
 */
function switchStatusType(type) {
    console.log(`🔄 Switching to ${type} status`);
    
    // Update status option buttons
    if (domElements.statusOption) {
        domElements.statusOption.forEach(option => {
            if (option.dataset.type === type) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }
    
    // Hide all previews
    const previews = document.querySelectorAll('.status-preview');
    previews.forEach(preview => {
        preview.classList.add('hidden');
    });
    
    // Show selected preview
    const selectedPreview = document.getElementById(`${type}Preview`);
    if (selectedPreview) {
        selectedPreview.classList.remove('hidden');
    }
    
    // Update draft type
    statusDraft.type = type;
    
    // Handle type-specific initialization
    switch (type) {
        case 'image':
            // Initialize image preview
            break;
        case 'video':
            // Initialize video preview
            break;
        case 'audio':
            // Initialize audio preview
            break;
        case 'emoji':
            // Load emoji grid
            loadEmojiGrid();
            break;
        case 'gif':
            // Load GIF search
            loadGIFSearch();
            break;
        case 'sticker':
            // Load sticker grid
            loadStickerGrid();
            break;
        case 'location':
            // Initialize location search
            initializeLocationSearch();
            break;
    }
}

/**
 * Handle image upload
 * @param {Event} event - File upload event
 */
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('📸 Handling image upload');
    
    // Validate file
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('Image too large (max 10MB)', 'error');
        return;
    }
    
    // Preview image
    await previewStatusMedia(file, 'image');
    
    // Reset input
    event.target.value = '';
}

/**
 * Handle video upload
 * @param {Event} event - File upload event
 */
async function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('🎥 Handling video upload');
    
    // Validate file
    if (!file.type.startsWith('video/')) {
        showToast('Please select a video file', 'error');
        return;
    }
    
    // Check file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
        showToast('Video too large (max 20MB)', 'error');
        return;
    }
    
    // Check duration (max 30 seconds)
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = function() {
        window.URL.revokeObjectURL(video.src);
        const duration = video.duration;
        
        if (duration > 30) {
            showToast('Video too long (max 30 seconds)', 'error');
            return;
        }
        
        // Preview video if duration is valid
        previewStatusMedia(file, 'video').then(() => {
            // Reset input
            event.target.value = '';
        });
    };
    
    video.src = URL.createObjectURL(file);
}

/**
 * Handle audio upload
 * @param {Event} event - File upload event
 */
async function handleAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('🎵 Handling audio upload');
    
    // Validate file
    if (!file.type.startsWith('audio/')) {
        showToast('Please select an audio file', 'error');
        return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Audio file too large (max 5MB)', 'error');
        return;
    }
    
    // Preview audio
    await previewStatusMedia(file, 'audio');
    
    // Reset input
    event.target.value = '';
}

/**
 * Preview status media
 * @param {File} file - Media file
 * @param {string} type - Media type
 */
async function previewStatusMedia(file, type) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const result = e.target.result;
            
            switch (type) {
                case 'image':
                    // Update image preview
                    if (domElements.statusImagePreviewImg) {
                        domElements.statusImagePreviewImg.src = result;
                        domElements.statusImagePreviewImg.style.display = 'block';
                        // Hide placeholder
                        const placeholder = document.querySelector('.image-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    }
                    // Update draft
                    statusDraft.content = result;
                    statusDraft.type = 'image';
                    statusDraft.mediaMetadata = {
                        type: 'image',
                        size: file.size,
                        name: file.name
                    };
                    break;
                    
                case 'video':
                    // Update video preview
                    if (domElements.statusVideoPreviewVideo) {
                        domElements.statusVideoPreviewVideo.src = result;
                        domElements.statusVideoPreviewVideo.style.display = 'block';
                        // Hide placeholder
                        const placeholder = document.querySelector('.video-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    }
                    // Update draft
                    statusDraft.content = result;
                    statusDraft.type = 'video';
                    statusDraft.mediaMetadata = {
                        type: 'video',
                        size: file.size,
                        name: file.name
                    };
                    break;
                    
                case 'audio':
                    // Update audio preview
                    if (domElements.statusAudioPreviewAudio) {
                        domElements.statusAudioPreviewAudio.src = result;
                        domElements.statusAudioPreviewAudio.style.display = 'block';
                        // Hide placeholder
                        const placeholder = document.querySelector('.audio-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    }
                    // Update draft
                    statusDraft.content = result;
                    statusDraft.type = 'audio';
                    statusDraft.mediaMetadata = {
                        type: 'audio',
                        size: file.size,
                        name: file.name
                    };
                    break;
            }
            
            // Switch to appropriate tab
            switchStatusType(type);
            
            resolve();
        };
        
        reader.onerror = function() {
            showToast('Error reading file', 'error');
            resolve();
        };
        
        reader.readAsDataURL(file);
    });
}

/**
 * Customize text status
 * @param {Object} options - Customization options
 */
function customizeTextStatus(options = {}) {
    // Update draft with provided options
    if (options.text !== undefined) {
        statusDraft.content = options.text;
    }
    if (options.font !== undefined) {
        statusDraft.font = options.font;
    }
    if (options.color !== undefined) {
        statusDraft.color = options.color;
    }
    if (options.backgroundColor !== undefined) {
        statusDraft.backgroundColor = options.backgroundColor;
    }
    if (options.fontSize !== undefined) {
        statusDraft.fontSize = options.fontSize;
    }
    
    // Update text preview display
    if (domElements.textPreviewDisplay) {
        let html = '';
        
        if (statusDraft.content) {
            html = `
                <div class="text-status-preview" style="
                    background: linear-gradient(135deg, ${statusDraft.backgroundColor} 0%, ${darkenColor(statusDraft.backgroundColor, 20)} 100%);
                    color: ${statusDraft.color};
                    font-family: ${getFontFamily(statusDraft.font)};
                    font-size: ${statusDraft.fontSize || '32px'};
                    padding: 40px 20px;
                    border-radius: 15px;
                    min-height: 200px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    word-break: break-word;
                    overflow: hidden;
                ">
                    ${escapeHtml(statusDraft.content)}
                </div>
            `;
        } else {
            html = `
                <div class="text-placeholder" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 40px 20px;
                    border-radius: 15px;
                    min-height: 200px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    color: white;
                    opacity: 0.7;
                ">
                    <div>
                        <i class="fas fa-font" style="font-size: 48px; margin-bottom: 10px;"></i>
                        <p>Your text will appear here</p>
                    </div>
                </div>
            `;
        }
        
        domElements.textPreviewDisplay.innerHTML = html;
    }
}

/**
 * Start audio recording
 */
async function startAudioRecording() {
    try {
        console.log('🎤 Starting audio recording...');
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Audio recording not supported', 'error');
            return;
        }
        
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        
        // Initialize MediaRecorder
        voiceRecorder = new MediaRecorder(stream);
        const audioChunks = [];
        
        voiceRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        voiceRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Create file object
            const file = new File([audioBlob], `audio_${Date.now()}.webm`, {
                type: 'audio/webm',
                lastModified: Date.now()
            });
            
            // Preview audio
            await previewStatusMedia(file, 'audio');
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Update UI
            if (domElements.recordAudioBtn) {
                domElements.recordAudioBtn.style.display = 'block';
            }
            if (domElements.stopRecordingBtn) {
                domElements.stopRecordingBtn.style.display = 'none';
            }
            
            showToast('Audio recorded successfully', 'success');
        };
        
        // Start recording
        voiceRecorder.start();
        
        // Update UI
        if (domElements.recordAudioBtn) {
            domElements.recordAudioBtn.style.display = 'none';
        }
        if (domElements.stopRecordingBtn) {
            domElements.stopRecordingBtn.style.display = 'block';
        }
        
        showToast('Recording... Click stop when done', 'info');
        
    } catch (error) {
        console.error('Error starting audio recording:', error);
        showToast('Error accessing microphone', 'error');
    }
}

/**
 * Stop audio recording
 */
function stopAudioRecording() {
    if (voiceRecorder && voiceRecorder.state === 'recording') {
        voiceRecorder.stop();
    }
}

/**
 * Clear media previews
 */
function clearMediaPreviews() {
    // Clear image preview
    if (domElements.statusImagePreviewImg) {
        domElements.statusImagePreviewImg.src = '';
        domElements.statusImagePreviewImg.style.display = 'none';
        const imagePlaceholder = document.querySelector('.image-placeholder');
        if (imagePlaceholder) {
            imagePlaceholder.style.display = 'flex';
        }
    }
    
    // Clear video preview
    if (domElements.statusVideoPreviewVideo) {
        domElements.statusVideoPreviewVideo.src = '';
        domElements.statusVideoPreviewVideo.style.display = 'none';
        const videoPlaceholder = document.querySelector('.video-placeholder');
        if (videoPlaceholder) {
            videoPlaceholder.style.display = 'flex';
        }
    }
    
    // Clear audio preview
    if (domElements.statusAudioPreviewAudio) {
        domElements.statusAudioPreviewAudio.src = '';
        domElements.statusAudioPreviewAudio.style.display = 'none';
        const audioPlaceholder = document.querySelector('.audio-placeholder');
        if (audioPlaceholder) {
            audioPlaceholder.style.display = 'flex';
        }
    }
    
    // Reset text preview
    if (domElements.statusTextInput) {
        domElements.statusTextInput.value = '';
    }
    if (domElements.textPreviewDisplay) {
        domElements.textPreviewDisplay.innerHTML = '';
    }
    
    // Reset caption
    if (domElements.statusCaption) {
        domElements.statusCaption.value = '';
    }
}

// ==================== STATUS POSTING FUNCTIONS ====================

/**
 * Post new status
 */
async function postNewStatus() {
    try {
        console.log('🚀 Posting new status...');
        
        // Validate status
        if (!validateStatus()) {
            return;
        }
        
        // Show loading
        showToast('Posting status...', 'info');
        
        // Prepare status data
        const statusData = await prepareStatusData();
        
        // Upload media if needed
        if (statusDraft.type === 'image' || statusDraft.type === 'video' || statusDraft.type === 'audio') {
            await uploadStatusMedia(statusData);
        }
        
        // Save to Firestore
        const statusRef = await db.collection('statuses').add(statusData);
        
        // Update user stats
        await updateUserStats();
        
        // Record this as user's own status view
        await recordStatusView(statusRef.id, true);
        
        // Clear draft
        resetStatusDraft();
        
        // Close modal
        closeStatusCreation();
        
        // Show success
        showToast('Status posted successfully!', 'success');
        
        // Refresh status list
        loadStatusUpdates();
        loadMyStatuses();
        updateStatusRing();
        
        console.log('✅ Status posted:', statusRef.id);
        
    } catch (error) {
        console.error('❌ Error posting status:', error);
        showToast('Error posting status: ' + error.message, 'error');
    }
}

/**
 * Validate status before posting
 * @returns {boolean} Whether status is valid
 */
function validateStatus() {
    // Check content based on type
    switch (statusDraft.type) {
        case 'text':
            if (!statusDraft.content || statusDraft.content.trim() === '') {
                showToast('Please enter some text for your status', 'error');
                return false;
            }
            if (statusDraft.content.length > 500) {
                showToast('Status text is too long (max 500 characters)', 'error');
                return false;
            }
            break;
            
        case 'image':
        case 'video':
        case 'audio':
            if (!statusDraft.content) {
                showToast('Please select media for your status', 'error');
                return false;
            }
            break;
            
        case 'emoji':
            if (!statusDraft.content) {
                showToast('Please select an emoji for your status', 'error');
                return false;
            }
            break;
            
        case 'gif':
            if (!statusDraft.gifUrl) {
                showToast('Please select a GIF for your status', 'error');
                return false;
            }
            break;
            
        case 'sticker':
            if (!statusDraft.stickerId) {
                showToast('Please select a sticker for your status', 'error');
                return false;
            }
            break;
            
        case 'location':
            if (!statusDraft.locationName || !statusDraft.locationCoordinates) {
                showToast('Please select a location for your status', 'error');
                return false;
            }
            break;
    }
    
    // Check caption length
    if (statusDraft.caption && statusDraft.caption.length > 200) {
        showToast('Caption is too long (max 200 characters)', 'error');
        return false;
    }
    
    return true;
}

/**
 * Prepare status data for Firestore
 * @returns {Promise<Object>} Status data
 */
async function prepareStatusData() {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + statusDraft.customDuration * 1000);
    
    // Determine content based on type
    let content = statusDraft.content;
    let mediaUrl = null;
    
    if (statusDraft.type === 'gif') {
        content = statusDraft.gifUrl;
        mediaUrl = statusDraft.gifUrl;
    } else if (statusDraft.type === 'sticker') {
        content = statusDraft.stickerId;
    } else if (statusDraft.type === 'location') {
        content = JSON.stringify({
            name: statusDraft.locationName,
            coordinates: statusDraft.locationCoordinates
        });
    }
    
    // Basic status data
    const statusData = {
        type: statusDraft.type,
        content: content,
        caption: statusDraft.caption || '',
        userId: currentUser.uid,
        userDisplayName: currentUserData.displayName,
        userPhotoURL: currentUserData.photoURL || '',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAt,
        lastViewedAt: null,
        privacy: statusDraft.privacy,
        viewOnce: statusDraft.viewOnce,
        encrypted: statusDraft.encrypted,
        allowReplies: statusDraft.allowReplies !== false,
        allowReactions: statusDraft.allowReactions !== false,
        location: statusDraft.locationName ? {
            name: statusDraft.locationName,
            coordinates: statusDraft.locationCoordinates
        } : null,
        mentions: statusDraft.mentions || [],
        selectedContacts: statusDraft.selectedContacts || [],
        hideFrom: statusDraft.hideFrom || [],
        exceptContacts: statusDraft.exceptContacts || [],
        viewCount: 0,
        reactionCount: 0,
        replyCount: 0,
        shareCount: 0,
        screenshotCount: 0,
        mediaMetadata: statusDraft.mediaMetadata || {},
        mediaUrl: mediaUrl,
        filters: statusDraft.filters || [],
        textOverlays: statusDraft.textOverlays || [],
        stickers: statusDraft.stickers || [],
        textStyle: statusDraft.type === 'text' ? {
            font: statusDraft.font,
            color: statusDraft.color,
            backgroundColor: statusDraft.backgroundColor,
            fontSize: statusDraft.fontSize
        } : null,
        isBusiness: currentUserData.isBusiness || false,
        businessLink: statusDraft.businessLink || '',
        isActive: true,
        isArchived: false,
        version: '2.0'
    };
    
    return statusData;
}

/**
 * Upload status media to storage
 * @param {Object} statusData - Status data
 */
async function uploadStatusMedia(statusData) {
    if (statusDraft.type === 'text' || !statusDraft.content || !statusDraft.content.startsWith('data:')) {
        return;
    }
    
    try {
        console.log('📤 Uploading media...');
        
        // Generate unique filename
        const fileExtension = getFileExtension(statusDraft.type);
        const fileName = `status_${currentUser.uid}_${Date.now()}.${fileExtension}`;
        const storagePath = `statuses/${currentUser.uid}/${fileName}`;
        
        // Convert data URL to blob
        const blob = dataURLtoBlob(statusDraft.content);
        
        // Upload to Firebase Storage
        const storageRef = storage.ref(storagePath);
        const uploadTask = storageRef.put(blob, {
            contentType: getMimeType(statusDraft.type),
            customMetadata: {
                userId: currentUser.uid,
                statusType: statusDraft.type
            }
        });
        
        // Wait for upload to complete
        await uploadTask;
        
        // Get download URL
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
        
        // Update status data with storage URL
        statusData.content = downloadURL;
        statusData.mediaUrl = downloadURL;
        statusData.storagePath = storagePath;
        
        console.log('✅ Media uploaded:', downloadURL);
        
    } catch (error) {
        console.error('❌ Error uploading media:', error);
        throw error;
    }
}

/**
 * Update user statistics
 */
async function updateUserStats() {
    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        
        await userRef.update({
            statusCount: firebase.firestore.FieldValue.increment(1),
            lastStatusAt: firebase.firestore.FieldValue.serverTimestamp(),
            'userStatusSettings.lastUpdate': firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error('Error updating user stats:', error);
    }
}

// ==================== STATUS VIEWING FUNCTIONS ====================

/**
 * View user statuses
 * @param {string} userId - User ID to view
 */
function viewUserStatuses(userId) {
    console.log('Opening status viewer for user ID:', userId);
    
    // Show loading message
    showToast('Loading user statuses...', 'info');
    
    // You can implement status viewing logic here
    console.log('Would show statuses for user:', userId);
    
    return {
        success: true,
        message: 'Status viewer opened',
        userId: userId
    };
}

/**
 * Open status viewer
 * @param {string} statusId - Status ID to view
 */
async function openStatusViewer(statusId) {
    try {
        console.log(`👁️ Opening status viewer: ${statusId}`);
        
        // Get status data
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = { id: statusDoc.id, ...statusDoc.data() };
        
        // Check if status is expired
        const expiresAt = status.expiresAt?.toDate ? status.expiresAt.toDate() : new Date(status.expiresAt);
        if (expiresAt < new Date()) {
            showToast('This status has expired', 'info');
            return;
        }
        
        // Check privacy settings
        if (!await canViewStatus(status)) {
            showToast('You cannot view this status', 'error');
            return;
        }
        
        // Get other statuses from the same user
        const statusesSnapshot = await db.collection('statuses')
            .where('userId', '==', status.userId)
            .where('expiresAt', '>', new Date())
            .where('isActive', '==', true)
            .orderBy('expiresAt', 'asc')
            .get();
        
        const statuses = statusesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(s => canViewStatus(s)) // Filter by privacy
            .filter(s => s.id !== statusId); // Exclude current status
        
        // Add current status to the beginning
        statuses.unshift(status);
        
        // Set current viewing session
        currentStatusViewing = {
            userId: status.userId,
            statuses: statuses,
            currentIndex: 0,
            viewedStatuses: new Set(),
            startTime: new Date()
        };
        
        currentStatusIndex = 0;
        
        // Open viewer modal
        if (domElements.statusModal) {
            domElements.statusModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
        
        // Show first status
        await showStatusAtIndex(0);
        
        // Record view (if not own status)
        if (status.userId !== currentUser.uid) {
            await recordStatusView(statusId);
        }
        
    } catch (error) {
        console.error('❌ Error opening status viewer:', error);
        showToast('Error loading status', 'error');
    }
}

/**
 * Show status at index
 * @param {number} index - Index to show
 */
async function showStatusAtIndex(index) {
    if (!currentStatusViewing || index < 0 || index >= currentStatusViewing.statuses.length) {
        closeStatusViewer();
        return;
    }
    
    currentStatusIndex = index;
    currentStatusViewing.currentIndex = index;
    
    const status = currentStatusViewing.statuses[index];
    
    // Update viewer UI
    updateStatusViewerUI(status);
    
    // Load status content
    loadStatusContent(status);
    
    // Start expiry timer
    startExpiryTimer(status);
    
    // Update navigation buttons
    updateNavigationButtons();
    
    // Show/hide delete button based on ownership
    if (domElements.deleteStatusBtn) {
        if (status.userId === currentUser.uid) {
            domElements.deleteStatusBtn.style.display = 'block';
        } else {
            domElements.deleteStatusBtn.style.display = 'none';
        }
    }
    
    // Record view (if not already viewed in this session)
    if (!currentStatusViewing.viewedStatuses.has(index)) {
        currentStatusViewing.viewedStatuses.add(index);
        if (status.userId !== currentUser.uid) {
            await recordStatusView(status.id);
        }
    }
}

/**
 * Update status viewer UI
 * @param {Object} status - Status data
 */
function updateStatusViewerUI(status) {
    // Update user info
    if (domElements.statusUserAvatar) {
        const avatarUrl = status.userPhotoURL || 
                         `https://ui-avatars.com/api/?name=${encodeURIComponent(status.userDisplayName)}&background=7C3AED&color=fff`;
        domElements.statusUserAvatar.src = avatarUrl;
        domElements.statusUserAvatar.onerror = function() {
            this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(status.userDisplayName)}&background=7C3AED&color=fff`;
        };
    }
    
    if (domElements.statusUserName) {
        domElements.statusUserName.textContent = status.userDisplayName;
    }
    
    if (domElements.statusTime) {
        const timestamp = status.timestamp?.toDate ? status.timestamp.toDate() : new Date(status.timestamp);
        domElements.statusTime.textContent = formatTimeAgo(timestamp);
    }
    
    // Update viewers count
    if (domElements.viewersCount) {
        const viewCount = status.viewCount || 0;
        domElements.viewersCount.textContent = `${viewCount} ${viewCount === 1 ? 'viewer' : 'viewers'}`;
    }
}

/**
 * Load status content
 * @param {Object} status - Status data
 */
function loadStatusContent(status) {
    // Clear previous content
    if (domElements.statusMedia) {
        domElements.statusMedia.innerHTML = '';
    }
    if (domElements.statusText) {
        domElements.statusText.innerHTML = '';
    }
    if (domElements.statusCaptionDisplay) {
        domElements.statusCaptionDisplay.innerHTML = '';
    }
    
    // Load content based on type
    switch (status.type) {
        case 'text':
            loadTextStatusContent(status);
            break;
        case 'image':
            loadImageStatusContent(status);
            break;
        case 'video':
            loadVideoStatusContent(status);
            break;
        case 'audio':
            loadAudioStatusContent(status);
            break;
        case 'emoji':
            loadEmojiStatusContent(status);
            break;
        case 'gif':
            loadGIFStatusContent(status);
            break;
        case 'sticker':
            loadStickerStatusContent(status);
            break;
        case 'location':
            loadLocationStatusContent(status);
            break;
    }
    
    // Load caption
    if (status.caption && domElements.statusCaptionDisplay) {
        domElements.statusCaptionDisplay.innerHTML = `
            <div class="caption-content">
                ${escapeHtml(status.caption)}
            </div>
        `;
    }
}

/**
 * Load text status content
 * @param {Object} status - Status data
 */
function loadTextStatusContent(status) {
    if (!domElements.statusText) return;
    
    const textStyle = status.textStyle || {};
    
    domElements.statusText.innerHTML = `
        <div class="text-status-display" style="
            background: linear-gradient(135deg, ${textStyle.backgroundColor || '#667eea'} 0%, ${darkenColor(textStyle.backgroundColor || '#667eea', 20)} 100%);
            color: ${textStyle.color || '#ffffff'};
            font-family: ${getFontFamily(textStyle.font || 'default')};
            font-size: ${textStyle.fontSize || '32px'};
            padding: 60px 30px;
            border-radius: 20px;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            word-break: break-word;
            overflow: hidden;
            margin: 20px;
        ">
            ${escapeHtml(status.content)}
        </div>
    `;
}

/**
 * Load image status content
 * @param {Object} status - Status data
 */
function loadImageStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="image-status-display">
            <img src="${status.content}" alt="Status image" 
                 class="status-image-full" 
                 style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 10px;">
            <div class="image-actions">
                <button class="btn-icon" id="zoomImageBtn" title="Zoom">
                    <i class="fas fa-search-plus"></i>
                </button>
                <button class="btn-icon" id="saveImageBtn" title="Save">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners for image actions
    setTimeout(() => {
        const zoomBtn = document.getElementById('zoomImageBtn');
        const saveBtn = document.getElementById('saveImageBtn');
        
        if (zoomBtn) {
            zoomBtn.addEventListener('click', () => {
                const img = document.querySelector('.status-image-full');
                if (img) {
                    if (img.style.maxWidth === '100%') {
                        img.style.maxWidth = 'none';
                        img.style.maxHeight = 'none';
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                    } else {
                        img.style.maxWidth = '100%';
                        img.style.maxHeight = '70vh';
                        img.style.width = 'auto';
                        img.style.height = 'auto';
                        img.style.objectFit = 'contain';
                    }
                }
            });
        }
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                saveStatus();
            });
        }
    }, 100);
}

/**
 * Load video status content
 * @param {Object} status - Status data
 */
function loadVideoStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="video-status-display">
            <video src="${status.content}" 
                   controls 
                   autoplay 
                   playsinline 
                   class="status-video-full"
                   style="max-width: 100%; max-height: 70vh; border-radius: 10px;">
                Your browser does not support the video tag.
            </video>
        </div>
    `;
}

/**
 * Load audio status content
 * @param {Object} status - Status data
 */
function loadAudioStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="audio-status-display">
            <div class="audio-player-container">
                <audio src="${status.content}" 
                       controls 
                       autoplay
                       class="status-audio-full"
                       style="width: 100%;">
                    Your browser does not support the audio element.
                </audio>
                <div class="audio-visualizer" id="audioVisualizer">
                    <canvas id="audioWaveform"></canvas>
                </div>
            </div>
        </div>
    `;
}

/**
 * Load emoji status content
 * @param {Object} status - Status data
 */
function loadEmojiStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="emoji-status-display" style="
            font-size: 120px;
            text-align: center;
            padding: 60px 0;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            ${status.content}
        </div>
    `;
}

/**
 * Load GIF status content
 * @param {Object} status - Status data
 */
function loadGIFStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="gif-status-display">
            <img src="${status.content}" alt="GIF" 
                 class="status-gif-full"
                 style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 10px;">
        </div>
    `;
}

/**
 * Load sticker status content
 * @param {Object} status - Status data
 */
function loadStickerStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    // For now, we'll display a placeholder
    // In a real implementation, you would fetch the sticker from your sticker library
    domElements.statusMedia.innerHTML = `
        <div class="sticker-status-display" style="
            text-align: center;
            padding: 60px 0;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div class="sticker-placeholder" style="
                font-size: 80px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                width: 200px;
                height: 200px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
            ">
                <i class="fas fa-sticky-note"></i>
            </div>
        </div>
    `;
}

/**
 * Load location status content
 * @param {Object} status - Status data
 */
function loadLocationStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    let locationData;
    try {
        locationData = typeof status.content === 'string' ? JSON.parse(status.content) : status.content;
    } catch (e) {
        locationData = { name: status.content };
    }
    
    domElements.statusMedia.innerHTML = `
        <div class="location-status-display" style="
            text-align: center;
            padding: 40px 20px;
            min-height: 300px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        ">
            <div class="location-icon" style="
                font-size: 80px;
                color: #667eea;
                margin-bottom: 20px;
            ">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="location-name" style="
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
            ">
                ${escapeHtml(locationData.name || 'Location')}
            </div>
            <div class="location-actions">
                <button class="btn-secondary" id="viewOnMapBtn">
                    <i class="fas fa-map"></i> View on Map
                </button>
                <button class="btn-secondary" id="getDirectionsBtn">
                    <i class="fas fa-directions"></i> Get Directions
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners for location actions
    setTimeout(() => {
        const viewOnMapBtn = document.getElementById('viewOnMapBtn');
        const getDirectionsBtn = document.getElementById('getDirectionsBtn');
        
        if (viewOnMapBtn) {
            viewOnMapBtn.addEventListener('click', () => {
                if (locationData.coordinates) {
                    const { latitude, longitude } = locationData.coordinates;
                    window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, '_blank');
                } else {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationData.name)}`, '_blank');
                }
            });
        }
        
        if (getDirectionsBtn) {
            getDirectionsBtn.addEventListener('click', () => {
                if (locationData.coordinates) {
                    const { latitude, longitude } = locationData.coordinates;
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
                } else {
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locationData.name)}`, '_blank');
                }
            });
        }
    }, 100);
}

/**
 * Start expiry timer for status
 * @param {Object} status - Status data
 */
function startExpiryTimer(status) {
    // Clear existing timer
    if (statusViewTimeout) {
        clearTimeout(statusViewTimeout);
        statusViewTimeout = null;
    }
    
    // Calculate expiry time
    const expiresAt = status.expiresAt?.toDate ? status.expiresAt.toDate() : new Date(status.expiresAt);
    const now = new Date();
    const totalDuration = expiresAt - now;
    
    if (totalDuration <= 0) {
        // Status has expired
        if (domElements.expiryTime) {
            domElements.expiryTime.textContent = 'Expired';
        }
        if (domElements.statusExpiryProgress) {
            domElements.statusExpiryProgress.style.width = '0%';
        }
        return;
    }
    
    // Update expiry time display
    if (domElements.expiryTime) {
        const hours = Math.floor(totalDuration / (1000 * 60 * 60));
        const minutes = Math.floor((totalDuration % (1000 * 60 * 60)) / (1000 * 60));
        domElements.expiryTime.textContent = `${hours}h ${minutes}m remaining`;
    }
    
    // Start progress bar update
    let elapsed = 0;
    const updateInterval = 1000; // Update every second
    
    const updateProgress = () => {
        elapsed += updateInterval;
        const progress = Math.min(100, (elapsed / totalDuration) * 100);
        
        if (domElements.statusExpiryProgress) {
            domElements.statusExpiryProgress.style.width = `${100 - progress}%`;
        }
        
        // Update time remaining
        if (domElements.expiryTime) {
            const remaining = totalDuration - elapsed;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            domElements.expiryTime.textContent = `${hours}h ${minutes}m remaining`;
        }
        
        // Auto-advance to next status when current one expires
        if (elapsed >= totalDuration) {
            clearInterval(progressInterval);
            showNextStatus();
        }
    };
    
    const progressInterval = setInterval(updateProgress, updateInterval);
    
    // Store interval ID for cleanup
    statusViewTimeout = {
        interval: progressInterval,
        timeout: null
    };
    
    // Auto-advance timer (for non-view-once statuses)
    if (!status.viewOnce) {
        const autoAdvanceTime = Math.min(totalDuration, 10000); // Max 10 seconds per status
        statusViewTimeout.timeout = setTimeout(() => {
            showNextStatus();
        }, autoAdvanceTime);
    }
    
    // Initial update
    updateProgress();
}

/**
 * Show previous status
 */
function showPrevStatus() {
    if (currentStatusIndex > 0) {
        showStatusAtIndex(currentStatusIndex - 1);
    }
}

/**
 * Show next status
 */
function showNextStatus() {
    if (currentStatusIndex < currentStatusViewing.statuses.length - 1) {
        showStatusAtIndex(currentStatusIndex + 1);
    } else {
        closeStatusViewer();
    }
}

/**
 * Update navigation buttons
 */
function updateNavigationButtons() {
    if (!domElements.prevStatusBtn || !domElements.nextStatusBtn) return;
    
    if (currentStatusIndex > 0) {
        domElements.prevStatusBtn.style.visibility = 'visible';
    } else {
        domElements.prevStatusBtn.style.visibility = 'hidden';
    }
    
    if (currentStatusIndex < currentStatusViewing.statuses.length - 1) {
        domElements.nextStatusBtn.style.visibility = 'visible';
    } else {
        domElements.nextStatusBtn.style.visibility = 'hidden';
    }
}

/**
 * Close status viewer
 */
function closeStatusViewer() {
    // Clear expiry timer
    if (statusViewTimeout) {
        if (statusViewTimeout.interval) {
            clearInterval(statusViewTimeout.interval);
        }
        if (statusViewTimeout.timeout) {
            clearTimeout(statusViewTimeout.timeout);
        }
        statusViewTimeout = null;
    }
    
    // Close modal
    if (domElements.statusModal) {
        domElements.statusModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // Clear current viewing
    currentStatusViewing = null;
    currentStatusIndex = 0;
    
    // Refresh status updates
    loadStatusUpdates();
}

// ==================== STATUS INTERACTION FUNCTIONS ====================

/**
 * Reply to status
 */
async function replyToStatus() {
    if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
        return;
    }
    
    const status = currentStatusViewing.statuses[currentStatusIndex];
    
    // Check if replies are allowed
    if (!status.allowReplies) {
        showToast('Replies are not allowed for this status', 'warning');
        return;
    }
    
    // In a real implementation, this would open a chat with the status owner
    // For now, we'll show a toast
    showToast(`Replying to ${status.userDisplayName}'s status`, 'info');
    
    // You would typically open a chat window here
    // openChatWithUser(status.userId, status.id);
}

/**
 * Forward status
 */
async function forwardStatus() {
    if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
        return;
    }
    
    const status = currentStatusViewing.statuses[currentStatusIndex];
    
    // Show forward options
    showToast('Forward feature coming soon', 'info');
    
    // In a real implementation, this would show a list of contacts to forward to
}

/**
 * Save status
 */
async function saveStatus() {
    if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
        return;
    }
    
    const status = currentStatusViewing.statuses[currentStatusIndex];
    
    // Check if saving is allowed
    if (status.viewOnce) {
        showToast('Cannot save view-once status', 'warning');
        return;
    }
    
    try {
        // Download media based on type
        switch (status.type) {
            case 'image':
            case 'gif':
                await downloadMedia(status.content, `status_${status.id}.jpg`);
                break;
            case 'video':
                await downloadMedia(status.content, `status_${status.id}.mp4`);
                break;
            case 'audio':
                await downloadMedia(status.content, `status_${status.id}.webm`);
                break;
            case 'text':
                const textBlob = new Blob([status.content], { type: 'text/plain' });
                await downloadBlob(textBlob, `status_${status.id}.txt`);
                break;
            default:
                showToast('Cannot save this type of status', 'warning');
                return;
        }
        
        showToast('Status saved to device', 'success');
        
    } catch (error) {
        console.error('Error saving status:', error);
        showToast('Error saving status', 'error');
    }
}

/**
 * Delete status
 * @param {string} statusId - Status ID to delete
 */
async function deleteStatus(statusId) {
    if (!statusId) {
        if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
            return;
        }
        statusId = currentStatusViewing.statuses[currentStatusIndex].id;
    }
    
    if (!confirm('Are you sure you want to delete this status?')) {
        return;
    }
    
    try {
        // Get status data to check ownership
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = statusDoc.data();
        
        // Check ownership
        if (status.userId !== currentUser.uid) {
            showToast('You can only delete your own statuses', 'error');
            return;
        }
        
        // Delete status (soft delete by marking as archived)
        await db.collection('statuses').doc(statusId).update({
            isActive: false,
            isArchived: true,
            deletedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Delete associated media from storage if exists
        if (status.storagePath) {
            try {
                const storageRef = storage.ref(status.storagePath);
                await storageRef.delete();
            } catch (storageError) {
                console.warn('Could not delete media from storage:', storageError);
            }
        }
        
        showToast('Status deleted', 'success');
        
        // Close viewer if open
        if (currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]?.id === statusId) {
            closeStatusViewer();
        }
        
        // Refresh status lists
        loadStatusUpdates();
        loadMyStatuses();
        
    } catch (error) {
        console.error('Error deleting status:', error);
        showToast('Error deleting status', 'error');
    }
}

// ==================== VIEWERS & REACTIONS FUNCTIONS ====================

/**
 * Open viewers modal
 * @param {string} statusId - Status ID
 */
async function openViewersModal(statusId) {
    try {
        // Load viewers
        await loadStatusViewers(statusId);
        
        // Show modal
        if (domElements.viewersModal) {
            domElements.viewersModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
        
    } catch (error) {
        console.error('Error opening viewers modal:', error);
        showToast('Error loading viewers', 'error');
    }
}

/**
 * Open enhanced viewers modal
 * @param {string} statusId - Status ID
 */
async function openEnhancedViewersModal(statusId) {
    try {
        currentEnhancedModalStatusId = statusId;
        
        // Load viewers and reactions
        await Promise.all([
            loadStatusViewers(statusId),
            loadStatusReactions(statusId)
        ]);
        
        // Update tab counts
        if (domElements.viewersTabCount) {
            domElements.viewersTabCount.textContent = currentStatusViewers.length;
        }
        
        if (domElements.reactionsTabCount) {
            domElements.reactionsTabCount.textContent = currentStatusReactions.length;
        }
        
        // Show modal
        if (domElements.enhancedViewersModal) {
            domElements.enhancedViewersModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
            // Switch to viewers tab by default
            switchEnhancedTab('viewers');
        }
        
    } catch (error) {
        console.error('Error opening enhanced viewers modal:', error);
        showToast('Error loading viewers and reactions', 'error');
    }
}

/**
 * Switch enhanced tab
 * @param {string} tab - Tab to switch to
 */
function switchEnhancedTab(tab) {
    // Update tab buttons
    if (domElements.tabButtons) {
        domElements.tabButtons.forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    // Update tab contents
    if (domElements.tabContents) {
        domElements.tabContents.forEach(content => {
            if (content.id === `${tab}TabContent`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }
}

/**
 * Close viewers modal
 */
function closeViewersModal() {
    if (domElements.viewersModal) {
        domElements.viewersModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // Clear data
    currentStatusViewers = [];
}

/**
 * Close enhanced viewers modal
 */
function closeEnhancedViewersModal() {
    if (domElements.enhancedViewersModal) {
        domElements.enhancedViewersModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // Clear data
    currentStatusViewers = [];
    currentStatusReactions = [];
    currentEnhancedModalStatusId = null;
}

/**
 * Load status viewers
 * @param {string} statusId - Status ID
 */
async function loadStatusViewers(statusId) {
    try {
        // Get viewers from Firestore
        const viewersSnapshot = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .orderBy('viewedAt', 'desc')
            .limit(100)
            .get();
        
        currentStatusViewers = [];
        
        // Get user details for each viewer
        for (const doc of viewersSnapshot.docs) {
            const viewData = doc.data();
            
            // Get user data
            const userDoc = await db.collection('users').doc(viewData.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentStatusViewers.push({
                    userId: viewData.userId,
                    displayName: userData.displayName,
                    photoURL: userData.photoURL,
                    viewedAt: viewData.viewedAt,
                    viewDuration: viewData.viewDuration || 0
                });
            }
        }
        
        // Update viewers list UI
        updateViewersList();
        
        // Update enhanced viewers list if modal is open
        if (domElements.enhancedViewersModal && domElements.enhancedViewersModal.style.display !== 'none') {
            updateEnhancedViewersList();
        }
        
    } catch (error) {
        console.error('Error loading status viewers:', error);
        throw error;
    }
}

/**
 * Load status reactions
 * @param {string} statusId - Status ID
 */
async function loadStatusReactions(statusId) {
    try {
        // Get reactions from Firestore
        const reactionsSnapshot = await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
        
        currentStatusReactions = [];
        
        // Get user details for each reaction
        for (const doc of reactionsSnapshot.docs) {
            const reactionData = doc.data();
            
            // Get user data
            const userDoc = await db.collection('users').doc(reactionData.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentStatusReactions.push({
                    userId: reactionData.userId,
                    displayName: userData.displayName,
                    photoURL: userData.photoURL,
                    reaction: reactionData.reaction,
                    timestamp: reactionData.timestamp,
                    isAnonymous: reactionData.isAnonymous || false
                });
            }
        }
        
        // Update reactions list UI
        updateReactionsList();
        
    } catch (error) {
        console.error('Error loading status reactions:', error);
        throw error;
    }
}

/**
 * Update viewers list UI
 */
function updateViewersList() {
    if (!domElements.viewersList) return;
    
    if (currentStatusViewers.length === 0) {
        domElements.viewersList.innerHTML = `
            <div class="empty-viewers">
                <i class="fas fa-eye-slash"></i>
                <p>No viewers yet</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    currentStatusViewers.forEach(viewer => {
        const timeAgo = formatTimeAgo(viewer.viewedAt);
        
        html += `
            <div class="viewer-item">
                <div class="viewer-avatar">
                    <img src="${viewer.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff`}" 
                         alt="${viewer.displayName}"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff'">
                </div>
                <div class="viewer-info">
                    <div class="viewer-name">${escapeHtml(viewer.displayName)}</div>
                    <div class="viewer-time">${timeAgo}</div>
                </div>
            </div>
        `;
    });
    
    domElements.viewersList.innerHTML = html;
}

/**
 * Update enhanced viewers list UI
 */
function updateEnhancedViewersList() {
    if (!domElements.enhancedViewersList) return;
    
    if (currentStatusViewers.length === 0) {
        domElements.enhancedViewersList.innerHTML = `
            <div class="empty-enhanced-viewers">
                <i class="fas fa-eye-slash"></i>
                <p>No viewers yet</p>
                <small>When someone views your status, they'll appear here</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    currentStatusViewers.forEach(viewer => {
        const timeAgo = formatTimeAgo(viewer.viewedAt);
        const viewDuration = viewer.viewDuration > 0 ? `${Math.round(viewer.viewDuration)}s` : '';
        
        html += `
            <div class="enhanced-viewer-item">
                <div class="viewer-avatar">
                    <img src="${viewer.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff`}" 
                         alt="${viewer.displayName}"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff'">
                </div>
                <div class="viewer-details">
                    <div class="viewer-name">${escapeHtml(viewer.displayName)}</div>
                    <div class="viewer-stats">
                        <span class="viewer-time">${timeAgo}</span>
                        ${viewDuration ? `<span class="viewer-duration">• Viewed for ${viewDuration}</span>` : ''}
                    </div>
                </div>
                <div class="viewer-actions">
                    <button class="btn-icon" onclick="messageUser('${viewer.userId}')" title="Message">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    domElements.enhancedViewersList.innerHTML = html;
}

/**
 * Update reactions list UI
 */
function updateReactionsList() {
    if (!domElements.enhancedReactionsList) return;
    
    if (currentStatusReactions.length === 0) {
        domElements.enhancedReactionsList.innerHTML = `
            <div class="empty-reactions">
                <i class="fas fa-heart"></i>
                <p>No reactions yet</p>
                <small>When someone reacts to your status, they'll appear here</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // Group reactions by type
    const reactionsByType = {};
    currentStatusReactions.forEach(reaction => {
        if (!reactionsByType[reaction.reaction]) {
            reactionsByType[reaction.reaction] = [];
        }
        reactionsByType[reaction.reaction].push(reaction);
    });
    
    // Display reactions grouped by type
    Object.entries(reactionsByType).forEach(([emoji, reactions]) => {
        html += `
            <div class="reaction-group">
                <div class="reaction-header">
                    <span class="reaction-emoji">${emoji}</span>
                    <span class="reaction-count">${reactions.length}</span>
                </div>
                <div class="reaction-users">
        `;
        
        reactions.forEach(reaction => {
            const timeAgo = formatTimeAgo(reaction.timestamp);
            
            html += `
                <div class="reaction-user">
                    <div class="user-avatar">
                        <img src="${reaction.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(reaction.displayName)}&background=7C3AED&color=fff`}" 
                             alt="${reaction.displayName}"
                             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(reaction.displayName)}&background=7C3AED&color=fff'">
                    </div>
                    <div class="user-info">
                        <div class="user-name">${escapeHtml(reaction.displayName)}</div>
                        <div class="reaction-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    domElements.enhancedReactionsList.innerHTML = html;
}

/**
 * Add reaction to status
 * @param {string} statusId - Status ID
 * @param {string} reaction - Reaction emoji
 */
async function addReactionToStatus(statusId, reaction) {
    try {
        // Check if user already reacted to this status
        const existingReaction = await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!existingReaction.empty) {
            // Update existing reaction
            await existingReaction.docs[0].ref.update({
                reaction: reaction,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('Reaction updated', 'success');
        } else {
            // Add new reaction
            await db.collection('statusReactions').add({
                statusId: statusId,
                userId: currentUser.uid,
                reaction: reaction,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                isAnonymous: false
            });
            
            // Update reaction count
            await db.collection('statuses').doc(statusId).update({
                reactionCount: firebase.firestore.FieldValue.increment(1)
            });
            
            showToast('Reaction added', 'success');
        }
        
        // Show reaction animation
        showReactionAnimation(reaction);
        
        // Refresh reactions if enhanced modal is open
        if (currentEnhancedModalStatusId === statusId) {
            await loadStatusReactions(statusId);
        }
        
    } catch (error) {
        console.error('Error adding reaction:', error);
        showToast('Error adding reaction', 'error');
    }
}

/**
 * Remove reaction from status
 * @param {string} statusId - Status ID
 */
async function removeReactionFromStatus(statusId) {
    try {
        // Find user's reaction
        const reactionQuery = await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!reactionQuery.empty) {
            // Delete reaction
            await reactionQuery.docs[0].ref.delete();
            
            // Update reaction count
            await db.collection('statuses').doc(statusId).update({
                reactionCount: firebase.firestore.FieldValue.increment(-1)
            });
            
            showToast('Reaction removed', 'success');
            
            // Refresh reactions if enhanced modal is open
            if (currentEnhancedModalStatusId === statusId) {
                await loadStatusReactions(statusId);
            }
        }
        
    } catch (error) {
        console.error('Error removing reaction:', error);
        showToast('Error removing reaction', 'error');
    }
}

/**
 * Show reaction picker
 * @param {Event} event - Click event
 */
function showReactionPicker(event) {
    if (!domElements.reactionPicker) return;
    
    // Position the picker near the click
    const x = event.clientX;
    const y = event.clientY;
    
    domElements.reactionPicker.style.left = `${Math.max(10, x - 100)}px`;
    domElements.reactionPicker.style.top = `${Math.max(10, y - 100)}px`;
    domElements.reactionPicker.style.display = 'block';
}

/**
 * Hide reaction picker
 */
function hideReactionPicker() {
    if (domElements.reactionPicker) {
        domElements.reactionPicker.style.display = 'none';
    }
}

/**
 * Show reaction animation
 * @param {string} reaction - Reaction emoji
 */
function showReactionAnimation(reaction) {
    // Create animation element
    const animation = document.createElement('div');
    animation.className = 'reaction-animation';
    animation.innerHTML = `
        <div class="reaction-emoji">${reaction}</div>
    `;
    
    // Add to status display
    const statusDisplay = document.querySelector('.status-display-area');
    if (statusDisplay) {
        statusDisplay.appendChild(animation);
        
        // Remove after animation
        setTimeout(() => {
            animation.remove();
        }, 1000);
    }
}

// ==================== STATUS MANAGEMENT FUNCTIONS ====================

/**
 * Load status updates
 */
async function loadStatusUpdates() {
    try {
        console.log('📋 Loading status updates...');
        
        if (!domElements.statusUpdates) return;
        
        // Show loading
        domElements.statusUpdates.innerHTML = `
            <div class="loading-status">
                <div class="spinner"></div>
                <p>Loading status updates...</p>
            </div>
        `;
        
        // Check if muted
        if (statusPreferences.muteAllUntil && new Date(statusPreferences.muteAllUntil) > new Date()) {
            domElements.statusUpdates.innerHTML = `
                <div class="muted-status">
                    <i class="fas fa-bell-slash"></i>
                    <h4>Statuses Muted</h4>
                    <p>Status updates are muted</p>
                    <button class="btn-text" onclick="unmuteAllStatuses()">Unmute</button>
                </div>
            `;
            return;
        }
        
        // Get active statuses
        activeStatuses = await getActiveStatuses();
        
        if (activeStatuses.length === 0) {
            domElements.statusUpdates.innerHTML = `
                <div class="no-statuses">
                    <i class="fas fa-camera"></i>
                    <h4>No Status Updates</h4>
                    <p>When your contacts share statuses, they'll appear here</p>
                </div>
            `;
            return;
        }
        
        // Render status updates
        renderStatusUpdatesList(activeStatuses);
        
        // Update active status count
        updateActiveStatusCount(activeStatuses.length);
        
    } catch (error) {
        console.error('❌ Error loading status updates:', error);
        domElements.statusUpdates.innerHTML = `
            <div class="error-loading">
                <i class="fas fa-exclamation-circle"></i>
                <h4>Error Loading</h4>
                <p>Could not load status updates</p>
                <button class="btn-text" onclick="loadStatusUpdates()">Retry</button>
            </div>
        `;
    }
}

/**
 * Get active statuses
 * @returns {Promise<Array>} Active statuses
 */
async function getActiveStatuses() {
    try {
        // Get user's friends/contacts
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const friends = userDoc.data()?.friends || [];
        
        if (friends.length === 0) {
            return [];
        }
        
        // Get active statuses from friends
        // Note: Firestore doesn't support 'in' queries with more than 10 items
        const friendChunks = [];
        for (let i = 0; i < friends.length; i += 10) {
            friendChunks.push(friends.slice(i, i + 10));
        }
        
        let allStatuses = [];
        
        for (const chunk of friendChunks) {
            const statusesSnapshot = await db.collection('statuses')
                .where('userId', 'in', chunk)
                .where('expiresAt', '>', new Date())
                .where('isActive', '==', true)
                .orderBy('expiresAt', 'asc')
                .limit(50)
                .get();
            
            statusesSnapshot.docs.forEach(doc => {
                allStatuses.push({ id: doc.id, ...doc.data() });
            });
        }
        
        // Filter by privacy and check which have been viewed
        const filteredStatuses = [];
        
        for (const status of allStatuses) {
            // Check privacy
            if (!await canViewStatus(status)) {
                continue;
            }
            
            // Check if viewed
            const viewSnapshot = await db.collection('statusViews')
                .where('statusId', '==', status.id)
                .where('userId', '==', currentUser.uid)
                .limit(1)
                .get();
            
            status.hasBeenViewed = !viewSnapshot.empty;
            filteredStatuses.push(status);
        }
        
        // Group by user and sort (unviewed first, then by timestamp)
        const groupedByUser = {};
        
        filteredStatuses.forEach(status => {
            if (!groupedByUser[status.userId]) {
                groupedByUser[status.userId] = {
                    userInfo: {
                        userId: status.userId,
                        displayName: status.userDisplayName,
                        photoURL: status.userPhotoURL
                    },
                    statuses: []
                };
            }
            groupedByUser[status.userId].statuses.push(status);
        });
        
        // Convert to array and sort
        const userStatusArray = Object.values(groupedByUser)
            .map(userData => {
                // Sort user's statuses by timestamp (newest first)
                userData.statuses.sort((a, b) => {
                    const timeA = a.timestamp?.toDate?.() || 0;
                    const timeB = b.timestamp?.toDate?.() || 0;
                    return timeB - timeA;
                });
                
                // Check if any status is unviewed
                userData.hasUnviewed = userData.statuses.some(s => !s.hasBeenViewed);
                userData.latestStatus = userData.statuses[0];
                userData.statusCount = userData.statuses.length;
                
                return userData;
            })
            .sort((a, b) => {
                // Unviewed first
                if (a.hasUnviewed && !b.hasUnviewed) return -1;
                if (!a.hasUnviewed && b.hasUnviewed) return 1;
                
                // Then by latest timestamp
                const timeA = a.latestStatus.timestamp?.toDate?.() || 0;
                const timeB = b.latestStatus.timestamp?.toDate?.() || 0;
                return timeB - timeA;
            });
        
        return userStatusArray;
        
    } catch (error) {
        console.error('Error getting active statuses:', error);
        return [];
    }
}

/**
 * Render status updates list
 * @param {Array} userStatusArray - User status data array
 */
function renderStatusUpdatesList(userStatusArray) {
    if (!domElements.statusUpdates) return;
    
    let html = '<div class="status-updates-grid">';
    
    userStatusArray.forEach(userData => {
        const user = userData.userInfo;
        const hasUnviewed = userData.hasUnviewed;
        const statusCount = userData.statusCount;
        const latestStatus = userData.latestStatus;
        const timeAgo = formatTimeAgo(latestStatus.timestamp);
        
        html += `
            <div class="status-update-item ${hasUnviewed ? 'unviewed' : 'viewed'}" 
                 data-user-id="${user.userId}"
                 data-status-id="${latestStatus.id}">
                <div class="status-avatar-container">
                    <div class="status-avatar">
                        <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff`}" 
                             alt="${user.displayName}" 
                             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff'">
                        ${hasUnviewed ? '<div class="unviewed-indicator"></div>' : ''}
                    </div>
                    <div class="status-ring ${hasUnviewed ? 'active' : ''}">
                        <div class="status-ring-inner"></div>
                    </div>
                </div>
                <div class="status-info">
                    <h4>${user.displayName}</h4>
                    <div class="status-meta">
                        <span class="status-time">${timeAgo}</span>
                        ${statusCount > 1 ? `<span class="status-count">${statusCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    domElements.statusUpdates.innerHTML = html;
}

/**
 * Load my statuses
 */
async function loadMyStatuses() {
    try {
        console.log('📱 Loading my statuses...');
        
        if (!domElements.myStatusList) return;
        
        myActiveStatuses = await getMyActiveStatuses();
        
        if (myActiveStatuses.length === 0) {
            domElements.myStatusList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-camera"></i>
                    <h4>No status yet</h4>
                    <p>Share a photo, video, or text update</p>
                    <button id="addFirstStatusBtn" class="btn-primary">Create Status</button>
                </div>
            `;
            
            // Add event listener to the button
            setTimeout(() => {
                const addFirstStatusBtn = document.getElementById('addFirstStatusBtn');
                if (addFirstStatusBtn) {
                    addFirstStatusBtn.addEventListener('click', openStatusCreation);
                }
            }, 100);
            
            return;
        }
        
        // Render my statuses
        renderMyStatusesList(myActiveStatuses);
        
    } catch (error) {
        console.error('Error loading my statuses:', error);
        domElements.myStatusList.innerHTML = `
            <div class="error-loading">
                <i class="fas fa-exclamation-circle"></i>
                <h4>Error Loading</h4>
                <p>Could not load your statuses</p>
                <button class="btn-text" onclick="loadMyStatuses()">Retry</button>
            </div>
        `;
    }
}

/**
 * Get my active statuses
 * @returns {Promise<Array>} My active statuses
 */
async function getMyActiveStatuses() {
    try {
        const statusesSnapshot = await db.collection('statuses')
            .where('userId', '==', currentUser.uid)
            .where('expiresAt', '>', new Date())
            .where('isActive', '==', true)
            .orderBy('expiresAt', 'asc')
            .limit(20)
            .get();
        
        const statuses = statusesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Sort by timestamp (newest first)
        statuses.sort((a, b) => {
            const timeA = a.timestamp?.toDate?.() || 0;
            const timeB = b.timestamp?.toDate?.() || 0;
            return timeB - timeA;
        });
        
        return statuses;
        
    } catch (error) {
        console.error('Error getting my active statuses:', error);
        return [];
    }
}

/**
 * Render my statuses list
 * @param {Array} statuses - Statuses array
 */
function renderMyStatusesList(statuses) {
    if (!domElements.myStatusList) return;
    
    let html = '<div class="my-statuses-grid">';
    
    statuses.forEach(status => {
        const timeAgo = formatTimeAgo(status.timestamp);
        const viewCount = status.viewCount || 0;
        const reactionCount = status.reactionCount || 0;
        
        html += `
            <div class="my-status-item" data-status-id="${status.id}">
                <div class="my-status-preview">
                    ${getStatusPreviewHTML(status)}
                </div>
                <div class="my-status-info">
                    <div class="status-stats">
                        <span><i class="fas fa-eye"></i> ${viewCount}</span>
                        <span><i class="fas fa-heart"></i> ${reactionCount}</span>
                    </div>
                    <div class="status-time">${timeAgo}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    domElements.myStatusList.innerHTML = html;
    
    // Add click event listeners
    setTimeout(() => {
        document.querySelectorAll('.my-status-item').forEach(item => {
            item.addEventListener('click', function() {
                const statusId = this.dataset.statusId;
                viewMyStatus(statusId);
            });
        });
    }, 100);
}

/**
 * Get status preview HTML
 * @param {Object} status - Status data
 * @returns {string} Preview HTML
 */
function getStatusPreviewHTML(status) {
    switch (status.type) {
        case 'text':
            const textContent = status.content || '';
            const displayText = textContent.length > 30 ? textContent.substring(0, 30) + '...' : textContent;
            return `
                <div class="text-preview">
                    <div class="text-preview-content">${escapeHtml(displayText)}</div>
                </div>
            `;
            
        case 'image':
            return `
                <div class="image-preview" style="background-image: url('${status.content}')">
                    <div class="preview-overlay">
                        <i class="fas fa-image"></i>
                    </div>
                </div>
            `;
            
        case 'video':
            return `
                <div class="video-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
            `;
            
        case 'audio':
            return `
                <div class="audio-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-volume-up"></i>
                    </div>
                </div>
            `;
            
        case 'emoji':
            return `
                <div class="emoji-preview">
                    <div class="preview-overlay">
                        <span class="emoji-large">${status.content}</span>
                    </div>
                </div>
            `;
            
        case 'gif':
            return `
                <div class="gif-preview" style="background-image: url('${status.content}')">
                    <div class="preview-overlay">
                        <i class="fas fa-film"></i>
                    </div>
                </div>
            `;
            
        case 'location':
            return `
                <div class="location-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                </div>
            `;
            
        default:
            return `
                <div class="unknown-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-file"></i>
                    </div>
                </div>
            `;
    }
}

/**
 * View my status
 * @param {string} statusId - Status ID to view
 */
async function viewMyStatus(statusId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = { id: statusDoc.id, ...statusDoc.data() };
        
        // Check ownership
        if (status.userId !== currentUser.uid) {
            showToast('You can only view your own statuses here', 'error');
            return;
        }
        
        // Set as current viewing
        currentStatusViewing = {
            userId: currentUser.uid,
            statuses: [status],
            currentIndex: 0,
            viewedStatuses: new Set([0]),
            startTime: new Date()
        };
        
        currentStatusIndex = 0;
        
        // Open viewer
        if (domElements.statusModal) {
            domElements.statusModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
        
        await showStatusAtIndex(0);
        
    } catch (error) {
        console.error('Error viewing my status:', error);
        showToast('Error loading status', 'error');
    }
}

/**
 * Update active status count
 * @param {number} count - Active status count
 */
function updateActiveStatusCount(count) {
    const countElement = document.getElementById('activeStatusCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

/**
 * Update status ring
 */
function updateStatusRing() {
    if (!domElements.statusRing || !domElements.statusRingInner) return;
    
    // Check if user has active statuses
    const hasActiveStatuses = myActiveStatuses.length > 0;
    
    if (hasActiveStatuses) {
        domElements.statusRing.classList.add('has-status');
        domElements.statusRingInner.style.animation = 'pulse 2s infinite';
    } else {
        domElements.statusRing.classList.remove('has-status');
        domElements.statusRingInner.style.animation = 'none';
    }
}

// ==================== DRAFT MANAGEMENT ====================

/**
 * Save status draft
 */
async function saveStatusDraft() {
    try {
        console.log('💾 Saving draft...');
        
        // Update draft with current values
        updateDraftFromUI();
        
        // Generate draft ID if not exists
        if (!statusDraft.draftId) {
            statusDraft.draftId = generateId();
        }
        
        statusDraft.updatedAt = new Date();
        
        // Find if draft already exists
        const existingIndex = statusDrafts.findIndex(d => d.draftId === statusDraft.draftId);
        
        if (existingIndex !== -1) {
            // Update existing draft
            statusDrafts[existingIndex] = { ...statusDraft };
        } else {
            // Add new draft
            if (!statusDraft.createdAt) {
                statusDraft.createdAt = new Date();
            }
            statusDrafts.push({ ...statusDraft });
        }
        
        // Limit drafts to 10
        if (statusDrafts.length > 10) {
            statusDrafts = statusDrafts.slice(-10);
        }
        
        // Save to Firestore
        await db.collection('users').doc(currentUser.uid).update({
            statusDrafts: statusDrafts
        });
        
        // Update UI
        updateDraftsList();
        
        showToast('Draft saved successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error saving draft:', error);
        showToast('Error saving draft', 'error');
    }
}

/**
 * Update draft from UI
 */
function updateDraftFromUI() {
    // Update caption
    if (domElements.statusCaption) {
        statusDraft.caption = domElements.statusCaption.value;
    }
    
    // Update privacy
    if (domElements.statusPrivacy) {
        statusDraft.privacy = domElements.statusPrivacy.value;
    }
    
    // Update expiry
    if (domElements.statusExpiry) {
        const expiryValue = domElements.statusExpiry.value;
        if (expiryValue === 'custom') {
            // Keep existing custom duration
        } else {
            statusDraft.customDuration = parseInt(expiryValue);
        }
    }
    
    // Note: Other fields (content, type, etc.) are updated in their respective handlers
}

/**
 * Update drafts list UI
 */
function updateDraftsList() {
    const draftsList = document.getElementById('draftsList');
    if (!draftsList) return;
    
    if (statusDrafts.length === 0) {
        draftsList.innerHTML = '<p class="no-drafts">No drafts</p>';
        return;
    }
    
    let html = '<div class="drafts-grid">';
    
    // Show latest drafts (most recent first)
    const recentDrafts = [...statusDrafts]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);
    
    recentDrafts.forEach(draft => {
        const preview = getDraftPreviewHTML(draft);
        const timeAgo = formatTimeAgo(draft.updatedAt);
        
        html += `
            <div class="draft-item" data-draft-id="${draft.draftId}">
                <div class="draft-preview">
                    ${preview}
                </div>
                <div class="draft-info">
                    <span class="draft-type">${draft.type}</span>
                    <span class="draft-time">${timeAgo}</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    draftsList.innerHTML = html;
    
    // Add click event listeners
    setTimeout(() => {
        document.querySelectorAll('.draft-item').forEach(item => {
            item.addEventListener('click', function() {
                const draftId = this.dataset.draftId;
                loadDraft(draftId);
            });
        });
    }, 100);
}

/**
 * Get draft preview HTML
 * @param {Object} draft - Draft object
 * @returns {string} Preview HTML
 */
function getDraftPreviewHTML(draft) {
    switch (draft.type) {
        case 'text':
            const textContent = draft.content || '';
            const displayText = textContent.length > 20 ? textContent.substring(0, 20) + '...' : textContent;
            return `
                <div class="text-draft">
                    <div class="draft-text-content">${escapeHtml(displayText)}</div>
                </div>
            `;
            
        case 'image':
            return `
                <div class="image-draft">
                    <i class="fas fa-image"></i>
                </div>
            `;
            
        case 'video':
            return `
                <div class="video-draft">
                    <i class="fas fa-video"></i>
                </div>
            `;
            
        case 'audio':
            return `
                <div class="audio-draft">
                    <i class="fas fa-microphone"></i>
                </div>
            `;
            
        case 'emoji':
            return `
                <div class="emoji-draft">
                    <span class="draft-emoji">${draft.content || '😀'}</span>
                </div>
            `;
            
        default:
            return `
                <div class="unknown-draft">
                    <i class="fas fa-file"></i>
                </div>
            `;
    }
}

/**
 * Load draft
 * @param {string} draftId - Draft ID to load
 */
async function loadDraft(draftId) {
    const draft = statusDrafts.find(d => d.draftId === draftId);
    if (!draft) {
        showToast('Draft not found', 'error');
        return;
    }
    
    // Load draft into current draft
    Object.assign(statusDraft, draft);
    
    // Open creation modal
    openStatusCreation();
    
    // Update UI with draft data
    updateUIFromDraft(draft);
    
    showToast('Draft loaded', 'success');
}

/**
 * Update UI from draft
 * @param {Object} draft - Draft object
 */
function updateUIFromDraft(draft) {
    // Update status type
    switchStatusType(draft.type);
    
    // Update caption
    if (domElements.statusCaption) {
        domElements.statusCaption.value = draft.caption || '';
    }
    
    // Update privacy
    if (domElements.statusPrivacy) {
        domElements.statusPrivacy.value = draft.privacy || 'myContacts';
    }
    
    // Update expiry
    if (domElements.statusExpiry) {
        domElements.statusExpiry.value = draft.customDuration?.toString() || '86400';
    }
    
    // Update text content if text status
    if (draft.type === 'text' && domElements.statusTextInput) {
        domElements.statusTextInput.value = draft.content || '';
        customizeTextStatus({
            text: draft.content,
            font: draft.font,
            color: draft.color,
            backgroundColor: draft.backgroundColor,
            fontSize: draft.fontSize
        });
    }
    
    // Load media preview if media status
    if ((draft.type === 'image' || draft.type === 'video' || draft.type === 'audio') && draft.content) {
        // This would need to recreate the file from the data URL
        // For simplicity, we'll just update the draft
        // In a real implementation, you would recreate the File object
    }
}

// ==================== STATUS EXPIRY MODAL ====================

/**
 * Open status expiry modal
 */
function openStatusExpiryModal() {
    if (domElements.statusExpiryModal) {
        domElements.statusExpiryModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close status expiry modal
 */
function closeStatusExpiryModal() {
    if (domElements.statusExpiryModal) {
        domElements.statusExpiryModal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// ==================== NOTIFICATION FUNCTIONS ====================

/**
 * Show status notification
 * @param {Object} status - Status data
 */
function showStatusNotification(status) {
    // Check if notifications are supported
    if (!('Notification' in window)) {
        return;
    }
    
    // Check if permission is granted
    if (Notification.permission === 'granted') {
        createStatusNotification(status);
    } else if (Notification.permission !== 'denied') {
        // Request permission
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                createStatusNotification(status);
            }
        });
    }
}

/**
 * Create status notification
 * @param {Object} status - Status data
 */
function createStatusNotification(status) {
    const notification = new Notification(`${status.userDisplayName} posted a status`, {
        body: status.type === 'text' ? status.content.substring(0, 100) : `New ${status.type} status`,
        icon: status.userPhotoURL || 'https://ui-avatars.com/api/?name=Status&background=7C3AED&color=fff',
        tag: `status-${status.id}`
    });
    
    notification.onclick = function() {
        window.focus();
        openStatusViewer(status.id);
        notification.close();
    };
}

// ==================== BACKGROUND SERVICES ====================

/**
 * Start background services
 */
function startBackgroundServices() {
    console.log('⚙️ Starting background services...');
    
    // Status expiration checker
    startStatusExpirationChecker();
    
    // Draft cleanup (every hour)
    startDraftCleanup();
    
    // Status notifications checker
    startStatusNotificationsChecker();
}

/**
 * Start status expiration checker
 */
function startStatusExpirationChecker() {
    // Check every minute
    statusExpirationInterval = setInterval(async () => {
        try {
            const now = new Date();
            
            // Find expired statuses
            const expiredSnapshot = await db.collection('statuses')
                .where('expiresAt', '<=', now)
                .where('isActive', '==', true)
                .limit(50)
                .get();
            
            if (!expiredSnapshot.empty) {
                const batch = db.batch();
                
                expiredSnapshot.docs.forEach(doc => {
                    batch.update(doc.ref, {
                        isActive: false,
                        expiredAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                await batch.commit();
                
                console.log(`✅ Archived ${expiredSnapshot.size} expired statuses`);
                
                // Refresh UI if needed
                loadStatusUpdates();
                loadMyStatuses();
                updateStatusRing();
            }
            
        } catch (error) {
            console.error('Error checking expired statuses:', error);
        }
    }, 60000);
}

/**
 * Start draft cleanup
 */
function startDraftCleanup() {
    // Clean up old drafts (older than 7 days)
    draftCleanupInterval = setInterval(() => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        statusDrafts = statusDrafts.filter(draft => {
            const draftDate = draft.updatedAt ? new Date(draft.updatedAt) : new Date(draft.createdAt);
            return draftDate > sevenDaysAgo;
        });
        
        // Update UI if needed
        updateDraftsList();
    }, 3600000); // Check every hour
}

/**
 * Start status notifications checker
 */
function startStatusNotificationsChecker() {
    // Check for new statuses every 30 seconds
    setInterval(async () => {
        try {
            // Get last check time from localStorage
            const lastCheck = localStorage.getItem('lastStatusCheck') || 0;
            const now = Date.now();
            
            // Get new statuses since last check
            const newStatuses = await getNewStatusesSince(lastCheck);
            
            // Show notifications for new statuses
            newStatuses.forEach(status => {
                if (status.userId !== currentUser.uid) {
                    showStatusNotification(status);
                }
            });
            
            // Update last check time
            localStorage.setItem('lastStatusCheck', now.toString());
            
        } catch (error) {
            console.error('Error checking for new statuses:', error);
        }
    }, 30000);
}

/**
 * Get new statuses since timestamp
 * @param {number} timestamp - Timestamp to check since
 * @returns {Promise<Array>} New statuses
 */
async function getNewStatusesSince(timestamp) {
    try {
        // Get user's friends
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const friends = userDoc.data()?.friends || [];
        
        if (friends.length === 0) {
            return [];
        }
        
        // Convert timestamp to Date
        const sinceDate = new Date(parseInt(timestamp));
        
        // Get statuses since timestamp (limited to first 10 friends for performance)
        const recentFriends = friends.slice(0, 10);
        
        let newStatuses = [];
        
        for (const friendId of recentFriends) {
            const statusesSnapshot = await db.collection('statuses')
                .where('userId', '==', friendId)
                .where('timestamp', '>', sinceDate)
                .where('isActive', '==', true)
                .limit(5)
                .get();
            
            statusesSnapshot.docs.forEach(doc => {
                newStatuses.push({ id: doc.id, ...doc.data() });
            });
        }
        
        return newStatuses;
        
    } catch (error) {
        console.error('Error getting new statuses:', error);
        return [];
    }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} type - Type of toast (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `status-toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            ${type === 'success' ? '<i class="fas fa-check-circle"></i>' :
              type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' :
              type === 'warning' ? '<i class="fas fa-exclamation-triangle"></i>' :
              '<i class="fas fa-info-circle"></i>'}
        </div>
        <div class="toast-message">${escapeHtml(message)}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Generate unique ID
 * @returns {string} Unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Format time ago
 * @param {Date|Object} date - Date to format
 * @returns {string} Formatted time ago
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
}*/


/**
 * Get font family from font name
 * @param {string} fontName - Font name
 * @returns {string} CSS font-family value
 */
function getFontFamily(fontName) {
    const fonts = {
        'default': 'system-ui, -apple-system, sans-serif',
        'arial': 'Arial, sans-serif',
        'comic': '"Comic Sans MS", cursive',
        'courier': '"Courier New", monospace',
        'georgia': 'Georgia, serif',
        'impact': 'Impact, sans-serif'
    };
    
    return fonts[fontName] || fonts.default;
}

/**
 * Darken a color
 * @param {string} color - Hex color
 * @param {number} percent - Percentage to darken
 * @returns {string} Darkened hex color
 */
function darkenColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = parseInt(R * (100 - percent) / 100);
    G = parseInt(G * (100 - percent) / 100);
    B = parseInt(B * (100 - percent) / 100);

    R = (R < 0) ? 0 : R;
    G = (G < 0) ? 0 : G;
    B = (B < 0) ? 0 : B;

    const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

    return "#" + RR + GG + BB;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Convert data URL to blob
 * @param {string} dataURL - Data URL
 * @returns {Blob} Blob object
 */
function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], { type: mime });
}

/**
 * Get file extension from type
 * @param {string} type - File type
 * @returns {string} File extension
 */
function getFileExtension(type) {
    switch (type) {
        case 'image': return 'jpg';
        case 'video': return 'mp4';
        case 'audio': return 'webm';
        default: return 'txt';
    }
}

/**
 * Get MIME type from file type
 * @param {string} type - File type
 * @returns {string} MIME type
 */
function getMimeType(type) {
    switch (type) {
        case 'image': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'audio': return 'audio/webm';
        default: return 'text/plain';
    }
}

/**
 * Download media file
 * @param {string} url - Media URL
 * @param {string} filename - Filename
 */
async function downloadMedia(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        await downloadBlob(blob, filename);
    } catch (error) {
        console.error('Error downloading media:', error);
        throw error;
    }
}

/**
 * Download blob
 * @param {Blob} blob - Blob to download
 * @param {string} filename - Filename
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Check if user can view a status
 * @param {Object} status - Status to check
 * @returns {Promise<boolean>} Whether user can view
 */
async function canViewStatus(status) {
    // User can always view their own statuses
    if (status.userId === currentUser.uid) {
        return true;
    }
    
    // Check privacy settings
    switch (status.privacy) {
        case 'everyone':
            return true;
            
        case 'myContacts':
            // Check if current user is in status owner's contacts
            const ownerDoc = await db.collection('users').doc(status.userId).get();
            const ownerContacts = ownerDoc.data()?.friends || [];
            return ownerContacts.includes(currentUser.uid);
            
        case 'selectedContacts':
            return status.selectedContacts?.includes(currentUser.uid) || false;
            
        case 'contactsExcept':
            return !(status.exceptContacts?.includes(currentUser.uid)) || false;
            
        case 'hideFrom':
            return !(status.hideFrom?.includes(currentUser.uid)) || false;
            
        default:
            return false;
    }
}

/**
 * Unmute all statuses
 */
function unmuteAllStatuses() {
    console.log('Unmuting all statuses...');
    statusPreferences.muteAllUntil = null;
    showToast('All statuses unmuted', 'success');
    loadStatusUpdates();
    
    return {
        success: true,
        message: 'All statuses unmuted'
    };
}

/**
 * Record status view
 * @param {string} statusId - Status ID
 * @param {boolean} isOwnStatus - Whether it's the user's own status
 */
async function recordStatusView(statusId, isOwnStatus = false) {
    try {
        // Don't record view for own status unless specified
        if (isOwnStatus) {
            // For own status, just update the view count
            await db.collection('statuses').doc(statusId).update({
                viewCount: firebase.firestore.FieldValue.increment(1),
                lastViewedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return;
        }
        
        // Check if already viewed
        const existingView = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!existingView.empty) {
            // Update existing view
            await existingView.docs[0].ref.update({
                viewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                viewDuration: firebase.firestore.FieldValue.increment(1) // Increment view duration
            });
        } else {
            // Record new view
            await db.collection('statusViews').add({
                statusId: statusId,
                userId: currentUser.uid,
                viewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                viewDuration: 1
            });
            
            // Update view count
            await db.collection('statuses').doc(statusId).update({
                viewCount: firebase.firestore.FieldValue.increment(1),
                lastViewedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
    } catch (error) {
        console.error('Error recording status view:', error);
    }
}

/**
 * Load all initial data
 */
function loadAllInitialData() {
    loadStatusUpdates();
    loadMyStatuses();
    updateDraftsList();
    updateStatusRing();
}

/**
 * Switch status tab
 * @param {string} tabName - Tab name to switch to
 */
function switchStatusTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.status-tab');
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Update tab contents
    const tabContents = document.querySelectorAll('.status-tab-content');
    tabContents.forEach(content => {
        if (content.id === `${tabName}Tab`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

/**
 * Stop camera if active
 */
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// ==================== EXPORTS ====================

// Make functions available globally
window.StatusSystem = {
    // Initialization
    init: initStatusSystem,
    
    // Status Creation
    openStatusCreation: openStatusCreation,
    closeStatusCreation: closeStatusCreation,
    switchStatusType: switchStatusType,
    customizeTextStatus: customizeTextStatus,
    postNewStatus: postNewStatus,
    saveStatusDraft: saveStatusDraft,
    
    // Status Viewing
    openStatusViewer: openStatusViewer,
    closeStatusViewer: closeStatusViewer,
    viewMyStatus: viewMyStatus,
    viewUserStatuses: viewUserStatuses,
    showPrevStatus: showPrevStatus,
    showNextStatus: showNextStatus,
    
    // Status Management
    loadStatusUpdates: loadStatusUpdates,
    loadMyStatuses: loadMyStatuses,
    deleteStatus: deleteStatus,
    saveStatus: saveStatus,
    replyToStatus: replyToStatus,
    forwardStatus: forwardStatus,
    
    // Viewers & Reactions
    openViewersModal: openViewersModal,
    openEnhancedViewersModal: openEnhancedViewersModal,
    closeViewersModal: closeViewersModal,
    closeEnhancedViewersModal: closeEnhancedViewersModal,
    addReactionToStatus: addReactionToStatus,
    removeReactionFromStatus: removeReactionFromStatus,
    showReactionPicker: showReactionPicker,
    hideReactionPicker: hideReactionPicker,
    
    // Utility
    showToast: showToast,
    unmuteAllStatuses: unmuteAllStatuses,
    
    // Media Handling
    handleImageUpload: handleImageUpload,
    handleVideoUpload: handleVideoUpload,
    handleAudioUpload: handleAudioUpload,
    clearMediaPreviews: clearMediaPreviews,
    
    // Draft Management
    loadDraft: loadDraft,
    updateDraftsList: updateDraftsList,
    
    // Settings
    openStatusExpiryModal: openStatusExpiryModal,
    closeStatusExpiryModal: closeStatusExpiryModal
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 DOM loaded, initializing Status System...');
    
    // Check if Firebase is available
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        // Initialize after a short delay to ensure everything is loaded
        setTimeout(() => {
            StatusSystem.init();
        }, 1000);
    } else {
        console.warn('Firebase not loaded yet. Status system will initialize when Firebase is ready.');
        // Try again after 2 seconds
        setTimeout(() => {
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                StatusSystem.init();
            } else {
                console.error('Firebase still not loaded. Status system cannot initialize.');
                showToast('Firebase not loaded. Please refresh the page.', 'error');
            }
        }, 2000);
    }
});

=======
// Wait for Firebase to be initialized
if (!window.firebase || !window.db) {
    console.log('⏳ Waiting for Firebase initialization...');
    
    const waitForFirebase = setInterval(() => {
        if (window.firebase && window.db) {
            clearInterval(waitForFirebase);
            console.log('✅ Firebase ready in call.js/groups.js/status.js');
            // Initialize your script here
        }
    }, 100);
} else {
    console.log('✅ Firebase already available');
    // Initialize your script here
}
// status.js - ADD AT THE VERY TOP
// Prevent duplicate declarations
if (window.statusScriptLoaded) {
    console.log('status.js already loaded');
    // Don't re-execute
    throw new Error('status.js already loaded');
}
window.statusScriptLoaded = true;

// Use existing variables if they already exist from chat.js
if (typeof closeStatusViewer !== 'undefined') {
    // Use existing variable
    console.log('Using closeStatusViewer from chat.js');
} else {
    // Define locally
    let closeStatusViewer = null;
    // ... rest of your code
}
// ==================== GLOBAL VARIABLES ====================
let videoEditor = null;
let audioRecorder = null;
let mediaStream = null;
let currentFilter = null;
let stickerLibrary = [];
let musicLibrary = [];
let quickStatusMode = false;
let locationBasedStatuses = new Map();
let oneTimeViewStatuses = new Set();
let statusSuggestions = [];
let automaticStatusTriggers = [];
let boomerangRecorder = null;
let voiceoverRecorder = null;
let draftCleanupInterval = null;
let statusExpirationInterval = null;
let currentStatusViewing = null;
let currentStatusIndex = 0;
let statusViewTimeout = null;
let currentRecording = null;
let cameraStream = null;
let videoRecorder = null;
let recordingChunks = [];
let isRecordingVideo = false;
let recordingStartTime = null;
let statusReactionPicker = null;
let currentEditingMedia = null;
let activeStatusTimers = new Map();
let statusPlaybackInstances = new Map();
let recordingTimerInterval = null;
let voiceRecordingTimerInterval = null;
let voiceRecorder = null;
let voiceRecordingStartTime = null;

// Viewers and Reactions management
let currentStatusViewers = [];
let currentStatusReactions = [];
let currentEnhancedModalStatusId = null;

// Media input elements
let statusImageInput = null;
let statusVideoInput = null;
let statusAudioInput = null;

// DOM elements cache
let domElements = {};

// Status drafts storage
let statusDrafts = [];
let statusHighlights = [];

// Current active statuses
let activeStatuses = [];
let myActiveStatuses = [];

// ==================== STATUS PREFERENCES ====================
const statusPreferences = {
    privacy: 'myContacts',
    perStatusPrivacy: true,
    mutedUsers: [],
    blockedFromViewing: [],
    hideFromUsers: [],
    contactsExcept: [],
    readReceipts: true,
    screenshotAlerts: true,
    contentBlur: false,
    showMusicInfo: true,
    muteAllUntil: null,
    allowReplies: true,
    autoDownload: true,
    saveToGallery: true,
    allowMentions: true,
    locationBased: false,
    quickStatusEnabled: true,
    forwardWithMessage: true,
    boomerangEnabled: true,
    portraitMode: false,
    greenScreenEnabled: false,
    voiceoverEnabled: true,
    drawingTools: true,
    textOverlay: true,
    filtersEnabled: true,
    stickersEnabled: true,
    directCamera: true,
    videoTrimDuration: 30,
    maxStatusDuration: 30,
    musicIntegration: true,
    voiceStatusEnabled: true,
    statusDisappearanceOptions: '24h',
    oneTimeView: false,
    customRingColors: false,
    businessCTAs: [],
    linkInBio: '',
    quickReplies: [],
    awayMessage: '',
    detailedAnalytics: false,
    e2eEncrypted: true,
    disableSaving: false,
    blockScreenshots: true,
    statusSuggestionsEnabled: true,
    automaticStatus: false,
    chatListIntegration: true,
    quickReplyNotification: true,
    shareToSocial: true,
    enableSearch: true,
    expiryOptions: ['24h', '12h', '6h', 'custom'],
    defaultExpiry: '24h',
    statusPrivacy: 'myContacts',
    canReply: 'myContacts',
    canReact: 'myContacts'
};

// ==================== STATUS DRAFT ====================
let statusDraft = {
    type: 'text',
    content: '',
    caption: '',
    background: 'default',
    font: 'default',
    color: '#000000',
    stickers: [],
    gifs: [],
    drawings: [],
    overlays: [],
    mentions: [],
    location: null,
    music: null,
    linkPreview: null,
    scheduleTime: null,
    privacy: 'myContacts',
    selectedContacts: [],
    hideFrom: [],
    exceptContacts: [],
    perStatusPrivacy: null,
    trimStart: 0,
    trimEnd: 30,
    filters: [],
    textOverlays: [],
    doodles: [],
    boomerang: false,
    portraitEffect: false,
    greenScreen: null,
    voiceover: null,
    viewOnce: false,
    customDuration: 86400,
    ringColor: null,
    shareComment: '',
    demographics: {},
    businessLink: '',
    quickReplyTemplate: null,
    awayMessageAuto: null,
    isAutomatic: false,
    triggerType: null,
    encrypted: true,
    mediaMetadata: {},
    editingHistory: [],
    draftId: null,
    createdAt: null,
    updatedAt: null,
    expiryOption: '24h',
    expiryTime: null,
    backgroundColor: '#667eea',
    allowReactions: true,
    viewerCount: 0,
    gifUrl: null,
    stickerId: null,
    locationName: null,
    locationCoordinates: null
};

// ==================== INITIALIZATION ====================

/**
 * Initialize Status System
 */
function initStatusSystem() {
    console.log('🚀 Initializing WhatsApp Status System...');
    
    try {
        // Check if user is logged in
        if (!currentUser || !currentUser.uid) {
            // Wait for DOM and Firebase
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌐 Status system loading...');
    
    // Wait for Firebase
    const checkFirebase = setInterval(() => {
        if (window.firebase && window.firebase.auth) {
            clearInterval(checkFirebase);
            
            // Listen for auth state
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    console.log('✅ User authenticated, initializing status system');
                    initStatusSystem();
                } else {
                    console.log('⏳ Waiting for user login...');
                    // Don't initialize yet
                }
            });
        }
    }, 500);
});
            return;
        }
        
        // Initialize user data
        initializeUserData();
        
        // Create UI elements if they don't exist
        createAllUIElements();
        
        // Cache DOM elements
        cacheDOMElements();
        
        // Setup all event listeners
        setupAllEventListeners();
        
        // Load initial data
        loadAllInitialData();
        
        // Start background services
        startBackgroundServices();
        
        console.log('✅ Status System initialized successfully');
        
    } catch (error) {
        console.error('❌ Error initializing Status System:', error);
        showToast('Error initializing status system', 'error');
    }
}

/**
 * Initialize when both DOM is ready AND Firebase is ready
 */
function initializeStatusSystem() {
    console.log('📱 Initializing Status System...');
    
    // Wait for both DOM ready and Firebase ready
    const checkReady = () => {
        // Check if DOM is ready
        if (document.readyState !== 'loading') {
            // Check if Firebase is ready
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                initStatusSystem();
                return true;
            } else if (window.firebaseReady) {
                initStatusSystem();
                return true;
            }
        }
        return false;
    };
    
    // Try immediately
    if (checkReady()) {
        return;
    }
    
    // Set up listeners
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📱 DOM loaded, checking Firebase...');
        
        if (checkReady()) {
            return;
        }
        
        // If Firebase not ready yet, wait for it
        const checkInterval = setInterval(() => {
            if (checkReady()) {
                clearInterval(checkInterval);
            }
        }, 500);
        
        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (typeof initStatusSystem === 'function') {
                // Try one last time
                if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                    initStatusSystem();
                } else {
                    console.error('❌ Firebase not loaded after timeout.');
                    showToast('Firebase initialization timeout. Please refresh.', 'error');
                }
            }
        }, 10000);
    });
}

// Start initialization
initializeStatusSystem();

console.log('✅ WhatsApp Status System module loaded');

/**
 * Initialize user data and setup all components
 */
async function initializeUserData() {
    try {
        console.log('👤 Loading user data...');
        
        // Load user document
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            currentUserData = userDoc.data();
            
            // Load saved preferences
            if (currentUserData.statusPreferences) {
                Object.assign(statusPreferences, currentUserData.statusPreferences);
            }
            
            // Load drafts
            if (currentUserData.statusDrafts) {
                statusDrafts = currentUserData.statusDrafts;
            }
            
            // Load highlights
            if (currentUserData.statusHighlights) {
                statusHighlights = currentUserData.statusHighlights;
            }
            
            // Load user status settings
            if (currentUserData.userStatusSettings) {
                Object.assign(statusPreferences, currentUserData.userStatusSettings);
            }
        } else {
            // Create user document
            await createUserDocument();
        }
        
        // Setup all system components
        setupCompleteSystem();
        
    } catch (error) {
        console.error('❌ Error initializing user data:', error);
        showToast('Error loading user data', 'error');
    }
}

/**
 * Create user document if it doesn't exist
 */
async function createUserDocument() {
    try {
        const userData = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'User',
            photoURL: currentUser.photoURL || '',
            email: currentUser.email || '',
            phoneNumber: currentUser.phoneNumber || '',
            statusPreferences: statusPreferences,
            statusDrafts: [],
            statusHighlights: [],
            friends: [],
            blockedUsers: [],
            statusCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            isBusiness: false,
            privacySettings: {
                statusVisibility: 'myContacts',
                allowMentions: true,
                allowReplies: true
            },
            userStatusSettings: {
                expiryOption: '24h',
                privacy: 'myContacts',
                canReply: 'myContacts',
                canReact: 'myContacts'
            }
        };
        
        await db.collection('users').doc(currentUser.uid).set(userData);
        currentUserData = userData;
        
        console.log('✅ User document created');
        
    } catch (error) {
        console.error('❌ Error creating user document:', error);
        throw error;
    }
}

/**
 * Setup complete status system
 */
function setupCompleteSystem() {
    console.log('🛠️ Setting up complete status system...');
    
    // 1. Create all UI elements
    createAllUIElements();
    
    // 2. Cache DOM elements
    cacheDOMElements();
    
    // 3. Setup all event listeners
    setupAllEventListeners();
    
    // 4. Load all data
    loadAllInitialData();
    
    // 5. Start background services
    startBackgroundServices();
    
    console.log('✅ Status system setup complete');
}

// ==================== UI CREATION ====================

/**
 * Create all necessary UI elements
 */
function createAllUIElements() {
    console.log('🎨 Creating all status UI elements...');
    
    // Main status container
    if (!document.getElementById('statusContainer')) {
        createStatusContainer();
    }
    
    // Status creation modal
    if (!document.getElementById('statusCreationModal')) {
        createStatusCreationModal();
    }
    
    // Status viewer modal
    if (!document.getElementById('statusModal')) {
        createStatusViewerModal();
    }
    
    // Viewers modal
    if (!document.getElementById('viewersModal')) {
        createViewersModal();
    }
    
    // Enhanced viewers modal
    if (!document.getElementById('enhancedViewersModal')) {
        createEnhancedViewersModal();
    }
    
    // Reaction picker
    if (!document.getElementById('reactionPicker')) {
        createReactionPicker();
    }
    
    // Status expiry modal
    if (!document.getElementById('statusExpiryModal')) {
        createStatusExpiryModal();
    }
    
    console.log('✅ All UI elements created');
}

/**
 * Create main status container
 */
function createStatusContainer() {
    const statusContainer = document.createElement('div');
    statusContainer.id = 'statusContainer';
    statusContainer.className = 'status-container';
    statusContainer.innerHTML = `
        <div class="status-header">
            <div class="status-header-left">
                <h2><i class="fas fa-circle"></i> Status</h2>
                <div class="status-indicator">
                    <span class="status-count" id="activeStatusCount">0</span> active
                </div>
            </div>
            <div class="status-header-right">
                <button id="myStatus" class="btn-primary btn-create-status">
                    <i class="fas fa-plus"></i> New Status
                </button>
                <div class="status-actions-dropdown">
                    <button class="btn-icon" id="statusMenuBtn">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="dropdown-menu" id="statusMenu">
                        <button class="dropdown-item" id="searchStatusBtn">
                            <i class="fas fa-search"></i> Search Statuses
                        </button>
                        <button class="dropdown-item" id="muteAllStatusesBtn">
                            <i class="fas fa-bell-slash"></i> Mute All
                        </button>
                        <button class="dropdown-item" id="viewArchivedBtn">
                            <i class="fas fa-archive"></i> Archived
                        </button>
                        <button class="dropdown-item" id="statusSettingsBtn">
                            <i class="fas fa-cog"></i> Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="status-tabs">
            <button class="status-tab active" data-tab="updates">
                <i class="fas fa-eye"></i> Updates
            </button>
            <button class="status-tab" data-tab="myStatusTab">
                <i class="fas fa-user-circle"></i> My Status
            </button>
            <button class="status-tab" data-tab="highlights">
                <i class="fas fa-star"></i> Highlights
            </button>
        </div>
        
        <div class="status-content">
            <div id="updatesTab" class="status-tab-content active">
                <div class="status-updates" id="statusUpdates">
                    <div class="loading-status">
                        <div class="spinner"></div>
                        <p>Loading status updates...</p>
                    </div>
                </div>
            </div>
            
            <div id="myStatusTab" class="status-tab-content">
                <div class="my-status-section">
                    <div class="my-status-header">
                        <h3>My Status</h3>
                        <button id="quickStatusBtn" class="btn-secondary">
                            <i class="fas fa-camera"></i> Quick Status
                        </button>
                    </div>
                    <div class="my-status-list" id="myStatusList">
                        <div class="empty-state">
                            <i class="fas fa-camera"></i>
                            <h4>No status yet</h4>
                            <p>Share a photo, video, or text update</p>
                            <button id="addFirstStatusBtn" class="btn-primary">Create Status</button>
                        </div>
                    </div>
                    
                    <div class="my-drafts-section">
                        <h4>Drafts</h4>
                        <div class="drafts-list" id="draftsList">
                            <p class="no-drafts">No drafts</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="highlightsTab" class="status-tab-content">
                <div class="highlights-section" id="highlightsSection">
                    <div class="empty-state">
                        <i class="fas fa-star"></i>
                        <h4>No highlights yet</h4>
                        <p>Add your favorite statuses to highlights</p>
                        <button id="createHighlightBtn" class="btn-primary">Create Highlight</button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Status Ring Indicator -->
        <div class="status-ring-container">
            <div class="status-ring" id="statusRing">
                <div class="status-ring-inner"></div>
            </div>
        </div>
    `;
    
    // Add to main content area
    const mainContent = document.querySelector('.main-content') || document.body;
    mainContent.appendChild(statusContainer);
}

/**
 * Create status creation modal with all required elements
 */
function createStatusCreationModal() {
    const modal = document.createElement('div');
    modal.id = 'statusCreationModal';
    modal.className = 'status-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeStatusCreation"></div>
        <div class="modal-content status-creation-content">
            <div class="modal-header">
                <h3>Create Status</h3>
                <button class="modal-close" id="closeStatusCreationBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="status-options" id="statusOptions">
                <button class="status-option active" data-type="text">
                    <i class="fas fa-font"></i>
                    <span>Text</span>
                </button>
                <button class="status-option" data-type="image">
                    <i class="fas fa-image"></i>
                    <span>Photo</span>
                </button>
                <button class="status-option" data-type="video">
                    <i class="fas fa-video"></i>
                    <span>Video</span>
                </button>
                <button class="status-option" data-type="audio">
                    <i class="fas fa-microphone"></i>
                    <span>Audio</span>
                </button>
                <button class="status-option" data-type="emoji">
                    <i class="fas fa-smile"></i>
                    <span>Emoji</span>
                </button>
                <button class="status-option" data-type="gif">
                    <i class="fas fa-film"></i>
                    <span>GIF</span>
                </button>
                <button class="status-option" data-type="sticker">
                    <i class="fas fa-sticky-note"></i>
                    <span>Sticker</span>
                </button>
                <button class="status-option" data-type="location">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>Location</span>
                </button>
            </div>
            
            <!-- Hidden file inputs -->
            <input type="file" id="statusImageInput" accept="image/*" style="display: none;">
            <input type="file" id="statusVideoInput" accept="video/*" style="display: none;">
            <input type="file" id="statusAudioInput" accept="audio/*" style="display: none;">
            
            <div class="status-previews" id="statusPreviews">
                <!-- Emoji Preview -->
                <div id="emojiPreview" class="status-preview hidden">
                    <div class="emoji-selector">
                        <input type="text" id="emojiSearch" placeholder="Search emoji..." class="emoji-search">
                        <div class="emoji-grid" id="emojiGrid"></div>
                    </div>
                </div>
                
                <!-- Text Preview -->
                <div id="textPreview" class="status-preview">
                    <div class="text-customization">
                        <textarea id="statusTextInput" placeholder="Type your status here..." maxlength="500" autofocus></textarea>
                        <div class="text-tools">
                            <select id="textFont" class="text-tool">
                                <option value="default">Default Font</option>
                                <option value="arial">Arial</option>
                                <option value="comic">Comic Sans</option>
                                <option value="courier">Courier</option>
                                <option value="georgia">Georgia</option>
                                <option value="impact">Impact</option>
                            </select>
                            <input type="range" id="textSize" min="16" max="72" value="32" class="text-tool">
                            <input type="color" id="customColor" value="#000000" class="text-tool">
                            <div class="color-buttons">
                                <button class="color-btn" data-color="#667eea" style="background-color: #667eea;"></button>
                                <button class="color-btn" data-color="#764ba2" style="background-color: #764ba2;"></button>
                                <button class="color-btn" data-color="#f093fb" style="background-color: #f093fb;"></button>
                                <button class="color-btn" data-color="#f5576c" style="background-color: #f5576c;"></button>
                                <button class="color-btn" data-color="#4facfe" style="background-color: #4facfe;"></button>
                                <button class="color-btn" data-color="#00f2fe" style="background-color: #00f2fe;"></button>
                                <button class="color-btn" data-color="#43e97b" style="background-color: #43e97b;"></button>
                                <button class="color-btn" data-color="#38f9d7" style="background-color: #38f9d7;"></button>
                                <button class="color-btn" data-color="#fa709a" style="background-color: #fa709a;"></button>
                                <button class="color-btn" data-color="#fee140" style="background-color: #fee140;"></button>
                            </div>
                        </div>
                        <div class="text-preview-display" id="textPreviewDisplay">
                            <!-- Dynamic text preview will appear here -->
                        </div>
                    </div>
                </div>
                
                <!-- Image Preview -->
                <div id="imagePreview" class="status-preview hidden">
                    <div class="image-preview-container" id="statusImagePreview">
                        <img id="statusImagePreviewImg" src="" alt="Image preview" style="display: none;">
                        <div class="image-placeholder">
                            <i class="fas fa-image"></i>
                            <p>Select an image to preview</p>
                        </div>
                        <button class="btn-secondary change-media-btn" id="changeImageBtn">
                            <i class="fas fa-exchange-alt"></i> Change Image
                        </button>
                    </div>
                </div>
                
                <!-- Video Preview -->
                <div id="videoPreview" class="status-preview hidden">
                    <div class="video-preview-container" id="statusVideoPreview">
                        <video id="statusVideoPreviewVideo" controls style="display: none;"></video>
                        <div class="video-placeholder">
                            <i class="fas fa-video"></i>
                            <p>Select a video to preview</p>
                        </div>
                        <button class="btn-secondary change-media-btn" id="changeVideoBtn">
                            <i class="fas fa-exchange-alt"></i> Change Video
                        </button>
                    </div>
                </div>
                
                <!-- Audio Preview -->
                <div id="audioPreview" class="status-preview hidden">
                    <div class="audio-preview-container" id="statusAudioPreview">
                        <audio id="statusAudioPreviewAudio" controls style="display: none;"></audio>
                        <div class="audio-placeholder">
                            <i class="fas fa-volume-up"></i>
                            <p>Select audio to preview</p>
                        </div>
                        <button class="btn-secondary change-media-btn" id="changeAudioBtn">
                            <i class="fas fa-exchange-alt"></i> Change Audio
                        </button>
                        <div class="audio-recorder">
                            <button class="btn-secondary" id="recordAudioBtn">
                                <i class="fas fa-microphone"></i> Record
                            </button>
                            <button class="btn-secondary" id="stopRecordingBtn" style="display: none;">
                                <i class="fas fa-stop"></i> Stop
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- GIF Preview -->
                <div id="gifPreview" class="status-preview hidden">
                    <div class="gif-selector">
                        <input type="text" id="gifSearch" placeholder="Search GIFs..." class="gif-search">
                        <div class="gif-grid" id="gifGrid"></div>
                    </div>
                </div>
                
                <!-- Sticker Preview -->
                <div id="stickerPreview" class="status-preview hidden">
                    <div class="sticker-selector">
                        <div class="sticker-grid" id="stickerGrid"></div>
                    </div>
                </div>
                
                <!-- Location Preview -->
                <div id="locationPreview" class="status-preview hidden">
                    <div class="location-selector">
                        <input type="text" id="locationSearch" placeholder="Search location..." class="location-search">
                        <div class="location-map" id="locationMap">
                            <!-- Map will be initialized here -->
                        </div>
                        <div class="location-results" id="locationResults"></div>
                    </div>
                </div>
            </div>
            
            <!-- Status Caption -->
            <div class="status-caption-container">
                <input type="text" id="statusCaption" placeholder="Add a caption (optional)" maxlength="200">
            </div>
            
            <!-- Status Options -->
            <div class="status-options-footer">
                <div class="status-privacy">
                    <select id="statusPrivacy" class="status-privacy-select">
                        <option value="everyone">Everyone</option>
                        <option value="myContacts" selected>My Contacts</option>
                        <option value="selectedContacts">Selected Contacts</option>
                        <option value="contactsExcept">Contacts Except...</option>
                        <option value="hideFrom">Hide From...</option>
                    </select>
                </div>
                
                <div class="status-expiry">
                    <select id="statusExpiry" class="status-expiry-select">
                        <option value="86400">24 hours</option>
                        <option value="43200">12 hours</option>
                        <option value="21600">6 hours</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
            </div>
            
            <!-- Post Status Button -->
            <div class="status-actions">
                <button class="btn-secondary" id="saveDraftBtn">
                    <i class="fas fa-save"></i> Save Draft
                </button>
                <button class="btn-primary" id="postStatus">
                    <i class="fas fa-paper-plane"></i> Post Status
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create status viewer modal
 */
function createStatusViewerModal() {
    const modal = document.createElement('div');
    modal.id = 'statusModal';
    modal.className = 'status-viewer-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeStatusModalOverlay"></div>
        <div class="modal-content status-viewer-content">
            <div class="viewer-header">
                <div class="viewer-user-info">
                    <img class="status-user-avatar" id="statusUserAvatar" src="" alt="">
                    <div class="viewer-user-details">
                        <h4 id="statusUserName"></h4>
                        <div class="viewer-status-info">
                            <span id="statusTime"></span>
                        </div>
                    </div>
                </div>
                <div class="viewer-header-actions">
                    <button class="btn-icon" id="closeStatusModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="viewer-body">
                <div class="status-display-container">
                    <div class="status-nav prev">
                        <button class="nav-btn" id="prevStatusBtn">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                    </div>
                    
                    <div class="status-display-area">
                        <!-- Status content will be loaded here -->
                        <div id="statusMedia"></div>
                        <div id="statusText" class="status-text-content"></div>
                        <div id="statusCaptionDisplay" class="status-caption-display"></div>
                    </div>
                    
                    <div class="status-nav next">
                        <button class="nav-btn" id="nextStatusBtn">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Status Expiry Progress -->
                <div class="status-expiry-container">
                    <div class="expiry-progress-bar">
                        <div class="expiry-progress" id="statusExpiryProgress"></div>
                    </div>
                    <div class="expiry-info">
                        <span id="expiryTime"></span>
                        <div class="expiry-metrics">
                            <span id="viewersCount">0 viewers</span>
                            <button class="btn-text" id="viewViewersBtn">View All</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="viewer-footer">
                <div class="viewer-reactions">
                    <button class="reaction-btn" data-reaction="❤️">
                        <span>❤️</span>
                    </button>
                    <button class="reaction-btn" data-reaction="😂">
                        <span>😂</span>
                    </button>
                    <button class="reaction-btn" data-reaction="😮">
                        <span>😮</span>
                    </button>
                    <button class="reaction-btn" data-reaction="😢">
                        <span>😢</span>
                    </button>
                    <button class="reaction-btn" data-reaction="👏">
                        <span>👏</span>
                    </button>
                    <button class="reaction-btn" id="moreReactionsBtn">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                
                <div class="viewer-actions">
                    <button class="action-btn" id="replyStatusBtn">
                        <i class="fas fa-reply"></i>
                        <span>Reply</span>
                    </button>
                    <button class="action-btn" id="forwardStatusBtn">
                        <i class="fas fa-share"></i>
                        <span>Forward</span>
                    </button>
                    <button class="action-btn" id="saveStatusBtn">
                        <i class="fas fa-download"></i>
                        <span>Save</span>
                    </button>
                    <button class="action-btn" id="deleteStatusBtn" style="display: none;">
                        <i class="fas fa-trash"></i>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create viewers modal
 */
function createViewersModal() {
    const modal = document.createElement('div');
    modal.id = 'viewersModal';
    modal.className = 'viewers-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeViewersModal"></div>
        <div class="modal-content viewers-modal-content">
            <div class="modal-header">
                <h3>Viewers</h3>
                <button class="modal-close" id="closeViewersModalBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="viewers-list" id="viewersList">
                <!-- Viewers will be loaded here -->
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create enhanced viewers modal with tabs
 */
function createEnhancedViewersModal() {
    const modal = document.createElement('div');
    modal.id = 'enhancedViewersModal';
    modal.className = 'enhanced-viewers-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeEnhancedViewersModal"></div>
        <div class="modal-content enhanced-viewers-content">
            <div class="modal-header">
                <h3>Viewers & Reactions</h3>
                <button class="modal-close" id="closeEnhancedViewersModalBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="enhanced-tabs">
                <button class="tab-button active" data-tab="viewers">
                    <i class="fas fa-eye"></i>
                    <span>Viewers</span>
                    <span class="tab-count" id="viewersTabCount">0</span>
                </button>
                <button class="tab-button" data-tab="reactions">
                    <i class="fas fa-heart"></i>
                    <span>Reactions</span>
                    <span class="tab-count" id="reactionsTabCount">0</span>
                </button>
            </div>
            
            <div class="tab-content active" id="viewersTabContent">
                <div class="enhanced-viewers-list" id="enhancedViewersList">
                    <!-- Enhanced viewers list will be loaded here -->
                </div>
            </div>
            
            <div class="tab-content" id="reactionsTabContent">
                <div class="enhanced-reactions-list" id="enhancedReactionsList">
                    <!-- Reactions list will be loaded here -->
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Create reaction picker
 */
function createReactionPicker() {
    const picker = document.createElement('div');
    picker.id = 'reactionPicker';
    picker.className = 'reaction-picker';
    picker.style.display = 'none';
    picker.innerHTML = `
        <div class="reaction-options">
            <button class="reaction-option" data-reaction="❤️">❤️</button>
            <button class="reaction-option" data-reaction="😍">😍</button>
            <button class="reaction-option" data-reaction="😂">😂</button>
            <button class="reaction-option" data-reaction="😮">😮</button>
            <button class="reaction-option" data-reaction="😢">😢</button>
            <button class="reaction-option" data-reaction="😡">😡</button>
            <button class="reaction-option" data-reaction="👏">👏</button>
            <button class="reaction-option" data-reaction="🔥">🔥</button>
            <button class="reaction-option" data-reaction="👍">👍</button>
            <button class="reaction-option" data-reaction="👎">👎</button>
            <button class="reaction-option" data-reaction="🎉">🎉</button>
            <button class="reaction-option" data-reaction="🤔">🤔</button>
        </div>
    `;
    
    document.body.appendChild(picker);
}

/**
 * Create status expiry modal
 */
function createStatusExpiryModal() {
    const modal = document.createElement('div');
    modal.id = 'statusExpiryModal';
    modal.className = 'status-expiry-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-overlay" id="closeExpiryModal"></div>
        <div class="modal-content expiry-modal-content">
            <div class="modal-header">
                <h3>Set Custom Duration</h3>
                <button class="modal-close" id="closeExpiryModalBtn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="expiry-options">
                <div class="expiry-option" data-hours="1">
                    <span>1 hour</span>
                </div>
                <div class="expiry-option" data-hours="2">
                    <span>2 hours</span>
                </div>
                <div class="expiry-option" data-hours="4">
                    <span>4 hours</span>
                </div>
                <div class="expiry-option" data-hours="8">
                    <span>8 hours</span>
                </div>
                <div class="expiry-option" data-hours="12">
                    <span>12 hours</span>
                </div>
                <div class="expiry-option" data-hours="24">
                    <span>24 hours</span>
                </div>
                <div class="expiry-option custom">
                    <input type="number" id="customHours" min="1" max="168" value="24" placeholder="Hours">
                    <span>hours</span>
                </div>
            </div>
            <div class="expiry-actions">
                <button class="btn-secondary" id="cancelExpiryBtn">Cancel</button>
                <button class="btn-primary" id="setExpiryBtn">Set Duration</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ==================== DOM ELEMENTS CACHING ====================

/**
 * Cache all DOM elements for quick access
 */
function cacheDOMElements() {
    console.log('🔍 Caching DOM elements...');
    
    // Status Creation Modal Elements
    domElements.statusCreationModal = document.getElementById('statusCreationModal');
    domElements.closeStatusCreation = document.getElementById('closeStatusCreation');
    domElements.closeStatusCreationBtn = document.getElementById('closeStatusCreationBtn');
    domElements.postStatus = document.getElementById('postStatus');
    domElements.statusCaption = document.getElementById('statusCaption');
    
    // File Inputs
    domElements.statusImageInput = document.getElementById('statusImageInput');
    domElements.statusVideoInput = document.getElementById('statusVideoInput');
    domElements.statusAudioInput = document.getElementById('statusAudioInput');
    
    // Status Options
    domElements.statusOptions = document.getElementById('statusOptions');
    domElements.statusOption = document.querySelectorAll('.status-option');
    
    // Status Previews
    domElements.statusPreviews = document.getElementById('statusPreviews');
    domElements.emojiPreview = document.getElementById('emojiPreview');
    domElements.textPreview = document.getElementById('textPreview');
    domElements.imagePreview = document.getElementById('imagePreview');
    domElements.videoPreview = document.getElementById('videoPreview');
    domElements.audioPreview = document.getElementById('audioPreview');
    domElements.gifPreview = document.getElementById('gifPreview');
    domElements.stickerPreview = document.getElementById('stickerPreview');
    domElements.locationPreview = document.getElementById('locationPreview');
    
    // Text Status Customization
    domElements.statusTextInput = document.getElementById('statusTextInput');
    domElements.textFont = document.getElementById('textFont');
    domElements.textSize = document.getElementById('textSize');
    domElements.customColor = document.getElementById('customColor');
    domElements.colorButtons = document.querySelectorAll('.color-btn');
    domElements.textPreviewDisplay = document.getElementById('textPreviewDisplay');
    
    // Media Previews
    domElements.statusImagePreviewImg = document.getElementById('statusImagePreviewImg');
    domElements.statusVideoPreviewVideo = document.getElementById('statusVideoPreviewVideo');
    domElements.statusAudioPreviewAudio = document.getElementById('statusAudioPreviewAudio');
    domElements.changeImageBtn = document.getElementById('changeImageBtn');
    domElements.changeVideoBtn = document.getElementById('changeVideoBtn');
    domElements.changeAudioBtn = document.getElementById('changeAudioBtn');
    domElements.recordAudioBtn = document.getElementById('recordAudioBtn');
    domElements.stopRecordingBtn = document.getElementById('stopRecordingBtn');
    
    // Status Options Footer
    domElements.statusPrivacy = document.getElementById('statusPrivacy');
    domElements.statusExpiry = document.getElementById('statusExpiry');
    domElements.saveDraftBtn = document.getElementById('saveDraftBtn');
    
    // Status Viewer Modal Elements
    domElements.statusModal = document.getElementById('statusModal');
    domElements.statusUserAvatar = document.getElementById('statusUserAvatar');
    domElements.statusUserName = document.getElementById('statusUserName');
    domElements.statusTime = document.getElementById('statusTime');
    domElements.closeStatusModal = document.getElementById('closeStatusModal');
    domElements.closeStatusModalOverlay = document.getElementById('closeStatusModalOverlay');
    
    // Status Display Elements
    domElements.statusMedia = document.getElementById('statusMedia');
    domElements.statusText = document.getElementById('statusText');
    domElements.statusCaptionDisplay = document.getElementById('statusCaptionDisplay');
    
    // Status Expiry & Metrics
    domElements.statusExpiryProgress = document.getElementById('statusExpiryProgress');
    domElements.expiryTime = document.getElementById('expiryTime');
    domElements.viewersCount = document.getElementById('viewersCount');
    domElements.viewViewersBtn = document.getElementById('viewViewersBtn');
    
    // Status Navigation
    domElements.prevStatusBtn = document.getElementById('prevStatusBtn');
    domElements.nextStatusBtn = document.getElementById('nextStatusBtn');
    
    // Status Interaction Buttons
    domElements.deleteStatusBtn = document.getElementById('deleteStatusBtn');
    domElements.replyStatusBtn = document.getElementById('replyStatusBtn');
    domElements.forwardStatusBtn = document.getElementById('forwardStatusBtn');
    domElements.saveStatusBtn = document.getElementById('saveStatusBtn');
    
    // Status Reactions
    domElements.reactionBtns = document.querySelectorAll('.reaction-btn');
    domElements.moreReactionsBtn = document.getElementById('moreReactionsBtn');
    domElements.reactionPicker = document.getElementById('reactionPicker');
    domElements.reactionOptions = document.querySelectorAll('.reaction-option');
    
    // Viewers & Reactions Modals
    domElements.viewersModal = document.getElementById('viewersModal');
    domElements.enhancedViewersModal = document.getElementById('enhancedViewersModal');
    domElements.viewersList = document.getElementById('viewersList');
    domElements.enhancedViewersList = document.getElementById('enhancedViewersList');
    domElements.enhancedReactionsList = document.getElementById('enhancedReactionsList');
    domElements.closeViewersModal = document.getElementById('closeViewersModal');
    domElements.closeViewersModalBtn = document.getElementById('closeViewersModalBtn');
    domElements.closeEnhancedViewersModal = document.getElementById('closeEnhancedViewersModal');
    domElements.closeEnhancedViewersModalBtn = document.getElementById('closeEnhancedViewersModalBtn');
    
    // Enhanced Viewers Tabs
    domElements.tabButtons = document.querySelectorAll('.tab-button');
    domElements.tabContents = document.querySelectorAll('.tab-content');
    domElements.viewersTabCount = document.getElementById('viewersTabCount');
    domElements.reactionsTabCount = document.getElementById('reactionsTabCount');
    
    // My Status Elements
    domElements.myStatus = document.getElementById('myStatus');
    domElements.myStatusList = document.getElementById('myStatusList');
    domElements.addFirstStatusBtn = document.getElementById('addFirstStatusBtn');
    domElements.quickStatusBtn = document.getElementById('quickStatusBtn');
    
    // Status Updates List
    domElements.statusUpdates = document.getElementById('statusUpdates');
    
    // Status Ring
    domElements.statusRing = document.getElementById('statusRing');
    domElements.statusRingInner = document.querySelector('.status-ring-inner');
    
    // Status Expiry Modal
    domElements.statusExpiryModal = document.getElementById('statusExpiryModal');
    domElements.customHours = document.getElementById('customHours');
    domElements.setExpiryBtn = document.getElementById('setExpiryBtn');
    domElements.cancelExpiryBtn = document.getElementById('cancelExpiryBtn');
    
    // Drafts
    domElements.draftsList = document.getElementById('draftsList');
    
    console.log('✅ DOM elements cached');
}

// ==================== EVENT LISTENERS SETUP ====================

/**
 * Setup ALL event listeners for the entire system
 */
function setupAllEventListeners() {
    console.log('🎯 Setting up ALL event listeners...');
    
    // Wait a bit to ensure DOM is ready
    setTimeout(() => {
        // 1. Status Creation Event Listeners
        setupStatusCreationListeners();
        
        // 2. Status Viewing Event Listeners
        setupStatusViewingListeners();
        
        // 3. Viewers & Reactions Event Listeners
        setupViewersReactionsListeners();
        
        // 4. Status Reactions Event Listeners
        setupStatusReactionsListeners();
        
        // 5. Additional Event Listeners
        setupAdditionalListeners();
        
        console.log('✅ All event listeners setup complete');
    }, 500);
}

/**
 * Setup status creation event listeners
 */
function setupStatusCreationListeners() {
    console.log('🔧 Setting up status creation listeners...');
    
    // My Status Button
    if (domElements.myStatus) {
        domElements.myStatus.addEventListener('click', openStatusCreation);
    }
    
    // Add First Status Button
    if (domElements.addFirstStatusBtn) {
        domElements.addFirstStatusBtn.addEventListener('click', openStatusCreation);
    }
    
    // Quick Status Button
    if (domElements.quickStatusBtn) {
        domElements.quickStatusBtn.addEventListener('click', openQuickStatus);
    }
    
    // Status option clicks
    if (domElements.statusOption) {
        domElements.statusOption.forEach(option => {
            option.addEventListener('click', function() {
                const type = this.dataset.type;
                switchStatusType(type);
            });
        });
    }
    
    // Close status creation
    if (domElements.closeStatusCreation) {
        domElements.closeStatusCreation.addEventListener('click', closeStatusCreation);
    }
    
    if (domElements.closeStatusCreationBtn) {
        domElements.closeStatusCreationBtn.addEventListener('click', closeStatusCreation);
    }
    
    // File input changes
    if (domElements.statusImageInput) {
        domElements.statusImageInput.addEventListener('change', handleImageUpload);
    }
    
    if (domElements.statusVideoInput) {
        domElements.statusVideoInput.addEventListener('change', handleVideoUpload);
    }
    
    if (domElements.statusAudioInput) {
        domElements.statusAudioInput.addEventListener('change', handleAudioUpload);
    }
    
    // Color selection
    if (domElements.colorButtons) {
        domElements.colorButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const color = this.dataset.color;
                customizeTextStatus({ backgroundColor: color });
            });
        });
    }
    
    // Text customization
    if (domElements.textFont) {
        domElements.textFont.addEventListener('change', function() {
            customizeTextStatus({ font: this.value });
        });
    }
    
    if (domElements.textSize) {
        domElements.textSize.addEventListener('input', function() {
            customizeTextStatus({ fontSize: this.value + 'px' });
        });
    }
    
    if (domElements.customColor) {
        domElements.customColor.addEventListener('input', function() {
            customizeTextStatus({ color: this.value });
        });
    }
    
    if (domElements.statusTextInput) {
        domElements.statusTextInput.addEventListener('input', function() {
            customizeTextStatus({ text: this.value });
        });
    }
    
    // Change media buttons
    if (domElements.changeImageBtn) {
        domElements.changeImageBtn.addEventListener('click', () => {
            domElements.statusImageInput.click();
        });
    }
    
    if (domElements.changeVideoBtn) {
        domElements.changeVideoBtn.addEventListener('click', () => {
            domElements.statusVideoInput.click();
        });
    }
    
    if (domElements.changeAudioBtn) {
        domElements.changeAudioBtn.addEventListener('click', () => {
            domElements.statusAudioInput.click();
        });
    }
    
    // Audio recording
    if (domElements.recordAudioBtn) {
        domElements.recordAudioBtn.addEventListener('click', startAudioRecording);
    }
    
    if (domElements.stopRecordingBtn) {
        domElements.stopRecordingBtn.addEventListener('click', stopAudioRecording);
    }
    
    // Post status
    if (domElements.postStatus) {
        domElements.postStatus.addEventListener('click', postNewStatus);
    }
    
    // Save draft
    if (domElements.saveDraftBtn) {
        domElements.saveDraftBtn.addEventListener('click', saveStatusDraft);
    }
    
    // Status expiry selection
    if (domElements.statusExpiry) {
        domElements.statusExpiry.addEventListener('change', function() {
            if (this.value === 'custom') {
                openStatusExpiryModal();
            } else {
                statusDraft.customDuration = parseInt(this.value);
            }
        });
    }
    
    // Status privacy selection
    if (domElements.statusPrivacy) {
        domElements.statusPrivacy.addEventListener('change', function() {
            statusDraft.privacy = this.value;
        });
    }
    
    // Status caption
    if (domElements.statusCaption) {
        domElements.statusCaption.addEventListener('input', function() {
            statusDraft.caption = this.value;
        });
    }
}

/**
 * Setup status viewing event listeners
 */
function setupStatusViewingListeners() {
    console.log('🔧 Setting up status viewing listeners...');
    
    // Status item clicks in statusUpdates
    if (domElements.statusUpdates) {
        domElements.statusUpdates.addEventListener('click', function(e) {
            const statusItem = e.target.closest('.status-update-item');
            if (statusItem) {
                e.preventDefault();
                e.stopPropagation();
                const statusId = statusItem.dataset.statusId;
                const userId = statusItem.dataset.userId;
                if (statusId) {
                    openStatusViewer(statusId);
                } else if (userId) {
                    viewUserStatuses(userId);
                }
            }
        });
    }
    
    // Close status modal
    if (domElements.closeStatusModal) {
        domElements.closeStatusModal.addEventListener('click', closeStatusViewer);
    }
    
    if (domElements.closeStatusModalOverlay) {
        domElements.closeStatusModalOverlay.addEventListener('click', closeStatusViewer);
    }
    
    // Navigation buttons
    if (domElements.prevStatusBtn) {
        domElements.prevStatusBtn.addEventListener('click', showPrevStatus);
    }
    
    if (domElements.nextStatusBtn) {
        domElements.nextStatusBtn.addEventListener('click', showNextStatus);
    }
    
    // View viewers button
    if (domElements.viewViewersBtn) {
        domElements.viewViewersBtn.addEventListener('click', function() {
            if (currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                openEnhancedViewersModal(statusId);
            }
        });
    }
    
    // Delete status button
    if (domElements.deleteStatusBtn) {
        domElements.deleteStatusBtn.addEventListener('click', function() {
            if (currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                deleteStatus(statusId);
            }
        });
    }
    
    // Reply to status
    if (domElements.replyStatusBtn) {
        domElements.replyStatusBtn.addEventListener('click', replyToStatus);
    }
    
    // Forward status
    if (domElements.forwardStatusBtn) {
        domElements.forwardStatusBtn.addEventListener('click', forwardStatus);
    }
    
    // Save status
    if (domElements.saveStatusBtn) {
        domElements.saveStatusBtn.addEventListener('click', saveStatus);
    }
}

/**
 * Setup viewers & reactions event listeners
 */
function setupViewersReactionsListeners() {
    console.log('🔧 Setting up viewers & reactions listeners...');
    
    // Tab button clicks
    if (domElements.tabButtons) {
        domElements.tabButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const tab = this.dataset.tab;
                switchEnhancedTab(tab);
            });
        });
    }
    
    // Close viewers modal
    if (domElements.closeViewersModal) {
        domElements.closeViewersModal.addEventListener('click', closeViewersModal);
    }
    
    if (domElements.closeViewersModalBtn) {
        domElements.closeViewersModalBtn.addEventListener('click', closeViewersModal);
    }
    
    // Close enhanced viewers modal
    if (domElements.closeEnhancedViewersModal) {
        domElements.closeEnhancedViewersModal.addEventListener('click', closeEnhancedViewersModal);
    }
    
    if (domElements.closeEnhancedViewersModalBtn) {
        domElements.closeEnhancedViewersModalBtn.addEventListener('click', closeEnhancedViewersModal);
    }
}

/**
 * Setup status reactions event listeners
 */
function setupStatusReactionsListeners() {
    console.log('🔧 Setting up status reactions listeners...');
    
    // Reaction buttons in viewer footer
    if (domElements.reactionBtns) {
        domElements.reactionBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const reaction = this.dataset.reaction;
                if (reaction && currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                    const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                    addReactionToStatus(statusId, reaction);
                }
            });
        });
    }
    
    // More reactions button
    if (domElements.moreReactionsBtn) {
        domElements.moreReactionsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showReactionPicker(e);
        });
    }
    
    // Reaction options in picker
    if (domElements.reactionOptions) {
        domElements.reactionOptions.forEach(option => {
            option.addEventListener('click', function() {
                const reaction = this.dataset.reaction;
                if (reaction && currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]) {
                    const statusId = currentStatusViewing.statuses[currentStatusIndex].id;
                    addReactionToStatus(statusId, reaction);
                    hideReactionPicker();
                }
            });
        });
    }
    
    // Close reaction picker when clicking outside
    document.addEventListener('click', function(e) {
        if (domElements.reactionPicker && 
            !domElements.reactionPicker.contains(e.target) && 
            !e.target.closest('.reaction-btn') &&
            domElements.reactionPicker.style.display !== 'none') {
            hideReactionPicker();
        }
    });
}

/**
 * Setup additional event listeners
 */
function setupAdditionalListeners() {
    console.log('🔧 Setting up additional listeners...');
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Escape to close modals
        if (e.key === 'Escape') {
            if (domElements.statusCreationModal && domElements.statusCreationModal.style.display !== 'none') {
                closeStatusCreation();
            } else if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
                closeStatusViewer();
            } else if (domElements.viewersModal && domElements.viewersModal.style.display !== 'none') {
                closeViewersModal();
            } else if (domElements.enhancedViewersModal && domElements.enhancedViewersModal.style.display !== 'none') {
                closeEnhancedViewersModal();
            } else if (domElements.reactionPicker && domElements.reactionPicker.style.display !== 'none') {
                hideReactionPicker();
            } else if (domElements.statusExpiryModal && domElements.statusExpiryModal.style.display !== 'none') {
                closeStatusExpiryModal();
            }
        }
        
        // Arrow keys for status navigation
        if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
            if (e.key === 'ArrowLeft') {
                showPrevStatus();
            } else if (e.key === 'ArrowRight') {
                showNextStatus();
            }
        }
    });
    
    // Status expiry modal listeners
    const closeExpiryModal = document.getElementById('closeExpiryModal');
    const closeExpiryModalBtn = document.getElementById('closeExpiryModalBtn');
    const expiryOptions = document.querySelectorAll('.expiry-option');
    
    if (closeExpiryModal) closeExpiryModal.addEventListener('click', closeStatusExpiryModal);
    if (closeExpiryModalBtn) closeExpiryModalBtn.addEventListener('click', closeStatusExpiryModal);
    
    if (domElements.cancelExpiryBtn) {
        domElements.cancelExpiryBtn.addEventListener('click', closeStatusExpiryModal);
    }
    
    if (domElements.setExpiryBtn) {
        domElements.setExpiryBtn.addEventListener('click', function() {
            const customHours = document.getElementById('customHours');
            if (customHours && customHours.value) {
                const hours = parseInt(customHours.value);
                if (hours >= 1 && hours <= 168) {
                    statusDraft.customDuration = hours * 3600;
                    if (domElements.statusExpiry) {
                        domElements.statusExpiry.value = 'custom';
                    }
                    showToast(`Duration set to ${hours} hours`, 'success');
                    closeStatusExpiryModal();
                } else {
                    showToast('Please enter a value between 1 and 168 hours', 'error');
                }
            }
        });
    }
    
    if (expiryOptions) {
        expiryOptions.forEach(option => {
            option.addEventListener('click', function() {
                if (!this.classList.contains('custom')) {
                    const hours = parseInt(this.dataset.hours);
                    statusDraft.customDuration = hours * 3600;
                    if (domElements.statusExpiry) {
                        domElements.statusExpiry.value = hours * 3600;
                    }
                    showToast(`Duration set to ${hours} hours`, 'success');
                    closeStatusExpiryModal();
                }
            });
        });
    }
    
    // Touch gestures for mobile
    if ('ontouchstart' in window) {
        setupTouchGestures();
    }
    
    // Status tabs
    const statusTabs = document.querySelectorAll('.status-tab');
    statusTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchStatusTab(tabName);
        });
    });
}

/**
 * Setup touch gestures for mobile
 */
function setupTouchGestures() {
    console.log('📱 Setting up touch gestures...');
    
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    
    document.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, false);
    
    document.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, false);
    
    function handleSwipe() {
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;
        
        // Only consider horizontal swipes with minimal vertical movement
        if (Math.abs(diffY) < 50) {
            if (diffX > 50) {
                // Swipe left - next status
                if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
                    showNextStatus();
                }
            } else if (diffX < -50) {
                // Swipe right - previous status
                if (domElements.statusModal && domElements.statusModal.style.display !== 'none') {
                    showPrevStatus();
                }
            }
        }
    }
}

// ==================== STATUS CREATION FUNCTIONS ====================

/**
 * Open status creation modal
 */
function openStatusCreation() {
    console.log('📝 Opening status creation...');
    
    // Reset draft
    resetStatusDraft();
    
    // Show modal
    if (domElements.statusCreationModal) {
        domElements.statusCreationModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Focus text input
        setTimeout(() => {
            if (domElements.statusTextInput) {
                domElements.statusTextInput.focus();
            }
        }, 100);
    }
    
    // Update UI with current settings
    updateCreationUI();
}

/**
 * Open quick status (camera mode)
 */
function openQuickStatus() {
    console.log('📸 Opening quick status...');
    quickStatusMode = true;
    openStatusCreation();
    switchStatusType('image');
    
    // In a real implementation, this would open the camera
    // For now, we'll just trigger the image input
    setTimeout(() => {
        if (domElements.statusImageInput) {
            domElements.statusImageInput.click();
        }
    }, 500);
}

/**
 * Close status creation modal
 */
function closeStatusCreation() {
    console.log('📝 Closing status creation...');
    
    if (domElements.statusCreationModal) {
        domElements.statusCreationModal.style.display = 'none';
        document.body.style.overflow = '';
        
        // Stop camera if active
        stopCamera();
        
        // Stop audio recording if active
        if (voiceRecorder && voiceRecorder.state === 'recording') {
            stopAudioRecording();
        }
        
        // Clear media previews
        clearMediaPreviews();
    }
    
    // Reset quick status mode
    quickStatusMode = false;
}

/**
 * Reset status draft to defaults
 */
function resetStatusDraft() {
    statusDraft = {
        type: 'text',
        content: '',
        caption: '',
        background: 'default',
        font: 'default',
        color: '#000000',
        stickers: [],
        gifs: [],
        drawings: [],
        overlays: [],
        mentions: [],
        location: null,
        music: null,
        linkPreview: null,
        scheduleTime: null,
        privacy: statusPreferences.privacy,
        selectedContacts: [],
        hideFrom: [],
        exceptContacts: [],
        perStatusPrivacy: null,
        trimStart: 0,
        trimEnd: 30,
        filters: [],
        textOverlays: [],
        doodles: [],
        boomerang: false,
        portraitEffect: false,
        greenScreen: null,
        voiceover: null,
        viewOnce: false,
        customDuration: 86400,
        ringColor: null,
        shareComment: '',
        demographics: {},
        businessLink: '',
        quickReplyTemplate: null,
        awayMessageAuto: null,
        isAutomatic: false,
        triggerType: null,
        encrypted: statusPreferences.e2eEncrypted,
        mediaMetadata: {},
        editingHistory: [],
        draftId: generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        expiryOption: '24h',
        expiryTime: null,
        backgroundColor: '#667eea',
        allowReactions: true,
        viewerCount: 0,
        gifUrl: null,
        stickerId: null,
        locationName: null,
        locationCoordinates: null
    };
}

/**
 * Update creation UI with current draft settings
 */
function updateCreationUI() {
    // Update privacy option
    if (domElements.statusPrivacy) {
        domElements.statusPrivacy.value = statusDraft.privacy;
    }
    
    // Update expiry option
    if (domElements.statusExpiry) {
        domElements.statusExpiry.value = statusDraft.customDuration.toString();
    }
    
    // Update caption
    if (domElements.statusCaption) {
        domElements.statusCaption.value = statusDraft.caption || '';
    }
    
    // Update text preview
    customizeTextStatus();
}

/**
 * Switch status type
 * @param {string} type - Status type to switch to
 */
function switchStatusType(type) {
    console.log(`🔄 Switching to ${type} status`);
    
    // Update status option buttons
    if (domElements.statusOption) {
        domElements.statusOption.forEach(option => {
            if (option.dataset.type === type) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }
    
    // Hide all previews
    const previews = document.querySelectorAll('.status-preview');
    previews.forEach(preview => {
        preview.classList.add('hidden');
    });
    
    // Show selected preview
    const selectedPreview = document.getElementById(`${type}Preview`);
    if (selectedPreview) {
        selectedPreview.classList.remove('hidden');
    }
    
    // Update draft type
    statusDraft.type = type;
    
    // Handle type-specific initialization
    switch (type) {
        case 'image':
            // Initialize image preview
            break;
        case 'video':
            // Initialize video preview
            break;
        case 'audio':
            // Initialize audio preview
            break;
        case 'emoji':
            // Load emoji grid
            loadEmojiGrid();
            break;
        case 'gif':
            // Load GIF search
            loadGIFSearch();
            break;
        case 'sticker':
            // Load sticker grid
            loadStickerGrid();
            break;
        case 'location':
            // Initialize location search
            initializeLocationSearch();
            break;
    }
}

/**
 * Handle image upload
 * @param {Event} event - File upload event
 */
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('📸 Handling image upload');
    
    // Validate file
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('Image too large (max 10MB)', 'error');
        return;
    }
    
    // Preview image
    await previewStatusMedia(file, 'image');
    
    // Reset input
    event.target.value = '';
}

/**
 * Handle video upload
 * @param {Event} event - File upload event
 */
async function handleVideoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('🎥 Handling video upload');
    
    // Validate file
    if (!file.type.startsWith('video/')) {
        showToast('Please select a video file', 'error');
        return;
    }
    
    // Check file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
        showToast('Video too large (max 20MB)', 'error');
        return;
    }
    
    // Check duration (max 30 seconds)
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = function() {
        window.URL.revokeObjectURL(video.src);
        const duration = video.duration;
        
        if (duration > 30) {
            showToast('Video too long (max 30 seconds)', 'error');
            return;
        }
        
        // Preview video if duration is valid
        previewStatusMedia(file, 'video').then(() => {
            // Reset input
            event.target.value = '';
        });
    };
    
    video.src = URL.createObjectURL(file);
}

/**
 * Handle audio upload
 * @param {Event} event - File upload event
 */
async function handleAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('🎵 Handling audio upload');
    
    // Validate file
    if (!file.type.startsWith('audio/')) {
        showToast('Please select an audio file', 'error');
        return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Audio file too large (max 5MB)', 'error');
        return;
    }
    
    // Preview audio
    await previewStatusMedia(file, 'audio');
    
    // Reset input
    event.target.value = '';
}

/**
 * Preview status media
 * @param {File} file - Media file
 * @param {string} type - Media type
 */
async function previewStatusMedia(file, type) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const result = e.target.result;
            
            switch (type) {
                case 'image':
                    // Update image preview
                    if (domElements.statusImagePreviewImg) {
                        domElements.statusImagePreviewImg.src = result;
                        domElements.statusImagePreviewImg.style.display = 'block';
                        // Hide placeholder
                        const placeholder = document.querySelector('.image-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    }
                    // Update draft
                    statusDraft.content = result;
                    statusDraft.type = 'image';
                    statusDraft.mediaMetadata = {
                        type: 'image',
                        size: file.size,
                        name: file.name
                    };
                    break;
                    
                case 'video':
                    // Update video preview
                    if (domElements.statusVideoPreviewVideo) {
                        domElements.statusVideoPreviewVideo.src = result;
                        domElements.statusVideoPreviewVideo.style.display = 'block';
                        // Hide placeholder
                        const placeholder = document.querySelector('.video-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    }
                    // Update draft
                    statusDraft.content = result;
                    statusDraft.type = 'video';
                    statusDraft.mediaMetadata = {
                        type: 'video',
                        size: file.size,
                        name: file.name
                    };
                    break;
                    
                case 'audio':
                    // Update audio preview
                    if (domElements.statusAudioPreviewAudio) {
                        domElements.statusAudioPreviewAudio.src = result;
                        domElements.statusAudioPreviewAudio.style.display = 'block';
                        // Hide placeholder
                        const placeholder = document.querySelector('.audio-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    }
                    // Update draft
                    statusDraft.content = result;
                    statusDraft.type = 'audio';
                    statusDraft.mediaMetadata = {
                        type: 'audio',
                        size: file.size,
                        name: file.name
                    };
                    break;
            }
            
            // Switch to appropriate tab
            switchStatusType(type);
            
            resolve();
        };
        
        reader.onerror = function() {
            showToast('Error reading file', 'error');
            resolve();
        };
        
        reader.readAsDataURL(file);
    });
}

/**
 * Customize text status
 * @param {Object} options - Customization options
 */
function customizeTextStatus(options = {}) {
    // Update draft with provided options
    if (options.text !== undefined) {
        statusDraft.content = options.text;
    }
    if (options.font !== undefined) {
        statusDraft.font = options.font;
    }
    if (options.color !== undefined) {
        statusDraft.color = options.color;
    }
    if (options.backgroundColor !== undefined) {
        statusDraft.backgroundColor = options.backgroundColor;
    }
    if (options.fontSize !== undefined) {
        statusDraft.fontSize = options.fontSize;
    }
    
    // Update text preview display
    if (domElements.textPreviewDisplay) {
        let html = '';
        
        if (statusDraft.content) {
            html = `
                <div class="text-status-preview" style="
                    background: linear-gradient(135deg, ${statusDraft.backgroundColor} 0%, ${darkenColor(statusDraft.backgroundColor, 20)} 100%);
                    color: ${statusDraft.color};
                    font-family: ${getFontFamily(statusDraft.font)};
                    font-size: ${statusDraft.fontSize || '32px'};
                    padding: 40px 20px;
                    border-radius: 15px;
                    min-height: 200px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    word-break: break-word;
                    overflow: hidden;
                ">
                    ${escapeHtml(statusDraft.content)}
                </div>
            `;
        } else {
            html = `
                <div class="text-placeholder" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 40px 20px;
                    border-radius: 15px;
                    min-height: 200px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    color: white;
                    opacity: 0.7;
                ">
                    <div>
                        <i class="fas fa-font" style="font-size: 48px; margin-bottom: 10px;"></i>
                        <p>Your text will appear here</p>
                    </div>
                </div>
            `;
        }
        
        domElements.textPreviewDisplay.innerHTML = html;
    }
}

/**
 * Start audio recording
 */
async function startAudioRecording() {
    try {
        console.log('🎤 Starting audio recording...');
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Audio recording not supported', 'error');
            return;
        }
        
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        
        // Initialize MediaRecorder
        voiceRecorder = new MediaRecorder(stream);
        const audioChunks = [];
        
        voiceRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        voiceRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Create file object
            const file = new File([audioBlob], `audio_${Date.now()}.webm`, {
                type: 'audio/webm',
                lastModified: Date.now()
            });
            
            // Preview audio
            await previewStatusMedia(file, 'audio');
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Update UI
            if (domElements.recordAudioBtn) {
                domElements.recordAudioBtn.style.display = 'block';
            }
            if (domElements.stopRecordingBtn) {
                domElements.stopRecordingBtn.style.display = 'none';
            }
            
            showToast('Audio recorded successfully', 'success');
        };
        
        // Start recording
        voiceRecorder.start();
        
        // Update UI
        if (domElements.recordAudioBtn) {
            domElements.recordAudioBtn.style.display = 'none';
        }
        if (domElements.stopRecordingBtn) {
            domElements.stopRecordingBtn.style.display = 'block';
        }
        
        showToast('Recording... Click stop when done', 'info');
        
    } catch (error) {
        console.error('Error starting audio recording:', error);
        showToast('Error accessing microphone', 'error');
    }
}

/**
 * Stop audio recording
 */
function stopAudioRecording() {
    if (voiceRecorder && voiceRecorder.state === 'recording') {
        voiceRecorder.stop();
    }
}

/**
 * Clear media previews
 */
function clearMediaPreviews() {
    // Clear image preview
    if (domElements.statusImagePreviewImg) {
        domElements.statusImagePreviewImg.src = '';
        domElements.statusImagePreviewImg.style.display = 'none';
        const imagePlaceholder = document.querySelector('.image-placeholder');
        if (imagePlaceholder) {
            imagePlaceholder.style.display = 'flex';
        }
    }
    
    // Clear video preview
    if (domElements.statusVideoPreviewVideo) {
        domElements.statusVideoPreviewVideo.src = '';
        domElements.statusVideoPreviewVideo.style.display = 'none';
        const videoPlaceholder = document.querySelector('.video-placeholder');
        if (videoPlaceholder) {
            videoPlaceholder.style.display = 'flex';
        }
    }
    
    // Clear audio preview
    if (domElements.statusAudioPreviewAudio) {
        domElements.statusAudioPreviewAudio.src = '';
        domElements.statusAudioPreviewAudio.style.display = 'none';
        const audioPlaceholder = document.querySelector('.audio-placeholder');
        if (audioPlaceholder) {
            audioPlaceholder.style.display = 'flex';
        }
    }
    
    // Reset text preview
    if (domElements.statusTextInput) {
        domElements.statusTextInput.value = '';
    }
    if (domElements.textPreviewDisplay) {
        domElements.textPreviewDisplay.innerHTML = '';
    }
    
    // Reset caption
    if (domElements.statusCaption) {
        domElements.statusCaption.value = '';
    }
}

// ==================== STATUS POSTING FUNCTIONS ====================

/**
 * Post new status
 */
async function postNewStatus() {
    try {
        console.log('🚀 Posting new status...');
        
        // Validate status
        if (!validateStatus()) {
            return;
        }
        
        // Show loading
        showToast('Posting status...', 'info');
        
        // Prepare status data
        const statusData = await prepareStatusData();
        
        // Upload media if needed
        if (statusDraft.type === 'image' || statusDraft.type === 'video' || statusDraft.type === 'audio') {
            await uploadStatusMedia(statusData);
        }
        
        // Save to Firestore
        const statusRef = await db.collection('statuses').add(statusData);
        
        // Update user stats
        await updateUserStats();
        
        // Record this as user's own status view
        await recordStatusView(statusRef.id, true);
        
        // Clear draft
        resetStatusDraft();
        
        // Close modal
        closeStatusCreation();
        
        // Show success
        showToast('Status posted successfully!', 'success');
        
        // Refresh status list
        loadStatusUpdates();
        loadMyStatuses();
        updateStatusRing();
        
        console.log('✅ Status posted:', statusRef.id);
        
    } catch (error) {
        console.error('❌ Error posting status:', error);
        showToast('Error posting status: ' + error.message, 'error');
    }
}

/**
 * Validate status before posting
 * @returns {boolean} Whether status is valid
 */
function validateStatus() {
    // Check content based on type
    switch (statusDraft.type) {
        case 'text':
            if (!statusDraft.content || statusDraft.content.trim() === '') {
                showToast('Please enter some text for your status', 'error');
                return false;
            }
            if (statusDraft.content.length > 500) {
                showToast('Status text is too long (max 500 characters)', 'error');
                return false;
            }
            break;
            
        case 'image':
        case 'video':
        case 'audio':
            if (!statusDraft.content) {
                showToast('Please select media for your status', 'error');
                return false;
            }
            break;
            
        case 'emoji':
            if (!statusDraft.content) {
                showToast('Please select an emoji for your status', 'error');
                return false;
            }
            break;
            
        case 'gif':
            if (!statusDraft.gifUrl) {
                showToast('Please select a GIF for your status', 'error');
                return false;
            }
            break;
            
        case 'sticker':
            if (!statusDraft.stickerId) {
                showToast('Please select a sticker for your status', 'error');
                return false;
            }
            break;
            
        case 'location':
            if (!statusDraft.locationName || !statusDraft.locationCoordinates) {
                showToast('Please select a location for your status', 'error');
                return false;
            }
            break;
    }
    
    // Check caption length
    if (statusDraft.caption && statusDraft.caption.length > 200) {
        showToast('Caption is too long (max 200 characters)', 'error');
        return false;
    }
    
    return true;
}

/**
 * Prepare status data for Firestore
 * @returns {Promise<Object>} Status data
 */
async function prepareStatusData() {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + statusDraft.customDuration * 1000);
    
    // Determine content based on type
    let content = statusDraft.content;
    let mediaUrl = null;
    
    if (statusDraft.type === 'gif') {
        content = statusDraft.gifUrl;
        mediaUrl = statusDraft.gifUrl;
    } else if (statusDraft.type === 'sticker') {
        content = statusDraft.stickerId;
    } else if (statusDraft.type === 'location') {
        content = JSON.stringify({
            name: statusDraft.locationName,
            coordinates: statusDraft.locationCoordinates
        });
    }
    
    // Basic status data
    const statusData = {
        type: statusDraft.type,
        content: content,
        caption: statusDraft.caption || '',
        userId: currentUser.uid,
        userDisplayName: currentUserData.displayName,
        userPhotoURL: currentUserData.photoURL || '',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAt,
        lastViewedAt: null,
        privacy: statusDraft.privacy,
        viewOnce: statusDraft.viewOnce,
        encrypted: statusDraft.encrypted,
        allowReplies: statusDraft.allowReplies !== false,
        allowReactions: statusDraft.allowReactions !== false,
        location: statusDraft.locationName ? {
            name: statusDraft.locationName,
            coordinates: statusDraft.locationCoordinates
        } : null,
        mentions: statusDraft.mentions || [],
        selectedContacts: statusDraft.selectedContacts || [],
        hideFrom: statusDraft.hideFrom || [],
        exceptContacts: statusDraft.exceptContacts || [],
        viewCount: 0,
        reactionCount: 0,
        replyCount: 0,
        shareCount: 0,
        screenshotCount: 0,
        mediaMetadata: statusDraft.mediaMetadata || {},
        mediaUrl: mediaUrl,
        filters: statusDraft.filters || [],
        textOverlays: statusDraft.textOverlays || [],
        stickers: statusDraft.stickers || [],
        textStyle: statusDraft.type === 'text' ? {
            font: statusDraft.font,
            color: statusDraft.color,
            backgroundColor: statusDraft.backgroundColor,
            fontSize: statusDraft.fontSize
        } : null,
        isBusiness: currentUserData.isBusiness || false,
        businessLink: statusDraft.businessLink || '',
        isActive: true,
        isArchived: false,
        version: '2.0'
    };
    
    return statusData;
}

/**
 * Upload status media to storage
 * @param {Object} statusData - Status data
 */
async function uploadStatusMedia(statusData) {
    if (statusDraft.type === 'text' || !statusDraft.content || !statusDraft.content.startsWith('data:')) {
        return;
    }
    
    try {
        console.log('📤 Uploading media...');
        
        // Generate unique filename
        const fileExtension = getFileExtension(statusDraft.type);
        const fileName = `status_${currentUser.uid}_${Date.now()}.${fileExtension}`;
        const storagePath = `statuses/${currentUser.uid}/${fileName}`;
        
        // Convert data URL to blob
        const blob = dataURLtoBlob(statusDraft.content);
        
        // Upload to Firebase Storage
        const storageRef = storage.ref(storagePath);
        const uploadTask = storageRef.put(blob, {
            contentType: getMimeType(statusDraft.type),
            customMetadata: {
                userId: currentUser.uid,
                statusType: statusDraft.type
            }
        });
        
        // Wait for upload to complete
        await uploadTask;
        
        // Get download URL
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
        
        // Update status data with storage URL
        statusData.content = downloadURL;
        statusData.mediaUrl = downloadURL;
        statusData.storagePath = storagePath;
        
        console.log('✅ Media uploaded:', downloadURL);
        
    } catch (error) {
        console.error('❌ Error uploading media:', error);
        throw error;
    }
}

/**
 * Update user statistics
 */
async function updateUserStats() {
    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        
        await userRef.update({
            statusCount: firebase.firestore.FieldValue.increment(1),
            lastStatusAt: firebase.firestore.FieldValue.serverTimestamp(),
            'userStatusSettings.lastUpdate': firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error('Error updating user stats:', error);
    }
}

// ==================== STATUS VIEWING FUNCTIONS ====================

/**
 * View user statuses
 * @param {string} userId - User ID to view
 */
function viewUserStatuses(userId) {
    console.log('Opening status viewer for user ID:', userId);
    
    // Show loading message
    showToast('Loading user statuses...', 'info');
    
    // You can implement status viewing logic here
    console.log('Would show statuses for user:', userId);
    
    return {
        success: true,
        message: 'Status viewer opened',
        userId: userId
    };
}

/**
 * Open status viewer
 * @param {string} statusId - Status ID to view
 */
async function openStatusViewer(statusId) {
    try {
        console.log(`👁️ Opening status viewer: ${statusId}`);
        
        // Get status data
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = { id: statusDoc.id, ...statusDoc.data() };
        
        // Check if status is expired
        const expiresAt = status.expiresAt?.toDate ? status.expiresAt.toDate() : new Date(status.expiresAt);
        if (expiresAt < new Date()) {
            showToast('This status has expired', 'info');
            return;
        }
        
        // Check privacy settings
        if (!await canViewStatus(status)) {
            showToast('You cannot view this status', 'error');
            return;
        }
        
        // Get other statuses from the same user
        const statusesSnapshot = await db.collection('statuses')
            .where('userId', '==', status.userId)
            .where('expiresAt', '>', new Date())
            .where('isActive', '==', true)
            .orderBy('expiresAt', 'asc')
            .get();
        
        const statuses = statusesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(s => canViewStatus(s)) // Filter by privacy
            .filter(s => s.id !== statusId); // Exclude current status
        
        // Add current status to the beginning
        statuses.unshift(status);
        
        // Set current viewing session
        currentStatusViewing = {
            userId: status.userId,
            statuses: statuses,
            currentIndex: 0,
            viewedStatuses: new Set(),
            startTime: new Date()
        };
        
        currentStatusIndex = 0;
        
        // Open viewer modal
        if (domElements.statusModal) {
            domElements.statusModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
        
        // Show first status
        await showStatusAtIndex(0);
        
        // Record view (if not own status)
        if (status.userId !== currentUser.uid) {
            await recordStatusView(statusId);
        }
        
    } catch (error) {
        console.error('❌ Error opening status viewer:', error);
        showToast('Error loading status', 'error');
    }
}

/**
 * Show status at index
 * @param {number} index - Index to show
 */
async function showStatusAtIndex(index) {
    if (!currentStatusViewing || index < 0 || index >= currentStatusViewing.statuses.length) {
        closeStatusViewer();
        return;
    }
    
    currentStatusIndex = index;
    currentStatusViewing.currentIndex = index;
    
    const status = currentStatusViewing.statuses[index];
    
    // Update viewer UI
    updateStatusViewerUI(status);
    
    // Load status content
    loadStatusContent(status);
    
    // Start expiry timer
    startExpiryTimer(status);
    
    // Update navigation buttons
    updateNavigationButtons();
    
    // Show/hide delete button based on ownership
    if (domElements.deleteStatusBtn) {
        if (status.userId === currentUser.uid) {
            domElements.deleteStatusBtn.style.display = 'block';
        } else {
            domElements.deleteStatusBtn.style.display = 'none';
        }
    }
    
    // Record view (if not already viewed in this session)
    if (!currentStatusViewing.viewedStatuses.has(index)) {
        currentStatusViewing.viewedStatuses.add(index);
        if (status.userId !== currentUser.uid) {
            await recordStatusView(status.id);
        }
    }
}

/**
 * Update status viewer UI
 * @param {Object} status - Status data
 */
function updateStatusViewerUI(status) {
    // Update user info
    if (domElements.statusUserAvatar) {
        const avatarUrl = status.userPhotoURL || 
                         `https://ui-avatars.com/api/?name=${encodeURIComponent(status.userDisplayName)}&background=7C3AED&color=fff`;
        domElements.statusUserAvatar.src = avatarUrl;
        domElements.statusUserAvatar.onerror = function() {
            this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(status.userDisplayName)}&background=7C3AED&color=fff`;
        };
    }
    
    if (domElements.statusUserName) {
        domElements.statusUserName.textContent = status.userDisplayName;
    }
    
    if (domElements.statusTime) {
        const timestamp = status.timestamp?.toDate ? status.timestamp.toDate() : new Date(status.timestamp);
        domElements.statusTime.textContent = formatTimeAgo(timestamp);
    }
    
    // Update viewers count
    if (domElements.viewersCount) {
        const viewCount = status.viewCount || 0;
        domElements.viewersCount.textContent = `${viewCount} ${viewCount === 1 ? 'viewer' : 'viewers'}`;
    }
}

/**
 * Load status content
 * @param {Object} status - Status data
 */
function loadStatusContent(status) {
    // Clear previous content
    if (domElements.statusMedia) {
        domElements.statusMedia.innerHTML = '';
    }
    if (domElements.statusText) {
        domElements.statusText.innerHTML = '';
    }
    if (domElements.statusCaptionDisplay) {
        domElements.statusCaptionDisplay.innerHTML = '';
    }
    
    // Load content based on type
    switch (status.type) {
        case 'text':
            loadTextStatusContent(status);
            break;
        case 'image':
            loadImageStatusContent(status);
            break;
        case 'video':
            loadVideoStatusContent(status);
            break;
        case 'audio':
            loadAudioStatusContent(status);
            break;
        case 'emoji':
            loadEmojiStatusContent(status);
            break;
        case 'gif':
            loadGIFStatusContent(status);
            break;
        case 'sticker':
            loadStickerStatusContent(status);
            break;
        case 'location':
            loadLocationStatusContent(status);
            break;
    }
    
    // Load caption
    if (status.caption && domElements.statusCaptionDisplay) {
        domElements.statusCaptionDisplay.innerHTML = `
            <div class="caption-content">
                ${escapeHtml(status.caption)}
            </div>
        `;
    }
}

/**
 * Load text status content
 * @param {Object} status - Status data
 */
function loadTextStatusContent(status) {
    if (!domElements.statusText) return;
    
    const textStyle = status.textStyle || {};
    
    domElements.statusText.innerHTML = `
        <div class="text-status-display" style="
            background: linear-gradient(135deg, ${textStyle.backgroundColor || '#667eea'} 0%, ${darkenColor(textStyle.backgroundColor || '#667eea', 20)} 100%);
            color: ${textStyle.color || '#ffffff'};
            font-family: ${getFontFamily(textStyle.font || 'default')};
            font-size: ${textStyle.fontSize || '32px'};
            padding: 60px 30px;
            border-radius: 20px;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            word-break: break-word;
            overflow: hidden;
            margin: 20px;
        ">
            ${escapeHtml(status.content)}
        </div>
    `;
}

/**
 * Load image status content
 * @param {Object} status - Status data
 */
function loadImageStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="image-status-display">
            <img src="${status.content}" alt="Status image" 
                 class="status-image-full" 
                 style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 10px;">
            <div class="image-actions">
                <button class="btn-icon" id="zoomImageBtn" title="Zoom">
                    <i class="fas fa-search-plus"></i>
                </button>
                <button class="btn-icon" id="saveImageBtn" title="Save">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners for image actions
    setTimeout(() => {
        const zoomBtn = document.getElementById('zoomImageBtn');
        const saveBtn = document.getElementById('saveImageBtn');
        
        if (zoomBtn) {
            zoomBtn.addEventListener('click', () => {
                const img = document.querySelector('.status-image-full');
                if (img) {
                    if (img.style.maxWidth === '100%') {
                        img.style.maxWidth = 'none';
                        img.style.maxHeight = 'none';
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                    } else {
                        img.style.maxWidth = '100%';
                        img.style.maxHeight = '70vh';
                        img.style.width = 'auto';
                        img.style.height = 'auto';
                        img.style.objectFit = 'contain';
                    }
                }
            });
        }
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                saveStatus();
            });
        }
    }, 100);
}

/**
 * Load video status content
 * @param {Object} status - Status data
 */
function loadVideoStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="video-status-display">
            <video src="${status.content}" 
                   controls 
                   autoplay 
                   playsinline 
                   class="status-video-full"
                   style="max-width: 100%; max-height: 70vh; border-radius: 10px;">
                Your browser does not support the video tag.
            </video>
        </div>
    `;
}

/**
 * Load audio status content
 * @param {Object} status - Status data
 */
function loadAudioStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="audio-status-display">
            <div class="audio-player-container">
                <audio src="${status.content}" 
                       controls 
                       autoplay
                       class="status-audio-full"
                       style="width: 100%;">
                    Your browser does not support the audio element.
                </audio>
                <div class="audio-visualizer" id="audioVisualizer">
                    <canvas id="audioWaveform"></canvas>
                </div>
            </div>
        </div>
    `;
}

/**
 * Load emoji status content
 * @param {Object} status - Status data
 */
function loadEmojiStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="emoji-status-display" style="
            font-size: 120px;
            text-align: center;
            padding: 60px 0;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            ${status.content}
        </div>
    `;
}

/**
 * Load GIF status content
 * @param {Object} status - Status data
 */
function loadGIFStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    domElements.statusMedia.innerHTML = `
        <div class="gif-status-display">
            <img src="${status.content}" alt="GIF" 
                 class="status-gif-full"
                 style="max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 10px;">
        </div>
    `;
}

/**
 * Load sticker status content
 * @param {Object} status - Status data
 */
function loadStickerStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    // For now, we'll display a placeholder
    // In a real implementation, you would fetch the sticker from your sticker library
    domElements.statusMedia.innerHTML = `
        <div class="sticker-status-display" style="
            text-align: center;
            padding: 60px 0;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div class="sticker-placeholder" style="
                font-size: 80px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                width: 200px;
                height: 200px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
            ">
                <i class="fas fa-sticky-note"></i>
            </div>
        </div>
    `;
}

/**
 * Load location status content
 * @param {Object} status - Status data
 */
function loadLocationStatusContent(status) {
    if (!domElements.statusMedia) return;
    
    let locationData;
    try {
        locationData = typeof status.content === 'string' ? JSON.parse(status.content) : status.content;
    } catch (e) {
        locationData = { name: status.content };
    }
    
    domElements.statusMedia.innerHTML = `
        <div class="location-status-display" style="
            text-align: center;
            padding: 40px 20px;
            min-height: 300px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        ">
            <div class="location-icon" style="
                font-size: 80px;
                color: #667eea;
                margin-bottom: 20px;
            ">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="location-name" style="
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
            ">
                ${escapeHtml(locationData.name || 'Location')}
            </div>
            <div class="location-actions">
                <button class="btn-secondary" id="viewOnMapBtn">
                    <i class="fas fa-map"></i> View on Map
                </button>
                <button class="btn-secondary" id="getDirectionsBtn">
                    <i class="fas fa-directions"></i> Get Directions
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners for location actions
    setTimeout(() => {
        const viewOnMapBtn = document.getElementById('viewOnMapBtn');
        const getDirectionsBtn = document.getElementById('getDirectionsBtn');
        
        if (viewOnMapBtn) {
            viewOnMapBtn.addEventListener('click', () => {
                if (locationData.coordinates) {
                    const { latitude, longitude } = locationData.coordinates;
                    window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, '_blank');
                } else {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationData.name)}`, '_blank');
                }
            });
        }
        
        if (getDirectionsBtn) {
            getDirectionsBtn.addEventListener('click', () => {
                if (locationData.coordinates) {
                    const { latitude, longitude } = locationData.coordinates;
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
                } else {
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locationData.name)}`, '_blank');
                }
            });
        }
    }, 100);
}

/**
 * Start expiry timer for status
 * @param {Object} status - Status data
 */
function startExpiryTimer(status) {
    // Clear existing timer
    if (statusViewTimeout) {
        clearTimeout(statusViewTimeout);
        statusViewTimeout = null;
    }
    
    // Calculate expiry time
    const expiresAt = status.expiresAt?.toDate ? status.expiresAt.toDate() : new Date(status.expiresAt);
    const now = new Date();
    const totalDuration = expiresAt - now;
    
    if (totalDuration <= 0) {
        // Status has expired
        if (domElements.expiryTime) {
            domElements.expiryTime.textContent = 'Expired';
        }
        if (domElements.statusExpiryProgress) {
            domElements.statusExpiryProgress.style.width = '0%';
        }
        return;
    }
    
    // Update expiry time display
    if (domElements.expiryTime) {
        const hours = Math.floor(totalDuration / (1000 * 60 * 60));
        const minutes = Math.floor((totalDuration % (1000 * 60 * 60)) / (1000 * 60));
        domElements.expiryTime.textContent = `${hours}h ${minutes}m remaining`;
    }
    
    // Start progress bar update
    let elapsed = 0;
    const updateInterval = 1000; // Update every second
    
    const updateProgress = () => {
        elapsed += updateInterval;
        const progress = Math.min(100, (elapsed / totalDuration) * 100);
        
        if (domElements.statusExpiryProgress) {
            domElements.statusExpiryProgress.style.width = `${100 - progress}%`;
        }
        
        // Update time remaining
        if (domElements.expiryTime) {
            const remaining = totalDuration - elapsed;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            domElements.expiryTime.textContent = `${hours}h ${minutes}m remaining`;
        }
        
        // Auto-advance to next status when current one expires
        if (elapsed >= totalDuration) {
            clearInterval(progressInterval);
            showNextStatus();
        }
    };
    
    const progressInterval = setInterval(updateProgress, updateInterval);
    
    // Store interval ID for cleanup
    statusViewTimeout = {
        interval: progressInterval,
        timeout: null
    };
    
    // Auto-advance timer (for non-view-once statuses)
    if (!status.viewOnce) {
        const autoAdvanceTime = Math.min(totalDuration, 10000); // Max 10 seconds per status
        statusViewTimeout.timeout = setTimeout(() => {
            showNextStatus();
        }, autoAdvanceTime);
    }
    
    // Initial update
    updateProgress();
}

/**
 * Show previous status
 */
function showPrevStatus() {
    if (currentStatusIndex > 0) {
        showStatusAtIndex(currentStatusIndex - 1);
    }
}

/**
 * Show next status
 */
function showNextStatus() {
    if (currentStatusIndex < currentStatusViewing.statuses.length - 1) {
        showStatusAtIndex(currentStatusIndex + 1);
    } else {
        closeStatusViewer();
    }
}

/**
 * Update navigation buttons
 */
function updateNavigationButtons() {
    if (!domElements.prevStatusBtn || !domElements.nextStatusBtn) return;
    
    if (currentStatusIndex > 0) {
        domElements.prevStatusBtn.style.visibility = 'visible';
    } else {
        domElements.prevStatusBtn.style.visibility = 'hidden';
    }
    
    if (currentStatusIndex < currentStatusViewing.statuses.length - 1) {
        domElements.nextStatusBtn.style.visibility = 'visible';
    } else {
        domElements.nextStatusBtn.style.visibility = 'hidden';
    }
}

/**
 * Close status viewer
 */
function closeStatusViewer() {
    // Clear expiry timer
    if (statusViewTimeout) {
        if (statusViewTimeout.interval) {
            clearInterval(statusViewTimeout.interval);
        }
        if (statusViewTimeout.timeout) {
            clearTimeout(statusViewTimeout.timeout);
        }
        statusViewTimeout = null;
    }
    
    // Close modal
    if (domElements.statusModal) {
        domElements.statusModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // Clear current viewing
    currentStatusViewing = null;
    currentStatusIndex = 0;
    
    // Refresh status updates
    loadStatusUpdates();
}

// ==================== STATUS INTERACTION FUNCTIONS ====================

/**
 * Reply to status
 */
async function replyToStatus() {
    if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
        return;
    }
    
    const status = currentStatusViewing.statuses[currentStatusIndex];
    
    // Check if replies are allowed
    if (!status.allowReplies) {
        showToast('Replies are not allowed for this status', 'warning');
        return;
    }
    
    // In a real implementation, this would open a chat with the status owner
    // For now, we'll show a toast
    showToast(`Replying to ${status.userDisplayName}'s status`, 'info');
    
    // You would typically open a chat window here
    // openChatWithUser(status.userId, status.id);
}

/**
 * Forward status
 */
async function forwardStatus() {
    if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
        return;
    }
    
    const status = currentStatusViewing.statuses[currentStatusIndex];
    
    // Show forward options
    showToast('Forward feature coming soon', 'info');
    
    // In a real implementation, this would show a list of contacts to forward to
}

/**
 * Save status
 */
async function saveStatus() {
    if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
        return;
    }
    
    const status = currentStatusViewing.statuses[currentStatusIndex];
    
    // Check if saving is allowed
    if (status.viewOnce) {
        showToast('Cannot save view-once status', 'warning');
        return;
    }
    
    try {
        // Download media based on type
        switch (status.type) {
            case 'image':
            case 'gif':
                await downloadMedia(status.content, `status_${status.id}.jpg`);
                break;
            case 'video':
                await downloadMedia(status.content, `status_${status.id}.mp4`);
                break;
            case 'audio':
                await downloadMedia(status.content, `status_${status.id}.webm`);
                break;
            case 'text':
                const textBlob = new Blob([status.content], { type: 'text/plain' });
                await downloadBlob(textBlob, `status_${status.id}.txt`);
                break;
            default:
                showToast('Cannot save this type of status', 'warning');
                return;
        }
        
        showToast('Status saved to device', 'success');
        
    } catch (error) {
        console.error('Error saving status:', error);
        showToast('Error saving status', 'error');
    }
}

/**
 * Delete status
 * @param {string} statusId - Status ID to delete
 */
async function deleteStatus(statusId) {
    if (!statusId) {
        if (!currentStatusViewing || !currentStatusViewing.statuses[currentStatusIndex]) {
            return;
        }
        statusId = currentStatusViewing.statuses[currentStatusIndex].id;
    }
    
    if (!confirm('Are you sure you want to delete this status?')) {
        return;
    }
    
    try {
        // Get status data to check ownership
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = statusDoc.data();
        
        // Check ownership
        if (status.userId !== currentUser.uid) {
            showToast('You can only delete your own statuses', 'error');
            return;
        }
        
        // Delete status (soft delete by marking as archived)
        await db.collection('statuses').doc(statusId).update({
            isActive: false,
            isArchived: true,
            deletedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Delete associated media from storage if exists
        if (status.storagePath) {
            try {
                const storageRef = storage.ref(status.storagePath);
                await storageRef.delete();
            } catch (storageError) {
                console.warn('Could not delete media from storage:', storageError);
            }
        }
        
        showToast('Status deleted', 'success');
        
        // Close viewer if open
        if (currentStatusViewing && currentStatusViewing.statuses[currentStatusIndex]?.id === statusId) {
            closeStatusViewer();
        }
        
        // Refresh status lists
        loadStatusUpdates();
        loadMyStatuses();
        
    } catch (error) {
        console.error('Error deleting status:', error);
        showToast('Error deleting status', 'error');
    }
}

// ==================== VIEWERS & REACTIONS FUNCTIONS ====================

/**
 * Open viewers modal
 * @param {string} statusId - Status ID
 */
async function openViewersModal(statusId) {
    try {
        // Load viewers
        await loadStatusViewers(statusId);
        
        // Show modal
        if (domElements.viewersModal) {
            domElements.viewersModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
        
    } catch (error) {
        console.error('Error opening viewers modal:', error);
        showToast('Error loading viewers', 'error');
    }
}

/**
 * Open enhanced viewers modal
 * @param {string} statusId - Status ID
 */
async function openEnhancedViewersModal(statusId) {
    try {
        currentEnhancedModalStatusId = statusId;
        
        // Load viewers and reactions
        await Promise.all([
            loadStatusViewers(statusId),
            loadStatusReactions(statusId)
        ]);
        
        // Update tab counts
        if (domElements.viewersTabCount) {
            domElements.viewersTabCount.textContent = currentStatusViewers.length;
        }
        
        if (domElements.reactionsTabCount) {
            domElements.reactionsTabCount.textContent = currentStatusReactions.length;
        }
        
        // Show modal
        if (domElements.enhancedViewersModal) {
            domElements.enhancedViewersModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
            // Switch to viewers tab by default
            switchEnhancedTab('viewers');
        }
        
    } catch (error) {
        console.error('Error opening enhanced viewers modal:', error);
        showToast('Error loading viewers and reactions', 'error');
    }
}

/**
 * Switch enhanced tab
 * @param {string} tab - Tab to switch to
 */
function switchEnhancedTab(tab) {
    // Update tab buttons
    if (domElements.tabButtons) {
        domElements.tabButtons.forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    // Update tab contents
    if (domElements.tabContents) {
        domElements.tabContents.forEach(content => {
            if (content.id === `${tab}TabContent`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }
}

/**
 * Close viewers modal
 */
function closeViewersModal() {
    if (domElements.viewersModal) {
        domElements.viewersModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // Clear data
    currentStatusViewers = [];
}

/**
 * Close enhanced viewers modal
 */
function closeEnhancedViewersModal() {
    if (domElements.enhancedViewersModal) {
        domElements.enhancedViewersModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // Clear data
    currentStatusViewers = [];
    currentStatusReactions = [];
    currentEnhancedModalStatusId = null;
}

/**
 * Load status viewers
 * @param {string} statusId - Status ID
 */
async function loadStatusViewers(statusId) {
    try {
        // Get viewers from Firestore
        const viewersSnapshot = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .orderBy('viewedAt', 'desc')
            .limit(100)
            .get();
        
        currentStatusViewers = [];
        
        // Get user details for each viewer
        for (const doc of viewersSnapshot.docs) {
            const viewData = doc.data();
            
            // Get user data
            const userDoc = await db.collection('users').doc(viewData.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentStatusViewers.push({
                    userId: viewData.userId,
                    displayName: userData.displayName,
                    photoURL: userData.photoURL,
                    viewedAt: viewData.viewedAt,
                    viewDuration: viewData.viewDuration || 0
                });
            }
        }
        
        // Update viewers list UI
        updateViewersList();
        
        // Update enhanced viewers list if modal is open
        if (domElements.enhancedViewersModal && domElements.enhancedViewersModal.style.display !== 'none') {
            updateEnhancedViewersList();
        }
        
    } catch (error) {
        console.error('Error loading status viewers:', error);
        throw error;
    }
}

/**
 * Load status reactions
 * @param {string} statusId - Status ID
 */
async function loadStatusReactions(statusId) {
    try {
        // Get reactions from Firestore
        const reactionsSnapshot = await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
        
        currentStatusReactions = [];
        
        // Get user details for each reaction
        for (const doc of reactionsSnapshot.docs) {
            const reactionData = doc.data();
            
            // Get user data
            const userDoc = await db.collection('users').doc(reactionData.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentStatusReactions.push({
                    userId: reactionData.userId,
                    displayName: userData.displayName,
                    photoURL: userData.photoURL,
                    reaction: reactionData.reaction,
                    timestamp: reactionData.timestamp,
                    isAnonymous: reactionData.isAnonymous || false
                });
            }
        }
        
        // Update reactions list UI
        updateReactionsList();
        
    } catch (error) {
        console.error('Error loading status reactions:', error);
        throw error;
    }
}

/**
 * Update viewers list UI
 */
function updateViewersList() {
    if (!domElements.viewersList) return;
    
    if (currentStatusViewers.length === 0) {
        domElements.viewersList.innerHTML = `
            <div class="empty-viewers">
                <i class="fas fa-eye-slash"></i>
                <p>No viewers yet</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    currentStatusViewers.forEach(viewer => {
        const timeAgo = formatTimeAgo(viewer.viewedAt);
        
        html += `
            <div class="viewer-item">
                <div class="viewer-avatar">
                    <img src="${viewer.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff`}" 
                         alt="${viewer.displayName}"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff'">
                </div>
                <div class="viewer-info">
                    <div class="viewer-name">${escapeHtml(viewer.displayName)}</div>
                    <div class="viewer-time">${timeAgo}</div>
                </div>
            </div>
        `;
    });
    
    domElements.viewersList.innerHTML = html;
}

/**
 * Update enhanced viewers list UI
 */
function updateEnhancedViewersList() {
    if (!domElements.enhancedViewersList) return;
    
    if (currentStatusViewers.length === 0) {
        domElements.enhancedViewersList.innerHTML = `
            <div class="empty-enhanced-viewers">
                <i class="fas fa-eye-slash"></i>
                <p>No viewers yet</p>
                <small>When someone views your status, they'll appear here</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    currentStatusViewers.forEach(viewer => {
        const timeAgo = formatTimeAgo(viewer.viewedAt);
        const viewDuration = viewer.viewDuration > 0 ? `${Math.round(viewer.viewDuration)}s` : '';
        
        html += `
            <div class="enhanced-viewer-item">
                <div class="viewer-avatar">
                    <img src="${viewer.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff`}" 
                         alt="${viewer.displayName}"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.displayName)}&background=7C3AED&color=fff'">
                </div>
                <div class="viewer-details">
                    <div class="viewer-name">${escapeHtml(viewer.displayName)}</div>
                    <div class="viewer-stats">
                        <span class="viewer-time">${timeAgo}</span>
                        ${viewDuration ? `<span class="viewer-duration">• Viewed for ${viewDuration}</span>` : ''}
                    </div>
                </div>
                <div class="viewer-actions">
                    <button class="btn-icon" onclick="messageUser('${viewer.userId}')" title="Message">
                        <i class="fas fa-comment"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    domElements.enhancedViewersList.innerHTML = html;
}

/**
 * Update reactions list UI
 */
function updateReactionsList() {
    if (!domElements.enhancedReactionsList) return;
    
    if (currentStatusReactions.length === 0) {
        domElements.enhancedReactionsList.innerHTML = `
            <div class="empty-reactions">
                <i class="fas fa-heart"></i>
                <p>No reactions yet</p>
                <small>When someone reacts to your status, they'll appear here</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // Group reactions by type
    const reactionsByType = {};
    currentStatusReactions.forEach(reaction => {
        if (!reactionsByType[reaction.reaction]) {
            reactionsByType[reaction.reaction] = [];
        }
        reactionsByType[reaction.reaction].push(reaction);
    });
    
    // Display reactions grouped by type
    Object.entries(reactionsByType).forEach(([emoji, reactions]) => {
        html += `
            <div class="reaction-group">
                <div class="reaction-header">
                    <span class="reaction-emoji">${emoji}</span>
                    <span class="reaction-count">${reactions.length}</span>
                </div>
                <div class="reaction-users">
        `;
        
        reactions.forEach(reaction => {
            const timeAgo = formatTimeAgo(reaction.timestamp);
            
            html += `
                <div class="reaction-user">
                    <div class="user-avatar">
                        <img src="${reaction.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(reaction.displayName)}&background=7C3AED&color=fff`}" 
                             alt="${reaction.displayName}"
                             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(reaction.displayName)}&background=7C3AED&color=fff'">
                    </div>
                    <div class="user-info">
                        <div class="user-name">${escapeHtml(reaction.displayName)}</div>
                        <div class="reaction-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    domElements.enhancedReactionsList.innerHTML = html;
}

/**
 * Add reaction to status
 * @param {string} statusId - Status ID
 * @param {string} reaction - Reaction emoji
 */
async function addReactionToStatus(statusId, reaction) {
    try {
        // Check if user already reacted to this status
        const existingReaction = await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!existingReaction.empty) {
            // Update existing reaction
            await existingReaction.docs[0].ref.update({
                reaction: reaction,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('Reaction updated', 'success');
        } else {
            // Add new reaction
            await db.collection('statusReactions').add({
                statusId: statusId,
                userId: currentUser.uid,
                reaction: reaction,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                isAnonymous: false
            });
            
            // Update reaction count
            await db.collection('statuses').doc(statusId).update({
                reactionCount: firebase.firestore.FieldValue.increment(1)
            });
            
            showToast('Reaction added', 'success');
        }
        
        // Show reaction animation
        showReactionAnimation(reaction);
        
        // Refresh reactions if enhanced modal is open
        if (currentEnhancedModalStatusId === statusId) {
            await loadStatusReactions(statusId);
        }
        
    } catch (error) {
        console.error('Error adding reaction:', error);
        showToast('Error adding reaction', 'error');
    }
}

/**
 * Remove reaction from status
 * @param {string} statusId - Status ID
 */
async function removeReactionFromStatus(statusId) {
    try {
        // Find user's reaction
        const reactionQuery = await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!reactionQuery.empty) {
            // Delete reaction
            await reactionQuery.docs[0].ref.delete();
            
            // Update reaction count
            await db.collection('statuses').doc(statusId).update({
                reactionCount: firebase.firestore.FieldValue.increment(-1)
            });
            
            showToast('Reaction removed', 'success');
            
            // Refresh reactions if enhanced modal is open
            if (currentEnhancedModalStatusId === statusId) {
                await loadStatusReactions(statusId);
            }
        }
        
    } catch (error) {
        console.error('Error removing reaction:', error);
        showToast('Error removing reaction', 'error');
    }
}

/**
 * Show reaction picker
 * @param {Event} event - Click event
 */
function showReactionPicker(event) {
    if (!domElements.reactionPicker) return;
    
    // Position the picker near the click
    const x = event.clientX;
    const y = event.clientY;
    
    domElements.reactionPicker.style.left = `${Math.max(10, x - 100)}px`;
    domElements.reactionPicker.style.top = `${Math.max(10, y - 100)}px`;
    domElements.reactionPicker.style.display = 'block';
}

/**
 * Hide reaction picker
 */
function hideReactionPicker() {
    if (domElements.reactionPicker) {
        domElements.reactionPicker.style.display = 'none';
    }
}

/**
 * Show reaction animation
 * @param {string} reaction - Reaction emoji
 */
function showReactionAnimation(reaction) {
    // Create animation element
    const animation = document.createElement('div');
    animation.className = 'reaction-animation';
    animation.innerHTML = `
        <div class="reaction-emoji">${reaction}</div>
    `;
    
    // Add to status display
    const statusDisplay = document.querySelector('.status-display-area');
    if (statusDisplay) {
        statusDisplay.appendChild(animation);
        
        // Remove after animation
        setTimeout(() => {
            animation.remove();
        }, 1000);
    }
}

// ==================== STATUS MANAGEMENT FUNCTIONS ====================

/**
 * Load status updates
 */
async function loadStatusUpdates() {
    try {
        console.log('📋 Loading status updates...');
        
        if (!domElements.statusUpdates) return;
        
        // Show loading
        domElements.statusUpdates.innerHTML = `
            <div class="loading-status">
                <div class="spinner"></div>
                <p>Loading status updates...</p>
            </div>
        `;
        
        // Check if muted
        if (statusPreferences.muteAllUntil && new Date(statusPreferences.muteAllUntil) > new Date()) {
            domElements.statusUpdates.innerHTML = `
                <div class="muted-status">
                    <i class="fas fa-bell-slash"></i>
                    <h4>Statuses Muted</h4>
                    <p>Status updates are muted</p>
                    <button class="btn-text" onclick="unmuteAllStatuses()">Unmute</button>
                </div>
            `;
            return;
        }
        
        // Get active statuses
        activeStatuses = await getActiveStatuses();
        
        if (activeStatuses.length === 0) {
            domElements.statusUpdates.innerHTML = `
                <div class="no-statuses">
                    <i class="fas fa-camera"></i>
                    <h4>No Status Updates</h4>
                    <p>When your contacts share statuses, they'll appear here</p>
                </div>
            `;
            return;
        }
        
        // Render status updates
        renderStatusUpdatesList(activeStatuses);
        
        // Update active status count
        updateActiveStatusCount(activeStatuses.length);
        
    } catch (error) {
        console.error('❌ Error loading status updates:', error);
        domElements.statusUpdates.innerHTML = `
            <div class="error-loading">
                <i class="fas fa-exclamation-circle"></i>
                <h4>Error Loading</h4>
                <p>Could not load status updates</p>
                <button class="btn-text" onclick="loadStatusUpdates()">Retry</button>
            </div>
        `;
    }
}

/**
 * Get active statuses
 * @returns {Promise<Array>} Active statuses
 */
async function getActiveStatuses() {
    try {
        // Get user's friends/contacts
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const friends = userDoc.data()?.friends || [];
        
        if (friends.length === 0) {
            return [];
        }
        
        // Get active statuses from friends
        // Note: Firestore doesn't support 'in' queries with more than 10 items
        const friendChunks = [];
        for (let i = 0; i < friends.length; i += 10) {
            friendChunks.push(friends.slice(i, i + 10));
        }
        
        let allStatuses = [];
        
        for (const chunk of friendChunks) {
            const statusesSnapshot = await db.collection('statuses')
                .where('userId', 'in', chunk)
                .where('expiresAt', '>', new Date())
                .where('isActive', '==', true)
                .orderBy('expiresAt', 'asc')
                .limit(50)
                .get();
            
            statusesSnapshot.docs.forEach(doc => {
                allStatuses.push({ id: doc.id, ...doc.data() });
            });
        }
        
        // Filter by privacy and check which have been viewed
        const filteredStatuses = [];
        
        for (const status of allStatuses) {
            // Check privacy
            if (!await canViewStatus(status)) {
                continue;
            }
            
            // Check if viewed
            const viewSnapshot = await db.collection('statusViews')
                .where('statusId', '==', status.id)
                .where('userId', '==', currentUser.uid)
                .limit(1)
                .get();
            
            status.hasBeenViewed = !viewSnapshot.empty;
            filteredStatuses.push(status);
        }
        
        // Group by user and sort (unviewed first, then by timestamp)
        const groupedByUser = {};
        
        filteredStatuses.forEach(status => {
            if (!groupedByUser[status.userId]) {
                groupedByUser[status.userId] = {
                    userInfo: {
                        userId: status.userId,
                        displayName: status.userDisplayName,
                        photoURL: status.userPhotoURL
                    },
                    statuses: []
                };
            }
            groupedByUser[status.userId].statuses.push(status);
        });
        
        // Convert to array and sort
        const userStatusArray = Object.values(groupedByUser)
            .map(userData => {
                // Sort user's statuses by timestamp (newest first)
                userData.statuses.sort((a, b) => {
                    const timeA = a.timestamp?.toDate?.() || 0;
                    const timeB = b.timestamp?.toDate?.() || 0;
                    return timeB - timeA;
                });
                
                // Check if any status is unviewed
                userData.hasUnviewed = userData.statuses.some(s => !s.hasBeenViewed);
                userData.latestStatus = userData.statuses[0];
                userData.statusCount = userData.statuses.length;
                
                return userData;
            })
            .sort((a, b) => {
                // Unviewed first
                if (a.hasUnviewed && !b.hasUnviewed) return -1;
                if (!a.hasUnviewed && b.hasUnviewed) return 1;
                
                // Then by latest timestamp
                const timeA = a.latestStatus.timestamp?.toDate?.() || 0;
                const timeB = b.latestStatus.timestamp?.toDate?.() || 0;
                return timeB - timeA;
            });
        
        return userStatusArray;
        
    } catch (error) {
        console.error('Error getting active statuses:', error);
        return [];
    }
}

/**
 * Render status updates list
 * @param {Array} userStatusArray - User status data array
 */
function renderStatusUpdatesList(userStatusArray) {
    if (!domElements.statusUpdates) return;
    
    let html = '<div class="status-updates-grid">';
    
    userStatusArray.forEach(userData => {
        const user = userData.userInfo;
        const hasUnviewed = userData.hasUnviewed;
        const statusCount = userData.statusCount;
        const latestStatus = userData.latestStatus;
        const timeAgo = formatTimeAgo(latestStatus.timestamp);
        
        html += `
            <div class="status-update-item ${hasUnviewed ? 'unviewed' : 'viewed'}" 
                 data-user-id="${user.userId}"
                 data-status-id="${latestStatus.id}">
                <div class="status-avatar-container">
                    <div class="status-avatar">
                        <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff`}" 
                             alt="${user.displayName}" 
                             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff'">
                        ${hasUnviewed ? '<div class="unviewed-indicator"></div>' : ''}
                    </div>
                    <div class="status-ring ${hasUnviewed ? 'active' : ''}">
                        <div class="status-ring-inner"></div>
                    </div>
                </div>
                <div class="status-info">
                    <h4>${user.displayName}</h4>
                    <div class="status-meta">
                        <span class="status-time">${timeAgo}</span>
                        ${statusCount > 1 ? `<span class="status-count">${statusCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    domElements.statusUpdates.innerHTML = html;
}

/**
 * Load my statuses
 */
async function loadMyStatuses() {
    try {
        console.log('📱 Loading my statuses...');
        
        if (!domElements.myStatusList) return;
        
        myActiveStatuses = await getMyActiveStatuses();
        
        if (myActiveStatuses.length === 0) {
            domElements.myStatusList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-camera"></i>
                    <h4>No status yet</h4>
                    <p>Share a photo, video, or text update</p>
                    <button id="addFirstStatusBtn" class="btn-primary">Create Status</button>
                </div>
            `;
            
            // Add event listener to the button
            setTimeout(() => {
                const addFirstStatusBtn = document.getElementById('addFirstStatusBtn');
                if (addFirstStatusBtn) {
                    addFirstStatusBtn.addEventListener('click', openStatusCreation);
                }
            }, 100);
            
            return;
        }
        
        // Render my statuses
        renderMyStatusesList(myActiveStatuses);
        
    } catch (error) {
        console.error('Error loading my statuses:', error);
        domElements.myStatusList.innerHTML = `
            <div class="error-loading">
                <i class="fas fa-exclamation-circle"></i>
                <h4>Error Loading</h4>
                <p>Could not load your statuses</p>
                <button class="btn-text" onclick="loadMyStatuses()">Retry</button>
            </div>
        `;
    }
}

/**
 * Get my active statuses
 * @returns {Promise<Array>} My active statuses
 */
async function getMyActiveStatuses() {
    try {
        const statusesSnapshot = await db.collection('statuses')
            .where('userId', '==', currentUser.uid)
            .where('expiresAt', '>', new Date())
            .where('isActive', '==', true)
            .orderBy('expiresAt', 'asc')
            .limit(20)
            .get();
        
        const statuses = statusesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Sort by timestamp (newest first)
        statuses.sort((a, b) => {
            const timeA = a.timestamp?.toDate?.() || 0;
            const timeB = b.timestamp?.toDate?.() || 0;
            return timeB - timeA;
        });
        
        return statuses;
        
    } catch (error) {
        console.error('Error getting my active statuses:', error);
        return [];
    }
}

/**
 * Render my statuses list
 * @param {Array} statuses - Statuses array
 */
function renderMyStatusesList(statuses) {
    if (!domElements.myStatusList) return;
    
    let html = '<div class="my-statuses-grid">';
    
    statuses.forEach(status => {
        const timeAgo = formatTimeAgo(status.timestamp);
        const viewCount = status.viewCount || 0;
        const reactionCount = status.reactionCount || 0;
        
        html += `
            <div class="my-status-item" data-status-id="${status.id}">
                <div class="my-status-preview">
                    ${getStatusPreviewHTML(status)}
                </div>
                <div class="my-status-info">
                    <div class="status-stats">
                        <span><i class="fas fa-eye"></i> ${viewCount}</span>
                        <span><i class="fas fa-heart"></i> ${reactionCount}</span>
                    </div>
                    <div class="status-time">${timeAgo}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    domElements.myStatusList.innerHTML = html;
    
    // Add click event listeners
    setTimeout(() => {
        document.querySelectorAll('.my-status-item').forEach(item => {
            item.addEventListener('click', function() {
                const statusId = this.dataset.statusId;
                viewMyStatus(statusId);
            });
        });
    }, 100);
}

/**
 * Get status preview HTML
 * @param {Object} status - Status data
 * @returns {string} Preview HTML
 */
function getStatusPreviewHTML(status) {
    switch (status.type) {
        case 'text':
            const textContent = status.content || '';
            const displayText = textContent.length > 30 ? textContent.substring(0, 30) + '...' : textContent;
            return `
                <div class="text-preview">
                    <div class="text-preview-content">${escapeHtml(displayText)}</div>
                </div>
            `;
            
        case 'image':
            return `
                <div class="image-preview" style="background-image: url('${status.content}')">
                    <div class="preview-overlay">
                        <i class="fas fa-image"></i>
                    </div>
                </div>
            `;
            
        case 'video':
            return `
                <div class="video-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
            `;
            
        case 'audio':
            return `
                <div class="audio-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-volume-up"></i>
                    </div>
                </div>
            `;
            
        case 'emoji':
            return `
                <div class="emoji-preview">
                    <div class="preview-overlay">
                        <span class="emoji-large">${status.content}</span>
                    </div>
                </div>
            `;
            
        case 'gif':
            return `
                <div class="gif-preview" style="background-image: url('${status.content}')">
                    <div class="preview-overlay">
                        <i class="fas fa-film"></i>
                    </div>
                </div>
            `;
            
        case 'location':
            return `
                <div class="location-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                </div>
            `;
            
        default:
            return `
                <div class="unknown-preview">
                    <div class="preview-overlay">
                        <i class="fas fa-file"></i>
                    </div>
                </div>
            `;
    }
}

/**
 * View my status
 * @param {string} statusId - Status ID to view
 */
async function viewMyStatus(statusId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = { id: statusDoc.id, ...statusDoc.data() };
        
        // Check ownership
        if (status.userId !== currentUser.uid) {
            showToast('You can only view your own statuses here', 'error');
            return;
        }
        
        // Set as current viewing
        currentStatusViewing = {
            userId: currentUser.uid,
            statuses: [status],
            currentIndex: 0,
            viewedStatuses: new Set([0]),
            startTime: new Date()
        };
        
        currentStatusIndex = 0;
        
        // Open viewer
        if (domElements.statusModal) {
            domElements.statusModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
        
        await showStatusAtIndex(0);
        
    } catch (error) {
        console.error('Error viewing my status:', error);
        showToast('Error loading status', 'error');
    }
}

/**
 * Update active status count
 * @param {number} count - Active status count
 */
function updateActiveStatusCount(count) {
    const countElement = document.getElementById('activeStatusCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

/**
 * Update status ring
 */
function updateStatusRing() {
    if (!domElements.statusRing || !domElements.statusRingInner) return;
    
    // Check if user has active statuses
    const hasActiveStatuses = myActiveStatuses.length > 0;
    
    if (hasActiveStatuses) {
        domElements.statusRing.classList.add('has-status');
        domElements.statusRingInner.style.animation = 'pulse 2s infinite';
    } else {
        domElements.statusRing.classList.remove('has-status');
        domElements.statusRingInner.style.animation = 'none';
    }
}

// ==================== DRAFT MANAGEMENT ====================

/**
 * Save status draft
 */
async function saveStatusDraft() {
    try {
        console.log('💾 Saving draft...');
        
        // Update draft with current values
        updateDraftFromUI();
        
        // Generate draft ID if not exists
        if (!statusDraft.draftId) {
            statusDraft.draftId = generateId();
        }
        
        statusDraft.updatedAt = new Date();
        
        // Find if draft already exists
        const existingIndex = statusDrafts.findIndex(d => d.draftId === statusDraft.draftId);
        
        if (existingIndex !== -1) {
            // Update existing draft
            statusDrafts[existingIndex] = { ...statusDraft };
        } else {
            // Add new draft
            if (!statusDraft.createdAt) {
                statusDraft.createdAt = new Date();
            }
            statusDrafts.push({ ...statusDraft });
        }
        
        // Limit drafts to 10
        if (statusDrafts.length > 10) {
            statusDrafts = statusDrafts.slice(-10);
        }
        
        // Save to Firestore
        await db.collection('users').doc(currentUser.uid).update({
            statusDrafts: statusDrafts
        });
        
        // Update UI
        updateDraftsList();
        
        showToast('Draft saved successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error saving draft:', error);
        showToast('Error saving draft', 'error');
    }
}

/**
 * Update draft from UI
 */
function updateDraftFromUI() {
    // Update caption
    if (domElements.statusCaption) {
        statusDraft.caption = domElements.statusCaption.value;
    }
    
    // Update privacy
    if (domElements.statusPrivacy) {
        statusDraft.privacy = domElements.statusPrivacy.value;
    }
    
    // Update expiry
    if (domElements.statusExpiry) {
        const expiryValue = domElements.statusExpiry.value;
        if (expiryValue === 'custom') {
            // Keep existing custom duration
        } else {
            statusDraft.customDuration = parseInt(expiryValue);
        }
    }
    
    // Note: Other fields (content, type, etc.) are updated in their respective handlers
}

/**
 * Update drafts list UI
 */
function updateDraftsList() {
    const draftsList = document.getElementById('draftsList');
    if (!draftsList) return;
    
    if (statusDrafts.length === 0) {
        draftsList.innerHTML = '<p class="no-drafts">No drafts</p>';
        return;
    }
    
    let html = '<div class="drafts-grid">';
    
    // Show latest drafts (most recent first)
    const recentDrafts = [...statusDrafts]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);
    
    recentDrafts.forEach(draft => {
        const preview = getDraftPreviewHTML(draft);
        const timeAgo = formatTimeAgo(draft.updatedAt);
        
        html += `
            <div class="draft-item" data-draft-id="${draft.draftId}">
                <div class="draft-preview">
                    ${preview}
                </div>
                <div class="draft-info">
                    <span class="draft-type">${draft.type}</span>
                    <span class="draft-time">${timeAgo}</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    draftsList.innerHTML = html;
    
    // Add click event listeners
    setTimeout(() => {
        document.querySelectorAll('.draft-item').forEach(item => {
            item.addEventListener('click', function() {
                const draftId = this.dataset.draftId;
                loadDraft(draftId);
            });
        });
    }, 100);
}

/**
 * Get draft preview HTML
 * @param {Object} draft - Draft object
 * @returns {string} Preview HTML
 */
function getDraftPreviewHTML(draft) {
    switch (draft.type) {
        case 'text':
            const textContent = draft.content || '';
            const displayText = textContent.length > 20 ? textContent.substring(0, 20) + '...' : textContent;
            return `
                <div class="text-draft">
                    <div class="draft-text-content">${escapeHtml(displayText)}</div>
                </div>
            `;
            
        case 'image':
            return `
                <div class="image-draft">
                    <i class="fas fa-image"></i>
                </div>
            `;
            
        case 'video':
            return `
                <div class="video-draft">
                    <i class="fas fa-video"></i>
                </div>
            `;
            
        case 'audio':
            return `
                <div class="audio-draft">
                    <i class="fas fa-microphone"></i>
                </div>
            `;
            
        case 'emoji':
            return `
                <div class="emoji-draft">
                    <span class="draft-emoji">${draft.content || '😀'}</span>
                </div>
            `;
            
        default:
            return `
                <div class="unknown-draft">
                    <i class="fas fa-file"></i>
                </div>
            `;
    }
}

/**
 * Load draft
 * @param {string} draftId - Draft ID to load
 */
async function loadDraft(draftId) {
    const draft = statusDrafts.find(d => d.draftId === draftId);
    if (!draft) {
        showToast('Draft not found', 'error');
        return;
    }
    
    // Load draft into current draft
    Object.assign(statusDraft, draft);
    
    // Open creation modal
    openStatusCreation();
    
    // Update UI with draft data
    updateUIFromDraft(draft);
    
    showToast('Draft loaded', 'success');
}

/**
 * Update UI from draft
 * @param {Object} draft - Draft object
 */
function updateUIFromDraft(draft) {
    // Update status type
    switchStatusType(draft.type);
    
    // Update caption
    if (domElements.statusCaption) {
        domElements.statusCaption.value = draft.caption || '';
    }
    
    // Update privacy
    if (domElements.statusPrivacy) {
        domElements.statusPrivacy.value = draft.privacy || 'myContacts';
    }
    
    // Update expiry
    if (domElements.statusExpiry) {
        domElements.statusExpiry.value = draft.customDuration?.toString() || '86400';
    }
    
    // Update text content if text status
    if (draft.type === 'text' && domElements.statusTextInput) {
        domElements.statusTextInput.value = draft.content || '';
        customizeTextStatus({
            text: draft.content,
            font: draft.font,
            color: draft.color,
            backgroundColor: draft.backgroundColor,
            fontSize: draft.fontSize
        });
    }
    
    // Load media preview if media status
    if ((draft.type === 'image' || draft.type === 'video' || draft.type === 'audio') && draft.content) {
        // This would need to recreate the file from the data URL
        // For simplicity, we'll just update the draft
        // In a real implementation, you would recreate the File object
    }
}

// ==================== STATUS EXPIRY MODAL ====================

/**
 * Open status expiry modal
 */
function openStatusExpiryModal() {
    if (domElements.statusExpiryModal) {
        domElements.statusExpiryModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close status expiry modal
 */
function closeStatusExpiryModal() {
    if (domElements.statusExpiryModal) {
        domElements.statusExpiryModal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// ==================== NOTIFICATION FUNCTIONS ====================

/**
 * Show status notification
 * @param {Object} status - Status data
 */
function showStatusNotification(status) {
    // Check if notifications are supported
    if (!('Notification' in window)) {
        return;
    }
    
    // Check if permission is granted
    if (Notification.permission === 'granted') {
        createStatusNotification(status);
    } else if (Notification.permission !== 'denied') {
        // Request permission
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                createStatusNotification(status);
            }
        });
    }
}

/**
 * Create status notification
 * @param {Object} status - Status data
 */
function createStatusNotification(status) {
    const notification = new Notification(`${status.userDisplayName} posted a status`, {
        body: status.type === 'text' ? status.content.substring(0, 100) : `New ${status.type} status`,
        icon: status.userPhotoURL || 'https://ui-avatars.com/api/?name=Status&background=7C3AED&color=fff',
        tag: `status-${status.id}`
    });
    
    notification.onclick = function() {
        window.focus();
        openStatusViewer(status.id);
        notification.close();
    };
}

// ==================== BACKGROUND SERVICES ====================

/**
 * Start background services
 */
function startBackgroundServices() {
    console.log('⚙️ Starting background services...');
    
    // Status expiration checker
    startStatusExpirationChecker();
    
    // Draft cleanup (every hour)
    startDraftCleanup();
    
    // Status notifications checker
    startStatusNotificationsChecker();
}

/**
 * Start status expiration checker
 */
function startStatusExpirationChecker() {
    // Check every minute
    statusExpirationInterval = setInterval(async () => {
        try {
            const now = new Date();
            
            // Find expired statuses
            const expiredSnapshot = await db.collection('statuses')
                .where('expiresAt', '<=', now)
                .where('isActive', '==', true)
                .limit(50)
                .get();
            
            if (!expiredSnapshot.empty) {
                const batch = db.batch();
                
                expiredSnapshot.docs.forEach(doc => {
                    batch.update(doc.ref, {
                        isActive: false,
                        expiredAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                await batch.commit();
                
                console.log(`✅ Archived ${expiredSnapshot.size} expired statuses`);
                
                // Refresh UI if needed
                loadStatusUpdates();
                loadMyStatuses();
                updateStatusRing();
            }
            
        } catch (error) {
            console.error('Error checking expired statuses:', error);
        }
    }, 60000);
}

/**
 * Start draft cleanup
 */
function startDraftCleanup() {
    // Clean up old drafts (older than 7 days)
    draftCleanupInterval = setInterval(() => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        statusDrafts = statusDrafts.filter(draft => {
            const draftDate = draft.updatedAt ? new Date(draft.updatedAt) : new Date(draft.createdAt);
            return draftDate > sevenDaysAgo;
        });
        
        // Update UI if needed
        updateDraftsList();
    }, 3600000); // Check every hour
}

/**
 * Start status notifications checker
 */
function startStatusNotificationsChecker() {
    // Check for new statuses every 30 seconds
    setInterval(async () => {
        try {
            // Get last check time from localStorage
            const lastCheck = localStorage.getItem('lastStatusCheck') || 0;
            const now = Date.now();
            
            // Get new statuses since last check
            const newStatuses = await getNewStatusesSince(lastCheck);
            
            // Show notifications for new statuses
            newStatuses.forEach(status => {
                if (status.userId !== currentUser.uid) {
                    showStatusNotification(status);
                }
            });
            
            // Update last check time
            localStorage.setItem('lastStatusCheck', now.toString());
            
        } catch (error) {
            console.error('Error checking for new statuses:', error);
        }
    }, 30000);
}

/**
 * Get new statuses since timestamp
 * @param {number} timestamp - Timestamp to check since
 * @returns {Promise<Array>} New statuses
 */
async function getNewStatusesSince(timestamp) {
    try {
        // Get user's friends
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const friends = userDoc.data()?.friends || [];
        
        if (friends.length === 0) {
            return [];
        }
        
        // Convert timestamp to Date
        const sinceDate = new Date(parseInt(timestamp));
        
        // Get statuses since timestamp (limited to first 10 friends for performance)
        const recentFriends = friends.slice(0, 10);
        
        let newStatuses = [];
        
        for (const friendId of recentFriends) {
            const statusesSnapshot = await db.collection('statuses')
                .where('userId', '==', friendId)
                .where('timestamp', '>', sinceDate)
                .where('isActive', '==', true)
                .limit(5)
                .get();
            
            statusesSnapshot.docs.forEach(doc => {
                newStatuses.push({ id: doc.id, ...doc.data() });
            });
        }
        
        return newStatuses;
        
    } catch (error) {
        console.error('Error getting new statuses:', error);
        return [];
    }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} type - Type of toast (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `status-toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            ${type === 'success' ? '<i class="fas fa-check-circle"></i>' :
              type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' :
              type === 'warning' ? '<i class="fas fa-exclamation-triangle"></i>' :
              '<i class="fas fa-info-circle"></i>'}
        </div>
        <div class="toast-message">${escapeHtml(message)}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Generate unique ID
 * @returns {string} Unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Format time ago
 * @param {Date|Object} date - Date to format
 * @returns {string} Formatted time ago
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
}*/


/**
 * Get font family from font name
 * @param {string} fontName - Font name
 * @returns {string} CSS font-family value
 */
function getFontFamily(fontName) {
    const fonts = {
        'default': 'system-ui, -apple-system, sans-serif',
        'arial': 'Arial, sans-serif',
        'comic': '"Comic Sans MS", cursive',
        'courier': '"Courier New", monospace',
        'georgia': 'Georgia, serif',
        'impact': 'Impact, sans-serif'
    };
    
    return fonts[fontName] || fonts.default;
}

/**
 * Darken a color
 * @param {string} color - Hex color
 * @param {number} percent - Percentage to darken
 * @returns {string} Darkened hex color
 */
function darkenColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = parseInt(R * (100 - percent) / 100);
    G = parseInt(G * (100 - percent) / 100);
    B = parseInt(B * (100 - percent) / 100);

    R = (R < 0) ? 0 : R;
    G = (G < 0) ? 0 : G;
    B = (B < 0) ? 0 : B;

    const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

    return "#" + RR + GG + BB;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Convert data URL to blob
 * @param {string} dataURL - Data URL
 * @returns {Blob} Blob object
 */
function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], { type: mime });
}

/**
 * Get file extension from type
 * @param {string} type - File type
 * @returns {string} File extension
 */
function getFileExtension(type) {
    switch (type) {
        case 'image': return 'jpg';
        case 'video': return 'mp4';
        case 'audio': return 'webm';
        default: return 'txt';
    }
}

/**
 * Get MIME type from file type
 * @param {string} type - File type
 * @returns {string} MIME type
 */
function getMimeType(type) {
    switch (type) {
        case 'image': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'audio': return 'audio/webm';
        default: return 'text/plain';
    }
}

/**
 * Download media file
 * @param {string} url - Media URL
 * @param {string} filename - Filename
 */
async function downloadMedia(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        await downloadBlob(blob, filename);
    } catch (error) {
        console.error('Error downloading media:', error);
        throw error;
    }
}

/**
 * Download blob
 * @param {Blob} blob - Blob to download
 * @param {string} filename - Filename
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Check if user can view a status
 * @param {Object} status - Status to check
 * @returns {Promise<boolean>} Whether user can view
 */
async function canViewStatus(status) {
    // User can always view their own statuses
    if (status.userId === currentUser.uid) {
        return true;
    }
    
    // Check privacy settings
    switch (status.privacy) {
        case 'everyone':
            return true;
            
        case 'myContacts':
            // Check if current user is in status owner's contacts
            const ownerDoc = await db.collection('users').doc(status.userId).get();
            const ownerContacts = ownerDoc.data()?.friends || [];
            return ownerContacts.includes(currentUser.uid);
            
        case 'selectedContacts':
            return status.selectedContacts?.includes(currentUser.uid) || false;
            
        case 'contactsExcept':
            return !(status.exceptContacts?.includes(currentUser.uid)) || false;
            
        case 'hideFrom':
            return !(status.hideFrom?.includes(currentUser.uid)) || false;
            
        default:
            return false;
    }
}

/**
 * Unmute all statuses
 */
function unmuteAllStatuses() {
    console.log('Unmuting all statuses...');
    statusPreferences.muteAllUntil = null;
    showToast('All statuses unmuted', 'success');
    loadStatusUpdates();
    
    return {
        success: true,
        message: 'All statuses unmuted'
    };
}

/**
 * Record status view
 * @param {string} statusId - Status ID
 * @param {boolean} isOwnStatus - Whether it's the user's own status
 */
async function recordStatusView(statusId, isOwnStatus = false) {
    try {
        // Don't record view for own status unless specified
        if (isOwnStatus) {
            // For own status, just update the view count
            await db.collection('statuses').doc(statusId).update({
                viewCount: firebase.firestore.FieldValue.increment(1),
                lastViewedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return;
        }
        
        // Check if already viewed
        const existingView = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!existingView.empty) {
            // Update existing view
            await existingView.docs[0].ref.update({
                viewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                viewDuration: firebase.firestore.FieldValue.increment(1) // Increment view duration
            });
        } else {
            // Record new view
            await db.collection('statusViews').add({
                statusId: statusId,
                userId: currentUser.uid,
                viewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                viewDuration: 1
            });
            
            // Update view count
            await db.collection('statuses').doc(statusId).update({
                viewCount: firebase.firestore.FieldValue.increment(1),
                lastViewedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
    } catch (error) {
        console.error('Error recording status view:', error);
    }
}

/**
 * Load all initial data
 */
function loadAllInitialData() {
    loadStatusUpdates();
    loadMyStatuses();
    updateDraftsList();
    updateStatusRing();
}

/**
 * Switch status tab
 * @param {string} tabName - Tab name to switch to
 */
function switchStatusTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.status-tab');
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Update tab contents
    const tabContents = document.querySelectorAll('.status-tab-content');
    tabContents.forEach(content => {
        if (content.id === `${tabName}Tab`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

/**
 * Stop camera if active
 */
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// ==================== EXPORTS ====================

// Make functions available globally
window.StatusSystem = {
    // Initialization
    init: initStatusSystem,
    
    // Status Creation
    openStatusCreation: openStatusCreation,
    closeStatusCreation: closeStatusCreation,
    switchStatusType: switchStatusType,
    customizeTextStatus: customizeTextStatus,
    postNewStatus: postNewStatus,
    saveStatusDraft: saveStatusDraft,
    
    // Status Viewing
    openStatusViewer: openStatusViewer,
    closeStatusViewer: closeStatusViewer,
    viewMyStatus: viewMyStatus,
    viewUserStatuses: viewUserStatuses,
    showPrevStatus: showPrevStatus,
    showNextStatus: showNextStatus,
    
    // Status Management
    loadStatusUpdates: loadStatusUpdates,
    loadMyStatuses: loadMyStatuses,
    deleteStatus: deleteStatus,
    saveStatus: saveStatus,
    replyToStatus: replyToStatus,
    forwardStatus: forwardStatus,
    
    // Viewers & Reactions
    openViewersModal: openViewersModal,
    openEnhancedViewersModal: openEnhancedViewersModal,
    closeViewersModal: closeViewersModal,
    closeEnhancedViewersModal: closeEnhancedViewersModal,
    addReactionToStatus: addReactionToStatus,
    removeReactionFromStatus: removeReactionFromStatus,
    showReactionPicker: showReactionPicker,
    hideReactionPicker: hideReactionPicker,
    
    // Utility
    showToast: showToast,
    unmuteAllStatuses: unmuteAllStatuses,
    
    // Media Handling
    handleImageUpload: handleImageUpload,
    handleVideoUpload: handleVideoUpload,
    handleAudioUpload: handleAudioUpload,
    clearMediaPreviews: clearMediaPreviews,
    
    // Draft Management
    loadDraft: loadDraft,
    updateDraftsList: updateDraftsList,
    
    // Settings
    openStatusExpiryModal: openStatusExpiryModal,
    closeStatusExpiryModal: closeStatusExpiryModal
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 DOM loaded, initializing Status System...');
    
    // Check if Firebase is available
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        // Initialize after a short delay to ensure everything is loaded
        setTimeout(() => {
            StatusSystem.init();
        }, 1000);
    } else {
        console.warn('Firebase not loaded yet. Status system will initialize when Firebase is ready.');
        // Try again after 2 seconds
        setTimeout(() => {
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                StatusSystem.init();
            } else {
                console.error('Firebase still not loaded. Status system cannot initialize.');
                showToast('Firebase not loaded. Please refresh the page.', 'error');
            }
        }, 2000);
    }
});

>>>>>>> 35a7dd29c215aeda26525e12658dd8bef5034d22
console.log('✅ WhatsApp Status System loaded - Production Ready!');