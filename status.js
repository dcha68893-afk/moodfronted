// ==================== STATUS.JS ====================
// Complete WhatsApp-like Status Features with ALL WhatsApp functionality

// Global Status Variables
window.currentStatusMedia = null;
let statusViewerListener = null;
let statusReactionListener = null;
let statusUpdateInterval = null;
let currentStatusViewing = null;
let statusProgressInterval = null;
let currentStatusIndex = 0;
let statusViewerTimeout = null;
let emojiPickerOpen = false;
let statusDrafts = [];
let statusHighlights = [];
let statusArchive = [];

// User Status Preferences
window.statusPreferences = {
    privacy: 'myContacts', // myContacts, selectedContacts, everyone, contactsExcept, hideFrom
    mutedUsers: [],
    recentViews: [],
    blockedFromViewing: [],
    hideFromUsers: [],
    contactsExcept: [],
    readReceipts: true,
    allowReplies: true,
    autoDownload: true,
    screenshotAlerts: true,
    contentBlur: false,
    saveToGallery: false,
    showMusicInfo: true,
    awayMessage: ''
};

// Status creation draft
window.statusDraft = {
    type: 'text',
    content: '',
    caption: '',
    background: 'default',
    font: 'default',
    color: '#000000',
    stickers: [],
    gifs: [],
    drawings: [],
    overlays: [],
    mentions: [],
    location: null,
    music: null,
    linkPreview: null,
    scheduleTime: null,
    privacy: 'myContacts',
    selectedContacts: [],
    hideFrom: [],
    exceptContacts: []
};

// Initialize Status System
function initStatusSystem() {
    console.log('🚀 Initializing WhatsApp-like Status System...');
    
    // Load user preferences
    loadStatusPreferences();
    
    // Setup all status event listeners
    setupStatusEventListeners();
    setupStatusFileHandlers();
    setupStatusModalListeners();
    setupEmojiPicker();
    
    // Load initial status updates
    loadStatusUpdates();
    
    // Start real-time status updates
    startRealTimeStatusUpdates();
    
    // Start status expiration checker
    startStatusExpirationChecker();
    
    // Load drafts and highlights
    loadStatusDrafts();
    loadStatusHighlights();
    
    // Start background processing
    startBackgroundProcessing();
    
    console.log('✅ Status system initialized successfully');
}

// ==================== STATUS PREFERENCES ====================

async function loadStatusPreferences() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            window.statusPreferences = {
                privacy: userData.statusPrivacy || 'myContacts',
                mutedUsers: userData.mutedStatusUsers || [],
                recentViews: userData.recentStatusViews || [],
                blockedFromViewing: userData.blockedFromStatus || [],
                hideFromUsers: userData.hideStatusFrom || [],
                contactsExcept: userData.contactsExcept || [],
                readReceipts: userData.statusReadReceipts !== false,
                allowReplies: userData.allowStatusReplies !== false,
                autoDownload: userData.autoDownloadStatus !== false,
                screenshotAlerts: userData.screenshotAlerts !== false,
                contentBlur: userData.contentBlur || false,
                saveToGallery: userData.saveStatusToGallery || false,
                showMusicInfo: userData.showMusicInfo !== false,
                awayMessage: userData.statusAwayMessage || '',
                businessCTAs: userData.businessCTAs || [],
                linkInBio: userData.linkInBio || '',
                quickReplies: userData.quickReplies || []
            };
        }
    } catch (error) {
        console.error('Error loading status preferences:', error);
    }
}

async function updateStatusPrivacy(privacy, selectedContacts = [], hideFrom = [], exceptContacts = []) {
    try {
        const updates = {
            statusPrivacy: privacy,
            statusPrivacyUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (privacy === 'selectedContacts') {
            updates.statusSelectedContacts = selectedContacts;
        } else if (privacy === 'contactsExcept') {
            updates.contactsExcept = exceptContacts;
        } else if (privacy === 'hideFrom') {
            updates.hideStatusFrom = hideFrom;
        }
        
        await db.collection('users').doc(currentUser.uid).update(updates);
        
        window.statusPreferences.privacy = privacy;
        if (privacy === 'selectedContacts') {
            window.statusPreferences.selectedContacts = selectedContacts;
        } else if (privacy === 'contactsExcept') {
            window.statusPreferences.contactsExcept = exceptContacts;
        } else if (privacy === 'hideFrom') {
            window.statusPreferences.hideFromUsers = hideFrom;
        }
        
        showToast(`Status privacy updated to ${getPrivacyLabel(privacy)}`, 'success');
    } catch (error) {
        console.error('Error updating status privacy:', error);
        showToast('Error updating privacy', 'error');
    }
}

function getPrivacyLabel(privacy) {
    const labels = {
        'myContacts': 'My contacts',
        'selectedContacts': 'Selected contacts',
        'everyone': 'Everyone',
        'contactsExcept': 'Contacts except...',
        'hideFrom': 'Hide from...'
    };
    return labels[privacy] || privacy;
}

// ==================== STATUS EXPIRATION ====================

function startStatusExpirationChecker() {
    // Check for expired statuses every 30 seconds
    statusUpdateInterval = setInterval(() => {
        removeExpiredStatuses();
        updateStatusRemainingTimes();
    }, 30000);
}

async function removeExpiredStatuses() {
    try {
        const now = new Date();
        
        // Find expired statuses
        const expiredSnapshot = await db.collection('statuses')
            .where('userId', '==', currentUser.uid)
            .where('expiresAt', '<=', now)
            .get();
        
        if (!expiredSnapshot.empty) {
            const batch = db.batch();
            expiredSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            
            // Also delete associated views and reactions
            for (const doc of expiredSnapshot.docs) {
                await cleanupStatusData(doc.id);
            }
            
            // Refresh status list
            loadStatusUpdates();
        }
    } catch (error) {
        console.error('Error removing expired statuses:', error);
    }
}

async function updateStatusRemainingTimes() {
    try {
        // This function updates UI with remaining time for statuses
        const statusItems = document.querySelectorAll('.status-item');
        
        statusItems.forEach(item => {
            const timeElement = item.querySelector('.status-time');
            const statusId = item.dataset.statusId;
            
            if (timeElement && statusId) {
                // For demo purposes, we'll just update the text
                // In a real implementation, you would fetch the status data
                // and calculate remaining time
                timeElement.textContent = 'Active';
            }
        });
    } catch (error) {
        console.error('Error updating remaining times:', error);
    }
}

async function cleanupStatusData(statusId) {
    try {
        // Delete views
        const viewsSnapshot = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .get();
        
        if (!viewsSnapshot.empty) {
            const batch = db.batch();
            viewsSnapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        
        // Delete reactions
        await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .get()
            .then(snapshot => {
                const batch = db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                return batch.commit();
            });
        
        // Delete replies
        await db.collection('messages')
            .where('isStatusReply', '==', true)
            .where('originalStatusId', '==', statusId)
            .get()
            .then(snapshot => {
                const batch = db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                return batch.commit();
            });
        
    } catch (error) {
        console.error('Error cleaning up status data:', error);
    }
}

// ==================== REAL-TIME STATUS UPDATES ====================

function startRealTimeStatusUpdates() {
    console.log('Starting real-time status updates...');
    
    // Listen for new statuses from contacts
    const contactIds = getContactIds();
    
    if (contactIds.length > 0) {
        // Listen for new statuses
        db.collection('statuses')
            .where('userId', 'in', contactIds)
            .where('expiresAt', '>', new Date())
            .orderBy('expiresAt', 'desc')  // Already correct
            .limit(20)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        console.log('New status added:', change.doc.id);
                        loadStatusUpdates();
                        
                        // Show notification for new status (if not muted)
                        const statusData = change.doc.data();
                        if (!isUserMuted(statusData.userId)) {
                            showNewStatusNotification(statusData);
                        }
                    } else if (change.type === 'modified') {
                        // Update view count or reactions in real-time
                        updateStatusInUI(change.doc.id, change.doc.data());
                    } else if (change.type === 'removed') {
                        removeStatusFromUI(change.doc.id);
                    }
                });
            }, error => {
                console.error('Error listening to status updates:', error);
            });
    }
}

function getContactIds() {
    // Get IDs of users whose statuses we can see
    const contactIds = [];
    
    if (friends && friends.length > 0) {
        friends.forEach(friend => {
            if (friend.id && !window.statusPreferences.blockedFromViewing.includes(friend.id)) {
                contactIds.push(friend.id);
            }
        });
    }
    
    return contactIds;
}

function isUserMuted(userId) {
    return window.statusPreferences.mutedUsers.includes(userId);
}

function showNewStatusNotification(status) {
    // Only show if user is not currently viewing statuses
    if (document.getElementById('statusViewer') && 
        !document.getElementById('statusViewer').classList.contains('hidden')) {
        return;
    }
    
    const notification = document.createElement('div');
    notification.className = 'status-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <img src="${status.userPhotoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(status.userDisplayName)}&background=7C3AED&color=fff`}" 
                 class="notification-avatar">
            <div class="notification-text">
                <strong>${status.userDisplayName}</strong>
                <span>posted a new status</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
    
    // Click to view
    notification.addEventListener('click', () => {
        loadUserStatuses(status.userId);
        notification.remove();
    });
}

// ==================== STATUS LOADING & DISPLAY ====================

function loadStatusUpdates() {
    const statusUpdates = document.getElementById('statusUpdates');
    if (!statusUpdates) return;
    
    statusUpdates.innerHTML = `
        <div class="loading-statuses">
            <div class="loading-spinner"></div>
            <p>Loading status updates...</p>
        </div>
    `;
    
    // Load statuses in batches
    Promise.all([
        loadMyStatuses(),
        loadRecentStatuses(),
        loadViewedStatuses()
    ]).then(([myStatuses, recentStatuses, viewedStatuses]) => {
        renderStatusList(myStatuses, recentStatuses, viewedStatuses);
    }).catch(error => {
        console.error('Error loading status updates:', error);
        showErrorState();
    });
}

async function loadMyStatuses() {
    try {
        const snapshot = await db.collection('statuses')
            .where('userId', '==', currentUser.uid)
            .where('expiresAt', '>', new Date())
            .orderBy('expiresAt')  // Changed from 'timestamp' to 'expiresAt'
            .limit(10)
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            isMine: true
        }));
    } catch (error) {
        console.error('Error loading my statuses:', error);
        return [];
    }
}
async function loadRecentStatuses() {
    const contactIds = getContactIds();
    if (contactIds.length === 0) return [];
    
    try {
        // Get statuses from contacts that haven't been viewed
        const now = new Date();
        const recentStatuses = [];
        
        // Batch queries to avoid Firestore limitations
        for (let i = 0; i < contactIds.length; i += 10) {
            const batch = contactIds.slice(i, i + 10);
            if (batch.length === 0) continue;
            
            const snapshot = await db.collection('statuses')
                .where('userId', 'in', batch)
                .where('expiresAt', '>', now)
                .orderBy('expiresAt')  // Changed from 'timestamp' to 'expiresAt'
                .limit(5)
                .get();
            
            snapshot.forEach(doc => {
                const status = {
                    id: doc.id,
                    ...doc.data(),
                    isMine: false
                };
                
                // Check if already viewed
                db.collection('statusViews')
                    .where('statusId', '==', doc.id) 
                    .where('userId', '==', currentUser.uid)
                    .limit(1)
                    .get()
                    .then(viewSnapshot => {
                        status.hasViewed = !viewSnapshot.empty;
                    });
                
                recentStatuses.push(status);
            });
        }
        
        return recentStatuses;
    } catch (error) {
        console.error('Error loading recent statuses:', error);
        return [];
    }
}

async function loadViewedStatuses() {
    try {
        // Get statuses that have been viewed recently
        const viewedSnapshot = await db.collection('statusViews')
            .where('userId', '==', currentUser.uid)
            .orderBy('viewedAt', 'desc')
            .limit(20)
            .get();
        
        const viewedStatuses = [];
        const statusIds = viewedSnapshot.docs.map(doc => doc.data().statusId);
        
        if (statusIds.length > 0) {
            // Get the actual status data
            const statusPromises = statusIds.map(statusId => 
                db.collection('statuses').doc(statusId).get()
            );
            
            const statusDocs = await Promise.all(statusPromises);
            
            statusDocs.forEach((doc, index) => {
                if (doc.exists) {
                    const status = {
                        id: doc.id,
                        ...doc.data(),
                        isMine: doc.data().userId === currentUser.uid,
                        hasViewed: true,
                        viewedAt: viewedSnapshot.docs[index]?.data()?.viewedAt
                    };
                    viewedStatuses.push(status);
                }
            });
        }
        
        return viewedStatuses;
    } catch (error) {
        console.error('Error loading viewed statuses:', error);
        return [];
    }
}

