/*! NECPRA voice intents (pure functions, no DOM, English + Kiswahili). Understanding only: nothing here executes an action. */
(function (root) {
  'use strict';
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function norm(t) { return clean(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function lev(a, b) { var m = a.length, n = b.length, d = [], i, j; if (Math.abs(m - n) > 1) return 2; for (i = 0; i <= m; i++) d[i] = [i]; for (j = 1; j <= n; j++) d[0][j] = j; for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  var PRONOUN = /^(her|him|them|she|he|yeye|huyo|yule)$/i;
  var LEAD = /^(?:please|tafadhali|can you|could you|would you|i want to|i would like to|i need to|let me|i'd like to|nataka kutuma|nataka|naomba)\s+/i;
  var CONNECT = /^(?:that|saying|say|to say|and say|kwamba|:|,|-)\s*/i;
  var MONEY = /\b(shillings?|ksh|kes|bob|money|pesa|payment|lipa|cash|pay)\b/i;

  /* contacts: [{id, name}] ; tiers: 3 exact tokens, 2 token prefix, 1 contains, 0 fuzzy (1 typo). Highest non-empty tier wins. */
  function matchContacts(query, contacts) {
    var q = norm(query).split(' ').filter(Boolean); if (!q.length) return { tier: -1, matches: [] };
    var tiers = [[], [], [], []];
    (contacts || []).forEach(function (c) {
      var best = -1;
      [c.name].concat(c.alt || []).forEach(function (nm) { // display name first, then username etc.
        var nt = norm(nm).split(' ').filter(Boolean); if (!nt.length) return;
        var exact = q.every(function (w) { return nt.indexOf(w) >= 0; });
        var pref = q.every(function (w) { return nt.some(function (x) { return x.indexOf(w) === 0; }); });
        var cont = norm(nm).indexOf(q.join(' ')) >= 0;
        var fz = q.every(function (w) { return w.length >= 4 && nt.some(function (x) { return lev(w, x) <= 1; }); });
        var t = exact ? 3 : pref ? 2 : cont ? 1 : fz ? 0 : -1; if (t > best) best = t;
      });
      if (best >= 0) tiers[best].push(c);
    });
    for (var t = 3; t >= 0; t--) if (tiers[t].length) return { tier: t, fuzzy: t === 0, matches: tiers[t] };
    return { tier: -1, matches: [] };
  }

  // words = tokens after the trigger. Longest name prefix (<=3 words) that matches a contact wins; the rest is message content.
  function splitRecipient(words, contacts) {
    words = words.filter(Boolean); if (!words.length) return { name: '', matches: [], rest: '' };
    if (PRONOUN.test(words[0].replace(/[^a-z]/gi, ''))) return { pronoun: true, name: words[0], matches: [], rest: words.slice(1).join(' ') };
    for (var n = Math.min(3, words.length); n >= 1; n--) {
      var name = words.slice(0, n).join(' ').replace(/[,.:]+$/, ''), r = matchContacts(name, contacts);
      if (r.matches.length) return { name: name, matches: r.matches, fuzzy: r.fuzzy, rest: words.slice(n).join(' ') };
    }
    var stop = words.findIndex(function (w, i) { return i > 0 && /^(saying|that|kwamba|and|na|to|:)$/i.test(w); });
    var k = stop > 0 ? stop : 1; return { name: words.slice(0, k).join(' '), matches: [], rest: words.slice(k).join(' ') };
  }

  // Third person ("tell her she owes me") -> second person for the message actually sent. Conservative and always shown to the user.
  function toSecondPerson(text) {
    var out = text;
    out = out.replace(/^ask\s+(?:her|him|them)\s+to\s+/i, 'Please ').replace(/\b(and|then|also)\s+ask\s+(?:her|him|them)\s+to\s+/gi, '$1 please ');
    out = out.replace(/\b(?:she|he)\s+owes\b/gi, 'you owe').replace(/\b(?:she|he)\s+has\b/gi, 'you have').replace(/\b(?:she|he)\s+is\b/gi, 'you are').replace(/\b(?:she|he)\s+was\b/gi, 'you were').replace(/\b(?:she|he)\s+will\b/gi, 'you will').replace(/\b(?:she|he)\s+(can|should|must|did)\b/gi, 'you $1');
    return { text: out, changed: out !== text };
  }
  function tidy(t) { t = clean(t).replace(CONNECT, ''); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }


  /* ───────── open a person's chat (works from ANY screen) ─────────
   * Hard (soft:false): "open chat with Denis", "chat with Denis", "I want to chat with Denis", "talk to Denis",
   *   "open Denis's chat", "ongea na Denis", "nataka kuongea na Denis", "fungua mazungumzo na Denis".
   * Soft (soft:true): a bare "open Denis" / "fungua Denis": only treated as a chat if Denis is really a contact. */
  var PAGE_WORD = /\b(messenger|messages?|chats?|inbox|ujumbe|mazungumzo|meseji|wallet|money|pesa|chama|mkoba|pochi|m ?pesa|savings|akiba|friends?|contacts?|marafiki|rafiki|duka|shop|store|biashara|tools?|groups?|vikundi|kikundi|status|stories|story|hali|settings?|mipangilio|games?|michezo|back|nyuma|calls?|requests?)\b/;
  var NAME_NOISE = /^(?:the\s+)?(?:user|contact|person|friend|my friend|mtumiaji|rafiki yangu|rafiki)\s+/i;
  function cleanName(n) { return clean(String(n || '').replace(/\b(please|now|tafadhali|sasa|for me|kwa ajili yangu)\b/gi, ' ').replace(/[,.!?]+$/, '')); }
  function nameVariants(n) { n = cleanName(n); var out = n ? [n] : [], st = n.replace(NAME_NOISE, ''); if (st && st !== n) out.push(st); return out; }
  var LEAD2 = /^(?:(?:hey|hi|ok|okay|so|now|uh|um|erm)\s+)?(?:please\s+|tafadhali\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:please\s+)?(?:i\s+(?:want|wanna|need|would like|'d like|'?d like)\s+to\s+|i'?m going to\s+|let me\s+|let'?s\s+|nataka\s+|naomba\s+)?/i;
  function parseOpenChat(input) {
    var s = clean(input).replace(/[.!?,]+$/, ''), m, name = null, soft = false;
    s = s.replace(LEAD2, '').replace(LEAD2, '');
    if ((m = /^(?:open|go to|show|show me|fungua|nionyeshe|nenda kwa|nenda|take me to|nipeleke)\s+(?:to\s+)?(?:my\s+|the\s+|a\s+)?(?:chat|conversation|messages?|texts?|mazungumzo|ujumbe|meseji)\s+(?:with|from|of|na|za|ya|kwa|to)\s+(.+)$/i.exec(s))) name = m[1];
    else if ((m = /^(?:open|go to|show|fungua|nionyeshe|nenda kwa|take me to|nipeleke)\s+(?:to\s+)?(?:my\s+|the\s+)?(?:chat|conversation|mazungumzo)\s+(.+)$/i.exec(s))) name = m[1];
    else if ((m = /^(?:open|go to|show|fungua|nionyeshe|nenda kwa|take me to|nipeleke)\s+(?:to\s+)?(?:my\s+|the\s+)?(.+?)(?:'s|s'|’s)\s+(?:chat|conversation|messages?|mazungumzo)$/i.exec(s))) name = m[1];
    else if ((m = /^(?:start\s+|begin\s+|open\s+)(?:a\s+|new\s+)*(?:chat|conversation|mazungumzo)\s+(?:with|to|na|kwa)\s+(.+)$/i.exec(s))) name = m[1];
    else if ((m = /^(?:chat|talk|speak|converse|text|message|msg)\s+(?:with|to)\s+(.+)$/i.exec(s))) name = m[1];
    else if ((m = /^(?:kuongea|kuzungumza|kuchati|ongea|zungumza|chati|ongelea)\s+(?:na|kwa)\s+(.+)$/i.exec(s))) name = m[1];
    else if ((m = /^(?:open|go to|fungua|nionyeshe|nenda kwa|take me to|nipeleke)\s+(?:to\s+)?(?:my\s+|the\s+)?(.+)$/i.exec(s))) { name = m[1]; soft = true; }
    if (name == null) return null;
    name = cleanName(name); var wc = name.split(' ').filter(Boolean).length;
    if (!name || wc > 4) return null;
    if (soft && (PAGE_WORD.test(norm(name)) || wc > 3)) return null;      // "open settings" is navigation, never a person
    if (!soft && PRONOUN.test(name)) return null;
    return { type: 'open', name: name, variants: nameVariants(name), soft: soft };
  }

  // Commands for the message box of the chat that is open right now.
  function parseComposerCommand(input) {
    var s = clean(input).replace(/[.!?,]+$/, ''), n = norm(s), m;
    s = s.replace(LEAD2, ''); n = norm(s);
    if (/^(?:send|send it|send now|send message|send the message|send this|tuma|tuma sasa|tuma ujumbe|tuma huo)$/.test(n)) return { type: 'send' };
    if (/^(?:clear|clear it|clear message|clear the message|clear the box|delete it|delete message|futa|futa ujumbe|futa yote)$/.test(n)) return { type: 'clear' };
    if (/^(?:write|type|compose|dictate|andika|ingiza|anza kuandika)(?:\s+(?:a|the|my|new))*(?:\s+(?:message|text|ujumbe|meseji))?(?:\s+(?:by voice|for me|kwa sauti))?$/.test(n) || /^(?:start dictation|voice typing|dictation)$/.test(n)) return { type: 'dictate', text: '' };
    if ((m = /^(?:write|type|andika|ingiza)\s+(?!a\s+message\b|message\b|text\b|new\b)(.+)$/i.exec(s))) return { type: 'dictate', text: tidy(m[1]) };
    return null;
  }

  function parseMessengerIntent(input, contacts) {
    var s = clean(input).replace(/[.!?]+$/, ''), m; s = s.replace(LEAD, '').replace(LEAD, '');
    // A QUESTION about unread messages ("do I have new messages", "how many unread chats", "kuna ujumbe mpya") is answered, not treated as a command.
    if (!/^(?:read|soma|nisomee|reply|respond|jibu|send|tuma|tell|text|message|write|andika)\b/i.test(s) && /\b(any|is there|are there|do i have|have i|how many|got|kuna|nina|je|ngapi|idadi)\b/i.test(s) && /\b(unread|new|pending|waiting|mpya|hazijasomwa)\b/i.test(s) && /\b(messages?|texts?|chats?|ujumbe|mazungumzo|meseji)\b/i.test(s)) return { type: 'unread' };
    if ((m = /^(?:read|soma|nisomee)\s+(?:out\s+)?(?:(?:my|all|the)\s+)?(?:(?:latest|new|unread|last|recent|mpya|za mwisho)\s+)?(?:messages?|ujumbe|texts?)(?:\s+(?:mpya|za mwisho|zote))?(?:\s+(?:from|kutoka kwa|kutoka|za)\s+(.+))?$/i.exec(s))) return { type: 'read', from: m[1] ? clean(m[1]) : '' };
    if ((m = /^(?:reply|respond|jibu)(?:\s+to\s+(?:him|her|them|(?:the\s+)?(?:last|latest)\s+message))?\s*(.*)$/i.exec(s))) return { type: 'reply', content: tidy(m[1]) };
    var oc = parseOpenChat(s); if (oc && !oc.soft) return oc;
    if ((m = /^(?:search|find|look for|tafuta)\s+(?:for\s+)?(?:a\s+)?(?:chat|conversation|contact|mazungumzo)\s*(?:with|from|for|of|na|ya)?\s*(.+)$/i.exec(s))) return { type: 'search', name: clean(m[1]) };
    var rest = null, tell = false;
    if ((m = /^(?:send|write|compose|drop|tuma|andika)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:voice\s+)?(?:message|text|sms|ujumbe|meseji)\s*(?:to|kwa)?\s*(.*)$/i.exec(s))) rest = m[1];
    else if ((m = /^(?:message|text|msg|mtumie(?:\s+ujumbe)?)\s+(.+)$/i.exec(s))) rest = m[1];
    else if ((m = /^(?:tell|ask|inform|notify|mwambie|mjulishe)\s+(.+)$/i.exec(s))) { rest = m[1]; tell = true; if (/^(?:ask)\b/i.test(s)) rest = 'ask ' + rest; }
    if (rest == null) return null;
    if (MONEY.test(rest.split(' ').slice(0, 4).join(' ')) && !/\b(message|text|ujumbe)\b/i.test(s)) return null; // "send money to X" is a payment, never a message
    var isAsk = /^ask\s/i.test(rest); if (isAsk) rest = rest.replace(/^ask\s+/i, '');
    var sp = splitRecipient(clean(rest).split(' '), contacts || []), content = sp.rest, rewritten = false;
    if (tell && (sp.pronoun || sp.matches.length || sp.name)) { var c = (isAsk ? 'ask her to ' + content.replace(/^to\s+/i, '') : content); var sec = toSecondPerson(c); content = isAsk ? sec.text : sec.text; rewritten = sec.changed || isAsk; }
    return { type: 'send', recipient: sp, content: tidy(content), rewritten: rewritten };
  }

  var PAGES = [
    ['messages', /\b(messenger|messages?|chats?|inbox|ujumbe|mazungumzo|meseji)\b/],
    ['money', /\b(wallet|money|pesa|chama|mkoba|pochi|m-?pesa|savings|akiba)\b/],
    ['friends', /\b(friends?|contacts?|marafiki|rafiki)\b/],
    ['tools', /\b(duka(?: smart)?|shop|store|biashara|tools?|my business)\b/],
    ['group', /\b(groups?|vikundi|kikundi)\b/],
    ['status', /\b(status|stories|story|hali)\b/],
    ['settings', /\b(settings?|mipangilio)\b/],
    ['games', /\b(games?|michezo)\b/]
  ];
  var LABEL = { messages: ['Messenger', 'Ujumbe'], money: ['Wallet and Chama', 'Pochi na Chama'], friends: ['Friends', 'Marafiki'], tools: ['DUKA SMART', 'DUKA SMART'], group: ['Groups', 'Vikundi'], status: ['Status', 'Hali'], settings: ['Settings', 'Mipangilio'], games: ['Games', 'Michezo'] };
  function parseNav(input) {
    var s = norm(input);
    if (/^(go back|back|previous screen|previous page|rudi nyuma|rudi)$/.test(s)) return { type: 'back' };
    var m = /^(?:please |tafadhali )?(?:open|go to|goto|take me to|show me|show|switch to|navigate to|fungua|nenda|nenda kwa|nipeleke|nionyeshe|rudi kwa)\s+(?:my |the |to )?(.+)$/.exec(s);
    if (!m || m[1].split(' ').length > 4) return null;
    if (/\b(chat|chats|conversation|mazungumzo|messages?|ujumbe)\s+(with|from|of|na|za|ya|kwa|to)\s+\w+/.test(m[1])) return null; // that names a person: a chat, not the Messenger list
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i][1].test(m[1])) return { type: 'navigate', page: PAGES[i][0], sub: /chama/.test(m[1]) ? 'chama' : null };
    return null;
  }

  var ORD = [[/\b(?:1|one|first|1st|moja|wa kwanza|ya kwanza|kwanza)\b/, 0], [/\b(?:2|two|second|2nd|mbili|wa pili|ya pili|pili)\b/, 1], [/\b(?:3|three|third|3rd|tatu|wa tatu|ya tatu)\b/, 2], [/\b(?:4|four|fourth|nne|wa nne)\b/, 3], [/\b(?:5|five|fifth|tano|wa tano)\b/, 4]];
  function parseChoice(text, options) {
    var s = norm(text), best = -1, pos = 1e9; ORD.forEach(function (o) { var m = o[0].exec(s); if (m && o[1] < options.length && m.index < pos && !(o[1] === 0 && /\b(?:second|third|fourth|fifth|pili|tatu|nne|tano)\b/.test(s))) { pos = m.index; best = o[1]; } }); if (best >= 0) return best;
    var hit = []; options.forEach(function (o, k) { var l = norm(o.label || o); if (l && (s.indexOf(l) >= 0 || l.indexOf(s) >= 0 && s.length >= 3)) hit.push(k); });
    return hit.length === 1 ? hit[0] : -1;
  }
  function parseConfirmAnswer(text) {
    var s = clean(text).replace(/[.!?]+$/, ''), n = norm(s), m;
    if (/^(?:no|nope|cancel|don'?t send|do not send|stop|ghairi|hapana|usitume|acha)\b/.test(n)) return { action: 'cancel' };
    if ((m = /^(?:change it to|replace it with|make it|say instead|badilisha iwe|iwe)\s+(.+)$/i.exec(s))) return { action: 'replace', text: tidy(m[1]) };
    if ((m = /^(?:(?:add|also|ongeza)\s+(?:and\s+)?|(?:and|na)\s+)(.+)$/i.exec(s))) return { action: 'append', text: clean(m[1]) };
    if (/^(?:change|edit|redo|start again|re ?record|again|try again|badilisha|rudia|anza upya)\b/.test(n)) return { action: 'redo' };
    if (/^(?:yes|yeah|yep|send|send it|ok|okay|go ahead|confirm|tuma|ndiyo|ndio|sawa|thibitisha)\b/.test(n)) return { action: 'send' };
    return { action: 'unknown' };
  }

  /* ───────── utterance clean-up (runs BEFORE any parser) ─────────
   * Speech recognisers rarely return the exact words a strict command grammar expects: "please", "can I see", "open up the wallet screen",
   * a bare "chama", or a brand word heard as "shama"/"doka". This only rewrites NAVIGATION-style requests into the canonical
   * "open <place>" the parsers already understand. Message text and anything else is passed through untouched. */
  var MSG_VERB = /^(?:tell|ask|send|message|text|msg|reply|respond|write|type|compose|dictate|post|tuma|andika|mwambie|mjulishe|jibu|ingiza)\b/i;
  var PLACE = '(?:messenger|messages?|chats?|inbox|ujumbe|wallet|wallets|money|pesa|pochi|mkoba|chamas?|friends?|contacts?|marafiki|duka(?: smart)?|shop|store|tools?|groups?|vikundi|status|stories|settings?|mipangilio|games?|michezo|savings?|akiba|airtime|orders?|requests?)';
  var HEARD = [[/\b(?:shama|chamma|chaama|cha ma|chamah)\b/gi, 'chama'], [/\b(?:doka|duca|dukka|ducka|dooka|douka)\b/gi, 'duka'], [/\b(?:pochy|poche|poochi|pochie)\b/gi, 'pochi'], [/\bm[\s-]?pesa\b/gi, 'mpesa']];
  var VERB_TO_OPEN = /^(?:(?:hey|hi|ok|okay|so|now|uh|um|erm)\s+)*(?:please\s+|tafadhali\s+)?(?:(?:can|could|would|will)\s+(?:you|i)\s+(?:please\s+)?(?:see|view|open|go to|check|show me|take me to)|let me\s+(?:see|view|open|go to|check)|let'?s\s+go to|i\s+(?:want|wanna|need|would like|'?d like)\s+to\s+(?:see|view|open|go to|go into|check|visit)|(?:bring up|pull up|launch|access|visit|view|enter|go into|get into|take me into|navigate to|switch over to|switch to|open up|go on|go over to|onyesha|angalia|tazama|ingia(?: kwenye| kwa)?|nenda kwenye|nipeleke kwenye|fungua kwenye|nataka (?:kuona|kufungua|kwenda|kuangalia|kuingia)(?: kwenye| kwa)?))\s+/i;
  function normalizeUtterance(input) {
    var s = clean(input).replace(/[.!?]+$/, ''); if (!s) return s;
    if (MSG_VERB.test(s.replace(/^(?:(?:hey|hi|ok|okay|so|now|uh|um|erm)\s+)+/i, '').replace(/^(?:please|tafadhali)\s+/i, ''))) return clean(input);   // message content is never rewritten
    var t = s.replace(/^(?:(?:hey|hi|ok|okay|so|now|uh|um|erm)\s+)+/i, '');
    var probe = t.replace(/^(?:please|tafadhali)\s+/i, '');
    var navish = VERB_TO_OPEN.test(probe) || /^(?:open|go to|goto|take me to|show me|show|fungua|nenda(?: kwa)?|nipeleke(?: kwa)?|nionyeshe|rudi kwa|check|see)\b/i.test(probe) || new RegExp('^(?:(?:my|the|to|kwa|ya|za)\\s+)*' + PLACE + '(?:\\s+(?:page|screen|tab|section|module|please|tafadhali|sasa|now))*$', 'i').test(probe);
    if (!navish) return clean(input);
    t = probe.replace(/\s+(?:please|tafadhali|sasa|now|for me|kwa ajili yangu|thanks|thank you|asante)$/i, '');
    HEARD.forEach(function (h) { t = t.replace(h[0], h[1]); });
    t = t.replace(/\bkwenye\b/gi, 'kwa').replace(/\bchamas\b/gi, 'chama').replace(/\bwallets\b/gi, 'wallet');
    if (VERB_TO_OPEN.test(t)) t = t.replace(VERB_TO_OPEN, 'open ');
    t = t.replace(/^(?:check|see)\s+(?=(?:my\s+|the\s+)?(?:wallet|pochi|chama|friends?|groups?|status|games?|settings?|duka|messages?|savings?)\b)/i, 'open ');
    t = t.replace(/\s+(?:page|screen|tab|section|module)$/i, '');
    if (new RegExp('^(?:(?:my|the|to|kwa|ya|za)\\s+)*' + PLACE + '$', 'i').test(t)) t = 'open ' + t.replace(/^(?:(?:my|the|to|kwa|ya|za)\s+)+/i, '');   // a bare "chama" or "my wallet" means "open it"
    return clean(t);
  }

  function isSaleStatement(t) { return /\b(nimeuza|nimeuzia|ameuza|tumeuza|(?:i|we)(?:\s+have)?\s+sold)\b/i.test(clean(t)); }
  /* Which screen owns a question? Used by the shell when the screen you are on could not answer ("is there a friend request" while in DUKA). */
  function topicOf(text) {
    var n = norm(text);
    if (/\b(unread|new messages?|ujumbe mpya|my messages|inbox|meseji mpya)\b/.test(n)) return 'messages';
    if (/\b(friends?|friend requests?|marafiki|rafiki|maombi ya urafiki)\b/.test(n) || (/\b(requests?|maombi)\b/.test(n) && !/\b(payment|pay|money|pesa|malipo|chama)\b/.test(n))) return 'friends';
    if (/\b(duka|products?|stock|inventory|customers?|wateja|bidhaa|sales|sold|mauzo|debts?|owe|owes|expenses?|profit|faida|shop|low stock)\b/.test(n)) return 'tools';
    if (/\b(groups?|vikundi|kikundi)\b/.test(n)) return 'group';
    if (/\b(status|statuses|stories|moments|hali)\b/.test(n)) return 'status';
    return null;
  }
  var api = { topicOf: topicOf, normalizeUtterance: normalizeUtterance, parseOpenChat: parseOpenChat, parseComposerCommand: parseComposerCommand, nameVariants: nameVariants, isSaleStatement: isSaleStatement, norm: norm, matchContacts: matchContacts, splitRecipient: splitRecipient, parseMessengerIntent: parseMessengerIntent, parseNav: parseNav, parseChoice: parseChoice, parseConfirmAnswer: parseConfirmAnswer, toSecondPerson: toSecondPerson, PAGE_LABEL: LABEL };
  root.NecpraVoiceIntents = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
