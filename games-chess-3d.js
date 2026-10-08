/* Necpra Chess 3D board (WebGL via js/vendor/three.min.js r147).
   Pure view layer: games-chess-v1.js owns all rules/state and calls NecpraChess3D.sync() after each render().
   Returns false (so the 2D board stays) if WebGL or three.js is unavailable. */
(function(){
'use strict';
if(window.NecpraChess3D)return;
var T=window.THREE;if(!T)return;
var R=null,scene,cam,host=null,tiles=[],pieces=new Map(),marks=null,anims=[],raf=0,dirty=true,flipped=false,onTap=null,ro=null,ray=new T.Raycaster(),ptr=new T.Vector2(),down=null,failed=false;
var COL={light:0xe8edf2,dark:0x587086,sel:0xffd34e,last:0xb9a64a,chk:0xff4d4d,w:0xf2eee4,b:0x2a2d33};

function lathe(pts,mat){var g=new T.LatheGeometry(pts.map(function(p){return new T.Vector2(p[0],p[1])}),28);var m=new T.Mesh(g,mat);m.castShadow=true;return m}
function sph(r,y,mat){var m=new T.Mesh(new T.SphereGeometry(r,20,16),mat);m.position.y=y;m.castShadow=true;return m}
function box(w,h,d,x,y,z,mat){var m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;return m}
var BASE=[[0,0],[.34,0],[.36,.05],[.33,.12],[.24,.2]];
function build(type,mat,isW){
  var g=new T.Group();
  if(type==='P'){g.add(lathe(BASE.concat([[.14,.34],[.13,.5],[.2,.54],[0,.54]]),mat));g.add(sph(.2,.66,mat))}
  else if(type==='R'){g.add(lathe(BASE.concat([[.2,.3],[.2,.62],[.3,.68],[.3,.86],[.22,.86],[.22,.8],[0,.8]]),mat))}
  else if(type==='B'){g.add(lathe(BASE.concat([[.15,.4],[.1,.58],[.24,.7],[.2,.9],[.06,1.02],[0,1.02]]),mat));g.add(sph(.07,1.08,mat))}
  else if(type==='Q'){g.add(lathe(BASE.concat([[.16,.45],[.12,.7],[.3,.9],[.32,.98],[.2,1.02],[0,1.02]]),mat));g.add(sph(.1,1.12,mat))}
  else if(type==='K'){g.add(lathe(BASE.concat([[.16,.45],[.12,.7],[.3,.9],[.3,.98],[.18,1.02],[0,1.02]]),mat));g.add(box(.1,.3,.1,0,1.18,0,mat));g.add(box(.26,.09,.1,0,1.2,0,mat))}
  else{ // knight: lathe body + angled head/snout/ears, facing -z for white
    g.add(lathe(BASE.concat([[.2,.3],[.2,.46],[0,.46]]),mat));
    var h=new T.Group();h.position.set(0,.5,0);h.rotation.x=-.25;
    h.add(box(.3,.62,.34,0,.28,.02,mat));h.add(box(.26,.22,.36,0,.5,-.2,mat));h.add(box(.07,.14,.07,-.08,.72,.1,mat));h.add(box(.07,.14,.07,.08,.72,.1,mat));
    g.add(h);
  }
  if(!isW)g.rotation.y=Math.PI;
  return g}
function pos(i){return new T.Vector3((i&7)-3.5,.09,(i>>3)-3.5)}

function init(){
  if(R||failed)return !failed;
  try{
    R=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'default'});
    if(!R.getContext())throw 0;
  }catch(e){failed=true;R=null;return false}
  R.setPixelRatio(Math.min(window.devicePixelRatio||1,2));R.shadowMap.enabled=true;R.shadowMap.type=T.PCFSoftShadowMap;
  var c=R.domElement;c.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:manipulation;border-radius:16px';c.setAttribute('aria-label','3D chess board');
  scene=new T.Scene();cam=new T.PerspectiveCamera(45,1,.1,60);
  scene.add(new T.HemisphereLight(0xffffff,0x44505e,.85));
  var d=new T.DirectionalLight(0xffffff,.9);d.position.set(-4,10,6);d.castShadow=true;d.shadow.mapSize.set(1024,1024);var s=d.shadow.camera;s.left=-6;s.right=6;s.top=6;s.bottom=-6;s.near=1;s.far=30;scene.add(d);
  var frame=new T.Mesh(new T.BoxGeometry(8.7,.3,8.7),new T.MeshStandardMaterial({color:0x182333,roughness:.6}));frame.position.y=-.12;frame.receiveShadow=true;scene.add(frame);
  for(var i=0;i<64;i++){var r=i>>3,cc=i&7,m=new T.Mesh(new T.BoxGeometry(1,.18,1),new T.MeshStandardMaterial({color:(r+cc)%2?COL.dark:COL.light,roughness:.7}));
    m.position.set(cc-3.5,0,r-3.5);m.receiveShadow=true;m.userData={idx:i,base:(r+cc)%2?COL.dark:COL.light};scene.add(m);tiles.push(m)}
  marks=new T.Group();scene.add(marks);
  c.addEventListener('pointerdown',function(e){down={x:e.clientX,y:e.clientY}});
  c.addEventListener('pointerup',function(e){if(!down)return;var dx=e.clientX-down.x,dy=e.clientY-down.y;down=null;if(dx*dx+dy*dy>64)return;pick(e)});
  c.addEventListener('webglcontextlost',function(e){e.preventDefault();failed=true;if(host)host.classList.remove('ch3d')});
  return true}
