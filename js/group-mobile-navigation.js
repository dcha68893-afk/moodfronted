/* Necpa group mobile navigation: single-panel mode below 768px, split-panel mode on desktop. */
(function () {
  'use strict';

  if (!/\/group\.html$/i.test(window.location.pathname)) return;
  if (window.__NECPRA_GROUP_MOBILE_NAV__) return;
  window.__NECPRA_GROUP_MOBILE_NAV__ = true;

  var style = document.createElement('style');
  style.setAttribute('data-necpra-group-mobile', '1');
  style.textContent = [
    '@media (max-width: 768px) {',
    'html,body,#layout { width:100% !important; min-width:0 !important; max-width:100% !important; }',
    '#layout.mobile-mode { display:block !important; position:relative !important; width:100% !important; height:100% !important; overflow:hidden !important; }',
    '#layout.mobile-mode .groups-panel, #layout.mobile-mode .chat-panel { position:absolute !important; inset:0 !important; width:100% !important; max-width:none !important; min-width:0 !important; height:100% !important; }',
    '#layout.mobile-mode .groups-panel { display:flex !important; flex-direction:column !important; }',
    '#layout.mobile-mode .chat-panel { display:flex !important; flex-direction:column !important; }',
    '#layout.mobile-mode .groups-panel.mobile-hidden, #layout.mobile-mode .chat-panel.mobile-hidden { display:none !important; visibility:hidden !important; pointer-events:none !important; }',
    '#layout.mobile-mode .groups-panel.mobile-visible, #layout.mobile-mode .chat-panel.mobile-visible { display:flex !important; visibility:visible !important; pointer-events:auto !important; }',
    '#layout.mobile-mode .chat-panel.mobile-visible { width:100% !important; }',
    '#layout.mobile-mode .back { display:block !important; }',
    '}',
    '@media (min-width: 769px) {',
    '#layout { display:grid !important; position:static !important; width:100% !important; height:100% !important; }',
    '#layout .groups-panel, #layout .chat-panel { position:static !important; width:auto !important; height:100% !important; display:flex !important; visibility:visible !important; pointer-events:auto !important; }',
    '#layout .groups-panel.mobile-hidden, #layout .groups-panel.mobile-visible, #layout .chat-panel.mobile-hidden, #layout .chat-panel.mobile-visible { display:flex !important; visibility:visible !important; pointer-events:auto !important; }',
    '#layout .back { display:none !important; }',
    '}'
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  function mobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  }

  function apply(panel) {
    var layout = document.getElementById('layout');
    var groups = document.querySelector('.sidebar');
    var chat = document.querySelector('.panel');
    if (!layout || !groups || !chat) return;

    groups.classList.add('groups-panel');
    chat.classList.add('chat-panel');

    if (!mobile()) {
      layout.classList.remove('mobile-mode', 'chat-open');
      groups.classList.remove('mobile-hidden', 'mobile-visible');
      chat.classList.remove('mobile-hidden', 'mobile-visible');
      return;
    }

    var showChat = panel === 'chat';
    layout.classList.add('mobile-mode');
    layout.classList.toggle('chat-open', showChat);
    groups.classList.toggle('mobile-hidden', showChat);
    groups.classList.toggle('mobile-visible', !showChat);
    chat.classList.toggle('mobile-hidden', !showChat);
    chat.classList.toggle('mobile-visible', showChat);
  }

  function currentPanel() {
    return window.__GROUP_CHAT_ID ? 'chat' : 'groups';
  }

  function wrapHandlers() {
    var open = window.openGroup;
    var close = window.closeGroup;
    if (typeof open === 'function' && !open.__necpraWrapped) {
      var wrappedOpen = function () {
        var result = open.apply(this, arguments);
        apply('chat');
        return result;
      };
      wrappedOpen.__necpraWrapped = true;
      window.openGroup = wrappedOpen;
    }
    if (typeof close === 'function' && !close.__necpraWrapped) {
      var wrappedClose = function () {
        var result = close.apply(this, arguments);
        apply('groups');
        return result;
      };
      wrappedClose.__necpraWrapped = true;
      window.closeGroup = wrappedClose;
    }
  }

  function install() {
    apply(currentPanel());

    var media = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
    if (media) {
      var onChange = function () { apply(currentPanel()); };
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    }

    window.addEventListener('resize', function () { apply(currentPanel()); }, { passive: true });
    window.addEventListener('orientationchange', function () { apply(currentPanel()); }, { passive: true });
    window.addEventListener('kyn:group:open', function () { apply('chat'); });
    window.addEventListener('kyn:group:close', function () { apply('groups'); });

    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      wrapHandlers();
      apply(currentPanel());
      if (attempts >= 30) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
