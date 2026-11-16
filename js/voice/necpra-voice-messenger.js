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

  async function doSend(contact, text, replyToId) {
    var key = contact.id + '|' + text + '|' + (replyToId || '');
    if (lastSent && lastSent.key === key && Date.now() - lastSent.t < 8000) { await say('That exact message was just sent.', 'Ujumbe huo huo umetumwa sasa hivi.'); return true; } // duplicate guard
    lastSent = { key: key, t: Date.now() };
    var res;
    try { res = await Promise.race([cfg.MM.sendMessage(replyToId ? { chatId: contact.id, content: text, replyToId: replyToId } : { chatId: contact.id, content: text }), new Promise(function (r) { setTimeout(function () { r({ timeout: true }); }, 20000); })]); }
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
  async function compose(contact, text, note, replyToId) {
    try { await cfg.MM.openChat({ conversationId: Number(contact.id) }); } catch (_) {}
    for (var round = 0; round < 8; round++) {
      if (!text) {
        var r = await R.capture({ mode: 'dictation', title: T('Message to ', 'Ujumbe kwa ') + contact.name, prompt: T('What would you like to tell ' + contact.name + '?', 'Unataka kumwambia ' + contact.name + ' nini?') });
        if (!r || r.cancelled || !r.transcript) { V.audit('messenger.send', { module: 'messenger', outcome: 'cancelled' }); if (r && r.message && !r.cancelled) await say(r.message, r.message); return false; }
        text = clean(r.transcript); note = (r.uncertain && r.uncertain.length) ? T('Some words were unclear, please check: “' + r.uncertain.join('”, “') + '”', 'Maneno mengine hayakueleweka, tafadhali angalia: “' + r.uncertain.join('”, “') + '”') : note;
      }
      var a = await UI.confirmMessage({ to: contact.name, text: text, note: note, voiceAnswer: ask(T('Say send, add, change it to, start again, or cancel.', 'Sema tuma, ongeza, badilisha iwe, anza upya, au ghairi.')) });
      note = '';
      if (a.action === 'send') { if (!a.text) { text = ''; continue; } return doSend(contact, a.text, replyToId); }
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
    if (!(await allowReadAloud(true))) { V.audit('messenger.read', { module: 'messenger', outcome: 'declined' }); return say('Okay, I will not read your messages aloud. You can read them on the screen.', 'Sawa, sitasoma ujumbe wako kwa sauti. Unaweza kuusoma kwenye skrini.'); }
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

  /* ───────── Per-message actions by voice: star / unstar, reply, forward, edit, delete a SINGLE message ─────────
   * Uses the same MessageModule calls as the bubble menu in message.html (starMessage, editMessage, deleteMessage, sendMessage with replyToId).
   * Rules: locked chats are never touched; the message text is shown on screen but never spoken by these flows; reply, forward, edit and
   * delete always ask first; editing and "delete for everyone" are only offered for YOUR OWN messages; errors are reported, never hidden. */
  var MSGWORD = /\b(messages?|msgs?|texts?|ujumbe|meseji)\b/i;
  function parseSelector(t) {
    var n = ' ' + String(t || '').toLowerCase() + ' ', sel = { own: null, from: '', q: '' }, m;
    if (/\b(my|mine|i sent|i wrote|yangu|wangu|nilio(?:tuma|andika)|nilituma)\b/.test(n)) sel.own = true;
    else if (/\b(their|his|her|theirs|they sent|he sent|she sent|wake|yake|aliyotuma|alinitumia)\b/.test(n)) sel.own = false;
    if ((m = /\b(?:from|by)\s+(.+?)(?:\s+(?:saying|about|containing|that says)\b.*)?$/i.exec(t)) && !/^(?:me|myself)$/i.test(clean(m[1]))) { sel.from = clean(m[1].replace(/^(?:the\s+)/i, '')); sel.own = false; }
    else if ((m = /\bkutoka\s+kwa\s+(.+?)(?:\s+(?:kuhusu|inayosema)\b.*)?$/i.exec(t))) { sel.from = clean(m[1]); sel.own = false; }
    if ((m = /\b(?:about|containing|that says|which says|with the words|that mentions|mentioning|kuhusu|inayosema|yenye maneno)\s+(.+)$/i.exec(t))) sel.q = clean(m[1].replace(/^["“']|["”']$/g, '').replace(/^(?:the|a|an)\s+/i, ''));
    return sel;
  }
  function parseMsgAction(input) {
    var s = clean(input).replace(/[.!?,]+$/, '');
    s = s.replace(/^(?:(?:hey|hi|ok|okay|so|now)\s+)?(?:please\s+|tafadhali\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:please\s+)?(?:i\s+(?:want|wanna|need|would like)\s+to\s+|let me\s+|nataka\s+|naomba\s+)?/i, '');
    if (!MSGWORD.test(s)) return null;
    var n = s.toLowerCase(), verb = null, m, rest = '', payload = '', to = '';
    if (/^(?:unstar|remove (?:the |a )?star|take (?:the )?star off|ondoa nyota)\b/.test(n)) { verb = 'unstar'; rest = s.replace(/^(?:unstar|remove (?:the |a )?star(?: from| on| off)?|take (?:the )?star off|ondoa nyota(?: kwenye| kwa)?)\s*/i, ''); }
    else if (/^(?:star|add (?:a )?star|put (?:a )?star|weka nyota)\b/.test(n)) { verb = 'star'; rest = s.replace(/^(?:star|add (?:a )?star(?: to| on)?|put (?:a )?star(?: on| to)?|weka nyota(?: kwenye| kwa)?)\s*/i, ''); }
    else if (/^(?:forward|sambaza|peleka mbele)\b/.test(n)) {
      verb = 'forward'; rest = s.replace(/^(?:forward|sambaza|peleka mbele)\s*/i, '');
      if ((m = /^(.*?)\s+(?:to|kwa)\s+(.+)$/i.exec(rest))) { rest = m[1]; to = clean(m[2]); }
    }
    else if (/^(?:reply to|respond to|answer|jibu)\b/.test(n)) {
      verb = 'reply'; rest = s.replace(/^(?:reply to|respond to|answer|jibu)\s*/i, '');
      if ((m = /^(.*?)\s*(?:,|\b(?:saying|and say|and tell (?:him|her|them)|with|kwamba|na useme))\s+(.+)$/i.exec(rest)) && m[2]) { rest = m[1]; payload = clean(m[2]); }
    }
    else if (/^(?:edit|change|correct|fix|badilisha|hariri|rekebisha)\b/.test(n)) {
      verb = 'edit'; rest = s.replace(/^(?:edit|change|correct|fix|badilisha|hariri|rekebisha)\s*/i, '');
      if ((m = /^(.*?)\s+(?:to say|to read|to|into|saying|kuwa|iwe)\s+(.+)$/i.exec(rest)) && m[2]) { rest = m[1]; payload = clean(m[2].replace(/^["“']|["”']$/g, '')); }
    }
    else if (/^(?:delete|erase|remove|futa|ondoa)\b/.test(n)) { verb = 'delete'; rest = s.replace(/^(?:delete|erase|remove|futa|ondoa)\s*/i, ''); }
    if (!verb) return null;
    // the rest must really talk about one message ("the last message", "my message about the rent"), not a chat or a person
    if (!MSGWORD.test(rest) && verb !== 'reply') return null;
    if (MSGWORD.test(rest) === false && verb === 'reply' && !MSGWORD.test(s)) return null;
    // "delete all messages" / "delete messages with Denis" are NOT single-message commands: leave them to the chat actions and say nothing here.
    if (/\ball\b|\bevery\b|\bmessages\b|\bzote\b|\bjumbe zote\b/i.test(rest) && !/\blast|latest|mwisho\b/i.test(rest)) return null;
    var sel = parseSelector(rest);
    return { verb: verb, sel: sel, payload: payload, to: to };
  }

  function msgText(m) { var t = clean(m && m.displayContent); if (PLACEHOLDER.test(t)) return ''; if (t) return t; var a = m && m.metadata && m.metadata.attachment; return a ? '📎 ' + (a.originalName || a.name || T('Attachment', 'Kiambatisho')) : ''; }
  function chronological(list) {
    var arr = list.slice(); var ok = arr.every(function (m) { return m && m.createdAt; });
    if (ok) arr.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    return arr;
  }
  function usable(m) { return m && m.id != null && typeof m.id !== 'undefined' && !m._optimistic && m.status !== 'sending' && m.status !== 'failed' && !m.deleted && !m.isDeleted && msgText(m); }
  async function msgChat(sel) {
    var list = contacts();
    if (sel.from) {
      var f = findMatches(I.nameVariants(sel.from), list);
      if (f) { var who = await pickOne(f.matches, T('Which ' + sel.from + '?', sel.from + ' yupi?')); if (!who) return null; try { await cfg.MM.openChat({ conversationId: Number(who.id) }); } catch (_) {} return who; }
      var a1 = cfg.MM.getActiveChatId(), cur1 = list.filter(function (x) { return String(x.id) === String(a1); })[0];
      if (cur1 && I.matchContacts(sel.from, [cur1]).matches.length) return cur1;
      await say('I could not find a chat with \"' + sel.from + '\". Nothing was changed.', 'Sikumpata mazungumzo na \"' + sel.from + '\". Hakuna kilichobadilishwa.'); return null;
    }
    var act = cfg.MM.getActiveChatId(), cur = list.filter(function (x) { return String(x.id) === String(act); })[0];
    if (cur) return cur;
    if (act != null && cfg.isLocked(act)) { await say('That chat is locked, so I cannot act on its messages. Unlock it in the app first.', 'Mazungumzo hayo yamefungwa kwa kufuli, siwezi kushughulikia ujumbe wake. Yafungue kwenye programu kwanza.'); return null; }
    await say('Open the chat first, or say it with a name, for example: star my last message to Denis.', 'Fungua mazungumzo kwanza, au sema pamoja na jina, mfano: weka nyota ujumbe wangu wa mwisho kwa Denis.'); return null;
  }
  async function pickMessage(sel, chat, verb) {
    var me = root._kynCurrentUserId, all = chronological((cfg.MM.getMessages ? cfg.MM.getMessages(chat.id) : []) || []).filter(usable);
    if (sel.own === true) all = all.filter(function (m) { return String(m.senderId) === String(me); });
    else if (sel.own === false) all = all.filter(function (m) { return String(m.senderId) !== String(me); });
    if ((verb === 'edit') && sel.own === null) all = all.filter(function (m) { return String(m.senderId) === String(me); });   // only your own messages can be edited
    if (sel.q) { var q = sel.q.toLowerCase(); all = all.filter(function (m) { return msgText(m).toLowerCase().indexOf(q) >= 0; }); }
    if (!all.length) { await say(sel.q ? 'I could not find a message about \"' + sel.q + '\" in this chat.' : 'I could not find that message in this chat.', sel.q ? 'Sikupata ujumbe kuhusu \"' + sel.q + '\" kwenye mazungumzo haya.' : 'Sikupata ujumbe huo kwenye mazungumzo haya.'); return null; }
    if (!sel.q || all.length === 1) return all[all.length - 1];
    var cands = all.slice(-4).reverse();
    var idx = await UI.choose({ title: T('Which message?', 'Ujumbe upi?'), options: cands.map(function (m) { return { label: msgText(m).slice(0, 70), sub: String(m.senderId) === String(me) ? T('You', 'Wewe') : chat.name }; }), voiceAnswer: ask(T('Say the number.', 'Sema namba.')) });
    return idx >= 0 ? cands[idx] : null;
  }
  function failed(res) { return res && (res.success === false || res.ok === false || res.error); }
  function errText(res) { return clean((res && (res.error && (res.error.message || res.error) || res.message)) || ''); }

  async function messageAction(p) {
    if (typeof cfg.MM.getMessages !== 'function') { await say('That is not available on this screen yet.', 'Hilo bado halipatikani kwenye skrini hii.'); return; }
    var chat = await msgChat(p.sel); if (!chat) return;
    if (cfg.isLocked(chat.id)) { await say('That chat is locked, so I cannot act on its messages.', 'Mazungumzo hayo yamefungwa kwa kufuli, siwezi kushughulikia ujumbe wake.'); return; }
    var m = await pickMessage(p.sel, chat, p.verb); if (!m) return;
    var me = root._kynCurrentUserId, mine = String(m.senderId) === String(me), shown = msgText(m).slice(0, 140), id = m.id, mm = cfg.MM, res, aud = 'messenger.msg_' + p.verb;
    function done(en, sw) { V.audit(aud, { module: 'messenger', outcome: 'executed' }); return say(en, sw); }
    function fail(res2) { V.audit(aud, { module: 'messenger', outcome: 'error' }); return say('That did not work' + (errText(res2) ? ': ' + errText(res2) : '') + '. Nothing was changed.', 'Haikufanikiwa' + (errText(res2) ? ': ' + errText(res2) : '') + '. Hakuna kilichobadilishwa.'); }
    function cancelled() { V.audit(aud, { module: 'messenger', outcome: 'cancelled' }); return say('Cancelled. Nothing was changed.', 'Imeghairiwa. Hakuna kilichobadilishwa.'); }

    if (p.verb === 'star' || p.verb === 'unstar') {
      if (p.verb === 'star' && m.starred) return say('That message is already starred.', 'Ujumbe huo tayari una nyota.');
      if (p.verb === 'unstar' && !m.starred) return say('That message is not starred.', 'Ujumbe huo hauna nyota.');
      try { res = p.verb === 'star' ? await mm.starMessage(chat.id, id) : await mm.unstarMessage(chat.id, id); } catch (e) { res = { ok: false, error: e && e.message }; }
      if (failed(res)) return fail(res);
      return done(p.verb === 'star' ? 'Starred.' : 'Star removed.', p.verb === 'star' ? 'Imewekwa nyota.' : 'Nyota imeondolewa.');
    }
    if (p.verb === 'delete') {
      var opts = [{ label: T('Delete for me', 'Futa kwangu') }]; if (mine) opts.push({ label: T('Delete for everyone', 'Futa kwa wote') });
      var di = await UI.choose({ title: T('Delete this message? “' + shown + '”', 'Futa ujumbe huu? “' + shown + '”') + (mine ? T(' “Delete for everyone” removes it for them too.', ' “Futa kwa wote” unauondoa kwao pia.') : ''), options: opts, voiceAnswer: ask(T(mine ? 'Say delete for me, delete for everyone, or cancel.' : 'Say yes to delete it for you, or cancel.', mine ? 'Sema futa kwangu, futa kwa wote, au ghairi.' : 'Sema ndiyo kuifuta kwako, au ghairi.')) });
      if (di < 0) return cancelled();
      try { res = await mm.deleteMessage(chat.id, id, { forEveryone: mine && di === 1 }); } catch (e) { res = { ok: false, error: e && e.message }; }
      if (failed(res)) return fail(res);
      return done(mine && di === 1 ? 'Deleted for everyone.' : 'Deleted for you.', mine && di === 1 ? 'Imefutwa kwa wote.' : 'Imefutwa kwako.');
    }
    if (p.verb === 'edit') {
      if (!mine) return say('You can only edit your own messages.', 'Unaweza kuhariri ujumbe wako mwenyewe tu.');
      if (m.metadata && m.metadata.attachment && !clean(m.displayContent)) return say('That message is a file, so there is no text to edit.', 'Ujumbe huo ni faili, hakuna maandishi ya kuhariri.');
      var nt = p.payload;
      for (var r0 = 0; r0 < 4; r0++) {
        if (!nt) { var cr = await R.capture({ mode: 'dictation', title: T('Edit message', 'Hariri ujumbe'), prompt: T('What should the message say now?', 'Ujumbe usomeke nini sasa?') }); if (!cr || cr.cancelled || !cr.transcript) return cancelled(); nt = clean(cr.transcript); }
        var ei = await UI.choose({ title: T('Change “' + shown + '” to “' + nt.slice(0, 140) + '”?', 'Badilisha “' + shown + '” kuwa “' + nt.slice(0, 140) + '”?'), options: [{ label: T('Yes, change it', 'Ndiyo, badilisha') }, { label: T('Say it again', 'Sema tena') }], voiceAnswer: ask(T('Say yes to change it, say it again, or cancel.', 'Sema ndiyo kubadilisha, sema tena, au ghairi.')) });
        if (ei === 1) { nt = ''; continue; } if (ei !== 0) return cancelled();
        try { res = await mm.editMessage(chat.id, id, nt); } catch (e) { res = { ok: false, error: e && e.message }; }
        if (failed(res)) return fail(res); return done('The message was changed.', 'Ujumbe umebadilishwa.');
      }
      return cancelled();
    }
    if (p.verb === 'reply') {
      V.audit(aud, { module: 'messenger', outcome: 'started' });
      await compose(chat, p.payload, T('Replying to: “' + shown.slice(0, 80) + '”', 'Unajibu: “' + shown.slice(0, 80) + '”'), id); return;
    }
    if (p.verb === 'forward') {
      var all = await allContacts(), nm = p.to;
      if (!nm) { var sp = await ask(T('Who should I forward it to? Say the name.', 'Nimpelekee nani? Sema jina.'))(); if (!sp) return cancelled(); nm = clean(sp); }
      var hit = findMatches(I.nameVariants(nm), all); if (!hit) return say('I could not find \"' + nm + '\" in your chats or friends. Nothing was forwarded.', 'Sikumpata \"' + nm + '\" kwenye mazungumzo au marafiki zako. Hakuna kilichopelekwa.');
      var target = await pickOne(hit.matches, T('Which ' + nm + '?', nm + ' yupi?')); if (!target) return cancelled();
      if (String(target.id) === String(chat.id)) return say('That message is already in this chat.', 'Ujumbe huo tayari upo kwenye mazungumzo haya.');
      var fi = await UI.choose({ title: T('Forward “' + shown + '” to ' + target.name + '?', 'Pelekea ' + target.name + ' “' + shown + '”?'), options: [{ label: T('Yes, forward', 'Ndiyo, peleka') }], voiceAnswer: ask(T('Say yes to forward, or cancel.', 'Sema ndiyo kupeleka, au ghairi.')) });
      if (fi !== 0) return cancelled();
      var payload = { receiverId: target.userId, content: clean(m.displayContent) || '', attachment: (m.metadata && m.metadata.attachment) || null };
      try { res = await mm.sendMessage(payload); } catch (e) { res = { ok: false, error: e && e.message }; }
      if (failed(res)) { V.audit(aud, { module: 'messenger', outcome: 'error' }); return say('The message was NOT forwarded' + (errText(res) ? ': ' + errText(res) : '') + '.', 'Ujumbe HAUKUPELEKWA' + (errText(res) ? ': ' + errText(res) : '') + '.'); }
      return done('Forwarded to ' + target.name + '.', 'Umepelekwa kwa ' + target.name + '.');
    }
  }

  /* ───────── Read-aloud privacy gate ─────────
   * Private text is read out loud only when it is safe: never from locked chats, never while the mic is listening, and (unless the person
   * turned it off) only when headphones are detected. If the app cannot tell where the sound goes, it assumes the speaker and stays quiet
   * for automatic reading; for a spoken "read my messages" it asks once first. */
  async function allowReadAloud(explicit) {
    var s = V.getSettings(); if (s.readHeadphonesOnly === false) return true;
    var priv = V.privateAudio ? await V.privateAudio() : null; if (priv === true) return true;
    if (!explicit) return false;
    var i = await UI.choose({ title: T(priv === false ? 'No headphones found. Reading messages aloud on the speaker lets others hear them.' : 'I cannot tell if headphones are connected. Reading messages aloud on the speaker lets others hear them.', priv === false ? 'Hakuna vipokea sauti. Kusoma ujumbe kwa sauti kwenye spika kunaweza kuwasikizisha wengine.' : 'Siwezi kujua kama vipokea sauti vimeunganishwa. Kusoma ujumbe kwa sauti kwenye spika kunaweza kuwasikizisha wengine.'), options: [{ label: T('Read aloud anyway', 'Soma kwa sauti hata hivyo') }], voiceAnswer: ask(T('Say yes to read aloud, or cancel.', 'Sema ndiyo kusoma kwa sauti, au ghairi.')) });
    return i === 0;
  }

  // Right after the app opens, the chat list may still be loading. Matching a spoken name against an empty list made "open chat with Denis" miss, so wait a few seconds for it.
  function waitConvs(ms) { return new Promise(function (res) { var end = Date.now() + ms; (function poll() { var n = 0; try { n = cfg.MM.getConversations().length; } catch (_) {} if (n || Date.now() > end) return res(); setTimeout(poll, 150); })(); }); }
  async function handle(payload) {
    var probe = payload && payload.mode === 'probe', text = payload.transcript;
    var list = contacts();
    var ma = !probe ? parseMsgAction(text) : null;   // one message: star / reply / forward / edit / delete (checked before whole-chat actions)
    if (ma) {
      if (busy) { await say('I am still working on your last request.', 'Bado nashughulikia ombi lako la awali.'); return true; }
      busy = true; try { await messageAction(ma); } catch (e) { await say('That did not work: ' + ((e && e.message) || 'unknown error') + '. Nothing was changed.', 'Haikufanikiwa: ' + ((e && e.message) || 'hitilafu') + '. Hakuna kilichobadilishwa.'); } finally { busy = false; }
      return true;
    }
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
        allowReadAloud(false).then(function (ok) { if (ok && !V.isListening()) V.speak(T('New message from ', 'Ujumbe mpya kutoka kwa ') + (cv ? name(cv) : T('someone', 'mtu')) + ': ' + txt, { sensitive: true }); });
      } catch (_) {}
    });
    return true;
  }
  root.NecpraVoiceMessenger = { init: init, _handle: handle, _chatAction: chatAction, parseMsgAction: parseMsgAction };
})(typeof window !== 'undefined' ? window : globalThis);
