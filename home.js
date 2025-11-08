// home.js - Production Ready Firebase Integration for Kynecta
const firebaseConfig = {
  apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
  authDomain: "unconnect-social.firebaseapp.com",
  projectId: "unconnect-social",
  storageBucket: "unconnect-social.firebasestorage.app",
  messagingSenderId: "1003264444309",
  appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const appData = {
    currentUser: null,
    following: [],
    taggedUsers: [],
    taggedGroups: [],
    friends: [],
    groups: [],
    currentMediaType: null,
    userEnergy: 0,
    userBadges: []
};

// Firebase References
const db = firebase.firestore();
const auth = firebase.auth();
const postsRef = db.collection("posts");
const usersRef = db.collection("users");
const statusesRef = db.collection("statuses");
const commentsRef = db.collection("comments");
const likesRef = db.collection("likes");
const viewsRef = db.collection("views");
const badgesRef = db.collection("badges");
const collaborationsRef = db.collection("collaborations");

// Track which posts user has liked
const userLikes = new Set();
const userCommentLikes = new Set();

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Kynecta...');
    initializeApp();
    setupEventListeners();
    setupThemeSelector();
    setupScrollToTop();
    populateEmojiGrid();
    setupErrorHandling();
    setupKynectaFeatures();
});

// ========== KYNECTA UNIQUE FEATURES SETUP ==========
function setupKynectaFeatures() {
    // Initialize energy system
    initializeEnergySystem();
    
    // Setup collaborative features
    setupCollaborativeFeatures();
    
    // Setup AI suggestions
    setupAISuggestions();
    
    // Setup badge system
    setupBadgeSystem();
}

function initializeEnergySystem() {
    // Update energy display every minute
    setInterval(updateEnergyDisplay, 60000);
    
    // Award energy for active browsing
    document.addEventListener('mousemove', debounce(() => {
        awardEnergy(0.1, 'active_browsing');
    }, 30000));
    
    // Award energy for scrolling (engagement)
    let lastScrollTop = 0;
    window.addEventListener('scroll', debounce(() => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > lastScrollTop) {
            awardEnergy(0.05, 'scrolling_engagement');
        }
        lastScrollTop = scrollTop;
    }, 10000));
}

function setupCollaborativeFeatures() {
    // Listen for collaborative post updates
    collaborationsRef.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
                updateCollaborativePostUI(change.doc.id, change.doc.data());
            }
        });
    });
}

function setupAISuggestions() {
    // AI content analysis for posts
    const postInput = document.getElementById('postInput');
    if (postInput) {
        postInput.addEventListener('input', debounce(analyzeContentForSuggestions, 1000));
    }
}

function setupBadgeSystem() {
    // Check for badge achievements periodically
    setInterval(checkForBadgeAchievements, 300000); // Every 5 minutes
}

// ========== AUTHENTICATION SETUP ==========
async function initializeApp() {
    try {
        console.log('Initializing Kynecta Firebase...');
        
        // Check authentication state
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await setupCurrentUser(user);
                await loadUserLikes();
                await loadUserEnergyAndBadges();
                loadPosts();
                loadTrendingPosts();
                loadStatuses();
                loadCollaborativePosts();
            } else {
                // Redirect to login or show login modal
                redirectToLogin();
            }
        });
        
    } catch (error) {
        console.error("Error initializing Kynecta:", error);
        showNotification('Error initializing Kynecta application', 'error');
    }
}

async function setupCurrentUser(user) {
    try {
        // Get user data from Firestore
        const userDoc = await usersRef.doc(user.uid).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            appData.currentUser = {
                id: user.uid,
                name: userData.name || user.displayName || 'User',
                avatar: userData.avatar || 'from-blue-400 to-purple-500',
                email: user.email,
                energy: userData.energy || 0,
                badges: userData.badges || []
            };
            
            // Update UI with user data
            updateUserEnergyDisplay(userData.energy || 0);
            loadUserBadges(userData.badges || []);
        } else {
            // Create new user document for Kynecta
            appData.currentUser = {
                id: user.uid,
                name: user.displayName || 'User',
                avatar: 'from-blue-400 to-purple-500',
                email: user.email,
                energy: 10, // Starting energy
                badges: ['newcomer']
            };
            
            await usersRef.doc(user.uid).set({
                name: appData.currentUser.name,
                avatar: appData.currentUser.avatar,
                email: user.email,
                energy: appData.currentUser.energy,
                badges: appData.currentUser.badges,
                following: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Award newcomer badge
            await awardBadge(user.uid, 'newcomer');
        }
        
        await loadFollowingList();
        await loadFriendsAndGroups();
        updateUIForAuthState(true);
        
    } catch (error) {
        console.error("Error setting up current user:", error);
        showNotification('Error loading Kynecta user data', 'error');
    }
}

async function loadUserEnergyAndBadges() {
    try {
        if (!appData.currentUser) return;
        
        const userDoc = await usersRef.doc(appData.currentUser.id).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            appData.userEnergy = userData.energy || 0;
            appData.userBadges = userData.badges || [];
            
            updateUserEnergyDisplay(appData.userEnergy);
            loadUserBadges(appData.userBadges);
        }
    } catch (error) {
        console.error("Error loading user energy and badges:", error);
    }
}

