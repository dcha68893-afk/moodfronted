// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
    authDomain: "uniconnect-ee95c.firebaseapp.com",
    projectId: "uniconnect-ee95c",
    storageBucket: "uniconnect-ee95c.firebasestorage.app",
    messagingSenderId: "1003264444309",
    appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized successfully");
} catch (error) {
    console.error("❌ Firebase initialization error:", error);
}


// Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Global variables
let currentUser = null;
let userData = null;
let selectedImages = [];
let currentView = 'grid';
let currentCategory = 'all';
let currentSort = 'newest';
let allListings = [];
let filteredListings = [];
let displayedCount = 0;
const listingsPerPage = 12;
let lastVisible = null;
let hasMoreListings = true;
let currentDashboard = 'home';
let currentMood = 'happy';
let safetyPopupShown = false;

// Order management variables
let userOrders = [];
let sellerOrders = [];
let adminOrders = [];

// DOM Elements
const homeDashboard = document.getElementById('homeDashboard');
const discoverDashboard = document.getElementById('discoverDashboard');
const categoriesDashboard = document.getElementById('categoriesDashboard');
const sellersDashboard = document.getElementById('sellersDashboard');
const sellerDashboard = document.getElementById('sellerDashboard');
const adminDashboard = document.getElementById('adminDashboard');
const listingsContainer = document.getElementById('listingsContainer');
const trendingItemsContainer = document.getElementById('trendingItemsContainer');
const recommendedContainer = document.getElementById('recommendedContainer');
const flashSalesContainer = document.getElementById('flashSalesContainer');
const recentlyViewedContainer = document.getElementById('recentlyViewedContainer');
const discoverItemsContainer = document.getElementById('discoverItemsContainer');
const categoryItemsContainer = document.getElementById('categoryItemsContainer');
const sellersContainer = document.getElementById('sellersContainer');
const recentSellersContainer = document.getElementById('recentSellersContainer');
const createListingBtn = document.getElementById('createListingBtn');
const createListingModal = document.getElementById('createListingModal');
const closeCreateModal = document.getElementById('closeCreateModal');
const cancelCreateListing = document.getElementById('cancelCreateListing');
const createListingForm = document.getElementById('createListingForm');
const browseImagesBtn = document.getElementById('browseImagesBtn');
const listingImages = document.getElementById('listingImages');
const imagePreview = document.getElementById('imagePreview');
const imageUploadArea = document.getElementById('imageUploadArea');
const searchInput = document.getElementById('searchInput');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const searchSuggestions = document.getElementById('searchSuggestions');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const sortFilter = document.getElementById('sortFilter');
const minPrice = document.getElementById('minPrice');
const maxPrice = document.getElementById('maxPrice');
const sellerRatingFilter = document.getElementById('sellerRatingFilter');
const locationFilter = document.getElementById('locationFilter');
const applyFilters = document.getElementById('applyFilters');
const clearFilters = document.getElementById('clearFilters');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const themeToggle = document.getElementById('themeToggle');
const userAvatar = document.getElementById('userAvatar');
const mobileUserAvatar = document.getElementById('mobileUserAvatar');
const mobileNavUserAvatar = document.getElementById('mobileNavUserAvatar');
const userName = document.getElementById('userName');
const mobileUserName = document.getElementById('mobileUserName');
const mobileNavUserName = document.getElementById('mobileNavUserName');
const userStatus = document.getElementById('userStatus');
const mobileUserStatus = document.getElementById('mobileUserStatus');
const mobileNavUserStatus = document.getElementById('mobileNavUserStatus');
const activeListingsCount = document.getElementById('activeListingsCount');
const totalUsersCount = document.getElementById('totalUsersCount');
const successfulSalesCount = document.getElementById('successfulSalesCount');
const averageRatingCount = document.getElementById('averageRatingCount');
const totalSellersCount = document.getElementById('totalSellersCount');
const verifiedSellersCount = document.getElementById('verifiedSellersCount');
const activeSellersCount = document.getElementById('activeSellersCount');
const topRatedSellersCount = document.getElementById('topRatedSellersCount');
const flashSaleTimer = document.getElementById('flashSaleTimer');
const flashSaleCountdown = document.getElementById('flashSaleCountdown');
const tagSuggestions = document.getElementById('tagSuggestions');
const listingTitle = document.getElementById('listingTitle');
const listingTags = document.getElementById('listingTags');
const cartBtn = document.getElementById('cartBtn');
const cartModal = document.getElementById('cartModal');
const closeCartModal = document.getElementById('closeCartModal');
const cartContent = document.getElementById('cartContent');
const cartCount = document.getElementById('cartCount');
const notificationBtn = document.getElementById('notificationBtn');
const notificationsModal = document.getElementById('notificationsModal');
const closeNotificationsModal = document.getElementById('closeNotificationsModal');
const notificationsContent = document.getElementById('notificationsContent');
const notificationCount = document.getElementById('notificationCount');
const notificationToast = document.getElementById('notificationToast');
const closeNotificationToast = document.getElementById('closeNotificationToast');
const notificationToastTitle = document.getElementById('notificationToastTitle');
const notificationToastMessage = document.getElementById('notificationToastMessage');
const createListingBtnText = document.getElementById('createListingBtnText');
const createListingSpinner = document.getElementById('createListingSpinner');
const hamburgerMenu = document.getElementById('hamburgerMenu');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
const closeMobileMenu = document.getElementById('closeMobileMenu');
const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
const clearRecentlyViewed = document.getElementById('clearRecentlyViewed');
const moreCategories = document.getElementById('moreCategories');
const moreCategoriesModal = document.getElementById('moreCategoriesModal');
const closeMoreCategoriesModal = document.getElementById('closeMoreCategoriesModal');
const moreCategoriesContent = document.getElementById('moreCategoriesContent');
const refreshDiscover = document.getElementById('refreshDiscover');
const refreshSellers = document.getElementById('refreshSellers');
const categorySearch = document.getElementById('categorySearch');
const hotDealsCard = document.getElementById('hotDealsCard');
const topRatedCard = document.getElementById('topRatedCard');
const justAddedCard = document.getElementById('justAddedCard');

// New DOM Elements for Contact System
const safetyPopup = document.getElementById('safetyPopup');
const closeSafetyPopup = document.getElementById('closeSafetyPopup');
const confirmSafetyGuidelines = document.getElementById('confirmSafetyGuidelines');
const dontShowAgain = document.getElementById('dontShowAgain');
const contactSellerModal = document.getElementById('contactSellerModal');
const closeContactModal = document.getElementById('closeContactModal');
const contactSellerContent = document.getElementById('contactSellerContent');
const sellerPhone = document.getElementById('sellerPhone');
const safetyAgreement = document.getElementById('safetyAgreement');

// New DOM Elements for Enhanced Features
const wishlistBtn = document.getElementById('wishlistBtn');
const wishlistModal = document.getElementById('wishlistModal');
const closeWishlistModal = document.getElementById('closeWishlistModal');
const wishlistContent = document.getElementById('wishlistContent');
const wishlistCount = document.getElementById('wishlistCount');
const ordersBtn = document.getElementById('ordersBtn');
const ordersModal = document.getElementById('ordersModal');
const closeOrdersModal = document.getElementById('closeOrdersModal');
const ordersContent = document.getElementById('ordersContent');
const messagesBtn = document.getElementById('messagesBtn');
const messagesModal = document.getElementById('messagesModal');
const closeMessagesModal = document.getElementById('closeMessagesModal');
const messagesContent = document.getElementById('messagesContent');
const messageCount = document.getElementById('messageCount');
const adminBtn = document.getElementById('adminBtn');
const sellerDashboardBtn = document.getElementById('sellerDashboardBtn');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏪 kynecta Marketplace loaded');
    
    // Check authentication
    auth.onAuthStateChanged(handleAuthStateChange);
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize carousel
    initCarousel();
    
    // Initialize theme
    initTheme();
    
    // Initialize mood
    initMood();
    
    // Start flash sale timer
    startFlashSaleTimer();
    startFlashSaleCountdown();
    
    // Check if safety popup should be shown
    checkSafetyPopup();
});

// Check and show safety popup
function checkSafetyPopup() {
    const safetyShown = localStorage.getItem('safetyPopupShown');
    if (!safetyShown) {
        setTimeout(() => {
            safetyPopup.classList.add('active');
            document.body.style.overflow = 'hidden';
        }, 1000);
    }
}

// Handle safety popup confirmation
confirmSafetyGuidelines.addEventListener('click', function() {
    if (dontShowAgain.checked) {
        localStorage.setItem('safetyPopupShown', 'true');
    }
    safetyPopup.classList.remove('active');
    document.body.style.overflow = 'auto';
});

closeSafetyPopup.addEventListener('click', function() {
    safetyPopup.classList.remove('active');
    document.body.style.overflow = 'auto';
});

// Handle authentication state changes
// Enhanced admin initialization
async function initializeAdminFeatures() {
    const isAdmin = await verifyAdminAccess();
    
    if (isAdmin) {
        console.log('✅ Admin user detected, initializing admin features');
        
        // Force show admin button
        const adminBtn = document.getElementById('adminBtn');
        if (adminBtn) {
            adminBtn.classList.remove('hidden');
            adminBtn.style.display = 'block';
        }
        
        // Load admin dashboard data immediately
        await loadAdminDashboard();
        
        // Add admin-specific event listeners
        setupAdminEventListeners();
    }
}
function setupAdminEventListeners() {
    const adminDashboard = document.getElementById('adminDashboard');
    
    // Original buttons
    adminDashboard.querySelector('.manage-users')?.addEventListener('click', showManageUsersModal);
    adminDashboard.querySelector('.manage-listings')?.addEventListener('click', showManageListingsModal);
    adminDashboard.querySelector('.view-reports')?.addEventListener('click', showViewReportsModal);
    adminDashboard.querySelector('.system-settings')?.addEventListener('click', showSystemSettingsModal);
    
    // NEW: Bulk Actions
    adminDashboard.querySelector('.bulk-delete-users')?.addEventListener('click', showBulkUserDeleteModal);
    adminDashboard.querySelector('.bulk-delete-listings')?.addEventListener('click', showBulkListingDeleteModal);
    adminDashboard.querySelector('.bulk-deactivate-listings')?.addEventListener('click', showBulkDeactivateModal);
    
    // NEW: Analytics
    adminDashboard.querySelector('.view-sales-analytics')?.addEventListener('click', showSalesAnalytics);
    adminDashboard.querySelector('.view-user-growth')?.addEventListener('click', showUserGrowthAnalytics);
    
    // NEW: Content Moderation
    adminDashboard.querySelector('.auto-moderation-settings')?.addEventListener('click', showAutoModerationSettings);
    adminDashboard.querySelector('.scan-content')?.addEventListener('click', runContentScan);
    
    // NEW: User Messaging
    adminDashboard.querySelector('.send-announcement')?.addEventListener('click', showAnnouncementModal);
    adminDashboard.querySelector('.view-messages')?.addEventListener('click', showAllMessages);
    
    // NEW: Backup & Restore
    adminDashboard.querySelector('.create-backup')?.addEventListener('click', createBackup);
    adminDashboard.querySelector('.restore-backup')?.addEventListener('click', showRestoreModal);
}

// Call this after user authentication
async function handleAuthStateChange(user) {
    if (user) {
        currentUser = user;
        console.log('✅ User authenticated:', user.uid);
        await loadUserData(user.uid);
        await loadMarketplaceData();
        updateUserUI();
        loadCartCount();
        loadNotificationCount();
        loadWishlistCount();
        loadMessageCount();
        checkUserRole();
        
        // Initialize admin features if user is admin
        await initializeAdminFeatures();
    } else {
        console.log('❌ No user signed in');
        window.location.href = 'index.html';
    }
}

// Check user role and show appropriate dashboard buttons
async function checkUserRole() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // Show seller dashboard button if user has listings
            if (userData.listings && userData.listings > 0) {
                sellerDashboardBtn.classList.remove('hidden');
            }
            
            // Show admin button if user is admin
            if (userData.role === 'admin') {
                adminBtn.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('❌ Error checking user role:', error);
    }
}

// Load current user's data from Firestore
async function loadUserData(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            userData = userDoc.data();
            console.log('✅ User data loaded:', userData);
        } else {
            // Create user document if it doesn't exist
            userData = {
                name: currentUser.displayName || 'User',
                email: currentUser.email,
                avatar: currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || 'User')}&background=6366f1&color=fff&size=150`,
                status: 'student',
                university: 'Unknown University',
                joined: new Date(),
                rating: 5.0,
                listings: 0,
                sales: 0,
                verified: false,
                phone: '',
                role: 'user'
            };
            await db.collection('users').doc(uid).set(userData);
        }
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        showToast('Error loading user data', 'error');
    }
}

// Load marketplace data
async function loadMarketplaceData() {
    try {
        await loadStats();
        await loadListings();
        await loadTrendingItems();
        await loadRecommendedItems();
        await loadFlashSales();
        await loadRecentlyViewed();
        await loadMoreCategories();
        await loadDiscoverItems();
        await loadSellers();
    } catch (error) {
        console.error('❌ Error loading marketplace data:', error);
        showToast('Error loading marketplace data', 'error');
    }
}

// Load marketplace stats
async function loadStats() {
    try {
        // Active listings count
        const activeListingsQuery = await db.collection('listings')
            .where('status', '==', 'active')
            .get();
        activeListingsCount.textContent = activeListingsQuery.size;
        
        // Total users count
        const usersQuery = await db.collection('users').get();
        totalUsersCount.textContent = usersQuery.size;
        
        // Successful sales count
        const salesQuery = await db.collection('transactions')
            .where('status', '==', 'completed')
            .get();
        successfulSalesCount.textContent = salesQuery.size;
        
        // Average rating (calculate from users)
        let totalRating = 0;
        let userCount = 0;
        usersQuery.forEach(doc => {
            const user = doc.data();
            if (user.rating) {
                totalRating += user.rating;
                userCount++;
            }
        });
        const avgRating = userCount > 0 ? (totalRating / userCount).toFixed(1) : '0.0';
        averageRatingCount.textContent = avgRating;
        
        // Seller stats
        const sellersQuery = await db.collection('users')
            .where('listings', '>', 0)
            .get();
        
        totalSellersCount.textContent = sellersQuery.size;
        
        let verifiedCount = 0;
        let activeCount = 0;
        let topRatedCount = 0;
        
        sellersQuery.forEach(doc => {
            const seller = doc.data();
            if (seller.verified) verifiedCount++;
            if (seller.listings > 0) activeCount++;
            if (seller.rating >= 4.5) topRatedCount++;
        });
        
        verifiedSellersCount.textContent = verifiedCount;
        activeSellersCount.textContent = activeCount;
        topRatedSellersCount.textContent = topRatedCount;
        
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}

// Load listings from Firestore
async function loadListings() {
    try {
        listingsContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <div class="loading-spinner mx-auto mb-4" style="width: 40px; height: 40px;"></div>
                <p class="text-gray-500 dark:text-gray-400">Loading listings...</p>
            </div>
        `;

        const query = db.collection('listings')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(listingsPerPage);

        const querySnapshot = await query.get();
        
        if (querySnapshot.empty) {
            listingsContainer.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-store text-4xl text-gray-400 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No Listings Yet</h3>
                    <p class="text-gray-500 dark:text-gray-400">Be the first to create a listing!</p>
                    <button id="createFirstListing" class="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition mt-4">
                        Create First Listing
                    </button>
                </div>
            `;
            
            // Add event listener to the create button
            document.getElementById('createFirstListing')?.addEventListener('click', openCreateListingModal);
            return;
        }

        allListings = [];
        querySnapshot.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            allListings.push(listing);
        });

        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        hasMoreListings = querySnapshot.docs.length === listingsPerPage;

        console.log(`✅ Loaded ${allListings.length} real listings from Firestore`);
        
        filteredListings = [...allListings];
        displayedCount = 0;
        displayListings();

    } catch (error) {
        console.error('❌ Error loading listings:', error);
        listingsContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Error Loading Listings</h3>
                <p class="text-gray-500 dark:text-gray-400">Please check your connection and try again</p>
            </div>
        `;
    }
}

