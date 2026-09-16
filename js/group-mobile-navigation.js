/* Necpa group mobile navigation: single-panel mode below 768px, split-panel mode on desktop. */
(function () {
  'use strict';

  if (!/\/group\.html$/i.test(window.location.pathname)) return;
  if (window.__NECPRA_GROUP_MOBILE_NAV__) return;
  window.__NECPRA_GROUP_MOBILE_NAV__ = true;

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

  function install() {
    apply(currentPanel());

    var media = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
    if (media) {
      var onChange = function () { apply(currentPanel()); };
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    }

    window.addEventListener('resize', function () { apply(currentPanel()); }, { passive: true });

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

    window.addEventListener('kyn:group:open', function () { apply('chat'); });
    window.addEventListener('kyn:group:close', function () { apply('groups'); });

    /* group.html defines its handlers after config.js loads, so retry briefly until they exist. */
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      var o = window.openGroup, c = window.closeGroup;
      if (typeof o === 'function' && !o.__necpraWrapped) {
        var wo = function () { var r = o.apply(this, arguments); apply('chat'); return r; };
        wo.__necpraWrapped = true;
        window.openGroup = wo;
      }
      if (typeof c === 'function' && !c.__necpraWrapped) {
        var wc = function () { var r = c.apply(this, arguments); apply('groups'); return r; };
        wc.__necpraWrapped = true;
        window.closeGroup = wc;
      }
      apply(currentPanel());
      if (attempts >= 30) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
