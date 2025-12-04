// display-user-selections.js
class UserSelectionsDisplay {
    constructor() {
        this.init();
    }

    async init() {
        // Wait for user data to be loaded
        await this.waitForUserData();
        
        // Display selections on page load
        this.displaySelections();
        
        // Listen for selection updates
        this.setupEventListeners();
    }

    waitForUserData() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (window.userDataManager && window.userDataManager.currentUser !== null) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            // Timeout after 5 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 5000);
        });
    }

    displaySelections() {
        // Display moods
        this.displayMoods();
        
        // Display interests
        this.displayInterests();
        
        // Update any mood/interest based content
        this.updateContentBasedOnSelections();
    }

    displayMoods() {
        const moodsContainer = document.getElementById('userMoodsDisplay');
        if (!moodsContainer) return;
        
        const moods = window.userDataManager.getMoods();
        const moodDisplayNames = window.userDataManager.getMoodDisplayNames();
        
        if (moods.length === 0) {
            moodsContainer.innerHTML = '<p class="text-gray-400">No moods selected</p>';
            return;
        }
        
        const moodIcons = {
            'calm': 'fas fa-spa',
            'energetic': 'fas fa-bolt',
            'creative': 'fas fa-paint-brush',
            'chill': 'fas fa-couch',
            'romantic': 'fas fa-heart',
            'adventurous': 'fas fa-mountain',
            'focused': 'fas fa-bullseye',
            'playful': 'fas fa-gamepad',
            'thoughtful': 'fas fa-brain',
            'social': 'fas fa-users'
        };
        
        moodsContainer.innerHTML = moods.map((moodId, index) => `
            <div class="mood-badge" data-mood="${moodId}">
                <i class="${moodIcons[moodId] || 'fas fa-smile'} mr-2"></i>
                <span>${moodDisplayNames[index]}</span>
            </div>
        `).join('');
    }

    displayInterests() {
        const interestsContainer = document.getElementById('userInterestsDisplay');
        if (!interestsContainer) return;
        
        const interests = window.userDataManager.getInterests();
        const interestDisplayNames = window.userDataManager.getInterestDisplayNames();
        
        if (interests.length === 0) {
            interestsContainer.innerHTML = '<p class="text-gray-400">No interests selected</p>';
            return;
        }
        
        const interestIcons = {
            'gaming': 'fas fa-gamepad',
            'music': 'fas fa-music',
            'sports': 'fas fa-futbol',
            'art': 'fas fa-palette',
            'technology': 'fas fa-laptop-code',
            'travel': 'fas fa-globe-americas',
            'food': 'fas fa-utensils',
            'fashion': 'fas fa-tshirt',
            'reading': 'fas fa-book',
            'photography': 'fas fa-camera',
            'business': 'fas fa-chart-line',
            'education': 'fas fa-graduation-cap'
        };
        
        interestsContainer.innerHTML = interests.map((interestId, index) => `
            <div class="interest-badge" data-interest="${interestId}">
                <i class="${interestIcons[interestId] || 'fas fa-star'} mr-2"></i>
                <span>${interestDisplayNames[index]}</span>
            </div>
        `).join('');
    }

    updateContentBasedOnSelections() {
        // Example: Filter chat rooms based on moods
        this.filterChatRoomsByMood();
        
        // Example: Show marketplace items based on interests
        this.filterMarketplaceByInterests();
        
        // Example: Personalize feed
        this.personalizeContentFeed();
    }

    filterChatRoomsByMood() {
        // Implementation for chat.html
        const chatRooms = document.querySelectorAll('.chat-room');
        if (chatRooms.length === 0) return;
        
        const userMoods = window.userDataManager.getMoods();
        
        chatRooms.forEach(room => {
            const roomMoods = room.getAttribute('data-moods')?.split(',') || [];
            const hasMatchingMood = roomMoods.some(mood => userMoods.includes(mood));
            
            if (hasMatchingMood) {
                room.classList.add('recommended');
                room.setAttribute('title', 'Recommended based on your mood');
            }
        });
    }

    filterMarketplaceByInterests() {
        // Implementation for marketplace.html
        const marketplaceItems = document.querySelectorAll('.marketplace-item');
        if (marketplaceItems.length === 0) return;
        
        const userInterests = window.userDataManager.getInterests();
        
        marketplaceItems.forEach(item => {
            const itemInterests = item.getAttribute('data-interests')?.split(',') || [];
            const hasMatchingInterest = itemInterests.some(interest => userInterests.includes(interest));
            
            if (hasMatchingInterest) {
                item.classList.add('personalized');
                item.setAttribute('title', 'Matches your interests');
            }
        });
    }

    personalizeContentFeed() {
        // Implementation for feed.html
        const feedItems = document.querySelectorAll('.feed-item');
        if (feedItems.length === 0) return;
        
        const userMoods = window.userDataManager.getMoods();
        const userInterests = window.userDataManager.getInterests();
        
        feedItems.forEach(item => {
            const itemMoods = item.getAttribute('data-moods')?.split(',') || [];
            const itemInterests = item.getAttribute('data-interests')?.split(',') || [];
            
            const moodScore = itemMoods.filter(mood => userMoods.includes(mood)).length;
            const interestScore = itemInterests.filter(interest => userInterests.includes(interest)).length;
            const totalScore = moodScore + interestScore;
            
            if (totalScore > 0) {
                item.setAttribute('data-relevance', totalScore);
                item.classList.add('personalized');
                
                // Sort feed items by relevance
                this.sortFeedByRelevance();
            }
        });
    }

    sortFeedByRelevance() {
        const feedContainer = document.querySelector('.feed-container');
        if (!feedContainer) return;
        
        const feedItems = Array.from(feedContainer.querySelectorAll('.feed-item'));
        
        feedItems.sort((a, b) => {
            const aScore = parseInt(a.getAttribute('data-relevance') || '0');
            const bScore = parseInt(b.getAttribute('data-relevance') || '0');
            return bScore - aScore;
        });
        
        // Reappend in sorted order
        feedItems.forEach(item => feedContainer.appendChild(item));
    }

    setupEventListeners() {
        // Listen for selection updates from other tabs/windows
        window.addEventListener('storage', (e) => {
            if (e.key === 'kynecta-selections') {
                window.userDataManager.loadFromLocalStorage();
                this.displaySelections();
            }
        });
        
        // Listen for custom event when selections are updated
        document.addEventListener('userSelectionsUpdated', () => {
            this.displaySelections();
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.userSelectionsDisplay = new UserSelectionsDisplay();
});