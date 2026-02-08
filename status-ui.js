// =============================================
// STATUS SYSTEM - UI COMPONENTS
// =============================================

import {
    currentUser,
    userData,
    statuses,
    myStatuses,
    friendsStatuses,
    closeFriendsStatuses,
    pinnedStatuses,
    mutedStatuses,
    microCirclesStatuses,
    highlights,
    drafts,
    scheduledStatuses,
    viewedStatuses,
    mutedUsers,
    currentViewerStatus,
    currentSlideIndex,
    autoAdvanceInterval,
    isAutoAdvancePaused,
    progressInterval,
    currentCategoryFilter,
    currentIntentFilter,
    currentMoodFilter,
    isMobile,
    isOfflineMode,
    pendingReplies,
    pendingReactions,
    moodChartData,
    streakCount,
    lastPostDate,
    activeFilters,
    selectedDraft,
    apiReadyReceived,
    apiCheckInterval,
    authValidated,
    authChecked,
    isBackgroundInitialized,
    isTokenReady,
    tokenReadyCallbacks,
    pendingApiRequests,
    parentCoordinator,
    statusTypes,
    statusIntents,
    statusMoods,
    statusCategories,
    actionButtons,
    privacySettings,
    durationOptions,
    reportReasons,
    reactions,
    emojis,
    backgroundOptions,
    statusTemplates,
    LOCAL_STORAGE_KEYS,
    UNIFIED_TOKEN_KEY,
    initializeParentCoordination,
    startHandshakeProtocol,
    sendToParent,
    handleSessionData,
    validateSessionData,
    updateLocalStateWithSession,
    handleSessionUpdate,
    handleLogout,
    handleParentUnavailable,
    startBackgroundInitializationWithSession,
    makeParentApiRequest,
    handleApiResponse,
    handleApiError,
    handleAuthValidated,
    waitForTokenReady,
    onTokenReady,
    triggerTokenReadyCallbacks,
    getUnifiedToken,
    migrateLegacyTokens,
    isAuthenticated,
    queueApiRequest,
    processPendingApiRequests,
    startTokenReadinessCheck,
    secureApiCall,
    initializeUIWithCachedData,
    loadUserFromCache,
    loadCachedDataInstantly,
    startBackgroundInitialization,
    loadFreshDataInBackground,
    safeApiOperation,
    loadStatusesInBackground,
    loadMyStatusesInBackground,
    loadHighlightsInBackground,
    loadUserDataInBackground,
    bootstrapApplication,
    handleAuthError,
    initializeStatusSystem,
    loadInitialData,
    filterStatusesByPrivacy,
    getStatusPreviewText,
    updateCurrentSection,
    filterStatusesByType,
    getEmptyStateMessage,
    addReactionToStatus,
    voteOnPoll,
    pinStatus,
    unpinStatus,
    muteUser,
    unmuteUser,
    postStatus,
    updateStreakCounter,
    scheduleStatus,
    saveDraft,
    reportStatus,
    escapeHtml,
    formatTimeAgo,
    retryOperation,
    generateSampleMoodData,
    initPageCore
} from './status-core.js';

// DOM Elements
const createStatusModal = document.getElementById('createStatusModal');
const draftsModal = document.getElementById('draftsModal');
const highlightsModal = document.getElementById('highlightsModal');
const highlightsEditorModal = document.getElementById('highlightsEditorModal');
const memoryTimelineModal = document.getElementById('memoryTimelineModal');
const statsModal = document.getElementById('statsModal');
const scheduleModal = document.getElementById('scheduleModal');
const reportModal = document.getElementById('reportModal');
const statusViewerPanel = document.getElementById('statusViewerPanel');
const notification = document.getElementById('notification');
const errorUI = document.getElementById('errorUI');

// Status sections
const allStatusSection = document.getElementById('allStatusSection');
const friendsStatusSection = document.getElementById('friendsStatusSection');
const closeFriendsStatusSection = document.getElementById('closeFriendsStatusSection');
const pinnedStatusSection = document.getElementById('pinnedStatusSection');
const mutedStatusSection = document.getElementById('mutedStatusSection');
const microCirclesStatusSection = document.getElementById('microCirclesStatusSection');
const myStatusSection = document.getElementById('myStatusSection');

const allStatusList = document.getElementById('allStatusList');
const friendsStatusList = document.getElementById('friendsStatusList');
const closeFriendsStatusList = document.getElementById('closeFriendsStatusList');
const pinnedStatusList = document.getElementById('pinnedStatusList');
const mutedStatusList = document.getElementById('mutedStatusList');
const microCirclesStatusList = document.getElementById('microCirclesStatusList');
const myStatusList = document.getElementById('myStatusList');

// =============================================
// UI COMPONENTS INITIALIZATION
// =============================================

/**
 * Initialize all UI components
 */
function initializeUIComponents() {
    // Initialize emoji picker
    if (document.getElementById('emojiGrid')) {
        initializeEmojiPicker();
    }
    
    // Initialize background options
    if (document.getElementById('backgroundGrid')) {
        initializeBackgroundOptions();
    }
    
    // Initialize intent options
    if (document.getElementById('intentOptions')) {
        initializeIntentOptions();
    }
    
    // Initialize mood options
    if (document.getElementById('moodOptions')) {
        initializeMoodOptions();
    }
    
    // Initialize category options
    if (document.getElementById('categoryOptions')) {
        initializeCategoryOptions();
    }
    
    // Initialize action buttons selector
    if (document.getElementById('actionButtonsSelector')) {
        initializeActionButtonsSelector();
    }
    
    // Initialize privacy options
    if (document.getElementById('privacyOptions')) {
        initializePrivacyOptions();
    }
    
    // Initialize duration options
    if (document.getElementById('durationOptions')) {
        initializeDurationOptions();
    }
    
    // Initialize template options
    if (document.getElementById('templateOptions')) {
        initializeTemplateOptions();
    }
    
    // Initialize report reasons
    if (document.getElementById('reportReasons')) {
        initializeReportReasons();
    }
    
    // Initialize reactions
    if (document.getElementById('reactionsContainer')) {
        initializeReactions();
    }
    
    // Initialize poll options
    if (document.getElementById('pollOptionsContainer')) {
        initializePollOptions();
    }
    
    // Initialize highlight color options
    if (document.getElementById('highlightColorGrid')) {
        initializeHighlightColorOptions();
    }
    
    // Initialize highlight privacy options
    if (document.getElementById('highlightPrivacyOptions')) {
        initializeHighlightPrivacyOptions();
    }
    
    // Initialize repeat options
    if (document.getElementById('repeatOptions')) {
        initializeRepeatOptions();
    }
}

/**
 * Initialize emoji picker
 */
function initializeEmojiPicker() {
    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) return;
    
    emojiGrid.innerHTML = '';
    emojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-btn';
        emojiBtn.textContent = emoji;
        emojiBtn.title = `Add ${emoji}`;
        emojiBtn.addEventListener('click', () => {
            const textInput = document.getElementById('textStatusInput');
            if (textInput) {
                textInput.value += emoji;
                textInput.focus();
                updateTextStatusCounter();
            }
        });
        emojiGrid.appendChild(emojiBtn);
    });
}

/**
 * Initialize background options
 */
