// Store (/store): three tiles (Services, Products, Merch). Services and products can be browsed by
// anyone; adding to the cart needs an account, so signed-out visitors get "Log in to buy" instead.
(() => {
  const H = window.HyardFirebase;
  const SV = window.HyardServices;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;
  const TABS = ['services', 'products'];

  // ---------- Tiles: the address hash opens a section (store#services, store#products) ----------
  const showTab = (scroll) => {
    const name = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : '';
    document.querySelectorAll('[data-store-panel]').forEach((p) => { p.hidden = p.id !== name; });
    document.querySelectorAll('[data-store-tab]').forEach((a) => {
      const on = a.dataset.storeTab === name;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.querySelector('.store-hub').classList.toggle('has-active', !!name);
    // After logging in, come back to the same section
    document.querySelectorAll('[data-store-login]').forEach((a) => {
      const u = new URL(a.getAttribute('href'), location.href);
      u.searchParams.set('next', `store${name ? `#${name}` : ''}`);
      a.setAttribute('href', `account${u.search}`);
    });
    if (scroll && name) {
      const top = $(name).getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    if (window.hyardObserve) window.hyardObserve();
  };
  window.addEventListener('hashchange', () => showTab(true));
  showTab(false);
  if (location.hash) requestAnimationFrame(() => showTab(true));

  // Merch: "Coming soon" on hover, focus or tap
  const merch = document.querySelector('.store-soon');
  merch.addEventListener('click', () => merch.classList.toggle('is-flipped'));
  merch.addEventListener('mouseleave', () => merch.classList.remove('is-flipped'));

  const loginHref = () => `account?mode=signup&next=${encodeURIComponent(`store${location.hash || ''}`)}`;

  H.ready.then(async (fb) => {
    if (!fb.configured) {
      $('svc-status').textContent = 'The store opens soon.';
      $('prod-empty').hidden = false;
      return;
    }
    const user = await H.userReady;
    const uid = user ? user.uid : null;
    $('store-account').hidden = !!uid;
    document.querySelectorAll('[data-cart-only]').forEach((a) => { a.hidden = !uid; });
    const buyButton = (cls, disabled) => (uid
      ? `<button type="button" class="news-btn display ${cls}"${disabled ? ' disabled' : ''}>Add to cart <svg aria-hidden="true"><use href="#i-arrow"/></svg></button>`
      : `<a class="news-btn display" href="${esc(loginHref())}" data-login>Log in to buy <svg aria-hidden="true"><use href="#i-arrow"/></svg></a>`);
    // The login link always brings people back to the section they were on
    document.addEventListener('click', (e) => { const a = e.target.closest('[data-login]'); if (a) a.href = loginHref(); });

    // ---------- Services ----------
    const grid = $('svc-grid');
    let services = [];
    const svcCard = (s) => {
      const perTrack = SV.hasPrice(s.pricePerTrack) ? `${H.euro(s.pricePerTrack)} per track` : 'Price coming soon';
      return `
      <article class="svc" data-svc="${esc(s.id)}">
        <h3 class="display svc-name">${esc(s.name)}</h3>
        <p class="svc-summary">${esc(s.summary || '')}</p>
        <ul class="svc-includes">${(s.includes || []).map((x) => `<li class="mono">${esc(x)}</li>`).join('')}</ul>
        <p class="mono muted svc-meta">${esc([s.turnaround, s.revisions].filter(Boolean).join(' · '))}</p>
        <fieldset class="svc-options">
          <legend class="visually-hidden">Choose an option for ${esc(s.name)}</legend>
          <label class="svc-opt">
            <input type="radio" name="opt-${esc(s.id)}" value="track" checked>
            <span class="svc-opt-box"><span class="mono">Per track</span><span class="mono muted">${esc(perTrack)}</span></span>
          </label>
          ${(s.packages || []).map((p) => `
          <label class="svc-opt">
            <input type="radio" name="opt-${esc(s.id)}" value="${esc(p.id)}">
            <span class="svc-opt-box"><span class="mono">${esc(p.name)} package · ${esc(p.tracks)} tracks</span><span class="mono muted">${esc(SV.hasPrice(p.price) ? H.euro(p.price) : 'Price coming soon')}</span></span>
          </label>`).join('')}
        </fieldset>
        <div class="svc-foot">
          <label class="svc-tracks"><span class="mono muted">Tracks</span><input type="number" min="1" max="30" value="1" inputmode="numeric"></label>
          <span class="display svc-total" aria-live="polite"></span>
          ${buyButton('svc-add')}
        </div>
      </article>`;
    };
    const updateCard = (card) => {
      const s = services.find((x) => x.id === card.dataset.svc);
      const opt = card.querySelector('input[type=radio]:checked').value;
      const tracksBox = card.querySelector('.svc-tracks');
      tracksBox.hidden = opt !== 'track';
      const n = Math.min(30, Math.max(1, Number(tracksBox.querySelector('input').value) || 1));
      const price = SV.linePrice(s, { option: opt, tracks: n });
      card.querySelector('.svc-total').textContent = price == null ? 'Price coming soon' : H.euro(price);
      const add = card.querySelector('.svc-add');
      if (add) {
        add.disabled = price == null;
        add.title = price == null ? 'Bookings open once prices are set' : '';
      }
    };
    SV.load(fb).then(({ list }) => {
      services = list;
      grid.innerHTML = list.map(svcCard).join('');
      grid.querySelectorAll('.svc').forEach(updateCard);
      if (!list.some((s) => SV.hasPrice(s.pricePerTrack) || (s.packages || []).some((p) => SV.hasPrice(p.price)))) {
        $('svc-status').textContent = 'Prices are coming soon. Bookings open as soon as they are set.';
      }
    });
    grid.addEventListener('input', (e) => { const c = e.target.closest('.svc'); if (c) updateCard(c); });
    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.svc-add');
      if (!btn || !uid) return;
      const card = btn.closest('.svc');
      const opt = card.querySelector('input[type=radio]:checked').value;
      const tracks = Number(card.querySelector('.svc-tracks input').value) || 1;
      btn.disabled = true;
      try {
        const items = await SV.addToCart(fb, uid, { serviceId: card.dataset.svc, option: opt, tracks });
        $('svc-status').innerHTML = `Added to your cart. <a href="cart">Go to cart (${items.length})</a>`;
      } catch (err) { $('svc-status').textContent = err.code === 'cart/full' ? err.message : H.message(err); }
      btn.disabled = false;
    });

    // ---------- Products ----------
    const pGrid = $('prod-grid');
    const pFilter = $('prod-filter');
    let products = [];
    let category = '';
    let inCart = new Set();
    let owned = new Set();
    const preview = new Audio();
    preview.preload = 'none';
    let playing = null;
    const setPlaying = (btn, on) => {
      if (!btn) return;
      btn.classList.toggle('is-playing', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('.prod-play-label').textContent = on ? 'Pause' : 'Play preview';
    };
    preview.addEventListener('ended', () => { setPlaying(playing, false); playing = null; });
    preview.addEventListener('pause', () => setPlaying(playing, false));
    preview.addEventListener('play', () => setPlaying(playing, true));
    const prodCard = (p) => {
      const priced = SV.hasPrice(p.price);
      const link = `product?p=${encodeURIComponent(p.id)}`;
      return `
      <article class="prod" data-prod="${esc(p.id)}">
        <div class="ev-pic prod-pic">${p.image && p.image.url ? `<img src="${esc(p.image.url)}" alt="" loading="lazy">` : '<svg aria-hidden="true"><use href="#globe"/></svg>'}
          <a class="prod-link" href="${link}" tabindex="-1" aria-hidden="true"></a>
          ${p.preview && p.preview.url ? '<button type="button" class="prod-play" data-play aria-pressed="false"><span class="prod-play-icon" aria-hidden="true"></span><span class="prod-play-label">Play preview</span></button>' : ''}
        </div>
        <div class="prod-body">
          ${p.category ? `<span class="mono muted prod-cat">${esc(p.category)}</span>` : ''}
          <h3 class="display prod-title"><a href="${link}">${esc(p.title)}</a></h3>
          ${p.description ? `<p class="prod-desc">${esc(p.description)}</p>` : ''}
          <a class="mono prod-more" href="${link}">Details and pictures</a>
          <div class="prod-foot">
            <span class="display prod-price">${esc(priced ? H.euro(p.price) : 'Price coming soon')}</span>
            ${owned.has(p.id) ? '<a class="more" href="dashboard#orders">Bought · Download</a>'
              : inCart.has(p.id) ? '<a class="more" href="cart">In your cart</a>'
              : buyButton('prod-add', !priced)}
          </div>
        </div>
      </article>`;
    };
    const renderProducts = () => {
      const cats = [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      if (category && !cats.includes(category)) category = '';
      pFilter.hidden = cats.length < 2;
      pFilter.innerHTML = ['', ...cats].map((c) => `<button class="filter${c === category ? ' is-active' : ''}" type="button" data-cat="${esc(c)}" aria-pressed="${c === category}">${esc(c || 'All')}</button>`).join('');
      const list = products.filter((p) => !category || p.category === category);
      if (playing && !document.body.contains(playing)) { preview.pause(); playing = null; }
      pGrid.innerHTML = list.map(prodCard).join('');
      $('prod-empty').hidden = products.length > 0;
    };
    const paid = ['paid', 'in_progress', 'delivered'];
    Promise.all([
      SV.loadProducts(fb),
      uid ? SV.getCart(fb, uid).catch(() => []) : [],
      uid ? fb.F.getDocs(fb.F.query(fb.F.collection(fb.db, 'orders'), fb.F.where('uid', '==', uid))).then((s) => s.docs.map((d) => d.data())).catch(() => []) : [],
    ]).then(([list, cart, orders]) => {
      products = list;
      inCart = new Set(cart.filter((i) => i.productId).map((i) => i.productId));
      owned = new Set(orders.filter((o) => o.uid === uid && paid.includes(o.status)).flatMap((o) => (o.downloads || []).map((d) => d.productId)));
      renderProducts();
    });
    pFilter.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      category = b.dataset.cat;
      preview.pause();
      renderProducts();
    });
    pGrid.addEventListener('click', async (e) => {
      const card = e.target.closest('.prod');
      if (!card) return;
      const p = products.find((x) => x.id === card.dataset.prod);
      const play = e.target.closest('[data-play]');
      if (play) {
        if (playing === play && !preview.paused) { preview.pause(); return; }
        if (playing && playing !== play) setPlaying(playing, false);
        playing = play;
        if (preview.dataset.id !== p.id) { preview.src = p.preview.url; preview.dataset.id = p.id; }
        preview.play().catch(() => {});
        return;
      }
      const add = e.target.closest('.prod-add');
      if (!add || !uid) return;
      add.disabled = true;
      try {
        const items = await SV.addToCart(fb, uid, { productId: p.id });
        inCart.add(p.id);
        $('prod-status').innerHTML = `${esc(p.title)} is in your cart. <a href="cart">Go to cart (${items.length})</a>`;
        renderProducts();
      } catch (err) {
        add.disabled = false;
        $('prod-status').textContent = err.code === 'cart/full' ? err.message : H.message(err);
      }
    });
  });
})();
