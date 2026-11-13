/*! NECPRA Voice Money NLU (pure). Wallet / Chama(circles) / Pay Later orders / prepared transfer. English + Kiswahili.
 *  Understanding only. There is deliberately NO "execute payment" intent: voice can only open the normal Send-money screen pre-filled. */
(function (root) {
  'use strict';
  var S = root.NecpraVoiceSalesNLU || (typeof require === 'function' ? (function () { try { return require('./necpra-voice-sales-nlu.js'); } catch (_) { return null; } })() : null);
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function norm(t) { return clean(t).replace(/(\d),(\d{3})/g, '$1$2').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/m[\s-]?pesa/g, 'mpesa').replace(/[^a-z0-9@\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  var DIG = { zero: 0, oh: 0, o: 0, sifuri: 0, one: 1, moja: 1, two: 2, mbili: 2, three: 3, tatu: 3, four: 4, nne: 4, five: 5, tano: 5, six: 6, sita: 6, seven: 7, saba: 7, eight: 8, nane: 8, nine: 9, tisa: 9 };
  var ROLE = /^(supplier|suppliers|customer|client|friend|brother|sister|mother|father|mum|mom|dad|wife|husband|landlord|boss|driver|mtu|muuzaji|mteja|rafiki|mama|baba)$/;

  // "zero seven one two three four five six seven eight" or "0712 345 678" -> "0712345678"
  function spokenPhone(text) {
    var t = norm(text).split(' '), best = '', cur = '';
    t.forEach(function (w) { if (/^\d+$/.test(w)) cur += w; else if (w in DIG && w !== 'o' && w !== 'oh' || (w === 'o' || w === 'oh') && cur) cur += DIG[w]; else { if (cur.length > best.length) best = cur; cur = ''; } });
    if (cur.length > best.length) best = cur; return /^(0|254|\+?254)\d{8,11}$/.test(best) || /^0\d{9}$/.test(best) ? best : '';
  }
  function amountOf(text) { if (!S) return null; var a = S.parseQuantityAnswer(text.replace(/\b(to|kwa)\b.*$/i, '')); return a ? (a.amount != null ? a.amount : a.qty) : null; }

  function parse(input) {
    var raw = clean(input).replace(/[.!?]+$/, ''), s = norm(raw), m;
    // prepared transfer (never executed here)
    if ((m = /^(?:please\s+)?(?:prepare|make|send|pay|lipa|tuma|do|set up|i want to send|i want to pay|nataka kutuma|nataka kulipa)\s+(?:a\s+)?(?:payment\s+of\s+|malipo ya\s+)?(.+?)\s+(?:to|kwa)\s+(?:my\s+|the\s+)?(.+)$/.exec(s)) && !/\b(message|text|ujumbe)\b/.test(s)) {
      var amt = amountOf(m[1]); if (amt && amt > 0) {
        var phone = spokenPhone(m[2]), who = clean(m[2].replace(/\b(please|tafadhali)\b/g, '')), role = !phone && who.split(' ').length <= 2 && ROLE.test(who.split(' ')[0]);
        return { type: 'prepare_transfer', amount: amt, to: phone || (role ? '' : who.replace(/^@/, '').replace(/\s+/g, '').length ? (/^@/.test(who) ? who : who) : ''), toLabel: who, needsRecipient: !phone && role };
      }
    }
    if (/(outstanding|still owe|balance due|remaining|bado|deni la chama|nadaiwa|unpaid)/.test(s) && /(chama|circle|contribution|michango|mchango|kikundi)/.test(s)) return { type: 'chama_outstanding' };
    if (/(contribut|michango|mchango)/.test(s) && /(month|mwezi|this month)/.test(s)) return { type: 'chama_month' };
    if (/(pending|unpaid|my|show|read|soma|ona|zangu).*(orders?|oda)/.test(s) || /(orders?|oda).*(pending|unpaid|pay later)/.test(s)) return { type: 'orders' };
    if (/(how much|kiasi gani|ni kiasi|nimetumia).*(spen[dt]|used|nimetumia|matumizi)|(spent|spending|matumizi)/.test(s) && /(today|leo|month|mwezi|spen|matumizi|nimetumia)/.test(s)) return { type: 'spent', period: /(month|mwezi)/.test(s) ? 'month' : 'today' };
    if (/(how much|kiasi).*(received|got|came in|nimepokea|nimepata)/.test(s)) return { type: 'received' };
    if (/(latest|recent|last|new|yangu|za hivi karibuni|za mwisho)?.*(transactions?|miamala|muamala)/.test(s) && /(transactions?|miamala|muamala)/.test(s)) return { type: 'transactions' };
    if (/(balance|salio|how much (do i have|money do i have|is in my (wallet|account))|nina pesa ngapi)/.test(s) || /^(?:show|open|go to|fungua|nionyeshe)\s+(?:my\s+)?(?:wallet|pochi)$/.test(s)) return /^(?:open|go to|fungua)\s+(?:my\s+)?(?:wallet|pochi)$/.test(s) ? { type: 'tab', tab: 'wallet' } : { type: 'balance' };
    var TAB = [['circles', /\b(chama|circles?|kikundi|michango)\b/], ['goals', /\b(savings?( goals?)?|goals?|akiba|malengo)\b/], ['requests', /\b(payment requests?|requests?|maombi)\b/], ['paylater', /\b(pay later|lipa baadaye)\b/], ['airtime', /\b(airtime|data|bundles?|muda wa maongezi)\b/], ['activity', /\b(activity|shughuli)\b/], ['wallet', /\b(wallet|pochi)\b/]];
    if ((m = /^(?:open|go to|show|show me|fungua|nionyeshe|nenda kwa)\s+(?:my\s+)?(.+)$/.exec(s)) && m[1].split(' ').length <= 4) for (var i = 0; i < TAB.length; i++) if (TAB[i][1].test(m[1])) return { type: 'tab', tab: TAB[i][0] };
    return null;
  }
  var api = { parse: parse, spokenPhone: spokenPhone };
  root.NecpraVoiceMoneyNLU = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
