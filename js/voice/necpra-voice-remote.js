/*! NECPRA Voice Remote: what module screens call. Inside the app shell (iframe) the PARENT owns the microphone session
 *  (via the bridge); standalone pages fall back to the local voice sheet. Modules never touch a microphone themselves. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, B = root.NecpraVoiceBridge; if (!V) return;
  var embedded = false; try { embedded = root.parent !== root; } catch (_) {}
  var client = null, mode = embedded ? 'unknown' : 'local', pendingMode = null, intentFns = [];
  // A screen can now have SEVERAL intent handlers (e.g. Messenger + chat search + voice notes). They are offered the words in order; the first that returns true wins.
  // A forwarded command can arrive a moment before the module's own init() has called onIntent() (the session exists from the first script, the
  // handler only after the page's big script ran). Wait briefly for a handler instead of answering "not handled".
  function intentFn(p) {
    if (intentFns.length) return runIntents(p);
    return new Promise(function (res) { var end = Date.now() + 10000; (function poll() { if (intentFns.length) return res(runIntents(p)); if (Date.now() > end) return res(false); setTimeout(poll, 150); })(); });
  }
  function runIntents(p) { var i = 0; return (function next() { if (i >= intentFns.length) return Promise.resolve(false); var f = intentFns[i++]; return Promise.resolve().then(function () { return f(p); }).then(function (ok) { return ok ? true : next(); }, function () { return next(); }); })(); }

  // A lost hello must never be permanent. The parent shell may not be listening yet when this frame boots (Messenger is hard-wired into chat.html and
  // loads while the shell is still parsing), so a one-shot hello that timed out used to latch 'local' for the life of the page and the shell could never
  // forward a spoken command here (-> "I heard you, but no screen here can act on that yet"). Now: keep retrying quietly and re-hello when the parent announces itself.
  var retryN = 0, retryT = null;
  function connect() {
    if (mode === 'bridge') return Promise.resolve('bridge');
    if (!client) { client = B.client({ helloTimeoutMs: 2500, onHostReady: function () { if (mode !== 'bridge') connect(); } }); if (intentFns.length) client.onIntent(intentFn); }
    return client.hello().then(function () { mode = 'bridge'; client.onIntent(intentFn); if (retryT) { clearTimeout(retryT); retryT = null; } return mode; }, function () { scheduleRetry(); return 'local'; });
  }
  function scheduleRetry() {
    if (mode === 'bridge' || retryT || retryN >= 12) return;
    retryT = setTimeout(function () { retryT = null; retryN++; connect(); }, Math.min(1000 * Math.pow(1.5, retryN), 8000));
  }
  function ensure() {
    if (mode !== 'unknown') return Promise.resolve(mode);
    if (pendingMode) return pendingMode;
    if (!B) { mode = 'local'; return Promise.resolve(mode); }
    return (pendingMode = connect().then(function (m) { if (m !== 'bridge') mode = 'local'; return m; }));
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
