/* Mood Marketplace — single purchase authority adapter.
 * Prevents legacy/direct purchase handlers from creating a second checkout path.
 * It does not delete legacy code; it routes eligible purchase calls to the
 * commercial checkout API when that API is available.
 */
(function(){
'use strict';
if(window.__MOOD_MARKETPLACE_PURCHASE_GUARD__)return;window.__MOOD_MARKETPLACE_PURCHASE_GUARD__=true;
const KEY='mood.marketplace.purchase.guard.v1';
const locks=new Map();
function id(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)}
function lock(k){if(locks.has(k))return false;locks.set(k,Date.now());setTimeout(()=>locks.delete(k),30000);return true}
function emit(name,detail){try{window.dispatchEvent(new CustomEvent(name,{detail}))}catch(e){}}
function getCommercial(){return window.MoodMarketplaceCommercial||null}
function normalize(product,opts={}){
 const p=product?.product||product||{};
 return {items:[{product_id:String(p.id||p.product_id||opts.product_id),quantity:Math.max(1,Number(opts.quantity||1)),unit_price:Number(p.price||opts.price||0)}],shipping_address:opts.shipping_address||opts.address||null,payment_method:opts.payment_method||'mpesa',coupon_code:opts.coupon_code||null};
}
async function purchase(product,opts={}){
 const commercial=getCommercial();
 if(!commercial?.createOrder){emit('marketplace:purchase-fallback',{reason:'commercial-layer-unavailable'});return null}
 const data=normalize(product,opts);if(!data.items[0].product_id)throw new Error('Product id is required');
 if(!data.shipping_address)throw new Error('Delivery address is required before purchase');
 const key=opts.operation_id||`${data.items[0].product_id}:${data.items[0].quantity}:${data.payment_method}`;
 if(!lock(key))throw new Error('This purchase is already being processed');
 const operation_id=opts.operation_id||id();
 try{const order=await commercial.createOrder({...data,operation_id});emit('marketplace:purchase-authoritative',{order});return order}
 finally{setTimeout(()=>locks.delete(key),1000)}
}
window.MoodMarketplacePurchase={version:'1.0.0',purchase,normalize,isCommercialReady:()=>!!getCommercial()};
window.addEventListener('marketplace:commercial-ready',()=>emit('marketplace:purchase-guard-ready',{version:'1.0.0'}));
})();
