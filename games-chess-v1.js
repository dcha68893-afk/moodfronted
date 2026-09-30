/* Necpra Game Master Chess — live two-player chess room engine. */
(function(){
'use strict';
if(window.__NECPRA_CHESS_V1__)return;window.__NECPRA_CHESS_V1__=1;
const P={w:{K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'},b:{K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'}};
const START=[
'rnbqkbnr','pppppppp','........','........','........','........','PPPPPPPP','RNBQKBNR'
];
let board=[],turn='w',selected=-1,legal=[],rights={wK:true,wQ:true,bK:true,bQ:true},ep=-1,lastMove=null,over=false,startAt=0,clock=null,role=null,ply=0,initKey=null,listening=false,started=false,solo=false;
const id=x=>document.getElementById(x);
function clone(b=board){return b.map(r=>r.slice())}
function color(p){return p==='.'?null:(p===p.toUpperCase()?'w':'b')}
function type(p){return p.toUpperCase()}
function reset(){board=START.map(r=>r.split(''));turn='w';selected=-1;legal=[];rights={wK:true,wQ:true,bK:true,bQ:true};ep=-1;lastMove=null;over=false;startAt=Date.now();ply=0;}
function key(b){return b.map(r=>r.join('')).join('/')}
function inside(r,c){return r>=0&&r<8&&c>=0&&c<8}
function attacked(b,r,c,by){
 const pawn=by==='w'?'P':'p',pr=by==='w'?r+1:r-1;
 for(const dc of [-1,1])if(inside(pr,c+dc)&&b[pr][c+dc]===pawn)return true;
 const knight=by==='w'?'N':'n';for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])if(inside(r+dr,c+dc)&&b[r+dr][c+dc]===knight)return true;
 const king=by==='w'?'K':'k';for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&inside(r+dr,c+dc)&&b[r+dr][c+dc]===king)return true;
 const lines=[[1,0],[-1,0],[0,1],[0,-1]],diags=[[1,1],[1,-1],[-1,1],[-1,-1]];
 for(const [dr,dc] of lines){let x=r+dr,y=c+dc;while(inside(x,y)){const p=b[x][y];if(p!=='.'){if(color(p)===by&&(type(p)==='R'||type(p)==='Q'))return true;break}x+=dr;y+=dc}}
 for(const [dr,dc] of diags){let x=r+dr,y=c+dc;while(inside(x,y)){const p=b[x][y];if(p!=='.'){if(color(p)===by&&(type(p)==='B'||type(p)==='Q'))return true;break}x+=dr;y+=dc}}
 return false;
}
function inCheck(b,side){const k=side==='w'?'K':'k';for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]===k)return attacked(b,r,c,side==='w'?'b':'w');return true}
function pseudo(r,c){
 const p=board[r][c],side=color(p),t=type(p),out=[];if(!p||p==='.'||side!==turn)return out;
 const add=(rr,cc,extra={})=>{if(!inside(rr,cc))return;const q=board[rr][cc];if(q!=='.'&&color(q)===side)return;if(q!=='.'&&type(q)==='K')return;out.push({r:rr,c:cc,...extra})};
 if(t==='P'){const d=side==='w'?-1:1,start=side==='w'?6:1;if(inside(r+d,c)&&board[r+d][c]==='.'){add(r+d,c);if(r===start&&board[r+2*d][c]==='.')add(r+2*d,c,{double:true})}for(const dc of [-1,1]){const rr=r+d,cc=c+dc;if(!inside(rr,cc))continue;if(board[rr][cc]!=='.'&&color(board[rr][cc])!==side)add(rr,cc,{capture:true});if(rr*8+cc===ep)add(rr,cc,{enpassant:true})}}
 if(t==='N')for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);
 if(t==='K'){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);const row=side==='w'?7:0;if(r===row&&c===4&&!inCheck(board,side)){if((side==='w'?rights.wK:rights.bK)&&board[row][5]==='.'&&board[row][6]==='.'&&!attacked(board,row,5,side==='w'?'b':'w')&&!attacked(board,row,6,side==='w'?'b':'w')&&board[row][7].toLowerCase()==='r')out.push({r:row,c:6,castle:'K'});if((side==='w'?rights.wQ:rights.bQ)&&board[row][1]==='.'&&board[row][2]==='.'&&board[row][3]==='.'&&!attacked(board,row,3,side==='w'?'b':'w')&&!attacked(board,row,2,side==='w'?'b':'w')&&board[row][0].toLowerCase()==='r')out.push({r:row,c:2,castle:'Q'})}}
 if(t==='R'||t==='B'||t==='Q'){const ds=[];if(t==='R'||t==='Q')ds.push([1,0],[-1,0],[0,1],[0,-1]);if(t==='B'||t==='Q')ds.push([1,1],[1,-1],[-1,1],[-1,-1]);for(const [dr,dc] of ds){let rr=r+dr,cc=c+dc;while(inside(rr,cc)){const q=board[rr][cc];if(q==='.')out.push({r:rr,c:cc});else{if(color(q)!==side&&type(q)!=='K')out.push({r:rr,c:cc,capture:true});break}rr+=dr;cc+=dc}}}
 return out;
}
function applyMove(b,m,from,side,opts={}){const n=clone(b),p=n[from.r][from.c];n[from.r][from.c]='.';if(m.enpassant)n[from.r][m.c]='.';n[m.r][m.c]=p;if(m.castle==='K'){n[m.r][5]=n[m.r][7];n[m.r][7]='.'}if(m.castle==='Q'){n[m.r][3]=n[m.r][0];n[m.r][0]='.'}if(type(p)==='P'&&(m.r===0||m.r===7))n[m.r][m.c]=side==='w'?'Q':'q';return n}
function legalMoves(r,c){
 const p=board[r][c],side=color(p);return pseudo(r,c).filter(m=>!inCheck(applyMove(board,m,{r,c},side),side));
}
function allMoves(side){
 const old=turn;turn=side;const out=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(color(board[r][c])===side)out.push(...legalMoves(r,c).map(m=>({from:{r,c},...m})));turn=old;return out;
}
function encode(){return key(board)+'|'+turn+'|'+ep+'|'+Object.entries(rights).filter(x=>x[1]).map(x=>x[0]).join(',')+'|'+ply}
function publish(){const room=window.__gameRoomMatch;if(!room||room.gameType!=='chess'||!window.__gameRoomState)return;window.__gameRoomState({position:encode(),turn,lastMove:lastMove?JSON.stringify(lastMove):'',progress:0,currentLevel:1,timeMs:Math.max(0,Date.now()-startAt)})}
function decode(s){try{const [pos,t,e,rr,pl]=String(s).split('|');ply=Number(pl)||0;board=pos.split('/').map(x=>x.split(''));turn=t||'w';ep=Number(e);rights={wK:false,wQ:false,bK:false,bQ:false};String(rr||'').split(',').forEach(k=>{if(k)rights[k]=true});return board.length===8&&board.every(r=>r.length===8)}catch(_){return false}}
function finish(result,text){over=true;clearInterval(clock);id('chessStatus').textContent=text;window.__gameRoomComplete?.(result==='win'?1:0,{timeMs:Math.max(0,Date.now()-startAt)});render()}
function checkEnd(){
 if(over)return;const moves=allMoves(turn),chk=inCheck(board,turn),mover=turn==='w'?'b':'w';
 if(!moves.length){if(chk)finish(solo?'win':(mover===role?'win':'loss'),(mover==='w'?'White':'Black')+' wins by checkmate.');else finish('draw','Draw by stalemate.')}
}
function move(from,m){
 const p=board[from.r][from.c],side=color(p),capture=board[m.r][m.c]!=='.'||m.enpassant;board=applyMove(board,m,from,side);const t=type(p);
 if(t==='K'){rights[side==='w'?'wK':'bK']=false;rights[side==='w'?'wQ':'bQ']=false}
 if(t==='R'){if(side==='w'&&from.r===7&&from.c===0)rights.wQ=false;if(side==='w'&&from.r===7&&from.c===7)rights.wK=false;if(side==='b'&&from.r===0&&from.c===0)rights.bQ=false;if(side==='b'&&from.r===0&&from.c===7)rights.bK=false}
 if(capture){if(m.r===7&&m.c===0)rights.wQ=false;if(m.r===7&&m.c===7)rights.wK=false;if(m.r===0&&m.c===0)rights.bQ=false;if(m.r===0&&m.c===7)rights.bK=false}
 ep=-1;if(t==='P'&&Math.abs(m.r-from.r)===2)ep=((from.r+m.r)/2)*8+from.c;
 lastMove={from,to:{r:m.r,c:m.c}};turn=side==='w'?'b':'w';ply++;selected=-1;legal=[];render();publish();
 const moves=allMoves(turn),check=inCheck(board,turn);if(!moves.length){if(check){const winner=side==='w'?'White':'Black';finish((side===role)?'win':'loss',winner+' wins by checkmate.')}else finish('draw','Draw by stalemate.');}else if(check)id('chessStatus').textContent='Check — '+(turn==='w'?'White':'Black')+' to move.';
}
function render(){
 const sec=id('chess');if(!sec)return;
 sec.innerHTML='<div class="ch-top"><button class="icon" id="chBack">‹</button><div><b>Game Master Chess</b><small>LIVE MATCH</small></div><span id="chessClock">00:00</span></div><div class="ch-meta"><span id="chessStatus">'+(over?'Game complete':turn==='w'?'White to move':'Black to move')+'</span><span>♔ '+(role==='w'?'You':'Opponent')+' · ♚ '+(role==='b'?'You':'Opponent')+'</span></div><div class="ch-board" id="chessBoard"></div><div class="ch-actions"><button id="chResign">Resign</button></div>';
 id('chBack').onclick=()=>window.home?.();id('chResign').onclick=()=>{if(over)return;const room=window.__gameRoomMatch;if(room&&room.gameType==='chess'&&window.__gameRoomState)window.__gameRoomState({position:encode(),turn,lastMove:lastMove?JSON.stringify(lastMove):'',result:'resign:'+role,progress:0,currentLevel:1,timeMs:Math.max(0,Date.now()-startAt)});finish('loss','You resigned.')};
 const b=id('chessBoard'),flip=role==='b';for(let i=0;i<64;i++){const r=flip?7-Math.floor(i/8):Math.floor(i/8),c=flip?7-i%8:i%8;{const sq=document.createElement('button');sq.className='ch-sq '+((r+c)%2?'dark':'light');sq.dataset.r=r;sq.dataset.c=c;if(lastMove&&((lastMove.from.r===r&&lastMove.from.c===c)||(lastMove.to.r===r&&lastMove.to.c===c)))sq.classList.add('last');if(selected===r*8+c)sq.classList.add('selected');if(legal.some(m=>m.r===r&&m.c===c))sq.classList.add('legal');const p=board[r][c];sq.textContent=p==='.'?'':P[color(p)][type(p)];sq.onclick=()=>tap(r,c);b.appendChild(sq)}}
 if(!clock){clock=setInterval(()=>{const sec=Math.floor((Date.now()-startAt)/1000),m=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');id('chessClock')&&(id('chessClock').textContent=m+':'+ss)},1000)}
}
function tap(r,c){if(over)return;const me=solo?turn:role,p=board[r][c],side=color(p);if(selected<0){if(side!==me||turn!==me)return;selected=r*8+c;legal=legalMoves(r,c);render();return}const from={r:Math.floor(selected/8),c:selected%8};const m=legal.find(x=>x.r===r&&x.c===c);if(m){move(from,m);return}if(side===me&&turn===me){selected=r*8+c;legal=legalMoves(r,c);render()}else{selected=-1;legal=[];render()}}
function myRole(room){
 if(window.__gameRoomRole)return window.__gameRoomRole==='host'?'w':'b';
 const me=window.__CURRENT_USER_ID__??window.__USER_ID__;
 if(me!=null&&room?.hostId!=null)return String(room.hostId)===String(me)?'w':'b';
 return 'w';
}
function onRoomUpdate(){
 const r=window.__gameRoomMatch;if(!started||!r||r.gameType!=='chess'||over)return;
 const st=r.state||{};
 if(String(st.result||'').startsWith('resign:')){if(st.result.slice(7)!==role)finish('win','Opponent resigned.');return}
 if(st.position){const remotePly=Number(String(st.position).split('|')[4])||0;if(remotePly>ply&&decode(st.position)){selected=-1;legal=[];render();checkEnd()}}
}
function init(force){
 const sec=id('chess');if(!sec)return;
 const room=window.__gameRoomMatch&&window.__gameRoomMatch.gameType==='chess'?window.__gameRoomMatch:null;
 // The room poll fires 'game:match-ready' every 1.5s. Only (re)start once per match,
 // otherwise the board was reset from stale server state and moves were reverted.
 const key=room?('room:'+room.code+':'+room.seed):'solo';
 if(started&&initKey===key&&!over&&force!==true){render();return}
 initKey=key;started=true;solo=!room;over=false;clearInterval(clock);clock=null;
 reset();role=solo?'w':myRole(room);
 if(room?.state?.position)decode(room.state.position);
 render();if(!solo&&!room?.state?.position)publish();
 if(!listening){listening=true;window.addEventListener('game:room:update',onRoomUpdate)}
 if(room?.state?.position)checkEnd();
}
window.addEventListener('game:match-ready',e=>{if(e.detail?.gameType==='chess')setTimeout(()=>init(false),30)});
window.__MOOD_CHESS_OPEN__=()=>init(false);
})();
