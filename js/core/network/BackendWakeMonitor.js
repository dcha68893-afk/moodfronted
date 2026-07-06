/**
 * BackendWakeMonitor.js
 * Part 2 — Backend Sleep Detection (client-visible feedback layer)
 *
 * WHY THIS EXISTS:
 * app.realtime.socket.js and ReconnectOrchestrator.js already handle the
 * *mechanics* of retrying through a cold/sleeping backend (Render free-tier
 * wake-up, dropped connections, etc). But neither of them ever told the user
 * anything was happening — REALTIME_STATE_CHANGED was emitted into the void
 * with no listener outside app.realtime.socket.js itself. From the user's
 * perspective a cold start just looked like a frozen app for up to a minute.
 *
 * This module does ONE thing: translate the connection state machine that
 * already exists into an honest, persistent status banner —
 *   "Connecting…" → "Waking up the server, this can take a minute…" → gone
 * — without inventing a new connection system. It only *listens*; it never
 * calls connect()/disconnect() itself, so it can't interfere with the real
 * reconnect logic.
 *
 * Safe to include on any page; no-ops quietly if KynectaEventBus/KynectaRealtime
 * never show up (e.g. pages that don't use realtime at all).
 */
(function () {
    'use strict';

    if (window.__BackendWakeMonitor) return;

    const WAKE_UP_THRESHOLD_MS = 8000;   // if still not connected after this long, assume cold start
    const RECONNECT_GRACE_MS   = 2500;   // don't flash a banner for a sub-3s blip

    let bannerEl        = null;
    let bootTimer       = null;
    let graceTimer       = null;
    let hasConnectedOnce = false;
    let bootStartedAt    = Date.now();

    function ensureBanner() {
        if (bannerEl) return bannerEl;
        bannerEl = document.createElement('div');
        bannerEl.id = 'kynBackendWakeBanner';
        bannerEl.setAttribute('role', 'status');
        bannerEl.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:999999',
            'padding:8px 16px', 'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'text-align:center', 'color:#fff', 'transition:transform .25s ease, background-color .25s ease',
            'transform:translateY(-100%)', 'pointer-events:none'
        ].join(';');
        document.documentElement.appendChild(bannerEl);
        return bannerEl;
    }

    function show(text, color) {
        const el = ensureBanner();
        el.textContent = text;
        el.style.backgroundColor = color;
        el.style.transform = 'translateY(0)';
    }

    function hide() {
        if (!bannerEl) return;
        bannerEl.style.transform = 'translateY(-100%)';
    }

    function clearTimers() {
        if (bootTimer)  { clearTimeout(bootTimer); bootTimer = null; }
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    }

    // ── Boot sequence: if we're not connected within WAKE_UP_THRESHOLD_MS of
    // page load, the most likely explanation on this stack is a sleeping
    // Render dyno, not a broken app — say so explicitly instead of leaving
    // the user with silent "Connecting…" that could mean anything.
    function armBootWatch() {
        show('Connecting…', '#5b6472');
        bootTimer = setTimeout(() => {
            if (!hasConnectedOnce) {
                show('Waking up the server — this can take up to a minute the first time…', '#b7791f');
            }
        }, WAKE_UP_THRESHOLD_MS);
    }

    function onStateChange(state) {
        const CONNECTED_STATES = ['connected', 'authenticated'];

        if (CONNECTED_STATES.includes(state)) {
            clearTimers();
            const wasFirstConnect = !hasConnectedOnce;
            hasConnectedOnce = true;
            if (wasFirstConnect) {
                // Brief confirmation flash, then clear — matches how WhatsApp/
                // Signal acknowledge recovery instead of just silently removing
                // the banner (users don't trust a UI that changes with no cue).
                show('Connected', '#2f855a');
                setTimeout(hide, 1200);
            } else {
                show('Back online', '#2f855a');
                setTimeout(hide, 1200);
            }
            return;
        }

        if (state === 'disconnected' || state === 'reconnecting' || state === 'error') {
            if (!hasConnectedOnce) return; // boot watcher already covers this case
            // Grace period — a 2s blip during a network handoff shouldn't alarm
            // anyone; only show the banner if it's still down after the grace window.
            if (!graceTimer) {
                graceTimer = setTimeout(() => {
                    show('Reconnecting…', '#5b6472');
                }, RECONNECT_GRACE_MS);
            }
            return;
        }

        if (state === 'degraded') {
            clearTimers();
            show("Having trouble reaching the server — we'll keep retrying automatically. No need to refresh.", '#b7791f');
            return;
        }

        if (state === 'connecting' || state === 'authenticating') {
            // no-op: covered by armBootWatch() on first boot, and by the
            // grace-period banner ("Reconnecting…") on subsequent attempts
        }
    }

    function attach() {
        const bus = window.KynectaEventBus;
        const rt  = window.KynectaRealtime;
        if (!bus && !rt) { setTimeout(attach, 400); return; }

        armBootWatch();

        if (bus) {
            bus.on('REALTIME_STATE_CHANGED', (payload) => {
                const state = payload && payload.state;
                if (state) onStateChange(state);
            });
        }

        // Fallback: ReconnectOrchestrator also broadcasts a plain CustomEvent,
        // in case a page doesn't have KynectaEventBus wired up for this listener.
        window.addEventListener('kyn:recovery:state', (e) => {
            const s = e && e.detail && e.detail.state;
            if (!s) return;
            const map = {
                CONNECTED: 'connected', RECOVERED: 'connected',
                DISCONNECTED: 'disconnected', RECONNECTING: 'reconnecting',
                DEGRADED: 'degraded', OFFLINE_MODE: 'disconnected', FAILED: 'degraded',
            };
            if (map[s]) onStateChange(map[s]);
        });

        // If a connection already succeeded before we attached (e.g. very fast
        // network), don't leave a stale "Connecting…" banner up.
        if (rt && (rt._state === 'connected' || rt._state === 'authenticated')) {
            hasConnectedOnce = true;
            clearTimers();
            hide();
        }
    }

    attach();

    window.__BackendWakeMonitor = { show, hide, onStateChange };
})();
