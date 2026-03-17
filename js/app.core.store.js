/**
 * Kynecta Central Application Data Store
 * Immutable state management with reactive updates
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Store configuration
    const STORE_CONFIG = {
        maxHistoryPerKey: 50,
        debug: false,
        persistKeys: ['user', 'session', 'settings', 'theme'],
        persistDebounce: 500
    };

    // Store schema definition
    const STORE_SCHEMA = {
        user: {
            id: null,
            username: null,
            displayName: null,
            email: null,
            phone: null,
            photoURL: null,
            status: null,
            lastSeen: null,
            online: false,
            settings: {}
        },
        session: {
            authenticated: false,
            token: null,
            refreshToken: null,
            expiresAt: null,
            userId: null
        },
        messages: {
            byId: {},
            byChat: {},
            unread: {},
            typing: {},
            drafts: {}
        },
        friends: {
            byId: {},
            list: [],
            online: new Set(),
            requests: [],
            blocked: []
        },
        groups: {
            byId: {},
            list: [],
            members: {},
            unread: {}
        },
        calls: {
            active: null,
            history: [],
            missed: [],
            ringing: null
        },
        status: {
            byId: {},
            list: [],
            viewed: {}
        },
        settings: {
            theme: 'light',
            fontSize: 'medium',
            notifications: true,
            soundEnabled: true,
            language: 'en',
            wallpaper: null,
            privacy: {}
        },
        ui: {
            currentPage: 'messages',
            modals: {},
            loading: {},
            notifications: []
        },
        sync: {
            lastSync: 0,
            syncing: false,
            pending: [],
            failed: []
        },
        network: {
            online: navigator.onLine,
            connectionType: null,
            latency: null
        }
    };

    /**
     * Kynecta Store Implementation
     */
    class KynectaStore {
        constructor() {
            this._state = this._createInitialState();
            this._subscribers = new Map();           // keyPath -> Set(callbacks)
            this._wildcardSubscribers = new Set();   // callbacks for any change
            this._history = new Map();                // keyPath -> array of past values
            this._config = { ...STORE_CONFIG };
            this._batchUpdates = new Map();           // pending batch updates
            this._batchTimeout = null;
            this._persistTimeout = null;
            this._stats = {
                updates: 0,
                gets: 0,
                subscriptions: 0,
                rollbacks: 0
            };

            // Load persisted state
            this._loadPersistedState();

            // Expose globally
            window.KynectaStore = this;

            console.log('[Store] ✅ Initialized');
        }

        // ========== PUBLIC API ==========

        /**
         * Get value from store
         * @param {string} keyPath - Dot notation path (e.g., 'messages.byId.123')
         * @param {*} defaultValue - Default if path doesn't exist
         * @returns {*} Value at path
         */
        get(keyPath, defaultValue = null) {
            this._stats.gets++;
            
            if (!keyPath) return this._state;
            
            const keys = keyPath.split('.');
            let value = this._state;
            
            for (const key of keys) {
                if (value === null || value === undefined) {
                    return defaultValue;
                }
                value = value[key];
            }
            
            return value !== undefined ? value : defaultValue;
        }

        /**
         * Set value in store
         * @param {string} keyPath - Dot notation path
         * @param {*} value - New value
         * @param {Object} options - Update options
         * @param {boolean} options.silent - Skip notifications
         * @param {boolean} options.persist - Force persistence
         * @param {boolean} options.history - Store in history
         * @returns {boolean} Success
         */
        set(keyPath, value, options = {}) {
            if (!keyPath) return false;

            const oldValue = this.get(keyPath);
            
            // Skip if values are deeply equal (simple check)
            if (JSON.stringify(oldValue) === JSON.stringify(value)) {
                return true;
            }

            // Record history if requested
            if (options.history !== false) {
                this._recordHistory(keyPath, oldValue);
            }

            // Perform immutable update
            const newState = this._setImmutable(this._state, keyPath.split('.'), value);
            
            if (!newState) return false;

            // Apply update
            this._state = newState;
            this._stats.updates++;

            // Handle persistence
            const shouldPersist = options.persist || 
                this._config.persistKeys.some(key => keyPath.startsWith(key));
            
            if (shouldPersist) {
                this._schedulePersistence();
            }

            // Notify subscribers
            if (!options.silent) {
                this._notifySubscribers(keyPath, value, oldValue);
            }

            return true;
        }

        /**
         * Update value using function
         * @param {string} keyPath - Dot notation path
         * @param {Function} updater - (currentValue) => newValue
         * @param {Object} options - Update options
         * @returns {*} New value
         */
        update(keyPath, updater, options = {}) {
            const currentValue = this.get(keyPath);
            const newValue = updater(currentValue);
            this.set(keyPath, newValue, options);
            return newValue;
        }

        /**
         * Batch multiple updates
         * @param {Function} batchFn - Function receiving batch object
         * @returns {Promise} Resolves when batch applied
         */
        batch(batchFn) {
            return new Promise((resolve) => {
                // Clear any pending batch
                if (this._batchTimeout) {
                    clearTimeout(this._batchTimeout);
                }

                // Create batch context
                const batch = {
                    updates: [],
                    set: (keyPath, value) => {
                        batch.updates.push({ keyPath, value });
                    },
                    update: (keyPath, updater) => {
                        const current = this.get(keyPath);
                        batch.updates.push({ keyPath, value: updater(current) });
                    }
                };

                // Execute batch function
                batchFn(batch);

                // Apply batch after microtask
                this._batchTimeout = setTimeout(() => {
                    this._applyBatch(batch.updates);
                    resolve();
                }, 0);
            });
        }

        /**
         * Subscribe to changes
         * @param {string} keyPath - Dot notation path (or '*' for all)
         * @param {Function} callback - (newValue, oldValue, keyPath) => {}
         * @returns {Function} Unsubscribe function
         */
        subscribe(keyPath, callback) {
            if (keyPath === '*') {
                this._wildcardSubscribers.add(callback);
                this._stats.subscriptions++;
                return () => this._wildcardSubscribers.delete(callback);
            }

            if (!this._subscribers.has(keyPath)) {
                this._subscribers.set(keyPath, new Set());
            }

            this._subscribers.get(keyPath).add(callback);
            this._stats.subscriptions++;

            return () => {
                const subscribers = this._subscribers.get(keyPath);
                if (subscribers) {
                    subscribers.delete(callback);
                    if (subscribers.size === 0) {
                        this._subscribers.delete(keyPath);
                    }
                }
            };
        }

        /**
         * Subscribe with selector for derived data
         * @param {Function} selector - (state) => derived value
         * @param {Function} callback - (derivedValue) => {}
         * @returns {Function} Unsubscribe
         */
        select(selector, callback) {
            let lastValue = selector(this._state);
            
            const unsubscribe = this.subscribe('*', () => {
                const newValue = selector(this._state);
                if (JSON.stringify(lastValue) !== JSON.stringify(newValue)) {
                    callback(newValue, lastValue);
                    lastValue = newValue;
                }
            });

            // Initial callback
            callback(lastValue);

            return unsubscribe;
        }

        /**
         * Get entire state snapshot
         * @returns {Object} Frozen state snapshot
         */
        getState() {
            return this._deepFreeze({ ...this._state });
        }

        /**
         * Reset state to initial values
         * @param {Array} keys - Specific keys to reset (optional)
         */
        reset(keys = null) {
            const initialState = this._createInitialState();
            
            if (keys) {
                keys.forEach(key => {
                    if (key in initialState) {
                        this.set(key, initialState[key], { silent: false });
                    }
                });
            } else {
                this._state = initialState;
                this._notifySubscribers('*', this._state, null);
            }
        }

        /**
         * Get change history for a path
         * @param {string} keyPath - Dot notation path
         * @param {number} limit - Max entries
         * @returns {Array} History entries
         */
        getHistory(keyPath, limit = 10) {
            const history = this._history.get(keyPath) || [];
            return history.slice(-limit);
        }

        /**
         * Rollback to previous value
         * @param {string} keyPath - Dot notation path
         * @param {number} steps - Steps to rollback
         * @returns {boolean} Success
         */
        rollback(keyPath, steps = 1) {
            const history = this._history.get(keyPath) || [];
            if (history.length < steps) return false;

            const targetIndex = history.length - steps;
            const targetValue = history[targetIndex];
            
            this.set(keyPath, targetValue, { silent: false });
            this._stats.rollbacks++;

            // Truncate history
            this._history.set(keyPath, history.slice(0, targetIndex));

            return true;
        }

        /**
         * Get store statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                ...this._stats,
                subscribersByPath: Array.from(this._subscribers.entries()).map(([path, set]) => ({
                    path,
                    count: set.size
                })),
                wildcardSubscribers: this._wildcardSubscribers.size,
                historySize: Array.from(this._history.values()).reduce((acc, arr) => acc + arr.length, 0),
                batchPending: this._batchUpdates.size
            };
        }

        /**
         * Enable/disable debug mode
         * @param {boolean} enabled - Debug state
         */
        setDebug(enabled) {
            this._config.debug = enabled;
        }

        // ========== PRIVATE METHODS ==========

        _createInitialState() {
            // Deep clone schema
            return JSON.parse(JSON.stringify(STORE_SCHEMA));
        }

        _setImmutable(obj, keys, value, index = 0) {
            const key = keys[index];
            
            // Handle array indices
            if (Array.isArray(obj) && !isNaN(key)) {
                const idx = parseInt(key, 10);
                if (index === keys.length - 1) {
                    const newArray = [...obj];
                    newArray[idx] = value;
                    return newArray;
                }
                
                const newArray = [...obj];
                newArray[idx] = this._setImmutable(obj[idx], keys, value, index + 1);
                return newArray;
            }

            // Handle objects
            if (index === keys.length - 1) {
                return { ...obj, [key]: value };
            }

            const nextObj = obj[key] || (isNaN(keys[index + 1]) ? {} : []);
            return { ...obj, [key]: this._setImmutable(nextObj, keys, value, index + 1) };
        }

        _recordHistory(keyPath, value) {
            if (!this._history.has(keyPath)) {
                this._history.set(keyPath, []);
            }

            const history = this._history.get(keyPath);
            history.push(value);

            if (history.length > this._config.maxHistoryPerKey) {
                history.shift();
            }
        }

        _notifySubscribers(keyPath, newValue, oldValue) {
            // Notify specific subscribers
            if (this._subscribers.has(keyPath)) {
                this._subscribers.get(keyPath).forEach(callback => {
                    try {
                        callback(newValue, oldValue, keyPath);
                    } catch (error) {
                        console.error('[Store] Subscriber error:', error);
                    }
                });
            }

            // Notify parent path subscribers
            const pathParts = keyPath.split('.');
            while (pathParts.length > 1) {
                pathParts.pop();
                const parentPath = pathParts.join('.');
                
                if (this._subscribers.has(parentPath)) {
                    const parentValue = this.get(parentPath);
                    this._subscribers.get(parentPath).forEach(callback => {
                        try {
                            callback(parentValue, null, parentPath);
                        } catch (error) {
                            console.error('[Store] Subscriber error:', error);
                        }
                    });
                }
            }

            // Notify wildcard subscribers
            this._wildcardSubscribers.forEach(callback => {
                try {
                    callback(this._state, null, '*');
                } catch (error) {
                    console.error('[Store] Wildcard subscriber error:', error);
                }
            });

            // Emit through EventBus if available
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('STORE_UPDATED', {
                    keyPath,
                    newValue,
                    oldValue,
                    timestamp: Date.now()
                }, { async: true });
            }
        }

        _applyBatch(updates) {
            // Apply all updates immutably
            let newState = this._state;
            
            updates.forEach(({ keyPath, value }) => {
                const oldValue = this.get(keyPath);
                newState = this._setImmutable(newState, keyPath.split('.'), value);
                
                // Record history
                this._recordHistory(keyPath, oldValue);
            });

            // Apply final state
            this._state = newState;
            this._stats.updates++;

            // Notify subscribers
            updates.forEach(({ keyPath }) => {
                const newValue = this.get(keyPath);
                this._notifySubscribers(keyPath, newValue, null);
            });

            // Schedule persistence
            this._schedulePersistence();
        }

        _schedulePersistence() {
            if (this._persistTimeout) {
                clearTimeout(this._persistTimeout);
            }

            this._persistTimeout = setTimeout(() => {
                this._persistState();
                this._persistTimeout = null;
            }, this._config.persistDebounce);
        }

        _persistState() {
            if (!window.localStorage) return;

            try {
                this._config.persistKeys.forEach(key => {
                    const value = this.get(key);
                    if (value !== null && value !== undefined) {
                        localStorage.setItem(`kynecta_store_${key}`, JSON.stringify(value));
                    }
                });
            } catch (error) {
                console.warn('[Store] Failed to persist state:', error);
            }
        }

        _loadPersistedState() {
            if (!window.localStorage) return;

            try {
                this._config.persistKeys.forEach(key => {
                    const stored = localStorage.getItem(`kynecta_store_${key}`);
                    if (stored) {
                        try {
                            const value = JSON.parse(stored);
                            this.set(key, value, { silent: true, persist: false });
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                });
            } catch (error) {
                console.warn('[Store] Failed to load persisted state:', error);
            }
        }

        _deepFreeze(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            
            Object.keys(obj).forEach(key => {
                if (typeof obj[key] === 'object') {
                    this._deepFreeze(obj[key]);
                }
            });
            
            return Object.freeze(obj);
        }
    }

    // Initialize singleton
    const store = new KynectaStore();

    // Expose globally
    window.KynectaStore = store;

    // Add to authorities if exists
    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.store = store;
    }

    console.log('[Store] ✅ Ready');
})();