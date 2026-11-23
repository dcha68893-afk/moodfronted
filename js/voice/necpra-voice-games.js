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
  var DIGW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  function chessMove(n) {
    var t = String(n).replace(/\b(one|two|three|four|five|six|seven|eight)\b/g, function (w) { return DIGW[w]; }).replace(/^(?:move|play|go|hamisha)\s+/, '').replace(/\b([a-h])\s+([1-8])\b/g, '$1$2').replace(/\b(?:to|too|into|-)\b/g, ' ').replace(/\s+/g, ' ').trim();
    var m = /^([a-h][1-8]) ?([a-h][1-8])$/.exec(t); return m ? [m[1], m[2]] : null;
  }
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
    var mv = chessMove(n); if (mv) return { type: 'chess-move', from: mv[0], to: mv[1] };
    if (/^(?:undo|undo (?:my )?(?:last )?move|take back(?: my)?(?: last)?(?: move)?|rudisha (?:hatua|mwendo))$/.test(n)) return { type: 'chess-ctl', ctl: 'undo' };
    if (/^(?:hint|give me a hint|show (?:me )?a hint|best move|what(?:s| is) the best move|kidokezo)$/.test(n)) return { type: 'chess-ctl', ctl: 'hint' };
    if (/^(?:flip|flip (?:the )?board|rotate (?:the )?board|geuza (?:ubao|bodi))$/.test(n)) return { type: 'chess-ctl', ctl: 'flip' };
    if (/^(?:new (?:chess )?game|start (?:a )?new (?:chess )?game|rematch|mchezo mpya)$/.test(n)) return { type: 'chess-ctl', ctl: 'new' };
    if (/^(?:resign|i resign|give up|surrender|jisalimishe|acha mchezo)$/.test(n)) return { type: 'chess-ctl', ctl: 'resign' };
    if (/^(?:first move|go to (?:the )?(?:first|start)|start of (?:the )?game)$/.test(n)) return { type: 'chess-ctl', ctl: 'first' };
    if (/^(?:previous move|step back|back one move|hatua ya nyuma)$/.test(n)) return { type: 'chess-ctl', ctl: 'prev' };
    if (/^(?:next move|step forward|forward one move|hatua inayofuata)$/.test(n)) return { type: 'chess-ctl', ctl: 'next' };
    if (/^(?:last move|latest move|go to (?:the )?(?:latest|end)|current position)$/.test(n)) return { type: 'chess-ctl', ctl: 'last' };
    if ((m = /^(?:promote(?: to)?|promotion|make it(?: a)?|pandisha kuwa)\s+(?:a\s+|an\s+)?(queen|rook|bishop|knight|malkia|ngome|askofu|farasi)$/.exec(n))) return { type: 'chess-promote', piece: { queen: 'q', malkia: 'q', rook: 'r', ngome: 'r', bishop: 'b', askofu: 'b', knight: 'n', farasi: 'n' }[m[1]] };
    if (/^(?:rotate(?: (?:the )?(?:piece|block))?|rotate power|zungusha)$/.test(n)) return { type: 'block-tool', tool: 'Rotate' };
    if (/^(?:shuffle(?: (?:the )?pieces)?|new pieces|changanya)$/.test(n)) return { type: 'block-tool', tool: 'Shuffle' };
    if (/^(?:blast|use (?:the )?blast|lipua)$/.test(n)) return { type: 'block-tool', tool: 'Blast' };
    if (/^(?:hold|hold (?:the |this )?piece|take (?:the )?(?:held|hold) piece|shikilia)$/.test(n)) return { type: 'block-hold' };
    if (/^(?:restart|restart (?:the )?(?:game|puzzle)|anza upya)$/.test(n)) return { type: 'block-restart' };
    if ((m = /^(?:(?:switch|change|go) to|play|fungua)\s+(levels|classic|daily)(?:\s+mode)?$/.exec(n))) return { type: 'block-mode', mode: m[1] };
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
    if (/^chess-/.test(p.type)) return chessRun(p, d, w, meta);
    if (/^block-/.test(p.type)) return blockRun(p, d, w, meta);
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

  /* Chess: presses the same board squares / buttons a player taps, so legality, check, clocks and the AI are the game's own. */
  async function chessRun(p, d, w, meta) {
    if (activeScreen() !== 'chess') { await say('Start Chess first. Say play chess.', 'Anza Chess kwanza. Sema cheza chess.'); return true; }
    function btn(id) { var b = d.getElementById(id); return b && !b.disabled ? b : null; }
    function squares() { return Array.prototype.slice.call(d.querySelectorAll('#chessBoard .ch-sq')); }
    function status() { return clean((d.getElementById('chessStatus') || {}).textContent); }
    function movesN() { return (d.getElementById('chMoves') || { children: [] }).children.length; }
    if (p.type === 'chess-move') {
      var sq = squares(); if (sq.length !== 64) { await say('The board is not ready, or 3D view is hiding it. Try again in a moment.', 'Ubao bado haujawa tayari. Jaribu tena baadaye.'); return true; }
      var lb = sq[0].querySelector('.ch-lb.lr'), flipped = !!(lb && clean(lb.textContent) === '1');
      function at(name) { var c = name.charCodeAt(0) - 97, r = 8 - Number(name[1]), k = flipped ? (7 - r) * 8 + (7 - c) : r * 8 + c; return squares()[k]; }
      var before = movesN(), s1 = at(p.from); s1.click(); await sleep(150);
      var s1b = at(p.from); if (!s1b.classList.contains('selected')) { await say('There is no piece of yours that can move from ' + p.from + ' right now.', 'Hakuna kipande chako kinachoweza kusogea kutoka ' + p.from + ' sasa.'); return true; }
      at(p.to).click(); await sleep(250);
      if (d.querySelector('#chOv .ch-promo button[data-q]')) { await say('Promote to which piece? Say queen, rook, bishop or knight.', 'Pandisha kuwa kipande gani? Sema malkia, ngome, askofu au farasi.'); return true; }
      if (movesN() === before) { var s2 = at(p.from); if (s2 && s2.classList.contains('selected')) s2.click(); await say(p.from + ' to ' + p.to + ' is not a legal move.', p.from + ' hadi ' + p.to + ' si hatua halali.'); return true; }
      V.audit('games.chess_move', Object.assign({ outcome: 'executed' }, meta)); var st = status(); await say('Moved ' + p.from + ' to ' + p.to + '.' + (st ? ' ' + st : ''), 'Nimesogeza ' + p.from + ' hadi ' + p.to + '.' + (st ? ' ' + st : '')); return true;
    }
    if (p.type === 'chess-promote') { var pb = d.querySelector('#chOv .ch-promo button[data-q="' + p.piece + '"]'); if (!pb) { await say('There is no promotion to choose right now.', 'Hakuna kupandishwa cheo kwa sasa.'); return true; } pb.click(); await sleep(250); await say('Promoted.', 'Imepandishwa.'); return true; }
    var ids = { undo: 'chUndo', hint: 'chHint', flip: 'chFlip', new: 'chNew', first: 'chFirst', prev: 'chPrev', next: 'chNext', last: 'chLast' };
    if (p.ctl === 'resign') {
      var rb = btn('chResign'); if (!rb) { await say('There is nothing to resign from right now.', 'Hakuna cha kujiondoa sasa.'); return true; }
      if (!(await confirmYes(T('Resign this game? You will lose.', 'Jisalimishe mchezo huu? Utashindwa.'), T('Yes, resign', 'Ndiyo, jisalimishe')))) { await say('Cancelled. The game continues.', 'Imeghairiwa. Mchezo unaendelea.'); return true; }
      rb.click(); V.audit('games.chess_resign', Object.assign({ outcome: 'executed' }, meta)); await say('You resigned.', 'Umejisalimisha.'); return true;
    }
    var b = btn(ids[p.ctl]); if (!b) { await say('That is not available right now.', 'Hilo halipatikani kwa sasa.'); return true; }
    b.click(); await sleep(300);
    var say1 = { undo: ['Move undone.', 'Hatua imerudishwa.'], hint: ['Hint shown on the board.', 'Kidokezo kimeonyeshwa kwenye ubao.'], flip: ['Board flipped.', 'Ubao umegeuzwa.'], new: ['Choose a side and level on the screen to start a new game.', 'Chagua upande na kiwango kwenye skrini kuanza mchezo mpya.'], first: ['First move.', 'Hatua ya kwanza.'], prev: ['Previous move.', 'Hatua ya nyuma.'], next: ['Next move.', 'Hatua inayofuata.'], last: ['Latest move.', 'Hatua ya mwisho.'] }[p.ctl];
    await say(say1[0], say1[1]); return true;
  }
  /* Block Puzzle: power tools, hold, modes and restart press the arcade's own buttons. Placing pieces is a drag, which stays on the screen. */
  async function blockRun(p, d, w, meta) {
    if (activeScreen() !== 'block') { await say('Start Block Puzzle first. Say play block puzzle.', 'Anza Block Puzzle kwanza. Sema cheza block puzzle.'); return true; }
    if (p.type === 'block-tool') { var tb = d.querySelector('#block .block-tool[title="' + p.tool + '"]'); if (!tb || tb.disabled) { await say(p.tool + ' is not available right now.', p.tool + ' haipatikani kwa sasa.'); return true; } tb.click(); await sleep(250); await say(p.tool + ' used.', p.tool + ' imetumika.'); return true; }
    if (p.type === 'block-hold') { var hb = d.getElementById('blockHold'); if (!hb || hb.disabled) { await say('Hold is not available right now.', 'Hold haipatikani kwa sasa.'); return true; } hb.click(); await sleep(250); await say('Hold used.', 'Hold imetumika.'); return true; }
    if (p.type === 'block-mode') { var mb = d.querySelector('#block [data-m="' + p.mode + '"]'); if (!mb) { await say('That mode is not available.', 'Hali hiyo haipatikani.'); return true; } mb.click(); await sleep(250); await say('Switched to ' + p.mode + ' mode.', 'Imebadilishwa kuwa hali ya ' + p.mode + '.'); return true; }
    if (p.type === 'block-restart') {
      if (!(await confirmYes(T('Restart Block Puzzle? Your current progress in this round is lost.', 'Anza upya Block Puzzle? Maendeleo ya raundi hii yatapotea.'), T('Yes, restart', 'Ndiyo, anza upya')))) { await say('Cancelled. Your game continues.', 'Imeghairiwa. Mchezo wako unaendelea.'); return true; }
      if (typeof w.restartBlock !== 'function') return false; w.restartBlock(); V.audit('games.block_restart', Object.assign({ outcome: 'executed' }, meta)); await say('Restarted.', 'Imeanza upya.'); return true;
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
  root.NecpraVoiceGames = { init: init, parse: parse, _onIntent: onIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceGames;
})(typeof window !== 'undefined' ? window : globalThis);
