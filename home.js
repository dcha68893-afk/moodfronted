// feed.js - Enhanced JavaScript for Kynecta Social Feed

// Firebase Configuration for Kynecta
const firebaseConfig = {
    apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
    authDomain: "kynecta-social.firebaseapp.com",
    projectId: "kynecta-social",
    storageBucket: "kynecta-social.firebasestorage.app",
    messagingSenderId: "1003264444309",
    appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Global Variables
let currentUser = null;
let posts = [];
let lastPost = null;
let hasMorePosts = true;
let currentFilter = 'all';
let currentEmotionFilter = null;
let currentInterestFilter = null;
let currentContentTypeFilter = null;
let currentMoodFilter = 'all';
let selectedReaction = null;
let isInitialized = false;

// DOM Elements
const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    connectionText: document.getElementById('connectionText'),
    feedContainer: document.getElementById('feedContainer'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    endOfFeed: document.getElementById('endOfFeed'),
    floatingCreateBtn: document.getElementById('floatingCreateBtn'),
    createPostModal: document.getElementById('createPostModal'),
    closePostModal: document.getElementById('closePostModal'),
    cancelPost: document.getElementById('cancelPost'),
    publishPost: document.getElementById('publishPost'),
    modalPostInput: document.getElementById('modalPostInput'),
    themeToggle: document.getElementById('themeToggle'),
    searchInput: document.getElementById('searchInput'),
    keyboardShortcuts: document.getElementById('keyboardShortcuts'),
    userStatusContainer: document.getElementById('userStatusContainer'),
    userAvatar: document.getElementById('userAvatar'),
    userDisplayName: document.getElementById('userDisplayName'),
    statusText: document.getElementById('statusText'),
    sidebarUserAvatar: document.getElementById('sidebarUserAvatar'),
    sidebarUserName: document.getElementById('sidebarUserName'),
    sidebarUserStatus: document.getElementById('sidebarUserStatus'),
    postCount: document.getElementById('postCount'),
    followerCount: document.getElementById('followerCount'),
    followingCount: document.getElementById('followingCount'),
    emotionFilterBtn: document.getElementById('emotionFilterBtn'),
    emotionOptions: document.getElementById('emotionOptions'),
    interestFilterBtn: document.getElementById('interestFilterBtn'),
    interestOptions: document.getElementById('interestOptions'),
    contentTypeFilterBtn: document.getElementById('contentTypeFilterBtn'),
    contentTypeOptions: document.getElementById('contentTypeOptions'),
    storiesContainer: document.getElementById('storiesContainer'),
    trendingTopicsContainer: document.getElementById('trendingTopicsContainer'),
    leaderboardContainer: document.getElementById('leaderboardContainer'),
    suggestedUsersContainer: document.getElementById('suggestedUsersContainer'),
    currentUserAvatar: document.getElementById('currentUserAvatar'),
    currentUserName: document.getElementById('currentUserName'),
    signOutBtn: document.getElementById('signOutBtn'),
    userEnergyRing: document.getElementById('userEnergyRing'),
    energyPercentage: document.getElementById('energyPercentage'),
    userBadges: document.getElementById('userBadges'),
    aiSuggestion: document.getElementById('aiSuggestion'),
    aiSuggestionText: document.getElementById('aiSuggestionText'),
    applySuggestion: document.getElementById('applySuggestion'),
    collaborativePost: document.getElementById('collaborativePost'),
    toggleCollaborative: document.getElementById('toggleCollaborative'),
    collaborativeSettings: document.getElementById('collaborativeSettings'),
    modalAddCollaborative: document.getElementById('modalAddCollaborative'),
    moodOptions: document.querySelectorAll('.mood-option'),
    refreshAISuggestions: document.getElementById('refreshAISuggestions'),
    aiContentSuggestionsList: document.getElementById('aiContentSuggestionsList'),
    viewAllBadges: document.getElementById('viewAllBadges'),
    shareGratitudeBtn: document.getElementById('shareGratitudeBtn'),
    emojiPicker: document.getElementById('emojiPicker'),
    toxicityWarning: document.getElementById('toxicityWarning'),
    modalAddPhoto: document.getElementById('modalAddPhoto'),
    modalAddVideo: document.getElementById('modalAddVideo'),
    modalAddAudio: document.getElementById('modalAddAudio'),
    modalAddPoll: document.getElementById('modalAddPoll'),
    modalAddLink: document.getElementById('modalAddLink'),
    modalPhotoInput: document.getElementById('modalPhotoInput'),
    modalVideoInput: document.getElementById('modalVideoInput'),
    modalAudioInput: document.getElementById('modalAudioInput'),
    pollCreator: document.getElementById('pollCreator'),
    addPollOption: document.getElementById('addPollOption'),
    pollOptions: document.getElementById('pollOptions'),
    pollQuestion: document.getElementById('pollQuestion'),
    multiplePollAnswers: document.getElementById('multiplePollAnswers'),
    postAudience: document.getElementById('postAudience'),
    postMood: document.getElementById('postMood'),
    modalMediaPreview: document.getElementById('modalMediaPreview'),
    modalPreviewImage: document.getElementById('modalPreviewImage'),
    modalPreviewVideo: document.getElementById('modalPreviewVideo'),
    modalPreviewAudio: document.getElementById('modalPreviewAudio'),
    uploadProgress: document.getElementById('uploadProgress'),
    uploadProgressBar: document.getElementById('uploadProgressBar'),
    linkPreview: document.getElementById('linkPreview'),
    linkTitle: document.getElementById('linkTitle'),
    linkDescription: document.getElementById('linkDescription'),
    linkDomain: document.getElementById('linkDomain'),
    linkImage: document.getElementById('linkImage'),
    collaborativeTitle: document.getElementById('collaborativeTitle'),
    collaborativeType: document.getElementById('collaborativeType'),
    allowEdits: document.getElementById('allowEdits'),
    searchResults: document.getElementById('searchResults')
};

// Configuration Constants
const CONFIG = {
    POSTS_PER_PAGE: 10,
    SEARCH_DEBOUNCE: 300,
    SCROLL_THRESHOLD: 1000,
    NOTIFICATION_DURATION: 3000,
    UPLOAD_PROGRESS_INTERVAL: 100,
    AI_SUGGESTION_THRESHOLD: 10,
    MAX_POLL_OPTIONS: 6,
    MIN_POLL_OPTIONS: 2
};

// Initialize the application
function init() {
    if (isInitialized) return;
    
    console.log('🚀 Initializing Kynecta Social Feed...');
    
    // Set up Firebase authentication state observer
    auth.onAuthStateChanged(handleAuthStateChange);
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Set up infinite scroll
    setupInfiniteScroll();
    
    // Set up connection monitoring
    setupConnectionMonitoring();
    
    // Initialize new features
    initializeNewFeatures();
    
    isInitialized = true;
    console.log('✅ Kynecta Social Feed initialized successfully');
}

// Handle authentication state changes
function handleAuthStateChange(user) {
    if (user) {
        // User is signed in
        currentUser = user;
        console.log('👤 User signed in:', user.displayName);
        
        updateUserUI();
        loadUserData();
        loadInitialPosts();
        loadStories();
        loadTrendingTopics();
        loadLeaderboard();
        loadSuggestedUsers();
        
        elements.signOutBtn.classList.remove('hidden');
    } else {
        // User is signed out
        currentUser = null;
        console.log('👤 User signed out');
        
        // Clear UI elements
        elements.feedContainer.innerHTML = '';
        elements.signOutBtn.classList.add('hidden');
        
        // TODO: Redirect to dashboard or show login prompt
        // window.location.href = 'your-dashboard-url.html';
    }
}

// Initialize new features
function initializeNewFeatures() {
    console.log('🆕 Initializing new features...');
    
    initializeEmojiPicker();
    loadAIContentSuggestions();
    initializeMoodFiltering();
    initializeGamificationData();
    
    console.log('✅ New features initialized');
}

// Initialize emoji picker
function initializeEmojiPicker() {
    const emojis = ['😀', '😂', '🥰', '😎', '🤔', '🙌', '🔥', '💯', '✨', '🌟', 
                   '💖', '👍', '👏', '🎉', '💡', '🌈', '🚀', '📚', '🎨', '🎵', 
                   '🍕', '☕', '🌍', '💪', '❤️', '🤝', '🎯', '📈', '💼', '🌱'];
    
    elements.emojiPicker.innerHTML = '';
    
    emojis.forEach(emoji => {
        const emojiOption = document.createElement('div');
        emojiOption.className = 'emoji-option';
        emojiOption.textContent = emoji;
        emojiOption.setAttribute('aria-label', `Emoji: ${emoji}`);
        
        emojiOption.addEventListener('click', () => {
            insertEmojiIntoActiveInput(emoji);
            elements.emojiPicker.classList.remove('show');
        });
        
        elements.emojiPicker.appendChild(emojiOption);
    });
    
    console.log('✅ Emoji picker initialized with', emojis.length, 'emojis');
}

// Insert emoji into active input
function insertEmojiIntoActiveInput(emoji) {
    const activeInput = document.activeElement;
    if (activeInput && (activeInput.tagName === 'TEXTAREA' || activeInput.tagName === 'INPUT')) {
        const cursorPosition = activeInput.selectionStart;
        const textBefore = activeInput.value.substring(0, cursorPosition);
        const textAfter = activeInput.value.substring(cursorPosition);
        
        activeInput.value = textBefore + emoji + textAfter;
        activeInput.focus();
        activeInput.setSelectionRange(cursorPosition + emoji.length, cursorPosition + emoji.length);
        
        // Trigger input event for AI suggestions and toxicity check
        activeInput.dispatchEvent(new Event('input'));
    }
}

// Load AI content suggestions
function loadAIContentSuggestions() {
    console.log('🤖 Loading AI content suggestions...');
    
    // TODO: Fetch AI content suggestions from backend API
    // For now, using curated suggestions
    const suggestions = [
        "Share a recent accomplishment and what you learned from it",
        "Ask your network for recommendations on your favorite hobby",
        "Post about a book, movie, or podcast that inspired you recently",
        "Share a photo from your day and tell the story behind it",
        "Ask an engaging question to start a conversation",
        "Share a helpful tip or life hack you recently discovered",
        "Post about a current event and ask for others' perspectives",
        "Share your goals for the week and ask about others' goals"
    ];
    
    // Display suggestions
    elements.aiContentSuggestionsList.innerHTML = '';
    suggestions.forEach((suggestion, index) => {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'ai-suggestion-item';
        suggestionElement.innerHTML = `<p>${suggestion}</p>`;
        suggestionElement.addEventListener('click', () => {
            applyAIContentSuggestion(suggestion);
        });
        elements.aiContentSuggestionsList.appendChild(suggestionElement);
    });
    
    console.log('✅ AI content suggestions loaded');
}

// Apply AI content suggestion
function applyAIContentSuggestion(suggestion) {
    elements.modalPostInput.value = suggestion;
    elements.modalPostInput.focus();
    showNotification('Suggestion applied! Start customizing your post.', 'success');
}

// Initialize mood-based filtering
function initializeMoodFiltering() {
    elements.moodOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Update active state
            elements.moodOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            // Apply filter
            currentMoodFilter = this.dataset.mood;
            console.log('🎭 Mood filter changed to:', currentMoodFilter);
            
            reloadPosts();
        });
    });
    
    console.log('✅ Mood-based filtering initialized');
}

