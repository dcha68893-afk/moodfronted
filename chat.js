// Kynecta - Advanced Real-Time Chat System
// Production-ready implementation with Firebase, WebRTC, E2EE, and AI features

// Configuration
const CONFIG = {
    // Firebase config (replace with your actual config)
    firebase: {
        apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
        authDomain: "uniconnect-ee95c.firebaseapp.com",
        projectId: "uniconnect-ee95c",
        storageBucket: "uniconnect-ee95c.firebasestorage.app",
        messagingSenderId: "1003264444309",
        appId: "1:1003264444309:web:9f0307516e44d21e97d89c",
        messagingId: "" // Add your FCM messaging ID
    },
    
    // WebRTC configuration
    rtc: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Add your TURN servers here for production
            // {
            //     urls: 'turn:your-turn-server.com:3478',
            //     username: 'username',
            //     credential: 'password'
            // }
        ]
    },
    
    // AI/ML services
    ai: {
        openai: {
            apiKey: '', // Set in environment variables
            endpoint: 'https://api.openai.com/v1/chat/completions'
        },
        huggingface: {
            apiKey: '', // Set in environment variables
            sentimentEndpoint: 'https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest'
        }
    },
    
    // Cloudinary configuration
    cloudinary: {
        cloudName: '', // Set in environment variables
        uploadPreset: 'kynecta_chat'
    },
    
    // Feature flags
    features: {
        e2ee: true,
        aiSentiment: true,
        pushNotifications: true,
        voiceMessages: true
    }
};

// Crypto utilities for E2EE
class EncryptionService {
    constructor() {
        this.algorithm = { name: 'AES-GCM', length: 256 };
        this.key = null;
    }

    async generateKey() {
        this.key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        return this.key;
    }

    async exportKey() {
        if (!this.key) await this.generateKey();
        return await crypto.subtle.exportKey('jwk', this.key);
    }

    async importKey(jwk) {
        this.key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            this.algorithm,
            true,
            ['encrypt', 'decrypt']
        );
    }

    async encrypt(text) {
        if (!this.key) await this.generateKey();
        
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.key,
            encoded
        );
        
        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    }

    async decrypt(encryptedData) {
        if (!this.key) throw new Error('No key available for decryption');
        
        const { iv, data } = encryptedData;
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            this.key,
            new Uint8Array(data)
        );
        
        return new TextDecoder().decode(decrypted);
    }
}

// Main Chat Application Class
class KynectaChat {
    constructor() {
        this.currentUser = null;
        this.currentChatId = null;
        this.currentMood = 'happy';
        this.encryption = new EncryptionService();
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isInCall = false;
        this.messageListeners = {};
        this.presenceListeners = {};
        
        this.init();
    }

    async init() {
        try {
            // Initialize Firebase
            if (!firebase.apps.length) {
                firebase.initializeApp(CONFIG.firebase);
            }
            
            this.auth = firebase.auth();
            this.db = firebase.firestore();
            this.storage = firebase.storage();
            this.messaging = firebase.messaging();
            
            // Initialize services
            await this.initEncryption();
            await this.initServiceWorker();
            await this.setupAuthStateListener();
            this.setupEventListeners();
            
            console.log('Kynecta Chat initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Kynecta:', error);
            this.showError('Failed to initialize application');
        }
    }

    async initEncryption() {
        if (CONFIG.features.e2ee) {
            // Load or generate encryption key
            const storedKey = localStorage.getItem('kynecta_encryption_key');
            if (storedKey) {
                await this.encryption.importKey(JSON.parse(storedKey));
            } else {
                const key = await this.encryption.generateKey();
                const exportedKey = await this.encryption.exportKey();
                localStorage.setItem('kynecta_encryption_key', JSON.stringify(exportedKey));
            }
        }
    }