function updateUserEnergyDisplay(energy) {
    const energyRing = document.getElementById('userEnergyRing');
    const energyPercentage = document.getElementById('energyPercentage');
    
    if (energyRing && energyPercentage) {
        const percentage = Math.min(100, energy);
        energyRing.style.background = `conic-gradient(var(--accent-color) ${percentage}%, transparent ${percentage}%)`;
        energyPercentage.textContent = `${Math.round(percentage)}%`;
    }
}

function loadUserBadges(badges) {
    const userBadgesContainer = document.getElementById('userBadges');
    if (!userBadgesContainer) return;
    
    userBadgesContainer.innerHTML = '';
    
    const badgeConfig = {
        'newcomer': { text: 'Newcomer', color: 'bg-blue-500', icon: 'fas fa-seedling' },
        'contributor': { text: 'Contributor', color: 'bg-green-500', icon: 'fas fa-pencil-alt' },
        'influencer': { text: 'Influencer', color: 'bg-purple-500', icon: 'fas fa-fire' },
        'collaborator': { text: 'Collaborator', color: 'bg-yellow-500', icon: 'fas fa-users' },
        'visionary': { text: 'Visionary', color: 'bg-pink-500', icon: 'fas fa-lightbulb' },
        'energizer': { text: 'Energizer', color: 'bg-orange-500', icon: 'fas fa-bolt' }
    };
    
    badges.forEach(badge => {
        if (badgeConfig[badge]) {
            const badgeElement = document.createElement('span');
            badgeElement.className = `kynecta-badge ${badgeConfig[badge].color} flex items-center space-x-1`;
            badgeElement.innerHTML = `
                <i class="${badgeConfig[badge].icon} text-xs"></i>
                <span>${badgeConfig[badge].text}</span>
            `;
            userBadgesContainer.appendChild(badgeElement);
        }
    });
}

function redirectToLogin() {
    console.log('User not authenticated, redirecting to Kynecta login...');
    showLoginModal();
}

function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.classList.remove('hidden');
    }
}

function updateUIForAuthState(isLoggedIn) {
    const authElements = document.querySelectorAll('[data-auth]');
    authElements.forEach(element => {
        if (isLoggedIn) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    });
}

// ========== KYNECTA ENERGY SYSTEM ==========
async function awardEnergy(amount, reason) {
    if (!appData.currentUser) return;
    
    try {
        const newEnergy = Math.min(100, appData.userEnergy + amount);
        appData.userEnergy = newEnergy;
        
        await usersRef.doc(appData.currentUser.id).update({
            energy: newEnergy
        });
        
        updateUserEnergyDisplay(newEnergy);
        
        // Check for energy-based badges
        if (newEnergy >= 50 && !appData.userBadges.includes('energizer')) {
            await awardBadge(appData.currentUser.id, 'energizer');
        }
        
    } catch (error) {
        console.error("Error awarding energy:", error);
    }
}

async function consumeEnergy(amount, action) {
    if (!appData.currentUser) return false;
    
    if (appData.userEnergy < amount) {
        showNotification(`Not enough energy to ${action}. Stay active to earn more energy!`, 'warning');
        return false;
    }
    
    try {
        const newEnergy = appData.userEnergy - amount;
        appData.userEnergy = newEnergy;
        
        await usersRef.doc(appData.currentUser.id).update({
            energy: newEnergy
        });
        
        updateUserEnergyDisplay(newEnergy);
        return true;
    } catch (error) {
        console.error("Error consuming energy:", error);
        return false;
    }
}