function pick(e){
  var b=R.domElement.getBoundingClientRect();ptr.x=((e.clientX-b.left)/b.width)*2-1;ptr.y=-((e.clientY-b.top)/b.height)*2+1;ray.setFromCamera(ptr,cam);
  var objs=tiles.slice();pieces.forEach(function(g){objs.push(g)});
  var hit=ray.intersectObjects(objs,true)[0];if(!hit)return;
  var o=hit.object;while(o&&o.userData.idx==null)o=o.parent;if(o&&onTap)onTap(o.userData.idx)}
function frame(){
  if(!host)return;var w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  R.setSize(w,h,false);cam.aspect=w/h;
  var z=flipped?-1:1;cam.position.set(0,11,10*z);cam.lookAt(0,0,.3*z);cam.updateProjectionMatrix();dirty=true;loop()}
function loop(){
  if(raf)return;
  raf=requestAnimationFrame(function step(t){
    raf=0;var busy=false;
    for(var i=anims.length-1;i>=0;i--){var a=anims[i];var k=Math.min(1,(performance.now()-a.t0)/a.ms),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
      a.o.position.x=a.f.x+(a.to.x-a.f.x)*e;a.o.position.z=a.f.z+(a.to.z-a.f.z)*e;a.o.position.y=a.to.y+Math.sin(Math.PI*e)*.55;
      if(k>=1){a.o.position.copy(a.to);anims.splice(i,1)}else busy=true}
    if(dirty||busy){R.render(scene,cam);dirty=false}
    if(busy)loop()})}

function sync(el,st){
  if(!init()){return false}
  if(host!==el){host=el;if(ro)ro.disconnect();if(window.ResizeObserver){ro=new ResizeObserver(function(){frame()});ro.observe(el)}}
  if(R.domElement.parentNode!==el)el.appendChild(R.domElement);
  flipped=!!st.flipped;onTap=st.onTap;
  // reconcile pieces with minimal motion so moves slide instead of teleporting
  var prev=new Map(pieces),next=new Map(),fresh=[];
  for(var i=0;i<64;i++){var p=st.board[i];if(p==='.')continue;var m=prev.get(i);if(m&&m.userData.p===p){next.set(i,m);prev.delete(i)}else fresh.push(i)}
  var left=[];prev.forEach(function(g,k){left.push([k,g])});
  var moved=[];
  fresh.forEach(function(i){var p=st.board[i],j=-1;for(var n=0;n<left.length;n++)if(left[n][1].userData.p===p){j=n;break}
    if(j>=0){var g=left.splice(j,1)[0][1];g.userData.idx=i;next.set(i,g);moved.push([g,i])}
    else{var isW=p===p.toUpperCase(),mat=new T.MeshStandardMaterial({color:isW?COL.w:COL.b,roughness:.4,metalness:.12}),g2=build(p.toUpperCase(),mat,isW);g2.userData={p:p,idx:i};g2.position.copy(pos(i));scene.add(g2);next.set(i,g2)}});
  left.forEach(function(x){scene.remove(x[1])});
  pieces=next;
  moved.forEach(function(x){var g=x[0],to=pos(x[1]);anims=anims.filter(function(a){return a.o!==g});anims.push({o:g,f:g.position.clone(),to:to,t0:performance.now(),ms:260})});
  // highlights
  tiles.forEach(function(t){t.material.color.setHex(t.userData.base);t.material.emissive.setHex(0)});
  function tint(i,hex,em){var t=tiles[i];if(t){t.material.color.setHex(hex);if(em)t.material.emissive.setHex(em)}}
  if(st.last){tint(st.last.f,COL.last);tint(st.last.t,COL.last)}
  if(st.check>=0)tint(st.check,COL.chk,0x551111);
  if(st.selected>=0)tint(st.selected,COL.sel,0x443300);
  while(marks.children.length){var c=marks.children[0];marks.remove(c);if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose()}
  (st.targets||[]).forEach(function(t){var cap=t.cap,m=new T.Mesh(cap?new T.TorusGeometry(.4,.06,10,28):new T.CylinderGeometry(.16,.16,.04,20),new T.MeshStandardMaterial({color:cap?0xe0443e:0x1f2937,transparent:true,opacity:.85}));
    var p=pos(t.t);m.position.set(p.x,.12,p.z);if(cap)m.rotation.x=Math.PI/2;marks.add(m)});
  frame();return true}
function dispose(){if(raf)cancelAnimationFrame(raf);raf=0;if(ro)ro.disconnect();if(R){R.dispose();if(R.domElement.parentNode)R.domElement.parentNode.removeChild(R.domElement)}R=null;host=null}
window.NecpraChess3D={sync:sync,dispose:dispose,supported:function(){return !failed}};
})();
