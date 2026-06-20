// =============================================
// STATUS SYSTEM - RESILIENT UI CONTROLLER
// ENHANCED VERSION v8.1 - FULL LIFECYCLE-COMPLIANT INTEGRATION
// ALL ACTIONS GATED BY ensureActive()
// NO RETRY LOOPS - HARD WAIT PARENT
// REAL DATA FROM BACKEND - NO FAKE FALLBACKS
// =============================================

// Instead of ES module imports, use the global StatusCore object
// Wait for the DOM to be ready and access from window

// =============================================
// UI LOGGING - Clean, No Spam
// =============================================
const UILogger = {
    logs: [],
    warnings: new Set(),
    errors: new Set(),
    renderTimings: new Map(),
    maxLogs: 50,
    diagnostics: false,
    lastLogTime: 0,
    logThrottle: 1000,
    messageCache: new Set(),
    lifecycleState: null,

    enableDiagnostics() {
        this.diagnostics = true;
        if (typeof window.DiagnosticsAgent !== 'undefined') {
            window.DiagnosticsAgent.enable();
        }
        console.log('%c[UI] Diagnostics enabled', 'color: #5856d6; font-weight: bold;');
    },

    disableDiagnostics() {
        this.diagnostics = false;
        if (typeof window.DiagnosticsAgent !== 'undefined') {
            window.DiagnosticsAgent.disable();
        }
    },

    log(level, module, message, data = null) {
        const cacheKey = `${level}:${module}:${message}`;
        if (this.messageCache.has(cacheKey)) return;
        this.messageCache.add(cacheKey);
        
        const now = Date.now();
        
        if (level === 'error') {
            const key = `${module}:${message}`;
            if (!this.errors.has(key)) {
                this.errors.add(key);
                if (typeof window.DiagnosticsAgent !== 'undefined') {
                    window.DiagnosticsAgent.error(module, message, data);
                }
                console.error(`[UI ERROR] ${module}: ${message}`, data || '');
                setTimeout(() => this.errors.delete(key), 60000);
            }
        } else if (level === 'warn') {
            const key = `${module}:${message}`;
            if (!this.warnings.has(key)) {
                this.warnings.add(key);
                if (typeof window.DiagnosticsAgent !== 'undefined') {
                    window.DiagnosticsAgent.warn(module, message, data);
                }
                console.warn(`[UI WARN] ${module}: ${message}`, data || '');
                setTimeout(() => this.warnings.delete(key), 30000);
            }
        } else if (level === 'info') {
            if (now - this.lastLogTime > this.logThrottle) {
                this.lastLogTime = now;
                console.log(`[UI] ${module}: ${message}`, data || '');
                if (typeof window.DiagnosticsAgent !== 'undefined') {
                    window.DiagnosticsAgent.info(module, message, data);
                }
            }
        } else if (level === 'debug' && this.diagnostics) {
            console.debug(`[UI DEBUG] ${module}: ${message}`, data || '');
            if (typeof window.DiagnosticsAgent !== 'undefined') {
                window.DiagnosticsAgent.debug(module, message, data);
            }
        }
        
        if (this.messageCache.size > 1000) {
            this.messageCache.clear();
        }
    },

    info(module, message, data) { this.log('info', module, message, data); },
    warn(module, message, data) { this.log('warn', module, message, data); },
    error(module, message, data) { this.log('error', module, message, data); },
    debug(module, message, data) { this.log('debug', module, message, data); },

    startRender(component) {
        this.renderTimings.set(component, performance.now());
    },

    endRender(component) {
        const start = this.renderTimings.get(component);
        if (start) {
            const duration = performance.now() - start;
            this.renderTimings.delete(component);
            return duration;
        }
        return 0;
    },

    updateLifecycleState(state) {
        this.lifecycleState = state;
        this.debug('Lifecycle', `UI aware of state: ${state}`);
    },

    getDiagnostics() {
        return {
            logs: this.logs.slice(0, 20),
            warnings: Array.from(this.warnings),
            errors: Array.from(this.errors),
            renderCount: this.renderTimings.size,
            diagnostics: this.diagnostics,
            lifecycleState: this.lifecycleState
        };
    }
};

function logUIError(section, error) {
    UILogger.error('UI', `Section ${section} failed`, {
        message: error?.message,
        section
    });
}

// =============================================
// Helper function to get core modules safely
// =============================================
function getCore() {
    // Check multiple possible locations for the core module.
    // NEVER return window — that causes infinite recursion because
    // window.getStatuses === getStatuses, window.getCore === getCore, etc.
    if (window.StatusCore && window.StatusCore.default &&
        typeof window.StatusCore.default.getStatuses === 'function') {
        return window.StatusCore.default;
    }
    if (window.StatusCore && window.StatusCore !== window &&
        typeof window.StatusCore.getStatuses === 'function') {
        return window.StatusCore;
    }
    if (window.__STATUS_CORE__ && window.__STATUS_CORE__ !== window) {
        return window.__STATUS_CORE__;
    }
    // Return null — callers must handle null gracefully
    return null;
}

function getLifecycleState() {
    const core = getCore();
    if (!core || core === window) return null;
    if (core.getLifecycleState) return core.getLifecycleState();
    if (core.getState)         return core.getState();
    return null;
}

function getLifecycleStateEnum() {
    const core = getCore();
    const defaults = { BOOT: 'BOOT', INITIALIZING: 'INITIALIZING', READY: 'READY', WAIT_PARENT: 'WAIT_PARENT', ACTIVE: 'ACTIVE' };
    if (!core || core === window) return defaults;
    return core.LifecycleState || defaults;
}

function ensureUIActive(actionName) {
    // FIX: Tab switching, navigation, and filter actions never need a lifecycle gate —
    // blocking them causes the entire UI to appear frozen even when the session is valid.
    const freeActions = ['tab', 'filter', 'myStatusPreview', 'viewStatus', 'network-recovery',
                         'memoryTimeline', 'stats', 'showSchedule', 'highlights', 'highlightsEditor',
                         'drafts', 'viewMyStatus', 'editStatus'];
    if (freeActions.some(f => actionName === f || actionName.startsWith(f))) {
        return true;
    }

    const lifecycle = getLifecycleState();
    const LifecycleState = getLifecycleStateEnum();
    const core = getCore();
    const sessionReady = core && core !== window && core.isSessionReady ? core.isSessionReady() : false;
    
    // Allow if ACTIVE OR session is ready (core may be active even if lifecycle says otherwise)
    if ((lifecycle && lifecycle.state === LifecycleState.ACTIVE) || sessionReady) {
        return true;
    }

    // FIX: Also allow if we have any valid session data stored (handles timing issues)
    try {
        const storedToken = localStorage.getItem('kynecta_auth') || localStorage.getItem('token') ||
                            localStorage.getItem('moodchat_token') || localStorage.getItem('accessToken');
        if (storedToken) return true;
    } catch(e) {}
    
    UILogger.warn('Lifecycle', `Blocked UI action: ${actionName} - not ACTIVE (state: ${lifecycle?.state || 'unknown'}, sessionReady: ${sessionReady})`);
    showNotification('Please wait, connecting...', 'info');
    return false;
}

function isSessionReady() {
    const core = getCore();
    if (core && core !== window && core.isSessionReady) return core.isSessionReady();
    // Fallback: check localStorage token
    try { return !!(localStorage.getItem('kynecta_auth') || localStorage.getItem('token') || localStorage.getItem('accessToken')); } catch(e) {}
    return false;
}

function isAuthenticated() {
    const core = getCore();
    if (core && core !== window && core.isAuthenticated) return core.isAuthenticated();
    if (core && core !== window && core.SessionManager && core.SessionManager.isAuthenticated) return core.SessionManager.isAuthenticated();
    try { return !!(localStorage.getItem('kynecta_auth') || localStorage.getItem('token') || localStorage.getItem('accessToken')); } catch(e) {}
    return false;
}

function getSessionToken() {
    const core = getCore();
    if (core && core !== window && core.getSessionToken) return core.getSessionToken();
    if (core && core !== window && core.SessionManager && core.SessionManager.getToken) return core.SessionManager.getToken();
    try { return localStorage.getItem('kynecta_auth') || localStorage.getItem('token') || localStorage.getItem('accessToken') || null; } catch(e) {}
    return null;
}

function getSessionUser() {
    const core = getCore();
    if (core && core !== window && core.getSessionUser) return core.getSessionUser();
    if (core && core !== window && core.SessionManager && core.SessionManager.getUser) return core.SessionManager.getUser();
    // Fallback: return cached user from window
    return window.currentUser || (window.auth && window.auth.currentUser) || null;
}

// Get the actual data from core
function getStatuses() {
    const core = getCore();
    // Extra guard: never call core.getStatuses if core is window (recursion trap)
    if (core && core !== window && typeof core.getStatuses === 'function') {
        return core.getStatuses();
    }
    // Fallback: return cached statuses from module-level variable if available
    if (typeof allStatuses !== 'undefined' && Array.isArray(allStatuses)) return allStatuses;
    if (typeof liveStatuses !== 'undefined' && Array.isArray(liveStatuses)) return liveStatuses;
    return [];
}

function getMyStatuses() {
    const core = getCore();
    if (core && core !== window && typeof core.getMyStatuses === 'function') {
        return core.getMyStatuses();
    }
    if (typeof myStatuses !== 'undefined' && Array.isArray(myStatuses)) return myStatuses;
    return [];
}

// Global variables that will be populated from core
let currentUser = null;
let userData = null;
let statuses = [];
let myStatuses = [];
let friendsStatuses = [];
let friendsList = [];
let closeFriendsStatuses = [];
let pinnedStatuses = [];
let mutedStatuses = [];
let microCirclesStatuses = [];
let highlights = [];
let drafts = [];
let scheduledStatuses = [];
let viewedStatuses = (() => {
    try {
        // Load from localStorage — try both possible keys
        const raw = localStorage.getItem('kyn_viewed_statuses')
            || localStorage.getItem('knecta_viewed_statuses');
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return new Set(arr.map(String));
        }
    } catch (_) {}
    return new Set();
})();
let mutedUsers = new Set();
let currentViewerStatus = null;
let currentSlideIndex = 0;
let autoAdvanceInterval = null;
let isAutoAdvancePaused = false;
let progressInterval = null;
let currentCategoryFilter = 'all';
let currentIntentFilter = null;
let currentMoodFilter = null;
let isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
let isOfflineMode = false;
let pendingReplies = [];
let pendingReactions = [];
let moodChartData = [];
let streakCount = 0;
let lastPostDate = null;
let activeFilters = new Set();
let selectedDraft = null;
let isBackgroundInitialized = false;
let isTokenReady = false;
let parentReady = false;

function syncDataFromCore() {
    const core = getCore();

    function readLocalJson(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return parsed == null ? fallback : parsed;
        } catch (_error) {
            return fallback;
        }
    }
    
    // Sync statuses
    if (core && core.getStatuses) {
        const newStatuses = core.getStatuses();
        if (newStatuses !== statuses) {
            statuses = newStatuses;
        }
    } else if (!Array.isArray(statuses) || statuses.length === 0) {
        statuses = readLocalJson(LOCAL_STORAGE_KEYS.STATUSES, []);
    }
    
    // Sync my statuses
    if (core && core.getMyStatuses) {
        const newMyStatuses = core.getMyStatuses();
        if (newMyStatuses !== myStatuses) {
            myStatuses = newMyStatuses;
        }
    } else if (!Array.isArray(myStatuses) || myStatuses.length === 0) {
        myStatuses = readLocalJson(LOCAL_STORAGE_KEYS.MY_STATUSES, []);
    }
    
    // Sync friends statuses
    if (core && core.getFriendsStatuses) {
        const newFriendsStatuses = core.getFriendsStatuses();
        if (newFriendsStatuses !== friendsStatuses) {
            friendsStatuses = newFriendsStatuses;
        }
    }
    
    // Sync friends list
    if (core && core.getFriendsList) {
        const newFriendsList = core.getFriendsList();
        if (newFriendsList !== friendsList) {
            friendsList = newFriendsList;
        }
    } else if (!Array.isArray(friendsList) || friendsList.length === 0) {
        friendsList = readLocalJson('friends', []);
    }
    
    // Sync session
    if (core && core.SessionManager) {
        if (core.SessionManager.getUser) {
            const user = core.SessionManager.getUser();
            if (user && user !== currentUser) {
                currentUser = user;
                userData = user;
            }
        }
        if (core.SessionManager.isAuthenticated) {
            const authenticated = core.SessionManager.isAuthenticated();
            if (authenticated !== isTokenReady) {
                isTokenReady = authenticated;
            }
        }
    } else if (!currentUser) {
        currentUser =
            readLocalJson('currentUser', null) ||
            readLocalJson('user', null) ||
            readLocalJson('kynecta_auth', null)?.user ||
            null;
        userData = currentUser;
        isTokenReady = !!(localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('moodchat_token'));
    }
    
    // Sync parent ready
    if (core && core.parentReady !== undefined) {
        parentReady = core.parentReady;
    }
    
    // Sync drafts
    if (core && core.getDrafts) {
        drafts = core.getDrafts();
    }
    
    // Sync scheduled
    if (core && core.getScheduled) {
        scheduledStatuses = core.getScheduled();
    }
    
    // Sync highlights
    if (core && core.getHighlights) {
        highlights = core.getHighlights();
    }
    
    // Sync streak
    if (core && core.getStreakCount) {
        streakCount = core.getStreakCount();
    }
    
    // Sync mood data
    if (core && core.getMoodChartData) {
        moodChartData = core.getMoodChartData();
    }
}

// Populate friends in create status modal
function populateFriendsInCreateModal() {
    const friendsContainer = document.getElementById('friendsListContainer');
    if (!friendsContainer) return;

    if (!friendsList || friendsList.length === 0) {
        try {
            const cachedFriends = JSON.parse(localStorage.getItem('friends') || '[]');
            if (Array.isArray(cachedFriends) && cachedFriends.length > 0) {
                friendsList = cachedFriends;
            }
        } catch (_error) {}
    }
    
    if (!friendsList || friendsList.length === 0) {
        friendsContainer.innerHTML = `
            <div class="empty-state-small">
                <i class="fas fa-user-friends"></i>
                <p>No friends to share with</p>
            </div>
        `;
        return;
    }
    
    friendsContainer.innerHTML = '';
    friendsList.slice(0, 20).forEach(friend => {
        const friendEl = document.createElement('div');
        friendEl.className = 'friend-select-item';
        friendEl.dataset.friendId = friend.id;
        friendEl.innerHTML = `
            <div class="friend-avatar">
                ${friend.photoURL ? `<img src="${friend.photoURL}" alt="${friend.displayName}">` : `<span>${(friend.displayName || 'U')[0]}</span>`}
            </div>
            <div class="friend-name">${escapeHtml(friend.displayName || 'User')}</div>
            <div class="friend-checkbox"><i class="far fa-square"></i></div>
        `;
        friendEl.addEventListener('click', () => {
            friendEl.classList.toggle('selected');
            const checkbox = friendEl.querySelector('.friend-checkbox i');
            if (friendEl.classList.contains('selected')) {
                checkbox.className = 'fas fa-check-square';
            } else {
                checkbox.className = 'far fa-square';
            }
        });
        friendsContainer.appendChild(friendEl);
    });
}

// Subscribe to status state changes
// ── Direct friend-status fetcher ────────────────────────────────────────────
// Called on init and when socket signals new_status from a friend.
// Uses StatusAPI directly so it works even when core.loadStatuses() only
// loads the current user's own statuses.
let _friendFetchPending = false;
let _friendFetchLast    = 0;
let _friendFetchRetryCount = 0;
async function _fetchFriendStatusesDirect() {
    const now = Date.now();
    if (_friendFetchPending) return;
    if (now - _friendFetchLast < 5000) return;
    _friendFetchPending = true;
    _friendFetchLast = now;
    try {
        const api = window.StatusAPI;
        if (!api) { console.warn('[status-ui] StatusAPI not available'); return; }

        // Try getFriendsStatuses first
        let statResult = null;
        if (api.getFriendsStatuses) {
            statResult = await api.getFriendsStatuses({ limit: 100 });
        }

        // If that fails or returns empty, try getTimeline (alternate endpoint)
        if ((!statResult || !statResult.success || !Array.isArray(statResult.statuses) || !statResult.statuses.length)
            && api.getTimeline) {
            statResult = await api.getTimeline({ limit: 100 });
        }
        _friendFetchRetryCount = 0; // success path reached — clear any prior failure streak

        let fetched = (statResult && (statResult.statuses || statResult.data || []));
        if (Array.isArray(fetched)) {
            // CRITICAL FIX: Filter out permanently deleted and expired statuses
            const deletedIds = new Set();
            try {
                const dl = JSON.parse(localStorage.getItem('kyn_deleted_statuses_v1') || '[]');
                dl.forEach(function(id) { deletedIds.add(String(id)); });
            } catch(_) {}
            const EXPIRY_MS = 24 * 60 * 60 * 1000;
            const now = Date.now();
            fetched = fetched.filter(function(s) {
                if (!s || !s.id) return false;
                if (deletedIds.has(String(s.id))) return false;
                if (s.isDeleted) return false;
                const created = new Date(s.createdAt || s.created_at || 0).getTime();
                if (created > 0 && (now - created) >= EXPIRY_MS) return false;
                return true;
            });
        }
        if (Array.isArray(fetched) && fetched.length > 0) {
            console.log('[status-ui] ✅ Loaded', fetched.length, 'friend statuses (filtered)');
            const uid = String((currentUser && (currentUser.id || currentUser.userId))
                || (window.currentUser && (window.currentUser.id || window.currentUser.userId)) || '');
            // Separate own vs friend statuses
            fetched.forEach(s => {
                const ownerId = String(s.userId || s.user_id || (s.user && s.user.id) || '');
                if (uid && ownerId === uid) {
                    // Own status → myStatuses
                    if (!myStatuses.find(x => String(x.id) === String(s.id))) {
                        myStatuses.unshift(s);
                    }
                } else {
                    // Friend status → friendsStatuses
                    if (!friendsStatuses.find(x => String(x.id) === String(s.id))) {
                        friendsStatuses.push(s);
                    }
                }
            });
            renderStatusListInstantlyUI();
            updateMyStatusPreviewUI();
            const lbl = document.getElementById('recentUpdatesLabel');
            if (lbl && friendsStatuses.length > 0) lbl.style.display = '';
        } else {
            console.log('[status-ui] No friend statuses returned from API');
            // Always render even when empty — clears the loading spinner
            renderStatusListInstantlyUI();
        }
    } catch (e) {
        console.warn('[status-ui] _fetchFriendStatusesDirect error:', e);
        // ── FIX: A single failure (common during Render cold-start or on slow
        // links) used to leave the status list empty forever — the only way
        // out was a full page reload. Retry with backoff up to 3 times instead
        // of silently giving up after the first network error.
        _friendFetchRetryCount = (_friendFetchRetryCount || 0) + 1;
        if (_friendFetchRetryCount <= 3) {
            const retryDelay = 3000 * _friendFetchRetryCount; // 3s, 6s, 9s
            console.log(`[status-ui] Retrying friend statuses fetch in ${retryDelay}ms (attempt ${_friendFetchRetryCount}/3)`);
            setTimeout(() => {
                _friendFetchLast = 0; // bypass debounce for the retry
                _fetchFriendStatusesDirect();
            }, retryDelay);
        } else {
            _friendFetchRetryCount = 0;
            renderStatusListInstantlyUI(); // clear spinner, show empty state as last resort
        }
        return;
    } finally {
        _friendFetchPending = false;
    }
}

function subscribeToStatusChanges() {
    const core = getCore();
    if (core && core !== window && core.subscribe) {
        core.subscribe((newState) => {
            let needsRender = false;
            if (newState.statuses) {
                statuses = newState.statuses;
                needsRender = true;
            }
            // Core may return friend statuses under different keys
            if (newState.friendsStatuses) {
                friendsStatuses = newState.friendsStatuses;
                needsRender = true;
            }
            if (newState.allStatuses) {
                // Some cores put everything in allStatuses — split own vs friends
                const uid = String((window.currentUser && (window.currentUser.id || window.currentUser.userId)) || '');
                if (uid) {
                    myStatuses = newState.allStatuses.filter(s => String(s.userId || s.user_id || '') === uid);
                    friendsStatuses = newState.allStatuses.filter(s => String(s.userId || s.user_id || '') !== uid);
                } else {
                    friendsStatuses = newState.allStatuses;
                }
                needsRender = true;
            }
            if (newState.myStatuses) {
                myStatuses = newState.myStatuses;
                updateMyStatusPreviewUI();
            }
            if (needsRender) renderStatusListInstantlyUI();
        });
    }
    
    // Also listen to custom events
    document.addEventListener('statusStateChanged', (e) => {
        if (e.detail && e.detail.state) {
            if (e.detail.state.statuses && e.detail.state.statuses.length > 0) {
                statuses = e.detail.state.statuses;
            }
            if (e.detail.state.myStatuses && e.detail.state.myStatuses.length > 0) {
                myStatuses = e.detail.state.myStatuses;
            }
            renderStatusListInstantlyUI();
            updateMyStatusPreviewUI();
        }
    });

    // statusExpired fires when a status hits its countdown — remove it from UI instantly
    // ── Raw socket: new_status from a friend → refresh friend statuses ──
    document.addEventListener('new_status', (e) => {
        if (typeof _fetchFriendStatusesDirect === 'function') _fetchFriendStatusesDirect();
    });
    document.addEventListener('status_created', (e) => {
        if (typeof _fetchFriendStatusesDirect === 'function') _fetchFriendStatusesDirect();
    });

    // ── Fetch friends whenever auth is ready (works before ACTIVE lifecycle) ──
    const _earlyFetch = () => {
        _friendFetchLast = 0;
        if (typeof _fetchFriendStatusesDirect === 'function') {
            setTimeout(_fetchFriendStatusesDirect, 500);
        }
    };
    window.addEventListener('message', function _authReadyListener(e) {
        const t = e.data && (e.data.type || (e.data.payload && e.data.payload.type));
        if (t === 'AUTH_READY' || t === 'PARENT_READY' || t === 'SESSION_DATA') {
            _earlyFetch();
        }
    });
    // Also catch the DOM events from status-core lifecycle
    document.addEventListener('statusModuleReady',  _earlyFetch, { once: true });
    document.addEventListener('statusModuleActive', _earlyFetch, { once: true });
    document.addEventListener('kyn:moduleActive',   _earlyFetch, { once: true });

    document.addEventListener('statusExpired', (e) => {
        const expiredId = e.detail && (e.detail.statusId || e.detail.id);
        if (!expiredId) return;
        const idStr = String(expiredId);
        statuses   = (statuses   || []).filter(s => String(s.id) !== idStr);
        myStatuses = (myStatuses || []).filter(s => String(s.id) !== idStr);
        renderStatusListInstantlyUI();
        updateMyStatusPreviewUI();
    });

    document.addEventListener('viewerUpdate', (e) => {
        const statusId  = String(e.detail?.statusId || '');
        if (!statusId) return;
        const nextCount = Number(e.detail?.viewerCount ?? e.detail?.viewCount ?? 0);

        // 1. Update all local arrays
        [statuses, myStatuses, friendsStatuses].forEach(arr => {
            (arr || []).forEach(item => {
                if (String(item.id) === statusId) item.viewCount = nextCount;
            });
        });

        // 2. Update VBS sheet count if open
        const vbsCount = document.getElementById('vbsCount');
        if (vbsCount) vbsCount.textContent = nextCount;

        // 3. Update seenCountNum if viewer is open for this status
        if (currentViewerStatus && String(currentViewerStatus.id) === statusId) {
            currentViewerStatus.viewCount = nextCount;
            const el = document.getElementById('seenCountNum');
            if (el) el.textContent = String(nextCount);
        }

        // 4. Even if viewer is closed, update the seenCountNum if it's the owner's status
        // (creator may have the sidebar open but not the viewer)
        const myStatusItem = (myStatuses || []).find(s => String(s.id) === statusId);
        if (myStatusItem) {
            myStatusItem.viewCount = nextCount;
            // Update My Status preview sub-text if visible
            const subEl = document.getElementById('myStatusText');
            if (subEl && myStatuses.length > 0) {
                const latest = myStatuses[0];
                subEl.textContent = (myStatuses.length > 1 ? myStatuses.length + ' updates · ' : '')
                    + formatTimeAgo(latest.createdAt);
            }
        }

        console.log('[status-ui] 👁 View recorded for status', statusId, '→ count:', nextCount);
    });

    document.addEventListener('reactionUpdate', (e) => {
        const d = e.detail || {};
        if (!d.statusId) return;
        const sid     = String(d.statusId);
        const emoji   = d.emoji;
        const count   = d.count;
        const userId  = String(d.userId || d.reactorId || '');

        // 1. Update UI (emoji trigger icon + sidebar badge)
        if (typeof window.updateStatusReactionUI === 'function') {
            window.updateStatusReactionUI(sid, emoji, count);
        }

        // 2. Patch the SPECIFIC status in every local array
        //    — reactions stored per status, per emoji, per user (one per user)
        const patchReaction = (arr) => {
            if (!Array.isArray(arr)) return;
            const s = arr.find(x => String(x.id) === sid);
            if (!s) return;
            if (!s.reactions) s.reactions = {};
            // One reaction per user — remove old reaction by this user across all emojis
            if (userId) {
                Object.keys(s.reactions).forEach(em => {
                    if (Array.isArray(s.reactions[em])) {
                        s.reactions[em] = s.reactions[em].filter(r =>
                            String(r.userId || r) !== userId);
                    }
                });
            }
            // Add new reaction
            if (!s.reactions[emoji]) s.reactions[emoji] = [];
            if (userId) s.reactions[emoji].push({ userId, emoji });
            // Update convenience fields
            s.latestReaction = emoji;
            s.reactionCount  = Object.values(s.reactions)
                .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
            console.log('[status-ui] 💬 Reaction', emoji, 'recorded on status', sid,
                '| total reactions:', s.reactionCount);
        };
        [friendsStatuses, statuses, myStatuses].forEach(patchReaction);

        // 3. Re-render sidebar badges without full re-render (just update the item)
        const listItem = document.querySelector(`.status-group-item[data-status-ids*="${sid}"]`);
        if (listItem) {
            let badges = listItem.querySelector('.status-group-badges');
            if (!badges) {
                badges = document.createElement('div');
                badges.className = 'status-group-badges';
                const info = listItem.querySelector('.status-group-info');
                if (info) info.appendChild(badges);
            }
            let rb = badges.querySelector('.reaction-badge');
            if (!rb) {
                rb = document.createElement('span');
                rb.className = 'status-badge reaction-badge';
                badges.appendChild(rb);
            }
            rb.textContent = emoji + (count > 1 ? ' ' + count : '');
        }
    });

    document.addEventListener('statusReply', (e) => {
        const payload = e.detail || {};
        if (payload.statusId && currentViewerStatus && String(currentViewerStatus.id) === String(payload.statusId)) {
            showNotification('New status reply received', 'info');
        }
    });
    
    document.addEventListener('sessionReady', (e) => {
        if (e.detail && e.detail.user) {
            currentUser = e.detail.user;
            userData = currentUser;
            isTokenReady = true;
            enableProtectedUI();
        }
    });
}

// =============================================
// STATUS DEFINITIONS (Local copies)
// =============================================
const statusTypes = {
    'text': { name: 'Text Status', icon: 'fas fa-font', color: 'var(--primary-color)' },
    'media': { name: 'Media Status', icon: 'fas fa-image', color: 'var(--success-color)' },
    'poll': { name: 'Poll Status', icon: 'fas fa-poll', color: 'var(--warning-color)' }
};

const statusIntents = {
    'feedback': { name: 'Looking for feedback', icon: 'fas fa-comments', color: 'var(--intent-feedback)' },
    'achievement': { name: 'Sharing achievement', icon: 'fas fa-trophy', color: 'var(--intent-achievement)' },
    'advice': { name: 'Need advice', icon: 'fas fa-hands-helping', color: 'var(--intent-advice)' },
    'chat': { name: 'Available to chat', icon: 'fas fa-comment-dots', color: 'var(--intent-chat)' },
    'venting': { name: 'Just venting', icon: 'fas fa-wind', color: 'var(--intent-venting)' },
    'reflection': { name: 'Personal reflection', icon: 'fas fa-brain', color: 'var(--intent-reflection)' },
    'question': { name: 'Asking a question', icon: 'fas fa-question-circle', color: 'var(--intent-question)' },
    'celebration': { name: 'Celebration', icon: 'fas fa-glass-cheers', color: 'var(--intent-celebration)' }
};

const statusMoods = {
    'happy': { name: 'Happy', emoji: '😊', color: 'var(--mood-happy)' },
    'stressed': { name: 'Stressed', emoji: '😫', color: 'var(--mood-stressed)' },
    'motivated': { name: 'Motivated', emoji: '💪', color: 'var(--mood-motivated)' },
    'lonely': { name: 'Lonely', emoji: '😔', color: 'var(--mood-lonely)' },
    'excited': { name: 'Excited', emoji: '🤩', color: 'var(--mood-excited)' },
    'calm': { name: 'Calm', emoji: '😌', color: 'var(--mood-calm)' },
    'sad': { name: 'Sad', emoji: '😢', color: 'var(--mood-sad)' },
    'angry': { name: 'Angry', emoji: '😠', color: 'var(--mood-angry)' }
};

const statusCategories = {
    'life': { name: 'Life', icon: 'fas fa-heart', color: 'var(--category-life)' },
    'business': { name: 'Business', icon: 'fas fa-briefcase', color: 'var(--category-business)' },
    'study': { name: 'Study', icon: 'fas fa-graduation-cap', color: 'var(--category-study)' },
    'motivation': { name: 'Motivation', icon: 'fas fa-fire', color: 'var(--category-motivation)' },
    'event': { name: 'Event', icon: 'fas fa-calendar-alt', color: 'var(--category-event)' }
};

const actionButtons = {
    'message': { name: 'Message me', icon: 'fas fa-comments', color: 'var(--primary-color)' },
    'join': { name: 'Join discussion', icon: 'fas fa-users', color: 'var(--success-color)' },
    'vote': { name: 'Vote now', icon: 'fas fa-vote-yea', color: 'var(--warning-color)' },
    'book': { name: 'Book a call', icon: 'fas fa-phone', color: 'var(--info-color)' },
    'learn': { name: 'Learn more', icon: 'fas fa-book', color: 'var(--primary-color)' },
    'support': { name: 'Show support', icon: 'fas fa-hands-helping', color: 'var(--success-color)' },
    'collaborate': { name: 'Collaborate', icon: 'fas fa-handshake', color: 'var(--warning-color)' },
    'resource': { name: 'View resource', icon: 'fas fa-external-link-alt', color: 'var(--info-color)' }
};

const privacySettings = {
    'everyone': { name: 'Everyone', description: 'Visible to all Knecta users', icon: 'fas fa-globe' },
    'friends': { name: 'Friends Only', description: 'Visible to your friends only', icon: 'fas fa-user-friends' },
    'close-friends': { name: 'Close Friends', description: 'Visible to close friends only', icon: 'fas fa-heart' },
    'except': { name: 'All Except...', description: 'Hide from specific people', icon: 'fas fa-user-minus' },
    'specific': { name: 'Specific People...', description: 'Share with select individuals', icon: 'fas fa-user-check' },
    'micro-circle': { name: 'Micro Circle', description: 'Share with a specific group', icon: 'fas fa-users' }
};

const durationOptions = {
    '3600':   '1 hour',
    '21600':  '6 hours',
    '43200':  '12 hours',
    '86400':  '24 hours',
    '604800': '1 week',
    '0':      'Permanent'
};

const reportReasons = {
    'spam': 'Spam',
    'inappropriate': 'Inappropriate Content',
    'harassment': 'Harassment',
    'false-info': 'False Information',
    'violence': 'Violence',
    'hate-speech': 'Hate Speech',
    'self-harm': 'Self-Harm',
    'copyright': 'Copyright Violation'
};

const reactions = {
    'like': '👍',
    'love': '❤️',
    'helpful': '💡',
    'inspiring': '✨',
    'funny': '😂',
    'not-useful': '👎'
};

const emojis = ['😊', '😂', '🥰', '😍', '🤩', '😎', '🤔', '😴', '🥳', '😢', '😠', '😱', '👍', '👎', '❤️', '🔥', '💯', '✨', '🎉', '🙏', '🤝', '💪', '👏', '🙌', '🤗', '😇', '🥺', '🤯', '😳', '🤪', '😜', '🤓', '😎', '🥶', '😈', '👻', '💀', '👀', '🦄', '🐶', '🐱', '🦁', '🐯', '🦊', '🐻', '🐼', '🐨', '🐵', '🦉', '🐣', '🦋', '🐝', '🐙', '🦑', '🐋', '🦈', '🐊', '🦒', '🐘', '🦏', '🦘', '🐫', '🦙', '🦌', '🐎', '🐖', '🐑', '🐕', '🐈', '🐇', '🦔', '🐿️', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'];

const backgroundOptions = [
    { id: '1', type: 'solid', color: 'var(--status-bg-1)' },
    { id: '2', type: 'solid', color: 'var(--status-bg-2)' },
    { id: '3', type: 'solid', color: 'var(--status-bg-3)' },
    { id: '4', type: 'solid', color: 'var(--status-bg-4)' },
    { id: '5', type: 'solid', color: 'var(--status-bg-5)' },
    { id: '6', type: 'solid', color: 'var(--status-bg-6)' },
    { id: '7', type: 'solid', color: 'var(--status-bg-7)' },
    { id: '8', type: 'solid', color: 'var(--status-bg-8)' },
    { id: 'gradient-1', type: 'gradient', gradient: 'linear-gradient(45deg, #667eea, #764ba2)' },
    { id: 'gradient-2', type: 'gradient', gradient: 'linear-gradient(45deg, #f6d365, #fda085)' },
    { id: 'gradient-3', type: 'gradient', gradient: 'linear-gradient(45deg, #a8edea, #fed6e3)' },
    { id: 'gradient-4', type: 'gradient', gradient: 'linear-gradient(45deg, #ff6b6b, #ffa726)' }
];

const statusTemplates = {
    'motivation': {
        name: 'Motivation',
        text: 'Today is a new opportunity to be better than yesterday. Keep pushing forward! 💪',
        background: 'gradient-2',
        mood: 'motivated',
        intent: 'reflection'
    },
    'question': {
        name: 'Question',
        text: 'What\'s the best piece of advice you\'ve ever received? 🤔',
        background: '3',
        mood: 'curious',
        intent: 'question'
    },
    'achievement': {
        name: 'Achievement',
        text: 'Just reached a personal milestone! Celebrating small wins along the way. 🎉',
        background: 'gradient-1',
        mood: 'happy',
        intent: 'achievement'
    },
    'reflection': {
        name: 'Reflection',
        text: 'Taking a moment to reflect on what truly matters in life. Peace comes from within. ✨',
        background: '6',
        mood: 'calm',
        intent: 'reflection'
    }
};

const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_TOKEN: 'knecta_user_token',
    STATUSES: 'knecta_statuses_cache',
    MY_STATUSES: 'knecta_my_statuses_cache',
    VIEWED_STATUSES: 'knecta_viewed_statuses',
    MUTED_USERS: 'knecta_muted_users',
    HIGHLIGHTS: 'knecta_status_highlights',
    DRAFTS: 'knecta_status_drafts',
    SCHEDULED: 'knecta_scheduled_statuses',
    PENDING_REPLIES: 'knecta_pending_replies',
    PENDING_REACTIONS: 'knecta_pending_reactions',
    MOOD_DATA: 'knecta_mood_data',
    STREAK: 'knecta_posting_streak',
    LAST_POST_DATE: 'knecta_last_post_date',
    OFFLINE_QUEUE: 'knecta_offline_status_queue',
    LAST_SYNC: 'knecta_status_last_sync'
};

// =============================================
// Helper Functions
// =============================================
function escapeHtml(text) {
    if (!text) return '';
    if (typeof document === 'undefined') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(date) {
    if (!date) return 'Unknown';
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return 'Unknown';
    const now = new Date();
    const diffMs = now - dateObj;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
}

function getStatusPreviewText(status) {
    if (!status) return 'Status';
    if (status.type === 'text') {
        const txt = status.content || status.text || '';
        return txt.length > 30 ? txt.substring(0, 30) + '...' : txt || 'Text status';
    } else if (status.type === 'media') {
        return status.caption ? status.caption.substring(0, 30) + '...' : 'Media status';
    } else if (status.type === 'poll') {
        return status.question ? status.question.substring(0, 30) + '...' : 'Poll status';
    }
    return 'Status';
}

function filterStatusesByPrivacy(statusesArray) {
    if (!Array.isArray(statusesArray)) return [];
    return statusesArray.filter(status => {
        if (!status || !status.userId) return false;
        if (mutedUsers.has(status.userId)) return false;
        const privacy = status.privacy || 'friends';
        switch(privacy) {
            case 'everyone': return true;
            case 'friends': return true;
            case 'close-friends': return false;
            default: return true;
        }
    });
}

function filterStatusesByType(type) {
    if (!Array.isArray(statuses)) return [];
    switch(type) {
        case 'friends':
            return statuses.filter(status => status && (status.privacy === 'friends' || status.privacy === 'everyone'));
        case 'close-friends':
            return statuses.filter(status => status && status.privacy === 'close-friends');
        case 'pinned':
            return statuses.filter(status => status && status.isPinned);
        case 'muted':
            return statuses.filter(status => status && mutedUsers.has(status.userId));
        case 'micro-circle':
            return statuses.filter(status => status && status.privacy === 'micro-circle');
        default:
            return statuses;
    }
}

function getEmptyStateMessage() {
    if (activeFilters.size > 0) {
        return `No statuses match your filters`;
    }
    if (currentIntentFilter) {
        return `No statuses with "${statusIntents[currentIntentFilter]?.name || currentIntentFilter}" intent`;
    }
    if (currentMoodFilter) {
        return `No statuses with "${statusMoods[currentMoodFilter]?.name || currentMoodFilter}" mood`;
    }
    return 'Be the first to post a status!';
}

function generateSampleMoodData() {
    const moods = Object.keys(statusMoods);
    const sampleData = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        sampleData.push({
            mood: randomMood,
            value: 40 + Math.floor(Math.random() * 50),
            date: date.toISOString().split('T')[0],
            timestamp: date.getTime()
        });
    }
    sampleData.sort((a, b) => a.timestamp - b.timestamp);
    return sampleData;
}

