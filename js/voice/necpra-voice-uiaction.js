/*! NECPRA Voice UI-Action fallback (runs INSIDE every module screen).
 *  Problem it solves: each screen only understood the exact phrases someone hand-wrote for it, so any other feature (a tab, a button, a menu item,
 *  anything added later) answered "could not match". This is the LAST handler a screen tries: if nothing screen-specific matched, it looks at the
 *  controls that are visible RIGHT NOW (buttons, tabs, menu items, links, switches) and taps the one whose label matches the spoken words.
 *  Safety: never taps anything whose label looks destructive or financial (delete, pay, send money, block, log out ...); those must be tapped by hand.
 *  It never types, never reads private data aloud (it only says the label it tapped, and only if the label is short and has no digits),
 *  and it ignores "probe" lookups from the shell. If nothing matches clearly it returns false so the next layers (offline NLU, intelligence engine) still run. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote;
  if (!V || !R || typeof R.onIntentFallback !== 'function' || root.NecpraVoiceUIAction) return;
  var doc = root.document;
  function T(en, sw) { return UI && UI.T ? UI.T(en, sw) : en; }

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function norm(t) {
    return clean(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  // Controls whose label means "this changes or spends something": never tapped by this fallback.
  var DANGER = /\b(delete|remove|erase|clear|reset|wipe|block|unblock|report|unfriend|leave|logout|log out|sign out|signout|deactivate|close account|withdraw|pay|payment|send money|transfer|purchase|buy|checkout|confirm order|place order|submit|refund|cancel order|futa|ondoa|zuia|ripoti|toka|ondoka|lipa|tuma pesa|nunua|toa pesa|thibitisha agizo)\b/;
  // Navigation tabs only lead to a screen, so they get the narrow list ("Pay Later" is a harmless tab; a "Pay" button is not).
  var DANGER_TAB = /\b(delete|remove|erase|clear|reset|wipe|logout|log out|sign out|signout|deactivate|close account|futa|ondoa|toka)\b/;
  var VERB = /^(?:please |tafadhali )?(?:(?:can|could|would) you )?(?:open|go to|goto|show me|show|take me to|tap|click|press|hit|select|choose|switch to|turn on|turn off|toggle|view|see|check|fungua|nenda kwa|nenda|nipeleke|nionyeshe|onyesha|bonyeza|chagua|gusa|angalia|washa|zima)\s+(?:the |my |on |kwenye |kichupo cha |kitufe cha )?/;
  var NOUN_TAIL = /\s+(?:tab|button|page|screen|section|menu|option|link|kichupo|kitufe|ukurasa|sehemu|chaguo)$/;
  var SELECTOR = 'button,a[href],[role=button],[role=tab],[role=menuitem],[role=switch],[role=option],[role=link],summary,[onclick],[data-tab],[data-page],.tab,.nav-item,input[type=checkbox],input[type=radio]';

  function visible(el) {
    if (!el || el.hidden || el.disabled || el.getAttribute('aria-hidden') === 'true' || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest && el.closest('[hidden],[aria-hidden="true"],.nv-overlay,.nv-fab,.nv-sheet,[class^="nv-"],[id^="nv-"]')) return false;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var cs = root.getComputedStyle ? root.getComputedStyle(n) : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' && n === el)) return false;
    }
    if (root.__necpraNoLayout === true) return true;   // test environments have no layout
    var r = el.getClientRects && el.getClientRects();
    return !!(r && r.length);
  }
  function labelOf(el) {
    var l = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (!l && el.id && doc.querySelector('label[for="' + String(el.id).replace(/"/g, '') + '"]')) l = doc.querySelector('label[for="' + el.id + '"]').textContent;
    if (!l && /^(?:INPUT)$/.test(el.tagName) && el.closest('label')) l = el.closest('label').textContent;
    if (!l) l = el.textContent || '';
    return clean(l).slice(0, 60);
  }
  // The topmost open dialog/sheet limits what can be tapped (so "close" or "settings" never reaches behind a modal).
  function scope() {
    var dl = doc.querySelectorAll('[role=dialog],[aria-modal=true],.modal.show,.modal.open,.modal.active,.sheet.open,.sheet.active,.bottom-sheet.open,.drawer.open');
    for (var i = dl.length - 1; i >= 0; i--) if (visible(dl[i])) return dl[i];
    return doc;
  }
  function collect() {
    var out = [], seen = {}, nodes = scope().querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length && out.length < 400; i++) {
      var el = nodes[i]; if (!visible(el)) continue;
      var raw = labelOf(el), n = norm(raw); if (n.length < 2 || n.length > 50) continue;
      var key = n + '|' + (el.getAttribute('href') || '');
      if (seen[key]) { seen[key].count++; continue; }   // same label + same target twice = one control; same label, different target = ambiguous (see count)
      var isTab = !!(el.matches && el.matches('[role=tab],[data-tab],.tab,.nav-item'));
      var entry = { el: el, raw: raw, n: n, count: 1, danger: (isTab ? DANGER_TAB : DANGER).test(n) }; seen[key] = entry; out.push(entry);
    }
    return out;
  }

  function target(transcript) {
    var s = norm(transcript), hadVerb = VERB.test(s);
    s = s.replace(VERB, '').replace(NOUN_TAIL, '').trim();
    if (!s || s.length < 2) return null;
    return { phrase: s, hadVerb: hadVerb };
  }
  function whole(hay, needle) { return (' ' + hay + ' ').indexOf(' ' + needle + ' ') >= 0; }
  function rank(cands, phrase, hadVerb) {
    var res = [];
    cands.forEach(function (c) {
      var sc = 0;
      if (c.n === phrase) sc = 4;
      else if (hadVerb && whole(c.n, phrase)) sc = 3;                       // "open requests" -> "Friend requests"
      else if (hadVerb && c.n.length >= 4 && whole(phrase, c.n)) sc = 2;     // "open the requests tab please" -> "Requests"
      if (sc) res.push({ c: c, sc: sc });
    });
    res.sort(function (a, b) { return b.sc - a.sc || a.c.n.length - b.c.n.length; });
    return res;
  }

  function sayShort(label) {
    var m = label && label.length <= 30 && !/\d/.test(label) ? T('Opening ' + label + '.', 'Inafungua ' + label + '.') : T('Done.', 'Imefanyika.');
    try { if (UI && UI.announce) UI.announce(m); } catch (_) {}
    try { return R.speak(m); } catch (_) {}
  }
  function press(el) {
    try { el.scrollIntoView && el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
    if (el.matches && el.matches('input[type=checkbox],input[type=radio]')) { el.click(); return; }
    el.click();
  }

  function listScreen() {
    var c = collect().filter(function (x) { return !x.danger; }).slice(0, 10).map(function (x) { return x.raw; });
    if (!c.length) return false;
    var m = T('On this screen you can say: ', 'Kwenye skrini hii unaweza kusema: ') + c.map(function (x) { return '“' + x + '”'; }).join(', ') + '.';
    try { if (UI && UI.announce) UI.announce(m); } catch (_) {}
    R.speak(c.join(', '));
    return true;
  }
  function scrollCmd(s) {
    var sc = doc.scrollingElement || doc.documentElement, h = (root.innerHeight || 600) * 0.8;
    if (/^(?:scroll down|page down|go down|shuka chini|sogeza chini)$/.test(s)) { sc.scrollBy ? sc.scrollBy({ top: h, behavior: 'smooth' }) : (sc.scrollTop += h); return true; }
    if (/^(?:scroll up|page up|go up|panda juu|sogeza juu)$/.test(s)) { sc.scrollBy ? sc.scrollBy({ top: -h, behavior: 'smooth' }) : (sc.scrollTop -= h); return true; }
    if (/^(?:go to (?:the )?top|scroll to (?:the )?top|top of (?:the )?page|nenda juu kabisa)$/.test(s)) { sc.scrollTo ? sc.scrollTo({ top: 0, behavior: 'smooth' }) : (sc.scrollTop = 0); return true; }
    if (/^(?:go to (?:the )?bottom|scroll to (?:the )?bottom|nenda chini kabisa)$/.test(s)) { sc.scrollTo ? sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }) : (sc.scrollTop = sc.scrollHeight); return true; }
    return false;
  }

  async function onIntent(p) {
    try {
      if (!p || !p.transcript || p.mode === 'probe') return false;
      var s = norm(p.transcript);
      if (/^(?:what(?: ?s| is) on (?:this|the) screen|what can i (?:tap|press|do here|say here)|list (?:the )?(?:buttons|options|tabs)|read (?:the )?(?:buttons|options|tabs)|nini kiko kwenye skrini hii|orodha ya vitufe)$/.test(s)) return listScreen();
      if (scrollCmd(s)) return true;
      var t = target(p.transcript); if (!t) return false;
      var ranked = rank(collect(), t.phrase, t.hadVerb); if (!ranked.length) return false;
      var best = ranked[0], top = ranked.filter(function (r) { return r.sc === best.sc; });
      // identical labels (e.g. one "Open" per row) are not a clear choice: do nothing rather than guess
      var labels = {}; top.forEach(function (r) { labels[r.c.n] = (labels[r.c.n] || 0) + 1; });
      if (top.length > 1 && Object.keys(labels).length === 1) return false;   // several controls share this exact label (e.g. one "Open" per row): never guess
      if (best.c.count > 1) return false;   // the same label appears on more than one control of the same kind (e.g. one "Open" per row)
      if (best.c.danger) {
        var m = T('That one changes or spends something, so please tap it yourself.', 'Hiyo hubadilisha au hutumia kitu, tafadhali ibonyeze mwenyewe.');
        try { if (UI && UI.announce) UI.announce(m); } catch (_) {}
        R.speak(m); return true;   // handled: do not let the engine guess a different action
      }
      var distinct = []; top.forEach(function (r) { if (!distinct.some(function (d) { return d.c.n === r.c.n; })) distinct.push(r); });
      if (distinct.length > 1 && UI && UI.choose) {
        var opts = distinct.slice(0, 3).map(function (r) { return { label: r.c.raw }; });
        var idx = await UI.choose({ title: T('Which one?', 'Ipi?'), options: opts, voiceAnswer: function () { return R.capture({ mode: 'command', prompt: T('Say the number or the name.', 'Sema namba au jina.'), spokenPrompt: T('Which one?', 'Ipi?') }).then(function (r) { return r && r.ok ? r.transcript : ''; }); } });
        if (idx == null || idx < 0) return true;
        if (distinct[idx].c.danger) return true;
        press(distinct[idx].c.el); sayShort(distinct[idx].c.raw); return true;
      }
      press(best.c.el); sayShort(best.c.raw); return true;
    } catch (_) { return false; }
  }

  R.onIntentFallback(onIntent);
  root.NecpraVoiceUIAction = { _onIntent: onIntent, _collect: collect, _target: target };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceUIAction;
})(typeof window !== 'undefined' ? window : globalThis);
