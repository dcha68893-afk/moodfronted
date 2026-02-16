// api-groups.js - Groups API adapter
// Version: 2.0.2
// Date: 2024-01-03
// Adapter for groups functionality, re-exports from api.core.js
// FIXED: Improved core module detection, removed health check dependency

import {
    secureApiFetch,
    createGroup,
    getGroups,
    getGroupDetails,
    updateGroup,
    deleteGroup,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    getCurrentUser
} from "./api.core.js";

// Re-export core groups functions - SINGLE SOURCE OF TRUTH
export {
    createGroup,
    getGroups,
    getGroupDetails,
    updateGroup,
    deleteGroup,
    addGroupMember,
    removeGroupMember,
    leaveGroup
};

// API Group Manager
class ApiGroupManager {
    constructor() {
        this.isInitialized = false;
        this.isReady = false;
        this.readyCallbacks = [];
        this.eventListeners = new Map();
        this.messageQueue = new Map();
        this.pendingRequests = new Map();
        this.groupCache = new Map();
        this.iframeStates = new Map();
        this.retryDelays = [1000, 2000, 5000];
        this.requestId = 0;
        this.initPromise = null;
        
        // Initialize event system
        this.setupEventSystem();
    }
    
    setupEventSystem() {
        // Core events
        this.registerEvent('READY');
        this.registerEvent('GROUPS_FETCHED');
        this.registerEvent('GROUP_CREATED');
        this.registerEvent('GROUP_UPDATED');
        this.registerEvent('GROUP_DELETED');
        this.registerEvent('GROUP_JOINED');
        this.registerEvent('GROUP_LEFT');
        this.registerEvent('MESSAGE_SENT');
        this.registerEvent('MEMBER_ADDED');
        this.registerEvent('MEMBER_REMOVED');
        this.registerEvent('ERROR');
        this.registerEvent('AUTH_REQUIRED');
        this.registerEvent('SYNC_COMPLETE');
    }
    
