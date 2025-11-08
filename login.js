// login.js - User Login with Firebase Auth
console.log('🔐 Login script loaded');

// Firebase configuration will be set via environment variables in production
let auth, db;

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        // Check if Firebase config is available (set via environment variables or config file)
        if (typeof firebaseConfig !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase initialized with provided config');
        } else {
            // Try to get config from environment or use default (for development)
            const config = getFirebaseConfig();
            firebase.initializeApp(config);
            console.log('✅ Firebase initialized with environment config');
        }
    }
    auth = firebase.auth();
    db = firebase.firestore();
    console.log('✅ Firebase services initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    handleFirebaseError(error, 'initialize Firebase');
}

// DOM Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const statusMessage = document.getElementById('statusMessage');
const guestLoginBtn = document.getElementById('guestLogin');
const googleLoginBtn = document.getElementById('googleLogin');
const facebookLoginBtn = document.getElementById('facebookLogin');
const forgotPasswordLink = document.getElementById('forgotPassword');

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏠 Login page loaded');
    
    // Clear any cached authentication data
    clearAuthCache();
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (guestLoginBtn) {
        guestLoginBtn.addEventListener('click', handleGuestLogin);
    }
    
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', handleGoogleLogin);
    }
    
    if (facebookLoginBtn) {
        facebookLoginBtn.addEventListener('click', handleFacebookLogin);
    }
    
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', handleForgotPassword);
    }
    
    // Check authentication state
    checkAuthState();
});

// Get Firebase configuration from environment
function getFirebaseConfig() {
    // In production, these should be set as environment variables
    // For development, you can create a config.js file that sets window.firebaseConfig
    if (typeof window !== 'undefined' && window.firebaseConfig) {
        return window.firebaseConfig;
    }
    
    // Fallback for development (will be overridden by environment variables in production)
    return {
        apiKey: process.env.FIREBASE_API_KEY || "demo-key",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "uniconnect-dev.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "uniconnect-dev",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "uniconnect-dev.appspot.com",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "123456789",
        appId: process.env.FIREBASE_APP_ID || "1:123456789:web:abcdef123456"
    };
}

// Clear cached authentication data
function clearAuthCache() {
    // Clear any stored authentication data
    localStorage.removeItem('userData');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('firebaseUser');
    
    // Clear Firebase auth state persistence if needed
    if (auth) {
        auth.signOut().catch(error => {
            // Ignore errors from signOut when no user is logged in
            console.log('No user to sign out');
        });
    }
}

// Check authentication state and redirect if already logged in
function checkAuthState() {
    if (!auth) {
        showStatus('Authentication service not available', 'error');
        return;
    }
    
    auth.onAuthStateChanged(async (user) => {
        if (user && window.location.pathname.includes('login.html')) {
            console.log('ℹ️ User already logged in:', user.uid);
            
            try {
                // Verify user exists in Firestore
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                if (userDoc.exists) {
                    console.log('✅ User document verified, redirecting to profile...');
                    showStatus('Welcome back! Redirecting...', 'success');
                    
                    setTimeout(() => {
                        window.location.href = 'profile.html';
                    }, 1000);
                } else {
                    // User doesn't exist in Firestore, sign them out
                    console.log('❌ User document not found, signing out...');
                    await auth.signOut();
                    showStatus('Session expired. Please login again.', 'error');
                }
            } catch (error) {
                console.error('❌ Error checking user document:', error);
                handleFirebaseError(error, 'check user authentication');
            }
        }
    }, (error) => {
        console.error('❌ Auth state change error:', error);
        handleFirebaseError(error, 'monitor authentication state');
    });
}

// Handle user login
async function handleLogin(event) {
    event.preventDefault();
    
    if (!auth) {
        showStatus('Authentication service not available', 'error');
        return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showStatus('Please enter both email and password', 'error');
        return;
    }

    if (!validateEmail(email)) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }

    try {
        showStatus('Signing in...', 'info');
        setFormLoading(true);
        
        // Sign in with email and password
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        console.log('✅ User signed in:', user.uid);
        
        // Verify user exists in Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Create user document if it doesn't exist
            await createUserDocument(user);
        } else {
            // Update user's last seen timestamp
            await updateUserLastSeen(user.uid);
        }
        
        showStatus('Login successful! Redirecting...', 'success');
        
        // Redirect to profile page
        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 1500);

    } catch (error) {
        console.error('❌ Login error:', error);
        setFormLoading(false);
        handleFirebaseError(error, 'user login');
    }
}

