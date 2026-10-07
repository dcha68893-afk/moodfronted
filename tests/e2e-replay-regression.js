/* Regression test for the 1:1 session-rollback bug (duplicate delivery of an already-decrypted message).
 * Run:  node tests/e2e-replay-regression.js
 * Expected: a3, b1, a4 decrypt; the two duplicates report FAIL(E2E_REPLAY).  If a3/b1/a4 show FAIL(...), the bug is back. */
const vm=require('vm'), fs=require('fs');
const Ratchet=require('../js/e2e-ratchet-v3.js');
const quiet={log(){},warn(){},error(){},info(){},debug(){}};
async function makeDevice(userId, dir, corePath){
  const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const spki=Buffer.from(await crypto.subtle.exportKey('spki',kp.publicKey)).toString('base64');
  const keyId='key'+userId; dir[userId]={key:kp.publicKey,keyId};
  const store=new Map(), ls=new Map();
  const identity={enabled:true,userId,privateKey:kp.privateKey,publicKey:spki,keyId,init:async()=>true,
    publicKeyFor:async(peer)=>{const e=dir[peer]; if(!e) throw new Error('no key'); return {key:e.key,keyId:e.keyId};},
    importPeerKey:async b=>crypto.subtle.importKey('spki',Buffer.from(b,'base64'),{name:'ECDH',namedCurve:'P-256'},true,[]),
    deriveShared:async k=>crypto.subtle.deriveBits({name:'ECDH',public:k},kp.privateKey,256)};
  const ctx={crypto,TextEncoder,TextDecoder,atob,btoa,console:quiet,setTimeout,clearTimeout,setInterval,Promise,JSON,Math,Date,Map,Set,Uint8Array,String,Number,Array,Object,Error,Symbol,
    localStorage:{getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)},
    KynectaE2EStore:{get:async k=>store.has(k)?store.get(k):null,set:async(k,v)=>{store.set(k,v)},del:async k=>{store.delete(k)}},
    KynectaRatchet:Ratchet,KynectaE2EIdentity:identity};
  ctx.window=ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(corePath,'utf8'),ctx);
  return {api:ctx.KynectaMessageE2E,store,ls};
}
async function run(label, core){
  const dir={}; const A=await makeDevice(1,dir,core), B=await makeDevice(2,dir,core);
  const send=async(from,to,t)=>from.api.encryptForChat(t,10,to);
  const recv=async(dev,from,enc,id)=>{try{return await dev.api.decryptFromChat(enc,10,from,false,id)}catch(e){return 'FAIL('+(e.code||e.message.slice(0,40))+')'}};
  const out=[];
  const a0=await send(A,2,'a0'), a1=await send(A,2,'a1');
  out.push(['B<-a0',await recv(B,1,a0,'a0')],['B<-a1',await recv(B,1,a1,'a1')]);
  const b0=await send(B,1,'b0');                       // B replies; A has NOT received it yet
  const a2=await send(A,2,'a2');                       // A keeps sending in its first chain
  out.push(['B<-a2',await recv(B,1,a2,'a2')]);
  out.push(['B<-a2 AGAIN (reload replays last msg)',await recv(B,1,a2,'a2')]);
  out.push(['A<-b0',await recv(A,2,b0,'b0')]);
  const a3=await send(A,2,'a3');                       // A is now in a NEW chain
  out.push(['B<-a3 (next genuine msg)',await recv(B,1,a3,'a3')]);
  out.push(['B<-a1 AGAIN (older chain replay)',await recv(B,1,a1,'a1')]);
  const b1=await send(B,1,'b1'); out.push(['A<-b1',await recv(A,2,b1,'b1')]);
  const a4=await send(A,2,'a4'); out.push(['B<-a4 (genuine, after replays)',await recv(B,1,a4,'a4')]);
  console.log('\n=== '+label); for(const [k,v] of out) console.log('  '+k.padEnd(42), v);
}
(async()=>{ await run('CURRENT core: duplicate deliveries must NOT corrupt the session (expect every line to be a plaintext or FAIL(E2E_REPLAY) for the two duplicates)', require('path').join(__dirname,'../js/message-e2e-core.js')); })();
