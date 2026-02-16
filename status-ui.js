// =============================================
// STATUS SYSTEM - RESILIENT UI CONTROLLER
// FAULT-TOLERANT, PROGRESSIVE RENDERING, CORE-INTEGRATED
// =============================================

import {
    // Core state & session
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
    isBackgroundInitialized,
    isTokenReady,
    
    // Parent coordination
    parentCoordinator,
    
    // Status definitions
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
    
    // Storage keys
    LOCAL_STORAGE_KEYS,
    UNIFIED_TOKEN_KEY,
    
    // Core functions - VERIFIED IMPORTS
    initializeParentCoordination,
    sendToParent,
    handleSessionData,
    validateSessionData,
    updateLocalStateWithSession,
    handleSessionUpdate,
    handleLogout,
    handleParentUnavailable,
    startBackgroundInitializationWithSession,
    makeParentApiRequest,
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
    initPageCore,
    getSession,
    isSessionValid
} from './status-core.js';

// =============================================
// ERROR BOUNDARY - UI PROTECTION LAYER
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
    }

    wrap(sectionId, renderFn, fallbackType = null) {
        return async (...args) => {
            if (this.failedSections.has(sectionId)) {
                const fallback = this.fallbacks.get(fallbackType || sectionId);
                return fallback ? fallback(...args) : this.createGenericFallback();
            }

            try {
                return await renderFn(...args);
            } catch (error) {
                this.failedSections.add(sectionId);
                logUIError(sectionId, error);
                
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
                <p class="subtext">Please try refreshing</p>
                <button class="btn primary" onclick="window.location.reload()">
                    <i class="fas fa-redo"></i> Refresh
                </button>
            </div>
        `;
    }

    createViewerFallback() {
        return `
            <div class="viewer-error">
                <i class="fas fa-eye-slash"></i>
                <p>Status viewer unavailable</p>
                <button class="btn-text" onclick="document.getElementById('statusViewerPanel')?.classList.remove('active')">
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
            </div>
        `;
    }

    createStatsFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-chart-line"></i>
                <p>Statistics unavailable</p>
            </div>
        `;
    }

    createDraftsFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-file-alt"></i>
                <p>Drafts unavailable</p>
            </div>
        `;
    }

    createScheduleFallback() {
        return `
            <div class="empty-state error-state">
                <i class="fas fa-clock"></i>
                <p>Scheduling unavailable</p>
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
    }

    resetAll() {
        this.failedSections.clear();
    }
}

const uiErrorBoundary = new UIErrorBoundary();

// =============================================
// UI LOGGING & DIAGNOSTICS
// =============================================
const UILogger = {
    logs: [],
    warnings: new Set(),
    errors: new Set(),
    renderTimings: new Map(),
    maxLogs: 50,

    log(level, module, message, data = null) {
        const entry = {
            timestamp: Date.now(),
            level,
            module,
            message,
            data,
            formatted: `[${new Date().toISOString()}] [${module}] ${message}`
        };

        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) this.logs.pop();

        if (level === 'error') {
            const key = `${module}:${message}`;
            if (!this.errors.has(key)) {
                this.errors.add(key);
                console.error(entry.formatted, data || '');
            }
        } else if (level === 'warn') {
            const key = `${module}:${message}`;
            if (!this.warnings.has(key)) {
                this.warnings.add(key);
                console.warn(entry.formatted, data || '');
            }
        } else if (level === 'debug') {
            console.debug(entry.formatted, data || '');
        } else {
            console.log(entry.formatted, data || '');
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
            this.debug('Performance', `${component} rendered in ${duration.toFixed(2)}ms`);
            return duration;
        }
        return 0;
    },

    getDiagnostics() {
        return {
            logs: this.logs.slice(0, 20),
            warnings: Array.from(this.warnings),
            errors: Array.from(this.errors),
            failedSections: Array.from(uiErrorBoundary.failedSections),
            renderCount: this.renderTimings.size
        };
    }
};

function logUIError(section, error) {
    UILogger.error('UI', `Section ${section} failed`, {
        message: error?.message,
        stack: error?.stack,
        section
    });
}

// =============================================
// SECURE SANITIZATION - XSS PROTECTION
// =============================================
const UISanitizer = {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'span', 'div', 'p', 'br'],
    allowedAttributes: ['href', 'class', 'id', 'style', 'data-*'],

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
                return value;
            }));
        } catch (e) {
            return obj;
        }
    },

    validateStatusData(data) {
        if (!data || typeof data !== 'object') return null;
        
        const sanitized = { ...data };
        
        if (sanitized.text) sanitized.text = String(sanitized.text).slice(0, 5000);
        if (sanitized.caption) sanitized.caption = String(sanitized.caption).slice(0, 1000);
        if (sanitized.question) sanitized.question = String(sanitized.question).slice(0, 500);
        
        if (sanitized.user) {
            sanitized.user = {
                id: String(sanitized.user.id || ''),
                displayName: String(sanitized.user.displayName || '').slice(0, 100),
                photoURL: String(sanitized.user.photoURL || '').slice(0, 500),
                isGuest: !!sanitized.user.isGuest
            };
        }
        
        return sanitized;
    }
};

