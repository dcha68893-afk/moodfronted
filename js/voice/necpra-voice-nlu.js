/*! NECPRA Voice NLU: free, offline "understand many ways of saying it" for the whole app. No network, no API, nothing leaves the phone.
 *
 *  HOW IT WORKS
 *   1. Words are normalised (case, punctuation, "5k" -> 5000, M-Pesa spellings) and mis-heard words are repaired against OUR OWN vocabulary only.
 *   2. Every action below has RULES. A rule = word groups that must ALL appear (any wording in the group counts: English, Kiswahili, Sheng),
 *      groups that must NOT appear, and optional boosters. Order and filler words ("please", "naomba", "can you") do not matter.
 *   3. The best rule wins, with a bonus for the screen the user is on. If two different actions score about the same, the assistant ASKS
 *      ("Did you mean ... or ...?") instead of guessing. If an action needs a name/amount that was not said, it asks for it.
 *   4. The winner becomes a CANONICAL PHRASE ("accept Denis", "how much did we sell today") that the on-screen handlers already understand,
 *      so their confirmations / privacy rules still apply. This file never executes anything itself.
 *
 *  TO ADD WORDS: add them to a group in GROUPS (one line). TO ADD A FEATURE: add a rule in RULES + a template in PHRASE/LABEL.
 *  Run tools/verify-voice-actions.js and tools/test-voice-nlu.js afterwards. */
