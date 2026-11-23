// Services and cart, shared by the dashboard, cart and admin pages.
// Prices shown here are for display only: the server function works out the real total from
// Firestore when checkout starts, so changing anything in the browser can't change what's charged.
(() => {
  const H = window.HyardFirebase;

  const fallback = () => fetch('data/services.json', { cache: 'no-cache' })
    .then((r) => r.json()).then((d) => d.services || []).catch(() => []);

  const sortList = (list) => list.filter((s) => s.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));

  // Services from Firestore, or the defaults in data/services.json until the label loads them
  const load = async (fb) => {
    try {
      const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'services'));
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (list.length) return { list: sortList(list), live: true };
    } catch (err) { console.warn('Services: using the defaults', err); }
    return { list: sortList(await fallback()), live: false };
  };

  // Products (drum kits, sample packs…) from Firestore "products", only the ones that are switched on
  const loadProducts = async (fb) => {
    try {
      const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'products'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        .filter((p) => p.active !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title)));
    } catch (err) { console.warn('Products did not load', err); return []; }
  };

  const hasPrice = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0;

  // Price of one cart line, or null if the label hasn't set it yet
  const linePrice = (svc, item) => {
    if (!svc) return null;
    if (item.productId) return hasPrice(svc.price) ? Number(svc.price) : null;
    if (item.option === 'track') {
      if (!hasPrice(svc.pricePerTrack)) return null;
      return Math.round(Number(svc.pricePerTrack) * 100) * Math.max(1, Number(item.tracks) || 1) / 100;
    }
    const pkg = (svc.packages || []).find((p) => p.id === item.option);
    return pkg && hasPrice(pkg.price) ? Number(pkg.price) : null;
  };

  const lineLabel = (svc, item) => {
    if (item.productId) return svc ? `${svc.title} · Digital download` : 'Product no longer available';
    if (!svc) return 'Service no longer offered';
    if (item.option === 'track') {
      const n = Math.max(1, Number(item.tracks) || 1);
      return `${svc.name} · ${n} ${n === 1 ? 'track' : 'tracks'}`;
    }
    const pkg = (svc.packages || []).find((p) => p.id === item.option);
    return pkg ? `${svc.name} · ${pkg.name} package (${pkg.tracks} tracks)` : `${svc.name} · option no longer offered`;
  };

  // ---------- Cart (Firestore: carts/{uid}) ----------
  const cartRef = (fb, uid) => fb.F.doc(fb.db, 'carts', uid);
  const getCart = async (fb, uid) => {
    const snap = await fb.F.getDoc(cartRef(fb, uid));
    const items = snap.exists() ? (snap.data().items || []) : [];
    H.setCartHint(items.length);
    return items;
  };
  const saveCart = async (fb, uid, items) => {
    await fb.F.setDoc(cartRef(fb, uid), { items, updatedAt: fb.F.serverTimestamp() });
    H.setCartHint(items.length);
    return items;
  };
  const addToCart = async (fb, uid, item) => {
    const items = await getCart(fb, uid);
    if (items.length >= 20) throw Object.assign(new Error('Your cart is full (20 items).'), { code: 'cart/full' });
    const id = Math.random().toString(36).slice(2, 10);
    if (item.productId) {
      if (items.some((i) => i.productId === item.productId)) return items; // already in the cart
      items.push({ id, productId: item.productId, notes: '' });
      return saveCart(fb, uid, items);
    }
    items.push({ id, serviceId: item.serviceId, option: item.option, tracks: item.option === 'track' ? Math.min(30, Math.max(1, Number(item.tracks) || 1)) : null, notes: '' });
    return saveCart(fb, uid, items);
  };

  window.HyardServices = { load, loadProducts, hasPrice, linePrice, lineLabel, getCart, saveCart, addToCart };
})();
