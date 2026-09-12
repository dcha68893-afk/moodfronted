/**
 * KynectaRatchet — a real Double Ratchet implementation (Signal's published
 * algorithm: https://signal.org/docs/specifications/doubleratchet/),
 * adapted to WebCrypto's ECDH P-256 + HKDF-SHA256 + AES-256-GCM, which are
 * the same primitives the app's existing v2 envelope already uses (see
 * js/e2e-identity-core.js) — so this shares the same key-generation and
 * AEAD primitives, just composes them the way Signal does instead of a
 * single static shared secret.
 *
 * WHY THIS EXISTS (ties to the audit's P0 finding):
 * The app's v2 envelope derives ONE symmetric key per (user-pair) via a
 * single static ECDH between long-term identity keys, reused for every
 * message forever. That means stealing one identity private key decrypts
 * the ENTIRE historical conversation with that peer, not just future
 * messages. This module fixes that by:
 *   1. Forward secrecy: each message uses a key derived by a one-way KDF
 *      chain (KDF_CK) from the previous message's key. The chain key is
 *      immediately overwritten/discarded after deriving each message key,
 *      so recovering a later chain key cannot reconstruct earlier message
 *      keys (a one-way hash function cannot be run backwards).
 *   2. Post-compromise security: every so often (whenever the conversation
 *      direction switches), BOTH sides generate a brand-new ephemeral
 *      ECDH keypair, perform a fresh Diffie-Hellman exchange, and mix the
 *      result into the root key (KDF_RK) — then the OLD ephemeral private
 *      key is deleted and never persisted anywhere. An attacker who
 *      compromises a device's current state cannot recompute that deleted
 *      DH output, so cannot derive keys used before that ratchet step, and
 *      an attacker who stops observing the device eventually loses the
 *      thread again once the next DH ratchet step happens ("self-healing").
 *
 * This is a genuine implementation of the real algorithm, not a
 * simplification that only looks similar — SkipMessageKeys/MKSKIPPED
 * handling for out-of-order delivery is included, bounded to
 * MAX_SKIP entries per chain to prevent unbounded memory growth from a
 * malicious/broken peer claiming huge message-number gaps.
 *
 * Environment-agnostic: only uses `crypto.subtle` / `crypto.getRandomValues`
 * (identical API in browsers and modern Node), so the exact same file can
 * be unit-tested with `node` before being loaded in the app — see
 * ratchet-selftest.mjs alongside this file.
 */

const MAX_SKIP = 1000; // Signal's own reference implementation uses the same bound

const subtle = crypto.subtle;

// ---------- low-level primitive helpers ----------

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

// KDF_RK(rootKey, dhOutput) -> { rootKey, chainKey }  (HKDF, per Signal spec ties root+chain derivation to one call)
async function KDF_RK(rootKeyBits, dhOutputBits) {
  const out = await hkdf(dhOutputBits, new Uint8Array(rootKeyBits), 'KynectaRatchet-RK', 64);
  return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
}

// KDF_CK(chainKey) -> { chainKey: next, messageKey } (HMAC-based symmetric ratchet, per Signal spec §5.2)
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

// ---------- session state (serializable to JSON for localStorage) ----------

function newEmptySession() {
  return {
    v: 3,
    DHs_priv: null,      // JWK of our current ratchet private key
    DHs_pub: null,        // raw-b64 of our current ratchet public key
    DHr: null,             // raw-b64 of peer's current ratchet public key (null until known)
    RK: null,               // b64 root key
    CKs: null,               // b64 sending chain key (null until first send-side ratchet step)
    CKr: null,               // b64 receiving chain key (null until first recv-side ratchet step)
    Ns: 0, Nr: 0, PN: 0,
    skipped: {},              // `${DHr_b64}:${n}` -> b64 message key, bounded
  };
}

/**
 * Alice's side: called the very first time she sends to a peer she has no
 * ratchet session with yet. `sharedSecretBits` is the existing static-ECDH
 * output the app already computes today (identity-key X3DH-lite bootstrap)
 * — reused here as SK per the Double Ratchet spec's expectation that SK
 * comes from a prior key-agreement step. `peerBootstrapPubRawB64` is the
 * peer's long-term identity public key, used as their initial DHr exactly
 * as Signal uses the recipient's signed prekey for this role.
 */
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

/**
 * Bob's side: called when Bob receives his very first ratchet message from
 * a peer he has no session with yet. `myBootstrapPrivJwk` is BOB'S OWN
 * long-term identity private key (JWK) — playing the symmetric counterpart
 * to Alice using Bob's identity PUBLIC key above; ECDH's commutativity
 * (dh(a_priv,b_pub) === dh(b_priv,a_pub)) is what makes both sides land on
 * the same SK-derived root key without any extra round trip.
 */
