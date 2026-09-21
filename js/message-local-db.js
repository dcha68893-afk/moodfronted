// Persistent, account-isolated local cache for 1:1 chat history.
(function (global) {
  'use strict';
  if (global.KynectaMessageCache) return;
  const DB_NAME = 'necpa_message_lifecycle_v1'; const DB_VERSION = 2; const MESSAGES_STORE = 'messages'; const CONVERSATIONS_STORE = 'conversations';
  let dbPromise = null; let closed = false;
  // ACCOUNT ISOLATION: every read AND write below is partitioned by this id.
  // It used to trust window.currentUser first. A window that outlives an account
  // change made elsewhere (another tab, or an iframe still alive while Settings
  // switches accounts) keeps the OLD in-memory user while the API layer already
  // sends the NEW account's token — so account B's fetched history got filed under
  // account A's partition and would later be shown to A. Persisted auth is the
  // source of truth; if the in-memory user disagrees with it this window is stale,
  // so the cache is simply not used (null) instead of guessing.
  function idFrom(u) { const id = u && (u.id || u.userId || u.uid || u._id); return id != null ? String(id) : null; }
  function currentUserId() {
    let stored = null, mem = null;
    try {
      try { const raw = localStorage.getItem('kynecta_auth'); if (raw) { const p = JSON.parse(raw); stored = idFrom(p && p.user ? p.user : p); } } catch (_) {}
      if (stored == null) {
        for (const key of ['currentUser','necpa_user','user']) { try { const raw = localStorage.getItem(key); if (!raw) continue; const p = JSON.parse(raw); const id = idFrom(p && p.user ? p.user : p); if (id != null) { stored = id; break; } } catch (_) {} }
      }
      if (global.currentUser) mem = idFrom(global.currentUser);
      if (mem == null && global.AuthStorage && typeof global.AuthStorage.getUser === 'function') mem = idFrom(global.AuthStorage.getUser());
    } catch (_) {}
    if (stored != null && mem != null && stored !== mem) return null;
    return stored != null ? stored : mem;
  }
  // A failure placeholder is UI state, never message content. Persisting one makes
  // decryptForDisplay() treat the message as already resolved after a reload
  // (displayContent !== undefined short-circuits it), so it is never retried.
  const PLACEHOLDER_DISPLAY = new Set(['🔒 Encrypted message', '🔒 Unable to decrypt this message', 'Decrypting…']);
  function hasResolvedDisplay(m) { return !!m && typeof m.displayContent === 'string' && !PLACEHOLDER_DISPLAY.has(m.displayContent); }
  function stripPlaceholder(m) {
    if (m && typeof m.displayContent === 'string' && PLACEHOLDER_DISPLAY.has(m.displayContent)) { const c = Object.assign({}, m); delete c.displayContent; delete c.decryptFailureReason; return c; }
    return m;
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
  async function getMessages(chatId){const accountId=currentUserId();if(!accountId)return[];const ctx=await withStore(MESSAGES_STORE,'readonly');if(!ctx)return[];try{const rows=await reqToPromise(ctx.store.index('chatId').getAll(IDBKeyRange.only(String(chatId))));return Array.isArray(rows)?chronological(rows.filter(r=>String(r.accountId||'')===accountId&&r.message).map(r=>stripPlaceholder(r.message))):[];}catch(_){return[];}}
  async function _putMessageRecord(ctx,accountId,chatId,message){if(!message||message.id==null)return;const key=msgKey(accountId,chatId,message.id);let existing=null;try{existing=await reqToPromise(ctx.store.get(key));}catch(_){}let stored=message;
    // Durable delete-for-me tombstone: a later server history response must
    // never resurrect this message on reload/relogin.
    if(existing?.message?.deleted&&!existing.message.deleteForEveryone&&!message.deleted){stored=Object.assign({},message,{deleted:true,deleteForEveryone:false,displayContent:undefined});}
    // NEVER-DOWNGRADE RULE: a write that carries no resolved plaintext (a raw server
    // copy from history/sync/backfill/socket redelivery, or an in-memory failure
    // placeholder) must not replace a row that already holds it. Decrypting the same
    // ratchet message twice fails, so once the plaintext is lost from disk it is
    // lost for good. Unchanged ciphertext keeps the stored plaintext; changed
    // ciphertext (an edit) or a delete-for-everyone does not.
    stored=stripPlaceholder(stored);
    if(existing?.message&&!hasResolvedDisplay(stored)&&hasResolvedDisplay(existing.message)&&!stored.deleted&&(stored.content===undefined||stored.content===existing.message.content)){
      stored=Object.assign({},stored,{displayContent:existing.message.displayContent});
      if(existing.message.decryptVersion&&!stored.decryptVersion)stored.decryptVersion=existing.message.decryptVersion;
    }
    ctx.store.put({key,accountId,chatId:String(chatId),id:message.id,message:stored});
  }
  async function putMessage(chatId,message){const accountId=currentUserId();if(!accountId||!chatId||!message||message.id==null)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{await _putMessageRecord(ctx,accountId,chatId,message);}catch(_){} }
  async function putMessages(chatId,messages){const accountId=currentUserId();if(!accountId||!chatId||!Array.isArray(messages)||!messages.length)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{for(const message of messages)await _putMessageRecord(ctx,accountId,chatId,message);}catch(_){} }
  async function deleteMessage(chatId,id){const accountId=currentUserId();if(!accountId||!chatId||id==null)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{const key=msgKey(accountId,chatId,id);const existing=await reqToPromise(ctx.store.get(key));if(existing?.message){existing.message=Object.assign({},existing.message,{deleted:true,deleteForEveryone:false,displayContent:undefined});ctx.store.put(existing);}}catch(_){} }
  async function deleteChatMessages(chatId){const accountId=currentUserId();if(!accountId||!chatId)return;const ctx=await withStore(MESSAGES_STORE,'readwrite');if(!ctx)return;try{const req=ctx.store.index('chatId').openCursor(IDBKeyRange.only(String(chatId)));req.onsuccess=()=>{const c=req.result;if(c){if(String(c.value.accountId||'')===accountId)ctx.store.delete(c.primaryKey);c.continue();}};}catch(_){} }
  async function getLastMessageId(chatId){const rows=await getMessages(chatId);let max=null;rows.forEach(m=>{if(typeof m.id==='number'&&(max===null||m.id>max))max=m.id;});return max;}
  async function getConversations(){const accountId=currentUserId();if(!accountId)return[];const ctx=await withStore(CONVERSATIONS_STORE,'readonly');if(!ctx)return[];try{const rows=await reqToPromise(ctx.store.index('accountId').getAll(IDBKeyRange.only(accountId)));return Array.isArray(rows)?rows.filter(r=>r.conversation).map(r=>{const c=r.conversation;return c&&c.lastMessage?Object.assign({},c,{lastMessage:stripPlaceholder(c.lastMessage)}):c;}):[];}catch(_){return[];}}
  async function putConversation(chatId,conversation){const accountId=currentUserId();if(!accountId||!chatId||!conversation)return;const ctx=await withStore(CONVERSATIONS_STORE,'readwrite');if(!ctx)return;try{if(conversation.lastMessage)conversation=Object.assign({},conversation,{lastMessage:stripPlaceholder(conversation.lastMessage)});const key=convKey(accountId,chatId);const existing=await reqToPromise(ctx.store.get(key));{const el=existing?.conversation?.lastMessage,nl=conversation.lastMessage;if(el&&nl&&String(el.id)===String(nl.id)&&hasResolvedDisplay(el)&&!hasResolvedDisplay(nl)&&!nl.deleted&&(nl.content===undefined||nl.content===el.content))conversation=Object.assign({},conversation,{lastMessage:Object.assign({},nl,{displayContent:el.displayContent})});}if(existing?.conversation?.lastMessage?.deleted&&!conversation.lastMessage?.deleted&&String(existing.conversation.lastMessage.id)===String(conversation.lastMessage?.id))conversation=Object.assign({},conversation,{lastMessage:existing.conversation.lastMessage});ctx.store.put({key,accountId,chatId:String(chatId),conversation});}catch(_){} }
  async function deleteConversation(chatId){const accountId=currentUserId();if(!accountId||!chatId)return;const ctx=await withStore(CONVERSATIONS_STORE,'readwrite');if(!ctx)return;try{ctx.store.delete(convKey(accountId,chatId));}catch(_){} }
  global.KynectaMessageCache={getMessages,putMessage,putMessages,deleteMessage,deleteChatMessages,getLastMessageId,getConversations,putConversation,deleteConversation};
})(window);
