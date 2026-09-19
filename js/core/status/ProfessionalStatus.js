(function(){
'use strict';
if(window.__NecpaProfessionalStatus) return;

const apiOrigin=()=>((window.__getApiOrigin&&window.__getApiOrigin())||window.BACKEND_URL||'').replace(/\/+$/,'');
const apiUrl=path=>apiOrigin()+'/api/status'+path;
const uploadUrl=()=>apiOrigin()+'/api/cloudinary/direct-upload';
const TTL=24*60*60*1000;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currentUser=()=>{
  try{const a=JSON.parse(localStorage.getItem('currentUser')||'null');if(a?.id)return a;}
  catch(_){}
  try{const a=JSON.parse(localStorage.getItem('user')||'null');if(a?.id)return a;}
  catch(_){}
  const id=localStorage.getItem('userId')||localStorage.getItem('currentUserId');
  return id?{id:Number(id)}:{};
};
const token=()=>{
  const keys=['token','authToken','accessToken','jwt','access_token','kyn_access_token'];
  for(const k of keys){const v=localStorage.getItem(k);if(v)return v}
  try{const a=JSON.parse(localStorage.getItem('auth')||'null');return a?.token||a?.accessToken||''}catch(_){return ''}
};
async function api(path,opts={}){
  const headers=Object.assign({'Content-Type':'application/json'},opts.headers||{});
  const t=token();if(t)headers.Authorization=/^Bearer /i.test(t)?t:'Bearer '+t;
  const r=await fetch(apiUrl(path),Object.assign({},opts,{headers}));
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.message||data.error||('Request failed '+r.status));
  return data;
}
function avatar(u,cls='ns-avatar'){
  const url=window.Identity?.resolveAvatar?.(u)||u?.avatar||u?.photoURL||'';
  const name=window.Identity?.resolveDisplayName?.(u)||u?.displayName||u?.username||'User';
  return '<div class="'+cls+'" style="'+(url?'background-image:url(&quot;'+esc(url)+'&quot;)':'')+'">'+(url?'':esc((name.trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2)||'U').toUpperCase()))+'</div>';
}
const ago=t=>{const s=Math.max(1,Math.floor((Date.now()-new Date(t).getTime())/1000));if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m';if(s<86400)return Math.floor(s/3600)+'h';return Math.floor(s/86400)+'d'};
const toast=(m)=>{const el=document.querySelector('.ns-toast');if(!el)return;el.textContent=m;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2400)};
const bg=['linear-gradient(135deg,#2563eb,#7c3aed)','linear-gradient(135deg,#ec4899,#f97316)','linear-gradient(135deg,#06b6d4,#2563eb)','linear-gradient(135deg,#22c55e,#14b8a6)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#111827,#475569)','linear-gradient(135deg,#7c3aed,#db2777)','linear-gradient(135deg,#0f172a,#0ea5e9)'];
const stickers=['❤️','🔥','😂','😍','🎓','✨','💯','🙌','🎉','📚','🛍️','💡'];
let state={tab:'friends',statuses:[],mine:[],index:0,viewerGroup:[],replyingStatusId:null,composer:{type:'text',content:'',caption:'',background:bg[0],font:'system-ui',privacy:'all_contacts',topics:[],moodType:'',category:'',intent:'',allowReplies:true,allowReactions:true,allowSharing:true,linkUrl:'',mentions:[],stickers:[],media:null,poll:['',''],selectedSticker:''},seen:new Set(),timer:null,panel:'list',lastScreen:'list'};

function syncTheme(){try{const source=window.parent&&window.parent!==window?window.parent.document:document;const src=source.documentElement,target=document.documentElement,cs=source.defaultView.getComputedStyle(src);for(let i=0;i<cs.length;i++){const n=cs[i];if(n&&n.indexOf('--')===0){const v=cs.getPropertyValue(n);if(v)target.style.setProperty(n,v)}}const mode=src.getAttribute('data-theme');if(mode)target.setAttribute('data-theme',mode);target.style.colorScheme=src.style.colorScheme||getComputedStyle(src).colorScheme||''}catch(_){}}
function mount(){
 if(document.getElementById('necpa-status-root'))return;
 const launcher=document.createElement('button');launcher.id='necpa-status-launcher';launcher.innerHTML='<span class="ns-dot"></span> Status';launcher.onclick=open;
 document.body.appendChild(launcher);
 const root=document.createElement('div');root.id='necpa-status-root';
 root.innerHTML='<div class="ns-shell"><aside class="ns-side"><div class="ns-brand"><div><h2>Moments</h2><small>Share what is happening</small></div></div><div class="ns-my-card" data-my-status>'+avatar(currentUser())+'<div style="flex:1;min-width:0"><b>My Status</b><small data-my-status-meta style="display:block;color:#64748b">Add a new moment</small></div><button class="ns-add" data-compose aria-label="Add status">+</button></div><div class="ns-section-title">Status</div><div class="ns-tabs"><button class="ns-tab active" data-tab="friends">Friends</button><button class="ns-tab" data-tab="discover">Discover</button></div><button class="ns-browse" data-browse><span>Browse all moments</span><span>›</span></button><div class="ns-section-title">People</div><div class="ns-list" data-people></div></aside><main class="ns-main"><div class="ns-main-head"><input class="ns-search" placeholder="Search statuses, topics or people"><select class="ns-filter"><option value="all">All moments</option><option value="image">Photos</option><option value="video">Videos</option><option value="text">Text</option><option value="poll">Polls</option></select><button class="ns-btn ghost ns-feed-back" data-feed-back aria-label="Back to status list">← Back</button><button class="ns-btn primary" data-compose>Create</button></div><section class="ns-feed" data-feed></section><div class="ns-composer" data-composer></div><div class="ns-viewer" data-viewer></div></main></div><div class="ns-toast"></div>';
 document.body.appendChild(root);
 const applyViewportLayout=()=>{
   const mobile=window.matchMedia('(max-width: 800px)').matches;
   root.classList.toggle('ns-mobile',mobile);
   const side=root.querySelector('.ns-side');
   if(!mobile&&state.panel!=='list')state.panel='list';
   root.dataset.panel=state.panel;
   syncParent();
 };
 applyViewportLayout();
 window.addEventListener('resize',applyViewportLayout,{passive:true});
 root.querySelectorAll('[data-exit]').forEach(b=>b.onclick=exitModule);
 root.querySelectorAll('[data-back]').forEach(b=>b.onclick=goBackOne);
 root.querySelectorAll('[data-browse]').forEach(b=>b.onclick=()=>setPanel('feed')); root.querySelector('[data-feed-back]')?.addEventListener('click',()=>setPanel('list'));
 root.querySelectorAll('[data-compose]').forEach(b=>b.onclick=(e)=>{e.stopPropagation();openComposer()});
 root.querySelectorAll('[data-my-status]').forEach(b=>b.onclick=()=>openMyStatus());
 root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;root.querySelectorAll('.ns-tab').forEach(x=>x.classList.toggle('active',x===b));if(state.tab==='discover')setPanel('feed');loadFeed()});
 root.querySelector('.ns-filter').onchange=renderFeed;
 root.querySelector('.ns-search').oninput=renderFeed;
 document.addEventListener('keydown',e=>{if(e.key==='Escape')goBackOne()});
 renderPeople();loadFeed();
}

/* ── MOBILE ONE-PANEL NAVIGATION ─────────────────────────────────────────
   Screens, deepest first: viewer > composer > feed (mobile) > list.
   The LIST (Moments / My Status / Friends|Discover / People) is the landing
   screen on mobile. Every deeper screen has a Back arrow that returns exactly
   one level, and the same one-level unwind is exposed to the parent shell so
   the hardware/gesture back button behaves identically. */
