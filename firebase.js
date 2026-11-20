// Accounts, database, file storage and server functions (Firebase).
// The project config lives in data/site.json -> "firebase". While it is null, account pages show
// "accounts open soon" instead of the forms. The config is public by design: access is controlled by
// firestore.rules and storage.rules, not by hiding these values.
(() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const REGION = 'europe-west1';
  const HINT = 'hyard-signed-in';
  const CART_HINT = 'hyard-cart-count';
  const ADMIN_HINT = 'hyard-admin';
  const hint = {
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  const ready = fetch('data/site.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then(async (site) => {
      // Local click-through without a Firebase project (scripts/dev/firebase-mock.js, never published)
      let mock = false;
      try { mock = local && localStorage.getItem('hyard-mock') === '1'; } catch { /* private mode */ }
      if (mock) return (await import('./scripts/dev/firebase-mock.js')).create(site);
      const config = site && site.firebase;
      if (!config || !config.apiKey) return { configured: false };
      const [app, auth, fs, st, fn] = await Promise.all([
        import(`${SDK}firebase-app.js`),
        import(`${SDK}firebase-auth.js`),
        import(`${SDK}firebase-firestore.js`),
        import(`${SDK}firebase-storage.js`),
        import(`${SDK}firebase-functions.js`),
      ]);
      const a = app.initializeApp(config);
      const out = {
        configured: true,
        app: a,
        auth: auth.getAuth(a),
        db: fs.getFirestore(a),
        storage: st.getStorage(a),
        functions: fn.getFunctions(a, REGION),
        A: auth, F: fs, S: st, Fn: fn,
        site,
      };
      // Local testing against the Firebase emulators (firebase emulators:start)
      if (local && site.firebaseEmulators) {
        auth.connectAuthEmulator(out.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        fs.connectFirestoreEmulator(out.db, '127.0.0.1', 8080);
        st.connectStorageEmulator(out.storage, '127.0.0.1', 9199);
        fn.connectFunctionsEmulator(out.functions, '127.0.0.1', 5001);
      }
      auth.useDeviceLanguage(out.auth);
      return out;
    })
    .catch((err) => { console.error('Firebase did not load', err); return { configured: false, failed: true }; });

  // Resolves once Firebase knows whether someone is signed in (user or null)
  const userReady = ready.then((fb) => {
    if (!fb.configured) return null;
    return new Promise((resolve) => {
      const stop = fb.A.onAuthStateChanged(fb.auth, (u) => { stop(); resolve(u); });
    });
  });

  // Keep the menu hint and claims fresh whenever the sign-in changes
  ready.then((fb) => {
    if (!fb.configured) return;
    fb.A.onAuthStateChanged(fb.auth, (u) => {
      hint.set(HINT, u ? '1' : null);
      if (!u) { hint.set(CART_HINT, null); hint.set(ADMIN_HINT, null); }
      // The label account only uses the admin page, so the menu points there instead of the dashboard
      if (u) {
        u.getIdTokenResult().then((t) => {
          hint.set(ADMIN_HINT, t.claims.admin === true ? '1' : null);
          if (window.hyardMenuAccount) window.hyardMenuAccount();
        }).catch(() => {});
      }
      document.dispatchEvent(new CustomEvent('hyard:auth', { detail: u }));
      if (window.hyardMenuAccount) window.hyardMenuAccount();
    });
  });

  const isAdmin = async (user) => {
    if (!user) return false;
    const t = await user.getIdTokenResult();
    return t.claims.admin === true;
  };

  // Friendly messages for the Firebase error codes people actually see
  const MESSAGES = {
    'auth/invalid-email': 'Enter an email like you@gmail.com.',
    'auth/missing-email': 'Enter your email first.',
    'auth/missing-password': 'Enter your password.',
    'auth/invalid-credential': 'That email and password don\'t match. Try again or reset your password.',
    'auth/wrong-password': 'That email and password don\'t match. Try again or reset your password.',
    'auth/user-not-found': 'That email and password don\'t match. Try again or reset your password.',
    'auth/email-already-in-use': 'There\'s already an account with that email. Log in instead.',
    'auth/weak-password': 'Use at least 8 characters for your password.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before you finished.',
    'auth/cancelled-popup-request': 'The Google window was closed before you finished.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
    'auth/requires-recent-login': 'For your safety, enter your current password again first.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/account-exists-with-different-credential': 'That email already has an account with a password. Log in with your password.',
    'hyard/wrong-current-password': 'Your current password isn\'t right.',
    'permission-denied': 'You don\'t have access to that.',
    'storage/unauthorized': 'That file couldn\'t be uploaded. Check it\'s an MP3 or WAV under 200 MB.',
    'storage/canceled': 'Upload cancelled.',
    'storage/retry-limit-exceeded': 'The upload kept failing. Check your connection and try again.',
    'functions/unavailable': 'The payment service isn\'t reachable right now. Try again in a moment.',
    'functions/unauthenticated': 'Log in first.',
  };
  const message = (err) => {
    const code = (err && err.code) || '';
    if (MESSAGES[code]) return MESSAGES[code];
    if (code.startsWith('functions/') && err.message && !/^internal$/i.test(err.message)) return err.message;
    return 'Something went wrong. Try again in a moment.';
  };

  // Sends signed-out visitors to the login page, then back here afterwards
  const requireUser = async () => {
    const fb = await ready;
    if (!fb.configured) return { fb, user: null };
    const user = await userReady;
    if (!user) {
      const back = location.pathname.replace(/^\//, '') + location.search + location.hash;
      location.replace(`account?next=${encodeURIComponent(back || 'dashboard')}`);
      return new Promise(() => {}); // stop here while the browser leaves
    }
    return { fb, user };
  };

  const euro = (n) => (n == null || n === '' || Number.isNaN(Number(n)))
    ? null
    : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(Number(n));

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Words shown for each status, used by the dashboard and admin pages
  const DEMO_STATUS = {
    submitted: 'Received',
    listening: 'Listening',
    shortlisted: 'Shortlisted',
    declined: 'Not for us',
    signed: 'Signed',
  };
  const ORDER_STATUS = {
    awaiting_payment: 'Awaiting payment',
    paid: 'Paid · in the queue',
    in_progress: 'In progress',
    delivered: 'Delivered',
    payment_failed: 'Payment not completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  };

  // Next safe place to go after login (only pages on this site)
  const nextPage = () => {
    const n = new URLSearchParams(location.search).get('next') || '';
    return /^[a-z0-9-]+(\?[^#]*)?(#[a-z-]+)?$/i.test(n) ? n : 'dashboard';
  };

  window.HyardFirebase = {
    ready, userReady, requireUser, isAdmin, message, euro, fmtDate, bytes, esc, nextPage,
    DEMO_STATUS, ORDER_STATUS,
    setAdminHint: (on) => { hint.set(ADMIN_HINT, on ? '1' : null); if (window.hyardMenuAccount) window.hyardMenuAccount(); },
    setCartHint: (n) => { hint.set(CART_HINT, n > 0 ? String(n) : null); if (window.hyardMenuAccount) window.hyardMenuAccount(); },
  };
})();
