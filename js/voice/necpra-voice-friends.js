/*! NECPRA Voice Friends (friend.html). Natural-language Friends actions on top of FriendsService.
 *  Rules: never guess between duplicate names, always ask before sending a request / declining / removing,
 *  never act without a match, and report failures honestly. Receives intents forwarded by the app shell (chat.html). */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents;
  if (!V || !UI || !R || !I) return;
  var T = UI.T, busy = false;

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function api() { return root.__kynFriendsVoice || null; }
  function svc() { return root.FriendsService || null; }
  function say(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }
  function ask(prompt) { return function () { return R.capture({ mode: 'command', prompt: prompt, spokenPrompt: prompt }).then(function (r) { return r && r.ok ? r.transcript : ''; }); }; }
  function label(u) { return clean(u.displayName || u.username || ((u.firstName || '') + ' ' + (u.lastName || ''))); }
  function asContacts(list) {
    return (list || []).map(function (u) {
      var nm = label(u), alt = [clean(u.username), clean((u.firstName || '') + ' ' + (u.lastName || ''))].filter(function (x) { return x && x !== nm; });
      return { id: u.id, name: nm, alt: alt, user: u };
    }).filter(function (c) { return c.name; });
  }
  function strip(n) { return clean(String(n || '').replace(/\b(please|now|tafadhali|sasa|as a friend|as my friend|kama rafiki|from friends|from my friends|kutoka kwa marafiki|request|ombi)\b/gi, ' ').replace(/^(?:the\s+)?(?:user|person|friend|contact|rafiki|mtumiaji)\s+/i, '').replace(/(?:'s|’s)$/i, '').replace(/[,.!?]+$/, '')); }

  /* ───────── understanding (pure) ───────── */
  var TABS = [
    ['groups', /\b(discover groups?|find groups?|groups? to join|public groups?|vikundi vya kujiunga)\b/],
    ['requests', /\b(?:friend |incoming |pending )?requests?\b(?! to| for| from)|\bmaombi(?: ya urafiki)?\b/],
    ['sent', /\b(sent requests?|outgoing requests?|requests? i sent|maombi niliyotuma|maombi yaliyotumwa)\b/],
    ['nearby', /\b(nearby|near me|people near|karibu nami|watu karibu)\b/],
    ['discover', /\b(discover|suggestions?|suggested|people you may know|browse (?:all )?(?:users|people)|gundua|pendekezo)\b/],
    ['friends', /\b(my friends|friends list|all friends|marafiki wangu|orodha ya marafiki)\b/]
  ];
  var TAB_LABEL = { friends: ['Friends', 'Marafiki'], discover: ['Discover', 'Gundua'], requests: ['Requests', 'Maombi'], sent: ['Sent requests', 'Maombi yaliyotumwa'], groups: ['Discover Groups', 'Gundua Vikundi'], nearby: ['Nearby', 'Karibu'] };

  function parse(input) {
    var s = clean(input).replace(/[.!?,]+$/, ''), n = I.norm(s), m;
    s = s.replace(/^(?:(?:hey|hi|ok|okay|so|now)\s+)?(?:please\s+|tafadhali\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:please\s+)?(?:i\s+(?:want|wanna|need|would like)\s+to\s+|let me\s+|nataka\s+|naomba\s+)?/i, '');
    n = I.norm(s);
    if ((m = /^(?:accept|approve|kubali|kubalia)\s+(?:(?:the\s+)?(?:friend\s+)?(?:request|ombi)\s+(?:from|ya|kutoka kwa)\s+)?(.+)$/i.exec(s)) && !/^(?:all|yote|zote)$/i.test(m[1])) return { type: 'accept', name: strip(m[1]) };
    if ((m = /^(?:decline|reject|deny|kataa|kataa ombi la)\s+(?:(?:the\s+)?(?:friend\s+)?(?:request|ombi)\s+(?:from|ya|kutoka kwa)\s+)?(.+)$/i.exec(s))) return { type: 'decline', name: strip(m[1]) };
    if ((m = /^(?:cancel|withdraw|ghairi|futa)\s+(?:my\s+|the\s+)?(?:friend\s+)?(?:request|ombi)\s+(?:to|for|kwa|la)\s+(.+)$/i.exec(s))) return { type: 'cancel', name: strip(m[1]) };
    if ((m = /^(?:remove|unfriend|delete|ondoa|futa)\s+(.+?)(?:\s+(?:from\s+(?:my\s+)?friends?|kutoka kwa marafiki|kwenye marafiki))?$/i.exec(s)) && !/\b(request|ombi|message|ujumbe|chat|group|kikundi)\b/i.test(m[1])) return { type: 'remove', name: strip(m[1]) };
    if ((m = /^(?:send\s+(?:a\s+)?friend\s+request\s+to|send\s+(?:a\s+)?request\s+to|add|befriend|ongeza|mtumie\s+ombi\s+la\s+urafiki|tuma\s+ombi\s+la\s+urafiki\s+kwa)\s+(.+?)(?:\s+as\s+(?:a\s+|my\s+)?friend)?$/i.exec(s)) && !/\b(group|kikundi|contact list|number)\b/i.test(m[1])) return { type: 'add', name: strip(m[1]) };
    if ((m = /^(?:search(?:\s+for)?|find|look\s*up|look for|tafuta|nitafutie)\s+(?:a\s+|the\s+)?(?:person\s+|user\s+|friend\s+|people\s+)?(?:named\s+|called\s+)?(.+)$/i.exec(s)) && !/\b(chat|conversation|mazungumzo|group|vikundi|message)\b/i.test(m[1])) return { type: 'search', query: strip(m[1]) };
    if (/^(?:how many|nina|idadi ya)\b.*\b(friends?|marafiki|requests?|maombi)\b/.test(n)) return { type: 'count', what: /request|maombi/.test(n) ? 'requests' : 'friends' };
    if ((m = /^(?:read|list|who are|who is in|soma|orodhesha|nisomee)\s+(?:out\s+)?(?:my\s+|all\s+|the\s+)?(?:(?:new|pending|incoming)\s+)?(friends?|requests?|marafiki|maombi)(?:\s+list)?$/.exec(n))) return { type: 'read', what: /request|maombi/.test(m[1]) ? 'requests' : 'friends' };
    if (/^(?:refresh|reload|update|onyesha upya|sasisha)(?:\s+(?:friends|the list|list|marafiki))?$/.test(n)) return { type: 'refresh' };
    var nav = /^(?:open|go to|show|show me|switch to|take me to|see|view|fungua|nionyeshe|nenda kwa|nipeleke)\s+(?:my\s+|the\s+|all\s+)?(.+)$/.exec(n);
    if (nav && nav[1].split(' ').length <= 5) for (var i = 0; i < TABS.length; i++) if (TABS[i][1].test(nav[1])) return { type: 'tab', tab: TABS[i][0] };
    if (n.split(' ').length <= 3) for (var j = 0; j < TABS.length; j++) if (TABS[j][1].test(n) && !/\b(chat|message|ujumbe)\b/.test(n)) return { type: 'tab', tab: TABS[j][0] };
    return null;
  }

  /* ───────── helpers over the Friends screen state ───────── */
  async function load(tab, query) { var a = api(); if (a) await a.go(tab, query); }
  function pool(tab) { var a = api(), st = a && a.state(); if (!st) return []; return tab === 'requests' ? st.incoming : tab === 'sent' ? st.outgoing : tab === 'discover' ? st.discover : st.friends; }
  async function pick(matches, title) {
    if (matches.length === 1) return matches[0];
    var idx = await UI.choose({ title: title, options: matches.slice(0, 5).map(function (c) { return { label: c.name, sub: c.user && c.user.username ? '@' + c.user.username : '' }; }), voiceAnswer: ask(T('Say the number or the full name.', 'Sema namba au jina kamili.')) });
    return idx >= 0 ? matches[idx] : null;
  }
  async function confirmYes(title, yes) {
    var idx = await UI.choose({ title: title, options: [{ label: yes }], voiceAnswer: ask(T('Say yes to confirm, or cancel.', 'Sema ndiyo kuthibitisha, au ghairi.')) });
    return idx === 0;
  }
  async function find(name, tab, notFoundEn, notFoundSw) {
    var all = asContacts(pool(tab)), variants = I.nameVariants(name), hit = null;
    for (var i = 0; i < variants.length && !hit; i++) { var r = I.matchContacts(variants[i], all); if (r.matches.length) hit = r; }
    if (!hit) { await say(notFoundEn.replace('{n}', name), notFoundSw.replace('{n}', name)); return null; }
    return pick(hit.matches, T('Which ' + name + '?', name + ' yupi?'));
  }
  function fail(e) { return say('That did not work: ' + ((e && e.message) || 'unknown error') + '.', 'Haikufanikiwa: ' + ((e && e.message) || 'hitilafu') + '.'); }

  /* ───────── actions ───────── */
  async function run(p, lang) {
    var S = svc(); if (!api() || !S) return false;
    var meta = { module: 'friends', lang: lang };
    if (p.type === 'tab') { await load(p.tab); V.audit('friends.tab', Object.assign({ outcome: 'executed' }, meta)); var l = TAB_LABEL[p.tab];
      if (p.tab === 'nearby') return say('Opening Nearby. Tap Enable Nearby to allow location.', 'Inafungua Karibu. Bonyeza Washa Karibu kuruhusu eneo.'), true;
      return say('Showing ' + l[0] + '.', 'Inaonyesha ' + l[1] + '.'), true; }
    if (p.type === 'refresh') { await load(api().state().tab); await say('Updated.', 'Imesasishwa.'); return true; }
    if (p.type === 'search') {
      if (!p.query) return false; var box = root.document.getElementById('search'); if (box) box.value = p.query;
      await load('discover', p.query); var n = pool('discover').length; V.audit('friends.search', Object.assign({ outcome: 'executed' }, meta));
      await say(n ? 'Found ' + n + (n === 1 ? ' person' : ' people') + ' for ' + p.query + '.' : 'No one found for ' + p.query + '.', n ? 'Nimepata watu ' + n + ' kwa ' + p.query + '.' : 'Hakuna aliyepatikana kwa ' + p.query + '.'); return true;
    }
    if (p.type === 'count' || p.type === 'read') {
      await load(p.what === 'requests' ? 'requests' : 'friends'); var list = asContacts(pool(p.what === 'requests' ? 'requests' : 'friends')), c = list.length;
      if (p.type === 'count') { await say('You have ' + c + (p.what === 'requests' ? ' pending friend request' : ' friend') + (c === 1 ? '.' : 's.'), 'Una ' + (p.what === 'requests' ? 'maombi ' : 'marafiki ') + c + '.'); return true; }
      if (!c) { await say(p.what === 'requests' ? 'You have no pending requests.' : 'You have no friends yet.', p.what === 'requests' ? 'Huna maombi yanayosubiri.' : 'Bado huna marafiki.'); return true; }
      var names = list.slice(0, 10).map(function (x) { return x.name; }).join(', '); await say(names + (c > 10 ? ', and ' + (c - 10) + ' more.' : '.'), names + (c > 10 ? ', na wengine ' + (c - 10) + '.' : '.')); return true;
    }
    if (p.type === 'add') {
      if (!p.name) return false; await load('discover', p.name);
      var u = await find(p.name, 'discover', 'I could not find "{n}" to add. Nothing was sent.', 'Sikumpata "{n}" kumwongeza. Hakuna kilichotumwa.'); if (!u) return true;
      var rel = u.user.relationship || {};
      if (rel.status === 'accepted') { await say(u.name + ' is already your friend.', u.name + ' tayari ni rafiki yako.'); return true; }
      if (rel.status === 'pending') { await say('There is already a pending request with ' + u.name + '.', 'Tayari kuna ombi linalosubiri na ' + u.name + '.'); return true; }
      if (!(await confirmYes(T('Send a friend request to ', 'Tuma ombi la urafiki kwa ') + u.name + '?', T('Yes, send', 'Ndiyo, tuma')))) { await say('Cancelled. Nothing was sent.', 'Imeghairiwa. Hakuna kilichotumwa.'); return true; }
      try { await S.send(u.id); V.audit('friends.add', Object.assign({ outcome: 'executed' }, meta)); await say('Friend request sent to ' + u.name + '.', 'Ombi la urafiki limetumwa kwa ' + u.name + '.'); } catch (e) { V.audit('friends.add', Object.assign({ outcome: 'error' }, meta)); await fail(e); }
      return true;
    }
    if (p.type === 'accept' || p.type === 'decline') {
      if (!p.name) return false; await load('requests');
      var r = await find(p.name, 'requests', 'I could not find a request from "{n}".', 'Sikupata ombi kutoka kwa "{n}".'); if (!r) return true; var id = r.user.relationship && r.user.relationship.requestId;
      if (!id) { await say('That request cannot be changed right now.', 'Ombi hilo haliwezi kubadilishwa sasa.'); return true; }
      if (p.type === 'decline' && !(await confirmYes(T('Decline the request from ', 'Kataa ombi kutoka kwa ') + r.name + '?', T('Yes, decline', 'Ndiyo, kataa')))) { await say('Cancelled.', 'Imeghairiwa.'); return true; }
      try { if (p.type === 'accept') await S.accept(id); else await S.reject(id); V.audit('friends.' + p.type, Object.assign({ outcome: 'executed' }, meta)); await say(p.type === 'accept' ? r.name + ' is now your friend.' : 'Declined the request from ' + r.name + '.', p.type === 'accept' ? r.name + ' sasa ni rafiki yako.' : 'Umekataa ombi la ' + r.name + '.'); } catch (e) { V.audit('friends.' + p.type, Object.assign({ outcome: 'error' }, meta)); await fail(e); }
      return true;
    }
    if (p.type === 'cancel') {
      if (!p.name) return false; await load('sent');
      var o = await find(p.name, 'sent', 'I could not find a sent request to "{n}".', 'Sikupata ombi lililotumwa kwa "{n}".'); if (!o) return true; var oid = o.user.relationship && o.user.relationship.requestId; if (!oid) return true;
      try { await S.cancel(oid); V.audit('friends.cancel', Object.assign({ outcome: 'executed' }, meta)); await say('Request to ' + o.name + ' cancelled.', 'Ombi kwa ' + o.name + ' limeghairiwa.'); } catch (e) { await fail(e); }
      return true;
    }
    if (p.type === 'remove') {
      if (!p.name) return false; await load('friends');
      var f = await find(p.name, 'friends', 'I could not find "{n}" in your friends. Nobody was removed.', 'Sikumpata "{n}" kwenye marafiki zako. Hakuna aliyeondolewa.'); if (!f) return true;
      if (!(await confirmYes(T('Remove ', 'Ondoa ') + f.name + T(' from your friends?', ' kwenye marafiki zako?'), T('Yes, remove', 'Ndiyo, ondoa')))) { await say('Cancelled. ' + f.name + ' is still your friend.', 'Imeghairiwa. ' + f.name + ' bado ni rafiki yako.'); return true; }
      try { await S.remove(f.id); V.audit('friends.remove', Object.assign({ outcome: 'executed' }, meta)); await say(f.name + ' was removed from your friends.', f.name + ' ameondolewa kwenye marafiki zako.'); } catch (e) { V.audit('friends.remove', Object.assign({ outcome: 'error' }, meta)); await fail(e); }
      return true;
    }
    return false;
  }

  // Intent from the shell (or the local engine when friend.html is opened on its own). Returns true only if it handled the words.
  function onIntent(payload) {
    if (!payload || payload.mode === 'probe') return false;                 // the shell's contact look-up belongs to Messenger
    var p = parse(payload.transcript); if (!p) return false;
    if (busy) return say('One moment, still working on the last request.', 'Subiri kidogo, bado nashughulikia ombi lililopita.').then(function () { return true; });
    busy = true;
    return run(p, payload.lang).then(function (ok) { busy = false; return ok; }, function (e) { busy = false; return fail(e).then(function () { return true; }); });
  }

  function init() { R.onIntent(onIntent); return true; }
  root.NecpraVoiceFriends = { init: init, parse: parse, _onIntent: onIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceFriends;
})(typeof window !== 'undefined' ? window : globalThis);
