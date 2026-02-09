// =============================================
// ENHANCED MARKETPLACE UI COMPONENTS
// =============================================

import {
    // Core state and functions
    currentUser, userData, myListings, allListings, savedItems, privateNotes,
    userGroups, userFriends, currentMoodFilter, offlineDrafts, trustStats,
    userSubscription, teamMembers, leaderboardData, analyticsData, streakData,
    premiumFeatures, paymentMethods,
    
    // Constants
    LISTING_TYPES, AVAILABILITY, MOOD_CONTEXTS, TRUST_CIRCLES, DURATION_OPTIONS,
    TRUST_INDICATORS, SUBSCRIPTION_PLANS, SERVICE_CATEGORIES, PREMIUM_CATEGORIES,
    DIGITAL_TYPES, PREMIUM_DIGITAL_TYPES, TEMPLATE_TYPES, LOCAL_STORAGE_KEYS,
    PARENT_MESSAGE_TYPES, SESSION_SCHEMA,
    
    // Core functions
    initializeMarketplaceCore,
    isListingExpired,
    isListingVisibleToUser,
    filterListingsByMood,
    getTrustIndicator,
    trackListingView,
    formatTimeAgo,
    showNotification,
    saveToLocalStorage,
    escapeHtml,
    isUserPremium,
    formatTimeRemaining,
    formatFileSize,
    createServiceListing,
    createDigitalListing,
    createPremiumServiceListing,
    createPremiumDigitalListing,
    updateAvailableListingsCount,
    syncOfflineMarketplaceData,
    saveAllMarketplaceData,
    exportAnalyticsData,
    processBulkUpload,
    backupMarketplaceData,
    restoreMarketplaceData,
    downloadDigitalFile,
    openChat,
    updateTeamMemberRole,
    startFreeTrial,
    restorePurchase,
    sendTip,
    processSubscriptionPayment
} from './Tool-core.js';



// DOM Elements
const marketplaceDetailPanel = document.getElementById('marketplaceDetailPanel');
const createListingModal = document.getElementById('createListingModal');
const savedItemsModal = document.getElementById('savedItemsModal');
const myNotesModal = document.getElementById('myNotesModal');
const trustStatsModal = document.getElementById('trustStatsModal');
const analyticsModal = document.getElementById('analyticsModal');
const premiumOptionsModal = document.getElementById('premiumOptionsModal');
const teamManagementModal = document.getElementById('teamManagementModal');
const leaderboardModal = document.getElementById('leaderboardModal');
const reactionPickerModal = document.getElementById('reactionPickerModal');
const notification = document.getElementById('notification');

// Marketplace sections
const marketplaceListContent = document.getElementById('marketplaceListContent');
const myListingsAvatar = document.getElementById('myListingsAvatar');
const myListingsName = document.getElementById('myListingsName');
const myListingsText = document.getElementById('myListingsText');
const spotlightSection = document.getElementById('spotlightSection');
const spotlightListings = document.getElementById('spotlightListings');
const premiumStatusBadge = document.getElementById('premiumStatusBadge');
const listingStreak = document.getElementById('listingStreak');

// UI State Variables
let currentListingId = null;
let currentListingData = null;
let selectedDigitalFile = null;
let selectedVideoIntro = null;
let selectedAvailability = AVAILABILITY.FREE;
let selectedTrustCircle = TRUST_CIRCLES.FRIENDS;
let selectedTemplate = TEMPLATE_TYPES.BASIC;
let selectedMoodContext = MOOD_CONTEXTS.BROWSE;
let selectedDuration = '7d';
let selectedSchedule = 'daily';
let selectedPlan = null;

// Initialize the application UI
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Tool-ui.js] Marketplace UI initialization started');
    
    try {
        // Initialize core first
        await initializeMarketplaceCore();
        
        // Setup event listeners
        setupEnhancedEventListeners();
        
        // Bind UI with session data if available
        bindUIWithSession();
        
        // Initialize UI components
        initializeUIComponents();
        
        console.log('[Tool-ui.js] Marketplace UI initialization complete');
        
    } catch (error) {
        console.error('[Tool-ui.js] UI initialization failed:', error);
        handleInitializationFailure(error);
    }
});

/**
 * Handle initialization failure
 */
function handleInitializationFailure(error) {
    console.error('[Tool-ui.js] UI initialization error:', error);
    if (notification) {
        notification.textContent = 'Failed to initialize marketplace. Please refresh.';
        notification.className = 'notification error show';
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    }
}

/**
 * Bind UI with session data
 */
function bindUIWithSession() {
    console.log('[Tool-ui.js] Binding UI with session data');
    
    // Update user interface
    updateUserInterface();
    
    // Load service categories and other UI elements
    loadServiceCategories();
    loadGroupsForSelection();
    loadFriendsForSelection();
    
    // Update premium status
    updatePremiumStatusUI();
    
    // Update streak indicator
    updateStreakIndicator();
    
    // Update my listings preview
    updateMyListingsPreview();
    
    console.log('[Tool-ui.js] UI binding complete');
}

/**
 * Reset UI for logout state
 */
function resetUIForLogout() {
    // Update my listings section
    if (myListingsAvatar) {
        myListingsAvatar.style.backgroundImage = '';
        myListingsAvatar.innerHTML = '<span style="color: white; font-size: 20px;">ME</span>';
    }
    
    if (myListingsName) {
        myListingsName.textContent = 'My Marketplace';
    }
    
    if (myListingsText) {
        myListingsText.textContent = 'Tap to create your first listing';
    }
    
    // Hide premium features
    updatePremiumStatusUI();
    
    // Hide streak indicator
    if (listingStreak) {
        listingStreak.style.display = 'none';
    }
    
    console.log('[Tool-ui.js] UI reset for logout');
}

/**
 * Update user interface with current user data
 */
function updateUserInterface() {
    console.log('[Tool-ui.js] Updating UI with user data:', {
        hasUser: !!currentUser,
        name: currentUser?.displayName
    });
    
    // Update my listings section
    if (myListingsAvatar) {
        if (userData?.photoURL) {
            myListingsAvatar.style.backgroundImage = `url('${escapeHtml(userData.photoURL)}')`;
            myListingsAvatar.innerHTML = '';
        } else {
            const initials = userData?.displayName ? 
                userData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
                'ME';
            myListingsAvatar.innerHTML = `<span style="color: white; font-size: 20px;">${initials}</span>`;
        }
    }
    
    if (myListingsName) {
        myListingsName.textContent = userData?.displayName || 'My Marketplace';
    }
    
    // Update any other user-specific UI elements
    updatePremiumStatusUI();
    updateStreakIndicator();
    updateMyListingsPreview();
    
    // If we have a user, show personalized greeting
    if (currentUser && currentUser.displayName) {
        console.log(`[Tool-ui.js] Welcome, ${currentUser.displayName}!`);
    }
}

/**
 * Update premium status UI
 */
function updatePremiumStatusUI() {
    if (userSubscription && userSubscription.status === 'active') {
        if (premiumStatusBadge) premiumStatusBadge.style.display = 'inline-flex';
        const premiumOptionsBtn = document.getElementById('premiumOptionsBtn');
        if (premiumOptionsBtn) premiumOptionsBtn.innerHTML = '<i class="fas fa-crown"></i> Premium';
        
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'block';
        });
        
        const publishPremiumBtn = document.getElementById('publishPremiumBtn');
        if (publishPremiumBtn) publishPremiumBtn.style.display = 'flex';
        
        const uploadInfo = document.querySelector('#digitalUploadArea p:nth-child(4)');
        if (uploadInfo) uploadInfo.textContent = 'Max: 500MB';
        
        const arPreview = document.getElementById('arPreviewFeature');
        if (arPreview) arPreview.style.display = 'block';
        
        if (userSubscription.plan === 'business' || userSubscription.plan === 'team') {
            const teamNotes = document.getElementById('teamNotesFeature');
            if (teamNotes) teamNotes.style.display = 'block';
        }
        
        const analyticsAlerts = document.getElementById('analyticsAlertsFeature');
        if (analyticsAlerts) analyticsAlerts.style.display = 'block';
        
    } else {
        if (premiumStatusBadge) premiumStatusBadge.style.display = 'none';
        const premiumOptionsBtn = document.getElementById('premiumOptionsBtn');
        if (premiumOptionsBtn) premiumOptionsBtn.innerHTML = '<i class="fas fa-crown"></i> Premium';
        
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'none';
        });
        
        const publishPremiumBtn = document.getElementById('publishPremiumBtn');
        if (publishPremiumBtn) publishPremiumBtn.style.display = 'none';
    }
}

/**
 * Update streak indicator
 */
function updateStreakIndicator() {
    if (listingStreak && streakData.currentStreak > 0) {
        listingStreak.style.display = 'flex';
        const streakCount = document.getElementById('streakCount');
        if (streakCount) streakCount.textContent = streakData.currentStreak;
    } else if (listingStreak) {
        listingStreak.style.display = 'none';
    }
}

/**
 * Update my listings preview
 */
function updateMyListingsPreview() {
    if (!myListingsText) return;
    
    if (myListings.length > 0) {
        const activeListings = myListings.filter(listing => !isListingExpired(listing));
        myListingsText.textContent = `${activeListings.length} active listings`;
    } else {
        myListingsText.textContent = 'Tap to create your first listing';
    }
}

/**
 * Render spotlight listings
 */
function renderSpotlightListings(spotlightData) {
    if (!spotlightSection || !spotlightListings) return;
    
    if (!spotlightData || spotlightData.length === 0) {
        spotlightSection.style.display = 'none';
        return;
    }
    
    spotlightSection.style.display = 'block';
    spotlightListings.innerHTML = '';
    
    spotlightData.forEach(listing => {
        if (isListingExpired(listing)) return;
        
        const spotlightItem = document.createElement('div');
        spotlightItem.className = 'spotlight-item';
        spotlightItem.dataset.listingId = listing.id;
        
        spotlightItem.innerHTML = `
            <div class="spotlight-preview">
                <i class="fas fa-star"></i>
            </div>
            <div class="spotlight-info">
                <div class="spotlight-title">
                    <span>${escapeHtml(listing.title.substring(0, 30))}${listing.title.length > 30 ? '...' : ''}</span>
                    <span class="featured-badge">FEATURED</span>
                </div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 5px;">
                    ${escapeHtml(listing.description?.substring(0, 50) || '')}${listing.description?.length > 50 ? '...' : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: var(--primary-color);">${listing.price || 'Free'}</span>
                    <span style="font-size: 12px; color: var(--text-secondary);">
                        ${formatTimeAgo(new Date(listing.createdAt))}
                    </span>
                </div>
            </div>
        `;
        
        if (listing.mediaUrl) {
            spotlightItem.querySelector('.spotlight-preview').style.backgroundImage = `url('${escapeHtml(listing.mediaUrl)}')`;
            spotlightItem.querySelector('.spotlight-preview').innerHTML = '';
        }
        
        spotlightItem.addEventListener('click', () => {
            viewListingDetail(listing);
        });
        
        spotlightListings.appendChild(spotlightItem);
    });
}

