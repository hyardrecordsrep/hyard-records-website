// Payment not completed: explains why and, if the visitor cancelled, closes the unpaid order
(() => {
  const H = window.HyardFirebase;
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const reason = q.get('reason');
  const id = q.get('order') || '';

  if (reason === 'cancelled') {
    $('pf-kicker').textContent = 'Checkout cancelled';
    $('pf-title').textContent = 'No payment taken';
    $('pf-text').textContent = 'You left the payment page before paying, so nothing was charged. Your cart is saved for when you\'re ready.';
  } else if (reason === 'error') {
    $('pf-kicker').textContent = 'Something went wrong';
    $('pf-text').textContent = 'We couldn\'t open the payment page. Nothing was charged. Try again in a moment, or contact us if it keeps happening.';
  }

  H.ready.then(async (fb0) => {
    if (!fb0.configured || reason !== 'cancelled' || !/^[A-Za-z0-9]{10,40}$/.test(id)) return;
    const user = await H.userReady;
    if (!user) return;
    try {
      await fb0.Fn.httpsCallable(fb0.functions, 'cancelCheckout')({ orderId: id });
    } catch { /* the unpaid session simply expires on its own */ }
  });
})();
