/**
 * Shared E2E bootstrap for every window/iframe that loads js/e2e-encryption.js.
 */
(function () {
  'use strict';
  function tryInitE2E() {
    if (!window.KynectaE2E) return setTimeout(tryInitE2E, 150);
    if (window.KynectaE2E.enabled) return;
    var pw = null, legacyPw = null;
    try {
      pw = sessionStorage.getItem('kyn_e2e_pw_session');
      legacyPw = sessionStorage.getItem('kyn_e2e_pw_legacy_session');
    } catch (_) {}
    if (!pw) return setTimeout(tryInitE2E, 500);
    window.KynectaE2E.init(pw, legacyPw).then(function (ok) {
      if (!ok) setTimeout(tryInitE2E, 2000);
    }).catch(function () { setTimeout(tryInitE2E, 2000); });
  }
  tryInitE2E();
  document.addEventListener('kyn:e2eUnlockRetry', tryInitE2E);
})();