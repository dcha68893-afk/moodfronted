// status-api.js - Modern Status API Integration
// Fixes frontend/backend mismatch and provides proper status CRUD operations

class StatusAPI {
    constructor() {
        this.baseURL = '/api/status';
        this.uploadURL = '/api/cloudinary/direct-upload';
    }

    getApiBase() {
        const rawBase =
            window.__API_CORE?.getBaseUrl?.() ||
            window.api?.env?.getBaseUrl?.() ||
            window.__getApiBase?.() ||
            window.parent?.__API_CORE?.getBaseUrl?.() ||
            window.parent?.api?.env?.getBaseUrl?.() ||
            window.parent?.__getApiBase?.() ||
            '/api';

        if (typeof rawBase !== 'string') return '/api';
        return rawBase.replace(/\/api\/?$/, '/api');
    }

    resolveUrl(path) {
        if (/^https?:\/\//i.test(path)) return path;

        const base = this.getApiBase().replace(/\/+$/, '');
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;

        if (normalizedPath.startsWith('/api/')) {
            return `${base}${normalizedPath.slice(4)}`;
        }

        return `${base}${normalizedPath}`;
    }

    // Helper to get auth token
    getAuthHeaders() {
        const token =
            localStorage.getItem('authToken') ||
            localStorage.getItem('token') ||
            localStorage.getItem('moodchat_token') ||
            localStorage.getItem('accessToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    // Create a new status (proper backend integration)
    async createStatus(statusData) {
        try {
            // Map frontend fields to backend expected fields
            const payload = {
                content: statusData.text || statusData.content || '',
                type: statusData.type || 'text',
                mediaUrl: statusData.mediaUrl || null,
                mediaType: statusData.mediaType || null,
                isPublic: statusData.privacy !== 'private',
                expiresAt: statusData.expiresAt || null,
                moodType: statusData.mood || null,
                location: statusData.location || null,
                background: statusData.background || null
            };

            const response = await fetch(this.resolveUrl(this.baseURL), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorData;
                try {
                    const responseText = await response.text();
                    if (responseText) {
                        errorData = JSON.parse(responseText);
                    } else {
                        errorData = { message: 'Failed to create status' };
                    }
                } catch (parseError) {
                    errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
                }
                throw new Error(errorData.message || 'Failed to create status');
            }

            let result;
            try {
                const responseText = await response.text();
                if (responseText) {
                    result = JSON.parse(responseText);
                } else {
                    throw new Error('Empty response from server');
                }
            } catch (parseError) {
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }
            return {
                success: true,
                status: result.data.status,
                message: result.message
            };
        } catch (error) {
            console.error('StatusAPI.createStatus error:', error);
            return {
                success: false,
                error: error.message,
                reason: 'API_ERROR'
            };
        }
    }

    // Upload media file to Cloudinary
    async uploadMedia(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(this.resolveUrl(this.uploadURL), {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: formData
            });

            if (!response.ok) {
                let errorData;
                try {
                    const responseText = await response.text();
                    if (responseText) {
                        errorData = JSON.parse(responseText);
                    } else {
                        errorData = { error: 'Failed to upload media' };
                    }
                } catch (parseError) {
                    errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
                }
                throw new Error(errorData.error || 'Failed to upload media');
            }

            let result;
            try {
                const responseText = await response.text();
                if (responseText) {
                    result = JSON.parse(responseText);
                } else {
                    throw new Error('Empty response from server');
                }
            } catch (parseError) {
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }
            return {
                success: true,
                url: result.cloudinary.url,
                publicId: result.cloudinary.public_id
            };
        } catch (error) {
            console.error('StatusAPI.uploadMedia error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get user's statuses
    async getUserStatuses(userId, options = {}) {
        try {
            const params = new URLSearchParams({
                page: options.page || 1,
                limit: options.limit || 20,
                includeExpired: options.includeExpired || false
            });

            const response = await fetch(this.resolveUrl(`${this.baseURL}/user/${userId}?${params}`), {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                let errorData;
                try {
                    const responseText = await response.text();
                    if (responseText) {
                        errorData = JSON.parse(responseText);
                    } else {
                        errorData = { message: 'Failed to fetch user statuses' };
                    }
                } catch (parseError) {
                    errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
                }
                throw new Error(errorData.message || 'Failed to fetch user statuses');
            }

            let result;
            try {
                const responseText = await response.text();
                if (responseText) {
                    result = JSON.parse(responseText);
                } else {
                    throw new Error('Empty response from server');
                }
            } catch (parseError) {
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }
            return {
                success: true,
                statuses: result.data.statuses,
                pagination: result.data.pagination
            };
        } catch (error) {
            console.error('StatusAPI.getUserStatuses error:', error);
            return {
                success: false,
                error: error.message,
                statuses: []
            };
        }
    }

    // Get friends' statuses
    async getFriendsStatuses(options = {}) {
        try {
            const params = new URLSearchParams({
                page: options.page || 1,
                limit: options.limit || 50
            });

            const response = await fetch(this.resolveUrl(`${this.baseURL}/friends?${params}`), {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('Failed to fetch friends statuses');
            }

            const result = await response.json();
            return {
                success: true,
                statuses: result.data.statuses,
                pagination: result.data.pagination
            };
        } catch (error) {
            console.error('StatusAPI.getFriendsStatuses error:', error);
            return {
                success: false,
                error: error.message,
                statuses: []
            };
        }
    }

    // Get public statuses (timeline)
    async getPublicStatuses(options = {}) {
        try {
            const params = new URLSearchParams({
                page: options.page || 1,
                limit: options.limit || 20,
                type: options.type || '',
                moodType: options.moodType || ''
            });

            const response = await fetch(this.resolveUrl(`${this.baseURL}?${params}`), {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('Failed to fetch public statuses');
            }

            const result = await response.json();
            return {
                success: true,
                statuses: result.data.statuses,
                pagination: result.data.pagination
            };
        } catch (error) {
            console.error('StatusAPI.getPublicStatuses error:', error);
            return {
                success: false,
                error: error.message,
                statuses: []
            };
        }
    }

    // Get single status by ID
    async getStatusById(statusId) {
        try {
            const response = await fetch(this.resolveUrl(`${this.baseURL}/${statusId}`), {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('Status not found');
            }

            const result = await response.json();
            return {
                success: true,
                status: result.data.status
            };
        } catch (error) {
            console.error('StatusAPI.getStatusById error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update status
    async updateStatus(statusId, updateData) {
        try {
            const payload = {};
            if (updateData.content !== undefined) payload.content = updateData.content;
            if (updateData.isPublic !== undefined) payload.isPublic = updateData.isPublic;

            const response = await fetch(this.resolveUrl(`${this.baseURL}/${statusId}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update status');
            }

            const result = await response.json();
            return {
                success: true,
                status: result.data.status
            };
        } catch (error) {
            console.error('StatusAPI.updateStatus error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Delete status
    async deleteStatus(statusId) {
        try {
            const response = await fetch(this.resolveUrl(`${this.baseURL}/${statusId}`), {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to delete status');
            }

            return {
                success: true
            };
        } catch (error) {
            console.error('StatusAPI.deleteStatus error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Like status
    async likeStatus(statusId) {
        try {
            const response = await fetch(this.resolveUrl(`${this.baseURL}/${statusId}/like`), {
                method: 'POST',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to like status');
            }

            const result = await response.json();
            return {
                success: true,
                liked: result.data.liked
            };
        } catch (error) {
            console.error('StatusAPI.likeStatus error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Check if status is expired
    isStatusExpired(status) {
        if (!status.expiresAt) return false;
        return new Date(status.expiresAt) < new Date();
    }

    // Filter expired statuses from array
    filterExpiredStatuses(statuses) {
        return statuses.filter(status => !this.isStatusExpired(status));
    }
}

// Export singleton instance
window.StatusAPI = new StatusAPI();

// Also provide legacy compatibility for existing code
if (typeof window.postStatusLegacy === 'undefined') {
    window.postStatusLegacy = async function(statusData) {
        const api = window.StatusAPI;
        
        // Handle media upload if needed
        if (statusData.type === 'media' && statusData.file) {
            const uploadResult = await api.uploadMedia(statusData.file);
            if (uploadResult.success) {
                statusData.mediaUrl = uploadResult.url;
                statusData.mediaType = statusData.file.type.startsWith('video') ? 'video' : 'image';
            } else {
                return { success: false, error: uploadResult.error };
            }
        }

        // Create status
        const result = await api.createStatus(statusData);
        
        if (result.success) {
            return {
                success: true,
                status: result.status,
                id: result.status.id,
                queued: false
            };
        } else {
            return result;
        }
    };
}
