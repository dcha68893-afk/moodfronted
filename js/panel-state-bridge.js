/**
 * panel-state-bridge.js — Standardized parent/child panel-state contract.
 * (Spec item 6: "Parent Window Listening")
 *
 * WHY THIS FILE EXISTS
 * The app already has several working, independently-evolved ways a child
 * module tells the parent shell what it's doing: CHILD_CLOSING, GO_BACK_TO_LIST,
 * MODULE_FOCUSED/MODULE_BLURRED, CALL_SCREEN_ACTIVE, body classes like
 * .chat-panel-active, etc. Those are left exactly as-is (item 11: no
 * regressions) — this file does NOT replace them.
 *
 * What was missing was a single, consistently-named event contract any
 * module (or any panel WITHIN a module — a modal, an overlay, a sub-screen)
 * can emit so the parent shell always has one place to look, instead of
 * bolting on another one-off message type per feature. This file adds
 * exactly that, as a thin layer on top of the existing postMessage system:
 *
 *   PanelOpened  — a panel/modal/overlay/sub-screen became visible
 *   PanelClosed  — it was dismissed
 *   PanelFocused — this module/panel became the active one
 *   PanelHidden  — this module/panel is no longer visible (backgrounded,
 *                  not necessarily closed — e.g. switched away from)
 *
 * Loaded in every module iframe (same pages that already load back-nav.js)
 * AND in the parent shell (chat.html). Detects which context it's in by
 * checking window.parent !== window.
 */
(function () {
    'use strict';

    var MODULE_NAME = (document.body && document.body.dataset && document.body.dataset.module) ||
        (window.location.pathname.split('/').pop() || '').replace('.html', '') || 'unknown';

    // ------------------------------------------------------------------
    // CHILD SIDE — running inside an iframe
    // ------------------------------------------------------------------
    if (window.parent && window.parent !== window) {
        function send(type, panelId, extra) {
            try {
                window.parent.postMessage(Object.assign({
                    type: type,
                    module: MODULE_NAME,
                    panel: panelId || null,
                    timestamp: Date.now()
                }, extra || {}), '*');
            } catch (_) {}
        }

        window.KynPanel = {
            // Call when a modal/overlay/sub-screen becomes visible.
            opened: function (panelId) { send('PanelOpened', panelId); },
            // Call when that panel/modal/overlay is dismissed.
            closed: function (panelId) { send('PanelClosed', panelId); },
            // Call when this module becomes the active/foreground one.
            focused: function () { send('PanelFocused', null); },
            // Call when this module is backgrounded (not necessarily closed).
            hidden: function () { send('PanelHidden', null); }
        };

        // Best-effort auto-detection for the common case: any element with
        // [data-panel] that toggles a visible/active/open class. Modules
        // that already call window.KynPanel directly don't need this —
        // it only helps ones that haven't been retrofitted yet, via a
        // lightweight MutationObserver (no polling).
        try {
            var observedRoot = document.body;
            if (observedRoot && 'MutationObserver' in window) {
                var mo = new MutationObserver(function (mutations) {
                    mutations.forEach(function (m) {
                        if (m.type !== 'attributes') return;
                        var el = m.target;
                        if (!el.hasAttribute || !el.hasAttribute('data-panel')) return;
                        var isVisible = el.classList.contains('active') ||
                            el.classList.contains('open') ||
                            (el.style && (el.style.display === 'flex' || el.style.display === 'block'));
                        var panelId = el.getAttribute('data-panel');
                        if (isVisible && el.dataset.__kynPanelState !== 'open') {
                            el.dataset.__kynPanelState = 'open';
                            send('PanelOpened', panelId);
                        } else if (!isVisible && el.dataset.__kynPanelState === 'open') {
                            el.dataset.__kynPanelState = 'closed';
                            send('PanelClosed', panelId);
                        }
                    });
                });
                mo.observe(observedRoot, {
                    attributes: true, subtree: true,
                    attributeFilter: ['class', 'style']
                });
            }
        } catch (_) {}

        document.addEventListener('visibilitychange', function () {
            send(document.hidden ? 'PanelHidden' : 'PanelFocused', null);
        });
    }

    // ------------------------------------------------------------------
    // PARENT SIDE — the top-level shell (chat.html)
    // ------------------------------------------------------------------
    if (window.parent === window) {
        // Tracks which panel (if any) is currently open per module, so the
        // parent is always the single source of truth for child panel
        // state (item 6), without needing every existing feature rewired.
        window.__kynPanelState = window.__kynPanelState || {};

        window.addEventListener('message', function (event) {
            var data = event.data;
            if (!data || typeof data !== 'object') return;
            var type = data.type;
            if (type !== 'PanelOpened' && type !== 'PanelClosed' &&
                type !== 'PanelFocused' && type !== 'PanelHidden') return;

            var mod = data.module || 'unknown';
            window.__kynPanelState[mod] = window.__kynPanelState[mod] || {};

            if (type === 'PanelOpened') {
                window.__kynPanelState[mod].panel = data.panel || true;
            } else if (type === 'PanelClosed') {
                window.__kynPanelState[mod].panel = null;
            } else if (type === 'PanelFocused') {
                window.__kynPanelState[mod].focused = true;
            } else if (type === 'PanelHidden') {
                window.__kynPanelState[mod].focused = false;
            }

            // Single place other parent-shell code (header/sidebar/overlay/
            // bottom-nav icon logic) can react to, without each of those
            // needing its own postMessage listener for every module.
            try {
                document.dispatchEvent(new CustomEvent('kyn:panelstate', {
                    detail: { module: mod, type: type, panel: data.panel, state: window.__kynPanelState[mod] }
                }));
            } catch (_) {}
        });
    }
})();