// =============================================
// UI FAILSAFE - Critical Protection Layer
// =============================================
const UIFailsafe = {
    failedSections: new Set(),
    recoveryAttempts: new Map(),
    maxRecoveryAttempts: 3,
    fallbackTimeout: null,
    actionQueue: [],
    processingAction: false,
    disabledButtons: new Set(),
    mutationObserver: null,
    criticalElements: new Set([
        'createStatusBtn', 'statusViewerPanel', 'sidebar',
        'allStatusList', 'myStatusPreview',
        'notification', 'errorUI'
    ]),
    _handlersBound: new Map(),
    _lifecycleCheckInterval: null,
    
    initialize() {
        this._setupGlobalErrorHandler();
        this._setupMutationObserver();
        this._setupNetworkListeners();
        this._setupLifecycleCheck();
        UILogger.info('UIFailsafe', 'Initialized');
    },
    
    _setupLifecycleCheck() {
        // FIX: Force-enable UI after 3 seconds if a session token is present,
        // regardless of lifecycle state — prevents permanently frozen UI.
        let forceEnabled = false;
        const forceEnableTimer = setTimeout(() => {
            if (forceEnabled) return;
            try {
                const hasToken = !!(localStorage.getItem('kynecta_auth') || localStorage.getItem('token') ||
                                   localStorage.getItem('moodchat_token') || localStorage.getItem('accessToken'));
                if (hasToken) {
                    forceEnabled = true;
                    this._enableUI();
                    UILogger.info('UIFailsafe', 'UI force-enabled after timeout (session token found)');
                }
            } catch(e) {}
        }, 3000);

        this._lifecycleCheckInterval = setInterval(() => {
            try {
                const lifecycle = getLifecycleState();
                const LifecycleState = getLifecycleStateEnum();
                if (lifecycle) {
                    UILogger.updateLifecycleState(lifecycle.state);
                    if (lifecycle.state === LifecycleState.ACTIVE) {
                        if (!forceEnabled) {
                            forceEnabled = true;
                            clearTimeout(forceEnableTimer);
                        }
                        this._enableUI();
                    }
                }
            } catch (e) {
                // Silent fail
            }
        }, 1000);
    },
    
    _enableUI() {
    this.disabledButtons.clear();
    const protectedElements = [
        'createStatusBtn', 'viewMyStatusBtn', 'editMyStatusBtn',
        'viewHighlightsBtn', 'createHighlightBtn', 'viewTimelineBtn',
        'viewStatsBtn', 'viewDraftsBtn', 'viewScheduledBtn',
        'myStatusPreview', 'postStatusBtn', 'saveDraftBtn', 'scheduleStatusBtn',
        'shareStatusBtn', 'saveStatusBtn', 'reportStatusBtn',
        // Also enable navigation buttons
        'allTab', 'friendsTab', 'closeFriendsTab', 'pinnedTab', 'mutedTab', 'microCirclesTab',
        'clearFiltersBtn', 'viewerBackBtn', 'pauseResumeBtn'
    ];
    protectedElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.removeAttribute('aria-disabled');
        }
    });
    
    // Also enable all category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    });
    
    // Enable quick action buttons
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    });
    
    const waitingOverlay = document.getElementById('handshakeWaitingOverlay');
    if (waitingOverlay) waitingOverlay.remove();
    
    // CRITICAL: Re-bind all handlers after enabling UI
    setTimeout(() => {
        this._rebindAllHandlers();
        // Trigger initial render
        if (typeof renderStatusListInstantlyUI === 'function') {
            renderStatusListInstantlyUI();
        }
        if (typeof updateMyStatusPreviewUI === 'function') {
            updateMyStatusPreviewUI();
        }
        // Fetch friend statuses directly from API on activate
        if (typeof _fetchFriendStatusesDirect === 'function') {
            _fetchFriendStatusesDirect();
        }
    }, 100);
    
    UILogger.info('UIFailsafe', 'UI enabled (ACTIVE state)');
},

    _setupGlobalErrorHandler() {
        window.addEventListener('error', (event) => {
            this.handleError('global', event.error || event.message);
        });
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError('promise', event.reason);
        });
    },
    
    _setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.handleNetworkChange('online');
        });
        window.addEventListener('offline', () => {
            this.handleNetworkChange('offline');
        });
    },
    
    handleNetworkChange(status) {
        UILogger.info('Network', `Network status changed: ${status}`);
        if (status === 'online' && ensureUIActive('network-recovery')) {
            this.processActionQueue();
            this._rebindAllHandlers();
            if (isSessionReady()) {
                const core = getCore();
                if (core && core !== window && core.loadStatuses) {
                    core.loadStatuses().catch(() => {});
                }
                // Also directly fetch friend statuses
                if (typeof _fetchFriendStatusesDirect === 'function') {
                    _fetchFriendStatusesDirect();
                }
            }
        }
    },
    
    _rebindAllHandlers() {
        // First pass: use UIFailsafe._ensureHandler for all known mapped buttons
        const buttons = document.querySelectorAll('button[id]');
        buttons.forEach(button => this._ensureHandler(button));
        // Second pass: re-apply stored handlers to cloned nodes (for any that were replaced)
        buttons.forEach(button => {
            const id = button.id;
            if (id && window[`_${id}Handler`] && !this._handlersBound.has(id)) {
                button.removeEventListener('click', window[`_${id}Handler`]);
                button.addEventListener('click', window[`_${id}Handler`]);
                this._handlersBound.set(id, button);
            }
        });
        // Re-run basic event listeners for delegated containers
        try { setupBasicEventListeners(); } catch(e) {}
    },
    
    _setupMutationObserver() {
        try {
            this.mutationObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                this._bindHandlersToNode(node);
                            }
                        });
                    }
                }
            });
            this.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        } catch (e) {
            UILogger.error('UIFailsafe', 'MutationObserver failed', e);
        }
    },
    
    _bindHandlersToNode(node) {
        const buttons = node.querySelectorAll('button');
        buttons.forEach(button => this._ensureHandler(button));
        if (node.tagName === 'BUTTON') {
            this._ensureHandler(node);
        }
    },
    
    _ensureHandler(button) {
        if (!button) return;
        const id = button.id;
        if (!id) return;
        if (this._handlersBound.has(id) && this._handlersBound.get(id) === button) return;
        
        const handlerMap = {
            'createStatusBtn': handleCreateStatusClick,
            'closeCreateStatusModal': () => closeModal('createStatusModal'),
            'closeNotificationBtn': closeNotification,
            'postStatusBtn': handlePostStatus,
            'saveDraftBtn': handleSaveDraft,
            'scheduleStatusBtn': handleScheduleClick,
            'closeScheduleModal': () => closeModal('scheduleModal'),
'cancelScheduleBtn': () => closeModal('scheduleModal'),
'confirmScheduleBtn': handleConfirmSchedule,
            'viewHighlightsBtn': showHighlightsModal,
            'closeHighlightsModal': () => closeModal('highlightsModal'),
            'createHighlightBtn': showHighlightsEditor,
            'closeHighlightsEditor': () => closeModal('highlightsEditorModal'),
            'saveHighlightBtn': saveHighlight,
            'viewTimelineBtn': showMemoryTimelineModal,
            'closeMemoryTimelineModal': () => closeModal('memoryTimelineModal'),
            'exportTimelineBtn': exportTimeline,
            'viewStatsBtn': showStatsModal,
            'closeStatsModal': () => closeModal('statsModal'),
            'refreshStatsBtn': loadStatsContent,
            'viewDraftsBtn': showDraftsModal,
            'closeDraftsModal': () => closeModal('draftsModal'),
            'deleteAllDraftsBtn': deleteAllDrafts,
            'loadDraftBtn': loadSelectedDraft,
            'viewScheduledBtn': showScheduleModal,
            'viewMyStatusBtn': viewMyStatus,
            'editMyStatusBtn': editMyStatus,
            'clearTextBtn': clearTextInput,
            'addPollOptionBtn': addPollOption,
            'clearFiltersBtn': clearAllFilters,
            'viewerBackBtn': closeViewer,
            'pauseResumeBtn': toggleAutoAdvance,
            'muteUserBtn': handleMuteFromViewer,
            'shareStatusBtn': shareCurrentStatus,
            'saveStatusBtn': handleSaveStatus,
            'reportStatusBtn': showReportModal,
            'closeReportModal': () => { const m = document.getElementById('reportModal'); if (m) { m.classList.remove('active'); } },
            'cancelReportBtn':   () => { const m = document.getElementById('reportModal'); if (m) { m.classList.remove('active'); } },
            'submitReportBtn': handleSubmitReport,
            'sendReplyBtn': sendReply,
            'retryConnectionBtn': retryConnection,
            'offlineModeBtn': enableOfflineMode,
            'retryHandshakeBtn': retryHandshake,
            'cancelHighlightBtn': () => closeModal('highlightsEditorModal'),
            'cancelStatsModalBtn': () => closeModal('statsModal'),
            'exportAnalyticsBtn': exportTimeline
        };
        
        const handler = handlerMap[id];
        if (handler) {
            window[`_${id}Handler`] = handler;
            button.removeEventListener('click', handler);
            button.addEventListener('click', handler);
            this._handlersBound.set(id, button);
            UILogger.debug('UIFailsafe', `Bound handler for ${id}`);
        }
    },
    
    handleError(source, error) {
        const key = `${source}:${error}`;
        if (!this.failedSections.has(key)) {
            this.failedSections.add(key);
            UILogger.error('UIFailsafe', `Error in ${source}`, error);
            this._attemptRecovery(source);
        }
    },
    
    _attemptRecovery(source) {
        const attempts = this.recoveryAttempts.get(source) || 0;
        if (attempts < this.maxRecoveryAttempts) {
            this.recoveryAttempts.set(source, attempts + 1);
            const delay = 5000 * Math.pow(2, attempts);
            setTimeout(() => {
                this.failedSections.delete(source);
                UILogger.info('UIFailsafe', `Recovery attempt for ${source} after ${delay}ms`);
            }, delay);
        }
    },
    
    wrapAction(actionFn, actionName) {
        return async (...args) => {
            if (this.disabledButtons.has(actionName)) {
                UILogger.warn('UIFailsafe', `Action disabled: ${actionName}`);
                showNotification(`${actionName} temporarily unavailable`, 'warning');
                return null;
            }
            if (!ensureUIActive(actionName)) {
                return null;
            }
            return new Promise((resolve, reject) => {
                this.actionQueue.push({ 
                    fn: actionFn, 
                    args, 
                    name: actionName,
                    resolve,
                    reject,
                    timestamp: Date.now()
                });
                if (!this.processingAction && navigator.onLine) {
                    this._processQueue();
                }
            });
        };
    },
    
    async _processQueue() {
        if (this.processingAction || this.actionQueue.length === 0) return;
        this.processingAction = true;
        while (this.actionQueue.length > 0) {
            const item = this.actionQueue.shift();
            if (Date.now() - item.timestamp > 300000) {
                item.reject(new Error('Action expired in queue'));
                continue;
            }
            try {
                const result = await item.fn(...item.args);
                item.resolve(result);
            } catch (error) {
                UILogger.error('UIFailsafe', `Action failed: ${item.name}`, error);
                const attempts = this.recoveryAttempts.get(item.name) || 0;
                if (attempts < this.maxRecoveryAttempts) {
                    this.recoveryAttempts.set(item.name, attempts + 1);
                    this.actionQueue.push(item);
                    const delay = 1000 * Math.pow(2, attempts);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    this.disabledButtons.add(item.name);
                    item.reject(error);
                    this._showFallbackMessage(item.name);
                }
            }
            await new Promise(r => setTimeout(r, 100));
        }
        this.processingAction = false;
    },
    
    processActionQueue() {
        if (!this.processingAction && this.actionQueue.length > 0) {
            this._processQueue();
        }
    },
    
    _showFallbackMessage(actionName) {
        showNotification(`${actionName} temporarily unavailable`, 'warning');
    },
    
    canRecover(section) {
        const attempts = this.recoveryAttempts.get(section) || 0;
        return attempts < this.maxRecoveryAttempts;
    },
    
    reset(section) {
        this.failedSections.delete(section);
        this.recoveryAttempts.delete(section);
    },
    
    resetAll() {
        this.failedSections.clear();
        this.recoveryAttempts.clear();
        this.disabledButtons.clear();
        this.actionQueue = [];
        this._handlersBound.clear();
    },
    
    cleanup() {
        if (this._lifecycleCheckInterval) {
            clearInterval(this._lifecycleCheckInterval);
            this._lifecycleCheckInterval = null;
        }
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
    }
};

UIFailsafe.initialize();

// =============================================
// UI ERROR BOUNDARY
// =============================================
class UIErrorBoundary {
    constructor() {
        this.failedSections = new Set();
        this.fallbacks = new Map();
        this.initializeFallbacks();
    }

    initializeFallbacks() {
        this.fallbacks.set('statusList', this.createStatusListFallback);
        this.fallbacks.set('statusViewer', this.createViewerFallback);
        this.fallbacks.set('createStatus', this.createCreateStatusFallback);
        this.fallbacks.set('highlights', this.createHighlightsFallback);
        this.fallbacks.set('stats', this.createStatsFallback);
        this.fallbacks.set('drafts', this.createDraftsFallback);
        this.fallbacks.set('schedule', this.createScheduleFallback);
        this.fallbacks.set('handshake', this.createHandshakeFallback);
        this.fallbacks.set('connection', this.createConnectionFallback);
        this.fallbacks.set('memoryTimeline', this.createMemoryTimelineFallback);
        this.fallbacks.set('poll', this.createPollFallback);
        this.fallbacks.set('reactions', this.createReactionsFallback);
    }

    wrap(sectionId, renderFn, fallbackType = null) {
        return async (...args) => {
            if (this.failedSections.has(sectionId) || !UIFailsafe.canRecover(sectionId)) {
                const fallback = this.fallbacks.get(fallbackType || sectionId);
                return fallback ? fallback(...args) : this.createGenericFallback();
            }
            try {
                UILogger.startRender(sectionId);
                const result = await renderFn(...args);
                UILogger.endRender(sectionId);
                return result;
            } catch (error) {
                this.failedSections.add(sectionId);
                UIFailsafe.handleError(sectionId, error);
                const fallback = this.fallbacks.get(fallbackType || sectionId);
                return fallback ? fallback(...args) : this.createGenericFallback();
            }
        };
    }

    createStatusListFallback() {
        return `
            <div class="empty-state error-state" role="alert">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Unable to load statuses</p>
                <p class="subtext">Please try again later</p>
                <button class="action-btn primary" onclick="window.statusUI?.retryLoad()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }

    createViewerFallback() {
        return `
            <div class="viewer-error empty-state error-state">
                <i class="fas fa-eye-slash"></i>
                <p>Status viewer unavailable</p>
                <button class="action-btn secondary" onclick="document.getElementById('statusViewerPanel')?.classList.remove('active')">
                    Close
                </button>
            </div>
        `;
    }

    createCreateStatusFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Status creation unavailable</p>
                <p class="subtext">Please try again later</p>
            </div>
        `;
    }

    createHighlightsFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-star"></i>
                <p>Highlights unavailable</p>
                <button class="action-btn secondary" onclick="document.getElementById('highlightsModal')?.classList.remove('active')">
                    Close
                </button>
            </div>
        `;
    }

    createStatsFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-chart-line"></i>
                <p>Statistics unavailable</p>
                <button class="action-btn secondary" onclick="document.getElementById('statsModal')?.classList.remove('active')">
                    Close
                </button>
            </div>
        `;
    }

    createDraftsFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-file-alt"></i>
                <p>Drafts unavailable</p>
                <button class="action-btn secondary" onclick="document.getElementById('draftsModal')?.classList.remove('active')">
                    Close
                </button>
            </div>
        `;
    }

    createScheduleFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-clock"></i>
                <p>Scheduling unavailable</p>
                <button class="action-btn secondary" onclick="document.getElementById('scheduleModal')?.classList.remove('active')">
                    Close
                </button>
            </div>
        `;
    }

    createHandshakeFallback() {
        return `
            <div class="handshake-waiting">
                <div class="handshake-spinner">
                    <i class="fas fa-circle-notch fa-spin"></i>
                </div>
                <p>Connecting to parent application...</p>
                <p class="subtext">Please wait, this will happen automatically</p>
            </div>
        `;
    }

    createConnectionFallback() {
        return `
            <div class="connection-error empty-state error-state">
                <i class="fas fa-clock"></i>
                <p>Loading statuses...</p>
                <p class="subtext">Your content will appear shortly.</p>
                <div class="connection-progress">
                    <div class="progress-bar indeterminate"></div>
                </div>
            </div>
        `;
    }

    createMemoryTimelineFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-history"></i>
                <p>Memory timeline unavailable</p>
                <button class="action-btn secondary" onclick="document.getElementById('memoryTimelineModal')?.classList.remove('active')">
                    Close
                </button>
            </div>
        `;
    }

    createPollFallback() {
        return `
            <div class="poll-error empty-state error-state">
                <i class="fas fa-poll"></i>
                <p>Poll unavailable</p>
            </div>
        `;
    }

    createReactionsFallback() {
        return `
            <div class="reactions-error">
                <p>Reactions unavailable</p>
            </div>
        `;
    }

    createGenericFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Content temporarily unavailable</p>
            </div>
        `;
    }

    reset(sectionId) {
        this.failedSections.delete(sectionId);
        UIFailsafe.reset(sectionId);
    }
}

const uiErrorBoundary = new UIErrorBoundary();

// =============================================
// SECURE SANITIZATION
// =============================================
const UISanitizer = {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'span', 'div', 'p', 'br'],

    sanitizeHTML(str) {
        if (!str) return '';
        if (typeof str !== 'string') return String(str);
        try {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        } catch (e) {
            return String(str).replace(/[<>"']/g, (c) => {
                switch(c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '"': return '&quot;';
                    case "'": return '&#39;';
                    default: return c;
                }
            });
        }
    },

    sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        try {
            return JSON.parse(JSON.stringify(obj, (key, value) => {
                if (typeof value === 'string') {
                    return this.sanitizeHTML(value);
                }
                if (key === 'token' || key === 'accessToken' || key === 'refreshToken') {
                    return '[REDACTED]';
                }
                return value;
            }));
        } catch (e) {
            return obj;
        }
    },

    validateStatusData(data) {
        if (!data || typeof data !== 'object') return null;
        const sanitized = { ...data };
        // Normalize: backend stores as 'content', legacy posts use 'text' — always keep both in sync
        if (sanitized.content) sanitized.content = String(sanitized.content).slice(0, 5000);
        if (sanitized.text) sanitized.text = String(sanitized.text).slice(0, 5000);
        if (!sanitized.text && sanitized.content) sanitized.text = sanitized.content;
        if (!sanitized.content && sanitized.text) sanitized.content = sanitized.text;
        if (sanitized.caption) sanitized.caption = String(sanitized.caption).slice(0, 1000);
        if (sanitized.question) sanitized.question = String(sanitized.question).slice(0, 500);
        if (sanitized.user) {
            // Build displayName from all possible fields (backend uses statusUser with firstName/lastName)
            const u = sanitized.user;
            const firstName = u.firstName || '';
            const lastName = u.lastName || '';
            const fullName = (firstName + ' ' + lastName).trim();
            const displayName = u.displayName || fullName || u.username || u.name || 'Unknown';
            sanitized.user = {
                id: String(u.id || ''),
                displayName: String(displayName).slice(0, 100),
                username: String(u.username || '').slice(0, 50),
                firstName: String(firstName).slice(0, 50),
                lastName: String(lastName).slice(0, 50),
                photoURL: String(u.photoURL || u.avatar || u.profilePicture || '').slice(0, 500),
                avatar: String(u.avatar || u.photoURL || '').slice(0, 500),
                isGuest: !!u.isGuest
            };
        }
        // Also normalise statusUser (backend field name) → user
        if (!sanitized.user && sanitized.statusUser) {
            const u = sanitized.statusUser;
            const firstName = u.firstName || '';
            const lastName = u.lastName || '';
            const fullName = (firstName + ' ' + lastName).trim();
            const displayName = u.displayName || fullName || u.username || 'Unknown';
            sanitized.user = {
                id: String(u.id || ''),
                displayName: String(displayName).slice(0, 100),
                username: String(u.username || '').slice(0, 50),
                firstName: String(firstName).slice(0, 50),
                lastName: String(lastName).slice(0, 50),
                photoURL: String(u.avatar || u.photoURL || '').slice(0, 500),
                avatar: String(u.avatar || u.photoURL || '').slice(0, 500),
                isGuest: false
            };
        }
        return sanitized;
    },

    sanitizeFileName(name) {
        if (!name) return '';
        return String(name).replace(/[^a-zA-Z0-9.-]/g, '_');
    },

    sanitizeUrl(url) {
        if (!url) return '';
        try {
            const parsed = new URL(url, window.location.origin);
            return parsed.toString();
        } catch {
            return '';
        }
    }
};

// =============================================
// RENDERING PIPELINE
// =============================================
const UIRenderPipeline = {
    stages: ['skeleton', 'initialRender', 'progressiveEnhancement', 'liveUpdate'],
    currentStage: 'skeleton',
    pendingUpdates: new Map(),
    renderQueue: new Set(),
    rafId: null,
    handshakeStatus: 'waiting',
    renderCount: 0,
    maxRenderAttempts: 3,
    lifecycleState: null,

    async execute(containerId, renderFn, fallbackId = null) {
        UILogger.startRender(containerId);
        try {
            if (this.currentStage === 'skeleton') {
                this.renderSkeleton(containerId);
            }
            if (this.currentStage === 'initialRender' || this.currentStage === 'skeleton') {
                const content = await renderFn();
                this.renderContent(containerId, content);
            }
            if (this.currentStage === 'progressiveEnhancement') {
                this.enhanceContainer(containerId);
            }
            UILogger.endRender(containerId);
            return true;
        } catch (error) {
            UILogger.error('Render', `Failed to render ${containerId}`, error);
            this.renderCount++;
            if (this.renderCount < this.maxRenderAttempts) {
                setTimeout(() => this.execute(containerId, renderFn, fallbackId), 1000);
            } else if (fallbackId) {
                const fallback = uiErrorBoundary.createGenericFallback();
                this.renderContent(containerId, fallback);
            }
            return false;
        }
    },

    renderSkeleton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!container.querySelector('.skeleton-loader')) {
            container.innerHTML = this.createSkeletonLoader(containerId);
        }
    },

    createSkeletonLoader(containerId) {
        switch(containerId) {
            case 'allStatusList':
            case 'friendsStatusList':
            case 'closeFriendsStatusList':
            case 'myStatusList':
            case 'pinnedStatusList':
            case 'mutedStatusList':
            case 'microCirclesStatusList':
                return Array(3).fill(0).map(() => `
                    <div class="status-item skeleton">
                        <div class="status-avatar skeleton-pulse"></div>
                        <div class="status-info">
                            <div class="status-name skeleton-pulse" style="width: 60%; height: 16px;"></div>
                            <div class="status-details skeleton-pulse" style="width: 40%; height: 14px; margin-top: 8px;"></div>
                            <div class="status-preview skeleton-pulse" style="width: 80%; height: 20px; margin-top: 12px;"></div>
                        </div>
                    </div>
                `).join('');
            case 'highlightsContent':
                return Array(3).fill(0).map(() => `
                    <div class="highlight-item skeleton">
                        <div class="highlight-cover skeleton-pulse"></div>
                        <div class="highlight-info">
                            <div class="highlight-name skeleton-pulse" style="width: 70%;"></div>
                            <div class="highlight-count skeleton-pulse" style="width: 40%;"></div>
                        </div>
                    </div>
                `).join('');
            case 'moodChart':
                return `
                    <div class="mood-chart-skeleton">
                        ${Array(7).fill(0).map(() => `
                            <div class="mood-bar skeleton-pulse" style="height: ${30 + Math.random() * 50}px;"></div>
                        `).join('')}
                    </div>
                `;
            case 'draftsList':
            case 'allDraftsList':
                return Array(2).fill(0).map(() => `
                    <div class="draft-item skeleton">
                        <div class="draft-preview skeleton-pulse" style="width: 90%; height: 20px;"></div>
                        <div class="draft-meta skeleton-pulse" style="width: 60%; height: 16px; margin-top: 8px;"></div>
                    </div>
                `).join('');
            case 'scheduledStatusesList':
                return Array(2).fill(0).map(() => `
                    <div class="schedule-item skeleton">
                        <div class="schedule-info skeleton-pulse" style="width: 70%; height: 20px;"></div>
                        <div class="schedule-time skeleton-pulse" style="width: 40%; height: 16px; margin-top: 8px;"></div>
                    </div>
                `).join('');
            default:
                return '<div class="skeleton-loader skeleton-pulse" style="height: 100px;"></div>';
        }
    },

    renderContent(containerId, html) {
        const container = document.getElementById(containerId);
        if (!container) return;
        requestAnimationFrame(() => {
            container.innerHTML = html;
            container.classList.add('content-rendered');
            setTimeout(() => {
                UIFailsafe._rebindAllHandlers();
            }, 50);
        });
    },

    enhanceContainer(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.classList.add('enhanced');
        const images = container.querySelectorAll('img[data-src]');
        images.forEach(img => {
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
        });
        const lazyImages = container.querySelectorAll('img[loading="lazy"]');
        lazyImages.forEach(img => {
            if (img.complete) {
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', () => img.classList.add('loaded'));
                img.addEventListener('error', () => img.classList.add('error'));
            }
        });
    },

    queueUpdate(componentId, updateFn) {
        this.pendingUpdates.set(componentId, updateFn);
        this.scheduleRender();
    },

    scheduleRender() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
            this.pendingUpdates.forEach((updateFn, componentId) => {
                try {
                    updateFn();
                    this.pendingUpdates.delete(componentId);
                } catch (error) {
                    UILogger.error('Render', `Failed to update ${componentId}`, error);
                }
            });
            this.rafId = null;
        });
    },

    setStage(stage) {
        if (this.stages.includes(stage)) {
            this.currentStage = stage;
            UILogger.debug('Render', `Pipeline stage: ${stage}`);
        }
    },

    updateHandshakeStatus(status) {
        this.handshakeStatus = status;
        UILogger.debug('Render', `Handshake status: ${status}`);
    },
    
    updateLifecycleState(state) {
        this.lifecycleState = state;
        UILogger.updateLifecycleState(state);
        UILogger.debug('Render', `Lifecycle state: ${state}`);
        const LifecycleState = getLifecycleStateEnum();
        if (state === LifecycleState.ACTIVE) {
            const waitingOverlay = document.getElementById('handshakeWaitingOverlay');
            if (waitingOverlay) waitingOverlay.remove();
            enableProtectedUI();
            if (isSessionReady()) {
                const core = getCore();
                if (core && core.loadStatuses) {
                    core.loadStatuses().catch(() => {});
                }
            }
        }
    }
};

// =============================================
// CORE INTEGRATION BRIDGE
// =============================================
const UIBridge = {
    subscriptions: new Map(),
    validators: new Map(),
    messageQueue: [],
    processing: false,
    
    initialize() {
        this.registerValidators();
        this.setupCoreSubscriptions();
        UILogger.info('Bridge', 'Core integration bridge initialized');
    },

    registerValidators() {
        this.validators.set('statusUpdate', (data) => {
            return data && typeof data === 'object' && data.id;
        });
        this.validators.set('sessionData', (data) => {
            return data && typeof data === 'object' && (data.user || data.token);
        });
        this.validators.set('reaction', (data) => {
            return data && data.statusId && data.reaction;
        });
        this.validators.set('handshake', (data) => {
            return data && data.status && ['connecting', 'connected', 'failed', 'reconnecting'].includes(data.status);
        });
        this.validators.set('apiResponse', (data) => {
            return data && data.requestId;
        });
        this.validators.set('navigation', (data) => {
            return data && data.path;
        });
        const LifecycleState = getLifecycleStateEnum();
        this.validators.set('lifecycle', (data) => {
            return data && data.state && Object.values(LifecycleState).includes(data.state);
        });
    },

    setupCoreSubscriptions() {
        document.addEventListener('statusUpdate', (e) => {
            this.handleCoreEvent('statusUpdate', e.detail);
        });

        // ── FIX: Receiver-side realtime listeners ─────────────────────────────
        // status-core.js dispatches these DOM events via wireStatusWebSocket()
        // when a friend's status arrives via socket. Without these listeners the
        // receiver's UI list never updates — even though the data is in memory.
        const _realtimeStatusHandler = (evt) => {
            const payload = evt.detail || {};
            const incomingStatus = payload.status || payload;
            const statusId = incomingStatus.id || payload.statusId;

            // Skip if this is an echo of a status the sender already confirmed
            if (statusId && window._confirmedStatusIds && window._confirmedStatusIds.has(String(statusId))) {
                console.log(`[status-ui] ℹ️ Skipping socket echo for already-confirmed id=${statusId}`);
                return;
            }

            console.log(`[status-ui] 📥 STATUS RECEIVED via DOM event: ${evt.type} id=${statusId}`);

            // ── Inject immediately into every status pool so grouped render
            //    can display it without waiting for the core's async fetch ──
            if (incomingStatus && incomingStatus.id) {
                const sid = String(incomingStatus.id);
                const _myUid = String((window.currentUser && (window.currentUser.id || window.currentUser.userId)) || '');
                const _ownerId = String(incomingStatus.userId || incomingStatus.user_id || (incomingStatus.user && incomingStatus.user.id) || '');
                const _isMine = _myUid && _ownerId === _myUid;

                // Module-level statuses array (all statuses, backward compat)
                if (typeof statuses !== 'undefined' && Array.isArray(statuses)) {
                    if (!statuses.find(s => String(s.id) === sid)) {
                        statuses.unshift({ ...incomingStatus, id: sid });
                    }
                }
                // ── KEY FIX: also inject into friendsStatuses if from a friend ──
                if (!_isMine && typeof friendsStatuses !== 'undefined' && Array.isArray(friendsStatuses)) {
                    if (!friendsStatuses.find(s => String(s.id) === sid)) {
                        friendsStatuses.unshift({ ...incomingStatus, id: sid });
                    }
                }
                // Own status → myStatuses
                if (_isMine && typeof myStatuses !== 'undefined' && Array.isArray(myStatuses)) {
                    if (!myStatuses.find(s => String(s.id) === sid)) {
                        myStatuses.unshift({ ...incomingStatus, id: sid });
                    }
                }
                // Core statusState
                if (typeof statusState !== 'undefined' && Array.isArray(statusState.statuses)) {
                    if (!statusState.statuses.find(s => String(s.id) === sid)) {
                        statusState.statuses.unshift({ ...incomingStatus, id: sid });
                    }
                }
                // Show Recent updates label
                if (!_isMine) {
                    const lbl = document.getElementById('recentUpdatesLabel');
                    if (lbl) lbl.style.display = '';
                }
            }

            // Re-render the grouped list immediately
            renderStatusListInstantlyUI();
            updateMyStatusPreviewUI();

            // Show toast notification so user knows something arrived
            const myId = currentUser?.id || currentUser?.userId;
            const posterId = incomingStatus.userId || payload.userId;
            if (posterId && myId && String(posterId) !== String(myId)) {
                const name = incomingStatus.user?.displayName
                    || incomingStatus.user?.username
                    || incomingStatus.user?.firstName
                    || 'A friend';
                showNotification(`📸 ${name} posted a new status`, 'info');
                console.log(`[status-ui] ✅ STATUS RENDERED on receiver UI id=${statusId} from user=${posterId}`);
            }
        };

        // Listen to both raw event names and kyn: prefixed variants dispatched by bridge
        ['new_status', 'status:created', 'status_created'].forEach(evtName => {
            document.addEventListener(evtName, _realtimeStatusHandler);
            window.addEventListener(`kyn:${evtName}`, _realtimeStatusHandler);
        });
        // Also react to the statusStateChanged event so any notifyStatusObservers() call re-renders
        document.addEventListener('statusStateChanged', () => {
            renderStatusListInstantlyUI();
            updateMyStatusPreviewUI();
        });
        document.addEventListener('coreData', (e) => {
            this.handleCoreEvent('coreData', e.detail);
        });
        document.addEventListener('sessionReady', (e) => {
            this.handleCoreEvent('sessionReady', e.detail);
        });
        document.addEventListener('handshakeUpdate', (e) => {
            this.handleCoreEvent('handshake', e.detail);
        });
        document.addEventListener('connectionLost', (e) => {
            this.handleCoreEvent('connectionLost', e.detail);
            UIRenderPipeline.updateHandshakeStatus('failed');
        });
        document.addEventListener('connectionRestored', (e) => {
            this.handleCoreEvent('connectionRestored', e.detail);
            UIRenderPipeline.updateHandshakeStatus('connected');
        });
        document.addEventListener('governorStateChange', (e) => {
            const LifecycleState = getLifecycleStateEnum();
            if (e.detail.newState === 'ACTIVE') {
                UIRenderPipeline.updateHandshakeStatus('connected');
                UIRenderPipeline.updateLifecycleState(LifecycleState.ACTIVE);
            } else if (e.detail.newState === 'DEGRADED') {
                UIRenderPipeline.updateHandshakeStatus('failed');
            } else if (e.detail.newState === 'RECOVERING') {
                UIRenderPipeline.updateHandshakeStatus('reconnecting');
            }
        });
        document.addEventListener('apiResponse', (e) => {
            this.handleCoreEvent('apiResponse', e.detail);
        });
        document.addEventListener('navigate', (e) => {
            this.handleCoreEvent('navigation', e.detail);
        });
        document.addEventListener('uiRecovery', (e) => {
            UILogger.info('Bridge', 'UI recovery triggered', e.detail);
            this.processMessageQueue();
        });
        document.addEventListener('configApplied', (e) => {
            UILogger.info('Bridge', 'Configuration applied', e.detail);
        });
        document.addEventListener('viewerUpdate', (e) => {
            this.handleCoreEvent('viewerUpdate', e.detail);
        });
        document.addEventListener('reactionUpdate', (e) => {
            this.handleCoreEvent('reactionUpdate', e.detail);
        });
        document.addEventListener('statusExpired', (e) => {
            this.handleCoreEvent('statusExpired', e.detail);
        });
        document.addEventListener('moduleActive', (e) => {
            const LifecycleState = getLifecycleStateEnum();
            this.handleCoreEvent('lifecycle', { state: LifecycleState.ACTIVE, detail: e.detail });
            UIRenderPipeline.updateLifecycleState(LifecycleState.ACTIVE);
            enableProtectedUI();
        });
        document.addEventListener('statusStateChanged', (e) => {
            if (e.detail && e.detail.state) {
                this.handleCoreEvent('statusState', e.detail.state);
                renderStatusListInstantlyUI();
                updateMyStatusPreviewUI();
            }
        });
    },

    handleCoreEvent(type, data) {
        if (!data) return;
        const validator = this.validators.get(type);
        if (validator && !validator(data)) return;
        this.messageQueue.push({ type, data, timestamp: Date.now() });
        if (!this.processing) {
            this.processMessageQueue();
        }
    },

    async processMessageQueue() {
        if (this.processing || this.messageQueue.length === 0) return;
        this.processing = true;
        while (this.messageQueue.length > 0) {
            const item = this.messageQueue.shift();
            if (Date.now() - item.timestamp > 60000) continue;
            const handlers = this.subscriptions.get(item.type) || [];
            handlers.forEach(handler => {
                try {
                    handler(this.sanitizeEventData(item.data));
                } catch (error) {
                    UILogger.error('Bridge', `Handler failed for ${item.type}`, error);
                }
            });
            await new Promise(r => setTimeout(r, 10));
        }
        this.processing = false;
    },

    sanitizeEventData(data) {
        if (!data || typeof data !== 'object') return data;
        try {
            return JSON.parse(JSON.stringify(data, (key, value) => {
                if (key === 'token' || key === 'accessToken' || key === 'refreshToken') {
                    return '[REDACTED]';
                }
                if (typeof value === 'string' && value.length > 5000) {
                    return value.slice(0, 5000) + '... [truncated]';
                }
                return value;
            }));
        } catch (e) {
            return data;
        }
    },

    subscribe(event, handler) {
        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, new Set());
        }
        this.subscriptions.get(event).add(handler);
        return () => {
            const handlers = this.subscriptions.get(event);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    },

    unsubscribe(event, handler) {
        const handlers = this.subscriptions.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    },

    clearSubscriptions() {
        this.subscriptions.clear();
        this.messageQueue = [];
        UILogger.info('Bridge', 'All subscriptions cleared');
    }
};

// =============================================
// EVENT SYSTEM
// =============================================
class UIEventSystem {
    constructor() {
        this.handlers = new Map();
        this.debounced = new Map();
        this.throttled = new Map();
        this.listenerRefs = new Set();
        this.observerRefs = new Set();
        this.isInitialized = false;
        this.eventCache = new Set();
    }

    initialize() {
        if (this.isInitialized) return;
        this.setupGlobalListeners();
        this.setupResizeObserver();
        this.setupIntersectionObserver();
        this.isInitialized = true;
        UILogger.debug('Events', 'Event system initialized');
    }

    setupGlobalListeners() {
        this.addListener(window, 'resize', this.debounce(this.handleResize, 150));
        this.addListener(window, 'scroll', this.throttle(this.handleScroll, 100));
        this.addListener(document, 'visibilitychange', this.handleVisibilityChange);
        this.addListener(document, 'keydown', this.handleKeyDown);
        this.addListener(window, 'online', this.handleOnline);
        this.addListener(window, 'offline', this.handleOffline);
        this.addListener(window, 'popstate', this.handlePopState);
        this.addListener(document, 'touchstart', this.handleTouchStart, { passive: true });
        this.addListener(document, 'touchmove', this.throttle(this.handleTouchMove, 50), { passive: true });
    }

    setupResizeObserver() {
        if ('ResizeObserver' in window) {
            try {
                const observer = new ResizeObserver(this.throttle((entries) => {
                    this.handleResizeObserver(entries);
                }, 100));
                this.observerRefs.add(observer);
            } catch (e) {
                UILogger.warn('Events', 'ResizeObserver not available', e);
            }
        }
    }

    setupIntersectionObserver() {
        if ('IntersectionObserver' in window) {
            try {
                const observer = new IntersectionObserver((entries) => {
                    this.handleIntersection(entries);
                }, { threshold: 0.1, rootMargin: '50px' });
                this.observerRefs.add(observer);
            } catch (e) {
                UILogger.warn('Events', 'IntersectionObserver not available', e);
            }
        }
    }

    addListener(element, type, handler, options = {}) {
        const cacheKey = `${type}:${handler.toString()}`;
        if (this.eventCache.has(cacheKey)) return;
        const wrappedHandler = (e) => {
            try {
                handler(e);
            } catch (error) {
                UILogger.error('Events', `Handler error for ${type}`, error);
            }
        };
        element.addEventListener(type, wrappedHandler, options);
        this.listenerRefs.add({ element, type, handler: wrappedHandler, options });
        this.eventCache.add(cacheKey);
        return wrappedHandler;
    }

    removeAllListeners() {
        this.listenerRefs.forEach(({ element, type, handler, options }) => {
            try {
                element.removeEventListener(type, handler, options);
            } catch (e) {}
        });
        this.listenerRefs.clear();
        this.debounced.clear();
        this.throttled.clear();
        this.handlers.clear();
        this.eventCache.clear();
        this.observerRefs.forEach(observer => observer.disconnect());
        this.observerRefs.clear();
        this.isInitialized = false;
        UILogger.info('Events', 'All listeners removed');
    }

    debounce(fn, delay) {
        let timer;
        const debounced = (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
        this.debounced.set(fn, debounced);
        return debounced;
    }

    throttle(fn, limit) {
        let inThrottle;
        const throttled = (...args) => {
            if (!inThrottle) {
                fn(...args);
                inThrottle = setTimeout(() => inThrottle = false, limit);
            }
        };
        this.throttled.set(fn, throttled);
        return throttled;
    }

    handleOnline = () => {
        this.emit('online', { timestamp: Date.now() });
        UIFailsafe.processActionQueue();
    };

    handleOffline = () => {
        this.emit('offline', { timestamp: Date.now() });
    };

    handleResize = () => {
        const width = window.innerWidth;
        const wasMobile = isMobile;
        if (wasMobile !== (width <= 768)) {
            this.emit('deviceChange', { isMobile: width <= 768, width });
        }
        this.emit('resize', { width, height: window.innerHeight });
    };
    
    handleScroll = () => {
        this.emit('scroll', { x: window.scrollX, y: window.scrollY });
    };

    handleVisibilityChange = () => {
        this.emit('visibility', {
            hidden: document.hidden,
            visibilityState: document.visibilityState
        });
    };

    handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            this.emit('escape', e);
        }
    };

    handlePopState = (e) => {
        this.emit('popstate', { state: e.state, url: window.location.href });
    };

    handleTouchStart = (e) => {
        this.emit('touchstart', { touches: e.touches.length });
    };

    handleTouchMove = (e) => {
        this.emit('touchmove', { touches: e.touches.length });
    };

    handleResizeObserver(entries) {
        this.emit('resizeObserver', entries);
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                this.emit('elementVisible', {
                    target: entry.target,
                    intersectionRatio: entry.intersectionRatio
                });
            }
        });
    }

    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
        return () => {
            const handlers = this.handlers.get(event);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    off(event, handler) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    emit(event, data) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    UILogger.error('Events', `Handler error for ${event}`, error);
                }
            });
        }
    }
}

