/*! NECPRA Voice Status (status.html). Drives the Status screen through its own buttons, so every rule the screen already has
 *  (audience, 24h expiry, E2E replies, reporting) still applies. Posting, replying and deleting always ask for confirmation. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents;
  if (!V || !UI || !R || !I) return;
  var T = UI.T, doc = root.document, busy = false;

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function q(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function qa(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function say(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }
  function ask(prompt) { return function () { return R.capture({ mode: 'command', prompt: prompt, spokenPrompt: prompt }).then(function (r) { return r && r.ok ? r.transcript : ''; }); }; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms) { var end = Date.now() + (ms || 3000); while (Date.now() < end) { var v = fn(); if (v) return v; await sleep(120); } return null; }
  function click(el) { if (!el) return false; el.click(); return true; }
  function setVal(el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  function viewerOpen() { return !!q('[data-viewer] [data-react]'); }
  function vibesOpen() { return !!q('[data-vibes] [data-rclose]'); }
  function people() { return qa('.ns-person[data-user]').map(function (el) { var n = q('.ns-person-name', el); return { id: el.getAttribute('data-user'), name: clean(n && n.textContent), el: el }; }).filter(function (x) { return x.name; }); }
  async function confirmYes(title, yes) { var i = await UI.choose({ title: title, options: [{ label: yes }], voiceAnswer: ask(T('Say yes to confirm, or cancel.', 'Sema ndiyo kuthibitisha, au ghairi.')) }); return i === 0; }
  function toastText() { var t = q('.ns-toast'); return clean(t && t.textContent); }

  var EMOJI = { love: '❤️', heart: '❤️', like: '❤️', moyo: '❤️', laugh: '😂', funny: '😂', haha: '😂', cheka: '😂', fire: '🔥', moto: '🔥', 'heart eyes': '😍', wow: '😍', clap: '👏', applause: '👏', makofi: '👏', hundred: '💯' };

  function parse(input) {
    var s = clean(input).replace(/[.!?,]+$/, ''), n = I.norm(s), m;
    s = s.replace(/^(?:(?:hey|hi|ok|okay|so|now)\s+)?(?:please\s+|tafadhali\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:please\s+)?(?:i\s+(?:want|wanna|need|would like)\s+to\s+|let me\s+|nataka\s+|naomba\s+)?/i, ''); n = I.norm(s);
    if ((m = /^(?:post|share|add|put|weka|chapisha)\s+(?:a\s+|new\s+)*(?:status|moment|story|hali)\s*(?:saying|that|:|kwamba)?\s*(.*)$/i.exec(s)) || (m = /^(?:update|change|set|badilisha)\s+my\s+status\s+(?:to|kuwa)\s+(.+)$/i.exec(s))) return { type: 'post', text: clean(m[1]) };
    if (/^(?:new|create|add|start)\s+(?:a\s+)?(?:status|moment)$/.test(n)) return { type: 'post', text: '' };
    if ((m = /^(?:show|open|view|watch|play|see|fungua|nionyeshe|angalia)\s+(?:me\s+)?(.+?)(?:'s|s'|’s)?\s+(?:status|statuses|moment|moments|story|stories|hali)$/i.exec(s))) return { type: 'view', name: clean(m[1].replace(/^(?:the|my)\s+/i, '')) };
    if ((m = /^(?:show|open|view|watch|play|fungua|angalia)\s+(?:the\s+)?(?:status|moment|story|hali)\s+(?:of|from|ya|kutoka kwa)\s+(.+)$/i.exec(s))) return { type: 'view', name: clean(m[1]) };
    if (/^(?:next|next status|skip|inayofuata|mbele)$/.test(n)) return { type: 'next' };
    if (/^(?:previous|previous status|go back one|last status|iliyopita|nyuma kidogo)$/.test(n)) return { type: 'prev' };
    if (/^(?:close|exit|stop|funga|toka)(?:\s+(?:the\s+)?(?:status|viewer|vibes?|story|moment))?$/.test(n)) return { type: 'close' };
    if ((m = /^(?:react|respond|send)\s+(?:with\s+)?(?:a\s+)?(.+?)(?:\s+(?:reaction|emoji))?$/i.exec(s)) && EMOJI[I.norm(m[1])]) return { type: 'react', emoji: EMOJI[I.norm(m[1])] };
    if (/^(?:love|like|heart|penda|penda hii)(?:\s+(?:this|it|hii))?(?:\s+(?:status|vibe|moment))?$/.test(n)) return { type: 'react', emoji: '❤️' };
    if ((m = /^(?:reply|respond|jibu)(?:\s+(?:with|saying|kwamba))?\s+(.+)$/i.exec(s))) return { type: 'reply', text: clean(m[1]) };
    if (/^(?:delete|remove|futa)\s+(?:this|my|hii)\s*(?:status|moment|story|hali)?$/.test(n)) return { type: 'delete' };
    if (/^(?:open |go to |show |fungua )?(?:the )?(?:vibes?|vibu)$/.test(n)) return { type: 'vibes' };
    if ((m = /^(?:show|open|go to|switch to|fungua|nenda kwa)\s+(?:the\s+)?(for you|friends|public|following)\s+(?:vibes?|feed|tab)$/i.exec(s))) return { type: 'vibe-tab', tab: ({ 'for you': 'forYou' })[m[1].toLowerCase()] || m[1].toLowerCase() };
    if (/^(?:show|open|go to|switch to|fungua)\s+(?:the\s+)?(?:discover|gundua)(?:\s+(?:tab|statuses|moments))?$/.test(n)) return { type: 'tab', tab: 'discover' };
    if (/^(?:show|open|go to|switch to|fungua)\s+(?:my\s+|the\s+)?(?:friends?|marafiki)(?:\s+(?:tab|statuses|moments))?$/.test(n) && /status|moment|tab|hali/.test(n)) return { type: 'tab', tab: 'friends' };
    if (/^(?:browse|show|open)\s+(?:all\s+)?(?:moments|statuses)$/.test(n)) return { type: 'browse' };
    if ((m = /^(?:search|find|look for|tafuta)\s+(?:for\s+)?(?:statuses?\s+|moments?\s+)?(?:about\s+|with\s+|by\s+)?(.+)$/i.exec(s)) && !/\b(chat|group|friend|message|ujumbe)\b/i.test(m[1])) return { type: 'search', query: clean(m[1]) };
    if ((m = /^(?:show|filter(?: by)?|only|onyesha)\s+(?:only\s+)?(all|photos?|pictures?|videos?|text|polls?)(?:\s+(?:moments|statuses))?$/i.exec(s))) return { type: 'filter', kind: /photo|picture/i.test(m[1]) ? 'image' : /video/i.test(m[1]) ? 'video' : /poll/i.test(m[1]) ? 'poll' : /text/i.test(m[1]) ? 'text' : 'all' };
    if (/^(?:how many|nina)\b.*\b(statuses|moments|hali)\b/.test(n)) return { type: 'count' };
    if (/^(?:who(?:'s| has| posted)|nani).*\b(status|posted|moments?)\b/.test(n)) return { type: 'who' };
    return null;
  }

  async function run(p, lang) {
    var meta = { module: 'status', lang: lang };
    if (p.type === 'tab') { var tb = q('[data-tab="' + p.tab + '"]'); if (!tb) return false; tb.click(); await sleep(300); await say(p.tab === 'discover' ? 'Showing Discover.' : 'Showing friends statuses.', p.tab === 'discover' ? 'Inaonyesha Gundua.' : 'Inaonyesha hali za marafiki.'); return true; }
    if (p.type === 'browse') { if (!click(q('[data-browse]'))) return false; await say('Showing all moments.', 'Inaonyesha hali zote.'); return true; }
    if (p.type === 'vibes') { if (!click(q('[data-open-vibes]'))) return false; await say('Opening Vibes.', 'Inafungua Vibes.'); return true; }
    if (p.type === 'vibe-tab') { if (!vibesOpen()) click(q('[data-open-vibes]')); var vt = await waitFor(function () { return q('[data-vibe-tab="' + p.tab + '"]'); }, 3000); if (!vt) { await say('Vibes are not ready yet.', 'Vibes bado hazijawa tayari.'); return true; } vt.click(); await say('Showing ' + p.tab.replace('forYou', 'For You') + ' vibes.', 'Inaonyesha vibes.'); return true; }
    if (p.type === 'close') { var c = q('[data-vclose]') || q('[data-rclose]') || q('[data-cclose]') || q('[data-iclose]'); if (!click(c)) { await say('Nothing to close.', 'Hakuna cha kufunga.'); return true; } return true; }
    if (p.type === 'next' || p.type === 'prev') { var nb = q(p.type === 'next' ? '[data-next]' : '[data-prev]'); if (!viewerOpen() || !nb) { await say('Open a status first.', 'Fungua hali kwanza.'); return true; } nb.click(); return true; }
    if (p.type === 'search') { var si = q('.ns-search'); if (!si) return false; setVal(si, p.query); await sleep(600); var cards = qa('[data-feed] > *').length; await say(cards ? 'Showing results for ' + p.query + '.' : 'No moments found for ' + p.query + '.', cards ? 'Matokeo ya ' + p.query + '.' : 'Hakuna hali zilizopatikana kwa ' + p.query + '.'); return true; }
    if (p.type === 'filter') { var f = q('.ns-filter'); if (!f) return false; setVal(f, p.kind); await say('Filter applied.', 'Kichujio kimewekwa.'); return true; }
    if (p.type === 'count' || p.type === 'who') {
      var ps = people(); if (!ps.length) { await say('No statuses are showing right now.', 'Hakuna hali zinazoonekana sasa.'); return true; }
      if (p.type === 'count') { await say(ps.length + (ps.length === 1 ? ' person has' : ' people have') + ' a status.', 'Watu ' + ps.length + ' wana hali.'); return true; }
      var names = ps.slice(0, 8).map(function (x) { return x.name; }).join(', '); await say(names + (ps.length > 8 ? ', and ' + (ps.length - 8) + ' more.' : '.'), names + (ps.length > 8 ? ', na wengine ' + (ps.length - 8) + '.' : '.')); return true;
    }
    if (p.type === 'view') {
      if (!p.name) return false; var ps2 = people(), cs = ps2.map(function (x) { return { id: x.id, name: x.name, x: x }; }), vs = I.nameVariants(p.name), hit = null;
      for (var i = 0; i < vs.length && !hit; i++) { var r = I.matchContacts(vs[i], cs); if (r.matches.length) hit = r; }
      if (!hit) { await say('I could not find a status from ' + p.name + '.', 'Sikupata hali ya ' + p.name + '.'); return true; }
      var one = hit.matches[0];
      if (hit.matches.length > 1) { var idx = await UI.choose({ title: T('Which ' + p.name + '?', p.name + ' yupi?'), options: hit.matches.slice(0, 5).map(function (c) { return { label: c.name }; }), voiceAnswer: ask(T('Say the number or the full name.', 'Sema namba au jina kamili.')) }); if (idx < 0) return true; one = hit.matches[idx]; }
      one.x.el.click(); V.audit('status.view', Object.assign({ outcome: 'executed' }, meta)); return true;
    }
    if (p.type === 'post') {
      var open = q('[data-composer] [data-content]'); if (!open) { if (!click(q('[data-compose]'))) return false; open = await waitFor(function () { return q('[data-composer] [data-content]') || q('[data-content]'); }, 3000); }
      if (!open) { await say('I could not open the status composer.', 'Sikuweza kufungua kisanduku cha hali.'); return true; }
      var text = p.text;
      if (!text) { var rc = await R.capture({ mode: 'dictation', title: T('New status', 'Hali mpya'), prompt: T('What do you want to post?', 'Unataka kuchapisha nini?') }); if (!rc || rc.cancelled || !rc.transcript) { click(q('[data-cancel]')); return true; } text = clean(rc.transcript); }
      setVal(open, text);
      if (!(await confirmYes(T('Post this status? “', 'Chapisha hali hii? “') + text.slice(0, 120) + '”', T('Yes, post', 'Ndiyo, chapisha')))) { click(q('[data-cancel]')); await say('Cancelled. Nothing was posted.', 'Imeghairiwa. Hakuna kilichochapishwa.'); return true; }
      var pub = q('[data-publish]'); if (!pub) { await say('The post button is not available.', 'Kitufe cha kuchapisha hakipo.'); return true; }
      pub.click(); V.audit('status.post', Object.assign({ outcome: 'executed', chars: text.length }, meta)); await sleep(1800); var tt = toastText(); await say(tt ? tt : 'Status posted.', tt ? tt : 'Hali imechapishwa.'); return true;
    }
    if (!viewerOpen()) { await say('Open a status first, for example say "show Denis status".', 'Fungua hali kwanza, kwa mfano sema "nionyeshe hali ya Denis".'); return true; }
    if (p.type === 'react') { var rb = qa('[data-react]').filter(function (b) { return b.getAttribute('data-react') === p.emoji; })[0]; if (!rb) { await say('That reaction is not available here.', 'Majibu hayo hayapatikani hapa.'); return true; } rb.click(); V.audit('status.react', Object.assign({ outcome: 'executed' }, meta)); await sleep(500); await say(toastText() || 'Reaction sent.', toastText() || 'Jibu limetumwa.'); return true; }
    if (p.type === 'reply') {
      var ri = q('[data-reply]'), sb = q('[data-send]'); if (!ri || !sb) { await say('Replies are turned off for this status.', 'Majibu yamezimwa kwa hali hii.'); return true; }
      setVal(ri, p.text); if (!(await confirmYes(T('Send this reply? “', 'Tuma jibu hili? “') + p.text.slice(0, 120) + '”', T('Yes, send', 'Ndiyo, tuma')))) { setVal(ri, ''); await say('Cancelled. Nothing was sent.', 'Imeghairiwa. Hakuna kilichotumwa.'); return true; }
      sb.click(); V.audit('status.reply', Object.assign({ outcome: 'executed', chars: p.text.length }, meta)); await sleep(900); await say(toastText() || 'Reply sent.', toastText() || 'Jibu limetumwa.'); return true;
    }
    if (p.type === 'delete') {
      var more = q('[data-more]'); if (more) more.click(); var del = await waitFor(function () { return q('[data-delete]'); }, 1200); if (!del) { await say('You can only delete your own status.', 'Unaweza kufuta hali yako mwenyewe tu.'); if (more) more.click(); return true; }
      if (!(await confirmYes(T('Delete this status? This cannot be undone.', 'Futa hali hii? Haiwezi kurudishwa.'), T('Yes, delete', 'Ndiyo, futa')))) { more && more.click(); await say('Cancelled. Your status is kept.', 'Imeghairiwa. Hali yako imebaki.'); return true; }
      del.click(); V.audit('status.delete', Object.assign({ outcome: 'executed' }, meta)); return true;
    }
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
  root.NecpraVoiceStatus = { init: init, parse: parse, _onIntent: onIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceStatus;
})(typeof window !== 'undefined' ? window : globalThis);
