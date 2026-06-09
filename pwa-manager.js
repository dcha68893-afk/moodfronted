/**
 * pwa-manager.js — Shared PWA Install Banner + Instant Update Manager
 * ════════════════════════════════════════════════════════════════════
 * • Shows install-to-homescreen banner to non-installed browser users
 * • Forces instant SW activation via SKIP_WAITING (no 7-day wait)
 * • Shows update banner + one-tap refresh to already-installed PWA users
 * • Works in all pages: chat.html, Tools.html, group.html, etc.
 */
(function _pwaManager() {
    'use strict';

    // Don't double-init
    if (window.__pwaManagerLoaded) return;
    window.__pwaManagerLoaded = true;

    var isStandalone = function () {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true ||
            document.referrer.startsWith('android-app://');
    };

    function _inject(id, html) {
        if (document.getElementById(id)) return;
        var d = document.createElement('div');
        d.id = id;
        d.innerHTML = html;
        document.body.appendChild(d);
    }

    /* ── Install banner ─────────────────────────────────────────────────── */
    var _deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        _deferredPrompt = e;

        // Respect 3-day cooldown after dismiss
        var ts = parseInt(localStorage.getItem('pwa_dismissed_ts') || '0', 10);
        if (Date.now() - ts < 3 * 86400000) return;

        _inject('pwaInstallBanner',
            '<div id="pwaInstallInner" style="' +
            'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;' +
            'background:#fff;border-top:2px solid #667eea;' +
            'box-shadow:0 -4px 24px rgba(0,0,0,.16);' +
            'padding:14px 16px;display:flex;align-items:center;gap:12px;' +
            'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
            'animation:_pwaSlideUp .35s cubic-bezier(.4,0,.2,1)">' +
            '<style>@keyframes _pwaSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>' +
            '<img src="/moodchat-192.png" style="width:46px;height:46px;border-radius:12px;flex-shrink:0;object-fit:cover" onerror="this.style.display=\'none\'">' +
            '<div style="flex:1;min-width:0">' +
            '  <div style="font-weight:800;font-size:14px;color:#111;line-height:1.2">Install MoodChat</div>' +
            '  <div style="font-size:12px;color:#6b7280;margin-top:2px">Fast, offline-ready app experience</div>' +
            '</div>' +
            '<button onclick="window._pwaDoInstall()" style="background:#667eea;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;touch-action:manipulation">Install</button>' +
            '<button onclick="window._pwaDismissInstall()" style="background:none;border:none;color:#9ca3af;font-size:24px;line-height:1;cursor:pointer;padding:2px 6px;flex-shrink:0;touch-action:manipulation">&times;</button>' +
            '</div>'
        );
    });

    window._pwaDoInstall = async function () {
        if (!_deferredPrompt) return;
        try {
            _deferredPrompt.prompt();
            var result = await _deferredPrompt.userChoice;
            _deferredPrompt = null;
            if (result.outcome === 'accepted') {
                localStorage.removeItem('pwa_dismissed_ts');
            }
        } catch (err) {
            console.warn('[pwa-manager] install prompt error:', err);
        }
        var b = document.getElementById('pwaInstallBanner');
        if (b) b.remove();
    };

    window._pwaDismissInstall = function () {
        var b = document.getElementById('pwaInstallBanner');
        if (b) b.remove();
        localStorage.setItem('pwa_dismissed_ts', String(Date.now()));
    };

    window.addEventListener('appinstalled', function () {
        var b = document.getElementById('pwaInstallBanner');
        if (b) b.remove();
        localStorage.removeItem('pwa_dismissed_ts');
        console.log('[pwa-manager] App installed ✅');
    });

    /* ── SW update: force instant activation ────────────────────────────── */
    if (!('serviceWorker' in navigator)) return;

    // FIX: SW_UPDATED fires on every activate, including FIRST-TIME install.
    // Only show the update banner if there was already a controller before (i.e. this is a real update).
    // Track whether SW was already controlling before registration.
    var _hadControllerOnLoad = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'SW_UPDATED') {
            console.log('[pwa-manager] SW_UPDATED received — version:', event.data.version);
            // Only show banner if this is a real update (had a previous SW controlling)
            if (_hadControllerOnLoad) {
                _showUpdateBanner();
            } else {
                console.log('[pwa-manager] First install — suppressing update banner');
                _hadControllerOnLoad = true; // future SW_UPDATED messages are real updates
            }
        }
        if (event.data && event.data.type === 'CACHE_CLEARED') {
            console.log('[pwa-manager] Cache cleared by SW');
        }
    });

    navigator.serviceWorker.register('/service-worker.js').then(function (reg) {

        function _skipAndBanner(sw) {
            if (!sw) return;
            sw.postMessage({ type: 'SKIP_WAITING' });
            // Only show banner if there was already a controller (real update, not first install)
            if (_hadControllerOnLoad) {
                _showUpdateBanner();
            }
            _hadControllerOnLoad = true;
        }

        // Already waiting on page load (user opened tab after bg update)
        if (reg.waiting) _skipAndBanner(reg.waiting);

        reg.addEventListener('updatefound', function () {
            var newSW = reg.installing;
            newSW.addEventListener('statechange', function () {
                if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                    _skipAndBanner(newSW);
                }
            });
        });

        // Poll every 30 minutes (important for long-lived PWA sessions)
        setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);

        // ✅ FIX: For installed PWAs poll every 5 minutes so updates are detected fast
        if (isStandalone()) {
            setInterval(function () { reg.update().catch(function () {}); }, 5 * 60 * 1000);
            console.log('[pwa-manager] Running as PWA — fast update polling enabled (5 min)');
        }

    }).catch(function (err) {
        console.warn('[pwa-manager] SW registration failed:', err);
    });

    // FIX: Prevent reload loop on controllerchange.
    // Only reload ONCE when user explicitly tapped Refresh (pwa_update_acknowledged set).
    // Set _refreshing=true BEFORE reload to block any re-entrant controllerchange events.
    var _refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (_refreshing) return;
        var ackKey = 'pwa_update_acknowledged';
        if (sessionStorage.getItem(ackKey)) {
            _refreshing = true;
            sessionStorage.removeItem(ackKey); // clear BEFORE reload
            // Short delay lets the SW fully settle before reload
            setTimeout(function() { window.location.reload(); }, 50);
        }
    });

    function _showUpdateBanner() {
        if (document.getElementById('pwaUpdateBanner')) return;
        _inject('pwaUpdateBanner',
            '<div style="' +
            'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
            'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;' +
            'padding:12px 16px;display:flex;align-items:center;gap:10px;' +
            'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
            'box-shadow:0 4px 24px rgba(0,0,0,.22);' +
            'animation:_pwaSlideDown .3s cubic-bezier(.4,0,.2,1)">' +
            '<style>@keyframes _pwaSlideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}</style>' +
            '<span style="font-size:20px;flex-shrink:0">&#10024;</span>' +
            '<div style="flex:1;min-width:0">' +
            '  <div style="font-weight:700;font-size:13px;line-height:1.2">Update ready!</div>' +
            '  <div style="font-size:11px;opacity:.85;margin-top:1px">Tap Refresh to get the latest features</div>' +
            '</div>' +
            '<button onclick="window._pwaApplyUpdate()" style="background:#fff;color:#667eea;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:800;cursor:pointer;flex-shrink:0;touch-action:manipulation">Refresh</button>' +
            '<button onclick="document.getElementById(\'pwaUpdateBanner\').remove()" style="background:none;border:none;color:rgba(255,255,255,.75);font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;flex-shrink:0;touch-action:manipulation">&times;</button>' +
            '</div>'
        );
    }

    window._pwaApplyUpdate = function () {
        sessionStorage.setItem('pwa_update_acknowledged', '1');
        window.location.reload();
    };

})();