function renderStatusList(myStatuses, recentStatuses, viewedStatuses) {
    const statusUpdates = document.getElementById('statusUpdates');
    if (!statusUpdates) return;
    
    statusUpdates.innerHTML = '';
    
    // Group statuses by user
    const statusesByUser = new Map();
    
    // Add recent statuses (unseen)
    recentStatuses.forEach(status => {
        if (!status.hasViewed) {
            const userId = status.userId;
            if (!statusesByUser.has(userId)) {
                statusesByUser.set(userId, {
                    user: {
                        id: userId,
                        displayName: status.userDisplayName,
                        photoURL: status.userPhotoURL,
                        isMuted: isUserMuted(userId)
                    },
                    statuses: [],
                    hasUnseen: true
                });
            }
            statusesByUser.get(userId).statuses.push(status);
        }
    });
    
    // Add viewed statuses
    viewedStatuses.forEach(status => {
        const userId = status.userId;
        if (!statusesByUser.has(userId)) {
            statusesByUser.set(userId, {
                user: {
                    id: userId,
                    displayName: status.userDisplayName,
                    photoURL: status.userPhotoURL,
                    isMuted: isUserMuted(userId)
                },
                statuses: [],
                hasUnseen: false
            });
        }
        statusesByUser.get(userId).statuses.push(status);
    });
    
    // Add my statuses
    if (myStatuses.length > 0) {
        statusesByUser.set(currentUser.uid, {
            user: {
                id: currentUser.uid,
                displayName: 'My Status',
                photoURL: currentUserData?.photoURL,
                isMine: true
            },
            statuses: myStatuses,
            hasUnseen: false
        });
    }
    
    // Sort: My status first, then recent unseen, then viewed
    const sortedUsers = Array.from(statusesByUser.entries()).sort((a, b) => {
        // My status first
        if (a[1].user.isMine) return -1;
        if (b[1].user.isMine) return 1;
        
        // Then unseen statuses
        if (a[1].hasUnseen && !b[1].hasUnseen) return -1;
        if (!a[1].hasUnseen && b[1].hasUnseen) return 1;
        
        // Then by most recent status time
        const aLatest = a[1].statuses[0]?.timestamp;
        const bLatest = b[1].statuses[0]?.timestamp;
        return (bLatest?.toDate?.() || 0) - (aLatest?.toDate?.() || 0);
    });
    
    // Create status items
    sortedUsers.forEach(([userId, userData]) => {
        const statusItem = createStatusItem(userData);
        statusUpdates.appendChild(statusItem);
    });
    
    // Add "no statuses" message if empty
    if (sortedUsers.length === 0) {
        statusUpdates.innerHTML = `
            <div class="no-statuses">
                <div class="no-statuses-icon">
                    <i class="fas fa-camera"></i>
                </div>
                <h3>No status updates</h3>
                <p>When your contacts share updates, they'll appear here.</p>
                <button onclick="openStatusCreation()" class="btn-primary">
                    <i class="fas fa-plus"></i> Share a status
                </button>
            </div>
        `;
    }
}

