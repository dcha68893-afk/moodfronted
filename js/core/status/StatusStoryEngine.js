/**
 * StatusStoryEngine.js
 * Phase 4 — Story/Status Engine (Frontend)
 *
 * Production-grade story ecosystem integrating with:
 *  - Existing `kyn:status:*` CustomEvents from app.realtime.socket.js
 *  - Existing `status:expired` server event (already in server.js cron)
 *  - Existing wsService.notifyStatusViewed() server method
 *
 * HTML pages: loaded via phase4.bootstrap.js in status.html + chat.html
 *
 * @version 4.0.0
 * @phase 4 — Story/Status Engine
 */

(function () {
  'use strict';

  if (window.__StatusStoryEngine) return;

  const STORY_EXPIRY_MS  = 24 * 60 * 60 * 1000; // 24h — matches server cron
  const STORY_DB_NAME    = 'kyn_stories_v1';
  const STORY_DB_VERSION = 1;

  // ─── Story Privacy ────────────────────────────────────────────────────────

  const STORY_PRIVACY = Object.freeze({
    ALL_CONTACTS:          'all_contacts',
    CONTACTS_EXCEPT:       'contacts_except',
    ONLY_SHARE_WITH:       'only_share_with',
    CLOSE_FRIENDS:         'close_friends',
    PRIVATE:               'private',
  });

  // ─── StoryStore (IndexedDB) ───────────────────────────────────────────────

  class StoryStore {
    constructor() { this._db = null; }

    async open() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(STORY_DB_NAME, STORY_DB_VERSION);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('stories')) {
            const store = db.createObjectStore('stories', { keyPath: 'id' });
            store.createIndex('userId',    'userId',    { unique: false });
            store.createIndex('expiresAt', 'expiresAt', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
          if (!db.objectStoreNames.contains('views')) {
            const vs = db.createObjectStore('views', { keyPath: 'key' }); // key = storyId:viewerId
            vs.createIndex('storyId', 'storyId', { unique: false });
          }
        };
        req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
        req.onerror   = e => reject(e.target.error);
      });
    }

    async save(story) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction('stories', 'readwrite');
        tx.objectStore('stories').put({
          ...story,
          expiresAt: story.createdAt + STORY_EXPIRY_MS,
        });
        tx.oncomplete = () => resolve(story);
        tx.onerror    = e => reject(e.target.error);
      });
    }

    async remove(storyId) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('stories', 'readwrite');
        tx.objectStore('stories').delete(storyId);
        tx.oncomplete = () => resolve(true);
        tx.onerror    = e => reject(e.target.error);
      });
    }

    async getByUser(userId) {
      const db  = await this.open();
      const now = Date.now();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction('stories', 'readonly');
        const index = tx.objectStore('stories').index('userId');
        const req   = index.getAll(String(userId));
        req.onsuccess = e => resolve(
          (e.target.result || []).filter(s => s.expiresAt > now && !s.deleted)
        );
        req.onerror   = e => reject(e.target.error);
      });
    }

    async getAll() {
      const db  = await this.open();
      const now = Date.now();
      return new Promise((resolve, reject) => {
        const req = db.transaction('stories', 'readonly').objectStore('stories').getAll();
        req.onsuccess = e => resolve(
          (e.target.result || []).filter(s => s.expiresAt > now && !s.deleted)
        );
        req.onerror   = e => reject(e.target.error);
      });
    }

    async pruneExpired() {
      const db  = await this.open();
      const now = Date.now();
      const all = await this.getAll();
      const expired = all.filter(s => s.expiresAt <= now || s.deleted);
      const tx  = db.transaction('stories', 'readwrite');
      const store = tx.objectStore('stories');
      expired.forEach(s => store.delete(s.id));
      return expired.length;
    }

    async recordView(storyId, viewerId) {
      const db  = await this.open();
      const key = `${storyId}:${viewerId}`;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('views', 'readwrite');
        tx.objectStore('views').put({ key, storyId, viewerId, viewedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror    = () => resolve(false); // ignore duplicate key error
      });
    }

    async hasViewed(storyId, viewerId) {
      const db  = await this.open();
      const key = `${storyId}:${viewerId}`;
      return new Promise(resolve => {
        const req = db.transaction('views', 'readonly').objectStore('views').get(key);
        req.onsuccess = e => resolve(!!e.target.result);
        req.onerror   = () => resolve(false);
      });
    }
  }

  // ─── StoryExpirationEngine ────────────────────────────────────────────────

  class StoryExpirationEngine {
    constructor(store, onExpired) {
      this._store     = store;
      this._onExpired = onExpired;
      this._timers    = new Map(); // storyId → timeoutId
    }

    scheduleExpiry(story) {
      const remaining = (story.createdAt + STORY_EXPIRY_MS) - Date.now();
      if (remaining <= 0) {
        this._onExpired(story.id, story.userId);
        return;
      }
      if (this._timers.has(story.id)) clearTimeout(this._timers.get(story.id));

      // FIX #9 — Only schedule if timers are not paused
      if (this._paused) {
        // Store remaining time for when we resume
        this._pausedRemaining = this._pausedRemaining || new Map();
        this._pausedRemaining.set(story.id, { story, remaining });
        return;
      }

      const tid = setTimeout(() => {
        this._timers.delete(story.id);
        this._onExpired(story.id, story.userId);
      }, Math.min(remaining, 2147483647));
      this._timers.set(story.id, tid);
    }

    // FIX #9 — Pause all auto-dismiss/progress timers during user interaction
    pauseAll(reason) {
      this._paused = true;
      this._pauseReason = reason || 'unknown';
      this._pausedRemaining = this._pausedRemaining || new Map();
      for (const [storyId, tid] of this._timers) {
        clearTimeout(tid);
        this._pausedRemaining.set(storyId, {
          remaining: 0,  // will be rescheduled on resume with full remaining
          pausedAt: Date.now()
        });
      }
      this._timers.clear();
    }

    // FIX #9 — Resume all timers after interaction closes
    resumeAll() {
      this._paused = false;
      // Re-schedule any paused timers
      if (this._pausedRemaining) {
        for (const [storyId, meta] of this._pausedRemaining) {
          if (meta.story) this.scheduleExpiry(meta.story);
        }
        this._pausedRemaining.clear();
      }
    }

    cancelExpiry(storyId) {
      const tid = this._timers.get(storyId);
      if (tid) { clearTimeout(tid); this._timers.delete(storyId); }
      if (this._pausedRemaining) this._pausedRemaining.delete(storyId);
    }

    async pruneAndSchedule(stories) {
      for (const story of stories) this.scheduleExpiry(story);
      const pruned = await this._store.pruneExpired();
      if (pruned > 0) console.log(`[StoryEngine] Pruned ${pruned} expired stories from IDB`);
    }
  }

  // ─── ViewerSyncEngine ─────────────────────────────────────────────────────

  class ViewerSyncEngine {
    constructor(store) {
      this._store  = store;
      this._counts = new Map(); // storyId → viewerCount
    }

    async recordView(storyId, viewerId, ownerId) {
      const alreadySeen = await this._store.hasViewed(storyId, viewerId);

      // FIX #10 — Always persist to IDB so view history survives refresh
      await this._store.recordView(storyId, viewerId);

      // FIX #10 — Also persist to localStorage as fallback
      try {
        const viewKey = 'nexopa_status_views_v1';
        const views = JSON.parse(localStorage.getItem(viewKey) || '{}');
        views[String(storyId) + ':' + String(viewerId)] = {
          storyId: String(storyId), viewerId: String(viewerId),
          viewedAt: Date.now(), ownerId: String(ownerId || '')
        };
        const keys = Object.keys(views);
        if (keys.length > 500) {
          keys.sort((a, b) => (views[a].viewedAt || 0) - (views[b].viewedAt || 0));
          keys.slice(0, keys.length - 500).forEach(k => delete views[k]);
        }
        localStorage.setItem(viewKey, JSON.stringify(views));
      } catch (_) {}

      if (alreadySeen) return false;

      this._counts.set(storyId, (this._counts.get(storyId) || 0) + 1);

      // Notify server (uses existing wsService.notifyStatusViewed route)
      const rt = window.KynectaRealtime;
      if (rt?._socket?.connected) {
        rt._socket.emit('status:view', { storyId, viewerId, ownerId, timestamp: Date.now() });
      }

      return true;
    }

    getCount(storyId) { return this._counts.get(storyId) || 0; }
    updateCount(storyId, count) { this._counts.set(storyId, count); }
  }

  // ─── StorySequenceManager ─────────────────────────────────────────────────

  class StorySequenceManager {
    constructor() {
      this._sequences = new Map(); // userId → [storyIds in order]
      this._current   = null;      // { userId, index }
    }

    setSequence(userId, storyIds) {
      this._sequences.set(String(userId), storyIds);
    }

    startViewing(userId) {
      this._current = { userId: String(userId), index: 0 };
      return this.getCurrent();
    }

    next() {
      if (!this._current) return null;
      const seq = this._sequences.get(this._current.userId) || [];
      this._current.index++;
      if (this._current.index >= seq.length) {
        this._current = null;
        return null; // end of sequence
      }
      return this.getCurrent();
    }

    previous() {
      if (!this._current) return null;
      if (this._current.index > 0) this._current.index--;
      return this.getCurrent();
    }

    getCurrent() {
      if (!this._current) return null;
      const seq = this._sequences.get(this._current.userId) || [];
      const storyId = seq[this._current.index];
      return storyId ? { userId: this._current.userId, storyId, index: this._current.index, total: seq.length } : null;
    }

    stop() { this._current = null; }
  }

  // ─── StoryRealtimeEngine ──────────────────────────────────────────────────

  class StoryRealtimeEngine {
    constructor(store, expiration, viewers, sequence) {
      this._store      = store;
      this._expiration = expiration;
      this._viewers    = viewers;
      this._sequence   = sequence;
      this._listeners  = [];
    }

    attachSocketListeners() {
      const rt = window.KynectaRealtime;
      if (!rt) { setTimeout(() => this.attachSocketListeners(), 1000); return; }

      const statusEvents = [
        'status:new', 'status:created', 'status_new', 'status_created',
        'status:viewed', 'status:view', 'status_viewed',
        'status:reaction', 'status:reply', 'status_reaction',
        'status:deleted', 'status_deleted',
        'status:expired',  // dispatched by server.js cron
        'status:privacy_updated',
        'status:highlight_added',
      ];

      for (const evt of statusEvents) {
        if (rt.on) rt.on(evt, payload => this._handleStatusEvent(evt, payload));
      }

      // FIX-ROOT-CAUSE (infinite recursion / RangeError: Maximum call stack size
      // exceeded, "postMessage storm detected" x100+/2s): this loop used to ALSO
      // subscribe to window CustomEvents named 'kyn:' + evt for every one of these
      // same status events. But _dispatchToAll() below (the only place that ever
      // emits those exact 'kyn:'+eventType CustomEvents for status events) is
      // itself called from _handleStatusEvent — which this same listener called
      // right back into. Net effect: every real status:* event received via
      // rt.on() above triggered _handleStatusEvent -> _dispatchToAll ->
      // window.dispatchEvent('kyn:status:X') -> this instance's OWN listener for
      // 'kyn:status:X' -> _handleStatusEvent again -> _dispatchToAll again ->
      // forever, until the stack overflowed. Removed entirely: this engine
      // already gets every status event directly from rt.on() immediately above;
      // it has no need to also listen for the very echo it produces. Other
      // subsystems (status-core-runtime.js, SocialNotificationEngine.js,
      // GroupPresenceCacheEngine.js, CacheRepairEngine.js) still listen for these
      // 'kyn:status:*' events from _dispatchToAll and are unaffected — none of
      // them re-dispatch, so none of them can loop.
    }

    async _handleStatusEvent(eventType, payload) {
      const normalized = eventType.replace(/_/g, ':');

      switch (normalized) {
        case 'status:new':
        case 'status:created': {
          const story = payload.story || payload.status || payload;
          if (story?.id) {
            story.createdAt = story.createdAt ? new Date(story.createdAt).getTime() : Date.now();
            await this._store.save(story).catch(() => {});
            this._expiration.scheduleExpiry(story);

            const seq = this._sequence;
            const existing = seq._sequences.get(String(story.userId)) || [];
            if (!existing.includes(story.id)) {
              seq.setSequence(String(story.userId), [...existing, story.id]);
            }

            this._notify('story:new', story);
            this._dispatchToAll('status:new', { story });
          }
          break;
        }

        case 'status:viewed':
        case 'status:view': {
          const { storyId, viewCount } = payload;
          if (storyId && viewCount !== undefined) {
            this._viewers.updateCount(storyId, viewCount);
            this._notify('story:view_count', { storyId, viewCount });
            this._dispatchToAll('status:viewed', payload);
          }
          break;
        }

        case 'status:reaction': {
          this._notify('story:reaction', payload);
          this._dispatchToAll('status:reaction', payload);
          break;
        }

        case 'status:reply': {
          this._notify('story:reply', payload);
          this._dispatchToAll('status:reply', payload);
          break;
        }

        case 'status:deleted': {
          const storyId = payload.storyId || payload.id;
          if (storyId) {
            await this._store.remove(storyId).catch(() => {});
            this._expiration.cancelExpiry(storyId);
            window.__PersistenceStabilizationLayer?.markDeleted('status', storyId);
            this._notify('story:deleted', { storyId });
            this._dispatchToAll('status:deleted', payload);
          }
          break;
        }

        case 'status:expired': {
          // Server emits this from the 5-minute cron in server.js
          const { statusIds } = payload;
          if (Array.isArray(statusIds)) {
            for (const id of statusIds) {
              await this._store.remove(id).catch(() => {});
              this._expiration.cancelExpiry(id);
              window.__PersistenceStabilizationLayer?.markDeleted('status', id);
            }
            this._notify('story:expired', { statusIds });
            this._dispatchToAll('status:expired', payload);
          }
          break;
        }
      }
    }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    _notify(event, data) {
      this._listeners.forEach(fn => { try { fn({ event, ...data }); } catch (_) {} });
    }

    _dispatchToAll(eventType, payload) {
      // FIX-GUARD: reentrancy protection. This is what actually prevents a
      // stack overflow if this same eventType is ever fed back into
      // _handleStatusEvent while a dispatch for it is already in flight (the
      // exact shape of the self-listener bug removed from attachSocketListeners
      // above). Not just a duplicate-call guard — it only blocks nested
      // re-entry of the SAME eventType, so back-to-back distinct calls (e.g.
      // two different stories arriving) are never affected.
      this.__dispatching = this.__dispatching || new Set();
      if (this.__dispatching.has(eventType)) return;
      this.__dispatching.add(eventType);
      try {
        try { window.dispatchEvent(new CustomEvent('kyn:' + eventType, { detail: payload })); } catch (_) {}
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(f => {
          try { f.contentWindow.postMessage({ type: 'REALTIME_EVENT:' + eventType, payload }, '*'); } catch (_) {}
        });
        const bus = window.KynectaEventBus;
        if (bus) bus.emit('REALTIME_' + eventType, payload, { async: true });
      } finally {
        this.__dispatching.delete(eventType);
      }
    }
  }

  // ─── StatusStoryEngine (main) ─────────────────────────────────────────────

  class StatusStoryEngine {
    constructor() {
      this._store      = new StoryStore();
      this._expiration = new StoryExpirationEngine(this._store, (storyId, userId) => {
        this._onStoryExpired(storyId, userId);
      });
      this._viewers    = new ViewerSyncEngine(this._store);
      this._sequence   = new StorySequenceManager();
      this._realtime   = new StoryRealtimeEngine(
        this._store, this._expiration, this._viewers, this._sequence
      );
    }

    async start() {
      this._realtime.attachSocketListeners();

      // FIX #9 — Wire timer pause/resume for status reply, viewers, and share interactions.
      // When the user opens any of these panels the auto-dismiss timers must freeze.
      const pauseExp = (reason) => this._expiration.pauseAll(reason);
      const resumeExp = () => this._expiration.resumeAll();

      window.addEventListener('kyn:status:replyOpen',   () => pauseExp('reply'));
      window.addEventListener('kyn:status:replyClose',  resumeExp);
      window.addEventListener('kyn:status:viewersOpen', () => pauseExp('viewers'));
      window.addEventListener('kyn:status:viewersClose', resumeExp);
      window.addEventListener('kyn:status:shareOpen',   () => pauseExp('share'));
      window.addEventListener('kyn:status:shareClose',  resumeExp);

      // Also intercept focus on reply input elements
      document.addEventListener('focusin', (e) => {
        if (e.target && e.target.closest && e.target.closest('.status-reply-input, [data-status-reply], .story-reply-box')) {
          pauseExp('input');
        }
      });
      document.addEventListener('focusout', (e) => {
        if (e.target && e.target.closest && e.target.closest('.status-reply-input, [data-status-reply], .story-reply-box')) {
          setTimeout(resumeExp, 400);
        }
      });

      // Hydrate from IDB
      try {
        const stories = await this._store.getAll();
        await this._expiration.pruneAndSchedule(stories);

        // Rebuild sequences
        const byUser = {};
        for (const s of stories) {
          if (!byUser[s.userId]) byUser[s.userId] = [];
          byUser[s.userId].push(s.id);
        }
        for (const [uid, ids] of Object.entries(byUser)) {
          this._sequence.setSequence(uid, ids);
        }

        console.log(`[StoryEngine] Hydrated ${stories.length} active stories`);
      } catch (err) {
        console.warn('[StoryEngine] IDB hydration error:', err.message);
      }

      // Run expiry prune every 5 minutes (matches server cron)
      setInterval(() => this._store.pruneExpired(), 5 * 60 * 1000);

      console.log('[StoryEngine] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    async getStoriesForUser(userId) {
      return this._store.getByUser(userId);
    }

    async recordView(storyId, viewerId, ownerId) {
      return this._viewers.recordView(storyId, viewerId, ownerId);
    }

    getViewCount(storyId) { return this._viewers.getCount(storyId); }

    startSequence(userId) { return this._sequence.startViewing(userId); }
    nextStory()           { return this._sequence.next(); }
    prevStory()           { return this._sequence.previous(); }
    stopSequence()        { this._sequence.stop(); }
    getCurrentStory()     { return this._sequence.getCurrent(); }

    sendReaction(storyId, ownerId, emoji) {
      const rt = window.KynectaRealtime;
      if (rt?._socket?.connected) {
        rt._socket.emit('status:react', { storyId, ownerId, emoji, timestamp: Date.now() });
      }
    }

    sendReply(storyId, ownerId, text) {
      const rt = window.KynectaRealtime;
      if (rt?._socket?.connected) {
        rt._socket.emit('status:reply', { storyId, ownerId, text, timestamp: Date.now() });
      }
    }

    onChange(fn) { return this._realtime.onChange(fn); }

    getDiagnostics() {
      return {
        started: true,
        viewerCounts: this._viewers._counts.size,
        sequences: this._sequence._sequences.size,
      };
    }

    _onStoryExpired(storyId, userId) {
      this._store.remove(storyId).catch(() => {});
      window.__PersistenceStabilizationLayer?.markDeleted('status', storyId);
      this._realtime._dispatchToAll('status:expired', { statusIds: [storyId], userId });
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new StatusStoryEngine();
  engine.start().catch(e => console.warn('[StoryEngine] Start error:', e.message));

  window.__StatusStoryEngine = engine;
  window.StoryEngine         = engine;
  window.STORY_PRIVACY       = STORY_PRIVACY;

  console.log('[StoryEngine] ✅ Ready');
})();