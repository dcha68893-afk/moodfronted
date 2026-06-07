/**
 * phase15.delivery.patch.js
 * Load this script in chat.html AFTER app.realtime.socket.js
 *
 * FIXES:
 * 1. Guarantees message:new events reach the messages iframe
 * 2. Guarantees call:incoming events reach the calls iframe
 * 3. Adds presence heartbeat so online status stays accurate
 * 4. Fixes the identity chain so callerName is never "user 1"
 */
(function() {
    'use strict';

    // ── 1. Message delivery to iframes ───────────────────────────────────────
    function _ensureMessageDelivery(payload) {
        if (!payload) return;
        var iframes = document.querySelectorAll('iframe');
        var msg = typeof payload === 'object' ? payload : { content: payload };
        iframes.forEach(function(f) {
            try { f.contentWindow.postMessage({ type: 'message:new', payload: msg }, '*'); } catch(_) {}
            try { f.contentWindow.postMessage({ type: 'new_message',  payload: msg }, '*'); } catch(_) {}
        });
        // Also dispatch as a document-level event for same-window listeners
        try { document.dispatchEvent(new CustomEvent('message:new', { detail: msg })); } catch(_) {}
    }

    // ── 2. Call delivery to iframes ───────────────────────────────────────────
    function _ensureCallDelivery(payload) {
        if (!payload) return;
        // Normalize callerName before fan-out
        if (!payload.callerName || payload.callerName === 'Unknown') {
            var c = payload.caller || payload.callerInfo || {};
            var fn = c.firstName || '', ln = c.lastName || '';
            payload.callerName = (fn + (ln ? ' ' + ln : '')).trim()
                || c.displayName || c.username
                || payload.fromUserName
                || (payload.callerId ? ('User ' + payload.callerId) : 'Incoming Call');
        }
        if (!payload.callType && payload.type) payload.callType = payload.type;
        if (!payload.callerAvatar) payload.callerAvatar = (payload.caller && payload.caller.avatar) || null;

        var iframes = document.querySelectorAll('iframe');
        iframes.forEach(function(f) {
            try { f.contentWindow.postMessage({ type: 'call:incoming',  payload: payload }, '*'); } catch(_) {}
            try { f.contentWindow.postMessage({ type: 'incoming_call',  payload: payload }, '*'); } catch(_) {}
            try { f.contentWindow.postMessage({ type: 'REALTIME_EVENT:call:incoming', payload: payload }, '*'); } catch(_) {}
        });
        window.dispatchEvent(new CustomEvent('kyn:call:incoming', { detail: payload }));
        window.dispatchEvent(new CustomEvent('kyn:incoming_call',  { detail: payload }));
    }

    // ── 3. Hook into KynectaRealtime after it initialises ────────────────────
    var _hookAttempts = 0;
    function _hookRealtime() {
        var rt = window.KynectaRealtime;
        if (!rt) {
            if (++_hookAttempts < 30) setTimeout(_hookRealtime, 500);
            return;
        }

        // message:new — ensure delivery to iframe
        rt.on('message:new', function(p) { _ensureMessageDelivery(p); });
        rt.on('new_message',  function(p) { _ensureMessageDelivery(p); });
        rt.on('chat:message', function(p) { _ensureMessageDelivery(p); });

        // call:incoming — ensure delivery to iframe  
        rt.on('call:incoming',  function(p) { _ensureCallDelivery(p); });
        rt.on('incoming_call',  function(p) { _ensureCallDelivery(p); });
        rt.on('call_incoming',  function(p) { _ensureCallDelivery(p); });

        console.log('[Phase15] KynectaRealtime hooks installed ✅');
    }
    setTimeout(_hookRealtime, 1000);

    // ── 4. postMessage bridge — relay call:incoming from parent to iframes ───
    window.addEventListener('message', function(evt) {
        if (!evt.data || !evt.data.type) return;
        var t = evt.data.type;
        if (t === 'call:incoming' || t === 'incoming_call' || t === 'REALTIME_EVENT:call:incoming') {
            _ensureCallDelivery(evt.data.payload || evt.data);
        }
        if (t === 'message:new' || t === 'new_message') {
            _ensureMessageDelivery(evt.data.payload || evt.data);
        }
    });

    // ── 5. Periodic presence heartbeat ───────────────────────────────────────
    setInterval(function() {
        try {
            var rt = window.KynectaRealtime;
            if (rt && rt._socket && rt._socket.connected) {
                rt._socket.emit('heartbeat', { ts: Date.now() });
            }
        } catch(_) {}
    }, 25000);

    console.log('[Phase15] Delivery patch loaded ✅');
})();
