// Firebase Configuration for Kynecta
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
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Global Variables
let currentUser = null;
let userData = null;
let posts = [];
let lastPost = null;
let hasMorePosts = true;
let currentFilter = 'all';
let currentEmotionFilter = null;
let currentInterestFilter = null;
let currentContentTypeFilter = null;
let selectedReaction = null;
let currentMoodFilter = 'all';

// DOM Elements
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');
const feedContainer = document.getElementById('feedContainer');
const loadingIndicator = document.getElementById('loadingIndicator');
const endOfFeed = document.getElementById('endOfFeed');
const floatingCreateBtn = document.getElementById('floatingCreateBtn');
const createPostModal = document.getElementById('createPostModal');
const closePostModal = document.getElementById('closePostModal');
const cancelPost = document.getElementById('cancelPost');
const publishPost = document.getElementById('publishPost');
const modalPostInput = document.getElementById('modalPostInput');
const themeToggle = document.getElementById('themeToggle');
const searchInput = document.getElementById('searchInput');
const keyboardShortcuts = document.getElementById('keyboardShortcuts');
const userStatusContainer = document.getElementById('userStatusContainer');
const userAvatar = document.getElementById('userAvatar');
const userDisplayName = document.getElementById('userDisplayName');
const statusText = document.getElementById('statusText');
const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
const sidebarUserName = document.getElementById('sidebarUserName');
const sidebarUserStatus = document.getElementById('sidebarUserStatus');
const postCount = document.getElementById('postCount');
const followerCount = document.getElementById('followerCount');
const followingCount = document.getElementById('followingCount');
const emotionFilterBtn = document.getElementById('emotionFilterBtn');
const emotionOptions = document.getElementById('emotionOptions');
const interestFilterBtn = document.getElementById('interestFilterBtn');
const interestOptions = document.getElementById('interestOptions');
const contentTypeFilterBtn = document.getElementById('contentTypeFilterBtn');
const contentTypeOptions = document.getElementById('contentTypeOptions');
const storiesContainer = document.getElementById('storiesContainer');
const trendingTopicsContainer = document.getElementById('trendingTopicsContainer');
const leaderboardContainer = document.getElementById('leaderboardContainer');
const suggestedUsersContainer = document.getElementById('suggestedUsersContainer');
const currentUserAvatar = document.getElementById('currentUserAvatar');
const currentUserName = document.getElementById('currentUserName');
const signOutBtn = document.getElementById('signOutBtn');
const userEnergyRing = document.getElementById('userEnergyRing');
const energyPercentage = document.getElementById('energyPercentage');
const userBadges = document.getElementById('userBadges');
const aiSuggestion = document.getElementById('aiSuggestion');
const aiSuggestionText = document.getElementById('aiSuggestionText');
const applySuggestion = document.getElementById('applySuggestion');
const collaborativePost = document.getElementById('collaborativePost');
const toggleCollaborative = document.getElementById('toggleCollaborative');
const collaborativeSettings = document.getElementById('collaborativeSettings');
const modalAddCollaborative = document.getElementById('modalAddCollaborative');
const moodOptions = document.querySelectorAll('.mood-option');
const refreshAISuggestions = document.getElementById('refreshAISuggestions');
const aiContentSuggestionsList = document.getElementById('aiContentSuggestionsList');
const viewAllBadges = document.getElementById('viewAllBadges');
const shareGratitudeBtn = document.getElementById('shareGratitudeBtn');
const emojiPicker = document.getElementById('emojiPicker');
const toxicityWarning = document.getElementById('toxicityWarning');
const mobileNavToggle = document.getElementById('mobileNavToggle');
const sidebar = document.getElementById('sidebar');
const rightSidebar = document.getElementById('rightSidebar');

// Initialize the application
function init() {
    // Set up Firebase authentication state observer
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in
            currentUser = user;
            console.log('User signed in:', user.uid);
            
            // Load user data from Firestore
            loadUserData().then(() => {
                updateUserUI();
                loadInitialPosts();
                loadStories();
                loadTrendingTopics();
                loadLeaderboard();
                loadSuggestedUsers();
                
                // Initialize new features
                initializeNewFeatures();
            }).catch(error => {
                console.error('Error loading user data:', error);
            });
            
            signOutBtn.classList.remove('hidden');
        } else {
            // User is signed out - redirect to index page
            console.log('User not signed in, redirecting to index...');
            window.location.href = 'index.html';
        }
    });

    // Set up event listeners
    setupEventListeners();
    
    // Set up keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Set up infinite scroll
    setupInfiniteScroll();
    
    // Set up connection monitoring
    setupConnectionMonitoring();
}

// Initialize new features
function initializeNewFeatures() {
    // Initialize emoji picker
    initializeEmojiPicker();
    
    // Load AI content suggestions
    loadAIContentSuggestions();
    
    // Initialize mood-based filtering
    initializeMoodFiltering();
    
    // Initialize gamification data
    initializeGamificationData();
}

