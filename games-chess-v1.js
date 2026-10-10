/* Necpra Game Master Chess — complete rules engine, computer opponent, pass-and-play,
   move history with undo/branching, and live two-player room play. */
(function(){
'use strict';
if(window.__NECPRA_CHESS_V1__)return;window.__NECPRA_CHESS_V1__=1;

/* ───────────── Rules engine (pure functions on a state object) ─────────────
   state = {b:[64 chars, index=row*8+col, row 0 = black's back rank], turn:'w'|'b',
            rights:{wK,wQ,bK,bQ}, ep:-1|index, half:halfmove clock, ply:plies played} */
const START='rnbqkbnr/pppppppp/......../......../......../......../PPPPPPPP/RNBQKBNR';
const FILES='abcdefgh',PROMO=['Q','R','B','N'];
const KN=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],ORTH=[[1,0],[-1,0],[0,1],[0,-1]],DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];
const isW=p=>p!=='.'&&p===p.toUpperCase(),col=p=>p==='.'?null:(isW(p)?'w':'b'),typ=p=>p.toUpperCase(),opp=s=>s==='w'?'b':'w';
const R=i=>i>>3,C=i=>i&7,inb=(r,c)=>r>=0&&r<8&&c>=0&&c<8,sqn=i=>FILES[C(i)]+(8-R(i));
function parse(pos){const rows=String(pos).split('/');if(rows.length!==8)return null;const b=[];for(const r of rows){const a=r.split('');if(a.length!==8)return null;b.push(...a)}return b}
function newState(){return{b:parse(START),turn:'w',rights:{wK:true,wQ:true,bK:true,bQ:true},ep:-1,half:0,ply:0}}
function epActive(s){if(s.ep<0)return false;const pw=s.turn==='w'?'P':'p',off=s.turn==='w'?8:-8;for(const dc of[-1,1]){const c=C(s.ep)+dc;if(c<0||c>7)continue;if(s.b[s.ep+off+dc]===pw)return true}return false}
function pkey(s){const r=s.rights;return s.b.join('')+s.turn+(r.wK?'K':'')+(r.wQ?'Q':'')+(r.bK?'k':'')+(r.bQ?'q':'')+(epActive(s)?s.ep:'')}
function attacked(b,sq,by){
 const r=R(sq),c=C(sq),pr=by==='w'?r+1:r-1,P=by==='w'?'P':'p';
 for(const dc of[-1,1])if(inb(pr,c+dc)&&b[pr*8+c+dc]===P)return true;
 const N=by==='w'?'N':'n';for(const[dr,dc]of KN)if(inb(r+dr,c+dc)&&b[(r+dr)*8+c+dc]===N)return true;
 const K=by==='w'?'K':'k';for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&inb(r+dr,c+dc)&&b[(r+dr)*8+c+dc]===K)return true;
 for(const[dr,dc]of ORTH){let x=r+dr,y=c+dc;while(inb(x,y)){const p=b[x*8+y];if(p!=='.'){if(col(p)===by&&(typ(p)==='R'||typ(p)==='Q'))return true;break}x+=dr;y+=dc}}
 for(const[dr,dc]of DIAG){let x=r+dr,y=c+dc;while(inb(x,y)){const p=b[x*8+y];if(p!=='.'){if(col(p)===by&&(typ(p)==='B'||typ(p)==='Q'))return true;break}x+=dr;y+=dc}}
 return false}
function kingSq(b,side){const k=side==='w'?'K':'k';for(let i=0;i<64;i++)if(b[i]===k)return i;return -1}
function inCheck(b,side){const k=kingSq(b,side);return k>=0&&attacked(b,k,opp(side))}
function pseudo(s){
 const b=s.b,side=s.turn,out=[];
 for(let i=0;i<64;i++){const p=b[i];if(p==='.'||col(p)!==side)continue;const t=typ(p),r=R(i),c=C(i);
  const push=(to,ex)=>out.push(Object.assign({f:i,t:to,cap:b[to]},ex));
  if(t==='P'){
   const d=side==='w'?-1:1,sr=side==='w'?6:1,pr=side==='w'?0:7,r1=r+d;
   if(inb(r1,c)&&b[r1*8+c]==='.'){if(r1===pr){for(const q of PROMO)push(r1*8+c,{promo:q})}else{push(r1*8+c);if(r===sr&&b[(r+2*d)*8+c]==='.')push((r+2*d)*8+c,{dbl:true})}}
   for(const dc of[-1,1]){const cc=c+dc;if(!inb(r1,cc))continue;const to=r1*8+cc,q=b[to];
    if(q!=='.'&&col(q)!==side){if(r1===pr){for(const x of PROMO)push(to,{promo:x})}else push(to)}
    else if(q==='.'&&to===s.ep&&b[r*8+cc]===(side==='w'?'p':'P'))push(to,{ep:true,cap:side==='w'?'p':'P'})}
  }else if(t==='N'||t==='K'){
   const ds=t==='N'?KN:ORTH.concat(DIAG);
   for(const[dr,dc]of ds){const rr=r+dr,cc=c+dc;if(!inb(rr,cc))continue;const to=rr*8+cc,q=b[to];if(q==='.'||col(q)!==side)push(to)}
   if(t==='K'){const home=side==='w'?60:4,rk=side==='w'?'R':'r',en=opp(side);
    if(i===home&&!attacked(b,i,en)){
     if(s.rights[side+'K']&&b[i+1]==='.'&&b[i+2]==='.'&&b[i+3]===rk&&!attacked(b,i+1,en)&&!attacked(b,i+2,en))push(i+2,{castle:'K'});
     if(s.rights[side+'Q']&&b[i-1]==='.'&&b[i-2]==='.'&&b[i-3]==='.'&&b[i-4]===rk&&!attacked(b,i-1,en)&&!attacked(b,i-2,en))push(i-2,{castle:'Q'})}}
  }else{
   const ds=[];if(t==='R'||t==='Q')ds.push(...ORTH);if(t==='B'||t==='Q')ds.push(...DIAG);
   for(const[dr,dc]of ds){let rr=r+dr,cc=c+dc;while(inb(rr,cc)){const to=rr*8+cc,q=b[to];if(q==='.')push(to);else{if(col(q)!==side)push(to);break}rr+=dr;cc+=dc}}
  }}
 return out}
