/*! NECPRA Messenger Intelligence: ON-DEVICE only (English + Kiswahili). No network, no storage, no logging, no server.
 *  Messages are end-to-end encrypted, so this runs on text the phone has ALREADY decrypted for the person, and the text never leaves the
 *  phone. Three helpers:
 *    summarise(messages)      short recap of a chat (extractive: it quotes the chat, it does not invent)
 *    suggestReplies(text)     up to 3 reply drafts. They are only drafts: the person picks, edits and sends (nothing is sent here)
 *    assess(text)             hints that a message looks like a scam / phishing pattern. A hint is NOT proof: it never blocks or hides a message.
 *  Everything is deterministic rules, so results are explainable and the same every time. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NecpraMessengerAI = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SW = /\b(?:habari|mambo|niaje|sasa|asante|tafadhali|samahani|pole|uko|nipo|tuko|kesho|leo|jioni|asubuhi|saa|pesa|tuma|nimetuma|lipa|nina|sina|wapi|lini|je|sawa|poa|ndiyo|hapana|kwanini|nini|karibu|naomba|nipe|rudisha)\b/i;
  function lang(text, hint) { return /^sw/i.test(String(hint || '')) || SW.test(String(text || '')) ? 'sw' : 'en'; }
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function clip(t, n) { t = clean(t); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }

  /* ───────────────────────── reply suggestions ───────────────────────── */
  var RX = {
    greet: /^(?:hi|hello|hey|hii|heya|good (?:morning|afternoon|evening)|habari|mambo|niaje|sasa|vipi|salaam|shikamoo)\b/i,
    how: /\b(?:how are you|how's it going|how r u|u good|uko aje|uko poa|habari yako|hujambo|u poa)\b/i,
    thanks: /\b(?:thanks|thank you|thx|asante|shukrani|ahsante)\b/i,
    money: /\b(?:send|lend|borrow|loan|pay|pesa|tuma|nitumie|kopesha|nikopeshe|lipa|mpesa|m-pesa|till|paybill|cash)\b/i,
    when: /\b(?:what time|when|which day|lini|saa ngapi|tukutane|meet|meeting|kukutana|available|free)\b/i,
    where: /\b(?:where are you|where r u|uko wapi|upo wapi|wapi)\b/i,
    yesno: /^(?:can|could|will|would|are|is|do|did|have|has|shall|should|unaweza|utaweza|je|uko|utakuja|umepata|unataka)\b/i
  };
  var SUG = {
    en: {
      greet: ['Hi! How are you?', 'Hello 👋', 'Hey, good to hear from you.'], how: ["I'm good, thanks. And you?", 'Doing well, thanks for asking!'],
      thanks: ["You're welcome!", 'Anytime 🙂', 'No problem.'], money: ['Let me check and get back to you.', "I'll call you to confirm first.", "I can't right now, sorry."],
      when: ['What time works for you?', 'Sounds good, let me check my schedule.', 'Tomorrow could work. What time?'], where: ["I'll tell you shortly.", "I'm on my way.", "I'm at home right now."],
      yesno: ['Yes', 'No', 'Let me check and get back to you.'], q: ["Let me think and get back to you.", 'Good question, give me a moment.'], fallback: ['Okay 👍', 'Got it, thanks.', 'Noted.']
    },
    sw: {
      greet: ['Habari! Uko aje?', 'Mambo 👋', 'Poa, nafurahi kukusikia.'], how: ['Niko poa, asante. Wewe je?', 'Salama, asante kwa kuuliza!'],
      thanks: ['Karibu!', 'Hakuna shida 🙂', 'Usijali.'], money: ['Acha niangalie nikujibu.', 'Nitakupigia kuthibitisha kwanza.', 'Siwezi sasa, samahani.'],
      when: ['Saa ngapi inakufaa?', 'Sawa, acha niangalie ratiba yangu.', 'Kesho inawezekana. Saa ngapi?'], where: ['Nitakuambia baadaye kidogo.', 'Nipo njiani.', 'Nipo nyumbani sasa hivi.'],
      yesno: ['Ndiyo', 'Hapana', 'Acha niangalie nikujibu.'], q: ['Acha nifikirie nikujibu.', 'Swali zuri, nipe muda kidogo.'], fallback: ['Sawa 👍', 'Nimeelewa, asante.', 'Nimepokea.']
    }
  };
  function suggestReplies(text, opts) {
    opts = opts || {}; var t = clean(text), L = lang(t, opts.lang), S = SUG[L], out = [];
    if (!t) return [];
    var warn = assess(t);
    function add(arr) { for (var i = 0; i < arr.length && out.length < 3; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i]); }
    if (warn.reasons.length) add(S.money.slice(1, 2).concat(S.q.slice(0, 1)));          // a risky-looking message never gets a "yes"/"ok" draft
    else if (RX.money.test(t)) add(S.money);                                               // asks about money: only cautious drafts, never "ok, sending"
    else if (RX.where.test(t)) add(S.where);
    else if (RX.when.test(t)) add(S.when);
    else if (RX.thanks.test(t)) add(S.thanks);
    else if (RX.how.test(t)) add(S.how);
    else if (RX.greet.test(t)) add(S.greet);
    else if (/\?\s*$/.test(t) && RX.yesno.test(t)) add(S.yesno);
    else if (/\?\s*$/.test(t)) add(S.q);
    else add(S.fallback);
    return out.slice(0, 3);
  }

  /* ───────────────────────── scam / phishing hints ───────────────────────── */
  var SHORT = /\b(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|goo\.gl|ow\.ly|tiny\.cc)\//i;
  var URL = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
  var BRAND = /(?:mpesa|m-pesa|safaricom|equity|kcb|airtel|necpra|paypal|bank)/i;
  var TRUSTED = /^(?:[a-z0-9-]+\.)*(?:safaricom\.co\.ke|safaricom\.com|equitybank\.co\.ke|kcbgroup\.com|airtelkenya\.com|necpra\.com|paypal\.com)$/i;
  function hostOf(u) { var m = /^(?:https?:\/\/)?([^\/:?#]+)/i.exec(u); return m ? m[1].toLowerCase() : ''; }
  var RULES = [
    { code: 'secret_request', w: 65, rx: /\b(?:send|give|share|tell|tuma|nipe|nitumie|toa)\b[^.?!]{0,40}\b(?:otp|pin|password|passcode|verification code|one[- ]time|nambari ya siri|neno la siri|msimbo)\b|\b(?:otp|pin|password|verification code|nambari ya siri)\b[^.?!]{0,30}\b(?:send|share|give|tuma|nipe)\b/i,
      en: 'Asks for a PIN, password or code. Real services never ask for these in a chat.', sw: 'Inaomba PIN, nenosiri au msimbo. Huduma halisi hazikuombi hivi kwenye mazungumzo.' },
    { code: 'fee_to_claim', w: 45, rx: /\b(?:won|winner|prize|jackpot|lottery|congratulations|umeshinda|zawadi|ushindi|bahati nasibu)\b[\s\S]{0,80}\b(?:fee|pay|send|lipa|tuma|ada|processing)\b|\b(?:fee|pay|send|lipa|tuma|ada)\b[\s\S]{0,80}\b(?:won|winner|prize|jackpot|umeshinda|zawadi)\b/i,
      en: 'Says you won something but asks you to pay first.', sw: 'Inasema umeshinda kitu lakini inakutaka ulipe kwanza.' },
    { code: 'wrong_transfer', w: 35, rx: /\b(?:sent (?:you )?(?:money )?(?:by )?mistake|wrongly sent|sent to the wrong|nimetuma kimakosa|nimekutumia kimakosa|rudisha pesa|return (?:the |my )?money|reverse)\b/i,
      en: 'A "sent by mistake, please return it" request. Check your own balance and M-PESA message before sending anything back.', sw: 'Ombi la "nimetuma kimakosa, rudisha". Angalia salio lako na ujumbe wa M-PESA kabla ya kurudisha chochote.' },
    { code: 'urgent_money', w: 30, rx: /\b(?:urgent|urgently|immediately|right now|asap|emergency|haraka|sasa hivi|dharura)\b[\s\S]{0,80}\b(?:send|pay|transfer|tuma|lipa|pesa|money|mpesa|cash)\b|\b(?:send|pay|transfer|tuma|lipa|pesa|money|mpesa|cash)\b[\s\S]{0,80}\b(?:urgent|urgently|immediately|right now|asap|emergency|haraka|sasa hivi|dharura)\b/i,
      en: 'Pushes you to send money urgently. Scams rely on pressure.', sw: 'Inakusukuma utume pesa haraka. Matapeli hutumia presha.' },
    { code: 'impersonation', w: 30, rx: /\b(?:i am|i'm|this is|we are|from|calling from|natoka|mimi ni)\b[^.?!]{0,30}\b(?:safaricom|m-?pesa|customer (?:care|service)|your bank|equity|kcb|support team|admin|huduma kwa wateja|benki)\b[\s\S]{0,100}\b(?:verify|suspend|suspended|blocked|locked|update|confirm|thibitisha|imefungwa|imesimamishwa)\b/i,
      en: 'Claims to be a company or support team and says something is wrong with your account.', sw: 'Inajifanya kampuni au huduma kwa wateja na kusema kuna tatizo kwenye akaunti yako.' }
  ];
  function assess(text) {
    var t = clean(text), reasons = [], score = 0;
    if (!t) return { level: 'low', score: 0, reasons: [], notProof: true, note: '' };
    RULES.forEach(function (r) { if (r.rx.test(t)) { reasons.push({ code: r.code, en: r.en, sw: r.sw }); score += r.w; } });
    var urls = t.match(URL) || [];
    if (SHORT.test(t)) { reasons.push({ code: 'short_link', en: 'Contains a shortened link, so you cannot see where it goes.', sw: 'Ina kiungo kilichofupishwa, huwezi kuona kinakoelekea.' }); score += 20; }
    for (var i = 0; i < urls.length; i++) {
      var h = hostOf(urls[i]);
      if (h && BRAND.test(h) && !TRUSTED.test(h)) { reasons.push({ code: 'lookalike_link', en: 'A link that looks like a known brand but is not its official address (' + h + ').', sw: 'Kiungo kinachofanana na chapa inayojulikana lakini si anwani yake rasmi (' + h + ').' }); score += 35; break; }
    }
    score = Math.min(100, score);
    var level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
    return { level: level, score: score, reasons: reasons, notProof: true,
      note: level === 'low' ? '' : 'This is a hint from patterns in the text, not proof. Nothing was blocked. If unsure, check with the person another way (a call) before acting.' };
  }

  /* ───────────────────────── chat summary ───────────────────────── */
  var AMOUNT = /\b(?:kes|ksh|sh|ksh\.)\s?\d[\d,]*(?:\.\d+)?\b|\b\d[\d,]*(?:\.\d+)?\s?(?:k|bob|shillings|\/=)\b|\b\d{3,}\b/gi;
  var TIMEW = /\b(?:\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2}|tomorrow|today|tonight|kesho|leo|jioni|asubuhi|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jumatatu|jumanne|jumatano|alhamisi|ijumaa|jumamosi|jumapili|saa\s+\w+)\b/i;
  var KEY = /\b(?:need|must|deadline|please|remember|don't forget|important|due|owe|pay|paid|send|bring|meet|confirm|need to|nahitaji|lazima|tafadhali|kumbuka|muhimu|deni|lipa|leta|tukutane|thibitisha)\b/i;
  function amountsIn(t) { var m = String(t).match(AMOUNT) || []; return m.map(clean).filter(function (x) { return !/^\d{4}$/.test(x) || /kes|ksh|sh/i.test(x); }); }

  /** messages: [{ from: 'me'|'them', text, at? }] in any order (sorted by `at` when every message has it). Attachments/empty ones are skipped. */
  function summarise(messages, opts) {
    opts = opts || {};
    var L = opts.lang === 'sw' ? 'sw' : 'en', max = Math.min(Math.max(Number(opts.max) || 4, 1), 6);
    var all = (messages || []).filter(function (m) { return m && clean(m.text) && !/^📎/.test(clean(m.text)); }).map(function (m) { return { from: m.from === 'me' ? 'me' : 'them', text: clean(m.text), at: m.at }; });
    if (all.length && all.every(function (m) { return m.at; })) all.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var out = { count: all.length, fromThem: all.filter(function (m) { return m.from === 'them'; }).length, highlights: [], openQuestion: null, amounts: [], when: [], notice: 'Automatic summary of the messages on your phone. It quotes the chat and can miss things.' };
    if (!all.length) { out.say = L === 'sw' ? 'Hakuna ujumbe wa kufupisha kwenye mazungumzo haya.' : 'There are no messages to summarise in this chat.'; return out; }
    var scored = all.map(function (m, i) {
      var s = 0; if (amountsIn(m.text).length) s += 3; if (TIMEW.test(m.text)) s += 2; if (KEY.test(m.text)) s += 2; if (/\?\s*$/.test(m.text)) s += 2; if (m.text.length < 12) s -= 2; s += i / all.length;   // later = slightly more relevant
      return { i: i, s: s, m: m };
    });
    var seen = {};
    out.highlights = scored.filter(function (x) { return x.s >= 2; }).sort(function (a, b) { return b.s - a.s; }).slice(0, max).sort(function (a, b) { return a.i - b.i; })
      .filter(function (x) { var k = x.m.text.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; })
      .map(function (x) { return { from: x.m.from, text: clip(x.m.text, 120) }; });
    all.forEach(function (m) { amountsIn(m.text).forEach(function (a) { if (out.amounts.indexOf(a) < 0) out.amounts.push(a); }); var w = TIMEW.exec(m.text); if (w && out.when.indexOf(w[0].toLowerCase()) < 0) out.when.push(w[0].toLowerCase()); });
    out.amounts = out.amounts.slice(0, 4); out.when = out.when.slice(0, 4);
    for (var j = all.length - 1; j >= 0; j--) { if (all[j].from === 'me') break; if (/\?\s*$/.test(all[j].text)) { out.openQuestion = clip(all[j].text, 120); break; } }   // their latest question that you have not answered yet
    var last = all[all.length - 1];
    var en = [out.count + ' message' + (out.count === 1 ? '' : 's') + ', ' + out.fromThem + ' from them.'], sw = [out.count + ' ujumbe, ' + out.fromThem + ' kutoka kwao.'];
    if (out.highlights.length) { en.push('Main points: ' + out.highlights.map(function (h) { return (h.from === 'me' ? 'you: ' : 'they: ') + '"' + h.text + '"'; }).join('; ') + '.'); sw.push('Mambo makuu: ' + out.highlights.map(function (h) { return (h.from === 'me' ? 'wewe: ' : 'wao: ') + '"' + h.text + '"'; }).join('; ') + '.'); }
    if (out.amounts.length) { en.push('Amounts mentioned: ' + out.amounts.join(', ') + '.'); sw.push('Kiasi kilichotajwa: ' + out.amounts.join(', ') + '.'); }
    if (out.openQuestion) { en.push('You have not answered: "' + out.openQuestion + '"'); sw.push('Hujajibu: "' + out.openQuestion + '"'); }
    else if (last.from === 'them') { en.push('Their last message: "' + clip(last.text, 100) + '"'); sw.push('Ujumbe wao wa mwisho: "' + clip(last.text, 100) + '"'); }
    out.say = (L === 'sw' ? sw : en).join(' ');
    return out;
  }

  return { summarise: summarise, suggestReplies: suggestReplies, assess: assess, lang: lang };
});