function initializeBackgroundOptions() {
    const backgroundGrid = document.getElementById('backgroundGrid');
    if (!backgroundGrid) return;
    
    backgroundGrid.innerHTML = '';
    backgroundOptions.forEach(bg => {
        const bgOption = document.createElement('div');
        bgOption.className = 'background-option';
        bgOption.dataset.bg = bg.id;
        bgOption.dataset.type = bg.type;
        
        if (bg.type === 'solid') {
            bgOption.style.backgroundColor = bg.color;
            bgOption.textContent = 'A';
        } else if (bg.type === 'gradient') {
            bgOption.style.background = bg.gradient;
            bgOption.textContent = 'G';
        }
        
        bgOption.title = `Background ${bg.id}`;
        bgOption.addEventListener('click', () => {
            document.querySelectorAll('.background-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            bgOption.classList.add('selected');
            localStorage.setItem('selected_background', bg.id);
        });
        
        backgroundGrid.appendChild(bgOption);
    });
    
    const firstBg = backgroundGrid.querySelector('.background-option');
    if (firstBg) {
        firstBg.classList.add('selected');
    }
}

/**
 * Initialize intent options
 */
function initializeIntentOptions() {
    const intentOptions = document.getElementById('intentOptions');
    if (!intentOptions) return;
    
    intentOptions.innerHTML = '';
    Object.entries(statusIntents).forEach(([key, intent]) => {
        const intentOption = document.createElement('div');
        intentOption.className = 'intent-option';
        intentOption.dataset.intent = key;
        intentOption.innerHTML = `
            <div class="intent-icon" style="color: ${intent.color}">
                <i class="${intent.icon}"></i>
            </div>
            <div class="intent-name">${intent.name}</div>
        `;
        
        intentOption.addEventListener('click', () => {
            document.querySelectorAll('.intent-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            intentOption.classList.add('selected');
            localStorage.setItem('selected_intent', key);
        });
        
        intentOptions.appendChild(intentOption);
    });
}

/**
 * Initialize mood options
 */
function initializeMoodOptions() {
    const moodOptions = document.getElementById('moodOptions');
    if (!moodOptions) return;
    
    moodOptions.innerHTML = '';
    Object.entries(statusMoods).forEach(([key, mood]) => {
        const moodOption = document.createElement('div');
        moodOption.className = 'mood-option';
        moodOption.dataset.mood = key;
        moodOption.classList.add(key);
        moodOption.textContent = mood.emoji;
        moodOption.title = mood.name;
        
        moodOption.addEventListener('click', () => {
            document.querySelectorAll('.mood-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            moodOption.classList.add('selected');
            localStorage.setItem('selected_mood', key);
        });
        
        moodOptions.appendChild(moodOption);
    });
}

/**
 * Initialize category options
 */
function initializeCategoryOptions() {
    const categoryOptions = document.getElementById('categoryOptions');
    if (!categoryOptions) return;
    
    categoryOptions.innerHTML = '';
    Object.entries(statusCategories).forEach(([key, category]) => {
        const categoryOption = document.createElement('div');
        categoryOption.className = 'category-option';
        categoryOption.dataset.category = key;
        categoryOption.textContent = category.name;
        
        categoryOption.addEventListener('click', () => {
            document.querySelectorAll('.category-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            categoryOption.classList.add('selected');
            localStorage.setItem('selected_category', key);
        });
        
        categoryOptions.appendChild(categoryOption);
    });
}

/**
 * Initialize action buttons selector
 */
function initializeActionButtonsSelector() {
    const actionButtonsSelector = document.getElementById('actionButtonsSelector');
    if (!actionButtonsSelector) return;
    
    actionButtonsSelector.innerHTML = '';
    Object.entries(actionButtons).forEach(([key, button]) => {
        const buttonOption = document.createElement('div');
        buttonOption.className = 'action-button-option';
        buttonOption.dataset.action = key;
        buttonOption.innerHTML = `
            <div style="font-size: 20px; margin-bottom: 8px; color: ${button.color}">
                <i class="${button.icon}"></i>
            </div>
            <div style="font-size: 12px;">${button.name}</div>
        `;
        
        buttonOption.addEventListener('click', () => {
            buttonOption.classList.toggle('selected');
            
            const selectedActions = Array.from(document.querySelectorAll('.action-button-option.selected')).map(opt => opt.dataset.action);
            localStorage.setItem('selected_actions', JSON.stringify(selectedActions));
        });
        
        actionButtonsSelector.appendChild(buttonOption);
    });
}

/**
 * Initialize privacy options
 */
function initializePrivacyOptions() {
    const privacyOptions = document.getElementById('privacyOptions');
    if (!privacyOptions) return;
    
    privacyOptions.innerHTML = '';
    Object.entries(privacySettings).forEach(([key, privacy]) => {
        const privacyOption = document.createElement('div');
        privacyOption.className = 'privacy-option';
        privacyOption.dataset.privacy = key;
        privacyOption.innerHTML = `
            <div class="privacy-icon">
                <i class="${privacy.icon}"></i>
            </div>
            <div class="privacy-details">
                <div class="privacy-name">${privacy.name}</div>
                <div class="privacy-description">${privacy.description}</div>
            </div>
        `;
        
        privacyOption.addEventListener('click', () => {
            document.querySelectorAll('.privacy-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            privacyOption.classList.add('selected');
            localStorage.setItem('selected_privacy', key);
        });
        
        privacyOptions.appendChild(privacyOption);
    });
    
    const friendsPrivacy = privacyOptions.querySelector('[data-privacy="friends"]');
    if (friendsPrivacy) {
        friendsPrivacy.classList.add('selected');
    }
}

/**
 * Initialize duration options
 */
function initializeDurationOptions() {
    const durationOptionsElement = document.getElementById('durationOptions');
    if (!durationOptionsElement) return;
    
    durationOptionsElement.innerHTML = '';
    Object.entries(durationOptions).forEach(([key, duration]) => {
        const durationOption = document.createElement('div');
        durationOption.className = 'duration-option';
        durationOption.dataset.duration = key;
        durationOption.textContent = duration;
        
        durationOption.addEventListener('click', () => {
            document.querySelectorAll('.duration-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            durationOption.classList.add('selected');
            localStorage.setItem('selected_duration', key);
        });
        
        durationOptionsElement.appendChild(durationOption);
    });
    
    const dayDuration = durationOptionsElement.querySelector('[data-duration="86400"]');
    if (dayDuration) {
        dayDuration.classList.add('selected');
    }
}

/**
 * Initialize template options
 */
function initializeTemplateOptions() {
    const templateOptions = document.getElementById('templateOptions');
    if (!templateOptions) return;
    
    templateOptions.innerHTML = '';
    Object.entries(statusTemplates).forEach(([key, template]) => {
        const templateOption = document.createElement('div');
        templateOption.className = 'category-option';
        templateOption.dataset.template = key;
        templateOption.textContent = template.name;
        
        templateOption.addEventListener('click', () => {
            const textInput = document.getElementById('textStatusInput');
            if (textInput) {
                textInput.value = template.text;
                updateTextStatusCounter();
            }
            
            const bgOption = document.querySelector(`.background-option[data-bg="${template.background}"]`);
            if (bgOption) {
                document.querySelectorAll('.background-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                bgOption.classList.add('selected');
            }
            
            if (template.mood) {
                const moodOption = document.querySelector(`.mood-option[data-mood="${template.mood}"]`);
                if (moodOption) {
                    document.querySelectorAll('.mood-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    moodOption.classList.add('selected');
                }
            }
            
            if (template.intent) {
                const intentOption = document.querySelector(`.intent-option[data-intent="${template.intent}"]`);
                if (intentOption) {
                    document.querySelectorAll('.intent-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    intentOption.classList.add('selected');
                }
            }
            
            showNotification(`"${template.name}" template applied`, 'success');
        });
        
        templateOptions.appendChild(templateOption);
    });
}

/**
 * Initialize report reasons
 */
function initializeReportReasons() {
    const reportReasonsElement = document.getElementById('reportReasons');
    if (!reportReasonsElement) return;
    
    reportReasonsElement.innerHTML = '';
    Object.entries(reportReasons).forEach(([key, reason]) => {
        const reasonOption = document.createElement('div');
        reasonOption.className = 'category-option';
        reasonOption.dataset.reason = key;
        reasonOption.textContent = reason;
        
        reasonOption.addEventListener('click', () => {
            document.querySelectorAll('#reportReasons .category-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            reasonOption.classList.add('selected');
            updateReportSubmitButton();
        });
        
        reportReasonsElement.appendChild(reasonOption);
    });
}

/**
 * Initialize reactions
 */
function initializeReactions() {
    const reactionsContainer = document.getElementById('reactionsContainer');
    if (!reactionsContainer) return;
    
    reactionsContainer.innerHTML = '';
    Object.entries(reactions).forEach(([key, emoji]) => {
        const reactionBtn = document.createElement('button');
        reactionBtn.className = 'reaction-btn';
        reactionBtn.dataset.reaction = key;
        reactionBtn.textContent = emoji;
        reactionBtn.title = key.charAt(0).toUpperCase() + key.slice(1);
        
        reactionBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                addReactionToStatus(currentViewerStatus.id, key).then(() => {
                    reactionBtn.classList.add('selected');
                    
                    document.querySelectorAll('.reaction-btn').forEach(btn => {
                        if (btn !== reactionBtn) {
                            btn.classList.remove('selected');
                        }
                    });
                }).catch(error => {
                    showNotification('Failed to add reaction', 'error');
                });
            }
        });
        
        reactionsContainer.appendChild(reactionBtn);
    });
}

/**
 * Initialize poll options
 */
function initializePollOptions() {
    const pollOptionsContainer = document.getElementById('pollOptionsContainer');
    if (!pollOptionsContainer) return;
    
    pollOptionsContainer.innerHTML = '';
    
    for (let i = 1; i <= 2; i++) {
        addPollOption(i);
    }
}

/**
 * Add poll option
 * @param {number} index - Option index
 */
function addPollOption(index) {
    const pollOptionsContainer = document.getElementById('pollOptionsContainer');
    if (!pollOptionsContainer) return;
    
    const optionItem = document.createElement('div');
    optionItem.className = 'poll-option-item';
    optionItem.innerHTML = `
        <div class="poll-option-number">${index}</div>
        <div class="poll-option-input-wrapper">
            <input type="text" class="text-input poll-option-input" placeholder="Option ${index}" data-index="${index}">
            ${index > 2 ? `
            <button class="remove-poll-option" type="button">
                <i class="fas fa-times"></i>
            </button>
            ` : ''}
        </div>
    `;
    
    const removeBtn = optionItem.querySelector('.remove-poll-option');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            if (pollOptionsContainer.children.length > 2) {
                optionItem.remove();
                updatePollOptionNumbers();
            } else {
                showNotification('Minimum 2 options required', 'warning');
            }
        });
    }
    
    pollOptionsContainer.appendChild(optionItem);
}

/**
 * Update poll option numbers
 */
function updatePollOptionNumbers() {
    const pollOptions = document.querySelectorAll('.poll-option-item');
    pollOptions.forEach((item, index) => {
        const numberElement = item.querySelector('.poll-option-number');
        const inputElement = item.querySelector('.poll-option-input');
        const removeBtn = item.querySelector('.remove-poll-option');
        
        if (numberElement) {
            numberElement.textContent = index + 1;
        }
        
        if (inputElement) {
            inputElement.dataset.index = index + 1;
            inputElement.placeholder = `Option ${index + 1}`;
        }
        
        if (removeBtn && index >= 2) {
            removeBtn.style.display = 'block';
        } else if (removeBtn) {
            removeBtn.style.display = 'none';
        }
    });
}

/**
 * Initialize highlight color options
 */
function initializeHighlightColorOptions() {
    const highlightColorGrid = document.getElementById('highlightColorGrid');
    if (!highlightColorGrid) return;
    
    highlightColorGrid.innerHTML = '';
    backgroundOptions.forEach(bg => {
        const colorOption = document.createElement('div');
        colorOption.className = 'background-option';
        colorOption.dataset.bg = bg.id;
        colorOption.dataset.type = bg.type;
        
        if (bg.type === 'solid') {
            colorOption.style.backgroundColor = bg.color;
            colorOption.textContent = 'A';
        } else if (bg.type === 'gradient') {
            colorOption.style.background = bg.gradient;
            colorOption.textContent = 'G';
        }
        
        colorOption.title = `Color ${bg.id}`;
        colorOption.addEventListener('click', () => {
            document.querySelectorAll('#highlightColorGrid .background-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            colorOption.classList.add('selected');
        });
        
        highlightColorGrid.appendChild(colorOption);
    });
    
    const firstColor = highlightColorGrid.querySelector('.background-option');
    if (firstColor) {
        firstColor.classList.add('selected');
    }
}

/**
 * Initialize highlight privacy options
 */
function initializeHighlightPrivacyOptions() {
    const highlightPrivacyOptions = document.getElementById('highlightPrivacyOptions');
    if (!highlightPrivacyOptions) return;
    
    highlightPrivacyOptions.innerHTML = '';
    ['everyone', 'friends', 'close-friends'].forEach(privacyKey => {
        const privacy = privacySettings[privacyKey];
        if (!privacy) return;
        
        const privacyOption = document.createElement('div');
        privacyOption.className = 'privacy-option';
        privacyOption.dataset.privacy = privacyKey;
        privacyOption.innerHTML = `
            <div class="privacy-icon">
                <i class="${privacy.icon}"></i>
            </div>
            <div class="privacy-details">
                <div class="privacy-name">${privacy.name}</div>
                <div class="privacy-description">${privacy.description}</div>
            </div>
        `;
        
        privacyOption.addEventListener('click', () => {
            document.querySelectorAll('#highlightPrivacyOptions .privacy-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            privacyOption.classList.add('selected');
        });
        
        highlightPrivacyOptions.appendChild(privacyOption);
    });
    
    const friendsPrivacy = highlightPrivacyOptions.querySelector('[data-privacy="friends"]');
    if (friendsPrivacy) {
        friendsPrivacy.classList.add('selected');
    }
}

/**
 * Initialize repeat options
 */
function initializeRepeatOptions() {
    const repeatOptions = document.getElementById('repeatOptions');
    if (!repeatOptions) return;
    
    repeatOptions.innerHTML = '';
    const repeatOptionsData = {
        'none': 'Don\'t repeat',
        'daily': 'Daily',
        'weekly': 'Weekly',
        'monthly': 'Monthly'
    };
    
    Object.entries(repeatOptionsData).forEach(([key, text]) => {
        const repeatOption = document.createElement('div');
        repeatOption.className = 'repeat-option';
        repeatOption.dataset.repeat = key;
        repeatOption.textContent = text;
        
        repeatOption.addEventListener('click', () => {
            document.querySelectorAll('.repeat-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            repeatOption.classList.add('selected');
        });
        
        repeatOptions.appendChild(repeatOption);
    });
    
    const noneOption = repeatOptions.querySelector('[data-repeat="none"]');
    if (noneOption) {
        noneOption.classList.add('selected');
    }
}

// =============================================
// INSTANT UI RENDERING WITH CACHED DATA
// =============================================

/**
 * Update user UI instantly without waiting for API
 */
export function updateUserUIInstantly() {
    if (!currentUser) return;
    
    const avatarElements = document.querySelectorAll('.user-avatar, .status-avatar, .my-status-avatar');
    avatarElements.forEach(avatar => {
        if (currentUser.photoURL) {
            avatar.style.backgroundImage = `url('${escapeHtml(currentUser.photoURL)}')`;
            avatar.innerHTML = '';
        } else if (currentUser.displayName) {
            const initials = currentUser.displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            avatar.innerHTML = `<span>${initials}</span>`;
        }
    });
    
    const nameElements = document.querySelectorAll('.user-name, .status-user-name');
    nameElements.forEach(element => {
        if (currentUser.displayName) {
            element.textContent = currentUser.displayName;
        }
    });
    
    updateMyStatusPreview();
    
    const createStatusBtn = document.getElementById('createStatusBtn');
    if (createStatusBtn) {
        createStatusBtn.disabled = false;
    }
}

/**
 * Render status list instantly from cache
 */
export function renderStatusListInstantly() {
    if (!allStatusList) return;
    
    allStatusList.innerHTML = '';
    
    if (statuses.length === 0) {
        allStatusList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No statuses yet</p>
                <p class="subtext">Be the first to post a status!</p>
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    statuses.slice(0, 20).forEach(status => {
        addStatusItemInstant(status, fragment);
    });
    
    allStatusList.appendChild(fragment);
    allStatusList.classList.add('instant-load');
}

/**
 * Add status item instantly (for offline cache display)
 * @param {Object} statusData - Status data
 * @param {DocumentFragment} container - Container element
 */
function addStatusItemInstant(statusData, container) {
    const statusItem = document.createElement('div');
    statusItem.className = 'status-item';
    statusItem.dataset.statusId = statusData.id;
    statusItem.dataset.userId = statusData.userId;
    
    const user = statusData.user || { displayName: 'Unknown User', photoURL: '', id: statusData.userId };
    const initials = user.displayName ? 
        user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const isViewed = viewedStatuses.has(statusData.id);
    const isPinned = statusData.isPinned || false;
    const isMuted = mutedUsers.has(statusData.userId);
    const mood = statusData.mood || 'happy';
    const intent = statusData.intent || 'reflection';
    const category = statusData.category || 'life';
    
    let previewText = '';
    if (statusData.type === 'text') {
        previewText = statusData.text || 'Text status';
    } else if (statusData.type === 'media') {
        previewText = `<i class="fas fa-image"></i> Media status`;
        if (statusData.caption) {
            previewText += `: ${statusData.caption}`;
        }
    } else if (statusData.type === 'poll') {
        previewText = `<i class="fas fa-poll"></i> Poll: ${statusData.question || 'Poll status'}`;
    }
    
    const timeAgo = statusData.createdAt ? formatTimeAgo(new Date(statusData.createdAt)) : 'Just now';
    
    statusItem.innerHTML = `
        <div class="status-avatar">
            <div class="status-ring ${isViewed ? 'viewed' : ''}"></div>
            <div class="status-avatar-inner" ${user.photoURL ? `style="background-image: url('${escapeHtml(user.photoURL)}')"` : ''}>
                ${user.photoURL ? '' : `<span>${initials}</span>`}
            </div>
            <div class="status-indicators">
                ${mood ? `<div class="status-indicator mood" style="background-color: ${statusMoods[mood]?.color || 'var(--mood-happy)'}" title="${statusMoods[mood]?.name || 'Mood'}"></div>` : ''}
                ${intent ? `<div class="status-indicator intent" style="background-color: ${statusIntents[intent]?.color || 'var(--intent-feedback)'}" title="${statusIntents[intent]?.name || 'Intent'}"></div>` : ''}
                ${isPinned ? `<div class="status-indicator pinned" title="Pinned Status"></div>` : ''}
                ${isMuted ? `<div class="status-indicator muted" title="Muted User"></div>` : ''}
            </div>
        </div>
        <div class="status-info">
            <div class="status-name">
                <span class="status-name-text">${escapeHtml(user.displayName || 'Unknown User')}</span>
                <span class="status-time">${timeAgo}</span>
            </div>
            <div class="status-details">
                <span class="status-type" style="color: ${statusTypes[statusData.type]?.color || 'var(--primary-color)'}">
                    <i class="${statusTypes[statusData.type]?.icon || 'fas fa-comment'}"></i>
                    ${statusTypes[statusData.type]?.name || 'Status'}
                </span>
                ${statusData.isSensitive ? '<span class="status-tag privacy"><i class="fas fa-eye-slash"></i> Sensitive</span>' : ''}
                ${statusData.isSilent ? '<span class="status-tag privacy"><i class="fas fa-bell-slash"></i> Silent</span>' : ''}
            </div>
            <div class="status-preview ${statusData.type === 'media' || statusData.type === 'poll' ? statusData.type : ''}">
                ${previewText}
            </div>
            <div class="status-tags">
                ${mood ? `<span class="status-tag mood"><i class="fas fa-brain"></i> ${statusMoods[mood]?.name || 'Mood'}</span>` : ''}
                ${intent ? `<span class="status-tag intent"><i class="fas fa-bullseye"></i> ${statusIntents[intent]?.name || 'Intent'}</span>` : ''}
                ${category ? `<span class="status-tag category"><i class="${statusCategories[category]?.icon || 'fas fa-tag'}"></i> ${statusCategories[category]?.name || 'Category'}</span>` : ''}
                ${statusData.privacy ? `<span class="status-tag privacy"><i class="${privacySettings[statusData.privacy]?.icon || 'fas fa-lock'}"></i> ${privacySettings[statusData.privacy]?.name || 'Privacy'}</span>` : ''}
            </div>
        </div>
        <div class="status-actions">
            <button class="status-action-btn" data-action="view" title="View Status">
                <i class="fas fa-eye"></i>
            </button>
            ${isPinned ? `
            <button class="status-action-btn warning" data-action="unpin" title="Unpin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="pin" title="Pin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            `}
            ${isMuted ? `
            <button class="status-action-btn" data-action="unmute" title="Unmute User">
                <i class="fas fa-volume-up"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="mute" title="Mute User">
                <i class="fas fa-volume-mute"></i>
            </button>
            `}
        </div>
    `;
    
    statusItem.addEventListener('click', (e) => {
        if (!e.target.closest('.status-actions')) {
            showStatusViewer(statusData);
        }
    });
    
    const actionButtons = statusItem.querySelectorAll('.status-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleStatusAction(action, statusData, btn);
        });
    });
    
    container.appendChild(statusItem);
}

// =============================================
// UI HELPER FUNCTIONS
// =============================================

/**
 * Update my status preview
 */
export function updateMyStatusPreview() {
    const myStatusRing = document.getElementById('myStatusRing');
    const myStatusAvatar = document.getElementById('myStatusAvatar');
    const myStatusIndicator = document.getElementById('myStatusIndicator');
    const myStatusText = document.getElementById('myStatusText');
    
    if (currentUser && currentUser.photoURL && myStatusAvatar) {
        myStatusAvatar.innerHTML = `<img src="${escapeHtml(currentUser.photoURL)}" style="width: 100%; height: 100%; border-radius: 50%;">`;
    }
    
    if (myStatuses.length > 0) {
        const latestStatus = myStatuses[0];
        if (myStatusRing) myStatusRing.classList.remove('viewed');
        if (myStatusIndicator) myStatusIndicator.classList.remove('viewed');
        if (myStatusText) myStatusText.textContent = getStatusPreviewText(latestStatus);
    } else {
        if (myStatusRing) myStatusRing.classList.add('viewed');
        if (myStatusIndicator) myStatusIndicator.classList.add('viewed');
        if (myStatusText) myStatusText.textContent = 'No recent status';
    }
}

/**
 * Update mood chart
 */
export function updateMoodChart() {
    const moodChart = document.getElementById('moodChart');
    if (!moodChart) return;
    
    moodChart.innerHTML = '';
    
    const chartData = moodChartData.length > 0 ? moodChartData : generateSampleMoodData();
    
    chartData.forEach((day, index) => {
        const moodBar = document.createElement('div');
        moodBar.className = 'mood-bar';
        moodBar.style.backgroundColor = statusMoods[day.mood]?.color || 'var(--mood-happy)';
        moodBar.style.height = `${day.value}%`;
        moodBar.title = `Day ${index + 1}: ${statusMoods[day.mood]?.name || 'Happy'} (${day.value}%)`;
        moodChart.appendChild(moodBar);
    });
}

/**
 * Render statuses list
 * @param {HTMLElement} container - Container element
 * @param {Array} statusesList - Statuses to render
 */
export function renderStatusesList(container, statusesList) {
    if (!container) return;
    
    container.innerHTML = '';
    
    let filteredStatuses = statusesList;
    
    if (currentIntentFilter) {
        filteredStatuses = filteredStatuses.filter(status => status.intent === currentIntentFilter);
    }
    
    if (currentMoodFilter) {
        filteredStatuses = filteredStatuses.filter(status => status.mood === currentMoodFilter);
    }
    
    if (activeFilters.size > 0) {
        filteredStatuses = filteredStatuses.filter(status => {
            return Array.from(activeFilters).every(filter => {
                if (filter.startsWith('intent-')) {
                    return status.intent === filter.replace('intent-', '');
                }
                if (filter.startsWith('mood-')) {
                    return status.mood === filter.replace('mood-', '');
                }
                if (filter.startsWith('category-')) {
                    return status.category === filter.replace('category-', '');
                }
                return true;
            });
        });
    }
    
    if (filteredStatuses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No statuses found</p>
                <p class="subtext">${getEmptyStateMessage()}</p>
            </div>
        `;
        return;
    }
    
    filteredStatuses.forEach(status => {
        addStatusItem(status, container);
    });
}

/**
 * Add status item to list
 * @param {Object} statusData - Status data
 * @param {HTMLElement} container - Container element
 */
function addStatusItem(statusData, container) {
    const statusItem = document.createElement('div');
    statusItem.className = 'status-item';
    statusItem.dataset.statusId = statusData.id;
    statusItem.dataset.userId = statusData.userId;
    
    const user = statusData.user || { displayName: 'Unknown User', photoURL: '', id: statusData.userId };
    const initials = user.displayName ? 
        user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const isViewed = viewedStatuses.has(statusData.id);
    const isPinned = statusData.isPinned || false;
    const isMuted = mutedUsers.has(statusData.userId);
    const mood = statusData.mood || 'happy';
    const intent = statusData.intent || 'reflection';
    const category = statusData.category || 'life';
    
    let previewText = '';
    let previewClass = '';
    if (statusData.type === 'text') {
        previewText = statusData.text || 'Text status';
    } else if (statusData.type === 'media') {
        previewText = `<i class="fas fa-image"></i> ${statusData.caption ? statusData.caption.substring(0, 40) + (statusData.caption.length > 40 ? '...' : '') : 'Media status'}`;
        previewClass = 'media';
    } else if (statusData.type === 'poll') {
        previewText = `<i class="fas fa-poll"></i> ${statusData.question ? statusData.question.substring(0, 40) + (statusData.question.length > 40 ? '...' : '') : 'Poll status'}`;
        previewClass = 'poll';
    }
    
    const timeAgo = statusData.createdAt ? formatTimeAgo(new Date(statusData.createdAt)) : 'Just now';
    
    statusItem.innerHTML = `
        <div class="status-avatar">
            <div class="status-ring ${isViewed ? 'viewed' : ''}"></div>
            <div class="status-avatar-inner" ${user.photoURL ? `style="background-image: url('${escapeHtml(user.photoURL)}')"` : ''}>
                ${user.photoURL ? '' : `<span>${initials}</span>`}
            </div>
            <div class="status-indicators">
                ${mood ? `<div class="status-indicator mood" style="background-color: ${statusMoods[mood]?.color || 'var(--mood-happy)'}" title="${statusMoods[mood]?.name || 'Mood'}"></div>` : ''}
                ${intent ? `<div class="status-indicator intent" style="background-color: ${statusIntents[intent]?.color || 'var(--intent-feedback)'}" title="${statusIntents[intent]?.name || 'Intent'}"></div>` : ''}
                ${isPinned ? `<div class="status-indicator pinned" title="Pinned Status"></div>` : ''}
                ${isMuted ? `<div class="status-indicator muted" title="Muted User"></div>` : ''}
            </div>
        </div>
        <div class="status-info">
            <div class="status-name">
                <span class="status-name-text">${escapeHtml(user.displayName || 'Unknown User')}</span>
                <span class="status-time">${timeAgo}</span>
            </div>
            <div class="status-details">
                <span class="status-type" style="color: ${statusTypes[statusData.type]?.color || 'var(--primary-color)'}">
                    <i class="${statusTypes[statusData.type]?.icon || 'fas fa-comment'}"></i>
                    ${statusTypes[statusData.type]?.name || 'Status'}
                </span>
                ${statusData.isSensitive ? '<span class="status-tag privacy"><i class="fas fa-eye-slash"></i> Sensitive</span>' : ''}
                ${statusData.isSilent ? '<span class="status-tag privacy"><i class="fas fa-bell-slash"></i> Silent</span>' : ''}
                ${statusData.duration !== '0' ? `<span class="status-tag privacy"><i class="fas fa-clock"></i> ${durationOptions[statusData.duration] || '24h'}</span>` : ''}
            </div>
            <div class="status-preview ${previewClass}">
                ${previewText}
            </div>
            <div class="status-tags">
                ${mood ? `<span class="status-tag mood"><i class="fas fa-brain"></i> ${statusMoods[mood]?.name || 'Mood'}</span>` : ''}
                ${intent ? `<span class="status-tag intent"><i class="fas fa-bullseye"></i> ${statusIntents[intent]?.name || 'Intent'}</span>` : ''}
                ${category ? `<span class="status-tag category"><i class="${statusCategories[category]?.icon || 'fas fa-tag'}"></i> ${statusCategories[category]?.name || 'Category'}</span>` : ''}
                ${statusData.privacy ? `<span class="status-tag privacy"><i class="${privacySettings[statusData.privacy]?.icon || 'fas fa-lock'}"></i> ${privacySettings[statusData.privacy]?.name || 'Privacy'}</span>` : ''}
            </div>
        </div>
        <div class="status-actions">
            <button class="status-action-btn" data-action="view" title="View Status">
                <i class="fas fa-eye"></i>
            </button>
            ${isPinned ? `
            <button class="status-action-btn warning" data-action="unpin" title="Unpin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="pin" title="Pin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            `}
            ${isMuted ? `
            <button class="status-action-btn" data-action="unmute" title="Unmute User">
                <i class="fas fa-volume-up"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="mute" title="Mute User">
                <i class="fas fa-volume-mute"></i>
            </button>
            `}
        </div>
    `;
    
    statusItem.addEventListener('click', (e) => {
        if (!e.target.closest('.status-actions')) {
            showStatusViewer(statusData);
        }
    });
    
    const actionButtons = statusItem.querySelectorAll('.status-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleStatusAction(action, statusData, btn);
        });
    });
    
    container.appendChild(statusItem);
}

/**
 * Handle status action
 * @param {string} action - Action type
 * @param {Object} statusData - Status data
 * @param {HTMLElement} button - Action button
 */
async function handleStatusAction(action, statusData, button) {
    switch(action) {
        case 'view':
            showStatusViewer(statusData);
            break;
        case 'pin':
            pinStatus(statusData).then(() => {
                showNotification('Status pinned', 'success');
                updateCurrentSection();
            }).catch(error => {
                showNotification('Failed to pin status', 'error');
            });
            break;
        case 'unpin':
            unpinStatus(statusData).then(() => {
                showNotification('Status unpinned', 'success');
                updateCurrentSection();
            }).catch(error => {
                showNotification('Failed to unpin status', 'error');
            });
            break;
        case 'mute':
            muteUser(statusData.userId).then(() => {
                showNotification('User muted', 'success');
                updateCurrentSection();
            }).catch(error => {
                showNotification('Failed to mute user', 'error');
            });
            break;
        case 'unmute':
            unmuteUser(statusData.userId).then(() => {
                showNotification('User unmuted', 'success');
                updateCurrentSection();
            }).catch(error => {
                showNotification('Failed to unmute user', 'error');
            });
            break;
    }
}

// =============================================
// STATUS VIEWER FUNCTIONS
// =============================================

/**
 * Show status viewer
 * @param {Object} statusData - Status data to view
 */
export function showStatusViewer(statusData) {
    currentViewerStatus = statusData;
    currentSlideIndex = 0;
    
    if (!viewedStatuses.has(statusData.id)) {
        viewedStatuses.add(statusData.id);
        localStorage.setItem(LOCAL_STORAGE_KEYS.VIEWED_STATUSES, JSON.stringify(Array.from(viewedStatuses)));
        
        const statusItem = document.querySelector(`[data-status-id="${statusData.id}"]`);
        if (statusItem) {
            const ring = statusItem.querySelector('.status-ring');
            if (ring) {
                ring.classList.add('viewed');
            }
        }
    }
    
    statusViewerPanel.classList.add('active');
    loadViewerContent(statusData);
    startAutoAdvance();
}

/**
 * Load viewer content
 * @param {Object} statusData - Status data
 */
function loadViewerContent(statusData) {
    const viewerUserInfo = document.getElementById('viewerUserInfo');
    const viewerContent = document.getElementById('viewerContent');
    const progressIndicators = document.getElementById('progressIndicators');
    const actionButtonsOverlay = document.getElementById('actionButtonsOverlay');
    
    if (!viewerUserInfo || !viewerContent) return;
    
    const user = statusData.user || { displayName: 'Unknown User', photoURL: '', id: statusData.userId };
    const initials = user.displayName ? 
        user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const timeAgo = statusData.createdAt ? formatTimeAgo(new Date(statusData.createdAt)) : 'Just now';
    
    viewerUserInfo.innerHTML = `
        <div class="viewer-user-avatar" ${user.photoURL ? `style="background-image: url('${escapeHtml(user.photoURL)}')"` : ''}>
            ${user.photoURL ? '' : `<span>${initials}</span>`}
        </div>
        <div class="viewer-user-details">
            <div class="viewer-user-name">${escapeHtml(user.displayName || 'Unknown User')}</div>
            <div class="viewer-status-time">${timeAgo}</div>
        </div>
    `;
    
    viewerContent.innerHTML = '';
    
    if (statusData.type === 'text') {
        const slide = createTextStatusSlide(statusData);
        viewerContent.appendChild(slide);
    } else if (statusData.type === 'media') {
        const slide = createMediaStatusSlide(statusData);
        viewerContent.appendChild(slide);
    } else if (statusData.type === 'poll') {
        const slide = createPollStatusSlide(statusData);
        viewerContent.appendChild(slide);
    }
    
    if (progressIndicators) {
        progressIndicators.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
        `;
    }
    
    if (actionButtonsOverlay && statusData.actionButtons && statusData.actionButtons.length > 0) {
        actionButtonsOverlay.innerHTML = '';
        statusData.actionButtons.forEach(actionKey => {
            const action = actionButtons[actionKey];
            if (action) {
                const actionButton = document.createElement('button');
                actionButton.className = 'action-button';
                actionButton.innerHTML = `<i class="${action.icon}"></i> ${action.name}`;
                actionButton.addEventListener('click', () => {
                    handleActionButtonClick(actionKey, statusData);
                });
                actionButtonsOverlay.appendChild(actionButton);
            }
        });
    } else if (actionButtonsOverlay) {
        actionButtonsOverlay.innerHTML = '';
    }
    
    const muteUserBtn = document.getElementById('muteUserBtn');
    if (muteUserBtn) {
        if (mutedUsers.has(statusData.userId)) {
            muteUserBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            muteUserBtn.title = 'Unmute User';
        } else {
            muteUserBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
            muteUserBtn.title = 'Mute User';
        }
    }
    
    const saveStatusBtn = document.getElementById('saveStatusBtn');
    if (saveStatusBtn) {
        const isSaved = highlights.some(h => h.statusIds && h.statusIds.includes(statusData.id));
        if (isSaved) {
            saveStatusBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
            saveStatusBtn.title = 'Remove from Highlights';
            saveStatusBtn.dataset.action = 'unsave';
        } else {
            saveStatusBtn.innerHTML = '<i class="far fa-bookmark"></i>';
            saveStatusBtn.title = 'Save to Highlights';
            saveStatusBtn.dataset.action = 'save';
        }
    }
}

/**
 * Create text status slide
 * @param {Object} statusData - Status data
 * @returns {HTMLElement} Text status slide
 */
function createTextStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide text-status-slide active';
    
    const selectedBg = statusData.background || '1';
    const bgOption = backgroundOptions.find(bg => bg.id === selectedBg);
    
    if (bgOption) {
        if (bgOption.type === 'solid') {
            slide.style.backgroundColor = bgOption.color;
        } else if (bgOption.type === 'gradient') {
            slide.style.background = bgOption.gradient;
        }
    }
    
    slide.innerHTML = `
        <div class="text-status-content">${escapeHtml(statusData.text || '')}</div>
        <div class="text-status-author">— ${escapeHtml(statusData.user?.displayName || 'Unknown User')}</div>
    `;
    
    return slide;
}

/**
 * Create media status slide
 * @param {Object} statusData - Status data
 * @returns {HTMLElement} Media status slide
 */
function createMediaStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide media-status-slide active';
    
    let mediaContent = '';
    if (statusData.mediaType === 'image') {
        mediaContent = `<img src="${escapeHtml(statusData.mediaUrl)}" class="media-status-content" alt="Status image">`;
    } else if (statusData.mediaType === 'video') {
        mediaContent = `<video src="${escapeHtml(statusData.mediaUrl)}" class="media-status-content" autoplay muted loop controls></video>`;
    }
    
    slide.innerHTML = `
        ${mediaContent}
        ${statusData.caption ? `<div class="media-caption">${escapeHtml(statusData.caption)}</div>` : ''}
    `;
    
    if (statusData.isSensitive) {
        const mediaElement = slide.querySelector('.media-status-content');
        if (mediaElement) {
            mediaElement.style.filter = 'blur(20px)';
            mediaElement.addEventListener('click', () => {
                mediaElement.style.filter = 'none';
            });
        }
    }
    
    return slide;
}

/**
 * Create poll status slide
 * @param {Object} statusData - Status data
 * @returns {HTMLElement} Poll status slide
 */
function createPollStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide poll-status-slide active';
    
    const totalVotes = statusData.options?.reduce((sum, option) => sum + (option.votes || 0), 0) || 0;
    const hasVoted = statusData.hasVoted || false;
    const userVote = statusData.userVote;
    
    let optionsHtml = '';
    if (statusData.options) {
        statusData.options.forEach(option => {
            const percentage = totalVotes > 0 ? Math.round((option.votes || 0) / totalVotes * 100) : 0;
            const isVotedByUser = hasVoted && userVote === option.id;
            optionsHtml += `
                <div class="poll-option ${isVotedByUser ? 'selected' : ''}" data-option="${option.id}">
                    <div class="poll-option-text">${escapeHtml(option.text)}</div>
                    <div class="poll-option-percentage">${percentage}% (${option.votes || 0} votes)</div>
                    <div class="poll-option-bar" style="width: ${percentage}%"></div>
                </div>
            `;
        });
    }
    
    slide.innerHTML = `
        <div class="poll-container">
            <div class="poll-question">${escapeHtml(statusData.question || '')}</div>
            <div class="poll-options">
                ${optionsHtml}
            </div>
            <div class="poll-total-votes">Total votes: ${totalVotes}</div>
            ${hasVoted ? '<div class="poll-voted-message">✓ You have voted</div>' : ''}
        </div>
    `;
    
    if (!hasVoted) {
        const pollOptions = slide.querySelectorAll('.poll-option');
        pollOptions.forEach(option => {
            option.addEventListener('click', () => {
                voteOnPoll(statusData.id, option.dataset.option).then(response => {
                    if (response && response.success) {
                        showNotification('Vote recorded', 'success');
                        
                        if (currentViewerStatus && currentViewerStatus.id === statusData.id) {
                            const pollOption = document.querySelector(`.poll-option[data-option="${option.dataset.option}"]`);
                            if (pollOption) {
                                pollOption.classList.add('selected');
                                
                                if (currentViewerStatus.options) {
                                    const option = currentViewerStatus.options.find(opt => opt.id === option.dataset.option);
                                    if (option) {
                                        option.votes = (option.votes || 0) + 1;
                                        currentViewerStatus.hasVoted = true;
                                        currentViewerStatus.userVote = option.dataset.option;
                                        
                                        const totalVotes = currentViewerStatus.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
                                        const pollOptions = document.querySelectorAll('.poll-option');
                                        pollOptions.forEach(opt => {
                                            const optId = opt.dataset.option;
                                            const optionData = currentViewerStatus.options.find(o => o.id === optId);
                                            if (optionData) {
                                                const percentage = totalVotes > 0 ? Math.round((optionData.votes || 0) / totalVotes * 100) : 0;
                                                const percentageElement = opt.querySelector('.poll-option-percentage');
                                                const barElement = opt.querySelector('.poll-option-bar');
                                                
                                                if (percentageElement) {
                                                    percentageElement.textContent = `${percentage}% (${optionData.votes || 0} votes)`;
                                                }
                                                if (barElement) {
                                                    barElement.style.width = `${percentage}%`;
                                                }
                                            }
                                        });
                                        
                                        const totalVotesElement = document.querySelector('.poll-total-votes');
                                        if (totalVotesElement) {
                                            totalVotesElement.textContent = `Total votes: ${totalVotes}`;
                                        }
                                        
                                        const pollContainer = document.querySelector('.poll-container');
                                        if (pollContainer && !document.querySelector('.poll-voted-message')) {
                                            const votedMessage = document.createElement('div');
                                            votedMessage.className = 'poll-voted-message';
                                            votedMessage.textContent = '✓ You have voted';
                                            pollContainer.appendChild(votedMessage);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }).catch(error => {
                    showNotification('Failed to vote', 'error');
                });
            });
        });
    }
    
    return slide;
}

/**
 * Handle action button click
 * @param {string} actionKey - Action key
 * @param {Object} statusData - Status data
 */
function handleActionButtonClick(actionKey, statusData) {
    switch(actionKey) {
        case 'message':
            showNotification('Would navigate to chat with ' + (statusData.user?.displayName || 'user'), 'info');
            break;
        case 'join':
            showNotification('Would join discussion', 'info');
            break;
        case 'vote':
            const pollSlide = document.querySelector('.poll-status-slide');
            if (pollSlide) {
                pollSlide.scrollIntoView({ behavior: 'smooth' });
            }
            showNotification('Click on a poll option to vote', 'info');
            break;
        case 'book':
            showNotification('Would book a call with ' + (statusData.user?.displayName || 'user'), 'info');
            break;
        case 'learn':
            if (statusData.externalUrl) {
                window.open(statusData.externalUrl, '_blank');
            } else {
                showNotification('No external link available', 'info');
            }
            break;
        case 'support':
            addReactionToStatus(statusData.id, 'love').then(() => {
                showNotification('Reacted with ❤️', 'success');
            }).catch(error => {
                showNotification('Failed to add reaction', 'error');
            });
            break;
        case 'collaborate':
            showNotification('Would start collaboration with ' + (statusData.user?.displayName || 'user'), 'info');
            break;
        case 'resource':
            if (statusData.resourceUrl) {
                window.open(statusData.resourceUrl, '_blank');
            } else {
                showNotification('No resource link available', 'info');
            }
            break;
    }
}

/**
 * Start auto-advance for status viewer
 */
function startAutoAdvance() {
    if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
    }
    
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    isAutoAdvancePaused = false;
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    if (pauseResumeBtn) {
        pauseResumeBtn.innerHTML = '<i class="fas fa-pause"></i>';
        pauseResumeBtn.title = 'Pause';
    }
    
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.style.transition = 'width 5s linear';
        
        progressInterval = setInterval(() => {
            const currentWidth = parseFloat(progressFill.style.width) || 0;
            if (currentWidth < 100) {
                progressFill.style.width = (currentWidth + 1) + '%';
            } else {
                progressFill.style.width = '0%';
            }
        }, 50);
    }
}

/**
 * Pause/resume auto-advance
 */
function toggleAutoAdvance() {
    isAutoAdvancePaused = !isAutoAdvancePaused;
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    
    if (isAutoAdvancePaused) {
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        if (pauseResumeBtn) {
            pauseResumeBtn.innerHTML = '<i class="fas fa-play"></i>';
            pauseResumeBtn.title = 'Resume';
        }
    } else {
        startAutoAdvance();
        if (pauseResumeBtn) {
            pauseResumeBtn.innerHTML = '<i class="fas fa-pause"></i>';
            pauseResumeBtn.title = 'Pause';
        }
    }
}

// =============================================
// PARENT COORDINATION UI FUNCTIONS
// =============================================

/**
 * Enable protected UI elements
 */
export function enableProtectedUI() {
    console.log('[Status] Enabling protected UI');
    
    const protectedElements = [
        'createStatusBtn',
        'viewMyStatusBtn',
        'editMyStatusBtn',
        'viewHighlightsBtn',
        'createHighlightBtn',
        'viewTimelineBtn',
        'viewStatsBtn',
        'viewDraftsBtn',
        'viewScheduledBtn',
        'myStatusPreview',
        'postStatusBtn',
        'saveDraftBtn',
        'scheduleStatusBtn'
    ];
    
    protectedElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.disabled = false;
            element.style.opacity = '1';
            element.style.pointerEvents = 'auto';
        }
    });
    
    // Update UI state
    updateMyStatusPreview();
}

/**
 * Disable protected UI elements
 */
export function disableProtectedUI() {
    console.log('[Status] Disabling protected UI');
    
    const protectedElements = [
        'createStatusBtn',
        'viewMyStatusBtn',
        'editMyStatusBtn',
        'viewHighlightsBtn',
        'createHighlightBtn',
        'viewTimelineBtn',
        'viewStatsBtn',
        'viewDraftsBtn',
        'viewScheduledBtn',
        'myStatusPreview',
        'postStatusBtn',
        'saveDraftBtn',
        'scheduleStatusBtn'
    ];
    
    protectedElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.disabled = true;
            element.style.opacity = '0.5';
            element.style.pointerEvents = 'none';
        }
    });
}

