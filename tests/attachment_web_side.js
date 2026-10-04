// Mirrors js/message-e2e-core.js encryptAttachment/decryptAttachment + js/e2e-identity-core.js (deriveShared, hkdf) exactly.
const { webcrypto: crypto } = require('node:crypto');
const subtle = crypto.subtle;
const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const enc = (s) => new TextEncoder().encode(s);
const pairContext = (me, peer) => `kynecta-dm-v2:${[String(me), String(peer)].sort().join(':')}`;
async function hkdf(shared, info) {
  const k = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc(info) }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function identity() {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { priv: b64(await subtle.exportKey('pkcs8', kp.privateKey)), pub: b64(await subtle.exportKey('spki', kp.publicKey)) };
}
const impPriv = (s) => subtle.importKey('pkcs8', unb64(s), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
const impPub = (s) => subtle.importKey('spki', unb64(s), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
async function encryptAttachment(me, meId, peerPub, peerId, data) {
  const shared = await subtle.deriveBits({ name: 'ECDH', public: await impPub(peerPub) }, await impPriv(me.priv), 256);
  const key = await hkdf(shared, pairContext(meId, peerId) + ':attachment');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data);
  return { v: 2, spk: me.pub, iv: b64(iv), ct: b64(ct) };
}
async function decryptAttachment(me, meId, env, senderId) {
  const shared = await subtle.deriveBits({ name: 'ECDH', public: await impPub(env.spk) }, await impPriv(me.priv), 256);
  const key = await hkdf(shared, pairContext(meId, senderId) + ':attachment');
  return Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), tagLength: 128 }, key, unb64(env.ct)));
}
(async () => {
  const [cmd, ...a] = process.argv.slice(2);
  const fs = require('fs');
  if (cmd === 'ident') fs.writeFileSync(a[0], JSON.stringify(await identity()));
  if (cmd === 'enc') { // enc <me.json> <meId> <peer.json> <peerId> <in> <out>
    const me = JSON.parse(fs.readFileSync(a[0])), peer = JSON.parse(fs.readFileSync(a[2]));
    fs.writeFileSync(a[5], JSON.stringify(await encryptAttachment(me, a[1], peer.pub, a[3], fs.readFileSync(a[4]))));
  }
  if (cmd === 'dec') { // dec <me.json> <meId> <env> <senderId> <out>
    const me = JSON.parse(fs.readFileSync(a[0]));
    fs.writeFileSync(a[4], await decryptAttachment(me, a[1], JSON.parse(fs.readFileSync(a[2])), a[3]));
  }
})().catch(e => { console.error(e); process.exit(1); });