function make(s,m){
 const b=s.b.slice(),p=b[m.f],side=s.turn,t=typ(p);
 b[m.f]='.';if(m.ep)b[side==='w'?m.t+8:m.t-8]='.';
 b[m.t]=m.promo?(side==='w'?m.promo:m.promo.toLowerCase()):p;
 if(m.castle==='K'){b[m.t-1]=b[m.t+1];b[m.t+1]='.'}
 if(m.castle==='Q'){b[m.t+1]=b[m.t-2];b[m.t-2]='.'}
 const r=Object.assign({},s.rights);
 if(t==='K'){r[side+'K']=false;r[side+'Q']=false}
 for(const q of[m.f,m.t]){if(q===63)r.wK=false;if(q===56)r.wQ=false;if(q===7)r.bK=false;if(q===0)r.bQ=false}
 return{b,turn:opp(side),rights:r,ep:(t==='P'&&Math.abs(m.t-m.f)===16)?(m.f+m.t)/2:-1,half:(t==='P'||m.cap!=='.')?0:s.half+1,ply:s.ply+1}}
function legal(s){return pseudo(s).filter(m=>!inCheck(make(s,m).b,s.turn))}
function san(s,m,ms){
 let str;
 if(m.castle)str=m.castle==='K'?'O-O':'O-O-O';
 else{const t=typ(s.b[m.f]),cap=m.cap!=='.'||m.ep;str='';
  if(t==='P'){if(cap)str+=FILES[C(m.f)]+'x';str+=sqn(m.t);if(m.promo)str+='='+m.promo}
  else{str+=t;const others=ms.filter(o=>o.f!==m.f&&o.t===m.t&&typ(s.b[o.f])===t);
   if(others.length){const sf=others.some(o=>C(o.f)===C(m.f)),sr=others.some(o=>R(o.f)===R(m.f));if(!sf)str+=FILES[C(m.f)];else if(!sr)str+=(8-R(m.f));else str+=sqn(m.f)}
   if(cap)str+='x';str+=sqn(m.t)}}
 const n=make(s,m);if(inCheck(n.b,n.turn))str+=legal(n).length?'+':'#';
 return str}
function insufficient(b){
 const pcs=[];for(let i=0;i<64;i++){const p=b[i];if(p!=='.'&&typ(p)!=='K')pcs.push([typ(p),i])}
 if(!pcs.length)return true;
 if(pcs.some(x=>x[0]==='P'||x[0]==='R'||x[0]==='Q'))return false;
 if(pcs.length===1)return true;
 if(pcs.every(x=>x[0]==='B')){const sh=(R(pcs[0][1])+C(pcs[0][1]))%2;return pcs.every(x=>(R(x[1])+C(x[1]))%2===sh)}
 return false}

/* ───────────── Computer opponent ───────────── */
const VAL={P:100,N:320,B:330,R:500,Q:900,K:0},MATE=100000;
const PST={
P:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
N:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
B:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
R:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
K:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]};
function evalS(s){let v=0;for(let i=0;i<64;i++){const p=s.b[i];if(p==='.')continue;const t=typ(p),w=isW(p),tb=PST[t];v+=(w?1:-1)*(VAL[t]+(tb?tb[w?i:(7-R(i))*8+C(i)]:0))}return s.turn==='w'?v:-v}
function order(s,ms){const sc=m=>(m.cap!=='.'?10*VAL[typ(m.cap)]-VAL[typ(s.b[m.f])]+1000:0)+(m.promo?800:0);ms.sort((a,b)=>sc(b)-sc(a));return ms}
function qs(s,ms,a,b,ctx,d){
 const stand=evalS(s);if(stand>=b)return stand;if(stand>a)a=stand;if(d>=4)return stand;
 const caps=order(s,ms.filter(m=>m.cap!=='.'||m.promo));
 for(const m of caps){const n=make(s,m),v=-qs(n,legal(n),-b,-a,ctx,d+1);if(ctx.abort)return 0;if(v>=b)return v;if(v>a)a=v}
 return a}
function ab(s,d,a,b,ctx,pl){
 if(ctx.abort)return 0;
 if((++ctx.n&255)===0&&Date.now()>ctx.dl){ctx.abort=true;return 0}
 if(s.half>=100)return 0;
 const ms=legal(s);if(!ms.length)return inCheck(s.b,s.turn)?-MATE+pl:0;
 if(d<=0)return qs(s,ms,a,b,ctx,0);
 order(s,ms);let best=-Infinity;
 for(const m of ms){const v=-ab(make(s,m),d-1,-b,-a,ctx,pl+1);if(ctx.abort)return 0;if(v>best)best=v;if(v>a)a=v;if(a>=b)break}
 return best}
const LEVELS={easy:{d:1,ms:300,slack:90},medium:{d:3,ms:900,slack:12},hard:{d:6,ms:2200,slack:0}};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a}
function pickMove(s,level){
 const cfg=LEVELS[level]||LEVELS.medium,ms=shuffle(legal(s));if(!ms.length)return null;if(ms.length===1)return ms[0];
 order(s,ms);const ctx={n:0,dl:Date.now()+cfg.ms,abort:false};
 if(level==='easy'){ // weakest: 1-ply, then picks randomly among moves within `slack` centipawns of best
  const sc=ms.map(m=>({m,v:-ab(make(s,m),0,-Infinity,Infinity,ctx,1)}));const top=Math.max(...sc.map(x=>x.v));
  const pool=sc.filter(x=>x.v>=top-cfg.slack);return pool[Math.random()*pool.length|0].m}
 let best=ms[0];
 for(let d=1;d<=cfg.d;d++){
  let a=-Infinity,cur=null;
  for(const m of ms){const v=-ab(make(s,m),d-1,-Infinity,-a,ctx,1);if(ctx.abort)break;if(v>a||!cur){a=v;cur=m}}
  if(ctx.abort&&d>1)break;if(cur){best=cur;ms.splice(ms.indexOf(cur),1);ms.unshift(cur)}
  if(ctx.abort||Math.abs(a)>MATE-200)break}
 return best}
