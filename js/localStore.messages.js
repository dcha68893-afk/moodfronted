/**
 * localStore.messages.js  v2.1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL-FIRST message storage backed by IndexedDB (with localStorage fallback).
 *
 * Guarantees:
 *  • saveMessage()   → writes immediately, returns the saved record
 *  • saveMessages()  → bulk write in a single IDB transaction
 *  • getMessagesByChat() → reads from IDB, returns [] on any error
 *  • Data survives page refresh (IndexedDB is persistent storage)
 *  • Diagnostic: window.KynectaLocalStore.debug() dumps store contents
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    const DB_NAME    = 'KynectaMessages';
    const DB_VERSION = 2;
    const S = {
        MESSAGES:      'messages',
        CONVERSATIONS: 'conversations',
        SYNC_META:     'sync_meta'
    };

    // ── Canonical message factory ─────────────────────────────────────────────
    function normalizeMessage(partial) {
        return {
            id:          partial.id          || _uuid(),
            serverId:    partial.serverId    || null,
            chatId:      partial.chatId      || partial.conversationId || null,
            senderId:    partial.senderId    || null,
            content:     partial.content     || '',
            type:        partial.type        || 'text',
            status:      partial.status      || 'pending',
            createdAt:   partial.createdAt   || partial.timestamp || Date.now(),
            updatedAt:   partial.updatedAt   || Date.now(),
            syncVersion: partial.syncVersion || 1,
            isLocalOnly: partial.isLocalOnly !== false,
            reactions:   partial.reactions   || {},
            replyToId:   partial.replyToId   || null,
            sender:      partial.sender      || null,
            edited:      partial.edited      || false,
            deleted:     partial.deleted     || false
        };
    }

    function _uuid() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function getAppStorage() {
        return window.AppStorage || {
            get(key, fallback = null) {
                try {
                    const raw = localStorage.getItem(key);
                    if (raw === null || raw === undefined) return fallback;
                    return JSON.parse(raw);
                } catch (_error) {
                    return fallback;
                }
            },
            set(key, value) {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                    console.log('[LOCAL SAVE]', key, value);
                    return true;
                } catch (_error) {
                    return false;
                }
            },
            remove(key) {
                try {
                    localStorage.removeItem(key);
                    return true;
                } catch (_error) {
                    return false;
                }
            },
            getArray(key) {
                const value = this.get(key, []);
                return Array.isArray(value) ? value : [];
            }
        };
    }

    // ── Open / upgrade database ──────────────────────────────────────────────
    function _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;

                if (!db.objectStoreNames.contains(S.MESSAGES)) {
                    const ms = db.createObjectStore(S.MESSAGES, { keyPath: 'id' });
                    ms.createIndex('byChatId',   'chatId',   { unique: false });
                    ms.createIndex('byServerId', 'serverId', { unique: false });
                    ms.createIndex('byStatus',   'status',   { unique: false });
                }
                if (!db.objectStoreNames.contains(S.CONVERSATIONS)) {
                    const cs = db.createObjectStore(S.CONVERSATIONS, { keyPath: 'id' });
                    cs.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(S.SYNC_META)) {
                    db.createObjectStore(S.SYNC_META, { keyPath: 'key' });
                }
            };

            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror   = (e) => reject(e.target.error);
            req.onblocked = () => reject(new Error('IDB blocked'));
        });
    }

    // ── Promisify a single IDB request ───────────────────────────────────────
    function _wrap(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    class LocalMessageStore {
        constructor() {
            this._db        = null;
            this._fallback  = false;  // true when IDB unavailable
            this._dbPromise = this._init();
            window.KynectaLocalStore = this;
        }

        async _init() {
            if (!window.indexedDB) {
                console.warn('[LocalStore] IndexedDB not available — using localStorage fallback');
                this._fallback = true;
                return this;
            }
            try {
                this._db = await _openDB();
                console.log('[LocalStore] ✅ IndexedDB ready:', DB_NAME, 'v' + DB_VERSION);
            } catch (err) {
                console.warn('[LocalStore] IDB open failed, using localStorage fallback:', err.message);
                this._fallback = true;
            }
            return this;
        }

        /** Wait for the DB to be ready before any operation */
        async ready() {
            return this._dbPromise;
        }

        // ══════════════════════════════════════════════════════════════════
        // MESSAGES
        // ══════════════════════════════════════════════════════════════════

        /** Upsert a single message. Returns the saved record. */
        async saveMessage(partial) {
            await this._dbPromise;
            const msg = normalizeMessage(partial);
            if (!msg.chatId) {
                console.warn('[LocalStore] saveMessage: missing chatId', msg.id);
                return msg;
            }
            if (this._fallback) {
                this._lsSet(S.MESSAGES, msg);
                return msg;
            }
            try {
                const tx    = this._db.transaction([S.MESSAGES], 'readwrite');
                const store = tx.objectStore(S.MESSAGES);
                await _wrap(store.put(msg));
                return msg;
            } catch (err) {
                console.error('[LocalStore] saveMessage error:', err.message, msg.id);
                this._lsSet(S.MESSAGES, msg);   // fallback to LS on any IDB error
                return msg;
            }
        }

        /** Bulk-save messages in a single transaction. */
        async saveMessages(messagesArray) {
            await this._dbPromise;
            if (!Array.isArray(messagesArray) || messagesArray.length === 0) return [];

            const normalized = messagesArray
                .filter(m => m && (m.id || m.chatId))
                .map(normalizeMessage);

            if (this._fallback) {
                normalized.forEach(m => this._lsSet(S.MESSAGES, m));
                return normalized;
            }

            try {
                const tx    = this._db.transaction([S.MESSAGES], 'readwrite');
                const store = tx.objectStore(S.MESSAGES);
                // Fire all puts; wait for transaction complete
                normalized.forEach(m => store.put(m));
                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror    = () => reject(tx.error);
                    tx.onabort    = () => reject(new Error('TX aborted'));
                });
                return normalized;
            } catch (err) {
                console.error('[LocalStore] saveMessages bulk error:', err.message);
                normalized.forEach(m => this._lsSet(S.MESSAGES, m));
                return normalized;
            }
        }

        /** Get all messages for a chat, sorted ASC by createdAt. */
        async getMessagesByChat(chatId, options = {}) {
            await this._dbPromise;
            if (!chatId) return [];
            const { limit = 200, before = null } = options;

            if (this._fallback) {
                let msgs = this._lsGetAll(S.MESSAGES, m => m.chatId === chatId && !m.deleted);
                if (before) msgs = msgs.filter(m => m.createdAt < before);
                return msgs.sort((a, b) => a.createdAt - b.createdAt).slice(-limit);
            }

            try {
                const tx    = this._db.transaction([S.MESSAGES], 'readonly');
                const index = tx.objectStore(S.MESSAGES).index('byChatId');
                const all   = await _wrap(index.getAll(chatId));
                let filtered = (all || []).filter(m => !m.deleted);
                if (before) filtered = filtered.filter(m => m.createdAt < before);
                return filtered.sort((a, b) => a.createdAt - b.createdAt).slice(-limit);
            } catch (err) {
                console.error('[LocalStore] getMessagesByChat error:', err.message);
                return [];
            }
        }

        /** Get one message by its local id. */
        async getMessageById(id) {
            await this._dbPromise;
            if (!id) return null;
            if (this._fallback) return this._lsGet(S.MESSAGES, id);
            try {
                const tx = this._db.transaction([S.MESSAGES], 'readonly');
                return await _wrap(tx.objectStore(S.MESSAGES).get(id));
            } catch { return null; }
        }

        /** Find message by serverId (from server confirmation). */
        async getMessageByServerId(serverId) {
            await this._dbPromise;
            if (!serverId) return null;
            if (this._fallback) {
                return this._lsGetAll(S.MESSAGES, m => m.serverId === String(serverId))[0] || null;
            }
            try {
                const tx    = this._db.transaction([S.MESSAGES], 'readonly');
                const index = tx.objectStore(S.MESSAGES).index('byServerId');
                return await _wrap(index.get(String(serverId)));
            } catch { return null; }
        }

        /** Partial-update a message by local id. */
        async updateMessage(id, patch) {
            const existing = await this.getMessageById(id);
            if (!existing) return null;
            return this.saveMessage({ ...existing, ...patch, id, updatedAt: Date.now() });
        }

        /** Shorthand for status updates. */
        async updateMessageStatus(id, status, extra = {}) {
            return this.updateMessage(id, { status, ...extra });
        }

        /**
         * Confirm a locally-created message with server data.
         * Swaps isLocalOnly=false, assigns serverId, sets status='sent'.
         */
        async confirmMessage(localId, serverId, serverData = {}) {
            const existing = await this.getMessageById(localId);
            if (!existing) {
                // Not found by localId — try serverId in case already confirmed
                const byServer = await this.getMessageByServerId(String(serverId));
                if (byServer) return byServer;
                return null;
            }
            return this.saveMessage({
                ...existing,
                ...serverData,
                id:          localId,   // keep local key
                serverId:    String(serverId),
                status:      serverData.status || 'sent',
                isLocalOnly: false,
                syncVersion: 2,
                updatedAt:   Date.now()
            });
        }

        /**
         * Merge an array of server messages into the local store.
         * Server metadata wins; existing local-only messages are not overwritten.
         */
        async mergeServerMessages(chatId, serverMessages) {
            if (!Array.isArray(serverMessages)) return [];
            const results = [];
            for (const sm of serverMessages) {
                const sid = sm.id ? String(sm.id) : null;
                if (!sid) continue;
                const existing = await this.getMessageByServerId(sid);
                if (existing) {
                    // Server wins on metadata
                    const updated = await this.updateMessage(existing.id, {
                        serverId:    sid,
                        status:      sm.status || existing.status,
                        updatedAt:   sm.updatedAt || sm.createdAt || Date.now(),
                        isLocalOnly: false,
                        syncVersion: 2
                    });
                    results.push(updated);
                } else {
                    const saved = await this.saveMessage({
                        id:          _uuid(),
                        serverId:    sid,
                        chatId,
                        senderId:    sm.senderId || sm.sender?.id,
                        content:     sm.content  || sm.text || '',
                        type:        sm.type     || 'text',
                        sender:      sm.sender   || null,
                        status:      sm.status   || 'delivered',
                        createdAt:   sm.createdAt || sm.timestamp || Date.now(),
                        isLocalOnly: false,
                        syncVersion: 2
                    });
                    results.push(saved);
                }
            }
            return results;
        }

        /** Soft-delete a message. */
        async deleteMessage(id) {
            return this.updateMessage(id, { deleted: true, status: 'deleted' });
        }

        // ══════════════════════════════════════════════════════════════════
        // CONVERSATIONS
        // ══════════════════════════════════════════════════════════════════

        async saveConversation(conv) {
            await this._dbPromise;
            if (!conv || !conv.id) return null;
            const data = { ...conv, updatedAt: conv.updatedAt || Date.now() };
            if (this._fallback) { this._lsSet(S.CONVERSATIONS, data); return data; }
            try {
                const tx = this._db.transaction([S.CONVERSATIONS], 'readwrite');
                await _wrap(tx.objectStore(S.CONVERSATIONS).put(data));
                return data;
            } catch (err) { this._lsSet(S.CONVERSATIONS, data); return data; }
        }

        async getConversation(id) {
            await this._dbPromise;
            if (this._fallback) return this._lsGet(S.CONVERSATIONS, id);
            try {
                const tx = this._db.transaction([S.CONVERSATIONS], 'readonly');
                return await _wrap(tx.objectStore(S.CONVERSATIONS).get(id));
            } catch { return null; }
        }

        async getAllConversations() {
            await this._dbPromise;
            if (this._fallback) return this._lsGetAll(S.CONVERSATIONS);
            try {
                const tx  = this._db.transaction([S.CONVERSATIONS], 'readonly');
                const all = await _wrap(tx.objectStore(S.CONVERSATIONS).getAll());
                return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            } catch { return []; }
        }

        async updateConversationLastMessage(chatId, message) {
            const conv = await this.getConversation(chatId);
            if (!conv) return null;
            return this.saveConversation({
                ...conv,
                lastMessage:   message.content,
                lastMessageAt: message.createdAt || Date.now(),
                updatedAt:     Date.now()
            });
        }

        // ══════════════════════════════════════════════════════════════════
        // SYNC META
        // ══════════════════════════════════════════════════════════════════

        async setSyncMeta(key, value) {
            await this._dbPromise;
            if (this._fallback) {
                try { getAppStorage().set(`kyn_sync_${key}`, { key, value, ts: Date.now() }); } catch {}
                return;
            }
            try {
                const tx = this._db.transaction([S.SYNC_META], 'readwrite');
                await _wrap(tx.objectStore(S.SYNC_META).put({ key, value, ts: Date.now() }));
            } catch {}
        }

        async getSyncMeta(key) {
            await this._dbPromise;
            if (this._fallback) {
                try { const r = getAppStorage().get(`kyn_sync_${key}`, null); return r?.value ?? null; } catch { return null; }
            }
            try {
                const tx = this._db.transaction([S.SYNC_META], 'readonly');
                const r  = await _wrap(tx.objectStore(S.SYNC_META).get(key));
                return r?.value ?? null;
            } catch { return null; }
        }

        // ══════════════════════════════════════════════════════════════════
        // DIAGNOSTICS
        // ══════════════════════════════════════════════════════════════════

        async debug(chatId) {
            await this._dbPromise;
            console.group('[LocalStore] Diagnostic dump');
            console.log('IDB available:', !this._fallback);
            console.log('DB:', this._db?.name, 'v' + this._db?.version);
            if (chatId) {
                const msgs = await this.getMessagesByChat(chatId);
                console.log(`Messages for chat ${chatId}:`, msgs.length, msgs);
            }
            const convs = await this.getAllConversations();
            console.log('Conversations:', convs.length, convs.map(c => c.id));
            console.groupEnd();
            return { fallback: this._fallback, db: this._db?.name };
        }

        async clearAll() {
            await this._dbPromise;
            for (const storeName of Object.values(S)) {
                if (this._fallback) {
                    const keys = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith(`kyn_ls_${storeName}_`)) keys.push(k);
                    }
                    keys.forEach(k => localStorage.removeItem(k));
                } else {
                    try {
                        const tx = this._db.transaction([storeName], 'readwrite');
                        await _wrap(tx.objectStore(storeName).clear());
                    } catch {}
                }
            }
        }

        // ── localStorage fallback helpers ────────────────────────────────────
        _lsKey(store, id) { return `kyn_ls_${store}_${id}`; }

        _lsGet(store, id) {
            try { return getAppStorage().get(this._lsKey(store, id), null); } catch { return null; }
        }

        _lsSet(store, item) {
            const id = item.id || item.key;
            if (!id) return;
            try { getAppStorage().set(this._lsKey(store, id), item); } catch {}
        }

        _lsGetAll(store, filterFn) {
            const results = [];
            const prefix  = `kyn_ls_${store}_`;
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith(prefix)) continue;
                    try {
                        const item = JSON.parse(localStorage.getItem(key));
                        if (item && (!filterFn || filterFn(item))) results.push(item);
                    } catch {}
                }
            } catch {}
            return results;
        }
    }

    // ── Singleton ─────────────────────────────────────────────────────────────
    const localStore = new LocalMessageStore();
    window.KynectaLocalStore = localStore;

    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.localStore = localStore;
    }

    console.log('[LocalStore] ✅ v2.1.0 — IndexedDB-first message store initializing…');
})();