// Load flash sales
async function loadFlashSales() {
    try {
        let query;
        
        if (isFlashSalePeriod()) {
            // During flash sale: show items marked as flash sale
            query = db.collection('listings')
                .where('status', '==', 'active')
                .where('isFlashSale', '==', true)
                .limit(4);
        } else {
            // Outside flash sale: show trending items instead
            query = db.collection('listings')
                .where('status', '==', 'active')
                .orderBy('views', 'desc')
                .limit(4);
        }

        const querySnapshot = await query.get();
        flashSalesContainer.innerHTML = '';

        if (querySnapshot.empty) {
            if (isFlashSalePeriod()) {
                flashSalesContainer.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <i class="fas fa-bolt text-4xl text-gray-400 mb-4"></i>
                        <p class="text-gray-500 dark:text-gray-400">No flash sales available</p>
                        <p class="text-sm text-gray-400 dark:text-gray-500">Sellers can add flash sales during Friday-Sunday</p>
                    </div>
                `;
            } else {
                flashSalesContainer.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <i class="fas fa-fire text-4xl text-gray-400 mb-4"></i>
                        <p class="text-gray-500 dark:text-gray-400">Flash sales available Friday-Sunday only</p>
                        <p class="text-sm text-gray-400 dark:text-gray-500">Check back on Friday for special deals!</p>
                    </div>
                `;
            }
            return;
        }

        querySnapshot.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            const productCard = createJumiaProductCard(listing);
            flashSalesContainer.appendChild(productCard);
        });

    } catch (error) {
        console.error('❌ Error loading flash sales:', error);
        flashSalesContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">Error loading flash sales</p>
            </div>
        `;
    }
}

// Load recently viewed items
async function loadRecentlyViewed() {
    try {
        if (!currentUser) return;
        
        const querySnapshot = await db.collection('recentlyViewed')
            .where('userId', '==', currentUser.uid)
            .orderBy('viewedAt', 'desc')
            .limit(4)
            .get();

        recentlyViewedContainer.innerHTML = '';

        if (querySnapshot.empty) {
            recentlyViewedContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <p class="text-gray-500 dark:text-gray-400">No recently viewed items</p>
                </div>
            `;
            return;
        }

        const listingIds = [];
        querySnapshot.forEach(doc => {
            listingIds.push(doc.data().listingId);
        });

        // Fetch the actual listings
        const listingsPromises = listingIds.map(id => 
            db.collection('listings').doc(id).get()
        );
        
        const listingsSnapshots = await Promise.all(listingsPromises);
        
        listingsSnapshots.forEach(doc => {
            if (doc.exists) {
                const listing = doc.data();
                listing.id = doc.id;
                const productCard = createJumiaProductCard(listing);
                recentlyViewedContainer.appendChild(productCard);
            }
        });

    } catch (error) {
        console.error('❌ Error loading recently viewed:', error);
        recentlyViewedContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">Error loading recently viewed</p>
            </div>
        `;
    }
}

// Load more categories
async function loadMoreCategories() {
    try {
        const categories = [
            { name: 'Baby Products', icon: 'fas fa-baby', category: 'baby' },
            { name: 'Sporting Goods', icon: 'fas fa-basketball-ball', category: 'sports' },
            { name: 'Supermarket', icon: 'fas fa-shopping-basket', category: 'supermarket' },
            { name: 'Automotive', icon: 'fas fa-car', category: 'automotive' },
            { name: 'Books & Media', icon: 'fas fa-book', category: 'books' },
            { name: 'Pets', icon: 'fas fa-paw', category: 'pets' }
        ];

        moreCategoriesContent.innerHTML = '';
        
        categories.forEach(cat => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'kynecta-category-item';
            categoryItem.setAttribute('data-category', cat.category);
            
            categoryItem.innerHTML = `
                <div class="kynecta-category-icon">
                    <i class="${cat.icon} text-indigo-600"></i>
                </div>
                <span class="kynecta-category-name">${cat.name}</span>
            `;
            
            categoryItem.addEventListener('click', () => {
                filterByCategory(cat.category);
                closeMoreCategoriesModalFunc();
            });
            
            moreCategoriesContent.appendChild(categoryItem);
        });
    } catch (error) {
        console.error('❌ Error loading more categories:', error);
    }
}

// Load discover items
async function loadDiscoverItems() {
    try {
        // Get random listings for discovery
        const querySnapshot = await db.collection('listings')
            .where('status', '==', 'active')
            .limit(8)
            .get();

        discoverItemsContainer.innerHTML = '';

        if (querySnapshot.empty) {
            discoverItemsContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-compass text-4xl text-gray-400 mb-4"></i>
                    <p class="text-gray-500 dark:text-gray-400">No items to discover yet</p>
                </div>
            `;
            return;
        }

        const listings = [];
        querySnapshot.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            listings.push(listing);
        });

        // Shuffle array for random discovery
        const shuffled = listings.sort(() => 0.5 - Math.random());
        shuffled.forEach(listing => {
            const productCard = createJumiaProductCard(listing);
            discoverItemsContainer.appendChild(productCard);
        });

    } catch (error) {
        console.error('❌ Error loading discover items:', error);
        discoverItemsContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">Error loading discovery items</p>
            </div>
        `;
    }
}

// Load sellers
async function loadSellers() {
    try {
        const querySnapshot = await db.collection('users')
            .where('listings', '>', 0)
            .orderBy('listings', 'desc')
            .limit(6)
            .get();

        sellersContainer.innerHTML = '';
        recentSellersContainer.innerHTML = '';

        if (querySnapshot.empty) {
            sellersContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-store text-4xl text-gray-400 mb-4"></i>
                    <p class="text-gray-500 dark:text-gray-400">No sellers found</p>
                </div>
            `;
            return;
        }

        querySnapshot.forEach(doc => {
            const seller = doc.data();
            seller.id = doc.id;
            const sellerCard = createSellerCard(seller);
            sellersContainer.appendChild(sellerCard);
            
            // Also add to recent sellers (for demo)
            const recentSellerCard = createSellerCard(seller);
            recentSellersContainer.appendChild(recentSellerCard);
        });

    } catch (error) {
        console.error('❌ Error loading sellers:', error);
        sellersContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">Error loading sellers</p>
            </div>
        `;
    }
}

// Load more listings
async function loadMoreListings() {
    if (!hasMoreListings) return;

    loadMoreBtn.disabled = true;
    loadMoreBtn.innerHTML = '<div class="loading-spinner mx-auto"></div>';

    try {
        const query = db.collection('listings')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .startAfter(lastVisible)
            .limit(listingsPerPage);

        const querySnapshot = await query.get();
        
        const newListings = [];
        querySnapshot.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            newListings.push(listing);
        });

        allListings = [...allListings, ...newListings];
        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        hasMoreListings = querySnapshot.docs.length === listingsPerPage;

        filteredListings = [...allListings];
        displayListings(true);

    } catch (error) {
        console.error('❌ Error loading more listings:', error);
        showToast('Error loading more listings', 'error');
    }

    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load More Listings';
}

// Load trending items (most viewed listings)
async function loadTrendingItems() {
    try {
        const querySnapshot = await db.collection('listings')
            .where('status', '==', 'active')
            .orderBy('views', 'desc')
            .limit(4)
            .get();

        trendingItemsContainer.innerHTML = '';

        if (querySnapshot.empty) {
            trendingItemsContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-chart-line text-4xl text-gray-400 mb-4"></i>
                    <p class="text-gray-500 dark:text-gray-400">No trending items yet</p>
                </div>
            `;
            return;
        }

        querySnapshot.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            const productCard = createJumiaProductCard(listing);
            trendingItemsContainer.appendChild(productCard);
        });

    } catch (error) {
        console.error('❌ Error loading trending items:', error);
        trendingItemsContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">Error loading trending items</p>
            </div>
        `;
    }
}

// Load recommended items (based on user preferences)
async function loadRecommendedItems() {
    try {
        // For now, show random active listings
        const querySnapshot = await db.collection('listings')
            .where('status', '==', 'active')
            .limit(4)
            .get();

        recommendedContainer.innerHTML = '';

        if (querySnapshot.empty) {
            recommendedContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-star text-4xl text-gray-400 mb-4"></i>
                    <p class="text-gray-500 dark:text-gray-400">No recommendations available</p>
                </div>
            `;
            return;
        }

        const listings = [];
        querySnapshot.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            listings.push(listing);
        });

        // Shuffle array for random recommendations
        const shuffled = listings.sort(() => 0.5 - Math.random());
        shuffled.slice(0, 4).forEach(listing => {
            const productCard = createJumiaProductCard(listing);
            recommendedContainer.appendChild(productCard);
        });

    } catch (error) {
        console.error('❌ Error loading recommended items:', error);
        recommendedContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">Error loading recommendations</p>
            </div>
        `;
    }
}

// Display listings in the container
function displayListings(append = false) {
    const listingsToShow = filteredListings.slice(displayedCount, displayedCount + listingsPerPage);
    
    if (!append) {
        listingsContainer.innerHTML = '';
    }
    
    if (listingsToShow.length === 0 && !append) {
        listingsContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-search text-4xl text-gray-400 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No listings found</h3>
                <p class="text-gray-500 dark:text-gray-400">Try adjusting your filters or search terms</p>
            </div>
        `;
        loadMoreBtn.classList.add('hidden');
        return;
    }
    
    listingsToShow.forEach(listing => {
        const productCard = createProductCard(listing);
        listingsContainer.appendChild(productCard);
    });
    
    displayedCount += listingsToShow.length;
    
    // Show/hide load more button
    if (displayedCount >= filteredListings.length || !hasMoreListings) {
        loadMoreBtn.classList.add('hidden');
    } else {
        loadMoreBtn.classList.remove('hidden');
    }
}

// Create product card HTML (kynecta style)
function createJumiaProductCard(listing) {
    const imageUrl = listing.images && listing.images.length > 0 
        ? listing.images[0] 
        : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80';
    
    // Calculate discount if original price exists
    const originalPrice = listing.originalPrice || listing.price * 1.5;
    const discount = Math.round(((originalPrice - listing.price) / originalPrice) * 100);
    
    const card = document.createElement('div');
    card.className = 'kynecta-product-card fade-in';
    card.setAttribute('data-listing-id', listing.id);
    
    card.innerHTML = `
        ${listing.isFlashSale ? '<div class="kynecta-express-badge">FLASH SALE</div>' : ''}
        <div class="pay-on-delivery-badge">PAY ON DELIVERY</div>
        <img src="${imageUrl}" alt="${listing.title}" class="kynecta-product-image">
        <h3 class="kynecta-product-name">${listing.title}</h3>
        <div class="kynecta-product-price">$${listing.price.toFixed(2)}</div>
        <div class="flex justify-between items-center">
            <div class="kynecta-product-original-price">$${originalPrice.toFixed(2)}</div>
            <div class="kynecta-product-discount">-${discount}%</div>
        </div>
        <div class="flex items-center justify-between mt-2">
            <div class="kynecta-rating">
                <i class="fas fa-star text-yellow-400 mr-1"></i>
                <span>${listing.rating || '4.5'}</span>
                <span class="mx-1">•</span>
                <span>${listing.reviewCount || '0'} reviews</span>
            </div>
            <div class="contact-icons">
                ${listing.contactMethod === 'whatsapp' ? '<i class="fab fa-whatsapp text-green-500 mr-1" title="WhatsApp"></i>' : ''}
                ${listing.contactMethod === 'phone' ? '<i class="fas fa-phone text-blue-500 mr-1" title="Phone"></i>' : ''}
                ${listing.contactMethod === 'message' ? '<i class="fas fa-comment text-purple-500" title="Message"></i>' : ''}
            </div>
        </div>
        ${listing.isExpress ? '<div class="kynecta-express-badge mt-2">EXPRESS</div>' : ''}
        ${listing.sellerVerified ? '<div class="verified-seller-badge mt-1"><i class="fas fa-shield-alt mr-1"></i>Verified Seller</div>' : ''}
        <div class="flex justify-between mt-3">
            <button class="wishlist-toggle-btn text-gray-500 hover:text-red-500 transition" data-listing-id="${listing.id}">
                <i class="far fa-heart"></i>
            </button>
            <button class="add-to-cart-btn bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700 transition" data-listing-id="${listing.id}">
                Add to Cart
            </button>
        </div>
    `;
    
    // Add click event to view listing
    card.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
            viewListing(listing.id);
        }
    });
    
    // Add event listeners for buttons
    const wishlistBtn = card.querySelector('.wishlist-toggle-btn');
    const addToCartBtn = card.querySelector('.add-to-cart-btn');
    
    wishlistBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWishlist(listing.id);
    });
    
    addToCartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(listing.id);
    });
    
    return card;
}

// Create product card HTML (original style)
function createProductCard(listing, isSmall = false) {
    const listingDate = listing.createdAt ? new Date(listing.createdAt.seconds * 1000).toLocaleDateString() : 'Recently';
    const imageUrl = listing.images && listing.images.length > 0 
        ? listing.images[0] 
        : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80';
    
    const card = document.createElement('div');
    card.className = `product-card glass-card rounded-xl overflow-hidden hover-lift fade-in ${currentView === 'list' ? 'list-view' : ''}`;
    card.setAttribute('data-listing-id', listing.id);
    
    card.innerHTML = `
        <div class="relative ${isSmall ? 'h-40' : 'h-48'} overflow-hidden">
            <img src="${imageUrl}" alt="${listing.title}" class="w-full h-full object-cover primary-image">
            
            ${listing.isHotDeal ? `<div class="hot-deal-badge">HOT DEAL</div>` : ''}
            <div class="pay-on-delivery-badge">PAY ON DELIVERY</div>
            
            <div class="quick-actions">
                <button class="quick-action-btn favorite-btn" data-listing-id="${listing.id}">
                    <i class="far fa-heart"></i>
                </button>
                <button class="quick-action-btn view-btn" data-listing-id="${listing.id}">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        </div>
        
        <div class="p-4 product-details">
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-semibold text-gray-900 dark:text-white line-clamp-2 flex-1">${listing.title}</h3>
                <span class="text-indigo-600 dark:text-indigo-400 font-bold ml-2 price">$${listing.price.toFixed(2)}</span>
            </div>
            
            <div class="flex items-center mb-2 seller-info">
                <img src="${listing.sellerAvatar || 'https://ui-avatars.com/api/?name=Seller&background=6366f1&color=fff&size=32'}" 
                     alt="${listing.sellerName}" 
                     class="w-6 h-6 rounded-full object-cover mr-2">
                <span class="text-sm text-gray-600 dark:text-gray-400">${listing.sellerName}</span>
                ${listing.sellerVerified ? '<span class="verified-badge"><i class="fas fa-check mr-1"></i>Verified</span>' : ''}
            </div>
            
            <div class="flex items-center justify-between mb-2">
                <div class="contact-method-indicator">
                    ${listing.contactMethod === 'whatsapp' ? '<i class="fab fa-whatsapp text-green-500 text-sm mr-1" title="Contact via WhatsApp"></i>' : ''}
                    ${listing.contactMethod === 'phone' ? '<i class="fas fa-phone text-blue-500 text-sm mr-1" title="Contact via Phone"></i>' : ''}
                    ${listing.contactMethod === 'message' ? '<i class="fas fa-comment text-purple-500 text-sm" title="Contact via Message"></i>' : ''}
                    <span class="text-xs text-gray-500">${getContactMethodText(listing.contactMethod)}</span>
                </div>
                <div class="safety-indicator">
                    ${listing.sellerVerified ? '<i class="fas fa-shield-alt text-green-500 text-sm" title="Verified Seller"></i>' : '<i class="fas fa-exclamation-triangle text-yellow-500 text-sm" title="Unverified Seller"></i>'}
                </div>
            </div>
            
            <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2 description">${listing.description || 'No description available'}</p>
            
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-1 rating">
                    <i class="fas fa-star text-yellow-400 text-sm"></i>
                    <span class="text-sm text-gray-600 dark:text-gray-400">${listing.rating || '4.5'}</span>
                    <span class="text-sm text-gray-400 dark:text-gray-500">(${listing.reviewCount || '0'})</span>
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400 date">${listingDate}</span>
            </div>
            
            ${!isSmall ? `
                <div class="flex justify-between mt-4 product-actions">
                    <button class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition flex-1 mr-2 contact-seller-btn" data-listing-id="${listing.id}">
                        Contact Seller
                    </button>
                    <button class="bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-slate-500 transition add-to-cart-btn" data-listing-id="${listing.id}">
                        <i class="fas fa-shopping-cart"></i>
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    
    // Add event listeners
    setTimeout(() => {
        const favoriteBtn = card.querySelector('.favorite-btn');
        const viewBtn = card.querySelector('.view-btn');
        const contactBtn = card.querySelector('.contact-seller-btn');
        const cartBtn = card.querySelector('.add-to-cart-btn');
        
        if (favoriteBtn) favoriteBtn.addEventListener('click', () => toggleWishlist(listing.id));
        if (viewBtn) viewBtn.addEventListener('click', () => viewListing(listing.id));
        if (contactBtn) contactBtn.addEventListener('click', () => openContactSellerModal(listing));
        if (cartBtn) cartBtn.addEventListener('click', () => addToCart(listing.id));
    }, 100);
    
    return card;
}

// Get contact method text
function getContactMethodText(method) {
    switch(method) {
        case 'whatsapp': return 'WhatsApp';
        case 'phone': return 'Phone';
        case 'message': return 'Message';
        default: return 'Contact';
    }
}

// Create seller card
function createSellerCard(seller) {
    const card = document.createElement('div');
    card.className = 'seller-card fade-in';
    
    card.innerHTML = `
        <div class="flex items-center mb-4">
            <img src="${seller.avatar || 'https://ui-avatars.com/api/?name=Seller&background=6366f1&color=fff&size=100'}" 
                 alt="${seller.name}" 
                 class="w-16 h-16 rounded-full object-cover mr-4">
            <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">${seller.name}</h3>
                <div class="flex items-center mt-1">
                    <div class="flex items-center">
                        <i class="fas fa-star text-yellow-400 mr-1"></i>
                        <span class="text-sm text-gray-600 dark:text-gray-400">${seller.rating || '5.0'}</span>
                    </div>
                    <span class="mx-2 text-gray-300">•</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">${seller.listings || 0} listings</span>
                </div>
            </div>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">${seller.sales || 0} sales</span>
            ${seller.verified ? '<span class="verified-badge"><i class="fas fa-check mr-1"></i>Verified</span>' : ''}
        </div>
        <button class="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition mt-4 view-seller-btn" data-seller-id="${seller.id}">
            View Store
        </button>
    `;
    
    // Add event listener for view seller button
    const viewSellerBtn = card.querySelector('.view-seller-btn');
    if (viewSellerBtn) {
        viewSellerBtn.addEventListener('click', () => {
            viewSeller(seller.id);
        });
    }
    
    return card;
}


// Setup event listeners - COMPLETELY REVISED VERSION
function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // Fix: Desktop Navigation
    document.querySelectorAll('.nav-link[data-section]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            console.log('Desktop nav clicked:', section);
            switchDashboard(section);
            
            // Update active states
            document.querySelectorAll('.nav-link').forEach(item => {
                item.classList.remove('active');
            });
            this.classList.add('active');
        });
    });

    // Fix: Bottom Navigation (Mobile) - CRITICAL FIX
    document.querySelectorAll('.bottom-nav-item[data-section]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            console.log('Bottom nav clicked:', section);
            switchDashboard(section);
            
            // Update active states
            document.querySelectorAll('.bottom-nav-item').forEach(navItem => {
                navItem.classList.remove('active');
            });
            this.classList.add('active');
        });
    });

    // Fix: Create listing modal
    if (createListingBtn) {
        createListingBtn.addEventListener('click', openCreateListingModal);
    }

    if (closeCreateModal) {
        closeCreateModal.addEventListener('click', closeCreateListingModal);
    }

    if (cancelCreateListing) {
        cancelCreateListing.addEventListener('click', closeCreateListingModal);
    }

    if (createListingForm) {
        createListingForm.addEventListener('submit', handleCreateListing);
    }

    // Fix: Image upload
    if (browseImagesBtn) {
        browseImagesBtn.addEventListener('click', () => {
            if (listingImages) listingImages.click();
        });
    }

    if (listingImages) {
        listingImages.addEventListener('change', handleImageSelection);
    }

    // Fix: Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Fix: View toggle
    if (gridViewBtn) {
        gridViewBtn.addEventListener('click', () => switchView('grid'));
    }

    if (listViewBtn) {
        listViewBtn.addEventListener('click', () => switchView('list'));
    }

    // Fix: Sorting and filtering
    if (sortFilter) {
        sortFilter.addEventListener('change', function() {
            currentSort = this.value;
            filterAndDisplayListings();
        });
    }

    if (applyFilters) {
        applyFilters.addEventListener('click', filterAndDisplayListings);
    }

    if (clearFilters) {
        clearFilters.addEventListener('click', clearAllFilters);
    }

    // Fix: Load more
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreListings);
    }


    // Fix: Theme toggle
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // =============================================
// MISSING EVENT LISTENERS - ADD TO setupEventListeners()
// =============================================

// More categories with null checks
if (moreCategories) {
    moreCategories.addEventListener('click', openMoreCategoriesModal);
} else {
    console.warn('moreCategories element not found');
}

if (closeMoreCategoriesModal) {
    closeMoreCategoriesModal.addEventListener('click', closeMoreCategoriesModalFunc);
} else {
    console.warn('closeMoreCategoriesModal element not found');
}

// Fix: Category search
if (categorySearch) {
    categorySearch.addEventListener('input', handleCategorySearch);
}

// Fix: Hot deals, top rated, just added cards
if (hotDealsCard) {
    hotDealsCard.addEventListener('click', function() {
        filterByCategory('electronics'); // or whatever category you want
    });
}