const isMobile=()=>window.matchMedia('(max-width: 800px)').matches;
const rootEl=()=>document.getElementById('necpa-status-root');
function topScreen(){
 if(document.querySelector('[data-viewer]')?.classList.contains('open'))return 'viewer';
 if(document.querySelector('[data-composer]')?.classList.contains('open'))return 'composer';
 if(isMobile()&&state.panel==='feed')return 'feed';
 return null;
}
function syncParent(){
 const d=topScreen(),key=d||'list';
 if(key===state.lastScreen)return;
 state.lastScreen=key;
 try{
  window.parent.postMessage({type:d?'STATUS_PANEL_OPENED':'STATUS_LIST_SHOWN',source:'professional-status'},'*');
  window.parent.postMessage({type:'SCREEN_STATE_CHANGED',module:'status',restore:d?('status-'+d):null,timestamp:Date.now()},'*');
 }catch(_){}
}
function setPanel(p){state.panel=p;const r=rootEl();if(r)r.dataset.panel=p;syncParent()}
function exitModule(){
 try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:'NAVIGATE_BACK',source:'status'},'*');return}}catch(_){}
 try{history.back()}catch(_){}
}
function goBackOne(){
 const d=topScreen();
 if(d==='viewer')return closeViewer();
 if(d==='composer')return closeComposer();
 if(d==='feed')return setPanel('list');
 exitModule();
}
function resetToList(){
 clearInterval(state.timer);
 document.querySelector('[data-viewer]')?.classList.remove('open');
 document.querySelector('[data-composer]')?.classList.remove('open');
 setPanel('list');
}
window.addEventListener('message',e=>{
 // Same-origin only. Do not compare e.source: the shell's config.js wraps postMessage so the source is the receiver itself.
 if(e.origin&&e.origin!=='null'&&e.origin!==location.origin)return;
 const t=e.data&&e.data.type;
 if(t==='CLOSE_LOCAL_PANEL'){if(topScreen())goBackOne()}
 else if(t==='GO_BACK_TO_LIST')resetToList();
});
function open(){mount();document.getElementById('necpa-status-root').classList.add('open');loadFeed()}
function close(){document.getElementById('necpa-status-root')?.classList.remove('open');closeViewer();closeComposer()}
async function loadFeed(){
 try{
  const me=currentUser();
  const mine=(await api('/my')).data||[];
  state.mine=mine;
  let data=state.tab==='discover'?(await api('/public')).data||[]:(await api('/friends')).data||[];
  state.mine=mine.sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
  state.statuses=data
    .filter(s=>String(s.userId||s.owner?.id||'')!==String(me.id||''))
    .sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
  renderMyStatus();
  renderFeed();renderPeople();
 }catch(e){renderFeed();toast(e.message)}
}
function renderMyStatus(){
 const card=document.querySelector('[data-my-status]');
 const meta=document.querySelector('[data-my-status-meta]');
 if(!card||!meta)return;
 const mine=Array.isArray(state.mine)?state.mine:[];
 const latest=mine[0];
 const avatarEl=card.querySelector('.ns-avatar');
 if(latest?.owner&&avatarEl) avatarEl.outerHTML=avatar(latest.owner,'ns-avatar');
 if(!latest){meta.textContent='Add a new moment';return}
 const totalViews=mine.reduce((sum,status)=>sum+Number(status.viewCount||0),0);
 meta.textContent=mine.length===1
   ? ('1 active status · '+totalViews+' view'+(totalViews===1?'':'s'))
   : (mine.length+' active statuses · '+totalViews+' views');
}
function openMyStatus(){
 const mine=Array.isArray(state.mine)?state.mine:[];
 if(!mine.length){openComposer();return}
 state.viewerGroup=mine;
 state.index=0;
 showViewer();
}

