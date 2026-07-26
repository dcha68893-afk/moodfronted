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

    // FIX-ROOT-CAUSE-RELAY-GUARD-UNDEFINED: window.__kynRelayMessageOnce is
    // only ever *defined* inline in chat.html. But this same patch file (and
    // app.realtime.socket.js) is ALSO loaded standalone inside message.html,
    // group.html, and calls.html — each of which runs as its own iframe with
    // its own separate `window`, and none of them ever get chat.html's
    // definition (iframes don't share global scope with their parent, even
    // same-origin). So inside those iframe windows,
    // `!window.__kynRelayMessageOnce` was always true, every "only if
    // claimed" gate below always evaluated as claimed, and NONE of the
    // dedup this file's own comments describe was actually happening there —
    // every relay path fired independently for every message, racing
    // chat.html's own (correctly deduped) parent-frame delivery of the same
    // message. Define a real fallback registry here, in this shared file,
    // idempotently: if chat.html's richer version defines
    // window.__kynRelayMessageOnce afterward in its own window, it simply
    // overwrites this one there — but in any window where nothing else ever
    // defines it (every iframe), this fallback is what actually runs instead
    // of silently no-op'ing.
    if (!window.__kynRelayMessageOnce) {
        window.__kynRelayedMsgIds = window.__kynRelayedMsgIds || new Set();
        window.__kynRelayMessageOnce = function (iframeWindow, type, payload) {
            try {
                var p = (payload && payload.payload) ? payload.payload : payload;
                var chatId = String((p && (p.chatId || p.conversationId)) || '');
                var msgId  = String((p && (p.id || p.serverId || p.localId || p._broadcastId)) || '');
                var key = (type || 'message:new') + ':' + chatId + ':' + (msgId || (p && p.content) || Date.now());
                if (window.__kynRelayedMsgIds.has(key)) return false; // already delivered by another path in THIS window
                window.__kynRelayedMsgIds.add(key);
                setTimeout(function () { window.__kynRelayedMsgIds.delete(key); }, 15000);
                if (!iframeWindow) return true; // registration-only call — caller already posted directly
                iframeWindow.postMessage(
                    (payload && payload.type) ? payload : { type: type || 'message:new', payload: p, source: 'ws-bridge' },
                    '*'
                );
                return true;
            } catch (_) { return false; }
        };
    }

    // ── 1. Message delivery to iframes ───────────────────────────────────────
    function _ensureMessageDelivery(payload) {
        if (!payload) return;
        var msg = typeof payload === 'object' ? payload : { content: payload };
        // FIX (MESSAGE-RELAY-CONSOLIDATION): this is the 5th independent code
        // path in this codebase that posts message:new into iframes (2 in
        // chat.html, 2 in app.realtime.socket.js, this one) — each added over
        // time as a "guarantee" on top of the last without removing the
        // earlier ones. Gate through the shared registry so only the first
        // path to see a given message actually delivers it, instead of every
        // path racing to deliver it separately.
        var _claimed = window.__kynRelayMessageOnce(null, 'message:new', msg);
        if (_claimed) {
            var iframes = document.querySelectorAll('iframe');
            iframes.forEach(function(f) {
                try { f.contentWindow.postMessage({ type: 'message:new', payload: msg }, '*'); } catch(_) {}
                try { f.contentWindow.postMessage({ type: 'new_message',  payload: msg }, '*'); } catch(_) {}
            });
            // FIX: this dispatchEvent used to run unconditionally outside the
            // `if (_claimed)` block, so every unclaimed (i.e. deduped) call
            // still fired a fresh document-level 'message:new' event — which
            // defeated the dedup for any same-window listener (like
            // messages-core.ui-bridge.js's document.addEventListener), since
            // it received one event per relay path regardless of the claim
            // result. Only dispatch when this path actually won the claim.
            try { document.dispatchEvent(new CustomEvent('message:new', { detail: msg })); } catch(_) {}
        }
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