/**
 * Render marketplace list
 */
function renderMarketplaceList() {
    if (!marketplaceListContent) return;
    
    marketplaceListContent.innerHTML = '';
    
    if (allListings.length === 0) {
        marketplaceListContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-store-alt" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No listings available yet</p>
                <p class="subtext">Be the first to create a listing!</p>
            </div>
        `;
        return;
    }
    
    let filteredListings = allListings;
    if (currentMoodFilter) {
        filteredListings = filterListingsByMood(allListings, currentMoodFilter);
    }
    
    filteredListings.sort((a, b) => {
        const aIsFeatured = a.featured || a.boosted;
        const bIsFeatured = b.featured || b.boosted;
        
        if (aIsFeatured && !bIsFeatured) return -1;
        if (!aIsFeatured && bIsFeatured) return 1;
        
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    filteredListings.forEach(listing => {
        if (isListingVisibleToUser(listing)) {
            addListingItem(listing);
        }
    });
}

/**
 * Add listing item to the list
 */
function addListingItem(listingData) {
    if (!marketplaceListContent) return;
    
    const listingItem = document.createElement('div');
    listingItem.className = 'listing-item';
    if (listingData.featured || listingData.boosted) {
        listingItem.classList.add('featured');
    }
    listingItem.dataset.listingId = listingData.id;
    listingItem.dataset.userId = listingData.userId;
    
    const userAvatar = listingData.user?.photoURL || '';
    const userName = listingData.user?.displayName || 'Unknown User';
    const userInitials = userName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
    
    const availabilityClass = `availability-${listingData.availability || 'free'}`;
    const availabilityText = listingData.availability ? listingData.availability.charAt(0).toUpperCase() + listingData.availability.slice(1) : 'Available';
    
    listingItem.innerHTML = `
        <div class="listing-avatar" style="${listingData.type === LISTING_TYPES.DIGITAL ? 'background-color: #4caf50;' : ''}">
            ${listingData.type === LISTING_TYPES.DIGITAL ? '<i class="fas fa-file-alt"></i>' : 
              listingData.type === LISTING_TYPES.SERVICE ? '<i class="fas fa-tools"></i>' :
              userAvatar ? '' : `<span style="color: white; font-size: 18px;">${userInitials}</span>`}
        </div>
        <div class="listing-info">
            <div class="listing-name">
                <span>${escapeHtml(listingData.title)}</span>
                ${listingData.price ? `<span class="listing-price">${escapeHtml(listingData.price)}</span>` : ''}
                ${listingData.featured ? '<span class="featured-badge">FEATURED</span>' : ''}
                ${listingData.boosted ? '<span class="premium-badge">BOOSTED</span>' : ''}
                ${listingData.verified ? '<span class="verified-badge">VERIFIED</span>' : ''}
                ${listingData.teamListing ? '<span class="team-badge">TEAM</span>' : ''}
            </div>
            <div class="listing-time">
                <span>${formatTimeAgo(new Date(listingData.createdAt))}</span>
                <span class="availability-badge ${availabilityClass}">${availabilityText}</span>
                ${getTrustIndicator(listingData.userId, listingData.user?.trustLevel)}
            </div>
            <div class="listing-preview">
                ${escapeHtml(listingData.description?.substring(0, 60) || '')}${listingData.description?.length > 60 ? '...' : ''}
            </div>
        </div>
    `;
    
    if (userAvatar && listingData.type === LISTING_TYPES.SERVICE) {
        listingItem.querySelector('.listing-avatar').style.backgroundImage = `url('${escapeHtml(userAvatar)}')`;
        listingItem.querySelector('.listing-avatar').innerHTML = '';
    }
    
    listingItem.addEventListener('click', () => {
        viewListingDetail(listingData);
    });
    
    marketplaceListContent.appendChild(listingItem);
}

/**
 * View listing detail
 */
function viewListingDetail(listingData) {
    if (!marketplaceDetailPanel) return;
    
    const detailName = document.getElementById('detailName');
    const detailTime = document.getElementById('detailTime');
    if (detailName) detailName.textContent = listingData.user?.displayName || 'User';
    if (detailTime) detailTime.textContent = formatTimeAgo(new Date(listingData.createdAt));
    
    const detailAvatar = document.getElementById('detailAvatar');
    if (detailAvatar) {
        if (listingData.user?.photoURL) {
            detailAvatar.style.backgroundImage = `url('${escapeHtml(listingData.user.photoURL)}')`;
            detailAvatar.innerHTML = '';
        } else {
            const initials = listingData.user?.displayName?.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) || 'U';
            detailAvatar.innerHTML = `<span style="color: white; font-size: 20px;">${initials}</span>`;
        }
    }
    
    const detailContent = document.getElementById('marketplaceDetailContent');
    if (!detailContent) return;
    
    detailContent.innerHTML = '';
    
    loadListingDetail(listingData, detailContent);
    
    marketplaceDetailPanel.classList.add('active');
    
    currentListingId = listingData.id;
    currentListingData = listingData;
    
    trackListingView(listingData.id);
}

/**
 * Load listing detail content
 */
function loadListingDetail(listingData, container) {
    if (!container) return;
    
    let detailHTML = '';
    
    if (listingData.videoIntro) {
        detailHTML += `
            <div class="file-preview" style="margin-bottom: 20px;">
                <video controls class="listing-detail-media">
                    <source src="${escapeHtml(listingData.videoIntro)}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
        `;
    }
    
    if (listingData.mediaUrl) {
        detailHTML += `
            <div class="file-preview">
                <img src="${escapeHtml(listingData.mediaUrl)}" class="listing-detail-media" alt="${escapeHtml(listingData.title)}">
            </div>
        `;
    }
    
    if (listingData.arPreview && isUserPremium()) {
        detailHTML += `
            <div class="ar-preview-container" style="margin-bottom: 20px;">
                <div class="ar-preview-placeholder">
                    <i class="fas fa-vr-cardboard" style="font-size: 48px; margin-bottom: 10px;"></i>
                    <p>AR Preview Available</p>
                    <button class="action-btn secondary" style="margin-top: 10px;">
                        <i class="fas fa-eye"></i> View in AR
                    </button>
                </div>
            </div>
        `;
    }
    
    detailHTML += `
        <h1 class="listing-detail-title">
            ${escapeHtml(listingData.title)}
            ${listingData.featured ? '<span class="featured-badge">FEATURED</span>' : ''}
            ${listingData.boosted ? '<span class="premium-badge">BOOSTED</span>' : ''}
            ${listingData.verified ? '<span class="verified-badge">VERIFIED</span>' : ''}
        </h1>
        
        <div class="listing-detail-price">
            ${listingData.price ? escapeHtml(listingData.price) : 'Free'}
            ${listingData.acceptsTips ? '<span style="font-size: 14px; color: var(--text-secondary); margin-left: 10px;">(Accepts Tips)</span>' : ''}
        </div>
        
        <div class="listing-detail-description">
            ${escapeHtml(listingData.description || 'No description provided.')}
        </div>
        
        <div class="listing-detail-meta">
            <span class="meta-badge">
                <i class="fas fa-${listingData.type === LISTING_TYPES.DIGITAL ? 'file-alt' : 'tools'}"></i>
                ${listingData.type === LISTING_TYPES.DIGITAL ? 'Digital Item' : 'Service'}
            </span>
            
            <span class="meta-badge availability-${listingData.availability || 'free'}">
                <i class="fas fa-${listingData.availability === 'urgent' ? 'exclamation-circle' : 
                                  listingData.availability === 'busy' ? 'clock' : 'check-circle'}"></i>
                ${listingData.availability ? listingData.availability.charAt(0).toUpperCase() + listingData.availability.slice(1) : 'Available'}
            </span>
            
            ${listingData.visibility ? `
            <span class="meta-badge ${listingData.visibility === 'premium' || listingData.visibility === 'micro' ? 'premium-feature' : ''}">
                <i class="fas fa-${listingData.visibility === 'friends' ? 'user-friends' : 
                                 listingData.visibility === 'groups' ? 'users' : 
                                 listingData.visibility === 'selected' ? 'user-check' : 
                                 listingData.visibility === 'premium' ? 'crown' :
                                 listingData.visibility === 'micro' ? 'bullseye' : 'globe'}"></i>
                ${listingData.visibility === 'friends' ? 'Friends Only' :
                  listingData.visibility === 'groups' ? 'Group Members' :
                  listingData.visibility === 'selected' ? 'Selected People' :
                  listingData.visibility === 'premium' ? 'Premium Only' :
                  listingData.visibility === 'micro' ? 'Micro-Audience' : 'Public'}
            </span>
            ` : ''}
            
            ${listingData.moodContext ? `
            <span class="meta-badge ${listingData.moodContext === 'creative' || listingData.moodContext === 'business' ? 'premium-feature' : ''}">
                <i class="fas fa-${listingData.moodContext === 'help' ? 'hands-helping' :
                                 listingData.moodContext === 'learn' ? 'graduation-cap' :
                                 listingData.moodContext === 'urgent' ? 'bolt' :
                                 listingData.moodContext === 'creative' ? 'palette' :
                                 listingData.moodContext === 'business' ? 'briefcase' : 'search'}"></i>
                ${listingData.moodContext === 'help' ? 'Help Needed' :
                  listingData.moodContext === 'learn' ? 'Learning' :
                  listingData.moodContext === 'urgent' ? 'Urgent' :
                  listingData.moodContext === 'creative' ? 'Creative' :
                  listingData.moodContext === 'business' ? 'Business' : 'Browsing'}
            </span>
            ` : ''}
            
            ${listingData.template ? `
            <span class="meta-badge ${listingData.template === 'business' || listingData.template === 'coaching' || listingData.template === 'vip' ? 'premium-feature' : ''}">
                <i class="fas fa-${listingData.template === 'business' ? 'briefcase' :
                                 listingData.template === 'coaching' ? 'chalkboard-teacher' :
                                 listingData.template === 'creative' ? 'palette' :
                                 listingData.template === 'vip' ? 'crown' :
                                 listingData.template === 'digital' ? 'download' : 'file-alt'}"></i>
                ${listingData.template === 'business' ? 'Business' :
                  listingData.template === 'coaching' ? 'Coaching' :
                  listingData.template === 'creative' ? 'Creative' :
                  listingData.template === 'vip' ? 'VIP' :
                  listingData.template === 'digital' ? 'Digital' : 'Basic'}
            </span>
            ` : ''}
            
            <span class="meta-badge trust-${listingData.user?.trustLevel || 'new'}">
                <i class="fas fa-${listingData.user?.trustLevel === 'verified' ? 'shield-alt' : 
                                 listingData.user?.trustLevel === 'pro' ? 'crown' :
                                 listingData.user?.trustLevel === 'responsive' ? 'comments' : 'star'}"></i>
                ${listingData.user?.trustLevel ? listingData.user.trustLevel.charAt(0).toUpperCase() + listingData.user.trustLevel.slice(1) : 'New'}
            </span>
        </div>
        
        ${listingData.teamMembers ? `
        <div style="margin-top: 20px; padding: 15px; background-color: var(--team-color); border-radius: 12px; color: white;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <i class="fas fa-users"></i>
                <div style="font-weight: 600;">Team Listing</div>
            </div>
            <div style="font-size: 14px;">
                Managed by ${listingData.teamMembers.length} team members
            </div>
        </div>
        ` : ''}
        
        ${listingData.expiresAt ? `
        <div style="margin-top: 20px; padding: 15px; background-color: var(--secondary-color); border-radius: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-clock" style="color: var(--warning-color);"></i>
                <div>
                    <div style="font-weight: 500;">Expires ${formatTimeRemaining(new Date(listingData.expiresAt))}</div>
                    <div style="font-size: 14px; color: var(--text-secondary);">
                        Listed ${formatTimeAgo(new Date(listingData.createdAt))}
                    </div>
                </div>
            </div>
            ${listingData.autoRenew ? `
            <div style="margin-top: 10px; padding: 10px; background-color: rgba(52, 199, 89, 0.1); border-radius: 8px; border: 1px solid rgba(52, 199, 89, 0.2);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-sync-alt" style="color: var(--success-color);"></i>
                    <span style="font-size: 14px;">Auto-renew enabled</span>
                </div>
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        ${listingData.reactions && listingData.reactions.length > 0 ? `
        <div style="margin-top: 20px;">
            <div style="font-weight: 600; margin-bottom: 10px;">Reactions</div>
            <div class="reaction-picker">
                ${listingData.reactions.map(reaction => `
                    <div class="reaction-option ${reaction.premium ? 'premium' : ''}">
                        ${reaction.emoji}
                        <span style="font-size: 12px; margin-left: 5px;">${reaction.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
    `;
    
    container.innerHTML = detailHTML;
    
    if (listingData.type === LISTING_TYPES.DIGITAL && listingData.fileUrl) {
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'action-btn primary';
        downloadBtn.style.marginTop = '20px';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download File';
        downloadBtn.addEventListener('click', () => {
            downloadDigitalFile(listingData.id, listingData.fileUrl, listingData.fileName);
        });
        container.appendChild(downloadBtn);
    }
    
    const tipBtn = document.getElementById('tipBtn');
    if (tipBtn) {
        tipBtn.addEventListener('click', () => {
            const tipAmounts = document.getElementById('tipAmounts');
            if (tipAmounts) {
                tipAmounts.classList.toggle('show');
            }
        });
    }
}

/**
 * Initialize analytics chart
 */
function initializeAnalyticsChart() {
    const ctx = document.getElementById('analyticsChart');
    if (!ctx) return;
    
    window.analyticsChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Views',
                data: [12, 19, 15, 25, 22, 30, 28],
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }, {
                label: 'Saves',
                data: [5, 8, 6, 12, 10, 15, 13],
                borderColor: 'rgb(255, 99, 132)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}

/**
 * Update analytics dashboard
 */
function updateAnalyticsDashboard() {
    if (!analyticsData) return;
    
    const analyticsViews = document.getElementById('analyticsViews');
    const analyticsSaves = document.getElementById('analyticsSaves');
    const analyticsShares = document.getElementById('analyticsShares');
    const analyticsMessages = document.getElementById('analyticsMessages');
    const analyticsConversion = document.getElementById('analyticsConversion');
    const analyticsEngagement = document.getElementById('analyticsEngagement');
    
    if (analyticsViews) analyticsViews.textContent = analyticsData.views || 0;
    if (analyticsSaves) analyticsSaves.textContent = analyticsData.saves || 0;
    if (analyticsShares) analyticsShares.textContent = analyticsData.shares || 0;
    if (analyticsMessages) analyticsMessages.textContent = analyticsData.messages || 0;
    if (analyticsConversion) analyticsConversion.textContent = analyticsData.conversionRate ? `${analyticsData.conversionRate}%` : '0%';
    if (analyticsEngagement) analyticsEngagement.textContent = analyticsData.avgEngagement ? `${analyticsData.avgEngagement}s` : '0s';
    
    updateChangeIndicator('viewsChange', analyticsData.viewsChange);
    updateChangeIndicator('savesChange', analyticsData.savesChange);
    updateChangeIndicator('sharesChange', analyticsData.sharesChange);
    updateChangeIndicator('messagesChange', analyticsData.messagesChange);
    updateChangeIndicator('conversionChange', analyticsData.conversionChange);
    updateChangeIndicator('engagementChange', analyticsData.engagementChange);
    
    if (isUserPremium() && analyticsData.competitorInsights) {
        const competitorInsights = document.getElementById('competitorInsights');
        if (competitorInsights) {
            competitorInsights.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <strong>Category Average:</strong> ${analyticsData.competitorInsights.categoryAvg} views/day
                </div>
                <div>
                    <strong>Top Performers:</strong> ${analyticsData.competitorInsights.topPerformers} views/day
                </div>
            `;
        }
    }
}

