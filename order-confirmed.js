// Order confirmed: shows the order and waits for Stripe's confirmation to reach the database
(() => {
  const H = window.HyardFirebase;
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('order') || '';

  H.ready.then(async (fb0) => {
    if (!fb0.configured || !/^[A-Za-z0-9]{10,40}$/.test(id)) return;
    const { fb } = await H.requireUser();
    const { F, db } = fb;
    H.setCartHint(0);
    let stop = null;
    stop = F.onSnapshot(F.doc(db, 'orders', id), (snap) => {
      if (!snap.exists()) return;
      const o = snap.data();
      $('oc-order').hidden = false;
      $('oc-number').textContent = `Order HYO-${id.slice(0, 6).toUpperCase()}`;
      $('oc-date').textContent = H.fmtDate(o.paidAt || o.createdAt);
      $('oc-status').textContent = H.ORDER_STATUS[o.status] || o.status;
      $('oc-lines').innerHTML = (o.items || []).map((i) => `<li><span class="mono">${H.esc(i.label)}</span><span class="mono muted">${H.esc(H.euro(i.amount) || '')}</span></li>`).join('');
      $('oc-total').textContent = H.euro(o.total) || '';
      if (o.status === 'awaiting_payment') {
        $('oc-kicker').textContent = 'Confirming your payment';
        $('oc-text').textContent = 'We\'re waiting for the payment confirmation from Stripe. This page updates by itself, usually within a minute.';
      } else if (['paid', 'in_progress', 'delivered'].includes(o.status)) {
        $('oc-kicker').textContent = 'Payment received';
        $('oc-text').textContent = 'Your order is confirmed. A receipt from Stripe is on its way to your email.';
        if (stop && o.status !== 'awaiting_payment') { stop(); stop = null; }
      } else {
        location.replace(`payment-failed?order=${encodeURIComponent(id)}&reason=failed`);
      }
    }, () => {});
  });
})();
