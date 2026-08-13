/* Mood Arcade V5: shared progression, themes, challenges and safe UX layer. */
(function(){'use strict';if(window.__MOOD_ARCADE_V5__)return;window.__MOOD_ARCADE_V5__=1;
const KEY='mood.arcade.v5';const themes=[['#07050e','#24133d'],['#06131d','#123b52'],['#07180f','#14502c'],['#1b1005','#5a3210'],['#18081a','#54204f'],['#08191b','#145057']];
let data;try{data=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){} data=data||{levels:{water:1,block:1,trivia:1,crossword:1},best:{water:0,block:0,trivia:0,crossword:0},streak:0,games:0,challenges:0};
function save(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}}
function game(){return document.body.dataset.game||''}function level(g=game()){return Math.max(1,data.levels[g]||1)}
function applyTheme(g=game()){const t=themes[Math.min(themes.length-1,Math.floor((level(g)-1)/2))];document.documentElement.style.setProperty('--arcade-bg',t[0]);document.documentElement.style.setProperty('--arcade-bg2',t[1]);document.body.style.background=`radial-gradient(circle at 50% -10%,${t[1]},${t[0]} 70%)`;document.body.dataset.arcadeLevel=level(g)}
function setLevel(g,n){data.levels[g]=Math.max(1,n);save();applyTheme(g);window.dispatchEvent(new CustomEvent('mood:level-changed',{detail:{game:g,level:data.levels[g]}}))}
function complete(g,score=0){data.games++;data.best[g]=Math.max(data.best[g]||0,Number(score)||0);data.streak++;setLevel(g,level(g)+1);save();window.dispatchEvent(new CustomEvent('mood:game-complete',{detail:{game:g,score,level:level(g)}}))}
function challenge(){const g=game(),s=data.best[g]||0,dataText=`Mood ${g} challenge — beat ${s} points on level ${level(g)}!`;data.challenges++;save();if(navigator.share)navigator.share({title:'Mood Challenge',text:dataText}).catch(()=>{});else if(navigator.clipboard)navigator.clipboard.writeText(dataText).then(()=>alert('Challenge copied!')).catch(()=>{});else alert(dataText)}
function decorate(){applyTheme();let old=window.openGame;if(typeof old==='function'&&!window.__arcadeOpen){window.__arcadeOpen=1;window.openGame=function(g){document.body.dataset.game=g;const r=old.apply(this,arguments);setTimeout(()=>{applyTheme(g);data.games++;save()},50);return r}}
 if(!$('[data-arcade-challenge]')){const b=document.createElement('button');b.dataset.arcadeChallenge='1';b.textContent='⚔️ Challenge';Object.assign(b.style,{position:'fixed',right:'12px',bottom:'70px',zIndex:9997,padding:'10px 14px',borderRadius:'18px',border:'1px solid #ffffff33',background:'linear-gradient(135deg,var(--arcade-bg2,#9d6cff),#ffffff33)',color:'#fff',fontWeight:900});b.onclick=challenge;document.body.appendChild(b)}
}
window.MoodArcade={version:'5.0.0',state:data,level,setLevel,complete,applyTheme,challenge};
window.addEventListener('mood:level-changed',e=>applyTheme(e.detail&&e.detail.game));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
})();