function createStatusItem(userData) {
    const statusItem = document.createElement('div');
    statusItem.className = 'status-item';
    statusItem.dataset.userId = userData.user.id;
        statusItem.dataset.statusId = userData.statuses[0]?.id || '';

    
    const latestStatus = userData.statuses[0];
    const statusCount = userData.statuses.length;
    const timeAgo = formatTimeAgo(latestStatus?.timestamp);
    const isExpired = latestStatus?.expiresAt?.toDate() < new Date();
    
    // Determine ring style
    let ringClass = 'status-ring ';
    if (userData.user.isMine) {
        ringClass += 'status-ring-mine';
    } else if (userData.hasUnseen) {
        ringClass += 'status-ring-unseen';
    } else {
        ringClass += 'status-ring-seen';
    }
    
    // Muted indicator
    const mutedIndicator = userData.user.isMuted ? 
        '<div class="muted-indicator" title="Muted"><i class="fas fa-volume-mute"></i></div>' : '';
    
    statusItem.innerHTML = `
        <div class="status-avatar ${ringClass}">
            <img src="${userData.user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.user.displayName)}&background=7C3AED&color=fff`}" 
                 alt="${userData.user.displayName}">
            ${userData.user.isMine ? 
                '<div class="add-status-icon"><i class="fas fa-plus"></i></div>' : ''}
            ${mutedIndicator}
        </div>
        <div class="status-info">
            <div class="status-header">
                <h4 class="status-name">${userData.user.displayName}</h4>
                <span class="status-time">${timeAgo}</span>
            </div>
            <div class="status-meta">
                <span class="status-count">${statusCount} update${statusCount !== 1 ? 's' : ''}</span>
                ${isExpired ? '<span class="status-expired">• Expired</span>' : ''}
            </div>
        </div>
        <div class="status-actions">
            ${userData.user.isMine ? 
                '<button class="btn-more" onclick="showMyStatusOptions(event)"><i class="fas fa-ellipsis-v"></i></button>' : 
                '<button class="btn-more" onclick="showStatusUserOptions(event, \'' + userData.user.id + '\')"><i class="fas fa-ellipsis-v"></i></button>'
            }
        </div>
    `;
    
    // Add click event
    statusItem.addEventListener('click', (e) => {
        if (!e.target.closest('.status-actions') && !e.target.closest('.btn-more')) {
            openStatusViewer(userData.user.id, userData.statuses);
        }
    });
    
    return statusItem;
}

// ==================== STATUS VIEWER ====================

function openStatusViewer(userId, statuses) {
    if (!statuses || statuses.length === 0) return;
    
    currentStatusViewing = {
        userId: userId,
        statuses: statuses.sort((a, b) => a.timestamp?.toDate?.() - b.timestamp?.toDate?.()),
        currentIndex: 0
    };
    
    showStatusAtIndex(0);
}

function showStatusAtIndex(index) {
    if (!currentStatusViewing || index < 0 || index >= currentStatusViewing.statuses.length) {
        closeStatusViewer();
        return;
    }
    
    currentStatusIndex = index;
    const status = currentStatusViewing.statuses[index];
    
    // Create or update viewer
    let viewer = document.getElementById('statusViewer');
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'statusViewer';
        viewer.className = 'status-viewer';
        document.body.appendChild(viewer);
    }
    
    // Mark as viewed if not the owner
    if (status.userId !== currentUser.uid) {
        markStatusAsViewed(status.id);
    }
    
    // Calculate progress
    const now = new Date();
    const createdAt = status.timestamp?.toDate() || now;
    const expiresAt = status.expiresAt?.toDate() || new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const totalDuration = expiresAt - createdAt;
    const elapsed = now - createdAt;
    const progress = Math.min((elapsed / totalDuration) * 100, 100);
    
    // Create progress bars for all statuses
    const progressBars = currentStatusViewing.statuses.map((s, i) => {
        const sCreatedAt = s.timestamp?.toDate() || now;
        const sExpiresAt = s.expiresAt?.toDate() || new Date(sCreatedAt.getTime() + 24 * 60 * 60 * 1000);
        const sTotalDuration = sExpiresAt - sCreatedAt;
        const sElapsed = now - sCreatedAt;
        const sProgress = i < index ? 100 : (i === index ? Math.min((sElapsed / sTotalDuration) * 100, 100) : 0);
        
        return `
            <div class="progress-track">
                <div class="progress-bar ${i === index ? 'active' : ''}" 
                     style="width: ${sProgress}%"></div>
            </div>
        `;
    }).join('');
    
    viewer.innerHTML = `
        <div class="status-viewer-container">
            <!-- Progress bars -->
            <div class="progress-container">
                ${progressBars}
            </div>
            
            <!-- Header -->
            <div class="viewer-header">
                <div class="viewer-user-info">
                    <img src="${status.userPhotoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(status.userDisplayName)}&background=7C3AED&color=fff`}" 
                         class="viewer-avatar">
                    <div class="viewer-user-details">
                        <h3 class="viewer-username">${status.userDisplayName}</h3>
                        <span class="viewer-time">${formatTimeAgo(status.timestamp)}</span>
                    </div>
                </div>
                <div class="viewer-header-actions">
                    ${status.userId !== currentUser.uid ? `
                        <button class="btn-action" onclick="toggleMuteUser('${status.userId}')" title="Mute">
                            <i class="fas fa-volume-mute"></i>
                        </button>
                        <button class="btn-action" onclick="showStatusUserOptions(event, '${status.userId}')" title="More">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    ` : ''}
                    <button class="btn-close" onclick="closeStatusViewer()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <!-- Content -->
            <div class="viewer-content">
                ${getStatusContentHTML(status)}
                
                <!-- Navigation buttons -->
                <button class="nav-btn prev-btn" onclick="showPrevStatus()">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button class="nav-btn next-btn" onclick="showNextStatus()">
                    <i class="fas fa-chevron-right"></i>
                </button>
                
                <!-- Playback controls for media -->
                ${status.type === 'video' || status.type === 'audio' ? `
                    <div class="media-controls">
                        <button class="play-pause-btn" onclick="toggleMediaPlayback()">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="progress-slider">
                            <input type="range" min="0" max="100" value="0" class="media-progress">
                        </div>
                        <button class="volume-btn" onclick="toggleVolume()">
                            <i class="fas fa-volume-up"></i>
                        </button>
                        <input type="range" min="0" max="100" value="100" class="volume-slider">
                    </div>
                ` : ''}
            </div>
            
            <!-- Footer -->
            <div class="viewer-footer">
                <!-- Caption -->
                ${status.caption ? `
                    <div class="status-caption">
                        <p>${escapeHtml(status.caption)}</p>
                    </div>
                ` : ''}
                
                <!-- Reply section -->
                <div class="reply-section">
                    <div class="emoji-picker-btn" onclick="toggleEmojiPicker()">
                        <i class="far fa-smile"></i>
                    </div>
                    <input type="text" 
                           class="reply-input" 
                           placeholder="Reply..." 
                           id="statusReplyInput"
                           onkeypress="handleReplyKeypress(event, '${status.id}')">
                    <button class="btn-attach" onclick="openMediaReply('${status.id}')">
                        <i class="fas fa-paperclip"></i>
                    </button>
                    <button class="btn-send-reply" onclick="sendStatusReply('${status.id}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                    <button class="btn-action-reply" onclick="showReplyOptions('${status.id}')">
                        <i class="fas fa-ellipsis-h"></i>
                    </button>
                </div>
                
                <!-- Action buttons -->
                <div class="action-buttons">
                    <button class="btn-action" onclick="shareStatus('${status.id}')" title="Share">
                        <i class="fas fa-share"></i>
                    </button>
                    <button class="btn-action" onclick="likeStatus('${status.id}')" title="Like">
                        <i class="far fa-heart"></i>
                    </button>
                    <button class="btn-action" onclick="showStatusReactions('${status.id}')" title="Reactions">
                        <i class="far fa-smile"></i>
                    </button>
                    <button class="btn-action" onclick="saveStatus('${status.id}')" title="Save">
                        <i class="far fa-bookmark"></i>
                    </button>
                    <button class="btn-action" onclick="showViewersList('${status.id}')" title="Viewers">
                        <i class="far fa-eye"></i>
                        <span id="viewCount-${status.id}" class="view-count">${status.viewCount || 0}</span>
                    </button>
                    ${status.userId === currentUser.uid ? `
                        <button class="btn-action" onclick="showStatusAnalytics('${status.id}')" title="Analytics">
                            <i class="fas fa-chart-bar"></i>
                        </button>
                        <button class="btn-action" onclick="deleteStatus('${status.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : `
                        <button class="btn-action" onclick="callUser('${status.userId}')" title="Call">
                            <i class="fas fa-phone"></i>
                        </button>
                        <button class="btn-action" onclick="messageUser('${status.userId}')" title="Message">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button class="btn-action" onclick="reportStatus('${status.id}')" title="Report">
                            <i class="fas fa-flag"></i>
                        </button>
                    `}
                </div>
                
                <!-- Business CTA -->
                ${status.businessCTA ? `
                    <div class="business-cta">
                        <button class="btn-cta" onclick="${status.businessCTA.action}">
                            ${status.businessCTA.text}
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <!-- Emoji Picker -->
        <div id="emojiPickerContainer" class="emoji-picker-container hidden">
            <div class="emoji-picker">
                <div class="emoji-categories">
                    <button class="emoji-category active" data-category="recent">🕐</button>
                    <button class="emoji-category" data-category="smileys">😀</button>
                    <button class="emoji-category" data-category="hearts">❤️</button>
                    <button class="emoji-category" data-category="hands">👏</button>
                    <button class="emoji-category" data-category="animals">🐶</button>
                    <button class="emoji-category" data-category="food">🍕</button>
                </div>
                <div class="emoji-grid" id="emojiGrid">
                    <!-- Emojis will be populated here -->
                </div>
            </div>
        </div>
    `;
    
    // Start progress timer
    startStatusProgressTimer(status);
    
    // Load emojis
    loadEmojis();
    
    // Load real-time updates
    setupStatusRealtimeUpdates(status.id);
    
    // Setup media playback if needed
    if (status.type === 'video' || status.type === 'audio') {
        setupMediaPlayback(status);
    }
}

function startStatusProgressTimer(status) {
    // Clear any existing timer
    if (statusProgressInterval) {
        clearInterval(statusProgressInterval);
    }
    
    // Calculate time until next status should advance
    const now = new Date();
    const expiresAt = status.expiresAt?.toDate() || new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const timeRemaining = expiresAt - now;
    const advanceTime = Math.min(timeRemaining, 10000); // Max 10 seconds per status
    
    // Set timer to advance to next status
    statusViewerTimeout = setTimeout(() => {
        showNextStatus();
    }, advanceTime);
    
    // Update progress bar every second
    statusProgressInterval = setInterval(() => {
        updateProgressBar();
    }, 1000);
}

function updateProgressBar() {
    const progressBar = document.querySelector('.progress-bar.active');
    if (progressBar) {
        const currentWidth = parseFloat(progressBar.style.width) || 0;
        const increment = 100 / (24 * 60 * 60); // 24 hours in seconds
        progressBar.style.width = `${Math.min(currentWidth + increment, 100)}%`;
    }
}

function showNextStatus() {
    if (!currentStatusViewing) return;
    
    const nextIndex = currentStatusIndex + 1;
    if (nextIndex < currentStatusViewing.statuses.length) {
        showStatusAtIndex(nextIndex);
    } else {
        // Try to load next user's statuses
        loadNextUserStatuses();
    }
}

function showPrevStatus() {
    if (!currentStatusViewing) return;
    
    const prevIndex = currentStatusIndex - 1;
    if (prevIndex >= 0) {
        showStatusAtIndex(prevIndex);
    }
}

function closeStatusViewer() {
    const viewer = document.getElementById('statusViewer');
    if (viewer) {
        viewer.remove();
    }
    
    // Clear timers
    if (statusProgressInterval) {
        clearInterval(statusProgressInterval);
        statusProgressInterval = null;
    }
    
    if (statusViewerTimeout) {
        clearTimeout(statusViewerTimeout);
        statusViewerTimeout = null;
    }
    
    // Clean up listeners
    if (statusViewerListener) {
        statusViewerListener();
        statusViewerListener = null;
    }
    
    currentStatusViewing = null;
    currentStatusIndex = 0;
    
    // Reload status list to update viewed indicators
    loadStatusUpdates();
}

// ==================== STATUS INTERACTIONS ====================

async function markStatusAsViewed(statusId) {
    try {
        // Check if already viewed
        const existingView = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!existingView.empty) return;
        
        // Add view
        await db.collection('statusViews').add({
            statusId: statusId,
            userId: currentUser.uid,
            userDisplayName: currentUserData?.displayName,
            userPhotoURL: currentUserData?.photoURL,
            viewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            screenshot: false // Will be updated if screenshot detected
        });
        
        // Update view count
        await db.collection('statuses').doc(statusId).update({
            viewCount: firebase.firestore.FieldValue.increment(1),
            lastViewedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update recent views in user preferences
        await updateRecentViews(statusId);
        
    } catch (error) {
        console.error('Error marking status as viewed:', error);
    }
}

async function updateRecentViews(statusId) {
    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        await userRef.update({
            recentStatusViews: firebase.firestore.FieldValue.arrayUnion(statusId)
        });
        
        // Keep only last 50 recent views
        const userDoc = await userRef.get();
        const recentViews = userDoc.data()?.recentStatusViews || [];
        if (recentViews.length > 50) {
            await userRef.update({
                recentStatusViews: recentViews.slice(-50)
            });
        }
    } catch (error) {
        console.error('Error updating recent views:', error);
    }
}

async function likeStatus(statusId) {
    try {
        const reactionRef = db.collection('statusReactions').doc(`${statusId}_${currentUser.uid}`);
        
        // Check if already liked
        const existingReaction = await reactionRef.get();
        
        if (existingReaction.exists) {
            // Unlike
            await reactionRef.delete();
            showToast('Removed like', 'info');
        } else {
            // Like
            await reactionRef.set({
                statusId: statusId,
                userId: currentUser.uid,
                reaction: '❤️',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('Liked status', 'success');
        }
        
        // Update reaction count
        updateReactionCount(statusId);
        
    } catch (error) {
        console.error('Error liking status:', error);
        showToast('Error reacting to status', 'error');
    }
}

async function sendStatusReply(statusId, replyText = null, mediaReply = null) {
    const input = document.getElementById('statusReplyInput');
    const text = replyText || (input ? input.value.trim() : '');
    
    if (!text && !mediaReply) return;
    
    try {
        // Get status info
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = statusDoc.data();
        
        // Create reply
        const replyData = {
            type: mediaReply ? mediaReply.type : 'text',
            content: mediaReply ? mediaReply.content : text,
            senderId: currentUser.uid,
            senderName: currentUserData?.displayName,
            senderPhoto: currentUserData?.photoURL,
            receiverId: status.userId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            isStatusReply: true,
            originalStatusId: statusId,
            statusType: status.type,
            statusPreview: status.type === 'text' ? status.content.substring(0, 50) + '...' : 
                          status.type === 'emoji' ? status.content : '📸 Status',
            mediaUrl: mediaReply ? mediaReply.url : null,
            thumbnail: mediaReply ? mediaReply.thumbnail : null
        };
        
        // Save to messages collection
        await db.collection('messages').add(replyData);
        
        // Update reply count
        await db.collection('statuses').doc(statusId).update({
            replyCount: firebase.firestore.FieldValue.increment(1)
        });
        
        // Clear input
        if (input) input.value = '';
        
        showToast('Reply sent', 'success');
        
        // Close emoji picker if open
        if (emojiPickerOpen) {
            toggleEmojiPicker();
        }
        
    } catch (error) {
        console.error('Error sending status reply:', error);
        showToast('Error sending reply', 'error');
    }
}

function handleReplyKeypress(event, statusId) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendStatusReply(statusId);
    }
}

async function shareStatus(statusId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = statusDoc.data();
        
        // Show share options
        const shareOptions = document.createElement('div');
        shareOptions.className = 'share-options-modal';
        shareOptions.innerHTML = `
            <div class="share-options-content">
                <h3>Share Status</h3>
                <div class="share-options">
                    <button class="share-option" onclick="shareAsMyStatus('${statusId}')">
                        <i class="fas fa-share-square"></i>
                        <span>Share to my status</span>
                    </button>
                    <button class="share-option" onclick="shareToContact('${statusId}')">
                        <i class="fas fa-user-friends"></i>
                        <span>Share to a contact</span>
                    </button>
                    <button class="share-option" onclick="copyStatusLink('${statusId}')">
                        <i class="fas fa-link"></i>
                        <span>Copy link</span>
                    </button>
                    <button class="share-option" onclick="shareToOtherApp('${statusId}')">
                        <i class="fas fa-external-link-alt"></i>
                        <span>Share to other app</span>
                    </button>
                    <button class="share-option" onclick="forwardStatus('${statusId}')">
                        <i class="fas fa-forward"></i>
                        <span>Forward</span>
                    </button>
                </div>
                <button class="btn-cancel" onclick="this.parentElement.parentElement.remove()">Cancel</button>
            </div>
        `;
        
        document.body.appendChild(shareOptions);
        
    } catch (error) {
        console.error('Error sharing status:', error);
        showToast('Error sharing status', 'error');
    }
}

async function shareAsMyStatus(statusId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) return;
        
        const originalStatus = statusDoc.data();
        
        // Create new status as a share
        const newStatus = {
            type: 'share',
            content: originalStatus.content,
            caption: `Shared from ${originalStatus.userDisplayName}`,
            originalStatusId: statusId,
            originalUserId: originalStatus.userId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            userId: currentUser.uid,
            userDisplayName: currentUserData?.displayName,
            userPhotoURL: currentUserData?.photoURL,
            viewCount: 0,
            isShared: true
        };
        
        await db.collection('statuses').add(newStatus);
        
        showToast('Status shared to your status', 'success');
        loadStatusUpdates();
        
    } catch (error) {
        console.error('Error sharing as my status:', error);
        showToast('Error sharing status', 'error');
    }
}

// ==================== EMOJI PICKER ====================

function setupEmojiPicker() {
    // Common emojis for quick access
    window.commonEmojis = {
        recent: [],
        smileys: ['😀', '😂', '🥰', '😍', '🤩', '😎', '🥳', '😇', '🤗', '😊', '😉', '😋', '😜', '🤪', '😝', '🤑', '🤠', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '😢', '😭', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️'],
        hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
        hands: ['👍', '👎', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '🤏', '✊', '👊', '🤛', '🤜', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙'],
        animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄'],
        food: ['🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥗', '🍿', '🧂', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡']
    };
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPickerContainer');
    if (!picker) return;
    
    emojiPickerOpen = !emojiPickerOpen;
    
    if (emojiPickerOpen) {
        picker.classList.remove('hidden');
    } else {
        picker.classList.add('hidden');
    }
}

function loadEmojis(category = 'smileys') {
    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) return;
    
    const emojis = window.commonEmojis[category] || window.commonEmojis.smileys;
    emojiGrid.innerHTML = emojis.map(emoji => `
        <button class="emoji-btn" onclick="insertEmoji('${emoji}')">${emoji}</button>
    `).join('');
    
    // Update active category
    document.querySelectorAll('.emoji-category').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById('statusReplyInput');
    if (input) {
        input.value += emoji;
        input.focus();
    }
}

// ==================== STATUS CREATION ====================

function openStatusCreation() {
    const statusCreation = document.getElementById('statusCreation');
    if (statusCreation) {
        statusCreation.style.display = 'flex';
        resetStatusCreation();
        updatePrivacyIndicator();
    }
}


function resetStatusCreation() {
    // Reset all previews
    const previews = ['emojiPreview', 'textPreview', 'imagePreview', 'videoPreview', 'audioPreview'];
    previews.forEach(previewId => {
        const preview = document.getElementById(previewId);
        if (preview) preview.classList.add('hidden');
    });
    
    // Show text preview by default (like WhatsApp)
    const textPreview = document.getElementById('textPreview');
    if (textPreview) {
        textPreview.classList.remove('hidden');
    }
    
    // Reset active option
    document.querySelectorAll('.status-option').forEach(option => {
        option.classList.remove('active');
    });
    const textOption = document.querySelector('.status-option[data-type="text"]');
    if (textOption) textOption.classList.add('active');
    
    // Reset inputs
    const statusTextInput = document.getElementById('statusTextInput');
    if (statusTextInput) {
        statusTextInput.value = '';
        statusTextInput.focus();
    }
    
    const statusCaption = document.getElementById('statusCaption');
    if (statusCaption) statusCaption.value = '';
    
    // Clear media
    window.currentStatusMedia = null;
}

// ==================== MISSING FUNCTION IMPLEMENTATIONS ====================

// Function 1: deleteStatus
async function deleteStatus(statusId) {
    try {
        if (!confirm('Delete this status? It will be removed for all viewers.')) {
            return;
        }
        
        await db.collection('statuses').doc(statusId).delete();
        showToast('Status deleted', 'success');
        
        // Close viewer if open
        closeStatusViewer();
        
        // Refresh status list
        loadStatusUpdates();
        
    } catch (error) {
        console.error('Error deleting status:', error);
        showToast('Error deleting status', 'error');
    }
}

// Function 2: setupStatusEventListeners
function setupStatusEventListeners() {
    console.log('Setting up status event listeners...');
    
    // Add click listeners for status buttons
    const addStatusBtn = document.getElementById('addStatusBtn');
    if (addStatusBtn) {
        addStatusBtn.addEventListener('click', openStatusCreation);
    }
    
    const closeStatusBtn = document.getElementById('closeStatusBtn');
    if (closeStatusBtn) {
        closeStatusBtn.addEventListener('click', closeStatusViewer);
    }
    
    // Post status button
    const postStatusBtn = document.getElementById('postStatusBtn');
    if (postStatusBtn) {
        postStatusBtn.addEventListener('click', postStatus);
    }
    
    // Save draft button
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', saveStatusDraft);
    }
    
    // Privacy settings button
    const privacySettingsBtn = document.getElementById('privacySettingsBtn');
    if (privacySettingsBtn) {
        privacySettingsBtn.addEventListener('click', showStatusPrivacySettings);
    }
    
    // Status text input real-time updates
    const statusTextInput = document.getElementById('statusTextInput');
    if (statusTextInput) {
        statusTextInput.addEventListener('input', updateTextStatusPreview);
    }
    
    // Status caption input
    const statusCaption = document.getElementById('statusCaption');
    if (statusCaption) {
        statusCaption.addEventListener('input', updateStatusCaption);
    }
    
    // Media upload button
    const uploadMediaBtn = document.getElementById('uploadMediaBtn');
    if (uploadMediaBtn) {
        uploadMediaBtn.addEventListener('click', () => {
            document.getElementById('statusMediaInput').click();
        });
    }
    
    // Background color picker
    const bgColorPicker = document.getElementById('bgColorPicker');
    if (bgColorPicker) {
        bgColorPicker.addEventListener('input', updateBackgroundColor);
    }
    
    // Font selector
    const fontSelector = document.getElementById('fontSelector');
    if (fontSelector) {
        fontSelector.addEventListener('change', updateFontStyle);
    }
    
    // Text color picker
    const textColorPicker = document.getElementById('textColorPicker');
    if (textColorPicker) {
        textColorPicker.addEventListener('input', updateTextColor);
    }
    
    // Add emoji button
    const addEmojiBtn = document.getElementById('addEmojiBtn');
    if (addEmojiBtn) {
        addEmojiBtn.addEventListener('click', openStatusEmojiPicker);
    }
    
    // Schedule button
    const scheduleBtn = document.getElementById('scheduleBtn');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', openScheduleModal);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('statusViewer')) {
            closeStatusViewer();
        }
        if (e.key === 'ArrowRight' && currentStatusViewing) {
            showNextStatus();
        }
        if (e.key === 'ArrowLeft' && currentStatusViewing) {
            showPrevStatus();
        }
        // Ctrl/Cmd + Enter to post status
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const statusCreation = document.getElementById('statusCreation');
            if (statusCreation && statusCreation.style.display !== 'none') {
                postStatus();
            }
        }
    });
    
    // Setup screenshot detection
    setupScreenshotDetection();
    
    // Setup visibility change for background processing
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Swipe gestures for mobile
    setupSwipeGestures();
}

// Function 3: setupStatusFileHandlers
function setupStatusFileHandlers() {
    console.log('Setting up status file handlers...');
    
    // Handle file inputs for status creation
    const fileInput = document.getElementById('statusMediaInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleStatusFileSelect);
    }
    
    // Add drag and drop for status files
    const dropZone = document.getElementById('statusDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('drop', handleStatusFileDrop);
    }
    
    // Setup drawing canvas
    const drawCanvas = document.getElementById('drawCanvas');
    if (drawCanvas) {
        setupDrawingCanvas(drawCanvas);
    }
}

// Function 4: loadNextUserStatuses
async function loadNextUserStatuses() {
    if (!currentStatusViewing) return;
    
    try {
        // Get all users with statuses
        const allUsersSnapshot = await db.collection('statuses')
            .where('expiresAt', '>', new Date())
            .orderBy('userId')
            .get();
        
        const usersWithStatuses = [...new Set(allUsersSnapshot.docs.map(doc => doc.data().userId))];
        const currentIndex = usersWithStatuses.indexOf(currentStatusViewing.userId);
        
        if (currentIndex !== -1 && currentIndex < usersWithStatuses.length - 1) {
            const nextUserId = usersWithStatuses[currentIndex + 1];
            await loadUserStatuses(nextUserId);
        } else {
            closeStatusViewer();
            showToast('No more statuses to view', 'info');
        }
    } catch (error) {
        console.error('Error loading next user statuses:', error);
        closeStatusViewer();
    }
}

// Function 5: showViewersList
async function showViewersList(statusId) {
    try {
        const viewersSnapshot = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .orderBy('viewedAt', 'desc')
            .get();
        
        const viewersModal = document.createElement('div');
        viewersModal.className = 'viewers-modal';
        viewersModal.innerHTML = `
            <div class="viewers-content">
                <div class="viewers-header">
                    <h3>Viewers</h3>
                    <button class="btn-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="viewers-list">
                    ${viewersSnapshot.docs.map(doc => {
                        const viewer = doc.data();
                        return `
                            <div class="viewer-item">
                                <img src="${viewer.userPhotoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(viewer.userDisplayName)}&background=7C3AED&color=fff`}" 
                                     class="viewer-avatar">
                                <div class="viewer-info">
                                    <p class="viewer-name">${viewer.userDisplayName}</p>
                                    <p class="viewer-time">${formatTimeAgo(viewer.viewedAt)}</p>
                                    ${viewer.screenshot ? '<span class="screenshot-indicator" title="Took screenshot"><i class="fas fa-camera"></i></span>' : ''}
                                </div>
                                <button class="btn-action" onclick="messageUser('${viewer.userId}')">
                                    <i class="fas fa-comment"></i>
                                </button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        document.body.appendChild(viewersModal);
    } catch (error) {
        console.error('Error showing viewers list:', error);
        showToast('Error loading viewers', 'error');
    }
}

// Function 6: showReplyOptions
function showReplyOptions(statusId) {
    const options = document.createElement('div');
    options.className = 'reply-options-menu';
    options.innerHTML = `
        <div class="reply-options">
            <button class="reply-option" onclick="copyReplyText('${statusId}')">
                <i class="fas fa-copy"></i>
                <span>Copy text</span>
            </button>
            <button class="reply-option" onclick="saveMediaReply('${statusId}')">
                <i class="fas fa-download"></i>
                <span>Save media</span>
            </button>
            <button class="reply-option" onclick="forwardReply('${statusId}')">
                <i class="fas fa-forward"></i>
                <span>Forward</span>
            </button>
            <button class="reply-option text-danger" onclick="deleteReply('${statusId}')">
                <i class="fas fa-trash"></i>
                <span>Delete</span>
            </button>
        </div>
    `;
    
    document.body.appendChild(options);
    
    // Position near input
    const input = document.getElementById('statusReplyInput');
    if (input) {
        const rect = input.getBoundingClientRect();
        options.style.top = `${rect.top - options.offsetHeight}px`;
        options.style.left = `${rect.left}px`;
    }
    
    // Close on outside click
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!options.contains(e.target) && e.target !== document.querySelector('.btn-action-reply')) {
                options.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
}

// Function 7: showStatusReactions
async function showStatusReactions(statusId) {
    const reactionPicker = document.createElement('div');
    reactionPicker.className = 'reaction-picker';
    reactionPicker.innerHTML = `
        <div class="reactions-grid">
            <button class="reaction-btn" onclick="addReaction('${statusId}', '❤️')">❤️</button>
            <button class="reaction-btn" onclick="addReaction('${statusId}', '😂')">😂</button>
            <button class="reaction-btn" onclick="addReaction('${statusId}', '😮')">😮</button>
            <button class="reaction-btn" onclick="addReaction('${statusId}', '😢')">😢</button>
            <button class="reaction-btn" onclick="addReaction('${statusId}', '😡')">😡</button>
            <button class="reaction-btn" onclick="addReaction('${statusId}', '👍')">👍</button>
            <button class="reaction-btn" onclick="addReaction('${statusId}', '👎')">👎</button>
            <button class="reaction-btn" onclick="addReaction('${statusId}', '🔥')">🔥</button>
        </div>
    `;
    
    document.body.appendChild(reactionPicker);
    
    // Position near reaction button
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!reactionPicker.contains(e.target) && !e.target.closest('.btn-action[title="Reactions"]')) {
                reactionPicker.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
}

// Function 8: addReaction
async function addReaction(statusId, reaction) {
    try {
        const reactionRef = db.collection('statusReactions').doc(`${statusId}_${currentUser.uid}`);
        
        await reactionRef.set({
            statusId: statusId,
            userId: currentUser.uid,
            reaction: reaction,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast(`Reacted with ${reaction}`, 'success');
        updateReactionCount(statusId);
        
    } catch (error) {
        console.error('Error adding reaction:', error);
        showToast('Error adding reaction', 'error');
    }
}

// Function 9: showContactSelector
async function showContactSelector() {
    try {
        const contactsSnapshot = await db.collection('users')
            .where('friends', 'array-contains', currentUser.uid)
            .limit(50)
            .get();
        
        const modal = document.createElement('div');
        modal.className = 'contact-selector-modal';
        modal.innerHTML = `
            <div class="contact-selector-content">
                <div class="selector-header">
                    <h3>Select Contacts</h3>
                    <input type="text" class="search-contacts" placeholder="Search contacts..." onkeyup="searchContacts(event)">
                </div>
                <div class="contacts-list" id="contactsList">
                    ${contactsSnapshot.docs.map(doc => {
                        const contact = doc.data();
                        return `
                            <label class="contact-item">
                                <input type="checkbox" value="${doc.id}" 
                                       ${window.statusPreferences.selectedContacts?.includes(doc.id) ? 'checked' : ''}>
                                <img src="${contact.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.displayName)}&background=7C3AED&color=fff`}" 
                                     class="contact-avatar">
                                <div class="contact-info">
                                    <p class="contact-name">${contact.displayName}</p>
                                    <p class="contact-status">${contact.status || 'Online'}</p>
                                </div>
                            </label>
                        `;
                    }).join('')}
                </div>
                <div class="selector-actions">
                    <button class="btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">Cancel</button>
                    <button class="btn-primary" onclick="saveSelectedContacts()">Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error showing contact selector:', error);
        showToast('Error loading contacts', 'error');
    }
}

// Function 10: saveSelectedContacts
async function saveSelectedContacts() {
    const selected = Array.from(document.querySelectorAll('.contact-item input:checked'))
        .map(input => input.value);
    
    await updateStatusPrivacy('selectedContacts', selected);
    
    // Close modal
    document.querySelector('.contact-selector-modal')?.remove();
}

// Function 11: blockStatusUser
async function blockStatusUser(userId) {
    if (!confirm(`Block ${userId} from viewing your status updates?`)) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            blockedFromStatus: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        
        window.statusPreferences.blockedFromViewing.push(userId);
        showToast('User blocked from viewing your status', 'success');
        
    } catch (error) {
        console.error('Error blocking user:', error);
        showToast('Error blocking user', 'error');
    }
}

// Function 12: messageUser
function messageUser(userId) {
    // Navigate to chat with user
    if (window.openChat) {
        window.openChat(userId);
    } else {
        console.log('Navigate to chat with user:', userId);
        // Implement your chat navigation logic here
    }
}

// Function 13: callUser
function callUser(userId) {
    console.log('Calling user:', userId);
    // Implement call functionality
    showToast('Call feature not implemented in demo', 'info');
}

// Function 14: viewContact
async function viewContact(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;
        
        const userData = userDoc.data();
        const modal = document.createElement('div');
        modal.className = 'contact-view-modal';
        modal.innerHTML = `
            <div class="contact-view-content">
                <div class="contact-header">
                    <img src="${userData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName)}&background=7C3AED&color=fff`}" 
                         class="contact-large-avatar">
                    <h3>${userData.displayName}</h3>
                    <p class="contact-status">${userData.status || 'Hey there! I am using WhatsApp'}</p>
                </div>
                <div class="contact-actions">
                    <button class="contact-action" onclick="messageUser('${userId}')">
                        <i class="fas fa-comment"></i>
                        <span>Message</span>
                    </button>
                    <button class="contact-action" onclick="callUser('${userId}')">
                        <i class="fas fa-phone"></i>
                        <span>Call</span>
                    </button>
                    <button class="contact-action" onclick="toggleMuteUser('${userId}')">
                        <i class="fas fa-volume-mute"></i>
                        <span>Mute</span>
                    </button>
                </div>
                <div class="contact-info">
                    <div class="info-item">
                        <span class="info-label">Phone</span>
                        <span class="info-value">${userData.phone || 'Not available'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Joined</span>
                        <span class="info-value">${formatTimeAgo(userData.createdAt)}</span>
                    </div>
                </div>
                <button class="btn-close" onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error viewing contact:', error);
    }
}

// Function 15: copyStatusLink
async function copyStatusLink(statusId) {
    const link = `${window.location.origin}/status/${statusId}`;
    
    try {
        await navigator.clipboard.writeText(link);
        showToast('Link copied to clipboard', 'success');
    } catch (error) {
        console.error('Error copying link:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = link;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Link copied', 'success');
    }
}

// Function 16: shareToContact
async function shareToContact(statusId) {
    try {
        const contactsSnapshot = await db.collection('users')
            .where('friends', 'array-contains', currentUser.uid)
            .limit(20)
            .get();
        
        const modal = document.createElement('div');
        modal.className = 'share-contacts-modal';
        modal.innerHTML = `
            <div class="share-contacts-content">
                <h3>Share to Contact</h3>
                <div class="contacts-list-share">
                    ${contactsSnapshot.docs.map(doc => {
                        const contact = doc.data();
                        return `
                            <div class="contact-share-item" onclick="sendStatusToContact('${statusId}', '${doc.id}')">
                                <img src="${contact.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.displayName)}&background=7C3AED&color=fff`}" 
                                     class="contact-avatar">
                                <div class="contact-info">
                                    <p class="contact-name">${contact.displayName}</p>
                                    <p class="contact-status">${contact.status || 'Online'}</p>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <button class="btn-cancel" onclick="this.parentElement.parentElement.remove()">Cancel</button>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error sharing to contact:', error);
        showToast('Error sharing', 'error');
    }
}

// Function 17: sendStatusToContact
async function sendStatusToContact(statusId, contactId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) return;
        
        const status = statusDoc.data();
        
        // Create message with status preview
        const messageData = {
            type: 'status_share',
            content: 'Shared a status with you',
            senderId: currentUser.uid,
            senderName: currentUserData?.displayName,
            receiverId: contactId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            statusId: statusId,
            statusPreview: status.content?.substring(0, 50) || '📸 Status',
            statusType: status.type
        };
        
        await db.collection('messages').add(messageData);
        showToast('Status shared', 'success');
        
        // Close modal
        document.querySelector('.share-contacts-modal')?.remove();
    } catch (error) {
        console.error('Error sending status to contact:', error);
        showToast('Error sharing', 'error');
    }
}

// Function 18: shareToOtherApp
async function shareToOtherApp(statusId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) return;
        
        const status = statusDoc.data();
        const text = status.caption || status.content || 'Check out this status';
        const url = `${window.location.origin}/status/${statusId}`;
        
        if (navigator.share) {
            await navigator.share({
                title: `Status from ${status.userDisplayName}`,
                text: text,
                url: url
            });
        } else {
            // Fallback: copy to clipboard
            await copyStatusLink(statusId);
        }
    } catch (error) {
        console.error('Error sharing to other app:', error);
        // Fallback
        await copyStatusLink(statusId);
    }
}