// ========== KYNECTA BADGE SYSTEM ==========
async function awardBadge(userId, badgeId) {
    try {
        await usersRef.doc(userId).update({
            badges: firebase.firestore.FieldValue.arrayUnion(badgeId)
        });
        
        // Update local state
        if (userId === appData.currentUser?.id) {
            appData.userBadges.push(badgeId);
            loadUserBadges(appData.userBadges);
        }
        
        showNotification(`🎉 You earned the ${badgeId} badge!`, 'success');
        
        // Record badge achievement
        await badgesRef.add({
            userId: userId,
            badgeId: badgeId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error("Error awarding badge:", error);
    }
}

async function checkForBadgeAchievements() {
    if (!appData.currentUser) return;
    
    try {
        // Check post count for contributor badge
        const userPosts = await postsRef
            .where('author.id', '==', appData.currentUser.id)
            .get();
        
        if (userPosts.size >= 10 && !appData.userBadges.includes('contributor')) {
            await awardBadge(appData.currentUser.id, 'contributor');
        }
        
        // Check collaboration count for collaborator badge
        const userCollaborations = await collaborationsRef
            .where('participants', 'array-contains', appData.currentUser.id)
            .get();
        
        if (userCollaborations.size >= 5 && !appData.userBadges.includes('collaborator')) {
            await awardBadge(appData.currentUser.id, 'collaborator');
        }
        
    } catch (error) {
        console.error("Error checking badge achievements:", error);
    }
}

// ========== THEME MANAGEMENT ==========
function setupThemeSelector() {
    const themeToggle = document.getElementById('themeToggle');
    const themeOptions = document.querySelector('.theme-options');
    const themeOptionsElements = document.querySelectorAll('.theme-option');

    if (!themeToggle || !themeOptions) {
        console.log('Theme elements not found');
        return;
    }

    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        themeOptions.classList.toggle('show');
    });

    themeOptionsElements.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = option.getAttribute('data-theme');
            document.body.className = `h-full ${theme}`;
            
            themeOptionsElements.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            themeOptions.classList.remove('show');
            localStorage.setItem('kynectaTheme', theme);
        });
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('kynectaTheme');
    if (savedTheme) {
        document.body.className = `h-full ${savedTheme}`;
        themeOptionsElements.forEach(opt => {
            if (opt.getAttribute('data-theme') === savedTheme) {
                opt.classList.add('active');
            }
        });
    }

    // Close theme selector when clicking outside
    document.addEventListener('click', () => {
        themeOptions.classList.remove('show');
    });
}

// ========== SCROLL TO TOP ==========
function setupScrollToTop() {
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    if (!scrollTopBtn) return;
    
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            scrollTopBtn.classList.remove('hidden');
        } else {
            scrollTopBtn.classList.add('hidden');
        }
    });
    
    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// ========== ERROR HANDLING ==========
function setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        showNotification('An unexpected error occurred in Kynecta', 'error');
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
        showNotification('An unexpected error occurred in Kynecta', 'error');
        e.preventDefault();
    });
}

// ========== FIREBASE FUNCTIONS ==========
async function loadFollowingList() {
    try {
        if (!appData.currentUser) return;
        
        const userDoc = await usersRef.doc(appData.currentUser.id).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            appData.following = userData.following || [];
        }
    } catch (error) {
        console.error("Error loading following list:", error);
    }
}

async function loadFriendsAndGroups() {
    try {
        if (!appData.currentUser) return;

        // Load friends from users collection (excluding current user)
        const usersSnapshot = await usersRef
            .where('id', '!=', appData.currentUser.id)
            .limit(10)
            .get();
        
        appData.friends = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            appData.friends.push({
                id: doc.id,
                name: userData.name,
                avatar: userData.avatar || 'from-gray-500 to-gray-700',
                energy: userData.energy || 0,
                badges: userData.badges || []
            });
        });

        // Load groups from groups collection
        const groupsSnapshot = await db.collection('groups').limit(5).get();
        appData.groups = [];
        groupsSnapshot.forEach(doc => {
            const groupData = doc.data();
            appData.groups.push({
                id: doc.id,
                name: groupData.name,
                avatar: groupData.avatar || 'from-purple-500 to-pink-500'
            });
        });
    } catch (error) {
        console.error("Error loading friends and groups:", error);
    }
}

function loadPosts() {
    if (!appData.currentUser) return;

    postsRef
        .orderBy('timestamp', 'desc')
        .limit(20)
        .onSnapshot((snapshot) => {
            const postsContainer = document.getElementById('postsContainer');
            if (!postsContainer) return;
            
            postsContainer.innerHTML = '';
            
            if (snapshot.empty) {
                postsContainer.innerHTML = `
                    <div class="glass rounded-2xl border border-purple-700 p-8 text-center">
                        <i class="fas fa-newspaper text-4xl text-theme-secondary mb-4"></i>
                        <p class="text-theme-primary text-lg mb-2">No posts yet</p>
                        <p class="text-theme-secondary">Be the first to share something with your Kynecta network!</p>
                    </div>
                `;
                return;
            }
            
            snapshot.forEach((doc) => {
                const post = { id: doc.id, ...doc.data() };
                const postElement = createPostElement(post);
                postsContainer.appendChild(postElement);
            });
        }, (error) => {
            console.error("Error loading posts:", error);
            showNotification('Error loading Kynecta posts', 'error');
        });
}

