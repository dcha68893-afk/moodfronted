// group-core-patch.js — lifecycle + group rendering stability guards
import { LifecycleState, GroupCore } from './group-core-bootstrap.js';
import './group-core-patch.legacy.js';

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

const GC = GroupCore || window.GroupCore;
if (GC) {
  // Never let a transient empty / incomplete / unauthorized server payload
  // erase a group list that is already visible from local cache. The next
  // successful sync can still update individual records normally.
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
        console.warn('[GroupCore] Ignoring transient empty /groups/user payload; preserving cached groups');
        return this.getGroupsData?.() || null;
      }
      return originalMerge(serverData, ...args);
    };
  }

  // Keep the request wrapper as a second line of defence if another code path
  // replaces the merge function or mutates arrays after a failed sync.
  if (typeof GC.requestGroupList === 'function' && !GC.__emptySyncGuardInstalled) {
    GC.__emptySyncGuardInstalled = true;
    const originalRequestGroupList = GC.requestGroupList.bind(GC);
    GC.requestGroupList = async function guardedRequestGroupList(...args) {
      const before = {
        groups: Array.isArray(this.groups) ? [...this.groups] : [],
        myGroups: Array.isArray(this.myGroups) ? [...this.myGroups] : [],
        joinedGroups: Array.isArray(this.joinedGroups) ? [...this.joinedGroups] : [],
        adminGroups: Array.isArray(this.adminGroups) ? [...this.adminGroups] : []
      };

      // Do not allow a slow /groups/user handshake to hold a caller for the
      // same 12s + 8s retry window visible in the browser console. Returning
      // cached data after 5s keeps navigation/rendering responsive while the
      // original request is allowed to finish in the background.
      const timeoutResult = new Promise(resolve => setTimeout(() => resolve({
        success: true,
        fromCache: true,
        timedOut: true,
        data: this.getGroupsData?.() || {
          groups: before.groups,
          myGroups: before.myGroups,
          joinedGroups: before.joinedGroups,
          adminGroups: before.adminGroups
        }
      }), 5000));

      let result;
      try {
        result = await Promise.race([originalRequestGroupList(...args), timeoutResult]);
      } catch (error) {
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
        return { success: true, fromCache: true, preserved: true, timedOut: result?.timedOut === true, data: this.getGroupsData?.() };
      }
      return result;
    };
  }
}