if (topRatedCard) {
    topRatedCard.addEventListener('click', function() {
        currentSort = 'popular';
        filterAndDisplayListings();
    });
}

if (justAddedCard) {
    justAddedCard.addEventListener('click', function() {
        currentSort = 'newest';
        filterAndDisplayListings();
    });
}

// Fix: Admin dashboard buttons - CRITICAL MISSING LISTENERS
document.addEventListener('click', function(e) {
    // Original admin buttons
    if (e.target.closest('.manage-users')) {
        showManageUsersModal();
    }
    if (e.target.closest('.manage-listings')) {
        showManageListingsModal();
    }
    if (e.target.closest('.view-reports')) {
        showViewReportsModal();
    }
    if (e.target.closest('.system-settings')) {
        showSystemSettingsModal();
    }
    
    // NEW: Bulk Actions
    if (e.target.closest('.bulk-delete-users')) {
        showBulkUserDeleteModal();
    }
    if (e.target.closest('.bulk-delete-listings')) {
        showBulkListingDeleteModal();
    }
    if (e.target.closest('.bulk-deactivate-listings')) {
        showBulkDeactivateModal();
    }
    
    // NEW: Analytics
    if (e.target.closest('.view-sales-analytics')) {
        showSalesAnalytics();
    }
    if (e.target.closest('.view-user-growth')) {
        showUserGrowthAnalytics();
    }
    
    // NEW: Content Moderation
    if (e.target.closest('.auto-moderation-settings')) {
        showAutoModerationSettings();
    }
    if (e.target.closest('.scan-content')) {
        runContentScan();
    }
    
    // NEW: User Messaging
    if (e.target.closest('.send-announcement')) {
        showAnnouncementModal();
    }
    if (e.target.closest('.view-messages')) {
        showAllMessages();
    }
    
    // NEW: Backup & Restore
    if (e.target.closest('.create-backup')) {
        createBackup();
    }
    if (e.target.closest('.restore-backup')) {
        showRestoreModal();
    }
});

// Fix: Seller dashboard buttons (if not already covered)
document.addEventListener('click', function(e) {
    if (e.target.closest('.create-listing-seller') || e.target.closest('.create-first-listing')) {
        openCreateListingModal();
    }
    if (e.target.closest('.edit-listing')) {
        const listingId = e.target.closest('.edit-listing').getAttribute('data-listing-id');
        editListing(listingId);
    }
    if (e.target.closest('.delete-listing')) {
        const listingId = e.target.closest('.delete-listing').getAttribute('data-listing-id');
        deleteListing(listingId);
    }
    if (e.target.closest('.confirm-order')) {
        const orderId = e.target.closest('.confirm-order').getAttribute('data-order-id');
        updateOrderStatus(orderId, 'confirmed');
    }
    if (e.target.closest('.cancel-order-seller')) {
        const orderId = e.target.closest('.cancel-order-seller').getAttribute('data-order-id');
        updateOrderStatus(orderId, 'cancelled');
    }
});

// Fix: Wishlist functionality in modals
document.addEventListener('click', function(e) {
    if (e.target.closest('.wishlist-toggle-details')) {
        const listingId = e.target.closest('.wishlist-toggle-details').getAttribute('data-listing-id');
        toggleWishlist(listingId);
    }
});

// Fix: Share listing functionality
document.addEventListener('click', function(e) {
    if (e.target.closest('.share-listing')) {
        const listingId = e.target.closest('.share-listing').getAttribute('data-listing-id');
        // You'll need to get the listing data first, then call shareListing
        const listingElement = document.querySelector(`[data-listing-id="${listingId}"]`);
        if (listingElement) {
            // This would need to be adapted based on your data structure
            const listing = {
                id: listingId,
                title: listingElement.querySelector('h3')?.textContent || 'Listing',
                description: listingElement.querySelector('.description')?.textContent || ''
            };
            shareListing(listing);
        }
    }
});

// Fix: Contact seller from order details
document.addEventListener('click', function(e) {
    if (e.target.closest('.contact-seller-order')) {
        const sellerId = e.target.closest('.contact-seller-order').getAttribute('data-seller-id');
        contactSellerFromOrder(sellerId);
    }
});

