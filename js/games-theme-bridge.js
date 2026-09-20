/* Legacy compatibility shim: no theme authority or fallback palette. */
(function(){'use strict';
  if(window.__NECPRA_GAMES_THEME_BRIDGE__)return;
  window.__NECPRA_GAMES_THEME_BRIDGE__=true;
  function sync(){
    try{
      var d=(window.parent&&window.parent!==window)?window.parent.document:document;
      var t=d.documentElement.getAttribute('data-theme');
      if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}
    }catch(_){}
  }
  window.addEventListener('message',function(e){if(e&&e.data&&e.data.type==='NECPRA_THEME_APPLIED')sync()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
