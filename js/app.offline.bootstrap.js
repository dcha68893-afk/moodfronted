/**
 * app.offline.bootstrap.js  (Offline-First Edition v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic offline-first boot controller.
 *
 * Boot order (STRICTLY enforced — no API calls during any step):
 *   1) Read session from localStorage (synchronous — zero latency)
 *   2) Load cached data from IndexedDB via AppCache (async, race-guarded)
 *   3) Hydrate KynectaStore from cache (non-blocking)
 *   4) Render UI shell immediately
 *   5) Restore last UI page state
 *   6) Fire event-driven module init
 *   7) Schedule background network phase (deferred, non-blocking)
 *
 * ❌ NO fetch() or API calls during steps 1-6
 * ❌ NO navigator.onLine blocking logic
 * ✅ UI renders even if device is fully offline
 */
(function () {
  'use strict';

  if (window.KynectaOfflineBoot) return;

  /* ── Internal state ───────────────────────────────────────────────────────── */
  const state = {
    bootstrapped: false,
    steps: [],
    startedAt: null
  };

  /* ── Utilities ───────────────────────────────────────────────────────────── */
  function markStep(step, detail) {
    const payload = { step, detail: detail || null, at: Date.now() };
    state.steps.push(payload);
    try { window.dispatchEvent(new CustomEvent('KYNECTA_BOOT_STEP', { detail: payload })); } catch (_) {}
  }

  function emitEvent(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {}
    if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === 'function') {
      window.KynectaEventBus.emit(name, detail || {});
    }
  }

  /* ── Step 1: Read session snapshot synchronously ─────────────────────────── */
  function getFastSessionSnapshot() {
    // Primary: canonical kynecta_auth key (set by authStorage.js on every login)
    try {
      const raw = localStorage.getItem('kynecta_auth');
      if (raw) {
        const auth = JSON.parse(raw);
        if (auth && auth.token) {
          return { token: auth.token, user: auth.user || null, authenticated: true, refreshToken: auth.refreshToken || null };
        }
      }
    } catch (_) {}

    // In-memory AppCache / KynectaCache session fallback
    const fromCache = window.AppCache && typeof window.AppCache.getSession === 'function'
      ? window.AppCache.getSession()
      : null;
    if (fromCache && fromCache.token) return fromCache;

    // Legacy key fallback (various key names used historically)
    try {
      const token =
        localStorage.getItem('authToken')      ||
        localStorage.getItem('token')          ||
        localStorage.getItem('accessToken')    ||
        localStorage.getItem('nexopa_token') ||
        localStorage.getItem('kynecta_token');
      const user = JSON.parse(
        localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null'
      );
      if (!token) return null;
      return { token, user, authenticated: true };
    } catch (_) { return null; }
  }

  /* ── Step 2: Hydrate cache from IndexedDB ───────────────────────────────── */
  async function hydrateLocalCaches() {
    const cache = window.AppCache || window.KynectaCache;
    if (!cache) return;
    if (typeof cache.hydrateStoreFromCache === 'function') {
      // Race with a 180 ms timeout — UI must not wait for slow IDB reads
      await Promise.race([
        cache.hydrateStoreFromCache(),
        new Promise(resolve => setTimeout(resolve, 180))
      ]);
    }
  }

  /* ── Step 3: Hydrate KynectaStore once it becomes available ──────────────── */
  function hydrateWhenStoreBecomesAvailable() {
    const cache = window.AppCache || window.KynectaCache;
    if (!cache || typeof cache.hydrateStoreFromCache !== 'function') return;
    if (window.KynectaStore) {
      cache.hydrateStoreFromCache().catch(() => {});
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (window.KynectaStore) {
        clearInterval(timer);
        cache.hydrateStoreFromCache().catch(() => {});
        return;
      }
      if (attempts >= 25) clearInterval(timer);
    }, 120);
  }

  /* ── Step 4: Render UI shell (always — no network dependency) ────────────── */
  function renderShellImmediately() {
    document.documentElement.classList.add('kynecta-booted');
    document.body.classList.add('kynecta-shell-ready');

    if (typeof window.dismissLoadingScreen === 'function') {
      try { window.dismissLoadingScreen(0); } catch (_) {}
    }

    [
      document.getElementById('loadingScreen'),
      document.getElementById('appLoadingOverlay'),
      document.querySelector('.loading-screen'),
      document.querySelector('.offline-overlay')
    ].filter(Boolean).forEach(node => {
      node.style.display = 'none';
      node.setAttribute('aria-hidden', 'true');
    });

    emitEvent('KYNECTA_UI_RENDERED', { instant: true, at: Date.now() });
  }

  /* ── Step 5: Restore last UI page state ─────────────────────────────────── */
  function restoreUiState() {
    try {
      const raw = localStorage.getItem('kynecta_last_ui_state');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (window.KynectaStore && parsed.currentPage) {
        window.KynectaStore.set('ui.currentPage', parsed.currentPage, { silent: true, persist: false });
      }
      emitEvent('UI_STATE_RESTORED', parsed);
    } catch (_) {}
  }

  /* ── Step 6: Fire event-driven module init ───────────────────────────────── */
  function initEventDrivenModules() {
    emitEvent('KYNECTA_MODULE_INIT',     { mode: 'offline-first' });
    emitEvent('KYNECTA_BOOTSTRAP_READY', { at: Date.now() });
  }

  /* ── Step 7: Background network phase (DEFERRED — never blocks UI) ────────── */
  function backgroundNetworkPhase(session) {
    // Use setTimeout(fn, 0) to push entirely after the current call stack
    // so the UI has already rendered before any network activity begins.
    setTimeout(() => {
      markStep('network-check');

      const online = navigator.onLine;

      if (window.KynectaStore) {
        window.KynectaStore.set('network.online', online, { silent: false, persist: false });
      }

      if (!online) {
        emitEvent('SYSTEM_NETWORK_OFFLINE', { online: false, at: Date.now() });
        // App is fully usable offline — no error, no block
        return;
      }

      emitEvent('SYSTEM_NETWORK_ONLINE', { online: true, at: Date.now() });

      if (session && session.token) {
        // Realtime connection (websocket — non-blocking)
        if (window.KynectaRealtime && typeof window.KynectaRealtime.connect === 'function') {
          window.KynectaRealtime.connect(session.token).catch(() => {});
        }

        // Background data sync — ONLY after UI is rendered
        if (window.KynectaSync && typeof window.KynectaSync.syncAll === 'function') {
          window.KynectaSync.syncAll().catch(() => {});
        }

        // Session validation — background only, never blocks boot
        if (window.AppRuntimeAuthority && typeof window.AppRuntimeAuthority.validateSessionInBackground === 'function') {
          window.AppRuntimeAuthority.validateSessionInBackground(session).catch(() => {});
        }
      }

      emitEvent('KYNECTA_BOOT_SYNC_READY', { online: true, at: Date.now() });
    }, 0);
  }

  /* ── Persist UI state on page unload ────────────────────────────────────── */
  function persistUiStateOnChange() {
    window.addEventListener('beforeunload', () => {
      try {
        const currentPage = window.KynectaStore ? window.KynectaStore.get('ui.currentPage') : null;
        localStorage.setItem('kynecta_last_ui_state', JSON.stringify({ currentPage, at: Date.now() }));
      } catch (_) {}
    });
  }

  /* ── Main bootstrap sequence ─────────────────────────────────────────────── */
  async function bootstrap() {
    if (state.bootstrapped) return state;
    state.bootstrapped = true;
    state.startedAt    = Date.now();

    // Step 1 & 2: session + cache (async, race-guarded)
    markStep('cache-load-start');
    const session = getFastSessionSnapshot();
    await hydrateLocalCaches();
    markStep('cache-load-complete');

    // Step 3: hydrate KynectaStore once it appears
    hydrateWhenStoreBecomesAvailable();

    // Step 4: render UI shell — always, regardless of network
    markStep('render-shell');
    renderShellImmediately();

    // Step 5: restore last page
    markStep('restore-ui-state');
    restoreUiState();

    // Step 6: module init events
    markStep('init-event-modules');
    initEventDrivenModules();

    // Persist UI state on close
    persistUiStateOnChange();

    // Step 7: network (background, deferred)
    backgroundNetworkPhase(session);

    emitEvent('KYNECTA_BOOT_COMPLETE', {
      startedAt:   state.startedAt,
      completedAt: Date.now(),
      durationMs:  Date.now() - state.startedAt
    });

    return state;
  }

  /* ── Public API ──────────────────────────────────────────────────────────── */
  window.KynectaOfflineBoot = {
    bootstrap,
    getState: () => ({ ...state, steps: state.steps.slice() })
  };

  /* ── Auto-start ──────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }

})();