/* Opening book: several mainline systems, so the computer does not play the same game every time. */
const BOOK=[
'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4','e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7',
'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6','e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5',
'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7','e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6',
'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c7c6','d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8',
'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5','d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8',
'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5','c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5',
'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7 d2d3 e8g8','d2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 c7c5 c2c3 b8c6',
'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5','e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5',
'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6'].map(l=>l.split(' '));
const mvName=m=>sqn(m.f)+sqn(m.t)+(m.promo?m.promo.toLowerCase():'');

/* ───────────── Game / UI state ───────────── */
let mode='cpu',level='medium',myColor='w',role='w',base=newState(),hist=[],view=0,over=false,resultText='',selected=-1,targets=[],
    flipped=false,startAt=Date.now(),clock=null,initKey=null,started=false,listening=false,aiTok=0,thinking=false,promoMs=null,sidePick='w';
const $=x=>document.getElementById(x);
const cur=()=>hist.length?hist[hist.length-1].s:base,shown=()=>view===0?base:hist[view-1].s,atLive=()=>view===hist.length;
const beep=(f,d)=>{try{window.beep&&window.beep(f,d)}catch(_){}},buzz=p=>{try{window.buzz&&window.buzz(p)}catch(_){}};
const GL={K:'\u265A',Q:'\u265B',R:'\u265C',B:'\u265D',N:'\u265E',P:'\u265F'},VS='\uFE0E';
const roomOf=()=>window.__gameRoomMatch&&window.__gameRoomMatch.gameType==='chess'?window.__gameRoomMatch:null;
function encode(s){const r=s.rights;return s.b.reduce((a,p,i)=>a+p+((i&7)===7&&i<63?'/':''),'')+'|'+s.turn+'|'+s.ep+'|'+['wK','wQ','bK','bQ'].filter(k=>r[k]).join(',')+'|'+s.ply}
function decode(str){try{const[pos,t,e,rr,pl]=String(str).split('|'),b=parse(pos);if(!b)return null;const rights={wK:false,wQ:false,bK:false,bQ:false};String(rr||'').split(',').forEach(k=>{if(k in rights)rights[k]=true});return{b,turn:t==='b'?'b':'w',rights,ep:Number.isFinite(Number(e))?Number(e):-1,half:0,ply:Number(pl)||0}}catch(_){return null}}
function publish(s,extra){const room=roomOf();if(!room||!window.__gameRoomState)return;const l=hist.length?hist[hist.length-1].m:null;window.__gameRoomState(Object.assign({position:encode(s),turn:s.turn,lastMove:l?JSON.stringify({from:{r:R(l.f),c:C(l.f)},to:{r:R(l.t),c:C(l.t)}}):'',progress:0,currentLevel:1,timeMs:Math.max(0,Date.now()-startAt)},extra||{}))}
function myRole(room){if(window.__gameRoomRole)return window.__gameRoomRole==='host'?'w':'b';const me=window.__CURRENT_USER_ID__??window.__USER_ID__;if(me!=null&&room?.hostId!=null)return String(room.hostId)===String(me)?'w':'b';return 'w'}

function repCount(s){const k=pkey(s);let n=pkey(base)===k?1:0;for(const h of hist)if(pkey(h.s)===k)n++;return n}
function assess(s){
 const ms=legal(s),chk=inCheck(s.b,s.turn);
 if(!ms.length)return chk?{over:true,kind:'mate',winner:opp(s.turn)}:{over:true,kind:'stalemate'};
 if(insufficient(s.b))return{over:true,kind:'material'};
 if(s.half>=100)return{over:true,kind:'fifty'};
 if(repCount(s)>=3)return{over:true,kind:'rep'};
 return{over:false,check:chk}}
const cname=c=>c==='w'?'White':'Black';
function finish(r){
 over=true;thinking=false;aiTok++;clearInterval(clock);clock=null;
 let text,res;
 if(r.kind==='mate'){text='Checkmate — '+cname(r.winner)+' wins.';res=mode==='room'?(r.winner===role?'win':'loss'):mode==='cpu'?(r.winner===myColor?'win':'loss'):'win'}
 else if(r.kind==='resign'){text=(mode==='room'||mode==='cpu')?(r.winner===myColor?'Opponent resigned.':'You resigned.'):cname(opp(r.winner))+' resigned.';res=(mode==='room'||mode==='cpu')?(r.winner===myColor?'win':'loss'):'win'}
 else{text={stalemate:'Draw by stalemate.',material:'Draw — insufficient material.',fifty:'Draw — 50-move rule.',rep:'Draw by threefold repetition.'}[r.kind];res='draw'}
 resultText=text;
 if(mode==='room'&&window.__gameRoomComplete)window.__gameRoomComplete(res==='win'?1:0,{timeMs:Math.max(0,Date.now()-startAt)});
 if(res==='win')buzz([30,40,80]);else buzz(30);
 render();showResult()}

let hintsLeft=3,puzIdx=0,puzDaily=false;
function chToast(t){try{window.toast&&window.toast(t)}catch(_){}}
function pgnFallback(t){try{const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0;top:0;left:0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}catch(_){}}
function pgnText(){const mv=hist.map(h=>h.san);let body='';for(let i=0;i<mv.length;i++){if(i%2===0)body+=(i/2+1)+'. ';body+=mv[i]+' '}
 const r=String(resultText||''),res=/draw/i.test(r)?'1/2-1/2':/white wins/i.test(r)?'1-0':/black wins/i.test(r)?'0-1':'*';
 const d=new Date(),dt=d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');
 const w=mode==='cpu'?(myColor==='w'?'You':'Computer'):'White',b=mode==='cpu'?(myColor==='b'?'You':'Computer'):'Black';
 return '[Event "Necpra Game Master Chess"]\n[Date "'+dt+'"]\n[White "'+w+'"]\n[Black "'+b+'"]\n[Result "'+res+'"]\n\n'+body.trim()+(body?' ':'')+res}
