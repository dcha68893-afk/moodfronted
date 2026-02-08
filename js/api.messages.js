// js/api.messages.js
// ES Module for Message Handling - Contains ONLY functions missing from existing API modules
// Version: 1.0.0
// Date: 2024-01-02

/**
 * MESSAGE_TYPES constant - Defines standard message types for parent-child iframe communication
 * This was missing from all existing API modules and is required for in-frame pages
 */
export const MESSAGE_TYPES = {
    // Authentication messages
    AUTH_TOKEN: 'AUTH_TOKEN',
    AUTH_STATUS: 'AUTH_STATUS',
    AUTH_REFRESH: 'AUTH_REFRESH',
    
    // Data synchronization messages
    DATA_UPDATE: 'DATA_UPDATE',
    DATA_REFRESH: 'DATA_REFRESH',
    CACHE_INVALIDATE: 'CACHE_INVALIDATE',
    
    // UI/State messages
    UI_STATE: 'UI_STATE',
    MODAL_OPEN: 'MODAL_OPEN',
    MODAL_CLOSE: 'MODAL_CLOSE',
    NOTIFICATION: 'NOTIFICATION',
    
    // Navigation messages
    NAVIGATE: 'NAVIGATE',
    ROUTE_CHANGE: 'ROUTE_CHANGE',
    
    // Feature-specific messages
    MESSAGE_SENT: 'MESSAGE_SENT',
    MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
    FRIEND_REQUEST: 'FRIEND_REQUEST',
    CALL_START: 'CALL_START',
    CALL_END: 'CALL_END',
    STATUS_UPDATE: 'STATUS_UPDATE',
    
    // System messages
    SYSTEM_READY: 'SYSTEM_READY',
    API_READY: 'API_READY',
    ERROR: 'ERROR',
    WARNING: 'WARNING',
    
    // Custom app messages
    APP_SPECIFIC: 'APP_SPECIFIC'
};

/**
 * sendParentMessage() - Send a message from an iframe to its parent window
 * This function was missing from all existing API modules and is required for in-frame pages
 * 
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {any} data - Message payload
 * @param {string} targetOrigin - Target origin for postMessage (defaults to '*')
 * @returns {boolean} True if message was sent successfully
 */
export function sendParentMessage(type, data, targetOrigin = '*') {
    try {
        // Validate input
        if (!type || typeof type !== 'string') {
            console.error('❌ sendParentMessage: Invalid message type', type);
            return false;
        }
        
        // Check if we're in an iframe
        if (window.parent === window) {
            console.warn('⚠️ sendParentMessage: Not in an iframe, message will be sent to same window');
        }
        
        // Prepare the message object
        const message = {
            type: type,
            data: data || {},
            timestamp: Date.now(),
            source: 'iframe',
            version: '1.0.0'
        };
        
        // Send the message to parent
        window.parent.postMessage(message, targetOrigin);
        
        console.log(`📤 sendParentMessage: Sent "${type}" to parent`, message);
        return true;
        
    } catch (error) {
        console.error('❌ sendParentMessage: Failed to send message', error);
        return false;
    }
}

/**
 * listenToParentMessages() - Set up a listener for messages from parent window
 * This function was missing from all existing API modules and is required for in-frame pages
 * 
 * @param {Function} callback - Function to call when a message is received
 * @param {Array<string>} [filterTypes] - Optional array of message types to listen for
 * @returns {Function} Cleanup function to remove the event listener
 */
export function listenToParentMessages(callback, filterTypes = null) {
    // Validate callback
    if (typeof callback !== 'function') {
        console.error('❌ listenToParentMessages: Callback must be a function');
        return () => {};
    }
    
    // Message handler function
    const messageHandler = (event) => {
        try {
            // Basic validation of the message
            if (!event.data || typeof event.data !== 'object') {
                return; // Ignore non-object messages
            }
            
            const message = event.data;
            
            // Check if message has required fields
            if (!message.type || typeof message.type !== 'string') {
                return; // Ignore messages without type
            }
            
            // Apply type filtering if specified
            if (filterTypes && Array.isArray(filterTypes)) {
                if (!filterTypes.includes(message.type)) {
                    return; // Skip if type not in filter
                }
            }
            
            // Log for debugging
            console.log(`📥 listenToParentMessages: Received "${message.type}"`, message);
            
            // Call the callback with the message
            callback(message, event);
            
        } catch (error) {
            console.error('❌ listenToParentMessages: Error processing message', error, event.data);
        }
    };
    
    // Add the event listener
    window.addEventListener('message', messageHandler);
    
    console.log(`✅ listenToParentMessages: Listener attached${filterTypes ? ` with filter: ${filterTypes.join(', ')}` : ''}`);
    
    // Return cleanup function
    return () => {
        window.removeEventListener('message', messageHandler);
        console.log('✅ listenToParentMessages: Listener removed');
    };
}