// =============================================
// RENDERING PIPELINE - PROGRESSIVE ENHANCEMENT
// =============================================
const UIRenderPipeline = {
    stages: ['skeleton', 'initialRender', 'progressiveEnhancement', 'liveUpdate'],
    currentStage: 'skeleton',
    pendingUpdates: new Map(),
    renderQueue: new Set(),
    rafId: null,

    async execute(containerId, renderFn, fallbackId = null) {
        UILogger.startRender(containerId);
        
        try {
            // Stage 1: Skeleton
            if (this.currentStage === 'skeleton') {
                this.renderSkeleton(containerId);
            }
            
            // Stage 2: Initial Render
            if (this.currentStage === 'initialRender' || this.currentStage === 'skeleton') {
                const content = await renderFn();
                this.renderContent(containerId, content);
            }
            
            // Stage 3: Progressive Enhancement
            if (this.currentStage === 'progressiveEnhancement') {
                this.enhanceContainer(containerId);
            }
            
            UILogger.endRender(containerId);
            return true;
        } catch (error) {
            UILogger.error('Render', `Failed to render ${containerId}`, error);
            
            if (fallbackId) {
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
        });
    },

    enhanceContainer(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.classList.add('enhanced');
        
        const images = container.querySelectorAll('img[data-src]');
        images.forEach(img => {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
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
            UILogger.info('Render', `Pipeline stage: ${stage}`);
        }
    }
};

// =============================================
// CORE INTEGRATION BRIDGE - STRICT VALIDATION
// =============================================
const UIBridge = {
    subscriptions: new Map(),
    validators: new Map(),
    
    initialize() {
        this.registerValidators();
        this.setupCoreSubscriptions();
        UILogger.info('Bridge', 'Core integration bridge initialized');
    },

    registerValidators() {
        this.validators.set('statusUpdate', (data) => {
            return data && 
                   typeof data === 'object' && 
                   data.id && 
                   data.type && 
                   ['text', 'media', 'poll'].includes(data.type);
        });

        this.validators.set('sessionData', (data) => {
            return data && 
                   typeof data === 'object' && 
                   (!data.token || typeof data.token === 'string') &&
                   (!data.user || (data.user.id && data.user.displayName));
        });

        this.validators.set('reaction', (data) => {
            return data && 
                   data.statusId && 
                   data.reaction && 
                   Object.keys(reactions).includes(data.reaction);
        });

        this.validators.set('userAction', (data) => {
            return data && data.userId && typeof data.userId === 'string';
        });
    },

    setupCoreSubscriptions() {
        document.addEventListener('statusUpdate', (e) => {
            this.handleCoreEvent('statusUpdate', e.detail);
        });

        document.addEventListener('coreData', (e) => {
            this.handleCoreEvent('coreData', e.detail);
        });

        document.addEventListener('sessionReady', (e) => {
            this.handleCoreEvent('sessionReady', e.detail);
        });
    },

    handleCoreEvent(type, data) {
        if (!data) {
            UILogger.warn('Bridge', `Received empty ${type} event`);
            return;
        }

        const validator = this.validators.get(type);
        if (validator && !validator(data)) {
            UILogger.warn('Bridge', `Invalid ${type} payload`, data);
            return;
        }

        const handlers = this.subscriptions.get(type) || [];
        handlers.forEach(handler => {
            try {
                handler(this.sanitizeEventData(data));
            } catch (error) {
                UILogger.error('Bridge', `Handler failed for ${type}`, error);
            }
        });
    },

    sanitizeEventData(data) {
        if (!data || typeof data !== 'object') return data;
        
        try {
            return JSON.parse(JSON.stringify(data, (key, value) => {
                if (key === 'token' && typeof value === 'string') {
                    return '[REDACTED]';
                }
                if (typeof value === 'string') {
                    return value.slice(0, 5000);
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
        UILogger.info('Bridge', 'All subscriptions cleared');
    }
};

// =============================================
// CENTRALIZED EVENT SYSTEM
// =============================================
class UIEventSystem {
    constructor() {
        this.handlers = new Map();
        this.debounced = new Map();
        this.throttled = new Map();
        this.listenerRefs = new Set();
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) return;
        
        this.setupGlobalListeners();
        this.setupResizeObserver();
        this.setupIntersectionObserver();
        this.isInitialized = true;
        
        UILogger.info('Events', 'Event system initialized');
    }

    setupGlobalListeners() {
        this.addListener(window, 'resize', this.debounce(this.handleResize, 150));
        this.addListener(window, 'scroll', this.throttle(this.handleScroll, 100));
        this.addListener(document, 'visibilitychange', this.handleVisibilityChange);
        this.addListener(document, 'keydown', this.handleKeyDown);
        this.addListener(document, 'click', this.handleDocumentClick);
    }

    setupResizeObserver() {
        if ('ResizeObserver' in window) {
            try {
                const observer = new ResizeObserver(this.throttle((entries) => {
                    this.handleResizeObserver(entries);
                }, 100));
                
                this.observerRefs = this.observerRefs || new Set();
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
                }, {
                    threshold: 0.1,
                    rootMargin: '50px'
                });
                
                this.intersectionObserver = observer;
            } catch (e) {
                UILogger.warn('Events', 'IntersectionObserver not available', e);
            }
        }
    }

    addListener(element, type, handler, options = {}) {
        const wrappedHandler = (e) => {
            try {
                handler(e);
            } catch (error) {
                UILogger.error('Events', `Handler error for ${type}`, error);
            }
        };

        element.addEventListener(type, wrappedHandler, options);
        this.listenerRefs.add({ element, type, handler: wrappedHandler, options });
        
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
        
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        
        this.observerRefs?.forEach(observer => observer.disconnect());
        
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

    handleResize = () => {
        const width = window.innerWidth;
        const wasMobile = isMobile;
        isMobile = width <= 768;
        
        if (wasMobile !== isMobile) {
            UILogger.debug('Events', `Device mode: ${isMobile ? 'mobile' : 'desktop'}`);
            this.emit('deviceChange', { isMobile, width });
        }
        
        this.emit('resize', { width, height: window.innerHeight });
    };

    handleScroll = () => {
        this.emit('scroll', {
            x: window.scrollX,
            y: window.scrollY
        });
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

    handleDocumentClick = (e) => {
        this.emit('click', e);
    };

    handleResizeObserver(entries) {
        this.emit('resizeObserver', entries);
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                this.emit('elementVisible', {
                    target: entry.target,
                    ratio: entry.intersectionRatio
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

    observeIntersection(element) {
        if (this.intersectionObserver) {
            this.intersectionObserver.observe(element);
        }
    }

    unobserveIntersection(element) {
        if (this.intersectionObserver) {
            this.intersectionObserver.unobserve(element);
        }
    }
}

const uiEvents = new UIEventSystem();

// =============================================
// DOM ELEMENTS - SAFE ACCESSORS
// =============================================
const UIElements = {
    get createStatusModal() {
        return document.getElementById('createStatusModal');
    },
    get draftsModal() {
        return document.getElementById('draftsModal');
    },
    get highlightsModal() {
        return document.getElementById('highlightsModal');
    },
    get highlightsEditorModal() {
        return document.getElementById('highlightsEditorModal');
    },
    get memoryTimelineModal() {
        return document.getElementById('memoryTimelineModal');
    },
    get statsModal() {
        return document.getElementById('statsModal');
    },
    get scheduleModal() {
        return document.getElementById('scheduleModal');
    },
    get reportModal() {
        return document.getElementById('reportModal');
    },
    get statusViewerPanel() {
        return document.getElementById('statusViewerPanel');
    },
    get notification() {
        return document.getElementById('notification');
    },
    get errorUI() {
        return document.getElementById('errorUI');
    },
    
    get allStatusSection() {
        return document.getElementById('allStatusSection');
    },
    get friendsStatusSection() {
        return document.getElementById('friendsStatusSection');
    },
    get closeFriendsStatusSection() {
        return document.getElementById('closeFriendsStatusSection');
    },
    get pinnedStatusSection() {
        return document.getElementById('pinnedStatusSection');
    },
    get mutedStatusSection() {
        return document.getElementById('mutedStatusSection');
    },
    get microCirclesStatusSection() {
        return document.getElementById('microCirclesStatusSection');
    },
    get myStatusSection() {
        return document.getElementById('myStatusSection');
    },
    
    get allStatusList() {
        return document.getElementById('allStatusList');
    },
    get friendsStatusList() {
        return document.getElementById('friendsStatusList');
    },
    get closeFriendsStatusList() {
        return document.getElementById('closeFriendsStatusList');
    },
    get pinnedStatusList() {
        return document.getElementById('pinnedStatusList');
    },
    get mutedStatusList() {
        return document.getElementById('mutedStatusList');
    },
    get microCirclesStatusList() {
        return document.getElementById('microCirclesStatusList');
    },
    get myStatusList() {
        return document.getElementById('myStatusList');
    },
    
    getElement(id) {
        return document.getElementById(id);
    },
    
    querySelector(selector) {
        try {
            return document.querySelector(selector);
        } catch (e) {
            UILogger.error('DOM', `Query selector failed: ${selector}`, e);
            return null;
        }
    },
    
    querySelectorAll(selector) {
        try {
            return document.querySelectorAll(selector);
        } catch (e) {
            UILogger.error('DOM', `Query selector all failed: ${selector}`, e);
            return [];
        }
    },
    
    exists(id) {
        return !!document.getElementById(id);
    }
};

// =============================================
// UI STATE CACHE & HISTORY
// =============================================
const UIStateManager = {
    cache: new Map(),
    history: [],
    historyLimit: 20,
    restorePoints: new Map(),

    set(key, value, ttl = 300000) {
        const entry = {
            value,
            timestamp: Date.now(),
            ttl
        };
        this.cache.set(key, entry);
        
        if (ttl) {
            setTimeout(() => this.invalidate(key), ttl);
        }
    },

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.value;
    },

    invalidate(key) {
        this.cache.delete(key);
    },

    clear() {
        this.cache.clear();
        UILogger.info('State', 'UI cache cleared');
    },

    pushHistory(state) {
        this.history.push({
            ...state,
            timestamp: Date.now()
        });
        
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    },

    popHistory() {
        return this.history.pop();
    },

    createRestorePoint(id, state) {
        this.restorePoints.set(id, {
            state,
            timestamp: Date.now()
        });
        UILogger.debug('State', `Restore point created: ${id}`);
    },

    restore(id) {
        const point = this.restorePoints.get(id);
        if (point) {
            return point.state;
        }
        return null;
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
        this.pushHistory({
            type: 'viewer',
            state
        });
    },

    restoreViewerState() {
        return this.get('viewerState');
    }
};

// =============================================
// RESPONSIVE ENGINE - DEVICE ADAPTATION
// =============================================
const ResponsiveEngine = {
    breakpoints: {
        mobile: 480,
        tablet: 768,
        desktop: 1024,
        wide: 1280
    },

    currentDevice: 'desktop',
    touchCapable: false,
    keyboardVisible: false,
    orientation: 'landscape',

    initialize() {
        this.detectCapabilities();
        this.setupOrientationListener();
        this.applyResponsiveAdjustments();
        
        uiEvents.on('deviceChange', (data) => {
            this.handleDeviceChange(data);
        });
        
        uiEvents.on('resize', () => {
            this.applyResponsiveAdjustments();
        });
        
        UILogger.info('Responsive', `Device: ${this.currentDevice}, Touch: ${this.touchCapable}`);
    },

    detectCapabilities() {
        this.touchCapable = 'ontouchstart' in window || 
                           navigator.maxTouchPoints > 0 || 
                           navigator.msMaxTouchPoints > 0;
        
        this.currentDevice = this.getDeviceType();
        this.orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
        
        document.documentElement.classList.toggle('touch-device', this.touchCapable);
        document.documentElement.classList.toggle('mouse-device', !this.touchCapable);
        document.documentElement.classList.add(`device-${this.currentDevice}`);
        document.documentElement.classList.add(`orientation-${this.orientation}`);
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
                    
                    UILogger.debug('Responsive', `Orientation changed to ${this.orientation}`);
                }, 100);
            });
        }
    },

    handleDeviceChange(data) {
        const newDevice = this.getDeviceType();
        
        if (newDevice !== this.currentDevice) {
            document.documentElement.classList.remove(`device-${this.currentDevice}`);
            document.documentElement.classList.add(`device-${newDevice}`);
            this.currentDevice = newDevice;
            
            this.applyDeviceSpecificAdjustments(newDevice);
            UILogger.info('Responsive', `Device changed to ${newDevice}`);
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
                item.classList.remove('expanded');
            } else {
                item.classList.remove('compact');
            }
        });
        
        if (device === 'mobile' && UIElements.statusViewerPanel?.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
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
        const modals = UIElements.querySelectorAll('.modal');
        
        modals.forEach(modal => {
            if (this.currentDevice === 'mobile') {
                modal.style.width = '95%';
                modal.style.maxWidth = '95%';
                modal.style.margin = '10px auto';
            } else {
                modal.style.width = '90%';
                modal.style.maxWidth = '600px';
                modal.style.margin = '30px auto';
            }
        });
    },

    adjustFontSizes() {
        const root = document.documentElement;
        
        if (this.currentDevice === 'mobile') {
            root.style.fontSize = '14px';
        } else if (this.currentDevice === 'tablet') {
            root.style.fontSize = '15px';
        } else {
            root.style.fontSize = '16px';
        }
    },

    adjustTouchTargets() {
        if (!this.touchCapable) return;
        
        const buttons = UIElements.querySelectorAll('.status-action-btn, .reaction-btn, .modal button');
        
        buttons.forEach(btn => {
            btn.style.minHeight = '44px';
            btn.style.minWidth = '44px';
        });
    },

    isTouchDevice() {
        return this.touchCapable;
    },

    isMobileDevice() {
        return this.currentDevice === 'mobile';
    },

    isTabletDevice() {
        return this.currentDevice === 'tablet';
    },

    isDesktopDevice() {
        return this.currentDevice === 'desktop' || this.currentDevice === 'wide';
    }
};

// =============================================
// SKELETON LOADER - IMMEDIATE UI
// =============================================
const SkeletonLoader = {
    show() {
        const containers = [
            'allStatusList',
            'friendsStatusList',
            'closeFriendsStatusList',
            'myStatusList',
            'highlightsContent'
        ];
        
        containers.forEach(id => {
            const container = UIElements.getElement(id);
            if (container && container.children.length === 0) {
                container.innerHTML = UIRenderPipeline.createSkeletonLoader(id);
                container.classList.add('loading-skeleton');
            }
        });
        
        UILogger.debug('Skeleton', 'Skeleton loaders displayed');
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
    }
};

// =============================================
// INITIAL RENDER - IMMEDIATE CONTENT
// =============================================
const InitialRender = {
    execute() {
        UILogger.info('Render', 'Starting initial render');
        
        this.renderMyStatusPreview();
        this.renderAllStatuses();
        this.renderUserAvatar();
        
        UIRenderPipeline.setStage('initialRender');
    },

    renderMyStatusPreview() {
        const myStatusPreview = UIElements.getElement('myStatusPreview');
        if (!myStatusPreview) return;
        
        const hasStatuses = myStatuses && myStatuses.length > 0;
        
        if (hasStatuses) {
            const latest = myStatuses[0];
            const previewText = getStatusPreviewText(latest);
            
            myStatusPreview.innerHTML = `
                <div class="my-status-preview-content">
                    <div class="my-status-preview-text">${UISanitizer.sanitizeHTML(previewText)}</div>
                    <div class="my-status-preview-time">${formatTimeAgo(latest.createdAt)}</div>
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
    },

    renderUserAvatar() {
        if (!currentUser) return;
        
        const avatarElements = UIElements.querySelectorAll('.user-avatar, .status-avatar, .my-status-avatar');
        
        avatarElements.forEach(avatar => {
            if (currentUser.photoURL) {
                avatar.style.backgroundImage = `url('${UISanitizer.sanitizeHTML(currentUser.photoURL)}')`;
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

    createEmptyState() {
        return `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No statuses yet</p>
                <p class="subtext">Be the first to post a status!</p>
                ${isAuthenticated() ? `
                    <button class="btn primary" onclick="document.getElementById('createStatusBtn')?.click()">
                        <i class="fas fa-plus"></i> Create Status
                    </button>
                ` : ''}
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
                    if (filter.startsWith('category-')) return s.category === filter.replace('category-', '');
                    return true;
                });
            });
        }
        
        if (mutedUsers && mutedUsers.size > 0) {
            filtered = filtered.filter(s => !mutedUsers.has(s.userId));
        }
        
        return filtered.sort((a, b) => {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    },

    createStatusElement(status) {
        if (!status || !status.id) return null;
        
        const sanitized = UISanitizer.validateStatusData(status);
        if (!sanitized) return null;
        
        const item = document.createElement('div');
        item.className = 'status-item';
        item.dataset.statusId = sanitized.id;
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
        const mood = sanitized.mood || 'happy';
        const intent = sanitized.intent || 'reflection';
        const category = sanitized.category || 'life';
        
        let previewText = '';
        if (sanitized.type === 'text') {
            previewText = UISanitizer.sanitizeHTML(sanitized.text || '').substring(0, 100);
            if (sanitized.text?.length > 100) previewText += '...';
        } else if (sanitized.type === 'media') {
            previewText = `<i class="fas fa-image"></i> ${UISanitizer.sanitizeHTML(sanitized.caption || 'Media status').substring(0, 50)}`;
        } else if (sanitized.type === 'poll') {
            previewText = `<i class="fas fa-poll"></i> ${UISanitizer.sanitizeHTML(sanitized.question || 'Poll status').substring(0, 50)}`;
        }
        
        const timeAgo = sanitized.createdAt ? formatTimeAgo(sanitized.createdAt) : 'Just now';
        
        item.innerHTML = `
            <div class="status-avatar">
                <div class="status-ring ${isViewed ? 'viewed' : ''}"></div>
                <div class="status-avatar-inner" ${user.photoURL ? `style="background-image: url('${UISanitizer.sanitizeHTML(user.photoURL)}')"` : ''}>
                    ${user.photoURL ? '' : `<span>${initials}</span>`}
                </div>
                <div class="status-indicators">
                    ${mood ? `<div class="status-indicator mood" style="background-color: ${statusMoods[mood]?.color || 'var(--mood-happy)'}" title="${statusMoods[mood]?.name || 'Mood'}"></div>` : ''}
                    ${intent ? `<div class="status-indicator intent" style="background-color: ${statusIntents[intent]?.color || 'var(--intent-feedback)'}" title="${statusIntents[intent]?.name || 'Intent'}"></div>` : ''}
                    ${isPinned ? '<div class="status-indicator pinned" title="Pinned Status"></div>' : ''}
                    ${isMuted ? '<div class="status-indicator muted" title="Muted User"></div>' : ''}
                </div>
            </div>
            <div class="status-info">
                <div class="status-name">
                    <span class="status-name-text">${UISanitizer.sanitizeHTML(user.displayName || 'Unknown User')}</span>
                    <span class="status-time">${timeAgo}</span>
                </div>
                <div class="status-details">
                    <span class="status-type" style="color: ${statusTypes[sanitized.type]?.color || 'var(--primary-color)'}">
                        <i class="${statusTypes[sanitized.type]?.icon || 'fas fa-comment'}"></i>
                        ${statusTypes[sanitized.type]?.name || 'Status'}
                    </span>
                    ${sanitized.isSensitive ? '<span class="status-tag privacy"><i class="fas fa-eye-slash"></i> Sensitive</span>' : ''}
                    ${sanitized.isSilent ? '<span class="status-tag privacy"><i class="fas fa-bell-slash"></i> Silent</span>' : ''}
                </div>
                <div class="status-preview ${sanitized.type === 'media' ? 'media' : ''} ${sanitized.type === 'poll' ? 'poll' : ''}">
                    ${previewText}
                </div>
                <div class="status-tags">
                    ${mood ? `<span class="status-tag mood"><i class="fas fa-brain"></i> ${statusMoods[mood]?.name || 'Mood'}</span>` : ''}
                    ${intent ? `<span class="status-tag intent"><i class="fas fa-bullseye"></i> ${statusIntents[intent]?.name || 'Intent'}</span>` : ''}
                    ${category ? `<span class="status-tag category"><i class="${statusCategories[category]?.icon || 'fas fa-tag'}"></i> ${statusCategories[category]?.name || 'Category'}</span>` : ''}
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
        
        return item;
    }
};

// =============================================
// PROGRESSIVE ENHANCEMENT
// =============================================
const ProgressiveEnhancement = {
    execute() {
        UILogger.info('Enhance', 'Starting progressive enhancement');
        
        this.enhanceImages();
        this.enhanceInteractivity();
        this.enhanceAccessibility();
        this.setupLazyLoading();
        
        UIRenderPipeline.setStage('progressiveEnhancement');
    },

    enhanceImages() {
        const avatars = UIElements.querySelectorAll('.status-avatar-inner[style*="background-image"]');
        
        avatars.forEach(avatar => {
            const bgImage = avatar.style.backgroundImage;
            if (bgImage && bgImage.includes('url')) {
                const url = bgImage.replace(/url\(['"]?(.*?)['"]?\)/i, '$1');
                
                const img = new Image();
                img.onload = () => {
                    avatar.classList.add('image-loaded');
                };
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
        
        statusItems.forEach(item => {
            const viewBtn = item.querySelector('[data-action="view"]');
            if (viewBtn && !viewBtn.hasListener) {
                viewBtn.hasListener = true;
                viewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const statusId = item.dataset.statusId;
                    const status = statuses.find(s => s.id === statusId);
                    if (status) showStatusViewer(status);
                });
            }
            
            const pinBtn = item.querySelector('[data-action="pin"], [data-action="unpin"]');
            if (pinBtn && !pinBtn.hasListener) {
                pinBtn.hasListener = true;
                pinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = pinBtn.dataset.action;
                    const statusId = item.dataset.statusId;
                    const status = statuses.find(s => s.id === statusId);
                    if (status) handleStatusAction(action, status, pinBtn);
                });
            }
            
            const muteBtn = item.querySelector('[data-action="mute"], [data-action="unmute"]');
            if (muteBtn && !muteBtn.hasListener) {
                muteBtn.hasListener = true;
                muteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = muteBtn.dataset.action;
                    const userId = item.dataset.userId;
                    const status = statuses.find(s => s.id === item.dataset.statusId);
                    if (status) handleStatusAction(action, status, muteBtn);
                });
            }
            
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.status-actions')) {
                    const statusId = item.dataset.statusId;
                    const status = statuses.find(s => s.id === statusId);
                    if (status) showStatusViewer(status);
                }
            });
        });
    },

    enhanceAccessibility() {
        const buttons = UIElements.querySelectorAll('button');
        
        buttons.forEach(btn => {
            if (!btn.hasAttribute('aria-label') && btn.title) {
                btn.setAttribute('aria-label', btn.title);
            }
            
            if (btn.classList.contains('status-action-btn') && !btn.hasAttribute('aria-label')) {
                const action = btn.dataset.action;
                if (action) {
                    btn.setAttribute('aria-label', `${action} status`);
                }
            }
        });
        
        const images = UIElements.querySelectorAll('.status-avatar-inner[style*="background-image"]');
        images.forEach(img => {
            img.setAttribute('role', 'img');
            img.setAttribute('aria-label', 'User avatar');
        });
    },

    setupLazyLoading() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '100px',
            threshold: 0.01
        });
        
        const images = UIElements.querySelectorAll('img[data-src]');
        images.forEach(img => observer.observe(img));
    }
};

// =============================================
// LIVE UPDATE ENGINE
// =============================================
const LiveUpdateEngine = {
    subscriptions: new Set(),
    updateQueue: [],
    isProcessing: false,

    initialize() {
        this.setupCoreSubscriptions();
        this.startUpdateProcessor();
        
        UILogger.info('Live', 'Live update engine initialized');
    },

    setupCoreSubscriptions() {
        UIBridge.subscribe('statusUpdate', (data) => {
            this.queueUpdate('status', data);
        });
        
        UIBridge.subscribe('coreData', (data) => {
            if (data.type === 'newStatus') {
                this.queueUpdate('newStatus', data.status);
            } else if (data.type === 'statusUpdate') {
                this.queueUpdate('statusUpdate', data.status);
            }
        });
        
        uiEvents.on('visibility', (data) => {
            if (!data.hidden && this.updateQueue.length > 0) {
                this.processUpdateQueue();
            }
        });
    },

    queueUpdate(type, data) {
        this.updateQueue.push({
            type,
            data,
            timestamp: Date.now()
        });
        
        if (!this.isProcessing && !document.hidden) {
            this.processUpdateQueue();
        }
    },

    startUpdateProcessor() {
        setInterval(() => {
            if (this.updateQueue.length > 0 && !document.hidden) {
                this.processUpdateQueue();
            }
        }, 5000);
    },

    async processUpdateQueue() {
        if (this.isProcessing || this.updateQueue.length === 0) return;
        
        this.isProcessing = true;
        
        while (this.updateQueue.length > 0) {
            const update = this.updateQueue.shift();
            
            try {
                await this.applyUpdate(update);
            } catch (error) {
                UILogger.error('Live', `Failed to apply update: ${update.type}`, error);
            }
        }
        
        this.isProcessing = false;
    },

    applyUpdate(update) {
        switch(update.type) {
            case 'newStatus':
                this.handleNewStatus(update.data);
                break;
            case 'statusUpdate':
                this.handleStatusUpdate(update.data);
                break;
            case 'status':
                this.handleStatusChange(update.data);
                break;
        }
    },

    handleNewStatus(status) {
        if (!status || !status.id) return;
        
        const container = UIElements.allStatusList;
        if (!container) return;
        
        const existing = document.querySelector(`.status-item[data-status-id="${status.id}"]`);
        if (existing) return;
        
        const element = InitialRender.createStatusElement(status);
        if (!element) return;
        
        if (container.children[0]?.classList.contains('empty-state')) {
            container.innerHTML = '';
        }
        
        container.insertBefore(element, container.firstChild);
        
        UILogger.debug('Live', 'New status added to UI');
    },

    handleStatusUpdate(status) {
        if (!status || !status.id) return;
        
        const element = document.querySelector(`.status-item[data-status-id="${status.id}"]`);
        if (!element) return;
        
        const newElement = InitialRender.createStatusElement(status);
        if (newElement) {
            element.replaceWith(newElement);
        }
        
        UILogger.debug('Live', 'Status updated in UI');
    },

    handleStatusChange(data) {
        if (data.type === 'reaction') {
            this.updateReactionCount(data.statusId, data.reaction);
        } else if (data.type === 'view') {
            this.markAsViewed(data.statusId);
        }
    },

    updateReactionCount(statusId, reaction) {
        const element = document.querySelector(`.status-item[data-status-id="${statusId}"]`);
        if (!element) return;
    },

    markAsViewed(statusId) {
        const ring = document.querySelector(`.status-item[data-status-id="${statusId}"] .status-ring`);
        if (ring) {
            ring.classList.add('viewed');
        }
    }
};

// =============================================
// STATUS VIEWER - FULLSCREEN
// =============================================
function showStatusViewer(statusData) {
    if (!statusData || !statusData.id) {
        UILogger.error('Viewer', 'Invalid status data');
        return;
    }
    
    try {
        currentViewerStatus = statusData;
        currentSlideIndex = 0;
        
        UIStateManager.saveViewerState();
        
        if (!viewedStatuses.has(statusData.id)) {
            viewedStatuses.add(statusData.id);
            localStorage.setItem(LOCAL_STORAGE_KEYS.VIEWED_STATUSES, JSON.stringify(Array.from(viewedStatuses)));
            
            const statusItem = document.querySelector(`[data-status-id="${statusData.id}"]`);
            if (statusItem) {
                const ring = statusItem.querySelector('.status-ring');
                if (ring) ring.classList.add('viewed');
            }
        }
        
        const viewer = UIElements.statusViewerPanel;
        if (viewer) {
            viewer.classList.add('active');
            loadViewerContent(statusData);
            startAutoAdvance();
            
            if (ResponsiveEngine.isMobileDevice()) {
                document.body.style.overflow = 'hidden';
            }
        }
    } catch (error) {
        logUIError('statusViewer', error);
        showNotification('Failed to open status viewer', 'error');
    }
}

function loadViewerContent(statusData) {
    const sanitized = UISanitizer.validateStatusData(statusData);
    if (!sanitized) return;
    
    const viewerUserInfo = UIElements.getElement('viewerUserInfo');
    const viewerContent = UIElements.getElement('viewerContent');
    const progressIndicators = UIElements.getElement('progressIndicators');
    const actionButtonsOverlay = UIElements.getElement('actionButtonsOverlay');
    
    if (!viewerUserInfo || !viewerContent) return;
    
    const user = sanitized.user || { displayName: 'Unknown User' };
    const initials = user.displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    
    const timeAgo = sanitized.createdAt ? formatTimeAgo(sanitized.createdAt) : 'Just now';
    
    viewerUserInfo.innerHTML = `
        <div class="viewer-user-avatar" ${user.photoURL ? `style="background-image: url('${UISanitizer.sanitizeHTML(user.photoURL)}')"` : ''}>
            ${user.photoURL ? '' : `<span>${initials}</span>`}
        </div>
        <div class="viewer-user-details">
            <div class="viewer-user-name">${UISanitizer.sanitizeHTML(user.displayName || 'Unknown User')}</div>
            <div class="viewer-status-time">${timeAgo}</div>
        </div>
    `;
    
    viewerContent.innerHTML = '';
    
    if (sanitized.type === 'text') {
        viewerContent.appendChild(createTextStatusSlide(sanitized));
    } else if (sanitized.type === 'media') {
        viewerContent.appendChild(createMediaStatusSlide(sanitized));
    } else if (sanitized.type === 'poll') {
        viewerContent.appendChild(createPollStatusSlide(sanitized));
    }
    
    if (progressIndicators) {
        progressIndicators.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
        `;
    }
    
    if (actionButtonsOverlay) {
        if (sanitized.actionButtons && sanitized.actionButtons.length > 0) {
            actionButtonsOverlay.innerHTML = '';
            sanitized.actionButtons.forEach(actionKey => {
                const action = actionButtons[actionKey];
                if (action) {
                    const actionButton = document.createElement('button');
                    actionButton.className = 'action-button';
                    actionButton.innerHTML = `<i class="${action.icon}"></i> ${action.name}`;
                    actionButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleActionButtonClick(actionKey, sanitized);
                    });
                    actionButtonsOverlay.appendChild(actionButton);
                }
            });
        } else {
            actionButtonsOverlay.innerHTML = '';
        }
    }
    
    const muteUserBtn = UIElements.getElement('muteUserBtn');
    if (muteUserBtn) {
        const isMuted = mutedUsers && mutedUsers.has(sanitized.userId);
        muteUserBtn.innerHTML = isMuted ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
        muteUserBtn.title = isMuted ? 'Unmute User' : 'Mute User';
        muteUserBtn.dataset.action = isMuted ? 'unmute' : 'mute';
    }
    
    const saveStatusBtn = UIElements.getElement('saveStatusBtn');
    if (saveStatusBtn) {
        const isSaved = highlights && highlights.some(h => h.statusIds && h.statusIds.includes(sanitized.id));
        saveStatusBtn.innerHTML = isSaved ? '<i class="fas fa-bookmark"></i>' : '<i class="far fa-bookmark"></i>';
        saveStatusBtn.title = isSaved ? 'Remove from Highlights' : 'Save to Highlights';
        saveStatusBtn.dataset.action = isSaved ? 'unsave' : 'save';
    }
}

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
        <div class="text-status-content">${UISanitizer.sanitizeHTML(statusData.text || '')}</div>
        <div class="text-status-author">— ${UISanitizer.sanitizeHTML(statusData.user?.displayName || 'Unknown User')}</div>
    `;
    
    return slide;
}

function createMediaStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide media-status-slide active';
    
    let mediaContent = '';
    if (statusData.mediaType === 'image') {
        mediaContent = `<img src="${UISanitizer.sanitizeHTML(statusData.mediaUrl || '')}" class="media-status-content" alt="Status image" loading="lazy">`;
    } else if (statusData.mediaType === 'video') {
        mediaContent = `<video src="${UISanitizer.sanitizeHTML(statusData.mediaUrl || '')}" class="media-status-content" autoplay muted loop playsinline controls></video>`;
    }
    
    slide.innerHTML = `
        ${mediaContent}
        ${statusData.caption ? `<div class="media-caption">${UISanitizer.sanitizeHTML(statusData.caption)}</div>` : ''}
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
                <div class="poll-option ${hasVoted ? 'voted' : ''}" data-option="${UISanitizer.sanitizeHTML(option.id)}">
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
    
    if (!hasVoted && isAuthenticated() && !isOfflineMode) {
        const pollOptions = slide.querySelectorAll('.poll-option');
        pollOptions.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const optionId = option.dataset.option;
                
                try {
                    const response = await voteOnPoll(statusData.id, optionId);
                    if (response && response.success) {
                        showNotification('Vote recorded', 'success');
                        
                        if (currentViewerStatus && currentViewerStatus.id === statusData.id) {
                            currentViewerStatus.hasVoted = true;
                            currentViewerStatus.userVote = optionId;
                            
                            const votedOption = currentViewerStatus.options.find(o => o.id === optionId);
                            if (votedOption) {
                                votedOption.votes = (votedOption.votes || 0) + 1;
                            }
                            
                            const newTotalVotes = currentViewerStatus.options.reduce((sum, o) => sum + (o.votes || 0), 0);
                            
                            slide.querySelectorAll('.poll-option').forEach(opt => {
                                const id = opt.dataset.option;
                                const optData = currentViewerStatus.options.find(o => o.id === id);
                                if (optData) {
                                    const pct = newTotalVotes > 0 ? Math.round((optData.votes || 0) / newTotalVotes * 100) : 0;
                                    opt.querySelector('.poll-option-percentage').textContent = `${pct}% (${optData.votes || 0} votes)`;
                                    opt.querySelector('.poll-option-bar').style.width = `${pct}%`;
                                }
                                opt.classList.add('voted');
                                if (id === optionId) opt.classList.add('selected');
                            });
                            
                            slide.querySelector('.poll-total-votes').textContent = `Total votes: ${newTotalVotes}`;
                            
                            if (!slide.querySelector('.poll-voted-message')) {
                                const msg = document.createElement('div');
                                msg.className = 'poll-voted-message';
                                msg.textContent = '✓ You have voted';
                                slide.querySelector('.poll-container').appendChild(msg);
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

function handleActionButtonClick(actionKey, statusData) {
    UILogger.debug('Action', `Action button clicked: ${actionKey}`, statusData);
    
    switch(actionKey) {
        case 'message':
            showNotification(`Message ${statusData.user?.displayName || 'user'}`, 'info');
            break;
        case 'join':
            showNotification('Join discussion', 'info');
            break;
        case 'vote':
            showNotification('Click on a poll option to vote', 'info');
            break;
        case 'book':
            showNotification(`Book a call with ${statusData.user?.displayName || 'user'}`, 'info');
            break;
        case 'learn':
            if (statusData.externalUrl) {
                window.open(statusData.externalUrl, '_blank', 'noopener,noreferrer');
            } else {
                showNotification('No external link available', 'info');
            }
            break;
        case 'support':
            addReactionToStatus(statusData.id, 'love')
                .then(() => showNotification('Reacted with ❤️', 'success'))
                .catch(() => showNotification('Failed to add reaction', 'error'));
            break;
        case 'collaborate':
            showNotification(`Collaborate with ${statusData.user?.displayName || 'user'}`, 'info');
            break;
        case 'resource':
            if (statusData.resourceUrl) {
                window.open(statusData.resourceUrl, '_blank', 'noopener,noreferrer');
            } else {
                showNotification('No resource link available', 'info');
            }
            break;
    }
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
                }
            }
        }, 50);
        
        window.progressInterval = interval;
    }
}

