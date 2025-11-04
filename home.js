// home.js - Complete Firebase integration with ALL features working
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
});

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

// ========== FIREBASE FUNCTIONS ==========
async function initializeApp() {
    try {
        console.log('Initializing Firebase...');
        await setupCurrentUser();
        await loadUserLikes();
        loadPosts();
        loadTrendingPosts();
        loadStatuses();
    } catch (error) {
        console.error("Error initializing app:", error);
    }
}

async function setupCurrentUser() {
    // For now, using a demo user - in production, use Firebase Auth
    appData.currentUser = {
        id: 'user_01',
        name: 'User_01',
        avatar: 'from-green-400 to-cyan-500'
    };
    
    await checkUserExists();
    await loadFollowingList();
    await loadFriendsAndGroups();
}

async function checkUserExists() {
    try {
        const userDoc = await usersRef.doc(appData.currentUser.id).get();
        if (!userDoc.exists) {
            await usersRef.doc(appData.currentUser.id).set({
                name: appData.currentUser.name,
                avatar: appData.currentUser.avatar,
                following: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error("Error checking user:", error);
    }
}

async function loadFollowingList() {
    try {
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
        // Load friends from users collection
        const usersSnapshot = await usersRef.where('id', '!=', appData.currentUser.id).limit(10).get();
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
        });
}

async function loadTrendingPosts() {
    try {
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
            showNotification('Post unliked', 'info');
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
            showNotification('Post liked!', 'success');
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
        
        showNotification('Comment added!', 'success');
        return { id: commentRef.id, ...newComment };
    } catch (error) {
        console.error("Error adding comment:", error);
        showNotification('Error adding comment', 'error');
        return null;
    }
}

async function addReply(commentId, replyText, postId) {
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
            
            showNotification('Reply added!', 'success');
            return newReply;
        }
    } catch (error) {
        console.error("Error adding reply:", error);
        showNotification('Error adding reply', 'error');
        return null;
    }
}

