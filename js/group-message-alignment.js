/* Group message visual convention: sender left, received right. */
(function(){
  'use strict';
  if(document.getElementById('necpraGroupMessageAlignment')) return;
  const s=document.createElement('style');
  s.id='necpraGroupMessageAlignment';
  s.textContent='.row.mine{justify-content:flex-start!important}.row:not(.mine){justify-content:flex-end!important}';
  (document.head||document.documentElement).appendChild(s);
})();
