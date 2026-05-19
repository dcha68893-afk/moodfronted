/**
 * group-os-integration.js
 * Wires GroupOS into the existing group.html panel.
 * Injects the Smart Group OS tab into the group header without breaking existing chat.
 * Lazy-mounts GroupOS only when the "Tools" tab is clicked.
 */
'use strict';

(function _GroupOSIntegration() {
    let _mounted = false;

    function _getGroupId() {
        // Try multiple sources
        try {
            const url = new URL(window.location.href);
            const gid = url.searchParams.get('groupId') || url.searchParams.get('gid');
            if (gid) return parseInt(gid);
        } catch(_) {}
        try { return parseInt(window.__activeGroupId || window.GroupCore?.getActiveGroupId?.()); } catch(_) {}
        return null;
    }

    function _getMyUserId() {
        try {
            const s = JSON.parse(localStorage.getItem('kyn_session') || localStorage.getItem('user_session') || '{}');
            return s.userId || s.id || s.user?.id;
        } catch(_) { return null; }
    }

    function _getMyRole(groupId) {
        try {
            const core = window.GroupCore;
            if (core && typeof core.getMembership === 'function') {
                const m = core.getMembership(groupId);
                return m?.role || 'member';
            }
        } catch(_) {}
        return 'member';
    }

    // ── Inject Smart Group OS tab into group header ────────────────────────
    function _injectTab() {
        // FIX Bug 6: Broadened selector — group.html uses .chat-header-actions for its
        // header buttons, not a dedicated tab-bar element.
        const tabBar = document.querySelector(
            '.group-tabs, .group-header-tabs, [data-group-tabs], #groupTabBar, .chat-header-actions'
        );
        if (!tabBar || tabBar.dataset.gosInjected) return;
        tabBar.dataset.gosInjected = 'true';

        // Prefer the existing #groupOSTabBtn wired in group.html if present
        if (document.getElementById('gosTabBtn') || document.getElementById('groupOSTabBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'gosTabBtn';
        btn.className = 'group-tab-btn';
        btn.setAttribute('data-tab', 'tools');
        btn.style.cssText = 'display:flex;align-items:center;gap:5px;padding:8px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;color:#6b7280;border-bottom:2px solid transparent;white-space:nowrap;flex-shrink:0;';
        btn.innerHTML = `<span style="font-size:16px">⚙</span> Tools`;
        btn.onclick = _openGroupOS;
        tabBar.appendChild(btn);
    }

    // FIX Bug 6: Retry injection every 500 ms until the tab bar appears in the DOM
    let _injectRetries = 0;
    const _injectInterval = setInterval(function() {
        _injectTab();
        _injectRetries++;
        const target = document.querySelector(
            '.group-tabs, .group-header-tabs, [data-group-tabs], #groupTabBar, .chat-header-actions'
        );
        if ((target && target.dataset.gosInjected) || _injectRetries >= 20) {
            clearInterval(_injectInterval);
        }
    }, 500);

    // ── Open / show the GroupOS panel ─────────────────────────────────────
    function _openGroupOS() {
        // Mark tab as active
        document.querySelectorAll('.group-tab-btn, [data-group-tab]').forEach(b => {
            b.style.color        = b.id === 'gosTabBtn' ? '#667eea' : '';
            b.style.borderBottom = b.id === 'gosTabBtn' ? '2px solid #667eea' : '';
        });

        // Create or show overlay container
        let overlay = document.getElementById('gosOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'gosOverlay';
            overlay.style.cssText = [
                'position:fixed','inset:0','z-index:9000',
                'background:#f8fafc','display:flex','flex-direction:column',
                'overflow:hidden',
            ].join(';');

            // Header with close button
            overlay.innerHTML = `
                <div style="display:flex;align-items:center;padding:12px 16px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);flex-shrink:0;">
                    <button onclick="document.getElementById('gosOverlay').style.display='none'" style="background:none;border:none;font-size:22px;cursor:pointer;color:#374151;padding:4px;margin-right:8px;">←</button>
                    <span style="font-weight:700;font-size:16px;color:#111827">Group Tools</span>
                    <div id="gosOfflineBadge" style="margin-left:auto;font-size:11px;color:#f59e0b;display:none;">● Offline</div>
                </div>
                <div id="gosMount" style="flex:1;overflow:hidden;"></div>`;
            document.body.appendChild(overlay);
        } else {
            overlay.style.display = 'flex';
        }

        // Mount GroupOS once
        if (!_mounted) {
            _mounted = true;
            const groupId = _getGroupId();
            const userId  = _getMyUserId();
            const role    = _getMyRole(groupId);

            if (!groupId) {
                document.getElementById('gosMount').innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af">Group not found</div>';
                return;
            }

            if (typeof window.GroupOS !== 'undefined') {
                window.GroupOS.mount('gosMount', groupId, userId, role);
            } else {
                // GroupOS script not loaded yet — load it dynamically
                const script = document.createElement('script');
                script.src = 'group-os/group-os.js';
                script.onload = () => window.GroupOS.mount('gosMount', groupId, userId, role);
                script.onerror = () => {
                    document.getElementById('gosMount').innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">Could not load Group OS. Check connection.</div>';
                };
                document.head.appendChild(script);
            }
        }

        // Offline badge
        function _refreshOfflineBadge() {
            const badge = document.getElementById('gosOfflineBadge');
            if (badge) badge.style.display = navigator.onLine ? 'none' : 'block';
        }
        _refreshOfflineBadge();
        window.addEventListener('online',  _refreshOfflineBadge);
        window.addEventListener('offline', _refreshOfflineBadge);
    }

    // ── Forward group socket events into overlay ──────────────────────────
    function _wireSocketRelay() {
        const GOS_EVENTS = [
            'group:task:created','group:task:updated','group:task:deleted',
            'group:poll:created','group:poll:voted','group:poll:closed',
            'group:note:created','group:note:updated','group:note:deleted',
            'group:file:uploaded','group:file:deleted',
            'group:event:created',
            'group:attendance:updated',
            'group:finance:created','group:finance:approved',
            'group:ai:summary_ready',
            'group:modules:updated',
        ];

        // Listen for postMessage relays from parent (chat.html) and re-dispatch
        window.addEventListener('message', evt => {
            if (!evt.data || typeof evt.data !== 'object') return;
            const type = evt.data.type || '';
            const canonical = type.replace('REALTIME_EVENT:', '');
            if (GOS_EVENTS.includes(canonical)) {
                // Re-dispatch as plain message for GroupOS listeners
                const overlay = document.getElementById('gosOverlay');
                if (overlay && overlay.style.display !== 'none') {
                    // GroupOS already listens to window message events — no extra dispatch needed
                }
            }
        });
    }

    // ── Auto-inject on DOM ready ──────────────────────────────────────────
    function _tryInject() {
        // _injectTab is handled by the retry interval above; just wire the socket relay
        _wireSocketRelay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _tryInject);
    } else {
        _tryInject();
    }

    // Re-inject if group changes (SPA navigation)
    let _lastGroupId = null;
    setInterval(() => {
        const gid = _getGroupId();
        if (gid && gid !== _lastGroupId) {
            _lastGroupId = gid;
            _mounted = false; // force re-mount for new group
            const overlay = document.getElementById('gosOverlay');
            if (overlay) overlay.remove();
            _injectTab();
        }
    }, 2000);

    // Expose for external use
    window.GroupOSIntegration = { open: _openGroupOS };
    console.log('[GroupOSIntegration] ✅ Loaded');
})();