/**
 * Show logout state
 */
export function showLogoutState() {
    const allStatusList = document.getElementById('allStatusList');
    if (allStatusList) {
        allStatusList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sign-out-alt"></i>
                <p>Signed out</p>
                <p class="subtext">Please sign in to view statuses</p>
            </div>
        `;
    }
    
    const myStatusPreview = document.getElementById('myStatusPreview');
    if (myStatusPreview) {
        myStatusPreview.innerHTML = `
            <div class="my-status-preview-placeholder">
                <i class="fas fa-user-circle"></i>
                <p>Sign in to create status</p>
            </div>
        `;
    }
}

/**
 * Show reconnection state
 */
export function showReconnectionState() {
    const allStatusList = document.getElementById('allStatusList');
    if (allStatusList) {
        allStatusList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-unlink"></i>
                <p>Connection lost</p>
                <p class="subtext">Attempting to reconnect...</p>
                <button class="btn primary" onclick="location.reload()">
                    <i class="fas fa-redo"></i> Reload
                </button>
            </div>
        `;
    }
}

// =============================================
// UI HELPER FUNCTIONS
// =============================================

/**
 * Update text status counter
 */
function updateTextStatusCounter() {
    const textInput = document.getElementById('textStatusInput');
    const counter = document.getElementById('textStatusCounter');
    
    if (textInput && counter) {
        const length = textInput.value.length;
        counter.textContent = `${length}/500`;
        counter.style.color = length > 500 ? 'var(--danger-color)' : 'var(--text-secondary)';
    }
}

