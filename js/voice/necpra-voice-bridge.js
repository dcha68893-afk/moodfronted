/*! NECPRA Voice Bridge: embedded screens never open a microphone; the parent owns the session.
 *  Protocol: {ns:'necpra.voice', v:1, type, requestId, frameSession, payload}. Only the types below are accepted.
 *  Nothing here can send messages, pay, or read private data: frames may only ask for a transcript, cancel, or speak a short non-sensitive text. */
(function (root) {
  'use strict';
  var NS = 'necpra.voice', VER = 1;
  var CHILD_TYPES = { 'voice.hello': 1, 'voice.capture': 1, 'voice.cancel': 1, 'voice.speak': 1, 'voice.intent.result': 1 };
  var MAX_SPEAK = 300, RATE_WINDOW = 10000, RATE_MAX = 12;

  function ok(m) { return m && typeof m === 'object' && m.ns === NS && m.v === VER && typeof m.type === 'string' && (m.requestId == null || typeof m.requestId === 'string' && m.requestId.length <= 64); }
  function rid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function rnd() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36); }

  /* ───── parent (host) ───── */
  // opts: {allowedOrigins:[...] (same origin is always allowed), voice, ui, getFrames(): iframe elements}
  function host(opts) {
    opts = opts || {}; var win = opts.window || root, V = opts.voice || root.NecpraVoice, UI = opts.ui || root.NecpraVoiceUI;
    var allowed = (opts.allowedOrigins || []).slice(), own = win.location && win.location.origin, frames = new Map(), active = null, intents = {};
    function originAllowed(o) { return !!o && o !== 'null' && (o === own || allowed.indexOf(o) >= 0); }
    function getFrames() { return opts.getFrames ? opts.getFrames() : Array.prototype.slice.call(win.document.querySelectorAll('iframe')); }
    function reply(src, origin, type, requestId, frameSession, payload) { try { src.postMessage({ ns: NS, v: VER, type: type, requestId: requestId || null, frameSession: frameSession || null, payload: payload || {} }, origin); } catch (_) {} } // never '*'
    function err(src, origin, req, fs, code, message) { reply(src, origin, 'voice.error', req, fs, { code: code, message: message }); }

    function onMessage(ev) {
      var m = ev.data; if (!ok(m)) return;
      if (!originAllowed(ev.origin)) return;                                         // 1. origin allow-list
      var frame = getFrames().filter(function (f) { return f.contentWindow === ev.source; })[0]; if (!frame) return; // 2. must be a real child frame of this page
      if (!CHILD_TYPES[m.type]) return err(ev.source, ev.origin, m.requestId, m.frameSession, 'unsupported', 'Message type not allowed.'); // 3. structured types only
      var st = frames.get(ev.source);
      if (m.type === 'voice.hello') { st = { origin: ev.origin, session: rnd(), hits: [] }; frames.set(ev.source, st); return reply(ev.source, ev.origin, 'voice.hello.ack', m.requestId, st.session, { version: VER }); }
      if (!st || st.origin !== ev.origin || m.frameSession !== st.session) return err(ev.source, ev.origin, m.requestId, m.frameSession, 'no-session', 'Say hello first.'); // 4. session id
      if (m.type === 'voice.intent.result') { var pi = m.requestId && intents[m.requestId]; if (pi && pi.src === ev.source) { delete intents[m.requestId]; clearTimeout(pi.t); pi.res({ handled: !!(m.payload && m.payload.handled) }); } return; }
      var t = Date.now(); st.hits = st.hits.filter(function (h) { return t - h < RATE_WINDOW; }); if (st.hits.length >= RATE_MAX) return err(ev.source, ev.origin, m.requestId, st.session, 'rate-limited', 'Too many voice requests.'); st.hits.push(t); // 5. rate limit
      var p = (m.payload && typeof m.payload === 'object') ? m.payload : {};
      if (m.type === 'voice.cancel') { if (active && active.src === ev.source) V.cancel(); return reply(ev.source, ev.origin, 'voice.cancelled', m.requestId, st.session); }
      if (m.type === 'voice.speak') { var text = String(p.text || '').slice(0, MAX_SPEAK); if (!text) return err(ev.source, ev.origin, m.requestId, st.session, 'bad-request', 'No text.'); return V.speak(text).then(function (spoken) { reply(ev.source, ev.origin, 'voice.spoken', m.requestId, st.session, { spoken: spoken }); }); }
      if (m.type === 'voice.capture') {
        if (active || V.isListening()) return err(ev.source, ev.origin, m.requestId, st.session, 'busy', V.message('busy'));
        active = { src: ev.source, id: m.requestId };
        var mode = p.mode === 'command' ? 'command' : 'dictation', prompt = typeof p.prompt === 'string' ? p.prompt.slice(0, 160) : undefined;
        return UI.capture({ mode: mode, prompt: prompt, title: p.title ? String(p.title).slice(0, 60) : undefined, lang: /^(auto|en|sw)$/.test(p.lang || '') ? p.lang : undefined, autoFinish: p.autoFinish === true ? true : undefined, pauseMs: typeof p.pauseMs === 'number' ? Math.min(10000, Math.max(1500, p.pauseMs)) : undefined })
          .then(function (r) { reply(ev.source, ev.origin, 'voice.result', m.requestId, st.session, { ok: !!r.ok, cancelled: !!r.cancelled, transcript: r.transcript || '', uncertain: r.uncertain || [], lang: r.lang, error: r.error || null, message: r.message || null, partial: !!r.partial }); })
          .then(function () { active = null; }, function () { active = null; err(ev.source, ev.origin, m.requestId, st.session, 'failed', 'Voice failed.'); });
      }
    }
    win.addEventListener('message', onMessage);
    // Parent -> child: offer a recognised transcript to a module frame. The frame decides; it receives text only, never credentials.
    function sendIntent(frame, payload, timeoutMs) {
      var w = frame && frame.contentWindow, st = w && frames.get(w);
      if (!st) return Promise.resolve({ handled: false, reason: 'no-session' });
      return new Promise(function (res) {
        var id = rid(); intents[id] = { src: w, res: res, t: setTimeout(function () { delete intents[id]; res({ handled: false, reason: 'timeout' }); }, timeoutMs || 600000) };
        reply(w, st.origin, 'voice.intent', id, st.session, { transcript: String(payload && payload.transcript || '').slice(0, 4000), lang: payload && payload.lang || null, mode: payload && payload.mode || null });
      });
    }
    function waitForSession(frame, ms) {
      return new Promise(function (res) { var end = Date.now() + (ms || 4000); (function poll() { if (frame && frames.has(frame.contentWindow)) return res(true); if (Date.now() > end) return res(false); setTimeout(poll, 150); })(); });
    }
    return { sendIntent: sendIntent, waitForSession: waitForSession, hasSession: function (f) { return !!(f && frames.has(f.contentWindow)); }, allow: function (o) { if (allowed.indexOf(o) < 0) allowed.push(o); }, destroy: function () { win.removeEventListener('message', onMessage); frames.clear(); }, _onMessage: onMessage };
  }

  /* ───── embedded screen (client) ───── */
  // parentOrigin defaults to this page's own origin (same-origin frames). Cross-origin frames must pass it explicitly. Never '*'.
  function client(opts) {
    opts = opts || {}; var win = opts.window || root, parent = opts.parent || win.parent, origin = opts.parentOrigin || (win.location && win.location.origin), session = null, pending = {};
    function onMessage(ev) {
      if (ev.source !== parent || ev.origin !== origin || !ok(ev.data)) return; var m = ev.data;
      if (m.type === 'voice.hello.ack') session = m.frameSession;
      if (m.type === 'voice.intent') {
        var rq = m.requestId, answer = function (h) { try { parent.postMessage({ ns: NS, v: VER, type: 'voice.intent.result', requestId: rq, frameSession: session, payload: { handled: !!h } }, origin); } catch (_) {} };
        if (!intentFn || m.frameSession !== session) return answer(false);
        return Promise.resolve().then(function () { return intentFn(m.payload || {}); }).then(answer, function () { answer(false); });
      }
      var p = m.requestId && pending[m.requestId]; if (!p) return; delete pending[m.requestId]; clearTimeout(p.t);
      if (m.type === 'voice.error') p.rej(Object.assign(new Error(m.payload.message || m.payload.code), { code: m.payload.code })); else p.res(m.payload);
    }
    win.addEventListener('message', onMessage);
    function send(type, payload, timeout) {
      return new Promise(function (res, rej) {
        var id = rid(); pending[id] = { res: res, rej: rej, t: setTimeout(function () { delete pending[id]; rej(Object.assign(new Error('timeout'), { code: 'timeout' })); }, timeout || 15000) };
        parent.postMessage({ ns: NS, v: VER, type: type, requestId: id, frameSession: session, payload: payload || {} }, origin);
      });
    }
    var ready = null, intentFn = null;
    function hello() { return ready || (ready = send('voice.hello', {}, opts.helloTimeoutMs || 5000).catch(function (e) { ready = null; throw e; })); }
    return {
      capture: function (o) { return hello().then(function () { return send('voice.capture', o || {}, 5 * 60 * 1000); }); },
      speak: function (text) { return hello().then(function () { return send('voice.speak', { text: text }); }); },
      cancel: function () { return hello().then(function () { return send('voice.cancel'); }); },
      hello: hello, onIntent: function (fn) { intentFn = fn; },
      destroy: function () { win.removeEventListener('message', onMessage); }
    };
  }

  var api = { host: host, client: client, NS: NS, VERSION: VER };
  root.NecpraVoiceBridge = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