// Function 19: updateReactionCount
async function updateReactionCount(statusId) {
    try {
        const reactionsSnapshot = await db.collection('statusReactions')
            .where('statusId', '==', statusId)
            .get();
        
        const count = reactionsSnapshot.size;
        
        // Update in database
        await db.collection('statuses').doc(statusId).update({
            reactionCount: count
        });
        
        // Update in UI if viewer is open
        const reactionBtn = document.querySelector(`[onclick*="${statusId}"] .reaction-count`);
        if (reactionBtn) {
            reactionBtn.textContent = count;
        }
    } catch (error) {
        console.error('Error updating reaction count:', error);
    }
}

// Function 20: setupStatusRealtimeUpdates
function setupStatusRealtimeUpdates(statusId) {
    if (statusViewerListener) {
        statusViewerListener();
    }
    
    // Listen for view count updates
    statusViewerListener = db.collection('statuses').doc(statusId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const status = doc.data();
                const viewCountElement = document.getElementById(`viewCount-${statusId}`);
                if (viewCountElement) {
                    viewCountElement.textContent = status.viewCount || 0;
                }
            }
        });
    
    // Listen for new reactions
    statusReactionListener = db.collection('statusReactions')
        .where('statusId', '==', statusId)
        .onSnapshot((snapshot) => {
            updateReactionCount(statusId);
        });
}

