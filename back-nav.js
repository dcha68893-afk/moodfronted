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

    // Device hardware back / browser back button
    window.addEventListener('popstate', function(e) {
        e.preventDefault();
        goBack();
    });

    // Push a dummy state so popstate fires on back
    try {
        history.pushState({ page: 'app' }, '', window.location.href);
    } catch(_) {}

    // Expose globally
    window.kynGoBack = goBack;
    window.kynPushPage = pushPage;

    console.log('[BackNav] ✅ Universal back navigation installed');
})();
