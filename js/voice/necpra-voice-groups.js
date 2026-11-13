/*! NECPRA Voice Groups (group.html). Open a group, read recent messages, send a message, search, members, start "create group".
 *  Rules: a message is never sent without an on-screen confirmation, duplicate group names are never guessed, group messages are only
 *  read aloud when the person asked, and failures are reported honestly. Works on top of the page's own functions (E2E, offline queue). */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents;
  if (!V || !UI || !R || !I) return;
  var T = UI.T, doc = root.document, busy = false, lastSent = null;
  var PLACEHOLDER = /^(decrypting…|decrypting\.\.\.|🔒 encrypted message|🔒 unable to decrypt this message)$/i;

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function H() { return root.__kynGroupsVoice || null; }
  function say(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }
  function ask(prompt) { return function () { return R.capture({ mode: 'command', prompt: prompt, spokenPrompt: prompt }).then(function (r) { return r && r.ok ? r.transcript : ''; }); }; }
  function gname(g) { return clean(g && (g.name || g.groupName)); }
  function groups() { var h = H(); return h ? h.state().groups.map(function (g) { return { id: g.id, name: gname(g), g: g }; }).filter(function (x) { return x.name; }) : []; }
  function strip(n) { return clean(String(n || '').replace(/\b(please|now|tafadhali|sasa|the|group|chat|kikundi|kundi)\b/gi, ' ').replace(/[,.!?]+$/, '')); }
  function sender(m) { var s = m.sender || m.user || {}; return clean(s.displayName || s.username || m.senderName || m.username || ''); }
  function textOf(m) { var t = clean(m.content != null ? m.content : m.displayContent); return !t || PLACEHOLDER.test(t) ? '' : t; }

  /* ───────── understanding (pure) ───────── */
  function parse(input) {
    var s = clean(input).replace(/[.!?,]+$/, ''), n = I.norm(s), m;
    s = s.replace(/^(?:(?:hey|hi|ok|okay|so|now)\s+)?(?:please\s+|tafadhali\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:please\s+)?(?:i\s+(?:want|wanna|need|would like)\s+to\s+|let me\s+|nataka\s+|naomba\s+)?/i, ''); n = I.norm(s);
    if ((m = /^(?:create|make|start|new|unda|anzisha)\s+(?:a\s+|new\s+)*(?:group|kikundi)(?:\s+(?:called|named|iitwayo))?\s*(.*)$/i.exec(s))) return { type: 'create', name: strip(m[1]) };
    if ((m = /^(?:open|go to|show|fungua|nenda kwa|take me to|nipeleke)\s+(?:to\s+)?(?:the\s+|my\s+)?(?:group|kikundi)\s+(?:chat\s+)?(.+)$/i.exec(s)) && !/^(?:list|s|settings|info)$/i.test(m[1])) return { type: 'open', name: strip(m[1]) };
    if ((m = /^(?:open|go to|fungua|nenda kwa)\s+(?:the\s+|my\s+)?(.+?)\s+(?:group|kikundi)$/i.exec(s))) return { type: 'open', name: strip(m[1]) };
    if ((m = /^(?:read|soma|nisomee)\s+(?:out\s+)?(?:(?:me\s+)?(?:the\s+|my\s+)?(?:last|latest|recent|new|mpya|za mwisho)\s+)?(?:(\d+|one|two|three|five|ten)\s+)?(?:group\s+)?(?:messages?|ujumbe|texts?)(?:\s+(?:here|in this group|kwenye kikundi hiki))?$/i.exec(s))) return { type: 'read', count: ({ one: 1, two: 2, three: 3, five: 5, ten: 10 })[String(m[1] || '').toLowerCase()] || Number(m[1]) || 5 };
    if ((m = /^(?:search|find|look for|tafuta)\s+(?:for\s+)?(.+?)\s+(?:in|within|kwenye|ndani ya)\s+(?:this\s+|the\s+)?(?:group|chat|kikundi)(?:\s+.*)?$/i.exec(s))) return { type: 'search', query: clean(m[1]) };
    if ((m = /^(?:search|find|tafuta)\s+(?:this\s+group\s+)?(?:for\s+)?(?:messages?\s+(?:about|with|containing)\s+)?(.+)$/i.exec(s)) && /\b(this group|in here|messages? (?:about|with|containing))\b/i.test(s)) return { type: 'search', query: clean(m[1].replace(/\b(in here|in this group)\b/i, '')) };
    if (/^(?:show|open|list|who(?:'s| is| are) in|nionyeshe|orodhesha)\s+(?:the\s+)?(?:group\s+)?members?(?:\s+list)?$/.test(n) || /^(?:who is in (?:this )?group|wanachama)$/.test(n)) return { type: 'members' };
    if (/^(?:how many members|wanachama wangapi|idadi ya wanachama)$/.test(n)) return { type: 'member-count' };
    if ((m = /^(?:send|post|write|tuma|andika)\s+(?:a\s+)?(?:message\s+|ujumbe\s+)?(?:to\s+|kwa\s+)?(?:the\s+)?(?:group|kikundi)\s+(.+?)\s+(?:saying|that|kwamba|:)\s*(.+)$/i.exec(s))) return { type: 'send', name: strip(m[1]), text: clean(m[2]) };
    if ((m = /^(?:tell|message|send|mwambie|tuma ujumbe kwa)\s+(?:the\s+)?(.+?)\s+(?:group|kikundi)\s+(?:saying\s+|that\s+|kwamba\s+)?(.+)$/i.exec(s))) return { type: 'send', name: strip(m[1]), text: clean(m[2]) };
    if ((m = /^(?:tell|message|send|post|mwambie)\s+(?:the\s+)?(?:group|everyone|everybody|wote|kikundi)\s+(?:saying\s+|that\s+|kwamba\s+)?(.+)$/i.exec(s))) return { type: 'send', name: '', text: clean(m[1]) };
    if (/^(?:send|post|write|tuma|andika)\s+(?:a\s+)?(?:message|ujumbe)(?:\s+to\s+(?:the\s+)?group)?$/.test(n)) return { type: 'send', name: '', text: '' };
    if (/^(?:close|leave|exit|funga)\s+(?:this\s+)?(?:group|chat|kikundi)$/.test(n)) return { type: 'close' };
    if (/^(?:refresh|reload|update|sasisha)(?:\s+(?:groups|the list))?$/.test(n)) return { type: 'refresh' };
    return null;
  }

  /* ───────── helpers ───────── */
  async function pick(matches, title) {
    if (matches.length === 1) return matches[0];
    var idx = await UI.choose({ title: title, options: matches.slice(0, 5).map(function (c) { return { label: c.name, sub: (c.g.participantCount || (c.g.participants && c.g.participants.length) || '') + ' ' + T('members', 'wanachama') }; }), voiceAnswer: ask(T('Say the number or the full name.', 'Sema namba au jina kamili.')) });
    return idx >= 0 ? matches[idx] : null;
  }
  async function findGroup(name) {
    var all = groups(), vs = I.nameVariants(name), hit = null;
    for (var i = 0; i < vs.length && !hit; i++) { var r = I.matchContacts(vs[i], all); if (r.matches.length) hit = r; }
    if (!hit) { await say('I could not find a group called "' + name + '".', 'Sikupata kikundi kiitwacho "' + name + '".'); return null; }
    return pick(hit.matches, T('Which group?', 'Kikundi kipi?'));
  }
  async function waitFor(fn, ms) { var end = Date.now() + (ms || 4000); while (Date.now() < end) { var v = fn(); if (v) return v; await new Promise(function (r) { setTimeout(r, 150); }); } return null; }
  function current() { var h = H(); return h && h.state().current; }
  async function openByName(name) {
    var h = H(); var g = await findGroup(name); if (!g) return null;
    h.open(g.id); var ok = await waitFor(function () { var c = current(); return c && String(c.id) === String(g.id); }, 4000);
    if (!ok) { await say('I could not open ' + g.name + '.', 'Sikuweza kufungua ' + g.name + '.'); return null; }
    return g;
  }

  async function sendFlow(groupName, text) {
    var h = H(), g = null;
    if (groupName) { g = await openByName(groupName); if (!g) return true; }
    var c = current(); if (!c) { await say('Open a group first, or say the group name.', 'Fungua kikundi kwanza, au sema jina la kikundi.'); return true; }
    var gn = gname(c) || (g && g.name) || T('this group', 'kikundi hiki');
    for (var round = 0; round < 8; round++) {
      if (!text) {
        var r = await R.capture({ mode: 'dictation', title: T('Message to ', 'Ujumbe kwa ') + gn, prompt: T('What would you like to tell ' + gn + '?', 'Unataka kuwaambia ' + gn + ' nini?') });
        if (!r || r.cancelled || !r.transcript) { if (r && r.message && !r.cancelled) await say(r.message, r.message); return true; }
        text = clean(r.transcript);
      }
      var d = await UI.confirmMessage({ to: gn, text: text, voiceAnswer: ask(T('Say send, add, change it to, start again, or cancel.', 'Sema tuma, ongeza, badilisha iwe, anza upya, au ghairi.')) });
      if (d.action === 'cancel') { V.audit('groups.send', { module: 'groups', outcome: 'cancelled' }); await say('Cancelled. Nothing was sent.', 'Imeghairiwa. Hakuna kilichotumwa.'); return true; }
      if (d.action === 'redo') { text = ''; continue; }
      if (d.action === 'append') { var more = await R.capture({ mode: 'dictation', title: T('Add to the message', 'Ongeza kwenye ujumbe'), prompt: T('What should I add?', 'Niongeze nini?') }); text = clean(d.text + ' ' + (more && more.transcript || '')); continue; }
      var finalText = clean(d.text); if (!finalText) { await say('The message is empty. Nothing was sent.', 'Ujumbe ni mtupu. Hakuna kilichotumwa.'); return true; }
      var key = c.id + '|' + finalText; if (lastSent && lastSent.key === key && Date.now() - lastSent.t < 8000) { await say('That exact message was just sent.', 'Ujumbe huo huo umetumwa sasa hivi.'); return true; }
      lastSent = { key: key, t: Date.now() };
      try { await h.send(finalText, 'text', null); V.audit('groups.send', { module: 'groups', outcome: 'executed', chars: finalText.length }); await say('Message sent to ' + gn + '.', 'Ujumbe umetumwa kwa ' + gn + '.'); }
      catch (e) { lastSent = null; V.audit('groups.send', { module: 'groups', outcome: 'error', chars: finalText.length }); var box = doc.getElementById('input'); if (box && !box.value) box.value = finalText; await say('The message was NOT sent: ' + ((e && e.message) || 'unknown error') + '. Your text is kept in the message box.', 'Ujumbe HAUKUTUMWA: ' + ((e && e.message) || 'hitilafu') + '. Maneno yako yamehifadhiwa kwenye kisanduku.'); }
      return true;
    }
    return true;
  }

  async function run(p, lang) {
    var h = H(); if (!h) return false;
    if (p.type === 'refresh') { await h.loadGroups(); await say('Groups updated.', 'Vikundi vimesasishwa.'); return true; }
    if (p.type === 'create') {
      var b = doc.getElementById('createGroupBtn'); if (!b) return false; b.click();
      var nm = await waitFor(function () { return doc.getElementById('gname'); }, 2000); if (nm && p.name) { nm.value = p.name; nm.dispatchEvent(new Event('input', { bubbles: true })); }
      V.audit('groups.create', { module: 'groups', outcome: 'opened', lang: lang });
      await say(p.name ? 'Creating "' + p.name + '". Choose the members, then tap Create.' : 'Name the group and choose the members, then tap Create.', p.name ? 'Kuunda "' + p.name + '". Chagua wanachama, kisha bonyeza Unda.' : 'Taja kikundi na uchague wanachama, kisha bonyeza Unda.'); return true;
    }
    if (p.type === 'open') { if (!p.name) return false; var g = await openByName(p.name); if (g) { V.audit('groups.open', { module: 'groups', outcome: 'executed', lang: lang }); await say('Opened ' + g.name + '.', 'Imefungua ' + g.name + '.'); } return true; }
    if (p.type === 'close') { if (!current()) { await say('No group is open.', 'Hakuna kikundi kilichofunguliwa.'); return true; } h.close(); await say('Closed.', 'Imefungwa.'); return true; }
    if (p.type === 'send') return sendFlow(p.name, p.text);
    var c = current();
    if (!c) { await say('Open a group first. Say "open group" and its name.', 'Fungua kikundi kwanza. Sema "fungua kikundi" na jina lake.'); return true; }
    if (p.type === 'read') {
      await h.reload(); await new Promise(function (r) { setTimeout(r, 400); });
      var msgs = h.state().messages.filter(function (m) { return !m._optimistic && textOf(m); }).slice(-p.count);
      if (!msgs.length) { await say('There are no readable messages yet. If they are still decrypting, try again in a moment.', 'Hakuna ujumbe unaoweza kusomwa bado. Kama bado unafunguliwa, jaribu tena baadaye.'); return true; }
      var out = msgs.map(function (m) { var who = sender(m); return (who ? who + ': ' : '') + textOf(m); }).join('. '); V.audit('groups.read', { module: 'groups', outcome: 'executed', lang: lang }); UI.announce(out); await V.speak(out, { force: true }); return true;
    }
    if (p.type === 'search') {
      var tg = doc.getElementById('searchToggle'), bar = doc.getElementById('searchBar'), inp = doc.getElementById('searchInput'); if (!tg || !inp) return false;
      if (bar && bar.classList.contains('hidden')) tg.click();
      inp.value = p.query; inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(function (r) { setTimeout(r, 1200); });
      var res = doc.getElementById('searchResults'), hits = res ? Array.prototype.filter.call(res.children, function (x) { return !/searching|no results|open a group/i.test(x.textContent || '') && (x.textContent || '').trim(); }).length : 0;
      await say(hits ? 'Found ' + hits + (hits === 1 ? ' message' : ' messages') + ' for ' + p.query + '.' : 'No messages found for ' + p.query + ' in this group.', hits ? 'Nimepata ujumbe ' + hits + ' kwa ' + p.query + '.' : 'Hakuna ujumbe uliopatikana kwa ' + p.query + ' kwenye kikundi hiki.'); return true;
    }
    if (p.type === 'members') { h.members(); await say('Showing members.', 'Inaonyesha wanachama.'); return true; }
    if (p.type === 'member-count') { var k = Number(c.participantCount != null ? c.participantCount : (c.participants && c.participants.length) || 0); await say(gname(c) + ' has ' + k + ' members.', gname(c) + ' ina wanachama ' + k + '.'); return true; }
    return false;
  }

  function onIntent(payload) {
    if (!payload || payload.mode === 'probe') return false;
    var p = parse(payload.transcript); if (!p) return false;
    if (busy) return say('One moment, still working on the last request.', 'Subiri kidogo, bado nashughulikia ombi lililopita.').then(function () { return true; });
    busy = true;
    return run(p, payload.lang).then(function (ok) { busy = false; return ok; }, function (e) { busy = false; return say('That did not work: ' + ((e && e.message) || 'unknown error') + '.', 'Haikufanikiwa: ' + ((e && e.message) || 'hitilafu') + '.').then(function () { return true; }); });
  }

  function init() { R.onIntent(onIntent); return true; }
  root.NecpraVoiceGroups = { init: init, parse: parse, _onIntent: onIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceGroups;
})(typeof window !== 'undefined' ? window : globalThis);