// Initialize emoji picker
function initializeEmojiPicker() {
    const emojis = ['😀', '😂', '🥰', '😎', '🤔', '🙌', '🔥', '💯', '✨', '🌟', '💖', '👍', '👏', '🎉', '💡', '🌈', '🚀', '📚', '🎨', '🎵', '🍕', '☕', '🌍', '💪'];
    
    emojiPicker.innerHTML = '';
    emojis.forEach(emoji => {
        const emojiOption = document.createElement('div');
        emojiOption.className = 'emoji-option';
        emojiOption.textContent = emoji;
        emojiOption.addEventListener('click', function() {
            const activeInput = document.activeElement;
            if (activeInput && (activeInput.tagName === 'TEXTAREA' || activeInput.tagName === 'INPUT')) {
                const cursorPosition = activeInput.selectionStart;
                const textBefore = activeInput.value.substring(0, cursorPosition);
                const textAfter = activeInput.value.substring(cursorPosition);
                activeInput.value = textBefore + emoji + textAfter;
                activeInput.focus();
                activeInput.setSelectionRange(cursorPosition + emoji.length, cursorPosition + emoji.length);
            }
            emojiPicker.classList.remove('show');
        });
        emojiPicker.appendChild(emojiOption);
    });
}

// Load AI content suggestions
function loadAIContentSuggestions() {
    // TODO: Fetch AI content suggestions from backend
    console.log('Loading AI content suggestions...');
}

// Initialize mood-based filtering
function initializeMoodFiltering() {
    moodOptions.forEach(option => {
        option.addEventListener('click', function() {
            moodOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            currentMoodFilter = this.dataset.mood;
            reloadPosts();
        });
    });
}

// Initialize gamification data
function initializeGamificationData() {
    // TODO: Fetch user's gamification data from Firebase
    console.log('Initializing gamification data...');
}

// Set up event listeners
function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Create post modal
    floatingCreateBtn.addEventListener('click', openCreatePostModal);
    closePostModal.addEventListener('click', closeCreatePostModal);
    cancelPost.addEventListener('click', closeCreatePostModal);
    publishPost.addEventListener('click', createPost);
    
    // Filter buttons
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            reloadPosts();
        });
    });
    
    // Emotion filter
    emotionFilterBtn.addEventListener('click', toggleEmotionOptions);
    document.querySelectorAll('.emotion-option').forEach(option => {
        option.addEventListener('click', function() {
            currentEmotionFilter = this.dataset.emotion;
            emotionFilterBtn.innerHTML = `<i class="fas fa-smile mr-1"></i> ${this.textContent}`;
            emotionOptions.classList.add('hidden');
            reloadPosts();
        });
    });
    
    // Interest filter
    interestFilterBtn.addEventListener('click', toggleInterestOptions);
    document.querySelectorAll('.interest-option').forEach(option => {
        option.addEventListener('click', function() {
            currentInterestFilter = this.dataset.interest;
            interestFilterBtn.innerHTML = `<i class="fas fa-tags mr-1"></i> ${this.textContent}`;
            interestOptions.classList.add('hidden');
            reloadPosts();
        });
    });
    
    // Content type filter
    contentTypeFilterBtn.addEventListener('click', toggleContentTypeOptions);
    document.querySelectorAll('.content-type-option').forEach(option => {
        option.addEventListener('click', function() {
            currentContentTypeFilter = this.dataset.contentType;
            contentTypeFilterBtn.innerHTML = `<i class="fas fa-filter mr-1"></i> ${this.textContent}`;
            contentTypeOptions.classList.add('hidden');
            reloadPosts();
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
        if (!emotionFilterBtn.contains(event.target) && !emotionOptions.contains(event.target)) {
            emotionOptions.classList.add('hidden');
        }
        if (!interestFilterBtn.contains(event.target) && !interestOptions.contains(event.target)) {
            interestOptions.classList.add('hidden');
        }
        if (!contentTypeFilterBtn.contains(event.target) && !contentTypeOptions.contains(event.target)) {
            contentTypeOptions.classList.add('hidden');
        }
        if (!emojiPicker.contains(event.target)) {
            emojiPicker.classList.remove('show');
        }
    });
    
    // Search functionality
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    // Media upload buttons
    document.getElementById('modalAddPhoto').addEventListener('click', () => document.getElementById('modalPhotoInput').click());
    document.getElementById('modalAddVideo').addEventListener('click', () => document.getElementById('modalVideoInput').click());
    document.getElementById('modalAddAudio').addEventListener('click', () => document.getElementById('modalAudioInput').click());
    document.getElementById('modalAddPoll').addEventListener('click', togglePollCreator);
    document.getElementById('modalAddLink').addEventListener('click', addLinkToPost);
    document.getElementById('modalAddCollaborative').addEventListener('click', toggleCollaborativePost);
    
    // File inputs
    document.getElementById('modalPhotoInput').addEventListener('change', handleMediaUpload);
    document.getElementById('modalVideoInput').addEventListener('change', handleMediaUpload);
    document.getElementById('modalAudioInput').addEventListener('change', handleMediaUpload);
    
    // Add poll option
    document.getElementById('addPollOption').addEventListener('click', addPollOption);
    
    // Remove poll option
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-poll-option') || 
            e.target.parentElement.classList.contains('remove-poll-option')) {
            const optionElement = e.target.closest('.flex.items-center');
            if (document.querySelectorAll('#pollOptions .flex.items-center').length > 2) {
                optionElement.remove();
            } else {
                alert('Poll must have at least 2 options');
            }
        }
    });
    
    // AI Suggestion
    applySuggestion.addEventListener('click', applyAISuggestion);
    modalPostInput.addEventListener('input', generateAISuggestion);
    
    // Collaborative post
    toggleCollaborative.addEventListener('click', function() {
        collaborativeSettings.classList.toggle('hidden');
        if (collaborativeSettings.classList.contains('hidden')) {
            this.textContent = 'Enable';
        } else {
            this.textContent = 'Disable';
        }
    });
    
    // Sign out button
    signOutBtn.addEventListener('click', signOut);
    
    // AI Content Suggestions
    refreshAISuggestions.addEventListener('click', refreshAISuggestionsHandler);
    
    // Daily Vibe
    shareGratitudeBtn.addEventListener('click', shareGratitudeHandler);
    
    // Gamification
    viewAllBadges.addEventListener('click', viewAllBadgesHandler);
    
    // Anti-toxicity filter
    modalPostInput.addEventListener('input', checkToxicity);
    
    // Mobile Navigation
    mobileNavToggle.addEventListener('click', toggleMobileNav);
}

