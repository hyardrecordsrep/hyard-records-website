// Local stand-in for Firebase, for clicking through the account pages without a Firebase project.
// Only used on localhost when localStorage "hyard-mock" is "1" (see firebase.js). Never published:
// the deploy removes scripts/. Data lives in localStorage "hyard-mock-db".
const KEY = 'hyard-mock-db';
const now = () => ({ seconds: Math.floor(Date.now() / 1000), toDate() { return new Date(this.seconds * 1000); } });
const ts = (ms) => ({ seconds: Math.floor(ms / 1000), toDate() { return new Date(ms); } });
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 10);

const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (typeof v.seconds === 'number' && Object.keys(v).length === 1) return ts(v.seconds * 1000);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
};
const load = () => { try { return revive(JSON.parse(localStorage.getItem(KEY))) || null; } catch { return null; } };
let state = load();
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); listeners.forEach((l) => l()); };
const listeners = new Set();

async function seed() {
  const svc = (await fetch('data/services.json').then((r) => r.json())).services;
  const prices = { production: [150, 520, 1200], mixing: [90, 320, 750], mastering: [35, 120, 290], full: [250, 880, 2000] };
  const services = {};
  svc.forEach((s) => {
    const p = prices[s.id];
    services[s.id] = { ...s, pricePerTrack: p[0], packages: s.packages.map((k, i) => ({ ...k, price: p[i + 1] })) };
  });
  delete services.full.id;
  services.full.pricePerTrack = null; // one service left without a price, to see "Price coming soon"
  const day = 86400000;
  state = {
    authUsers: { test: { uid: 'test', email: 'artist@example.com', password: 'testtest1', displayName: 'Test Artist', emailVerified: true, admin: true, provider: 'password' } },
    current: null,
    col: {
      users: { test: { name: 'Test Artist', stageName: 'TESTR', email: 'artist@example.com', links: { spotify: 'https://open.spotify.com/artist/x' } } },
      services,
      carts: {},
      demos: {
        d1: { uid: 'test', email: 'artist@example.com', title: 'Night Shift', artist: 'TESTR', genre: 'Techno', bpm: '138', key: 'F minor', link: '', message: 'First demo.', files: [{ name: 'night-shift.wav', path: 'demos/test/d1/1-night-shift.wav', size: 52428800 }], status: 'listening', note: 'Strong groove, we are listening to the full EP this week.', createdAt: ts(Date.now() - 5 * day) },
        d2: { uid: 'test', email: 'artist@example.com', title: 'Warehouse Prayer', artist: 'TESTR', genre: 'Rave', bpm: '145', key: '', link: 'https://soundcloud.com/x/private', message: '', files: [], status: 'submitted', note: '', createdAt: ts(Date.now() - day) },
        d3: { uid: 'other', email: 'someone@example.com', title: 'Other Artist Demo', artist: 'Someone', genre: 'Progressive', bpm: '128', key: 'A minor', link: '', message: 'Hi there', files: [{ name: 'demo.mp3', path: 'demos/other/d3/1-demo.mp3', size: 8400000 }], status: 'submitted', note: '', createdAt: ts(Date.now() - 2 * day) },
      },
      orders: {
        o1abcdefghij: { uid: 'test', email: 'artist@example.com', items: [{ serviceId: 'mastering', option: 'ep', tracks: 4, notes: 'Club master please', label: 'Mastering · EP package (4 tracks)', amount: 120 }], total: 120, status: 'in_progress', brief: 'Loud but not crushed.', uploads: [], deliverables: [{ name: 'track1-master.wav', path: 'orders/test/o1/deliverables/t1.wav', size: 61000000 }], adminNote: 'First masters are up, tell us what you think.', createdAt: ts(Date.now() - 3 * day), paidAt: ts(Date.now() - 3 * day), paymentIntent: 'pi_test' },
      },
    },
  };
  save();
}

