/*! NECPRA Voice Knowledge: a written guide of what the app really has, so "how do I...", "what can I do in Friends", "what can you do" get a correct answer.
 *  Rules: every entry below was checked against the code (tabs, menus, voice commands). Nothing is guessed: when no entry fits, the assistant says so
 *  honestly and offers the list of topics instead of inventing an answer. Add new features here when they ship. English + Kiswahili. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI;
  function sw() { try { return /^sw/i.test(V.resolveLang()); } catch (_) { return false; } }
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function norm(t) { return clean(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }

  // k = words/phrases that point to the topic (any match scores); en / s = the answer.
  var TOPICS = [
    { id: 'overview', k: ['what can you do', 'what can i say', 'what can i do', 'what do you do', 'what can this app do', 'features', 'help me', 'how does voice work', 'unaweza kufanya nini', 'naweza kusema nini', 'nifanye nini', 'msaada', 'vipengele'],
      en: 'NECPRA has eight areas: Chats, Status, Groups, Friends, Games, Money, Settings and Tools, which holds DUKA SMART for your shop. You can speak to any of them. Say, for example: open chat with a name, send a message to a name, open Groups, post a status, play chess, what is my balance, or turn on dark mode. Ask me about any area, like "tell me about Friends".',
      s: 'NECPRA ina sehemu nane: Ujumbe, Hali, Vikundi, Marafiki, Michezo, Pesa, Mipangilio na Zana ambamo kuna DUKA SMART ya duka lako. Unaweza kuzungumza na yoyote. Sema kwa mfano: fungua mazungumzo na jina, tuma ujumbe kwa jina, fungua vikundi, chapisha hali, cheza chesi, salio langu ni kiasi gani, au washa dark mode. Uliza kuhusu sehemu yoyote, kama "niambie kuhusu Marafiki".' },
    { id: 'voice', k: ['voice', 'hands free', 'handsfree', 'microphone', 'mic', 'speak to', 'talk to the app', 'open voice', 'sauti', 'kipaza sauti', 'kuongea na programu'],
      en: 'Tap the microphone button, or press Alt and V, and speak. It stops by itself when you pause. For no tapping at all, turn on Hands-Free: the app then keeps listening while it is open and visible, and a bar shows when it listens. Say stop listening to turn it off. It listens only while the app is open on screen, never in the background. I always ask you to confirm before sending a message, and I never pay money by voice. English and Kiswahili both work.',
      s: 'Bonyeza kitufe cha kipaza sauti, au Alt na V, kisha ongea. Husimama chenyewe ukinyamaza. Bila kubonyeza kabisa, washa Hands-Free: programu itaendelea kusikiliza ikiwa imefunguliwa na inaonekana, na upau huonyesha inaposikiliza. Sema acha kusikiliza kuzima. Husikiliza tu programu ikiwa wazi, si nyuma. Daima nakuuliza uthibitishe kabla ya kutuma ujumbe, na silipi pesa kwa sauti. Kiingereza na Kiswahili vyote vinafanya kazi.' },
    { id: 'chats', k: ['chats', 'chat', 'messenger', 'messages', 'message', 'lock chat', 'locked chat', 'favourite', 'favorite', 'mark as unread', 'archive', 'mute', 'ujumbe', 'mazungumzo', 'funga mazungumzo'],
      en: 'Chats is your messenger. By voice you can say: open chat with a name, send a message to a name saying something, read my new messages, or reply. Voice always reads the message back and asks you to confirm before it sends. Touch and hold a chat in the list for Add to favourites, Mark as unread, Lock chat, Mute, Archive or Delete. Locked chats leave the main list and sit in a Locked chats section opened with your PIN or fingerprint. Touch and hold a single message for Reply, Forward, Copy, React, Star, Edit, Delete or Select.',
      s: 'Ujumbe ni sehemu ya mazungumzo. Kwa sauti sema: fungua mazungumzo na jina, tuma ujumbe kwa jina kwamba, soma ujumbe wangu mpya, au jibu. Kila mara nasoma ujumbe na kukuuliza uthibitishe kabla ya kutuma. Shikilia mazungumzo kwenye orodha kwa Pendwa, Weka alama haijasomwa, Funga mazungumzo, Nyamazisha, Hifadhi au Futa. Mazungumzo yaliyofungwa hutoka kwenye orodha kuu na kukaa sehemu ya Yaliyofungwa, hufunguliwa kwa PIN au alama ya kidole. Shikilia ujumbe mmoja kwa Jibu, Peleka, Nakili, Maoni, Nyota, Hariri, Futa au Chagua.' },
    { id: 'friends', k: ['friends', 'friend', 'friend request', 'add a friend', 'discover', 'nearby', 'marafiki', 'rafiki', 'ombi la urafiki'],
      en: 'Friends has tabs: Friends, Discover, Nearby, Requests, Sent and Groups. By voice you can say: open friends, show requests, accept a request from a name, accept all, decline a request from a name, cancel my request, add a name as a friend, remove a name from my friends, search for a name, how many friends do I have, or refresh. Adding, declining and removing always ask you to confirm first.',
      s: 'Marafiki ina tabo: Marafiki, Gundua, Karibu, Maombi, Yaliyotumwa na Vikundi. Kwa sauti sema: fungua marafiki, onyesha maombi, kubali ombi kutoka kwa jina, kubali yote, kataa ombi kutoka kwa jina, ghairi ombi langu, ongeza jina kuwa rafiki, ondoa jina kwenye marafiki zangu, tafuta jina, nina marafiki wangapi, au sasisha. Kuongeza, kukataa na kuondoa daima kunakuuliza uthibitishe kwanza.' },
    { id: 'groups', k: ['groups', 'group', 'create a group', 'new group', 'vikundi', 'kikundi', 'unda kikundi'],
      en: 'Groups holds your group chats. By voice you can say: open groups, open group and then its name, send a message to the group and its name, read the latest messages in a group, how many members are in this group, create a group called a name, close the group, or go back to the list. Voice reads your message back and asks you to confirm before it sends.',
      s: 'Vikundi lina mazungumzo ya vikundi vyako. Kwa sauti sema: fungua vikundi, fungua kikundi kisha jina lake, tuma ujumbe kwa kikundi jina lake, soma ujumbe wa mwisho wa kikundi, wanachama wangapi kwenye kikundi hiki, unda kikundi kinachoitwa jina, funga kikundi, au rudi kwenye orodha. Nasoma ujumbe wako na kukuuliza uthibitishe kabla ya kutuma.' },
    { id: 'status', k: ['status', 'statuses', 'vibes', 'vibe', 'moments', 'stories', 'post a status', 'hali', 'chapisha hali'],
      en: 'Status lets you post and watch updates from friends. By voice you can say: post a status saying something, show friends statuses, open discover, next, previous, react or love, reply with a message, delete my status, or close. Viewed statuses move from Recently updated into Viewed updates. Video and audio statuses play for a maximum of twenty seconds. Vibes is the video feed that mixes yours, your friends and public videos, with save, like, comment and download. Posting, replying and deleting ask you to confirm first.',
      s: 'Hali hukuwezesha kuchapisha na kutazama hali za marafiki. Kwa sauti sema: chapisha hali kwamba, onyesha hali za marafiki, fungua gundua, inayofuata, iliyopita, penda, jibu kwa ujumbe, futa hali yangu, au funga. Hali zilizotazamwa huhama kutoka Zilizosasishwa hivi karibuni hadi Zilizotazamwa. Hali za video na sauti huchezwa sekunde ishirini juu zaidi. Vibes ni mkondo wa video unaochanganya zako, za marafiki na za umma, kwa kuhifadhi, kupenda, kutoa maoni na kupakua. Kuchapisha, kujibu na kufuta kunakuuliza uthibitishe.' },
    { id: 'games', k: ['games', 'game', 'play', 'chess', 'trivia', 'crossword', 'block puzzle', 'coins', 'michezo', 'mchezo', 'cheza'],
      en: 'Games has chess, trivia, crossword and block puzzle. By voice you can say: play chess, play trivia, play crossword, play block puzzle, answer with a letter or the answer itself, how many coins do I have, what is my best score, mute or unmute, or go home to return to the list.',
      s: 'Michezo ina chesi, trivia, mseto wa maneno na block puzzle. Kwa sauti sema: cheza chesi, cheza trivia, cheza mseto wa maneno, cheza block puzzle, jibu kwa herufi au jibu lenyewe, nina sarafu ngapi, alama yangu bora ni ipi, nyamazisha au rudisha sauti, au nenda nyumbani kurudi kwenye orodha.' },
    { id: 'money', k: ['money', 'wallet', 'chama', 'circles', 'savings', 'goals', 'airtime', 'pay later', 'send money', 'balance', 'pesa', 'pochi', 'salio', 'akiba'],
      en: 'Money has tabs: Wallet, Activity, Airtime, Circles for chamas, family funds and trip pots, Goals, Pay Later and Requests. By voice you can ask: what is my balance, show my transactions, what did I receive, what did I spend, what are my orders, what is due this month in my chama, or who has not paid. You can also say send money to a name and an amount: I prepare the payment and open Send money for you, but I never complete a payment by voice. You always confirm it yourself on screen.',
      s: 'Pesa ina tabo: Pochi, Shughuli, Airtime, Duara kwa chama, mfuko wa familia na safari, Malengo, Lipa Baadaye na Maombi. Kwa sauti uliza: salio langu ni kiasi gani, onyesha miamala yangu, nimepokea nini, nimetumia nini, oda zangu ni zipi, chama kinatakiwa kulipa nini mwezi huu, au nani hajalipa. Unaweza pia kusema tuma pesa kwa jina na kiasi: naandaa malipo na kufungua Tuma pesa, lakini sikamilishi malipo kwa sauti. Wewe huthibitisha mwenyewe kwenye skrini.' },
    { id: 'duka', k: ['duka', 'duka smart', 'shop', 'tools', 'pos', 'sell', 'sale', 'stock', 'barcode', 'held bill', 'spoilage', 'instalment', 'installment', 'device financing', 'group buy', 'receipt', 'biashara', 'mauzo', 'nimeuza'],
      en: 'Tools holds DUKA SMART, the shop and point of sale. It has sales with automatic stock updates, held bills, a barcode scanner, receiving packs, stock batches, spoilage records, group buying drafts, device financing with instalment reminders, and PDF and Excel export. By voice, tell it what you sold in plain words, like I sold two bags of sugar for cash. I add the items to your cart and you check payment and tap Confirm sale yourself. M-PESA counts as paid only after NECPRA verifies the receipt code.',
      s: 'Zana ina DUKA SMART, duka na mauzo. Ina mauzo yanayosasisha stoo kiotomatiki, bili zilizoshikiliwa, skana ya barcode, kupokea vifurushi, makundi ya stoo, rekodi za bidhaa zilizoharibika, rasimu za ununuzi wa kikundi, ufadhili wa vifaa na vikumbusho vya malipo ya awamu, na kutoa PDF na Excel. Kwa sauti, sema ulichouza kwa maneno ya kawaida, kama nimeuza mifuko miwili ya sukari kwa pesa taslimu. Naweka bidhaa kikapuni, wewe huhakiki malipo na kubonyeza Thibitisha mauzo. M-PESA huhesabiwa kulipwa tu baada ya NECPRA kuthibitisha msimbo wa risiti.' },
    { id: 'settings', k: ['settings', 'privacy', 'security', 'notifications', 'dark mode', 'light mode', 'theme', 'backup', 'storage', 'read receipts', 'mipangilio', 'faragha', 'usalama', 'arifa'],
      en: 'Settings has sections: Profile, Security, Privacy, Notifications, Appearance, Storage, Backup, Chat, Friends, Groups, Status, Mood, Advanced and Danger zone. By voice you can say: open privacy settings, turn off read receipts, turn on notifications, dark mode, or light mode. Say read my settings to hear the current values.',
      s: 'Mipangilio ina sehemu: Wasifu, Usalama, Faragha, Arifa, Mwonekano, Hifadhi, Hifadhi nakala, Mazungumzo, Marafiki, Vikundi, Hali, Mood, Juu na Eneo la hatari. Kwa sauti sema: fungua mipangilio ya faragha, zima risiti za kusomwa, washa arifa, dark mode, au light mode. Sema soma mipangilio yangu kusikia thamani za sasa.' },
    { id: 'language', k: ['language', 'swahili', 'kiswahili', 'english', 'lugha'],
      en: 'You can speak English or Kiswahili. The voice language is set to automatic by default, and you can change it in the voice settings.',
      s: 'Unaweza kuongea Kiingereza au Kiswahili. Lugha ya sauti imewekwa kiotomatiki kwa kawaida, na unaweza kuibadilisha kwenye mipangilio ya sauti.' }
  ];

  var HOWTO = /^(?:hey |ok |okay |please )*(?:how (?:do|can|could|would|to|does)|how'?s|what can (?:i|you)|what (?:is|are|does) (?:the )?(?:feature|app|necpra|voice|hands ?free)|what do you|where (?:do|can|is|are)|is there (?:a|any) (?:way|feature|option|setting|button|tab|page|screen|menu|shortcut|command)\b|tell me (?:about|what)|explain|describe|help(?: me)?$|which (?:features|modules|screens)|nini (?:ninaweza|unaweza|naweza)|nawezaje|ninawezaje|naweza|unaweza|niambie|nieleze|ni nini|wapi|msaada|nifanye)/i;
  var WAKE = /^(?:hey |ok |okay )?(?:necpra |kynecta )?(?:open voice|start voice|voice mode|voice on|listen|fungua sauti|washa sauti|sikiliza)[.!]?$/i;

  function isHowTo(text) { return HOWTO.test(clean(text)); }
  function isWake(text) { return WAKE.test(clean(text)); }

  function score(q, t) {
    var best = 0; t.k.forEach(function (kw) { var n = norm(kw); if (!n) return; var hit = (' ' + q + ' ').indexOf(' ' + n + ' ') >= 0; if (hit) best = Math.max(best, n.split(' ').length * 10 + n.length / 100); });
    return best;
  }
  function find(text) {
    var q = norm(text), best = null, bs = 0;
    // "what can you do" style questions are about the whole app, never about one module
    if (/\b(what can you do|what can i say|what can i do|what do you do|unaweza kufanya nini|nini unaweza kufanya|ninaweza kufanya nini|nini ninaweza kufanya|naweza kusema nini|features|vipengele)\b/.test(q)) return TOPICS[0];
    TOPICS.forEach(function (t) { var s = score(q, t); if (s > bs) { bs = s; best = t; } });
    return bs > 0 ? best : null;
  }
  function topicNames() { return sw() ? 'ujumbe, marafiki, vikundi, hali, michezo, pesa, DUKA SMART, mipangilio, na jinsi sauti inavyofanya kazi' : 'chats, friends, groups, status, games, money, DUKA SMART, settings, and how voice works'; }

  // Answers aloud and on screen. Returns true if it answered (including an honest "I do not have that").
  function respond(text) {
    var t = find(text), m;
    if (t) m = sw() ? t.s : t.en;
    else if (isHowTo(text)) m = sw() ? 'Sina jibu la uhakika kuhusu hilo kwenye mwongozo wangu, kwa hiyo sitakisia. Naweza kueleza: ' + topicNames() + '. Sema niambie kuhusu mojawapo.' : 'I do not have a confirmed answer for that in my guide, so I will not guess. I can explain: ' + topicNames() + '. Say tell me about any of them.';
    else return false;
    try { if (UI && UI.announce) UI.announce(m); } catch (_) {}
    try { V.speak(m, { force: true }); } catch (_) {}
    return true;
  }

  root.NecpraVoiceKnowledge = { respond: respond, find: find, isHowTo: isHowTo, isWake: isWake, topics: TOPICS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NecpraVoiceKnowledge;
})(typeof window !== 'undefined' ? window : globalThis);
