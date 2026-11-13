/*! NECPRA Voice Shell (runs in the app shell, chat.html): voice navigation between modules + forwarding of module intents. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, I = root.NecpraVoiceIntents; if (!V || !I) return;
  var doc = root.document, cfg = null;
  function sw() { return /^sw/i.test(V.resolveLang()); }
  function T(en, s) { return sw() ? s : en; }
  function frameFor(page) { return doc.getElementById(page + 'Iframe'); }

  async function forward(page, result, mode, timeoutMs) {
    var host = cfg.host(), f = frameFor(page); if (!host || !f) return false;
    if (!host.hasSession(f)) { if (!(await host.waitForSession(f, 6000))) return false; }
    var r = await host.sendIntent(f, { transcript: result.transcript, lang: result.lang, mode: mode || result.mode }, timeoutMs);
    return !!r.handled;
  }
  // Is this bare "open Denis" really a person? Ask Messenger WITHOUT leaving the current screen (probe = look up only).
  async function isContact(result) {
    var host = cfg.host(), f = frameFor('messages'); if (!host || !f || !host.hasSession(f)) return null; // null = cannot tell yet
    return forward('messages', result, 'probe', 4000);
  }

  async function handle(result) {
    var text = result.transcript;
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
    var page = cfg.getPage(); return page ? forward(page, result) : false; // anything else goes to the screen the user is looking at
  }

  function init(c) {
    cfg = Object.assign({ allowedPages: ['messages', 'money', 'friends', 'tools', 'group', 'status', 'settings', 'games'] }, c);
    V.registerHandler('shell', handle); return true;
  }
  root.NecpraVoiceShell = { init: init, _handle: handle };
})(typeof window !== 'undefined' ? window : globalThis);