// Initialize gamification data
function initializeGamificationData() {
    console.log('🏆 Initializing gamification data...');
    
    // TODO: Fetch user's gamification data from Firebase
    // For now, using placeholder data
    updateGamificationDisplay({
        streak: 7,
        points: 245,
        badges: ['newcomer', 'contributor', 'social-butterfly', 'thought-leader']
    });
}

// Update gamification display
function updateGamificationDisplay(data) {
    // Update streak and points
    const streakElement = document.querySelector('.streak-days');
    const pointsElement = document.querySelector('.streak-counter .text-right .streak-days');
    
    if (streakElement) streakElement.textContent = `${data.streak} days`;
    if (pointsElement) pointsElement.textContent = data.points.toString();
    
    console.log('✅ Gamification display updated');
}

// Set up event listeners
function setupEventListeners() {
    console.log('🔗 Setting up event listeners...');
    
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);
    
    // Create post modal
    elements.floatingCreateBtn.addEventListener('click', openCreatePostModal);
    elements.closePostModal.addEventListener('click', closeCreatePostModal);
    elements.cancelPost.addEventListener('click', closeCreatePostModal);
    elements.publishPost.addEventListener('click', createPost);
    
    // Filter buttons
    setupFilterListeners();
    
    // Search functionality
    elements.searchInput.addEventListener('input', debounce(handleSearch, CONFIG.SEARCH_DEBOUNCE));
    
    // Media upload buttons
    elements.modalAddPhoto.addEventListener('click', () => elements.modalPhotoInput.click());
    elements.modalAddVideo.addEventListener('click', () => elements.modalVideoInput.click());
    elements.modalAddAudio.addEventListener('click', () => elements.modalAudioInput.click());
    elements.modalAddPoll.addEventListener('click', togglePollCreator);
    elements.modalAddLink.addEventListener('click', addLinkToPost);
    elements.modalAddCollaborative.addEventListener('click', toggleCollaborativePost);
    
    // File inputs
    elements.modalPhotoInput.addEventListener('change', handleMediaUpload);
    elements.modalVideoInput.addEventListener('change', handleMediaUpload);
    elements.modalAudioInput.addEventListener('change', handleMediaUpload);
    
    // Poll functionality
    elements.addPollOption.addEventListener('click', addPollOption);
    setupPollOptionRemoval();
    
    // AI Suggestion
    elements.applySuggestion.addEventListener('click', applyAISuggestion);
    elements.modalPostInput.addEventListener('input', generateAISuggestion);
    
    // Collaborative post
    elements.toggleCollaborative.addEventListener('click', toggleCollaborativeSettings);
    
    // Sign out
    elements.signOutBtn.addEventListener('click', signOut);
    
    // NEW FEATURE: AI Content Suggestions
    elements.refreshAISuggestions.addEventListener('click', refreshAISuggestionsHandler);
    
    // NEW FEATURE: Daily Vibe
    elements.shareGratitudeBtn.addEventListener('click', shareGratitudeHandler);
    
    // NEW FEATURE: Gamification
    elements.viewAllBadges.addEventListener('click', viewAllBadgesHandler);
    
    // NEW FEATURE: Anti-toxicity filter
    elements.modalPostInput.addEventListener('input', checkToxicity);
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', handleOutsideClick);
    
    console.log('✅ Event listeners set up');
}

// Set up filter listeners
function setupFilterListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            console.log('🔍 Filter changed to:', currentFilter);
            reloadPosts();
        });
    });
    
    // Emotion filter
    elements.emotionFilterBtn.addEventListener('click', () => toggleDropdown(elements.emotionOptions));
    document.querySelectorAll('.emotion-option').forEach(option => {
        option.addEventListener('click', function() {
            currentEmotionFilter = this.dataset.emotion;
            elements.emotionFilterBtn.innerHTML = `<i class="fas fa-smile mr-1"></i> ${this.textContent}`;
            elements.emotionOptions.classList.add('hidden');
            console.log('😊 Emotion filter changed to:', currentEmotionFilter);
            reloadPosts();
        });
    });
    
    // Interest filter
    elements.interestFilterBtn.addEventListener('click', () => toggleDropdown(elements.interestOptions));
    document.querySelectorAll('.interest-option').forEach(option => {
        option.addEventListener('click', function() {
            currentInterestFilter = this.dataset.interest;
            elements.interestFilterBtn.innerHTML = `<i class="fas fa-tags mr-1"></i> ${this.textContent}`;
            elements.interestOptions.classList.add('hidden');
            console.log('🏷️ Interest filter changed to:', currentInterestFilter);
            reloadPosts();
        });
    });
    
    // Content type filter
    elements.contentTypeFilterBtn.addEventListener('click', () => toggleDropdown(elements.contentTypeOptions));
    document.querySelectorAll('.content-type-option').forEach(option => {
        option.addEventListener('click', function() {
            currentContentTypeFilter = this.dataset.contentType;
            elements.contentTypeFilterBtn.innerHTML = `<i class="fas fa-filter mr-1"></i> ${this.textContent}`;
            elements.contentTypeOptions.classList.add('hidden');
            console.log('📄 Content type filter changed to:', currentContentTypeFilter);
            reloadPosts();
        });
    });
}

// Toggle dropdown
function toggleDropdown(dropdown) {
    const allDropdowns = [elements.emotionOptions, elements.interestOptions, elements.contentTypeOptions];
    allDropdowns.forEach(d => {
        if (d !== dropdown) d.classList.add('hidden');
    });
    dropdown.classList.toggle('hidden');
}

// Handle outside clicks
function handleOutsideClick(event) {
    // Close dropdowns
    if (!elements.emotionFilterBtn.contains(event.target) && !elements.emotionOptions.contains(event.target)) {
        elements.emotionOptions.classList.add('hidden');
    }
    if (!elements.interestFilterBtn.contains(event.target) && !elements.interestOptions.contains(event.target)) {
        elements.interestOptions.classList.add('hidden');
    }
    if (!elements.contentTypeFilterBtn.contains(event.target) && !elements.contentTypeOptions.contains(event.target)) {
        elements.contentTypeOptions.classList.add('hidden');
    }
    
    // Close emoji picker
    if (!event.target.closest('.emoji-picker-btn') && !elements.emojiPicker.contains(event.target)) {
        elements.emojiPicker.classList.remove('show');
    }
}

// Set up poll option removal
function setupPollOptionRemoval() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-poll-option') || 
            e.target.parentElement.classList.contains('remove-poll-option')) {
            const optionElement = e.target.closest('.flex.items-center');
            if (document.querySelectorAll('#pollOptions .flex.items-center').length > CONFIG.MIN_POLL_OPTIONS) {
                optionElement.remove();
                updatePollOptionPlaceholders();
            } else {
                showNotification('Poll must have at least 2 options', 'error');
            }
        }
    });
}

