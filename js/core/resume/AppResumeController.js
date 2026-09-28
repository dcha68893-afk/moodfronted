/**
 * AppResumeController.js
 * Single, central "the tab just came back" coordinator.
 *
 * PROBLEM THIS FIXES:
 * Before this file, ~19 separate modules (message-client.js,
 * ReconnectOrchestrator.js, BackgroundSyncService.js, ProfessionalStatus.js,
 * GroupOrchestrator.js, NetworkIntelligenceManager.js, etc.) each attached
 * their OWN `document.addEventListener('visibilitychange', ...)` handler.
 * When the user came back to the app after a few minutes away, all of them
 * fired in the same tick: auth check, settings sync, message resync,
 * realtime reconnect, presence refresh, etc. — all racing each other, all
 * hitting the same (possibly still-sleeping) Render backend at once. That
 * pile-up is a big part of why the app looked blank/stuck right after resume,
 * on top of the backend's own ~30s cold-start tax.
 *
 * WHAT THIS FILE DOES:
 * - Listens for visibility/resume exactly ONCE, centrally.
 * - Ignores brief alt-tab flicker (debounced) so a 1-second glance away
 *   doesn't re-trigger a full resync cascade.
 * - Fires ONE shared backend wake probe instead of N separate ones.
 * - Dispatches a small, ORDERED sequence of window CustomEvents, staggered
 *   a little so consumers don't all slam the network in the same tick:
 *     app:resume:auth       (refresh/validate token)
 *     app:resume:backend    (backend wake probe kicked off — shared)
 *     app:resume:settings   (settings sync)
 *     app:resume:messages   (message/conversation resync)
 *     app:resume:realtime   (socket/presence reconnect)
 *     app:resume:complete
 *
 * THIS FILE DOES NOT REMOVE ANY EXISTING BEHAVIOR ON ITS OWN. It is purely
 * additive: modules keep working exactly as before unless they're updated to
 * also listen for these events (see the accompanying patches to
 * message-client.js, ReconnectOrchestrator.js — those add event listeners
 * for the staggered signal with a safe fallback to their original behavior
 * if this controller isn't present on a given page).
 *
 * Safe to load on every page. No-ops if already loaded.
 */
(function () {
  'use strict';

  if (window.__AppResumeController) return;

  // Ignore visibility flips shorter than this — just tab-switch flicker,
  // nothing meaningful could have gone stale in under 1.5s away.
  const MIN_AWAY_MS = 1500;

  // Stagger between each stage of the resume sequence so consumers don't
  // all fire their resync fetches on the exact same tick.
  const STAGE_GAP_MS = 150;

  // How long we consider a resume "long enough" to be worth a fresh
  // backend-wake probe vs. just trusting the connection is still warm.
  const WAKE_PROBE_THRESHOLD_MS = 20000; // 20s

  let hiddenAt = null;
  let resumeInFlight = false;
  let wakeProbePromise = null;

  function backendBase() {
    try {
      if (typeof window.__getApiOrigin === 'function') {
        const origin = window.__getApiOrigin();
        if (origin) return String(origin).replace(/\/+$/, '');
      }
    } catch (_) {}
    if (window.BACKEND_URL) return String(window.BACKEND_URL).replace(/\/+$/, '');
    if (window.__kynAPI && window.__kynAPI.baseUrl) {
      return window.__kynAPI.baseUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');
    }
    return 'https://noxopa.onrender.com';
  }

  // One shared wake probe: if five modules all ask "is the backend awake?"
  // within the same resume cycle, they get the SAME in-flight promise
  // instead of five separate requests hitting a dyno that's still booting.
  function ensureBackendAwake(timeoutMs) {
    if (wakeProbePromise) return wakeProbePromise;

    wakeProbePromise = new Promise((resolve) => {
      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = setTimeout(() => {
        try { controller && controller.abort(); } catch (_) {}
        resolve({ awake: false, timedOut: true });
      }, timeoutMs || 12000);

      fetch(backendBase() + '/health', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
      }).then((res) => {
        clearTimeout(timer);
        resolve({ awake: !!(res && res.ok), status: res && res.status });
      }).catch(() => {
        clearTimeout(timer);
        resolve({ awake: false, timedOut: false });
      });
    }).finally(() => {
      // Let a future resume cycle probe again; don't cache forever.
      setTimeout(() => { wakeProbePromise = null; }, 5000);
    });

    return wakeProbePromise;
  }

  function fire(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function runResumeSequence(awayMs) {
    if (resumeInFlight) return;
    resumeInFlight = true;

    const detail = { awayMs: awayMs };
    let step = 0;
    const stages = ['app:resume:auth', 'app:resume:backend', 'app:resume:settings', 'app:resume:messages', 'app:resume:realtime'];

    // Kick off the shared backend probe immediately (in parallel with the
    // staggered events below) whenever the away period was long enough that
    // the connection or the backend itself might have gone cold/asleep.
    if (awayMs >= WAKE_PROBE_THRESHOLD_MS) {
      ensureBackendAwake().then((result) => {
        fire('app:resume:backend:result', Object.assign({}, detail, result));
      });
    }

    function next() {
      if (step >= stages.length) {
        fire('app:resume:complete', detail);
        resumeInFlight = false;
        return;
      }
      fire(stages[step], detail);
      step++;
      setTimeout(next, STAGE_GAP_MS);
    }
    next();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    // Became visible.
    if (hiddenAt == null) {
      // First-ever visible event (initial load) — nothing to resume.
      return;
    }
    const awayMs = Date.now() - hiddenAt;
    hiddenAt = null;
    if (awayMs < MIN_AWAY_MS) return; // flicker, ignore
    runResumeSequence(awayMs);
  });

  window.__AppResumeController = {
    // Modules can call this instead of firing their own health check.
    ensureBackendAwake: ensureBackendAwake,
    // Mostly for debugging/tests.
    _isResuming: function () { return resumeInFlight; },
  };

  console.log('[AppResumeController] ✅ Ready — coordinating tab-resume sync');
})();
