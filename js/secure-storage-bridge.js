/**
 * KynectaSecureStorage is the narrow storage abstraction used for sensitive
 * local E2E identity material. In the Android APK it now uses the NecpraNative
 * Capacitor plugin, whose AES-GCM key is generated and retained by Android
 * Keystore. Browser/PWA sessions continue to use localStorage.
 */
(function (global) {
  'use strict';

  function nativePlugin() {
    try {
      return global.Capacitor?.Plugins?.NecpraNative ||
        global.Capacitor?.Plugins?.SecureStoragePlugin || null;
    } catch (_) {
      return null;
    }
  }

  async function getItem(key) {
    const plugin = nativePlugin();

    if (plugin) {
      try {
        const result = plugin.secureGet
          ? await plugin.secureGet({ key })
          : await plugin.get({ key });

        const value = result && result.value;
        if (value !== null && value !== undefined) return value;
      } catch (err) {
        console.warn('[SecureStorage] Native secure read failed:', err?.message || err);
        return null;
      }
    }

    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  async function setItem(key, value) {
    const plugin = nativePlugin();

    if (plugin) {
      try {
        if (plugin.secureSet) {
          await plugin.secureSet({ key, value: String(value) });
        } else {
          await plugin.set({ key, value: String(value) });
        }

        try { localStorage.removeItem(key); } catch (_) {}
        return true;
      } catch (err) {
        console.warn('[SecureStorage] Native secure set failed; refusing plaintext fallback:', err?.message || err);
        return false;
      }
    }

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function biometricUnlock(title, subtitle) {
    const plugin=nativePlugin(); if(!plugin?.biometricAuthenticate)return {authenticated:false,native:false};
    return plugin.biometricAuthenticate({title:title||'Unlock Necpra',subtitle:subtitle||'Verify your identity'});
  }
  async function biometricStatus(){const plugin=nativePlugin();if(!plugin?.biometricStatus)return {available:false,native:false};return plugin.biometricStatus();}

  async function removeItem(key) {
    const plugin = nativePlugin();

    if (plugin) {
      try {
        if (plugin.secureRemove) await plugin.secureRemove({ key });
        else await plugin.remove({ key });
      } catch (err) {
        console.warn('[SecureStorage] Native secure remove failed:', err?.message || err);
      }
      return;
    }

    try { localStorage.removeItem(key); } catch (_) {}
  }

  global.KynectaSecureStorage = {
    getItem,
    setItem,
    removeItem,
    biometricUnlock,
    biometricStatus,
    isNativeBacked: () => !!nativePlugin()
  };
})(window);
