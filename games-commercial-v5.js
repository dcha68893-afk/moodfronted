/* Mood Arcade V5: shared progression, themes, challenges and safe UX layer. */
(function(){'use strict';if(window.__MOOD_ARCADE_V5__)return;window.__MOOD_ARCADE_V5__=1;
const KEY='mood.arcade.v5';const themes=['#8b5cf6','#38bdf8','#22c55e','#f59e0b','#ec4899','#14b8a6']; /* accent hues only -- backgrounds come from the app theme */
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
function roomText(r){if(!r)return 'No game room yet';if(r.status==='waiting')return 'Waiting for the other player…';if(r.status==='ready')return 'Opponent joined. Both players are ready — the same match is about to start.';if(r.status==='playing')return 'MATCH LIVE • You each get one attempt. Finish the same level and your scores are compared.';if(r.status==='finished')return r.winnerId?'Match complete — winner awarded coins.':'Match complete — draw.';return 'Room closed.'}
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
 if(r){m.querySelector('#gameRoomCode').textContent=r.code;m.querySelector('#gameRoomPlayers').textContent='Host: '+(r.hostId?'Player 1':'—')+'   •   Guest: '+(r.guestId?'Player 2':'Waiting…');m.querySelector('#gameRoomCreate').disabled=true}
 else{m.querySelector('#gameRoomCreate').disabled=false;m.querySelector('#gameRoomPlayers').textContent='Only someone with the code can join this room.'}
}
async function createRoom(){
 try{const j=await roomApi('',{method:'POST',body:JSON.stringify({gameType:roomGame(),level:level(roomGame())})});room=j.room;renderRoom();startRoomPoll();toast('Private game created');}
 catch(e){toast(e.message)}
}
async function joinRoom(code){
 code=String(code||'').trim().toUpperCase().replace(/\s/g,'');if(code.length<6)return toast('Enter the game code');
 try{const j=await roomApi('/'+encodeURIComponent(code)+'/join',{method:'POST',body:'{}'});room=j.room;window.__gameRoomMatch=room;renderRoom();startRoomPoll();launchMatchIfReady();if(room.gameType!==roomGame()){document.body.dataset.game=room.gameType;try{window.openGame(room.gameType)}catch(_){} }toast('Joined '+room.gameType+' game');}
 catch(e){toast(e.message)}
}
async function openRoom(){
 const m=roomModal();m.classList.add('show');if(!room){const code=new URLSearchParams(location.search).get('gameRoom');if(code)await joinRoom(code)}renderRoom();startRoomPoll();
}
function launchMatchIfReady(){if(!room||!['ready','playing'].includes(room.status))return;window.__gameRoomMatch=room;const m=document.getElementById('gameRoomModal');if(m)m.classList.remove('show');try{window.dispatchEvent(new CustomEvent('game:match-ready',{detail:room}))}catch(_){} }
function startRoomPoll(){stopRoomPoll();roomPoll=setInterval(async()=>{if(!room)return;try{const j=await roomApi('/'+encodeURIComponent(room.code));room=j.room;renderRoom();launchMatchIfReady()}catch(_){}},1500)}
function stopRoomPoll(){if(roomPoll){clearInterval(roomPoll);roomPoll=null}}
async function roomComplete(score){
 if(!room||!room.code)return;
 try{const j=await roomApi('/'+encodeURIComponent(room.code)+'/result',{method:'POST',body:JSON.stringify({score:Number(score)||0})});room=j.room;renderRoom();}catch(e){toast(e.message)}
}
window.__gameRoomComplete=roomComplete;
function decorate(){applyTheme();let old=window.openGame;if(typeof old==='function'&&!window.__arcadeOpen){window.__arcadeOpen=1;window.openGame=function(g){document.body.dataset.game=g;const r=old.apply(this,arguments);setTimeout(()=>{applyTheme(g);data.games++;save();syncRoomButton()},50);return r}}
 if(!document.getElementById('gameRoomButton')){const b=document.createElement('button');b.id='gameRoomButton';b.textContent='⚔️ PLAY TOGETHER';Object.assign(b.style,{position:'fixed',right:'12px',bottom:'14px',zIndex:9997,padding:'11px 15px',borderRadius:'20px',border:'1px solid var(--g-accent)',background:'var(--kyn-bg-card)',color:'var(--kyn-text-primary)',boxShadow:'var(--kyn-shadow-md)',fontWeight:1000,fontSize:'11px'});b.onclick=openRoom;document.body.appendChild(b)}
 const oldHome=window.home;if(typeof oldHome==='function'&&!window.__arcadeHomeWrapped){window.__arcadeHomeWrapped=true;window.home=function(){stopRoomPoll();const r=oldHome.apply(this,arguments);syncRoomButton();return r}}
 function syncRoomButton(){const b=document.getElementById('gameRoomButton'),c=document.querySelector('[data-arcade-challenge]');const active=document.querySelector('.screen.active'),modal=active?.querySelector('.overlay.show');const visible=!!(active&&active.id!=='home'&&!modal);if(b)b.style.display=visible?'block':'none';if(c)c.style.display=visible?'block':'none';}
 syncRoomButton();const inviteCode=new URLSearchParams(location.search).get('gameRoom');if(inviteCode)setTimeout(()=>openRoom(),300);
 // FIX (CHALLENGE-BUTTON-DEDUP-BROKEN): this checked `$('[data-arcade-challenge]')`, but `$` in
 // this arcade is `id=>document.getElementById(id)` (defined in game-v3.html), not a CSS-selector
 // lookup — so it was always searching for a literal element with id="[data-arcade-challenge]",
 // which never exists, and the "already added" check could never actually match. Harmless today
 // only because decorate() happens to run once per page load; switched to a real selector query
 // so the guard actually works if this is ever called again.
 if(!document.querySelector('[data-arcade-challenge]')){const b=document.createElement('button');b.dataset.arcadeChallenge='1';b.textContent='⚔️ Challenge';Object.assign(b.style,{position:'fixed',right:'12px',bottom:'70px',zIndex:9997,padding:'10px 14px',borderRadius:'18px',border:'1px solid var(--g-accent)',background:'var(--kyn-bg-card)',color:'var(--kyn-text-primary)',boxShadow:'var(--kyn-shadow-md)',fontWeight:900});b.onclick=challenge;document.body.appendChild(b)}
}
window.MoodArcade={version:'5.0.0',state:data,level,setLevel,complete,applyTheme,challenge};
window.addEventListener('mood:level-changed',e=>applyTheme(e.detail&&e.detail.game));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
const gameRoomStyle=document.createElement('style');gameRoomStyle.id='game-room-css';gameRoomStyle.textContent=`\n.game-room-modal{position:fixed;inset:0;z-index:10000;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.68);backdrop-filter:blur(10px)}\n.game-room-modal.show{display:grid}.game-room-card{position:relative;width:min(92vw,430px);padding:24px;border-radius:26px;background:var(--kyn-bg-card);border:1px solid var(--kyn-border-strong);box-shadow:0 20px 60px #000b;text-align:center}\n.game-room-x{position:absolute;right:12px;top:10px;width:36px;height:36px;border-radius:12px;background:var(--g-surface);font-size:24px}\n.game-room-icon{font-size:42px}.game-room-card h2{margin:8px 0}.game-room-status{font-size:12px;color:var(--muted);min-height:32px}\n.game-room-codebox{padding:14px;border-radius:18px;background:var(--g-surface);border:1px solid var(--g-line);margin:12px 0}.game-room-codebox small{display:block;color:var(--muted);font-size:9px;letter-spacing:2px}.game-room-codebox b{display:block;font-size:28px;letter-spacing:6px;margin:5px 0 10px}.game-room-codebox button{margin:3px;padding:8px 10px;border-radius:12px;background:var(--g-surface-hi);font-size:10px;font-weight:900}\n.game-room-actions{display:grid;gap:9px}.game-room-primary,.game-room-actions button{min-height:46px;border-radius:15px;border:1px solid var(--g-line);background:var(--g-surface);font-weight:1000}.game-room-primary{background:var(--g-accent);color:#fff}.game-room-divider{font-size:10px;color:var(--muted);margin:2px}.game-room-actions input{height:46px;border-radius:15px;border:1px solid var(--g-line);background:var(--g-surface);color:var(--kyn-text-primary);text-align:center;font-size:18px;letter-spacing:4px;font-weight:1000}.game-room-player{margin-top:12px;font-size:11px;color:var(--muted)}\n`;document.head.appendChild(gameRoomStyle);
})();
