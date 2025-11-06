/**
 * UniConnect - Firebase Authentication Module
 * Handles user authentication with Firebase
 */

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
  authDomain: "uniconnect-ee95c.firebaseapp.com",
  projectId: "uniconnect-ee95c",
  storageBucket: "uniconnect-ee95c.firebasestorage.app",
  messagingSenderId: "1003264444309",
  appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

class FirebaseAuthService {
    constructor() {
        this.app = null;
        this.auth = null;
        this.db = null;
        this.isInitialized = false;
        this.init();
    }

    /**
     * Initializes Firebase authentication
     */
    async init() {
        try {
            // Update connection status
            this.updateConnectionStatus('connecting', 'Connecting to Firebase...');
            
            // Import and initialize Firebase
            const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
            const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            const { getFirestore, doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            // Initialize Firebase
            this.app = initializeApp(firebaseConfig);
            this.auth = getAuth(this.app);
            this.db = getFirestore(this.app);
            
            this.isInitialized = true;
            this.updateConnectionStatus('connected', 'Connected to Firebase');
            
            // Show security status
            document.getElementById('securityStatus').classList.remove('hidden');
            
            console.log('✅ Firebase initialized successfully!');
            console.log('📊 Project: uniconnect-ee95c');
            
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            this.updateConnectionStatus('disconnected', 'Firebase connection failed');
            
            // Show error message
            if (window.uniConnectApp) {
                window.uniConnectApp.showMessage('Firebase connection failed. Please check your connection.', 'error');
            }
        }
    }

    /**
     * Registers a new user with email and password
     * @param {string} email - User's email
     * @param {string} password - User's password
     * @param {string} displayName - User's display name
     * @returns {Promise<Object>} - User credentials
     */
    async registerUser(email, password, displayName) {
        if (!this.isInitialized || !this.auth) {
            throw new Error('Firebase not initialized. Please try again.');
        }

        try {
            // Import required functions
            const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            // Create user with email and password
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            const user = userCredential.user;
            
            // Update user profile with display name
            await updateProfile(user, {
                displayName: displayName
            });
            
            // Create user document in Firestore
            const userDocRef = doc(this.db, 'users', user.uid);
            await setDoc(userDocRef, {
                uid: user.uid,
                email: user.email,
                displayName: displayName,
                photoURL: '',
                bio: 'New UniConnect member!',
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
                emailVerified: false
            });
            
            // Store user info in localStorage
            localStorage.setItem('uniconnect-user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                displayName: displayName,
                isNewUser: true
            }));
            
            console.log('✅ User registered successfully:', user.email);
            return userCredential;
            
        } catch (error) {
            console.error('❌ Registration failed:', error);
            
            // Handle specific error cases
            let errorMessage = 'Registration failed. Please try again.';
            
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'This email is already registered. Please try logging in.';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak. Please use a stronger password (at least 6 characters).';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address. Please check your email.';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = 'Email/password accounts are not enabled. Please contact support.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Network error. Please check your internet connection.';
                    break;
                default:
                    errorMessage = `Registration failed: ${error.message}`;
            }
            
            throw new Error(errorMessage);
        }
    }

    /**
     * Logs in a user with email and password
     * @param {string} email - User's email
     * @param {string} password - User's password
     * @returns {Promise<Object>} - User credentials
     */
    async loginUser(email, password) {
        if (!this.isInitialized || !this.auth) {
            throw new Error('Firebase not initialized. Please try again.');
        }

        try {
            // Import required function
            const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            // Sign in user
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            const user = userCredential.user;
            
            // Update last login timestamp in Firestore
            const userDocRef = doc(this.db, 'users', user.uid);
            await setDoc(userDocRef, {
                lastLogin: serverTimestamp()
            }, { merge: true });
            
            // Store user info in localStorage
            localStorage.setItem('uniconnect-user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                isNewUser: false
            }));
            
            console.log('✅ User logged in successfully:', user.email);
            return userCredential;
            
        } catch (error) {
            console.error('❌ Login failed:', error);
            
            // Handle specific error cases
            let errorMessage = 'Login failed. Please try again.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email. Please register first.';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password. Please try again.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address. Please check your email.';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'This account has been disabled. Please contact support.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many failed attempts. Please try again later.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Network error. Please check your internet connection.';
                    break;
                default:
                    errorMessage = `Login failed: ${error.message}`;
            }
            
            throw new Error(errorMessage);
        }
    }

    /**
     * Signs out the current user
     * @returns {Promise<void>}
     */
    async signOut() {
        if (!this.isInitialized || !this.auth) {
            throw new Error('Firebase not initialized.');
        }

        try {
            const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await signOut(this.auth);
            
            // Remove user data from localStorage
            localStorage.removeItem('uniconnect-user');
            localStorage.removeItem('uniconnect-email');
            localStorage.removeItem('uniconnect-remember');
            
            console.log('✅ User signed out successfully');
            
        } catch (error) {
            console.error('❌ Sign out failed:', error);
            throw new Error('Sign out failed. Please try again.');
        }
    }

    /**
     * Gets the current authenticated user
     * @returns {Object|null} - The current user or null if not authenticated
     */
    getCurrentUser() {
        if (!this.isInitialized || !this.auth) {
            return null;
        }

        try {
            // Check Firebase auth first
            const firebaseUser = this.auth.currentUser;
            if (firebaseUser) {
                return {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    emailVerified: firebaseUser.emailVerified,
                    isNewUser: false
                };
            }
            
            // Fallback to localStorage for demo purposes
            const userData = localStorage.getItem('uniconnect-user');
            return userData ? JSON.parse(userData) : null;
            
        } catch (error) {
            console.error('❌ Error getting current user:', error);
            return null;
        }
    }

    /**
     * Checks if user is authenticated
     * @returns {boolean} - True if user is authenticated
     */
    isAuthenticated() {
        const user = this.getCurrentUser();
        return user !== null;
    }

    /**
     * Updates the connection status display
     * @param {string} status - The connection status (connected, connecting, disconnected)
     * @param {string} message - The status message to display
     */
    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connectionStatus');
        const textElement = document.getElementById('connectionText');
        
        if (statusElement && textElement) {
            statusElement.className = `connection-status ${status}`;
            
            // Update icon and text based on status
            if (status === 'connected') {
                statusElement.innerHTML = '<i class="fas fa-check-circle mr-2"></i><span id="connectionText">Connected to Firebase</span>';
            } else if (status === 'connecting') {
                statusElement.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i><span id="connectionText">Connecting to Firebase...</span>';
            } else {
                statusElement.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i><span id="connectionText">Connection Failed</span>';
            }
            
            // Update the text element reference
            const newTextElement = document.getElementById('connectionText');
            if (newTextElement) {
                newTextElement.textContent = message;
            }
        }
    }

    /**
     * Sends password reset email
     * @param {string} email - User's email
     * @returns {Promise<void>}
     */
    async sendPasswordResetEmail(email) {
        if (!this.isInitialized || !this.auth) {
            throw new Error('Firebase not initialized.');
        }

        try {
            const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await sendPasswordResetEmail(this.auth, email);
            
            console.log('✅ Password reset email sent successfully');
            
        } catch (error) {
            console.error('❌ Password reset failed:', error);
            
            let errorMessage = 'Failed to send password reset email. Please try again.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address.';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Network error. Please check your connection.';
                    break;
            }
            
            throw new Error(errorMessage);
        }
    }
}

// Initialize Firebase Auth Service
window.firebaseAuth = new FirebaseAuthService();

// Make Firebase available globally for debugging
window.getFirebaseAuth = () => window.firebaseAuth;