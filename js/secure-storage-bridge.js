/**
 * KynectaSecureStorage — thin key/value storage abstraction used ONLY for
 * the app's most sensitive local value: the password-wrapped E2E identity
 * private key blob (see js/e2e-identity-core.js's storeKey()/init()).
 *
 * WHY THIS EXISTS (audit P0 finding): that blob previously lived only in
 * plain localStorage. It's wrapped with a real, strong KDF (PBKDF2-SHA256,
 * 310,000 iterations) + AES-256-GCM, so it isn't *readable* without the
 * user's password — but it's still sitting in ordinary web storage, below
 * platform best practice and below what Signal does (Android
 * Keystore-backed storage).
 *
 * This module prefers a native, Android-Keystore-backed secure storage
 * plugin when one is present (Capacitor's plugin bridge, checked at
 * runtime via window.Capacitor.Plugins.SecureStoragePlugin — the API
 * surface published by @atroo/capacitor-secure-storage-plugin, which uses
 * EncryptedSharedPreferences under the hood on Android), and transparently
 * falls back to localStorage when it isn't (plain browser tab, or the
 * native plugin genuinely hasn't been added to this build yet). That means:
 *   - Today, before the plugin is installed: behavior is UNCHANGED (falls
 *     back to localStorage) — this file alone does not silently break
 *     anything.
 *   - After you run the two commands below, it upgrades automatically with
 *     no further code changes:
 *       npm install @atroo/capacitor-secure-storage-plugin
 *       npx cap sync android
 *     (That plugin needs Java 21 to build — see its README. This
 *     native-toolchain step cannot be completed in this environment: there
 *     is no Android SDK/Gradle here, and Google's Maven repositories
 *     aren't in this sandbox's network allowlist. It has to be run on your
 *     own machine, and you should verify a real Android build afterward.)
 *
 * This is intentionally a NARROW abstraction (only get/set/remove for one
 * or two specific keys) rather than a wholesale localStorage replacement —
 * migrating every one of this app's many localStorage keys onto a
 * native-plugin round trip would add real latency to things that don't
 * need Keystore-grade protection (cached public keys, UI state, etc).
 */
(function (global) {
  'use strict';

  function nativePlugin() {
    try { return global.Capacitor?.Plugins?.SecureStoragePlugin || null; } catch (_) { return null; }
  }

  async function getItem(key) {
    const plugin = nativePlugin();
    if (plugin) {
      try {
        const { value } = await plugin.get({ key });
        if (value !== null && value !== undefined) return value;
      } catch (_) {
        // Not found in secure storage, or plugin call failed — fall
        // through to localStorage, which also covers the one-time
        // migration case (a value written before the plugin existed).
      }
    }
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  async function setItem(key, value) {
    const plugin = nativePlugin();
    if (plugin) {
      try {
        await plugin.set({ key, value: String(value) });
        // Once it's safely in Keystore-backed storage, remove the
        // plaintext-at-rest localStorage copy so it isn't left behind as a
        // second, weaker copy of the same secret.
        try { localStorage.removeItem(key); } catch (_) {}
        return true;
      } catch (err) {
        console.warn('[SecureStorage] native set() failed, falling back to localStorage:', err?.message || err);
      }
    }
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  async function removeItem(key) {
    const plugin = nativePlugin();
    if (plugin) { try { await plugin.remove({ key }); } catch (_) {} }
    try { localStorage.removeItem(key); } catch (_) {}
  }

  global.KynectaSecureStorage = { getItem, setItem, removeItem, isNativeBacked: () => !!nativePlugin() };
})(window);