// Update poll option placeholders
function updatePollOptionPlaceholders() {
    const options = document.querySelectorAll('#pollOptions input');
    options.forEach((input, index) => {
        input.placeholder = `Option ${index + 1}`;
    });
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Don't trigger shortcuts if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch(e.key) {
            case 'n':
            case 'N':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    openCreatePostModal();
                }
                break;
            case '/':
                e.preventDefault();
                elements.searchInput.focus();
                break;
            case 't':
            case 'T':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    toggleTheme();
                }
                break;
            case '?':
                e.preventDefault();
                toggleKeyboardShortcuts();
                break;
            case 'Escape':
                closeCreatePostModal();
                elements.keyboardShortcuts.classList.remove('show');
                break;
        }
    });
}

// Set up infinite scroll
function setupInfiniteScroll() {
    window.addEventListener('scroll', debounce(() => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - CONFIG.SCROLL_THRESHOLD) {
            if (hasMorePosts && !elements.loadingIndicator.classList.contains('hidden')) {
                loadMorePosts();
            }
        }
    }, 200));
}

// Set up connection monitoring
function setupConnectionMonitoring() {
    // Monitor online/offline status
    window.addEventListener('online', () => {
        updateConnectionStatus('connected');
        showNotification('Connection restored', 'success');
    });
    
    window.addEventListener('offline', () => {
        updateConnectionStatus('disconnected');
        showNotification('You are offline', 'error');
    });
    
    // Check Firebase connection
    db.enableNetwork().then(() => {
        updateConnectionStatus('connected');
    }).catch(error => {
        console.error('Firebase connection error:', error);
        updateConnectionStatus('disconnected');
    });
}

// Update connection status UI
function updateConnectionStatus(status) {
    elements.connectionStatus.className = `connection-status ${status}`;
    
    switch(status) {
        case 'connected':
            elements.connectionText.innerHTML = '<i class="fas fa-wifi mr-2"></i> Connected to Kynecta';
            break;
        case 'connecting':
            elements.connectionText.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Connecting to Kynecta...';
            break;
        case 'disconnected':
            elements.connectionText.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> Offline';
            break;
    }
    
    // Hide status after 3 seconds if connected
    if (status === 'connected') {
        setTimeout(() => {
            elements.connectionStatus.classList.add('hidden');
        }, CONFIG.NOTIFICATION_DURATION);
    } else {
        elements.connectionStatus.classList.remove('hidden');
    }
}

// NEW: Refresh AI content suggestions
function refreshAISuggestionsHandler() {
    console.log('🔄 Refreshing AI content suggestions...');
    
    showNotification('Getting fresh content ideas...', 'success');
    
    // TODO: Fetch new AI content suggestions from backend API
    // Simulate API call delay
    setTimeout(() => {
        loadAIContentSuggestions();
        showNotification('New content ideas loaded!', 'success');
    }, 1000);
}

// NEW: Share gratitude post
function shareGratitudeHandler() {
    openCreatePostModal();
    elements.modalPostInput.value = "I'm grateful for... #Gratitude";
    elements.modalPostInput.focus();
    showNotification('Share what you\'re thankful for today!', 'success');
}

// NEW: View all badges
function viewAllBadgesHandler() {
    // TODO: Open modal with all user badges and achievements
    showNotification('Opening achievements dashboard...', 'success');
    
    // For now, show a simple alert with available badges
    const badges = [
        '🎯 Newcomer - Joined Kynecta',
        '🌟 Contributor - Created 10+ posts',
        '🦋 Social Butterfly - Connected with 50+ users',
        '💡 Thought Leader - Posts received 100+ likes',
        '🚀 Early Adopter - Joined in the first month',
        '🌈 Creative Spirit - Shared multimedia content',
        '🤝 Community Builder - Started collaborative posts'
    ];
    
    alert('Your Available Badges:\n\n' + badges.join('\n'));
}

// NEW: Check for toxic content
function checkToxicity() {
    const content = elements.modalPostInput.value;
    
    // TODO: Implement actual toxicity detection with AI/ML API
    // For now, using simple keyword matching as placeholder
    const toxicKeywords = ['hate', 'stupid', 'idiot', 'kill', 'hurt', 'ugly', 'worthless'];
    const hasToxicContent = toxicKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
    );
    
    if (hasToxicContent && content.length > CONFIG.AI_SUGGESTION_THRESHOLD) {
        elements.toxicityWarning.classList.remove('hidden');
    } else {
        elements.toxicityWarning.classList.add('hidden');
    }
}

// Auth Functions
function signOut() {
    auth.signOut()
        .then(() => {
            console.log('👤 User signed out successfully');
            showNotification('Signed out successfully', 'success');
        })
        .catch((error) => {
            console.error('Sign out error:', error);
            showNotification('Error signing out: ' + error.message, 'error');
        });
}

// Theme Functions
function toggleTheme() {
    const body = document.body;
    let newTheme = 'dark-theme';
    
    if (body.classList.contains('dark-theme')) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        newTheme = 'light';
    } else if (body.classList.contains('light-theme')) {
        body.classList.remove('light-theme');
        body.classList.add('cyber-theme');
        newTheme = 'cyber';
    } else {
        body.classList.remove('cyber-theme');
        body.classList.add('dark-theme');
        newTheme = 'dark';
    }
    
    localStorage.setItem('kynecta-theme', newTheme);
    console.log('🎨 Theme changed to:', newTheme);
    showNotification(`Theme changed to ${newTheme} mode`, 'success');
}

// Toggle keyboard shortcuts display
function toggleKeyboardShortcuts() {
    elements.keyboardShortcuts.classList.toggle('show');
}

// Create Post Modal Functions
function openCreatePostModal() {
    if (!currentUser) {
        showNotification('Please sign in to create a post', 'error');
        return;
    }
    
    elements.createPostModal.classList.remove('hidden');
    elements.modalPostInput.focus();
    
    // Update user info in modal
    elements.currentUserAvatar.src = currentUser.photoURL || 'https://via.placeholder.com/40';
    elements.currentUserName.textContent = currentUser.displayName || 'User';
    
    console.log('📝 Create post modal opened');
}

function closeCreatePostModal() {
    elements.createPostModal.classList.add('hidden');
    resetPostModal();
    console.log('📝 Create post modal closed');
}

function resetPostModal() {
    elements.modalPostInput.value = '';
    elements.pollCreator.classList.add('hidden');
    elements.modalMediaPreview.classList.add('hidden');
    elements.linkPreview.classList.add('hidden');
    elements.postMood.value = '';
    elements.postAudience.value = 'public';
    elements.aiSuggestion.classList.add('hidden');
    elements.collaborativePost.classList.add('hidden');
    elements.collaborativeSettings.classList.add('hidden');
    elements.toxicityWarning.classList.add('hidden');
    
    // Reset poll
    elements.pollOptions.innerHTML = `
        <div class="flex items-center space-x-2">
            <input type="text" placeholder="Option 1" class="flex-1 p-2 glass border border-purple-700 rounded-lg">
            <button class="text-red-500 remove-poll-option"><i class="fas fa-times"></i></button>
        </div>
        <div class="flex items-center space-x-2">
            <input type="text" placeholder="Option 2" class="flex-1 p-2 glass border border-purple-700 rounded-lg">
            <button class="text-red-500 remove-poll-option"><i class="fas fa-times"></i></button>
        </div>
    `;
}

// Create Post Function
function createPost() {
    if (!currentUser) {
        showNotification('Please sign in to create a post', 'error');
        return;
    }

    const content = elements.modalPostInput.value.trim();
    const hasMedia = !elements.modalMediaPreview.classList.contains('hidden');
    
    if (!content && !hasMedia) {
        showNotification('Please add some content to your post', 'error');
        return;
    }
    
    // Check for toxicity warning
    if (!elements.toxicityWarning.classList.contains('hidden')) {
        const proceed = confirm('Our AI detected potentially harmful content. Are you sure you want to post this?');
        if (!proceed) return;
    }
    
    const mood = elements.postMood.value;
    const audience = elements.postAudience.value;
    
    // Create post object
    const postData = {
        content: content,
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userAvatar: currentUser.photoURL || '',
        mood: mood,
        audience: audience,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        likes: [],
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        viewsCount: 0,
        hashtags: extractHashtags(content),
        mentions: extractMentions(content),
        // Kynecta Unique Feature: Post Energy
        energy: calculatePostEnergy(content),
        // Kynecta Unique Feature: AI Generated
        aiGenerated: false,
        // NEW: Vibe reactions
        vibeReactions: {
            energy: 0,
            deep: 0,
            pure: 0,
            creative: 0
        },
        // NEW: Appreciation count
        appreciationCount: 0
    };
    
    // Add poll data if applicable
    if (!elements.pollCreator.classList.contains('hidden')) {
        const pollQuestion = elements.pollQuestion.value.trim();
        const pollOptions = Array.from(document.querySelectorAll('#pollOptions input'))
            .map(input => ({
                text: input.value.trim(),
                votes: 0,
                voters: []
            }))
            .filter(option => option.text !== '');
        
        if (pollQuestion && pollOptions.length >= CONFIG.MIN_POLL_OPTIONS) {
            postData.poll = {
                question: pollQuestion,
                options: pollOptions,
                multipleAnswers: elements.multiplePollAnswers.checked,
                totalVotes: 0
            };
        } else {
            showNotification('Please add a question and at least 2 options for the poll', 'error');
            return;
        }
    }
    
    // Kynecta Unique Feature: Collaborative Post
    if (!elements.collaborativeSettings.classList.contains('hidden')) {
        const collaborativeTitle = elements.collaborativeTitle.value.trim();
        const collaborativeType = elements.collaborativeType.value;
        const allowEdits = elements.allowEdits.checked;
        
        if (collaborativeTitle) {
            postData.collaborative = {
                title: collaborativeTitle,
                type: collaborativeType,
                allowEdits: allowEdits,
                collaborators: [currentUser.uid],
                isActive: true
            };
        }
    }
    
    // Show loading state
    elements.publishPost.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Publishing...';
    elements.publishPost.disabled = true;
    
    // Save to Firebase
    db.collection('posts').add(postData)
        .then(docRef => {
            console.log('✅ Post published with ID:', docRef.id);
            showNotification('Post published successfully!', 'success');
            closeCreatePostModal();
            reloadPosts();
            
            // Update user's post count
            updateUserPostCount(1);
            
            // Kynecta Unique Feature: Update user energy
            updateUserEnergy(5);
            
            // NEW: Update user streak
            updateUserStreak();
        })
        .catch(error => {
            console.error('❌ Error publishing post:', error);
            showNotification('Error publishing post: ' + error.message, 'error');
        })
        .finally(() => {
            // Reset button state
            elements.publishPost.innerHTML = 'Publish';
            elements.publishPost.disabled = false;
        });
}

