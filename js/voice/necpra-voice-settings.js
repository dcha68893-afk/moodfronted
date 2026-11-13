/*! NECPRA Voice Settings (settings.html). Open a settings section, read a setting, flip an on/off switch, change a drop-down.
 *  It only ever clicks the screen's own controls, so validation, saving and syncing behave exactly as when touched.
 *  Safety: security, backup, sessions, PIN, password and account deletion are NEVER changed by voice, and privacy switches ask first. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents;
  if (!V || !UI || !R || !I) return;
  var T = UI.T, doc = root.document, busy = false;
  var SECTIONS = { profile: /profile|wasifu/, security: /security|usalama/, privacy: /privacy|faragha/, chat: /chats?|mazungumzo/, friends: /friends?|marafiki/, groups: /groups?|vikundi/, status: /status|hali/, notifications: /notifications?|arifa/, appearance: /appearance|theme|mwonekano/, storage: /storage|data usage|hifadhi/, mood: /mood/, advanced: /advanced|ya juu/, backup: /backup|chelezo/, danger: /danger|delete account|futa akaunti/ };
  var LABEL = { profile: 'Profile', security: 'Security', privacy: 'Privacy', chat: 'Chats', friends: 'Friends', groups: 'Groups', status: 'Status', notifications: 'Notifications', appearance: 'Appearance', storage: 'Storage', mood: 'Mood', advanced: 'Advanced', backup: 'Backup', danger: 'Danger zone' };
  var BLOCKED = /(two.?factor|2fa|password|passcode|\bpin\b|passkey|biometric|fingerprint|encrypt|backup|restore|session|linked device|logout|log out|sign out|delete|deactivate|account|block|recovery|key)/i;
  var SEARCH_ORDER = ['chat', 'privacy', 'notifications', 'appearance', 'friends', 'groups', 'status', 'storage', 'mood', 'advanced'];
  var SEARCH_SAFE = { chat: 1, privacy: 1, notifications: 1, appearance: 1, friends: 1, groups: 1, status: 1, storage: 1, mood: 1, advanced: 1 };

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function q(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function qa(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function say(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }
  function ask(prompt) { return function () { return R.capture({ mode: 'command', prompt: prompt, spokenPrompt: prompt }).then(function (r) { return r && r.ok ? r.transcript : ''; }); }; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function norm(s) { return I.norm(s); }
  function activeSection() { var a = q('.menu-item.active'); return a ? a.getAttribute('data-section') : ''; }
  async function openSection(id) {
    var m = doc.getElementById('menu-' + id); if (!m) return false;
    if (activeSection() !== id) { m.click(); await sleep(450); }
    return true;
  }
  function items() {
    return qa('.setting-item').map(function (el) {
      var l = q('.setting-label', el), cb = q('input[type="checkbox"]', el), sel = q('select', el);
      return { el: el, label: clean(l && l.textContent), desc: clean((q('.setting-description', el) || {}).textContent), cb: cb, sel: sel };
    }).filter(function (x) { return x.label && (x.cb || x.sel); });
  }
  function score(label, want) {
    var a = norm(label), b = norm(want).replace(/\b(setting|settings|option|toggle|switch|the|my)\b/g, ' ').replace(/\s+/g, ' ').trim(); if (!b) return 0;
    if (a === b) return 3; if (a.indexOf(b) >= 0) return 2; var w = b.split(' ').filter(function (x) { return x.length > 2; });
    return w.length && w.every(function (x) { return a.indexOf(x) >= 0; }) ? 1 : 0;
  }
  // Look in the open section first, then the safe sections, until a setting with that name is found.
  async function locate(name) {
    function best() { var b = null; items().forEach(function (it) { var sc = score(it.label, name); if (sc && (!b || sc > b.sc)) b = { it: it, sc: sc }; }); return b && b.it; }
    var hit = best(); if (hit) return { item: hit, section: activeSection() };
    for (var i = 0; i < SEARCH_ORDER.length; i++) { if (SEARCH_ORDER[i] === activeSection()) continue; if (!(await openSection(SEARCH_ORDER[i]))) continue; hit = best(); if (hit) return { item: hit, section: SEARCH_ORDER[i] }; }
    return null;
  }

  function parse(input) {
    var s = clean(input).replace(/[.!?,]+$/, ''), n = norm(s), m;
    s = s.replace(/^(?:(?:hey|hi|ok|okay|so|now)\s+)?(?:please\s+|tafadhali\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:please\s+)?(?:i\s+(?:want|wanna|need|would like)\s+to\s+|let me\s+|nataka\s+|naomba\s+)?/i, ''); n = norm(s);
    if ((m = /^(?:open|go to|show|take me to|fungua|nenda kwa|nipeleke|nionyeshe)\s+(?:the\s+|my\s+)?(.+?)(?:\s+settings?|\s+mipangilio)?$/i.exec(s))) { var w = I.norm(m[1]); for (var k in SECTIONS) if (SECTIONS[k].test(w) && w.split(' ').length <= 3) return { type: 'section', id: k }; }
    if ((m = /^(?:turn|switch|set)\s+(on|off)\s+(?:the\s+|my\s+)?(?:dark mode|dark theme)$/i.exec(s))) return { type: 'choose', name: 'theme', value: /^on$/i.test(m[1]) ? 'dark' : 'light' };
    if ((m = /^(?:turn|switch|set)\s+(on|off)\s+(?:the\s+|my\s+)?(.+)$/i.exec(s))) return { type: 'toggle', on: /^on$/i.test(m[1]), name: clean(m[2]) };
    if ((m = /^(?:turn|switch|set)\s+(?:the\s+|my\s+)?(.+?)\s+(on|off)$/i.exec(s))) return { type: 'toggle', on: /^on$/i.test(m[2]), name: clean(m[1]) };
    if ((m = /^(enable|disable|washa|zima)\s+(?:the\s+|my\s+)?(.+)$/i.exec(s))) return { type: 'toggle', on: /^(enable|washa)$/i.test(m[1]), name: clean(m[2]) };
    if ((m = /^(?:set|change|make|badilisha|weka)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to|kuwa|iwe)\s+(.+)$/i.exec(s))) return { type: 'choose', name: clean(m[1]), value: clean(m[2]) };
    if (/^(?:dark mode|use dark mode|go dark)$/.test(n)) return { type: 'choose', name: 'theme', value: 'dark' };
    if (/^(?:light mode|use light mode|go light)$/.test(n)) return { type: 'choose', name: 'theme', value: 'light' };
    if ((m = /^(?:is|are|what(?:'s| is)|check|angalia|je)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:on|off|enabled|disabled|turned on|turned off|set to))?(?:\s+(?:setting|settings))?$/i.exec(s)) && /^(?:is|are|what(?:'s| is)|check|angalia|je)\b/i.test(s)) return { type: 'read', name: clean(m[1]) };
    if (/^(?:what|which)\s+(?:settings|options)\s+(?:are|can)\b/.test(n)) return { type: 'list' };
    return null;
  }

  function state(it) { return it.cb ? (it.cb.checked ? T('on', 'imewashwa') : T('off', 'imezimwa')) : it.sel ? clean(it.sel.options[it.sel.selectedIndex] && it.sel.options[it.sel.selectedIndex].text) : ''; }
  async function confirmYes(title, yes) { var i = await UI.choose({ title: title, options: [{ label: yes }], voiceAnswer: ask(T('Say yes to confirm, or cancel.', 'Sema ndiyo kuthibitisha, au ghairi.')) }); return i === 0; }

  async function run(p, lang) {
    var meta = { module: 'settings', lang: lang };
    if (p.type === 'section') { if (!(await openSection(p.id))) return false; V.audit('settings.section', Object.assign({ outcome: 'executed' }, meta)); await say('Opened ' + LABEL[p.id] + ' settings.', 'Imefungua mipangilio ya ' + LABEL[p.id] + '.'); return true; }
    if (p.type === 'list') { var its = items(); if (!its.length) { await say('Open a settings section first.', 'Fungua sehemu ya mipangilio kwanza.'); return true; } var txt = its.slice(0, 8).map(function (x) { return x.label + ' ' + state(x); }).join('. '); UI.announce(txt); await V.speak(txt, { force: true }); return true; }
    if (BLOCKED.test(p.name || '') ) { await say('For your safety, that setting must be changed on the screen, not by voice.', 'Kwa usalama wako, mpangilio huo ubadilishwe kwenye skrini, si kwa sauti.'); return true; }
    var f = await locate(p.name);
    if (!f) { await say('I could not find a setting called "' + p.name + '".', 'Sikupata mpangilio uitwao "' + p.name + '".'); return true; }
    var it = f.item;
    if (BLOCKED.test(it.label) || !SEARCH_SAFE[f.section]) { await say('For your safety, that setting must be changed on the screen, not by voice.', 'Kwa usalama wako, mpangilio huo ubadilishwe kwenye skrini, si kwa sauti.'); return true; }
    if (p.type === 'read') { await say(it.label + ' is ' + state(it) + '.', it.label + ' ' + state(it) + '.'); return true; }
    if (p.type === 'toggle') {
      if (!it.cb) { await say(it.label + ' is a choice, not a switch. Say "set ' + it.label + ' to" and the option.', it.label + ' ni chaguo, si swichi.'); return true; }
      if (it.cb.checked === p.on) { await say(it.label + ' is already ' + state(it) + '.', it.label + ' tayari ' + state(it) + '.'); return true; }
      if (f.section === 'privacy' && !(await confirmYes(T('Turn ' + (p.on ? 'on ' : 'off ') + it.label + '?', (p.on ? 'Washa ' : 'Zima ') + it.label + '?'), T('Yes, turn ' + (p.on ? 'on' : 'off'), p.on ? 'Ndiyo, washa' : 'Ndiyo, zima')))) { await say('Cancelled. Nothing changed.', 'Imeghairiwa. Hakuna kilichobadilika.'); return true; }
      it.cb.click(); await sleep(500);
      var now = doc.contains(it.cb) ? it.cb.checked : null, after = items().filter(function (x) { return x.label === it.label; })[0]; if (after) now = after.cb ? after.cb.checked : now;
      V.audit('settings.toggle', Object.assign({ outcome: now === p.on ? 'executed' : 'error' }, meta));
      if (now === p.on) await say(it.label + ' is now ' + (p.on ? T('on', 'imewashwa') : T('off', 'imezimwa')) + '.', it.label + ' sasa ' + (p.on ? 'imewashwa' : 'imezimwa') + '.');
      else await say('The setting did not change. It may need a connection or be locked.', 'Mpangilio haukubadilika. Huenda unahitaji mtandao au umefungwa.');
      return true;
    }
    if (p.type === 'choose') {
      if (!it.sel) { await say(it.label + ' is a switch. Say "turn on ' + it.label + '" or "turn off".', it.label + ' ni swichi. Sema "washa" au "zima".'); return true; }
      var want = norm(p.value), opt = Array.prototype.filter.call(it.sel.options, function (o) { var t = norm(o.text), v = norm(o.value); return t === want || v === want || t.indexOf(want) >= 0; })[0];
      if (!opt) { await say('"' + p.value + '" is not an option for ' + it.label + '.', '"' + p.value + '" si chaguo la ' + it.label + '.'); return true; }
      it.sel.value = opt.value; it.sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400);
      V.audit('settings.choose', Object.assign({ outcome: 'executed' }, meta)); await say(it.label + ' is now ' + clean(opt.text) + '.', it.label + ' sasa ni ' + clean(opt.text) + '.'); return true;
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
  root.NecpraVoiceSettings = { init: init, parse: parse, _onIntent: onIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceSettings;
})(typeof window !== 'undefined' ? window : globalThis);
