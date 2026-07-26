(function () {
    'use strict';

    function now() {
        return Date.now();
    }

    function uuid(prefix = 'msg') {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return `${prefix}_${window.crypto.randomUUID()}`;
        }
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeMessage(partial, existing = null) {
        const message = { ...(existing || {}), ...(partial || {}) };
        const stableId = existing?.id || message.localId || message.id || message.serverId || uuid('msg');
        const id = String(stableId);
        const chatId = String(message.chatId || message.conversationId || message.groupId || existing?.chatId || 'unknown');
        const createdAt = message.createdAt || message.timestamp || existing?.createdAt || now();
        return {
            ...message,
            id,
            localId: String(message.localId || existing?.localId || id),
            serverId: message.serverId != null
                ? String(message.serverId)
                : (message.id && String(message.id) !== id ? String(message.id) : (existing?.serverId || null)),
            chatId,
            conversationId: chatId,
            createdAt,
            timestamp: message.timestamp || createdAt,
            updatedAt: now(),
            status: message.status || existing?.status || 'pending',
            isLocalOnly: message.isLocalOnly !== false && !message.serverId
        };
    }

    function normalizeConversation(conv) {
        const record = { ...(conv || {}) };
        const id = String(record.id || record.chatId || record.conversationId || uuid('chat'));
        return {
            ...record,
            id,
            chatId: id,
            createdAt: record.createdAt || now(),
            updatedAt: record.updatedAt || now()
        };
    }

    class LocalMessageStore {
        constructor() {
            this._readyPromise = this._init();
            window.KynectaLocalStore = this;
            console.log('[CACHE] Message local store booting');
        }

        async _init() {
            if (window.AppCache && typeof window.AppCache.initDB === 'function') {
                await window.AppCache.initDB();
            }
            return this;
        }

        async ready() {
            return this._readyPromise;
        }

        async _findExistingMessage(partial) {
            const candidate = partial || {};
            const idsToTry = [
                candidate.localId,
                candidate.id,
                candidate.serverId
            ].filter(Boolean).map(String);

            for (const id of idsToTry) {
                const direct = await window.AppCache.get('messages', id);
                if (direct) return direct;
            }

            if (candidate.serverId || candidate.id) {
                const serverId = String(candidate.serverId || candidate.id);
                const byServerId = await this.getMessageByServerId(serverId);
                if (byServerId) return byServerId;
            }

            return null;
        }

        async saveMessage(partial) {
            await this.ready();
            const existing = await this._findExistingMessage(partial);
            const record = normalizeMessage(partial, existing);
            const saved = await window.AppCache.save('messages', record);
            console.log('[CACHE] Saved:', 'messages');
            return saved;
        }

        async saveMessages(messagesArray) {
            await this.ready();
            const records = (Array.isArray(messagesArray) ? messagesArray : []).map(normalizeMessage);
            return window.AppCache.save('messages', records);
        }

        async getMessagesByChat(chatId, options = {}) {
            await this.ready();
            const all = await window.AppCache.getAll('messages');
            // Get current userId for "deleted for me" filtering
            let currentUserId = null;
            try {
                const sess = window.AuthSessionManager?.getSession?.() || null;
                currentUserId = sess?.userId || sess?.user?.id || null;
                if (!currentUserId && window.__PARENT_SESSION__) {
                    currentUserId = window.__PARENT_SESSION__.userId || (window.__PARENT_SESSION__.user && window.__PARENT_SESSION__.user.id);
                }
            } catch (_) {}

            let filtered = all.filter((message) => {
                if (String(message.chatId) !== String(chatId)) return false;
                if (message.deleted === true) return false;
                // Filter out messages deleted for current user
                if (currentUserId && Array.isArray(message.deletedFor) && message.deletedFor.includes(currentUserId)) return false;
                if (currentUserId && Array.isArray(message.deletedFor) && message.deletedFor.includes(String(currentUserId))) return false;
                return true;
            });
            // FIX (message-order-scramble-on-refresh): createdAt can be either an epoch-ms
            // number (locally composed messages) or an ISO string (messages merged in from
            // the server via mergeServerMessages). Number("2026-07-26T...") is NaN, which
            // broke both this before-filter and the sort below whenever a chat had a mix of
            // the two -- i.e. after every refresh/reload. Normalize through Date parsing for
            // strings, plain Number() for anything else.
            const _tsNum = (v) => {
                if (v == null || v === '') return 0;
                if (typeof v === 'string') return new Date(v).getTime() || 0;
                return Number(v) || 0;
            };
            if (options.before) filtered = filtered.filter((message) => _tsNum(message.createdAt) < _tsNum(options.before));
            filtered.sort((a, b) => _tsNum(a.createdAt) - _tsNum(b.createdAt));
            const limit = options.limit || 200;
            return filtered.slice(-limit);
        }

        async getMessageById(id) {
            await this.ready();
            return window.AppCache.get('messages', String(id));
        }

        async getMessageByServerId(serverId) {
            await this.ready();
            const all = await window.AppCache.getAll('messages');
            return all.find((message) => String(message.serverId) === String(serverId)) || null;
        }

        async updateMessage(id, patch) {
            await this.ready();
            const existing = await this._findExistingMessage({ id });
            if (!existing) return null;
            return this.saveMessage({
                ...existing,
                ...(patch || {}),
                id: existing.id,
                localId: existing.localId || existing.id
            });
        }

        async updateMessageStatus(id, status, extra = {}) {
            return this.updateMessage(id, { status, ...extra });
        }

        async confirmMessage(localId, serverId, serverData = {}) {
            const existing = await this._findExistingMessage({
                id: localId,
                localId,
                serverId
            });
            if (!existing) return null;
            return this.saveMessage({
                ...existing,
                ...serverData,
                id: existing.id,
                localId: existing.localId || String(localId),
                serverId: String(serverId),
                status: serverData.status || 'sent',
                isLocalOnly: false,
                updatedAt: now()
            });
        }

        async mergeServerMessages(chatId, serverMessages) {
            // FIX #1 — MERGE NOT REPLACE: upsert each server message individually.
            // Existing messages are NEVER removed; only updated if server has newer version.
            // FIX (delete-persistence gap): this was the one place in the
            // reconciliation pipeline that never checked the deletion tombstone
            // registry (window.__PHASE10_DeletionRegistry, populated both by
            // realtime message:deleted events and by /deletions polling on
            // reconnect for anything missed while offline). Everywhere else
            // that reads messages back out already filters through this
            // registry, but skipping the check here meant a tombstoned message
            // could still get re-upserted into IndexedDB on every merge — a
            // latent trap for any future/other render path that doesn't also
            // filter by registry.
            const normalized = [];
            for (const item of (serverMessages || [])) {
                const serverId = item.id ? String(item.id) : (item.serverId ? String(item.serverId) : null);
                if (!serverId) continue;

                if (window.__PHASE10_DeletionRegistry && window.__PHASE10_DeletionRegistry.isDeleted('message', serverId)) {
                    try { await window.AppCache.remove('messages', serverId); } catch (_) {}
                    continue;
                }

                // Check if we already have this message — if so, only update metadata
                const existing = await this._findExistingMessage({ serverId, id: serverId });
                if (existing) {
                    // Server wins on metadata, local wins on content if not yet confirmed
                    const merged = {
                        ...existing,
                        status:       item.status || existing.status,
                        updatedAt:    item.updatedAt || item.createdAt || existing.updatedAt,
                        isLocalOnly:  false,
                        syncVersion:  (existing.syncVersion || 0) + 1
                    };
                    normalized.push(await this.saveMessage(merged));
                } else {
                    // New message from server — insert fresh
                    normalized.push(await this.saveMessage({
                        ...item,
                        serverId,
                        chatId:      String(chatId),
                        isLocalOnly: false,
                        status:      item.status || 'delivered'
                    }));
                }
            }
            return normalized;
        }

        async deleteMessage(id, options = {}) {
            // options: { forEveryone: bool, userId: string }
            if (options && options.forEveryone) {
                // Hard delete for everyone — permanently remove from IDB
                try { await window.AppCache.remove('messages', String(id)); } catch (_) {}
                // Also try by serverId lookup
                try {
                    const existing = await this._findExistingMessage({ id });
                    if (existing && existing.id !== String(id)) {
                        await window.AppCache.remove('messages', existing.id);
                    }
                } catch (_) {}
                return true;
            } else if (options && options.userId) {
                // Soft delete for me only — record userId in deletedFor array
                const existing = await this._findExistingMessage({ id });
                if (!existing) return null;
                const deletedFor = Array.isArray(existing.deletedFor) ? [...existing.deletedFor] : [];
                if (!deletedFor.includes(options.userId) && !deletedFor.includes(String(options.userId))) {
                    deletedFor.push(String(options.userId));
                }
                return this.updateMessage(id, { deletedFor, status: 'deleted_for_me' });
            } else {
                // Legacy: permanently remove from IDB
                try { await window.AppCache.remove('messages', String(id)); } catch (_) {}
                try {
                    const existing2 = await this._findExistingMessage({ id });
                    if (existing2 && existing2.id !== String(id)) {
                        await window.AppCache.remove('messages', existing2.id);
                    }
                } catch (_) {}
                return true;
            }
        }

        async deleteMessagesByChat(chatId) {
            // NEW: Remove all IDB messages for a given chatId
            await this.ready();
            const all = await window.AppCache.getAll('messages').catch(() => []);
            const toRemove = (all || []).filter(m => String(m.chatId || m.conversationId || '') === String(chatId));
            for (const m of toRemove) {
                try { await window.AppCache.remove('messages', m.id); } catch (_) {}
            }
            return toRemove.length;
        }

        async saveConversation(conv) {
            await this.ready();
            // FIX #2 — Never resurrect tombstoned conversations
            if (conv) {
                const id = String(conv.id || conv.chatId || conv.conversationId || '');
                if (id) {
                    try {
                        const tombstones = JSON.parse(localStorage.getItem('moodchat_tombstones_v1') || '{}');
                        if (tombstones[id]) {
                            console.log('[LocalStore] FIX#2 — Blocked tombstoned conversation from resurrection:', id);
                            return null;
                        }
                    } catch (_) {}
                }
            }
            return window.AppCache.save('chats', normalizeConversation(conv));
        }

        async deleteConversation(chatId) {
            // FIX #2 — Full tombstone deletion so entity never comes back
            await this.ready();
            const id = String(chatId);
            // Write tombstone to localStorage
            try {
                const tombstones = JSON.parse(localStorage.getItem('moodchat_tombstones_v1') || '{}');
                tombstones[id] = { deletedAt: Date.now(), entityType: 'chat', syncRevision: 1 };
                localStorage.setItem('moodchat_tombstones_v1', JSON.stringify(tombstones));
            } catch (_) {}
            // Remove from IDB
            try { await window.AppCache.remove('chats', id); } catch (_) {}
            // Remove all messages for this chat
            await this.deleteMessagesByChat(id);
            // Broadcast
            try { window.dispatchEvent(new CustomEvent('kyn:chat:deleted', { detail: { chatId: id } })); } catch (_) {}
            return true;
        }

        async getConversation(id) {
            await this.ready();
            return window.AppCache.get('chats', String(id));
        }

        async getAllConversations() {
            await this.ready();
            const records = await window.AppCache.getAll('chats');
            // FIX (message-order-scramble-on-refresh, same root cause as getMessagesByChat
            // below): updatedAt can be an ISO string (from the server) or an epoch-ms number
            // (locally created), and Number() on an ISO string is NaN.
            const _tsNum = (v) => {
                if (v == null || v === '') return 0;
                if (typeof v === 'string') return new Date(v).getTime() || 0;
                return Number(v) || 0;
            };
            return records.sort((a, b) => _tsNum(b.updatedAt) - _tsNum(a.updatedAt));
        }

        async updateConversationLastMessage(chatId, message) {
            const existing = await this.getConversation(chatId);
            if (!existing) return null;
            return this.saveConversation({
                ...existing,
                lastMessage: message?.content || '',
                lastMessageAt: message?.createdAt || now(),
                updatedAt: now()
            });
        }

        async setSyncMeta(key, value) {
            await this.ready();
            return window.AppCache.save('settings', {
                id: `sync_meta_${key}`,
                key: `sync_meta_${key}`,
                value,
                data: value
            });
        }

        async getSyncMeta(key) {
            await this.ready();
            const record = await window.AppCache.get('settings', `sync_meta_${key}`);
            return record ? (record.value !== undefined ? record.value : record.data) : null;
        }

        async debug(chatId) {
            const summary = await window.AppCache.debugSummary();
            const messages = chatId ? await this.getMessagesByChat(chatId) : [];
            console.log('[CACHE] Message store debug', { summary, chatId, messages: messages.length });
            return { summary, chatId, messages };
        }

        async clearAll() {
            await this.ready();
            await window.AppCache.clear('messages');
            await window.AppCache.clear('chats');
            const settings = await window.AppCache.getAll('settings');
            await Promise.all(settings
                .filter((item) => String(item.id || '').startsWith('sync_meta_'))
                .map((item) => window.AppCache.remove('settings', item.id)));
            return true;
        }
    }

    const localStore = new LocalMessageStore();
    window.KynectaLocalStore = localStore;
    console.log('[CACHE] Message local store ready');
})();