/* ───────────── Moves ───────────── */
function commit(m,fromRemote){
 if(mode!=='room'&&view<hist.length){hist.length=view;if(over){over=false;hideOverlay();startClock()}}
 const s=shown(),ms=legal(s),t=san(s,m,ms),n=make(s,m);
 if(mode==='puzzle'){const pr=assess(n);if(pr.kind!=='mate'){selected=-1;targets=[];render();buzz(40);chToast('Not checkmate - try again');return}}
 hist.push({s:n,m,san:t});view=hist.length;selected=-1;targets=[];
 beep(m.cap!=='.'?420:560,.05);if(/[+#]$/.test(t)){beep(900,.09);buzz([18,30,18])}else if(/^O-O/.test(t)){beep(640,.07);buzz(15)}else buzz(m.cap!=='.'?14:8);
 if(mode==='room'&&!fromRemote)publish(n);
 if(mode==='puzzle'){over=true;resultText='Puzzle solved!';clearInterval(clock);clock=null;buzz([30,40,80]);render();showPuzzleDone();return}
 const r=assess(n);
 if(r.over){finish(r.kind==='mate'?r:r);return}
 render();
 if(mode==='cpu'&&n.turn!==myColor)thinkSoon()}
function thinkSoon(){
 const tok=++aiTok;thinking=true;render();
 setTimeout(()=>{
  if(tok!==aiTok)return;
  let mv=null;try{mv=bookMove()||pickMove(cur(),level)}catch(e){console.error('[chess] engine error',e)}
  if(tok!==aiTok)return;thinking=false;
  if(mv)commit(mv);else render()},90)}
function bookMove(){
 if(hist.length>=10||base.ply!==0)return null;
 const played=hist.map(h=>mvName(h.m)),ms=legal(cur()),cands=[];
 for(const line of BOOK){if(line.length<=played.length)continue;let ok=true;for(let i=0;i<played.length;i++)if(line[i]!==played[i]){ok=false;break}if(ok)cands.push(line[played.length])}
 if(!cands.length)return null;const pick=cands[Math.random()*cands.length|0];return ms.find(m=>mvName(m)===pick)||null}
function interactive(s){
 if(thinking||promoMs)return false;
 if(mode==='room')return !over&&atLive()&&s.turn===role;
 if(mode==='cpu')return (!over||view<hist.length)&&s.turn===myColor;
 return !over||view<hist.length}
function tap(i){
 const s=shown();if(!interactive(s))return;const p=s.b[i];
 if(selected>=0){const ms=targets.filter(m=>m.t===i);if(ms.length){if(ms[0].promo&&ms.length>1){promoMs=ms;render();showPromo();return}commit(ms[0]);return}}
 if(p!=='.'&&col(p)===s.turn){selected=i;targets=legal(s).filter(m=>m.f===i)}else{selected=-1;targets=[]}
 render()}
function undo(){
 if(mode==='room'||!hist.length)return;aiTok++;thinking=false;
 let n=(mode==='cpu'&&cur().turn===myColor)?2:1;n=Math.min(n,hist.length);hist.length-=n;view=hist.length;
 if(over){over=false;startClock()}selected=-1;targets=[];hideOverlay();render();
 if(mode==='cpu'&&cur().turn!==myColor)thinkSoon()}
function go(v){if(thinking)return;view=Math.max(0,Math.min(hist.length,v));selected=-1;targets=[];render()}

/* ───────────── Rendering ───────────── */
const CSS='.ch-board.ch3d{position:relative;overflow:visible;border:0;background:transparent;box-shadow:none;transform:none!important}.ch-board.ch3d .ch-sq{visibility:hidden;pointer-events:none}'
+'#chess .ch-scroll{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;padding-bottom:10px}#chess .ch-board{margin:4px auto}'
+'.ch-sq{border:0;padding:0;font-family:"Segoe UI Symbol","Noto Sans Symbols 2","Apple Symbols",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}.ch-sq.pw{color:#fff;text-shadow:0 0 2px #000,0 0 3px #000,0 1px 4px #000a}.ch-sq.pb{color:#151515;text-shadow:0 0 1px #fff6}'
+'.ch-sq.chk{background:radial-gradient(circle,#ff4d4dcc 0,#ff4d4d55 60%,transparent 75%),var(--sqbg)}.ch-sq.light{--sqbg:#e8edf2}.ch-sq.dark{--sqbg:#587086}.ch-sq.legal.cap:after{width:88%;height:88%;background:transparent;border:4px solid #1f2937aa}'
+'.ch-lb{position:absolute;font-size:9px;font-style:normal;font-weight:900;line-height:1;opacity:.75;pointer-events:none;color:#31475c}.ch-lb.lf{right:3px;bottom:2px}.ch-lb.lr{left:3px;top:2px}.ch-sq.dark .ch-lb{color:#e8edf2}'
+'.ch-cap{width:min(94vw,560px);min-height:24px;display:flex;align-items:center;gap:6px;padding:0 6px;font-size:17px;color:#cbd6e6;line-height:1;overflow:hidden;white-space:nowrap}.ch-cap b{font-size:11px;color:#8fb4ff;margin-left:4px}.ch-cap .nm{font-size:11px;font-weight:900;letter-spacing:.5px;margin-right:auto;color:#9eb0c8}'
+'.ch-moves{width:min(94vw,560px);max-height:74px;overflow:auto;display:flex;flex-wrap:wrap;gap:4px 3px;padding:6px;margin:4px 0;border-radius:12px;background:#ffffff0d;font-size:12px;color:#dbe6f5}.ch-moves .no{color:#7f93ad;font-weight:900;margin:0 1px 0 4px;align-self:center}.ch-moves button{padding:3px 7px;border-radius:8px;background:transparent;color:inherit;font-weight:800;border:1px solid transparent;font-size:12px}.ch-moves button.on{background:#5b7cfa;border-color:#9db2ff;color:#fff}.ch-moves .empty{color:#7f93ad;padding:3px 6px}'
+'.ch-bar{width:min(94vw,560px);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:6px 0}.ch-bar button{min-width:52px;height:40px;padding:0 12px;border-radius:12px;background:var(--g-surface);border:1px solid var(--g-line);color:inherit;font-weight:900;font-size:13px}.ch-bar button:disabled{opacity:.35}.ch-bar button.danger{color:#ff8b8b}'
+'.ch-ov{position:absolute;inset:0;z-index:30;display:none;place-items:center;padding:18px;background:rgba(5,9,18,.82);backdrop-filter:blur(8px)}.ch-ov.show{display:grid}.ch-ovc{width:min(92vw,380px);padding:22px 18px;border-radius:24px;background:linear-gradient(160deg,#1c2942,#0f1727);border:1px solid #ffffff22;box-shadow:0 20px 60px #000b;text-align:center;color:#fff}.ch-ovc h2{margin:0 0 4px;font-size:22px}.ch-ovc p{margin:6px 0 14px;font-size:12px;color:#9eb0c8}'
+'.ch-seg{display:flex;gap:6px;margin:10px 0 14px}.ch-seg button{flex:1;height:40px;border-radius:12px;background:#ffffff10;border:1px solid #ffffff22;color:#fff;font-weight:900;font-size:13px}.ch-seg button.on{background:#5b7cfa;border-color:#9db2ff}.ch-big{display:block;width:100%;height:48px;margin:8px 0;border-radius:14px;border:0;background:linear-gradient(135deg,#5b7cfa,#7a5cfa);color:#fff;font-weight:900;font-size:15px}.ch-big.alt{background:#ffffff14;border:1px solid #ffffff2a}.ch-promo{display:flex;gap:10px;justify-content:center;margin-top:10px}.ch-promo button{width:62px;height:62px;border-radius:16px;background:#e8edf2;border:0;font-size:40px;line-height:1;color:#111}.ch-promo.b button{background:#587086;color:#111}';
function css(){if($('chessCssV2'))return;const s=document.createElement('style');s.id='chessCssV2';s.textContent=CSS;document.head.appendChild(s)}
function build(){
 const sec=$('chess');if(!sec||$('chShell'))return;css();
 sec.innerHTML='<div class="ch-top" id="chShell"><button class="icon" id="chBack" aria-label="Back">‹</button><div><b>Game Master Chess</b><small id="chSub">CHESS</small></div><span id="chessClock">00:00</span></div>'
 +'<div class="ch-scroll"><div class="ch-meta" style="width:min(94vw,560px);box-sizing:border-box"><span id="chessStatus"></span><span id="chWho"></span></div><div class="ch-cap" id="chCapTop"></div><div class="ch-board" id="chessBoard"></div><div class="ch-cap" id="chCapBot"></div>'
 +'<div class="ch-moves" id="chMoves"></div><div class="ch-bar"><button id="chFirst" aria-label="First move">«</button><button id="chPrev" aria-label="Previous move">‹</button><button id="chNext" aria-label="Next move">›</button><button id="chLast" aria-label="Latest move">»</button><button id="chUndo">↶ Undo</button><button id="chFlip">⇅ Flip</button><button id="chHint">💡 Hint</button><button id="chPgn">PGN</button><button id="ch3dBtn">3D</button><button id="chNew">New</button><button id="chResign" class="danger">Resign</button></div></div>'
 +'<div class="ch-ov" id="chOv"></div>';
 $('chBack').onclick=()=>window.home&&window.home();
 $('chFirst').onclick=()=>go(0);$('chPrev').onclick=()=>go(view-1);$('chNext').onclick=()=>go(view+1);$('chLast').onclick=()=>go(hist.length);
 $('chUndo').onclick=undo;$('chFlip').onclick=()=>{flipped=!flipped;render()};$('ch3dBtn').onclick=()=>{let on=true;try{on=localStorage.getItem('necpra_chess_3d')!=='0';localStorage.setItem('necpra_chess_3d',on?'0':'1')}catch(_){}render()};$('chNew').onclick=showMenu;
/* PLAY STORE PARITY (Chess.com / Lichess): a limited-use best-move Hint (not offered in live rooms) and PGN export so a game can be reviewed in any chess app. */
$('chHint').onclick=()=>{if(over||thinking||promoMs)return;const s=shown();if(mode==='room'||!interactive(s))return;if(hintsLeft<=0){chToast('No hints left this game');return}
 let mv=null;try{mv=pickMove(s,'hard')}catch(e){console.error('[chess] hint error',e)}
 if(!mv){chToast('No hint available');return}
 hintsLeft--;selected=mv.f;targets=legal(s).filter(m=>m.f===mv.f&&m.t===mv.t);render();chToast('Hint: '+san(s,mv,legal(s))+'  ('+hintsLeft+' left)')};
$('chPgn').onclick=()=>{const t=pgnText();const done=()=>chToast(hist.length?'PGN copied':'No moves yet');
 try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,()=>{pgnFallback(t);done()});return}}catch(_){}
 pgnFallback(t);done()};
 $('chResign').onclick=()=>{if(over||thinking)return;const room=roomOf();
  if(mode==='room'){publish(cur(),{result:'resign:'+role});finish({kind:'resign',winner:opp(role)})}
  else finish({kind:'resign',winner:mode==='cpu'?opp(myColor):opp(cur().turn)})}}
