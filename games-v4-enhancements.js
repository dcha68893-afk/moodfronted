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
const themes=[
 ['#07050e','#17102a','#9d6cff'],['#06111b','#0d2638','#45d9ff'],
 ['#08170f','#12351f','#38e38a'],['#1a1005','#3b2110','#ffd34e'],
 ['#170816','#35102f','#ff5fbd'],['#07171a','#10363b','#38e8d4'],
 ['#120b20','#29164b','#b78cff'],['#170b0b','#3d1515','#ff7b62']
];
function level(){
  for(const id of ['wl','bl','tl','level','levelNum']){
    const e=document.getElementById(id);
    if(e){const m=(e.textContent||'').match(/\d+/);if(m)return +m[0]||1;}
  }
  return +(sessionStorage.getItem('mood_game_level')||1);
}
function theme(){
  const n=Math.max(1,level());
  const t=themes[Math.min(themes.length-1,Math.floor((n-1)/2))];
  root.style.setProperty('--v4a',t[0]);root.style.setProperty('--v4b',t[1]);root.style.setProperty('--v4c',t[2]);
  body.dataset.gameLevel=String(n);
  body.style.background=`radial-gradient(circle at 50% -10%,${t[1]},${t[0]} 62%,#030207)`;
}
const s=document.createElement('style');
s.textContent=`
body[data-game-level]{transition:background 700ms ease;background-size:160% 160%;animation:v4bg 14s ease-in-out infinite alternate}
@keyframes v4bg{from{background-position:35% 0}to{background-position:70% 100%}}
#app{transition:background 700ms ease}
.piece{transition:transform .12s cubic-bezier(.2,.9,.2,1),filter .12s;will-change:transform}
.piece:active{transform:scale(1.07);filter:brightness(1.16) drop-shadow(0 16px 18px rgba(0,0,0,.42))}
.ghost{transition:left .055s linear,top .055s linear,transform .12s ease-out;will-change:left,top,transform}
.cell.preview{transition:transform .08s ease,box-shadow .08s ease,filter .08s ease}
.v4-particle{position:fixed;pointer-events:none;width:6px;height:6px;border-radius:50%;background:var(--v4c);box-shadow:0 0 12px var(--v4c);z-index:9999;animation:v4p .7s ease-out forwards}
@keyframes v4p{to{transform:translate(var(--dx),var(--dy)) scale(.1);opacity:0}}
#v4Subject{position:fixed;inset:0;z-index:10000;display:none;place-items:center;background:rgba(3,2,8,.82);backdrop-filter:blur(12px);padding:18px}
#v4Subject.show{display:grid}.v4-sub-box{width:min(430px,94vw);padding:24px;border-radius:28px;background:linear-gradient(145deg,#24163c,#0d0917);border:1px solid #ffffff22;box-shadow:0 30px 100px #000b}
.v4-sub-box h2{margin:0 0 6px;font-size:25px}.v4-sub-box p{margin:0 0 18px;color:#aaa;font-size:12px}.v4-sub-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.v4-sub{min-height:78px;border-radius:18px;background:#ffffff0b;border:1px solid #ffffff18;color:#fff;font-weight:900;cursor:pointer}.v4-sub:active{transform:scale(.97);background:#ffffff16}
#v4Timer{position:fixed;left:12px;right:12px;bottom:74px;height:6px;border-radius:10px;background:#fff2;z-index:10001;display:none;overflow:hidden}.v4-timer-fill{height:100%;width:100%;background:var(--v4c);transition:width .1s linear}
#v4Challenge{position:fixed;right:12px;bottom:12px;z-index:9998;padding:10px 14px;border-radius:18px;background:linear-gradient(135deg,var(--v4c),#fff3);border:1px solid #fff4;color:#fff;font-weight:900;box-shadow:0 10px 30px #0006;display:none}
#v4Challenge.show{display:block}#v4Mode{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9998;padding:7px 12px;border-radius:15px;background:#09070fcc;border:1px solid #fff2;color:#ddd;font-size:11px;font-weight:900;display:none}
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
  const b=document.createElement('button');b.id='v4Challenge';b.textContent='⚔️ Challenge';b.onclick=challenge;document.body.appendChild(b);
  const mode=document.createElement('div');mode.id='v4Mode';document.body.appendChild(mode);
  // Do NOT use a MutationObserver here. Game screens constantly mutate the DOM;
  // observing them would create a self-triggering render loop and make buttons unresponsive.
  window.addEventListener('mood:level-changed',levelFX);
  window.addEventListener('mood:game-opened',()=>{
    levelFX();
    const g=body.dataset.game;
    if(g){b.classList.add('show');mode.style.display='block';mode.textContent=`LEVEL ${level()} • ${g.toUpperCase()} • ${level()<3?'EASY':level()<6?'MEDIUM':level()<9?'HARD':'MASTER'}`;}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
