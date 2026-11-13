/*! NECPRA Voice Shell (runs in the app shell, chat.html): voice navigation between modules + forwarding of module intents. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, I = root.NecpraVoiceIntents; if (!V || !I) return;
  var doc = root.document, cfg = null;
  function sw() { return /^sw/i.test(V.resolveLang()); }
  function T(en, s) { return sw() ? s : en; }
  function frameFor(page) { return doc.getElementById(page + 'Iframe'); }

  async function forward(page, result) {
    var host = cfg.host(), f = frameFor(page); if (!host || !f) return false;
    if (!host.hasSession(f)) { if (!(await host.waitForSession(f, 6000))) return false; }
    var r = await host.sendIntent(f, { transcript: result.transcript, lang: result.lang, mode: result.mode });
    return !!r.handled;
  }

  async function handle(result) {
    var text = result.transcript;
    var nav = I.parseNav(text);
    if (nav && nav.type === 'back') { V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang }); (cfg.back || function () { root.history.back(); })(); return true; }
    if (nav && nav.type === 'navigate') {
      if (cfg.allowedPages.indexOf(nav.page) < 0) return false;
      cfg.navigate(nav.page); var label = I.PAGE_LABEL[nav.page][sw() ? 1 : 0];
      V.audit('voice.nav', { module: 'shell', outcome: 'executed', lang: result.lang });
      V.speak(T('Opening ' + label + '.', 'Inafungua ' + label + '.'));
      return true;
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
