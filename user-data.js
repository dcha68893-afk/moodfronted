// user-data.js
/**
 * UserDataManager - Manages user data, selections, and synchronization
 * @class
 */
class UserDataManager {
    constructor() {
        this.currentUser = null;
        this.userSelections = {
            moods: [],
            interests: []
        };
        this.customColors = {
            primary: '#4F46E5',
            secondary: '#10B981',
            accent: '#F59E0B'
        };
        this.isInitialized = false;
        this.firebaseAvailable = false;
        
        // Initialize with error handling
        this.init().catch(error => {
            console.error('Failed to initialize UserDataManager:', error);
        });
    }

    /**
     * Initialize the UserDataManager
     * @async
     */
    async init() {
        try {
            // Check Firebase availability
            this.firebaseAvailable = typeof firebase !== 'undefined' && 
                                   firebase.apps.length > 0;
            
            // Load from localStorage first
            this.loadFromLocalStorage();
            
            // If Firebase is available and user is logged in, sync with Firestore
            if (this.firebaseAvailable && firebase.auth().currentUser) {
                await this.syncWithFirestore();
            }
            
            // Set up Firebase auth state listener
            if (this.firebaseAvailable) {
                this.setupAuthListener();
            }
            
            this.isInitialized = true;
            console.log('UserDataManager initialized successfully');
            
        } catch (error) {
            console.error('Error initializing UserDataManager:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Setup Firebase auth state listener
     */
    setupAuthListener() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // User signed in
                this.currentUser = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL
                };
                
                // Sync with Firestore
                await this.syncWithFirestore();
                
                // Save to localStorage
                localStorage.setItem('kynecta-user', JSON.stringify(this.currentUser));
                
            } else {
                // User signed out
                this.currentUser = null;
                localStorage.removeItem('kynecta-user');
            }
        });
    }

    /**
     * Load data from localStorage
     */
    loadFromLocalStorage() {
        try {
            // Load user data
            const userData = localStorage.getItem('kynecta-user');
            if (userData) {
                this.currentUser = JSON.parse(userData);
            }
            
            // Load selections
            const selectionsData = localStorage.getItem('kynecta-selections');
            if (selectionsData) {
                const savedSelections = JSON.parse(selectionsData);
                this.userSelections.moods = savedSelections.moods || [];
                this.userSelections.interests = savedSelections.interests || [];
            }
            
            // Load custom colors
            const colorsData = localStorage.getItem('kynecta-custom-colors');
            if (colorsData) {
                this.customColors = JSON.parse(colorsData);
            }
            
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            // Clear corrupted data
            this.clearLocalStorage();
        }
    }

    /**
     * Sync data with Firestore
     * @async
     */
    async syncWithFirestore() {
        if (!this.firebaseAvailable || !firebase.auth().currentUser) {
            return;
        }

        try {
            const user = firebase.auth().currentUser;
            const db = firebase.firestore();
            
            // Get user document
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // Merge data (Firestore has priority)
                this.currentUser = {
                    ...this.currentUser,
                    ...userData,
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || this.currentUser?.displayName,
                    photoURL: user.photoURL || this.currentUser?.photoURL
                };
                
                // Merge selections (prioritize Firestore, but keep local if Firestore doesn't have)
                this.userSelections.moods = userData.moods || this.userSelections.moods || [];
                this.userSelections.interests = userData.interests || this.userSelections.interests || [];
                this.customColors = userData.customColors || this.customColors;
                
                // Save to localStorage
                this.saveToLocalStorage();
                
            } else {
                // Create user document if it doesn't exist
                await this.createUserDocument(user);
            }
            
        } catch (error) {
            console.error('Error syncing with Firestore:', error);
            // If offline, use local data
            if (error.code === 'unavailable' || error.code === 'failed-precondition') {
                console.log('Using local data due to network issue');
            }
        }
    }

    /**
     * Create a new user document in Firestore
     * @async
     * @param {object} user - Firebase user object
     */
    async createUserDocument(user) {
        try {
            const userData = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || '',
                photoURL: user.photoURL || '',
                moods: this.userSelections.moods,
                interests: this.userSelections.interests,
                customColors: this.customColors,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                settings: {
                    theme: 'light',
                    notifications: true,
                    privacy: 'friends'
                }
            };
            
            await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .set(userData);
                
            this.currentUser = userData;
            
        } catch (error) {
            console.error('Error creating user document:', error);
        }
    }

    /**
     * Save current state to localStorage
     */
    saveToLocalStorage() {
        try {
            if (this.currentUser) {
                localStorage.setItem('kynecta-user', JSON.stringify(this.currentUser));
            }
            
            localStorage.setItem('kynecta-selections', JSON.stringify(this.userSelections));
            localStorage.setItem('kynecta-custom-colors', JSON.stringify(this.customColors));
            
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    /**
     * Clear localStorage data
     */
    clearLocalStorage() {
        try {
            localStorage.removeItem('kynecta-user');
            localStorage.removeItem('kynecta-selections');
            localStorage.removeItem('kynecta-custom-colors');
        } catch (error) {
            console.error('Error clearing localStorage:', error);
        }
    }

    // ===== PUBLIC API METHODS =====

    /**
     * Get all user selections
     * @returns {object} User selections
     */
    getUserSelections() {
        return {
            ...this.userSelections,
            customColors: { ...this.customColors }
        };
    }

    /**
     * Get user moods
     * @returns {Array} User moods
     */
    getUserMoods() {
        return [...this.userSelections.moods];
    }

    /**
     * Get user interests
     * @returns {Array} User interests
     */
    getUserInterests() {
        return [...this.userSelections.interests];
    }

    /**
     * Check if user has a specific mood
     * @param {string} moodId - Mood identifier
     * @returns {boolean}
     */
    hasMood(moodId) {
        return this.userSelections.moods.includes(moodId);
    }

    /**
     * Check if user has a specific interest
     * @param {string} interestId - Interest identifier
     * @returns {boolean}
     */
    hasInterest(interestId) {
        return this.userSelections.interests.includes(interestId);
    }

    /**
     * Update user selections
     * @async
     * @param {Array} newMoods - New moods array
     * @param {Array} newInterests - New interests array
     * @returns {Promise<boolean>} Success status
     */
    async updateSelections(newMoods, newInterests) {
        try {
            // Validate inputs
            if (!Array.isArray(newMoods) || !Array.isArray(newInterests)) {
                throw new Error('Invalid input: moods and interests must be arrays');
            }

            // Update local data
            this.userSelections.moods = [...newMoods];
            this.userSelections.interests = [...newInterests];
            
            // Update user object
            if (this.currentUser) {
                this.currentUser.moods = this.userSelections.moods;
                this.currentUser.interests = this.userSelections.interests;
                this.currentUser.lastUpdated = new Date().toISOString();
            }

            // Save to localStorage
            this.saveToLocalStorage();

            // Update Firestore if user is logged in
            if (this.firebaseAvailable && firebase.auth().currentUser) {
                await this.updateFirestoreSelections();
            }

            // Dispatch event for other components to listen
            this.dispatchUpdateEvent();
            
            return true;
            
        } catch (error) {
            console.error('Error updating selections:', error);
            return false;
        }
    }

    /**
     * Update custom colors
     * @async
     * @param {object} colors - New colors object
     * @returns {Promise<boolean>} Success status
     */
    async updateCustomColors(colors) {
        try {
            // Validate colors
            const validColors = {};
            const colorKeys = ['primary', 'secondary', 'accent'];
            
            colorKeys.forEach(key => {
                if (colors[key] && this.isValidColor(colors[key])) {
                    validColors[key] = colors[key];
                }
            });

            this.customColors = { ...this.customColors, ...validColors };
            
            // Update user object
            if (this.currentUser) {
                this.currentUser.customColors = this.customColors;
            }

            // Save to localStorage
            localStorage.setItem('kynecta-custom-colors', JSON.stringify(this.customColors));

            // Update Firestore if user is logged in
            if (this.firebaseAvailable && firebase.auth().currentUser) {
                await this.updateFirestoreColors();
            }

            return true;
            
        } catch (error) {
            console.error('Error updating custom colors:', error);
            return false;
        }
    }

    /**
     * Update selections in Firestore
     * @async
     */
    async updateFirestoreSelections() {
        if (!this.firebaseAvailable || !firebase.auth().currentUser) {
            return;
        }

        try {
            const user = firebase.auth().currentUser;
            const updateData = {
                moods: this.userSelections.moods,
                interests: this.userSelections.interests,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Add to history if not already present in recent entries
            const today = new Date().toDateString();
            
            // Check mood history
            if (this.userSelections.moods.length > 0) {
                updateData.moodHistory = firebase.firestore.FieldValue.arrayUnion({
                    date: firebase.firestore.FieldValue.serverTimestamp(),
                    moods: this.userSelections.moods,
                    day: today
                });
            }

            // Check interest history
            if (this.userSelections.interests.length > 0) {
                updateData.interestHistory = firebase.firestore.FieldValue.arrayUnion({
                    date: firebase.firestore.FieldValue.serverTimestamp(),
                    interests: this.userSelections.interests,
                    day: today
                });
            }

            await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .update(updateData);

        } catch (error) {
            console.error('Error updating Firestore selections:', error);
            throw error;
        }
    }

    /**
     * Update colors in Firestore
     * @async
     */
    async updateFirestoreColors() {
        if (!this.firebaseAvailable || !firebase.auth().currentUser) {
            return;
        }

        try {
            const user = firebase.auth().currentUser;
            
            await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .update({
                    customColors: this.customColors,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });

        } catch (error) {
            console.error('Error updating Firestore colors:', error);
            throw error;
        }
    }

    /**
     * Dispatch update event
     */
    dispatchUpdateEvent() {
        const event = new CustomEvent('userDataUpdated', {
            detail: {
                selections: this.getUserSelections(),
                user: this.currentUser
            }
        });
        window.dispatchEvent(event);
    }

    // ===== HELPER METHODS =====

    /**
     * Validate color string
     * @param {string} color - Color to validate
     * @returns {boolean}
     */
    isValidColor(color) {
        const s = new Option().style;
        s.color = color;
        return s.color !== '';
    }

    /**
     * Get mood display names
     * @returns {Array} Display names of moods
     */
    getMoodDisplayNames() {
        const moodMap = {
            'calm': 'Calm',
            'energetic': 'Energetic',
            'creative': 'Creative',
            'chill': 'Chill',
            'romantic': 'Romantic',
            'adventurous': 'Adventurous',
            'focused': 'Focused',
            'playful': 'Playful',
            'thoughtful': 'Thoughtful',
            'social': 'Social'
        };
        
        return this.userSelections.moods.map(moodId => moodMap[moodId] || moodId);
    }

    /**
     * Get interest display names
     * @returns {Array} Display names of interests
     */
    getInterestDisplayNames() {
        const interestMap = {
            'gaming': 'Gaming',
            'music': 'Music',
            'sports': 'Sports',
            'art': 'Art',
            'technology': 'Technology',
            'travel': 'Travel',
            'food': 'Food',
            'fashion': 'Fashion',
            'reading': 'Reading',
            'photography': 'Photography',
            'business': 'Business',
            'education': 'Education'
        };
        
        return this.userSelections.interests.map(interestId => interestMap[interestId] || interestId);
    }

    /**
     * Get custom colors
     * @returns {object} Custom colors
     */
    getCustomColors() {
        return { ...this.customColors };
    }

    /**
     * Check if manager is ready
     * @returns {boolean} Ready status
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Reset all user data (for logout/testing)
     */
    reset() {
        this.currentUser = null;
        this.userSelections = {
            moods: [],
            interests: []
        };
        this.customColors = {
            primary: '#4F46E5',
            secondary: '#10B981',
            accent: '#F59E0B'
        };
        this.clearLocalStorage();
    }
}

// Create and expose global instance
window.UserData = new UserDataManager();

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserDataManager;
}