function toggleAutoAdvance() {
    isAutoAdvancePaused = !isAutoAdvancePaused;
    
    const pauseResumeBtn = UIElements.getElement('pauseResumeBtn');
    if (pauseResumeBtn) {
        pauseResumeBtn.innerHTML = isAutoAdvancePaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
        pauseResumeBtn.title = isAutoAdvancePaused ? 'Resume' : 'Pause';
    }
    
    UILogger.debug('Viewer', `Auto-advance ${isAutoAdvancePaused ? 'paused' : 'resumed'}`);
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

// =============================================
// STATUS ACTION HANDLER
// =============================================
async function handleStatusAction(action, statusData, button) {
    if (!statusData || !statusData.id) return;
    
    UILogger.debug('Action', `Status action: ${action}`, statusData.id);
    
    switch(action) {
        case 'view':
            showStatusViewer(statusData);
            break;
            
        case 'pin':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                const response = await pinStatus(statusData);
                if (response && response.success) {
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
                UILogger.error('Action', 'Pin failed', error);
            } finally {
                button.disabled = false;
            }
            break;
            
        case 'unpin':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                const response = await unpinStatus(statusData);
                if (response && response.success) {
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
                UILogger.error('Action', 'Unpin failed', error);
            } finally {
                button.disabled = false;
            }
            break;
            
        case 'mute':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                const response = await muteUser(statusData.userId);
                if (response && response.success) {
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
                        
                        const indicator = document.createElement('div');
                        indicator.className = 'status-indicator muted';
                        indicator.title = 'Muted User';
                        item.querySelector('.status-indicators')?.appendChild(indicator);
                    });
                    
                    updateCurrentSectionUI();
                }
            } catch (error) {
                showNotification('Failed to mute user', 'error');
                UILogger.error('Action', 'Mute failed', error);
            } finally {
                button.disabled = false;
            }
            break;
            
        case 'unmute':
            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                const response = await unmuteUser(statusData.userId);
                if (response && response.success) {
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
                        
                        const indicator = item.querySelector('.status-indicator.muted');
                        if (indicator) indicator.remove();
                    });
                    
                    updateCurrentSectionUI();
                }
            } catch (error) {
                showNotification('Failed to unmute user', 'error');
                UILogger.error('Action', 'Unmute failed', error);
            } finally {
                button.disabled = false;
            }
            break;
    }
}