/**
 * Update change indicator
 */
function updateChangeIndicator(elementId, change) {
    const element = document.getElementById(elementId);
    if (!element || change === undefined) return;
    
    const isPositive = change >= 0;
    element.className = `analytics-card-change ${isPositive ? 'positive' : 'negative'}`;
    element.innerHTML = `
        <i class="fas fa-arrow-${isPositive ? 'up' : 'down'}"></i>
        ${Math.abs(change)}%
    `;
}

/**
 * Generate heatmap
 */
function generateHeatmap() {
    const heatmapGrid = document.getElementById('engagementHeatmap');
    if (!heatmapGrid) return;
    
    heatmapGrid.innerHTML = '';
    
    for (let hour = 0; hour < 24; hour++) {
        for (let day = 0; day < 7; day++) {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            
            const engagement = Math.floor(Math.random() * 100);
            const intensity = Math.min(Math.floor(engagement / 20), 4);
            
            const colors = [
                'rgba(75, 192, 192, 0.1)',
                'rgba(75, 192, 192, 0.3)',
                'rgba(75, 192, 192, 0.5)',
                'rgba(75, 192, 192, 0.7)',
                'rgba(75, 192, 192, 0.9)'
            ];
            
            cell.style.backgroundColor = colors[intensity];
            cell.title = `${engagement} engagements`;
            
            if (engagement > 50) {
                cell.innerHTML = '🔥';
            }
            
            heatmapGrid.appendChild(cell);
        }
    }
}

/**
 * Render team members
 */
function renderTeamMembers() {
    const teamMembersList = document.getElementById('teamMembersList');
    if (!teamMembersList) return;
    
    teamMembersList.innerHTML = '';
    
    if (teamMembers.length === 0) {
        teamMembersList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No team members yet</p>
                <p style="font-size: 14px; margin-top: 10px;">Invite team members to collaborate</p>
            </div>
        `;
        return;
    }
    
    teamMembers.forEach(member => {
        const memberElement = document.createElement('div');
        memberElement.className = 'team-member';
        
        memberElement.innerHTML = `
            <div class="team-member-info">
                <div class="team-member-avatar">
                    ${member.photoURL ? '' : '<i class="fas fa-user"></i>'}
                </div>
                <div>
                    <div style="font-weight: 500;">${escapeHtml(member.displayName)}</div>
                    <div class="team-member-role">${member.role || 'Member'}</div>
                </div>
            </div>
            <div>
                <select class="text-input" style="font-size: 12px; padding: 5px 10px;" data-member-id="${member.id}">
                    <option value="member" ${member.role === 'member' ? 'selected' : ''}>Member</option>
                    <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Editor</option>
                    <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                <button class="marketplace-action-btn remove-member-btn" style="width: 30px; height: 30px; margin-left: 10px;" data-member-id="${member.id}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        if (member.photoURL) {
            memberElement.querySelector('.team-member-avatar').style.backgroundImage = `url('${escapeHtml(member.photoURL)}')`;
            memberElement.querySelector('.team-member-avatar').innerHTML = '';
        }
        
        teamMembersList.appendChild(memberElement);
    });
}

/**
 * Render leaderboard
 */
function renderLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;
    
    leaderboardList.innerHTML = '';
    
    if (leaderboardData.length === 0) {
        leaderboardList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-trophy" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No leaderboard data yet</p>
                <p style="font-size: 14px; margin-top: 10px;">Create listings to appear on the leaderboard</p>
            </div>
        `;
        return;
    }
    
    leaderboardData.forEach((user, index) => {
        const leaderboardItem = document.createElement('div');
        leaderboardItem.className = 'leaderboard-item';
        
        leaderboardItem.innerHTML = `
            <div class="leaderboard-rank">${index + 1}</div>
            <div class="team-member-avatar" style="width: 40px; height: 40px;">
                ${user.photoURL ? '' : '<i class="fas fa-user"></i>'}
            </div>
            <div class="leaderboard-info">
                <div style="font-weight: 500;">${escapeHtml(user.displayName)}</div>
                <div class="leaderboard-stats">
                    <span><i class="fas fa-list"></i> ${user.listingsCount}</span>
                    <span><i class="fas fa-star"></i> ${user.rating || '5.0'}</span>
                    <span><i class="fas fa-check-circle"></i> ${user.successfulTransactions}</span>
                </div>
            </div>
            <div style="font-weight: 700; color: var(--primary-color);">
                ${user.points || 0} pts
            </div>
        `;
        
        if (user.photoURL) {
            leaderboardItem.querySelector('.team-member-avatar').style.backgroundImage = `url('${escapeHtml(user.photoURL)}')`;
            leaderboardItem.querySelector('.team-member-avatar').innerHTML = '';
        }
        
        if (index === 0) {
            leaderboardItem.style.background = 'linear-gradient(45deg, #FFD700, #FFA500)';
            leaderboardItem.style.color = '#000';
        } else if (index === 1) {
            leaderboardItem.style.background = 'linear-gradient(45deg, #C0C0C0, #A9A9A9)';
        } else if (index === 2) {
            leaderboardItem.style.background = 'linear-gradient(45deg, #CD7F32, #8B4513)';
            leaderboardItem.style.color = '#fff';
        }
        
        leaderboardList.appendChild(leaderboardItem);
    });
}

/**
 * Update mood filter indicator
 */
function updateMoodFilterIndicator() {
    const indicator = document.getElementById('moodFilterIndicator');
    const filterText = document.getElementById('currentMoodFilter');
    
    if (!indicator || !filterText) return;
    
    if (currentMoodFilter) {
        indicator.style.display = 'flex';
        
        switch (currentMoodFilter) {
            case MOOD_CONTEXTS.HELP:
                filterText.textContent = 'Help Needed';
                break;
            case MOOD_CONTEXTS.LEARN:
                filterText.textContent = 'Learning Mode';
                break;
            case MOOD_CONTEXTS.URGENT:
                filterText.textContent = 'Urgent';
                break;
            case MOOD_CONTEXTS.CREATIVE:
                filterText.textContent = 'Creative Mode';
                break;
            case MOOD_CONTEXTS.BUSINESS:
                filterText.textContent = 'Business Mode';
                break;
            default:
                filterText.textContent = 'Browsing';
        }
    } else {
        indicator.style.display = 'none';
    }
}

/**
 * Load service categories
 */
function loadServiceCategories() {
    const serviceTitleInput = document.getElementById('serviceTitle');
    if (serviceTitleInput) {
        const datalist = document.createElement('datalist');
        datalist.id = 'serviceCategories';
        
        SERVICE_CATEGORIES.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            datalist.appendChild(option);
        });
        
        PREMIUM_CATEGORIES.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.className = 'premium-option';
            datalist.appendChild(option);
        });
        
        document.body.appendChild(datalist);
        serviceTitleInput.setAttribute('list', 'serviceCategories');
    }
}

/**
 * Load groups for selection
 */
function loadGroupsForSelection() {
    const groupsList = document.getElementById('groupsList');
    if (!groupsList) return;
    
    groupsList.innerHTML = '';
    
    userGroups.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'circle-option';
        groupItem.dataset.groupId = group.id;
        
        groupItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background-color: #ccc; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-users"></i>
                </div>
                <div>
                    <div style="font-weight: 500;">${escapeHtml(group.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${group.memberCount || 0} members</div>
                </div>
            </div>
        `;
        
        groupItem.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
        
        groupsList.appendChild(groupItem);
    });
}

