// display-user-selections.js
class UserSelectionsDisplay {
    constructor() {
        this.availableMoods = {
            'calm': { name: 'Calm', icon: 'fas fa-spa', color: '#3B82F6' },
            'energetic': { name: 'Energetic', icon: 'fas fa-bolt', color: '#F59E0B' },
            'creative': { name: 'Creative', icon: 'fas fa-paint-brush', color: '#8B5CF6' },
            'chill': { name: 'Chill', icon: 'fas fa-couch', color: '#10B981' },
            'romantic': { name: 'Romantic', icon: 'fas fa-heart', color: '#EC4899' },
            'adventurous': { name: 'Adventurous', icon: 'fas fa-mountain', color: '#EF4444' },
            'focused': { name: 'Focused', icon: 'fas fa-bullseye', color: '#6366F1' },
            'playful': { name: 'Playful', icon: 'fas fa-gamepad', color: '#F97316' },
            'thoughtful': { name: 'Thoughtful', icon: 'fas fa-brain', color: '#14B8A6' },
            'social': { name: 'Social', icon: 'fas fa-users', color: '#84CC16' }
        };
        
        this.availableInterests = {
            'gaming': { name: 'Gaming', icon: 'fas fa-gamepad', color: '#8B5CF6' },
            'music': { name: 'Music', icon: 'fas fa-music', color: '#EC4899' },
            'sports': { name: 'Sports', icon: 'fas fa-futbol', color: '#10B981' },
            'art': { name: 'Art', icon: 'fas fa-palette', color: '#F59E0B' },
            'technology': { name: 'Technology', icon: 'fas fa-laptop-code', color: '#3B82F6' },
            'travel': { name: 'Travel', icon: 'fas fa-globe-americas', color: '#06B6D4' },
            'food': { name: 'Food & Cooking', icon: 'fas fa-utensils', color: '#EF4444' },
            'fashion': { name: 'Fashion', icon: 'fas fa-tshirt', color: '#8B5CF6' },
            'reading': { name: 'Reading', icon: 'fas fa-book', color: '#F97316' },
            'photography': { name: 'Photography', icon: 'fas fa-camera', color: '#6366F1' },
            'business': { name: 'Business', icon: 'fas fa-chart-line', color: '#14B8A6' },
            'education': { name: 'Education', icon: 'fas fa-graduation-cap', color: '#84CC16' }
        };
        
        // Initialize userDataManager placeholder
        this.initializeUserDataManager();
        
        // Inject default styles
        this.injectStyles();
        
        // Initialize with a small delay to allow other scripts to load
        setTimeout(() => this.init(), 100);
    }

    initializeUserDataManager() {
        // Create a placeholder userDataManager if it doesn't exist
        if (!window.userDataManager) {
            console.log('Creating placeholder userDataManager');
            window.userDataManager = {
                currentUser: null,
                userData: {
                    selectedMoods: [],
                    selectedInterests: [],
                    moodDisplayNames: [],
                    interestDisplayNames: []
                },
                getMoods: () => {
                    // Try to get from localStorage as fallback
                    try {
                        const stored = localStorage.getItem('kynecta-selections');
                        if (stored) {
                            const data = JSON.parse(stored);
                            return data.selectedMoods || [];
                        }
                    } catch (e) {
                        console.warn('Could not parse stored selections:', e);
                    }
                    return window.userDataManager.userData.selectedMoods;
                },
                getInterests: () => {
                    // Try to get from localStorage as fallback
                    try {
                        const stored = localStorage.getItem('kynecta-selections');
                        if (stored) {
                            const data = JSON.parse(stored);
                            return data.selectedInterests || [];
                        }
                    } catch (e) {
                        console.warn('Could not parse stored selections:', e);
                    }
                    return window.userDataManager.userData.selectedInterests;
                },
                getMoodDisplayNames: () => {
                    return window.userDataManager.userData.moodDisplayNames;
                },
                getInterestDisplayNames: () => {
                    return window.userDataManager.userData.interestDisplayNames;
                },
                loadFromLocalStorage: () => {
                    try {
                        const stored = localStorage.getItem('kynecta-selections');
                        if (stored) {
                            const data = JSON.parse(stored);
                            window.userDataManager.userData = {
                                ...window.userDataManager.userData,
                                ...data
                            };
                            window.userDataManager.currentUser = data.currentUser || null;
                        }
                    } catch (e) {
                        console.error('Error loading from localStorage:', e);
                    }
                }
            };
            
            // Try to load existing data immediately
            window.userDataManager.loadFromLocalStorage();
        }
    }