const userObj = (u) => {
  if (!u) return null;
  const rec = state.authUsers[u];
  return {
    uid: rec.uid, email: rec.email, displayName: rec.displayName, emailVerified: rec.emailVerified,
    providerData: [{ providerId: rec.provider }],
    async reload() { Object.assign(this, { emailVerified: state.authUsers[u].emailVerified }); },
    async getIdToken() { return 'mock'; },
    async getIdTokenResult() { return { claims: { admin: !!state.authUsers[u].admin } }; },
  };
};
let currentUser = null;
const authListeners = new Set();
const setUser = (uid) => {
  state.current = uid; save();
  currentUser = userObj(uid);
  authListeners.forEach((f) => f(currentUser));
};
const fail = (code) => Promise.reject(Object.assign(new Error(code), { code }));

const A = {
  getAuth: () => ({}), useDeviceLanguage() {}, connectAuthEmulator() {},
  onAuthStateChanged(_a, f) { authListeners.add(f); setTimeout(() => f(currentUser), 0); return () => authListeners.delete(f); },
  async signInWithEmailAndPassword(_a, email, pw) {
    const u = Object.values(state.authUsers).find((x) => x.email === email);
    if (!u || u.password !== pw) return fail('auth/invalid-credential');
    setUser(u.uid); return { user: currentUser };
  },
  async createUserWithEmailAndPassword(_a, email, pw) {
    if (Object.values(state.authUsers).some((x) => x.email === email)) return fail('auth/email-already-in-use');
    const uid = rid();
    state.authUsers[uid] = { uid, email, password: pw, displayName: '', emailVerified: false, admin: false, provider: 'password' };
    setUser(uid); return { user: currentUser };
  },
  async updateProfile(u, { displayName }) { state.authUsers[u.uid].displayName = displayName; u.displayName = displayName; save(); },
  async sendEmailVerification(u) { state.authUsers[u.uid].emailVerified = true; save(); }, // pretend the link was clicked
  async sendPasswordResetEmail() {},
  GoogleAuthProvider: class {},
  async signInWithPopup() { return fail('auth/popup-closed-by-user'); },
  async signOut() { setUser(null); },
  EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
  async reauthenticateWithCredential(u, c) { if (state.authUsers[u.uid].password !== c.password) return fail('auth/invalid-credential'); },
  async reauthenticateWithPopup() {},
  async updatePassword(u, pw) { state.authUsers[u.uid].password = pw; save(); },
  async verifyBeforeUpdateEmail() {},
  async deleteUser(u) { delete state.authUsers[u.uid]; delete state.col.users[u.uid]; setUser(null); },
};

// ---------- Firestore ----------
const SERVER_TS = { __ts: true };
const ARRAY_UNION = (...v) => ({ __union: v });
const apply = (old, data) => {
  const out = { ...old };
  Object.entries(data).forEach(([k, v]) => {
    if (v && v.__ts) out[k] = now();
    else if (v && v.__union) out[k] = [...(old[k] || []), ...v.__union];
    else out[k] = v;
  });
  return out;
};
const snapOf = (c, id) => {
  const d = state.col[c]?.[id];
  return { id, exists: () => !!d, data: () => (d ? revive(JSON.parse(JSON.stringify(d))) : undefined) };
};
const matchIds = (q) => {
  let ids = Object.keys(state.col[q.name] || {});
  (q.parts || []).forEach((p) => {
    if (!p.where) return;
    const [k, v, op] = p.where;
    ids = ids.filter((id) => { const x = state.col[q.name][id][k]; return op === 'in' ? v.includes(x) : x === v; });
  });
  return ids;
};
const F = {
  getFirestore: () => ({}), connectFirestoreEmulator() {},
  collection: (_db, name) => ({ type: 'col', name }),
  doc: (a, b, c) => (a && a.type === 'col' ? { type: 'doc', col: a.name, id: rid() } : { type: 'doc', col: b, id: c }),
  where: (field, op, value) => ({ where: [field, value, op] }),
  orderBy: (field, dir) => ({ orderBy: [field, dir] }),
  query: (col, ...parts) => ({ ...col, parts }),
  serverTimestamp: () => SERVER_TS,
  arrayUnion: ARRAY_UNION,
  async getDoc(ref) { return snapOf(ref.col, ref.id); },
  async getDocs(q) { const ids = matchIds(q); return { docs: ids.map((id) => snapOf(q.name, id)), empty: !ids.length }; },
  async setDoc(ref, data, opt) {
    state.col[ref.col] = state.col[ref.col] || {};
    const old = opt && opt.merge ? state.col[ref.col][ref.id] || {} : {};
    state.col[ref.col][ref.id] = apply(old, data); save();
  },
  async updateDoc(ref, data) { state.col[ref.col][ref.id] = apply(state.col[ref.col][ref.id], data); save(); },
  async deleteDoc(ref) { delete state.col[ref.col][ref.id]; save(); },
  onSnapshot(ref, next) {
    const run = () => {
      if (ref.type === 'doc') { next(snapOf(ref.col, ref.id)); return; }
      let ids = matchIds(ref);
      const ob = (ref.parts || []).find((p) => p.orderBy);
      if (ob) ids.sort((a, b) => (state.col[ref.name][b][ob.orderBy[0]]?.seconds || 0) - (state.col[ref.name][a][ob.orderBy[0]]?.seconds || 0));
      next({ docs: ids.map((id) => snapOf(ref.name, id)) });
    };
    listeners.add(run); setTimeout(run, 0);
    return () => listeners.delete(run);
  },
};