// NEW: Update user streak
function updateUserStreak() {
    // TODO: Implement streak tracking logic in Firebase
    console.log('📈 Updating user streak...');
    
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).update({
            lastPostDate: firebase.firestore.FieldValue.serverTimestamp(),
            streak: firebase.firestore.FieldValue.increment(1)
        }).catch(error => {
            console.error('Error updating streak:', error);
        });
    }
}

// Like Post Function
function likePost(postId) {
    if (!currentUser) {
        showNotification('Please sign in to like posts', 'error');
        return;
    }

    const postRef = db.collection('posts').doc(postId);
    
    // Use a transaction to safely update the likes
    db.runTransaction(transaction => {
        return transaction.get(postRef).then(postDoc => {
            if (!postDoc.exists) {
                throw new Error('Post does not exist!');
            }
            
            const postData = postDoc.data();
            const likes = postData.likes || [];
            const likesCount = postData.likesCount || 0;
            const userLiked = likes.includes(currentUser.uid);
            
            if (userLiked) {
                // Remove like
                const newLikes = likes.filter(uid => uid !== currentUser.uid);
                transaction.update(postRef, {
                    likes: newLikes,
                    likesCount: likesCount - 1
                });
                return false; // Unlike
            } else {
                // Add like
                const newLikes = [...likes, currentUser.uid];
                transaction.update(postRef, {
                    likes: newLikes,
                    likesCount: likesCount + 1
                });
                return true; // Like
            }
        });
    }).then(likeAdded => {
        console.log(likeAdded ? '❤️ Post liked' : '💔 Post unliked');
        reloadPosts();
        
        // Kynecta Unique Feature: Update user energy
        if (likeAdded) {
            updateUserEnergy(1);
        }
    }).catch(error => {
        console.error('❌ Transaction failed:', error);
        showNotification('Error liking post: ' + error.message, 'error');
    });
}

// NEW: Add vibe reaction to post
function addVibeReaction(postId, vibeType) {
    if (!currentUser) {
        showNotification('Please sign in to react to posts', 'error');
        return;
    }

    const postRef = db.collection('posts').doc(postId);
    
    // Use a transaction to safely update the vibe reactions
    db.runTransaction(transaction => {
        return transaction.get(postRef).then(postDoc => {
            if (!postDoc.exists) {
                throw new Error('Post does not exist!');
            }
            
            const postData = postDoc.data();
            const vibeReactions = postData.vibeReactions || {
                energy: 0,
                deep: 0,
                pure: 0,
                creative: 0
            };
            
            // Increment the selected vibe reaction
            vibeReactions[vibeType] = (vibeReactions[vibeType] || 0) + 1;
            
            transaction.update(postRef, {
                vibeReactions: vibeReactions
            });
            
            return true;
        });
    }).then(success => {
        console.log(`✅ Added ${vibeType} vibe reaction`);
        showNotification(`Added ${vibeType} reaction!`, 'success');
        reloadPosts();
        
        // Update user energy
        updateUserEnergy(1);
    }).catch(error => {
        console.error('❌ Transaction failed:', error);
        showNotification('Error adding reaction: ' + error.message, 'error');
    });
}

// NEW: Add appreciation to post
function addAppreciation(postId) {
    if (!currentUser) {
        showNotification('Please sign in to appreciate posts', 'error');
        return;
    }

    const postRef = db.collection('posts').doc(postId);
    
    // Use a transaction to safely update the appreciation count
    db.runTransaction(transaction => {
        return transaction.get(postRef).then(postDoc => {
            if (!postDoc.exists) {
                throw new Error('Post does not exist!');
            }
            
            const postData = postDoc.data();
            const appreciationCount = postData.appreciationCount || 0;
            
            transaction.update(postRef, {
                appreciationCount: appreciationCount + 1
            });
            
            return true;
        });
    }).then(success => {
        console.log('✅ Added appreciation');
        reloadPosts();
        
        // TODO: Process payment through Flutterwave/M-Pesa API
        showNotification('Thank you for your appreciation! 💝', 'success');
    }).catch(error => {
        console.error('❌ Transaction failed:', error);
        showNotification('Error adding appreciation: ' + error.message, 'error');
    });
}

// Submit Comment Function
function submitComment(postId, commentText) {
    if (!currentUser) {
        showNotification('Please sign in to comment', 'error');
        return;
    }

    if (!commentText.trim()) {
        showNotification('Please enter a comment', 'error');
        return;
    }

    const commentData = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userAvatar: currentUser.photoURL || '',
        content: commentText.trim(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        // NEW: Nested replies
        replies: [],
        // NEW: Voice comment placeholder
        hasVoiceComment: false
    };

    const postRef = db.collection('posts').doc(postId);
    const commentRef = postRef.collection('comments').doc();
    
    // Use a batch write to update both the comment and the post's comment count
    const batch = db.batch();
    
    // Add the comment
    batch.set(commentRef, commentData);
    
    // Increment the post's comment count
    batch.update(postRef, {
        commentsCount: firebase.firestore.FieldValue.increment(1)
    });
    
    batch.commit()
        .then(() => {
            console.log('✅ Comment added successfully');
            showNotification('Comment added!', 'success');
            reloadPosts();
            
            // Kynecta Unique Feature: Update user energy
            updateUserEnergy(2);
        })
        .catch(error => {
            console.error('❌ Error adding comment:', error);
            showNotification('Error adding comment: ' + error.message, 'error');
        });
}

