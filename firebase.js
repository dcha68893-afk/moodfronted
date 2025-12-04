// firebase.js
/**
 * UniConnect - Firebase Authentication Service
 * Handles all authentication business logic and user management
 */

// Import from our config file and additional Firebase methods
import { auth, db } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updatePassword,
  updateEmail
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

class FirebaseAuthService {
    constructor() {
        this.app = auth.app;
        this.auth = auth;
        this.db = db;
        this.isInitialized = false;
        this.userListeners = new Map(); // Store real-time listeners
        this.init();
    }

    /**
     * Initializes Firebase authentication service
     */
    async init() {
        try {
            this.updateConnectionStatus('connecting', 'Connecting to Firebase...');
            
            console.log('🔥 Initializing Firebase Authentication Service...');
            
            // Test authentication connection
            await new Promise((resolve, reject) => {
                const unsubscribe = onAuthStateChanged(this.auth, (user) => {
                    unsubscribe();
                    resolve(user);
                }, (error) => {
                    unsubscribe();
                    reject(error);
                });
                
                setTimeout(() => reject(new Error('Connection timeout')), 8000);
            });
            
            this.isInitialized = true;
            this.updateConnectionStatus('connected', 'Secure Connection Established');
            this.showSecurityStatus(true);
            
            console.log('✅ Firebase Auth Service initialized successfully!');
            
        } catch (error) {
            console.error('❌ Firebase Auth Service initialization failed:', error);
            this.updateConnectionStatus('disconnected', 'Connection Failed');
            this.showSecurityStatus(false);
            this.handleFirebaseError(error, 'Firebase initialization');
        }
    }

    /**
     * Enhanced Firebase error handling
     */
    handleFirebaseError(error, context = 'operation') {
        let userMessage = 'An unexpected error occurred';
        
        if (error.code) {
            switch (error.code) {
                case 'auth/email-already-in-use':
                    userMessage = 'This email is already registered. Please try logging in.';
                    break;
                case 'auth/weak-password':
                    userMessage = 'Password must be at least 6 characters. Please use a stronger password.';
                    break;
                case 'auth/invalid-email':
                    userMessage = 'The email address is not valid.';
                    break;
                case 'auth/network-request-failed':
                    userMessage = 'Network error. Please check your internet connection.';
                    break;
                case 'auth/user-disabled':
                    userMessage = 'This account has been disabled. Please contact support.';
                    break;
                case 'auth/too-many-requests':
                    userMessage = 'Too many failed attempts. Please try again later.';
                    break;
                case 'auth/user-not-found':
                    userMessage = 'No account found with this email. Please register first.';
                    break;
                case 'auth/wrong-password':
                    userMessage = 'Incorrect password. Please try again.';
                    break;
                case 'permission-denied':
                    userMessage = 'You do not have permission to perform this action.';
                    break;
                case 'unavailable':
                    userMessage = 'Service is temporarily unavailable. Please try again later.';
                    break;
                default:
                    userMessage = `Error during ${context}: ${error.message || 'Please try again'}`;
            }
        } else {
            userMessage = `Error during ${context}: ${error.message || 'Unknown error occurred'}`;
        }
        
        console.error(`❌ Firebase error in ${context}:`, error.code, error.message);
        
        // Show error to user if possible
        if (window.uniConnectApp && typeof window.uniConnectApp.showMessage === 'function') {
            window.uniConnectApp.showMessage(userMessage, 'error');
        }
        
        return userMessage;
    }

