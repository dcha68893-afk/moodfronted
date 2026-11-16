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

  function C() { return root.NecpraVoiceComposer; }
  // Conversations PLUS friends you have not chatted with yet (so "chat with Denis" works for a new friend too).
  async function allContacts() {
    var convs = contacts(), have = {}, lockedUsers = {};
    cfg.MM.getConversations().forEach(function (c) { if (c && c.otherUser && cfg.isLocked(c.chatId)) lockedUsers[String(c.otherUser.id)] = 1; });
    convs.forEach(function (c) { c.userId = c.conv.otherUser.id; if (c.userId != null) have[String(c.userId)] = 1; var u = clean(c.conv.otherUser.displayName); if (u && u !== c.name) c.alt = [u]; });
    var friends = []; try { if (typeof root.__kynVoiceFriends === 'function') friends = await root.__kynVoiceFriends(); } catch (_) {}
    var me = root._kynCurrentUserId, extra = (friends || []).filter(function (f) { return f && f.id != null && !have[String(f.id)] && !lockedUsers[String(f.id)] && String(f.id) !== String(me); })
      .map(function (f) { var nm = clean(f.displayName || f.username || ((f.firstName || '') + ' ' + (f.lastName || ''))); return { id: 'u' + f.id, userId: f.id, name: nm, alt: [clean(f.username), clean((f.firstName || '') + ' ' + (f.lastName || ''))].filter(function (x) { return x && x !== nm; }), friend: f }; })
      .filter(function (x) { return x.name; });
    return convs.concat(extra);
  }
  function findMatches(variants, all) { for (var i = 0; i < variants.length; i++) { var m = I.matchContacts(variants[i], all); if (m.matches.length) return { matches: m.matches, fuzzy: m.fuzzy, used: variants[i] }; } return null; }
  async function openContact(c) {
    if (c.conv) return cfg.MM.openChat({ conversationId: Number(c.id) });
    return cfg.MM.openChat({ userId: c.userId, userName: c.name, avatar: c.friend && c.friend.avatar || null });
  }
  function activeName() { var a = cfg.MM.getActiveChatId(), c = contacts().filter(function (x) { return String(x.id) === String(a); })[0]; return c ? c.name : ''; }

  async function pickOne(matches, title) {
    if (matches.length === 1) return matches[0];
    var idx = await UI.choose({ title: title, options: matches.map(function (m) { return { label: m.name, sub: m.conv ? previewOf(m.conv).slice(0, 40) : T('Friend', 'Rafiki') }; }), voiceAnswer: ask(T('Say the number or the full name.', 'Sema namba au jina kamili.')) });
    return idx >= 0 ? matches[idx] : null;
  }
  async function resolveRecipient(rc, list) {
    if (rc.pronoun || !rc.name) {
      var active = cfg.MM.getActiveChatId(), c = list.filter(function (x) { return String(x.id) === String(active); })[0];
      if (c) return { contact: c };
      var spoken = await ask(T('Who is it for? Say the name.', 'Ni kwa nani? Sema jina.'))(); if (!spoken) return null;
      rc = I.splitRecipient(clean(spoken).split(' '), list);
    }
    if (!rc.matches.length && rc.name) { var alt = findMatches(I.nameVariants(rc.name), list); if (alt) { rc = Object.assign({}, rc, { matches: alt.matches, fuzzy: alt.fuzzy }); } }
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


  // Speak -> text in the SAME message box a person types in. Never sends by itself.
  async function dictateFlow(name) {
    var c = C(); if (!c) { await say('Voice typing is not available here. You can type your message.', 'Kuandika kwa sauti hakupatikani hapa. Unaweza kuandika ujumbe.'); return; }
    var r = await c.dictate({ to: name });
    if (r.ok) { var unclear = r.uncertain && r.uncertain.length ? T(' Some words were unclear, please check the box.', ' Maneno mengine hayakueleweka, tafadhali angalia kisanduku.') : ''; await say('Added to the message box. Say send to send it, or type to edit it.' + unclear, 'Imewekwa kwenye kisanduku. Sema tuma kutuma, au andika kuhariri.'); }
    else if (r.message && !r.cancelled) await say(r.message, r.message);
  }
  // Voice "send" is explicit confirmation of the text that is visible in the box; the normal confirmation sheet still reads it back.
  async function sendComposer() {
    var c = C(); if (!c || !c.isReady()) { await say('Open a chat first. Say: chat with, then a name.', 'Fungua mazungumzo kwanza. Sema: ongea na, kisha jina.'); return; }
    var txt = c.currentText(); if (!txt) { await say('The message box is empty. Say write a message, or type one.', 'Kisanduku ni tupu. Sema andika ujumbe, au andika.'); return; }
    var nm = activeName() || T('this chat', 'mazungumzo haya'), a = await UI.confirmMessage({ to: nm, text: txt, voiceAnswer: ask(T('Say send, add, change it to, start again, or cancel.', 'Sema tuma, ongeza, badilisha iwe, anza upya, au ghairi.')) });
    if (a.action === 'send' && a.text) { c.setText(a.text); if (c.sendNow()) { V.audit('messenger.send', { module: 'messenger', outcome: 'executed', chars: a.text.length }); await say('Message sent.', 'Ujumbe umetumwa.'); } else await say('I could not send it. Your text is still in the box.', 'Sikuweza kutuma. Maneno yako bado yapo kwenye kisanduku.'); }
    else if (a.action === 'cancel') { await say('Cancelled. Nothing was sent. Your text is still in the box.', 'Imeghairiwa. Hakuna kilichotumwa. Maneno yako yapo kwenye kisanduku.'); }
    else if (a.action === 'redo') { c.clear(); await dictateFlow(nm); }
    else if (a.action === 'append') { c.setText(a.text); await dictateFlow(nm); }
  }
  async function composerCommand(cmd) {
    var c = C();
    if (cmd.type === 'send') return sendComposer();
    if (!c || !c.isReady()) { await say('Open a chat first. Say: chat with, then a name.', 'Fungua mazungumzo kwanza. Sema: ongea na, kisha jina.'); return; }
    if (cmd.type === 'clear') { c.clear(); await say('Cleared.', 'Imefutwa.'); return; }
    if (cmd.type === 'dictate') { if (cmd.text) { c.insertText(cmd.text); await say('Added. Say send, or keep typing.', 'Imewekwa. Sema tuma, au endelea kuandika.'); } else await dictateFlow(activeName()); }
  }
  async function openByVoice(it, all) {
    var f = findMatches(it.variants || [it.name], all);
    if (!f) { if (it.soft) return false; await say('I could not find \"' + it.name + '\" in your chats or friends.', 'Sikumpata \"' + it.name + '\" kwenye mazungumzo au marafiki zako.'); return true; }
    var who = await pickOne(f.matches, T('Which one?', 'Yupi?')); if (!who) return true;
    try { await openContact(who); } catch (e) { await say('I could not open the chat with ' + who.name + '.', 'Sikuweza kufungua mazungumzo na ' + who.name + '.'); return true; }
    var c = C(); if (c) await c.focusSoon();
    await say((f.fuzzy ? 'I matched \"' + f.used + '\" to ' + who.name + '. ' : '') + 'Chat with ' + who.name + ' is open. Type your message, or say write a message.', (f.fuzzy ? 'Nimelinganisha \"' + f.used + '\" na ' + who.name + '. ' : '') + 'Mazungumzo na ' + who.name + ' yamefunguliwa. Andika ujumbe wako, au sema andika ujumbe.');
    return true;
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

  /* Chat-list actions by voice (archive, mute, favourite, mark unread, delete chat, block). The real work is done by message.html's own code paths
   * (cfg.chatAction), so the result is exactly what the long-press menu does. Archive, delete and block always ask for a spoken or tapped yes first.
   * Locked chats are never touched (contacts() leaves them out). Failures are reported honestly, never as success. */
  var CA_ASK = { archive: 1, delete: 1, block: 1 };
  async function confirmAction(action, nm) {
    var q = {
      archive: [T('Archive the chat with ' + nm + '? This archives it for both of you.', 'Hifadhi mazungumzo na ' + nm + '? Hii inayahifadhi kwa nyote wawili.'), T('Yes, archive', 'Ndiyo, hifadhi')],
      delete: [T('Delete the chat with ' + nm + ' from your account? This cannot be undone. The other person keeps their copy.', 'Futa mazungumzo na ' + nm + ' kwenye akaunti yako? Haiwezi kurudishwa. Mwenzako anabaki na nakala yake.'), T('Yes, delete', 'Ndiyo, futa')],
      block: [T('Block ' + nm + '? They will not be able to message you.', 'Mzuie ' + nm + '? Hataweza kukutumia ujumbe.'), T('Yes, block', 'Ndiyo, mzuie')]
    }[action];
    var i = await UI.choose({ title: q[0], options: [{ label: q[1] }], voiceAnswer: ask(T('Say yes to confirm, or cancel.', 'Sema ndiyo kuthibitisha, au ghairi.')) });
    return i === 0;
  }
  var CA_DONE = {
    archive: ['Archived the chat with ', 'Nimehifadhi mazungumzo na '], mute: ['Muted ', 'Nimenyamazisha '], unmute: ['Unmuted ', 'Nimerudisha sauti ya '],
    fav: ['Added to favourites: ', 'Nimeweka kwenye vipendwa: '], unfav: ['Removed from favourites: ', 'Nimeondoa kwenye vipendwa: '], unread: ['Marked as unread: ', 'Nimeweka kama haijasomwa: '],
    delete: ['Deleted the chat with ', 'Nimefuta mazungumzo na '], block: ['Blocked ', 'Nimemzuia ']
  };
  var CA_NOOP = { mute: [' is already muted.', ' tayari amenyamazishwa.'], unmute: [' is not muted.', ' hajanyamazishwa.'], fav: [' is already in your favourites.', ' tayari yupo kwenye vipendwa.'], unfav: [' is not in your favourites.', ' hayupo kwenye vipendwa.'] };
  async function chatAction(ca) {
    if (typeof cfg.chatAction !== 'function') { await say('That is not available on this screen yet.', 'Hilo bado halipatikani kwenye skrini hii.'); return; }
    var list = contacts(); if (!list.length) { await waitConvs(8000); list = contacts(); }
    var target = null;
    if (!ca.name) {
      var act = cfg.MM.getActiveChatId(); target = list.filter(function (x) { return String(x.id) === String(act); })[0];
      if (!target) { await say('Which chat? Say it with a name, for example: mute Denis.', 'Mazungumzo gani? Sema pamoja na jina, mfano: nyamazisha Denis.'); return; }
    } else {
      var f = findMatches(ca.variants, list);
      if (!f) { await say('I could not find "' + ca.name + '" in your chats. Nothing was changed.', 'Sikumpata "' + ca.name + '" kwenye mazungumzo yako. Hakuna kilichobadilishwa.'); return; }
      target = await pickOne(f.matches, T('Which ' + ca.name + '?', ca.name + ' yupi?')); if (!target) return;
    }
    if (CA_ASK[ca.action] && !(await confirmAction(ca.action, target.name))) { V.audit('messenger.chat_action', { module: 'messenger', outcome: 'cancelled', action: ca.action }); await say('Cancelled. Nothing was changed.', 'Imeghairiwa. Hakuna kilichobadilishwa.'); return; }
    var res; try { res = await cfg.chatAction(ca.action, target.id); } catch (e) { res = { ok: false, error: e && e.message }; }
    if (res && res.ok) {
      V.audit('messenger.chat_action', { module: 'messenger', outcome: res.noop ? 'noop' : 'executed', action: ca.action });
      if (res.noop && CA_NOOP[ca.action]) { await say(target.name + CA_NOOP[ca.action][0], target.name + CA_NOOP[ca.action][1]); return; }
      var d = CA_DONE[ca.action]; await say(d[0] + target.name + '.', d[1] + target.name + '.'); return;
    }
    V.audit('messenger.chat_action', { module: 'messenger', outcome: 'error', action: ca.action });
    await say('That did not work' + (res && res.error ? ': ' + res.error : '') + '. Nothing was changed.', 'Haikufanikiwa' + (res && res.error ? ': ' + res.error : '') + '. Hakuna kilichobadilishwa.');
  }

  // Right after the app opens, the chat list may still be loading. Matching a spoken name against an empty list made "open chat with Denis" miss, so wait a few seconds for it.
  function waitConvs(ms) { return new Promise(function (res) { var end = Date.now() + ms; (function poll() { var n = 0; try { n = cfg.MM.getConversations().length; } catch (_) {} if (n || Date.now() > end) return res(); setTimeout(poll, 150); })(); }); }
  async function handle(payload) {
    var probe = payload && payload.mode === 'probe', text = payload.transcript;
    var list = contacts();
    var ca = (!probe && I.parseChatAction) ? I.parseChatAction(text) : null;   // archive / mute / favourite / unread / delete chat / block: checked first ("mute chat with Denis" must not be read as "chat with Denis")
    if (ca) {
      if (busy) { await say('I am still working on your last request.', 'Bado nashughulikia ombi lako la awali.'); return true; }
      busy = true; try { await chatAction(ca); } finally { busy = false; }
      return true;
    }
    var it = I.parseMessengerIntent(text, list) || I.parseOpenChat(text), cmd = it ? null : I.parseComposerCommand(text);
    if (!it && !cmd) return false;
    if (!list.length) { await waitConvs(probe ? 3000 : 8000); list = contacts(); it = I.parseMessengerIntent(text, list) || I.parseOpenChat(text); }
    if (probe) { if (!it || it.type !== 'open') return false; return !!findMatches(it.variants || [it.name], await allContacts()); } // lookup only: nothing is opened or spoken
    if (busy) { await say('I am still working on your last request.', 'Bado nashughulikia ombi lako la awali.'); return true; }
    busy = true;
    try {
      if (cmd) { await composerCommand(cmd); return true; }
      if (it.type === 'unread') {
        var cv = cfg.MM.getConversations().filter(function (c) { return c && c.otherUser && !cfg.isLocked(c.chatId) && c.unreadCount > 0; });
        if (!cv.length) await say('You have no unread messages.', 'Huna ujumbe ambao haujasomwa.');
        else { var tot = cv.reduce(function (n, c) { return n + Number(c.unreadCount || 0); }, 0), nm = cv.slice(0, 3).map(function (c) { return name(c); }).join(', ');
          await say('You have ' + tot + ' unread message' + (tot === 1 ? '' : 's') + ' in ' + cv.length + (cv.length === 1 ? ' chat' : ' chats') + ': ' + nm + '. Say read my messages to hear them.', 'Una ujumbe ' + tot + ' ambao haujasomwa kwenye mazungumzo ' + cv.length + ': ' + nm + '. Sema nisomee ujumbe kuvisikia.'); }
      } else if (it.type === 'read') await read(it.from, list);
      else if (it.type === 'open' || it.type === 'search') { var handled = await openByVoice(it, await allContacts()); if (handled === false) return false; }
      else if (it.type === 'reply') {
        var act = cfg.MM.getActiveChatId(), c = list.filter(function (x) { return String(x.id) === String(act); })[0] || list.filter(function (x) { return x.conv.unreadCount > 0; })[0];
        if (!c) await say('Which chat should I reply in? Open one first.', 'Nijibu kwenye mazungumzo gani? Fungua moja kwanza.'); else await compose(c, it.content, '');
      } else if (it.type === 'send') {
        var a0 = cfg.MM.getActiveChatId(), cm = C();
        if (!it.recipient.name && !it.recipient.pronoun && !it.content && a0 != null && !/^pending:/.test(String(a0)) && cm && cm.isReady()) { await dictateFlow(activeName()); return true; } // "write a message" inside an open chat: speak it into the message box
        var all = await allContacts(), rr = await resolveRecipient(it.recipient, all);
        if (rr && !rr.contact.conv) { // a friend with no chat yet: open the chat and use the normal message box (same pathway as typing)
          try { await openContact(rr.contact); } catch (e) { await say('I could not open the chat with ' + rr.contact.name + '.', 'Sikuweza kufungua mazungumzo na ' + rr.contact.name + '.'); return true; }
          var cc = C(); if (cc) await cc.focusSoon();
          if (it.content && cc && cc.insertText(it.content)) await say('Your message is in the box for ' + rr.contact.name + '. Say send to send it, or edit it first.', 'Ujumbe wako upo kwenye kisanduku cha ' + rr.contact.name + '. Sema tuma kutuma, au uhariri kwanza.');
          else await dictateFlow(rr.contact.name);
        } else if (rr) await compose(rr.contact, it.content, (it.rewritten ? T('I changed wording like “she/ask her” to “you/please”. Edit if it is wrong. ', 'Nimebadilisha maneno kama “yeye” kuwa “wewe”. Hariri kama si sahihi. ') : '') + (rr.fuzzy ? T('I matched “' + rr.fuzzy + '” to ' + rr.contact.name + '. Check this is the right person.', 'Nimelinganisha “' + rr.fuzzy + '” na ' + rr.contact.name + '. Hakikisha ni mtu sahihi.') : ''));
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
  root.NecpraVoiceMessenger = { init: init, _handle: handle, _chatAction: chatAction };
})(typeof window !== 'undefined' ? window : globalThis);