const uiEvents = new UIEventSystem();

// =============================================
// DOM ELEMENTS
// =============================================
const UIElements = {
    get createStatusModal() { return document.getElementById('createStatusModal'); },
    get draftsModal() { return document.getElementById('draftsModal'); },
    get highlightsModal() { return document.getElementById('highlightsModal'); },
    get highlightsEditorModal() { return document.getElementById('highlightsEditorModal'); },
    get memoryTimelineModal() { return document.getElementById('memoryTimelineModal'); },
    get statsModal() { return document.getElementById('statsModal'); },
    get scheduleModal() { return document.getElementById('scheduleModal'); },
    get reportModal() { return document.getElementById('reportModal'); },
    get statusViewerPanel() { return document.getElementById('statusViewerPanel'); },
    get notification() { return document.getElementById('notification'); },
    get errorUI() { return document.getElementById('errorUI'); },
    get allStatusSection() { return document.getElementById('allStatusSection'); },
    get friendsStatusSection() { return document.getElementById('friendsStatusSection'); },
    get closeFriendsStatusSection() { return document.getElementById('closeFriendsStatusSection'); },
    get pinnedStatusSection() { return document.getElementById('pinnedStatusSection'); },
    get mutedStatusSection() { return document.getElementById('mutedStatusSection'); },
    get microCirclesStatusSection() { return document.getElementById('microCirclesStatusSection'); },
    get myStatusSection() { return document.getElementById('myStatusSection'); },
    get allStatusList() { return document.getElementById('allStatusList'); },
    get friendsStatusList() { return document.getElementById('friendsStatusList'); },
    get closeFriendsStatusList() { return document.getElementById('closeFriendsStatusList'); },
    get pinnedStatusList() { return document.getElementById('pinnedStatusList'); },
    get mutedStatusList() { return document.getElementById('mutedStatusList'); },
    get microCirclesStatusList() { return document.getElementById('microCirclesStatusList'); },
    get myStatusList() { return document.getElementById('myStatusList'); },
    getElement(id) { return document.getElementById(id); },
    querySelector(selector) {
        try { return document.querySelector(selector); } catch { return null; }
    },
    querySelectorAll(selector) {
        try { return document.querySelectorAll(selector); } catch { return []; }
    },
    exists(id) { return !!document.getElementById(id); }
};

// =============================================
// UI STATE MANAGER
// =============================================
const UIStateManager = {
    cache: new Map(),
    history: [],
    historyLimit: 20,
    restorePoints: new Map(),
    persistentKeys: ['viewerState', 'filters', 'currentTab', 'scrollPosition'],

    set(key, value, ttl = 300000) {
        const entry = { value, timestamp: Date.now(), ttl };
        this.cache.set(key, entry);
        if (this.persistentKeys.includes(key) && typeof window.localStorage !== 'undefined') {
            try {
                localStorage.setItem(`ui_${key}`, JSON.stringify(value));
            } catch (e) {}
        }
        if (ttl) {
            setTimeout(() => this.invalidate(key), ttl);
        }
    },

    get(key) {
        const entry = this.cache.get(key);
        if (entry) {
            if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                return null;
            }
            return entry.value;
        }
        if (this.persistentKeys.includes(key) && typeof window.localStorage !== 'undefined') {
            try {
                const stored = localStorage.getItem(`ui_${key}`);
                if (stored) {
                    const value = JSON.parse(stored);
                    this.set(key, value);
                    return value;
                }
            } catch (e) {}
        }
        return null;
    },

    invalidate(key) { this.cache.delete(key); },
    clear() { this.cache.clear(); },

    pushHistory(state) {
        this.history.push({ ...state, timestamp: Date.now() });
        if (this.history.length > this.historyLimit) this.history.shift();
    },

    popHistory() { return this.history.pop(); },

    createRestorePoint(id, state) {
        this.restorePoints.set(id, { state, timestamp: Date.now() });
    },

    restore(id) {
        const point = this.restorePoints.get(id);
        return point ? point.state : null;
    },

    getViewerState() {
        return {
            currentStatus: currentViewerStatus,
            slideIndex: currentSlideIndex,
            isPaused: isAutoAdvancePaused
        };
    },

    saveViewerState() {
        const state = this.getViewerState();
        this.set('viewerState', state, 60000);
        this.pushHistory({ type: 'viewer', state });
    },

    restoreViewerState() { return this.get('viewerState'); },

    saveFilters() {
        this.set('filters', {
            activeFilters: activeFilters ? Array.from(activeFilters) : [],
            currentIntentFilter: currentIntentFilter,
            currentMoodFilter: currentMoodFilter,
            currentCategoryFilter: currentCategoryFilter
        });
    },

    restoreFilters() {
        const filters = this.get('filters');
        if (filters) {
            if (filters.activeFilters && Array.isArray(filters.activeFilters)) {
                if (activeFilters) {
                    activeFilters.clear();
                    filters.activeFilters.forEach(filter => activeFilters.add(filter));
                }
            }
            if (filters.currentIntentFilter) {
                currentIntentFilter = filters.currentIntentFilter;
            }
            if (filters.currentMoodFilter) {
                currentMoodFilter = filters.currentMoodFilter;
            }
            if (filters.currentCategoryFilter) {
                currentCategoryFilter = filters.currentCategoryFilter;
            }
        }
    },

    saveScrollPosition(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            this.set(`scroll_${containerId}`, container.scrollTop);
        }
    },

    restoreScrollPosition(containerId) {
        const container = document.getElementById(containerId);
        const position = this.get(`scroll_${containerId}`);
        if (container && position) {
            setTimeout(() => {
                container.scrollTop = position;
            }, 100);
        }
    }
};

// =============================================
// RESPONSIVE ENGINE
// =============================================
const ResponsiveEngine = {
    breakpoints: { mobile: 480, tablet: 768, desktop: 1024, wide: 1280 },
    currentDevice: 'desktop',
    touchCapable: false,
    orientation: 'landscape',
    pixelRatio: 1,
    prefersReducedMotion: false,
    prefersDarkMode: false,

    initialize() {
        this.detectCapabilities();
        this.setupOrientationListener();
        this.setupMediaQueries();
        this.applyResponsiveAdjustments();
        uiEvents.on('deviceChange', (data) => {
            this.handleDeviceChange(data);
        });
        UILogger.debug('Responsive', `Device: ${this.currentDevice}, Touch: ${this.touchCapable}`);
    },

    detectCapabilities() {
        this.touchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.currentDevice = this.getDeviceType();
        this.orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
        this.pixelRatio = window.devicePixelRatio || 1;
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('touch-device', this.touchCapable);
        document.documentElement.classList.add(`device-${this.currentDevice}`);
        document.documentElement.classList.add(`orientation-${this.orientation}`);
        document.documentElement.classList.toggle('reduced-motion', this.prefersReducedMotion);
        // Force light mode always — status module has its own theme
        // document.documentElement.classList.toggle('dark-mode', this.prefersDarkMode);
    },

    getDeviceType() {
        const width = window.innerWidth;
        if (width <= this.breakpoints.mobile) return 'mobile';
        if (width <= this.breakpoints.tablet) return 'tablet';
        if (width <= this.breakpoints.desktop) return 'desktop';
        return 'wide';
    },

    setupOrientationListener() {
        if ('orientation' in window) {
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    this.orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
                    document.documentElement.classList.remove('orientation-portrait', 'orientation-landscape');
                    document.documentElement.classList.add(`orientation-${this.orientation}`);
                    this.applyResponsiveAdjustments();
                }, 100);
            });
        }
    },

    setupMediaQueries() {
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        motionQuery.addEventListener('change', (e) => {
            this.prefersReducedMotion = e.matches;
            document.documentElement.classList.toggle('reduced-motion', e.matches);
        });
        const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
        darkQuery.addEventListener('change', (e) => {
            this.prefersDarkMode = e.matches;
            // Force light mode always
            // document.documentElement.classList.toggle('dark-mode', e.matches);
        });
    },

    handleDeviceChange(data) {
        const newDevice = this.getDeviceType();
        if (newDevice !== this.currentDevice) {
            document.documentElement.classList.remove(`device-${this.currentDevice}`);
            document.documentElement.classList.add(`device-${newDevice}`);
            this.currentDevice = newDevice;
            this.applyDeviceSpecificAdjustments(newDevice);
        }
    },

    applyResponsiveAdjustments() {
        this.adjustStatusViewer();
        this.adjustModals();
        this.adjustFontSizes();
        this.adjustTouchTargets();
    },

    applyDeviceSpecificAdjustments(device) {
        const statusItems = UIElements.querySelectorAll('.status-item');
        statusItems.forEach(item => {
            if (device === 'mobile') {
                item.classList.add('compact');
            } else {
                item.classList.remove('compact');
            }
        });
        if (device === 'mobile' && UIElements.statusViewerPanel?.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        const actionButtons = UIElements.querySelectorAll('.action-btn');
        actionButtons.forEach(btn => {
            if (device === 'mobile') {
                btn.classList.add('compact');
            } else {
                btn.classList.remove('compact');
            }
        });
    },

    adjustStatusViewer() {
        const viewer = UIElements.statusViewerPanel;
        if (!viewer) return;
        if (this.currentDevice === 'mobile') {
            viewer.style.maxHeight = '100vh';
            viewer.style.borderRadius = '0';
        } else {
            viewer.style.maxHeight = '90vh';
            viewer.style.borderRadius = '12px';
        }
    },

    adjustModals() {
        const modals = UIElements.querySelectorAll('.create-status-modal, .highlights-modal, .memory-timeline-modal, .stats-modal');
        modals.forEach(modal => {
            if (this.currentDevice === 'mobile') {
                modal.style.width = '95%';
                modal.style.maxWidth = '95%';
                modal.style.maxHeight = '90vh';
            } else {
                modal.style.width = '90%';
                modal.style.maxWidth = '600px';
                modal.style.maxHeight = '80vh';
            }
        });
    },

    adjustFontSizes() {
        const root = document.documentElement;
        if (this.currentDevice === 'mobile') root.style.fontSize = '14px';
        else if (this.currentDevice === 'tablet') root.style.fontSize = '15px';
        else root.style.fontSize = '16px';
    },

    adjustTouchTargets() {
        if (this.touchCapable) {
            const smallButtons = UIElements.querySelectorAll('.status-action-btn, .draft-action-btn, .reaction-btn');
            smallButtons.forEach(btn => {
                btn.style.minWidth = '44px';
                btn.style.minHeight = '44px';
            });
        }
    },

    isMobileDevice() { return this.currentDevice === 'mobile'; },
    isTabletDevice() { return this.currentDevice === 'tablet'; },
    isDesktopDevice() { return this.currentDevice === 'desktop' || this.currentDevice === 'wide'; }
};

// =============================================
// SKELETON LOADER
// =============================================
const SkeletonLoader = {
    show() {
        const containers = [
            'allStatusList', 'friendsStatusList', 'closeFriendsStatusList',
            'myStatusList', 'highlightsContent',
            'pinnedStatusList', 'mutedStatusList', 'microCirclesStatusList',
            'moodChart', 'allDraftsList', 'scheduledStatusesList'
        ];
        containers.forEach(id => {
            const container = UIElements.getElement(id);
            if (container && container.children.length === 0) {
                container.innerHTML = UIRenderPipeline.createSkeletonLoader(id);
                container.classList.add('loading-skeleton');
            }
        });
    },

    hide(containerId) {
        const container = UIElements.getElement(containerId);
        if (container) {
            container.classList.remove('loading-skeleton');
            const skeletons = container.querySelectorAll('.skeleton, .skeleton-pulse');
            skeletons.forEach(el => el.remove());
        }
    },

    hideAll() {
        const containers = UIElements.querySelectorAll('.loading-skeleton');
        containers.forEach(container => {
            container.classList.remove('loading-skeleton');
            const skeletons = container.querySelectorAll('.skeleton, .skeleton-pulse');
            skeletons.forEach(el => el.remove());
        });
    },

    showFor(containerId, count = 3) {
        const container = UIElements.getElement(containerId);
        if (!container) return;
        const loader = document.createElement('div');
        loader.className = 'skeleton-loader';
        loader.innerHTML = Array(count).fill(0).map(() => `
            <div class="skeleton-item skeleton-pulse"></div>
        `).join('');
        container.innerHTML = '';
        container.appendChild(loader);
        container.classList.add('loading-skeleton');
    }
};

// =============================================
// INITIAL RENDER - USING REAL STATUS DATA
// =============================================
const InitialRender = {
    execute() {
        this.renderMyStatusPreview();
        this.renderAllStatuses();
        this.renderUserAvatar();
        this.renderStreakCounter();
        this.renderMoodChart();
        UIRenderPipeline.setStage('initialRender');
    },

    renderMyStatusPreview() {
        const myStatusPreview = UIElements.getElement('myStatusPreview');
        if (!myStatusPreview) return;
        const hasStatuses = myStatuses && myStatuses.length > 0;
        if (hasStatuses) {
            const latest = myStatuses[0];
            const previewText = getStatusPreviewText(latest);
            const timeAgo = latest.createdAt ? formatTimeAgo(latest.createdAt) : 'Just now';
            myStatusPreview.innerHTML = `
                <div class="my-status-preview-content">
                    <div class="my-status-preview-text">${UISanitizer.sanitizeHTML(previewText)}</div>
                    <div class="my-status-preview-time">${timeAgo}</div>
                </div>
            `;
        } else {
            myStatusPreview.innerHTML = `
                <div class="my-status-preview-placeholder">
                    <i class="fas fa-plus-circle"></i>
                    <span>Create your first status</span>
                </div>
            `;
        }
    },

    renderAllStatuses() {
        const container = UIElements.allStatusList;
        if (!container) return;
        if (!statuses || statuses.length === 0) {
            container.innerHTML = this.createEmptyState();
            return;
        }
        const fragment = document.createDocumentFragment();
        const filtered = this.filterStatuses(statuses);
        const limited = filtered.slice(0, 10);
        limited.forEach(status => {
            const element = this.createStatusElement(status);
            if (element) fragment.appendChild(element);
        });
        container.innerHTML = '';
        container.appendChild(fragment);
        setTimeout(() => {
            this.bindStatusItemHandlers(container);
        }, 50);
    },
    
    bindStatusItemHandlers(container) {
        const statusItems = container.querySelectorAll('.status-item');
        statusItems.forEach(item => {
            if (item._handlersBound) return;
            item._handlersBound = true;
            const viewBtn = item.querySelector('[data-action="view"]');
            if (viewBtn) {
                viewBtn.removeEventListener('click', item._viewHandler);
                item._viewHandler = (e) => {
                    e.stopPropagation();
                    if (!ensureUIActive('viewStatus')) return;
                    const statusId = item.dataset.statusId;
                    // FIX: status.id may be a number from server; dataset is always string
                    const status = statuses.find(s => String(s.id) === String(statusId));
                    if (status) showStatusViewer(status);
                    else console.warn('[status-ui] status not found for id:', statusId, 'total:', statuses.length);
                };
                viewBtn.addEventListener('click', item._viewHandler);
            }
            const pinBtn = item.querySelector('[data-action="pin"], [data-action="unpin"]');
            if (pinBtn) {
                pinBtn.removeEventListener('click', item._pinHandler);
                item._pinHandler = (e) => {
                    e.stopPropagation();
                    if (!ensureUIActive('pinStatus')) return;
                    const action = pinBtn.dataset.action;
                    const statusId = item.dataset.statusId;
                    const status = statuses.find(s => s.id === statusId);
                    if (status) handleStatusAction(action, status, pinBtn);
                };
                pinBtn.addEventListener('click', item._pinHandler);
            }
            const muteBtn = item.querySelector('[data-action="mute"], [data-action="unmute"]');
            if (muteBtn) {
                muteBtn.removeEventListener('click', item._muteHandler);
                item._muteHandler = (e) => {
                    e.stopPropagation();
                    if (!ensureUIActive('muteUser')) return;
                    const action = muteBtn.dataset.action;
                    const status = statuses.find(s => String(s.id) === String(item.dataset.statusId));
                    if (status) handleStatusAction(action, status, muteBtn);
                };
                muteBtn.addEventListener('click', item._muteHandler);
            }
            item.removeEventListener('click', item._itemClickHandler);
            item._itemClickHandler = (e) => {
                if (!e.target.closest('.status-actions') && ensureUIActive('viewStatus')) {
                    const statusId = item.dataset.statusId;
                    // FIX: String() coercion so number IDs from server match dataset strings
                    const status = statuses.find(s => String(s.id) === String(statusId));
                    if (status) showStatusViewer(status);
                    else console.warn('[status-ui] item click: status not found id:', statusId);
                }
            };
            item.addEventListener('click', item._itemClickHandler);
        });
    },

    renderUserAvatar() {
        if (!currentUser) return;
        const avatarElements = UIElements.querySelectorAll('.user-avatar, .status-avatar, .my-status-avatar, .viewer-user-avatar');
        avatarElements.forEach(avatar => {
            if (currentUser.photoURL) {
                const url = UISanitizer.sanitizeUrl(currentUser.photoURL);
                avatar.style.backgroundImage = `url('${url}')`;
                avatar.innerHTML = '';
            } else if (currentUser.displayName) {
                const initials = currentUser.displayName
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2);
                avatar.innerHTML = `<span>${initials}</span>`;
            }
        });
    },

    renderStreakCounter() {
        const streakCountEl = UIElements.getElement('streakCount');
        if (streakCountEl) {
            streakCountEl.textContent = streakCount || 0;
        }
    },
