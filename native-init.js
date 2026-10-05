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
      e2eStatus: function () { return native.e2eStatus(); },
      setDmOwner: function (enabled) { return native.setDmOwner({enabled: !!enabled}); },
      dmOwner: function () { return native.dmOwner(); },
      sendStatusInteraction: function (ownerId, interactionJson) {
        return native.sendStatusInteraction({ownerId: Number(ownerId), interaction: String(interactionJson)});
      },
      e2eProvision: function (userId, secret, legacyPassword) {
        return native.e2eProvision({userId:String(userId), secret:String(secret || ''), legacyPassword:String(legacyPassword || '')});
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
      nativeMessagesAvailable: function () { return native.nativeMessagesAvailable(); },
      openNativeMessages: function (opts) {
        opts = opts || {};
        var args = {};
        if (opts.chatId) args.chatId = Number(opts.chatId);
        if (opts.peerId) args.peerId = Number(opts.peerId);
        if (opts.title) args.title = String(opts.title);
        if (opts.avatar) args.avatar = String(opts.avatar);
        return native.openNativeMessages(args);
      },
      nativeFriendsAvailable: function () { return native.nativeFriendsAvailable(); },
      openNativeFriends: function (section) { return native.openNativeFriends({section: section || 'friends'}); },
      nativeAuthAvailable: function () { return native.nativeAuthAvailable(); },
      openNativeAuth: function (opts) {
        opts = opts || {};
        var args = {};
        if (opts.start) args.start = String(opts.start);
        if (opts.reason) args.reason = String(opts.reason);
        return native.openNativeAuth(args);
      }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Native Profile / Settings routing (Android APK only - this file's body never runs in a browser
  // or the PWA, so those keep using the existing web Profile/Settings untouched).
  //
  //   Step 4 (testing):   use the native screen by default; set localStorage to 0 on a test device to roll back with
  //                       localStorage.setItem('necpra_native_profile', '1')   (DevTools console)
  //   Step 5 (switch):    default is now native; the APK opens the native screen;
  //                       localStorage 'necpra_native_profile' = '0' stays available as a kill switch.
  //
  // An older APK that does not contain the native screen rejects nativeProfileAvailable(), and the
  // web Profile/Settings is used instead, so deploying this file before the new APK is safe.
  // ---------------------------------------------------------------------------------------------
  var NATIVE_PROFILE_DEFAULT = true;
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
  //   Step 4 (testing):   use the native screen by default; set localStorage to 0 on a test device to roll back with
  //                       localStorage.setItem('necpra_native_friends', '1')   (DevTools console)
  //   Step 6 (switch):    set NATIVE_FRIENDS_DEFAULT = true. The APK now opens the native screen;
  //                       localStorage 'necpra_native_friends' = '0' stays available as a kill switch.
  //
  // An older APK without the native screen rejects nativeFriendsAvailable() and the web Friends
  // module is used instead, so deploying this file before the new APK is safe.
  // ---------------------------------------------------------------------------------------------
  var NATIVE_FRIENDS_DEFAULT = true;
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

    // "Message" tapped on a friend: open the native chat when it is enabled and ready, otherwise hand over
    // to the shell's existing open-chat path (unchanged web behaviour).
    if (r.chatUserId) {
      var openWebChat = function () {
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
      };
      if (typeof openNativeMessagesScreen === 'function') {
        openNativeMessagesScreen({ peerId: r.chatUserId, title: r.chatUserName, avatar: r.chatAvatar }).then(function (opened) {
          if (!opened) openWebChat();
        }, openWebChat);
      } else openWebChat();
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

  // ---------------------------------------------------------------------------------------------
  // Native Messages routing (Android APK only). ON by default now that native owns direct messages;
  // kill switch for a test device:  localStorage.setItem('necpra_native_messages', '0')   (back on: '1').
  // NOTE: turning it off hands DMs back to the WebView, whose ratchet state is NOT the native one, so do it
  // only on a device you are willing to re-sync (sign out / in). The native screens are only used when the
  // native E2E identity is provisioned for the signed-in account; in every other case (older APK, flag off,
  // no identity backup, native failure) the existing web Messages module runs exactly as before.
  // ---------------------------------------------------------------------------------------------
  var NATIVE_MESSAGES_DEFAULT = true;
  var nativeMessagesOpen = false;

  function nativeMessagesFlag() {
    try {
      var v = localStorage.getItem('necpra_native_messages');
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (_) {}
    return NATIVE_MESSAGES_DEFAULT;
  }

  function nativeUserIdHint() {
    try { var a = JSON.parse(localStorage.getItem('kynecta_auth') || 'null'); var id = a && ((a.user && a.user.id) || a.userId); if (id != null) return String(id); } catch (_) {}
    try { var n = JSON.parse(localStorage.getItem('necpa_user') || 'null'); if (n && n.id != null) return String(n.id); } catch (_) {}
    try { var id2 = localStorage.getItem('currentUserId') || localStorage.getItem('userId'); if (id2) return String(id2); } catch (_) {}
    return null;
  }

  // True only when the native screens exist AND hold this account's identity key.
  async function nativeMessagesUsable() {
    if (!window.NecpraNative || !window.NecpraNative.nativeMessagesAvailable || !window.NecpraNative.e2eStatus) return false;
    try {
      var a = await window.NecpraNative.nativeMessagesAvailable();
      if (!a || !a.available) return false;
      var st = await window.NecpraNative.e2eStatus();
      if (!st || !st.provisioned) return false;
      var uid = nativeUserIdHint();
      return !uid || String(st.userId) === uid;
    } catch (_) { return false; } // older APK without the screens
  }

  // Resolves true when a native screen was shown (and has been closed again), false when the caller should fall back to web.
  async function openNativeMessagesScreen(opts) {
    if (!nativeMessagesFlag() || nativeMessagesOpen) return false;
    if (!(await nativeMessagesUsable())) return false;
    nativeMessagesOpen = true;
    try {
      var result = await window.NecpraNative.openNativeMessages(opts || {});
      if (result && (result.sessionExpired)) handleNativeProfileResult({ sessionExpired: true });
      if (result && result.groupId) {
        try { window.dispatchEvent(new CustomEvent('kyn:openGroup', { detail: { groupId: String(result.groupId) } })); } catch (_) {}
      }
      return true;
    } catch (err) {
      console.warn('[native-messages] could not open native screen:', err && err.message ? err.message : err);
      return false;
    } finally {
      nativeMessagesOpen = false;
    }
  }

  // The bottom-nav "Messages" button goes through navigateToPage('messages'). Only a deliberate switch FROM another
  // page opens the native list (the app's own start-up navigation, history-back and the web home stay untouched).
  function installNativeMessagesRouting() {
    if (!window.NecpraNative || !window.NecpraNative.openNativeMessages) return;
    if (window.__necpraMessagesRoutingInstalled) return;
    if (typeof window.navigateToPage !== 'function') return;
    window.__necpraMessagesRoutingInstalled = true;

    var origNavigate = window.navigateToPage;
    window.navigateToPage = function (page, options) {
      var self = this, args = arguments;
      var deliberate = /^messages?$/.test(String(page || '')) && window.__currentPage && !/^messages?$/.test(String(window.__currentPage))
        && !(options && options.fromHistory) && nativeMessagesFlag();
      if (deliberate) {
        openNativeMessagesScreen({}).then(function (opened) {
          if (!opened) return origNavigate.apply(self, args);
        });
        return;
      }
      return origNavigate.apply(this, args);
    };
  }

  installNativeMessagesRouting();
  if (document.readyState !== 'complete') window.addEventListener('load', installNativeMessagesRouting, { once: true });

  // ---------------------------------------------------------------------------------------------
  // Who owns direct-message crypto: the SAME decision is mirrored natively (NecpraDmOwner) and in
  // localStorage['necpra_native_dm_owner'], which js/message-e2e-core.js reads synchronously to refuse to
  // encrypt/decrypt a DM in the WebView. The WebView and native keep separate ratchet states, and a
  // ratchet key is single-use, so exactly one side may ever advance a chat.
  // ---------------------------------------------------------------------------------------------
  window.__necpraNativeOwnsDMs = function () {
    try { return localStorage.getItem('necpra_native_dm_owner') === '1'; } catch (_) { return false; }
  };

  async function syncDmOwner() {
    if (!window.NecpraNative || !window.NecpraNative.setDmOwner) return false;
    var on = false;
    try { on = nativeMessagesFlag() && (await nativeMessagesUsable()); } catch (_) { on = false; }
    try { localStorage.setItem('necpra_native_dm_owner', on ? '1' : '0'); } catch (_) {}
    try { await window.NecpraNative.setDmOwner(on); } catch (_) {}
    return on;
  }
  window.__necpraSyncDmOwner = syncDmOwner;

  // Opens the native chat for a chat id (notification tap, deep link, push relay). Resolves true when shown.
  window.__necpraOpenNativeChat = function (chatId) {
    var id = Number(chatId);
    if (!id || !isFinite(id)) return Promise.resolve(false);
    return openNativeMessagesScreen({ chatId: id });
  };

  (function dmOwnerLoop() {
    var tries = 0;
    function tick() { syncDmOwner(); }
    setTimeout(tick, 1500);
    var timer = setInterval(function () { if (++tries > 60) return clearInterval(timer); tick(); }, 5000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  })();

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

  // One-time hand-over of the E2E identity to the native layer (needed by the native Messages screen).
  // Native restores the SAME identity from the server backup using the session wrap secret the web layer already
  // holds; the secret is not stored natively. Retries quietly until the web layer has the secret + user id.
  (function e2eHandover() {
    var tries = 0, busy = false;
    function currentUserId() {
      try { var a = JSON.parse(localStorage.getItem('kynecta_auth') || 'null'); var id = a && ((a.user && a.user.id) || a.userId); if (id != null) return String(id); } catch (_) {}
      try { var u = JSON.parse(localStorage.getItem('user') || localStorage.getItem('currentUser') || 'null'); var id2 = u && (u.id || u.userId); if (id2 != null) return String(id2); } catch (_) {}
      return null;
    }
    async function attempt() {
      if (busy || !window.NecpraNative || !window.NecpraNative.e2eStatus) return;
      var uid = currentUserId(), secret = null, legacy = null;
      try { secret = sessionStorage.getItem('kyn_e2e_pw_session'); legacy = sessionStorage.getItem('kyn_e2e_pw_legacy_session'); } catch (_) {}
      if (!uid || !secret) return;
      busy = true;
      try {
        var st = await window.NecpraNative.e2eStatus();
        if (st && st.provisioned && String(st.userId) === uid) { tries = 99; return; }
        await window.NecpraNative.e2eProvision(uid, secret, legacy);
        tries = 99;
        if (window.__necpraSyncDmOwner) window.__necpraSyncDmOwner();
      } catch (e) {
        try { console.warn('[NativeE2E] hand-over not completed:', (e && e.message) || e); } catch (_) {}
      } finally { busy = false; }
    }
    var timer = setInterval(function () { if (++tries > 40) return clearInterval(timer); attempt(); }, 4000);
    setTimeout(attempt, 2500);
    // Event-driven triggers so a brand-new or slow-starting account does not depend on the 4s polling window:
    // the web layer announces when it has the identity ready (it creates + backs it up on first load), a login
    // just completed, or the app came back to the foreground. attempt() is a no-op once provisioned.
    function kick() { if (tries >= 99) return; setTimeout(attempt, 300); }
    try { document.addEventListener('kyn:e2eUnlocked', kick); } catch (_) {}
    try { window.addEventListener('auth-login-success', kick); } catch (_) {}
    try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') kick(); }); } catch (_) {}
  })();

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

  // ---------------------------------------------------------------------------------------------
  // Native Landing / Login / Sign up (Android APK only). The native screen only collects credentials and talks to
  // the same /api/auth endpoints; it never saves a session. On success the page finishes the login through the one
  // existing path, finalizeLoginSuccess() (web storage, E2E wrap secret, two-accounts-per-device cap, and
  // AppRuntimeAuthority -> authSetSession for the native store). If the APK has no native login, the flag is off or
  // anything fails, the original web landing/login stays exactly as it was.
  // ---------------------------------------------------------------------------------------------
  var NATIVE_AUTH_DEFAULT = true;
  var nativeAuthOpen = false, nativeAuthReady = null;

  function nativeAuthFlag() {
    try {
      var v = localStorage.getItem('necpra_native_auth');
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (_) {}
    return NATIVE_AUTH_DEFAULT;
  }

  async function probeNativeAuth() {
    if (nativeAuthReady !== null) return nativeAuthReady;
    try {
      var r = await window.NecpraNative.nativeAuthAvailable();
      nativeAuthReady = !!(r && r.available);
    } catch (_) {
      nativeAuthReady = false; // older APK without the screen
    }
    return nativeAuthReady;
  }

  function showWebLandingAgain() {
    try { document.documentElement.classList.remove('necpra-native-auth-pending'); } catch (_) {}
  }

  function waitFor(test, ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        var ok = false;
        try { ok = !!test(); } catch (_) {}
        if (ok) return resolve(true);
        if (Date.now() - t0 > ms) return resolve(false);
        setTimeout(tick, 100);
      })();
    });
  }

  async function finishNativeLogin(r) {
    var ready = await waitFor(function () { return typeof window.finalizeLoginSuccess === 'function' && window.CoreUtils; }, 5000);
    if (!ready) { showWebLandingAgain(); return; }
    var user = null;
    try { if (r.userJson) user = JSON.parse(r.userJson); } catch (_) {}
    var response = {
      token: r.token,
      refreshToken: r.refreshToken || null,
      user: user,
      expiresAt: r.expiresAt || null
    };
    try {
      window.finalizeLoginSuccess(response, r.password || '');
    } catch (err) {
      console.warn('[native-auth] could not finish login:', err && err.message ? err.message : err);
      showWebLandingAgain();
    }
  }

  function startWebGoogle() {
    showWebLandingAgain();
    try { var b = document.getElementById('landingLoginBtn'); if (b) b.click(); } catch (_) {}   // opens the login form
    var tries = 0;
    (function tick() {
      var g = document.querySelector('#googleSignInLoginContainer button');
      if (g) { g.click(); return; }                 // the existing native Google sign-in (js/google-auth.js)
      if (++tries < 40) setTimeout(tick, 150);
    })();
  }

  async function openNativeAuthScreen(opts) {
    if (!nativeAuthFlag() || nativeAuthOpen) return false;
    if (!(await probeNativeAuth())) return false;
    nativeAuthOpen = true;
    try {
      var r = await window.NecpraNative.openNativeAuth(opts || {});
      if (r && r.action === 'login' && r.token) { await finishNativeLogin(r); }
      else if (r && r.action === 'google') { startWebGoogle(); }
      else { showWebLandingAgain(); }               // closed: fall back to the web landing
      return true;
    } catch (err) {
      console.warn('[native-auth] could not open native screen:', err && err.message ? err.message : err);
      showWebLandingAgain();
      return false;
    } finally {
      nativeAuthOpen = false;
    }
  }

  function hasStoredWebToken() {
    try {
      return ['authToken', 'necpa_token', 'token', 'accessToken', 'USER_TOKEN'].some(function (k) { return !!localStorage.getItem(k); });
    } catch (_) { return false; }
  }

  function installNativeAuthLaunch() {
    if (!window.NecpraNative || !window.NecpraNative.openNativeAuth) return;
    if (window.__necpraAuthLaunchInstalled) return;
    if (!document.getElementById('landingScreen')) return;            // only the landing/login page (index.html)
    if (!nativeAuthFlag()) return;
    window.__necpraAuthLaunchInstalled = true;

    var reason = null;
    try { reason = new URLSearchParams(window.location.search).get('reason'); } catch (_) {}
    // A stored token means the page's own session check will take the user straight into the app.
    if (!reason && hasStoredWebToken()) return;
    try { document.documentElement.classList.add('necpra-native-auth-pending'); } catch (_) {}   // no flash of the web landing
    var opts = reason ? { start: 'login', reason: 'Your session expired. Please log in again.' } : {};
    openNativeAuthScreen(opts).then(function (opened) {
      if (!opened) showWebLandingAgain();
    });
  }

  installNativeAuthLaunch();
  if (document.readyState !== 'complete') window.addEventListener('load', installNativeAuthLaunch, { once: true });

  if (document.readyState === 'complete') {
    requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
  } else {
    window.addEventListener('load', function () {
      requestAnimationFrame(function () { requestAnimationFrame(hideSplash); });
    }, { once: true });
  }

  setTimeout(hideSplash, 4000);
})();
