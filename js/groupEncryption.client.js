/**
 * Group-only E2E key lifecycle.
 * Exact-version key fetch/retry; reading history never rotates the group key.
 */
(function(global){
'use strict';
const cache=new Map(), inflight=new Map(), stateInflight=new Map();
const base=()=>String(global.__getApiBase?.()||global.API_BASE_URL||'').replace(/\/$/,'');
const token=()=>global.__kynToken||global.__accessToken||global.AuthSessionManager?.getToken?.()||global.authToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||'';
const me=()=>Number(global._kynCurrentUserId||localStorage.getItem('userId')||localStorage.getItem('currentUserId')||0);
function e2e(){if(!global.KynectaE2E)throw new Error('Secure messaging core is not loaded');return global.KynectaE2E}
async function request(path,opts){opts=opts||{};const headers=Object.assign({},opts.headers||{}),t=token();if(t)headers.Authorization='Bearer '+t;if(opts.body&&!headers['Content-Type'])headers['Content-Type']='application/json';let res=await fetch(base()+path,Object.assign({},opts,{headers}));if(res.status===401&&global.NecpaSessionResilience){try{if(await global.NecpaSessionResilience.refreshAccessToken(base())){const fresh=token();if(fresh)headers.Authorization='Bearer '+fresh;res=await fetch(base()+path,Object.assign({},opts,{headers}))}}catch(_){}}const data=await res.json().catch(()=>({}));if(!res.ok){const err=new Error(data.message||data.error||('Request failed ('+res.status+')'));err.status=res.status;err.payload=data;throw err}return data}
async function waitReady(timeout=20000){if(global.KynectaE2E?.enabled)return true;if(typeof global.__NECPRA_ENSURE_E2E==='function'){try{await global.__NECPRA_ENSURE_E2E()}catch(_){}}const started=Date.now();while(!global.KynectaE2E?.enabled&&Date.now()-started<timeout)await new Promise(r=>setTimeout(r,150));return!!global.KynectaE2E?.enabled}
function bucket(gid){const id=String(gid);if(!cache.has(id))cache.set(id,new Map());return cache.get(id)}
function storageKey(gid,v){return'kyn_group_key_v2_'+gid+'_'+v}
async function saveLocal(gid,v,rawB64,ownerId){try{const wrapped=await e2e().wrapForLocalStorage(rawB64);if(wrapped)localStorage.setItem(storageKey(gid,v),JSON.stringify({ownerId:Number(ownerId)||0,wrapped}))}catch(_){}}
async function loadLocal(gid,v){try{const raw=localStorage.getItem(storageKey(gid,v));if(!raw)return null;const obj=JSON.parse(raw),wrapped=obj?.wrapped||raw,rawB64=await e2e().unwrapFromLocalStorage(wrapped);return{key:await e2e().importSenderKey(rawB64),ownerId:Number(obj?.ownerId)||0}}catch(_){return null}}
async function fetchState(gid,force){const id=String(gid);if(!force&&stateInflight.has(id))return stateInflight.get(id);const p=request('/group-encryption/'+encodeURIComponent(id)+'/state').then(r=>r.data||{});stateInflight.set(id,p);try{return await p}finally{if(stateInflight.get(id)===p)stateInflight.delete(id)}}
function entryFor(state,v){v=Number(v);if(Number(state?.version)===v)return{version:v,ownerId:Number(state?.lastEvent?.actorId)||0,distributions:Array.isArray(state?.distributions)?state.distributions:[]};const hit=(Array.isArray(state?.history)?state.history:[]).find(x=>Number(x?.version)===v);if(!hit)return null;return{version:v,ownerId:Number(hit.actorId)||0,distributions:Array.isArray(hit.distributions)?hit.distributions:[]}}
async function installVersion(gid,state,v){v=Number(v);if(!Number.isInteger(v)||v<1)return null;const local=bucket(gid).get(v);if(local)return local;const persisted=await loadLocal(gid,v);if(persisted?.key){const installed={version:v,key:persisted.key,ownerId:persisted.ownerId||Number(entryFor(state,v)?.ownerId)||0};bucket(gid).set(v,installed);return installed}const entry=entryFor(state,v);if(!entry?.ownerId)return null;const mine=entry.distributions.find(d=>String(d?.userId)===String(me()));if(!mine?.ciphertext)return null;const rawB64=await e2e().decryptSenderKeyFrom(mine.ciphertext,entry.ownerId),installed={version:v,key:await e2e().importSenderKey(rawB64),ownerId:entry.ownerId};bucket(gid).set(v,installed);await saveLocal(gid,v,rawB64,entry.ownerId);return installed}
async function resolveMembers(gid,hint){let ids=Array.isArray(hint)?hint.map(Number):[];ids=ids.filter(Number.isInteger).filter(n=>n>0);if(!ids.length){try{const r=await request('/chats/'+encodeURIComponent(gid)),chat=r?.data?.chat||r?.data||{},list=Array.isArray(chat.participants)?chat.participants:[];ids=list.map(p=>Number((p?.user||p)?.id??p?.userId)).filter(Number.isInteger).filter(n=>n>0)}catch(_){}}ids=[...new Set(ids)];if(!ids.includes(me()))ids.push(me());return ids}
// FIX (group messages not going through): rotate() used to require EVERY
// member's public key to be reachable (8 retries each, ~5s max backoff) and
// throw GROUP_KEY_PROVISIONING_PENDING otherwise. ensureCurrentKey then
// retried the whole thing up to 12 times, and group.html re-queued the send
// every 5s forever — so one unreachable member (offline device, key not
// yet published, etc.) permanently blocked the entire group. Now rotate()
// makes one quick attempt per member, distributes to whoever answered, and
// proceeds as long as the sender's own copy succeeded — never blocks a send
// on a member who isn't reachable right now. Stragglers get topped up later
// via distributeMissing(), backed by POST /distribute.
let lastMissing=new Map();
async function rotate(gid,hint,state){
  const ids=await resolveMembers(gid,hint);
  if(!ids.length)throw new Error('Could not resolve group members for key distribution');
  const generated=await e2e().generateSenderKey(),distributions=[],missing=[];
  for(const userId of ids){
    let ciphertext=null,lastError=null;
    // Quick attempt only (was 8x with up to 5s backoff per member) — a
    // straggler no longer holds up everyone else's ability to send.
    for(let attempt=0;attempt<2;attempt++){
      try{ciphertext=await e2e().encryptSenderKeyFor(generated.rawB64,userId);if(ciphertext)break}
      catch(err){lastError=err;if(attempt<1)await new Promise(r=>setTimeout(r,400))}
    }
    if(!ciphertext){missing.push({userId,error:lastError?.message||'recipient key unavailable'});continue}
    distributions.push({userId,deviceId:'primary',ciphertext,algorithm:'SenderKey-ECDH-P256-AES256GCM-v1',distributorId:me()});
  }
  const selfMissing=missing.some(x=>String(x.userId)===String(me()));
  if(selfMissing||!distributions.length){
    // Only throw when we genuinely can't encrypt for ourselves — that's the
    // one case sending truly cannot proceed without.
    const err=new Error('Group encryption is waiting for your own device key: '+missing.map(x=>x.userId).join(', '));
    err.code='GROUP_KEY_PROVISIONING_PENDING';err.missingMembers=missing.map(x=>x.userId);throw err;
  }
  lastMissing.set(String(gid),missing.map(x=>x.userId));
  const version=Number(state?.version||0)+1;
  let result;
  try{result=await request('/group-encryption/'+encodeURIComponent(gid)+'/rotate',{method:'POST',body:JSON.stringify({version,algorithm:'SenderKey-ECDH-P256-AES256GCM-v1',distributions,reason:state?.reason||'initial_key'})})}
  catch(err){if(err.status===409){const fresh=await fetchState(gid,true),existing=await installVersion(gid,fresh,Number(fresh.version));if(existing)return existing}throw err}
  const data=result?.data||{},installed={version:Number(data.version||version),key:generated.key,ownerId:me()};
  bucket(gid).set(installed.version,installed);await saveLocal(gid,installed.version,generated.rawB64,me());
  try{await request('/group-encryption/'+encodeURIComponent(gid)+'/ack',{method:'POST',body:JSON.stringify({version:installed.version,deviceId:'primary'})})}catch(_){}
  return installed;
}
// Best-effort top-up: if this member already holds the current key and the
// server says other members are still missing it, try (quickly, once) to
// wrap it for them too and post it via /distribute — without re-rotating,
// so it never disrupts anyone already sending/receiving on this version.
async function distributeMissing(gid){
  const id=String(gid);
  let state;
  try{state=await fetchState(id,true)}catch(_){return{added:[],missing:[]}}
  const version=Number(state?.version||0);
  const missingIds=Array.isArray(state?.missingMemberIds)?state.missingMemberIds.map(Number):[];
  lastMissing.set(id,missingIds);
  if(!version||!missingIds.length)return{added:[],missing:missingIds};
  const held=bucket(id).get(version)||await loadLocal(id,version);
  if(!held?.key)return{added:[],missing:missingIds}; // we don't hold this version ourselves
  let rawB64;
  try{rawB64=await e2e().exportSenderKey(held.key)}catch(_){return{added:[],missing:missingIds}}
  const distributions=[],stillMissing=[];
  for(const userId of missingIds){
    try{const ciphertext=await e2e().encryptSenderKeyFor(rawB64,userId);if(ciphertext)distributions.push({userId,deviceId:'primary',ciphertext,algorithm:'SenderKey-ECDH-P256-AES256GCM-v1',distributorId:me()});else stillMissing.push(userId)}
    catch(_){stillMissing.push(userId)}
  }
  if(!distributions.length)return{added:[],missing:stillMissing};
  try{
    const r=await request('/group-encryption/'+encodeURIComponent(id)+'/distribute',{method:'POST',body:JSON.stringify({version,distributions})});
    const added=(r?.data?.added||[]).map(Number);
    lastMissing.set(id,stillMissing.concat(missingIds.filter(x=>!added.includes(Number(x))&&!distributions.some(d=>Number(d.userId)===Number(x)))));
    return{added,missing:stillMissing};
  }catch(_){return{added:[],missing:missingIds}}
}
function getMissingMembers(gid){return lastMissing.get(String(gid))||[]}
async function ensureCurrentKey(gid,hint){
  const id=String(gid);if(inflight.has(id))return inflight.get(id);
  const p=(async()=>{
    if(!(await waitReady()))throw new Error('Secure messaging is still unlocking; group send is queued.');
    for(let attempt=0;attempt<12;attempt++){
      const state=await fetchState(id,true),current=Number(state.version||0);
      if(current>0&&!state.pendingRotation){const installed=await installVersion(id,state,current);if(installed)return installed}
      try{return await rotate(id,hint,state)}
      catch(err){if(err?.code!=='GROUP_KEY_PROVISIONING_PENDING')throw err;await new Promise(r=>setTimeout(r,Math.min(1500*(attempt+1),8000)))}
    }
    const err=new Error('Group encryption keys are still synchronizing; send remains queued until member keys are available.');
    err.code='GROUP_KEY_PROVISIONING_TIMEOUT';throw err;
  })();
  inflight.set(id,p);try{return await p}finally{if(inflight.get(id)===p)inflight.delete(id)}
}
async function encryptForGroup(gid,plaintext,hint){const installed=await ensureCurrentKey(gid,hint),env=JSON.parse(await e2e().encryptGroupMessage(plaintext,installed.key,installed.version));env.owner=Number(installed.ownerId||me());env.group=String(gid);return JSON.stringify(env)}
async function decryptForGroup(gid,ciphertext){if(!ciphertext||typeof ciphertext!=='string')return ciphertext;let envelope;try{envelope=JSON.parse(ciphertext)}catch(_){return ciphertext}if(!envelope||envelope.v!==1||!Number.isInteger(Number(envelope.gen)))return ciphertext;if(!(await waitReady()))throw new Error('Secure group messaging is not ready yet');const version=Number(envelope.gen);let state=await fetchState(gid,false),installed=await installVersion(gid,state,version);if(!installed){state=await fetchState(gid,true);installed=await installVersion(gid,state,version)}if(!installed)throw new Error('Group key version '+version+' is not available for this member');let plain=await e2e().decryptGroupMessage(ciphertext,installed.key);if(plain==='[Decryption failed]'){bucket(gid).delete(version);state=await fetchState(gid,true);installed=await installVersion(gid,state,version);if(installed)plain=await e2e().decryptGroupMessage(ciphertext,installed.key)}if(plain==='[Decryption failed]')throw new Error('Group ciphertext authentication failed');return plain}
async function rotateSenderKey(gid,hint){bucket(String(gid)).clear();return ensureCurrentKey(String(gid),hint)}
global.KynectaGroupE2E={ensureGroupKey:ensureCurrentKey,encryptForGroup,decryptForGroup,rotateSenderKey,distributeMissing,getMissingMembers};
console.log('[KynectaGroupE2E] Loaded — exact-version group key fetch/retry active')
})(window);