renderMoodChart() {
    const chart = UIElements.getElement('moodChart');
    if (!chart) return;
    chart.innerHTML = '';
    const data = moodChartData.length > 0 ? moodChartData.slice(-7) : [];
    if (data.length === 0) {
        chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:12px">Post statuses to see mood chart</div>';
        return;
    }
    data.forEach((day) => {
        const bar = document.createElement('div');
        bar.className = 'mood-bar';
        bar.style.backgroundColor = statusMoods[day.mood]?.color || 'var(--mood-happy)';
        bar.style.height = `${day.value}%`;
        bar.title = `${statusMoods[day.mood]?.name || 'Happy'} (${day.value}%)`;
        chart.appendChild(bar);
    });
},

    createEmptyState() {
        const isAuth = isAuthenticated();
        // If not authenticated yet, show shimmer so user doesn't see empty state
        if (!isAuth) {
            return `
                <div class="status-skeleton-list">
                    ${[1,2,3].map(() => `
                        <div class="status-item skeleton-item">
                            <div class="skeleton-avatar"></div>
                            <div class="skeleton-content">
                                <div class="skeleton-line short"></div>
                                <div class="skeleton-line long"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        return `
            <div class="empty-state">
                <i class="fas fa-camera"></i>
                <p>No statuses yet</p>
                <p class="subtext">Share what's on your mind!</p>
                <button class="action-btn primary" id="emptyStateCreateBtn" onclick="document.getElementById('createStatusBtn')?.click()">
                    <i class="fas fa-plus"></i> Create Status
                </button>
            </div>
        `;
    },

    filterStatuses(statusArray) {
        if (!Array.isArray(statusArray)) return [];
        let filtered = [...statusArray];
        if (currentIntentFilter) {
            filtered = filtered.filter(s => s.intent === currentIntentFilter);
        }
        if (currentMoodFilter) {
            filtered = filtered.filter(s => s.mood === currentMoodFilter);
        }
        if (activeFilters && activeFilters.size > 0) {
            filtered = filtered.filter(s => {
                return Array.from(activeFilters).every(filter => {
                    if (filter.startsWith('intent-')) return s.intent === filter.replace('intent-', '');
                    if (filter.startsWith('mood-')) return s.mood === filter.replace('mood-', '');
                    return true;
                });
            });
        }
        if (mutedUsers && mutedUsers.size > 0) {
            filtered = filtered.filter(s => !mutedUsers.has(s.userId));
        }
        // FIX-022: Filter out expired statuses client-side using UTC timestamps.
        // The previous code never filtered expired items here — it relied entirely on the
        // server, which meant cached/stale statuses appeared until next API refresh.
        const nowUtc = Date.now();
        filtered = filtered.filter(s => {
            // If server already set expiresAt, trust it
            if (s.expiresAt) {
                return new Date(s.expiresAt).getTime() > nowUtc;
            }
            // Otherwise compute from createdAt + 24h
            if (s.createdAt) {
                const createdUtc = new Date(s.createdAt).getTime();
                return (createdUtc + 86400000) > nowUtc;
            }
            return true; // no timestamps — keep it
        });

        return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    createStatusElement(status) {
        if (!status || !status.id) return null;
        const sanitized = UISanitizer.validateStatusData(status);
        if (!sanitized) return null;
        const item = document.createElement('div');
        item.className = 'status-item';
        item.dataset.statusId = String(sanitized.id);
        item.dataset.userId = sanitized.userId || '';
        const user = sanitized.user || { displayName: 'Unknown User' };
        const initials = user.displayName
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        const isViewed = viewedStatuses?.has(sanitized.id) || false;
        const isPinned = sanitized.isPinned || false;
        const isMuted = mutedUsers?.has(sanitized.userId) || false;
        let previewText = '';
        if (sanitized.type === 'text') {
            previewText = UISanitizer.sanitizeHTML(sanitized.content || sanitized.text || '').substring(0, 100);
            if ((sanitized.content || sanitized.text || '').length > 100) previewText += '...';
        } else if (sanitized.type === 'media' || sanitized.type === 'image') {
            previewText = `<i class="fas fa-image"></i> ${UISanitizer.sanitizeHTML(sanitized.caption || sanitized.content || 'Photo').substring(0, 50)}`;
        } else if (sanitized.type === 'video') {
            previewText = `<i class="fas fa-video"></i> ${UISanitizer.sanitizeHTML(sanitized.caption || sanitized.content || 'Video').substring(0, 50)}`;
        } else if (sanitized.type === 'audio') {
            previewText = `<i class="fas fa-microphone"></i> ${UISanitizer.sanitizeHTML(sanitized.caption || sanitized.content || 'Audio').substring(0, 50)}`;
        } else if (sanitized.type === 'poll') {
            previewText = `<i class="fas fa-poll"></i> ${UISanitizer.sanitizeHTML(sanitized.question || sanitized.content || 'Poll').substring(0, 50)}`;
        } else if (sanitized.type === 'mood') {
            previewText = `<i class="fas fa-smile"></i> ${UISanitizer.sanitizeHTML(sanitized.moodType || sanitized.content || 'Mood').substring(0, 50)}`;
        } else if (sanitized.type === 'location') {
            previewText = `<i class="fas fa-map-marker-alt"></i> ${UISanitizer.sanitizeHTML(sanitized.location || sanitized.content || 'Location').substring(0, 50)}`;
        } else if (sanitized.mediaUrl) {
            // Fallback: has a media URL even if type is unrecognised
            const isVid = /\.(mp4|webm|ogg|mov)/i.test(sanitized.mediaUrl);
            previewText = isVid
                ? `<i class="fas fa-video"></i> Video`
                : `<i class="fas fa-image"></i> ${UISanitizer.sanitizeHTML(sanitized.content || 'Media').substring(0, 50)}`;
        } else {
            previewText = UISanitizer.sanitizeHTML(sanitized.content || sanitized.text || '').substring(0, 100);
        }
        const timeAgo = sanitized.createdAt ? formatTimeAgo(sanitized.createdAt) : 'Just now';
        item.innerHTML = `
            <div class="status-avatar">
                <div class="status-ring ${isViewed ? 'viewed' : ''}"></div>
                <div class="status-avatar-inner" ${user.photoURL ? `style="background-image: url('${UISanitizer.sanitizeUrl(user.photoURL)}')"` : ''}>
                    ${user.photoURL ? '' : `<span>${initials}</span>`}
                </div>
            </div>
            <div class="status-info">
                <div class="status-name">
                    <span class="status-name-text">${UISanitizer.sanitizeHTML(user.displayName || 'Unknown User')}</span>
                    <span class="status-time">${timeAgo}</span>
                </div>
                <div class="status-preview">${previewText}</div>
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
        return item;
    }
};

// =============================================
// PROGRESSIVE ENHANCEMENT
// =============================================
const ProgressiveEnhancement = {
    execute() {
        this.enhanceImages();
        this.enhanceInteractivity();
        this.enhanceAccessibility();
        this.setupLazyLoading();
        this.enhanceForms();
        this.enhanceAnimations();
        UIRenderPipeline.setStage('progressiveEnhancement');
    },

    enhanceImages() {
        const avatars = UIElements.querySelectorAll('.status-avatar-inner[style*="background-image"]');
        avatars.forEach(avatar => {
            const bgImage = avatar.style.backgroundImage;
            if (bgImage && bgImage.includes('url')) {
                const url = bgImage.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
                const img = new Image();
                img.onload = () => avatar.classList.add('image-loaded');
                img.onerror = () => {
                    avatar.style.backgroundImage = '';
                    const initials = avatar.querySelector('span');
                    if (initials) initials.style.display = 'block';
                };
                img.src = url;
            }
        });
    },

    enhanceInteractivity() {
        const statusItems = UIElements.querySelectorAll('.status-item');
        InitialRender.bindStatusItemHandlers(statusItems[0]?.parentNode);
    },

    enhanceAccessibility() {
        const buttons = UIElements.querySelectorAll('button');
        buttons.forEach(btn => {
            if (!btn.hasAttribute('aria-label') && btn.title) {
                btn.setAttribute('aria-label', btn.title);
            }
            if (!btn.hasAttribute('aria-label') && btn.textContent) {
                btn.setAttribute('aria-label', btn.textContent.trim());
            }
        });
        const images = UIElements.querySelectorAll('img:not([alt])');
        images.forEach(img => {
            img.setAttribute('alt', '');
        });
        const inputs = UIElements.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (!input.hasAttribute('aria-label') && input.placeholder) {
                input.setAttribute('aria-label', input.placeholder);
            }
        });
    },

    setupLazyLoading() {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            img.classList.add('loaded');
                        }
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '100px', threshold: 0.01 });
            const images = UIElements.querySelectorAll('img[data-src]');
            images.forEach(img => observer.observe(img));
        } else {
            const images = UIElements.querySelectorAll('img[data-src]');
            images.forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
        }
    },

    enhanceForms() {
        const forms = UIElements.querySelectorAll('form');
        forms.forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
            });
        });
        const textareas = UIElements.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
        });
    },

    enhanceAnimations() {
        if (ResponsiveEngine.prefersReducedMotion) return;
        const animated = UIElements.querySelectorAll('.status-item, .highlight-item, .draft-item');
        animated.forEach(el => {
            el.style.transition = 'all 0.2s ease';
        });
    }
};

// =============================================
// LIVE UPDATE ENGINE
// =============================================
const LiveUpdateEngine = {
    subscriptions: new Set(),
    updateQueue: [],
    isProcessing: false,
    lastUpdate: 0,
    updateThrottle: 1000,

    initialize() {
        this.setupCoreSubscriptions();
        this.startUpdateProcessor();
        UILogger.debug('Live', 'Live update engine initialized');
    },

    setupCoreSubscriptions() {
        UIBridge.subscribe('statusUpdate', (data) => {
            this.queueUpdate('status', data);
        });
        UIBridge.subscribe('statusState', (data) => {
            if (data.statuses) {
                this.queueUpdate('statuses', data);
            }
        });
        uiEvents.on('visibility', (data) => {
            if (!data.hidden && this.updateQueue.length > 0) {
                this.processUpdateQueue();
            }
        });
        uiEvents.on('online', () => {
            this.processUpdateQueue();
            if (isSessionReady()) {
                const core = getCore();
                if (core && core.loadStatuses) {
                    core.loadStatuses().catch(() => {});
                }
            }
        });
    },

    queueUpdate(type, data) {
        this.updateQueue.push({ type, data, timestamp: Date.now() });
        if (!this.isProcessing && !document.hidden && navigator.onLine) {
            this.processUpdateQueue();
        }
    },

    startUpdateProcessor() {
        setInterval(() => {
            if (this.updateQueue.length > 0 && !document.hidden && navigator.onLine) {
                this.processUpdateQueue();
            }
        }, 5000);
    },

    async processUpdateQueue() {
        if (this.isProcessing || this.updateQueue.length === 0) return;
        this.isProcessing = true;
        while (this.updateQueue.length > 0) {
            const update = this.updateQueue.shift();
            if (Date.now() - update.timestamp > 60000) continue;
            try {
                await this.applyUpdate(update);
            } catch (error) {
                UILogger.error('Live', `Failed to apply update: ${update.type}`, error);
            }
            await new Promise(r => setTimeout(r, this.updateThrottle));
        }
        this.isProcessing = false;
    },

    applyUpdate(update) {
        switch(update.type) {
            case 'status':
            case 'statuses':
                renderStatusListInstantlyUI();
                updateMyStatusPreviewUI();
                break;
            case 'reaction':
                this.handleReactionUpdate(update.data);
                break;
            case 'view':
                this.handleViewUpdate(update.data);
                break;
        }
    },

    handleReactionUpdate(data) {
        const statusItem = document.querySelector(`.status-item[data-status-id="${data.statusId}"]`);
        if (statusItem) {
            const reactionBtn = statusItem.querySelector(`[data-reaction="${data.reaction}"]`);
            if (reactionBtn) {
                const count = parseInt(reactionBtn.dataset.count || 0) + 1;
                reactionBtn.dataset.count = count;
                reactionBtn.innerHTML = `${data.reaction} ${count}`;
            }
        }
    },

    handleViewUpdate(data) {
        const ring = document.querySelector(`.status-item[data-status-id="${data.statusId}"] .status-ring`);
        if (ring) {
            ring.classList.add('viewed');
        }
    }
};

// =============================================
// STATUS VIEWER
// =============================================
// ── showStatusGroupViewer ─────────────────────────────────────────────────
// Entry point for opening a group of statuses (WhatsApp-style carousel)
function showStatusGroupViewer(statusGroup) {
    try {
        if (!ensureUIActive('viewStatus')) {
            console.warn('[status-ui] showStatusGroupViewer blocked by ensureUIActive');
            return;
        }
        if (!statusGroup || !statusGroup.length) {
            console.warn('[status-ui] showStatusGroupViewer: empty statusGroup');
            return;
        }

        // Determine if current user is the owner
        const myId = (currentUser && (currentUser.id || currentUser.userId)) ||
            (function() {
                try {
                    const s = JSON.parse(localStorage.getItem('currentUser') || '{}');
                    return s.id || s.userId || null;
                } catch(_) { return null; }
            })() ||
            (function() {
                try {
                    const a = JSON.parse(localStorage.getItem('kynecta_auth') || 'null');
                    return a && (a.id || a.userId || (a.user && (a.user.id || a.user.userId))) || null;
                } catch(_) { return null; }
            })();
        const ownerId = statusGroup[0].userId || statusGroup[0].user_id ||
                        (statusGroup[0].user && statusGroup[0].user.id);
        const isOwner = myId && String(myId) === String(ownerId);

        // Store group state
        currentViewerGroup    = statusGroup;
        currentViewerSlot     = 0;
        currentViewerStatus   = statusGroup[0];
        UIStateManager.saveViewerState && UIStateManager.saveViewerState();

        const viewer = document.getElementById('statusViewerPanel')
            || document.querySelector('.status-viewer-panel');
        if (!viewer) {
            console.error('[status-ui] showStatusGroupViewer: #statusViewerPanel not found in DOM');
            return;
        }

        viewer.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Set up owner/friend mode
        _applyViewerMode(isOwner, statusGroup[0]);

        // Build progress segments
        _buildProgressSegments(statusGroup.length);

        // Set up tap zones (hold-to-pause)
        _setupTapZones();

        // Load first status content
        _loadSlot(0, isOwner, statusGroup);

        // Start auto-advance timer
        _startSlideTimer(isOwner, statusGroup);

    } catch(err) {
        console.error('[status-ui] showStatusGroupViewer crashed:', err);
    }
}

// Keep old single-status entry point working (called by other code paths)
function showStatusViewer(statusData) {
    if (!statusData) return;
    showStatusGroupViewer([statusData]);
}

let _slideTimerHandle = null;
let _slideProgress    = null;
let currentViewerGroup = [];
let currentViewerSlot  = 0;

function _buildProgressSegments(count) {
    const container = document.getElementById('progressIndicators') || document.querySelector('.progress-indicators');
    if (!container) return;
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'progress-segments';
    wrap.id = 'progressSegments';
    for (let i = 0; i < count; i++) {
        const seg = document.createElement('div');
        seg.className = 'progress-segment';
        seg.innerHTML = '<div class="fill"></div>';
        wrap.appendChild(seg);
    }
    container.appendChild(wrap);
}

function _setSegmentState(index, state) {
    const segs = document.querySelectorAll('.progress-segment');
    segs.forEach((seg, i) => {
        seg.classList.remove('done', 'active');
        if (i < index) { seg.classList.add('done'); seg.querySelector('.fill').style.width = '100%'; }
        else if (i === index) { seg.classList.add('active'); seg.querySelector('.fill').style.width = '0%'; }
        else { seg.querySelector('.fill').style.width = '0%'; }
    });
}

function _startSlideTimer(isOwner, group) {
    // Do not start slide timer while viewers bottom sheet is open
    const vbs = document.getElementById('viewersBottomSheet');
    if (vbs && vbs.style.display !== 'none') return;

    _clearSlideTimer();
    _setSegmentState(currentViewerSlot);
    const DURATION = 5000;
    const fill = document.querySelector(`.progress-segment:nth-child(${currentViewerSlot + 1}) .fill`);
    if (fill) {
        fill.style.transition = `width ${DURATION}ms linear`;
        fill.style.width = '100%';
    }
    _slideTimerHandle = setTimeout(() => {
        _advanceSlide(isOwner, group);
    }, DURATION);
}

function _clearSlideTimer() {
    if (_slideTimerHandle) { clearTimeout(_slideTimerHandle); _slideTimerHandle = null; }
    // Reset fill transitions
    document.querySelectorAll('.progress-segment .fill').forEach(f => {
        f.style.transition = 'none';
    });
}

function _advanceSlide(isOwner, group) {
    // Do not advance or close viewer while viewers bottom sheet is open
    const vbs = document.getElementById('viewersBottomSheet');
    if (vbs && vbs.style.display !== 'none') return;

    _clearSlideTimer();
    const next = currentViewerSlot + 1;
    if (next < group.length) {
        currentViewerSlot  = next;
        currentViewerStatus = group[next];
        _loadSlot(next, isOwner, group);
        _startSlideTimer(isOwner, group);
    } else {
        // All slides done — close viewer and return to sidebar
        closeViewer();
    }
}

function _prevSlide(isOwner, group) {
    _clearSlideTimer();
    const prev = Math.max(0, currentViewerSlot - 1);
    currentViewerSlot  = prev;
    currentViewerStatus = group[prev];
    _loadSlot(prev, isOwner, group);
    _startSlideTimer(isOwner, group);
}

function _setupTapZones() {
    const prev = document.getElementById('viewerTapPrev');
    const next = document.getElementById('viewerTapNext');
    const viewerPanel = document.getElementById('statusViewerPanel');

    // Always reassign onclick (no stale _bound issue)
    if (prev) {
        prev.onclick = () => _prevSlide(_isCurrentOwner(), currentViewerGroup);
    }
    if (next) {
        next.onclick = () => _advanceSlide(_isCurrentOwner(), currentViewerGroup);
    }

    // ── Hold-to-pause: hold on viewer content pauses; release resumes ──
    // Exclude footer, inputs, buttons — so typing a reply never pauses the timer
    if (viewerPanel && !viewerPanel._holdBound) {
        viewerPanel._holdBound = true;
        let _holdTimer = null;

        const isInteractive = (target) =>
            !!(target.closest('.viewer-footer') ||
               target.closest('.viewer-header') ||
               target.closest('.emoji-picker-pop') ||
               target.closest('.emoji-trigger-wrap') ||
               target.closest('.viewers-bottom-sheet') ||
               target.tagName === 'INPUT' ||
               target.tagName === 'TEXTAREA' ||
               target.tagName === 'BUTTON' ||
               target.tagName === 'A');

        const pauseSlide = (e) => {
            if (isInteractive(e.target)) return;
            if (!isAutoAdvancePaused) {
                isAutoAdvancePaused = true;
                _clearSlideTimer();
            }
        };
        const resumeSlide = (e) => {
            clearTimeout(_holdTimer);
            if (isAutoAdvancePaused) {
                isAutoAdvancePaused = false;
                _startSlideTimer(_isCurrentOwner(), currentViewerGroup);
            }
        };

        viewerPanel.addEventListener('mousedown',  pauseSlide);
        viewerPanel.addEventListener('mouseup',    resumeSlide);
        viewerPanel.addEventListener('mouseleave', resumeSlide);
        viewerPanel.addEventListener('touchstart', pauseSlide, { passive: true });
        viewerPanel.addEventListener('touchend',   resumeSlide, { passive: true });
        viewerPanel.addEventListener('touchcancel',resumeSlide, { passive: true });

        // Pause timer when reply input is focused; resume ONLY when input loses focus AND is empty
        viewerPanel.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                isAutoAdvancePaused = true;
                _clearSlideTimer();
            }
        });
        viewerPanel.addEventListener('focusout', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                // Only resume slide timer if the input is empty - user finished/cancelled
                // If input has text, keep paused so they can finish typing
                const inputValue = (e.target.value || '').trim();
                if (inputValue.length > 0) {
                    // Input has content - keep paused, re-focus to help user continue typing
                    isAutoAdvancePaused = true;
                    _clearSlideTimer();
                    // Re-focus after a short delay to prevent the input from truly losing focus
                    setTimeout(() => {
                        if (e.target && document.body.contains(e.target)) {
                            e.target.focus();
                        }
                    }, 50);
                } else {
                    // Input is empty - safe to resume
                    isAutoAdvancePaused = false;
                    _startSlideTimer(_isCurrentOwner(), currentViewerGroup);
                }
            }
        });
    }
}

function _isCurrentOwner() {
    if (!currentViewerStatus) return false;
    const myId = currentUser?.id || currentUser?.userId;
    return myId && String(myId) === String(currentViewerStatus.userId || currentViewerStatus.user?.id);
}

function _loadSlot(index, isOwner, group) {
    const status = group[index];
    currentViewerStatus = status;

    // Expose current status ID to window (for viewers panel + hold-reveal)
    window.__currentViewingStatusId = status.id;
    window.__activeStatusId         = status.id;
    if (typeof window.__setCurrentViewingStatusId === 'function') {
        window.__setCurrentViewingStatusId(status.id);
    }
    // Dispatch event so inline JS can react
    document.dispatchEvent(new CustomEvent('statusSlotLoaded', { detail: { statusId: status.id, isOwner } }));

    // Load content
    loadViewerContent(status);

    // Apply owner/friend mode
    _applyViewerMode(isOwner, status);

    // Record view (friends only, deduplicated)
    // Check both string and number forms (IDs may be either type)
    const _sid = String(status.id);
    const _alreadyViewed = viewedStatuses?.has(_sid) || viewedStatuses?.has(status.id);
    if (!isOwner && !_alreadyViewed) {
        if (viewedStatuses) {
            viewedStatuses.add(_sid);
            viewedStatuses.add(status.id);
            // Also add numeric and string forms to be safe
            if (!isNaN(_sid)) viewedStatuses.add(Number(_sid));
        }
        try {
            const arr = JSON.stringify(Array.from(viewedStatuses).map(String));
            localStorage.setItem('kyn_viewed_statuses',    arr);
            localStorage.setItem('knecta_viewed_statuses', arr);
        } catch(_) {}
        // FIX: Re-render immediately after marking viewed so viewed section shows instantly
        setTimeout(() => {
            if (typeof renderStatusListInstantlyUI === 'function') {
                renderStatusListInstantlyUI();
            }
        }, 50);
        // Update ring state in sidebar
        const groupItem = document.querySelector(`[data-status-ids*="${status.id}"]`);
        if (groupItem) {
            const ids = groupItem.dataset.statusIds.split(',');
            const viewed = ids.filter(id => viewedStatuses?.has(id)).length;
            const ring = groupItem.querySelector('.status-group-ring');
            if (ring && viewed === ids.length) ring.classList.add('viewed');
        }
        // Record view on server — fire for non-owners only
        if (!isOwner) {
            const api = window.StatusAPI;
            if (api && api.viewStatus) {
                api.viewStatus(status.id).then(result => {
                    if (result?.success && result.viewCount !== undefined) {
                        // Update creator's seenCountNum (belt-and-suspenders — socket also fires)
                        const el = document.getElementById('seenCountNum');
                        if (el) el.textContent = result.viewCount;
                        // Dispatch viewerUpdate so all listeners (sidebar, VBS) sync
                        try {
                            document.dispatchEvent(new CustomEvent('viewerUpdate', {
                                detail: {
                                    statusId:    String(status.id),
                                    viewCount:   result.viewCount,
                                    viewerCount: result.viewCount
                                }
                            }));
                        } catch (_) {}
                    }
                }).catch(() => {});
            }
        }
    }

    // Update seen count for owner
    if (isOwner) {
        const el = document.getElementById('seenCountNum');
        if (el) el.textContent = status.viewCount || 0;
    }

    // Bind owner edit/delete buttons
    _bindOwnerButtons(status);
}

function _applyViewerMode(isOwner, status) {
    const footer = document.getElementById('viewerFooter');
    if (!footer) return;

    if (isOwner) {
        footer.classList.add('owner-mode');
        footer.classList.remove('friend-mode');
        // Body class hides viewer header three-dots for owner
        document.body.classList.add('viewer-owner-mode');
        document.body.classList.remove('viewer-friend-mode');
        // Update seen count from status data
        const seenEl = document.getElementById('seenCountNum');
        if (seenEl) seenEl.textContent = status.viewCount || status.views || 0;
        // FIX: Load viewer list for owner — was never called, so list was always empty
        _loadViewersForOwner(status);
    } else {
        footer.classList.add('friend-mode');
        footer.classList.remove('owner-mode');
        document.body.classList.add('viewer-friend-mode');
        document.body.classList.remove('viewer-owner-mode');
        // Reset emoji trigger for THIS specific status
        const eti = document.getElementById('emojiTriggerIcon');
        if (eti) {
            // Check if user already reacted to this specific status
            const sid = String(status.id);
            const uid = String((currentUser && (currentUser.id || currentUser.userId)) || '');
            const allPools = [...(friendsStatuses || []), ...(statuses || [])];
            const thisStatus = allPools.find(s => String(s.id) === sid);
            let existingReaction = null;
            if (thisStatus && thisStatus.reactions && uid) {
                existingReaction = Object.keys(thisStatus.reactions).find(em =>
                    Array.isArray(thisStatus.reactions[em]) &&
                    thisStatus.reactions[em].some(r => String(r.userId || r) === uid)
                );
            }
            eti.textContent = existingReaction || '😊';
        }
        const epBtns = document.querySelectorAll('.ep-btn');
        epBtns.forEach(b => {
            const hasExisting = eti && b.dataset.emoji === eti.textContent && eti.textContent !== '😊';
            b.classList.toggle('selected', !!hasExisting);
        });
    }

    // Always hide pause button (hold-to-pause is used)
    const pauseBtn = document.getElementById('pauseResumeBtn');
    if (pauseBtn) pauseBtn.style.display = 'none';
}

// _loadViewersForOwner defined below

function _loadReactionsForFriend(status) {
    // Reactions are now handled by the inline emoji picker
    // Pre-select if user already reacted
    if (!status || !status.id) return;
    const eti = document.getElementById('emojiTriggerIcon');
    if (!eti) return;
    // Check if current user already reacted
    const uid = String((currentUser && (currentUser.id || currentUser.userId)) || '');
    if (uid && status.reactions) {
        const myReaction = Object.keys(status.reactions).find(emoji =>
            Array.isArray(status.reactions[emoji])
                ? status.reactions[emoji].some(r => String(r.userId || r) === uid)
                : false
        );
        if (myReaction) {
            eti.textContent = myReaction;
            const epBtns = document.querySelectorAll('.ep-btn');
            epBtns.forEach(b => {
                b.classList.toggle('selected', b.dataset.emoji === myReaction);
            });
        }
    }
}

function _loadViewersForOwner(status) {
    // Update seen count number immediately
    const seenEl = document.getElementById('seenCountNum');
    if (seenEl) seenEl.textContent = status.viewCount || 0;

    // Create/find inline viewer list below seen count
    const ownerControls = document.getElementById('ownerControls');
    if (!ownerControls) return;

    let viewersList = document.getElementById('inlineViewersList');
    if (!viewersList) {
        viewersList = document.createElement('div');
        viewersList.id = 'inlineViewersList';
        viewersList.style.cssText = 'margin-top:8px;max-height:180px;overflow-y:auto;';
        ownerControls.appendChild(viewersList);
    }
    viewersList.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);padding:4px 0;">Loading viewers...</div>';

    const api = window.StatusAPI;
    if (!api || !api.getViewers || !status || !status.id) {
        viewersList.innerHTML = '';
        return;
    }
    api.getViewers(status.id).then(result => {
        if (!result || !result.success) { viewersList.innerHTML = ''; return; }
        const viewers = result.viewers || result.data?.viewers || [];
        if (!viewers.length) {
            viewersList.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);padding:4px 0;">No views yet</div>';
            return;
        }
        // Update count
        if (seenEl) seenEl.textContent = result.totalViews || viewers.length;
        viewersList.innerHTML = viewers.slice(0, 20).map(v => {
            const name = v.viewer?.displayName || v.viewer?.username || ('User ' + v.viewerId);
            const initial = name.charAt(0).toUpperCase();
            const time = v.viewedAt ? formatTimeAgo(v.viewedAt) : '';
            const reaction = v.reaction ? ' · ' + v.reaction : '';
            const replies = v.replyCount ? ' · ' + v.replyCount + ' repl' + (v.replyCount === 1 ? 'y' : 'ies') : '';
            const avatarUrl = v.viewer?.avatar || v.viewer?.photoURL || '';
            return '<div class="viewer-list-item" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-color,#2a3942);">' +
                '<div style="width:32px;height:32px;border-radius:50%;background:var(--primary-color,#00a884);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex-shrink:0;' + (avatarUrl ? 'background-image:url(' + avatarUrl + ');background-size:cover;background-position:center;' : '') + '">' +
                (avatarUrl ? '' : initial) + '</div>' +
                '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;color:var(--text-primary,#e9edef);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</div>' +
                '<div style="font-size:11px;color:var(--text-secondary,#8696a0);">' + time + reaction + replies + '</div></div></div>';
        }).join('');
    }).catch(() => { viewersList.innerHTML = ''; });
}

// _loadReactionsForFriend defined below (duplicate removed)

function _bindOwnerButtons(status) {
    // Always use direct onclick assignment (no _bound flag) so each new status slot gets fresh handler
    const editBtn   = document.getElementById('editStatusBtn');
    const deleteBtn = document.getElementById('deleteStatusBtn');

    if (editBtn) {
        editBtn.onclick = () => {
            closeViewer();
            if (typeof editMyStatus === 'function') editMyStatus(status);
        };
    }
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (!confirm('Delete this status?')) return;
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            _clearSlideTimer();
            try {
                const api = window.StatusAPI;
                const core = getCore();
                // Try API first (direct HTTP), fallback to core
                let deleted = false;
                if (api && api.deleteStatus) {
                    const result = await api.deleteStatus(status.id).catch(() => null);
                    deleted = result && result.success;
                }
                if (!deleted && core && core.deleteStatus) {
                    await core.deleteStatus(status.id).catch(() => {});
                    deleted = true;
                }
                closeViewer();
                showNotification('Status deleted', 'success');
                // Remove from local state
                if (myStatuses) {
                    myStatuses = myStatuses.filter(s => String(s.id) !== String(status.id));
                }
                if (typeof renderStatusListInstantlyUI === 'function') renderStatusListInstantlyUI();
            } catch (e) {
                showNotification('Failed to delete status', 'error');
            } finally {
                if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.innerHTML = '<i class="fas fa-trash"></i>'; }
            }
        };
    }
}

function loadViewerContent(statusData) {
    const sanitized = UISanitizer.validateStatusData(statusData);
    if (!sanitized) {
        console.error('[status-ui] loadViewerContent: validateStatusData returned null', statusData);
        return;
    }
    const viewerUserInfo  = UIElements.getElement('viewerUserInfo')  || document.getElementById('viewerUserInfo');
    const viewerContent   = UIElements.getElement('viewerContent')   || document.getElementById('viewerContent');
    const progressIndicators   = UIElements.getElement('progressIndicators')   || document.getElementById('progressIndicators');
    const actionButtonsOverlay = UIElements.getElement('actionButtonsOverlay') || document.getElementById('actionButtonsOverlay');
    if (!viewerUserInfo || !viewerContent) {
        console.error('[status-ui] loadViewerContent: missing DOM elements',
            { viewerUserInfo: !!viewerUserInfo, viewerContent: !!viewerContent });
        return;
    }
    const user = sanitized.user || { displayName: 'Unknown User' };
    const initials = user.displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    const timeAgo = sanitized.createdAt ? formatTimeAgo(sanitized.createdAt) : 'Just now';
    // If viewing own status, label as "My Status"
    const currentUid = currentUser && (currentUser.id || currentUser.userId);
    const statusOwnerId = sanitized.userId || sanitized.user_id || (sanitized.user && sanitized.user.id);
    const isViewingOwnStatus = currentUid && statusOwnerId && String(currentUid) === String(statusOwnerId);
    const shownName = isViewingOwnStatus ? 'My Status' : (user.displayName || 'Unknown User');
    const avatarUrl = user.photoURL || user.avatar || '';
    viewerUserInfo.innerHTML = `
        <div class="viewer-user-avatar" ${avatarUrl ? `style="background-image: url('${UISanitizer.sanitizeUrl(avatarUrl)}');background-size:cover;background-position:center;"` : ''}>
            ${avatarUrl ? '' : `<span>${initials}</span>`}
        </div>
        <div class="viewer-user-details">
            <div class="viewer-user-name">${UISanitizer.sanitizeHTML(shownName)}</div>
            <div class="viewer-status-time">${timeAgo}</div>
        </div>
    `;
    viewerContent.innerHTML = '';
    if (sanitized.type === 'text') {
        viewerContent.appendChild(createTextStatusSlide(sanitized));
    } else if (sanitized.type === 'media') {
        viewerContent.appendChild(createMediaStatusSlide(sanitized));
    } else if (sanitized.type === 'image' || sanitized.type === 'video' || sanitized.type === 'audio') {
        // Backend stores these as 'image'/'video'/'audio' — route to media renderer
        viewerContent.appendChild(createMediaStatusSlide(sanitized));
    } else if (sanitized.type === 'poll') {
        viewerContent.appendChild(createPollStatusSlide(sanitized));
    } else if (sanitized.type === 'question') {
        // P2 FIX: Render question-type status as text slide + question overlay
        const qSlide = createTextStatusSlide(sanitized);
        viewerContent.appendChild(qSlide);
        // The question overlay is rendered below in the overlay section
    } else if (sanitized.type === 'mood') {
        // Render mood as styled text slide
        const moodSlide = document.createElement('div');
        moodSlide.className = 'status-slide text-status-slide active mood-slide';
        moodSlide.style.background = 'linear-gradient(135deg, #facc15 0%, #f472b6 100%)';
        moodSlide.innerHTML = `
            <div class="text-status-content" style="font-size:2rem">${UISanitizer.sanitizeHTML(sanitized.moodType || '')}</div>
            <div class="text-status-content">${UISanitizer.sanitizeHTML(sanitized.content || '')}</div>
        `;
        viewerContent.appendChild(moodSlide);
    } else if (sanitized.mediaUrl) {
        // Fallback: unknown type but has media — use media renderer
        viewerContent.appendChild(createMediaStatusSlide(sanitized));
    } else {
        // Last resort: render as text
        viewerContent.appendChild(createTextStatusSlide(sanitized));
    }
    // P2 FIX: Render question overlay (or hide if not question type)
    if (window._renderQuestionOverlay) window._renderQuestionOverlay(sanitized);

    // P3 FIX: Render music overlay
    if (window._renderMusicOverlay) window._renderMusicOverlay(sanitized);

    // P3 FIX: Start/stop countdown ticker
    const prevStatus = window.currentViewerStatus;
    if (prevStatus && prevStatus.id !== sanitized.id) {
        if (window._stopCountdownTicker) window._stopCountdownTicker(prevStatus.id);
    }
    const hasCd = sanitized.metadata && sanitized.metadata.countdown && sanitized.metadata.countdown.targetDate;
    if (hasCd) {
        if (window._startCountdownTicker) window._startCountdownTicker(sanitized.id);
    } else {
        const cdOverlay = document.getElementById('statusCountdownOverlay');
        if (cdOverlay) cdOverlay.style.display = 'none';
    }

    // Only rebuild progress if NOT already built by showStatusGroupViewer
    // (showStatusGroupViewer calls _buildProgressSegments before loadViewerContent)
    if (progressIndicators && !document.getElementById('progressSegments')) {
        progressIndicators.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
        `;
    }
    if (actionButtonsOverlay && sanitized.actionButtons) {
        actionButtonsOverlay.innerHTML = sanitized.actionButtons.map((btnKey, idx) => {
            const btn = typeof btnKey === 'object' ? btnKey : actionButtons[btnKey];
            if (!btn) return '';
            const label = btn.name || btn.label || btnKey;
            const icon  = btn.icon || 'fas fa-external-link-alt';
            const url   = btn.url || btn.linkUrl || null;
            return `
                <button class="action-btn ${typeof btnKey === 'string' ? btnKey : ''}"
                        data-action="${typeof btnKey === 'string' ? btnKey : 'link'}"
                        data-btn-index="${idx}"
                        data-btn-label="${label}"
                        ${url ? `data-url="${url}"` : ''}
                        onclick="window._handleStatusActionBtnClick && window._handleStatusActionBtnClick(this)">
                    <i class="${icon}"></i>
                    <span>${label}</span>
                </button>
            `;
        }).join('');
    }

    // P2 FIX: Poll rendering in story viewer
    const pollContainer = document.getElementById('statusPollOverlay');
    if (sanitized.metadata && sanitized.metadata.pollOptions && pollContainer) {
        const opts = sanitized.metadata.pollOptions;
        const voters = sanitized.metadata.pollVoters || {};
        const myVote = voters[currentUser && currentUser.id];
        const totalVotes = opts.reduce((s, o) => s + (o.votes || 0), 0);
        pollContainer.innerHTML = `
            <div class="status-poll">
                <p class="poll-question">${UISanitizer.sanitizeHTML(sanitized.metadata.questionText || sanitized.content || 'Poll')}</p>
                ${opts.map(opt => {
                    const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
                    const voted = myVote == opt.id;
                    return `<div class="poll-option ${voted ? 'voted' : ''}" data-option-id="${opt.id}"
                                  onclick="window._handlePollVote && window._handlePollVote(${sanitized.id}, ${opt.id})">
                                <span class="poll-option-text">${UISanitizer.sanitizeHTML(opt.text)}</span>
                                <div class="poll-bar" style="width:${pct}%"></div>
                                <span class="poll-pct">${pct}%</span>
                            </div>`;
                }).join('')}
                <p class="poll-votes-count">${totalVotes} vote${totalVotes !== 1 ? 's' : ''}</p>
            </div>`;
        pollContainer.style.display = 'block';
    } else if (pollContainer) {
        pollContainer.style.display = 'none';
    }
}

// P2 FIX: Action button click handler with tracking
window._handleStatusActionBtnClick = function(btn) {
    const url = btn.dataset.url;
    const statusId = window.currentViewerStatus && window.currentViewerStatus.id;
    const idx = btn.dataset.btnIndex;
    const label = btn.dataset.btnLabel;
    if (statusId) {
        const api = window.StatusAPI;
        if (api && api.trackActionClick) api.trackActionClick(statusId, idx, label).catch(() => {});
    }
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

// P2 FIX: Question sticker rendering
function renderQuestionOverlay(statusData) {
    const overlay = document.getElementById('statusQuestionOverlay');
    const textEl  = document.getElementById('statusQuestionText');
    if (!overlay || !textEl) return;
    const meta = statusData && statusData.metadata;
    if (statusData && statusData.type === 'question' && meta && meta.questionText) {
        textEl.textContent = meta.questionText;
        overlay.style.display = 'flex';
        const input = document.getElementById('questionAnswerInput');
        if (input) input.value = '';
    } else {
        overlay.style.display = 'none';
    }
}
window._renderQuestionOverlay = renderQuestionOverlay;

// P3 FIX: Load and render story templates in create modal
async function loadStatusTemplates() {
    const container = document.getElementById('statusTemplatesContainer');
    if (!container) return;
    try {
        const api = window.StatusAPI;
        if (!api || !api.getTemplates) return;
        const result = await api.getTemplates();
        const templates = result && result.data && result.data.templates ? result.data.templates : [];
        if (!templates.length) return;
        container.innerHTML = templates.map(t => `
            <div class="status-template-card" data-template-id="${t.id}"
                 style="background:${t.background};color:${t.textColor};font-family:${t.fontFamily}"
                 onclick="window._applyStatusTemplate && window._applyStatusTemplate(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                <span class="template-icon">${t.icon}</span>
                <span class="template-name">${t.name}</span>
            </div>
        `).join('');
        container.style.display = 'flex';
    } catch (_) {}
}
window._loadStatusTemplates = loadStatusTemplates;

// P3 FIX: Apply a template to the current text status editor
window._applyStatusTemplate = function(template) {
    // Set background
    const bgOptions = document.querySelectorAll('.background-option');
    bgOptions.forEach(b => b.classList.remove('selected'));
    // Store template in a temp var to apply on submit
    window._activeTemplate = template;
    // Apply preview style to text editor
    const textSlide = document.querySelector('.create-status-preview, #textStatusPreview, .text-status-slide');
    if (textSlide) {
        textSlide.style.background    = template.background;
        textSlide.style.color         = template.textColor;
        textSlide.style.fontFamily    = template.fontFamily;
    }
    // Mark selected
    document.querySelectorAll('.status-template-card').forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`.status-template-card[data-template-id="${template.id}"]`);
    if (card) card.classList.add('active');
    showNotification(`Template "${template.name}" applied`, 'success');
};

// P3 FIX: Countdown sticker — live countdown ticker in viewer
const _countdownTimers = new Map();
function startCountdownTicker(statusId) {
    if (_countdownTimers.has(statusId)) return; // already running
    const overlay = document.getElementById('statusCountdownOverlay');
    if (!overlay) return;

    async function tick() {
        try {
            const api = window.StatusAPI;
            if (!api || !api.getCountdown) return;
            const result = await api.getCountdown(statusId);
            if (!result || !result.success || !result.data) { overlay.style.display = 'none'; return; }
            const d = result.data;
            if (d.finished) {
                overlay.innerHTML = `<div class="countdown-sticker finished"><span>${d.label || 'Time\u2019s up!'}</span><span>🎉</span></div>`;
                overlay.style.display = 'flex';
                clearInterval(_countdownTimers.get(statusId));
                _countdownTimers.delete(statusId);
                return;
            }
            overlay.style.display = 'flex';
            overlay.innerHTML = `
                <div class="countdown-sticker">
                    ${d.label ? `<p class="countdown-label">${d.label}</p>` : ''}
                    <div class="countdown-units">
                        <div class="cu"><span class="cu-val">${d.formatted.days}</span><span class="cu-lbl">days</span></div>
                        <div class="cu"><span class="cu-val">${String(d.formatted.hours).padStart(2,'0')}</span><span class="cu-lbl">hrs</span></div>
                        <div class="cu"><span class="cu-val">${String(d.formatted.minutes).padStart(2,'0')}</span><span class="cu-lbl">min</span></div>
                        <div class="cu"><span class="cu-val">${String(d.formatted.seconds).padStart(2,'0')}</span><span class="cu-lbl">sec</span></div>
                    </div>
                </div>`;
        } catch(_) {}
    }

    tick(); // immediate
    const timer = setInterval(tick, 1000);
    _countdownTimers.set(statusId, timer);
}

function stopCountdownTicker(statusId) {
    if (_countdownTimers.has(statusId)) {
        clearInterval(_countdownTimers.get(statusId));
        _countdownTimers.delete(statusId);
    }
    const overlay = document.getElementById('statusCountdownOverlay');
    if (overlay) overlay.style.display = 'none';
}
window._startCountdownTicker = startCountdownTicker;
window._stopCountdownTicker  = stopCountdownTicker;

// P2 FIX: Question answer submit
window._handleQuestionAnswer = async function() {
    const statusId = window.currentViewerStatus && window.currentViewerStatus.id;
    const input = document.getElementById('questionAnswerInput');
    const text = input ? input.value.trim() : '';
    if (!statusId || !text) return;
    const api = window.StatusAPI;
    if (!api || !api.answerQuestion) return;
    try {
        const btn = document.getElementById('submitQuestionAnswerBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        const result = await api.answerQuestion(statusId, text);
        if (result && result.success) {
            if (input) input.value = '';
            showNotification('Answer sent!', 'success');
        } else {
            showNotification((result && result.message) || 'Failed to submit answer', 'error');
        }
    } catch (e) {
        showNotification('Failed to submit answer', 'error');
    } finally {
        const btn = document.getElementById('submitQuestionAnswerBtn');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
    }
};

// P2 FIX: Poll vote handler
window._handlePollVote = async function(statusId, optionId) {
    const api = window.StatusAPI;
    if (!api || !api.votePoll) return;
    try {
        const result = await api.votePoll(statusId, optionId);
        if (result && result.success && result.data && result.data.pollOptions) {
            // Re-render poll with updated counts
            if (window.currentViewerStatus && window.currentViewerStatus.metadata) {
                window.currentViewerStatus.metadata.pollOptions = result.data.pollOptions;
                window.currentViewerStatus.metadata.pollVoters = result.data.pollVoters ||
                    { ...(window.currentViewerStatus.metadata.pollVoters || {}), [currentUser && currentUser.id]: optionId };
                // Trigger re-render by calling displayStatus if available
                if (typeof displayStatusSlide === 'function') displayStatusSlide(window.currentViewerStatus);
            }
        }
    } catch (e) { console.warn('[status-ui] Poll vote error:', e.message); }
};

// IIFE removed (was closing brace) — keep this comment for clarity

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
        <div class="text-status-content">${UISanitizer.sanitizeHTML(statusData.content || statusData.text || '')}</div>
        <div class="text-status-author">— ${UISanitizer.sanitizeHTML(statusData.user?.displayName || 'Unknown User')}</div>
    `;
    return slide;
}

function createMediaStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide media-status-slide active';
    let mediaContent = '';

    // Resolve media type: prefer explicit mediaType, fall back to type field,
    // then sniff from URL extension so backend-stored statuses always render.
    const rawUrl = statusData.mediaUrl || statusData.media || '';
    const resolveMediaType = () => {
        if (statusData.mediaType) return statusData.mediaType;
        if (statusData.type === 'image' || statusData.type === 'video' || statusData.type === 'audio') return statusData.type;
        if (/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(rawUrl)) return 'video';
        if (/\.(mp3|wav|m4a|aac|oga|opus)(\?|$)/i.test(rawUrl)) return 'audio';
        if (/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)(\?|$)/i.test(rawUrl)) return 'image';
        // Data-URL sniff
        if (rawUrl.startsWith('data:video')) return 'video';
        if (rawUrl.startsWith('data:audio')) return 'audio';
        if (rawUrl.startsWith('data:image')) return 'image';
        return 'image'; // safe default
    };
    const mediaType = resolveMediaType();
    const safeUrl = UISanitizer.sanitizeUrl(rawUrl);

    if (!safeUrl) {
        // No media URL — show placeholder so the slide isn't blank
        mediaContent = `<div class="media-placeholder"><i class="fas fa-image"></i><p>Media unavailable</p></div>`;
    } else if (mediaType === 'video') {
        mediaContent = `<video
            src="${safeUrl}"
            class="media-status-content"
            autoplay muted loop playsinline controls
            onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=\\'media-error\\'><i class=\\'fas fa-exclamation-circle\\'></i> Video failed to load</div>')"
        ></video>`;
    } else if (mediaType === 'audio') {
        mediaContent = `<div class="audio-status-shell">
            <div class="audio-status-icon"><i class="fas fa-microphone-alt"></i></div>
            <audio
                src="${safeUrl}"
                class="media-status-content audio-status-content"
                autoplay controls playsinline
                onerror="this.style.display='none';this.parentNode.insertAdjacentHTML('beforeend','<div class=\\'media-error\\'><i class=\\'fas fa-exclamation-circle\\'></i> Audio failed to load</div>')"
            ></audio>
        </div>`;
    } else {
        mediaContent = `<img
            src="${safeUrl}"
            class="media-status-content"
            alt="Status image"
            loading="lazy"
            onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=\\'media-error\\'><i class=\\'fas fa-exclamation-circle\\'></i> Image failed to load</div>')"
        >`;
    }

    // Caption: prefer explicit caption, fall back to content field
    const captionText = statusData.caption || (statusData.type !== 'text' ? statusData.content : '');

    slide.innerHTML = `
        ${mediaContent}
        ${captionText ? `<div class="media-caption">${UISanitizer.sanitizeHTML(captionText)}</div>` : ''}
    `;

    if (statusData.isSensitive) {
        const mediaElement = slide.querySelector('.media-status-content');
        if (mediaElement) {
            mediaElement.style.filter = 'blur(20px)';
            const reveal = document.createElement('div');
            reveal.className = 'sensitive-overlay';
            reveal.innerHTML = '<span><i class="fas fa-eye-slash"></i> Sensitive content — tap to reveal</span>';
            reveal.addEventListener('click', () => {
                mediaElement.style.filter = 'none';
                reveal.remove();
            });
            slide.appendChild(reveal);
        }
    }
    return slide;
}

function createPollStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide poll-status-slide active';
    const totalVotes = statusData.options?.reduce((sum, opt) => sum + (opt.votes || 0), 0) || 0;
    const hasVoted = statusData.hasVoted || false;
    let optionsHtml = '';
    if (statusData.options) {
        statusData.options.forEach(option => {
            const percentage = totalVotes > 0 ? Math.round((option.votes || 0) / totalVotes * 100) : 0;
            optionsHtml += `
                <div class="poll-option ${hasVoted ? 'voted' : ''}" data-option-id="${UISanitizer.sanitizeHTML(option.id || '')}">
                    <div class="poll-option-text">${UISanitizer.sanitizeHTML(option.text || '')}</div>
                    <div class="poll-option-percentage">${percentage}% (${option.votes || 0} votes)</div>
                    <div class="poll-option-bar" style="width: ${percentage}%"></div>
                </div>
            `;
        });
    }
    slide.innerHTML = `
        <div class="poll-container">
            <div class="poll-question">${UISanitizer.sanitizeHTML(statusData.question || '')}</div>
            <div class="poll-options">
                ${optionsHtml}
            </div>
            <div class="poll-total-votes">Total votes: ${totalVotes}</div>
            ${hasVoted ? '<div class="poll-voted-message">✓ You have voted</div>' : ''}
        </div>
    `;
    if (!hasVoted && isAuthenticated() && !isOfflineMode && ensureUIActive('votePoll')) {
        const pollOptions = slide.querySelectorAll('.poll-option');
        pollOptions.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const optionId = option.dataset.optionId;
                try {
                    const core = getCore();
                    if (core && core.voteOnPoll) {
                        const response = await core.voteOnPoll(statusData.id, optionId);
                        if (response && response.success) {
                            showNotification('Vote recorded', 'success');
                            if (currentViewerStatus && currentViewerStatus.id === statusData.id) {
                                currentViewerStatus.hasVoted = true;
                                const votedOption = currentViewerStatus.options.find(o => o.id === optionId);
                                if (votedOption) {
                                    votedOption.votes = (votedOption.votes || 0) + 1;
                                }
                                const newTotalVotes = currentViewerStatus.options.reduce((sum, o) => sum + (o.votes || 0), 0);
                                slide.querySelectorAll('.poll-option').forEach(opt => {
                                    const id = opt.dataset.optionId;
                                    const optData = currentViewerStatus.options.find(o => o.id === id);
                                    if (optData) {
                                        const pct = newTotalVotes > 0 ? Math.round((optData.votes || 0) / newTotalVotes * 100) : 0;
                                        opt.querySelector('.poll-option-percentage').textContent = `${pct}% (${optData.votes || 0} votes)`;
                                        opt.querySelector('.poll-option-bar').style.width = `${pct}%`;
                                    }
                                    opt.classList.add('voted');
                                });
                            }
                        }
                    }
                } catch (error) {
                    UILogger.error('Poll', 'Vote failed', error);
                    showNotification('Failed to vote', 'error');
                }
            });
        });
    }
    return slide;
}

function startAutoAdvance() {
    if (autoAdvanceInterval) clearInterval(autoAdvanceInterval);
    if (progressInterval) clearInterval(progressInterval);
    isAutoAdvancePaused = false;
    const pauseResumeBtn = UIElements.getElement('pauseResumeBtn');
    if (pauseResumeBtn) {
        pauseResumeBtn.innerHTML = '<i class="fas fa-pause"></i>';
        pauseResumeBtn.title = 'Pause';
    }
    const progressFill = UIElements.getElement('progressFill');
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.style.transition = 'width 5s linear';
        const interval = setInterval(() => {
            if (!isAutoAdvancePaused) {
                const currentWidth = parseFloat(progressFill.style.width) || 0;
                if (currentWidth < 100) {
                    progressFill.style.width = (currentWidth + 1) + '%';
                } else {
                    progressFill.style.width = '0%';
                    advanceToNextSlide();
                }
            }
        }, 50);
        window.progressInterval = interval;
    }
}

function advanceToNextSlide() {
    if (!currentViewerStatus) return;
    const slides = UIElements.querySelectorAll('.status-slide');
    if (slides.length <= 1) return;
    slides[currentSlideIndex].classList.remove('active');
    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    slides[currentSlideIndex].classList.add('active');
    const progressFill = UIElements.getElement('progressFill');
    if (progressFill) {
        progressFill.style.width = '0%';
    }
}

function toggleAutoAdvance() {
    if (!ensureUIActive('toggleAutoAdvance')) return;
    isAutoAdvancePaused = !isAutoAdvancePaused;
    const pauseResumeBtn = UIElements.getElement('pauseResumeBtn');
    if (pauseResumeBtn) {
        pauseResumeBtn.innerHTML = isAutoAdvancePaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
        pauseResumeBtn.title = isAutoAdvancePaused ? 'Resume' : 'Pause';
    }
}

function stopAutoAdvance() {
    if (window.progressInterval) {
        clearInterval(window.progressInterval);
        window.progressInterval = null;
    }
    if (window.autoAdvanceInterval) {
        clearInterval(window.autoAdvanceInterval);
        window.autoAdvanceInterval = null;
    }
}

function closeViewer() {
    _clearSlideTimer();

    // P3 FIX: Stop music + countdown when viewer closes
    try {
        const player = document.getElementById('statusMusicPlayer');
        if (player) { player.pause(); player.src = ''; }
        const musicOverlay = document.getElementById('statusMusicOverlay');
        if (musicOverlay) musicOverlay.style.display = 'none';
        if (window._stopCountdownTicker && window.currentViewerStatus) {
            window._stopCountdownTicker(window.currentViewerStatus.id);
        }
    } catch(_) {}

    currentViewerGroup = [];
    currentViewerSlot  = 0;
    const viewer = UIElements.statusViewerPanel || document.querySelector('.status-viewer-panel');
    if (viewer) {
        viewer.classList.remove('active');
        document.body.style.overflow = '';
    }
    // Unbind owner buttons so they rebind fresh next open
    const editBtn = document.getElementById('editStatusBtn');
    const deleteBtn = document.getElementById('deleteStatusBtn');
    if (editBtn)   { editBtn._bound = false; editBtn.onclick = null; }
    if (deleteBtn) { deleteBtn._bound = false; deleteBtn.onclick = null; }
    // Clear current status ID + dispatch close event
    window.__currentViewingStatusId = null;
    window.__activeStatusId = null;
    document.body.classList.remove('viewer-owner-mode', 'viewer-friend-mode');
    try { document.dispatchEvent(new CustomEvent('statusViewerClosed')); } catch(_) {}
    // Re-render sidebar so viewed statuses move to Viewed updates section
    setTimeout(() => {
        if (typeof renderStatusListInstantlyUI === 'function') {
            renderStatusListInstantlyUI();
            // FIX: Scroll viewed section into view so user can see it moved there
            setTimeout(() => {
                const viewedLabel = document.getElementById('viewedUpdatesLabel');
                if (viewedLabel && viewedLabel.style.display !== 'none') {
                    try {
                        viewedLabel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } catch(_) {}
                }
            }, 100);
        }
    }, 200);
}

// =============================================
// STATUS ACTION HANDLER - WITH LIFECYCLE GUARD
// =============================================
async function handleStatusAction(action, statusData, button) {
    if (!ensureUIActive(`statusAction:${action}`)) return;
    if (!statusData || !statusData.id) return;
    const core = getCore();
    UILogger.debug('Action', `Status action: ${action}`);
    switch(action) {
        case 'view':
            showStatusGroupViewer([statusData]);
            break;
        case 'pin':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const pinResponse = await core.pinStatus(statusData);
                if (pinResponse && pinResponse.success) {
                    showNotification('Status pinned', 'success');
                    const parent = button.closest('.status-actions');
                    if (parent) {
                        const newBtn = document.createElement('button');
                        newBtn.className = 'status-action-btn warning';
                        newBtn.dataset.action = 'unpin';
                        newBtn.title = 'Unpin Status';
                        newBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
                        newBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            handleStatusAction('unpin', statusData, newBtn);
                        });
                        button.replaceWith(newBtn);
                    }
                    updateCurrentSectionUI();
                }
            } catch (error) {
                showNotification('Failed to pin status', 'error');
            } finally {
                button.disabled = false;
            }
            break;
        case 'unpin':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const unpinResponse = await core.unpinStatus(statusData);
                if (unpinResponse && unpinResponse.success) {
                    showNotification('Status unpinned', 'success');
                    const parent = button.closest('.status-actions');
                    if (parent) {
                        const newBtn = document.createElement('button');
                        newBtn.className = 'status-action-btn';
                        newBtn.dataset.action = 'pin';
                        newBtn.title = 'Pin Status';
                        newBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
                        newBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            handleStatusAction('pin', statusData, newBtn);
                        });
                        button.replaceWith(newBtn);
                    }
                    updateCurrentSectionUI();
                }
            } catch (error) {
                showNotification('Failed to unpin status', 'error');
            } finally {
                button.disabled = false;
            }
            break;
        case 'mute':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const api = window.StatusAPI;
                const muteResponse = api && api.muteUser
                    ? await api.muteUser(statusData.userId)
                    : (core && core.muteUser ? await core.muteUser(statusData.userId) : { success: false });
                if (muteResponse && muteResponse.success) {
                    showNotification('User muted', 'success');
                    const parent = button.closest('.status-actions');
                    if (parent) {
                        const newBtn = document.createElement('button');
                        newBtn.className = 'status-action-btn';
                        newBtn.dataset.action = 'unmute';
                        newBtn.title = 'Unmute User';
                        newBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        newBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            handleStatusAction('unmute', statusData, newBtn);
                        });
                        button.replaceWith(newBtn);
                    }
                    const items = document.querySelectorAll(`.status-item[data-user-id="${statusData.userId}"]`);
                    items.forEach(item => {
                        const muteBtn = item.querySelector('[data-action="mute"]');
                        if (muteBtn) {
                            const newBtn = document.createElement('button');
                            newBtn.className = 'status-action-btn';
                            newBtn.dataset.action = 'unmute';
                            newBtn.title = 'Unmute User';
                            newBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                            muteBtn.replaceWith(newBtn);
                        }
                    });
                    updateCurrentSectionUI();
                }
            } catch (error) {
                showNotification('Failed to mute user', 'error');
            } finally {
                button.disabled = false;
            }
            break;
        case 'unmute':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const api = window.StatusAPI;
                const unmuteResponse = api && api.unmuteUser
                    ? await api.unmuteUser(statusData.userId)
                    : (core && core.unmuteUser ? await core.unmuteUser(statusData.userId) : { success: false });
                if (unmuteResponse && unmuteResponse.success) {
                    showNotification('User unmuted', 'success');
                    const parent = button.closest('.status-actions');
                    if (parent) {
                        const newBtn = document.createElement('button');
                        newBtn.className = 'status-action-btn';
                        newBtn.dataset.action = 'mute';
                        newBtn.title = 'Mute User';
                        newBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                        newBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            handleStatusAction('mute', statusData, newBtn);
                        });
                        button.replaceWith(newBtn);
                    }
                    const items = document.querySelectorAll(`.status-item[data-user-id="${statusData.userId}"]`);
                    items.forEach(item => {
                        const unmuteBtn = item.querySelector('[data-action="unmute"]');
                        if (unmuteBtn) {
                            const newBtn = document.createElement('button');
                            newBtn.className = 'status-action-btn';
                            newBtn.dataset.action = 'mute';
                            newBtn.title = 'Mute User';
                            newBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                            unmuteBtn.replaceWith(newBtn);
                        }
                    });
                    updateCurrentSectionUI();
                }
            } catch (error) {
                showNotification('Failed to unmute user', 'error');
            } finally {
                button.disabled = false;
            }
            break;
    }
}

// =============================================
// BUTTON HANDLER FUNCTIONS - WITH LIFECYCLE GUARD
// =============================================
function handleCreateStatusClick() {
    // FIX: Allow create if session token present, even if lifecycle hasn't reached ACTIVE yet
    const hasToken = (() => {
        try {
            return !!(localStorage.getItem('kynecta_auth') || localStorage.getItem('token') ||
                      localStorage.getItem('moodchat_token') || localStorage.getItem('accessToken'));
        } catch(e) { return false; }
    })();
    if (!ensureUIActive('createStatus') && !hasToken) {
        showNotification('Please wait, connecting...', 'info');
        return;
    }
    const modal = UIElements.createStatusModal;
    if (modal) {
        modal.classList.add('active');
        const textTab = UIElements.querySelector('.create-status-tab[data-tab="text"]');
        if (textTab) textTab.click();
        
        // Load friends into the modal
        populateFriendsInCreateModal();
        
        // Also try to fetch fresh friends list from core
        const core = getCore();
        if (core && core.loadFriendsList) {
            core.loadFriendsList().then(() => {
                syncDataFromCore();
                populateFriendsInCreateModal();
            }).catch(() => {});
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    // Also handle display:flex based modals (highlights-editor uses this)
    if (modal.style.display === 'flex') modal.style.display = 'none';
}

function closeNotification() {
    const notification = UIElements.notification;
    if (notification) notification.classList.remove('active');
}

function handleScheduleClick() {
    if (!ensureUIActive('scheduleStatus')) return;
    // FIX: Don't block on isAuthenticated — the schedule modal itself doesn't need auth
    const modal = UIElements.scheduleModal || document.getElementById('scheduleModal');
    if (modal) modal.classList.add('active');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const scheduleDate = UIElements.getElement('scheduleDate');
    const scheduleTime = UIElements.getElement('scheduleTime');
    if (scheduleDate) {
        scheduleDate.value = tomorrow.toISOString().split('T')[0];
    }
    if (scheduleTime) {
        const hours = tomorrow.getHours().toString().padStart(2, '0');
        const minutes = tomorrow.getMinutes().toString().padStart(2, '0');
        scheduleTime.value = `${hours}:${minutes}`;
    }
    updateScheduledStatusesList();
}

function showScheduleModal() {
    if (!ensureUIActive('showSchedule')) return;
    const modal = UIElements.scheduleModal || document.getElementById('scheduleModal');
    if (!modal) return;
    modal.classList.add('active');
    // Make scheduled list visible
    const schedList = modal.querySelector('#scheduledStatusesList, .schedule-list');
    if (schedList) schedList.classList.add('active');
    updateScheduledStatusesList();
}

function viewMyStatus() {
    if (!ensureUIActive('viewMyStatus')) return;
    if (myStatuses && myStatuses.length > 0) {
        showStatusViewer(myStatuses[0]);
    } else {
        showNotification('You have no statuses yet', 'info');
    }
}

function editMyStatus() {
    if (!ensureUIActive('editStatus')) return;
    if (!isAuthenticated()) {
        showNotification('Please sign in to edit status', 'error');
        return;
    }
    const modal = UIElements.createStatusModal;
    if (modal) modal.classList.add('active');
    if (myStatuses && myStatuses.length > 0) {
        const latest = myStatuses[0];
        const textTab = UIElements.querySelector('.create-status-tab[data-tab="text"]');
        if (textTab) textTab.click();
        const textInput = UIElements.getElement('textStatusInput');
        if (textInput && latest.type === 'text') {
            const txt = latest.content || latest.text || '';
            textInput.value = txt;
            const counter = UIElements.getElement('textStatusCounter');
            if (counter) counter.textContent = `${txt.length}/500`;
        }
    }
}

function clearTextInput() {
    const input = UIElements.getElement('textStatusInput');
    if (input) {
        input.value = '';
        const counter = UIElements.getElement('textStatusCounter');
        if (counter) counter.textContent = '0/500';
    }
}

function addPollOption() {
    const container = UIElements.getElement('pollOptionsContainer');
    if (!container) return;
    const optionCount = container.children.length + 1;
    if (optionCount > 6) {
        showNotification('Maximum 6 options allowed', 'warning');
        return;
    }
    const item = document.createElement('div');
    item.className = 'poll-option-item';
    item.innerHTML = `
        <div class="poll-option-number">${optionCount}</div>
        <div class="poll-option-input-wrapper">
            <input type="text" class="text-input poll-option-input" placeholder="Option ${optionCount}" data-index="${optionCount}" maxlength="100">
            <button class="remove-poll-option" type="button" aria-label="Remove option">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    const removeBtn = item.querySelector('.remove-poll-option');
    removeBtn.addEventListener('click', () => {
        if (container.children.length > 2) {
            item.remove();
            updatePollOptionNumbers();
        } else {
            showNotification('Minimum 2 options required', 'warning');
        }
    });
    container.appendChild(item);
}

function updatePollOptionNumbers() {
    const items = UIElements.querySelectorAll('.poll-option-item');
    items.forEach((item, idx) => {
        const number = item.querySelector('.poll-option-number');
        const input = item.querySelector('.poll-option-input');
        if (number) number.textContent = idx + 1;
        if (input) {
            input.dataset.index = idx + 1;
            input.placeholder = `Option ${idx + 1}`;
        }
    });
}

function handleMuteFromViewer() {
    if (!ensureUIActive('muteFromViewer')) return;
    if (currentViewerStatus) {
        const muteBtn = UIElements.getElement('muteUserBtn');
        if (muteBtn) {
            const action = muteBtn.dataset.action;
            handleStatusAction(action, currentViewerStatus, muteBtn);
        }
    }
}

async function shareCurrentStatus() {
    if (!ensureUIActive('shareStatus')) return;
    if (!currentViewerStatus) return;

    // P2 FIX: First record the in-app share via backend API, then use Web Share / clipboard
    const api = window.StatusAPI;
    if (api && api.shareStatus) {
        api.shareStatus(currentViewerStatus.id, '', 'friends').catch(() => {});
    }

    if (navigator.share) {
        navigator.share({
            title: `Status from ${currentViewerStatus.user?.displayName || 'User'}`,
            text: currentViewerStatus.content || currentViewerStatus.text || 'Check out this status',
            url: window.location.href
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(window.location.href)
            .then(() => showNotification('Link copied to clipboard', 'success'))
            .catch(() => showNotification('Failed to copy link', 'error'));
    }
}

function showReportModal() {
    if (!ensureUIActive('reportStatus')) return;
    if (currentViewerStatus) {
        const modal = UIElements.reportModal;
        if (modal) modal.classList.add('active');
    }
}

async function sendReply() {
    if (!ensureUIActive('sendReply')) return;
    const replyInput = UIElements.getElement('replyInput') || document.getElementById('replyInput');
    const replyText = replyInput ? replyInput.value.trim() : '';
    if (!replyText || !currentViewerStatus) return;

    const sendBtn = UIElements.getElement('sendReplyBtn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        const api = window.StatusAPI;
        if (!api || !api.replyToStatus) {
            showNotification('Reply service unavailable', 'error');
            return;
        }
        const result = await api.replyToStatus(currentViewerStatus.id, replyText);
        if (result && result.success) {
                        replyInput.value = '';
            // Keep viewer open and refocus input so user can type again
            setTimeout(function() { if (replyInput) replyInput.focus(); }, 50); showNotification('Reply sent ✓', 'success');
            // Close the status viewer and open the relevant chat
            const viewer = UIElements.statusViewerPanel;
            if (viewer) viewer.classList.remove('active');
            // If parent window can open chat, use it
            try {
                const ownerId = currentViewerStatus.userId || currentViewerStatus.user?.id;
                if (ownerId && window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'OPEN_CHAT',
                        payload: { userId: ownerId, chatId: result.chatId }
                    }, '*');
                }
            } catch (_) {}
        } else {
            showNotification(result.error || 'Failed to send reply', 'error');
        }
    } catch (error) {
        UILogger.error('Reply', 'Failed to send reply', error);
        showNotification('Failed to send reply', 'error');
    } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
    }
}

