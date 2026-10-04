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
      },
      nativeProfileAvailable: function () { return native.nativeProfileAvailable(); },
      openNativeProfile: function (section) { return native.openNativeProfile({section: section || 'home'}); },
      nativeFriendsAvailable: function () { return native.nativeFriendsAvailable(); },
      openNativeFriends: function (section) { return native.openNativeFriends({section: section || 'friends'}); }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Native Profile / Settings routing (Android APK only - this file's body never runs in a browser
  // or the PWA, so those keep using the existing web Profile/Settings untouched).
  //
  //   Step 4 (testing):   leave NATIVE_PROFILE_DEFAULT = false and opt in on a test device with
  //                       localStorage.setItem('necpra_native_profile', '1')   (DevTools console)
  //   Step 5 (switch):    set NATIVE_PROFILE_DEFAULT = true. The APK now opens the native screen;
  //                       localStorage 'necpra_native_profile' = '0' stays available as a kill switch.
  //
  // An older APK that does not contain the native screen rejects nativeProfileAvailable(), and the
  // web Profile/Settings is used instead, so deploying this file before the new APK is safe.
  // ---------------------------------------------------------------------------------------------
  var NATIVE_PROFILE_DEFAULT = false;
  var nativeProfileReady = null; // null = unknown, true/false after the first probe

  function nativeProfileFlag() {
    try {
      var v = localStorage.getItem('necpra_native_profile');
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (_) {}
    return NATIVE_PROFILE_DEFAULT;
  }

  async function probeNativeProfile() {
    if (nativeProfileReady !== null) return nativeProfileReady;
    try {
      var r = await window.NecpraNative.nativeProfileAvailable();
      nativeProfileReady = !!(r && r.available);
    } catch (_) {
      nativeProfileReady = false; // older APK without the screen
    }
    return nativeProfileReady;
  }

  var nativeProfileOpen = false;

  async function openNativeProfileScreen(section) {
    if (nativeProfileOpen) return true;
    nativeProfileOpen = true;
    try {
      var result = await window.NecpraNative.openNativeProfile(section);
      handleNativeProfileResult(result);
      return true;
    } catch (err) {
      console.warn('[native-profile] could not open native screen:', err && err.message ? err.message : err);
      return false;
    } finally {
      nativeProfileOpen = false;
    }
  }

  function handleNativeProfileResult(r) {
    if (!r) return;

    // Signed out (or the backend rejected the refresh token) inside the native screen. The native
    // side has already wiped the Keystore session; finish the web side with the app's own logout path.
    if (r.loggedOut || r.sessionExpired) {
      try {
        if (typeof _performFullLogoutRedirect === 'function') { _performFullLogoutRedirect('native_logout'); return; }
      } catch (_) {}
      try {
        if (window.AppRuntimeAuthority && typeof window.AppRuntimeAuthority.clearSession === 'function') {
          window.AppRuntimeAuthority.clearSession({ emit: false, reason: 'native_logout' });
        } else if (window.AuthStorage && typeof window.AuthStorage.clearAuth === 'function') {
          window.AuthStorage.clearAuth();
        }
      } catch (_) {}
      window.location.replace('index.html');
      return;
    }

    // "Lock now": the session is withheld from the WebView until the user passes the native unlock.
    if (r.locked && window.NecpraNative && window.NecpraNative.authUnlock) {
      window.NecpraNative.authUnlock('Unlock Necpra', 'Unlock your secure session').catch(function () {});
    }

    // Profile edited natively: refresh the shell header/modal without a reload. Display values only,
    // no credentials.
    if (r.profileChanged) {
      try {
        if (r.avatar) localStorage.setItem('user_avatar', r.avatar);
        if (r.bio != null) localStorage.setItem('user_bio', r.bio);
        if (r.displayName) localStorage.setItem('user_displayName', r.displayName);
      } catch (_) {}
      try {
        if (typeof currentUserProfile !== 'undefined' && currentUserProfile) {
          if (r.avatar) currentUserProfile.avatar = r.avatar;
          if (r.username) currentUserProfile.username = r.username;
          if (r.bio != null) currentUserProfile.bio = r.bio;
          if (typeof updateProfileUI === 'function') updateProfileUI();
        }
      } catch (_) {}
      try { window.dispatchEvent(new CustomEvent('necpra:native-profile-updated', { detail: r })); } catch (_) {}
    }
  }

  // chat.html's profile entry points are plain global functions: the Settings button/tab goes through
  // navigateToPage('settings') and "Edit Profile" calls openProfileEditPanel(). Wrap both so that, when
  // the native screen is enabled and present, they open it; otherwise the original web code runs.
  function installNativeProfileRouting() {
    if (!window.NecpraNative || !window.NecpraNative.openNativeProfile) return;
    if (window.__necpraProfileRoutingInstalled) return;
    if (typeof window.navigateToPage !== 'function' && typeof window.openProfileEditPanel !== 'function') return;
    window.__necpraProfileRoutingInstalled = true;

    var origNavigate = window.navigateToPage;
    if (typeof origNavigate === 'function') {
      window.navigateToPage = function (page) {
        var self = this, args = arguments;
        if (nativeProfileFlag() && /^settings?$/.test(String(page || ''))) {
          probeNativeProfile().then(function (ok) {
            if (!ok) return origNavigate.apply(self, args);
            return openNativeProfileScreen('home').then(function (opened) {
              if (!opened) return origNavigate.apply(self, args);
            });
          });
          return;
        }
        return origNavigate.apply(this, args);
      };
    }

    var origEdit = window.openProfileEditPanel;
    if (typeof origEdit === 'function') {
      window.openProfileEditPanel = function () {
        var self = this, args = arguments;
        if (nativeProfileFlag()) {
          probeNativeProfile().then(function (ok) {
            if (!ok) return origEdit.apply(self, args);
            return openNativeProfileScreen('edit').then(function (opened) {
              if (!opened) return origEdit.apply(self, args);
            });
          });
          return;
        }
        return origEdit.apply(this, args);
      };
    }
  }

  installNativeProfileRouting();
  if (document.readyState !== 'complete') window.addEventListener('load', installNativeProfileRouting, { once: true });

  // ---------------------------------------------------------------------------------------------
  // Native Friends routing (Android APK only - this file's body never runs in a browser or the PWA,
  // so those keep using the existing web Friends module untouched).
  //
  //   Step 4 (testing):   leave NATIVE_FRIENDS_DEFAULT = false and opt in on a test device with
  //                       localStorage.setItem('necpra_native_friends', '1')   (DevTools console)
  //   Step 6 (switch):    set NATIVE_FRIENDS_DEFAULT = true. The APK now opens the native screen;
  //                       localStorage 'necpra_native_friends' = '0' stays available as a kill switch.
  //
  // An older APK without the native screen rejects nativeFriendsAvailable() and the web Friends
  // module is used instead, so deploying this file before the new APK is safe.
  // ---------------------------------------------------------------------------------------------
  var NATIVE_FRIENDS_DEFAULT = false;
  var nativeFriendsReady = null;
  var nativeFriendsOpen = false;

  function nativeFriendsFlag() {
    try {
      var v = localStorage.getItem('necpra_native_friends');
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (_) {}
    return NATIVE_FRIENDS_DEFAULT;
  }

  async function probeNativeFriends() {
    if (nativeFriendsReady !== null) return nativeFriendsReady;
    try {
      var r = await window.NecpraNative.nativeFriendsAvailable();
      nativeFriendsReady = !!(r && r.available);
    } catch (_) {
      nativeFriendsReady = false; // older APK without the screen
    }
    return nativeFriendsReady;
  }

  function handleNativeFriendsResult(r) {
    if (!r) return;
    if (r.sessionExpired) { handleNativeProfileResult({ sessionExpired: true }); return; }

    // Pending-requests badge in the shell header.
    try {
      var badge = document.getElementById('friendsRequestsBadge');
      if (badge && r.requestCount != null) {
        var n = Number(r.requestCount) || 0;
        badge.textContent = String(n);
        badge.style.display = n > 0 ? '' : 'none';
      }
    } catch (_) {}

    // Keep the web shell's copy of the friends list (used by messages/status/groups) in step with
    // what was changed natively. Display fields only, no credentials.
    if (r.friendsChanged && r.friendsJson) {
      try {
        var list = JSON.parse(r.friendsJson);
        if (Array.isArray(list)) {
          try { localStorage.setItem('knecta_friends_cache', JSON.stringify(list)); } catch (_) {}
          try { if (window.KynectaStore && window.KynectaStore.set) window.KynectaStore.set('friends.list', list); } catch (_) {}
          ['sendFriendsToMessagesIframe', 'sendFriendsToStatusIframe', 'sendFriendsToGroupIframe', 'sendFriendsToToolsIframe']
            .forEach(function (fn) { try { if (typeof window[fn] === 'function') window[fn](list); } catch (_) {} });
        }
      } catch (_) {}
    }

    // "Message" tapped on a friend: hand over to the shell's existing open-chat path.
    if (r.chatUserId) {
      try {
        window.postMessage({
          type: 'SWITCH_MODULE',
          module: 'messages',
          payload: {
            userId: Number(r.chatUserId),
            userName: r.chatUserName || 'User',
            avatar: r.chatAvatar || null,
            findExisting: true,
            timestamp: Date.now(),
            source: 'native-friends'
          },
          source: 'native-friends'
        }, window.location.origin);
      } catch (_) {}
    }
  }

  async function openNativeFriendsScreen(section) {
    if (nativeFriendsOpen) return true;
    nativeFriendsOpen = true;
    try {
      var result = await window.NecpraNative.openNativeFriends(section);
      handleNativeFriendsResult(result);
      return true;
    } catch (err) {
      console.warn('[native-friends] could not open native screen:', err && err.message ? err.message : err);
      return false;
    } finally {
      nativeFriendsOpen = false;
    }
  }

  // The bottom-nav Friends button, the "+" menu entry and the Add-Friend button all go through the
  // global navigateToPage('friends'). When the native screen is enabled and present it opens instead;
  // otherwise (older APK, flag off, native failure) the original web Friends runs.
  function installNativeFriendsRouting() {
    if (!window.NecpraNative || !window.NecpraNative.openNativeFriends) return;
    if (window.__necpraFriendsRoutingInstalled) return;
    if (typeof window.navigateToPage !== 'function') return;
    window.__necpraFriendsRoutingInstalled = true;

    var origNavigate = window.navigateToPage;
    window.navigateToPage = function (page) {
      var self = this, args = arguments;
      if (nativeFriendsFlag() && /^friends?$/.test(String(page || ''))) {
        probeNativeFriends().then(function (ok) {
          if (!ok) return origNavigate.apply(self, args);
          return openNativeFriendsScreen('friends').then(function (opened) {
            if (!opened) return origNavigate.apply(self, args);
          });
        });
        return;
      }
      return origNavigate.apply(this, args);
    };
  }

  installNativeFriendsRouting();
  if (document.readyState !== 'complete') window.addEventListener('load', installNativeFriendsRouting, { once: true });

  // Android deliberately never writes kynecta_auth to WebView storage (tokens live in the native
  // store), so the offline caches / local message DBs could not tell whose data they hold and cached
  // nothing. Publish a NON-SECRET account-id hint (no tokens) that they all read.
  function writeAccountHint(user) {
    try {
      var id = user && (user.id != null ? user.id : (user.userId != null ? user.userId : (user.uid != null ? user.uid : user._id)));
      if (id == null || id === '') return;
      id = String(id);
      var slim = { id: id };
      ['username', 'displayName', 'name', 'avatar'].forEach(function (k) { if (user[k] != null) slim[k] = user[k]; });
      localStorage.setItem('necpa_user', JSON.stringify(slim));
      localStorage.setItem('userId', id);
      localStorage.setItem('currentUserId', id);
    } catch (_) {}
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
      writeAccountHint(user);
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
          // After 15 min the native session locks and authRefresh rejects with "locked".
          // Unlock (biometric prompt) and retry once instead of failing with 503.
          var refreshOnce = function () {
            return window.NecpraNative.authRefresh().catch(function (err) {
              var msg = String((err && (err.message || err.errorMessage)) || err || '');
              if (!/locked/i.test(msg)) throw err;
              return window.NecpraNative.authUnlock('Unlock Necpra', 'Unlock your secure session').then(function () {
                return window.NecpraNative.authRefresh();
              });
            });
          };
          return refreshOnce().then(function (r) {
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
