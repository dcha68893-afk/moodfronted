
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

// DOM Elements
const homeDashboard = document.getElementById('homeDashboard');
const discoverDashboard = document.getElementById('discoverDashboard');
const categoriesDashboard = document.getElementById('categoriesDashboard');
const sellersDashboard = document.getElementById('sellersDashboard');
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
async function handleAuthStateChange(user) {
    if (user) {
        currentUser = user;
        console.log('✅ User authenticated:', user.uid);
        await loadUserData(user.uid);
        await loadMarketplaceData();
        updateUserUI();
        loadCartCount();
        loadNotificationCount();
    } else {
        console.log('❌ No user signed in');
        window.location.href = 'index.html';
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
                phone: ''
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

// Load listings from Firestore (remove demo data)
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
            categoryItem.className = 'jumia-category-item';
            categoryItem.setAttribute('data-category', cat.category);
            
            categoryItem.innerHTML = `
                <div class="jumia-category-icon">
                    <i class="${cat.icon} text-indigo-600"></i>
                </div>
                <span class="jumia-category-name">${cat.name}</span>
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

// Create product card HTML (Jumia style)
function createJumiaProductCard(listing) {
    const imageUrl = listing.images && listing.images.length > 0 
        ? listing.images[0] 
        : 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80';
    
    // Calculate discount if original price exists
    const originalPrice = listing.originalPrice || listing.price * 1.5;
    const discount = Math.round(((originalPrice - listing.price) / originalPrice) * 100);
    
    const card = document.createElement('div');
    card.className = 'jumia-product-card fade-in';
    card.setAttribute('data-listing-id', listing.id);
    
    card.innerHTML = `
        ${listing.isFlashSale ? '<div class="jumia-express-badge">FLASH SALE</div>' : ''}
        <div class="pay-on-delivery-badge">PAY ON DELIVERY</div>
        <img src="${imageUrl}" alt="${listing.title}" class="jumia-product-image">
        <h3 class="jumia-product-name">${listing.title}</h3>
        <div class="jumia-product-price">$${listing.price.toFixed(2)}</div>
        <div class="flex justify-between items-center">
            <div class="jumia-product-original-price">$${originalPrice.toFixed(2)}</div>
            <div class="jumia-product-discount">-${discount}%</div>
        </div>
        <div class="flex items-center justify-between mt-2">
            <div class="jumia-rating">
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
        ${listing.isExpress ? '<div class="jumia-express-badge mt-2">EXPRESS</div>' : ''}
        ${listing.sellerVerified ? '<div class="verified-seller-badge mt-1"><i class="fas fa-shield-alt mr-1"></i>Verified Seller</div>' : ''}
    `;
    
    // Add click event to view listing
    card.addEventListener('click', () => {
        viewListing(listing.id);
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
        
        if (favoriteBtn) favoriteBtn.addEventListener('click', () => toggleFavorite(listing.id));
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
    
    document.querySelectorAll('.category-card, .jumia-category-item').forEach(item => {
        const categoryName = item.querySelector('.category-name, .jumia-category-name').textContent.toLowerCase();
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

// Toggle favorite
async function toggleFavorite(listingId) {
    if (!currentUser) {
        showToast('Please log in to add favorites', 'warning');
        return;
    }
    
    try {
        const favoriteRef = db.collection('favorites')
            .where('userId', '==', currentUser.uid)
            .where('listingId', '==', listingId);
        
        const snapshot = await favoriteRef.get();
        
        if (snapshot.empty) {
            await db.collection('favorites').add({
                userId: currentUser.uid,
                listingId: listingId,
                addedAt: new Date()
            });
            showToast('Added to favorites', 'success');
        } else {
            const doc = snapshot.docs[0];
            await db.collection('favorites').doc(doc.id).delete();
            showToast('Removed from favorites', 'info');
        }
    } catch (error) {
        console.error('❌ Error toggling favorite:', error);
        showToast('Error updating favorites', 'error');
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
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.close-listing-details');
    const contactBtn = modal.querySelector('.contact-seller-details');
    const addToCartBtn = modal.querySelector('.add-to-cart-details');
    
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
                    <button class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
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

// Start flash sale countdown (Jumia style)
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