// Toggle mobile navigation
function toggleMobileNav() {
    sidebar.classList.toggle('-translate-x-full');
}

// Refresh AI content suggestions
function refreshAISuggestionsHandler() {
    // TODO: Fetch new AI content suggestions from backend
    showNotification('Getting fresh content ideas...', 'success');
    
    // Simulate API call delay
    setTimeout(() => {
        showNotification('New content ideas loaded!', 'success');
    }, 1000);
}

// Share gratitude post
function shareGratitudeHandler() {
    openCreatePostModal();
    modalPostInput.value = "I'm grateful for... #Gratitude";
    modalPostInput.focus();
}

// View all badges
function viewAllBadgesHandler() {
    // TODO: Open modal with all user badges and achievements
    showNotification('Opening achievements dashboard...', 'success');
}

// Check for toxic content
function checkToxicity() {
    const content = modalPostInput.value;
    // TODO: Implement actual toxicity detection with AI/ML API
    const toxicKeywords = ['hate', 'stupid', 'idiot', 'kill', 'hurt'];
    const hasToxicContent = toxicKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
    );
    
    if (hasToxicContent && content.length > 10) {
        toxicityWarning.classList.remove('hidden');
    } else {
        toxicityWarning.classList.add('hidden');
    }
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
                searchInput.focus();
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
                keyboardShortcuts.classList.remove('show');
                break;
        }
    });
}

// Set up infinite scroll
function setupInfiniteScroll() {
    window.addEventListener('scroll', debounce(() => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
            if (hasMorePosts && !loadingIndicator.classList.contains('hidden')) {
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
    });
    
    window.addEventListener('offline', () => {
        updateConnectionStatus('disconnected');
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
    connectionStatus.className = `connection-status ${status}`;
    
    switch(status) {
        case 'connected':
            connectionText.innerHTML = '<i class="fas fa-wifi mr-2"></i> Connected to Kynecta';
            break;
        case 'connecting':
            connectionText.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Connecting to Kynecta...';
            break;
        case 'disconnected':
            connectionText.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> Offline';
            break;
    }
    
    // Hide status after 3 seconds if connected
    if (status === 'connected') {
        setTimeout(() => {
            connectionStatus.classList.add('hidden');
        }, 3000);
    } else {
        connectionStatus.classList.remove('hidden');
    }
}

// Auth Functions
function signOut() {
    auth.signOut()
        .then(() => {
            console.log('User signed out');
            window.location.href = 'index.html';
        })
        .catch((error) => {
            console.error('Sign out error:', error);
        });
}

// Load user data from Firebase
async function loadUserData() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            userData = userDoc.data();
            console.log('User data loaded:', userData);
            
            // Update UI with user data
            updateUserUI();
            
            return userData;
        } else {
            // Create user document if it doesn't exist
            return createUserDocument();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        throw error;
    }
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
        streak: 0,
        points: 0,
        achievements: []
    };
    
    return db.collection('users').doc(currentUser.uid).set(userData)
        .then(() => {
            console.log('User document created');
            return userData;
        })
        .catch(error => {
            console.error('Error creating user document:', error);
            throw error;
        });
}

// Update user UI with current user data
function updateUserUI() {
    if (currentUser && userData) {
        const displayName = userData.userName || currentUser.displayName || 'User';
        const photoURL = userData.userAvatar || currentUser.photoURL || 'https://via.placeholder.com/40';
        
        userAvatar.src = photoURL;
        userDisplayName.textContent = displayName;
        sidebarUserAvatar.src = photoURL;
        sidebarUserName.textContent = displayName;
        currentUserAvatar.src = photoURL;
        currentUserName.textContent = displayName;
        
        postCount.textContent = userData.postsCount || 0;
        followerCount.textContent = userData.followersCount || 0;
        followingCount.textContent = userData.followingCount || 0;
        statusText.textContent = userData.status || 'Online';
        sidebarUserStatus.textContent = userData.status || 'Online';
        
        // Update user energy
        updateUserEnergyDisplay(userData.energy || 0);
        
        // Load user badges
        loadUserBadges(userData.badges || []);
    } else if (currentUser) {
        // Fallback to Firebase Auth data if userData not loaded yet
        userAvatar.src = currentUser.photoURL || 'https://via.placeholder.com/40';
        userDisplayName.textContent = currentUser.displayName || 'User';
        sidebarUserAvatar.src = currentUser.photoURL || 'https://via.placeholder.com/40';
        sidebarUserName.textContent = currentUser.displayName || 'User';
        currentUserAvatar.src = currentUser.photoURL || 'https://via.placeholder.com/40';
        currentUserName.textContent = currentUser.displayName || 'User';
    }
}