// NEW: Submit nested reply to comment
function submitReply(postId, commentId, replyText) {
    if (!currentUser) {
        showNotification('Please sign in to reply', 'error');
        return;
    }

    if (!replyText.trim()) {
        showNotification('Please enter a reply', 'error');
        return;
    }

    const replyData = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userAvatar: currentUser.photoURL || '',
        content: replyText.trim(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
    
    // Use a transaction to add the reply to the comment's replies array
    db.runTransaction(transaction => {
        return transaction.get(commentRef).then(commentDoc => {
            if (!commentDoc.exists) {
                throw new Error('Comment does not exist!');
            }
            
            const commentData = commentDoc.data();
            const replies = commentData.replies || [];
            
            // Add the new reply
            replies.push(replyData);
            
            transaction.update(commentRef, {
                replies: replies
            });
            
            return true;
        });
    }).then(success => {
        console.log('✅ Reply added successfully');
        showNotification('Reply added!', 'success');
        reloadPosts();
        
        // Update user energy
        updateUserEnergy(1);
    }).catch(error => {
        console.error('❌ Error adding reply:', error);
        showNotification('Error adding reply: ' + error.message, 'error');
    });
}

// Toggle poll creator
function togglePollCreator() {
    elements.pollCreator.classList.toggle('hidden');
}

// Toggle collaborative post
function toggleCollaborativePost() {
    elements.collaborativePost.classList.toggle('hidden');
}

// Toggle collaborative settings
function toggleCollaborativeSettings() {
    elements.collaborativeSettings.classList.toggle('hidden');
    elements.toggleCollaborative.textContent = elements.collaborativeSettings.classList.contains('hidden') ? 'Enable' : 'Disable';
}

// Add poll option
function addPollOption() {
    const optionCount = document.querySelectorAll('#pollOptions .flex.items-center').length;
    
    if (optionCount >= CONFIG.MAX_POLL_OPTIONS) {
        showNotification(`Maximum ${CONFIG.MAX_POLL_OPTIONS} options allowed`, 'error');
        return;
    }
    
    const newOption = document.createElement('div');
    newOption.className = 'flex items-center space-x-2';
    newOption.innerHTML = `
        <input type="text" placeholder="Option ${optionCount + 1}" class="flex-1 p-2 glass border border-purple-700 rounded-lg">
        <button class="text-red-500 remove-poll-option"><i class="fas fa-times"></i></button>
    `;
    
    elements.pollOptions.appendChild(newOption);
}

// Add link to post
function addLinkToPost() {
    const url = prompt('Enter URL:');
    if (url) {
        try {
            // Validate URL
            new URL(url);
            
            // In a real implementation, you would fetch the link metadata
            // For this demo, we'll use placeholder data
            elements.linkTitle.textContent = 'Example Website';
            elements.linkDescription.textContent = 'This is an example website description that would be fetched from the provided URL.';
            elements.linkDomain.textContent = new URL(url).hostname;
            elements.linkImage.src = 'https://via.placeholder.com/150';
            elements.linkPreview.classList.remove('hidden');
            
            showNotification('Link preview added!', 'success');
        } catch (error) {
            showNotification('Please enter a valid URL', 'error');
        }
    }
}

// Kynecta Unique Feature: Generate AI Suggestion
function generateAISuggestion() {
    const content = elements.modalPostInput.value.trim();
    
    if (content.length > CONFIG.AI_SUGGESTION_THRESHOLD && content.length < 100) {
        // Simple AI suggestion logic - in a real app, this would call an AI API
        const suggestions = [
            "Try adding a question to engage your audience!",
            "Consider adding relevant hashtags to increase visibility.",
            "This would be a great post to add a poll to!",
            "Your post might benefit from adding an image or video.",
            "This sounds like a perfect topic for a collaborative discussion!",
            "You could ask for others' experiences on this topic.",
            "Consider sharing a personal story related to this."
        ];
        
        const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
        elements.aiSuggestionText.textContent = randomSuggestion;
        elements.aiSuggestion.classList.remove('hidden');
    } else {
        elements.aiSuggestion.classList.add('hidden');
    }
}

// Kynecta Unique Feature: Apply AI Suggestion
function applyAISuggestion() {
    const suggestion = elements.aiSuggestionText.textContent;
    
    if (suggestion.includes("question")) {
        elements.modalPostInput.value += " What do you think?";
    } else if (suggestion.includes("hashtags")) {
        elements.modalPostInput.value += " #Kynecta #SocialMedia";
    } else if (suggestion.includes("poll")) {
        togglePollCreator();
    } else if (suggestion.includes("image") || suggestion.includes("video")) {
        elements.modalAddPhoto.click();
    } else if (suggestion.includes("collaborative")) {
        toggleCollaborativePost();
    } else if (suggestion.includes("personal story")) {
        elements.modalPostInput.value += " Here's what happened to me...";
    } else if (suggestion.includes("experiences")) {
        elements.modalPostInput.value += " I'd love to hear your experiences too!";
    }
    
    elements.aiSuggestion.classList.add('hidden');
    elements.modalPostInput.focus();
}

// Handle media upload
function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    elements.modalMediaPreview.classList.remove('hidden');
    
    // Show upload progress
    elements.uploadProgress.classList.remove('hidden');
    elements.uploadProgressBar.style.width = '0%';
    
    // Determine file type
    const fileType = file.type.split('/')[0];
    
    // Hide all media previews first
    elements.modalPreviewImage.classList.add('hidden');
    elements.modalPreviewVideo.classList.add('hidden');
    elements.modalPreviewAudio.classList.add('hidden');
    
    // Show appropriate preview
    if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = function(e) {
            elements.modalPreviewImage.src = e.target.result;
            elements.modalPreviewImage.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else if (fileType === 'video') {
        const reader = new FileReader();
        reader.onload = function(e) {
            elements.modalPreviewVideo.src = e.target.result;
            elements.modalPreviewVideo.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else if (fileType === 'audio') {
        const reader = new FileReader();
        reader.onload = function(e) {
            elements.modalPreviewAudio.src = e.target.result;
            elements.modalPreviewAudio.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
    
    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        elements.uploadProgressBar.style.width = `${progress}%`;
        
        if (progress >= 100) {
            clearInterval(interval);
            elements.uploadProgress.classList.add('hidden');
            showNotification('File uploaded successfully!', 'success');
            
            // TODO: Upload to Firebase Storage and get URL
            // uploadToFirebaseStorage(file);
        }
    }, CONFIG.UPLOAD_PROGRESS_INTERVAL);
}

// TODO: Upload to Firebase Storage
function uploadToFirebaseStorage(file) {
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`posts/${currentUser.uid}/${Date.now()}_${file.name}`);
    
    fileRef.put(file).then((snapshot) => {
        return snapshot.ref.getDownloadURL();
    }).then((downloadURL) => {
        console.log('File available at', downloadURL);
        // Store downloadURL in post data
    }).catch((error) => {
        console.error('Upload failed:', error);
        showNotification('Error uploading file: ' + error.message, 'error');
    });
}

// Handle search
function handleSearch() {
    const query = elements.searchInput.value.trim();
    
    if (query.length < 2) {
        // Clear search results if query is too short
        elements.searchResults.innerHTML = '';
        return;
    }
    
    console.log('🔍 Searching for:', query);
    
    // Search users and posts
    const usersPromise = db.collection('users')
        .where('userName', '>=', query)
        .where('userName', '<=', query + '\uf8ff')
        .limit(5)
        .get();
        
    const postsPromise = db.collection('posts')
        .where('content', '>=', query)
        .where('content', '<=', query + '\uf8ff')
        .limit(5)
        .get();
    
    Promise.all([usersPromise, postsPromise])
        .then(([usersSnapshot, postsSnapshot]) => {
            displaySearchResults(usersSnapshot, postsSnapshot, query);
        })
        .catch(error => {
            console.error('❌ Search error:', error);
            showNotification('Error performing search: ' + error.message, 'error');
        });
}

// Display search results
function displaySearchResults(usersSnapshot, postsSnapshot, query) {
    elements.searchResults.innerHTML = '';
    
    if (usersSnapshot.empty && postsSnapshot.empty) {
        elements.searchResults.innerHTML = '<div class="p-4 text-center text-theme-secondary">No results found</div>';
        return;
    }
    
    let html = '<div class="search-results-container p-4">';
    
    // Add users
    if (!usersSnapshot.empty) {
        html += '<div class="mb-4"><h3 class="font-semibold text-theme-accent mb-2">People</h3>';
        usersSnapshot.forEach(doc => {
            const user = doc.data();
            html += `
                <div class="search-result-item p-3 rounded-lg glass mb-2 cursor-pointer hover:bg-purple-900/30 transition flex items-center" onclick="visitUserProfile('${doc.id}')">
                    <img src="${user.userAvatar || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded-full mr-3" alt="${user.userName}">
                    <div>
                        <p class="font-medium">${highlightText(user.userName, query)}</p>
                        <p class="text-xs text-theme-secondary">${user.bio || ''}</p>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // Add posts
    if (!postsSnapshot.empty) {
        html += '<div class="mb-4"><h3 class="font-semibold text-theme-accent mb-2">Posts</h3>';
        postsSnapshot.forEach(doc => {
            const post = doc.data();
            html += `
                <div class="search-result-item p-3 rounded-lg glass mb-2 cursor-pointer hover:bg-purple-900/30 transition" onclick="viewPost('${doc.id}')">
                    <p class="text-sm">${highlightText(post.content, query)}</p>
                    <div class="flex items-center mt-2 text-xs text-theme-secondary">
                        <img src="${post.userAvatar || 'https://via.placeholder.com/16'}" class="w-4 h-4 rounded-full mr-1" alt="${post.userName}">
                        <span>${post.userName}</span>
                        <span class="mx-1">•</span>
                        <span>${formatDate(post.timestamp?.toDate())}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    html += '</div>';
    elements.searchResults.innerHTML = html;
}

// TODO: Visit user profile
function visitUserProfile(userId) {
    console.log('👤 Visiting user profile:', userId);
    showNotification('Opening user profile...', 'success');
    // window.location.href = `profile.html?userId=${userId}`;
}

// TODO: View post
function viewPost(postId) {
    console.log('📄 Viewing post:', postId);
    // Implement post viewing logic
}

// Highlight search terms in text
function highlightText(text, query) {
    if (!text) return '';
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-300 text-black">$1</mark>');
}

// Update user UI with current user data
function updateUserUI() {
    if (currentUser) {
        const avatarUrl = currentUser.photoURL || 'https://via.placeholder.com/40';
        const displayName = currentUser.displayName || 'User';
        
        elements.userAvatar.src = avatarUrl;
        elements.userDisplayName.textContent = displayName;
        elements.sidebarUserAvatar.src = avatarUrl;
        elements.sidebarUserName.textContent = displayName;
        elements.currentUserAvatar.src = avatarUrl;
        elements.currentUserName.textContent = displayName;
        
        console.log('👤 User UI updated:', displayName);
    }
}

// Load user data from Firebase
function loadUserData() {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists) {
                const userData = doc.data();
                updateUserDataDisplay(userData);
            } else {
                // Create user document if it doesn't exist
                createUserDocument();
            }
        })
        .catch(error => {
            console.error('❌ Error loading user data:', error);
        });
}

// Update user data display
function updateUserDataDisplay(userData) {
    elements.postCount.textContent = userData.postsCount || 0;
    elements.followerCount.textContent = userData.followersCount || 0;
    elements.followingCount.textContent = userData.followingCount || 0;
    elements.statusText.textContent = userData.status || 'Online';
    elements.sidebarUserStatus.textContent = userData.status || 'Online';
    
    // Kynecta Unique Feature: Update user energy
    updateUserEnergyDisplay(userData.energy || 0);
    
    // Kynecta Unique Feature: Load user badges
    loadUserBadges(userData.badges || []);
    
    console.log('✅ User data display updated');
}

// Create user document
function createUserDocument() {
    if (!currentUser) return;
    
    const userData = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'User',
        userAvatar: currentUser.photoURL || '',
        email: currentUser.email || '',
        status: 'Online',
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        energy: 0,
        badges: ['newcomer'],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        // NEW: Gamification data
        streak: 0,
        points: 0,
        achievements: []
    };
    
    db.collection('users').doc(currentUser.uid).set(userData)
        .then(() => {
            console.log('✅ User document created');
            loadUserData();
        })
        .catch(error => {
            console.error('❌ Error creating user document:', error);
        });
}

// Update user post count
function updateUserPostCount(increment) {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).update({
        postsCount: firebase.firestore.FieldValue.increment(increment)
    })
    .then(() => {
        loadUserData();
    })
    .catch(error => {
        console.error('❌ Error updating user post count:', error);
    });
}

