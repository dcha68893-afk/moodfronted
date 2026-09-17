/* Group navigation cleanup + Friends integration. group.html already loads this file from config.js. */
(function(){'use strict';if(window.__GROUP_PANEL_CLEANUP__)return;window.__GROUP_PANEL_CLEANUP__=true;
function loadFriendsBridge(){if(!/\/group\.html$/i.test(location.pathname))return;if(document.querySelector('script[data-friends-group-bridge]'))return;const s=document.createElement('script');s.src='/js/friends-group-bridge.js?v=20260917-1';s.async=false;s.dataset.friendsGroupBridge='1';(document.head||document.documentElement).appendChild(s)}
function observe(){loadFriendsBridge();new MutationObserver(loadFriendsBridge).observe(document.documentElement,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe);else observe();
})();
