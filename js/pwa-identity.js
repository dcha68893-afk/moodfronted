/* Runtime PWA identity normalizer. Keeps legacy HTML metadata aligned with canonical Necpa assets (app log image). */
(function(){
'use strict';
function fix(){
 const canonical='/icons/necpa-512.png';
 document.title='Necpa - Global Chat Platform | Messaging & Marketplace';
 document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach((el,i)=>{el.href=i%2?'/icons/necpa-192.png':'/icons/necpa-512.png';el.type='image/png'});
 document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(el=>el.setAttribute('content',new URL(canonical,location.origin).href));
 const manifest=document.querySelector('link[rel="manifest"]');if(manifest)manifest.href='/manifest.json';
 const desc=document.querySelector('meta[name="description"]');if(desc)desc.content='Necpa — secure messaging, social communication and marketplace.';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fix,{once:true});else fix();
})();