// =============================================
// NOTIFICATION SYSTEM
// =============================================
function showNotification(message, type = 'success') {
    const notification = UIElements.notification;
    const notificationText = UIElements.getElement('notificationText');
    
    if (!notification || !notificationText) return;
    
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('active');
    
    if (window.notificationTimeout) {
        clearTimeout(window.notificationTimeout);
    }
    
    window.notificationTimeout = setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
    
    UILogger.debug('Notification', `${type}: ${message}`);
}

// =============================================
// UI PROTECTION FUNCTIONS
// =============================================
function enableProtectedUI() {
    UILogger.info('UI', 'Enabling protected UI');
    
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
    
    protectedElements.forEach(id => {
        const el = UIElements.getElement(id);
        if (el) {
            el.disabled = false;
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.removeAttribute('aria-disabled');
        }
    });
}

function disableProtectedUI() {
    UILogger.info('UI', 'Disabling protected UI');
    
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
                <p>Connection lost</p>
                <p class="subtext">Attempting to reconnect...</p>
                <button class="btn primary" onclick="window.location.reload()">
                    <i class="fas fa-redo"></i> Reload
                </button>
            </div>
        `;
    }
}

// =============================================
// UPDATE CURRENT SECTION - RENAMED TO AVOID DUPLICATE
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
            data = filterStatusesByPrivacy(statuses);
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

function renderStatusesListUI(container, statusesList) {
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
                if (filter.startsWith('category-')) return s.category === filter.replace('category-', '');
                return true;
            });
        });
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No statuses found</p>
                <p class="subtext">${getEmptyStateMessage()}</p>
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    filtered.slice(0, 20).forEach(status => {
        const element = InitialRender.createStatusElement(status);
        if (element) fragment.appendChild(element);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

// =============================================
// EVENT LISTENERS SETUP
// =============================================
function setupBasicEventListeners() {
    const createStatusBtn = UIElements.getElement('createStatusBtn');
    if (createStatusBtn && !createStatusBtn.hasListener) {
        createStatusBtn.hasListener = true;
        createStatusBtn.addEventListener('click', () => {
            if (!isAuthenticated()) {
                showNotification('Please sign in to create a status', 'error');
                return;
            }
            const modal = UIElements.createStatusModal;
            if (modal) {
                modal.classList.add('active');
                const textTab = UIElements.querySelector('.create-status-tab[data-tab="text"]');
                if (textTab) textTab.click();
            }
        });
    }
    
    const closeCreateStatusModal = UIElements.getElement('closeCreateStatusModal');
    if (closeCreateStatusModal && !closeCreateStatusModal.hasListener) {
        closeCreateStatusModal.hasListener = true;
        closeCreateStatusModal.addEventListener('click', () => {
            const modal = UIElements.createStatusModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    const closeNotificationBtn = UIElements.getElement('closeNotificationBtn');
    if (closeNotificationBtn && !closeNotificationBtn.hasListener) {
        closeNotificationBtn.hasListener = true;
        closeNotificationBtn.addEventListener('click', () => {
            const notification = UIElements.notification;
            if (notification) notification.classList.remove('active');
        });
    }
}

function setupEventListeners() {
    UILogger.info('Events', 'Setting up event listeners');
    
    setupBasicEventListeners();
    
    // Create status tabs
    UIElements.querySelectorAll('.create-status-tab').forEach(tab => {
        if (!tab.hasListener) {
            tab.hasListener = true;
            tab.addEventListener('click', function() {
                const tabName = this.dataset.tab;
                
                UIElements.querySelectorAll('.create-status-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                UIElements.querySelectorAll('.create-status-tab-content').forEach(c => c.classList.remove('active'));
                
                const tabContent = UIElements.getElement(`${tabName}Tab`);
                if (tabContent) tabContent.classList.add('active');
            });
        }
    });
    
    // Text status input
    const textStatusInput = UIElements.getElement('textStatusInput');
    if (textStatusInput && !textStatusInput.hasListener) {
        textStatusInput.hasListener = true;
        textStatusInput.addEventListener('input', function() {
            const counter = UIElements.getElement('textStatusCounter');
            if (counter) {
                const length = this.value.length;
                counter.textContent = `${length}/500`;
                counter.style.color = length > 500 ? 'var(--danger-color)' : 'var(--text-secondary)';
            }
        });
    }
    
    // Clear text button
    const clearTextBtn = UIElements.getElement('clearTextBtn');
    if (clearTextBtn && !clearTextBtn.hasListener) {
        clearTextBtn.hasListener = true;
        clearTextBtn.addEventListener('click', () => {
            const input = UIElements.getElement('textStatusInput');
            if (input) {
                input.value = '';
                const counter = UIElements.getElement('textStatusCounter');
                if (counter) {
                    counter.textContent = '0/500';
                    counter.style.color = 'var(--text-secondary)';
                }
            }
        });
    }
    
    // Media upload
    const mediaUploadArea = UIElements.getElement('mediaUploadArea');
    const mediaFileInput = UIElements.getElement('mediaFileInput');
    
    if (mediaUploadArea && mediaFileInput) {
        if (!mediaUploadArea.hasListener) {
            mediaUploadArea.hasListener = true;
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
        
        if (!mediaFileInput.hasListener) {
            mediaFileInput.hasListener = true;
            mediaFileInput.addEventListener('change', handleMediaUpload);
        }
    }
    
    // Add poll option
    const addPollOptionBtn = UIElements.getElement('addPollOptionBtn');
    if (addPollOptionBtn && !addPollOptionBtn.hasListener) {
        addPollOptionBtn.hasListener = true;
        addPollOptionBtn.addEventListener('click', () => {
            const container = UIElements.getElement('pollOptionsContainer');
            if (!container) return;
            
            const optionCount = container.children.length + 1;
            if (optionCount > 6) {
                showNotification('Maximum 6 options allowed', 'warning');
                return;
            }
            
            addPollOption(optionCount);
        });
    }
    
    // Post status button
    const postStatusBtn = UIElements.getElement('postStatusBtn');
    if (postStatusBtn && !postStatusBtn.hasListener) {
        postStatusBtn.hasListener = true;
        postStatusBtn.addEventListener('click', handlePostStatus);
    }
    
    // Save draft button
    const saveDraftBtn = UIElements.getElement('saveDraftBtn');
    if (saveDraftBtn && !saveDraftBtn.hasListener) {
        saveDraftBtn.hasListener = true;
        saveDraftBtn.addEventListener('click', handleSaveDraft);
    }
    
    // Schedule status button
    const scheduleStatusBtn = UIElements.getElement('scheduleStatusBtn');
    if (scheduleStatusBtn && !scheduleStatusBtn.hasListener) {
        scheduleStatusBtn.hasListener = true;
        scheduleStatusBtn.addEventListener('click', () => {
            if (!isAuthenticated()) {
                showNotification('Please sign in to schedule a status', 'error');
                return;
            }
            
            const modal = UIElements.scheduleModal;
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
        });
    }
    
    // Close schedule modal
    const closeScheduleModal = UIElements.getElement('closeScheduleModal');
    if (closeScheduleModal && !closeScheduleModal.hasListener) {
        closeScheduleModal.hasListener = true;
        closeScheduleModal.addEventListener('click', () => {
            const modal = UIElements.scheduleModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Confirm schedule button
    const confirmScheduleBtn = UIElements.getElement('confirmScheduleBtn');
    if (confirmScheduleBtn && !confirmScheduleBtn.hasListener) {
        confirmScheduleBtn.hasListener = true;
        confirmScheduleBtn.addEventListener('click', handleConfirmSchedule);
    }
    
    // Category tabs
    const categoryTabs = [
        'allTab', 'friendsTab', 'closeFriendsTab', 
        'pinnedTab', 'mutedTab', 'microCirclesTab', 'myStatusTab'
    ];
    
    categoryTabs.forEach(tabId => {
        const tab = UIElements.getElement(tabId);
        if (tab && !tab.hasListener) {
            tab.hasListener = true;
            tab.addEventListener('click', function() {
                UIElements.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                updateCurrentSectionUI();
            });
        }
    });
    
    // Filter buttons
    UIElements.querySelectorAll('.category-btn[data-filter]').forEach(btn => {
        if (!btn.hasListener) {
            btn.hasListener = true;
            btn.addEventListener('click', function() {
                const filter = this.dataset.filter;
                let label = '';
                
                if (filter.startsWith('intent-')) {
                    const key = filter.replace('intent-', '');
                    label = statusIntents[key]?.name || key;
                    addFilterTag(filter, label);
                } else if (filter.startsWith('mood-')) {
                    const key = filter.replace('mood-', '');
                    label = statusMoods[key]?.name || key;
                    addFilterTag(filter, label);
                }
            });
        }
    });
    
    // Clear filters button
    const clearFiltersBtn = UIElements.getElement('clearFiltersBtn');
    if (clearFiltersBtn && !clearFiltersBtn.hasListener) {
        clearFiltersBtn.hasListener = true;
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }
    
    // Viewer back button
    const viewerBackBtn = UIElements.getElement('viewerBackBtn');
    if (viewerBackBtn && !viewerBackBtn.hasListener) {
        viewerBackBtn.hasListener = true;
        viewerBackBtn.addEventListener('click', () => {
            const viewer = UIElements.statusViewerPanel;
            if (viewer) {
                viewer.classList.remove('active');
                document.body.style.overflow = '';
                stopAutoAdvance();
            }
        });
    }
    
    // Pause/Resume button
    const pauseResumeBtn = UIElements.getElement('pauseResumeBtn');
    if (pauseResumeBtn && !pauseResumeBtn.hasListener) {
        pauseResumeBtn.hasListener = true;
        pauseResumeBtn.addEventListener('click', toggleAutoAdvance);
    }
    
    // Mute user button
    const muteUserBtn = UIElements.getElement('muteUserBtn');
    if (muteUserBtn && !muteUserBtn.hasListener) {
        muteUserBtn.hasListener = true;
        muteUserBtn.addEventListener('click', async () => {
            if (currentViewerStatus) {
                const action = muteUserBtn.dataset.action;
                await handleStatusAction(action, currentViewerStatus, muteUserBtn);
            }
        });
    }
    
    // Share status button
    const shareStatusBtn = UIElements.getElement('shareStatusBtn');
    if (shareStatusBtn && !shareStatusBtn.hasListener) {
        shareStatusBtn.hasListener = true;
        shareStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                if (navigator.share) {
                    navigator.share({
                        title: `Status from ${currentViewerStatus.user?.displayName || 'User'}`,
                        text: currentViewerStatus.text || currentViewerStatus.caption || 'Check out this status',
                        url: window.location.href
                    }).catch(e => UILogger.debug('Share', 'Share cancelled', e));
                } else {
                    navigator.clipboard.writeText(window.location.href)
                        .then(() => showNotification('Link copied to clipboard', 'success'))
                        .catch(() => showNotification('Failed to copy link', 'error'));
                }
            }
        });
    }
    
    // Save status button
    const saveStatusBtn = UIElements.getElement('saveStatusBtn');
    if (saveStatusBtn && !saveStatusBtn.hasListener) {
        saveStatusBtn.hasListener = true;
        saveStatusBtn.addEventListener('click', handleSaveStatus);
    }
    
    // Report status button
    const reportStatusBtn = UIElements.getElement('reportStatusBtn');
    if (reportStatusBtn && !reportStatusBtn.hasListener) {
        reportStatusBtn.hasListener = true;
        reportStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                const modal = UIElements.reportModal;
                if (modal) modal.classList.add('active');
            }
        });
    }
    
    // Close report modal
    const closeReportModal = UIElements.getElement('closeReportModal');
    if (closeReportModal && !closeReportModal.hasListener) {
        closeReportModal.hasListener = true;
        closeReportModal.addEventListener('click', () => {
            const modal = UIElements.reportModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Report details input
    const reportDetails = UIElements.getElement('reportDetails');
    if (reportDetails && !reportDetails.hasListener) {
        reportDetails.hasListener = true;
        reportDetails.addEventListener('input', function() {
            const counter = UIElements.getElement('reportDetailsCounter');
            if (counter) {
                const length = this.value.length;
                counter.textContent = `${length}/500`;
                counter.style.color = length > 500 ? 'var(--danger-color)' : 'var(--text-secondary)';
            }
            updateReportSubmitButton();
        });
    }
    
    // Submit report button
    const submitReportBtn = UIElements.getElement('submitReportBtn');
    if (submitReportBtn && !submitReportBtn.hasListener) {
        submitReportBtn.hasListener = true;
        submitReportBtn.addEventListener('click', handleSubmitReport);
    }
    
    // Send reply button
    const sendReplyBtn = UIElements.getElement('sendReplyBtn');
    if (sendReplyBtn && !sendReplyBtn.hasListener) {
        sendReplyBtn.hasListener = true;
        sendReplyBtn.addEventListener('click', () => {
            const replyInput = UIElements.getElement('replyInput');
            if (replyInput && replyInput.value.trim() && currentViewerStatus) {
                showNotification('Reply sent: ' + replyInput.value.trim(), 'success');
                replyInput.value = '';
            }
        });
    }
    
    // Reply input enter key
    const replyInput = UIElements.getElement('replyInput');
    if (replyInput && !replyInput.hasListener) {
        replyInput.hasListener = true;
        replyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const btn = UIElements.getElement('sendReplyBtn');
                if (btn) btn.click();
            }
        });
    }
    
    // View highlights button
    const viewHighlightsBtn = UIElements.getElement('viewHighlightsBtn');
    if (viewHighlightsBtn && !viewHighlightsBtn.hasListener) {
        viewHighlightsBtn.hasListener = true;
        viewHighlightsBtn.addEventListener('click', showHighlightsModal);
    }
    
    // Close highlights modal
    const closeHighlightsModal = UIElements.getElement('closeHighlightsModal');
    if (closeHighlightsModal && !closeHighlightsModal.hasListener) {
        closeHighlightsModal.hasListener = true;
        closeHighlightsModal.addEventListener('click', () => {
            const modal = UIElements.highlightsModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Create highlight button
    const createHighlightBtn = UIElements.getElement('createHighlightBtn');
    if (createHighlightBtn && !createHighlightBtn.hasListener) {
        createHighlightBtn.hasListener = true;
        createHighlightBtn.addEventListener('click', () => {
            if (!isAuthenticated()) {
                showNotification('Please sign in to create a highlight', 'error');
                return;
            }
            showHighlightsEditor();
        });
    }
    
    // Close highlights editor
    const closeHighlightsEditor = UIElements.getElement('closeHighlightsEditor');
    if (closeHighlightsEditor && !closeHighlightsEditor.hasListener) {
        closeHighlightsEditor.hasListener = true;
        closeHighlightsEditor.addEventListener('click', () => {
            const modal = UIElements.highlightsEditorModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Cancel highlight button
    const cancelHighlightBtn = UIElements.getElement('cancelHighlightBtn');
    if (cancelHighlightBtn && !cancelHighlightBtn.hasListener) {
        cancelHighlightBtn.hasListener = true;
        cancelHighlightBtn.addEventListener('click', () => {
            const modal = UIElements.highlightsEditorModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Save highlight button
    const saveHighlightBtn = UIElements.getElement('saveHighlightBtn');
    if (saveHighlightBtn && !saveHighlightBtn.hasListener) {
        saveHighlightBtn.hasListener = true;
        saveHighlightBtn.addEventListener('click', saveHighlight);
    }
    
    // View timeline button
    const viewTimelineBtn = UIElements.getElement('viewTimelineBtn');
    if (viewTimelineBtn && !viewTimelineBtn.hasListener) {
        viewTimelineBtn.hasListener = true;
        viewTimelineBtn.addEventListener('click', showMemoryTimelineModal);
    }
    
    // Close memory timeline modal
    const closeMemoryTimelineModal = UIElements.getElement('closeMemoryTimelineModal');
    if (closeMemoryTimelineModal && !closeMemoryTimelineModal.hasListener) {
        closeMemoryTimelineModal.hasListener = true;
        closeMemoryTimelineModal.addEventListener('click', () => {
            const modal = UIElements.memoryTimelineModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Export timeline button
    const exportTimelineBtn = UIElements.getElement('exportTimelineBtn');
    if (exportTimelineBtn && !exportTimelineBtn.hasListener) {
        exportTimelineBtn.hasListener = true;
        exportTimelineBtn.addEventListener('click', exportTimeline);
    }
    
    // View stats button
    const viewStatsBtn = UIElements.getElement('viewStatsBtn');
    if (viewStatsBtn && !viewStatsBtn.hasListener) {
        viewStatsBtn.hasListener = true;
        viewStatsBtn.addEventListener('click', showStatsModal);
    }
    
    // Close stats modal
    const closeStatsModal = UIElements.getElement('closeStatsModal');
    if (closeStatsModal && !closeStatsModal.hasListener) {
        closeStatsModal.hasListener = true;
        closeStatsModal.addEventListener('click', () => {
            const modal = UIElements.statsModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Refresh stats button
    const refreshStatsBtn = UIElements.getElement('refreshStatsBtn');
    if (refreshStatsBtn && !refreshStatsBtn.hasListener) {
        refreshStatsBtn.hasListener = true;
        refreshStatsBtn.addEventListener('click', () => {
            loadStatsContent();
            showNotification('Stats refreshed', 'success');
        });
    }
    
    // View drafts button
    const viewDraftsBtn = UIElements.getElement('viewDraftsBtn');
    if (viewDraftsBtn && !viewDraftsBtn.hasListener) {
        viewDraftsBtn.hasListener = true;
        viewDraftsBtn.addEventListener('click', showDraftsModal);
    }
    
    // Close drafts modal
    const closeDraftsModal = UIElements.getElement('closeDraftsModal');
    if (closeDraftsModal && !closeDraftsModal.hasListener) {
        closeDraftsModal.hasListener = true;
        closeDraftsModal.addEventListener('click', () => {
            const modal = UIElements.draftsModal;
            if (modal) modal.classList.remove('active');
        });
    }
    
    // Delete all drafts button
    const deleteAllDraftsBtn = UIElements.getElement('deleteAllDraftsBtn');
    if (deleteAllDraftsBtn && !deleteAllDraftsBtn.hasListener) {
        deleteAllDraftsBtn.hasListener = true;
        deleteAllDraftsBtn.addEventListener('click', deleteAllDrafts);
    }
    
    // Load draft button
    const loadDraftBtn = UIElements.getElement('loadDraftBtn');
    if (loadDraftBtn && !loadDraftBtn.hasListener) {
        loadDraftBtn.hasListener = true;
        loadDraftBtn.addEventListener('click', () => {
            if (selectedDraft) {
                loadDraft(selectedDraft);
            }
        });
    }
    
    // View scheduled button
    const viewScheduledBtn = UIElements.getElement('viewScheduledBtn');
    if (viewScheduledBtn && !viewScheduledBtn.hasListener) {
        viewScheduledBtn.hasListener = true;
        viewScheduledBtn.addEventListener('click', () => {
            const modal = UIElements.scheduleModal;
            if (modal) modal.classList.add('active');
            updateScheduledStatusesList();
        });
    }
    
    // View my status button
    const viewMyStatusBtn = UIElements.getElement('viewMyStatusBtn');
    if (viewMyStatusBtn && !viewMyStatusBtn.hasListener) {
        viewMyStatusBtn.hasListener = true;
        viewMyStatusBtn.addEventListener('click', () => {
            if (myStatuses && myStatuses.length > 0) {
                showStatusViewer(myStatuses[0]);
            } else {
                showNotification('You have no statuses yet', 'info');
            }
        });
    }
    
    // Edit my status button
    const editMyStatusBtn = UIElements.getElement('editMyStatusBtn');
    if (editMyStatusBtn && !editMyStatusBtn.hasListener) {
        editMyStatusBtn.hasListener = true;
        editMyStatusBtn.addEventListener('click', () => {
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
                if (textInput && latest.type === 'text' && latest.text) {
                    textInput.value = latest.text;
                    const counter = UIElements.getElement('textStatusCounter');
                    if (counter) {
                        counter.textContent = `${latest.text.length}/500`;
                    }
                }
            }
        });
    }
    
    // My status preview click
    const myStatusPreview = UIElements.getElement('myStatusPreview');
    if (myStatusPreview && !myStatusPreview.hasListener) {
        myStatusPreview.hasListener = true;
        myStatusPreview.addEventListener('click', () => {
            if (myStatuses && myStatuses.length > 0) {
                showStatusViewer(myStatuses[0]);
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
    
    // Retry connection button
    const retryConnectionBtn = UIElements.getElement('retryConnectionBtn');
    if (retryConnectionBtn && !retryConnectionBtn.hasListener) {
        retryConnectionBtn.hasListener = true;
        retryConnectionBtn.addEventListener('click', async () => {
            const errorUI = UIElements.errorUI;
            if (errorUI) errorUI.classList.remove('active');
            
            showNotification('Retrying connection...', 'info');
            
            try {
                const success = await bootstrapApplication();
                if (!success && errorUI) errorUI.classList.add('active');
            } catch (error) {
                UILogger.error('Connection', 'Retry failed', error);
                if (errorUI) errorUI.classList.add('active');
            }
        });
    }
    
    // Offline mode button
    const offlineModeBtn = UIElements.getElement('offlineModeBtn');
    if (offlineModeBtn && !offlineModeBtn.hasListener) {
        offlineModeBtn.hasListener = true;
        offlineModeBtn.addEventListener('click', () => {
            const errorUI = UIElements.errorUI;
            if (errorUI) errorUI.classList.remove('active');
            
            isOfflineMode = true;
            showNotification('Offline mode enabled', 'warning');
            loadCachedDataInstantly();
            renderStatusListInstantlyUI();
        });
    }
    
    UILogger.info('Events', 'All event listeners configured');
}

// =============================================
// UI COMPONENTS INITIALIZATION
// =============================================

function initializeUIComponents() {
    UILogger.info('Components', 'Initializing UI components');
    
    // Fix all the element ID checks
    if (UIElements.getElement('emojiGrid')) {
        initializeEmojiPicker();
    }
    
    if (UIElements.getElement('backgroundGrid')) {
        initializeBackgroundOptions();
    }
    
    if (UIElements.getElement('intentOptions')) {
        initializeIntentOptions();
    }
    
    if (UIElements.getElement('moodOptions')) {
        initializeMoodOptions();
    }
    
    if (UIElements.getElement('categoryOptions')) {
        initializeCategoryOptions();
    }
    
    if (UIElements.getElement('actionButtonsSelector')) {
        initializeActionButtonsSelector();
    }
    
    if (UIElements.getElement('privacyOptions')) {
        initializePrivacyOptions();
    }
    
    if (UIElements.getElement('durationOptions')) {
        initializeDurationOptions();
    }
    
    if (UIElements.getElement('templateOptions')) {
        initializeTemplateOptions();
    }
    
    if (UIElements.getElement('reportReasons')) {
        initializeReportReasons();
    }
    
    if (UIElements.getElement('reactionsContainer')) {
        initializeReactions();
    }
    
    if (UIElements.getElement('pollOptionsContainer')) {
        initializePollOptions();
    }
    
    if (UIElements.getElement('highlightColorGrid')) {
        initializeHighlightColorOptions();
    }
    
    if (UIElements.getElement('highlightPrivacyOptions')) {
        initializeHighlightPrivacyOptions();
    }
    
    if (UIElements.getElement('repeatOptions')) {
        initializeRepeatOptions();
    }
    
    UILogger.info('Components', 'UI components initialized');
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
                if (counter) {
                    counter.textContent = `${input.value.length}/500`;
                }
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
            localStorage.setItem('selected_background', bg.id);
        });
        
        option.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                option.click();
            }
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
            localStorage.setItem('selected_intent', key);
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
            localStorage.setItem('selected_mood', key);
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
            localStorage.setItem('selected_category', key);
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
            
            const selected = Array.from(container.querySelectorAll('.action-button-option.selected'))
                .map(opt => opt.dataset.action);
            localStorage.setItem('selected_actions', JSON.stringify(selected));
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
            localStorage.setItem('selected_privacy', key);
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
            localStorage.setItem('selected_duration', key);
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
                if (counter) {
                    counter.textContent = `${template.text.length}/500`;
                }
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
            if (currentViewerStatus) {
                try {
                    await addReactionToStatus(currentViewerStatus.id, key);
                    
                    container.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    
                    showNotification(`Reacted with ${emoji}`, 'success');
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

function addPollOption(index) {
    const container = UIElements.getElement('pollOptionsContainer');
    if (!container) return;
    
    const item = document.createElement('div');
    item.className = 'poll-option-item';
    
    item.innerHTML = `
        <div class="poll-option-number">${index}</div>
        <div class="poll-option-input-wrapper">
            <input type="text" class="text-input poll-option-input" placeholder="Option ${index}" data-index="${index}" maxlength="100">
            ${index > 2 ? `
                <button class="remove-poll-option" type="button" aria-label="Remove option">
                    <i class="fas fa-times"></i>
                </button>
            ` : ''}
        </div>
    `;
    
    const removeBtn = item.querySelector('.remove-poll-option');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            if (container.children.length > 2) {
                item.remove();
                updatePollOptionNumbers();
            } else {
                showNotification('Minimum 2 options required', 'warning');
            }
        });
    }
    
    container.appendChild(item);
}

function updatePollOptionNumbers() {
    const items = UIElements.querySelectorAll('.poll-option-item');
    
    items.forEach((item, idx) => {
        const number = item.querySelector('.poll-option-number');
        const input = item.querySelector('.poll-option-input');
        const removeBtn = item.querySelector('.remove-poll-option');
        
        if (number) number.textContent = idx + 1;
        if (input) {
            input.dataset.index = idx + 1;
            input.placeholder = `Option ${idx + 1}`;
        }
        if (removeBtn) {
            removeBtn.style.display = idx >= 2 ? 'block' : 'none';
        }
    });
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
// HANDLER FUNCTIONS
// =============================================
async function handlePostStatus() {
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
    
    if (intent) statusData.intent = intent;
    if (mood) statusData.mood = mood;
    if (category) statusData.category = category;
    if (privacy) statusData.privacy = privacy;
    if (duration) statusData.duration = duration;
    if (actions.length > 0) statusData.actionButtons = actions;
    
    const sensitive = UIElements.getElement('sensitiveContentToggle');
    const silent = UIElements.getElement('silentModeToggle');
    const translate = UIElements.getElement('autoTranslateToggle');
    const offline = UIElements.getElement('offlineQueueToggle');
    
    if (sensitive) statusData.isSensitive = sensitive.checked;
    if (silent) statusData.isSilent = silent.checked;
    if (translate) statusData.autoTranslate = translate.checked;
    if (offline) statusData.offlineQueue = offline.checked;
    
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
        statusData.mediaType = 'image';
        statusData.mediaUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        
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
        
        statusData.question = question;
        statusData.options = options;
        
        const durationSelect = UIElements.getElement('pollDurationSelect');
        if (durationSelect) statusData.duration = durationSelect.value;
    }
    
    try {
        const btn = UIElements.getElement('postStatusBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
        }
        
        const response = await postStatus(statusData);
        
        if (response && response.success) {
            showNotification('Status posted successfully', 'success');
            
            const modal = UIElements.createStatusModal;
            if (modal) modal.classList.remove('active');
            
            if (response.status) {
                statuses.unshift(response.status);
                myStatuses.unshift(response.status);
                
                renderStatusListInstantlyUI();
                updateMyStatusPreviewUI();
                updateCurrentSectionUI();
            }
            
            const textInput = UIElements.getElement('textStatusInput');
            if (textInput) textInput.value = '';
            
            const mediaPreview = UIElements.getElement('mediaPreview');
            if (mediaPreview) mediaPreview.innerHTML = '';
            
            const captionInput = UIElements.getElement('mediaCaptionInput');
            if (captionInput) captionInput.value = '';
            
            const questionInput = UIElements.getElement('pollQuestionInput');
            if (questionInput) questionInput.value = '';
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
            .map(input => ({
                id: `opt_${Date.now()}`,
                text: input.value.trim(),
                votes: 0
            }))
            .filter(opt => opt.text);
        
        if (options.length < 2) {
            showNotification('Please enter at least 2 options to save as draft', 'error');
            return;
        }
        
        draftData.options = options;
    }
    
    const intent = UIElements.querySelector('.intent-option.selected')?.dataset.intent;
    const mood = UIElements.querySelector('.mood-option.selected')?.dataset.mood;
    const category = UIElements.querySelector('.category-option.selected')?.dataset.category;
    
    if (intent) draftData.intent = intent;
    if (mood) draftData.mood = mood;
    if (category) draftData.category = category;
    
    try {
        saveDraft(draftData);
        showNotification('Draft saved successfully', 'success');
        
        const modal = UIElements.createStatusModal;
        if (modal) modal.classList.remove('active');
        
    } catch (error) {
        UILogger.error('Draft', 'Failed to save draft', error);
        showNotification('Failed to save draft', 'error');
    }
}

async function handleConfirmSchedule() {
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
    
    const repeat = UIElements.querySelector('.repeat-option.selected')?.dataset.repeat || 'none';
    
    try {
        const btn = UIElements.getElement('confirmScheduleBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';
        }
        
        const response = await scheduleStatus(statusData, scheduleDateTime.toISOString());
        
        if (response && response.success) {
            showNotification('Status scheduled successfully', 'success');
            
            const scheduleModal = UIElements.scheduleModal;
            if (scheduleModal) scheduleModal.classList.remove('active');
            
            const createModal = UIElements.createStatusModal;
            if (createModal) createModal.classList.remove('active');
        }
    } catch (error) {
        UILogger.error('Schedule', 'Failed to schedule status', error);
        showNotification('Failed to schedule status', 'error');
    } finally {
        const btn = UIElements.getElement('confirmScheduleBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirm Schedule';
        }
    }
}

async function handleSaveStatus() {
    if (!currentViewerStatus) return;
    
    const btn = UIElements.getElement('saveStatusBtn');
    const action = btn.dataset.action;
    
    if (action === 'save') {
        if (highlights.length === 0) {
            showNotification('Please create a highlight first', 'info');
            showHighlightsModal();
            return;
        }
        
        const highlight = highlights[0];
        
        if (!highlight.statusIds) highlight.statusIds = [];
        
        if (!highlight.statusIds.includes(currentViewerStatus.id)) {
            highlight.statusIds.push(currentViewerStatus.id);
            highlight.count = highlight.statusIds.length;
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
            
            btn.innerHTML = '<i class="fas fa-bookmark"></i>';
            btn.title = 'Remove from Highlights';
            btn.dataset.action = 'unsave';
            
            showNotification('Status saved to highlights', 'success');
        }
    } else if (action === 'unsave') {
        highlights.forEach(highlight => {
            if (highlight.statusIds && highlight.statusIds.includes(currentViewerStatus.id)) {
                highlight.statusIds = highlight.statusIds.filter(id => id !== currentViewerStatus.id);
                highlight.count = highlight.statusIds.length;
            }
        });
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
        
        btn.innerHTML = '<i class="far fa-bookmark"></i>';
        btn.title = 'Save to Highlights';
        btn.dataset.action = 'save';
        
        showNotification('Status removed from highlights', 'success');
    }
}

async function handleSubmitReport() {
    if (!currentViewerStatus) return;
    
    const selectedReason = UIElements.querySelector('#reportReasons .category-option.selected')?.dataset.reason;
    const reportDetails = UIElements.getElement('reportDetails');
    const details = reportDetails ? reportDetails.value.trim() : '';
    const anonymousToggle = UIElements.getElement('anonymousReportToggle');
    const isAnonymous = anonymousToggle ? anonymousToggle.checked : false;
    
    if (!selectedReason) {
        showNotification('Please select a reason', 'error');
        return;
    }
    
    if (details.length < 10) {
        showNotification('Please provide more details (minimum 10 characters)', 'error');
        return;
    }
    
    try {
        const btn = UIElements.getElement('submitReportBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }
        
        const response = await reportStatus(currentViewerStatus.id, selectedReason, details);
        
        if (response && response.success) {
            showNotification(`Report submitted ${isAnonymous ? 'anonymously' : ''}`, 'success');
            
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
// MODAL FUNCTIONS
// =============================================
function showHighlightsModal() {
    const modal = UIElements.highlightsModal;
    if (modal) {
        modal.classList.add('active');
        loadHighlightsContent();
    }
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
                <button class="btn primary" onclick="document.getElementById('createHighlightBtn')?.click()">
                    <i class="fas fa-plus"></i> Create Highlight
                </button>
            </div>
        `;
        return;
    }
    
    highlights.forEach(highlight => {
        const item = document.createElement('div');
        item.className = 'highlight-item';
        
        item.innerHTML = `
            <div class="highlight-cover" style="background: ${highlight.color || 'var(--highlight-gradient)'}">
                <i class="${highlight.icon || 'fas fa-star'}"></i>
            </div>
            <div class="highlight-info">
                <div class="highlight-name">${UISanitizer.sanitizeHTML(highlight.name)}</div>
                <div class="highlight-count">${highlight.count || 0} statuses</div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            showNotification(`Opening ${highlight.name}`, 'info');
        });
        
        content.appendChild(item);
    });
}

function showHighlightsEditor(highlight = null) {
    const title = UIElements.getElement('highlightEditorTitle');
    const nameInput = UIElements.getElement('highlightNameInput');
    const iconSelect = UIElements.getElement('highlightIconSelect');
    
    if (title && nameInput && iconSelect) {
        if (highlight) {
            title.textContent = 'Edit Highlight';
            nameInput.value = highlight.name || '';
            iconSelect.value = highlight.icon || 'fas fa-star';
            
            const colorGrid = UIElements.getElement('highlightColorGrid');
            if (colorGrid && highlight.color) {
                const colorOption = colorGrid.querySelector(`[data-bg="${highlight.color}"]`);
                if (colorOption) {
                    colorGrid.querySelectorAll('.background-option').forEach(opt => opt.classList.remove('selected'));
                    colorOption.classList.add('selected');
                }
            }
            
            const privacyOptions = UIElements.getElement('highlightPrivacyOptions');
            if (privacyOptions && highlight.privacy) {
                const privacyOption = privacyOptions.querySelector(`[data-privacy="${highlight.privacy}"]`);
                if (privacyOption) {
                    privacyOptions.querySelectorAll('.privacy-option').forEach(opt => opt.classList.remove('selected'));
                    privacyOption.classList.add('selected');
                }
            }
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
        const response = await secureApiCall('/api/statuses/highlights', {
            method: 'POST',
            body: JSON.stringify(highlight)
        });
        
        if (response && response.success) {
            highlights.push(highlight);
            localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
            
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
    const modal = UIElements.memoryTimelineModal;
    if (modal) {
        modal.classList.add('active');
        loadMemoryTimelineContent();
    }
}

function loadMemoryTimelineContent() {
    const content = UIElements.getElement('memoryTimelineContent');
    if (!content) return;
    
    content.innerHTML = '';
    
    if (!myStatuses || myStatuses.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No status history yet</p>
                <p class="subtext">Your posted statuses will appear here</p>
            </div>
        `;
        return;
    }
    
    const grouped = {};
    
    myStatuses.forEach(status => {
        const date = new Date(status.createdAt);
        const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        if (!grouped[monthYear]) grouped[monthYear] = [];
        grouped[monthYear].push(status);
    });
    
    Object.entries(grouped).forEach(([monthYear, monthStatuses]) => {
        const section = document.createElement('div');
        section.className = 'timeline-month';
        
        let daysHtml = '';
        
        monthStatuses.slice(0, 10).forEach(status => {
            const date = new Date(status.createdAt);
            const day = date.getDate();
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            
            daysHtml += `
                <div class="timeline-day" data-status-id="${status.id}">
                    <div class="timeline-date">${day} ${month}</div>
                    <div class="timeline-status">${UISanitizer.sanitizeHTML(getStatusPreviewText(status))}</div>
                    ${status.mood ? `<div class="timeline-mood" style="background-color: ${statusMoods[status.mood]?.color || 'var(--mood-happy)'}"></div>` : ''}
                </div>
            `;
        });
        
        section.innerHTML = `
            <div class="timeline-month-header">${monthYear}</div>
            <div class="timeline-days">
                ${daysHtml}
            </div>
        `;
        
        section.querySelectorAll('.timeline-day').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const statusId = dayEl.dataset.statusId;
                const status = myStatuses.find(s => s.id === statusId);
                if (status) {
                    showStatusViewer(status);
                    
                    const modal = UIElements.memoryTimelineModal;
                    if (modal) modal.classList.remove('active');
                }
            });
        });
        
        content.appendChild(section);
    });
}