// Function 21: updateStatusInUI
function updateStatusInUI(statusId, statusData) {
    // Update view count in status list
    const statusItem = document.querySelector(`.status-item[data-status-id="${statusId}"]`);
    if (statusItem) {
        const viewCountElement = statusItem.querySelector('.view-count');
        if (viewCountElement && statusData.viewCount) {
            viewCountElement.textContent = statusData.viewCount;
        }
    }
    
    // Update in viewer if currently viewing
    if (currentStatusViewing && currentStatusViewing.statuses.some(s => s.id === statusId)) {
        const index = currentStatusViewing.statuses.findIndex(s => s.id === statusId);
        currentStatusViewing.statuses[index] = { ...currentStatusViewing.statuses[index], ...statusData };
    }
}

// Function 22: removeStatusFromUI
function removeStatusFromUI(statusId) {
    // Remove from status list
    const statusItem = document.querySelector(`.status-item[data-status-id="${statusId}"]`);
    if (statusItem) {
        statusItem.remove();
    }
    
    // Remove from current viewing if applicable
    if (currentStatusViewing) {
        const index = currentStatusViewing.statuses.findIndex(s => s.id === statusId);
        if (index !== -1) {
            currentStatusViewing.statuses.splice(index, 1);
            if (currentStatusViewing.statuses.length === 0) {
                closeStatusViewer();
            } else if (currentStatusIndex >= currentStatusViewing.statuses.length) {
                showStatusAtIndex(currentStatusViewing.statuses.length - 1);
            }
        }
    }
}

// Function 23: showMyStatusOptions
function showMyStatusOptions(event) {
    event.stopPropagation();
    
    const options = document.createElement('div');
    options.className = 'my-status-options-menu';
    options.style.position = 'absolute';
    options.style.top = `${event.clientY}px`;
    options.style.left = `${event.clientX}px`;
    
    options.innerHTML = `
        <div class="my-status-options">
            <button class="my-status-option" onclick="openStatusCreation()">
                <i class="fas fa-plus"></i>
                <span>New status</span>
            </button>
            <button class="my-status-option" onclick="showStatusArchive()">
                <i class="fas fa-archive"></i>
                <span>Archive</span>
            </button>
            <button class="my-status-option" onclick="showStatusHighlightsUI()">
                <i class="fas fa-star"></i>
                <span>Highlights</span>
            </button>
            <button class="my-status-option" onclick="showStatusDraftsUI()">
                <i class="fas fa-file-alt"></i>
                <span>Drafts</span>
            </button>
            <button class="my-status-option" onclick="showStatusSettings()">
                <i class="fas fa-cog"></i>
                <span>Settings</span>
            </button>
            <button class="my-status-option" onclick="showStatusPrivacySettings()">
                <i class="fas fa-user-shield"></i>
                <span>Privacy</span>
            </button>
        </div>
    `;
    
    document.body.appendChild(options);
    
    // Close on outside click
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!options.contains(e.target)) {
                options.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
}

// ==================== ADDITIONAL FEATURES ====================

// Function 24: loadUserStatuses
async function loadUserStatuses(userId) {
    try {
        const snapshot = await db.collection('statuses')
            .where('userId', '==', userId)
            .where('expiresAt', '>', new Date())
            .orderBy('timestamp', 'desc')
            .get();
        
        if (!snapshot.empty) {
            const statuses = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            openStatusViewer(userId, statuses);
        } else {
            showToast('No active statuses from this user', 'info');
        }
    } catch (error) {
        console.error('Error loading user statuses:', error);
        showToast('Error loading statuses', 'error');
    }
}

// Function 25: saveStatus
async function saveStatus(statusId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) return;
        
        const status = statusDoc.data();
        
        // Save to user's saved statuses
        await db.collection('users').doc(currentUser.uid).update({
            savedStatuses: firebase.firestore.FieldValue.arrayUnion({
                statusId: statusId,
                savedAt: new Date(),
                originalUserId: status.userId,
                type: status.type,
                content: status.content,
                caption: status.caption
            })
        });
        
        showToast('Status saved', 'success');
        
        // Download media if enabled
        if (window.statusPreferences.saveToGallery && (status.type === 'image' || status.type === 'video')) {
            downloadMedia(status.content);
        }
    } catch (error) {
        console.error('Error saving status:', error);
        showToast('Error saving status', 'error');
    }
}

// Function 26: reportStatus
async function reportStatus(statusId) {
    const reason = prompt('Please enter reason for reporting this status:');
    if (!reason) return;
    
    try {
        await db.collection('reports').add({
            statusId: statusId,
            reporterId: currentUser.uid,
            reason: reason,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            reviewed: false
        });
        
        showToast('Status reported. Thank you for your feedback.', 'success');
    } catch (error) {
        console.error('Error reporting status:', error);
        showToast('Error reporting status', 'error');
    }
}

// Function 27: forwardStatus
async function forwardStatus(statusId) {
    const statusDoc = await db.collection('statuses').doc(statusId).get();
    if (!statusDoc.exists) return;
    
    const status = statusDoc.data();
    
    // Show contact selector for forwarding
    const contactsSnapshot = await db.collection('users')
        .where('friends', 'array-contains', currentUser.uid)
        .limit(20)
        .get();
    
    const modal = document.createElement('div');
    modal.className = 'forward-modal';
    modal.innerHTML = `
        <div class="forward-content">
            <h3>Forward Status</h3>
            <div class="forward-preview">
                ${getStatusContentHTML(status)}
                ${status.caption ? `<p class="forward-caption">${status.caption}</p>` : ''}
            </div>
            <div class="contacts-list-forward">
                ${contactsSnapshot.docs.map(doc => {
                    const contact = doc.data();
                    return `
                        <label class="forward-contact-item">
                            <input type="checkbox" value="${doc.id}">
                            <img src="${contact.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.displayName)}&background=7C3AED&color=fff`}" 
                                 class="contact-avatar">
                            <div class="contact-info">
                                <p class="contact-name">${contact.displayName}</p>
                            </div>
                        </label>
                    `;
                }).join('')}
            </div>
            <div class="forward-actions">
                <button class="btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">Cancel</button>
                <button class="btn-primary" onclick="sendForwardedStatus('${statusId}')">Forward</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Function 28: sendForwardedStatus
async function sendForwardedStatus(statusId) {
    const selectedContacts = Array.from(document.querySelectorAll('.forward-contact-item input:checked'))
        .map(input => input.value);
    
    if (selectedContacts.length === 0) {
        showToast('Please select at least one contact', 'error');
        return;
    }
    
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) return;
        
        const status = statusDoc.data();
        
        // Send to each selected contact
        const batch = db.batch();
        
        selectedContacts.forEach(contactId => {
            const messageRef = db.collection('messages').doc();
            batch.set(messageRef, {
                type: 'status_forward',
                content: 'Forwarded a status',
                senderId: currentUser.uid,
                receiverId: contactId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                originalStatusId: statusId,
                originalUserId: status.userId,
                statusType: status.type,
                statusPreview: status.content?.substring(0, 50) || '📸 Status'
            });
        });
        
        await batch.commit();
        showToast(`Forwarded to ${selectedContacts.length} contact(s)`, 'success');
        
        // Close modal
        document.querySelector('.forward-modal')?.remove();
    } catch (error) {
        console.error('Error forwarding status:', error);
        showToast('Error forwarding status', 'error');
    }
}

// Function 29: setupMediaPlayback
function setupMediaPlayback(status) {
    const video = document.querySelector('.status-media');
    if (!video) return;
    
    const playPauseBtn = document.querySelector('.play-pause-btn');
    const progressSlider = document.querySelector('.media-progress');
    const volumeBtn = document.querySelector('.volume-btn');
    const volumeSlider = document.querySelector('.volume-slider');
    
    if (video.tagName === 'VIDEO' || video.tagName === 'AUDIO') {
        // Play/Pause
        playPauseBtn.addEventListener('click', () => {
            if (video.paused) {
                video.play();
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                video.pause();
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
        
        // Progress
        video.addEventListener('timeupdate', () => {
            const percent = (video.currentTime / video.duration) * 100;
            progressSlider.value = percent;
        });
        
        progressSlider.addEventListener('input', () => {
            const time = (progressSlider.value / 100) * video.duration;
            video.currentTime = time;
        });
        
        // Volume
        volumeBtn.addEventListener('click', () => {
            if (video.volume > 0) {
                video.volume = 0;
                volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
            } else {
                video.volume = 1;
                volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            }
        });
        
        volumeSlider.addEventListener('input', () => {
            video.volume = volumeSlider.value / 100;
        });
    }
}

// Function 30: toggleMediaPlayback
function toggleMediaPlayback() {
    const media = document.querySelector('.status-media');
    const btn = document.querySelector('.play-pause-btn');
    
    if (!media) return;
    
    if (media.paused) {
        media.play();
        btn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        media.pause();
        btn.innerHTML = '<i class="fas fa-play"></i>';
    }
}

// Function 31: toggleVolume
function toggleVolume() {
    const media = document.querySelector('.status-media');
    const btn = document.querySelector('.volume-btn');
    const slider = document.querySelector('.volume-slider');
    
    if (!media) return;
    
    if (media.volume > 0) {
        media.volume = 0;
        btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        slider.value = 0;
    } else {
        media.volume = 1;
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
        slider.value = 100;
    }
}

// Function 32: setupScreenshotDetection
function setupScreenshotDetection() {
    // Basic screenshot detection (limited in web browsers)
    document.addEventListener('keydown', (e) => {
        // Detect common screenshot shortcuts
        if ((e.ctrlKey && e.key === 'PrintScreen') || 
            (e.metaKey && e.shiftKey && e.key === '3') ||
            (e.metaKey && e.shiftKey && e.key === '4')) {
            
            if (currentStatusViewing && window.statusPreferences.screenshotAlerts) {
                reportScreenshot(currentStatusViewing.statuses[currentStatusIndex].id);
            }
        }
    });
    
    // Visibility change (may indicate screenshot)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && currentStatusViewing) {
            setTimeout(() => {
                if (!document.hidden) {
                    // User may have taken a screenshot
                    if (window.statusPreferences.screenshotAlerts) {
                        reportScreenshot(currentStatusViewing.statuses[currentStatusIndex].id);
                    }
                }
            }, 1000);
        }
    });
}

// Function 33: reportScreenshot
async function reportScreenshot(statusId) {
    try {
        // Update view to mark as screenshot
        const viewQuery = await db.collection('statusViews')
            .where('statusId', '==', statusId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (!viewQuery.empty) {
            const viewDoc = viewQuery.docs[0];
            await viewDoc.ref.update({
                screenshot: true,
                screenshotAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Notify status owner
            const statusDoc = await db.collection('statuses').doc(statusId).get();
            if (statusDoc.exists) {
                const status = statusDoc.data();
                if (status.userId !== currentUser.uid) {
                    // Send notification to owner
                    await db.collection('notifications').add({
                        type: 'screenshot',
                        userId: status.userId,
                        fromUserId: currentUser.uid,
                        fromUserName: currentUserData?.displayName,
                        statusId: statusId,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        read: false
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error reporting screenshot:', error);
    }
}

// Function 34: openMediaReply
function openMediaReply(statusId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.style.display = 'none';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadMediaReply(file, statusId);
        }
    };
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}

// Function 35: uploadMediaReply
async function uploadMediaReply(file, statusId) {
    try {
        showToast('Uploading media...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`status_replies/${currentUser.uid}/${Date.now()}_${file.name}`);
        const uploadTask = fileRef.put(file);
        
        uploadTask.on('state_changed',
            (snapshot) => {
                // Progress tracking
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload progress:', progress);
            },
            (error) => {
                console.error('Upload error:', error);
                showToast('Error uploading media', 'error');
            },
            async () => {
                // Upload complete
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Create thumbnail for images/videos
                let thumbnail = null;
                if (file.type.startsWith('image/')) {
                    thumbnail = await createImageThumbnail(file);
                }
                
                const mediaReply = {
                    type: file.type.startsWith('image/') ? 'image' : 
                           file.type.startsWith('video/') ? 'video' : 'audio',
                    content: file.type.startsWith('image/') ? '📷 Image' : 
                            file.type.startsWith('video/') ? '🎥 Video' : '🎵 Audio',
                    url: downloadURL,
                    thumbnail: thumbnail,
                    fileName: file.name,
                    fileSize: file.size
                };
                
                await sendStatusReply(statusId, null, mediaReply);
                showToast('Media reply sent', 'success');
            }
        );
    } catch (error) {
        console.error('Error uploading media reply:', error);
        showToast('Error uploading media', 'error');
    }
}

// Function 36: createImageThumbnail
function createImageThumbnail(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Create thumbnail (max 200x200)
                const maxSize = 200;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Function 37: downloadMedia
function downloadMedia(url) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `status_${Date.now()}.${url.split('.').pop()}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function 38: loadStatusDrafts
async function loadStatusDrafts() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            statusDrafts = userData.statusDrafts || [];
        }
    } catch (error) {
        console.error('Error loading drafts:', error);
    }
}

