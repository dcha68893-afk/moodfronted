// Drives the REAL web ratchet (js/e2e-ratchet-v3.js, unmodified) for the cross-language test.
const fs = require('fs'); const R = require('./ratchet.js'); const subtle = crypto.subtle;
const b64 = b => Buffer.from(b).toString('base64'); const unb64 = s => Uint8Array.from(Buffer.from(s, 'base64')).buffer;
const [cmd, ...a] = process.argv.slice(2);
(async () => {
  if (cmd === 'ident') { // ident <out>  -> SPKI/PKCS8 exactly like e2e-identity-core.js
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    fs.writeFileSync(a[0], JSON.stringify({ pub: b64(await subtle.exportKey('spki', kp.publicKey)), priv: b64(await subtle.exportKey('pkcs8', kp.privateKey)) }));
  } else if (cmd === 'wrap') { // wrap <identFile> <password> <out> -> identical to e2e-identity-core.js wrapPrivate()
    const me = JSON.parse(fs.readFileSync(a[0])); const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
    const pw = await subtle.importKey('raw', enc.encode(a[1]), 'PBKDF2', false, ['deriveKey']);
    const k = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, pw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, k, unb64(me.priv));
    fs.writeFileSync(a[2], JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  } else if (cmd === 'enc') { // enc <identFile> <peerIdentFile> <sessFile> <text> <outEnv>
    const me = JSON.parse(fs.readFileSync(a[0])), peer = JSON.parse(fs.readFileSync(a[1]));
    let session = fs.existsSync(a[2]) ? JSON.parse(fs.readFileSync(a[2])) : null;
    if (!session) {
      const priv = await subtle.importKey('pkcs8', unb64(me.priv), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const pk = await subtle.importKey('spki', unb64(peer.pub), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
      const shared = await subtle.deriveBits({ name: 'ECDH', public: pk }, priv, 256);
      session = await R.initSessionAsSender(shared, b64(await subtle.exportKey('raw', pk)));
    }
    const { session: next, envelope } = await R.ratchetEncrypt(session, a[3]);
    fs.writeFileSync(a[2], JSON.stringify(next)); fs.writeFileSync(a[4], JSON.stringify(envelope));
  } else if (cmd === 'dec') { // dec <identFile> <peerIdentFile> <sessFile> <envFile>  (prints plaintext)
    const me = JSON.parse(fs.readFileSync(a[0])), peer = JSON.parse(fs.readFileSync(a[1]));
    const env = JSON.parse(fs.readFileSync(a[3]));
    let session = fs.existsSync(a[2]) ? JSON.parse(fs.readFileSync(a[2])) : null;
    if (!session) {
      const priv = await subtle.importKey('pkcs8', unb64(me.priv), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const pk = await subtle.importKey('spki', unb64(peer.pub), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
      const shared = await subtle.deriveBits({ name: 'ECDH', public: pk }, priv, 256);
      const jwk = await subtle.exportKey('jwk', priv);
      session = await R.initSessionAsReceiver(shared, jwk, env.hdr.dh);
    }
    const { session: next, plaintext } = await R.ratchetDecrypt(session, env);
    fs.writeFileSync(a[2], JSON.stringify(next)); process.stdout.write(plaintext);
  }
})().catch(e => { console.error('JSERR ' + e.message); process.exit(2); });
