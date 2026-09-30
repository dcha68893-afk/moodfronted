/* Mood Arcade V5: shared progression, themes, challenges and safe UX layer. */
(function(){'use strict';if(window.__MOOD_ARCADE_V5__)return;window.__MOOD_ARCADE_V5__=1;
const KEY='mood.arcade.v5';const themes=['#8b5cf6','#38bdf8','#22c55e','#f59e0b','#ec4899','#14b8a6']; const MULTI_GAMES=new Set(['trivia','crossword']); /* accent hues only -- backgrounds come from the app theme */
let data;try{data=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){} data=data||{levels:{water:1,block:1,trivia:1,crossword:1},best:{water:0,block:0,trivia:0,crossword:0},streak:0,games:0,challenges:0};
function save(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}}
function game(){return document.body.dataset.game||''}function level(g=game()){return Math.max(1,data.levels[g]||1)}
function applyTheme(g=game()){const c=themes[Math.min(themes.length-1,Math.floor((level(g)-1)/2))];document.documentElement.style.setProperty('--g-accent',c);document.body.dataset.arcadeLevel=level(g)}
function setLevel(g,n){data.levels[g]=Math.max(1,n);save();applyTheme(g);window.dispatchEvent(new CustomEvent('mood:level-changed',{detail:{game:g,level:data.levels[g]}}))}
function complete(g,score=0){data.games++;data.best[g]=Math.max(data.best[g]||0,Number(score)||0);data.streak++;setLevel(g,level(g)+1);save();window.dispatchEvent(new CustomEvent('mood:game-complete',{detail:{game:g,score,level:level(g)}}))}
function challenge(){const g=game(),s=data.best[g]||0,dataText=`Mood ${g} challenge — beat ${s} points on level ${level(g)}!`;data.challenges++;save();if(navigator.share)navigator.share({title:'Mood Challenge',text:dataText}).catch(()=>{});else if(navigator.clipboard)navigator.clipboard.writeText(dataText).then(()=>alert('Challenge copied!')).catch(()=>{});else alert(dataText)}
let room=null,roomPoll=null;
async function roomApi(path,options){const opts=Object.assign({credentials:'include',headers:{'Content-Type':'application/json'}},options||{});const token=localStorage.getItem('accessToken')||localStorage.getItem('token')||sessionStorage.getItem('accessToken')||sessionStorage.getItem('token');if(token&&!opts.headers.Authorization)opts.headers.Authorization='Bearer '+token;const r=await fetch('/api/games/rooms'+path,opts);let j={};try{j=await r.json()}catch(_){}if(!r.ok){const detail=j.error||j.message||('HTTP '+r.status);throw new Error('Game room: '+detail)}return j}
function roomGame(){return game()||document.querySelector('.screen.active')?.id||'water'}
function roomLink(code){return location.origin+location.pathname+'?gameRoom='+encodeURIComponent(code)}
function roomText(r){if(!r)return 'No game room yet';if(r.status==='waiting')return 'Waiting for the other player…';if(r.status==='ready')return 'Opponent joined. Both players are ready — the same match is about to start.';if(r.status==='playing')return MULTI_GAMES.has(r.gameType)?'MATCH LIVE • Finish your level. Score and time appear in the final standings.':'MATCH LIVE • One attempt each. Scores are compared after both finish.';if(r.status==='finished')return r.winnerId?'Match complete — winner awarded coins.':'Match complete — draw.';return 'Room closed.'}
function roomModal(){
 let m=document.getElementById('gameRoomModal');if(m)return m;
 m=document.createElement('div');m.id='gameRoomModal';m.className='game-room-modal';
 m.innerHTML='<div class="game-room-card"><button class="game-room-x" id="gameRoomClose">×</button><div class="game-room-icon">⚔️</div><h2>Play Together</h2><p class="game-room-status" id="gameRoomStatus">Create a private room or enter a code.</p><div class="game-room-codebox" id="gameRoomCodeBox" hidden><small>PRIVATE GAME CODE</small><b id="gameRoomCode">--------</b><div><button id="gameRoomCopy">COPY CODE</button><button id="gameRoomShare">SHARE LINK</button></div></div><div class="game-room-actions"><button class="game-room-primary" id="gameRoomCreate">CREATE GAME</button><div class="game-room-divider"><span>OR</span></div><input id="gameRoomJoinInput" maxlength="8" autocomplete="off" placeholder="ENTER GAME CODE"><button id="gameRoomJoin">JOIN GAME</button></div><div class="game-room-player" id="gameRoomPlayers"></div></div>';
 document.body.appendChild(m);
 m.querySelector('#gameRoomClose').onclick=()=>{m.classList.remove('show');stopRoomPoll()};
 m.querySelector('#gameRoomCreate').onclick=createRoom;
 m.querySelector('#gameRoomJoin').onclick=()=>joinRoom(m.querySelector('#gameRoomJoinInput').value);
 m.querySelector('#gameRoomCopy').onclick=()=>navigator.clipboard?.writeText(room?.code||'').then(()=>toast('Game code copied'));
 m.querySelector('#gameRoomShare').onclick=()=>navigator.share?navigator.share({title:'Join my game',text:'Join my '+roomGame()+' game with this code: '+room.code,url:roomLink(room.code)}).catch(()=>{}):navigator.clipboard?.writeText(roomLink(room.code)).then(()=>toast('Game link copied'));
 return m;
}
function renderRoom(){
 const m=roomModal(),r=room;window.__gameRoomMatch=r||null;
 m.querySelector('#gameRoomStatus').textContent=roomText(r);
 const box=m.querySelector('#gameRoomCodeBox');box.hidden=!r;
 if(r){m.querySelector('#gameRoomCode').textContent=r.code;m.querySelector('#gameRoomPlayers').textContent=(r.players||[]).map((p,i)=>'Player '+(i+1)+(p.completed?' ✓':p.progress>0?' • '+Math.round(p.progress)+'%':' • ready')).join('   ');m.querySelector('#gameRoomCreate').disabled=true}
 else{m.querySelector('#gameRoomCreate').disabled=false;m.querySelector('#gameRoomPlayers').textContent='Only someone with the private code can join this room.'}
 renderLiveMatch();try{window.dispatchEvent(new CustomEvent('game:room:update',{detail:r}))}catch(_){}
}
async function createRoom(){
 try{const j=await roomApi('',{method:'POST',body:JSON.stringify({gameType:roomGame(),level:level(roomGame()),subject:window.__triviaSelectedSubject||null})});room=j.room;window.__gameRoomRole=j.role||'host';renderRoom();startRoomPoll();toast('Private game created');}
 catch(e){toast(e.message)}
}
async function joinRoom(code){
 code=String(code||'').trim().toUpperCase().replace(/\s/g,'');if(code.length<6)return toast('Enter the game code');
 try{const j=await roomApi('/'+encodeURIComponent(code)+'/join',{method:'POST',body:'{}'});room=j.room;window.__gameRoomRole=j.role||'guest';window.__gameRoomMatch=room;renderRoom();startRoomPoll();launchMatchIfReady();if(room.gameType!==roomGame()){document.body.dataset.game=room.gameType;try{window.openGame(room.gameType)}catch(_){} }toast('Joined '+room.gameType+' game');}
 catch(e){toast(e.message)}
}
async function openRoom(){
 const m=roomModal();m.classList.add('show');if(!room){const code=new URLSearchParams(location.search).get('gameRoom');if(code)await joinRoom(code)}renderRoom();startRoomPoll();
}
function launchMatchIfReady(){if(!room||!['ready','playing'].includes(room.status))return;window.__gameRoomMatch=room;const active=document.querySelector('.screen.active')?.id;if(active!==room.gameType&&typeof window.openGame==='function'){try{window.openGame(room.gameType)}catch(_){}}const m=document.getElementById('gameRoomModal');if(m)m.classList.remove('show');renderLiveMatch();try{window.dispatchEvent(new CustomEvent('game:match-ready',{detail:room}))}catch(_){} }
function startRoomPoll(){stopRoomPoll();roomPoll=setInterval(async()=>{if(!room)return;try{const j=await roomApi('/'+encodeURIComponent(room.code));const prevGame=room.gameType;room=j.room;if(prevGame&&room.gameType!==prevGame)toast('Your partner switched to '+(GAME_LABEL[room.gameType]||room.gameType));if(j.role)window.__gameRoomRole=j.role;renderRoom();launchMatchIfReady()}catch(_){}},1500)}
function stopRoomPoll(){if(roomPoll){clearInterval(roomPoll);roomPoll=null}}
async function roomState(state){
 if(!room||!room.code)return;
 try{const j=await roomApi('/'+encodeURIComponent(room.code)+'/state',{method:'POST',body:JSON.stringify({state:state||{}})});room=j.room;renderRoom();}catch(_){}}
async function roomComplete(score,meta={}){
 if(!room||!room.code)return;
 try{const j=await roomApi('/'+encodeURIComponent(room.code)+'/result',{method:'POST',body:JSON.stringify({score:Number(score)||0,timeMs:meta.timeMs==null?undefined:Number(meta.timeMs)||0,answered:Number(meta.answered)||0,correct:Number(meta.correct)||0})});room=j.room;renderRoom();}catch(e){toast(e.message)}
}
function renderLiveMatch(){
 let h=document.getElementById('gameMatchHud');if(!h){h=document.createElement('div');h.id='gameMatchHud';document.body.appendChild(h)}
 const r=room,active=document.querySelector('.screen.active');if(!r||!active||active.id==='home'){h.classList.remove('show');return}h.classList.add('show');
 const subject=r.state?.subject?(' • '+String(r.state.subject).replace(/^./,x=>x.toUpperCase())):'';
 const left=Math.max(0,new Date(r.expiresAt||Date.now()).getTime()-Date.now());
 const leftText=String(Math.floor(left/3600000)).padStart(2,'0')+':'+String(Math.floor(left/60000)%60).padStart(2,'0')+':'+String(Math.floor(left/1000)%60).padStart(2,'0');
 const list=(r.status==='finished'&&Array.isArray(r.state?.results))?r.state.results:(r.players||[]);
 const rows=list.map((p,i)=>'<div class="gm-row"><b>'+(p.rank?'#'+p.rank:'Player '+(i+1))+'</b><span>'+((p.completed?'✓ FINISHED':(p.progress?Math.round(p.progress)+'%':'PLAYING')))+' · '+(p.score==null?'—':Number(p.score).toLocaleString())+' pts'+(p.timeMs!=null?' · '+Math.round(p.timeMs/1000)+'s':'')+(p.rewardCoins!=null?' · 🪙 '+p.rewardCoins:'')+'</span></div>').join('');
 h.innerHTML='<div class="gm-head"><span>⚔️ '+String(r.gameType||'GAME').toUpperCase()+subject+'</span><button id="gmChange" type="button" style="font-size:10px;font-weight:900;padding:3px 8px;border-radius:10px;background:var(--g-surface-hi);color:inherit">CHANGE GAME</button><b>'+(r.status==='finished'?'RESULTS':'TIME '+leftText)+'</b></div>'+rows+(r.status==='finished'?'<div class="gm-result">'+(r.winnerId?'🏆 Match winner receives the top-position reward.':'🤝 Draw — tied players receive the draw reward.')+'</div>':'');
}
document.addEventListener('click',e=>{if(e.target&&e.target.id==='gmChange'&&typeof window.home==='function')window.home()});
window.__gameRoomState=roomState;window.__gameRoomComplete=roomComplete;
/* ---- Switch game inside a live room (same code, same two players) ---- */
const ROOM_GAME_LIST=['water','block','trivia','crossword','chess'];
const GAME_LABEL={water:'Water Sort',block:'Block Puzzle',trivia:'Trivia Master',crossword:'Word Connect',chess:'Chess'};
function shouldConfirmSwitch(g){return !!(room&&room.code&&['ready','playing','finished'].includes(room.status)&&(room.players||[]).length>=2&&g&&g!==room.gameType&&ROOM_GAME_LIST.includes(g))}
function openGameNoPrompt(g){window.__roomLaunching=1;try{window.openGame(g)}finally{window.__roomLaunching=0}}
async function changeRoomGame(g){
 try{
  const j=await roomApi('/'+encodeURIComponent(room.code)+'/change-game',{method:'POST',body:JSON.stringify({gameType:g,level:level(g),subject:g==='trivia'?(window.__triviaSelectedSubject||null):null})});
  room=j.room;if(j.role)window.__gameRoomRole=j.role;window.__gameRoomMatch=room;
  startRoomPoll();renderRoom();launchMatchIfReady();toast('Switched to '+(GAME_LABEL[g]||g)+' — same game code');
 }catch(e){toast(e.message)}
}
function leaveRoomLocally(){stopRoomPoll();room=null;window.__gameRoomMatch=null;window.__gameRoomRole=null;renderLiveMatch();try{window.dispatchEvent(new CustomEvent('game:room:update',{detail:null}))}catch(_){}}
function confirmSwitch(g){
 let m=document.getElementById('gameSwitchModal');if(m)m.remove();
 m=document.createElement('div');m.id='gameSwitchModal';m.className='game-room-modal show';
 const cur=GAME_LABEL[room.gameType]||room.gameType,nxt=GAME_LABEL[g]||g;
 m.innerHTML='<div class="game-room-card"><div class="game-room-icon">🔄</div><h2>Switch game?</h2><p class="game-room-status" style="min-height:0">End <b>'+cur+'</b> and play <b>'+nxt+'</b> with the same player. You keep the same game code <b>'+room.code+'</b>. Anyone new joining will need a new code.</p><div class="game-room-actions"><button class="game-room-primary" id="gsYes">END '+cur.toUpperCase()+' &amp; PLAY '+nxt.toUpperCase()+'</button><button id="gsSolo">Leave room &amp; play '+nxt+' alone</button><button id="gsNo">Keep playing '+cur+'</button></div></div>';
 document.body.appendChild(m);
 const close=()=>m.remove();
 m.querySelector('#gsYes').onclick=()=>{close();changeRoomGame(g)};
 m.querySelector('#gsSolo').onclick=()=>{close();leaveRoomLocally();openGameNoPrompt(g)};
 m.querySelector('#gsNo').onclick=()=>{close();const a=document.querySelector('.screen.active')?.id;if(a!==room.gameType)openGameNoPrompt(room.gameType)};
}
function decorate(){applyTheme();let old=window.openGame;if(typeof old==='function'&&!window.__arcadeOpen){window.__arcadeOpen=1;window.openGame=function(g){if(!window.__roomLaunching&&shouldConfirmSwitch(g)){confirmSwitch(g);return}document.body.dataset.game=g;const r=old.apply(this,arguments);setTimeout(()=>{applyTheme(g);data.games++;save();syncRoomButton()},50);return r}}
 if(!document.getElementById('gameRoomButton')){const b=document.createElement('button');b.id='gameRoomButton';b.type='button';b.title='Play together';b.setAttribute('aria-label','Play together');b.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6M15 14c3 0 6 1.5 6 5"/></svg>';Object.assign(b.style,{width:'34px',height:'34px',padding:'0',flex:'0 0 auto',display:'none',placeItems:'center',borderRadius:'50%',border:'1px solid var(--g-accent)',background:'var(--kyn-bg-card)',color:'var(--kyn-text-primary)',boxShadow:'var(--kyn-shadow-md)',zIndex:9997,cursor:'pointer'});b.onclick=openRoom;document.body.appendChild(b)}
 const oldHome=window.home;if(typeof oldHome==='function'&&!window.__arcadeHomeWrapped){window.__arcadeHomeWrapped=true;window.home=function(){stopRoomPoll();const r=oldHome.apply(this,arguments);syncRoomButton();return r}}
 function syncRoomButton(){const b=document.getElementById('gameRoomButton'),c=document.querySelector('[data-arcade-challenge]');const active=document.querySelector('.screen.active'),modal=active?.querySelector('.overlay.show');const visible=!!(active&&active.id!=='home'&&!modal);const host=visible?active.querySelector('.top,.wc-top,.ch-top'):null;[c,b].forEach(x=>{if(!x)return;x.style.display=visible?'grid':'none';if(!visible)return;if(host){x.style.position='static';if(x.parentNode!==host)host.appendChild(x)}else{x.style.position='fixed';x.style.top='12px';x.style.right=(x===c?'56px':'12px');if(x.parentNode!==document.body)document.body.appendChild(x)}});}
 syncRoomButton();const inviteCode=new URLSearchParams(location.search).get('gameRoom');if(inviteCode)setTimeout(()=>openRoom(),300);
 // FIX (CHALLENGE-BUTTON-DEDUP-BROKEN): this checked `$('[data-arcade-challenge]')`, but `$` in
 // this arcade is `id=>document.getElementById(id)` (defined in game-v3.html), not a CSS-selector
 // lookup — so it was always searching for a literal element with id="[data-arcade-challenge]",
 // which never exists, and the "already added" check could never actually match. Harmless today
 // only because decorate() happens to run once per page load; switched to a real selector query
 // so the guard actually works if this is ever called again.
 if(!document.querySelector('[data-arcade-challenge]')){const b=document.createElement('button');b.dataset.arcadeChallenge='1';b.type='button';b.title='Challenge a friend';b.setAttribute('aria-label','Challenge a friend');b.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l9 9M19 5l-9 9M4 20l4-4M20 20l-4-4"/></svg>';Object.assign(b.style,{width:'34px',height:'34px',padding:'0',flex:'0 0 auto',display:'none',placeItems:'center',borderRadius:'50%',border:'1px solid var(--g-accent)',background:'var(--kyn-bg-card)',color:'var(--kyn-text-primary)',boxShadow:'var(--kyn-shadow-md)',zIndex:9997,cursor:'pointer'});b.onclick=challenge;document.body.appendChild(b)}
}
window.MoodArcade={version:'5.0.0',state:data,level,setLevel,complete,applyTheme,challenge};
window.addEventListener('mood:level-changed',e=>applyTheme(e.detail&&e.detail.game));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
const gameRoomStyle=document.createElement('style');gameRoomStyle.id='game-room-css';gameRoomStyle.textContent=`\n.game-room-modal{position:fixed;inset:0;z-index:10000;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.68);backdrop-filter:blur(10px)}\n.game-room-modal.show{display:grid}.game-room-card{position:relative;width:min(92vw,430px);padding:24px;border-radius:26px;background:var(--kyn-bg-card);border:1px solid var(--kyn-border-strong);box-shadow:0 20px 60px #000b;text-align:center}\n.game-room-x{position:absolute;right:12px;top:10px;width:36px;height:36px;border-radius:12px;background:var(--g-surface);font-size:24px}\n.game-room-icon{font-size:42px}.game-room-card h2{margin:8px 0}.game-room-status{font-size:12px;color:var(--muted);min-height:32px}\n.game-room-codebox{padding:14px;border-radius:18px;background:var(--g-surface);border:1px solid var(--g-line);margin:12px 0}.game-room-codebox small{display:block;color:var(--muted);font-size:9px;letter-spacing:2px}.game-room-codebox b{display:block;font-size:28px;letter-spacing:6px;margin:5px 0 10px}.game-room-codebox button{margin:3px;padding:8px 10px;border-radius:12px;background:var(--g-surface-hi);font-size:10px;font-weight:900}\n.game-room-actions{display:grid;gap:9px}.game-room-primary,.game-room-actions button{min-height:46px;border-radius:15px;border:1px solid var(--g-line);background:var(--g-surface);font-weight:1000}.game-room-primary{background:var(--g-accent);color:#fff}.game-room-divider{font-size:10px;color:var(--muted);margin:2px}.game-room-actions input{height:46px;border-radius:15px;border:1px solid var(--g-line);background:var(--g-surface);color:var(--kyn-text-primary);text-align:center;font-size:18px;letter-spacing:4px;font-weight:1000}.game-room-player{margin-top:12px;font-size:11px;color:var(--muted)}\n`;gameRoomStyle.textContent+=`.gameMatchHud{position:fixed;left:50%;top:72px;transform:translateX(-50%);width:min(94vw,520px);z-index:9996;display:none;padding:10px 12px;border-radius:16px;background:rgba(8,12,24,.86);border:1px solid var(--g-accent);box-shadow:0 14px 35px #0007;backdrop-filter:blur(14px);color:var(--kyn-text-primary);font-size:10px}.gameMatchHud.show{display:block}.gm-head,.gm-row{display:flex;justify-content:space-between;gap:10px;align-items:center}.gm-head{font-weight:1000;margin-bottom:6px;color:var(--g-accent)}.gm-row{padding:4px 0;border-top:1px solid var(--kyn-border)}.gm-row span{color:var(--kyn-text-secondary)}.gm-result{text-align:center;margin-top:6px;padding-top:6px;border-top:1px solid var(--kyn-border);font-weight:900}`;document.head.appendChild(gameRoomStyle);
})();
