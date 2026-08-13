/* Loads the additive Tools commercial UX layer after the existing Tools stack. */
(function(){
'use strict';
if(window.__MOOD_TOOLS_COMMERCIAL_LOADER__)return;window.__MOOD_TOOLS_COMMERCIAL_LOADER__=true;
function load(){if(document.querySelector('script[data-mood-tools-commercial]'))return;const s=document.createElement('script');s.src='/tools-commercial-ux.js?v=1.0.0';s.async=false;s.dataset.moodToolsCommercial='1';s.onload=()=>window.dispatchEvent(new CustomEvent('tools:commercial-layer-loaded'));s.onerror=()=>console.warn('[Tools] Commercial UX layer failed to load');document.head.appendChild(s)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