async function loadCollaborativePosts() {
    if (!appData.currentUser) return;

    collaborationsRef
        .where('isActive', '==', true)
        .orderBy('lastActivity', 'desc')
        .limit(5)
        .onSnapshot((snapshot) => {
            const container = document.getElementById('collaborativePostsContainer');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="glass rounded-2xl border border-purple-700 p-6 text-center">
                        <p class="text-theme-secondary">No active collaborations yet</p>
                    </div>
                `;
                return;
            }
            
            snapshot.forEach((doc) => {
                const collaboration = { id: doc.id, ...doc.data() };
                const element = createCollaborativePostElement(collaboration);
                container.appendChild(element);
            });
        });
}

async function loadTrendingPosts() {
    try {
        if (!appData.currentUser) return;

        const snapshot = await postsRef
            .orderBy('likesCount', 'desc')
            .limit(2)
            .get();
            
        const container = document.getElementById('trendingPostsContainer');
        if (!container) {
            console.log('Trending posts container not found');
            return;
        }
        
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="glass rounded-2xl border border-purple-700 p-6 text-center">
                    <p class="text-theme-secondary">No trending posts yet</p>
                </div>
            `;
            return;
        }
        
        snapshot.forEach((doc) => {
            const post = { id: doc.id, ...doc.data() };
            const postElement = createTrendingPostElement(post);
            container.appendChild(postElement);
        });
    } catch (error) {
        console.error("Error loading trending posts:", error);
    }
}

function loadStatuses() {
    if (!appData.currentUser) return;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    statusesRef
        .where('timestamp', '>', oneDayAgo)
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            updateStatusStories(snapshot);
        }, (error) => {
            console.error("Error loading statuses:", error);
        });
}

// ========== LOAD USER LIKES ==========
async function loadUserLikes() {
    try {
        if (!appData.currentUser) return;

        const likesSnapshot = await likesRef
            .where('userId', '==', appData.currentUser.id)
            .get();
        
        likesSnapshot.forEach(doc => {
            const likeData = doc.data();
            userLikes.add(likeData.postId);
            
            if (likeData.commentId) {
                userCommentLikes.add(likeData.commentId);
            }
        });
    } catch (error) {
        console.error("Error loading user likes:", error);
    }
}

// ========== KYNECTA AI CONTENT ANALYSIS ==========
async function analyzeContentForSuggestions() {
    const postContent = document.getElementById('postInput').value.trim();
    const aiSuggestion = document.getElementById('aiSuggestion');
    const aiSuggestionText = document.getElementById('aiSuggestionText');
    
    if (!aiSuggestion || !aiSuggestionText) return;
    
    if (postContent.length > 20 && postContent.length < 200) {
        // Simple AI analysis - in production, this would call an AI service
        const suggestions = [
            "💡 Try adding a question to increase engagement!",
            "🔍 Consider adding relevant hashtags to reach more people.",
            "📊 This would make a great poll - users love to share opinions!",
            "🖼️ Add an image or video to make your post more visual.",
            "🤝 Perfect topic for collaborative discussion - try the collaborative feature!",
            "🎯 Consider rephrasing to be more specific and actionable.",
            "🌟 Share a personal story to connect with your audience emotionally."
        ];
        
        // Analyze content for suggestion type
        let suggestion;
        if (postContent.includes('?')) {
            suggestion = "🌟 Great question! Consider adding a poll for quantitative feedback.";
        } else if (postContent.split(' ').length < 10) {
            suggestion = "📝 Add more details to help users understand your perspective.";
        } else if (postContent.toLowerCase().includes('what do you think')) {
            suggestion = "🤝 Perfect for collaboration! Enable collaborative mode to gather diverse opinions.";
        } else {
            suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
        }
        
        aiSuggestionText.textContent = suggestion;
        aiSuggestion.classList.remove('hidden');
    } else {
        aiSuggestion.classList.add('hidden');
    }
}

function applyAISuggestion() {
    const suggestion = document.getElementById('aiSuggestionText').textContent;
    const postInput = document.getElementById('postInput');
    
    if (suggestion.includes('question')) {
        postInput.value += ' What are your thoughts?';
    } else if (suggestion.includes('hashtags')) {
        postInput.value += ' #Kynecta #Community';
    } else if (suggestion.includes('poll')) {
        document.getElementById('modalAddPoll').click();
    } else if (suggestion.includes('image') || suggestion.includes('video')) {
        document.getElementById('modalAddPhoto').click();
    } else if (suggestion.includes('collaboration')) {
        document.getElementById('modalAddCollaborative').click();
    }
    
    document.getElementById('aiSuggestion').classList.add('hidden');
}

