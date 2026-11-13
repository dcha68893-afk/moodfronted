/*! NECPRA Voice Messenger (message.html). Natural-language messaging on top of the existing MessageModule.
 *  Rules: never guess between duplicate names, never send without an on-screen confirmation, never open locked chats,
 *  never read private text aloud unless the user asked or enabled it, and report failures honestly. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents; if (!V || !UI || !R || !I) return;
  var T = UI.T, cfg = null, busy = false, lastSent = null, spokenIn = {};
  var PLACEHOLDER = /^(decrypting…|decrypting\.\.\.|🔒 encrypted message|🔒 unable to decrypt this message)$/i;
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function name(c) { return clean(c.otherUser && (c.otherUser.username || c.otherUser.name)); }
  function contacts() {
    return cfg.MM.getConversations().filter(function (c) { return c && c.chatId != null && c.otherUser && name(c) && !cfg.isLocked(c.chatId); })
      .map(function (c) { return { id: c.chatId, name: name(c), conv: c }; });
  }
  function previewOf(c) { var t = cfg.getPreview ? cfg.getPreview(c.lastMessage, c.chatId) : (c.lastMessage && c.lastMessage.displayContent); t = clean(t); return !t || PLACEHOLDER.test(t) ? '' : t; }
  function say(en, sw, force) { var m = T(en, sw); UI.announce(m); return V.speak(m, { force: !!force }); }
  function ask(prompt, spoken) { return function () { return R.capture({ mode: 'command', prompt: prompt, spokenPrompt: spoken || prompt }).then(function (r) { return r && r.ok ? r.transcript : ''; }); }; }

  async function pickOne(matches, title) {
    if (matches.length === 1) return matches[0];
    var idx = await UI.choose({ title: title, options: matches.map(function (m) { return { label: m.name, sub: previewOf(m.conv).slice(0, 40) }; }), voiceAnswer: ask(T('Say the number or the full name.', 'Sema namba au jina kamili.')) });
    return idx >= 0 ? matches[idx] : null;
  }
  async function resolveRecipient(rc, list) {
    if (rc.pronoun) {
      var active = cfg.MM.getActiveChatId(), c = list.filter(function (x) { return String(x.id) === String(active); })[0];
      if (c) return { contact: c };
      var spoken = await ask(T('Who is it for? Say the name.', 'Ni kwa nani? Sema jina.'))(); if (!spoken) return null;
      rc = I.splitRecipient(clean(spoken).split(' '), list);
    }
    if (!rc.matches.length) { await say('I could not find "' + rc.name + '" in your conversations. Nothing was sent.', 'Sikumpata "' + rc.name + '" kwenye mazungumzo yako. Hakuna kilichotumwa.'); return null; }
    var who = await pickOne(rc.matches, T('Which ' + rc.name + '?', rc.name + ' yupi?')); if (!who) return null;
    return { contact: who, fuzzy: rc.fuzzy ? rc.name : null };
  }

  async function doSend(contact, text) {
    var key = contact.id + '|' + text;
    if (lastSent && lastSent.key === key && Date.now() - lastSent.t < 8000) { await say('That exact message was just sent.', 'Ujumbe huo huo umetumwa sasa hivi.'); return true; } // duplicate guard
    lastSent = { key: key, t: Date.now() };
    var res;
    try { res = await Promise.race([cfg.MM.sendMessage({ chatId: contact.id, content: text }), new Promise(function (r) { setTimeout(function () { r({ timeout: true }); }, 20000); })]); }
    catch (e) { res = { success: false, error: e && e.message }; }
    if (res && res.timeout) { V.audit('messenger.send', { module: 'messenger', outcome: 'executed', chars: text.length }); await say('Still sending to ' + contact.name + '. Check the chat for its delivery status.', 'Bado inatuma kwa ' + contact.name + '. Angalia mazungumzo kuona hali.'); return true; }
    if (res && res.success === false) {
      lastSent = null; V.audit('messenger.send', { module: 'messenger', outcome: 'error', chars: text.length });
      var box = root.document && root.document.getElementById('composeInput'); if (box && !box.value) box.value = text; // keep the words so nothing is lost
      await say('The message to ' + contact.name + ' was NOT sent: ' + (res.error || 'unknown error') + '. Your text is kept in the message box.', 'Ujumbe kwa ' + contact.name + ' HAUKUTUMWA: ' + (res.error || 'hitilafu') + '. Maneno yako yamehifadhiwa kwenye kisanduku.');
      return false;
    }
    V.audit('messenger.send', { module: 'messenger', outcome: 'executed', chars: text.length });
    await say('Message sent to ' + contact.name + '.', 'Ujumbe umetumwa kwa ' + contact.name + '.'); return true;
  }

  // capture -> read back -> corrections -> explicit confirmation -> send
  async function compose(contact, text, note) {
    try { await cfg.MM.openChat({ conversationId: Number(contact.id) }); } catch (_) {}
    for (var round = 0; round < 8; round++) {
      if (!text) {
        var r = await R.capture({ mode: 'dictation', title: T('Message to ', 'Ujumbe kwa ') + contact.name, prompt: T('What would you like to tell ' + contact.name + '?', 'Unataka kumwambia ' + contact.name + ' nini?') });
        if (!r || r.cancelled || !r.transcript) { V.audit('messenger.send', { module: 'messenger', outcome: 'cancelled' }); if (r && r.message && !r.cancelled) await say(r.message, r.message); return false; }
        text = clean(r.transcript); note = (r.uncertain && r.uncertain.length) ? T('Some words were unclear, please check: “' + r.uncertain.join('”, “') + '”', 'Maneno mengine hayakueleweka, tafadhali angalia: “' + r.uncertain.join('”, “') + '”') : note;
      }
      var a = await UI.confirmMessage({ to: contact.name, text: text, note: note, voiceAnswer: ask(T('Say send, add, change it to, start again, or cancel.', 'Sema tuma, ongeza, badilisha iwe, anza upya, au ghairi.')) });
      note = '';
      if (a.action === 'send') { if (!a.text) { text = ''; continue; } return doSend(contact, a.text); }
      if (a.action === 'cancel') { V.audit('messenger.send', { module: 'messenger', outcome: 'cancelled' }); await say('Cancelled. Nothing was sent.', 'Imeghairiwa. Hakuna kilichotumwa.'); return false; }
      if (a.action === 'redo') { text = ''; continue; }
      if (a.action === 'append') {
        var more = await R.capture({ mode: 'dictation', title: T('Add to message', 'Ongeza kwenye ujumbe'), prompt: T('What should I add?', 'Niongeze nini?') });
        text = clean(a.text + ' ' + (more && more.transcript || '')); continue;
      }
    }
    return false;
  }

  async function read(from, list) {
    var conv = cfg.MM.getConversations().filter(function (c) { return c && c.otherUser && !cfg.isLocked(c.chatId); }), items;
    function ts(c) { return new Date(c.lastMessage && c.lastMessage.createdAt || 0).getTime(); }
    if (from) { var m = I.matchContacts(from, conv.map(function (c) { return { id: c.chatId, name: name(c), conv: c }; })); if (!m.matches.length) return say('I could not find "' + from + '".', 'Sikumpata "' + from + '".'); items = m.matches.map(function (x) { return x.conv; }); }
    else items = conv.filter(function (c) { return c.unreadCount > 0; }).sort(function (a, b) { return ts(b) - ts(a); });
    if (!items.length) return say('You have no new messages.', 'Huna ujumbe mpya.');
    items = items.slice(0, 5); V.audit('messenger.read', { module: 'messenger', outcome: 'executed' });
    await say('You have ' + items.length + (items.length === 1 ? ' chat' : ' chats') + ' to read.', 'Una mazungumzo ' + items.length + ' ya kusoma.', true);
    for (var i = 0; i < items.length; i++) { var t = previewOf(items[i]); await V.speak(name(items[i]) + ': ' + (t || T('a message I cannot read yet', 'ujumbe ambao siwezi kusoma bado')), { force: true }); } // explicit request = permission to read aloud
    return true;
  }

  async function handle(payload) {
    var list = contacts(), it = I.parseMessengerIntent(payload.transcript, list); if (!it) return false;
    if (busy) { await say('I am still working on your last request.', 'Bado nashughulikia ombi lako la awali.'); return true; }
    busy = true;
    try {
      if (it.type === 'read') await read(it.from, list);
      else if (it.type === 'open' || it.type === 'search') {
        var m = I.matchContacts(it.name, list);
        if (!m.matches.length) await say('I could not find "' + it.name + '".', 'Sikumpata "' + it.name + '".');
        else { var who = await pickOne(m.matches, T('Which one?', 'Yupi?')); if (who) { await cfg.MM.openChat({ conversationId: Number(who.id) }); await say('Opened chat with ' + who.name + '.', 'Nimefungua mazungumzo na ' + who.name + '.'); } }
      } else if (it.type === 'reply') {
        var act = cfg.MM.getActiveChatId(), c = list.filter(function (x) { return String(x.id) === String(act); })[0] || list.filter(function (x) { return x.conv.unreadCount > 0; })[0];
        if (!c) await say('Which chat should I reply in? Open one first.', 'Nijibu kwenye mazungumzo gani? Fungua moja kwanza.'); else await compose(c, it.content, '');
      } else if (it.type === 'send') {
        var rr = await resolveRecipient(it.recipient, list);
        if (rr) await compose(rr.contact, it.content, (it.rewritten ? T('I changed wording like “she/ask her” to “you/please”. Edit if it is wrong. ', 'Nimebadilisha maneno kama “yeye” kuwa “wewe”. Hariri kama si sahihi. ') : '') + (rr.fuzzy ? T('I matched “' + rr.fuzzy + '” to ' + rr.contact.name + '. Check this is the right person.', 'Nimelinganisha “' + rr.fuzzy + '” na ' + rr.contact.name + '. Hakikisha ni mtu sahihi.') : ''));
      }
    } finally { busy = false; }
    return true;
  }

  function init(c) {
    cfg = Object.assign({ isLocked: function () { return false; } }, c);
    R.onIntent(handle);
    if (cfg.MM.subscribe) cfg.MM.subscribe(function (evt, d) { // optional: read new incoming messages aloud (off by default, needs both toggles)
      try {
        if (evt !== 'message:added' || !d || !d.message) return; var s = V.getSettings(); if (!s.readIncoming || !s.speakSensitive) return;
        var m = d.message, me = root._kynCurrentUserId; if (!me || String(m.senderId) === String(me) || m.status === 'sending' || cfg.isLocked(d.chatId) || V.isListening()) return;
        var id = String(m.id); if (spokenIn[id]) return; spokenIn[id] = 1; var txt = clean(m.displayContent); if (!txt || PLACEHOLDER.test(txt) || txt.length > 400) return;
        var cv = cfg.MM.getConversations().filter(function (x) { return String(x.chatId) === String(d.chatId); })[0];
        V.speak(T('New message from ', 'Ujumbe mpya kutoka kwa ') + (cv ? name(cv) : T('someone', 'mtu')) + ': ' + txt, { sensitive: true });
      } catch (_) {}
    });
    return true;
  }
  root.NecpraVoiceMessenger = { init: init, _handle: handle };
})(typeof window !== 'undefined' ? window : globalThis);
