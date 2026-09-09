/* Compatibility bridge for canonical DM E2E. */
(function (global) {
  'use strict';
  function b64ToBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
  function enc(s){return new TextEncoder().encode(String(s));}
  function legacyContext(peerId,meId,chatId){if(meId&&peerId)return `kynecta-chat-${[String(meId),String(peerId)].sort().join(':')}`;return `kynecta-chat-${String(chatId||'')}`;}
  function peerFor(m,current,active){const me=current!=null?String(current):String(global.KynectaMessageE2E?.getMyUserId?.()||'');const s=m?.senderId!=null?String(m.senderId):(m?.sender?.id!=null?String(m.sender.id):null);const r=m?.receiverId!=null?String(m.receiverId):(m?.recipientId!=null?String(m.recipientId):null);if(s&&me&&s===me)return r||String(active?.otherUserId||active?.friendId||'');return s;}
  function parse(c){if(typeof c!=='string')return null;try{const o=JSON.parse(c);return o&&typeof o==='object'?o:null;}catch(_){return null;}}
  function isV1(c){const o=parse(c);return !!o&&o.v===1&&o.iv&&o.ct;}
  function isV2(c){const o=parse(c);return !!o&&o.v===2&&o.iv&&o.ct&&o.spk&&o.rpk;}
  function encryptedEnvelope(c){const o=parse(c);if(!o||!('v'in o))return false;if(o.ct||o.iv)return true;if(o.devices&&typeof o.devices==='object')return Object.values(o.devices).some(d=>d&&('ct'in d||'iv'in d));return'mid'in o||'sid'in o||'kid'in o;}
  async function decryptWithPrivate(privateKey,peerKey,env,info,aad){const identity=global.KynectaE2EIdentity;const shared=await crypto.subtle.deriveBits({name:'ECDH',public:peerKey},privateKey,256);const key=await identity.hkdf(shared,info);const p={name:'AES-GCM',iv:b64ToBytes(env.iv),tagLength:128};if(aad)p.additionalData=enc(aad);return new TextDecoder().decode(await crypto.subtle.decrypt(p,key,b64ToBytes(env.ct)));}
  function install(){
    const dm=global.KynectaMessageE2E,identity=global.KynectaE2EIdentity;if(!dm||!identity)return false;if(dm.__legacyCompatibilityInstalled)return true;
    const original=dm.decryptFromChat.bind(dm),cache=new Map(),failures=new Set(),attempts=new Map();
    async function legacyDecrypt(c,chat,peer){const env=parse(c),entry=await identity.publicKeyFor(peer),me=String(identity.userId||dm.getMyUserId?.()||''),priv=identity.privateKey||global.KynectaE2E?.getMyIdentityPrivateKey?.();if(!priv)throw new Error('E2E identity is unavailable');try{return await decryptWithPrivate(priv,entry.key,env,legacyContext(peer,me,chat));}catch(_){return decryptWithPrivate(priv,entry.key,env,`kynecta-chat-${String(chat||'')}`);}}
    dm.decryptFromChat=async function(c,chat,peer,own){if(isV1(c))return legacyDecrypt(c,chat,peer);if(isV2(c))return original(c,chat,peer,own);return c;};
    dm.decryptMessageForDisplay=async function(m,chat,current,opts={}){
      const c=m?.content,id=String(m?.id||m?.localId||m?.serverId||`${chat}:${c||''}`),env=parse(c);
      if(!isV1(c)&&!isV2(c)){if(encryptedEnvelope(c)){failures.add(id);return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;}return typeof c==='string'?c:(c||'');}
      if(cache.has(id))return cache.get(id);if(attempts.has(id))return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;
      const peer=peerFor(m,current,opts.activeConversation);if(!peer){failures.add(id);return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;}
      const me=current!=null?String(current):String(dm.getMyUserId?.()||identity.userId||''),sender=m?.senderId!=null?String(m.senderId):(m?.sender?.id!=null?String(m.sender.id):null),own=!!(sender&&me&&sender===me);attempts.set(id,0);
      try{let last=null;for(let i=0;i<5;i++){attempts.set(id,i+1);try{const text=await dm.decryptFromChat(c,chat,peer,own);if(typeof text==='string'&&text&&!/^\[Encrypted|^\[Decryption failed/.test(text)){cache.set(id,text);failures.delete(id);attempts.delete(id);opts.onResolved?.(text);try{document.dispatchEvent(new CustomEvent('kyn:messageDecrypted',{detail:{messageId:id,chatId:chat,plaintext:text}}));}catch(_){}return text;}last=new Error(text||'Decryption failed');}catch(e){last=e;}await new Promise(r=>setTimeout(r,Math.min(500*(i+1),1500)));}throw last||new Error('Decryption failed');}
      catch(e){attempts.delete(id);failures.add(id);try{console.warn('[E2E] decrypt failed',{messageId:id,chatId:chat,peer,envelopeVersion:env?.v,senderKeyId:env?.kid,recipientKeyId:env?.rkid,myUserId:identity.userId,myKeyId:identity.keyId,isOwnMessage:own,error:e?.message||String(e)});}catch(_){}try{document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed',{detail:{messageId:id,error:e?.message||String(e)}}));}catch(_){}return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;}
    };
    dm.isMessageQueued=m=>attempts.has(String(m?.id||m?.localId||m?.serverId||m||''));dm.isMessageFailed=m=>failures.has(String(m?.id||m?.localId||m?.serverId||m||''));dm.peekDecryptedText=m=>cache.get(String(m?.id||m?.localId||m?.serverId||''))??null;dm.retryDecrypt=async(chat,m)=>{const id=String(m?.id||m?.localId||m?.serverId||'');cache.delete(id);failures.delete(id);attempts.delete(id);return dm.decryptMessageForDisplay(m,chat,dm.getMyUserId?.(),{});};dm.__legacyCompatibilityInstalled=true;return true;
  }
  if(!install())document.addEventListener('kyn:canonicalMessageE2EReady',install,{once:true});
})(window);
