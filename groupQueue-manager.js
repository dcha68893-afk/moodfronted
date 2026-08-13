// ============================================================
// groupQueue.manager.js
// OFFLINE ACTION QUEUE — queues, persists, retries group mutations
// Works with localStore.groups.js + groupSync.engine.js
// ============================================================

const QUEUE_VERSION   = '1.0.0';
const MAX_RETRY       = 5;
const BASE_RETRY_DELAY= 3000;  // 3s
const MAX_RETRY_DELAY = 60000; // 60s
const QUEUE_PROCESS_INTERVAL = 5000; // poll every 5s when online

// ── Allowed action types ──────────────────────────────────────────────────
const QUEUE_ACTIONS = Object.freeze({
    CREATE_GROUP  : 'create_group',
    UPDATE_GROUP  : 'update_group',
    DELETE_GROUP  : 'delete_group',
    ADD_MEMBER    : 'add_member',
    REMOVE_MEMBER : 'remove_member',
    UPDATE_ROLE   : 'update_role',
    LEAVE_GROUP   : 'leave_group',
    ACCEPT_INVITE : 'accept_invite',
    DECLINE_INVITE: 'decline_invite',
    SEND_MESSAGE  : 'send_message',
});

// ── Internal state ────────────────────────────────────────────────────────
let _isProcessing   = false;
let _processTimer   = null;
let _isOnline       = navigator.onLine;
let _store          = null;  // set via setStore()
let _apiCall        = null;  // set via setApiCall()
let _onSuccess      = null;  // optional callback
let _onFailure      = null;  // optional callback
const _inFlight     = new Set(); // queueIds currently being processed

// ── Bootstrap: listen to online/offline ──────────────────────────────────
window.addEventListener('online',  () => { _isOnline = true;  _scheduleProcess(500); });
window.addEventListener('offline', () => { _isOnline = false; });