/**
 * Update report details counter
 */
function updateReportDetailsCounter() {
    const reportDetails = document.getElementById('reportDetails');
    const counter = document.getElementById('reportDetailsCounter');
    
    if (reportDetails && counter) {
        const length = reportDetails.value.length;
        counter.textContent = `${length}/500`;
        counter.style.color = length > 500 ? 'var(--danger-color)' : 'var(--text-secondary)';
        updateReportSubmitButton();
    }
}

/**
 * Update report submit button
 */
function updateReportSubmitButton() {
    const reportDetails = document.getElementById('reportDetails');
    const selectedReason = document.querySelector('#reportReasons .category-option.selected');
    const submitBtn = document.getElementById('submitReportBtn');
    
    if (reportDetails && selectedReason && submitBtn) {
        const hasDetails = reportDetails.value.trim().length >= 10;
        const hasReason = selectedReason !== null;
        submitBtn.disabled = !(hasDetails && hasReason);
    }
}

/**
 * Show highlights modal
 */
function showHighlightsModal() {
    highlightsModal.classList.add('active');
    loadHighlightsContent();
}

/**
 * Load highlights content
 */
function loadHighlightsContent() {
    const highlightsContent = document.getElementById('highlightsContent');
    if (!highlightsContent) return;
    
    highlightsContent.innerHTML = '';
    
    if (highlights.length === 0) {
        highlightsContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary); width: 100%;">
                <i class="fas fa-star" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No highlights yet</p>
                <p style="font-size: 14px; margin-top: 10px;">Save important statuses to highlights</p>
            </div>
        `;
        return;
    }
    
    highlights.forEach(highlight => {
        const highlightItem = document.createElement('div');
        highlightItem.className = 'highlight-item';
        highlightItem.innerHTML = `
            <div class="highlight-cover" style="background: ${highlight.color || 'var(--highlight-gradient)'}">
                <i class="${highlight.icon || 'fas fa-star'}"></i>
            </div>
            <div class="highlight-info">
                <div class="highlight-name">${escapeHtml(highlight.name)}</div>
                <div class="highlight-count">${highlight.count || 0} statuses</div>
            </div>
        `;
        
        highlightItem.addEventListener('click', () => {
            showNotification(`Opening ${highlight.name}`, 'info');
        });
        
        highlightsContent.appendChild(highlightItem);
    });
}

/**
 * Show highlights editor
 * @param {Object} highlight - Highlight to edit (optional)
 */
function showHighlightsEditor(highlight = null) {
    const editorTitle = document.getElementById('highlightEditorTitle');
    const nameInput = document.getElementById('highlightNameInput');
    const iconSelect = document.getElementById('highlightIconSelect');
    
    if (editorTitle && nameInput && iconSelect) {
        if (highlight) {
            editorTitle.textContent = 'Edit Highlight';
            nameInput.value = highlight.name || '';
            iconSelect.value = highlight.icon || 'fas fa-star';
            
            const colorGrid = document.getElementById('highlightColorGrid');
            if (colorGrid && highlight.color) {
                const colorOption = colorGrid.querySelector(`[data-bg="${highlight.color}"]`);
                if (colorOption) {
                    document.querySelectorAll('#highlightColorGrid .background-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    colorOption.classList.add('selected');
                }
            }
            
            const privacyOptions = document.getElementById('highlightPrivacyOptions');
            if (privacyOptions && highlight.privacy) {
                const privacyOption = privacyOptions.querySelector(`[data-privacy="${highlight.privacy}"]`);
                if (privacyOption) {
                    document.querySelectorAll('#highlightPrivacyOptions .privacy-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    privacyOption.classList.add('selected');
                }
            }
        } else {
            editorTitle.textContent = 'Create Highlight';
            nameInput.value = '';
            iconSelect.value = 'fas fa-star';
        }
    }
    
    highlightsEditorModal.classList.add('active');
}

/**
 * Save highlight
 */
async function saveHighlight() {
    const nameInput = document.getElementById('highlightNameInput');
    const iconSelect = document.getElementById('highlightIconSelect');
    const selectedColor = document.querySelector('#highlightColorGrid .background-option.selected');
    const selectedPrivacy = document.querySelector('#highlightPrivacyOptions .privacy-option.selected');
    
    if (!nameInput || !nameInput.value.trim()) {
        showNotification('Please enter a highlight name', 'error');
        return;
    }
    
    const highlight = {
        id: 'highlight_' + Date.now(),
        name: nameInput.value.trim(),
        icon: iconSelect.value,
        color: selectedColor ? selectedColor.dataset.bg : 'gradient-1',
        privacy: selectedPrivacy ? selectedPrivacy.dataset.privacy : 'friends',
        count: 0,
        statusIds: [],
        createdAt: new Date().toISOString()
    };
    
    try {
        const response = await secureApiCall('/api/statuses/highlights', {
            method: 'POST',
            body: JSON.stringify(highlight)
        });
        
        if (response && response.success) {
            highlights.push(highlight);
            localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
            
            showNotification('Highlight saved successfully', 'success');
            highlightsEditorModal.classList.remove('active');
            loadHighlightsContent();
        }
    } catch (error) {
        console.error('[Status] Error saving highlight:', error);
        showNotification('Failed to save highlight', 'error');
    }
}

/**
 * Show memory timeline modal
 */
function showMemoryTimelineModal() {
    memoryTimelineModal.classList.add('active');
    loadMemoryTimelineContent();
}

/**
 * Load memory timeline content
 */
function loadMemoryTimelineContent() {
    const memoryTimelineContent = document.getElementById('memoryTimelineContent');
    if (!memoryTimelineContent) return;
    
    const groupedByMonth = {};
    myStatuses.forEach(status => {
        const date = new Date(status.createdAt);
        const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        if (!groupedByMonth[monthYear]) {
            groupedByMonth[monthYear] = [];
        }
        groupedByMonth[monthYear].push(status);
    });
    
    memoryTimelineContent.innerHTML = '';
    
    Object.entries(groupedByMonth).forEach(([monthYear, monthStatuses]) => {
        const monthSection = document.createElement('div');
        monthSection.className = 'timeline-month';
        
        let daysHtml = '';
        monthStatuses.slice(0, 10).forEach(status => {
            const date = new Date(status.createdAt);
            const day = date.getDate();
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            
            daysHtml += `
                <div class="timeline-day" data-status-id="${status.id}">
                    <div class="timeline-date">${day} ${month}</div>
                    <div class="timeline-status">${getStatusPreviewText(status)}</div>
                    ${status.mood ? `<div class="timeline-mood" style="background-color: ${statusMoods[status.mood]?.color || 'var(--mood-happy)'}"></div>` : ''}
                </div>
            `;
        });
        
        monthSection.innerHTML = `
            <div class="timeline-month-header">${monthYear}</div>
            <div class="timeline-days">
                ${daysHtml}
            </div>
        `;
        
        const dayElements = monthSection.querySelectorAll('.timeline-day');
        dayElements.forEach(dayElement => {
            dayElement.addEventListener('click', () => {
                const statusId = dayElement.dataset.statusId;
                const status = myStatuses.find(s => s.id === statusId);
                if (status) {
                    showStatusViewer(status);
                    memoryTimelineModal.classList.remove('active');
                }
            });
        });
        
        memoryTimelineContent.appendChild(monthSection);
    });
}

/**
 * Show stats modal
 */
function showStatsModal() {
    statsModal.classList.add('active');
    loadStatsContent();
}

/**
 * Load stats content
 */
function loadStatsContent() {
    const statsContent = document.getElementById('statsContent');
    if (!statsContent) return;
    
    const totalStatuses = myStatuses.length;
    const totalViews = myStatuses.reduce((sum, status) => sum + (status.views || 0), 0);
    const avgViewTime = myStatuses.length > 0 ? 
        Math.round(myStatuses.reduce((sum, status) => sum + (status.avgViewTime || 0), 0) / myStatuses.length) : 0;
    const totalReactions = myStatuses.reduce((sum, status) => sum + (status.reactions || 0), 0);
    const engagementRate = totalViews > 0 ? Math.round((totalReactions / totalViews) * 100) : 0;
    
    const totalStatusesStat = document.getElementById('totalStatusesStat');
    const totalViewsStat = document.getElementById('totalViewsStat');
    const totalReactionsStat = document.getElementById('totalReactionsStat');
    const streakStat = document.getElementById('streakStat');
    const avgViewTimeStat = document.getElementById('avgViewTimeStat');
    const engagementRateStat = document.getElementById('engagementRateStat');
    
    if (totalStatusesStat) totalStatusesStat.textContent = totalStatuses;
    if (totalViewsStat) totalViewsStat.textContent = totalViews;
    if (totalReactionsStat) totalReactionsStat.textContent = totalReactions;
    if (streakStat) streakStat.textContent = streakCount;
    if (avgViewTimeStat) avgViewTimeStat.textContent = avgViewTime + 's';
    if (engagementRateStat) engagementRateStat.textContent = engagementRate + '%';
    
    updateStatsChart();
    loadRecentViewers();
}

/**
 * Update stats chart
 */
function updateStatsChart() {
    const viewsChart = document.getElementById('viewsChart');
    if (!viewsChart) return;
    
    const chartData = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        chartData.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            views: Math.floor(Math.random() * 100) + 10
        });
    }
    
    viewsChart.innerHTML = '';
    const chartHeight = 200;
    const maxViews = Math.max(...chartData.map(d => d.views));
    
    const chartContainer = document.createElement('div');
    chartContainer.style.display = 'flex';
    chartContainer.style.alignItems = 'flex-end';
    chartContainer.style.gap = '2px';
    chartContainer.style.height = chartHeight + 'px';
    chartContainer.style.width = '100%';
    
    chartData.forEach((data, index) => {
        const bar = document.createElement('div');
        bar.style.flex = '1';
        bar.style.height = (data.views / maxViews * 100) + '%';
        bar.style.backgroundColor = 'var(--primary-color)';
        bar.style.borderRadius = '2px 2px 0 0';
        bar.style.position = 'relative';
        bar.title = `${data.date}: ${data.views} views`;
        
        bar.addEventListener('mouseenter', () => {
            bar.style.backgroundColor = '#0073e6';
        });
        bar.addEventListener('mouseleave', () => {
            bar.style.backgroundColor = 'var(--primary-color)';
        });
        
        chartContainer.appendChild(bar);
    });
    
    viewsChart.appendChild(chartContainer);
}

/**
 * Load recent viewers
 */
function loadRecentViewers() {
    const recentViewersList = document.getElementById('recentViewersList');
    if (!recentViewersList) return;
    
    recentViewersList.innerHTML = '';
    
    const sampleViewers = [
        { name: 'Alex Johnson', time: '2 hours ago', avatar: 'AJ' },
        { name: 'Sam Wilson', time: '5 hours ago', avatar: 'SW' },
        { name: 'Taylor Swift', time: '1 day ago', avatar: 'TS' },
        { name: 'John Doe', time: '2 days ago', avatar: 'JD' },
        { name: 'Jane Smith', time: '3 days ago', avatar: 'JS' }
    ];
    
    sampleViewers.forEach(viewer => {
        const viewerItem = document.createElement('div');
        viewerItem.className = 'viewer-item';
        viewerItem.innerHTML = `
            <div class="viewer-avatar">${viewer.avatar}</div>
            <div class="viewer-info">
                <div class="viewer-name">${viewer.name}</div>
                <div class="viewer-time">${viewer.time}</div>
            </div>
        `;
        recentViewersList.appendChild(viewerItem);
    });
}

/**
 * Show drafts modal
 */
function showDraftsModal() {
    draftsModal.classList.add('active');
    updateDraftsList();
}

/**
 * Update drafts list
 */
function updateDraftsList() {
    const allDraftsList = document.getElementById('allDraftsList');
    if (!allDraftsList) return;
    
    allDraftsList.innerHTML = '';
    
    if (drafts.length === 0) {
        allDraftsList.innerHTML = `
            <div class="drafts-empty">
                <i class="fas fa-file-alt"></i>
                <p>No drafts yet</p>
                <p class="subtext">Save a status as draft to see it here</p>
            </div>
        `;
        return;
    }
    
    drafts.forEach(draft => {
        const draftItem = document.createElement('div');
        draftItem.className = 'draft-item';
        draftItem.dataset.draftId = draft.id;
        
        let previewText = '';
        if (draft.type === 'text') {
            previewText = draft.text || 'Text draft';
        } else if (draft.type === 'media') {
            previewText = `📷 ${draft.caption || 'Media draft'}`;
        } else if (draft.type === 'poll') {
            previewText = `📊 ${draft.question || 'Poll draft'}`;
        }
        
        const timeAgo = draft.createdAt ? formatTimeAgo(new Date(draft.createdAt)) : 'Just now';
        
        draftItem.innerHTML = `
            <div class="draft-preview">${escapeHtml(previewText.substring(0, 100) + (previewText.length > 100 ? '...' : ''))}</div>
            <div class="draft-meta">
                <span>${timeAgo} • ${draft.type || 'Unknown'}</span>
                <div class="draft-actions">
                    <button class="draft-action-btn" data-action="edit" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="draft-action-btn danger" data-action="delete" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        draftItem.addEventListener('click', (e) => {
            if (!e.target.closest('.draft-actions')) {
                draftItem.classList.toggle('selected');
                if (draftItem.classList.contains('selected')) {
                    selectedDraft = draft;
                    const loadDraftBtn = document.getElementById('loadDraftBtn');
                    if (loadDraftBtn) {
                        loadDraftBtn.disabled = false;
                    }
                } else {
                    selectedDraft = null;
                    const loadDraftBtn = document.getElementById('loadDraftBtn');
                    if (loadDraftBtn) {
                        loadDraftBtn.disabled = true;
                    }
                }
            }
        });
        
        const actionButtons = draftItem.querySelectorAll('.draft-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleDraftAction(action, draft);
            });
        });
        
        allDraftsList.appendChild(draftItem);
    });
}