// Toggle theme
function toggleTheme() {
    const body = document.body;
    if (body.classList.contains('dark-theme')) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
    } else if (body.classList.contains('light-theme')) {
        body.classList.remove('light-theme');
        body.classList.add('cyber-theme');
        localStorage.setItem('theme', 'cyber');
    } else {
        body.classList.remove('cyber-theme');
        body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
    }
}

// Toggle emotion options
function toggleEmotionOptions() {
    emotionOptions.classList.toggle('hidden');
    interestOptions.classList.add('hidden');
    contentTypeOptions.classList.add('hidden');
}

// Toggle interest options
function toggleInterestOptions() {
    interestOptions.classList.toggle('hidden');
    emotionOptions.classList.add('hidden');
    contentTypeOptions.classList.add('hidden');
}

// Toggle content type options
function toggleContentTypeOptions() {
    contentTypeOptions.classList.toggle('hidden');
    emotionOptions.classList.add('hidden');
    interestOptions.classList.add('hidden');
}

// Toggle keyboard shortcuts display
function toggleKeyboardShortcuts() {
    keyboardShortcuts.classList.toggle('show');
}

// Open create post modal
function openCreatePostModal() {
    if (!currentUser) {
        alert('Please sign in to create a post');
        return;
    }
    createPostModal.classList.remove('hidden');
    modalPostInput.focus();
}

// Close create post modal
function closeCreatePostModal() {
    createPostModal.classList.add('hidden');
    resetPostModal();
}

// Reset post modal to initial state
function resetPostModal() {
    modalPostInput.value = '';
    document.getElementById('pollCreator').classList.add('hidden');
    document.getElementById('modalMediaPreview').classList.add('hidden');
    document.getElementById('linkPreview').classList.add('hidden');
    document.getElementById('postMood').value = '';
    document.getElementById('postAudience').value = 'public';
    aiSuggestion.classList.add('hidden');
    collaborativePost.classList.add('hidden');
    collaborativeSettings.classList.add('hidden');
    toxicityWarning.classList.add('hidden');
}

// Create Post Function
function createPost() {
    if (!currentUser) {
        alert('Please sign in to create a post');
        return;
    }

    const content = modalPostInput.value.trim();
    if (!content && !document.getElementById('modalMediaPreview').classList.contains('hidden')) {
        alert('Please add some content to your post');
        return;
    }
    
    const mood = document.getElementById('postMood').value;
    const audience = document.getElementById('postAudience').value;
    
    // Create post object
    const postData = {
        content: content,
        userId: currentUser.uid,
        userName: userData?.userName || currentUser.displayName || 'Anonymous',
        userAvatar: userData?.userAvatar || currentUser.photoURL || '',
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
        energy: calculatePostEnergy(content),
        aiGenerated: false,
        vibeReactions: {
            energy: 0,
            deep: 0,
            pure: 0,
            creative: 0
        },
        appreciationCount: 0
    };
    
    // Add poll data if applicable
    if (document.getElementById('pollCreator').classList.contains('hidden') === false) {
        const pollQuestion = document.getElementById('pollQuestion').value;
        const pollOptions = Array.from(document.querySelectorAll('#pollOptions input')).map(input => ({
            text: input.value,
            votes: 0,
            voters: []
        }));
        
        if (pollQuestion && pollOptions.length >= 2) {
            postData.poll = {
                question: pollQuestion,
                options: pollOptions,
                multipleAnswers: document.getElementById('multiplePollAnswers').checked,
                totalVotes: 0
            };
        }
    }
    
    // Collaborative Post
    if (!collaborativeSettings.classList.contains('hidden')) {
        const collaborativeTitle = document.getElementById('collaborativeTitle').value;
        const collaborativeType = document.getElementById('collaborativeType').value;
        const allowEdits = document.getElementById('allowEdits').checked;
        
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
    
    // Save to Firebase
    db.collection('posts').add(postData)
        .then(docRef => {
            console.log('Post published with ID: ', docRef.id);
            showNotification('Post published successfully!', 'success');
            closeCreatePostModal();
            reloadPosts();
            
            // Update user's post count
            updateUserPostCount(1);
            
            // Update user energy
            updateUserEnergy(5);
            
            // Update user streak
            updateUserStreak();
        })
        .catch(error => {
            console.error('Error publishing post: ', error);
            showNotification('Error publishing post: ' + error.message, 'error');
        });
}

// Update user post count
function updateUserPostCount(increment) {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).update({
        postsCount: firebase.firestore.FieldValue.increment(increment)
    })
    .then(() => {
        // Reload user data to reflect changes
        loadUserData();
    })
    .catch(error => {
        console.error('Error updating user post count:', error);
    });
}

// Update user energy
function updateUserEnergy(points) {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser.uid).update({
        energy: firebase.firestore.FieldValue.increment(points)
    })
    .then(() => {
        // Reload user data to reflect changes
        loadUserData();
    })
    .catch(error => {
        console.error('Error updating user energy:', error);
    });
}

// Update user energy display
function updateUserEnergyDisplay(energy) {
    const percentage = Math.min(100, energy);
    userEnergyRing.style.background = `conic-gradient(var(--accent-color) ${percentage}%, transparent ${percentage}%)`;
    energyPercentage.textContent = `${percentage}%`;
}

