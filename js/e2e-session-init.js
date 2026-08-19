/**
 * Shared E2E bootstrap for every window/iframe that loads e2e-encryption.js.
 *
 * IMPORTANT: cryptographic identity is initialized at authenticated-session
 * startup, not when a chat panel is opened.  This removes the old dependency
 * on Chat History being opened first.
 *
 * The long-lived identity key is owned by KynectaE2E.  This bootstrap also
 * creates and publishes the PUBLIC X3DH material required for first-contact
 * sessions: signing identity public key, signed prekey and a replenishable
 * one-time-prekey pool. Private prekey material never goes to the backend.
 */
(function () {
  'use strict';

  const PREKEY_TARGET = 50;
  const PREKEY_MINIMUM = 10;
  const PREKEY_STORAGE = 'kyn_x3dh_prekeys_v1';
  const RETRY_DELAYS = [1000, 2500, 5000, 10000, 30000];
  let provisioningPromise = null;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function b64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function unb64(s) {
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  }

  function userId() {
    try {
      if (window.SessionManager?.getCurrentUserId) {
        const id = window.SessionManager.getCurrentUserId();
        if (id) return String(id);
      }
    } catch (_) {}
    try {
      if (window.KynectaE2E?.getMyUserId) {
        const id = window.KynectaE2E.getMyUserId();
        if (id) return String(id);
      }
    } catch (_) {}
    try {
      const raw = localStorage.getItem('kynecta_auth');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.user?.id || parsed?.userId ? String(parsed.user?.id || parsed.userId) : null;
    } catch (_) { return null; }
  }

  function storageKey() {
    const uid = userId();
    return uid ? `${PREKEY_STORAGE}_${uid}` : PREKEY_STORAGE;
  }

  async function apiBase() {
    return window.API_BASE_URL || window.BACKEND_URL || '';
  }

  async function authHeaders() {
    const token = window.authToken ||
      sessionStorage.getItem('kynecta_auth_token') ||
      localStorage.getItem('kynecta_auth_token') ||
      localStorage.getItem('authToken') || '';
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      return await fetch(`${await apiBase()}${path}`, {
        credentials: 'include',
        ...options,
        headers: { ...(await authHeaders()), ...(options.headers || {}) },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function importPrivate(b64pkcs8, usages) {
    return crypto.subtle.importKey(
      'pkcs8', unb64(b64pkcs8),
      { name: 'ECDH', namedCurve: 'P-256' },
      true, usages
    );
  }

  async function exportPrivate(key) {
    return b64(await crypto.subtle.exportKey('pkcs8', key));
  }

  async function exportPublic(key) {
    return b64(await crypto.subtle.exportKey('spki', key));
  }

  async function generateSigningKeyPair() {
    return crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
  }

  async function generatePrekeyPair() {
    return crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
  }

  async function signPrekey(signingPrivateKey, signedPrekeyPublicB64) {
    const data = new TextEncoder().encode(signedPrekeyPublicB64);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingPrivateKey,
      data
    );
    return b64(signature);
  }

  async function createInitialBundle() {
    const signing = await generateSigningKeyPair();
    const signed = await generatePrekeyPair();
    const signingPub = await exportPublic(signing.publicKey);
    const signedPub = await exportPublic(signed.publicKey);
    const signedPriv = await exportPrivate(signed.privateKey);
    const signedPreKeyId = crypto.randomUUID();
    const signature = await signPrekey(signing.privateKey, signedPub);

    const oneTime = [];
    for (let i = 0; i < PREKEY_TARGET; i++) {
      const kp = await generatePrekeyPair();
      oneTime.push({
        keyId: crypto.randomUUID(),
        publicKey: await exportPublic(kp.publicKey),
        privateKey: await exportPrivate(kp.privateKey),
      });
    }

    return {
      version: 1,
      userId: userId(),
      signingPublicKey: signingPub,
      signingPrivateKey: await exportPrivate(signing.privateKey),
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: signedPub,
        privateKey: signedPriv,
        signature,
      },
      oneTimePreKeys: oneTime,
      createdAt: Date.now(),
    };
  }

  function loadBundle() {
    try {
      const raw = localStorage.getItem(storageKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function saveBundle(bundle) {
    localStorage.setItem(storageKey(), JSON.stringify(bundle));
  }

  async function serverPrekeyCount() {
    try {
      const resp = await request('/api/encryption/prekeys/count');
      if (!resp.ok) return null;
      const json = await resp.json();
      return Number(json?.data?.count ?? 0);
    } catch (_) { return null; }
  }

  async function publishBundle(bundle) {
    const publicOneTime = (bundle.oneTimePreKeys || []).map(k => ({
      keyId: k.keyId,
      publicKey: k.publicKey,
    }));

    const resp = await request('/api/encryption/prekeys', {
      method: 'POST',
      body: JSON.stringify({
        signingPubKey: bundle.signingPublicKey,
        signedPreKey: {
          keyId: bundle.signedPreKey.keyId,
          publicKey: bundle.signedPreKey.publicKey,
          signature: bundle.signedPreKey.signature,
        },
        oneTimePreKeys: publicOneTime,
      }),
    });

    if (!resp.ok) throw new Error(`prekey registration failed: HTTP ${resp.status}`);
    return resp.json();
  }

  async function replenish(bundle, count) {
    const needed = Math.max(PREKEY_TARGET - count, 0);
    if (!needed) return bundle;

    for (let i = 0; i < needed; i++) {
      const kp = await generatePrekeyPair();
      bundle.oneTimePreKeys.push({
        keyId: crypto.randomUUID(),
        publicKey: await exportPublic(kp.publicKey),
        privateKey: await exportPrivate(kp.privateKey),
      });
    }
    return bundle;
  }

  async function provisionPrekeys() {
    if (!crypto?.subtle || !userId()) return false;

    let bundle = loadBundle();
    if (!bundle || String(bundle.userId) !== String(userId()) || !bundle.signingPrivateKey || !bundle.signedPreKey) {
      bundle = await createInitialBundle();
      saveBundle(bundle);
    }

    let count = await serverPrekeyCount();
    if (count === null) {
      await publishBundle(bundle);
      count = PREKEY_TARGET;
    } else if (count < PREKEY_MINIMUM) {
      bundle = await replenish(bundle, count);
      saveBundle(bundle);
      await publishBundle(bundle);
    }

    // The backend accepts duplicate public prekeys idempotently by keyId.
    // Keep local private material until it has actually been consumed; the
    // client-side session layer can later remove a consumed private prekey.
    bundle.lastPublishedAt = Date.now();
    saveBundle(bundle);
    return true;
  }

  async function provisionWithRetry() {
    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      try {
        if (await provisionPrekeys()) return true;
      } catch (err) {
        console.warn(`[E2E] Prekey bootstrap attempt ${i + 1} failed:`, err?.message || err);
      }
      await sleep(RETRY_DELAYS[i]);
    }
    return false;
  }

  async function bootstrapE2E() {
    if (!window.KynectaE2E) return false;

    let password = null;
    let legacyPassword = null;
    try {
      password = sessionStorage.getItem('kyn_e2e_pw_session');
      legacyPassword = sessionStorage.getItem('kyn_e2e_pw_legacy_session');
    } catch (_) {}
    if (!password) return false;

    // Identity initialization happens BEFORE any chat can be opened.
    const identityReady = await window.KynectaE2E.init(password, legacyPassword);
    if (!identityReady && !window.KynectaE2E.enabled) return false;

    const prekeysReady = await provisionWithRetry();
    if (!prekeysReady) {
      console.warn('[E2E] Identity is initialized, but X3DH prekey publication is still pending.');
    }

    try {
      document.dispatchEvent(new CustomEvent('kyn:e2eProvisioned', {
        detail: { userId: userId(), identityReady: !!window.KynectaE2E.enabled, prekeysReady },
      }));
    } catch (_) {}

    return !!window.KynectaE2E.enabled;
  }

  function tryInitE2E() {
    if (!window.KynectaE2E) return setTimeout(tryInitE2E, 150);
    if (window.KynectaE2E.enabled && !provisioningPromise) {
      provisioningPromise = provisionWithRetry().catch(() => false);
      return;
    }

    let password = null;
    try { password = sessionStorage.getItem('kyn_e2e_pw_session'); } catch (_) {}
    if (!password) return setTimeout(tryInitE2E, 500);

    if (!provisioningPromise) {
      provisioningPromise = bootstrapE2E().catch(err => {
        console.warn('[E2E] Bootstrap failed; retrying:', err?.message || err);
        provisioningPromise = null;
        return false;
      });
      provisioningPromise.then(ok => {
        if (!ok) setTimeout(tryInitE2E, 2000);
      });
    }
  }

  tryInitE2E();
  document.addEventListener('kyn:e2eUnlockRetry', () => {
    provisioningPromise = null;
    tryInitE2E();
  });
  window.addEventListener('kyn:loggedIn', () => {
    provisioningPromise = null;
    tryInitE2E();
  });
})();