(function (root) {
  'use strict';
  var S = root.NecpraVoiceSalesNLU || (typeof require === 'function' ? (function () { try { return require('./necpra-voice-sales-nlu.js'); } catch (_) { return null; } })() : null);

  /* ───────────── vocabulary (English / Kiswahili / Sheng). Words only: extend freely. ───────────── */
  var GROUPS = {
    FRIEND: ['friend', 'friends', 'rafiki', 'marafiki', 'mshikaji', 'washikaji', 'mate', 'mates', 'buddy', 'buddies', 'contact', 'contacts'],
    REQ: ['request', 'requests', 'ombi', 'maombi', 'invite', 'invites', 'invitation', 'invitations'],
    REQLIKE: ['request', 'requests', 'ombi', 'maombi', 'invitation', 'invitations', 'wants to be my friend', 'want to be my friend', 'anataka kuwa rafiki yangu', 'wanataka kuwa rafiki yangu', 'ametuma ombi', 'wametuma ombi', 'sent me a request', 'sent me an invite'],
    SENT: ['sent requests', 'sent request', 'outgoing', 'nimetuma', 'nilizotuma', 'nilituma', 'niliyotuma', 'nilizomtumia', 'zilizotumwa', 'ulizotuma', 'i sent', 'i have sent', 'that i sent', 'pending sent'],
    ACCEPT: ['umkubalie', 'nakubali', 'accept', 'accepted', 'approve', 'kubali', 'nikubalie', 'kubalia', 'mkubalie', 'nimekubali', 'say yes to', 'ruhusu'],
    DECLINE: ['decline', 'reject', 'refuse', 'ignore the request', 'ignore request', 'ignore the invite', 'ignore invite', 'ignore the friend request', 'kataa', 'nakataa', 'nimekataa', 'nikatalie', 'mkatalie', 'turn down', 'say no to'],
    CANCEL: ['cancel', 'withdraw', 'revoke', 'ghairi', 'ghairisha', 'take back', 'undo'],
    ADDV: ['add', 'ongeza', 'nongeza', 'make friends with', 'be friends with', 'befriend', 'kuwa rafiki na', 'tuma ombi', 'mtumie ombi', 'send request to', 'send a request to', 'send friend request to', 'send a friend request to', 'friend request to'],
    REMOVE_STRONG: ['unfriend', 'get rid of', 'stop being friends with', 'mwondoe', 'sitaki kuwa rafiki na', 'toa rafiki', 'futa rafiki', 'delete friend', 'remove friend'],
    REMOVE_WEAK: ['remove', 'delete', 'ondoa', 'futa', 'toa'],
    SEARCHV: ['search', 'find', 'look for', 'looking for', 'tafuta', 'nitafutie', 'nitafutie', 'tafutia'],
    REFRESHV: ['refresh', 'reload', 'update', 'sasisha', 'upya', 'pakia upya', 'leta upya'],
    SHOWV: ['go into', 'enter', 'ingia kwenye', 'ingia', 'jump into', 'watch', 'show', 'open', 'view', 'see', 'display', 'go to', 'take me to', 'onyesha', 'nionyeshe', 'onyeshe', 'fungua', 'angalia', 'nipeleke', 'tazama', 'nipe'],
    READV: ['sikia', 'nisikie', 'kusikia', 'nisikilize', 'read', 'list', 'tell me', 'who are', 'soma', 'nisomee', 'taja', 'niambie', 'orodhesha', 'nitajie'],
    WHO: ['whose', 'which person', 'who', 'nani', 'wapi'],
    ASKISH: ['is there', 'are there', 'do i have', 'have i got', 'have i', 'any', 'anyone', 'someone', 'somebody', 'kuna', 'je kuna', 'nimepata', 'nina', 'mtu', 'yeyote', 'new', 'mpya', 'check', 'angalia', 'kagua', 'tell me'],
    COUNTQ: ['mangapi', 'how many', 'number of', 'count', 'idadi', 'idadi ya', 'ngapi', 'wangapi', 'zangapi', 'kiasi'],
    DISCOVER: ['discover', 'gundua', 'suggestions', 'suggested', 'people you may know', 'find people', 'new people'],
    NEARBY: ['nearby', 'near me', 'karibu nami', 'wa karibu', 'karibu'],
    GROUPW: ['group', 'groups', 'kikundi', 'vikundi'],

    // money
    BAL: ['pesa zangu zimebaki', 'pesa zilizobaki', 'pesa nilizonazo', 'nimebakiwa na pesa ngapi', 'balance', 'salio', 'bal', 'how much money', 'how much do i have', 'how much have i got', 'pesa ngapi', 'nina pesa ngapi', 'nina kiasi gani', 'pesa zangu ngapi', 'kiasi kilichobaki', 'money in my wallet', 'money do i have', 'pochi ina'],
    TXN: ['what i paid', 'what i have paid', 'payments i made', 'nililolipa', 'malipo yangu', 'my payments', 'transaction', 'transactions', 'miamala', 'muamala', 'statement', 'recent payments', 'last payments', 'recent transactions', 'malipo ya hivi karibuni', 'historia ya malipo', 'payment history', 'history'],
    RECV: ['received', 'receive', 'got paid', 'came in', 'imeingia', 'nimepokea', 'nilipokea', 'pokea', 'nimepewa', 'nimetumiwa', 'wamenitumia', 'incoming', 'income'],
    SPENT: ['spent', 'spend', 'spending', 'nimetumia', 'nilitumia', 'matumizi', 'nimelipa', 'nimetoa', 'went out'],
    MONEYQ: ['how much', 'kiasi', 'ngapi', 'amount', 'total', 'jumla', 'pesa'],
    ORD: ['order', 'orders', 'oda', 'maagizo', 'unpaid orders', 'pending orders'],
    DUE: ['due', 'zinatakiwa', 'zinadaiwa', 'zinalipwa', 'expected', 'required'],
    PAST: ['yesterday', 'jana', 'juzi', 'last week', 'last month', 'wiki iliyopita', 'mwezi uliopita', 'mwezi jana', 'wiki jana', 'last year'],
    QW: ['what', 'which', 'anything', 'everything', 'something', 'zipi', 'gani', 'nini', 'zipi'],
    MYW: ['my', 'mine', 'yangu', 'zangu', 'langu', 'wangu', 'yetu', 'zetu', 'our', 'what is', 'whats', 'what are', 'how much', 'how many', 'nini', 'gani'],
    MONEYW: ['money', 'pesa', 'cash', 'shillings', 'shilingi', 'bob', 'ksh', 'kes', 'elfu', 'mia', 'hela'],
    CHAMA: ['chama', 'chamas', 'michango', 'contribution', 'contributions', 'merry go round', 'table banking', 'mchango'],
    MONTH: ['month', 'mwezi', 'this month', 'mwezi huu', 'monthly'],
    OWE: ['outstanding', 'owe', 'owing', 'owes', 'unpaid', 'not paid', 'hasnt paid', 'havent paid', 'hawajalipa', 'hajalipa', 'bado hawajalipa', 'haijalipwa', 'defaulters', 'wanadaiwa', 'deni', 'madeni'],
    AIRTIME: ['airtime', 'recharge', 'top up', 'topup', 'credo', 'bundles', 'data bundles', 'buy airtime', 'nunua airtime', 'bundles za data'],
    GOALS: ['savings', 'saving goals', 'savings goals', 'goals', 'akiba', 'malengo', 'malengo ya akiba'],
    PAYLATER: ['pay later', 'lipa baadaye', 'paylater'],
    PAYREQ: ['payment requests', 'payment request', 'money requests', 'maombi ya malipo'],
    ACTIVITY: ['activity', 'shughuli'],
    WALLET: ['wallet', 'pochi', 'mkoba', 'money', 'pesa'],
    SENDV: ['send', 'pay', 'transfer', 'tuma', 'lipa', 'mtumie', 'nitumie', 'mpe', 'give'],
    PHONE: ['phone', 'number', 'namba', 'simu'],

    // DUKA SMART
    SALEV: ['sold', 'nimeuza', 'niliuza', 'tumeuza', 'ameuza', 'nimeuzia', 'tumeuzia', 'we have sold', 'i have sold'],
    STOCKW: ['stock', 'stoku', 'left', 'remaining', 'zimebaki', 'imebaki', 'zilizobaki', 'iliyobaki', 'umebaki', 'umebaki', 'zimebakia'],
    HAVEQ: ['do we have', 'do i have', 'have we got', 'is there', 'are there', 'tuna', 'kuna', 'bado', 'tumebakiwa na', 'nina'],
    PRODUCTW: ['product', 'products', 'bidhaa', 'item', 'items', 'vitu', 'goods', 'bidhaa zote'],
    LOW: ['zinazoisha', 'zinazokwisha', 'zilizoisha', 'zinazokaribia kuisha', 'low', 'running low', 'running out', 'out of stock', 'finished', 'sold out', 'zinaisha', 'zimeisha', 'zinakaribia kuisha', 'almost finished', 'imeisha', 'kuisha', 'shortage', 'restock', 'finishing', 'zinakwisha', 'zimekwisha'],
    CUST: ['customers', 'customer', 'wateja', 'mteja', 'clients', 'client'],
    REPORTW: ['sales', 'sell', 'takings', 'income', 'mauzo', 'faida', 'profit', 'revenue', 'mapato', 'report', 'ripoti', 'tumepata', 'we made', 'we make', 'did we make'],
    TODAY: ['today', 'leo', 'sasa', 'hivi leo'],
    WEEK: ['week', 'wiki', 'juma', 'this week', 'wiki hii', 'weekly'],
    DEBT: ['not paid me', 'hasnt paid me', 'havent paid me', 'hawajanilipa', 'hajanilipa', 'wamenidai', 'owe', 'owes', 'owing', 'debt', 'debts', 'deni', 'madeni', 'wanadaiwa', 'anadaiwa', 'credit customers', 'on credit', 'wadeni', 'mdeni', 'wanatudai', 'ananidai', 'wananidai'],
    EXPV: ['spent', 'spend', 'nimetumia', 'nilitumia', 'nimelipa', 'matumizi', 'expense', 'expenses', 'gharama', 'i paid', 'nililipia', 'nimelipia'],
    ADDP: ['add', 'ongeza', 'new product', 'bidhaa mpya', 'register', 'weka', 'create', 'andika', 'sajili'],
    NEWW: ['new', 'mpya'],

    // messages (Messenger)
    MSGW: ['message', 'messages', 'ujumbe', 'texts', 'sms', 'meseji', 'inbox'],
    CHATW: ['chat', 'chats', 'conversation', 'conversations', 'mazungumzo', 'mazungumzo na'],
    UNREAD: ['unread', 'new', 'mpya', 'pending', 'waiting', 'hazijasomwa', 'latest', 'za mwisho', 'recent'],
    FROMW: ['from', 'kutoka kwa', 'kutoka', 'za', 'wa', 'ya', 'cha'],
    // groups
    MEMBERS: ['people in', 'people are in', 'people are there in', 'watu wangapi', 'watu wamo', 'member', 'members', 'wanachama', 'mwanachama', 'who is in', 'nani yumo', 'nani wamo'],
    CREATEV: ['create', 'make', 'start', 'unda', 'anzisha', 'new group', 'kikundi kipya'],
    CLOSEW: ['close', 'exit', 'funga', 'toka', 'leave'],
    // status
    STATUSW: ['status', 'statuses', 'hali', 'moment', 'moments', 'story', 'stories'],
    VIBES: ['vibe', 'vibes', 'vibu'],
    POSTV: ['add a new', 'add', 'ongeza', 'post', 'share', 'chapisha', 'weka', 'upload', 'put up'],
    NEXTW: ['next', 'inayofuata', 'mbele', 'skip'],
    PREVW: ['previous', 'iliyopita', 'nyuma kidogo', 'go back one'],
    LOVEW: ['love', 'heart', 'penda', 'like this', 'like it'],
    // settings
    SETTINGSW: ['settings', 'setting', 'mipangilio', 'mpangilio'],
    SECTION_PROFILE: ['profile', 'wasifu'], SECTION_SECURITY: ['security', 'usalama'], SECTION_PRIVACY: ['privacy', 'faragha'], SECTION_NOTIF: ['notifications', 'notification', 'arifa'],
    SECTION_APPEAR: ['appearance', 'theme', 'mwonekano', 'mandhari'], SECTION_STORAGE: ['storage', 'data usage', 'hifadhi'], SECTION_ADV: ['advanced', 'ya juu'], SECTION_CHAT: ['chat', 'chats', 'mazungumzo'],
    DARK: ['dark mode', 'dark theme', 'go dark', 'hali ya giza', 'mandhari ya giza', 'giza mode'],
    LIGHT: ['light mode', 'light theme', 'go light', 'hali ya mwanga', 'mandhari ya mwanga', 'mwanga mode'],
    SETTINGNAME: ['notification', 'notifications', 'arifa', 'read receipts', 'read receipt', 'last seen', 'typing indicator', 'typing indicators', 'online status', 'sound', 'sounds', 'vibration', 'previews', 'preview', 'autoplay', 'auto download', 'data saver', 'sauti', 'mtetemo'],
    TURNON: ['turn on', 'switch on', 'enable', 'washa', 'weka on'],
    TURNOFF: ['turn off', 'switch off', 'disable', 'zima', 'weka off'],
    // games
    GAMEW: ['game', 'games', 'michezo', 'mchezo'],
    PLAYV: ['play', 'playing', 'cheza', 'kucheza', 'start', 'anza', 'launch'],
    G_BLOCK: ['block', 'blocks', 'tetris', 'puzzle', 'vitalu'], G_TRIVIA: ['trivia', 'quiz', 'maswali'], G_CROSS: ['crossword', 'cross word', 'maneno'], G_CHESS: ['chess', 'chesi'],
    COINS: ['coins', 'coin', 'sarafu'],
    BEST: ['highest score', 'top score', 'alama ya juu', 'alama yangu ya juu', 'alama kubwa', 'best score', 'high score', 'alama bora', 'alama yangu bora', 'my best'],
    MUTE: ['mute', 'silence', 'sound off', 'zima sauti', 'turn off sound'],
    UNMUTE: ['unmute', 'sound on', 'washa sauti', 'turn on sound'],
    QUESTIONW: ['question', 'swali'],
    ARCADE: ['arcade', 'game list', 'main menu', 'orodha ya michezo', 'game menu'],
    LISTQ: ['which', 'what', 'can i play', 'gani', 'zipi', 'orodha', 'list', 'available'],

    // generic
    BACKW: ['back', 'rudi', 'nyuma', 'return', 'go back'],
    NEG: ['not', 'dont', 'sitaki', 'hapana', 'no'],
    STOP: ['please', 'pls', 'plz', 'can', 'you', 'could', 'would', 'will', 'kindly', 'tafadhali', 'naomba', 'nataka', 'tafadhal', 'hey', 'ok', 'okay', 'now', 'sasa', 'chochote', 'yoyote', 'kipya', 'kingine', 'kinaitwa', 'let', 'see', 'posted', 'as', 'what', 'called', 'named', 'iitwayo', 'jina', 'want', 'wanna', 'need', 'nahitaji', 'the', 'a', 'an', 'my', 'me', 'i', 'we', 'our', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'got', 'to', 'for', 'from', 'of', 'in', 'on', 'at', 'and', 'it', 'this', 'that', 'there', 'as', 'with', 'be', 'by', 'about', 'some', 'yangu', 'zangu', 'wangu', 'langu', 'ya', 'wa', 'za', 'la', 'kwa', 'na', 'kutoka', 'huyu', 'huu', 'hii', 'hizi', 'hizo', 'ile', 'yule', 'moja', 'tu', 'basi', 'sasa hivi', 'wa', 'cha', 'kwenye', 'ndani', 'ya', 'ni', 'si', 'je']
  };


  /* ───────────── EXTRA WORDING (free, offline). One line per group; add more words here any time. ───────────── */
  function addWords(g, list) { GROUPS[g] = GROUPS[g] || []; list.forEach(function (w) { if (GROUPS[g].indexOf(w) < 0) GROUPS[g].push(w); }); }
  // Duka: more ways to say the same things (English / Kiswahili / Sheng)
  addWords('PRODUCTW', ['inventory', 'catalogue', 'catalog', 'bidhaa zangu', 'mali', 'mzigo', 'mizigo', 'stock items', 'vitu vyangu', 'bidhaa dukani']);
  addWords('STOCKW', ['inventory', 'stocks', 'stock level', 'stock levels', 'zilizopo', 'iliyopo', 'zipo', 'ipo', 'bado zipo', 'bado ipo', 'stoo', 'bado imebaki', 'bado zimebaki', 'imesalia', 'zimesalia', 'iliyosalia', 'zilizosalia', 'zimebakia', 'kiasi kilichosalia']);
  addWords('LOW', ['inaisha', 'inakwisha', 'zimebaki chache', 'chache', 'few left', 'almost out', 'nearly out', 'running short', 'short of', 'low stock', 'stock ndogo', 'stoku ndogo', 'zinakaribia kwisha', 'karibu kuisha', 'karibia kuisha', 'hazipo', 'haipo', 'haziko', 'hakuna tena', 'need to restock', 'nahitaji kuagiza', 'ninahitaji kuagiza', 'za kuagiza', 'order more', 'agiza zaidi']);
  addWords('CUST', ['wateja wangu', 'mteja wangu', 'buyers', 'wanunuzi', 'mnunuzi', 'customer list', 'orodha ya wateja', 'wateja wote']);
  addWords('REPORTW', ['summary', 'muhtasari', 'turnover', 'nimeingiza', 'tumeingiza', 'biashara', 'business', 'sales report', 'ripoti ya mauzo', 'mauzo ya leo', 'mauzo ya wiki', 'mauzo ya mwezi', 'how is business', 'vipi biashara', 'biashara imeendeleaje', 'pesa ya mauzo', 'jumla ya mauzo', 'total sales']);
  addWords('DEBT', ['wanaodaiwa', 'wanaonidai', 'wamekopa', 'amekopa', 'wakopaji', 'mkopaji', 'wakopaji wangu', 'nilimkopesha', 'nimewakopesha', 'nimekopesha', 'kukopesha', 'wateja wanaodaiwa', 'who borrowed', 'borrowed', 'on tab', 'wanadaiwa pesa', 'madeni ya wateja', 'deni la wateja', 'receivables', 'unpaid customers', 'wateja ambao hawajalipa', 'bado hawajalipa']);
  addWords('EXPV', ['expenditure', 'record expense', 'add expense', 'rekodi gharama', 'rekodi matumizi', 'andika matumizi', 'weka gharama', 'weka matumizi', 'paid out', 'paid for', 'nimelipa bill', 'nimelipia bill', 'matumizi ya duka', 'gharama za duka', 'ongeza gharama', 'ongeza matumizi']);
  addWords('ADDP', ['rekodi bidhaa', 'weka bidhaa', 'sajili bidhaa', 'ingiza bidhaa', 'new item', 'add item', 'bidhaa mpya', 'ongeza kitu']);
  addWords('SALEV', ['nimemuuzia', 'tumemuuzia', 'niliuzia', 'nimeuzia', 'sold out', 'we sold', 'i sold', 'wamenunua', 'amenunua', 'mteja amenunua', 'customer bought', 'nimepiga mauzo', 'nimeuza leo', 'nimeuziwa']);
  // Duka: NEW groups (screens and features that used to be missed)
  GROUPS.SUPPLIERW = ['supplier', 'suppliers', 'msambazaji', 'wasambazaji', 'wauzaji wangu', 'wauzaji', 'muuzaji wa jumla', 'wauzaji wa jumla', 'wa jumla', 'vendor', 'vendors', 'wholesaler', 'wholesalers', 'wholesale', 'who supplies', 'wanaonisambazia', 'wanaoniuzia', 'wasambazaji wangu', 'wasambaji', 'msambaji'];
  GROUPS.WASTEW = ['waste', 'wastage', 'wasted', 'spoilt', 'spoiled', 'spoil', 'spoilage', 'expired', 'expiry', 'expiring', 'expire', 'perishable', 'perishables', 'upotevu', 'imeharibika', 'zimeharibika', 'zinaharibika', 'zilizoharibika', 'kuharibika', 'zimeoza', 'imeoza', 'kuoza', 'zimeexpire', 'imeexpire', 'zinakaribia kuharibika', 'zilizopita muda', 'imepita muda', 'zimepita muda', 'damaged goods', 'bidhaa zilizoharibika', 'bidhaa mbovu', 'mbovu', 'zimevunjika', 'imevunjika', 'broken goods', 'throw away', 'tupa', 'kutupa'];
  GROUPS.GROUPBUYW = ['group buy', 'group buying', 'group order', 'group orders', 'buy together', 'buying together', 'ununuzi wa pamoja', 'nunua pamoja', 'kununua pamoja', 'oda za pamoja', 'oda ya pamoja', 'manunuzi ya pamoja', 'bulk buy', 'bulk buying', 'bulk order', 'kuagiza pamoja', 'agiza pamoja', 'pool order'];
  GROUPS.REFUNDW = ['refund', 'refunds', 'refunded', 'void', 'void sale', 'rudisha pesa', 'rejesha pesa', 'kurejesha pesa', 'kurudisha pesa', 'nirudishie pesa', 'futa mauzo', 'ghairi mauzo', 'cancel sale', 'cancel the sale', 'cancel a sale', 'undo sale', 'undo the sale', 'undo a sale', 'reverse sale', 'reverse the sale', 'customer returned', 'mteja amerudisha', 'amerudisha', 'wamerudisha', 'rudisha bidhaa', 'kurudisha bidhaa', 'return item', 'returned item', 'return goods', 'returns', 'makosa ya mauzo', 'sale mistake', 'wrong sale', 'nimekosea mauzo', 'mauzo yamekosewa'];
  GROUPS.SALESHIST = ['sales history', 'past sales', 'sales list', 'all sales', 'historia ya mauzo', 'orodha ya mauzo', 'mauzo yote', 'mauzo ya zamani', 'old sales', 'previous sales'];
  GROUPS.SCREENW = ['tab', 'screen', 'page', 'section', 'ukurasa', 'sehemu', 'skrini', 'kichupo', 'dirisha', 'menu', 'orodha'];
  // Other modules: a few more everyday ways of speaking
  addWords('SHOWV', ['let me see', 'nipe ona', 'niangalie', 'niletee', 'leta', 'toa', 'bring up', 'switch to', 'badilisha hadi', 'nenda kwa', 'enda kwa', 'nifungulie', 'nifungulie ukurasa', 'pita kwa', 'nionyeshe tafadhali']);
  addWords('BAL', ['pochi yangu', 'salio la pochi', 'salio langu', 'wallet balance', 'how much is in my wallet', 'cash i have', 'kiasi cha pesa', 'nina bei gani', 'pesa ziko ngapi', 'pesa zimebaki ngapi', 'hela zangu', 'hela zimebaki', 'nina hela ngapi', 'nina bob ngapi']);
  addWords('FRIEND', ['jamaa', 'wandani', 'ndugu', 'bro', 'mpenzi wangu']);
  addWords('MSGW', ['textu', 'maandishi', 'ujumbe mpya', 'mesej', 'dm', 'dms', 'inbox yangu']);
  addWords('GROUPW', ['group chat', 'group chats', 'kundi', 'makundi', 'jamii']);
  addWords('GAMEW', ['games', 'michezo yangu', 'mchezo wa', 'game za', 'michezo ya kucheza']);
  addWords('STATUSW', ['stori', 'hadithi zangu', 'hali zangu', 'hali za marafiki']);
  addWords('SETTINGSW', ['mipangilio yangu', 'sehemu ya settings', 'setting za', 'settings za']);

  /* ───────────── compile ───────────── */
  var RE = {}, VOCAB = [], seenV = {};
  Object.keys(GROUPS).forEach(function (k) {
    var w = GROUPS[k].slice().sort(function (a, b) { return b.length - a.length; });
    RE[k] = { test: new RegExp(' (?:' + w.map(esc).join('|') + ')(?= )'), strip: new RegExp(' (?:' + w.map(esc).join('|') + ')(?= )', 'g') };
    w.forEach(function (x) { if (/^[a-z]{5,}$/.test(x) && !seenV[x]) { seenV[x] = 1; if (k !== 'STOP') VOCAB.push(x); } });
  });
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var TOKSET = {}; Object.keys(GROUPS).forEach(function (k) { GROUPS[k].forEach(function (ph) { String(ph).split(' ').forEach(function (w) { if (w) TOKSET[w] = 1; }); }); });   // words we already know, even inside longer phrases, are never 'repaired' into another word

  function lev(a, b) {
    if (a === b) return 0; if (Math.abs(a.length - b.length) > 1) return 2;
    var i, j, prev = [], cur;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur = [i]; for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }
  function swapped(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); return false; }

  /* Repair mis-heard words against OUR vocabulary. Capitalised words after the first are left alone (likely names). */
  function repair(raw) {
    return String(raw || '').split(/\s+/).map(function (w, i) {
      var k = w.toLowerCase().replace(/[^a-z]/g, ''); if (k.length < 5 || seenV[k] || TOKSET[k] || (i > 0 && /^[A-Z]/.test(w))) return w;
      var hit = null;
      for (var j = 0; j < VOCAB.length; j++) { var v = VOCAB[j]; if (lev(k, v) === 1 || swapped(k, v)) { if (hit && hit !== v) return w; hit = v; } }
      return hit || w;
    }).join(' ');
  }

  function norm(t) {
    t = String(t || '').toLowerCase();
    try { t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    t = t.replace(/\b(?:have not|havent|haven t|not|yet to|sijasoma|bado sijasoma|bado kusoma)\s+read\b/g, 'unread').replace(/\bm[\s-]?pesa\b/g, 'mpesa').replace(/(\d),(\d{3})/g, '$1$2').replace(/\b(\d+(?:\.\d+)?)\s?k\b/g, function (_, n) { return String(Math.round(parseFloat(n) * 1000)); })
      .replace(/['’`]s\b/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
    return ' ' + t + ' ';
  }
  var has = function (g, t) { return RE[g].test.test(t); };
  var strip = function (t, gs) { gs.forEach(function (g) { t = t.replace(RE[g].strip, ' '); }); return t; };

  /* ───────────── slot extraction ───────────── */
  function words(t) { return t.replace(/\s+/g, ' ').trim(); }
  function leftover(t, gs) { return words(strip(strip(t, gs), ['STOP'])); }
  function nameOf(t, gs) { var l = leftover(t, gs.concat(['REQ', 'FRIEND', 'ACCEPT', 'DECLINE', 'CANCEL', 'ADDV', 'REMOVE_STRONG', 'REMOVE_WEAK', 'SEARCHV', 'SHOWV', 'SENT'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); if (!l) return null; var p = l.split(' ').slice(0, 3); return p.join(' ').replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); }
  function amountOf(t) {
    var phone = /(?:\+?254|\b0)\d{8,9}\b/.exec(t), tt = phone ? t.replace(phone[0], ' ') : t;
    var m = /\b(\d{1,9})\b/.exec(tt); if (m) return +m[1];
    if (S && S.parseQuantityAnswer) { var a = S.parseQuantityAnswer(tt.replace(/\b(?:to|kwa)\b.*$/, '')); if (a) { var n = a.amount != null ? a.amount : a.qty; if (n > 0) return n; } }
    return null;
  }
  function phoneOf(t) { var m = /(\+?254\d{8,9}|\b0\d{8,9})\b/.exec(t); return m ? m[1] : null; }
  function period(t, dflt) { return has('MONTH', t) ? 'month' : has('WEEK', t) ? 'week' : has('TODAY', t) ? 'today' : dflt; }
  function numAfter(t, re) { var m = re.exec(t); return m ? +m[1] : null; }

  /* ───────────── actions: spoken label (for "Did you mean...") + canonical phrase. Mirrors moodchat/src/services/voiceActions.js ───────────── */
  var FRIEND_TAB = { friends: 'show my friends list', discover: 'show discover', requests: 'show requests', sent: 'show sent requests', groups: 'show discover groups', nearby: 'show nearby' };
  var MONEY_TAB = { wallet: 'open wallet', circles: 'open chama', goals: 'open savings goals', requests: 'open payment requests', paylater: 'open pay later', airtime: 'open airtime', activity: 'open activity' };
  var MODMAP = { nav: 'shell', friends: 'friends', money: 'money', duka: 'tools', messages: 'messages', groups: 'group', status: 'status', settings: 'settings', games: 'games' };
  var NAV_WORD = { messages: 'messenger', money: 'wallet', friends: 'friends', tools: 'duka smart', group: 'groups', status: 'status', settings: 'settings', games: 'games' };
  var DUKA_TAB = { dashboard: 'dashboard', sell: 'sell', sales: 'sales', products: 'products', money: 'money', expenses: 'expenses', debts: 'debts', reports: 'reports', settings: 'settings' };
  var GAME_WORD = { block: 'block puzzle', trivia: 'trivia', crossword: 'crossword', chess: 'chess' };
  var PHRASE = {
    'nav.open': function (s) { return 'open ' + NAV_WORD[s.page]; }, 'nav.back': function () { return 'go back'; },
    'messages.unread_check': function () { return 'do i have any unread messages'; }, 'messages.read_new': function () { return 'read my new messages'; },
    'messages.read_from': function (s) { return 'read my messages from ' + s.name; }, 'messages.open_chat': function (s) { return 'open chat with ' + s.name; }, 'messages.search_chat': function (s) { return 'search chat with ' + s.name; },
    'groups.open': function (s) { return 'open group ' + s.name; }, 'groups.create': function (s) { return 'create group ' + s.name; }, 'groups.read': function () { return 'read the latest group messages'; },
    'groups.members': function () { return 'show members'; }, 'groups.member_count': function () { return 'how many members'; }, 'groups.count': function () { return 'how many groups do i have'; },
    'groups.refresh': function () { return 'refresh groups'; }, 'groups.close': function () { return 'close this group'; },
    'status.view': function (s) { return 'show ' + s.name + ' status'; }, 'status.who': function () { return 'who posted a status'; }, 'status.count': function () { return 'are there any new statuses'; },
    'status.post_open': function () { return 'create a status'; }, 'status.next': function () { return 'next status'; }, 'status.prev': function () { return 'previous status'; },
    'status.close': function () { return 'close status'; }, 'status.vibes': function () { return 'open vibes'; }, 'status.love': function () { return 'love this status'; },
    'settings.open_section': function (s) { return 'open ' + s.section + ' settings'; }, 'settings.theme': function (s) { return s.theme === 'dark' ? 'turn on dark mode' : 'turn off dark mode'; },
    'settings.toggle': function (s) { return 'turn ' + s.state + ' ' + s.name; },
    'games.play': function (s) { return 'play ' + GAME_WORD[s.game]; }, 'games.home': function () { return 'go to the arcade'; }, 'games.coins': function () { return 'how many coins do i have'; },
    'games.best': function () { return 'my best score'; }, 'games.list': function () { return 'which games can i play'; }, 'games.sound': function (s) { return s.state === 'off' ? 'mute' : 'unmute'; }, 'games.question': function () { return 'read the question'; },
    'friends.open_tab': function (s) { return FRIEND_TAB[s.tab]; }, 'friends.check_requests': function () { return 'do i have any friend requests'; },
    'friends.count_friends': function () { return 'how many friends do i have'; }, 'friends.count_requests': function () { return 'how many requests do i have'; },
    'friends.read_friends': function () { return 'read my friends'; }, 'friends.read_requests': function () { return 'read my requests'; },
    'friends.accept': function (s) { return 'accept ' + s.name; }, 'friends.decline': function (s) { return 'decline ' + s.name; },
    'friends.cancel': function (s) { return 'cancel my request to ' + s.name; }, 'friends.add': function (s) { return 'add ' + s.name + ' as a friend'; },
    'friends.remove': function (s) { return 'remove ' + s.name + ' from my friends'; }, 'friends.search': function (s) { return 'search for ' + s.query; }, 'friends.refresh': function () { return 'refresh friends'; },
    'money.balance': function () { return 'what is my balance'; }, 'money.transactions': function () { return 'show my latest transactions'; }, 'money.received': function () { return 'how much have i received'; },
    'money.spent': function (s) { return 'how much did i spend ' + (s.period === 'month' ? 'this month' : 'today'); }, 'money.orders': function () { return 'show my pending orders'; },
    'money.chama_month': function () { return 'chama contributions this month'; }, 'money.chama_outstanding': function () { return 'outstanding chama contributions'; },
    'money.open_tab': function (s) { return MONEY_TAB[s.tab]; }, 'money.prepare_transfer': function (s) { return 'send ' + s.amount + ' to ' + s.to; },
    'duka.sale': function (s) { return 'i sold ' + s.items_text + (s.payment === 'mpesa' ? ' by mpesa' : s.payment === 'credit' ? ' on credit' : s.payment === 'cash' ? ' for cash' : ''); },
    'duka.stock': function (s) { return 'how much ' + s.product + ' do we have in stock'; }, 'duka.products_count': function () { return 'how many products do we have'; },
    'duka.low_stock': function () { return 'which products are running low on stock'; }, 'duka.customers_count': function () { return 'how many customers do we have'; },
    'duka.report': function (s) { return 'how much did we sell ' + (s.period === 'week' ? 'this week' : s.period === 'month' ? 'this month' : 'today'); },
    'duka.debts': function (s) { return s.who ? 'how much does ' + s.who + ' owe me' : 'who owes me'; },
    'duka.expense': function (s) { return 'i spent ' + s.amount + (s.description ? ' on ' + s.description : ''); },
    'duka.open_tab': function (s) { return 'open ' + DUKA_TAB[s.tab]; }, 'duka.suppliers': function () { return 'show my suppliers'; }, 'duka.waste': function () { return 'show waste'; },
    'duka.group_buy': function () { return 'group buying'; }, 'duka.refund': function () { return 'refund a sale'; },
    'duka.add_product': function (s) { return 'add new product ' + s.name + (s.buy != null ? ' buying price ' + s.buy : '') + (s.sell != null ? ' selling price ' + s.sell : '') + (s.stock != null ? ' stock ' + s.stock : ''); }
  };
  var LABEL = {
    'nav.open': ['open a screen', 'fungua ukurasa'], 'nav.back': ['go back', 'rudi nyuma'],
    'messages.unread_check': ['check new messages', 'angalia ujumbe mpya'], 'messages.read_new': ['read your new messages', 'soma ujumbe mpya'], 'messages.read_from': ['read messages from someone', 'soma ujumbe wa mtu'],
    'messages.open_chat': ['open a chat', 'fungua mazungumzo'], 'messages.search_chat': ['search a chat', 'tafuta mazungumzo'],
    'groups.open': ['open a group', 'fungua kikundi'], 'groups.create': ['create a group', 'unda kikundi'], 'groups.read': ['read group messages', 'soma ujumbe wa kikundi'], 'groups.members': ['show group members', 'onyesha wanachama'],
    'groups.member_count': ['count group members', 'hesabu wanachama'], 'groups.count': ['count your groups', 'hesabu vikundi'], 'groups.refresh': ['refresh groups', 'sasisha vikundi'], 'groups.close': ['close the group', 'funga kikundi'],
    'status.view': ['view someone\'s status', 'tazama hali ya mtu'], 'status.who': ['see who posted a status', 'angalia aliyeweka hali'], 'status.count': ['check new statuses', 'angalia hali mpya'], 'status.post_open': ['create a status', 'weka hali mpya'],
    'status.next': ['next status', 'hali inayofuata'], 'status.prev': ['previous status', 'hali iliyopita'], 'status.close': ['close the status', 'funga hali'], 'status.vibes': ['open vibes', 'fungua vibes'], 'status.love': ['love this status', 'penda hali hii'],
    'settings.open_section': ['open a settings section', 'fungua sehemu ya mipangilio'], 'settings.theme': ['change dark or light mode', 'badilisha giza au mwanga'], 'settings.toggle': ['turn a setting on or off', 'washa au zima mpangilio'],
    'games.play': ['play a game', 'cheza mchezo'], 'games.home': ['go to the game list', 'rudi kwenye orodha ya michezo'], 'games.coins': ['check your coins', 'angalia sarafu'], 'games.best': ['hear your best score', 'sikia alama bora'],
    'games.list': ['list the games', 'orodhesha michezo'], 'games.sound': ['mute or unmute the game', 'zima au washa sauti ya mchezo'], 'games.question': ['read the question', 'soma swali'],
    'friends.open_tab': ['open a Friends tab', 'fungua ukurasa wa Marafiki'], 'friends.check_requests': ['check your friend requests', 'angalia maombi ya urafiki'], 'friends.count_friends': ['count your friends', 'hesabu marafiki'],
    'friends.count_requests': ['count your requests', 'hesabu maombi'], 'friends.read_friends': ['read your friends', 'soma marafiki'], 'friends.read_requests': ['read your requests', 'soma maombi'],
    'friends.accept': ['accept a request', 'kubali ombi'], 'friends.decline': ['decline a request', 'kataa ombi'], 'friends.cancel': ['cancel a request you sent', 'ghairi ombi ulilotuma'],
    'friends.add': ['add a friend', 'ongeza rafiki'], 'friends.remove': ['remove a friend', 'ondoa rafiki'], 'friends.search': ['search people', 'tafuta watu'], 'friends.refresh': ['refresh friends', 'sasisha marafiki'],
    'money.balance': ['check your balance', 'angalia salio'], 'money.transactions': ['show your transactions', 'onyesha miamala'], 'money.received': ['see what you received', 'angalia ulichopokea'],
    'money.spent': ['see what you spent', 'angalia ulichotumia'], 'money.orders': ['show your pending orders', 'onyesha oda zinazosubiri'], 'money.chama_month': ['chama contributions this month', 'michango ya chama ya mwezi huu'],
    'money.chama_outstanding': ['outstanding chama contributions', 'michango ya chama ambayo haijalipwa'], 'money.open_tab': ['open a Money tab', 'fungua ukurasa wa Pesa'], 'money.prepare_transfer': ['prepare a payment', 'tayarisha malipo'],
    'duka.open_tab': ['open a Duka screen', 'fungua ukurasa wa duka'], 'duka.suppliers': ['see your suppliers', 'angalia wasambazaji'], 'duka.waste': ['see wasted or expiring stock', 'angalia upotevu'],
    'duka.group_buy': ['open group buying', 'fungua ununuzi wa pamoja'], 'duka.refund': ['refund a sale', 'rudisha pesa ya mauzo'],
    'duka.sale': ['record a sale', 'andika mauzo'], 'duka.stock': ['check stock of a product', 'angalia stoku ya bidhaa'], 'duka.products_count': ['count products', 'hesabu bidhaa'], 'duka.low_stock': ['see low stock', 'angalia stoku inayoisha'],
    'duka.customers_count': ['count customers', 'hesabu wateja'], 'duka.report': ['see sales', 'angalia mauzo'], 'duka.debts': ['see who owes the shop', 'angalia wanaodaiwa'], 'duka.expense': ['record an expense', 'andika gharama'], 'duka.add_product': ['add a product', 'ongeza bidhaa']
  };
  var NEED = {
    'messages.read_from': ['Say whose messages, for example: read my messages from Denis.', 'Taja jina, mfano: soma ujumbe wa Denis.'], 'messages.open_chat': ['Say who, for example: open chat with Denis.', 'Taja jina, mfano: fungua mazungumzo na Denis.'],
    'groups.open': ['Say the group name, for example: open group Family.', 'Taja jina la kikundi, mfano: fungua kikundi Familia.'], 'groups.create': ['Say the group name, for example: create group Family.', 'Taja jina la kikundi, mfano: unda kikundi Familia.'],
    'status.view': ['Say whose status, for example: show Denis status.', 'Taja jina, mfano: tazama hali ya Denis.'], 'settings.toggle': ['Say which setting, for example: turn on read receipts.', 'Taja mpangilio, mfano: washa read receipts.'],
    'friends.accept': ['Say the name, for example: accept Denis.', 'Taja jina, mfano: kubali Denis.'], 'friends.decline': ['Say the name, for example: decline Denis.', 'Taja jina, mfano: kataa Denis.'],
    'friends.cancel': ['Say the name, for example: cancel my request to Denis.', 'Taja jina, mfano: ghairi ombi kwa Denis.'], 'friends.add': ['Say the name, for example: add Denis as a friend.', 'Taja jina, mfano: ongeza Denis rafiki.'],
    'friends.remove': ['Say the name, for example: remove Denis from my friends.', 'Taja jina, mfano: ondoa Denis kwa marafiki.'], 'friends.search': ['Say who to search for, for example: search for Denis.', 'Taja unayemtafuta, mfano: tafuta Denis.'],
    'money.prepare_transfer': ['Say the amount and who, for example: send 500 to John.', 'Taja kiasi na nani, mfano: tuma 500 kwa John.'], 'duka.stock': ['Say the product, for example: how much sugar do we have.', 'Taja bidhaa, mfano: sukari imebaki ngapi.'],
    'duka.expense': ['Say the amount, for example: I spent 500 on transport.', 'Taja kiasi, mfano: nimetumia 500 kwa usafiri.'], 'duka.add_product': ['Say the product name, for example: add new product sugar.', 'Taja jina la bidhaa, mfano: ongeza bidhaa mpya sukari.'],
    'duka.sale': ['Say what you sold, for example: I sold 2 sugar for cash.', 'Taja uliyouza, mfano: nimeuza sukari 2 cash.']
  };


  var NAME_STRIP = ['SHOWV', 'READV', 'SEARCHV', 'CHATW', 'MSGW', 'GROUPW', 'STATUSW', 'FROMW', 'CREATEV', 'UNREAD', 'POSTV', 'MEMBERS', 'FRIEND'];
  function nameFrom(t, gs, max) { var l = leftover(t, (gs || []).concat(NAME_STRIP)).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); if (!l) return null; return l.split(' ').slice(0, max || 4).join(' ').replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); }
  var withName = function (key, gs) { return function (t) { var n = nameFrom(t, gs); if (!n) return null; var o = {}; o[key || 'name'] = n; return o; }; };
  function toggleName(t, gs) { var l = leftover(t, gs.concat(['SETTINGSW', 'SHOWV'])).replace(/\s+/g, ' ').trim(); return l ? l : null; }


  /* Which Duka screen was named? Order matters (most specific first). strict=true: only words that cannot mean anything else. */
  var DUKA_TABS = [
    ['sales', /\b(?:sales history|past sales|sales list|all sales|historia ya mauzo|orodha ya mauzo|mauzo yote|mauzo ya zamani|sales screen|sales tab)\b/],
    ['sell', /\b(?:point of sale|pos|sell screen|selling screen|till|cashier|checkout|new sale|kaunta|counter|skrini ya mauzo|sehemu ya kuuza|sell tab|uza tab|sell page)\b/],
    ['expenses', /\b(?:expenses?|gharama|matumizi|expenditure)\b/],
    ['debts', /\b(?:debts?|madeni|deni|wadeni|credit customers)\b/],
    ['reports', /\b(?:reports?|ripoti|summary|muhtasari)\b/],
    ['products', /\b(?:products?|bidhaa|inventory|stock|stoku|stoo|items)\b/],
    ['money', /\b(?:duka money|shop money|money tab|finance|fedha|pesa za duka|fedha za duka)\b/],
    ['settings', /\b(?:duka settings|shop settings|mipangilio ya duka)\b/],
    ['dashboard', /\b(?:dashboard|dashibodi|duka home|home screen|overview|my shop|duka langu|main screen)\b/]
  ];
  var DUKA_TABS_STRICT = { expenses: 1, dashboard: 1, sell: 1, sales: 1, money: 1, settings: 1 };
  function dukaTabOf(t, strict) { var s = ' ' + t.trim() + ' '; for (var i = 0; i < DUKA_TABS.length; i++) if (DUKA_TABS[i][1].test(s) && (!strict || DUKA_TABS_STRICT[DUKA_TABS[i][0]])) return DUKA_TABS[i][0]; return null; }

  /* ───────────── RULES ─────────────
   * all: groups that must ALL be present · not: groups that must be ABSENT · boost: extra groups (+0.25 each) · w: specificity
   * slots(t): extract slots from the normalised text (return null to reject). fixed: static slots. */
  var CUES = ['QW', 'PRODUCTW', 'STOCKW', 'MYW', 'SHOWV', 'READV', 'COUNTQ', 'MONEYQ', 'ASKISH', 'WHO', 'WALLET'];
  function R(id, all, o) { o = o || {}; return { id: id, all: all, not: o.not || [], boost: o.boost || [], w: o.w != null ? o.w : all.length, fixed: o.fixed || null, slots: o.slots || null, cue: !!o.cue, needCue: o.needCue || null, onlyPage: o.onlyPage || null }; }
  var ADMIN = ['ACCEPT', 'DECLINE', 'CANCEL', 'ADDV', 'REMOVE_STRONG', 'SEARCHV', 'REFRESHV'];
  var RULES = [
    // ── Friends ──
    R('friends.accept', ['ACCEPT'], { not: ['DECLINE', 'CANCEL', 'SEARCHV'], boost: ['REQLIKE', 'FRIEND'], w: 1.5, slots: function (t) { var n = nameOf(t, ['ACCEPT']); return n ? { name: n } : null; } }),
    R('friends.decline', ['DECLINE'], { not: ['ACCEPT', 'CANCEL'], boost: ['REQLIKE', 'FRIEND'], w: 1.5, slots: function (t) { var n = nameOf(t, ['DECLINE']); return n ? { name: n } : null; } }),
    R('friends.cancel', ['CANCEL'], { not: ['ACCEPT', 'DECLINE', 'ORD', 'EXPV'], boost: ['SENT', 'REQLIKE', 'FRIEND'], w: 1.4, slots: function (t) { var n = nameOf(t, ['CANCEL']); return n ? { name: n } : null; } }),
    R('friends.add', ['ADDV', 'FRIEND'], { not: ['ACCEPT', 'DECLINE', 'CANCEL', 'PRODUCTW'], w: 2.2, slots: function (t) { var n = nameOf(t, ['ADDV']); return n ? { name: n } : null; } }),
    R('friends.add', ['ADDV', 'REQLIKE'], { not: ['ACCEPT', 'DECLINE', 'CANCEL', 'PRODUCTW'], w: 2.2, slots: function (t) { var n = nameOf(t, ['ADDV']); return n ? { name: n } : null; } }),
    R('friends.remove', ['REMOVE_STRONG'], { not: ['PRODUCTW'], w: 2, slots: function (t) { var n = nameOf(t, ['REMOVE_STRONG']); return n ? { name: n } : null; } }),
    R('friends.remove', ['REMOVE_WEAK', 'FRIEND'], { not: ['PRODUCTW', 'REQLIKE'], w: 2, slots: function (t) { var n = nameOf(t, ['REMOVE_WEAK']); return n ? { name: n } : null; } }),
    R('friends.search', ['SEARCHV', 'FRIEND'], { w: 2.1, slots: function (t) { var n = nameOf(t, ['SEARCHV']); return n ? { query: n } : null; } }),
    R('friends.search', ['SEARCHV'], { onlyPage: 'friends', not: ['PRODUCTW', 'STOCKW', 'ORD', 'TXN', 'CHAMA', 'CUST'], w: 1, slots: function (t) { var n = nameOf(t, ['SEARCHV']); return n ? { query: n } : null; } }),
    R('friends.refresh', ['REFRESHV', 'FRIEND'], { w: 2 }),
    R('friends.check_requests', ['REQLIKE'], { cue: true, not: ADMIN.concat(['SENT', 'COUNTQ', 'READV', 'SHOWV', 'ORD', 'PAYREQ', 'MONEYQ']), boost: ['ASKISH', 'FRIEND'], w: 1.6 }),
    R('friends.check_requests', ['ASKISH', 'FRIEND', 'REQ'], { not: ADMIN.concat(['SENT', 'COUNTQ', 'PAYREQ']), w: 2.4 }),
    R('friends.count_friends', ['COUNTQ', 'FRIEND'], { not: ['REQ', 'GROUPW', 'REMOVE_WEAK', 'REMOVE_STRONG', 'ADDV', 'ACCEPT', 'DECLINE', 'CANCEL'], w: 2.2 }),
    R('friends.count_requests', ['COUNTQ', 'REQ'], { not: ['PAYREQ', 'ORD'], boost: ['FRIEND'], w: 2.2 }),
    R('friends.read_friends', ['READV', 'FRIEND'], { not: ['REQ', 'GROUPW', 'COUNTQ', 'REMOVE_WEAK', 'REMOVE_STRONG', 'ADDV', 'ACCEPT', 'DECLINE', 'CANCEL'], w: 2.2 }),
    R('friends.read_requests', ['READV', 'REQ'], { not: ['PAYREQ', 'ORD'], boost: ['FRIEND'], w: 2.2 }),
    R('friends.read_requests', ['WHO', 'REQLIKE'], { not: ['PAYREQ', 'ORD', 'SENT', 'ASKISH'], w: 2.2 }),
    R('friends.open_tab', ['SHOWV', 'FRIEND'], { not: ['REQ', 'SENT', 'DISCOVER', 'NEARBY', 'GROUPW', 'REMOVE_WEAK', 'REMOVE_STRONG', 'ADDV', 'ACCEPT', 'DECLINE', 'CANCEL'], fixed: { tab: 'friends' }, w: 2 }),
    R('friends.open_tab', ['SHOWV', 'REQ'], { not: ['SENT', 'PAYREQ', 'ORD'], boost: ['FRIEND'], fixed: { tab: 'requests' }, w: 2 }),
    R('friends.open_tab', ['REQ', 'SENT'], { not: ['PAYREQ', 'ORD', 'ACCEPT', 'DECLINE', 'CANCEL', 'ADDV', 'REMOVE_STRONG'], boost: ['SHOWV', 'FRIEND'], fixed: { tab: 'sent' }, w: 2.3 }),
    R('friends.open_tab', ['DISCOVER'], { not: ['GROUPW'], boost: ['SHOWV', 'FRIEND'], fixed: { tab: 'discover' }, w: 1.6 }),
    R('friends.open_tab', ['DISCOVER', 'GROUPW'], { boost: ['SHOWV'], fixed: { tab: 'groups' }, w: 2.3 }),
    R('friends.open_tab', ['NEARBY'], { boost: ['SHOWV', 'FRIEND'], fixed: { tab: 'nearby' }, w: 1.4 }),

    // ── Money ──
    R('money.balance', ['BAL'], { cue: true, not: ['SPENT', 'RECV', 'CHAMA', 'DEBT', 'OWE', 'PRODUCTW', 'REPORTW', 'CUST'], boost: ['MONEYQ', 'WALLET', 'SHOWV', 'ASKISH'], w: 1.6 }),
    R('money.transactions', ['TXN'], { cue: true, not: ['CHAMA', 'ORD'], boost: ['SHOWV', 'READV', 'WALLET'], w: 1.7 }),
    R('money.received', ['RECV'], { cue: true, not: ['REQLIKE', 'SALEV', 'CUST', 'ADDV'], boost: ['MONEYQ', 'WALLET'], w: 1.6 }),
    R('money.spent', ['SPENT', 'MONEYQ'], { not: ['PAST', 'REPORTW', 'PRODUCTW', 'STOCKW', 'CUST', 'SENDV'], slots: function (t) { return { period: period(t, 'today') }; }, w: 2.4 }),
    R('money.orders', ['ORD'], { cue: true, not: ['REPORTW', 'SALEV', 'CUST', 'STOCKW', 'PAYREQ'], boost: ['SHOWV', 'READV', 'PAYLATER'], w: 1.6 }),
    R('money.chama_month', ['CHAMA', 'MONTH'], { not: ['OWE'], w: 2.3 }),
    R('money.chama_month', ['CHAMA', 'DUE'], { not: ['OWE'], w: 2.2 }),
    R('money.chama_outstanding', ['CHAMA', 'OWE'], { w: 2.4 }),
    R('money.chama_outstanding', ['WHO', 'CHAMA'], { not: ['MONTH'], boost: ['OWE'], w: 2.1 }),
    R('money.open_tab', ['WALLET', 'SHOWV'], { not: ['BAL', 'SENDV', 'AIRTIME', 'GOALS', 'CHAMA', 'PAYREQ', 'PAYLATER', 'ACTIVITY', 'TXN', 'RECV', 'SPENT', 'MONEYQ'], fixed: { tab: 'wallet' }, w: 1.8 }),
    R('money.open_tab', ['CHAMA', 'SHOWV'], { not: ['MONTH', 'OWE', 'WHO', 'GROUPW'], fixed: { tab: 'circles' }, w: 2 }),
    R('money.open_tab', ['GOALS'], { cue: true, boost: ['SHOWV', 'WALLET'], not: ['SENDV'], fixed: { tab: 'goals' }, w: 1.6 }),
    R('money.open_tab', ['PAYREQ'], { boost: ['SHOWV'], fixed: { tab: 'requests' }, w: 1.9 }),
    R('money.open_tab', ['PAYLATER'], { not: ['ORD'], boost: ['SHOWV'], fixed: { tab: 'paylater' }, w: 1.7 }),
    R('money.open_tab', ['AIRTIME'], { boost: ['SHOWV', 'SENDV'], fixed: { tab: 'airtime' }, w: 1.7 }),
    R('money.open_tab', ['ACTIVITY'], { boost: ['SHOWV', 'WALLET'], not: ['FRIEND'], fixed: { tab: 'activity' }, w: 1.5 }),
    R('money.prepare_transfer', ['SENDV'], { needCue: ['MONEYW'], not: ['FRIEND', 'REQLIKE', 'AIRTIME', 'SALEV', 'PRODUCTW', 'ADDV', 'SEARCHV'], w: 1.7,
      slots: function (t) {
        var phone = phoneOf(t), amt = amountOf(t); if (!amt) return null;
        var to = phone; if (!to) { var m = /\b(?:to|kwa|kwenda)\s+(.+)$/.exec(t.trim()); var rest = m ? m[1] : leftover(t, ['SENDV']).replace(/\b\d+\b/g, ' '); rest = words(strip(' ' + rest + ' ', ['STOP', 'SENDV'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); if (rest) to = rest.split(' ').slice(0, 3).join(' '); }
        return to ? { amount: amt, to: to } : null;
      } }),


    // ═════ phase 2: Messenger ═════
    R('messages.unread_check', ['MSGW', 'UNREAD'], { cue: true, not: ['READV', 'SENDV', 'FRIEND', 'GROUPW', 'STATUSW', 'SEARCHV', 'FROMW', 'CHATW', 'SHOWV'], boost: ['ASKISH', 'COUNTQ'], w: 2 }),
    R('messages.read_new', ['READV', 'MSGW'], { not: ['FROMW', 'GROUPW', 'FRIEND', 'STATUSW', 'SENDV', 'MEMBERS'], boost: ['UNREAD'], w: 2 }),
    R('messages.read_from', ['READV', 'MSGW', 'FROMW'], { not: ['GROUPW', 'STATUSW'], w: 2.6, slots: withName('name', ['READV']) }),
    R('messages.open_chat', ['SHOWV', 'CHATW'], { not: ['GROUPW', 'STATUSW', 'SEARCHV', 'FRIEND', 'REQ', 'SETTINGSW', 'READV'], w: 2.1, slots: withName('name', ['SHOWV']) }),
    R('messages.search_chat', ['SEARCHV', 'CHATW'], { not: ['GROUPW', 'STATUSW'], w: 2.3, slots: withName('name', ['SEARCHV']) }),
    // ═════ Groups ═════
    R('groups.open', ['SHOWV', 'GROUPW'], { not: ['DISCOVER', 'MEMBERS', 'COUNTQ', 'CREATEV', 'FRIEND', 'STATUSW', 'SEARCHV', 'READV', 'REFRESHV', 'CLOSEW', 'SENDV', 'SETTINGSW'], w: 2, slots: withName('name', ['SHOWV']) }),
    R('groups.create', ['CREATEV', 'GROUPW'], { not: ['MEMBERS', 'COUNTQ', 'STATUSW', 'DISCOVER'], w: 2.2, slots: withName('name', ['CREATEV']) }),
    R('groups.read', ['READV', 'MSGW', 'GROUPW'], { w: 2.6 }),
    R('groups.members', ['MEMBERS'], { cue: true, not: ['COUNTQ'], boost: ['SHOWV', 'READV', 'WHO', 'GROUPW'], w: 1.6 }),
    R('groups.member_count', ['MEMBERS', 'COUNTQ'], { w: 2.3 }),
    R('groups.count', ['COUNTQ', 'GROUPW'], { not: ['MEMBERS', 'CREATEV', 'FRIEND'], w: 2.1 }),
    R('groups.refresh', ['REFRESHV', 'GROUPW'], { w: 2 }),
    R('groups.close', ['CLOSEW', 'GROUPW'], { not: ['CREATEV', 'STATUSW'], w: 2 }),
    // ═════ Status ═════
    R('status.view', ['SHOWV', 'STATUSW'], { not: ['POSTV', 'CREATEV', 'WHO', 'ASKISH', 'COUNTQ', 'NEXTW', 'PREVW', 'CLOSEW', 'VIBES', 'SEARCHV', 'LOVEW', 'SETTINGSW'], w: 2, slots: withName('name', ['SHOWV']) }),
    R('status.who', ['WHO', 'STATUSW'], { not: ['POSTV'], w: 2.2 }),
    R('status.count', ['STATUSW', 'ASKISH'], { not: ['POSTV', 'CREATEV', 'SEARCHV', 'SHOWV', 'WHO', 'NEXTW', 'PREVW', 'CLOSEW', 'LOVEW', 'SETTINGSW'], w: 2 }),
    R('status.count', ['STATUSW', 'COUNTQ'], { not: ['POSTV', 'CREATEV', 'SEARCHV', 'WHO', 'NEXTW', 'PREVW', 'CLOSEW'], w: 2 }),
    R('status.post_open', ['POSTV', 'STATUSW'], { not: ['SEARCHV', 'WHO', 'COUNTQ'], w: 2.2 }),
    R('status.post_open', ['CREATEV', 'STATUSW'], { not: ['SEARCHV', 'WHO', 'COUNTQ', 'SHOWV', 'POSTV'], w: 2 }),
    R('status.next', ['NEXTW', 'STATUSW'], { w: 2.2 }),
    R('status.prev', ['PREVW', 'STATUSW'], { w: 2.2 }),
    R('status.close', ['CLOSEW', 'STATUSW'], { not: ['GROUPW'], w: 2.2 }),
    R('status.vibes', ['VIBES'], { cue: true, not: ['CLOSEW', 'LOVEW'], boost: ['SHOWV'], w: 1.6 }),
    R('status.love', ['LOVEW', 'STATUSW'], { w: 2.2 }),
    R('status.love', ['LOVEW', 'VIBES'], { w: 2.1 }),
    // ═════ Settings ═════
    R('settings.open_section', ['SETTINGSW', 'SECTION_PROFILE'], { fixed: { section: 'profile' }, boost: ['SHOWV'], w: 2.2 }),
    R('settings.open_section', ['SETTINGSW', 'SECTION_SECURITY'], { fixed: { section: 'security' }, boost: ['SHOWV'], w: 2.2 }),
    R('settings.open_section', ['SETTINGSW', 'SECTION_PRIVACY'], { fixed: { section: 'privacy' }, boost: ['SHOWV'], w: 2.2 }),
    R('settings.open_section', ['SETTINGSW', 'SECTION_NOTIF'], { fixed: { section: 'notifications' }, boost: ['SHOWV'], w: 2.2 }),
    R('settings.open_section', ['SETTINGSW', 'SECTION_APPEAR'], { fixed: { section: 'appearance' }, boost: ['SHOWV'], w: 2.2 }),
    R('settings.open_section', ['SETTINGSW', 'SECTION_STORAGE'], { fixed: { section: 'storage' }, boost: ['SHOWV'], w: 2.2 }),
    R('settings.open_section', ['SETTINGSW', 'SECTION_ADV'], { fixed: { section: 'advanced' }, boost: ['SHOWV'], w: 2.2 }),
    R('settings.open_section', ['SETTINGSW', 'SECTION_CHAT'], { not: ['SECTION_PRIVACY', 'SECTION_NOTIF', 'SECTION_APPEAR'], fixed: { section: 'chat' }, boost: ['SHOWV'], w: 2.1 }),
    R('settings.theme', ['DARK'], { not: ['LIGHT', 'TURNOFF'], fixed: { theme: 'dark' }, boost: ['SHOWV', 'TURNON', 'SETTINGSW'], w: 1.8 }),
    R('settings.theme', ['LIGHT'], { not: ['DARK', 'TURNOFF'], fixed: { theme: 'light' }, boost: ['SHOWV', 'TURNON', 'SETTINGSW'], w: 1.8 }),
    R('settings.theme', ['DARK', 'TURNOFF'], { not: ['LIGHT'], fixed: { theme: 'light' }, w: 2.3 }),
    R('settings.theme', ['LIGHT', 'TURNOFF'], { not: ['DARK'], fixed: { theme: 'dark' }, w: 2.3 }),
    R('settings.toggle', ['TURNON', 'SETTINGNAME'], { not: ['DARK', 'LIGHT', 'GAMEW'], w: 2, slots: function (t) { var n = toggleName(t, ['TURNON']); return n ? { state: 'on', name: n } : null; } }),
    R('settings.toggle', ['TURNOFF', 'SETTINGNAME'], { not: ['DARK', 'LIGHT', 'GAMEW'], w: 2, slots: function (t) { var n = toggleName(t, ['TURNOFF']); return n ? { state: 'off', name: n } : null; } }),
    R('settings.toggle', ['TURNON', 'SETTINGSW'], { not: ['DARK', 'LIGHT', 'SETTINGNAME'], w: 1.9, slots: function (t) { var n = toggleName(t, ['TURNON']); return n ? { state: 'on', name: n } : null; } }),
    R('settings.toggle', ['TURNOFF', 'SETTINGSW'], { not: ['DARK', 'LIGHT', 'SETTINGNAME'], w: 1.9, slots: function (t) { var n = toggleName(t, ['TURNOFF']); return n ? { state: 'off', name: n } : null; } }),
    // ═════ Games ═════
    R('games.play', ['PLAYV', 'G_BLOCK'], { fixed: { game: 'block' }, w: 2.2 }),
    R('games.play', ['PLAYV', 'G_TRIVIA'], { fixed: { game: 'trivia' }, w: 2.2 }),
    R('games.play', ['PLAYV', 'G_CROSS'], { fixed: { game: 'crossword' }, w: 2.2 }),
    R('games.play', ['PLAYV', 'G_CHESS'], { fixed: { game: 'chess' }, w: 2.2 }),
    R('games.home', ['ARCADE'], { cue: true, boost: ['SHOWV'], w: 1.6 }),
    R('games.coins', ['COINS'], { cue: true, boost: ['COUNTQ', 'MYW'], w: 1.6 }),
    R('games.best', ['BEST'], { w: 2 }),
    R('games.list', ['GAMEW', 'LISTQ'], { not: ['ARCADE'], w: 2 }),
    R('games.sound', ['MUTE'], { onlyPage: 'games', fixed: { state: 'off' }, w: 1.8 }),
    R('games.sound', ['UNMUTE'], { onlyPage: 'games', fixed: { state: 'on' }, w: 1.8 }),
    R('games.question', ['READV', 'QUESTIONW'], { onlyPage: 'games', w: 2 }),
    // ── DUKA SMART: screens and features added later ──
    R('duka.suppliers', ['SUPPLIERW'], { not: ['FRIEND', 'SENDV'], w: 2.3 }),
    R('duka.waste', ['WASTEW'], { not: ['FRIEND', 'SENDV'], w: 2.3 }),
    R('duka.group_buy', ['GROUPBUYW'], { w: 2.5 }),
    R('duka.refund', ['REFUNDW'], { not: ['SENDV', 'FRIEND'], w: 2.5 }),
    R('duka.open_tab', ['SALESHIST'], { onlyPage: 'tools', w: 2.8, fixed: { tab: 'sales' } }),
    R('duka.open_tab', ['SHOWV', 'SCREENW'], { not: ['FRIEND', 'MSGW', 'SETTINGSW', 'GAMEW', 'STATUSW'], w: 2.9, slots: function (t) { var k = dukaTabOf(t); return k ? { tab: k } : null; } }),
    R('duka.open_tab', ['SHOWV'], { not: ['FRIEND', 'MSGW', 'SETTINGSW', 'GAMEW', 'STATUSW', 'DEBT', 'REPORTW', 'STOCKW', 'LOW', 'COUNTQ', 'MONEYQ', 'SPENT'], w: 1.6, slots: function (t) { if (amountOf(t)) return null; var k = dukaTabOf(t, true); return k ? { tab: k } : null; } }),
    // ── DUKA SMART ──
    R('duka.sale', ['SALEV'], { not: ['MONEYQ'], boost: ['PRODUCTW'], w: 1.8, slots: function (t) {
      var pay = /\b(?:mpesa|lipa na mpesa)\b/.test(t) ? 'mpesa' : /\b(?:credit|on credit|mkopo|deni|kwa deni)\b/.test(t) ? 'credit' : /\b(?:cash|taslimu|pesa taslimu)\b/.test(t) ? 'cash' : null;
      var it = words(strip(t, ['SALEV', 'STOP']).replace(/\b(?:mpesa|lipa na mpesa|on credit|credit|mkopo|kwa deni|taslimu|pesa taslimu|cash|by|via)\b/g, ' '));
      return it ? { items_text: it, payment: pay } : null; } }),
    R('duka.stock', ['STOCKW', 'COUNTQ'], { not: ['LOW', 'PRODUCTW', 'CUST', 'REPORTW', 'BAL', 'FRIEND'], w: 1.7, slots: function (t) {
      var p = words(strip(t, ['STOCKW', 'COUNTQ', 'HAVEQ', 'MONEYQ', 'STOP', 'SHOWV', 'READV', 'ASKISH'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); return p ? { product: p } : null; } }),
    R('duka.stock', ['STOCKW', 'MONEYQ'], { not: ['LOW', 'PRODUCTW', 'CUST', 'REPORTW', 'BAL', 'FRIEND'], w: 1.7, slots: function (t) {
      var p = words(strip(t, ['STOCKW', 'COUNTQ', 'HAVEQ', 'MONEYQ', 'STOP', 'SHOWV', 'READV', 'ASKISH'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); return p ? { product: p } : null; } }),
    R('duka.stock', ['STOCKW', 'HAVEQ'], { not: ['LOW', 'PRODUCTW', 'CUST', 'REPORTW', 'BAL', 'FRIEND'], w: 1.7, slots: function (t) {
      var p = words(strip(t, ['STOCKW', 'COUNTQ', 'HAVEQ', 'MONEYQ', 'STOP', 'SHOWV', 'READV', 'ASKISH'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); return p ? { product: p } : null; } }),
    R('duka.stock', ['STOCKW', 'ASKISH'], { not: ['LOW', 'PRODUCTW', 'CUST', 'REPORTW', 'BAL', 'FRIEND'], w: 1.7, slots: function (t) {
      var p = words(strip(t, ['STOCKW', 'COUNTQ', 'HAVEQ', 'MONEYQ', 'STOP', 'SHOWV', 'READV', 'ASKISH'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); return p ? { product: p } : null; } }),
    R('duka.stock', ['STOCKW', 'SHOWV'], { not: ['LOW', 'PRODUCTW', 'CUST', 'REPORTW', 'BAL', 'FRIEND'], w: 1.7, slots: function (t) {
      var p = words(strip(t, ['STOCKW', 'COUNTQ', 'HAVEQ', 'MONEYQ', 'STOP', 'SHOWV', 'READV', 'ASKISH'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); return p ? { product: p } : null; } }),
    R('duka.stock', ['HAVEQ', 'COUNTQ'], { not: ['LOW', 'PRODUCTW', 'CUST', 'FRIEND', 'REQ', 'STOCKW', 'REPORTW', 'BAL', 'ORD', 'CHAMA', 'WALLET'], w: 1.3, slots: function (t) {
      var p = words(strip(t, ['COUNTQ', 'HAVEQ', 'MONEYQ', 'STOP', 'SHOWV', 'READV'])).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim(); return p ? { product: p } : null; } }),
    R('duka.products_count', ['COUNTQ', 'PRODUCTW'], { not: ['LOW', 'CUST', 'FRIEND'], w: 2.2 }),
    R('duka.low_stock', ['LOW'], { cue: true, not: ['BAL', 'FRIEND', 'OWE', 'DEBT', 'WALLET'], boost: ['PRODUCTW', 'STOCKW', 'SHOWV'], w: 1.6 }),
    R('duka.customers_count', ['COUNTQ', 'CUST'], { w: 2.2 }),
    R('duka.report', ['REPORTW', 'MONEYQ'], { not: ['PAST', 'SALEV', 'EXPV', 'SPENT', 'STOCKW', 'LOW', 'PRODUCTW', 'DEBT', 'BAL', 'SENDV'], boost: ['TODAY', 'WEEK', 'MONTH'], slots: function (t) { return { period: period(t, 'today') }; }, w: 2.3 }),
    R('duka.report', ['REPORTW', 'SHOWV'], { not: ['PAST', 'SALEV', 'EXPV', 'STOCKW', 'LOW', 'DEBT', 'FRIEND', 'REQ'], boost: ['TODAY', 'WEEK', 'MONTH'], slots: function (t) { return { period: period(t, 'today') }; }, w: 2.2 }),
    R('duka.report', ['REPORTW', 'WEEK'], { not: ['PAST', 'SALEV', 'EXPV', 'STOCKW', 'LOW', 'DEBT', 'SENDV', 'SPENT'], slots: function (t) { return { period: period(t, 'today') }; }, w: 2 }),
    R('duka.report', ['REPORTW', 'MONTH'], { not: ['PAST', 'SALEV', 'EXPV', 'STOCKW', 'LOW', 'DEBT', 'SENDV', 'SPENT', 'CHAMA'], slots: function (t) { return { period: period(t, 'today') }; }, w: 2 }),
    R('duka.report', ['SALEV', 'MONEYQ'], { not: ['PAST', 'EXPV', 'STOCKW', 'LOW', 'DEBT', 'SENDV', 'SPENT'], slots: function (t) { return { period: period(t, 'today') }; }, w: 2.1 }),
    R('duka.report', ['REPORTW', 'TODAY'], { not: ['PAST', 'SALEV', 'EXPV', 'STOCKW', 'LOW', 'DEBT', 'SENDV', 'SPENT'], slots: function (t) { return { period: period(t, 'today') }; }, w: 2 }),
    R('duka.debts', ['DEBT'], { not: ['CHAMA', 'ADDP', 'FRIEND'], boost: ['WHO', 'MONEYQ', 'CUST'], w: 1.7, slots: function (t) {
      var n = words(strip(t, ['DEBT', 'WHO', 'MONEYQ', 'STOP', 'CUST', 'SHOWV', 'READV', 'COUNTQ'])).replace(/\b(?:me|us|shop|duka)\b/g, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
      return { who: n ? n.split(' ').slice(0, 3).map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join(' ') : null }; } }),
    R('duka.expense', ['EXPV'], { not: ['SHOWV', 'READV', 'MONEYQ', 'SENDV', 'REPORTW', 'ORD', 'CHAMA', 'FRIEND'], w: 1.7, slots: function (t) {
      var amt = amountOf(t); if (!amt) return null;
      var m = /\b(?:on|for|kwa|kununua|ya)\s+(.+)$/.exec(t.replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim() + ' '); var d = m ? words(strip(' ' + m[1] + ' ', ['STOP'])).replace(/\b(?:shillings|bob|ksh|kes|shilingi)\b/g, ' ').replace(/\s+/g, ' ').trim() : '';
      return { amount: amt, description: d || null }; } }),
    R('duka.add_product', ['ADDP', 'PRODUCTW'], { not: ['FRIEND', 'REQ', 'SALEV'], boost: ['NEWW'], w: 2.2, slots: function (t) {
      var buyRe = /\b(?:buying price|buy price|buying|buy|bei ya kununua|kununua|nunua|nilinunua)\s+(?:at\s+|kwa\s+)?(\d+)/, buy = numAfter(t, buyRe), t2 = t.replace(buyRe, ' '), sell = numAfter(t2, /\b(?:selling price|sell price|selling|sell|bei ya kuuza|kuuza|uza|price|bei)\s+(?:at\s+|kwa\s+)?(\d+)/), stock = numAfter(t, /\b(?:stock|stoku|quantity|qty|idadi|pieces|pcs)\s+(?:of\s+|ya\s+)?(\d+)/) || numAfter(t, /\b(\d+)\s+(?:pieces|pcs|in stock)\b/);
      var after = /\b(?:product|bidhaa|item)\s+(.+)$/.exec(t.trim() + ' '); var seg = after ? after[1] : words(strip(' ' + t + ' ', ['ADDP', 'PRODUCTW', 'NEWW', 'STOP']));
      seg = seg.replace(/\b(?:buying price|buy price|buying|buy|bei ya kununua|kununua|nunua|selling price|sell price|selling|sell|bei ya kuuza|kuuza|uza|price|bei|stock|stoku|quantity|qty|idadi|pieces|pcs|at|kwa)\b.*$/, ' ').replace(/\b\d+\b/g, ' ');
      var name = words(strip(' ' + seg + ' ', ['STOP', 'NEWW'])); if (!name) return null;
      var o = { name: name }; if (buy != null) o.buy = buy; if (sell != null) o.sell = sell; if (stock != null) o.stock = stock; return o; } })
  ];

  /* ───────────── scoring ───────────── */
  function best(textRaw, page) {
    var t = norm(repair(textRaw)), cands = [], hadNeed = null;
    var wc = t.trim().split(' ').length;
    RULES.forEach(function (r) {
      if (r.onlyPage && r.onlyPage !== page) return;
      if (r.cue && wc > 3 && !CUES.some(function (g) { return has(g, t); })) return;   // a bare noun inside a long sentence is chatter ("the balance of power...")
      for (var i = 0; i < r.all.length; i++) if (!RE[r.all[i]] || !has(r.all[i], t)) return;
      for (var j = 0; j < r.not.length; j++) if (RE[r.not[j]] && has(r.not[j], t)) return;
      var score = r.w, b; for (b = 0; b < r.boost.length; b++) if (has(r.boost[b], t)) score += 0.25;
      if (page && MODMAP[r.id.split('.')[0]] === page) score += 0.3;
      var slots = r.fixed ? Object.assign({}, r.fixed) : {};
      if (r.slots) { var s = r.slots(t); if (!s) { if (r.needCue && !r.needCue.some(function (g) { return has(g, t); })) return; if (!hadNeed || score > hadNeed.score) hadNeed = { id: r.id, score: score }; return; } Object.assign(slots, s); }
      Object.keys(slots).forEach(function (k) { if (slots[k] == null) delete slots[k]; });
      if (r.id === 'duka.report' && slots.period == null) slots.period = 'today';
      cands.push({ id: r.id, score: score, slots: slots });
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    return { cands: cands, need: hadNeed };
  }
  var MIN = 1.0, MARGIN = 0.25;

  /* result = engine capture result ({transcript, alternatives, lang}). Returns
   *   {kind:'action', id, module, phrase, confidence}  |  {kind:'ambiguous', options:[{id,label}]}  |  {kind:'need', id, say}  |  null */
  function understand(result, page) {
    if (!result || !result.transcript) return null;
    var texts = [result.transcript].concat((result.alternatives || []).slice(0, 3)), top = [], need = null;
    texts.forEach(function (tx, i) { var b = best(tx, page); b.cands.forEach(function (c) { c.score -= i * 0.1; top.push(c); }); if (b.need && (!need || b.need.score > need.score)) need = b.need; });
    top.sort(function (a, b) { return b.score - a.score; });
    var seen = {}, uniq = top.filter(function (c) { var k = c.id + JSON.stringify(c.slots); if (seen[k]) return false; seen[k] = 1; return true; });
    var lang = /^sw/i.test(result.lang || '') ? 1 : 0;
    if (!uniq.length || uniq[0].score < MIN) {
      if (need && need.score >= MIN && NEED[need.id]) return { kind: 'need', id: need.id, say: NEED[need.id][lang] };
      return null;
    }
    var first = uniq[0], rival = uniq.filter(function (c) { return c.id !== first.id && first.score - c.score < MARGIN; })[0];
    if (rival) return { kind: 'ambiguous', options: [first, rival].map(function (c) { return { id: c.id, label: LABEL[c.id][lang] }; }) };
    var phrase = PHRASE[first.id] && PHRASE[first.id](first.slots);
    if (!phrase) return null;
    return { kind: 'action', id: first.id, module: MODMAP[first.id.split('.')[0]] || 'shell', phrase: phrase, confidence: Math.min(1, first.score / 2.5) };
  }


  /* ───────────── phrases taught by an ADMIN (synced from the backend, cached on the phone, work offline) ─────────────
   * An admin adds a phrase once (Tool -> Admin -> Voice phrases). Every user's app downloads the list and, when anyone says that phrase, the
   * assistant answers: either a KNOWN action (same safe path as built-in commands) or a fixed spoken reply. These are checked BEFORE the built-in
   * matching because an admin added them on purpose. One {placeholder} is allowed: "wacha {name} awe rafiki wangu". */
  var PH_KEY = 'necpra_voice_phrases_v1', phEntries = [], phExact = {}, phSet = {}, phVersion = null, phLast = 0, phBusy = false;
  /* MUST stay identical to normPhrase() in moodchat/src/services/voicePhrases.js (tools/test-voice-phrases-frontend.js proves it). */
  function normPhrase(text) {
    var t = String(text == null ? '' : text), ph = /\{([a-z_]{1,20})\}/i.exec(t);
    if (ph) t = t.replace(ph[0], ' zzplaceholderzz ');
    t = t.toLowerCase();
    try { t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    t = t.replace(/['\u2019`]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    return ph ? t.replace('zzplaceholderzz', '{' + ph[1].toLowerCase() + '}') : t;
  }
  var STOPSET = null;
  function contentKey(norm) { if (!STOPSET) { STOPSET = {}; GROUPS.STOP.forEach(function (w) { STOPSET[w] = 1; }); } var k = norm.split(' ').filter(function (w) { return w && !STOPSET[w]; }); return k.length ? k.slice().sort().join(' ') : ''; }
  function escRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function setPhrases(list, version) {
    phEntries = []; phExact = {}; phSet = {}; phVersion = version || null;
    (Array.isArray(list) ? list : []).slice(0, 3000).forEach(function (e) {
      if (!e || typeof e.p !== 'string' || !e.p) return;
      var m = /^(.*?)\s*\{([a-z_]+)\}\s*(.*)$/.exec(e.p), en = { id: e.id, kind: e.kind, action: e.action, module: e.module, slots: e.slots || {}, ph: e.ph || null, phrase: e.phrase || null, en: e.en, sw: e.sw };
      if (m && e.ph) { en.rx = new RegExp('^' + (m[1] ? escRe(m[1]) + ' ' : '') + '(.+?)' + (m[3] ? ' ' + escRe(m[3]) : '') + '$'); phEntries.push(en); return; }
      phExact[e.p] = en; var k = contentKey(e.p); if (k && !phSet[k]) phSet[k] = en;
    });
  }
  function saveCache(list, version) { try { root.localStorage.setItem(PH_KEY, JSON.stringify({ version: version, list: list, at: Date.now() })); } catch (_) {} }
  (function loadCache() { try { var o = JSON.parse(root.localStorage.getItem(PH_KEY) || 'null'); if (o && Array.isArray(o.list)) setPhrases(o.list, o.version); } catch (_) {} })();
  function title(w) { return w.replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); }
  function fromEntry(en, norm) {
    if (en.kind === 'reply') return { kind: 'reply', say: { en: en.en, sw: en.sw || en.en }, source: 'admin', id: en.id };
    var phrase = en.phrase, slots = Object.assign({}, en.slots);
    if (en.ph) { var cap = norm.replace(en.rx, '$1').trim(); cap = words(strip(' ' + cap + ' ', ['STOP'])).replace(/\s+/g, ' ').trim() || cap; if (!cap || cap.split(' ').length > 4) return null; slots[en.ph] = title(cap); phrase = PHRASE[en.action] && PHRASE[en.action](slots); }
    if (!phrase && PHRASE[en.action]) phrase = PHRASE[en.action](slots);
    return phrase ? { kind: 'action', id: en.action, module: en.module || MODMAP[String(en.action).split('.')[0]] || 'shell', phrase: phrase, source: 'admin', confidence: 1 } : null;
  }
  /* result = engine capture result. Returns {kind:'action'|'reply', ...} or null. */
  function matchAdmin(result) {
    if (!result || !result.transcript || !(phEntries.length || Object.keys(phExact).length)) return null;
    var texts = [result.transcript].concat((result.alternatives || []).slice(0, 3));
    for (var i = 0; i < texts.length; i++) {
      var n = normPhrase(texts[i]); if (!n) continue;
      var hit = phExact[n] || phSet[contentKey(n)]; if (hit) { var r = fromEntry(hit, n); if (r) return r; }
      for (var j = 0; j < phEntries.length; j++) { if (phEntries[j].rx.test(n)) { var r2 = fromEntry(phEntries[j], n); if (r2) return r2; } }
    }
    return null;
  }
  function cfgOf() { var V = root.NecpraVoice; return (V && V._cfg && V._cfg()) || {}; }
  function syncPhrases(force) {
    try {
      if (phBusy || !root.fetch || (!force && Date.now() - phLast < 900000) || (root.navigator && root.navigator.onLine === false)) return Promise.resolve(false);
      var c = cfgOf(), tk = c.getToken ? c.getToken() : '', b = typeof c.apiBase === 'function' ? c.apiBase() : c.apiBase; if (!tk) return Promise.resolve(false);
      phBusy = true; var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
      return root.fetch((b || '') + '/api/voice/phrases' + (phVersion ? '?since=' + encodeURIComponent(phVersion) : ''), { headers: { Authorization: 'Bearer ' + tk }, signal: ctl ? ctl.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (tm) clearTimeout(tm); phBusy = false; phLast = Date.now(); if (!j || !j.ok || j.unchanged) return false; setPhrases(j.phrases, j.version); saveCache(j.phrases, j.version); return true; },
          function () { if (tm) clearTimeout(tm); phBusy = false; return false; });
    } catch (_) { phBusy = false; return Promise.resolve(false); }
  }

  /* Optional, OFF by default, local only: remember phrases nobody understood so the developer can add words. Never sent anywhere. */
  var KEY = 'necpra_voice_unheard_v1';
  function logUnheard(text) { try { var a = JSON.parse(root.localStorage.getItem(KEY) || '[]'); a.push({ t: String(text).slice(0, 120), at: Date.now() }); root.localStorage.setItem(KEY, JSON.stringify(a.slice(-100))); } catch (_) {} }
  function getUnheard() { try { return JSON.parse(root.localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } }
  function clearUnheard() { try { root.localStorage.removeItem(KEY); } catch (_) {} }

  var api = { matchAdmin: matchAdmin, setPhrases: setPhrases, syncPhrases: syncPhrases, normPhrase: normPhrase, phraseInfo: function () { return { count: Object.keys(phExact).length + phEntries.length, version: phVersion }; }, understand: understand, norm: norm, repair: repair, PHRASE: PHRASE, LABEL: LABEL, GROUPS: GROUPS, logUnheard: logUnheard, getUnheard: getUnheard, clearUnheard: clearUnheard, _best: best };
  root.NecpraVoiceNLU = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
