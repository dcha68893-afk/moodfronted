/*! NECPRA Voice Composer (message.html). A microphone button in the message box plus the hooks Messenger voice uses.
 *  Voice never has its own send path: spoken words become TEXT in the same #composeInput a person types in, and sending
 *  is the same #sendBtn (so Confirm-before-send, typing indicators, E2E and offline queueing all behave identically). */
(function (root) {
  'use strict';
  var doc = root.document; if (!doc) return;
  function V() { return root.NecpraVoice; } function R() { return root.NecpraVoiceRemote; } function UI() { return root.NecpraVoiceUI; }
  function T(en, sw) { return UI() ? UI().T(en, sw) : en; }
  function box() { return doc.getElementById('composeInput'); }
  function sendBtn() { return doc.getElementById('sendBtn'); }
  function ready() { var b = box(); return !!(b && !b.disabled); }

  function insertText(text) {
    var b = box(); text = String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); if (!b || b.disabled || !text) return false;
    var cur = b.value, sep = cur && !/\s$/.test(cur) ? ' ' : '';
    if (!cur) text = text.charAt(0).toUpperCase() + text.slice(1);
    b.value = cur + sep + text;
    b.dispatchEvent(new Event('input', { bubbles: true })); // runs the page's own typing/auto-size listeners
    try { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } catch (_) {}
    return true;
  }
  function currentText() { var b = box(); return b ? b.value.trim() : ''; }
  function setText(t) { var b = box(); if (!b || b.disabled) return false; b.value = String(t == null ? '' : t); b.dispatchEvent(new Event('input', { bubbles: true })); return true; }
  function clear() { var b = box(); if (!b) return false; b.value = ''; b.dispatchEvent(new Event('input', { bubbles: true })); try { b.focus(); } catch (_) {} return true; }
  // Same pathway as tapping the send arrow.
  function sendNow() { var b = box(), s = sendBtn(); if (!b || !s || s.disabled || !b.value.trim()) return false; s.click(); return true; }
  // The chat panel renders a moment after openChat(); wait for a usable message box, then focus it so typing works immediately.
  function focusSoon(ms) {
    return new Promise(function (res) { var end = Date.now() + (ms || 5000); (function poll() { if (ready()) { try { box().focus(); } catch (_) {} return res(true); } if (Date.now() > end) return res(false); setTimeout(poll, 150); })(); });
  }

  var dictating = false;
  // Speak -> text -> into the message box. Never sends. Resolves {ok, text, cancelled, message}.
  function dictate(o) {
    o = o || {};
    if (dictating) return Promise.resolve({ ok: false, error: 'busy', message: V() ? V().message('busy') : '' });
    if (!R() || !ready()) return Promise.resolve({ ok: false, error: 'no-chat', message: T('Open a chat first.', 'Fungua mazungumzo kwanza.') });
    dictating = true; setMic(true);
    return R().capture({ mode: 'dictation', autoFinish: true, title: o.to ? T('Message to ', 'Ujumbe kwa ') + o.to : T('Message', 'Ujumbe'), prompt: T('Speak your message. It will appear in the message box; you can edit it before sending.', 'Sema ujumbe wako. Utaonekana kwenye kisanduku; unaweza kuuhariri kabla ya kutuma.') })
      .then(function (r) {
        dictating = false; setMic(false);
        if (!r || !r.ok || !r.transcript) return { ok: false, cancelled: !!(r && r.cancelled), message: r && r.message, transcript: r && r.transcript || '' };
        insertText(r.transcript); return { ok: true, text: r.transcript, uncertain: r.uncertain || [] };
      }, function () { dictating = false; setMic(false); return { ok: false, message: T('Voice failed.', 'Sauti imeshindwa.') }; });
  }

  var micEl = null;
  function setMic(on) { if (micEl) { micEl.setAttribute('aria-pressed', String(!!on)); micEl.style.background = on ? '#b91c1c' : ''; micEl.style.color = on ? '#fff' : ''; } }
  function mountMic() {
    var bar = doc.getElementById('composeBar'), send = sendBtn(); if (!bar || !send) return;
    var existing = doc.getElementById('nvMicBtn'); if (existing) { micEl = existing; return; }
    var ref = doc.getElementById('attachBtn') || send, b = doc.createElement('button');
    b.id = 'nvMicBtn'; b.type = 'button'; b.className = ref.className || ''; b.setAttribute('aria-label', T('Speak your message', 'Sema ujumbe wako')); b.title = T('Speak your message', 'Sema ujumbe wako'); b.setAttribute('aria-pressed', 'false');
    b.textContent = '🎤'; b.style.cssText = 'flex:none;border:0;background:transparent;font-size:20px;min-width:40px;min-height:40px;border-radius:50%;cursor:pointer;';
    b.addEventListener('click', function () { if (dictating) { try { V().finish('manual'); } catch (_) {} return; } dictate({}).then(function (r) { if (r.ok && V()) V().speak(T('Added. Tap send, or say send.', 'Imewekwa. Bonyeza tuma, au sema tuma.')); else if (r.message && !r.cancelled && V()) V().speak(r.message); }); });
    send.parentNode.insertBefore(b, send); micEl = b;
  }
  var mo = null, pending = 0;
  function watch() {
    if (mo || !root.MutationObserver) return;
    mo = new MutationObserver(function () { if (pending) return; pending = setTimeout(function () { pending = 0; try { mountMic(); } catch (_) {} }, 60); }); // the chat panel is re-rendered on every chat switch
    mo.observe(doc.body || doc.documentElement, { childList: true, subtree: true }); mountMic();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch); else watch();

  root.NecpraVoiceComposer = { insertText: insertText, currentText: currentText, setText: setText, clear: clear, sendNow: sendNow, focusSoon: focusSoon, dictate: dictate, isReady: ready, _mount: mountMic };
})(typeof window !== 'undefined' ? window : globalThis);
