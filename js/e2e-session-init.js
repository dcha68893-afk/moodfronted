/**
 * js/e2e-session-init.js — single shared E2E bootstrap for every window/
 * iframe that loads js/e2e-encryption.js.
 *
 * FIX (DUPLICATE-E2E-INIT / item #1 + explicit cleanup request): this exact
 * ~50-line block used to be copy-pasted inline in BOTH message.html and
 * group.html (see their git history / the old inline <script> blocks this
 * file replaces) — same polling loop, same retry backoff, same console
 * labels swapped only for the page name. Two copies of hand-tuned retry/
 * backoff logic drift the moment only one of them gets fixed, which is
 * exactly what had started happening (message.html and group.html were
 * already one small comment out of sync with each other). There is now
 * exactly one implementation; every page that needs E2E ready just loads
 * this file after js/e2e-encryption.js.
 *
 * FIX (E2E-AT-LOGIN / item #1, "registration happens during login/session
 * initialization, not when the user presses Send"): this file is now also
 * loaded by chat.html — the shell the app lands on immediately after
 * login/redirect, BEFORE any specific chat or group is ever opened. Each
 * of chat.html / message.html / group.html is a genuinely separate
 * `window` (iframes don't share globals with their parent or siblings), so
 * KynectaE2E must still be independently init()'d in each one — but
 * because chat.html now does this immediately on load, the key pair is
 * generated and registered with the server during session start in the
 * common case, and message.html/group.html's own init() calls (when the
 * user actually opens a chat) almost always find `window.KynectaE2E.enabled
 * === true` already and return instantly instead of doing real work.
 *
 * Reads the same persistent (not single-use) session password index.html /
 * js/google-auth.js stash in sessionStorage under 'kyn_e2e_pw_session' —
 * see those files for where it's written, and js/api.auth.js's
 * _performLogout for where it's cleared on explicit logout.
 */
(function () {
  'use strict';

  var PAGE_LABEL = (function () {
    try {
      var path = (window.location && window.location.pathname) || '';
      var name = path.split('/').pop() || 'page';
      return name;
    } catch (_) { return 'page'; }
  })();

  function tryInitE2E() {
    if (!window.KynectaE2E) {
      return setTimeout(tryInitE2E, 150);
    }
    if (window.KynectaE2E.enabled) return; // already initialized this session/window

    var pw = null;
    try { pw = sessionStorage.getItem('kyn_e2e_pw_session'); } catch (_) {}
    if (!pw) {
      // FIX-NO-PERMANENT-GIVEUP: keep polling with backoff instead of
      // giving up forever — covers a plain load-order race against
      // index.html/chat.html's own write, or a persisted-session
      // auto-login with no password typed this tab at all (the unlock
      // prompt sets it later). The moment something sets the password,
      // this picks it up without needing a page reload.
      return setTimeout(tryInitE2E, 500);
    }

    // FIX (KEY-REGEN-REGRESSION migration support): pass the raw legacy
    // password too, if this session stashed one, so init() can recover and
    // migrate a pre-existing key instead of silently generating (and
    // publishing) a brand-new one for an account whose stored key was
    // wrapped with the OLD raw-password mechanism.
    var legacyPw = null;
    try { legacyPw = sessionStorage.getItem('kyn_e2e_pw_legacy_session'); } catch (_) {}

    window.KynectaE2E.init(pw, legacyPw).then(function (ok) {
      if (ok) {
        console.log('[' + PAGE_LABEL + '] ✅ E2E encryption initialized');
      } else {
        // init() returning false covers two real cases (see
        // js/e2e-encryption.js): a stored key that didn't decrypt with any
        // password available yet, OR — since the registration-confirmation
        // gate fix — a brand-new key pair that generated fine locally but
        // hasn't had its registration confirmed by the server yet (a
        // background retry loop is already running for that case inside
        // e2e-encryption.js). Either way, keep polling here too so this
        // page's own gate re-checks `enabled` once the background retry
        // (or a fresh password) resolves it.
        console.warn('[' + PAGE_LABEL + '] E2E init not ready yet — will retry');
        setTimeout(tryInitE2E, 2000);
      }
    }).catch(function (e) {
      console.warn('[' + PAGE_LABEL + '] E2E init failed, will retry:', e && e.message);
      setTimeout(tryInitE2E, 2000);
    });
  }

  tryInitE2E();
  // If index.html's unlock prompt (or any other frame) stores a working
  // password after this already gave up waiting on this exact poll cycle,
  // re-check immediately rather than waiting out the rest of the backoff.
  document.addEventListener('kyn:e2eUnlockRetry', tryInitE2E);
})();
