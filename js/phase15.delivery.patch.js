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
        var msg = typeof payload === 'object' ? payload : { content: payload };
        // FIX (MESSAGE-RELAY-CONSOLIDATION): this is the 5th independent code
        // path in this codebase that posts message:new into iframes (2 in
        // chat.html, 2 in app.realtime.socket.js, this one) — each added over
        // time as a "guarantee" on top of the last without removing the
        // earlier ones. Gate through the shared registry defined in
        // chat.html so only the first path to see a given message actually
        // delivers it, instead of every path racing to deliver it separately.
        var _claimed = !window.__kynRelayMessageOnce || window.__kynRelayMessageOnce(null, 'message:new', msg);
        if (_claimed) {
            var iframes = document.querySelectorAll('iframe');
            iframes.forEach(function(f) {
                try { f.contentWindow.postMessage({ type: 'message:new', payload: msg }, '*'); } catch(_) {}
                try { f.contentWindow.postMessage({ type: 'new_message',  payload: msg }, '*'); } catch(_) {}
            });
        }
        // Also dispatch as a document-level event for same-window listeners
        try { document.dispatchEvent(new CustomEvent('message:new', { detail: msg })); } catch(_) {}
    }

    // ── 2. Call delivery to iframes ───────────────────────────────────────────
    // FIX-ROOT-CAUSE-CALL-INCOMING-STORM: this used to fan out 3 different
    // message types (call:incoming, incoming_call, REALTIME_EVENT:call:incoming)
    // to every iframe, AND was wired to run again for each of 3 different real
    // socket event name aliases below — so a single real incoming call, if the
    // backend ever emits under more than one of those alias names (a pattern
    // this exact codebase has done elsewhere for legacy compatibility), caused
    // _ensureCallDelivery to run multiple times, each time re-posting 3 message
    // types to every iframe. Live console logs confirmed this actually
    // happening ("postMessage storm detected: call:incoming (5 in 2000ms)"),
    // and directly downstream of it: calls-core.js's handleIncomingCall
    // re-running mid-call reset call state back to "incoming" *after* the
    // receiver had already accepted, which meant the 45-second no-answer
    // timeout guard (which checks callState) no longer recognized the call as
    // accepted and force-ended an already-connected, in-progress call ~45s
    // after it first started ringing. Collapse to one canonical delivery,
    // deduplicated by the call's own id so repeat arrivals under any alias are
    // dropped instead of re-processed.
    var _recentCallDeliveries = new Map(); // callId -> timestamp
    function _ensureCallDelivery(payload) {
        if (!payload) return;

        var callId = payload.callId || payload.id;
        if (callId) {
            var _lastSeen = _recentCallDeliveries.get(callId);
            if (_lastSeen && (Date.now() - _lastSeen) < 5000) {
                return; // already delivered this exact call within the last 5s
            }
            _recentCallDeliveries.set(callId, Date.now());
            if (_recentCallDeliveries.size > 50) {
                var _oldestKey = _recentCallDeliveries.keys().next().value;
                _recentCallDeliveries.delete(_oldestKey);
            }
        }

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
            try { f.contentWindow.postMessage({ type: 'call:incoming', payload: payload }, '*'); } catch(_) {}
        });
        window.dispatchEvent(new CustomEvent('kyn:call:incoming', { detail: payload }));
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