function renderPeople(){
 const el=document.querySelector('[data-people]');if(!el)return;
 const groups={};
 for(const s of state.statuses){const u=s.owner||{},id=String(u.id||s.userId);if(!groups[id]||(!groups[id].viewedByMe&&s.viewedByMe))groups[id]=s}
 const arr=Object.values(groups).sort((a,b)=>Number(!!a.viewedByMe)-Number(!!b.viewedByMe)||new Date(b.createdAt)-new Date(a.createdAt));
 const fresh=arr.filter(s=>!s.viewedByMe),viewed=arr.filter(s=>s.viewedByMe);
 const person=s=>{const u=s.owner||{};return '<div class="ns-person '+(s.viewedByMe?'is-viewed':'is-unviewed')+'" data-user="'+esc(s.userId)+'">'+avatar(u)+'<div class="ns-person-info"><div class="ns-person-name">'+esc(u.displayName||u.username||'User')+'</div><div class="ns-person-time">'+(s.viewedByMe?'Viewed':'New')+' · '+ago(s.createdAt)+' ago</div></div><i class="ns-story-ring '+(s.viewedByMe?'viewed':'unviewed')+'"></i></div>'};
 el.innerHTML=(fresh.length?'<div class="ns-status-label">NEW</div>'+fresh.map(person).join(''):'')+(viewed.length?'<div class="ns-status-label viewed-label">VIEWED</div>'+viewed.map(person).join(''):'')||'<div class="ns-empty-mini">No active friend statuses yet.</div>';
 el.querySelectorAll('[data-user]').forEach(x=>x.onclick=()=>openUser(x.dataset.user));
}
function renderFeed(){
 const el=document.querySelector('[data-feed]');if(!el)return;
 const q=(document.querySelector('.ns-search')?.value||'').toLowerCase().trim();
 const filter=document.querySelector('.ns-filter')?.value||'all';
 let data=state.statuses.filter(s=>filter==='all'||s.type===filter);
 if(q)data=data.filter(s=>JSON.stringify(s).toLowerCase().includes(q));
 if(!data.length){el.innerHTML='<div class="ns-empty"><strong>Your status space is ready</strong>Post a photo, thought, poll or short video and let your campus see what matters.</div>';return}
 const fresh=data.filter(s=>!s.viewedByMe),viewed=data.filter(s=>s.viewedByMe);
 const section=(title,items,cls)=>items.length?'<div class="ns-feed-section '+cls+'"><div class="ns-feed-title"><span>'+title+'</span><small>'+items.length+' moment'+(items.length===1?'':'s')+'</small></div><div class="ns-feed-grid">'+items.map((s,i)=>card(s,i)).join('')+'</div></div>':'';
 el.innerHTML=section('New from friends',fresh,'is-new')+section('Viewed',viewed,'is-viewed-feed');
 el.querySelectorAll('[data-open-status]').forEach(x=>x.onclick=()=>openViewer(Number(x.dataset.openStatus)));
}
function card(s,i){
 const u=s.owner||{};const media=s.mediaUrl;
 const visual=s.type==='image'&&media?'<img class="ns-card-media" src="'+esc(media)+'" loading="lazy">':s.type==='video'&&media?'<video class="ns-card-media" src="'+esc(media)+'" muted playsinline preload="metadata"></video>':'<div class="ns-card-media" style="background:'+(s.background||bg[0])+';display:grid;place-items:center"><div style="padding:25px;color:#fff;font-weight:850;font-size:25px;text-align:center;font-family:'+esc(s.font||'system-ui')+'">'+esc(s.content||s.caption||'✨')+'</div></div>';
 return '<article class="ns-card" data-open-status="'+s.id+'">'+visual+'<div class="ns-card-overlay"></div><div class="ns-card-top">'+avatar(u)+'<span class="ns-card-user">'+esc(u.displayName||u.username||'User')+'</span><span class="ns-card-time">'+ago(s.createdAt)+'</span></div><div class="ns-card-bottom"><div class="ns-card-caption">'+esc(s.caption||s.content||'')+'</div><div class="ns-card-meta"><span>👁 '+(s.viewCount||0)+'</span><span>❤️ '+(s.reactionCount||0)+'</span><span>💬 '+(s.replyCount||0)+'</span></div></div></article>';
}
async function openUser(userId){
 try{const data=(await api('/user/'+encodeURIComponent(userId))).data||[];if(data.length){state.viewerGroup=data;state.index=0;showViewer()}}catch(e){toast(e.message)}
}
async function openViewer(id){
 let idx=state.statuses.findIndex(s=>s.id===id);if(idx<0)return;
 const s=state.statuses[idx];const same=state.statuses.filter(x=>String(x.userId)===String(s.userId));
 state.viewerGroup=same.length?same:[s];state.index=Math.max(0,same.findIndex(x=>x.id===id));showViewer();
}
function showViewer(){
 const s=state.viewerGroup[state.index];if(!s)return;
 const isOwner=String(s.userId)===String(currentUser().id||'');
 const isReplay=!!s.viewedByMe && !isOwner;
 s.viewedByMe=true;state.seen.add(s.id);try{localStorage.setItem('necpa_status_seen_'+String(currentUser().id||'guest'),JSON.stringify([...state.seen].slice(-500)))}catch(_){}
 const root=document.querySelector('[data-viewer]');const u=s.owner||{};state.seen.add(s.id);
 root.innerHTML='<div class="ns-viewer-stage">'+viewerVisual(s)+'<div class="ns-viewer-grad"></div><div class="ns-progress">'+state.viewerGroup.map((_,i)=>'<i><b style="width:'+(i<state.index?'100':'0')+'%"></b></i>').join('')+'</div><div class="ns-viewer-head">'+avatar(u)+'<div><div class="ns-viewer-name">'+esc(u.displayName||u.username||'User')+'</div><div class="ns-viewer-time">'+ago(s.createdAt)+' ago · 24h moment</div></div><div class="ns-viewer-actions"><button data-viewers>👁 '+(s.viewCount||0)+'</button><button data-more>•••</button><button data-vclose>×</button></div></div><button class="ns-nav ns-prev" data-prev>‹</button><button class="ns-nav ns-next" data-next>›</button><div class="ns-viewer-bottom"><div class="ns-reactions">'+['❤️','😂','🔥','😍','👏','💯'].map(e=>'<button class="ns-reaction" data-react="'+e+'">'+e+'</button>').join('')+'</div><div class="ns-reply-row">'+(s.allowReplies!==false?'<input class="ns-reply" data-reply placeholder="Reply to '+esc(u.displayName||'this status')+'…"><button class="ns-reaction" data-send>➤</button>':'<span style="opacity:.65">Replies are disabled</span>')+'</div></div><div class="ns-viewer-more" data-moremenu><button data-share>↗ Share</button><button data-save>⇩ Save</button><button data-report>⚑ Report</button>'+(String(s.userId)===String(currentUser().id)?'<button data-edit>✎ Edit</button><button data-delete>🗑 Delete</button><button data-highlight>★ Highlight</button>':'')+'</div></div>';
 root.classList.add('open');syncParent();
 if(isOwner) root.querySelector('.ns-viewer-bottom')?.remove();
 root.querySelector('[data-vclose]').onclick=()=>closeViewer();root.querySelector('[data-prev]').onclick=()=>move(-1);root.querySelector('[data-next]').onclick=()=>move(1);
 root.querySelector('.ns-viewer-bottom')?.addEventListener('pointerdown',()=>clearInterval(state.timer),{passive:true});
 root.querySelector('[data-reply]')?.addEventListener('focus',()=>clearInterval(state.timer));
 root.querySelector('[data-more]').onclick=()=>root.querySelector('[data-moremenu]').classList.toggle('open');
 root.querySelector('[data-viewers]').onclick=()=>showViewers(s);
 root.querySelector('[data-edit]')?.addEventListener('click',()=>editStatus(s));
 root.querySelectorAll('[data-react]').forEach(b=>b.onclick=()=>react(s,b.dataset.react));
 root.querySelector('[data-send]')?.addEventListener('click',()=>reply(s,root.querySelector('[data-reply]')?.value||''));
 root.querySelector('[data-share]')?.addEventListener('click',()=>share(s));
 root.querySelector('[data-save]')?.addEventListener('click',()=>save(s));
 root.querySelector('[data-report]')?.addEventListener('click',()=>report(s));
 root.querySelector('[data-delete]')?.addEventListener('click',()=>del(s));
 root.querySelector('[data-highlight]')?.addEventListener('click',()=>highlight(s));
 api('/view',{method:'POST',body:JSON.stringify({statusId:s.id})}).then(r=>{
   const result=r.data||{};
   if(result.created) s.viewCount=Number(result.viewCount||s.viewCount||0);
   s.viewedByMe=String(s.userId)!==String(currentUser().id||'') ? true : !!s.viewedByMe;
   renderFeed();renderPeople();renderMyStatus();
 }).catch(()=>{});
 clearInterval(state.timer);if(!isReplay&&!state.replyingStatusId)state.timer=setTimeout(()=>move(1),Math.max(3000,(Number(s.durationSeconds)||7)*1000));
}
function viewerVisual(s){
 const failed='<div class="ns-media-error" role="alert">This media could not be loaded</div>';
 if(s.type==='image'&&s.mediaUrl)return '<img class="ns-viewer-media" src="'+esc(s.mediaUrl)+'" alt="" onerror="this.outerHTML=\''+failed+'\'">';
 if(s.type==='image'&&!s.mediaUrl)return failed;
 if(s.type==='video'&&s.mediaUrl)return '<video class="ns-viewer-media" src="'+esc(s.mediaUrl)+'" controls autoplay playsinline onerror="this.outerHTML=\''+failed+'\'"></video>';
 if(s.type==='video'&&!s.mediaUrl)return failed;
 if(s.type==='poll'){const p=Array.isArray(s.pollOptions)?s.pollOptions:[];return '<div class="ns-viewer-text" style="background:'+(s.background||bg[0])+';max-width:none;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center"><div>'+esc(s.content||'Poll')+'</div>'+p.map(x=>'<div style="margin:7px;padding:12px 22px;border-radius:999px;background:rgba(255,255,255,.16);font-size:17px">'+esc(x)+'</div>').join('')+'</div>'}
 return '<div class="ns-viewer-text" style="background:'+(s.background||bg[0])+';width:100%;height:100%;display:grid;place-items:center;font-family:'+esc(s.font||'system-ui')+'">'+esc(s.content||s.caption||'')+'</div>';
}
function move(dir){const n=state.index+dir;if(n<0||n>=state.viewerGroup.length){closeViewer();return}state.index=n;showViewer()}
function closeViewer(silent){clearInterval(state.timer);const el=document.querySelector('[data-viewer]');if(el?.classList.contains('open')){el.classList.remove('open');if(silent!==true)syncParent()}}