// Handle guest login (anonymous authentication)
async function handleGuestLogin() {
    if (!auth) {
        showStatus('Authentication service not available', 'error');
        return;
    }

    try {
        showStatus('Creating guest account...', 'info');
        setFormLoading(true);
        
        const userCredential = await auth.signInAnonymously();
        const user = userCredential.user;
        
        console.log('✅ Guest user signed in:', user.uid);
        
        // Create guest user document
        await createGuestUserDocument(user.uid);
        
        showStatus('Guest login successful! Redirecting...', 'success');
        
        // Redirect to profile page
        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 1500);

    } catch (error) {
        console.error('❌ Guest login error:', error);
        setFormLoading(false);
        handleFirebaseError(error, 'guest login');
    }
}

// Handle Google login
async function handleGoogleLogin() {
    if (!auth) {
        showStatus('Authentication service not available', 'error');
        return;
    }

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        showStatus('Connecting with Google...', 'info');
        setFormLoading(true);
        
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        console.log('✅ Google user signed in:', user.uid);
        
        // Check if user exists in Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Create user document for Google user
            await createSocialUserDocument(user, 'google');
        } else {
            // Update user's last seen
            await updateUserLastSeen(user.uid);
        }
        
        showStatus('Google login successful! Redirecting...', 'success');
        
        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 1500);
        
    } catch (error) {
        console.error('❌ Google login error:', error);
        setFormLoading(false);
        handleFirebaseError(error, 'Google login');
    }
}

// Handle Facebook login
async function handleFacebookLogin() {
    if (!auth) {
        showStatus('Authentication service not available', 'error');
        return;
    }

    try {
        const provider = new firebase.auth.FacebookAuthProvider();
        provider.addScope('email');
        provider.addScope('public_profile');
        
        showStatus('Connecting with Facebook...', 'info');
        setFormLoading(true);
        
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        console.log('✅ Facebook user signed in:', user.uid);
        
        // Check if user exists in Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Create user document for Facebook user
            await createSocialUserDocument(user, 'facebook');
        } else {
            // Update user's last seen
            await updateUserLastSeen(user.uid);
        }
        
        showStatus('Facebook login successful! Redirecting...', 'success');
        
        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 1500);
        
    } catch (error) {
        console.error('❌ Facebook login error:', error);
        setFormLoading(false);
        handleFirebaseError(error, 'Facebook login');
    }
}

// Handle forgot password
async function handleForgotPassword(event) {
    event.preventDefault();
    
    if (!auth) {
        showStatus('Authentication service not available', 'error');
        return;
    }
    
    const email = prompt('Please enter your email address to reset your password:');
    
    if (!email) {
        return; // User cancelled
    }
    
    if (!validateEmail(email)) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }
    
    try {
        showStatus('Sending password reset email...', 'info');
        
        await auth.sendPasswordResetEmail(email);
        
        showStatus('Password reset email sent! Check your inbox.', 'success');
        
    } catch (error) {
        console.error('❌ Password reset error:', error);
        handleFirebaseError(error, 'send password reset');
    }
}

// Enhanced Firebase error handling
function handleFirebaseError(error, context = 'operation') {
    let userMessage = 'An unexpected error occurred';
    
    if (error.code) {
        switch (error.code) {
            // Authentication errors
            case 'auth/user-not-found':
                userMessage = 'No account found with this email address';
                break;
            case 'auth/wrong-password':
                userMessage = 'Incorrect password. Please try again';
                break;
            case 'auth/invalid-email':
                userMessage = 'Invalid email address format';
                break;
            case 'auth/user-disabled':
                userMessage = 'This account has been disabled. Please contact support';
                break;
            case 'auth/too-many-requests':
                userMessage = 'Too many failed attempts. Please try again later';
                break;
            case 'auth/email-already-in-use':
                userMessage = 'This email is already associated with an account';
                break;
            case 'auth/weak-password':
                userMessage = 'Password is too weak. Please use a stronger password';
                break;
            case 'auth/operation-not-allowed':
                userMessage = 'This login method is not enabled';
                break;
            case 'auth/requires-recent-login':
                userMessage = 'Please log in again to perform this action';
                break;
                
            // Social login errors
            case 'auth/popup-closed-by-user':
                userMessage = 'Login was cancelled';
                return; // Don't show error for cancelled popups
            case 'auth/popup-blocked':
                userMessage = 'Login popup was blocked. Please allow popups for this site';
                break;
            case 'auth/unauthorized-domain':
                userMessage = 'This domain is not authorized for login';
                break;
                
            // Network and system errors
            case 'auth/network-request-failed':
                userMessage = 'Network error. Please check your internet connection';
                break;
            case 'auth/internal-error':
                userMessage = 'Internal server error. Please try again later';
                break;
            case 'auth/app-not-authorized':
                userMessage = 'Application not authorized to use Firebase Authentication';
                break;
                
            // Firestore errors
            case 'permission-denied':
                userMessage = 'You do not have permission to perform this action';
                break;
            case 'not-found':
                userMessage = 'The requested resource was not found';
                break;
            case 'unavailable':
                userMessage = 'Service is temporarily unavailable. Please try again later';
                break;
            case 'failed-precondition':
                userMessage = 'Operation cannot be completed in the current state';
                break;
                
            default:
                userMessage = `Error during ${context}: ${error.message || 'Please try again'}`;
        }
    } else {
        userMessage = `Error during ${context}: ${error.message || 'Unknown error occurred'}`;
    }
    
    console.error(`❌ Firebase error in ${context}:`, error.code, error.message);
    showStatus(userMessage, 'error');
}

