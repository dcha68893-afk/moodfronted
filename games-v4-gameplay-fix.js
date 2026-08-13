/* Gameplay fixes: preserve original game logic while fixing subject routing and block drag. */
(function(){
'use strict';
if(window.__MOOD_GAMEPLAY_FIX__)return;window.__MOOD_GAMEPLAY_FIX__=true;

/* ---------- Trivia: subject-specific question banks ---------- */
const BANK={
 maths:[['What is 12 × 8?',['86','96','108','112'],1],['What is 25% of 80?',['10','20','25','40'],1],['What is 144 ÷ 12?',['10','12','14','16'],1],['Which number is prime?',['21','29','33','39'],1]],
 english:[['Which word is a noun?',['Quickly','Beautiful','Teacher','Run'],2],['Choose the correct spelling.',['Necessary','Necesary','Neccessary','Necessay'],0],['What is the opposite of ancient?',['Old','Modern','Historic','Past'],1]],
 kiswahili:[['Neno lenye maana ya kinyume cha "refu" ni lipi?',['Fupi','Kubwa','Ndefu','Juu'],0],['Wingi wa neno "mtoto" ni upi?',['Watoto','Mtotoni','Vijana','Mtoto'],0]],
 science:[['What gas do plants absorb?',['Oxygen','Nitrogen','Carbon dioxide','Helium'],2],['Which organ pumps blood?',['Lung','Heart','Kidney','Liver'],1],['Water boils at what temperature at sea level?',['50°C','75°C','100°C','150°C'],2]],
 social:[['Which is the largest continent?',['Africa','Asia','Europe','Australia'],1],['What is a group of countries governed together called?',['Federation','School','Village','Family'],0]],
 it:[['Which language runs in a web browser?',['JavaScript','Python','C++','SQL'],0],['What does CPU stand for?',['Central Processing Unit','Computer Power Unit','Core Program Utility','Central Print Unit'],0]],
 others:[['Which planet is known as the Red Planet?',['Earth','Mars','Venus','Jupiter'],1],['What is the largest ocean?',['Atlantic','Indian','Arctic','Pacific'],3]],
 random:[]
};
BANK.random=Object.values(BANK).filter(Boolean).flat();
function selectedSubject(){return localStorage.getItem('mood_trivia_subject')||'random'}
function installTrivia(){
 const original=window.startTrivia;if(typeof original!=='function'||window.__triviaFixed)return;window.__triviaFixed=true;
 window.startTrivia=function(){
   const subject=selectedSubject(), bank=BANK[subject]||BANK.random;
   window.__MOOD_TRIVIA_BANK__=bank.map(x=>x.slice());
   window.__MOOD_TRIVIA_SUBJECT__=subject;
   /* Keep the original scoring/timer/lifelines, but make its question source the chosen subject. */
   if(Array.isArray(window.qs)){
     window.qs.length=0;bank.forEach(q=>window.qs.push(q));
   }
   return original.apply(this,arguments);
 };
}

/* ---------- Block Puzzle: smooth pointer drag + committed placement ---------- */
function installBlock(){
 if(window.__blockFixed)return;
 const board=()=>document.getElementById('board'),tray=()=>document.getElementById('tray');
 if(!board()||!tray()||!window.can)return;
 window.__blockFixed=true;
 /* Replace only pointer interaction; the existing board/score/line-clearing state remains authoritative. */
 document.addEventListener('pointerdown',function(e){
   const el=e.target.closest('#tray .piece');if(!el)return;
   e.preventDefault();
   const shape=window.shapes?.[+el.dataset.shape];if(!shape)return;
   const color=+el.dataset.color;
   const br=board().getBoundingClientRect();
   const cs=br.width/10;
   const ghost=el.cloneNode(true);ghost.id='ghost';ghost.classList.add('ghost');ghost.style.position='fixed';ghost.style.pointerEvents='none';ghost.style.zIndex='9999';document.body.appendChild(ghost);
   el.style.opacity='.25';el.setPointerCapture?.(e.pointerId);
   let last={r:0,c:0,valid:false};
   function move(ev){
     const x=ev.clientX,y=ev.clientY;
     ghost.style.left=x+'px';ghost.style.top=y+'px';
     const c=Math.round((x-br.left-cs*.5)/cs),r=Math.round((y-br.top-cs*1.1)/cs);
     last={r,c,valid:window.can(shape,r,c)};
     board().querySelectorAll('.preview').forEach(x=>x.classList.remove('preview'));
     if(last.valid)shape.forEach(([dr,dc])=>board().children[(r+dr)*10+c+dc]?.classList.add('preview'));
   }
   function up(ev){
     document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);ghost.remove();el.style.opacity='1';
     board().querySelectorAll('.preview').forEach(x=>x.classList.remove('preview'));
     if(!last.valid)return;
     /* Commit to the actual board immediately on release. */
     shape.forEach(([r,c])=>window.board[r+last.r][c+last.c]=color);
     window.bscore=(window.bscore||0)+shape.length*5;
     const score=document.getElementById('bs');if(score)score.textContent=window.bscore;
     el.remove();
     window.pieces=(window.pieces||[]).filter(p=>p!==el);
     if(!window.pieces.length&&typeof window.newPieces==='function')window.newPieces();
     if(typeof window.renderBlock==='function')window.renderBlock();
     setTimeout(()=>typeof window.clearLines==='function'&&window.clearLines(),30);
   }
   document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up,{once:true});move(e);
 },{passive:false});
}
function boot(){installTrivia();installBlock()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,100),{once:true});else setTimeout(boot,100);
})();