    registerEvent(eventName) {
        this.eventListeners.set(eventName, []);
    }
    
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            console.warn(`[API_GROUP] Event "${event}" not registered`);
            return;
        }
        this.eventListeners.get(event).push(callback);
    }
    
    emit(event, data) {
        if (!this.eventListeners.has(event)) {
            console.warn(`[API_GROUP] Emitting unregistered event: ${event}`);
            return;
        }
        
        const listeners = this.eventListeners.get(event);
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[API_GROUP] Event handler error for ${event}:`, error);
            }
        });
    }
    
    async initialize() {
        // Return existing initialization promise if already initializing
        if (this.initPromise) {
            return this.initPromise;
        }
        
        if (this.isInitialized) {
            return { ok: true, data: { initialized: true } };
        }
        
        this.initPromise = this._initialize();
        return this.initPromise;
    }
    
    async _initialize() {
        console.log('[API_GROUP] Initializing...');
        this.isInitialized = true;
        
        try {
            // Wait for api.core.js to be ready - IMPROVED DETECTION
            await this.waitForCoreReady();
            
            // Setup event listeners
            this.setupGroupEventListeners();
            
            // Initialize sequentially
            await this.initializeGroupData();
            
            this.isReady = true;
            this.emit('READY', { timestamp: Date.now() });
            
            console.log('[API_GROUP] ✅ Initialization complete');
            return { ok: true, data: { ready: true } };
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { action: 'initialize', error });
            this.isInitialized = false;
            this.initPromise = null;
            return { ok: false, error: error.message };
        }
    }
    
    async waitForCoreReady() {
        const maxWaitTime = 10000; // 10 seconds - REDUCED TIMEOUT
        const startTime = Date.now();
        let attempts = 0;
        
        // Check if core functions are available immediately
        if (typeof getGroups === 'function' && typeof createGroup === 'function') {
            console.log('[API_GROUP] ✅ api.core.js functions detected immediately');
            return;
        }
        
        while (Date.now() - startTime < maxWaitTime) {
            attempts++;
            
            try {
                // Method 1: Check if core functions are available
                if (typeof getGroups === 'function' && 
                    typeof createGroup === 'function' && 
                    typeof secureApiFetch === 'function') {
                    console.log('[API_GROUP] ✅ api.core.js ready (functions available)');
                    return;
                }
                
                // Method 2: Try a simple API call that doesn't depend on health endpoint
                try {
                    const currentUser = getCurrentUser();
                    if (currentUser !== undefined) {
                        console.log('[API_GROUP] ✅ api.core.js ready (getCurrentUser available)');
                        return;
                    }
                } catch (e) {
                    // Ignore - continue waiting
                }
                
            } catch (error) {
                // Continue waiting
            }
            
            // Wait progressively longer between attempts
            const delay = Math.min(100 * attempts, 500);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Final check - if we timeout but functions exist, proceed anyway
        if (typeof getGroups === 'function' && typeof createGroup === 'function') {
            console.log('[API_GROUP] ⚠️ api.core.js functions detected after timeout - proceeding');
            return;
        }
        
        throw new Error('api.core.js not ready - core group functions unavailable');
    }
    
    setupGroupEventListeners() {
        // Listen for auth changes
        window.addEventListener('storage', (event) => {
            if (event.key === 'auth_token' && !event.newValue) {
                this.handleAuthFailure();
            }
        });
        
        // Listen for core ready event if available
        window.addEventListener('api_core_ready', () => {
            console.log('[API_GROUP] Received core ready event');
            if (!this.isReady) {
                this.initialize();
            }
        });
    }
    
    handleAuthFailure() {
        console.log('[API_GROUP] Auth failure detected');
        this.isReady = false;
        this.pendingRequests.clear();
        this.emit('AUTH_REQUIRED', { reason: 'session_expired' });
    }
    
    async initializeGroupData() {
        console.log('[API_GROUP] Fetching initial group data...');
        
        try {
            // Fetch sequentially in order - with individual error handling
            let activeGroups = { ok: false, data: [] };
            let pendingInvitations = { ok: false, data: [] };
            let archivedGroups = { ok: false, data: [] };
            
            try {
                activeGroups = await this.fetchGroupsSequentially('active');
            } catch (error) {
                console.warn('[API_GROUP] Failed to fetch active groups:', error);
                activeGroups = { ok: false, data: [], error: error.message };
            }
            
            try {
                pendingInvitations = await this.fetchGroupsSequentially('pending');
            } catch (error) {
                console.warn('[API_GROUP] Failed to fetch pending invitations:', error);
                pendingInvitations = { ok: false, data: [], error: error.message };
            }
            
            try {
                archivedGroups = await this.fetchGroupsSequentially('archived');
            } catch (error) {
                console.warn('[API_GROUP] Failed to fetch archived groups:', error);
                archivedGroups = { ok: false, data: [], error: error.message };
            }
            
            // Store in cache
            this.groupCache.set('active', activeGroups);
            this.groupCache.set('pending', pendingInvitations);
            this.groupCache.set('archived', archivedGroups);
            
            // Emit completion event
            this.emit('GROUPS_FETCHED', {
                active: activeGroups,
                pending: pendingInvitations,
                archived: archivedGroups
            });
            
            console.log('[API_GROUP] ✅ Group data loaded');
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { action: 'initializeGroupData', error });
            // Don't throw - allow partial initialization
        }
    }
    
    async fetchGroupsSequentially(listType) {
        const requestId = ++this.requestId;
        console.log('[API_GROUP]', { 
            action: 'fetch_groups', 
            listType, 
            requestId, 
            status: 'started' 
        });
        
        try {
            let response;
            
            switch (listType) {
                case 'active':
                    response = await getGroups();
                    break;
                case 'pending':
                    // Implementation depends on API structure - with fallback
                    try {
                        response = await secureApiFetch('/api/groups/invites/pending', { method: 'GET' });
                    } catch (e) {
                        console.warn('[API_GROUP] Pending invites endpoint not available, using empty array');
                        response = { success: true, data: [] };
                    }
                    break;
                case 'archived':
                    // Implementation depends on API structure - with fallback
                    try {
                        response = await secureApiFetch('/api/groups/archived', { method: 'GET' });
                    } catch (e) {
                        console.warn('[API_GROUP] Archived groups endpoint not available, using empty array');
                        response = { success: true, data: [] };
                    }
                    break;
                default:
                    throw new Error(`Invalid list type: ${listType}`);
            }
            
            console.log('[API_GROUP]', { 
                action: 'fetch_groups', 
                listType, 
                requestId, 
                status: 'success' 
            });
            
            return this.formatResponse(response);
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'fetch_groups', 
                listType, 
                requestId, 
                error 
            });
            
            // Retry once for active groups only
            if (listType === 'active') {
                try {
                    console.log('[API_GROUP] Retrying fetch...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const retryResponse = await getGroups();
                    return this.formatResponse(retryResponse);
                } catch (retryError) {
                    return { ok: false, data: null, error: retryError.message };
                }
            }
            
            return { ok: false, data: null, error: error.message };
        }
    }
    
    formatResponse(response) {
        if (!response) {
            return { ok: false, data: null, error: 'No response from server' };
        }
        
        // Handle array responses (direct data)
        if (Array.isArray(response)) {
            return { ok: true, data: response, error: null };
        }
        
        if (response.success !== undefined) {
            return {
                ok: response.success,
                data: response.data || response,
                error: response.error || null
            };
        }
        
        if (response.error || response.message) {
            return {
                ok: false,
                data: response.data || null,
                error: response.error || response.message
            };
        }
        
        // Assume response is the data itself
        return { ok: true, data: response, error: null };
    }
    
    async fetchGroups(listType = 'active') {
        if (!this.isReady) {
            await this.initialize();
        }
        
        // Check cache first
        if (this.groupCache.has(listType)) {
            const cached = this.groupCache.get(listType);
            if (cached && cached.ok) {
                return Promise.resolve(cached);
            }
        }
        
        return this.fetchGroupsSequentially(listType);
    }
    
    async createGroup(groupData) {
        if (!this.isReady) {
            // Try to initialize if not ready
            await this.initialize();
        }
        
        const requestId = ++this.requestId;
        console.log('[API_GROUP]', { 
            action: 'create_group', 
            requestId, 
            status: 'validating' 
        });
        
        // Validate input
        const validation = this.validateGroupData(groupData);
        if (!validation.ok) {
            return validation;
        }
        
        // Check for duplicates
        const duplicateCheck = await this.checkDuplicateGroup(groupData);
        if (!duplicateCheck.ok) {
            return duplicateCheck;
        }
        
        try {
            console.log('[API_GROUP]', { 
                action: 'create_group', 
                requestId, 
                status: 'sending' 
            });
            
            const response = await createGroup(groupData);
            const formatted = this.formatResponse(response);
            
            if (formatted.ok) {
                // Update cache
                const activeGroups = this.groupCache.get('active') || { ok: true, data: [] };
                if (activeGroups.ok && Array.isArray(activeGroups.data)) {
                    activeGroups.data.push(formatted.data);
                    this.groupCache.set('active', activeGroups);
                }
                
                // Emit event
                this.emit('GROUP_CREATED', formatted.data);
                
                console.log('[API_GROUP]', { 
                    action: 'create_group', 
                    requestId, 
                    status: 'success' 
                });
            }
            
            return formatted;
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'create_group', 
                requestId, 
                error 
            });
            return { ok: false, data: null, error: error.message };
        }
    }
    
    validateGroupData(groupData) {
        if (!groupData || typeof groupData !== 'object') {
            return { ok: false, error: 'Invalid group data' };
        }
        
        if (!groupData.name || groupData.name.trim().length < 2) {
            return { ok: false, error: 'Group name must be at least 2 characters' };
        }
        
        if (groupData.name.length > 100) {
            return { ok: false, error: 'Group name must be less than 100 characters' };
        }
        
        return { ok: true };
    }
    
    async checkDuplicateGroup(groupData) {
        try {
            const groups = await this.fetchGroups('active');
            if (groups.ok && Array.isArray(groups.data)) {
                const duplicate = groups.data.find(g => 
                    g.name && g.name.toLowerCase() === groupData.name.toLowerCase()
                );
                if (duplicate) {
                    return { ok: false, error: 'A group with this name already exists' };
                }
            }
            return { ok: true };
        } catch (error) {
            // If we can't check, allow creation (server will handle duplicates)
            return { ok: true };
        }
    }
    
    async updateGroup(groupId, updates) {
        if (!this.isReady) {
            await this.initialize();
        }
        
        if (!groupId) {
            return { ok: false, error: 'Group ID required' };
        }
        
        if (!updates || typeof updates !== 'object') {
            return { ok: false, error: 'Invalid updates' };
        }
        
        const requestId = ++this.requestId;
        console.log('[API_GROUP]', { 
            action: 'update_group', 
            groupId, 
            requestId, 
            status: 'started' 
        });
        
        try {
            const response = await updateGroup(groupId, updates);
            const formatted = this.formatResponse(response);
            
            if (formatted.ok) {
                // Update cache
                this.updateGroupInCache(groupId, updates);
                
                // Emit event
                this.emit('GROUP_UPDATED', { groupId, updates, result: formatted.data });
                
                console.log('[API_GROUP]', { 
                    action: 'update_group', 
                    groupId, 
                    requestId, 
                    status: 'success' 
                });
            }
            
            return formatted;
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'update_group', 
                groupId, 
                requestId, 
                error 
            });
            return { ok: false, data: null, error: error.message };
        }
    }
    
    updateGroupInCache(groupId, updates) {
        for (const [type, cache] of this.groupCache) {
            if (cache && cache.ok && Array.isArray(cache.data)) {
                const index = cache.data.findIndex(g => g && g.id === groupId);
                if (index !== -1) {
                    cache.data[index] = { ...cache.data[index], ...updates };
                    this.groupCache.set(type, cache);
                    break;
                }
            }
        }
    }
    
    async deleteGroup(groupId) {
        if (!this.isReady) {
            await this.initialize();
        }
        
        if (!groupId) {
            return { ok: false, error: 'Group ID required' };
        }
        
        const requestId = ++this.requestId;
        console.log('[API_GROUP]', { 
            action: 'delete_group', 
            groupId, 
            requestId, 
            status: 'started' 
        });
        
        try {
            const response = await deleteGroup(groupId);
            const formatted = this.formatResponse(response);
            
            if (formatted.ok) {
                // Remove from cache
                this.removeGroupFromCache(groupId);
                
                // Emit event
                this.emit('GROUP_DELETED', { groupId, result: formatted.data });
                
                console.log('[API_GROUP]', { 
                    action: 'delete_group', 
                    groupId, 
                    requestId, 
                    status: 'success' 
                });
            }
            
            return formatted;
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'delete_group', 
                groupId, 
                requestId, 
                error 
            });
            return { ok: false, data: null, error: error.message };
        }
    }
    
    removeGroupFromCache(groupId) {
        for (const [type, cache] of this.groupCache) {
            if (cache && cache.ok && Array.isArray(cache.data)) {
                cache.data = cache.data.filter(g => g && g.id !== groupId);
                this.groupCache.set(type, cache);
            }
        }
    }
    
    async joinGroup(groupId) {
        if (!this.isReady) {
            await this.initialize();
        }
        
        if (!groupId) {
            return { ok: false, error: 'Group ID required' };
        }
        
        // Debounce check
        const debounceKey = `join_${groupId}`;
        if (this.pendingRequests.has(debounceKey)) {
            return { ok: false, error: 'Request already in progress' };
        }
        
        this.pendingRequests.set(debounceKey, true);
        const requestId = ++this.requestId;
        
        console.log('[API_GROUP]', { 
            action: 'join_group', 
            groupId, 
            requestId, 
            status: 'started' 
        });
        
        try {
            const response = await this.joinGroupInternal(groupId);
            
            if (response.ok) {
                // Update cache
                await this.refreshGroupInCache(groupId);
                
                // Emit event
                this.emit('GROUP_JOINED', { groupId, result: response.data });
                
                console.log('[API_GROUP]', { 
                    action: 'join_group', 
                    groupId, 
                    requestId, 
                    status: 'success' 
                });
            }
            
            this.pendingRequests.delete(debounceKey);
            return response;
        } catch (error) {
            this.pendingRequests.delete(debounceKey);
            console.error('[API_GROUP_ERROR]', { 
                action: 'join_group', 
                groupId, 
                requestId, 
                error 
            });
            return { ok: false, data: null, error: error.message };
        }
    }
    
    async joinGroupInternal(groupId) {
        // Try direct join first
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/join`, {
                method: 'POST'
            });
            return this.formatResponse(response);
        } catch (error) {
            // Fallback to core function
            try {
                // Note: This assumes addGroupMember works for self-joining
                const currentUser = getCurrentUser();
                if (currentUser && currentUser.id) {
                    const response = await addGroupMember(groupId, currentUser.id);
                    return this.formatResponse(response);
                }
                throw new Error('Cannot identify current user');
            } catch (fallbackError) {
                throw fallbackError;
            }
        }
    }
    
    async leaveGroup(groupId) {
        if (!this.isReady) {
            await this.initialize();
        }
        
        if (!groupId) {
            return { ok: false, error: 'Group ID required' };
        }
        
        // Debounce check
        const debounceKey = `leave_${groupId}`;
        if (this.pendingRequests.has(debounceKey)) {
            return { ok: false, error: 'Request already in progress' };
        }
        
        this.pendingRequests.set(debounceKey, true);
        const requestId = ++this.requestId;
        
        console.log('[API_GROUP]', { 
            action: 'leave_group', 
            groupId, 
            requestId, 
            status: 'started' 
        });
        
        try {
            const response = await leaveGroup(groupId);
            const formatted = this.formatResponse(response);
            
            if (formatted.ok) {
                // Update cache
                await this.refreshGroupInCache(groupId);
                
                // Emit event
                this.emit('GROUP_LEFT', { groupId, result: formatted.data });
                
                console.log('[API_GROUP]', { 
                    action: 'leave_group', 
                    groupId, 
                    requestId, 
                    status: 'success' 
                });
            }
            
            this.pendingRequests.delete(debounceKey);
            return formatted;
        } catch (error) {
            this.pendingRequests.delete(debounceKey);
            console.error('[API_GROUP_ERROR]', { 
                action: 'leave_group', 
                groupId, 
                requestId, 
                error 
            });
            return { ok: false, data: null, error: error.message };
        }
    }
    
    async refreshGroupInCache(groupId) {
        try {
            const details = await getGroupDetails(groupId);
            if (details) {
                // Update in active groups cache
                const activeCache = this.groupCache.get('active');
                if (activeCache && activeCache.ok && Array.isArray(activeCache.data)) {
                    const index = activeCache.data.findIndex(g => g && g.id === groupId);
                    if (index !== -1) {
                        activeCache.data[index] = details;
                    }
                }
            }
        } catch (error) {
            // Silently fail cache update
        }
    }
    
    async sendGroupMessage(groupId, message) {
        if (!this.isReady) {
            await this.initialize();
        }
        
        if (!groupId) {
            return { ok: false, error: 'Group ID required' };
        }
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return { ok: false, error: 'Message content required' };
        }
        
        if (message.length > 5000) {
            return { ok: false, error: 'Message too long (max 5000 chars)' };
        }
        
        const requestId = ++this.requestId;
        console.log('[API_GROUP]', { 
            action: 'send_message', 
            groupId, 
            requestId, 
            status: 'queued' 
        });
        
        // Queue message if group not loaded
        if (!this.isGroupLoaded(groupId)) {
            return this.queueMessage(groupId, message, requestId);
        }
        
        return this.sendMessageInternal(groupId, message, requestId);
    }
    
    isGroupLoaded(groupId) {
        // Check if group exists in cache
        for (const cache of this.groupCache.values()) {
            if (cache && cache.ok && Array.isArray(cache.data)) {
                if (cache.data.some(g => g && g.id === groupId)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    queueMessage(groupId, message, requestId) {
        if (!this.messageQueue.has(groupId)) {
            this.messageQueue.set(groupId, []);
        }
        
        this.messageQueue.get(groupId).push({ message, requestId });
        
        console.log('[API_GROUP]', { 
            action: 'send_message', 
            groupId, 
            requestId, 
            status: 'queued_waiting_group' 
        });
        
        // Try to load group and then send queued messages
        this.loadGroupAndProcessQueue(groupId);
        
        return { ok: true, data: { queued: true, requestId }, error: null };
    }
    
    async loadGroupAndProcessQueue(groupId) {
        try {
            const details = await getGroupDetails(groupId);
            if (details) {
                // Add to cache
                const activeCache = this.groupCache.get('active') || { ok: true, data: [] };
                if (activeCache.ok && Array.isArray(activeCache.data)) {
                    if (!activeCache.data.some(g => g && g.id === groupId)) {
                        activeCache.data.push(details);
                        this.groupCache.set('active', activeCache);
                    }
                }
                
                // Process queued messages
                const queue = this.messageQueue.get(groupId) || [];
                for (const item of queue) {
                    await this.sendMessageInternal(groupId, item.message, item.requestId);
                }
                this.messageQueue.delete(groupId);
            }
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'process_message_queue', 
                groupId, 
                error 
            });
        }
    }
    
    async sendMessageInternal(groupId, message, requestId) {
        try {
            console.log('[API_GROUP]', { 
                action: 'send_message', 
                groupId, 
                requestId, 
                status: 'sending' 
            });
            
            const response = await secureApiFetch(`/api/groups/${groupId}/messages`, {
                method: 'POST',
                body: { 
                    content: message.trim(),
                    timestamp: new Date().toISOString()
                }
            });
            
            const formatted = this.formatResponse(response);
            
            if (formatted.ok) {
                this.emit('MESSAGE_SENT', { groupId, message, result: formatted.data });
                
                console.log('[API_GROUP]', { 
                    action: 'send_message', 
                    groupId, 
                    requestId, 
                    status: 'success' 
                });
            }
            
            return formatted;
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'send_message', 
                groupId, 
                requestId, 
                error 
            });
            return { ok: false, data: null, error: error.message };
        }
    }
    
    sendToIframe(iframeId, data) {
        if (!iframeId || !data) {
            console.warn('[API_GROUP] Invalid iframe send parameters');
            return false;
        }
        
        try {
            // Store iframe state
            this.iframeStates.set(iframeId, {
                lastUpdate: Date.now(),
                status: 'sending'
            });
            
            // Find iframe
            const iframe = document.getElementById(iframeId);
            if (!iframe || !iframe.contentWindow) {
                console.warn(`[API_GROUP] Iframe ${iframeId} not found or not loaded`);
                this.iframeStates.delete(iframeId);
                return false;
            }
            
            // Send structured data
            const message = {
                type: 'GROUP_DATA',
                source: 'api_groups',
                timestamp: Date.now(),
                data: data
            };
            
            iframe.contentWindow.postMessage(message, '*');
            
            this.iframeStates.set(iframeId, {
                lastUpdate: Date.now(),
                status: 'sent'
            });
            
            console.log('[API_GROUP]', { 
                action: 'send_to_iframe', 
                iframeId, 
                status: 'sent' 
            });
            
            return true;
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'send_to_iframe', 
                iframeId, 
                error 
            });
            this.iframeStates.delete(iframeId);
            return false;
        }
    }
    
    broadcastToParent(event, data) {
        if (!event) {
            console.warn('[API_GROUP] Event required for broadcast');
            return false;
        }
        
        try {
            const message = {
                type: 'GROUP_EVENT',
                event: event,
                source: 'api_groups',
                timestamp: Date.now(),
                data: data || {}
            };
            
            window.parent.postMessage(message, '*');
            
            console.log('[API_GROUP]', { 
                action: 'broadcast_to_parent', 
                event, 
                status: 'sent' 
            });
            
            return true;
        } catch (error) {
            console.error('[API_GROUP_ERROR]', { 
                action: 'broadcast_to_parent', 
                event, 
                error 
            });
            return false;
        }
    }
    
    // Enhanced groups functions with safe fallbacks
    async searchGroups(query) {
        const maxRetries = 2;
        
        if (!query || typeof query !== 'string') {
            return {
                ok: false,
                data: [],
                error: 'Invalid search query'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/search?q=${encodeURIComponent(query)}`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Search attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Search error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to search groups'
        };
    }
    
    async getGroupMembers(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/members`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get members attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get members error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group members'
        };
    }
    
    async getGroupMessages(groupId, limit = 50, before = null) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        if (typeof limit !== 'number' || limit < 1 || limit > 200) {
            limit = 50;
        }
        
        let url = `/api/groups/${groupId}/messages?limit=${limit}`;
        if (before) {
            url += `&before=${encodeURIComponent(before)}`;
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(url, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get messages attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get messages error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group messages'
        };
    }
    
    async getGroupMoods(groupId, limit = 50) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
            limit = 50;
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/moods?limit=${limit}`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get moods attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get moods error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group moods'
        };
    }
    
    async getGroupNotes(groupId, limit = 50) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
            limit = 50;
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/notes?limit=${limit}`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get notes attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get notes error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group notes'
        };
    }
    
    async getGroupPurposes(groupId, limit = 50) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
            limit = 50;
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/purposes?limit=${limit}`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get purposes attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get purposes error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group purposes'
        };
    }
    
    async getGroupTransparency(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: {},
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/transparency`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: {},
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get transparency attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get transparency error after retries:', error);
                    return {
                        ok: false,
                        data: {},
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: {},
            error: 'Failed to load group transparency'
        };
    }
    
    async updateGroupMemberRole(groupId, userId, role) {
        const maxRetries = 2;
        
        if (!groupId || !userId || !role) {
            return {
                ok: false,
                error: 'Group ID, User ID, and Role are required'
            };
        }
        
        if (typeof role !== 'string' || !['admin', 'moderator', 'member'].includes(role)) {
            return {
                ok: false,
                error: 'Invalid role specified'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/members/${userId}/role`, {
                    method: 'PUT',
                    body: { role }
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Update member role attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Update member role error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to update member role'
        };
    }
    
    async getGroupInvites(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/invites`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get invites attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get invites error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group invites'
        };
    }
    
    async createGroupInvite(groupId, expiresIn = '7d') {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                error: 'Group ID is required'
            };
        }
        
        if (typeof expiresIn !== 'string' || !['1h', '1d', '7d', '30d'].includes(expiresIn)) {
            return {
                ok: false,
                error: 'Invalid expiration time'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/invites`, {
                    method: 'POST',
                    body: { expiresIn }
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Create invite attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Create invite error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to create group invite'
        };
    }
    
    async acceptGroupInvite(inviteCode) {
        const maxRetries = 2;
        
        if (!inviteCode || typeof inviteCode !== 'string') {
            return {
                ok: false,
                error: 'Valid invite code is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/invites/${inviteCode}/accept`, {
                    method: 'POST'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Accept invite attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Accept invite error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to accept group invitation'
        };
    }
    
    async rejectGroupInvite(inviteCode) {
        const maxRetries = 2;
        
        if (!inviteCode || typeof inviteCode !== 'string') {
            return {
                ok: false,
                error: 'Valid invite code is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/invites/${inviteCode}/reject`, {
                    method: 'POST'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Reject invite attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Reject invite error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to reject group invitation'
        };
    }
    
    async declineGroupInvite(inviteCode) {
        return this.rejectGroupInvite(inviteCode);
    }
    
    async revokeGroupInvite(groupId, inviteId) {
        const maxRetries = 2;
        
        if (!groupId || !inviteId) {
            return {
                ok: false,
                error: 'Group ID and Invite ID are required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/invites/${inviteId}`, {
                    method: 'DELETE'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Revoke invite attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Revoke invite error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to revoke group invitation'
        };
    }
    
    async joinGroupByInvite(inviteCode) {
        const maxRetries = 2;
        
        if (!inviteCode || typeof inviteCode !== 'string') {
            return {
                ok: false,
                error: 'Valid invite code is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/join/${inviteCode}`, {
                    method: 'POST'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Join by invite attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Join by invite error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to join group'
        };
    }
    
    async joinGroupDirect(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/join`, {
                    method: 'POST'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Join group attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Join group error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to join group'
        };
    }
    
    async getGroupSettings(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: {},
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/settings`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: {},
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get settings attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get settings error after retries:', error);
                    return {
                        ok: false,
                        data: {},
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: {},
            error: 'Failed to load group settings'
        };
    }
    
    async updateGroupSettings(groupId, settings) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                error: 'Group ID is required'
            };
        }
        
        if (!settings || typeof settings !== 'object') {
            return {
                ok: false,
                error: 'Valid settings object is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/settings`, {
                    method: 'PUT',
                    body: settings
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Update settings attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Update settings error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to update group settings'
        };
    }
    
    async getGroupActivity(groupId, limit = 50) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
            limit = 50;
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/activity?limit=${limit}`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get activity attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get activity error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group activity'
        };
    }
    
    async getGroupEvents(groupId, limit = 50) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                data: [],
                error: 'Group ID is required'
            };
        }
        
        if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
            limit = 50;
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/events?limit=${limit}`, {
                    method: 'GET'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    data: [],
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get events attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get events error after retries:', error);
                    return {
                        ok: false,
                        data: [],
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            data: [],
            error: 'Failed to load group events'
        };
    }
    
    async muteGroup(groupId, duration = '1h') {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                error: 'Group ID is required'
            };
        }
        
        if (typeof duration !== 'string' || !['15m', '1h', '8h', '24h', '7d'].includes(duration)) {
            duration = '1h';
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/mute`, {
                    method: 'POST',
                    body: { duration }
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Mute attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Mute error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to mute group'
        };
    }
    
    async unmuteGroup(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/unmute`, {
                    method: 'POST'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Unmute attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Unmute error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to unmute group'
        };
    }
    
    async archiveGroup(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/archive`, {
                    method: 'POST'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Archive attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Archive error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to archive group'
        };
    }
    
    async unarchiveGroup(groupId) {
        const maxRetries = 2;
        
        if (!groupId) {
            return {
                ok: false,
                error: 'Group ID is required'
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await secureApiFetch(`/api/groups/${groupId}/unarchive`, {
                    method: 'POST'
                });
                
                if (response && typeof response === 'object') {
                    return this.formatResponse(response);
                }
                
                return {
                    ok: false,
                    error: 'Invalid response format from server'
                };
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Unarchive attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Unarchive error after retries:', error);
                    return {
                        ok: false,
                        error: error.message
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to unarchive group'
        };
    }
    
    async createGroupWithValidation(groupData) {
        if (!groupData || typeof groupData !== 'object') {
            return {
                ok: false,
                error: 'Invalid group data'
            };
        }
        
        // Validate required fields
        if (!groupData.name || groupData.name.trim().length < 2) {
            return {
                ok: false,
                error: 'Group name must be at least 2 characters long'
            };
        }
        
        if (groupData.name.length > 100) {
            return {
                ok: false,
                error: 'Group name must be less than 100 characters'
            };
        }
        
        // Add current user as admin
        const currentUser = getCurrentUser();
        if (currentUser) {
            groupData.members = [
                ...(groupData.members || []),
                {
                    userId: currentUser.id,
                    role: 'admin'
                }
            ];
        }
        
        // Set default settings if not provided
        groupData.settings = {
            allowInvites: true,
            requireApproval: false,
            allowMemberMessages: true,
            ...groupData.settings
        };
        
        return await this.createGroup(groupData);
    }
    
    // Get groups with caching for offline access
    async getGroupsWithCache(forceRefresh = false) {
        const maxRetries = 2;
        const now = Date.now();
        const GROUPS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        
        // Return cached data if valid and not forcing refresh
        const cached = this.groupCache.get('active');
        if (!forceRefresh && cached && cached.timestamp && (now - cached.timestamp) < GROUPS_CACHE_DURATION) {
            console.log('📦 [GROUPS] Returning cached groups');
            return {
                ok: true,
                data: cached.data,
                cached: true,
                timestamp: cached.timestamp
            };
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.fetchGroups('active');
                
                if (response.ok && response.data) {
                    // Update cache
                    this.groupCache.set('active', {
                        data: response.data,
                        timestamp: now,
                        ok: true
                    });
                    
                    // Store in localStorage for offline access
                    try {
                        localStorage.setItem('groups_cache', JSON.stringify({
                            data: response.data,
                            timestamp: now
                        }));
                    } catch (e) {
                        console.warn('⚠️ [GROUPS] Could not cache to localStorage:', e.message);
                    }
                }
                return response;
            } catch (error) {
                console.warn(`⚠️ [GROUPS] Get groups attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    console.error('❌ [GROUPS] Get groups error after retries:', error);
                    
                    // Try to load from localStorage cache as fallback
                    try {
                        const cachedData = localStorage.getItem('groups_cache');
                        if (cachedData) {
                            const parsed = JSON.parse(cachedData);
                            if (parsed.data && parsed.timestamp) {
                                console.log('📦 [GROUPS] Using localStorage cache as fallback');
                                return {
                                    ok: true,
                                    data: parsed.data,
                                    cached: true,
                                    offline: true,
                                    message: 'Using cached data (offline mode)',
                                    timestamp: parsed.timestamp
                                };
                            }
                        }
                    } catch (cacheError) {
                        console.warn('⚠️ [GROUPS] Cache read error:', cacheError);
                    }
                    
                    return {
                        ok: false,
                        error: error.message,
                        data: [],
                        offline: true
                    };
                }
                
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }
        
        return {
            ok: false,
            error: 'Failed to load groups',
            data: [],
            offline: true
        };
    }
}