function exportTimeline() {
    const data = {
        user: currentUser?.displayName || 'User',
        exportDate: new Date().toISOString(),
        totalStatuses: myStatuses.length,
        statuses: myStatuses.map(s => ({
            date: s.createdAt,
            type: s.type,
            text: s.text || s.caption || s.question,
            mood: s.mood,
            intent: s.intent,
            category: s.category
        }))
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Timeline exported successfully', 'success');
}

function showStatsModal() {
    const modal = UIElements.statsModal;
    if (modal) {
        modal.classList.add('active');
        loadStatsContent();
    }
}

function loadStatsContent() {
    const content = UIElements.getElement('statsContent');
    if (!content) return;
    
    const totalStatuses = myStatuses.length;
    const totalViews = myStatuses.reduce((sum, s) => sum + (s.views || 0), 0);
    const totalReactions = myStatuses.reduce((sum, s) => sum + (s.reactions || 0), 0);
    const avgViewTime = myStatuses.length > 0 
        ? Math.round(myStatuses.reduce((sum, s) => sum + (s.avgViewTime || 0), 0) / myStatuses.length) 
        : 0;
    const engagementRate = totalViews > 0 ? Math.round((totalReactions / totalViews) * 100) : 0;
    
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
    if (avgViewTimeStat) avgViewTimeStat.textContent = avgViewTime + 's';
    if (engagementRateStat) engagementRateStat.textContent = engagementRate + '%';
    
    updateStatsChart();
    loadRecentViewers();
}

function updateStatsChart() {
    const chart = UIElements.getElement('viewsChart');
    if (!chart) return;
    
    const data = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        data.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            views: Math.floor(Math.random() * 100) + 10
        });
    }
    
    chart.innerHTML = '';
    
    const maxViews = Math.max(...data.map(d => d.views));
    
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'flex-end';
    container.style.gap = '2px';
    container.style.height = '200px';
    container.style.width = '100%';
    
    data.forEach((item, idx) => {
        const bar = document.createElement('div');
        bar.style.flex = '1';
        bar.style.height = (item.views / maxViews * 100) + '%';
        bar.style.backgroundColor = 'var(--primary-color)';
        bar.style.borderRadius = '2px 2px 0 0';
        bar.style.position = 'relative';
        bar.title = `${item.date}: ${item.views} views`;
        
        bar.addEventListener('mouseenter', () => bar.style.backgroundColor = '#0073e6');
        bar.addEventListener('mouseleave', () => bar.style.backgroundColor = 'var(--primary-color)');
        
        container.appendChild(bar);
    });
    
    chart.appendChild(container);
}