/**
 * Additional utility functions for message handling that were missing
 */

/**
 * sendMessageToIframe() - Send a message to a specific iframe (for parent window use)
 * This function was missing from all existing API modules
 * 
 * @param {HTMLIFrameElement} iframe - Target iframe element
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {any} data - Message payload
 * @param {string} targetOrigin - Target origin for postMessage (defaults to '*')
 * @returns {boolean} True if message was sent successfully
 */
export function sendMessageToIframe(iframe, type, data, targetOrigin = '*') {
    try {
        if (!iframe || !iframe.contentWindow) {
            console.error('❌ sendMessageToIframe: Invalid iframe element');
            return false;
        }
        
        if (!type || typeof type !== 'string') {
            console.error('❌ sendMessageToIframe: Invalid message type', type);
            return false;
        }
        
        const message = {
            type: type,
            data: data || {},
            timestamp: Date.now(),
            source: 'parent',
            version: '1.0.0'
        };
        
        iframe.contentWindow.postMessage(message, targetOrigin);
        
        console.log(`📤 sendMessageToIframe: Sent "${type}" to iframe`, message);
        return true;
        
    } catch (error) {
        console.error('❌ sendMessageToIframe: Failed to send message', error);
        return false;
    }
}

/**
 * validateMessage() - Validate message structure
 * This function was missing from all existing API modules
 * 
 * @param {object} message - Message object to validate
 * @returns {boolean} True if message is valid
 */
export function validateMessage(message) {
    if (!message || typeof message !== 'object') {
        return false;
    }
    
    // Required fields
    if (!message.type || typeof message.type !== 'string') {
        return false;
    }
    
    // Optional fields validation
    if (message.data !== undefined && typeof message.data !== 'object' && 
        typeof message.data !== 'string' && typeof message.data !== 'number' && 
        typeof message.data !== 'boolean' && message.data !== null) {
        return false;
    }
    
    if (message.timestamp && typeof message.timestamp !== 'number') {
        return false;
    }
    
    if (message.source && typeof message.source !== 'string') {
        return false;
    }
    
    return true;
}

/**
 * messageResponse() - Create a standardized response message
 * This function was missing from all existing API modules
 * 
 * @param {string} originalType - Original message type that this is responding to
 * @param {any} data - Response data
 * @param {boolean} success - Whether the operation was successful
 * @param {string} [error] - Optional error message
 * @returns {object} Standardized response message
 */
export function messageResponse(originalType, data, success = true, error = null) {
    return {
        type: originalType + '_RESPONSE',
        data: data || {},
        success: success,
        error: error,
        timestamp: Date.now(),
        source: 'response',
        originalType: originalType
    };
}

/**
 * sendMessage() - Send a chat message to a conversation or user
 * This function was missing from existing API modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {string} content - Message content
 * @param {string} [messageType='text'] - Type of message (text, image, file, etc.)
 * @param {object} [metadata={}] - Additional metadata
 * @returns {Promise<object>} Message response
 */
export async function sendMessage(conversationId, content, messageType = 'text', metadata = {}) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                content: content,
                type: messageType,
                metadata: metadata,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to send message: ${response.status}`);
        }

        const messageData = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.MESSAGE_SENT, {
                conversationId: conversationId,
                message: messageData,
                timestamp: Date.now()
            });
        }

        console.log(`✅ sendMessage: Message sent to conversation ${conversationId}`, messageData);
        return messageData;
    } catch (error) {
        console.error('❌ sendMessage: Failed to send message', error);
        
        // Send error notification to parent if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.ERROR, {
                type: 'MESSAGE_SEND_FAILED',
                conversationId: conversationId,
                error: error.message
            });
        }
        
        throw error;
    }
}

/**
 * fetchMessages() - Fetch messages for a conversation
 * This function was missing from existing API modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {number} [limit=50] - Number of messages to fetch
 * @param {string} [before] - Fetch messages before this timestamp
 * @param {string} [after] - Fetch messages after this timestamp
 * @returns {Promise<Array>} Array of messages
 */
export async function fetchMessages(conversationId, limit = 50, before = null, after = null) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        if (before) params.append('before', before);
        if (after) params.append('after', after);

        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/conversations/${conversationId}/messages?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to fetch messages: ${response.status}`);
        }

        const messages = await response.json();
        
        console.log(`✅ fetchMessages: Fetched ${messages.length} messages for conversation ${conversationId}`);
        return messages;
    } catch (error) {
        console.error('❌ fetchMessages: Failed to fetch messages', error);
        throw error;
    }
}

/**
 * markAsRead() - Mark messages as read in a conversation
 * This function was missing from existing API modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {Array<string>} messageIds - Array of message IDs to mark as read
 * @returns {Promise<object>} Status response
 */
