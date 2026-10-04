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
      } catch (_) {}
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
        console.warn('[SecureStorage] native set failed, falling back to localStorage:', err?.message || err);
      }
    }

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function removeItem(key) {
    const plugin = nativePlugin();

    if (plugin) {
      try {
        if (plugin.secureRemove) await plugin.secureRemove({ key });
        else await plugin.remove({ key });
      } catch (_) {}
    }

    try { localStorage.removeItem(key); } catch (_) {}
  }

  global.KynectaSecureStorage = {
    getItem,
    setItem,
    removeItem,
    isNativeBacked: () => !!nativePlugin()
  };
})(window);
