/*! NECPRA Voice Sales NLU (pure, no DOM). English + Kiswahili + mixed. Understanding only: it proposes lines against the trader's OWN
 *  catalogue and never invents products, prices or stock. Prices always come from the catalogue; spoken prices are only flagged. */
(function (root) {
  'use strict';
  var EN_U = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var EN_T = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var SW_U = { moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10 };
  var SW_T = { ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90 };
  var UNIT_SYN = { kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', kilogramu: 'kg', g: 'g', gram: 'g', grams: 'g', gramu: 'g', l: 'litre', lt: 'litre', litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', lita: 'litre', ml: 'ml',
    packet: 'packet', packets: 'packet', pkt: 'packet', pkts: 'packet', pakiti: 'packet', paketi: 'packet', bottle: 'bottle', bottles: 'bottle', chupa: 'bottle', carton: 'carton', cartons: 'carton', katoni: 'carton', dozen: 'dozen', dozens: 'dozen', dazani: 'dozen',
    bunch: 'bundle', bunches: 'bundle', bundle: 'bundle', bundles: 'bundle', mtungo: 'bundle', mitungo: 'bundle', fungu: 'bundle', mafungu: 'bundle', tray: 'tray', trays: 'tray', trei: 'tray', sack: 'sack', sacks: 'sack', bag: 'sack', bags: 'sack', gunia: 'sack', magunia: 'sack',
    metre: 'metre', metres: 'metre', meter: 'metre', meters: 'metre', mita: 'metre', piece: 'piece', pieces: 'piece', pcs: 'piece', pc: 'piece', kipande: 'piece', vipande: 'piece', item: 'piece', items: 'piece' };
  var COUNTABLE = { piece: 1, packet: 1, bottle: 1, carton: 1, dozen: 1, bundle: 1, tray: 1, sack: 1 };
  var CUR = { shilingi: 1, shillings: 1, shilling: 1, ksh: 1, kes: 1, bob: 1, sh: 1 };
  var PREP = { ya: 1, za: 1, vya: 1, wa: 1, cha: 1, la: 1, pa: 1, of: 1, worth: 1, for: 1, is: 1, ni: 1, thamani: 1 };
  var STOP = { a: 1, an: 1, the: 1, i: 1, have: 1, has: 1, had: 1, and: 1, na: 1, pia: 1, also: 1, then: 1, to: 1, my: 1, some: 1, of: 1, ya: 1, za: 1, vya: 1, wa: 1, cha: 1, la: 1, pa: 1, worth: 1, for: 1, sold: 1, sell: 1, nimeuza: 1, nimeuzia: 1, ameuza: 1, tumeuza: 1, uza: 1, uzia: 1, customer: 1, mteja: 1, paid: 1, amelipa: 1, kwa: 1, by: 1, with: 1, mpesa: 1, cash: 1, at: 1, per: 1, each: 1, kila: 1, bought: 1, alinunua: 1, amenunua: 1, please: 1, tafadhali: 1 };
  var SYN = [['tomato', 'nyanya'], ['potato', 'viazi', 'kiazi'], ['onion', 'kitunguu', 'vitunguu'], ['sukuma', 'kale'], ['cabbage', 'kabichi'], ['carrot', 'karoti'], ['sugar', 'sukari'], ['flour', 'unga'], ['milk', 'maziwa'], ['egg', 'yai', 'mayai'], ['bread', 'mkate'], ['oil', 'mafuta'], ['salt', 'chumvi'], ['bean', 'maharagwe'], ['rice', 'mchele', 'wali'], ['banana', 'ndizi'], ['maize', 'mahindi', 'corn'], ['spinach', 'mchicha'], ['pepper', 'pilipili'], ['lemon', 'ndimu'], ['mango', 'embe', 'maembe'], ['avocado', 'parachichi'], ['orange', 'chungwa', 'machungwa'], ['garlic', 'saumu'], ['tea', 'chai'], ['soap', 'sabuni'], ['water', 'maji'], ['meat', 'nyama'], ['fish', 'samaki'], ['chicken', 'kuku'], ['coriander', 'dhania'], ['cassava', 'muhogo']];
  var SYNMAP = {}; SYN.forEach(function (g, i) { g.forEach(function (w) { SYNMAP[w] = 'g' + i; }); });

  function clean(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function stem(w) { if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y'; if (/oes$/.test(w)) return w.slice(0, -2); if (/(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2); if (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) return w.slice(0, -1); return w; }
  function key(w) { var s = stem(w); return SYNMAP[s] || SYNMAP[w] || s; }
  function lev(a, b) { var m = a.length, n = b.length, d = [], i, j; if (Math.abs(m - n) > 1) return 2; for (i = 0; i <= m; i++) d[i] = [i]; for (j = 1; j <= n; j++) d[0][j] = j; for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function canonUnit(u) { u = String(u || '').toLowerCase().trim(); return UNIT_SYN[u] || u; }

  var SALE_VERB = /\b(sold|sell|nimeuza|nimeuzia|ameuza|tumeuza|uza|uzia|imeuzwa|alinunua|amenunua|bought|customer bought|sale of|nimemuuzia)\b/;
  function normalise(text) {
    var s = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    s = s.replace(/m[\s-]?pesa/g, 'mpesa').replace(/(\d),(\d{3})/g, '$1$2').replace(/(ksh|kes|sh)\.?\s*(\d)/g, 'ksh $2').replace(/(\d)\s*(\/=|\/-)/g, '$1 ksh').replace(/@/g, ' at ');
    s = s.replace(/(\d)(?=[a-z])/g, '$1 ').replace(/([.?!;])(\s|$)/g, ' | ').replace(/[^a-z0-9.%|\s]/g, ' ').replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
    return clean(s);
  }
  function looksLikeSaleStatement(text) { return SALE_VERB.test(normalise(text)); }

  /* number words -> value. Returns {value, len} or null. */
  function readNumber(t, i) {
    var total = 0, cur = 0, j = i, any = false, last = '';
    function nextIsNum(k) { var w = t[k]; return w != null && (/^\d+(\.\d+)?$/.test(w) || w in EN_U || w in EN_T || w in SW_U || w in SW_T || w === 'hundred' || w === 'thousand' || w === 'mia' || w === 'elfu' || w === 'nusu' || w === 'half'); }
    function small(k) { var v = 0, p = k; if (t[p] in SW_T) { v = SW_T[t[p]]; p++; if ((t[p] === 'na') && t[p + 1] in SW_U && SW_U[t[p + 1]] < 10) { v += SW_U[t[p + 1]]; p += 2; } return { v: v, n: p - k }; } if (t[p] === 'kumi') { v = 10; p++; if (t[p] === 'na' && t[p + 1] in SW_U && SW_U[t[p + 1]] < 10) { v += SW_U[t[p + 1]]; p += 2; } return { v: v, n: p - k }; } if (t[p] in SW_U) return { v: SW_U[t[p]], n: 1 }; return null; }
    while (j < t.length) {
      var w = t[j];
      if (/^\d+(\.\d+)?$/.test(w)) { if (any) break; cur += parseFloat(w); any = true; last = 'd'; j++; }
      else if (w in EN_U && last !== 'u' && last !== 'd') { cur += EN_U[w]; any = true; last = 'u'; j++; }
      else if (w in EN_T && last !== 'u' && last !== 'd' && last !== 't') { cur += EN_T[w]; any = true; last = 't'; j++; }
      else if (w === 'hundred' && (any || t[j - 1] === 'a')) { cur = (cur || 1) * 100; any = true; last = 'h'; j++; }
      else if (w === 'thousand' && (any || t[j - 1] === 'a')) { total += (cur || 1) * 1000; cur = 0; any = true; last = 'k'; j++; }
      else if (w === 'a' && (t[j + 1] === 'hundred' || t[j + 1] === 'thousand') && !any) { j++; }
      else if (w === 'mia' && last !== 'u' && last !== 'd') { var nx = t[j + 1]; if (nx in SW_U && SW_U[nx] < 10) { cur += SW_U[nx] * 100; j += 2; } else { cur += 100; j++; } any = true; last = 'h'; }
      else if (w === 'elfu' && last !== 'd') { var sm = small(j + 1); if (sm) { total += sm.v * 1000; j += 1 + sm.n; } else { total += 1000; j++; } any = true; last = 'k'; }
      else if ((w in SW_T || w in SW_U) && last !== 'u' && last !== 'd') { var s2 = small(j); cur += s2.v; j += s2.n; any = true; last = 'u'; }
      else if ((w === 'na' || w === 'and') && any && (nextIsNum(j + 1))) { if (t[j + 1] === 'nusu' || t[j + 1] === 'half') { cur += 0.5; j += 2; last = 'f'; break; } j++; last = last === 'h' || last === 'k' ? '' : last; }
      else if (w === 'and' && any && t[j + 1] === 'a' && t[j + 2] === 'half') { cur += 0.5; j += 3; break; }
      else if ((w === 'nusu' || w === 'half') && !any) { cur = 0.5; any = true; j++; break; }
      else if ((w === 'robo' || w === 'quarter') && !any) { cur = 0.25; any = true; j++; break; }
      else break;
    }
    return any ? { value: total + cur, len: j - i } : null;
  }

  function tokensOfName(n) { return normalise(n).split(' ').filter(function (w) { return w && w !== '|'; }); }
  function findMentions(t, products) {
    var P = products.map(function (p) { var toks = tokensOfName(p.name); return { p: p, keys: toks.map(key), toks: toks }; }), out = [], i = 0;
    while (i < t.length) {
      var w = t[i], done = false;
      if (w === '|' || STOP[w] || /^\d/.test(w) || w in EN_U || w in EN_T || w in SW_U || w in SW_T || UNIT_SYN[w] || CUR[w]) { i++; continue; }
      for (var n = Math.min(3, t.length - i); n >= 1 && !done; n--) {
        var span = t.slice(i, i + n); if (span.some(function (x) { return x === '|' || STOP[x] || /^\d/.test(x); })) continue;
        var sk = span.map(key), res = [];
        P.forEach(function (c) {
          var all = sk.every(function (k) { return c.keys.indexOf(k) >= 0; }), score = 0;
          if (all) score = sk.length === c.keys.length ? 3 : 2;
          else if (n === 1 && span[0].length >= 5 && c.toks.some(function (x) { return x.length >= 5 && lev(span[0], x) <= 1; })) score = 1;
          if (score) res.push({ p: c.p, score: score });
        });
        if (res.length) { var best = Math.max.apply(null, res.map(function (r) { return r.score; })); out.push({ start: i, end: i + n, cands: res.filter(function (r) { return r.score === best; }).map(function (r) { return r.p; }), fuzzy: best === 1, heard: span.join(' ') }); i += n; done = true; }
      }
      if (!done) i++;
    }
    return out;
  }

  function cents(v) { return Math.round(Number(v) * 100); }
  function lineTotalCents(qty, price) { return Math.round(Math.round(qty * 1000) * cents(price) / 1000); }
  function convertQty(qty, from, to) {
    if (from === to) return { qty: qty };
    if (from === 'g' && to === 'kg') return { qty: qty / 1000 }; if (from === 'kg' && to === 'g') return { qty: qty * 1000 };
    if (from === 'ml' && to === 'litre') return { qty: qty / 1000 }; if (from === 'litre' && to === 'ml') return { qty: qty * 1000 };
    if (from === 'dozen' && to === 'piece') return { qty: qty * 12 }; if (from === 'piece' && to === 'dozen') return { qty: qty / 12 };
    return null;
  }

  function parsePayment(s) {
    var credit = /\b(credit|on credit|deni|mkopo|ataleta baadaye|ataleta kesho|atalipa baadaye|atalipa kesho|hajalipa|has not paid|hasn t paid|will pay later|pay later|anadaiwa|owes|ameandikisha)\b/.test(s);
    var mpesa = /\bmpesa\b/.test(s), cash = /\b(cash|taslimu|pesa mkononi)\b/.test(s), n = (credit ? 1 : 0) + (mpesa ? 1 : 0) + (cash ? 1 : 0);
    if (n > 1) return { method: null, conflict: true };
    return { method: credit ? 'credit' : mpesa ? 'mpesa' : cash ? 'cash' : null };
  }
  function extractDiscount(s) {
    var d = null, m;
    if ((m = /(\d+(?:\.\d+)?)\s*(?:%|percent|per cent|asilimia)\s*(?:off|discount|punguzo)?/.exec(s)) && /(off|discount|punguzo|%|asilimia|percent)/.test(s) && /(discount|punguzo|off)/.test(s)) { d = { type: 'percent', value: parseFloat(m[1]) }; s = s.replace(m[0], ' '); }
    else if ((m = /(?:discount|punguzo)(?: of| la| ya)?\s*(?:asilimia|percent)\s*(\d+(?:\.\d+)?)/.exec(s))) { d = { type: 'percent', value: parseFloat(m[1]) }; s = s.replace(m[0], ' '); }
    else if ((m = /(?:discount|punguzo)(?: of| la| ya)?\s*(?:ksh|shilingi|shillings)?\s*(\d+(?:\.\d+)?)(?:\s*(?:ksh|shilingi|shillings))?/.exec(s)) || (m = /(\d+(?:\.\d+)?)\s*(?:ksh|shilingi|shillings)?\s*(?:off|discount)\b/.exec(s))) { d = { type: 'amount', value: parseFloat(m[1]) }; s = s.replace(m[0], ' '); }
    return { discount: d, rest: s };
  }
  var NAME_STOP = /^(paid|pays|amelipa|alilipa|atalipa|has|had|will|with|on|kwa|by|cash|mpesa|credit|and|na|who|ambaye|bought|alinunua|is|ni|wangu|then|pia|alitaka)$/;
  function extractCustomer(raw) {
    var m = /\b(?:customer|mteja|client)\s+(?:is |ni |was |wangu )?([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})/i.exec(raw), out = [];
    if (!m) return null; m[1].split(/\s+/).forEach(function (w, i) { if (i === 0 && NAME_STOP.test(w.toLowerCase())) { out = null; } if (out && !NAME_STOP.test(w.toLowerCase()) && out.length === i) out.push(w); });
    return out && out.length ? out.join(' ') : null;
  }

  /* Main entry. products: [{id,name,unit,sellingPrice,stockQty}] from the AUTHENTICATED trader's catalogue. */
  function parseSale(text, products) {
    var raw = String(text || ''), s = normalise(raw), pay = parsePayment(s), dd = extractDiscount(s);
    var t = dd.rest.split(' ').filter(Boolean), mentions = findMentions(t, products || []), groups = [], i = 0;
    var inMention = function (k) { return mentions.some(function (m) { return k >= m.start && k < m.end; }); };
    // numbers (+ attached unit / currency)
    while (i < t.length) {
      if (inMention(i)) { i++; continue; }
      var cur0 = null, startI = i, unitFirst = null;
      if (UNIT_SYN[t[i]] && t[i - 1] !== 'per' && t[i - 1] !== 'kila' && !CUR[t[i]] && readNumber(t, i + 1)) { unitFirst = canonUnit(t[i]); i++; } // Kiswahili order: "kilo mbili"
      else if (CUR[t[i]] && readNumber(t, i + 1)) { cur0 = t[i]; i++; }
      var r = readNumber(t, i); if (!r) { i = startI + 1; continue; }
      var g = { start: startI, numStart: i, end: i + r.len, value: r.value, unit: null, cur: !!cur0, pricePer: false }; i += r.len;
      if (unitFirst) g.unit = unitFirst;
      else if (t[i] === 'a' && UNIT_SYN[t[i + 1]] && !inMention(i + 1)) { g.unit = canonUnit(t[i + 1]); i += 2; } // "half a kilo"
      else if (UNIT_SYN[t[i]] && !inMention(i)) { g.unit = canonUnit(t[i]); i++; } else if (CUR[t[i]]) { g.cur = true; i++; }
      if (t[i] === 'per' || t[i] === 'each' || t[i] === 'kila') g.pricePer = true;
      g.end = i; groups.push(g);
    }
    var FILL = function (a, b, extra) { for (var k = a; k < b; k++) { var w = t[k]; if (!(PREP[w] || CUR[w] || w === 'at' || w === 'kwa' || (extra && extra[w]))) return false; } return true; };
    var lines = mentions.map(function (m) { return { m: m, qty: null, unit: null, amount: null, spokenPrice: null, issues: [] }; });
    var style = groups.length && mentions.length && groups[0].start < mentions[0].start ? 'qty-first' : 'product-first', orphans = [];
    groups.forEach(function (g) {
      var bi = -1, fi = -1, k;
      for (k = 0; k < mentions.length; k++) { if (mentions[k].end <= g.start) bi = k; if (mentions[k].start >= g.end && fi < 0) fi = k; }
      var back = bi >= 0 && FILL(mentions[bi].end, g.start), fwd = fi >= 0 && FILL(g.end, mentions[fi].start, { 'ya': 1 });
      var between = bi >= 0 ? t.slice(mentions[bi].end, g.start) : [], isPrice = bi >= 0 && back && (between.indexOf('at') >= 0 || (between.indexOf('kwa') >= 0 && g.cur === false && lines[bi].qty != null) || g.pricePer);
      var target = -1, kind = null;
      if (isPrice) { target = bi; kind = 'price'; }
      else if ((g.unit || g.cur) && fwd) { target = fi; kind = g.unit ? 'qty' : 'amount'; }
      else if (back && (g.unit || g.cur || between.some(function (w) { return PREP[w]; }))) { target = bi; kind = g.unit ? 'qty' : (g.cur || between.some(function (w) { return PREP[w] && w !== 'of'; })) ? 'amount' : 'qty'; }
      else if (back && fwd) { target = style === 'product-first' ? bi : fi; kind = 'qty'; }
      else if (back) { target = bi; kind = 'qty'; } else if (fwd) { target = fi; kind = 'qty'; }
      if (target < 0) return orphans.push(g.value);
      var L = lines[target];
      if (kind === 'price') L.spokenPrice = g.value;
      else if (kind === 'amount') { if (L.amount == null) L.amount = g.value; else L.issues.push({ type: 'multiple_numbers' }); }
      else { if (L.qty == null) { L.qty = g.value; L.unit = g.unit; L.bare = !g.unit; } else L.issues.push({ type: 'multiple_numbers' }); }
    });

    var out = lines.map(function (L) {
      var m = L.m, line = { heard: m.heard, candidates: m.cands.map(function (c) { return c.id; }), fuzzy: m.fuzzy, notes: [], status: 'ok', spoken: { qty: L.qty, unit: L.unit, amount: L.amount, price: L.spokenPrice } };
      if (L.issues.length) line.status = 'multiple_numbers';
      if (m.cands.length > 1) { line.status = 'choose_product'; line.candidateNames = m.cands.map(function (c) { return c.name; }); return line; }
      return resolveLine(line, m.cands[0], L);
    });
    var seen = {}; out = out.filter(function (l) { // the same product said twice in one sentence becomes ONE line (no duplicate cart lines)
      if (!l.productId || l.qty == null || l.status !== 'ok') return true; var f = seen[l.productId];
      if (!f) { seen[l.productId] = l; return true; }
      f.qty = Math.round((f.qty + l.qty) * 1000) / 1000; f.lineCents = lineTotalCents(f.qty, f.price); f.notes.push('Mentioned twice, combined into ' + trimN(f.qty) + ' ' + f.unit + '.'); if (f.qty > f.stock) { f.status = 'insufficient_stock'; f.notes.push('Only ' + trimN(f.stock) + ' in stock.'); } return false;
    });
    return { isSale: SALE_VERB.test(s) && out.length > 0, text: raw, lines: out, payment: pay, discount: dd.discount, customerName: extractCustomer(raw), orphanNumbers: orphans, style: style };
  }

  // Fill a line from a chosen catalogue product (also used after the trader resolves "which product?")
  function resolveLine(line, p, L) {
    L = L || { qty: line.spoken.qty, unit: line.spoken.unit, amount: line.spoken.amount, spokenPrice: line.spoken.price, bare: line.spoken.unit == null };
    var pu = canonUnit(p.unit), price = p.sellingPrice, qty = L.qty, notes = line.notes = [];
    line.productId = p.id; line.name = p.name; line.unit = p.unit; line.price = price; line.stock = p.stockQty; line.qty = null; line.lineCents = 0; line.status = line.status === 'multiple_numbers' ? 'multiple_numbers' : 'ok';
    if (line.fuzzy) notes.push('I matched “' + line.heard + '” to ' + p.name + '. Check this is right.');
    if (!(price > 0)) { line.status = 'no_price'; notes.push(p.name + ' has no selling price. Set its price in Products first.'); return line; }
    if (L.unit && qty != null) { var su = canonUnit(L.unit), cv = convertQty(qty, su, pu); if (!cv) { line.status = 'unit_mismatch'; line.spoken.qty = qty; notes.push('You said ' + qty + ' ' + su + ' but ' + p.name + ' is sold per ' + pu + '.'); return line; } if (su !== pu) notes.push(qty + ' ' + su + ' = ' + trimN(cv.qty) + ' ' + pu + '.'); qty = cv.qty; }
    else if (qty != null && L.bare && qty >= 100 && L.amount == null) { line.status = 'qty_or_amount'; line.spoken.qty = qty; notes.push('Is ' + qty + ' a number of ' + pu + ' or KSh ' + qty + ' worth?'); return line; }
    if (qty == null && L.amount != null) {
      var exact = L.amount / price;
      if (COUNTABLE[pu] && Math.abs(exact - Math.round(exact)) > 1e-6) { line.status = 'fractional'; line.options = [Math.floor(exact), Math.ceil(exact)].filter(function (x) { return x > 0; }); line.worth = L.amount; notes.push('KSh ' + L.amount + ' is not a whole number of ' + pu + ' at KSh ' + price + ' each.'); return line; }
      qty = COUNTABLE[pu] ? Math.round(exact) : Math.round(exact * 1000) / 1000; line.worth = L.amount;
      var got = lineTotalCents(qty, price); if (got !== cents(L.amount)) notes.push('KSh ' + L.amount + ' of ' + p.name + ' at your price is ' + trimN(qty) + ' ' + pu + ' = KSh ' + (got / 100) + ' (nearest possible).');
    } else if (qty != null && L.amount != null && lineTotalCents(qty, price) !== cents(L.amount)) { line.status = 'amount_conflict'; notes.push('You said ' + trimN(qty) + ' ' + pu + ' and KSh ' + L.amount + ', but ' + trimN(qty) + ' at KSh ' + price + ' is KSh ' + (lineTotalCents(qty, price) / 100) + '.'); }
    if (qty == null) { line.status = line.status === 'ok' ? 'need_qty' : line.status; }
    else { line.qty = qty; line.lineCents = lineTotalCents(qty, price); if (qty > p.stockQty) { line.status = line.status === 'ok' ? 'insufficient_stock' : line.status; notes.push('Only ' + trimN(p.stockQty) + ' ' + pu + ' in stock.'); } }
    if (L.spokenPrice != null && Math.abs(L.spokenPrice - price) > 0.005) { line.priceConflict = L.spokenPrice; notes.push('You said KSh ' + L.spokenPrice + ' per ' + pu + ' but your price is KSh ' + price + '. Using your price.'); }
    return line;
  }
  function trimN(n) { return String(Math.round(n * 1000) / 1000); }

  // Answer to "how many / how much?": "five kilograms", "tatu", "shilingi mia mbili", "KSh 200 worth"
  function parseQuantityAnswer(text) {
    var t = normalise(text).split(' ').filter(Boolean), i = 0, cur = false;
    for (; i < t.length; i++) { if (CUR[t[i]]) { cur = true; continue; } var r = readNumber(t, i); if (r) { var nx = t[i + r.len], u = UNIT_SYN[nx] ? canonUnit(nx) : null; if (!u && (CUR[nx] || /\b(worth)\b/.test(t.join(' ')))) cur = true; return cur ? { amount: r.value } : { qty: r.value, unit: u }; } }
    return null;
  }
  function recompute(line, p) { var L = { qty: line.spoken.qty, unit: line.spoken.unit, amount: line.spoken.amount, spokenPrice: line.spoken.price, bare: line.spoken.unit == null }; line.status = 'ok'; return resolveLine(line, p, L); }

  var api = { parseSale: parseSale, resolveLine: resolveLine, recompute: recompute, parseQuantityAnswer: parseQuantityAnswer, looksLikeSaleStatement: looksLikeSaleStatement, readNumber: function (text) { var r = readNumber(normalise(text).split(' '), 0); return r ? r.value : null; }, lineTotalCents: lineTotalCents, canonUnit: canonUnit, normalise: normalise };
  root.NecpraVoiceSalesNLU = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