// Load user badges
function loadUserBadges(badges) {
    userBadges.innerHTML = '';
    
    const badgeConfig = {
        'newcomer': { text: 'Newcomer', color: 'bg-blue-500' },
        'contributor': { text: 'Contributor', color: 'bg-green-500' },
        'influencer': { text: 'Influencer', color: 'bg-purple-500' },
        'collaborator': { text: 'Collaborator', color: 'bg-yellow-500' },
        'visionary': { text: 'Visionary', color: 'bg-pink-500' }
    };
    
    badges.forEach(badge => {
        if (badgeConfig[badge]) {
            const badgeElement = document.createElement('span');
            badgeElement.className = `kynecta-badge ${badgeConfig[badge].color}`;
            badgeElement.textContent = badgeConfig[badge].text;
            userBadges.appendChild(badgeElement);
        }
    });
}

// Update user streak
function updateUserStreak() {
    // TODO: Implement streak tracking logic in Firebase
    console.log('Updating user streak...');
}

// Like Post Function
function likePost(postId) {
    if (!currentUser) {
        alert('Please sign in to like posts');
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
        console.log(likeAdded ? 'Post liked' : 'Post unliked');
        reloadPosts();
        
        // Update user energy
        if (likeAdded) {
            updateUserEnergy(1);
        }
    }).catch(error => {
        console.error('Transaction failed: ', error);
        showNotification('Error liking post: ' + error.message, 'error');
    });
}

// Add vibe reaction to post
function addVibeReaction(postId, vibeType) {
    if (!currentUser) {
        alert('Please sign in to react to posts');
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
        console.log(`Added ${vibeType} vibe reaction`);
        reloadPosts();
        
        // Update user energy
        updateUserEnergy(1);
    }).catch(error => {
        console.error('Transaction failed: ', error);
        showNotification('Error adding reaction: ' + error.message, 'error');
    });
}

// Add appreciation to post
function addAppreciation(postId) {
    if (!currentUser) {
        alert('Please sign in to appreciate posts');
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
        console.log('Added appreciation');
        reloadPosts();
        
        // TODO: Process payment through Flutterwave/M-Pesa API
        showNotification('Thank you for your appreciation!', 'success');
    }).catch(error => {
        console.error('Transaction failed: ', error);
        showNotification('Error adding appreciation: ' + error.message, 'error');
    });
}

// Submit Comment Function
function submitComment(postId, commentText) {
    if (!currentUser) {
        alert('Please sign in to comment');
        return;
    }

    if (!commentText.trim()) {
        alert('Please enter a comment');
        return;
    }

    const commentData = {
        userId: currentUser.uid,
        userName: userData?.userName || currentUser.displayName || 'Anonymous',
        userAvatar: userData?.userAvatar || currentUser.photoURL || '',
        content: commentText.trim(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        replies: [],
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
            console.log('Comment added successfully');
            showNotification('Comment added!', 'success');
            reloadPosts();
            
            // Update user energy
            updateUserEnergy(2);
        })
        .catch(error => {
            console.error('Error adding comment: ', error);
            showNotification('Error adding comment: ' + error.message, 'error');
        });
}

// Submit nested reply to comment
function submitReply(postId, commentId, replyText) {
    if (!currentUser) {
        alert('Please sign in to reply');
        return;
    }

    if (!replyText.trim()) {
        alert('Please enter a reply');
        return;
    }

    const replyData = {
        userId: currentUser.uid,
        userName: userData?.userName || currentUser.displayName || 'Anonymous',
        userAvatar: userData?.userAvatar || currentUser.photoURL || '',
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
        console.log('Reply added successfully');
        showNotification('Reply added!', 'success');
        reloadPosts();
        
        // Update user energy
        updateUserEnergy(1);
    }).catch(error => {
        console.error('Error adding reply: ', error);
        showNotification('Error adding reply: ' + error.message, 'error');
    });
}

// Toggle poll creator
function togglePollCreator() {
    const pollCreator = document.getElementById('pollCreator');
    pollCreator.classList.toggle('hidden');
}

// Toggle collaborative post
function toggleCollaborativePost() {
    collaborativePost.classList.toggle('hidden');
}

// Add poll option
function addPollOption() {
    const pollOptions = document.getElementById('pollOptions');
    const optionCount = pollOptions.children.length;
    
    if (optionCount >= 6) {
        alert('Maximum 6 options allowed');
        return;
    }
    
    const newOption = document.createElement('div');
    newOption.className = 'flex items-center space-x-2';
    newOption.innerHTML = `
        <input type="text" placeholder="Option ${optionCount + 1}" class="flex-1 p-2 glass border border-purple-700 rounded-lg">
        <button class="text-red-500 remove-poll-option"><i class="fas fa-times"></i></button>
    `;
    
    pollOptions.appendChild(newOption);
}

// Add link to post
function addLinkToPost() {
    const url = prompt('Enter URL:');
    if (url) {
        // In a real implementation, you would fetch the link metadata
        document.getElementById('linkTitle').textContent = 'Example Website';
        document.getElementById('linkDescription').textContent = 'This is an example website description that would be fetched from the provided URL.';
        document.getElementById('linkDomain').textContent = new URL(url).hostname;
        document.getElementById('linkImage').src = 'https://via.placeholder.com/150';
        document.getElementById('linkPreview').classList.remove('hidden');
    }
}