function retryConnection() {
    const errorUI = UIElements.errorUI;
    if (errorUI) errorUI.classList.remove('active');
    showNotification('Retrying connection...', 'info');
    const core = getCore();
    if (core && core.bootstrapApplication) {
        core.bootstrapApplication().catch(() => {
            if (errorUI) errorUI.classList.add('active');
        });
    }
}

function enableOfflineMode() {
    const errorUI = UIElements.errorUI;
    if (errorUI) errorUI.classList.remove('active');
    isOfflineMode = true;
    
    const core = getCore();
    if (core && core.loadCachedDataInstantly) {
        core.loadCachedDataInstantly();
    }
    renderStatusListInstantlyUI();
    enableProtectedUI();
}

function retryHandshake() {
    UILogger.info('Handshake', 'Manually retrying handshake');
    const waitingOverlay = document.getElementById('handshakeWaitingOverlay');
    if (waitingOverlay) waitingOverlay.remove();
    showNotification('Attempting to connect...', 'info');
    const lifecycle = getLifecycleState();
    const LifecycleState = getLifecycleStateEnum();
    if (lifecycle && lifecycle.state === LifecycleState.WAIT_PARENT) {
        const core = getCore();
        if (core && core.sendChildReady) {
            core.sendChildReady();
        }
        showNotification('Waiting for parent connection...', 'info');
    } else if (lifecycle && lifecycle.state !== LifecycleState.ACTIVE) {
        const core = getCore();
        if (core && core.initializeModule) {
            core.initializeModule();
        }
        showNotification('Initializing connection...', 'info');
    } else if (lifecycle && lifecycle.state === LifecycleState.ACTIVE) {
        showNotification('Already connected', 'success');
        enableProtectedUI();
    }
}

function loadSelectedDraft() {
    if (!ensureUIActive('loadDraft')) return;
    if (selectedDraft) {
        loadDraft(selectedDraft);
    }
}

// =============================================
// NOTIFICATION SYSTEM
// =============================================
let notificationTimeout = null;

function showNotification(message, type = 'success') {
    const notification = UIElements.notification;
    const notificationText = UIElements.getElement('notificationText');
    if (!notification || !notificationText) return;
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('active');
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }
    notificationTimeout = setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

// =============================================
// UI PROTECTION FUNCTIONS
// =============================================
function enableProtectedUI() {
    const protectedElements = [
        'createStatusBtn', 'viewMyStatusBtn', 'editMyStatusBtn',
        'viewHighlightsBtn', 'createHighlightBtn', 'viewTimelineBtn',
        'viewStatsBtn', 'viewDraftsBtn', 'viewScheduledBtn',
        'myStatusPreview', 'postStatusBtn', 'saveDraftBtn', 'scheduleStatusBtn',
        'shareStatusBtn', 'saveStatusBtn', 'reportStatusBtn'
    ];
    protectedElements.forEach(id => {
        const el = UIElements.getElement(id);
        if (el) {
            el.disabled = false;
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.removeAttribute('aria-disabled');
            UIFailsafe.disabledButtons.delete(id);
        }
    });
}

function disableProtectedUI() {
    const protectedElements = [
        'createStatusBtn', 'viewMyStatusBtn', 'editMyStatusBtn',
        'viewHighlightsBtn', 'createHighlightBtn', 'viewTimelineBtn',
        'viewStatsBtn', 'viewDraftsBtn', 'viewScheduledBtn',
        'myStatusPreview', 'postStatusBtn', 'saveDraftBtn', 'scheduleStatusBtn',
        'shareStatusBtn', 'saveStatusBtn', 'reportStatusBtn'
    ];
    protectedElements.forEach(id => {
        const el = UIElements.getElement(id);
        if (el) {
            el.disabled = true;
            el.style.opacity = '0.5';
            el.style.pointerEvents = 'none';
            el.setAttribute('aria-disabled', 'true');
        }
    });
}

function showLogoutState() {
    const allStatusList = UIElements.allStatusList;
    if (allStatusList) {
        allStatusList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sign-out-alt"></i>
                <p>Signed out</p>
                <p class="subtext">Please sign in to view and create statuses</p>
            </div>
        `;
    }
    const myStatusPreview = UIElements.getElement('myStatusPreview');
    if (myStatusPreview) {
        myStatusPreview.innerHTML = `
            <div class="my-status-preview-placeholder">
                <i class="fas fa-user-circle"></i>
                <p>Sign in to create status</p>
            </div>
        `;
    }
    disableProtectedUI();
}

function showReconnectionState() {
    const allStatusList = UIElements.allStatusList;
    if (allStatusList) {
        allStatusList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-unlink"></i>
                <p>Loading statuses...</p>
                <p class="subtext">Your content will appear shortly.</p>
            </div>
        `;
    }
}

// =============================================
// UPDATE CURRENT SECTION
// =============================================
function updateCurrentSectionUI() {
    try {
        const activeTab = UIElements.querySelector('.category-btn.active');
        if (!activeTab) return;
        const sectionMap = {
            'allTab': 'allStatusSection',
            'friendsTab': 'friendsStatusSection',
            'closeFriendsTab': 'closeFriendsStatusSection',
            'pinnedTab': 'pinnedStatusSection',
            'mutedTab': 'mutedStatusSection',
            'microCirclesTab': 'microCirclesStatusSection',
            'myStatusTab': 'myStatusSection'
        };
        const tabId = activeTab.id;
        const sectionId = sectionMap[tabId];
        if (sectionId) {
            const section = UIElements.getElement(sectionId);
            if (section) {
                document.querySelectorAll('.statuses-section').forEach(s => s.classList.remove('active'));
                section.classList.add('active');
                renderSectionContent(sectionId);
                UIStateManager.saveFilters();
            }
        }
    } catch (error) {
        logUIError('updateCurrentSectionUI', error);
    }
}

function renderSectionContent(sectionId) {
    let container, data;
    switch(sectionId) {
        case 'allStatusSection':
            container = UIElements.allStatusList;
            // Merge friend statuses with own statuses, excluding own from friends list
            {
                const _currentUid = String((window.currentUser && (window.currentUser.id || window.currentUser.userId)) || '');
                const _friendOnly = Array.isArray(friendsStatuses)
                    ? friendsStatuses.filter(s => {
                        const _ownerId = String(s.userId || s.user_id || (s.user && s.user.id) || '');
                        return !_currentUid || _ownerId !== _currentUid;
                    })
                    : [];
                data = filterStatusesByPrivacy(_friendOnly);
            }
            break;
        case 'friendsStatusSection':
            container = UIElements.friendsStatusList;
            data = filterStatusesByType('friends');
            break;
        case 'closeFriendsStatusSection':
            container = UIElements.closeFriendsStatusList;
            data = filterStatusesByType('close-friends');
            break;
        case 'pinnedStatusSection':
            container = UIElements.pinnedStatusList;
            data = pinnedStatuses;
            break;
        case 'mutedStatusSection':
            container = UIElements.mutedStatusList;
            data = filterStatusesByType('muted');
            break;
        case 'microCirclesStatusSection':
            container = UIElements.microCirclesStatusList;
            data = filterStatusesByType('micro-circle');
            break;
        case 'myStatusSection':
            container = UIElements.myStatusList;
            data = myStatuses;
            break;
    }
    if (container) {
        renderStatusesListUI(container, data);
    }
}

function renderStatusesListUI(container, statusesList, allViewed) {
    if (!container) return;
    let filtered = Array.isArray(statusesList) ? [...statusesList] : [];
    if (currentIntentFilter) {
        filtered = filtered.filter(s => s.intent === currentIntentFilter);
    }
    if (currentMoodFilter) {
        filtered = filtered.filter(s => s.mood === currentMoodFilter);
    }
    if (activeFilters && activeFilters.size > 0) {
        filtered = filtered.filter(s => {
            return Array.from(activeFilters).every(filter => {
                if (filter.startsWith('intent-')) return s.intent === filter.replace('intent-', '');
                if (filter.startsWith('mood-')) return s.mood === filter.replace('mood-', '');
                return true;
            });
        });
    }
    if (filtered.length === 0) {
        // FIX: Don't show skeleton for the viewed section — just empty it
        // Skeletons in viewed section make it look like content disappeared
        container.innerHTML = '';
        return;
    }

    // ── Group statuses by userId (WhatsApp-style) ──────────────────────────
    const groupMap = new Map();
    filtered.forEach(status => {
        const uid = String(status.userId || status.user?.id || 'unknown');
        if (!groupMap.has(uid)) groupMap.set(uid, []);
        groupMap.get(uid).push(status);
    });

    // Sort each group newest-first, then sort groups by their most-recent status
    groupMap.forEach(statuses => statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    const sortedGroups = Array.from(groupMap.entries())
        .sort((a, b) => new Date(b[1][0].createdAt) - new Date(a[1][0].createdAt));

    const fragment = document.createDocumentFragment();
    sortedGroups.forEach(([uid, statuses]) => {
        const el = createGroupedStatusElement(statuses, allViewed);
        if (el) fragment.appendChild(el);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
    // Bind immediately + short delay for any async renders
    bindGroupedStatusHandlers(container);
    setTimeout(() => bindGroupedStatusHandlers(container), 100);

    // Show "Recent updates" label when there are friend statuses
    const recentLabel = document.getElementById('recentUpdatesLabel');
    if (recentLabel) recentLabel.style.display = fragment.childElementCount > 0 ? '' : 'none';
}

// Create one list item that represents all statuses from one user
function createGroupedStatusElement(statuses, allViewedOverride) {
    if (!statuses || !statuses.length) return null;
    const first = statuses[0];
    const user = first.statusUser || first.user || {};
    const total = statuses.length;
    const viewedCount = statuses.filter(s =>
        viewedStatuses?.has(String(s.id)) || viewedStatuses?.has(Number(s.id))
    ).length;
    // allViewedOverride = entire section is "viewed updates" → force dim style
    const fullyViewed = allViewedOverride || (viewedCount === total);
    const timeAgo = first.createdAt ? formatTimeAgo(first.createdAt) : 'Just now';

    // Build display name from multiple possible fields
    const firstName   = user.firstName || '';
    const lastName    = user.lastName  || '';
    const displayName = user.displayName || (firstName + ' ' + lastName).trim() || user.username || 'Unknown';
    const initials    = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || '?';
    const avatarUrl   = user.photoURL || user.avatar || user.profilePicture || '';

    const item = document.createElement('div');
    item.className = 'status-group-item' + (fullyViewed ? ' status-viewed' : '');
    item.dataset.userId    = String(first.userId || first.user_id || user.id || '');
    item.dataset.statusIds = statuses.map(s => String(s.id)).join(',');

    // ── SVG segmented ring — each segment = one status ────────────────────
    // Unviewed segments: #00a884 (green). Viewed segments: rgba(255,255,255,0.22) (dim white).
    const R  = 22;   // radius
    const CX = 26, CY = 26;
    const STROKE = 2.4;
    const GAP_DEG = total > 1 ? 5 : 0;
    const CIRC = 2 * Math.PI * R;
    const segDeg = (360 - GAP_DEG * total) / total;
    const segArc = (segDeg / 360) * CIRC;

    let segs = '';
    for (let i = 0; i < total; i++) {
        const sv = allViewedOverride ||
            viewedStatuses?.has(String(statuses[i].id)) ||
            viewedStatuses?.has(Number(statuses[i].id));
        const color  = sv ? 'rgba(255,255,255,0.28)' : '#00a884';
        const rot    = -90 + i * (segDeg + GAP_DEG);
        const offset = -(rot / 360) * CIRC + CIRC * 0.25;
        segs += `<circle cx="${CX}" cy="${CY}" r="${R}"
            fill="none" stroke="${color}" stroke-width="${STROKE}"
            stroke-dasharray="${segArc} ${CIRC - segArc}"
            stroke-dashoffset="${offset}"
            transform="rotate(${rot},${CX},${CY})"/>`;
    }
    const ringSvg = `<svg viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg"
        style="position:absolute;inset:-4px;width:calc(100%+8px);height:calc(100%+8px);pointer-events:none;z-index:2;">${segs}</svg>`;

    const avatarBg = avatarUrl
        ? `background-image:url('${avatarUrl}');background-size:cover;background-position:center;`
        : '';

    item.innerHTML = `
        <div class="status-group-avatar" style="position:relative;">
            ${ringSvg}
            <div class="status-group-avatar-inner" style="${avatarBg}${fullyViewed ? 'opacity:0.7;' : ''}">
                ${avatarUrl ? '' : `<span>${initials}</span>`}
            </div>
            ${total > 1 ? `<div class="status-group-count">${total}</div>` : ''}
        </div>
        <div class="status-group-info" style="${fullyViewed ? 'opacity:0.65;' : ''}">
            <div class="status-group-name">${displayName}</div>
            <div class="status-group-meta">${timeAgo}${total > 1 ? ` · ${total} updates` : ''}</div>
        </div>
    `;
    return item;
}

// Bind click handlers on grouped items
function bindGroupedStatusHandlers(container) {
    container.querySelectorAll('.status-group-item').forEach(item => {
        // Always reassign onclick — never use _bound flag so re-renders get fresh handlers
        item._bound = true;
        item.onclick = function() {
            const ids = (item.dataset.statusIds || '').split(',').filter(Boolean);
            if (!ids.length) return;

            // ── Build pool from ALL sources including friendsStatuses ──────
            const core = getCore();
            const pool = [
                // Own statuses from core
                ...(core && core !== window && typeof core.getStatuses === 'function' ? (core.getStatuses() || []) : []),
                // Friend statuses from core
                ...(core && core !== window && typeof core.getFriendsStatuses === 'function' ? (core.getFriendsStatuses() || []) : []),
                // Module-level arrays (always check these — they are the primary store)
                ...(Array.isArray(friendsStatuses) ? friendsStatuses : []),
                ...(Array.isArray(myStatuses)      ? myStatuses      : []),
                ...(Array.isArray(statuses)        ? statuses        : []),
                // statusState backup
                ...(typeof statusState !== 'undefined' && Array.isArray(statusState.statuses) ? statusState.statuses : []),
            ];

            // Deduplicate by id
            const seen = new Set();
            const unique = pool.filter(s => {
                if (!s || s.id == null) return false;
                const k = String(s.id);
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });

            const group = ids
                .map(id => unique.find(st => String(st.id) === String(id)))
                .filter(Boolean);

            if (group.length) {
                showStatusGroupViewer(group);
                return;
            }

            // ── Fallback: fetch from API by id then open ──────────────────
            const api = window.StatusAPI;
            if (api && api.getStatus) {
                Promise.all(ids.map(id => api.getStatus(id).catch(() => null)))
                    .then(results => {
                        const fetched = results
                            .map(r => r && (r.status || r.data || r))
                            .filter(s => s && s.id);
                        if (fetched.length) {
                            // Cache into friendsStatuses so next click is instant
                            fetched.forEach(s => {
                                const sid = String(s.id);
                                if (!friendsStatuses.find(f => String(f.id) === sid)) {
                                    friendsStatuses.push(s);
                                }
                            });
                            showStatusGroupViewer(fetched);
                        }
                    })
                    .catch(() => {});
                return;
            }

            // Last resort: refresh friend statuses and retry once
            if (typeof _fetchFriendStatusesDirect === 'function') {
                _fetchFriendStatusesDirect().then && _fetchFriendStatusesDirect();
                setTimeout(() => {
                    const retry = ids
                        .map(id => [...friendsStatuses, ...statuses].find(s => String(s.id) === String(id)))
                        .filter(Boolean);
                    if (retry.length) showStatusGroupViewer(retry);
                }, 800);
            }
        };
    });
}

// =============================================
// BASIC EVENT LISTENERS SETUP
// =============================================
function setupBasicEventListeners() {
    // ── Delegated click handler on allStatusList ──────────────────────────
    // This survives DOM re-renders: we listen on the stable container,
    // not on individual items which get replaced on each render.
    const allStatusList = document.getElementById('allStatusList');
    if (allStatusList && !allStatusList._delegateBound) {
        allStatusList._delegateBound = true;
        allStatusList.addEventListener('click', function(e) {
            const item = e.target.closest('.status-group-item');
            if (!item) return;
            e.stopPropagation();

            const ids = (item.dataset.statusIds || '').split(',').filter(Boolean);
            if (!ids.length) {
                console.warn('[status-ui] clicked status item has no statusIds dataset', item);
                return;
            }

            console.log('[status-ui] Status item clicked, ids:', ids);

            // Search every pool for these IDs
            const core = getCore();
            const pool = [
                ...(Array.isArray(friendsStatuses) ? friendsStatuses : []),
                ...(Array.isArray(myStatuses)      ? myStatuses      : []),
                ...(Array.isArray(statuses)        ? statuses        : []),
                ...(typeof statusState !== 'undefined' && Array.isArray(statusState.statuses) ? statusState.statuses : []),
                ...(core && core !== window && typeof core.getStatuses === 'function' ? (core.getStatuses() || []) : []),
                ...(core && core !== window && typeof core.getFriendsStatuses === 'function' ? (core.getFriendsStatuses() || []) : []),
            ];
            const seen = new Set();
            const unique = pool.filter(s => {
                if (!s || s.id == null) return false;
                const k = String(s.id);
                if (seen.has(k)) return false;
                seen.add(k); return true;
            });
            console.log('[status-ui] Pool size:', unique.length, '| Looking for:', ids);
            const group = ids.map(id => unique.find(s => String(s.id) === String(id))).filter(Boolean);

            if (group.length) {
                console.log('[status-ui] Opening viewer with', group.length, 'status(es)');
                showStatusGroupViewer(group);
                return;
            }

            console.warn('[status-ui] Status not found in pool — fetching from API for ids:', ids);
            // Fallback: fetch directly from API by id
            const api = window.StatusAPI;
            if (api && api.getStatus) {
                Promise.all(ids.map(id => api.getStatus(id).catch(() => null)))
                    .then(results => {
                        const fetched = results
                            .map(r => r && (r.status || r.data || r))
                            .filter(s => s && s.id);
                        if (fetched.length) {
                            fetched.forEach(s => {
                                const sid = String(s.id);
                                if (!friendsStatuses.find(f => String(f.id) === sid)) friendsStatuses.push(s);
                            });
                            showStatusGroupViewer(fetched);
                        } else {
                            console.error('[status-ui] API returned no status data for ids:', ids);
                        }
                    }).catch(err => console.error('[status-ui] API fetch failed:', err));
            } else if (typeof _fetchFriendStatusesDirect === 'function') {
                _fetchFriendStatusesDirect();
                setTimeout(() => {
                    const retry = ids.map(id =>
                        [...friendsStatuses, ...statuses].find(s => String(s.id) === String(id))
                    ).filter(Boolean);
                    if (retry.length) showStatusGroupViewer(retry);
                    else console.error('[status-ui] Still no status found after refresh for ids:', ids);
                }, 800);
            }
        });
    }

    // FIX: was '.category-tabs' — HTML uses '.status-categories'
    const categoryContainer = document.querySelector('.status-categories');
    if (categoryContainer && !categoryContainer._hasListener) {
        categoryContainer._hasListener = true;
        categoryContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.category-btn');
            if (!tab) return;
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            tab.classList.add('active');
            updateCurrentSectionUI();
            UIStateManager.set('currentTab', tab.id);
        });
    }

    // FIX: Also bind each tab individually as a robust fallback
    ['allTab','friendsTab','closeFriendsTab','pinnedTab','mutedTab','microCirclesTab','myStatusTab'].forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab && !tab._tabDirectBound) {
            tab._tabDirectBound = true;
            tab.addEventListener('click', () => {
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                tab.classList.add('active');
                updateCurrentSectionUI();
                UIStateManager.set('currentTab', tab.id);
            });
        }
    });

    // FIX: Bind quick-action buttons directly
    const viewTimelineBtn = document.getElementById('viewTimelineBtn');
    if (viewTimelineBtn && !viewTimelineBtn._directBound) {
        viewTimelineBtn._directBound = true;
        viewTimelineBtn.addEventListener('click', () => {
            if (typeof showMemoryTimelineModal === 'function') showMemoryTimelineModal();
        });
    }
    const viewStatsBtn = document.getElementById('viewStatsBtn');
    if (viewStatsBtn && !viewStatsBtn._directBound) {
        viewStatsBtn._directBound = true;
        viewStatsBtn.addEventListener('click', () => {
            if (typeof showStatsModal === 'function') showStatsModal();
        });
    }
    const viewScheduledBtn = document.getElementById('viewScheduledBtn');
    if (viewScheduledBtn && !viewScheduledBtn._directBound) {
        viewScheduledBtn._directBound = true;
        viewScheduledBtn.addEventListener('click', () => {
            if (typeof showScheduleModal === 'function') showScheduleModal();
        });
    }
    const createStatusBtn = document.getElementById('createStatusBtn');
    if (createStatusBtn && !createStatusBtn._directBound) {
        createStatusBtn._directBound = true;
        createStatusBtn.addEventListener('click', handleCreateStatusClick);
    }
    // FIX: Direct bindings for header buttons that must always work
    const viewHighlightsBtnDirect = document.getElementById('viewHighlightsBtn');
    if (viewHighlightsBtnDirect && !viewHighlightsBtnDirect._directBound) {
        viewHighlightsBtnDirect._directBound = true;
        viewHighlightsBtnDirect.addEventListener('click', showHighlightsModal);
    }
    const viewDraftsBtnDirect = document.getElementById('viewDraftsBtn');
    if (viewDraftsBtnDirect && !viewDraftsBtnDirect._directBound) {
        viewDraftsBtnDirect._directBound = true;
        viewDraftsBtnDirect.addEventListener('click', showDraftsModal);
    }
    // FIX: Cancel button in create status modal
    const closeCreateStatusModalBtn = document.getElementById('closeCreateStatusModal');
    if (closeCreateStatusModalBtn && !closeCreateStatusModalBtn._directBound) {
        closeCreateStatusModalBtn._directBound = true;
        closeCreateStatusModalBtn.addEventListener('click', () => closeModal('createStatusModal'));
    }

    // Cancel button in footer (added alongside Save Draft / Post Status / Schedule)
    const cancelCreateStatusBtn = document.getElementById('cancelCreateStatusBtn');
    if (cancelCreateStatusBtn && !cancelCreateStatusBtn._directBound) {
        cancelCreateStatusBtn._directBound = true;
        cancelCreateStatusBtn.addEventListener('click', () => closeModal('createStatusModal'));
    }
    // FIX: Post Status, Save Draft, Schedule Status direct bindings (belt-and-suspenders)
    const postStatusBtnDirect = document.getElementById('postStatusBtn');
    if (postStatusBtnDirect && !postStatusBtnDirect._directBound) {
        postStatusBtnDirect._directBound = true;
        postStatusBtnDirect.addEventListener('click', handlePostStatus);
    }
    const saveDraftBtnDirect = document.getElementById('saveDraftBtn');
    if (saveDraftBtnDirect && !saveDraftBtnDirect._directBound) {
        saveDraftBtnDirect._directBound = true;
        saveDraftBtnDirect.addEventListener('click', handleSaveDraft);
    }
    const scheduleStatusBtnDirect = document.getElementById('scheduleStatusBtn');
    if (scheduleStatusBtnDirect && !scheduleStatusBtnDirect._directBound) {
        scheduleStatusBtnDirect._directBound = true;
        scheduleStatusBtnDirect.addEventListener('click', handleScheduleClick);
    }
    // FIX: Schedule modal confirm/cancel
    const confirmScheduleBtnDirect = document.getElementById('confirmScheduleBtn');
    if (confirmScheduleBtnDirect && !confirmScheduleBtnDirect._directBound) {
        confirmScheduleBtnDirect._directBound = true;
        confirmScheduleBtnDirect.addEventListener('click', handleConfirmSchedule);
    }
    const cancelScheduleBtnDirect = document.getElementById('cancelScheduleBtn');
    if (cancelScheduleBtnDirect && !cancelScheduleBtnDirect._directBound) {
        cancelScheduleBtnDirect._directBound = true;
        cancelScheduleBtnDirect.addEventListener('click', () => closeModal('scheduleModal'));
    }
    // FIX: Cancel/close buttons for highlights, drafts
    const closeHighlightsModalDirect = document.getElementById('closeHighlightsModal');
    if (closeHighlightsModalDirect && !closeHighlightsModalDirect._directBound) {
        closeHighlightsModalDirect._directBound = true;
        closeHighlightsModalDirect.addEventListener('click', () => closeModal('highlightsModal'));
    }
    const closeDraftsModalDirect = document.getElementById('closeDraftsModal');
    if (closeDraftsModalDirect && !closeDraftsModalDirect._directBound) {
        closeDraftsModalDirect._directBound = true;
        closeDraftsModalDirect.addEventListener('click', () => closeModal('draftsModal'));
    }
    // FIX: Stats modal cancel and export
    const cancelStatsModalBtn = document.getElementById('cancelStatsModalBtn');
    if (cancelStatsModalBtn && !cancelStatsModalBtn._directBound) {
        cancelStatsModalBtn._directBound = true;
        cancelStatsModalBtn.addEventListener('click', () => closeModal('statsModal'));
    }
    const exportAnalyticsBtn = document.getElementById('exportAnalyticsBtn');
    if (exportAnalyticsBtn && !exportAnalyticsBtn._directBound) {
        exportAnalyticsBtn._directBound = true;
        exportAnalyticsBtn.addEventListener('click', exportTimeline);
    }
    const createStatusTabs = document.querySelector('.create-status-tabs');
    if (createStatusTabs && !createStatusTabs._hasListener) {
        createStatusTabs._hasListener = true;
        createStatusTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.create-status-tab');
            if (!tab) return;
            const tabName = tab.dataset.tab;
            UIElements.querySelectorAll('.create-status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            UIElements.querySelectorAll('.create-status-tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = UIElements.getElement(`${tabName}Tab`);
            if (tabContent) tabContent.classList.add('active');
        });
    }
    const textStatusInput = UIElements.getElement('textStatusInput');
    if (textStatusInput && !textStatusInput._hasListener) {
        textStatusInput._hasListener = true;
        textStatusInput.addEventListener('input', function() {
            const counter = UIElements.getElement('textStatusCounter');
            if (counter) {
                const length = this.value.length;
                counter.textContent = `${length}/500`;
                counter.style.color = length > 500 ? 'var(--danger-color)' : 'var(--text-secondary)';
            }
        });
    }
// REMOVED: duplicate conflicting button bindings (see UIFailsafe._ensureHandler for canonical bindings)

    const mediaUploadArea = UIElements.getElement('mediaUploadArea');
    const mediaFileInput = UIElements.getElement('mediaFileInput');
    if (mediaUploadArea && !mediaUploadArea._hasListener) {
        mediaUploadArea._hasListener = true;
        mediaUploadArea.addEventListener('click', () => mediaFileInput.click());
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
                handleMediaUpload({ target: { files: Array.from(e.dataTransfer.files) } });
            }
        });
    }
    if (mediaFileInput && !mediaFileInput._hasListener) {
        mediaFileInput._hasListener = true;
        mediaFileInput.addEventListener('change', handleMediaUpload);
    }
    const myStatusPreview = UIElements.getElement('myStatusPreview');
    if (myStatusPreview && !myStatusPreview._hasListener) {
        myStatusPreview._hasListener = true;
        myStatusPreview.addEventListener('click', () => {
            if (!ensureUIActive('myStatusPreview')) return;
            if (myStatuses && myStatuses.length > 0) {
                // Open ALL own statuses as a group (WhatsApp-style)
                showStatusGroupViewer([...myStatuses]);
            } else {
                if (!isAuthenticated()) {
                    showNotification('Please sign in to create a status', 'error');
                    return;
                }
                const modal = UIElements.createStatusModal;
                if (modal) modal.classList.add('active');
            }
        });
    }
    const savedTab = UIStateManager.get('currentTab');
    if (savedTab) {
        const tab = UIElements.getElement(savedTab);
        if (tab) tab.click();
    }
    UIStateManager.restoreFilters();
}

// =============================================
// COMPLETE EVENT LISTENERS
// =============================================
function setupEventListeners() {
    setupBasicEventListeners();
    // FIX: The bottom filter buttons (Feedback/Achievement/Advice/Happy/Motivated) live inside
    // .status-categories containers, NOT .filter-buttons. Delegate on every .status-categories.
    document.querySelectorAll('.status-categories').forEach(function(filterContainer) {
        if (filterContainer._filterBound) return;
        filterContainer._filterBound = true;
        filterContainer.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-filter]');
            if (!btn) return;
            const filter = btn.dataset.filter;
            // Toggle active state
            filterContainer.querySelectorAll('[data-filter]').forEach(function(b) {
                b.classList.toggle('active', b === btn);
            });
            let label = '';
            if (filter.startsWith('intent-')) {
                const key = filter.replace('intent-', '');
                label = (typeof statusIntents !== 'undefined' && statusIntents[key]) ? statusIntents[key].name : key;
            } else if (filter.startsWith('mood-')) {
                const key = filter.replace('mood-', '');
                label = (typeof statusMoods !== 'undefined' && statusMoods[key]) ? statusMoods[key].name : key;
            }
            if (label) addFilterTag(filter, label);
        });
    });
    const clearFiltersBtn = UIElements.getElement('clearFiltersBtn');
    if (clearFiltersBtn && !clearFiltersBtn._hasListener) {
        clearFiltersBtn._hasListener = true;
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }
    const viewerBackBtn = UIElements.getElement('viewerBackBtn');
    if (viewerBackBtn && !viewerBackBtn._hasListener) {
        viewerBackBtn._hasListener = true;
        viewerBackBtn.addEventListener('click', closeViewer);
    }
    const pauseResumeBtn = UIElements.getElement('pauseResumeBtn');
    if (pauseResumeBtn && !pauseResumeBtn._hasListener) {
        pauseResumeBtn._hasListener = true;
        pauseResumeBtn.addEventListener('click', toggleAutoAdvance);
    }
    const reportDetails = UIElements.getElement('reportDetails');
    if (reportDetails && !reportDetails._hasListener) {
        reportDetails._hasListener = true;
        reportDetails.addEventListener('input', function() {
            const counter = UIElements.getElement('reportDetailsCounter');
            if (counter) {
                const length = this.value.length;
                counter.textContent = `${length}/500`;
            }
            updateReportSubmitButton();
        });
    }
    const replyInput = UIElements.getElement('replyInput');
    if (replyInput && !replyInput._hasListener) {
        replyInput._hasListener = true;
        replyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const btn = UIElements.getElement('sendReplyBtn');
                if (btn) btn.click();
            }
        });
    }
    const allDraftsList = UIElements.getElement('allDraftsList');
    if (allDraftsList && !allDraftsList._hasListener) {
        allDraftsList._hasListener = true;
        allDraftsList.addEventListener('click', (e) => {
            const draftItem = e.target.closest('.draft-item');
            if (!draftItem) return;
            const draftId = draftItem.dataset.draftId;
            const draft = drafts.find(d => d.id === draftId);
            if (!draft) return;
            if (e.target.closest('.draft-action-btn')) {
                const btn = e.target.closest('.draft-action-btn');
                const action = btn.dataset.action;
                handleDraftAction(action, draft);
            } else {
                draftItem.classList.toggle('selected');
                if (draftItem.classList.contains('selected')) {
                    selectedDraft = draft;
                    const loadBtn = UIElements.getElement('loadDraftBtn');
                    if (loadBtn) loadBtn.disabled = false;
                } else {
                    selectedDraft = null;
                    const loadBtn = UIElements.getElement('loadDraftBtn');
                    if (loadBtn) loadBtn.disabled = true;
                }
            }
        });
    }
        // Wire intent buttons (Feedback, Achievement, Advice, Happy, Motivated) in create status form
    const intentContainers = document.querySelectorAll('.intent-options, .intent-grid');
    intentContainers.forEach(function(container) {
        if (container._intentBound) return;
        container._intentBound = true;
        container.addEventListener('click', function(e) {
            const btn = e.target.closest('.intent-option');
            if (!btn) return;
            container.querySelectorAll('.intent-option').forEach(function(b) { 
                b.classList.remove('selected', 'active'); 
            });
            btn.classList.add('selected', 'active');
            // Store selected intent for postStatus to pick up
            const intentInput = document.getElementById('selectedIntent');
            if (intentInput) intentInput.value = btn.dataset.intent || '';
        });
    });
    const scheduledStatusesList = UIElements.getElement('scheduledStatusesList');
    if (scheduledStatusesList && !scheduledStatusesList._hasListener) {
        scheduledStatusesList._hasListener = true;
        scheduledStatusesList.addEventListener('click', (e) => {
            const cancelBtn = e.target.closest('.cancel-btn');
            if (!cancelBtn) return;
            const scheduleItem = cancelBtn.closest('.schedule-item');
            if (!scheduleItem) return;
            const scheduleId = scheduleItem.dataset.scheduleId;
            if (scheduleId) {
                cancelScheduledStatus(scheduleId);
            }
        });
    }
    UILogger.debug('Events', 'All event listeners configured');
}

