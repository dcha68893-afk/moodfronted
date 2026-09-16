/* Runtime PWA identity normalizer. Keeps legacy HTML metadata from exposing
 * old/typo asset names while the canonical Necpra assets live in /icons/. */
(function(){
'use strict';
function fix(){
 const canonical='/icons/necpra-512.svg';
 document.title='Necpra - Global Chat Platform | Messaging, Calls & Marketplace';
 document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach((el,i)=>{el.href=i%2?'/icons/necpra-192.svg':'/icons/necpra-512.svg';el.type='image/svg+xml'});
 document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(el=>el.setAttribute('content',new URL(canonical,location.origin).href));
 const manifest=document.querySelector('link[rel="manifest"]');if(manifest)manifest.href='/manifest.json';
 const desc=document.querySelector('meta[name="description"]');if(desc)desc.content='Necpra — secure messaging, social communication, calls and marketplace.';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fix,{once:true});else fix();
})();
