/* Necpra Arcade — professional 3D presentation layer.
 * Keeps the existing gameplay engines and controls intact while giving every
 * arcade game a shared, Play-Store-style 3D presentation: depth, bevels,
 * lighting, camera parallax, tactile motion and game-specific staging.
 */
(()=>{'use strict';
if(window.__NECPRA_PRO_3D__)return;window.__NECPRA_PRO_3D__=true;
const css=document.createElement('style');css.id='necpra-professional-3d';
css.textContent=`
:root{--n3d-depth:0deg;--n3d-tilt:0deg;--n3d-glow:color-mix(in srgb,var(--g-accent) 34%,transparent)}
#app{perspective:1400px;transform-style:preserve-3d}
.screen.active{transform-style:preserve-3d}
.screen.active>.top{box-shadow:0 12px 35px #0006;backdrop-filter:blur(22px) saturate(1.15)}
.n3d-stage{position:absolute;inset:62px 0 0;pointer-events:none;z-index:0;overflow:hidden;transform-style:preserve-3d}
.n3d-stage:before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 50% 20%,var(--n3d-glow),transparent 34%),radial-gradient(circle at 12% 85%,color-mix(in srgb,var(--kyn-accent-info) 18%,transparent),transparent 28%);filter:blur(14px);opacity:.9}
.n3d-stage:after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,#fff1,transparent 24%,transparent 72%,#fff1);mix-blend-mode:screen;opacity:.25}
#water .body,#block .blockbody,#trivia .tvbody,#crossword .wc-wrap,#daily .body{transform-style:preserve-3d}
#water .canvas{transform:translateZ(24px) rotateX(4deg) scale(.985);filter:drop-shadow(0 28px 35px #0008);transition:transform .35s cubic-bezier(.2,.8,.2,1),filter .35s}
#water .water-hit-target{transform-style:preserve-3d;transition:transform .18s,filter .18s}
#water .water-hit-target:hover{transform:translateY(-5px) scale(1.025);filter:drop-shadow(0 12px 16px #0008)}
#water .hud,#water .actions{transform:translateZ(55px)}
#block .board{transform:translateZ(30px) rotateX(7deg) rotateZ(var(--n3d-depth));transform-style:preserve-3d;box-shadow:0 30px 45px #0009,inset 0 2px #fff4}
#block .cell{transform:translateZ(2px);box-shadow:inset 0 2px #fff5,inset 0 -7px 10px #0006,0 5px 8px #0005;transition:transform .12s,filter .12s}
#block .cell.filled{transform:translateZ(8px)}
#block .cell.filled:hover{transform:translateZ(13px) scale(1.025);filter:brightness(1.08)}
#block .tray,.block-hold-wrap{transform:translateZ(28px);box-shadow:0 24px 34px #0008,inset 0 1px #fff3}
#block .piece{transform:translateZ(22px);filter:drop-shadow(0 15px 11px #0009);transition:transform .16s cubic-bezier(.2,1.4,.3,1),filter .16s}
#block .piece:hover{transform:translateZ(36px) scale(1.05)}
#trivia .tvcontent{transform-style:preserve-3d}
#trivia .question{transform:translateZ(42px) rotateX(2deg);box-shadow:0 28px 48px #0009,inset 0 1px #fff3}
#trivia .answer{transform:translateZ(22px);box-shadow:0 16px 28px #0007,inset 0 1px #fff2;transition:transform .16s,box-shadow .16s}
#trivia .answer:hover{transform:translateZ(34px) translateY(-2px)}
#trivia .lifelines .life{transform:translateZ(18px);box-shadow:0 13px 22px #0006}
#crossword .wc-boardwrap{transform-style:preserve-3d}
#crossword .wc-board{transform:translateZ(26px) rotateX(6deg);filter:drop-shadow(0 24px 32px #0009)}
#crossword .wc-cell.wc-filled{transform:translateZ(7px);box-shadow:inset 0 2px #fff4,0 7px 10px #0007}
#crossword .wc-wheelwrap{transform:translateZ(32px);filter:drop-shadow(0 25px 30px #0008)}
#crossword .wc-letter{transform:translateZ(9px);transition:transform .12s,box-shadow .12s}
#crossword .wc-letter.active{transform:translateZ(26px) scale(1.13)}
#daily canvas{transform:translateZ(30px) rotateX(4deg);filter:drop-shadow(0 28px 38px #0009)}
#daily .hud,#daily .actions{transform:translateZ(48px)}
.n3d-float{animation:n3dFloat 3.6s ease-in-out infinite}
@keyframes n3dFloat{0%,100%{transform:translateY(0) translateZ(18px)}50%{transform:translateY(-6px) translateZ(26px)}}
.n3d-hit{animation:n3dHit .34s cubic-bezier(.2,1.5,.3,1)}
@keyframes n3dHit{0%{transform:translateZ(0) scale(.94)}55%{transform:translateZ(30px) scale(1.06)}100%{transform:translateZ(8px) scale(1)}}
.n3d-particle{position:fixed;width:7px;height:7px;border-radius:50%;pointer-events:none;z-index:100000;background:var(--n3d-particle,var(--g-accent));box-shadow:0 0 14px var(--n3d-particle,var(--g-accent));animation:n3dParticle .65s ease-out forwards}
@keyframes n3dParticle{to{transform:translate(var(--dx),var(--dy)) scale(.05);opacity:0}}
@media(max-width:600px){
 #app{perspective:1100px}
 #water .canvas{transform:translateZ(18px) rotateX(3deg) scale(.99)}
 #block .board{transform:translateZ(18px) rotateX(5deg)}
 #trivia .question{transform:translateZ(28px)}
 #crossword .wc-board{transform:translateZ(18px) rotateX(4deg)}
}
@media(prefers-reduced-motion:reduce){
 .n3d-float{animation:none!important}
 #water .canvas,#block .board,#trivia .question,#crossword .wc-board,#daily canvas{transform:none!important}
}
`;document.head.appendChild(css);

function particle(x,y){
 for(let i=0;i<7;i++){const p=document.createElement('i');p.className='n3d-particle';p.style.left=x+'px';p.style.top=y+'px';p.style.setProperty('--dx',((Math.random()-.5)*110)+'px');p.style.setProperty('--dy',((Math.random()-.5)*100)+'px');document.body.appendChild(p);setTimeout(()=>p.remove(),700)}
}
function active(){return document.querySelector('.screen.active')}
function stage(screen){
 if(!screen||screen.querySelector('.n3d-stage'))return;
 const s=document.createElement('div');s.className='n3d-stage';screen.appendChild(s);
 const targets=screen.querySelectorAll('.board,.question,.wc-wheelwrap,.canvas');
 targets.forEach((e,i)=>{if(i<2)e.classList.add('n3d-float')});
}
function tilt(e){
 const a=active();if(!a)return;
 const r=a.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
 a.style.setProperty('--n3d-depth',(x*4).toFixed(2)+'deg');
 a.style.setProperty('--n3d-tilt',(y*3).toFixed(2)+'deg');
}
function reset(){const a=active();if(a){a.style.setProperty('--n3d-depth','0deg');a.style.setProperty('--n3d-tilt','0deg')}}
function pulse(e){const t=e.target.closest('.cell,.answer,.wc-letter,.water-hit-target,.action,.life');if(!t)return;t.classList.remove('n3d-hit');void t.offsetWidth;t.classList.add('n3d-hit');particle(e.clientX,e.clientY)}
function install(){
 ['water','block','trivia','crossword','daily'].forEach(id=>stage(document.getElementById(id)));
 document.addEventListener('pointermove',tilt,{passive:true});
 document.addEventListener('pointerleave',reset,{passive:true});
 document.addEventListener('pointerdown',pulse,{passive:true});
 window.addEventListener('mood:game-opened',()=>{const a=active();stage(a);});
 const oldOpen=window.openGame;
 if(typeof oldOpen==='function'&&!window.__n3dOpenWrapped){
  window.__n3dOpenWrapped=true;
  window.openGame=function(type){const r=oldOpen.apply(this,arguments);setTimeout(()=>{stage(document.getElementById(type));},80);return r};
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();