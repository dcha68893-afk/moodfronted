/* Kynecta group-only Sender Keys v2. Independent from direct-message encryption. */
(function(global){
'use strict';
const PIPELINE='KYN-GROUP-V2',ALGORITHM='SenderKey-AES256GCM-v2';
const states=new Map(),stateFetch=new Map(),te=new TextEncoder(),td=new TextDecoder(),subtle=crypto.subtle;
const base=()=>String(global.__getApiBase?.()||global.API_BASE_URL||'').replace(/\/$/,'');
const token=()=>global.__kynToken||global.__accessToken||global.AuthSessionManager?.getToken?.()||global.authToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||'';
const jwtUserId=()=>{try{const p=String(token()).split('.')[1];if(!p)return 0;const j=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));return Number(j.userId??j.id??j.sub)||0}catch(_){return 0}};
/* FIX (own sender key could not be prepared): this used to read only window._kynCurrentUserId (set by message-client.js in a
   DIFFERENT frame, so always empty here) or two localStorage keys. If those were missing, ownerId became 0, which is never in the
   member list, so the owner's own key wrap was never produced. Fall back to the E2E layer, then to the access token itself. */
const me=()=>{const c=[()=>global._kynCurrentUserId,()=>global.KynectaE2E?.getMyUserId?.(),()=>localStorage.getItem('userId'),()=>localStorage.getItem('currentUserId'),jwtUserId];for(const f of c){try{const n=Number(f());if(Number.isInteger(n)&&n>0)return n}catch(_){}}return 0};
const withSelf=list=>{const ids=(Array.isArray(list)?list:[]).map(Number).filter(n=>Number.isInteger(n)&&n>0),m=me();if(m>0&&!ids.includes(m))ids.push(m);return[...new Set(ids)]};
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(path,opt={}){const h={...(opt.headers||{})},t=token();if(t)h.Authorization='Bearer '+t;if(opt.body)h['Content-Type']='application/json';let r=await fetch(base()+path,{...opt,headers:h});if(r.status===401&&global.NecpaSessionResilience){try{if(await global.NecpaSessionResilience.refreshAccessToken(base())){const nt=token();if(nt)h.Authorization='Bearer '+nt;r=await fetch(base()+path,{...opt,headers:h})}}catch(_){}}
const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.message||'Group request failed');Object.assign(e,d);throw e}return d}
const idkey=(g,e,o)=>`kyn_gsk_v2_${g}_${e}_${o}`;
/* ROOT-CAUSE FIX (GROUP-GATE-KEPT-FLIPPING-BETWEEN-TWO-IDENTITY-OBJECTS, round 2):
   A previous pass "fixed" this by making readiness require the LEGACY identity
   (window.KynectaE2E: .enabled + getMyIdentityPrivateKey() + wrapForLocalStorage) to match
   what identity()/publicKey() below read from — reasoning that since the code reads legacy,
   the gate should check legacy too. That direction is backwards and is exactly what produced
   "Secure messaging is still unlocking. Please try again in a moment." forever for some
   accounts: window.KynectaE2E.enabled is the DM *server-registration-confirmed* gate (see
   e2e-encryption.js's own FIX-REGISTRATION-CONFIRMATION-GATE comment) — group.html's own
   long-standing comment above ensureE2EReady() already documents that this exact gate was
   wrong once before ("Group readiness is now based on the actual local identity private key,
   not the DM registration status") — yet legacyReady() below reintroduced requiring it.
   Direct messages never wait on window.KynectaE2E at all: js/message-e2e-core.js's
   ensureIdentity() unlocks purely through window.KynectaE2EIdentity (the canonical layer),
   which is why 1:1 chat keeps working no matter what state the legacy object is in. Group
   crypto must wait on and read from that SAME canonical identity — not a second object that
   can legitimately lag behind it (registration confirmation, background retry) or never
   resolve independently of it — so this file can never again disagree with the identity
   group.html's ensureE2EReady() has already decided is ready. */