// Create guest user document in Firestore
async function createGuestUserDocument(uid) {
    try {
        const guestNumber = Math.floor(Math.random() * 10000);
        const displayName = `Guest${guestNumber}`;
        
        const userData = {
            uid: uid,
            displayName: displayName,
            email: null,
            avatar: getDefaultAvatar(displayName),
            status: 'Online',
            statusType: 'online',
            streak: 1,
            unicoins: 50,
            level: 1,
            experience: 0,
            posts: 0,
            followers: 0,
            following: 0,
            isAnonymous: true,
            isGuest: true,
            authProvider: 'anonymous',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
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
        };

        await db.collection('users').doc(uid).set(userData);
        console.log('✅ Guest user document created');
        
    } catch (error) {
        console.error('❌ Error creating guest user document:', error);
        handleFirebaseError(error, 'create guest user');
        throw error;
    }
}

// Create user document for email/password users
async function createUserDocument(user) {
    try {
        const displayName = user.email.split('@')[0]; // Use email username as display name
        
        const userData = {
            uid: user.uid,
            displayName: displayName,
            email: user.email,
            avatar: getDefaultAvatar(displayName),
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
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
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
        };

        await db.collection('users').doc(user.uid).set(userData);
        console.log('✅ User document created for email user');
        
    } catch (error) {
        console.error('❌ Error creating user document:', error);
        handleFirebaseError(error, 'create user document');
        throw error;
    }
}

// Create user document for social login users
async function createSocialUserDocument(user, provider) {
    try {
        const displayName = user.displayName || user.email.split('@')[0];
        const avatar = user.photoURL || getDefaultAvatar(displayName);
        
        const userData = {
            uid: user.uid,
            displayName: displayName,
            email: user.email,
            avatar: avatar,
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
            authProvider: provider,
            emailVerified: user.emailVerified,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
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
        };

        await db.collection('users').doc(user.uid).set(userData);
        console.log(`✅ User document created for ${provider} user`);
        
    } catch (error) {
        console.error(`❌ Error creating ${provider} user document:`, error);
        handleFirebaseError(error, `create ${provider} user document`);
        throw error;
    }
}

// Update user's last seen timestamp
async function updateUserLastSeen(uid) {
    try {
        await db.collection('users').doc(uid).update({
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'Online',
            statusType: 'online'
        });
        console.log('✅ User last seen updated');
    } catch (error) {
        console.error('❌ Error updating last seen:', error);
        handleFirebaseError(error, 'update user status');
    }
}

// Get default avatar
function getDefaultAvatar(name) {
    const colors = ['6366f1', 'ef4444', '10b981', 'f59e0b', '8b5cf6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${randomColor}&color=fff&size=150&bold=true`;
}

// Validate email format
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Show status messages
function showStatus(message, type = 'info') {
    if (!statusMessage) return;
    
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    }
    
    // Auto-hide info messages after 3 seconds
    if (type === 'info') {
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 3000);
    }
}

// Set form loading state
function setFormLoading(loading) {
    const submitButton = loginForm?.querySelector('button[type="submit"]');
    const guestButton = document.getElementById('guestLogin');
    const googleButton = document.getElementById('googleLogin');
    const facebookButton = document.getElementById('facebookLogin');
    
    const buttons = [submitButton, guestButton, googleButton, facebookButton].filter(Boolean);
    
    buttons.forEach(button => {
        if (loading) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        } else {
            button.disabled = false;
            
            // Reset button text based on button type
            if (button === submitButton) {
                button.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            } else if (button === guestButton) {
                button.innerHTML = '<i class="fas fa-user"></i> Continue as Guest';
            } else if (button === googleButton) {
                button.innerHTML = '<i class="fab fa-google"></i> Continue with Google';
            } else if (button === facebookButton) {
                button.innerHTML = '<i class="fab fa-facebook"></i> Continue with Facebook';
            }
        }
    });
    
    // Disable form inputs during loading
    if (emailInput) emailInput.disabled = loading;
    if (passwordInput) passwordInput.disabled = loading;
}

// Export functions for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validateEmail,
        getDefaultAvatar,
        clearAuthCache,
        handleFirebaseError
    };
}
// Register for settings updates
if (window.settingsApp) {
    window.settingsApp.addSettingsListener((settings) => {
        // Apply theme
        document.body.className = document.body.className.replace(/theme-\w+/g, '') + ' ' + settings.theme;
        
        // Apply other settings as needed
        console.log("Settings updated:", settings);
    });
}