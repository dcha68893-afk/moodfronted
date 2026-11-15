/*! NECPRA Voice Admin (admin.html). Admins only: open an Admin screen by voice ("open orders", "fungua maagizo", "voice phrases", "go back").
 *  Navigation only: it uses the Admin module's own router (window.__admNav), so the admin check on every screen and every server route is unchanged.
 *  Nothing here approves, deletes, pays or changes anything. English + Kiswahili. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents;
  if (!V || !UI || !R || !I) return;
  var T = UI.T;

  // page = admin-module.js route. re = words people use for it (checked in order, first match wins).
  var SCREENS = [
    { page: 'admin-voice',     en: 'Voice phrases',     sw: 'Maneno ya sauti',  re: /\b(voice phrases?|taught phrases?|teach (?:the )?(?:voice|assistant)|voice words?|maneno ya sauti|fundisha sauti|fundisha msaidizi)\b/ },
    { page: 'admin-modules',   en: 'Reports by module', sw: 'Ripoti kwa sehemu', re: /\b(reports?|reports by module|ripoti|malalamiko|problem reports?|moderation)\b/ },
    { page: 'admin-products',  en: 'Products',          sw: 'Bidhaa',           re: /\b(products?|approvals?|pending products?|bidhaa)\b/ },
    { page: 'admin-reviews',   en: 'Reviews',           sw: 'Maoni',            re: /\b(reviews?|ratings?|maoni|tathmini)\b/ },
    { page: 'admin-tickets',   en: 'Support',           sw: 'Msaada',           re: /\b(support|tickets?|help desk|msaada|tiketi)\b/ },
    { page: 'admin-sellers',   en: 'Sellers',           sw: 'Wauzaji',          re: /\b(sellers?|vendors?|wauzaji|muuzaji)\b/ },
    { page: 'admin-buyers',    en: 'Buyers',            sw: 'Wanunuzi',         re: /\b(buyers?|customers?|users?|wanunuzi|mnunuzi|wateja)\b/ },
    { page: 'admin-orders',    en: 'Orders',            sw: 'Maagizo',          re: /\b(orders?|maagizo|oda)\b/ },
    { page: 'admin-returns',   en: 'Returns',           sw: 'Marejesho',        re: /\b(returns?|refunds?|marejesho|kurejesha)\b/ },
    { page: 'admin-payouts',   en: 'Payouts',           sw: 'Malipo',           re: /\b(payouts?|payments? to sellers|malipo ya wauzaji|malipo)\b/ },
    { page: 'admin-coupons',   en: 'Coupons',           sw: 'Kuponi',           re: /\b(coupons?|discount codes?|vouchers?|kuponi|punguzo)\b/ },
    { page: 'admin-flash',     en: 'Flash sales',       sw: 'Mauzo ya haraka',  re: /\b(flash sales?|flash|promotions?|mauzo ya haraka)\b/ },
    { page: 'admin-notify',    en: 'Notify users',      sw: 'Arifu watumiaji',  re: /\b(notify|notifications?|announce(?:ment)?s?|broadcast|arifu|tangazo)\b/ },
    { page: 'admin-analytics', en: 'Analytics',         sw: 'Takwimu',          re: /\b(analytics|statistics|stats|insights|takwimu)\b/ },
    { page: 'admin-settings',  en: 'Admin settings',    sw: 'Mipangilio ya admin', re: /\b(settings?|mipangilio)\b/ },
    { page: 'admin-audit',     en: 'Audit log',         sw: 'Kumbukumbu za ukaguzi', re: /\b(audit(?: log)?|logs?|history|kumbukumbu|ukaguzi)\b/ },
    { page: 'admin-dashboard', en: 'the Admin dashboard', sw: 'dashibodi ya Admin', re: /\b(dashboard|home|overview|main|start|nyumbani|dashibodi|mwanzo)\b/ }
  ];
  var PREFIX = /^(?:hey |hi |ok |okay |so |now )?(?:please |tafadhali )?(?:can you |could you |would you )?(?:i want to |i wanna |let me |nataka |naomba )?(?:open|go to|show(?: me)?|take me to|see|view|check|fungua|nenda kwa|nenda|nionyeshe|nipeleke|onyesha|angalia)\s+/;

  function say(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }

  function parse(input) {
    var n = I.norm(clean(input).replace(/[.!?,]+$/, ''));
    n = n.replace(/^(?:hey |hi |ok |okay )?(?:please |tafadhali )?/, '');
    if (/^(?:go back|back|rudi nyuma|rudi|exit admin|leave admin|close admin|toka kwenye admin)$/.test(n)) return { type: 'back' };
    if (/^(?:what can i (?:open|do)(?: here)?|admin (?:sections|screens|menu)|list (?:the )?admin (?:sections|screens)|nini naweza kufungua)$/.test(n)) return { type: 'list' };
    var s = n.replace(PREFIX, '').replace(/^(?:the |my |admin |msimamizi |usimamizi )+/, '').replace(/\s+(?:screen|page|section|tab|skrini|ukurasa)$/, '').trim();
    var hasVerb = PREFIX.test(n) || /^admin\b/.test(n);
    if (!hasVerb && s.split(' ').length > 3) return null;        // a long sentence with no "open" is not a navigation command
    if (!s) return null;
    for (var i = 0; i < SCREENS.length; i++) if (SCREENS[i].re.test(s)) return { type: 'open', screen: SCREENS[i] };
    return null;
  }

  async function run(p) {
    if (p.type === 'back') { if (typeof root.__admBack === 'function') root.__admBack(); else return false; await say('Going back.', 'Narudi nyuma.'); return true; }
    if (p.type === 'list') {
      var names = SCREENS.filter(function (x) { return x.page !== 'admin-dashboard'; }).map(function (x) { return T(x.en, x.sw); }).join(', ');
      await say('In Admin you can open: ' + names + '.', 'Kwenye Admin unaweza kufungua: ' + names + '.'); return true;
    }
    if (typeof root.__admNav !== 'function') return false;
    root.__admNav(p.screen.page);
    V.audit('admin.open', { module: 'admin', outcome: 'executed' });
    await say('Opening ' + p.screen.en + '.', 'Inafungua ' + p.screen.sw + '.');
    return true;
  }

  function onIntent(payload) {
    if (!payload || payload.mode === 'probe') return false;
    var p = parse(payload.transcript); if (!p) return false;
    return run(p).then(function (ok) { return ok; }, function () { return false; });
  }
  function init() { R.onIntent(onIntent); return true; }
  root.NecpraVoiceAdmin = { init: init, parse: parse, SCREENS: SCREENS, _onIntent: onIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceAdmin;
})(typeof window !== 'undefined' ? window : globalThis);
