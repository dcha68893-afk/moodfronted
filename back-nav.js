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

        var panels = [
            'discoverPanel', 'eventsPanel', 'invitePanel',
            'marketplaceDetailPanel', 'createListingModal', 'analyticsModal',
            'adminManagementModal', 'friendSelectionModal', 'groupInviteModal',
            'addFriendModal', 'startChatModal', 'createGroupModal',
            // FIX: status.html's story viewer (toggled via .active, same
            // mechanism as the others here) wasn't in this list, so tapping
            // its own back arrow fell through to postMessage NAVIGATE_BACK —
            // which the parent handles by sending GO_BACK_TO_LIST to this
            // iframe, but nothing in status.html ever listens for that
            // message, so the viewer never actually closed. Closing it
            // locally here doesn't depend on that missing listener.
            'statusViewerPanel'
        ];
        for (var i = 0; i < panels.length; i++) {
            var el = document.getElementById(panels[i]);
            if (el && (el.style.display === 'flex' || el.style.display === 'block' || el.classList.contains('active'))) {
                el.style.display = 'none';
                el.classList.remove('active');
                return;
            }
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