/**
 * Handle draft action
 * @param {string} action - Action type
 * @param {Object} draft - Draft data
 */
function handleDraftAction(action, draft) {
    switch(action) {
        case 'edit':
            loadDraft(draft);
            break;
        case 'delete':
            deleteDraft(draft.id);
            break;
    }
}

/**
 * Load draft into editor
 * @param {Object} draft - Draft data
 */
function loadDraft(draft) {
    if (!draft) return;
    
    createStatusModal.classList.add('active');
    
    if (draft.type === 'text') {
        const textTab = document.querySelector('.create-status-tab[data-tab="text"]');
        if (textTab) {
            textTab.click();
        }
        const textInput = document.getElementById('textStatusInput');
        if (textInput && draft.text) {
            textInput.value = draft.text;
            updateTextStatusCounter();
        }
    } else if (draft.type === 'media') {
        const mediaTab = document.querySelector('.create-status-tab[data-tab="media"]');
        if (mediaTab) {
            mediaTab.click();
        }
        const captionInput = document.getElementById('mediaCaptionInput');
        if (captionInput && draft.caption) {
            captionInput.value = draft.caption;
        }
    } else if (draft.type === 'poll') {
        const pollTab = document.querySelector('.create-status-tab[data-tab="poll"]');
        if (pollTab) {
            pollTab.click();
        }
        const questionInput = document.getElementById('pollQuestionInput');
        if (questionInput && draft.question) {
            questionInput.value = draft.question;
        }
    }
    
    draftsModal.classList.remove('active');
    showNotification('Draft loaded', 'success');
}

