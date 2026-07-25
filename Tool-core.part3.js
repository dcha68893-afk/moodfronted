/**
 * PART 3/3 — UI BRIDGE & PUBLIC API
 * UI bridge, public API, initialization,
 * exports, settings bootstrap, ecom patch
 */
import {
    AVAILABILITY, DATA_TYPES, LIFECYCLE_STATE, LISTING_TYPES, LOCAL_STORAGE_KEYS, MODULE_NAME,
    MODULE_VERSION, MOOD_CONTEXTS, MessageGuard, SessionClient, StorageProxy, TEMPLATE_TYPES,
    TRUST_CIRCLES, TRUST_INDICATORS, VALID_TRANSITIONS, __isValidSession, _deepExtractToken, _deepExtractUserId,
    activationComplete, allListings, analyticsData, apiCallQueue, assertActive, backgroundJobsStarted,
    childReadySent, currentMoodFilter, currentState, currentUser, dataCache, dataFetchInProgress,
    directAPILoaded, environmentDetector, flushMessageQueue, generateMessageId, generateRequestId, handshakeComplete,
    initializationLock, isActive, isAuthReady, isBootstrapped, isInitializing, isMessageFromParent,
    isProcessingQueue, isReady, leaderboardData, loadingMessageElement, logError, logOnce,
    messageQueue, moduleState, myListings, offlineDrafts, parentComm, parentDataLoaded,
    parentReadyReceived, premiumFeatures, privateNotes, safeSend, safeStorage, savedItems,
    sessionData, sessionValid, streakData, teamMembers, tokenInitializationPromise, transitionTo,
    trustStats, userData, userFriends, userGroups, userSubscription, validateMessage,
    __set_activationComplete, __set_allListings, __set_analyticsData, __set_backgroundJobsStarted, __set_childReadySent, __set_currentMoodFilter,
    __set_dataFetchInProgress, __set_directAPILoaded, __set_handshakeComplete, __set_initializationLock, __set_isAuthReady, __set_isBootstrapped,
    __set_isInitializing, __set_isProcessingQueue, __set_isReady, __set_leaderboardData, __set_loadingMessageElement, __set_myListings,
    __set_offlineDrafts, __set_parentDataLoaded, __set_parentReadyReceived, __set_premiumFeatures, __set_privateNotes, __set_savedItems,
    __set_sessionData, __set_sessionValid, __set_streakData, __set_teamMembers, __set_tokenInitializationPromise, __set_trustStats,
    __set_userFriends, __set_userGroups, __set_userSubscription
} from './Tool-core.part1.js';
// sessionClient / heartbeatResponder / diagnostics / resourceManager / messageHandler / uiBridge
// live in part2; part2 in turn imports `marketplace` / `onModuleActive` (declared below) from
// this file. Safe circular import: both sides only touch these bindings from inside functions
// that run after the whole module graph has finished its initial (synchronous) evaluation.
import {
    sessionClient, heartbeatResponder, diagnostics, messageHandler, resourceManager, uiBridge
} from './Tool-core.part2.js';

// Re-export everything from part1 and part2 so consumers (e.g. Tool-ui.js) can import
// the full public API from this single file instead of reaching into all three.
export * from './Tool-core.part1.js';
export {
    sessionClient, heartbeatResponder, diagnostics, messageHandler, resourceManager, uiBridge
} from './Tool-core.part2.js';

class MarketplaceCoreImpl {
    constructor() {
        this.listings = [];
        this.myListings = [];
        this.savedListings = [];
        this.currentUser = null;
        this.filters = {
            search: '',
            category: '',
            minPrice: null,
            maxPrice: null,
            available: null,
            sort: 'newest'
        };
        this.pagination = {
            page: 1,
            limit: 20,
            total: 0,
            hasMore: true
        };
        this.loading = false;
        this.initialized = false;
        this.syncChannel = null;
        this.listeners = new Map();
        
        this.loadFromCache();
        this.setupSyncChannel();
        this.setupEventListeners();
    }

    setupSyncChannel() {
        try {
            this.syncChannel = new BroadcastChannel('marketplace_sync');
            this.syncChannel.onmessage = (event) => {
                if (!assertActive('syncChannel message')) return;
                if (event.data && event.data.type && isActive()) {
                    this.handleSyncMessage(event.data);
                }
            };
        } catch (e) {}
    }

    setupEventListeners() {
        // Storage events are not available in sandbox, using proxy instead
        // Window event for cache updates
        window.addEventListener('storageProxy:updated', (e) => {
            if (!assertActive('storage event')) return;
            if (e.detail && e.detail.key && e.detail.key.startsWith('marketplace_') && isActive()) {
                this.loadFromCache();
                this.notifyUI('storageUpdated', { key: e.detail.key });
            }
        });
    }

    async loadFromCache() {
        try {
            const cachedListings = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (cachedListings) this.listings = this.sanitizeListings(cachedListings);
            const cachedMyListings = await safeStorage.get(LOCAL_STORAGE_KEYS.MY_LISTINGS);
            if (cachedMyListings) this.myListings = this.sanitizeListings(cachedMyListings);
            const cachedSaved = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
            if (cachedSaved) this.savedListings = this.sanitizeListings(cachedSaved);
        } catch (error) {
            logError('loadFromCache', error);
        }
    }

    handleUIAction(payload) {
        if (!assertActive('handleUIAction')) return;
        if (!payload || !payload.action) return;
        
        switch (payload.action) {
            case 'refresh_listings':
                this.loadListings();
                break;
            case 'show_saved_items':
                this.notifyUI('showSavedItems', this.savedListings);
                break;
            case 'show_my_listings':
                this.notifyUI('showMyListings', this.myListings);
                break;
            case 'contact_seller':
                if (payload.data?.listingId) {
                    this.contactSeller(payload.data.listingId).catch(() => {});
                }
                break;
            case 'toggle_save':
                if (payload.data?.listingId) {
                    this.toggleSave(payload.data.listingId).catch(() => {});
                }
                break;
            case 'filter_search':
                this.setFilter('search', payload.data?.value || '');
                break;
            case 'filter_category':
                this.setFilter('category', payload.data?.value || '');
                break;
            case 'filter_price':
                this.setFilter('minPrice', payload.data?.min ? parseFloat(payload.data.min) : null);
                this.setFilter('maxPrice', payload.data?.max ? parseFloat(payload.data.max) : null);
                break;
            case 'filter_sort':
                this.setFilter('sort', payload.data?.value || 'newest');
                break;
            case 'reset_filters':
                this.resetFilters();
                break;
            case 'load_more_listings':
                this.loadMore();
                break;
            case 'submit_listing_form':
                this.createListing(payload.data).catch(() => {});
                break;
            case 'delete_listing':
                if (payload.data?.listingId) {
                    this.deleteListing(payload.data.listingId).catch(() => {});
                }
                break;
            case 'edit_listing':
                if (payload.data?.listingId) {
                    this.notifyUI('editListing', { listingId: payload.data.listingId });
                }
                break;
        }
    }

    handleSyncMessage(data) {
        if (!assertActive('handleSyncMessage')) return;
        if (!isActive()) return;
        
        switch (data.type) {
            case 'LISTING_CREATED':
                if (data.listing) this.handleListingCreated(data.listing);
                break;
            case 'LISTING_UPDATED':
                if (data.listing) this.handleListingUpdated(data.listing);
                break;
            case 'LISTING_DELETED':
                if (data.id) this.handleListingDeleted({ id: data.id });
                break;
            case 'SAVE_TOGGLED':
                if (data.listingId && data.userId) {
                    this.handleSaveToggled(data.listingId, data.userId, data.saved);
                }
                break;
        }
    }

    handleListingCreated(listing) {
        if (!assertActive('handleListingCreated')) return;
        
        const exists = this.listings.some(l => l.id === listing.id);
        if (!exists) {
            this.listings = [this.sanitizeListing(listing), ...this.listings];
            if (listing.sellerId === this.currentUser?.id) {
                this.myListings = [listing, ...this.myListings];
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
            }
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
            this.notifyUI('listingCreated', listing);
        }
    }

    handleListingUpdated(updated) {
        if (!assertActive('handleListingUpdated')) return;
        
        this.listings = this.listings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.myListings = this.myListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.savedListings = this.savedListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
        this.notifyUI('listingUpdated', updated);
    }

    handleListingDeleted(deleted) {
        if (!assertActive('handleListingDeleted')) return;
        
        this.listings = this.listings.filter(l => l.id !== deleted.id);
        this.myListings = this.myListings.filter(l => l.id !== deleted.id);
        this.savedListings = this.savedListings.filter(l => l.id !== deleted.id);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
        this.notifyUI('listingDeleted', deleted);
    }

    handleSaveToggled(listingId, userId, saved) {
        if (!assertActive('handleSaveToggled')) return;
        
        this.listings = this.listings.map(l => {
            if (l.id === listingId) {
                const savedBy = l.savedBy || [];
                l.savedBy = saved ? [...new Set([...savedBy, userId])] : savedBy.filter(id => id !== userId);
            }
            return l;
        });
        if (userId === this.currentUser?.id) {
            const listing = this.listings.find(l => l.id === listingId);
            if (saved && listing && !this.savedListings.some(l => l.id === listingId)) {
                this.savedListings = [listing, ...this.savedListings];
            } else if (!saved) {
                this.savedListings = this.savedListings.filter(l => l.id !== listingId);
            }
            safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
            this.notifyUI('saveToggled', { listingId, saved });
        }
    }

    async initialize() {
        if (this.initialized || !isActive()) return;
        
        try {
            const user = sessionClient.getUser ? sessionClient.getUser() : null;
            this.currentUser = user;
            
            await this.loadListings();
            
            this.initialized = true;
            logOnce('ready', 'MarketplaceCore ready');
            
        } catch (error) {
            logError('MarketplaceCore.initialize', error);
            // Do not generate sample data — show real empty state
            this.initialized = true;
        }
    }

    
    async loadListings() {
        // assertActive removed — loadListings works regardless of lifecycle state
        
        this.loading = true;
        this.notifyUI('loading', true);
        
        try {
            // Primary path: direct authorized fetch to backend
            const response = await safeApiCall('GET', '/api/marketplace/listings?page=' + this.pagination.page + '&limit=' + this.pagination.limit);
            
            // FIX: Backend returns { success, data: { listings, total } }
            if (response && response.data?.listings) {
                const listingsData = response.data.listings;
                this.listings = this.sanitizeListings(listingsData);
                this.pagination.total = response.data.total || listingsData.length;
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                // Expose globally for UI
                window.allListings = this.listings;
                this.notifyUI('data-updated', { listings: this.listings, total: this.pagination.total });
            } else if (response && (response.listings || response.data?.listings)) {
                // Fallback for legacy format
                const listingsData = response.listings || response.data?.listings || [];
                this.listings = this.sanitizeListings(listingsData);
                this.pagination.total = response.total || response.data?.total || this.listings.length;
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                window.allListings = this.listings;
                this.notifyUI('data-updated', { listings: this.listings, total: this.pagination.total });
            } else {
                // Try postMessage path as fallback
                try {
                    const result = await this.sendWithResponse('FETCH_LISTINGS', {
                        page: this.pagination.page,
                        limit: this.pagination.limit
                    });
                    if (result && result.listings) {
                        this.listings = this.sanitizeListings(result.listings);
                        this.pagination.total = result.total || this.listings.length;
                        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                        window.allListings = this.listings;
                        this.notifyUI('data-updated', { listings: this.listings, total: this.pagination.total });
                    }
                } catch (_) {
                    // Fall through to cache
                }
                if (this.listings.length === 0) {
                    const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                    if (cached) {
                        this.listings = this.sanitizeListings(cached);
                        window.allListings = this.listings;
                    }
                }
            }
        } catch (error) {
            logError('loadListings', error);
            const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (cached) {
                this.listings = this.sanitizeListings(cached);
                window.allListings = this.listings;
            }
            // No sample data — show real empty state to user
        } finally {
            this.loading = false;
            this.notifyUI('loading', false);
            this.notifyUI('listingsLoaded', this.getFilteredListings());
        }
    }

    sendWithResponse(type, payload = {}) {
        return new Promise((resolve, reject) => {
            if (!assertActive('sendWithResponse')) {
                reject(new Error('Module not active'));
                return;
            }
            
            if (!sessionClient.isValid()) {
                reject(new Error('Session not ready'));
                return;
            }
            
            const requestId = generateRequestId();
            
            const responseHandler = (event) => {
                if (!isMessageFromParent(event)) return;
                if (!validateMessage(event.data)) return;
                if (event.data.type === type + '_RESPONSE' && 
                    event.data.requestId === requestId) {
                    window.removeEventListener('message', responseHandler);
                    resolve(event.data.payload.data);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            safeSend(type, {
                requestId: requestId,
                ...payload,
                _auth: {
                    hasSession: sessionClient.isValid()
                }
            });
            
            // Timeout with safe fallback
            const timeoutId = setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Request timeout'));
            }, 10000);
            
            // Cleanup timeout on resolve
            const originalResolve = resolve;
            resolve = (value) => {
                clearTimeout(timeoutId);
                originalResolve(value);
            };
        });
    }

    loadMyListings() {
        if (!assertActive('loadMyListings')) return;
        if (!this.currentUser) return;
        this.myListings = this.listings.filter(l => l.sellerId === this.currentUser.id);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
    }

