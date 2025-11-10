// profile.js - User Profile Management
console.log('👤 Profile script loaded');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
  authDomain: "uniconnect-ee95c.firebaseapp.com",
  projectId: "uniconnect-ee95c",
  storageBucket: "uniconnect-ee95c.firebasestorage.app",
  messagingSenderId: "1003264444309",
  appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
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
const coinsCount = document.getElementById('coinsCount');
const userLevel = document.getElementById('userLevel');
const editProfileBtn = document.getElementById('editProfileBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userPostsContainer = document.getElementById('userPostsContainer');

// Cloudinary configuration
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
    
    // Load friend requests if user is authenticated
    auth.onAuthStateChanged((user) => {
        if (user) {
            loadFriendRequests();
            setupFriendRequestListeners();
        }
    });
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
    if (coinsCount) coinsCount.textContent = data.coins || 0;
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

// FRIEND REQUEST SYSTEM - COMPLETE IMPLEMENTATION

// Send friend request
async function sendFriendRequest(receiverId) {
    try {
        if (!currentUser) {
            showNotification('Please log in to send friend requests', 'error');
            return;
        }

        if (currentUser.uid === receiverId) {
            showNotification('You cannot send a friend request to yourself', 'error');
            return;
        }

        // Check if receiver exists
        const receiverDoc = await db.collection('users').doc(receiverId).get();
        if (!receiverDoc.exists) {
            showNotification('User not found', 'error');
            return;
        }

        // Check if request already exists
        const existingRequest = await db.collection('friendRequests')
            .where('senderId', '==', currentUser.uid)
            .where('receiverId', '==', receiverId)
            .where('status', 'in', ['pending', 'accepted'])
            .get();

        if (!existingRequest.empty) {
            showNotification('Friend request already sent or accepted', 'info');
            return;
        }

        // Check if they are already friends
        const isAlreadyFriend = await checkFriendshipStatus(receiverId);
        if (isAlreadyFriend === 'friends') {
            showNotification('You are already friends with this user', 'info');
            return;
        }

        // Create friend request with proper structure
        const requestData = {
            senderId: currentUser.uid,
            receiverId: receiverId,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            senderName: userData.displayName || currentUser.email,
            senderAvatar: userData.avatar || getDefaultAvatar(userData.displayName),
            receiverName: receiverDoc.data().displayName || receiverDoc.data().email,
            receiverAvatar: receiverDoc.data().avatar || getDefaultAvatar(receiverDoc.data().displayName)
        };

        await db.collection('friendRequests').add(requestData);
        
        showNotification('Friend request sent successfully!', 'success');
        console.log('✅ Friend request sent:', requestData);

    } catch (error) {
        console.error('❌ Error sending friend request:', error);
        
        if (error.code === 'permission-denied') {
            showNotification('Permission denied. Please check if both users exist.', 'error');
        } else if (error.code === 'not-found') {
            showNotification('User not found', 'error');
        } else {
            showNotification('Error sending friend request: ' + error.message, 'error');
        }
    }
}

// Accept friend request
async function acceptFriendRequest(requestId) {
    try {
        const requestRef = db.collection('friendRequests').doc(requestId);
        const requestDoc = await requestRef.get();
        
        if (!requestDoc.exists) {
            showNotification('Friend request not found', 'error');
            return;
        }

        const requestData = requestDoc.data();
        
        if (requestData.status !== 'pending') {
            showNotification('This friend request has already been processed', 'info');
            return;
        }

        // Update request status
        await requestRef.update({
            status: 'accepted',
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Create friendship document
        const friendshipData = {
            userIds: [requestData.senderId, requestData.receiverId],
            users: [
                {
                    uid: requestData.senderId,
                    displayName: requestData.senderName,
                    avatar: requestData.senderAvatar,
                    email: requestData.senderEmail
                },
                {
                    uid: requestData.receiverId,
                    displayName: userData.displayName,
                    avatar: userData.avatar,
                    email: currentUser.email
                }
            ],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            friendshipSince: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('friends').add(friendshipData);

        // Update both users' friend counts
        const batch = db.batch();
        
        const senderRef = db.collection('users').doc(requestData.senderId);
        batch.update(senderRef, {
            friends: firebase.firestore.FieldValue.increment(1),
            following: firebase.firestore.FieldValue.increment(1)
        });

        const receiverRef = db.collection('users').doc(requestData.receiverId);
        batch.update(receiverRef, {
            friends: firebase.firestore.FieldValue.increment(1),
            followers: firebase.firestore.FieldValue.increment(1)
        });

        await batch.commit();

        showNotification(`You are now friends with ${requestData.senderName}!`, 'success');
        console.log('✅ Friend request accepted');

    } catch (error) {
        console.error('❌ Error accepting friend request:', error);
        showNotification('Error accepting friend request: ' + error.message, 'error');
    }
}

// Decline friend request
async function declineFriendRequest(requestId) {
    try {
        await db.collection('friendRequests').doc(requestId).update({
            status: 'declined',
            declinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Friend request declined', 'info');
        console.log('✅ Friend request declined');

    } catch (error) {
        console.error('❌ Error declining friend request:', error);
        showNotification('Error declining friend request: ' + error.message, 'error');
    }
}

// Cancel friend request
async function cancelFriendRequest(requestId) {
    try {
        await db.collection('friendRequests').doc(requestId).update({
            status: 'cancelled',
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Friend request cancelled', 'info');
        console.log('✅ Friend request cancelled');

    } catch (error) {
        console.error('❌ Error cancelling friend request:', error);
        showNotification('Error cancelling friend request: ' + error.message, 'error');
    }
}

// Check friendship status
async function checkFriendshipStatus(otherUserId) {
    try {
        const friendshipQuery = await db.collection('friends')
            .where('userIds', 'array-contains', currentUser.uid)
            .get();

        const isFriend = friendshipQuery.docs.some(doc => {
            const data = doc.data();
            return data.userIds.includes(otherUserId);
        });

        return isFriend ? 'friends' : 'not_friends';

    } catch (error) {
        console.error('❌ Error checking friendship status:', error);
        return 'error';
    }
}

// Load pending friend requests
async function loadFriendRequests() {
    try {
        const requestsQuery = db.collection('friendRequests')
            .where('receiverId', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc');

        requestsQuery.onSnapshot((snapshot) => {
            const requestsContainer = document.getElementById('friendRequestsContainer');
            if (!requestsContainer) return;

            if (snapshot.empty) {
                requestsContainer.innerHTML = `
                    <div class="text-center py-4">
                        <p class="text-theme-secondary">No pending friend requests</p>
                    </div>
                `;
                return;
            }

            let requestsHTML = '';
            snapshot.forEach(doc => {
                const request = doc.data();
                requestsHTML += `
                    <div class="glass border border-purple-700 rounded-2xl p-4 mb-3" data-request-id="${doc.id}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <img src="${optimizeImageUrl(request.senderAvatar)}" 
                                     alt="${request.senderName}" 
                                     class="w-12 h-12 rounded-2xl object-cover">
                                <div>
                                    <p class="font-semibold text-theme-primary">${request.senderName}</p>
                                    <p class="text-sm text-theme-secondary">Want to be friends</p>
                                    <p class="text-xs text-theme-tertiary">${request.createdAt?.toDate().toLocaleDateString() || 'Recently'}</p>
                                </div>
                            </div>
                            <div class="flex space-x-2">
                                <button class="btn-primary px-3 py-1 text-sm accept-request" 
                                        data-request-id="${doc.id}">
                                    Accept
                                </button>
                                <button class="btn-secondary px-3 py-1 text-sm decline-request" 
                                        data-request-id="${doc.id}">
                                    Decline
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });

            requestsContainer.innerHTML = requestsHTML;
            attachFriendRequestEventListeners();
        });

    } catch (error) {
        console.error('❌ Error loading friend requests:', error);
    }
}

// Load sent friend requests
async function loadSentFriendRequests() {
    try {
        const sentRequestsQuery = db.collection('friendRequests')
            .where('senderId', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc');

        sentRequestsQuery.onSnapshot((snapshot) => {
            const sentRequestsContainer = document.getElementById('sentRequestsContainer');
            if (!sentRequestsContainer) return;

            if (snapshot.empty) {
                sentRequestsContainer.innerHTML = `
                    <div class="text-center py-4">
                        <p class="text-theme-secondary">No sent friend requests</p>
                    </div>
                `;
                return;
            }

            let sentRequestsHTML = '';
            snapshot.forEach(doc => {
                const request = doc.data();
                sentRequestsHTML += `
                    <div class="glass border border-purple-700 rounded-2xl p-4 mb-3" data-request-id="${doc.id}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <img src="${optimizeImageUrl(request.receiverAvatar)}" 
                                     alt="${request.receiverName}" 
                                     class="w-12 h-12 rounded-2xl object-cover">
                                <div>
                                    <p class="font-semibold text-theme-primary">${request.receiverName}</p>
                                    <p class="text-sm text-theme-secondary">Friend request sent</p>
                                    <p class="text-xs text-theme-tertiary">${request.createdAt?.toDate().toLocaleDateString() || 'Recently'}</p>
                                </div>
                            </div>
                            <button class="btn-secondary px-3 py-1 text-sm cancel-request" 
                                    data-request-id="${doc.id}">
                                Cancel
                            </button>
                        </div>
                    </div>
                `;
            });

            sentRequestsContainer.innerHTML = sentRequestsHTML;
            attachSentRequestEventListeners();
        });

    } catch (error) {
        console.error('❌ Error loading sent friend requests:', error);
    }
}

// Setup friend request event listeners
function setupFriendRequestListeners() {
    loadSentFriendRequests();
}

// Attach event listeners to friend request buttons
function attachFriendRequestEventListeners() {
    document.querySelectorAll('.accept-request').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const requestId = e.target.getAttribute('data-request-id');
            acceptFriendRequest(requestId);
        });
    });

    document.querySelectorAll('.decline-request').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const requestId = e.target.getAttribute('data-request-id');
            declineFriendRequest(requestId);
        });
    });
}

// Attach event listeners to sent request buttons
function attachSentRequestEventListeners() {
    document.querySelectorAll('.cancel-request').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const requestId = e.target.getAttribute('data-request-id');
            cancelFriendRequest(requestId);
        });
    });
}

// Remove friend
async function removeFriend(friendId) {
    try {
        // Find the friendship document
        const friendshipQuery = await db.collection('friends')
            .where('userIds', 'array-contains', currentUser.uid)
            .get();

        const friendshipDoc = friendshipQuery.docs.find(doc => {
            const data = doc.data();
            return data.userIds.includes(friendId);
        });

        if (!friendshipDoc) {
            showNotification('Friendship not found', 'error');
            return;
        }

        // Delete friendship document
        await db.collection('friends').doc(friendshipDoc.id).delete();

        // Update both users' friend counts
        const batch = db.batch();
        
        const userRef = db.collection('users').doc(currentUser.uid);
        batch.update(userRef, {
            friends: firebase.firestore.FieldValue.increment(-1),
            following: firebase.firestore.FieldValue.increment(-1)
        });

        const friendRef = db.collection('users').doc(friendId);
        batch.update(friendRef, {
            friends: firebase.firestore.FieldValue.increment(-1),
            followers: firebase.firestore.FieldValue.increment(-1)
        });

        await batch.commit();

        showNotification('Friend removed', 'info');
        console.log('✅ Friend removed');

    } catch (error) {
        console.error('❌ Error removing friend:', error);
        showNotification('Error removing friend: ' + error.message, 'error');
    }
}

// Open edit profile modal
function openEditProfileModal() {
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
    console.log(`💬 ${type.toUpperCase()}: ${message}`);
    alert(`${type.toUpperCase()}: ${message}`);
}

// Global functions
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.cancelFriendRequest = cancelFriendRequest;
window.removeFriend = removeFriend;
window.openImageModal = function(imageUrl) {
    console.log('Opening image modal for:', imageUrl);
};

// Add post interaction event listeners
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

// Register for settings updates
if (window.settingsApp) {
    window.settingsApp.addSettingsListener((settings) => {
        document.body.className = document.body.className.replace(/theme-\w+/g, '') + ' ' + settings.theme;
        console.log("Settings updated:", settings);
    });
}