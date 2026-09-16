/* Marketplace image hardening.
 * Never use the Necpra app icon as a product/service/category image.
 * If a curated CDN image fails, use a label-specific neutral product image
 * instead. Seller-uploaded images are always preferred when present.
 */
(function(){
'use strict';
if(window.__NECPRA_MARKETPLACE_IMAGE_HARDENING__)return;
window.__NECPRA_MARKETPLACE_IMAGE_HARDENING__=true;
const FALLBACKS={
  Shampoo:'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=300&fit=crop',
  Conditioner:'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400&h=300&fit=crop',
  'Hair Oils':'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=400&h=300&fit=crop',
  Perfumes:'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400&h=300&fit=crop',
  Lipstick:'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400&h=300&fit=crop',
  Foundation:'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=300&fit=crop',
  'Eye Makeup':'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&h=300&fit=crop',
  Vitamins:'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&h=300&fit=crop',
  'Protein Shakes':'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400&h=300&fit=crop',
  'Medical Devices':'https://images.unsplash.com/photo-1580281658628-1f3b3b8f0d7a?w=400&h=300&fit=crop'
};
const generic='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop&q=80';
function fix(img){
  if(!img||!img.classList.contains('jm-subcat-img'))return;
  const label=(img.alt||img.closest('.jm-subcat-item')?.querySelector('.jm-subcat-name')?.textContent||'').trim();
  const current=img.getAttribute('src')||'';
  if(!label)return;
  if(current.includes('/icons/necpa-192.png')) img.src=FALLBACKS[label]||generic;
  img.addEventListener('error',()=>{
    if(img.dataset.necpraMarketplaceFallback==='1')return;
    img.dataset.necpraMarketplaceFallback='1';
    img.src=FALLBACKS[label]||generic;
  },{once:true});
}
function scan(root=document){root.querySelectorAll?.('.jm-subcat-img').forEach(fix)}
function init(){scan();new MutationObserver(m=>m.forEach(x=>x.addedNodes?.forEach(n=>{if(n.nodeType===1)scan(n)}))).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
