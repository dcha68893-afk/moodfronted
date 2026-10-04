/**
 * KynectaRatchet — Double Ratchet primitives used by private 1:1 E2E.
 * P-256 ECDH + HKDF-SHA256 + HMAC-SHA256 chain KDF + AES-256-GCM.
 *
 * State follows the Signal Double Ratchet model: DHs/DHr, RK, CKs/CKr,
 * Ns/Nr/PN and MKSKIPPED. There is intentionally NO reusable message-key
 * cache: a message key is single-use. Duplicate deliveries are handled by
 * the application/message-delivery layer, not by reusing a consumed key.
 */
(function (global) {
  'use strict';
  const MAX_SKIP = 1000;
  const subtle = crypto.subtle;
  function b64(bytes) { const bin = String.fromCharCode(...new Uint8Array(bytes)); return btoa(bin); }
  function unb64(str) { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }
  async function genDH() { const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); return { privateKey: kp.privateKey, publicKey: kp.publicKey, pubRawB64: b64(await subtle.exportKey('raw', kp.publicKey)), privJwk: await subtle.exportKey('jwk', kp.privateKey) }; }
  async function importPub(raw) { return subtle.importKey('raw', unb64(raw), { name: 'ECDH', namedCurve: 'P-256' }, true, []); }
  async function importPriv(jwk) { return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); }
  async function dh(privateKey, publicKey) { return subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256); }
  async function hkdf(inputBits, salt, info, lengthBytes) { const key = await subtle.importKey('raw', inputBits, 'HKDF', false, ['deriveBits']); return subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, key, lengthBytes * 8); }
  async function hmacSha256(keyBits, msgBytes) { const key = await subtle.importKey('raw', keyBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return subtle.sign('HMAC', key, msgBytes); }
  async function KDF_RK(rootKeyBits, dhOutputBits) { const out = await hkdf(dhOutputBits, new Uint8Array(rootKeyBits), 'KynectaRatchet-RK', 64); return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) }; }
  async function KDF_CK(chainKeyBits) { return { messageKey: await hmacSha256(chainKeyBits, new Uint8Array([1])), chainKey: await hmacSha256(chainKeyBits, new Uint8Array([2])) }; }
  async function aesEncrypt(messageKeyBits, plaintextBytes, aadBytes) { const key = await subtle.importKey('raw', messageKeyBits, 'AES-GCM', false, ['encrypt']); const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadBytes, tagLength: 128 }, key, plaintextBytes); return { iv: b64(iv), ct: b64(ct) }; }
  async function aesDecrypt(messageKeyBits, ivB64, ctB64, aadBytes) { const key = await subtle.importKey('raw', messageKeyBits, 'AES-GCM', false, ['decrypt']); const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64), additionalData: aadBytes, tagLength: 128 }, key, unb64(ctB64)); return new TextDecoder().decode(pt); }
  function headerBytes(header) { return new TextEncoder().encode(JSON.stringify({ dh: header.dh, pn: header.pn, n: header.n })); }
  function newEmptySession() { return { v: 3, DHs_priv: null, DHs_pub: null, DHr: null, RK: null, CKs: null, CKr: null, Ns: 0, Nr: 0, PN: 0, skipped: {} }; }
  function keyId(dhB64, n) { return `${dhB64}:${n}`; }
  async function initSessionAsSender(sharedSecretBits, peerBootstrapPubRawB64) {
    const session = newEmptySession(); const dhs = await genDH(); session.DHs_priv = dhs.privJwk; session.DHs_pub = dhs.pubRawB64; session.DHr = peerBootstrapPubRawB64;
    const { rootKey, chainKey } = await KDF_RK(sharedSecretBits, await dh(dhs.privateKey, await importPub(peerBootstrapPubRawB64))); session.RK = b64(rootKey); session.CKs = b64(chainKey); return session;
  }
  async function initSessionAsReceiver(sharedSecretBits, myBootstrapPrivJwk, theirFirstMessageDHPubB64) {
    const session = newEmptySession(); session.DHs_priv = myBootstrapPrivJwk; session.DHr = theirFirstMessageDHPubB64;
    const { rootKey, chainKey } = await KDF_RK(sharedSecretBits, await dh(await importPriv(myBootstrapPrivJwk), await importPub(theirFirstMessageDHPubB64))); session.RK = b64(rootKey); session.CKr = b64(chainKey); return session;
  }
  async function ratchetEncrypt(session, plaintext) {
    if (!session.CKs) {
      const dhs = await genDH(); session.PN = session.Ns; session.Ns = 0; session.DHs_priv = dhs.privJwk; session.DHs_pub = dhs.pubRawB64;
      const { rootKey, chainKey } = await KDF_RK(unb64(session.RK), await dh(dhs.privateKey, await importPub(session.DHr))); session.RK = b64(rootKey); session.CKs = b64(chainKey);
    }
    const { chainKey, messageKey } = await KDF_CK(unb64(session.CKs)); const header = { dh: session.DHs_pub, pn: session.PN, n: session.Ns }; session.CKs = b64(chainKey); session.Ns += 1;
    const { iv, ct } = await aesEncrypt(messageKey, new TextEncoder().encode(String(plaintext)), headerBytes(header)); return { session, envelope: { v: 3, hdr: header, iv, ct } };
  }
  async function skipMessageKeys(session, untilN) {
    if (session.Nr + MAX_SKIP < untilN) throw new Error('Too many skipped messages — refusing (possible attack or badly broken connection)');
    if (!session.CKr) return; session.skipped = session.skipped || {};
    while (session.Nr < untilN) { if (Object.keys(session.skipped).length >= MAX_SKIP) throw new Error('Too many stored skipped message keys — refusing'); const { chainKey, messageKey } = await KDF_CK(unb64(session.CKr)); session.skipped[keyId(session.DHr, session.Nr)] = b64(messageKey); session.CKr = b64(chainKey); session.Nr += 1; }
  }
  async function ratchetDecrypt(session, envelope) {
    session.skipped = session.skipped || {}; const header = envelope.hdr;
    if (!header || !header.dh || !Number.isInteger(header.n) || !Number.isInteger(header.pn)) throw new Error('Invalid Double Ratchet header');
    const id = keyId(header.dh, header.n);
    if (session.skipped[id]) { const skippedKey = unb64(session.skipped[id]); delete session.skipped[id]; return { session, plaintext: await aesDecrypt(skippedKey, envelope.iv, envelope.ct, headerBytes(header)) }; }
    if (header.dh !== session.DHr) {
      if (session.CKr) await skipMessageKeys(session, header.pn); if (!session.DHs_priv || !session.RK) throw new Error('Receiving ratchet is not initialized');
      const rk1 = await KDF_RK(unb64(session.RK), await dh(await importPriv(session.DHs_priv), await importPub(header.dh))); session.RK = b64(rk1.rootKey); session.CKr = b64(rk1.chainKey); session.DHr = header.dh; session.Nr = 0; session.CKs = null;
    }
    if (!session.CKr) throw new Error('Receiving chain is unavailable'); await skipMessageKeys(session, header.n);
    const { chainKey, messageKey } = await KDF_CK(unb64(session.CKr)); session.CKr = b64(chainKey); session.Nr += 1;
    return { session, plaintext: await aesDecrypt(messageKey, envelope.iv, envelope.ct, headerBytes(header)) };
  }
  const api = { initSessionAsSender, initSessionAsReceiver, ratchetEncrypt, ratchetDecrypt, newEmptySession };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KynectaRatchet = api;
})(typeof window !== 'undefined' ? window : globalThis);
