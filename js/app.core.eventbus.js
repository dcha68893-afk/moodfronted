/**
 * Kynecta Global Event Bus
 * Enterprise-grade publish/subscribe system with priority handling
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Event priorities (higher = processed first)
    const PRIORITY = {
        CRITICAL: 100,   // Session, auth, security events
        HIGH: 75,        // Message delivery, call events
        NORMAL: 50,      // UI updates, status changes
        LOW: 25,         // Analytics, logging
        BACKGROUND: 10   // Non-essential events
    };

    // Event categories for organization
    const EVENT_CATEGORIES = {
        MESSAGE: 'message',
        FRIEND: 'friend',
        GROUP: 'group',
        CALL: 'call',
        STATUS: 'status',
        SESSION: 'session',
        SYNC: 'sync',
        UI: 'ui',
        SYSTEM: 'system',
        SETTINGS: 'settings',
        SOCKET: 'socket'
    };

    // Event definitions with metadata
    const EVENT_DEFINITIONS = {
        // Message events
        MESSAGE_SENT: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.HIGH, persist: true },
        MESSAGE_RECEIVED: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.HIGH, persist: true },
        MESSAGE_DELIVERED: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.NORMAL, persist: true },
        MESSAGE_READ: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.NORMAL, persist: true },
        MESSAGE_DELETED: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.NORMAL, persist: true },
        MESSAGE_EDITED: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.NORMAL, persist: true },
        MESSAGE_TYPING: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.LOW, persist: false },
        MESSAGE_TYPING_STOPPED: { category: EVENT_CATEGORIES.MESSAGE, priority: PRIORITY.LOW, persist: false },

        // Friend events
        FRIEND_ADDED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },
        FRIEND_REMOVED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },
        FRIEND_ONLINE: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.HIGH, persist: false },
        FRIEND_OFFLINE: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.HIGH, persist: false },
        FRIEND_UPDATED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },
        FRIEND_REQUEST_RECEIVED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },
        FRIEND_REQUEST_ACCEPTED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },
        FRIEND_REQUEST_REJECTED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },
        FRIEND_BLOCKED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },
        FRIEND_UNBLOCKED: { category: EVENT_CATEGORIES.FRIEND, priority: PRIORITY.NORMAL, persist: true },

        // Group events
        GROUP_CREATED: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.NORMAL, persist: true },
        GROUP_UPDATED: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.NORMAL, persist: true },
        GROUP_DELETED: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.NORMAL, persist: true },
        GROUP_MEMBER_ADDED: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.NORMAL, persist: true },
        GROUP_MEMBER_REMOVED: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.NORMAL, persist: true },
        GROUP_MEMBER_LEFT: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.NORMAL, persist: true },
        GROUP_MEMBER_UPDATED: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.NORMAL, persist: true },
        GROUP_MESSAGE_RECEIVED: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.HIGH, persist: true },
        GROUP_TYPING: { category: EVENT_CATEGORIES.GROUP, priority: PRIORITY.LOW, persist: false },

        // Call events
        CALL_STARTED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.CRITICAL, persist: true },
        CALL_ENDED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.CRITICAL, persist: true },
        CALL_ACCEPTED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.CRITICAL, persist: true },
        CALL_REJECTED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.CRITICAL, persist: true },
        CALL_MISSED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.HIGH, persist: true },
        CALL_INCOMING: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.CRITICAL, persist: false },
        CALL_MUTE_TOGGLED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.NORMAL, persist: false },
        CALL_VIDEO_TOGGLED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.NORMAL, persist: false },
        CALL_PARTICIPANT_JOINED: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.HIGH, persist: true },
        CALL_PARTICIPANT_LEFT: { category: EVENT_CATEGORIES.CALL, priority: PRIORITY.HIGH, persist: true },

        // Status events
        STATUS_UPDATED: { category: EVENT_CATEGORIES.STATUS, priority: PRIORITY.NORMAL, persist: true },
        STATUS_VIEWED: { category: EVENT_CATEGORIES.STATUS, priority: PRIORITY.LOW, persist: true },
        STATUS_EXPIRED: { category: EVENT_CATEGORIES.STATUS, priority: PRIORITY.NORMAL, persist: true },
        STATUS_REACTED: { category: EVENT_CATEGORIES.STATUS, priority: PRIORITY.LOW, persist: true },

        // Session events
        SESSION_RESTORED: { category: EVENT_CATEGORIES.SESSION, priority: PRIORITY.CRITICAL, persist: true },
        SESSION_REFRESHED: { category: EVENT_CATEGORIES.SESSION, priority: PRIORITY.CRITICAL, persist: true },
        SESSION_EXPIRED: { category: EVENT_CATEGORIES.SESSION, priority: PRIORITY.CRITICAL, persist: true },
        SESSION_LOGOUT: { category: EVENT_CATEGORIES.SESSION, priority: PRIORITY.CRITICAL, persist: true },
        SESSION_UPDATED: { category: EVENT_CATEGORIES.SESSION, priority: PRIORITY.HIGH, persist: true },

        // Sync events
        SYNC_STARTED: { category: EVENT_CATEGORIES.SYNC, priority: PRIORITY.NORMAL, persist: false },
        SYNC_COMPLETED: { category: EVENT_CATEGORIES.SYNC, priority: PRIORITY.NORMAL, persist: false },
        SYNC_FAILED: { category: EVENT_CATEGORIES.SYNC, priority: PRIORITY.NORMAL, persist: false },
        SYNC_PROGRESS: { category: EVENT_CATEGORIES.SYNC, priority: PRIORITY.LOW, persist: false },

        // UI events
        UI_THEME_CHANGED: { category: EVENT_CATEGORIES.UI, priority: PRIORITY.LOW, persist: true },
        UI_NAVIGATION: { category: EVENT_CATEGORIES.UI, priority: PRIORITY.NORMAL, persist: false },
        UI_MODAL_OPENED: { category: EVENT_CATEGORIES.UI, priority: PRIORITY.LOW, persist: false },
        UI_MODAL_CLOSED: { category: EVENT_CATEGORIES.UI, priority: PRIORITY.LOW, persist: false },
        UI_NOTIFICATION: { category: EVENT_CATEGORIES.UI, priority: PRIORITY.NORMAL, persist: false },
        UI_SHELL_RENDERED: { category: EVENT_CATEGORIES.UI, priority: PRIORITY.HIGH, persist: true },
        SETTINGS_UPDATED: { category: EVENT_CATEGORIES.SETTINGS, priority: PRIORITY.NORMAL, persist: true },
        SETTING_CHANGED: { category: EVENT_CATEGORIES.SETTINGS, priority: PRIORITY.NORMAL, persist: true },
        SOCKET_CONNECTED: { category: EVENT_CATEGORIES.SOCKET, priority: PRIORITY.HIGH, persist: false },
        SOCKET_DISCONNECTED: { category: EVENT_CATEGORIES.SOCKET, priority: PRIORITY.HIGH, persist: false },
        SOCKET_EVENT: { category: EVENT_CATEGORIES.SOCKET, priority: PRIORITY.NORMAL, persist: false },

        // System events
        SYSTEM_NETWORK_ONLINE: { category: EVENT_CATEGORIES.SYSTEM, priority: PRIORITY.HIGH, persist: false },
        SYSTEM_NETWORK_OFFLINE: { category: EVENT_CATEGORIES.SYSTEM, priority: PRIORITY.HIGH, persist: false },
        SYSTEM_ERROR: { category: EVENT_CATEGORIES.SYSTEM, priority: PRIORITY.HIGH, persist: true },
        SYSTEM_WARNING: { category: EVENT_CATEGORIES.SYSTEM, priority: PRIORITY.NORMAL, persist: true }
    };

    /**
     * Kynecta Event Bus Implementation
     */
    class KynectaEventBus {
        constructor() {
            this._subscribers = new Map();           // eventType -> Map(handlerId -> { handler, priority, once })
            this._wildcardSubscribers = new Set();    // handlers that listen to all events
            this._eventHistory = new Map();           // eventType -> array of recent events
            this._historyLimit = 100;                 // max events to keep per type
            this._handlerIdCounter = 0;
            this._processingQueue = false;
            this._eventQueue = [];
            this._debug = false;
            this._stats = {
                eventsEmitted: 0,
                eventsProcessed: 0,
                subscribersAdded: 0,
                subscribersRemoved: 0,
                queueSize: 0,
                errors: 0
            };
            
            // Initialize with event definitions
            this._eventDefinitions = EVENT_DEFINITIONS;
            
            // Auto-cleanup interval
            this._cleanupInterval = setInterval(() => this._cleanup(), 60000);
            
            // Expose globally
            window.KynectaEventBus = this;
            window.appEvents = this;
            window.EventBus = this;
            
            console.log('[EventBus] ✅ Initialized');
        }

        /**
         * Subscribe to an event
         * @param {string} eventType - Event name (supports wildcard '*' for all events)
         * @param {Function} handler - Event handler function
         * @param {Object} options - Subscription options
         * @param {number} options.priority - Handler priority (higher = executed first)
         * @param {boolean} options.once - Auto-unsubscribe after first execution
         * @param {boolean} options.replayHistory - Receive recent events immediately
         * @returns {Function} Unsubscribe function
         */
        on(eventType, handler, options = {}) {
            if (typeof handler !== 'function') {
                console.error('[EventBus] Handler must be a function');
                return () => {};
            }

            const handlerId = this._generateHandlerId();
            const priority = options.priority || PRIORITY.NORMAL;
            const once = options.once || false;

            // Handle wildcard subscribers
            if (eventType === '*') {
                this._wildcardSubscribers.add({
                    id: handlerId,
                    handler,
                    priority,
                    once
                });
                this._stats.subscribersAdded++;
                
                // Sort wildcard subscribers by priority
                this._wildcardSubscribers = new Set(
                    Array.from(this._wildcardSubscribers).sort((a, b) => b.priority - a.priority)
                );
                
                return () => this._unsubscribeWildcard(handlerId);
            }

            // Normal event subscription
            if (!this._subscribers.has(eventType)) {
                this._subscribers.set(eventType, new Map());
            }

            const handlers = this._subscribers.get(eventType);
            handlers.set(handlerId, { handler, priority, once });
            
            // Sort handlers by priority
            const sortedHandlers = new Map(
                Array.from(handlers.entries()).sort((a, b) => b[1].priority - a[1].priority)
            );
            this._subscribers.set(eventType, sortedHandlers);
            
            this._stats.subscribersAdded++;

            // Replay history if requested
            if (options.replayHistory && this._eventHistory.has(eventType)) {
                const history = this._eventHistory.get(eventType);
                history.forEach(event => {
                    this._executeHandlerSafely(handler, event.payload, event);
                });
            }

            return () => this._unsubscribe(eventType, handlerId);
        }

        /**
         * Subscribe to an event once
         * @param {string} eventType - Event name
         * @param {Function} handler - Event handler function
         * @param {Object} options - Subscription options
         * @returns {Function} Unsubscribe function
         */
        once(eventType, handler, options = {}) {
            return this.on(eventType, handler, { ...options, once: true });
        }

        /**
         * Emit an event
         * @param {string} eventType - Event name
         * @param {*} payload - Event payload
         * @param {Object} options - Emission options
         * @param {boolean} options.async - Execute handlers asynchronously
         * @param {boolean} options.persist - Store in history
         * @param {number} options.priority - Override event priority
         * @returns {Promise|boolean} Result (Promise if async, boolean otherwise)
         */
        emit(eventType, payload, options = {}) {
            // Validate event type
            if (!this._eventDefinitions[eventType] && this._debug) {
                console.warn(`[EventBus] Undefined event type: ${eventType}`);
            }

            const eventDef = this._eventDefinitions[eventType] || { 
                category: 'custom', 
                priority: PRIORITY.NORMAL,
                persist: options.persist || false
            };

            const timestamp = Date.now();
            const eventId = this._generateEventId();
            
            const event = {
                type: eventType,
                payload,
                timestamp,
                eventId,
                category: eventDef.category,
                priority: options.priority || eventDef.priority
            };

            this._stats.eventsEmitted++;

            // Store in history if persistent
            if (eventDef.persist || options.persist) {
                this._storeEvent(event);
            }

            // Log in debug mode
            if (this._debug) {
                console.log(`[EventBus] 📢 ${eventType}`, payload);
            }

            // Handle async execution
            if (options.async) {
                return new Promise((resolve) => {
                    this._eventQueue.push({ event, resolve });
                    if (!this._processingQueue) {
                        this._processEventQueue();
                    }
                });
            }

            // Synchronous execution
            return this._dispatchEvent(event);
        }

        /**
         * Remove all subscribers for an event
         * @param {string} eventType - Event name (optional, clears all if omitted)
         */
        clear(eventType) {
            if (eventType) {
                this._subscribers.delete(eventType);
                this._stats.subscribersRemoved += this._subscribers.get(eventType)?.size || 0;
            } else {
                this._subscribers.clear();
                this._wildcardSubscribers.clear();
                this._stats.subscribersRemoved += this._stats.subscribersAdded;
            }
        }

        /**
         * Get event history
         * @param {string} eventType - Event name (optional)
         * @param {number} limit - Max events to return
         * @returns {Array} Event history
         */
        getHistory(eventType, limit = 50) {
            if (eventType) {
                const history = this._eventHistory.get(eventType) || [];
                return history.slice(-limit);
            }
            
            const allEvents = [];
            for (const [type, events] of this._eventHistory) {
                allEvents.push(...events.map(e => ({ ...e, type })));
            }
            return allEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
        }

        /**
         * Enable/disable debug mode
         * @param {boolean} enabled - Debug state
         */
        setDebug(enabled) {
            this._debug = enabled;
        }

        /**
         * Get event bus statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                ...this._stats,
                subscribersByEvent: Array.from(this._subscribers.entries()).map(([type, handlers]) => ({
                    type,
                    count: handlers.size
                })),
                wildcardSubscribers: this._wildcardSubscribers.size,
                eventHistorySize: Array.from(this._eventHistory.values()).reduce((acc, arr) => acc + arr.length, 0),
                queueSize: this._eventQueue.length
            };
        }

        /**
         * Wait for an event to occur
         * @param {string} eventType - Event name
         * @param {number} timeout - Timeout in milliseconds
         * @param {Function} predicate - Optional condition function
         * @returns {Promise} Resolves with event payload when condition met
         */
        waitFor(eventType, timeout = 30000, predicate = null) {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    unsubscribe();
                    reject(new Error(`Timeout waiting for ${eventType}`));
                }, timeout);

                const unsubscribe = this.on(eventType, (payload, event) => {
                    if (!predicate || predicate(payload, event)) {
                        clearTimeout(timeoutId);
                        unsubscribe();
                        resolve({ payload, event });
                    }
                });
            });
        }

        /**
         * Batch multiple events
         * @param {Array} events - Array of { type, payload, options }
         * @returns {Promise} Resolves when all events processed
         */
        emitBatch(events) {
            return Promise.all(events.map(e => 
                this.emit(e.type, e.payload, { ...e.options, async: true })
            ));
        }

        off(_eventType, unsubscribe) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
                return true;
            }
            return false;
        }

        bridgeWindowEvent(windowEventName, busEventName, mapDetail = null) {
            const handler = (event) => {
                const payload = typeof mapDetail === 'function'
                    ? mapDetail(event)
                    : (event && Object.prototype.hasOwnProperty.call(event, 'detail') ? event.detail : event);
                this.emit(busEventName || windowEventName, payload || {}, { async: true });
            };

            window.addEventListener(windowEventName, handler);
            return () => window.removeEventListener(windowEventName, handler);
        }

        bridgePostMessage(mapper) {
            const handler = (event) => {
                try {
                    const mapped = typeof mapper === 'function'
                        ? mapper(event)
                        : { type: 'SOCKET_EVENT', payload: event.data || null, options: { async: true } };
                    if (!mapped || !mapped.type) return;
                    this.emit(mapped.type, mapped.payload, mapped.options || { async: true });
                } catch (error) {
                    console.error('[EventBus] bridgePostMessage error:', error);
                }
            };

            window.addEventListener('message', handler);
            return () => window.removeEventListener('message', handler);
        }

        // ========== PRIVATE METHODS ==========

        _generateHandlerId() {
            return `handler_${Date.now()}_${++this._handlerIdCounter}_${Math.random().toString(36).substr(2, 6)}`;
        }

        _generateEventId() {
            return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        }

        _storeEvent(event) {
            if (!this._eventHistory.has(event.type)) {
                this._eventHistory.set(event.type, []);
            }
            
            const history = this._eventHistory.get(event.type);
            history.push(event);
            
            if (history.length > this._historyLimit) {
                history.shift();
            }
        }

        _dispatchEvent(event) {
            let results = [];
            
            // Dispatch to wildcard subscribers first
            for (const subscriber of this._wildcardSubscribers) {
                results.push(this._executeHandlerSafely(subscriber.handler, event.payload, event));
            }

            // Dispatch to specific event subscribers
            if (this._subscribers.has(event.type)) {
                const handlers = this._subscribers.get(event.type);
                
                for (const [handlerId, { handler, once }] of handlers) {
                    results.push(this._executeHandlerSafely(handler, event.payload, event));
                    
                    if (once) {
                        handlers.delete(handlerId);
                        this._stats.subscribersRemoved++;
                    }
                }
            }

            this._stats.eventsProcessed++;
            return results.every(r => r !== false);
        }

        _executeHandlerSafely(handler, payload, event) {
            try {
                return handler(payload, event);
            } catch (error) {
                this._stats.errors++;
                console.error('[EventBus] Handler error:', error, event);
                return false;
            }
        }

        async _processEventQueue() {
            if (this._processingQueue) return;
            
            this._processingQueue = true;
            this._stats.queueSize = this._eventQueue.length;

            while (this._eventQueue.length > 0) {
                const { event, resolve } = this._eventQueue.shift();
                
                // Use setTimeout to avoid blocking
                await new Promise(nextTick => setTimeout(nextTick, 0));
                
                const result = this._dispatchEvent(event);
                resolve(result);
            }

            this._processingQueue = false;
            this._stats.queueSize = 0;
        }

        _unsubscribe(eventType, handlerId) {
            if (this._subscribers.has(eventType)) {
                const handlers = this._subscribers.get(eventType);
                if (handlers.delete(handlerId)) {
                    this._stats.subscribersRemoved++;
                    
                    if (handlers.size === 0) {
                        this._subscribers.delete(eventType);
                    }
                }
            }
        }

        _unsubscribeWildcard(handlerId) {
            for (const subscriber of this._wildcardSubscribers) {
                if (subscriber.id === handlerId) {
                    this._wildcardSubscribers.delete(subscriber);
                    this._stats.subscribersRemoved++;
                    break;
                }
            }
        }

        _cleanup() {
            // Remove stale once handlers that might have been missed
            for (const [eventType, handlers] of this._subscribers) {
                for (const [handlerId, { once }] of handlers) {
                    if (once && this._stats.eventsProcessed > 0) {
                        // Once handlers are automatically removed on execution,
                        // but we keep them for reference. No explicit cleanup needed.
                    }
                }
            }

            // Trim event history
            for (const [eventType, history] of this._eventHistory) {
                if (history.length > this._historyLimit) {
                    this._eventHistory.set(eventType, history.slice(-this._historyLimit));
                }
            }
        }

        /**
         * Gracefully shutdown event bus
         */
        destroy() {
            if (this._cleanupInterval) {
                clearInterval(this._cleanupInterval);
            }
            this.clear();
            this._eventQueue = [];
            this._eventHistory.clear();
            this._stats = {};
        }
    }

    // Initialize singleton
    const eventBus = new KynectaEventBus();
    
    // Make constants available
    eventBus.PRIORITY = PRIORITY;
    eventBus.EVENT_CATEGORIES = EVENT_CATEGORIES;
    eventBus.EVENT_DEFINITIONS = EVENT_DEFINITIONS;

    // Expose globally
    window.KynectaEventBus = eventBus;
    window.appEvents = eventBus;
    window.EventBus = eventBus;

    if (!window.__KYNECTA_EVENT_BRIDGES_BOUND__) {
        window.__KYNECTA_EVENT_BRIDGES_BOUND__ = true;

        eventBus.bridgeWindowEvent('online', 'SYSTEM_NETWORK_ONLINE', () => ({
            online: true,
            timestamp: Date.now(),
            source: 'window'
        }));
        eventBus.bridgeWindowEvent('offline', 'SYSTEM_NETWORK_OFFLINE', () => ({
            online: false,
            timestamp: Date.now(),
            source: 'window'
        }));
        eventBus.bridgeWindowEvent('sessionUpdated', 'SESSION_UPDATED');
        eventBus.bridgeWindowEvent('nexopa-session-change', 'SESSION_UPDATED');
        eventBus.bridgeWindowEvent('KYNECTA_UI_RENDERED', 'UI_SHELL_RENDERED');
    }

    // Add to authorities if exists
    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.eventBus = eventBus;
    }

    console.log('[EventBus] ✅ Ready');
})();