/**
 * Delete draft
 * @param {string} draftId - Draft ID
 */
function deleteDraft(draftId) {
    if (!confirm('Are you sure you want to delete this draft?')) {
        return;
    }
    
    drafts = drafts.filter(draft => draft.id !== draftId);
    localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    showNotification('Draft deleted', 'success');
    updateDraftsList();
}

/**
 * Delete all drafts
 */
function deleteAllDrafts() {
    if (drafts.length === 0) {
        showNotification('No drafts to delete', 'info');
        return;
    }
    
    if (!confirm('Are you sure you want to delete all drafts? This action cannot be undone.')) {
        return;
    }
    
    drafts = [];
    localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    showNotification('All drafts deleted', 'success');
    updateDraftsList();
}

/**
 * Update scheduled statuses list
 */
function updateScheduledStatusesList() {
    const scheduledStatusesList = document.getElementById('scheduledStatusesList');
    if (!scheduledStatusesList) return;
    
    scheduledStatusesList.innerHTML = '';
    
    if (scheduledStatuses.length === 0) {
        scheduledStatusesList.innerHTML = `
            <div class="schedule-empty">
                <i class="fas fa-clock"></i>
                <p>No scheduled statuses</p>
                <p class="subtext">Schedule a status to see it here</p>
            </div>
        `;
        return;
    }
    
    scheduledStatuses.forEach(scheduled => {
        const scheduleItem = document.createElement('div');
        scheduleItem.className = 'schedule-item';
        
        const scheduledFor = new Date(scheduled.scheduledFor);
        const timeString = scheduledFor.toLocaleString();
        
        scheduleItem.innerHTML = `
            <div class="schedule-info">
                <h4>${scheduled.type || 'Status'} - ${getStatusPreviewText(scheduled)}</h4>
                <div class="schedule-time">Scheduled for: ${timeString}</div>
            </div>
            <div class="schedule-actions">
                <button class="edit-btn" data-action="edit" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="cancel-btn" data-action="cancel" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        const actionButtons = scheduleItem.querySelectorAll('button');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleScheduleAction(action, scheduled);
            });
        });
        
        scheduledStatusesList.appendChild(scheduleItem);
    });
}

/**
 * Handle schedule action
 * @param {string} action - Action type
 * @param {Object} scheduled - Scheduled status
 */
function handleScheduleAction(action, scheduled) {
    switch(action) {
        case 'edit':
            showNotification('Edit scheduled status feature coming soon', 'info');
            break;
        case 'cancel':
            cancelScheduledStatus(scheduled.id);
            break;
    }
}

/**
 * Cancel scheduled status
 * @param {string} scheduleId - Schedule ID
 */
async function cancelScheduledStatus(scheduleId) {
    if (!confirm('Are you sure you want to cancel this scheduled status?')) {
        return;
    }
    
    try {
        const response = await secureApiCall(`/api/statuses/schedule/${scheduleId}`, {
            method: 'DELETE'
        });
        
        if (response && response.success) {
            scheduledStatuses = scheduledStatuses.filter(s => s.id !== scheduleId);
            localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULED, JSON.stringify(scheduledStatuses));
            showNotification('Scheduled status cancelled', 'success');
            updateScheduledStatusesList();
        }
    } catch (error) {
        console.error('[Status] Error cancelling scheduled status:', error);
        showNotification('Failed to cancel scheduled status', 'error');
    }
}

/**
 * Add filter tag
 * @param {string} filter - Filter key
 * @param {string} label - Filter label
 */
function addFilterTag(filter, label) {
    const filterTags = document.getElementById('filterTags');
    if (!filterTags) return;
    
    if (activeFilters.has(filter)) return;
    
    activeFilters.add(filter);
    
    const filterTag = document.createElement('div');
    filterTag.className = 'filter-tag active';
    filterTag.dataset.filter = filter;
    filterTag.innerHTML = `
        ${label}
        <i class="fas fa-times"></i>
    `;
    
    filterTag.addEventListener('click', () => {
        removeFilterTag(filter);
    });
    
    filterTags.appendChild(filterTag);
    
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.style.display = 'block';
    }
    
    updateCurrentSection();
}

/**
 * Remove filter tag
 * @param {string} filter - Filter key
 */
function removeFilterTag(filter) {
    activeFilters.delete(filter);
    
    const filterTag = document.querySelector(`.filter-tag[data-filter="${filter}"]`);
    if (filterTag) {
        filterTag.remove();
    }
    
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn && activeFilters.size === 0) {
        clearFiltersBtn.style.display = 'none';
    }
    
    updateCurrentSection();
}

/**
 * Clear all filters
 */
function clearAllFilters() {
    activeFilters.clear();
    
    const filterTags = document.getElementById('filterTags');
    if (filterTags) {
        filterTags.innerHTML = '';
    }
    
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.style.display = 'none';
    }
    
    updateCurrentSection();
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 */
export function showNotification(message, type = 'success') {
    const notificationText = document.getElementById('notificationText');
    if (!notificationText) return;
    
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('active');
    
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

// =============================================
// EVENT LISTENERS SETUP
// =============================================

/**
 * Setup basic event listeners (don't require auth)
 */
export function setupBasicEventListeners() {
    const createStatusBtn = document.getElementById('createStatusBtn');
    if (createStatusBtn) {
        createStatusBtn.addEventListener('click', () => {
            // Check if authenticated using imported functions
            if (!parentCoordinator.handshakeComplete && !isAuthenticated()) {
                showNotification('Please sign in to create a status', 'error');
                return;
            }
            createStatusModal.classList.add('active');
            const textTab = document.querySelector('.create-status-tab[data-tab="text"]');
            if (textTab) {
                textTab.click();
            }
        });
    }
    
    const closeCreateStatusModal = document.getElementById('closeCreateStatusModal');
    if (closeCreateStatusModal) {
        closeCreateStatusModal.addEventListener('click', () => {
            createStatusModal.classList.remove('active');
        });
    }
    
    const closeNotificationBtn = document.getElementById('closeNotificationBtn');
    if (closeNotificationBtn) {
        closeNotificationBtn.addEventListener('click', () => {
            notification.classList.remove('active');
        });
    }
    
    window.addEventListener('resize', () => {
        isMobile = window.innerWidth <= 768;
    });
}

/**
 * Setup all event listeners
 */
export function setupEventListeners() {
    setupBasicEventListeners();
    
    document.querySelectorAll('.create-status-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            document.querySelectorAll('.create-status-tab').forEach(t => {
                t.classList.remove('active');
            });
            this.classList.add('active');
            
            document.querySelectorAll('.create-status-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabContent = document.getElementById(`${tabName}Tab`);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
    
    const textStatusInput = document.getElementById('textStatusInput');
    if (textStatusInput) {
        textStatusInput.addEventListener('input', updateTextStatusCounter);
        updateTextStatusCounter();
    }
    
    const clearTextBtn = document.getElementById('clearTextBtn');
    if (clearTextBtn) {
        clearTextBtn.addEventListener('click', () => {
            if (textStatusInput) {
                textStatusInput.value = '';
                updateTextStatusCounter();
            }
        });
    }
    
    const mediaUploadArea = document.getElementById('mediaUploadArea');
    const mediaFileInput = document.getElementById('mediaFileInput');
    
    if (mediaUploadArea && mediaFileInput) {
        mediaUploadArea.addEventListener('click', () => {
            mediaFileInput.click();
        });
        
        mediaFileInput.addEventListener('change', handleMediaUpload);
        
        mediaUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            mediaUploadArea.style.backgroundColor = 'rgba(0, 132, 255, 0.1)';
        });
        
        mediaUploadArea.addEventListener('dragleave', () => {
            mediaUploadArea.style.backgroundColor = '';
        });
        
        mediaUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            mediaUploadArea.style.backgroundColor = '';
            
            if (e.dataTransfer.files.length > 0) {
                const files = e.dataTransfer.files;
                const fileArray = Array.from(files);
                handleMediaUpload({ target: { files: fileArray } });
            }
        });
    }
    
    const addPollOptionBtn = document.getElementById('addPollOptionBtn');
    if (addPollOptionBtn) {
        addPollOptionBtn.addEventListener('click', () => {
            const pollOptionsContainer = document.getElementById('pollOptionsContainer');
            if (!pollOptionsContainer) return;
            
            const optionCount = pollOptionsContainer.children.length + 1;
            if (optionCount > 6) {
                showNotification('Maximum 6 options allowed', 'warning');
                return;
            }
            
            addPollOption(optionCount);
        });
    }
    
    const postStatusBtn = document.getElementById('postStatusBtn');
    if (postStatusBtn) {
        postStatusBtn.addEventListener('click', () => {
            // Check authentication using imported functions
            if (!parentCoordinator.handshakeComplete && !isAuthenticated()) {
                showNotification('Please sign in to post a status', 'error');
                return;
            }
            
            const activeTab = document.querySelector('.create-status-tab.active');
            if (!activeTab) return;
            
            const activeTabName = activeTab.dataset.tab;
            let statusData = {
                type: activeTabName,
                userId: currentUser?.id,
                user: currentUser,
                createdAt: new Date().toISOString(),
                views: 0,
                reactions: 0
            };
            
            const selectedIntent = document.querySelector('.intent-option.selected')?.dataset.intent;
            const selectedMood = document.querySelector('.mood-option.selected')?.dataset.mood;
            const selectedCategory = document.querySelector('.category-option.selected')?.dataset.category;
            const selectedPrivacy = document.querySelector('.privacy-option.selected')?.dataset.privacy;
            const selectedDuration = document.querySelector('.duration-option.selected')?.dataset.duration;
            const selectedActions = Array.from(document.querySelectorAll('.action-button-option.selected')).map(opt => opt.dataset.action);
            
            if (selectedIntent) statusData.intent = selectedIntent;
            if (selectedMood) statusData.mood = selectedMood;
            if (selectedCategory) statusData.category = selectedCategory;
            if (selectedPrivacy) statusData.privacy = selectedPrivacy;
            if (selectedDuration) statusData.duration = selectedDuration;
            if (selectedActions.length > 0) statusData.actionButtons = selectedActions;
            
            const sensitiveToggle = document.getElementById('sensitiveContentToggle');
            const silentToggle = document.getElementById('silentModeToggle');
            const translateToggle = document.getElementById('autoTranslateToggle');
            const offlineToggle = document.getElementById('offlineQueueToggle');
            
            if (sensitiveToggle) statusData.isSensitive = sensitiveToggle.checked;
            if (silentToggle) statusData.isSilent = silentToggle.checked;
            if (translateToggle) statusData.autoTranslate = translateToggle.checked;
            if (offlineToggle) statusData.offlineQueue = offlineToggle.checked;
            
            if (activeTabName === 'text') {
                const textInput = document.getElementById('textStatusInput');
                const text = textInput ? textInput.value.trim() : '';
                if (!text) {
                    showNotification('Please enter text for your status', 'error');
                    return;
                }
                
                statusData.text = text;
                const selectedBg = document.querySelector('.background-option.selected');
                if (selectedBg) {
                    statusData.background = selectedBg.dataset.bg;
                }
                
            } else if (activeTabName === 'media') {
                const mediaPreview = document.getElementById('mediaPreview');
                if (!mediaPreview || mediaPreview.children.length === 0) {
                    showNotification('Please upload at least one media file', 'error');
                    return;
                }
                
                const captionInput = document.getElementById('mediaCaptionInput');
                const caption = captionInput ? captionInput.value.trim() : '';
                statusData.caption = caption;
                statusData.mediaType = 'image';
                statusData.mediaUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                
            } else if (activeTabName === 'poll') {
                const questionInput = document.getElementById('pollQuestionInput');
                const question = questionInput ? questionInput.value.trim() : '';
                if (!question) {
                    showNotification('Please enter a question for your poll', 'error');
                    return;
                }
                
                const options = Array.from(document.querySelectorAll('.poll-option-input')).map(input => ({
                    id: `option_${input.dataset.index}`,
                    text: input.value.trim(),
                    votes: 0
                })).filter(opt => opt.text);
                
                if (options.length < 2) {
                    showNotification('Please enter at least 2 options', 'error');
                    return;
                }
                
                statusData.question = question;
                statusData.options = options;
                const durationSelect = document.getElementById('pollDurationSelect');
                if (durationSelect) {
                    statusData.duration = durationSelect.value;
                }
            }
            
            postStatus(statusData).then(response => {
                if (response && response.success) {
                    showNotification('Status posted successfully', 'success');
                    updateMyStatusPreview();
                    updateCurrentSection();
                    createStatusModal.classList.remove('active');
                }
            }).catch(error => {
                showNotification('Failed to post status', 'error');
            });
        });
    }
    
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', () => {
            const activeTab = document.querySelector('.create-status-tab.active');
            if (!activeTab) return;
            
            const activeTabName = activeTab.dataset.tab;
            let draftData = {
                type: activeTabName,
                createdAt: new Date().toISOString()
            };
            
            if (activeTabName === 'text') {
                const textInput = document.getElementById('textStatusInput');
                const text = textInput ? textInput.value.trim() : '';
                if (!text) {
                    showNotification('Nothing to save', 'warning');
                    return;
                }
                draftData.text = text;
                const selectedBg = document.querySelector('.background-option.selected');
                if (selectedBg) {
                    draftData.background = selectedBg.dataset.bg;
                }
            } else if (activeTabName === 'media') {
                const captionInput = document.getElementById('mediaCaptionInput');
                const caption = captionInput ? captionInput.value.trim() : '';
                if (!caption) {
                    showNotification('Nothing to save', 'warning');
                    return;
                }
                draftData.caption = caption;
            } else if (activeTabName === 'poll') {
                const questionInput = document.getElementById('pollQuestionInput');
                const question = questionInput ? questionInput.value.trim() : '';
                if (!question) {
                    showNotification('Nothing to save', 'warning');
                    return;
                }
                draftData.question = question;
                
                const options = Array.from(document.querySelectorAll('.poll-option-input')).map(input => ({
                    id: `option_${input.dataset.index}`,
                    text: input.value.trim(),
                    votes: 0
                })).filter(opt => opt.text);
                
                if (options.length < 2) {
                    showNotification('Please enter at least 2 options to save as draft', 'error');
                    return;
                }
                
                draftData.options = options;
            }
            
            const selectedIntent = document.querySelector('.intent-option.selected')?.dataset.intent;
            const selectedMood = document.querySelector('.mood-option.selected')?.dataset.mood;
            const selectedCategory = document.querySelector('.category-option.selected')?.dataset.category;
            
            if (selectedIntent) draftData.intent = selectedIntent;
            if (selectedMood) draftData.mood = selectedMood;
            if (selectedCategory) draftData.category = selectedCategory;
            
            try {
                saveDraft(draftData);
                showNotification('Draft saved successfully', 'success');
                createStatusModal.classList.remove('active');
            } catch (error) {
                showNotification('Failed to save draft', 'error');
            }
        });
    }
    
    const scheduleStatusBtn = document.getElementById('scheduleStatusBtn');
    if (scheduleStatusBtn) {
        scheduleStatusBtn.addEventListener('click', () => {
            // Check authentication using imported functions
            if (!parentCoordinator.handshakeComplete && !isAuthenticated()) {
                showNotification('Please sign in to schedule a status', 'error');
                return;
            }
            
            scheduleModal.classList.add('active');
            
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            const timeStr = tomorrow.toTimeString().split(':').slice(0, 2).join(':');
            
            const scheduleDate = document.getElementById('scheduleDate');
            const scheduleTime = document.getElementById('scheduleTime');
            
            if (scheduleDate) scheduleDate.value = dateStr;
            if (scheduleTime) scheduleTime.value = timeStr;
        });
    }
    
    const closeScheduleModal = document.getElementById('closeScheduleModal');
    if (closeScheduleModal) {
        closeScheduleModal.addEventListener('click', () => {
            scheduleModal.classList.remove('active');
        });
    }
    
    const confirmScheduleBtn = document.getElementById('confirmScheduleBtn');
    if (confirmScheduleBtn) {
        confirmScheduleBtn.addEventListener('click', () => {
            const scheduleDate = document.getElementById('scheduleDate');
            const scheduleTime = document.getElementById('scheduleTime');
            
            if (!scheduleDate || !scheduleTime || !scheduleDate.value || !scheduleTime.value) {
                showNotification('Please select both date and time', 'error');
                return;
            }
            
            const scheduleDateTime = new Date(`${scheduleDate.value}T${scheduleTime.value}`);
            if (scheduleDateTime <= new Date()) {
                showNotification('Please select a future date and time', 'error');
                return;
            }
            
            const activeTab = document.querySelector('.create-status-tab.active');
            if (!activeTab) {
                showNotification('Please create a status first', 'error');
                return;
            }
            
            const activeTabName = activeTab.dataset.tab;
            let statusData = {
                type: activeTabName,
                userId: currentUser?.id,
                user: currentUser
            };
            
            if (activeTabName === 'text') {
                const textInput = document.getElementById('textStatusInput');
                const text = textInput ? textInput.value.trim() : '';
                if (!text) {
                    showNotification('Please enter text for your status', 'error');
                    return;
                }
                statusData.text = text;
            } else if (activeTabName === 'media') {
                const captionInput = document.getElementById('mediaCaptionInput');
                const caption = captionInput ? captionInput.value.trim() : '';
                statusData.caption = caption;
            } else if (activeTabName === 'poll') {
                const questionInput = document.getElementById('pollQuestionInput');
                const question = questionInput ? questionInput.value.trim() : '';
                if (!question) {
                    showNotification('Please enter a question for your poll', 'error');
                    return;
                }
                statusData.question = question;
            }
            
            const selectedRepeat = document.querySelector('.repeat-option.selected')?.dataset.repeat || 'none';
            
            scheduleStatus(statusData, scheduleDateTime.toISOString()).then(response => {
                if (response && response.success) {
                    showNotification('Status scheduled successfully', 'success');
                    scheduleModal.classList.remove('active');
                    createStatusModal.classList.remove('active');
                }
            }).catch(error => {
                showNotification('Failed to schedule status', 'error');
            });
        });
    }
    
    const categoryTabs = {
        'allTab': 'allStatusSection',
        'friendsTab': 'friendsStatusSection',
        'closeFriendsTab': 'closeFriendsStatusSection',
        'pinnedTab': 'pinnedStatusSection',
        'mutedTab': 'mutedStatusSection',
        'microCirclesTab': 'microCirclesStatusSection',
        'myStatusTab': 'myStatusSection'
    };
    
    Object.keys(categoryTabs).forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.category-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                document.querySelectorAll('.statuses-section').forEach(section => {
                    section.classList.remove('active');
                });
                
                const sectionId = categoryTabs[tabId];
                document.getElementById(sectionId).classList.add('active');
                updateCurrentSection();
            });
        }
    });
    
    document.querySelectorAll('.category-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            let label = '';
            
            if (filter.startsWith('intent-')) {
                const intentKey = filter.replace('intent-', '');
                label = statusIntents[intentKey]?.name || intentKey;
                addFilterTag(filter, label);
            } else if (filter.startsWith('mood-')) {
                const moodKey = filter.replace('mood-', '');
                label = statusMoods[moodKey]?.name || moodKey;
                addFilterTag(filter, label);
            }
        });
    });
    
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }
    
    const viewerBackBtn = document.getElementById('viewerBackBtn');
    if (viewerBackBtn) {
        viewerBackBtn.addEventListener('click', () => {
            statusViewerPanel.classList.remove('active');
            stopAutoAdvance();
        });
    }
    
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    if (pauseResumeBtn) {
        pauseResumeBtn.addEventListener('click', toggleAutoAdvance);
    }
    
    const muteUserBtn = document.getElementById('muteUserBtn');
    if (muteUserBtn) {
        muteUserBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                if (mutedUsers.has(currentViewerStatus.userId)) {
                    unmuteUser(currentViewerStatus.userId).then(() => {
                        showNotification('User unmuted', 'success');
                    }).catch(error => {
                        showNotification('Failed to unmute user', 'error');
                    });
                } else {
                    muteUser(currentViewerStatus.userId).then(() => {
                        showNotification('User muted', 'success');
                    }).catch(error => {
                        showNotification('Failed to mute user', 'error');
                    });
                }
            }
        });
    }
    
    const shareStatusBtn = document.getElementById('shareStatusBtn');
    if (shareStatusBtn) {
        shareStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                if (navigator.share) {
                    navigator.share({
                        title: 'Status from ' + (currentViewerStatus.user?.displayName || 'User'),
                        text: currentViewerStatus.text || currentViewerStatus.caption || currentViewerStatus.question || 'Check out this status',
                        url: window.location.href
                    }).catch(error => {
                        console.log('Error sharing:', error);
                    });
                } else {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                        showNotification('Link copied to clipboard', 'success');
                    }).catch(err => {
                        console.error('Failed to copy: ', err);
                    });
                }
            }
        });
    }
    
    const saveStatusBtn = document.getElementById('saveStatusBtn');
    if (saveStatusBtn) {
        saveStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                const action = saveStatusBtn.dataset.action;
                
                if (action === 'save') {
                    if (highlights.length === 0) {
                        showNotification('Please create a highlight first', 'info');
                        showHighlightsModal();
                    } else {
                        const highlight = highlights[0];
                        if (!highlight.statusIds) {
                            highlight.statusIds = [];
                        }
                        if (!highlight.statusIds.includes(currentViewerStatus.id)) {
                            highlight.statusIds.push(currentViewerStatus.id);
                            highlight.count = highlight.statusIds.length;
                            localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
                            
                            saveStatusBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
                            saveStatusBtn.title = 'Remove from Highlights';
                            saveStatusBtn.dataset.action = 'unsave';
                            showNotification('Status saved to highlights', 'success');
                        }
                    }
                } else if (action === 'unsave') {
                    highlights.forEach(highlight => {
                        if (highlight.statusIds && highlight.statusIds.includes(currentViewerStatus.id)) {
                            highlight.statusIds = highlight.statusIds.filter(id => id !== currentViewerStatus.id);
                            highlight.count = highlight.statusIds.length;
                        }
                    });
                    localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
                    
                    saveStatusBtn.innerHTML = '<i class="far fa-bookmark"></i>';
                    saveStatusBtn.title = 'Save to Highlights';
                    saveStatusBtn.dataset.action = 'save';
                    showNotification('Status removed from highlights', 'success');
                }
            }
        });
    }
    
    const reportStatusBtn = document.getElementById('reportStatusBtn');
    if (reportStatusBtn) {
        reportStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                reportModal.classList.add('active');
            }
        });
    }
    
    const closeReportModal = document.getElementById('closeReportModal');
    if (closeReportModal) {
        closeReportModal.addEventListener('click', () => {
            reportModal.classList.remove('active');
        });
    }
    
    const reportDetails = document.getElementById('reportDetails');
    if (reportDetails) {
        reportDetails.addEventListener('input', updateReportDetailsCounter);
    }
    
    const anonymousReportToggle = document.getElementById('anonymousReportToggle');
    if (anonymousReportToggle) {
        anonymousReportToggle.addEventListener('change', updateReportSubmitButton);
    }
    
    const submitReportBtn = document.getElementById('submitReportBtn');
    if (submitReportBtn) {
        submitReportBtn.addEventListener('click', () => {
            const selectedReason = document.querySelector('#reportReasons .category-option.selected')?.dataset.reason;
            const reportDetails = document.getElementById('reportDetails');
            const details = reportDetails ? reportDetails.value.trim() : '';
            const anonymousToggle = document.getElementById('anonymousReportToggle');
            const isAnonymous = anonymousToggle ? anonymousToggle.checked : false;
            
            if (!selectedReason) {
                showNotification('Please select a reason', 'error');
                return;
            }
            
            if (details.length < 10) {
                showNotification('Please provide more details (minimum 10 characters)', 'error');
                return;
            }
            
            if (currentViewerStatus) {
                reportStatus(currentViewerStatus.id, selectedReason, details).then(response => {
                    if (response && response.success) {
                        showNotification(`Report submitted ${isAnonymous ? 'anonymously' : ''}`, 'success');
                        reportModal.classList.remove('active');
                    }
                }).catch(error => {
                    showNotification('Failed to submit report', 'error');
                });
            }
        });
    }
    
    const sendReplyBtn = document.getElementById('sendReplyBtn');
    if (sendReplyBtn) {
        sendReplyBtn.addEventListener('click', () => {
            const replyInput = document.getElementById('replyInput');
            if (!replyInput) return;
            
            const replyText = replyInput.value.trim();
            if (!replyText) return;
            
            if (currentViewerStatus) {
                showNotification('Reply sent: ' + replyText, 'success');
                replyInput.value = '';
            }
        });
    }
    
    const replyInput = document.getElementById('replyInput');
    if (replyInput) {
        replyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const sendReplyBtn = document.getElementById('sendReplyBtn');
                if (sendReplyBtn) {
                    sendReplyBtn.click();
                }
            }
        });
    }
    
    const viewHighlightsBtn = document.getElementById('viewHighlightsBtn');
    if (viewHighlightsBtn) {
        viewHighlightsBtn.addEventListener('click', showHighlightsModal);
    }
    
    const closeHighlightsModal = document.getElementById('closeHighlightsModal');
    if (closeHighlightsModal) {
        closeHighlightsModal.addEventListener('click', () => {
            highlightsModal.classList.remove('active');
        });
    }
    
    const createHighlightBtn = document.getElementById('createHighlightBtn');
    if (createHighlightBtn) {
        createHighlightBtn.addEventListener('click', () => {
            // Check authentication using imported functions
            if (!parentCoordinator.handshakeComplete && !isAuthenticated()) {
                showNotification('Please sign in to create a highlight', 'error');
                return;
            }
            showHighlightsEditor();
        });
    }
    
    const closeHighlightsEditor = document.getElementById('closeHighlightsEditor');
    if (closeHighlightsEditor) {
        closeHighlightsEditor.addEventListener('click', () => {
            highlightsEditorModal.classList.remove('active');
        });
    }
    
    const cancelHighlightBtn = document.getElementById('cancelHighlightBtn');
    if (cancelHighlightBtn) {
        cancelHighlightBtn.addEventListener('click', () => {
            highlightsEditorModal.classList.remove('active');
        });
    }
    
    const saveHighlightBtn = document.getElementById('saveHighlightBtn');
    if (saveHighlightBtn) {
        saveHighlightBtn.addEventListener('click', saveHighlight);
    }
    
    const viewTimelineBtn = document.getElementById('viewTimelineBtn');
    if (viewTimelineBtn) {
        viewTimelineBtn.addEventListener('click', showMemoryTimelineModal);
    }
    
    const closeMemoryTimelineModal = document.getElementById('closeMemoryTimelineModal');
    if (closeMemoryTimelineModal) {
        closeMemoryTimelineModal.addEventListener('click', () => {
            memoryTimelineModal.classList.remove('active');
        });
    }
    
    const exportTimelineBtn = document.getElementById('exportTimelineBtn');
    if (exportTimelineBtn) {
        exportTimelineBtn.addEventListener('click', () => {
            const timelineData = {
                user: currentUser?.displayName || 'User',
                exportDate: new Date().toISOString(),
                totalStatuses: myStatuses.length,
                statuses: myStatuses.map(s => ({
                    date: s.createdAt,
                    type: s.type,
                    text: s.text || s.caption || s.question,
                    mood: s.mood,
                    intent: s.intent
                }))
            };
            
            const blob = new Blob([JSON.stringify(timelineData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `timeline-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('Timeline exported successfully', 'success');
        });
    }
    
    const viewStatsBtn = document.getElementById('viewStatsBtn');
    if (viewStatsBtn) {
        viewStatsBtn.addEventListener('click', showStatsModal);
    }
    
    const closeStatsModal = document.getElementById('closeStatsModal');
    if (closeStatsModal) {
        closeStatsModal.addEventListener('click', () => {
            statsModal.classList.remove('active');
        });
    }
    
    const refreshStatsBtn = document.getElementById('refreshStatsBtn');
    if (refreshStatsBtn) {
        refreshStatsBtn.addEventListener('click', () => {
            loadStatsContent();
            showNotification('Stats refreshed', 'success');
        });
    }
    
    const viewDraftsBtn = document.getElementById('viewDraftsBtn');
    if (viewDraftsBtn) {
        viewDraftsBtn.addEventListener('click', showDraftsModal);
    }
    
    const closeDraftsModal = document.getElementById('closeDraftsModal');
    if (closeDraftsModal) {
        closeDraftsModal.addEventListener('click', () => {
            draftsModal.classList.remove('active');
        });
    }
    
    const deleteAllDraftsBtn = document.getElementById('deleteAllDraftsBtn');
    if (deleteAllDraftsBtn) {
        deleteAllDraftsBtn.addEventListener('click', deleteAllDrafts);
    }
    
    const loadDraftBtn = document.getElementById('loadDraftBtn');
    if (loadDraftBtn) {
        loadDraftBtn.addEventListener('click', () => {
            if (selectedDraft) {
                loadDraft(selectedDraft);
            }
        });
    }
    
    const viewScheduledBtn = document.getElementById('viewScheduledBtn');
    if (viewScheduledBtn) {
        viewScheduledBtn.addEventListener('click', () => {
            scheduleModal.classList.add('active');
        });
    }
    
    const viewMyStatusBtn = document.getElementById('viewMyStatusBtn');
    if (viewMyStatusBtn) {
        viewMyStatusBtn.addEventListener('click', () => {
            if (myStatuses.length > 0) {
                showStatusViewer(myStatuses[0]);
            } else {
                showNotification('You have no statuses yet', 'info');
            }
        });
    }
    
    const editMyStatusBtn = document.getElementById('editMyStatusBtn');
    if (editMyStatusBtn) {
        editMyStatusBtn.addEventListener('click', () => {
            if (myStatuses.length > 0) {
                const latestStatus = myStatuses[0];
                createStatusModal.classList.add('active');
                const textTab = document.querySelector('.create-status-tab[data-tab="text"]');
                if (textTab) {
                    textTab.click();
                }
                
                if (latestStatus.type === 'text' && latestStatus.text) {
                    const textInput = document.getElementById('textStatusInput');
                    if (textInput) {
                        textInput.value = latestStatus.text;
                        updateTextStatusCounter();
                    }
                }
                
                showNotification('Loaded latest status for editing', 'success');
            } else {
                createStatusModal.classList.add('active');
            }
        });
    }
    
    const myStatusPreview = document.getElementById('myStatusPreview');
    if (myStatusPreview) {
        myStatusPreview.addEventListener('click', () => {
            if (myStatuses.length > 0) {
                showStatusViewer(myStatuses[0]);
            } else {
                // Check authentication using imported functions
                if (!parentCoordinator.handshakeComplete && !isAuthenticated()) {
                    showNotification('Please sign in to create a status', 'error');
                    return;
                }
                createStatusModal.classList.add('active');
            }
        });
    }
    
    const notificationTimeSelect = document.getElementById('notificationTimeSelect');
    const scheduleNotificationToggle = document.getElementById('scheduleNotificationToggle');
    
    if (notificationTimeSelect && scheduleNotificationToggle) {
        scheduleNotificationToggle.addEventListener('change', function() {
            notificationTimeSelect.disabled = !this.checked;
        });
    }
    
    const retryConnectionBtn = document.getElementById('retryConnectionBtn');
    if (retryConnectionBtn) {
        retryConnectionBtn.addEventListener('click', async () => {
            errorUI.classList.remove('active');
            showNotification('Retrying connection...', 'info');
            
            try {
                const success = await bootstrapApplication();
                if (!success) {
                    errorUI.classList.add('active');
                }
            } catch (error) {
                errorUI.classList.add('active');
            }
        });
    }
    
    const offlineModeBtn = document.getElementById('offlineModeBtn');
    if (offlineModeBtn) {
        offlineModeBtn.addEventListener('click', () => {
            errorUI.classList.remove('active');
            isOfflineMode = true;
            showNotification('Offline mode enabled', 'warning');
            loadCachedDataInstantly();
        });
    }
    
    window.addEventListener('beforeunload', () => {
        stopAutoAdvance();
    });
}

