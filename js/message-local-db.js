// Persistent, account-isolated local cache for 1:1 chat history.
(function (global) {
  'use strict';
  if (global.KynectaMessageCache) return;
  const DB_NAME = 'nexopa_message_lifecycle_v1'; const DB_VERSION = 2; const MESSAGES_STORE = 'messages'; const CONVERSATIONS_STORE = 'conversations';
  let dbPromise = null; let closed = false;
  function currentUserId() {
    try {
      if (global.currentUser && (global.currentUser.id || global.currentUser.userId || global.currentUser._id)) { const u = global.currentUser; return String(u.id || u.userId || u._id); }
      if (global.AuthStorage && typeof global.AuthStorage.getUser === 'function') { const u = global.AuthStorage.getUser(); const id = u && (u.id || u.userId || u.uid || u._id); if (id != null) return String(id); }
      for (const key of ['kynecta_auth','currentUser','nexopa_user','user']) { try { const raw = localStorage.getItem(key); if (!raw) continue; const parsed = JSON.parse(raw); const u = parsed && parsed.user ? parsed.user : parsed; const id = u && (u.id || u.userId || u.uid || u._id); if (id != null) return String(id); } catch (_) {} }
    } catch (_) {}
    return null;
  }
  function openDb() {
    if (closed) closed = false; if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      if (typeof indexedDB === 'undefined') return resolve(null); let req; try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (_) { return resolve(null); }
      req.onupgradeneeded = event => { const db = event.target.result;
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) { const s = db.createObjectStore(MESSAGES_STORE,{keyPath:'key'}); s.createIndex('chatId','chatId',{unique:false}); s.createIndex('accountId','accountId',{unique:false}); }
        else if (event.oldVersion < 2) { const s = event.target.transaction.objectStore(MESSAGES_STORE); if (!s.indexNames.contains('accountId')) s.createIndex('accountId','accountId',{unique:false}); }
        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) { const s = db.createObjectStore(CONVERSATIONS_STORE,{keyPath:'key'}); s.createIndex('accountId','accountId',{unique:false}); }
        else if (event.oldVersion < 2) { const s = event.target.transaction.objectStore(CONVERSATIONS_STORE); if (!s.indexNames.contains('accountId')) s.createIndex('accountId','accountId',{unique:false}); }
      };
      req.onsuccess = () => { const db=req.result; db.onversionchange=()=>{try{db.close();}catch(_){} dbPromise=null;}; resolve(db); }; req.onerror=()=>resolve(null); req.onblocked=()=>resolve(null);
    }); return dbPromise;
  }
  global.addEventListener('kyn:accountSwitchWipe',()=>{closed=false;});
  function withStore(name,mode){return openDb().then(db=>{if(!db)return null;try{const tx=db.transaction(name,mode);return{tx,store:tx.objectStore(name)};}catch(_){return null;}});}
  function reqToPromise(req){return new Promise(resolve=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(undefined);});}
  function msgKey(accountId,chatId,id){return `${accountId}::${chatId}::${id}`;} function convKey(accountId,chatId){return `${accountId}::${chatId}`;}
  function chronological(rows){return rows.slice().sort((a,b)=>{const an=typeof a.id==='number'?a.id:null,bn=typeof b.id==='number'?b.id:null;if(an!==null&&bn!==null)return an-bn;const at=a.createdAt?new Date(a.createdAt).getTime():0,bt=b.createdAt?new Date(b.createdAt).getTime():0;if(at!==bt)return at-bt;return an!==null?-1:(bn!==null?1:0);});}
  async function getMessages(chatId){const accountId=currentUserId();if(!accountId)return[];const ctx=await withStore(MESSAGES_STORE,'readonly');if(!ctx)return[];try{const rows=await reqToPromise(ctx.store.index('chatId').getAll(IDBKeyRange.only(String(chatId))));return Array.isArray(rows)?chronological(rows.filter(r=>String(r.accountId||'')===accountId).map(r=>r.message)):[];}catch(_){return[];}}
  async function _putMessageRecord(ctx,accountId,chatId,message){if(!message||message.id==null)return;const key=msgKey(accountId,chatId,message.id);let existing=null;try{existing=await reqToPromise(ctx.store.get(key));}catch(_){}let stored=message;
    // Durable delete-for-me tombstone: a later server history response must
    // never resurrect this message on reload/relogin.
    if(existing?.message?.deleted&&!existing.message.deleteForEveryone&&!message.deleted){stored=Object.assign({},message,{deleted:true,deleteForEveryone:false,displayContent:undefined});}
    ctx.store.put({key,accountId,chatId:String(chatId),id:message.id,message:stored});
  }
  async function putMessage(chatId,message){const accountId=currentUserId();if(!accountId||!chatId||!message||message.id==null)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{await _putMessageRecord(ctx,accountId,chatId,message);}catch(_){} }
  async function putMessages(chatId,messages){const accountId=currentUserId();if(!accountId||!chatId||!Array.isArray(messages)||!messages.length)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{for(const message of messages)await _putMessageRecord(ctx,accountId,chatId,message);}catch(_){} }
  async function deleteMessage(chatId,id){const accountId=currentUserId();if(!accountId||!chatId||id==null)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{const key=msgKey(accountId,chatId,id);const existing=await reqToPromise(ctx.store.get(key));if(existing?.message){existing.message=Object.assign({},existing.message,{deleted:true,deleteForEveryone:false,displayContent:undefined});ctx.store.put(existing);}}catch(_){} }
  async function deleteChatMessages(chatId){const accountId=currentUserId();if(!accountId||!chatId)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{const req=ctx.store.index('chatId').openCursor(IDBKeyRange.only(String(chatId)));req.onsuccess=()=>{const c=req.result;if(c){if(String(c.value.accountId||'')===accountId)ctx.store.delete(c.primaryKey);c.continue();}};}catch(_){} }
  async function getLastMessageId(chatId){const rows=await getMessages(chatId);let max=null;rows.forEach(m=>{if(typeof m.id==='number'&&(max===null||m.id>max))max=m.id;});return max;}
  async function getConversations(){const accountId=currentUserId();if(!accountId)return[];const ctx=await withStore(CONVERSATIONS_STORE,'readonly');if(!ctx)return[];try{const rows=await reqToPromise(ctx.store.index('accountId').getAll(IDBKeyRange.only(accountId)));return Array.isArray(rows)?rows.map(r=>r.conversation):[];}catch(_){return[];}}
  async function putConversation(chatId,conversation){const accountId=currentUserId();if(!accountId||!chatId||!conversation)return;const ctx=await withStore(CONVERSATIONS_STORE,'readwrite');if(!ctx)return;try{const key=convKey(accountId,chatId);const existing=await reqToPromise(ctx.store.get(key));if(existing?.conversation?.lastMessage?.deleted&&!conversation.lastMessage?.deleted&&String(existing.conversation.lastMessage.id)===String(conversation.lastMessage?.id))conversation=Object.assign({},conversation,{lastMessage:existing.conversation.lastMessage});ctx.store.put({key,accountId,chatId:String(chatId),conversation});}catch(_){} }
  async function deleteConversation(chatId){const accountId=currentUserId();if(!accountId||!chatId)return;const ctx=await withStore(CONVERSATIONS_STORE,'readwrite');if(!ctx)return;try{ctx.store.delete(convKey(accountId,chatId));}catch(_){} }
  global.KynectaMessageCache={getMessages,putMessage,putMessages,deleteMessage,deleteChatMessages,getLastMessageId,getConversations,putConversation,deleteConversation};
})(window);
