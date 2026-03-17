/**
 * Kynecta Message Service
 * Abstraction layer for message-related API calls
 * @version 1.0.0
 */

(function() {
    'use strict';

    class MessageService {
        constructor() {
            this._cache = new Map();
            this._pendingRequests = new Map();
            this._retryConfig = {
                maxRetries: 3,
                baseDelay: 1000,
                maxDelay: 10000
            };
        }

        /**
         * Send a message
         * @param {Object} messageData - Message data
         * @param {string} messageData.chatId - Chat/conversation ID
         * @param {string} messageData.content - Message content
         * @param {string} messageData.type - Message type (text, image, file, etc.)
         * @param {Object} messageData.metadata - Additional metadata
         * @returns {Promise} Resolves with sent message
         */
        async sendMessage(messageData) {
            try {
                const response = await this._makeRequest('POST', '/api/messages', messageData);
                
                // Update store if available
                if (window.KynectaStore) {
                    const messages = window.KynectaStore.get(`messages.byChat.${messageData.chatId}`) || [];
                    window.KynectaStore.set(
                        `messages.byChat.${messageData.chatId}`,
                        [...messages, response.data]
                    );
                }

                // Emit event
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('MESSAGE_SENT', response.data);
                }

                return response.data;
            } catch (error) {
                // Queue for offline delivery
                if (!navigator.onLine) {
                    return this._queueOfflineMessage('send', messageData);
                }
                throw error;
            }
        }

        /**
         * Get messages for a chat
         * @param {string} chatId - Chat ID
         * @param {Object} options - Pagination options
         * @param {number} options.limit - Messages per page
         * @param {string} options.before - Cursor for pagination
         * @returns {Promise} Resolves with messages
         */
        async getMessages(chatId, options = {}) {
            const cacheKey = `chat_${chatId}_${options.before || 'latest'}`;
            
            // Check cache
            if (this._cache.has(cacheKey)) {
                const cached = this._cache.get(cacheKey);
                if (Date.now() - cached.timestamp < 30000) { // 30 second cache
                    return cached.data;
                }
            }

            // Prevent duplicate requests
            if (this._pendingRequests.has(cacheKey)) {
                return this._pendingRequests.get(cacheKey);
            }

            const params = new URLSearchParams({
                limit: options.limit || 50,
                ...(options.before && { before: options.before })
            });

            const requestPromise = this._makeRequest('GET', `/api/chats/${chatId}/messages?${params}`)
                .then(response => {
                    this._cache.set(cacheKey, {
                        data: response.data,
                        timestamp: Date.now()
                    });
                    this._pendingRequests.delete(cacheKey);
                    
                    // Update store
                    if (window.KynectaStore) {
                        const existing = window.KynectaStore.get(`messages.byChat.${chatId}`) || [];
                        const merged = this._mergeMessages(existing, response.data);
                        window.KynectaStore.set(`messages.byChat.${chatId}`, merged);
                    }
                    
                    return response.data;
                })
                .catch(error => {
                    this._pendingRequests.delete(cacheKey);
                    throw error;
                });

            this._pendingRequests.set(cacheKey, requestPromise);
            return requestPromise;
        }

        /**
         * Delete a message
         * @param {string} messageId - Message ID
         * @param {string} chatId - Chat ID (for store updates)
         * @returns {Promise}
         */
        async deleteMessage(messageId, chatId) {
            const response = await this._makeRequest('DELETE', `/api/messages/${messageId}`);
            
            // Update store
            if (window.KynectaStore && chatId) {
                const messages = window.KynectaStore.get(`messages.byChat.${chatId}`) || [];
                const updated = messages.filter(msg => msg.id !== messageId);
                window.KynectaStore.set(`messages.byChat.${chatId}`, updated);
            }

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('MESSAGE_DELETED', { messageId, chatId });
            }

            return response.data;
        }

        /**
         * Edit a message
         * @param {string} messageId - Message ID
         * @param {string} content - New content
         * @param {string} chatId - Chat ID (for store updates)
         * @returns {Promise}
         */
        async editMessage(messageId, content, chatId) {
            const response = await this._makeRequest('PUT', `/api/messages/${messageId}`, { content });
            
            // Update store
            if (window.KynectaStore && chatId) {
                const messages = window.KynectaStore.get(`messages.byChat.${chatId}`) || [];
                const updated = messages.map(msg => 
                    msg.id === messageId ? { ...msg, content, edited: true } : msg
                );
                window.KynectaStore.set(`messages.byChat.${chatId}`, updated);
            }

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('MESSAGE_EDITED', { messageId, content, chatId });
            }

            return response.data;
        }

        /**
         * Mark messages as read
         * @param {string} chatId - Chat ID
         * @param {Array} messageIds - Message IDs to mark as read
         * @returns {Promise}
         */
        async markAsRead(chatId, messageIds) {
            const response = await this._makeRequest('POST', `/api/chats/${chatId}/read`, { messageIds });
            
            // Update store
            if (window.KynectaStore) {
                const messages = window.KynectaStore.get(`messages.byChat.${chatId}`) || [];
                const updated = messages.map(msg => 
                    messageIds.includes(msg.id) ? { ...msg, read: true } : msg
                );
                window.KynectaStore.set(`messages.byChat.${chatId}`, updated);
                
                // Update unread count
                const unread = window.KynectaStore.get('messages.unread') || {};
                delete unread[chatId];
                window.KynectaStore.set('messages.unread', unread);
            }

            return response.data;
        }

        /**
         * Send typing indicator
         * @param {string} chatId - Chat ID
         * @param {boolean} isTyping - Typing status
         */
        async sendTyping(chatId, isTyping) {
            if (!navigator.onLine) return;

            try {
                await this._makeRequest('POST', `/api/chats/${chatId}/typing`, { typing: isTyping });
                
                // Update store
                if (window.KynectaStore) {
                    const typing = window.KynectaStore.get('messages.typing') || {};
                    if (isTyping) {
                        typing[chatId] = Date.now();
                    } else {
                        delete typing[chatId];
                    }
                    window.KynectaStore.set('messages.typing', typing);
                }
            } catch (error) {
                // Silently fail - typing indicators are non-critical
            }
        }

        /**
         * Upload file attachment
         * @param {File} file - File to upload
         * @param {Function} onProgress - Progress callback
         * @returns {Promise} Resolves with file metadata
         */
        async uploadFile(file, onProgress = null) {
            const formData = new FormData();
            formData.append('file', file);

            const options = {
                method: 'POST',
                body: formData,
                headers: {} // Let browser set content-type with boundary
            };

            if (onProgress) {
                options.onUploadProgress = onProgress;
            }

            const response = await this._makeRequest('POST', '/api/files/upload', null, options);
            return response.data;
        }

        // ========== PRIVATE METHODS ==========

        async _makeRequest(method, endpoint, data = null, customOptions = {}) {
            // Get token from various sources
            let token = null;
            if (window.__PARENT_SESSION__?.token) {
                token = window.__PARENT_SESSION__.token;
            } else if (window.AUTH_SESSION?.token) {
                token = window.AUTH_SESSION.token;
            } else if (window.localStorage) {
                token = window.localStorage.getItem('kynecta_token');
            }

            const headers = {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
                ...customOptions.headers
            };

            const options = {
                method,
                headers,
                credentials: 'include',
                ...customOptions
            };

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            // Use api.request.js if available
            if (window.api?.request) {
                return window.api.request.request(endpoint, options);
            }

            // Fallback to fetch with retry logic
            return this._fetchWithRetry(endpoint, options);
        }

        async _fetchWithRetry(endpoint, options, attempt = 1) {
            try {
                const response = await fetch(endpoint, options);
                
                if (!response.ok) {
                    if (response.status === 401) {
                        // Try to refresh token
                        const refreshed = await this._refreshToken();
                        if (refreshed) {
                            options.headers['Authorization'] = `Bearer ${refreshed}`;
                            return this._fetchWithRetry(endpoint, options, attempt);
                        }
                    }
                    
                    if (response.status >= 500 && attempt <= this._retryConfig.maxRetries) {
                        const delay = Math.min(
                            this._retryConfig.baseDelay * Math.pow(2, attempt - 1),
                            this._retryConfig.maxDelay
                        );
                        await new Promise(r => setTimeout(r, delay));
                        return this._fetchWithRetry(endpoint, options, attempt + 1);
                    }
                    
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return await response.json();
            } catch (error) {
                if (attempt <= this._retryConfig.maxRetries && navigator.onLine) {
                    const delay = Math.min(
                        this._retryConfig.baseDelay * Math.pow(2, attempt - 1),
                        this._retryConfig.maxDelay
                    );
                    await new Promise(r => setTimeout(r, delay));
                    return this._fetchWithRetry(endpoint, options, attempt + 1);
                }
                throw error;
            }
        }

        async _refreshToken() {
            try {
                const refreshToken = window.localStorage.getItem('kynecta_refresh_token');
                if (!refreshToken) return null;

                const response = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                });

                if (!response.ok) return null;

                const data = await response.json();
                
                // Update stored token
                window.localStorage.setItem('kynecta_token', data.token);
                if (data.refreshToken) {
                    window.localStorage.setItem('kynecta_refresh_token', data.refreshToken);
                }

                // Update session in parent
                if (window.__PARENT_SESSION__) {
                    window.__PARENT_SESSION__.token = data.token;
                }

                return data.token;
            } catch (error) {
                return null;
            }
        }

        _queueOfflineMessage(action, data) {
            const queue = JSON.parse(localStorage.getItem('kynecta_offline_queue') || '[]');
            
            const queuedItem = {
                id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                action,
                data,
                timestamp: Date.now()
            };
            
            queue.push(queuedItem);
            localStorage.setItem('kynecta_offline_queue', JSON.stringify(queue));

            // Emit offline queued event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('MESSAGE_OFFLINE_QUEUED', queuedItem);
            }

            return { queued: true, id: queuedItem.id };
        }

        _mergeMessages(existing, incoming) {
            const messageMap = new Map();
            
            existing.forEach(msg => messageMap.set(msg.id, msg));
            incoming.forEach(msg => messageMap.set(msg.id, msg));
            
            return Array.from(messageMap.values())
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }
    }

    // Initialize and expose globally
    window.services = window.services || {};
    window.services.message = new MessageService();

    console.log('[MessageService] ✅ Ready');
})();