/**
 * Load friends for selection
 */
function loadFriendsForSelection() {
    const peopleList = document.getElementById('peopleList');
    if (!peopleList) return;
    
    peopleList.innerHTML = '';
    
    userFriends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'circle-option';
        friendItem.dataset.friendId = friend.id;
        
        friendItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background-color: #ccc; display: flex; align-items: center; justify-content: center;">
                    ${friend.photoURL ? '' : '<i class="fas fa-user"></i>'}
                </div>
                <div style="font-weight: 500;">${escapeHtml(friend.displayName)}</div>
            </div>
        `;
        
        if (friend.photoURL) {
            friendItem.querySelector('div').style.backgroundImage = `url('${escapeHtml(friend.photoURL)}')`;
            friendItem.querySelector('div').innerHTML = '';
        }
        
        friendItem.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
        
        peopleList.appendChild(friendItem);
    });
}

/**
 * Setup enhanced event listeners with parent coordination
 */
function setupEnhancedEventListeners() {
    console.log('[Tool-ui.js] Setting up enhanced event listeners');
    
    // First setup all existing event listeners
    setupExistingEventListeners();
    
    // Then add parent communication specific listeners
    setupParentCommunicationListeners();
    
    console.log('[Tool-ui.js] Enhanced event listeners setup complete');
}

/**
 * Setup existing event listeners
 */
function setupExistingEventListeners() {
    const allTab = document.getElementById('allTab');
    const servicesTab = document.getElementById('servicesTab');
    const digitalTab = document.getElementById('digitalTab');
    const friendsTab = document.getElementById('friendsTab');
    const groupsTab = document.getElementById('groupsTab');
    const myTab = document.getElementById('myTab');
    const premiumTab = document.getElementById('premiumTab');
    const spotlightTab = document.getElementById('spotlightTab');
    
    if (allTab) allTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderMarketplaceList();
    });
    
    if (servicesTab) servicesTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderServicesList();
    });
    
    if (digitalTab) digitalTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderDigitalList();
    });
    
    if (friendsTab) friendsTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderFriendsListings();
    });
    
    if (groupsTab) groupsTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderGroupListings();
    });
    
    if (myTab) myTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderMyListings();
    });
    
    if (premiumTab) premiumTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderPremiumListings();
    });
    
    if (spotlightTab) spotlightTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderSpotlightTab();
    });
    
    const createListingBtn = document.getElementById('createListingBtn');
    if (createListingBtn) createListingBtn.addEventListener('click', () => {
        showCreateListingModal();
    });
    
    const createListingQuickBtn = document.getElementById('createListingQuickBtn');
    if (createListingQuickBtn) createListingQuickBtn.addEventListener('click', () => {
        showCreateListingModal();
    });
    
    const sellServiceBtn = document.getElementById('sellServiceBtn');
    if (sellServiceBtn) sellServiceBtn.addEventListener('click', () => {
        showCreateListingModal();
        const serviceTab = document.querySelector('.create-listing-tab[data-tab="service"]');
        if (serviceTab) serviceTab.click();
    });
    
    const sellDigitalBtn = document.getElementById('sellDigitalBtn');
    if (sellDigitalBtn) sellDigitalBtn.addEventListener('click', () => {
        showCreateListingModal();
        const digitalTab = document.querySelector('.create-listing-tab[data-tab="digital"]');
        if (digitalTab) digitalTab.click();
    });
    
    const premiumOptionsBtn = document.getElementById('premiumOptionsBtn');
    if (premiumOptionsBtn) premiumOptionsBtn.addEventListener('click', () => {
        showPremiumOptionsModal();
    });
    
    const viewAnalyticsBtn = document.getElementById('viewAnalyticsBtn');
    if (viewAnalyticsBtn) viewAnalyticsBtn.addEventListener('click', () => {
        if (isUserPremium()) {
            showAnalyticsModal();
        } else {
            showNotification('Upgrade to Premium for advanced analytics', 'info');
            showPremiumOptionsModal();
        }
    });
    
    const viewSavedBtn = document.getElementById('viewSavedBtn');
    if (viewSavedBtn) viewSavedBtn.addEventListener('click', () => {
        showSavedItemsModal();
    });
    
    const viewNotesBtn = document.getElementById('viewNotesBtn');
    if (viewNotesBtn) viewNotesBtn.addEventListener('click', () => {
        showMyNotesModal();
    });
    
    document.querySelectorAll('.create-listing-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            document.querySelectorAll('.create-listing-tab').forEach(t => {
                t.classList.remove('active');
            });
            this.classList.add('active');
            
            document.querySelectorAll('.create-listing-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabContent = document.getElementById(`${tabName}Tab`);
            if (tabContent) {
                tabContent.classList.add('active');
            }
            
            if (tabName === 'circles') {
                updateTrustCircleSelection();
            }
            
            if (tabName === 'premium' && !isUserPremium()) {
                const publishPremiumBtn = document.getElementById('publishPremiumBtn');
                const publishListingBtn = document.getElementById('publishListingBtn');
                if (publishPremiumBtn) publishPremiumBtn.style.display = 'none';
                if (publishListingBtn) publishListingBtn.style.display = 'flex';
            } else if (tabName === 'premium' && isUserPremium()) {
                const publishPremiumBtn = document.getElementById('publishPremiumBtn');
                const publishListingBtn = document.getElementById('publishListingBtn');
                if (publishPremiumBtn) publishPremiumBtn.style.display = 'flex';
                if (publishListingBtn) publishListingBtn.style.display = 'none';
            } else {
                const publishPremiumBtn = document.getElementById('publishPremiumBtn');
                const publishListingBtn = document.getElementById('publishListingBtn');
                if (publishPremiumBtn) publishPremiumBtn.style.display = 'none';
                if (publishListingBtn) publishListingBtn.style.display = 'flex';
            }
        });
    });
    
    document.querySelectorAll('.availability-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.availability-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            selectedAvailability = this.dataset.availability;
        });
    });
    
    document.querySelectorAll('.circle-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.circle-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            selectedTrustCircle = this.dataset.circle;
            updateTrustCircleSelection();
        });
    });
    
    document.querySelectorAll('.template-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for premium templates', 'info');
                return;
            }
            
            document.querySelectorAll('.template-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            selectedTemplate = this.dataset.template;
        });
    });
    
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for premium mood filters', 'info');
                return;
            }
            
            document.querySelectorAll('.mood-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            selectedMoodContext = this.dataset.mood;
        });
    });
    
    document.querySelectorAll('.duration-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for extended durations', 'info');
                return;
            }
            
            document.querySelectorAll('.duration-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            selectedDuration = this.dataset.duration;
        });
    });
    
    document.querySelectorAll('.schedule-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.schedule-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            selectedSchedule = this.dataset.schedule;
        });
    });
    
    document.querySelectorAll('.export-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for Excel exports', 'info');
                return;
            }
            
            document.querySelectorAll('.export-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            const format = this.dataset.format;
            exportAnalyticsData(format);
        });
    });
    
    const digitalUploadArea = document.getElementById('digitalUploadArea');
    const digitalUploadInput = document.getElementById('digitalUploadInput');
    
    if (digitalUploadArea && digitalUploadInput) {
        digitalUploadArea.addEventListener('click', () => {
            digitalUploadInput.click();
        });
        
        digitalUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            digitalUploadArea.style.borderColor = 'var(--primary-color)';
            digitalUploadArea.style.backgroundColor = 'rgba(0, 132, 255, 0.05)';
        });
        
        digitalUploadArea.addEventListener('dragleave', () => {
            digitalUploadArea.style.borderColor = '';
            digitalUploadArea.style.backgroundColor = '';
        });
        
        digitalUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            digitalUploadArea.style.borderColor = '';
            digitalUploadArea.style.backgroundColor = '';
            
            if (e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
        
        digitalUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }
    
    const bulkUploadArea = document.getElementById('bulkUploadArea');
    const bulkUploadInput = document.getElementById('bulkUploadInput');
    
    if (bulkUploadArea && bulkUploadInput) {
        bulkUploadArea.addEventListener('click', () => {
            if (!isUserPremium()) {
                showNotification('Upgrade to Premium for bulk uploads', 'info');
                return;
            }
            bulkUploadInput.click();
        });
        
        bulkUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                processBulkUpload(e.target.files[0]);
            }
        });
    }
    
    const uploadVideoBtn = document.getElementById('uploadVideoBtn');
    if (uploadVideoBtn) {
        uploadVideoBtn.addEventListener('click', () => {
            if (!isUserPremium()) {
                showNotification('Upgrade to Premium for video intros', 'info');
                return;
            }
            
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleVideoUpload(e.target.files[0]);
                }
            });
            input.click();
        });
    }
    
    const publishListingBtn = document.getElementById('publishListingBtn');
    if (publishListingBtn) publishListingBtn.addEventListener('click', () => {
        publishListingFromModal();
    });
    
    const publishPremiumBtn = document.getElementById('publishPremiumBtn');
    if (publishPremiumBtn) publishPremiumBtn.addEventListener('click', () => {
        publishPremiumListingFromModal();
    });
    
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => {
        saveCurrentAsDraft();
    });
    
    const closeCreateListingModal = document.getElementById('closeCreateListingModal');
    if (closeCreateListingModal) closeCreateListingModal.addEventListener('click', () => {
        if (createListingModal) createListingModal.classList.remove('active');
    });
    
    const closeAnalyticsModal = document.getElementById('closeAnalyticsModal');
    if (closeAnalyticsModal) closeAnalyticsModal.addEventListener('click', () => {
        if (analyticsModal) analyticsModal.classList.remove('active');
    });
    
    const closePremiumModal = document.getElementById('closePremiumModal');
    if (closePremiumModal) closePremiumModal.addEventListener('click', () => {
        if (premiumOptionsModal) premiumOptionsModal.classList.remove('active');
    });
    
    const closeTeamModal = document.getElementById('closeTeamModal');
    if (closeTeamModal) closeTeamModal.addEventListener('click', () => {
        if (teamManagementModal) teamManagementModal.classList.remove('active');
    });
    
    const closeLeaderboardModal = document.getElementById('closeLeaderboardModal');
    if (closeLeaderboardModal) closeLeaderboardModal.addEventListener('click', () => {
        if (leaderboardModal) leaderboardModal.classList.remove('active');
    });
    
    const closeReactionModal = document.getElementById('closeReactionModal');
    if (closeReactionModal) closeReactionModal.addEventListener('click', () => {
        if (reactionPickerModal) reactionPickerModal.classList.remove('active');
    });
    
    const closeSavedModal = document.getElementById('closeSavedModal');
    if (closeSavedModal) closeSavedModal.addEventListener('click', () => {
        if (savedItemsModal) savedItemsModal.classList.remove('active');
    });
    
    const closeNotesModal = document.getElementById('closeNotesModal');
    if (closeNotesModal) closeNotesModal.addEventListener('click', () => {
        if (myNotesModal) myNotesModal.classList.remove('active');
    });
    
    const closeTrustStatsModal = document.getElementById('closeTrustStatsModal');
    if (closeTrustStatsModal) closeTrustStatsModal.addEventListener('click', () => {
        if (trustStatsModal) trustStatsModal.classList.remove('active');
    });
    
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.addEventListener('click', () => {
        if (marketplaceDetailPanel) marketplaceDetailPanel.classList.remove('active');
    });
    
    const saveListingBtn = document.getElementById('saveListingBtn');
    if (saveListingBtn) saveListingBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            saveToSavedItems(listingId);
        }
    });
    
    const addNoteBtn = document.getElementById('addNoteBtn');
    if (addNoteBtn) addNoteBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            showAddNoteDialog(listingId);
        }
    });
    
    const addReactionBtn = document.getElementById('addReactionBtn');
    if (addReactionBtn) addReactionBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            showReactionPicker(listingId);
        }
    });
    
    const reserveBtn = document.getElementById('reserveBtn');
    if (reserveBtn) reserveBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            reserveListing(listingId);
        }
    });
    
    const tipBtn = document.getElementById('tipBtn');
    if (tipBtn) tipBtn.addEventListener('click', () => {
        const tipAmounts = document.getElementById('tipAmounts');
        if (tipAmounts) tipAmounts.classList.toggle('show');
    });
    
    document.querySelectorAll('.tip-option').forEach(option => {
        option.addEventListener('click', async function() {
            const listingId = getCurrentListingId();
            if (!listingId) return;
            
            const amount = this.dataset.amount;
            
            if (amount === 'custom') {
                const customAmount = prompt('Enter custom tip amount ($):');
                if (customAmount && !isNaN(customAmount) && parseFloat(customAmount) > 0) {
                    await sendTip(listingId, null, parseFloat(customAmount));
                }
            } else {
                await sendTip(listingId, parseFloat(amount));
            }
            
            const tipAmounts = document.getElementById('tipAmounts');
            if (tipAmounts) tipAmounts.classList.remove('show');
        });
    });
    
    const contactSellerBtn = document.getElementById('contactSellerBtn');
    if (contactSellerBtn) contactSellerBtn.addEventListener('click', () => {
        if (currentListingData) {
            openChat(currentListingData.userId, currentListingData.user?.displayName || 'Seller');
        }
    });
    
    const shareListingBtn = document.getElementById('shareListingBtn');
    if (shareListingBtn) shareListingBtn.addEventListener('click', () => {
        if (currentListingData) {
            shareListing(currentListingData);
        }
    });
    
    const detailMenuBtn = document.getElementById('detailMenuBtn');
    if (detailMenuBtn) detailMenuBtn.addEventListener('click', () => {
        showDetailMenu();
    });
    
    const peopleSearch = document.getElementById('peopleSearch');
    if (peopleSearch) {
        peopleSearch.addEventListener('input', (e) => {
            filterFriends(e.target.value);
        });
    }
    
    const moodFilterIndicator = document.getElementById('moodFilterIndicator');
    if (moodFilterIndicator) moodFilterIndicator.addEventListener('click', () => {
        clearMoodFilter();
    });
    
    const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
    if (refreshAnalyticsBtn) refreshAnalyticsBtn.addEventListener('click', async () => {
        try {
            await loadAnalyticsData();
            showNotification('Analytics refreshed', 'success');
        } catch (error) {
            showNotification('Failed to refresh analytics', 'error');
        }
    });
    
    const exportAnalyticsBtn = document.getElementById('exportAnalyticsBtn');
    if (exportAnalyticsBtn) exportAnalyticsBtn.addEventListener('click', () => {
        const selectedFormat = document.querySelector('.export-option.selected')?.dataset.format || 'csv';
        exportAnalyticsData(selectedFormat);
    });
    
    document.querySelectorAll('[data-plan-select]').forEach(button => {
        button.addEventListener('click', function() {
            const plan = this.dataset.planSelect;
            showPaymentForm(plan);
        });
    });
    
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', function() {
            document.querySelectorAll('.payment-method').forEach(m => {
                m.classList.remove('selected');
            });
            this.classList.add('selected');
            
            const methodType = this.dataset.method;
            showPaymentFormForMethod(methodType);
        });
    });
    
    const completePaymentBtn = document.getElementById('completePaymentBtn');
    if (completePaymentBtn) completePaymentBtn.addEventListener('click', async () => {
        await processSubscriptionPayment();
    });
    
    const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    if (cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', () => {
        const paymentContainer = document.getElementById('paymentContainer');
        if (paymentContainer) paymentContainer.style.display = 'none';
    });
    
    const startFreeTrialBtn = document.getElementById('startFreeTrialBtn');
    if (startFreeTrialBtn) startFreeTrialBtn.addEventListener('click', async () => {
        await startFreeTrial();
    });
    
    const restorePurchaseBtn = document.getElementById('restorePurchaseBtn');
    if (restorePurchaseBtn) restorePurchaseBtn.addEventListener('click', async () => {
        await restorePurchase();
    });
    
    const inviteTeamMemberBtn = document.getElementById('inviteTeamMemberBtn');
    if (inviteTeamMemberBtn) inviteTeamMemberBtn.addEventListener('click', () => {
        inviteTeamMemberAction();
    });
    
    const saveTeamBtn = document.getElementById('saveTeamBtn');
    if (saveTeamBtn) saveTeamBtn.addEventListener('click', async () => {
        await saveTeamChanges();
    });
    
    const refreshLeaderboardBtn = document.getElementById('refreshLeaderboardBtn');
    if (refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener('click', async () => {
        await loadLeaderboard();
        renderLeaderboard();
        showNotification('Leaderboard refreshed', 'success');
    });
    
    document.querySelectorAll('.reaction-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for exclusive reactions', 'info');
                return;
            }
            
            const reaction = this.dataset.reaction;
            const listingId = currentListingId;
            
            if (listingId) {
                addReaction(listingId, reaction);
            }
        });
    });
    
    window.addEventListener('online', () => {
        showNotification('Back online - syncing marketplace data', 'info');
        syncOfflineMarketplaceData();
    });
    
    window.addEventListener('offline', () => {
        showNotification('Marketplace working offline', 'info');
    });
    
    window.addEventListener('beforeunload', () => {
        saveAllMarketplaceData();
    });
    
    setupBackupRestoreButtons();
}

/**
 * Setup parent communication listeners
 */
function setupParentCommunicationListeners() {
    // Add a refresh user data button if it doesn't exist
    const userActionsContainer = document.querySelector('.my-listings-actions');
    if (userActionsContainer && !document.getElementById('refreshUserDataBtn')) {
        const refreshUserBtn = document.createElement('button');
        refreshUserBtn.className = 'my-listing-action-btn secondary';
        refreshUserBtn.id = 'refreshUserDataBtn';
        refreshUserBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh User';
        refreshUserBtn.title = 'Refresh user data from parent or API';
        refreshUserBtn.addEventListener('click', () => {
            refreshUserData();
        });
        userActionsContainer.appendChild(refreshUserBtn);
    }
    
    // Add debug info panel if in development mode
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        addDebugInfoPanel();
    }
}

/**
 * Refresh user data
 */
function refreshUserData() {
    console.log('[Tool-ui.js] Manually refreshing user data');
    
    showNotification('Refreshing user data...', 'info');
}

/**
 * Add debug info panel
 */
function addDebugInfoPanel() {
    const debugPanel = document.createElement('div');
    debugPanel.id = 'marketplaceDebugPanel';
    debugPanel.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        color: #fff;
        padding: 10px;
        border-radius: 5px;
        font-size: 12px;
        z-index: 10000;
        max-width: 300px;
        max-height: 200px;
        overflow-y: auto;
        font-family: monospace;
    `;
    
    debugPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <strong>Marketplace Debug</strong>
            <button id="closeDebugBtn" style="background: none; border: none; color: #fff; cursor: pointer;">✕</button>
        </div>
        <div id="debugContent">
            <div>User: <span id="debugUserName">${currentUser?.displayName || 'None'}</span></div>
            <div>In Iframe: <span id="debugIframe">${window.parent !== window ? 'Yes' : 'No'}</span></div>
        </div>
    `;
    
    document.body.appendChild(debugPanel);
    
    // Update debug info periodically
    setInterval(() => {
        document.getElementById('debugUserName').textContent = currentUser?.displayName || 'None';
        document.getElementById('debugIframe').textContent = window.parent !== window ? 'Yes' : 'No';
    }, 1000);
    
    // Close button
    document.getElementById('closeDebugBtn').addEventListener('click', () => {
        debugPanel.style.display = 'none';
    });
}

/**
 * Get current listing ID
 */
function getCurrentListingId() {
    return currentListingId;
}

/**
 * Get current listing
 */
function getCurrentListing() {
    return currentListingData;
}

/**
 * Update trust circle selection
 */
function updateTrustCircleSelection() {
    const groupsContainer = document.getElementById('groupSelectionContainer');
    const peopleContainer = document.getElementById('peopleSelectionContainer');
    
    if (selectedTrustCircle === TRUST_CIRCLES.GROUPS) {
        if (groupsContainer) groupsContainer.style.display = 'block';
        if (peopleContainer) peopleContainer.style.display = 'none';
    } else if (selectedTrustCircle === TRUST_CIRCLES.SELECTED || selectedTrustCircle === TRUST_CIRCLES.MICRO) {
        if (groupsContainer) groupsContainer.style.display = 'none';
        if (peopleContainer) peopleContainer.style.display = 'block';
    } else {
        if (groupsContainer) groupsContainer.style.display = 'none';
        if (peopleContainer) peopleContainer.style.display = 'none';
    }
}

/**
 * Handle file upload
 */
function handleFileUpload(file) {
    const preview = document.getElementById('digitalPreview');
    if (!preview) return;
    
    const allowedTypes = ['.pdf', '.doc', '.docx', '.zip', '.jpg', '.jpeg', '.png', '.mp3', '.wav', '.mp4', '.mov', '.avi'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
        showNotification('File type not supported', 'error');
        return;
    }
    
    const maxSize = isUserPremium() ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    
    if (file.size > maxSize) {
        showNotification(`File size must be less than ${isUserPremium() ? '500MB' : '50MB'}`, 'error');
        return;
    }
    
    const progressBar = document.getElementById('uploadProgress');
    if (progressBar) progressBar.style.width = '0%';
    
    const reader = new FileReader();
    reader.onloadstart = function() {
        if (progressBar) progressBar.style.width = '10%';
    };
    
    reader.onprogress = function(e) {
        if (e.lengthComputable && progressBar) {
            const percentLoaded = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percentLoaded + '%';
        }
    };
    
    reader.onload = function(e) {
        if (progressBar) {
            progressBar.style.width = '100%';
            setTimeout(() => {
                progressBar.style.width = '0%';
            }, 500);
        }
        
        preview.innerHTML = '';
        
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.width = '100%';
            img.style.maxHeight = '200px';
            img.style.objectFit = 'contain';
            preview.appendChild(img);
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = e.target.result;
            video.controls = true;
            video.style.width = '100%';
            video.style.maxHeight = '200px';
            preview.appendChild(video);
        } else {
            const icon = document.createElement('div');
            icon.style.textAlign = 'center';
            icon.style.padding = '40px';
            icon.innerHTML = `
                <i class="fas fa-file-alt" style="font-size: 64px; color: var(--primary-color); margin-bottom: 15px;"></i>
                <div style="font-weight: 500;">${escapeHtml(file.name)}</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-top: 5px;">
                    ${formatFileSize(file.size)}
                </div>
            `;
            preview.appendChild(icon);
        }
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
            <div>
                <div style="font-weight: 500;">${escapeHtml(file.name)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${formatFileSize(file.size)} • ${fileExtension.toUpperCase().replace('.', '')}</div>
            </div>
            <button class="marketplace-action-btn remove-file-btn" style="width: 36px; height: 36px;">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        fileInfo.querySelector('.remove-file-btn').addEventListener('click', () => {
            preview.innerHTML = '';
            selectedDigitalFile = null;
        });
        
        preview.appendChild(fileInfo);
        
        selectedDigitalFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            url: e.target.result
        };
    };
    
    reader.readAsDataURL(file);
}

/**
 * Handle video upload
 */
function handleVideoUpload(file) {
    const maxSize = isUserPremium() ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    
    if (file.size > maxSize) {
        showNotification(`Video size must be less than ${isUserPremium() ? '500MB' : '50MB'}`, 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        selectedVideoIntro = {
            name: file.name,
            size: file.size,
            type: file.type,
            url: e.target.result
        };
        
        showNotification('Video intro uploaded successfully', 'success');
    };
    
    reader.readAsDataURL(file);
}

/**
 * Filter friends
 */
function filterFriends(searchTerm) {
    const peopleList = document.getElementById('peopleList');
    if (!peopleList) return;
    
    const friendItems = peopleList.querySelectorAll('.circle-option');
    friendItems.forEach(item => {
        const friendName = item.querySelector('div:nth-child(2)').textContent.toLowerCase();
        if (friendName.includes(searchTerm.toLowerCase())) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Show create listing modal
 */
function showCreateListingModal() {
    if (!createListingModal) return;
    
    createListingModal.classList.add('active');
    
    const serviceTitle = document.getElementById('serviceTitle');
    const serviceDescription = document.getElementById('serviceDescription');
    const servicePrice = document.getElementById('servicePrice');
    const digitalTitle = document.getElementById('digitalTitle');
    const digitalDescription = document.getElementById('digitalDescription');
    const digitalPrice = document.getElementById('digitalPrice');
    const expiryDate = document.getElementById('expiryDate');
    const sellerNotes = document.getElementById('sellerNotes');
    const teamNotes = document.getElementById('teamNotes');
    const visibilityStart = document.getElementById('visibilityStart');
    const visibilityEnd = document.getElementById('visibilityEnd');
    const templatePrimaryColor = document.getElementById('templatePrimaryColor');
    const templateFont = document.getElementById('templateFont');
    
    if (serviceTitle) serviceTitle.value = '';
    if (serviceDescription) serviceDescription.value = '';
    if (servicePrice) servicePrice.value = '';
    if (digitalTitle) digitalTitle.value = '';
    if (digitalDescription) digitalDescription.value = '';
    if (digitalPrice) digitalPrice.value = '';
    if (expiryDate) expiryDate.value = '';
    if (sellerNotes) sellerNotes.value = '';
    if (teamNotes) teamNotes.value = '';
    if (visibilityStart) visibilityStart.value = '';
    if (visibilityEnd) visibilityEnd.value = '';
    if (templatePrimaryColor) templatePrimaryColor.value = '#0084ff';
    if (templateFont) templateFont.value = 'Default';
    
    document.querySelectorAll('.availability-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.circle-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.template-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.mood-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.duration-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.schedule-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    const digitalPreview = document.getElementById('digitalPreview');
    if (digitalPreview) {
        digitalPreview.innerHTML = '';
    }
    
    const featuredListingCheckbox = document.getElementById('featuredListingCheckbox');
    const boostListingCheckbox = document.getElementById('boostListingCheckbox');
    const priorityMessagingCheckbox = document.getElementById('priorityMessagingCheckbox');
    const autoRenewCheckbox = document.getElementById('autoRenewCheckbox');
    const verifiedBadgeCheckbox = document.getElementById('verifiedBadgeCheckbox');
    const alertPoorPerformance = document.getElementById('alertPoorPerformance');
    const alertTrending = document.getElementById('alertTrending');
    const autoPublishBulk = document.getElementById('autoPublishBulk');
    const scheduleBulk = document.getElementById('scheduleBulk');
    
    if (featuredListingCheckbox) featuredListingCheckbox.checked = false;
    if (boostListingCheckbox) boostListingCheckbox.checked = false;
    if (priorityMessagingCheckbox) priorityMessagingCheckbox.checked = false;
    if (autoRenewCheckbox) autoRenewCheckbox.checked = false;
    if (verifiedBadgeCheckbox) verifiedBadgeCheckbox.checked = false;
    if (alertPoorPerformance) alertPoorPerformance.checked = false;
    if (alertTrending) alertTrending.checked = false;
    if (autoPublishBulk) autoPublishBulk.checked = false;
    if (scheduleBulk) scheduleBulk.checked = false;
    
    selectedAvailability = AVAILABILITY.FREE;
    selectedTrustCircle = TRUST_CIRCLES.FRIENDS;
    selectedTemplate = TEMPLATE_TYPES.BASIC;
    selectedMoodContext = MOOD_CONTEXTS.BROWSE;
    selectedDuration = '7d';
    selectedSchedule = 'daily';
    selectedDigitalFile = null;
    selectedVideoIntro = null;
    
    const freeAvailability = document.querySelector('.availability-option[data-availability="free"]');
    const friendsCircle = document.querySelector('.circle-option[data-circle="friends"]');
    const basicTemplate = document.querySelector('.template-option[data-template="basic"]');
    const browseMood = document.querySelector('.mood-option[data-mood="browse"]');
    const sevenDayDuration = document.querySelector('.duration-option[data-duration="7d"]');
    
    if (freeAvailability) freeAvailability.classList.add('selected');
    if (friendsCircle) friendsCircle.classList.add('selected');
    if (basicTemplate) basicTemplate.classList.add('selected');
    if (browseMood) browseMood.classList.add('selected');
    if (sevenDayDuration) sevenDayDuration.classList.add('selected');
    
    updatePremiumFeaturesVisibility();
}

/**
 * Update premium features visibility
 */
function updatePremiumFeaturesVisibility() {
    if (isUserPremium()) {
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'block';
        });
        document.querySelectorAll('.premium-option').forEach(option => {
            option.disabled = false;
        });
    } else {
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'none';
        });
    }
}

/**
 * Show analytics modal
 */
function showAnalyticsModal() {
    if (!analyticsModal) return;
    
    analyticsModal.classList.add('active');
    updateAnalyticsDashboard();
}

/**
 * Show premium options modal
 */
function showPremiumOptionsModal() {
    if (!premiumOptionsModal) return;
    
    premiumOptionsModal.classList.add('active');
    const paymentContainer = document.getElementById('paymentContainer');
    if (paymentContainer) paymentContainer.style.display = 'none';
}

/**
 * Show team management modal
 */
function showTeamManagementModal() {
    if (!teamManagementModal) return;
    
    teamManagementModal.classList.add('active');
    renderTeamMembers();
}

/**
 * Show leaderboard modal
 */
function showLeaderboardModal() {
    if (!leaderboardModal) return;
    
    leaderboardModal.classList.add('active');
    renderLeaderboard();
}

/**
 * Show reaction picker
 */
function showReactionPicker(listingId) {
    if (!reactionPickerModal) return;
    
    reactionPickerModal.classList.add('active');
    currentListingId = listingId;
}

/**
 * Publish listing from modal
 */
function publishListingFromModal() {
    const activeTab = document.querySelector('.create-listing-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    
    const price = tabName === 'service' ? 
        document.getElementById('servicePrice')?.value.trim() : 
        document.getElementById('digitalPrice')?.value.trim();
    
    const visibility = selectedTrustCircle || TRUST_CIRCLES.FRIENDS;
    const moodContext = selectedMoodContext || MOOD_CONTEXTS.BROWSE;
    const duration = selectedDuration || '7d';
    const expiresAt = duration === 'event' ? null : new Date(Date.now() + DURATION_OPTIONS[duration]).toISOString();
    
    const customExpiry = document.getElementById('expiryDate')?.value;
    const finalExpiry = customExpiry ? new Date(customExpiry).toISOString() : expiresAt;
    
    const privateNotes = document.getElementById('sellerNotes')?.value.trim() || '';
    const teamNotes = document.getElementById('teamNotes')?.value.trim() || '';
    
    let allowedGroups = [];
    let allowedUsers = [];
    
    if (visibility === TRUST_CIRCLES.GROUPS) {
        allowedGroups = Array.from(document.querySelectorAll('#groupsList .circle-option.selected'))
            .map(opt => opt.dataset.groupId);
    } else if (visibility === TRUST_CIRCLES.SELECTED || visibility === TRUST_CIRCLES.MICRO) {
        allowedUsers = Array.from(document.querySelectorAll('#peopleList .circle-option.selected'))
            .map(opt => opt.dataset.friendId);
    }
    
    const visibilityStart = document.getElementById('visibilityStart')?.value;
    const visibilityEnd = document.getElementById('visibilityEnd')?.value;
    const visibilitySchedule = (visibilityStart && visibilityEnd) ? {
        start: new Date(visibilityStart).toISOString(),
        end: new Date(visibilityEnd).toISOString()
    } : null;
    
    switch (tabName) {
        case 'service':
            const serviceTitle = document.getElementById('serviceTitle')?.value.trim();
            const serviceDescription = document.getElementById('serviceDescription')?.value.trim();
            
            if (!serviceTitle) {
                showNotification('Please enter a service title', 'error');
                return;
            }
            
            const serviceData = {
                title: serviceTitle,
                description: serviceDescription || '',
                price: price || '',
                availability: selectedAvailability || AVAILABILITY.FREE,
                visibility: visibility,
                moodContext: moodContext,
                template: selectedTemplate || TEMPLATE_TYPES.BASIC,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            const serviceListing = createServiceListing(serviceTitle, serviceDescription || '', serviceData);
            showNotification('Service listing published successfully', 'success');
            updateMyListingsPreview();
            addListingItem(serviceListing);
            updateAvailableListingsCount();
            break;
            
        case 'digital':
            const digitalTitle = document.getElementById('digitalTitle')?.value.trim();
            const digitalDescription = document.getElementById('digitalDescription')?.value.trim();
            
            if (!digitalTitle) {
                showNotification('Please enter an item title', 'error');
                return;
            }
            
            if (!selectedDigitalFile) {
                showNotification('Please upload a digital file', 'error');
                return;
            }
            
            const digitalData = {
                title: digitalTitle,
                description: digitalDescription || '',
                price: price || '',
                visibility: visibility,
                moodContext: moodContext,
                template: selectedTemplate || TEMPLATE_TYPES.BASIC,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            const digitalListing = createDigitalListing(digitalTitle, digitalDescription || '', selectedDigitalFile, digitalData);
            showNotification('Digital listing published successfully', 'success');
            updateMyListingsPreview();
            addListingItem(digitalListing);
            updateAvailableListingsCount();
            break;
            
        default:
            showNotification('Please complete the listing form', 'info');
            return;
    }
    
    if (createListingModal) createListingModal.classList.remove('active');
}

/**
 * Publish premium listing from modal
 */
function publishPremiumListingFromModal() {
    const activeTab = document.querySelector('.create-listing-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    
    const featured = document.getElementById('featuredListingCheckbox')?.checked || false;
    const boosted = document.getElementById('boostListingCheckbox')?.checked || false;
    const priorityMessaging = document.getElementById('priorityMessagingCheckbox')?.checked || false;
    const autoRenew = document.getElementById('autoRenewCheckbox')?.checked || false;
    const verified = document.getElementById('verifiedBadgeCheckbox')?.checked || false;
    const acceptsTips = true;
    
    const price = tabName === 'service' ? 
        document.getElementById('serviceTitle')?.value.trim() : 
        document.getElementById('digitalTitle')?.value.trim();
    
    const visibility = selectedTrustCircle || TRUST_CIRCLES.FRIENDS;
    const moodContext = selectedMoodContext || MOOD_CONTEXTS.BROWSE;
    const duration = selectedDuration || '7d';
    const expiresAt = duration === 'event' ? null : new Date(Date.now() + DURATION_OPTIONS[duration]).toISOString();
    
    const customExpiry = document.getElementById('expiryDate')?.value;
    const finalExpiry = customExpiry ? new Date(customExpiry).toISOString() : expiresAt;
    
    const privateNotes = document.getElementById('sellerNotes')?.value.trim() || '';
    const teamNotes = document.getElementById('teamNotes')?.value.trim() || '';
    
    const template = selectedTemplate || TEMPLATE_TYPES.BASIC;
    const templateColor = document.getElementById('templatePrimaryColor')?.value || '#0084ff';
    const templateFont = document.getElementById('templateFont')?.value || 'Default';
    
    const schedule = selectedSchedule || 'daily';
    
    let allowedGroups = [];
    let allowedUsers = [];
    
    if (visibility === TRUST_CIRCLES.GROUPS) {
        allowedGroups = Array.from(document.querySelectorAll('#groupsList .circle-option.selected'))
            .map(opt => opt.dataset.groupId);
    } else if (visibility === TRUST_CIRCLES.SELECTED || visibility === TRUST_CIRCLES.MICRO) {
        allowedUsers = Array.from(document.querySelectorAll('#peopleList .circle-option.selected'))
            .map(opt => opt.dataset.friendId);
    }
    
    const visibilityStart = document.getElementById('visibilityStart')?.value;
    const visibilityEnd = document.getElementById('visibilityEnd')?.value;
    const visibilitySchedule = (visibilityStart && visibilityEnd) ? {
        start: new Date(visibilityStart).toISOString(),
        end: new Date(visibilityEnd).toISOString()
    } : null;
    
    let teamMembersList = [];
    if (userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team')) {
        teamMembersList = teamMembers.map(member => ({
            id: member.id,
            role: member.role || 'member'
        }));
    }
    
    switch (tabName) {
        case 'service':
            const serviceTitle = document.getElementById('serviceTitle')?.value.trim();
            const serviceDescription = document.getElementById('serviceDescription')?.value.trim();
            
            if (!serviceTitle) {
                showNotification('Please enter a service title', 'error');
                return;
            }
            
            const premiumServiceData = {
                title: serviceTitle,
                description: serviceDescription || '',
                price: price || '',
                availability: selectedAvailability || AVAILABILITY.FREE,
                visibility: visibility,
                moodContext: moodContext,
                template: template,
                templateSettings: {
                    color: templateColor,
                    font: templateFont
                },
                featured: featured,
                boosted: boosted,
                priorityMessaging: priorityMessaging,
                verified: verified,
                acceptsTips: acceptsTips,
                autoRenew: autoRenew,
                videoIntro: selectedVideoIntro?.url,
                teamMembers: teamMembersList,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                recurringPromotions: featured ? schedule : null,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            const premiumServiceListing = createPremiumServiceListing(serviceTitle, serviceDescription || '', premiumServiceData);
            showNotification('Premium service listing published successfully', 'success');
            updateMyListingsPreview();
            addListingItem(premiumServiceListing);
            updateAvailableListingsCount();
            break;
            
        case 'digital':
            const digitalTitle = document.getElementById('digitalTitle')?.value.trim();
            const digitalDescription = document.getElementById('digitalDescription')?.value.trim();
            
            if (!digitalTitle) {
                showNotification('Please enter an item title', 'error');
                return;
            }
            
            if (!selectedDigitalFile) {
                showNotification('Please upload a digital file', 'error');
                return;
            }
            
            const premiumDigitalData = {
                title: digitalTitle,
                description: digitalDescription || '',
                price: price || '',
                visibility: visibility,
                moodContext: moodContext,
                template: template,
                templateSettings: {
                    color: templateColor,
                    font: templateFont
                },
                featured: featured,
                boosted: boosted,
                priorityMessaging: priorityMessaging,
                verified: verified,
                acceptsTips: acceptsTips,
                autoRenew: autoRenew,
                arPreview: true,
                videoIntro: selectedVideoIntro?.url,
                teamMembers: teamMembersList,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                recurringPromotions: featured ? schedule : null,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            const premiumDigitalListing = createPremiumDigitalListing(digitalTitle, digitalDescription || '', selectedDigitalFile, premiumDigitalData);
            showNotification('Premium digital listing published successfully', 'success');
            updateMyListingsPreview();
            addListingItem(premiumDigitalListing);
            updateAvailableListingsCount();
            break;
            
        default:
            showNotification('Please complete the premium listing form', 'info');
            return;
    }
    
    if (createListingModal) createListingModal.classList.remove('active');
}

/**
 * Save current as draft
 */
function saveCurrentAsDraft() {
    const activeTab = document.querySelector('.create-listing-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    let draftData = {};
    
    switch (tabName) {
        case 'service':
            const serviceTitle = document.getElementById('serviceTitle')?.value.trim();
            const serviceDescription = document.getElementById('serviceDescription')?.value.trim();
            
            if (!serviceTitle) {
                showNotification('No service to save as draft', 'warning');
                return;
            }
            
            draftData = {
                type: 'service',
                title: serviceTitle,
                description: serviceDescription || '',
                price: document.getElementById('servicePrice')?.value.trim() || '',
                availability: selectedAvailability,
                visibility: selectedTrustCircle,
                moodContext: selectedMoodContext,
                template: selectedTemplate,
                duration: selectedDuration
            };
            break;
            
        case 'digital':
            const digitalTitle = document.getElementById('digitalTitle')?.value.trim();
            const digitalDescription = document.getElementById('digitalDescription')?.value.trim();
            
            if (!digitalTitle) {
                showNotification('No digital item to save as draft', 'warning');
                return;
            }
            
            draftData = {
                type: 'digital',
                title: digitalTitle,
                description: digitalDescription || '',
                price: document.getElementById('digitalPrice')?.value.trim() || '',
                file: selectedDigitalFile,
                visibility: selectedTrustCircle,
                moodContext: selectedMoodContext,
                template: selectedTemplate,
                duration: selectedDuration
            };
            break;
            
        case 'premium':
            const premiumTitle = document.getElementById('serviceTitle')?.value.trim() || document.getElementById('digitalTitle')?.value.trim();
            
            if (!premiumTitle) {
                showNotification('No premium listing to save as draft', 'warning');
                return;
            }
            
            draftData = {
                type: 'premium',
                title: premiumTitle,
                featured: document.getElementById('featuredListingCheckbox')?.checked || false,
                boosted: document.getElementById('boostListingCheckbox')?.checked || false,
                verified: document.getElementById('verifiedBadgeCheckbox')?.checked || false,
                autoRenew: document.getElementById('autoRenewCheckbox')?.checked || false,
                videoIntro: selectedVideoIntro,
                visibility: selectedTrustCircle,
                duration: selectedDuration
            };
            break;
            
        default:
            showNotification('Cannot save draft from this tab', 'warning');
            return;
    }
    
    draftData.privateNotes = document.getElementById('sellerNotes')?.value.trim() || '';
    draftData.teamNotes = document.getElementById('teamNotes')?.value.trim() || '';
    draftData.savedAt = new Date().toISOString();
    draftData.id = 'draft_' + Date.now();
    
    offlineDrafts.unshift(draftData);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
    
    showNotification('Draft saved', 'success');
}

/**
 * Show payment form
 */
function showPaymentForm(plan) {
    const paymentContainer = document.getElementById('paymentContainer');
    if (paymentContainer) {
        paymentContainer.style.display = 'block';
        selectedPlan = plan;
    }
}

/**
 * Show payment form for method
 */
function showPaymentFormForMethod(method) {
    const cardPaymentForm = document.getElementById('cardPaymentForm');
    if (cardPaymentForm) cardPaymentForm.style.display = 'none';
    
    if (method === 'card') {
        if (cardPaymentForm) cardPaymentForm.style.display = 'block';
    }
}

/**
 * Invite team member action (renamed to avoid conflict)
 */
async function inviteTeamMemberAction() {
    const email = prompt('Enter team member email:');
    if (!email) return;
    
    try {
        await inviteTeamMember(email);
        showNotification('Invitation sent successfully', 'success');
        
    } catch (error) {
        console.error('[Tool-ui.js] Invitation failed:', error);
        showNotification('Invitation failed', 'error');
    }
}

/**
 * Save team changes
 */
async function saveTeamChanges() {
    try {
        const roleChanges = [];
        document.querySelectorAll('select[data-member-id]').forEach(select => {
            roleChanges.push({
                memberId: select.dataset.memberId,
                role: select.value
            });
        });
        
        await updateTeamMemberRole(roleChanges);
        showNotification('Team updated successfully', 'success');
        if (teamManagementModal) teamManagementModal.classList.remove('active');
        
    } catch (error) {
        console.error('[Tool-ui.js] Team update failed:', error);
        showNotification('Team update failed', 'error');
    }
}

/**
 * Add reaction
 */
async function addReaction(listingId, reaction) {
    try {
        const response = await fetch(`/api/marketplace/listings/${listingId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reaction: reaction,
                premium: reaction.length > 2
            })
        });
        
        if (response.ok) {
            showNotification('Reaction added!', 'success');
            if (reactionPickerModal) reactionPickerModal.classList.remove('active');
        } else {
            showNotification('Failed to add reaction', 'error');
        }
        
    } catch (error) {
        console.error('[Tool-ui.js] Reaction failed:', error);
        showNotification('Failed to add reaction', 'error');
    }
}

