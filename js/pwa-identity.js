/* Runtime PWA identity normalizer. Keeps legacy HTML metadata aligned with canonical Necpra assets. */
(function(){
'use strict';
function fix(){
 const icon='/icons/necpra-512.png';
 const share='/icons/necpra-og.png';
 /* Only set the title when a page has none, so the landing page and feature pages keep their own search title. */
 if(!document.title||/^\s*$/.test(document.title))document.title='Necpra - Messaging, Duka Smart, Accommodation & Money';
 document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach((el,i)=>{el.href=i%2?'/icons/necpra-192.png':icon;el.type='image/png'});
 /* Share previews use the 1200x630 image; do not overwrite one a page already set to something else. */
 document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(el=>{
  const cur=el.getAttribute('content')||'';
  if(!cur||/necpra-(512|192)\.png$/.test(cur))el.setAttribute('content',new URL(share,location.origin).href);
 });
 const manifest=document.querySelector('link[rel="manifest"]');if(manifest)manifest.href='/manifest.json';
 const desc=document.querySelector('meta[name="description"]');
 if(desc&&!desc.content)desc.content='Necpra is a private messaging and social app with friends, groups, Duka Smart for shops, accommodation and Necpra Money.';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fix,{once:true});else fix();
})();
