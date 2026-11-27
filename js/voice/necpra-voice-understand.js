/*! NECPRA Voice "understand anything" (shell only, chat.html). When no screen's built-in phrase matching and no offline NLU understood a spoken command,
 *  ask the NECPRA Intelligence Engine on OUR backend (/api/intelligence/ask). It needs no paid AI key and sends nothing to a third-party AI.
 *  It answers with one of:
 *    - an ACTION as a CANONICAL PHRASE ("accept Denis", "how much did we sell today") that the existing on-screen handlers already parse, so every
 *      confirmation / privacy rule of those handlers still applies;
 *    - an ANSWER to a data question (profit, restock advice, who owes you...) that is spoken back; it says whether it was counted or predicted;
 *    - a QUESTION back to the user (ambiguous / missing detail) that is spoken, never guessed;
 *    - "prepare" for sensitive things (payments, sales, expenses, reminders): the engine has done NOTHING; the normal confirm screen decides.
 *  This file never executes anything itself, never stores speech, and silently does nothing when off, offline, slow or unsure (old behaviour continues).
 *  Off switch for the user: Voice settings -> "Understand any wording". Off switch for you: NECPRA_AI_ENABLED=false on the backend. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice; if (!V) return;
  /* The engine is free (rules + statistics on our own server), so it is on by default. Set ENGINE_FALLBACK = false to disable it from the client. */
  var ENGINE_FALLBACK = true;
  // FIX (SILENT WAIT BEFORE "I did not get that"): these were 12s + 15s, so a sleeping/slow server left the person in silence for up to 27s
  // after every command the phone could not understand by itself. 3s + 7s keeps the helper but never makes the person wait that long.
  var CLIENT_TIMEOUT_MS = 7000, CONFIG_TIMEOUT_MS = 3000, OFF_RECHECK_MS = 20000, FAIL_PAUSE_MS = 20000, flags = { checkedAt: 0, on: false }, fails = 0, pausedUntil = 0, inflight = null;

  function settingOn() { try { return V.getSettings().smart !== false; } catch (_) { return true; } }
  function cfg() { return (V._cfg && V._cfg()) || {}; }
  function base() { var c = cfg(), b = typeof c.apiBase === 'function' ? c.apiBase() : c.apiBase; return b || ''; }
  function token() { var c = cfg(); try { return c.getToken ? c.getToken() : ''; } catch (_) { return ''; } }
  function withTimeout(url, opts, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return root.fetch(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {})).then(function (r) { if (t) clearTimeout(t); return r; }, function (e) { if (t) clearTimeout(t); throw e; });
  }

  // Is the backend able to do it? Cached for 10 minutes (5 on failure) so normal commands never wait for this check.
  function backendOn() {
    var now = Date.now(); if (now - flags.checkedAt < (flags.on ? 600000 : OFF_RECHECK_MS)) return Promise.resolve(flags.on);
    var tk = token(); if (!tk || !root.fetch) return Promise.resolve(false);
    return withTimeout(base() + '/api/intelligence/config', { headers: { Authorization: 'Bearer ' + tk } }, CONFIG_TIMEOUT_MS).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { flags = { checkedAt: Date.now(), on: !!(j && j.enabled) }; return flags.on; }, function () { flags = { checkedAt: 0, on: false }; return true; });   /* slow / waking server: try /ask anyway instead of going deaf for minutes */
  }

  /* result = the engine's capture result ({transcript, alternatives, lang, ...}). Resolves to { phrase, module } (module = which screen owns the action: friends|money|tools|shell), or null. */
  function rewrite(result, page) {
    try {
      if (!ENGINE_FALLBACK) return Promise.resolve(null);
      if (!result || !result.transcript || !settingOn() || Date.now() < pausedUntil || (root.navigator && root.navigator.onLine === false)) return Promise.resolve(null);
      var text = String(result.transcript).trim(); if (!text || text.length > 300) return Promise.resolve(null);
      return backendOn().then(function (on) {
        if (!on) return null;
        var tk = token(); if (!tk) return null;
        var alts = (result.alternatives || []).filter(function (a) { return typeof a === 'string' && a.trim() && a.trim() !== text; }).slice(0, 3);
        return withTimeout(base() + '/api/intelligence/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
          body: JSON.stringify({ text: text, page: page || null, lang: result.lang || null }) }, CLIENT_TIMEOUT_MS)
          .then(function (r) {
            if (r.status === 429) { pausedUntil = Date.now() + 60000; return null; }
            if (r.status === 503) { flags = { checkedAt: Date.now(), on: false }; return null; }
            if (!r.ok) { throw new Error('http ' + r.status); }
            return r.json();
          })
          .then(function (j) {
            fails = 0; if (!j || !j.ok) return null;
            var say = typeof j.say === 'string' ? j.say : '';
            // An answer / question / "nothing done yet" message is spoken as-is. Predictions already say so in the text ("about", "likely between", "early estimate").
            if ((j.type === 'answer' || j.type === 'clarify') && say) { V.audit('voice.understand', { module: 'intelligence', outcome: 'heard', lang: result.lang }); V.speak(say, { force: true }); return { spoken: true }; }
            if ((j.type === 'action' || j.type === 'prepare') && typeof j.phrase === 'string' && j.phrase) { V.audit('voice.understand', { module: j.module || 'shell', outcome: 'heard', lang: result.lang }); return { phrase: j.phrase, module: typeof j.module === 'string' ? j.module : null }; }
            if (j.type === 'prepare' && say) { V.speak(say, { force: true }); return { spoken: true }; }   // e.g. a reminder: prepared only, nothing saved
            return null;
          });
      }).catch(function () { if (++fails >= 3) { pausedUntil = Date.now() + FAIL_PAUSE_MS; fails = 0; } return null; });
    } catch (_) { return Promise.resolve(null); }
  }

  root.NecpraVoiceUnderstand = { rewrite: rewrite, _reset: function () { flags = { checkedAt: 0, on: false }; fails = 0; pausedUntil = 0; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceUnderstand;
})(typeof window !== 'undefined' ? window : globalThis);
