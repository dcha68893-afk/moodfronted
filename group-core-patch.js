// group-core-patch.js — lifecycle guard wrapper
// The existing patch implementation is retained verbatim as
// group-core-patch.legacy.js. This wrapper is intentionally tiny so the
// production patch logic stays untouched while we harden the lifecycle hook.

import { LifecycleState } from './group-core-bootstrap.js';
import './group-core-patch.legacy.js';

// The legacy patch can call LifecycleState.reenterWaitParent when it detects
// a different user id in a fresh PARENT_READY. Once the iframe is ACTIVE,
// routine parent/session handshakes must not bounce it back into WAIT_PARENT;
// the normal auth/account-switch pipeline owns session changes. Keep the
// lifecycle monotonic here so parent retry timers cannot undo ACTIVE state.
if (LifecycleState && typeof LifecycleState.reenterWaitParent === 'function') {
  LifecycleState.reenterWaitParent = function preventActiveBounce() {
    return false;
  };
}
