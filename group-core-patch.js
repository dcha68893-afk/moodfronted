// group-core-patch.js — lifecycle + empty-sync stability guard
import { LifecycleState } from './group-core-bootstrap.js';
import './group-core-patch.legacy.js';

// Keep ACTIVE monotonic. Routine parent/session handshakes must not bounce an
// already-active group iframe back into the parent's retry state.
if (LifecycleState && typeof LifecycleState.reenterWaitParent === 'function') {
  LifecycleState.reenterWaitParent = function preventActiveBounce() {
    return false;
  };
}

// A transient / incomplete / unauthorized / cold-backend empty response from
// /groups/user must never erase groups that are already visible locally.
// The underlying requestGroupList() intentionally merges server data, but its
// merge step can legitimately remove cached groups that are absent from one
// bad response. Preserve the last known-good state and let a later sync repair
// it instead of flashing the UI to an empty/placeholder state.
const GC = window.GroupCore;
if (GC && typeof GC.requestGroupList === 'function' && !GC.__emptySyncGuardInstalled) {
  GC.__emptySyncGuardInstalled = true;
  const originalRequestGroupList = GC.requestGroupList.bind(GC);
  GC.requestGroupList = async function guardedRequestGroupList(...args) {
    const before = {
      groups: Array.isArray(this.groups) ? [...this.groups] : [],
      myGroups: Array.isArray(this.myGroups) ? [...this.myGroups] : [],
      joinedGroups: Array.isArray(this.joinedGroups) ? [...this.joinedGroups] : [],
      adminGroups: Array.isArray(this.adminGroups) ? [...this.adminGroups] : []
    };
    const result = await originalRequestGroupList(...args);
    const after = [this.groups, this.myGroups, this.joinedGroups, this.adminGroups]
      .map(v => Array.isArray(v) ? v.length : 0);
    const hadVisibleGroups = before.groups.length || before.myGroups.length || before.joinedGroups.length || before.adminGroups.length;
    const becameEmpty = after.every(n => n === 0);
    if (hadVisibleGroups && becameEmpty && result?.success !== true) {
      this.groups = before.groups;
      this.myGroups = before.myGroups;
      this.joinedGroups = before.joinedGroups;
      this.adminGroups = before.adminGroups;
      try {
        this.emit('groups:list-updated', {
          groups: this.groups,
          myGroups: this.myGroups,
          joinedGroups: this.joinedGroups,
          adminGroups: this.adminGroups,
          fromCache: true,
          preservedAfterTransientEmptySync: true
        });
      } catch (_) {}
      return { success: true, fromCache: true, preserved: true, data: this.getGroupsData?.() };
    }
    return result;
  };
}