export async function markAsRead(conversationId, messageIds) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/conversations/${conversationId}/messages/read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                messageIds: Array.isArray(messageIds) ? messageIds : [messageIds],
                readAt: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to mark messages as read: ${response.status}`);
        }

        const result = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: 'MESSAGES_READ',
                conversationId: conversationId,
                messageIds: messageIds,
                readAt: result.readAt
            });
        }

        console.log(`✅ markAsRead: Marked ${messageIds.length} messages as read in conversation ${conversationId}`);
        return result;
    } catch (error) {
        console.error('❌ markAsRead: Failed to mark messages as read', error);
        throw error;
    }
}

/**
 * addReaction() - Add a reaction to a message
 * This function was missing from existing API modules
 * 
 * @param {string} messageId - ID of the message
 * @param {string} reaction - Reaction emoji or code
 * @returns {Promise<object>} Updated message with reactions
 */
export async function addReaction(messageId, reaction) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                reaction: reaction,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to add reaction: ${response.status}`);
        }

        const updatedMessage = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: 'REACTION_ADDED',
                messageId: messageId,
                reaction: reaction,
                message: updatedMessage
            });
        }

        console.log(`✅ addReaction: Added reaction "${reaction}" to message ${messageId}`);
        return updatedMessage;
    } catch (error) {
        console.error('❌ addReaction: Failed to add reaction', error);
        throw error;
    }
}

/**
 * clearChatHistory() - Clear chat history for a conversation
 * This function was missing and causing errors in messages-core.js
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {boolean} [archive=true] - Whether to archive messages instead of permanent deletion
 * @returns {Promise<object>} Status response
 */
export async function clearChatHistory(conversationId, archive = true) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/conversations/${conversationId}/messages`, {
            method: archive ? 'POST' : 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: archive ? JSON.stringify({
                action: 'archive',
                timestamp: new Date().toISOString()
            }) : null
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to clear chat history: ${response.status}`);
        }

        const result = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: 'CHAT_HISTORY_CLEARED',
                conversationId: conversationId,
                archived: archive,
                timestamp: result.timestamp
            });
        }

        console.log(`✅ clearChatHistory: ${archive ? 'Archived' : 'Deleted'} chat history for conversation ${conversationId}`);
        return result;
    } catch (error) {
        console.error('❌ clearChatHistory: Failed to clear chat history', error);
        throw error;
    }
}

/**
 * deleteMessage() - Delete a specific message
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to delete
 * @param {boolean} [forEveryone=false] - Whether to delete for all participants
 * @returns {Promise<object>} Status response
 */
export async function deleteMessage(messageId, forEveryone = false) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/messages/${messageId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                forEveryone: forEveryone,
                deletedAt: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to delete message: ${response.status}`);
        }

        const result = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: 'MESSAGE_DELETED',
                messageId: messageId,
                forEveryone: forEveryone,
                timestamp: result.deletedAt
            });
        }

        console.log(`✅ deleteMessage: Deleted message ${messageId} ${forEveryone ? 'for everyone' : 'for me only'}`);
        return result;
    } catch (error) {
        console.error('❌ deleteMessage: Failed to delete message', error);
        throw error;
    }
}

/**
 * editMessage() - Edit an existing message
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to edit
 * @param {string} newContent - New message content
 * @param {object} [metadata={}] - Updated metadata
 * @returns {Promise<object>} Updated message
 */
export async function editMessage(messageId, newContent, metadata = {}) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/messages/${messageId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                content: newContent,
                metadata: metadata,
                editedAt: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to edit message: ${response.status}`);
        }

        const updatedMessage = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: 'MESSAGE_EDITED',
                messageId: messageId,
                message: updatedMessage,
                timestamp: updatedMessage.editedAt
            });
        }

        console.log(`✅ editMessage: Edited message ${messageId}`);
        return updatedMessage;
    } catch (error) {
        console.error('❌ editMessage: Failed to edit message', error);
        throw error;
    }
}

/**
 * forwardMessage() - Forward a message to another conversation
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to forward
 * @param {string} targetConversationId - ID of the target conversation
 * @returns {Promise<object>} New forwarded message
 */
export async function forwardMessage(messageId, targetConversationId) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/messages/${messageId}/forward`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                targetConversationId: targetConversationId,
                forwardedAt: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to forward message: ${response.status}`);
        }

        const forwardedMessage = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.MESSAGE_SENT, {
                type: 'MESSAGE_FORWARDED',
                originalMessageId: messageId,
                targetConversationId: targetConversationId,
                message: forwardedMessage,
                timestamp: forwardedMessage.timestamp
            });
        }

        console.log(`✅ forwardMessage: Forwarded message ${messageId} to conversation ${targetConversationId}`);
        return forwardedMessage;
    } catch (error) {
        console.error('❌ forwardMessage: Failed to forward message', error);
        throw error;
    }
}

