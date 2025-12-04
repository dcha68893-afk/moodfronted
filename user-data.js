// user-data.js
class UserDataManager {
    constructor() {
        this.currentUser = null;
        this.userSelections = {
            moods: [],
            interests: []
        };
        this.init();
    }

    async init() {
        // Try to load from localStorage first
        this.loadFromLocalStorage();
        
        // If Firebase is available, sync with Firestore
        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
            await this.syncWithFirestore();
        }
    }

    loadFromLocalStorage() {
        // Load user data
        const userData = localStorage.getItem('kynecta-user');
        if (userData) {
            this.currentUser = JSON.parse(userData);
            this.userSelections.moods = this.currentUser.moods || [];
            this.userSelections.interests = this.currentUser.interests || [];
        }
        
        // Load selections separately
        const selectionsData = localStorage.getItem('kynecta-selections');
        if (selectionsData) {
            const savedSelections = JSON.parse(selectionsData);
            this.userSelections.moods = savedSelections.moods || this.userSelections.moods;
            this.userSelections.interests = savedSelections.interests || this.userSelections.interests;
        }
    }

    async syncWithFirestore() {
        try {
            const user = firebase.auth().currentUser;
            if (!user) return;

            const userDoc = await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                this.currentUser = userData;
                this.userSelections.moods = userData.moods || [];
                this.userSelections.interests = userData.interests || [];
                
                // Update localStorage
                localStorage.setItem('kynecta-user', JSON.stringify(userData));
                localStorage.setItem('kynecta-selections', JSON.stringify({
                    moods: this.userSelections.moods,
                    interests: this.userSelections.interests
                }));
            }
        } catch (error) {
            console.error('Error syncing user data:', error);
        }
    }

    getMoods() {
        return this.userSelections.moods || [];
    }

    getInterests() {
        return this.userSelections.interests || [];
    }

    hasMood(moodId) {
        return this.userSelections.moods.includes(moodId);
    }

    hasInterest(interestId) {
        return this.userSelections.interests.includes(interestId);
    }

    async updateSelections(newMoods, newInterests) {
        this.userSelections.moods = newMoods;
        this.userSelections.interests = newInterests;
        
        // Update localStorage
        localStorage.setItem('kynecta-selections', JSON.stringify(this.userSelections));
        
        // Update user object in localStorage
        if (this.currentUser) {
            this.currentUser.moods = newMoods;
            this.currentUser.interests = newInterests;
            localStorage.setItem('kynecta-user', JSON.stringify(this.currentUser));
        }
        
        // Update Firestore if user is logged in
        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
            await this.updateFirestoreSelections();
        }
    }

    async updateFirestoreSelections() {
        try {
            const user = firebase.auth().currentUser;
            if (!user) return;

            await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .update({
                    moods: this.userSelections.moods,
                    interests: this.userSelections.interests,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    moodHistory: firebase.firestore.FieldValue.arrayUnion({
                        date: firebase.firestore.FieldValue.serverTimestamp(),
                        moods: this.userSelections.moods
                    }),
                    interestHistory: firebase.firestore.FieldValue.arrayUnion({
                        date: firebase.firestore.FieldValue.serverTimestamp(),
                        interests: this.userSelections.interests
                    })
                });
        } catch (error) {
            console.error('Error updating Firestore:', error);
        }
    }

    // Helper methods for UI
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
}

// Create global instance
window.userDataManager = new UserDataManager();