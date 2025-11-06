// profile.js - User Profile Management
console.log('👤 Profile script loaded');

// Firebase configuration (to be configured before deployment)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let currentUser = null;
let userData = null;

// DOM Elements
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');
const profileAvatar = document.getElementById('profileAvatar');
const profileStatus = document.getElementById('profileStatus');
const postCount = document.getElementById('postCount');
const followerCount = document.getElementById('followerCount');
const followingCount = document.getElementById('followingCount');
const streakCount = document.getElementById('streakCount');
const unicoinsCount = document.getElementById('unicoinsCount');
const userLevel = document.getElementById('userLevel');
const editProfileBtn = document.getElementById('editProfileBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userPostsContainer = document.getElementById('userPostsContainer');

// Cloudinary configuration (to be configured before deployment)
const CLOUDINARY_UPLOAD_URL = '/upload';

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏠 Profile page loaded');
    
    // Check authentication
    auth.onAuthStateChanged(handleAuthStateChange);
    
    // Setup event listeners
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', openEditProfileModal);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});

// Handle authentication state changes
function handleAuthStateChange(user) {
    if (user) {
        currentUser = user;
        console.log('✅ User authenticated:', user.uid);
        loadUserProfile(user.uid);
        loadUserPosts(user.uid);
    } else {
        console.log('❌ No user signed in, redirecting to login...');
        window.location.href = 'login.html';
    }
}

// Load user profile data from Firestore
async function loadUserProfile(uid) {
    try {
        console.log('📥 Loading user profile for:', uid);
        
        const userDoc = await db.collection('users').doc(uid).get();
        
        if (userDoc.exists) {
            userData = userDoc.data();
            console.log('✅ User data loaded:', userData);
            updateProfileUI(userData);
        } else {
            console.error('❌ User document not found');
            showNotification('User profile not found', 'error');
        }
        
    } catch (error) {
        console.error('❌ Error loading user profile:', error);
        showNotification('Error loading profile', 'error');
    }
}

// Update profile UI with user data
function updateProfileUI(data) {
    // Update basic profile information
    if (profileName) profileName.textContent = data.displayName || 'User';
    if (profileEmail) profileEmail.textContent = data.email || 'No email provided';
    if (profileStatus) profileStatus.textContent = data.status || 'Online';
    
    // Update profile avatar with optimized Cloudinary URL
    if (profileAvatar) {
        profileAvatar.src = optimizeImageUrl(data.avatar || getDefaultAvatar(data.displayName));
        profileAvatar.alt = `${data.displayName}'s avatar`;
    }
    
    // Update statistics
    if (postCount) postCount.textContent = data.posts || 0;
    if (followerCount) followerCount.textContent = data.followers || 0;
    if (followingCount) followingCount.textContent = data.following || 0;
    if (streakCount) streakCount.textContent = data.streak || 1;
    if (unicoinsCount) unicoinsCount.textContent = data.coins || 0;
    if (userLevel) userLevel.textContent = data.level || 1;
    
    console.log('✅ Profile UI updated with user data');
}

// Load user's posts from Firestore
async function loadUserPosts(uid) {
    try {
        console.log('📥 Loading user posts for:', uid);
        
        const postsQuery = db.collection('posts')
            .where('userId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(10);
        
        postsQuery.onSnapshot((snapshot) => {
            if (userPostsContainer) {
                if (snapshot.empty) {
                    userPostsContainer.innerHTML = `
                        <div class="text-center py-8 glass rounded-2xl">
                            <i class="fas fa-newspaper text-4xl text-theme-secondary mb-4"></i>
                            <h3 class="text-lg font-bold text-theme-accent mb-2">No posts yet</h3>
                            <p class="text-theme-secondary">Share your first post to get started!</p>
                        </div>
                    `;
                    return;
                }
                
                let postsHTML = '';
                snapshot.forEach(doc => {
                    const post = doc.data();
                    postsHTML += createPostElement(post, doc.id);
                });
                
                userPostsContainer.innerHTML = postsHTML;
                console.log(`✅ Displayed ${snapshot.size} user posts`);
            }
        }, (error) => {
            console.error('❌ Error loading user posts:', error);
        });
        
    } catch (error) {
        console.error('❌ Error setting up posts listener:', error);
    }
}

// Create post element for display
function createPostElement(post, postId) {
    const postDate = post.createdAt ? post.createdAt.toDate().toLocaleDateString() : 'Recently';
    
    return `
        <div class="glass border border-purple-700 rounded-2xl p-4 mb-4" data-post-id="${postId}">
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center space-x-3">
                    <img src="${optimizeImageUrl(post.userAvatar || getDefaultAvatar(post.userName))}" 
                         alt="${post.userName}" 
                         class="w-10 h-10 rounded-2xl object-cover">
                    <div>
                        <p class="font-semibold text-theme-primary">${post.userName}</p>
                        <p class="text-xs text-theme-secondary">${postDate}</p>
                    </div>
                </div>
                <button class="text-theme-secondary hover:text-theme-accent post-options" data-post-id="${postId}">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
            </div>
            
            <p class="text-theme-primary mb-3">${post.content || ''}</p>
            
            ${post.imageUrl ? `
                <img src="${optimizeImageUrl(post.imageUrl)}" 
                     alt="Post image" 
                     class="w-full rounded-2xl mb-3 cursor-pointer"
                     onclick="openImageModal('${optimizeImageUrl(post.imageUrl)}')">
            ` : ''}
            
            <div class="flex items-center justify-between text-theme-secondary pt-3 border-t border-purple-800">
                <div class="flex space-x-4">
                    <button class="flex items-center space-x-1 interaction-btn like-btn ${post.userLiked ? 'active' : ''}" 
                            data-post-id="${postId}">
                        <i class="${post.userLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span>${post.likes || 0}</span>
                    </button>
                    <button class="flex items-center space-x-1 interaction-btn comment-btn" data-post-id="${postId}">
                        <i class="far fa-comment"></i>
                        <span>${post.comments || 0}</span>
                    </button>
                </div>
                <button class="interaction-btn save-btn ${post.userSaved ? 'active' : ''}" data-post-id="${postId}">
                    <i class="${post.userSaved ? 'fas' : 'far'} fa-bookmark"></i>
                </button>
            </div>
        </div>
    `;
}

// Open edit profile modal
function openEditProfileModal() {
    // Implementation for edit profile modal
    showNotification('Edit profile feature coming soon!', 'info');
}

// Handle user logout
async function handleLogout() {
    try {
        // Update user status to offline
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).update({
                status: 'Offline',
                statusType: 'offline',
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Sign out from Firebase
        await auth.signOut();
        console.log('✅ User signed out successfully');
        
        // Redirect to login page
        window.location.href = 'login.html';
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        showNotification('Logout failed', 'error');
    }
}

// Optimize Cloudinary image URL
function optimizeImageUrl(url) {
    if (!url) return getDefaultAvatar('User');
    
    // If it's already a Cloudinary URL, add optimization parameters
    if (url.includes('cloudinary.com') && !url.includes('f_auto,q_auto')) {
        return url.replace('/upload/', '/upload/f_auto,q_auto/');
    }
    
    return url;
}

// Get default avatar
function getDefaultAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=150`;
}

// Show notification
function showNotification(message, type = 'info') {
    // Implementation depends on your notification system
    console.log(`💬 ${type.toUpperCase()}: ${message}`);
    alert(`${type.toUpperCase()}: ${message}`); // Temporary simple notification
}

// Global functions for post interactions
window.openImageModal = function(imageUrl) {
    // Implementation for image modal
    console.log('Opening image modal for:', imageUrl);
};

// Add post interaction event listeners after DOM updates
setTimeout(() => {
    document.addEventListener('click', function(e) {
        if (e.target.closest('.like-btn')) {
            handlePostLike(e.target.closest('.like-btn'));
        }
        if (e.target.closest('.save-btn')) {
            handlePostSave(e.target.closest('.save-btn'));
        }
    });
}, 1000);

// Handle post like
function handlePostLike(button) {
    const postId = button.getAttribute('data-post-id');
    console.log('Liking post:', postId);
    showNotification('Like functionality coming soon!', 'info');
}

// Handle post save
function handlePostSave(button) {
    const postId = button.getAttribute('data-post-id');
    console.log('Saving post:', postId);
    showNotification('Save functionality coming soon!', 'info');
}