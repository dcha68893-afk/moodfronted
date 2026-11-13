/*!
 * NECPRA Universal Voice Engine  (shared by every module; no module owns a microphone of its own)
 *
 * Stages kept separate:  capture -> transcript (this file)  |  understanding/actions (handlers, Phase 2+)
 * Providers are pluggable: Browser Web Speech API, Capacitor native plugin (APK). No secrets live here.
 * Audio is never stored. Only the text transcript is kept (sessionStorage) so a failed session can be recovered.
 */
(function (root) {
  'use strict';

  var SETTINGS_KEY = 'necpra_voice_settings_v1';
  var RECOVERY_KEY = 'necpra_voice_recovery_v1';
  var DEFAULTS = { lang: 'auto', speak: true, speakSensitive: false, readIncoming: false, rate: 1, voiceURI: '', pauseMs: 3500, handsFree: false };
  var FINISH_RE = /(?:^|[\s,.!?])(finish recording|stop recording|end recording|nimemaliza kurekodi|maliza kurekodi)[\s.!?]*$/i;
  var MAX_RESTARTS = 400, IDLE_MS_DICTATION = 60000, IDLE_MS_COMMAND = 15000, DUP_WINDOW_MS = 1500;

  var MSG = {
    'not-allowed': ['Microphone permission is blocked. Allow the microphone for NECPRA in your phone or browser settings, then try again.', 'Ruhusa ya kipaza sauti imezuiwa. Ruhusu kipaza sauti kwa NECPRA kwenye mipangilio, kisha jaribu tena.'],
    'service-not-allowed': ['Speech recognition is not allowed on this device or browser.', 'Utambuzi wa sauti hauruhusiwi kwenye kifaa au kivinjari hiki.'],
    'audio-capture': ['No microphone was found or it is being used by another app.', 'Kipaza sauti hakipatikani au kinatumiwa na programu nyingine.'],
    'network': ['The connection dropped. What I heard so far is kept. Check your network and try again.', 'Mtandao umekatika. Nilichosikia kimehifadhiwa. Angalia mtandao kisha jaribu tena.'],
    'offline': ['You are offline and this device needs internet for speech recognition. What I heard so far is kept.', 'Huna mtandao na kifaa hiki kinahitaji intaneti kutambua sauti. Nilichosikia kimehifadhiwa.'],
    'unsupported': ['Voice input is not supported here. You can type instead.', 'Sauti haitumiki hapa. Unaweza kuandika badala yake.'],
    'unstable': ['The microphone keeps stopping. What I heard so far is kept.', 'Kipaza sauti kinaendelea kuzimika. Nilichosikia kimehifadhiwa.'],
    'busy': ['Voice is already listening.', 'Sauti tayari inasikiliza.'],
    'generic': ['Voice recognition failed. What I heard so far is kept.', 'Utambuzi wa sauti umeshindwa. Nilichosikia kimehifadhiwa.']
  };

  function store(kind) { try { return root[kind] || null; } catch (_) { return null; } }
  function readJSON(kind, key) { try { var s = store(kind); var v = s && s.getItem(key); return v ? JSON.parse(v) : null; } catch (_) { return null; } }
  function writeJSON(kind, key, v) { try { var s = store(kind); if (s) s.setItem(key, JSON.stringify(v)); } catch (_) {} }
  function removeKey(kind, key) { try { var s = store(kind); if (s) s.removeItem(key); } catch (_) {} }
  function now() { return Date.now(); }
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function uid() { return 'v' + now().toString(36) + Math.random().toString(36).slice(2, 8); }


  /* ───────── replay guard ─────────
   * Android Chrome and the Android speech plugin re-deliver text: (a) an interim that starts with the words that were
   * just finalised, (b) cumulative finals ("hello", "hello how", "hello how are you"), (c) the same final twice.
   * Without this guard the transcript reads "hello hello". We only drop text that starts with words we JUST committed
   * (inside REPLAY_WINDOW_MS), so a person genuinely saying "hello" twice, seconds apart, is kept. */
  var REPLAY_WINDOW_MS = 1500;
  function tokens(t) { return clean(t).split(' ').filter(Boolean).map(function (w) { return { raw: w, n: w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '') }; }).filter(function (x) { return x.n; }); }
  // Returns the part of `text` that is genuinely new given the segments already committed (may be '').
  function stripReplay(segments, text, nowMs, windowMs) {
    var tk = tokens(text); if (!tk.length || !segments.length) return clean(text);
    windowMs = windowMs || REPLAY_WINDOW_MS;
    var burst = [], edge = nowMs;
    for (var i = segments.length - 1; i >= 0; i--) { if (edge - segments[i].at > windowMs) break; burst.unshift(segments[i]); edge = segments[i].at; }
    for (var k = burst.length; k >= 1; k--) {   // longest committed run first: handles cumulative finals
      var prev = tokens(burst.slice(burst.length - k).map(function (s) { return s.text; }).join(' '));
      if (!prev.length || tk.length < prev.length) continue;
      var same = true; for (var j = 0; j < prev.length; j++) if (prev[j].n !== tk[j].n) { same = false; break; }
      if (same) return tk.slice(prev.length).map(function (x) { return x.raw; }).join(' ');
    }
    return clean(text);
  }

  /* ───────── settings ───────── */
  var settings = Object.assign({}, DEFAULTS, readJSON('localStorage', SETTINGS_KEY) || {});
  var listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return function () { off(evt, fn); }; }
  function off(evt, fn) { listeners[evt] = (listeners[evt] || []).filter(function (f) { return f !== fn; }); }
  function emit(evt, data) { (listeners[evt] || []).slice().forEach(function (f) { try { f(data); } catch (e) { if (root.console) console.error('[NecpraVoice]', e); } }); }
  function getSettings() { return Object.assign({}, settings); }
  function setSettings(patch) {
    Object.keys(patch || {}).forEach(function (k) { if (k in DEFAULTS) settings[k] = patch[k]; });
    settings.rate = Math.min(2, Math.max(0.5, Number(settings.rate) || 1));
    settings.pauseMs = Math.min(15000, Math.max(1000, Number(settings.pauseMs) || DEFAULTS.pauseMs));
    writeJSON('localStorage', SETTINGS_KEY, settings); emit('settings', getSettings());
  }

  /* ───────── language ───────── */
  // Web Speech cannot detect language by itself, so 'auto' = the device language; the user can override manually.
  function resolveLang(pref) {
    var p = String(pref || settings.lang || 'auto');
    if (p === 'en') return 'en-KE'; if (p === 'sw') return 'sw-KE';
    if (p !== 'auto') return p;
    var nav = (root.navigator && (root.navigator.language || '')) || '';
    return /^sw/i.test(nav) ? 'sw-KE' : (nav || 'en-KE');
  }
  /* One recogniser = one language. Kenyan speech mixes English and Kiswahili, and a phone set to English hears "fungua pochi" as nonsense (and the reverse).
   * When the language is 'auto' and a spoken COMMAND was not understood by any screen, the NEXT command listen uses the other language once, then goes back. */
  var flipNext = false;
  function otherLang() { return /^sw/i.test(resolveLang('auto')) ? 'en-KE' : 'sw-KE'; }
  function msg(code, lang) { var m = MSG[code] || MSG.generic; return /^sw/i.test(lang || resolveLang()) ? m[1] : m[0]; }

  /* ───────── providers ───────── */
  function BrowserProvider() {
    var Ctor = root.SpeechRecognition || root.webkitSpeechRecognition;
    return {
      name: 'browser-webspeech',
      available: function () { return Promise.resolve(!!Ctor); },
      ensurePermission: function () { return Promise.resolve(true); }, // the browser prompts on start()
      createRun: function (cfg, cb) {
        var rec = new Ctor(), seen = {};
        rec.lang = cfg.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 5; // the recogniser's runner-up guesses let a command still match when the top guess mishears one word
        rec.onaudiostart = function () { cb.audio(); };
        rec.onspeechstart = function () { cb.activity(); };
        rec.onresult = function (e) {
          var interim = '';
          for (var i = e.resultIndex; i < e.results.length; i++) {
            var r = e.results[i], alt = r[0];
            if (r.isFinal) { if (seen[i]) continue; seen[i] = true; var alts = []; for (var k = 1; k < r.length && k < 5; k++) if (r[k] && r[k].transcript) alts.push(r[k].transcript); cb.final(alt.transcript, typeof alt.confidence === 'number' ? alt.confidence : null, alts); }
            else interim += alt.transcript;
          }
          cb.interim(interim);
        };
        rec.onerror = function (e) { cb.error(e && e.error || 'generic'); };
        rec.onend = function () { cb.end(); };
        return { start: function () { rec.start(); }, stop: function () { try { rec.stop(); } catch (_) {} }, abort: function () { try { rec.abort(); } catch (_) {} } };
      }
    };
  }

  // Capacitor plugin: @capacitor-community/speech-recognition (APK WebView has no Web Speech API). Needs on-device verification.
  function CapacitorProvider() {
    function plugin() { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.SpeechRecognition; }
    return {
      name: 'capacitor-speech',
      available: function () { var P = plugin(); return P ? P.available().then(function (r) { return !!(r && r.available); }, function () { return false; }) : Promise.resolve(false); },
      ensurePermission: function () {
        var P = plugin();
        return P.checkPermissions().then(function (s) { return s.speechRecognition === 'granted' ? true : P.requestPermissions().then(function (r) { return r.speechRecognition === 'granted'; }); });
      },
      createRun: function (cfg, cb) {
        var P = plugin(), last = '', lastAlts = [], ended = false, subs = [];
        function finishRun() {
          if (ended) return; ended = true;
          if (last) { var t = last, al = lastAlts; last = ''; lastAlts = []; cb.final(t, null, al); }
          subs.forEach(function (s) { try { s.remove(); } catch (_) {} }); cb.end();
        }
        return {
          start: function () {
            Promise.all([
              P.addListener('partialResults', function (d) { var t = d && d.matches && d.matches[0]; if (t != null) { last = t; lastAlts = (d.matches || []).slice(1, 5); cb.interim(t); } }),
              P.addListener('listeningState', function (d) { if (d && d.status === 'stopped') finishRun(); })
            ]).then(function (s) { subs = s; cb.audio(); return P.start({ language: cfg.lang, partialResults: true, popup: false, maxResults: 5 }); })
              .catch(function (e) { ended = true; cb.error(/permission/i.test(String(e && e.message)) ? 'not-allowed' : 'generic'); cb.end(); });
          },
          stop: function () { P.stop().catch(function () {}); },
          abort: function () { ended = true; last = ''; P.stop().catch(function () {}); subs.forEach(function (s) { try { s.remove(); } catch (_) {} }); }
        };
      }
    };
  }

  var providers = [];
  function registerProvider(p) { providers.unshift(p); } // newest registered wins
  registerProvider(BrowserProvider());
  registerProvider(CapacitorProvider());
  function pickProvider() {
    var i = 0;
    function next() {
      if (i >= providers.length) return Promise.resolve(null);
      var p = providers[i++];
      return Promise.resolve(p.available()).then(function (ok) { return ok ? p : next(); }, next);
    }
    return next();
  }
  function isSupported() { return pickProvider().then(function (p) { return !!p; }); }

  /* ───────── capture session ───────── */
  var S = null; // the single active session: the main application owns it

  function persistRecovery() {
    if (!S) return; var text = joinText(S.segments, '');
    if (text) writeJSON('sessionStorage', RECOVERY_KEY, { text: text, at: now(), lang: S.lang });
  }
  function joinText(segments, interim) {
    var parts = segments.map(function (s) { return s.text; }); if (interim) parts.push(interim);
    return clean(parts.join(' '));
  }
  function setState(st) { if (S) { S.state = st; } emit('state', { state: st, sessionId: S && S.id }); }
  function emitText() { emit('text', { text: stripFinish(joinText(S.segments, S.interim)), interim: S.interim, segments: S.segments.slice(), sessionId: S.id }); }
  function stripFinish(t) { return clean(String(t).replace(FINISH_RE, '')); }

  function start(opts) {
    opts = opts || {};
    if (S) return Promise.resolve(fail('busy', null, true));
    var sess = S = {
      id: uid(), mode: opts.mode === 'command' ? 'command' : 'dictation', lang: (flipNext && opts.mode === 'command' && !opts.lang && settings.lang === 'auto') ? (flipNext = false, otherLang()) : resolveLang(opts.lang),
      pauseMs: opts.pauseMs || settings.pauseMs, autoFinish: opts.autoFinish != null ? !!opts.autoFinish : (opts.mode === 'command'),
      segments: [], interim: '', startedAt: now(), lastActivity: now(), heard: false, restarts: 0, quickEnds: 0,
      run: null, finishing: false, closed: false, timers: {}, netRetries: 0, provider: null, reason: null
    };
    sess.promise = new Promise(function (res) { sess.resolve = res; });
    setState('requesting');
    pickProvider().then(function (p) {
      if (sess.closed) return;
      if (!p) return close(fail('unsupported', sess, false));
      sess.provider = p;
      return Promise.resolve(p.ensurePermission()).then(function (ok) {
        if (sess.closed) return;
        if (!ok) return close(fail('not-allowed', sess, false));
        startRun(sess);
        sess.timers.idle = root.setInterval(function () { idleCheck(sess); }, 1000);
      });
    }).catch(function () { if (!sess.closed) close(fail('generic', sess, false)); });
    return sess.promise;
  }

  function startRun(sess) {
    if (sess.closed || sess.finishing) return;
    var began = now(), run;
    var cb = {
      audio: function () { if (sess.state !== 'listening') { setState('listening'); } },
      activity: function () { sess.lastActivity = now(); sess.heard = true; resetSilence(sess); },
      interim: function (t) {
        if (sess.closed) return; sess.interim = stripReplay(sess.segments, clean(t), now());
        if (sess.interim) { sess.heard = true; sess.lastActivity = now(); resetSilence(sess); if (FINISH_RE.test(joinText(sess.segments, sess.interim))) return finish('voice-finish'); }
        emitText();
      },
      final: function (t, conf, alts) {
        if (sess.closed) return; var rawT = clean(t); t = rawT; sess.interim = ''; if (!t) return;
        var n = now(); t = stripReplay(sess.segments, t, n); // provider replay / cumulative result, not a repeat by the user
        if (!t) { emitText(); return; }
        sess.segments.push({ text: t, confidence: conf, uncertain: conf != null && conf < 0.5, at: n, alts: (t === rawT && alts && alts.length) ? alts.map(clean).filter(Boolean) : null });
        sess.heard = true; sess.lastActivity = n; sess.netRetries = 0; persistRecovery(); emitText(); resetSilence(sess);
        emit('final', { text: t, confidence: conf, sessionId: sess.id });
        if (FINISH_RE.test(joinText(sess.segments, ''))) finish('voice-finish');
      },
      error: function (code) { sess.lastError = code; },
      end: function () {
        if (sess.closed || sess.run !== run) return;
        sess.run = null;
        if (sess.interim) { var pv = stripReplay(sess.segments, sess.interim, now(), 2500); sess.interim = ''; if (pv) { sess.segments.push({ text: pv, confidence: null, uncertain: true, provisional: true, at: now() }); persistRecovery(); } }
        var code = sess.lastError; sess.lastError = null;
        if (sess.finishing) return close(done(sess));
        if (code === 'aborted') return close(done(sess, 'cancelled'));
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return close(fail(code, sess, false));
        if (code === 'network') {
          var offline = root.navigator && root.navigator.onLine === false;
          if (offline || ++sess.netRetries > 2) return close(fail(offline ? 'offline' : 'network', sess, true));
        }
        if (now() - began < 500) { if (++sess.quickEnds >= 5) return close(fail('unstable', sess, true)); } else sess.quickEnds = 0;
        if (++sess.restarts > MAX_RESTARTS) return close(done(sess, 'session-limit'));
        root.setTimeout(function () { startRun(sess); }, code === 'network' ? 800 : 150); // seamless continuation: earlier words stay in sess.segments
      }
    };
    try { run = sess.run = sess.provider.createRun({ lang: sess.lang }, cb); run.start(); }
    catch (e) { sess.run = null; close(fail('generic', sess, true)); }
  }

  function resetSilence(sess) {
    if (sess.timers.silence) root.clearTimeout(sess.timers.silence);
    if (!sess.autoFinish || !sess.heard) return;
    sess.timers.silence = root.setTimeout(function () { finish('silence'); }, sess.pauseMs);
  }
  function idleCheck(sess) { // privacy: never keep an open mic indefinitely when nobody is talking
    if (sess.closed || sess.finishing) return;
    var limit = sess.mode === 'command' ? IDLE_MS_COMMAND : IDLE_MS_DICTATION;
    if (now() - sess.lastActivity > limit) finish(sess.heard ? 'idle' : 'no-speech');
  }

  function finish(reason) {
    var sess = S; if (!sess || sess.finishing || sess.closed) return;
    sess.finishing = true; sess.reason = reason || 'finish'; setState('processing');
    if (sess.timers.silence) root.clearTimeout(sess.timers.silence);
    if (sess.run) { sess.run.stop(); sess.timers.flush = root.setTimeout(function () { if (!sess.closed) close(done(sess)); }, 1500); }
    else close(done(sess));
  }
  function cancel() {
    var sess = S; if (!sess || sess.closed) return;
    sess.finishing = true; if (sess.run) sess.run.abort();
    removeKey('sessionStorage', RECOVERY_KEY);
    close({ ok: false, cancelled: true, reason: 'cancelled', transcript: '', segments: [], uncertain: [], lang: sess.lang, sessionId: sess.id });
  }

  function build(sess, extra) {
    var segs = sess.segments.slice(), transcript = stripFinish(joinText(segs, ''));
    var altList = (segs.length === 1 && segs[0].alts) ? segs[0].alts.filter(function (a) { return a.toLowerCase() !== transcript.toLowerCase(); }) : [];
    return Object.assign({ alternatives: altList, transcript: transcript, segments: segs, uncertain: segs.filter(function (s) { return s.uncertain; }).map(function (s) { return s.text; }), lang: sess.lang, mode: sess.mode, durationMs: now() - sess.startedAt, sessionId: sess.id, provider: sess.provider && sess.provider.name }, extra);
  }
  function done(sess, reason) {
    var r = build(sess, { ok: true, reason: reason || sess.reason || 'finish' });
    if (r.reason === 'cancelled') r.ok = false;
    if (!r.transcript && r.reason !== 'cancelled') { r.ok = false; r.reason = 'no-speech'; }
    if (r.ok) removeKey('sessionStorage', RECOVERY_KEY);
    return r;
  }
  function fail(code, sess, recoverable) {
    var lang = sess ? sess.lang : resolveLang();
    var r = sess ? build(sess, {}) : { transcript: '', segments: [], uncertain: [], lang: lang };
    return Object.assign(r, { ok: false, error: code, reason: 'error', recoverable: !!recoverable, message: msg(code, lang), partial: !!r.transcript });
  }
  function close(result) {
    var sess = S; if (!sess || sess.closed) return; sess.closed = true;
    Object.keys(sess.timers).forEach(function (k) { root.clearTimeout(sess.timers[k]); root.clearInterval(sess.timers[k]); });
    if (sess.run) { try { sess.run.abort(); } catch (_) {} sess.run = null; }
    S = null; setState('idle'); emit('done', result); sess.resolve(result);
  }

  function state() { return S ? S.state : 'idle'; }
  function isListening() { return !!S; }
  function getRecovery() { return readJSON('sessionStorage', RECOVERY_KEY); }
  function clearRecovery() { removeKey('sessionStorage', RECOVERY_KEY); }

  /* ───────── text-to-speech ───────── */
  var speaking = null, lastSpoken = '';
  function chunk(text) {
    var out = [], parts = clean(text).split(/(?<=[.!?;:])\s+/);
    parts.forEach(function (p) { while (p.length > 200) { var cut = p.lastIndexOf(' ', 200); if (cut < 40) cut = 200; out.push(p.slice(0, cut)); p = p.slice(cut).trim(); } if (p) out.push(p); });
    return out;
  }
  function getVoices() { return (root.speechSynthesis && root.speechSynthesis.getVoices && root.speechSynthesis.getVoices()) || []; }
  function pickVoice(lang) {
    var v = getVoices(); if (!v.length) return null;
    if (settings.voiceURI) { var m = v.filter(function (x) { return x.voiceURI === settings.voiceURI; })[0]; if (m) return m; }
    var base = lang.slice(0, 2).toLowerCase();
    return v.filter(function (x) { return x.lang && x.lang.toLowerCase() === lang.toLowerCase(); })[0] || v.filter(function (x) { return x.lang && x.lang.slice(0, 2).toLowerCase() === base; })[0] || null;
  }
  // opts: {force, sensitive, lang}. Sensitive text (balances, private messages) is spoken only if the user allowed it.
  function speak(text, opts) {
    opts = opts || {}; text = clean(text); if (!text) return Promise.resolve(false);
    lastSpoken = text;
    if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) return Promise.resolve(false);
    if (!opts.force && !settings.speak) return Promise.resolve(false);
    if (opts.sensitive && !settings.speakSensitive && !opts.force) return Promise.resolve(false);
    cancelSpeech();
    var lang = resolveLang(opts.lang), voice = pickVoice(lang), token = speaking = {};
    emit('speaking', { speaking: true });
    return new Promise(function (resolve) {
      var parts = chunk(text), i = 0;
      (function next() {
        if (speaking !== token || i >= parts.length) { if (speaking === token) { speaking = null; emit('speaking', { speaking: false }); } return resolve(true); }
        var u = new root.SpeechSynthesisUtterance(parts[i++]); u.lang = lang; u.rate = settings.rate; if (voice) u.voice = voice;
        u.onend = next; u.onerror = function () { if (speaking === token) { speaking = null; emit('speaking', { speaking: false }); } resolve(false); };
        root.speechSynthesis.speak(u);
      })();
    });
  }
  function cancelSpeech() { speaking = null; try { root.speechSynthesis && root.speechSynthesis.cancel(); } catch (_) {} }
  function repeatLast() { return lastSpoken ? speak(lastSpoken, { force: true }) : Promise.resolve(false); }
  function isSpeaking() { return !!speaking; }

  /* ───────── handler registry (modules consume the engine; Phase 2+ registers real handlers here) ───────── */
  var handlers = [];
  function registerHandler(id, fn) { handlers = handlers.filter(function (h) { return h.id !== id; }); handlers.unshift({ id: id, fn: fn }); return function () { handlers = handlers.filter(function (h) { return h.id !== id; }); }; }
  // Offers a finished transcript to modules, newest first; a handler returns true (or a promise of true) if it handled it.
  function dispatchOne(result) {
    var i = 0;
    return (function next() {
      if (i >= handlers.length) return Promise.resolve({ handled: false });
      var h = handlers[i++];
      return Promise.resolve().then(function () { return h.fn(result); }).then(function (ok) { return ok ? { handled: true, by: h.id } : next(); }, function () { return next(); });
    })();
  }
  // If no screen understood the top guess, try the recogniser's other guesses ("open shama" / "open chama") before giving up.
  function dispatch(result) {
    return dispatchOne(result).then(function (d) {
      var alts = (d.handled || !result || !result.alternatives) ? [] : result.alternatives.slice(0, 4), k = 0;
      return (function again() {
        if (k >= alts.length) return d;
        var alt = alts[k++];
        return dispatchOne(Object.assign({}, result, { transcript: alt, alternatives: [], usedAlternative: true })).then(function (r) { return r.handled ? r : again(); });
      })();
    }).then(function (final) {
      if (result && result.mode === 'command') flipNext = !final.handled;   // not understood -> try the other language on the next listen (once)
      return final;
    });
  }

  /* ───────── audit (metadata only: never audio, never transcript text) ───────── */
  var cfg = { getToken: null, apiBase: null };
  function configure(c) { Object.assign(cfg, c || {}); }
  function audit(action, meta) {
    try {
      var token = cfg.getToken ? cfg.getToken() : ''; if (!token || !root.fetch) return Promise.resolve(false);
      var base = (typeof cfg.apiBase === 'function' ? cfg.apiBase() : cfg.apiBase) || '';
      meta = meta || {};
      return root.fetch(base + '/api/voice/audit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: String(action).slice(0, 48), module: meta.module || null, outcome: meta.outcome || null, lang: meta.lang || null, durationMs: meta.durationMs | 0, chars: meta.chars | 0, requestId: meta.requestId || null }) })
        .then(function (r) { return r.ok; }, function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }

  var api = {
    version: '1.0.0', start: start, finish: finish, cancel: cancel, state: state, isListening: isListening, isSupported: isSupported,
    on: on, off: off, getSettings: getSettings, setSettings: setSettings, resolveLang: resolveLang, message: msg,
    getRecovery: getRecovery, clearRecovery: clearRecovery, speak: speak, cancelSpeech: cancelSpeech, repeatLast: repeatLast, isSpeaking: isSpeaking, getVoices: getVoices,
    registerProvider: registerProvider, registerHandler: registerHandler, dispatch: dispatch, configure: configure, audit: audit,
    _internals: { stripFinish: stripFinish, chunk: chunk, stripReplay: stripReplay }
  };
  root.NecpraVoice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
