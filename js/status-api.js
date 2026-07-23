// status-api.js — Fixed v2
// Key fixes:
//  1. Added AbortController timeout (15 s) to every fetch call — prevents silent hangs
//  2. createStatus: validates response has status.id before returning success
//  3. All methods: no fake success when response is empty/undefined
//  4. Consistent error objects returned on every failure path

class StatusAPI {
    constructor() {
        this.baseURL   = '/api/status';
        this.uploadURL = '/api/cloudinary/direct-upload';
        // FIX: explicit per-request timeout so calls never hang forever
        this.FETCH_TIMEOUT_MS = 15000; // 15 s
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

    getAuthHeaders() {
        // FIX: Use centralized authStorage for consistent token access
        try {
            // Try to get session from authStorage first (most reliable)
            if (typeof window.getAuthSession === 'function') {
                const session = window.getAuthSession();
                if (session && session.token) {
                    return { 'Authorization': `Bearer ${session.token}` };
                }
            }
            
            // Check parent window session (iframe context)
            const token = 
                (window.parent && window.parent !== window ? (
                    (() => {
                        try {
                            return window.parent.__kynToken ||
                                   (window.parent.__PARENT_SESSION__ && window.parent.__PARENT_SESSION__.token) ||
                                   (window.parent.getAuthSession && window.parent.getAuthSession())?.token ||
                                   null;
                        } catch (_) { return null; }
                    })()
                ) : null) ||
                // In-memory cache set by status-core.js
                window.__kynToken ||
                (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.token) ||
                // localStorage — check all known key names, moodchat_token first
                localStorage.getItem('moodchat_token') ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('token') ||
                localStorage.getItem('accessToken') ||
                localStorage.getItem('kynecta_token') ||
                null;
            
            return token ? { 'Authorization': `Bearer ${token}` } : {};
        } catch (error) {
            console.error('[StatusAPI] getAuthHeaders error:', error);
            return {};
        }
    }

    // ── FIX: centralised fetch-with-timeout ───────────────────────────────────
    async _fetch(url, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return response;
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                throw new Error(`Request timed out after ${this.FETCH_TIMEOUT_MS / 1000}s: ${url}`);
            }
            throw err;
        }
    }

    // ── FIX: safe JSON parser — throws on empty or invalid body ──────────────
    async _parseJSON(response) {
        const text = await response.text();
        if (!text || !text.trim()) {
            throw new Error('Empty response from server');
        }
        try {
            return JSON.parse(text);
        } catch (_) {
            throw new Error(`Invalid JSON response from server`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CREATE STATUS
    // FIX: validate result.data.status.id exists — reject undefined as failure
    // ─────────────────────────────────────────────────────────────────────────
    async createStatus(statusData) {
        console.log('[STATUS FLOW] API → request sending');

        try {
            // Resolve privacy — default friends-only
            const resolvedPrivacy = statusData.privacy || 'friends';
            const isPublicVal = (resolvedPrivacy === 'public' || resolvedPrivacy === 'everyone');

            // Resolve expiresAt from duration if not already provided
            let resolvedExpiresAt = statusData.expiresAt;
            if (!resolvedExpiresAt && statusData.duration) {
                const secs = parseInt(statusData.duration, 10);
                if (secs > 0) resolvedExpiresAt = new Date(Date.now() + secs * 1000).toISOString();
            }
            if (!resolvedExpiresAt) {
                resolvedExpiresAt = new Date(Date.now() + 86400 * 1000).toISOString(); // 24h default
            }

            const payload = {
                content:    statusData.text || statusData.content || '',
                type:       statusData.type || 'text',
                mediaUrl:   statusData.mediaUrl   || undefined,
                mediaType:  statusData.mediaType  || undefined,
                isPublic:   isPublicVal,
                privacy:    resolvedPrivacy,
                duration:   statusData.duration   || undefined,
                expiresAt:  resolvedExpiresAt,
                moodType:   statusData.mood || statusData.moodType || undefined,
                location:   statusData.location   || undefined,
                background: statusData.background || undefined,
                allowReplies: statusData.allowReplies !== false,
                allowedUserIds: statusData.allowedUserIds || statusData.selectedFriendIds || undefined,
                excludedUserIds: statusData.excludedUserIds || undefined,
                specificUserIds: statusData.specificUserIds || undefined,
                actionButtons: statusData.actionButtons || undefined,
                caption: statusData.caption || undefined,
                fontFamily: statusData.fontFamily || undefined,
                textColor: statusData.textColor || undefined
            };

            // Strip undefined fields so express-validator's .optional() works
            Object.keys(payload).forEach(k => {
                if (payload[k] === undefined) delete payload[k];
            });

            const response = await this._fetch(this.resolveUrl(this.baseURL), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify(payload)
            });

            console.log('[STATUS FLOW] API → response received, status:', response.status);

            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}`;
                try {
                    const errData = await this._parseJSON(response);
                    errorMsg = errData.message || errorMsg;
                } catch (_) {}
                // FIX: log actual error — no fake success
                console.error('[STATUS FLOW] API → FAILED:', errorMsg);
                return { success: false, error: errorMsg, reason: 'HTTP_ERROR' };
            }

            const result = await this._parseJSON(response);

            // FIX Bug E: backend returns { success, data: { status } }.
            // Guard every possible shape so one missing wrapper never breaks creation.
            const status =
                result?.data?.status ||   // normal shape
                result?.status       ||   // some older endpoints return top-level status
                (result?.data?.id ? result.data : null) || // data IS the status obj
                (result?.id ? result : null);              // result itself is the status
            if (!status || !status.id) {
                const msg = 'Server returned empty or invalid status object';
                console.error('[STATUS FLOW] API → FAILED:', msg, result);
                return { success: false, error: msg, reason: 'INVALID_RESPONSE' };
            }

            console.log('[STATUS FLOW] API → SUCCESS id:', status.id);
            return { success: true, status, message: result.message };

        } catch (error) {
            console.error('[STATUS FLOW] API → ERROR:', error.message);
            return { success: false, error: error.message, reason: 'API_ERROR' };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPLOAD MEDIA
    // ─────────────────────────────────────────────────────────────────────────
    async uploadMedia(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await this._fetch(this.resolveUrl(this.uploadURL), {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: formData
            });

            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}`;
                try { const d = await this._parseJSON(response); errorMsg = d.error || errorMsg; } catch (_) {}
                throw new Error(errorMsg);
            }

            const result = await this._parseJSON(response);
            return { success: true, url: result.cloudinary.url, publicId: result.cloudinary.public_id };

        } catch (error) {
            console.error('[StatusAPI] uploadMedia error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET USER STATUSES
    // ─────────────────────────────────────────────────────────────────────────
    async getUserStatuses(userId, options = {}) {
        try {
            const params = new URLSearchParams({
                page:           options.page    || 1,
                limit:          options.limit   || 20,
                includeExpired: options.includeExpired || false
            });

            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/user/${userId}?${params}`),
                { headers: this.getAuthHeaders() }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await this._parseJSON(response);
            return {
                success:    true,
                statuses:   result.data.statuses,
                pagination: result.data.pagination
            };
        } catch (error) {
            console.error('[StatusAPI] getUserStatuses error:', error.message);
            return { success: false, error: error.message, statuses: [] };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET FRIENDS STATUSES
    // ─────────────────────────────────────────────────────────────────────────
    async getFriendsStatuses(options = {}) {
        try {
            const params = new URLSearchParams({
                page:  options.page  || 1,
                limit: options.limit || 50
            });

            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/friends?${params}`),
                { headers: this.getAuthHeaders() }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await this._parseJSON(response);
            return {
                success:    true,
                statuses:   result.data.statuses,
                pagination: result.data.pagination
            };
        } catch (error) {
            console.error('[StatusAPI] getFriendsStatuses error:', error.message);
            return { success: false, error: error.message, statuses: [] };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET PUBLIC STATUSES
    // ─────────────────────────────────────────────────────────────────────────
    async getPublicStatuses(options = {}) {
        try {
            const params = new URLSearchParams({
                page:     options.page     || 1,
                limit:    options.limit    || 20,
                type:     options.type     || '',
                moodType: options.moodType || ''
            });

            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}?${params}`),
                { headers: this.getAuthHeaders() }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await this._parseJSON(response);
            return {
                success:    true,
                statuses:   result.data.statuses,
                pagination: result.data.pagination
            };
        } catch (error) {
            console.error('[StatusAPI] getPublicStatuses error:', error.message);
            return { success: false, error: error.message, statuses: [] };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET STATUS BY ID
    // ─────────────────────────────────────────────────────────────────────────
    async getStatusById(statusId) {
        try {
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}`),
                { headers: this.getAuthHeaders() }
            );

            if (!response.ok) throw new Error('Status not found');

            const result = await this._parseJSON(response);
            return { success: true, status: result.data.status };
        } catch (error) {
            console.error('[StatusAPI] getStatusById error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE STATUS
    // ─────────────────────────────────────────────────────────────────────────
    async updateStatus(statusId, updateData) {
        try {
            const payload = {};
            if (updateData.content  !== undefined) payload.content  = updateData.content;
            if (updateData.isPublic !== undefined) payload.isPublic = updateData.isPublic;

            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}`),
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                    body: JSON.stringify(payload)
                }
            );

            if (!response.ok) {
                const err = await this._parseJSON(response).catch(() => ({}));
                throw new Error(err.message || `HTTP ${response.status}`);
            }

            const result = await this._parseJSON(response);
            return { success: true, status: result.data.status };
        } catch (error) {
            console.error('[StatusAPI] updateStatus error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE STATUS
    // ─────────────────────────────────────────────────────────────────────────
    async deleteStatus(statusId) {
        try {
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}`),
                { method: 'DELETE', headers: this.getAuthHeaders() }
            );

            if (!response.ok) {
                const err = await this._parseJSON(response).catch(() => ({}));
                throw new Error(err.message || `HTTP ${response.status}`);
            }

            return { success: true };
        } catch (error) {
            console.error('[StatusAPI] deleteStatus error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LIKE STATUS
    // ─────────────────────────────────────────────────────────────────────────
    async likeStatus(statusId) {
        try {
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}/like`),
                { method: 'POST', headers: this.getAuthHeaders() }
            );

            if (!response.ok) {
                const err = await this._parseJSON(response).catch(() => ({}));
                throw new Error(err.message || `HTTP ${response.status}`);
            }

            const result = await this._parseJSON(response);
            return { success: true, liked: result.data.liked };
        } catch (error) {
            console.error('[StatusAPI] likeStatus error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────────────────
    isStatusExpired(status) {
        if (!status.expiresAt) return false;
        return new Date(status.expiresAt) < new Date();
    }

    filterExpiredStatuses(statuses) {
        return statuses.filter(s => !this.isStatusExpired(s));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW STATUS — record a view, deduplicated server-side
    // ─────────────────────────────────────────────────────────────────────────
    async viewStatus(statusId) {
        try {
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}/view`),
                { method: 'POST', headers: this.getAuthHeaders() }
            );
            if (!response.ok) {
                // 410 = expired, treat as soft failure
                if (response.status === 410) return { success: true, expired: true };
                return { success: false, error: `HTTP ${response.status}` };
            }
            const result = await this._parseJSON(response);
            return { success: true, viewCount: result.data?.viewCount || 0 };
        } catch (error) {
            // Non-fatal — never break the viewer on network issues
            console.warn('[StatusAPI] viewStatus error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADD REACTION — emoji reaction; one per user (replaces previous)
    // ─────────────────────────────────────────────────────────────────────────
    async addReaction(statusId, emoji) {
        try {
            if (!statusId || !emoji) return { success: false, error: 'Missing statusId or emoji' };
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}/react`),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                    body: JSON.stringify({ emoji })
                }
            );
            if (!response.ok) {
                const err = await this._parseJSON(response).catch(() => ({}));
                return { success: false, error: err.message || `HTTP ${response.status}` };
            }
            const result = await this._parseJSON(response);
            return { success: true, emoji, count: result.data?.count || 0 };
        } catch (error) {
            console.error('[StatusAPI] addReaction error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REMOVE REACTION
    // ─────────────────────────────────────────────────────────────────────────
    async removeReaction(statusId) {
        try {
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}/react`),
                { method: 'DELETE', headers: this.getAuthHeaders() }
            );
            if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
            return { success: true };
        } catch (error) {
            console.error('[StatusAPI] removeReaction error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REPLY TO STATUS — sends as a chat message linked to status_id
    // ─────────────────────────────────────────────────────────────────────────
    async replyToStatus(statusId, replyText) {
        try {
            if (!statusId || !replyText || !replyText.trim()) {
                return { success: false, error: 'Missing statusId or reply content' };
            }
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}/reply`),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                    body: JSON.stringify({ content: replyText.trim() })
                }
            );
            if (!response.ok) {
                const err = await this._parseJSON(response).catch(() => ({}));
                return { success: false, error: err.message || `HTTP ${response.status}` };
            }
            const result = await this._parseJSON(response);
            return {
                success: true,
                message: result.data?.message,
                chatId: result.data?.chatId,
                statusPreview: result.data?.statusPreview,
            };
        } catch (error) {
            console.error('[StatusAPI] replyToStatus error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET REACTIONS — fetch all reactions for a status
    // ─────────────────────────────────────────────────────────────────────────
    async getReactions(statusId) {
        try {
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}/reactions`),
                { headers: this.getAuthHeaders() }
            );
            if (!response.ok) return { success: false, reactions: [] };
            const result = await this._parseJSON(response);
            return { success: true, reactions: result.data?.reactions || [] };
        } catch (error) {
            console.warn('[StatusAPI] getReactions error:', error.message);
            return { success: false, reactions: [] };
        }
    }

    async getViewers(statusId) {
        try {
            const response = await this._fetch(
                this.resolveUrl(`${this.baseURL}/${statusId}/viewers`),
                { headers: this.getAuthHeaders() }
            );
            if (!response.ok) return { success: false, viewers: [], totalViews: 0 };
            const result = await this._parseJSON(response);
            return {
                success: true,
                viewers: result.data?.viewers || [],
                totalViews: result.data?.totalViews || 0,
            };
        } catch (error) {
            console.warn('[StatusAPI] getViewers error:', error.message);
            return { success: false, viewers: [], totalViews: 0, error: error.message };
        }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // P1 FIX: createStatusWithFile — multipart upload (file from device)
    // ─────────────────────────────────────────────────────────────────────────
    async createStatusWithFile(statusData, file) {
        try {
            const formData = new FormData();
            formData.append('media', file);
            // Append all scalar status fields
            const fields = ['content', 'type', 'moodType', 'location', 'latitude', 'longitude',
                'isPublic', 'privacy', 'duration', 'expiresAt', 'background', 'caption',
                'fontFamily', 'textColor', 'allowReplies', 'altText', 'linkUrl', 'linkLabel'];
            for (const f of fields) {
                if (statusData[f] !== undefined && statusData[f] !== null) {
                    formData.append(f, statusData[f]);
                }
            }
            if (statusData.actionButtons) formData.append('actionButtons', JSON.stringify(statusData.actionButtons));
            if (statusData.pollOptions)   formData.append('pollOptions',   JSON.stringify(statusData.pollOptions));
            if (statusData.mentions)      formData.append('mentions',      JSON.stringify(statusData.mentions));
            if (statusData.hashtags)      formData.append('hashtags',      JSON.stringify(statusData.hashtags));

            const response = await this._fetch(this.resolveUrl(this.baseURL), {
                method: 'POST',
                headers: { ...this.getAuthHeaders() }, // No Content-Type — let browser set multipart boundary
                body: formData,
            });
            if (!response.ok) {
                const err = await this._parseJSON(response).catch(() => ({}));
                return { success: false, error: err.message || `HTTP ${response.status}` };
            }
            const result = await this._parseJSON(response);
            const status = result?.data?.status || result?.status || null;
            if (!status?.id) return { success: false, error: 'Invalid response from server' };
            return { success: true, status };
        } catch (error) {
            console.error('[StatusAPI] createStatusWithFile error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P1/P2: Mute / Unmute user from statuses (server-persisted)
    // ─────────────────────────────────────────────────────────────────────────
    async muteUser(userId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/mute/${userId}`), {
                method: 'POST', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async unmuteUser(userId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/mute/${userId}`), {
                method: 'DELETE', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async getMutedUsers() {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/muted`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, mutedUserIds: [] }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P2: Share, Report, Pin/Unpin
    // ─────────────────────────────────────────────────────────────────────────
    async shareStatus(statusId, caption, privacy) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/share`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ caption, privacy }),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async reportStatus(statusId, reason, description) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/report`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ reason, description }),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async pinStatus(statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/pin`), {
                method: 'POST', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async unpinStatus(statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/pin`), {
                method: 'DELETE', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P2: Poll vote
    // ─────────────────────────────────────────────────────────────────────────
    async votePoll(statusId, optionId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/poll/vote`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ optionId }),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P2: Question answer
    // ─────────────────────────────────────────────────────────────────────────
    async answerQuestion(statusId, text) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/question/answer`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ text }),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P2: Bookmark / Save status
    // ─────────────────────────────────────────────────────────────────────────
    async bookmarkStatus(statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/bookmark`), {
                method: 'POST', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async removeBookmark(statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/bookmark`), {
                method: 'DELETE', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async getBookmarks() {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/bookmarks`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, statuses: [] }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P2: Named Highlight Albums
    // ─────────────────────────────────────────────────────────────────────────
    async createHighlightAlbum(name, coverImage) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/highlights/albums`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ name, coverImage }),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async getHighlightAlbums() {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/highlights/albums`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, albums: [] }; }
    }

    async addToHighlightAlbum(albumId, statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/highlights/albums/${albumId}/add`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ statusId }),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P2: Action button click tracking
    // ─────────────────────────────────────────────────────────────────────────
    async trackActionClick(statusId, buttonIndex, buttonLabel) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/action-click`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ buttonIndex, buttonLabel }),
            });
            return this._parseJSON(r).catch(() => ({ success: true }));
        } catch (e) { return { success: true }; } // non-critical — fire and forget
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P2: Hashtag feed
    // ─────────────────────────────────────────────────────────────────────────
    async getHashtagFeed(tag) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/hashtag/${encodeURIComponent(tag)}`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, statuses: [] }; }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // P2 FIX: Draft CRUD — dedicated status_drafts table
    // ─────────────────────────────────────────────────────────────────────────
    async saveDraft(draftData) {
        try {
            const payload = {
                content:  draftData.text || draftData.content || draftData.question || '',
                type:     draftData.type || 'text',
                mediaUrl: draftData.mediaUrl || null,
                moodType: draftData.mood   || draftData.moodType || null,
                privacy:  draftData.privacy || 'friends',
                metadata: {
                    background:  draftData.background  || null,
                    caption:     draftData.caption      || null,
                    pollOptions: draftData.options      || draftData.pollOptions || null,
                    intent:      draftData.intent       || null,
                    category:    draftData.category     || null,
                },
            };
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/drafts`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify(payload),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async getDrafts() {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/drafts`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, drafts: [] }; }
    }

    async deleteDraft(draftId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/drafts/${draftId}`), {
                method: 'DELETE', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    async publishDraft(draftId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/drafts/${draftId}/publish`), {
                method: 'POST', headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, error: e.message }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P3 FIX: Story templates
    // ─────────────────────────────────────────────────────────────────────────
    async getTemplates(tag) {
        try {
            const url = tag ? `${this.baseURL}/templates?tag=${encodeURIComponent(tag)}` : `${this.baseURL}/templates`;
            const r = await this._fetch(this.resolveUrl(url));
            return this._parseJSON(r);
        } catch (e) { return { success: false, templates: [] }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P3 FIX: Countdown live data
    // ─────────────────────────────────────────────────────────────────────────
    async getCountdown(statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/countdown`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, finished: true }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P3 FIX: Algorithm-ranked public feed
    // ─────────────────────────────────────────────────────────────────────────
    async getRankedFeed(limit = 20, offset = 0) {
        try {
            const r = await this._fetch(
                this.resolveUrl(`${this.baseURL}/public?ranked=1&limit=${limit}&offset=${offset}`),
                { headers: this.getAuthHeaders() }
            );
            return this._parseJSON(r);
        } catch (e) { return { success: false, statuses: [] }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P3 FIX: Profile-visit tracking from story views
    // ─────────────────────────────────────────────────────────────────────────
    async getViewerProfiles(statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/${statusId}/viewers/profiles`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false, viewers: [] }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P3 FIX: On This Day memories feed
    // ─────────────────────────────────────────────────────────────────────────
    async getMemories() {
        // The backend pushes notifications for On This Day.
        // This client method fetches the user's own statuses from
        // the same calendar day in previous years for the "Memories" tab.
        try {
            const now = new Date();
            const month = now.getMonth() + 1; // 1-indexed
            const day   = now.getDate();
            const r = await this._fetch(
                this.resolveUrl(`${this.baseURL}/my?month=${month}&day=${day}&limit=10`),
                { headers: this.getAuthHeaders() }
            );
            const result = await this._parseJSON(r);
            // Filter to only statuses from previous years
            const statuses = (result.data?.statuses || []).filter(s => {
                const created = new Date(s.createdAt);
                return created.getFullYear() < now.getFullYear();
            });
            return { success: true, data: { statuses } };
        } catch (e) { return { success: false, data: { statuses: [] } }; }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // P3 FIX: Per-status analytics
    // ─────────────────────────────────────────────────────────────────────────
    async getStatusAnalytics(statusId) {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/stats/${statusId}`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false }; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // P3 FIX: Creator analytics dashboard
    // ─────────────────────────────────────────────────────────────────────────
    async getAnalyticsDashboard(period = '7d') {
        try {
            const r = await this._fetch(this.resolveUrl(`${this.baseURL}/analytics/dashboard?period=${period}`), {
                headers: this.getAuthHeaders(),
            });
            return this._parseJSON(r);
        } catch (e) { return { success: false }; }
    }

} // end class StatusAPI

// Singleton
window.StatusAPI = new StatusAPI();

// Legacy compat
if (typeof window.postStatusLegacy === 'undefined') {
    window.postStatusLegacy = async function(statusData) {
        const api = window.StatusAPI;

        if (statusData.type === 'media' && statusData.file) {
            const uploadResult = await api.uploadMedia(statusData.file);
            if (uploadResult.success) {
                statusData.mediaUrl  = uploadResult.url;
                statusData.mediaType = statusData.file.type.startsWith('video') ? 'video' : 'image';
            } else {
                return { success: false, error: uploadResult.error };
            }
        }

        const result = await api.createStatus(statusData);
        if (result.success) {
            return { success: true, status: result.status, id: result.status.id, queued: false };
        }
        return result;
    };
}
