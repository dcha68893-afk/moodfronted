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

  /* u = { phrase, module } from the in-app NLU or the optional AI. Go to the screen that owns the action and let ITS handler run the phrase. */
  async function runUnderstood(u, result, page) {
    var r2 = Object.assign({}, result, { transcript: u.phrase, alternatives: [], __understood: true });
    if (u.module && u.module !== 'shell' && cfg.allowedPages.indexOf(u.module) >= 0) {
      if (cfg.getPage() !== u.module) cfg.navigate(u.module);
      if (await forward(u.module, r2)) { V.audit('voice.nav', { module: u.module, outcome: 'executed', lang: result.lang }); return true; }
      if (page && cfg.getPage() !== page) cfg.navigate(page);
      return false;
    }
    return !!(await handle(r2));   // navigation ("open wallet", "go back")
  }
  async function handle(result) {
    var text = result.transcript, K = root.NecpraVoiceKnowledge;
    // Phrases an ADMIN taught the assistant win over built-in matching (exact phrase only). A reply is spoken; an action runs on its own screen.
    var AD = root.NecpraVoiceNLU;
    if (AD && !result.__understood && !result.usedAlternative && !(K && K.isWake(text))) {
      var hit = AD.matchAdmin(result);
      if (hit && hit.kind === 'reply') { V.speak(T(hit.say.en, hit.say.sw), { force: true }); V.audit('voice.nav', { module: 'shell', outcome: 'admin-reply', lang: result.lang }); return true; }
      if (hit && hit.kind === 'action' && (await runUnderstood(hit, result, null))) return true;
    }
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
    // Chat-list actions by voice from ANY screen when a person is NAMED ("archive chat with Denis", "mute Denis", "block Denis"): go to Messenger and hand the words
    // over. Messenger asks for confirmation before archive / delete / block. Checked before Settings so "zima arifa za <name>" is never read as a setting.
    var cact = I.parseChatAction ? I.parseChatAction(text) : null;
    if (cact && cact.name && cfg.allowedPages.indexOf('messages') >= 0) {
      if (cfg.getPage() !== 'messages') cfg.navigate('messages');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('messages', result);
    }
    // Leaving / adding someone to a NAMED group from any screen ("leave the Family group", "add Denis to the Family group"): go to Groups and hand the words over.
    // Groups asks for a spoken yes first (and leaving also shows the app's own prompt).
    if (cfg.allowedPages.indexOf('group') >= 0 && /^(?:please\s+|tafadhali\s+)?(?:(?:leave|ondoka kwenye|toka kwenye)\s+(?:the\s+)?.+?\s+(?:group|kikundi)|(?:add|ongeza)\s+.+?\s+(?:to|in|into|kwenye|kwa)\s+(?:the\s+)?.+?\s+(?:group|kikundi))$/i.test(clean(text)) && !/\bas a friend\b/i.test(text)) {
      if (cfg.getPage() !== 'group') cfg.navigate('group');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('group', result);
    }
    // Group admin by voice from ANY screen when the group is NAMED or the words carry everything needed: "create a group Family with Denis and Mary",
    // "remove Denis from the Family group", "rename the Family group to Crew". Groups asks for a spoken yes before it changes anything.
    if (cfg.allowedPages.indexOf('group') >= 0 && !/\bas a friend\b/i.test(text) && /^(?:please\s+|tafadhali\s+)?(?:(?:create|make|start|unda|anzisha)\s+(?:a\s+|new\s+)*(?:group|kikundi)\s+(?:(?:called|named|iitwayo)\s+)?.+?\s+(?:with|and add|na wanachama|pamoja na)\s+.+|(?:remove|kick(?:\s+out)?|ondoa|mfukuze)\s+.+?\s+(?:from|out of|kwenye|katika)\s+(?:the\s+)?.+?\s+(?:group|kikundi)|(?:make|promote|mfanye)\s+.+?\s+(?:to\s+|an?\s+)?(?:group\s+)?(?:admin|msimamizi)\s+(?:in|of|wa|kwenye)\s+(?:the\s+)?.+?\s+(?:group|kikundi))$/i.test(clean(text))) {
      if (cfg.getPage() !== 'group') cfg.navigate('group');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('group', result);
    }
    // Settings by voice from ANY screen: "open privacy settings", "turn off read receipts", "dark mode". Runs before parseNav, which would only open
    // the bare Settings page (or Messenger for "chat settings") and lose the request.
    if (cfg.allowedPages.indexOf('settings') >= 0 && (/^(?:please\s+|tafadhali\s+)?(?:open|go to|show|take me to|fungua|nenda kwa|nipeleke|nionyeshe)\s+(?:the\s+|my\s+)?(?:(?:profile|security|privacy|notifications?|appearance|storage|backup|advanced|danger)(?:\s+settings?)?|(?:help|contact us|terms(?: of service| and conditions)?)|(?:chat|friends?|groups?|status|mood)\s+settings?|mipangilio ya .+)$/i.test(clean(text)) ||
        (/^(?:please\s+)?(?:(?:turn|switch|set)\s+(?:on|off)\s+|(?:enable|disable|washa|zima)\s+)/i.test(clean(text)) && /(receipts?|last seen|typing|online status|profile photo|notifications?|sounds?|vibrat|previews?|dark mode|light mode|theme|wallpaper|auto.?download|enter|suggestions?|discovery|read)/i.test(text)) || /^(?:dark mode|light mode|use dark mode|use light mode)$/i.test(clean(text)))) {
      if (cfg.getPage() !== 'settings') cfg.navigate('settings');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      return forward('settings', result);
    }
    // Admin by voice from ANY screen, ADMINS ONLY: "open admin", "open admin orders", "fungua admin". Navigation only; the Admin module and the server re-check the role.
    // For everyone else this branch is skipped, so "open admin" is not special (a contact called Admin still opens normally) and nothing reveals the module.
    var am = /^(?:please\s+|tafadhali\s+)?(?:open|go to|show(?: me)?|take me to|fungua|nenda kwa|nipeleke|nionyeshe)\s+(?:the\s+|my\s+)?(?:admin|msimamizi|usimamizi)(?:\s+(?:panel|module|dashboard|paneli|menu))?(?:\s+(.+))?$/i.exec(clean(text));
    var adminNow = root.__necpraIsAdmin === true || (root.__necpraIsAdmin == null && !!(doc.body && doc.body.classList.contains('is-admin')));
    if (am && adminNow && cfg.allowedPages.indexOf('admin') >= 0) {
      if (cfg.getPage() !== 'admin') cfg.navigate('admin');
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      var rest = clean(am[1] || '');
      if (rest && (await forward('admin', Object.assign({}, result, { transcript: 'open ' + rest, alternatives: [] })))) return true;
      V.speak(T('Opening Admin.', 'Inafungua Admin.'));
      return true;
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
    // Inventory questions must always reach DUKA, even when the user is speaking
    // from another module. Treat singular/plural and common shop wording as live data
    // questions, not as generic help text or an unrecognised command.
    var dukaInventoryQuestion = /\b(?:how many|number of|count|total|idadi ya|bidhaa ngapi|ngapi)\b.*\b(?:products?|items?|goods|bidhaa)\b|\b(?:products?|items?|goods|bidhaa)\b.*\b(?:do we have|do i have|have we got|in (?:my |our |the )?(?:shop|store|duka|inventory)|available)\b/i.test(clean(text));
    if (dukaInventoryQuestion && cfg.allowedPages.indexOf('tools') >= 0) {
      var inventoryPreviousPage = cfg.getPage();
      if (inventoryPreviousPage !== 'tools') cfg.navigate('tools');
      if (await forward('tools', result)) { V.audit('voice.nav', { module: 'tools', outcome: 'answered-inventory', lang: result.lang }); return true; }
      if (inventoryPreviousPage && inventoryPreviousPage !== 'tools') cfg.navigate(inventoryPreviousPage);
    }
    // DUKA operations are routed to the shop module with the original words intact. The module opens a form or screen;
    // the universal assistant remains the only microphone and money/stock changes still need on-screen confirmation.
    var dukaOperation = /\b(?:held bills?|parked bills?|hold this bill|resume bill|discard held|barcode|bar code|scan (?:a )?(?:product|item|code)|receive stock|stock receiving|register supplier|add supplier|supplier registration|create group order|start group order|group order|group buying|buy together|stock loss|spoiled stock|record spoilage|sync now|sync status|pending changes|offline changes)\b/i.test(clean(text));
    if (dukaOperation && cfg.allowedPages.indexOf('tools') >= 0) {
      var previousPage = cfg.getPage();
      if (previousPage !== 'tools') cfg.navigate('tools');
      if (await forward('tools', result)) { V.audit('voice.nav', { module: 'tools', outcome: 'executed', lang: result.lang }); return true; }
      if (previousPage && previousPage !== 'tools') cfg.navigate(previousPage);
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
    // Nothing on screen understood it. (1) Free in-app understanding: many ways of saying each action, English / Kiswahili / Sheng, no network.
    // It yields a canonical phrase that the screens' own handlers parse, so their confirmations and privacy rules still apply.
    var NLU = root.NecpraVoiceNLU;
    if (!result.__understood && !result.usedAlternative && NLU) {
      var local = NLU.understand(result, page);
      if (local && local.kind === 'action') { if (await runUnderstood(local, result, page)) return true; result.__understood = true; }   // found the action but its screen could not do it: do not also pay for the AI
      else if (local && local.kind === 'ambiguous') {   // two actions fit equally: ask, never guess
        V.speak(T('Did you mean: ' + local.options[0].label + ', or ' + local.options[1].label + '?', 'Unamaanisha: ' + local.options[0].label + ', au ' + local.options[1].label + '?'), { force: true }); return true;
      } else if (local && local.kind === 'need') { V.speak(local.say, { force: true }); return true; }   // the action is clear but the name/amount is missing
    }
    // (2) NECPRA Intelligence Engine on our own backend (free, no third-party AI; only if the backend has it on and the user allows it). Silent no-op when off, offline, slow or unsure.
    if (!result.__understood && !result.usedAlternative && root.NecpraVoiceUnderstand) {
      var u = await root.NecpraVoiceUnderstand.rewrite(result, page);
      if (u && u.spoken) return true;   // the engine answered or asked a question out loud
      if (u && u.phrase && (await runUnderstood(u, result, page))) return true;
    }
    if (!result.__understood && !result.usedAlternative && NLU && V.getSettings().logUnheard) NLU.logUnheard(result.transcript);   // opt-in, stays on the phone
    // Natural data questions ("how many friends?", "what is my balance?",
    // "who viewed my status?", "how many members are in this group?") go to
    // the module that owns the data. Preserve the words so its own handler can
    // query the authenticated account and speak the result.
    var topic = I.topicOf ? I.topicOf(text) : null;
    if (topic && topic !== page && cfg.allowedPages.indexOf(topic) >= 0) {
      var questionPreviousPage = page;
      cfg.navigate(topic);
      if (await forward(topic, result)) { V.audit('voice.nav', { module: topic, outcome: 'answered-natural-question', lang: result.lang }); return true; }
      if (questionPreviousPage && cfg.getPage() !== questionPreviousPage) cfg.navigate(questionPreviousPage);
    }
    return false; // not something any screen could do: the caller says so honestly and points to "what can you do" (never a made-up answer)
  }

  function init(c) {
    cfg = Object.assign({ allowedPages: ['messages', 'money', 'friends', 'tools', 'group', 'status', 'settings', 'games', 'admin'] }, c);
    V.registerHandler('shell', handle);
    try { setTimeout(function () { if (root.NecpraVoiceNLU) root.NecpraVoiceNLU.syncPhrases(true); }, 4000); } catch (_) {}   // fetch phrases the admin taught (cached on the phone afterwards)
    return true;
  }
  root.NecpraVoiceShell = { init: init, _handle: handle };
})(typeof window !== 'undefined' ? window : globalThis);
