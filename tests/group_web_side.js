// Drives the REAL web group client (js/groupMessaging.client.js, unmodified) for the cross-language test.
// A shared JSON file plays the backend (same rules as moodchat/src/services/groupMessagingService.js: one epoch,
// per-owner sender keys, per-member distributions, missingMemberIds). Each invocation is one "device" of one user.
//   node tests/group_web_side.js ident <out>
//   node tests/group_web_side.js send <dir> <uid> <group> <text> <outEnv>
//   node tests/group_web_side.js recv <dir> <uid> <group> <envFile>
const fs = require('fs'); const path = require('path');
const subtle = crypto.subtle;
const b64 = b => Buffer.from(b).toString('base64');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));
const [cmd, ...a] = process.argv.slice(2);

(async () => {
  if (cmd === 'ident') {
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    fs.writeFileSync(a[0], JSON.stringify({ pub: b64(await subtle.exportKey('spki', kp.publicKey)), priv: b64(await subtle.exportKey('pkcs8', kp.privateKey)) }));
    return;
  }
  const dir = a[0], uid = Number(a[1]), group = Number(a[2]);
  const srvFile = path.join(dir, 'server.json'), lsFile = path.join(dir, 'ls_web_' + uid + '.json');
  const readSrv = () => JSON.parse(fs.readFileSync(srvFile, 'utf8'));
  const writeSrv = s => fs.writeFileSync(srvFile, JSON.stringify(s));
  const ident = JSON.parse(fs.readFileSync(path.join(dir, 'ident_' + uid + '.json'), 'utf8'));

  const ls = fs.existsSync(lsFile) ? JSON.parse(fs.readFileSync(lsFile, 'utf8')) : {};
  const flush = () => fs.writeFileSync(lsFile, JSON.stringify(ls));
  const localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); flush(); }, removeItem: k => { delete ls[k]; flush(); } };
  const sessionStorage = { getItem: () => 'pw', setItem() {}, removeItem() {} };
  const priv = await subtle.importKey('pkcs8', unb64(ident.priv), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);

  const server = async (method, p, body) => {
    const s = readSrv(); const ok = d => ({ ok: true, status: 200, json: async () => ({ success: true, data: d }) });
    let m;
    if ((m = p.match(/^\/encryption\/keys\/(\d+)$/))) return ok({ publicKey: s.pubkeys[m[1]] });
    if ((m = p.match(/^\/chats\/(\d+)$/))) return ok({ chat: { id: Number(m[1]), participants: s.members.map(id => ({ user: { id } })) } });
    if ((m = p.match(/^\/group-messages\/(\d+)\/crypto\/state$/))) {
      const missing = s.members.filter(id => !s.senderKeys.some(k => k.ownerId === uid && k.epoch === s.epoch && k.distributions.some(d => d.userId === id)) && s.senderKeys.some(k => k.ownerId === uid));
      return ok({ epoch: s.epoch, algorithm: 'SenderKey-AES256GCM-v2', pending: false, missingMemberIds: s.pendingFor || [], senderKeys: s.senderKeys.map(k => ({ ownerId: k.ownerId, epoch: k.epoch, algorithm: 'SenderKey-AES256GCM-v2', distribution: k.distributions.find(d => d.userId === uid) || null })).filter(x => x.distribution), history: [] });
    }
    if ((m = p.match(/^\/group-messages\/(\d+)\/crypto\/rotate$/))) {
      const b = JSON.parse(body); if (b.epoch !== s.epoch) return { ok: false, status: 409, json: async () => ({ success: false, message: 'Invalid group encryption epoch' }) };
      s.senderKeys = s.senderKeys.filter(k => !(k.ownerId === uid && k.epoch === b.epoch));
      s.senderKeys.push({ ownerId: uid, epoch: b.epoch, distributions: b.distributions.map(d => ({ userId: d.userId, deviceId: d.deviceId, ciphertext: d.ciphertext, algorithm: d.algorithm, ownerId: uid })) });
      writeSrv(s); return { ok: true, status: 201, json: async () => ({ success: true }) };
    }
    if (p.match(/\/crypto\/ack$/)) return ok({});
    throw new Error('unhandled ' + method + ' ' + p);
  };

  globalThis.window = globalThis;
  globalThis.localStorage = localStorage; globalThis.sessionStorage = sessionStorage;
  globalThis.document = { addEventListener() {} };
  globalThis.__getApiBase = () => '';
  globalThis.__kynToken = 'x';
  globalThis._kynCurrentUserId = uid;
  globalThis.KynectaE2EIdentity = { privateKey: priv, publicKey: ident.pub, enabled: true, wrapAtRest: async x => x, unwrapAtRest: async x => x };
  globalThis.fetch = async (url, opt = {}) => server((opt.method || 'GET').toUpperCase(), url, opt.body);
  console.log = () => {}; console.warn = () => {};

  require(path.resolve(__dirname, '..', 'js', 'groupMessaging.client.js'));
  const G = globalThis.KynectaGroupE2E;
  if (cmd === 'send') { const text = a[3].startsWith('@') ? fs.readFileSync(a[3].slice(1), 'utf8') : a[3]; fs.writeFileSync(a[4], await G.encryptForGroup(group, text, [])); }
  else if (cmd === 'recv') { process.stdout.write(await G.decryptForGroup(group, fs.readFileSync(a[3], 'utf8'), [])); }
})().catch(e => { process.stderr.write('ERR ' + (e && e.stack || e) + '\n'); process.exit(1); });