// Generate AI Suggestion
function generateAISuggestion() {
    const content = modalPostInput.value.trim();
    if (content.length > 10 && content.length < 100) {
        // Simple AI suggestion logic
        const suggestions = [
            "Try adding a question to engage your audience!",
            "Consider adding relevant hashtags to increase visibility.",
            "This would be a great post to add a poll to!",
            "Your post might benefit from adding an image or video.",
            "This sounds like a perfect topic for a collaborative discussion!"
        ];
        
        const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
        aiSuggestionText.textContent = randomSuggestion;
        aiSuggestion.classList.remove('hidden');
    } else {
        aiSuggestion.classList.add('hidden');
    }
}

// Apply AI Suggestion
function applyAISuggestion() {
    const suggestion = aiSuggestionText.textContent;
    if (suggestion.includes("question")) {
        modalPostInput.value += " What do you think?";
    } else if (suggestion.includes("hashtags")) {
        modalPostInput.value += " #Kynecta #SocialMedia";
    } else if (suggestion.includes("poll")) {
        togglePollCreator();
    } else if (suggestion.includes("image") || suggestion.includes("video")) {
        document.getElementById('modalAddPhoto').click();
    } else if (suggestion.includes("collaborative")) {
        toggleCollaborativePost();
    }
    
    aiSuggestion.classList.add('hidden');
}

// Handle media upload
function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const modalMediaPreview = document.getElementById('modalMediaPreview');
    modalMediaPreview.classList.remove('hidden');
    
    // Show upload progress
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    uploadProgress.classList.remove('hidden');
    uploadProgressBar.style.width = '0%';
    
    // Determine file type
    const fileType = file.type.split('/')[0];
    
    // Hide all media previews first
    document.getElementById('modalPreviewImage').classList.add('hidden');
    document.getElementById('modalPreviewVideo').classList.add('hidden');
    document.getElementById('modalPreviewAudio').classList.add('hidden');
    
    // Show appropriate preview
    if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('modalPreviewImage').src = e.target.result;
            document.getElementById('modalPreviewImage').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else if (fileType === 'video') {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('modalPreviewVideo').src = e.target.result;
            document.getElementById('modalPreviewVideo').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else if (fileType === 'audio') {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('modalPreviewAudio').src = e.target.result;
            document.getElementById('modalPreviewAudio').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
    
    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        uploadProgressBar.style.width = `${progress}%`;
        
        if (progress >= 100) {
            clearInterval(interval);
            uploadProgress.classList.add('hidden');
            // In a real implementation, you would upload to Firebase Storage here
        }
    }, 100);
}

// Handle search
function handleSearch() {
    const query = searchInput.value.trim();
    if (query.length < 2) {
        // Clear search results if query is too short
        document.getElementById('searchResults').innerHTML = '';
        return;
    }
    
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
            console.error('Search error:', error);
        });
}

