// api-groups.js - Groups API adapter
// Version: 1.1.4
// Date: 2024-01-02
// Adapter for groups functionality, re-exports from api.core.js

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

// Re-export core groups functions
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

export async function initialize() {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Try to check if groups API is accessible
            const response = await secureApiFetch('/api/groups/health', {
                method: 'GET'
            });
            
            if (response && typeof response === 'object') {
                console.log('✅ [GROUPS] API initialized successfully');
                return {
                    success: true,
                    message: 'Groups API initialized successfully',
                    data: response
                };
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Initialize attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Initialize error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to initialize groups API',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to initialize groups API'
    };
}

// Enhanced groups functions with safe fallbacks
export async function searchGroups(query) {
    const maxRetries = 3;
    let lastError;
    
    if (!query || typeof query !== 'string') {
        return {
            success: false,
            message: 'Invalid search query',
            data: []
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/search?q=${encodeURIComponent(query)}`, {
                method: 'GET'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            // Handle unexpected response format
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Search attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Search error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to search groups',
                    data: [],
                    error: error.message
                };
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to search groups',
        data: []
    };
}

export async function getGroupMembers(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/members`, {
                method: 'GET'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get members attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get members error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group members',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group members',
        data: []
    };
}

export async function getGroupMessages(groupId, limit = 50, before = null) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
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
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get messages attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get messages error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group messages',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group messages',
        data: []
    };
}

export async function sendGroupMessage(groupId, message) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
        };
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return {
            success: false,
            message: 'Message content is required'
        };
    }
    
    if (message.length > 5000) {
        return {
            success: false,
            message: 'Message must be less than 5000 characters'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/messages`, {
                method: 'POST',
                body: { 
                    content: message.trim(),
                    timestamp: new Date().toISOString()
                }
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Send message attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Send message error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to send message',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to send message'
    };
}

export async function getGroupMoods(groupId, limit = 50) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
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
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get moods attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get moods error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group moods',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group moods',
        data: []
    };
}

export async function getGroupNotes(groupId, limit = 50) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
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
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get notes attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get notes error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group notes',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group notes',
        data: []
    };
}

export async function getGroupPurposes(groupId, limit = 50) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
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
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get purposes attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get purposes error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group purposes',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group purposes',
        data: []
    };
}

export async function getGroupTransparency(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: {}
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/transparency`, {
                method: 'GET'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: {}
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get transparency attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get transparency error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group transparency',
                    data: {},
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group transparency',
        data: {}
    };
}

export async function updateGroupMemberRole(groupId, userId, role) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId || !userId || !role) {
        return {
            success: false,
            message: 'Group ID, User ID, and Role are required'
        };
    }
    
    if (typeof role !== 'string' || !['admin', 'moderator', 'member'].includes(role)) {
        return {
            success: false,
            message: 'Invalid role specified'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/members/${userId}/role`, {
                method: 'PUT',
                body: { role }
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Update member role attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Update member role error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to update member role',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to update member role'
    };
}

export async function getGroupInvites(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/invites`, {
                method: 'GET'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get invites attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get invites error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group invites',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group invites',
        data: []
    };
}

export async function createGroupInvite(groupId, expiresIn = '7d') {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
        };
    }
    
    if (typeof expiresIn !== 'string' || !['1h', '1d', '7d', '30d'].includes(expiresIn)) {
        return {
            success: false,
            message: 'Invalid expiration time'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/invites`, {
                method: 'POST',
                body: { expiresIn }
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Create invite attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Create invite error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to create group invite',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to create group invite'
    };
}

// ADDED: Explicitly export acceptGroupInvite to ensure it's available
export async function acceptGroupInvite(inviteCode) {
    const maxRetries = 3;
    let lastError;
    
    if (!inviteCode || typeof inviteCode !== 'string') {
        return {
            success: false,
            message: 'Valid invite code is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/invites/${inviteCode}/accept`, {
                method: 'POST'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Accept invite attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Accept invite error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to accept group invitation',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to accept group invitation'
    };
}

export async function rejectGroupInvite(inviteCode) {
    const maxRetries = 3;
    let lastError;
    
    if (!inviteCode || typeof inviteCode !== 'string') {
        return {
            success: false,
            message: 'Valid invite code is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/invites/${inviteCode}/reject`, {
                method: 'POST'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Reject invite attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Reject invite error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to reject group invitation',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to reject group invitation'
    };
}

// Alias for rejectGroupInvite to maintain backward compatibility
export async function declineGroupInvite(inviteCode) {
    return rejectGroupInvite(inviteCode);
}

export async function revokeGroupInvite(groupId, inviteId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId || !inviteId) {
        return {
            success: false,
            message: 'Group ID and Invite ID are required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/invites/${inviteId}`, {
                method: 'DELETE'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Revoke invite attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Revoke invite error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to revoke group invitation',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to revoke group invitation'
    };
}

export async function joinGroupByInvite(inviteCode) {
    const maxRetries = 3;
    let lastError;
    
    if (!inviteCode || typeof inviteCode !== 'string') {
        return {
            success: false,
            message: 'Valid invite code is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/join/${inviteCode}`, {
                method: 'POST'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Join by invite attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Join by invite error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to join group',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to join group'
    };
}

export async function joinGroup(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/join`, {
                method: 'POST'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Join group attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Join group error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to join group',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to join group'
    };
}

export async function getGroupSettings(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: {}
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/settings`, {
                method: 'GET'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: {}
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get settings attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get settings error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group settings',
                    data: {},
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group settings',
        data: {}
    };
}

export async function updateGroupSettings(groupId, settings) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
        };
    }
    
    if (!settings || typeof settings !== 'object') {
        return {
            success: false,
            message: 'Valid settings object is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/settings`, {
                method: 'PUT',
                body: settings
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Update settings attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Update settings error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to update group settings',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to update group settings'
    };
}

export async function getGroupActivity(groupId, limit = 50) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
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
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get activity attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get activity error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group activity',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group activity',
        data: []
    };
}