    /**
     * Registers a new user with email and password
     */
    async registerUser(email, password, displayName, moods = [], interests = []) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized. Please try again.');
        }

        try {
            // Create user with email and password
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            const user = userCredential.user;
            
            // Update user profile with display name
            await updateProfile(user, {
                displayName: displayName
            });
            
            // Create user document in Firestore with moods and interests
            const userDocRef = doc(this.db, 'users', user.uid);
            await setDoc(userDocRef, {
                uid: user.uid,
                displayName: displayName,
                email: user.email,
                moods: moods,                    // Added: User selected moods
                interests: interests,            // Added: User selected interests
                customColors: {                  // Added: User custom colors
                    primary: '#3B82F6',
                    secondary: '#8B5CF6',
                    theme: 'calm'
                },
                avatar: this.getDefaultAvatar(displayName),
                status: 'Online',
                statusType: 'online',
                streak: 1,
                unicoins: 100,
                level: 1,
                experience: 0,
                posts: 0,
                followers: 0,
                following: 0,
                isAnonymous: false,
                isGuest: false,
                authProvider: 'email',
                emailVerified: user.emailVerified,
                createdAt: serverTimestamp(),
                lastSeen: serverTimestamp(),
                lastLogin: serverTimestamp(),
                preferences: {
                    theme: 'dark',
                    notifications: true,
                    language: 'en'
                },
                gameStats: {
                    gamesPlayed: 0,
                    totalCoinsEarned: 0,
                    favoriteGame: null
                }
            });
            
            // Store user info in localStorage
            localStorage.setItem('uniconnect-user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                displayName: displayName,
                moods: moods,
                interests: interests,
                customColors: {
                    primary: '#3B82F6',
                    secondary: '#8B5CF6',
                    theme: 'calm'
                },
                isNewUser: true
            }));
            
            console.log('✅ User registered successfully:', user.email);
            return userCredential;
            
        } catch (error) {
            console.error('❌ Registration failed:', error);
            throw new Error(this.handleFirebaseError(error, 'user registration'));
        }
    }

    /**
     * Logs in a user with email and password
     */
    async loginUser(email, password) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized. Please try again.');
        }

        try {
            // Sign in user
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            const user = userCredential.user;
            
            // Get user data to include moods and interests
            const userData = await this.getUserData(user.uid);
            
            // Update last login timestamp and status in Firestore
            const userDocRef = doc(this.db, 'users', user.uid);
            await updateDoc(userDocRef, {
                lastSeen: serverTimestamp(),
                lastLogin: serverTimestamp(),
                status: 'Online',
                statusType: 'online'
            });
            
            // Store user info in localStorage with moods and interests
            localStorage.setItem('uniconnect-user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                moods: userData.moods || [],
                interests: userData.interests || [],
                customColors: userData.customColors || {
                    primary: '#3B82F6',
                    secondary: '#8B5CF6',
                    theme: 'calm'
                },
                isNewUser: false
            }));
            
            console.log('✅ User logged in successfully:', user.email);
            return userCredential;
            
        } catch (error) {
            console.error('❌ Login failed:', error);
            throw new Error(this.handleFirebaseError(error, 'user login'));
        }
    }

    /**
     * Signs out the current user
     */
    async signOut() {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }

        try {
            // Update user status to offline before signing out
            const user = this.getCurrentUser();
            if (user && user.uid) {
                const userDocRef = doc(this.db, 'users', user.uid);
                await updateDoc(userDocRef, {
                    status: 'Offline',
                    statusType: 'offline',
                    lastSeen: serverTimestamp()
                });
            }
            
            // Remove real-time listeners
            this.removeAllUserListeners();
            
            await signOut(this.auth);
            
            // Remove user data from localStorage
            localStorage.removeItem('uniconnect-user');
            localStorage.removeItem('uniconnect-email');
            localStorage.removeItem('uniconnect-remember');
            
            console.log('✅ User signed out successfully');
            
        } catch (error) {
            console.error('❌ Sign out failed:', error);
            throw new Error(this.handleFirebaseError(error, 'user sign out'));
        }
    }

    /**
     * Gets the current authenticated user
     */
    getCurrentUser() {
        if (!this.isInitialized) {
            return null;
        }

        try {
            // Check Firebase auth first
            const firebaseUser = this.auth.currentUser;
            if (firebaseUser) {
                // Try to get data from localStorage first
                const userData = localStorage.getItem('uniconnect-user');
                if (userData) {
                    const parsedData = JSON.parse(userData);
                    return {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName,
                        emailVerified: firebaseUser.emailVerified,
                        moods: parsedData.moods || [],
                        interests: parsedData.interests || [],
                        customColors: parsedData.customColors || {
                            primary: '#3B82F6',
                            secondary: '#8B5CF6',
                            theme: 'calm'
                        },
                        isNewUser: false
                    };
                }
                
                return {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    emailVerified: firebaseUser.emailVerified,
                    moods: [],
                    interests: [],
                    customColors: {
                        primary: '#3B82F6',
                        secondary: '#8B5CF6',
                        theme: 'calm'
                    },
                    isNewUser: false
                };
            }
            
            // Fallback to localStorage
            const userData = localStorage.getItem('uniconnect-user');
            return userData ? JSON.parse(userData) : null;
            
        } catch (error) {
            console.error('❌ Error getting current user:', error);
            return null;
        }
    }

    /**
     * Checks if user is authenticated
     */
    isAuthenticated() {
        const user = this.getCurrentUser();
        return user !== null;
    }

    /**
     * Sends password reset email
     */
    async sendPasswordResetEmail(email) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }

        try {
            await sendPasswordResetEmail(this.auth, email);
            console.log('✅ Password reset email sent successfully');
        } catch (error) {
            console.error('❌ Password reset failed:', error);
            throw new Error(this.handleFirebaseError(error, 'send password reset'));
        }
    }

    /**
     * Updates user profile information including moods and interests
     */
    async updateUserProfile(updates) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }

        try {
            const user = this.auth.currentUser;
            if (!user) throw new Error('No user logged in');

            // Update Firebase auth profile
            if (updates.displayName) {
                await updateProfile(user, {
                    displayName: updates.displayName
                });
            }

            // Update Firestore user document
            const userDocRef = doc(this.db, 'users', user.uid);
            await updateDoc(userDocRef, updates);

            // Update localStorage
            const currentUserData = JSON.parse(localStorage.getItem('uniconnect-user') || '{}');
            localStorage.setItem('uniconnect-user', JSON.stringify({
                ...currentUserData,
                ...updates
            }));

            console.log('✅ User profile updated successfully');
        } catch (error) {
            console.error('❌ Profile update failed:', error);
            throw new Error(this.handleFirebaseError(error, 'profile update'));
        }
    }

    /**
     * Updates user moods selection
     */
    async updateUserMoods(moods) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }

        try {
            const user = this.auth.currentUser;
            if (!user) throw new Error('No user logged in');

            const userDocRef = doc(this.db, 'users', user.uid);
            await updateDoc(userDocRef, {
                moods: moods,
                lastSeen: serverTimestamp()
            });

            // Update localStorage
            const currentUserData = JSON.parse(localStorage.getItem('uniconnect-user') || '{}');
            currentUserData.moods = moods;
            localStorage.setItem('uniconnect-user', JSON.stringify(currentUserData));

            console.log('✅ User moods updated successfully:', moods);
            return true;
        } catch (error) {
            console.error('❌ Moods update failed:', error);
            throw new Error(this.handleFirebaseError(error, 'moods update'));
        }
    }

    /**
     * Updates user interests selection
     */
    async updateUserInterests(interests) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }

        try {
            const user = this.auth.currentUser;
            if (!user) throw new Error('No user logged in');

            const userDocRef = doc(this.db, 'users', user.uid);
            await updateDoc(userDocRef, {
                interests: interests,
                lastSeen: serverTimestamp()
            });

            // Update localStorage
            const currentUserData = JSON.parse(localStorage.getItem('uniconnect-user') || '{}');
            currentUserData.interests = interests;
            localStorage.setItem('uniconnect-user', JSON.stringify(currentUserData));

            console.log('✅ User interests updated successfully:', interests);
            return true;
        } catch (error) {
            console.error('❌ Interests update failed:', error);
            throw new Error(this.handleFirebaseError(error, 'interests update'));
        }
    }

    /**
     * Updates user custom colors
     */
    async updateUserColors(customColors) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }

        try {
            const user = this.auth.currentUser;
            if (!user) throw new Error('No user logged in');

            const userDocRef = doc(this.db, 'users', user.uid);
            await updateDoc(userDocRef, {
                customColors: customColors,
                lastSeen: serverTimestamp()
            });

            // Update localStorage
            const currentUserData = JSON.parse(localStorage.getItem('uniconnect-user') || '{}');
            currentUserData.customColors = customColors;
            localStorage.setItem('uniconnect-user', JSON.stringify(currentUserData));

            console.log('✅ User colors updated successfully:', customColors);
            return true;
        } catch (error) {
            console.error('❌ Colors update failed:', error);
            throw new Error(this.handleFirebaseError(error, 'colors update'));
        }
    }

    /**
     * Get user data from Firestore
     */
    async getUserData(uid) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }

        try {
            const userDocRef = doc(this.db, 'users', uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
                return userDoc.data();
            } else {
                throw new Error('User data not found');
            }
        } catch (error) {
            console.error('❌ Get user data failed:', error);
            throw new Error(this.handleFirebaseError(error, 'get user data'));
        }
    }

    /**
     * Add real-time listener for user data changes
     */
    addUserListener(uid, callback) {
        if (!this.isInitialized) {
            console.warn('Firebase not initialized, cannot add listener');
            return null;
        }

        try {
            const userDocRef = doc(this.db, 'users', uid);
            
            const unsubscribe = onSnapshot(userDocRef, (doc) => {
                if (doc.exists()) {
                    const userData = doc.data();
                    callback(userData);
                    
                    // Update localStorage with latest data
                    const currentUserData = JSON.parse(localStorage.getItem('uniconnect-user') || '{}');
                    if (currentUserData.uid === uid) {
                        const updatedData = {
                            ...currentUserData,
                            moods: userData.moods || [],
                            interests: userData.interests || [],
                            customColors: userData.customColors || {
                                primary: '#3B82F6',
                                secondary: '#8B5CF6',
                                theme: 'calm'
                            }
                        };
                        localStorage.setItem('uniconnect-user', JSON.stringify(updatedData));
                    }
                }
            }, (error) => {
                console.error('❌ Real-time listener error:', error);
                this.handleFirebaseError(error, 'real-time listener');
            });

            // Store the unsubscribe function
            const listenerId = `user_${uid}_${Date.now()}`;
            this.userListeners.set(listenerId, unsubscribe);
            
            console.log(`✅ Added real-time listener for user: ${uid}`);
            return listenerId;
            
        } catch (error) {
            console.error('❌ Failed to add user listener:', error);
            return null;
        }
    }

    /**
     * Remove specific user listener
     */
    removeUserListener(listenerId) {
        const unsubscribe = this.userListeners.get(listenerId);
        if (unsubscribe) {
            unsubscribe();
            this.userListeners.delete(listenerId);
            console.log(`✅ Removed listener: ${listenerId}`);
        }
    }

    /**
     * Remove all user listeners
     */
    removeAllUserListeners() {
        this.userListeners.forEach((unsubscribe, listenerId) => {
            unsubscribe();
            console.log(`✅ Removed listener: ${listenerId}`);
        });
        this.userListeners.clear();
    }

    /**
     * Get user document reference for real-time updates
     */
    getUserDocRef(uid) {
        if (!this.isInitialized) {
            throw new Error('Firebase not initialized.');
        }
        return doc(this.db, 'users', uid);
    }

    /**
     * Shows security status with appropriate icons
     */
    showSecurityStatus(isConnected) {
        const securityStatus = document.getElementById('securityStatus');
        if (!securityStatus) return;
        
        securityStatus.classList.remove('hidden');
        
        if (isConnected) {
            securityStatus.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <i class="fas fa-check-circle text-green-400 text-lg"></i>
                        <div>
                            <span class="text-sm font-medium text-green-400">Secure Connection Established</span>
                            <p class="text-xs text-blue-300 mt-1">All data is encrypted and secure</p>
                        </div>
                    </div>
                    <div class="flex space-x-1">
                        <span class="security-badge">
                            <i class="fas fa-lock mr-1"></i> HTTPS
                        </span>
                        <span class="security-badge">
                            <i class="fas fa-shield-alt mr-1"></i> Encrypted
                        </span>
                    </div>
                </div>
            `;
        } else {
            securityStatus.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <i class="fas fa-times-circle text-red-400 text-lg"></i>
                        <div>
                            <span class="text-sm font-medium text-red-400">Connection Failed</span>
                            <p class="text-xs text-blue-300 mt-1">Please check your internet connection</p>
                        </div>
                    </div>
                    <div class="flex space-x-1">
                        <span class="security-badge" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #fca5a5;">
                            <i class="fas fa-unlock mr-1"></i> Offline
                        </span>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Updates the connection status display
     */
    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connectionStatus');
        const textElement = document.getElementById('connectionText');
        
        if (statusElement && textElement) {
            statusElement.className = `connection-status ${status}`;
            
            if (status === 'connected') {
                statusElement.innerHTML = '<i class="fas fa-check-circle mr-2"></i><span id="connectionText">' + message + '</span>';
            } else if (status === 'connecting') {
                statusElement.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i><span id="connectionText">' + message + '</span>';
            } else {
                statusElement.innerHTML = '<i class="fas fa-times-circle mr-2"></i><span id="connectionText">' + message + '</span>';
            }
        }
    }

    /**
     * Get default avatar URL
     */
    getDefaultAvatar(name) {
        const colors = ['6366f1', 'ef4444', '10b981', 'f59e0b', '8b5cf6'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${randomColor}&color=fff&size=150&bold=true`;
    }
}

// Initialize Firebase Auth Service
window.firebaseAuth = new FirebaseAuthService();

// Make Firebase available globally for debugging
window.getFirebaseAuth = () => window.firebaseAuth;