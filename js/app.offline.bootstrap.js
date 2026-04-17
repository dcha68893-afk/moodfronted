/**
 * app.offline.bootstrap.js
 * Deterministic offline-first boot controller.
 *
 * Required order:
 * 1) Load local session + caches
 * 2) Render UI shell immediately
 * 3) Restore last UI state
 * 4) Initialize event-driven modules
 * 5) Check network (non-blocking)
 * 6) Start background sync if online
 */
(function () {
  "use strict";

  if (window.KynectaOfflineBoot) return;

  const state = {
    bootstrapped: false,
    steps: [],
    startedAt: null
  };

  function markStep(step, detail) {
    const payload = { step, detail: detail || null, at: Date.now() };
    state.steps.push(payload);
    try {
      window.dispatchEvent(new CustomEvent("KYNECTA_BOOT_STEP", { detail: payload }));
    } catch (_error) {}
  }

  function emitEvent(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_error) {}

    if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === "function") {
      window.KynectaEventBus.emit(name, detail || {});
    }
  }

  function getFastSessionSnapshot() {
    const fromCache = window.KynectaCache && typeof window.KynectaCache.getSession === "function"
      ? window.KynectaCache.getSession()
      : null;

    if (fromCache && fromCache.token) return fromCache;

    try {
      const token =
        localStorage.getItem("authToken") ||
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        localStorage.getItem("moodchat_token");
      const user = JSON.parse(localStorage.getItem("currentUser") || localStorage.getItem("user") || "null");
      if (!token) return null;
      return { token, user, authenticated: true };
    } catch (_error) {
      return null;
    }
  }

  async function hydrateLocalCaches() {
    if (window.KynectaCache && typeof window.KynectaCache.hydrateStoreFromCache === "function") {
      await Promise.race([
        window.KynectaCache.hydrateStoreFromCache(),
        new Promise((resolve) => setTimeout(resolve, 180))
      ]);
    }
  }

  function hydrateWhenStoreBecomesAvailable() {
    if (!window.KynectaCache || typeof window.KynectaCache.hydrateStoreFromCache !== "function") return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.KynectaStore) {
        clearInterval(timer);
        window.KynectaCache.hydrateStoreFromCache().catch(() => {});
        return;
      }
      if (attempts >= 25) {
        clearInterval(timer);
      }
    }, 120);
  }

  function renderShellImmediately() {
    document.documentElement.classList.add("kynecta-booted");
    document.body.classList.add("kynecta-shell-ready");

    if (typeof window.dismissLoadingScreen === "function") {
      try {
        window.dismissLoadingScreen(0);
      } catch (_error) {}
    }

    const overlays = [
      document.getElementById("loadingScreen"),
      document.getElementById("appLoadingOverlay"),
      document.querySelector(".loading-screen"),
      document.querySelector(".offline-overlay")
    ].filter(Boolean);

    overlays.forEach((node) => {
      node.style.display = "none";
      node.setAttribute("aria-hidden", "true");
    });

    emitEvent("KYNECTA_UI_RENDERED", { instant: true, at: Date.now() });
  }

  function restoreUiState() {
    try {
      const raw = localStorage.getItem("kynecta_last_ui_state");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      if (window.KynectaStore && parsed.currentPage) {
        window.KynectaStore.set("ui.currentPage", parsed.currentPage, { silent: true, persist: false });
      }

      emitEvent("UI_STATE_RESTORED", parsed);
    } catch (_error) {}
  }

  function initEventDrivenModules() {
    emitEvent("KYNECTA_MODULE_INIT", { mode: "offline-first" });
    emitEvent("KYNECTA_BOOTSTRAP_READY", { at: Date.now() });
  }

  function backgroundNetworkPhase(session) {
    setTimeout(() => {
      markStep("network-check");

      const online = navigator.onLine;
      if (window.KynectaStore) {
        window.KynectaStore.set("network.online", online, { silent: false, persist: false });
      }

      if (!online) {
        emitEvent("SYSTEM_NETWORK_OFFLINE", { online: false, at: Date.now() });
        return;
      }

      emitEvent("SYSTEM_NETWORK_ONLINE", { online: true, at: Date.now() });

      if (session && session.token) {
        if (window.KynectaRealtime && typeof window.KynectaRealtime.connect === "function") {
          window.KynectaRealtime.connect(session.token).catch(() => {});
        }

        if (window.KynectaSync && typeof window.KynectaSync.syncAll === "function") {
          window.KynectaSync.syncAll().catch(() => {});
        }

        if (window.AppRuntimeAuthority && typeof window.AppRuntimeAuthority.validateSessionInBackground === "function") {
          window.AppRuntimeAuthority.validateSessionInBackground(session).catch(() => {});
        }
      }

      emitEvent("KYNECTA_BOOT_SYNC_READY", { online: true, at: Date.now() });
    }, 0);
  }

  function persistUiStateOnChange() {
    window.addEventListener("beforeunload", () => {
      try {
        const currentPage = window.KynectaStore ? window.KynectaStore.get("ui.currentPage") : null;
        localStorage.setItem("kynecta_last_ui_state", JSON.stringify({ currentPage, at: Date.now() }));
      } catch (_error) {}
    });
  }

  async function bootstrap() {
    if (state.bootstrapped) return state;
    state.bootstrapped = true;
    state.startedAt = Date.now();

    markStep("cache-load-start");
    const session = getFastSessionSnapshot();
    await hydrateLocalCaches();
    markStep("cache-load-complete");
    hydrateWhenStoreBecomesAvailable();

    markStep("render-shell");
    renderShellImmediately();

    markStep("restore-ui-state");
    restoreUiState();

    markStep("init-event-modules");
    initEventDrivenModules();

    persistUiStateOnChange();
    backgroundNetworkPhase(session);

    emitEvent("KYNECTA_BOOT_COMPLETE", {
      startedAt: state.startedAt,
      completedAt: Date.now(),
      durationMs: Date.now() - state.startedAt
    });

    return state;
  }

  window.KynectaOfflineBoot = {
    bootstrap,
    getState: () => ({ ...state, steps: state.steps.slice() })
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