/**
 * Setup backup restore buttons
 */
function setupBackupRestoreButtons() {
    if (isUserPremium()) {
        const actionsContainer = document.querySelector('.my-listings-actions');
        if (actionsContainer) {
            if (!document.getElementById('backupDataBtn')) {
                const backupBtn = document.createElement('button');
                backupBtn.className = 'my-listing-action-btn secondary';
                backupBtn.id = 'backupDataBtn';
                backupBtn.innerHTML = '<i class="fas fa-download"></i> Backup';
                backupBtn.addEventListener('click', backupMarketplaceData);
                actionsContainer.appendChild(backupBtn);
            }
            
            if (!document.getElementById('restoreDataBtn')) {
                const restoreBtn = document.createElement('button');
                restoreBtn.className = 'my-listing-action-btn secondary';
                restoreBtn.id = 'restoreDataBtn';
                restoreBtn.innerHTML = '<i class="fas fa-upload"></i> Restore';
                restoreBtn.addEventListener('click', () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.addEventListener('change', (e) => {
                        if (e.target.files.length > 0) {
                            restoreMarketplaceData(e.target.files[0]);
                        }
                    });
                    input.click();
                });
                actionsContainer.appendChild(restoreBtn);
            }
        }
    }
}

/**
 * Render premium listings
 */