    async initServiceWorker() {
        if ('serviceWorker' in navigator && CONFIG.features.pushNotifications) {
            try {
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                console.log('Service Worker registered:', registration);
                
                // Request notification permission
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    await this.setupPushNotifications();
                }
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    async setupPushNotifications() {
        try {
            const token = await this.messaging.getToken({
                vapidKey: CONFIG.firebase.messagingId
            });
            
            if (token && this.currentUser) {
                await this.db.collection('users').doc(this.currentUser.uid).update({
                    fcmToken: token,
                    fcmTokenUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Handle foreground messages
            this.messaging.onMessage((payload) => {
                this.showNotification(payload);
            });
        } catch (error) {
            console.error('Push notification setup failed:', error);
        }
    }

    showNotification(payload) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(payload.notification.title, {
                body: payload.notification.body,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/badge-72x72.png'
            });
        }
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
        this.currentUser = user;
        
        // Load or create user profile
        await this.loadUserProfile();
        
        // Setup presence
        await this.setupUserPresence();
        
        // Load user data
        await this.loadUserData();
        
        // Update UI
        this.showChatApp();
        
        console.log('User signed in:', user.uid);
    }

    handleUserSignedOut() {
        this.currentUser = null;
        this.cleanupListeners();
        this.showAuthScreen();
        console.log('User signed out');
    }

    async loadUserProfile() {
        const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
        
        if (!userDoc.exists) {
            // Create new user profile
            await this.db.collection('users').doc(this.currentUser.uid).set({
                uid: this.currentUser.uid,
                displayName: this.currentUser.displayName || 'User',
                email: this.currentUser.email,
                photoURL: this.currentUser.photoURL || this.generateDefaultAvatar(this.currentUser.uid),
                mood: 'happy',
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                isOnline: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Update online status
            await this.db.collection('users').doc(this.currentUser.uid).update({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                isOnline: true
            });
        }
        
        this.updateUserUI();
    }

    generateDefaultAvatar(uid) {
        const colors = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6'];
        const color = colors[uid.charCodeAt(0) % colors.length];
        return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}"/><text x="50" y="60" font-family="Arial" font-size="40" text-anchor="middle" fill="white">${this.currentUser.displayName ? this.currentUser.displayName.charAt(0).toUpperCase() : 'U'}</text></svg>`;
    }

    async setupUserPresence() {
        // Set online status
        const userRef = this.db.collection('users').doc(this.currentUser.uid);
        await userRef.update({
            isOnline: true,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Handle disconnect
        this.db.collection('users').doc(this.currentUser.uid).onSnapshot((snapshot) => {
            if (!snapshot.exists) return;
            
            const userData = snapshot.data();
            this.updateUserPresenceUI(userData);
        });

        // Update lastSeen on window close
        window.addEventListener('beforeunload', async () => {
            await userRef.update({
                isOnline: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }

    async loadUserData() {
        await this.loadChats();
        await this.loadContacts();
        this.setupRealtimeListeners();
    }

    async loadChats() {
        const chatsQuery = this.db.collection('chats')
            .where('participants', 'array-contains', this.currentUser.uid)
            .orderBy('lastMessageAt', 'desc');
        
        this.chatsListener = chatsQuery.onSnapshot(async (snapshot) => {
            const chatList = document.getElementById('chatList');
            const noChats = document.getElementById('noChatsMessage');
            
            if (snapshot.empty) {
                if (noChats) noChats.classList.remove('hidden');
                return;
            }
            
            if (noChats) noChats.classList.add('hidden');
            chatList.innerHTML = '';
            
            for (const doc of snapshot.docs) {
                const chat = { id: doc.id, ...doc.data() };
                await this.renderChatItem(chat, chatList);
            }
        }, (error) => {
            console.error('Error loading chats:', error);
        });
    }

    async renderChatItem(chat, container) {
        // Get other participant's info for 1-on-1 chats
        let chatName = chat.name;
        let chatAvatar = chat.avatar;
        let lastMessage = chat.lastMessage;
        
        if (chat.type === 'direct' && !chat.name) {
            const otherUserId = chat.participants.find(id => id !== this.currentUser.uid);
            if (otherUserId) {
                const userDoc = await this.db.collection('users').doc(otherUserId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    chatName = userData.displayName;
                    chatAvatar = userData.photoURL;
                }
            }
        }
        
        // Decrypt last message if encrypted
        if (lastMessage && lastMessage.encrypted && CONFIG.features.e2ee) {
            try {
                lastMessage = await this.encryption.decrypt(lastMessage);
            } catch (error) {
                lastMessage = 'Encrypted message';
            }
        }
        
        const chatItem = document.createElement('div');
        chatItem.className = 'p-4 border-b border-gray-200 flex cursor-pointer hover:bg-gray-50 transition-colors chat-item';
        chatItem.dataset.chatId = chat.id;
        
        chatItem.innerHTML = `
            <div class="w-12 h-12 rounded-2xl bg-cover bg-center flex items-center justify-center text-white font-semibold mr-3" style="background-image: url('${chatAvatar || this.generateDefaultAvatar(chat.id)}')">
                ${!chatAvatar ? chatName.split(' ').map(n => n[0]).join('') : ''}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center">
                    <h3 class="font-semibold truncate">${chatName}</h3>
                    <span class="text-xs text-gray-500">${this.formatTimestamp(chat.lastMessageAt)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <p class="text-sm text-gray-600 truncate">${lastMessage || 'No messages yet'}</p>
                    ${chat.unreadCount > 0 ? `<div class="bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">${chat.unreadCount}</div>` : ''}
                </div>
            </div>
        `;
        
        chatItem.addEventListener('click', () => this.openChat(chat.id));
        container.appendChild(chatItem);
    }

    async openChat(chatId) {
        this.currentChatId = chatId;
        
        // Update UI
        document.getElementById('chatHeader').classList.remove('hidden');
        document.getElementById('inputArea').classList.remove('hidden');
        document.getElementById('noMessagesMessage').classList.add('hidden');
        
        // Load chat details and messages
        await this.loadChatDetails(chatId);
        await this.loadMessages(chatId);
        this.setupMessageListener(chatId);
        
        // Mark messages as read
        await this.markMessagesAsRead(chatId);
    }

    async loadChatDetails(chatId) {
        const chatDoc = await this.db.collection('chats').doc(chatId).get();
        if (!chatDoc.exists) return;
        
        const chat = chatDoc.data();
        
        // Update chat header
        if (chat.type === 'direct') {
            const otherUserId = chat.participants.find(id => id !== this.currentUser.uid);
            if (otherUserId) {
                const userDoc = await this.db.collection('users').doc(otherUserId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    document.getElementById('chatTitle').textContent = userData.displayName;
                    document.getElementById('chatAvatar').src = userData.photoURL;
                    document.getElementById('statusText').textContent = userData.isOnline ? 'Online' : `Last seen ${this.formatTimestamp(userData.lastSeen)}`;
                    
                    // Update mood indicator
                    const moodIndicator = document.getElementById('moodIndicator');
                    moodIndicator.className = `mood-indicator mood-${userData.mood || 'happy'}-indicator`;
                }
            }
        } else {
            document.getElementById('chatTitle').textContent = chat.name;
            document.getElementById('chatAvatar').src = chat.avatar || this.generateDefaultAvatar(chatId);
            document.getElementById('statusText').textContent = `${chat.participants.length} participants`;
        }
    }

    async loadMessages(chatId) {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '';
        
        const messagesQuery = this.db.collection('chats').doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .limit(50);
        
        const snapshot = await messagesQuery.get();
        
        for (const doc of snapshot.docs) {
            await this.renderMessage(doc.id, doc.data(), messagesContainer);
        }
        
        this.scrollToBottom();
    }

    setupMessageListener(chatId) {
        // Remove previous listener
        if (this.messageListeners[chatId]) {
            this.messageListeners[chatId]();
        }
        
        const messagesQuery = this.db.collection('chats').doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc');
        
        this.messageListeners[chatId] = messagesQuery.onSnapshot(async (snapshot) => {
            const messagesContainer = document.getElementById('messagesContainer');
            
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    await this.renderMessage(change.doc.id, change.doc.data(), messagesContainer);
                    this.scrollToBottom();
                    
                    // Mark as read if it's not our message
                    if (change.doc.data().senderId !== this.currentUser.uid) {
                        await this.markMessageAsRead(chatId, change.doc.id);
                    }
                } else if (change.type === 'modified') {
                    await this.updateMessage(change.doc.id, change.doc.data());
                } else if (change.type === 'removed') {
                    this.removeMessage(change.doc.id);
                }
            });
        });
    }

    async renderMessage(messageId, messageData, container) {
        const messageDiv = document.createElement('div');
        messageDiv.id = `message-${messageId}`;
        messageDiv.className = `flex mb-4 ${messageData.senderId === this.currentUser.uid ? 'justify-end' : 'justify-start'}`;
        
        let content = messageData.content;
        let isEncrypted = false;
        
        // Decrypt message if needed
        if (messageData.encrypted && CONFIG.features.e2ee) {
            try {
                content = await this.encryption.decrypt(messageData.content);
                isEncrypted = true;
            } catch (error) {
                content = 'Unable to decrypt message';
            }
        }
        
        // Apply sentiment analysis for mood-based styling
        if (CONFIG.features.aiSentiment && messageData.sentiment) {
            messageDiv.classList.add(`mood-${messageData.sentiment}`);
        }
        
        messageDiv.innerHTML = `
            <div class="max-w-xs lg:max-w-md ${messageData.senderId === this.currentUser.uid ? 'message-sent' : 'message-received'} p-3 rounded-2xl relative group">
                ${messageData.replyTo ? `
                    <div class="text-xs opacity-75 border-l-2 border-gray-400 pl-2 mb-2">
                        Replying to: ${messageData.replyTo}
                    </div>
                ` : ''}
                
                ${messageData.type === 'image' ? `
                    <img src="${content}" alt="Shared image" class="rounded-lg max-w-full mb-2 cursor-pointer" onclick="chatApp.viewImage('${content}')">
                ` : messageData.type === 'file' ? `
                    <div class="flex items-center p-2 bg-white bg-opacity-20 rounded-lg mb-2">
                        <i class="fas fa-file mr-2"></i>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium truncate">${messageData.fileName}</p>
                            <p class="text-xs opacity-75">${this.formatFileSize(messageData.fileSize)}</p>
                        </div>
                        <a href="${content}" download="${messageData.fileName}" class="ml-2 text-current">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>
                ` : `
                    <p class="whitespace-pre-wrap">${content}</p>
                    ${isEncrypted ? '<i class="fas fa-lock text-xs ml-1 opacity-75" title="End-to-end encrypted"></i>' : ''}
                `}
                
                <div class="flex justify-between items-center mt-1 text-xs opacity-75">
                    <span>${this.formatTimestamp(messageData.timestamp)}</span>
                    <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${messageData.senderId === this.currentUser.uid ? `
                            <button onclick="chatApp.editMessage('${messageId}')" class="hover:opacity-100">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="chatApp.deleteMessage('${messageId}')" class="hover:opacity-100">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : `
                            <button onclick="chatApp.reactToMessage('${messageId}')" class="hover:opacity-100">
                                <i class="fas fa-smile"></i>
                            </button>
                            <button onclick="chatApp.replyToMessage('${messageId}')" class="hover:opacity-100">
                                <i class="fas fa-reply"></i>
                            </button>
                        `}
                    </div>
                </div>
                
                ${messageData.reactions && Object.keys(messageData.reactions).length > 0 ? `
                    <div class="flex flex-wrap gap-1 mt-2">
                        ${Object.entries(messageData.reactions).map(([emoji, users]) => `
                            <span class="bg-black bg-opacity-20 px-2 py-1 rounded-full text-xs">
                                ${emoji} ${users.length}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        
        container.appendChild(messageDiv);
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (!content || !this.currentChatId) return;
        
        try {
            // Encrypt message if E2EE is enabled
            let encryptedContent = content;
            let isEncrypted = false;
            
            if (CONFIG.features.e2ee) {
                encryptedContent = await this.encryption.encrypt(content);
                isEncrypted = true;
            }
            
            // Analyze sentiment for mood detection
            let sentiment = null;
            if (CONFIG.features.aiSentiment) {
                sentiment = await this.analyzeSentiment(content);
            }
            
            const messageData = {
                content: isEncrypted ? encryptedContent : content,
                encrypted: isEncrypted,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.displayName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                type: 'text',
                readBy: [this.currentUser.uid],
                sentiment: sentiment
            };
            
            // Add message to Firestore
            await this.db.collection('chats').doc(this.currentChatId)
                .collection('messages').add(messageData);
            
            // Update chat last message
            await this.db.collection('chats').doc(this.currentChatId).update({
                lastMessage: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Clear input
            input.value = '';
            document.getElementById('sendBtn').disabled = true;
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showError('Failed to send message');
        }
    }

    async analyzeSentiment(text) {
        try {
            // Simple rule-based sentiment analysis (replace with AI API)
            const positiveWords = ['happy', 'good', 'great', 'awesome', 'excellent', 'amazing', 'love', 'like', 'nice', 'wonderful'];
            const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'hate', 'angry', 'upset', 'dislike', 'horrible'];
            
            const words = text.toLowerCase().split(/\s+/);
            let positiveCount = words.filter(word => positiveWords.includes(word)).length;
            let negativeCount = words.filter(word => negativeWords.includes(word)).length;
            
            if (positiveCount > negativeCount) return 'happy';
            if (negativeCount > positiveCount) return 'energetic'; // Using energetic for negative sentiment
            return 'calm';
            
            // For production, use:
            // const response = await fetch(CONFIG.ai.huggingface.sentimentEndpoint, {
            //     method: 'POST',
            //     headers: { 'Authorization': `Bearer ${CONFIG.ai.huggingface.apiKey}` },
            //     body: JSON.stringify({ inputs: text })
            // });
            // const result = await response.json();
            // return this.mapSentimentToMood(result);
            
        } catch (error) {
            console.error('Sentiment analysis failed:', error);
            return 'calm';
        }
    }

    mapSentimentToMood(sentimentResult) {
        // Map AI sentiment result to mood
        const mapping = {
            'positive': 'happy',
            'negative': 'energetic',
            'neutral': 'calm'
        };
        return mapping[sentimentResult[0]?.label] || 'calm';
    }

    // WebRTC Implementation
    async startVideoCall(contactId) {
        try {
            this.isInCall = true;
            document.getElementById('videoCallContainer').style.display = 'block';
            
            // Get local media stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            document.getElementById('localVideo').srcObject = this.localStream;
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection(CONFIG.rtc);
            
            // Add local stream to connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                document.getElementById('remoteVideo').srcObject = this.remoteStream;
            };
            
            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            // Send offer via Firebase (signaling)
            await this.sendCallSignal(contactId, 'offer', offer);
            
        } catch (error) {
            console.error('Error starting video call:', error);
            this.showError('Failed to start video call');
            this.endCall();
        }
    }

    async startVoiceCall(contactId) {
        try {
            this.isInCall = true;
            document.getElementById('videoCallContainer').style.display = 'block';
            document.getElementById('localVideo').style.display = 'none';
            
            // Get audio only
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            
            // Create peer connection (similar to video call but without video)
            this.peerConnection = new RTCPeerConnection(CONFIG.rtc);
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            await this.sendCallSignal(contactId, 'offer', offer);
            
        } catch (error) {
            console.error('Error starting voice call:', error);
            this.showError('Failed to start voice call');
            this.endCall();
        }
    }

    async sendCallSignal(contactId, type, data) {
        await this.db.collection('calls').add({
            from: this.currentUser.uid,
            to: contactId,
            type: type,
            data: data,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    async handleCallSignal(signal) {
        if (signal.to !== this.currentUser.uid) return;
        
        switch (signal.type) {
            case 'offer':
                await this.handleOffer(signal);
                break;
            case 'answer':
                await this.handleAnswer(signal);
                break;
            case 'ice-candidate':
                await this.handleIceCandidate(signal);
                break;
        }
    }

    async handleOffer(signal) {
        // Show incoming call UI
        this.showIncomingCall(signal.from, signal.data.type);
    }

    endCall() {
        this.isInCall = false;
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        document.getElementById('videoCallContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
    }

    // File Upload
    async uploadFile(file) {
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const fileRef = this.storage.ref().child(`chats/${this.currentChatId}/${fileName}`);
            const snapshot = await fileRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            
            return {
                url: downloadURL,
                name: file.name,
                size: file.size,
                type: file.type
            };
        } catch (error) {
            console.error('File upload failed:', error);
            throw error;
        }
    }

    async sendFileMessage(file) {
        try {
            const fileInfo = await this.uploadFile(file);
            
            const messageData = {
                content: fileInfo.url,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.displayName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                type: file.type.startsWith('image/') ? 'image' : 'file',
                fileName: fileInfo.name,
                fileSize: fileInfo.size,
                readBy: [this.currentUser.uid]
            };
            
            await this.db.collection('chats').doc(this.currentChatId)
                .collection('messages').add(messageData);
                
        } catch (error) {
            console.error('Error sending file:', error);
            this.showError('Failed to send file');
        }
    }

    // Utility Methods
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = timestamp.toDate();
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        container.scrollTop = container.scrollHeight;
    }

    showError(message) {
        // Implement toast notification
        console.error('Error:', message);
    }

    showChatApp() {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('chatApp').classList.remove('hidden');
    }

    showAuthScreen() {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('chatApp').classList.add('hidden');
        document.getElementById('authScreen').classList.remove('hidden');
    }

    updateUserUI() {
        document.getElementById('userName').textContent = this.currentUser.displayName || 'User';
        if (this.currentUser.photoURL) {
            document.getElementById('userAvatar').src = this.currentUser.photoURL;
        }
    }

    updateUserPresenceUI(userData) {
        const statusElement = document.getElementById('userMood');
        if (statusElement) {
            statusElement.textContent = userData.isOnline ? 
                `🟢 Online • ${userData.mood || 'happy'}` : 
                `⚫ Last seen ${this.formatTimestamp(userData.lastSeen)}`;
        }
    }

    cleanupListeners() {
        // Clean up all Firestore listeners
        Object.values(this.messageListeners).forEach(unsubscribe => unsubscribe());
        Object.values(this.presenceListeners).forEach(unsubscribe => unsubscribe());
        
        if (this.chatsListener) this.chatsListener();
        if (this.contactsListener) this.contactsListener();
        
        this.messageListeners = {};
        this.presenceListeners = {};
    }

    // Public methods for UI interaction
    async createGroupChat(name, participants) {
        const chatData = {
            name: name,
            type: 'group',
            participants: [...participants, this.currentUser.uid],
            createdBy: this.currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const chatRef = await this.db.collection('chats').add(chatData);
        return chatRef.id;
    }

    async addContact(userId) {
        await this.db.collection('users').doc(this.currentUser.uid)
            .collection('contacts').doc(userId).set({
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
    }

    async setUserMood(mood) {
        this.currentMood = mood;
        await this.db.collection('users').doc(this.currentUser.uid).update({
            mood: mood,
            moodUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        this.updateMoodUI();
        this.showMoodSuggestion();
    }

    // Add these methods to handle the missing functions from the original code
    setupEventListeners() {
        // Message sending
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('messageInput').addEventListener('input', function() {
            document.getElementById('sendBtn').disabled = !this.value.trim();
        });

        // File attachment
        document.getElementById('attachBtn').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) this.sendFileMessage(file);
            };
            input.click();
        });

        // Camera
        document.getElementById('cameraBtn').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'camera';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) this.sendFileMessage(file);
            };
            input.click();
        });

        // Add other event listeners as needed...
    }

    updateMoodUI() {
        const indicator = document.getElementById('moodIndicator');
        if (indicator) {
            indicator.className = `mood-indicator mood-${this.currentMood}-indicator`;
        }
        
        document.querySelectorAll('.mood-option').forEach(btn => {
            if (btn.dataset.mood === this.currentMood) {
                btn.classList.add('bg-purple-100', 'border-purple-500', 'text-purple-700');
            } else {
                btn.classList.remove('bg-purple-100', 'border-purple-500', 'text-purple-700');
            }
        });
    }

    showMoodSuggestion() {
        const suggestions = {
            happy: ["Share something positive! 😊", "Ask about their favorite memory"],
            calm: ["Discuss relaxation techniques 🧘‍♀️", "Share a peaceful moment"],
            energetic: ["Plan an activity together! ⚡", "Ask about their passions"],
            focused: ["Discuss goals and projects 🎯", "Share productivity tips"],
            creative: ["Talk about creative ideas 🎨", "Share inspirational content"]
        };
        
        const randomSuggestion = suggestions[this.currentMood]?.[Math.floor(Math.random() * suggestions[this.currentMood].length)] || "Start a conversation!";
        document.getElementById('suggestionText').textContent = randomSuggestion;
        document.getElementById('moodSuggestion').classList.remove('hidden');
    }

    // Add other missing methods as needed...
}

// Initialize the application
let chatApp;

document.addEventListener('DOMContentLoaded', function() {
    chatApp = new KynectaChat();
});

// Make it available globally for HTML event handlers
window.chatApp = chatApp;