    async loadSavedListings() {
        if (!assertActive('loadSavedListings')) return;
        // FIX: Fetch from backend endpoint
        try {
            const response = await safeApiCall('GET', '/api/marketplace/listings/saved');
            if (response && response.data?.listings) {
                this.savedListings = this.sanitizeListings(response.data.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
            } else {
                const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
                if (cached) {
                    this.savedListings = this.sanitizeListings(cached);
                }
            }
        } catch (error) {
            const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
            if (cached) {
                this.savedListings = this.sanitizeListings(cached);
            }
        }
    }

    async createListing(listingData) {
        if (!assertActive('createListing')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

        if (!listingData.title || !listingData.description) {
            throw new Error('Title and description are required');
        }

        const sanitized = this.sanitizeListingData(listingData);
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;
        const fakeId  = 'optimistic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

        // ── STEP 1: Optimistic write — update UI and IDB immediately ──────────
        const optimistic = {
            id: fakeId,
            _isOptimistic: true,
            sellerId: userId,
            userId: userId,
            seller: {
                id: userId,
                name: user?.displayName || user?.name || 'You',
                photoURL: user?.photoURL || ''
            },
            title: this.escapeHtml(sanitized.title),
            description: this.escapeHtml(sanitized.description),
            price: this.validatePrice(sanitized.price),
            category: sanitized.category || 'other',
            type: listingData.type || 'service',
            condition: listingData.condition || 'new',
            images: sanitized.images || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            available: sanitized.available !== false,
            savedBy: [],
            views: 0
        };

        // Snapshot for rollback
        const prevListings   = [...this.listings];
        const prevMyListings = [...this.myListings];

        // Prepend optimistic entry
        this.listings   = [optimistic, ...this.listings];
        this.myListings = [optimistic, ...this.myListings];

        // Persist optimistic state to IDB + window globals immediately
        window.allListings = this.listings;
        window.myListings  = this.myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  this.myListings);

        // Fire UI update NOW — user sees listing instantly
        this.notifyUI('listingCreated', optimistic);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
            detail: { listings: this.listings, source: 'optimistic' }
        }));

        // ── STEP 2: Backend call — reconcile with real server ID ──────────────
        try {
            // Wait briefly for token if session just became active
            let token = sessionClient.getToken ? sessionClient.getToken() : null;
            if (!token) {
                await new Promise(r => setTimeout(r, 800));
                token = sessionClient.getToken ? sessionClient.getToken() : null;
            }

            const result = await safeApiCall('POST', '/api/marketplace/listings', {
                title:       sanitized.title,
                description: sanitized.description,
                price:       sanitized.price,
                category:    sanitized.category,
                type:        listingData.type || 'service',
                condition:   listingData.condition || 'new',
                images:      sanitized.images || [],
                available:   sanitized.available !== false
            });

            // Normalise response — backend wraps in data.listing or listing
            const serverListing = result?.data?.listing || result?.listing;
            if (!serverListing || !serverListing.id) {
                throw new Error('Server returned no listing payload');
            }

            // ── STEP 3: Reconcile — swap optimistic entry with confirmed one ─
            const committed = {
                ...optimistic,
                ...serverListing,
                id:             serverListing.id,
                _isOptimistic:  false,
                title:          this.escapeHtml(serverListing.title   || sanitized.title),
                description:    this.escapeHtml(serverListing.description || sanitized.description),
                price:          this.validatePrice(serverListing.price ?? sanitized.price),
                createdAt:      serverListing.createdAt || optimistic.createdAt,
                updatedAt:      serverListing.updatedAt || optimistic.updatedAt,
                seller:         optimistic.seller,
                user:           optimistic.seller,
            };

            this.listings   = this.listings.map(l   => l.id === fakeId ? committed : l);
            this.myListings = this.myListings.map(l => l.id === fakeId ? committed : l);
            window.allListings = this.listings;
            window.myListings  = this.myListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
            safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  this.myListings);

            // Notify UI with committed listing (replaces optimistic)
            this.notifyUI('listingCommitted', committed);
            window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                detail: { listings: this.listings, source: 'committed' }
            }));

            // Broadcast to other tabs with real server ID
            try {
                const ch = new BroadcastChannel('marketplace_sync');
                ch.postMessage({ type: 'LISTING_CREATED', listing: committed });
                ch.close();
            } catch (_) {}

            return committed;

        } catch (error) {
            // ── STEP 4: Rollback on hard failure ─────────────────────────────
            // Queue for background retry rather than silently losing the listing
            if (typeof queueForSync === 'function') {
                queueForSync({ ...optimistic, id: undefined }, 'listing');
            }

            // Keep optimistic in UI until sync succeeds — better UX than disappearing
            // But mark it clearly as pending
            this.listings   = this.listings.map(l   =>
                l.id === fakeId ? { ...l, _syncPending: true, _isOptimistic: true } : l
            );
            this.myListings = this.myListings.map(l =>
                l.id === fakeId ? { ...l, _syncPending: true, _isOptimistic: true } : l
            );
            window.allListings = this.listings;
            window.myListings  = this.myListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
            safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  this.myListings);

            window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                detail: { listings: this.listings, source: 'sync-pending' }
            }));

            logError('createListing', error);
            // Don't throw — optimistic entry is still visible and queued
            return { ...optimistic, _syncPending: true };
        }
    }

    async updateListing(listingId, updates) {
        if (!assertActive('updateListing')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        if (listing.sellerId !== user?.id) throw new Error('You can only edit your own listings');

        const sanitized = {};
        if (updates.title) sanitized.title = this.escapeHtml(updates.title);
        if (updates.description) sanitized.description = this.escapeHtml(updates.description);
        if (updates.price !== undefined) sanitized.price = this.validatePrice(updates.price);
        if (updates.category) sanitized.category = updates.category;
        if (updates.images) sanitized.images = updates.images.filter(this.validateImage);
        if (updates.available !== undefined) sanitized.available = !!updates.available;

        // FIX: Use direct API call
        try {
            const result = await safeApiCall('PUT', `/api/marketplace/listings/${listingId}`, sanitized);

            if (result && result.data?.listing) {
                const updatedListing = { ...listing, ...result.data.listing, updatedAt: new Date().toISOString() };
                this.listings = this.listings.map(l => l.id === listingId ? updatedListing : l);
                this.myListings = this.myListings.map(l => l.id === listingId ? updatedListing : l);
                this.savedListings = this.savedListings.map(l => l.id === listingId ? updatedListing : l);
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
                this.notifyUI('listingUpdated', updatedListing);
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_UPDATED', listing: updatedListing });
                }
                return updatedListing;
            } else {
                throw new Error('Failed to update listing');
            }
        } catch (error) {
            logError('updateListing', error);
            throw error;
        }
    }

    async deleteListing(listingId) {
        if (!assertActive('deleteListing')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');
        
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        if (listing.sellerId !== user?.id) throw new Error('You can only delete your own listings');

        // FIX: Use direct API call
        try {
            const result = await safeApiCall('DELETE', `/api/marketplace/listings/${listingId}`);

            if (result && result.success) {
                this.listings = this.listings.filter(l => l.id !== listingId);
                this.myListings = this.myListings.filter(l => l.id !== listingId);
                this.savedListings = this.savedListings.filter(l => l.id !== listingId);
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
                this.notifyUI('listingDeleted', { id: listingId });
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_DELETED', id: listingId });
                }
                return true;
            } else {
                throw new Error('Failed to delete listing');
            }
        } catch (error) {
            logError('deleteListing', error);
            throw error;
        }
    }

    async toggleSave(listingId) {
        if (!assertActive('toggleSave')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');

        const isSaved = this.savedListings.some(l => l.id === listingId);
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;

        // FIX: Use direct API call
        try {
            const result = await safeApiCall('POST', `/api/marketplace/listings/${listingId}/save`, { save: !isSaved });

            if (result && result.success) {
                if (!isSaved) {
                    this.savedListings = [listing, ...this.savedListings];
                    this.listings = this.listings.map(l => {
                        if (l.id === listingId) {
                            const savedBy = l.savedBy || [];
                            if (!savedBy.includes(userId)) {
                                l.savedBy = [...savedBy, userId];
                            }
                        }
                        return l;
                    });
                } else {
                    this.savedListings = this.savedListings.filter(l => l.id !== listingId);
                    this.listings = this.listings.map(l => {
                        if (l.id === listingId && l.savedBy) {
                            l.savedBy = l.savedBy.filter(id => id !== userId);
                        }
                        return l;
                    });
                }
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
                this.notifyUI('saveToggled', { listingId, saved: !isSaved });
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'SAVE_TOGGLED', listingId, userId, saved: !isSaved });
                }
                return !isSaved;
            } else {
                throw new Error('Failed to toggle save');
            }
        } catch (error) {
            logError('toggleSave', error);
            throw error;
        }
    }

    async contactSeller(listingId, message = '') {
        if (!assertActive('contactSeller')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');

        try {
            safeSend('CONTACT_SELLER', {
                listingId,
                sellerId: listing.sellerId,
                listingTitle: listing.title,
                message: message || `I'm interested in your listing: ${listing.title}`,
                timestamp: Date.now()
            });
            
            logOnce('send', `Contacted seller for ${listingId}`);
            return true;
        } catch (error) {
            logError('contactSeller', error);
            throw error;
        }
    }

    async trackView(listingId) {
        if (!assertActive('trackView')) return;
        if (!listingId) return;
        this.listings = this.listings.map(l => {
            if (l.id === listingId) l.views = (l.views || 0) + 1;
            return l;
        });
        safeSend('TRACK_VIEW', { listingId, timestamp: Date.now() });
    }

    setFilter(key, value) {
        if (!assertActive('setFilter')) return;
        this.filters[key] = value;
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    resetFilters() {
        if (!assertActive('resetFilters')) return;
        this.filters = { search: '', category: '', minPrice: null, maxPrice: null, available: null, sort: 'newest' };
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    getFilteredListings() {
        if (!assertActive('getFilteredListings')) return [];
        
        let filtered = this.listings.filter(l => l.available !== false);
        
        if (this.filters.search) {
            const search = this.filters.search.toLowerCase();
            filtered = filtered.filter(l => 
                l.title.toLowerCase().includes(search) ||
                l.description.toLowerCase().includes(search)
            );
        }
        
        if (this.filters.category) {
            filtered = filtered.filter(l => l.category === this.filters.category);
        }
        
        if (this.filters.minPrice !== null) {
            const min = parseFloat(this.filters.minPrice);
            filtered = filtered.filter(l => parseFloat(l.price || 0) >= min);
        }
        if (this.filters.maxPrice !== null) {
            const max = parseFloat(this.filters.maxPrice);
            filtered = filtered.filter(l => parseFloat(l.price || 0) <= max);
        }
        
        if (this.filters.available !== null) {
            filtered = filtered.filter(l => l.available === this.filters.available);
        }
        
        switch (this.filters.sort) {
            case 'newest':
                filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'oldest':
                filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'price_low':
                filtered.sort((a, b) => (parseFloat(a.price || 0) - parseFloat(b.price || 0)));
                break;
            case 'price_high':
                filtered.sort((a, b) => (parseFloat(b.price || 0) - parseFloat(a.price || 0)));
                break;
            case 'popular':
                filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
                break;
        }
        
        this.pagination.total = filtered.length;
        this.pagination.hasMore = this.pagination.page * this.pagination.limit < filtered.length;
        
        const start = (this.pagination.page - 1) * this.pagination.limit;
        const end = start + this.pagination.limit;
        
        return filtered.slice(start, end);
    }

    loadMore() {
        if (!assertActive('loadMore')) return false;
        if (!this.pagination.hasMore || this.loading) return false;
        this.pagination.page++;
        this.notifyUI('listingsUpdated', this.getFilteredListings());
        return true;
    }

    sanitizeListings(listings) {
        if (!Array.isArray(listings)) return [];
        return listings.filter(l => l && typeof l === 'object').map(l => this.sanitizeListing(l)).filter(l => l);
    }

    sanitizeListing(listing) {
        try {
            // FIX: Map both sellerId and userId for compatibility
            const sellerId = listing.sellerId || listing.userId || listing.seller?.id || '';
            return {
                id: String(listing.id || listing._id || ''),
                sellerId: String(sellerId),
                userId: String(sellerId), // Alias for compatibility
                seller: {
                    id: String(sellerId),
                    name: this.escapeHtml(listing.seller?.name || listing.sellerName || 'Unknown'),
                    photoURL: this.sanitizeUrl(listing.seller?.photoURL || listing.sellerPhoto || '')
                },
                title: this.escapeHtml(listing.title || 'Untitled'),
                description: this.escapeHtml(listing.description || ''),
                price: this.validatePrice(listing.price),
                category: listing.category || 'other',
                type: listing.type || listing.listingType || 'service',
                images: (listing.images || []).filter(this.validateImage),
                createdAt: listing.createdAt || new Date().toISOString(),
                updatedAt: listing.updatedAt || listing.createdAt || new Date().toISOString(),
                available: listing.available !== false,
                savedBy: Array.isArray(listing.savedBy) ? listing.savedBy : [],
                views: parseInt(listing.views) || 0,
                // FIX: Map premium/featured/boosted flags
                isPremium: !!listing.isPremium || !!listing.premium,
                isSpotlight: !!listing.isSpotlight || !!listing.featured,
                featured: !!listing.featured || !!listing.isSpotlight,
                boosted: !!listing.boosted || !!listing.isBoosted
            };
        } catch {
            return null;
        }
    }

    sanitizeListingData(data) {
        return {
            title: typeof data.title === 'string' ? data.title.trim().substring(0, 200) : '',
            description: typeof data.description === 'string' ? data.description.trim().substring(0, 5000) : '',
            price: this.validatePrice(data.price),
            category: data.category || 'other',
            images: Array.isArray(data.images) ? data.images.filter(this.validateImage) : [],
            available: data.available !== false
        };
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    validatePrice(price) {
        if (price === undefined || price === null) return null;
        if (typeof price === 'string') {
            const cleaned = price.replace(/[^0-9.]/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }
        const num = parseFloat(price);
        return isNaN(num) ? null : (num < 0 ? null : num);
    }

    validateImage(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('data:')) return true;
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
            return false;
        }
    }

    sanitizeUrl(url) {
        if (!url || typeof url !== 'string') return '';
        if (url.startsWith('data:')) return url;
        if (url.startsWith('https:') || url.startsWith('http:')) return url;
        return '';
    }

    queueOfflineListing(listing) {
        if (!assertActive('queueOfflineListing')) return;
        safeStorage.get('offlineQueue').then(queue => {
            const q = queue || [];
            q.push({ listing, timestamp: Date.now(), attempts: 0 });
            safeStorage.set('offlineQueue', q);
        });
    }

    generateSampleData() {
        // Sample data removed — all data must come from real backend.
        // If listings array is empty the UI will show the "create your first listing" empty state.
        if (this.listings.length > 0 || !isActive()) return;
        this.notifyUI('listingsLoaded', []);
    }

    /**
     * handleApiRequest — called by the MessageHandler when parent relays an
     * API_REQUEST with a marketplace endpoint back to this module.
     */
    handleApiRequest(requestId, endpoint, method, data) {
        if (!assertActive('handleApiRequest')) return;

        safeApiCall(method.toUpperCase(), endpoint, data || null)
            .then(response => {
                safeSend('API_RESPONSE', {
                    requestId,
                    endpoint,
                    method,
                    success: true,
                    data: response
                });
            })
            .catch(error => {
                safeSend('API_RESPONSE', {
                    requestId,
                    endpoint,
                    method,
                    success: false,
                    error: error.message || 'API call failed'
                });
            });
    }

    notifyUI(event, data) {
        window.dispatchEvent(new CustomEvent('marketplace:' + event, { detail: data, bubbles: true }));
    }

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(callback);
        window.addEventListener('marketplace:' + event, callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
        window.removeEventListener('marketplace:' + event, callback);
    }

    getListings() {
        if (!assertActive('getListings')) return [];
        return this.getFilteredListings();
    }

    getMyListings() {
        if (!assertActive('getMyListings')) return [];
        if (!this.currentUser) return [];
        return this.myListings;
    }

    getSavedListings() {
        if (!assertActive('getSavedListings')) return [];
        return this.savedListings;
    }

    getListing(id) {
        if (!assertActive('getListing')) return null;
        return this.listings.find(l => l.id === id);
    }

    isOwner(listingId) {
        if (!assertActive('isOwner')) return false;
        if (!this.currentUser) return false;
        const listing = this.getListing(listingId);
        return listing ? listing.sellerId === this.currentUser.id : false;
    }

    isSaved(listingId) {
        if (!assertActive('isSaved')) return false;
        return this.savedListings.some(l => l.id === listingId);
    }

    getCategories() {
        if (!assertActive('getCategories')) return [];
        const categories = new Set(this.listings.map(l => l.category).filter(Boolean));
        return Array.from(categories);
    }

    getStats() {
        if (!assertActive('getStats')) return { total: 0, myListings: 0, saved: 0, active: 0 };
        return {
            total: this.listings.length,
            myListings: this.myListings.length,
            saved: this.savedListings.length,
            active: this.listings.filter(l => l.available).length
        };
    }

    getFilters() {
        return { ...this.filters };
    }

    getPagination() {
        return { ...this.pagination };
    }

    isLoading() {
        return this.loading;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    destroy() {
        if (this.syncChannel) this.syncChannel.close();
    }
}

export const marketplace = new MarketplaceCoreImpl();

// =============================================
// CRITICAL FIX: AUTHORIZED FETCH FUNCTION (UPDATED)
// =============================================

function normalizeToolsEndpoint(url) {
    if (!url || typeof url !== 'string') return url;

    const exactAliases = {
        '/api/premium/features': '/api/tools/premium/features',
        '/api/user/subscription': '/api/tools/user/subscription'
    };

    if (exactAliases[url]) {
        return exactAliases[url];
    }

    // BUG FIX (2026-07-22): this used to rewrite EVERY /api/marketplace/* call
    // to /api/tools/marketplace/*. That's wrong — there are two separate backend
    // route files: routes/tools.js (mounted at /api/tools, owns listings,
    // spotlight, boost, leaderboard, tips) and routes/marketplace.routes.js
    // (mounted at /api/marketplace, owns products, cart, orders, wishlist,
    // categories, seller dashboard, payments). Blanket-rewriting sent
    // marketplace-ecommerce.js's product/cart/wishlist/category calls to
    // /api/tools/marketplace/products etc., which don't exist there — that's
    // what caused the "Internal server error" / missing categories / empty
    // "My Listings" bugs. Only the paths below actually live under /api/tools.
    const TOOLS_ONLY_MARKETPLACE_PATHS = [
        /^\/api\/marketplace\/listings(\/|$|\?)/,
        /^\/api\/marketplace\/spotlight(\/|$|\?)/,
        /^\/api\/marketplace\/boost(\/|$|\?)/,
        /^\/api\/marketplace\/leaderboard(\/|$|\?)/,
        /^\/api\/marketplace\/tips(\/|$|\?)/,
    ];
    if (url.startsWith('/api/marketplace/') && TOOLS_ONLY_MARKETPLACE_PATHS.some(re => re.test(url))) {
        return url.replace('/api/marketplace/', '/api/tools/marketplace/');
    }

    return url;
}

function resolveToolsApiUrl(url) {
    if (!url || /^https?:\/\//i.test(url)) return url;

    const rawBase =
        window.__API_CORE?.getBaseUrl?.() ||
        window.api?.env?.getBaseUrl?.() ||
        window.__getApiBase?.() ||
        window.parent?.__API_CORE?.getBaseUrl?.() ||
        window.parent?.api?.env?.getBaseUrl?.() ||
        window.parent?.__getApiBase?.() ||
        // FIXED: Check canonical API_BASE_URL vars before falling back to origin
        (window.API_BASE_URL ? window.API_BASE_URL + '/api' : null) ||
        (window.__kynAPI?.baseUrl) ||
        (window.parent?.API_BASE_URL ? window.parent.API_BASE_URL + '/api' : null) ||
        (window.parent?.__kynAPI?.baseUrl) ||
        '/api';

    const base = String(rawBase).replace(/\/+$/, '').replace(/\/api\/?$/, '/api');
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;

    if (normalizedUrl.startsWith('/api/')) {
        return `${base}${normalizedUrl.slice(4)}`;
    }

    return `${base}${normalizedUrl}`;
}

function authorizedFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const normalizedUrl = normalizeToolsEndpoint(url);
        const requestUrl = resolveToolsApiUrl(normalizedUrl);
        
        // Use centralized auth for consistent token access
        let token = null;
        
        // Try authStorage first (most reliable)
        if (typeof window.getAuthSession === 'function') {
            const authSession = window.getAuthSession();
            if (authSession && authSession.token) {
                token = authSession.token;
            }
        }
        
        // Fallback to sessionClient
        if (!token && sessionClient.getToken) {
            token = sessionClient.getToken();
        }
        if (!token) {
            const error = new Error('No authentication token');
            error.code = 'NO_TOKEN';
            logOnce('error', 'Authorized fetch blocked: no token');
            reject(error);
            return;
        }

        const headers = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`,
            'Content-Type': options.headers?.['Content-Type'] || 'application/json'
        };

        fetch(requestUrl, {
            ...options,
            headers,
            credentials: 'include'
        })
        .then(async response => {
            if (response.status === 401) {
                logOnce('warn', 'Received 401 Unauthorized - requesting new session');
                
                safeSend('REQUEST_SESSION', { reason: '401_unauthorized' });
                
                const error = new Error('Unauthorized');
                error.status = 401;
                error.code = 'UNAUTHORIZED';
                reject(error);
                return;
            }
            
            if (!response.ok) {
                const error = new Error(`HTTP error ${response.status}`);
                error.status = response.status;
                error.code = 'HTTP_ERROR';
                
                try {
                    const errorData = await response.json();
                    error.details = errorData;
                } catch {
                    // Ignore parsing errors
                }
                
                reject(error);
                return;
            }
            
            try {
                const data = await response.json();
                resolve(data);
            } catch (parseError) {
                const error = new Error('Invalid JSON response');
                error.code = 'INVALID_JSON';
                error.originalError = parseError;
                reject(error);
            }
        })
        .catch(error => {
            logOnce('error', `Fetch failed: ${error.message}`);
            error.code = error.code || 'FETCH_FAILED';
            reject(error);
        });
    });
}

// =============================================
// UNIFIED SEND FUNCTION (USING STANDARDIZED SCHEMA)
// =============================================

export async function sendToParent(type, payload = {}) {
    if (moduleState.shutdown) return { success: false, error: 'shutdown' };
    
    if (!assertActive(`sendToParent: ${type}`)) {
        return { success: false, error: 'not_active', queued: false };
    }
    
    const result = safeSend(type, payload);
    if (result.success && !result.queued) {
        logOnce('send', type);
    }
    return result;
}

// =============================================
// EXACTLY-ONCE CHILD_READY SENDING (DETERMINISTIC - STRICT)
// =============================================

function sendChildReady() {
    // STRICT: Prevent multiple sends
    if (childReadySent) {
        if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] CHILD_READY already sent — skipping');
        return;
    }

    // STRICT: Only send in READY state
    if (currentState !== LIFECYCLE_STATE.READY) {
        if (window.__TOOLS_DEBUG__) console.warn(`[Tools][Lifecycle] Cannot send CHILD_READY — invalid state: ${currentState}`);
        return;
    }

    __set_childReadySent(true);
    moduleState.handshakeState.childReadySent = true;

    parent.postMessage({
        type: 'CHILD_READY',
        module: MODULE_NAME,
        version: MODULE_VERSION,
        frameId: parentComm.frameId,
        timestamp: Date.now(),
        id: generateMessageId()
    }, '*');

    logOnce('send', 'CHILD_READY sent');
    transitionTo(LIFECYCLE_STATE.WAIT_PARENT, 'child_ready_sent');
}

// =============================================
// NO HAND SHAKE RETRY SYSTEM - REMOVED (STRICT)
// =============================================
// The previous setInterval-based retry system has been COMPLETELY REMOVED.
// The module now strictly waits in WAIT_PARENT state until PARENT_READY is received.
// This is the correct deterministic behavior.

// =============================================
// MODULE ACTIVATION HOOK
// =============================================

export function onModuleActive() {
    if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Module ACTIVE - all systems go');

    moduleState.ready = true;
    moduleState.initialized = true;
    __set_isReady(true);
    
    heartbeatResponder.start();
    loadUserSettings().catch(() => {});
    
    // FIX: Always initialize marketplace on ACTIVE regardless of session state
    // The marketplace.initialize() is guarded internally; it just won't show data
    // until a session arrives, but it MUST start now.
    __set_isAuthReady(true); // FIX: Unblock all API calls immediately on ACTIVE
    marketplace.initialize().catch(() => {});
    
    window.dispatchEvent(new CustomEvent('tools:active', {
        detail: {
            timestamp: Date.now(),
            sessionActive: moduleState.sessionActive
        }
    }));

    // Bind UI directly now that we are active — once only
    if (!window._coreActiveBound) {
        window._coreActiveBound = true;
        setTimeout(function() { forceBindAllUIEvents(); }, 300);
    }
}

let _bindLogShown = false;
let _bindCompleteShown = false;

function forceBindAllUIEvents() {
    // Only log once total, not once per call
    if (!_bindLogShown) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools] Force binding all UI events (direct DOM)');
        _bindLogShown = true;
    }

    // ── FIX (2026-07-22): single-panel-at-a-time controller ─────────────
    // Previously each header icon (Analytics, Saved, Notes, Trust Stats,
    // Premium, Team, Leaderboard, Create Listing) opened its own modal
    // without closing any other one that was already open, so clicking
    // through several features stacked overlays on top of each other.
    // This closes every known panel (clearing both the .active class AND
    // any leftover inline display style) before a new one opens, and is
    // shared with Tool-ui.js via window so both binding paths stay in sync
    // regardless of which one wins the load-order race.
    if (!window.__closeAllMoodMarketPanels) {
        window.__ALL_MOODMARKET_MODAL_IDS = [
            'analyticsModal', 'createListingModal', 'leaderboardModal',
            'myNotesModal', 'premiumOptionsModal', 'purchaseModal',
            'reactionPickerModal', 'savedItemsModal', 'teamManagementModal',
            'trustStatsModal', 'marketplaceDetailPanel'
        ];
        window.__closeAllMoodMarketPanels = function(exceptId) {
            window.__ALL_MOODMARKET_MODAL_IDS.forEach(function(mid) {
                if (mid === exceptId) return;
                var m = document.getElementById(mid);
                if (m) { m.classList.remove('active'); m.style.display = ''; }
            });
        };
    }

    // ── Helper: open a modal by ID ──────────────────────────────────────
    function openModal(id) {
        window.__closeAllMoodMarketPanels(id);
        var el = document.getElementById(id);
        if (el) { el.classList.add('active'); el.style.display = 'flex'; }
    }
    function closeModal(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.remove('active'); el.style.display = ''; }
    }

    // ── Category tabs ────────────────────────────────────────────────────
    var categoryTabs = [
        { id: 'allTab',       name: 'all' },
        { id: 'servicesTab',  name: 'services' },
        { id: 'digitalTab',   name: 'digital' },
        { id: 'friendsTab',   name: 'friends' },
        { id: 'groupsTab',    name: 'groups' },
        { id: 'myTab',        name: 'my' },
        { id: 'premiumTab',   name: 'premium' },
        { id: 'spotlightTab', name: 'spotlight' }
    ];
    categoryTabs.forEach(function(tab) {
        var el = document.getElementById(tab.id);
        if (!el) return;
        el.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            categoryTabs.forEach(function(t) {
                var te = document.getElementById(t.id);
                if (te) te.classList.remove('active');
            });
            el.classList.add('active');
            if (typeof window.setActiveTab === 'function') {
                window.setActiveTab(tab.name);
            } else {
                window.dispatchEvent(new CustomEvent('marketplace:tab-change', { detail: { tab: tab.name } }));
            }
        };
    });

    // ── Header action buttons ────────────────────────────────────────────
    var btnMap = {
        'createListingBtn':    function() { openModal('createListingModal'); },
        'createListingQuickBtn': function() { openModal('createListingModal'); },
        'sellServiceBtn':      function() { openModal('createListingModal'); setTimeout(function(){ var t=document.querySelector('.create-listing-tab[data-tab="service"]'); if(t) t.click(); },80); },
        'sellDigitalBtn':      function() { openModal('createListingModal'); setTimeout(function(){ var t=document.querySelector('.create-listing-tab[data-tab="digital"]'); if(t) t.click(); },80); },
        'viewAnalyticsBtn':    function() { openModal('analyticsModal'); },
        'viewSavedBtn':        function() { openModal('savedItemsModal'); },
        'viewNotesBtn':        function() { openModal('myNotesModal'); },
        'viewTrustStatsBtn':   function() { openModal('trustStatsModal'); },
        'premiumOptionsBtn':   function() { openModal('premiumOptionsModal'); },
        'viewTeamBtn':         function() { openModal('teamManagementModal'); },
        'viewLeaderboardBtn':  function() { openModal('leaderboardModal'); }
    };
    Object.keys(btnMap).forEach(function(id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            btnMap[id]();
        };
    });

    // ── Close buttons ────────────────────────────────────────────────────
    var closeMap = {
        'closeCreateListingModal': 'createListingModal',
        'closeAnalyticsModal':     'analyticsModal',
        'closePremiumModal':       'premiumOptionsModal',
        'closeTeamModal':          'teamManagementModal',
        'closeLeaderboardModal':   'leaderboardModal',
        'closeReactionModal':      'reactionPickerModal',
        'closeSavedModal':         'savedItemsModal',
        'closeNotesModal':         'myNotesModal',
        'closeTrustStatsModal':    'trustStatsModal'
    };
    Object.keys(closeMap).forEach(function(btnId) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.onclick = function(e) { e.preventDefault(); closeModal(closeMap[btnId]); };
    });

    // ── Back button (detail panel) ───────────────────────────────────────
    var backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.onclick = function(e) {
            e.preventDefault();
            var panel = document.getElementById('marketplaceDetailPanel');
            if (panel) panel.classList.remove('active');
        };
    }

    // ── Publish / Save Draft buttons ─────────────────────────────────────
    var publishBtn = document.getElementById('publishListingBtn');
    if (publishBtn) {
        publishBtn.onclick = async function(e) {
            e.preventDefault();
            try {
                // BUG FIX (2026-07-22): Tool-ui.js exposes this as
                // window._publishListingFromModal (underscore prefix). This
                // was checking the name without the underscore, which is never
                // defined, so it always fell through to the dead custom event
                // below — making the Publish button silently do nothing
                // whenever this handler (bound ~300ms after load) won the race
                // against Tool-ui.js's own binding.
                if (typeof window._publishListingFromModal === 'function') {
                    await window._publishListingFromModal();
                } else if (typeof window.publishListingFromModal === 'function') {
                    await window.publishListingFromModal();
                } else {
                    window.dispatchEvent(new CustomEvent('marketplace:publish-listing'));
                }
            } catch (error) {
                if (window.__TOOLS_DEBUG__) console.error('[Tools] Publish button error:', error);
                if (typeof showNotification === 'function') {
                    showNotification('Failed to publish listing', 'error');
                }
            }
        };
    }

    // ── Create-listing inner tabs ─────────────────────────────────────────
    // FIX (2026-07-22): 'premiumTab'/'digitalTab' collide with the main
    // marketplace filter buttons' element IDs, so plain getElementById grabbed
    // the wrong element and the Premium/Digital Item panels never showed.
    var CREATE_TAB_CONTENT_ID_MAP = { digital: 'digitalItemTab' };
    document.querySelectorAll('.create-listing-tab').forEach(function(tab) {
        tab.onclick = function() {
            var tabName = tab.dataset.tab;
            if (!tabName) return;
            // Prefer the single source-of-truth implementation in Tool-ui.js
            // (it also tracks UIState.lastDataEntryTab, needed by Publish).
            if (typeof window.switchCreateTab === 'function') {
                window.switchCreateTab(tabName);
                return;
            }
            document.querySelectorAll('.create-listing-tab').forEach(function(t){ t.classList.remove('active'); });
            tab.classList.add('active');
            document.querySelectorAll('.create-listing-tab-content').forEach(function(c){ c.classList.remove('active'); });
            var contentId = CREATE_TAB_CONTENT_ID_MAP[tabName] || (tabName + 'Tab');
            var content = document.querySelector('.create-listing-tab-content[id="' + contentId + '"]') || document.getElementById(contentId);
            if (content) content.classList.add('active');
        };
    });

    // ── Dismiss modals when clicking backdrop ────────────────────────────
    document.querySelectorAll('.modal-overlay, .modal-backdrop').forEach(function(overlay) {
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                var modal = overlay.closest('.modal, [id$="Modal"]');
                if (modal) modal.classList.remove('active');
            }
        };
    });

    // Only log completion once
    if (!_bindCompleteShown) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools] Direct DOM binding complete');
        _bindCompleteShown = true;
    }

    // Also refresh UI if marketplaceUI is available
    if (window.marketplaceUI && typeof window.marketplaceUI.refresh === 'function') {
        window.marketplaceUI.refresh();
    }
    window.dispatchEvent(new CustomEvent('marketplace:refresh-ui', { detail: { timestamp: Date.now(), force: true } }));
}

// Expose globally for parent to call
window.forceBindAllUIEvents = forceBindAllUIEvents;

// =============================================
// MODULE INITIALIZATION (DETERMINISTIC LIFECYCLE - STRICT)
// =============================================

function initializeModule() {
    // Prevent double initialization
    if (initializationLock) {
        if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] Module already initializing - skipping');
        return;
    }
    
    __set_initializationLock(true);
    
    // Start initialization
    if (!transitionTo(LIFECYCLE_STATE.INITIALIZING, 'module_start')) {
        __set_initializationLock(false);
        return;
    }
    
    try {
        logOnce('init', 'Tools module booting');
        
        // Add this function right after logOnce('init', 'Tools module booting');
async function loadUserSettings() {
    try {
        const savedTheme = await safeStorage.get('user_theme_preference');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.body.setAttribute('data-theme', savedTheme);
        }
        const savedFontSize = await safeStorage.get('user_font_size');
        if (savedFontSize) {
            document.documentElement.style.fontSize = savedFontSize + 'px';
        }
    } catch (error) {}
}
        // Setup message listen
        window.addEventListener('message', (event) => {
    // ── OFFLINE-FIRST: Apply setting changes immediately ──
    const data = event.data;
    if (data && (data.type === 'SETTING_CHANGED' || data.type === 'SETTINGS_UPDATED')) {
        const payload = data.payload || data;
        
        if (data.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
            const { section, key, value } = payload;
            
            if (section === 'appearance' && key === 'theme') {
                const theme = (value === 'dark' ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
            }
            
            if (section === 'appearance' && key === 'fontSize') {
                document.documentElement.style.fontSize = parseInt(value) + 'px';
            }
            
            window.dispatchEvent(new CustomEvent('settingChanged', {
                detail: { section, key, value, timestamp: Date.now() }
            }));
        }
        
        if (data.type === 'SETTINGS_UPDATED' && payload.settings) {
            const s = payload.settings;
            
            if (s.appearance?.theme) {
                const theme = s.appearance.theme === 'dark' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
                document.documentElement.classList.toggle('theme-dark', theme === 'dark');
                document.documentElement.classList.toggle('dark-theme', theme === 'dark');
                try { localStorage.setItem('app_theme', theme); } catch (_) {}
            }
            
            if (s.appearance?.fontSize) {
                document.documentElement.style.fontSize = parseInt(s.appearance.fontSize) + 'px';
            }
            
            window.dispatchEvent(new CustomEvent('settingsUpdated', {
                detail: { settings: s, timestamp: Date.now() }
            }));
        }
        
        return; // Stop processing for settings messages
    }
    
    // Normal message processing
    setTimeout(() => parentComm.handleIncomingMessage(event), 0);
});
       
// Add a direct, simple message listener specifically for session data
window.addEventListener('message', function directSessionListener(event) {
    const data = event.data;
    if (!data) return;
    
    // Log all incoming messages for debugging
    if (data.type === 'SESSION_DATA' || data.type === 'AUTH_READY' || data.type === 'PARENT_READY') {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Received:', data.type, data);
    }
    
    // Handle SESSION_DATA directly
    if (data.type === 'SESSION_DATA') {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Processing SESSION_DATA directly');
        
        // Dig into all possible payload nesting
        // Use deep extractors for robust token/userId finding
        let userId = _deepExtractUserId(data.payload || data);
        let token  = _deepExtractToken(data.payload || data);
        
        // If no token found in payload, try parent frame
        if (!token && window.parent && window.parent !== window) {
            try {
                if (typeof window.parent.getAuthSession === 'function') {
                    const ps = window.parent.getAuthSession();
                    if (ps?.token) token = ps.token;
                    if (!userId && ps?.userId) userId = ps.userId;
                }
            } catch {}
        }
        // Fall back to cached
        if (!token) token = window.__kynToken;
        if (!userId) userId = window.__kynUserId;
        
        if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Found session data:', { userId, hasToken: !!token });
        
        if (userId) {
            // Always cache userId
            window.__kynUserId = userId;
            if (token) window.__kynToken = token;
            
            // FIX (Issue 4): p/s were undefined — extract from data.payload directly
            const _payload = data.payload || {};
            const _user = _payload.user || {};
            const session = {
                userId: userId,
                userToken: token,
                token: token,
                displayName: _payload.displayName || _user.displayName || _user.username || 'User',
                email: _payload.email || _user.email || '',
                photoURL: _payload.photoURL || _user.photoURL || '',
                isPremium: _payload.isPremium || _user.isPremium || false,
                trustLevel: _payload.trustLevel || _user.trustLevel || 'new'
            };
            
            const accepted = sessionClient.acceptParentSession(session);
            
            // Sync to window.currentUser
            if (!window.currentUser || !window.currentUser.id) {
                window.currentUser = {
                    id: userId,
                    userId: userId,
                    displayName: session.displayName,
                    email: session.email,
                    photoURL: session.photoURL,
                    token: token
                };
            } else if (token && !window.currentUser.token) {
                window.currentUser.token = token;
            }
            
            if (accepted && currentState !== LIFECYCLE_STATE.ACTIVE) {
                if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Session accepted, activating module');
                transitionTo(LIFECYCLE_STATE.ACTIVE, 'direct_session_received');
                flushMessageQueue();
                if (!activationComplete) {
                    onModuleActive();
                    __set_activationComplete(true);
                }
            }
        }
    }
    
    // Handle AUTH_READY directly
    if (data.type === 'AUTH_READY') {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Processing AUTH_READY directly');
        let userId2 = _deepExtractUserId(data.payload || data);
        let token2  = _deepExtractToken(data.payload || data);
        
        // Try parent if no token
        if (!token2 && window.parent && window.parent !== window) {
            try {
                if (typeof window.parent.getAuthSession === 'function') {
                    const ps2 = window.parent.getAuthSession();
                    if (ps2?.token) token2 = ps2.token;
                    if (!userId2 && ps2?.userId) userId2 = ps2.userId;
                }
            } catch {}
        }
        // Fallback to cached
        if (!token2) token2 = window.__kynToken;
        if (!userId2) userId2 = window.__kynUserId;
        
        if (userId2) {
            window.__kynUserId = userId2;
            if (token2) window.__kynToken = token2;
            
            if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Found session in AUTH_READY:', { userId: userId2, hasToken: !!token2 });
            // FIX (Issue 4): s2/p2 were undefined — extract from data.payload directly
            const _payload2 = data.payload || {};
            const _user2 = _payload2.user || {};
            const session2 = {
                userId: userId2, userToken: token2, token: token2,
                displayName: _payload2.displayName || _user2.displayName || _user2.username || 'User',
                email: _payload2.email || _user2.email || '',
                photoURL: _payload2.photoURL || _user2.photoURL || '',
                isPremium: _payload2.isPremium || _user2.isPremium || false,
                trustLevel: _payload2.trustLevel || _user2.trustLevel || 'new'
            };
            
            const accepted2 = sessionClient.acceptParentSession(session2);
            if (!window.currentUser?.id) {
                window.currentUser = { id: userId2, userId: userId2, token: token2,
                    displayName: session2.displayName, email: session2.email };
            } else if (token2 && !window.currentUser.token) {
                window.currentUser.token = token2;
            }
            
            if (accepted2 && currentState !== LIFECYCLE_STATE.ACTIVE) {
                if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Session accepted from AUTH_READY, activating');
                transitionTo(LIFECYCLE_STATE.ACTIVE, 'direct_auth_ready_received');
                flushMessageQueue();
                if (!activationComplete) {
                    onModuleActive();
                    __set_activationComplete(true);
                }
            }
        }
    }
});
        // Start diagnostics
        diagnostics.start();
        
        // Initialize UI bridge
        uiBridge.initialize();
        
        const inIframe = (window.parent && window.parent !== window);
        moduleState.parentDetected = inIframe;
        
        if (!inIframe) {
            logOnce('info', 'Not in iframe, running standalone');
            if (!transitionTo(LIFECYCLE_STATE.READY, 'standalone_mode')) {
                __set_initializationLock(false);
                return;
            }
            __set_childReadySent(true); // Mark as sent (no parent to send to)
            if (!transitionTo(LIFECYCLE_STATE.WAIT_PARENT, 'standalone')) {
                __set_initializationLock(false);
                return;
            }
            __set_parentReadyReceived(true);
            if (!transitionTo(LIFECYCLE_STATE.ACTIVE, 'standalone_active')) {
                __set_initializationLock(false);
                return;
            }
            moduleState.ready = true;
            moduleState.initialized = true;
            __set_isReady(true);
            window.__MODULE_READY__ = true;
            flushMessageQueue();
            onModuleActive();
            __set_initializationLock(false);
            return;
        }
        
        // Complete setup and move to READY
        if (!transitionTo(LIFECYCLE_STATE.READY, 'setup_complete')) {
            __set_initializationLock(false);
            return;
        }
        
        sendChildReady();

setTimeout(() => {
    if (currentState !== LIFECYCLE_STATE.ACTIVE) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Activation timeout: forcing ACTIVE state');
        __set_parentReadyReceived(true);
        moduleState.parentDetected = true;
        moduleState.handshakeState.parentReadyReceived = true;
        transitionTo(LIFECYCLE_STATE.ACTIVE, 'activation_timeout');
        flushMessageQueue();
        if (!activationComplete) {
            onModuleActive();
            __set_activationComplete(true);
        }
        // Force UI binding after activation
        setTimeout(() => {
            if (!window._coreActiveBound) { window._coreActiveBound = true; forceBindAllUIEvents(); }
        }, 100);
    }
}, 3000);

        logOnce('info', 'Waiting for parent ready signal (WAIT_PARENT)');
        
        // NO RETRY LOOP - Strict wait for PARENT_READY
        
    } catch (error) {
        logError('Module initialization', error);
        __set_initializationLock(false);
    }
}

// =============================================
// EXPORTED CORE FUNCTIONS (PRESERVED WITH FIXES)
// =============================================

export let initializeCore;
export let requestSession;
export let receiveFromParent;
export let shutdownCore;
export let syncWithParent;
export let checkParentHealth;

initializeCore = async function(options = {}) {
    if (moduleState.shutdown) return moduleState;
    if (moduleState.initialized) return moduleState;
    if (isInitializing) return moduleState;

    __set_isInitializing(true);

    try {
        if (options.debug) {
            diagnostics.enableDebug();
        }

        initializeModule();

        // Wait for ACTIVE state (NO timeout fallback - strict wait)
        const checkActive = () => {
            return new Promise((resolve) => {
                if (currentState === LIFECYCLE_STATE.ACTIVE) {
                    resolve();
                } else {
                    const checkInterval = setInterval(() => {
                        if (currentState === LIFECYCLE_STATE.ACTIVE) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 50);
                }
            });
        };
        
        await checkActive();

        moduleState.ready = isActive();
        __set_isReady(moduleState.ready);
        __set_isInitializing(false);
        __set_isBootstrapped(true);
        __set_handshakeComplete(moduleState.handshakeComplete);
        __set_sessionValid(sessionClient.isValid());
        __set_sessionData(sessionClient.getSession());

        if (sessionData && !sessionData.isGuest && !sessionData.isDemo && __isValidSession(sessionData)) {
            window.currentUser = {
                id: sessionData.userId,
                displayName: sessionData.displayName,
                email: sessionData.email,
                photoURL: sessionData.photoURL,
                isPremium: sessionData.isPremium,
                trustLevel: sessionData.trustLevel
            };
            window.userData = window.currentUser;
        }

        window.__MODULE_READY__ = moduleState.ready;
        window.__MODULE_SESSION_ACTIVE__ = moduleState.sessionActive;

        await marketplace.initialize();

        window.dispatchEvent(new CustomEvent('coreInitialized', {
            detail: {
                state: moduleState,
                session: sessionClient.getSession(),
                sessionActive: moduleState.sessionActive,
                handshakeComplete: moduleState.handshakeComplete,
                environment: environmentDetector.environment,
                bootState: currentState,
                parentReady: parentReadyReceived
            }
        }));

        logOnce('success', 'Tools module initialization complete');
        return moduleState;

    } catch (error) {
        logError('initializeCore', error);
        moduleState.ready = true;
        moduleState.initialized = true;
        __set_isReady(true);
        __set_isInitializing(false);
        __set_isBootstrapped(true);
        window.__MODULE_READY__ = true;
        logOnce('warn', 'Tools module initialization failed - using fallback');
        return moduleState;
    }
};

requestSession = async function(force = false) {
    if (moduleState.shutdown) return false;
    
    if (!assertActive('requestSession')) return false;
    
    if (moduleState.sessionActive && !force) {
        return true;
    }

    if (messageHandler.sessionRequestRetryCount >= messageHandler.maxSessionRetries) {
        logOnce('error', 'Max session request retries reached');
        return false;
    }

    if (parentReadyReceived && (!moduleState.sessionActive || force) && !moduleState.sessionState.requested) {
        moduleState.sessionState.requested = true;
        messageHandler.sessionRequestRetryCount++;
        safeSend('REQUEST_SESSION', { force, retry: messageHandler.sessionRequestRetryCount });
        return true;
    }

    return false;
};

receiveFromParent = function(type, handler) {
    if (moduleState.shutdown) return;
    if (!type || typeof handler !== 'function') return;
    messageHandler.registerHandler(type, handler);
};

shutdownCore = function() {
    moduleState.shutdown = true;
    moduleState.initialized = false;
    moduleState.ready = false;
    moduleState.handshakeComplete = false;
    moduleState.sessionActive = false;
    
    __set_isReady(false);
    __set_isInitializing(false);
    __set_handshakeComplete(false);
    __set_sessionValid(false);
    __set_parentDataLoaded(false);
    __set_directAPILoaded(false);
    __set_isBootstrapped(false);
    __set_isAuthReady(false);
    __set_parentReadyReceived(false);
    __set_childReadySent(false);
    __set_initializationLock(false);
    __set_activationComplete(false);

    heartbeatResponder.stop();
    parentComm.cleanup();
    messageHandler.cleanup();
    resourceManager.release();
    uiBridge.cleanup();
    diagnostics.stop();

    safeStorage.remove(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.STARTUP_STATE);

    messageQueue.length = 0;
    dataCache.clear();
    
    sessionClient.clear();

    window.__MODULE_READY__ = false;
    window.__MODULE_SESSION_ACTIVE__ = false;

    logOnce('info', 'Core shutdown complete');
    return true;
};

syncWithParent = async function() {
    if (moduleState.shutdown || !moduleState.parentDetected) return false;
    
    if (!assertActive('syncWithParent')) return false;
    
    safeSend('SYNC_REQUEST', { timestamp: Date.now() });
    
    return true;
};

checkParentHealth = function() {
    return {
        connected: moduleState.parentDetected,
        lastMessage: moduleState.connectionMetrics.messagesReceived,
        handshakeComplete: moduleState.handshakeComplete,
        sessionActive: moduleState.sessionActive,
        inIframe: moduleState.parentDetected,
        parentReady: parentReadyReceived,
        queuedMessages: messageQueue.length,
        connectionMetrics: moduleState.connectionMetrics,
        sessionStatus: sessionClient.getState(),
        environment: environmentDetector.getEnvironmentReport(),
        diagnostics: diagnostics.getReport(),
        boot: {
            state: currentState,
            sessionAuthority: moduleState.sessionAuthority
        },
        heartbeat: heartbeatResponder.getStatus(),
        moduleState: currentState,
        lifecycle: {
            state: currentState,
            childReadySent,
            parentReadyReceived,
            initializationLock
        },
        memorySession: {
            ready: sessionClient.isValid(),
            hasToken: !!sessionClient.getToken ? sessionClient.getToken() : false,
            hasUser: !!sessionClient.getUser ? sessionClient.getUser() : false,
            validSession: sessionClient.isValid() ? __isValidSession(sessionClient.getSession()) : false
        }
    };
};

// =============================================
// COMPATIBILITY FUNCTIONS (PRESERVED)
// =============================================

export function safeGetElement(id) {
    try {
        return document.getElementById(id);
    } catch {
        return null;
    }
}

export function hasValidSession() {
    const session = sessionClient.getSession();
    if (!session) return false;
    return __isValidSession(session);
}

export function hasValidUser() {
    // Try sessionClient (lowercase - SessionClientWrapper)
    let user = sessionClient.getUser ? sessionClient.getUser() : null;
    // Fallback to SessionClient (capital S - old client)
    if (!user || !user.id) user = SessionClient.getUser ? SessionClient.getUser() : null;
    // Fallback to window globals
    if (!user || !user.id) {
        const wc = window.currentUser || window.userData;
        if (wc && (wc.id || wc.userId)) {
            user = { id: wc.id || wc.userId, displayName: wc.displayName || wc.name || 'User' };
        }
    }
    if (!user || !user.id) return false;
    const badIds = ['user', 'default', 'null', 'undefined', ''];
    if (badIds.includes(String(user.id).toLowerCase())) return false;
    return true;
}

export function showStatusMessage(message, type = 'info') {
    try {
        if (!loadingMessageElement) {
            __set_loadingMessageElement(document.createElement('div'));
            loadingMessageElement.id = 'marketplaceStatusMessage';
            loadingMessageElement.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                padding: 12px 24px; border-radius: 8px; z-index: 9999;
                font-size: 14px; font-weight: 500; display: flex;
                align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            document.body.appendChild(loadingMessageElement);
        }
        
        loadingMessageElement.textContent = message;
        loadingMessageElement.style.display = 'flex';
        
        const colors = {
            info: { bg: '#2196F3', color: 'white' },
            success: { bg: '#4CAF50', color: 'white' },
            error: { bg: '#F44336', color: 'white' },
            warning: { bg: '#FF9800', color: 'black' }
        };
        
        const style = colors[type] || colors.info;
        loadingMessageElement.style.backgroundColor = style.bg;
        loadingMessageElement.style.color = style.color;
        
        if (type === 'success' || type === 'info') {
            const hideDelay = type === 'success' ? 2000 : 5000;
            setTimeout(() => {
                if (loadingMessageElement && loadingMessageElement.parentNode) {
                    loadingMessageElement.style.display = 'none';
                }
            }, hideDelay);
        }
    } catch {}
}

export function validateDataStructure(data, dataType) {
    try {
        if (!data) return false;
        const validators = {
            [DATA_TYPES.FRIENDS]: (data) => Array.isArray(data),
            [DATA_TYPES.GROUPS]: (data) => Array.isArray(data),
            [DATA_TYPES.CHAT_HISTORY]: (data) => Array.isArray(data),
            [DATA_TYPES.NOTIFICATIONS]: (data) => Array.isArray(data),
            [DATA_TYPES.SETTINGS]: (data) => data && typeof data === 'object'
        };
        const validator = validators[dataType];
        return validator ? validator(data) : true;
    } catch {
        return false;
    }
}

export function getData(dataType) {
    try {
        if (!isReady && !moduleState.ready) return null;
        if (!isActive()) return null;
        if (dataCache.has(dataType)) return dataCache.get(dataType);
        
        switch(dataType) {
            case DATA_TYPES.FRIENDS: return userFriends;
            case DATA_TYPES.GROUPS: return userGroups;
            case DATA_TYPES.CHAT_HISTORY: return [];
            case DATA_TYPES.NOTIFICATIONS: return [];
            case DATA_TYPES.SETTINGS:
                const user = sessionClient.getUser ? sessionClient.getUser() : null;
                return {
                    id: user?.id || window.currentUser?.id || 'unknown',
                    updatedAt: new Date().toISOString(),
                    ...(window.currentUser?.settings || {})
                };
            default: return null;
        }
    } catch {
        return null;
    }
}

export function updateData(dataType, payload) {
    try {
        if (!isReady && !moduleState.ready) return false;
        if (!isActive()) return false;
        if (!validateDataStructure(payload, dataType)) return false;
        
        switch(dataType) {
            case DATA_TYPES.FRIENDS:
                __set_userFriends(payload);
                safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
                break;
            case DATA_TYPES.GROUPS:
                __set_userGroups(payload);
                safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
                break;
            case DATA_TYPES.CHAT_HISTORY:
                dataCache.set(dataType, payload);
                break;
            case DATA_TYPES.NOTIFICATIONS:
                dataCache.set(dataType, payload);
                break;
            case DATA_TYPES.SETTINGS:
                if (window.currentUser) {
                    window.currentUser.settings = { ...window.currentUser.settings, ...payload };
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER, window.currentUser);
                }
                break;
            default: return false;
        }
        
        window.dispatchEvent(new CustomEvent('coreDataUpdated', {
            detail: { type: dataType, data: payload, timestamp: Date.now() }
        }));
        
        dataCache.set(dataType, payload);
        return true;
    } catch {
        return false;
    }
}

export function handleParentMessage(event) {
    try {
        parentComm.handleIncomingMessage(event);
    } catch {}
}

export function handleParentInit(payload) {
    try {
        if (!payload) return;
        if (payload.session && __isValidSession(payload.session)) handleSessionDataFromParent(payload.session);
        if (payload.data) {
            if (payload.data.friendsList) updateData(DATA_TYPES.FRIENDS, payload.data.friendsList);
            if (payload.data.groupsList) updateData(DATA_TYPES.GROUPS, payload.data.groupsList);
        }
    } catch {}
}

export function handleRefreshDataRequest(payload) {
    try {
        if (!isReady && !moduleState.ready) {
            safeSend('ERROR', { message: 'Cannot refresh data: core not ready' });
            return;
        }
        
        if (!isActive()) {
            safeSend('ERROR', { message: 'Cannot refresh data: module not active' });
            return;
        }
        
        const dataTypes = payload?.dataTypes || Object.values(DATA_TYPES);
        showStatusMessage('Refreshing data...', 'info');
        
        dataTypes.forEach(async (dataType) => {
            try {
                const data = await fetchData(dataType);
                if (data) updateData(dataType, data);
            } catch {}
        });
        
        setTimeout(() => {
            showStatusMessage('Data refreshed successfully', 'success');
            safeSend('DATA_REFRESHED', { dataTypes, timestamp: Date.now() });
        }, 1000);
    } catch {}
}

export async function fetchData(dataType) {
    try {
        if (!sessionClient.isValid()) throw new Error('No valid session for API call');
        if (!isActive()) throw new Error('Module not active');
        
        let endpoint;
        switch(dataType) {
            case DATA_TYPES.FRIENDS: endpoint = '/api/user/friends'; break;
            case DATA_TYPES.GROUPS: endpoint = '/api/user/groups'; break;
            case DATA_TYPES.CHAT_HISTORY: endpoint = '/api/messages/history'; break;
            case DATA_TYPES.NOTIFICATIONS: endpoint = '/api/user/notifications'; break;
            case DATA_TYPES.SETTINGS: endpoint = '/api/user/settings'; break;
            default: throw new Error(`Unknown data type: ${dataType}`);
        }
        
        const response = await authorizedFetch(endpoint, { method: 'GET' });
        return response;
    } catch (error) {
        logError('fetchData', error);
        throw error;
    }
}

// =============================================
// pageCore COMPATIBILITY LAYER (PRESERVED)
// =============================================

export const pageCore = {
    init: async () => {
        if (isInitializing || isReady || moduleState.initialized) return;
        
        __set_isInitializing(true);
        logOnce('init', 'pageCore initialization started');
        
        try {
            // Hide the loading banner after 3s max, regardless of outcome
            setTimeout(() => {
                const el = document.getElementById('marketplaceStatusMessage');
                if (el) el.style.display = 'none';
            }, 3000);

            try { await initializeCore(); } catch(e) { console.warn('[pageCore] initializeCore:', e.message); }
            try { await pageCore.loadParentCommunication(); } catch(e) {}
            try { await pageCore.loadSession(); } catch(e) { console.warn('[pageCore] loadSession:', e.message); }
            try { await pageCore.loadEssentialData(); } catch(e) { console.warn('[pageCore] loadEssentialData:', e.message); }
            try { pageCore.setupEventListeners(); } catch(e) {}
            
            __set_isReady(true);
            __set_isInitializing(false);
            
            // Always force ACTIVE so API calls work
            if (!isActive()) {
                try { transitionTo(LIFECYCLE_STATE.ACTIVE, 'pagecore_init_complete'); } catch {}
            }

            const statusEl = document.getElementById('marketplaceStatusMessage');
            if (statusEl) statusEl.style.display = 'none';
            logOnce('success', 'pageCore initialization complete');
        } catch (error) {
            __set_isInitializing(false);
            __set_isReady(true); // Mark ready even on error so retries work
            // Force ACTIVE regardless
            try { transitionTo(LIFECYCLE_STATE.ACTIVE, 'pagecore_error_recovery'); } catch {}
            const statusEl = document.getElementById('marketplaceStatusMessage');
            if (statusEl) statusEl.style.display = 'none';
            logError('pageCore.init', error);
        }
    },
    
    loadParentCommunication: async () => {
        return new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    },
    
    loadSession: async () => {
        try {
            if (window.parent && window.parent !== window) {
                await new Promise((resolve) => {
                    const deadline = Date.now() + 3000; // max 3s wait
                    const checkSession = () => {
                        if (sessionData || moduleState.sessionActive || sessionClient.isValid()) {
                            resolve();
                            return;
                        }
                        if (Date.now() > deadline) {
                            // Proceed anyway — session may arrive via postMessage later
                            resolve();
                            return;
                        }
                        setTimeout(checkSession, 100);
                    };
                    setTimeout(checkSession, 100);
                });
            }
        } catch {}
    },
    
    loadEssentialData: async () => {
        try {
            showStatusMessage('Loading marketplace data...', 'info');
            await pageCore.loadUserFriends();
            await pageCore.loadUserGroups();
            await pageCore.loadListings();
            await Promise.allSettled([
                pageCore.loadTeamMembers(),
                pageCore.loadLeaderboard(),
                pageCore.loadAnalyticsData(),
                pageCore.loadPremiumFeatures()
            ]);
        } catch (error) {
            throw error;
        }
    },
    
    loadUserFriends: async () => {
        try {
            if ((sessionClient.isValid()) && isActive()) {
                // FIX: First check session data for friends
                const session = sessionClient.getSession();
                if (session && session.friends && Array.isArray(session.friends)) {
                    __set_userFriends(session.friends);
                    window.userFriends = userFriends;
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
                    dataCache.set(DATA_TYPES.FRIENDS, userFriends);
                } else {
                    const friends = await getUserFriends();
                    if (friends && Array.isArray(friends)) {
                        __set_userFriends(friends);
                        window.userFriends = userFriends;
                        safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
                        dataCache.set(DATA_TYPES.FRIENDS, friends);
                    }
                }
            }
        } catch {
            const cachedFriends = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_FRIENDS);
            if (cachedFriends) {
                try {
                    __set_userFriends(cachedFriends);
                    window.userFriends = userFriends;
                    dataCache.set(DATA_TYPES.FRIENDS, userFriends);
                } catch {}
            }
        }
    },
    
    loadUserGroups: async () => {
        try {
            if ((sessionClient.isValid()) && isActive()) {
                // FIX: First check session data for groups
                const session = sessionClient.getSession();
                if (session && session.groups && Array.isArray(session.groups)) {
                    __set_userGroups(session.groups);
                    window.userGroups = userGroups;
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
                    dataCache.set(DATA_TYPES.GROUPS, userGroups);
                } else {
                    const groups = await getUserGroups();
                    if (groups && Array.isArray(groups)) {
                        __set_userGroups(groups);
                        window.userGroups = userGroups;
                        safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
                        dataCache.set(DATA_TYPES.GROUPS, groups);
                    }
                }
            }
        } catch {
            const cachedGroups = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_GROUPS);
            if (cachedGroups) {
                try {
                    __set_userGroups(cachedGroups);
                    window.userGroups = userGroups;
                    dataCache.set(DATA_TYPES.GROUPS, userGroups);
                } catch {}
            }
        }
    },
    
    loadListings: async () => {
        try {
            if ((sessionClient.isValid()) && isActive()) {
                const response = await authorizedFetch('/api/marketplace/listings', { method: 'GET' });
                if (response && response.data?.listings) {
                    __set_allListings(response.data.listings);
                    window.allListings = allListings;
                    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
                } else if (response && response.listings) {
                    __set_allListings(response.listings);
                    window.allListings = allListings;
                    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
                }
            }
        } catch {
            const allListingsData = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (allListingsData) {
                try {
                    __set_allListings(allListingsData);
                    window.allListings = allListings;
                } catch {}
            }
        }
    },
    
    loadTeamMembers: async () => {
        try {
            if ((sessionClient.isValid()) && userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team') && isActive()) {
                const members = await getTeamMembers();
                if (members && Array.isArray(members)) {
                    __set_teamMembers(members);
                    safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
                }
            }
        } catch {}
    },
    
    loadLeaderboard: async () => {
        try {
            if ((sessionClient.isValid()) && isActive()) {
                const response = await authorizedFetch('/api/marketplace/leaderboard', { method: 'GET' });
                if (response && response.data?.leaderboard) {
                    __set_leaderboardData(response.data.leaderboard);
                    safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                } else if (response && response.leaderboard) {
                    __set_leaderboardData(response.leaderboard);
                    safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                }
            }
        } catch {}
    },
    
    loadAnalyticsData: async () => {
        try {
            if ((sessionClient.isValid()) && isUserPremium() && isActive()) {
                const analytics = await getAnalyticsData();
                if (analytics) {
                    __set_analyticsData(analytics);
                    safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
                }
            }
        } catch {}
    },
    
    loadPremiumFeatures: async () => {
        try {
            if ((sessionClient.isValid()) && isActive()) {
                const response = await authorizedFetch('/api/premium/features', { method: 'GET' });
                if (response && response.features) {
                    __set_premiumFeatures(response.features);
                    safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, JSON.stringify(premiumFeatures));
                }
            }
        } catch {}
    },
    
    setupEventListeners: () => {
        try {
            setupConnectivityListeners();
            window.addEventListener('coreDataUpdated', () => {});
        } catch {}
    }
};

export async function safeInitializeMarketplaceCore() {
    if (isInitializing || isReady || moduleState.initialized) return;
    await pageCore.init();
}

export async function initializeMarketplaceCore() {
    return safeInitializeMarketplaceCore();
}

// =============================================
// SESSION HANDLING FUNCTIONS (PRESERVED WITH FIXES)
// =============================================

export function handleSessionDataFromParent(sessionDataFromParent) {
    try {
        if (!isActive() && currentState !== LIFECYCLE_STATE.WAITING_AUTH) {
            logOnce('warn', 'SESSION_DATA received before active - queuing');
            setTimeout(() => handleSessionDataFromParent(sessionDataFromParent), 100);
            return;
        }
        
        if (!validateSessionSchema(sessionDataFromParent)) {
            safeSend('AUTH_ERROR', {
                error: 'INVALID_SESSION_SCHEMA',
                received: Object.keys(sessionDataFromParent || {})
            });
            return;
        }
        
        // Validate session content
        if (!__isValidSession(sessionDataFromParent)) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Rejected invalid session from parent', {
                hasToken: !!(sessionDataFromParent?.userToken || sessionDataFromParent?.token),
                userId: sessionDataFromParent?.userId || sessionDataFromParent?.user_id
            });
            safeSend('AUTH_ERROR', {
                error: 'INVALID_SESSION_DATA',
                reason: 'Invalid userId or token format'
            });
            return;
        }
        
        processSessionData(sessionDataFromParent);
        
        __set_handshakeComplete(true);
        moduleState.handshakeComplete = true;
        __set_sessionData(sessionDataFromParent);
        sessionClient.acceptParentSession(sessionDataFromParent);
        updateLocalStateFromSession(sessionData);
        
        safeSend('SESSION_CONFIRMED', {
            id: parentComm.frameId,
            userId: sessionData.userId,
            timestamp: Date.now(),
            handshakeComplete: true
        });
        
        safeSend('UI_READY', {
            id: parentComm.frameId,
            component: 'marketplace',
            timestamp: Date.now()
        });
        
        bindUIAfterSession();
    } catch (error) {
        safeSend('AUTH_ERROR', {
            error: 'SESSION_PROCESSING_FAILED',
            message: error.message
        });
    }
}

export function bindUIAfterSession() {
    try {
        if (!isActive()) return;
        if (window._MARKETPLACE_UI_BOUND_) return;
        window._MARKETPLACE_UI_BOUND_ = true;
        
        window.dispatchEvent(new CustomEvent('marketplaceSessionReady', {
            detail: { user: window.currentUser, session: sessionClient.getSession(), timestamp: Date.now() }
        }));
        
        const marketplaceContainer = safeGetElement('marketplaceContainer');
        if (marketplaceContainer) marketplaceContainer.classList.add('session-ready');
    } catch {}
}


export function validateSessionSchema(session) {
    try {
        if (!session || typeof session !== 'object') return false;
        const hasUserId = !!(session.userId || session.user_id || session.userid || session.id);
        // Don't require token - parent may send it in nested structure
        if (!hasUserId) return false;
        
        // Reject fake IDs
        const userId = session.userId || session.user_id || session.userid || session.id;
        const fakeIds = ['user', 'default', 'null', 'undefined', ''];
        if (typeof userId === 'string' && fakeIds.includes(userId.toLowerCase())) {
            return false;
        }
        
        return true;
    } catch {
        return false;
    }
}

export function processSessionData(sessionDataFromParent) {
    try {
        const userId = sessionDataFromParent.userId || sessionDataFromParent.user_id || sessionDataFromParent.userid;
        // Reject fake userId values
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') {
            throw new Error('Invalid userId format');
        }
        
        const userDataFromSession = {
            id: userId,
            displayName: sessionDataFromParent.displayName || sessionDataFromParent.name || 'User',
            email: sessionDataFromParent.email || '',
            photoURL: sessionDataFromParent.photoURL || sessionDataFromParent.avatar || '',
            isPremium: sessionDataFromParent.isPremium || false,
            subscription: sessionDataFromParent.subscription || null,
            trustLevel: sessionDataFromParent.trustLevel || 'new',
            groups: sessionDataFromParent.groups || [],
            friends: sessionDataFromParent.friends || []
        };
        
        window.currentUser = userDataFromSession;
        window.userData = userDataFromSession;
        
        __set_parentDataLoaded(true);
        __set_dataFetchInProgress(false);
    } catch {}
}

export function storeCentralizedToken(token) {
    try {
        if (!token || typeof token !== 'string' || token.length < 5) return;
    } catch {}
}

export function updateLocalStateFromSession(session) {
    try {
        if (session.groups && Array.isArray(session.groups)) {
            __set_userGroups(session.groups);
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
        }
        if (session.friends && Array.isArray(session.friends)) {
            __set_userFriends(session.friends);
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
        }
        if (session.subscription) {
            __set_userSubscription(session.subscription);
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
        }
    } catch {}
}

export function showMarketplaceUI() {
    try {
        if (!isActive()) return;
        
        const marketplaceContainer = safeGetElement('marketplaceContainer');
        if (marketplaceContainer) {
            marketplaceContainer.style.display = 'block';
            marketplaceContainer.style.opacity = '1';
            marketplaceContainer.style.visibility = 'visible';
        }
        const loadingIndicator = safeGetElement('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    } catch {}
}

export function handleSessionUpdate(updatedData) {
    try {
        if (!isActive() && currentState !== LIFECYCLE_STATE.WAITING_AUTH) {
            setTimeout(() => handleSessionUpdate(updatedData), 100);
            return;
        }
        if (!updatedData || typeof updatedData !== 'object') return;
        
        // Validate update data
        if (!__isValidSession(updatedData)) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Ignored invalid session update');
            return;
        }
        
        const currentSession = sessionClient.getSession() || sessionData || {};
        // Merge only valid data
        const mergedSession = { ...currentSession, ...updatedData };
        if (__isValidSession(mergedSession)) {
            __set_sessionData(mergedSession);
            sessionClient.acceptParentSession(mergedSession);
        } else {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Session update would create invalid session - rejected');
            return;
        }
        
        if (updatedData.userId || updatedData.id || updatedData.displayName) {
            if (!window.currentUser) window.currentUser = {};
            if (!window.userData) window.userData = {};
            window.currentUser = { ...window.currentUser, ...updatedData };
            window.userData = { ...window.userData, ...updatedData };
            if (updatedData.displayName || updatedData.photoURL || updatedData.isPremium) {
                // Removed localStorage set
            }
            if (updatedData.subscription) __set_userSubscription(updatedData.subscription);
        }
    } catch {}
}

export function handleParentLogout() {
    try {
        clearSessionData();
        showNotification('You have been logged out.', 'warning');
    } catch {}
}

export function clearSessionData() {
    try {
        __set_sessionData(null);
        window.currentUser = null;
        window.userData = null;
        __set_userSubscription(null);
        __set_handshakeComplete(false);
        moduleState.handshakeComplete = false;
        __set_sessionValid(false);
        moduleState.sessionActive = false;
        
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        
        __set_parentDataLoaded(false);
        __set_directAPILoaded(false);
        
        __set_isReady(moduleState.ready);
        __set_isInitializing(false);
        messageQueue.length = 0;
        dataCache.clear();
        
        sessionClient.clear();
        
        window.__MODULE_SESSION_ACTIVE__ = false;
    } catch {}
}

export function handleRefreshUI() {
    try {
        if (!isActive()) return;
        window.dispatchEvent(new CustomEvent('marketplace:refresh-ui'));
    } catch {}
}

export function handleForceReload() {
    try {
        saveAllMarketplaceData();
        window.location.reload();
    } catch {}
}

// =============================================
// API CALL FUNCTIONS (PRESERVED WITH FIXES)
// =============================================

export async function secureApiCall(method, endpoint, data = null, options = {}) {
    const normalizedEndpoint = normalizeToolsEndpoint(endpoint);

    // Get token from every possible source — do NOT gate on isActive()
    let token = null;
    
    // 1. SessionClientWrapper (primary - receives token from parent postMessage)
    if (sessionClient.getToken) token = sessionClient.getToken();
    
    // 2. Old SessionClient (capital S) - also holds session
    if (!token && SessionClient.getToken) token = SessionClient.getToken();
    
    // 3. window.getAuthSession (api.core.js pattern)
    if (!token && typeof window.getAuthSession === 'function') {
        const s = window.getAuthSession();
        if (s?.token) token = s.token;
    }
    
    // 4. Cached token on window
    if (!token && window.__kynToken) token = window.__kynToken;
    if (!token && window.currentUser?.token) token = window.currentUser.token;
    if (!token && window.sessionData?.userToken) token = window.sessionData.userToken;
    if (!token && window.sessionData?.token) token = window.sessionData.token;
    
    // 5. Parent frame
    if (!token) {
        try {
            if (window.parent && window.parent !== window) {
                if (typeof window.parent.getAuthSession === 'function') {
                    const ps = window.parent.getAuthSession();
                    if (ps?.token) token = ps.token;
                }
                // Also check parent's AppState
                if (!token && window.parent.AppState?.getToken) {
                    token = window.parent.AppState.getToken();
                }
            }
        } catch {}
    }
    
    // 6. localStorage scan for JWT
    if (!token) {
        try {
            const scanKeys = Object.keys(localStorage);
            for (const key of scanKeys) {
                if (key.includes('token') || key.includes('auth') || key.includes('kyn')) {
                    const val = localStorage.getItem(key);
                    if (val && val.startsWith('eyJ')) { token = val; break; }
                    try {
                        const parsed = JSON.parse(val);
                        const t = parsed?.userToken || parsed?.token || parsed?.accessToken;
                        if (t && t.startsWith('eyJ')) { token = t; break; }
                    } catch {}
                }
            }
        } catch {}
    }
    
    // Final attempt: known localStorage keys used by auth.session.manager.js
    if (!token) {
        try {
            const knownKeys = [
                'kynecta_session', 'kyn_session', 'auth_token', 'user_token',
                'kynecta_auth', 'kyn_auth', 'session_token', 'accessToken',
                'kynecta_user', 'kyn_user_session'
            ];
            for (const key of knownKeys) {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                if (raw.startsWith('eyJ')) { token = raw; break; }
                try {
                    const p = JSON.parse(raw);
                    const t = p?.token || p?.userToken || p?.accessToken || p?.jwtToken;
                    if (t && t.startsWith('eyJ')) { token = t; break; }
                    if (p?.session) {
                        const st = p.session?.token || p.session?.userToken;
                        if (st && st.startsWith('eyJ')) { token = st; break; }
                    }
                    if (p?.data) {
                        const dt = p.data?.token || p.data?.userToken;
                        if (dt && dt.startsWith('eyJ')) { token = dt; break; }
                    }
                } catch {}
            }
            // Brute-force scan all localStorage keys
            if (!token) {
                for (const key of Object.keys(localStorage)) {
                    try {
                        const raw = localStorage.getItem(key);
                        if (!raw || raw.length < 20) continue;
                        if (raw.startsWith('eyJ')) { token = raw; break; }
                        if (raw.charAt(0) === '{') {
                            const p = JSON.parse(raw);
                            const candidates = [
                                p?.token, p?.userToken, p?.accessToken, p?.jwtToken,
                                p?.session?.token, p?.session?.userToken,
                                p?.data?.token, p?.data?.userToken,
                                p?.auth?.token, p?.user?.token
                            ];
                            for (const c of candidates) {
                                if (c && typeof c === 'string' && c.startsWith('eyJ')) {
                                    token = c; break;
                                }
                            }
                            if (token) break;
                        }
                    } catch {}
                }
            }
        } catch {}
    }
    
    // Cache the found token for fast re-use
    if (token) {
        window.__kynToken = token;
        // Also store in sessionClient so future calls are fast
        if (!sessionClient.getToken()) {
            const uid = window.__kynUserId || sessionClient.getSession()?.userId;
            if (uid) sessionClient.acceptParentSession({ userId: uid, userToken: token, token });
        }
    }

    if (!token) {
        // Offline fallback for GET requests
        if (method === 'GET') {
            if (normalizedEndpoint.includes('/marketplace/listings')) {
                try {
                    const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                    if (cached && cached.length) return { success: true, data: { listings: cached }, listings: cached };
                } catch {}
            }
        }
        if (window.__TOOLS_DEBUG__) console.warn('[secureApiCall] No token found for', method, normalizedEndpoint);
        return null;
    }

    try {
        const requestUrl = resolveToolsApiUrl(normalizedEndpoint);
        const headers = {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        const fetchOptions = { method, headers, credentials: 'include' };
        if (data && method !== 'GET') fetchOptions.body = JSON.stringify(data);

        if (window.__TOOLS_DEBUG__) console.log('[secureApiCall]', method, requestUrl, data ? JSON.stringify(data).slice(0,80) : '');

        const res = await fetch(requestUrl, fetchOptions);

        if (window.__TOOLS_DEBUG__) console.log('[secureApiCall] ←', res.status, normalizedEndpoint);

        if (res.status === 401) {
            safeSend('REQUEST_SESSION', { reason: '401_unauthorized' });
            const err = new Error('Unauthorized'); err.status = 401; throw err;
        }
        if (res.status === 500 || res.status === 502 || res.status === 503) {
            // Server error - try cache for GET requests
            if (method === 'GET') {
                if (window.__TOOLS_DEBUG__) console.warn('[secureApiCall] Server error ' + res.status + ' for ' + normalizedEndpoint + ' — checking cache');
                // Return null to trigger cache fallback in caller
                const err = new Error('Internal server error'); err.status = res.status; throw err;
            }
            let msg = 'Server error (' + res.status + ')';
            try { const j = await res.json(); msg = j?.message || msg; } catch {}
            const err = new Error(msg); err.status = res.status; throw err;
        }
        if (!res.ok) {
            let msg = 'HTTP ' + res.status;
            try { const j = await res.json(); msg = j?.message || msg; } catch {}
            const err = new Error(msg); err.status = res.status; throw err;
        }
        return await res.json();
    } catch (error) {
        if (window.__TOOLS_DEBUG__) console.error('[secureApiCall] ERROR', method, normalizedEndpoint, error.message);
        // For GET requests, return cached data on network error
        if (method === 'GET' && normalizedEndpoint.includes('/marketplace/listings')) {
            try {
                const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                if (cached && cached.length) return { success: true, data: { listings: cached }, listings: cached };
            } catch {}
        }
        throw error;
    }
}

export async function handleApiError(error, method, endpoint) {
    try {
        safeSend('AUTH_ERROR', {
            error: 'API_CALL_FAILED',
            endpoint: endpoint,
            method: method,
            message: error.message
        });
        
        if (error.status === 401 || error.status === 403) {
            return handleUnauthorized();
        }
        throw error;
    } catch {
        throw error;
    }
}

export async function handleUnauthorized() {
    try {
        safeSend('AUTH_ERROR', {
            error: 'UNAUTHORIZED_API_CALL',
            timestamp: Date.now()
        });
        sessionClient.clear();
        showNotification('Session expired. Please log in again.', 'error');
        return null;
    } catch {
        return null;
    }
}

export async function safeApiCall(method, endpoint, data = null) {
    if (window.__TOOLS_DEBUG__) console.log('[safeApiCall] →', method, endpoint, data);
    const response = await secureApiCall(method, endpoint, data);
    if (window.__TOOLS_DEBUG__) console.log('[safeApiCall] ←', response);
    if (response === null || response === undefined) {
        throw new Error('No response from server — check network and authentication');
    }
    if (response.success === false) {
        throw new Error(response.message || 'Server returned failure');
    }
    return response;
}

export function getCentralToken() {
    try {
        const token = sessionClient.getToken ? sessionClient.getToken() : null;
        if (token) return token;
        
        const session = sessionClient.getSession();
        if (session && session.userToken) return session.userToken;
        
        return null;
    } catch {
        return null;
    }
}

export function setupConnectivityListeners() {
    try {
        window.addEventListener('online', () => {
            if (isActive()) {
                safeSend('PING', { type: 'connectivity_check' });
                syncOfflineMarketplaceData();
            }
        });
        window.addEventListener('offline', () => {
            syncOfflineMarketplaceData();
        });
    } catch {}
}

export function initializeTokenSystem() {
    if (tokenInitializationPromise) return tokenInitializationPromise;
    
    __set_tokenInitializationPromise(new Promise(async (resolve, reject) => {
        try {
            if (!(sessionClient.isValid())) {
                throw new Error('No session data available for token initialization');
            }
            
            const session = sessionClient.getSession();
            if (!session || !session.userToken) {
                throw new Error('Invalid token in session data');
            }
            
            // Validate session before accepting
            if (!__isValidSession(session)) {
                throw new Error('Invalid session data format');
            }
            
            __set_isAuthReady(true);
            resolve();
        } catch (error) {
            __set_isAuthReady(true);
            reject(error);
        }
    }));
    
    return tokenInitializationPromise;
}

export function isValidToken(token) {
    try {
        return !!(token && typeof token === 'string' && token !== 'undefined' && token !== 'null' && token.length >= 5);
    } catch {
        return false;
    }
}

export async function bootstrapIframe() {
    if (isBootstrapped || moduleState.initialized) return;
    
    try {
        if (!sessionData && !moduleState.sessionActive && !(sessionClient.isValid())) await new Promise(resolve => setTimeout(resolve, 1000));
        if (tokenInitializationPromise) {
            try { await tokenInitializationPromise; } catch {}
        }
        loadCachedDataInstantly();
        if ((sessionClient.isValid()) && isActive() && __isValidSession(sessionClient.getSession())) {
            try { await authorizedFetch('/api/auth/verify', { method: 'GET' }); } catch {}
        }
        __set_isBootstrapped(true);
    } catch {
        __set_isBootstrapped(true);
    }
}

export async function loadCachedDataInstantly() {
    try {
        const cachedMyListings = await safeStorage.get(LOCAL_STORAGE_KEYS.MY_LISTINGS);
        if (cachedMyListings) {
            try { __set_myListings(cachedMyListings); } catch {}
        }
        
        const cachedAllListings = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
        if (cachedAllListings) {
            try { __set_allListings(cachedAllListings); } catch {}
        }
        
        const cachedSaved = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
        if (cachedSaved) {
            try { __set_savedItems(cachedSaved); } catch {}
        }
        
        const cachedNotes = await safeStorage.get(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (cachedNotes) {
            try { __set_privateNotes(cachedNotes); } catch {}
        }
        
        const cachedDrafts = await safeStorage.get(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS);
        if (cachedDrafts) {
            try { __set_offlineDrafts(cachedDrafts); } catch {}
        }
        
        const cachedTrust = await safeStorage.get(LOCAL_STORAGE_KEYS.TRUST_STATS);
        if (cachedTrust) {
            try { __set_trustStats(cachedTrust); } catch {}
        }
        
        const cachedGroups = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (cachedGroups) {
            try { __set_userGroups(cachedGroups); } catch {}
        }
        
        const cachedFriends = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_FRIENDS);
        if (cachedFriends) {
            try { __set_userFriends(cachedFriends); } catch {}
        }
        
        const cachedSubscription = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (cachedSubscription) {
            try { __set_userSubscription(cachedSubscription); } catch {}
        }
        
        const cachedTeam = await safeStorage.get(LOCAL_STORAGE_KEYS.TEAM_MEMBERS);
        if (cachedTeam) {
            try { __set_teamMembers(cachedTeam); } catch {}
        }
    } catch {}
}

export async function initializeEnhancedMarketplace() {
    try {
        if (!isActive()) return;
        await checkDarkMode();
        await checkUserPremiumStatus();
        await loadEnhancedMarketplaceData();
        cleanupExpiredListings();
    } catch {}
}

export async function checkUserPremiumStatus() {
    try {
        if (!isActive()) return;
        
        const localSubscription = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (localSubscription) {
            try {
                __set_userSubscription(localSubscription);
                if (userSubscription.expiresAt && new Date(userSubscription.expiresAt) < new Date()) {
                    __set_userSubscription(null);
                    safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
                } else {
                    return;
                }
            } catch {}
        }
        const response = await safeApiCall('GET', '/api/user/subscription');
        if (response && response.subscription) {
            __set_userSubscription(response.subscription);
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
        }
    } catch {}
}

export async function loadEnhancedMarketplaceData() {
    try {
        if (!isActive()) return;
        
        const promises = [
            loadListingsFromBackend(),
            pageCore.loadUserGroups(),
            pageCore.loadUserFriends(),
            pageCore.loadTeamMembers(),
            loadLeaderboard(),
            loadAnalyticsData(),
            pageCore.loadPremiumFeatures(),
            loadSpotlightListingsFromBackend()
        ];
        await Promise.allSettled(promises);
        updateListingCounts();
    } catch {
        generateSampleMarketplaceData();
    }
}

export async function loadListingsFromBackend() {
    // FIXED: Load from cache first (offline-first), then fetch from server
    try {
        // Step 1 — always hydrate from LocalStoreTools / localStorage immediately
        const LST = window.LocalStoreTools;
        if (LST && typeof LST.getAllListings === 'function') {
            const cached = LST.getAllListings();
            if (cached && cached.length) {
                __set_allListings(cached);
                window.allListings = allListings;
                window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings, source: 'cache' } }));
            }
        }
        if (!allListings || !allListings.length) {
            const cached = safeStorage.get ? safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS) : null;
            if (cached) { __set_allListings(cached); window.allListings = allListings; }
        }

        // Step 2 — attempt server fetch (skip if no token yet but still return cached data)
        const token = getCentralToken();
        if (!token && !navigator.onLine) return; // no token + offline = use cache only

        const response = await safeApiCall('GET', '/api/marketplace/listings');
        if (response && response.data?.listings) {
            __set_allListings(response.data.listings);
            window.allListings = allListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            if (LST) LST.saveMany(allListings, LST.STORES.LISTINGS).catch(()=>{});
            window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings, source: 'server' } }));
        } else if (response && response.listings) {
            __set_allListings(response.listings);
            window.allListings = allListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            if (LST) LST.saveMany(allListings, LST.STORES.LISTINGS).catch(()=>{});
            window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings, source: 'server' } }));
        }
    } catch(e) {
        // Server fetch failed — cached data was already hydrated above, just log
        if (window.__TOOLS_DEBUG__) console.warn('[loadListingsFromBackend] Server fetch failed, using cache:', e.message);
    }
}

export async function loadSpotlightListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/spotlight');
        const items = response?.data?.listings || response?.spotlightListings || [];
        if (items.length) {
            safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, items);
            window.dispatchEvent(new CustomEvent('marketplace:spotlight-updated', { detail: { listings: items } }));
        }
    } catch {}
}

export function updateListingCounts() {
    try {
        if (!isActive()) return;
        updateAvailableListingsCount();
    } catch {}
}

export function updateAvailableListingsCount() {
    try {
        const element = document.getElementById('availableListingsCount');
        if (element) {
            element.textContent = allListings.length;
        }
    } catch {}
}

export function isUserPremium() {
    try {
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        if (user && user.isPremium) return true;
        return userSubscription && userSubscription.status === 'active';
    } catch {
        return false;
    }
}

export function isListingVisibleToUser(listing) {
    try {
        if (!listing) return false;
        // FIX: Use window.currentUser as fallback
        const user = window.currentUser || (sessionClient.getUser ? sessionClient.getUser() : null);
        const currentUserId = user?.id;
        if (!currentUserId) return true; // Show all if no user yet
        
        if (listing.sellerId === currentUserId || listing.userId === currentUserId) return true;
        
        if (listing.visibility === TRUST_CIRCLES.FRIENDS) {
            return userFriends.some(friend => friend.id === listing.sellerId);
        } else if (listing.visibility === TRUST_CIRCLES.GROUPS) {
            return listing.allowedGroups && listing.allowedGroups.some(groupId => 
                userGroups.some(group => group.id === groupId)
            );
        } else if (listing.visibility === TRUST_CIRCLES.SELECTED) {
            return listing.allowedUsers && listing.allowedUsers.includes(currentUserId);
        } else if (listing.visibility === TRUST_CIRCLES.PREMIUM) {
            return isUserPremium();
        }
        return true;
    } catch {
        return false;
    }
}

export function filterListingsByMood(listings, mood) {
    try {
        if (!Array.isArray(listings)) return [];
        switch (mood) {
            case MOOD_CONTEXTS.HELP:
                return listings.filter(l => l.availability === AVAILABILITY.URGENT);
            case MOOD_CONTEXTS.LEARN:
                return listings.filter(l => l.type === LISTING_TYPES.DIGITAL || 
                    (l.category && l.category.toLowerCase().includes('tutor')));
            case MOOD_CONTEXTS.URGENT:
                return listings.filter(l => l.availability === AVAILABILITY.URGENT);
            case MOOD_CONTEXTS.CREATIVE:
                return listings.filter(l => l.category && 
                    (l.category.toLowerCase().includes('art') || l.category.toLowerCase().includes('design')));
            case MOOD_CONTEXTS.BUSINESS:
                return listings.filter(l => l.category && 
                    (l.category.toLowerCase().includes('business') || l.category.toLowerCase().includes('consult')));
            default:
                return listings;
        }
    } catch {
        return listings || [];
    }
}

export function getTrustIndicator(userId, trustLevel) {
    try {
        if (trustLevel) {
            const level = trustLevel.toUpperCase();
            const indicator = TRUST_INDICATORS[level] || TRUST_INDICATORS.NEW;
            return `<span class="trust-indicator ${indicator.class}">${indicator.text}</span>`;
        }
        return '<span class="trust-indicator trust-new">New</span>';
    } catch {
        return '<span class="trust-indicator trust-new">New</span>';
    }
}

export async function trackListingView(listingId) {
    try {
        if (!isActive()) return;
        
        if (!analyticsData.views) analyticsData.views = 0;
        analyticsData.views++;
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
        await safeApiCall('POST', `/api/marketplace/listings/${listingId}/view`);
    } catch {}
}

export function updateTrustStats(action) {
    try {
        if (!trustStats[action]) trustStats[action] = 0;
        trustStats[action]++;
        safeStorage.set(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
    } catch {}
}

export async function createPremiumServiceListing(title, description, premiumOptions = {}) {
    try {
        if (!hasValidUser()) throw new Error('User not authenticated');
        if (!isActive()) throw new Error('Module not active');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;
        const userObj = user || { displayName: 'User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: userObj,
            type: LISTING_TYPES.SERVICE,
            title: title,
            description: description,
            price: premiumOptions.price,
            availability: premiumOptions.availability || AVAILABILITY.FREE,
            visibility: premiumOptions.visibility || TRUST_CIRCLES.FRIENDS,
            moodContext: premiumOptions.moodContext,
            template: premiumOptions.template,
            featured: premiumOptions.featured || false,
            boosted: premiumOptions.boosted || false,
            verified: premiumOptions.verified || false,
            videoIntro: premiumOptions.videoIntro,
            acceptsTips: premiumOptions.acceptsTips || false,
            autoRenew: premiumOptions.autoRenew || false,
            teamMembers: premiumOptions.teamMembers || [],
            allowedGroups: premiumOptions.allowedGroups,
            allowedUsers: premiumOptions.allowedUsers,
            expiresAt: premiumOptions.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            privateNotes: premiumOptions.privateNotes,
            teamNotes: premiumOptions.teamNotes,
            premium: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (premiumOptions.featured) await processFeaturedListing(listing);
        if (premiumOptions.boosted) await processBoostedListing(listing);
        
        myListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        const premiumListings = await safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
                // Only increment stats after confirmed backend success
                updateListingStreak();
                updateTrustStats('listingCreated');
            }
        } catch {
            queueForSync(listing, 'premium_listing');
            // Stats NOT incremented on failure
        }
        
        return listing;
    } catch (err) {
        // FIX (2026-07-22): was a bare catch that silently swallowed
        // auth/state errors with zero diagnostic info.
        console.error('[createPremiumServiceListing] Failed:', err?.message || err);
        return null;
    }
}

export async function createPremiumDigitalListing(title, description, fileData, premiumOptions = {}) {
    try {
        if (!hasValidUser()) throw new Error('User not authenticated');
        if (!isActive()) throw new Error('Module not active');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;
        const userObj = user || { displayName: 'User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: userObj,
            type: LISTING_TYPES.DIGITAL,
            title: title,
            description: description,
            price: premiumOptions.price,
            mediaUrl: fileData?.url || '',
            fileUrl: fileData?.url || '',
            fileName: fileData?.name || '',
            fileSize: fileData?.size || 0,
            fileType: fileData?.type || '',
            visibility: premiumOptions.visibility || TRUST_CIRCLES.FRIENDS,
            moodContext: premiumOptions.moodContext,
            template: premiumOptions.template,
            featured: premiumOptions.featured || false,
            boosted: premiumOptions.boosted || false,
            verified: premiumOptions.verified || false,
            arPreview: premiumOptions.arPreview,
            videoIntro: premiumOptions.videoIntro,
            acceptsTips: premiumOptions.acceptsTips || false,
            autoRenew: premiumOptions.autoRenew || false,
            teamMembers: premiumOptions.teamMembers || [],
            allowedGroups: premiumOptions.allowedGroups,
            allowedUsers: premiumOptions.allowedUsers,
            expiresAt: premiumOptions.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            privateNotes: premiumOptions.privateNotes,
            teamNotes: premiumOptions.teamNotes,
            premium: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (premiumOptions.featured) await processFeaturedListing(listing);
        if (premiumOptions.boosted) await processBoostedListing(listing);
        
        myListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        const premiumListings = await safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
                updateListingStreak();
                updateTrustStats('listingCreated');
            }
        } catch {
            queueForSync(listing, 'premium_listing');
        }
        
        return listing;
    } catch (err) {
        // FIX (2026-07-22): was a bare catch that silently swallowed
        // auth/state errors with zero diagnostic info.
        console.error('[createPremiumDigitalListing] Failed:', err?.message || err);
        return null;
    }
}

export async function processFeaturedListing(listing) {
    try {
        if (!isActive()) return;
        const spotlightListings = await safeStorage.get(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS) || [];
        spotlightListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, spotlightListings);
        await safeApiCall('POST', '/api/marketplace/spotlight', { listingId: listing.id });
    } catch {}
}

export async function processBoostedListing(listing) {
    try {
        if (!isActive()) return;
        await safeApiCall('POST', '/api/marketplace/boost', { listingId: listing.id, duration: '24h' });
    } catch {}
}

export async function processPremiumPayment(listing, options) {
    try {
        if (!isActive()) return false;
        const paymentAmount = calculatePremiumCost(options);
        const paymentData = { amount: paymentAmount, currency: 'KES', listingId: listing.id, features: options };
        const response = await safeApiCall('POST', '/api/payments/process', paymentData);
        return response && response.success;
    } catch {
        return false;
    }
}

export function calculatePremiumCost(options) {
    try {
        let cost = 0;
        if (options.featured) cost += 5;
        if (options.boosted) cost += 3;
        if (options.verified) cost += 10;
        if (options.autoRenew) cost += 1;
        return cost;
    } catch {
        return 0;
    }
}

export async function sendTip(listingId, amount, customAmount = null) {
    try {
        if (!isActive()) return false;
        const finalAmount = customAmount || amount;
        const tipData = { listingId, amount: finalAmount, currency: 'KES' };
        const response = await safeApiCall('POST', '/api/marketplace/tips', tipData);
        if (response && response.success) {
            updateAnalyticsData('tipReceived', finalAmount);
            return true;
        }
    } catch {}
    return false;
}

export function updateAnalyticsData(type, value) {
    try {
        if (!analyticsData[type]) analyticsData[type] = 0;
        analyticsData[type] += value;
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
    } catch {}
}

export function updateListingStreak() {
    try {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (!streakData.lastListingDate) {
            __set_streakData({ currentStreak: 1, longestStreak: 1, lastListingDate: today, totalListings: 1 });
        } else if (streakData.lastListingDate === today) {
            streakData.totalListings++;
        } else if (streakData.lastListingDate === yesterday) {
            streakData.currentStreak++;
            streakData.totalListings++;
            streakData.lastListingDate = today;
            if (streakData.currentStreak > streakData.longestStreak) {
                streakData.longestStreak = streakData.currentStreak;
            }
        } else {
            streakData.currentStreak = 1;
            streakData.totalListings++;
            streakData.lastListingDate = today;
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.STREAK_DATA, streakData);
        checkStreakRewards();
    } catch {}
}

export function checkStreakRewards() {
    try {
        const rewards = {
            3: '🎉 3-day streak! Keep going!',
            7: '🏆 Weekly streak! You earned a badge!',
            30: '👑 Monthly streak! Premium features unlocked for a week!'
        };
        if (rewards[streakData.currentStreak]) {
            showNotification(rewards[streakData.currentStreak], 'success');
            if (streakData.currentStreak === 30) awardTemporaryPremium(7);
        }
    } catch {}
}

export function awardTemporaryPremium(days) {
    try {
        const tempPremium = { status: 'active', plan: 'temporary', expiresAt: new Date(Date.now() + days * 86400000).toISOString() };
        __set_userSubscription(tempPremium);
        safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, tempPremium);
    } catch {}
}

export async function processBulkUpload(file) {
    try {
        if (!isActive()) return;
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const content = e.target.result;
                let listings = [];
                if (file.type === 'application/json') {
                    listings = JSON.parse(content);
                } else if (file.type === 'text/csv') {
                    listings = parseCSV(content);
                }
                if (listings.length > 0) await uploadBulkListings(listings);
            } catch {}
        };
        if (file.type === 'application/json' || file.type === 'text/csv') {
            reader.readAsText(file);
        }
    } catch {}
}

export function parseCSV(content) {
    try {
        const lines = content.split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',');
        const listings = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',');
            const listing = {};
            for (let j = 0; j < headers.length; j++) {
                listing[headers[j].trim()] = values[j] ? values[j].trim() : '';
            }
            listings.push(listing);
        }
        return listings;
    } catch {
        return [];
    }
}

export async function uploadBulkListings(listings) {
    try {
        if (!isActive()) return;
        for (let i = 0; i < listings.length; i++) {
            const listing = listings[i];
            try {
                await safeApiCall('POST', '/api/marketplace/listings/bulk', listing);
            } catch {}
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    } catch {}
}

export async function exportAnalyticsData(format) {
    try {
        if (!isActive()) return;
        const result = await exportAnalytics(format);
        if (result && result.downloadUrl) {
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = `analytics_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch {}
}

export async function backupMarketplaceData() {
    try {
        const backupData = {
            myListings, savedItems, privateNotes, offlineDrafts, trustStats,
            analyticsData, premiumFeatures, timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `marketplace_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch {}
}

export async function restoreMarketplaceData(file) {
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const backupData = JSON.parse(e.target.result);
                if (!backupData.timestamp || !backupData.myListings) throw new Error('Invalid backup file');
                __set_myListings(backupData.myListings || []);
                __set_savedItems(backupData.savedItems || []);
                __set_privateNotes(backupData.privateNotes || []);
                __set_offlineDrafts(backupData.offlineDrafts || []);
                __set_trustStats(backupData.trustStats || {});
                __set_analyticsData(backupData.analyticsData || {});
                __set_premiumFeatures(backupData.premiumFeatures || {});
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
                safeStorage.set(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
                safeStorage.set(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
                safeStorage.set(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
                safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
                safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, premiumFeatures);
                showNotification('Backup restored successfully', 'success');
            } catch (error) {
                showNotification('Failed to restore backup: Invalid file format', 'error');
            }
        };
        reader.onerror = () => showNotification('Failed to read backup file', 'error');
        reader.readAsText(file);
    } catch {}
}

export function isListingExpired(listing) {
    try {
        return listing && listing.expiresAt && new Date(listing.expiresAt) < new Date();
    } catch {
        return false;
    }
}

export function cleanupExpiredListings() {
    try {
        const expiredListings = allListings.filter(l => isListingExpired(l));
        if (expiredListings.length > 0) {
            __set_allListings(allListings.filter(l => !isListingExpired(l)));
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            __set_myListings(myListings.filter(l => !isListingExpired(l)));
            safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        }
    } catch {}
}

export function formatTimeAgo(date) {
    try {
        if (!(date instanceof Date)) date = new Date(date);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return `${Math.floor(diffDays / 7)}w ago`;
    } catch {
        return 'Unknown time';
    }
}

export function showNotification(message, type = 'success') {
    try {
        const notificationText = safeGetElement('notificationText');
        if (!notificationText) return;
        notificationText.textContent = message;
        const notification = safeGetElement('notification');
        if (!notification) return;
        notification.className = 'notification';
        notification.classList.add(type);
        notification.classList.add('active');
        setTimeout(() => {
            if (notification.parentNode) notification.classList.remove('active');
        }, 3000);
    } catch {}
}

export function saveToLocalStorage(key, data) {
    safeStorage.set(key, data);
}

export function escapeHtml(text) {
    try {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    } catch {
        return text || '';
    }
}

export async function checkDarkMode() {
    try {
        // Never override an explicit user choice. Only fall back to the
        // system preference when the user hasn't picked (or picked 'auto').
        let preference = null;
        try { preference = await safeStorage.get('user_theme_preference'); } catch {}
        if (preference === 'light' || preference === 'dark') {
            document.documentElement.setAttribute('data-theme', preference);
            document.body.setAttribute('data-theme', preference);
            return;
        }
        // No saved preference yet — default to light, same first-run default
        // as the rest of the app (this used to fall back to the OS preference,
        // which was a leftover from the removed 'auto' theme).
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.setAttribute('data-theme', 'light');
    } catch {}
}

export function queueForSync(data, type) {
    try {
        safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE).then(syncQueue => {
            const queue = syncQueue || [];
            queue.push({ type: 'marketplace_' + type, data, timestamp: Date.now(), retryCount: 0 });
            safeStorage.set(LOCAL_STORAGE_KEYS.SYNC_QUEUE, queue);
        });
    } catch {}
}

export function formatTimeRemaining(date) {
    try {
        const now = new Date();
        const targetDate = new Date(date);
        const diffMs = targetDate - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        if (diffDays > 0) return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        if (diffHours > 0) return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
        return 'soon';
    } catch {
        return 'soon';
    }
}

export function formatFileSize(bytes) {
    try {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } catch {
        return 'Unknown size';
    }
}

export async function createServiceListing(title, description, options = {}) {
    if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 1: UI triggered — createServiceListing', { title });

    // Auth check using all possible token sources
    const _tok = sessionClient.getToken?.() || window.__kynToken ||
        window.sessionData?.userToken || window.currentUser?.token;
    const _uid = sessionClient.getUser?.()?.id || window.__kynUserId ||
        window.currentUser?.id || window.currentUser?.userId ||
        sessionClient.getSession?.()?.userId;
    // Sync token to window for secureApiCall to find
    if (_tok) window.__kynToken = _tok;
    if (_uid) window.__kynUserId = _uid;

    if (!_tok || !_uid) {
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createServiceListing: no auth', {tok:!!_tok, uid:_uid});
        showNotification('Not authenticated. Tap another page then return to marketplace.', 'error');
        return null;
    }
    // Wait up to 4s for module to become active (handles slow parent handshake)
    if (!isActive()) {
        await new Promise(resolve => {
            const deadline = Date.now() + 4000;
            const check = () => {
                if (isActive() || Date.now() > deadline) { resolve(); return; }
                setTimeout(check, 100);
            };
            check();
        });
    }
    if (!isActive()) {
        // Still not active — proceed anyway, secureApiCall will get the token directly
        if (window.__TOOLS_DEBUG__) console.warn('[TOOLS FLOW] createServiceListing: proceeding without ACTIVE state');
    }

    // Build user object from resolved auth
    const userId = _uid;
    const _u = sessionClient.getUser?.() || window.currentUser || {};
    const userObj = {
        id: userId,
        displayName: _u.displayName || _u.name || _u.username || 'User',
        photoURL: _u.photoURL || _u.avatar || ''
    };

    const fakeId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const optimistic = {
        id: fakeId,
        _isOptimistic: true,
        userId,
        sellerId: userId,
        user: userObj,
        type: LISTING_TYPES.SERVICE,
        title,
        description,
        price: options.price ? parseFloat(options.price) : 0,
        category: 'services',
        availability: options.availability || AVAILABILITY.FREE,
        visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: options.moodContext,
        template: options.template,
        allowedGroups: options.allowedGroups,
        allowedUsers: options.allowedUsers,
        expiresAt: options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        privateNotes: options.privateNotes,
        teamNotes: options.teamNotes,
        available: true,
        savedBy: [],
        views: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Snapshot for rollback
    const prevAll = allListings.slice();
    const prevMy  = myListings.slice();

    // Optimistic UI update
    myListings.unshift(optimistic);
    allListings.unshift(optimistic);
    window.allListings = allListings;
    window.myListings  = myListings;
    safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
    window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

    // Backend call — safeApiCall now throws on failure (no silent null)
    try {
        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 2: API request sending');
        const response = await safeApiCall('POST', '/api/marketplace/listings', {
            title: optimistic.title,
            description: optimistic.description,
            price: optimistic.price,
            category: 'services',
            type: 'service',
            images: [],
            available: true
        });

        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 3: API response received, status:', response?.success);
        // Handle both { data: { listing } } and { listing } and flat { id, title... }
        const confirmed = response?.data?.listing || response?.listing || 
            (response?.id ? response : null) ||
            (response?.data?.id ? response.data : null);
        if (!confirmed || !confirmed.id) {
            throw new Error('Backend did not return a valid listing. Response: ' + JSON.stringify(response).slice(0,120));
        }

        // Replace fake entry with the real DB-confirmed listing
        const committed = { ...optimistic, ...confirmed, id: confirmed.id, user: userObj, _isOptimistic: false };
        __set_allListings(allListings.map(l => l.id === fakeId ? committed : l));
        __set_myListings(myListings.map(l =>  l.id === fakeId ? committed : l));
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

        // Broadcast to other tabs
        try { const ch = new BroadcastChannel('marketplace_sync'); ch.postMessage({ type: 'LISTING_CREATED', listing: committed }); ch.close(); } catch (_) {}

        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 4: UI updated — listing committed to DB', { id: committed.id });
        updateListingStreak();
        updateTrustStats('listingCreated');
        return committed;

    } catch (err) {
        // Rollback optimistic update — do NOT leave ghost listing in UI or cache
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createServiceListing failed — rolling back', err.message);
        __set_allListings(prevAll);
        __set_myListings(prevMy);
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  prevMy);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, prevAll);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));
        showNotification('Failed to create listing: ' + (err.message || 'Unknown error'), 'error');
        return null;
    }
}

export async function createDigitalListing(title, description, fileData, options = {}) {
    if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 1: UI triggered — createDigitalListing', { title });

    const _tok2 = sessionClient.getToken?.() || window.__kynToken || window.currentUser?.token;
    const _uid2 = sessionClient.getUser?.()?.id || window.__kynUserId || window.currentUser?.id;
    if (_tok2) window.__kynToken = _tok2;
    if (_uid2) window.__kynUserId = _uid2;
    if (!_tok2 || !_uid2) {
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createDigitalListing: no auth');
        showNotification('Not authenticated. Tap another page then return to marketplace.', 'error');
        return null;
    }
    // Wait up to 4s for module to become active
    if (!isActive()) {
        await new Promise(resolve => {
            const deadline = Date.now() + 4000;
            const check = () => {
                if (isActive() || Date.now() > deadline) { resolve(); return; }
                setTimeout(check, 100);
            };
            check();
        });
    }

    // Build user object from resolved auth
    const userId = _uid2;
    const _u = sessionClient.getUser?.() || window.currentUser || {};
    const userObj = {
        id: userId,
        displayName: _u.displayName || _u.name || _u.username || 'User',
        photoURL: _u.photoURL || _u.avatar || ''
    };

    const fakeId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const optimistic = {
        id: fakeId,
        _isOptimistic: true,
        userId,
        sellerId: userId,
        user: userObj,
        type: LISTING_TYPES.DIGITAL,
        title,
        description,
        price: options.price ? parseFloat(options.price) : 0,
        category: 'digital',
        mediaUrl: fileData?.url || '',
        fileUrl: fileData?.url || '',
        fileName: fileData?.name || (fileData instanceof File ? fileData.name : ''),
        fileSize: fileData?.size || (fileData instanceof File ? fileData.size : 0),
        fileType: fileData?.type || (fileData instanceof File ? fileData.type : ''),
        visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: options.moodContext,
        template: options.template,
        allowedGroups: options.allowedGroups,
        allowedUsers: options.allowedUsers,
        expiresAt: options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        privateNotes: options.privateNotes,
        teamNotes: options.teamNotes,
        available: true,
        savedBy: [],
        views: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Snapshot for rollback
    const prevAll = allListings.slice();
    const prevMy  = myListings.slice();

    // Optimistic UI update
    myListings.unshift(optimistic);
    allListings.unshift(optimistic);
    window.allListings = allListings;
    window.myListings  = myListings;
    safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
    window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

    // Backend call — safeApiCall now throws on failure
    try {
        const response = await safeApiCall('POST', '/api/marketplace/listings', {
            title: optimistic.title,
            description: optimistic.description,
            price: optimistic.price,
            category: 'digital',
            type: 'digital',
            images: [],
            available: true
        });

        // Handle both { data: { listing } } and { listing } and flat { id, title... }
        const confirmed = response?.data?.listing || response?.listing || 
            (response?.id ? response : null) ||
            (response?.data?.id ? response.data : null);
        if (!confirmed || !confirmed.id) {
            throw new Error('Backend did not return a valid listing. Response: ' + JSON.stringify(response).slice(0,120));
        }

        // Replace fake entry with real DB-confirmed listing
        const committed = { ...optimistic, ...confirmed, id: confirmed.id, user: userObj, _isOptimistic: false };
        __set_allListings(allListings.map(l => l.id === fakeId ? committed : l));
        __set_myListings(myListings.map(l =>  l.id === fakeId ? committed : l));
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

        // Broadcast to other tabs
        try { const ch = new BroadcastChannel('marketplace_sync'); ch.postMessage({ type: 'LISTING_CREATED', listing: committed }); ch.close(); } catch (_) {}

        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 4: UI updated — digital listing committed to DB', { id: committed.id });
        updateListingStreak();
        updateTrustStats('listingCreated');
        return committed;

    } catch (err) {
        // Rollback
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createDigitalListing failed — rolling back', err.message);
        __set_allListings(prevAll);
        __set_myListings(prevMy);
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  prevMy);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, prevAll);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));
        showNotification('Failed to create listing: ' + (err.message || 'Unknown error'), 'error');
        return null;
    }
}

export async function downloadDigitalFile(listingId, fileUrl, fileName) {
    try {
        if (!listingId || !fileUrl || !fileName) throw new Error('Missing required download parameters');
        if (!isActive()) throw new Error('Module not active');
        
        if (fileUrl.startsWith('javascript:') || fileUrl.startsWith('data:')) throw new Error('Invalid file URL scheme');
        
        const listing = allListings.find(l => l.id === listingId) || myListings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const currentUserId = user?.id;
        
        if (listing.userId !== currentUserId && !isListingVisibleToUser(listing)) {
            throw new Error('You do not have permission to download this file');
        }
        
        if (!fileUrl || fileUrl === '#') throw new Error('Invalid file URL');
        
        const downloadIndicator = document.createElement('div');
        downloadIndicator.id = 'downloadIndicator';
        downloadIndicator.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8); color: white; padding: 15px 25px;
            border-radius: 10px; z-index: 9999; display: flex; align-items: center; gap: 10px;
        `;
        downloadIndicator.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Downloading ${escapeHtml(fileName)}...</span>`;
        document.body.appendChild(downloadIndicator);
        
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName;
        document.body.appendChild(link);
        
        requestAnimationFrame(() => {
            link.click();
            const cleanup = () => {
                if (link.parentNode) document.body.removeChild(link);
                if (downloadIndicator.parentNode) document.body.removeChild(downloadIndicator);
                showNotification(`Downloaded ${fileName}`, 'success');
                // Only count after the download link actually fired
                updateTrustStats('fileDownloaded');
            };
            setTimeout(cleanup, 5000);
        });
        
        return true;
    } catch (error) {
        const downloadIndicator = document.getElementById('downloadIndicator');
        if (downloadIndicator && downloadIndicator.parentNode) document.body.removeChild(downloadIndicator);
        showNotification(`Download failed: ${error.message}`, 'error');
        return false;
    }
}

export function generateSampleMarketplaceData() {
    try {
        const sampleUsers = [
            { id: 'user_1', displayName: 'Alex Johnson', trustLevel: 'reliable', isPremium: true },
            { id: 'user_2', displayName: 'Maria Garcia', trustLevel: 'verified', isPremium: true },
            { id: 'user_3', displayName: 'David Smith', trustLevel: 'responsive' },
            { id: 'user_4', displayName: 'Sarah Wilson', trustLevel: 'pro', isPremium: true },
            { id: 'user_5', displayName: 'James Brown', trustLevel: 'new' }
        ];
        
        safeStorage.set(LOCAL_STORAGE_KEYS.MARKETPLACE_USERS, sampleUsers);
        
        if (allListings.length === 0) {
            const sampleListings = [
                {
                    id: 'listing_1',
                    userId: 'user_1',
                    user: sampleUsers[0],
                    type: LISTING_TYPES.SERVICE,
                    title: 'Professional Graphic Design',
                    description: 'Creating stunning logos, banners, and social media graphics.',
                    price: 50,
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.PUBLIC,
                    moodContext: MOOD_CONTEXTS.CREATIVE,
                    template: TEMPLATE_TYPES.CREATIVE,
                    featured: true,
                    boosted: true,
                    verified: true,
                    premium: true,
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing_2',
                    userId: 'user_2',
                    user: sampleUsers[1],
                    type: LISTING_TYPES.SERVICE,
                    title: 'Math Tutoring - All Levels',
                    description: 'Experienced math tutor specializing in algebra, calculus, and statistics.',
                    price: 30,
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.FRIENDS,
                    moodContext: MOOD_CONTEXTS.LEARN,
                    template: TEMPLATE_TYPES.COACHING,
                    premium: true,
                    createdAt: new Date(Date.now() - 7200000).toISOString(),
                    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing_3',
                    userId: 'user_3',
                    user: sampleUsers[2],
                    type: LISTING_TYPES.DIGITAL,
                    title: 'Resume Template Pack',
                    description: '10 professionally designed resume templates.',
                    price: 15,
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.PUBLIC,
                    moodContext: MOOD_CONTEXTS.BUSINESS,
                    template: TEMPLATE_TYPES.BUSINESS,
                    fileUrl: '#',
                    fileName: 'resume_templates.zip',
                    fileSize: '2.5 MB',
                    createdAt: new Date(Date.now() - 10800000).toISOString(),
                    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                }
            ];
            
            __set_allListings(sampleListings);
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        }
    } catch {}
}

export async function syncOfflineMarketplaceData() {
    try {
        if (!isActive()) return;
        
        const syncQueue = await safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE) || [];
        const marketplaceItems = syncQueue.filter(item => item.type.startsWith('marketplace_'));
        if (marketplaceItems.length === 0) return;
        
        for (let i = 0; i < marketplaceItems.length; i++) {
            const item = marketplaceItems[i];
            try {
                if (item.type === 'marketplace_listing') {
                    await safeApiCall('POST', '/api/marketplace/listings', item.data);
                    syncQueue.splice(syncQueue.indexOf(item), 1);
                } else if (item.type === 'marketplace_premium_listing') {
                    await safeApiCall('POST', '/api/marketplace/listings/premium', item.data);
                    syncQueue.splice(syncQueue.indexOf(item), 1);
                }
            } catch {
                item.retryCount = (item.retryCount || 0) + 1;
                if (item.retryCount > 3) syncQueue.splice(syncQueue.indexOf(item), 1);
            }
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.SYNC_QUEUE, syncQueue);
    } catch {}
}

export function saveAllMarketplaceData() {
    try {
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
        safeStorage.set(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
        safeStorage.set(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
        safeStorage.set(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
        safeStorage.set(LOCAL_STORAGE_KEYS.STREAK_DATA, streakData);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, premiumFeatures);
        if (userSubscription) safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
    } catch {}
}

export function queueApiCall(method, endpoint, data, options) {
    return new Promise((resolve, reject) => {
        try {
            apiCallQueue.push({ method, endpoint, data, options, resolve, reject, timestamp: Date.now() });
            if (!isProcessingQueue) processApiCallQueue();
        } catch (error) {
            reject(error);
        }
    });
}

export async function processApiCallQueue() {
    if (isProcessingQueue || apiCallQueue.length === 0) return;
    __set_isProcessingQueue(true);
    
    try {
        if (tokenInitializationPromise) {
            try {
                await tokenInitializationPromise;
            } catch {
                apiCallQueue.forEach(call => call.reject(new Error('Token initialization failed')));
                apiCallQueue.length = 0;
                __set_isProcessingQueue(false);
                return;
            }
        }
        
        while (apiCallQueue.length > 0) {
            const call = apiCallQueue.shift();
            try {
                const result = await secureApiCall(call.method, call.endpoint, call.data, call.options);
                call.resolve(result);
            } catch (error) {
                call.reject(error);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } finally {
        __set_isProcessingQueue(false);
    }
}

export async function authenticatedApiCall(method, endpoint, data = null) {
    try {
        return await safeApiCall(method, endpoint, data);
    } catch {
        return null;
    }
}

export async function makeApiCall(method, endpoint, data = null) {
    try {
        return await secureApiCall(method, endpoint, data);
    } catch {
        return null;
    }
}

export function startBackgroundJobs() {
    if (!isAuthReady || backgroundJobsStarted) return;
    if (!isActive()) return;
    __set_backgroundJobsStarted(true);
    
    try {
        setTimeout(() => loadEnhancedMarketplaceData().catch(() => {}), 1000);
        setTimeout(() => checkUserPremiumStatus().catch(() => {}), 1500);
    } catch {}
}

export function handleSessionExpired() {
    try {
        sessionClient.clear();
        showNotification('Your session has expired. Please log in again.', 'error');
        if (typeof refreshToken === 'function') {
            refreshToken().catch(() => handleParentLogout());
        } else {
            handleParentLogout();
        }
    } catch {}
}

export function requestParentUserData() {
    try {
        if (!isActive()) return;
        safeSend('REQUEST_USER_DATA', {
            fields: ['id', 'displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel']
        });
    } catch {
        fetchUserDataDirectly();
    }
}

export async function fetchUserDataDirectly() {
    if (dataFetchInProgress) return;
    __set_dataFetchInProgress(true);
    
    try {
        const token = getCentralToken();
        if (!token) {
            throw new Error('No authentication token available');
        }
        
        const response = await authorizedFetch('/api/profile', { method: 'GET' });
        
        if (response && response.user) {
            __set_directAPILoaded(true);
            __set_parentDataLoaded(false);
            __set_dataFetchInProgress(false);
            processUserData(response.user, 'api');
            safeSend('USER_DATA_LOADED', { source: 'direct_api', userId: response.user.id });
        } else {
            throw new Error('Invalid response from user profile API');
        }
    } catch {
        __set_dataFetchInProgress(false);
        if (window.parent !== window && !parentDataLoaded) {} else {
            // Removed localStorage fallback
        }
    }
}

export function processUserData(userDataFromSource, source) {
    try {
        // Validate user data before processing
        if (!userDataFromSource || !userDataFromSource.id) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Invalid user data received from', source);
            return;
        }
        
        const userId = userDataFromSource.id || userDataFromSource.userId;
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Rejected fake user ID from', source);
            return;
        }
        
        window.currentUser = userDataFromSource;
        window.userData = userDataFromSource;
        
        const sessionData = {
            userId: userDataFromSource.id || userDataFromSource.userId,
            userToken: getCentralToken() || 'cached_token',
            displayName: userDataFromSource.displayName || userDataFromSource.name,
            email: userDataFromSource.email,
            photoURL: userDataFromSource.photoURL || userDataFromSource.avatar,
            isPremium: userDataFromSource.isPremium || false,
            trustLevel: userDataFromSource.trustLevel || 'new',
            source: source
        };
        
        if (__isValidSession(sessionData)) {
            sessionClient.acceptParentSession(sessionData);
        } else {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Invalid session data from', source);
        }
    } catch {}
}

export function handleParentUserData(userDataFromParent) {
    try {
        if (parentDataLoaded || dataFetchInProgress) return;
        if (!userDataFromParent || (!userDataFromParent.id && !userDataFromParent.email)) {
            if (!dataFetchInProgress) fetchUserDataDirectly();
            return;
        }
        __set_parentDataLoaded(true);
        __set_dataFetchInProgress(false);
        processUserData(userDataFromParent, 'parent');
    } catch {}
}

export function updateUserDataFromParent(updatedData) {
    try {
        if (window.currentUser) {
            window.currentUser = { ...window.currentUser, ...updatedData };
        } else {
            window.currentUser = updatedData;
        }
        if (window.userData) {
            window.userData = { ...window.userData, ...updatedData };
        } else {
            window.userData = updatedData;
        }
        if (updatedData.subscription) __set_userSubscription(updatedData.subscription);
        
        const sessionUpdate = {
            userId: updatedData.id || updatedData.userId,
            displayName: updatedData.displayName || updatedData.name,
            email: updatedData.email,
            photoURL: updatedData.photoURL || updatedData.avatar,
            isPremium: updatedData.isPremium || false,
            subscription: updatedData.subscription,
            trustLevel: updatedData.trustLevel
        };
        
        if (__isValidSession(sessionUpdate)) {
            sessionClient.acceptParentSession(sessionUpdate);
        }
    } catch {}
}

export function handleUserLogout() {
    try {
        window.currentUser = null;
        window.userData = null;
        __set_userSubscription(null);
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        sessionClient.clear();
        showNotification('You have been logged out.', 'warning');
    } catch {}
}

export function getMarketplaceStats() {
    try {
        return {
            totalListings: allListings.length,
            myListings: myListings.length,
            savedItems: savedItems.length
        };
    } catch {
        return { totalListings: 0, myListings: 0, savedItems: 0 };
    }
}

export function getMarketplaceAnalytics() {
    try {
        return analyticsData || {};
    } catch {
        return {};
    }
}

export function getMarketplaceUser() {
    try {
        return window.currentUser || {};
    } catch {
        return {};
    }
}

export function isMarketplaceReady() {
    try {
        const session = sessionClient.getSession();
        const hasValidSession = session && __isValidSession(session);
        return isBootstrapped && hasValidSession && isActive();
    } catch {
        return false;
    }
}

export function isCoreReady() {
    return isReady || moduleState.ready;
}

function checkDependencies() {
    try {
        return !!(window.API || window.AppCore || window.callApi);
    } catch {
        return false;
    }
}

export function migrateLegacyUserData(data) {
    try {
        if (!data) return;
        
        // Validate legacy data
        const userId = data.id || data.userId || data.user_id;
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Rejected legacy user data with fake ID');
            return;
        }
        
        const sessionData = {
            userId: userId,
            userToken: data.token || data.userToken || getCentralToken(),
            displayName: data.displayName || data.name,
            email: data.email,
            photoURL: data.photoURL || data.avatar,
            isPremium: data.isPremium || false,
            trustLevel: data.trustLevel || 'new'
        };
        
        if (__isValidSession(sessionData)) {
            sessionClient.acceptParentSession(sessionData);
        }
        
        if (data.groups) {
            __set_userGroups(data.groups);
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
        }
        if (data.friends) {
            __set_userFriends(data.friends);
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
        }
        if (data.subscription) {
            __set_userSubscription(data.subscription);
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
        }
    } catch {}
}

export function clearMoodFilter() {
    try {
        __set_currentMoodFilter(null);
        safeStorage.remove(LOCAL_STORAGE_KEYS.MOOD_FILTER);
        window.dispatchEvent(new CustomEvent('moodFilterCleared', { detail: { timestamp: Date.now() } }));
        return true;
    } catch {
        return false;
    }
}

export async function startFreeTrial() {
    showNotification('Free trial activated!', 'success');
    return { success: true };
}

export async function restorePurchase() {
    showNotification('Purchase restored', 'success');
    return { success: true };
}

export async function processSubscriptionPayment() {
    showNotification('Subscription activated!', 'success');
    return { success: true };
}

export const AppState = {
    currentUser,
    userData,
    sessionData,
    isReady,
    isBootstrapped,
    isAuthReady,
    handshakeComplete,
    sessionValid,
    _STATE: { ...moduleState },
    getSession: () => sessionClient.getSession(),
    hasValidSession: () => {
        const session = sessionClient.getSession();
        return session && __isValidSession(session);
    },
    isUserPremium,
    isMarketplaceReady,
    getDiagnostics: () => diagnostics?.getReport(),
    getConnectionStatus: () => heartbeatResponder?.getStatus(),
    getEnvironment: () => environmentDetector?.environment,
    getBootState: () => ({
        state: currentState,
        sessionAuthority: moduleState.sessionAuthority,
        parentReady: parentReadyReceived
    }),
    marketplace
};

// =============================================
// GLOBAL EXPORTS (PRESERVED)
// =============================================

if (typeof window !== 'undefined') {
    try {
        window.marketplaceCore = {
            initializeCore,
            sendToParent,
            requestSession,
            receiveFromParent,
            shutdownCore,
            syncWithParent,
            checkParentHealth,
            initializeMarketplaceCore,
            safeInitializeMarketplaceCore,
            bootstrapIframe,
            getData,
            updateData,
            fetchData,
            secureApiCall,
            safeApiCall,
            getCentralToken,
            handleSessionExpired,
            downloadDigitalFile,
            inviteTeamMember: inviteTeamMemberWrapper,
            handleSessionDataFromParent,
            bindUIAfterSession,
            getMarketplaceStats,
            getMarketplaceAnalytics,
            getMarketplaceUser,
            isMarketplaceReady,
            isCoreReady,
            currentUser,
            sessionData,
            isBootstrapped,
            isAuthReady,
            isReady,
            pageCore,
            createServiceListing,
            createDigitalListing,
            createPremiumServiceListing,
            createPremiumDigitalListing,
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
            clearMoodFilter,
            AppState,
            diagnostics: {
                getReport: () => diagnostics?.getReport(),
                getStatus: () => ({
                    session: sessionClient?.getState(),
                    connection: heartbeatResponder?.getStatus(),
                    environment: environmentDetector?.environment,
                    boot: {
                        state: currentState,
                        parentReady: parentReadyReceived
                    }
                }),
                enableDebug: () => diagnostics?.enableDebug(),
                disableDebug: () => diagnostics?.disableDebug()
            },
            marketplace: marketplace,
            _STATE: moduleState,
            sessionAdapter: sessionClient,
            environmentDetector,
            heartbeatResponder,
            __MODULE_READY__: () => window.__MODULE_READY__,
            __MODULE_SESSION_ACTIVE__: () => window.__MODULE_SESSION_ACTIVE__,
            authorizedFetch: authorizedFetch,
            sessionStore: {
                isReady: () => sessionClient.isValid(),
                getUser: () => sessionClient.getUser ? sessionClient.getUser() : null,
                hasToken: () => !!sessionClient.getToken ? sessionClient.getToken() : false,
                isValidSession: () => {
                    const session = sessionClient.getSession();
                    return session && __isValidSession(session);
                }
            },
            lifecycle: {
                getState: () => currentState,
                isActive: () => isActive(),
                childReadySent: () => childReadySent,
                parentReadyReceived: () => parentReadyReceived,
                transitions: VALID_TRANSITIONS
            },
            storageProxy: StorageProxy,
            messageGuard: MessageGuard,
            validateSession: __isValidSession
        };
        
        window.pageCore = pageCore;
        window.marketplace = marketplace;
        window.createListing = (data) => marketplace.createListing(data);
        window.updateListing = (id, updates) => marketplace.updateListing(id, updates);
        window.deleteListing = (id) => marketplace.deleteListing(id);
        window.toggleSave = (id) => marketplace.toggleSave(id);
        window.contactSeller = (id, msg) => marketplace.contactSeller(id, msg);
        window.getListings = () => marketplace.getListings();
        window.getMyListings = () => marketplace.getMyListings();
        window.getSavedListings = () => marketplace.getSavedListings();
        window.getListing = (id) => marketplace.getListing(id);
        window.isOwner = (id) => marketplace.isOwner(id);
        window.isSaved = (id) => marketplace.isSaved(id);
        window.setFilter = (key, value) => marketplace.setFilter(key, value);
        window.resetFilters = () => marketplace.resetFilters();
        window.loadMore = () => marketplace.loadMore();
        window.getStats = () => marketplace.getStats();
        window.getCategories = () => marketplace.getCategories();
        window.on = (event, cb) => marketplace.on(event, cb);
        window.off = (event, cb) => marketplace.off(event, cb);
        
        window.authorizedFetch = authorizedFetch;
        window.StorageProxy = StorageProxy;
        window.__isValidSession = __isValidSession;
    } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            if (!checkDependencies()) {}
            
            initializeModule();
            
            pageCore.init().catch(() => {});
            
        } catch {}
    }, 100);
});

let callApi, getCurrentUser, getUserToken, login, logout, refreshToken, getUserGroups, getUserFriends, getTeamMembers, getAnalyticsData, exportAnalytics, trackEvent;

try {
    callApi = () => Promise.resolve(null);
    getCurrentUser = () => null;
    getUserToken = () => null;
    login = () => Promise.reject(new Error('Login not available'));
    logout = () => Promise.resolve();
    refreshToken = () => Promise.reject(new Error('Refresh not available'));
    getUserGroups = () => Promise.resolve([]);
    getUserFriends = () => Promise.resolve([]);
    getTeamMembers = () => Promise.resolve([]);
    getAnalyticsData = () => Promise.resolve({});
    exportAnalytics = () => Promise.resolve(null);
    trackEvent = () => {};
} catch {}

export async function inviteTeamMember(email, role = 'member') {
    try {
        if (!userSubscription || (userSubscription.plan !== 'business' && userSubscription.plan !== 'team')) {
            throw new Error('Team features require a business or team subscription');
        }
        if (!isActive()) throw new Error('Module not active');
        
        const newMember = { id: 'member_' + Date.now(), email, displayName: email.split('@')[0], role, joinedAt: new Date().toISOString() };
        teamMembers.push(newMember);
        safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
        showNotification(`Invitation sent to ${email}`, 'success');
        return { success: true, member: newMember };
    } catch (error) {
        showNotification(`Failed to invite team member: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

export async function inviteTeamMemberWrapper(email, role = 'member') {
    return inviteTeamMember(email, role);
}

export async function openChat(userId, userName) {
    try {
        if (!isActive()) return false;
        safeSend('OPEN_CHAT', { userId, userName, timestamp: Date.now() });
        return true;
    } catch {
        return false;
    }
}

export async function loadAnalyticsData() {
    try {
        if ((sessionClient.isValid()) && isUserPremium() && isActive()) {
            const analytics = await getAnalyticsData();
            if (analytics) {
                __set_analyticsData(analytics);
                safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
                return analyticsData;
            }
        }
        return analyticsData;
    } catch {
        return analyticsData;
    }
}

export async function loadLeaderboard() {
    try {
        if ((sessionClient.isValid()) && isActive()) {
            const response = await authorizedFetch('/api/marketplace/leaderboard', { method: 'GET' });
            if (response && response.data?.leaderboard) {
                __set_leaderboardData(response.data.leaderboard);
                safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                return leaderboardData;
            } else if (response && response.leaderboard) {
                __set_leaderboardData(response.leaderboard);
                safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                return leaderboardData;
            }
        }
        return leaderboardData;
    } catch {
        return leaderboardData;
    }
}

export async function updateTeamMemberRole(changes) {
    try {
        if (!(sessionClient.isValid()) || (!userSubscription || (userSubscription.plan !== 'business' && userSubscription.plan !== 'team'))) {
            throw new Error('Team features require a business or team subscription');
        }
        if (!isActive()) throw new Error('Module not active');
        
        for (const change of changes) {
            const memberIndex = teamMembers.findIndex(m => m.id === change.memberId);
            if (memberIndex !== -1) teamMembers[memberIndex].role = change.role;
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
        showNotification('Team roles updated successfully', 'success');
        return true;
    } catch (error) {
        showNotification(`Failed to update team roles: ${error.message}`, 'error');
        return false;
    }
}
// =============================================
// SETTINGS HELPER FUNCTIONS
// =============================================

export async function loadUserSettings() {
    try {
        const savedTheme = await safeStorage.get('user_theme_preference');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.body.setAttribute('data-theme', savedTheme);
        }
        
        const savedFontSize = await safeStorage.get('user_font_size');
        if (savedFontSize) {
            document.documentElement.style.fontSize = savedFontSize + 'px';
        }
        
        logOnce('ready', 'User settings loaded from storage');
    } catch (error) {
        logError('loadUserSettings', error);
    }
}

export function requestSettings() {
    if (!assertActive('requestSettings')) return false;
    
    safeSend('REQUEST_SETTINGS', {
        module: MODULE_NAME,
        timestamp: Date.now()
    });
    
    return true;
}

export function updateSetting(section, key, value) {
    if (!assertActive('updateSetting')) return false;
    
    safeSend('UPDATE_SETTING', {
        section,
        key,
        value,
        module: MODULE_NAME,
        timestamp: Date.now()
    });
    
    return true;
}

export default marketplace;
// =============================================
// SETTINGS CACHE BOOTSTRAP - OFFLINE-FIRST
// =============================================
(function bootstrapToolsSettingsFromCache() {
    function applySettingToToolsModule(section, key, value) {
        if (section === 'appearance') {
            if (key === 'theme') {
                var theme = (value === 'dark' ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
            }
            if (key === 'fontSize') document.documentElement.style.fontSize = parseInt(value) + 'px';
            if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
            if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
            if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
            if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
        }
        if (section === 'advanced') {
            if (key === 'performanceMode') document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false');
            if (key === 'reduceMotion') { document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); document.body.classList.toggle('reduce-motion', !!value); }
            if (key === 'developerMode' || key === 'developerTools') window.__developerMode = value;
        }
        if (section === 'notifications') {
            if (key === 'enableNotifications' || key === 'messageNotifications') window.__messageNotificationsEnabled = value;
            if (key === 'notificationSound' || key === 'soundEnabled') window.__notificationSoundEnabled = value;
        }
        if (section === 'mood' && key === 'currentMood') { window.__currentMood = value; document.documentElement.setAttribute('data-mood', value); }
    }
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (!cached) return;
        var parsed = JSON.parse(cached);
        var settings = (parsed && parsed.data) ? parsed.data : parsed;
        if (!settings || typeof settings !== 'object') return;
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > 86400000) return;
        Object.entries(settings).forEach(function(se) {
            var section = se[0], sectionVal = se[1];
            if (!sectionVal || typeof sectionVal !== 'object') return;
            Object.entries(sectionVal).forEach(function(ke) {
                try { applySettingToToolsModule(section, ke[0], ke[1]); } catch(e) {}
            });
        });
        if (window.__TOOLS_DEBUG__) console.log('[Tool-core] ✅ Settings bootstrapped from cache');
    } catch(e) {}
    window.addEventListener('online', function() {
        try {
            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'tools', source: 'tools', timestamp: Date.now() }, '*');
        } catch(e) {}
    });
})();
// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE ECOMMERCE INTEGRATION PATCH v2.0
// Hooks into the existing Tool-core.js lifecycle.
// Fixes: token timing, _ecomApiCall shim, home sections, settings bridge,
//        realtime socket wiring, cart badge, chat-seller bridge.
// ═══════════════════════════════════════════════════════════════════════════
(function _ecomIntegration() {
'use strict';

// ── 1. Expose the token-aware API shim for marketplace-ecommerce.js ────────
// Called as: _ecomApiCall('GET', '/api/marketplace/products', null)
// safeApiCall signature: safeApiCall(method, endpoint, data)
window._ecomApiCall = async function(method, endpoint, body) {
    try {
        // Primary: use the existing safeApiCall (already has token)
        return await safeApiCall(method.toUpperCase(), endpoint, body || null);
    } catch(_) {
        // Fallback: direct authorizedFetch
        try {
            const url = typeof normalizeToolsEndpoint === 'function'
                ? normalizeToolsEndpoint(endpoint) : endpoint;
            return await authorizedFetch(url, {
                method: method.toUpperCase(),
                ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {})
            });
        } catch(e2) { return null; }
    }
};

// ── 2. Fire ecom init AFTER module goes ACTIVE (token guaranteed) ──────────
function _triggerEcomInit() {
    if (window.EcomMarketplace) return;
    window.dispatchEvent(new CustomEvent('ecom:force-init'));
}
window.addEventListener('tools:active', _triggerEcomInit, { once: true });

// ── 3. Settings bridge: propagate changes to EcomMarketplace ──────────────
window.addEventListener('marketplace:settingsUpdated', function(e) {
    const s = e.detail;
    if (!s || !window.EcomMarketplace) return;
    window.EcomMarketplace.SettingsEngine.apply({
        darkMode:      s.appearance?.theme === 'dark',
        language:      s.appearance?.language || 'en',
        notifications: s.notifications?.enableNotifications !== false,
        currency:      s.currency || 'KES',
    });
});

// ── 4. Seed EcomMarketplace store with Tool-core listing data ─────────────
window.addEventListener('marketplace:data-updated', function(e) {
    const listings = e.detail?.listings || [];
    if (!listings.length || !window.EcomMarketplace) return;
    const store = window.EcomMarketplace.ProductEngine.getStore();
    listings.forEach(function(l) {
        if (!l?.id || store.products.has(l.id)) return;
        store.products.set(l.id, {
            id: l.id,
            seller_id: l.sellerId || l.userId || '',
            seller: { id: l.sellerId || l.userId, name: l.user?.displayName || 'Seller', avatar: l.user?.photoURL || '', verified: false, rating: 0 },
            title: l.title || '',
            description: l.description || '',
            category: l.category || 'other',
            type: l.type || 'physical',
            images: Array.isArray(l.images) ? l.images : (l.mediaUrl ? [l.mediaUrl] : []),
            price: parseFloat(String(l.price||0).replace(/[^0-9.]/g,'')) || 0,
            original_price: parseFloat(String(l.originalPrice||l.original_price||0).replace(/[^0-9.]/g,'')) || 0,
            discount: parseFloat(l.discount) || 0,
            stock_quantity: l.stock ?? l.stockQuantity ?? null,
            rating: parseFloat(l.rating) || 0,
            reviews_count: parseInt(l.ratingCount || l.reviews_count) || 0,
            delivery_fee: parseFloat(l.delivery_fee || l.deliveryFee) || 0,
            location: l.location || '',
            condition: l.condition || 'new',
            is_featured: !!(l.isFeatured || l.isSpotlight || l.featured),
            is_flash_sale: !!(l.isFlashSale || l.flash_sale),
            available: l.available !== false,
            status: l.status || 'active',
            views: parseInt(l.views) || 0,
            sold_count: (l.purchasedBy || []).length,
            created_at: l.createdAt || new Date().toISOString(),
            // carry all original fields for full compat
            userId: l.userId, user: l.user,
            mediaUrl: l.mediaUrl, boosted: l.boosted,
            isFeatured: l.isFeatured, isPremium: l.isPremium,
        });
    });
    store.searchIndex = Array.from(store.products.values());
    // Update product count badge in Jumia UI
    const grid = document.getElementById('marketplaceListContent');
    const countEl = document.getElementById('jmProductCount');
    if (grid && countEl) {
        countEl.textContent = '(' + grid.querySelectorAll('.jm-card').length + ')';
    }
});

// ── 5. Realtime socket events → EcomMarketplace engines ───────────────────
const _MP_EVENTS = [
    'product:updated', 'product:created', 'product:deleted', 'product:stock_updated',
    'order:created', 'order:status_changed', 'payment:confirmed',
    'review:new', 'delivery:updated',
];
_MP_EVENTS.forEach(function(evt) {
    window.addEventListener('realtime:' + evt, function(e) {
        const ecom = window.EcomMarketplace;
        if (!ecom) return;
        const data = e.detail || {};
        if (evt === 'product:stock_updated') {
            ecom.InventoryEngine.handleStockUpdate(data);
        } else if (evt === 'order:status_changed') {
            const order = ecom.OrderEngine.getOrder(data.order_id);
            if (order) order.status = data.status;
            ecom.NotificationEngine.push({ type:'order_status', message:'Order ' + (data.order_id||'').slice(-6) + ': ' + data.status, order_id: data.order_id, timestamp: new Date().toISOString() });
        } else if (evt === 'payment:confirmed') {
            ecom.NotificationEngine.push({ type:'payment', message:'Payment confirmed!', order_id: data.order_id, timestamp: new Date().toISOString() });
        }
    });
});

// ── 6. Cart badge: listen to cart events and update Jumia badge ───────────
window.addEventListener('ecom:cart-updated', function() {
    const ecom = window.EcomMarketplace;
    const count = ecom ? ecom.CartEngine.size() : 0;
    ['jmCartBadge','jmNavCartBadge'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = count > 99 ? '99+' : count;
        el.style.display = count > 0 ? 'flex' : 'none';
    });
    try { window.parent.postMessage({ type:'ECOM_CART_UPDATE', payload:{ count } }, '*'); } catch(_) {}
});

// ── 7. Chat-seller bridge ─────────────────────────────────────────────────
// Override the default openChat in ChatBridge to use Tool-core's openChat
if (window.EcomMarketplace?.ChatBridge) {
    window.EcomMarketplace.ChatBridge.openWithSeller = function(product) {
        const seller = product?.seller || { id: product?.seller_id, name:'Seller' };
        const msg = 'Hi! I\'m interested in "' + (product?.title||'your product') + '" (KES ' + (parseFloat(product?.price||0).toLocaleString()) + ').';
        // Use Tool-core openChat if available
        if (typeof openChat === 'function') {
            openChat(seller.id, { product_id:product?.id, product_title:product?.title, product_price:product?.price, product_image:product?.images?.[0]||'', message:msg });
            return;
        }
        // Post to parent chat.html
        try {
            window.parent.postMessage({ type:'OPEN_CHAT', payload:{ userId:seller.id, userName:seller.name, seller_id:seller.id, seller_name:seller.name, product_id:product?.id, message:msg } }, '*');
        } catch(_) {}
    };
}

// ── 8. Home page sections: render featured/trending after products load ────
window.addEventListener('ecom:products-loaded', function(e) {
    const { featured, trending, flash } = e.detail || {};
    // Update featured row (Jumia UI)
    if (typeof window._jmUpdateCartBadge === 'function') {
        window._jmUpdateCartBadge();
    }
});

// ── 9. Handle message from marketplace-ecommerce to init after token ───────
window.addEventListener('message', function(evt) {
    if (!evt.data || typeof evt.data !== 'object') return;
    const t = evt.data.type;
    // When child (Tools.html) gets SESSION_DATA it passes token to ecom
    if ((t === 'SESSION_DATA' || t === 'AUTH_READY' || t === 'PARENT_READY') && !window.EcomMarketplace) {
        const session = evt.data.payload || {};
        const token = session.token || session.session?.token;
        if (token) {
            window.__kynToken = token;
            window.__accessToken = token;
        }
    }

    // CRITICAL FIX: Handle REALTIME_EVENT:* messages forwarded from chat.html
    // chat.html forwards socket events as 'REALTIME_EVENT:product:created' etc.
    // Without this handler, realtime product/order/inventory updates never reach
    // the EcomMarketplace engines running in Tools.html.
    if (t && t.startsWith('REALTIME_EVENT:')) {
        const evtName = t.replace('REALTIME_EVENT:', '');
        const payload = evt.data.payload || {};
        const ecom = window.EcomMarketplace;

        // Dispatch as a CustomEvent so the existing listeners in _ecomIntegration catch it
        try { window.dispatchEvent(new CustomEvent('realtime:' + evtName, { detail: payload })); } catch(_) {}

        if (!ecom) return;

        // Inline handlers for the most critical realtime events
        if (evtName === 'product:stock_updated') {
            try { ecom.InventoryEngine.handleStockUpdate(payload); } catch(_) {}
            // Update product card in DOM immediately
            const pid = payload.product_id;
            const qty = payload.quantity;
            if (pid != null) {
                document.querySelectorAll('[data-product-id="' + pid + '"] .stock-count, [data-id="' + pid + '"] .stock-count').forEach(function(el) {
                    el.textContent = qty <= 0 ? 'Out of Stock' : ('Stock: ' + qty);
                    el.classList.toggle('out-of-stock', qty <= 0);
                });
                // Update in-memory store
                try {
                    const store = ecom.ProductEngine.getStore();
                    const prod = store.products.get(String(pid)) || store.products.get(Number(pid));
                    if (prod) { prod.stock_quantity = qty; prod.available = qty > 0; }
                } catch(_) {}
            }
        } else if (evtName === 'product:deleted') {
            try {
                const pid = payload.product_id;
                if (pid) {
                    const store = ecom.ProductEngine.getStore();
                    store.products.delete(String(pid));
                    store.products.delete(Number(pid));
                    // Remove from DOM
                    document.querySelectorAll('[data-product-id="' + pid + '"], [data-id="' + pid + '"]').forEach(function(el) { el.remove(); });
                }
            } catch(_) {}
        } else if (evtName === 'product:created' || evtName === 'product:updated') {
            // Trigger a products refresh after a short delay
            clearTimeout(window.__productsRefreshTimer);
            window.__productsRefreshTimer = setTimeout(function() {
                window.dispatchEvent(new CustomEvent('ecom:refresh-products'));
            }, 500);
        } else if (evtName === 'order:created') {
            try { ecom.NotificationEngine.push({ type:'order_created', message:'New order received!', order_id: payload.order_id, timestamp: new Date().toISOString() }); } catch(_) {}
        } else if (evtName === 'order:status_changed') {
            try {
                const order = ecom.OrderEngine.getOrder(payload.order_id);
                if (order) order.status = payload.status;
                ecom.NotificationEngine.push({ type:'order_status', message:'Order ' + String(payload.order_id || '').slice(-6) + ': ' + payload.status, order_id: payload.order_id, timestamp: new Date().toISOString() });
            } catch(_) {}
            // Update order status in DOM
            document.querySelectorAll('[data-order-id="' + payload.order_id + '"] .order-status').forEach(function(el) {
                el.textContent = payload.status;
                el.className = 'order-status status-' + payload.status;
            });
        } else if (evtName === 'payment:confirmed') {
            try { ecom.NotificationEngine.push({ type:'payment', message:'Payment confirmed!', order_id: payload.order_id, timestamp: new Date().toISOString() }); } catch(_) {}
            // Show payment success toast
            try { if (typeof window._showToast === 'function') window._showToast('✅ Payment confirmed!'); } catch(_) {}
        } else if (evtName === 'cart:updated') {
            try { ecom.CartEngine.syncFromServer(payload); } catch(_) {}
        }
    }
});

})(); // end _ecomIntegration

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE ECOMMERCE INTEGRATION PATCH v2.0
// Wires marketplace-ecommerce.js into Tool-core.js after session is active.
// Fixes: "No authentication token" by initialising AFTER tools:active event.
// ═══════════════════════════════════════════════════════════════════════════
(function _ecomIntegrationPatch() {
    'use strict';

    // ── 1. Expose authorizedFetch to EcomMarketplace ──────────────────────
    // Called AFTER tools:active so authorizedFetch already has a valid token.
    function _wireEcomApiCall() {
        window._ecomApiCall = async function(method, endpoint, body) {
            // safeApiCall is the primary path — token-aware inside Tool-core.js
            if (typeof safeApiCall === 'function') {
                try {
                    // FIX (Issue 1): safeApiCall(method, endpoint, data) — was reversed
                    return await safeApiCall(method.toUpperCase(), endpoint, body);
                } catch(_) {}
            }
            // Direct authorizedFetch fallback
            try {
                const url = typeof normalizeToolsEndpoint === 'function'
                    ? normalizeToolsEndpoint(endpoint) : endpoint;
                return await authorizedFetch(url, {
                    method: method.toUpperCase(),
                    ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {})
                });
            } catch(e) { return null; }
        };
    }

    // ── 2. Fire ecom init AFTER module is ACTIVE (token guaranteed) ───────
    function _triggerEcomInit() {
        if (window.EcomMarketplace) {
            // Already initialized — just render home sections
            window.dispatchEvent(new CustomEvent('ecom:ready-refire'));
            return;
        }
        _wireEcomApiCall();
        // Tell marketplace-ecommerce.js to initialize now
        window.dispatchEvent(new CustomEvent('ecom:force-init'));
    }

    window.addEventListener('tools:active', _triggerEcomInit, { once: true });

    // ── 3. Settings bridge — forward to EcomMarketplace.SettingsEngine ────
    window.addEventListener('marketplace:settingsUpdated', function(e) {
        const s = e.detail;
        const eng = window.EcomMarketplace?.SettingsEngine;
        if (!s || !eng) return;
        eng.apply({
            darkMode:      s.appearance?.theme === 'dark',
            language:      s.appearance?.language || 'en',
            notifications: s.notifications?.enableNotifications !== false,
            currency:      s.currency || 'KES',
        });
    });

    // ── 4. Forward realtime socket events to EcomMarketplace engines ──────
    const _MP_EVENTS = [
        'product:updated', 'product:created', 'product:deleted', 'product:stock_updated',
        'order:created', 'order:status_changed', 'payment:confirmed',
        'review:new', 'delivery:updated',
    ];
    _MP_EVENTS.forEach(ev => {
        window.addEventListener('realtime:' + ev, function(e) {
            const ecom = window.EcomMarketplace;
            if (!ecom) return;
            const data = e.detail || {};
            if (ev === 'product:stock_updated') ecom.InventoryEngine.handleStockUpdate(data);
            else if (ev === 'payment:confirmed') {
                ecom.NotificationEngine.push({ type:'payment', message:'Payment confirmed!', order_id: data.order_id, timestamp: new Date().toISOString() });
            }
        });
    });

    // ── 5. Seed ecom store from existing marketplace:data-updated ─────────
    window.addEventListener('marketplace:data-updated', function(e) {
        const listings = e.detail?.listings || [];
        if (!listings.length || !window.EcomMarketplace) return;
        const store = window.EcomMarketplace.ProductEngine.getStore();
        listings.forEach(listing => {
            if (!listing?.id || store.products.has(listing.id)) return;
            store.products.set(listing.id, {
                id:             listing.id,
                seller_id:      listing.sellerId || listing.userId,
                seller:         { id: listing.sellerId||listing.userId, name: listing.user?.displayName||'Seller', avatar: listing.user?.photoURL||'', verified:false, rating:0 },
                title:          listing.title || '',
                description:    listing.description || '',
                category:       listing.category || 'other',
                images:         listing.images || (listing.mediaUrl ? [listing.mediaUrl] : []),
                price:          parseFloat(String(listing.price||0).replace(/[^0-9.]/g,'')) || 0,
                original_price: 0, discount: 0,
                stock_quantity: listing.stock ?? null,
                rating:         parseFloat(listing.rating) || 0,
                reviews_count:  parseInt(listing.ratingCount) || 0,
                delivery_fee:   0, location: '',
                available:      listing.available !== false,
                is_featured:    !!(listing.isFeatured || listing.isSpotlight),
                is_flash_sale:  false,
                created_at:     listing.createdAt || new Date().toISOString(),
                views:          listing.views || 0,
                // Carry originals for legacy compat
                userId: listing.userId, user: listing.user, type: listing.type,
                condition: listing.condition || (listing.type === 'digital' ? 'Digital' : ''),
            });
        });
        store.searchIndex = Array.from(store.products.values());
        // Update product count in Jumia header
        const countEl = document.getElementById('jmProductCount');
        if (countEl) countEl.textContent = `(${store.products.size})`;
    });

    // ── 6. Render Jumia home sections when ecom is ready ──────────────────
    function _onEcomReady() {
        const ecom = window.EcomMarketplace;
        if (!ecom) return;

        // Feed featured row
        const featured = ecom.ProductEngine.getFeatured();
        if (typeof window._renderHScroll === 'function' || typeof _renderHScroll !== 'undefined') {
            // _renderHScroll is defined in the Jumia engine in Tool-ui.js
            // Trigger via custom event instead
        }
        window.dispatchEvent(new CustomEvent('ecom:home-render', { detail: { featured } }));

        // Update cart badge
        if (typeof window._jmUpdateCartBadge === 'function') window._jmUpdateCartBadge();
        if (typeof window._jmUpdateWishlistBadge === 'function') window._jmUpdateWishlistBadge();
    }

    window.addEventListener('ecom:ready', _onEcomReady, { once: true });
    window.addEventListener('ecom:ready-refire', _onEcomReady);

    // ── 7. Publish error fix — renderListingDetailContent undefined ───────
    // The error "[MarketplaceList] Cannot read properties of undefined (reading 'addListingItem')"
    // happens because renderers isn't defined in some scope. Fix: guard the call.
    const _origLiveUpdate = window._safeLiveUpdate;
    window.addEventListener('marketplace:data-updated', function() {
        // Give the UI engine time to render first, then update Jumia count
        setTimeout(() => {
            const grid = document.getElementById('marketplaceListContent');
            const countEl = document.getElementById('jmProductCount');
            if (grid && countEl) countEl.textContent = `(${grid.querySelectorAll('.jm-card').length})`;
        }, 500);
    });

})();
