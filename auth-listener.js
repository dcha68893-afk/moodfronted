// auth-listener.js
/**
 * UniConnect - Authentication State Listener
 * Handles real-time authentication state changes and user session management
 * Offline-first design with cached sessions
 * Now supports device-based authentication and quick login
 */

import { auth, db } from './firebase-config.js';
import { 
    onAuthStateChanged, 
    signOut,
    setPersistence,
    browserLocalPersistence,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
    doc, 
    updateDoc, 
    getDoc,
    setDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

class AuthStateListener {
    constructor() {
        this.currentUser = null;
        this.authStateSubscribers = [];
        this.isListening = false;
        this.isOfflineMode = false;
        this.deviceId = this.getDeviceId();
        this.savedUsers = this.getSavedUsers();
        this.init();
    }

    /**
     * Initializes the authentication state listener
     */
    async init() {
        if (this.isListening) return;

        try {
            console.log('🔐 Initializing Auth State Listener...');
            console.log(`📱 Device ID: ${this.deviceId}`);
            
            // Set persistence to local storage
            await setPersistence(auth, browserLocalPersistence);
            
            // First: Check for auto-login (device-based)
            const autoLoginResult = await this.checkAutoLogin();
            
            if (autoLoginResult.success) {
                console.log('✅ Auto-login successful:', autoLoginResult.user.email);
                
                // Load cached preferences immediately
                await this.loadCachedPreferences();
                
                // Update UI immediately
                this.updateUILoggedIn(autoLoginResult.user);
                
                // Notify subscribers
                this.notifySubscribers(autoLoginResult.user);
            } else {
                // No auto-login, check Firebase auth state
                this.unsubscribe = onAuthStateChanged(auth, 
                    (user) => this.handleAuthStateChange(user),
                    (error) => this.handleAuthError(error)
                );
                
                // Show quick login options if available
                if (this.savedUsers.length > 0) {
                    this.showQuickLoginOptions();
                }
            }
            
            this.isListening = true;
            console.log('✅ Auth State Listener initialized successfully');
            
        } catch (error) {
            console.error('❌ Auth State Listener initialization failed:', error);
            // Even if Firebase fails, try auto-login from local storage
            await this.checkAutoLogin();
            this.isListening = true;
        }
    }

    /**
     * Generates or retrieves a unique device ID
     */
    getDeviceId() {
        let deviceId = localStorage.getItem('uniconnect-device-id');
        
        if (!deviceId) {
            // Generate a unique device ID
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('uniconnect-device-id', deviceId);
        }
        
        return deviceId;
    }

    /**
     * Gets saved users from localStorage
     */
    getSavedUsers() {
        try {
            const savedUsers = localStorage.getItem('uniconnect-saved-users');
            return savedUsers ? JSON.parse(savedUsers) : [];
        } catch (error) {
            console.error('❌ Error loading saved users:', error);
            return [];
        }
    }

    /**
     * Saves a user to the saved users list
     */
    saveUserToDevice(userData) {
        try {
            const savedUsers = this.getSavedUsers();
            
            // Check if user already exists
            const existingIndex = savedUsers.findIndex(u => u.userId === userData.userId);
            
            if (existingIndex >= 0) {
                // Update existing user
                savedUsers[existingIndex] = {
                    ...savedUsers[existingIndex],
                    ...userData,
                    lastUsed: new Date().toISOString(),
                    deviceId: this.deviceId
                };
            } else {
                // Add new user
                savedUsers.push({
                    ...userData,
                    lastUsed: new Date().toISOString(),
                    deviceId: this.deviceId
                });
            }
            
            // Limit to 5 saved users
            const limitedUsers = savedUsers
                .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
                .slice(0, 5);
            
            localStorage.setItem('uniconnect-saved-users', JSON.stringify(limitedUsers));
            this.savedUsers = limitedUsers;
            
            return true;
        } catch (error) {
            console.error('❌ Error saving user to device:', error);
            return false;
        }
    }

    /**
     * Removes a user from saved users
     */
    removeSavedUser(userId) {
        try {
            const savedUsers = this.getSavedUsers();
            const filteredUsers = savedUsers.filter(u => u.userId !== userId);
            
            localStorage.setItem('uniconnect-saved-users', JSON.stringify(filteredUsers));
            this.savedUsers = filteredUsers;
            
            return true;
        } catch (error) {
            console.error('❌ Error removing saved user:', error);
            return false;
        }
    }

    /**
     * Checks for auto-login on page load
     */
    async checkAutoLogin() {
        try {
            console.log('🔍 Checking auto-login conditions...');
            
            // 1. Check if user is marked as logged in
            const isLoggedIn = localStorage.getItem('uniconnect-isLoggedIn') === 'true';
            if (!isLoggedIn) {
                console.log('❌ Auto-login: Not marked as logged in');
                return { success: false, reason: 'not_logged_in' };
            }
            
            // 2. Check if logged-out flag is set
            const loggedOutFlag = localStorage.getItem('uniconnect-loggedOut');
            if (loggedOutFlag === 'true') {
                console.log('❌ Auto-login: User manually logged out');
                return { success: false, reason: 'manually_logged_out' };
            }
            
            // 3. Get user data
            const userId = localStorage.getItem('uniconnect-userId');
            const userDataStr = localStorage.getItem('uniconnect-user');
            
            if (!userId || !userDataStr) {
                console.log('❌ Auto-login: Missing user data');
                return { success: false, reason: 'missing_data' };
            }
            
            const userData = JSON.parse(userDataStr);
            
            // 4. Check device ID match
            const savedDeviceId = localStorage.getItem('uniconnect-deviceId');
            if (savedDeviceId && savedDeviceId !== this.deviceId) {
                console.log('❌ Auto-login: Device mismatch');
                return { success: false, reason: 'device_mismatch' };
            }
            
            // 5. Check session expiry
            const sessionExpiry = localStorage.getItem('uniconnect-sessionExpiry');
            if (sessionExpiry) {
                const expiryDate = new Date(sessionExpiry);
                if (new Date() > expiryDate) {
                    console.log('❌ Auto-login: Session expired');
                    this.clearInvalidSession();
                    return { success: false, reason: 'session_expired' };
                }
            }
            
            // 6. Check last auth time (optional, for extra security)
            const lastAuth = localStorage.getItem('uniconnect-last-auth');
            if (lastAuth) {
                const lastAuthDate = new Date(lastAuth);
                const now = new Date();
                const hoursDiff = (now - lastAuthDate) / (1000 * 60 * 60);
                
                // Allow auto-login within 7 days
                if (hoursDiff > 168) {
                    console.log('❌ Auto-login: Last auth too old');
                    return { success: false, reason: 'auth_too_old' };
                }
            }
            
            console.log('✅ Auto-login conditions met for user:', userData.email);
            
            // Set current user
            this.currentUser = userData;
            this.isOfflineMode = true;
            
            // Update device ID if not set
            if (!savedDeviceId) {
                localStorage.setItem('uniconnect-deviceId', this.deviceId);
            }
            
            // Try to sync with Firebase in background if online
            if (navigator.onLine) {
                this.attemptBackgroundSync(userId);
            }
            
            return { 
                success: true, 
                user: userData,
                isOffline: true 
            };
            
        } catch (error) {
            console.error('❌ Error checking auto-login:', error);
            return { success: false, reason: 'error', error };
        }
    }

    /**
     * Attempts background sync with Firebase
     */
    async attemptBackgroundSync(userId) {
        try {
            console.log('🔄 Attempting background sync...');
            
            // Check if we can access Firebase
            const userDocRef = doc(db, 'users', userId);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
                const firebaseData = userDoc.data();
                
                // Merge Firebase data with local data
                this.currentUser = {
                    ...this.currentUser,
                    ...firebaseData
                };
                
                // Update localStorage
                localStorage.setItem('uniconnect-user', JSON.stringify(this.currentUser));
                localStorage.setItem('uniconnect-last-auth', new Date().toISOString());
                
                // Load fresh preferences
                await this.loadUserSelections();
                
                // Exit offline mode
                this.isOfflineMode = false;
                
                // Update UI
                this.updateUILoggedIn(this.currentUser);
                this.notifySubscribers(this.currentUser);
                
                console.log('✅ Background sync successful');
            }
        } catch (error) {
            console.log('🌐 Background sync failed, staying offline:', error.message);
        }
    }

    /**
     * Handles authentication state changes from Firebase
     */
    async handleAuthStateChange(user) {
        try {
            if (user) {
                // User authenticated with Firebase
                await this.handleFirebaseUserSignedIn(user);
            } else {
                // No user in Firebase - check if we have local session
                if (this.currentUser && this.isOfflineMode) {
                    console.log('🌐 Offline mode: Keeping local user session');
                    return;
                }
                
                // Check for saved users to show quick login
                if (this.savedUsers.length > 0) {
                    this.showQuickLoginOptions();
                } else {
                    await this.handleUserSignedOut();
                }
            }
            
        } catch (error) {
            console.error('❌ Error handling auth state change:', error);
            this.handleAuthError(error);
        }
    }

    /**
     * Handles Firebase user sign-in (background verification)
     */
    async handleFirebaseUserSignedIn(user) {
        console.log('✅ Firebase verification successful:', user.email);
        
        try {
            // Update user status in Firestore
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, {
                status: 'Online',
                statusType: 'online',
                lastSeen: serverTimestamp(),
                lastLogin: serverTimestamp(),
                deviceId: this.deviceId,
                lastActiveDevice: this.deviceId
            });

            // Get complete user data from Firestore
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.exists() ? userDoc.data() : null;

            // Store updated user in memory
            this.currentUser = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                emailVerified: user.emailVerified,
                photoURL: user.photoURL,
                deviceId: this.deviceId,
                ...userData
            };

            // Save session for auto-login
            this.saveSessionForAutoLogin(this.currentUser);

            // Save user to quick login list
            this.saveUserToDevice({
                userId: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                accountType: userData?.accountType || 'student'
            });

            // Exit offline mode
            this.isOfflineMode = false;

            // Load fresh user selections
            await this.loadUserSelections();

            // Sync with UserData manager
            await this.syncWithUserDataManager();

            // Apply theme colors
            this.applyThemeColors();

            // Update UI with fresh data
            this.updateUILoggedIn(this.currentUser);
            
            // Notify subscribers with updated user
            this.notifySubscribers(this.currentUser);
            
            console.log('✅ User session synchronized:', user.email);

        } catch (error) {
            console.error('❌ Error during Firebase sync:', error);
            // If Firebase fails, try to save locally
            if (!this.currentUser) {
                this.currentUser = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    emailVerified: user.emailVerified,
                    photoURL: user.photoURL,
                    deviceId: this.deviceId
                };
                
                this.saveSessionForAutoLogin(this.currentUser);
                this.isOfflineMode = true;
                this.updateUILoggedIn(this.currentUser);
                this.notifySubscribers(this.currentUser);
            }
        }
    }

    /**
     * Saves session data for auto-login
     */
    saveSessionForAutoLogin(user) {
        try {
            localStorage.setItem('uniconnect-isLoggedIn', 'true');
            localStorage.setItem('uniconnect-userId', user.uid);
            localStorage.setItem('uniconnect-user', JSON.stringify(user));
            localStorage.setItem('uniconnect-deviceId', this.deviceId);
            localStorage.setItem('uniconnect-last-auth', new Date().toISOString());
            
            // Set session expiry (30 days from now)
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30);
            localStorage.setItem('uniconnect-sessionExpiry', expiryDate.toISOString());
            
            // Clear logged-out flag
            localStorage.removeItem('uniconnect-loggedOut');
            
            console.log('✅ Session saved for auto-login');
        } catch (error) {
            console.error('❌ Error saving session:', error);
        }
    }

    /**
     * Handles user sign-out
     */
    async handleUserSignedOut() {
        console.log('👤 User signed out');
        
        try {
            // Update user status in Firestore if we have a previous user and online
            if (this.currentUser && this.currentUser.uid && !this.isOfflineMode) {
                const userDocRef = doc(db, 'users', this.currentUser.uid);
                await updateDoc(userDocRef, {
                    status: 'Offline',
                    statusType: 'offline',
                    lastSeen: serverTimestamp()
                }).catch(error => {
                    console.warn('⚠️ Could not update offline status:', error);
                });
            }

            // Set logged-out flag to prevent auto-login
            localStorage.setItem('uniconnect-loggedOut', 'true');
            
            // Clear session data (keep saved users and theme)
            const savedUsers = localStorage.getItem('uniconnect-saved-users');
            const theme = localStorage.getItem('uniconnect-theme');
            
            this.clearSessionData();
            
            // Restore saved users and theme
            if (savedUsers) localStorage.setItem('uniconnect-saved-users', savedUsers);
            if (theme) localStorage.setItem('uniconnect-theme', theme);
            
            // Clear user data
            this.currentUser = null;
            this.isOfflineMode = false;
            
            // Reset theme to default
            this.resetThemeToDefault();

            // Update UI
            this.updateUILoggedOut();
            
            // Notify subscribers
            this.notifySubscribers(null);
            
            console.log('✅ User session cleared');

        } catch (error) {
            console.error('❌ Error handling user sign-out:', error);
            throw error;
        }
    }

    /**
     * Clears session data while preserving device info and saved users
     */
    clearSessionData() {
        localStorage.removeItem('uniconnect-isLoggedIn');
        localStorage.removeItem('uniconnect-userId');
        localStorage.removeItem('uniconnect-user');
        localStorage.removeItem('uniconnect-deviceId');
        localStorage.removeItem('uniconnect-sessionExpiry');
        localStorage.removeItem('uniconnect-last-auth');
        localStorage.removeItem('uniconnect-preferences');
        localStorage.removeItem('uniconnect-loggedOut');
    }

    /**
     * Shows quick login options in the UI
     */
    showQuickLoginOptions() {
        try {
            // This should be handled by your index.html UI
            // The auth listener just provides the data
            console.log('👥 Found saved users:', this.savedUsers.length);
            
            // Dispatch event for UI to handle
            const event = new CustomEvent('quickLoginAvailable', {
                detail: { users: this.savedUsers },
                bubbles: true
            });
            document.dispatchEvent(event);
            
        } catch (error) {
            console.error('❌ Error showing quick login options:', error);
        }
    }

    /**
     * Attempts quick login with a saved user
     */
    async attemptQuickLogin(userData) {
        try {
            console.log('🚀 Attempting quick login for:', userData.email);
            
            // Check device match
            if (userData.deviceId && userData.deviceId !== this.deviceId) {
                console.log('❌ Device mismatch for quick login');
                return { success: false, message: 'Device mismatch' };
            }
            
            // Try local authentication first (offline)
            const localUser = this.savedUsers.find(u => u.userId === userData.userId);
            
            if (localUser) {
                console.log('✅ Local authentication successful');
                
                this.currentUser = {
                    uid: localUser.userId,
                    email: localUser.email,
                    displayName: localUser.displayName,
                    photoURL: localUser.photoURL,
                    deviceId: this.deviceId,
                    accountType: localUser.accountType,
                    isOffline: true
                };
                
                this.isOfflineMode = true;
                
                // Save session for auto-login
                this.saveSessionForAutoLogin(this.currentUser);
                
                // Update last used time
                this.saveUserToDevice(localUser);
                
                // Load cached preferences
                await this.loadCachedPreferences();
                
                // Update UI
                this.updateUILoggedIn(this.currentUser);
                this.notifySubscribers(this.currentUser);
                
                // Try Firebase sync in background if online
                if (navigator.onLine) {
                    this.attemptBackgroundSync(localUser.userId);
                }
                
                return { 
                    success: true, 
                    user: this.currentUser,
                    isOffline: true 
                };
            }
            
            // If local fails and online, try Firebase
            if (navigator.onLine) {
                console.log('🌐 Attempting Firebase login...');
                
                // Note: You would need password or another auth method here
                // This is just a placeholder for the concept
                
                return { 
                    success: false, 
                    message: 'Online login required',
                    requiresPassword: true 
                };
            }
            
            return { 
                success: false, 
                message: 'Authentication failed' 
            };
            
        } catch (error) {
            console.error('❌ Quick login error:', error);
            return { 
                success: false, 
                message: error.message 
            };
        }
    }

    /**
     * Creates a local user (for offline registration)
     */
    createLocalUser(userData) {
        try {
            console.log('📱 Creating local user:', userData.email);
            
            // Generate a temporary user ID for offline use
            const tempUserId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const localUser = {
                userId: tempUserId,
                email: userData.email,
                displayName: userData.displayName,
                photoURL: userData.photoURL || this.getDefaultAvatar(userData.displayName),
                accountType: userData.accountType || 'student',
                isLocal: true,
                createdAt: new Date().toISOString()
            };
            
            // Save to localStorage
            this.currentUser = localUser;
            this.isOfflineMode = true;
            
            // Save session
            localStorage.setItem('uniconnect-isLoggedIn', 'true');
            localStorage.setItem('uniconnect-userId', tempUserId);
            localStorage.setItem('uniconnect-user', JSON.stringify(localUser));
            localStorage.setItem('uniconnect-deviceId', this.deviceId);
            localStorage.setItem('uniconnect-last-auth', new Date().toISOString());
            
            // Save to quick login list
            this.saveUserToDevice(localUser);
            
            // Load default preferences
            this.applyDefaultPreferences();
            
            // Update UI
            this.updateUILoggedIn(localUser);
            this.notifySubscribers(localUser);
            
            console.log('✅ Local user created successfully');
            
            return {
                success: true,
                user: localUser,
                isOffline: true,
                isLocal: true
            };
            
        } catch (error) {
            console.error('❌ Error creating local user:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Attempts to register online after local creation
     */
    async attemptOnlineRegistration(localUser, password) {
        try {
            console.log('🌐 Attempting online registration for:', localUser.email);
            
            // This would be handled by your registration module
            // Placeholder for the concept
            
            return {
                success: false,
                message: 'Online registration not implemented in auth listener'
            };
            
        } catch (error) {
            console.error('❌ Online registration error:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Apply default preferences for new users
     */
    applyDefaultPreferences() {
        const defaultPreferences = {
            theme: 'light',
            language: 'en',
            notifications: {
                enabled: true,
                sounds: true,
                desktop: false
            },
            uiDensity: 'normal'
        };
        
        localStorage.setItem('uniconnect-preferences', JSON.stringify(defaultPreferences));
        this.applyUserSelections(defaultPreferences);
    }

    // ... (Keep all the existing methods below unchanged: loadCachedPreferences, clearCachedSession, 
    // applyUserSelections, syncWithUserDataManager, applyThemeColors, etc.)

    // Only showing new methods above. The rest of your existing methods remain the same.

    /**
     * Gets all saved users (for UI display)
     */
    getSavedUsersList() {
        return this.savedUsers;
    }

    /**
     * Clears all saved users
     */
    clearAllSavedUsers() {
        localStorage.removeItem('uniconnect-saved-users');
        this.savedUsers = [];
    }
}

// Initialize and export the auth listener
window.authListener = new AuthStateListener();

// Listen for online/offline events
window.addEventListener('online', () => {
    if (window.authListener) {
        window.authListener.attemptReconnect();
    }
});

// Listen for quick login requests from UI
document.addEventListener('quickLoginRequest', async (event) => {
    if (window.authListener) {
        const result = await window.authListener.attemptQuickLogin(event.detail.user);
        
        // Dispatch result back to UI
        const resultEvent = new CustomEvent('quickLoginResult', {
            detail: result,
            bubbles: true
        });
        document.dispatchEvent(resultEvent);
    }
});

// Export for module usage
export default window.authListener;