// Create singleton instance
const apiGroupManager = new ApiGroupManager();

// ============================================
// SINGLE SOURCE OF TRUTH - EXPORTS
// ============================================

// Export the manager instance as main API - PRIMARY EXPORT
export const apiGroup = {
    // Core methods
    fetchGroups: (listType) => apiGroupManager.fetchGroups(listType),
    createGroup: (groupData) => apiGroupManager.createGroup(groupData),
    updateGroup: (groupId, updates) => apiGroupManager.updateGroup(groupId, updates),
    deleteGroup: (groupId) => apiGroupManager.deleteGroup(groupId),
    joinGroup: (groupId) => apiGroupManager.joinGroup(groupId),
    leaveGroup: (groupId) => apiGroupManager.leaveGroup(groupId),
    sendGroupMessage: (groupId, message) => apiGroupManager.sendGroupMessage(groupId, message),
    
    // Event system
    on: (event, callback) => apiGroupManager.on(event, callback),
    
    // Communication
    sendToIframe: (iframeId, data) => apiGroupManager.sendToIframe(iframeId, data),
    broadcastToParent: (event, data) => apiGroupManager.broadcastToParent(event, data),
    
    // Additional methods
    initialize: () => apiGroupManager.initialize(),
    searchGroups: (query) => apiGroupManager.searchGroups(query),
    getGroupMembers: (groupId) => apiGroupManager.getGroupMembers(groupId),
    getGroupMessages: (groupId, limit, before) => apiGroupManager.getGroupMessages(groupId, limit, before),
    getGroupMoods: (groupId, limit) => apiGroupManager.getGroupMoods(groupId, limit),
    getGroupNotes: (groupId, limit) => apiGroupManager.getGroupNotes(groupId, limit),
    getGroupPurposes: (groupId, limit) => apiGroupManager.getGroupPurposes(groupId, limit),
    getGroupTransparency: (groupId) => apiGroupManager.getGroupTransparency(groupId),
    updateGroupMemberRole: (groupId, userId, role) => apiGroupManager.updateGroupMemberRole(groupId, userId, role),
    getGroupInvites: (groupId) => apiGroupManager.getGroupInvites(groupId),
    createGroupInvite: (groupId, expiresIn) => apiGroupManager.createGroupInvite(groupId, expiresIn),
    acceptGroupInvite: (inviteCode) => apiGroupManager.acceptGroupInvite(inviteCode),
    rejectGroupInvite: (inviteCode) => apiGroupManager.rejectGroupInvite(inviteCode),
    declineGroupInvite: (inviteCode) => apiGroupManager.declineGroupInvite(inviteCode),
    revokeGroupInvite: (groupId, inviteId) => apiGroupManager.revokeGroupInvite(groupId, inviteId),
    joinGroupByInvite: (inviteCode) => apiGroupManager.joinGroupByInvite(inviteCode),
    getGroupSettings: (groupId) => apiGroupManager.getGroupSettings(groupId),
    updateGroupSettings: (groupId, settings) => apiGroupManager.updateGroupSettings(groupId, settings),
    getGroupActivity: (groupId, limit) => apiGroupManager.getGroupActivity(groupId, limit),
    getGroupEvents: (groupId, limit) => apiGroupManager.getGroupEvents(groupId, limit),
    muteGroup: (groupId, duration) => apiGroupManager.muteGroup(groupId, duration),
    unmuteGroup: (groupId) => apiGroupManager.unmuteGroup(groupId),
    archiveGroup: (groupId) => apiGroupManager.archiveGroup(groupId),
    unarchiveGroup: (groupId) => apiGroupManager.unarchiveGroup(groupId),
    createGroupWithValidation: (groupData) => apiGroupManager.createGroupWithValidation(groupData),
    getGroupsWithCache: (forceRefresh) => apiGroupManager.getGroupsWithCache(forceRefresh)
};