// Kynecta Unique Feature: Update user energy
function updateUserEnergy(points) {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).update({
        energy: firebase.firestore.FieldValue.increment(points)
    })
    .then(() => {
        loadUserData();
    })
    .catch(error => {
        console.error('❌ Error updating user energy:', error);
    });
}

// Kynecta Unique Feature: Update user energy display
function updateUserEnergyDisplay(energy) {
    const percentage = Math.min(100, energy);
    elements.userEnergyRing.style.background = `conic-gradient(var(--accent-color) ${percentage}%, transparent ${percentage}%)`;
    elements.energyPercentage.textContent = `${percentage}%`;
}

// Kynecta Unique Feature: Load user badges
function loadUserBadges(badges) {
    elements.userBadges.innerHTML = '';
    
    const badgeConfig = {
        'newcomer': { text: 'Newcomer', color: 'bg-blue-500', icon: '🥚' },
        'contributor': { text: 'Contributor', color: 'bg-green-500', icon: '🌟' },
        'influencer': { text: 'Influencer', color: 'bg-purple-500', icon: '🚀' },
        'collaborator': { text: 'Collaborator', color: 'bg-yellow-500', icon: '🤝' },
        'visionary': { text: 'Visionary', color: 'bg-pink-500', icon: '💡' },
        'social-butterfly': { text: 'Social Butterfly', color: 'bg-indigo-500', icon: '🦋' },
        'thought-leader': { text: 'Thought Leader', color: 'bg-orange-500', icon: '🎯' }
    };
    
    badges.forEach(badge => {
        if (badgeConfig[badge]) {
            const badgeElement = document.createElement('span');
            badgeElement.className = `kynecta-badge ${badgeConfig[badge].color} flex items-center gap-1`;
            badgeElement.innerHTML = `${badgeConfig[badge].icon} ${badgeConfig[badge].text}`;
            badgeElement.title = badgeConfig[badge].text;
            elements.userBadges.appendChild(badgeElement);
        }
    });
}

// Kynecta Unique Feature: Calculate post energy
function calculatePostEnergy(content) {
    // Simple algorithm to calculate post "energy" based on content
    let energy = 0;
    
    // Base energy
    energy += Math.min(content.length / 10, 10);
    
    // Bonus for hashtags
    const hashtags = extractHashtags(content);
    energy += hashtags.length * 2;
    
    // Bonus for mentions
    const mentions = extractMentions(content);
    energy += mentions.length * 2;
    
    // Bonus for questions
    if (content.includes('?')) energy += 5;
    
    // Bonus for excitement (exclamation marks)
    const exclamationCount = (content.match(/!/g) || []).length;
    energy += Math.min(exclamationCount, 5);
    
    return Math.min(energy, 50);
}

// Load initial posts from Firebase
function loadInitialPosts() {
    if (!currentUser) return;
    
    console.log('📄 Loading initial posts...');
    
    elements.loadingIndicator.classList.remove('hidden');
    elements.endOfFeed.classList.add('hidden');
    
    let query = buildPostsQuery().limit(CONFIG.POSTS_PER_PAGE);
    
    query.get()
        .then(snapshot => {
            posts = [];
            snapshot.forEach(doc => {
                posts.push({ id: doc.id, ...doc.data() });
            });
            
            displayPosts(posts);
            elements.loadingIndicator.classList.add('hidden');
            
            if (snapshot.docs.length > 0) {
                lastPost = snapshot.docs[snapshot.docs.length - 1];
                hasMorePosts = true;
            } else {
                hasMorePosts = false;
                elements.endOfFeed.classList.remove('hidden');
            }
            
            console.log(`✅ Loaded ${posts.length} posts`);
        })
        .catch(error => {
            console.error('❌ Error loading posts:', error);
            elements.loadingIndicator.classList.add('hidden');
            showNotification('Error loading posts: ' + error.message, 'error');
        });
}

// Build posts query based on current filters
function buildPostsQuery() {
    let query = db.collection('posts').orderBy('timestamp', 'desc');
    
    // Apply filters if set
    if (currentFilter === 'top') {
        query = query.orderBy('likesCount', 'desc');
    } else if (currentFilter === 'trending') {
        query = query.orderBy('viewsCount', 'desc');
    }
    
    if (currentEmotionFilter) {
        query = query.where('mood', '==', currentEmotionFilter);
    }
    
    // NEW: Apply mood-based filtering
    if (currentMoodFilter && currentMoodFilter !== 'all') {
        // TODO: Implement mood-based filtering logic
        // This would require posts to have mood metadata
        console.log('🎭 Filtering by mood:', currentMoodFilter);
    }
    
    if (currentContentTypeFilter === 'poll') {
        query = query.where('poll', '!=', null);
    } else if (currentContentTypeFilter === 'collaborative') {
        query = query.where('collaborative', '!=', null);
    }
    
    return query;
}

// Load more posts for infinite scroll
function loadMorePosts() {
    if (!hasMorePosts || !currentUser) return;
    
    console.log('📄 Loading more posts...');
    
    elements.loadingIndicator.classList.remove('hidden');
    
    let query = buildPostsQuery().startAfter(lastPost).limit(CONFIG.POSTS_PER_PAGE);
    
    query.get()
        .then(snapshot => {
            const newPosts = [];
            snapshot.forEach(doc => {
                newPosts.push({ id: doc.id, ...doc.data() });
            });
            
            posts = [...posts, ...newPosts];
            displayPosts(posts);
            elements.loadingIndicator.classList.add('hidden');
            
            if (snapshot.docs.length > 0) {
                lastPost = snapshot.docs[snapshot.docs.length - 1];
            } else {
                hasMorePosts = false;
                elements.endOfFeed.classList.remove('hidden');
            }
            
            console.log(`✅ Loaded ${newPosts.length} more posts`);
        })
        .catch(error => {
            console.error('❌ Error loading more posts:', error);
            elements.loadingIndicator.classList.add('hidden');
            showNotification('Error loading more posts: ' + error.message, 'error');
        });
}

// Reload posts with current filters
function reloadPosts() {
    if (!currentUser) return;
    
    console.log('🔄 Reloading posts with current filters...');
    
    elements.feedContainer.innerHTML = '';
    loadInitialPosts();
}

