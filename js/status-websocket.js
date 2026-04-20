// status-websocket.js - Real-time Status WebSocket Integration
// Handles live status updates, viewer counts, and expiration events

class StatusWebSocket {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.eventListeners = new Map();
        this.isConnected = false;
    }

    // Initialize WebSocket connection
    init() {
        if (this.socket) return;

        // Get socket from parent window or create new one
        if (window.parent && window.parent.socket) {
            this.socket = window.parent.socket;
        } else if (window.socket) {
            this.socket = window.socket;
        } else {
            console.warn('StatusWebSocket: No socket connection available');
            return;
        }

        this.setupEventListeners();
        this.isConnected = true;
    }

    // Setup WebSocket event listeners
    setupEventListeners() {
        if (!this.socket) return;

        // Status created event
        this.socket.on('status:created', (data) => {
            this.handleStatusCreated(data);
        });

        // Status viewed event  
        this.socket.on('status:viewed', (data) => {
            this.handleStatusViewed(data);
        });

        // Status viewer update event
        this.socket.on('status:viewer_update', (data) => {
            this.handleViewerUpdate(data);
        });

        // Status expired event
        this.socket.on('status:expired', (data) => {
            this.handleStatusExpired(data);
        });

        // Status updated event
        this.socket.on('status:updated', (data) => {
            this.handleStatusUpdated(data);
        });

        // Status deleted event
        this.socket.on('status:deleted', (data) => {
            this.handleStatusDeleted(data);
        });

        // Connection events
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('StatusWebSocket: Connected');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('StatusWebSocket: Disconnected');
            this.scheduleReconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('StatusWebSocket: Connection error:', error);
            this.scheduleReconnect();
        });
    }

    // Handle new status creation
    handleStatusCreated(data) {
        console.log('StatusWebSocket: New status created', data);
        
        // Update UI if we're on the status page
        if (typeof addStatus === 'function') {
            addStatus({
                id: data.statusId,
                userId: data.userId,
                type: data.type,
                content: data.content,
                mediaUrl: data.mediaUrl,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
                user: data.user || null
            });
        }

        // Cache the new status
        if (window.StatusCache) {
            window.StatusCache.cacheStatus({
                id: data.statusId,
                userId: data.userId,
                type: data.type,
                content: data.content,
                mediaUrl: data.mediaUrl,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt
            }).catch(console.error);
        }

        // Show notification for friends' statuses
        const currentUser = window.currentUser || (window.auth && window.auth.currentUser);
        if (currentUser && data.userId !== currentUser.id) {
            if (typeof showNotification === 'function') {
                showNotification('New status from your friend!', 'info');
            }
        }

        // Emit custom event for other components
        this.emit('status:created', data);
    }

    // Handle status viewed event
    handleStatusViewed(data) {
        console.log('StatusWebSocket: Status viewed', data);
        
        // Update viewer count in UI
        if (typeof updateStatusViewerCount === 'function') {
            updateStatusViewerCount(data.statusId, data.viewerId);
        }

        // Update cache
        if (window.StatusCache) {
            window.StatusCache.getCachedStatus(data.statusId).then(status => {
                if (status) {
                    if (!status.viewers) status.viewers = [];
                    if (!status.viewers.includes(data.viewerId)) {
                        status.viewers.push(data.viewerId);
                        window.StatusCache.cacheStatus(status).catch(console.error);
                    }
                }
            }).catch(console.error);
        }

        this.emit('status:viewed', data);
    }

    // Handle viewer count update
    handleViewerUpdate(data) {
        console.log('StatusWebSocket: Viewer update', data);
        
        // Update viewer count in UI
        if (typeof updateViewerCountUI === 'function') {
            updateViewerCountUI(data.statusId, data.viewerCount);
        }

        this.emit('status:viewer_update', data);
    }

    // Handle status expiration
    handleStatusExpired(data) {
        console.log('StatusWebSocket: Status expired', data);
        
        // Remove from UI
        if (typeof removeStatus === 'function') {
            removeStatus(data.statusId);
        }

        // Remove from cache
        if (window.StatusCache) {
            window.StatusCache.getCachedStatus(data.statusId).then(status => {
                if (status) {
                    status.isExpired = true;
                    window.StatusCache.cacheStatus(status).catch(console.error);
                }
            }).catch(console.error);
        }

        // Show notification if it's user's own status
        const currentUser = window.currentUser || (window.auth && window.auth.currentUser);
        if (currentUser && data.userId === currentUser.id) {
            if (typeof showNotification === 'function') {
                showNotification('Your status has expired', 'info');
            }
        }

        this.emit('status:expired', data);
    }

    // Handle status update
    handleStatusUpdated(data) {
        console.log('StatusWebSocket: Status updated', data);
        
        // Update in UI
        if (typeof updateStatusInUI === 'function') {
            updateStatusInUI(data.statusId, data.updates);
        }

        // Update in cache
        if (window.StatusCache) {
            window.StatusCache.getCachedStatus(data.statusId).then(status => {
                if (status) {
                    Object.assign(status, data.updates);
                    window.StatusCache.cacheStatus(status).catch(console.error);
                }
            }).catch(console.error);
        }

        this.emit('status:updated', data);
    }

    // Handle status deletion
    handleStatusDeleted(data) {
        console.log('StatusWebSocket: Status deleted', data);
        
        // Remove from UI
        if (typeof removeStatus === 'function') {
            removeStatus(data.statusId);
        }

        // Remove from cache
        if (window.StatusCache) {
            // Note: We don't have a direct remove method, so we'll mark as deleted
            window.StatusCache.getCachedStatus(data.statusId).then(status => {
                if (status) {
                    status.deleted = true;
                    window.StatusCache.cacheStatus(status).catch(console.error);
                }
            }).catch(console.error);
        }

        this.emit('status:deleted', data);
    }

    // Schedule reconnection attempt
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('StatusWebSocket: Max reconnect attempts reached');
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        
        setTimeout(() => {
            this.reconnectAttempts++;
            console.log(`StatusWebSocket: Reconnection attempt ${this.reconnectAttempts}`);
            this.init();
        }, delay);
    }

    // Add custom event listener
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }

    // Remove custom event listener
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(callback);
        }
    }

    // Emit custom event
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('StatusWebSocket event listener error:', error);
                }
            });
        }
    }

    // Send status view event
    async sendStatusView(statusId) {
        if (!this.isConnected || !this.socket) return false;

        try {
            this.socket.emit('status:view', { statusId });
            return true;
        } catch (error) {
            console.error('StatusWebSocket: Failed to send status view:', error);
            return false;
        }
    }

    // Get connection status
    getStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            eventListenersCount: Array.from(this.eventListeners.values())
                .reduce((total, listeners) => total + listeners.size, 0)
        };
    }

    // Disconnect
    disconnect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket = null;
        }
        this.isConnected = false;
        this.eventListeners.clear();
    }
}

// Export singleton instance
window.StatusWebSocket = new StatusWebSocket();

// Auto-initialize when DOM is ready and dependencies are available
function initializeStatusWebSocket() {
    // Wait for socket to be available
    const checkSocket = () => {
        if (window.socket || (window.parent && window.parent.socket)) {
            window.StatusWebSocket.init();
        } else {
            setTimeout(checkSocket, 100);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkSocket);
    } else {
        checkSocket();
    }
}

// Initialize
initializeStatusWebSocket();
