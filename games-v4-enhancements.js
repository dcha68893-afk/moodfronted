/* Mood Arcade V4 gameplay-preservation enhancement layer.
 * Additive layer: keeps the V3 games and adds progression, smoother block feedback,
 * trivia subject selection/timer, challenges and animated level themes.
 * IMPORTANT: this file must never observe every DOM mutation; game rendering itself
 * mutates the DOM frequently, so an unrestricted MutationObserver causes a feedback loop.
 */
(function(){
'use strict';
if(window.__MOOD_GAMES_V4__) return;
window.__MOOD_GAMES_V4__=true;
const root=document.documentElement, body=document.body;
const difficulty=()=>localStorage.getItem('mood.game.difficulty.'+(body.dataset.game||'block'))||'moderate';
function showDifficulty(g=body.dataset.game||'block'){let o=document.getElementById('v4Difficulty');if(!o){o=document.createElement('div');o.id='v4Difficulty';o.innerHTML='<div class="v4-sub-box"><h2>Choose difficulty</h2><p>Difficulty changes the actual gameplay, not just the label.</p><div class="v4-sub-grid">'+[['easy','🟢 Easy'],['moderate','🟡 Moderate'],['hard','🔴 Hard']].map(x=>'<button class="v4-sub" data-diff="'+x[0]+'">'+x[1]+'<small style="display:block;margin-top:5px;opacity:.7" data-check></small></button>').join('')+'</div></div>';document.body.appendChild(o)}o.querySelectorAll('[data-diff]').forEach(b=>{b.querySelector('[data-check]').textContent=b.dataset.diff===difficulty()?'✓ Selected':'';b.onclick=()=>{localStorage.setItem('mood.game.difficulty.'+g,b.dataset.diff);o.classList.remove('show');updateDifficultyButton();window.dispatchEvent(new CustomEvent('mood:difficulty-changed',{detail:{game:g,difficulty:b.dataset.diff}}));}});o.classList.add('show')}
function updateDifficultyButton(){const b=document.getElementById('v4DifficultyButton');if(b)b.textContent='Difficulty: '+difficulty().toUpperCase();}
/* Accent hues only (decorative level progression). The page/background colours come from the app theme tokens --
   levels no longer paint their own hard-coded dark backgrounds over the user's chosen theme. */
const themes=['#8b5cf6','#38bdf8','#22c55e','#f59e0b','#ec4899','#14b8a6','#a78bfa','#f97316'];
function level(){
  for(const id of ['wl','bl','tl','level','levelNum']){
    const e=document.getElementById(id);
    if(e){const m=(e.textContent||'').match(/\d+/);if(m)return +m[0]||1;}
  }
  return +(sessionStorage.getItem('mood_game_level')||1);
}
function theme(){
  const n=Math.max(1,level());
  const c=themes[Math.min(themes.length-1,Math.floor((n-1)/2))];
  root.style.setProperty('--v4c',c);root.style.setProperty('--g-accent',c);
  body.dataset.gameLevel=String(n);
}
const s=document.createElement('style');
s.textContent=`
#app{transition:background 700ms ease}
.piece{transition:transform .12s cubic-bezier(.2,.9,.2,1),filter .12s;will-change:transform}
.piece:active{transform:scale(1.07);filter:brightness(1.16) drop-shadow(0 16px 18px rgba(0,0,0,.42))}
.ghost{transition:left .055s linear,top .055s linear,transform .12s ease-out;will-change:left,top,transform}
.cell.preview{transition:transform .08s ease,box-shadow .08s ease,filter .08s ease}
.v4-particle{position:fixed;pointer-events:none;width:6px;height:6px;border-radius:50%;background:var(--v4c);box-shadow:0 0 12px var(--v4c);z-index:9999;animation:v4p .7s ease-out forwards}
@keyframes v4p{to{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}
#v4Subject{position:fixed;inset:0;z-index:10000;display:none;place-items:center;background:var(--kyn-bg-overlay);backdrop-filter:blur(12px);padding:18px}
#v4Subject.show{display:grid}.v4-sub-box{width:min(430px,94vw);padding:24px;border-radius:28px;background:var(--kyn-bg-modal);color:var(--kyn-text-primary);border:1px solid var(--kyn-border);box-shadow:var(--kyn-shadow-lg)}
.v4-sub-box h2{margin:0 0 6px;font-size:25px}.v4-sub-box p{margin:0 0 18px;color:var(--kyn-text-secondary);font-size:12px}.v4-sub-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.v4-sub{min-height:78px;border-radius:18px;background:var(--g-surface);border:1px solid var(--g-line);color:var(--kyn-text-primary);font-weight:900;cursor:pointer}.v4-sub:active{transform:scale(.97);background:var(--g-surface-hi)}
#v4Timer{position:fixed;left:12px;right:12px;bottom:74px;height:6px;border-radius:10px;background:var(--g-surface-hi);z-index:10001;display:none;overflow:hidden}.v4-timer-fill{height:100%;width:100%;background:var(--v4c);transition:width .1s linear}
#v4Challenge{position:fixed;right:12px;bottom:12px;z-index:9998;padding:10px 14px;border-radius:18px;background:var(--kyn-bg-card);border:1px solid var(--v4c);color:var(--kyn-text-primary);font-weight:900;box-shadow:var(--kyn-shadow-md);display:none}
#v4Challenge.show{display:block}.v4-modal{position:fixed;inset:0;z-index:10002;display:grid;place-items:center;background:var(--kyn-bg-overlay);backdrop-filter:blur(10px);padding:18px}#v4Difficulty{position:fixed;inset:0;z-index:10003;display:none;place-items:center;background:var(--kyn-bg-overlay);backdrop-filter:blur(10px);padding:18px}#v4Difficulty.show{display:grid}#v4DifficultyButton{position:fixed;top:70px;right:12px;z-index:9998;padding:8px 12px;border-radius:16px;background:var(--kyn-bg-card);border:1px solid var(--g-line);color:var(--kyn-text-primary);font-weight:900;font-size:10px}#v4Mode{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9998;padding:7px 12px;border-radius:15px;background:color-mix(in srgb,var(--kyn-bg-panel) 85%,transparent);border:1px solid var(--g-line);color:var(--kyn-text-secondary);font-size:11px;font-weight:900;display:none}
`;
document.head.appendChild(s);
function particles(x,y,n=12){
  for(let i=0;i<n;i++){
    const p=document.createElement('i');p.className='v4-particle';p.style.left=x+'px';p.style.top=y+'px';
    p.style.setProperty('--dx',((Math.random()-.5)*150)+'px');p.style.setProperty('--dy',((Math.random()-.8)*150)+'px');
    document.body.appendChild(p);setTimeout(()=>p.remove(),900);
  }
}
function levelFX(){theme();sessionStorage.setItem('mood_game_level',String(level()));}
function addSubject(){
  if(document.getElementById('v4Subject'))return;
  const o=document.createElement('div');o.id='v4Subject';
  o.innerHTML='<div class="v4-sub-box"><h2>🧠 Choose Your Subject</h2><p>Your choice is saved. Each level becomes harder as you progress.</p><div class="v4-sub-grid">'+
    [['maths','🔢 Maths'],['english','📖 English'],['kiswahili','🌍 Kiswahili'],['science','🔬 Science'],['social','🌐 Social Studies'],['it','💻 IT / Computing'],['others','🎲 General Knowledge'],['random','🎯 Random Mix']].map(x=>`<button class="v4-sub" data-sub="${x[0]}">${x[1]}</button>`).join('')+
    '</div></div>';
  document.body.appendChild(o);
  o.querySelectorAll('.v4-sub').forEach(b=>b.onclick=()=>{
    localStorage.setItem('mood_trivia_subject',b.dataset.sub);o.classList.remove('show');showTriviaTimer();
  });
}
function showTriviaTimer(){
  let t=document.getElementById('v4Timer');
  if(!t){t=document.createElement('div');t.id='v4Timer';t.innerHTML='<div class="v4-timer-fill"></div>';document.body.appendChild(t);}
  t.style.display='block';let fill=t.firstElementChild,left=20;clearInterval(window.__v4tv);fill.style.width='100%';
  window.__v4tv=setInterval(()=>{left-=.1;fill.style.width=Math.max(0,left/20*100)+'%';if(left<=0){clearInterval(window.__v4tv);document.dispatchEvent(new CustomEvent('mood:trivia-timeout'));}},100);
}
function challenge(){
  const game=body.dataset.game||'game',score=document.querySelector('#bs,#ws,.score,#pr')?.textContent||'0';
  const text=`🎮 I challenge you to beat my ${game} score of ${score}!`;
  if(navigator.share)navigator.share({title:'Mood Challenge',text}).catch(()=>{});
  else if(navigator.clipboard)navigator.clipboard.writeText(text).then(()=>alert('Challenge copied. Send it to a friend!'));
}
function install(){
  theme();
  const oldOpen=window.openGame;
  if(typeof oldOpen==='function'&&!window.__v4Open){
    window.__v4Open=true;
    window.openGame=function(type){
      body.dataset.game=type;
      sessionStorage.setItem('mood_game_level',String(level()));
      const r=oldOpen.apply(this,arguments);
      setTimeout(()=>{
        levelFX();
        // FIX (LEVEL/DIFFICULTY-BADGE-NEVER-SHOWS): this custom event has a listener registered
        // below (`mood:game-opened`) but nothing anywhere in the app ever dispatched it, so the
        // "LEVEL X • GAME • DIFFICULTY" badge could never appear no matter what the player did.
        // Fire it here, right after each game actually opens.
        window.dispatchEvent(new CustomEvent('mood:game-opened'));
        if(type==='block'){
          document.querySelectorAll('.piece').forEach(p=>{
            if(p.dataset.v4Bound)return;p.dataset.v4Bound='1';
            p.addEventListener('pointerdown',e=>particles(e.clientX,e.clientY,5),{passive:true});
          });
        }
        if(type==='trivia'){
          addSubject();
          const subject=document.getElementById('v4Subject');
          if(subject)subject.classList.add('show');
        }
      },120);
      return r;
    };
  }
  const b=document.createElement('button');b.id='v4Challenge';b.textContent='⚔️ Invite';b.onclick=()=>{const g=body.dataset.game||'game',lv=level(g),url=location.origin+location.pathname+'?challenge='+encodeURIComponent(g)+'&level='+lv+'&difficulty='+difficulty();const msg='🎮 Join my '+g+' challenge — Level '+lv+' ('+difficulty().toUpperCase()+'). '+url;const o=document.createElement('div');o.className='v4-modal';o.innerHTML='<div class="v4-sub-box"><h2>Invite a player</h2><p>Send this challenge to another user. The invite contains the game, level and difficulty.</p><textarea readonly style="width:100%;min-height:90px;border-radius:14px;padding:10px;box-sizing:border-box;background:var(--g-surface);color:var(--kyn-text-primary);border:1px solid var(--g-line)">'+msg.replace(/</g,'&lt;')+'</textarea><div class="row" style="margin-top:12px"><button class="primary" data-share>Share</button><button data-copy>Copy</button><button data-close>Close</button></div></div>';document.body.appendChild(o);o.querySelector('[data-close]').onclick=()=>o.remove();o.querySelector('[data-copy]').onclick=()=>navigator.clipboard?.writeText(msg).then(()=>{o.querySelector('[data-copy]').textContent='Copied ✓'});o.querySelector('[data-share]').onclick=()=>{if(navigator.share)navigator.share({title:'Game Challenge',text:msg}).catch(()=>{});else navigator.clipboard?.writeText(msg).then(()=>{o.querySelector('[data-share]').textContent='Copied ✓'})};try{parent.postMessage({type:'GAME_CHALLENGE_INVITE',game:g,level:lv,difficulty:difficulty(),message:msg},'*')}catch(e){}};document.body.appendChild(b);
 const db=document.createElement('button');db.id='v4DifficultyButton';db.textContent='Difficulty: '+difficulty().toUpperCase();db.onclick=()=>showDifficulty();document.body.appendChild(db);
  const mode=document.createElement('div');mode.id='v4Mode';document.body.appendChild(mode);
  // Do NOT use a MutationObserver here. Game screens constantly mutate the DOM;
  // observing them would create a self-triggering render loop and make buttons unresponsive.
  window.addEventListener('mood:level-changed',levelFX);
  window.addEventListener('mood:game-opened',()=>{
    levelFX();
    const g=body.dataset.game;
    // FIX: only surface the informational LEVEL/DIFFICULTY badge here. `b` (#v4Challenge) used to
    // also get shown on this same event, which — now that the event actually fires (see above) —
    // would have put a SECOND "⚔️ Challenge" button on screen at the same time as the one
    // games-commercial-v5.js already shows permanently. Keep b's element around (harmless, stays
    // hidden) but stop toggling it visible so there's exactly one working Challenge button.
    if(g){mode.style.display='block';mode.textContent=`LEVEL ${level()} • ${g.toUpperCase()} • ${difficulty().toUpperCase()}`;updateDifficultyButton();}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
