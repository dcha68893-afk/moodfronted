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
            let filtered = all.filter((message) => String(message.chatId) === String(chatId) && message.deleted !== true);
            if (options.before) filtered = filtered.filter((message) => Number(message.createdAt || 0) < Number(options.before));
            filtered.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
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
            const normalized = [];
            for (const item of (serverMessages || [])) {
                normalized.push(await this.saveMessage({
                    ...item,
                    serverId: item.id ? String(item.id) : (item.serverId ? String(item.serverId) : null),
                    chatId: String(chatId),
                    isLocalOnly: false,
                    status: item.status || 'delivered'
                }));
            }
            return normalized;
        }

        async deleteMessage(id) {
            return this.updateMessage(id, { deleted: true, status: 'deleted' });
        }

        async saveConversation(conv) {
            await this.ready();
            return window.AppCache.save('chats', normalizeConversation(conv));
        }

        async getConversation(id) {
            await this.ready();
            return window.AppCache.get('chats', String(id));
        }

        async getAllConversations() {
            await this.ready();
            const records = await window.AppCache.getAll('chats');
            return records.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
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