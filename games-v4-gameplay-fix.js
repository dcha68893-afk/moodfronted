/* Mood Arcade gameplay repair v4.2
 * DOM-safe because game-v3.html keeps its core variables in script scope.
 * Trivia and Block therefore use their own authoritative UI/state instead of
 * trying to access inaccessible lexical variables from an external script.
 */
(function(){
'use strict';
if(window.__MOOD_GAMEPLAY_FIX_V42__)return;window.__MOOD_GAMEPLAY_FIX_V42__=true;

const BANK={
 maths:[['What is 12 × 8?',['86','96','108','112'],1],['What is 25% of 80?',['10','20','25','40'],1],['What is 144 ÷ 12?',['10','12','14','16'],1],['Which number is prime?',['21','29','33','39'],1]],
 english:[['Which word is a noun?',['Quickly','Beautiful','Teacher','Run'],2],['Choose the correct spelling.',['Necessary','Necesary','Neccessary','Necessay'],0],['What is the opposite of ancient?',['Old','Modern','Historic','Past'],1]],
 kiswahili:[['Neno lenye maana ya kinyume cha "refu" ni lipi?',['Fupi','Kubwa','Ndefu','Juu'],0],['Wingi wa neno "mtoto" ni upi?',['Watoto','Mtotoni','Vijana','Mtoto'],0]],
 science:[['What gas do plants absorb?',['Oxygen','Nitrogen','Carbon dioxide','Helium'],2],['Which organ pumps blood?',['Lung','Heart','Kidney','Liver'],1],['Water boils at sea level at what temperature?',['50°C','75°C','100°C','150°C'],2]],
 social:[['Which is the largest continent?',['Africa','Asia','Europe','Australia'],1],['What is a group of countries governed together called?',['Federation','School','Village','Family'],0]],
 it:[['Which language runs in a web browser?',['JavaScript','Python','C++','SQL'],0],['What does CPU stand for?',['Central Processing Unit','Computer Power Unit','Core Program Utility','Central Print Unit'],0]],
 others:[['Which planet is known as the Red Planet?',['Earth','Mars','Venus','Jupiter'],1],['What is the largest ocean?',['Atlantic','Indian','Arctic','Pacific'],3]]
};
BANK.random=Object.values(BANK).flat();
const subject=()=>localStorage.getItem('mood_trivia_subject')||'random';

function trivia(){
 const qEl=document.getElementById('q'),aEl=document.getElementById('answers');if(!qEl||!aEl)return;
 const bank=(BANK[subject()]||BANK.random).slice();let index=0,score=0,streak=0,timer=null,answered=false;
 const progress=document.getElementById('prog'),st=document.getElementById('ts'),pr=document.getElementById('pr');
 function render(){
   if(index>=bank.length){if(window.data){window.data.best=Math.max(window.data.best,score);window.data.coins+=score;window.data.streak++;if(window.save)window.save()}const t=document.getElementById('tot');if(t)t.textContent='You scored '+score+' points in '+subject().toUpperCase()+'.';document.getElementById('to')?.classList.add('show');return;}
   answered=false;clearInterval(timer);let left=20;qEl.textContent=bank[index][0];aEl.innerHTML='';if(progress)progress.style.width=(index/bank.length*100)+'%';if(st)st.textContent='STREAK ×'+streak;if(pr)pr.textContent=(1000+score).toLocaleString();
   bank[index][1].forEach((txt,i)=>{const b=document.createElement('button');b.className='answer';b.innerHTML='<span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+txt+'</span>';b.onclick=()=>answer(i,b);aEl.appendChild(b)});
   timer=setInterval(()=>{left--;if(left<=0){clearInterval(timer);answer(-1,null)}},1000);
 }
 function answer(i,el){if(answered)return;answered=true;clearInterval(timer);const q=bank[index];[...aEl.children].forEach((b,j)=>{b.disabled=true;if(j===q[2])b.classList.add('correct')});if(i===q[2]){streak++;score+=100+streak*25;el?.classList.add('correct')}else{streak=0;el?.classList.add('wrong')}setTimeout(()=>{index++;render()},650)}
 render();
 window.__MOOD_TRIVIA_ACTIVE__={subject:subject(),render};
}

const SHAPES=[[[0,0]],[[0,0],[0,1]],[[0,0],[1,0]],[[0,0],[0,1],[1,0]],[[0,0],[0,1],[0,2]],[[0,0],[1,0],[2,0]],[[0,1],[1,0],[1,1],[1,2]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[0,2],[1,0]]],COLORS=['#24a8ff','#9b6cff','#20e06b','#ff7a18','#ff3e55','#ffd21f'];
let B=null,level=1;
function block(){
 const board=document.getElementById('board'),tray=document.getElementById('tray');if(!board||!tray)return;
 B={grid:Array.from({length:10},()=>Array(10).fill(-1)),score:0,pieces:[]};level=Math.max(1,+(document.getElementById('bl')?.textContent||1));
 board.innerHTML='';
 for(let i=0;i<100;i++){const c=document.createElement('div');c.className='cell';c.dataset.i=i;board.appendChild(c)}
 function draw(){board.querySelectorAll('.cell').forEach((c,i)=>{const v=B.grid[Math.floor(i/10)][i%10];c.classList.toggle('filled',v>=0);c.style.background=v>=0?'linear-gradient(145deg,'+COLORS[v] + ',#0008)':''})}
 function fit(s,r,c){return s.every(([dr,dc])=>r+dr>=0&&r+dr<10&&c+dc>=0&&c+dc<10&&B.grid[r+dr][c+dc]<0)}
 function make(s,col){const el=document.createElement('div');el.className='piece';const mr=Math.max(...s.map(x=>x[0])),mc=Math.max(...s.map(x=>x[1]));el.style.gridTemplateColumns='repeat('+(mc+1)+',22px)';el.style.gridTemplateRows='repeat('+(mr+1)+',22px)';s.forEach(([r,c])=>{const x=document.createElement('i');x.style.gridRow=r+1;x.style.gridColumn=c+1;x.style.background='linear-gradient(145deg,'+COLORS[col]+',#0008)';el.appendChild(x)});el.dataset.color=col;el._shape=s;return el}
 function refill(){tray.innerHTML='';B.pieces=[];for(let i=0;i<3;i++){const s=SHAPES[Math.floor(Math.random()*SHAPES.length)],col=Math.floor(Math.random()*COLORS.length),el=make(s,col);tray.appendChild(el);B.pieces.push(el)}}
 function lines(){const rows=[],cols=[];for(let r=0;r<10;r++)if(B.grid[r].every(v=>v>=0))rows.push(r);for(let c=0;c<10;c++)if(B.grid.every(row=>row[c]>=0))cols.push(c);if(rows.length||cols.length){const n=rows.length+cols.length;rows.forEach(r=>B.grid[r].fill(-1));cols.forEach(c=>B.grid.forEach(row=>row[c]=-1));B.score+=n*n*100;const s=document.getElementById('bs');if(s)s.textContent=B.score;draw()}}
 function noMove(){return B.pieces.every(el=>{for(let r=0;r<10;r++)for(let c=0;c<10;c++)if(fit(el._shape,r,c))return false;return true})}
 let drag=null;
 function start(e){const el=e.target.closest('#tray .piece');if(!el)return;e.preventDefault();const br=board.getBoundingClientRect(),cs=br.width/10;const ghost=el.cloneNode(true);ghost.id='ghost';ghost.classList.add('ghost');document.body.appendChild(ghost);el.style.opacity='.25';drag={el,shape:el._shape,color:+el.dataset.color,r:0,c:0,valid:false,br,cs,ghost};move(e)}
 function move(e){if(!drag)return;const d=drag;d.ghost.style.left=e.clientX+'px';d.ghost.style.top=e.clientY+'px';d.c=Math.round((e.clientX-d.br.left-d.cs*.5)/d.cs);d.r=Math.round((e.clientY-d.br.top-d.cs*1.1)/d.cs);d.valid=fit(d.shape,d.r,d.c);board.querySelectorAll('.preview').forEach(x=>x.classList.remove('preview'));if(d.valid)d.shape.forEach(([r,c])=>board.children[(d.r+r)*10+d.c+c]?.classList.add('preview'))}
 function end(){if(!drag)return;const d=drag;drag=null;d.ghost.remove();d.el.style.opacity='1';board.querySelectorAll('.preview').forEach(x=>x.classList.remove('preview'));if(!d.valid)return;d.shape.forEach(([r,c])=>B.grid[d.r+r][d.c+c]=d.color);B.score+=d.shape.length*5;document.getElementById('bs').textContent=B.score;d.el.remove();B.pieces=B.pieces.filter(x=>x!==d.el);draw();lines();if(!B.pieces.length)refill();if(noMove())document.getElementById('bo')?.classList.add('show')}
 document.addEventListener('pointerdown',start,{capture:true,passive:false});document.addEventListener('pointermove',e=>{if(drag){e.preventDefault();move(e)}},{passive:false});document.addEventListener('pointerup',end,{capture:true});
 refill();draw();window.__MOOD_BLOCK_ACTIVE__=B;
}
function hook(){
 const old=window.openGame;if(typeof old!=='function'||window.__gameOpenHook)return;window.__gameOpenHook=true;
 window.openGame=function(type){const r=old.apply(this,arguments);setTimeout(()=>{if(type==='trivia'){document.getElementById('v4Subject')?.addEventListener('click',e=>{const b=e.target.closest('.v4-sub');if(b)setTimeout(trivia,50)},{once:true});}if(type==='block')block()},180);return r};
}
function boot(){hook()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,150),{once:true});else setTimeout(boot,150);
})();
