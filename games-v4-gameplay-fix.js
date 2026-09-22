/* Mood Arcade gameplay repair v4.2
 * DOM-safe because game-v3.html keeps its core variables in script scope.
 * Trivia and Block therefore use their own authoritative UI/state instead of
 * trying to access inaccessible lexical variables from an external script.
 */
(function(){
'use strict';
if(window.__MOOD_GAMEPLAY_FIX_V42__)return;window.__MOOD_GAMEPLAY_FIX_V42__=true;

const BANK={
 maths:[
 ['What is 12 × 8?',['86','96','108','112'],1],['What is 25% of 80?',['10','20','25','40'],1],['What is 144 ÷ 12?',['10','12','14','16'],1],['Which number is prime?',['21','29','33','39'],1],['What is 7²?',['14','42','49','56'],2],['What is 3/4 as a decimal?',['0.25','0.5','0.75','1.25'],2],['What is 15 + 27?',['32','40','42','44'],2],['What is 9 × 9?',['72','81','90','99'],1],['What is the perimeter of a 5 by 3 rectangle?',['8','15','16','30'],2],['What is 1000 − 375?',['525','575','625','675'],2],['What is 2/5 of 50?',['10','15','20','25'],2],['What is the next prime after 17?',['18','19','21','23'],1],['If x + 7 = 19, x is?',['10','11','12','13'],2],['What is 6 × 7 − 5?',['32','37','42','47'],1],['What is 45 ÷ 5?',['7','8','9','10'],2],['What is 30% of 200?',['30','40','60','80'],2],['How many degrees are in a right angle?',['45','90','180','360'],1],['What is 11²?',['111','121','131','144'],1]
 ],
 english:[
 ['Which word is a noun?',['Quickly','Beautiful','Teacher','Run'],2],['Choose the correct spelling.',['Necessary','Necesary','Neccessary','Necessay'],0],['What is the opposite of ancient?',['Old','Modern','Historic','Past'],1],['Which word is a synonym of happy?',['Angry','Joyful','Tired','Nervous'],1],['Which sentence is punctuated correctly?',['Lets eat, Grandma.','Lets eat Grandma.','Let’s eat Grandma','Let’s eat, Grandma.'],3],['What is the plural of child?',['Childs','Children','Childes','Childrens'],1],['Which is a verb?',['Run','Blue','Happiness','Quick'],0],['Which word is an adjective?',['Carefully','Beauty','Bright','Swim'],2],['What is the past tense of go?',['Goed','Gone','Went','Going'],2],['Which is a pronoun?',['Table','They','Green','Quickly'],1],['Choose the correct article: ___ apple.',['A','An','Thee','No article'],1],['What is the opposite of generous?',['Kind','Selfish','Helpful','Giving'],1],['Which word means to look at closely?',['Ignore','Examine','Forget','Hide'],1],['Which is spelled correctly?',['Receive','Recieve','Receeve','Receve'],0],['What is the comparative form of good?',['Gooder','Best','Better','More good'],2],['Which sentence is a question?',['Close the door.','Where are you?','I am ready.','What a day!'],1],['Which word is an adverb?',['Slowly','Slow','Slowness','Slower'],0],['A person who writes books is an?',['Author','Actor','Artist','Editor'],0]
 ],
 kiswahili:[
 ['Neno lenye maana ya kinyume cha "refu" ni lipi?',['Fupi','Kubwa','Ndefu','Juu'],0],['Wingi wa neno "mtoto" ni upi?',['Watoto','Mtotoni','Vijana','Mtoto'],0],['Kinyume cha "baridi" ni?',['Joto','Mvua','Upepo','Giza'],0],['Mtu anayefundisha shuleni huitwa?',['Daktari','Mwalimu','Dereva','Mkulima'],1],['Wingi wa "kitabu" ni?',['Vitabu','Mabuku','Kitabuni','Vitabuvi'],0],['Neno "anakula" liko katika wakati gani?',['Uliopita','Ujao','Sasa','Sharti'],2],['Kinyume cha "furaha" ni?',['Upendo','Huzuni','Amani','Tabasamu'],1],['Nyama ya ng’ombe huitwaje kwa Kiingereza?',['Meat','Beef','Milk','Fish'],1],['Mti hutoa gesi gani wakati wa usanisinuru?',['Oksijeni','Heliamu','Hidrojeni','Methane'],0],['Mwezi unaonekana zaidi wakati gani?',['Usiku','Asubuhi tu','Mchana tu','Adhuhuri tu'],0],['"Haraka" ni aina gani ya neno?',['Kielezi','Nomino','Kitenzi','Kiunganishi'],0],['Kinyume cha "ndogo" ni?',['Fupi','Kubwa','Chache','Nyembamba'],1],['Wingi wa "jicho" ni?',['Macho','Majicho','Jicho','Machozi'],0],['Mtu anayelima huitwa?',['Mvuvi','Mkulima','Mjenzi','Mchoraji'],1]
 ],
 science:[
 ['What gas do plants absorb?',['Oxygen','Nitrogen','Carbon dioxide','Helium'],2],['Which organ pumps blood?',['Lung','Heart','Kidney','Liver'],1],['Water boils at sea level at what temperature?',['50°C','75°C','100°C','150°C'],2],['What force pulls objects toward Earth?',['Magnetism','Gravity','Friction','Pressure'],1],['Which planet is closest to the Sun?',['Earth','Mars','Mercury','Venus'],2],['What is H₂O?',['Salt','Water','Oxygen','Hydrogen'],1],['Which organ is used for breathing?',['Liver','Lung','Stomach','Skin'],1],['What is the basic unit of life?',['Atom','Cell','Tissue','Organ'],1],['Which material is a good conductor of electricity?',['Rubber','Glass','Copper','Wood'],2],['What process do plants use to make food?',['Respiration','Digestion','Photosynthesis','Fermentation'],2],['Which state of matter has a fixed shape?',['Gas','Liquid','Solid','Plasma'],2],['What is the center of an atom called?',['Electron','Nucleus','Shell','Ion'],1],['Which vitamin is commonly produced in skin from sunlight?',['Vitamin A','Vitamin B','Vitamin C','Vitamin D'],3],['What instrument measures temperature?',['Barometer','Thermometer','Ammeter','Compass'],1],['Which blood cells fight infection?',['Red cells','White cells','Platelets','Plasma'],1],['What is the nearest star to Earth?',['Sirius','The Sun','Polaris','Vega'],1]
 ],
 social:[
 ['Which is the largest continent?',['Africa','Asia','Europe','Australia'],1],['What is a group of countries governed together called?',['Federation','School','Village','Family'],0],['What is the capital of Kenya?',['Mombasa','Nairobi','Kisumu','Nakuru'],1],['Which ocean borders Kenya to the east?',['Atlantic','Pacific','Indian','Arctic'],2],['A person who moves to another country to live is an?',['Immigrant','Tourist','Pilot','Referee'],0],['What does a constitution provide?',['A recipe','A framework of government','A weather report','A map'],1],['Which is a renewable resource?',['Coal','Solar energy','Petrol','Natural gas'],1],['What is a map used for?',['Finding places','Cooking','Measuring temperature','Growing crops'],0],['Which is a democratic activity?',['Voting','Stealing','Hiding laws','Ignoring citizens'],0],['The equator divides Earth into which two halves?',['East/West','North/South','Land/Sea','Day/Night'],1],['Which is a public service?',['Road maintenance','Private bedroom','Personal diary','Family dinner'],0],['What is a community?',['People sharing a place or interests','Only one person','A machine','A planet'],0],['Which continent is Kenya in?',['Asia','Africa','Europe','South America'],1],['What is a border?',['A line separating areas','A mountain only','A river only','A building'],0],['Which is a natural disaster?',['Earthquake','Election','Festival','Parliament'],0],['What is trade?',['Exchange of goods or services','Sleeping','Voting only','Drawing'],0]
 ],
 it:[
 ['Which language runs in a web browser?',['JavaScript','Python','C++','SQL'],0],['What does CPU stand for?',['Central Processing Unit','Computer Power Unit','Core Program Utility','Central Print Unit'],0],['What does URL identify?',['A web address','A battery','A keyboard','A printer'],0],['Which device stores data permanently?',['RAM','SSD','CPU fan','Monitor'],1],['What does HTML mainly structure?',['Web pages','Electric motors','Databases only','Audio cables'],0],['Which is an operating system?',['Linux','HTML','USB','Wi-Fi'],0],['What does Wi-Fi provide?',['Wireless network access','Electricity','Paper printing','Screen brightness'],0],['Which key commonly refreshes a browser on Windows?',['F5','F1','F2','F12'],0],['What is phishing?',['A deceptive attempt to steal information','A video format','A backup method','A programming language'],0],['What does RAM provide?',['Temporary working memory','Permanent storage','Internet service','Power supply'],0],['Which is a database system?',['PostgreSQL','Photoshop','Bluetooth','HDMI'],0],['What symbol starts a hashtag?',['#','@','$','%'],0],['Which protocol is used for secure web browsing?',['HTTPS','FTP','SMTP','IRC'],0],['What is a bug in software?',['An error or defect','A keyboard','A server rack','A password'],0],['Which unit measures file size?',['Byte','Volt','Meter','Hertz'],0],['What does API commonly mean?',['Application Programming Interface','Automatic Power Input','Applied Program Index','Application Printer Instruction'],0]
 ],
 others:[
 ['Which planet is known as the Red Planet?',['Earth','Mars','Venus','Jupiter'],1],['What is the largest ocean?',['Atlantic','Indian','Arctic','Pacific'],3],['How many days are in a leap year?',['364','365','366','367'],2],['Which animal is known for black and white stripes?',['Tiger','Zebra','Lion','Panda'],1],['How many colors are in a traditional rainbow?',['5','6','7','8'],2],['Which instrument has black and white keys?',['Guitar','Piano','Drum','Flute'],1],['What is the fastest land animal?',['Lion','Cheetah','Horse','Leopard'],1],['Which sport uses a racket and shuttlecock?',['Tennis','Badminton','Hockey','Rugby'],1],['How many continents are commonly recognized?',['5','6','7','8'],2],['Which metal is liquid at room temperature?',['Iron','Mercury','Copper','Aluminium'],1],['What is the largest mammal?',['Elephant','Blue whale','Giraffe','Hippo'],1],['Which month has 28 days in a common year?',['January','February','March','April'],1],['What shape has three sides?',['Square','Circle','Triangle','Hexagon'],2],['Which bird is associated with peace?',['Eagle','Dove','Crow','Owl'],1],['How many hours are in a day?',['12','18','24','48'],2],['Which direction does the Sun appear to rise from?',['North','South','East','West'],2],['What is frozen water called?',['Steam','Ice','Mist','Dew'],1],['Which color results from mixing red and blue paint?',['Green','Purple','Orange','Yellow'],1]
 ]
};
const subject=()=>localStorage.getItem('mood_trivia_subject')||'random';

function trivia(){
 // FIX (TRIVIA-STALE-TIMER-DISABLES-ANSWERS): opening Trivia always starts the base game's own
 // 15s countdown for its first (generic) question before this subject-picker overlay even
 // appears. Once the player picks a subject and this function takes over the same #q/#answers
 // elements, that original countdown kept running unseen in game-v3.html's own script scope
 // (its `timer`/`qi` variables aren't reachable from here) and would still fire `answerQ(-1,null)`
 // on OUR new buttons a few seconds later — disabling the player's current answers and showing a
 // "correct" highlight for a question that was no longer on screen. game-v3.html's `answerQ` is a
 // function DECLARATION, so unlike its `let`/`const` variables it IS reachable on window; a single
 // harmless no-op override neutralizes that stale callback without touching anything else.
 if(typeof window.answerQ==='function'&&!window.__v4AnswerQNeutralized){
   window.__v4AnswerQNeutralized=true;
   window.answerQ=function(){};
 }
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
 // FIX (BLOCK-PUZZLE-DUPLICATE-DRAG): block() runs every time the player opens Block Puzzle from
 // the arcade home screen, not just the first time. These three document-level pointer listeners
 // used to be attached unconditionally on every call and were never removed, so replaying the
 // game a few times stacked up N duplicate drag handlers that all fired on the same touch —
 // inflating the score for a single placement and drawing several overlapping "ghost" pieces at
 // once. start/move/end still close over the correct #board/#tray elements (fixed IDs, never
 // recreated) and the shared B state (module-level, always current), so binding them only once
 // is safe and keeps every replay working exactly the same from the player's point of view.
 if(!window.__MOOD_BLOCK_DRAG_BOUND__){
   window.__MOOD_BLOCK_DRAG_BOUND__=true;
   document.addEventListener('pointerdown',start,{capture:true,passive:false});
   document.addEventListener('pointermove',e=>{if(drag){e.preventDefault();move(e)}},{passive:false});
   document.addEventListener('pointerup',end,{capture:true});
 }
 refill();draw();window.__MOOD_BLOCK_ACTIVE__=B;
}
function hook(){
 const old=window.openGame;if(typeof old!=='function'||window.__gameOpenHook)return;window.__gameOpenHook=true;
 window.openGame=function(type){const r=old.apply(this,arguments);setTimeout(()=>{if(type==='trivia'){document.getElementById('v4Subject')?.addEventListener('click',e=>{const b=e.target.closest('.v4-sub');if(b)setTimeout(trivia,50)},{once:true});}if(type==='block')block()},180);return r};
}
function boot(){hook()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,150),{once:true});else setTimeout(boot,150);
})();