function renderPremiumListings() {
    const premiumListings = allListings.filter(listing => 
        listing.premium === true && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(premiumListings, 'No premium listings found');
}

/**
 * Render spotlight tab
 */
function renderSpotlightTab() {
    const spotlightListings = allListings.filter(listing => 
        listing.featured === true && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(spotlightListings, 'No featured listings found');
}

/**
 * Render services list
 */
function renderServicesList() {
    const serviceListings = allListings.filter(listing => 
        listing.type === LISTING_TYPES.SERVICE && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(serviceListings, 'No services found');
}

/**
 * Render digital list
 */
function renderDigitalList() {
    const digitalListings = allListings.filter(listing => 
        listing.type === LISTING_TYPES.DIGITAL && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(digitalListings, 'No digital items found');
}

/**
 * Render friends listings
 */
function renderFriendsListings() {
    const friendIds = userFriends.map(friend => friend.id);
    const friendListings = allListings.filter(listing => 
        friendIds.includes(listing.userId) &&
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(friendListings, 'No friend listings found');
}

/**
 * Render group listings
 */
function renderGroupListings() {
    const groupListings = allListings.filter(listing => 
        listing.visibility === TRUST_CIRCLES.GROUPS &&
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(groupListings, 'No group listings found');
}

/**
 * Render my listings
 */
function renderMyListings() {
    const myActiveListings = myListings.filter(listing => !isListingExpired(listing));
    renderFilteredListings(myActiveListings, 'You have no active listings');
}

/**
 * Render filtered listings
 */
function renderFilteredListings(listings, emptyMessage) {
    if (!marketplaceListContent) return;
    
    marketplaceListContent.innerHTML = '';
    
    if (listings.length === 0) {
        marketplaceListContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>${emptyMessage}</p>
                <p class="subtext">Try a different category or create your own listing</p>
            </div>
        `;
        return;
    }
    
    listings.forEach(listing => {
        addListingItem(listing);
    });
}

/**
 * Utility functions for missing features
 */
function saveToSavedItems(listingId) {
    const listing = allListings.find(l => l.id === listingId);
    if (listing && !savedItems.find(item => item.id === listingId)) {
        savedItems.push(listing);
        saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
        showNotification('Listing saved', 'success');
    }
}

function showAddNoteDialog(listingId) {
    const note = prompt('Add a private note for this listing:');
    if (note) {
        privateNotes.push({
            listingId: listingId,
            note: note,
            createdAt: new Date().toISOString()
        });
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
        showNotification('Note added', 'success');
    }
}

function showDetailMenu() {
    const menuItems = [
        'Report Listing',
        'Block User',
        'Copy Link',
        'Open in Browser'
    ];
    
    const selected = prompt('Select action:\n' + menuItems.map((item, i) => `${i + 1}. ${item}`).join('\n'));
    if (selected) {
        const index = parseInt(selected) - 1;
        if (index >= 0 && index < menuItems.length) {
            if (index === 2) {
                navigator.clipboard.writeText(window.location.href);
                showNotification('Link copied to clipboard', 'success');
            } else {
                showNotification(`Action: ${menuItems[index]}`, 'info');
            }
        }
    }
}

function reserveListing(listingId) {
    showNotification('Listing reserved - you will be notified when available', 'success');
}

function shareListing(listing) {
    if (navigator.share) {
        navigator.share({
            title: listing.title,
            text: listing.description,
            url: window.location.href + '?listing=' + listing.id
        });
    } else {
        navigator.clipboard.writeText(window.location.href + '?listing=' + listing.id);
        showNotification('Link copied to clipboard', 'success');
    }
}

function clearMoodFilter() {
    currentMoodFilter = null;
    localStorage.removeItem(LOCAL_STORAGE_KEYS.MOOD_FILTER);
    updateMoodFilterIndicator();
    renderMarketplaceList();
    showNotification('Mood filter cleared', 'info');
}

function showSavedItemsModal() {
    if (!savedItemsModal) return;
    
    savedItemsModal.classList.add('active');
    const savedItemsGrid = document.getElementById('savedItemsGrid');
    if (savedItemsGrid) {
        savedItemsGrid.innerHTML = '';
        
        if (savedItems.length === 0) {
            savedItemsGrid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-bookmark" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No saved items yet</p>
                    <p style="font-size: 14px; margin-top: 10px;">Save listings you're interested in</p>
                </div>
            `;
            return;
        }
        
        savedItems.forEach(item => {
            const savedItem = document.createElement('div');
            savedItem.className = 'saved-item';
            savedItem.innerHTML = `
                <div style="font-weight: 500;">${escapeHtml(item.title)}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
                    ${formatTimeAgo(new Date(item.createdAt))}
                </div>
            `;
            savedItem.addEventListener('click', () => {
                viewListingDetail(item);
                savedItemsModal.classList.remove('active');
            });
            savedItemsGrid.appendChild(savedItem);
        });
    }
    
    const clearSavedBtn = document.getElementById('clearSavedBtn');
    if (clearSavedBtn) {
        clearSavedBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all saved items?')) {
                savedItems = [];
                saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
                showSavedItemsModal();
                showNotification('All saved items cleared', 'success');
            }
        });
    }
}

function showMyNotesModal() {
    if (!myNotesModal) return;
    
    myNotesModal.classList.add('active');
    const myNotesList = document.getElementById('myNotesList');
    if (myNotesList) {
        myNotesList.innerHTML = '';
        
        if (privateNotes.length === 0) {
            myNotesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-sticky-note" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No notes yet</p>
                    <p style="font-size: 14px; margin-top: 10px;">Add private notes to listings</p>
                </div>
            `;
            return;
        }
        
        privateNotes.forEach(note => {
            const noteItem = document.createElement('div');
            noteItem.className = 'note-item';
            noteItem.innerHTML = `
                <div style="font-weight: 500;">${escapeHtml(note.note.substring(0, 50))}${note.note.length > 50 ? '...' : ''}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
                    ${formatTimeAgo(new Date(note.createdAt))}
                </div>
            `;
            myNotesList.appendChild(noteItem);
        });
    }
    
    const addNewNoteBtn = document.getElementById('addNewNoteBtn');
    if (addNewNoteBtn) {
        addNewNoteBtn.addEventListener('click', () => {
            const note = prompt('Enter your private note:');
            if (note) {
                privateNotes.unshift({
                    note: note,
                    createdAt: new Date().toISOString()
                });
                saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
                showMyNotesModal();
                showNotification('Note added', 'success');
            }
        });
    }
}

/**
 * Initialize UI components
 */
function initializeUIComponents() {
    // Initialize analytics chart
    if (typeof Chart !== 'undefined') {
        initializeAnalyticsChart();
    }
    
    // Generate heatmap
    generateHeatmap();
    
    // Render initial listings
    renderMarketplaceList();
    updateAvailableListingsCount();
}