// Export individual functions for named imports - SECONDARY EXPORTS
export const initialize = () => apiGroupManager.initialize();
export const searchGroups = (query) => apiGroupManager.searchGroups(query);
export const getGroupMembers = (groupId) => apiGroupManager.getGroupMembers(groupId);
export const getGroupMessages = (groupId, limit = 50, before = null) => apiGroupManager.getGroupMessages(groupId, limit, before);
export const sendGroupMessage = (groupId, message) => apiGroupManager.sendGroupMessage(groupId, message);
export const getGroupMoods = (groupId, limit = 50) => apiGroupManager.getGroupMoods(groupId, limit);
export const getGroupNotes = (groupId, limit = 50) => apiGroupManager.getGroupNotes(groupId, limit);
export const getGroupPurposes = (groupId, limit = 50) => apiGroupManager.getGroupPurposes(groupId, limit);
export const getGroupTransparency = (groupId) => apiGroupManager.getGroupTransparency(groupId);
export const updateGroupMemberRole = (groupId, userId, role) => apiGroupManager.updateGroupMemberRole(groupId, userId, role);
export const getGroupInvites = (groupId) => apiGroupManager.getGroupInvites(groupId);
export const createGroupInvite = (groupId, expiresIn = '7d') => apiGroupManager.createGroupInvite(groupId, expiresIn);
export const acceptGroupInvite = (inviteCode) => apiGroupManager.acceptGroupInvite(inviteCode);
export const rejectGroupInvite = (inviteCode) => apiGroupManager.rejectGroupInvite(inviteCode);
export const declineGroupInvite = (inviteCode) => apiGroupManager.declineGroupInvite(inviteCode);
export const revokeGroupInvite = (groupId, inviteId) => apiGroupManager.revokeGroupInvite(groupId, inviteId);
export const joinGroupByInvite = (inviteCode) => apiGroupManager.joinGroupByInvite(inviteCode);
export const joinGroup = (groupId) => apiGroupManager.joinGroup(groupId);
export const getGroupSettings = (groupId) => apiGroupManager.getGroupSettings(groupId);
export const updateGroupSettings = (groupId, settings) => apiGroupManager.updateGroupSettings(groupId, settings);
export const getGroupActivity = (groupId, limit = 50) => apiGroupManager.getGroupActivity(groupId, limit);
export const getGroupEvents = (groupId, limit = 50) => apiGroupManager.getGroupEvents(groupId, limit);
export const muteGroup = (groupId, duration = '1h') => apiGroupManager.muteGroup(groupId, duration);
export const unmuteGroup = (groupId) => apiGroupManager.unmuteGroup(groupId);
export const archiveGroup = (groupId) => apiGroupManager.archiveGroup(groupId);
export const unarchiveGroup = (groupId) => apiGroupManager.unarchiveGroup(groupId);
export const createGroupWithValidation = (groupData) => apiGroupManager.createGroupWithValidation(groupData);
export const getGroupsWithCache = (forceRefresh = false) => apiGroupManager.getGroupsWithCache(forceRefresh);