// ---------- Storage ----------
const S = {
  getStorage: () => ({}), connectStorageEmulator() {},
  ref: (_s, path) => ({ path }),
  uploadBytesResumable(ref, file) {
    // Small pictures are kept as data URLs so event pictures still show after a reload
    if (/^(image|audio)\//.test(file.type || '') && file.size < 1500000) {
      const r = new FileReader();
      r.onload = () => { state.files = state.files || {}; state.files[ref.path] = r.result; save(); };
      r.readAsDataURL(file);
    }
    return {
      on(_e, progress, error, done) {
        let sent = 0;
        const step = () => {
          sent = Math.min(file.size, sent + Math.max(1, file.size / 5));
          progress({ bytesTransferred: sent, totalBytes: file.size });
          if (sent >= file.size) done(); else setTimeout(step, 120);
        };
        setTimeout(step, 50);
      },
    };
  },
  async getDownloadURL(ref) {
    await new Promise((r) => setTimeout(r, 300));
    if (state.files && state.files[ref.path]) return state.files[ref.path];
    return 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  },
  async deleteObject(ref) { if (state.files) { delete state.files[ref.path]; save(); } },
};

// ---------- Functions ----------
const Fn = {
  getFunctions: () => ({}), connectFunctionsEmulator() {},
  httpsCallable: (_f, name) => async (data) => {
    const uid = state.current;
    if (name === 'claimAdmin') return { data: { admin: !!state.authUsers[uid]?.admin } };
    if (name === 'cancelCheckout') {
      const o = state.col.orders[data.orderId];
      if (o && o.status === 'awaiting_payment') { o.status = 'cancelled'; save(); }
      return { data: { status: 'cancelled' } };
    }
    if (name === 'createCheckoutSession') {
      const items = state.col.carts[uid]?.items || [];
      const lines = items.map((it) => {
        if (it.productId) {
          const p = (state.col.products || {})[it.productId];
          if (!p || !p.price) throw Object.assign(new Error('One of the products in your cart is no longer available.'), { code: 'functions/failed-precondition' });
          return { productId: it.productId, kind: 'product', notes: '', label: p.title, amount: p.price };
        }
        const s = state.col.services[it.serviceId];
        if (it.option === 'track') {
          if (!s.pricePerTrack) throw Object.assign(new Error(`${s.name} doesn't have a price yet, so it can't be bought.`), { code: 'functions/failed-precondition' });
          return { ...it, label: `${s.name} · ${it.tracks} tracks`, amount: s.pricePerTrack * it.tracks };
        }
        const p = s.packages.find((k) => k.id === it.option);
        return { ...it, label: `${s.name} · ${p.name} package (${p.tracks} tracks)`, amount: p.price };
      });
      const id = rid();
      state.col.orders[id] = { uid, email: state.authUsers[uid].email, items: lines, total: lines.reduce((n, l) => n + l.amount, 0), status: 'awaiting_payment', hasServices: lines.some((l) => !l.productId), hasProducts: lines.some((l) => l.productId), brief: '', uploads: [], deliverables: [], adminNote: '', createdAt: now() };
      save();
      const outcome = localStorage.getItem('hyard-mock-pay') || 'paid';
      if (outcome === 'cancel') return { data: { url: `payment-failed?order=${id}&reason=cancelled` } };
      // Pretend Stripe's webhook arrives a moment after the buyer lands back on the site
      state.col.orders[id].mockPayAt = Date.now() + 2500;
      save();
      return { data: { url: `order-confirmed?order=${id}` } };
    }
    if (name === 'adminStats') {
      const daily = {};
      const paid = Object.entries(state.col.orders).filter(([, o]) => ['paid', 'in_progress', 'delivered'].includes(o.status));
      paid.forEach(([, o]) => {
        const d = (o.paidAt || o.createdAt).toDate();
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        daily[k] = daily[k] || { revenue: 0, sales: 0 };
        daily[k].revenue += o.total; daily[k].sales += 1;
      });
      // a few made-up earlier days so the chart has something to show locally
      [3, 6, 9, 12, 20, 40, 75, 130, 200].forEach((ago, i) => {
        const d = new Date(Date.now() - ago * 86400000);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        daily[k] = { revenue: [35, 120, 19, 400, 24.99, 110, 300, 49, 950][i], sales: 1 };
      });
      const pop = {};
      paid.forEach(([, o]) => (o.items || []).forEach((i) => {
        const key = i.productId ? `p:${i.productId}` : `s:${i.serviceId}`;
        const e = pop[key] || (pop[key] = { name: i.productId ? i.label : String(i.label).split(' · ')[0], kind: i.productId ? 'product' : 'service', sold: 0, revenue: 0 });
        e.sold += 1; e.revenue += i.amount;
      }));
      const latest = paid.sort((a, b) => (b[1].paidAt || b[1].createdAt).seconds - (a[1].paidAt || a[1].createdAt).seconds).slice(0, 8)
        .map(([oid, o]) => ({ amount: o.total, refunded: 0, created: (o.paidAt || o.createdAt).toDate().getTime(), email: o.email, name: 'Test Artist', items: o.items.map((i) => i.label), orderId: oid, paymentIntent: o.paymentIntent }));
      return { data: { daily, latest, popular: Object.values(pop).sort((a, b) => b.sold - a.sold).slice(0, 6), balance: { available: 412.5, pending: 59 }, stripeBase: 'https://dashboard.stripe.com/test' } };
    }
    throw Object.assign(new Error('unknown function'), { code: 'functions/not-found' });
  },
};

