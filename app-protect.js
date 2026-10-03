/* app-protect.js - production hardening (load FIRST in <head>).
   1. Silences console output so DevTools shows no repeated/offline error noise.
   2. Hides the screen when the app is backgrounded / tab hidden (task-switcher previews).
   3. Discourages screenshot / print / view-source shortcuts on web.
   NOTE: the installed Android app already blocks screenshots natively (FLAG_SECURE in
   MainActivity). A web page can never fully prevent screenshots, copying or source
   inspection - these are deterrents only. Add ?debug=1 once (or set localStorage
   kyn_debug=1) to turn logging back on while developing. */
(function () {
  'use strict';
  var host = location.hostname;
  var dev = /^(localhost|127\.|10\.|192\.168\.)/.test(host);
  var debug = false;
  try { debug = dev || /[?&]debug=1/.test(location.search) || localStorage.getItem('kyn_debug') === '1'; if (/[?&]debug=1/.test(location.search)) localStorage.setItem('kyn_debug', '1'); } catch (_) {}
  if (debug) return;

  // 1. quiet console
  var noop = function () {};
  ['log', 'info', 'debug', 'warn', 'error', 'trace', 'table', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'count', 'assert']
    .forEach(function (m) { try { console[m] = noop; } catch (_) {} });
  // offline network failures / unhandled rejections must not print "Uncaught (in promise)" noise
  window.addEventListener('unhandledrejection', function (e) { e.preventDefault(); });
  window.addEventListener('error', function (e) { if (e && e.preventDefault) e.preventDefault(); return true; }, true);
  window.onerror = function () { return true; };

  // 2. privacy shield when hidden
  var shield;
  function show() {
    if (shield || !document.body) return;
    shield = document.createElement('div');
    shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111;';
    document.body.appendChild(shield);
  }
  function hide() { if (shield) { shield.remove(); shield = null; } }
  document.addEventListener('visibilitychange', function () { document.hidden ? show() : hide(); });
  window.addEventListener('blur', show); window.addEventListener('focus', hide);

  // 3. deterrents
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var block = k === 'f12' || k === 'printscreen' ||
      ((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's' || k === 'p')) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 's'));
    if (block) { e.preventDefault(); e.stopPropagation(); if (k === 'printscreen') { try { navigator.clipboard.writeText(''); } catch (_) {} } return false; }
  }, true);
  document.addEventListener('keyup', function (e) { if ((e.key || '') === 'PrintScreen') { try { navigator.clipboard.writeText(''); } catch (_) {} } });
  var st = document.createElement('style');
  st.textContent = '@media print{html,body{display:none!important}}';
  (document.head || document.documentElement).appendChild(st);
})();
