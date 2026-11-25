/* NECPRA Personal Assistant: in-app reminder alerts.
 * While the app is open, asks OUR backend (GET /api/intelligence/reminders/due, the caller's own reminders only) once a minute and on
 * return-to-app / back-online. A due reminder appears as a banner with "Done" and "Later". Nothing is changed unless the person taps Done
 * (POST /reminders/:id/done). "Later" hides it for this session only; it stays pending on the server. Closed-app delivery is the server push.
 * No storage, no logging of reminder text, no third-party service. */
(function (root) {
  'use strict';
  var POLL_MS = 60000, MAX_SHOWN = 3;
  function create(o) {
    o = o || {}; var win = o.win || root, doc = o.doc || (win && win.document), fetchFn = o.fetch || (win && win.fetch && win.fetch.bind(win));
    var seen = {}, timer = null, busy = false, started = false;
    function base() { var b = typeof o.apiBase === 'function' ? o.apiBase() : o.apiBase; return b || ''; }
    function token() { try { return o.getToken ? o.getToken() : ''; } catch (_) { return ''; } }
    function req(path, method) { return fetchFn(base() + '/api/intelligence' + path, { method: method || 'GET', headers: { Authorization: 'Bearer ' + token() } }); }
    function box() {
      var b = doc.getElementById('necpra-reminder-box'); if (b) return b;
      b = doc.createElement('div'); b.id = 'necpra-reminder-box'; b.setAttribute('role', 'alert'); b.setAttribute('aria-live', 'assertive');
      b.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147483000;display:flex;flex-direction:column;gap:8px;pointer-events:none';
      (doc.body || doc.documentElement).appendChild(b); return b;
    }
    function card(r) {
      var c = doc.createElement('div'); c.setAttribute('data-reminder-id', r.id);
      c.style.cssText = 'pointer-events:auto;background:#111827;color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.35);font:15px system-ui,sans-serif';
      var t = doc.createElement('div'); t.style.cssText = 'font-weight:600;margin-bottom:8px'; t.textContent = '⏰ ' + String(r.text || '').slice(0, 200); c.appendChild(t);
      function btn(label, fn) { var b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'margin-right:8px;padding:6px 12px;border-radius:8px;border:0;background:#2563eb;color:#fff;font:inherit'; b.onclick = fn; c.appendChild(b); return b; }
      btn('Done', function () { markDone(r, c); }); btn('Later', function () { c.remove(); });
      return c;
    }
    function markDone(r, c) {
      return req('/reminders/' + encodeURIComponent(r.id) + '/done', 'POST').then(function (res) { if (res && res.ok) { if (c) c.remove(); } }, function () { /* stays pending; shown again after reload */ });
    }
    function poll() {
      if (busy || !token() || !fetchFn) return Promise.resolve(0);
      if (doc.hidden || (win.navigator && win.navigator.onLine === false)) return Promise.resolve(0);
      busy = true;
      return req('/reminders/due').then(function (res) { return res.ok ? res.json() : null; }).then(function (j) {
        busy = false; var list = (j && Array.isArray(j.reminders)) ? j.reminders : [], shown = 0;
        list.forEach(function (r) {
          if (!r || !r.id || seen[r.id] || shown >= MAX_SHOWN) return; seen[r.id] = 1; shown++;
          box().appendChild(card(r));
          try { if (o.speak) o.speak(String(r.text || '').slice(0, 140)); } catch (_) {}
        });
        return shown;
      }, function () { busy = false; return 0; });
    }
    function start() {
      if (started) return api; started = true;
      timer = win.setInterval(poll, POLL_MS); setTimeout(poll, 4000);
      doc.addEventListener('visibilitychange', function () { if (!doc.hidden) poll(); }); win.addEventListener('online', poll);
      return api;
    }
    function stop() { if (timer) win.clearInterval(timer); timer = null; started = false; }
    var api = { start: start, stop: stop, poll: poll };
    return api;
  }
  var out = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.NecpraReminders = out;
})(typeof window !== 'undefined' ? window : globalThis);