// ── Public API ────────────────────────────────────────────────────────────
const GroupQueueManager = {

    version: QUEUE_VERSION,
    ACTIONS: QUEUE_ACTIONS,

    // ── Dependency injection ──────────────────────────────────────────────
    // Call these from your app init BEFORE any queue operations.
    setStore(localStore) {
        _store = localStore;
    },

    setApiCall(fn) {
        // fn(endpoint, method, body) → Promise<{ success, data, error }>
        _apiCall = fn;
    },

    onSuccess(cb) { _onSuccess = cb; },
    onFailure(cb) { _onFailure = cb; },

    // ── Enqueue an action ─────────────────────────────────────────────────
    // Returns the queueId for tracking.
    async enqueue(action, groupId, userId, payload = {}) {
        if (!Object.values(QUEUE_ACTIONS).includes(action)) {
            throw new Error(`[GroupQueue] Unknown action: ${action}`);
        }

        const item = {
            queueId    : `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            action,
            groupId    : groupId ?? null,
            userId     : userId  ?? null,
            payload,
            retryCount : 0,
            lastAttempt: null,
            createdAt  : new Date().toISOString(),
        };

        if (!_store) {
            console.warn('[GroupQueue] No store set — using LS-only fallback');
            _lsFallbackEnqueue(item);
        } else {
            await _store.enqueueAction(item);
        }

        console.log(`[GroupQueue] ✉️  Enqueued: ${action} (${item.queueId})`);
        _scheduleProcess(100);
        return item.queueId;
    },

    // ── Process queue now ─────────────────────────────────────────────────
    async processNow() {
        if (_isProcessing) return;
        if (!_isOnline)    { console.log('[GroupQueue] Offline — queue deferred'); return; }
        if (!_apiCall)     { console.warn('[GroupQueue] No apiCall set'); return; }

        _isProcessing = true;

        try {
            const pending = _store
                ? await _store.getPendingQueue()
                : _lsFallbackGetAll();

            if (pending.length === 0) { _isProcessing = false; return; }

            console.log(`[GroupQueue] 🔄 Processing ${pending.length} queued action(s)`);

            for (const item of pending) {
                if (_inFlight.has(item.queueId)) continue;

                // Exponential back-off guard
                if (item.lastAttempt) {
                    const delay = Math.min(
                        BASE_RETRY_DELAY * Math.pow(2, item.retryCount),
                        MAX_RETRY_DELAY
                    );
                    if (Date.now() - new Date(item.lastAttempt).getTime() < delay) continue;
                }

                _inFlight.add(item.queueId);

                try {
                    const result = await _dispatchAction(item);

                    if (result.success) {
                        await _dequeue(item.queueId);
                        _inFlight.delete(item.queueId);
                        console.log(`[GroupQueue] ✅ ${item.action} succeeded (${item.queueId})`);
                        if (_onSuccess) _onSuccess(item, result);
                    } else {
                        throw new Error(result.error || 'Server error');
                    }
                } catch (err) {
                    _inFlight.delete(item.queueId);
                    const newCount = (item.retryCount || 0) + 1;

                    if (newCount >= MAX_RETRY) {
                        console.error(`[GroupQueue] ❌ ${item.action} failed permanently after ${MAX_RETRY} retries`);
                        await _updateItem(item.queueId, { retryCount: newCount, lastAttempt: new Date().toISOString(), status: 'failed' });
                        if (_onFailure) _onFailure(item, err);
                    } else {
                        await _updateItem(item.queueId, { retryCount: newCount, lastAttempt: new Date().toISOString() });
                        console.warn(`[GroupQueue] ⚠️  ${item.action} retry ${newCount}/${MAX_RETRY}: ${err.message}`);
                    }
                }
            }
        } finally {
            _isProcessing = false;
            _scheduleProcess(QUEUE_PROCESS_INTERVAL);
        }
    },

    // ── Cancel a queued action ────────────────────────────────────────────
    async cancel(queueId) {
        await _dequeue(queueId);
        _inFlight.delete(queueId);
        console.log(`[GroupQueue] 🚫 Cancelled: ${queueId}`);
    },

    // ── Status / diagnostics ──────────────────────────────────────────────
    async getStatus() {
        const items = _store
            ? await _store.getPendingQueue()
            : _lsFallbackGetAll();

        return {
            total      : items.length,
            pending    : items.filter(i => !i.status || i.status === 'pending').length,
            failed     : items.filter(i => i.status === 'failed').length,
            inFlight   : _inFlight.size,
            isOnline   : _isOnline,
            isProcessing: _isProcessing,
        };
    },

    // ── Start periodic processing ─────────────────────────────────────────
    startAutoProcess() {
        _scheduleProcess(1000);
    },

    stopAutoProcess() {
        if (_processTimer) { clearTimeout(_processTimer); _processTimer = null; }
    },
};

// ── Internal helpers ──────────────────────────────────────────────────────
function _scheduleProcess(ms = QUEUE_PROCESS_INTERVAL) {
    if (_processTimer) clearTimeout(_processTimer);
    _processTimer = setTimeout(() => GroupQueueManager.processNow(), ms);
}

async function _dequeue(queueId) {
    if (_store) await _store.dequeueAction(queueId);
    else _lsFallbackDequeue(queueId);
}

async function _updateItem(queueId, updates) {
    if (_store) await _store.updateQueueItem(queueId, updates);
    else {
        const q = _lsFallbackGetAll();
        const idx = q.findIndex(i => i.queueId === queueId);
        if (idx !== -1) { q[idx] = { ...q[idx], ...updates }; _lsFallbackSave(q); }
    }
}

// ── Action dispatcher — maps queue actions to API endpoints ──────────────
async function _dispatchAction(item) {
    const { action, groupId, userId, payload } = item;

    switch (action) {
        case QUEUE_ACTIONS.CREATE_GROUP:
            return _apiCall('/groups', 'POST', payload);

        case QUEUE_ACTIONS.UPDATE_GROUP:
            return _apiCall(`/groups/${groupId}`, 'PUT', payload);

        case QUEUE_ACTIONS.DELETE_GROUP:
            return _apiCall(`/groups/${groupId}`, 'DELETE', null);

        case QUEUE_ACTIONS.ADD_MEMBER: {
            const res = await _apiCall(`/group-members/${groupId}/invitations`, 'POST', {
                inviteeId: userId,
                role: payload.role || 'member',
            });
            // FIX (idempotency): if the invite from an earlier attempt of this
            // same retried queue item actually succeeded server-side but the
            // client never got the response (dropped connection, etc.), a
            // retry hits inviteToGroup's own dedup guard and gets back an
            // "already invited"/"already a member" error. That's not a real
            // failure — without this, the item exhausts MAX_RETRY and is
            // reported to the user as a permanently failed add, even though
            // the invite/add already went through.
            if (!res.success && /already invited|already a member|already_member/i.test(res.error || '')) {
                return { success: true, data: res.data || null, alreadyDone: true };
            }
            return res;
        }

        case QUEUE_ACTIONS.REMOVE_MEMBER:
            return _apiCall(`/groups/${groupId}/members/${userId}`, 'DELETE', null);

        case QUEUE_ACTIONS.UPDATE_ROLE:
            // FIX: /promote and /demote routes don't exist in group.js.
            // The correct endpoint is PUT /groups/:groupId/members/:userId/role
            return _apiCall(`/groups/${groupId}/members/${userId}/role`, 'PUT', {
                role: payload.role || 'member',
            });

        case QUEUE_ACTIONS.LEAVE_GROUP:
            return _apiCall(`/groups/${groupId}/leave`, 'POST', null);

        case QUEUE_ACTIONS.ACCEPT_INVITE:
            return _apiCall(`/group-members/invitations/${payload.inviteId}/accept`, 'POST', null);

        case QUEUE_ACTIONS.DECLINE_INVITE:
            return _apiCall(`/group-members/invitations/${payload.inviteId}/decline`, 'POST', null);

        case QUEUE_ACTIONS.SEND_MESSAGE:
            return _apiCall(`/groups/${groupId}/messages`, 'POST', payload);

        default:
            return { success: false, error: `Unknown action: ${action}` };
    }
}

// ── localStorage fallback (when IDB not available) ────────────────────────
const _LS_QUEUE_KEY = 'knecta_group_queue';

function _lsFallbackGetAll() {
    try { return JSON.parse(localStorage.getItem(_LS_QUEUE_KEY) || '[]'); }
    catch(e) { return []; }
}

function _lsFallbackSave(arr) {
    try { localStorage.setItem(_LS_QUEUE_KEY, JSON.stringify(arr)); } catch(e) {}
}

function _lsFallbackEnqueue(item) {
    const q = _lsFallbackGetAll();
    q.push(item);
    _lsFallbackSave(q);
}

function _lsFallbackDequeue(queueId) {
    const q = _lsFallbackGetAll().filter(i => i.queueId !== queueId);
    _lsFallbackSave(q);
}

// ── Global exposure ───────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.GroupQueueManager = GroupQueueManager;
}

export default GroupQueueManager;
export { GroupQueueManager, QUEUE_ACTIONS };