// Function 39: saveStatusDraft
async function saveStatusDraft() {
    try {
        await db.collection('users').doc(currentUser.uid).update({
            statusDrafts: firebase.firestore.FieldValue.arrayUnion(window.statusDraft)
        });
        
        statusDrafts.push({...window.statusDraft});
        showToast('Draft saved', 'success');
    } catch (error) {
        console.error('Error saving draft:', error);
        showToast('Error saving draft', 'error');
    }
}

// Function 40: loadStatusHighlights
async function loadStatusHighlights() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            statusHighlights = userData.statusHighlights || [];
            statusArchive = userData.statusArchive || [];
        }
    } catch (error) {
        console.error('Error loading highlights:', error);
    }
}

// Function 41: showStatusArchive
function showStatusArchive() {
    const modal = document.createElement('div');
    modal.className = 'archive-modal';
    modal.innerHTML = `
        <div class="archive-content">
            <div class="archive-header">
                <h3>Archived Statuses</h3>
                <button class="btn-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="archive-list">
                ${statusArchive.length > 0 ? 
                    statusArchive.map(item => `
                        <div class="archive-item">
                            <div class="archive-preview">
                                ${getStatusContentHTML(item)}
                            </div>
                            <div class="archive-info">
                                <p>${formatTimeAgo(item.timestamp)}</p>
                                <p>${item.viewCount || 0} views</p>
                            </div>
                            <div class="archive-actions">
                                <button class="btn-action" onclick="restoreFromArchive('${item.id}')">
                                    <i class="fas fa-undo"></i>
                                </button>
                                <button class="btn-action" onclick="deletePermanently('${item.id}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') :
                    '<p class="empty-archive">No archived statuses</p>'
                }
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Function 42: archiveStatus
async function archiveStatus(statusId) {
    try {
        const statusDoc = await db.collection('statuses').doc(statusId).get();
        if (!statusDoc.exists) return;
        
        const status = statusDoc.data();
        
        // Add to archive
        await db.collection('users').doc(currentUser.uid).update({
            statusArchive: firebase.firestore.FieldValue.arrayUnion({
                id: statusId,
                ...status,
                archivedAt: new Date()
            })
        });
        
        // Delete from active statuses
        await db.collection('statuses').doc(statusId).delete();
        
        showToast('Status archived', 'success');
        loadStatusUpdates();
    } catch (error) {
        console.error('Error archiving status:', error);
        showToast('Error archiving status', 'error');
    }
}

// Function 43: showStatusHighlightsUI
function showStatusHighlightsUI() {
    const modal = document.createElement('div');
    modal.className = 'highlights-modal';
    modal.innerHTML = `
        <div class="highlights-content">
            <div class="highlights-header">
                <h3>Status Highlights</h3>
                <button class="btn-add" onclick="addToHighlights()">
                    <i class="fas fa-plus"></i> Add
                </button>
            </div>
            <div class="highlights-list">
                ${statusHighlights.length > 0 ? 
                    statusHighlights.map(highlight => `
                        <div class="highlight-item">
                            <div class="highlight-circle">
                                ${highlight.emoji || '⭐'}
                            </div>
                            <div class="highlight-info">
                                <h4>${highlight.title || 'Highlight'}</h4>
                                <p>${highlight.count || 0} statuses</p>
                            </div>
                            <div class="highlight-actions">
                                <button class="btn-action" onclick="viewHighlight('${highlight.id}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-action" onclick="editHighlight('${highlight.id}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') :
                    '<p class="empty-highlights">No highlights yet</p>'
                }
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Function 44: addToHighlights
async function addToHighlights() {
    const title = prompt('Enter highlight title:');
    if (!title) return;
    
    const emoji = prompt('Enter emoji for highlight:', '⭐');
    
    const highlight = {
        id: `highlight_${Date.now()}`,
        title: title,
        emoji: emoji || '⭐',
        statusIds: [],
        createdAt: new Date(),
        coverImage: null
    };
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            statusHighlights: firebase.firestore.FieldValue.arrayUnion(highlight)
        });
        
        statusHighlights.push(highlight);
        showToast('Highlight created', 'success');
    } catch (error) {
        console.error('Error creating highlight:', error);
        showToast('Error creating highlight', 'error');
    }
}

// Function 45: searchStatuses
async function searchStatuses(query) {
    try {
        // Search in captions and text content
        const textQuery = query.toLowerCase();
        const myStatuses = await loadMyStatuses();
        const recentStatuses = await loadRecentStatuses();
        
        const allStatuses = [...myStatuses, ...recentStatuses];
        const results = allStatuses.filter(status => 
            (status.caption && status.caption.toLowerCase().includes(textQuery)) ||
            (status.content && status.content.toLowerCase().includes(textQuery)) ||
            (status.userDisplayName && status.userDisplayName.toLowerCase().includes(textQuery))
        );
        
        // Display results
        const searchResults = document.createElement('div');
        searchResults.className = 'search-results-modal';
        searchResults.innerHTML = `
            <div class="search-results-content">
                <div class="search-header">
                    <h3>Search Results for "${query}"</h3>
                    <button class="btn-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="results-list">
                    ${results.length > 0 ? 
                        results.map(status => `
                            <div class="result-item" onclick="openStatusViewer('${status.userId}', [${JSON.stringify(status)}])">
                                <img src="${status.userPhotoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(status.userDisplayName)}&background=7C3AED&color=fff`}" 
                                     class="result-avatar">
                                <div class="result-info">
                                    <h4>${status.userDisplayName}</h4>
                                    <p class="result-preview">
                                        ${status.caption || status.content || ''}
                                    </p>
                                    <p class="result-time">${formatTimeAgo(status.timestamp)}</p>
                                </div>
                            </div>
                        `).join('') :
                        '<p class="no-results">No statuses found</p>'
                    }
                </div>
            </div>
        `;
        
        document.body.appendChild(searchResults);
    } catch (error) {
        console.error('Error searching statuses:', error);
        showToast('Error searching', 'error');
    }
}

// Function 46: startBackgroundProcessing
function startBackgroundProcessing() {
    // Preload next status in viewer
    if (currentStatusViewing && currentStatusViewing.statuses.length > currentStatusIndex + 1) {
        const nextStatus = currentStatusViewing.statuses[currentStatusIndex + 1];
        if (nextStatus.type === 'image' || nextStatus.type === 'video') {
            preloadMedia(nextStatus.content);
        }
    }
    
    // Cache frequently viewed statuses
    cacheRecentStatuses();
    
    // Process low-quality previews
    generateLowQualityPreviews();
}

// Function 47: preloadMedia
function preloadMedia(url) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = url.includes('.mp4') || url.includes('.webm') ? 'video' : 'image';
    link.href = url;
    document.head.appendChild(link);
}

// Function 48: cacheRecentStatuses
async function cacheRecentStatuses() {
    try {
        const recentViews = await db.collection('statusViews')
            .where('userId', '==', currentUser.uid)
            .orderBy('viewedAt', 'desc')
            .limit(10)
            .get();
        
        const statusIds = recentViews.docs.map(doc => doc.data().statusId);
        
        // Fetch and cache these statuses
        statusIds.forEach(async statusId => {
            const statusDoc = await db.collection('statuses').doc(statusId).get();
            if (statusDoc.exists) {
                const status = statusDoc.data();
                localStorage.setItem(`status_cache_${statusId}`, JSON.stringify({
                    ...status,
                    cachedAt: new Date()
                }));
            }
        });
        
        // Clean old cache (older than 7 days)
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('status_cache_')) {
                const cached = JSON.parse(localStorage.getItem(key));
                if (cached && cached.cachedAt) {
                    const cacheAge = new Date() - new Date(cached.cachedAt);
                    if (cacheAge > 7 * 24 * 60 * 60 * 1000) {
                        localStorage.removeItem(key);
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error caching statuses:', error);
    }
}

// Function 49: generateLowQualityPreviews
function generateLowQualityPreviews() {
    // This would generate low-quality previews for images
    // In a real app, you might use service workers or server-side processing
    console.log('Generating low-quality previews...');
}

// Function 50: handleVisibilityChange
function handleVisibilityChange() {
    if (document.hidden) {
        // App is in background
        if (statusProgressInterval) {
            clearInterval(statusProgressInterval);
        }
        if (statusViewerTimeout) {
            clearTimeout(statusViewerTimeout);
        }
    } else {
        // App is in foreground
        if (currentStatusViewing) {
            startStatusProgressTimer(currentStatusViewing.statuses[currentStatusIndex]);
        }
    }
}

// Function 51: postStatus
async function postStatus() {
    try {
        const statusData = {
            type: window.statusDraft.type,
            content: window.statusDraft.content,
            caption: window.statusDraft.caption,
            background: window.statusDraft.background,
            font: window.statusDraft.font,
            color: window.statusDraft.color,
            stickers: window.statusDraft.stickers,
            gifs: window.statusDraft.gifs,
            drawings: window.statusDraft.drawings,
            overlays: window.statusDraft.overlays,
            mentions: window.statusDraft.mentions,
            location: window.statusDraft.location,
            music: window.statusDraft.music,
            linkPreview: window.statusDraft.linkPreview,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: window.statusDraft.scheduleTime || new Date(Date.now() + 24 * 60 * 60 * 1000),
            userId: currentUser.uid,
            userDisplayName: currentUserData?.displayName,
            userPhotoURL: currentUserData?.photoURL,
            privacy: window.statusDraft.privacy,
            selectedContacts: window.statusDraft.selectedContacts,
            hideFrom: window.statusDraft.hideFrom,
            exceptContacts: window.statusDraft.exceptContacts,
            viewCount: 0,
            reactionCount: 0,
            replyCount: 0,
            shareCount: 0,
            isScheduled: !!window.statusDraft.scheduleTime
        };
        
        await db.collection('statuses').add(statusData);
        
        showToast('Status posted successfully', 'success');
        
        // Close creation modal
        const statusCreation = document.getElementById('statusCreation');
        if (statusCreation) {
            statusCreation.style.display = 'none';
        }
        
        // Reset draft
        window.statusDraft = {
            type: 'text',
            content: '',
            caption: '',
            background: 'default',
            font: 'default',
            color: '#000000',
            stickers: [],
            gifs: [],
            drawings: [],
            overlays: [],
            mentions: [],
            location: null,
            music: null,
            linkPreview: null,
            scheduleTime: null,
            privacy: 'myContacts',
            selectedContacts: [],
            hideFrom: [],
            exceptContacts: []
        };
        
        // Reload statuses
        loadStatusUpdates();
        
    } catch (error) {
        console.error('Error posting status:', error);
        showToast('Error posting status', 'error');
    }
}

// Function 52: setupDrawingCanvas
function setupDrawingCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    canvas.addEventListener('mousedown', (e) => {
        drawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!drawing) return;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        [lastX, lastY] = [e.offsetX, e.offsetY];
        
        // Save drawing to draft
        window.statusDraft.drawings.push({
            x: e.offsetX,
            y: e.offsetY,
            color: '#000000',
            width: 2
        });
    });
    
    canvas.addEventListener('mouseup', () => drawing = false);
    canvas.addEventListener('mouseout', () => drawing = false);
}