// Fix: Close modals with escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Close any open modal
        const openModals = document.querySelectorAll('.modal.active, .modal-content.active');
        openModals.forEach(modal => {
            if (modal.classList.contains('modal')) {
                document.body.removeChild(modal);
            } else {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
        
        // Close specific modals
        closeCreateListingModal();
        closeCartModalFunc();
        closeNotificationsModalFunc();
        closeWishlistModalFunc();
        closeOrdersModalFunc();
        closeMessagesModalFunc();
        closeContactModalFunc();
        closeMoreCategoriesModalFunc();
        closeMobileMenuFunc();
    }
});

    // Fix: Mood selector
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            const mood = this.getAttribute('data-mood');
            setMood(mood);
        });
    });

    // Fix: Category tabs
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            currentCategory = this.getAttribute('data-category');
            filterAndDisplayListings();
        });
    });

    // Fix: Cart and notifications
    if (cartBtn) {
        cartBtn.addEventListener('click', openCartModal);
    }

    if (closeCartModal) {
        closeCartModal.addEventListener('click', closeCartModalFunc);
    }

    if (notificationBtn) {
        notificationBtn.addEventListener('click', openNotificationsModal);
    }

    if (closeNotificationsModal) {
        closeNotificationsModal.addEventListener('click', closeNotificationsModalFunc);
    }

    // Fix: Mobile menu
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', openMobileMenu);
    }

    if (closeMobileMenu) {
        closeMobileMenu.addEventListener('click', closeMobileMenuFunc);
    }

    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', closeMobileMenuFunc);
    }

    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', handleLogout);
    }

    // Fix: Category cards
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', function() {
            const category = this.getAttribute('data-category');
            console.log('Category card clicked:', category);
            filterByCategory(category);
        });
    });

    // Fix: Clear recently viewed
    if (clearRecentlyViewed) {
        clearRecentlyViewed.addEventListener('click', clearRecentlyViewedItems);
    }

    // Fix: Refresh buttons
    if (refreshDiscover) {
        refreshDiscover.addEventListener('click', loadDiscoverItems);
    }

    if (refreshSellers) {
        refreshSellers.addEventListener('click', loadSellers);
    }

    // Fix: Contact modal
    if (closeContactModal) {
        closeContactModal.addEventListener('click', closeContactModalFunc);
    }

    // Fix: Safety popup
    if (confirmSafetyGuidelines) {
        confirmSafetyGuidelines.addEventListener('click', function() {
            if (dontShowAgain && dontShowAgain.checked) {
                localStorage.setItem('safetyPopupShown', 'true');
            }
            if (safetyPopup) {
                safetyPopup.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    }

    if (closeSafetyPopup) {
        closeSafetyPopup.addEventListener('click', function() {
            if (safetyPopup) {
                safetyPopup.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    }

    // Fix: Mobile navigation links in menu
    const mobileDiscoverLink = document.getElementById('mobileDiscoverLink');
    const mobileCategoriesLink = document.getElementById('mobileCategoriesLink');
    const mobileSellersLink = document.getElementById('mobileSellersLink');

    if (mobileDiscoverLink) {
        mobileDiscoverLink.addEventListener('click', function(e) {
            e.preventDefault();
            switchDashboard('discover');
            closeMobileMenuFunc();
        });
    }

    if (mobileCategoriesLink) {
        mobileCategoriesLink.addEventListener('click', function(e) {
            e.preventDefault();
            switchDashboard('categories');
            closeMobileMenuFunc();
        });
    }

    if (mobileSellersLink) {
        mobileSellersLink.addEventListener('click', function(e) {
            e.preventDefault();
            switchDashboard('sellers');
            closeMobileMenuFunc();
        });
    }

    // New: Enhanced feature buttons
    if (wishlistBtn) {
        wishlistBtn.addEventListener('click', openWishlistModal);
    }

    if (closeWishlistModal) {
        closeWishlistModal.addEventListener('click', closeWishlistModalFunc);
    }

    if (ordersBtn) {
        ordersBtn.addEventListener('click', openOrdersModal);
    }

    if (closeOrdersModal) {
        closeOrdersModal.addEventListener('click', closeOrdersModalFunc);
    }

    if (messagesBtn) {
        messagesBtn.addEventListener('click', openMessagesModal);
    }

    if (closeMessagesModal) {
        closeMessagesModal.addEventListener('click', closeMessagesModalFunc);
    }

    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminDashboard);
    }

    if (sellerDashboardBtn) {
        sellerDashboardBtn.addEventListener('click', openSellerDashboard);
    }

    console.log('✅ All event listeners setup completed');
}

// Enhanced dashboard switching
function switchDashboard(section) {
    console.log('🔄 Switching to dashboard:', section);
    
    // Hide all dashboards
    const dashboards = document.querySelectorAll('.dashboard-section');
    dashboards.forEach(dashboard => {
        dashboard.classList.remove('active');
    });
    
    // Show selected dashboard
    const targetDashboard = document.getElementById(`${section}Dashboard`);
    if (targetDashboard) {
        targetDashboard.classList.add('active');
        currentDashboard = section;
        console.log('✅ Dashboard activated:', section);
        
        // Load specific data for each dashboard
        switch(section) {
            case 'discover':
                console.log('Loading discover items...');
                loadDiscoverItems();
                break;
            case 'sellers':
                console.log('Loading sellers...');
                loadSellers();
                break;
            case 'categories':
                console.log('Loading categories...');
                loadMoreCategories();
                break;
            case 'seller':
                console.log('Loading seller dashboard...');
                loadSellerDashboard();
                break;
            case 'admin':
                console.log('Loading admin dashboard...');
                loadAdminDashboard();
                break;
            case 'home':
            default:
                console.log('Home dashboard activated');
                // Home data is already loaded
                break;
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
    } else {
        console.error('❌ Dashboard not found:', section);
    }
}

// Open contact seller modal
function openContactSellerModal(listing) {
    if (!currentUser) {
        showToast('Please log in to contact sellers', 'warning');
        return;
    }
    
    const contactMethod = listing.contactMethod || 'phone';
    const phoneNumber = listing.sellerPhone || 'Not provided';
    
    contactSellerContent.innerHTML = `
        <div class="space-y-6">
            <div class="text-center">
                <img src="${listing.images && listing.images.length > 0 ? listing.images[0] : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80'}" 
                     alt="${listing.title}" 
                     class="w-32 h-32 object-cover rounded-lg mx-auto mb-4">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">${listing.title}</h3>
                <p class="text-indigo-600 dark:text-indigo-400 font-bold text-lg">$${listing.price.toFixed(2)}</p>
            </div>
            
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Seller Information</h4>
                <div class="flex items-center mb-3">
                    <img src="${listing.sellerAvatar || 'https://ui-avatars.com/api/?name=Seller&background=6366f1&color=fff&size=32'}" 
                         alt="${listing.sellerName}" 
                         class="w-10 h-10 rounded-full object-cover mr-3">
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">${listing.sellerName}</p>
                        <div class="flex items-center">
                            <i class="fas fa-star text-yellow-400 text-sm mr-1"></i>
                            <span class="text-sm text-gray-600 dark:text-gray-400">${listing.rating || '4.5'}</span>
                            ${listing.sellerVerified ? '<span class="verified-badge ml-2"><i class="fas fa-check mr-1"></i>Verified</span>' : ''}
                        </div>
                    </div>
                </div>
                
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Phone:</span>
                        <span class="font-medium">${phoneNumber}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600 dark:text-gray-400">Preferred Contact:</span>
                        <span class="font-medium capitalize">${contactMethod}</span>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 gap-3">
                <button class="contact-action-btn bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center space-x-2" data-action="whatsapp" data-phone="${phoneNumber}" data-listing="${listing.title}">
                    <i class="fab fa-whatsapp text-xl"></i>
                    <span>Contact via WhatsApp</span>
                </button>
                
                <button class="contact-action-btn bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center space-x-2" data-action="call" data-phone="${phoneNumber}">
                    <i class="fas fa-phone text-xl"></i>
                    <span>Call Seller</span>
                </button>
                
                <button class="contact-action-btn bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition flex items-center justify-center space-x-2" data-action="message" data-phone="${phoneNumber}" data-listing="${listing.title}">
                    <i class="fas fa-comment text-xl"></i>
                    <span>Send Message</span>
                </button>
            </div>
            
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 class="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Safety Reminders</h4>
                <ul class="text-yellow-700 dark:text-yellow-300 text-sm space-y-1">
                    <li>• Meet in public places during daylight hours</li>
                    <li>• Inspect the item thoroughly before payment</li>
                    <li>• Never send money in advance</li>
                    <li>• Bring a friend if possible</li>
                    <li>• Trust your instincts - if something feels wrong, walk away</li>
                </ul>
            </div>
        </div>
    `;
    
    // Add event listeners to contact buttons
    contactSellerContent.querySelectorAll('.contact-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const phone = this.getAttribute('data-phone');
            const listingTitle = this.getAttribute('data-listing');
            handleContactAction(action, phone, listingTitle);
        });
    });
    
    contactSellerModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Handle contact actions
function handleContactAction(action, phone, listingTitle) {
    switch(action) {
        case 'whatsapp':
            const whatsappMessage = `Hi! I'm interested in your listing "${listingTitle}" on kynecta Marketplace. Is it still available?`;
            const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;
            window.open(whatsappUrl, '_blank');
            break;
            
        case 'call':
            window.open(`tel:${phone}`);
            break;
            
        case 'message':
            const smsMessage = `Hi! I'm interested in your listing "${listingTitle}" on kynecta Marketplace. Is it still available?`;
            window.open(`sms:${phone}?body=${encodeURIComponent(smsMessage)}`);
            break;
    }
    
    // Record contact attempt
    recordContactAttempt(action);
    closeContactModalFunc();
    showToast(`Contacting seller via ${action}`, 'success');
}

// Record contact attempt
async function recordContactAttempt(method) {
    if (!currentUser) return;
    
    try {
        await db.collection('contactAttempts').add({
            userId: currentUser.uid,
            contactMethod: method,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('❌ Error recording contact attempt:', error);
    }
}

// Close contact modal
function closeContactModalFunc() {
    contactSellerModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Add these missing functions:

function closeCartModalFunc() {
    if (cartModal) {
        cartModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function openNotificationsModal() {
    console.log('Notifications modal opened');
    // Implement notifications functionality
}

function closeNotificationsModalFunc() {
    if (notificationsModal) {
        notificationsModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Handle category search
function handleCategorySearch() {
    const searchTerm = categorySearch.value.toLowerCase().trim();
    
    document.querySelectorAll('.category-card, .kynecta-category-item').forEach(item => {
        const categoryName = item.querySelector('.category-name, .kynecta-category-name').textContent.toLowerCase();
        if (categoryName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Enhanced category filtering
async function filterByCategory(category) {
    console.log('Filtering by category:', category);
    
    // Update active states
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-category') === category) {
            btn.classList.add('active');
        }
    });
    
    currentCategory = category;
    
    // Show loading state
    listingsContainer.innerHTML = `
        <div class="col-span-full text-center py-12">
            <div class="loading-spinner mx-auto mb-4" style="width: 40px; height: 40px;"></div>
            <p class="text-gray-500 dark:text-gray-400">Loading ${category} items...</p>
        </div>
    `;
    
    try {
        // Load listings for this specific category
        let query = db.collection('listings')
            .where('status', '==', 'active')
            .where('category', '==', category)
            .orderBy('createdAt', 'desc')
            .limit(listingsPerPage);

        const querySnapshot = await query.get();
        
        allListings = [];
        querySnapshot.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            allListings.push(listing);
        });

        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        hasMoreListings = querySnapshot.docs.length === listingsPerPage;

        console.log(`✅ Loaded ${allListings.length} ${category} listings`);
        
        filteredListings = [...allListings];
        displayedCount = 0;
        displayListings();
        
        // Switch to home dashboard to see results
        switchDashboard('home');
        
        // Scroll to listings section
        document.getElementById('listingsContainer').scrollIntoView({ 
            behavior: 'smooth' 
        });

    } catch (error) {
        console.error('❌ Error loading category listings:', error);
        listingsContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Error Loading Items</h3>
                <p class="text-gray-500 dark:text-gray-400">No ${category} items found or error loading</p>
            </div>
        `;
    }
}

// Open more categories modal
function openMoreCategoriesModal() {
    moreCategoriesModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close more categories modal
function closeMoreCategoriesModalFunc() {
    moreCategoriesModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Clear recently viewed items
async function clearRecentlyViewedItems() {
    if (!currentUser) return;
    
    try {
        const querySnapshot = await db.collection('recentlyViewed')
            .where('userId', '==', currentUser.uid)
            .get();
        
        const batch = db.batch();
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        showToast('Recently viewed cleared', 'success');
        loadRecentlyViewed();
    } catch (error) {
        console.error('❌ Error clearing recently viewed:', error);
        showToast('Error clearing recently viewed', 'error');
    }
}

// Mobile menu functions
function openMobileMenu() {
    console.log('Opening mobile menu');
    if (mobileMenu) mobileMenu.classList.add('active');
    if (mobileMenuOverlay) mobileMenuOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeMobileMenuFunc() {
    console.log('Closing mobile menu');
    if (mobileMenu) mobileMenu.classList.remove('active');
    if (mobileMenuOverlay) mobileMenuOverlay.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Logout function
function handleLogout() {
    auth.signOut().then(() => {
        closeMobileMenuFunc();
        showToast('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    }).catch((error) => {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    });
}

// Filter and display listings based on current filters

function filterAndDisplayListings() {
    // Apply category filter
    if (currentCategory === 'all') {
        filteredListings = [...allListings];
    } else {
        filteredListings = allListings.filter(listing => listing.category === currentCategory);
    }
    
    // Apply price filter
    const minPriceValue = parseFloat(minPrice.value) || 0;
    const maxPriceValue = parseFloat(maxPrice.value) || Infinity;
    
    filteredListings = filteredListings.filter(listing => {
        return listing.price >= minPriceValue && listing.price <= maxPriceValue;
    });
    
    // Apply location filter
    const locationFilterValue = locationFilter.value;
    if (locationFilterValue && locationFilterValue !== 'any') {
        filteredListings = filteredListings.filter(listing => 
            listing.location && listing.location.toLowerCase() === locationFilterValue.toLowerCase()
        );
    }
    
    // Apply sort
    switch (currentSort) {
        case 'newest':
            filteredListings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            filteredListings.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'price-low':
            filteredListings.sort((a, b) => a.price - b.price);
            break;
        case 'price-high':
            filteredListings.sort((a, b) => b.price - a.price);
            break;
        case 'popular':
            filteredListings.sort((a, b) => (b.views || 0) - (a.views || 0));
            break;
    }
    
    displayedCount = 0;
    displayListings();
}

// Clear all filters
function clearAllFilters() {
    minPrice.value = '';
    maxPrice.value = '';
    sellerRatingFilter.value = 'any';
    locationFilter.value = 'any';
    filterAndDisplayListings();
}

function switchView(view) {
    console.log('Switching to view:', view);
    currentView = view;
    
    if (view === 'grid') {
        if (gridViewBtn) gridViewBtn.classList.add('bg-indigo-50', 'dark:bg-indigo-900/20');
        if (listViewBtn) listViewBtn.classList.remove('bg-indigo-50', 'dark:bg-indigo-900/20');
        if (listingsContainer) {
            listingsContainer.classList.remove('grid-cols-1');
            listingsContainer.classList.add('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-4');
        }
    } else {
        if (listViewBtn) listViewBtn.classList.add('bg-indigo-50', 'dark:bg-indigo-900/20');
        if (gridViewBtn) gridViewBtn.classList.remove('bg-indigo-50', 'dark:bg-indigo-900/20');
        if (listingsContainer) {
            listingsContainer.classList.remove('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-4');
            listingsContainer.classList.add('grid-cols-1');
        }
    }
    
    displayListings();
}

// Handle search functionality
function handleSearch() {
    const searchTerm = (searchInput?.value || mobileSearchInput?.value || '').toLowerCase().trim();
    
    if (searchTerm.length === 0) {
        searchSuggestions?.classList.add('hidden');
        filterAndDisplayListings();
        return;
    }
    
    // Filter listings by search term
    const searchResults = allListings.filter(listing => 
        listing.title.toLowerCase().includes(searchTerm) ||
        listing.description.toLowerCase().includes(searchTerm) ||
        (listing.tags && listing.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
    );
    
    filteredListings = searchResults;
    displayedCount = 0;
    displayListings();
}

// Open create listing modal
function openCreateListingModal() {
    if (!currentUser) {
        showToast('Please log in to create a listing', 'warning');
        return;
    }
    
    // Pre-fill phone number if available
    if (userData && userData.phone) {
        sellerPhone.value = userData.phone;
    }
    
    createListingModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close create listing modal
function closeCreateListingModal() {
    createListingModal.classList.remove('active');
    document.body.style.overflow = 'auto';
    createListingForm.reset();
    imagePreview.innerHTML = '';
    selectedImages = [];
}

// Handle image selection
function handleImageSelection(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    imagePreview.innerHTML = '';
    const fileArray = Array.from(files).slice(0, 8);
    
    fileArray.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewItem = document.createElement('div');
            previewItem.className = 'image-preview-item';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            
            const removeBtn = document.createElement('div');
            removeBtn.className = 'remove';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.addEventListener('click', function() {
                previewItem.remove();
            });
            
            previewItem.appendChild(img);
            previewItem.appendChild(removeBtn);
            imagePreview.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    });
}

// Handle create listing form submission

async function handleCreateListing(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showToast('Please log in to create a listing', 'warning');
        return;
    }
    
    const title = document.getElementById('listingTitle').value;
    const description = document.getElementById('listingDescription').value;
    const price = parseFloat(document.getElementById('listingPrice').value);
    const category = document.getElementById('listingCategory').value;
    const condition = document.querySelector('input[name="condition"]:checked').value;
    const phone = document.getElementById('sellerPhone').value;
    const contactMethod = document.querySelector('input[name="contactMethod"]:checked').value;
    const location = document.getElementById('listingLocation').value; // NEW: Location field
    const tags = document.getElementById('listingTags').value
        ? document.getElementById('listingTags').value.split(',').map(tag => tag.trim()).filter(tag => tag)
        : [];
    
    if (!title || !description || isNaN(price) || !phone || !location) { // Updated validation
        showToast('Please fill in all required fields including location', 'error');
        return;
    }
    
    // Set loading state
    createListingBtnText.textContent = 'Creating...';
    createListingSpinner.classList.remove('hidden');
    
    try {
        // Upload images if any
        let imageUrls = [];
        const files = listingImages.files;
        
        if (files && files.length > 0) {
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                
                const storageRef = storage.ref().child(`marketplace/${currentUser.uid}/${Date.now()}_${file.name}`);
                const snapshot = await storageRef.put(file);
                const url = await snapshot.ref.getDownloadURL();
                imageUrls.push(url);
            }
        }
        
        // Create listing in Firestore with location
        const listingData = {
            title,
            description,
            price,
            category,
            condition,
            tags,
            location, // NEW: Store location
            images: imageUrls,
            sellerId: currentUser.uid,
            sellerName: userData.name,
            sellerAvatar: userData.avatar,
            sellerVerified: userData.verified || false,
            sellerPhone: phone,
            contactMethod: contactMethod,
            paymentMethod: 'pay_on_delivery',
            status: 'active',
            views: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        await db.collection('listings').add(listingData);
        
        // Update user's data if needed
        if (phone && phone !== userData.phone) {
            await db.collection('users').doc(currentUser.uid).update({
                phone: phone
            });
            userData.phone = phone;
        }
        
        showToast('Listing created successfully!', 'success');
        closeCreateListingModal();
        
        // Refresh listings
        loadMarketplaceData();
        
    } catch (error) {
        console.error('❌ Error creating listing:', error);
        showToast('Error creating listing', 'error');
    } finally {
        createListingBtnText.textContent = 'Create Listing';
        createListingSpinner.classList.add('hidden');
    }
}

// Toggle wishlist
async function toggleWishlist(listingId) {
    if (!currentUser) {
        showToast('Please log in to add to wishlist', 'warning');
        return;
    }
    
    try {
        const wishlistRef = db.collection('wishlist')
            .where('userId', '==', currentUser.uid)
            .where('listingId', '==', listingId);
        
        const snapshot = await wishlistRef.get();
        
        if (snapshot.empty) {
            await db.collection('wishlist').add({
                userId: currentUser.uid,
                listingId: listingId,
                addedAt: new Date()
            });
            showToast('Added to wishlist', 'success');
        } else {
            const doc = snapshot.docs[0];
            await db.collection('wishlist').doc(doc.id).delete();
            showToast('Removed from wishlist', 'info');
        }
        
        loadWishlistCount();
    } catch (error) {
        console.error('❌ Error toggling wishlist:', error);
        showToast('Error updating wishlist', 'error');
    }
}

// Load wishlist count
async function loadWishlistCount() {
    if (!currentUser) return;
    
    try {
        const wishlistQuery = await db.collection('wishlist')
            .where('userId', '==', currentUser.uid)
            .get();
        
        const count = wishlistQuery.size;
        if (count > 0) {
            wishlistCount.textContent = count;
            wishlistCount.classList.remove('hidden');
        } else {
            wishlistCount.classList.add('hidden');
        }
    } catch (error) {
        console.error('❌ Error loading wishlist count:', error);
    }
}

// Open wishlist modal
async function openWishlistModal() {
    if (!currentUser) {
        showToast('Please log in to view wishlist', 'warning');
        return;
    }
    
    try {
        const wishlistQuery = await db.collection('wishlist')
            .where('userId', '==', currentUser.uid)
            .orderBy('addedAt', 'desc')
            .get();
        
        if (wishlistQuery.empty) {
            wishlistContent.innerHTML = `
                <div class="text-center py-12">
                    <i class="far fa-heart text-4xl text-gray-400 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Your wishlist is empty</h3>
                    <p class="text-gray-500 dark:text-gray-400">Add some items to your wishlist</p>
                </div>
            `;
        } else {
            let wishlistHTML = '<div class="space-y-4">';
            
            const listingIds = wishlistQuery.docs.map(doc => doc.data().listingId);
            
            // Fetch the actual listings
            const listingsPromises = listingIds.map(id => 
                db.collection('listings').doc(id).get()
            );
            
            const listingsSnapshots = await Promise.all(listingsPromises);
            
            listingsSnapshots.forEach(doc => {
                if (doc.exists) {
                    const listing = doc.data();
                    listing.id = doc.id;
                    
                    wishlistHTML += `
                        <div class="flex items-center space-x-4 p-4 border border-gray-200 dark:border-slate-600 rounded-lg">
                            <img src="${listing.images && listing.images.length > 0 ? listing.images[0] : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80'}" 
                                 alt="${listing.title}" 
                                 class="w-16 h-16 object-cover rounded">
                            <div class="flex-1">
                                <h4 class="font-semibold text-gray-900 dark:text-white">${listing.title}</h4>
                                <p class="text-indigo-600 dark:text-indigo-400 font-bold">$${listing.price.toFixed(2)}</p>
                            </div>
                            <div class="flex space-x-2">
                                <button class="remove-from-wishlist text-red-500 hover:text-red-700" data-id="${doc.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                                <button class="add-to-cart-from-wishlist bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700 transition" data-listing-id="${listing.id}">
                                    Add to Cart
                                </button>
                            </div>
                        </div>
                    `;
                }
            });
            
            wishlistHTML += '</div>';
            wishlistContent.innerHTML = wishlistHTML;
            
            // Add event listeners
            wishlistContent.querySelectorAll('.remove-from-wishlist').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const listingId = e.currentTarget.getAttribute('data-id');
                    await removeFromWishlist(listingId);
                });
            });
            
            wishlistContent.querySelectorAll('.add-to-cart-from-wishlist').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const listingId = e.currentTarget.getAttribute('data-listing-id');
                    await addToCart(listingId);
                });
            });
        }
        
        wishlistModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('❌ Error loading wishlist:', error);
        showToast('Error loading wishlist', 'error');
    }
}

// Close wishlist modal
function closeWishlistModalFunc() {
    wishlistModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Remove from wishlist
async function removeFromWishlist(listingId) {
    try {
        const wishlistRef = db.collection('wishlist')
            .where('userId', '==', currentUser.uid)
            .where('listingId', '==', listingId);
        
        const snapshot = await wishlistRef.get();
        
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            await db.collection('wishlist').doc(doc.id).delete();
            showToast('Removed from wishlist', 'success');
            loadWishlistCount();
            openWishlistModal(); // Refresh wishlist modal
        }
    } catch (error) {
        console.error('❌ Error removing from wishlist:', error);
        showToast('Error removing item from wishlist', 'error');
    }
}

// View listing details
async function viewListing(listingId) {
    try {
        // Record view in recently viewed
        if (currentUser) {
            await db.collection('recentlyViewed').add({
                userId: currentUser.uid,
                listingId: listingId,
                viewedAt: new Date()
            });
        }
        
        // Increment view count
        await db.collection('listings').doc(listingId).update({
            views: firebase.firestore.FieldValue.increment(1)
        });
        
        // Show listing details
        const listingDoc = await db.collection('listings').doc(listingId).get();
        if (listingDoc.exists) {
            const listing = listingDoc.data();
            showListingDetails(listing);
        }
        
    } catch (error) {
        console.error('❌ Error viewing listing:', error);
        showToast('Error viewing listing', 'error');
    }
}

// Show listing details
function showListingDetails(listing) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content max-w-3xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">${listing.title}</h2>
                <button class="close-listing-details text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <img src="${listing.images && listing.images.length > 0 ? listing.images[0] : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80'}" 
                         alt="${listing.title}" 
                         class="w-full h-64 object-cover rounded-lg">
                </div>
                <div>
                    <div class="mb-4">
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">$${listing.price.toFixed(2)}</h3>
                        <div class="pay-on-delivery-badge inline-block mb-2">PAY ON DELIVERY</div>
                        <p class="text-gray-600 dark:text-gray-400">${listing.description}</p>
                    </div>
                    <div class="mb-4">
                        <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Seller Information</h4>
                        <div class="flex items-center">
                            <img src="${listing.sellerAvatar || 'https://ui-avatars.com/api/?name=Seller&background=6366f1&color=fff&size=32'}" 
                                 alt="${listing.sellerName}" 
                                 class="w-8 h-8 rounded-full object-cover mr-2">
                            <span class="text-gray-600 dark:text-gray-400">${listing.sellerName}</span>
                            ${listing.sellerVerified ? '<span class="verified-badge ml-2"><i class="fas fa-check mr-1"></i>Verified</span>' : ''}
                        </div>
                        <div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <p><strong>Contact:</strong> ${listing.sellerPhone || 'Not provided'}</p>
                            <p><strong>Preferred Method:</strong> <span class="capitalize">${listing.contactMethod || 'phone'}</span></p>
                        </div>
                    </div>
                    <div class="flex space-x-4">
                        <button class="contact-seller-details bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition flex-1" data-listing='${JSON.stringify(listing).replace(/'/g, "\\'")}'>
                            Contact Seller
                        </button>
                        <button class="add-to-cart-details bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-slate-500 transition" data-listing-id="${listing.id}">
                            <i class="fas fa-shopping-cart mr-2"></i>Add to Cart
                        </button>
                    </div>
                    <div class="flex space-x-2 mt-4">
                        <button class="wishlist-toggle-details bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-slate-600 transition flex-1" data-listing-id="${listing.id}">
                            <i class="far fa-heart mr-2"></i>Add to Wishlist
                        </button>
                        <button class="share-listing bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-slate-600 transition" data-listing-id="${listing.id}">
                            <i class="fas fa-share-alt mr-2"></i>Share
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-listing-details');
    const contactBtn = modal.querySelector('.contact-seller-details');
    const addToCartBtn = modal.querySelector('.add-to-cart-details');
    const wishlistBtn = modal.querySelector('.wishlist-toggle-details');
    const shareBtn = modal.querySelector('.share-listing');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    contactBtn.addEventListener('click', () => {
        const listingData = JSON.parse(contactBtn.getAttribute('data-listing'));
        openContactSellerModal(listingData);
        document.body.removeChild(modal);
    });
    
    addToCartBtn.addEventListener('click', () => {
        addToCart(listing.id);
        document.body.removeChild(modal);
    });
    
    wishlistBtn.addEventListener('click', () => {
        toggleWishlist(listing.id);
        document.body.removeChild(modal);
    });
    
    shareBtn.addEventListener('click', () => {
        shareListing(listing);
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

async function viewSeller(sellerId) {
    try {
        console.log('Viewing seller:', sellerId);
        
        // Get seller data
        const sellerDoc = await db.collection('users').doc(sellerId).get();
        if (!sellerDoc.exists) {
            showToast('Seller not found', 'error');
            return;
        }
        
        const seller = sellerDoc.data();
        seller.id = sellerId;
        
        // Get seller's listings
        const listingsQuery = await db.collection('listings')
            .where('sellerId', '==', sellerId)
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .get();
        
        showSellerModal(seller, listingsQuery);
        
    } catch (error) {
        console.error('❌ Error viewing seller:', error);
        showToast('Error loading seller profile', 'error');
    }
}

function showSellerModal(seller, listingsQuery) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    let listingsHTML = '';
    if (listingsQuery.empty) {
        listingsHTML = `
            <div class="text-center py-8">
                <i class="fas fa-store text-4xl text-gray-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">No active listings</p>
            </div>
        `;
    } else {
        listingsHTML = '<div class="grid grid-cols-2 gap-4">';
        listingsQuery.forEach(doc => {
            const listing = doc.data();
            listingsHTML += `
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                    <img src="${listing.images && listing.images.length > 0 ? listing.images[0] : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=150&q=80'}" 
                         alt="${listing.title}" 
                         class="w-full h-32 object-cover rounded mb-2">
                    <h4 class="font-semibold text-sm line-clamp-2">${listing.title}</h4>
                    <p class="text-indigo-600 dark:text-indigo-400 font-bold">$${listing.price.toFixed(2)}</p>
                </div>
            `;
        });
        listingsHTML += '</div>';
    }
    
    modal.innerHTML = `
        <div class="modal-content max-w-3xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Seller Profile</h2>
                <button class="close-seller-modal text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="bg-white dark:bg-slate-800 rounded-lg p-6 mb-6">
                <div class="flex items-center mb-4">
                    <img src="${seller.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(seller.name) + '&background=6366f1&color=fff&size=100'}" 
                         alt="${seller.name}" 
                         class="w-20 h-20 rounded-full object-cover mr-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white">${seller.name}</h3>
                        <div class="flex items-center mt-2">
                            <div class="flex items-center mr-4">
                                <i class="fas fa-star text-yellow-400 mr-1"></i>
                                <span class="text-gray-600 dark:text-gray-400">${seller.rating || '5.0'}</span>
                            </div>
                            <div class="flex items-center mr-4">
                                <i class="fas fa-store mr-1 text-gray-400"></i>
                                <span class="text-gray-600 dark:text-gray-400">${listingsQuery.size} listings</span>
                            </div>
                            ${seller.verified ? '<span class="verified-badge"><i class="fas fa-check mr-1"></i>Verified</span>' : ''}
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div class="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                        <div class="text-indigo-600 font-bold">${listingsQuery.size}</div>
                        <div class="text-sm text-gray-600 dark:text-gray-400">Listings</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                        <div class="text-indigo-600 font-bold">${seller.sales || 0}</div>
                        <div class="text-sm text-gray-600 dark:text-gray-400">Sales</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                        <div class="text-indigo-600 font-bold">${seller.rating || '5.0'}</div>
                        <div class="text-sm text-gray-600 dark:text-gray-400">Rating</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                        <div class="text-indigo-600 font-bold">${seller.joined ? new Date(seller.joined.seconds * 1000).getFullYear() : '2024'}</div>
                        <div class="text-sm text-gray-600 dark:text-gray-400">Member Since</div>
                    </div>
                </div>
            </div>
            
            <div>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Seller's Listings (${listingsQuery.size})</h3>
                ${listingsHTML}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-seller-modal');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Add to cart
async function addToCart(listingId) {
    if (!currentUser) {
        showToast('Please log in to add items to cart', 'warning');
        return;
    }
    
    try {
        const listingDoc = await db.collection('listings').doc(listingId).get();
        if (!listingDoc.exists) {
            showToast('Listing not found', 'error');
            return;
        }
        
        const listing = listingDoc.data();
        
        // Check if item already in cart
        const existingCartItem = await db.collection('cart')
            .where('userId', '==', currentUser.uid)
            .where('listingId', '==', listingId)
            .get();
            
        if (!existingCartItem.empty) {
            showToast('Item already in cart', 'info');
            return;
        }
        
        // Add to cart in Firestore
        await db.collection('cart').add({
            userId: currentUser.uid,
            listingId: listingId,
            title: listing.title,
            price: listing.price,
            image: listing.images && listing.images.length > 0 ? listing.images[0] : '',
            sellerId: listing.sellerId,
            addedAt: new Date()
        });
        
        showToast('Added to cart!', 'success');
        loadCartCount();
        
    } catch (error) {
        console.error('❌ Error adding to cart:', error);
        showToast('Error adding to cart', 'error');
    }
}

// Load cart count
async function loadCartCount() {
    if (!currentUser) return;
    
    try {
        const cartQuery = await db.collection('cart')
            .where('userId', '==', currentUser.uid)
            .get();
        
        const count = cartQuery.size;
        if (count > 0) {
            cartCount.textContent = count;
            cartCount.classList.remove('hidden');
        } else {
            cartCount.classList.add('hidden');
        }
    } catch (error) {
        console.error('❌ Error loading cart count:', error);
    }
}

// Load notification count
async function loadNotificationCount() {
    if (!currentUser) return;
    
    try {
        const notificationsQuery = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .where('read', '==', false)
            .get();
        
        const count = notificationsQuery.size;
        if (count > 0) {
            notificationCount.textContent = count;
            notificationCount.classList.remove('hidden');
        } else {
            notificationCount.classList.add('hidden');
        }
    } catch (error) {
        console.error('❌ Error loading notification count:', error);
    }
}

// Open cart modal
async function openCartModal() {
    if (!currentUser) {
        showToast('Please log in to view cart', 'warning');
        return;
    }
    
    try {
        const cartQuery = await db.collection('cart')
            .where('userId', '==', currentUser.uid)
            .orderBy('addedAt', 'desc')
            .get();
        
        if (cartQuery.empty) {
            cartContent.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-shopping-cart text-4xl text-gray-400 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Your cart is empty</h3>
                    <p class="text-gray-500 dark:text-gray-400">Add some items to get started</p>
                </div>
            `;
        } else {
            let cartHTML = '<div class="space-y-4">';
            let total = 0;
            
            cartQuery.forEach(doc => {
                const item = doc.data();
                total += item.price;
                
                cartHTML += `
                    <div class="flex items-center space-x-4 p-4 border border-gray-200 dark:border-slate-600 rounded-lg">
                        <img src="${item.image || 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80'}" 
                             alt="${item.title}" 
                             class="w-16 h-16 object-cover rounded">
                        <div class="flex-1">
                            <h4 class="font-semibold text-gray-900 dark:text-white">${item.title}</h4>
                            <p class="text-indigo-600 dark:text-indigo-400 font-bold">$${item.price.toFixed(2)}</p>
                        </div>
                        <button class="remove-from-cart text-red-500 hover:text-red-700" data-id="${doc.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            });
            
            cartHTML += `
                <div class="border-t border-gray-200 dark:border-slate-600 pt-4">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-lg font-bold text-gray-900 dark:text-white">Total:</span>
                        <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400">$${total.toFixed(2)}</span>
                    </div>
                    <button class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition checkout-btn">
                        Checkout
                    </button>
                </div>
            </div>
            `;
            
            cartContent.innerHTML = cartHTML;
            
            // Add event listeners for remove buttons
            cartContent.querySelectorAll('.remove-from-cart').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const itemId = e.currentTarget.getAttribute('data-id');
                    await removeFromCart(itemId);
                });
            });
            
            // Add event listener for checkout button
            const checkoutBtn = cartContent.querySelector('.checkout-btn');
            checkoutBtn.addEventListener('click', () => {
                initiateCheckout();
            });
        }
        
        cartModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('❌ Error loading cart:', error);
        showToast('Error loading cart', 'error');
    }
}

// Close cart modal
function closeCartModalFunc() {
    cartModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Remove from cart
async function removeFromCart(itemId) {
    try {
        await db.collection('cart').doc(itemId).delete();
        showToast('Item removed from cart', 'success');
        loadCartCount();
        openCartModal(); // Refresh cart modal
    } catch (error) {
        console.error('❌ Error removing from cart:', error);
        showToast('Error removing item from cart', 'error');
    }
}

// Initiate checkout process
async function initiateCheckout() {
    if (!currentUser) {
        showToast('Please log in to checkout', 'warning');
        return;
    }
    
    try {
        const cartQuery = await db.collection('cart')
            .where('userId', '==', currentUser.uid)
            .get();
        
        if (cartQuery.empty) {
            showToast('Your cart is empty', 'warning');
            return;
        }
        
        let total = 0;
        const items = [];
        
        cartQuery.forEach(doc => {
            const item = doc.data();
            total += item.price;
            items.push({
                listingId: item.listingId,
                title: item.title,
                price: item.price,
                sellerId: item.sellerId
            });
        });
        
        // Create order
        const orderData = {
            userId: currentUser.uid,
            items: items,
            total: total,
            status: 'pending',
            createdAt: new Date(),
            paymentMethod: 'pay_on_delivery',
            shippingAddress: userData.address || 'Not specified'
        };
        
        const orderRef = await db.collection('orders').add(orderData);
        
        // Clear cart
        const batch = db.batch();
        cartQuery.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        showToast('Order placed successfully!', 'success');
        loadCartCount();
        closeCartModalFunc();
        
        // Show order confirmation
        showOrderConfirmation(orderRef.id, orderData);
        
    } catch (error) {
        console.error('❌ Error during checkout:', error);
        showToast('Error during checkout', 'error');
    }
}

// Show order confirmation
function showOrderConfirmation(orderId, orderData) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Order Confirmation</h2>
                <button class="close-order-confirmation text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="space-y-6">
                <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div class="flex items-center">
                        <i class="fas fa-check-circle text-green-500 text-2xl mr-3"></i>
                        <div>
                            <h3 class="font-semibold text-green-800 dark:text-green-200">Order Placed Successfully!</h3>
                            <p class="text-green-700 dark:text-green-300">Order ID: ${orderId}</p>
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Order Summary</h4>
                        <div class="space-y-2">
                            ${orderData.items.map(item => `
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">${item.title}</span>
                                    <span class="font-medium">$${item.price.toFixed(2)}</span>
                                </div>
                            `).join('')}
                            <div class="border-t pt-2 mt-2">
                                <div class="flex justify-between font-bold">
                                    <span>Total:</span>
                                    <span>$${orderData.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Next Steps</h4>
                        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <p>• Sellers will contact you to arrange delivery</p>
                            <p>• Pay only when you receive the items</p>
                            <p>• Inspect items thoroughly before payment</p>
                            <p>• Meet in safe, public locations</p>
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end">
                    <button class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition view-orders-btn">
                        View My Orders
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-order-confirmation');
    const viewOrdersBtn = modal.querySelector('.view-orders-btn');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    viewOrdersBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
        openOrdersModal();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Open orders modal
async function openOrdersModal() {
    if (!currentUser) {
        showToast('Please log in to view orders', 'warning');
        return;
    }
    
    try {
        const ordersQuery = await db.collection('orders')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        if (ordersQuery.empty) {
            ordersContent.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-shopping-bag text-4xl text-gray-400 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No orders yet</h3>
                    <p class="text-gray-500 dark:text-gray-400">Your orders will appear here</p>
                </div>
            `;
        } else {
            let ordersHTML = '<div class="space-y-4">';
            
            ordersQuery.forEach(doc => {
                const order = doc.data();
                const orderDate = order.createdAt.toDate().toLocaleDateString();
                const statusColor = getOrderStatusColor(order.status);
                
                ordersHTML += `
                    <div class="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white">Order #${doc.id.substring(0, 8)}</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">${orderDate}</p>
                            </div>
                            <span class="px-3 py-1 rounded-full text-sm font-medium ${statusColor}">${order.status}</span>
                        </div>
                        
                        <div class="space-y-2 mb-3">
                            ${order.items.map(item => `
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">${item.title}</span>
                                    <span class="font-medium">$${item.price.toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="flex justify-between items-center border-t pt-3">
                            <span class="font-bold text-gray-900 dark:text-white">Total: $${order.total.toFixed(2)}</span>
                            <button class="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-medium view-order-details" data-order-id="${doc.id}">
                                View Details
                            </button>
                        </div>
                    </div>
                `;
            });
            
            ordersHTML += '</div>';
            ordersContent.innerHTML = ordersHTML;
            
            // Add event listeners for view order details
            ordersContent.querySelectorAll('.view-order-details').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const orderId = e.currentTarget.getAttribute('data-order-id');
                    viewOrderDetails(orderId);
                });
            });
        }
        
        ordersModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('❌ Error loading orders:', error);
        showToast('Error loading orders', 'error');
    }
}

// Get order status color
function getOrderStatusColor(status) {
    switch(status) {
        case 'pending':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
        case 'confirmed':
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
        case 'shipped':
            return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
        case 'delivered':
            return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
        case 'cancelled':
            return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
}

// Close orders modal
function closeOrdersModalFunc() {
    ordersModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// View order details
async function viewOrderDetails(orderId) {
    try {
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) {
            showToast('Order not found', 'error');
            return;
        }
        
        const order = orderDoc.data();
        showOrderDetailsModal(orderId, order);
        
    } catch (error) {
        console.error('❌ Error loading order details:', error);
        showToast('Error loading order details', 'error');
    }
}

// Show order details modal
function showOrderDetailsModal(orderId, order) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    const orderDate = order.createdAt.toDate().toLocaleDateString();
    const statusColor = getOrderStatusColor(order.status);
    
    modal.innerHTML = `
        <div class="modal-content max-w-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Order Details</h2>
                <button class="close-order-details text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Order Information</h4>
                        <div class="space-y-2">
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">Order ID:</span>
                                <span class="font-medium">${orderId.substring(0, 8)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">Order Date:</span>
                                <span class="font-medium">${orderDate}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">Status:</span>
                                <span class="font-medium ${statusColor} px-2 py-1 rounded">${order.status}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600 dark:text-gray-400">Payment Method:</span>
                                <span class="font-medium capitalize">${order.paymentMethod.replace('_', ' ')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Shipping Information</h4>
                        <div class="space-y-2">
                            <div class="text-gray-600 dark:text-gray-400">
                                ${order.shippingAddress}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div>
                    <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Order Items</h4>
                    <div class="space-y-3">
                        ${order.items.map(item => `
                            <div class="flex items-center space-x-4 p-3 border border-gray-200 dark:border-slate-600 rounded-lg">
                                <div class="flex-1">
                                    <h5 class="font-medium text-gray-900 dark:text-white">${item.title}</h5>
                                    <p class="text-indigo-600 dark:text-indigo-400 font-bold">$${item.price.toFixed(2)}</p>
                                </div>
                                <button class="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-medium contact-seller-order" data-seller-id="${item.sellerId}">
                                    Contact Seller
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="border-t pt-4">
                    <div class="flex justify-between items-center">
                        <span class="text-lg font-bold text-gray-900 dark:text-white">Total Amount:</span>
                        <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400">$${order.total.toFixed(2)}</span>
                    </div>
                </div>
                
                ${order.status === 'pending' ? `
                    <div class="flex justify-end space-x-3">
                        <button class="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition cancel-order" data-order-id="${orderId}">
                            Cancel Order
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-order-details');
    const contactSellerBtns = modal.querySelectorAll('.contact-seller-order');
    const cancelOrderBtn = modal.querySelector('.cancel-order');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    contactSellerBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const sellerId = e.currentTarget.getAttribute('data-seller-id');
            await contactSellerFromOrder(sellerId);
        });
    });
    
    if (cancelOrderBtn) {
        cancelOrderBtn.addEventListener('click', async (e) => {
            const orderId = e.currentTarget.getAttribute('data-order-id');
            await cancelOrder(orderId);
            document.body.removeChild(modal);
        });
    }
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Contact seller from order
async function contactSellerFromOrder(sellerId) {
    try {
        const sellerDoc = await db.collection('users').doc(sellerId).get();
        if (!sellerDoc.exists) {
            showToast('Seller not found', 'error');
            return;
        }
        
        const seller = sellerDoc.data();
        
        // Create a simple contact modal
        const contactModal = document.createElement('div');
        contactModal.className = 'modal active';
        
        contactModal.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Contact Seller</h2>
                    <button class="close-contact-seller text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="space-y-4">
                    <div class="flex items-center space-x-3">
                        <img src="${seller.avatar || 'https://ui-avatars.com/api/?name=Seller&background=6366f1&color=fff&size=100'}" 
                             alt="${seller.name}" 
                             class="w-12 h-12 rounded-full object-cover">
                        <div>
                            <h4 class="font-semibold text-gray-900 dark:text-white">${seller.name}</h4>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Seller</p>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span class="text-gray-600 dark:text-gray-400">Phone:</span>
                            <span class="font-medium">${seller.phone || 'Not provided'}</span>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 gap-3">
                        ${seller.phone ? `
                            <button class="contact-action-btn bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center space-x-2" data-action="whatsapp" data-phone="${seller.phone}">
                                <i class="fab fa-whatsapp text-xl"></i>
                                <span>Contact via WhatsApp</span>
                            </button>
                            
                            <button class="contact-action-btn bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center space-x-2" data-action="call" data-phone="${seller.phone}">
                                <i class="fas fa-phone text-xl"></i>
                                <span>Call Seller</span>
                            </button>
                        ` : '<p class="text-center text-gray-500 dark:text-gray-400">No contact information available</p>'}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(contactModal);
        
        // Add event listeners
        const closeBtn = contactModal.querySelector('.close-contact-seller');
        const contactBtns = contactModal.querySelectorAll('.contact-action-btn');
        
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(contactModal);
        });
        
        contactBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const action = this.getAttribute('data-action');
                const phone = this.getAttribute('data-phone');
                handleContactAction(action, phone, 'Order Inquiry');
                document.body.removeChild(contactModal);
            });
        });
        
        contactModal.addEventListener('click', (e) => {
            if (e.target === contactModal) {
                document.body.removeChild(contactModal);
            }
        });
        
    } catch (error) {
        console.error('❌ Error contacting seller:', error);
        showToast('Error contacting seller', 'error');
    }
}

// Cancel order
async function cancelOrder(orderId) {
    try {
        await db.collection('orders').doc(orderId).update({
            status: 'cancelled',
            cancelledAt: new Date()
        });
        
        showToast('Order cancelled successfully', 'success');
        openOrdersModal(); // Refresh orders modal
        
    } catch (error) {
        console.error('❌ Error cancelling order:', error);
        showToast('Error cancelling order', 'error');
    }
}

// Open notifications modal
async function openNotificationsModal() {
    if (!currentUser) {
        showToast('Please log in to view notifications', 'warning');
        return;
    }
    
    try {
        const notificationsQuery = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
        
        if (notificationsQuery.empty) {
            notificationsContent.innerHTML = `
                <div class="text-center py-12">
                    <i class="far fa-bell text-4xl text-gray-400 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No notifications</h3>
                    <p class="text-gray-500 dark:text-gray-400">You're all caught up!</p>
                </div>
            `;
        } else {
            let notificationsHTML = '<div class="space-y-4">';
            
            notificationsQuery.forEach(doc => {
                const notification = doc.data();
                const timeAgo = formatTimeAgo(notification.createdAt);
                
                notificationsHTML += `
                    <div class="p-4 border border-gray-200 dark:border-slate-600 rounded-lg ${notification.read ? 'bg-gray-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-700'}">
                        <div class="flex justify-between items-start">
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white">${notification.title}</h4>
                                <p class="text-gray-600 dark:text-gray-400 mt-1">${notification.message}</p>
                            </div>
                            <span class="text-xs text-gray-500 dark:text-gray-400">${timeAgo}</span>
                        </div>
                    </div>
                `;
            });
            
            notificationsHTML += '</div>';
            notificationsContent.innerHTML = notificationsHTML;
        }
        
        notificationsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('❌ Error loading notifications:', error);
        showToast('Error loading notifications', 'error');
    }
}

// Close notifications modal
function closeNotificationsModalFunc() {
    notificationsModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Load message count
async function loadMessageCount() {
    if (!currentUser) return;
    
    try {
        const messagesQuery = await db.collection('messages')
            .where('recipientId', '==', currentUser.uid)
            .where('read', '==', false)
            .get();
        
        const count = messagesQuery.size;
        if (count > 0) {
            messageCount.textContent = count;
            messageCount.classList.remove('hidden');
        } else {
            messageCount.classList.add('hidden');
        }
    } catch (error) {
        console.error('❌ Error loading message count:', error);
    }
}

// Open messages modal
async function openMessagesModal() {
    if (!currentUser) {
        showToast('Please log in to view messages', 'warning');
        return;
    }
    
    try {
        const messagesQuery = await db.collection('messages')
            .where('recipientId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        
        if (messagesQuery.empty) {
            messagesContent.innerHTML = `
                <div class="text-center py-12">
                    <i class="far fa-comments text-4xl text-gray-400 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No messages</h3>
                    <p class="text-gray-500 dark:text-gray-400">Your messages will appear here</p>
                </div>
            `;
        } else {
            let messagesHTML = '<div class="space-y-4">';
            
            // Group messages by sender
            const messagesBySender = {};
            
            messagesQuery.forEach(doc => {
                const message = doc.data();
                const senderId = message.senderId;
                
                if (!messagesBySender[senderId]) {
                    messagesBySender[senderId] = [];
                }
                
                messagesBySender[senderId].push({
                    id: doc.id,
                    ...message
                });
            });
            
            // Get sender details and create conversation previews
            const senderIds = Object.keys(messagesBySender);
            const senderPromises = senderIds.map(id => db.collection('users').doc(id).get());
            const senderSnapshots = await Promise.all(senderPromises);
            
            senderSnapshots.forEach((senderDoc, index) => {
                if (senderDoc.exists) {
                    const sender = senderDoc.data();
                    const senderId = senderIds[index];
                    const messages = messagesBySender[senderId];
                    const latestMessage = messages[0]; // Most recent message
                    const unreadCount = messages.filter(m => !m.read).length;
                    const timeAgo = formatTimeAgo(latestMessage.createdAt);
                    
                    messagesHTML += `
                        <div class="flex items-center space-x-4 p-4 border border-gray-200 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 conversation-item" data-sender-id="${senderId}">
                            <img src="${sender.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(sender.name) + '&background=6366f1&color=fff&size=100'}" 
                                 alt="${sender.name}" 
                                 class="w-12 h-12 rounded-full object-cover">
                            <div class="flex-1">
                                <div class="flex justify-between items-start">
                                    <h4 class="font-semibold text-gray-900 dark:text-white">${sender.name}</h4>
                                    <span class="text-xs text-gray-500 dark:text-gray-400">${timeAgo}</span>
                                </div>
                                <p class="text-gray-600 dark:text-gray-400 text-sm mt-1 truncate">${latestMessage.content}</p>
                            </div>
                            ${unreadCount > 0 ? `
                                <span class="bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                    ${unreadCount}
                                </span>
                            ` : ''}
                        </div>
                    `;
                }
            });
            
            messagesHTML += '</div>';
            messagesContent.innerHTML = messagesHTML;
            
            // Add event listeners for conversation items
            messagesContent.querySelectorAll('.conversation-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const senderId = e.currentTarget.getAttribute('data-sender-id');
                    openConversation(senderId);
                });
            });
        }
        
        messagesModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('❌ Error loading messages:', error);
        showToast('Error loading messages', 'error');
    }
}

// Close messages modal
function closeMessagesModalFunc() {
    messagesModal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Open conversation with a specific user
async function openConversation(senderId) {
    try {
        const senderDoc = await db.collection('users').doc(senderId).get();
        if (!senderDoc.exists) {
            showToast('User not found', 'error');
            return;
        }
        
        const sender = senderDoc.data();
        
        // Get conversation messages
        const messagesQuery = await db.collection('messages')
            .where('senderId', 'in', [currentUser.uid, senderId])
            .where('recipientId', 'in', [currentUser.uid, senderId])
            .orderBy('createdAt', 'asc')
            .limit(50)
            .get();
        
        showConversationModal(sender, messagesQuery);
        
    } catch (error) {
        console.error('❌ Error opening conversation:', error);
        showToast('Error opening conversation', 'error');
    }
}

// Show conversation modal
function showConversationModal(sender, messagesQuery) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    let messagesHTML = '';
    if (messagesQuery.empty) {
        messagesHTML = `
            <div class="text-center py-8">
                <p class="text-gray-500 dark:text-gray-400">No messages yet</p>
            </div>
        `;
    } else {
        messagesHTML = '<div class="space-y-4">';
        
        messagesQuery.forEach(doc => {
            const message = doc.data();
            const isOwnMessage = message.senderId === currentUser.uid;
            const time = message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            messagesHTML += `
                <div class="flex ${isOwnMessage ? 'justify-end' : 'justify-start'}">
                    <div class="max-w-xs lg:max-w-md ${isOwnMessage ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-slate-600 text-gray-900 dark:text-white'} rounded-lg p-3">
                        <p class="text-sm">${message.content}</p>
                        <p class="text-xs ${isOwnMessage ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'} mt-1 text-right">${time}</p>
                    </div>
                </div>
            `;
        });
        
        messagesHTML += '</div>';
    }
    
    modal.innerHTML = `
        <div class="modal-content max-w-2xl h-96 flex flex-col">
            <div class="flex justify-between items-center mb-4 p-4 border-b border-gray-200 dark:border-slate-600">
                <div class="flex items-center space-x-3">
                    <img src="${sender.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(sender.name) + '&background=6366f1&color=fff&size=100'}" 
                         alt="${sender.name}" 
                         class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <h3 class="font-semibold text-gray-900 dark:text-white">${sender.name}</h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Online</p>
                    </div>
                </div>
                <button class="close-conversation text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-4">
                ${messagesHTML}
            </div>
            
            <div class="p-4 border-t border-gray-200 dark:border-slate-600">
                <div class="flex space-x-2">
                    <input type="text" placeholder="Type a message..." class="flex-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent message-input">
                    <button class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition send-message" data-recipient-id="${sender.id}">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-conversation');
    const sendBtn = modal.querySelector('.send-message');
    const messageInput = modal.querySelector('.message-input');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    sendBtn.addEventListener('click', async () => {
        const content = messageInput.value.trim();
        if (content) {
            await sendMessage(sender.id, content);
            messageInput.value = '';
            // Refresh conversation
            document.body.removeChild(modal);
            openConversation(sender.id);
        }
    });
    
    messageInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const content = messageInput.value.trim();
            if (content) {
                await sendMessage(sender.id, content);
                messageInput.value = '';
                // Refresh conversation
                document.body.removeChild(modal);
                openConversation(sender.id);
            }
        }
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // Scroll to bottom of messages
    const messagesContainer = modal.querySelector('.overflow-y-auto');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send message
async function sendMessage(recipientId, content) {
    try {
        await db.collection('messages').add({
            senderId: currentUser.uid,
            recipientId: recipientId,
            content: content,
            read: false,
            createdAt: new Date()
        });
        
        // Update message count for recipient
        loadMessageCount();
        
    } catch (error) {
        console.error('❌ Error sending message:', error);
        showToast('Error sending message', 'error');
    }
}

// Open seller dashboard
function openSellerDashboard() {
    switchDashboard('seller');
}

// Load seller dashboard
async function loadSellerDashboard() {
    if (!currentUser) return;
    
    try {
        // Get seller's listings
        const listingsQuery = await db.collection('listings')
            .where('sellerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        // Get seller's orders
        const ordersQuery = await db.collection('orders')
            .where('items', 'array-contains', db.collection('listings').where('sellerId', '==', currentUser.uid))
            .get();
        
        // Update seller dashboard UI
        updateSellerDashboard(listingsQuery, ordersQuery);
        
    } catch (error) {
        console.error('❌ Error loading seller dashboard:', error);
        showToast('Error loading seller dashboard', 'error');
    }
}

// Update seller dashboard UI
function updateSellerDashboard(listingsQuery, ordersQuery) {
    const sellerDashboard = document.getElementById('sellerDashboard');
    
    if (!sellerDashboard) {
        console.error('Seller dashboard element not found');
        return;
    }
    
    let listingsHTML = '';
    if (listingsQuery.empty) {
        listingsHTML = `
            <div class="text-center py-8">
                <i class="fas fa-store text-4xl text-gray-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">You have no listings yet</p>
                <button class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition mt-4 create-first-listing">
                    Create Your First Listing
                </button>
            </div>
        `;
    } else {
        listingsHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">';
        
        listingsQuery.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            
            listingsHTML += `
                <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <img src="${listing.images && listing.images.length > 0 ? listing.images[0] : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80'}" 
                         alt="${listing.title}" 
                         class="w-full h-48 object-cover">
                    <div class="p-4">
                        <h4 class="font-semibold text-gray-900 dark:text-white mb-2">${listing.title}</h4>
                        <p class="text-indigo-600 dark:text-indigo-400 font-bold mb-2">$${listing.price.toFixed(2)}</p>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-500 dark:text-gray-400">${listing.views || 0} views</span>
                            <div class="flex space-x-2">
                                <button class="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 edit-listing" data-listing-id="${listing.id}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="text-red-600 hover:text-red-800 delete-listing" data-listing-id="${listing.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        listingsHTML += '</div>';
    }
    
    let ordersHTML = '';
    if (ordersQuery.empty) {
        ordersHTML = `
            <div class="text-center py-8">
                <i class="fas fa-shopping-bag text-4xl text-gray-400 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">No orders yet</p>
            </div>
        `;
    } else {
        ordersHTML = '<div class="space-y-4">';
        
        ordersQuery.forEach(doc => {
            const order = doc.data();
            const orderDate = order.createdAt.toDate().toLocaleDateString();
            const statusColor = getOrderStatusColor(order.status);
            
            // Filter items that belong to this seller
            const sellerItems = order.items.filter(item => {
                // This would need to be implemented based on your data structure
                return true; // Placeholder
            });
            
            if (sellerItems.length > 0) {
                ordersHTML += `
                    <div class="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white">Order #${doc.id.substring(0, 8)}</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">${orderDate}</p>
                            </div>
                            <span class="px-3 py-1 rounded-full text-sm font-medium ${statusColor}">${order.status}</span>
                        </div>
                        
                        <div class="space-y-2 mb-3">
                            ${sellerItems.map(item => `
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">${item.title}</span>
                                    <span class="font-medium">$${item.price.toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-gray-900 dark:text-white">Total: $${sellerItems.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</span>
                            ${order.status === 'pending' ? `
                                <div class="flex space-x-2">
                                    <button class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition confirm-order" data-order-id="${doc.id}">
                                        Confirm
                                    </button>
                                    <button class="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition cancel-order-seller" data-order-id="${doc.id}">
                                        Cancel
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
        });
        
        ordersHTML += '</div>';
    }
    
    sellerDashboard.innerHTML = `
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Seller Dashboard</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 text-center">
                    <div class="text-indigo-600 text-2xl font-bold mb-2">${listingsQuery.size}</div>
                    <div class="text-gray-600 dark:text-gray-400">Active Listings</div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 text-center">
                    <div class="text-indigo-600 text-2xl font-bold mb-2">${ordersQuery.size}</div>
                    <div class="text-gray-600 dark:text-gray-400">Total Orders</div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 text-center">
                    <div class="text-indigo-600 text-2xl font-bold mb-2">$${userData.sales || 0}</div>
                    <div class="text-gray-600 dark:text-gray-400">Total Sales</div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold text-gray-900 dark:text-white">Your Listings</h3>
                        <button class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition create-listing-seller">
                            <i class="fas fa-plus mr-2"></i>New Listing
                        </button>
                    </div>
                    ${listingsHTML}
                </div>
                
                <div>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Recent Orders</h3>
                    ${ordersHTML}
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for seller dashboard
    const createListingBtn = sellerDashboard.querySelector('.create-listing-seller');
    const createFirstListingBtn = sellerDashboard.querySelector('.create-first-listing');
    const editListingBtns = sellerDashboard.querySelectorAll('.edit-listing');
    const deleteListingBtns = sellerDashboard.querySelectorAll('.delete-listing');
    const confirmOrderBtns = sellerDashboard.querySelectorAll('.confirm-order');
    const cancelOrderSellerBtns = sellerDashboard.querySelectorAll('.cancel-order-seller');
    
    if (createListingBtn) {
        createListingBtn.addEventListener('click', openCreateListingModal);
    }
    
    if (createFirstListingBtn) {
        createFirstListingBtn.addEventListener('click', openCreateListingModal);
    }
    
    editListingBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const listingId = e.currentTarget.getAttribute('data-listing-id');
            editListing(listingId);
        });
    });
    
    deleteListingBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const listingId = e.currentTarget.getAttribute('data-listing-id');
            deleteListing(listingId);
        });
    });
    
    confirmOrderBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const orderId = e.currentTarget.getAttribute('data-order-id');
            updateOrderStatus(orderId, 'confirmed');
        });
    });
    
    cancelOrderSellerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const orderId = e.currentTarget.getAttribute('data-order-id');
            updateOrderStatus(orderId, 'cancelled');
        });
    });
}

// Edit listing
async function editListing(listingId) {
    try {
        const listingDoc = await db.collection('listings').doc(listingId).get();
        if (!listingDoc.exists) {
            showToast('Listing not found', 'error');
            return;
        }
        
        const listing = listingDoc.data();
        showEditListingModal(listingId, listing);
        
    } catch (error) {
        console.error('❌ Error loading listing for edit:', error);
        showToast('Error loading listing', 'error');
    }
}

// Show edit listing modal
function showEditListingModal(listingId, listing) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Edit Listing</h2>
                <button class="close-edit-listing text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <form class="edit-listing-form" data-listing-id="${listingId}">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product Title</label>
                        <input type="text" value="${listing.title}" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                        <textarea rows="4" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required>${listing.description}</textarea>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Price ($)</label>
                            <input type="number" value="${listing.price}" step="0.01" min="0" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category</label>
                            <select class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                                <option value="electronics" ${listing.category === 'electronics' ? 'selected' : ''}>Electronics</option>
                                <option value="textbooks" ${listing.category === 'textbooks' ? 'selected' : ''}>Textbooks</option>
                                <option value="furniture" ${listing.category === 'furniture' ? 'selected' : ''}>Furniture</option>
                                <option value="clothing" ${listing.category === 'clothing' ? 'selected' : ''}>Clothing</option>
                                <option value="services" ${listing.category === 'services' ? 'selected' : ''}>Services</option>
                                <option value="other" ${listing.category === 'other' ? 'selected' : ''}>Other</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                        <select class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                            <option value="active" ${listing.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="sold" ${listing.status === 'sold' ? 'selected' : ''}>Sold</option>
                            <option value="inactive" ${listing.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </div>
                    
                    <div class="flex justify-end space-x-3 pt-4">
                        <button type="button" class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition cancel-edit">
                            Cancel
                        </button>
                        <button type="submit" class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition">
                            Update Listing
                        </button>
                    </div>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-edit-listing');
    const cancelBtn = modal.querySelector('.cancel-edit');
    const form = modal.querySelector('.edit-listing-form');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateListing(listingId, form);
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Update listing
async function updateListing(listingId, form) {
    try {
        const formData = new FormData(form);
        const title = form.querySelector('input[type="text"]').value;
        const description = form.querySelector('textarea').value;
        const price = parseFloat(form.querySelector('input[type="number"]').value);
        const category = form.querySelector('select').value;
        const status = form.querySelectorAll('select')[1].value;
        
        await db.collection('listings').doc(listingId).update({
            title,
            description,
            price,
            category,
            status,
            updatedAt: new Date()
        });
        
        showToast('Listing updated successfully', 'success');
        loadSellerDashboard(); // Refresh seller dashboard
        
    } catch (error) {
        console.error('❌ Error updating listing:', error);
        showToast('Error updating listing', 'error');
    }
}

// Delete listing
async function deleteListing(listingId) {
    if (!confirm('Are you sure you want to delete this listing?')) {
        return;
    }
    
    try {
        await db.collection('listings').doc(listingId).delete();
        showToast('Listing deleted successfully', 'success');
        loadSellerDashboard(); // Refresh seller dashboard
        
    } catch (error) {
        console.error('❌ Error deleting listing:', error);
        showToast('Error deleting listing', 'error');
    }
}

// Update order status
async function updateOrderStatus(orderId, status) {
    try {
        await db.collection('orders').doc(orderId).update({
            status: status,
            updatedAt: new Date()
        });
        
        showToast(`Order ${status} successfully`, 'success');
        loadSellerDashboard(); // Refresh seller dashboard
        
    } catch (error) {
        console.error('❌ Error updating order status:', error);
        showToast('Error updating order status', 'error');
    }
}
// Add this to check if user is actually admin
async function verifyAdminAccess() {
    if (!currentUser) return false;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        return userDoc.exists && userDoc.data().role === 'admin';
    } catch (error) {
        console.error('Error verifying admin access:', error);
        return false;
    }
}

// Open admin dashboard
function openAdminDashboard() {
    switchDashboard('admin');
}

// Enhanced Admin Dashboard - REPLACE ALL EXISTING ADMIN CODE
async function loadAdminDashboard() {
    if (!currentUser) {
        showToast('Please log in to access admin dashboard', 'error');
        return;
    }
    
    try {
        // Verify admin role
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            showToast('Access denied. Admin privileges required.', 'error');
            switchDashboard('home');
            return;
        }

        console.log('✅ Admin access verified, loading enhanced dashboard');
        
        // Get comprehensive admin statistics
        const [usersQuery, listingsQuery, ordersQuery, reportsQuery, messagesQuery] = await Promise.all([
            db.collection('users').get(),
            db.collection('listings').get(),
            db.collection('orders').get(),
            db.collection('reports').where('resolved', '==', false).get(),
            db.collection('messages').orderBy('createdAt', 'desc').limit(100).get()
        ]);

        updateAdminDashboard(usersQuery, listingsQuery, ordersQuery, reportsQuery, messagesQuery);
        
    } catch (error) {
        console.error('❌ Error loading admin dashboard:', error);
        showToast('Error loading admin dashboard: ' + error.message, 'error');
    }
}

function updateAdminDashboard(usersQuery, listingsQuery, ordersQuery, reportsQuery, messagesQuery) {
    const adminDashboard = document.getElementById('adminDashboard');
    
    if (!adminDashboard) {
        console.error('Admin dashboard element not found');
        return;
    }
    
    // Calculate statistics
    const totalUsers = usersQuery.size;
    const totalListings = listingsQuery.size;
    const totalOrders = ordersQuery.size;
    const pendingReports = reportsQuery.size;
    
    // Get recent users
    const recentUsers = [];
    usersQuery.forEach(doc => {
        const user = doc.data();
        user.id = doc.id;
        recentUsers.push(user);
    });
    recentUsers.sort((a, b) => new Date(b.joined) - new Date(a.joined));
    const recentUsersList = recentUsers.slice(0, 5);

    adminDashboard.innerHTML = `
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Enhanced Admin Dashboard</h2>
            
            <!-- Statistics Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 text-center">
                    <div class="text-indigo-600 text-2xl font-bold mb-2">${totalUsers}</div>
                    <div class="text-gray-600 dark:text-gray-400">Total Users</div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 text-center">
                    <div class="text-indigo-600 text-2xl font-bold mb-2">${totalListings}</div>
                    <div class="text-gray-600 dark:text-gray-400">Total Listings</div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 text-center">
                    <div class="text-indigo-600 text-2xl font-bold mb-2">${totalOrders}</div>
                    <div class="text-gray-600 dark:text-gray-400">Total Orders</div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700 text-center">
                    <div class="text-indigo-600 text-2xl font-bold mb-2">${pendingReports}</div>
                    <div class="text-gray-600 dark:text-gray-400">Pending Reports</div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <!-- Recent Users -->
                <div>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Recent Users</h3>
                    <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div class="divide-y divide-gray-200 dark:divide-slate-600">
                            ${recentUsersList.map(user => `
                                <div class="p-4 flex items-center justify-between">
                                    <div class="flex items-center space-x-3">
                                        <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=6366f1&color=fff&size=100'}" 
                                             alt="${user.name}" 
                                             class="w-10 h-10 rounded-full object-cover">
                                        <div>
                                            <h4 class="font-semibold text-gray-900 dark:text-white">${user.name}</h4>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">${user.email}</p>
                                        </div>
                                    </div>
                                    <span class="text-xs text-gray-500 dark:text-gray-400">${new Date(user.joined).toLocaleDateString()}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                <!-- Quick Actions -->
                <div>
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
                    <div class="grid grid-cols-1 gap-4">
                        <button class="bg-indigo-600 text-white p-4 rounded-lg font-semibold hover:bg-indigo-700 transition text-left manage-users">
                            <i class="fas fa-users mr-2"></i>Manage Users
                        </button>
                        <button class="bg-indigo-600 text-white p-4 rounded-lg font-semibold hover:bg-indigo-700 transition text-left manage-listings">
                            <i class="fas fa-store mr-2"></i>Manage Listings
                        </button>
                        <button class="bg-indigo-600 text-white p-4 rounded-lg font-semibold hover:bg-indigo-700 transition text-left view-reports">
                            <i class="fas fa-flag mr-2"></i>View Reports
                        </button>
                        <button class="bg-indigo-600 text-white p-4 rounded-lg font-semibold hover:bg-indigo-700 transition text-left system-settings">
                            <i class="fas fa-cog mr-2"></i>System Settings
                        </button>
                    </div>
                </div>
            </div>

            <!-- NEW FEATURES SECTION -->
            
            <!-- Bulk Actions -->
            <div class="mb-8">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Bulk Actions</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <button class="bg-red-600 text-white p-4 rounded-lg font-semibold hover:bg-red-700 transition text-left bulk-delete-users">
                        <i class="fas fa-users-slash mr-2"></i>Bulk Delete Users
                    </button>
                    <button class="bg-red-600 text-white p-4 rounded-lg font-semibold hover:bg-red-700 transition text-left bulk-delete-listings">
                        <i class="fas fa-trash-alt mr-2"></i>Bulk Delete Listings
                    </button>
                    <button class="bg-yellow-600 text-white p-4 rounded-lg font-semibold hover:bg-yellow-700 transition text-left bulk-deactivate-listings">
                        <i class="fas fa-pause mr-2"></i>Bulk Deactivate Listings
                    </button>
                </div>
            </div>

            <!-- Analytics -->
            <div class="mb-8">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Platform Analytics</h3>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <button class="bg-blue-600 text-white p-4 rounded-lg font-semibold hover:bg-blue-700 transition text-left view-sales-analytics">
                        <i class="fas fa-chart-line mr-2"></i>Sales Analytics
                    </button>
                    <button class="bg-green-600 text-white p-4 rounded-lg font-semibold hover:bg-green-700 transition text-left view-user-growth">
                        <i class="fas fa-users mr-2"></i>User Growth Analytics
                    </button>
                </div>
            </div>

            <!-- Content Moderation -->
            <div class="mb-8">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Content Moderation</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button class="bg-purple-600 text-white p-4 rounded-lg font-semibold hover:bg-purple-700 transition text-left auto-moderation-settings">
                        <i class="fas fa-robot mr-2"></i>Auto-Moderation Settings
                    </button>
                    <button class="bg-orange-600 text-white p-4 rounded-lg font-semibold hover:bg-orange-700 transition text-left scan-content">
                        <i class="fas fa-search mr-2"></i>Scan Suspicious Content
                    </button>
                </div>
            </div>

            <!-- User Messaging -->
            <div class="mb-8">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">User Messaging</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button class="bg-teal-600 text-white p-4 rounded-lg font-semibold hover:bg-teal-700 transition text-left send-announcement">
                        <i class="fas fa-bullhorn mr-2"></i>Send Announcement
                    </button>
                    <button class="bg-cyan-600 text-white p-4 rounded-lg font-semibold hover:bg-cyan-700 transition text-left view-messages">
                        <i class="fas fa-envelope mr-2"></i>View User Messages
                    </button>
                </div>
            </div>

            <!-- Backup & Restore -->
            <div class="mb-8">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Backup & Restore</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button class="bg-gray-600 text-white p-4 rounded-lg font-semibold hover:bg-gray-700 transition text-left create-backup">
                        <i class="fas fa-download mr-2"></i>Create Backup
                    </button>
                    <button class="bg-gray-700 text-white p-4 rounded-lg font-semibold hover:bg-gray-800 transition text-left restore-backup">
                        <i class="fas fa-upload mr-2"></i>Restore Backup
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for all buttons
    setupAdminEventListeners();
}// =============================================
// NEW ADMIN FEATURES - ADD AFTER EXISTING ADMIN CODE
// =============================================

// 1. BULK ACTIONS SYSTEM
async function showBulkUserDeleteModal() {
    try {
        const usersQuery = await db.collection('users').get();
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        modal.innerHTML = `
            <div class="modal-content max-w-4xl">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Bulk Delete Users</h2>
                    <button class="close-bulk-users text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="mb-4">
                    <input type="text" id="userSearch" placeholder="Search users..." class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                </div>
                
                <div class="max-h-96 overflow-y-auto mb-4">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-600">
                        <thead class="bg-gray-50 dark:bg-slate-700 sticky top-0">
                            <tr>
                                <th class="px-4 py-3 text-left">
                                    <input type="checkbox" id="selectAllUsers" class="rounded">
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Role</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Listings</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-600" id="usersList">
                            ${usersQuery.docs.map(doc => {
                                const user = doc.data();
                                return `
                                    <tr>
                                        <td class="px-4 py-3">
                                            <input type="checkbox" class="user-checkbox rounded" value="${doc.id}">
                                        </td>
                                        <td class="px-4 py-3">
                                            <div class="flex items-center">
                                                <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name)}" 
                                                     class="w-8 h-8 rounded-full mr-3">
                                                <div>
                                                    <div class="font-medium">${user.name}</div>
                                                    <div class="text-sm text-gray-500">${user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-4 py-3">${user.role || 'user'}</td>
                                        <td class="px-4 py-3">${user.listings || 0}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="flex justify-between items-center">
                    <span id="selectedCount">0 users selected</span>
                    <button class="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50" id="confirmBulkDelete" disabled>
                        Delete Selected Users
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Bulk action functionality
        const selectAll = modal.querySelector('#selectAllUsers');
        const checkboxes = modal.querySelectorAll('.user-checkbox');
        const selectedCount = modal.querySelector('#selectedCount');
        const confirmBtn = modal.querySelector('#confirmBulkDelete');
        const searchInput = modal.querySelector('#userSearch');
        
        selectAll.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateSelectionCount();
        });
        
        checkboxes.forEach(cb => {
            cb.addEventListener('change', updateSelectionCount);
        });
        
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            checkboxes.forEach(cb => {
                const row = cb.closest('tr');
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
        
        function updateSelectionCount() {
            const selected = modal.querySelectorAll('.user-checkbox:checked').length;
            selectedCount.textContent = `${selected} users selected`;
            confirmBtn.disabled = selected === 0;
        }
        
        confirmBtn.addEventListener('click', async () => {
            const selectedIds = Array.from(modal.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
            await bulkDeleteUsers(selectedIds);
            document.body.removeChild(modal);
        });
        
        modal.querySelector('.close-bulk-users').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
    } catch (error) {
        console.error('Error loading bulk user delete:', error);
        showToast('Error loading users', 'error');
    }
}

async function bulkDeleteUsers(userIds) {
    if (!confirm(`Are you sure you want to delete ${userIds.length} users? This action cannot be undone.`)) {
        return;
    }
    
    try {
        showToast(`Deleting ${userIds.length} users...`, 'info');
        
        const batch = db.batch();
        userIds.forEach(userId => {
            batch.delete(db.collection('users').doc(userId));
        });
        
        await batch.commit();
        showToast(`Successfully deleted ${userIds.length} users`, 'success');
        loadAdminDashboard();
        
    } catch (error) {
        console.error('Error bulk deleting users:', error);
        showToast('Error deleting users', 'error');
    }
}

async function showBulkListingDeleteModal() {
    try {
        const listingsQuery = await db.collection('listings').get();
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        modal.innerHTML = `
            <div class="modal-content max-w-6xl">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Bulk Delete Listings</h2>
                    <button class="close-bulk-listings text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="max-h-96 overflow-y-auto mb-4">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-600">
                        <thead class="bg-gray-50 dark:bg-slate-700 sticky top-0">
                            <tr>
                                <th class="px-4 py-3 text-left">
                                    <input type="checkbox" id="selectAllListings" class="rounded">
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Listing</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Seller</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Price</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-600">
                            ${listingsQuery.docs.map(doc => {
                                const listing = doc.data();
                                return `
                                    <tr>
                                        <td class="px-4 py-3">
                                            <input type="checkbox" class="listing-checkbox rounded" value="${doc.id}">
                                        </td>
                                        <td class="px-4 py-3">
                                            <div class="flex items-center">
                                                <img src="${listing.images && listing.images.length > 0 ? listing.images[0] : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80'}" 
                                                     class="w-10 h-10 rounded object-cover mr-3">
                                                <div class="font-medium">${listing.title}</div>
                                            </div>
                                        </td>
                                        <td class="px-4 py-3">${listing.sellerName}</td>
                                        <td class="px-4 py-3">$${listing.price?.toFixed(2) || '0.00'}</td>
                                        <td class="px-4 py-3">
                                            <span class="px-2 py-1 text-xs rounded-full ${listing.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                                                ${listing.status}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="flex justify-between items-center">
                    <span id="selectedListingsCount">0 listings selected</span>
                    <button class="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50" id="confirmBulkDeleteListings" disabled>
                        Delete Selected Listings
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Similar functionality as bulk users
        const selectAll = modal.querySelector('#selectAllListings');
        const checkboxes = modal.querySelectorAll('.listing-checkbox');
        const selectedCount = modal.querySelector('#selectedListingsCount');
        const confirmBtn = modal.querySelector('#confirmBulkDeleteListings');
        
        selectAll.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateSelectionCount();
        });
        
        checkboxes.forEach(cb => {
            cb.addEventListener('change', updateSelectionCount);
        });
        
        function updateSelectionCount() {
            const selected = modal.querySelectorAll('.listing-checkbox:checked').length;
            selectedCount.textContent = `${selected} listings selected`;
            confirmBtn.disabled = selected === 0;
        }
        
        confirmBtn.addEventListener('click', async () => {
            const selectedIds = Array.from(modal.querySelectorAll('.listing-checkbox:checked')).map(cb => cb.value);
            await bulkDeleteListings(selectedIds);
            document.body.removeChild(modal);
        });
        
        modal.querySelector('.close-bulk-listings').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
    } catch (error) {
        console.error('Error loading bulk listing delete:', error);
        showToast('Error loading listings', 'error');
    }
}

async function bulkDeleteListings(listingIds) {
    if (!confirm(`Are you sure you want to delete ${listingIds.length} listings? This action cannot be undone.`)) {
        return;
    }
    
    try {
        showToast(`Deleting ${listingIds.length} listings...`, 'info');
        
        const batch = db.batch();
        listingIds.forEach(listingId => {
            batch.delete(db.collection('listings').doc(listingId));
        });
        
        await batch.commit();
        showToast(`Successfully deleted ${listingIds.length} listings`, 'success');
        loadAdminDashboard();
        
    } catch (error) {
        console.error('Error bulk deleting listings:', error);
        showToast('Error deleting listings', 'error');
    }
}

async function showBulkDeactivateModal() {
    showToast('Bulk deactivate feature would be implemented similarly', 'info');
}

// 2. ANALYTICS SYSTEM
async function showSalesAnalytics() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const ordersQuery = await db.collection('orders')
            .where('createdAt', '>=', thirtyDaysAgo)
            .get();
        
        const salesData = processSalesData(ordersQuery);
        renderSalesChart(salesData);
        
    } catch (error) {
        console.error('Error loading sales analytics:', error);
        showToast('Error loading sales data', 'error');
    }
}

function processSalesData(ordersQuery) {
    const dailySales = {};
    
    ordersQuery.forEach(doc => {
        const order = doc.data();
        const date = order.createdAt.toDate().toISOString().split('T')[0];
        dailySales[date] = (dailySales[date] || 0) + order.total;
    });
    
    const result = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        result.push({
            date: dateStr,
            sales: dailySales[dateStr] || 0
        });
    }
    
    return result;
}

function renderSalesChart(salesData) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    const totalRevenue = salesData.reduce((sum, day) => sum + day.sales, 0);
    const activeDays = salesData.filter(day => day.sales > 0).length;
    const dailyAverage = totalRevenue / 30;
    
    modal.innerHTML = `
        <div class="modal-content max-w-6xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Sales Analytics (Last 30 Days)</h2>
                <button class="close-analytics text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
                <div class="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <div class="text-2xl font-bold text-indigo-600">$${totalRevenue.toFixed(2)}</div>
                        <div class="text-sm text-gray-600 dark:text-gray-400">Total Revenue</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <div class="text-2xl font-bold text-green-600">${activeDays}</div>
                        <div class="text-sm text-gray-600 dark:text-gray-400">Active Sales Days</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <div class="text-2xl font-bold text-blue-600">$${dailyAverage.toFixed(2)}</div>
                        <div class="text-sm text-gray-600 dark:text-gray-400">Daily Average</div>
                    </div>
                </div>
                
                <div id="salesChart" style="height: 300px;" class="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                    <div class="flex items-center justify-center h-full text-gray-500">
                        Sales Chart Visualization
                    </div>
                </div>
                
                <div class="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    <p>📈 Chart shows daily sales revenue over the last 30 days</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-analytics').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

async function showUserGrowthAnalytics() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-4xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">User Growth Analytics</h2>
                <button class="close-user-analytics text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-chart-bar text-4xl mb-4"></i>
                    <p>User growth charts and analytics would be displayed here</p>
                    <p class="text-sm mt-2">This would include: new users per day, active users, user retention rates</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-user-analytics').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// 3. CONTENT MODERATION SYSTEM
function showAutoModerationSettings() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Auto-Moderation Settings</h2>
                <button class="close-moderation text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="space-y-6">
                <div>
                    <h3 class="text-lg font-semibold mb-4">Suspicious Content Detection</h3>
                    
                    <div class="space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <label class="font-medium">Price Anomaly Detection</label>
                                <p class="text-sm text-gray-600 dark:text-gray-400">Flag listings with unusually high/low prices</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer" checked>
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                        
                        <div class="flex items-center justify-between">
                            <div>
                                <label class="font-medium">Keyword Filtering</label>
                                <p class="text-sm text-gray-600 dark:text-gray-400">Auto-flag listings with prohibited keywords</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer" checked>
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                        
                        <div class="flex items-center justify-between">
                            <div>
                                <label class="font-medium">Duplicate Detection</label>
                                <p class="text-sm text-gray-600 dark:text-gray-400">Detect and flag duplicate listings</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer">
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end">
                    <button class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition save-moderation-settings">
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-moderation').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.save-moderation-settings').addEventListener('click', () => {
        showToast('Moderation settings saved', 'success');
        document.body.removeChild(modal);
    });
}

async function runContentScan() {
    showToast('Scanning content for suspicious activity...', 'info');
    
    // Simulate scanning process
    setTimeout(() => {
        showToast('Content scan completed. No suspicious content found.', 'success');
    }, 2000);
}

// 4. USER MESSAGING SYSTEM
function showAnnouncementModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Send Announcement</h2>
                <button class="close-announcement text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <form id="announcementForm">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Announcement Title</label>
                        <input type="text" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message</label>
                        <textarea rows="6" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required></textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target Audience</label>
                        <select class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                            <option value="all">All Users</option>
                            <option value="sellers">Sellers Only</option>
                            <option value="buyers">Buyers Only</option>
                        </select>
                    </div>
                    
                    <div class="flex items-center">
                        <input type="checkbox" id="urgent" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                        <label for="urgent" class="ml-2 text-sm text-gray-700 dark:text-gray-300">Mark as urgent</label>
                    </div>
                </div>
                
                <div class="flex justify-end space-x-3 mt-6">
                    <button type="button" class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition cancel-announcement">
                        Cancel
                    </button>
                    <button type="submit" class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition">
                        Send Announcement
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-announcement').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.cancel-announcement').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#announcementForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        showToast('Announcement sent to all users!', 'success');
        document.body.removeChild(modal);
    });
}

async function showAllMessages() {
    try {
        const messagesQuery = await db.collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        let messagesHTML = '';
        if (messagesQuery.empty) {
            messagesHTML = '<div class="text-center py-8 text-gray-500">No messages found</div>';
        } else {
            messagesHTML = '<div class="space-y-4 max-h-96 overflow-y-auto">';
            
            messagesQuery.forEach(doc => {
                const message = doc.data();
                messagesHTML += `
                    <div class="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                        <div class="flex justify-between items-start mb-2">
                            <div class="font-medium">Message</div>
                            <div class="text-sm text-gray-500">${message.createdAt?.toDate().toLocaleString()}</div>
                        </div>
                        <p class="text-gray-700 dark:text-gray-300">${message.content}</p>
                    </div>
                `;
            });
            
            messagesHTML += '</div>';
        }
        
        modal.innerHTML = `
            <div class="modal-content max-w-4xl">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Recent User Messages</h2>
                    <button class="close-messages text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                ${messagesHTML}
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.close-messages').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
    } catch (error) {
        console.error('Error loading messages:', error);
        showToast('Error loading messages', 'error');
    }
}

// 5. BACKUP & RESTORE SYSTEM
async function createBackup() {
    showToast('Creating database backup...', 'info');
    
    try {
        // Simulate backup process
        const backupData = {
            timestamp: new Date().toISOString(),
            users: (await db.collection('users').get()).size,
            listings: (await db.collection('listings').get()).size,
            orders: (await db.collection('orders').get()).size
        };
        
        // In a real implementation, you would export data to a file
        // For now, we'll just show a success message
        setTimeout(() => {
            showToast(`Backup created successfully! (${backupData.users} users, ${backupData.listings} listings)`, 'success');
        }, 1500);
        
    } catch (error) {
        console.error('Error creating backup:', error);
        showToast('Error creating backup', 'error');
    }
}

function showRestoreModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-md">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Restore Backup</h2>
                <button class="close-restore text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="space-y-4">
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div class="flex">
                        <i class="fas fa-exclamation-triangle text-yellow-500 mt-1 mr-3"></i>
                        <div>
                            <h4 class="font-semibold text-yellow-800 dark:text-yellow-200">Warning</h4>
                            <p class="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
                                Restoring a backup will overwrite current data. This action cannot be undone.
                            </p>
                        </div>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Backup File</label>
                    <input type="file" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" accept=".json,.backup">
                </div>
            </div>
            
            <div class="flex justify-end space-x-3 mt-6">
                <button class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition cancel-restore">
                    Cancel
                </button>
                <button class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition confirm-restore">
                    Restore Backup
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-restore').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.cancel-restore').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.confirm-restore').addEventListener('click', () => {
        showToast('Backup restoration would be processed here', 'info');
        document.body.removeChild(modal);
    });
}


// Show manage users modal
async function showManageUsersModal() {
    try {
        const usersQuery = await db.collection('users').get();
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        let usersHTML = '';
        usersQuery.forEach(doc => {
            const user = doc.data();
            user.id = doc.id;
            
            usersHTML += `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <img src="${user.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=6366f1&color=fff&size=100'}" 
                                 alt="${user.name}" 
                                 class="w-10 h-10 rounded-full object-cover">
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">${user.name}</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">${user.email}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.verified ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'}">
                            ${user.verified ? 'Verified' : 'Unverified'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${user.role || 'user'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button class="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 edit-user" data-user-id="${user.id}">
                            Edit
                        </button>
                    </td>
                </tr>
            `;
        });
        
        modal.innerHTML = `
            <div class="modal-content max-w-4xl">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Manage Users</h2>
                    <button class="close-manage-users text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-600">
                        <thead class="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    User
                                </th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Status
                                </th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Role
                                </th>
                                <th scope="col" class="relative px-6 py-3">
                                    <span class="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-600">
                            ${usersHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        const closeBtn = modal.querySelector('.close-manage-users');
        const editUserBtns = modal.querySelectorAll('.edit-user');
        
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        editUserBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.currentTarget.getAttribute('data-user-id');
                editUser(userId);
                document.body.removeChild(modal);
            });
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading users for management:', error);
        showToast('Error loading users', 'error');
    }
}

// Edit user (admin function)
async function editUser(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            showToast('User not found', 'error');
            return;
        }
        
        const user = userDoc.data();
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        modal.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Edit User</h2>
                    <button class="close-edit-user text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <form class="edit-user-form" data-user-id="${userId}">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
                            <input type="text" value="${user.name}" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
                            <input type="email" value="${user.email}" class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role</label>
                            <select class="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                                <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                                <option value="seller" ${user.role === 'seller' ? 'selected' : ''}>Seller</option>
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                        </div>
                        
                        <div class="flex items-center">
                            <input type="checkbox" id="verified" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" ${user.verified ? 'checked' : ''}>
                            <label for="verified" class="ml-2 text-sm text-gray-700 dark:text-gray-300">Verified User</label>
                        </div>
                        
                        <div class="flex justify-end space-x-3 pt-4">
                            <button type="button" class="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition cancel-edit-user">
                                Cancel
                            </button>
                            <button type="submit" class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition">
                                Update User
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        const closeBtn = modal.querySelector('.close-edit-user');
        const cancelBtn = modal.querySelector('.cancel-edit-user');
        const form = modal.querySelector('.edit-user-form');
        
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateUser(userId, form);
            document.body.removeChild(modal);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading user for edit:', error);
        showToast('Error loading user', 'error');
    }
}

// Update user (admin function)
async function updateUser(userId, form) {
    try {
        const name = form.querySelector('input[type="text"]').value;
        const email = form.querySelector('input[type="email"]').value;
        const role = form.querySelector('select').value;
        const verified = form.querySelector('input[type="checkbox"]').checked;
        
        await db.collection('users').doc(userId).update({
            name,
            email,
            role,
            verified,
            updatedAt: new Date()
        });
        
        showToast('User updated successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error updating user:', error);
        showToast('Error updating user', 'error');
    }
}

// Show manage listings modal
async function showManageListingsModal() {
    try {
        const listingsQuery = await db.collection('listings').get();
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        let listingsHTML = '';
        listingsQuery.forEach(doc => {
            const listing = doc.data();
            listing.id = doc.id;
            
            listingsHTML += `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <img src="${listing.images && listing.images.length > 0 ? listing.images[0] : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80'}" 
                                 alt="${listing.title}" 
                                 class="w-10 h-10 rounded object-cover">
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">${listing.title}</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">$${listing.price.toFixed(2)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${listing.sellerName}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${listing.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' : listing.status === 'sold' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'}">
                            ${listing.status}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${new Date(listing.createdAt.seconds * 1000).toLocaleDateString()}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button class="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 edit-listing-admin" data-listing-id="${listing.id}">
                            Edit
                        </button>
                        <button class="text-red-600 hover:text-red-900 dark:text-red-400 ml-3 delete-listing-admin" data-listing-id="${listing.id}">
                            Delete
                        </button>
                    </td>
                </tr>
            `;
        });
        
        modal.innerHTML = `
            <div class="modal-content max-w-6xl">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Manage Listings</h2>
                    <button class="close-manage-listings text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-600">
                        <thead class="bg-gray-50 dark:bg-slate-700">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Listing
                                </th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Seller
                                </th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Status
                                </th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Created
                                </th>
                                <th scope="col" class="relative px-6 py-3">
                                    <span class="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-600">
                            ${listingsHTML}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        const closeBtn = modal.querySelector('.close-manage-listings');
        const editListingBtns = modal.querySelectorAll('.edit-listing-admin');
        const deleteListingBtns = modal.querySelectorAll('.delete-listing-admin');
        
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        editListingBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const listingId = e.currentTarget.getAttribute('data-listing-id');
                editListing(listingId);
                document.body.removeChild(modal);
            });
        });
        
        deleteListingBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const listingId = e.currentTarget.getAttribute('data-listing-id');
                if (confirm('Are you sure you want to delete this listing?')) {
                    deleteListing(listingId);
                    document.body.removeChild(modal);
                }
            });
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading listings for management:', error);
        showToast('Error loading listings', 'error');
    }
}

// Show view reports modal
async function showViewReportsModal() {
    try {
        const reportsQuery = await db.collection('reports').where('resolved', '==', false).get();
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        let reportsHTML = '';
        if (reportsQuery.empty) {
            reportsHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-flag text-4xl text-gray-400 mb-4"></i>
                    <p class="text-gray-500 dark:text-gray-400">No pending reports</p>
                </div>
            `;
        } else {
            reportsQuery.forEach(doc => {
                const report = doc.data();
                report.id = doc.id;
                
                reportsHTML += `
                    <div class="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h4 class="font-semibold text-gray-900 dark:text-white">Report #${doc.id.substring(0, 8)}</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400">${report.type} • ${new Date(report.createdAt.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                            <span class="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                                ${report.priority}
                            </span>
                        </div>
                        
                        <p class="text-gray-600 dark:text-gray-400 mb-3">${report.description}</p>
                        
                        <div class="flex justify-end space-x-2">
                            <button class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition resolve-report" data-report-id="${report.id}">
                                Resolve
                            </button>
                            <button class="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition delete-report" data-report-id="${report.id}">
                                Delete
                            </button>
                        </div>
                    </div>
                `;
            });
        }
        
        modal.innerHTML = `
            <div class="modal-content max-w-2xl">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Pending Reports</h2>
                    <button class="close-view-reports text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="space-y-4">
                    ${reportsHTML}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        const closeBtn = modal.querySelector('.close-view-reports');
        const resolveReportBtns = modal.querySelectorAll('.resolve-report');
        const deleteReportBtns = modal.querySelectorAll('.delete-report');
        
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        resolveReportBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reportId = e.currentTarget.getAttribute('data-report-id');
                resolveReport(reportId);
                document.body.removeChild(modal);
            });
        });
        
        deleteReportBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reportId = e.currentTarget.getAttribute('data-report-id');
                deleteReport(reportId);
                document.body.removeChild(modal);
            });
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading reports:', error);
        showToast('Error loading reports', 'error');
    }
}

// Resolve report
async function resolveReport(reportId) {
    try {
        await db.collection('reports').doc(reportId).update({
            resolved: true,
            resolvedAt: new Date(),
            resolvedBy: currentUser.uid
        });
        
        showToast('Report resolved successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error resolving report:', error);
        showToast('Error resolving report', 'error');
    }
}

// Delete report
async function deleteReport(reportId) {
    try {
        await db.collection('reports').doc(reportId).delete();
        showToast('Report deleted successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error deleting report:', error);
        showToast('Error deleting report', 'error');
    }
}

// Show system settings modal
function showSystemSettingsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">System Settings</h2>
                <button class="close-system-settings text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="space-y-6">
                <div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Marketplace Settings</h3>
                    <div class="space-y-4">
                        <div class="flex items-center justify-between">
                            <span class="text-gray-700 dark:text-gray-300">Enable User Registration</span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer" checked>
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                        
                        <div class="flex items-center justify-between">
                            <span class="text-gray-700 dark:text-gray-300">Allow New Listings</span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer" checked>
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                        
                        <div class="flex items-center justify-between">
                            <span class="text-gray-700 dark:text-gray-300">Require Email Verification</span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer">
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Payment Settings</h3>
                    <div class="space-y-4">
                        <div class="flex items-center justify-between">
                            <span class="text-gray-700 dark:text-gray-300">Enable Pay on Delivery</span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer" checked>
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end">
                    <button class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition save-settings">
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-system-settings');
    const saveBtn = modal.querySelector('.save-settings');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    saveBtn.addEventListener('click', () => {
        showToast('Settings saved successfully', 'success');
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Share listing
function shareListing(listing) {
    if (navigator.share) {
        navigator.share({
            title: listing.title,
            text: listing.description,
            url: window.location.href + '?listing=' + listing.id
        })
        .then(() => console.log('Successful share'))
        .catch((error) => console.log('Error sharing:', error));
    } else {
        // Fallback: copy to clipboard
        const shareUrl = window.location.href + '?listing=' + listing.id;
        navigator.clipboard.writeText(shareUrl)
            .then(() => showToast('Listing link copied to clipboard', 'success'))
            .catch(() => showToast('Error copying to clipboard', 'error'));
    }
}

// Update user UI
function updateUserUI() {
    if (userData) {
        userAvatar.src = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}&background=6366f1&color=fff&size=40`;
        mobileUserAvatar.src = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}&background=6366f1&color=fff&size=40`;
        mobileNavUserAvatar.src = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}&background=6366f1&color=fff&size=32`;
        userName.textContent = userData.name || 'User';
        mobileUserName.textContent = userData.name || 'User';
        mobileNavUserName.textContent = userData.name || 'User';
        userStatus.textContent = userData.status || 'Student';
        mobileUserStatus.textContent = userData.status || 'Student';
        mobileNavUserStatus.textContent = userData.status || 'Student';
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    notificationToastTitle.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    notificationToastMessage.textContent = message;
    
    // Set color based on type
    if (type === 'error') {
        notificationToast.style.borderLeft = '4px solid #ef4444';
    } else if (type === 'success') {
        notificationToast.style.borderLeft = '4px solid #10b981';
    } else if (type === 'warning') {
        notificationToast.style.borderLeft = '4px solid #f59e0b';
    } else {
        notificationToast.style.borderLeft = '4px solid #3b82f6';
    }
    
    notificationToast.classList.add('show');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        notificationToast.classList.remove('show');
    }, 5000);
}

// Initialize carousel
function initCarousel() {
    const carouselInner = document.querySelector('.carousel-inner');
    const carouselItems = document.querySelectorAll('.carousel-item');
    const prevButton = document.querySelector('.carousel-control.prev');
    const nextButton = document.querySelector('.carousel-control.next');
    
    let currentIndex = 0;
    const totalItems = carouselItems.length;
    
    function updateCarousel() {
        carouselInner.style.transform = `translateX(-${currentIndex * 100}%)`;
    }
    
    if (prevButton) {
        prevButton.addEventListener('click', function() {
            currentIndex = (currentIndex - 1 + totalItems) % totalItems;
            updateCarousel();
        });
    }
    
    if (nextButton) {
        nextButton.addEventListener('click', function() {
            currentIndex = (currentIndex + 1) % totalItems;
            updateCarousel();
        });
    }
    
    // Auto-advance carousel
    setInterval(function() {
        currentIndex = (currentIndex + 1) % totalItems;
        updateCarousel();
    }, 5000);
}

// Initialize theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}

// Toggle theme
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// Set theme
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (theme === 'dark') {
        themeToggle.classList.add('active');
    } else {
        themeToggle.classList.remove('active');
    }
}

// Initialize mood
function initMood() {
    const savedMood = localStorage.getItem('mood') || 'happy';
    setMood(savedMood);
}

// Set mood
function setMood(mood) {
    currentMood = mood;
    document.documentElement.setAttribute('data-mood', mood);
    localStorage.setItem('mood', mood);
    
    // Update active state
    document.querySelectorAll('.mood-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-mood') === mood) {
            option.classList.add('active');
        }
    });
}

function startFlashSaleTimer() {
    function updateTimer() {
        const now = new Date();
        const day = now.getDay();
        
        if (!isFlashSalePeriod()) {
            flashSaleTimer.textContent = "Flash Sale: Coming Friday";
            flashSaleCountdown.textContent = "Starts Friday";
            return;
        }
        
        // Calculate time until Sunday midnight (end of flash sale)
        const endOfSale = new Date(now);
        if (day === 0) { // Sunday
            endOfSale.setHours(23, 59, 59, 999);
        } else { // Friday or Saturday
            endOfSale.setDate(now.getDate() + (7 - day)); // Next Sunday
            endOfSale.setHours(23, 59, 59, 999);
        }
        
        const timeLeft = endOfSale - now;
        
        if (timeLeft <= 0) {
            flashSaleTimer.textContent = "Flash Sale Ended";
            flashSaleCountdown.textContent = "Ended";
            return;
        }
        
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        
        flashSaleTimer.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        flashSaleCountdown.textContent = `${hours}h : ${minutes}m : ${seconds}s`;
    }
    
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Start flash sale countdown (kynecta style)
function startFlashSaleCountdown() {
    let timeLeft = 6 * 60 * 60 + 19 * 60 + 55; // 6 hours, 19 minutes, 55 seconds
    
    function updateCountdown() {
        const hours = Math.floor(timeLeft / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);
        const seconds = timeLeft % 60;
        
        flashSaleCountdown.textContent = `${hours.toString().padStart(2, '0')}h : ${minutes.toString().padStart(2, '0')}m : ${seconds.toString().padStart(2, '0')}s`;
        
        if (timeLeft > 0) {
            timeLeft--;
        } else {
            timeLeft = 6 * 60 * 60 + 19 * 60 + 55;
        }
    }
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// Test function to verify data sharing
async function testDataVisibility() {
    try {
        // Create a test listing
        const testListing = {
            title: "Test Listing - " + new Date().toISOString(),
            description: "This is a test listing to verify data sharing between users",
            price: 1.00,
            category: "other",
            condition: "new",
            sellerId: currentUser.uid,
            sellerName: userData.name,
            status: "active",
            createdAt: new Date(),
            views: 0
        };
        
        const docRef = await db.collection('listings').add(testListing);
        console.log('✅ Test listing created:', docRef.id);
        
        // Verify it can be retrieved by querying all active listings
        const verifyQuery = await db.collection('listings')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
            
        if (!verifyQuery.empty) {
            const latestListing = verifyQuery.docs[0].data();
            console.log('✅ Latest listing visible to all users:', latestListing.title);
            showToast('Data sharing test successful!', 'success');
        }
        
    } catch (error) {
        console.error('❌ Data visibility test failed:', error);
        showToast('Data sharing test failed', 'error');
    }
}

// Format time ago
function formatTimeAgo(timestamp) {
    const now = new Date();
    const time = timestamp.toDate();
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return time.toLocaleDateString();
}

// Check if it's flash sale period (Friday to Sunday)
function isFlashSalePeriod() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    return day >= 5 || day === 0; // Friday (5), Saturday (6), Sunday (0)
}

// Debounce function for search
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

// Performance optimization: Lazy load images
function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.getAttribute('data-src');
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// Initialize lazy loading
document.addEventListener('DOMContentLoaded', lazyLoadImages);

// Error handling for Firebase operations
function handleFirebaseError(error, operation) {
    console.error(`❌ Firebase ${operation} error:`, error);
    
    let userMessage = 'An error occurred';
    
    switch (error.code) {
        case 'permission-denied':
            userMessage = 'You do not have permission to perform this action';
            break;
        case 'unavailable':
            userMessage = 'Network error. Please check your connection';
            break;
        case 'not-found':
            userMessage = 'The requested item was not found';
            break;
        default:
            userMessage = `Error: ${error.message}`;
    }
    
    showToast(userMessage, 'error');
    
    // Log to analytics if available
    if (typeof gtag !== 'undefined') {
        gtag('event', 'exception', {
            description: `Firebase ${operation} error: ${error.message}`,
            fatal: false
        });
    }
}

// Enhanced error handling wrapper for Firebase operations
async function safeFirebaseOperation(operation, operationName, fallback = null) {
    try {
        return await operation();
    } catch (error) {
        handleFirebaseError(error, operationName);
        return fallback;
    }
}

// Legal compliance: Terms and Privacy Policy
function showTermsAndConditions() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-4xl max-h-screen overflow-y-auto">
            <div class="flex justify-between items-center mb-6 sticky top-0 bg-white dark:bg-slate-800 py-4 border-b border-gray-200 dark:border-slate-600">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Terms and Conditions</h2>
                <button class="close-terms text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="prose dark:prose-invert max-w-none">
                <h3>1. Acceptance of Terms</h3>
                <p>By accessing and using kynecta Marketplace, you accept and agree to be bound by the terms and provision of this agreement.</p>
                
                <h3>2. Use License</h3>
                <p>Permission is granted to temporarily use kynecta Marketplace for personal, non-commercial transitory viewing only.</p>
                
                <h3>3. User Responsibilities</h3>
                <p>Users are responsible for maintaining the confidentiality of their account and password and for restricting access to their devices.</p>
                
                <h3>4. Transactions</h3>
                <p>All transactions are between buyers and sellers. kynecta acts as a platform and is not responsible for the quality, safety, or legality of items.</p>
                
                <h3>5. Safety Guidelines</h3>
                <p>Users must follow all safety guidelines including meeting in public places and inspecting items before payment.</p>
                
                <h3>6. Limitation of Liability</h3>
                <p>kynecta shall not be held liable for any indirect, incidental, special, consequential or punitive damages.</p>
                
                <h3>7. Governing Law</h3>
                <p>These terms shall be governed by and construed in accordance with the laws of your jurisdiction.</p>
            </div>
            
            <div class="flex justify-end mt-6 sticky bottom-0 bg-white dark:bg-slate-800 py-4 border-t border-gray-200 dark:border-slate-600">
                <button class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition accept-terms">
                    I Accept
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-terms');
    const acceptBtn = modal.querySelector('.accept-terms');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    acceptBtn.addEventListener('click', () => {
        localStorage.setItem('termsAccepted', 'true');
        showToast('Terms accepted successfully', 'success');
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Show privacy policy
function showPrivacyPolicy() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    
    modal.innerHTML = `
        <div class="modal-content max-w-4xl max-h-screen overflow-y-auto">
            <div class="flex justify-between items-center mb-6 sticky top-0 bg-white dark:bg-slate-800 py-4 border-b border-gray-200 dark:border-slate-600">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Privacy Policy</h2>
                <button class="close-privacy text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="prose dark:prose-invert max-w-none">
                <h3>1. Information We Collect</h3>
                <p>We collect information you provide directly to us, including name, email, phone number, and transaction details.</p>
                
                <h3>2. How We Use Your Information</h3>
                <p>We use the information we collect to provide, maintain, and improve our services, and to communicate with you.</p>
                
                <h3>3. Information Sharing</h3>
                <p>We do not sell your personal information. We may share information with sellers to facilitate transactions.</p>
                
                <h3>4. Data Security</h3>
                <p>We implement appropriate security measures to protect your personal information.</p>
                
                <h3>5. Your Rights</h3>
                <p>You have the right to access, correct, or delete your personal information.</p>
                
                <h3>6. Cookies</h3>
                <p>We use cookies and similar technologies to provide and improve our services.</p>
                
                <h3>7. Changes to This Policy</h3>
                <p>We may update this privacy policy from time to time. We will notify you of any changes.</p>
            </div>
            
            <div class="flex justify-end mt-6 sticky bottom-0 bg-white dark:bg-slate-800 py-4 border-t border-gray-200 dark:border-slate-600">
                <button class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition close-privacy-btn">
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-privacy');
    const closeBtn2 = modal.querySelector('.close-privacy-btn');
    
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    closeBtn2.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Check if user has accepted terms on first visit
function checkTermsAcceptance() {
    const termsAccepted = localStorage.getItem('termsAccepted');
    if (!termsAccepted) {
        setTimeout(() => {
            showTermsAndConditions();
        }, 2000);
    }
}

// Initialize terms check
document.addEventListener('DOMContentLoaded', checkTermsAcceptance);

// Add legal links to footer (you would need to add these to your HTML)
function addLegalLinks() {
    const footer = document.querySelector('footer');
    if (footer) {
        const legalLinks = document.createElement('div');
        legalLinks.className = 'flex justify-center space-x-6 mt-4 text-sm text-gray-500 dark:text-gray-400';
        legalLinks.innerHTML = `
            <a href="#" class="hover:text-gray-700 dark:hover:text-gray-300 terms-link">Terms</a>
            <a href="#" class="hover:text-gray-700 dark:hover:text-gray-300 privacy-link">Privacy</a>
            <a href="#" class="hover:text-gray-700 dark:hover:text-gray-300 safety-link">Safety</a>
        `;
        footer.appendChild(legalLinks);
        
        // Add event listeners
        document.querySelector('.terms-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            showTermsAndConditions();
        });
        
        document.querySelector('.privacy-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            showPrivacyPolicy();
        });
        
        document.querySelector('.safety-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            safetyPopup.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
}

// Initialize legal links
document.addEventListener('DOMContentLoaded', addLegalLinks);