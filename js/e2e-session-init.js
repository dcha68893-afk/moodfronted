/**
 * Shared E2E bootstrap. Also loads the cross-module lifecycle stability guard
 * once per window/iframe without creating a second feature engine.
 */
(function () {
  'use strict';
  function loadStability() {
    if (window.__NEXOPA_STABILITY_LAYER_LOADED) return;
    window.__NEXOPA_STABILITY_LAYER_LOADED = true;
    var s = document.createElement('script');
    s.src = '/js/module-stability-hotfix.js?v=20260812';
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  }
  function tryInitE2E() {
    loadStability();
    if (!window.KynectaE2E) return setTimeout(tryInitE2E, 150);
    if (window.KynectaE2E.enabled) return;
    var pw = null, legacyPw = null;
    try { pw = sessionStorage.getItem('kyn_e2e_pw_session'); legacyPw = sessionStorage.getItem('kyn_e2e_pw_legacy_session'); } catch (_) {}
    if (!pw) return setTimeout(tryInitE2E, 500);
    window.KynectaE2E.init(pw, legacyPw).then(function (ok) {
      if (!ok) setTimeout(tryInitE2E, 2000);
    }).catch(function () { setTimeout(tryInitE2E, 2000); });
  }
  tryInitE2E();
  document.addEventListener('kyn:e2eUnlockRetry', tryInitE2E);
})();