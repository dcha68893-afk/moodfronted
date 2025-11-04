// Professional Chat System JavaScript - Firebase Integrated Version
class ProfessionalChatSystem {
    constructor() {
        this.currentUser = null;
        this.currentChatId = null;
        this.chats = [];
        this.users = [];
        this.filteredChats = [];
        this.currentChatTypeFilter = 'all';
        this.isSidebarVisible = true;
        
        // Firebase configuration
        this.firebaseConfig = {
            apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
            authDomain: "uniconnect-ee95c.firebaseapp.com",
            projectId: "uniconnect-ee95c",
            storageBucket: "uniconnect-ee95c.firebasestorage.app",
            messagingSenderId: "1003264444309",
            appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
        };
        
        this.init();
    }
    
    async init() {
        try {
            await this.initializeFirebase();
            await this.setupAuthStateListener();
            this.setupEventListeners();
            console.log('🚀 Professional Chat System Initialized with Firebase');
        } catch (error) {
            console.error('Error initializing chat system:', error);
            this.showNotification('Error initializing chat system', 'error');
        }
    }
    
    async initializeFirebase() {
        // Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(this.firebaseConfig);
        }
        
        this.auth = firebase.auth();
        this.firestore = firebase.firestore();
        this.storage = firebase.storage();
        