function startClock(){clearInterval(clock);clock=setInterval(()=>{const t=Math.floor((Date.now()-startAt)/1000),e=$('chessClock');if(e)e.textContent=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')},1000)}
function capRow(s,by){
 const start={P:8,N:2,B:2,R:2,Q:1},cnt={w:{P:0,N:0,B:0,R:0,Q:0},b:{P:0,N:0,B:0,R:0,Q:0}};
 for(const p of s.b){if(p==='.'||typ(p)==='K')continue;cnt[col(p)][typ(p)]++}
 const lostSide=opp(by),out=[];let mat=0;
 for(const t of['Q','R','B','N','P']){const n=Math.max(0,start[t]-cnt[lostSide][t]);for(let i=0;i<n;i++)out.push('<span class="'+(lostSide==='w'?'pw':'pb')+'" style="'+(lostSide==='w'?'color:#fff;text-shadow:0 0 2px #000':'color:#151515;text-shadow:0 0 1px #fff8')+'">'+GL[t]+VS+'</span>')}
 for(const t of Object.keys(start))mat+=VAL[t]*(cnt[by][t]-cnt[lostSide][t]);
 return{html:out.join(''),diff:mat}}
function movesHtml(){
 if(!hist.length)return'<span class="empty">No moves yet</span>';
 let h='';for(let i=0;i<hist.length;i++){const abs=base.ply+i,white=abs%2===0,no=Math.floor(abs/2)+1;
  if(white)h+='<span class="no">'+no+'.</span>';else if(i===0)h+='<span class="no">'+no+'…</span>';
  h+='<button data-i="'+(i+1)+'"'+(view===i+1?' class="on"':'')+'>'+hist[i].san+'</button>'}
 return h}
function statusText(s){
 if(over&&atLive())return resultText;
 if(thinking)return'Computer is thinking…';
 if(!atLive())return'Reviewing move '+view+(mode==='room'?'':' — play a move to branch');
 const chk=inCheck(s.b,s.turn)?' — Check!':'';
 if(mode==='puzzle')return'Puzzle: '+cname(s.turn)+' to move, mate in 1';
 if(mode==='room')return(s.turn===role?'Your move':"Opponent's move")+chk;
 if(mode==='cpu')return(s.turn===myColor?'Your move':'Computer to move')+chk;
 return cname(s.turn)+' to move'+chk}
/* 3D view: loads three.js + games-chess-3d.js on first use; falls back to the 2D board if WebGL is unavailable. */
function want3d(){try{return localStorage.getItem('necpra_chess_3d')!=='0'}catch(_){return true}}
let l3d=0;
function load3d(){if(l3d)return;l3d=1;const add=(src,cb)=>{const e=document.createElement('script');e.src=src;e.onload=cb;e.onerror=()=>{l3d=2};document.body.appendChild(e)};add('/js/vendor/three.min.js?v=147',()=>add('/games-chess-3d.js?v=1',()=>{if(window.NecpraChess3D)render()}))}
function apply3d(b,s,lm,ksq){let ok=false;
 if(want3d()){if(window.NecpraChess3D){try{ok=window.NecpraChess3D.sync(b,{board:s.b,flipped,selected,targets:targets.map(m=>({t:m.t,cap:m.cap!=='.'})),last:lm?{f:lm.f,t:lm.t}:null,check:ksq,onTap:tap})}catch(_){ok=false}}else load3d()}
 b.classList.toggle('ch3d',!!ok);const t=$('ch3dBtn');if(t)t.textContent=ok?'2D':'3D'}
function render(){
 build();const s=shown();
 $('chSub').textContent=mode==='room'?'LIVE MATCH':mode==='cpu'?('VS COMPUTER · '+level.toUpperCase()):'PASS & PLAY';
 $('chessStatus').textContent=statusText(s);
 const wn=mode==='room'?(role==='w'?'You':'Opponent'):mode==='cpu'?(myColor==='w'?'You':'Computer'):'White',bn=mode==='room'?(role==='b'?'You':'Opponent'):mode==='cpu'?(myColor==='b'?'You':'Computer'):'Black';
 $('chWho').textContent='♔ '+wn+' · ♚ '+bn;
 const bot=flipped?'b':'w',top=opp(bot),cb=capRow(s,bot),ct=capRow(s,top);
 $('chCapTop').innerHTML='<span class="nm">'+(top==='w'?wn:bn).toUpperCase()+'</span>'+ct.html+(ct.diff>0?'<b>+'+Math.round(ct.diff/100)+'</b>':'');
 $('chCapBot').innerHTML='<span class="nm">'+(bot==='w'?wn:bn).toUpperCase()+'</span>'+cb.html+(cb.diff>0?'<b>+'+Math.round(cb.diff/100)+'</b>':'');
 const b=$('chessBoard');b.innerHTML='';
 const lm=view>0?hist[view-1].m:null,ksq=inCheck(s.b,s.turn)?kingSq(s.b,s.turn):-1;
 for(let k=0;k<64;k++){const r=flipped?7-(k>>3):(k>>3),c=flipped?7-(k&7):(k&7),i=r*8+c,p=s.b[i],sq=document.createElement('button');
  sq.className='ch-sq '+((r+c)%2?'dark':'light');sq.type='button';
  if(lm&&(lm.f===i||lm.t===i))sq.classList.add('last');if(selected===i)sq.classList.add('selected');if(i===ksq)sq.classList.add('chk');
  const tg=targets.find(m=>m.t===i);if(tg){sq.classList.add('legal');if(tg.cap!=='.')sq.classList.add('cap')}
  if(p!=='.'){sq.classList.add(isW(p)?'pw':'pb');sq.appendChild(document.createTextNode(GL[typ(p)]+VS))}
  if((k&7)===0){const e=document.createElement('i');e.className='ch-lb lr';e.textContent=8-r;sq.appendChild(e)}
  if((k>>3)===7){const e=document.createElement('i');e.className='ch-lb lf';e.textContent=FILES[c];sq.appendChild(e)}
  sq.onclick=()=>tap(i);b.appendChild(sq)}
 apply3d(b,s,lm,ksq);
 const mv=$('chMoves');mv.innerHTML=movesHtml();mv.querySelectorAll('button').forEach(x=>x.onclick=()=>go(Number(x.dataset.i)));if(atLive())mv.scrollTop=mv.scrollHeight;
 const solo=mode!=='room';
 $('chFirst').disabled=$('chPrev').disabled=view===0||thinking;$('chNext').disabled=$('chLast').disabled=atLive()||thinking;
 $('chUndo').disabled=!solo||!hist.length;$('chUndo').style.display=solo?'':'none';$('chNew').style.display=solo?'':'none';
 $('chHint').style.display=mode==='room'?'none':'';$('chHint').disabled=over||thinking;$('chPgn').disabled=!hist.length;$('chResign').disabled=over}
function ov(html){const o=$('chOv');if(!o)return;o.innerHTML=html;o.classList.add('show');return o}
function hideOverlay(){const o=$('chOv');if(o){o.classList.remove('show');o.innerHTML=''}}
function showPromo(){
 const w=promoMs[0]&&col(shown().b[promoMs[0].f])==='w';
 const o=ov('<div class="ch-ovc"><h2>Promote pawn</h2><p>Choose a piece</p><div class="ch-promo '+(w?'':'b')+'">'+PROMO.map(q=>'<button data-q="'+q+'">'+GL[q]+VS+'</button>').join('')+'</div></div>');
 o.querySelectorAll('button').forEach(x=>x.onclick=()=>{const m=promoMs.find(z=>z.promo===x.dataset.q);promoMs=null;hideOverlay();if(m)commit(m)})}
function showResult(){
 const room=mode==='room';
 const o=ov('<div class="ch-ovc"><h2>'+(over?resultText:'')+'</h2><p>'+Math.ceil(hist.length/2)+' moves played</p>'+(room?'':'<button class="ch-big" id="chAgain">Play again</button><button class="ch-big alt" id="chReview">Review game</button><button class="ch-big alt" id="chMenu">Menu</button>')+'<button class="ch-big alt" id="chExit">Back to arcade</button></div>');
 const g=id=>o.querySelector('#'+id);
 if(g('chAgain'))g('chAgain').onclick=()=>startSolo(mode,level,myColor);if(g('chReview'))g('chReview').onclick=()=>{hideOverlay();go(hist.length)};if(g('chMenu'))g('chMenu').onclick=showMenu;
 g('chExit').onclick=()=>{hideOverlay();window.home&&window.home()}}
/* PUZZLES (Chess.com / Lichess parity): mate-in-1 positions, each checked offline with chess.js. Any mating move solves it. */
const PUZZLES=[["......k./.....ppp/......../......../......../......../.....PPP/R.....K.","w"],["r.bqkb.r/pppp.ppp/..n..n../....p..Q/..B.P.../......../PPPP.PPP/RNB.K.NR","w"],["rnbqkbnr/pppp.ppp/......../....p.../......P./.....P../PPPPP..P/RNBQKBNR","b"],["......rk/......pp/......../......N./......../......../......../......K.","w"],[".......k/......../.....KQ./......../......../......../......../........","w"],["k......./......../.K....../......../......../......../......../.......R","w"],[".......k/.....Kp./......../......../......../......../......../......R.","w"],["......k./.....ppp/......../......../......../......../.Q...PPP/......K.","w"],["....k.../......../....K.../......../......../......../......../R.......","w"],[".......k/......../......K./......../......../......../......../.R......","w"],["...k..../R......./...K..../......../......../......../......../........","w"],["k......./..Q...../.K....../......../......../......../......../........","w"],["r.bqkbnr/pppp.ppp/..n...../....p..Q/..B.P.../......../PPPP.PPP/RNB.K.NR","w"],["......k./......../......K./......../......../......../......../.......Q","w"],[".......k/......../......K./......../......../......../Q......./........","w"],[".k....../ppp...../......../......../......../......../......../.K.R....","w"],["r.....k./.....ppp/......../......../......../......../.....PPP/R.....K.","w"],["..k...../......../..K...../......../......../......../......../.......R","w"],["k.K...../......../......../......../......../......../......../.R......","w"]];
const puzDay=()=>new Date().toLocaleDateString('en-CA');
function puzSolved(){try{return JSON.parse(localStorage.getItem('mood.chess.puz.solved')||'[]')}catch(_){return[]}}
function puzCoins(n){try{if(window.data){window.data.coins=(Number(window.data.coins)||0)+n;window.save&&window.save()}}catch(_){}}
function startPuzzle(idx,isDaily){
 aiTok++;thinking=false;promoMs=null;idx=((idx%PUZZLES.length)+PUZZLES.length)%PUZZLES.length;
 const pz=PUZZLES[idx],b=parse(pz[0]);if(!b){chToast('Puzzle unavailable');return}
 mode='puzzle';level='puzzle';puzIdx=idx;puzDaily=!!isDaily;myColor=pz[1];role=myColor;hintsLeft=1;
 base={b,turn:pz[1],rights:{wK:false,wQ:false,bK:false,bQ:false},ep:-1,half:0,ply:0};
 hist=[];view=0;over=false;resultText='';selected=-1;targets=[];flipped=pz[1]==='b';startAt=Date.now();startClock();started=true;
 hideOverlay();render()}
function showPuzzleDone(){
 const solved=puzSolved(),first=!solved.includes(puzIdx);let bonus=0;
 if(first){solved.push(puzIdx);try{localStorage.setItem('mood.chess.puz.solved',JSON.stringify(solved))}catch(_){}bonus+=10}
 if(puzDaily){let d='';try{d=localStorage.getItem('mood.chess.puz.daily')||''}catch(_){}if(d!==puzDay()){try{localStorage.setItem('mood.chess.puz.daily',puzDay())}catch(_){}bonus+=20}}
 if(bonus)puzCoins(bonus);
 const o=ov('<div class="ch-ovc"><h2>Puzzle solved!</h2><p>Checkmate in 1'+(bonus?' \u2022 +'+bonus+' coins':'')+'</p><p>'+solved.length+' of '+PUZZLES.length+' puzzles solved</p><button class="ch-big" id="chPzNext">Next puzzle</button><button class="ch-big alt" id="chMenu">Menu</button></div>');
 o.querySelector('#chPzNext').onclick=()=>startPuzzle(puzIdx+1,false);o.querySelector('#chMenu').onclick=showMenu}
function showMenu(){
 aiTok++;thinking=false;
 const o=ov('<div class="ch-ovc"><h2>Game Master Chess</h2><p>Full rules: castling, en passant, promotion, draws</p><div class="ch-seg" id="chSide"><button data-c="w">♔ White</button><button data-c="b">♚ Black</button><button data-c="r">Random</button></div>'
 +'<button class="ch-big" data-lv="easy">Computer · Easy</button><button class="ch-big" data-lv="medium">Computer · Medium</button><button class="ch-big" data-lv="hard">Computer · Hard</button><button class="ch-big alt" data-lv="pass">Pass &amp; Play (2 players)</button><button class="ch-big alt" id="chPuzDay">Puzzle of the day (+20)</button><button class="ch-big alt" id="chPuz">Mate-in-1 puzzles</button>'
 +'<p>To play a friend online, use the Play Together button.</p>'+(started&&hist.length&&!over?'<button class="ch-big alt" id="chResume">Resume game</button>':'')+'<button class="ch-big alt" id="chExit2">Back to arcade</button></div>');
 const mark=()=>o.querySelectorAll('#chSide button').forEach(x=>x.classList.toggle('on',x.dataset.c===sidePick));mark();
 o.querySelectorAll('#chSide button').forEach(x=>x.onclick=()=>{sidePick=x.dataset.c;mark()});
 o.querySelectorAll('[data-lv]').forEach(x=>x.onclick=()=>{const lv=x.dataset.lv,c=sidePick==='r'?(Math.random()<.5?'w':'b'):sidePick;startSolo(lv==='pass'?'pass':'cpu',lv==='pass'?level:lv,c)});
 o.querySelector('#chPuz').onclick=()=>{const sv=puzSolved();let i=0;while(i<PUZZLES.length&&sv.includes(i))i++;startPuzzle(i>=PUZZLES.length?0:i,false)};
 o.querySelector('#chPuzDay').onclick=()=>{const t=puzDay();let h=0;for(const c of t)h=(h*31+c.charCodeAt(0))>>>0;startPuzzle(h%PUZZLES.length,true)};
 const rs=o.querySelector('#chResume');if(rs)rs.onclick=()=>{hideOverlay();if(mode==='cpu'&&cur().turn!==myColor&&!over)thinkSoon()};
 o.querySelector('#chExit2').onclick=()=>{hideOverlay();window.home&&window.home()}}
function startSolo(m,lv,c){
 try{localStorage.removeItem(SAVE_KEY)}catch(_){}
 aiTok++;thinking=false;promoMs=null;mode=m;level=lv;myColor=m==='cpu'?c:'w';role=myColor;
 hintsLeft=3;base=newState();hist=[];view=0;over=false;resultText='';selected=-1;targets=[];flipped=m==='cpu'&&myColor==='b';startAt=Date.now();startClock();
 hideOverlay();render();if(m==='cpu'&&myColor==='b')thinkSoon()}

/* ───────────── Live room play ───────────── */
function onRoomUpdate(){
 const r=roomOf();if(!started||!r||mode!=='room'||over)return;const st=r.state||{};
 if(String(st.result||'').startsWith('resign:')){if(st.result.slice(7)!==role)finish({kind:'resign',winner:role});return}
 if(!st.position)return;
 const rp=Number(String(st.position).split('|')[4])||0,c=cur();if(rp<=c.ply)return;
 const ns=decode(st.position);if(!ns)return;view=hist.length;
 const mv=rp===c.ply+1?legal(c).find(m=>pkey(make(c,m))===pkey(ns)):null;
 if(mv){commit(mv,true)}else{base=ns;hist=[];view=0;selected=-1;targets=[];const a=assess(ns);if(a.over)finish(a);else render()}}
/* ───────────── Save & resume (solo games only; live rooms are server-driven) ───────────── */
const SAVE_KEY='necpra.resume.v1.chess';
function saveSolo(){try{
 if(mode==='room'||mode==='puzzle'||roomOf()||!started)return;
 if(over||!hist.length){if(over)localStorage.removeItem(SAVE_KEY);return}
 localStorage.setItem(SAVE_KEY,JSON.stringify({mode,level,myColor,flipped,base:encode(base),hist:hist.map(h=>({p:encode(h.s),m:h.m,san:h.san}))}))}catch(_){}}
function restoreSolo(){try{
 const d=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(!d||!Array.isArray(d.hist)||!d.hist.length)return false;
 const b=decode(d.base);if(!b)return false;const h=[];
 for(const x of d.hist){const st=decode(x.p);if(!st||!x.m)return false;h.push({s:st,m:x.m,san:x.san||''})}
 mode=d.mode==='pass'?'pass':'cpu';level=d.level||'medium';myColor=mode==='cpu'?(d.myColor==='b'?'b':'w'):'w';role=myColor;
 base=b;hist=h;view=hist.length;over=false;resultText='';selected=-1;targets=[];flipped=!!d.flipped;startAt=Date.now();startClock();return true}catch(_){return false}}
setInterval(saveSolo,1500);window.addEventListener('pagehide',saveSolo);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveSolo()});
function init(force){
 const sec=$('chess');if(!sec)return;
 const room=roomOf(),key=room?('room:'+room.code+':'+room.seed):'solo';
 // The room poll fires 'game:match-ready' every 1.5s: only (re)start once per match, otherwise
 // the board would be reset from stale server state and moves reverted.
 if(started&&initKey===key&&!over&&force!==true){build();render();return}
 initKey=key;started=true;aiTok++;thinking=false;promoMs=null;build();
 if(room){
  mode='room';role=myRole(room);myColor=role;base=newState();hist=[];view=0;over=false;resultText='';selected=-1;targets=[];flipped=role==='b';startAt=Date.now();startClock();
  if(room.state&&room.state.position){const ns=decode(room.state.position);if(ns)base=ns}
  hideOverlay();render();if(!(room.state&&room.state.position))publish(base);
  if(!listening){listening=true;window.addEventListener('game:room:update',onRoomUpdate)}
  const a=assess(base);if(a.over)finish(a);
 }else{mode=mode==='room'?'cpu':mode;if(!restoreSolo()){base=newState();hist=[];view=0;over=false;resultText=''}render();showMenu()}}
window.addEventListener('game:match-ready',e=>{if(e.detail?.gameType==='chess')setTimeout(()=>init(false),30)});
window.__MOOD_CHESS_OPEN__=()=>init(false);
})();
