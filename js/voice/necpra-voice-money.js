/*! NECPRA Voice Money (money.html: Wallet, Chama = "Circles", Pay Later orders). Answers questions and can PREPARE a transfer.
 *  Hard rule: this file has no code that moves money. It never calls transfer/withdraw/contribute endpoints and never touches the
 *  step-up password. "Prepare a payment" only opens the normal Send-money screen pre-filled; the user reviews the recipient and fee,
 *  confirms, and passes the existing password step-up there. Private figures are spoken only if the user allowed reading them aloud. */
(function (root) {
  'use strict';
  var V = root.NecpraVoice, UI = root.NecpraVoiceUI, R = root.NecpraVoiceRemote, M = root.NecpraVoiceMoneyNLU; if (!V || !UI || !R || !M) return;
  var T = UI.T, A = null, busy = false;
  function ksh(n) { n = Number(n || 0); return 'KSh ' + n.toLocaleString('en-KE', { maximumFractionDigits: 2 }); }
  function nairobiDay(d) { try { return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); } catch (_) { return ''; } }
  function nairobiMonth(d) { return nairobiDay(d).slice(0, 7); }
  function label(tab) { return ({ wallet: ['Wallet', 'Pochi'], goals: ['Savings goals', 'Akiba'], circles: ['Chama', 'Chama'], requests: ['Payment requests', 'Maombi ya malipo'], airtime: ['Airtime and data', 'Muda wa maongezi'], paylater: ['Pay Later orders', 'Oda za Lipa Baadaye'], activity: ['Activity', 'Shughuli'] })[tab]; }

  // Private figures: always shown on screen; spoken only if the user enabled "Allow reading private info aloud".
  async function tell(en, sw) {
    var m = T(en, sw); UI.announce(m); if (A.toast) A.toast(m);
    var spoken = await V.speak(m, { sensitive: true });
    if (!spoken) await V.speak(T('It is shown on your screen. To hear private amounts read aloud, turn on “Allow reading private info aloud” in voice settings.', 'Imeonyeshwa kwenye skrini. Ili kusikia kiasi cha siri kikisomwa, washa “Ruhusu kusoma taarifa za siri” kwenye mipangilio ya sauti.'));
  }
  function plain(en, sw) { var m = T(en, sw); UI.announce(m); return V.speak(m); }

  async function ready() { try { await A.refresh(); } catch (_) {} return A.state(); }

  async function handle(payload) {
    var it = M.parse(payload.transcript); if (!it) return false;
    if (busy) { await plain('I am still working on your last request.', 'Bado nashughulikia ombi lako la awali.'); return true; }
    busy = true;
    try {
      if (it.type === 'tab') { A.setTab(it.tab); await plain('Opening ' + label(it.tab)[0] + '.', 'Inafungua ' + label(it.tab)[1] + '.'); return true; }
      if (it.type === 'balance') {
        A.setTab('wallet'); A.reveal(); var s = await ready(), w = s.wallet;
        if (!w) { await plain('I could not load your wallet. Check your connection and try again.', 'Sikuweza kupakia pochi yako. Angalia mtandao kisha jaribu tena.'); return true; }
        V.audit('money.read', { module: 'wallet', outcome: 'executed' });
        await tell((s.stale ? T('I could not refresh, so this may be out of date. ', 'Sikuweza kusasisha, kwa hiyo inaweza kuwa ya zamani. ') : '') + 'Your wallet balance is ' + ksh(w.balance) + (w.isFrozen ? '. Your wallet is frozen. Contact support.' : '.') + (w.pendingTotal > 0 ? ' ' + ksh(w.pendingTotal) + ' is pending.' : ''), 'Salio la pochi yako ni ' + ksh(w.balance) + (w.isFrozen ? '. Pochi imefungwa. Wasiliana na msaada.' : '.') + (w.pendingTotal > 0 ? ' ' + ksh(w.pendingTotal) + ' inasubiri.' : ''));
        return true;
      }
      if (it.type === 'transactions' || it.type === 'spent' || it.type === 'received') {
        A.setTab('wallet'); var st = await ready(), wl = st.wallet; if (!wl) { await plain('I could not load your wallet.', 'Sikuweza kupakia pochi yako.'); return true; }
        var rec = (wl.recent || []).filter(function (x) { return !x.status || x.status === 'completed'; });
        if (it.type === 'received') { await tell('You received ' + ksh(wl.receivedThisMonth) + ' this month.', 'Umepokea ' + ksh(wl.receivedThisMonth) + ' mwezi huu.'); return true; }
        if (it.type === 'spent') {
          if (it.period === 'month') { await tell('You spent ' + ksh(wl.spentThisMonth) + ' this month.', 'Umetumia ' + ksh(wl.spentThisMonth) + ' mwezi huu.'); return true; }
          var today = nairobiDay(Date.now()), sum = rec.filter(function (x) { return x.type === 'debit' && nairobiDay(x.createdAt) === today; }).reduce(function (n, x) { return n + Number(x.amount || 0); }, 0);
          await tell('Today you spent ' + ksh(sum) + ', counted from your ' + rec.length + ' most recent completed transactions.', 'Leo umetumia ' + ksh(sum) + ', kutoka kwa miamala yako ' + rec.length + ' ya hivi karibuni iliyokamilika.'); return true;
        }
        if (!rec.length) { await plain('You have no recent transactions.', 'Huna miamala ya hivi karibuni.'); return true; }
        var items = rec.slice(0, 5).map(function (x) { return (x.type === 'credit' ? T('Received ', 'Umepokea ') : T('Paid ', 'Umelipa ')) + ksh(x.amount) + (x.description ? ', ' + x.description : ''); });
        await tell('Your latest transactions: ' + items.join('; ') + '.', 'Miamala yako ya hivi karibuni: ' + items.join('; ') + '.'); return true;
      }
      if (it.type === 'chama_outstanding' || it.type === 'chama_month') {
        A.setTab('circles'); var so = await ready(), cs = so.circles || [];
        if (!cs.length) { await plain('You do not have any chamas yet.', 'Huna chama bado.'); return true; }
        if (it.type === 'chama_month') {
          var mon = nairobiMonth(Date.now()), act = ((so.overview && so.overview.activity) || []).filter(function (x) { return x.kind === 'contribution' && /paid/i.test(x.subtitle || '') && nairobiMonth(x.createdAt) === mon; });
          var tot = act.reduce(function (n, x) { return n + Number(x.amount || 0); }, 0);
          await tell('This month you contributed ' + ksh(tot) + ' in ' + act.length + (act.length === 1 ? ' payment' : ' payments') + ', counted from your recent activity.', 'Mwezi huu umechangia ' + ksh(tot) + ' kwa malipo ' + act.length + ', kutoka shughuli zako za hivi karibuni.'); return true;
        }
        var parts = cs.filter(function (c) { return Number(c.targetAmount) > 0; }).map(function (c) { return c.name + ': ' + ksh(Math.max(0, Number(c.targetAmount) - Number(c.collectedAmount || 0))) + ' ' + T('to reach the target', 'kufikia lengo'); });
        var dues = ((so.overview && so.overview.dues) || []).map(function (d) { return T('You owe ', 'Unadaiwa ') + ksh(d.amount) + T(' for ', ' kwa ') + d.name; });
        if (!parts.length && !dues.length) { await plain('None of your chamas has a target or a contribution due.', 'Hakuna chama yenye lengo au mchango unaodaiwa.'); return true; }
        await tell('Still outstanding: ' + parts.concat(dues).join('; ') + '.', 'Bado kinadaiwa: ' + parts.concat(dues).join('; ') + '.'); return true;
      }
      if (it.type === 'orders') {
        A.setTab('paylater'); var orders = await A.loadOrders(); orders = orders || [];
        if (!orders.length) { await plain('You have no pending Pay Later orders.', 'Huna oda za Lipa Baadaye zinazosubiri.'); return true; }
        var lines = orders.slice(0, 5).map(function (o) { var tot = Number(o.total_price || o.totalPrice || o.total || 0), paid = Number(o.amount_paid || o.paid_amount || o.amountPaid || 0); return T('Order ending ', 'Oda inayoishia ') + String(o.id).slice(-4) + ': ' + ksh(Math.max(0, tot - paid)) + T(' still to pay', ' bado kulipa'); });
        await tell('You have ' + orders.length + ' pending Pay Later ' + (orders.length === 1 ? 'order' : 'orders') + '. ' + lines.join('; ') + '.', 'Una oda ' + orders.length + ' za Lipa Baadaye zinazosubiri. ' + lines.join('; ') + '.'); return true;
      }
      if (it.type === 'prepare_transfer') {
        var to = it.to;
        if (!to) { var said = await R.capture({ mode: 'command', prompt: T('Who should receive ' + ksh(it.amount) + '? Say their username or phone number.', 'Nani apokee ' + ksh(it.amount) + '? Sema jina la mtumiaji au namba ya simu.'), spokenPrompt: T('Who should receive ' + ksh(it.amount) + '? Say their username or phone number.', 'Nani apokee ' + ksh(it.amount) + '? Sema jina la mtumiaji au namba ya simu.') }); if (!said || !said.ok || !said.transcript) { await plain('Cancelled. Nothing was prepared.', 'Imeghairiwa. Hakuna kilichoandaliwa.'); return true; } to = M.spokenPhone(said.transcript) || said.transcript.replace(/^@/, '').trim(); }
        var yes = await UI.dialog({ title: T('Prepare a payment?', 'Kuandaa malipo?'), speak: true, ok: T('Open Send money', 'Fungua Tuma pesa'), cancel: T('Cancel', 'Ghairi'),
          body: T('Amount: ' + ksh(it.amount) + '\nTo: ' + to + '\n\nNothing is sent yet. The Send money screen will open pre-filled. You will see who the recipient really is and the fee, confirm there, and enter your password.', 'Kiasi: ' + ksh(it.amount) + '\nKwa: ' + to + '\n\nHakuna kinachotumwa bado. Skrini ya Tuma pesa itafunguka ikiwa imejazwa. Utaona mpokeaji halisi na ada, uthibitishe hapo, na uweke nenosiri lako.') });
        if (!yes) { V.audit('money.prepare', { module: 'wallet', outcome: 'cancelled' }); await plain('Cancelled. Nothing was sent.', 'Imeghairiwa. Hakuna kilichotumwa.'); return true; }
        A.prepareTransfer({ to: to, amount: it.amount }); V.audit('money.prepare', { module: 'wallet', outcome: 'captured' });
        await plain('The Send money screen is ready with ' + ksh(it.amount) + '. Check the recipient it shows, then review and confirm. Nothing has been sent.', 'Skrini ya Tuma pesa iko tayari na ' + ksh(it.amount) + '. Hakiki mpokeaji, kisha pitia na uthibitishe. Hakuna kilichotumwa.'); return true;
      }
    } finally { busy = false; }
    return false;
  }
  function init(a) { A = a; R.onIntent(handle); return true; }
  root.NecpraVoiceMoney = { init: init, _handle: handle };
})(typeof window !== 'undefined' ? window : globalThis);
