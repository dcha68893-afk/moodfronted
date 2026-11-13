/*! NECPRA Voice UI: one accessible voice sheet for the whole app. Depends on NecpraVoice (engine). */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, doc = root.document;
  if (!V || !doc) return;

  var CSS = '.nv-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.nv-sheet{width:100%;max-width:560px;background:#fff;color:#111;border-radius:20px 20px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.35);max-height:92vh;overflow:auto}' +
    '.nv-h{display:flex;align-items:center;justify-content:space-between;gap:8px}.nv-title{font-size:1.1rem;font-weight:700;margin:0}' +
    '.nv-state{display:inline-block;margin-top:6px;padding:4px 10px;border-radius:999px;font-weight:700;font-size:.9rem;background:#e5e7eb;color:#111}' +
    '.nv-state[data-s=listening]{background:#b91c1c;color:#fff}.nv-state[data-s=processing],.nv-state[data-s=requesting]{background:#1d4ed8;color:#fff}.nv-state[data-s=error]{background:#7c2d12;color:#fff}' +
    '.nv-wave{display:flex;align-items:center;justify-content:center;gap:3px;height:64px;margin:12px 0}.nv-wave i{display:block;width:5px;height:6px;border-radius:3px;background:#b91c1c;transition:height .08s}' +
    '.nv-prompt{font-size:1rem;margin:4px 0;color:#374151}.nv-text{min-height:96px;max-height:34vh;overflow:auto;font-size:1.3rem;line-height:1.45;padding:12px;border:2px solid #111;border-radius:12px;background:#f9fafb;word-break:break-word;white-space:pre-wrap}' +
    '.nv-text .nv-i{color:#6b7280}.nv-text .nv-u{background:#fde68a;border-radius:4px}.nv-msg{margin-top:8px;font-weight:600;color:#7c2d12}' +
    '.nv-row{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}.nv-btn{flex:1 1 120px;min-height:56px;font-size:1.05rem;font-weight:700;border-radius:14px;border:2px solid #111;background:#fff;color:#111;cursor:pointer}' +
    '.nv-btn.pri{background:#111;color:#fff}.nv-btn:focus-visible,.nv-x:focus-visible,.nv-set select:focus-visible{outline:4px solid #2563eb;outline-offset:2px}' +
    '.nv-x{min-width:48px;min-height:48px;border:0;background:transparent;font-size:1.4rem;cursor:pointer}.nv-set{display:grid;gap:10px;margin-top:10px}.nv-set label{display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:600}' +
    '.nv-set select,.nv-set input[type=range]{min-height:44px;max-width:55%}.nv-set input[type=checkbox]{width:26px;height:26px}' +
    '.nv-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147482000;width:64px;height:64px;border-radius:50%;border:3px solid #fff;background:#b91c1c;color:#fff;font-size:1.6rem;box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer}' +
    '.nv-bar{position:fixed;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));z-index:2147482500;background:#111;color:#fff;border-radius:14px;padding:10px 12px;display:flex;gap:10px;align-items:center;font-weight:600}' +
    '.nv-bar .dot{width:12px;height:12px;border-radius:50%;background:#ef4444;flex:none}.nv-bar span.t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nv-bar button{min-height:44px;padding:0 14px;border-radius:10px;border:2px solid #fff;background:transparent;color:#fff;font-weight:700}' +
    '@media (prefers-reduced-motion:reduce){.nv-wave i{transition:none}}';
  var style = doc.createElement('style'); style.textContent = CSS; (doc.head || doc.documentElement).appendChild(style);

  function sw() { return /^sw/i.test(V.resolveLang()); }
  function T(en, s) { return sw() ? s : en; }
  function el(tag, attrs, text) { var e = doc.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  function liveRegion() { var r = doc.getElementById('nv-live'); if (!r) { r = el('div', { id: 'nv-live', 'aria-live': 'polite', role: 'status', style: 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden' }); doc.body.appendChild(r); } return r; }
  function announce(t) { liveRegion().textContent = ''; setTimeout(function () { liveRegion().textContent = t; }, 30); }

  var STATE_LABEL = function (s) { return ({ idle: T('Ready', 'Tayari'), requesting: T('Starting microphone…', 'Inawasha kipaza sauti…'), listening: T('Listening', 'Inasikiliza'), processing: T('Processing…', 'Inachakata…'), error: T('Problem', 'Tatizo') })[s] || s; };

  /* ───────── generic confirm dialog (used for consent now, action confirmation in later phases) ───────── */
  function dialog(o) {
    return new Promise(function (resolve) {
      var prev = doc.activeElement, ov = el('div', { class: 'nv-ov', role: 'presentation' }), sh = el('div', { class: 'nv-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'nv-dt', 'aria-describedby': 'nv-db' });
      sh.appendChild(el('h2', { class: 'nv-title', id: 'nv-dt' }, o.title)); var b = el('div', { class: 'nv-prompt', id: 'nv-db', style: 'white-space:pre-wrap;margin-top:10px' }, o.body); sh.appendChild(b);
      var row = el('div', { class: 'nv-row' }), no = el('button', { class: 'nv-btn', type: 'button' }, o.cancel || T('Cancel', 'Ghairi')), yes = el('button', { class: 'nv-btn pri', type: 'button' }, o.ok || T('OK', 'Sawa'));
      row.appendChild(no); row.appendChild(yes); sh.appendChild(row); ov.appendChild(sh); doc.body.appendChild(ov);
      function end(v) { doc.removeEventListener('keydown', key, true); ov.remove(); if (prev && prev.focus) try { prev.focus(); } catch (_) {} resolve(v); }
      function key(e) { if (e.key === 'Escape') { e.preventDefault(); end(false); } if (e.key === 'Tab') { var f = [no, yes], i = f.indexOf(doc.activeElement); e.preventDefault(); (f[(i + (e.shiftKey ? -1 : 1) + 2) % 2]).focus(); } }
      no.onclick = function () { end(false); }; yes.onclick = function () { end(true); }; doc.addEventListener('keydown', key, true);
      if (o.speak) V.speak(o.title + '. ' + o.body, { force: true });
      yes.focus();
    });
  }

  /* ───────── capture sheet ───────── */
  var sheetOpen = false;
  function capture(o) {
    o = o || {};
    if (sheetOpen || V.isListening()) return Promise.resolve({ ok: false, error: 'busy', message: V.message('busy'), transcript: '' });
    sheetOpen = true;
    return new Promise(function (resolve) {
      var prev = doc.activeElement, ov = el('div', { class: 'nv-ov', role: 'presentation' });
      var sh = el('div', { class: 'nv-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'nv-t' });
      var head = el('div', { class: 'nv-h' }), left = el('div'); left.appendChild(el('h2', { class: 'nv-title', id: 'nv-t' }, o.title || T('Voice', 'Sauti')));
      var st = el('span', { class: 'nv-state', 'data-s': 'requesting' }, STATE_LABEL('requesting')); left.appendChild(st);
      var gear = el('button', { class: 'nv-x', type: 'button', 'aria-label': T('Voice settings', 'Mipangilio ya sauti'), 'aria-expanded': 'false' }, '⚙'); head.appendChild(left); head.appendChild(gear); sh.appendChild(head);
      if (o.prompt) sh.appendChild(el('p', { class: 'nv-prompt' }, o.prompt));
      var wave = el('div', { class: 'nv-wave', 'aria-hidden': 'true' }), bars = []; for (var i = 0; i < 27; i++) { var b = el('i'); bars.push(b); wave.appendChild(b); } sh.appendChild(wave);
      var txt = el('div', { class: 'nv-text', 'aria-label': T('What I heard', 'Nilichosikia'), tabindex: '0' }); sh.appendChild(txt);
      var message = el('div', { class: 'nv-msg', role: 'alert' }); sh.appendChild(message);
      var setBox = el('div', { class: 'nv-set', hidden: 'hidden' }); sh.appendChild(setBox);
      var row = el('div', { class: 'nv-row' });
      var bCancel = el('button', { class: 'nv-btn', type: 'button' }, T('Cancel', 'Ghairi')), bRepeat = el('button', { class: 'nv-btn', type: 'button' }, T('Repeat', 'Rudia')), bFinish = el('button', { class: 'nv-btn pri', type: 'button' }, T('Finish', 'Maliza'));
      row.appendChild(bCancel); row.appendChild(bRepeat); row.appendChild(bFinish); sh.appendChild(row); ov.appendChild(sh); doc.body.appendChild(ov);

      function buildSettings() {
        var s = V.getSettings(); setBox.textContent = '';
        function sel(label, val, opts, fn) { var l = el('label'); l.appendChild(el('span', {}, label)); var x = el('select'); opts.forEach(function (p) { var op = el('option', { value: p[0] }, p[1]); if (String(p[0]) === String(val)) op.selected = true; x.appendChild(op); }); x.onchange = function () { fn(x.value); }; l.appendChild(x); setBox.appendChild(l); }
        sel(T('Language', 'Lugha'), s.lang, [['auto', T('Automatic (device)', 'Otomatiki (kifaa)')], ['en', 'English'], ['sw', 'Kiswahili']], function (v) { V.setSettings({ lang: v }); });
        sel(T('Wait for pauses', 'Subiri kimya'), s.pauseMs, [[2000, T('Short', 'Fupi')], [3500, T('Normal', 'Kawaida')], [6000, T('Long', 'Ndefu')], [10000, T('Very long', 'Ndefu sana')]], function (v) { V.setSettings({ pauseMs: +v }); });
        sel(T('Speaking speed', 'Kasi ya kusema'), s.rate, [[0.75, T('Slow', 'Polepole')], [1, T('Normal', 'Kawaida')], [1.25, T('Fast', 'Haraka')]], function (v) { V.setSettings({ rate: +v }); });
        var l = el('label'); l.appendChild(el('span', {}, T('Speak replies', 'Sema majibu'))); var c = el('input', { type: 'checkbox' }); c.checked = !!s.speak; c.onchange = function () { V.setSettings({ speak: c.checked }); }; l.appendChild(c); setBox.appendChild(l);
        var l3 = el('label'); l3.appendChild(el('span', {}, T('Read new messages aloud', 'Soma ujumbe mpya kwa sauti'))); var c3 = el('input', { type: 'checkbox' }); c3.checked = !!s.readIncoming; c3.onchange = function () { V.setSettings({ readIncoming: c3.checked }); if (c3.checked && !V.getSettings().speakSensitive) { V.setSettings({ speakSensitive: true }); buildSettings(); } }; l3.appendChild(c3); setBox.appendChild(l3);
        if (root.NecpraHandsFree) { var l4 = el('label'); l4.appendChild(el('span', {}, T('Hands-Free Mode', 'Hands-Free'))); var c4 = el('input', { type: 'checkbox' }); c4.checked = root.NecpraHandsFree.isOn(); c4.onchange = function () { if (c4.checked) { V.cancel(); root.NecpraHandsFree.enable().then(function (on) { c4.checked = on; }); } else root.NecpraHandsFree.disable(); }; l4.appendChild(c4); setBox.appendChild(l4); }
        var l2 = el('label'); l2.appendChild(el('span', {}, T('Allow reading private info aloud', 'Ruhusu kusoma taarifa za siri'))); var c2 = el('input', { type: 'checkbox' }); c2.checked = !!s.speakSensitive; c2.onchange = function () { V.setSettings({ speakSensitive: c2.checked }); }; l2.appendChild(c2); setBox.appendChild(l2);
      }
      gear.onclick = function () { var open = setBox.hasAttribute('hidden'); if (open) { buildSettings(); setBox.removeAttribute('hidden'); } else setBox.setAttribute('hidden', 'hidden'); gear.setAttribute('aria-expanded', String(open)); };

      var lastActivity = 0, raf = 0, reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      function paint() {
        var active = now() - lastActivity < 700 && V.state() === 'listening', listening = V.state() === 'listening';
        for (var i = 0; i < bars.length; i++) { var h = active ? 8 + Math.abs(Math.sin(now() / 120 + i * 0.7)) * 46 * (0.4 + Math.random() * 0.6) : (listening ? 8 + (Math.sin(now() / 500 + i) + 1) * 3 : 6); bars[i].style.height = (reduced ? (active ? 30 : 8) : h) + 'px'; }
        raf = root.requestAnimationFrame(paint);
      }
      function now() { return Date.now(); }
      raf = root.requestAnimationFrame(paint);

      var offs = [];
      offs.push(V.on('state', function (e) { st.setAttribute('data-s', e.state); st.textContent = STATE_LABEL(e.state); if (e.state === 'listening') { announce(T('Listening. Speak now.', 'Inasikiliza. Ongea sasa.')); } }));
      offs.push(V.on('text', function (e) {
        lastActivity = now(); txt.textContent = '';
        e.segments.forEach(function (sg, i) { var s = el('span', sg.uncertain ? { class: 'nv-u', title: T('Unclear', 'Haijaeleweka') } : {}, (i ? ' ' : '') + sg.text); txt.appendChild(s); });
        if (e.interim) txt.appendChild(el('span', { class: 'nv-i' }, (e.segments.length ? ' ' : '') + e.interim)); txt.scrollTop = txt.scrollHeight;
      }));
      var recovered = V.getRecovery(); if (recovered && recovered.text && o.offerRecovery !== false) { txt.textContent = recovered.text; message.textContent = T('Restored your earlier words. Keep speaking to add more.', 'Maneno yako ya awali yamerudishwa. Endelea kusema kuongeza.'); }

      var closed = false;
      function close(result) {
        if (closed) return; closed = true; root.cancelAnimationFrame(raf); offs.forEach(function (f) { f(); }); doc.removeEventListener('keydown', key, true); ov.remove(); sheetOpen = false;
        if (prev && prev.focus) try { prev.focus(); } catch (_) {} resolve(result);
      }
      function key(e) { if (e.key === 'Escape') { e.preventDefault(); V.cancel(); } else if (e.key === 'Tab') { var f = [gear, bCancel, bRepeat, bFinish], i = f.indexOf(doc.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); } }
      doc.addEventListener('keydown', key, true);
      bFinish.onclick = function () { V.finish('manual'); }; bRepeat.onclick = function () { V.repeatLast().then(function (ok) { if (!ok) announce(T('Nothing to repeat.', 'Hakuna cha kurudia.')); }); };
      bFinish.focus();

      var aborted = false;
      function abortBeforeStart() { aborted = true; V.cancelSpeech(); close({ ok: false, cancelled: true, reason: 'cancelled', transcript: '', segments: [], uncertain: [] }); }
      bCancel.onclick = function () { if (V.isListening()) V.cancel(); else abortBeforeStart(); };
      // The prompt is spoken BEFORE the microphone opens, so the phone never transcribes its own voice.
      var pre = (o.spokenPrompt || o.prompt) ? V.speak(o.spokenPrompt || o.prompt) : Promise.resolve(false);
      pre.then(function () {
        if (aborted) return { ok: false, cancelled: true, transcript: '', segments: [], uncertain: [] };
        return V.start({ mode: o.mode || 'dictation', lang: o.lang, pauseMs: o.pauseMs, autoFinish: o.autoFinish });
      }).then(function (r) {
        if (aborted) return;
        V.cancelSpeech();
        if (r.ok) return close(r);
        if (r.cancelled) return close(r);
        // failure: keep the sheet open so nothing is lost, explain, and offer retry or use of the partial text
        closed = false; message.textContent = r.message || T('No speech was heard.', 'Hakuna sauti iliyosikika.'); announce(message.textContent); V.speak(message.textContent);
        st.setAttribute('data-s', 'error'); st.textContent = STATE_LABEL('error'); root.cancelAnimationFrame(raf);
        bFinish.textContent = r.transcript ? T('Use what I heard', 'Tumia nilichosikia') : T('Close', 'Funga'); bRepeat.textContent = T('Try again', 'Jaribu tena');
        bFinish.onclick = function () { closed = false; close(r.transcript ? Object.assign({}, r, { ok: true, reason: 'partial-accepted', partial: true }) : r); };
        bCancel.onclick = function () { V.clearRecovery(); close(Object.assign({}, r, { cancelled: true })); };
        bRepeat.onclick = function () { V.clearRecovery(); closed = true; ov.remove(); sheetOpen = false; doc.removeEventListener('keydown', key, true); offs.forEach(function (f) { f(); }); capture(Object.assign({}, o, { offerRecovery: false })).then(function (x) { resolve(r.transcript && x && x.ok ? Object.assign({}, x, { transcript: (r.transcript + ' ' + x.transcript).trim() }) : x); }); };
      });
    });
  }


  /* ───────── choose one of several (e.g. two contacts named Mary) ───────── */
  function choose(o) {
    return new Promise(function (resolve) {
      var prev = doc.activeElement, ov = el('div', { class: 'nv-ov', role: 'presentation' }), sh = el('div', { class: 'nv-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'nv-ct' });
      sh.appendChild(el('h2', { class: 'nv-title', id: 'nv-ct' }, o.title)); var msgEl = el('div', { class: 'nv-msg', role: 'alert' }), btns = [];
      o.options.forEach(function (x, i) { var b = el('button', { class: 'nv-btn', type: 'button', style: 'display:block;width:100%;margin-top:10px;text-align:left;padding:10px 14px' }, (i + 1) + '. ' + x.label + (x.sub ? ' — ' + x.sub : '')); b.onclick = function () { end(i); }; btns.push(b); sh.appendChild(b); });
      sh.appendChild(msgEl); var row = el('div', { class: 'nv-row' }), no = el('button', { class: 'nv-btn', type: 'button' }, T('Cancel', 'Ghairi')); row.appendChild(no);
      var vb = null; if (o.voiceAnswer) { vb = el('button', { class: 'nv-btn pri', type: 'button' }, '🎤 ' + T('Answer by voice', 'Jibu kwa sauti')); row.appendChild(vb); }
      sh.appendChild(row); ov.appendChild(sh); doc.body.appendChild(ov);
      function end(v) { doc.removeEventListener('keydown', key, true); V.cancelSpeech(); ov.remove(); if (prev && prev.focus) try { prev.focus(); } catch (_) {} resolve(v); }
      var all = btns.concat([no]).concat(vb ? [vb] : []);
      function key(e) { if (e.key === 'Escape') { e.preventDefault(); end(-1); } if (e.key === 'Tab') { var i = all.indexOf(doc.activeElement); e.preventDefault(); all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus(); } }
      doc.addEventListener('keydown', key, true); no.onclick = function () { end(-1); };
      var asking = false;
      function ask() { if (asking) return; asking = true; V.cancelSpeech(); o.voiceAnswer().then(function (t) { asking = false; if (!t) return; var idx = root.NecpraVoiceIntents ? root.NecpraVoiceIntents.parseChoice(t, o.options) : -1; if (idx >= 0) end(idx); else { msgEl.textContent = T('I did not catch which one. Say the number or full name, or tap.', 'Sikupata ni yupi. Sema namba au jina kamili, au bonyeza.'); V.speak(msgEl.textContent); } }); }
      if (vb) vb.onclick = ask; btns[0] && btns[0].focus();
      var say = o.title + '. ' + o.options.map(function (x, i) { return (i + 1) + ', ' + x.label + (x.sub ? ', ' + x.sub : ''); }).join('. ');
      V.speak(say).then(function () { if (vb && V.getSettings().handsFree && ov.isConnected) ask(); });
    });
  }

  /* ───────── review a dictated message before sending: edit, re-dictate, add, cancel, send ───────── */
  function confirmMessage(o) {
    return new Promise(function (resolve) {
      var prev = doc.activeElement, ov = el('div', { class: 'nv-ov', role: 'presentation' }), sh = el('div', { class: 'nv-sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'nv-mt' });
      sh.appendChild(el('h2', { class: 'nv-title', id: 'nv-mt' }, T('Send to ', 'Tuma kwa ') + o.to + '?'));
      var ta = el('textarea', { class: 'nv-text', 'aria-label': T('Message text. You can edit it.', 'Maandishi ya ujumbe. Unaweza kuyahariri.'), rows: '4', style: 'width:100%;box-sizing:border-box;font:inherit;font-size:1.3rem' }); ta.value = o.text; sh.appendChild(ta);
      var note = el('div', { class: 'nv-msg', role: 'status' }, o.note || ''); sh.appendChild(note);
      var row = el('div', { class: 'nv-row' }); function B(t, cls, fn) { var b = el('button', { class: 'nv-btn' + (cls ? ' ' + cls : ''), type: 'button' }, t); b.onclick = fn; row.appendChild(b); return b; }
      var bSend = B(T('Send', 'Tuma'), 'pri', function () { end({ action: 'send', text: ta.value.trim() }); });
      B(T('Add more', 'Ongeza'), '', function () { end({ action: 'append', text: ta.value.trim() }); }); B(T('Dictate again', 'Sema upya'), '', function () { end({ action: 'redo', text: '' }); }); var bNo = B(T('Cancel', 'Ghairi'), '', function () { end({ action: 'cancel', text: '' }); });
      var vb = o.voiceAnswer ? B('🎤 ' + T('Answer by voice', 'Jibu kwa sauti'), '', function () { ask(); }) : null;
      sh.appendChild(row); ov.appendChild(sh); doc.body.appendChild(ov);
      function end(v) { doc.removeEventListener('keydown', key, true); V.cancelSpeech(); ov.remove(); if (prev && prev.focus) try { prev.focus(); } catch (_) {} resolve(v); }
      var all = [ta, bSend].concat(Array.prototype.slice.call(row.querySelectorAll('button')).slice(1));
      function key(e) { if (e.key === 'Escape') { e.preventDefault(); end({ action: 'cancel', text: '' }); } if (e.key === 'Tab') { var i = all.indexOf(doc.activeElement); e.preventDefault(); all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus(); } }
      doc.addEventListener('keydown', key, true);
      var asking = false;
      function ask() {
        if (asking) return; asking = true; V.cancelSpeech();
        o.voiceAnswer().then(function (t) {
          asking = false; if (!t) return; var a = root.NecpraVoiceIntents ? root.NecpraVoiceIntents.parseConfirmAnswer(t) : { action: 'unknown' };
          if (a.action === 'send') end({ action: 'send', text: ta.value.trim() });
          else if (a.action === 'cancel') end({ action: 'cancel', text: '' });
          else if (a.action === 'redo') end({ action: 'redo', text: '' });
          else if (a.action === 'append') { ta.value = (ta.value.trim() + ' ' + a.text).trim(); note.textContent = T('Added. Now: ', 'Imeongezwa. Sasa: ') + ta.value; V.speak(ta.value).then(function () { if (V.getSettings().handsFree && ov.isConnected) ask(); }); }
          else if (a.action === 'replace') { ta.value = a.text; note.textContent = T('Changed. Now: ', 'Imebadilishwa. Sasa: ') + ta.value; V.speak(ta.value).then(function () { if (V.getSettings().handsFree && ov.isConnected) ask(); }); }
          else { note.textContent = T('Say: send, add …, change it to …, start again, or cancel.', 'Sema: tuma, ongeza …, badilisha iwe …, anza upya, au ghairi.'); V.speak(note.textContent); }
        });
      }
      bSend.focus();
      // Read it back (respects the "speak replies" setting). Voice answer only starts on its own in Hands-Free mode; otherwise the user taps Answer by voice.
      V.speak(T('Message to ', 'Ujumbe kwa ') + o.to + '. ' + o.text + '. ' + T('Say send, add, change it to, start again, or cancel.', 'Sema tuma, ongeza, badilisha iwe, anza upya, au ghairi.')).then(function () { if (vb && V.getSettings().handsFree && ov.isConnected) ask(); });
    });
  }

  /* ───────── global entry point: one mic for the whole app ───────── */
  var fab = null;
  // After the first spoken command works, offer Hands-Free ONCE so the user never has to tap the mic again (it shows its own consent dialog).
  function offerHandsFree() {
    try {
      var HF = root.NecpraHandsFree; if (!HF || HF.isOn() || V.getSettings().handsFree) return;
      if (root.localStorage.getItem('necpra_hf_offered')) return; root.localStorage.setItem('necpra_hf_offered', '1');
      setTimeout(function () { HF.enable(); }, 1200);
    } catch (_) {}
  }
  function openGlobal() {
    return capture({ mode: 'command', autoFinish: true, title: T('Speak to NECPRA', 'Ongea na NECPRA'), prompt: T('Say what you want to do. I finish by myself when you pause.', 'Sema unachotaka kufanya. Nitamaliza mwenyewe ukinyamaza.') })
      .then(function (r) {
        if (!r.ok || !r.transcript) return r;
        V.audit('voice.transcript', { module: 'global', outcome: 'captured', lang: r.lang, durationMs: r.durationMs, chars: r.transcript.length });
        return V.dispatch(r).then(function (d) {
          if (!d.handled) { var m = T('I heard you, but I could not match that to something I can do. You can say things like “open wallet”, “open chama”, “open duka” or “what can you do”.', 'Nimekusikia, lakini sijapata ninachoweza kufanya hapo. Unaweza kusema “fungua pochi”, “fungua chama”, “fungua duka” au “unaweza kufanya nini”.'); announce(m + ' ' + r.transcript); V.speak(m); }
          offerHandsFree();
          if (d.handled) offerHandsFree();
          return Object.assign({}, r, { handled: d.handled });
        });
      });
  }
  function mountFab(o) {
    o = o || {}; if (fab) return fab; fab = el('button', { class: 'nv-fab', type: 'button', style: (o.side === 'left' ? 'right:auto;left:16px;' : '') + (o.bottom ? 'bottom:' + o.bottom + ';' : ''), 'aria-label': T('Voice assistant. Activate to speak.', 'Msaidizi wa sauti. Bonyeza kuongea.') }, '🎤');
    fab.onclick = function () { openGlobal(); }; doc.body.appendChild(fab);
    // Keyboard / switch-access activation: Alt+V. (TalkBack and Voice Access can also tap the labelled button by name.)
    doc.addEventListener('keydown', function (e) { if (e.altKey && (e.key === 'v' || e.key === 'V') && !V.isListening()) { e.preventDefault(); openGlobal(); } });
    return fab;
  }
  function unmountFab() { if (fab) { fab.remove(); fab = null; } }

  root.NecpraVoiceUI = { capture: capture, dialog: dialog, choose: choose, confirmMessage: confirmMessage, openGlobal: openGlobal, mountFab: mountFab, unmountFab: unmountFab, announce: announce, T: T, el: el };
})(typeof window !== 'undefined' ? window : globalThis);