// =============================================
// UI COMPONENTS INITIALIZATION
// =============================================
function initializeUIComponents() {
    if (UIElements.getElement('emojiGrid')) initializeEmojiPicker();
    if (UIElements.getElement('backgroundGrid')) initializeBackgroundOptions();
    if (UIElements.getElement('intentOptions')) initializeIntentOptions();
    if (UIElements.getElement('moodOptions')) initializeMoodOptions();
    if (UIElements.getElement('categoryOptions')) initializeCategoryOptions();
    if (UIElements.getElement('actionButtonsSelector')) initializeActionButtonsSelector();
    if (UIElements.getElement('privacyOptions')) initializePrivacyOptions();
    if (UIElements.getElement('durationOptions')) initializeDurationOptions();
    if (UIElements.getElement('templateOptions')) initializeTemplateOptions();
    if (UIElements.getElement('reportReasons')) initializeReportReasons();
    if (UIElements.getElement('reactionsContainer')) initializeReactions();
    if (UIElements.getElement('pollOptionsContainer')) initializePollOptions();
    if (UIElements.getElement('highlightColorGrid')) initializeHighlightColorOptions();
    if (UIElements.getElement('highlightPrivacyOptions')) initializeHighlightPrivacyOptions();
    if (UIElements.getElement('repeatOptions')) initializeRepeatOptions();
    UILogger.debug('Components', 'UI components initialized');
}

function initializeEmojiPicker() {
    const grid = UIElements.getElement('emojiGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const commonEmojis = ['😊', '😂', '🥰', '😍', '🤩', '😎', '🤔', '😴', '🥳', '😢', '😠', '👍', '❤️', '🔥', '✨', '🎉'];
    commonEmojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.type = 'button';
        btn.setAttribute('aria-label', `Add emoji ${emoji}`);
        btn.addEventListener('click', () => {
            const input = UIElements.getElement('textStatusInput');
            if (input) {
                input.value += emoji;
                input.focus();
                const counter = UIElements.getElement('textStatusCounter');
                if (counter) counter.textContent = `${input.value.length}/500`;
            }
        });
        grid.appendChild(btn);
    });
}