async function showViewers(s){
 try{
   const r=await api('/'+s.id+'/viewers');
   const payload=r.data||{};
   const rows=Array.isArray(payload.viewers)?payload.viewers:[];
   const root=document.querySelector('[data-viewer]');
   root.querySelector('.ns-viewer-list')?.remove();
   const panel=document.createElement('div');
   panel.className='ns-viewer-list';
   panel.innerHTML='<div class="ns-viewer-list-head"><b>Viewed by</b><span>'+Number(payload.viewCount||s.viewCount||0)+' total views · '+rows.length+' people</span><button type="button" data-close-viewers>×</button></div>'+
     (rows.length?rows.map(row=>'<div class="ns-viewer-row">'+avatar(row.viewer||{},'ns-avatar')+'<div><b>'+esc(row.viewer?.displayName||row.viewer?.username||('User '+row.viewerId))+'</b><small>'+Number(row.viewCount||1)+' view'+(Number(row.viewCount||1)===1?'':'s')+' · '+(row.viewedAt?ago(row.viewedAt)+' ago':'')+'</small></div></div>').join(''):'<div class="ns-viewer-empty">No one has viewed this status yet.</div>');
   root.querySelector('.ns-viewer-stage')?.appendChild(panel);
   panel.querySelector('[data-close-viewers]').onclick=()=>panel.remove();
 }catch(e){toast(e.message)}
}
async function editStatus(s){
 const value=prompt('Edit caption/text:',s.caption||s.content||'');if(value===null)return;
 try{const r=await api('/'+s.id,{method:'PUT',body:JSON.stringify({caption:value,content:s.type==='text'?value:s.content})});Object.assign(s,r.status||{});showViewer();renderFeed();toast('Status updated')}catch(e){toast(e.message)}
}
async function sendStatusInteraction(s,payload){
 const ownerId=Number(s?.userId||s?.owner?.id||0), meId=Number(currentUser()?.id||0);
 if(!ownerId||ownerId===meId) return;
 const text=String(payload?.text||'').trim(), kind=payload?.kind==='reaction'?'reaction':'comment';
 const interaction={statusId:s.id,statusType:s.type||'text',kind,emoji:kind==='reaction'?(payload?.emoji||''):null,text:kind==='comment'?text:'',caption:String(s.caption||s.content||'').slice(0,500)};
 const clientMessageId='status-'+s.id+'-'+kind+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
 if(!window.KynectaE2E||typeof window.KynectaE2E.encryptForChat!=='function') await window.KynectaMessageE2EReady?.();
 if(!window.KynectaE2E||typeof window.KynectaE2E.encryptForChat!=='function') throw new Error('Secure messaging is not ready yet');
 const start=await fetch(apiOrigin()+'/api/chats/start',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({userId:ownerId})});
 const startData=await start.json().catch(()=>({}));
 if(!start.ok||startData.success===false) throw new Error(startData.message||'Could not open the creator chat');
 const chatId=Number(startData?.data?.chat?.id||startData?.data?.conversationId||0);
 if(!chatId) throw new Error('Creator chat was not resolved');
 const envelope=await window.KynectaE2E.encryptForChat(JSON.stringify(interaction),chatId,ownerId);
 const sent=await fetch(apiOrigin()+'/api/messages',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({chatId,receiverId:ownerId,content:envelope,type:'status_reply',clientMessageId,metadata:{statusInteraction:interaction,statusId:s.id,statusType:s.type||'text',kind}})});
 const sentData=await sent.json().catch(()=>({}));
 if(!sent.ok||sentData.success===false) throw new Error(sentData.message||'Could not send the interaction');
 return sentData?.data||null;
}
async function react(s,emoji){if(s.allowReactions===false)return;try{const r=await api('/'+s.id+'/like',{method:'POST',body:JSON.stringify({emoji})});s.reactionCount=r.count;await sendStatusInteraction(s,{kind:'reaction',emoji});toast('Reaction sent privately to the creator')}catch(e){toast(e.message)}}
async function reply(s,text){if(!text.trim())return;clearInterval(state.timer);state.replyingStatusId=s.id;const value=text.trim();try{await api('/'+s.id+'/comment',{method:'POST',body:JSON.stringify({text:value})});await sendStatusInteraction(s,{kind:'comment',text:value});s.replyCount=(s.replyCount||0)+1;document.querySelector('[data-reply]').value='';toast('Reply sent privately to the creator')}catch(e){toast(e.message)}}
async function share(s){try{if(navigator.share)await navigator.share({title:'Necpa Status',text:s.caption||s.content||'Check this status',url:location.href});else await navigator.clipboard.writeText(location.href+'#status-'+s.id);await api('/'+s.id+'/share',{method:'POST',body:'{}'});toast('Status shared')}catch(e){if(e.name!=='AbortError')toast(e.message)}}
async function save(s){try{const url=s.mediaUrl;if(!url)return toast('Text statuses do not need downloading');const a=document.createElement('a');a.href=url;a.download='necpa-status';a.target='_blank';a.click();toast('Save opened')}catch(e){toast(e.message)}}
async function report(s){const reason=prompt('Why are you reporting this status?','spam');if(!reason)return;try{await api('/'+s.id+'/report',{method:'POST',body:JSON.stringify({reason})});toast('Report submitted')}catch(e){toast(e.message)}}
async function del(s){if(!confirm('Delete this status now?'))return;try{await api('/'+s.id,{method:'DELETE'});state.statuses=state.statuses.filter(x=>x.id!==s.id);state.mine=state.mine.filter(x=>x.id!==s.id);closeViewer();renderFeed();toast('Status deleted')}catch(e){toast(e.message)}}
async function highlight(s){try{await api('/'+s.id,{method:'PUT',body:JSON.stringify({highlight:!s.highlight})});s.highlight=!s.highlight;toast(s.highlight?'Added to Highlights':'Removed from Highlights')}catch(e){toast(e.message)}}

