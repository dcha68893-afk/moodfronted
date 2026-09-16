/* Necpra Accommodation & Rentals surface — syntax-safe implementation. */
(function () {
  'use strict';
  if (window.__necpraAccommodationSurfaceLoadedV3) return;
  window.__necpraAccommodationSurfaceLoadedV3 = true;

  const api = () => window.__getApiBase ? window.__getApiBase() : '/api';
  const esc = v => String(v == null ? '' : v).replace(/[&<>\"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[m]));
  const uniq = values => Array.from(new Set((values || []).filter(Boolean).map(String))).sort((a,b) => a.localeCompare(b));
  const optionHtml = (values, placeholder) => '<option value="">' + esc(placeholder) + '</option>' + uniq(values).map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');

  async function drill(params) {
    try {
      const r = await fetch(api() + '/accommodation/drilldown?' + new URLSearchParams(params));
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j.data) ? uniq(j.data) : [];
    } catch (_) { return []; }
  }

  function css() {
    if (document.getElementById('necpraAccomSurfaceCssV3')) return;
    const s = document.createElement('style');
    s.id = 'necpraAccomSurfaceCssV3';
    s.textContent = '[data-necpra-accommodation-category]{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border-color,#ddd);border-radius:14px;background:var(--card-bg,#fff);cursor:pointer;min-height:70px;color:inherit;width:100%;text-align:left}.accom-surface{margin:12px;padding:16px;border:1px solid var(--border-color,#ddd);border-radius:16px;background:var(--card-bg,#fff);color:var(--text-primary,#111)}.accom-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}.accom-grid input,.accom-grid select{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border-color,#ccc);border-radius:10px;background:var(--bg-color,#fff);color:inherit}.accom-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:14px}.accom-card{border:1px solid var(--border-color,#ddd);border-radius:14px;overflow:hidden;background:var(--card-bg,#fff)}.accom-card img{width:100%;height:140px;object-fit:cover}.accom-body{padding:12px}.accom-btn{border:0;border-radius:10px;padding:10px 13px;font-weight:700;cursor:pointer;background:#2563eb;color:#fff}.accom-modal{position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}.accom-dialog{width:min(760px,100%);max-height:94vh;overflow:auto;padding:20px;border-radius:18px;background:var(--card-bg,#fff);color:var(--text-primary,#111)}.accom-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.accom-form label{display:grid;gap:5px;font-size:13px;font-weight:650}.accom-form input,.accom-form select,.accom-form textarea{padding:10px;border:1px solid var(--border-color,#ccc);border-radius:9px;background:var(--bg-color,#fff);color:inherit}.accom-full{grid-column:1/-1}.accom-path{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.accom-path span{padding:6px 9px;border-radius:999px;background:var(--sidebar-bg,#f3f4f6);font-size:12px}.accom-price{font-weight:800;margin:7px 0}.accom-discount{font-size:12px;margin-top:3px}@media(max-width:700px){.accom-grid,.accom-form{grid-template-columns:1fr}.accom-full{grid-column:auto}}';
    document.head.appendChild(s);
  }

  function addCategoryCard() {
    const host = document.getElementById('jmCatContent');
    if (!host || host.querySelector('[data-necpra-accommodation-category]')) return;
    const card = document.createElement('button');
    card.type = 'button';
    card.setAttribute('data-necpra-accommodation-category', '1');
    card.innerHTML = '<span style="font-size:30px">🏠</span><span><strong>Accommodation & Rentals</strong><small style="display:block;opacity:.7;margin-top:3px">Rooms · hostels · apartments · rentals</small></span>';
    host.appendChild(card);
  }

  function ensureCategoryVisibility() {
    const bar = document.getElementById('jmCatTypeBar');
    if (bar) bar.querySelectorAll('[data-cattype="physical"],[data-cattype="service"]').forEach(btn => {
      if (btn.dataset.necpraBoundV3) return;
      btn.dataset.necpraBoundV3 = '1';
      btn.addEventListener('click', () => setTimeout(addCategoryCard, 50));
    });
    addCategoryCard();
  }

  function setOptions(sel, values, placeholder, disabled) {
    if (!sel) return;
    sel.innerHTML = optionHtml(values, placeholder);
    sel.disabled = !!disabled;
  }

  function state(p) {
    return {
      region: p.querySelector('#nasR').value,
      county: p.querySelector('#nasC').value,
      subCounty: p.querySelector('#nasSC').value,
      location: p.querySelector('#nasL').value,
      village: p.querySelector('#nasV').value,
      estate: p.querySelector('#nasE').value,
      q: p.querySelector('#nasQ').value
    };
  }

  async function renderResults(p) {
    const a = state(p), out = p.querySelector('#nasResults');
    out.innerHTML = '<div style="padding:15px;opacity:.7">Loading accommodation...</div>';
    try {
      const r = await fetch(api() + '/accommodation/listings?' + new URLSearchParams(a));
      const j = await r.json();
      const data = Array.isArray(j.data) ? j.data : [];
      out.innerHTML = data.map(x => {
        const m = x.accommodation || (x.metadata && x.metadata.accommodation) || {};
        const base = Number(m.pricePerRoom != null ? m.pricePerRoom : (x.price || 0));
        const disc = Number(m.discountValue || 0);
        const dtype = m.discountType || 'percent';
        const effective = dtype === 'percent' ? Math.max(0, base - base * disc / 100) : Math.max(0, base - disc);
        const discount = disc > 0 ? '<div class="accom-discount">Discount: ' + esc(dtype === 'percent' ? disc + '%' : 'KES ' + disc.toLocaleString()) + ' · Now KES ' + effective.toLocaleString() + ' / room</div>' : '';
        const image = esc((x.images && x.images[0]) || '/icons/necpa-192.png');
        const location = esc([m.region,m.county,m.subCounty,m.location,m.village,m.estate].filter(Boolean).join(' · '));
        return '<article class="accom-card"><img src="' + image + '" alt="' + esc(x.title) + '"><div class="accom-body"><strong>' + esc(x.title) + '</strong><div style="font-size:12px;opacity:.7;margin-top:4px">📍 ' + location + '</div><div class="accom-price">KES ' + base.toLocaleString() + ' / room</div>' + discount + '<small>' + Number(m.rooms || 1) + ' room(s) · ' + Number(m.guests || 1) + ' guest(s)/room</small><button class="accom-btn" data-book-accom="' + esc(x.id) + '" style="width:100%;margin-top:9px">Check availability & book</button></div></article>';
      }).join('') || '<div style="padding:15px;opacity:.7">No accommodation listings match this area yet.</div>';
    } catch (_) {
      out.innerHTML = '<div style="padding:15px">Accommodation service unavailable.</div>';
    }
  }

  async function refreshCascade(p, level) {
    const a = state(p), c = p.querySelector('#nasC'), sc = p.querySelector('#nasSC'), l = p.querySelector('#nasL'), v = p.querySelector('#nasV'), e = p.querySelector('#nasE');
    if (level === 'region') {
      setOptions(c, await drill({ region:a.region }), 'All counties', !a.region);
      setOptions(sc, [], 'All sub counties', true); setOptions(l, [], 'All locations', true); setOptions(v, [], 'All villages', true); setOptions(e, [], 'All estates', true);
    }
    if (level === 'county') {
      setOptions(sc, await drill({ region:a.region, county:a.county }), 'All sub counties', !a.county);
      setOptions(l, [], 'All locations', true); setOptions(v, [], 'All villages', true); setOptions(e, [], 'All estates', true);
    }
    if (level === 'subCounty') {
      setOptions(l, await drill({ region:a.region, county:a.county, subCounty:a.subCounty, level:'location' }), 'All locations', !a.subCounty);
      setOptions(v, [], 'All villages', true); setOptions(e, [], 'All estates', true);
    }
    if (level === 'location') {
      setOptions(v, await drill({ region:a.region, county:a.county, subCounty:a.subCounty, location:a.location, level:'village' }), 'All villages', !a.location);
      setOptions(e, [], 'All estates', true);
    }
    if (level === 'village') {
      setOptions(e, await drill({ region:a.region, county:a.county, subCounty:a.subCounty, location:a.location, village:a.village, level:'estate' }), 'All estates', !a.village);
    }
    await renderResults(p);
  }

  function openBuyerScreen() {
    const old = document.getElementById('necpraAccommodationSurface');
    if (old) { old.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    css();
    const host = document.getElementById('jmPageCategories') || document.querySelector('.jm-page.active') || document.body;
    const p = document.createElement('section');
    p.id = 'necpraAccommodationSurface';
    p.className = 'accom-surface';
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="margin:0 0 4px">Accommodation & Rentals</h2><p style="margin:0;opacity:.7;font-size:13px">Choose your area step-by-step. Results update after every selection.</p></div><button class="accom-btn" id="acListBtn">List accommodation / rental</button></div><div class="accom-path"><span>Region</span><span>County</span><span>Sub county</span><span>Location</span><span>Village</span><span>Estate</span></div><div class="accom-grid"><select id="nasR"></select><select id="nasC" disabled></select><select id="nasSC" disabled></select><select id="nasL" disabled></select><select id="nasV" disabled></select><select id="nasE" disabled></select><input id="nasQ" placeholder="Search room, hostel, apartment or rental..."></div><div id="nasResults" class="accom-results"></div>';
    host.prepend(p);
    const r=p.querySelector('#nasR'), c=p.querySelector('#nasC'), sc=p.querySelector('#nasSC'), l=p.querySelector('#nasL'), v=p.querySelector('#nasV'), e=p.querySelector('#nasE'), q=p.querySelector('#nasQ');
    setOptions(r, ['Nairobi','Coast','Rift Valley','Eastern','North Eastern','Nyanza','Western','Central'], 'Choose region', false);
    r.onchange=()=>{c.value='';sc.value='';l.value='';v.value='';e.value='';refreshCascade(p,'region')};
    c.onchange=()=>{sc.value='';l.value='';v.value='';e.value='';refreshCascade(p,'county')};
    sc.onchange=()=>{l.value='';v.value='';e.value='';refreshCascade(p,'subCounty')};
    l.onchange=()=>{v.value='';e.value='';refreshCascade(p,'location')};
    v.onchange=()=>{e.value='';refreshCascade(p,'village')};
    e.onchange=()=>renderResults(p);
    q.oninput=()=>{clearTimeout(q._t);q._t=setTimeout(()=>renderResults(p),250)};
    p.querySelector('#acListBtn').onclick=openLandlordModal;
    renderResults(p);
    p.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function openLandlordModal() {
    css();
    const o=document.createElement('div'); o.className='accom-modal';
    o.innerHTML='<div class="accom-dialog"><h2 style="margin:0 0 5px">List Accommodation & Rental</h2><p style="opacity:.7;margin:0 0 15px">Select the complete location and set the room price and optional discount before publishing.</p><div class="accom-form"><label>Title<input id="acTitle" placeholder="e.g. Furnished student room"></label><label>Region<select id="acRegion"></select></label><label>County<select id="acCounty" disabled></select></label><label>Sub county<select id="acSubCounty" disabled></select></label><label>Location<select id="acLocation" disabled></select></label><label>Village<select id="acVillage" disabled></select></label><label>Estate name<select id="acEstate" disabled></select></label><label>Price per room (KES)<input id="acPriceRoom" type="number" min="0" step="0.01" value="0"></label><label>Discount type<select id="acDiscountType"><option value="none">No discount</option><option value="percent">Percentage (%)</option><option value="amount">Fixed amount (KES)</option></select></label><label>Discount value<input id="acDiscountValue" type="number" min="0" step="0.01" value="0"></label><label>Available rooms<input id="acRooms" type="number" min="1" value="1"></label><label>Guests per room<input id="acGuests" type="number" min="1" value="2"></label><label class="accom-full">Description<textarea id="acDesc" rows="3" placeholder="Describe the room, apartment, hostel or rental"></textarea></label><label class="accom-full">Contact (admin-only)<input id="acContact" placeholder="Phone or email buyers cannot see"></label></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:15px"><button class="accom-btn" id="acCancel" style="background:transparent;color:inherit;border:1px solid var(--border-color,#ccc)">Cancel</button><button class="accom-btn" id="acPublish">Publish accommodation</button></div></div>';
    document.body.appendChild(o);
    const r=o.querySelector('#acRegion'),c=o.querySelector('#acCounty'),sc=o.querySelector('#acSubCounty'),l=o.querySelector('#acLocation'),v=o.querySelector('#acVillage'),e=o.querySelector('#acEstate');
    setOptions(r,['Nairobi','Coast','Rift Valley','Eastern','North Eastern','Nyanza','Western','Central'],'Choose region',false);
    const sync=async level=>{const a={region:r.value,county:c.value,subCounty:sc.value,location:l.value,village:v.value};if(level==='region'){setOptions(c,await drill({region:a.region}),'Choose county',!a.region);setOptions(sc,[],'Choose sub county',true);setOptions(l,[],'Choose location',true);setOptions(v,[],'Choose village',true);setOptions(e,[],'Choose estate',true)}if(level==='county'){setOptions(sc,await drill({region:a.region,county:a.county}),'Choose sub county',!a.county);setOptions(l,[],'Choose location',true);setOptions(v,[],'Choose village',true);setOptions(e,[],'Choose estate',true)}if(level==='subCounty'){setOptions(l,await drill({...a,level:'location'}),'Choose location',!a.subCounty);setOptions(v,[],'Choose village',true);setOptions(e,[],'Choose estate',true)}if(level==='location'){setOptions(v,await drill({...a,level:'village'}),'Choose village',!a.location);setOptions(e,[],'Choose estate',true)}if(level==='village')setOptions(e,await drill({...a,level:'estate'}),'Choose estate',!a.village)};
    r.onchange=()=>sync('region'); c.onchange=()=>sync('county'); sc.onchange=()=>sync('subCounty'); l.onchange=()=>sync('location'); v.onchange=()=>sync('village');
    o.querySelector('#acCancel').onclick=()=>o.remove();
    o.querySelector('#acPublish').onclick=async()=>{const title=o.querySelector('#acTitle').value.trim(),price=Number(o.querySelector('#acPriceRoom').value||0),dtype=o.querySelector('#acDiscountType').value,dval=Number(o.querySelector('#acDiscountValue').value||0);if(!title||!r.value||!c.value||!sc.value||!l.value||!v.value||!e.value||price<=0)return alert('Title, complete location and price per room are required.');if(dval<0||(dtype==='percent'&&dval>100)||(dtype==='amount'&&dval>=price))return alert('Enter a valid discount.');const tok=localStorage.getItem('accessToken')||localStorage.getItem('authToken')||localStorage.getItem('token')||'';const body={title,description:o.querySelector('#acDesc').value.trim()||'Accommodation rental',price,category:'accommodation',type:'service',condition:'new',seller_contact:o.querySelector('#acContact').value.trim(),metadata:{accommodation:{region:r.value,county:c.value,subCounty:sc.value,location:l.value,village:v.value,estate:e.value,rooms:Number(o.querySelector('#acRooms').value||1),guests:Number(o.querySelector('#acGuests').value||1),pricePerRoom:price,discountType:dtype,discountValue:dtype==='none'?0:dval}},available:true,images:[]};try{const res=await fetch(api()+'/marketplace/listings',{method:'POST',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:JSON.stringify(body)});const j=await res.json();if(!res.ok)throw new Error(j.message||'Could not publish accommodation');alert('Accommodation listing published successfully.');o.remove();window.dispatchEvent(new CustomEvent('marketplace:data-updated'));document.getElementById('necpraAccommodationSurface')?.scrollIntoView({behavior:'smooth',block:'start'})}catch(err){alert(err.message)}};
  }

  function enhanceExistingServiceForm(){const f=document.getElementById('necpraAccommodationFields');if(!f||f.dataset.necpraEnhancedV3)return;f.dataset.necpraEnhancedV3='1';const grid=f.querySelector('.necpra-accom-grid');if(!grid)return;const wrap=document.createElement('div');wrap.className='necpra-accom-full';wrap.innerHTML='<label style="display:grid;gap:5px;font-size:13px;font-weight:600">Price per room (KES)<input id="accommodationPricePerRoom" type="number" min="0" step="0.01" value="0"></label><div style="height:8px"></div><label style="display:grid;gap:5px;font-size:13px;font-weight:600">Discount type<select id="accommodationDiscountType"><option value="none">No discount</option><option value="percent">Percentage (%)</option><option value="amount">Fixed amount (KES)</option></select></label><div style="height:8px"></div><label style="display:grid;gap:5px;font-size:13px;font-weight:600">Discount value<input id="accommodationDiscountValue" type="number" min="0" step="0.01" value="0"></label>';grid.appendChild(wrap)}

  function patchListingPayload(){if(window.__necpraAccommodationPayloadPatchedV3)return;window.__necpraAccommodationPayloadPatchedV3=true;const original=window.fetch;window.fetch=async function(input,init){try{const url=typeof input==='string'?input:(input&&input.url)||'',method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();const f=document.getElementById('necpraAccommodationFields');if(method==='POST'&&/\/marketplace\/listings(?:\?|$)/.test(url)&&init&&init.body&&f&&!f.hidden){const body=JSON.parse(init.body),a=body.metadata&&body.metadata.accommodation;if(a){const pr=Number(document.getElementById('accommodationPricePerRoom')?.value||body.price||0),dt=document.getElementById('accommodationDiscountType')?.value||a.discountType||'none',dv=Number(document.getElementById('accommodationDiscountValue')?.value||0);a.pricePerRoom=pr;a.discountType=dt;a.discountValue=dt==='none'?0:dv;body.price=pr;body.metadata={...(body.metadata||{}),accommodation:a};init={...init,body:JSON.stringify(body)}}}}catch(_){}return original.apply(this,arguments)}}

  function book(id){const o=document.createElement('div');o.className='accom-modal';o.innerHTML='<div class="accom-dialog"><h2>Book accommodation</h2><div class="accom-form"><label>Check-in<input id="bkIn" type="date"></label><label>Check-out<input id="bkOut" type="date"></label><label>Rooms<input id="bkRooms" type="number" min="1" value="1"></label><label>Guests<input id="bkGuests" type="number" min="1" value="1"></label></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:15px"><button class="accom-btn" id="bkCancel">Cancel</button><button class="accom-btn" id="bkGo">Book room</button></div></div>';document.body.appendChild(o);o.querySelector('#bkCancel').onclick=()=>o.remove();o.querySelector('#bkGo').onclick=async()=>{const tok=localStorage.getItem('accessToken')||localStorage.getItem('authToken')||localStorage.getItem('token')||'',body={checkIn:o.querySelector('#bkIn').value,checkOut:o.querySelector('#bkOut').value,rooms:+o.querySelector('#bkRooms').value||1,guests:+o.querySelector('#bkGuests').value||1};try{const res=await fetch(api()+'/accommodation/listings/'+encodeURIComponent(id)+'/book',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(body)});const j=await res.json();if(!res.ok)throw new Error(j.message||'Booking failed');alert('Accommodation booked successfully.');o.remove()}catch(err){alert(err.message)}}}

  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-book-accom]');if(b)book(b.dataset.bookAccom);const cat=e.target.closest?.('[data-necpra-accommodation-category]');if(cat){e.preventDefault();openBuyerScreen()}});
  function init(){css();patchListingPayload();ensureCategoryVisibility();enhanceExistingServiceForm();const mo=new MutationObserver(()=>{ensureCategoryVisibility();enhanceExistingServiceForm()});mo.observe(document.documentElement,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
