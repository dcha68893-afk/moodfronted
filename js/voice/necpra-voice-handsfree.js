/*! NECPRA Hands-Free Mode (foundation). Visible, consented, foreground-only listening loop.
 *  Honest limits: no wake word and no background listening (browsers/PWA/Android WebView do not allow it reliably).
 *  Activation without tapping: Alt+V, Android Voice Access / TalkBack ("tap voice assistant"), and auto-resume
 *  when the app is opened with Hands-Free already enabled (needs mic permission already granted). */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, doc = root.document;
  if (!V || !UI || !doc) return;
  var T = UI.T, on = false, paused = false, bar = null, idleRuns = 0, loopId = 0, textEl = null, offText = null;

  var RULES = [
    { id: 'wake', re: /^(?:hey |ok |okay )?(?:necpra |kynecta )?(?:open voice|start voice|voice mode|voice on|listen|fungua sauti|washa sauti|sikiliza)[.!]?$/i },
    { id: 'stop', re: /\b(stop listening|hands[- ]?free off|acha kusikiliza|zima sauti)\b/i },
    { id: 'back', re: /\b(go back|previous screen|rudi nyuma|rudi)\b/i },
    { id: 'down', re: /\b(scroll down|go down|shuka chini|telemka)\b/i },
    { id: 'up', re: /\b(scroll up|go up|panda juu)\b/i },
    { id: 'read', re: /\b(read (this|the) page|read (it|screen)|soma ukurasa|soma skrini)\b/i },
    { id: 'help', re: /\b(help|what can i say|msaada|nisaidie)\b/i },
    { id: 'cancel', re: /\b(cancel (that|what i was doing)|ghairi)\b/i }
  ];
  function visibleText() {
    var page = root.__currentPage, f = page && doc.getElementById(page + 'Iframe'), d = doc;
    if (page === 'messages' && !V.getSettings().speakSensitive) return T('Messages are private. Say “read my latest messages”, or turn on “Allow reading private info aloud” in voice settings.', 'Ujumbe ni wa siri. Sema “soma ujumbe mpya”, au washa “Ruhusu kusoma taarifa za siri” kwenye mipangilio ya sauti.');
    if (f) { try { if (f.contentDocument && f.contentDocument.body) d = f.contentDocument; } catch (_) {} } // same-origin module screen
    var n = d.querySelector('main,[role=main]') || d.body, t = (n.innerText || '').replace(/\s+/g, ' ').trim();
    return ((d.title || doc.title) ? (d.title || doc.title) + '. ' : '') + t.slice(0, 1800);
  }
  function builtin(text) {
    var hit = RULES.filter(function (r) { return r.re.test(text); })[0]; if (!hit) return Promise.resolve(false);
    var sc = doc.scrollingElement || doc.documentElement;
    switch (hit.id) {
      case 'wake': return V.speak(T('I am listening. What would you like to do?', 'Nasikiliza. Unataka kufanya nini?'), { force: true }).then(function () { return true; });
      case 'stop': disable(); return V.speak(T('Hands-free is off.', 'Hands-free imezimwa.'), { force: true }).then(function () { return true; });
      case 'back': root.history.back(); return Promise.resolve(true);
      case 'down': root.scrollBy({ top: root.innerHeight * 0.8, behavior: 'smooth' }); return Promise.resolve(true);
      case 'up': root.scrollBy({ top: -root.innerHeight * 0.8, behavior: 'smooth' }); return Promise.resolve(true);
      case 'read': return V.speak(visibleText(), { force: true, sensitive: false }).then(function () { return true; }); // note: reads what is on screen; user chose to ask for it
      case 'cancel': root.dispatchEvent(new CustomEvent('necpra:voice:cancel')); return V.speak(T('Cancelled.', 'Imeghairiwa.'), { force: true }).then(function () { return true; });
      case 'help': if (root.NecpraVoiceKnowledge && root.NecpraVoiceKnowledge.respond('what can you do')) return Promise.resolve(true); return V.speak(T('You can say: go back, scroll down, scroll up, read this page, cancel, or stop listening. Other screens add more commands.', 'Unaweza kusema: rudi nyuma, shuka chini, panda juu, soma ukurasa, ghairi, au acha kusikiliza. Skrini nyingine zinaongeza amri zaidi.'), { force: true }).then(function () { return true; });
    }
    return Promise.resolve(false);
  }

  function drawBar() {
    if (bar) return; bar = UI.el('div', { class: 'nv-bar', role: 'status', 'aria-live': 'polite' });
    bar.appendChild(UI.el('i', { class: 'dot', 'aria-hidden': 'true' })); textEl = UI.el('span', { class: 't' }, ''); bar.appendChild(textEl);
    var b = UI.el('button', { type: 'button', 'aria-label': T('Stop hands-free', 'Zima hands-free') }, T('Stop', 'Zima')); b.onclick = function () { disable(); }; bar.appendChild(b);
    var p = UI.el('button', { type: 'button' }, T('Pause', 'Simamisha')); p.onclick = function () { paused ? resume() : pause(); p.textContent = paused ? T('Resume', 'Endelea') : T('Pause', 'Simamisha'); }; bar.appendChild(p);
    doc.body.appendChild(bar); offText = V.on('text', function (e) { if (textEl && !paused) textEl.textContent = e.text || T('Listening…', 'Inasikiliza…'); });
  }
  function status(t) { if (textEl) textEl.textContent = t; }

  function loop(id) {
    if (!on || paused || id !== loopId) return;
    if (doc.hidden) return; // foreground only; resumes on visibilitychange
    status(T('Listening…', 'Inasikiliza…'));
    V.start({ mode: 'command', pauseMs: V.getSettings().pauseMs }).then(function (r) {
      if (!on || id !== loopId) return;
      if (!r.ok) {
        if (r.reason === 'no-speech') { if (++idleRuns >= 3) { pause(); status(T('Paused: no speech heard. Tap Resume.', 'Imesimama: hakuna sauti. Bonyeza Endelea.')); return V.speak(T('Hands-free paused. Say nothing to save battery, tap resume when ready.', 'Hands-free imesimama.'), { force: true }); } return loop(id); }
        if (r.cancelled) return; status(r.message || ''); return V.speak(r.message || '', { force: true }).then(function () { if (r.error === 'not-allowed' || r.error === 'unsupported' || r.error === 'service-not-allowed') disable(); else setTimeout(function () { loop(id); }, 1500); });
      }
      idleRuns = 0; var text = r.transcript;
      V.audit('handsfree.command', { module: 'handsfree', outcome: 'heard', lang: r.lang, durationMs: r.durationMs, chars: text.length });
      return builtin(text).then(function (done) { return done ? { handled: true } : V.dispatch(r); }).then(function (d) {
        if (!d.handled) return V.speak(T('Sorry, I did not catch a command I can do on this screen. Say help for options.', 'Samahani, sijapata amri ninayoweza kufanya hapa. Sema msaada.'), { force: true });
      });
    }).then(function () { setTimeout(function () { loop(id); }, 300); }); // listen again only after any spoken reply ended (no self-hearing)
  }

  function enable(opts) {
    opts = opts || {}; if (on) return Promise.resolve(true);
    var consented = V.getSettings().handsFree && opts.skipConsent;
    var gate = consented ? Promise.resolve(true) : UI.dialog({
      title: T('Turn on Hands-Free Mode?', 'Washa Hands-Free?'), speak: true, ok: T('Turn on', 'Washa'), cancel: T('Not now', 'Si sasa'),
      body: T('NECPRA will use your microphone to listen for commands only while this screen is open and visible. A red bar shows whenever it is listening.\n\nYour voice is processed by your phone or browser speech service and is not stored by NECPRA. Only the text is kept briefly if something fails. Anything involving money or messages always asks you to confirm.\n\nSay “stop listening” or tap Stop at any time.',
        'NECPRA itatumia kipaza sauti kusikiliza amri tu wakati skrini hii imefunguliwa na inaonekana. Upau mwekundu huonekana inaposikiliza.\n\nSauti yako huchakatwa na simu au kivinjari chako na haihifadhiwi na NECPRA. Maandishi pekee hubaki kwa muda mfupi kukitokea hitilafu. Chochote kinachohusu pesa au ujumbe kitakuuliza uthibitishe daima.\n\nSema “acha kusikiliza” au bonyeza Zima wakati wowote.')
    });
    return gate.then(function (yes) {
      if (!yes) return false; on = true; paused = false; idleRuns = 0; V.setSettings({ handsFree: true }); drawBar(); loop(++loopId); V.audit('handsfree.enable', { module: 'handsfree', outcome: 'on' }); return true;
    });
  }
  function disable() { if (!on && !bar) return; on = false; paused = false; loopId++; if (V.isListening()) V.cancel(); V.cancelSpeech(); if (offText) { offText(); offText = null; } if (bar) { bar.remove(); bar = null; textEl = null; } V.setSettings({ handsFree: false }); V.audit('handsfree.disable', { module: 'handsfree', outcome: 'off' }); }
  function pause() { paused = true; loopId++; if (V.isListening()) V.cancel(); }
  function resume() { if (!on) return; paused = false; idleRuns = 0; loop(++loopId); }
  doc.addEventListener('visibilitychange', function () { if (!on) return; if (doc.hidden) { loopId++; if (V.isListening()) V.cancel(); } else if (!paused) loop(++loopId); });
  // Auto-resume only if the user previously enabled it AND the browser already granted the microphone (never prompts silently)
  function autoResume() {
    if (!V.getSettings().handsFree || on) return;
    var q = root.navigator && root.navigator.permissions && root.navigator.permissions.query ? root.navigator.permissions.query({ name: 'microphone' }) : Promise.reject();
    q.then(function (s) { if (s.state === 'granted') enable({ skipConsent: true }); }, function () {});
  }
  root.NecpraHandsFree = { enable: enable, disable: disable, pause: pause, resume: resume, isOn: function () { return on; }, autoResume: autoResume, _builtin: builtin };
})(typeof window !== 'undefined' ? window : globalThis);