function openComposer(){
 closeViewer(true);const root=document.querySelector('[data-composer]');const c=state.composer={type:'text',content:'',caption:'',background:bg[0],font:'system-ui',privacy:'all_contacts',topics:[],moodType:'',category:'',intent:'',allowReplies:true,allowReactions:true,allowSharing:true,linkUrl:'',mentions:[],stickers:[],media:null,poll:['',''],selectedSticker:''};
 root.innerHTML='<div class="ns-compose-box"><div class="ns-compose-head"><button class="ns-icon-btn ns-cback" data-cback aria-label="Back">←</button><div><h3>Create a moment</h3><small style="color:#64748b">Beautiful, quick and built for campus life</small></div><button class="ns-icon-btn" data-cclose>×</button></div><div class="ns-compose-tabs">'+[['text','✍️ Text'],['media','📷 Media'],['poll','📊 Poll'],['link','🔗 Link']].map((x,i)=>'<button class="ns-compose-tab '+(i===0?'active':'')+'" data-ctype="'+x[0]+'">'+x[1]+'</button>').join('')+'</div><div class="ns-pane active" data-pane="text"><textarea class="ns-textarea" data-content maxlength="4000" placeholder="What is happening? Share a thought, update or campus moment…"></textarea><div class="ns-editor" data-editor style="background:'+c.background+'"><div class="ns-edit-text" data-edittext></div></div><div class="ns-bg-grid">'+bg.map((x,i)=>'<button class="ns-bg '+(i===0?'selected':'')+'" data-bg="'+i+'" style="background:'+x+'"></button>').join('')+'</div><div class="ns-editor-tools"><button class="ns-tool" data-font>Change font</button>'+stickers.map(x=>'<button class="ns-tool" data-sticker="'+x+'">'+x+'</button>').join('')+'</div></div><div class="ns-pane" data-pane="media"><label class="ns-upload">📸 <b>Choose a photo or video</b><br><small>Photos are compressed before upload · videos up to 20 seconds</small><input type="file" hidden accept="image/*,video/*" data-media></label><div data-media-preview></div><div class="ns-editor-tools"><button class="ns-tool" data-rotate>↻ Rotate</button><button class="ns-tool" data-zoomout>− Zoom</button><button class="ns-tool" data-zoomin>＋ Zoom</button><button class="ns-tool" data-filter>✨ Filter</button></div><input class="ns-input" data-caption placeholder="Add a caption…" maxlength="2000" style="margin-top:10px"></div><div class="ns-pane" data-pane="poll"><input class="ns-input" data-pollq placeholder="Ask a question…" maxlength="300"><div class="ns-row"><input class="ns-input" data-poll0 placeholder="Option 1"><input class="ns-input" data-poll1 placeholder="Option 2"></div><button class="ns-tool" data-addpoll style="margin-top:10px">＋ Add option</button></div><div class="ns-pane" data-pane="link"><input class="ns-input" data-link placeholder="https://…"><textarea class="ns-textarea" data-linkcaption style="min-height:100px;margin-top:10px" placeholder="Tell people why this link matters…"></textarea></div><div class="ns-section-title" style="margin-top:16px">Audience & details</div><div class="ns-row"><select class="ns-select" data-privacy><option value="all_contacts">My friends</option><option value="close_friends">Close friends</option><option value="contacts_except">Friends except selected</option><option value="only_share_with">Only selected people</option><option value="public">Public</option><option value="private">Only me</option></select><select class="ns-select" data-duration><option value="7">7 sec</option><option value="10">10 sec</option><option value="15">15 sec</option><option value="20">20 sec</option></select></div><div class="ns-row"><input class="ns-input" data-mood placeholder="Mood (e.g. excited)"><input class="ns-input" data-category placeholder="Category (e.g. campus)"><input class="ns-input" data-intent placeholder="Intent (e.g. announcement)"></div><input class="ns-input" data-topics placeholder="Topics separated by commas (e.g. campus,study,events)" style="margin-top:9px"><input class="ns-input" data-privacy-list placeholder="Optional audience user IDs, comma-separated" style="margin-top:9px"><input class="ns-input" data-music placeholder="Optional music/audio URL" style="margin-top:9px"><label class="ns-check"><input type="checkbox" data-replies checked> Allow replies</label><label class="ns-check"><input type="checkbox" data-reactions checked> Allow reactions</label><label class="ns-check"><input type="checkbox" data-sharing checked> Allow sharing</label><div class="ns-compose-actions"><button class="ns-btn ghost" data-cancel>Cancel</button><button class="ns-btn primary" data-publish>Publish Status</button></div></div>';
 root.classList.add('open');syncParent();wireComposer();
}
function closeComposer(){const el=document.querySelector('[data-composer]');if(el?.classList.contains('open')){el.classList.remove('open');syncParent()}}
function wireComposer(){
 const root=document.querySelector('[data-composer]');root.querySelector('[data-cclose]').onclick=closeComposer;root.querySelector('[data-cback]').onclick=closeComposer;root.querySelector('[data-cancel]').onclick=closeComposer;
 root.querySelectorAll('[data-ctype]').forEach(b=>b.onclick=()=>{state.composer.type=b.dataset.ctype==='media'?'image':b.dataset.ctype;root.querySelectorAll('[data-ctype]').forEach(x=>x.classList.toggle('active',x===b));root.querySelectorAll('[data-pane]').forEach(p=>p.classList.toggle('active',p.dataset.pane===(b.dataset.ctype==='media'?'media':b.dataset.ctype)))});
 const content=root.querySelector('[data-content]');content.oninput=()=>root.querySelector('[data-edittext]').textContent=content.value;
 root.querySelectorAll('[data-bg]').forEach(b=>b.onclick=()=>{state.composer.background=bg[Number(b.dataset.bg)];root.querySelector('[data-editor]').style.background=state.composer.background;root.querySelectorAll('[data-bg]').forEach(x=>x.classList.toggle('selected',x===b))});
 root.querySelector('[data-font]').onclick=()=>{state.composer.font=state.composer.font==='system-ui'?'Georgia':state.composer.font==='Georgia'?'monospace':'system-ui';root.querySelector('[data-editor]').style.fontFamily=state.composer.font};
 root.querySelectorAll('[data-sticker]').forEach(b=>b.onclick=()=>{state.composer.stickers.push({emoji:b.dataset.sticker});root.querySelector('[data-edittext]').textContent=(content.value||'')+' '+b.dataset.sticker});
 root.querySelector('[data-media]').onchange=handleMedia;
 root.querySelector('[data-caption]').oninput=e=>state.composer.caption=e.target.value;
 root.querySelector('[data-poll0]').oninput=e=>state.composer.poll[0]=e.target.value;root.querySelector('[data-poll1]').oninput=e=>state.composer.poll[1]=e.target.value;
 root.querySelector('[data-addpoll]').onclick=()=>{const row=document.createElement('div');row.className='ns-row';row.innerHTML='<input class="ns-input" data-pollx placeholder="Another option">';root.querySelector('[data-addpoll]').before(row)};
 root.querySelector('[data-publish]').onclick=publish;
}
async function handleMedia(e){
 const file=e.target.files?.[0];if(!file)return;
 if(file.type.startsWith('video/')){
  const v=document.createElement('video');v.preload='metadata';const objectUrl=URL.createObjectURL(file);
  v.onloadedmetadata=()=>{const duration=Number(v.duration||0);URL.revokeObjectURL(objectUrl);if(!Number.isFinite(duration)||duration<=0){toast('Could not read video duration');e.target.value='';return}state.composer.media={file,type:'video',sourceDuration:duration,trimStart:0,trimEnd:Math.min(duration,20)};previewMedia()};v.src=objectUrl;
 }else if(file.type.startsWith('image/')){
  try{const compressed=await compressImage(file);state.composer.media={file:compressed,type:'image'};previewMedia()}catch(_){state.composer.media={file,type:'image'};previewMedia()}
 }
}
async function compressImage(file){
 const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)});
 const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(img.src);
 return await new Promise(r=>canvas.toBlob(b=>r(new File([b],file.name.replace(/\.[^.]+$/i,'.jpg'),{type:'image/jpeg'})),'image/jpeg',.82));
}
function previewMedia(){
 const root=document.querySelector('[data-composer]'),m=state.composer.media,box=root.querySelector('[data-media-preview]');
 if(!m){box.innerHTML='';return}
 if(m.type!=='video'){box.innerHTML='<img class="ns-preview" src="'+URL.createObjectURL(m.file)+'">';return}
 const max=Number(m.sourceDuration||0);m.trimStart=Math.max(0,Math.min(Number(m.trimStart||0),Math.max(0,max-0.1)));m.trimEnd=Math.min(max,Math.max(m.trimStart+0.1,Number(m.trimEnd||Math.min(max,20))));
 const src=URL.createObjectURL(m.file);
 box.innerHTML='<video class="ns-preview" controls playsinline src="'+src+'" onerror="this.outerHTML=\'<div class=\\\"ns-media-error\\\">This video could not be previewed.</div>\'"></video>'+(max>20?'<div class="ns-trimmer"><b>Trim this video to 20 seconds maximum</b><label>Start <input type="range" data-trim-start min="0" max="'+max.toFixed(2)+'" step="0.1" value="'+m.trimStart.toFixed(1)+'"></label><label>End <input type="range" data-trim-end min="0" max="'+max.toFixed(2)+'" step="0.1" value="'+m.trimEnd.toFixed(1)+'"></label><div data-trim-readout></div></div>':'');
 if(max>20){
  const read=()=>{const a=Number(box.querySelector('[data-trim-start]').value),b=Number(box.querySelector('[data-trim-end]').value);if(b-a>20){if(document.activeElement?.matches('[data-trim-start]'))box.querySelector('[data-trim-end]').value=Math.min(max,a+20).toFixed(1);else box.querySelector('[data-trim-start]').value=Math.max(0,b-20).toFixed(1)}m.trimStart=Number(box.querySelector('[data-trim-start]').value);m.trimEnd=Number(box.querySelector('[data-trim-end]').value);box.querySelector('[data-trim-readout]').textContent='Start '+m.trimStart.toFixed(1)+'s · End '+m.trimEnd.toFixed(1)+'s · '+(m.trimEnd-m.trimStart).toFixed(1)+'s';};
  box.querySelectorAll('[data-trim-start],[data-trim-end]').forEach(x=>x.oninput=read);read();
 }
}
async function publish(){
 const root=document.querySelector('[data-composer]'),c=state.composer;const btn=root.querySelector('[data-publish]');btn.disabled=true;btn.textContent='Publishing…';
 try{
  let media={};
  if(c.media){const fd=new FormData();fd.append('file',c.media.file);fd.append('trimStart',String(c.media.trimStart||0));fd.append('trimEnd',String(c.media.trimEnd||Math.min(Number(c.media.sourceDuration||20),20)));fd.append('sourceDuration',String(c.media.sourceDuration||0));const t=token();const r=await fetch(uploadUrl(),{method:'POST',headers:t?{Authorization:/^Bearer /i.test(t)?t:'Bearer '+t}:{},body:fd});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||'Media upload failed');const uploaded=d?.data?.cloudinary||d?.cloudinary||d; const mediaUrl=uploaded?.url||uploaded?.secure_url||d?.url; const mediaPublicId=uploaded?.public_id||uploaded?.publicId||d?.publicId; if(!mediaUrl)throw new Error('Media upload succeeded but no media URL was returned'); media={mediaUrl,mediaPublicId,mediaMime:c.media.file.type};}
  const activePane=root.querySelector('.ns-pane.active')?.dataset.pane;
  const type=activePane==='poll'?'poll':activePane==='link'?'link':activePane==='media'?(c.media?.type||'image'):'text';
  let content=(root.querySelector('[data-content]')?.value||c.content||'').trim();
  c.content=content;
  if(type==='poll')content=root.querySelector('[data-pollq]').value.trim();
  if(type==='link')content=root.querySelector('[data-linkcaption]').value.trim();
  const options=[...root.querySelectorAll('[data-poll0],[data-poll1],[data-pollx]')].map(x=>x.value.trim()).filter(Boolean);
  const body={type,content,caption:c.caption||'',background:c.background,font:c.font,privacy:root.querySelector('[data-privacy]').value,privacyList:(root.querySelector('[data-privacy-list]')?.value||'').split(',').map(x=>x.trim()).filter(Boolean),durationSeconds:Number(root.querySelector('[data-duration]').value),moodType:root.querySelector('[data-mood]').value.trim(),category:root.querySelector('[data-category]').value.trim(),intent:root.querySelector('[data-intent]').value.trim(),topics:root.querySelector('[data-topics]').value.split(',').map(x=>x.trim()).filter(Boolean),allowReplies:root.querySelector('[data-replies]').checked,allowReactions:root.querySelector('[data-reactions]').checked,allowSharing:root.querySelector('[data-sharing]').checked,linkUrl:type==='link'?root.querySelector('[data-link]').value.trim():'',musicUrl:root.querySelector('[data-music]')?.value.trim()||'',stickers:c.stickers,...media};
  if(type==='poll')body.pollOptions=options;
  await api('',{method:'POST',body:JSON.stringify(body)});
  closeComposer();await loadFeed();toast('Your status is live for 24 hours');
 }catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='Publish Status'}
}
window.addEventListener('kyn:status:new',()=>loadFeed());window.addEventListener('message',e=>{const t=e.data?.type||'';if(/^status:/i.test(t)||/^STATUS_/i.test(t)||t==='FRIEND_STATUS_NEW')loadFeed()});
window.addEventListener('kyn:status:deleted',()=>loadFeed());
window.addEventListener('kyn:status:expired',()=>loadFeed());
setInterval(()=>{if(document.visibilityState!=='hidden')loadFeed()},30000);
window.addEventListener('identity:changed',()=>{document.querySelectorAll('#necpa-status-root').length&&renderFeed()});
function boot(){if(!document.body)return;const style=document.createElement('style');style.textContent="\n#necpa-status-launcher{position:fixed;right:22px;bottom:86px;z-index:8990;border:0;border-radius:999px;padding:12px 18px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-weight:800;box-shadow:0 12px 35px rgba(37,99,235,.32);cursor:pointer;display:flex;align-items:center;gap:8px}\n#necpa-status-launcher .ns-dot{width:9px;height:9px;background:#22c55e;border-radius:50%;box-shadow:0 0 0 4px rgba(34,197,94,.18)}\n#necpa-status-root,#necpa-status-root *{box-sizing:border-box}\n#necpa-status-root{position:fixed;inset:0;z-index:8989;background:rgba(2,6,23,.72);backdrop-filter:blur(18px);display:none;align-items:stretch;justify-content:center;padding:22px}\n#necpa-status-root.open{display:flex}\n.ns-shell{width:min(1180px,100%);height:min(920px,100%);background:var(--app-secondary-surface,#f8fafc);color:var(--app-text-color,#0f172a);border-radius:28px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.35);display:grid;grid-template-columns:310px 1fr;position:relative}\n.ns-side{border-right:1px solid rgba(100,116,139,.16);padding:22px;display:flex;flex-direction:column;gap:14px;overflow:auto;background:rgba(255,255,255,.72)}\n.ns-brand{display:flex;align-items:center;justify-content:space-between}.ns-brand h2{font-size:22px;margin:0}.ns-brand small{display:block;color:#64748b;margin-top:3px}\n.ns-close{border:0;background:rgba(100,116,139,.1);width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:18px}\n.ns-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ns-tab{border:0;background:transparent;padding:10px;border-radius:12px;font-weight:700;cursor:pointer;color:#64748b}.ns-tab.active{background:#2563eb;color:#fff}\n.ns-my-card{padding:14px;border-radius:18px;background:linear-gradient(135deg,#eff6ff,#f5f3ff);display:flex;align-items:center;gap:12px;cursor:pointer}\n.ns-avatar{width:48px;height:48px;border-radius:50%;background:#e2e8f0;background-size:cover;background-position:center;display:grid;place-items:center;font-weight:800;flex:none}\n.ns-avatar-ring{box-shadow:0 0 0 3px #2563eb,0 0 0 6px #fff}\n.ns-add{margin-left:auto;width:34px;height:34px;border-radius:50%;border:0;background:#2563eb;color:#fff;font-size:22px;cursor:pointer}\n.ns-section-title{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:800;margin:8px 0 2px}\n.ns-list{display:flex;flex-direction:column;gap:8px}.ns-person{display:flex;align-items:center;gap:10px;padding:9px;border-radius:14px;cursor:pointer}.ns-person:hover{background:rgba(37,99,235,.07)}\n.ns-person .ns-avatar{width:42px;height:42px}.ns-person-info{min-width:0;flex:1}.ns-person-name{font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ns-person-time{font-size:11px;color:#64748b}.ns-unseen{width:8px;height:8px;background:#2563eb;border-radius:50%}\n.ns-main{position:relative;overflow:hidden;display:flex;flex-direction:column}\n.ns-main-head{padding:18px 22px;border-bottom:1px solid rgba(100,116,139,.14);display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.72);backdrop-filter:blur(14px)}\n.ns-search{flex:1;border:1px solid rgba(100,116,139,.2);border-radius:14px;padding:11px 14px;background:transparent;color:inherit;outline:none}.ns-search:focus{border-color:#2563eb}\n.ns-filter{border:0;background:rgba(100,116,139,.1);padding:10px 12px;border-radius:12px;font-weight:700;color:inherit}\n.ns-feed{padding:22px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:16px}\n.ns-card{border-radius:22px;overflow:hidden;background:#0f172a;min-height:320px;position:relative;cursor:pointer;box-shadow:0 10px 25px rgba(15,23,42,.12)}\n.ns-card-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.ns-card-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(2,6,23,.86),rgba(2,6,23,0) 65%)}\n.ns-card-top{position:absolute;top:13px;left:13px;right:13px;display:flex;align-items:center;gap:9px;color:#fff}.ns-card-top .ns-avatar{width:36px;height:36px;border:2px solid #fff}\n.ns-card-user{font-size:13px;font-weight:800;flex:1}.ns-card-time{font-size:10px;opacity:.8}\n.ns-card-bottom{position:absolute;left:15px;right:15px;bottom:15px;color:#fff}.ns-card-caption{font-size:14px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.ns-card-meta{display:flex;gap:10px;margin-top:9px;font-size:11px;opacity:.82}\n.ns-empty{grid-column:1/-1;text-align:center;padding:80px 20px;color:#64748b}.ns-empty strong{display:block;font-size:18px;color:inherit;margin-bottom:5px}\n.ns-composer{position:absolute;inset:0;background:rgba(2,6,23,.82);backdrop-filter:blur(16px);display:none;align-items:center;justify-content:center;padding:22px;z-index:20}.ns-composer.open{display:flex}\n.ns-compose-box{width:min(700px,100%);max-height:92%;overflow:auto;background:#fff;color:#0f172a;border-radius:24px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.3)}\n.ns-compose-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.ns-compose-head h3{margin:0;font-size:20px}.ns-icon-btn{border:0;background:#eef2ff;width:38px;height:38px;border-radius:50%;cursor:pointer}\n.ns-compose-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:14px}.ns-compose-tab{border:1px solid #e2e8f0;background:#fff;padding:10px;border-radius:12px;font-weight:750;cursor:pointer}.ns-compose-tab.active{background:#2563eb;color:#fff;border-color:#2563eb}\n.ns-pane{display:none}.ns-pane.active{display:block}\n.ns-textarea{width:100%;min-height:190px;border:1px solid #e2e8f0;border-radius:18px;padding:18px;font-size:18px;resize:vertical;outline:none}.ns-textarea:focus{border-color:#2563eb}\n.ns-editor{border-radius:20px;min-height:280px;padding:25px;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;position:relative;overflow:hidden}.ns-editor .ns-edit-text{font-size:30px;font-weight:800;line-height:1.25;word-break:break-word}\n.ns-bg-grid,.ns-sticker-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:10px}.ns-bg,.ns-sticker{height:38px;border-radius:10px;border:2px solid transparent;cursor:pointer}.ns-sticker{background:#f8fafc;font-size:22px}.ns-bg.selected{border-color:#0f172a}\n.ns-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ns-input,.ns-select{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;background:#fff;min-width:0;flex:1}.ns-check{display:flex;align-items:center;gap:8px;font-size:13px;margin-top:10px}\n.ns-upload{border:2px dashed #cbd5e1;border-radius:18px;padding:38px 20px;text-align:center;cursor:pointer}.ns-upload:hover{border-color:#2563eb;background:#eff6ff}.ns-preview{width:100%;max-height:360px;object-fit:contain;border-radius:18px;background:#020617}.ns-editor-tools{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.ns-tool{border:1px solid #e2e8f0;background:#fff;padding:8px 11px;border-radius:10px;cursor:pointer}\n.ns-compose-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}.ns-btn{border:0;border-radius:13px;padding:11px 16px;font-weight:800;cursor:pointer}.ns-btn.primary{background:#2563eb;color:#fff}.ns-btn.ghost{background:#eef2f7;color:#334155}.ns-btn.danger{background:#fee2e2;color:#b91c1c}\n.ns-viewer{position:absolute;inset:0;background:#000;display:none;z-index:40;color:#fff}.ns-viewer.open{display:flex;align-items:center;justify-content:center}.ns-viewer-stage{width:min(620px,100%);height:100%;position:relative;display:flex;align-items:center;justify-content:center;background:#000}.ns-viewer-media{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}.ns-viewer-text{padding:50px;max-width:620px;text-align:center;font-size:34px;font-weight:850;line-height:1.3;white-space:pre-wrap}.ns-viewer-grad{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom,rgba(0,0,0,.72),transparent 25%,transparent 70%,rgba(0,0,0,.88))}\n.ns-progress{position:absolute;top:12px;left:12px;right:12px;display:flex;gap:4px;z-index:4}.ns-progress i{height:3px;background:rgba(255,255,255,.3);flex:1;border-radius:3px;overflow:hidden}.ns-progress b{display:block;height:100%;width:0;background:#fff}.ns-viewer-head{position:absolute;top:25px;left:20px;right:20px;z-index:5;display:flex;align-items:center;gap:10px}.ns-viewer-head .ns-avatar{width:38px;height:38px;border:2px solid #fff}.ns-viewer-name{font-weight:850}.ns-viewer-time{font-size:11px;opacity:.75}.ns-viewer-actions{margin-left:auto;display:flex;gap:5px}.ns-viewer-actions button,.ns-nav{border:0;background:rgba(0,0,0,.35);color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:18px}.ns-nav{position:absolute;top:50%;z-index:5}.ns-prev{left:12px}.ns-next{right:12px}.ns-viewer-bottom{position:absolute;left:20px;right:20px;bottom:20px;z-index:6}.ns-reactions{display:flex;gap:5px;margin-bottom:9px}.ns-reaction{border:0;background:rgba(255,255,255,.14);border-radius:999px;padding:7px 10px;color:#fff;cursor:pointer;font-size:17px}.ns-reply-row{display:flex;gap:8px}.ns-reply{flex:1;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:12px 15px;outline:none} .ns-viewer-list{position:absolute;left:20px;right:20px;top:86px;bottom:105px;z-index:12;background:rgba(255,255,255,.98);color:#0f172a;border-radius:18px;padding:12px;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);backdrop-filter:blur(18px)}\\n.ns-viewer-list-head{display:flex;align-items:center;gap:10px;padding:8px 4px 12px;position:sticky;top:0;background:inherit;z-index:2}\\n.ns-viewer-list-head span{font-size:11px;color:#64748b;flex:1}\\n.ns-viewer-list-head button{border:0;background:#eef2f7;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px}\\n.ns-viewer-row{display:flex;align-items:center;gap:10px;padding:9px 5px;border-top:1px solid rgba(100,116,139,.12)}\\n.ns-viewer-row .ns-avatar{width:40px;height:40px}\\n.ns-viewer-row div{min-width:0}\\n.ns-viewer-row b{display:block}\\n.ns-viewer-row small{display:block;color:#64748b;font-size:11px;margin-top:2px}\\n.ns-viewer-empty{padding:30px 10px;text-align:center;color:#64748b}\\n.ns-viewer-more{display:none;position:absolute;right:20px;bottom:82px;background:#fff;color:#0f172a;border-radius:16px;padding:8px;min-width:170px;z-index:9;box-shadow:0 15px 40px rgba(0,0,0,.3)}.ns-viewer-more.open{display:block}.ns-viewer-more button{display:block;width:100%;border:0;background:transparent;text-align:left;padding:10px;border-radius:10px;cursor:pointer}.ns-viewer-more button:hover{background:#f1f5f9}\n.ns-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:11px 16px;border-radius:999px;z-index:99999;display:none}.ns-toast.show{display:block}\n@media(max-width:800px){#necpa-status-root{padding:0}.ns-feed-back{display:inline-flex}.ns-shell{height:100%;border-radius:0;grid-template-columns:1fr}.ns-main-head{padding:13px}.ns-feed{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px;gap:10px}.ns-card{min-height:280px}.ns-compose-box{border-radius:20px}.ns-viewer-text{font-size:28px;padding:30px}.ns-nav{width:34px;height:34px}#necpa-status-launcher{right:14px;bottom:74px}}\n@media(min-width:801px){#necpa-status-root[data-side-open=\"true\"] .ns-side{display:flex}}\n";document.head.appendChild(style);const themeStyle=document.createElement('style');themeStyle.textContent=`:root{--status-surface:var(--app-secondary-surface,var(--surface,#f8fafc));--status-card:var(--app-primary-surface,var(--card-background,#fff));--status-text:var(--app-text-color,var(--text-color,#0f172a));--status-muted:var(--app-muted-text,var(--muted-text,#64748b));--status-border:var(--app-border-color,var(--border-color,rgba(100,116,139,.16)));--status-accent:var(--app-primary-color,var(--primary-color,#2563eb));}
#necpa-status-root{padding:0!important;width:100vw!important;height:100dvh!important;min-height:100dvh!important;max-width:none!important;max-height:none!important}
#necpa-status-root.open{display:flex!important}
#necpa-status-root .ns-shell{width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important}
#necpa-status-root .ns-viewer{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important}
#necpa-status-root .ns-viewer-stage{width:100vw!important;max-width:none!important;height:100dvh!important;min-height:100dvh!important}
.ns-shell{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;border-radius:0!important;background:var(--status-surface);color:var(--status-text);grid-template-columns:minmax(260px,300px) minmax(0,1fr)}
.ns-side,.ns-main-head{background:var(--status-card);border-color:var(--status-border)}
.ns-search,.ns-input,.ns-select,.ns-textarea{background:var(--status-card);color:var(--status-text);border-color:var(--status-border)}
.ns-compose-box{background:var(--status-card);color:var(--status-text)}
.ns-compose-tab,.ns-tool{background:var(--status-card);color:var(--status-text);border-color:var(--status-border)}
.ns-brand h2,.ns-person-name,.ns-compose-head h3,.ns-feed-title span{color:var(--status-text)}
.ns-brand small,.ns-person-time,.ns-section-title,.ns-status-label,.ns-feed-title small{color:var(--status-muted)}
.ns-tab.active,.ns-btn.primary,.ns-add{background:var(--status-accent);border-color:var(--status-accent)}
.ns-feed{display:block;padding:20px;overflow:auto}
.ns-feed-section{margin-bottom:26px}.ns-feed-title{display:flex;justify-content:space-between;align-items:center;margin:0 2px 12px;font-size:15px;font-weight:850}.ns-feed-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.ns-feed-section.is-new .ns-card{box-shadow:0 0 0 2px var(--status-accent),0 12px 30px rgba(0,0,0,.12)}
.ns-story-ring{width:9px;height:9px;border-radius:50%;display:block;flex:none}.ns-story-ring.unviewed{background:var(--status-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--status-accent) 16%,transparent)}.ns-story-ring.viewed{background:var(--status-muted);opacity:.55}.ns-person.is-unviewed{background:color-mix(in srgb,var(--status-accent) 7%,transparent)}
.ns-status-label{font-size:10px;letter-spacing:.12em;font-weight:900;margin:8px 2px 4px}.ns-status-label.viewed-label{margin-top:18px}.ns-empty-mini{padding:12px;color:var(--status-muted);font-size:13px}
@media(max-width:800px){.ns-shell{grid-template-columns:1fr}.ns-main-head{padding:10px;gap:7px}.ns-main-head .ns-search{min-width:0;width:0}.ns-main-head .ns-filter{max-width:105px}.ns-main-head .ns-btn{padding:9px 11px}.ns-feed{padding:10px}.ns-feed-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ns-card{min-height:250px;border-radius:16px}.ns-composer{padding:0;align-items:stretch}.ns-compose-box{width:100%;height:100%;max-height:none;border-radius:0;padding:14px}.ns-compose-tabs{grid-template-columns:repeat(4,minmax(0,1fr));position:sticky;top:0;z-index:2;background:var(--status-card);padding-bottom:8px}.ns-compose-tab{padding:9px 4px;font-size:12px}.ns-textarea{min-height:150px}.ns-editor{min-height:230px}.ns-row{display:grid;grid-template-columns:1fr}.ns-input,.ns-select{width:100%;box-sizing:border-box}}

/* MOBILE ONE-PANEL: list is the landing screen, feed/viewer/composer are deeper screens */
.ns-arrow,.ns-back,.ns-browse{display:none}.ns-feed-back{display:none}
.ns-vback{border:0;background:rgba(0,0,0,.35);color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:18px;flex:none}
.ns-cback{margin-right:12px;flex:none}
.ns-compose-head>div{flex:1;min-width:0}
#necpa-status-root .ns-brand .ns-close{display:none!important}\n#necpa-status-root.ns-mobile .ns-x{display:none}
#necpa-status-root.ns-mobile .ns-arrow{display:none}
#necpa-status-root.ns-mobile .ns-back{display:inline-flex;align-items:center;justify-content:center;flex:none}
#necpa-status-root.ns-mobile .ns-browse{display:flex;align-items:center;justify-content:space-between;width:100%;border:0;border-radius:14px;padding:12px 14px;background:color-mix(in srgb,var(--status-accent,#2563eb) 10%,transparent);color:var(--status-accent,#2563eb);font-weight:800;font-size:14px;cursor:pointer}
#necpa-status-root.ns-mobile .ns-brand .ns-close{order:-1;margin-right:12px}
#necpa-status-root.ns-mobile .ns-brand>div{flex:1;min-width:0}
#necpa-status-root.ns-mobile .ns-shell{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
#necpa-status-root.ns-mobile .ns-side,#necpa-status-root.ns-mobile .ns-main{grid-area:1/1;min-width:0;min-height:0}
#necpa-status-root.ns-mobile .ns-side{display:flex;width:100%;height:100%;border-right:0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
#necpa-status-root.ns-mobile[data-panel="list"] .ns-main{pointer-events:none}
#necpa-status-root.ns-mobile[data-panel="list"] .ns-main-head,#necpa-status-root.ns-mobile[data-panel="list"] .ns-feed{display:none}
#necpa-status-root.ns-mobile[data-panel="list"] .ns-composer.open,#necpa-status-root.ns-mobile[data-panel="list"] .ns-viewer.open{pointer-events:auto}
#necpa-status-root.ns-mobile[data-panel="feed"] .ns-side{display:none}
`;document.head.appendChild(themeStyle);syncTheme();try{const src=(window.parent&&window.parent!==window)?window.parent.document.documentElement:document.documentElement;new MutationObserver(syncTheme).observe(src,{attributes:true,attributeFilter:['style','class','data-theme']})}catch(_){}mount()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.__NecpaProfessionalStatus={open,close,loadFeed,goBack:goBackOne,resetToList};
})();