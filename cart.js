// Cart: lines, notes, consent and the jump to Stripe Checkout
(() => {
  const H = window.HyardFirebase;
  const SV = window.HyardServices;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;

  H.ready.then(async (fb0) => {
    $('cart-loading').hidden = true;
    if (!fb0.configured) { $('cart-off').hidden = false; return; }
    const { fb, user } = await H.requireUser();
    const uid = user.uid;
    $('cart').hidden = false;

    let services = [];
    let items = [];
    const svcOf = (id) => services.find((s) => s.id === id);

    const render = () => {
      $('cart-empty').hidden = items.length > 0;
      $('cart-full').hidden = items.length === 0;
      let total = 0;
      let unpriced = 0;
      $('cart-lines').innerHTML = items.map((it) => {
        const svc = svcOf(it.serviceId);
        const price = SV.linePrice(svc, it);
        if (price == null) unpriced += 1; else total += price;
        return `
          <li class="cart-line" data-id="${esc(it.id)}">
            <div class="cart-line-main">
              <h2 class="display cart-line-title">${esc(svc ? svc.name : 'Service no longer offered')}</h2>
              <p class="mono muted">${esc(SV.lineLabel(svc, it).split(' · ').slice(1).join(' · '))}</p>
              ${it.option === 'track' ? `<label class="cart-qty"><span class="mono muted">Tracks</span><input type="number" min="1" max="30" value="${esc(it.tracks || 1)}" inputmode="numeric" data-qty></label>` : ''}
              <label class="field cart-notes"><span class="field-label mono">Notes for us <em class="muted">Optional</em></span>
                <textarea rows="2" maxlength="500" data-notes placeholder="Track names, references, deadline">${esc(it.notes || '')}</textarea></label>
            </div>
            <div class="cart-line-side">
              <span class="display cart-line-price">${esc(price == null ? 'Price coming soon' : H.euro(price))}</span>
              <button type="button" class="link-btn mono" data-remove>Remove</button>
            </div>
          </li>`;
      }).join('');
      $('sum-count').textContent = String(items.length);
      $('sum-total').textContent = unpriced ? 'Price coming soon' : H.euro(total);
      $('checkout').disabled = unpriced > 0 || items.length === 0;
      $('checkout-status').textContent = unpriced
        ? 'Some items don\'t have a price yet, so checkout isn\'t open. Remove them or check back soon.'
        : '';
    };

    try {
      const [{ list }, cartItems] = await Promise.all([SV.load(fb), SV.getCart(fb, uid)]);
      services = list;
      items = cartItems;
    } catch (err) {
      $('checkout-status').textContent = H.message(err);
    }
    render();
    if (window.hyardObserve) window.hyardObserve();

    let saveTimer = null;
    const save = (now) => {
      clearTimeout(saveTimer);
      const run = () => SV.saveCart(fb, uid, items).catch((err) => { $('checkout-status').textContent = H.message(err); });
      if (now) return run();
      saveTimer = setTimeout(run, 600);
      return null;
    };

    $('cart-lines').addEventListener('click', async (e) => {
      if (!e.target.closest('[data-remove]')) return;
      const id = e.target.closest('.cart-line').dataset.id;
      items = items.filter((i) => i.id !== id);
      render();
      await save(true);
      const next = document.querySelector('.cart-line [data-remove]') || document.querySelector('#cart-empty a');
      if (next) next.focus();
    });
    $('cart-lines').addEventListener('change', (e) => {
      const q = e.target.closest('[data-qty]');
      if (!q) return;
      const it = items.find((i) => i.id === e.target.closest('.cart-line').dataset.id);
      it.tracks = Math.min(30, Math.max(1, Math.round(Number(q.value) || 1)));
      render();
      save(true);
    });
    $('cart-lines').addEventListener('input', (e) => {
      const n = e.target.closest('[data-notes]');
      if (!n) return;
      items.find((i) => i.id === e.target.closest('.cart-line').dataset.id).notes = n.value.slice(0, 500);
      save(false);
    });

    ['agree-terms', 'agree-start'].forEach((id) => $(id).addEventListener('change', () => { $('agree-error').textContent = ''; }));

    $('checkout').addEventListener('click', async () => {
      const out = $('checkout-status');
      if (!$('agree-terms').checked || !$('agree-start').checked) {
        $('agree-error').textContent = 'Tick both boxes to continue.';
        ($('agree-terms').checked ? $('agree-start') : $('agree-terms')).focus();
        return;
      }
      await user.reload();
      if (!user.emailVerified) {
        out.innerHTML = 'Confirm your email before paying. <a href="dashboard">Open your dashboard</a> to resend the link.';
        return;
      }
      const btn = $('checkout');
      btn.disabled = true;
      btn.classList.add('is-sending');
      out.textContent = 'Opening secure checkout…';
      try {
        await save(true);
        await user.getIdToken(true);
        const call = fb.Fn.httpsCallable(fb.functions, 'createCheckoutSession');
        const res = await call({ consent: true, lang: document.documentElement.lang === 'hr' ? 'hr' : 'en' });
        if (!res.data || !res.data.url) throw new Error('No checkout address');
        location.assign(res.data.url);
      } catch (err) {
        btn.disabled = false;
        btn.classList.remove('is-sending');
        out.textContent = H.message(err);
      }
    });
  });
})();
