(function () {
  'use strict';
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;

  var Plugins = window.Capacitor.Plugins || {};

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
      clearBackgroundSyncRequest: function () { return native.clearBackgroundSyncRequest(); }
    };
  }

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
