/**
 * back-nav.js — Universal Back Navigation Handler
 * Inject into every iframe page (message.html, group.html, calls.html, Tools.html, etc.)
 * Handles: back button clicks, device back button (popstate), history API
 */
(function _installBackNav() {
    'use strict';

    // Track navigation history per iframe
    var _history = [];
    var _currentPage = null;

    // FIX (companion to chat.html's handleAppBackNavigation() root-cause
    // fix): this list already existed inside goBack() below to close the
    // right panel on an in-app back-arrow tap, but the parent shell had no
    // way to know any of these panels was open in the first place, so the
    // device/hardware back button (which fires popstate on the parent, not
    // in here) skipped straight past whichever one of these was open and
    // closed the whole module instead. Hoisted to module scope so both
    // goBack() and the new visibility watcher below share one list.
    var TRACKED_PANELS = [
        'discoverPanel', 'eventsPanel', 'invitePanel',
        'marketplaceDetailPanel', 'createListingModal', 'analyticsModal',
        'adminManagementModal', 'friendSelectionModal', 'groupInviteModal',
        'addFriendModal', 'startChatModal', 'createGroupModal',
        'friendDetailsPanel', 'statusViewerPanel'
    ];
    function _panelIsVisible(el) {
        return !!el && (el.style.display === 'flex' || el.style.display === 'block' || el.classList.contains('active'));
    }
    // FIX: message.html and group.html each use their own shared modal
    // class (`.modal-overlay`/`.modal`, hidden via a `.hidden` class) for
    // things like "chat info", "new chat", "group members", "group
    // settings" — none of which match any of the specifically-named ids
    // above, and neither file even loads this script at all (see below).
    // Detecting the class pattern generically, instead of only the fixed
    // id list, means any current or future modal in those modules (or any
    // other module using the same convention) is covered without needing
    // another one-off id added here.
    function _visibleGenericModal() {
        var els = document.querySelectorAll('.modal:not(.hidden), .modal-overlay:not(.hidden)');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.style.display !== 'none') return el;
        }
        return null;
    }
    function _topmostVisiblePanelId() {
        for (var i = 0; i < TRACKED_PANELS.length; i++) {
            var el = document.getElementById(TRACKED_PANELS[i]);
            if (_panelIsVisible(el)) return TRACKED_PANELS[i];
        }
        var generic = _visibleGenericModal();
        if (generic) {
            if (!generic.id) generic.id = '_backnav_anon_' + Math.random().toString(36).slice(2, 8);
            return generic.id;
        }
        return null;
    }
    var _lastReportedPanel = null;
    function _reportPanelStateToParent() {
        var current = _topmostVisiblePanelId();
        if (current === _lastReportedPanel) return;
        _lastReportedPanel = current;
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'SCREEN_STATE_CHANGED', restore: current }, '*');
        }
    }
    // Any of these panels can be opened by code elsewhere in this module
    // (friend.html, status.html, group.html, Tools.html, etc. each have
    // their own click handlers/logic that toggles display/class on these
    // ids) — rather than needing to touch every one of those call sites,
    // watch the DOM itself: a MutationObserver on style/class changes
    // anywhere under <body> catches every panel open/close generically,
    // "from any source", exactly once each, and reports only on an actual
    // visibility change (not on every unrelated attribute mutation).
    function _installPanelWatcher() {
        if (!document.body) { document.addEventListener('DOMContentLoaded', _installPanelWatcher, { once: true }); return; }
        _reportPanelStateToParent();
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var t = mutations[i].target;
                if (!t || t.nodeType !== 1) continue;
                if ((t.id && TRACKED_PANELS.indexOf(t.id) !== -1) || t.classList.contains('modal') || t.classList.contains('modal-overlay')) {
                    _reportPanelStateToParent();
                    return;
                }
            }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], subtree: true });
    }
    _installPanelWatcher();

    // Companion to the watcher above: lets the parent's hardware-back
    // handler actually close the panel it was just told about, without
    // needing to know which local mechanism (style vs. class) this
    // particular panel uses — goBack() below already handles that.
    window.addEventListener('message', function (e) {
        var d = e && e.data;
        if (d && d.type === 'CLOSE_LOCAL_PANEL') goBack();
    });

    // Push a page onto the internal stack
    function pushPage(page) {
        if (page && page !== _currentPage) {
            if (_currentPage) _history.push(_currentPage);
            _currentPage = page;
        }
    }

    // Go back one step
    function goBack() {
        // 1. If there's an overlay/modal open, close it first
        var overlay = document.getElementById('groupOSOverlay');
        if (overlay && overlay.style.display !== 'none') { overlay.remove(); return; }

        var panels = TRACKED_PANELS;
        for (var i = 0; i < panels.length; i++) {
            var el = document.getElementById(panels[i]);
            if (el && (el.style.display === 'flex' || el.style.display === 'block' || el.classList.contains('active'))) {
                el.style.display = 'none';
                el.classList.remove('active');
                // NAV-STACK FIX: any panel closed through this generic path
                // means the user backed out to this module's base list, not
                // into another module. Clear the "current screen" the parent
                // shell is tracking (see SCREEN_STATE_CHANGED) so a chat/call
                // opened afterward from the bare list doesn't incorrectly try
                // to restore a panel the user already dismissed.
                // (_reportPanelStateToParent() below, driven by the
                // MutationObserver watching this same style/class change,
                // sends its own up-to-date SCREEN_STATE_CHANGED too — this
                // explicit one is kept so an *immediate* caller relying on
                // this side effect synchronously still gets it right away.)
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'SCREEN_STATE_CHANGED', restore: null, timestamp: Date.now() }, '*');
                }
                return;
            }
        }
        // 1b. Same idea for the shared .modal/.modal-overlay convention
        // (message.html, group.html) — see _visibleGenericModal() above.
        var genericModal = _visibleGenericModal();
        if (genericModal) {
            genericModal.classList.add('hidden');
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'SCREEN_STATE_CHANGED', restore: null, timestamp: Date.now() }, '*');
            }
            return;
        }

        // 2. If we have internal history, go to previous page
        if (_history.length > 0) {
            var prev = _history.pop();
            _currentPage = prev;
            if (typeof window._jmNav === 'function' && prev) { window._jmNav(prev); return; }
            return;
        }

        // 3. Signal parent to navigate back
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'NAVIGATE_BACK', source: window.location.pathname }, '*');
        }
    }

    // Wire all back buttons via event delegation
    //
    // FIX: this selector list was missing several real back buttons already
    // in use across modules — e.g. status.html's story-viewer back arrow
    // (`.viewer-back-btn` / `#viewerBackBtn`) matched none of the original
    // patterns, so tapping it did nothing. Broadened to a case-insensitive
    // "contains back" match on id/class as a catch-all, in addition to the
    // exact names already relied on elsewhere, so any current or future
    // back button works without needing another one-off addition here.
    document.addEventListener('click', function(e) {
        var btn = e.target.closest(
            '.back-btn, [data-action="back"], .jm-back-btn, #backBtn, #jmBackBtn, ' +
            '.back-button, [aria-label="back"], [aria-label="Back"], ' +
            '.viewer-back-btn, #viewerBackBtn, ' +
            '[id*="backbtn" i], [id*="back-btn" i], [class*="back-btn" i]'
        );
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        goBack();
    });

    // FIX-ROOT-CAUSE-BACK-NOT-RESTORING-EXACT-STATE: every one of the ~8
    // module pages this script is injected into (message/group/calls/Tools/
    // friend/settings/status/game.html) is loaded once as an always-present
    // hidden iframe inside chat.html and never navigated away from — so this
    // used to ALSO push its own dummy history entry and listen for the
    // device/hardware back button (popstate) independently, in every single
    // one of those iframes at once. chat.html (the parent) already has its
    // own single, authoritative popstate/backbutton handler with a real
    // navigation history stack (window.__navHistory) that knows exactly
    // which page/panel the user was on before the current one. With up to
    // 8 iframes each *also* reacting to the same device back press, a
    // single press could trigger this iframe's local goBack() (which falls
    // through to a generic NAVIGATE_BACK postMessage) in addition to — and
    // racing against — the parent's own handling of that same press,
    // effectively consuming it twice and landing the user somewhere other
    // than the one exact previous step back. The parent is the only one
    // that should decide what the device back button does; this file's
    // goBack() stays available for in-page back-button taps (closing a
    // modal/panel within a module), which is a separate, legitimate use.
    window.kynGoBack = goBack;
    window.kynPushPage = pushPage;

    console.log('[BackNav] ✅ Universal back navigation installed');
})();
