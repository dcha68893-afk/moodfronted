// firebase.js - Optimized for Chat System
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp, 
    getDocs, 
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    where,
    limit,
    arrayUnion,
    arrayRemove,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendEmailVerification,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL,
    deleteObject 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
    authDomain: "uniconnect-ee95c.firebaseapp.com",
    projectId: "uniconnect-ee95c",
    storageBucket: "uniconnect-ee95c.appspot.com",
    messagingSenderId: "1003264444309",
    appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

class FirebaseChatService {
    constructor() {
        this.app = app;
        this.db = db;
        this.auth = auth;
        this.storage = storage;
        this.currentUser = null;
        this.isConnected = false;
        this.unsubscribeFunctions = [];
    }

    async initialize() {
        try {
            console.log("🔥 Initializing Firebase Chat Service...");
            this.setupAuthListener();
            this.isConnected = true;
            console.log("✅ Firebase Chat Service initialized successfully");
            return true;
        } catch (error) {
            console.error("❌ Firebase initialization failed:", error);
            this.isConnected = false;
            throw error;
        }
    }

    setupAuthListener() {
        return onAuthStateChanged(this.auth, (user) => {
            this.currentUser = user;
            if (user) {
                console.log("👤 User authenticated:", user.uid);
                this.updateUserStatus(true);
            } else {
                console.log("👤 No user signed in");
            }
        });
    }

    // AUTH METHODS
    async signUpWithEmail(email, password, userData = {}) {
        try {
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            this.currentUser = userCredential.user;
            
            await sendEmailVerification(this.currentUser);
            await this.createUserProfile(userData);
            
            return userCredential;
        } catch (error) {
            console.error("❌ Email sign-up failed:", error);
            throw error;
        }
    }

