/*! NECPRA Voice Sales (DUKA SMART). Spoken sale -> parsed against the trader's own catalogue -> clarifications -> review card ->
 *  the SAME cart + checkout as camera / barcode / manual entry. Voice never saves a sale: stock rules, idempotent sale id, offline
 *  rules, credit-customer rules and M-PESA verification all stay in DUKA's checkout, where the trader taps Confirm sale. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, I = root.NecpraVoiceIntents, N = root.NecpraVoiceSalesNLU; if (!V || !UI || !N) return;
  var T = UI.T, busy = false;
  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function ksh(c) { var v = c / 100; return 'KSh ' + (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v).toLocaleString('en-KE') : v.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
  function q3(n) { return String(Math.round(n * 1000) / 1000); }
  function uid() { try { return root.crypto.randomUUID(); } catch (_) { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } }
  function ask(prompt) { return R ? R.capture({ mode: 'command', prompt: prompt, spokenPrompt: prompt }).then(function (r) { return r && r.ok ? r.transcript : ''; }) : Promise.resolve(''); }
  function answerFn(prompt) { return function () { return ask(prompt); }; }

  /* ───── pure helpers (unit-tested) ───── */
  function discountCents(sub, d) { if (!d || !(d.value > 0)) return 0; return d.type === 'percent' ? Math.round(sub * Math.round(d.value * 100) / 10000) : Math.round(d.value * 100); }
  function totals(lines, discount) {
    var sub = 0; lines.forEach(function (l) { if (!l.removed && l.qty > 0) sub += l.lineCents; });
    var disc = Math.min(sub, discountCents(sub, discount)); return { sub: sub, disc: disc, total: sub - disc };
  }
  function blockers(lines, discount) {
    var out = [], live = lines.filter(function (l) { return !l.removed; }); if (!live.length) out.push(T('There are no items.', 'Hakuna bidhaa.'));
    live.forEach(function (l) {
      if (l.status === 'no_price') out.push(l.name + ': ' + T('has no selling price', 'haina bei ya kuuza')); else if (!(l.qty > 0)) out.push((l.name || l.heard) + ': ' + T('enter the quantity', 'weka idadi'));
      else if (l.qty > l.stock) out.push(l.name + ': ' + T('only ' + q3(l.stock) + ' in stock', 'zipo ' + q3(l.stock) + ' tu stoku'));
    });
    var t = totals(lines, discount); if (live.length && t.total <= 0 && !out.length) out.push(T('The total must be more than zero.', 'Jumla lazima iwe zaidi ya sifuri.'));
    if (discount && discount.type === 'percent' && discount.value > 100) out.push(T('Discount is over 100%.', 'Punguzo ni zaidi ya 100%.'));
    return out;
  }
  function paymentText(p, cust) {
    if (p.conflict) return T('More than one method mentioned: you choose at checkout', 'Njia zaidi ya moja zimetajwa: utachagua kwenye malipo');
    if (p.method === 'cash') return T('Cash', 'Taslimu');
    if (p.method === 'mpesa') return T('M-PESA (you enter the receipt code at checkout; it is only counted as paid once NECPRA verifies it)', 'M-PESA (utaweka msimbo wa risiti kwenye malipo; huhesabiwa tu baada ya NECPRA kuthibitisha)');
    if (p.method === 'credit') return T('On credit', 'Deni') + (cust && cust.name ? ' — ' + cust.name : ' — ' + T('choose the customer at checkout', 'chagua mteja kwenye malipo'));
    return T('Not said: you choose at checkout', 'Haijatajwa: utachagua kwenye malipo');
  }
  function summary(lines, discount, payment, cust) {
    var t = totals(lines, discount), live = lines.filter(function (l) { return !l.removed && l.qty > 0; });
    return T('Sale: ', 'Mauzo: ') + live.map(function (l) { return q3(l.qty) + ' ' + l.unit + ' ' + T('of', 'ya') + ' ' + l.name + ', ' + ksh(l.lineCents); }).join('; ') + '. ' + (t.disc ? T('Discount ', 'Punguzo ') + ksh(t.disc) + '. ' : '') + T('Total ', 'Jumla ') + ksh(t.total) + '. ' + T('Payment: ', 'Malipo: ') + paymentText(payment, cust).split(' (')[0] + '.';
  }

  /* ───── clarifications: only the unclear part is asked, by voice or by tap ───── */
  async function clarify(line, productsById) {
    var p, guard = 0;
    while (guard++ < 4 && !line.removed) {
      var st = line.status, idx;
      if (st === 'choose_product') {
        idx = await UI.choose({ title: T('Which “' + line.heard + '” did you sell?', 'Ni “' + line.heard + '” gani uliuza?'), options: line.candidates.map(function (id) { var c = productsById[id]; return { label: c.name, sub: 'KSh ' + c.sellingPrice + '/' + c.unit }; }), voiceAnswer: answerFn(T('Say the number or the full name.', 'Sema namba au jina kamili.')) });
        if (idx < 0) { line.removed = true; break; } N.resolveLine(line, productsById[line.candidates[idx]]);
      } else if (st === 'need_qty') {
        p = productsById[line.productId];
        var a = N.parseQuantityAnswer(await ask(T('How many ' + p.unit + ' of ' + p.name + '? You can also say an amount in shillings.', 'Ni ' + p.unit + ' ngapi za ' + p.name + '? Unaweza pia kusema kiasi cha shilingi.')));
        if (!a) break; line.spoken.qty = a.qty != null ? a.qty : null; line.spoken.unit = a.unit || null; line.spoken.amount = a.amount != null ? a.amount : null; N.recompute(line, p);
      } else if (st === 'qty_or_amount') {
        p = productsById[line.productId]; var n = line.spoken.qty;
        idx = await UI.choose({ title: T('You said ' + n + ' for ' + p.name + '. Which do you mean?', 'Ulisema ' + n + ' kwa ' + p.name + '. Unamaanisha nini?'), options: [{ label: n + ' ' + p.unit }, { label: 'KSh ' + n + ' ' + T('worth', 'thamani') }], voiceAnswer: answerFn(T('Say first or second.', 'Sema ya kwanza au ya pili.')) });
        if (idx < 0) break; if (idx === 0) line.spoken.unit = p.unit; else { line.spoken.amount = n; line.spoken.qty = null; line.spoken.unit = null; } N.recompute(line, p);
      } else if (st === 'fractional') {
        p = productsById[line.productId];
        idx = await UI.choose({ title: T('KSh ' + line.worth + ' is not a whole number of ' + p.unit + '. Choose:', 'KSh ' + line.worth + ' si idadi kamili ya ' + p.unit + '. Chagua:'), options: line.options.map(function (o) { return { label: o + ' ' + p.unit, sub: ksh(N.lineTotalCents(o, p.sellingPrice)) }; }), voiceAnswer: answerFn(T('Say first or second.', 'Sema ya kwanza au ya pili.')) });
        if (idx < 0) break; line.spoken.amount = null; line.spoken.qty = line.options[idx]; line.spoken.unit = p.unit; N.recompute(line, p);
      } else if (st === 'unit_mismatch') {
        p = productsById[line.productId]; var sq = line.spoken.qty;
        idx = await UI.choose({ title: T(p.name + ' is sold per ' + p.unit + '. Use ' + sq + ' ' + p.unit + '?', p.name + ' huuzwa kwa ' + p.unit + '. Tumia ' + sq + ' ' + p.unit + '?'), options: [{ label: T('Yes, ' + sq + ' ' + p.unit, 'Ndiyo, ' + sq + ' ' + p.unit) }, { label: T('Skip this item', 'Ruka bidhaa hii') }], voiceAnswer: answerFn(T('Say first or second.', 'Sema ya kwanza au ya pili.')) });
        if (idx !== 0) { if (idx === 1) line.removed = true; break; } line.spoken.unit = p.unit; N.recompute(line, p);
      } else if (st === 'amount_conflict') {
        p = productsById[line.productId]; var qn = line.spoken.qty, am = line.spoken.amount;
        idx = await UI.choose({ title: T('The quantity and the money do not match for ' + p.name + '.', 'Idadi na pesa hazilingani kwa ' + p.name + '.'), options: [{ label: q3(qn) + ' ' + p.unit, sub: ksh(N.lineTotalCents(qn, p.sellingPrice)) }, { label: 'KSh ' + am + ' ' + T('worth', 'thamani'), sub: q3(am / p.sellingPrice) + ' ' + p.unit }], voiceAnswer: answerFn(T('Say first or second.', 'Sema ya kwanza au ya pili.')) });
        if (idx < 0) break; if (idx === 0) line.spoken.amount = null; else line.spoken.qty = null; N.recompute(line, p);
      } else break;
    }
    return line;
  }

  /* ───── review card ───── */
  function reviewCard(st) {
    return new Promise(function (resolve) {
      var doc = root.document, prev = doc.activeElement, el = UI.el, ov = el('div', { class: 'nv-ov', role: 'presentation' }), sh = el('div', { class: 'nv-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'vs-t' });
      sh.appendChild(el('h2', { class: 'nv-title', id: 'vs-t' }, T('Check this sale', 'Hakiki mauzo haya'))); sh.appendChild(el('p', { class: 'nv-prompt' }, T('Nothing is saved yet. This adds the items to your cart, then you check payment and tap Confirm sale.', 'Hakuna kilichohifadhiwa bado. Hii huweka bidhaa kwenye kikapu, kisha unahakiki malipo na kubonyeza Thibitisha.')));
      var box = el('div'); sh.appendChild(box); var foot = el('div'), warn = el('div', { class: 'nv-msg', role: 'alert' }); sh.appendChild(foot); sh.appendChild(warn);
      var row = el('div', { class: 'nv-row' }); function B(t, c, f) { var b = el('button', { class: 'nv-btn' + (c ? ' ' + c : ''), type: 'button' }, t); b.onclick = f; row.appendChild(b); return b; }
      var bGo = B(T('Add to cart & checkout', 'Weka kikapuni na ulipe'), 'pri', function () { go(); }), bNo = B(T('Cancel', 'Ghairi'), '', function () { end({ action: 'cancel' }); });
      B('🔊 ' + T('Read aloud', 'Soma kwa sauti'), '', function () { V.speak(summary(st.lines, st.discount, st.payment, st.customer), { force: true }); }); var bVoice = B('🎤 ' + T('Answer by voice', 'Jibu kwa sauti'), '', function () { listen(); });
      sh.appendChild(row); ov.appendChild(sh); doc.body.appendChild(ov);
      function end(v) { doc.removeEventListener('keydown', key, true); V.cancelSpeech(); ov.remove(); if (prev && prev.focus) try { prev.focus(); } catch (_) {} resolve(v); }
      function go() { var bl = blockers(st.lines, st.discount); if (bl.length) { warn.textContent = T('Fix first: ', 'Rekebisha kwanza: ') + bl.join('; '); V.speak(warn.textContent); return; } end({ action: 'apply' }); }
      var asking = false;
      function listen() { if (asking) return; asking = true; V.cancelSpeech(); ask(T('Say confirm to add to cart, or cancel.', 'Sema thibitisha kuweka kikapuni, au ghairi.')).then(function (t) { asking = false; if (!t) return; var a = I ? I.parseConfirmAnswer(t) : { action: 'unknown' }; if (a.action === 'send') go(); else if (a.action === 'cancel') end({ action: 'cancel' }); else { warn.textContent = T('Say confirm or cancel.', 'Sema thibitisha au ghairi.'); V.speak(warn.textContent); } }); }
      function paint() {
        box.textContent = ''; var t = totals(st.lines, st.discount);
        st.lines.forEach(function (l, i) {
          if (l.removed) return; var c = el('div', { style: 'border:2px solid #111;border-radius:12px;padding:10px;margin-top:10px' });
          c.appendChild(el('div', { style: 'display:flex;justify-content:space-between;gap:8px;font-weight:700;font-size:1.1rem' }, (l.name || l.heard) + (l.unit ? ' (' + l.unit + ')' : '')));
          var r2 = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap' });
          var inp = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': T('Quantity of ', 'Idadi ya ') + (l.name || l.heard), value: l.qty > 0 ? q3(l.qty) : '', style: 'width:90px;min-height:44px;font-size:1.1rem;border:2px solid #111;border-radius:8px;padding:0 8px' });
          inp.onchange = function () { var v = parseFloat(String(inp.value).replace(',', '.')); if (v > 0 && isFinite(v) && l.price > 0) { l.qty = Math.round(v * 1000) / 1000; l.lineCents = N.lineTotalCents(l.qty, l.price); if (l.status !== 'no_price') l.status = 'ok'; } else { l.qty = null; l.lineCents = 0; } paint(); };
          r2.appendChild(inp); r2.appendChild(el('span', {}, '× ' + (l.price > 0 ? 'KSh ' + l.price : '—') + ' = ')); r2.appendChild(el('b', {}, l.qty > 0 ? ksh(l.lineCents) : '—'));
          var rm = el('button', { class: 'nv-x', type: 'button', 'aria-label': T('Remove ', 'Ondoa ') + (l.name || l.heard) }, '🗑'); rm.onclick = function () { l.removed = true; paint(); }; r2.appendChild(rm); c.appendChild(r2);
          (l.notes || []).forEach(function (n) { c.appendChild(el('div', { class: 'nv-msg' }, n)); }); if (l.priceConflict != null) { var use = el('button', { class: 'nv-btn', type: 'button', style: 'min-height:44px;margin-top:6px' }, T('Use KSh ' + l.priceConflict + ' instead', 'Tumia KSh ' + l.priceConflict + ' badala yake')); use.onclick = function () { l.price = l.priceConflict; l.priceConflict = null; l.lineCents = l.qty > 0 ? N.lineTotalCents(l.qty, l.price) : 0; l.notes = (l.notes || []).concat(T('Price changed to what you said.', 'Bei imebadilishwa kuwa uliyosema.')); paint(); }; c.appendChild(use); }
          box.appendChild(c);
        });
        foot.textContent = ''; if (t.disc) foot.appendChild(el('div', {}, T('Discount: ', 'Punguzo: ') + '− ' + ksh(t.disc))); foot.appendChild(el('div', { style: 'font-size:1.4rem;font-weight:800;margin-top:10px' }, T('Total: ', 'Jumla: ') + ksh(t.total)));
        foot.appendChild(el('div', { style: 'margin-top:6px' }, T('Payment: ', 'Malipo: ') + paymentText(st.payment, st.customer))); if (st.customer && st.customer.note) foot.appendChild(el('div', { class: 'nv-msg' }, st.customer.note)); if (st.notice) foot.appendChild(el('div', { class: 'nv-msg' }, st.notice));
        warn.textContent = '';
      }
      function key(e) { if (e.key === 'Escape') { e.preventDefault(); end({ action: 'cancel' }); } }
      doc.addEventListener('keydown', key, true); paint(); bGo.focus();
      V.speak(summary(st.lines, st.discount, st.payment, st.customer) + ' ' + T('Say confirm to add it to your cart, or cancel.', 'Sema thibitisha kuiweka kikapuni, au ghairi.')).then(function () { if (V.getSettings().handsFree && ov.isConnected) listen(); });
    });
  }

  /* ───── main entry ───── */
  async function start(text, A, opts) {
    opts = opts || {};
    if (busy) return true; busy = true;
    try {
      var products = await A.getProducts(); if (!products || !products.length) return false;
      var r = N.parseSale(text, products); if (!r.lines.length || (!r.isSale && !opts.force)) return false;
      var byId = {}; products.forEach(function (p) { byId[p.id] = p; });
      for (var i = 0; i < r.lines.length; i++) await clarify(r.lines[i], byId);
      var lines = r.lines.filter(function (l) { return !l.removed; });
      if (!lines.length) { await say('Nothing to sell. Nothing was changed.', 'Hakuna cha kuuza. Hakuna kilichobadilishwa.'); return true; }
      var cust = null;
      if (r.customerName || r.payment.method === 'credit') {
        var cs = A.getCustomers ? await A.getCustomers() : [];
        if (r.customerName) {
          var m = I ? I.matchContacts(r.customerName, cs.map(function (c) { return { id: c.id, name: c.name }; })) : { matches: [] };
          if (m.matches.length === 1) cust = { id: m.matches[0].id, name: m.matches[0].name };
          else if (m.matches.length > 1) { var ix = await UI.choose({ title: T('Which customer is “' + r.customerName + '”?', 'Mteja “' + r.customerName + '” ni yupi?'), options: m.matches.map(function (c) { return { label: c.name }; }), voiceAnswer: answerFn(T('Say the number or full name.', 'Sema namba au jina kamili.')) }); if (ix >= 0) cust = { id: m.matches[ix].id, name: m.matches[ix].name }; }
          if (!cust) cust = { name: r.customerName, note: T('I could not match “' + r.customerName + '” to one of your customers. Choose or add the customer at checkout.', 'Sikumpata “' + r.customerName + '” kati ya wateja wako. Chagua au ongeza mteja kwenye malipo.') };
        }
      }
      var st = { lines: lines, discount: r.discount, payment: r.payment, customer: cust, id: uid(), notice: r.orphanNumbers.length ? T('I heard a number I could not connect to any of your products (' + r.orphanNumbers.join(', ') + '). It was not added.', 'Nimesikia namba ambayo sikuweza kuiunganisha na bidhaa zako (' + r.orphanNumbers.join(', ') + '). Haikuongezwa.') : '' };
      var res = await (opts.review || reviewCard)(st);
      if (!res || res.action !== 'apply') { V.audit('duka.voice.sale', { module: 'duka', outcome: 'cancelled' }); await say('Cancelled. Nothing was changed.', 'Imeghairiwa. Hakuna kilichobadilishwa.'); return true; }
      if (A.wasApplied && A.wasApplied(st.id)) { await say('That sale was already added to your cart.', 'Mauzo hayo tayari yamewekwa kikapuni.'); return true; }
      var live = st.lines.filter(function (l) { return !l.removed && l.qty > 0; });
      var out = A.applyLines(live.map(function (l) { return { productId: l.productId, name: l.name, unit: l.unit, price: l.price, qty: l.qty, stock: l.stock }; }), st.discount, st.id);
      V.audit('duka.voice.sale', { module: 'duka', outcome: 'confirmed', chars: live.length });
      if (A.closeAssistant) A.closeAssistant();
      await A.checkout({ method: st.payment.method, customerId: cust && cust.id || null });
      V.speak(T('Added to your cart. Total ' + ksh(totals(st.lines, st.discount).total) + '. Check the payment and tap Confirm sale to record it.', 'Imewekwa kikapuni. Jumla ' + ksh(totals(st.lines, st.discount).total) + '. Hakiki malipo kisha bonyeza Thibitisha kuhifadhi.'));
      return true;
    } finally { busy = false; }
  }
  function say(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }

  root.NecpraVoiceSales = { start: start, _totals: totals, _blockers: blockers, _summary: summary, _clarify: clarify };
})(typeof window !== 'undefined' ? window : globalThis);