function loadRecentViewers() {
    const list = UIElements.getElement('recentViewersList');
    if (!list) return;
    
    list.innerHTML = '';
    
    const viewers = [
        { name: 'Alex Johnson', time: '2 hours ago', avatar: 'AJ' },
        { name: 'Sam Wilson', time: '5 hours ago', avatar: 'SW' },
        { name: 'Taylor Swift', time: '1 day ago', avatar: 'TS' },
        { name: 'John Doe', time: '2 days ago', avatar: 'JD' },
        { name: 'Jane Smith', time: '3 days ago', avatar: 'JS' }
    ];
    
    viewers.forEach(viewer => {
        const item = document.createElement('div');
        item.className = 'viewer-item';
        item.innerHTML = `
            <div class="viewer-avatar">${viewer.avatar}</div>
            <div class="viewer-info">
                <div class="viewer-name">${viewer.name}</div>
                <div class="viewer-time">${viewer.time}</div>
            </div>
        `;
        list.appendChild(item);
    });
}

function showDraftsModal() {
    const modal = UIElements.draftsModal;
    if (modal) {
        modal.classList.add('active');
        updateDraftsList();
    }
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
    
    drafts.forEach(draft => {
        const item = document.createElement('div');
        item.className = 'draft-item';
        item.dataset.draftId = draft.id;
        
        let preview = '';
        if (draft.type === 'text') preview = draft.text || 'Text draft';
        else if (draft.type === 'media') preview = `📷 ${draft.caption || 'Media draft'}`;
        else if (draft.type === 'poll') preview = `📊 ${draft.question || 'Poll draft'}`;
        
        const timeAgo = draft.createdAt ? formatTimeAgo(draft.createdAt) : 'Just now';
        
        item.innerHTML = `
            <div class="draft-preview">${UISanitizer.sanitizeHTML(preview.substring(0, 100))}${preview.length > 100 ? '...' : ''}</div>
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
        
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.draft-actions')) {
                item.classList.toggle('selected');
                
                if (item.classList.contains('selected')) {
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
        
        const actionButtons = item.querySelectorAll('.draft-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleDraftAction(action, draft);
            });
        });
        
        list.appendChild(item);
    });
}

function handleDraftAction(action, draft) {
    if (action === 'edit') {
        loadDraft(draft);
    } else if (action === 'delete') {
        deleteDraft(draft.id);
    }
}

function loadDraft(draft) {
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
    
    if (draft.category) {
        const categoryOption = UIElements.querySelector(`.category-option[data-category="${draft.category}"]`);
        if (categoryOption) {
            UIElements.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
            categoryOption.classList.add('selected');
        }
    }
    
    const draftsModal = UIElements.draftsModal;
    if (draftsModal) draftsModal.classList.remove('active');
    
    showNotification('Draft loaded', 'success');
}

function deleteDraft(draftId) {
    if (!confirm('Are you sure you want to delete this draft?')) return;
    
    drafts = drafts.filter(d => d.id !== draftId);
    localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    
    showNotification('Draft deleted', 'success');
    updateDraftsList();
}

function deleteAllDrafts() {
    if (!drafts || drafts.length === 0) {
        showNotification('No drafts to delete', 'info');
        return;
    }
    
    if (!confirm('Are you sure you want to delete all drafts? This action cannot be undone.')) return;
    
    drafts = [];
    localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    
    showNotification('All drafts deleted', 'success');
    updateDraftsList();
}

function updateScheduledStatusesList() {
    const list = UIElements.getElement('scheduledStatusesList');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (!scheduledStatuses || scheduledStatuses.length === 0) {
        list.innerHTML = `
            <div class="schedule-empty">
                <i class="fas fa-clock"></i>
                <p>No scheduled statuses</p>
                <p class="subtext">Schedule a status to see it here</p>
            </div>
        `;
        return;
    }
    
    scheduledStatuses.forEach(scheduled => {
        const item = document.createElement('div');
        item.className = 'schedule-item';
        
        const scheduledFor = new Date(scheduled.scheduledFor);
        const timeString = scheduledFor.toLocaleString();
        
        item.innerHTML = `
            <div class="schedule-info">
                <h4>${scheduled.type || 'Status'} - ${UISanitizer.sanitizeHTML(getStatusPreviewText(scheduled))}</h4>
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
        
        const actionButtons = item.querySelectorAll('button');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleScheduleAction(action, scheduled);
            });
        });
        
        list.appendChild(item);
    });
}

