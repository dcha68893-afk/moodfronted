// login.js - User Login with Firebase Auth
console.log('🔐 Login script loaded');

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
let auth, db;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
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
    if (!auth) return;
    
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
                showStatus('Authentication error. Please login again.', 'error');
            }
        }
    });
}

// Handle user login
async function handleLogin(event) {
    event.preventDefault();
    
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
        
        let errorMessage = 'Login failed. ';
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage += 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorMessage += 'Incorrect password.';
                break;
            case 'auth/invalid-email':
                errorMessage += 'Invalid email address.';
                break;
            case 'auth/user-disabled':
                errorMessage += 'This account has been disabled.';
                break;
            case 'auth/too-many-requests':
                errorMessage += 'Too many failed attempts. Please try again later.';
                break;
            default:
                errorMessage += error.message;
        }
        
        showStatus(errorMessage, 'error');
    }
}

// Handle guest login (anonymous authentication)
async function handleGuestLogin() {
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
        showStatus(`Guest login failed: ${error.message}`, 'error');
    }
}

// Handle Google login
async function handleGoogleLogin() {
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
        
        if (error.code === 'auth/popup-closed-by-user') {
            showStatus('Google login was cancelled', 'info');
        } else {
            showStatus(`Google login failed: ${error.message}`, 'error');
        }
    }
}

// Handle Facebook login
async function handleFacebookLogin() {
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
        
        if (error.code === 'auth/popup-closed-by-user') {
            showStatus('Facebook login was cancelled', 'info');
        } else {
            showStatus(`Facebook login failed: ${error.message}`, 'error');
        }
    }
}

// Handle forgot password
async function handleForgotPassword(event) {
    event.preventDefault();
    
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
        
        let errorMessage = 'Failed to send reset email. ';
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage += 'No account found with this email.';
                break;
            case 'auth/invalid-email':
                errorMessage += 'Invalid email address.';
                break;
            default:
                errorMessage += error.message;
        }
        
        showStatus(errorMessage, 'error');
    }
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
        clearAuthCache
    };
}