// Display posts in the feed
function displayPosts(postsToDisplay) {
    elements.feedContainer.innerHTML = '';
    
    if (postsToDisplay.length === 0) {
        elements.feedContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-inbox text-4xl text-theme-secondary mb-4"></i>
                <h3 class="text-xl font-semibold text-theme-primary mb-2">No posts found</h3>
                <p class="text-theme-secondary">Try changing your filters or be the first to post!</p>
                <button onclick="openCreatePostModal()" class="mt-4 px-6 py-2 rounded-2xl font-semibold hover:scale-105 transition" style="background: var(--accent-color); color: white;">
                    Create Your First Post
                </button>
            </div>
        `;
        return;
    }
    
    postsToDisplay.forEach(post => {
        const postElement = createPostElement(post);
        elements.feedContainer.appendChild(postElement);
    });
    
    console.log(`✅ Displayed ${postsToDisplay.length} posts`);
}

// Create a post element
function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post-card p-5';
    postElement.dataset.postId = post.id;
    
    // Build post HTML
    postElement.innerHTML = buildPostHTML(post);
    
    // Set up event listeners for this post
    setupPostEventListeners(postElement, post);
    
    return postElement;
}

// Build post HTML
function buildPostHTML(post) {
    const mediaHtml = buildMediaHTML(post);
    const pollHtml = buildPollHTML(post);
    const linkPreviewHtml = buildLinkPreviewHTML(post);
    const content = formatPostContent(post);
    const userLiked = post.likes && post.likes.includes(currentUser.uid);
    const vibeReactions = post.vibeReactions || { energy: 0, deep: 0, pure: 0, creative: 0 };
    const appreciationCount = post.appreciationCount || 0;
    const collaborativeHtml = buildCollaborativeHTML(post);
    const energyHtml = buildEnergyHTML(post);
    
    return `
        <div class="flex items-start space-x-3">
            <img src="${post.userAvatar || 'https://via.placeholder.com/40'}" alt="${post.userName}'s avatar" class="w-10 h-10 rounded-2xl object-cover cursor-pointer" onclick="visitUserProfile('${post.userId}')">
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-semibold text-theme-primary cursor-pointer" onclick="visitUserProfile('${post.userId}')">${post.userName}</h3>
                        <div class="flex items-center space-x-2 mt-1">
                            <span class="text-xs text-theme-secondary">${formatDate(post.timestamp?.toDate())}</span>
                            ${post.mood ? `<span class="text-xs px-2 py-1 rounded-full bg-theme-accent/20 text-theme-accent">${getMoodEmoji(post.mood)} ${post.mood}</span>` : ''}
                            ${post.audience === 'friends' ? '<span class="text-xs text-theme-secondary"><i class="fas fa-user-friends mr-1"></i>Friends</span>' : ''}
                            ${post.audience === 'private' ? '<span class="text-xs text-theme-secondary"><i class="fas fa-lock mr-1"></i>Only Me</span>' : ''}
                            ${post.aiGenerated ? '<span class="kynecta-badge bg-purple-500">AI Enhanced</span>' : ''}
                        </div>
                    </div>
                    <div class="relative">
                        <button class="post-options-btn text-theme-secondary hover:text-theme-accent transition">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    </div>
                </div>
                
                ${collaborativeHtml}
                
                <div class="mt-3 text-theme-primary">
                    ${content}
                </div>
                
                ${energyHtml}
                
                ${mediaHtml}
                ${pollHtml}
                ${linkPreviewHtml}
                
                <!-- NEW: Vibe Reactions -->
                <div class="vibe-reactions mt-3">
                    <div class="vibe-reaction" data-vibe="energy" data-post-id="${post.id}">
                        <span>🔥</span>
                        <span>${vibeReactions.energy || 0}</span>
                    </div>
                    <div class="vibe-reaction" data-vibe="deep" data-post-id="${post.id}">
                        <span>💭</span>
                        <span>${vibeReactions.deep || 0}</span>
                    </div>
                    <div class="vibe-reaction" data-vibe="pure" data-post-id="${post.id}">
                        <span>💚</span>
                        <span>${vibeReactions.pure || 0}</span>
                    </div>
                    <div class="vibe-reaction" data-vibe="creative" data-post-id="${post.id}">
                        <span>🌈</span>
                        <span>${vibeReactions.creative || 0}</span>
                    </div>
                </div>
                
                <div class="flex items-center justify-between mt-4 pt-3 border-t border-purple-800">
                    <div class="flex items-center space-x-4 text-theme-secondary">
                        <div class="relative reaction-container">
                            <button class="reaction-btn flex items-center space-x-1 ${userLiked ? 'text-red-500' : 'hover:text-theme-accent'} transition" data-post-id="${post.id}">
                                <i class="fas fa-heart"></i>
                                <span>${post.likesCount || 0}</span>
                            </button>
                        </div>
                        <button class="comment-btn flex items-center space-x-1 hover:text-theme-accent transition" data-post-id="${post.id}">
                            <i class="fas fa-comment"></i>
                            <span>${post.commentsCount || 0}</span>
                        </button>
                        <button class="share-btn flex items-center space-x-1 hover:text-theme-accent transition" data-post-id="${post.id}">
                            <i class="fas fa-share"></i>
                            <span>${post.sharesCount || 0}</span>
                        </button>
                        <!-- NEW: Appreciation Button -->
                        <button class="appreciation-btn flex items-center space-x-1" data-post-id="${post.id}">
                            <i class="fas fa-gift"></i>
                            <span>${appreciationCount}</span>
                        </button>
                    </div>
                    <button class="save-post-btn text-theme-secondary hover:text-theme-accent transition" data-post-id="${post.id}">
                        <i class="far fa-bookmark"></i>
                    </button>
                </div>
                
                <!-- Comment Input -->
                <div class="comment-input mt-4 hidden" data-post-id="${post.id}">
                    <div class="flex items-start space-x-2">
                        <img src="${currentUser.photoURL || 'https://via.placeholder.com/32'}" alt="Your avatar" class="w-8 h-8 rounded-full object-cover">
                        <div class="flex-1 flex space-x-2">
                            <input type="text" placeholder="Write a comment..." class="flex-1 p-2 glass border border-purple-700 rounded-2xl text-sm">
                            <button class="emoji-picker-btn px-3 py-2 glass border border-purple-700 rounded-2xl text-sm">
                                <i class="far fa-smile"></i>
                            </button>
                            <button class="voice-comment-btn" data-post-id="${post.id}">
                                <i class="fas fa-microphone"></i>
                            </button>
                            <button class="submit-comment px-3 py-2 rounded-2xl text-sm" style="background: var(--accent-color); color: white;" data-post-id="${post.id}">Post</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Build media HTML
function buildMediaHTML(post) {
    if (!post.media) return '';
    
    switch(post.media.type) {
        case 'image':
            return `<img src="${post.media.url}" alt="Post image" class="w-full h-auto rounded-xl mt-3">`;
        case 'video':
            return `
                <div class="relative mt-3">
                    <video src="${post.media.url}" controls class="w-full h-auto rounded-xl"></video>
                    <div class="absolute bottom-3 right-3 bg-black/50 text-white px-2 py-1 rounded-lg text-sm">
                        <i class="fas fa-play mr-1"></i> Video
                    </div>
                </div>
            `;
        case 'audio':
            return `
                <div class="mt-3 p-4 glass rounded-xl">
                    <audio src="${post.media.url}" controls class="w-full audio-player"></audio>
                </div>
            `;
        default:
            return '';
    }
}

// Build poll HTML
function buildPollHTML(post) {
    if (!post.poll) return '';
    
    const totalVotes = post.poll.totalVotes;
    const hasVoted = post.poll.voters && post.poll.voters.includes(currentUser.uid);
    
    const optionsHtml = post.poll.options.map((option, index) => {
        const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
        const isSelected = hasVoted && option.voters.includes(currentUser.uid);
        
        return `
            <div class="poll-option ${isSelected ? 'selected' : ''}" data-option-index="${index}" data-post-id="${post.id}">
                <div class="flex justify-between items-center">
                    <span>${option.text}</span>
                    <span class="text-xs">${option.votes} votes (${percentage.toFixed(1)}%)</span>
                </div>
                <div class="poll-bar" style="width: ${percentage}%"></div>
            </div>
        `;
    }).join('');
    
    return `
        <div class="mt-3 p-4 glass rounded-xl">
            <h4 class="font-semibold mb-3">${post.poll.question}</h4>
            <div class="space-y-2">
                ${optionsHtml}
            </div>
            <p class="text-xs text-theme-secondary mt-2">${totalVotes} total votes</p>
        </div>
    `;
}

// Build link preview HTML
function buildLinkPreviewHTML(post) {
    if (!post.linkPreview) return '';
    
    return `
        <div class="link-preview mt-3">
            <div class="flex">
                <div class="link-preview-content flex-1">
                    <h4 class="font-semibold text-theme-primary">${post.linkPreview.title}</h4>
                    <p class="text-sm text-theme-secondary mt-1">${post.linkPreview.description}</p>
                    <p class="text-xs text-theme-secondary mt-2">${post.linkPreview.domain}</p>
                </div>
                <img src="${post.linkPreview.image}" alt="Link preview" class="w-24 h-24 object-cover rounded-r-lg">
            </div>
        </div>
    `;
}

// Build collaborative HTML
function buildCollaborativeHTML(post) {
    if (!post.collaborative) return '';
    
    return `
        <div class="collaboration-indicator mt-2">
            <i class="fas fa-users text-theme-accent"></i>
            <span>Collaborative: ${post.collaborative.title}</span>
        </div>
    `;
}

// Build energy HTML
function buildEnergyHTML(post) {
    if (!post.energy) return '';
    
    const energyPercentage = Math.min(100, post.energy * 2);
    return `
        <div class="flex items-center mt-2 text-xs text-theme-secondary">
            <div class="w-16 h-2 bg-gray-700 rounded-full mr-2">
                <div class="h-2 bg-theme-accent rounded-full" style="width: ${energyPercentage}%"></div>
            </div>
            <span>${post.energy} energy</span>
        </div>
    `;
}

// Format post content with hashtags and mentions
function formatPostContent(post) {
    let content = post.content || '';
    
    if (post.hashtags) {
        post.hashtags.forEach(tag => {
            content = content.replace(
                new RegExp(`#${tag}`, 'g'),
                `<span class="hashtag text-theme-accent cursor-pointer">#${tag}</span>`
            );
        });
    }
    
    if (post.mentions) {
        post.mentions.forEach(mention => {
            content = content.replace(
                new RegExp(`@${mention}`, 'g'),
                `<span class="mention text-theme-accent cursor-pointer">@${mention}</span>`
            );
        });
    }
    
    return content;
}

// Set up event listeners for a post element
function setupPostEventListeners(postElement, post) {
    // Like button
    const likeBtn = postElement.querySelector('.reaction-btn');
    likeBtn.addEventListener('click', function() {
        likePost(post.id);
    });
    
    // NEW: Vibe reaction buttons
    const vibeReactionBtns = postElement.querySelectorAll('.vibe-reaction');
    vibeReactionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const vibeType = this.dataset.vibe;
            addVibeReaction(post.id, vibeType);
        });
    });
    
    // NEW: Appreciation button
    const appreciationBtn = postElement.querySelector('.appreciation-btn');
    appreciationBtn.addEventListener('click', function() {
        addAppreciation(post.id);
    });
    
    // Comment button
    const commentBtn = postElement.querySelector('.comment-btn');
    const commentInput = postElement.querySelector('.comment-input');
    commentBtn.addEventListener('click', function() {
        commentInput.classList.toggle('hidden');
    });
    
    // NEW: Emoji picker button
    const emojiPickerBtn = postElement.querySelector('.emoji-picker-btn');
    emojiPickerBtn.addEventListener('click', function() {
        const rect = this.getBoundingClientRect();
        elements.emojiPicker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
        elements.emojiPicker.style.left = `${rect.left}px`;
        elements.emojiPicker.classList.toggle('show');
    });
    
    // NEW: Voice comment button
    const voiceCommentBtn = postElement.querySelector('.voice-comment-btn');
    voiceCommentBtn.addEventListener('click', function() {
        // TODO: Implement voice recording functionality
        showNotification('Voice comments coming soon! 🎤', 'success');
    });
    
    // Submit comment
    const submitCommentBtn = postElement.querySelector('.submit-comment');
    const commentInputField = postElement.querySelector('.comment-input input');
    submitCommentBtn.addEventListener('click', function() {
        submitComment(post.id, commentInputField.value);
        commentInputField.value = '';
        commentInput.classList.add('hidden');
    });
    
    // Enter key to submit comment
    commentInputField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitComment(post.id, commentInputField.value);
            commentInputField.value = '';
            commentInput.classList.add('hidden');
        }
    });
    
    // Share button
    const shareBtn = postElement.querySelector('.share-btn');
    shareBtn.addEventListener('click', function() {
        sharePost(post.id);
    });
    
    // Save post button
    const saveBtn = postElement.querySelector('.save-post-btn');
    saveBtn.addEventListener('click', function() {
        toggleSavePost(post.id);
        this.querySelector('i').classList.toggle('far');
        this.querySelector('i').classList.toggle('fas');
    });
    
    // Hashtag and mention clicks
    const hashtags = postElement.querySelectorAll('.hashtag');
    hashtags.forEach(tag => {
        tag.addEventListener('click', function() {
            const hashtag = this.textContent.substring(1);
            elements.searchInput.value = `#${hashtag}`;
            handleSearch();
        });
    });
    
    const mentions = postElement.querySelectorAll('.mention');
    mentions.forEach(mention => {
        mention.addEventListener('click', function() {
            const username = this.textContent.substring(1);
            elements.searchInput.value = `@${username}`;
            handleSearch();
        });
    });
    
    // Poll option clicks
    const pollOptions = postElement.querySelectorAll('.poll-option');
    pollOptions.forEach(option => {
        option.addEventListener('click', function() {
            const optionIndex = this.dataset.optionIndex;
            voteInPoll(post.id, optionIndex);
        });
    });
}

