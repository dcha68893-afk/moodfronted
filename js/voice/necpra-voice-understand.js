/*! NECPRA Voice "understand anything" (shell only, chat.html). When no screen's built-in phrase matching understood a spoken command, ask the backend
 *  (/api/voice/understand) which known action the user meant. The backend answers with a CANONICAL PHRASE ("accept Denis", "how much did we sell today")
 *  that the existing on-screen handlers already parse, so every confirmation / privacy rule of those handlers still applies. This file never executes
 *  anything itself, never stores speech, and silently does nothing when the feature is off, offline, slow or unsure (the old behaviour then continues).
 *  Off switch for the user: Voice settings -> "Understand any wording". Off switch for you: NECPRA_VOICE_LLM=false on the backend. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice; if (!V) return;
  /* FREE MODE: the paid AI fallback is OFF. Understanding is done by the built-in matcher (necpra-voice-nlu.js): offline, no key, no cost.
   * Set AI_FALLBACK = true only if you ever add ANTHROPIC_API_KEY on the backend. */
  var AI_FALLBACK = false;
  var CLIENT_TIMEOUT_MS = 6500, flags = { checkedAt: 0, on: false }, fails = 0, pausedUntil = 0, inflight = null;

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
    var now = Date.now(); if (now - flags.checkedAt < (flags.on ? 600000 : 300000)) return Promise.resolve(flags.on);
    var tk = token(); if (!tk || !root.fetch) return Promise.resolve(false);
    return withTimeout(base() + '/api/voice/config', { headers: { Authorization: 'Bearer ' + tk } }, 4000).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { flags = { checkedAt: Date.now(), on: !!(j && j.understand) }; return flags.on; }, function () { flags = { checkedAt: Date.now(), on: false }; return false; });
  }

  /* result = the engine's capture result ({transcript, alternatives, lang, ...}). Resolves to { phrase, module } (module = which screen owns the action: friends|money|tools|shell), or null. */
  function rewrite(result, page) {
    try {
      if (!AI_FALLBACK) return Promise.resolve(null);
      if (!result || !result.transcript || !settingOn() || Date.now() < pausedUntil || (root.navigator && root.navigator.onLine === false)) return Promise.resolve(null);
      var text = String(result.transcript).trim(); if (!text || text.length > 300) return Promise.resolve(null);
      return backendOn().then(function (on) {
        if (!on) return null;
        var tk = token(); if (!tk) return null;
        var alts = (result.alternatives || []).filter(function (a) { return typeof a === 'string' && a.trim() && a.trim() !== text; }).slice(0, 3);
        return withTimeout(base() + '/api/voice/understand', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
          body: JSON.stringify({ transcript: text, alternatives: alts, page: page || null, lang: result.lang || null }) }, CLIENT_TIMEOUT_MS)
          .then(function (r) {
            if (r.status === 429) { pausedUntil = Date.now() + 60000; return null; }
            if (r.status === 503) { flags = { checkedAt: Date.now(), on: false }; return null; }
            if (!r.ok) { throw new Error('http ' + r.status); }
            return r.json();
          })
          .then(function (j) { fails = 0; if (j && j.ok && j.understood && typeof j.phrase === 'string' && j.phrase) { V.audit('voice.understand', { module: j.module || 'shell', outcome: 'heard', lang: result.lang }); return { phrase: j.phrase, module: typeof j.module === 'string' ? j.module : null }; } return null; });
      }).catch(function () { if (++fails >= 2) { pausedUntil = Date.now() + 120000; fails = 0; } return null; });
    } catch (_) { return Promise.resolve(null); }
  }

  root.NecpraVoiceUnderstand = { rewrite: rewrite, _reset: function () { flags = { checkedAt: 0, on: false }; fails = 0; pausedUntil = 0; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceUnderstand;
})(typeof window !== 'undefined' ? window : globalThis);