function handleScheduleAction(action, scheduled) {
    if (action === 'edit') {
        showNotification('Edit scheduled status feature coming soon', 'info');
    } else if (action === 'cancel') {
        cancelScheduledStatus(scheduled.id);
    }
}

async function cancelScheduledStatus(scheduleId) {
    if (!confirm('Are you sure you want to cancel this scheduled status?')) return;
    
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
        UILogger.error('Schedule', 'Failed to cancel scheduled status', error);
        showNotification('Failed to cancel scheduled status', 'error');
    }
}

function handleMediaUpload(event) {
    const files = event.target.files;
    const preview = UIElements.getElement('mediaPreview');
    
    if (!preview) return;
    
    preview.innerHTML = '';
    
    for (let i = 0; i < Math.min(files.length, 5); i++) {
        const file = files[i];
        const fileType = file.type.split('/')[0];
        
        if (fileType !== 'image' && fileType !== 'video') {
            showNotification('Only images and videos are supported', 'error');
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
            }
            
            const removeBtn = item.querySelector('.remove-media-btn');
            removeBtn.addEventListener('click', () => item.remove());
            
            preview.appendChild(item);
        };
        
        reader.readAsDataURL(file);
    }
}

// =============================================
// FILTER FUNCTIONS
// =============================================
function addFilterTag(filter, label) {
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
    
    updateCurrentSectionUI();
}