/**
 * Handle media upload
 * @param {Event} event - File input event
 */
function handleMediaUpload(event) {
    const files = event.target.files;
    const mediaPreview = document.getElementById('mediaPreview');
    
    if (!mediaPreview) return;
    
    mediaPreview.innerHTML = '';
    
    for (let i = 0; i < Math.min(files.length, 5); i++) {
        const file = files[i];
        const fileType = file.type.split('/')[0];
        
        if (fileType !== 'image' && fileType !== 'video') {
            showNotification('Only images and videos are supported', 'error');
            continue;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const mediaItem = document.createElement('div');
            mediaItem.className = 'media-preview-item';
            
            if (fileType === 'image') {
                mediaItem.innerHTML = `
                    <img src="${e.target.result}" class="media-preview-image" alt="Preview">
                    <button class="remove-media-btn" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else if (fileType === 'video') {
                mediaItem.innerHTML = `
                    <video src="${e.target.result}" class="media-preview-image" controls></video>
                    <button class="remove-media-btn" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            
            const removeBtn = mediaItem.querySelector('.remove-media-btn');
            removeBtn.addEventListener('click', () => {
                mediaItem.remove();
            });
            
            mediaPreview.appendChild(mediaItem);
        };
        
        reader.readAsDataURL(file);
    }
}

/**
 * Stop auto-advance
 */
function stopAutoAdvance() {
    if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
        autoAdvanceInterval = null;
    }
    
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

// =============================================
// APPLICATION INITIALIZATION
// =============================================

/**
 * Initialize the application with centralized token system
 */
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Status] Page loaded - UI initialization');
    
    // Immediately show UI with cached data
    loadCachedDataInstantly();
    renderStatusListInstantly();
    setupBasicEventListeners();
    initializeUIComponents();
    
    // Wait for core to initialize
    onTokenReady(() => {
        updateUserUIInstantly();
        enableProtectedUI();
        
        // Setup event listeners
        setTimeout(() => {
            setupEventListeners();
        }, 200);
    });
    
    // Start core initialization
    initPageCore();
});

console.log('[Status] UI system initialized successfully');