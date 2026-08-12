/*
 * Cross-module stability guard.
 * Keeps existing feature engines authoritative; this file only adds missing
 * initialization/cleanup hooks and safe DOM rendering guards.
 */
(function () {
  'use strict';
  if (window.__NEXOPA_STABILITY_HOTFIX__) return;
  window.__NEXOPA_STABILITY_HOTFIX__ = true;

  function initMessages() {
    try {
      if (window.MessageLifecycleClient && !window.__msgLifecycleAutoInit) {
        var uid = window.__PARENT_SESSION__?.userId || window.__PARENT_SESSION__?.id || window.currentUser?.id;
        if (uid) {
          window.__msgLifecycleAutoInit = true;
          window.MessageLifecycleClient.init({ currentUserId: uid });
        }
      }
    } catch (_) {}
  }

  function resetCallArtifacts() {
    try {
      if (!window.__CallsCoreShared) return;
      var s = window.__CallsCoreShared.callsState;
      if (!s) return;
      if (s.callState === 'idle' || s.activeCallId == null) {
        s.activeCallId = null;
        s.localCallId = null;
        s.serverCallId = null;
        s._callIdAliases = new Map();
        s.callActive = false;
        s.callState = 'idle';
      }
    } catch (_) {}
  }

  function bindCallEndCleanup() {
    if (window.__callCleanupBound) return;
    window.__callCleanupBound = true;
    window.addEventListener('message', function (e) {
      var d = e && e.data;
      if (!d) return;
      if (['CALL_ENDED','CALL_REJECTED','CALL_CANCELLED','call:ended','call:rejected','call:cancelled'].indexOf(d.type) < 0) return;
      setTimeout(resetCallArtifacts, 0);
      setTimeout(resetCallArtifacts, 250);
      setTimeout(resetCallArtifacts, 1000);
    });
  }

  function bindGlobalSocketMessageRecovery() {
    try {
      var sock = window.KynectaRealtime && window.KynectaRealtime._socket;
      if (!sock || sock.__stabilityRecoveryBound) return;
      sock.__stabilityRecoveryBound = true;
      sock.on('connect', initMessages);
    } catch (_) {}
  }

  function boot() {
    initMessages();
    bindCallEndCleanup();
    bindGlobalSocketMessageRecovery();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 2000);
})();