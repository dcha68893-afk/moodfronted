(function(){
'use strict';if(window.__NecpaStatusHardeningV2)return;window.__NecpaStatusHardeningV2=true;
const all=()=>[...document.querySelectorAll('video,audio')];
function stop(except){all().forEach(x=>{if(x===except)return;try{x.pause();x.muted=true;x.currentTime=0}catch(_){} })}
function active(){const o=[document.querySelector('.ns-vibes.open'),document.querySelector('.ns-viewer.open')].filter(Boolean);return o.flatMap(x=>[...x.querySelectorAll('video,audio')]).at(-1)||null}
function enforce(){const a=active();stop(a);if(a&&!a.dataset.necpaGuard){a.dataset.necpaGuard='1';a.addEventListener('play',()=>stop(a));a.addEventListener('ended',()=>{try{a.pause();a.currentTime=0}catch(_){}},{once:true})}}
function composer(){
 const r=document.querySelector('[data-composer]');if(!r?.classList.contains('open'))return;
 const pane=r.querySelector('[data-pane="media"]'),old=r.querySelector('[data-publication-target]');if(!pane||!old||r.querySelector('[data-publish-choice-v2]'))return;
 const box=document.createElement('section');box.dataset.publishChoiceV2='1';box.style.cssText='margin-top:12px;padding:14px;border:1px solid var(--status-border,#e2e8f0);border-radius:16px;background:color-mix(in srgb,var(--status-accent,#2563eb) 7%,transparent)';
 box.innerHTML='<b>Where should this video appear?</b><small style="display:block;margin:5px 0 10px;color:#64748b">Choose before publishing. You can publish to Status, Vibes, or both.</small><select class="ns-select" data-pub-v2><option value="status">Status only</option><option value="vibe">Vibes only</option><option value="both">Status + Vibes</option></select><div data-vibe-controls-v2 style="margin-top:10px"></div>';
 pane.appendChild(box);
 const sel=box.querySelector('[data-pub-v2]');
 const sync=()=>{sel.value=old.value||'status';sel.onchange=()=>{old.value=sel.value;old.dispatchEvent(new Event('change',{bubbles:true}));draw()};draw()};
 function draw(){const c=box.querySelector('[data-vibe-controls-v2]');if(sel.value==='status'){c.innerHTML='';return}c.innerHTML='<div style="font-weight:700;margin-bottom:6px">Vibe audience & permissions</div><small style="display:block;color:#64748b;margin-bottom:8px">Audience is controlled by the Audience setting above. These controls decide what viewers can do.</small><label style="display:block;margin:6px 0"><input type="checkbox" data-vibe-r checked> Allow comments/replies</label><label style="display:block;margin:6px 0"><input type="checkbox" data-vibe-l checked> Allow love/reactions</label><label style="display:block;margin:6px 0"><input type="checkbox" data-vibe-s checked> Allow sharing</label>';[['[data-vibe-r]','[data-replies]'],['[data-vibe-l]','[data-reactions]'],['[data-vibe-s]','[data-sharing]']].forEach(([a,b])=>{const x=c.querySelector(a),y=r.querySelector(b);if(x&&y){x.checked=y.checked;x.onchange=()=>{y.checked=x.checked}}})}
 sync();
}
document.addEventListener('pointerdown',e=>{if(e.target.closest('.ns-nav,[data-rup],[data-rdown],[data-rclose],[data-cback],[data-cclose],[data-feed-back]'))stop()},true);
document.addEventListener('click',()=>setTimeout(enforce,0),true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stop()});
document.addEventListener('pagehide',()=>stop());
new MutationObserver(()=>{enforce();composer()}).observe(document.documentElement,{childList:true,subtree:true});
setInterval(enforce,1000);setTimeout(composer,300);
window.__NecpaStatusHardening={stopMedia:stop};
})();