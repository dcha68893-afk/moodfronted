/*! NECPRA Voice Games (game.html, the wrapper around the arcade in game-v3.html). Start a game, return to the arcade, answer trivia,
 *  mute the sound, read coins. Uses the arcade's own openGame()/home()/buttons, so coins, streaks and rules are unchanged. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents;
  if (!V || !UI || !R || !I) return;
  var T = UI.T, doc = root.document, busy = false;
  var GAMES = { block: /block|blocks|tetris|puzzle|vitalu/, trivia: /trivia|quiz|maswali/, crossword: /cross\s*word|maneno/, chess: /chess|chesi/ };
  var NAME = { block: 'Block Puzzle', trivia: 'Trivia Master', crossword: 'Crossword', chess: 'Chess' };

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function say(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }
  function ask(prompt) { return function () { return R.capture({ mode: 'command', prompt: prompt, spokenPrompt: prompt }).then(function (r) { return r && r.ok ? r.transcript : ''; }); }; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function frame() { return doc.getElementById('games'); }
  function W() { var f = frame(); try { return f && f.contentWindow && f.contentWindow.document ? f.contentWindow : null; } catch (_) { return null; } }
  function D() { var w = W(); return w ? w.document : null; }
  function activeScreen() { var d = D(), a = d && d.querySelector('.screen.active'); return a ? a.id : ''; }
  function arcadeText(id) { var d = D(), e = d && d.getElementById(id); return clean(e && e.textContent); }
  async function confirmYes(title, yes) { var i = await UI.choose({ title: title, options: [{ label: yes }], voiceAnswer: ask(T('Say yes to confirm, or cancel.', 'Sema ndiyo kuthibitisha, au ghairi.')) }); return i === 0; }

  var NUM = { a: 0, b: 1, c: 2, d: 3, one: 0, two: 1, three: 2, four: 3, first: 0, second: 1, third: 2, fourth: 3, '1': 0, '2': 1, '3': 2, '4': 3, moja: 0, mbili: 1, tatu: 2, nne: 3 };
  function parse(input) {
    var s = clean(input).replace(/[.!?,]+$/, ''), n = I.norm(s), m;
    n = n.replace(/^(?:hey |hi |ok |okay |so |now )?(?:please |tafadhali )?(?:can you |could you |would you )?(?:i want to |i wanna |let me |let s |nataka |naomba )?/, '');
    if ((m = /^(?:play|start|open|launch|begin|fungua|cheza|anza)\s+(?:a\s+game\s+of\s+|the\s+game\s+|a\s+game\s+|game\s+|the\s+|some\s+|a\s+)?(.+)$/.exec(n))) for (var g in GAMES) if (GAMES[g].test(m[1])) return { type: 'play', game: g };
    if (/^(?:go\s+)?(?:back\s+)?(?:to\s+)?(?:the\s+)?(?:arcade|home|games|game list|menu|main menu|orodha ya michezo|nyumbani)$/.test(n) || /^(?:go home|exit game|quit game|leave game|toka kwenye mchezo)$/.test(n)) return { type: 'home' };
    if ((m = /^(?:answer|choose|pick|select|option|jibu|chagua)\s+(?:is\s+)?(?:option\s+|number\s+|namba\s+)?([a-d1-4]|one|two|three|four|first|second|third|fourth|moja|mbili|tatu|nne)$/.exec(n)) && NUM[m[1]] != null) return { type: 'answer', index: NUM[m[1]] };
    if ((m = /^(?:answer|choose|pick|select|the answer is|jibu ni|jibu|chagua)\s+(.{2,})$/.exec(n))) return { type: 'answer-text', text: m[1].replace(/^(?:is\s+)?/, '') };
    if (/^(?:mute|silence|sound off|turn off (?:the )?sound|zima sauti)$/.test(n)) return { type: 'sound', on: false };
    if (/^(?:unmute|sound on|turn on (?:the )?sound|washa sauti)$/.test(n)) return { type: 'sound', on: true };
    if (/^(?:how many coins|my coins|coins|what(?:s| is) my balance|sarafu zangu|nina sarafu ngapi)(?: do i have)?$/.test(n)) return { type: 'coins' };
    if (/^(?:my best score|best score|high score|what(?:s| is) my best|alama yangu bora)$/.test(n)) return { type: 'best' };
    if (/^(?:read (?:the )?question|repeat (?:the )?question|soma swali|rudia swali)$/.test(n)) return { type: 'question' };
    if (/^(?:which|what)\s+games?\b.*$/.test(n) || /^(?:list|read)\s+(?:the\s+)?games$/.test(n)) return { type: 'list' };
    return null;
  }

  async function run(p, lang) {
    var meta = { module: 'games', lang: lang }, w = W(), d = D();
    if (!w || !d) { await say('The games are still loading. Try again in a moment.', 'Michezo bado inapakia. Jaribu tena baadaye.'); return true; }
    if (p.type === 'list') { await say('You can play Block Puzzle, Trivia Master, Crossword and Chess.', 'Unaweza kucheza Block Puzzle, Trivia Master, Crossword na Chess.'); return true; }
    if (p.type === 'coins') { await say('You have ' + (arcadeText('coins') || 'no') + ' coins.', 'Una sarafu ' + (arcadeText('coins') || '0') + '.'); return true; }
    if (p.type === 'best') { await say('Your best score is ' + (arcadeText('best') || 'not set yet') + '.', 'Alama yako bora ni ' + (arcadeText('best') || 'bado haijawekwa') + '.'); return true; }
    if (p.type === 'sound') { var b = d.getElementById('sndBtn'); if (!b) { await say('There is no sound button here.', 'Hakuna kitufe cha sauti hapa.'); return true; } b.click(); await say(p.on ? 'Sound toggled on.' : 'Sound toggled off.', p.on ? 'Sauti imewashwa.' : 'Sauti imezimwa.'); return true; }
    if (p.type === 'home') {
      if (activeScreen() === 'home') { await say('You are already in the arcade.', 'Tayari uko kwenye arcade.'); return true; }
      if (typeof w.home !== 'function') return false; w.home(); V.audit('games.home', Object.assign({ outcome: 'executed' }, meta)); await say('Back to the arcade.', 'Umerudi kwenye arcade.'); return true;
    }
    if (p.type === 'play') {
      var cur = activeScreen();
      if (cur && cur !== 'home' && cur !== p.game && !(await confirmYes(T('Leave the current game and start ' + NAME[p.game] + '?', 'Acha mchezo huu na uanze ' + NAME[p.game] + '?'), T('Yes, switch', 'Ndiyo, badilisha')))) { await say('Staying in the current game.', 'Unabaki kwenye mchezo huu.'); return true; }
      if (cur && cur !== 'home' && cur !== p.game && typeof w.home === 'function') { w.home(); await sleep(250); }
      if (typeof w.openGame !== 'function') { await say('That game is not ready yet.', 'Mchezo huo bado haujawa tayari.'); return true; }
      w.openGame(p.game); V.audit('games.play', Object.assign({ outcome: 'executed' }, meta)); await say('Starting ' + NAME[p.game] + '.', 'Inaanza ' + NAME[p.game] + '.'); return true;
    }
    // trivia in progress
    if (activeScreen() !== 'trivia') { await say('Start Trivia Master first, then answer by voice.', 'Anza Trivia Master kwanza, kisha jibu kwa sauti.'); return true; }
    var btns = Array.prototype.slice.call(d.querySelectorAll('#answers button, #answers [role="button"], #answers .ans, #answers > *')).filter(function (x, i, a) { return a.indexOf(x) === i && clean(x.textContent); });
    if (p.type === 'question') { var qq = arcadeText('q'); var opts = btns.map(function (x, i) { return 'Option ' + 'ABCD'[i] + ', ' + clean(x.textContent); }).join('. '); await say(qq + '. ' + opts, qq + '. ' + opts); return true; }
    if (!btns.length) { await say('There are no answers on screen yet.', 'Hakuna majibu kwenye skrini bado.'); return true; }
    var pick = null;
    if (p.type === 'answer') pick = btns[p.index]; else { var want = I.norm(p.text), c = btns.filter(function (x) { var t = I.norm(x.textContent); return t === want || t.indexOf(want) >= 0 || (want.indexOf(t) >= 0 && t.length > 2); }); if (c.length === 1) pick = c[0]; else if (c.length > 1) { await say('More than one answer matches. Say the letter instead.', 'Majibu zaidi ya moja yanalingana. Sema herufi badala yake.'); return true; } }
    if (!pick) { await say('I did not find that answer. Say A, B, C or D.', 'Sikupata jibu hilo. Sema A, B, C au D.'); return true; }
    pick.click(); V.audit('games.answer', Object.assign({ outcome: 'executed' }, meta)); return true;
  }

  function onIntent(payload) {
    if (!payload || payload.mode === 'probe') return false;
    var p = parse(payload.transcript); if (!p) return false;
    if (busy) return say('One moment, still working on the last request.', 'Subiri kidogo, bado nashughulikia ombi lililopita.').then(function () { return true; });
    busy = true;
    return run(p, payload.lang).then(function (ok) { busy = false; return ok; }, function (e) { busy = false; return say('That did not work: ' + ((e && e.message) || 'unknown error') + '.', 'Haikufanikiwa: ' + ((e && e.message) || 'hitilafu') + '.').then(function () { return true; }); });
  }
  function init() { R.onIntent(onIntent); return true; }
  root.NecpraVoiceGames = { init: init, parse: parse, _onIntent: onIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceGames;
})(typeof window !== 'undefined' ? window : globalThis);