// ========== POST CREATION ==========
async function createPost() {
    if (!appData.currentUser) {
        showNotification('Please log in to create posts on Kynecta', 'error');
        return;
    }

    // Check energy for post creation
    if (!await consumeEnergy(5, 'create a post')) {
        return;
    }

    const postContent = document.getElementById('postInput').value.trim();
    const mediaData = window.currentMediaData;
    const isCollaborative = document.getElementById('collaborativeSettings') && 
                           !document.getElementById('collaborativeSettings').classList.contains('hidden');
    
    if (!postContent && !mediaData && appData.taggedUsers.length === 0 && appData.taggedGroups.length === 0) {
        alert('Please write something, add media, or tag friends/groups to share on Kynecta');
        return;
    }
    
    try {
        const newPost = {
            author: appData.currentUser,
            content: postContent,
            media: mediaData,
            taggedUsers: appData.taggedUsers,
            taggedGroups: appData.taggedGroups,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            likesCount: 0,
            commentsCount: 0,
            sharesCount: 0,
            viewsCount: 0,
            // Kynecta features
            energy: calculatePostEnergy(postContent),
            aiEnhanced: document.getElementById('aiSuggestion') && 
                       !document.getElementById('aiSuggestion').classList.contains('hidden')
        };
        
        // Add collaborative data if enabled
        if (isCollaborative) {
            const collaborativeTitle = document.getElementById('collaborativeTitle').value;
            const collaborativeType = document.getElementById('collaborativeType').value;
            const allowEdits = document.getElementById('allowEdits').checked;
            
            if (collaborativeTitle) {
                newPost.collaborative = {
                    title: collaborativeTitle,
                    type: collaborativeType,
                    allowEdits: allowEdits,
                    participants: [appData.currentUser.id],
                    isActive: true,
                    lastActivity: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                // Also create collaboration document
                await collaborationsRef.add({
                    postId: (await postsRef.add(newPost)).id,
                    title: collaborativeTitle,
                    type: collaborativeType,
                    participants: [appData.currentUser.id],
                    isActive: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastActivity: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } else {
            await postsRef.add(newPost);
        }
        
        // Reset form
        document.getElementById('postInput').value = '';
        document.getElementById('mediaPreview').classList.add('hidden');
        document.getElementById('aiSuggestion').classList.add('hidden');
        window.currentMediaData = null;
        appData.taggedUsers = [];
        appData.taggedGroups = [];
        document.getElementById('taggedFriends').innerHTML = '';
        
        // Reset collaborative settings
        if (document.getElementById('collaborativeSettings')) {
            document.getElementById('collaborativeSettings').classList.add('hidden');
            document.getElementById('collaborativeTitle').value = '';
        }
        
        showNotification('Post shared successfully on Kynecta! +5 Energy', 'success');
        
        // Award energy for posting
        await awardEnergy(5, 'post_creation');
        
    } catch (error) {
        console.error("Error creating Kynecta post:", error);
        showNotification('Error sharing Kynecta post', 'error');
    }
}

// ========== KYNECTA POST ENERGY CALCULATION ==========
function calculatePostEnergy(content) {
    if (!content) return 0;
    
    let energy = 0;
    
    // Base energy from content length
    energy += Math.min(content.length / 5, 20);
    
    // Bonus for questions (encourages engagement)
    if (content.includes('?')) energy += 10;
    
    // Bonus for mentions and hashtags
    const mentions = (content.match(/@\w+/g) || []).length;
    const hashtags = (content.match(/#\w+/g) || []).length;
    energy += (mentions + hashtags) * 3;
    
    // Bonus for positive sentiment words
    const positiveWords = ['great', 'awesome', 'amazing', 'love', 'happy', 'excited', 'wonderful'];
    positiveWords.forEach(word => {
        if (content.toLowerCase().includes(word)) energy += 2;
    });
    
    return Math.min(Math.round(energy), 50);
}

// ========== POST INTERACTIONS ==========
async function likePost(postId) {
    if (!appData.currentUser) {
        showNotification('Please log in to like posts on Kynecta', 'error');
        return;
    }

    // Check energy for interaction
    if (!await consumeEnergy(1, 'like a post')) {
        return;
    }

    try {
        const likeId = `${postId}_${appData.currentUser.id}`;
        const likeDocRef = likesRef.doc(likeId);
        const likeDoc = await likeDocRef.get();
        
        if (likeDoc.exists) {
            // Unlike
            await likeDocRef.delete();
            await postsRef.doc(postId).update({
                likesCount: firebase.firestore.FieldValue.increment(-1)
            });
            userLikes.delete(postId);
        } else {
            // Like
            await likeDocRef.set({
                postId: postId,
                userId: appData.currentUser.id,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            await postsRef.doc(postId).update({
                likesCount: firebase.firestore.FieldValue.increment(1)
            });
            userLikes.add(postId);
            
            // Award energy for positive interaction
            await awardEnergy(1, 'liking_post');
        }
        
        // Update UI immediately
        updatePostLikeUI(postId);
    } catch (error) {
        console.error("Error liking Kynecta post:", error);
        showNotification('Error liking Kynecta post', 'error');
    }
}

function updatePostLikeUI(postId) {
    const likeButtons = document.querySelectorAll(`button[onclick="likePost('${postId}')"]`);
    likeButtons.forEach(button => {
        const icon = button.querySelector('i');
        const countSpan = button.querySelector('span');
        
        if (userLikes.has(postId)) {
            icon.className = 'fas fa-heart text-red-400';
        } else {
            icon.className = 'fas fa-heart';
        }
    });
}

async function addComment(postId, commentText) {
    if (!appData.currentUser) {
        showNotification('Please log in to comment on Kynecta', 'error');
        return null;
    }

    // Check energy for commenting
    if (!await consumeEnergy(2, 'add a comment')) {
        return null;
    }

    if (!commentText.trim()) {
        showNotification('Please enter a comment for Kynecta', 'error');
        return null;
    }
    
    try {
        const newComment = {
            postId: postId,
            author: appData.currentUser,
            content: commentText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            likesCount: 0,
            replies: []
        };
        
        const commentRef = await commentsRef.add(newComment);
        await postsRef.doc(postId).update({
            commentsCount: firebase.firestore.FieldValue.increment(1)
        });
        
        // Award energy for meaningful contribution
        await awardEnergy(3, 'adding_comment');
        
        return { id: commentRef.id, ...newComment };
    } catch (error) {
        console.error("Error adding Kynecta comment:", error);
        showNotification('Error adding Kynecta comment', 'error');
        return null;
    }
}

async function addReply(commentId, replyText, postId) {
    if (!appData.currentUser) {
        showNotification('Please log in to reply on Kynecta', 'error');
        return null;
    }

    // Check energy for replying
    if (!await consumeEnergy(1, 'add a reply')) {
        return null;
    }

    if (!replyText.trim()) {
        showNotification('Please enter a reply for Kynecta', 'error');
        return null;
    }
    
    try {
        const newReply = {
            id: 'reply_' + Date.now(),
            author: appData.currentUser,
            content: replyText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            likes: []
        };
        
        // Get the comment document
        const commentDoc = await commentsRef.doc(commentId).get();
        if (commentDoc.exists) {
            const commentData = commentDoc.data();
            const updatedReplies = [...(commentData.replies || []), newReply];
            
            await commentsRef.doc(commentId).update({
                replies: updatedReplies
            });
            
            // Award energy for engagement
            await awardEnergy(2, 'adding_reply');
            
            return newReply;
        }
    } catch (error) {
        console.error("Error adding Kynecta reply:", error);
        showNotification('Error adding Kynecta reply', 'error');
        return null;
    }
}

async function likeComment(commentId, postId) {
    if (!appData.currentUser) {
        showNotification('Please log in to like comments on Kynecta', 'error');
        return;
    }

    // Check energy for interaction
    if (!await consumeEnergy(1, 'like a comment')) {
        return;
    }

    try {
        const likeId = `comment_${commentId}_${appData.currentUser.id}`;
        const likeDocRef = likesRef.doc(likeId);
        const likeDoc = await likeDocRef.get();
        
        if (likeDoc.exists) {
            // Unlike comment
            await likeDocRef.delete();
            await commentsRef.doc(commentId).update({
                likesCount: firebase.firestore.FieldValue.increment(-1)
            });
            userCommentLikes.delete(commentId);
        } else {
            // Like comment
            await likeDocRef.set({
                commentId: commentId,
                userId: appData.currentUser.id,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            await commentsRef.doc(commentId).update({
                likesCount: firebase.firestore.FieldValue.increment(1)
            });
            userCommentLikes.add(commentId);
            
            // Award energy for engagement
            await awardEnergy(1, 'liking_comment');
        }
        
        // Reload comments to update UI
        loadCommentsForPost(postId);
    } catch (error) {
        console.error("Error liking Kynecta comment:", error);
    }
}

// ========== KYNECTA COLLABORATIVE FEATURES ==========
async function joinCollaboration(collaborationId) {
    if (!appData.currentUser) {
        showNotification('Please log in to join collaborations on Kynecta', 'error');
        return;
    }

    try {
        await collaborationsRef.doc(collaborationId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(appData.currentUser.id),
            lastActivity: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('You joined the collaboration!', 'success');
        await awardEnergy(5, 'joining_collaboration');
        
    } catch (error) {
        console.error("Error joining collaboration:", error);
        showNotification('Error joining Kynecta collaboration', 'error');
    }
}

function updateCollaborativePostUI(collaborationId, collaborationData) {
    const collaborationElement = document.querySelector(`[data-collaboration-id="${collaborationId}"]`);
    if (collaborationElement) {
        const participantsCount = collaborationElement.querySelector('.participants-count');
        if (participantsCount) {
            participantsCount.textContent = collaborationData.participants.length;
        }
    }
}

function createCollaborativePostElement(collaboration) {
    const element = document.createElement('div');
    element.className = 'glass rounded-2xl border border-purple-700 p-4 mb-4';
    element.setAttribute('data-collaboration-id', collaboration.id);
    
    element.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center space-x-2">
                <i class="fas fa-users text-theme-accent"></i>
                <span class="font-semibold text-theme-primary">${collaboration.title}</span>
            </div>
            <span class="collaboration-indicator">
                <i class="fas fa-user-friends mr-1"></i>
                <span class="participants-count">${collaboration.participants.length}</span>
            </span>
        </div>
        <p class="text-theme-secondary text-sm mb-3">${collaboration.type} • Active now</p>
        <button onclick="joinCollaboration('${collaboration.id}')" 
                class="w-full py-2 rounded-xl font-semibold transition"
                style="background: var(--accent-color); color: white;">
            Join Collaboration
        </button>
    `;
    
    return element;
}

// ========== LOAD COMMENTS FOR POST ==========
async function loadCommentsForPost(postId) {
    try {
        const commentsSnapshot = await commentsRef
            .where('postId', '==', postId)
            .orderBy('timestamp', 'asc')
            .get();
        
        const comments = [];
        commentsSnapshot.forEach(doc => {
            comments.push({ id: doc.id, ...doc.data() });
        });
        
        return comments;
    } catch (error) {
        console.error("Error loading Kynecta comments:", error);
        return [];
    }
}

// ========== STATUS/STORIES ==========
async function createStatus() {
    if (!appData.currentUser) {
        showNotification('Please log in to update status on Kynecta', 'error');
        return;
    }

    // Check energy for status update
    if (!await consumeEnergy(2, 'update status')) {
        return;
    }

    const statusText = document.getElementById('statusInput').value.trim();
    const statusEmoji = document.getElementById('selectedEmoji').textContent;
    
    if (!statusText && !statusEmoji) {
        alert('Please add some text or select an emoji for your Kynecta status');
        return;
    }
    
    try {
        const newStatus = {
            author: appData.currentUser,
            text: statusText,
            emoji: statusEmoji,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            viewersCount: 0,
            viewers: []
        };
        
        await statusesRef.add(newStatus);
        document.getElementById('statusInput').value = '';
        document.getElementById('selectedEmoji').textContent = '';
        closeStatusCreation();
        showNotification('Kynecta status updated!', 'success');
        
        // Award energy for activity
        await awardEnergy(3, 'updating_status');
    } catch (error) {
        console.error("Error creating Kynecta status:", error);
        showNotification('Error updating Kynecta status', 'error');
    }
}

// ========== FOLLOW SYSTEM ==========
function isFollowing(userId) {
    return appData.following.includes(userId);
}

async function toggleFollow(userId) {
    if (!appData.currentUser) {
        showNotification('Please log in to follow users on Kynecta', 'error');
        return;
    }

    // Check energy for follow action
    if (!await consumeEnergy(3, 'follow a user')) {
        return;
    }

    try {
        const userRef = usersRef.doc(appData.currentUser.id);
        
        if (isFollowing(userId)) {
            // Unfollow
            appData.following = appData.following.filter(id => id !== userId);
            await userRef.update({
                following: firebase.firestore.FieldValue.arrayRemove(userId)
            });
        } else {
            // Follow
            appData.following.push(userId);
            await userRef.update({
                following: firebase.firestore.FieldValue.arrayUnion(userId)
            });
            
            // Award energy for building connections
            await awardEnergy(5, 'following_user');
        }
        
        // Update UI
        updateFollowButtons();
    } catch (error) {
        console.error("Error toggling Kynecta follow:", error);
        showNotification('Error following Kynecta user', 'error');
    }
}

function updateFollowButtons() {
    document.querySelectorAll('.follow-btn').forEach(btn => {
        const userId = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
        if (isFollowing(userId)) {
            btn.classList.add('following');
            btn.textContent = 'Following';
        } else {
            btn.classList.remove('following');
            btn.textContent = 'Follow';
        }
    });
}

// ========== MEDIA UPLOAD SECURITY ==========
function handleMediaFile(file) {
    // Validate file type
    const isImage = file.type.match('image.*');
    const isVideo = file.type.match('video.*');
    const isAudio = file.type.match('audio.*');
    
    if (!isImage && !isVideo && !isAudio) {
        alert('Please select an image, video, or audio file for Kynecta');
        return;
    }
    
    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
        alert('File size must be less than 5MB for Kynecta');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        window.currentMediaData = {
            type: isImage ? 'image' : isVideo ? 'video' : 'audio',
            data: e.target.result,
            file: file
        };
        
        // Show preview
        if (isImage) {
            document.getElementById('previewImage').src = e.target.result;
            document.getElementById('previewImage').classList.remove('hidden');
            document.getElementById('previewVideo').classList.add('hidden');
            document.getElementById('previewAudio').classList.add('hidden');
        } else if (isVideo) {
            document.getElementById('previewVideo').src = e.target.result;
            document.getElementById('previewVideo').classList.remove('hidden');
            document.getElementById('previewImage').classList.add('hidden');
            document.getElementById('previewAudio').classList.add('hidden');
        } else if (isAudio) {
            document.getElementById('previewAudio').src = e.target.result;
            document.getElementById('previewAudio').classList.remove('hidden');
            document.getElementById('previewImage').classList.add('hidden');
            document.getElementById('previewVideo').classList.add('hidden');
        }
        
        document.getElementById('mediaPreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// ========== PERFORMANCE OPTIMIZATIONS ==========
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

// Debounce search functions
const debouncedFilterFriends = debounce(filterFriends, 300);

// ========== CLEANUP ON PAGE UNLOAD ==========
window.addEventListener('beforeunload', () => {
    // Clean up any ongoing processes
    if (window.currentMediaData) {
        URL.revokeObjectURL(window.currentMediaData.data);
    }
});

// ========== UTILITY FUNCTIONS ==========
function formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
}

function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
        document.body.removeChild(notification);
    });

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="flex items-center space-x-2">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ========== EVENT LISTENERS SETUP ==========
function setupEventListeners() {
    // Post creation
    const postButton = document.getElementById('postButton');
    if (postButton) {
        postButton.addEventListener('click', createPost);
    }
    
    // Media upload
    const mediaInput = document.getElementById('mediaInput');
    if (mediaInput) {
        mediaInput.addEventListener('change', handleMediaUpload);
    }
    
    // Friend search with debounce
    const friendSearch = document.getElementById('friendSearch');
    if (friendSearch) {
        friendSearch.addEventListener('input', debouncedFilterFriends);
    }
    
    // Status creation
    const statusButton = document.getElementById('statusButton');
    if (statusButton) {
        statusButton.addEventListener('click', createStatus);
    }
    
    // Kynecta AI Suggestion
    const applySuggestionBtn = document.getElementById('applySuggestion');
    if (applySuggestionBtn) {
        applySuggestionBtn.addEventListener('click', applyAISuggestion);
    }
    
    // Kynecta Collaborative Post
    const toggleCollaborativeBtn = document.getElementById('toggleCollaborative');
    if (toggleCollaborativeBtn) {
        toggleCollaborativeBtn.addEventListener('click', function() {
            const settings = document.getElementById('collaborativeSettings');
            settings.classList.toggle('hidden');
            this.textContent = settings.classList.contains('hidden') ? 'Enable' : 'Disable';
        });
    }
    
    // Close modals when clicking outside or pressing Escape
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeMediaUpload();
            closeTagFriendsModal();
            closeStatusCreation();
            closeInteractionsModal();
            closeViewerModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMediaUpload();
            closeTagFriendsModal();
            closeStatusCreation();
            closeInteractionsModal();
            closeViewerModal();
        }
    });
}

// Initialize drag and drop when DOM is loaded
document.addEventListener('DOMContentLoaded', setupDragAndDrop);

// Export for testing if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatTime,
        showNotification,
        debounce,
        calculatePostEnergy,
        awardEnergy,
        consumeEnergy
    };
}

// Register for Kynecta settings updates
if (window.settingsApp) {
    window.settingsApp.addSettingsListener((settings) => {
        // Apply theme
        document.body.className = document.body.className.replace(/theme-\w+/g, '') + ' ' + settings.theme;
        
        // Apply Kynecta-specific settings
        console.log("Kynecta settings updated:", settings);
    });
}

// Kynecta initialization complete
console.log('Kynecta social platform initialized successfully!');