// Function 53: handleStatusFileSelect
function handleStatusFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleStatusMediaUpload(file);
    }
}

// Function 54: handleDragOver
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
}

// Function 55: handleStatusFileDrop
function handleStatusFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const file = event.dataTransfer.files[0];
    if (file) {
        handleStatusMediaUpload(file);
    }
}

// Function 56: handleStatusMediaUpload
async function handleStatusMediaUpload(file) {
    try {
        showToast('Uploading media...', 'info');
        
        // Upload to Firebase Storage
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`statuses/${currentUser.uid}/${Date.now()}_${file.name}`);
        const uploadTask = fileRef.put(file);
        
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload progress:', progress);
                // Update progress UI if needed
            },
            (error) => {
                console.error('Upload error:', error);
                showToast('Error uploading media', 'error');
            },
            async () => {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                
                // Update status draft with media
                if (file.type.startsWith('image/')) {
                    window.statusDraft.type = 'image';
                    window.statusDraft.content = downloadURL;
                } else if (file.type.startsWith('video/')) {
                    window.statusDraft.type = 'video';
                    window.statusDraft.content = downloadURL;
                } else if (file.type.startsWith('audio/')) {
                    window.statusDraft.type = 'audio';
                    window.statusDraft.content = downloadURL;
                }
                
                // Show preview
                showMediaPreview(downloadURL, file.type);
                showToast('Media uploaded successfully', 'success');
            }
        );
    } catch (error) {
        console.error('Error uploading media:', error);
        showToast('Error uploading media', 'error');
    }
}

// Function 57: showMediaPreview
function showMediaPreview(url, type) {
    // Hide all previews
    document.querySelectorAll('.status-preview').forEach(preview => {
        preview.classList.add('hidden');
    });
    
    // Show appropriate preview
    if (type.startsWith('image/')) {
        const preview = document.getElementById('imagePreview');
        if (preview) {
            preview.querySelector('img').src = url;
            preview.classList.remove('hidden');
        }
    } else if (type.startsWith('video/')) {
        const preview = document.getElementById('videoPreview');
        if (preview) {
            preview.querySelector('video').src = url;
            preview.classList.remove('hidden');
        }
    } else if (type.startsWith('audio/')) {
        const preview = document.getElementById('audioPreview');
        if (preview) {
            preview.querySelector('audio').src = url;
            preview.classList.remove('hidden');
        }
    }
}

function showStatusUserOptions(event, userId) {
    event.stopPropagation();
    
    const options = document.createElement('div');
    options.className = 'status-user-options-menu';
    options.style.position = 'absolute';
    options.style.top = `${event.clientY}px`;
    options.style.left = `${event.clientX}px`;
    
    options.innerHTML = `
        <div class="status-user-options">
            <button class="status-user-option" onclick="toggleMuteUser('${userId}')">
                <i class="fas fa-volume-mute"></i>
                <span>Mute</span>
            </button>
            <button class="status-user-option" onclick="viewContact('${userId}')">
                <i class="fas fa-user"></i>
                <span>View contact</span>
            </button>
            <button class="status-user-option" onclick="blockStatusUser('${userId}')">
                <i class="fas fa-ban"></i>
                <span>Block from viewing my status</span>
            </button>
            <button class="status-user-option" onclick="reportUserStatuses('${userId}')">
                <i class="fas fa-flag"></i>
                <span>Report statuses</span>
            </button>
        </div>
    `;
    
    document.body.appendChild(options);
    
    // Close on outside click
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!options.contains(e.target)) {
                options.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
}

