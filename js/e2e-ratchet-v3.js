/**
 * KynectaRatchet — Double Ratchet primitives used by the private-message E2E
 * engine. P-256 ECDH + HKDF-SHA256 + AES-256-GCM.
 *
 * The session state is serializable and contains DHs/DHr, RK, CKs/CKr,
 * Ns/Nr/PN and MKSKIPPED. `recent` is a deliberately tiny, short-lived
 * duplicate-decrypt cache for same-origin UI contexts: the shell notification
 * and message iframe can receive the same ciphertext independently. It keeps
 * a just-consumed message key for a few seconds so the second UI context can
 * authenticate the same message without advancing the receiving chain twice.
 * It is bounded and expires quickly; it is not used to derive any later key.
 */
(function (global) {
  'use strict';

  const MAX_SKIP = 1000;
  const MAX_RECENT = 32;
  const RECENT_TTL_MS = 30000;
  const subtle = crypto.subtle;

  function b64(bytes) {
    const bin = String.fromCharCode(...new Uint8Array(bytes));
    return btoa(bin);
  }
  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  async function genDH() {
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const pubRaw = await subtle.exportKey('raw', kp.publicKey);
    const privJwk = await subtle.exportKey('jwk', kp.privateKey);
    return { privateKey: kp.privateKey, publicKey: kp.publicKey, pubRawB64: b64(pubRaw), privJwk };
  }
  async function importPub(pubRawB64) {
    return subtle.importKey('raw', unb64(pubRawB64), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  }
  async function importPriv(jwk) {
    return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  }
  async function dh(privateKey, publicKey) {
    return subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  }
  async function hkdf(inputBits, salt, info, lengthBytes) {
    const key = await subtle.importKey('raw', inputBits, 'HKDF', false, ['deriveBits']);
    return subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
      key,
      lengthBytes * 8
    );
  }
  async function hmacSha256(keyBits, msgBytes) {
    const key = await subtle.importKey('raw', keyBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return subtle.sign('HMAC', key, msgBytes);
  }
  async function KDF_RK(rootKeyBits, dhOutputBits) {
    const out = await hkdf(dhOutputBits, new Uint8Array(rootKeyBits), 'KynectaRatchet-RK', 64);
    return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
  }
  async function KDF_CK(chainKeyBits) {
    const messageKey = await hmacSha256(chainKeyBits, new Uint8Array([0x01]));
    const nextChainKey = await hmacSha256(chainKeyBits, new Uint8Array([0x02]));
    return { chainKey: nextChainKey, messageKey };
  }
  async function aesEncrypt(messageKeyBits, plaintextBytes, aadBytes) {
    const key = await subtle.importKey('raw', messageKeyBits, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadBytes, tagLength: 128 }, key, plaintextBytes);
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function aesDecrypt(messageKeyBits, ivB64, ctB64, aadBytes) {
    const key = await subtle.importKey('raw', messageKeyBits, 'AES-GCM', false, ['decrypt']);
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64), additionalData: aadBytes, tagLength: 128 }, key, unb64(ctB64));
    return new TextDecoder().decode(pt);
  }
  function headerBytes(header) {
    return new TextEncoder().encode(JSON.stringify({ dh: header.dh, pn: header.pn, n: header.n }));
  }
  function newEmptySession() {
    return {
      v: 3,
      DHs_priv: null,
      DHs_pub: null,
      DHr: null,
      RK: null,
      CKs: null,
      CKr: null,
      Ns: 0,
      Nr: 0,
      PN: 0,
      skipped: {},
      recent: {},
    };
  }
  function keyId(dhB64, n) { return `${dhB64}:${n}`; }
  function cleanupRecent(session) {
    const now = Date.now();
    const entries = Object.entries(session.recent || {});
    for (const [k, rec] of entries) {
      if (!rec || now - Number(rec.ts || 0) > RECENT_TTL_MS) delete session.recent[k];
    }
    const remaining = Object.entries(session.recent || {}).sort((a, b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0));
    for (let i = MAX_RECENT; i < remaining.length; i++) delete session.recent[remaining[i][0]];
  }
  function rememberRecent(session, id, messageKey) {
    session.recent = session.recent || {};
    cleanupRecent(session);
    session.recent[id] = { mk: b64(messageKey), ts: Date.now() };
    cleanupRecent(session);
  }

  async function initSessionAsSender(sharedSecretBits, peerBootstrapPubRawB64) {
    const session = newEmptySession();
    const dhs = await genDH();
    session.DHs_priv = dhs.privJwk;
    session.DHs_pub = dhs.pubRawB64;
    session.DHr = peerBootstrapPubRawB64;
    const peerPub = await importPub(peerBootstrapPubRawB64);
    const dhOut = await dh(dhs.privateKey, peerPub);
    const { rootKey, chainKey } = await KDF_RK(sharedSecretBits, dhOut);
    session.RK = b64(rootKey);
    session.CKs = b64(chainKey);
    return session;
  }

  async function initSessionAsReceiver(sharedSecretBits, myBootstrapPrivJwk, theirFirstMessageDHPubB64) {
    const session = newEmptySession();
    session.DHs_priv = myBootstrapPrivJwk;
    session.DHs_pub = null;
    session.DHr = theirFirstMessageDHPubB64;
    const myPriv = await importPriv(myBootstrapPrivJwk);
    const theirPub = await importPub(theirFirstMessageDHPubB64);
    const dhOut = await dh(myPriv, theirPub);
    const { rootKey, chainKey } = await KDF_RK(sharedSecretBits, dhOut);
    session.RK = b64(rootKey);
    session.CKr = b64(chainKey);
    return session;
  }

  async function ratchetEncrypt(session, plaintext) {
    if (!session.CKs) {
      const dhs = await genDH();
      session.DHs_priv = dhs.privJwk;
      session.DHs_pub = dhs.pubRawB64;
      const peerPub = await importPub(session.DHr);
      const dhOut = await dh(dhs.privateKey, peerPub);
      const { rootKey, chainKey } = await KDF_RK(unb64(session.RK), dhOut);
      session.RK = b64(rootKey);
      session.CKs = b64(chainKey);
      session.PN = session.Ns;
      session.Ns = 0;
    }
    const { chainKey, messageKey } = await KDF_CK(unb64(session.CKs));
    session.CKs = b64(chainKey);
    const header = { dh: session.DHs_pub, pn: session.PN, n: session.Ns };
    session.Ns += 1;
    const { iv, ct } = await aesEncrypt(messageKey, new TextEncoder().encode(plaintext), headerBytes(header));
    return { session, envelope: { v: 3, hdr: header, iv, ct } };
  }

  async function skipMessageKeys(session, untilN) {
    if (session.Nr + MAX_SKIP < untilN) throw new Error('Too many skipped messages — refusing (possible attack or badly broken connection)');
    if (!session.CKr) return;
    session.skipped = session.skipped || {};
    while (session.Nr < untilN) {
      if (Object.keys(session.skipped).length >= MAX_SKIP) throw new Error('Too many stored skipped message keys — refusing');
      const { chainKey, messageKey } = await KDF_CK(unb64(session.CKr));
      session.skipped[keyId(session.DHr, session.Nr)] = b64(messageKey);
      session.CKr = b64(chainKey);
      session.Nr += 1;
    }
  }

  async function ratchetDecrypt(session, envelope) {
    session.skipped = session.skipped || {};
    session.recent = session.recent || {};
    cleanupRecent(session);
    const header = envelope.hdr;
    const id = keyId(header.dh, header.n);

    const recent = session.recent[id];
    if (recent?.mk) {
      try {
        const plaintext = await aesDecrypt(unb64(recent.mk), envelope.iv, envelope.ct, headerBytes(header));
        return { session, plaintext };
      } catch (_) {
        delete session.recent[id];
      }
    }

    const skippedKey = session.skipped[id];
    if (skippedKey) {
      const plaintext = await aesDecrypt(unb64(skippedKey), envelope.iv, envelope.ct, headerBytes(header));
      delete session.skipped[id];
      rememberRecent(session, id, unb64(skippedKey));
      return { session, plaintext };
    }

    if (header.dh !== session.DHr) {
      if (session.CKr) await skipMessageKeys(session, header.pn);
      const myPriv = await importPriv(session.DHs_priv);
      const theirNewPub = await importPub(header.dh);
      const dhOut1 = await dh(myPriv, theirNewPub);
      const rk1 = await KDF_RK(unb64(session.RK), dhOut1);
      session.RK = b64(rk1.rootKey);
      session.CKr = b64(rk1.chainKey);
      session.DHr = header.dh;
      session.Nr = 0;
      session.CKs = null;
    }

    await skipMessageKeys(session, header.n);
    const { chainKey, messageKey } = await KDF_CK(unb64(session.CKr));
    session.CKr = b64(chainKey);
    session.Nr += 1;
    const plaintext = await aesDecrypt(messageKey, envelope.iv, envelope.ct, headerBytes(header));
    rememberRecent(session, id, messageKey);
    return { session, plaintext };
  }

  const api = { initSessionAsSender, initSessionAsReceiver, ratchetEncrypt, ratchetDecrypt, newEmptySession };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KynectaRatchet = api;
})(typeof window !== 'undefined' ? window : globalThis);