        // Enable offline persistence
        await this.firestore.enablePersistence()
            .catch((err) => {
                console.error('Firebase persistence failed:', err);
            });
    }
    
    setupAuthStateListener() {
        this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                await this.handleUserSignedIn(user);
            } else {
                this.handleUserSignedOut();
            }
        });
    }
    
    async handleUserSignedIn(user) {
        try {
            // Get user data from Firestore
            const userDoc = await this.firestore.collection('users').doc(user.uid).get();
            
            if (userDoc.exists) {
                this.currentUser = {
                    id: user.uid,
                    email: user.email,
                    ...userDoc.data()
                };
            } else {
                // Create new user document if it doesn't exist
                this.currentUser = {
                    id: user.uid,
                    email: user.email,
                    name: user.displayName || user.email.split('@')[0],
                    role: 'student',
                    online: true,
                    avatar: user.displayName ? user.displayName.substring(0, 2).toUpperCase() : 'US'
                };
                
                await this.firestore.collection('users').doc(user.uid).set(this.currentUser);
            }
            
            this.updateCurrentUser();
            await this.loadUsers();
            await this.loadChats();
            this.setupRealtimeListeners();
            
            this.showNotification(`Welcome back, ${this.currentUser.name}!`, 'success');
            
        } catch (error) {
            console.error('Error handling user sign in:', error);
            this.showNotification('Error loading user data', 'error');
        }
    }
    
    handleUserSignedOut() {
        this.currentUser = null;
        this.chats = [];
        this.users = [];
        this.filteredChats = [];
        this.currentChatId = null;
        
        // Show login view
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('chat-app').style.display = 'none';
        
        // Clear any existing listeners
        if (this.chatsListener) {
            this.chatsListener();
        }
        if (this.usersListener) {
            this.usersListener();
        }
    }
    
    async loadUsers() {
        try {
            const snapshot = await this.firestore.collection('users')
                .where('id', '!=', this.currentUser.id)
                .get();
            
            this.users = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    async loadChats() {
        try {
            // Load chats where current user is a member
            const snapshot = await this.firestore.collection('chats')
                .where('members', 'array-contains', this.currentUser.id)
                .orderBy('lastMessageTime', 'desc')
                .get();
            
            this.chats = await Promise.all(
                snapshot.docs.map(async doc => {
                    const chatData = doc.data();
                    
                    // Load members data
                    const membersData = await Promise.all(
                        chatData.members.map(async memberId => {
                            const memberDoc = await this.firestore.collection('users').doc(memberId).get();
                            return {
                                id: memberId,
                                ...memberDoc.data()
                            };
                        })
                    );
                    
                    // Load messages
                    const messagesSnapshot = await this.firestore.collection('chats')
                        .doc(doc.id)
                        .collection('messages')
                        .orderBy('timestamp', 'asc')
                        .get();
                    
                    const messages = messagesSnapshot.docs.map(msgDoc => {
                        const msgData = msgDoc.data();
                        const sender = membersData.find(m => m.id === msgData.senderId) || this.currentUser;
                        return {
                            id: msgDoc.id,
                            sender: sender,
                            content: msgData.content,
                            time: this.formatTime(msgData.timestamp?.toDate()),
                            type: msgData.type || 'normal',
                            status: msgData.status || 'sent',
                            timestamp: msgData.timestamp
                        };
                    });
                    
                    return {
                        id: doc.id,
                        ...chatData,
                        members: membersData,
                        messages: messages
                    };
                })
            );
            
            this.filteredChats = [...this.chats];
            this.renderChatList();
            
        } catch (error) {
            console.error('Error loading chats:', error);
        }
    }
    
    setupRealtimeListeners() {
        // Real-time listener for chats
        this.chatsListener = this.firestore.collection('chats')
            .where('members', 'array-contains', this.currentUser.id)
            .orderBy('lastMessageTime', 'desc')
            .onSnapshot(async (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        await this.updateChatFromSnapshot(change.doc);
                    } else if (change.type === 'removed') {
                        this.removeChat(change.doc.id);
                    }
                });
            });
        
        // Real-time listener for users
        this.usersListener = this.firestore.collection('users')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'modified') {
                        this.updateUserFromSnapshot(change.doc);
                    }
                });
            });
    }
    
    async updateChatFromSnapshot(doc) {
        const chatData = doc.data();
        const existingIndex = this.chats.findIndex(chat => chat.id === doc.id);
        
        // Load members data
        const membersData = await Promise.all(
            chatData.members.map(async memberId => {
                const memberDoc = await this.firestore.collection('users').doc(memberId).get();
                return {
                    id: memberId,
                    ...memberDoc.data()
                };
            })
        );
        
        // Load messages if this is the active chat
        let messages = [];
        if (doc.id === this.currentChatId) {
            const messagesSnapshot = await this.firestore.collection('chats')
                .doc(doc.id)
                .collection('messages')
                .orderBy('timestamp', 'asc')
                .get();
            
            messages = messagesSnapshot.docs.map(msgDoc => {
                const msgData = msgDoc.data();
                const sender = membersData.find(m => m.id === msgData.senderId) || this.currentUser;
                return {
                    id: msgDoc.id,
                    sender: sender,
                    content: msgData.content,
                    time: this.formatTime(msgData.timestamp?.toDate()),
                    type: msgData.type || 'normal',
                    status: msgData.status || 'sent',
                    timestamp: msgData.timestamp
                };
            });
        }
        
        const updatedChat = {
            id: doc.id,
            ...chatData,
            members: membersData,
            messages: messages
        };
        
        if (existingIndex >= 0) {
            this.chats[existingIndex] = updatedChat;
            this.filteredChats[existingIndex] = updatedChat;
        } else {
            this.chats.unshift(updatedChat);
            this.filteredChats.unshift(updatedChat);
        }
        
        this.renderChatList();
        
        if (doc.id === this.currentChatId) {
            this.renderMessages(doc.id);
        }
    }
    
    updateUserFromSnapshot(doc) {
        const userData = doc.data();
        const userIndex = this.users.findIndex(user => user.id === doc.id);
        
        if (userIndex >= 0) {
            this.users[userIndex] = {
                id: doc.id,
                ...userData
            };
        }
        
        // Update user in chats
        this.chats.forEach(chat => {
            const memberIndex = chat.members.findIndex(member => member.id === doc.id);
            if (memberIndex >= 0) {
                chat.members[memberIndex] = {
                    id: doc.id,
                    ...userData
                };
            }
        });
    }
    
    removeChat(chatId) {
        this.chats = this.chats.filter(chat => chat.id !== chatId);
        this.filteredChats = this.filteredChats.filter(chat => chat.id !== chatId);
        
        if (this.currentChatId === chatId) {
            this.showChatList();
        }
        
        this.renderChatList();
    }
    
    setupEventListeners() {
        // Authentication
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('signup-btn').addEventListener('click', () => this.signup());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        
        // Chat list interactions
        document.getElementById('chat-search').addEventListener('input', (e) => {
            this.filterChats(e.target.value);
        });
        
        // Chat type filters
        document.querySelectorAll('.chat-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chat-type-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentChatTypeFilter = e.target.getAttribute('data-type');
                this.filterChats();
            });
        });
        
        // Message sending
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        document.getElementById('message-input').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        
        // Back button
        document.getElementById('back-to-list').addEventListener('click', () => this.showChatList());
        
        // New chat button
        document.getElementById('new-chat-btn').addEventListener('click', () => {
            this.showModal('new-chat-modal');
        });
        
        // Chat options
        document.querySelectorAll('.chat-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const type = e.currentTarget.getAttribute('data-type');
                this.handleChatTypeSelection(type);
            });
        });
        
        // Group creation
        document.getElementById('create-group-form').addEventListener('submit', (e) => this.createGroup(e));
        
        // Group info button
        document.getElementById('group-info-btn').addEventListener('click', () => {
            if (this.currentChatId) {
                this.showGroupInfoModal(this.currentChatId);
            }
        });
        
        // Leave group button
        document.getElementById('leave-group-btn').addEventListener('click', () => this.leaveGroup());
        
        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeAllModals();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
        
        // Responsive sidebar toggle
        window.addEventListener('resize', () => this.handleResize());
    }
    
    async login() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            this.showNotification('Please enter email and password', 'warning');
            return;
        }
        
        try {
            await this.auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Login failed: ' + error.message, 'error');
        }
    }
    
    async signup() {
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const name = document.getElementById('signup-name').value;
        const role = document.getElementById('signup-role').value;
        
        if (!email || !password || !name) {
            this.showNotification('Please fill all fields', 'warning');
            return;
        }
        
        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            await userCredential.user.updateProfile({
                displayName: name
            });
            
            // User document will be created in handleUserSignedIn
            this.showNotification('Account created successfully!', 'success');
            
        } catch (error) {
            console.error('Signup error:', error);
            this.showNotification('Signup failed: ' + error.message, 'error');
        }
    }
    
    async logout() {
        try {
            await this.auth.signOut();
            this.showNotification('Logged out successfully', 'info');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
    
    renderChatList() {
        const chatList = document.getElementById('chat-list');
        
        if (this.filteredChats.length === 0) {
            chatList.innerHTML = `
                <div class="no-chats" style="text-align: center; padding: 3rem; color: #7f8c8d;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">💬</div>
                    <h3 style="margin-bottom: 0.5rem;">No conversations found</h3>
                    <p>Try adjusting your search or start a new chat</p>
                    <button class="btn btn-primary" onclick="chatSystem.showModal('new-chat-modal')" style="margin-top: 1rem;">
                        <i class="fas fa-plus"></i> Start New Chat
                    </button>
                </div>
            `;
            return;
        }
        
        const chatsHTML = this.filteredChats.map(chat => {
            const isActive = chat.id === this.currentChatId;
            const activeClass = isActive ? 'active' : '';
            const typeClass = `type-${chat.type}`;
            const unreadCount = this.calculateUnreadCount(chat);
            
            return `
                <div class="chat-item ${activeClass}" data-chat-id="${chat.id}">
                    <div class="chat-avatar">
                        <span>${chat.avatarText || chat.name.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <div class="chat-item-info">
                        <div class="chat-item-header">
                            <div class="chat-item-name">${chat.name}</div>
                            <div class="chat-item-time">${this.formatTime(chat.lastMessageTime?.toDate())}</div>
                        </div>
                        <div class="chat-item-preview">${chat.lastMessage || 'No messages yet'}</div>
                        <div class="chat-item-meta">
                            ${unreadCount > 0 ? `<div class="chat-badge">${unreadCount}</div>` : ''}
                            <div class="chat-type-indicator ${typeClass}">${chat.type.charAt(0).toUpperCase() + chat.type.slice(1)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        chatList.innerHTML = chatsHTML;
        
        // Add click listeners to chat items
        chatList.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                const chatId = item.getAttribute('data-chat-id');
                this.selectChat(chatId);
            });
        });
    }
    
    calculateUnreadCount(chat) {
        if (!chat.lastRead || !chat.lastRead[this.currentUser.id]) return 0;
        
        const lastRead = chat.lastRead[this.currentUser.id].toDate();
        return chat.messages.filter(msg => 
            msg.timestamp.toDate() > lastRead && msg.sender.id !== this.currentUser.id
        ).length;
    }
    
    filterChats(searchTerm = '') {
        const term = searchTerm.toLowerCase();
        
        this.filteredChats = this.chats.filter(chat => {
            const matchesSearch = chat.name.toLowerCase().includes(term) || 
                                 (chat.lastMessage && chat.lastMessage.toLowerCase().includes(term)) ||
                                 chat.members.some(member => member.name.toLowerCase().includes(term));
            
            const matchesType = this.currentChatTypeFilter === 'all' || chat.type === this.currentChatTypeFilter;
            
            return matchesSearch && matchesType;
        });
        
        this.renderChatList();
    }
    
    async selectChat(chatId) {
        this.currentChatId = chatId;
        const chat = this.chats.find(c => c.id === chatId);
        
        if (!chat) return;
        
        // Load messages for this chat
        await this.loadChatMessages(chatId);
        
        // Update UI
        document.getElementById('chat-title').textContent = chat.name;
        document.getElementById('chat-members').textContent = `${chat.members.length} members • ${chat.type} chat`;
        document.getElementById('chat-avatar-text').textContent = chat.avatarText || chat.name.substring(0, 2).toUpperCase();
        
        // Show active chat view
        document.getElementById('no-chat-view').style.display = 'none';
        document.getElementById('active-chat-view').style.display = 'flex';
        
        // Render messages
        this.renderMessages(chatId);
        
        // Update chat list to show active state
        this.renderChatList();
        
        // Scroll to bottom of messages
        this.scrollToBottom();
        
        // Mark as read
        await this.markAsRead(chatId);
        
        console.log(`💬 Chat selected: ${chat.name}`);
    }
    
    async loadChatMessages(chatId) {
        try {
            const messagesSnapshot = await this.firestore.collection('chats')
                .doc(chatId)
                .collection('messages')
                .orderBy('timestamp', 'asc')
                .get();
            
            const chat = this.chats.find(c => c.id === chatId);
            if (!chat) return;
            
            chat.messages = messagesSnapshot.docs.map(msgDoc => {
                const msgData = msgDoc.data();
                const sender = chat.members.find(m => m.id === msgData.senderId) || this.currentUser;
                return {
                    id: msgDoc.id,
                    sender: sender,
                    content: msgData.content,
                    time: this.formatTime(msgData.timestamp?.toDate()),
                    type: msgData.type || 'normal',
                    status: msgData.status || 'sent',
                    timestamp: msgData.timestamp
                };
            });
            
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }
    
    renderMessages(chatId) {
        const container = document.getElementById('messages-container');
        const chat = this.chats.find(c => c.id === chatId);
        const messages = chat?.messages || [];
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #7f8c8d;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">💭</div>
                    <h3 style="margin-bottom: 0.5rem;">No messages yet</h3>
                    <p>Start the conversation by sending a message!</p>
                </div>
            `;
            return;
        }
        
        let messagesHTML = '';
        let currentDate = '';
        
        messages.forEach(message => {
            const messageDate = message.timestamp.toDate().toDateString();
            if (messageDate !== currentDate) {
                currentDate = messageDate;
                messagesHTML += `
                    <div class="message-date-divider">
                        <span class="date-label">${this.formatDate(message.timestamp.toDate())}</span>
                    </div>
                `;
            }
            
            const isSent = message.sender.id === this.currentUser.id;
            const messageClass = isSent ? 'message sent' : 'message received';
            const bubbleClass = message.type !== 'normal' ? `message-bubble message-${message.type}` : 'message-bubble';
            
            messagesHTML += `
                <div class="${messageClass}">
                    <div class="${bubbleClass}">
                        ${!isSent ? `<div class="message-sender">${message.sender.name}</div>` : ''}
                        <div class="message-content">${message.content}</div>
                        <div class="message-meta">
                            <span class="message-time">${message.time}</span>
                            ${isSent ? `<span class="message-status">${this.getStatusIcon(message.status)}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = messagesHTML;
    }
    
    getStatusIcon(status) {
        switch(status) {
            case 'sent': return '✓';
            case 'delivered': return '✓✓';
            case 'read': return '✓✓';
            default: return '⋯';
        }
    }
    
    async sendMessage() {
        const input = document.getElementById('message-input');
        const messageType = document.getElementById('message-type').value;
        const content = input.value.trim();
        
        if (!content) {
            this.showNotification('Please enter a message', 'warning');
            return;
        }
        
        if (!this.currentChatId) {
            this.showNotification('Please select a chat first', 'warning');
            return;
        }
        
        try {
            const messageData = {
                senderId: this.currentUser.id,
                content: content,
                type: messageType,
                status: 'sent',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Add message to Firestore
            await this.firestore.collection('chats')
                .doc(this.currentChatId)
                .collection('messages')
                .add(messageData);
            
            // Update chat last message
            await this.firestore.collection('chats')
                .doc(this.currentChatId)
                .update({
                    lastMessage: content,
                    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
                });
            
            // Clear input
            input.value = '';
            input.style.height = 'auto';
            
            this.showNotification('Message sent successfully', 'success');
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showNotification('Error sending message', 'error');
        }
    }
    
    showChatList() {
        this.currentChatId = null;
        document.getElementById('no-chat-view').style.display = 'flex';
        document.getElementById('active-chat-view').style.display = 'none';
        this.renderChatList();
    }
    
    showModal(modalId) {
        this.closeAllModals();
        document.getElementById(modalId).style.display = 'flex';
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    handleChatTypeSelection(type) {
        this.closeAllModals();
        this.showCreateGroupModal(type);
    }
    
    showCreateGroupModal(type) {
        const modalTitle = document.getElementById('group-modal-title');
        modalTitle.textContent = `Create ${type.charAt(0).toUpperCase() + type.slice(1)} Group`;
        
        document.getElementById('group-type').value = type;
        this.loadAvailableMembers();
        
        this.showModal('create-group-modal');
    }
    
    loadAvailableMembers() {
        const container = document.getElementById('available-members');
        
        const membersHTML = this.users.map(user => `
            <div class="member-item">
                <input type="checkbox" id="member-${user.id}" value="${user.id}">
                <label for="member-${user.id}">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${user.online ? '#27ae60' : '#bdc3c7'}"></div>
                        ${user.name} (${user.role})
                    </div>
                </label>
            </div>
        `).join('');
        
        container.innerHTML = membersHTML;
    }
    
    async createGroup(e) {
        e.preventDefault();
        
        const groupName = document.getElementById('group-name').value;
        const groupType = document.getElementById('group-type').value;
        
        if (!groupName.trim()) {
            this.showNotification('Please enter a group name', 'warning');
            return;
        }
        
        // Get selected members
        const selectedMembers = [];
        document.querySelectorAll('#available-members input:checked').forEach(input => {
            selectedMembers.push(input.value);
        });
        
        if (selectedMembers.length === 0) {
            this.showNotification('Please select at least one member', 'warning');
            return;
        }
        
        // Add current user to members
        selectedMembers.push(this.currentUser.id);
        
        try {
            const chatData = {
                name: groupName,
                type: groupType,
                members: selectedMembers,
                createdBy: this.currentUser.id,
                avatarText: groupName.substring(0, 2).toUpperCase(),
                lastMessage: 'Group created',
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                lastRead: {
                    [this.currentUser.id]: firebase.firestore.FieldValue.serverTimestamp()
                }
            };
            
            // Create new chat in Firestore
            const chatRef = await this.firestore.collection('chats').add(chatData);
            
            // Close modal and show chat list
            this.closeAllModals();
            this.showChatList();
            
            this.showNotification(`${groupType.charAt(0).toUpperCase() + groupType.slice(1)} group created successfully`, 'success');
            
        } catch (error) {
            console.error('Error creating group:', error);
            this.showNotification('Error creating group', 'error');
        }
    }
    
    async showGroupInfoModal(chatId) {
        const chat = this.chats.find(c => c.id === chatId);
        
        if (!chat) return;
        
        document.getElementById('group-avatar-large').textContent = chat.avatarText || chat.name.substring(0, 2).toUpperCase();
        document.getElementById('info-group-name').textContent = chat.name;
        document.getElementById('info-group-type').textContent = `${chat.type.charAt(0).toUpperCase() + chat.type.slice(1)} Group`;
        document.getElementById('info-member-count').textContent = `${chat.members.length} members`;
        
        const membersList = document.getElementById('group-members-list');
        membersList.innerHTML = '';
        
        chat.members.forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-item';
            memberItem.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="chat-avatar" style="width: 35px; height: 35px; font-size: 0.8rem;">
                            <span>${member.avatar}</span>
                        </div>
                        <div>
                            <div style="font-weight: 600; color: #2c3e50;">${member.name}</div>
                            <div style="font-size: 0.8rem; color: #7f8c8d;">${member.role}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${member.online ? '#27ae60' : '#bdc3c7'}"></div>
                        ${member.id === this.currentUser.id ? '<span style="color: #3498db; font-size: 0.8rem; font-weight: 600;">You</span>' : ''}
                    </div>
                </div>
            `;
            membersList.appendChild(memberItem);
        });
        
        this.showModal('group-info-modal');
    }
    
    async leaveGroup() {
        if (!this.currentChatId) return;
        
        if (confirm('Are you sure you want to leave this group? This action cannot be undone.')) {
            try {
                const chatRef = this.firestore.collection('chats').doc(this.currentChatId);
                const chat = await chatRef.get();
                
                if (chat.exists) {
                    const members = chat.data().members;
                    const updatedMembers = members.filter(memberId => memberId !== this.currentUser.id);
                    
                    await chatRef.update({
                        members: updatedMembers
                    });
                    
                    this.showNotification('You have left the group', 'info');
                    this.closeAllModals();
                    this.showChatList();
                }
                
            } catch (error) {
                console.error('Error leaving group:', error);
                this.showNotification('Error leaving group', 'error');
            }
        }
    }
    
    async markAsRead(chatId) {
        try {
            await this.firestore.collection('chats')
                .doc(chatId)
                .update({
                    [`lastRead.${this.currentUser.id}`]: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    }
    
    scrollToBottom() {
        const container = document.getElementById('messages-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }
    
    showNotification(message, type = 'info') {
        // Simple notification implementation
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : type === 'success' ? '#27ae60' : '#3498db'};
            color: white;
            border-radius: 4px;
            z-index: 1000;
            font-family: Arial, sans-serif;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }
    
    updateCurrentUser() {
        if (this.currentUser) {
            document.getElementById('current-user-name').textContent = this.currentUser.name;
            document.getElementById('login-view').style.display = 'none';
            document.getElementById('chat-app').style.display = 'flex';
        }
    }
    
    formatTime(date) {
        if (!date) return '';
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    formatDate(date) {
        if (!date) return '';
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
    }
    
    handleResize() {
        // Handle responsive behavior
        if (window.innerWidth > 768) {
            this.isSidebarVisible = true;
        }
    }
}

// Initialize the chat system when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Add Font Awesome for icons
        const fontAwesome = document.createElement('link');
        fontAwesome.rel = 'stylesheet';
        fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fontAwesome);
        
        // Add Firebase SDKs
        const firebaseScript = document.createElement('script');
        firebaseScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
        document.head.appendChild(firebaseScript);
        
        const firestoreScript = document.createElement('script');
        firestoreScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js';
        document.head.appendChild(firestoreScript);
        
        const authScript = document.createElement('script');
        authScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js';
        document.head.appendChild(authScript);
        
        const storageScript = document.createElement('script');
        storageScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js';
        document.head.appendChild(storageScript);
        
        // Initialize when Firebase is loaded
        firebaseScript.onload = () => {
            window.chatSystem = new ProfessionalChatSystem();
        };
        
    } catch (error) {
        console.error('❌ Error initializing chat system:', error);
        
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #e74c3c;
            color: white;
            padding: 1rem;
            text-align: center;
            z-index: 10000;
            font-family: Arial, sans-serif;
        `;
        errorDiv.textContent = 'Error loading chat system. Please refresh the page.';
        document.body.appendChild(errorDiv);
    }
});

// Export for global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfessionalChatSystem;
}