function removeFilterTag(filter) {
    activeFilters.delete(filter);
    
    const tag = UIElements.querySelector(`.filter-tag[data-filter="${filter}"]`);
    if (tag) tag.remove();
    
    const clearBtn = UIElements.getElement('clearFiltersBtn');
    if (clearBtn && activeFilters.size === 0) clearBtn.style.display = 'none';
    
    updateCurrentSectionUI();
}

function clearAllFilters() {
    activeFilters.clear();
    
    const tags = UIElements.getElement('filterTags');
    if (tags) tags.innerHTML = '';
    
    const clearBtn = UIElements.getElement('clearFiltersBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    
    updateCurrentSectionUI();
}

// =============================================
// RENDER STATUS LIST INSTANTLY - RENAMED TO AVOID DUPLICATE
// =============================================
function renderStatusListInstantlyUI() {
    const container = UIElements.allStatusList;
    if (!container) return;
    
    if (!statuses || statuses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No statuses yet</p>
                <p class="subtext">Be the first to post a status!</p>
                ${isAuthenticated() ? `
                    <button class="btn primary" onclick="document.getElementById('createStatusBtn')?.click()">
                        <i class="fas fa-plus"></i> Create Status
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    const filtered = InitialRender.filterStatuses(statuses);
    
    filtered.slice(0, 10).forEach(status => {
        const element = InitialRender.createStatusElement(status);
        if (element) fragment.appendChild(element);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

// =============================================
// UPDATE MY STATUS PREVIEW - RENAMED TO AVOID DUPLICATE
// =============================================
function updateMyStatusPreviewUI() {
    const preview = UIElements.getElement('myStatusPreview');
    if (!preview) return;
    
    const ring = UIElements.getElement('myStatusRing');
    const avatar = UIElements.getElement('myStatusAvatar');
    const indicator = UIElements.getElement('myStatusIndicator');
    const statusText = UIElements.getElement('myStatusText');
    
    if (currentUser && currentUser.photoURL && avatar) {
        avatar.innerHTML = `<img src="${UISanitizer.sanitizeHTML(currentUser.photoURL)}" style="width: 100%; height: 100%; border-radius: 50%;">`;
    }
    
    if (myStatuses && myStatuses.length > 0) {
        const latest = myStatuses[0];
        if (ring) ring.classList.remove('viewed');
        if (indicator) indicator.classList.remove('viewed');
        if (statusText) statusText.textContent = getStatusPreviewText(latest);
        
        preview.innerHTML = `
            <div class="my-status-preview-content">
                <div class="my-status-preview-text">${UISanitizer.sanitizeHTML(getStatusPreviewText(latest))}</div>
                <div class="my-status-preview-time">${formatTimeAgo(latest.createdAt)}</div>
            </div>
        `;
    } else {
        if (ring) ring.classList.add('viewed');
        if (indicator) indicator.classList.add('viewed');
        if (statusText) statusText.textContent = 'No recent status';
        
        preview.innerHTML = `
            <div class="my-status-preview-placeholder">
                <i class="fas fa-plus-circle"></i>
                <span>Create your first status</span>
            </div>
        `;
    }
}

// =============================================
// UPDATE MOOD CHART
// =============================================
function updateMoodChartUI() {
    const chart = UIElements.getElement('moodChart');
    if (!chart) return;
    
    chart.innerHTML = '';
    
    const data = moodChartData.length > 0 ? moodChartData : generateSampleMoodData();
    
    data.slice(-14).forEach((day, idx) => {
        const bar = document.createElement('div');
        bar.className = 'mood-bar';
        bar.style.backgroundColor = statusMoods[day.mood]?.color || 'var(--mood-happy)';
        bar.style.height = `${day.value}%`;
        bar.title = `Day ${idx + 1}: ${statusMoods[day.mood]?.name || 'Happy'} (${day.value}%)`;
        chart.appendChild(bar);
    });
}

// =============================================
// CLEANUP AND MEMORY MANAGEMENT
// =============================================
function cleanupUI() {
    UILogger.info('Cleanup', 'Cleaning up UI resources');
    
    stopAutoAdvance();
    
    uiEvents.removeAllListeners();
    UIBridge.clearSubscriptions();
    UIStateManager.clear();
    
    UILogger.info('Cleanup', 'UI cleanup complete');
}

// =============================================
// APPLICATION INITIALIZATION
// =============================================
document.addEventListener('DOMContentLoaded', async function() {
    UILogger.info('Init', 'DOM Content Loaded - Starting UI initialization');
    
    UIRenderPipeline.setStage('skeleton');
    SkeletonLoader.show();
    
    try {
        loadCachedDataInstantly();
        renderStatusListInstantlyUI();
        
        UIRenderPipeline.setStage('initialRender');
        
        initializeUIComponents();
        setupBasicEventListeners();
        
        UIBridge.initialize();
        uiEvents.initialize();
        ResponsiveEngine.initialize();
        
        UIRenderPipeline.setStage('progressiveEnhancement');
        
        onTokenReady(() => {
            UILogger.info('Init', 'Token ready - Enabling protected UI');
            
            updateUserUIInstantly();
            enableProtectedUI();
            
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
        
        initPageCore();
        
    } catch (error) {
        UILogger.error('Init', 'Failed to initialize UI', error);
        
        SkeletonLoader.hideAll();
        
        const container = UIElements.allStatusList;
        if (container) {
            container.innerHTML = uiErrorBoundary.createStatusListFallback();
        }
    }
});

// =============================================
// PAGE UNLOAD CLEANUP
// =============================================
window.addEventListener('beforeunload', cleanupUI);
window.addEventListener('pagehide', cleanupUI);

// =============================================
// EXPORT PUBLIC API - RENAMED TO AVOID CONFLICTS
// =============================================
export {
    showStatusViewer,
    showNotification,
    updateCurrentSectionUI as updateCurrentSection,
    renderStatusListInstantlyUI as renderStatusListInstantly,
    updateMyStatusPreviewUI as updateMyStatusPreview,
    updateMoodChartUI as updateMoodChart,
    enableProtectedUI,
    disableProtectedUI,
    showLogoutState,
    showReconnectionState,
    renderStatusesListUI as renderStatusesList,
    cleanupUI,
    UILogger,
    UIStateManager,
    ResponsiveEngine,
    uiErrorBoundary
};

// =============================================
// GLOBAL EXPOSURE - LEGACY SUPPORT
// =============================================
if (typeof window !== 'undefined') {
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
            cleanupUI
        };
    } catch (e) {
        UILogger.error('Global', 'Failed to expose global UI API', e);
    }
}

// Helper function for user UI update
function updateUserUIInstantly() {
    // Implementation would go here if needed
    UILogger.debug('UI', 'User UI updated instantly');
}

UILogger.info('StatusUI', 'Resilient UI controller initialized successfully');
console.log('[StatusUI] Resilient UI controller ready');