/**
 * pinMessage() - Pin a message in a conversation
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to pin
 * @param {boolean} [pin=true] - Whether to pin or unpin
 * @returns {Promise<object>} Updated message
 */
export async function pinMessage(messageId, pin = true) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/messages/${messageId}/pin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                pinned: pin,
                pinnedAt: pin ? new Date().toISOString() : null
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to ${pin ? 'pin' : 'unpin'} message: ${response.status}`);
        }

        const updatedMessage = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: pin ? 'MESSAGE_PINNED' : 'MESSAGE_UNPINNED',
                messageId: messageId,
                message: updatedMessage,
                pinned: pin
            });
        }

        console.log(`✅ pinMessage: ${pin ? 'Pinned' : 'Unpinned'} message ${messageId}`);
        return updatedMessage;
    } catch (error) {
        console.error(`❌ pinMessage: Failed to ${pin ? 'pin' : 'unpin'} message`, error);
        throw error;
    }
}

/**
 * searchMessages() - Search for messages in conversations
 * This function might be needed for message search functionality
 * 
 * @param {string} query - Search query
 * @param {string} [conversationId] - Optional conversation ID to search within
 * @param {number} [limit=20] - Maximum number of results
 * @param {number} [offset=0] - Results offset
 * @returns {Promise<Array>} Search results
 */
export async function searchMessages(query, conversationId = null, limit = 20, offset = 0) {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        params.append('q', query);
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());
        if (conversationId) params.append('conversationId', conversationId);

        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/messages/search?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to search messages: ${response.status}`);
        }

        const results = await response.json();
        
        console.log(`✅ searchMessages: Found ${results.length} messages matching "${query}"`);
        return results;
    } catch (error) {
        console.error('❌ searchMessages: Failed to search messages', error);
        throw error;
    }
}

/**
 * getConversationInfo() - Get information about a conversation
 * This function might be needed for conversation details
 * 
 * @param {string} conversationId - ID of the conversation
 * @returns {Promise<object>} Conversation information
 */
export async function getConversationInfo(conversationId) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/conversations/${conversationId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to get conversation info: ${response.status}`);
        }

        const conversationInfo = await response.json();
        
        console.log(`✅ getConversationInfo: Retrieved info for conversation ${conversationId}`);
        return conversationInfo;
    } catch (error) {
        console.error('❌ getConversationInfo: Failed to get conversation info', error);
        throw error;
    }
}

/**
 * createConversation() - Create a new conversation
 * This function might be needed for starting new chats
 * 
 * @param {Array<string>} participantIds - Array of user IDs to include
 * @param {string} [title] - Optional conversation title
 * @param {string} [type='direct'] - Conversation type (direct, group)
 * @returns {Promise<object>} New conversation
 */
export async function createConversation(participantIds, title = null, type = 'direct') {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                participantIds: participantIds,
                title: title,
                type: type,
                createdAt: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to create conversation: ${response.status}`);
        }

        const newConversation = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: 'CONVERSATION_CREATED',
                conversation: newConversation,
                timestamp: newConversation.createdAt
            });
        }

        console.log(`✅ createConversation: Created new ${type} conversation`);
        return newConversation;
    } catch (error) {
        console.error('❌ createConversation: Failed to create conversation', error);
        throw error;
    }
}

/**
 * leaveConversation() - Leave a conversation
 * This function might be needed for group management
 * 
 * @param {string} conversationId - ID of the conversation to leave
 * @returns {Promise<object>} Status response
 */
export async function leaveConversation(conversationId) {
    try {
        // Use secureFetch if available, otherwise fall back to fetch
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        
        const response = await fetchFunction(`/api/conversations/${conversationId}/leave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Failed to leave conversation: ${response.status}`);
        }

        const result = await response.json();
        
        // Notify parent window if in iframe
        if (window.parent !== window) {
            sendParentMessage(MESSAGE_TYPES.DATA_UPDATE, {
                type: 'CONVERSATION_LEFT',
                conversationId: conversationId,
                timestamp: new Date().toISOString()
            });
        }

        console.log(`✅ leaveConversation: Left conversation ${conversationId}`);
        return result;
    } catch (error) {
        console.error('❌ leaveConversation: Failed to leave conversation', error);
        throw error;
    }
}

// Export all functions and constants
export default {
    MESSAGE_TYPES,
    sendParentMessage,
    listenToParentMessages,
    sendMessageToIframe,
    validateMessage,
    messageResponse,
    sendMessage,
    fetchMessages,
    markAsRead,
    addReaction,
    clearChatHistory,
    deleteMessage,
    editMessage,
    forwardMessage,
    pinMessage,
    searchMessages,
    getConversationInfo,
    createConversation,
    leaveConversation
};