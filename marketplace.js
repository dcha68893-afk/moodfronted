// marketplace.js - Marketplace with User-specific Listings
console.log('🛒 Marketplace script loaded');

// Firebase configuration (to be configured before deployment)
const firebaseConfig = {
  apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
  authDomain: "uniconnect-ee95c.firebaseapp.com",
  projectId: "uniconnect-ee95c",
  storageBucket: "uniconnect-ee95c.firebasestorage.app",
  messagingSenderId: "1003264444309",
  appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Firebase v9.22.1 compat imports
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let currentUser = null;
let userData = null;

// DOM Elements
const listingsContainer = document.getElementById('listingsContainer');
const userListingsContainer = document.getElementById('userListingsContainer');
const createListingBtn = document.getElementById('createListingBtn');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');

// Cloudinary configuration (to be configured before deployment)
const CLOUDINARY_UPLOAD_URL = '/upload';

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏠 Marketplace page loaded');
    
    // Check authentication
    auth.onAuthStateChanged(handleAuthStateChange);
    
    // Setup event listeners
    if (createListingBtn) {
        createListingBtn.addEventListener('click', openCreateListingModal);
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', handleCategoryFilter);
    }
});

// Handle authentication state changes
function handleAuthStateChange(user) {
    if (user) {
        currentUser = user;
        console.log('✅ User authenticated for marketplace:', user.uid);
        loadUserData(user.uid);
        loadMarketplaceListings();
        loadUserListings(user.uid);
        setupRealtimeListeners();
    } else {
        console.log('❌ No user signed in for marketplace');
        showNotification('Please log in to view marketplace', 'warning');
    }
}

// Load current user's data
async function loadUserData(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            userData = userDoc.data();
            console.log('✅ User data loaded for marketplace');
        }
    } catch (error) {
        console.error('❌ Error loading user data for marketplace:', error);
        handleFirebaseError(error, 'load user data');
    }
}

// Load marketplace listings
function loadMarketplaceListings() {
    console.log('📥 Loading marketplace listings...');
    
    try {
        const listingsQuery = db.collection('marketplace')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(20);
        
        listingsQuery.onSnapshot((snapshot) => {
            if (listingsContainer) {
                if (snapshot.empty) {
                    listingsContainer.innerHTML = `
                        <div class="text-center py-12 glass rounded-2xl">
                            <i class="fas fa-store-slash text-5xl text-theme-secondary mb-4"></i>
                            <h3 class="text-xl font-bold text-theme-accent mb-2">No listings yet</h3>
                            <p class="text-theme-secondary mb-4">Be the first to create a listing!</p>
                            <button class="bg-theme-accent text-white px-6 py-2 rounded-2xl font-semibold hover:scale-105 transition">
                                Create First Listing
                            </button>
                        </div>
                    `;
                    return;
                }
                
                let listingsHTML = '';
                snapshot.forEach(doc => {
                    const listing = doc.data();
                    listingsHTML += createListingElement(listing, doc.id);
                });
                
                listingsContainer.innerHTML = listingsHTML;
                console.log(`✅ Displayed ${snapshot.size} marketplace listings`);
                
                // Add interaction listeners
                setTimeout(addListingInteractionListeners, 100);
            }
        }, (error) => {
            console.error('❌ Error loading marketplace listings:', error);
            handleFirebaseError(error, 'load listings');
        });
        
    } catch (error) {
        console.error('❌ Error setting up marketplace listener:', error);
        handleFirebaseError(error, 'set up marketplace listener');
    }
}

// Load user's own listings
function loadUserListings(uid) {
    try {
        const userListingsQuery = db.collection('marketplace')
            .where('sellerId', '==', uid)
            .orderBy('createdAt', 'desc');
        
        userListingsQuery.onSnapshot((snapshot) => {
            if (userListingsContainer) {
                if (snapshot.empty) {
                    userListingsContainer.innerHTML = `
                        <div class="text-center py-8 glass rounded-2xl">
                            <i class="fas fa-box-open text-4xl text-theme-secondary mb-4"></i>
                            <h3 class="text-lg font-bold text-theme-accent mb-2">No listings yet</h3>
                            <p class="text-theme-secondary">Create your first listing to get started!</p>
                        </div>
                    `;
                    return;
                }
                
                let listingsHTML = '';
                snapshot.forEach(doc => {
                    const listing = doc.data();
                    listingsHTML += createUserListingElement(listing, doc.id);
                });
                
                userListingsContainer.innerHTML = listingsHTML;
                console.log(`✅ Displayed ${snapshot.size} user listings`);
                
                // Add management listeners
                setTimeout(addUserListingInteractionListeners, 100);
            }
        }, (error) => {
            console.error('❌ Error loading user listings:', error);
            handleFirebaseError(error, 'load user listings');
        });
        
    } catch (error) {
        console.error('❌ Error loading user listings:', error);
        handleFirebaseError(error, 'load user listings');
    }
}

