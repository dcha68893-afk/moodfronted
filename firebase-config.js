// firebase-config.js
/**
 * Firebase Configuration Module
 * Enhanced for device-based authentication with offline-first approach
 * Supports: Device ID tracking, local user storage, and background sync
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

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
  getFirestore, 
  enableIndexedDbPersistence,
  doc,
  setDoc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const realtimeDb = getDatabase(app);

// Session Cache Keys (enhanced for device-based auth)
const SESSION_CACHE_KEY = 'firebase_session_cache';
const CREDENTIALS_CACHE_KEY = 'firebase_credentials_cache';
const DEVICE_ID_KEY = 'user_device_id';
const MULTI_USER_STORAGE_KEY = 'uniconnect_saved_users';
const LOGGED_OUT_FLAG_KEY = 'user_logged_out';

// Generate or retrieve device ID
const getOrCreateDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    // Generate a unique device ID
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log("New device ID generated:", deviceId);
  }
  return deviceId;
};

// Get current device ID
const getCurrentDeviceId = () => {
  return localStorage.getItem(DEVICE_ID_KEY);
};

// Store multiple users for quick login
const storeUserForQuickLogin = (userData) => {
  try {
    const users = JSON.parse(localStorage.getItem(MULTI_USER_STORAGE_KEY)) || [];
    
    // Check if user already exists
    const existingIndex = users.findIndex(u => u.email === userData.email);
    
    if (existingIndex !== -1) {
      // Update existing user
      users[existingIndex] = {
        ...users[existingIndex],
        ...userData,
        lastLogin: Date.now(),
        deviceId: getCurrentDeviceId()
      };
    } else {
      // Add new user
      users.push({
        ...userData,
        lastLogin: Date.now(),
        deviceId: getCurrentDeviceId()
      });
    }
    
    // Keep only last 5 users
    const sortedUsers = users.sort((a, b) => b.lastLogin - a.lastLogin);
    const recentUsers = sortedUsers.slice(0, 5);
    
    localStorage.setItem(MULTI_USER_STORAGE_KEY, JSON.stringify(recentUsers));
    console.log("User stored for quick login:", userData.email);
  } catch (error) {
    console.error("Error storing user for quick login:", error);
  }
};

// Get all saved users for quick login
const getSavedUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(MULTI_USER_STORAGE_KEY)) || [];
  } catch (error) {
    console.error("Error reading saved users:", error);
    return [];
  }
};

// Remove user from quick login list
const removeSavedUser = (email) => {
  try {
    const users = JSON.parse(localStorage.getItem(MULTI_USER_STORAGE_KEY)) || [];
    const filteredUsers = users.filter(u => u.email !== email);
    localStorage.setItem(MULTI_USER_STORAGE_KEY, JSON.stringify(filteredUsers));
    console.log("User removed from quick login:", email);
  } catch (error) {
    console.error("Error removing saved user:", error);
  }
};

// Cache user session data with device info
const cacheUserSession = (user, additionalData = {}) => {
  if (!user) {
    localStorage.removeItem(SESSION_CACHE_KEY);
    localStorage.removeItem(LOGGED_OUT_FLAG_KEY);
    return;
  }
  
  const sessionData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    lastLogin: Date.now(),
    deviceId: getCurrentDeviceId(),
    isLoggedIn: true,
    accountType: additionalData.accountType || 'student',
    expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days from now
    ...additionalData
  };
  
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(sessionData));
  localStorage.removeItem(LOGGED_OUT_FLAG_KEY); // Clear logged out flag
  
  // Also store for quick login
  storeUserForQuickLogin({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    accountType: additionalData.accountType || 'student'
  });
  
  console.log("User session cached with device ID:", getCurrentDeviceId());
};

// Get cached user session with device validation
const getCachedUserSession = () => {
  try {
    // Check if user explicitly logged out
    if (localStorage.getItem(LOGGED_OUT_FLAG_KEY) === 'true') {
      console.log("User logged out explicitly, skipping cache");
      return null;
    }
    
    const cached = localStorage.getItem(SESSION_CACHE_KEY);
    if (!cached) return null;
    
    const sessionData = JSON.parse(cached);
    
    // Check if session has expired
    if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
      console.log("Cached session expired");
      localStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    
    // Check if session is from current device
    const currentDeviceId = getCurrentDeviceId();
    if (sessionData.deviceId && sessionData.deviceId !== currentDeviceId) {
      console.log("Session from different device, not using cache");
      return null;
    }
    
    // Check if session is marked as logged in
    if (!sessionData.isLoggedIn) {
      console.log("Session marked as not logged in");
      return null;
    }
    
    console.log("Valid cached session found for device:", currentDeviceId);
    return sessionData;
    
  } catch (error) {
    console.error("Error reading cached session:", error);
    return null;
  }
};

// Mark user as logged out
const markUserAsLoggedOut = () => {
  localStorage.setItem(LOGGED_OUT_FLAG_KEY, 'true');
  console.log("User marked as logged out");
};

// Clear all user data
const clearAllUserData = () => {
  localStorage.removeItem(SESSION_CACHE_KEY);
  localStorage.removeItem(CREDENTIALS_CACHE_KEY);
  localStorage.setItem(LOGGED_OUT_FLAG_KEY, 'true');
  console.log("All user data cleared");
};

// Store user credentials for "remember me" functionality
const storeUserCredentials = (email, password) => {
  try {
    const credentials = { 
      email, 
      password, 
      timestamp: Date.now(),
      deviceId: getCurrentDeviceId() 
    };
    localStorage.setItem(CREDENTIALS_CACHE_KEY, JSON.stringify(credentials));
    console.log("User credentials stored for device:", getCurrentDeviceId());
  } catch (error) {
    console.error("Error storing credentials:", error);
  }
};

// Get stored credentials with device validation
const getStoredCredentials = () => {
  try {
    const stored = localStorage.getItem(CREDENTIALS_CACHE_KEY);
    if (!stored) return null;
    
    const credentials = JSON.parse(stored);
    const currentDeviceId = getCurrentDeviceId();
    
    // Check if credentials are from current device
    if (credentials.deviceId && credentials.deviceId !== currentDeviceId) {
      console.log("Credentials from different device, not using");
      localStorage.removeItem(CREDENTIALS_CACHE_KEY);
      return null;
    }
    
    // Check if credentials are still valid (e.g., less than 30 days old)
    const cacheAge = Date.now() - credentials.timestamp;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    if (cacheAge < maxAge) {
      return credentials;
    } else {
      localStorage.removeItem(CREDENTIALS_CACHE_KEY);
      return null;
    }
  } catch (error) {
    console.error("Error reading stored credentials:", error);
    return null;
  }
};

// Clear stored credentials and session
const clearUserCredentials = () => {
  localStorage.removeItem(CREDENTIALS_CACHE_KEY);
  localStorage.removeItem(SESSION_CACHE_KEY);
  localStorage.setItem(LOGGED_OUT_FLAG_KEY, 'true');
  console.log("Stored user credentials and session cleared");
};

// Create user in Firestore (background sync)
const createUserInFirestore = async (userId, userData) => {
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      ...userData,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      devices: [getCurrentDeviceId()]
    });
    console.log("User created in Firestore:", userId);
    return true;
  } catch (error) {
    console.error("Error creating user in Firestore:", error);
    return false;
  }
};

// Update user devices in Firestore
const updateUserDevicesInFirestore = async (userId) => {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const currentDevices = userDoc.data().devices || [];
      const currentDeviceId = getCurrentDeviceId();
      
      if (!currentDevices.includes(currentDeviceId)) {
        await updateDoc(userRef, {
          devices: [...currentDevices, currentDeviceId],
          lastUpdated: new Date().toISOString()
        });
        console.log("Device added to user profile:", currentDeviceId);
      }
    }
  } catch (error) {
    console.error("Error updating user devices:", error);
  }
};

// Background Firebase verification with device tracking
const verifyUserInBackground = async () => {
  try {
    // Get stored credentials
    const credentials = getStoredCredentials();
    if (!credentials) {
      console.log("No stored credentials for background verification");
      return;
    }
    
    // Try to sign in with Firebase
    const userCredential = await signInWithEmailAndPassword(
      auth, 
      credentials.email, 
      credentials.password
    );
    
    // Update user devices in Firestore
    await updateUserDevicesInFirestore(userCredential.user.uid);
    
    // Update cache with fresh data
    const cached = getCachedUserSession();
    cacheUserSession(userCredential.user, {
      accountType: cached?.accountType || 'student'
    });
    
    console.log("Background verification successful for:", credentials.email);
    
  } catch (error) {
    // Silently handle errors
    if (error.code === 'auth/network-request-failed') {
      console.log("Background verification skipped (offline)");
    } else if (error.code === 'auth/invalid-credential') {
      console.log("Stored credentials invalid, clearing cache");
      clearUserCredentials();
      removeSavedUser(credentials.email);
    } else {
      console.log("Background verification error:", error.code);
    }
  }
};

// Initialize auth with offline support
const initializeAuthPersistence = async () => {
  try {
    // Generate device ID if not exists
    getOrCreateDeviceId();
    
    // Set persistence to LOCAL for offline support
    await setPersistence(auth, browserLocalPersistence);
    console.log("Firebase Auth persistence set to LOCAL");
    
    // Check for cached session immediately
    const cachedUser = getCachedUserSession();
    
    if (cachedUser) {
      console.log("Using cached user session for immediate UI display");
      
      // Dispatch event for UI to update immediately
      document.dispatchEvent(new CustomEvent('user-authenticated', {
        detail: { 
          user: cachedUser, 
          source: 'cache',
          isOnline: false 
        }
      }));
      
      // Start background verification
      setTimeout(verifyUserInBackground, 1000);
    }
    
    return auth;
  } catch (error) {
    console.error("Error setting auth persistence:", error);
    
    // Fallback to inMemory persistence
    try {
      await setPersistence(auth, inMemoryPersistence);
      console.log("Fallback to inMemory persistence");
    } catch (fallbackError) {
      console.error("Failed to set any persistence:", fallbackError);
    }
    
    return auth;
  }
};

// Initialize Firestore offline persistence
const initializeFirestoreOfflinePersistence = () => {
  return enableIndexedDbPersistence(db)
    .then(() => {
      console.log("Firestore offline persistence enabled");
      return db;
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
      } else if (err.code === 'unimplemented') {
        console.warn("The current browser doesn't support offline persistence.");
      }
      return db;
    });
};

// Monitor auth state changes with device tracking
const monitorAuthState = () => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("Firebase auth state: User authenticated", user.email);
      
      // Get cached account type if available
      const cached = getCachedUserSession();
      
      // Cache the fresh Firebase user data
      cacheUserSession(user, {
        accountType: cached?.accountType || 'student'
      });
      
      // Update user devices in background
      updateUserDevicesInFirestore(user.uid);
      
      // Dispatch custom event for UI to update
      document.dispatchEvent(new CustomEvent('firebase-auth-changed', {
        detail: { 
          user, 
          source: 'firebase',
          isOnline: true 
        }
      }));
    } else {
      console.log("Firebase auth state: User signed out");
      
      // Don't clear cache on Firebase sign out if we have valid cached session
      // This allows offline operation
      const cachedUser = getCachedUserSession();
      if (!cachedUser) {
        cacheUserSession(null);
      }
      
      // Dispatch custom event for UI to update
      document.dispatchEvent(new CustomEvent('firebase-auth-changed', {
        detail: { 
          user: null, 
          source: 'firebase',
          isOnline: true 
        }
      }));
    }
  });
};

// Enhanced helper function for UI to check authentication state
const getCurrentAuthState = () => {
  // First check Firebase auth (if available online)
  const firebaseUser = auth.currentUser;
  
  if (firebaseUser) {
    const cached = getCachedUserSession();
    return {
      user: {
        ...firebaseUser,
        accountType: cached?.accountType || 'student',
        deviceId: getCurrentDeviceId()
      },
      isOnline: true,
      source: 'firebase'
    };
  }
  
  // If no Firebase user, check cache
  const cachedUser = getCachedUserSession();
  
  if (cachedUser) {
    return {
      user: cachedUser,
      isOnline: false,
      source: 'cache'
    };
  }
  
  // No user at all
  return {
    user: null,
    isOnline: false,
    source: 'none'
  };
};

// Check if user should be auto-logged in
const shouldAutoLogin = () => {
  const cachedUser = getCachedUserSession();
  if (!cachedUser) return false;
  
  // Check all conditions
  const conditions = [
    cachedUser.isLoggedIn === true,
    cachedUser.uid,
    cachedUser.deviceId === getCurrentDeviceId(),
    cachedUser.expiresAt > Date.now(),
    localStorage.getItem(LOGGED_OUT_FLAG_KEY) !== 'true'
  ];
  
  return conditions.every(condition => condition);
};

// Initialize all Firebase services with persistence
const initializeAllServices = async () => {
  try {
    // Initialize auth with persistence (non-blocking)
    const authPromise = initializeAuthPersistence();
    
    // Initialize Firestore offline persistence
    const firestorePromise = initializeFirestoreOfflinePersistence();
    
    // Wait for both
    await Promise.all([authPromise, firestorePromise]);
    
    // Start monitoring auth state in background
    monitorAuthState();
    
    console.log("Firebase services initialized with device-based offline support");
    
    return { 
      app, 
      auth, 
      db, 
      storage, 
      realtimeDb,
      getCurrentAuthState,
      getSavedUsers,
      cacheUserSession,
      getCachedUserSession,
      storeUserCredentials,
      clearUserCredentials,
      clearAllUserData,
      markUserAsLoggedOut,
      shouldAutoLogin,
      getCurrentDeviceId,
      createUserInFirestore,
      removeSavedUser
    };
  } catch (error) {
    console.error("Error initializing Firebase services:", error);
    
    // Even if initialization fails, return services
    return { 
      app, 
      auth, 
      db, 
      storage, 
      realtimeDb,
      getCurrentAuthState,
      getSavedUsers,
      cacheUserSession,
      getCachedUserSession,
      storeUserCredentials,
      clearUserCredentials,
      clearAllUserData,
      markUserAsLoggedOut,
      shouldAutoLogin,
      getCurrentDeviceId,
      createUserInFirestore,
      removeSavedUser
    };
  }
};

// Initialize services (non-blocking)
const firebaseInitialized = initializeAllServices().catch(error => {
  console.error("Failed to initialize Firebase:", error);
  // Return services anyway for offline operation
  return { 
    app, 
    auth, 
    db, 
    storage, 
    realtimeDb,
    getCurrentAuthState,
    getSavedUsers,
    cacheUserSession,
    getCachedUserSession,
    storeUserCredentials,
    clearUserCredentials,
    clearAllUserData,
    markUserAsLoggedOut,
    shouldAutoLogin,
    getCurrentDeviceId,
    createUserInFirestore,
    removeSavedUser
  };
});

// Export services and utility functions
export { 
  app, 
  auth, 
  db, 
  storage, 
  realtimeDb,
  firebaseInitialized,
  storeUserCredentials,
  clearUserCredentials,
  clearAllUserData,
  markUserAsLoggedOut,
  getCurrentAuthState,
  getSavedUsers,
  cacheUserSession,
  getCachedUserSession,
  shouldAutoLogin,
  getCurrentDeviceId,
  createUserInFirestore,
  removeSavedUser,
  getOrCreateDeviceId,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
};

// Export default app
export default app;