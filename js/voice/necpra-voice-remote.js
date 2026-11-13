/*! NECPRA Voice Remote: what module screens call. Inside the app shell (iframe) the PARENT owns the microphone session
 *  (via the bridge); standalone pages fall back to the local voice sheet. Modules never touch a microphone themselves. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, B = root.NecpraVoiceBridge; if (!V) return;
  var embedded = false; try { embedded = root.parent !== root; } catch (_) {}
  var client = null, mode = embedded ? 'unknown' : 'local', pendingMode = null, intentFns = [];
  // A screen can now have SEVERAL intent handlers (e.g. Messenger + chat search + voice notes). They are offered the words in order; the first that returns true wins.
  function intentFn(p) { var i = 0; return (function next() { if (i >= intentFns.length) return Promise.resolve(false); var f = intentFns[i++]; return Promise.resolve().then(function () { return f(p); }).then(function (ok) { return ok ? true : next(); }, function () { return next(); }); })(); }

  function ensure() {
    if (mode !== 'unknown') return Promise.resolve(mode);
    if (pendingMode) return pendingMode;
    if (!B) { mode = 'local'; return Promise.resolve(mode); }
    client = B.client({ helloTimeoutMs: 2500 });
    if (intentFns.length) client.onIntent(intentFn);
    return (pendingMode = client.hello().then(function () { mode = 'bridge'; return mode; }, function () { mode = 'local'; return mode; }));
  }
  function capture(o) {
    return ensure().then(function (m) {
      if (m === 'bridge') return client.capture(o || {}).then(function (r) { return r; }, function (e) { return { ok: false, error: e.code || 'failed', message: V.message(e.code === 'busy' ? 'busy' : 'generic'), transcript: '', segments: [], uncertain: [] }; });
      if (!UI) return { ok: false, error: 'unsupported', message: V.message('unsupported'), transcript: '' };
      return UI.capture(o || {});
    });
  }
  // fn({transcript, lang}) -> true if handled. In a frame it receives intents forwarded by the shell; standalone it joins the engine's handler list.
  function onIntent(fn) {
    intentFns.push(fn); var id = 'module-' + (root.location ? root.location.pathname : 'page') + '-' + intentFns.length;
    return ensure().then(function (m) {
      if (m === 'bridge') client.onIntent(intentFn);
      else V.registerHandler(id, function (r) { return fn({ transcript: r.transcript, lang: r.lang }); });
    });
  }
  root.NecpraVoiceRemote = { capture: capture, onIntent: onIntent, mode: function () { return mode; }, ready: ensure };
  if (embedded) ensure();
})(typeof window !== 'undefined' ? window : globalThis);