// Create marketplace listing element
function createListingElement(listing, listingId) {
    const isOwnListing = listing.sellerId === currentUser.uid;
    const listingDate = listing.createdAt ? listing.createdAt.toDate().toLocaleDateString() : 'Recently';
    
    return `
        <div class="glass border border-purple-700 rounded-2xl p-4 mb-6" data-listing-id="${listingId}">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center space-x-3">
                    <img src="${optimizeImageUrl(listing.sellerAvatar || getDefaultAvatar(listing.sellerName))}" 
                         alt="${listing.sellerName}" 
                         class="w-10 h-10 rounded-2xl object-cover">
                    <div>
                        <h3 class="font-bold text-theme-accent">${listing.sellerName}</h3>
                        <p class="text-xs text-theme-secondary">${listingDate}</p>
                    </div>
                </div>
                <span class="tag-pill bg-blue-500/20 border-blue-500/50">${listing.category || 'General'}</span>
            </div>
            
            ${listing.images && listing.images.length > 0 ? `
                <img src="${optimizeImageUrl(listing.images[0])}" 
                     alt="${listing.title}" 
                     class="w-full h-48 object-cover rounded-2xl mb-4 cursor-pointer"
                     onclick="openImageModal('${optimizeImageUrl(listing.images[0])}')">
            ` : ''}
            
            <h4 class="text-lg font-bold text-theme-primary mb-2">${listing.title}</h4>
            <p class="text-theme-secondary mb-4 line-clamp-2">${listing.description}</p>
            
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <span class="text-xl font-bold text-theme-accent">${formatPrice(listing.price)}</span>
                    ${listing.originalPrice ? `
                        <span class="text-sm text-theme-secondary line-through">${formatPrice(listing.originalPrice)}</span>
                    ` : ''}
                </div>
                
                <div class="flex space-x-2">
                    ${!isOwnListing ? `
                        <button class="bg-theme-accent text-white px-4 py-2 rounded-2xl font-semibold hover:scale-105 transition contact-btn" 
                                data-listing-id="${listingId}">
                            Contact
                        </button>
                        <button class="glass border border-purple-700 px-4 py-2 rounded-2xl font-semibold hover:bg-purple-900/30 transition save-listing-btn" 
                                data-listing-id="${listingId}">
                            <i class="far fa-bookmark"></i>
                        </button>
                    ` : `
                        <button class="bg-green-500 text-white px-4 py-2 rounded-2xl font-semibold hover:scale-105 transition edit-listing-btn" 
                                data-listing-id="${listingId}">
                            Edit
                        </button>
                        <button class="bg-red-500 text-white px-4 py-2 rounded-2xl font-semibold hover:scale-105 transition delete-listing-btn" 
                                data-listing-id="${listingId}">
                            Delete
                        </button>
                    `}
                </div>
            </div>
            
            ${listing.tags && listing.tags.length > 0 ? `
                <div class="flex flex-wrap gap-2 mt-4">
                    ${listing.tags.map(tag => `
                        <span class="tag-pill text-xs">#${tag}</span>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

// Create user's own listing element
function createUserListingElement(listing, listingId) {
    const listingDate = listing.createdAt ? listing.createdAt.toDate().toLocaleDateString() : 'Recently';
    const statusColor = listing.status === 'active' ? 'bg-green-500/20 border-green-500/50' : 'bg-yellow-500/20 border-yellow-500/50';
    
    return `
        <div class="glass border border-purple-700 rounded-2xl p-4 mb-4" data-listing-id="${listingId}">
            <div class="flex items-center justify-between mb-3">
                <h4 class="font-bold text-theme-primary">${listing.title}</h4>
                <span class="tag-pill ${statusColor}">${listing.status}</span>
            </div>
            
            ${listing.images && listing.images.length > 0 ? `
                <img src="${optimizeImageUrl(listing.images[0])}" 
                     alt="${listing.title}" 
                     class="w-full h-32 object-cover rounded-2xl mb-3">
            ` : ''}
            
            <p class="text-theme-secondary text-sm mb-3 line-clamp-2">${listing.description}</p>
            
            <div class="flex items-center justify-between">
                <span class="text-lg font-bold text-theme-accent">${formatPrice(listing.price)}</span>
                <div class="flex space-x-2">
                    <button class="bg-blue-500 text-white px-3 py-1 rounded-2xl text-sm hover:scale-105 transition edit-listing-btn" 
                            data-listing-id="${listingId}">
                        Edit
                    </button>
                    <button class="bg-red-500 text-white px-3 py-1 rounded-2xl text-sm hover:scale-105 transition delete-listing-btn" 
                            data-listing-id="${listingId}">
                        Delete
                    </button>
                </div>
            </div>
            
            <div class="flex justify-between items-center mt-3 text-xs text-theme-secondary">
                <span>Listed: ${listingDate}</span>
                <span>Views: ${listing.views || 0}</span>
            </div>
        </div>
    `;
}

// Open create listing modal
function openCreateListingModal() {
    // Implementation for create listing modal
    showNotification('Create listing feature coming soon!', 'info');
}

// Handle search
function handleSearch() {
    const query = searchInput.value.trim();
    console.log('Searching for:', query);
    // Implement search functionality
}

// Handle category filter
function handleCategoryFilter() {
    const category = categoryFilter.value;
    console.log('Filtering by category:', category);
    // Implement category filtering
}

// Add listing interaction listeners
function addListingInteractionListeners() {
    document.querySelectorAll('.contact-btn').forEach(btn => {
        btn.addEventListener('click', handleContactSeller);
    });
    
    document.querySelectorAll('.save-listing-btn').forEach(btn => {
        btn.addEventListener('click', handleSaveListing);
    });
}

// Add user listing interaction listeners
function addUserListingInteractionListeners() {
    document.querySelectorAll('.edit-listing-btn').forEach(btn => {
        btn.addEventListener('click', handleEditListing);
    });
    
    document.querySelectorAll('.delete-listing-btn').forEach(btn => {
        btn.addEventListener('click', handleDeleteListing);
    });
}

// Handle contact seller
function handleContactSeller(event) {
    const listingId = event.currentTarget.getAttribute('data-listing-id');
    console.log('Contacting seller for listing:', listingId);
    showNotification('Contact feature coming soon!', 'info');
}

// Handle save listing
function handleSaveListing(event) {
    const listingId = event.currentTarget.getAttribute('data-listing-id');
    console.log('Saving listing:', listingId);
    showNotification('Save listing feature coming soon!', 'info');
}

// Handle edit listing
function handleEditListing(event) {
    const listingId = event.currentTarget.getAttribute('data-listing-id');
    console.log('Editing listing:', listingId);
    showNotification('Edit listing feature coming soon!', 'info');
}

// Handle delete listing
async function handleDeleteListing(event) {
    const listingId = event.currentTarget.getAttribute('data-listing-id');
    
    if (confirm('Are you sure you want to delete this listing?')) {
        try {
            await db.collection('marketplace').doc(listingId).delete();
            showNotification('Listing deleted successfully', 'success');
        } catch (error) {
            console.error('❌ Error deleting listing:', error);
            handleFirebaseError(error, 'delete listing');
        }
    }
}

// Setup real-time listeners
function setupRealtimeListeners() {
    // Listen for user data updates
    db.collection('users').doc(currentUser.uid).onSnapshot((doc) => {
        if (doc.exists) {
            userData = doc.data();
        }
    }, (error) => {
        console.error('❌ Error in real-time user listener:', error);
        handleFirebaseError(error, 'set up real-time listener');
    });
}

// Enhanced Firebase error handling
function handleFirebaseError(error, context = 'operation') {
    let userMessage = 'An unexpected error occurred';
    
    if (error.code) {
        switch (error.code) {
            case 'permission-denied':
                userMessage = 'You do not have permission to perform this action';
                break;
            case 'unauthenticated':
                userMessage = 'Please log in to continue';
                break;
            case 'not-found':
                userMessage = 'The requested item was not found';
                break;
            case 'already-exists':
                userMessage = 'This item already exists';
                break;
            case 'resource-exhausted':
                userMessage = 'Service temporarily unavailable. Please try again later';
                break;
            case 'failed-precondition':
                userMessage = 'Operation cannot be completed in current state';
                break;
            case 'aborted':
                userMessage = 'Operation was aborted';
                break;
            case 'invalid-argument':
                userMessage = 'Invalid input provided';
                break;
            case 'deadline-exceeded':
                userMessage = 'Operation timed out. Please try again';
                break;
            case 'internal':
                userMessage = 'Internal server error. Please try again later';
                break;
            case 'unavailable':
                userMessage = 'Service unavailable. Please check your connection';
                break;
            case 'data-loss':
                userMessage = 'Data loss occurred. Please refresh the page';
                break;
            case 'network-error':
                userMessage = 'Network error. Please check your internet connection';
                break;
            default:
                userMessage = `Error during ${context}: ${error.message || 'Unknown error'}`;
        }
    } else {
        userMessage = `Error during ${context}: ${error.message || 'Unknown error'}`;
    }
    
    console.error(`❌ Firebase error in ${context}:`, error.code, error.message);
    showNotification(userMessage, 'error');
}

// Utility Functions
function optimizeImageUrl(url) {
    if (!url) return '';
    
    if (url.includes('cloudinary.com') && !url.includes('f_auto,q_auto')) {
        return url.replace('/upload/', '/upload/f_auto,q_auto/');
    }
    
    return url;
}

function getDefaultAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=150`;
}

function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(price);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    console.log(`💬 ${type.toUpperCase()}: ${message}`);
    // Implement your notification system here
}

// Global function for image modal
window.openImageModal = function(imageUrl) {
    console.log('Opening image modal for:', imageUrl);
    // Implement image modal functionality
};

// Global error handler for Firebase operations
window.handleFirebaseError = handleFirebaseError;
// Register for settings updates
if (window.settingsApp) {
    window.settingsApp.addSettingsListener((settings) => {
        // Apply theme
        document.body.className = document.body.className.replace(/theme-\w+/g, '') + ' ' + settings.theme;
        
        // Apply other settings as needed
        console.log("Settings updated:", settings);
    });
}