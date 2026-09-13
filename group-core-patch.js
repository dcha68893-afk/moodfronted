// group-core-patch.js — lifecycle + group rendering stability guards
import { LifecycleState, GroupCore } from './group-core-bootstrap.js';
import { API_WRAPPER } from './group-core-operations.js';

// FIX-GROUP-CORE-GLOBAL: groupEncryption.client.js runs as a classic script and
// cannot see an ES-module export through window automatically. Publish the SAME
// GroupCore object used by the module graph so the encryption boundary and UI
// operate on one canonical instance.
if (GroupCore && !window.GroupCore) {
  window.GroupCore = GroupCore;
}

// Once ACTIVE, redundant parent/session handshakes must not force the iframe
// back into WAIT_PARENT. Account switching has its own explicit auth event.
if (LifecycleState && typeof LifecycleState.reenterWaitParent === 'function') {
  LifecycleState.reenterWaitParent = function preventActiveBounce() {
    return false;
  };
}

// The group operations wrapper historically accepted timeout in its options,
// but its internal apiRequest call does not forward that value. Bound only GET
// requests to group endpoints here. The underlying request may finish later,
// but the UI receives a deterministic timeout result instead of remaining
// blocked on a slow network/database path.
if (API_WRAPPER && typeof API_WRAPPER.request === 'function' && !API_WRAPPER.__groupGetTimeoutGuard) {
  API_WRAPPER.__groupGetTimeoutGuard = true;
  const originalApiRequest = API_WRAPPER.request.bind(API_WRAPPER);
  API_WRAPPER.request = async function groupGetTimeoutGuard(endpoint, options = {}) {
    const method = String(options?.method || 'GET').toUpperCase();
    const path = String(endpoint || '');
    const isGroupRead = method === 'GET' && /^\/groups(?:\/|$)/i.test(path);
    if (!isGroupRead) return originalApiRequest(endpoint, options);

    const timeoutMs = Math.max(2000, Math.min(Number(options?.timeout) || 3500, 3500));
    let timeoutId;
    const timeoutResult = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve({
        success: false,
        status: 'timeout',
        timedOut: true,
        fromCache: true,
        data: null,
        message: 'Group request timed out; continuing with cached UI state.'
      }), timeoutMs);
    });

    try {
      return await Promise.race([originalApiRequest(endpoint, options), timeoutResult]);
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

const GC = GroupCore || window.GroupCore;
if (GC) {
  // Never let a transient empty / incomplete / unauthorized server payload
  // erase a group list that is already visible from local cache.
  if (typeof GC.mergeWithServerData === 'function' && !GC.__emptyServerPayloadGuard) {
    GC.__emptyServerPayloadGuard = true;
    const originalMerge = GC.mergeWithServerData.bind(GC);
    GC.mergeWithServerData = async function guardedMerge(serverData, ...args) {
      const existingCount = [this.groups, this.myGroups, this.joinedGroups, this.adminGroups]
        .reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
      const payloadGroups = Array.isArray(serverData?.groups) ? serverData.groups : null;
      const payloadPartitionCount = ['myGroups', 'joinedGroups', 'adminGroups']
        .reduce((n, key) => n + (Array.isArray(serverData?.[key]) ? serverData[key].length : 0), 0);
      const explicitlyEmpty = payloadGroups && payloadGroups.length === 0 && payloadPartitionCount === 0;
      if (existingCount > 0 && explicitlyEmpty) {
        return this.getGroupsData?.() || null;
      }
      return originalMerge(serverData, ...args);
    };
  }

  // Deduplicate all callers of requestGroupList(). The group UI has several
  // legitimate startup paths (initial render, tab refresh, background sync,
  // parent activation), but they must share one network request. Without this
  // guard, each caller could start another /groups/user request before the
  // previous one had settled, which produced the repeated backend
  // getUserGroups warnings seen every ~second and kept desktop stuck on its
  // loading skeleton while mobile happened to have already hydrated its cache.
  if (typeof GC.requestGroupList === 'function' && !GC.__groupRequestDedupGuard) {
    GC.__groupRequestDedupGuard = true;
    const originalRequestGroupList = GC.requestGroupList.bind(GC);
    let inFlight = null;

    GC.requestGroupList = function deduplicatedRequestGroupList(...args) {
      if (inFlight) return inFlight;

      const before = {
        groups: Array.isArray(this.groups) ? [...this.groups] : [],
        myGroups: Array.isArray(this.myGroups) ? [...this.myGroups] : [],
        joinedGroups: Array.isArray(this.joinedGroups) ? [...this.joinedGroups] : [],
        adminGroups: Array.isArray(this.adminGroups) ? [...this.adminGroups] : []
      };

      const timeoutResult = new Promise(resolve => setTimeout(() => resolve({
        success: true,
        fromCache: true,
        timedOut: true,
        data: this.getGroupsData?.() || before
      }), 2500));

      inFlight = (async () => {
        let result;
        try {
          result = await Promise.race([originalRequestGroupList(...args), timeoutResult]);
        } catch (_) {
          result = { success: true, fromCache: true, timedOut: true, data: this.getGroupsData?.() || before };
        }

        const afterEmpty = [this.groups, this.myGroups, this.joinedGroups, this.adminGroups]
          .every(list => !Array.isArray(list) || list.length === 0);
        const hadVisibleGroups = Object.values(before).some(list => list.length > 0);

        if (hadVisibleGroups && afterEmpty) {
          this.groups = before.groups;
          this.myGroups = before.myGroups;
          this.joinedGroups = before.joinedGroups;
          this.adminGroups = before.adminGroups;
          try {
            this.emit('groups:list-updated', {
              ...before,
              fromCache: true,
              preservedAfterFailedSync: true,
              timedOut: result?.timedOut === true
            });
          } catch (_) {}
          return {
            success: true,
            fromCache: true,
            preserved: true,
            timedOut: result?.timedOut === true,
            data: this.getGroupsData?.()
          };
        }

        return result;
      })().finally(() => {
        inFlight = null;
      });

      return inFlight;
    };
  }
}

// FIX-GROUP-REALTIME-RECURSION: the production console trace showed a
// synchronous cycle of GroupRealtimeDispatcher.dispatch -> GroupSyncEngine.onTyping
// -> GroupOrchestrator._handleGroupSocketEvent -> the window socket listener ->
// GroupRealtimeDispatcher.dispatch again. That recursion is independent of the
// actual group message payload, but once it overflows the stack the browser can
// no longer reliably process subsequent realtime events on that iframe.
// Do not create a second dispatcher or replace the orchestrator. Guard the
// existing dispatcher at its boundary so a nested dispatch of the SAME realtime
// event is dropped while the outer dispatch is still running. This is deliberately
// narrow: unrelated events and sequential typing events are still delivered.
(function installGroupRealtimeRecursionGuard() {
  if (typeof window === 'undefined') return;

  function install() {
    try {
      const dispatcher = window.GroupRealtimeDispatcher;
      if (!dispatcher || typeof dispatcher.dispatch !== 'function') return false;
      if (dispatcher.__nexopaTypingRecursionGuard) return true;

      const originalDispatch = dispatcher.dispatch;
      let dispatchDepth = 0;
      const activeEventKeys = new Set();

      function eventKey(event, args) {
        if (typeof event === 'string') return event;
        if (!event || typeof event !== 'object') return '';
        const type = event.type || event.event || event.name || event.kind || '';
        const groupId = event.groupId ?? event.group?.id ?? '';
        const userId = event.userId ?? event.senderId ?? event.user?.id ?? '';
        return `${type}:${groupId}:${userId}`;
      }

      dispatcher.dispatch = function guardedGroupDispatch(event, ...args) {
        const key = eventKey(event, args);
        const type = typeof event === 'string'
          ? event
          : (event?.type || event?.event || event?.name || event?.kind || '');
        const isTyping = String(type).toLowerCase().includes('typing');

        if (isTyping && dispatchDepth > 0 && key && activeEventKeys.has(key)) {
          return undefined;
        }

        dispatchDepth += 1;
        if (key) activeEventKeys.add(key);
        try {
          return originalDispatch.call(this, event, ...args);
        } finally {
          if (key) activeEventKeys.delete(key);
          dispatchDepth = Math.max(0, dispatchDepth - 1);
        }
      };

      dispatcher.__nexopaTypingRecursionGuard = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  if (install()) return;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 20) clearInterval(timer);
  }, 250);
})();