// Export groupsApi object for backward compatibility
export const groupsApi = {
    initialize: () => apiGroupManager.initialize(),
    createGroup: (groupData) => apiGroupManager.createGroup(groupData),
    getGroups: (listType) => apiGroupManager.fetchGroups(listType || 'active'),
    getGroupDetails: getGroupDetails,
    updateGroup: (groupId, updates) => apiGroupManager.updateGroup(groupId, updates),
    deleteGroup: (groupId) => apiGroupManager.deleteGroup(groupId),
    addGroupMember: addGroupMember,
    removeGroupMember: removeGroupMember,
    leaveGroup: (groupId) => apiGroupManager.leaveGroup(groupId),
    joinGroup: (groupId) => apiGroupManager.joinGroup(groupId),
    sendGroupMessage: (groupId, message) => apiGroupManager.sendGroupMessage(groupId, message),
    searchGroups: (query) => apiGroupManager.searchGroups(query),
    getGroupMembers: (groupId) => apiGroupManager.getGroupMembers(groupId),
    getGroupMessages: (groupId, limit, before) => apiGroupManager.getGroupMessages(groupId, limit, before),
    getGroupMoods: (groupId, limit) => apiGroupManager.getGroupMoods(groupId, limit),
    getGroupNotes: (groupId, limit) => apiGroupManager.getGroupNotes(groupId, limit),
    getGroupPurposes: (groupId, limit) => apiGroupManager.getGroupPurposes(groupId, limit),
    getGroupTransparency: (groupId) => apiGroupManager.getGroupTransparency(groupId),
    updateGroupMemberRole: (groupId, userId, role) => apiGroupManager.updateGroupMemberRole(groupId, userId, role),
    getGroupInvites: (groupId) => apiGroupManager.getGroupInvites(groupId),
    createGroupInvite: (groupId, expiresIn) => apiGroupManager.createGroupInvite(groupId, expiresIn),
    acceptGroupInvite: (inviteCode) => apiGroupManager.acceptGroupInvite(inviteCode),
    rejectGroupInvite: (inviteCode) => apiGroupManager.rejectGroupInvite(inviteCode),
    declineGroupInvite: (inviteCode) => apiGroupManager.declineGroupInvite(inviteCode),
    revokeGroupInvite: (groupId, inviteId) => apiGroupManager.revokeGroupInvite(groupId, inviteId),
    joinGroupByInvite: (inviteCode) => apiGroupManager.joinGroupByInvite(inviteCode),
    getGroupSettings: (groupId) => apiGroupManager.getGroupSettings(groupId),
    updateGroupSettings: (groupId, settings) => apiGroupManager.updateGroupSettings(groupId, settings),
    getGroupActivity: (groupId, limit) => apiGroupManager.getGroupActivity(groupId, limit),
    getGroupEvents: (groupId, limit) => apiGroupManager.getGroupEvents(groupId, limit),
    muteGroup: (groupId, duration) => apiGroupManager.muteGroup(groupId, duration),
    unmuteGroup: (groupId) => apiGroupManager.unmuteGroup(groupId),
    archiveGroup: (groupId) => apiGroupManager.archiveGroup(groupId),
    unarchiveGroup: (groupId) => apiGroupManager.unarchiveGroup(groupId),
    createGroupWithValidation: (groupData) => apiGroupManager.createGroupWithValidation(groupData),
    getGroupsWithCache: (forceRefresh) => apiGroupManager.getGroupsWithCache(forceRefresh)
};

// Auto-initialize when module loads - with delay to ensure core is ready
setTimeout(() => {
    apiGroupManager.initialize().then(result => {
        if (result.ok) {
            console.log("✅ api-groups.js loaded v2.0.2 - Ready");
        } else {
            console.warn("⚠️ api-groups.js loaded v2.0.2 - Initialization failed:", result.error);
        }
    }).catch(error => {
        console.warn("⚠️ api-groups.js initialization error:", error.message);
    });
}, 200);

console.log("📦 api-groups.js v2.0.2 module loaded");