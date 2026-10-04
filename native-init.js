(function () {
  'use strict';
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var Plugins = window.Capacitor.Plugins || {};

  function nativeApiOrigin() {
    var o = '';
    try { o = window.__getApiOrigin ? window.__getApiOrigin() : (window.BACKEND_URL || ''); } catch (_) {}
    o = String(o || '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
    return /^https:\/\//i.test(o) ? o : '';
  }

  // One stable JS boundary for Android-only capabilities.
  var native = Plugins.NecpraNative;
  if (native) {
    window.NecpraNative = {
      isNative: function () { return true; },
      secureSet: function (key, value) { return native.secureSet({key:key, value:String(value)}); },
      secureGet: async function (key) {
        var result = await native.secureGet({key:key});
        return result && result.value !== null && result.value !== undefined ? result.value : null;
      },
      secureRemove: function (key) { return native.secureRemove({key:key}); },
      secureStatus: function () { return native.secureStatus(); },
      openFilePicker: function (mimeType, multiple) {
        return native.openFilePicker({mimeType:mimeType || '*/*', multiple:!!multiple});
      },
      takePhoto: function () { return native.takePhoto(); },
      shareFile: function (uri, mimeType, title) {
        return native.shareFile({uri:uri, mimeType:mimeType || '*/*', title:title || 'Share with'});
      },
      biometricAuthenticate: function (title, subtitle) {
        return native.biometricAuthenticate({
          title:title || 'Unlock Necpra',
          subtitle:subtitle || 'Verify your identity'
        });
      },
      deviceInfo: function () { return native.deviceInfo(); },
      biometricStatus: function () { return native.biometricStatus(); },
      backgroundStatus: function () { return native.backgroundStatus(); },
      clearBackgroundSyncRequest: function () { return native.clearBackgroundSyncRequest(); },
      authSetSession: function (accessToken, refreshToken, user, expiresAt) {
        return native.authSetSession({
          accessToken: accessToken,
          refreshToken: refreshToken || '',
          userJson: user ? JSON.stringify(user) : '',
          expiresAt: Number(expiresAt || 0),
          // Tell the native layer which backend the web layer really uses, so
          // background sync can't drift to a hard-coded, different host.
          apiOrigin: nativeApiOrigin()
        });
      },
      authGetSession: function () { return native.authGetSession(); },
      authUnlock: function (title, subtitle) {
        return native.authUnlock({title:title || 'Unlock Necpra', subtitle:subtitle || 'Verify your identity'});
      },
      authRefresh: function () { return native.authRefresh(); },
      authClearSession: function () { return native.authClearSession(); },
      backgroundSyncNow: function () { return native.backgroundSyncNow(); },
      getBackgroundSnapshot: function () { return native.getBackgroundSnapshot(); },
      downloadFile: function (url, fileName) { return native.downloadFile({url:url, fileName:fileName || 'download'}); },
      uploadFile: function (endpoint, uri, fieldName, mimeType, fileName) {
        return native.uploadFile({endpoint:endpoint, uri:uri, fieldName:fieldName || 'file', mimeType:mimeType || '*/*', fileName:fileName || 'upload'});
      }
    };
  }

  async function publishNativeAuthSession() {
    if (!window.NecpraNative?.authGetSession) return null;
    try {
      var session = await window.NecpraNative.authGetSession();
      if (!session?.hasSession) return null;

      if (session.locked) {
        try {
          await window.NecpraNative.authUnlock('Unlock Necpra', 'Unlock your secure session');
          session = await window.NecpraNative.authGetSession();
        } catch (_) {
          window.dispatchEvent(new CustomEvent('necpra:native-auth-locked', {detail:{reason:'biometric-required'}}));
          return null;
        }
      }

      var accessToken = session?.accessToken;
      if (!accessToken) {
        try {
          var refreshed = await window.NecpraNative.authRefresh();
          accessToken = refreshed?.accessToken || null;
          session = await window.NecpraNative.authGetSession();
        } catch (_) {}
      }

      if (!accessToken) return null;

      var user = null;
      try { user = session.userJson ? JSON.parse(session.userJson) : null; } catch (_) {}
      window.__NECPRA_NATIVE_AUTH_SNAPSHOT__ = {
        accessToken: accessToken,
        refreshToken: session?.refreshToken || null,
        user: user,
        expiresAt: Number(session?.expiresAt || 0),
        native: true
      };
      window.dispatchEvent(new CustomEvent('necpra:native-auth-ready', {
        detail: window.__NECPRA_NATIVE_AUTH_SNAPSHOT__
      }));
      return window.__NECPRA_NATIVE_AUTH_SNAPSHOT__;
    } catch (_) {
      return null;
    }
  }

  async function consumeNativeSnapshot() {
    if (!window.NecpraNative?.getBackgroundSnapshot) return;
    try {
      var result = await window.NecpraNative.getBackgroundSnapshot();
      var raw = result?.snapshot;
      if (!raw || !window.NecpraSocialOfflineCache?.put) return;
      var snapshot = JSON.parse(raw);
      var origin = window.__getApiOrigin ? window.__getApiOrigin() : (window.BACKEND_URL || 'https://nexorah-xnv6.onrender.com');
      origin = String(origin).replace(/\/api\/?$/, '').replace(/\/$/, '');
      var mapping = {
        chats: '/api/chats?limit=100',
        friends: '/api/friends?limit=100',
        groups: '/api/groups?limit=100',
        status: '/api/status?limit=100',
        settings: '/api/settings'
      };
      for (var key in mapping) {
        if (snapshot[key] !== undefined) {
          await window.NecpraSocialOfflineCache.put(origin + mapping[key], snapshot[key]);
        }
      }
      Object.keys(snapshot).forEach(function (key) {
        var match = key.match(/^messages_([A-Za-z0-9_-]+)$/);
        if (match) {
          window.NecpraSocialOfflineCache.put(origin + '/api/messages/' + match[1] + '?limit=100', snapshot[key]).catch(function(){});
        }
        var groupMatch = key.match(/^groupMessages_([A-Za-z0-9_-]+)$/);
        if (groupMatch) {
          window.NecpraSocialOfflineCache.put(origin + '/api/group-messages/' + groupMatch[1] + '/messages?limit=100', snapshot[key]).catch(function(){});
        }
      });
      window.dispatchEvent(new CustomEvent('necpra:native-snapshot-imported', {detail:{syncedAt:result?.syncedAt || 0}}));
    } catch (_) {}
  }

  // The snapshot is only readable once the native session is unlocked, and
  // unlocking may show a biometric prompt, so consume AFTER publish settles
  // (the old code raced the prompt and was rejected as "locked").
  publishNativeAuthSession().then(consumeNativeSnapshot, consumeNativeSnapshot);
  setTimeout(consumeNativeSnapshot, 3000);
  window.addEventListener('load', function () { setTimeout(consumeNativeSnapshot, 500); }, { once: true });

  var lastNativeSyncSignal=0;
  async function consumeNativeBackgroundSync(){
    if(!window.NecpraNative?.backgroundStatus)return;
    try{var s=await window.NecpraNative.backgroundStatus();var at=Number(s?.syncRequestedAt||0);if(!s?.syncRequested||at<=lastNativeSyncSignal)return;lastNativeSyncSignal=at;
      if(window.KynectaSync?.syncAll){await window.KynectaSync.syncAll();await window.NecpraNative.clearBackgroundSyncRequest?.();window.dispatchEvent(new CustomEvent('necpra:native-background-sync-complete',{detail:{requestedAt:at}}));}}
    catch(_){}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(consumeNativeBackgroundSync,500);});
  window.addEventListener('focus',()=>setTimeout(consumeNativeBackgroundSync,500));
  setTimeout(consumeNativeBackgroundSync,1500);

  // Android forwards verified Necpra links here. Web navigation remains the
  // single owner of the actual screen/UI, so browser and APK stay aligned.
  window.addEventListener('necpra:native-deeplink', function (event) {
    var url = event && event.detail && event.detail.url;
    if (!url) return;

    try {
      var u = new URL(url, window.location.origin);
      var path = u.protocol === 'necpra:' ? '/' + u.host + u.pathname : u.pathname;
      var parts = path.split('/').filter(Boolean);

      if (parts[0] === 'chat' && parts[1]) {
        window.dispatchEvent(new CustomEvent('kyn:openChat', {
          detail:{chatId:parts[1], scrollToMessageId:u.searchParams.get('messageId')}
        }));
      } else if (parts[0] === 'group' && parts[1]) {
        window.dispatchEvent(new CustomEvent('kyn:openGroup', {
          detail:{groupId:parts[1], scrollToMessageId:u.searchParams.get('messageId')}
        }));
      } else if (parts[0] === 'status' && parts[1]) {
        window.dispatchEvent(new CustomEvent('kyn:openStatus', {
          detail:{statusId:parts[1]}
        }));
      } else if (parts[0] === 'marketplace' && parts[1]) {
        window.dispatchEvent(new CustomEvent('kyn:openMarketplace', {
          detail:{itemId:parts[1]}
        }));
      }
    } catch (_) {}
  });

  // Cold-start links are parked natively (the WebView isn't loaded yet when the
  // intent arrives). Pull once our listener above is registered.
  (async function pullPendingDeepLink() {
    try {
      if (!window.NecpraNative || !Plugins.NecpraNative || !Plugins.NecpraNative.getPendingDeepLink) return;
      var r = await Plugins.NecpraNative.getPendingDeepLink();
      if (r && r.url) {
        setTimeout(function () {
          window.dispatchEvent(new CustomEvent('necpra:native-deeplink', { detail: { url: r.url } }));
        }, 600);
      }
    } catch (_) {}
  })();

  // ---------------------------------------------------------------------
  // Single refresher. The backend ROTATES refresh tokens and revokes every
  // session when an old one is replayed (outside a 60 s grace). Native
  // background sync rotates the token behind the WebView's back, and several
  // web modules still call /api/auth/refresh themselves with a copy that is now
  // stale. On Android, route every such call through the one native refresher.
  // Callers keep working: they get a normal refresh-shaped JSON response.
  // NOTE: only affects code that looks up window.fetch at call time.
  // ---------------------------------------------------------------------
  if (window.NecpraNative && window.NecpraNative.authRefresh && !window.__NECPRA_REFRESH_SHIM__) {
    window.__NECPRA_REFRESH_SHIM__ = true;
    var realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        var path = new URL(url, window.location.href).pathname;
        if (method === 'POST' && /\/api\/auth\/refresh\/?$/.test(path)) {
          return window.NecpraNative.authRefresh().then(function (r) {
            // refreshToken is deliberately NOT echoed: the real one lives only in
            // the native store, and the web copy must never be used to refresh.
            return new Response(JSON.stringify({
              success: true,
              token: r.accessToken,
              accessToken: r.accessToken,
              expiresIn: r.expiresIn
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }, function (err) {
            var expired = err && (err.code === 'SESSION_EXPIRED');
            return new Response(JSON.stringify({
              success: false,
              message: expired ? 'Refresh token not found or expired' : 'Native session unavailable, retry',
              errorCode: expired ? 'NATIVE_SESSION_EXPIRED' : 'NATIVE_SESSION_UNAVAILABLE'
            }), { status: expired ? 401 : 503, headers: { 'Content-Type': 'application/json' } });
          });
        }
      } catch (_) {}
      return realFetch(input, init);
    };
  }

  var SplashScreen = Plugins.SplashScreen;
  var StatusBar = Plugins.StatusBar;

  if (StatusBar) {
    try {
      StatusBar.setBackgroundColor({ color: '#2563eb' }).catch(function () {});
      StatusBar.setStyle({ style: 'DARK' }).catch(function () {});
      StatusBar.setOverlaysWebView({ overlay: false }).catch(function () {});
    } catch (_) {}
  }

  function hideSplash() {
    if (!SplashScreen) return;
    try { SplashScreen.hide({ fadeOutDuration: 200 }).catch(function () {}); } catch (_) {}
  }

  if (document.readyState === 'complete') {
    requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
  } else {
    window.addEventListener('load', function () {
      requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
    }, { once: true });
  }

  setTimeout(hideSplash, 4000);
})();
