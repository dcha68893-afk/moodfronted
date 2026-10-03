/* session-restore.js - load FIRST in <head> on every page.
   The secure-messaging unlock secret used to live only in sessionStorage, which Android/PWA
   wipes when the app is closed. That is why reopening the installed app showed the
   login/"unlock" screen again. This keeps a device-local copy (like WhatsApp keeping its keys
   on the device) and restores it before any page logic runs. It is removed on logout or a
   wrong password, because both already call sessionStorage.removeItem on these keys. */
(function () {
  'use strict';
  var KEYS = ['kyn_e2e_pw_session', 'kyn_e2e_pw_legacy_session'];
  var PREFIX = 'kyn_persist_';
  try {
    KEYS.forEach(function (k) {
      if (!sessionStorage.getItem(k)) { var v = localStorage.getItem(PREFIX + k); if (v) sessionStorage.setItem(k, v); }
    });
  } catch (_) {}
  try {
    var set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) {
      set.call(this, k, v);
      try { if (this === window.sessionStorage && KEYS.indexOf(k) !== -1) set.call(window.localStorage, PREFIX + k, v); } catch (_) {}
    };
    Storage.prototype.removeItem = function (k) {
      rem.call(this, k);
      try { if (this === window.sessionStorage && KEYS.indexOf(k) !== -1) rem.call(window.localStorage, PREFIX + k); } catch (_) {}
    };
  } catch (_) {}
})();