// Display search results
function displaySearchResults(usersSnapshot, postsSnapshot, query) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';
    
    if (usersSnapshot.empty && postsSnapshot.empty) {
        searchResults.innerHTML = '<div class="p-4 text-center text-theme-secondary">No results found</div>';
        return;
    }
    
    let html = '<div class="search-results-container p-4">';
    
    // Add users
    if (!usersSnapshot.empty) {
        html += '<div class="mb-4"><h3 class="font-semibold text-theme-accent mb-2">People</h3>';
        usersSnapshot.forEach(doc => {
            const user = doc.data();
            html += `
                <div class="search-result-item p-3 rounded-lg glass mb-2 cursor-pointer hover:bg-purple-900/30 transition flex items-center">
                    <img src="${user.userAvatar || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded-full mr-3">
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
                <div class="search-result-item p-3 rounded-lg glass mb-2 cursor-pointer hover:bg-purple-900/30 transition">
                    <p class="text-sm">${highlightText(post.content, query)}</p>
                    <div class="flex items-center mt-2 text-xs text-theme-secondary">
                        <img src="${post.userAvatar}" class="w-4 h-4 rounded-full mr-1">
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
    searchResults.innerHTML = html;
}

// Highlight search terms in text
function highlightText(text, query) {
    if (!text) return '';
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-300 text-black">$1</mark>');
}

// Load initial posts from Firebase
function loadInitialPosts() {
    if (!currentUser) return;
    
    loadingIndicator.classList.remove('hidden');
    endOfFeed.classList.add('hidden');
    
    let query = db.collection('posts')
        .orderBy('timestamp', 'desc')
        .limit(10);
    
    // Apply filters if set
    if (currentFilter === 'top') {
        query = query.orderBy('likesCount', 'desc');
    } else if (currentFilter === 'trending') {
        query = query.orderBy('viewsCount', 'desc');
    }
    
    if (currentEmotionFilter) {
        query = query.where('mood', '==', currentEmotionFilter);
    }
    
    // Apply mood-based filtering
    if (currentMoodFilter && currentMoodFilter !== 'all') {
        // TODO: Implement mood-based filtering logic
        console.log('Filtering by mood:', currentMoodFilter);
    }
    
    if (currentContentTypeFilter === 'poll') {
        query = query.where('poll', '!=', null);
    } else if (currentContentTypeFilter === 'collaborative') {
        query = query.where('collaborative', '!=', null);
    }
    
    query.get()
        .then(snapshot => {
            posts = [];
            snapshot.forEach(doc => {
                posts.push({ id: doc.id, ...doc.data() });
            });
            
            displayPosts(posts);
            loadingIndicator.classList.add('hidden');
            
            if (snapshot.docs.length > 0) {
                lastPost = snapshot.docs[snapshot.docs.length - 1];
                hasMorePosts = true;
            } else {
                hasMorePosts = false;
                endOfFeed.classList.remove('hidden');
            }
        })
        .catch(error => {
            console.error('Error loading posts:', error);
            loadingIndicator.classList.add('hidden');
            showNotification('Error loading posts: ' + error.message, 'error');
        });
}

// Load more posts for infinite scroll
function loadMorePosts() {
    if (!hasMorePosts || !currentUser) return;
    
    loadingIndicator.classList.remove('hidden');
    
    let query = db.collection('posts')
        .orderBy('timestamp', 'desc')
        .startAfter(lastPost)
        .limit(10);
    
    // Apply filters if set
    if (currentFilter === 'top') {
        query = query.orderBy('likesCount', 'desc');
    } else if (currentFilter === 'trending') {
        query = query.orderBy('viewsCount', 'desc');
    }
    
    if (currentEmotionFilter) {
        query = query.where('mood', '==', currentEmotionFilter);
    }
    
    // Apply mood-based filtering
    if (currentMoodFilter && currentMoodFilter !== 'all') {
        console.log('Filtering by mood:', currentMoodFilter);
    }
    
    if (currentContentTypeFilter === 'poll') {
        query = query.where('poll', '!=', null);
    } else if (currentContentTypeFilter === 'collaborative') {
        query = query.where('collaborative', '!=', null);
    }
    
    query.get()
        .then(snapshot => {
            const newPosts = [];
            snapshot.forEach(doc => {
                newPosts.push({ id: doc.id, ...doc.data() });
            });
            
            posts = [...posts, ...newPosts];
            displayPosts(posts);
            loadingIndicator.classList.add('hidden');
            
            if (snapshot.docs.length > 0) {
                lastPost = snapshot.docs[snapshot.docs.length - 1];
            } else {
                hasMorePosts = false;
                endOfFeed.classList.remove('hidden');
            }
        })
        .catch(error => {
            console.error('Error loading more posts:', error);
            loadingIndicator.classList.add('hidden');
            showNotification('Error loading more posts: ' + error.message, 'error');
        });
}

// Reload posts with current filters
function reloadPosts() {
    if (!currentUser) return;
    feedContainer.innerHTML = '';
    loadInitialPosts();
}

// Display posts in the feed
function displayPosts(postsToDisplay) {
    feedContainer.innerHTML = '';
    
    if (postsToDisplay.length === 0) {
        feedContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-inbox text-4xl text-theme-secondary mb-4"></i>
                <h3 class="text-xl font-semibold text-theme-primary mb-2">No posts found</h3>
                <p class="text-theme-secondary">Try changing your filters or be the first to post!</p>
            </div>
        `;
        return;
    }
    
    postsToDisplay.forEach(post => {
        const postElement = createPostElement(post);
        feedContainer.appendChild(postElement);
    });
}

// Create a post element
function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post-card p-5';
    postElement.dataset.postId = post.id;
    
    let mediaHtml = '';
    if (post.media) {
        if (post.media.type === 'image') {
            mediaHtml = `<img src="${post.media.url}" alt="Post image" class="w-full h-auto rounded-xl mt-3">`;
        } else if (post.media.type === 'video') {
            mediaHtml = `
                <div class="relative mt-3">
                    <video src="${post.media.url}" controls class="w-full h-auto rounded-xl"></video>
                    <div class="absolute bottom-3 right-3 bg-black/50 text-white px-2 py-1 rounded-lg text-sm">
                        <i class="fas fa-play mr-1"></i> Video
                    </div>
                </div>
            `;
        } else if (post.media.type === 'audio') {
            mediaHtml = `
                <div class="mt-3 p-4 glass rounded-xl">
                    <audio src="${post.media.url}" controls class="w-full audio-player"></audio>
                </div>
            `;
        }
    }
    
    let pollHtml = '';
    if (post.poll) {
        const totalVotes = post.poll.totalVotes;
        pollHtml = `
            <div class="mt-3 p-4 glass rounded-xl">
                <h4 class="font-semibold mb-3">${post.poll.question}</h4>
                <div class="space-y-2">
                    ${post.poll.options.map((option, index) => {
                        const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
                        const hasVoted = post.poll.voters && post.poll.voters.includes(currentUser.uid);
                        const isSelected = hasVoted && option.voters.includes(currentUser.uid);
                        
                        return `
                            <div class="poll-option ${isSelected ? 'selected' : ''}" data-option-index="${index}">
                                <div class="flex justify-between items-center">
                                    <span>${option.text}</span>
                                    <span class="text-xs">${option.votes} votes (${percentage.toFixed(1)}%)</span>
                                </div>
                                <div class="poll-bar" style="width: ${percentage}%"></div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <p class="text-xs text-theme-secondary mt-2">${totalVotes} total votes</p>
            </div>
        `;
    }
    
    let linkPreviewHtml = '';
    if (post.linkPreview) {
        linkPreviewHtml = `
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
    
    // Format hashtags and mentions
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
    
    // Check if current user liked the post
    const userLiked = post.likes && post.likes.includes(currentUser.uid);
    
    // Vibe reactions
    const vibeReactions = post.vibeReactions || {
        energy: 0,
        deep: 0,
        pure: 0,
        creative: 0
    };
    
    // Appreciation count
    const appreciationCount = post.appreciationCount || 0;
    
    // Collaborative Post Indicator
    let collaborativeHtml = '';
    if (post.collaborative) {
        collaborativeHtml = `
            <div class="collaboration-indicator mt-2">
                <i class="fas fa-users text-theme-accent"></i>
                <span>Collaborative: ${post.collaborative.title}</span>
            </div>
        `;
    }
    
    // Post Energy Indicator
    let energyHtml = '';
    if (post.energy) {
        const energyPercentage = Math.min(100, post.energy * 2);
        energyHtml = `
            <div class="flex items-center mt-2 text-xs text-theme-secondary">
                <div class="w-16 h-2 bg-gray-700 rounded-full mr-2">
                    <div class="h-2 bg-theme-accent rounded-full" style="width: ${energyPercentage}%"></div>
                </div>
                <span>${post.energy} energy</span>
            </div>
        `;
    }
    
    postElement.innerHTML = `
        <div class="flex items-start space-x-3">
            <img src="${post.userAvatar || 'https://via.placeholder.com/40'}" alt="${post.userName}'s avatar" class="w-10 h-10 rounded-2xl object-cover cursor-pointer">
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-semibold text-theme-primary cursor-pointer">${post.userName}</h3>
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
                
                <!-- Vibe Reactions -->
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
                        <button class="share-btn flex items-center space-x-1 hover:text-theme-accent transition">
                            <i class="fas fa-share"></i>
                            <span>${post.sharesCount || 0}</span>
                        </button>
                        <!-- Appreciation Button -->
                        <button class="appreciation-btn flex items-center space-x-1" data-post-id="${post.id}">
                            <i class="fas fa-gift"></i>
                            <span>${appreciationCount}</span>
                        </button>
                    </div>
                    <button class="save-post-btn text-theme-secondary hover:text-theme-accent transition">
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
                            <button class="voice-comment-btn">
                                <i class="fas fa-microphone"></i>
                            </button>
                            <button class="submit-comment px-3 py-2 rounded-2xl text-sm" style="background: var(--accent-color); color: white;" data-post-id="${post.id}">Post</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Set up event listeners for this post
    setupPostEventListeners(postElement, post);
    
    return postElement;
}

// Set up event listeners for a post element
function setupPostEventListeners(postElement, post) {
    // Like button
    const likeBtn = postElement.querySelector('.reaction-btn');
    likeBtn.addEventListener('click', function() {
        likePost(post.id);
    });
    
    // Vibe reaction buttons
    const vibeReactionBtns = postElement.querySelectorAll('.vibe-reaction');
    vibeReactionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const vibeType = this.dataset.vibe;
            addVibeReaction(post.id, vibeType);
        });
    });
    
    // Appreciation button
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
    
    // Emoji picker button
    const emojiPickerBtn = postElement.querySelector('.emoji-picker-btn');
    emojiPickerBtn.addEventListener('click', function() {
        const rect = this.getBoundingClientRect();
        emojiPicker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
        emojiPicker.style.left = `${rect.left}px`;
        emojiPicker.classList.toggle('show');
    });
    
    // Voice comment button
    const voiceCommentBtn = postElement.querySelector('.voice-comment-btn');
    voiceCommentBtn.addEventListener('click', function() {
        // TODO: Implement voice recording functionality
        showNotification('Voice comments coming soon!', 'success');
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
            searchInput.value = `#${hashtag}`;
            handleSearch();
        });
    });
    
    const mentions = postElement.querySelectorAll('.mention');
    mentions.forEach(mention => {
        mention.addEventListener('click', function() {
            const username = this.textContent.substring(1);
            searchInput.value = `@${username}`;
            handleSearch();
        });
    });
}