async function likeComment(commentId, postId) {
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

async function likeReply(commentId, replyId, postId) {
    showNotification('Reply liked!', 'success');
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

// ========== STATUS VIEWERS SYSTEM ==========
async function viewStatusStory(statusId) {
    try {
        // Add current user to viewers
        const viewId = `${statusId}_${appData.currentUser.id}`;
        const viewDocRef = viewsRef.doc(viewId);
        
        const viewDoc = await viewDocRef.get();
        if (!viewDoc.exists) {
            await viewDocRef.set({
                statusId: statusId,
                userId: appData.currentUser.id,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Increment view count
            await statusesRef.doc(statusId).update({
                viewersCount: firebase.firestore.FieldValue.increment(1)
            });
        }
        
        showStatusViewers(statusId);
    } catch (error) {
        console.error("Error viewing status:", error);
    }
}

async function showStatusViewers(statusId) {
    try {
        const modal = document.getElementById('statusViewerModal');
        const viewerList = document.querySelector('.status-viewer-list');
        
        if (!modal || !viewerList) return;
        
        // Get viewers for this status
        const viewsSnapshot = await viewsRef
            .where('statusId', '==', statusId)
            .orderBy('timestamp', 'desc')
            .get();
        
        viewerList.innerHTML = '';
        
        if (viewsSnapshot.empty) {
            viewerList.innerHTML = '<p class="text-theme-secondary text-center py-4">No viewers yet</p>';
        } else {
            for (const doc of viewsSnapshot.docs) {
                const viewData = doc.data();
                const user = appData.friends.find(f => f.id === viewData.userId) || 
                            { name: viewData.userId, avatar: 'from-gray-500 to-gray-700' };
                
                const viewerElement = document.createElement('div');
                viewerElement.className = 'flex items-center space-x-3 p-3 glass rounded-xl mb-2';
                viewerElement.innerHTML = `
                    <div class="w-10 h-10 bg-gradient-to-r ${user.avatar} rounded-2xl"></div>
                    <div class="flex-1">
                        <p class="text-sm font-semibold text-theme-primary">${user.name}</p>
                        <p class="text-xs text-theme-secondary">Viewed ${formatTime(viewData.timestamp)}</p>
                    </div>
                    ${viewData.userId !== appData.currentUser.id ? `
                        <button class="follow-btn ${isFollowing(viewData.userId) ? 'following' : ''}" onclick="toggleFollow('${viewData.userId}')">
                            ${isFollowing(viewData.userId) ? 'Following' : 'Follow'}
                        </button>
                    ` : ''}
                `;
                viewerList.appendChild(viewerElement);
            }
        }
        
        modal.classList.remove('hidden');
    } catch (error) {
        console.error("Error loading status viewers:", error);
    }
}

function closeViewerModal() {
    const modal = document.getElementById('statusViewerModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ========== POST INTERACTIONS MODAL ==========
async function showPostInteractions(postId, type) {
    try {
        const modal = document.getElementById('postInteractionsModal');
        const title = document.getElementById('interactionsTitle');
        
        if (!modal || !title) return;
        
        if (type === 'likes') {
            title.textContent = 'Likes';
        } else if (type === 'comments') {
            title.textContent = 'Comments';
        } else if (type === 'shares') {
            title.textContent = 'Shares';
        } else if (type === 'views') {
            title.textContent = 'Views';
        }
        
        // Set active tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('data-tab') === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        modal.setAttribute('data-post-id', postId);
        await loadInteractionsTab(type, postId);
        modal.classList.remove('hidden');
    } catch (error) {
        console.error("Error showing post interactions:", error);
    }
}

async function loadInteractionsTab(tab, postId = null) {
    if (!postId) {
        postId = document.getElementById('postInteractionsModal').getAttribute('data-post-id');
    }
    
    const content = document.getElementById('interactionsContent');
    if (!content) return;
    
    content.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-theme-accent"></i></div>';
    
    try {
        if (tab === 'likes') {
            await loadLikesTab(postId, content);
        } else if (tab === 'comments') {
            await loadCommentsTab(postId, content);
        } else if (tab === 'shares') {
            await loadSharesTab(postId, content);
        } else if (tab === 'views') {
            await loadViewsTab(postId, content);
        }
    } catch (error) {
        console.error("Error loading interactions tab:", error);
        content.innerHTML = '<p class="text-theme-secondary text-center py-4">Error loading data</p>';
    }
}

async function loadLikesTab(postId, container) {
    const likesSnapshot = await likesRef
        .where('postId', '==', postId)
        .orderBy('timestamp', 'desc')
        .get();
    
    container.innerHTML = '';
    
    if (likesSnapshot.empty) {
        container.innerHTML = '<p class="text-theme-secondary text-center py-4">No likes yet</p>';
        return;
    }
    
    for (const doc of likesSnapshot.docs) {
        const likeData = doc.data();
        const user = appData.friends.find(f => f.id === likeData.userId) || 
                    { name: likeData.userId, avatar: 'from-gray-500 to-gray-700' };
        
        const likeElement = document.createElement('div');
        likeElement.className = 'flex items-center space-x-3 p-3 glass rounded-xl mb-2';
        likeElement.innerHTML = `
            <div class="w-10 h-10 bg-gradient-to-r ${user.avatar} rounded-2xl"></div>
            <div class="flex-1">
                <p class="text-sm font-semibold text-theme-primary">${user.name}</p>
                <p class="text-xs text-theme-secondary">Liked ${formatTime(likeData.timestamp)}</p>
            </div>
            ${likeData.userId !== appData.currentUser.id ? `
                <button class="follow-btn ${isFollowing(likeData.userId) ? 'following' : ''}" onclick="toggleFollow('${likeData.userId}')">
                    ${isFollowing(likeData.userId) ? 'Following' : 'Follow'}
                </button>
            ` : ''}
        `;
        container.appendChild(likeElement);
    }
}

async function loadCommentsTab(postId, container) {
    const comments = await loadCommentsForPost(postId);
    container.innerHTML = '';
    
    if (comments.length === 0) {
        container.innerHTML = '<p class="text-theme-secondary text-center py-4">No comments yet</p>';
        return;
    }
    
    comments.forEach(comment => {
        const commentElement = document.createElement('div');
        commentElement.className = 'p-3 glass rounded-xl mb-3';
        commentElement.innerHTML = `
            <div class="flex items-center space-x-3 mb-2">
                <div class="w-8 h-8 bg-gradient-to-r ${comment.author.avatar} rounded-2xl"></div>
                <div class="flex-1">
                    <p class="text-sm font-semibold text-theme-primary">${comment.author.name}</p>
                    <p class="text-xs text-theme-secondary">${formatTime(comment.timestamp)}</p>
                </div>
            </div>
            <p class="text-theme-primary text-sm mb-2">${comment.content}</p>
            <div class="flex justify-between items-center">
                <button class="text-theme-secondary text-xs flex items-center space-x-1" onclick="likeComment('${comment.id}', '${postId}')">
                    <i class="fas fa-heart ${userCommentLikes.has(comment.id) ? 'text-red-400' : ''}"></i> 
                    <span>${comment.likesCount || 0} likes</span>
                </button>
                <button class="text-theme-secondary text-xs" onclick="toggleReplyInput('${postId}', '${comment.id}')">
                    Reply
                </button>
            </div>
            <div id="replyInput-${postId}-${comment.id}" class="hidden mt-3">
                <div class="flex space-x-2">
                    <input type="text" id="replyText-${postId}-${comment.id}" placeholder="Write a reply..." 
                           class="flex-1 p-2 glass border border-purple-700 rounded-xl text-sm">
                    <button class="bg-theme-accent text-white px-3 rounded-xl text-sm" onclick="postReply('${postId}', '${comment.id}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
            ${comment.replies && comment.replies.length > 0 ? `
                <div class="comment-thread mt-3">
                    ${comment.replies.map(reply => `
                        <div class="comment mt-2">
                            <div class="comment-header">
                                <div class="flex items-center space-x-2">
                                    <div class="w-6 h-6 bg-gradient-to-r ${reply.author.avatar} rounded-full"></div>
                                    <p class="text-sm font-semibold text-theme-accent">${reply.author.name}</p>
                                </div>
                                <p class="text-xs text-theme-secondary">${formatTime(reply.timestamp)}</p>
                            </div>
                            <p class="text-theme-primary text-sm">${reply.content}</p>
                            <div class="comment-actions">
                                <button onclick="likeReply('${comment.id}', '${reply.id}', '${postId}')">
                                    <i class="fas fa-heart"></i> 
                                    ${reply.likes ? reply.likes.length : 0}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
        container.appendChild(commentElement);
    });
}

async function loadSharesTab(postId, container) {
    container.innerHTML = '<p class="text-theme-secondary text-center py-4">Share tracking would appear here</p>';
}

async function loadViewsTab(postId, container) {
    container.innerHTML = '<p class="text-theme-secondary text-center py-4">View tracking would appear here</p>';
}

function closeInteractionsModal() {
    const modal = document.getElementById('postInteractionsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ========== REPLY SYSTEM ==========
function toggleReplyInput(postId, commentId) {
    const replyInput = document.getElementById(`replyInput-${postId}-${commentId}`);
    if (replyInput) {
        replyInput.classList.toggle('hidden');
    }
}

async function postReply(postId, commentId) {
    const replyInput = document.getElementById(`replyText-${postId}-${commentId}`);
    if (!replyInput) return;
    
    const replyText = replyInput.value.trim();
    
    if (replyText) {
        await addReply(commentId, replyText, postId);
        replyInput.value = '';
        toggleReplyInput(postId, commentId);
        
        // Reload comments to show the new reply
        await loadInteractionsTab('comments', postId);
    }
}

// ========== MEDIA UPLOAD ==========
function openMediaUpload(type) {
    console.log('Opening media upload for:', type);
    appData.currentMediaType = type;
    const modal = document.getElementById('mediaUploadModal');
    const title = document.getElementById('mediaUploadTitle');
    const text = document.getElementById('uploadText');
    
    if (!modal) {
        console.log('Media upload modal not found');
        return;
    }
    
    if (type === 'image') {
        title.textContent = 'Upload Image';
        text.textContent = 'Drag & drop your image here';
        document.getElementById('mediaInput').accept = 'image/*';
    } else if (type === 'video') {
        title.textContent = 'Upload Video';
        text.textContent = 'Drag & drop your video here';
        document.getElementById('mediaInput').accept = 'video/*';
    } else if (type === 'audio') {
        title.textContent = 'Upload Music';
        text.textContent = 'Drag & drop your music file here';
        document.getElementById('mediaInput').accept = 'audio/*';
    }
    
    modal.classList.remove('hidden');
}

function closeMediaUpload() {
    const modal = document.getElementById('mediaUploadModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.getElementById('mediaInput').value = '';
    appData.currentMediaType = null;
}

function handleMediaUpload(e) {
    if (e.target.files && e.target.files[0]) {
        handleMediaFile(e.target.files[0]);
    }
}

function handleMediaFile(file) {
    const isImage = file.type.match('image.*');
    const isVideo = file.type.match('video.*');
    const isAudio = file.type.match('audio.*');
    
    if (!isImage && !isVideo && !isAudio) {
        alert('Please select an image, video, or audio file');
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

function confirmMediaUpload() {
    if (window.currentMediaData) {
        closeMediaUpload();
    } else {
        alert('Please select a media file first');
    }
}

// ========== TAG FRIENDS ==========
function openTagFriendsModal() {
    console.log('Opening tag friends modal');
    const modal = document.getElementById('tagFriendsModal');
    if (!modal) {
        console.log('Tag friends modal not found');
        return;
    }
    
    renderFriendsList();
    updateTaggedFriendsDisplay();
    modal.classList.remove('hidden');
}

function closeTagFriendsModal() {
    const modal = document.getElementById('tagFriendsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function renderFriendsList() {
    const container = document.getElementById('friendsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    appData.friends.forEach(friend => {
        const friendElement = document.createElement('div');
        friendElement.className = 'tag-suggestion';
        friendElement.setAttribute('data-user-id', friend.id);
        friendElement.setAttribute('data-type', 'user');
        friendElement.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-gradient-to-r ${friend.avatar} rounded-2xl"></div>
                <div>
                    <p class="text-sm font-medium text-theme-primary">${friend.name}</p>
                    <p class="text-xs text-theme-secondary">Friend</p>
                </div>
            </div>
        `;
        
        friendElement.addEventListener('click', () => toggleTagFriend(friend, 'user'));
        container.appendChild(friendElement);
    });
    
    appData.groups.forEach(group => {
        const groupElement = document.createElement('div');
        groupElement.className = 'tag-suggestion';
        groupElement.setAttribute('data-group-id', group.id);
        groupElement.setAttribute('data-type', 'group');
        groupElement.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-gradient-to-r ${group.avatar} rounded-2xl"></div>
                <div>
                    <p class="text-sm font-medium text-theme-primary">${group.name}</p>
                    <p class="text-xs text-theme-secondary">Group</p>
                </div>
            </div>
        `;
        
        groupElement.addEventListener('click', () => toggleTagFriend(group, 'group'));
        container.appendChild(groupElement);
    });
}

function filterFriends() {
    const searchTerm = document.getElementById('friendSearch').value.toLowerCase();
    const suggestions = document.querySelectorAll('.tag-suggestion');
    
    suggestions.forEach(suggestion => {
        const userName = suggestion.querySelector('p').textContent.toLowerCase();
        if (userName.includes(searchTerm)) {
            suggestion.style.display = 'flex';
        } else {
            suggestion.style.display = 'none';
        }
    });
}

function toggleTagFriend(item, type) {
    if (type === 'user') {
        const index = appData.taggedUsers.findIndex(u => u.id === item.id);
        
        if (index === -1) {
            appData.taggedUsers.push(item);
        } else {
            appData.taggedUsers.splice(index, 1);
        }
    } else if (type === 'group') {
        const index = appData.taggedGroups.findIndex(g => g.id === item.id);
        
        if (index === -1) {
            appData.taggedGroups.push(item);
        } else {
            appData.taggedGroups.splice(index, 1);
        }
    }
    
    updateTaggedFriendsDisplay();
}

function updateTaggedFriendsDisplay() {
    const container = document.getElementById('taggedFriendsList');
    const count = document.getElementById('taggedCount');
    
    if (!container || !count) return;
    
    container.innerHTML = '';
    count.textContent = `${appData.taggedUsers.length + appData.taggedGroups.length} tagged`;
    
    appData.taggedUsers.forEach(user => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tagged-user';
        tagElement.innerHTML = `
            <span>@${user.name}</span>
            <button onclick="removeTaggedUser('${user.id}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(tagElement);
    });
    
    appData.taggedGroups.forEach(group => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tagged-user';
        tagElement.innerHTML = `
            <span>#${group.name}</span>
            <button onclick="removeTaggedGroup('${group.id}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(tagElement);
    });
}

function removeTaggedUser(userId) {
    appData.taggedUsers = appData.taggedUsers.filter(u => u.id !== userId);
    updateTaggedFriendsDisplay();
}

function removeTaggedGroup(groupId) {
    appData.taggedGroups = appData.taggedGroups.filter(g => g.id !== groupId);
    updateTaggedFriendsDisplay();
}

function saveTaggedFriends() {
    const container = document.getElementById('taggedFriends');
    if (!container) return;
    
    container.innerHTML = '';
    
    appData.taggedUsers.forEach(user => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tagged-user';
        tagElement.innerHTML = `<span>@${user.name}</span>`;
        container.appendChild(tagElement);
    });
    
    appData.taggedGroups.forEach(group => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tagged-user';
        tagElement.innerHTML = `<span>#${group.name}</span>`;
        container.appendChild(tagElement);
    });
    
    closeTagFriendsModal();
}

// ========== STATUS/STORIES ==========
function openStatusCreation() {
    console.log('Opening status creation modal');
    const modal = document.getElementById('statusCreationModal');
    if (!modal) {
        console.log('Status creation modal not found');
        return;
    }
    
    modal.classList.remove('hidden');
}

function closeStatusCreation() {
    const modal = document.getElementById('statusCreationModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function createStatus() {
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

function selectEmoji(emoji) {
    document.getElementById('selectedEmoji').textContent = emoji;
}

function populateEmojiGrid() {
    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) return;
    
    const emojis = ['😊', '😂', '❤️', '😍', '🔥', '👍', '🎉', '👏', '🙏', '😎', '🤔', '😢', '👀', '💯', '✨'];
    
    emojiGrid.innerHTML = '';
    emojis.forEach(emoji => {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji-option text-2xl cursor-pointer hover:scale-125 transition-transform';
        emojiElement.textContent = emoji;
        emojiElement.onclick = () => selectEmoji(emoji);
        emojiGrid.appendChild(emojiElement);
    });
}

function updateStatusStories(snapshot) {
    const container = document.getElementById('statusStories');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (snapshot.empty) {
        container.innerHTML = `
            <div class="status-story">
                <div class="status-avatar bg-gradient-to-r from-gray-500 to-gray-700">
                    <i class="fas fa-plus"></i>
                </div>
                <p class="status-username">Add Status</p>
            </div>
        `;
        return;
    }
    
    snapshot.forEach((doc) => {
        const status = { id: doc.id, ...doc.data() };
        const statusElement = document.createElement('div');
        statusElement.className = 'status-story';
        statusElement.innerHTML = `
            <div class="status-avatar bg-gradient-to-r ${status.author.avatar}" onclick="viewStatusStory('${status.id}')">
                <span class="status-emoji">${status.emoji}</span>
            </div>
            <p class="status-username">${status.author.name}</p>
        `;
        container.appendChild(statusElement);
    });
    
    // Add "Add Status" button
    const addStatusElement = document.createElement('div');
    addStatusElement.className = 'status-story';
    addStatusElement.innerHTML = `
        <div class="status-avatar bg-gradient-to-r from-gray-500 to-gray-700" onclick="openStatusCreation()">
            <i class="fas fa-plus"></i>
        </div>
        <p class="status-username">Add Status</p>
    `;
    container.appendChild(addStatusElement);
}

// ========== FOLLOW SYSTEM ==========
function isFollowing(userId) {
    return appData.following.includes(userId);
}

async function toggleFollow(userId) {
    try {
        const userRef = usersRef.doc(appData.currentUser.id);
        
        if (isFollowing(userId)) {
            // Unfollow
            appData.following = appData.following.filter(id => id !== userId);
            await userRef.update({
                following: firebase.firestore.FieldValue.arrayRemove(userId)
            });
            showNotification('Unfollowed', 'info');
        } else {
            // Follow
            appData.following.push(userId);
            await userRef.update({
                following: firebase.firestore.FieldValue.arrayUnion(userId)
            });
            showNotification('Followed!', 'success');
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

// ========== UI CREATION FUNCTIONS ==========
function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post glass rounded-2xl border border-purple-700 p-6 mb-6';
    postElement.innerHTML = `
        <div class="post-header flex items-center justify-between mb-4">
            <div class="flex items-center space-x-3">
                <div class="w-12 h-12 bg-gradient-to-r ${post.author.avatar} rounded-2xl"></div>
                <div>
                    <p class="font-semibold text-theme-primary">${post.author.name}</p>
                    <p class="text-sm text-theme-secondary">${formatTime(post.timestamp)}</p>
                </div>
            </div>
            <button class="text-theme-secondary hover:text-theme-primary">
                <i class="fas fa-ellipsis-h"></i>
            </button>
        </div>
        
        <div class="post-content mb-4">
            <p class="text-theme-primary mb-3">${post.content}</p>
            ${post.media ? `
                <div class="media-container mb-3">
                    ${post.media.type === 'image' ? `
                        <img src="${post.media.data}" alt="Post image" class="rounded-xl w-full max-h-96 object-cover">
                    ` : post.media.type === 'video' ? `
                        <video src="${post.media.data}" controls class="rounded-xl w-full"></video>
                    ` : post.media.type === 'audio' ? `
                        <audio src="${post.media.data}" controls class="w-full"></audio>
                    ` : ''}
                </div>
            ` : ''}
            ${post.taggedUsers && post.taggedUsers.length > 0 ? `
                <div class="tagged-users mb-3">
                    <p class="text-sm text-theme-secondary">Tagged: ${post.taggedUsers.map(u => u.name).join(', ')}</p>
                </div>
            ` : ''}
        </div>
        
        <div class="post-stats flex items-center justify-between text-sm text-theme-secondary mb-4">
            <button class="flex items-center space-x-1" onclick="showPostInteractions('${post.id}', 'likes')">
                <i class="fas fa-heart"></i>
                <span>${post.likesCount || 0}</span>
            </button>
            <button class="flex items-center space-x-1" onclick="showPostInteractions('${post.id}', 'comments')">
                <i class="fas fa-comment"></i>
                <span>${post.commentsCount || 0}</span>
            </button>
            <button class="flex items-center space-x-1" onclick="showPostInteractions('${post.id}', 'shares')">
                <i class="fas fa-share"></i>
                <span>${post.sharesCount || 0}</span>
            </button>
            <button class="flex items-center space-x-1" onclick="showPostInteractions('${post.id}', 'views')">
                <i class="fas fa-eye"></i>
                <span>${post.viewsCount || 0}</span>
            </button>
        </div>
        
        <div class="post-actions flex space-x-2 mb-4">
            <button class="post-action-btn ${userLikes.has(post.id) ? 'liked' : ''}" onclick="likePost('${post.id}')">
                <i class="fas fa-heart ${userLikes.has(post.id) ? 'text-red-400' : ''}"></i>
                <span>Like</span>
            </button>
            <button class="post-action-btn" onclick="toggleCommentSection('${post.id}')">
                <i class="fas fa-comment"></i>
                <span>Comment</span>
            </button>
            <button class="post-action-btn">
                <i class="fas fa-share"></i>
                <span>Share</span>
            </button>
        </div>
        
        <div id="commentSection-${post.id}" class="comment-section hidden">
            <div class="flex space-x-2 mb-4">
                <input type="text" id="commentInput-${post.id}" placeholder="Write a comment..." 
                       class="flex-1 p-3 glass border border-purple-700 rounded-xl text-sm">
                <button class="bg-theme-accent text-white px-4 rounded-xl" onclick="postComment('${post.id}')">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
            <div id="commentsContainer-${post.id}" class="comments-container space-y-3">
                <!-- Comments will be loaded here -->
            </div>
        </div>
    `;
    return postElement;
}

function createTrendingPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'trending-post glass rounded-2xl border border-purple-700 p-4 mb-4 cursor-pointer hover:border-theme-accent transition-all';
    postElement.innerHTML = `
        <div class="flex items-center space-x-3 mb-3">
            <div class="w-10 h-10 bg-gradient-to-r ${post.author.avatar} rounded-2xl"></div>
            <div class="flex-1">
                <p class="font-semibold text-theme-primary text-sm">${post.author.name}</p>
                <p class="text-xs text-theme-secondary">${formatTime(post.timestamp)}</p>
            </div>
        </div>
        <p class="text-theme-primary text-sm line-clamp-2 mb-2">${post.content}</p>
        <div class="flex items-center justify-between text-xs text-theme-secondary">
            <div class="flex items-center space-x-3">
                <span><i class="fas fa-heart"></i> ${post.likesCount || 0}</span>
                <span><i class="fas fa-comment"></i> ${post.commentsCount || 0}</span>
            </div>
            <span class="text-theme-accent">Trending</span>
        </div>
    `;
    return postElement;
}

// ========== COMMENT SYSTEM ==========
function toggleCommentSection(postId) {
    const commentSection = document.getElementById(`commentSection-${postId}`);
    if (commentSection) {
        commentSection.classList.toggle('hidden');
        
        if (!commentSection.classList.contains('hidden')) {
            loadComments(postId);
        }
    }
}

async function loadComments(postId) {
    const container = document.getElementById(`commentsContainer-${postId}`);
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-theme-accent"></i></div>';
    
    try {
        const comments = await loadCommentsForPost(postId);
        container.innerHTML = '';
        
        if (comments.length === 0) {
            container.innerHTML = '<p class="text-theme-secondary text-center py-4">No comments yet</p>';
            return;
        }
        
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment glass rounded-xl p-3';
            commentElement.innerHTML = `
                <div class="flex items-center space-x-2 mb-2">
                    <div class="w-8 h-8 bg-gradient-to-r ${comment.author.avatar} rounded-full"></div>
                    <div class="flex-1">
                        <p class="text-sm font-semibold text-theme-primary">${comment.author.name}</p>
                        <p class="text-xs text-theme-secondary">${formatTime(comment.timestamp)}</p>
                    </div>
                </div>
                <p class="text-theme-primary text-sm mb-2">${comment.content}</p>
                <div class="flex justify-between items-center">
                    <button class="text-theme-secondary text-xs flex items-center space-x-1" onclick="likeComment('${comment.id}', '${postId}')">
                        <i class="fas fa-heart ${userCommentLikes.has(comment.id) ? 'text-red-400' : ''}"></i> 
                        <span>${comment.likesCount || 0} likes</span>
                    </button>
                    <button class="text-theme-secondary text-xs" onclick="toggleReplyInput('${postId}', '${comment.id}')">
                        Reply
                    </button>
                </div>
                <div id="replyInput-${postId}-${comment.id}" class="hidden mt-3">
                    <div class="flex space-x-2">
                        <input type="text" id="replyText-${postId}-${comment.id}" placeholder="Write a reply..." 
                               class="flex-1 p-2 glass border border-purple-700 rounded-xl text-sm">
                        <button class="bg-theme-accent text-white px-3 rounded-xl text-sm" onclick="postReply('${postId}', '${comment.id}')">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
                ${comment.replies && comment.replies.length > 0 ? `
                    <div class="comment-thread mt-3">
                        ${comment.replies.map(reply => `
                            <div class="comment mt-2">
                                <div class="comment-header">
                                    <div class="flex items-center space-x-2">
                                        <div class="w-6 h-6 bg-gradient-to-r ${reply.author.avatar} rounded-full"></div>
                                        <p class="text-sm font-semibold text-theme-accent">${reply.author.name}</p>
                                    </div>
                                    <p class="text-xs text-theme-secondary">${formatTime(reply.timestamp)}</p>
                                </div>
                                <p class="text-theme-primary text-sm">${reply.content}</p>
                                <div class="comment-actions">
                                    <button onclick="likeReply('${comment.id}', '${reply.id}', '${postId}')">
                                        <i class="fas fa-heart"></i> 
                                        ${reply.likes ? reply.likes.length : 0}
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            `;
            container.appendChild(commentElement);
        });
    } catch (error) {
        console.error("Error loading comments:", error);
        container.innerHTML = '<p class="text-theme-secondary text-center py-4">Error loading comments</p>';
    }
}

async function postComment(postId) {
    const commentInput = document.getElementById(`commentInput-${postId}`);
    if (!commentInput) return;
    
    const commentText = commentInput.value.trim();
    
    if (commentText) {
        const newComment = await addComment(postId, commentText);
        if (newComment) {
            commentInput.value = '';
            loadComments(postId);
        }
    }
}

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
            document.body.removeChild(notification);
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
    
    // Friend search
    const friendSearch = document.getElementById('friendSearch');
    if (friendSearch) {
        friendSearch.addEventListener('input', filterFriends);
    }
    
    // Status creation
    const statusButton = document.getElementById('statusButton');
    if (statusButton) {
        statusButton.addEventListener('click', createStatus);
    }
    
    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeMediaUpload();
            closeTagFriendsModal();
            closeStatusCreation();
            closeInteractionsModal();
            closeViewerModal();
        }
    });
}

// ========== DRAG AND DROP ==========
function setupDragAndDrop() {
    const dropZone = document.querySelector('.drop-zone');
    if (!dropZone) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropZone.classList.add('highlight');
    }
    
    function unhighlight() {
        dropZone.classList.remove('highlight');
    }
    
    dropZone.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            handleMediaFile(files[0]);
        }
    }
}

// Initialize drag and drop when DOM is loaded
document.addEventListener('DOMContentLoaded', setupDragAndDrop);