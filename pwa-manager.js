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
    var _installAutoHideTimer = null;
    var _installReshowTimer = null;

    var INSTALL_VISIBLE_MS  = 10 * 1000;        // show for 10 seconds
    var INSTALL_RESHOW_MS   = 2 * 60 * 60 * 1000; // re-show after 2 hours if still in app

    function _isAppInstalled() {
        return isStandalone() || localStorage.getItem('pwa_installed') === '1';
    }

    function _renderInstallBanner() {
        if (_isAppInstalled()) return; // never show once installed
        if (document.getElementById('pwaInstallBanner')) return; // already showing

        _inject('pwaInstallBanner',
            '<div id="pwaInstallInner" style="' +
            'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;' +
            'background:#fff;border-top:2px solid #667eea;' +
            'box-shadow:0 -4px 24px rgba(0,0,0,.16);' +
            'padding:14px 16px;display:flex;align-items:center;gap:12px;' +
            'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
            'animation:_pwaSlideUp .35s cubic-bezier(.4,0,.2,1)">' +
            '<style>@keyframes _pwaSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}' +
            '@keyframes _pwaSlideDownOut{from{transform:translateY(0)}to{transform:translateY(100%)}}</style>' +
            '<img src="/moodchat-192.png" style="width:46px;height:46px;border-radius:12px;flex-shrink:0;object-fit:cover" onerror="this.style.display=\'none\'">' +
            '<div style="flex:1;min-width:0">' +
            '  <div style="font-weight:800;font-size:14px;color:#111;line-height:1.2">Install MoodChat</div>' +
            '  <div style="font-size:12px;color:#6b7280;margin-top:2px">Fast, offline-ready app experience</div>' +
            '</div>' +
            '<button onclick="window._pwaDoInstall()" style="background:#667eea;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;touch-action:manipulation">Install</button>' +
            '<button onclick="window._pwaDismissInstall()" style="background:none;border:none;color:#9ca3af;font-size:24px;line-height:1;cursor:pointer;padding:2px 6px;flex-shrink:0;touch-action:manipulation">&times;</button>' +
            '</div>'
        );

        // ── FIX: auto-hide after 10s instead of staying up indefinitely.
        // If the user neither installed nor explicitly dismissed it, this is
        // a soft auto-hide (not a "no thanks") — so it can reappear later.
        clearTimeout(_installAutoHideTimer);
        _installAutoHideTimer = setTimeout(function () {
            var inner = document.getElementById('pwaInstallInner');
            if (inner) inner.style.animation = '_pwaSlideDownOut .3s cubic-bezier(.4,0,.2,1) forwards';
            setTimeout(function () {
                var b = document.getElementById('pwaInstallBanner');
                if (b) b.remove();
            }, 300);
        }, INSTALL_VISIBLE_MS);

        _scheduleReshow();
    }

    // ── FIX: Re-show every 2 hours while the user is still actively in the
    // app and hasn't installed or permanently dismissed the banner.
    function _scheduleReshow() {
        clearTimeout(_installReshowTimer);
        if (_isAppInstalled()) return;
        if (localStorage.getItem('pwa_dismissed_permanently') === '1') return;
        _installReshowTimer = setTimeout(function () {
            if (_isAppInstalled()) return;
            if (localStorage.getItem('pwa_dismissed_permanently') === '1') return;
            if (document.visibilityState === 'visible' && !document.hidden) {
                _renderInstallBanner();
            } else {
                // App is backgrounded — try again in 2 hours rather than firing
                // a banner nobody will see.
                _scheduleReshow();
            }
        }, INSTALL_RESHOW_MS);
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        _deferredPrompt = e;

        if (_isAppInstalled()) return;
        if (localStorage.getItem('pwa_dismissed_permanently') === '1') return;

        _renderInstallBanner();
    });

    window._pwaDoInstall = async function () {
        if (!_deferredPrompt) return;
        clearTimeout(_installAutoHideTimer);
        clearTimeout(_installReshowTimer);
        try {
            _deferredPrompt.prompt();
            var result = await _deferredPrompt.userChoice;
            _deferredPrompt = null;
            if (result.outcome === 'accepted') {
                localStorage.setItem('pwa_installed', '1');
                localStorage.removeItem('pwa_dismissed_permanently');
            } else {
                // User saw the native prompt and declined — try again in 2hrs,
                // same as a soft auto-hide, not a permanent dismissal.
                _scheduleReshow();
            }
        } catch (err) {
            console.warn('[pwa-manager] install prompt error:', err);
        }
        var b = document.getElementById('pwaInstallBanner');
        if (b) b.remove();
    };

    window._pwaDismissInstall = function () {
        // ── FIX: Tapping the X is an explicit "no" — stop nagging entirely,
        // unlike the 10s auto-hide which is allowed to come back in 2hrs.
        clearTimeout(_installAutoHideTimer);
        clearTimeout(_installReshowTimer);
        var b = document.getElementById('pwaInstallBanner');
        if (b) b.remove();
        localStorage.setItem('pwa_dismissed_permanently', '1');
    };

    window.addEventListener('appinstalled', function () {
        clearTimeout(_installAutoHideTimer);
        clearTimeout(_installReshowTimer);
        var b = document.getElementById('pwaInstallBanner');
        if (b) b.remove();
        localStorage.setItem('pwa_installed', '1');
        localStorage.removeItem('pwa_dismissed_permanently');
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
            var newVersion = event.data.version || '';
            var lastVersion = localStorage.getItem('_sw_last_version') || '';
            console.log('[pwa-manager] SW_UPDATED received — version:', newVersion, 'last known:', lastVersion);
            // Only show banner if:
            //   (a) there was already a controller before this page load (not first install), AND
            //   (b) the version actually changed (not a same-version re-activate on reload), AND
            //   (c) we haven't already shown a banner in the last 60s (covers
            //       the case where _skipAndBanner already showed one for this
            //       same update moments earlier).
            var _lastShown = parseInt(localStorage.getItem('_update_banner_shown_at') || '0', 10);
            var _recentlyShown = (Date.now() - _lastShown) < 60000;
            if (_hadControllerOnLoad && newVersion && newVersion !== lastVersion && !_recentlyShown) {
                localStorage.setItem('_sw_last_version', newVersion);
                localStorage.setItem('_update_banner_shown_at', String(Date.now()));
                _showUpdateBanner();
            } else {
                // Record current version so future updates can compare
                if (newVersion) localStorage.setItem('_sw_last_version', newVersion);
                console.log('[pwa-manager] Suppressing update banner (first install, same version, or shown recently)');
                _hadControllerOnLoad = true;
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
            // ── FIX (real, replaces the previous non-fix): this function's only
            // job is to tell the waiting worker to activate. It must NOT show
            // the banner itself — it has no version string to compare against,
            // so it can't tell a real update apart from a byte-identical
            // re-install (which browsers do on relogin due to cache-header
            // quirks). The ONLY place that's allowed to show the banner is the
            // SW_UPDATED message handler above, which compares SW_VERSION
            // against the last version seen. Once this posts SKIP_WAITING, the
            // SW activates and sends SW_UPDATED — that handler decides.
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

    // FIX (moved here from calls.html's removed duplicate SW block): never
    // auto-reload while a call is active — it destroys the live WebRTC
    // connection and was causing "calling screen disappears" / no in-call
    // screen. If the user taps Refresh mid-call, defer the actual reload
    // until 'kyn:call:ended' fires (or the call screen is no longer active).
    function _isCallActive() {
        // window.__callActive is the flag both chat.html (parent) and
        // calls.html (iframe) set/clear on their own `window` for the
        // lifetime of a call — check it first since it's reliable in
        // whichever document this script happens to be running in.
        if (window.__callActive) return true;
        return !!(document.body && (
            document.body.classList.contains('call-screen-active') ||
            document.body.classList.contains('in-call-active')
        ));
    }

    function _doReload() {
        if (_refreshing) return;
        if (_isCallActive()) {
            var onEnded = function () {
                window.removeEventListener('kyn:call:ended', onEnded);
                _doReload();
            };
            window.addEventListener('kyn:call:ended', onEnded);
            // Safety net in case the end event is never dispatched
            setTimeout(function () {
                if (!_isCallActive()) _doReload();
            }, 5000);
            return;
        }
        _refreshing = true;
        setTimeout(function() { window.location.reload(); }, 50);
    }

    navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (_refreshing) return;
        var ackKey = 'pwa_update_acknowledged';
        if (sessionStorage.getItem(ackKey)) {
            sessionStorage.removeItem(ackKey); // clear BEFORE reload
            // Short delay lets the SW fully settle before reload
            _doReload();
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
        // FIX-DOUBLE-RELOAD: this used to set the ack flag AND call
        // window.location.reload() itself, immediately. But the new service
        // worker hadn't necessarily taken control yet at that point, so this
        // reload could load against the OLD worker/cache — stale content.
        // Then, on THAT page load, the controllerchange listener above would
        // see the still-set ack flag and reload AGAIN once the new worker
        // actually activated. Two reloads for one click is exactly the
        // "keeps opening and closing" loop. The fix: only set the flag and
        // ask the waiting worker to activate; let controllerchange be the
        // SINGLE place that performs the actual reload, once, after the new
        // worker is truly in control.
        sessionStorage.setItem('pwa_update_acknowledged', '1');
        var banner = document.getElementById('pwaUpdateBanner');
        if (banner) banner.remove();

        navigator.serviceWorker.getRegistration().then(function (reg) {
            if (reg && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else {
                // No waiting worker (already activated, or nothing pending) —
                // nothing for controllerchange to react to, so reload directly.
                sessionStorage.removeItem('pwa_update_acknowled' + 'ged');
                window.location.reload();
            }
        }).catch(function () {
            window.location.reload();
        });

        // Safety net: if controllerchange never fires within 4s (e.g. the
        // worker was already active and there genuinely was nothing to
        // activate), fall back to a single manual reload instead of leaving
        // the user stuck looking at a banner that did nothing.
        setTimeout(function () {
            if (sessionStorage.getItem('pwa_update_acknowledged')) {
                sessionStorage.removeItem('pwa_update_acknowledged');
                window.location.reload();
            }
        }, 4000);
    };

})();
