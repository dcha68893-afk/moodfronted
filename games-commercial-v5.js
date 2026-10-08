/* Mood Arcade V5: shared progression, themes, challenges and safe UX layer. */
(function(){'use strict';if(window.__MOOD_ARCADE_V5__)return;window.__MOOD_ARCADE_V5__=1;
const KEY='mood.arcade.v5';const themes=['#8b5cf6','#38bdf8','#22c55e','#f59e0b','#ec4899','#14b8a6']; const MULTI_GAMES=new Set(['trivia','crossword']); /* accent hues only -- backgrounds come from the app theme */
let data;try{data=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){} data=data||{levels:{block:1,trivia:1,crossword:1},best:{block:0,trivia:0,crossword:0},streak:0,games:0,challenges:0};
function save(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}}
function game(){return document.body.dataset.game||''}function level(g=game()){return Math.max(1,data.levels[g]||1)}
function applyTheme(g=game()){const c=themes[Math.min(themes.length-1,Math.floor((level(g)-1)/2))];document.documentElement.style.setProperty('--g-accent',c);document.body.dataset.arcadeLevel=level(g)}
function setLevel(g,n){data.levels[g]=Math.max(1,n);save();applyTheme(g);window.dispatchEvent(new CustomEvent('mood:level-changed',{detail:{game:g,level:data.levels[g]}}))}
function complete(g,score=0){data.games++;data.best[g]=Math.max(data.best[g]||0,Number(score)||0);data.streak++;setLevel(g,level(g)+1);save();window.dispatchEvent(new CustomEvent('mood:game-complete',{detail:{game:g,score,level:level(g)}}))}
function challenge(){const g=game(),s=data.best[g]||0,dataText=`Mood ${g} challenge — beat ${s} points on level ${level(g)}!`;data.challenges++;save();if(navigator.share)navigator.share({title:'Mood Challenge',text:dataText}).catch(()=>{});else if(navigator.clipboard)navigator.clipboard.writeText(dataText).then(()=>alert('Challenge copied!')).catch(()=>{});else alert(dataText)}
let room=null,roomPoll=null;
async function roomApi(path,options){const opts=Object.assign({credentials:'include',headers:{'Content-Type':'application/json'}},options||{});const token=localStorage.getItem('accessToken')||localStorage.getItem('token')||sessionStorage.getItem('accessToken')||sessionStorage.getItem('token');if(token&&!opts.headers.Authorization)opts.headers.Authorization='Bearer '+token;const r=await fetch('/api/games/rooms'+path,opts);let j={};try{j=await r.json()}catch(_){}if(!r.ok){const detail=j.error||j.message||('HTTP '+r.status);throw new Error('Game room: '+detail)}return j}
function roomGame(){return game()||document.querySelector('.screen.active')?.id||'block'}
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
const ROOM_GAME_LIST=['block','trivia','crossword','chess'];
const GAME_LABEL={block:'Block Puzzle',trivia:'Trivia Master',crossword:'Word Connect',chess:'Chess'};
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
window.MoodArcade={version:'5.1.0',state:data,level,setLevel,complete,applyTheme,challenge};
window.addEventListener('mood:level-changed',e=>applyTheme(e.detail&&e.detail.game));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
const gameRoomStyle=document.createElement('style');gameRoomStyle.id='game-room-css';gameRoomStyle.textContent=`\n.game-room-modal{position:fixed;inset:0;z-index:10000;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.68);backdrop-filter:blur(10px)}\n.game-room-modal.show{display:grid}.game-room-card{position:relative;width:min(92vw,430px);padding:24px;border-radius:26px;background:var(--kyn-bg-card);border:1px solid var(--kyn-border-strong);box-shadow:0 20px 60px #000b;text-align:center}\n.game-room-x{position:absolute;right:12px;top:10px;width:36px;height:36px;border-radius:12px;background:var(--g-surface);font-size:24px}\n.game-room-icon{font-size:42px}.game-room-card h2{margin:8px 0}.game-room-status{font-size:12px;color:var(--muted);min-height:32px}\n.game-room-codebox{padding:14px;border-radius:18px;background:var(--g-surface);border:1px solid var(--g-line);margin:12px 0}.game-room-codebox small{display:block;color:var(--muted);font-size:9px;letter-spacing:2px}.game-room-codebox b{display:block;font-size:28px;letter-spacing:6px;margin:5px 0 10px}.game-room-codebox button{margin:3px;padding:8px 10px;border-radius:12px;background:var(--g-surface-hi);font-size:10px;font-weight:900}\n.game-room-actions{display:grid;gap:9px}.game-room-primary,.game-room-actions button{min-height:46px;border-radius:15px;border:1px solid var(--g-line);background:var(--g-surface);font-weight:1000}.game-room-primary{background:var(--g-accent);color:#fff}.game-room-divider{font-size:10px;color:var(--muted);margin:2px}.game-room-actions input{height:46px;border-radius:15px;border:1px solid var(--g-line);background:var(--g-surface);color:var(--kyn-text-primary);text-align:center;font-size:18px;letter-spacing:4px;font-weight:1000}.game-room-player{margin-top:12px;font-size:11px;color:var(--muted)}\n`;gameRoomStyle.textContent+=`.gameMatchHud{position:fixed;left:50%;top:72px;transform:translateX(-50%);width:min(94vw,520px);z-index:9996;display:none;padding:10px 12px;border-radius:16px;background:rgba(8,12,24,.86);border:1px solid var(--g-accent);box-shadow:0 14px 35px #0007;backdrop-filter:blur(14px);color:var(--kyn-text-primary);font-size:10px}.gameMatchHud.show{display:block}.gm-head,.gm-row{display:flex;justify-content:space-between;gap:10px;align-items:center}.gm-head{font-weight:1000;margin-bottom:6px;color:var(--g-accent)}.gm-row{padding:4px 0;border-top:1px solid var(--kyn-border)}.gm-row span{color:var(--kyn-text-secondary)}.gm-result{text-align:center;margin-top:6px;padding-top:6px;border-top:1px solid var(--kyn-border);font-weight:900}`;document.head.appendChild(gameRoomStyle);
/* NECPRA COMMERCIAL GAME FX v5.1 — shared polish for every arcade game. */
(function(){
'use strict';
if(window.__NECPRA_GAME_FX__)return;window.__NECPRA_GAME_FX__=1;
var muted=localStorage.getItem('necpra.arcade.muted.v1')==='1',ach={};
try{ach=JSON.parse(localStorage.getItem('necpra.arcade.achievements.v1')||'{}')||{}}catch(_){}
function save(){try{localStorage.setItem('necpra.arcade.achievements.v1',JSON.stringify(ach))}catch(_){}}
function sound(f,d){if(muted)return;try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;var a=window.__necpraAudio||(window.__necpraAudio=new A());if(a.state==='suspended')a.resume().catch(function(){});var o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type='sine';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(90,f*.72),t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.05,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.01)}catch(_){}}
function burst(x,y,n){n=n||12;for(var i=0;i<n;i++){var p=document.createElement('i');p.className='necpra-fx-particle';p.style.left=x+'px';p.style.top=y+'px';p.style.setProperty('--dx',((Math.random()-.5)*180)+'px');p.style.setProperty('--dy',((Math.random()-.8)*170)+'px');p.style.setProperty('--s',(4+Math.random()*6)+'px');p.style.setProperty('--h',Math.floor(Math.random()*360));document.body.appendChild(p);setTimeout(function(q){return function(){q.remove()}}(p),850)}}
function center(n){burst(innerWidth/2,innerHeight*.43,n||28)}
function toast(s){var t=document.getElementById('necpraGameToast');if(!t){t=document.createElement('div');t.id='necpraGameToast';document.body.appendChild(t)}t.textContent=s;t.classList.add('show');clearTimeout(t._tm);t._tm=setTimeout(function(){t.classList.remove('show')},1800)}
function menu(){var m=document.getElementById('necpraGameMenu');if(m){m.remove();return}m=document.createElement('div');m.id='necpraGameMenu';m.innerHTML='<div class="necpra-game-menu-card"><div class="necpra-game-menu-orb">🎮</div><h2>Game Menu</h2><p>Pause, restart, sound or return to the arcade.</p><div class="necpra-game-menu-actions"><button data-g-pause>Pause / Resume</button><button data-g-restart>Restart Level</button><button data-g-sound></button><button data-g-home>Back to Arcade</button><button data-g-close>Continue</button></div></div>';document.body.appendChild(m);m.querySelector('[data-g-sound]').textContent=muted?'🔇 Sound Off':'🔊 Sound On';m.querySelector('[data-g-sound]').onclick=function(){muted=!muted;localStorage.setItem('necpra.arcade.muted.v1',muted?'1':'0');m.querySelector('[data-g-sound]').textContent=muted?'🔇 Sound Off':'🔊 Sound On';if(!muted)sound(740,.08)};m.querySelector('[data-g-close]').onclick=function(){m.remove()};m.querySelector('[data-g-home]').onclick=function(){m.remove();if(typeof window.home==='function')window.home()};m.querySelector('[data-g-pause]').onclick=function(){m.remove();var x=document.querySelector('[data-pause],button[aria-label*="Pause" i]');if(x)x.click()};m.querySelector('[data-g-restart]').onclick=function(){m.remove();var x=document.querySelector('[data-restart],button[aria-label*="Restart" i]');if(x)x.click()}}
var st=document.createElement('style');st.id='necpra-commercial-game-fx-css';st.textContent='body[data-game] .screen.active{animation:necpraGameIn .38s cubic-bezier(.2,.85,.25,1)}body[data-game] .card{transform:translateZ(0);transition:transform .22s,box-shadow .22s}body[data-game] .card:hover{transform:translateY(-6px) scale(1.012);box-shadow:0 20px 45px #0007}body[data-game] .art{animation:necpraFloat 3.6s ease-in-out infinite;filter:drop-shadow(0 10px 22px color-mix(in srgb,var(--g-accent) 35%,transparent))}body[data-game] .action,body[data-game] .life,body[data-game] .answer{transition:transform .14s,filter .14s,box-shadow .14s}body[data-game] .action:active,body[data-game] .life:active,body[data-game] .answer:active{transform:scale(.94);filter:brightness(1.16)}.necpra-fx-particle{position:fixed;z-index:10050;width:var(--s);height:var(--s);border-radius:50%;pointer-events:none;background:hsl(var(--h) 90% 65%);box-shadow:0 0 14px currentColor;animation:necpraParticle .78s cubic-bezier(.16,.85,.25,1) forwards}#necpraGameToast{position:fixed;left:50%;bottom:88px;transform:translate(-50%,20px) scale(.96);opacity:0;z-index:10060;padding:11px 16px;border-radius:18px;background:rgba(10,14,28,.94);border:1px solid var(--g-accent);color:#fff;font-weight:900;font-size:12px;transition:.2s;pointer-events:none}#necpraGameToast.show{opacity:1;transform:translate(-50%,0) scale(1)}#necpraGameMenu{position:fixed;inset:0;z-index:10040;display:grid;place-items:center;padding:18px;background:rgba(2,5,14,.72);backdrop-filter:blur(14px)}.necpra-game-menu-card{width:min(92vw,410px);padding:28px;border-radius:30px;text-align:center;background:linear-gradient(145deg,var(--kyn-bg-card),var(--kyn-bg-modal));border:1px solid var(--kyn-border-strong);box-shadow:0 30px 90px #000b}.necpra-game-menu-orb{width:66px;height:66px;margin:auto;border-radius:22px;display:grid;place-items:center;font-size:32px;background:linear-gradient(145deg,var(--g-accent),#18213c);box-shadow:0 14px 30px color-mix(in srgb,var(--g-accent) 35%,transparent)}.necpra-game-menu-actions{display:grid;gap:9px}.necpra-game-menu-actions button{min-height:46px;border-radius:15px;border:1px solid var(--kyn-border);background:var(--g-surface);color:var(--kyn-text-primary);font-weight:900}#block .cell.just-placed{animation:necpraBlockPop .48s cubic-bezier(.16,1.3,.3,1)}#trivia .answer.correct{animation:necpraGood .42s cubic-bezier(.2,1.3,.3,1)}#trivia .answer.wrong{animation:necpraBad .38s ease}#crossword .wc-cell.wc-filled{animation:necpraCross .18s ease-out}@keyframes necpraGameIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}@keyframes necpraFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes necpraParticle{to{transform:translate(var(--dx),var(--dy)) rotate(240deg) scale(.1);opacity:0}}@keyframes necpraBlockPop{0%{transform:scale(.65)}55%{transform:scale(1.1)}100%{transform:scale(1)}}@keyframes necpraGood{0%{transform:scale(.96)}55%{transform:scale(1.045)}100%{transform:scale(1)}}@keyframes necpraBad{20%,70%{transform:translateX(-6px)}45%{transform:translateX(6px)}}@keyframes necpraCross{50%{transform:scale(1.08);filter:brightness(1.3)}}@media(prefers-reduced-motion:reduce){body[data-game] *{animation-duration:.001ms!important;transition-duration:.001ms!important}}';document.head.appendChild(st);
/* Integrated 3D game presentation — deliberately lives in the existing
   commercial game layer so there is one renderer/presentation layer, not a
   second game implementation or duplicate game UI. */
st.textContent += `
body[data-game]{perspective:1500px}
body[data-game] .screen.active{transform-style:preserve-3d}
body[data-game] .screen.active .top{transform:translateZ(38px);box-shadow:0 14px 34px #0007;backdrop-filter:blur(18px) saturate(1.12)}
body[data-game] .screen.active .card,body[data-game] .screen.active .question,body[data-game] .screen.active .board,body[data-game] .screen.active .wc-board,body[data-game] .screen.active .wc-wheelwrap{transform-style:preserve-3d;box-shadow:0 28px 55px #0009,inset 0 1px #fff3}

#block .board{transform:translateZ(26px) rotateX(7deg);box-shadow:0 30px 46px #0009,inset 0 2px #fff4}
#block .cell{box-shadow:inset 0 2px #fff5,inset 0 -7px 10px #0006,0 5px 9px #0006}
#block .cell.filled{transform:translateZ(7px)}
#trivia .question{transform:translateZ(38px) rotateX(2deg)}
#trivia .answer{transform:translateZ(18px);box-shadow:0 16px 28px #0007,inset 0 1px #fff2}
#crossword .wc-board{transform:translateZ(22px) rotateX(5deg);filter:drop-shadow(0 24px 32px #0009)}
#crossword .wc-wheelwrap{transform:translateZ(28px)}
#chess .ch-board,#chess .board{transform:translateZ(24px) rotateX(4deg);transform-style:preserve-3d;box-shadow:0 30px 46px #0009}
body[data-game] .action,body[data-game] .life,body[data-game] .answer,body[data-game] .wc-letter{transition:transform .16s,filter .16s,box-shadow .16s}
body[data-game] .action:hover,body[data-game] .life:hover,body[data-game] .answer:hover,body[data-game] .wc-letter:hover{transform:translateY(-3px) translateZ(12px);filter:brightness(1.08)}
@media(prefers-reduced-motion:reduce){#block .board,#trivia .question,#crossword .wc-board,#crossword .wc-wheelwrap,#chess .ch-board,#chess .board{transform:none!important}}
`;
document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('button,[role="button"],.card');if(!b)return;var r=b.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,5);sound(b.classList.contains('primary')?620:360,.035)},{passive:true});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!document.getElementById('necpraGameMenu'))menu()});
function decorate(){var a=document.querySelector('.screen.active');if(!a||a.id==='home')return;var top=a.querySelector('.top,.wc-top,.ch-top');if(!top)return;if(!top.querySelector('[data-necpra-game-menu]')){var b=document.createElement('button');b.dataset.necpraGameMenu='1';b.textContent='⋮';b.title='Game menu';b.setAttribute('aria-label','Game menu');b.onclick=menu;Object.assign(b.style,{width:'36px',height:'36px',borderRadius:'12px',background:'var(--g-surface)',border:'1px solid var(--g-line)',fontSize:'22px',fontWeight:'900',display:'grid',placeItems:'center',marginLeft:'5px',flex:'0 0 auto'});top.appendChild(b)}}
function wrapComplete(){if(!window.MoodArcade||typeof window.MoodArcade.complete!=='function'||window.__necpraCompleteWrapped)return;window.__necpraCompleteWrapped=true;var old=window.MoodArcade.complete;window.MoodArcade.complete=function(g,score){old.apply(this,arguments);ach[g]=(ach[g]||0)+1;save();center(30);sound(740,.09);setTimeout(function(){sound(1040,.14)},85);toast('LEVEL COMPLETE • '+(g||'GAME').toUpperCase()+' • 🏆 Achievement')}}
var timer=setInterval(function(){decorate();wrapComplete()},700);setTimeout(function(){clearInterval(timer)},20000);
window.__necpraGameFX={burst,menu,sound,toast};
})();
})();
