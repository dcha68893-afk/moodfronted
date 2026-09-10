// group-core-bootstrap.js — lifecycle stability wrapper
// The full implementation is retained as group-core-bootstrap.legacy.js.
// This wrapper re-exports the legacy module unchanged, then removes the one
// transition that was causing an already-active group iframe to bounce back to
// WAIT_PARENT on routine account/session handshakes. Real account changes are
// handled by the normal session/account-switch pipeline instead of a retry loop.

import * as Legacy from './group-core-bootstrap.legacy.js';

export const DEBUG = Legacy.DEBUG;
export const GroupCore = Legacy.GroupCore;
export const LifecycleState = Legacy.LifecycleState;
export const MODULE_NAME = Legacy.MODULE_NAME;
export const MODULE_VERSION = Legacy.MODULE_VERSION;
export const MessageRouter = Legacy.MessageRouter;
export const ParentMessaging = Legacy.ParentMessaging;
export const SafeStorage = Legacy.SafeStorage;
export const adminGroups = Legacy.adminGroups;
export const apiRequest = Legacy.apiRequest;
export const authCheckComplete = Legacy.authCheckComplete;
export const authReady = Legacy.authReady;
export const backgroundSyncRunning = Legacy.backgroundSyncRunning;
export const currentChatGroup = Legacy.currentChatGroup;
export const currentUser = Legacy.currentUser;
export const debugLog = Legacy.debugLog;
export const groupInvites = Legacy.groupInvites;
export const groups = Legacy.groups;
export const isMobile = Legacy.isMobile;
export const joinedGroups = Legacy.joinedGroups;
export const moduleInitialized = Legacy.moduleInitialized;
export const myGroups = Legacy.myGroups;
export const parentReady = Legacy.parentReady;
export const requestSession = Legacy.requestSession;
export const safeSend = Legacy.safeSend;
export const selectedGroup = Legacy.selectedGroup;
export const sendChildReady = Legacy.sendChildReady;
export const session = Legacy.session;
export const sessionReady = Legacy.sessionReady;
export const sessionReceived = Legacy.sessionReceived;
export const setAdminGroups = Legacy.setAdminGroups;
export const setAuthCheckComplete = Legacy.setAuthCheckComplete;
export const setAuthReady = Legacy.setAuthReady;
export const setBackgroundSyncRunning = Legacy.setBackgroundSyncRunning;
export const setCurrentChatGroup = Legacy.setCurrentChatGroup;
export const setGroupInvites = Legacy.setGroupInvites;
export const setGroups = Legacy.setGroups;
export const setIsMobile = Legacy.setIsMobile;
export const setJoinedGroups = Legacy.setJoinedGroups;
export const setModuleInitialized = Legacy.setModuleInitialized;
export const setMyGroups = Legacy.setMyGroups;
export const setSelectedGroup = Legacy.setSelectedGroup;
export const setSessionReadyFlag = Legacy.setSessionReadyFlag;
export const setSyncIntervalId = Legacy.setSyncIntervalId;
export const syncIntervalId = Legacy.syncIntervalId;
export const userData = Legacy.userData;

// IMPORTANT: do not let a routine PARENT_READY/session refresh make an ACTIVE
// iframe re-enter WAIT_PARENT. The legacy handler already verifies a genuine
// session before the initial ACTIVE transition; once ACTIVE, this recovery
// hook is only used for the bounce behavior that was causing parent retries.
if (Legacy.LifecycleState && typeof Legacy.LifecycleState.reenterWaitParent === 'function') {
  Legacy.LifecycleState.reenterWaitParent = function stableActiveState() {
    return false;
  };
}