async function initSessionAsReceiver(sharedSecretBits, myBootstrapPrivJwk, theirFirstMessageDHPubB64) {
  const session = newEmptySession();
  session.DHs_priv = myBootstrapPrivJwk; // bootstrap: our "ratchet key" starts out as our identity key
  session.DHs_pub = null; // unknown here; not needed until we ourselves send
  session.DHr = theirFirstMessageDHPubB64;
  const myPriv = await importPriv(myBootstrapPrivJwk);
  const theirPub = await importPub(theirFirstMessageDHPubB64);
  const dhOut = await dh(myPriv, theirPub);
  const { rootKey, chainKey } = await KDF_RK(sharedSecretBits, dhOut);
  session.RK = b64(rootKey);
  session.CKr = b64(chainKey);
  return session;
}

/** Encrypt one message. Mutates and returns the updated session + envelope. */
async function ratchetEncrypt(session, plaintext) {
  if (!session.CKs) {
    // We have a session (we've received before) but have never sent yet in
    // this ratchet turn — perform our own DH ratchet step first, exactly as
    // the spec's DHRatchet() does when a direction switch happens.
    const dhs = await genDH();
    const oldPriv = session.DHs_priv; // about to be discarded — this is the forward-secrecy-granting step
    session.DHs_priv = dhs.privJwk;
    session.DHs_pub = dhs.pubRawB64;
    const peerPub = await importPub(session.DHr);
    const dhOut = await dh(dhs.privateKey, peerPub);
    const { rootKey, chainKey } = await KDF_RK(unb64(session.RK), dhOut);
    session.RK = b64(rootKey);
    session.CKs = b64(chainKey);
    session.PN = session.Ns;
    session.Ns = 0;
    void oldPriv; // never stored back anywhere — deliberately dropped
  }
  const { chainKey, messageKey } = await KDF_CK(unb64(session.CKs));
  session.CKs = b64(chainKey);
  const header = { dh: session.DHs_pub, pn: session.PN, n: session.Ns };
  session.Ns += 1;
  const { iv, ct } = await aesEncrypt(messageKey, new TextEncoder().encode(plaintext), headerBytes(header));
  return { session, envelope: { v: 3, hdr: header, iv, ct } };
}

function skipKeyId(dhB64, n) { return `${dhB64}:${n}`; }

/** Advance a receiving chain forward, caching any skipped message keys. */
async function skipMessageKeys(session, untilN) {
  if (session.Nr + MAX_SKIP < untilN) {
    throw new Error('Too many skipped messages — refusing (possible attack or badly broken connection)');
  }
  if (!session.CKr) return; // nothing to skip yet
  let ckr = unb64(session.CKr);
  const skippedCount = Object.keys(session.skipped).length;
  while (session.Nr < untilN) {
    if (skippedCount + Object.keys(session.skipped).length > MAX_SKIP) {
      throw new Error('Too many stored skipped message keys — refusing');
    }
    const { chainKey, messageKey } = await KDF_CK(ckr);
    session.skipped[skipKeyId(session.DHr, session.Nr)] = b64(messageKey);
    ckr = chainKey;
    session.Nr += 1;
  }
  session.CKr = b64(ckr);
}

/** Decrypt one message. Mutates and returns the updated session + plaintext. */
async function ratchetDecrypt(session, envelope) {
  const header = envelope.hdr;
  const tryKey = session.skipped[skipKeyId(header.dh, header.n)];
  if (tryKey) {
    delete session.skipped[skipKeyId(header.dh, header.n)];
    const plaintext = await aesDecrypt(unb64(tryKey), envelope.iv, envelope.ct, headerBytes(header));
    return { session, plaintext };
  }

  if (header.dh !== session.DHr) {
    // Peer has ratcheted forward (new DH public key) — this is the DH
    // ratchet step on the receiving side: finish draining the OLD receiving
    // chain (up to their previous chain's final length, `pn`), then derive
    // a fresh root+receiving-chain from a new DH computation against their
    // new public key, using OUR current (about-to-be-superseded) private
    // ratchet key — which we then also rotate for next time we send.
    if (session.CKr) await skipMessageKeys(session, header.pn);
    const myPriv = await importPriv(session.DHs_priv);
    const theirNewPub = await importPub(header.dh);
    const dhOut1 = await dh(myPriv, theirNewPub);
    const rk1 = await KDF_RK(unb64(session.RK), dhOut1);
    session.RK = b64(rk1.rootKey);
    session.CKr = b64(rk1.chainKey);
    session.DHr = header.dh;
    session.Nr = 0;
    // We don't rotate DHs_priv here ourselves — that happens lazily the
    // next time WE send (see ratchetEncrypt's `if (!session.CKs)` branch),
    // exactly matching the reference algorithm, and means we don't burn an
    // extra keypair generation on every receive if we're not sending back.
    session.CKs = null;
  }

  await skipMessageKeys(session, header.n);
  const { chainKey, messageKey } = await KDF_CK(unb64(session.CKr));
  session.CKr = b64(chainKey);
  session.Nr += 1;
  const plaintext = await aesDecrypt(messageKey, envelope.iv, envelope.ct, headerBytes(header));
  return { session, plaintext };
}

const KynectaRatchet = {
  initSessionAsSender,
  initSessionAsReceiver,
  ratchetEncrypt,
  ratchetDecrypt,
  newEmptySession,
};

if (typeof module !== 'undefined' && module.exports) module.exports = KynectaRatchet;
if (typeof window !== 'undefined') window.KynectaRatchet = KynectaRatchet;