export async function create(site) {
  if (!state) await seed();
  currentUser = userObj(state.current);
  // Pick up the "webhook" written by another page load
  setInterval(() => {
    const due = Object.entries(state.col.orders || {}).filter(([, o]) => o.mockPayAt && o.mockPayAt < Date.now());
    if (due.length) {
      due.forEach(([, o]) => {
        const prods = (o.items || []).filter((i) => i.productId);
        if (prods.length) {
          o.downloads = prods.flatMap((i) => {
            const p = (state.col.products || {})[i.productId] || {};
            const plats = p.plugin ? ['win', 'mac'].filter((k) => p[k === 'win' ? 'fileWin' : 'fileMac']) : [null];
            return (plats.length ? plats : [null]).map((platform) => ({ productId: i.productId, title: i.label, ...(platform ? { platform } : {}), token: rid() + rid(), count: 0 }));
          });
        }
      });
      due.forEach(([, o]) => { delete o.mockPayAt; o.status = o.hasServices === false ? 'delivered' : 'paid'; o.paidAt = now(); o.paymentIntent = 'pi_mock'; delete state.col.carts[o.uid]; });
      save();
      return;
    }
    const fresh = load();
    if (fresh && JSON.stringify(fresh.col) !== JSON.stringify(state.col)) { state = fresh; listeners.forEach((l) => l()); }
  }, 800);
  return { configured: true, mock: true, app: {}, auth: {}, db: {}, storage: {}, functions: {}, A, F, S, Fn, site };
}