const sessionPw=()=>{try{return !!sessionStorage.getItem('kyn_e2e_pw_session')}catch(_){return false}};
let unlockFailed=false,lastBootstrapError=null,lastBootstrapAt=0;
try{document.addEventListener('kyn:e2eUnlockFailed',()=>{unlockFailed=true});document.addEventListener('kyn:e2eUnlocked',()=>{unlockFailed=false;lastBootstrapError=null})}catch(_){}
const canonicalReady=()=>{try{const id=global.KynectaE2EIdentity;return !!(id&&id.privateKey&&id.publicKey)}catch(_){return false}};
function diagnose(){
  const id=global.KynectaE2EIdentity,ready=canonicalReady();let reason='ready';
  if(!ready){
    if(!sessionPw())reason='no_session_password';
    else if(unlockFailed||/would not unlock|wrong password|password/i.test(String(lastBootstrapError||'')))reason='password_mismatch';
    else reason='unlocking';
  }
  return{ready,reason,passwordInSession:sessionPw(),canonicalEnabled:!!id?.enabled,hasPrivateKey:!!id?.privateKey,hasPublicKey:!!id?.publicKey,unlockFailed,lastError:lastBootstrapError};
}
// ROOT-CAUSE FIX (GROUP SEND STUCK ON "Secure messaging is still unlocking", esp. for a
// member whose identity has never been registered on this device before):
// 1) Direct messages (js/message-e2e-core.js's ensureIdentity()) never impose their own
//    timeout — they just await KynectaMessageE2EReady()/identity.init() for as long as it
//    takes, including the one-time POST /api/encryption/keys registration call a brand-new
//    identity must make, which can legitimately take far longer than a few seconds behind a
//    cold Render backend (the same cold-start latency js/message-client.js's own send
//    watchdog was separately raised to 50000ms to tolerate — see that file). This function
//    invented its OWN hard 8-second cap on top of that shared bootstrap, so a member sending
//    for the first time on a device was being told "still unlocking" and left stuck well
//    before their identity registration had actually finished in the background — it was
//    never actually stuck, just cut off early.
// 2) Separately, `global.KynectaMessageE2EReady` is defined by js/e2e-session-init.js, which
//    loads with the `defer` attribute — so at the exact moment this function first runs (e.g.
//    a member opens a group and sends immediately) that function can still be undefined. The
//    old code only ever checked for it ONCE, before starting the wait, so on that race it
//    silently never triggered the bootstrap at all and spent the whole budget polling a
//    promise nobody had started. Checking on every loop iteration instead means the bootstrap
//    gets kicked off the instant it becomes available, however late that is.
async function waitReady(){
  if(canonicalReady())return true;
  const deadline=Date.now()+50000; // matches message-client.js's established Render cold-start tolerance
  let inflight=false;
  while(Date.now()<deadline){
    if(canonicalReady())return true;
    /* FIX (bootstrap was attempted ONCE per wait): if that single attempt failed (network blip, cold backend, token or
       user id not yet available, session secret restored a moment late) nothing ever retried it, so the wait just spun
       for the full budget and then gave up for good. Re-run the canonical bootstrap every ~4s while waiting. A failed
       attempt resets its own cache (see e2e-session-init.js), so each retry is a genuine new attempt. */
    if(!inflight&&typeof global.KynectaMessageE2EReady==='function'&&Date.now()-lastBootstrapAt>4000){
      inflight=true;lastBootstrapAt=Date.now();
      global.KynectaMessageE2EReady().then(()=>{lastBootstrapError=null}).catch(err=>{lastBootstrapError=err?.message||String(err);console.warn('[KynectaGroupE2E] canonical identity bootstrap failed:',lastBootstrapError)}).finally(()=>{inflight=false});
    }
    /* FIX: when unlocking is impossible without the person (no secret at all, or the stored key rejects the secret we
       have), waiting 50s cannot help. Stop early so the UI can tell them to sign in again instead of spinning. */
    if(lastBootstrapError&&!inflight){const r=diagnose().reason;if(r==='no_session_password'||r==='password_mismatch')break}
    await sleep(250);
  }
  const d=diagnose();if(!d.ready)console.warn('[KynectaGroupE2E] not ready:',d.reason,d);
  return d.ready;
}
function identity(){const p=global.KynectaE2EIdentity?.privateKey;if(!p)throw new Error('Group identity key is not ready');return p}
async function publicKey(userId){const imp=b=>subtle.importKey('spki',unb64(b),{name:'ECDH',namedCurve:'P-256'},true,[]);
/* Your own public key is already held locally by the canonical E2E identity layer (the same SPKI the server stores, and the same
   layer identity()/waitReady() above now use). Using it for the owner wrap/unwrap means preparing your own sender key can never
   fail on a network call, a missing server key row, or an authorization check. */
if(Number(userId)===me()){const own=global.KynectaE2EIdentity?.publicKey;if(own){try{return await imp(own)}catch(_){}}}
const r=await req('/encryption/keys/'+encodeURIComponent(userId)),p=r?.data?.publicKey;if(!p)throw new Error('Member '+userId+' has no registered identity key');return imp(p)}
async function wrapKey(rawB64,recipientId){const bits=await subtle.deriveBits({name:'ECDH',public:await publicKey(recipientId)},identity(),256),mat=await subtle.importKey('raw',bits,{name:'HKDF'},false,['deriveKey']),key=await subtle.deriveKey({name:'HKDF',salt:new Uint8Array(32),info:te.encode('KYN-GROUP-V2/SENDER-KEY-WRAP'),hash:'SHA-256'},mat,{name:'AES-GCM',length:256},false,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),ct=await subtle.encrypt({name:'AES-GCM',iv},key,te.encode(rawB64));return JSON.stringify({v:2,iv:b64(iv),ct:b64(ct)})}
async function unwrapKey(envelope,ownerId){const e=typeof envelope==='string'?JSON.parse(envelope):envelope;if(e?.v!==2)throw new Error('Unsupported group key envelope');const bits=await subtle.deriveBits({name:'ECDH',public:await publicKey(ownerId)},identity(),256),mat=await subtle.importKey('raw',bits,{name:'HKDF'},false,['deriveKey']),key=await subtle.deriveKey({name:'HKDF',salt:new Uint8Array(32),info:te.encode('KYN-GROUP-V2/SENDER-KEY-WRAP'),hash:'SHA-256'},mat,{name:'AES-GCM',length:256},false,['encrypt','decrypt']),pt=await subtle.decrypt({name:'AES-GCM',iv:unb64(e.iv)},key,unb64(e.ct));return td.decode(pt)}
async function hmac(raw,label){const k=await subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await subtle.sign('HMAC',k,te.encode(label)))}
const aesKey=raw=>subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
// Local sender-key-state cache: prefer the canonical identity's own at-rest wrap key
// (derived unconditionally inside KynectaE2EIdentity.init(), so it's reliably available
// whenever waitReady() above has passed) and fall back to the legacy wrapper only for
// reading a cache entry a previous version of this file wrote — a miss here just means
// re-fetching the sender key from the server, never a broken send.
async function wrapLocal(plaintextB64){
  try{const w=await global.KynectaE2EIdentity?.wrapAtRest?.(plaintextB64);if(w)return w}catch(_){}
  try{return await global.KynectaE2E?.wrapForLocalStorage?.(plaintextB64)}catch(_){return null}
}
async function unwrapLocal(wrappedJson){
  try{const r=await global.KynectaE2EIdentity?.unwrapAtRest?.(wrappedJson);if(r)return r}catch(_){}
  return global.KynectaE2E.unwrapFromLocalStorage(wrappedJson);
}
async function saveState(st){try{const p=JSON.stringify({chain:b64(st.chain),privateJwk:st.privateJwk||null,publicJwk:st.publicJwk||null,iteration:st.iteration}),w=await wrapLocal(b64(te.encode(p)));if(w)localStorage.setItem(idkey(st.groupId,st.epoch,st.ownerId),w)}catch(_){}}
async function loadState(g,e,o){try{const w=localStorage.getItem(idkey(g,e,o));if(!w)return null;const raw=await unwrapLocal(w),x=JSON.parse(td.decode(unb64(raw))),priv=x.privateJwk?await subtle.importKey('jwk',x.privateJwk,{name:'ECDSA',namedCurve:'P-256'},true,['sign']):null;return{groupId:Number(g),epoch:Number(e),ownerId:Number(o),chain:unb64(x.chain),privateKey:priv,privateJwk:x.privateJwk||null,publicJwk:x.publicJwk||null,iteration:Number(x.iteration)||0,skipped:new Map()}}catch(_){return null}}
async function createSenderState(g,e){const kp=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),priv=await subtle.exportKey('jwk',kp.privateKey),pub=await subtle.exportKey('jwk',kp.publicKey);return{groupId:Number(g),epoch:Number(e),ownerId:me(),chain:crypto.getRandomValues(new Uint8Array(32)),privateKey:kp.privateKey,privateJwk:priv,publicJwk:pub,iteration:0,skipped:new Map()}}
async function state(g,force=false){const k=String(g);if(!force&&stateFetch.has(k))return stateFetch.get(k);const p=req('/group-messages/'+encodeURIComponent(g)+'/crypto/state').then(x=>x.data||{});stateFetch.set(k,p);try{return await p}finally{if(stateFetch.get(k)===p)stateFetch.delete(k)}}
function keyEntry(s,e,o){const cur=(s?.senderKeys||[]).find(x=>Number(x.epoch)===Number(e)&&Number(x.ownerId)===Number(o));if(cur)return cur;for(const h of(s?.history||[])){const x=(h.senderKeys||[]).find(y=>Number(y.epoch)===Number(e)&&Number(y.ownerId)===Number(o));if(x)return x}return null}
async function liveMembers(g,fallback=[]){try{const r=await req('/chats/'+encodeURIComponent(g));const c=r?.data?.chat||r?.data?.group||r?.data||{};const p=Array.isArray(c.participants)?c.participants:[];const ids=[...new Set(p.map(x=>Number(x?.user?.id??x?.userId??x?.id)).filter(Number.isInteger).filter(n=>n>0))];if(ids.length)return ids}catch(_){}return [...new Set((fallback||[]).map(Number).filter(n=>Number.isInteger(n)&&n>0))]}
async function distribute(g,e,st,members){const live=withSelf(await liveMembers(g,members));if(!live.length)throw new Error('No current group members are available for sender-key distribution');const raw=b64(te.encode(JSON.stringify({chain:b64(st.chain),publicJwk:st.publicJwk}))),ds=[],failed=[];for(const id of live){try{ds.push({userId:id,deviceId:'primary',ciphertext:await wrapKey(raw,id),algorithm:ALGORITHM})}catch(error){failed.push({userId:id,message:error?.message||'Recipient key unavailable'})}}if(!ds.some(d=>Number(d.userId)===Number(st.ownerId))){const sf=failed.find(f=>Number(f.userId)===Number(st.ownerId));throw new Error('Your own group sender key could not be prepared'+(sf?': '+sf.message:(st.ownerId>0?'':': your user id could not be determined')))}await req('/group-messages/'+encodeURIComponent(g)+'/crypto/rotate',{method:'POST',body:JSON.stringify({epoch:e,distributions:ds})});states.set(idkey(g,e,st.ownerId),st);await saveState(st);return st}
async function ensureSenderKey(g,members){if(!(await waitReady()))throw new Error('Secure group identity is not ready');const gid=Number(g),owner=me(),live=withSelf(await liveMembers(gid,members));if(!owner)throw new Error('Your account id is not available yet; retry in a moment');if(!live.length)throw new Error('No current group members are available for sender-key distribution');for(let attempt=0;attempt<4;attempt++){const s=await state(gid,true),epoch=Math.max(1,Number(s.epoch)||1),entry=keyEntry(s,epoch,owner);let st=states.get(idkey(gid,epoch,owner))||await loadState(gid,epoch,owner);const missing=Array.isArray(s?.missingMemberIds)?s.missingMemberIds.map(Number).filter(Boolean):[];if(entry?.distribution&&!st)st=await getReceiverState(gid,epoch,owner);if(st&&entry?.distribution&&!missing.includes(owner)){states.set(idkey(gid,epoch,owner),st);return st}if(st){try{return await distribute(gid,epoch,st,live)}catch(e){if(e.code==='GROUP_SENDER_KEY_INCOMPLETE'||e.code==='GROUP_SENDER_KEY_EPOCH_MISMATCH'||e.status===409){await sleep(500);continue}throw e}}st=await createSenderState(gid,epoch);try{return await distribute(gid,epoch,st,live)}catch(e){if(e.code==='GROUP_SENDER_KEY_INCOMPLETE'||e.code==='GROUP_SENDER_KEY_EPOCH_MISMATCH'||e.status===409){await sleep(500);continue}throw e}}throw new Error('Group sender key is still synchronizing; retry in a moment')}
async function getReceiverState(g,e,o){const k=idkey(g,e,o);let st=states.get(k)||await loadState(g,e,o);if(st){states.set(k,st);return st}const s=await state(g,true),entry=keyEntry(s,e,o);if(!entry?.distribution)throw new Error('Sender key for this group message is not available');const raw=await unwrapKey(entry.distribution.ciphertext,o),b=JSON.parse(td.decode(unb64(raw)));st={groupId:Number(g),epoch:Number(e),ownerId:Number(o),chain:unb64(b.chain),privateKey:null,privateJwk:null,publicJwk:b.publicJwk||null,iteration:0,skipped:new Map()};states.set(k,st);await saveState(st);try{await req('/group-messages/'+encodeURIComponent(g)+'/crypto/ack',{method:'POST',body:JSON.stringify({ownerId:o,epoch:e})})}catch(_){/* key is installed locally; acknowledgement can retry during next sync */}return st}
const signInput=(g,e,o,i,iv,ct)=>te.encode([PIPELINE,g,e,o,i,iv,ct].join('|'));
async function encryptForGroup(g,plaintext,members){const st=await ensureSenderKey(g,members),i=st.iteration,mk=await hmac(st.chain,'message:'+i),next=await hmac(st.chain,'chain:'+i),key=await aesKey(mk),iv=crypto.getRandomValues(new Uint8Array(12)),ct=await subtle.encrypt({name:'AES-GCM',iv},key,te.encode(String(plaintext))),ivb=b64(iv),ctb=b64(ct),sig=await subtle.sign({name:'ECDSA',hash:{name:'SHA-256'}},st.privateKey,signInput(g,st.epoch,st.ownerId,i,ivb,ctb));st.chain=next;st.iteration++;await saveState(st);return JSON.stringify({v:2,pipeline:PIPELINE,algorithm:ALGORITHM,group:String(g),epoch:st.epoch,owner:st.ownerId,iteration:i,iv:ivb,ct:ctb,sig:b64(sig),publicKey:st.publicJwk})}
async function decryptForGroup(g,ciphertext){let e;try{e=JSON.parse(ciphertext)}catch(_){return ciphertext}if(!e||e.v!==2||e.pipeline!==PIPELINE)return ciphertext;const st=await getReceiverState(g,Number(e.epoch),Number(e.owner)),pub=await subtle.importKey('jwk',e.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']),ok=await subtle.verify({name:'ECDSA',hash:{name:'SHA-256'}},pub,unb64(e.sig),signInput(g,e.epoch,e.owner,e.iteration,e.iv,e.ct));if(!ok)throw new Error('Group message signature verification failed');let mk;if(Number(e.iteration)<st.iteration){mk=st.skipped.get(Number(e.iteration));if(!mk)throw new Error('Group message is too old for this sender-key state')}else{while(st.iteration<Number(e.iteration)){const x=await hmac(st.chain,'message:'+st.iteration);st.chain=await hmac(st.chain,'chain:'+st.iteration);st.skipped.set(st.iteration,x);if(st.skipped.size>200)st.skipped.delete(st.skipped.keys().next().value);st.iteration++}mk=await hmac(st.chain,'message:'+st.iteration);st.chain=await hmac(st.chain,'chain:'+st.iteration);st.iteration++}const pt=await subtle.decrypt({name:'AES-GCM',iv:unb64(e.iv)},await aesKey(mk),unb64(e.ct));await saveState(st);return td.decode(pt)}
async function distributeMissing(g){const gid=Number(g),owner=me(),s=await state(gid,true),epoch=Math.max(1,Number(s.epoch)||1),entry=keyEntry(s,epoch,owner),st=states.get(idkey(gid,epoch,owner))||await loadState(gid,epoch,owner);if(!st||!entry?.distribution)return{missing:Array.isArray(s?.missingMemberIds)?s.missingMemberIds:[]};const live=await liveMembers(gid,[]);const missing=(Array.isArray(s?.missingMemberIds)?s.missingMemberIds:[]).map(Number).filter(id=>live.includes(id));if(!missing.length)return{missing:[]};await distribute(gid,epoch,st,live);return{missing:[]}}
global.KynectaGroupE2E={ensureSenderKey,encryptForGroup,decryptForGroup,distributeMissing,waitUntilReady:waitReady,diagnose,initGroup:async g=>{if(!(await waitReady()))throw new Error('Group identity is not unlocked');try{await state(g,true)}catch(err){console.warn('[KynectaGroupE2E] initial group crypto state unavailable:',err?.message||err)}return true}};
console.log('[KynectaGroupE2E] Group-only Sender Keys v2 loaded');
})(window);