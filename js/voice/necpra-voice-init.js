/*! Wires the voice engine to NECPRA auth + API base, then (optionally) mounts the global mic. Load AFTER the four voice scripts. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice; if (!V) return;
  function token() {
    try { var a = root.getAuthSession && root.getAuthSession(); if (a && a.token) return a.token; } catch (_) {}
    try { var raw = root.localStorage.getItem('kynecta_auth'); if (raw) { var o = JSON.parse(raw); if (o && typeof o.token === 'string' && o.token) return o.token; } } catch (_) {}
    try { return root.__kynToken || root.__accessToken || root.localStorage.getItem('authToken') || root.localStorage.getItem('token') || root.localStorage.getItem('necpa_token') || root.localStorage.getItem('accessToken') || ''; } catch (_) { return ''; }
  }
  function apiBase() {
    var p = null; try { p = root.parent !== root ? root.parent : null; } catch (_) {}
    var b = (root.__getApiBase && root.__getApiBase()) || (root.__kynAPI && root.__kynAPI.baseUrl) || root.API_BASE_URL || (p && p.__getApiBase && p.__getApiBase()) || '';
    return String(b || '').replace(/\/+$/, '').replace(/\/api$/, '');
  }
  V.configure({ getToken: token, apiBase: apiBase });
  root.NecpraVoiceInit = {
    host: null,
    start: function (o) {
      o = o || {};
      if (root.NecpraVoiceBridge && o.host !== false && root.parent === root) root.NecpraVoiceInit.host = root.NecpraVoiceBridge.host({ allowedOrigins: o.allowedOrigins || [] });
      if (o.fab && root.NecpraVoiceUI) root.NecpraVoiceUI.mountFab(typeof o.fab === 'object' ? o.fab : {});
      if (root.NecpraHandsFree) root.NecpraHandsFree.autoResume();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
