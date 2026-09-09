/* Compatibility bridge for canonical DM E2E. */
(function (global) {
  'use strict';
  function b64ToBytes(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
  function enc(s) { return new TextEncoder().encode(String(s)); }
  function legacyContext(peerId, meId, chatId) { if (meId && peerId) return `kynecta-chat-${[String(meId), String(peerId)].sort().join(':')}`; return `kynecta-chat-${String(chatId || '')}`; }
  function peerFor(message, currentUserId, activeConversation) {
    const me = currentUserId != null ? String(currentUserId) : String(global.KynectaMessageE2E?.getMyUserId?.() || '');
    const sender = message?.senderId != null ? String(message.senderId) : (message?.sender?.id != null ? String(message.sender.id) : null);
    const receiver = message?.receiverId != null ? String(message.receiverId) : (message?.recipientId != null ? String(message.recipientId) : null);
    if (sender && me && sender === me) return receiver || String(activeConversation?.otherUserId || activeConversation?.friendId || '');
    return sender;
  }
  function parse(content) { if (typeof content !== 'string') return null; try { const o=JSON.parse(content); return o && typeof o==='object' ? o : null; } catch (_) { return null; } }
  function isV1(content) { const o=parse(content); return !!o && o.v===1 && o.iv && o.ct; }
  function isV2(content) { const o=parse(content); return !!o && o.v===2 && o.iv && o.ct && o.spk && o.rpk; }
  function isEncryptedEnvelope(content) { const o=parse(content); if(!o || !('v' in o)) return false; if(o.ct||o.iv) return true; if(o.devices&&typeof o.devices==='object') return Object.values(o.devices).some(d=>d&&('ct' in d||'iv' in d)); return 'mid' in o||'sid' in o||'kid' in o; }
  async function decryptWithPrivate(privateKey, peerKey, envelope, info, aad) {
    const identity=global.KynectaE2EIdentity;
    const shared=await crypto.subtle.deriveBits({name:'ECDH',public:peerKey},privateKey,256);
    const key=await identity.hkdf(shared,info);
    const params={name:'AES-GCM',iv:b64ToBytes(envelope.iv),tagLength:128}; if(aad) params.additionalData=enc(aad);
    return new TextDecoder().decode(await crypto.subtle.decrypt(params,key,b64ToBytes(envelope.ct)));
  }
  function install() {
    const dm=global.KynectaMessageE2E, identity=global.KynectaE2EIdentity;
    if(!dm||!identity) return false; if(dm.__legacyCompatibilityInstalled) return true;
    const originalDecryptFromChat=dm.decryptFromChat.bind(dm), cache=new Map(), failures=new Set(), attempts=new Map();
    async function legacyDecrypt(content,chatId,peerUserId){
      const env=parse(content), entry=await identity.publicKeyFor(peerUserId), me=String(identity.userId||dm.getMyUserId?.()||''), privateKey=identity.privateKey||global.KynectaE2E?.getMyIdentityPrivateKey?.();
      if(!privateKey) throw new Error('E2E identity is unavailable');
      try{return await decryptWithPrivate(privateKey,entry.key,env,legacyContext(peerUserId,me,chatId));}
      catch(_){return decryptWithPrivate(privateKey,entry.key,env,`kynecta-chat-${String(chatId||'')}`);}
    }
    dm.decryptFromChat=async function(encContent,chatId,peerUserId,isOwnMessage){
      if(isV1(encContent)) return legacyDecrypt(encContent,chatId,peerUserId);
      if(isV2(encContent)) return originalDecryptFromChat(encContent,chatId,peerUserId,isOwnMessage);
      return encContent;
    };
    dm.decryptMessageForDisplay=async function(message,chatId,currentUserId,opts={}){
      const content=message?.content,id=String(message?.id||message?.localId||message?.serverId||`${chatId}:${content||''}`), env=parse(content);
      if(!isV1(content)&&!isV2(content)){
        if(isEncryptedEnvelope(content)){failures.add(id); try{document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed',{detail:{messageId:id,error:'Unsupported encrypted envelope'}}));}catch(_){} return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;}
        return typeof content==='string'?content:(content||'');
      }
      if(cache.has(id)) return cache.get(id); if(attempts.has(id)) return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;
      const peer=peerFor(message,currentUserId,opts.activeConversation); if(!peer){failures.add(id);return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;}
      const me= currentUserId!=null?String(currentUserId):String(dm.getMyUserId?.()||identity.userId||'');
      const sender=message?.senderId!=null?String(message.senderId):(message?.sender?.id!=null?String(message.sender.id):null);
      const own=!!(sender&&me&&sender===me); attempts.set(id,0);
      try{
        let last=null;
        for(let i=0;i<5;i++){
          attempts.set(id,i+1);
          try{const text=await dm.decryptFromChat(content,chatId,peer,own); if(typeof text==='string'&&text&&!/^\[Encrypted|^\[Decryption failed/.test(text)){cache.set(id,text);failures.delete(id);attempts.delete(id);opts.onResolved?.(text);try{document.dispatchEvent(new CustomEvent('kyn:messageDecrypted',{detail:{messageId:id,chatId,plaintext:text}}));}catch(_){}return text;} last=new Error(text||'Decryption failed');}catch(e){last=e;}
          await new Promise(r=>setTimeout(r,Math.min(500*(i+1),1500)));
        }
        throw last||new Error('Decryption failed');
      }catch(e){
        attempts.delete(id);failures.add(id);
        try{console.warn('[E2E] decrypt failed',{messageId:id,chatId,peer,envelopeVersion:env?.v,senderKeyId:env?.kid,recipientKeyId:env?.rkid,myUserId:identity.userId,myKeyId:identity.keyId,isOwnMessage:own,error:e?.message||String(e)});}catch(_){ }
        try{document.dispatchEvent(new CustomEvent('kyn:messageDecryptFailed',{detail:{messageId:id,error:e?.message||String(e)}}));}catch(_){}
        return opts.fallbackText===undefined?'🔒 Encrypted message':opts.fallbackText;
      }
    };
    dm.isMessageQueued=m=>attempts.has(String(m?.id||m?.localId||m?.serverId||m||''));
    dm.isMessageFailed=m=>failures.has(String(m?.id||m?.localId||m?.serverId||m||''));
    dm.peekDecryptedText=m=>cache.get(String(m?.id||m?.localId||m?.serverId||''))??null;
    dm.retryDecrypt=async(chatId,m)=>{const id=String(m?.id||m?.localId||m?.serverId||'');cache.delete(id);failures.delete(id);attempts.delete(id);return dm.decryptMessageForDisplay(m,chatId,dm.getMyUserId?.(),{});};
    dm.__legacyCompatibilityInstalled=true; return true;
  }
  if(!install()) document.addEventListener('kyn:canonicalMessageE2EReady',install,{once:true});
})(window);
