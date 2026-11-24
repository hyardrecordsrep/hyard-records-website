// Product page (/product?p={id}): pictures, full description, preview player and the buy button.
// Anyone can look; buying needs an account, so signed-out visitors get "Log in to buy".
(() => {
  const H = window.HyardFirebase;
  const SV = window.HyardServices;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;
  const id = new URLSearchParams(location.search).get('p') || '';

  // Search engines: each product page names its own address, title, picture and price
  const head = (tag, attrs) => {
    const sel = `${tag}${Object.entries(attrs).filter(([k]) => k !== 'content' && k !== 'href').map(([k, v]) => `[${k}="${v}"]`).join('')}`;
    let el = document.head.querySelector(sel);
    if (!el) { el = document.createElement(tag); document.head.appendChild(el); }
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  };
  const abs = (u) => (/^https?:/.test(u) ? u : `https://hyardrecords.com/${u}`);
  const describe = (p, pics) => {
    const link = `https://hyardrecords.com/product?p=${encodeURIComponent(p.id)}`;
    const text = String(p.description || '').replace(/\s+/g, ' ').trim();
    const desc = text ? (text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, '')}…` : text) : `${p.title} from Hyard Records.`;
    const title = `${p.title} — Hyard Records`;
    head('link', { rel: 'canonical', href: link });
    head('meta', { name: 'description', content: desc });
    head('meta', { property: 'og:title', content: title });
    head('meta', { name: 'twitter:title', content: title });
    head('meta', { property: 'og:description', content: desc });
    head('meta', { name: 'twitter:description', content: desc });
    head('meta', { property: 'og:url', content: link });
    head('meta', { property: 'og:type', content: 'product' });
    if (pics.length) {
      head('meta', { property: 'og:image', content: abs(pics[0].url) });
      head('meta', { name: 'twitter:image', content: abs(pics[0].url) });
    }
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.title,
      description: text || desc,
      url: link,
      brand: { '@type': 'Brand', name: 'Hyard Records' },
      ...(pics.length ? { image: pics.map((x) => abs(x.url)) } : {}),
      ...(p.category ? { category: p.category } : {}),
      ...(SV.hasPrice(p.price) ? {
        offers: {
          '@type': 'Offer',
          url: link,
          price: Number(p.price).toFixed(2),
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'Hyard Records' },
        },
      } : {}),
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  };

  const missing = (text) => {
    head('meta', { name: 'robots', content: 'noindex' });
    $('pp-loading').hidden = true;
    $('pp-missing').hidden = false;
    if (text) $('pp-missing-text').textContent = text;
  };
  const clock = (t) => {
    if (!Number.isFinite(t)) return '0:00';
    const s = Math.max(0, Math.floor(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  H.ready.then(async (fb0) => {
    if (!fb0.configured) { missing('The store opens soon.'); return; }
    const fb = fb0;
    const user = await H.userReady;
    const { F, db } = fb;
    const uid = user ? user.uid : null;

    let p = null;
    try {
      const snap = await F.getDoc(F.doc(db, 'products', id));
      if (snap.exists()) p = { ...snap.data(), id: snap.id };
    } catch (err) { console.warn('Product did not load', err); }
    if (!id || !p || p.active === false) { missing(); return; }

    document.title = `${p.title} — Hyard Records`;
    $('pp-loading').hidden = true;
    $('pp').hidden = false;
    $('pp-cat').textContent = p.category || 'Product';
    $('pp-cat').hidden = false;
    $('pp-title').textContent = p.title;
    const priced = SV.hasPrice(p.price);
    $('pp-price').textContent = priced ? H.euro(p.price) : 'Price coming soon';

    // ---------- Pictures ----------
    const pics = [p.image, ...(p.gallery || [])].filter((x) => x && x.url);
    describe(p, pics);
    let at = 0;
    const show = (i) => {
      at = (i + pics.length) % pics.length;
      $('pp-main').innerHTML = `<img src="${esc(pics[at].url)}" alt="${esc(`${p.title}, picture ${at + 1} of ${pics.length}`)}">`;
      $('pp-thumbs').querySelectorAll('button').forEach((b, k) => {
        b.classList.toggle('is-on', k === at);
        b.setAttribute('aria-current', String(k === at));
      });
    };
    if (pics.length) {
      $('pp-thumbs').innerHTML = pics.length > 1 ? pics.map((x, i) => `<li><button type="button" data-thumb="${i}" aria-label="Show picture ${i + 1}"><img src="${esc(x.url)}" alt="" loading="lazy"></button></li>`).join('') : '';
      show(0);
    } else {
      $('pp-main').innerHTML = '<svg aria-hidden="true"><use href="#globe"/></svg>';
      $('pp-main').disabled = true;
    }
    $('pp-thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-thumb]');
      if (b) show(Number(b.dataset.thumb));
    });

    // Full-screen pictures: arrows, keys and swipes move between them
    const lb = $('pp-lightbox');
    const lbShow = () => {
      $('pp-lb-img').src = pics[at].url;
      $('pp-lb-img').alt = `${p.title}, picture ${at + 1} of ${pics.length}`;
      $('pp-lb-count').textContent = pics.length > 1 ? `${at + 1} / ${pics.length}` : '';
      lb.querySelectorAll('[data-lb]').forEach((b) => { b.hidden = pics.length < 2; });
    };
    $('pp-main').addEventListener('click', () => {
      if (!pics.length || typeof lb.showModal !== 'function') return;
      lbShow();
      lb.showModal();
    });
    const step = (d) => { show(at + d); lbShow(); };
    lb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lb]');
      if (b) { step(Number(b.dataset.lb)); return; }
      if (e.target.closest('[data-lb-close]') || e.target === lb) lb.close();
    });
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
    let touchX = null;
    const swipeStart = (e) => { touchX = e.touches[0].clientX; };
    const swipeEnd = (e) => {
      if (touchX == null || pics.length < 2) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) { if (lb.open) step(dx < 0 ? 1 : -1); else show(at + (dx < 0 ? 1 : -1)); }
    };
    [lb, $('pp-main')].forEach((el) => {
      el.addEventListener('touchstart', swipeStart, { passive: true });
      el.addEventListener('touchend', swipeEnd);
    });

    // ---------- Preview player ----------
    if (p.preview && p.preview.url) {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = p.preview.url;
      const play = $('pp-play');
      const seek = $('pp-seek');
      let dragging = false;
      $('pp-player').hidden = false;
      const setPlaying = (on) => {
        play.classList.toggle('is-playing', on);
        play.setAttribute('aria-pressed', String(on));
        $('pp-play-label').textContent = on ? 'Pause' : 'Play preview';
      };
      const paint = () => {
        const pct = audio.duration ? (audio.currentTime / audio.duration) * 1000 : 0;
        if (!dragging) seek.value = String(Math.round(pct));
        seek.style.setProperty('--pct', `${(Number(seek.value) / 10).toFixed(1)}%`);
        $('pp-cur').textContent = clock(audio.currentTime);
      };
      audio.addEventListener('loadedmetadata', () => { $('pp-dur').textContent = clock(audio.duration); });
      audio.addEventListener('timeupdate', paint);
      audio.addEventListener('play', () => setPlaying(true));
      audio.addEventListener('pause', () => setPlaying(false));
      audio.addEventListener('ended', () => { setPlaying(false); audio.currentTime = 0; paint(); });
      play.addEventListener('click', () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
      seek.addEventListener('input', () => {
        dragging = true;
        seek.style.setProperty('--pct', `${(Number(seek.value) / 10).toFixed(1)}%`);
        if (audio.duration) $('pp-cur').textContent = clock((Number(seek.value) / 1000) * audio.duration);
      });
      seek.addEventListener('change', () => {
        dragging = false;
        if (audio.duration) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
      });
    }

    // ---------- Description and file details ----------
    const desc = String(p.description || '').trim();
    if (desc) {
      $('pp-desc').innerHTML = desc.split(/\n\s*\n/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('');
      $('pp-desc-wrap').hidden = false;
    }
    const ext = p.file && p.file.name ? (p.file.name.split('.').pop() || '').toUpperCase() : '';
    const plats = p.plugin ? [p.fileWin && p.fileWin.path ? 'Windows' : null, p.fileMac && p.fileMac.path ? 'Mac' : null].filter(Boolean) : [];
    const facts = [
      p.plugin ? ['Works on', plats.join(' and ') || 'Coming soon'] : ['Format', ext ? `${ext} download` : 'Download'],
      p.plugin
        ? (plats.length ? ['Download', `${plats.join(' and ')} ${plats.length > 1 ? 'versions' : 'version'}`] : null)
        : (p.file && p.file.size ? ['Size', H.bytes(p.file.size)] : null),
      ['Delivery', 'Download link by email straight after payment'],
      ['Licence', p.plugin ? 'Personal licence for your own productions' : 'Use the sounds in your own music, royalty-free'],
    ].filter(Boolean);
    $('pp-facts').innerHTML = facts.map(([k, v]) => `<div><dt class="mono muted">${esc(k)}</dt><dd class="mono">${esc(v)}</dd></div>`).join('')
      + '<div><dt class="mono muted">Terms</dt><dd class="mono"><a href="terms#digital">Digital products terms</a></dd></div>';

    // ---------- Buy button ----------
    let inCart = false;
    let owned = false;
    const renderBuy = () => {
      if (!uid) {
        const next = encodeURIComponent(`product?p=${p.id}`);
        $('pp-buy').innerHTML = `<a class="news-btn display" href="account?mode=signup&next=${next}">Log in to buy <svg aria-hidden="true"><use href="#i-arrow"/></svg></a>
          <p class="mono muted pp-buy-note">Make an account or <a href="account?next=${next}">log in</a> to add this to your cart.</p>`;
        return;
      }
      $('pp-buy').innerHTML = owned
        ? '<a class="news-btn display" href="dashboard#orders">Bought · Download <svg aria-hidden="true"><use href="#i-arrow"/></svg></a>'
        : inCart
          ? '<a class="news-btn display" href="cart">In your cart · Checkout <svg aria-hidden="true"><use href="#i-arrow"/></svg></a>'
          : `<button type="button" class="news-btn display" id="pp-add"${priced ? '' : ' disabled'}>Add to cart <svg aria-hidden="true"><use href="#i-arrow"/></svg></button>`;
    };
    const [cart, orders] = !uid ? [[], []] : await Promise.all([
      SV.getCart(fb, uid).catch(() => []),
      F.getDocs(F.query(F.collection(db, 'orders'), F.where('uid', '==', uid))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    ]);
    inCart = cart.some((i) => i.productId === p.id);
    owned = orders.some((o) => o.uid === uid && ['paid', 'in_progress', 'delivered'].includes(o.status) && (o.downloads || []).some((d) => d.productId === p.id));
    renderBuy();
    $('pp-buy').addEventListener('click', async (e) => {
      const add = e.target.closest('#pp-add');
      if (!add || !uid) return;
      add.disabled = true;
      try {
        const items = await SV.addToCart(fb, uid, { productId: p.id });
        inCart = true;
        renderBuy();
        $('pp-status').innerHTML = `Added to your cart. <a href="cart">Go to cart (${items.length})</a>`;
      } catch (err) {
        add.disabled = false;
        $('pp-status').textContent = err.code === 'cart/full' ? err.message : H.message(err);
      }
    });

    if (window.hyardObserve) window.hyardObserve();
  });
})();