    injectStyles() {
        const styleId = 'user-selections-styles';
        if (document.getElementById(styleId)) return;
        
        const styles = `
            .selection-badge {
                display: inline-flex;
                align-items: center;
                padding: 0.375rem 0.75rem;
                margin: 0.25rem;
                border-radius: 9999px;
                font-size: 0.875rem;
                font-weight: 500;
                color: white;
                transition: all 0.2s ease;
                user-select: none;
                cursor: default;
            }
            
            .selection-badge:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            
            .selection-badge i {
                font-size: 0.875rem;
            }
            
            .mood-badge {
                background: linear-gradient(135deg, var(--badge-color, #6B7280), var(--badge-color-dark, #4B5563));
            }
            
            .interest-badge {
                background: linear-gradient(135deg, var(--badge-color, #6B7280), var(--badge-color-dark, #4B5563));
            }
            
            .no-selections-message {
                padding: 1.5rem;
                text-align: center;
                color: #9CA3AF;
                font-style: italic;
                border: 2px dashed #D1D5DB;
                border-radius: 0.75rem;
                background-color: #F9FAFB;
            }
            
            .selections-container {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                margin: 1rem 0;
            }
            
            .recommended {
                position: relative;
                border-left: 4px solid #10B981 !important;
            }
            
            .recommended::before {
                content: '✨ Recommended';
                position: absolute;
                top: -8px;
                right: 8px;
                background-color: #10B981;
                color: white;
                font-size: 0.75rem;
                padding: 2px 8px;
                border-radius: 4px;
                z-index: 10;
            }
            
            .personalized {
                position: relative;
                border: 2px solid #3B82F6 !important;
            }
            
            .personalized::before {
                content: '🎯 Personalized';
                position: absolute;
                top: -10px;
                right: 10px;
                background-color: #3B82F6;
                color: white;
                font-size: 0.75rem;
                padding: 2px 8px;
                border-radius: 4px;
                z-index: 10;
            }
            
            .relevance-score {
                position: absolute;
                top: 8px;
                left: 8px;
                background-color: rgba(59, 130, 246, 0.9);
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                font-weight: bold;
                z-index: 10;
            }
            
            .recommendation-count {
                margin: 0.5rem 0;
                padding: 0.5rem 1rem;
                background-color: #DBEAFE;
                color: #1E40AF;
                border-radius: 0.5rem;
                font-size: 0.875rem;
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    async init() {
        try {
            // Wait for DOM to be fully ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            // Display selections on page load
            this.displaySelections();
            
            // Listen for selection updates
            this.setupEventListeners();
            
            console.log('UserSelectionsDisplay initialized successfully');
        } catch (error) {
            console.error('Failed to initialize UserSelectionsDisplay:', error);
            this.showErrorState();
        }
    }

    displaySelections() {
        try {
            // Display moods
            this.displayMoods();
            
            // Display interests
            this.displayInterests();
            
            // Update any mood/interest based content
            this.updateContentBasedOnSelections();
        } catch (error) {
            console.error('Error displaying selections:', error);
        }
    }

    displayMoods() {
        const moodsContainer = document.getElementById('userMoodsDisplay');
        if (!moodsContainer) {
            // Look for any element with data-display-moods attribute
            const moodElements = document.querySelectorAll('[data-display-moods]');
            if (moodElements.length === 0) {
                console.log('No mood display containers found');
                return;
            }
            moodElements.forEach(element => {
                this.createMoodDisplay(element);
            });
            return;
        }
        
        this.createMoodDisplay(moodsContainer);
    }
    
    createMoodDisplay(container) {
        try {
            const moods = window.userDataManager.getMoods();
            const moodDisplayNames = window.userDataManager.getMoodDisplayNames();
            
            if (moods.length === 0) {
                container.innerHTML = `
                    <div class="no-selections-message">
                        <i class="fas fa-smile-beam text-2xl mb-2"></i>
                        <p>No moods selected yet</p>
                        <p class="text-sm mt-1">Select moods to get personalized content</p>
                    </div>
                `;
                return;
            }
            
            container.classList.add('selections-container');
            container.innerHTML = moods.map((moodId, index) => {
                const mood = this.availableMoods[moodId] || {
                    name: moodDisplayNames[index] || moodId,
                    icon: 'fas fa-smile',
                    color: '#6B7280'
                };
                
                return `
                    <div class="selection-badge mood-badge" 
                         data-mood="${moodId}"
                         style="--badge-color: ${mood.color}; --badge-color-dark: ${this.darkenColor(mood.color, 20)}">
                        <i class="${mood.icon} mr-2"></i>
                        <span>${mood.name}</span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error creating mood display:', error);
            container.innerHTML = '<p class="text-red-500">Error loading moods</p>';
        }
    }

    displayInterests() {
        const interestsContainer = document.getElementById('userInterestsDisplay');
        if (!interestsContainer) {
            // Look for any element with data-display-interests attribute
            const interestElements = document.querySelectorAll('[data-display-interests]');
            if (interestElements.length === 0) {
                console.log('No interest display containers found');
                return;
            }
            interestElements.forEach(element => {
                this.createInterestDisplay(element);
            });
            return;
        }
        
        this.createInterestDisplay(interestsContainer);
    }
    
    createInterestDisplay(container) {
        try {
            const interests = window.userDataManager.getInterests();
            const interestDisplayNames = window.userDataManager.getInterestDisplayNames();
            
            if (interests.length === 0) {
                container.innerHTML = `
                    <div class="no-selections-message">
                        <i class="fas fa-star text-2xl mb-2"></i>
                        <p>No interests selected yet</p>
                        <p class="text-sm mt-1">Add interests to discover relevant content</p>
                    </div>
                `;
                return;
            }
            
            container.classList.add('selections-container');
            container.innerHTML = interests.map((interestId, index) => {
                const interest = this.availableInterests[interestId] || {
                    name: interestDisplayNames[index] || interestId,
                    icon: 'fas fa-star',
                    color: '#6B7280'
                };
                
                return `
                    <div class="selection-badge interest-badge" 
                         data-interest="${interestId}"
                         style="--badge-color: ${interest.color}; --badge-color-dark: ${this.darkenColor(interest.color, 20)}">
                        <i class="${interest.icon} mr-2"></i>
                        <span>${interest.name}</span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error creating interest display:', error);
            container.innerHTML = '<p class="text-red-500">Error loading interests</p>';
        }
    }

    updateContentBasedOnSelections() {
        // Filter chat rooms based on moods
        this.filterChatRoomsByMood();
        
        // Show marketplace items based on interests
        this.filterMarketplaceByInterests();
        
        // Personalize feed
        this.personalizeContentFeed();
        
        // Update page title based on selections
        this.updatePageTitle();
    }

    filterChatRoomsByMood() {
        const chatRooms = document.querySelectorAll('.chat-room, [data-filter-moods]');
        if (chatRooms.length === 0) return;
        
        const userMoods = window.userDataManager.getMoods();
        if (userMoods.length === 0) return;
        
        let recommendedCount = 0;
        
        chatRooms.forEach(room => {
            const roomMoods = room.getAttribute('data-moods')?.split(',') || [];
            const hasMatchingMood = roomMoods.some(mood => userMoods.includes(mood.trim()));
            
            if (hasMatchingMood) {
                room.classList.add('recommended');
                room.setAttribute('title', 'Recommended based on your mood');
                room.setAttribute('data-recommended', 'true');
                recommendedCount++;
                
                // Move recommended rooms to top
                const parent = room.parentElement;
                if (parent && parent.firstChild !== room) {
                    parent.insertBefore(room, parent.firstChild);
                }
            } else {
                room.classList.remove('recommended');
                room.removeAttribute('data-recommended');
            }
        });
        
        // Show recommendation count
        this.showRecommendationCount('chat', recommendedCount);
    }

    filterMarketplaceByInterests() {
        const marketplaceItems = document.querySelectorAll('.marketplace-item, [data-filter-interests]');
        if (marketplaceItems.length === 0) return;
        
        const userInterests = window.userDataManager.getInterests();
        if (userInterests.length === 0) return;
        
        let personalizedCount = 0;
        
        marketplaceItems.forEach(item => {
            const itemInterests = item.getAttribute('data-interests')?.split(',') || [];
            const hasMatchingInterest = itemInterests.some(interest => 
                userInterests.includes(interest.trim())
            );
            
            if (hasMatchingInterest) {
                item.classList.add('personalized');
                item.setAttribute('title', 'Matches your interests');
                item.setAttribute('data-personalized', 'true');
                personalizedCount++;
                
                // Add relevance score badge
                const matchingCount = itemInterests.filter(interest => 
                    userInterests.includes(interest.trim())
                ).length;
                
                if (!item.querySelector('.relevance-score')) {
                    const scoreBadge = document.createElement('div');
                    scoreBadge.className = 'relevance-score';
                    scoreBadge.textContent = matchingCount;
                    item.style.position = 'relative';
                    item.appendChild(scoreBadge);
                }
            } else {
                item.classList.remove('personalized');
                item.removeAttribute('data-personalized');
                const scoreBadge = item.querySelector('.relevance-score');
                if (scoreBadge) {
                    scoreBadge.remove();
                }
            }
        });
        
        // Show personalized count
        this.showRecommendationCount('marketplace', personalizedCount);
    }

    personalizeContentFeed() {
        const feedItems = document.querySelectorAll('.feed-item, [data-personalize-feed]');
        if (feedItems.length === 0) return;
        
        const userMoods = window.userDataManager.getMoods();
        const userInterests = window.userDataManager.getInterests();
        
        let personalizedItems = [];
        
        feedItems.forEach(item => {
            const itemMoods = item.getAttribute('data-moods')?.split(',') || [];
            const itemInterests = item.getAttribute('data-interests')?.split(',') || [];
            
            const moodScore = itemMoods.filter(mood => 
                userMoods.includes(mood.trim())
            ).length;
            
            const interestScore = itemInterests.filter(interest => 
                userInterests.includes(interest.trim())
            ).length;
            
            const totalScore = moodScore + interestScore;
            
            if (totalScore > 0) {
                item.setAttribute('data-relevance', totalScore);
                item.classList.add('personalized');
                item.setAttribute('data-personalized', 'true');
                personalizedItems.push(item);
                
                // Add relevance score badge
                if (!item.querySelector('.relevance-score')) {
                    const scoreBadge = document.createElement('div');
                    scoreBadge.className = 'relevance-score';
                    scoreBadge.textContent = totalScore;
                    item.style.position = 'relative';
                    item.appendChild(scoreBadge);
                }
            } else {
                item.classList.remove('personalized');
                item.removeAttribute('data-personalized');
                const scoreBadge = item.querySelector('.relevance-score');
                if (scoreBadge) {
                    scoreBadge.remove();
                }
            }
        });
        
        // Sort feed items by relevance
        this.sortFeedByRelevance();
        
        // Show personalized count
        this.showRecommendationCount('feed', personalizedItems.length);
    }

    sortFeedByRelevance() {
        const feedContainer = document.querySelector('.feed-container, [data-sort-by-relevance]');
        if (!feedContainer) return;
        
        const feedItems = Array.from(feedContainer.querySelectorAll('.feed-item, [data-personalize-feed]'));
        
        feedItems.sort((a, b) => {
            const aScore = parseInt(a.getAttribute('data-relevance') || '0');
            const bScore = parseInt(b.getAttribute('data-relevance') || '0');
            const aPersonalized = a.getAttribute('data-personalized') === 'true';
            const bPersonalized = b.getAttribute('data-personalized') === 'true';
            
            // First sort by whether it's personalized
            if (aPersonalized && !bPersonalized) return -1;
            if (!aPersonalized && bPersonalized) return 1;
            
            // Then sort by relevance score
            return bScore - aScore;
        });
        
        // Reappend in sorted order
        feedItems.forEach(item => feedContainer.appendChild(item));
    }

    showRecommendationCount(type, count) {
        if (count === 0) return;
        
        // Find or create recommendation counter
        let counterElement = document.getElementById(`${type}-recommendation-count`);
        if (!counterElement) {
            const container = document.querySelector(`.${type}-container, [data-${type}-container]`);
            if (!container) return;
            
            counterElement = document.createElement('div');
            counterElement.id = `${type}-recommendation-count`;
            counterElement.className = 'recommendation-count';
            counterElement.style.cssText = `
                margin: 0.5rem 0;
                padding: 0.5rem 1rem;
                background-color: #DBEAFE;
                color: #1E40AF;
                border-radius: 0.5rem;
                font-size: 0.875rem;
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
            `;
            
            container.insertBefore(counterElement, container.firstChild);
        }
        
        const icon = type === 'chat' ? '✨' : type === 'marketplace' ? '🎯' : '📱';
        counterElement.innerHTML = `
            ${icon} <strong>${count}</strong> ${type} items personalized for you
        `;
    }

    updatePageTitle() {
        const moods = window.userDataManager.getMoods();
        const interests = window.userDataManager.getInterests();
        
        if (moods.length > 0 || interests.length > 0) {
            const moodNames = moods.map(moodId => 
                this.availableMoods[moodId]?.name || moodId
            ).slice(0, 2);
            
            const interestNames = interests.map(interestId => 
                this.availableInterests[interestId]?.name || interestId
            ).slice(0, 2);
            
            const parts = [...moodNames, ...interestNames];
            if (parts.length > 0) {
                const suffix = parts.join(' • ');
                document.title = document.title.replace(/ - .*$/, '') + ` • ${suffix}`;
            }
        }
    }

    setupEventListeners() {
        // Listen for selection updates from other tabs/windows
        window.addEventListener('storage', (e) => {
            if (e.key === 'kynecta-selections') {
                try {
                    window.userDataManager.loadFromLocalStorage();
                    this.displaySelections();
                } catch (error) {
                    console.error('Error handling storage update:', error);
                }
            }
        });
        
        // Listen for custom event when selections are updated
        document.addEventListener('userSelectionsUpdated', () => {
            this.displaySelections();
        });
        
        // Listen for custom event when user data is loaded
        document.addEventListener('userDataLoaded', () => {
            this.displaySelections();
        });
        
        // Periodically check for updates (useful for single-page apps)
        this.updateInterval = setInterval(() => {
            if (window.userDataManager && window.userDataManager.currentUser) {
                this.displaySelections();
            }
        }, 30000); // Update every 30 seconds
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        
        return '#' + (
            0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
    }

    showErrorState() {
        const errorHTML = `
            <div style="
                padding: 2rem;
                text-align: center;
                background-color: #FEF2F2;
                border: 2px solid #FCA5A5;
                border-radius: 0.75rem;
                color: #DC2626;
                margin: 1rem 0;
            ">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p class="font-bold">Unable to load your preferences</p>
                <p class="text-sm mt-1">Please refresh the page or check your connection</p>
                <button onclick="location.reload()" style="
                    margin-top: 1rem;
                    padding: 0.5rem 1rem;
                    background-color: #DC2626;
                    color: white;
                    border: none;
                    border-radius: 0.375rem;
                    cursor: pointer;
                ">
                    Refresh Page
                </button>
            </div>
        `;
        
        // Try to insert error message in relevant containers
        const containers = [
            document.getElementById('userMoodsDisplay'),
            document.getElementById('userInterestsDisplay'),
            document.querySelector('.selections-container')
        ].filter(Boolean);
        
        containers.forEach(container => {
            container.innerHTML = errorHTML;
        });
    }

    // Public method to manually refresh displays
    refresh() {
        this.displaySelections();
    }
    
    // Public method to get current selections summary
    getSelectionsSummary() {
        const moods = window.userDataManager.getMoods();
        const interests = window.userDataManager.getInterests();
        
        return {
            moods: moods.map(moodId => ({
                id: moodId,
                name: this.availableMoods[moodId]?.name || moodId,
                icon: this.availableMoods[moodId]?.icon || 'fas fa-smile'
            })),
            interests: interests.map(interestId => ({
                id: interestId,
                name: this.availableInterests[interestId]?.name || interestId,
                icon: this.availableInterests[interestId]?.icon || 'fas fa-star'
            })),
            totalCount: moods.length + interests.length
        };
    }
}

// Initialize when DOM is loaded, but with a fallback
function initializeUserSelections() {
    // Check if already initialized
    if (window.userSelectionsDisplay) {
        console.log('UserSelectionsDisplay already initialized');
        return;
    }
    
    // Wait a bit longer to ensure other scripts are loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.userSelectionsDisplay = new UserSelectionsDisplay();
                setupGlobalAccess();
            }, 500); // Give other scripts more time to load
        });
    } else {
        setTimeout(() => {
            window.userSelectionsDisplay = new UserSelectionsDisplay();
            setupGlobalAccess();
        }, 1000);
    }
}

function setupGlobalAccess() {
    // Make it available globally
    if (!window.Kynecta) window.Kynecta = {};
    window.Kynecta.UserSelectionsDisplay = UserSelectionsDisplay;
    
    // Dispatch event when ready
    document.dispatchEvent(new CustomEvent('userSelectionsDisplayReady'));
    
    console.log('UserSelectionsDisplay is ready and globally accessible');
}

// Start initialization
initializeUserSelections();
