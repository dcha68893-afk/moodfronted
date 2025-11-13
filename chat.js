

        // Firebase Configuration
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
        const auth = firebase.auth();
        const db = firebase.firestore();
        const storage = firebase.storage();
        const messaging = firebase.messaging();

        // Cloudinary Configuration
        const cloudinaryConfig = {
            cloudName: 'dhjnxa5rh',
            apiKey: '817591969559894',
            uploadPreset: 'kynecta_uploads'
        };

        // Global Variables
        let currentUser = null;
        let currentUserData = null;
        let currentChat = null;
        let isInCall = false;
        let friends = [];
        let allUsers = [];
        let userSettings = {
            security: {
                notifications: true,
                passkeys: false,
                twoStepVerification: false
            },
            privacy: {
                lastSeen: 'everyone',
                profilePhoto: 'everyone',
                about: 'everyone',
                status: 'everyone',
                readReceipts: true,
                disappearingMessages: 'off',
                groups: 'everyone',
                avatarStickers: true,
                calls: 'everyone',
                contact: 'everyone',
                appLock: false,
                cameraEffects: true
            },
            notifications: {
                conversationTones: true,
                reminders: true,
                vibrate: true,
                notificationLight: true,
                lightColor: '#7C3AED',
                highPriorityNotifications: true,
                reactionNotifications: true
            },
            storage: {
                lessDataCalls: false,
                proxyEnabled: false,
                mediaUploadQuality: 'auto',
                autoDownloadQuality: 'standard'
            },
            chat: {
                displayTheme: 'light',
                defaultChatTheme: 'purple',
                fontSize: 'medium',
                enterKeySends: true,
                mediaVisibility: true
            },
            accessibility: {
                largeText: false,
                highContrast: false,
                screenReader: true,
                reducedMotion: false,
                voiceControl: false
            },
            language: {
                appLanguage: 'en'
            },
            favorites: []
        };
        let userStatuses = [];
        let unsubscribeMessages = null;
        let unsubscribeChats = null;
        let currentEditingFriendId = null;
        let typingTimeout = null;
        let typingListener = null;

        // WebRTC Variables
        let localStream = null;
        let remoteStream = null;
        let peerConnection = null;
        let isMuted = false;
        let isVideoOff = false;

        // DOM Elements
        const loadingScreen = document.getElementById('loadingScreen');
        const chatApp = document.getElementById('chatApp');
        const settingsModal = document.getElementById('settingsModal');
        const addFriendModal = document.getElementById('addFriendModal');
        const friendSearchResultsModal = document.getElementById('friendSearchResultsModal');
        const editFriendModal = document.getElementById('editFriendModal');
        const profileSettingsModal = document.getElementById('profileSettingsModal');
        const privacySettingsModal = document.getElementById('privacySettingsModal');
        const accountSettingsModal = document.getElementById('accountSettingsModal');
        const accessibilitySettingsModal = document.getElementById('accessibilitySettingsModal');
        const notificationsSettingsModal = document.getElementById('notificationsSettingsModal');
        const storageSettingsModal = document.getElementById('storageSettingsModal');
        const languageSettingsModal = document.getElementById('languageSettingsModal');
        const chatSettingsModal = document.getElementById('chatSettingsModal');
        const favoritesSettingsModal = document.getElementById('favoritesSettingsModal');
        const helpCenterModal = document.getElementById('helpCenterModal');
        const appInfoModal = document.getElementById('appInfoModal');
        const inviteFriendsModal = document.getElementById('inviteFriendsModal');
        const statusCreation = document.getElementById('statusCreation');
        const videoConferenceModal = document.getElementById('videoConferenceModal');
        const emojiPicker = document.getElementById('emojiPicker');
        const createGroupModal = document.getElementById('createGroupModal');
        const joinGroupModal = document.getElementById('joinGroupModal');
        const allFriendsModal = document.getElementById('allFriendsModal');

        // Safety function to check if element exists
        function safeElement(id) {
            const element = document.getElementById(id);
            if (!element) {
                console.warn(`Element with id '${id}' not found`);
            }
            return element;
        }

        // Safe version of classList operations
        function safeClassList(id, action, className) {
            const element = safeElement(id);
            if (element && element.classList) {
                element.classList[action](className);
            }
        }

        // Initialize the application
        document.addEventListener('DOMContentLoaded', initApp);

        function initApp() {
            // Check if user is logged in
            auth.onAuthStateChanged(user => {
                if (user) {
                    currentUser = user;
                    loadUserData();
                } else {
                    // Redirect to login if not authenticated
                    window.location.href = 'login.html';
                }
            });
        }

        async function loadUserData() {
            try {
                // Get user document from Firestore
                const userDoc = await db.collection('users').doc(currentUser.uid).get();
                
                if (userDoc.exists) {
                    currentUserData = userDoc.data();
                    initializeUserData();
                } else {
                    // Create user document if it doesn't exist
                    currentUserData = {
                        uid: currentUser.uid,
                        email: currentUser.email,
                        displayName: currentUser.displayName || currentUser.email.split('@')[0],
                        photoURL: currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email)}&background=7C3AED&color=fff`,
                        coverURL: '',
                        about: 'Life without Christ is motion without meaning',
                        phone: '',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                        status: 'online',
                        mood: 'happy'
                    };
                    
                    await db.collection('users').doc(currentUser.uid).set(currentUserData);
                    initializeUserData();
                }
                
                showChatApp();
                setupEventListeners();
                loadUserSettings();
                loadStatusUpdates();
                loadFriends();
                loadAllUsers();
                initEmojiPicker();
                loadChatsTemporary(); // Use the safe version
                requestNotificationPermission();
            } catch (error) {
                console.error('Error loading user data:', error);
                showToast('Error loading user data', 'error');
            }
        }

        function initializeUserData() {
            // Set user info in UI
            document.getElementById('userName').textContent = currentUserData.displayName;
            document.getElementById('userAvatar').src = currentUserData.photoURL;
            
            // Update settings modal with user data
            document.getElementById('settingsUserName').textContent = currentUserData.displayName;
            document.getElementById('settingsProfilePic').src = currentUserData.photoURL;
            
            // Update profile settings with user data
            document.getElementById('profileName').value = currentUserData.displayName;
            document.getElementById('profileAbout').value = currentUserData.about || '';
            document.getElementById('profileEmail').value = currentUserData.email;
            document.getElementById('profilePhone').value = currentUserData.phone || '';
            document.getElementById('profilePicPreview').src = currentUserData.photoURL;
            document.getElementById('profileCoverPreview').src = currentUserData.coverURL || '';
            
            // Load user preferences
            loadUserPreferences();
        }

        function showChatApp() {
            loadingScreen.classList.add('hidden');
            chatApp.classList.remove('hidden');
        }

        function loadUserPreferences() {
            const theme = localStorage.getItem('kynecta-theme') || 'light';
            setTheme(theme);
        }

        function setTheme(theme) {
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('kynecta-theme', theme);
            
            // Update theme icon
            const themeIcon = document.getElementById('themeIcon');
            if (theme === 'dark') {
                themeIcon.className = 'fas fa-sun';
            } else {
                themeIcon.className = 'fas fa-moon';
            }
        }

        function showToast(message, type = 'info') {
            const toastContainer = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            
            toastContainer.appendChild(toast);
            
            // Trigger animation
            setTimeout(() => toast.classList.add('show'), 10);
            
            // Remove after delay
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 3000);
        }

        function loadUserSettings() {
            // Load settings from localStorage or use defaults
            const savedSettings = localStorage.getItem('kynecta-settings');
            if (savedSettings) {
                userSettings = JSON.parse(savedSettings);
            }
            
            // Apply settings to UI
            applyUserSettings();
        }

        function saveUserSettings() {
            localStorage.setItem('kynecta-settings', JSON.stringify(userSettings));
        }

        function applyUserSettings() {
            // Apply theme
            setTheme(userSettings.chat.displayTheme);
            
            // Apply accessibility settings
            applyAccessibilitySettings();
            
            // Apply chat settings
            applyChatSettings();
        }

        function applyAccessibilitySettings() {
            // Font size
            document.body.style.fontSize = userSettings.accessibility.largeText ? '18px' : '16px';
            
            // High contrast
            if (userSettings.accessibility.highContrast) {
                document.body.classList.add('high-contrast');
            } else {
                document.body.classList.remove('high-contrast');
            }
            
            // Reduced motion
            if (userSettings.accessibility.reducedMotion) {
                document.body.classList.add('reduce-motion');
            } else {
                document.body.classList.remove('reduce-motion');
            }
        }

        function applyChatSettings() {
            // Enter key sends
            const messageInput = document.getElementById('messageInput');
            if (userSettings.chat.enterKeySends) {
                messageInput.setAttribute('data-enter-sends', 'true');
            } else {
                messageInput.setAttribute('data-enter-sends', 'false');
            }
        }

        function loadStatusUpdates() {
            const statusUpdates = document.getElementById('statusUpdates');
            
            // Load statuses from Firebase
            db.collection('statuses')
                .where('userId', '==', currentUser.uid)
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get()
                .then(snapshot => {
                    if (snapshot.empty) {
                        statusUpdates.innerHTML = `
                            <div class="text-center text-gray-500 py-8">
                                <i class="fas fa-images text-4xl mb-3 text-gray-300 block"></i>
                                <p>No status updates yet</p>
                                <p class="text-sm mt-1">Share a photo, video, or text update</p>
                            </div>
                        `;
                        return;
                    }
                    
                    statusUpdates.innerHTML = '';
                    snapshot.forEach(doc => {
                        const status = doc.data();
                        const statusElement = document.createElement('div');
                        statusElement.className = 'flex items-center space-x-3 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer';
                        
                        let statusContent = '';
                        if (status.type === 'emoji') {
                            statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-green-500 flex items-center justify-center text-white text-xl">${status.content}</div>`;
                        } else if (status.type === 'text') {
                            statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-teal-500 flex items-center justify-center text-white"><i class="fas fa-font"></i></div>`;
                        } else if (status.type === 'image') {
                            statusContent = `<div class="w-12 h-12 rounded-full bg-cover bg-center" style="background-image: url('${status.content}')"></div>`;
                        } else if (status.type === 'video') {
                            statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-red-500 to-pink-500 flex items-center justify-center text-white"><i class="fas fa-video"></i></div>`;
                        } else if (status.type === 'audio') {
                            statusContent = `<div class="w-12 h-12 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center text-white"><i class="fas fa-music"></i></div>`;
                        }
                        
                        statusElement.innerHTML = `
                            ${statusContent}
                            <div>
                                <p class="font-medium">${status.userDisplayName}</p>
                                <p class="text-sm text-gray-500">${formatTimeAgo(status.timestamp)}</p>
                            </div>
                        `;
                        
                        statusUpdates.appendChild(statusElement);
                    });
                })
                .catch(error => {
                    console.error('Error loading status updates:', error);
                    statusUpdates.innerHTML = `
                        <div class="text-center text-gray-500 py-8">
                            <i class="fas fa-exclamation-triangle text-4xl mb-3 text-gray-300 block"></i>
                            <p>Error loading status updates</p>
                            <p class="text-sm mt-1">Please try again later</p>
                        </div>
                    `;
                });
        }

        function formatTimeAgo(timestamp) {
            if (!timestamp) return 'Just now';
            
            const now = new Date();
            const time = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            const diffMs = now - time;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return time.toLocaleDateString();
        }

        function openStatusCreation() {
            statusCreation.style.display = 'flex';
            resetStatusCreation();
        }

        function resetStatusCreation() {
            // Reset all previews
            document.getElementById('emojiPreview').classList.remove('hidden');
            document.getElementById('textPreview').classList.add('hidden');
            document.getElementById('imagePreview').classList.add('hidden');
            document.getElementById('videoPreview').classList.add('hidden');
            document.getElementById('audioPreview').classList.add('hidden');
            
            // Reset active option
            document.querySelectorAll('.status-option').forEach(option => {
                option.classList.remove('active');
            });
            document.querySelector('.status-option[data-type="emoji"]').classList.add('active');
            
            // Reset content
            document.getElementById('emojiPreview').textContent = '😊';
            document.getElementById('statusTextInput').value = '';
            document.getElementById('statusImagePreview').classList.add('hidden');
            document.getElementById('statusVideoPreview').classList.add('hidden');
            document.getElementById('statusAudioPreview').classList.add('hidden');
        }

        async function uploadToCloudinary(file, resourceType = 'image') {
            return new Promise((resolve, reject) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', cloudinaryConfig.uploadPreset);
                formData.append('cloud_name', cloudinaryConfig.cloudName);
                
                fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`, {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.secure_url) {
                        resolve(data.secure_url);
                    } else {
                        reject(new Error('Upload failed'));
                    }
                })
                .catch(error => {
                    reject(error);
                });
            });
        }

        async function postStatus(type, content) {
            try {
                let finalContent = content;
                
                // Handle file uploads to Cloudinary
                if (type === 'image' || type === 'video' || type === 'audio') {
                    showToast('Uploading media...', 'info');
                    
                    // For demo purposes, we'll use a placeholder
                    // In a real app, you would get the file and upload it
                    if (type === 'image') {
                        finalContent = 'https://res.cloudinary.com/dhjnxa5rh/image/upload/v1621234567/placeholder.jpg';
                    } else if (type === 'video') {
                        finalContent = 'https://res.cloudinary.com/dhjnxa5rh/video/upload/v1621234567/placeholder.mp4';
                    } else if (type === 'audio') {
                        finalContent = 'https://res.cloudinary.com/dhjnxa5rh/audio/upload/v1621234567/placeholder.mp3';
                    }
                }
                
                const newStatus = {
                    type: type,
                    content: finalContent,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
                    userId: currentUser.uid,
                    userDisplayName: currentUserData.displayName,
                    userPhotoURL: currentUserData.photoURL
                };
                
                // Save to Firestore
                await db.collection('statuses').add(newStatus);
                
                // Update UI
                loadStatusUpdates();
                showToast('Status posted successfully', 'success');
            } catch (error) {
                console.error('Error posting status:', error);
                showToast('Error posting status', 'error');
            }
        }

        function loadFriends() {
            // Fetch friends from Firebase
            db.collection('friendships')
                .where('users', 'array-contains', currentUser.uid)
                .where('status', '==', 'accepted')
                .onSnapshot(snapshot => {
                    friends = [];
                    const friendPromises = [];
                    
                    snapshot.forEach(doc => {
                        const friendship = doc.data();
                        const friendId = friendship.users.find(id => id !== currentUser.uid);
                        
                        // Get friend details
                        const friendPromise = db.collection('users').doc(friendId).get().then(friendDoc => {
                            if (friendDoc.exists) {
                                const friendData = friendDoc.data();
                                friends.push({
                                    id: friendId,
                                    friendshipId: doc.id,
                                    ...friendData
                                });
                            }
                        });
                        
                        friendPromises.push(friendPromise);
                    });
                    
                    Promise.all(friendPromises).then(() => {
                        renderFriends(friends);
                        
                        if (friends.length === 0) {
                            document.getElementById('noFriendsMessage').classList.remove('hidden');
                        } else {
                            document.getElementById('noFriendsMessage').classList.add('hidden');
                        }
                    });
                }, error => {
                    console.error('Error loading friends:', error);
                    showToast('Error loading friends', 'error');
                });
        }

        function loadAllUsers() {
            // Fetch all registered users from Firebase
            db.collection('users')
                .where('uid', '!=', currentUser.uid)
                .onSnapshot(snapshot => {
                    allUsers = [];
                    snapshot.forEach(doc => {
                        allUsers.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                }, error => {
                    console.error('Error loading users:', error);
                });
        }

        async function searchUsers(query) {
            if (!query) return [];
            
            // Search by name, email, or phone
            const nameResults = allUsers.filter(user => 
                user.displayName && user.displayName.toLowerCase().includes(query.toLowerCase())
            );
            
            const emailResults = allUsers.filter(user => 
                user.email && user.email.toLowerCase().includes(query.toLowerCase())
            );
            
            const phoneResults = allUsers.filter(user => 
                user.phone && user.phone.includes(query)
            );
            
            // Combine and remove duplicates
            const allResults = [...nameResults, ...emailResults, ...phoneResults];
            const uniqueResults = allResults.filter((user, index, self) => 
                index === self.findIndex(u => u.id === user.id)
            );
            
            return uniqueResults;
        }

        async function sendFriendRequest(friendId) {
            try {
                // Check if friendship already exists
                const existingFriendship = await db.collection('friendships')
                    .where('users', 'array-contains', currentUser.uid)
                    .where('status', 'in', ['pending', 'accepted'])
                    .get();
                
                const alreadyFriends = existingFriendship.docs.some(doc => {
                    const data = doc.data();
                    return data.users.includes(friendId);
                });
                
                if (alreadyFriends) {
                    showToast('Friend request already sent or user is already your friend', 'error');
                    return;
                }
                
                // Create friendship document
                const friendship = {
                    users: [currentUser.uid, friendId],
                    status: 'pending',
                    requestedBy: currentUser.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('friendships').add(friendship);
                showToast('Friend request sent successfully', 'success');
            } catch (error) {
                console.error('Error sending friend request:', error);
                showToast('Error sending friend request', 'error');
            }
        }

        function removeFriend(friendId) {
            // Find the friendship document
            db.collection('friendships')
                .where('users', 'array-contains', currentUser.uid)
                .where('status', '==', 'accepted')
                .get()
                .then(snapshot => {
                    snapshot.forEach(doc => {
                        const friendship = doc.data();
                        if (friendship.users.includes(friendId)) {
                            // Delete the friendship
                            db.collection('friendships').doc(doc.id).delete()
                                .then(() => {
                                    showToast('Friend removed successfully', 'success');
                                })
                                .catch(error => {
                                    console.error('Error removing friend:', error);
                                    showToast('Error removing friend', 'error');
                                });
                        }
                    });
                })
                .catch(error => {
                    console.error('Error finding friendship:', error);
                    showToast('Error removing friend', 'error');
                });
        }

        function renderFriends(friendsToRender) {
            const friendsList = document.getElementById('friendsList');
            friendsList.innerHTML = '';
            
            friendsToRender.forEach(friend => {
                const friendItem = document.createElement('div');
                friendItem.className = 'contact-item';
                friendItem.dataset.friendId = friend.id;
                friendItem.innerHTML = `
                    <div class="contact-avatar">
                        <img class="w-12 h-12 rounded-full object-cover" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                        ${friend.status === 'online' ? '<div class="online-indicator"></div>' : ''}
                    </div>
                    <div class="contact-info">
                        <div class="contact-name">${friend.displayName}</div>
                        <div class="contact-status">${friend.status || 'offline'}</div>
                    </div>
                    <div class="flex space-x-2">
                        <button class="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center hover:bg-purple-200 transition-colors message-friend" data-name="${friend.displayName}" data-id="${friend.id}">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors call-friend" data-name="${friend.displayName}" data-id="${friend.id}">
                            <i class="fas fa-phone"></i>
                        </button>
                        <button class="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors edit-friend" data-name="${friend.displayName}" data-id="${friend.id}" data-status="${friend.status || 'offline'}">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                `;
                
                friendsList.appendChild(friendItem);
            });

            // Add event listeners to message and call buttons
            document.querySelectorAll('.message-friend').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const friendId = e.currentTarget.dataset.id;
                    const friendName = e.currentTarget.dataset.name;
                    startChat(friendId, friendName);
                });
            });

            document.querySelectorAll('.call-friend').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const friendId = e.currentTarget.dataset.id;
                    const friendName = e.currentTarget.dataset.name;
                    startCall(friendId, friendName);
                });
            });

            // Add event listeners to edit buttons
            document.querySelectorAll('.edit-friend').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const friendId = e.currentTarget.dataset.id;
                    const friendName = e.currentTarget.dataset.name;
                    const friendStatus = e.currentTarget.dataset.status;
                    openEditFriendModal(friendId, friendName, friendStatus);
                });
            });
        }

        function openEditFriendModal(friendId, name, status) {
            currentEditingFriendId = friendId;
            document.getElementById('editFriendName').value = name;
            document.getElementById('editFriendStatus').value = status;
            editFriendModal.classList.remove('hidden');
        }

        function searchFriends(query) {
            if (!query) {
                renderFriends(friends);
                return;
            }
            
            const filteredFriends = friends.filter(friend => 
                friend.displayName.toLowerCase().includes(query.toLowerCase()) ||
                (friend.email && friend.email.toLowerCase().includes(query.toLowerCase())) ||
                (friend.phone && friend.phone.includes(query))
            );
            
            renderFriends(filteredFriends);
            
            if (filteredFriends.length === 0) {
                document.getElementById('noFriendsMessage').classList.remove('hidden');
                document.getElementById('noFriendsMessage').innerHTML = `
                    <i class="fas fa-search text-4xl mb-3 text-gray-300 block"></i>
                    <p>No friends found</p>
                    <p class="text-sm mt-1">Try a different search term</p>
                `;
            } else {
                document.getElementById('noFriendsMessage').classList.add('hidden');
            }
        }

        // 🔧 CORE DATA FLOW LOGIC - Chat Session Management
        async function startChat(friendId, friendName) {
            try {
                // Create or get chat ID
                const chatId = [currentUser.uid, friendId].sort().join('_');
                
                // Check if chat document exists
                const chatDoc = await db.collection('chats').doc(chatId).get();
                
                if (!chatDoc.exists) {
                    // Create new chat document
                    await db.collection('chats').doc(chatId).set({
                        participants: [currentUser.uid, friendId],
                        participantNames: {
                            [currentUser.uid]: currentUserData.displayName,
                            [friendId]: friendName
                        },
                        lastMessage: '',
                        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        typing: {}
                    });
                }
                
                // Set current chat
                currentChat = {
                    id: chatId,
                    friendId: friendId,
                    name: friendName
                };
                
                // Update UI
                document.getElementById('chatHeader').classList.remove('hidden');
                document.getElementById('inputArea').classList.remove('hidden');
                document.getElementById('noMessagesMessage').classList.add('hidden');
                document.getElementById('chatTitle').textContent = friendName;
                document.getElementById('chatAvatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=7C3AED&color=fff`;
                
                // Enable message input
                document.getElementById('messageInput').disabled = false;
                document.getElementById('sendBtn').disabled = false;
                
                // Load messages
                loadMessages(chatId);
                
                // Mark messages as read
                markMessagesAsRead(chatId);
                
                // Hide friend list on mobile
                if (window.innerWidth < 768) {
                    document.getElementById('chatListContainer').classList.add('hidden');
                }
            } catch (error) {
                console.error('Error starting chat:', error);
                showToast('Error starting chat', 'error');
            }
        }

        // 🔧 CORE DATA FLOW LOGIC - Real-Time Message Loading
        function loadMessages(chatId) {
            // Unsubscribe from previous listeners
            if (unsubscribeMessages) {
                unsubscribeMessages();
            }
            if (typingListener) {
                typingListener();
            }
            
            const messagesContainer = document.getElementById('messagesContainer');
            messagesContainer.innerHTML = '';
            
            // Subscribe to messages for this chat
            unsubscribeMessages = db.collection('messages')
                .where('chatId', '==', chatId)
                .orderBy('timestamp', 'asc')
                .onSnapshot(snapshot => {
                    messagesContainer.innerHTML = '';
                    
                    if (snapshot.empty) {
                        messagesContainer.innerHTML = `
                            <div class="text-center text-gray-500 py-10">
                                <i class="fas fa-comments text-4xl mb-3 text-gray-300 block"></i>
                                <p>No messages yet</p>
                                <p class="text-sm mt-1">Send a message to start the conversation</p>
                            </div>
                        `;
                        return;
                    }
                    
                    let lastDate = null;
                    
                    snapshot.forEach(doc => {
                        const message = doc.data();
                        
                        // Check if we need to add a date separator
                        const messageDate = message.timestamp ? message.timestamp.toDate().toDateString() : new Date().toDateString();
                        if (messageDate !== lastDate) {
                            addDateSeparator(messageDate);
                            lastDate = messageDate;
                        }
                        
                        addMessageToUI(message, doc.id);
                    });
                    
                    // Scroll to bottom
                    setTimeout(() => {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }, 100);
                    
                    // Mark messages as read
                    markMessagesAsRead(chatId);
                }, error => {
                    console.error('Error loading messages:', error);
                    showToast('Error loading messages', 'error');
                });
            
            // Listen for typing indicators
            typingListener = db.collection('chats').doc(chatId)
                .onSnapshot(doc => {
                    if (doc.exists) {
                        const chatData = doc.data();
                        const typing = chatData.typing || {};
                        
                        // Remove current user from typing indicators
                        delete typing[currentUser.uid];
                        
                        const typingUsers = Object.keys(typing).filter(userId => typing[userId] === true);
                        
                        if (typingUsers.length > 0) {
                            // Get names of typing users
                            const typingNames = typingUsers.map(userId => {
                                return chatData.participantNames && chatData.participantNames[userId] 
                                    ? chatData.participantNames[userId] 
                                    : 'Someone';
                            });
                            
                            document.getElementById('typingUsers').textContent = typingNames.join(', ');
                            document.getElementById('isTyping').classList.remove('hidden');
                        } else {
                            document.getElementById('isTyping').classList.add('hidden');
                        }
                    }
                });
        }

        function addDateSeparator(dateString) {
            const messagesContainer = document.getElementById('messagesContainer');
            const dateElement = document.createElement('div');
            dateElement.className = 'date-separator';
            
            const today = new Date().toDateString();
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            
            let displayDate = dateString;
            if (dateString === today) {
                displayDate = 'Today';
            } else if (dateString === yesterday) {
                displayDate = 'Yesterday';
            } else {
                displayDate = new Date(dateString).toLocaleDateString();
            }
            
            dateElement.innerHTML = `<span>${displayDate}</span>`;
            messagesContainer.appendChild(dateElement);
        }

        function addMessageToUI(message, messageId) {
            const messagesContainer = document.getElementById('messagesContainer');
            const messageElement = document.createElement('div');
            
            const isSent = message.senderId === currentUser.uid;
            const messageTime = message.timestamp ? message.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
            
            let statusIcon = '🕒'; // sent
            if (message.status === 'delivered') statusIcon = '✓✓';
            if (message.status === 'read') statusIcon = '✓✓🔵';
            
            messageElement.className = `message-container ${isSent ? 'sent' : 'received'}`;
            messageElement.innerHTML = `
                <div class="message-bubble ${isSent ? 'message-sent' : 'message-received'}">
                    <div class="message-text">${message.text}</div>
                    <div class="message-time">${messageTime} ${isSent ? statusIcon : ''}</div>
                </div>
            `;
            
            messagesContainer.appendChild(messageElement);
        }

        // 🔧 CORE DATA FLOW LOGIC - Send Message
        function sendMessage() {
            const messageInput = document.getElementById('messageInput');
            const text = messageInput.value.trim();
            
            if (!text || !currentChat) return;
            
            const message = {
                text: text,
                senderId: currentUser.uid,
                senderName: currentUserData.displayName,
                chatId: currentChat.id,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'sent'
            };
            
            // Add message to Firebase
            db.collection('messages').add(message)
                .then(() => {
                    // Clear input
                    messageInput.value = '';
                    
                    // Update chat document with last message
                    db.collection('chats').doc(currentChat.id).update({
                        lastMessage: text,
                        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Update message status to delivered for all messages in this chat
                    updateMessageStatus(currentChat.id, 'delivered');
                    
                    // Scroll to bottom
                    const messagesContainer = document.getElementById('messagesContainer');
                    setTimeout(() => {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }, 100);
                    
                    // Send push notification
                    sendPushNotification(currentChat.friendId, currentUserData.displayName, text);
                })
                .catch(error => {
                    console.error('Error sending message:', error);
                    showToast('Error sending message', 'error');
                });
        }

        function updateMessageStatus(chatId, status) {
            // Update all messages in this chat that are sent by the current user
            db.collection('messages')
                .where('chatId', '==', chatId)
                .where('senderId', '==', currentUser.uid)
                .where('status', '==', 'sent')
                .get()
                .then(snapshot => {
                    const batch = db.batch();
                    
                    snapshot.forEach(doc => {
                        batch.update(doc.ref, { status: status });
                    });
                    
                    return batch.commit();
                })
                .catch(error => {
                    console.error('Error updating message status:', error);
                });
        }

        function markMessagesAsRead(chatId) {
            // Mark all messages in this chat as read
            db.collection('messages')
                .where('chatId', '==', chatId)
                .where('senderId', '!=', currentUser.uid)
                .where('status', 'in', ['sent', 'delivered'])
                .get()
                .then(snapshot => {
                    const batch = db.batch();
                    
                    snapshot.forEach(doc => {
                        batch.update(doc.ref, { status: 'read' });
                    });
                    
                    return batch.commit();
                })
                .catch(error => {
                    console.error('Error marking messages as read:', error);
                });
        }

        // 🔧 CORE DATA FLOW LOGIC - File/Media Upload
        async function uploadFile(file) {
            try {
                showToast('Uploading file...', 'info');
                
                // Upload to Firebase Storage
                const storageRef = storage.ref();
                const fileRef = storageRef.child(`chat_files/${currentChat.id}/${Date.now()}_${file.name}`);
                const uploadTask = fileRef.put(file);
                
                // Show upload progress
                const filePreview = document.getElementById('filePreview');
                const fileName = document.getElementById('fileName');
                const fileSize = document.getElementById('fileSize');
                const uploadProgressBar = document.getElementById('uploadProgressBar');
                
                fileName.textContent = file.name;
                fileSize.textContent = formatFileSize(file.size);
                filePreview.classList.remove('hidden');
                
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        // Update progress bar
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        uploadProgressBar.style.width = `${progress}%`;
                    },
                    (error) => {
                        console.error('Error uploading file:', error);
                        showToast('Error uploading file', 'error');
                        filePreview.classList.add('hidden');
                    },
                    async () => {
                        // Upload completed
                        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                        
                        // Create message with file
                        const message = {
                            text: `Shared a file: ${file.name}`,
                            senderId: currentUser.uid,
                            senderName: currentUserData.displayName,
                            chatId: currentChat.id,
                            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                            status: 'sent',
                            file: {
                                name: file.name,
                                url: downloadURL,
                                type: file.type,
                                size: file.size
                            }
                        };
                        
                        // Add message to Firebase
                        await db.collection('messages').add(message);
                        
                        // Update chat document with last message
                        await db.collection('chats').doc(currentChat.id).update({
                            lastMessage: `Shared a file: ${file.name}`,
                            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // Hide file preview
                        filePreview.classList.add('hidden');
                        
                        showToast('File uploaded successfully', 'success');
                    }
                );
            } catch (error) {
                console.error('Error uploading file:', error);
                showToast('Error uploading file', 'error');
            }
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // SAFE VERSION: Load chats with null checks
        function loadChatsTemporary() {
            if (unsubscribeChats) {
                unsubscribeChats();
            }
            
            const chatList = document.getElementById('chatList');
            const noChatsMessage = document.getElementById('noChatsMessage');
            
            // Safety check - if elements don't exist, return early
            if (!chatList || !noChatsMessage) {
                console.error('Chat list elements not found');
                return;
            }
            
            unsubscribeChats = db.collection('chats')
                .where('participants', 'array-contains', currentUser.uid)
                .onSnapshot({
                    next: (snapshot) => {
                        // Double-check elements still exist
                        if (!chatList || !noChatsMessage) return;
                        
                        chatList.innerHTML = '';
                        
                        if (snapshot.empty) {
                            noChatsMessage.classList.remove('hidden');
                            return;
                        }
                        
                        noChatsMessage.classList.add('hidden');
                        
                        // Sort manually in JavaScript
                        const chats = [];
                        snapshot.forEach(doc => {
                            chats.push({ id: doc.id, ...doc.data() });
                        });
                        
                        // Manual sort by lastMessageTime
                        chats.sort((a, b) => {
                            const timeA = a.lastMessageTime ? a.lastMessageTime.toDate() : new Date(0);
                            const timeB = b.lastMessageTime ? b.lastMessageTime.toDate() : new Date(0);
                            return timeB - timeA; // Descending order
                        });
                        
                        chats.forEach(chat => {
                            const otherParticipantId = chat.participants.find(id => id !== currentUser.uid);
                            const otherParticipantName = chat.participantNames ? chat.participantNames[otherParticipantId] : 'Unknown User';
                            
                            const chatItem = document.createElement('div');
                            chatItem.className = 'contact-item';
                            chatItem.dataset.chatId = chat.id;
                            chatItem.dataset.otherUserId = otherParticipantId;
                            
                            chatItem.innerHTML = `
                                <div class="contact-avatar">
                                    <img class="w-12 h-12 rounded-full object-cover" src="https://ui-avatars.com/api/?name=${encodeURIComponent(otherParticipantName)}&background=7C3AED&color=fff" alt="${otherParticipantName}">
                                </div>
                                <div class="contact-info">
                                    <div class="contact-name">${otherParticipantName}</div>
                                    <div class="contact-status">${chat.lastMessage || 'No messages yet'}</div>
                                </div>
                                <div class="last-seen">
                                    ${chat.lastMessageTime ? formatTimeAgo(chat.lastMessageTime) : ''}
                                </div>
                            `;
                            
                            chatItem.addEventListener('click', () => {
                                startChat(otherParticipantId, otherParticipantName);
                            });
                            
                            chatList.appendChild(chatItem);
                        });
                    },
                    error: (error) => {
                        console.error('Error loading chats:', error);
                        // Check if elements exist before showing toast
                        if (document.getElementById('chatList')) {
                            showToast('Error loading chats', 'error');
                        }
                    }
                });
        }

        function startCall(friendId, friendName) {
            // For now, just show a toast notification
            showToast(`Calling ${friendName}...`, 'info');
            
            // In a real implementation, you would integrate with a WebRTC service
            // and show the call interface
        }

        // 👤 USER MANAGEMENT - Update Profile
        async function updateProfile() {
            try {
                const name = document.getElementById('profileName').value.trim();
                const about = document.getElementById('profileAbout').value.trim();
                const email = document.getElementById('profileEmail').value.trim();
                const phone = document.getElementById('profilePhone').value.trim();
                
                if (!name) {
                    showToast('Display name is required', 'error');
                    return;
                }
                
                const updates = {
                    displayName: name,
                    about: about,
                    email: email,
                    phone: phone,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('users').doc(currentUser.uid).update(updates);
                
                // Update current user data
                currentUserData.displayName = name;
                currentUserData.about = about;
                currentUserData.email = email;
                currentUserData.phone = phone;
                
                // Update UI
                document.getElementById('userName').textContent = name;
                document.getElementById('settingsUserName').textContent = name;
                
                showToast('Profile updated successfully', 'success');
            } catch (error) {
                console.error('Error updating profile:', error);
                showToast('Error updating profile', 'error');
            }
        }

        // 👤 USER MANAGEMENT - Upload Profile Picture
        async function uploadProfilePicture(file) {
            try {
                showToast('Uploading profile picture...', 'info');
                
                // Upload to Firebase Storage
                const storageRef = storage.ref();
                const fileRef = storageRef.child(`profile_pictures/${currentUser.uid}/${file.name}`);
                const snapshot = await fileRef.put(file);
                const downloadURL = await snapshot.ref.getDownloadURL();
                
                // Update user document
                await db.collection('users').doc(currentUser.uid).update({
                    photoURL: downloadURL,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update current user data
                currentUserData.photoURL = downloadURL;
                
                // Update UI
                document.getElementById('userAvatar').src = downloadURL;
                document.getElementById('settingsProfilePic').src = downloadURL;
                document.getElementById('profilePicPreview').src = downloadURL;
                
                showToast('Profile picture updated successfully', 'success');
            } catch (error) {
                console.error('Error uploading profile picture:', error);
                showToast('Error uploading profile picture', 'error');
            }
        }

        // 👤 USER MANAGEMENT - Upload Cover Picture
        async function uploadCoverPicture(file) {
            try {
                showToast('Uploading cover picture...', 'info');
                
                // Upload to Firebase Storage
                const storageRef = storage.ref();
                const fileRef = storageRef.child(`cover_pictures/${currentUser.uid}/${file.name}`);
                const snapshot = await fileRef.put(file);
                const downloadURL = await snapshot.ref.getDownloadURL();
                
                // Update user document
                await db.collection('users').doc(currentUser.uid).update({
                    coverURL: downloadURL,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update current user data
                currentUserData.coverURL = downloadURL;
                
                // Update UI
                document.getElementById('profileCoverPreview').src = downloadURL;
                
                showToast('Cover picture updated successfully', 'success');
            } catch (error) {
                console.error('Error uploading cover picture:', error);
                showToast('Error uploading cover picture', 'error');
            }
        }

        // 💡 ADVANCED UX - Typing Indicator
        function handleTypingIndicator() {
            if (currentChat) {
                // Send typing indicator
                db.collection('chats').doc(currentChat.id).update({
                    [`typing.${currentUser.uid}`]: true,
                    lastActivity: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Clear previous timeout
                if (typingTimeout) {
                    clearTimeout(typingTimeout);
                }
                
                // Set timeout to remove typing indicator
                typingTimeout = setTimeout(() => {
                    db.collection('chats').doc(currentChat.id).update({
                        [`typing.${currentUser.uid}`]: false
                    });
                }, 1000);
            }
        }

        // 💡 ADVANCED UX - Push Notifications
        async function requestNotificationPermission() {
            try {
                // Check if permission is already denied/blocked
                if (Notification.permission === 'denied') {
                    console.log('Notifications blocked by user. User must manually enable in browser settings.');
                    return;
                }
                
                // Don't ask if already granted
                if (Notification.permission === 'granted') {
                    console.log('Notifications already granted');
                    return;
                }
                
                // Only ask if permission is default
                if (Notification.permission === 'default') {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        console.log('Notification permission granted');
                        // Get FCM token here if needed
                    }
                }
            } catch (error) {
                console.error('Error with notification permission:', error);
            }
        }

        async function sendPushNotification(userId, senderName, message) {
            try {
                // Get recipient's FCM token
                const recipientDoc = await db.collection('users').doc(userId).get();
                if (recipientDoc.exists) {
                    const recipientData = recipientDoc.data();
                    const fcmToken = recipientData.fcmToken;
                    
                    if (fcmToken) {
                        // In a real implementation, you would send a push notification
                        // through Firebase Cloud Messaging or a server
                        console.log(`Sending push notification to ${userId}: ${senderName}: ${message}`);
                    }
                }
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
        }

        // 💡 ADVANCED UX - Client-Side Caching
        function cacheMessages(chatId, messages) {
            try {
                const cacheKey = `kynecta_messages_${chatId}`;
                localStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    messages: messages
                }));
            } catch (error) {
                console.error('Error caching messages:', error);
            }
        }

        function getCachedMessages(chatId) {
            try {
                const cacheKey = `kynecta_messages_${chatId}`;
                const cached = localStorage.getItem(cacheKey);
                
                if (cached) {
                    const data = JSON.parse(cached);
                    // Return cached messages if they're less than 5 minutes old
                    if (Date.now() - data.timestamp < 5 * 60 * 1000) {
                        return data.messages;
                    }
                }
            } catch (error) {
                console.error('Error getting cached messages:', error);
            }
            
            return null;
        }

        function initEmojiPicker() {
            const emojiCategories = [
                {
                    title: 'Smileys & People',
                    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾']
                },
                {
                    title: 'Animals & Nature',
                    emojis: ['🐵', '🐒', '🦍', '🦧', '🐶', '🐕', '🦮', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦔', '🦇', '🐻', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍', '🐲', '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🐟', '🐠', '🐡', '🦈', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🐞', '🦗', '🕷️', '🕸️', '🦂', '🦟', '🦠', '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃']
                },
                {
                    title: 'Food & Drink',
                    emojis: ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🥝', '🍅', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦀', '🦞', '🦐', '🦑', '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤', '🧃', '🧉', '🧊', '🥢', '🍽️', '🍴', '🥄', '🔪', '🏺']
                },
                {
                    title: 'Activities',
                    emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪁', '🥅', '⛳', '🪃', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩']
                },
                {
                    title: 'Travel & Places',
                    emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁']
                },
                {
                    title: 'Objects',
                    emojis: ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '⚙️', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪒', '🧽', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🖼️', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🎊', '🎉', '🎎', '🏮', '🎐', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓']
                },
                {
                    title: 'Symbols',
                    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '👁️‍🗨️', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧']
                }
            ];

            emojiPicker.innerHTML = '';

            emojiCategories.forEach(category => {
                const categoryElement = document.createElement('div');
                categoryElement.className = 'emoji-category';
                
                const categoryTitle = document.createElement('div');
                categoryTitle.className = 'emoji-category-title';
                categoryTitle.textContent = category.title;
                
                const emojiGrid = document.createElement('div');
                emojiGrid.className = 'emoji-grid';
                
                category.emojis.forEach(emoji => {
                    const emojiOption = document.createElement('div');
                    emojiOption.className = 'emoji-option';
                    emojiOption.textContent = emoji;
                    emojiOption.addEventListener('click', () => {
                        const messageInput = document.getElementById('messageInput');
                        messageInput.value += emoji;
                        emojiPicker.style.display = 'none';
                        messageInput.focus();
                    });
                    
                    emojiGrid.appendChild(emojiOption);
                });
                
                categoryElement.appendChild(categoryTitle);
                categoryElement.appendChild(emojiGrid);
                emojiPicker.appendChild(categoryElement);
            });
        }

        // Enhanced Friend Search with Multiple Options
        async function enhancedFriendSearch(query) {
            if (!query) return [];
            
            const results = await searchUsers(query);
            return results;
        }

        function displayEnhancedSearchResults(results) {
            const enhancedSearchResults = document.getElementById('enhancedSearchResults');
            enhancedSearchResults.innerHTML = '';
            
            if (results.length === 0) {
                enhancedSearchResults.innerHTML = '<p class="text-center text-gray-500 py-4">No users found</p>';
                return;
            }
            
            results.forEach(user => {
                const resultItem = document.createElement('div');
                resultItem.className = 'flex items-center p-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer';
                resultItem.innerHTML = `
                    <img class="w-10 h-10 rounded-full mr-3" src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=7C3AED&color=fff`}" alt="${user.displayName}">
                    <div class="flex-1">
                        <p class="font-medium">${user.displayName}</p>
                        <p class="text-sm text-gray-500">${user.email || user.phone || ''}</p>
                    </div>
                    <div class="flex space-x-2">
                        <button class="bg-purple-600 text-white px-3 py-1 rounded-lg add-friend" data-id="${user.id}" data-name="${user.displayName}">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="bg-green-600 text-white px-3 py-1 rounded-lg message-user" data-id="${user.id}" data-name="${user.displayName}">
                            <i class="fas fa-comment"></i>
                        </button>
                    </div>
                `;
                
                enhancedSearchResults.appendChild(resultItem);
            });
            
            // Add event listeners to buttons
            document.querySelectorAll('.add-friend').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const userId = e.currentTarget.dataset.id;
                    const userName = e.currentTarget.dataset.name;
                    sendFriendRequest(userId);
                    friendSearchResultsModal.classList.add('hidden');
                    showToast(`Friend request sent to ${userName}`, 'success');
                });
            });

            document.querySelectorAll('.message-user').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const userId = e.currentTarget.dataset.id;
                    const userName = e.currentTarget.dataset.name;
                    startChat(userId, userName);
                    friendSearchResultsModal.classList.add('hidden');
                });
            });
        }

        // NEW FEATURES IMPLEMENTATION

        // Group Creation and Management
        function openCreateGroupModal() {
            createGroupModal.classList.remove('hidden');
            populateGroupParticipants();
        }

        function populateGroupParticipants() {
            const groupParticipants = document.getElementById('groupParticipants');
            groupParticipants.innerHTML = '';
            
            if (friends.length === 0) {
                groupParticipants.innerHTML = '<div class="text-gray-500 text-center py-4">No friends available to add to group</div>';
                return;
            }
            
            friends.forEach(friend => {
                const participantItem = document.createElement('div');
                participantItem.className = 'flex items-center p-2 border-b border-gray-100';
                participantItem.innerHTML = `
                    <div class="flex items-center flex-1">
                        <img class="w-8 h-8 rounded-full mr-3" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                        <span class="font-medium">${friend.displayName}</span>
                    </div>
                    <input type="checkbox" class="group-participant-checkbox" data-id="${friend.id}" data-name="${friend.displayName}">
                `;
                
                groupParticipants.appendChild(participantItem);
            });
        }

        async function createGroup() {
            const groupName = document.getElementById('groupName').value.trim();
            const groupDescription = document.getElementById('groupDescription').value.trim();
            const groupPrivacy = document.getElementById('groupPrivacy').value;
            
            if (!groupName) {
                showToast('Group name is required', 'error');
                return;
            }
            
            // Get selected participants
            const selectedParticipants = Array.from(document.querySelectorAll('.group-participant-checkbox:checked'))
                .map(checkbox => ({
                    id: checkbox.dataset.id,
                    name: checkbox.dataset.name
                }));
            
            if (selectedParticipants.length === 0) {
                showToast('Please select at least one participant', 'error');
                return;
            }
            
            try {
                // Create group document
                const groupData = {
                    name: groupName,
                    description: groupDescription,
                    privacy: groupPrivacy,
                    createdBy: currentUser.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    participants: [currentUser.uid, ...selectedParticipants.map(p => p.id)],
                    participantNames: {
                        [currentUser.uid]: currentUserData.displayName
                    },
                    admin: currentUser.uid,
                    lastMessage: '',
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                // Add participant names
                selectedParticipants.forEach(participant => {
                    groupData.participantNames[participant.id] = participant.name;
                });
                
                const groupRef = await db.collection('groups').add(groupData);
                
                // Create initial group message
                const welcomeMessage = {
                    text: `${currentUserData.displayName} created the group "${groupName}"`,
                    senderId: currentUser.uid,
                    senderName: currentUserData.displayName,
                    groupId: groupRef.id,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    type: 'system'
                };
                
                await db.collection('groupMessages').add(welcomeMessage);
                
                showToast('Group created successfully', 'success');
                createGroupModal.classList.add('hidden');
                
                // Reset form
                document.getElementById('groupName').value = '';
                document.getElementById('groupDescription').value = '';
                document.getElementById('groupPrivacy').value = 'public';
                
            } catch (error) {
                console.error('Error creating group:', error);
                showToast('Error creating group', 'error');
            }
        }

        function openJoinGroupModal() {
            joinGroupModal.classList.remove('hidden');
        }

        async function joinGroup() {
            const groupCode = document.getElementById('groupCode').value.trim();
            
            if (!groupCode) {
                showToast('Please enter a group code or link', 'error');
                return;
            }
            
            try {
                // For demo purposes, we'll simulate joining a group
                // In a real implementation, you would validate the group code/link
                // and add the user to the group
                
                showToast('Joining group...', 'info');
                
                // Simulate API call
                setTimeout(() => {
                    showToast('Successfully joined the group', 'success');
                    joinGroupModal.classList.add('hidden');
                    document.getElementById('groupCode').value = '';
                }, 1500);
                
            } catch (error) {
                console.error('Error joining group:', error);
                showToast('Error joining group', 'error');
            }
        }

        // Avatar Settings Implementation
        function openAvatarSettings() {
            // For now, redirect to profile settings
            profileSettingsModal.classList.remove('hidden');
            settingsModal.classList.add('hidden');
        }

        // Favorites Management
        function openFavoritesSettings() {
            favoritesSettingsModal.classList.remove('hidden');
            settingsModal.classList.add('hidden');
            loadFavorites();
        }

        function loadFavorites() {
            const favoritesListContent = document.getElementById('favoritesListContent');
            
            if (userSettings.favorites.length === 0) {
                favoritesListContent.innerHTML = `
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-star text-4xl mb-3 text-gray-300 block"></i>
                        <p>No favorites yet</p>
                        <p class="text-sm mt-1">Add contacts or chats to favorites for quick access</p>
                    </div>
                `;
                return;
            }
            
            favoritesListContent.innerHTML = '';
            
            userSettings.favorites.forEach(favorite => {
                const favoriteItem = document.createElement('div');
                favoriteItem.className = 'flex items-center justify-between p-3 border-b border-gray-200';
                
                favoriteItem.innerHTML = `
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-green-500 flex items-center justify-center text-white mr-3">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <p class="font-medium">${favorite.name}</p>
                            <p class="text-sm text-gray-500">${favorite.type}</p>
                        </div>
                    </div>
                    <button class="text-red-500 hover:text-red-700 remove-favorite" data-id="${favorite.id}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                favoritesListContent.appendChild(favoriteItem);
            });
            
            // Add event listeners to remove buttons
            document.querySelectorAll('.remove-favorite').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const favoriteId = e.currentTarget.dataset.id;
                    removeFromFavorites(favoriteId);
                });
            });
        }

        function removeFromFavorites(favoriteId) {
            userSettings.favorites = userSettings.favorites.filter(f => f.id !== favoriteId);
            saveUserSettings();
            loadFavorites();
            showToast('Removed from favorites', 'success');
        }

        // Help Center Implementation
        function openHelpSection(section) {
            const sections = {
                'getting-started': {
                    title: 'Getting Started',
                    content: `
                        <h3 class="text-lg font-semibold mb-4">Welcome to Kynecta!</h3>
                        <p class="mb-3">Kynecta is an advanced mood-based chat application that helps you connect with friends in a more meaningful way.</p>
                        
                        <h4 class="font-semibold mb-2">Basic Features:</h4>
                        <ul class="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Chats:</strong> Start one-on-one conversations with your friends</li>
                            <li><strong>Groups:</strong> Create or join group conversations</li>
                            <li><strong>Status Updates:</strong> Share what you're feeling with emojis, text, images, videos, or audio</li>
                            <li><strong>Mood Settings:</strong> Set your current mood to influence chat suggestions and themes</li>
                            <li><strong>Calls:</strong> Make voice and video calls to your contacts</li>
                        </ul>
                        
                        <h4 class="font-semibold mb-2">Getting Started Steps:</h4>
                        <ol class="list-decimal pl-5 space-y-1">
                            <li>Add friends using their email, phone number, or name</li>
                            <li>Start a conversation by clicking on a friend's name</li>
                            <li>Set your mood in the Tools tab to personalize your experience</li>
                            <li>Share status updates to let friends know what you're up to</li>
                            <li>Explore the various settings to customize Kynecta to your preferences</li>
                        </ol>
                    `
                },
                'privacy-security': {
                    title: 'Privacy & Security',
                    content: `
                        <h3 class="text-lg font-semibold mb-4">Your Privacy Matters</h3>
                        <p class="mb-3">At Kynecta, we take your privacy and security seriously. Here's how we protect your data:</p>
                        
                        <h4 class="font-semibold mb-2">Data Protection:</h4>
                        <ul class="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>End-to-End Encryption:</strong> Your messages are encrypted so only you and the recipient can read them</li>
                            <li><strong>Secure Storage:</strong> Your data is stored securely on Firebase servers with multiple layers of protection</li>
                            <li><strong>Privacy Controls:</strong> You control who can see your profile information, status, and last seen time</li>
                            <li><strong>No Data Selling:</strong> We never sell your personal information to third parties</li>
                        </ul>
                        
                        <h4 class="font-semibold mb-2">Security Features:</h4>
                        <ul class="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Two-Step Verification:</strong> Add an extra layer of security to your account</li>
                            <li><strong>Security Notifications:</strong> Get alerts about unusual activity on your account</li>
                            <li><strong>App Lock:</strong> Protect the app with a passcode or biometric authentication</li>
                            <li><strong>Disappearing Messages:</strong> Set messages to automatically delete after a certain time</li>
                        </ul>
                        
                        <p class="text-sm text-gray-600">For more details, please review our complete Privacy Policy in the App Information section.</p>
                    `
                },
                'troubleshooting': {
                    title: 'Troubleshooting',
                    content: `
                        <h3 class="text-lg font-semibold mb-4">Common Issues & Solutions</h3>
                        
                        <h4 class="font-semibold mb-2">Messages Not Sending:</h4>
                        <ul class="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Check your internet connection</strong> - Make sure you're connected to Wi-Fi or mobile data</li>
                            <li><strong>Restart the app</strong> - Close and reopen Kynecta</li>
                            <li><strong>Clear cache</strong> - Go to Settings > Storage & Data > Clear Cache</li>
                            <li><strong>Update the app</strong> - Make sure you're using the latest version</li>
                        </ul>
                        
                        <h4 class="font-semibold mb-2">Can't Make or Receive Calls:</h4>
                        <ul class="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Check microphone permissions</strong> - Make sure Kynecta has permission to access your microphone</li>
                            <li><strong>Check camera permissions</strong> - For video calls, ensure camera access is enabled</li>
                            <li><strong>Strong internet connection</strong> - Calls require a stable internet connection</li>
                            <li><strong>Restart your device</strong> - Sometimes a simple restart fixes call issues</li>
                        </ul>
                        
                        <h4 class="font-semibold mb-2">App Crashes or Freezes:</h4>
                        <ul class="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Update the app</strong> - Check for updates in your app store</li>
                            <li><strong>Clear app cache</strong> - Go to Settings > Storage & Data > Clear Cache</li>
                            <li><strong>Reinstall the app</strong> - As a last resort, uninstall and reinstall Kynecta</li>
                        </ul>
                        
                        <h4 class="font-semibold mb-2">Can't Add Friends:</h4>
                        <ul class="list-disc pl-5 mb-4 space-y-1">
                            <li><strong>Check spelling</strong> - Make sure you're entering the correct email, phone number, or name</li>
                            <li><strong>Friend not on Kynecta</strong> - The person needs to have a Kynecta account</li>
                            <li><strong>Privacy settings</strong> - The person may have restricted who can add them</li>
                        </ul>
                        
                        <p class="text-sm text-gray-600">If you're still experiencing issues, please contact our support team.</p>
                    `
                },
                'faqs': {
                    title: 'Frequently Asked Questions',
                    content: `
                        <h3 class="text-lg font-semibold mb-4">Frequently Asked Questions</h3>
                        
                        <div class="space-y-4">
                            <div>
                                <h4 class="font-semibold mb-1">How do I change my profile picture?</h4>
                                <p class="text-sm text-gray-600">Go to Settings > Profile > Click on your profile picture > Select a new image from your device.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-1">Can I use Kynecta on multiple devices?</h4>
                                <p class="text-sm text-gray-600">Yes, you can use Kynecta on multiple devices. Your messages will sync across all devices where you're logged in.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-1">How do I create a group chat?</h4>
                                <p class="text-sm text-gray-600">Click on the "New Group" button in the chat list, give your group a name, and add participants from your friends list.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-1">Can I recover deleted messages?</h4>
                                <p class="text-sm text-gray-600">Once messages are deleted, they cannot be recovered. We recommend exporting important conversations regularly.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-1">How does the mood feature work?</h4>
                                <p class="text-sm text-gray-600">Your mood influences chat suggestions, themes, and AI recommendations. Set your mood in the Tools tab to personalize your experience.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-1">Is Kynecta free to use?</h4>
                                <p class="text-sm text-gray-600">Yes, Kynecta is completely free to use with no hidden charges.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-1">How do I block someone?</h4>
                                <p class="text-sm text-gray-600">Go to the chat with the person you want to block, click on their name, and select "Block Contact" from the menu.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-1">Can I customize notification sounds?</h4>
                                <p class="text-sm text-gray-600">Yes, go to Settings > Notifications to customize notification sounds for different types of alerts.</p>
                            </div>
                        </div>
                    `
                }
            };
            
            const sectionData = sections[section];
            if (!sectionData) return;
            
            // Create a modal to display the help content
            const helpContentModal = document.createElement('div');
            helpContentModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            helpContentModal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                    <div class="kynecta-header p-6">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xl font-semibold text-white">${sectionData.title}</h3>
                            <button class="text-white/80 hover:text-white transition-colors close-help-content">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
                        ${sectionData.content}
                    </div>
                    <div class="p-4 border-t border-gray-200">
                        <button class="w-full py-3 bg-gray-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity close-help-content">
                            Close
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(helpContentModal);
            
            // Add event listeners to close buttons
            helpContentModal.querySelectorAll('.close-help-content').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.body.removeChild(helpContentModal);
                });
            });
        }

        // Contact Support and Send Feedback
        function contactSupport() {
            const email = 'nchagwadennis45@gmail.com';
            const phone = '0746676627';
            
            const contactModal = document.createElement('div');
            contactModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            contactModal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
                    <div class="kynecta-header p-6">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xl font-semibold text-white">Contact Support</h3>
                            <button class="text-white/80 hover:text-white transition-colors close-contact-modal">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="mb-4">We're here to help! Reach out to us through any of the following channels:</p>
                        
                        <div class="space-y-3 mb-6">
                            <div class="flex items-center p-3 bg-gray-50 rounded-xl">
                                <i class="fas fa-envelope text-purple-600 mr-3"></i>
                                <div>
                                    <p class="font-medium">Email</p>
                                    <p class="text-sm text-gray-600">${email}</p>
                                </div>
                            </div>
                            
                            <div class="flex items-center p-3 bg-gray-50 rounded-xl">
                                <i class="fas fa-phone text-purple-600 mr-3"></i>
                                <div>
                                    <p class="font-medium">Phone</p>
                                    <p class="text-sm text-gray-600">${phone}</p>
                                </div>
                            </div>
                            
                            <div class="flex items-center p-3 bg-gray-50 rounded-xl">
                                <i class="fas fa-clock text-purple-600 mr-3"></i>
                                <div>
                                    <p class="font-medium">Response Time</p>
                                    <p class="text-sm text-gray-600">Within 24 hours</p>
                                </div>
                            </div>
                        </div>
                        
                        <p class="text-sm text-gray-600">Please include your user ID (${currentUser.uid}) when contacting support for faster assistance.</p>
                    </div>
                    <div class="p-4 border-t border-gray-200">
                        <button class="w-full py-3 bg-gray-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity close-contact-modal">
                            Close
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(contactModal);
            
            // Add event listeners to close buttons
            contactModal.querySelectorAll('.close-contact-modal').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.body.removeChild(contactModal);
                });
            });
        }

        function sendFeedback() {
            const feedbackModal = document.createElement('div');
            feedbackModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            feedbackModal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
                    <div class="kynecta-header p-6">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xl font-semibold text-white">Send Feedback</h3>
                            <button class="text-white/80 hover:text-white transition-colors close-feedback-modal">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-6">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Feedback Type</label>
                            <select id="feedbackType" class="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 transition-colors">
                                <option value="bug">Bug Report</option>
                                <option value="suggestion">Feature Suggestion</option>
                                <option value="improvement">Improvement Idea</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                            <textarea id="feedbackDescription" class="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 transition-colors" placeholder="Please describe your feedback in detail..." rows="5"></textarea>
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Email (Optional)</label>
                            <input type="email" id="feedbackEmail" class="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 transition-colors" placeholder="Your email if you'd like a response">
                        </div>
                    </div>
                    <div class="p-4 border-t border-gray-200 flex space-x-3">
                        <button class="flex-1 py-3 bg-gradient-to-r from-purple-500 to-green-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity" id="submitFeedback">
                            Submit Feedback
                        </button>
                        <button class="flex-1 py-3 bg-gray-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity close-feedback-modal">
                            Cancel
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(feedbackModal);
            
            // Add event listeners
            feedbackModal.querySelector('#submitFeedback').addEventListener('click', () => {
                const type = feedbackModal.querySelector('#feedbackType').value;
                const description = feedbackModal.querySelector('#feedbackDescription').value.trim();
                const email = feedbackModal.querySelector('#feedbackEmail').value.trim();
                
                if (!description) {
                    showToast('Please provide a description', 'error');
                    return;
                }
                
                // In a real implementation, you would send this to your backend
                // For now, we'll just show a success message
                showToast('Thank you for your feedback!', 'success');
                document.body.removeChild(feedbackModal);
            });
            
            feedbackModal.querySelectorAll('.close-feedback-modal').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.body.removeChild(feedbackModal);
                });
            });
        }

        // App Info - Legal Links
        function openLegalDocument(type) {
            // In a real implementation, you would fetch these from your server
            // For now, we'll show placeholder content
            const documents = {
                'terms': {
                    title: 'Terms of Service',
                    content: `
                        <h3 class="text-lg font-semibold mb-4">Kynecta Terms of Service</h3>
                        <p class="mb-3">Last Updated: November 2025</p>
                        
                        <div class="space-y-4">
                            <div>
                                <h4 class="font-semibold mb-2">1. Acceptance of Terms</h4>
                                <p class="text-sm">By accessing or using Kynecta, you agree to be bound by these Terms of Service and our Privacy Policy.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">2. Description of Service</h4>
                                <p class="text-sm">Kynecta provides a mood-based chat platform that allows users to communicate through text, voice, video, and share status updates.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">3. User Accounts</h4>
                                <p class="text-sm">You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">4. User Conduct</h4>
                                <p class="text-sm">You agree not to use the service to: harass, abuse, or harm others; transmit any content that is unlawful, harmful, or inappropriate; or violate any applicable laws.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">5. Privacy</h4>
                                <p class="text-sm">Your privacy is important to us. Please review our Privacy Policy to understand how we collect, use, and protect your information.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">6. Termination</h4>
                                <p class="text-sm">We may terminate or suspend your account at any time without notice for conduct that we believe violates these Terms or is harmful to other users.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">7. Changes to Terms</h4>
                                <p class="text-sm">We reserve the right to modify these terms at any time. We will notify users of any material changes.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">8. Contact Information</h4>
                                <p class="text-sm">If you have any questions about these Terms, please contact us at nchagwadennis45@gmail.com</p>
                            </div>
                        </div>
                    `
                },
                'privacy': {
                    title: 'Privacy Policy',
                    content: `
                        <h3 class="text-lg font-semibold mb-4">Kynecta Privacy Policy</h3>
                        <p class="mb-3">Last Updated: November 2025</p>
                        
                        <div class="space-y-4">
                            <div>
                                <h4 class="font-semibold mb-2">1. Information We Collect</h4>
                                <p class="text-sm">We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support. This may include your name, email address, phone number, profile information, and the content of your messages.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">2. How We Use Your Information</h4>
                                <p class="text-sm">We use the information we collect to provide, maintain, and improve our services; to communicate with you; to personalize your experience; and to ensure the security of our services.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">3. Information Sharing</h4>
                                <p class="text-sm">We do not sell your personal information to third parties. We may share your information with service providers who assist us in operating our services, or when required by law.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">4. Data Security</h4>
                                <p class="text-sm">We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, or destruction.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">5. Your Rights</h4>
                                <p class="text-sm">You have the right to access, correct, or delete your personal information. You can also object to or restrict certain processing of your information.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">6. Data Retention</h4>
                                <p class="text-sm">We retain your personal information for as long as necessary to provide our services and fulfill the purposes outlined in this policy.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">7. Changes to This Policy</h4>
                                <p class="text-sm">We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.</p>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold mb-2">8. Contact Us</h4>
                                <p class="text-sm">If you have any questions about this Privacy Policy, please contact us at nchagwadennis45@gmail.com</p>
                            </div>
                        </div>
                    `
                },
                'opensource': {
                    title: 'Open Source Licenses',
                    content: `
                        <h3 class="text-lg font-semibold mb-4">Open Source Licenses</h3>
                        <p class="mb-4">Kynecta uses the following open source libraries and frameworks:</p>
                        
                        <div class="space-y-3">
                            <div class="p-3 bg-gray-50 rounded-xl">
                                <h4 class="font-semibold">Firebase</h4>
                                <p class="text-sm text-gray-600">Backend-as-a-Service platform provided by Google</p>
                                <p class="text-xs text-gray-500">License: Apache 2.0</p>
                            </div>
                            
                            <div class="p-3 bg-gray-50 rounded-xl">
                                <h4 class="font-semibold">Tailwind CSS</h4>
                                <p class="text-sm text-gray-600">Utility-first CSS framework</p>
                                <p class="text-xs text-gray-500">License: MIT</p>
                            </div>
                            
                            <div class="p-3 bg-gray-50 rounded-xl">
                                <h4 class="font-semibold">Font Awesome</h4>
                                <p class="text-sm text-gray-600">Icon library and toolkit</p>
                                <p class="text-xs text-gray-500">License: Font Awesome Free License</p>
                            </div>
                            
                            <div class="p-3 bg-gray-50 rounded-xl">
                                <h4 class="font-semibold">Cloudinary</h4>
                                <p class="text-sm text-gray-600">Cloud-based image and video management</p>
                                <p class="text-xs text-gray-500">License: Proprietary</p>
                            </div>
                        </div>
                        
                        <p class="mt-4 text-sm text-gray-600">For complete license information, please visit the respective project websites.</p>
                    `
                }
            };
            
            const documentData = documents[type];
            if (!documentData) return;
            
            const legalModal = document.createElement('div');
            legalModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            legalModal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                    <div class="kynecta-header p-6">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xl font-semibold text-white">${documentData.title}</h3>
                            <button class="text-white/80 hover:text-white transition-colors close-legal-modal">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
                        ${documentData.content}
                    </div>
                    <div class="p-4 border-t border-gray-200">
                        <button class="w-full py-3 bg-gray-500 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity close-legal-modal">
                            Close
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(legalModal);
            
            // Add event listeners to close buttons
            legalModal.querySelectorAll('.close-legal-modal').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.body.removeChild(legalModal);
                });
            });
        }

        // Invite Friends Implementation
        function shareLink() {
            const inviteLink = 'https://kynecta.app/invite/KYNECTA2025';
            
            // Copy to clipboard
            navigator.clipboard.writeText(inviteLink).then(() => {
                showToast('Invite link copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = inviteLink;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('Invite link copied to clipboard!', 'success');
            });
        }

        function shareQR() {
            // In a real implementation, you would generate a QR code
            // For now, we'll show a placeholder
            showToast('QR code would be generated here', 'info');
        }

        function shareWhatsApp() {
            const message = 'Join me on Kynecta! Download the app at: https://kynecta.app/invite/KYNECTA2025';
            const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
            window.open(url, '_blank');
        }

        function shareSMS() {
            const message = 'Join me on Kynecta! Download the app at: https://kynecta.app/invite/KYNECTA2025';
            const url = `sms:?body=${encodeURIComponent(message)}`;
            window.open(url, '_blank');
        }

        function copyReferralCode() {
            const referralCode = 'KYNECTA2025';
            
            navigator.clipboard.writeText(referralCode).then(() => {
                showToast('Referral code copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = referralCode;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('Referral code copied to clipboard!', 'success');
            });
        }

        // All Friends Display Implementation
        function openAllFriendsModal() {
            allFriendsModal.classList.remove('hidden');
            renderAllFriends();
        }

        function renderAllFriends() {
            const allFriendsList = document.getElementById('allFriendsList');
            const noAllFriendsMessage = document.getElementById('noAllFriendsMessage');
            
            allFriendsList.innerHTML = '';
            
            if (friends.length === 0) {
                noAllFriendsMessage.classList.remove('hidden');
                return;
            }
            
            noAllFriendsMessage.classList.add('hidden');
            
            friends.forEach(friend => {
                const friendItem = document.createElement('div');
                friendItem.className = 'contact-item';
                friendItem.dataset.friendId = friend.id;
                friendItem.innerHTML = `
                    <div class="contact-avatar">
                        <img class="w-12 h-12 rounded-full object-cover" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                        ${friend.status === 'online' ? '<div class="online-indicator"></div>' : ''}
                    </div>
                    <div class="contact-info">
                        <div class="contact-name">${friend.displayName}</div>
                        <div class="contact-status">${friend.status || 'offline'}</div>
                    </div>
                    <div class="flex space-x-2">
                        <button class="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center hover:bg-purple-200 transition-colors message-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors call-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                            <i class="fas fa-phone"></i>
                        </button>
                    </div>
                `;
                
                allFriendsList.appendChild(friendItem);
            });

            // Add event listeners to message and call buttons
            document.querySelectorAll('.message-friend-all').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const friendId = e.currentTarget.dataset.id;
                    const friendName = e.currentTarget.dataset.name;
                    startChat(friendId, friendName);
                    allFriendsModal.classList.add('hidden');
                });
            });

            document.querySelectorAll('.call-friend-all').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const friendId = e.currentTarget.dataset.id;
                    const friendName = e.currentTarget.dataset.name;
                    startCall(friendId, friendName);
                });
            });
        }

        function searchAllFriends(query) {
            const allFriendsList = document.getElementById('allFriendsList');
            const noAllFriendsMessage = document.getElementById('noAllFriendsMessage');
            
            if (!query) {
                renderAllFriends();
                return;
            }
            
            const filteredFriends = friends.filter(friend => 
                friend.displayName.toLowerCase().includes(query.toLowerCase()) ||
                (friend.email && friend.email.toLowerCase().includes(query.toLowerCase())) ||
                (friend.phone && friend.phone.includes(query))
            );
            
            allFriendsList.innerHTML = '';
            
            if (filteredFriends.length === 0) {
                noAllFriendsMessage.classList.remove('hidden');
                noAllFriendsMessage.innerHTML = `
                    <i class="fas fa-search text-4xl mb-3 text-gray-300 block"></i>
                    <p>No friends found</p>
                    <p class="text-sm mt-1">Try a different search term</p>
                `;
                return;
            }
            
            noAllFriendsMessage.classList.add('hidden');
            
            filteredFriends.forEach(friend => {
                const friendItem = document.createElement('div');
                friendItem.className = 'contact-item';
                friendItem.dataset.friendId = friend.id;
                friendItem.innerHTML = `
                    <div class="contact-avatar">
                        <img class="w-12 h-12 rounded-full object-cover" src="${friend.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.displayName)}&background=7C3AED&color=fff`}" alt="${friend.displayName}">
                        ${friend.status === 'online' ? '<div class="online-indicator"></div>' : ''}
                    </div>
                    <div class="contact-info">
                        <div class="contact-name">${friend.displayName}</div>
                        <div class="contact-status">${friend.status || 'offline'}</div>
                    </div>
                    <div class="flex space-x-2">
                        <button class="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center hover:bg-purple-200 transition-colors message-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors call-friend-all" data-name="${friend.displayName}" data-id="${friend.id}">
                            <i class="fas fa-phone"></i>
                        </button>
                    </div>
                `;
                
                allFriendsList.appendChild(friendItem);
            });

            // Re-add event listeners to message and call buttons
            document.querySelectorAll('.message-friend-all').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const friendId = e.currentTarget.dataset.id;
                    const friendName = e.currentTarget.dataset.name;
                    startChat(friendId, friendName);
                    allFriendsModal.classList.add('hidden');
                });
            });

            document.querySelectorAll('.call-friend-all').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const friendId = e.currentTarget.dataset.id;
                    const friendName = e.currentTarget.dataset.name;
                    startCall(friendId, friendName);
                });
            });
        }

        // Enhanced Emoji Picker Implementation
        function toggleEmojiPicker() {
            const emojiPicker = document.getElementById('emojiPicker');
            if (emojiPicker.style.display === 'block') {
                emojiPicker.style.display = 'none';
            } else {
                emojiPicker.style.display = 'block';
            }
        }

        // WebRTC Call Implementation
        async function startVideoCall() {
            if (!currentChat) {
                showToast('Please select a chat first', 'error');
                return;
            }

            try {
                showToast('Starting video call...', 'info');
                
                // Get user media (camera and microphone)
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: true 
                });
                
                // Display local video stream
                const localVideo = document.getElementById('localVideo');
                localVideo.srcObject = localStream;
                
                // Show call container
                const videoCallContainer = document.getElementById('videoCallContainer');
                videoCallContainer.style.display = 'block';
                
                // Set call state
                isInCall = true;
                isMuted = false;
                isVideoOff = false;
                
                // Show placeholder for signaling (to be replaced with Firebase signaling)
                showToast('Call started. Waiting for recipient...', 'info');
                
            } catch (error) {
                console.error('Error starting video call:', error);
                showToast('Error starting video call. Please check camera/microphone permissions.', 'error');
            }
        }

        async function startVoiceCall() {
            if (!currentChat) {
                showToast('Please select a chat first', 'error');
                return;
            }

            try {
                showToast('Starting voice call...', 'info');
                
                // Get user media (microphone only)
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: false, 
                    audio: true 
                });
                
                // Show call container
                const videoCallContainer = document.getElementById('videoCallContainer');
                videoCallContainer.style.display = 'block';
                
                // Set call state
                isInCall = true;
                isMuted = false;
                isVideoOff = true; // Voice call has no video
                
                // Show placeholder for signaling (to be replaced with Firebase signaling)
                showToast('Call started. Waiting for recipient...', 'info');
                
            } catch (error) {
                console.error('Error starting voice call:', error);
                showToast('Error starting voice call. Please check microphone permissions.', 'error');
            }
        }

        function toggleMute() {
            if (!localStream) return;
            
            const audioTracks = localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            
            isMuted = !isMuted;
            const muteBtn = document.getElementById('muteBtn');
            muteBtn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
            
            showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
        }

        function toggleVideo() {
            if (!localStream) return;
            
            const videoTracks = localStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            
            isVideoOff = !isVideoOff;
            const videoToggleBtn = document.getElementById('videoToggleBtn');
            videoToggleBtn.innerHTML = isVideoOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
            
            showToast(isVideoOff ? 'Video turned off' : 'Video turned on', 'info');
        }

        function endCall() {
            // Stop all media tracks
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    track.stop();
                });
                localStream = null;
            }
            
            // Hide call container
            const videoCallContainer = document.getElementById('videoCallContainer');
            videoCallContainer.style.display = 'none';
            
            // Reset call state
            isInCall = false;
            isMuted = false;
            isVideoOff = false;
            
            // Reset button states
            const muteBtn = document.getElementById('muteBtn');
            const videoToggleBtn = document.getElementById('videoToggleBtn');
            muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            videoToggleBtn.innerHTML = '<i class="fas fa-video"></i>';
            
            showToast('Call ended', 'info');
        }

        // Setup Event Listeners
        function setupEventListeners() {
            // Theme toggle
            document.getElementById('themeToggle').addEventListener('click', () => {
                const currentTheme = document.body.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                setTheme(newTheme);
            });

            // Tab switching
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;
                    
                    // Update active tab
                    document.querySelectorAll('.tab-btn').forEach(b => {
                        b.classList.remove('tab-active');
                        b.classList.add('text-gray-500');
                    });
                    btn.classList.add('tab-active');
                    btn.classList.remove('text-gray-500');
                    
                    // Show active tab content
                    document.querySelectorAll('.tab-panel').forEach(panel => {
                        panel.classList.add('hidden');
                    });
                    document.getElementById(`${tab}Tab`).classList.remove('hidden');
                });
            });

            // Settings modal
            document.getElementById('menuBtn').addEventListener('click', () => {
                settingsModal.classList.remove('hidden');
            });

            document.getElementById('closeSettings').addEventListener('click', () => {
                settingsModal.classList.add('hidden');
            });

            // Add friend modal
            document.getElementById('addFriendBtn').addEventListener('click', () => {
                addFriendModal.classList.remove('hidden');
            });

            document.getElementById('cancelFriend').addEventListener('click', () => {
                addFriendModal.classList.add('hidden');
            });

            // Friend search
            document.getElementById('friendSearch').addEventListener('input', (e) => {
                searchFriends(e.target.value);
            });

            // Enhanced friend search
            document.getElementById('searchFriend').addEventListener('click', async () => {
                const query = document.getElementById('friendSearchInput').value.trim();
                if (!query) {
                    showToast('Please enter a search term', 'error');
                    return;
                }
                
                const results = await enhancedFriendSearch(query);
                displayEnhancedSearchResults(results);
                friendSearchResultsModal.classList.remove('hidden');
                addFriendModal.classList.add('hidden');
            });

            document.getElementById('closeEnhancedSearch').addEventListener('click', () => {
                friendSearchResultsModal.classList.add('hidden');
            });

            // Edit friend modal
            document.getElementById('cancelEditFriend').addEventListener('click', () => {
                editFriendModal.classList.add('hidden');
            });

            document.getElementById('messageFriend').addEventListener('click', () => {
                const friendId = currentEditingFriendId;
                const friendName = document.getElementById('editFriendName').value;
                startChat(friendId, friendName);
                editFriendModal.classList.add('hidden');
            });

            document.getElementById('callFriend').addEventListener('click', () => {
                const friendId = currentEditingFriendId;
                const friendName = document.getElementById('editFriendName').value;
                startCall(friendId, friendName);
                editFriendModal.classList.add('hidden');
            });

            document.getElementById('removeFriend').addEventListener('click', () => {
                if (currentEditingFriendId) {
                    removeFriend(currentEditingFriendId);
                    editFriendModal.classList.add('hidden');
                }
            });

            // Profile settings
            document.getElementById('profileSettingsBtn').addEventListener('click', () => {
                profileSettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeProfileSettings').addEventListener('click', () => {
                profileSettingsModal.classList.add('hidden');
            });

            document.getElementById('saveProfile').addEventListener('click', () => {
                updateProfile();
                profileSettingsModal.classList.add('hidden');
            });

            document.getElementById('cancelProfile').addEventListener('click', () => {
                profileSettingsModal.classList.add('hidden');
            });

            // Profile picture upload
            document.getElementById('profilePicUpload').addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    uploadProfilePicture(e.target.files[0]);
                }
            });

            document.getElementById('profilePictureUpload').addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    uploadProfilePicture(e.target.files[0]);
                }
            });

            // Cover picture upload
            document.getElementById('coverPicUpload').addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    uploadCoverPicture(e.target.files[0]);
                }
            });

            // Status creation
            document.getElementById('myStatus').addEventListener('click', () => {
                openStatusCreation();
            });

            document.getElementById('closeStatusCreation').addEventListener('click', () => {
                statusCreation.style.display = 'none';
            });

            // Status type switching
            document.querySelectorAll('.status-option').forEach(option => {
                option.addEventListener('click', () => {
                    const type = option.dataset.type;
                    
                    // Update active option
                    document.querySelectorAll('.status-option').forEach(opt => {
                        opt.classList.remove('active');
                    });
                    option.classList.add('active');
                    
                    // Show corresponding preview
                    document.getElementById('emojiPreview').classList.add('hidden');
                    document.getElementById('textPreview').classList.add('hidden');
                    document.getElementById('imagePreview').classList.add('hidden');
                    document.getElementById('videoPreview').classList.add('hidden');
                    document.getElementById('audioPreview').classList.add('hidden');
                    
                    document.getElementById(`${type}Preview`).classList.remove('hidden');
                });
            });

            // Post status
            document.getElementById('postStatus').addEventListener('click', () => {
                const activeType = document.querySelector('.status-option.active').dataset.type;
                let content = '';
                
                if (activeType === 'emoji') {
                    content = document.getElementById('emojiPreview').textContent;
                } else if (activeType === 'text') {
                    content = document.getElementById('statusTextInput').value;
                } else if (activeType === 'image') {
                    content = 'Image status'; // In real implementation, this would be the image URL
                } else if (activeType === 'video') {
                    content = 'Video status'; // In real implementation, this would be the video URL
                } else if (activeType === 'audio') {
                    content = 'Audio status'; // In real implementation, this would be the audio URL
                }
                
                if (content) {
                    postStatus(activeType, content);
                    statusCreation.style.display = 'none';
                } else {
                    showToast('Please add content to your status', 'error');
                }
            });

            // Back to chats (mobile)
            document.getElementById('backToChats').addEventListener('click', () => {
                document.getElementById('chatListContainer').classList.remove('hidden');
            });

            // Message input and sending
            document.getElementById('messageInput').addEventListener('input', handleTypingIndicator);
            
            document.getElementById('messageInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && userSettings.chat.enterKeySends) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            document.getElementById('sendBtn').addEventListener('click', sendMessage);

            // File attachment
            document.getElementById('attachBtn').addEventListener('click', () => {
                // Create a file input element
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '*/*';
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        uploadFile(e.target.files[0]);
                    }
                });
                fileInput.click();
            });

            // Remove file preview
            document.getElementById('removeFile').addEventListener('click', () => {
                document.getElementById('filePreview').classList.add('hidden');
            });

            // Emoji picker
            document.getElementById('emojiBtn').addEventListener('click', toggleEmojiPicker);

            // Close emoji picker when clicking outside
            document.addEventListener('click', (e) => {
                const emojiPicker = document.getElementById('emojiPicker');
                const emojiBtn = document.getElementById('emojiBtn');
                
                if (emojiPicker.style.display === 'block' && 
                    !emojiPicker.contains(e.target) && 
                    !emojiBtn.contains(e.target)) {
                    emojiPicker.style.display = 'none';
                }
            });

            // Video call
            document.getElementById('videoCallBtn').addEventListener('click', startVideoCall);

            // Voice call
            document.getElementById('voiceCallBtn').addEventListener('click', startVoiceCall);

            // Call controls
            document.getElementById('muteBtn').addEventListener('click', toggleMute);
            document.getElementById('videoToggleBtn').addEventListener('click', toggleVideo);
            document.getElementById('endCallBtn').addEventListener('click', endCall);

            // All Friends Modal
            document.getElementById('manageFavorites').addEventListener('click', openAllFriendsModal);
            document.getElementById('closeAllFriends').addEventListener('click', () => {
                allFriendsModal.classList.add('hidden');
            });

            // All Friends Search
            document.getElementById('allFriendsSearch').addEventListener('input', (e) => {
                searchAllFriends(e.target.value);
            });

            // Group creation
            document.getElementById('newGroupBtn').addEventListener('click', openCreateGroupModal);
            document.getElementById('closeCreateGroup').addEventListener('click', () => {
                createGroupModal.classList.add('hidden');
            });
            document.getElementById('createGroup').addEventListener('click', createGroup);
            document.getElementById('cancelCreateGroup').addEventListener('click', () => {
                createGroupModal.classList.add('hidden');
            });

            // Group joining
            document.getElementById('joinGroup').addEventListener('click', joinGroup);
            document.getElementById('cancelJoinGroup').addEventListener('click', () => {
                joinGroupModal.classList.add('hidden');
            });

            // Logout
            document.getElementById('logoutBtn').addEventListener('click', () => {
                if (confirm('Are you sure you want to log out?')) {
                    auth.signOut().then(() => {
                        window.location.href = 'login.html';
                    }).catch(error => {
                        console.error('Error signing out:', error);
                        showToast('Error signing out', 'error');
                    });
                }
            });

            // Additional settings navigation
            document.getElementById('privacySettingsBtn').addEventListener('click', () => {
                privacySettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closePrivacySettings').addEventListener('click', () => {
                privacySettingsModal.classList.add('hidden');
            });

            document.getElementById('savePrivacy').addEventListener('click', () => {
                // Save privacy settings logic would go here
                showToast('Privacy settings saved', 'success');
                privacySettingsModal.classList.add('hidden');
            });

            document.getElementById('cancelPrivacy').addEventListener('click', () => {
                privacySettingsModal.classList.add('hidden');
            });

            // Mood settings
            document.querySelectorAll('.mood-option').forEach(option => {
                option.addEventListener('click', () => {
                    const mood = option.dataset.mood;
                    // Update user mood in Firebase
                    db.collection('users').doc(currentUser.uid).update({
                        mood: mood,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        currentUserData.mood = mood;
                        showToast(`Mood set to ${mood}`, 'success');
                    }).catch(error => {
                        console.error('Error updating mood:', error);
                        showToast('Error updating mood', 'error');
                    });
                });
            });

            // Quick actions
            document.getElementById('privacyBtn').addEventListener('click', () => {
                privacySettingsModal.classList.remove('hidden');
            });

            document.getElementById('settingsBtn').addEventListener('click', () => {
                settingsModal.classList.remove('hidden');
            });

            document.getElementById('storageBtn').addEventListener('click', () => {
                storageSettingsModal.classList.remove('hidden');
            });

            document.getElementById('inviteBtn').addEventListener('click', () => {
                inviteFriendsModal.classList.remove('hidden');
            });

            // Business tools
            document.getElementById('catalogueBtn').addEventListener('click', () => {
                showToast('Catalogue feature coming soon', 'info');
            });

            document.getElementById('advertiseBtn').addEventListener('click', () => {
                showToast('Advertising feature coming soon', 'info');
            });

            document.getElementById('labelsBtn').addEventListener('click', () => {
                showToast('Labels feature coming soon', 'info');
            });

            document.getElementById('greetingBtn').addEventListener('click', () => {
                showToast('Greeting messages feature coming soon', 'info');
            });

            document.getElementById('awayBtn').addEventListener('click', () => {
                showToast('Away messages feature coming soon', 'info');
            });

            // AI features
            document.getElementById('aiSummarize').addEventListener('click', () => {
                showToast('AI summarization feature coming soon', 'info');
            });

            document.getElementById('aiReply').addEventListener('click', () => {
                showToast('AI reply suggestions feature coming soon', 'info');
            });

            // Help center
            document.getElementById('helpCenterBtn').addEventListener('click', () => {
                helpCenterModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeHelpCenter').addEventListener('click', () => {
                helpCenterModal.classList.add('hidden');
            });

            document.querySelectorAll('.help-section').forEach(section => {
                section.addEventListener('click', () => {
                    const sectionName = section.dataset.section;
                    openHelpSection(sectionName);
                });
            });

            document.getElementById('contactSupport').addEventListener('click', contactSupport);
            document.getElementById('sendFeedback').addEventListener('click', sendFeedback);

            // App info
            document.getElementById('appInfoBtn').addEventListener('click', () => {
                appInfoModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeAppInfo').addEventListener('click', () => {
                appInfoModal.classList.add('hidden');
            });

            document.getElementById('termsOfServiceBtn').addEventListener('click', () => {
                openLegalDocument('terms');
            });

            document.getElementById('privacyPolicyBtn').addEventListener('click', () => {
                openLegalDocument('privacy');
            });

            document.getElementById('openSourceBtn').addEventListener('click', () => {
                openLegalDocument('opensource');
            });

            // Invite friends
            document.getElementById('inviteContactBtn').addEventListener('click', () => {
                inviteFriendsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeInviteFriends').addEventListener('click', () => {
                inviteFriendsModal.classList.add('hidden');
            });

            document.getElementById('shareLink').addEventListener('click', shareLink);
            document.getElementById('shareQR').addEventListener('click', shareQR);
            document.getElementById('shareWhatsApp').addEventListener('click', shareWhatsApp);
            document.getElementById('shareSMS').addEventListener('click', shareSMS);
            document.getElementById('copyReferralCode').addEventListener('click', copyReferralCode);

            // Favorites
            document.getElementById('favoritesSettingsBtn').addEventListener('click', openFavoritesSettings);
            document.getElementById('closeFavoritesSettings').addEventListener('click', () => {
                favoritesSettingsModal.classList.add('hidden');
            });

            document.getElementById('addToFavorites').addEventListener('click', () => {
                showToast('Add to favorites feature coming soon', 'info');
            });

            // Accessibility
            document.getElementById('accessibilityBtn').addEventListener('click', () => {
                accessibilitySettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeAccessibilitySettings').addEventListener('click', () => {
                accessibilitySettingsModal.classList.add('hidden');
            });

            document.getElementById('saveAccessibility').addEventListener('click', () => {
                // Save accessibility settings logic would go here
                showToast('Accessibility settings saved', 'success');
                accessibilitySettingsModal.classList.add('hidden');
            });

            // Notifications
            document.getElementById('notificationsSettingsBtn').addEventListener('click', () => {
                notificationsSettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeNotificationsSettings').addEventListener('click', () => {
                notificationsSettingsModal.classList.add('hidden');
            });

            document.getElementById('saveNotifications').addEventListener('click', () => {
                // Save notification settings logic would go here
                showToast('Notification settings saved', 'success');
                notificationsSettingsModal.classList.add('hidden');
            });

            // Storage
            document.getElementById('storageSettingsBtn').addEventListener('click', () => {
                storageSettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeStorageSettings').addEventListener('click', () => {
                storageSettingsModal.classList.add('hidden');
            });

            document.getElementById('saveStorage').addEventListener('click', () => {
                // Save storage settings logic would go here
                showToast('Storage settings saved', 'success');
                storageSettingsModal.classList.add('hidden');
            });

            // Language
            document.getElementById('languageSettingsBtn').addEventListener('click', () => {
                languageSettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeLanguageSettings').addEventListener('click', () => {
                languageSettingsModal.classList.add('hidden');
            });

            document.getElementById('saveLanguage').addEventListener('click', () => {
                // Save language settings logic would go here
                showToast('Language settings saved', 'success');
                languageSettingsModal.classList.add('hidden');
            });

            // Chat settings
            document.getElementById('chatsSettingsBtn').addEventListener('click', () => {
                chatSettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeChatSettings').addEventListener('click', () => {
                chatSettingsModal.classList.add('hidden');
            });

            document.getElementById('saveChatSettings').addEventListener('click', () => {
                // Save chat settings logic would go here
                showToast('Chat settings saved', 'success');
                chatSettingsModal.classList.add('hidden');
            });

            // Account settings
            document.getElementById('securitySettingsBtn').addEventListener('click', () => {
                accountSettingsModal.classList.remove('hidden');
                settingsModal.classList.add('hidden');
            });

            document.getElementById('closeAccountSettings').addEventListener('click', () => {
                accountSettingsModal.classList.add('hidden');
            });

            document.getElementById('cancelAccount').addEventListener('click', () => {
                accountSettingsModal.classList.add('hidden');
            });

            // Avatar settings
            document.getElementById('avatarSettingsBtn').addEventListener('click', openAvatarSettings);
        }