/* Necpa hardening layer: 1:1 messages + accommodation cascade/form. */
(function(){
  'use strict';
  if(window.__NECPRA_MESSAGE_ACCOM_HARDENING__) return;
  window.__NECPRA_MESSAGE_ACCOM_HARDENING__ = true;

  const apiBase=()=>typeof window.__getApiBase==='function'?window.__getApiBase():'';
  const token=()=>window.authToken||localStorage.getItem('authToken')||localStorage.getItem('accessToken')||localStorage.getItem('token')||'';
  async function jsonGet(path){
    const h={}; const t=token(); if(t) h.Authorization='Bearer '+t;
    const r=await fetch(apiBase()+path,{headers:h,credentials:'include'}); const j=await r.json().catch(()=>({}));
    if(!r.ok||j.success===false||j.status==='error') throw new Error(j.message||'Request failed');
    return j;
  }

  /* ---------------- 1:1 MESSAGE HARDENING ---------------- */
  let identityCache=new Map();
  async function loadIdentityCache(){
    try{
      const j=await jsonGet('/chats?limit=100');
      const chats=j?.data?.chats||[];
      chats.forEach(c=>{
        const u=c.otherParticipant;
        if(u?.id!=null) identityCache.set(String(c.id),{id:u.id,name:u.displayName||[u.firstName,u.lastName].filter(Boolean).join(' ').trim()||u.username||'Conversation',avatar:u.avatar||null,userId:u.id});
      });
      patchConversationRows();
    }catch(_){ }
  }
  function patchConversationRows(){
    document.querySelectorAll('.conv-item[data-chat-id]').forEach(row=>{
      const x=identityCache.get(String(row.dataset.chatId)); if(!x) return;
      const name=row.querySelector('.conv-name'); if(name){ const star=/^⭐\s*/.exec(name.textContent||''); name.textContent=(star?star[0]:'')+x.name; }
      const img=row.querySelector('.conv-avatar'); if(img&&x.avatar) img.src=x.avatar;
    });
  }
  function hardenMessageModule(){
    if(!window.MessageModule||window.MessageModule.__necpraHardeningV1) return !!window.MessageModule;
    const M=window.MessageModule;
    const originalOpen=M.openChat;
    const originalSend=M.sendMessage;
    M.openChat=async function(args){
      const a=Object.assign({},args||{});
      if(a.conversationId!=null && (a.userId==null || !a.userName)){
        try{
          const j=await jsonGet('/chats/'+encodeURIComponent(a.conversationId));
          const c=j?.data?.chat||j?.data||{}; const u=c.otherParticipant;
          if(u){ a.userId=a.userId??u.id; a.userName=a.userName||u.displayName||[u.firstName,u.lastName].filter(Boolean).join(' ').trim()||u.username; a.avatar=a.avatar||u.avatar; identityCache.set(String(a.conversationId),{id:u.id,userId:u.id,name:a.userName||'Conversation',avatar:u.avatar||null}); }
        }catch(_){ }
      }
      return originalOpen.call(M,a);
    };
    M.sendMessage=async function(args){
      const a=Object.assign({},args||{});
      if(a.chatId && !a.receiverId){
        try{
          const conv=(M.getConversations()||[]).find(c=>String(c.chatId)===String(a.chatId));
          let uid=conv?.otherUser?.id;
          if(!uid){ const j=await jsonGet('/chats/'+encodeURIComponent(a.chatId)); const c=j?.data?.chat||j?.data||{}; uid=c?.otherParticipant?.id; if(uid){ const u=c.otherParticipant; identityCache.set(String(a.chatId),{id:uid,userId:uid,name:u.displayName||[u.firstName,u.lastName].filter(Boolean).join(' ').trim()||u.username||'Conversation',avatar:u.avatar||null}); } }
          if(uid) a.receiverId=uid;
        }catch(_){ }
      }
      if(!a.chatId && !a.receiverId) return {success:false,error:'No 1:1 recipient was resolved. Please reopen the chat and try again.'};
      return originalSend.call(M,a);
    };
    M.__necpraHardeningV1=true;
    loadIdentityCache();
    setInterval(loadIdentityCache,12000);
    setInterval(patchConversationRows,1200);
    return true;
  }
  const waitM=setInterval(()=>{if(hardenMessageModule()) clearInterval(waitM);},250);
  setTimeout(()=>clearInterval(waitM),15000);

  /* ---------------- ACCOMMODATION LOCATION CATALOG ---------------- */
  const REGIONS={Nairobi:['Nairobi'],Coast:['Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita Taveta'],'Rift Valley':['Turkana','West Pokot','Samburu','Trans-Nzoia','Uasin Gishu','Elgeyo-Marakwet','Nandi','Baringo','Laikipia','Nakuru','Narok','Kajiado','Kericho','Bomet'],Eastern:['Marsabit','Isiolo','Meru','Tharaka-Nithi','Embu','Kitui','Machakos','Makueni'],'North Eastern':['Garissa','Wajir','Mandera'],Nyanza:['Siaya','Kisumu','Homa Bay','Migori','Kisii','Nyamira'],Western:['Kakamega','Vihiga','Bungoma','Busia'],Central:['Nyandarua','Nyeri','Kirinyaga','Muranga','Kiambu']};
  const SUB={
    Baringo:['Baringo central','Baringo north','Baringo south','Eldama ravine','Mogotio','Tiaty'],Bomet:['Bomet central','Bomet east','Chepalungu','Konoin','Sotik'],Bungoma:['Bumula','Kabuchai','Kanduyi','Kimilil','Mt Elgon','Sirisia','Tongaren','Webuye east','Webuye west'],Busia:['Budalangi','Butula','Funyula','Nambele','Teso North','Teso South'],'Elgeyo-Marakwet':['Keiyo north','Keiyo south','Marakwet east','Marakwet west'],Embu:['Manyatta','Mbeere north','Mbeere south','Runyenjes'],Garissa:['Daadab','Fafi','Garissa','Hulugho','Ijara','Lagdera balambala'],'Homa Bay':['Homabay town','Kabondo','Karachwonyo','Kasipul','Mbita','Ndhiwa','Rangwe','Suba'],Isiolo:['Central','Garba tula','Kina','Merit','Oldonyiro','Sericho'],Kajiado:['Isinya','Kajiado Central','Kajiado North','Loitokitok','Mashuuru'],Kakamega:['Butere','Kakamega central','Kakamega east','Kakamega north','Kakamega south','Khwisero','Lugari','Lukuyani','Lurambi','Matete','Mumias','Mutungu','Navakholo'],Kericho:['Ainamoi','Belgut','Bureti','Kipkelion east','Kipkelion west','Soin sigowet'],Kiambu:['Gatundu north','Gatundu south','Githunguri','Juja','Kabete','Kiambaa','Kiambu','Kikuyu','Limuru','Ruiru','Thika town','Lari'],Kilifi:['Ganze','Kaloleni','Kilifi north','Kilifi south','Magarini','Malindi','Rabai'],Kirinyaga:['Kirinyaga central','Kirinyaga east','Kirinyaga west','Mwea east','Mwea west'],Kisii:['Bobasi','Bomachoge Borabu','Bomachoge Chache','Bonchari','Kitutu Chache North','Kitutu Chache South','Nyaribari Chache','Nyaribari Masaba','South Mugirango'],Kisumu:['Kisumu central','Kisumu east','Kisumu west','Mohoroni','Nyakach','Nyando','Seme'],Kitui:['Ikutha','Katulani','Kisasi','Kitui central','Kitui west','Lower Yatta','Matiyani','Migwani','Mutitu','Mutomo','Muumonikyusu','Mwingi central','Mwingi east','Nzambani','Tseikuru'],Kwale:['Kinango','Lungalunga','Matuga','Msambweni'],Laikipia:['Laikipia central','Laikipia east','Laikipia north','Laikipia west','Nyahururu'],Lamu:['Lamu East','Lamu West'],Machakos:['Kathiani','Machakos town','Masinga','Matungulu','Mavoko','Mwala','Yatta'],Makueni:['Kaiti','Kibwezi west','Kibwezi east','Kilome','Makueni','Mbooni'],Mandera:['Banissa','Lafey','Mandera East','Mandera North','Mandera South','Mandera West'],Marsabit:['Laisamis','Moyale','North Horr','Saku'],Meru:['Buuri','Igembe central','Igembe north','Igembe south','Imenti central','Imenti north','Imenti south','Tigania east','Tigania west'],Migori:['Awendo','Kuria east','Kuria west','Mabera','Ntimaru','Rongo','Suna east','Suna west','Uriri'],Mombasa:['Changamwe','Jomvu','Kisauni','Likoni','Mvita','Nyali'],"Murang'a":['Gatanga','Kahuro','Kandara','Kangema','Kigumo','Kiharu','Mathioya','Murang’a south'],Nairobi:['Dagoretti North','Dagoretti South','Embakasi Central','Embakasi East','Embakasi North','Embakasi South','Embakasi West','Kamukunji','Kasarani','Kibra',"Lang'ata",'Makadara','Mathare','Roysambu','Ruaraka','Starehe','Westlands'],Nakuru:['Bahati','Gilgil','Kuresoi north','Kuresoi south','Molo','Naivasha','Nakuru town east','Nakuru town west','Njoro','Rongai','Subukia'],Nandi:['Aldai','Chesumei','Emgwen','Mosop','Nandi Hills','Tindiret'],Narok:['Narok east','Narok north','Narok south','Narok west','Transmara east','Transmara west'],Nyamira:['Borabu','Manga','Masaba north','Nyamira north','Nyamira south'],Nyandarua:['Kinangop','Kipipiri','Ndaragwa','Ol Kalou','Ol Joro Orok'],Nyeri:['Kieni east','Kieni west','Mathira east','Mathira west','Mukurwe-ini','Nyeri town','Othaya','Tetu'],Samburu:['Samburu east','Samburu north','Samburu west'],Siaya:['Alego Usonga','Bondo','Gem','Rarieda','Ugenya','Ugunja'],"Taita Taveta":['Mwatate','Taita','Taveta','Voi'],"Tana River":['Bura','Galole','Garsen'],"Tharaka-Nithi":['Chuka','Igambangobe','Maara','Muthambi','Tharaka north','Tharaka south'],"Trans-Nzoia":['Cherangany','Endebess','Kiminini','Kwanza','Saboti'],Turkana:['Loima','Turkana central','Turkana east','Turkana north','Turkana south'],'Uasin Gishu':['Ainabkoi','Kapseret','Kesses','Moiben','Soy','Turbo'],Vihiga:['Emuhaya','Hamisi','Luanda','Sabatia','Vihiga'],Wajir:['Eldas','Tarbaj','Wajir East','Wajir North','Wajir South','Wajir West'],'West Pokot':['Central Pokot','North Pokot','Pokot South','West Pokot']
  };
  function countyList(region){return (REGIONS[region]||[]).slice().sort();}
  function findSub(county){
    if(SUB[county]) return SUB[county];
    const k=Object.keys(SUB).find(x=>x.toLowerCase()===String(county||'').toLowerCase());
    return k?SUB[k]:[];
  }

  /* Keep the existing backend as source for location/village/estate values,
     but guarantee that Region -> County -> Sub-county is selectable even
     before the first listing exists in that area. */
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    try{
      const raw=typeof input==='string'?input:(input&&input.url)||'';
      const u=new URL(raw,location.origin);
      if(u.pathname.includes('/accommodation/drilldown')){
        const region=u.searchParams.get('region')||'';
        const county=u.searchParams.get('county')||'';
        const level=(u.searchParams.get('level')||'').toLowerCase();
        if(level==='location'||level==='village'||level==='estate') return nativeFetch(input,init);
        let data=[];
        if(!county) data=countyList(region);
        else if(level===''||level==='subcounty') data=findSub(county);
        if(data.length) return new Response(JSON.stringify({success:true,data:data,level:level||'county'}),{status:200,headers:{'Content-Type':'application/json'}});
      }
    }catch(_){ }
    return nativeFetch(input,init);
  };

  /* ---------------- PROFESSIONAL ACCOMMODATION FORM ---------------- */
  function enhanceAccommodationModal(){
    const modal=document.querySelector('.accom-modal');
    if(!modal||modal.dataset.necpraProV1) return;
    modal.dataset.necpraProV1='1';
    const form=modal.querySelector('.accom-form'); if(!form) return;
    const section=(title,sub)=>{const d=document.createElement('div');d.className='necpra-accom-section accom-full';d.innerHTML='<strong>'+title+'</strong><small>'+sub+'</small>';return d;};
    const title=form.querySelector('#acTitle')?.closest('label');
    if(title) title.insertAdjacentElement('beforebegin',section('Property basics','Give renters enough information to understand exactly what is being offered.'));
    const price=form.querySelector('#acPriceRoom')?.closest('label');
    if(price) price.insertAdjacentElement('beforebegin',section('Pricing & capacity','Set the normal room price, discount and how many guests/rooms are available.'));
    const desc=form.querySelector('#acDesc')?.closest('label');
    if(desc) desc.insertAdjacentElement('beforebegin',section('Property details','These details help renters compare listings quickly.'));
    const extra=document.createElement('div'); extra.className='accom-full necpra-accom-extra'; extra.innerHTML='<div class="necpra-extra-grid"><label>Property type<select id="acPropertyType"><option value="room">Private room</option><option value="hostel">Hostel</option><option value="bedsitter">Bedsitter</option><option value="studio">Studio</option><option value="apartment">Apartment</option><option value="house">House</option><option value="guesthouse">Guest house</option></select></label><label>Furnished<select id="acFurnished"><option value="no">Not furnished</option><option value="partly">Partly furnished</option><option value="yes">Fully furnished</option></select></label><label>Security deposit (KES)<input id="acDeposit" type="number" min="0" step="1" value="0"></label><label>Availability<select id="acAvailability"><option value="immediate">Available now</option><option value="soon">Available soon</option><option value="occupied">Currently occupied</option></select></label></div><label class="accom-full">Amenities <input id="acAmenities" placeholder="Wi-Fi, water, parking, security, kitchen, laundry..."></label><label class="accom-full">House rules <textarea id="acRules" rows="2" placeholder="e.g. No smoking, visitors before 9pm"></textarea></label><div class="necpra-location-help accom-full"><strong>Location not listed?</strong><span>Use the fields below to enter the exact location. It will become available for future listings.</span><div class="necpra-extra-grid"><label>Manual location<input id="acManualLocation" placeholder="Location / locality"></label><label>Manual village<input id="acManualVillage" placeholder="Village"></label><label>Manual estate<input id="acManualEstate" placeholder="Estate / neighbourhood"></label></div></div>';
    const contact=form.querySelector('#acContact')?.closest('label'); if(contact) form.insertBefore(extra,contact); else form.appendChild(extra);
    const style=document.createElement('style');style.textContent='.necpra-accom-section{margin:8px 0 0;padding:10px 0;border-bottom:1px solid var(--border-color,#e5e7eb);display:grid;gap:3px}.necpra-accom-section strong{font-size:14px}.necpra-accom-section small,.necpra-location-help span{opacity:.65;font-weight:400}.necpra-extra-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:8px 0}.necpra-extra-grid label{display:grid;gap:5px;font-size:13px;font-weight:650}.necpra-extra-grid input,.necpra-extra-grid select,.necpra-accom-extra textarea,.necpra-accom-extra input{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border-color,#ccc);border-radius:9px;background:var(--bg-color,#fff);color:inherit}.necpra-location-help{display:grid;gap:5px;padding:12px;border-radius:12px;background:var(--sidebar-bg,#f5f7fa);margin-top:4px}.necpra-location-help strong{font-size:13px}@media(max-width:700px){.necpra-extra-grid{grid-template-columns:1fr}}';document.head.appendChild(style);
  }
  const mo=new MutationObserver(()=>enhanceAccommodationModal()); if(document.body) mo.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click',function(e){
    const b=e.target.closest?.('#acPublish'); if(!b) return;
    const modal=b.closest('.accom-modal'); if(!modal) return;
    ['Location','Village','Estate'].forEach(k=>{
      const id=k==='Location'?'acLocation':k==='Village'?'acVillage':'acEstate';
      const manual=modal.querySelector('#acManual'+k)?.value.trim(); const sel=modal.querySelector('#'+id);
      if(manual&&sel&&!sel.value){ const o=document.createElement('option');o.value=manual;o.textContent=manual;sel.appendChild(o);sel.value=manual; }
    });
  },true);

  /* Add the new form fields to the existing marketplace POST without replacing
     the working publish pipeline. */
  const fetchBefore=window.fetch.bind(window);
  window.fetch=async function(input,init){
    try{
      const raw=typeof input==='string'?input:(input&&input.url)||''; const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
      if(method==='POST'&&/\/marketplace\/listings(?:\?|$)/.test(raw)&&init?.body){
        const body=JSON.parse(init.body); const m=document.querySelector('.accom-modal');
        if(m&&body?.metadata?.accommodation){
          const a=body.metadata.accommodation;
          const val=id=>m.querySelector(id)?.value?.trim()||'';
          a.propertyType=val('#acPropertyType')||'room'; a.furnished=val('#acFurnished')||'no'; a.deposit=Number(val('#acDeposit')||0); a.availability=val('#acAvailability')||'immediate'; a.amenities=val('#acAmenities'); a.houseRules=val('#acRules');
          body.metadata={...(body.metadata||{}),accommodation:a}; init=Object.assign({},init,{body:JSON.stringify(body)});
        }
      }
    }catch(_){ }
    return fetchBefore(input,init);
  };
})();