async function toggleMuteUser(userId) {
    try {
        const isMuted = window.statusPreferences.mutedUsers.includes(userId);
        
        if (isMuted) {
            await db.collection('users').doc(currentUser.uid).update({
                mutedStatusUsers: firebase.firestore.FieldValue.arrayRemove(userId)
            });
            window.statusPreferences.mutedUsers = window.statusPreferences.mutedUsers.filter(id => id !== userId);
            showToast('Unmuted statuses from this user', 'success');
        } else {
            await db.collection('users').doc(currentUser.uid).update({
                mutedStatusUsers: firebase.firestore.FieldValue.arrayUnion(userId)
            });
            window.statusPreferences.mutedUsers.push(userId);
            showToast('Muted statuses from this user', 'success');
        }
        
        // Update status list
        loadStatusUpdates();
        
    } catch (error) {
        console.error('Error toggling mute:', error);
        showToast('Error updating mute settings', 'error');
    }
}
function searchContacts(event) {
    const searchTerm = event.target.value.toLowerCase();
    const contactItems = document.querySelectorAll('.contact-item');
    
    contactItems.forEach(item => {
        const contactName = item.querySelector('.contact-name').textContent.toLowerCase();
        if (contactName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function showHideFromSelector() {
    showContactSelector('hideFrom', 'Select contacts to hide from');
}

function showContactsExceptSelector() {
    showContactSelector('contactsExcept', 'Select contacts to exclude');
}

async function showContactSelector(type = 'selectedContacts', title = 'Select Contacts') {
    try {
        const contactsSnapshot = await db.collection('users')
            .where('friends', 'array-contains', currentUser.uid)
            .limit(50)
            .get();
        
        const modal = document.createElement('div');
        modal.className = 'contact-selector-modal';
        modal.innerHTML = `
            <div class="contact-selector-content">
                <div class="selector-header">
                    <h3>${title}</h3>
                    <input type="text" class="search-contacts" placeholder="Search contacts..." onkeyup="searchContacts(event)">
                </div>
                <div class="contacts-list" id="contactsList">
                    ${contactsSnapshot.docs.map(doc => {
                        const contact = doc.data();
                        const isSelected = window.statusPreferences[type]?.includes(doc.id) || false;
                        return `
                            <label class="contact-item">
                                <input type="checkbox" value="${doc.id}" ${isSelected ? 'checked' : ''}>
                                <img src="${contact.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.displayName)}&background=7C3AED&color=fff`}" 
                                     class="contact-avatar">
                                <div class="contact-info">
                                    <p class="contact-name">${contact.displayName}</p>
                                    <p class="contact-status">${contact.status || 'Online'}</p>
                                </div>
                            </label>
                        `;
                    }).join('')}
                </div>
                <div class="selector-actions">
                    <button class="btn-secondary" onclick="closeContactSelector()">Cancel</button>
                    <button class="btn-primary" onclick="save${type.charAt(0).toUpperCase() + type.slice(1)}Selection()">Save</button>
                </div>
            </div>
        `;
        
        modal.dataset.selectorType = type;
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error showing contact selector:', error);
        showToast('Error loading contacts', 'error');
    }
}

function closeContactSelector() {
    document.querySelector('.contact-selector-modal')?.remove();
}

async function saveSelectedContacts() {
    await saveContactSelection('selectedContacts');
}

async function saveHideFromSelection() {
    await saveContactSelection('hideFrom');
}

async function saveContactsExceptSelection() {
    await saveContactSelection('contactsExcept');
}

async function saveContactSelection(type) {
    const selected = Array.from(document.querySelectorAll('.contact-item input:checked'))
        .map(input => input.value);
    
    // Update privacy with the selected contacts
    if (type === 'selectedContacts') {
        await updateStatusPrivacy('selectedContacts', selected, [], []);
    } else if (type === 'hideFrom') {
        await updateStatusPrivacy('hideFrom', [], selected, []);
    } else if (type === 'contactsExcept') {
        await updateStatusPrivacy('contactsExcept', [], [], selected);
    }
    
    closeContactSelector();
}
// ==================== HELPER FUNCTIONS ====================

function getStatusContentHTML(status) {
    if (status.type === 'text') {
        return `<div class="status-text" style="background: ${status.background || '#7C3AED'}; color: ${status.color || '#ffffff'}; font-family: ${status.font || 'Arial'}">${escapeHtml(status.content)}</div>`;
    } else if (status.type === 'image') {
        return `<img src="${status.content}" class="status-media" alt="Status image" ${window.statusPreferences.contentBlur ? 'style="filter: blur(5px)"' : ''}>`;
    } else if (status.type === 'video') {
        return `<video src="${status.content}" class="status-media" controls ${window.statusPreferences.contentBlur ? 'style="filter: blur(5px)"' : ''}></video>`;
    } else if (status.type === 'audio') {
        return `<audio src="${status.content}" class="status-media" controls></audio>`;
    } else if (status.type === 'emoji') {
        return `<div class="status-emoji">${status.content}</div>`;
    } else if (status.type === 'gif') {
        return `<img src="${status.content}" class="status-gif" alt="GIF">`;
    } else if (status.type === 'share') {
        return `<div class="status-share">Shared: ${escapeHtml(status.content)}</div>`;
    }
    return '<div>Status content</div>';
}
function updateTextStatusPreview() {
    const textInput = document.getElementById('statusTextInput');
    const preview = document.querySelector('.status-text');
    
    if (textInput && preview) {
        window.statusDraft.content = textInput.value;
        preview.textContent = textInput.value;
    }
}

function updateStatusCaption() {
    const captionInput = document.getElementById('statusCaption');
    if (captionInput) {
        window.statusDraft.caption = captionInput.value;
    }
}

function updateBackgroundColor(event) {
    const color = event.target.value;
    const preview = document.querySelector('.status-text');
    
    if (preview) {
        preview.style.backgroundColor = color;
        window.statusDraft.background = color;
    }
}

function updateTextColor(event) {
    const color = event.target.value;
    const preview = document.querySelector('.status-text');
    
    if (preview) {
        preview.style.color = color;
        window.statusDraft.color = color;
    }
}

function updateFontStyle(event) {
    const font = event.target.value;
    const preview = document.querySelector('.status-text');
    
    if (preview) {
        preview.style.fontFamily = font;
        window.statusDraft.font = font;
    }
}

function openStatusEmojiPicker() {
    const emojiPicker = document.createElement('div');
    emojiPicker.className = 'status-emoji-picker';
    emojiPicker.innerHTML = `
        <div class="emoji-picker-grid">
            ${['😀', '😂', '🥰', '😍', '🤩', '😎', '🥳', '😊', '😢', '😡', '❤️', '👍', '👏', '🎉', '🔥', '💯'].map(emoji => `
                <button class="emoji-pick-btn" onclick="addEmojiToStatus('${emoji}')">${emoji}</button>
            `).join('')}
        </div>
    `;
    
    document.body.appendChild(emojiPicker);
    
    // Position it
    const textInput = document.getElementById('statusTextInput');
    if (textInput) {
        const rect = textInput.getBoundingClientRect();
        emojiPicker.style.top = `${rect.bottom + 10}px`;
        emojiPicker.style.left = `${rect.left}px`;
    }
    
    // Close on outside click
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!emojiPicker.contains(e.target) && !e.target.closest('#addEmojiBtn')) {
                emojiPicker.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
}

function addEmojiToStatus(emoji) {
    const textInput = document.getElementById('statusTextInput');
    if (textInput) {
        textInput.value += emoji;
        textInput.focus();
        updateTextStatusPreview();
    }
}

function updatePrivacyIndicator() {
    const privacyIndicator = document.getElementById('privacyIndicator');
    if (privacyIndicator) {
        const privacy = window.statusPreferences.privacy;
        const labels = {
            'myContacts': 'My contacts',
            'selectedContacts': 'Selected contacts',
            'everyone': 'Everyone',
            'contactsExcept': 'Contacts except...',
            'hideFrom': 'Hide from...'
        };
        privacyIndicator.textContent = labels[privacy] || privacy;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

function showErrorState() {
    const statusUpdates = document.getElementById('statusUpdates');
    if (statusUpdates) {
        statusUpdates.innerHTML = `
            <div class="error-status">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Unable to load status updates</p>
                <button onclick="loadStatusUpdates()" class="btn-retry">Try Again</button>
            </div>
        `;
    }
}

function setupStatusModalListeners() {
    console.log('Setting up status modal listeners...');
    
    // Close modal on outside click
    document.addEventListener('click', (e) => {
        const statusCreation = document.getElementById('statusCreation');
        if (statusCreation && e.target === statusCreation) {
            statusCreation.style.display = 'none';
        }
    });
    
    // Handle status type selection
    document.querySelectorAll('.status-option').forEach(option => {
        option.addEventListener('click', () => {
            const type = option.dataset.type;
            selectStatusType(type);
        });
    });
}

function showStatusPrivacySettings() {
    const modal = document.createElement('div');
    modal.className = 'privacy-settings-modal';
    modal.innerHTML = `
        <div class="privacy-settings-content">
            <h3>Status Privacy</h3>
            <div class="privacy-options">
                <label class="privacy-option">
                    <input type="radio" name="statusPrivacy" value="myContacts" 
                           ${window.statusPreferences.privacy === 'myContacts' ? 'checked' : ''}>
                    <div class="privacy-option-info">
                        <h4>My contacts</h4>
                        <p>All your contacts</p>
                    </div>
                </label>
                <label class="privacy-option">
                    <input type="radio" name="statusPrivacy" value="selectedContacts" 
                           ${window.statusPreferences.privacy === 'selectedContacts' ? 'checked' : ''}>
                    <div class="privacy-option-info">
                        <h4>Selected contacts</h4>
                        <p>Only share with selected contacts</p>
                    </div>
                </label>
                <label class="privacy-option">
                    <input type="radio" name="statusPrivacy" value="contactsExcept" 
                           ${window.statusPreferences.privacy === 'contactsExcept' ? 'checked' : ''}>
                    <div class="privacy-option-info">
                        <h4>Contacts except...</h4>
                        <p>All contacts except those you exclude</p>
                    </div>
                </label>
                <label class="privacy-option">
                    <input type="radio" name="statusPrivacy" value="hideFrom" 
                           ${window.statusPreferences.privacy === 'hideFrom' ? 'checked' : ''}>
                    <div class="privacy-option-info">
                        <h4>Hide from...</h4>
                        <p>Hide from specific contacts</p>
                    </div>
                </label>
                <label class="privacy-option">
                    <input type="radio" name="statusPrivacy" value="everyone" 
                           ${window.statusPreferences.privacy === 'everyone' ? 'checked' : ''}>
                    <div class="privacy-option-info">
                        <h4>Everyone</h4>
                        <p>Anyone with your number</p>
                    </div>
                </label>
            </div>
            <div class="privacy-actions">
                <button class="btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">Cancel</button>
                <button class="btn-primary" onclick="savePrivacySettings()">Save</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function savePrivacySettings() {
    const selectedPrivacy = document.querySelector('input[name="statusPrivacy"]:checked').value;
    
    let selectedContacts = [];
    let hideFrom = [];
    let exceptContacts = [];
    
    if (selectedPrivacy === 'selectedContacts') {
        // Show contact selector
        await showContactSelector();
        return;
    } else if (selectedPrivacy === 'hideFrom') {
        // Show hide from selector
        await showHideFromSelector();
        return;
    } else if (selectedPrivacy === 'contactsExcept') {
        // Show contacts except selector
        await showContactsExceptSelector();
        return;
    }
    
    await updateStatusPrivacy(selectedPrivacy, selectedContacts, hideFrom, exceptContacts);
    
    // Close modal
    document.querySelector('.privacy-settings-modal')?.remove();
}

function showStatusSettings() {
    const modal = document.createElement('div');
    modal.className = 'status-settings-modal';
    modal.innerHTML = `
        <div class="status-settings-content">
            <h3>Status Settings</h3>
            <div class="settings-options">
                <label class="settings-option">
                    <input type="checkbox" id="readReceipts" 
                           ${window.statusPreferences.readReceipts ? 'checked' : ''}>
                    <div class="settings-option-info">
                        <h4>Read receipts</h4>
                        <p>Show when you view others' statuses</p>
                    </div>
                </label>
                <label class="settings-option">
                    <input type="checkbox" id="allowReplies" 
                           ${window.statusPreferences.allowReplies ? 'checked' : ''}>
                    <div class="settings-option-info">
                        <h4>Allow replies</h4>
                        <p>Allow others to reply to your statuses</p>
                    </div>
                </label>
                <label class="settings-option">
                    <input type="checkbox" id="autoDownload" 
                           ${window.statusPreferences.autoDownload ? 'checked' : ''}>
                    <div class="settings-option-info">
                        <h4>Auto-download</h4>
                        <p>Automatically download media</p>
                    </div>
                </label>
                <label class="settings-option">
                    <input type="checkbox" id="screenshotAlerts" 
                           ${window.statusPreferences.screenshotAlerts ? 'checked' : ''}>
                    <div class="settings-option-info">
                        <h4>Screenshot alerts</h4>
                        <p>Notify when someone takes a screenshot</p>
                    </div>
                </label>
                <label class="settings-option">
                    <input type="checkbox" id="saveToGallery" 
                           ${window.statusPreferences.saveToGallery ? 'checked' : ''}>
                    <div class="settings-option-info">
                        <h4>Save to gallery</h4>
                        <p>Automatically save status media to gallery</p>
                    </div>
                </label>
                <label class="settings-option">
                    <input type="checkbox" id="contentBlur" 
                           ${window.statusPreferences.contentBlur ? 'checked' : ''}>
                    <div class="settings-option-info">
                        <h4>Blur sensitive content</h4>
                        <p>Blur media marked as sensitive</p>
                    </div>
                </label>
            </div>
            <div class="settings-actions">
                <button class="btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">Cancel</button>
                <button class="btn-primary" onclick="saveStatusSettings()">Save</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function saveStatusSettings() {
    try {
        const updates = {
            statusReadReceipts: document.getElementById('readReceipts').checked,
            allowStatusReplies: document.getElementById('allowReplies').checked,
            autoDownloadStatus: document.getElementById('autoDownload').checked,
            screenshotAlerts: document.getElementById('screenshotAlerts').checked,
            saveStatusToGallery: document.getElementById('saveToGallery').checked,
            contentBlur: document.getElementById('contentBlur').checked
        };
        
        await db.collection('users').doc(currentUser.uid).update(updates);
        
        // Update local preferences
        window.statusPreferences.readReceipts = updates.statusReadReceipts;
        window.statusPreferences.allowReplies = updates.allowStatusReplies;
        window.statusPreferences.autoDownload = updates.autoDownloadStatus;
        window.statusPreferences.screenshotAlerts = updates.screenshotAlerts;
        window.statusPreferences.saveToGallery = updates.saveStatusToGallery;
        window.statusPreferences.contentBlur = updates.contentBlur;
        
        showToast('Settings saved', 'success');
        
        // Close modal
        document.querySelector('.status-settings-modal')?.remove();
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
    }
}

function setupSwipeGestures() {
    let startX, startY, endX, endY;
    const threshold = 50; // Minimum swipe distance
    
    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });
    
    document.addEventListener('touchend', (e) => {
        if (!startX || !startY) return;
        
        endX = e.changedTouches[0].clientX;
        endY = e.changedTouches[0].clientY;
        
        const diffX = startX - endX;
        const diffY = startY - endY;
        
        // Check if swipe is mostly horizontal
        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Check if we're in status viewer
            if (document.getElementById('statusViewer') && currentStatusViewing) {
                if (diffX > threshold) {
                    // Swipe left - next status
                    showNextStatus();
                } else if (diffX < -threshold) {
                    // Swipe right - previous status
                    showPrevStatus();
                }
            }
        }
        
        // Reset
        startX = null;
        startY = null;
    });
}

async function showStatusAnalytics(statusId) {
    try {
        const [statusDoc, viewsSnapshot, reactionsSnapshot] = await Promise.all([
            db.collection('statuses').doc(statusId).get(),
            db.collection('statusViews').where('statusId', '==', statusId).get(),
            db.collection('statusReactions').where('statusId', '==', statusId).get()
        ]);
        
        if (!statusDoc.exists) {
            showToast('Status not found', 'error');
            return;
        }
        
        const status = statusDoc.data();
        const views = viewsSnapshot.docs.map(doc => doc.data());
        const reactions = reactionsSnapshot.docs.map(doc => doc.data());
        
        const modal = document.createElement('div');
        modal.className = 'analytics-modal';
        modal.innerHTML = `
            <div class="analytics-content">
                <div class="analytics-header">
                    <h3>Status Analytics</h3>
                    <button class="btn-close" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="analytics-stats">
                    <div class="stat-item">
                        <h4>${status.viewCount || 0}</h4>
                        <p>Views</p>
                    </div>
                    <div class="stat-item">
                        <h4>${status.reactionCount || 0}</h4>
                        <p>Reactions</p>
                    </div>
                    <div class="stat-item">
                        <h4>${status.replyCount || 0}</h4>
                        <p>Replies</p>
                    </div>
                    <div class="stat-item">
                        <h4>${status.shareCount || 0}</h4>
                        <p>Shares</p>
                    </div>
                </div>
                <div class="analytics-charts">
                    <div class="chart-container">
                        <h4>Views Over Time</h4>
                        <div class="chart-placeholder">Chart would appear here</div>
                    </div>
                    <div class="analytics-details">
                        <h4>Top Viewers</h4>
                        <div class="top-viewers">
                            ${views.slice(0, 5).map(view => `
                                <div class="viewer-detail">
                                    <img src="${view.userPhotoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(view.userDisplayName)}&background=7C3AED&color=fff`}" 
                                         class="viewer-avatar">
                                    <span>${view.userDisplayName}</span>
                                    <span class="view-time">${formatTimeAgo(view.viewedAt)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <h4>Popular Reactions</h4>
                        <div class="top-reactions">
                            ${getReactionCounts(reactions).slice(0, 3).map(([reaction, count]) => `
                                <div class="reaction-detail">
                                    <span class="reaction-emoji">${reaction}</span>
                                    <span class="reaction-count">${count}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error showing analytics:', error);
        showToast('Error loading analytics', 'error');
    }
}

function getReactionCounts(reactions) {
    const counts = {};
    reactions.forEach(reaction => {
        counts[reaction.reaction] = (counts[reaction.reaction] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function selectStatusType(type) {
    window.statusDraft.type = type;
    
    // Update UI
    document.querySelectorAll('.status-option').forEach(opt => {
        opt.classList.remove('active');
    });
    document.querySelector(`.status-option[data-type="${type}"]`).classList.add('active');
    
    // Show appropriate preview
    document.querySelectorAll('.status-preview').forEach(preview => {
        preview.classList.add('hidden');
    });
    document.getElementById(`${type}Preview`)?.classList.remove('hidden');
}

// ==================== EXPORTS ====================

window.initStatusSystem = initStatusSystem;
window.loadStatusUpdates = loadStatusUpdates;
window.openStatusCreation = openStatusCreation;
window.openStatusViewer = openStatusViewer;
window.closeStatusViewer = closeStatusViewer;
window.postStatus = postStatus;
window.deleteStatus = deleteStatus;
window.shareStatus = shareStatus;
window.likeStatus = likeStatus;
window.sendStatusReply = sendStatusReply;
window.showStatusAnalytics = showStatusAnalytics;
window.updateStatusPrivacy = updateStatusPrivacy;
window.toggleMuteUser = toggleMuteUser;
window.loadNextUserStatuses = loadNextUserStatuses;
window.showViewersList = showViewersList;
window.showReplyOptions = showReplyOptions;
window.showStatusReactions = showStatusReactions;
window.showContactSelector = showContactSelector;
window.blockStatusUser = blockStatusUser;
window.messageUser = messageUser;
window.callUser = callUser;
window.viewContact = viewContact;
window.copyStatusLink = copyStatusLink;
window.shareToContact = shareToContact;
window.shareToOtherApp = shareToOtherApp;
window.updateReactionCount = updateReactionCount;
window.setupStatusRealtimeUpdates = setupStatusRealtimeUpdates;
window.updateStatusInUI = updateStatusInUI;
window.removeStatusFromUI = removeStatusFromUI;
window.showMyStatusOptions = showMyStatusOptions;
window.saveStatus = saveStatus;
window.reportStatus = reportStatus;
window.forwardStatus = forwardStatus;
window.archiveStatus = archiveStatus;
window.searchStatuses = searchStatuses;
window.showStatusUserOptions = showStatusUserOptions;
window.showStatusSettings = showStatusSettings;
window.showStatusPrivacySettings = showStatusPrivacySettings;
window.saveStatusDraft = saveStatusDraft;
window.openStatusEmojiPicker = openStatusEmojiPicker;
window.updateTextStatusPreview = updateTextStatusPreview;
window.updateBackgroundColor = updateBackgroundColor;
window.updateTextColor = updateTextColor;
window.updateFontStyle = updateFontStyle;
window.addEmojiToStatus = addEmojiToStatus;
window.savePrivacySettings = savePrivacySettings;
window.saveStatusSettings = saveStatusSettings;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('statusUpdates')) {
        console.log('Not on chat page, skipping status initialization');
        return;
    }
    
    const checkFirebase = setInterval(() => {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0 && currentUser) {
            clearInterval(checkFirebase);
            console.log('🚀 Initializing WhatsApp Status system...');
            initStatusSystem();
        }
    }, 500);
});

console.log('✅ status.js loaded - Complete WhatsApp Status System Ready');