    async signInWithEmail(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            this.currentUser = userCredential.user;
            await this.updateUserStatus(true);
            return userCredential;
        } catch (error) {
            console.error("❌ Email sign-in failed:", error);
            throw error;
        }
    }

    async signInWithGoogle() {
        try {
            const provider = new GoogleAuthProvider();
            const userCredential = await signInWithPopup(this.auth, provider);
            this.currentUser = userCredential.user;
            await this.createUserProfile();
            return userCredential;
        } catch (error) {
            console.error("❌ Google sign-in failed:", error);
            throw error;
        }
    }

    async signOut() {
        try {
            await this.updateUserStatus(false);
            await signOut(this.auth);
            this.cleanup();
        } catch (error) {
            console.error("❌ Sign out failed:", error);
            throw error;
        }
    }

    // USER MANAGEMENT
    async createUserProfile(userData = {}) {
        if (!this.currentUser) throw new Error("User not authenticated");

        const userProfile = {
            uid: this.currentUser.uid,
            email: this.currentUser.email,
            name: userData.name || this.currentUser.displayName || `User_${this.currentUser.uid.slice(-6)}`,
            role: userData.role || 'student',
            avatar: userData.avatar || this.getInitials(userData.name || this.currentUser.displayName || 'User'),
            online: true,
            createdAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
            emailVerified: this.currentUser.emailVerified
        };

        await setDoc(doc(this.db, 'users', this.currentUser.uid), userProfile);
        return userProfile;
    }

    async updateUserProfile(profileData) {
        if (!this.currentUser) throw new Error("User not authenticated");

        const updateData = {
            ...profileData,
            lastUpdated: serverTimestamp()
        };

        if (profileData.name) {
            updateData.avatar = this.getInitials(profileData.name);
        }

        await setDoc(doc(this.db, 'users', this.currentUser.uid), updateData, { merge: true });

        // Update auth profile
        if (profileData.name) {
            await updateProfile(this.currentUser, {
                displayName: profileData.name
            });
        }
    }

    async updateUserStatus(online) {
        if (!this.currentUser) return;
        
        await setDoc(doc(this.db, 'users', this.currentUser.uid), {
            online: online,
            lastSeen: serverTimestamp()
        }, { merge: true });
    }

    async getUser(userId) {
        const docRef = doc(this.db, 'users', userId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    }

    async getAllUsers() {
        const usersRef = collection(this.db, 'users');
        const q = query(usersRef, where('uid', '!=', this.currentUser.uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    }

    // CHAT MANAGEMENT
    async createChat(chatData) {
        if (!this.currentUser) throw new Error("User not authenticated");

        const chat = {
            name: chatData.name,
            type: chatData.type || 'public',
            members: [this.currentUser.uid, ...chatData.members],
            createdBy: this.currentUser.uid,
            avatarText: chatData.avatarText || chatData.name.substring(0, 2).toUpperCase(),
            createdAt: serverTimestamp(),
            lastMessage: 'Chat created',
            lastMessageTime: serverTimestamp(),
            lastRead: {
                [this.currentUser.uid]: serverTimestamp()
            }
        };

        const chatRef = await addDoc(collection(this.db, 'chats'), chat);
        return chatRef.id;
    }

    async sendMessage(chatId, content, messageType = 'normal') {
        if (!this.currentUser) throw new Error("User not authenticated");

        const messageData = {
            senderId: this.currentUser.uid,
            content: content,
            type: messageType,
            timestamp: serverTimestamp(),
            status: 'sent'
        };

        // Add message to subcollection
        const messageRef = await addDoc(
            collection(this.db, 'chats', chatId, 'messages'), 
            messageData
        );

        // Update chat last message
        await updateDoc(doc(this.db, 'chats', chatId), {
            lastMessage: content,
            lastMessageTime: serverTimestamp()
        });

        return messageRef.id;
    }

    subscribeToChats(callback) {
        if (!this.currentUser) return;

        const chatsRef = collection(this.db, 'chats');
        const q = query(
            chatsRef, 
            where('members', 'array-contains', this.currentUser.uid),
            orderBy('lastMessageTime', 'desc')
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const chats = await Promise.all(
                snapshot.docs.map(async (docSnap) => {
                    const chatData = docSnap.data();
                    
                    // Get members data
                    const membersData = await Promise.all(
                        chatData.members.map(memberId => this.getUser(memberId))
                    );

                    return {
                        id: docSnap.id,
                        ...chatData,
                        members: membersData.filter(m => m !== null)
                    };
                })
            );

            callback(chats);
        });

        this.unsubscribeFunctions.push(unsubscribe);
        return unsubscribe;
    }

    subscribeToMessages(chatId, callback, limit = 100) {
        const messagesRef = collection(this.db, 'chats', chatId, 'messages');
        const q = query(
            messagesRef,
            orderBy('timestamp', 'asc'),
            limit(limit)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const messages = await Promise.all(
                snapshot.docs.map(async (docSnap) => {
                    const messageData = docSnap.data();
                    const sender = await this.getUser(messageData.senderId);
                    
                    return {
                        id: docSnap.id,
                        ...messageData,
                        sender: sender || { name: 'Unknown User', avatar: 'UU' },
                        time: this.formatTime(messageData.timestamp?.toDate()),
                        timestamp: messageData.timestamp
                    };
                })
            );

            callback(messages);
        });

        this.unsubscribeFunctions.push(unsubscribe);
        return unsubscribe;
    }

    async markAsRead(chatId) {
        if (!this.currentUser) return;

        await updateDoc(doc(this.db, 'chats', chatId), {
            [`lastRead.${this.currentUser.uid}`]: serverTimestamp()
        });
    }

    async leaveChat(chatId) {
        if (!this.currentUser) return;

        const chatRef = doc(this.db, 'chats', chatId);
        const chatDoc = await getDoc(chatRef);
        
        if (chatDoc.exists()) {
            const chatData = chatDoc.data();
            const updatedMembers = chatData.members.filter(memberId => memberId !== this.currentUser.uid);
            
            await updateDoc(chatRef, {
                members: updatedMembers
            });
        }
    }

    // GROUP MANAGEMENT
    async addMembersToChat(chatId, memberIds) {
        const chatRef = doc(this.db, 'chats', chatId);
        await updateDoc(chatRef, {
            members: arrayUnion(...memberIds)
        });
    }

    async removeMembersFromChat(chatId, memberIds) {
        const chatRef = doc(this.db, 'chats', chatId);
        await updateDoc(chatRef, {
            members: arrayRemove(...memberIds)
        });
    }

    // FILE UPLOADS FOR CHAT
    async uploadChatFile(file, chatId) {
        if (!this.currentUser) throw new Error("User not authenticated");

        const fileRef = ref(this.storage, `chats/${chatId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return {
            url: downloadURL,
            name: file.name,
            size: file.size,
            type: file.type
        };
    }

    async uploadProfilePicture(file) {
        if (!this.currentUser) throw new Error("User not authenticated");

        const fileRef = ref(this.storage, `profile-pictures/${this.currentUser.uid}`);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // Update user profile with new photo URL
        await this.updateUserProfile({ photoURL: downloadURL });
        
        return downloadURL;
    }

    // NOTIFICATIONS
    async sendChatNotification(chatId, title, message) {
        const chatDoc = await getDoc(doc(this.db, 'chats', chatId));
        if (!chatDoc.exists()) return;

        const chatData = chatDoc.data();
        const notifications = chatData.members
            .filter(memberId => memberId !== this.currentUser.uid)
            .map(memberId => ({
                userId: memberId,
                title: title,
                message: message,
                chatId: chatId,
                type: 'chat',
                read: false,
                timestamp: serverTimestamp()
            }));

        // Batch write for efficiency
        const batch = writeBatch(this.db);
        notifications.forEach(notification => {
            const notificationRef = doc(collection(this.db, 'notifications'));
            batch.set(notificationRef, notification);
        });
        await batch.commit();
    }

    subscribeToUserNotifications(callback) {
        if (!this.currentUser) return;

        const notificationsRef = collection(this.db, 'notifications');
        const q = query(
            notificationsRef,
            where('userId', '==', this.currentUser.uid),
            orderBy('timestamp', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(notifications);
        });

        this.unsubscribeFunctions.push(unsubscribe);
        return unsubscribe;
    }

    // UTILITY METHODS
    getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    }

    formatTime(date) {
        if (!date) return '';
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        });
    }

    // CLEANUP
    cleanup() {
        this.unsubscribeFunctions.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') unsubscribe();
        });
        this.unsubscribeFunctions = [];
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getConnectionStatus() {
        return this.isConnected;
    }
}

const firebaseChatService = new FirebaseChatService();
window.firebaseChatService = firebaseChatService;
export { firebaseChatService };

console.log("🔥 Firebase Chat Service loaded successfully!");