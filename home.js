// home.js - Production Ready Firebase Integration
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

const appData = {
    currentUser: null,
    following: [],
    taggedUsers: [],
    taggedGroups: [],
    friends: [],
    groups: [],
    currentMediaType: null
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

// Track which posts user has liked
const userLikes = new Set();
const userCommentLikes = new Set();

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing ConnectSphere...');
    initializeApp();
    setupEventListeners();
    setupThemeSelector();
    setupScrollToTop();
    populateEmojiGrid();
    setupErrorHandling();
});

// ========== AUTHENTICATION SETUP ==========
async function initializeApp() {
    try {
        console.log('Initializing Firebase...');
        
        // Check authentication state
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await setupCurrentUser(user);
                await loadUserLikes();
                loadPosts();
                loadTrendingPosts();
                loadStatuses();
            } else {
                // Redirect to login or show login modal
                redirectToLogin();
            }
        });
        
    } catch (error) {
        console.error("Error initializing app:", error);
        showNotification('Error initializing application', 'error');
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
                email: user.email
            };
        } else {
            // Create new user document
            appData.currentUser = {
                id: user.uid,
                name: user.displayName || 'User',
                avatar: 'from-blue-400 to-purple-500',
                email: user.email
            };
            
            await usersRef.doc(user.uid).set({
                name: appData.currentUser.name,
                avatar: appData.currentUser.avatar,
                email: user.email,
                following: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        await loadFollowingList();
        await loadFriendsAndGroups();
        updateUIForAuthState(true);
        
    } catch (error) {
        console.error("Error setting up current user:", error);
        showNotification('Error loading user data', 'error');
    }
}

function redirectToLogin() {
    // You can implement redirect to login page or show login modal
    console.log('User not authenticated, redirecting to login...');
    // window.location.href = '/login.html'; // Uncomment if you have a separate login page
    showLoginModal();
}

function showLoginModal() {
    // Implement login modal or redirect
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
            localStorage.setItem('connectSphereTheme', theme);
        });
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('connectSphereTheme');
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
        showNotification('An unexpected error occurred', 'error');
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
        showNotification('An unexpected error occurred', 'error');
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
                avatar: userData.avatar || 'from-gray-500 to-gray-700'
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
                        <p class="text-theme-secondary">Be the first to share something with your network!</p>
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
            showNotification('Error loading posts', 'error');
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

// ========== POST CREATION ==========
async function createPost() {
    if (!appData.currentUser) {
        showNotification('Please log in to create posts', 'error');
        return;
    }

    const postContent = document.getElementById('postInput').value.trim();
    const mediaData = window.currentMediaData;
    
    if (!postContent && !mediaData && appData.taggedUsers.length === 0 && appData.taggedGroups.length === 0) {
        alert('Please write something, add media, or tag friends/groups to share');
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
            viewsCount: 0
        };
        
        await postsRef.add(newPost);
        
        // Reset form
        document.getElementById('postInput').value = '';
        document.getElementById('mediaPreview').classList.add('hidden');
        window.currentMediaData = null;
        appData.taggedUsers = [];
        appData.taggedGroups = [];
        document.getElementById('taggedFriends').innerHTML = '';
        
        showNotification('Post shared successfully!', 'success');
    } catch (error) {
        console.error("Error creating post:", error);
        showNotification('Error sharing post', 'error');
    }
}

// ========== POST INTERACTIONS ==========
async function likePost(postId) {
    if (!appData.currentUser) {
        showNotification('Please log in to like posts', 'error');
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
        }
        
        // Update UI immediately
        updatePostLikeUI(postId);
    } catch (error) {
        console.error("Error liking post:", error);
        showNotification('Error liking post', 'error');
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
        showNotification('Please log in to comment', 'error');
        return null;
    }

    if (!commentText.trim()) {
        showNotification('Please enter a comment', 'error');
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
        
        return { id: commentRef.id, ...newComment };
    } catch (error) {
        console.error("Error adding comment:", error);
        showNotification('Error adding comment', 'error');
        return null;
    }
}

async function addReply(commentId, replyText, postId) {
    if (!appData.currentUser) {
        showNotification('Please log in to reply', 'error');
        return null;
    }

    if (!replyText.trim()) {
        showNotification('Please enter a reply', 'error');
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
            
            return newReply;
        }
    } catch (error) {
        console.error("Error adding reply:", error);
        showNotification('Error adding reply', 'error');
        return null;
    }
}

async function likeComment(commentId, postId) {
    if (!appData.currentUser) {
        showNotification('Please log in to like comments', 'error');
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
        }
        
        // Reload comments to update UI
        loadCommentsForPost(postId);
    } catch (error) {
        console.error("Error liking comment:", error);
    }
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
        console.error("Error loading comments:", error);
        return [];
    }
}

// ========== STATUS/STORIES ==========
async function createStatus() {
    if (!appData.currentUser) {
        showNotification('Please log in to update status', 'error');
        return;
    }

    const statusText = document.getElementById('statusInput').value.trim();
    const statusEmoji = document.getElementById('selectedEmoji').textContent;
    
    if (!statusText && !statusEmoji) {
        alert('Please add some text or select an emoji for your status');
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
        showNotification('Status updated!', 'success');
    } catch (error) {
        console.error("Error creating status:", error);
        showNotification('Error updating status', 'error');
    }
}

// ========== FOLLOW SYSTEM ==========
function isFollowing(userId) {
    return appData.following.includes(userId);
}

async function toggleFollow(userId) {
    if (!appData.currentUser) {
        showNotification('Please log in to follow users', 'error');
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
        }
        
        // Update UI
        updateFollowButtons();
    } catch (error) {
        console.error("Error toggling follow:", error);
        showNotification('Error following user', 'error');
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
        alert('Please select an image, video, or audio file');
        return;
    }
    
    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
        alert('File size must be less than 5MB');
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
        debounce
    };
}