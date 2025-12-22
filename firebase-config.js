// firebase-config.js
/**
 * Firebase Configuration Module
 * Only handles Firebase app initialization and service exports
 * No business logic - just setup and configuration
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
  browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Set auth persistence to LOCAL for offline support and cross-reload persistence
// This ensures auth state persists across page reloads, iframes, and offline mode
const initializeAuthPersistence = () => {
  // Use a promise to handle async persistence setting
  return setPersistence(auth, browserLocalPersistence)
    .then(() => {
      console.log("Firebase Auth persistence set to LOCAL");
      return auth;
    })
    .catch((error) => {
      console.error("Error setting auth persistence:", error);
      // Fallback to inMemoryPersistence if LOCAL fails (for iframe compatibility)
      return setPersistence(auth, inMemoryPersistence)
        .then(() => {
          console.log("Fallback to inMemory persistence");
          return auth;
        });
    });
};

// Initialize auth persistence and export services
const authInitialized = initializeAuthPersistence();

// Export services for use in other modules
// Note: authInitialized is a promise that resolves to auth instance with persistence set
export { app, auth, db, storage, authInitialized };
export default app;