export async function getGroupEvents(groupId, limit = 50) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required',
            data: []
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
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get events attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get events error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to load group events',
                    data: [],
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load group events',
        data: []
    };
}

export async function muteGroup(groupId, duration = '1h') {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
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
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Mute attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Mute error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to mute group',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to mute group'
    };
}

export async function unmuteGroup(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/unmute`, {
                method: 'POST'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Unmute attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Unmute error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to unmute group',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to unmute group'
    };
}

export async function archiveGroup(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/archive`, {
                method: 'POST'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Archive attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Archive error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to archive group',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to archive group'
    };
}

export async function unarchiveGroup(groupId) {
    const maxRetries = 3;
    let lastError;
    
    if (!groupId) {
        return {
            success: false,
            message: 'Group ID is required'
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await secureApiFetch(`/api/groups/${groupId}/unarchive`, {
                method: 'POST'
            });
            
            if (response && typeof response === 'object') {
                return response;
            }
            
            return {
                success: false,
                message: 'Invalid response format from server'
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Unarchive attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Unarchive error after retries:', error);
                return {
                    success: false,
                    message: 'Failed to unarchive group',
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to unarchive group'
    };
}

// Enhanced group creation with validation
export async function createGroupWithValidation(groupData) {
    if (!groupData || typeof groupData !== 'object') {
        return {
            success: false,
            message: 'Invalid group data'
        };
    }
    
    // Validate required fields
    if (!groupData.name || groupData.name.trim().length < 2) {
        return {
            success: false,
            message: 'Group name must be at least 2 characters long'
        };
    }
    
    if (groupData.name.length > 100) {
        return {
            success: false,
            message: 'Group name must be less than 100 characters'
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
    
    return await createGroup(groupData);
}

// Get groups with caching for offline access
let groupsCache = null;
let groupsCacheTimestamp = 0;
const GROUPS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getGroupsWithCache(forceRefresh = false) {
    const maxRetries = 3;
    let lastError;
    const now = Date.now();
    
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && groupsCache && (now - groupsCacheTimestamp) < GROUPS_CACHE_DURATION) {
        console.log('📦 [GROUPS] Returning cached groups');
        return {
            success: true,
            data: groupsCache,
            cached: true,
            timestamp: groupsCacheTimestamp
        };
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await getGroups();
            
            if (response && typeof response === 'object') {
                if (response.success && response.data) {
                    // Update cache
                    groupsCache = response.data;
                    groupsCacheTimestamp = now;
                    
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
            }
            
            return {
                success: false,
                message: 'Invalid response format from server',
                data: []
            };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ [GROUPS] Get groups attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                console.error('❌ [GROUPS] Get groups error after retries:', error);
                
                // Try to load from localStorage cache as fallback
                try {
                    const cached = localStorage.getItem('groups_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (parsed.data && parsed.timestamp) {
                            console.log('📦 [GROUPS] Using localStorage cache as fallback');
                            return {
                                success: true,
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
                    success: false,
                    message: 'Failed to load groups',
                    data: [],
                    offline: true,
                    error: error.message
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
    }
    
    return {
        success: false,
        message: 'Failed to load groups',
        data: [],
        offline: true
    };
}

// Export all functions in a single object for easier imports
export const groupsApi = {
    initialize,
    createGroup,
    getGroups,
    getGroupDetails,
    updateGroup,
    deleteGroup,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    joinGroup,
    sendGroupMessage,
    searchGroups,
    getGroupMembers,
    getGroupMessages,
    getGroupMoods,
    getGroupNotes,
    getGroupPurposes,
    getGroupTransparency,
    updateGroupMemberRole,
    getGroupInvites,
    createGroupInvite,
    acceptGroupInvite,
    rejectGroupInvite,
    declineGroupInvite,
    revokeGroupInvite,
    joinGroupByInvite,
    getGroupSettings,
    updateGroupSettings,
    getGroupActivity,
    getGroupEvents,
    muteGroup,
    unmuteGroup,
    archiveGroup,
    unarchiveGroup,
    createGroupWithValidation,
    getGroupsWithCache
};

// ADDED: Explicitly list all exports for better clarity
export {
    acceptGroupInvite,
    rejectGroupInvite,
    declineGroupInvite,
    createGroupInvite,
    revokeGroupInvite,
    joinGroupByInvite,
    joinGroup,
    sendGroupMessage,
    searchGroups,
    getGroupMembers,
    getGroupMessages,
    getGroupMoods,
    getGroupNotes,
    getGroupPurposes,
    getGroupTransparency,
    updateGroupMemberRole,
    getGroupInvites,
    getGroupSettings,
    updateGroupSettings,
    getGroupActivity,
    getGroupEvents,
    muteGroup,
    unmuteGroup,
    archiveGroup,
    unarchiveGroup,
    createGroupWithValidation,
    getGroupsWithCache,
    initialize
};

console.log("✅ api-groups.js loaded v1.1.4");