// Vote in poll
function voteInPoll(postId, optionIndex) {
    if (!currentUser) {
        showNotification('Please sign in to vote in polls', 'error');
        return;
    }

    const postRef = db.collection('posts').doc(postId);
    
    db.runTransaction(transaction => {
        return transaction.get(postRef).then(postDoc => {
            if (!postDoc.exists) {
                throw new Error('Post does not exist!');
            }
            
            const postData = postDoc.data();
            const poll = postData.poll;
            
            if (!poll) {
                throw new Error('Poll does not exist!');
            }
            
            const option = poll.options[optionIndex];
            const hasVoted = poll.voters && poll.voters.includes(currentUser.uid);
            const hasVotedForOption = option.voters && option.voters.includes(currentUser.uid);
            
            if (hasVoted && !poll.multipleAnswers && !hasVotedForOption) {
                throw new Error('You have already voted in this poll!');
            }
            
            // Update vote counts
            if (hasVotedForOption) {
                // Remove vote
                option.votes = Math.max(0, option.votes - 1);
                option.voters = option.voters.filter(uid => uid !== currentUser.uid);
                poll.totalVotes = Math.max(0, poll.totalVotes - 1);
                
                if (!poll.multipleAnswers) {
                    poll.voters = poll.voters.filter(uid => uid !== currentUser.uid);
                }
            } else {
                // Add vote
                option.votes = (option.votes || 0) + 1;
                option.voters = [...(option.voters || []), currentUser.uid];
                poll.totalVotes = (poll.totalVotes || 0) + 1;
                
                if (!poll.multipleAnswers) {
                    poll.voters = [...(poll.voters || []), currentUser.uid];
                }
            }
            
            transaction.update(postRef, {
                poll: poll
            });
            
            return !hasVotedForOption; // true if voted, false if unvoted
        });
    }).then(voteAdded => {
        console.log(voteAdded ? '✅ Voted in poll' : '✅ Vote removed from poll');
        reloadPosts();
    }).catch(error => {
        console.error('❌ Error voting in poll:', error);
        showNotification('Error voting in poll: ' + error.message, 'error');
    });
}

// Share a post
function sharePost(postId) {
    if (!currentUser) {
        showNotification('Please sign in to share posts', 'error');
        return;
    }

    // In a real implementation, you would generate a shareable link
    // For this demo, we'll just show an alert and increment share count
    const postRef = db.collection('posts').doc(postId);
    postRef.update({
        sharesCount: firebase.firestore.FieldValue.increment(1)
    })
    .then(() => {
        showNotification('Post shared!', 'success');
        reloadPosts();
    })
    .catch(error => {
        console.error('❌ Error sharing post:', error);
        showNotification('Error sharing post: ' + error.message, 'error');
    });
}

// Toggle save post
function toggleSavePost(postId) {
    if (!currentUser) {
        showNotification('Please sign in to save posts', 'error');
        return;
    }

    // In a real implementation, you would update the user's saved posts
    showNotification('Post saved to collections!', 'success');
}

// Load stories from Firebase
function loadStories() {
    if (!currentUser) return;
    
    // TODO: Fetch stories from Firebase
    // For now, we'll just show a placeholder
    elements.storiesContainer.innerHTML = `
        <div class="flex flex-col items-center space-y-2 flex-shrink-0">
            <div class="story-ring" id="createStoryBtn">
                <div class="story-content">
                    <i class="fas fa-plus text-theme-accent"></i>
                </div>
            </div>
            <span class="text-xs font-semibold text-theme-accent">Your Story</span>
        </div>
        <div class="text-theme-secondary p-4">
            <p>No stories available</p>
        </div>
    `;
}

// Load trending topics from Firebase
function loadTrendingTopics() {
    if (!currentUser) return;
    
    // TODO: Fetch trending topics from Firebase
    elements.trendingTopicsContainer.innerHTML = `
        <div class="text-theme-secondary p-4 text-center">
            <p>Trending topics will appear here</p>
        </div>
    `;
}

// Load leaderboard from Firebase
function loadLeaderboard() {
    if (!currentUser) return;
    
    // TODO: Fetch leaderboard data from Firebase
    elements.leaderboardContainer.innerHTML = `
        <div class="text-theme-secondary p-4 text-center">
            <p>Leaderboard will appear here</p>
        </div>
    `;
}

// Load suggested users from Firebase
function loadSuggestedUsers() {
    if (!currentUser) return;
    
    // TODO: Fetch suggested users from Firebase
    elements.suggestedUsersContainer.innerHTML = `
        <div class="text-theme-secondary p-4 text-center">
            <p>Suggested users will appear here</p>
        </div>
    `;
}

// Utility Functions

// Extract hashtags from text
function extractHashtags(text) {
    if (!text) return [];
    const hashtags = text.match(/#\w+/g) || [];
    return hashtags.map(tag => tag.substring(1));
}

// Extract mentions from text
function extractMentions(text) {
    if (!text) return [];
    const mentions = text.match(/@\w+/g) || [];
    return mentions.map(mention => mention.substring(1));
}

// Format date
function formatDate(date) {
    if (!date) return 'Just now';
    
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

// Get mood emoji
function getMoodEmoji(mood) {
    const moodEmojis = {
        joy: '😄',
        love: '❤️',
        calm: '😌',
        excited: '🤩',
        sad: '😢',
        angry: '😠'
    };
    return moodEmojis[mood] || '😊';
}

// Show notification
function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-2xl z-50 ${
        type === 'success' ? 'bg-green-500' : 
        type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    } text-white font-semibold shadow-lg transition-all duration-300`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Add entrance animation
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translate(-50%, 0)';
    }, 10);
    
    // Remove after duration
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, CONFIG.NOTIFICATION_DURATION);
}

// Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export functions for global access (for HTML onclick handlers)
window.openCreatePostModal = openCreatePostModal;
window.visitUserProfile = visitUserProfile;
window.viewPost = viewPost;

console.log('📦 feed.js loaded successfully');