// Share a post
function sharePost(postId) {
    if (!currentUser) {
        alert('Please sign in to share posts');
        return;
    }

    // In a real implementation, you would generate a shareable link
    const postRef = db.collection('posts').doc(postId);
    postRef.update({
        sharesCount: firebase.firestore.FieldValue.increment(1)
    })
    .then(() => {
        showNotification('Post shared!', 'success');
        reloadPosts();
    })
    .catch(error => {
        console.error('Error sharing post:', error);
        showNotification('Error sharing post: ' + error.message, 'error');
    });
}

// Toggle save post
function toggleSavePost(postId) {
    if (!currentUser) {
        alert('Please sign in to save posts');
        return;
    }

    // In a real implementation, you would update the user's saved posts
    showNotification('Post saved to collections!', 'success');
}

// Load stories from Firebase
function loadStories() {
    if (!currentUser) return;
    
    // In a real implementation, you would fetch stories from Firebase
    storiesContainer.innerHTML = `
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
    
    // In a real implementation, you would fetch trending topics from Firebase
    trendingTopicsContainer.innerHTML = `
        <div class="text-theme-secondary p-4 text-center">
            <p>Trending topics will appear here</p>
        </div>
    `;
}

// Load leaderboard from Firebase
function loadLeaderboard() {
    if (!currentUser) return;
    
    // In a real implementation, you would fetch leaderboard data from Firebase
    leaderboardContainer.innerHTML = `
        <div class="text-theme-secondary p-4 text-center">
            <p>Leaderboard will appear here</p>
        </div>
    `;
}

// Load suggested users from Firebase
function loadSuggestedUsers() {
    if (!currentUser) return;
    
    // In a real implementation, you would fetch suggested users from Firebase
    suggestedUsersContainer.innerHTML = `
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

// Calculate post energy
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
    
    return Math.min(energy, 50);
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
    } text-white font-semibold shadow-lg`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
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