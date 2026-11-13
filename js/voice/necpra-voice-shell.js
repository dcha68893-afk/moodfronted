/*! NECPRA Voice Shell (runs in the app shell, chat.html): voice navigation between modules + forwarding of module intents. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, I = root.NecpraVoiceIntents; if (!V || !I) return;
  var doc = root.document, cfg = null;
  function sw() { return /^sw/i.test(V.resolveLang()); }
  function T(en, s) { return sw() ? s : en; }
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function frameFor(page) { return doc.getElementById(page + 'Iframe'); }

  async function forward(page, result, mode, timeoutMs) {
    var host = cfg.host(), f = frameFor(page); if (!host || !f) return false;
    if (!host.hasSession(f)) { if (!(await host.waitForSession(f, 15000))) return false; }   /* a module opened for the first time can take several seconds to boot */
    var r = await host.sendIntent(f, { transcript: result.transcript, lang: result.lang, mode: mode || result.mode }, timeoutMs);
    return !!r.handled;
  }
  // Is this bare "open Denis" really a person? Ask Messenger WITHOUT leaving the current screen (probe = look up only).
  async function isContact(result) {
    var host = cfg.host(), f = frameFor('messages'); if (!host || !f || !host.hasSession(f)) return null; // null = cannot tell yet
    return forward('messages', result, 'probe', 4000);
  }

  async function handle(result) {
    var text = result.transcript, K = root.NecpraVoiceKnowledge;
    // "open voice": switch on Hands-Free so the user can keep talking with no taps (needs the one-time consent the first time).
    if (K && K.isWake(text)) {
      var HF = root.NecpraHandsFree;
      if (HF && !HF.isOn()) { HF.enable({ skipConsent: !!V.getSettings().handsFree }); return true; }
      V.speak(T('I am listening. What would you like to do?', 'Nasikiliza. Unataka kufanya nini?'), { force: true }); return true;
    }
    text = clean(text).replace(/^(?:(?:hey|hi|ok|okay)\s+)?(?:(?:can|could|would|will)\s+you\s+)(?:please\s+)?/i, ''); result = Object.assign({}, result, { transcript: text }); // "can you open settings" is the command "open settings"
    if (I.normalizeUtterance) { text = I.normalizeUtterance(text) || text; result = Object.assign({}, result, { transcript: text }); } // "please open the shama screen" / bare "chama" -> "open chama"
    // Questions about the app itself ("how do I add a friend", "what can you do") are answered from the written guide, never sent to a screen as a command.
    if (K && K.isHowTo(text) && K.respond(text)) return true;
    if (root.NecpraVoiceMoneyNLU && root.NecpraVoiceMoneyNLU.parse(text) && cfg.allowedPages.indexOf('money') >= 0) { // wallet / chama / orders / prepared payment
      if (cfg.getPage() !== 'money') cfg.navigate('money');
      if (await forward('money', result)) return true;
    }
    // "open chat with Denis" / "I want to chat with Denis" from ANY screen (wallet, status, games...): go to Messenger AND open that person's chat.
    // This runs before screen navigation, because "open chat with Denis" also contains the word "chat".
    var oc = I.parseOpenChat(text);
    if (oc && !oc.soft && cfg.allowedPages.indexOf('messages') >= 0) {
      if (cfg.getPage() !== 'messages') cfg.navigate('messages');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('messages', result);
    }
    // Settings by voice from ANY screen: "open privacy settings", "turn off read receipts", "dark mode". Runs before parseNav, which would only open
    // the bare Settings page (or Messenger for "chat settings") and lose the request.
    if (cfg.allowedPages.indexOf('settings') >= 0 && (/^(?:please\s+|tafadhali\s+)?(?:open|go to|show|take me to|fungua|nenda kwa|nipeleke|nionyeshe)\s+(?:the\s+|my\s+)?(?:(?:profile|security|privacy|notifications?|appearance|storage|backup|advanced|danger)(?:\s+settings?)?|(?:chat|friends?|groups?|status|mood)\s+settings?|mipangilio ya .+)$/i.test(clean(text)) ||
        (/^(?:please\s+)?(?:(?:turn|switch|set)\s+(?:on|off)\s+|(?:enable|disable|washa|zima)\s+)/i.test(clean(text)) && /(receipts?|last seen|typing|online status|profile photo|notifications?|sounds?|vibrat|previews?|dark mode|light mode|theme|wallpaper|auto.?download|enter|suggestions?|discovery|read)/i.test(text)) || /^(?:dark mode|light mode|use dark mode|use light mode)$/i.test(clean(text)))) {
      if (cfg.getPage() !== 'settings') cfg.navigate('settings');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('settings', result);
    }
    // Games by voice from ANY screen: "play chess", "start trivia".
    if (cfg.allowedPages.indexOf('games') >= 0 && /^(?:please\s+|tafadhali\s+)?(?:(?:i\s+(?:want|wanna)\s+to\s+)?(?:play|start|launch|open|begin|fungua|cheza|anza))\s+(?:a\s+game\s+of\s+|the\s+game\s+|a\s+game\s+|game\s+|the\s+|some\s+|a\s+)?(?:chess|chesi|trivia|quiz|cross\s*word|block(?:s| puzzle)?|tetris)(?:\s+game)?$/i.test(clean(text))) {
      if (cfg.getPage() !== 'games') cfg.navigate('games');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('games', result);
    }
    // "open group Family" / "tell the Family group saying ...": go to Groups AND hand the words over. This must run before parseNav, which would only open the Groups list and lose the group name.
    if (cfg.allowedPages.indexOf('group') >= 0 && /^(?:please\s+|tafadhali\s+)?(?:(?:open|go to|show|fungua|nenda kwa|take me to|nipeleke)\s+(?:to\s+)?(?:the\s+|my\s+)?(?:group|kikundi)\s+(?!list\b|settings\b)\S|(?:open|go to|fungua|nenda kwa)\s+(?:the\s+|my\s+)?.+?\s+(?:group|kikundi)$|(?:send|post|write|tuma|andika)\s+(?:a\s+)?(?:message\s+|ujumbe\s+)?(?:to\s+|kwa\s+)?(?:the\s+)?(?:group|kikundi)\s+\S|(?:tell|message|mwambie)\s+(?:the\s+)?.+?\s+(?:group|kikundi)\s+\S|(?:tell|message|mwambie)\s+(?:the\s+)?(?:group|everyone|wote)\s+\S)/i.test(clean(text))) {
      if (cfg.getPage() !== 'group') cfg.navigate('group');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('group', result);
    }
    var nav = I.parseNav(text);
    if (nav && nav.type === 'back') { V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang }); (cfg.back || function () { root.history.back(); })(); return true; }
    if (nav && nav.type === 'navigate') {
      if (cfg.allowedPages.indexOf(nav.page) < 0) return false;
      cfg.navigate(nav.page); var label = I.PAGE_LABEL[nav.page][sw() ? 1 : 0];
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      V.speak(T('Opening ' + label + '.', 'Inafungua ' + label + '.'));
      return true;
    }
    if (oc && oc.soft && cfg.allowedPages.indexOf('messages') >= 0) { // bare "open Denis": only a chat if Denis is a real contact
      var here = cfg.getPage(), known = here === 'messages' ? true : await isContact(result);
      if (known === true || known === null) {                          // null: Messenger not loaded yet, so try it and come back if it is not a person
        if (here !== 'messages') cfg.navigate('messages');
        if (await forward('messages', result)) return true;
        if (here && here !== 'messages') cfg.navigate(here);
      }
    }
    if (I.parseMessengerIntent(text, [])) { // Messenger claims it: go there, then hand it over so the right conversation opens
      if (cfg.getPage() !== 'messages') cfg.navigate('messages');
      return forward('messages', result);
    }
    if (I.isSaleStatement(text) && cfg.allowedPages.indexOf('tools') >= 0) { // "I sold…" from any screen goes to DUKA SMART
      if (cfg.getPage() !== 'tools') cfg.navigate('tools'); return forward('tools', result);
    }
    var page = cfg.getPage(), done = page ? await forward(page, result) : false; // anything else goes to the screen the user is looking at
    if (done) return true;
    // A question about ANOTHER module ("is there a friend request?" while in DUKA, "how many products do we have" while in Friends): ask the screen that owns the topic.
    var topic = I.topicOf ? I.topicOf(text) : null;
    if (topic && topic !== page && cfg.allowedPages.indexOf(topic) >= 0) {
      cfg.navigate(topic);
      if (await forward(topic, result)) { V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang }); return true; }
      if (page) cfg.navigate(page);   // that screen could not answer either: stay where the user was
    }
    return false; // not something any screen could do: the caller says so honestly and points to "what can you do" (never a made-up answer)
  }

  function init(c) {
    cfg = Object.assign({ allowedPages: ['messages', 'money', 'friends', 'tools', 'group', 'status', 'settings', 'games'] }, c);
    V.registerHandler('shell', handle); return true;
  }
  root.NecpraVoiceShell = { init: init, _handle: handle };
})(typeof window !== 'undefined' ? window : globalThis);