function initializeBackgroundOptions() {
    const grid = UIElements.getElement('backgroundGrid');
    if (!grid) return;
    grid.innerHTML = '';
    backgroundOptions.forEach(bg => {
        const option = document.createElement('div');
        option.className = 'background-option';
        option.dataset.bg = bg.id;
        option.dataset.type = bg.type;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.setAttribute('aria-label', `Background ${bg.id}`);
        if (bg.type === 'solid') {
            option.style.backgroundColor = bg.color;
            option.textContent = 'A';
        } else if (bg.type === 'gradient') {
            option.style.background = bg.gradient;
            option.textContent = 'G';
        }
        option.addEventListener('click', () => {
            grid.querySelectorAll('.background-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        grid.appendChild(option);
    });
    const first = grid.querySelector('.background-option');
    if (first) first.classList.add('selected');
}

function initializeIntentOptions() {
    const container = UIElements.getElement('intentOptions');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(statusIntents).forEach(([key, intent]) => {
        const option = document.createElement('div');
        option.className = 'intent-option';
        option.dataset.intent = key;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.innerHTML = `
            <div class="intent-icon" style="color: ${intent.color}">
                <i class="${intent.icon}"></i>
            </div>
            <div class="intent-name">${intent.name}</div>
        `;
        option.addEventListener('click', () => {
            container.querySelectorAll('.intent-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        container.appendChild(option);
    });
}

function initializeMoodOptions() {
    const container = UIElements.getElement('moodOptions');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(statusMoods).forEach(([key, mood]) => {
        const option = document.createElement('div');
        option.className = `mood-option ${key}`;
        option.dataset.mood = key;
        option.textContent = mood.emoji;
        option.title = mood.name;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.setAttribute('aria-label', mood.name);
        option.addEventListener('click', () => {
            container.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        container.appendChild(option);
    });
}

function initializeCategoryOptions() {
    const container = UIElements.getElement('categoryOptions');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(statusCategories).forEach(([key, category]) => {
        const option = document.createElement('div');
        option.className = 'category-option';
        option.dataset.category = key;
        option.textContent = category.name;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.addEventListener('click', () => {
            container.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        container.appendChild(option);
    });
}

function initializeActionButtonsSelector() {
    const container = UIElements.getElement('actionButtonsSelector');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(actionButtons).forEach(([key, button]) => {
        const option = document.createElement('div');
        option.className = 'action-button-option';
        option.dataset.action = key;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.setAttribute('aria-label', button.name);
        option.innerHTML = `
            <div style="font-size: 20px; margin-bottom: 8px; color: ${button.color}">
                <i class="${button.icon}"></i>
            </div>
            <div style="font-size: 12px;">${button.name}</div>
        `;
        option.addEventListener('click', () => {
            option.classList.toggle('selected');
        });
        container.appendChild(option);
    });
}

function initializePrivacyOptions() {
    const container = UIElements.getElement('privacyOptions');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(privacySettings).forEach(([key, privacy]) => {
        const option = document.createElement('div');
        option.className = 'privacy-option';
        option.dataset.privacy = key;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.innerHTML = `
            <div class="privacy-icon">
                <i class="${privacy.icon}"></i>
            </div>
            <div class="privacy-details">
                <div class="privacy-name">${privacy.name}</div>
                <div class="privacy-description">${privacy.description}</div>
            </div>
        `;
        option.addEventListener('click', () => {
            container.querySelectorAll('.privacy-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        container.appendChild(option);
    });
    const friends = container.querySelector('[data-privacy="friends"]');
    if (friends) friends.classList.add('selected');
}

function initializeDurationOptions() {
    const container = UIElements.getElement('durationOptions');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(durationOptions).forEach(([key, text]) => {
        const option = document.createElement('div');
        option.className = 'duration-option';
        option.dataset.duration = key;
        option.textContent = text;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.addEventListener('click', () => {
            container.querySelectorAll('.duration-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        container.appendChild(option);
    });
    const day = container.querySelector('[data-duration="86400"]');
    if (day) day.classList.add('selected');
}

function initializeTemplateOptions() {
    const container = UIElements.getElement('templateOptions');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(statusTemplates).forEach(([key, template]) => {
        const option = document.createElement('div');
        option.className = 'category-option';
        option.dataset.template = key;
        option.textContent = template.name;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.addEventListener('click', () => {
            const textInput = UIElements.getElement('textStatusInput');
            if (textInput) {
                textInput.value = template.text;
                const counter = UIElements.getElement('textStatusCounter');
                if (counter) counter.textContent = `${template.text.length}/500`;
            }
            const bgOption = UIElements.querySelector(`.background-option[data-bg="${template.background}"]`);
            if (bgOption) {
                UIElements.querySelectorAll('.background-option').forEach(opt => opt.classList.remove('selected'));
                bgOption.classList.add('selected');
            }
            if (template.mood) {
                const moodOption = UIElements.querySelector(`.mood-option[data-mood="${template.mood}"]`);
                if (moodOption) {
                    UIElements.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
                    moodOption.classList.add('selected');
                }
            }
            if (template.intent) {
                const intentOption = UIElements.querySelector(`.intent-option[data-intent="${template.intent}"]`);
                if (intentOption) {
                    UIElements.querySelectorAll('.intent-option').forEach(opt => opt.classList.remove('selected'));
                    intentOption.classList.add('selected');
                }
            }
            showNotification(`"${template.name}" template applied`, 'success');
        });
        container.appendChild(option);
    });
}

function initializeReportReasons() {
    const container = UIElements.getElement('reportReasons');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(reportReasons).forEach(([key, text]) => {
        const option = document.createElement('div');
        option.className = 'category-option';
        option.dataset.reason = key;
        option.textContent = text;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.addEventListener('click', () => {
            container.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            updateReportSubmitButton();
        });
        container.appendChild(option);
    });
}

function initializeReactions() {
    const container = UIElements.getElement('reactionsContainer');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(reactions).forEach(([key, emoji]) => {
        const btn = document.createElement('button');
        btn.className = 'reaction-btn';
        btn.dataset.reaction = key;
        btn.textContent = emoji;
        btn.title = key.charAt(0).toUpperCase() + key.slice(1);
        btn.setAttribute('aria-label', `React with ${key}`);
        btn.addEventListener('click', async () => {
            if (!ensureUIActive('reaction')) return;
            if (currentViewerStatus) {
                try {
                    const api = window.StatusAPI;
                    let result;
                    // Try direct API first (always available, even before core is ACTIVE)
                    if (api && api.addReaction) {
                        result = await api.addReaction(currentViewerStatus.id, emoji);
                    } else {
                        const core = getCore();
                        if (core && core.addReactionToStatus) {
                            result = await core.addReactionToStatus(currentViewerStatus.id, key);
                        }
                    }
                    if (result && result.success) {
                        showNotification(`Reacted with ${emoji}`, 'success');
                        // Update button to show selected state
                        container.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        if (result.count !== undefined) {
                            btn.innerHTML = `${emoji} <span class="reaction-count">${result.count}</span>`;
                        }
                    } else {
                        showNotification('Failed to add reaction', 'error');
                    }
                } catch (error) {
                    UILogger.error('Reaction', 'Failed to add reaction', error);
                    showNotification('Failed to add reaction', 'error');
                }
            }
        });
        container.appendChild(btn);
    });
}

function initializePollOptions() {
    const container = UIElements.getElement('pollOptionsContainer');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= 2; i++) {
        addPollOption(i);
    }
}

function initializeHighlightColorOptions() {
    const grid = UIElements.getElement('highlightColorGrid');
    if (!grid) return;
    grid.innerHTML = '';
    backgroundOptions.slice(0, 6).forEach(bg => {
        const option = document.createElement('div');
        option.className = 'background-option';
        option.dataset.bg = bg.id;
        option.dataset.type = bg.type;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.setAttribute('aria-label', `Color ${bg.id}`);
        if (bg.type === 'solid') {
            option.style.backgroundColor = bg.color;
            option.textContent = 'A';
        } else if (bg.type === 'gradient') {
            option.style.background = bg.gradient;
            option.textContent = 'G';
        }
        option.addEventListener('click', () => {
            grid.querySelectorAll('.background-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        grid.appendChild(option);
    });
    const first = grid.querySelector('.background-option');
    if (first) first.classList.add('selected');
}

function initializeHighlightPrivacyOptions() {
    const container = UIElements.getElement('highlightPrivacyOptions');
    if (!container) return;
    container.innerHTML = '';
    ['everyone', 'friends', 'close-friends'].forEach(key => {
        const privacy = privacySettings[key];
        if (!privacy) return;
        const option = document.createElement('div');
        option.className = 'privacy-option';
        option.dataset.privacy = key;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.innerHTML = `
            <div class="privacy-icon">
                <i class="${privacy.icon}"></i>
            </div>
            <div class="privacy-details">
                <div class="privacy-name">${privacy.name}</div>
                <div class="privacy-description">${privacy.description}</div>
            </div>
        `;
        option.addEventListener('click', () => {
            container.querySelectorAll('.privacy-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        container.appendChild(option);
    });
    const friends = container.querySelector('[data-privacy="friends"]');
    if (friends) friends.classList.add('selected');
}

function initializeRepeatOptions() {
    const container = UIElements.getElement('repeatOptions');
    if (!container) return;
    container.innerHTML = '';
    const options = {
        'none': 'Don\'t repeat',
        'daily': 'Daily',
        'weekly': 'Weekly',
        'monthly': 'Monthly'
    };
    Object.entries(options).forEach(([key, text]) => {
        const option = document.createElement('div');
        option.className = 'repeat-option';
        option.dataset.repeat = key;
        option.textContent = text;
        option.setAttribute('role', 'button');
        option.setAttribute('tabindex', '0');
        option.addEventListener('click', () => {
            container.querySelectorAll('.repeat-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
        container.appendChild(option);
    });
    const none = container.querySelector('[data-repeat="none"]');
    if (none) none.classList.add('selected');
}

// =============================================
// HANDLER FUNCTIONS - WITH LIFECYCLE GUARD
// =============================================
async function handlePostStatus() {
    if (!ensureUIActive('postStatus')) {
        showNotification('Please wait, connecting...', 'info');
        return;
    }
    if (!isAuthenticated()) {
        showNotification('Please sign in to post a status', 'error');
        return;
    }
    const activeTab = UIElements.querySelector('.create-status-tab.active');
    if (!activeTab) return;
    const tabName = activeTab.dataset.tab;
    const statusData = {
        type: tabName,
        userId: currentUser?.id,
        user: currentUser,
        createdAt: new Date().toISOString()
    };
    const intent = UIElements.querySelector('.intent-option.selected')?.dataset.intent;
    const mood = UIElements.querySelector('.mood-option.selected')?.dataset.mood;
    const category = UIElements.querySelector('.category-option.selected')?.dataset.category;
    const privacy = UIElements.querySelector('.privacy-option.selected')?.dataset.privacy;
    const duration = UIElements.querySelector('.duration-option.selected')?.dataset.duration;
    const actions = Array.from(UIElements.querySelectorAll('.action-button-option.selected')).map(opt => opt.dataset.action);
    const selectedFriendIds = Array.from(document.querySelectorAll('#friendsListContainer .friend-select-item.selected'))
        .map(el => parseInt(el.dataset.friendId, 10))
        .filter(id => Number.isInteger(id) && id > 0);
    if (intent) statusData.intent = intent;
    if (mood) statusData.mood = mood;
    if (category) statusData.category = category;
    // Default privacy to 'friends' so statuses are friends-only unless explicitly changed
    statusData.privacy = privacy || 'friends';
    statusData.allowReplies = true;
    if (selectedFriendIds.length > 0) {
        if (statusData.privacy === 'except') {
            statusData.excludedUserIds = selectedFriendIds;
        } else if (statusData.privacy === 'specific' || statusData.privacy === 'micro-circle' || statusData.privacy === 'close-friends') {
            statusData.allowedUserIds = selectedFriendIds;
            statusData.selectedFriendIds = selectedFriendIds;
        }
    }
    // Resolve duration → also compute expiresAt so the server has a real date
    if (duration) {
        statusData.duration = duration;
        const secs = parseInt(duration, 10);
        if (secs > 0) {
            statusData.expiresAt = new Date(Date.now() + secs * 1000).toISOString();
        }
    } else {
        // Default: 24 hours
        statusData.duration  = '86400';
        statusData.expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
    }
    if (actions.length > 0) statusData.actionButtons = actions;
    const sensitive = UIElements.getElement('sensitiveContentToggle');
    const silent = UIElements.getElement('silentModeToggle');
    const autoTranslate = UIElements.getElement('autoTranslateToggle');
    const offlineQueue = UIElements.getElement('offlineQueueToggle');
    if (sensitive) statusData.isSensitive = sensitive.checked;
    if (silent) statusData.isSilent = silent.checked;
    if (autoTranslate) statusData.autoTranslate = autoTranslate.checked;
    if (offlineQueue) statusData.offlineQueue = offlineQueue.checked;
    if (tabName === 'text') {
        const textInput = UIElements.getElement('textStatusInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text) {
            showNotification('Please enter text for your status', 'error');
            return;
        }
        if (text.length > 5000) {
            showNotification('Text is too long (max 5000 characters)', 'error');
            return;
        }
        statusData.text = text;
        statusData.content = text; // ensure core's postStatus payload uses correct field
        const bg = UIElements.querySelector('.background-option.selected');
        if (bg) statusData.background = bg.dataset.bg;
    } else if (tabName === 'media') {
        const mediaPreview = UIElements.getElement('mediaPreview');
        if (!mediaPreview || mediaPreview.children.length === 0) {
            showNotification('Please upload at least one media file', 'error');
            return;
        }
        const captionInput = UIElements.getElement('mediaCaptionInput');
        statusData.caption = captionInput ? captionInput.value.trim() : '';

        // --- Real file upload: read the file stored on the input element ---
        const mediaFileInput = UIElements.getElement('mediaFileInput');
        const file = mediaFileInput && mediaFileInput.files && mediaFileInput.files[0];

        if (file) {
            // P1 FIX: use multipart upload (createStatusWithFile) instead of separate upload + URL
            statusData._mediaFile = file; // flag for the posting path below
            statusData.mediaType = file.type.startsWith('video')
                ? 'video'
                : file.type.startsWith('audio')
                    ? 'audio'
                    : 'image';
            statusData.type = statusData.mediaType;
        } else {
            // Fallback: try to read src from the first preview image (already base64)
            const firstImg = mediaPreview.querySelector('img, video');
            if (firstImg) {
                const src = firstImg.src || firstImg.getAttribute('src') || '';
                if (src && !src.startsWith('placeholder')) {
                    statusData.mediaUrl = src;
                    statusData.mediaType = firstImg.tagName === 'VIDEO' ? 'video' : 'image';
                    statusData.type = statusData.mediaType;
                } else {
                    showNotification('Please select a valid media file', 'error');
                    return;
                }
            } else {
                showNotification('Please select a media file before posting', 'error');
                return;
            }
        }
    } else if (tabName === 'poll') {
        const questionInput = UIElements.getElement('pollQuestionInput');
        const question = questionInput ? questionInput.value.trim() : '';
        if (!question) {
            showNotification('Please enter a question for your poll', 'error');
            return;
        }
        const options = Array.from(UIElements.querySelectorAll('.poll-option-input'))
            .map(input => ({
                id: `opt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                text: input.value.trim(),
                votes: 0
            }))
            .filter(opt => opt.text);
        if (options.length < 2) {
            showNotification('Please enter at least 2 options', 'error');
            return;
        }
        statusData.content = question;
        statusData.text = question;
        statusData.type = 'poll';
        statusData.pollOptions = options.map(o => o.text); // backend expects string array
        const durationSelect = UIElements.getElement('pollDurationSelect');
        if (durationSelect) statusData.duration = durationSelect.value;
    }
    try {
        const btn = UIElements.getElement('postStatusBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
        }
        let response;

        // ── FIX Bug A + Bug B: Single unified creation path ─────────────────────
        // Previously status-ui called StatusAPI.createStatus() (direct fetch) AND
        // status-core's postStatus() (postMessage path) in parallel — two requests
        // racing each other, with the UI showing success from the local path even
        // when the backend request failed silently.
        //
        // Now we use ONE path with this priority:
        //   1. status-core postStatus()  — preferred (handles offline queue, session
        //      lifecycle, and the postMessage→chat.html→backend chain)
        //   2. StatusAPI.createStatus()  — direct fetch fallback when core is not
        //      yet ACTIVE (e.g. user posts before SESSION_DATA handshake completes)
        //
        // This means status creation works even when the module is not yet ACTIVE.
        // ─────────────────────────────────────────────────────────────────────────

        // P2/P3 FIX: Merge sticker data (mentions, link, countdown, alt text, template, hashtags)
        const stickerData = window._collectStickerData ? window._collectStickerData() : {};
        Object.assign(statusData, stickerData);

        // P1 FIX: Offline path — queue immediately
        if (!navigator.onLine) {
            if (window.StatusCache) await window.StatusCache.addToSyncQueue(statusData);
            response = { success: true, queued: true, offline: true };
        } else if (statusData._mediaFile || window._pendingDrawingFile) {
            // P1/P3 FIX: Direct multipart upload for captured media OR drawing canvas export
            const mediaFile = statusData._mediaFile || window._pendingDrawingFile;
            window._pendingDrawingFile = null;
            showNotification('Uploading media…', 'info');
            const api = window.StatusAPI;
            delete statusData._mediaFile;
            response = await api.createStatusWithFile(statusData, mediaFile);
        } else {
            // Try core postStatus() first — it uses the postMessage bridge which
            // correctly relays to chat.html → directApiRequest → backend
            const core = getCore();
            const coreReady = core && typeof core.postStatus === 'function' && core.isSessionReady && core.isSessionReady();

            if (coreReady) {
                // FIX Bug B: core is ACTIVE and session is ready — use postMessage path
                response = await core.postStatus(statusData);
                // Normalise: core returns { success, status } after handleApiResponse
                // strips the outer data wrapper. Ensure response.status is populated.
                if (response && response.success && !response.status && response.data) {
                    response.status = response.data.status || response.data;
                }
            } else {
                // FIX Bug B fallback: module not yet ACTIVE — use StatusAPI direct fetch
                console.warn('[status-ui] Core not ready — falling back to direct API fetch for status creation');
                const api = window.StatusAPI;
                response = await api.createStatus(statusData);
            }
        }
        
        if (response && (response.success || response.queued)) {
            // ── SENDER CONFIRMATION ────────────────────────────────────────────
            // Use the real status object returned by the server (has correct id,
            // timestamps, etc.). Only fall back to a local placeholder if truly
            // offline (queued path). The placeholder id is prefixed so that when
            // the real status arrives via socket it can replace it without a duplicate.
            const realStatus = response.status;
            const optimisticStatus = realStatus || {
                id: response.id || `local_status_${Date.now()}`,
                type: statusData.type,
                text: statusData.text || '',
                content: statusData.content || statusData.text || '',
                caption: statusData.caption || '',
                question: statusData.question || '',
                options: statusData.options || [],
                createdAt: new Date().toISOString(),
                userId: currentUser?.id || statusData.userId || null,
                user: currentUser || statusData.user || null,
                queued: !!response.queued,
                visibility: 'friends'
            };

            console.log(`[status-ui] 📤 STATUS POSTED id=${optimisticStatus.id} — updating sender UI`);

            showNotification('Status posted successfully! ✓', 'success');
            const modal = UIElements.createStatusModal;
            if (modal) modal.classList.remove('active');

            // ── Replace any previous optimistic placeholder with confirmed status ─
            // This prevents duplicates when the socket event also fires on the
            // sender's own screen (sender is in their own friend room via ws).
            statuses = statuses.filter(s => !String(s.id).startsWith('local_status_'));
            myStatuses = myStatuses.filter(s => !String(s.id).startsWith('local_status_'));

            statuses = [optimisticStatus].concat(Array.isArray(statuses) ? statuses : []);
            myStatuses = [optimisticStatus].concat(Array.isArray(myStatuses) ? myStatuses : []);

            // Mark this id as already-seen so handleRealtimeStatusEvent skips it
            // when the socket echo arrives (avoids duplicate on sender screen).
            if (optimisticStatus.id && !String(optimisticStatus.id).startsWith('local_status_')) {
                if (window._confirmedStatusIds) {
                    window._confirmedStatusIds.add(String(optimisticStatus.id));
                } else {
                    window._confirmedStatusIds = new Set([String(optimisticStatus.id)]);
                }
            }

            try {
                localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
                localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
            } catch (_error) {}

            // Also inject into core statusState so getStatuses() returns it immediately
            if (typeof statusState !== 'undefined' && Array.isArray(statusState.statuses)) {
                const sid = String(optimisticStatus.id);
                if (!statusState.statuses.find(s => String(s.id) === sid)) {
                    statusState.statuses.unshift({ ...optimisticStatus, id: sid });
                }
            }
            if (typeof statusState !== 'undefined' && Array.isArray(statusState.myStatuses)) {
                const sid = String(optimisticStatus.id);
                if (!statusState.myStatuses.find(s => String(s.id) === sid)) {
                    statusState.myStatuses.unshift({ ...optimisticStatus, id: sid });
                }
            }

            console.log(`[status-ui] ✅ STATUS RENDERED on sender UI id=${optimisticStatus.id}`);
            // Broadcast so socket layer notifies friends
            try {
                document.dispatchEvent(new CustomEvent('status:created', {
                    detail: { status: optimisticStatus, statusId: optimisticStatus.id }
                }));
            } catch (_) {}

            renderStatusListInstantlyUI();
            updateMyStatusPreviewUI();
            updateCurrentSectionUI();
            updateMoodChartUI();
            const textInput = UIElements.getElement('textStatusInput');
            if (textInput) textInput.value = '';
            const mediaPreview = UIElements.getElement('mediaPreview');
            if (mediaPreview) mediaPreview.innerHTML = '';
            const counter = UIElements.getElement('textStatusCounter');
            if (counter) counter.textContent = '0/500';
        }
    } catch (error) {
        UILogger.error('Post', 'Failed to post status', error);
        showNotification('Failed to post status', 'error');
    } finally {
        const btn = UIElements.getElement('postStatusBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Status';
        }
    }
}

function handleSaveDraft() {
    if (!ensureUIActive('saveDraft')) return;
    const activeTab = UIElements.querySelector('.create-status-tab.active');
    if (!activeTab) return;
    const tabName = activeTab.dataset.tab;
    const draftData = {
        type: tabName,
        createdAt: new Date().toISOString()
    };
    if (tabName === 'text') {
        const textInput = UIElements.getElement('textStatusInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text) {
            showNotification('Nothing to save', 'warning');
            return;
        }
        draftData.text = text;
        const bg = UIElements.querySelector('.background-option.selected');
        if (bg) draftData.background = bg.dataset.bg;
    } else if (tabName === 'media') {
        const captionInput = UIElements.getElement('mediaCaptionInput');
        const caption = captionInput ? captionInput.value.trim() : '';
        if (!caption) {
            showNotification('Nothing to save', 'warning');
            return;
        }
        draftData.caption = caption;
    } else if (tabName === 'poll') {
        const questionInput = UIElements.getElement('pollQuestionInput');
        const question = questionInput ? questionInput.value.trim() : '';
        if (!question) {
            showNotification('Nothing to save', 'warning');
            return;
        }
        draftData.question = question;
        const options = Array.from(UIElements.querySelectorAll('.poll-option-input'))
            .map(input => input.value.trim())
            .filter(text => text);
        if (options.length < 2) {
            showNotification('Please enter at least 2 options to save as draft', 'error');
            return;
        }
        draftData.options = options.map(text => ({ text, votes: 0 }));
    }
    const intent = UIElements.querySelector('.intent-option.selected')?.dataset.intent;
    const mood = UIElements.querySelector('.mood-option.selected')?.dataset.mood;
    const category = UIElements.querySelector('.category-option.selected')?.dataset.category;
    if (intent) draftData.intent = intent;
    if (mood) draftData.mood = mood;
    if (category) draftData.category = category;
    draftData.id = 'draft_' + Date.now();
    // P2 FIX: save to dedicated backend draft table via API
    const api = window.StatusAPI;
    (async () => {
        let saved = false;
        if (api && api.saveDraft) {
            try {
                const result = await api.saveDraft(draftData);
                saved = result && result.success;
            } catch(_) {}
        }
        if (!saved) {
            // Fallback localStorage
            if (!Array.isArray(drafts)) drafts = [];
            drafts.unshift(draftData);
            try { localStorage.setItem('status_drafts', JSON.stringify(drafts)); } catch(e) {}
        }
        showNotification('Draft saved', 'success');
        const modal = UIElements.createStatusModal || document.getElementById('createStatusModal');
        if (modal) modal.classList.remove('active');
    })();
}

async function handleConfirmSchedule() {
    if (!ensureUIActive('scheduleStatus')) return;
    const scheduleDate = UIElements.getElement('scheduleDate');
    const scheduleTime = UIElements.getElement('scheduleTime');
    if (!scheduleDate || !scheduleTime || !scheduleDate.value || !scheduleTime.value) {
        showNotification('Please select both date and time', 'error');
        return;
    }
    const scheduleDateTime = new Date(`${scheduleDate.value}T${scheduleTime.value}`);
    if (scheduleDateTime <= new Date()) {
        showNotification('Please select a future date and time', 'error');
        return;
    }
    const activeTab = UIElements.querySelector('.create-status-tab.active');
    if (!activeTab) {
        showNotification('Please create a status first', 'error');
        return;
    }
    const tabName = activeTab.dataset.tab;
    const statusData = {
        type: tabName,
        userId: currentUser?.id,
        user: currentUser
    };
    if (tabName === 'text') {
        const textInput = UIElements.getElement('textStatusInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text) {
            showNotification('Please enter text for your status', 'error');
            return;
        }
        statusData.text = text;
    } else if (tabName === 'media') {
        const captionInput = UIElements.getElement('mediaCaptionInput');
        statusData.caption = captionInput ? captionInput.value.trim() : '';
    } else if (tabName === 'poll') {
        const questionInput = UIElements.getElement('pollQuestionInput');
        const question = questionInput ? questionInput.value.trim() : '';
        if (!question) {
            showNotification('Please enter a question for your poll', 'error');
            return;
        }
        statusData.question = question;
    }
    try {
        const btn = UIElements.getElement('confirmScheduleBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';
        }
        // P1 FIX: Use StatusAPI.createStatus with metadata.scheduled flag instead of
        // core.scheduleStatus which relied on an unimplemented postMessage handler.
        // The backend auto-publish cron picks up statuses where metadata.scheduled=true.
        const api = window.StatusAPI;
        const scheduledPayload = {
            ...statusData,
            isActive: false, // will be activated by the cron worker at scheduledFor time
            metadata: {
                ...(statusData.metadata || {}),
                scheduled: true,
                scheduledFor: scheduleDateTime.toISOString(),
            },
        };
        let response;
        if (api && api.createStatus) {
            response = await api.createStatus(scheduledPayload);
        } else {
            const core = getCore();
            response = core && core.scheduleStatus
                ? await core.scheduleStatus(statusData, scheduleDateTime.toISOString())
                : { success: false };
        }
        if (response && response.success) {
            showNotification('Status scheduled for ' + scheduleDateTime.toLocaleString(), 'success');
            const scheduleModal = UIElements.scheduleModal || document.getElementById('scheduleModal');
            if (scheduleModal) scheduleModal.classList.remove('active');
            const createModal = UIElements.createStatusModal || document.getElementById('createStatusModal');
            if (createModal) createModal.classList.remove('active');
            updateScheduledStatusesList();
        } else {
            // Fallback: save locally
            if (!Array.isArray(scheduledStatuses)) scheduledStatuses = [];
            scheduledStatuses.push({ ...statusData, scheduledAt: scheduleDateTime.toISOString(), id: 'sched_' + Date.now() });
            showNotification('Status saved for scheduling (offline)', 'success');
            const scheduleModal = UIElements.scheduleModal || document.getElementById('scheduleModal');
            if (scheduleModal) scheduleModal.classList.remove('active');
            const createModal = UIElements.createStatusModal || document.getElementById('createStatusModal');
            if (createModal) createModal.classList.remove('active');
            updateScheduledStatusesList();
        }
    } catch (error) {
        UILogger.error('Schedule', 'Failed to schedule status', error);
        showNotification('Failed to schedule status', 'error');
    } finally {
        const btn = UIElements.getElement('confirmScheduleBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-clock"></i> Schedule Status';
        }
    }
}

async function handleSaveStatus() {
    if (!ensureUIActive('saveStatus')) return;
    if (!currentViewerStatus) return;
    const btn = UIElements.getElement('saveStatusBtn');
    const action = btn ? btn.dataset.action : 'save';
    const api = window.StatusAPI;

    if (!action || action === 'save') {
        try {
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
            // P2 FIX: server-persist bookmark via API
            if (api && api.bookmarkStatus) {
                const result = await api.bookmarkStatus(currentViewerStatus.id);
                if (result && result.success) {
                    if (btn) {
                        btn.innerHTML = '<i class="fas fa-bookmark"></i>';
                        btn.title = 'Remove Bookmark';
                        btn.dataset.action = 'unsave';
                    }
                    showNotification('Status bookmarked', 'success');
                } else {
                    showNotification('Failed to bookmark', 'error');
                    if (btn) btn.innerHTML = '<i class="far fa-bookmark"></i>';
                }
            } else {
                if (btn) { btn.innerHTML = '<i class="fas fa-bookmark"></i>'; btn.dataset.action = 'unsave'; }
                showNotification('Status saved', 'success');
            }
        } catch (e) {
            showNotification('Failed to bookmark', 'error');
            if (btn) btn.innerHTML = '<i class="far fa-bookmark"></i>';
        } finally {
            if (btn) btn.disabled = false;
        }
    } else if (action === 'unsave') {
        try {
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
            if (api && api.removeBookmark) {
                const result = await api.removeBookmark(currentViewerStatus.id);
                if (result && result.success) {
                    if (btn) {
                        btn.innerHTML = '<i class="far fa-bookmark"></i>';
                        btn.title = 'Save';
                        btn.dataset.action = 'save';
                    }
                    showNotification('Bookmark removed', 'success');
                }
            } else {
                if (btn) { btn.innerHTML = '<i class="far fa-bookmark"></i>'; btn.dataset.action = 'save'; }
                showNotification('Bookmark removed', 'success');
            }
        } catch (e) {
            showNotification('Failed to remove bookmark', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }
}

async function handleSubmitReport() {
    if (!ensureUIActive('reportStatus')) return;
    if (!currentViewerStatus) return;
    const selectedReason = UIElements.querySelector('#reportReasons .category-option.selected')?.dataset.reason;
    const reportDetails = UIElements.getElement('reportDetails');
    const details = reportDetails ? reportDetails.value.trim() : '';
    const anonymous = UIElements.getElement('anonymousReportToggle')?.checked || false;
    if (!selectedReason) {
        showNotification('Please select a reason', 'error');
        return;
    }
    if (details.length < 5) {
        showNotification('Please provide more details (minimum 5 characters)', 'error');
        return;
    }
    try {
        const btn = UIElements.getElement('submitReportBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }
        // P2 FIX: use StatusAPI directly for report (core.reportStatus may not exist)
        const api = window.StatusAPI;
        const core = getCore();
        let response;
        if (api && api.reportStatus) {
            response = await api.reportStatus(currentViewerStatus.id, selectedReason, details);
        } else if (core && core.reportStatus) {
            response = await core.reportStatus(currentViewerStatus.id, selectedReason, details);
        } else {
            response = { success: false, message: 'Report service unavailable' };
        }
        if (response && response.success) {
            showNotification('Report submitted', 'success');
            const modal = UIElements.reportModal;
            if (modal) modal.classList.remove('active');
            if (reportDetails) reportDetails.value = '';
            UIElements.querySelectorAll('#reportReasons .category-option').forEach(opt => opt.classList.remove('selected'));
        }
    } catch (error) {
        UILogger.error('Report', 'Failed to submit report', error);
        showNotification('Failed to submit report', 'error');
    } finally {
        const btn = UIElements.getElement('submitReportBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-flag"></i> Submit Report';
        }
    }
}

function updateReportSubmitButton() {
    const details = UIElements.getElement('reportDetails');
    const selectedReason = UIElements.querySelector('#reportReasons .category-option.selected');
    const submitBtn = UIElements.getElement('submitReportBtn');
    if (details && selectedReason && submitBtn) {
        const hasDetails = details.value.trim().length >= 10;
        const hasReason = selectedReason !== null;
        submitBtn.disabled = !(hasDetails && hasReason);
    }
}

// =============================================
// REAL MEDIA FILE UPLOAD
// Sends FILE_UPLOAD to parent (chat.html) which POSTs multipart to /api/upload.
// Falls back to inline base64 data URL if parent upload fails or endpoint is absent.
// =============================================
async function uploadMediaFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = async (e) => {
            const base64Data = e.target.result; // data:image/jpeg;base64,...

            // Try parent-proxied upload first
            try {
                const uploadResult = await sendFileUploadToParent(file, base64Data);
                if (uploadResult && uploadResult.url) {
                    resolve(uploadResult.url);
                    return;
                }
            } catch (uploadErr) {
                // Parent upload failed — fall through to base64 inline fallback
                UILogger.warn('Media', 'Parent upload failed, using base64 fallback', uploadErr);
            }

            // Base64 fallback: use the data URL directly as mediaUrl.
            // Note: this works only if the backend's mediaUrl column is large enough (TEXT).
            // If the server rejects it (validation isURL fails), strip the prefix.
            resolve(base64Data);
        };
        reader.readAsDataURL(file);
    });
}

// Sends a FILE_UPLOAD message to the parent window; parent does the actual fetch.
function sendFileUploadToParent(file, base64Data) {
    return new Promise((resolve, reject) => {
        const requestId = `file_upload_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const timeout = setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(new Error('File upload timeout'));
        }, 30000);

        function handler(event) {
            if (!event.data || event.data.requestId !== requestId) return;
            if (event.data.type === 'FILE_UPLOAD_RESULT') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve(event.data);
                }
            }
        }
        window.addEventListener('message', handler);

        try {
            window.parent.postMessage({
                type: 'FILE_UPLOAD',
                requestId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                base64Data,
                module: 'status',
                timestamp: Date.now()
            }, '*');
        } catch (err) {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            reject(err);
        }
    });
}

function handleMediaUpload(event) {
    const files = event.target.files;
    const preview = UIElements.getElement('mediaPreview');
    if (!preview) return;
    preview.innerHTML = '';
    for (let i = 0; i < Math.min(files.length, 5); i++) {
        const file = files[i];
        const fileType = file.type.split('/')[0];
        if (fileType !== 'image' && fileType !== 'video' && fileType !== 'audio') {
            showNotification('Only images, videos, and voice clips are supported', 'error');
            continue;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            const item = document.createElement('div');
            item.className = 'media-preview-item';
            if (fileType === 'image') {
                item.innerHTML = `
                    <img src="${e.target.result}" class="media-preview-image" alt="Preview">
                    <button class="remove-media-btn" type="button" aria-label="Remove media">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else if (fileType === 'video') {
                item.innerHTML = `
                    <video src="${e.target.result}" class="media-preview-image" controls></video>
                    <button class="remove-media-btn" type="button" aria-label="Remove media">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else if (fileType === 'audio') {
                item.innerHTML = `
                    <div class="audio-preview-card">
                        <i class="fas fa-microphone-alt"></i>
                        <audio src="${e.target.result}" class="media-preview-audio" controls></audio>
                    </div>
                    <button class="remove-media-btn" type="button" aria-label="Remove media">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            const removeBtn = item.querySelector('.remove-media-btn');
            removeBtn.addEventListener('click', () => item.remove());
            preview.appendChild(item);
        };
        reader.readAsDataURL(file);
    }
}

// =============================================
// MODAL FUNCTIONS
// =============================================
function showHighlightsModal() {
    if (!ensureUIActive('highlights')) return;
    const modal = UIElements.highlightsModal || document.getElementById('highlightsModal');
    if (!modal) return;
    modal.classList.add('active');
    // FIX: Sync highlights from core before rendering
    try {
        const core = getCore();
        if (core && core.getHighlights) {
            const coreHighlights = core.getHighlights();
            if (Array.isArray(coreHighlights)) highlights = coreHighlights;
        }
    } catch(e) {}
    loadHighlightsContent();
}

function loadHighlightsContent() {
    const content = UIElements.getElement('highlightsContent');
    if (!content) return;
    content.innerHTML = '';
    if (!highlights || highlights.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-star" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No highlights yet</p>
                <p class="subtext">Save important statuses to highlights</p>
                <button class="action-btn primary" onclick="document.getElementById('createHighlightBtn')?.click()">
                    <i class="fas fa-plus"></i> Create Highlight
                </button>
            </div>
        `;
        return;
    }
    highlights.forEach((highlight, idx) => {
        const item = document.createElement('div');
        item.className = 'highlight-item';
        item.style.position = 'relative';
        item.innerHTML = `
            <button class="highlight-cancel-btn" data-idx="${idx}" title="Remove highlight"
                style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.4);border:none;
                       color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;
                       font-size:11px;display:flex;align-items:center;justify-content:center;z-index:2;">&#x2715;</button>
            <div class="highlight-cover" style="background: ${highlight.color || 'var(--highlight-gradient, linear-gradient(135deg,#667eea,#764ba2))'}">
                <i class="${highlight.icon || 'fas fa-star'}"></i>
            </div>
            <div class="highlight-info">
                <div class="highlight-name">${UISanitizer.sanitizeHTML(highlight.name || 'Highlight')}</div>
                <div class="highlight-count">${highlight.statusIds?.length || highlight.count || 0} statuses</div>
            </div>
        `;
        // Cancel/remove button
        item.querySelector('.highlight-cancel-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            highlights.splice(idx, 1);
            try { localStorage.setItem('status_highlights', JSON.stringify(highlights)); } catch(err) {}
            loadHighlightsContent();
        });
        // Click to open
        item.addEventListener('click', () => {
            showNotification('Opening ' + (highlight.name || 'Highlight'), 'info');
        });
        content.appendChild(item);
    });
}

function showHighlightsEditor(highlight = null) {
    if (!ensureUIActive('highlightsEditor')) return;
    const title = UIElements.getElement('highlightEditorTitle');
    const nameInput = UIElements.getElement('highlightNameInput');
    const iconSelect = UIElements.getElement('highlightIconSelect');
    if (title && nameInput && iconSelect) {
        if (highlight) {
            title.textContent = 'Edit Highlight';
            nameInput.value = highlight.name || '';
            iconSelect.value = highlight.icon || 'fas fa-star';
        } else {
            title.textContent = 'Create Highlight';
            nameInput.value = '';
            iconSelect.value = 'fas fa-star';
        }
    }
    const modal = UIElements.highlightsEditorModal;
    if (modal) modal.classList.add('active');
}

async function saveHighlight() {
    if (!ensureUIActive('saveHighlight')) return;
    const nameInput = UIElements.getElement('highlightNameInput');
    const iconSelect = UIElements.getElement('highlightIconSelect');
    const selectedColor = UIElements.querySelector('#highlightColorGrid .background-option.selected');
    const selectedPrivacy = UIElements.querySelector('#highlightPrivacyOptions .privacy-option.selected');
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
        const core = getCore();
        const response = await core.makeParentApiRequest('/api/statuses/highlights', {
            method: 'POST',
            body: JSON.stringify(highlight)
        });
        if (response && response.success) {
            highlights.push(highlight);
            if (typeof window.localStorage !== 'undefined') {
                localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
            }
            showNotification('Highlight saved successfully', 'success');
            const modal = UIElements.highlightsEditorModal;
            if (modal) modal.classList.remove('active');
            loadHighlightsContent();
        }
    } catch (error) {
        UILogger.error('Highlight', 'Failed to save highlight', error);
        showNotification('Failed to save highlight', 'error');
    }
}

function showMemoryTimelineModal() {
    if (!ensureUIActive('memoryTimeline')) return;
    const modal = UIElements.memoryTimelineModal || document.getElementById('memoryTimelineModal');
    if (!modal) return;
    modal.classList.add('active');
    // FIX: Bind timeline filter tabs once here (not inside loadMemoryTimelineContent)
    const filterContainer = modal.querySelector('.timeline-filters-container');
    if (filterContainer && !filterContainer._filterBound) {
        filterContainer._filterBound = true;
        filterContainer.addEventListener('click', function(e) {
            const btn = e.target.closest('.timeline-filter-btn');
            if (btn) {
                filterContainer.querySelectorAll('.timeline-filter-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                loadMemoryTimelineContent(btn.dataset.filter || 'all');
            }
            // Export button
            if (e.target.closest('#exportTimelineBtn')) {
                exportTimeline();
            }
        });
    }
    loadMemoryTimelineContent();
}

function loadMemoryTimelineContent(activeFilter = 'all') {
    const core = getCore();
if ((!myStatuses || myStatuses.length === 0) && core && core.getMyStatuses) {
    myStatuses = core.getMyStatuses();
}
    const content = UIElements.getElement('memoryTimelineContent');
    if (!content) return;

    // FIX: Filter binding moved to showMemoryTimelineModal()

    content.innerHTML = '';
    if (!myStatuses || myStatuses.length === 0) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><p>No status history yet</p><p class="subtext">Your posted statuses will appear here</p></div>`;
        return;
    }

    // Filter by intent/mood based on activeFilter
    const FILTER_MAP = {
        'motivational': s => s.intent === 'motivational' || s.moodType === 'energetic' || s.moodType === 'excited',
        'reflective':   s => s.intent === 'reflective' || s.moodType === 'nostalgic',
        'achievements': s => s.intent === 'achievement' || s.moodType === 'proud',
        'happy':        s => s.moodType === 'happy' || s.intent === 'happy',
        'motivated':    s => s.moodType === 'energetic' || s.intent === 'motivated',
        'all':          () => true,
    };
    const filterFn = FILTER_MAP[activeFilter] || FILTER_MAP['all'];
    const filtered = myStatuses.filter(filterFn);

    if (filtered.length === 0) {
        content.innerHTML = `<div class="empty-state"><i class="fas fa-filter"></i><p>No statuses match this filter</p></div>`;
        return;
    }

    const grouped = {};
    filtered.forEach(status => {
        const date = new Date(status.createdAt);
        const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!grouped[monthYear]) grouped[monthYear] = [];
        grouped[monthYear].push(status);
    });

    Object.entries(grouped).forEach(([monthYear, monthStatuses]) => {
        const section = document.createElement('div');
        section.className = 'timeline-month';
        let daysHtml = '';
        monthStatuses.forEach(status => {
            const date = new Date(status.createdAt);
            const day = date.getDate();
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            daysHtml += `
                <div class="timeline-day" data-status-id="${status.id}" style="position:relative;">
                    <button class="timeline-cancel-btn" data-cancel-id="${status.id}" title="Remove from timeline"
                        style="position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;
                               color:var(--text-secondary);font-size:12px;line-height:1;padding:2px 5px;
                               border-radius:4px;opacity:0.6;"
                        onclick="event.stopPropagation()">&#x2715;</button>
                    <div class="timeline-date">${day} ${month}</div>
                    <div class="timeline-status">${UISanitizer.sanitizeHTML(getStatusPreviewText(status))}</div>
                </div>`;
        });
        section.innerHTML = `<div class="timeline-month-header">${monthYear}</div><div class="timeline-days">${daysHtml}</div>`;
        section.querySelectorAll('.timeline-day').forEach(dayEl => {
            // Cancel (remove) button
            const cancelBtn = dayEl.querySelector('.timeline-cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const sid = parseInt(this.dataset.cancelId);
                    myStatuses = myStatuses.filter(s => s.id !== sid);
                    loadMemoryTimelineContent(activeFilter);
                });
            }
            // Click to view
            dayEl.addEventListener('click', () => {
                const statusId = parseInt(dayEl.dataset.statusId);
                const status = myStatuses.find(s => s.id === statusId);
                if (status) {
                    showStatusViewer(status);
                    const modal = UIElements.memoryTimelineModal || document.getElementById('memoryTimelineModal');
                    if (modal) modal.classList.remove('active');
                }
            });
        });
        content.appendChild(section);
    });
}

function exportTimeline() {
    if (!ensureUIActive('exportTimeline')) return;
    const statusList = Array.isArray(myStatuses) ? myStatuses : [];
    if (statusList.length === 0) {
        showNotification('No statuses to export yet', 'warning');
        return;
    }
    const data = {
        user: (currentUser && (currentUser.displayName || currentUser.username)) || 'User',
        exportDate: new Date().toISOString(),
        totalStatuses: statusList.length,
        statuses: statusList.map(function(s) {
            return {
                date: s.createdAt,
                type: s.type,
                text: s.text || s.caption || s.question || '',
                mood: s.mood || s.moodType || '',
                intent: s.intent || ''
            };
        })
    };
    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timeline-' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Timeline exported (' + statusList.length + ' statuses)', 'success');
    } catch(e) {
        showNotification('Export failed: ' + e.message, 'error');
    }
}

function showStatsModal() {
    if (!ensureUIActive('stats')) return;
    const modal = UIElements.statsModal || document.getElementById('statsModal');
    if (!modal) return;
    modal.classList.add('active');
    loadStatsContent();
}

function loadStatsContent() {
    const content = UIElements.getElement('statsContent');
    if (!content) return;
    
    const totalStatuses = myStatuses.length;
    const totalViews = myStatuses.reduce(function(sum, s) { return sum + (s.viewCount || s.views || 0); }, 0);
    const totalReactions = myStatuses.reduce(function(sum, s) { return sum + (s.likeCount || s.reactions || 0) + (s.commentCount || 0); }, 0);
    const engagementRate = totalViews > 0 ? Math.round((totalReactions / totalViews) * 100) : 0;
    const avgViewsPerStatus = totalStatuses > 0 ? Math.round(totalViews / totalStatuses) : 0;

    const totalStatusesStat = UIElements.getElement('totalStatusesStat');
    const totalViewsStat = UIElements.getElement('totalViewsStat');
    const totalReactionsStat = UIElements.getElement('totalReactionsStat');
    const streakStat = UIElements.getElement('streakStat');
    const avgViewTimeStat = UIElements.getElement('avgViewTimeStat');
    const engagementRateStat = UIElements.getElement('engagementRateStat');
    
    if (totalStatusesStat) totalStatusesStat.textContent = totalStatuses;
    if (totalViewsStat) totalViewsStat.textContent = totalViews;
    if (totalReactionsStat) totalReactionsStat.textContent = totalReactions;
    if (streakStat) streakStat.textContent = streakCount || 0;
    if (avgViewTimeStat) avgViewTimeStat.textContent = avgViewsPerStatus + 'x';
    if (engagementRateStat) engagementRateStat.textContent = engagementRate + '%';
    
    updateStatsChart();
    loadRecentViewers();
    setTimeout(refreshRecentViewersPanel, 0);
}

function updateStatsChart() {
    const chart = UIElements.getElement('viewsChart');
    if (!chart) return;
    chart.innerHTML = '';

    if (!myStatuses || myStatuses.length === 0) {
        chart.innerHTML = '<div class="empty-state" style="height:100px;display:flex;align-items:center;justify-content:center;"><p style="color:var(--text-secondary)">No data yet</p></div>';
        return;
    }

    // Build real per-day view counts from myStatuses
    const dayMap = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dayMap[key] = 0;
    }
    
    myStatuses.forEach(function(s) {
        const d = new Date(s.createdAt);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dayMap.hasOwnProperty(key)) {
            dayMap[key] += (s.viewCount || s.views || 0);
        }
    });

    const data = Object.entries(dayMap).map(function([date, views]) { return { date, views }; });
    const maxViews = Math.max(...data.map(function(d) { return d.views; }), 1);
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;align-items:flex-end;gap:2px;height:200px;width:100%';
    
    data.forEach(function(item) {
        const bar = document.createElement('div');
        bar.style.flex = '1';
        bar.style.height = (item.views / maxViews * 100) + '%';
        bar.style.minHeight = item.views > 0 ? '4px' : '1px';
        bar.style.backgroundColor = item.views > 0 ? 'var(--primary-color)' : 'var(--border-color)';
        bar.style.borderRadius = '2px 2px 0 0';
        bar.title = item.date + ': ' + item.views + ' views';
        container.appendChild(bar);
    });
    chart.appendChild(container);
}

function loadRecentViewers() {
    const list = UIElements.getElement('recentViewersList');
    if (!list) return;
    list.innerHTML = '';
    
    // Top statuses by views from real data
    if (!myStatuses || myStatuses.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No viewer data yet</p></div>';
        return;
    }
    
    const topStatuses = myStatuses
        .filter(function(s) { return (s.viewCount || s.views || 0) > 0; })
        .sort(function(a, b) { return (b.viewCount || b.views || 0) - (a.viewCount || a.views || 0); })
        .slice(0, 5);
    
    if (topStatuses.length === 0) {
        list.innerHTML = '<div style="padding:15px;color:var(--text-secondary);text-align:center">No views recorded yet</div>';
        return;
    }
    
    topStatuses.forEach(function(s) {
        const item = document.createElement('div');
        item.className = 'viewer-item';
        const preview = (s.text || s.content || s.question || 'Status').substring(0, 40);
        const date = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const viewCount = s.viewCount || s.views || 0;
        item.innerHTML = '<div class="viewer-avatar" style="background:var(--primary-color);color:#fff;font-size:11px">' + viewCount + '</div><div class="viewer-info"><div class="viewer-name">' + UISanitizer.sanitizeHTML(preview) + '</div><div class="viewer-time">' + date + ' · ' + viewCount + ' views</div></div>';
        list.appendChild(item);
    });
}

function refreshRecentViewersPanel() {
    const list = UIElements.getElement('recentViewersList');
    if (!list) return;

    const sourceStatus = currentViewerStatus && myStatuses.some(function(s) { return String(s.id) === String(currentViewerStatus.id); })
        ? currentViewerStatus
        : (myStatuses || [])
            .filter(function(s) { return (s.viewCount || s.views || 0) > 0; })
            .sort(function(a, b) { return (b.viewCount || b.views || 0) - (a.viewCount || a.views || 0); })[0];

    const api = window.StatusAPI;
    if (!(api && api.getViewers && sourceStatus && sourceStatus.id)) {
        return;
    }

    api.getViewers(sourceStatus.id).then(function(result) {
        if (!result || !result.success || !Array.isArray(result.viewers) || result.viewers.length === 0) {
            return;
        }

        list.innerHTML = '';
        result.viewers.slice(0, 8).forEach(function(entry) {
            const item = document.createElement('div');
            item.className = 'viewer-item';
            const name = entry.viewer?.displayName || entry.viewer?.username || ('User ' + entry.viewerId);
            const avatarText = name ? name.charAt(0).toUpperCase() : 'U';
            const viewedAt = entry.viewedAt ? formatTimeAgo(entry.viewedAt) : 'Just now';
            const reaction = entry.reaction ? ' · ' + entry.reaction : '';
            const replies = entry.replyCount ? ' · ' + entry.replyCount + ' repl' + (entry.replyCount === 1 ? 'y' : 'ies') : '';
            item.innerHTML = '<div class="viewer-avatar" style="background:var(--primary-color);color:#fff;font-size:11px">' +
                UISanitizer.sanitizeHTML(avatarText) +
                '</div><div class="viewer-info"><div class="viewer-name">' +
                UISanitizer.sanitizeHTML(name) +
                '</div><div class="viewer-time">' +
                UISanitizer.sanitizeHTML(viewedAt + reaction + replies) +
                '</div></div>';
            list.appendChild(item);
        });
    }).catch(function() {});
}

function showDraftsModal() {
    if (!ensureUIActive('drafts')) return;
    const modal = UIElements.draftsModal || document.getElementById('draftsModal');
    if (!modal) return;
    modal.classList.add('active');
    // FIX: Sync drafts from core before rendering
    try {
        const core = getCore();
        if (core && core.getDrafts) {
            const coreDrafts = core.getDrafts();
            if (Array.isArray(coreDrafts)) drafts = coreDrafts;
        }
    } catch(e) {}
    updateDraftsList();
}

function updateDraftsList() {
    const list = UIElements.getElement('allDraftsList');
    if (!list) return;
    list.innerHTML = '';
    if (!drafts || drafts.length === 0) {
        list.innerHTML = `
            <div class="drafts-empty">
                <i class="fas fa-file-alt"></i>
                <p>No drafts yet</p>
                <p class="subtext">Save a status as draft to see it here</p>
            </div>
        `;
        return;
    }
    let selectedDraftId = null;
    drafts.forEach(draft => {
        const item = document.createElement('div');
        item.className = 'draft-item';
        item.dataset.draftId = draft.id;
        let preview = '';
        if (draft.type === 'text') preview = draft.text || 'Text draft';
        else if (draft.type === 'media') preview = '📷 ' + (draft.caption || 'Media draft');
        else if (draft.type === 'poll') preview = '📊 ' + (draft.question || 'Poll draft');
        const timeAgo = draft.createdAt ? formatTimeAgo(draft.createdAt) : 'Just now';
        item.innerHTML =
            '<div class="draft-preview">' + UISanitizer.sanitizeHTML(preview.substring(0,100)) + (preview.length > 100 ? '...' : '') + '</div>' +
            '<div class="draft-meta">' +
              '<span>' + timeAgo + ' • ' + (draft.type || 'Unknown') + '</span>' +
              '<div class="draft-actions">' +
                '<button class="draft-action-btn" data-action="edit" title="Edit"><i class="fas fa-edit"></i> Edit</button>' +
                '<button class="draft-action-btn danger" data-action="delete" title="Delete"><i class="fas fa-trash"></i></button>' +
              '</div>' +
            '</div>';
        // Select on click (highlight)
        item.addEventListener('click', function(e) {
            if (e.target.closest('[data-action]')) return; // handled below
            list.querySelectorAll('.draft-item').forEach(function(el) { el.classList.remove('selected'); });
            item.classList.add('selected');
            selectedDraftId = draft.id;
            const loadBtn = document.getElementById('loadDraftBtn');
            if (loadBtn) loadBtn.disabled = false;
        });
        // Edit / Delete action buttons
        item.querySelector('[data-action="edit"]').addEventListener('click', function(e) {
            e.stopPropagation();
            loadDraft(draft);
            closeModal('draftsModal');
        });
        item.querySelector('[data-action="delete"]').addEventListener('click', function(e) {
            e.stopPropagation();
            deleteDraft(draft.id);
            updateDraftsList();
        });
        list.appendChild(item);
    });
}

function handleDraftAction(action, draft) {
    if (!ensureUIActive('draftAction')) return;
    if (action === 'edit') {
        loadDraft(draft);
    } else if (action === 'delete') {
        deleteDraft(draft.id);
    }
}

function loadDraft(draft) {
    if (!ensureUIActive('loadDraft')) return;
    if (!draft) return;
    const modal = UIElements.createStatusModal;
    if (modal) modal.classList.add('active');
    if (draft.type === 'text') {
        const textTab = UIElements.querySelector('.create-status-tab[data-tab="text"]');
        if (textTab) textTab.click();
        const textInput = UIElements.getElement('textStatusInput');
        if (textInput && draft.text) {
            textInput.value = draft.text;
            const counter = UIElements.getElement('textStatusCounter');
            if (counter) counter.textContent = `${draft.text.length}/500`;
        }
        if (draft.background) {
            const bgOption = UIElements.querySelector(`.background-option[data-bg="${draft.background}"]`);
            if (bgOption) {
                UIElements.querySelectorAll('.background-option').forEach(opt => opt.classList.remove('selected'));
                bgOption.classList.add('selected');
            }
        }
    } else if (draft.type === 'media') {
        const mediaTab = UIElements.querySelector('.create-status-tab[data-tab="media"]');
        if (mediaTab) mediaTab.click();
        const captionInput = UIElements.getElement('mediaCaptionInput');
        if (captionInput && draft.caption) captionInput.value = draft.caption;
    } else if (draft.type === 'poll') {
        const pollTab = UIElements.querySelector('.create-status-tab[data-tab="poll"]');
        if (pollTab) pollTab.click();
        const questionInput = UIElements.getElement('pollQuestionInput');
        if (questionInput && draft.question) questionInput.value = draft.question;
        setTimeout(() => {
            const container = UIElements.getElement('pollOptionsContainer');
            if (container && draft.options) {
                container.innerHTML = '';
                draft.options.forEach((opt, idx) => {
                    addPollOption(idx + 1);
                    setTimeout(() => {
                        const inputs = UIElements.querySelectorAll('.poll-option-input');
                        if (inputs[idx]) inputs[idx].value = opt.text;
                    }, 10);
                });
            }
        }, 50);
    }
    if (draft.intent) {
        const intentOption = UIElements.querySelector(`.intent-option[data-intent="${draft.intent}"]`);
        if (intentOption) {
            UIElements.querySelectorAll('.intent-option').forEach(opt => opt.classList.remove('selected'));
            intentOption.classList.add('selected');
        }
    }
    if (draft.mood) {
        const moodOption = UIElements.querySelector(`.mood-option[data-mood="${draft.mood}"]`);
        if (moodOption) {
            UIElements.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            moodOption.classList.add('selected');
        }
    }
    const draftsModal = UIElements.draftsModal;
    if (draftsModal) draftsModal.classList.remove('active');
    showNotification('Draft loaded', 'success');
}

function deleteDraft(draftId) {
    if (!ensureUIActive('deleteDraft')) return;
    if (!confirm('Delete this draft?')) return;
    drafts = drafts.filter(function(d) { return d.id !== draftId; });
    try {
        localStorage.setItem('status_drafts', JSON.stringify(drafts));
        if (typeof LOCAL_STORAGE_KEYS !== 'undefined' && LOCAL_STORAGE_KEYS.DRAFTS)
            localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
        const core = getCore();
        if (core && core.deleteDraft) core.deleteDraft(draftId);
    } catch(e) {}
    showNotification('Draft deleted', 'success');
    updateDraftsList();
}

function deleteAllDrafts() {
    if (!ensureUIActive('deleteAllDrafts')) return;
    if (!drafts || drafts.length === 0) {
        showNotification('No drafts to delete', 'info');
        return;
    }
    if (!confirm('Are you sure you want to delete all drafts?')) return;
    drafts = [];
    if (typeof window.localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    }
    showNotification('All drafts deleted', 'success');
    updateDraftsList();
}

function updateScheduledStatusesList() {
    const list = UIElements.getElement('scheduledStatusesList') || document.getElementById('scheduledStatusesList');
    if (!list) return;
    // Ensure the list container is visible
    list.classList.add('active');
    list.innerHTML = '';
    // Sync from core if empty
    if (!scheduledStatuses || scheduledStatuses.length === 0) {
        try {
            const core = getCore();
            if (core && core.getScheduledStatuses) {
                const coreScheduled = core.getScheduledStatuses();
                if (Array.isArray(coreScheduled)) scheduledStatuses = coreScheduled;
            }
        } catch(e) {}
    }
    if (!scheduledStatuses || scheduledStatuses.length === 0) {
        list.innerHTML = '<div class="schedule-empty"><i class="fas fa-clock"></i><p>No scheduled statuses</p><p class="subtext">Schedule a status to see it here</p></div>';
        return;
    }
    scheduledStatuses.forEach(function(scheduled) {
        const item = document.createElement('div');
        item.className = 'schedule-item';
        item.dataset.scheduleId = scheduled.id;
        const scheduledFor = new Date(scheduled.scheduledAt || scheduled.scheduledFor || scheduled.createdAt);
        const timeString = isNaN(scheduledFor) ? 'Unknown time' : scheduledFor.toLocaleString();
        const preview = UISanitizer.sanitizeHTML((getStatusPreviewText(scheduled) || '').substring(0, 40));
        item.innerHTML =
            '<div class="schedule-info">' +
              '<h4>' + (scheduled.type || 'Status') + (preview ? ' — ' + preview : '') + '</h4>' +
              '<div class="schedule-time"><i class="fas fa-calendar-alt"></i> ' + timeString + '</div>' +
            '</div>' +
            '<div class="schedule-actions">' +
              '<button class="cancel-btn" title="Cancel scheduled status" style="display:flex;align-items:center;gap:4px;">' +
                '<i class="fas fa-times"></i> Cancel' +
              '</button>' +
            '</div>';
        // Wire cancel button directly
        item.querySelector('.cancel-btn').addEventListener('click', function() {
            cancelScheduledStatus(scheduled.id);
        });
        list.appendChild(item);
    });
}

async function cancelScheduledStatus(scheduleId) {
    if (!scheduleId) return;
    if (!confirm('Cancel this scheduled status?')) return;
    // Always remove from local array immediately for instant UI feedback
    scheduledStatuses = (scheduledStatuses || []).filter(function(s) { return s.id !== scheduleId; });
    try {
        localStorage.setItem('status_scheduled', JSON.stringify(scheduledStatuses));
        if (typeof LOCAL_STORAGE_KEYS !== 'undefined' && LOCAL_STORAGE_KEYS.SCHEDULED)
            localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULED, JSON.stringify(scheduledStatuses));
    } catch(e) {}
    showNotification('Scheduled status cancelled', 'success');
    updateScheduledStatusesList();
    // Best-effort API call (non-blocking)
    try {
        const core = getCore();
        if (core && core.makeParentApiRequest) {
            core.makeParentApiRequest('/api/statuses/schedule/' + scheduleId, { method: 'DELETE' }).catch(function() {});
        }
    } catch(e) {}
}

// =============================================
// FILTER FUNCTIONS
// =============================================
function addFilterTag(filter, label) {
    if (!ensureUIActive('addFilter')) return;
    const tags = UIElements.getElement('filterTags');
    if (!tags) return;
    if (activeFilters.has(filter)) return;
    activeFilters.add(filter);
    const tag = document.createElement('div');
    tag.className = 'filter-tag active';
    tag.dataset.filter = filter;
    tag.innerHTML = `
        ${UISanitizer.sanitizeHTML(label)}
        <i class="fas fa-times"></i>
    `;
    tag.addEventListener('click', () => removeFilterTag(filter));
    tags.appendChild(tag);
    const clearBtn = UIElements.getElement('clearFiltersBtn');
    if (clearBtn) clearBtn.style.display = 'block';
    UIStateManager.saveFilters();
    updateCurrentSectionUI();
}

function removeFilterTag(filter) {
    activeFilters.delete(filter);
    const tag = UIElements.querySelector(`.filter-tag[data-filter="${filter}"]`);
    if (tag) tag.remove();
    const clearBtn = UIElements.getElement('clearFiltersBtn');
    if (clearBtn && activeFilters.size === 0) clearBtn.style.display = 'none';
    UIStateManager.saveFilters();
    updateCurrentSectionUI();
}

function clearAllFilters() {
    activeFilters.clear();
    const tags = UIElements.getElement('filterTags');
    if (tags) tags.innerHTML = '';
    const clearBtn = UIElements.getElement('clearFiltersBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    currentIntentFilter = null;
    currentMoodFilter = null;
    UIStateManager.saveFilters();
    updateCurrentSectionUI();
}

// =============================================
// RENDER FUNCTIONS
// =============================================
function renderStatusListInstantlyUI() {
    const recentContainer = UIElements.allStatusList   || document.getElementById('allStatusList');
    const viewedContainer = document.getElementById('viewedStatusList');
    if (!recentContainer) return;

    const core = getCore();
    const currentUserId = String(
        (currentUser && (currentUser.id || currentUser.userId)) ||
        (window.currentUser && (window.currentUser.id || window.currentUser.userId)) || ''
    );

    // ── Collect friend statuses only (own = My Status row at top) ────────
    let friendData = [];
    if (core && core !== window && typeof core.getFriendsStatuses === 'function') {
        friendData = core.getFriendsStatuses() || [];
    }
    if (!friendData.length && Array.isArray(friendsStatuses)) {
        friendData = friendsStatuses;
    }

    // Deduplicate, exclude own
    const seenIds = new Set();
    const _delReg = window.__PHASE10_DeletionRegistry;
    const allFriendStatuses = friendData
        .filter(s => {
            if (!s || s.id == null) return false;
            const sid = String(s.id);
            if (seenIds.has(sid)) return false;
            seenIds.add(sid);
            const owner = String(s.userId || s.user_id || (s.user && s.user.id) || '');
            if (currentUserId && owner === currentUserId) return false;
            // FIX: Only exclude statuses that were EXPLICITLY deleted (not just viewed/expired)
            // Viewed statuses must remain visible in the "Viewed updates" section
            if (_delReg && _delReg.isDeleted('status', sid)) {
                // Only exclude if it's truly deleted, not just viewed
                // A viewed status is still in viewedStatuses set — keep it
                const isViewed = viewedStatuses?.has(sid);
                if (!isViewed) return false; // deleted AND not viewed = exclude
                // Deleted but viewed = still show in viewed section (user saw it)
            }
            return true;
        })
        .map(s => ({ ...s, id: String(s.id) }));

    // ── Split into unviewed (recent) vs viewed ────────────────────────────
    // Group by userId — if user has ANY unviewed status, ALL their statuses go to recent
    // If user has ONLY viewed statuses, they go to viewed section
    const byUser = {};
    allFriendStatuses.forEach(s => {
        const uid = String(s.userId || s.user_id || (s.user && s.user.id) || 'unknown');
        if (!byUser[uid]) byUser[uid] = [];
        byUser[uid].push(s);
    });

    const recentGroups  = []; // user has at least one unviewed status
    const viewedGroups  = []; // user's statuses all viewed

    Object.values(byUser).forEach(group => {
        const hasUnviewed = group.some(s => !viewedStatuses?.has(String(s.id)));
        if (hasUnviewed) {
            recentGroups.push(...group);
        } else {
            viewedGroups.push(...group);
        }
    });

    // Sort by newest first
    const byDate = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    recentGroups.sort(byDate);
    viewedGroups.sort(byDate);

    // ── Render Recent updates ─────────────────────────────────────────────
    const recentLabel = document.getElementById('recentUpdatesLabel');
    if (recentGroups.length) {
        if (recentLabel) recentLabel.style.display = '';
        renderStatusesListUI(recentContainer, recentGroups, false);
    } else {
        if (recentLabel) recentLabel.style.display = 'none';
        recentContainer.innerHTML = '';
    }

    // ── Render Viewed updates ─────────────────────────────────────────────
    const viewedLabel = document.getElementById('viewedUpdatesLabel');
    if (viewedContainer) {
        if (viewedGroups.length) {
            if (viewedLabel) viewedLabel.style.display = '';
            renderStatusesListUI(viewedContainer, viewedGroups, true); // true = dim/viewed style
        } else {
            if (viewedLabel) viewedLabel.style.display = 'none';
            viewedContainer.innerHTML = '';
        }
    }

    // Show empty state if nothing at all
    if (!recentGroups.length && !viewedGroups.length) {
        if (recentLabel) recentLabel.style.display = 'none';
        recentContainer.innerHTML = `
            <div class="empty-state" style="padding:24px 16px;text-align:center;color:var(--text-secondary,#8696a0);">
                <i class="fas fa-comment-dots" style="font-size:32px;margin-bottom:10px;opacity:0.4;display:block;"></i>
                <p style="margin:0 0 4px;font-size:14px;">No recent updates</p>
                <p style="margin:0;font-size:12px;opacity:0.7;">Status updates from your contacts appear here</p>
            </div>`;
    }
}

function updateMyStatusPreviewUI() {
    const preview = document.getElementById('myStatusPreview') || UIElements.getElement('myStatusPreview');
    if (!preview) return;

    const ringWrap  = document.getElementById('myStatusRing')    || preview.querySelector('.sw-avatar-wrap');
    const avatarEl  = document.getElementById('myStatusAvatar')  || preview.querySelector('.sw-avatar');
    const addBadge  = document.getElementById('myStatusAddBadge')|| preview.querySelector('.sw-add-badge');
    const subEl     = document.getElementById('myStatusText')    || preview.querySelector('.sw-row-sub');

    const total = Array.isArray(myStatuses) ? myStatuses.length : 0;

    // ── SVG segmented ring — same style as friend status rows ──────────
    if (ringWrap) {
        const oldSvg = ringWrap.querySelector('svg.my-ring-svg');
        if (oldSvg) oldSvg.remove();
        if (total > 0) {
            const R=22, CX=26, CY=26, STROKE=2.4;
            const GAP = total > 1 ? 5 : 0;
            const CIRC = 2*Math.PI*R;
            const segDeg = (360 - GAP*total) / total;
            const segArc = (segDeg/360)*CIRC;
            let segs = '';
            for (let i=0; i<total; i++) {
                const rot = -90 + i*(segDeg+GAP);
                const off = -(rot/360)*CIRC + CIRC*0.25;
                segs += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
                    stroke="#00a884" stroke-width="${STROKE}"
                    stroke-dasharray="${segArc} ${CIRC-segArc}"
                    stroke-dashoffset="${off}"
                    transform="rotate(${rot},${CX},${CY})"/>`;
            }
            const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
            svg.setAttribute('viewBox','0 0 52 52');
            svg.setAttribute('class','my-ring-svg');
            svg.style.cssText='position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);pointer-events:none;z-index:2;';
            svg.innerHTML = segs;
            ringWrap.style.position = 'relative';
            ringWrap.appendChild(svg);
        }
        if (addBadge) addBadge.style.display = total > 0 ? 'none' : '';
    }

    // ── Avatar photo ───────────────────────────────────────────────────
    if (avatarEl && myStatuses && myStatuses[0]) {
        const mediaUrl = myStatuses[0].mediaUrl || myStatuses[0].contentUrl || '';
        if (mediaUrl) {
            avatarEl.style.backgroundImage = `url('${mediaUrl}')`;
            avatarEl.style.backgroundSize  = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.innerHTML = '';
        }
    }

    // ── Sub text ───────────────────────────────────────────────────────
    if (subEl) {
        if (total > 0) {
            const latest = myStatuses[0];
            subEl.textContent = (total > 1 ? `${total} updates · ` : '') + formatTimeAgo(latest.createdAt);
        } else {
            subEl.textContent = 'Tap to add status update';
        }
    }

    // No statuses — ensure add-badge is visible (already handled above)
    // Nothing else needed for empty state (sw-row shows "Tap to add status update")
}

function updateMoodChartUI() {
    const chart = UIElements.getElement('moodChart');
    if (!chart) return;
    chart.innerHTML = '';
    const data = moodChartData.length > 0 ? moodChartData : [];
    if (data.length === 0) {
        chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:12px">Post statuses to see mood chart</div>';
        return;
    }
    data.slice(-14).forEach((day) => {
        const bar = document.createElement('div');
        bar.className = 'mood-bar';
        bar.style.backgroundColor = statusMoods[day.mood]?.color || 'var(--mood-happy)';
        bar.style.height = `${day.value}%`;
        bar.title = `${statusMoods[day.mood]?.name || 'Happy'} (${day.value}%)`;
        chart.appendChild(bar);
    });
}

// =============================================
// CLEANUP
// =============================================
function cleanupUI() {
    stopAutoAdvance();
    uiEvents.removeAllListeners();
    UIBridge.clearSubscriptions();
    UIStateManager.clear();
    UIFailsafe.resetAll();
    UIFailsafe.cleanup();
    if (typeof UIFailsafe.mutationObserver !== 'undefined') {
        UIFailsafe.mutationObserver.disconnect();
    }
    UILogger.info('Cleanup', 'UI cleanup complete');
}

// =============================================
// DIAGNOSTIC OVERLAY
// =============================================
function showDiagnosticOverlay() {
    const core = getCore();
    const diagnostics = core && core.getDiagnostics ? core.getDiagnostics() : UILogger.getDiagnostics();
    const overlay = document.createElement('div');
    overlay.id = 'diagnosticOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 400px;
        max-height: 80vh;
        overflow-y: auto;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 16px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: monospace;
        font-size: 12px;
    `;
    overlay.innerHTML = `
        <h3 style="margin: 0 0 10px 0; font-size: 14px;">Status System Diagnostics</h3>
        <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(diagnostics, null, 2)}</pre>
        <button class="action-btn secondary" onclick="this.parentElement.remove()">Close</button>
    `;
    document.body.appendChild(overlay);
}


// =============================================
// APPLICATION INITIALIZATION
// =============================================
document.addEventListener('DOMContentLoaded', async function() {
    UILogger.info('Init', 'DOM Content Loaded - Starting UI initialization');
    UIRenderPipeline.setStage('skeleton');
    SkeletonLoader.show();
    
    try {
        // Sync data from core
        syncDataFromCore();
        subscribeToStatusChanges();
        
        // Initial render with cached data
        renderStatusListInstantlyUI();

        // Fetch friend statuses early — StatusAPI uses parent bridge, no lifecycle needed
        setTimeout(() => {
            _friendFetchLast = 0;
            if (typeof _fetchFriendStatusesDirect === 'function') _fetchFriendStatusesDirect();
        }, 1000);
        
        UIRenderPipeline.setStage('initialRender');
        initializeUIComponents();
        setupBasicEventListeners();
        UIBridge.initialize();
        uiEvents.initialize();
        ResponsiveEngine.initialize();
        
        UIRenderPipeline.setStage('progressiveEnhancement');
        UIRenderPipeline.updateHandshakeStatus('waiting');
        
        const LifecycleState = getLifecycleStateEnum();
        const lifecycle = getLifecycleState();
        const core = getCore();
        
        // Check if we're already active
        if (lifecycle && lifecycle.state === LifecycleState.ACTIVE) {
            UIRenderPipeline.updateHandshakeStatus('connected');
            enableProtectedUI();
            setupEventListeners();
            ProgressiveEnhancement.execute();
            UIRenderPipeline.setStage('liveUpdate');
            LiveUpdateEngine.initialize();
            updateMoodChartUI();
            updateMyStatusPreviewUI();
            updateCurrentSectionUI();
            SkeletonLoader.hideAll();
            UILogger.info('Init', 'UI fully initialized (ACTIVE state)');
        } 
        // Otherwise, wait for token ready
        else if (core && core.onTokenReady) {
            core.onTokenReady(() => {
                UILogger.info('Init', 'Token ready - finalizing UI');
                // Re-sync data after token is ready
                syncDataFromCore();
                renderStatusListInstantlyUI();
                updateMyStatusPreviewUI();
                
                enableProtectedUI();
                UIRenderPipeline.updateHandshakeStatus('connected');
                
                setTimeout(() => {
                    setupEventListeners();
                    ProgressiveEnhancement.execute();
                    UIRenderPipeline.setStage('liveUpdate');
                    LiveUpdateEngine.initialize();
                    updateMoodChartUI();
                    updateMyStatusPreviewUI();
                    updateCurrentSectionUI();
                    SkeletonLoader.hideAll();
                    UILogger.info('Init', 'UI fully initialized');
                }, 200);
            });
        }
        // Fallback - check for token directly
        else if (isTokenReady || (core && core.isSessionReady && core.isSessionReady())) {
            UILogger.info('Init', 'Session already ready');
            enableProtectedUI();
            UIRenderPipeline.updateHandshakeStatus('connected');
            
            setTimeout(() => {
                setupEventListeners();
                ProgressiveEnhancement.execute();
                UIRenderPipeline.setStage('liveUpdate');
                LiveUpdateEngine.initialize();
                updateMoodChartUI();
                updateMyStatusPreviewUI();
                updateCurrentSectionUI();
                SkeletonLoader.hideAll();
                UILogger.info('Init', 'UI fully initialized');
            }, 200);
        }
        // Wait for handshake to complete
else {
    UILogger.info('Init', 'Waiting for handshake to complete');
    
    let finalized = false;
    let pollingInterval = null;
    let pollCount = 0;
    const MAX_POLLS = 40; // 20 seconds max fallback polling (was 30 × 500ms = 15s)
    
    // Event-driven activation handler
    const onModuleActive = () => {
        if (finalized) return;
        finalized = true;
        
        if (pollingInterval) clearInterval(pollingInterval);
        
        UILogger.info('Init', 'Module active event received - finalizing UI');
        
        syncDataFromCore();
        renderStatusListInstantlyUI();
        updateMyStatusPreviewUI();
        
        enableProtectedUI();
        UIRenderPipeline.updateHandshakeStatus('connected');
        
        setTimeout(() => {
            setupEventListeners();
            ProgressiveEnhancement.execute();
            UIRenderPipeline.setStage('liveUpdate');
            LiveUpdateEngine.initialize();
            updateMoodChartUI();
            updateMyStatusPreviewUI();
            updateCurrentSectionUI();
            SkeletonLoader.hideAll();
            UILogger.info('Init', 'UI fully initialized');
        }, 200);
    };
    
    // Listen for module active event
document.addEventListener('moduleActive', () => {
    UILogger.info('Init', 'Module active event received');
    enableProtectedUI();
    setupEventListeners();
    renderStatusListInstantlyUI();
    updateMyStatusPreviewUI();
    updateCurrentSectionUI();
});

document.addEventListener('statusLifecycleChange', (e) => {
    UILogger.info('Init', `Lifecycle change: ${e.detail?.state}`);
    if (e.detail && e.detail.state === 'ACTIVE') {
        UILogger.info('Init', 'ACTIVE state - enabling UI');
        enableProtectedUI();
        setupEventListeners();
        renderStatusListInstantlyUI();
        updateMyStatusPreviewUI();
        updateCurrentSectionUI();
    }
});

    // Fallback polling (in case events don't fire)
    pollingInterval = setInterval(() => {
        pollCount++;
        const currentLifecycle = getLifecycleState();
        const isSessionActive = core && core.isSessionReady && core.isSessionReady();
        
        if ((currentLifecycle && currentLifecycle.state === LifecycleState.ACTIVE) || isSessionActive) {
            if (!finalized) {
                onModuleActive();
            }
        } else if (pollCount >= MAX_POLLS) {
            clearInterval(pollingInterval);
            if (!finalized) {
                UILogger.warn('Init', 'Handshake timeout - using cached data');
                UIRenderPipeline.updateHandshakeStatus('failed');
                SkeletonLoader.hideAll();
            }
        }
    }, 500); // Check every 500ms instead of 1000ms for faster response
}
        
        // Show connecting status after 2 seconds if still waiting
        setTimeout(() => {
            if (UIRenderPipeline.handshakeStatus === 'waiting') {
                UIRenderPipeline.updateHandshakeStatus('connecting');
            }
        }, 2000);
        
        // Show failure after 10 seconds if still not connected
        setTimeout(() => {
            const currentLifecycle = getLifecycleState();
            const isSessionActive = core && core.isSessionReady && core.isSessionReady();
            if (UIRenderPipeline.handshakeStatus === 'connecting' && 
                !isTokenReady && 
                (!currentLifecycle || currentLifecycle.state !== LifecycleState.ACTIVE) &&
                !isSessionActive) {
                UIRenderPipeline.updateHandshakeStatus('failed');
                SkeletonLoader.hideAll();
            }
        }, 10000);
        
        // Restore filters from saved state
        UIStateManager.restoreFilters();
        
        // Rebind handlers after a short delay
        setTimeout(() => {
            UIFailsafe._rebindAllHandlers();
        }, 500);
        
        // Monitor lifecycle state changes
        const updateLifecycle = () => {
            const lifecycleState = getLifecycleState();
            if (lifecycleState) {
                UIRenderPipeline.updateLifecycleState(lifecycleState.state);
                if (lifecycleState.state === LifecycleState.ACTIVE) {
                    enableProtectedUI();
                    // Refresh data when becoming active
                    if (core && core.loadStatuses) {
                        core.loadStatuses().catch(() => {});
                if (typeof _fetchFriendStatusesDirect === 'function') {
                    _fetchFriendStatusesDirect();
                }
                    }
                }
            }
        };
        setInterval(updateLifecycle, 1000);
        
        // Listen for session ready events
        document.addEventListener('sessionReady', (e) => {
            UILogger.info('Init', 'Session ready event received');
            if (e.detail && e.detail.user) {
                currentUser = e.detail.user;
                userData = currentUser;
                isTokenReady = true;
                enableProtectedUI();
                renderStatusListInstantlyUI();
                updateMyStatusPreviewUI();
            }
        });
        
    } catch (error) {
        UILogger.error('Init', 'Failed to initialize UI', error);
        SkeletonLoader.hideAll();
        UIRenderPipeline.updateHandshakeStatus('failed');
        const container = UIElements.allStatusList;
        if (container) {
            container.innerHTML = uiErrorBoundary.createStatusListFallback();
        }
    }
});

window.addEventListener('beforeunload', cleanupUI);
window.addEventListener('pagehide', cleanupUI);

function updateUserUIInstantly() {}

// Add this near the end of status-ui.js, before the exports
function retryBindHandlers() {
    UILogger.info('UI', 'Manually retrying handler binding');
    UIFailsafe._rebindAllHandlers();
    setupEventListeners();
    enableProtectedUI();
    
    // Force re-render
    if (typeof renderStatusListInstantlyUI === 'function') {
        renderStatusListInstantlyUI();
    }
    if (typeof updateMyStatusPreviewUI === 'function') {
        updateMyStatusPreviewUI();
    }
    if (typeof updateCurrentSectionUI === 'function') {
        updateCurrentSectionUI();
    }
}

// Expose to window for debugging
window.retryBindHandlers = retryBindHandlers;

// =============================================
// =============================================
// EXPORTS — removed ES module export syntax since this file
// is loaded as a regular <script defer> (not type="module").
// All public API is exposed via window.statusUI below.
// =============================================

// =============================================
// GLOBAL EXPOSURE
// =============================================
if (typeof window !== 'undefined') {
    // Explicitly expose key functions on window so status-core.js
    // (a separate regular script) can call them by name
    window.renderStatusListInstantlyUI  = renderStatusListInstantlyUI;
    window.renderStatusesListUI         = renderStatusesListUI;
    window.updateMyStatusPreviewUI      = updateMyStatusPreviewUI;
    window.showStatusGroupViewer        = showStatusGroupViewer;
    window.showStatusViewer             = showStatusViewer;
    window.showNotification             = showNotification;
    window.closeViewer                  = closeViewer;
    try {
        window.statusUI = {
            showStatusViewer,
            showNotification,
            updateCurrentSection: updateCurrentSectionUI,
            renderStatusListInstantly: renderStatusListInstantlyUI,
            updateMyStatusPreview: updateMyStatusPreviewUI,
            updateMoodChart: updateMoodChartUI,
            enableProtectedUI,
            disableProtectedUI,
            showLogoutState,
            showReconnectionState,
            renderStatusesList: renderStatusesListUI,
            cleanupUI,
            retryHandshake,
            showDiagnosticOverlay,
            retryLoad: () => {
                if (ensureUIActive('retryLoad') && isSessionReady()) {
                    const core = getCore();
                    if (core && core.loadStatuses) {
                        core.loadStatuses().catch(() => {});
                    }
                }
            },
            isActive: () => {
                const lifecycle = getLifecycleState();
                const LifecycleState = getLifecycleStateEnum();
                return lifecycle ? lifecycle.state === LifecycleState.ACTIVE : false;
            }
        };
        
        window.handleCreateStatusClick = handleCreateStatusClick;
        window.closeModal = closeModal;
        window.closeNotification = closeNotification;
        
// ═══════════════════════════════════════════════════════════════════
// P3 FIX: Feed tab switcher — Friends / Discover (Ranked) / Memories
// ═══════════════════════════════════════════════════════════════════
let _activeFeedTab = 'friends';
let _rankedLoaded  = false;
let _memoriesLoaded = false;

window._switchFeedTab = async function(tab) {
    if (_activeFeedTab === tab) return;
    _activeFeedTab = tab;

    // Update tab button styles
    document.querySelectorAll('.sft-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.feed === tab);
    });

    // Show/hide sections
    const sections = {
        friends:  ['allStatusSection', 'viewedStatusSection', 'recentUpdatesLabel', 'viewedUpdatesLabel'],
        ranked:   ['rankedStatusSection'],
        memories: ['memoriesStatusSection'],
    };
    const allSections = ['allStatusSection', 'viewedStatusSection', 'rankedStatusSection',
                         'memoriesStatusSection', 'recentUpdatesLabel', 'viewedUpdatesLabel'];

    allSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    (sections[tab] || []).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });

    // Lazy-load ranked feed
    if (tab === 'ranked' && !_rankedLoaded) {
        _rankedLoaded = true;
        try {
            const api = window.StatusAPI;
            if (!api || !api.getRankedFeed) return;
            const result = await api.getRankedFeed(30, 0);
            const statuses = (result && result.data && result.data.statuses) || [];
            const list = document.getElementById('rankedStatusList');
            if (!list) return;
            if (!statuses.length) {
                list.innerHTML = '<p style="padding:20px;text-align:center;color:rgba(255,255,255,0.5);">No public statuses yet.</p>';
                return;
            }
            // Reuse existing renderStatusRow / createStatusItem from the page
            list.innerHTML = statuses.map(s => {
                const avatar = s.user && s.user.avatar ? `background-image:url(${s.user.avatar})` : '';
                const name   = (s.user && (s.user.displayName || s.user.username)) || 'Unknown';
                const time   = s.createdAt ? timeSince(new Date(s.createdAt)) : '';
                const icon   = s.type === 'image' ? '🖼️' : s.type === 'video' ? '🎥' : s.type === 'poll' ? '📊' : '💬';
                return `<div class="sw-contact-row status-row" data-status-id="${s.id}"
                              onclick="window._openRankedStatus && window._openRankedStatus('${s.id}')">
                    <div class="sw-avatar status-ring ${s.isPinned ? 'pinned-ring' : ''}" style="${avatar}">
                        ${!avatar ? name.charAt(0).toUpperCase() : ''}
                    </div>
                    <div class="sw-contact-info">
                        <div class="sw-contact-name">${UISanitizer ? UISanitizer.sanitizeHTML(name) : name} ${s.isPinned ? '📌' : ''}</div>
                        <div class="sw-contact-status">${icon} ${s.content ? (s.content.slice(0,60) + (s.content.length > 60 ? '…' : '')) : ''}</div>
                    </div>
                    <div class="sw-time">${time}</div>
                </div>`;
            }).join('');

            // Open ranked status in viewer on click
            window._openRankedStatus = async function(statusId) {
                try {
                    const api = window.StatusAPI;
                    if (!api) return;
                    const res = await api.getStatus(statusId);
                    const s = res && res.data && res.data.status;
                    if (s && typeof showSingleStatus === 'function') showSingleStatus(s);
                } catch(_) {}
            };
        } catch(err) {
            console.warn('[status-ui] Ranked feed error:', err.message);
        }
    }

    // Lazy-load memories feed
    if (tab === 'memories' && !_memoriesLoaded) {
        _memoriesLoaded = true;
        try {
            const api = window.StatusAPI;
            if (!api || !api.getMemories) return;
            const result = await api.getMemories();
            const statuses = (result && result.data && result.data.statuses) || [];
            const list = document.getElementById('memoriesStatusList');
            if (!list) return;
            if (!statuses.length) {
                list.innerHTML = '<div style="padding:32px;text-align:center;color:rgba(255,255,255,0.5);"><div style="font-size:40px;margin-bottom:8px;">\U0001F4C5</div><p>No memories yet — check back after you\u2019ve posted for a year!</p></div>';
                return;
            }
            list.innerHTML = `<p style="padding:12px 16px 4px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);">On this day in the past</p>` +
                statuses.map(s => {
                    const year = new Date(s.createdAt).getFullYear();
                    const now  = new Date().getFullYear();
                    const ago  = now - year;
                    const avatar = s.user && s.user.avatar ? `background-image:url(${s.user.avatar})` : '';
                    const name   = (s.user && (s.user.displayName || s.user.username)) || 'You';
                    return `<div class="sw-contact-row status-row memory-row" data-status-id="${s.id}">
                        <div class="sw-avatar" style="${avatar}">${!avatar ? name.charAt(0).toUpperCase() : ''}</div>
                        <div class="sw-contact-info">
                            <div class="sw-contact-name">${ago} year${ago !== 1 ? 's' : ''} ago — ${year}</div>
                            <div class="sw-contact-status">${s.content ? s.content.slice(0,60) : s.type}</div>
                        </div>
                        <button class="re-share-btn" onclick="window._reShareMemory && window._reShareMemory('${s.id}')" style="background:#00a884;border:none;border-radius:20px;padding:6px 12px;color:#fff;font-size:12px;cursor:pointer;">Re-share</button>
                    </div>`;
                }).join('');

            // Re-share a memory status
            window._reShareMemory = async function(statusId) {
                try {
                    const api = window.StatusAPI;
                    if (!api) return;
                    const res = await api.getStatus(statusId);
                    const s = res && res.data && res.data.status;
                    if (!s) return;
                    // Pre-fill create modal
                    const captionInput = document.getElementById('statusTextInput') || document.getElementById('statusText');
                    if (captionInput) captionInput.value = s.content || '';
                    const modal = document.getElementById('createStatusModal');
                    if (modal) modal.classList.add('active');
                    showNotification('Memory loaded — edit and post!', 'success');
                } catch(_) {}
            };
        } catch(err) {
            console.warn('[status-ui] Memories feed error:', err.message);
        }
    }
};


// ═══════════════════════════════════════════════════════════════════
// P2/P3 FIX: Sticker system — Mention, Link, Countdown, Alt Text
// ═══════════════════════════════════════════════════════════════════
const _mentionedUsers = []; // array of {userId, username, displayName}

// Mention search
window._searchMentions = async function(query) {
    const suggestions = document.getElementById('mentionSuggestions');
    if (!suggestions) return;
    if (!query || query.trim().length < 1) { suggestions.style.display = 'none'; return; }

    try {
        const api = window.StatusAPI;
        // Use getFriends or searchUsers
        let users = [];
        if (api && api.searchUsers) {
            const r = await api.searchUsers(query.trim());
            users = (r && r.data && r.data.users) || (r && r.users) || [];
        } else {
            // Fallback: filter from already-loaded friends list
            const allAvatars = document.querySelectorAll('.sw-contact-row .sw-contact-name');
            users = Array.from(allAvatars).map(el => ({ displayName: el.textContent })).filter(u =>
                u.displayName.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 5);
        }

        if (!users.length) { suggestions.style.display = 'none'; return; }

        suggestions.innerHTML = users.slice(0, 6).map(u => {
            const name = u.displayName || u.username || 'User';
            const uid  = u.id || u.userId || '';
            return `<div class="mention-suggestion-item" onclick="window._addMention(${JSON.stringify({userId:uid, displayName:name, username:u.username||name})})"
                         style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;color:#e9edef;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;">${name.charAt(0).toUpperCase()}</div>
                        <span>${name}</span>
                    </div>`;
        }).join('');
        suggestions.style.display = 'block';
    } catch(_) {
        suggestions.style.display = 'none';
    }
};

window._addMention = function(user) {
    // Avoid duplicates
    if (_mentionedUsers.some(u => String(u.userId) === String(user.userId))) return;
    _mentionedUsers.push(user);

    const tags = document.getElementById('mentionTags');
    if (tags) {
        const tag = document.createElement('div');
        tag.className = 'mention-tag';
        tag.dataset.uid = user.userId;
        tag.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:rgba(0,168,132,0.2);border:1px solid rgba(0,168,132,0.4);border-radius:20px;padding:4px 10px;font-size:12px;color:#fff;';
        tag.innerHTML = `@${user.displayName || user.username} <span onclick="window._removeMention('${user.userId}')" style="cursor:pointer;opacity:0.7;font-size:14px;">&times;</span>`;
        tags.appendChild(tag);
    }
    // Clear search
    const input = document.getElementById('mentionSearchInput');
    const suggestions = document.getElementById('mentionSuggestions');
    if (input) input.value = '';
    if (suggestions) suggestions.style.display = 'none';
};

window._removeMention = function(userId) {
    const idx = _mentionedUsers.findIndex(u => String(u.userId) === String(userId));
    if (idx > -1) _mentionedUsers.splice(idx, 1);
    const tag = document.querySelector(`.mention-tag[data-uid="${userId}"]`);
    if (tag) tag.remove();
};

// Collect all sticker values before status POST
function collectStickerData() {
    const data = {};

    // Mentions
    if (_mentionedUsers.length > 0) {
        data.mentions = _mentionedUsers.map(u => ({ userId: u.userId, displayName: u.displayName }));
    }

    // Link sticker
    const linkUrl   = (document.getElementById('linkUrlInput')   || {}).value;
    const linkLabel = (document.getElementById('linkLabelInput') || {}).value;
    if (linkUrl && linkUrl.trim()) {
        data.linkUrl   = linkUrl.trim();
        data.linkLabel = linkLabel.trim() || 'Visit';
    }

    // Countdown sticker
    const cdTarget = (document.getElementById('countdownTargetDate') || {}).value;
    const cdLabel  = (document.getElementById('countdownLabel')      || {}).value;
    if (cdTarget) {
        data.countdown      = cdTarget;
        data.countdownLabel = cdLabel.trim() || '';
    }

    // Alt text (shown for media tab)
    const altText = (document.getElementById('altTextInput') || {}).value;
    if (altText && altText.trim()) {
        data.altText = altText.trim();
    }

    // Active template
    if (window._activeTemplate) {
        data.background = window._activeTemplate.background;
        data.textColor  = window._activeTemplate.textColor;
        data.fontFamily = window._activeTemplate.fontFamily;
        data.templateId = window._activeTemplate.id;
    }

    // Hashtags — auto-extract from content
    const contentEl = document.getElementById('textStatusInput') || document.getElementById('statusText');
    if (contentEl) {
        const tags = (contentEl.value.match(/#([\w]+)/g) || []).map(t => t.replace('#', ''));
        if (tags.length) data.hashtags = tags;
    }

    return data;
}
window._collectStickerData = collectStickerData;

// Reset sticker state after successful post
function resetStickerState() {
    _mentionedUsers.length = 0;
    const tags = document.getElementById('mentionTags');
    if (tags) tags.innerHTML = '';
    const input = document.getElementById('mentionSearchInput');
    if (input) input.value = '';
    const linkUrl = document.getElementById('linkUrlInput');
    if (linkUrl) linkUrl.value = '';
    const linkLabel = document.getElementById('linkLabelInput');
    if (linkLabel) linkLabel.value = '';
    const cdTarget = document.getElementById('countdownTargetDate');
    if (cdTarget) cdTarget.value = '';
    const cdLabel = document.getElementById('countdownLabel');
    if (cdLabel) cdLabel.value = '';
    const altText = document.getElementById('altTextInput');
    if (altText) altText.value = '';
    window._activeTemplate = null;
}
window._resetStickerState = resetStickerState;

// Show alt text field when media tab is active
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.create-status-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            const altSection = document.getElementById('altTextSection');
            if (altSection) altSection.style.display = (tab === 'media') ? 'block' : 'none';
        });
    });
});


// ═══════════════════════════════════════════════════════════════════
// P3 FIX: GIF sticker — GIPHY search (uses public beta API key)
// ═══════════════════════════════════════════════════════════════════
let _selectedGifUrl = null;
const GIPHY_KEY = window.GIPHY_API_KEY || 'dc6zaTOxFJmzC'; // public beta key (limited)

window._searchGifs = async function() {
    const input = document.getElementById('gifSearchInput');
    const results = document.getElementById('gifResults');
    if (!input || !results) return;
    const q = input.value.trim();
    if (!q) return;

    results.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:rgba(255,255,255,0.5);padding:8px;"></i>';
    try {
        const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=12&rating=pg`;
        const resp = await fetch(url);
        const data = await resp.json();
        const gifs = (data && data.data) || [];

        if (!gifs.length) {
            results.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:12px;padding:4px;">No GIFs found.</p>';
            return;
        }

        results.innerHTML = gifs.map(g => {
            const preview = g.images && g.images.fixed_height_small && g.images.fixed_height_small.url;
            const full    = g.images && g.images.downsized && g.images.downsized.url;
            if (!preview || !full) return '';
            return `<img src="${preview}" data-full="${full}" alt="${g.title}"
                         title="Click to select"
                         style="height:80px;border-radius:8px;cursor:pointer;border:2px solid transparent;object-fit:cover;"
                         onclick="window._selectGif('${full}', this)">`;
        }).join('');
    } catch(err) {
        results.innerHTML = '<p style="color:rgba(255,99,71,0.8);font-size:12px;padding:4px;">GIF search failed. Check your connection.</p>';
        console.warn('[status-ui] GIF search error:', err.message);
    }
};

window._selectGif = function(url, imgEl) {
    _selectedGifUrl = url;
    // Highlight selected
    document.querySelectorAll('#gifResults img').forEach(i => i.style.borderColor = 'transparent');
    imgEl.style.borderColor = '#00a884';
    const note = document.getElementById('gifSelected');
    if (note) note.style.display = 'block';
};

// ═══════════════════════════════════════════════════════════════════
// P3 FIX: Music overlay — collect from inputs
// ═══════════════════════════════════════════════════════════════════
function collectMusicData() {
    const title  = (document.getElementById('musicTrackTitle')  || {}).value || '';
    const artist = (document.getElementById('musicTrackArtist') || {}).value || '';
    const url    = (document.getElementById('musicTrackUrl')    || {}).value || '';
    if (!title.trim() && !url.trim()) return null;
    return { title: title.trim(), artist: artist.trim(), url: url.trim() };
}

// Reset GIF + music on post
const _origResetSticker = window._resetStickerState;
window._resetStickerState = function() {
    if (_origResetSticker) _origResetSticker();
    _selectedGifUrl = null;
    const gifInput = document.getElementById('gifSearchInput');
    const gifResults = document.getElementById('gifResults');
    const gifNote  = document.getElementById('gifSelected');
    if (gifInput)   gifInput.value = '';
    if (gifResults) gifResults.innerHTML = '';
    if (gifNote)    gifNote.style.display = 'none';
    ['musicTrackTitle','musicTrackArtist','musicTrackUrl'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
};

// Augment collectStickerData with GIF + music
const _origCollect = window._collectStickerData;
window._collectStickerData = function() {
    const base = _origCollect ? _origCollect() : {};

    // GIF
    if (_selectedGifUrl) {
        base.mediaUrl  = _selectedGifUrl;
        base.mediaType = 'gif';
        base.type      = 'image'; // backend treats as image
    }

    // Music
    const music = collectMusicData();
    if (music) base.musicTrack = music;

    return base;
};


// ═══════════════════════════════════════════════════════════════════
// P3 FIX: Drawing / Doodle canvas
// ═══════════════════════════════════════════════════════════════════
let _canvasHistory = [];
let _isDrawing = false;
let _lastX = 0, _lastY = 0;

window._initDrawingCanvas = function() {
    const canvas = document.getElementById('statusDrawCanvas');
    if (!canvas || canvas._initialized) return;
    canvas._initialized = true;
    const ctx = canvas.getContext('2d');

    // High-DPI fix
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, rect.width, rect.height);

    function getPos(e) {
        const r = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return [(touch.clientX - r.left) * dpr, (touch.clientY - r.top) * dpr];
    }

    function saveHistory() {
        _canvasHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (_canvasHistory.length > 30) _canvasHistory.shift();
    }

    function startDraw(e) {
        e.preventDefault();
        saveHistory();
        _isDrawing = true;
        [_lastX, _lastY] = getPos(e);
    }

    function draw(e) {
        e.preventDefault();
        if (!_isDrawing) return;
        const color = (document.getElementById('drawColor') || {}).value || '#ffffff';
        const size  = parseInt((document.getElementById('drawSize') || {}).value || 8, 10);
        ctx.strokeStyle = color;
        ctx.lineWidth   = size / dpr;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        const [x, y] = getPos(e);
        ctx.beginPath();
        ctx.moveTo(_lastX / dpr, _lastY / dpr);
        ctx.lineTo(x / dpr, y / dpr);
        ctx.stroke();
        [_lastX, _lastY] = [x, y];
    }

    function stopDraw(e) { _isDrawing = false; }

    canvas.addEventListener('mousedown',  startDraw);
    canvas.addEventListener('mousemove',  draw);
    canvas.addEventListener('mouseup',    stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove',  draw,      { passive: false });
    canvas.addEventListener('touchend',   stopDraw);
};

window._clearCanvas = function() {
    const canvas = document.getElementById('statusDrawCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    _canvasHistory = [];
};

window._undoCanvas = function() {
    if (!_canvasHistory.length) return;
    const canvas = document.getElementById('statusDrawCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const prev = _canvasHistory.pop();
    ctx.putImageData(prev, 0, 0);
};

window._saveCanvasAsMedia = function() {
    const canvas = document.getElementById('statusDrawCanvas');
    if (!canvas) return;
    canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], 'drawing-' + Date.now() + '.png', { type: 'image/png' });
        // Preview the drawing in media tab
        const preview = document.getElementById('mediaPreviewContainer') || document.getElementById('mediaPreview');
        if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:10px;" alt="Drawing">`;
            preview.style.display = 'block';
        }
        // Store file for upload path
        window._pendingDrawingFile = file;
        // Switch to media tab to confirm
        const mediaTab = document.querySelector('.create-status-tab[data-tab="media"]');
        if (mediaTab) mediaTab.click();
        showNotification('Drawing ready — post from Media tab', 'success');
    }, 'image/png');
};

// ═══════════════════════════════════════════════════════════════════
// P3 FIX: Music overlay renderer in story viewer
// ═══════════════════════════════════════════════════════════════════
function renderMusicOverlay(statusData) {
    const overlay  = document.getElementById('statusMusicOverlay');
    const titleEl  = document.getElementById('musicOverlayTitle');
    const artistEl = document.getElementById('musicOverlayArtist');
    const player   = document.getElementById('statusMusicPlayer');
    const playBtn  = document.getElementById('musicPlayPauseBtn');
    if (!overlay) return;

    const meta = statusData && statusData.metadata;
    const track = meta && meta.musicTrack;

    if (track && (track.title || track.url)) {
        if (titleEl)  titleEl.textContent  = track.title  || 'Unknown Track';
        if (artistEl) artistEl.textContent = track.artist || '';
        if (player && track.url) {
            player.src = track.url;
            player.play().catch(() => {}); // auto-play (may be blocked by browser)
        }
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        overlay.style.display = 'flex';
    } else {
        if (player) { player.pause(); player.src = ''; }
        overlay.style.display = 'none';
    }
}
window._renderMusicOverlay = renderMusicOverlay;

window._toggleStatusMusic = function() {
    const player  = document.getElementById('statusMusicPlayer');
    const playBtn = document.getElementById('musicPlayPauseBtn');
    if (!player) return;
    if (player.paused) {
        player.play().catch(() => {});
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        player.pause();
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
};


// ═══════════════════════════════════════════════════════════════════
// P3 FIX: Creator Analytics Bottom Sheet
// ═══════════════════════════════════════════════════════════════════
window._showStatusAnalytics = async function() {
    const sheet   = document.getElementById('statusAnalyticsSheet');
    const backdrop = document.getElementById('statusAnalyticsBackdrop');
    const content = document.getElementById('statusAnalyticsContent');
    if (!sheet || !content) return;

    sheet.style.display   = 'block';
    if (backdrop) backdrop.style.display = 'block';
    content.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin" style="color:#a78bfa;font-size:24px;"></i></div>';

    const statusId = window.currentViewerStatus && window.currentViewerStatus.id;
    if (!statusId) {
        content.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);">No status selected.</p>';
        return;
    }

    try {
        const api = window.StatusAPI;
        if (!api || !api.getStatusAnalytics) {
            content.innerHTML = '<p style="color:rgba(255,255,255,0.5);">Analytics not available.</p>';
            return;
        }
        const result = await api.getStatusAnalytics(statusId);
        if (!result || !result.success) {
            content.innerHTML = '<p style="color:rgba(255,99,71,0.8);">Failed to load analytics.</p>';
            return;
        }
        const d = result.data;
        const m = d.metrics || {};
        const engColor = parseFloat(m.engagementRate) > 5 ? '#00a884' : parseFloat(m.engagementRate) > 2 ? '#f9c74f' : '#ff6b6b';

        content.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                ${[
                    ['👁 Views',    m.views,    '#4cc9f0'],
                    ['❤️ Likes',    m.likes,    '#ff6b6b'],
                    ['💬 Comments', m.comments, '#a78bfa'],
                    ['↗️ Shares',   m.shares,   '#00a884'],
                ].map(([label, val, color]) => `
                    <div style="background:rgba(255,255,255,0.06);border-radius:14px;padding:14px;text-align:center;">
                        <div style="font-size:22px;font-weight:800;color:${color};">${val || 0}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:4px;">${label}</div>
                    </div>`).join('')}
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:14px;padding:14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:13px;color:rgba(255,255,255,0.7);">Engagement rate</span>
                <span style="font-size:18px;font-weight:800;color:${engColor};">${m.engagementRate || '0.0%'}</span>
            </div>
            ${d.pollStats ? `
            <div style="background:rgba(255,255,255,0.06);border-radius:14px;padding:14px;margin-bottom:12px;">
                <p style="font-size:12px;font-weight:600;color:#a78bfa;margin-bottom:8px;">📊 Poll Results</p>
                ${(d.pollStats.options || []).map(o => {
                    const pct = d.pollStats.totalVotes > 0 ? Math.round((o.votes || 0) / d.pollStats.totalVotes * 100) : 0;
                    return `<div style="margin-bottom:6px;">
                        <div style="display:flex;justify-content:space-between;font-size:12px;color:#e9edef;margin-bottom:3px;">
                            <span>${o.text}</span><span>${pct}% (${o.votes || 0})</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:6px;">
                            <div style="background:#a78bfa;width:${pct}%;height:100%;border-radius:4px;transition:width .4s;"></div>
                        </div>
                    </div>`;
                }).join('')}
                <p style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px;">${d.pollStats.voterCount} voter${d.pollStats.voterCount !== 1 ? 's' : ''} · ${d.pollStats.totalVotes} total votes</p>
            </div>` : ''}
            ${d.questionStats ? `
            <div style="background:rgba(255,255,255,0.06);border-radius:14px;padding:14px;margin-bottom:12px;">
                <p style="font-size:12px;font-weight:600;color:#a78bfa;margin-bottom:6px;">❓ Question: ${d.questionStats.questionText || ''}</p>
                <p style="font-size:13px;color:#e9edef;">${d.questionStats.answersCount} answer${d.questionStats.answersCount !== 1 ? 's' : ''}</p>
                ${(d.questionStats.answers || []).slice(0, 5).map(a => `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;margin-top:6px;font-size:12px;color:#e9edef;">${a.text}</div>`).join('')}
            </div>` : ''}
            ${d.actionClickStats ? `
            <div style="background:rgba(255,255,255,0.06);border-radius:14px;padding:14px;margin-bottom:12px;">
                <p style="font-size:12px;font-weight:600;color:#a78bfa;margin-bottom:8px;">🔗 Action Button Clicks: ${d.actionClickStats.totalClicks}</p>
                ${Object.entries(d.actionClickStats.byButton || {}).map(([k, v]) =>
                    `<div style="display:flex;justify-content:space-between;font-size:12px;color:#e9edef;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                        <span>${k}</span><span style="color:#00a884;font-weight:700;">${v}</span>
                    </div>`
                ).join('')}
            </div>` : ''}
            <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px 12px;">
                <p style="font-size:11px;color:rgba(255,255,255,0.4);">
                    Posted ${d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'recently'} &nbsp;·&nbsp; Type: ${d.type || 'text'}
                    ${d.isPinned ? '&nbsp;·&nbsp; 📌 Pinned' : ''}
                </p>
            </div>
        `;
    } catch(err) {
        content.innerHTML = `<p style="color:rgba(255,99,71,0.8);">Error: ${err.message}</p>`;
        console.warn('[status-ui] Analytics error:', err);
    }
};

window.handlePostStatus = handlePostStatus;
        window.handleSaveDraft = handleSaveDraft;
        window.handleScheduleClick = handleScheduleClick;
        window.handleConfirmSchedule = handleConfirmSchedule;
        window.showHighlightsModal = showHighlightsModal;
        window.showHighlightsEditor = showHighlightsEditor;
        window.saveHighlight = saveHighlight;
        window.showMemoryTimelineModal = showMemoryTimelineModal;
        window.exportTimeline = exportTimeline;
        window.showStatsModal = showStatsModal;
        window.loadStatsContent = loadStatsContent;
        window.showDraftsModal = showDraftsModal;
        window.deleteAllDrafts = deleteAllDrafts;
        window.loadSelectedDraft = loadSelectedDraft;
        window.showScheduleModal = showScheduleModal;
        window.viewMyStatus = viewMyStatus;
        window.editMyStatus = editMyStatus;
        window.clearTextInput = clearTextInput;
        window.addPollOption = addPollOption;
        window.clearAllFilters = clearAllFilters;
        window.closeViewer = closeViewer;
        window.toggleAutoAdvance = toggleAutoAdvance;
        window.handleMuteFromViewer = handleMuteFromViewer;
        window.shareCurrentStatus = shareCurrentStatus;
        window.handleSaveStatus = handleSaveStatus;
        window.showReportModal = showReportModal;
        window.handleSubmitReport = handleSubmitReport;
        window.sendReply = sendReply;
        window.retryConnection = retryConnection;
        window.enableOfflineMode = enableOfflineMode;
        window.retryHandshake = retryHandshake;

        // Real-time UI update helpers (called by StatusWebSocket handlers)
        window.updateStatusReactionUI = function(statusId, emoji, count) {
            try {
                const sid = String(statusId);
                const currentSid = String(window.__currentViewingStatusId || (currentViewerStatus && currentViewerStatus.id) || '');
                // Update emoji trigger icon when viewing that status
                if (sid === currentSid) {
                    const eti = document.getElementById('emojiTriggerIcon');
                    if (eti) eti.textContent = emoji;
                }
                // Update reaction badge on sidebar list item
                const listItem = document.querySelector('.status-group-item[data-status-ids*="' + sid + '"]');
                if (listItem) {
                    let badges = listItem.querySelector('.status-group-badges');
                    if (!badges) {
                        badges = document.createElement('div');
                        badges.className = 'status-group-badges';
                        const info = listItem.querySelector('.status-group-info');
                        if (info) info.appendChild(badges);
                    }
                    let rb = badges.querySelector('.reaction-badge');
                    if (!rb) { rb = document.createElement('span'); rb.className = 'status-badge reaction-badge'; badges.appendChild(rb); }
                    rb.textContent = emoji + (count > 1 ? ' ' + count : '');
                }
            } catch (_) {}
        };

        window.updateViewerCountUI = function(statusId, count) {
            try {
                if (currentViewerStatus && String(currentViewerStatus.id) === String(statusId)) {
                    const el = document.querySelector('.viewer-count, .view-count, [data-viewer-count]');
                    if (el) el.textContent = count + ' views';
                }
            } catch (_) {}
        };
        
    } catch (e) {
        console.error('[UI] Failed to expose globals:', e);
    }
}

UILogger.info('StatusUI', 'Resilient UI controller initialized successfully v8.2 - Fixed ES module imports');

// ── SETTINGS LIVE-APPLY BRIDGE ────────────────────────────────────────────────
// Listen for SETTING_CHANGED / SETTINGS_UPDATED messages forwarded by the parent
// and immediately apply visual changes (theme, font, compact mode, etc.) to the
// status iframe DOM, keeping it in sync with the settings module.
(function attachSettingsBridge() {
    function applyOneSettingToUI(section, key, value) {
        try {
            if (section === 'appearance') {
                if (key === 'theme') {
                    const resolved = value === 'auto'
                        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                        : value;
                    document.documentElement.setAttribute('data-theme', resolved);
                    document.body.setAttribute('data-theme', resolved);
                }
                if (key === 'fontSize' && value) document.documentElement.style.fontSize = value + 'px';
                if (key === 'accentColor' && value) document.documentElement.style.setProperty('--accent-color', value);
                if (key === 'compactMode') {
                    document.documentElement.setAttribute('data-compact', value ? 'true' : 'false');
                    document.body.classList.toggle('compact-mode', !!value);
                }
                if (key === 'animationsEnabled' || key === 'animations') {
                    document.documentElement.setAttribute('data-animations', value ? 'true' : 'false');
                    document.body.classList.toggle('no-animations', !value);
                }
                if (key === 'language') document.documentElement.setAttribute('lang', value);
            }
            if (section === 'advanced') {
                if (key === 'reduceMotion') {
                    document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false');
                    document.body.classList.toggle('reduce-motion', !!value);
                }
                if (key === 'performanceMode') document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false');
            }
            // Forward to core's applySettingToStatusModule if available (handles
            // notification sound flags, privacy flags, etc.)
            if (typeof applySettingToStatusModule === 'function') {
                applySettingToStatusModule(section, key, value);
            }
        } catch(e) {}
    }

    window.addEventListener('message', function onSettingsMessage(event) {
        const d = event.data;
        if (!d || typeof d !== 'object') return;

        if (d.type === 'SETTING_CHANGED') {
            const { section, key, value } = d.payload || d;
            if (section && key !== undefined) applyOneSettingToUI(section, key, value);
        }

        if (d.type === 'SETTINGS_UPDATED') {
            const settings = d.payload?.settings || d.settings || {};
            Object.entries(settings).forEach(([sec, secVal]) => {
                if (secVal && typeof secVal === 'object') {
                    Object.entries(secVal).forEach(([k, v]) => applyOneSettingToUI(sec, k, v));
                }
            });
        }
    });

    // UNIFIED SETTINGS SUBSCRIPTION - Single source of truth
    // Subscribe to AppSettings for all settings changes
    if (window.AppSettings) {
        window.AppSettings.subscribe(function(settings, path, value) {
            try {
                if (path && path !== '*') {
                    // Single setting changed
                    const parts = path.split('.');
                    const section = parts[0];
                    const key = parts.slice(1).join('.');
                    applyOneSettingToUI(section, key, value);
                } else {
                    // Full settings object changed
                    if (settings) {
                        Object.entries(settings).forEach(([sec, secVal]) => {
                            if (secVal && typeof secVal === 'object')
                                Object.entries(secVal).forEach(([k, v]) => applyOneSettingToUI(sec, k, v));
                        });
                    }
                }
            } catch(err) {
                console.warn('[StatusUI] Settings subscription error:', err);
            }
        });
    } else {
        // Fallback: Wait for AppSettings to be ready
        window.addEventListener('appSettingsReady', function() {
            if (window.AppSettings) {
                window.AppSettings.subscribe(function(settings, path, value) {
                    try {
                        if (path && path !== '*') {
                            const parts = path.split('.');
                            const section = parts[0];
                            const key = parts.slice(1).join('.');
                            applyOneSettingToUI(section, key, value);
                        } else {
                            if (settings) {
                                Object.entries(settings).forEach(([sec, secVal]) => {
                                    if (secVal && typeof secVal === 'object')
                                        Object.entries(secVal).forEach(([k, v]) => applyOneSettingToUI(sec, k, v));
                                });
                            }
                        }
                    } catch(err) {
                        console.warn('[StatusUI] Settings subscription error:', err);
                    }
                });
            }
        }, { once: true });
    }

    // Legacy event listeners for backwards compatibility
    window.addEventListener('settingChanged', function(e) {
        const { section, key, value } = e.detail || {};
        if (section && key !== undefined) applyOneSettingToUI(section, key, value);
    });
    window.addEventListener('settingsUpdated', function(e) {
        const { settings } = e.detail || {};
        if (settings) {
            Object.entries(settings).forEach(([sec, secVal]) => {
                if (secVal && typeof secVal === 'object')
                    Object.entries(secVal).forEach(([k, v]) => applyOneSettingToUI(sec, k, v));
            });
        }
    });
})();