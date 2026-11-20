// Log in, sign up and password reset (Firebase Authentication)
(() => {
  const H = window.HyardFirebase;
  const $ = (id) => document.getElementById(id);
  const box = $('auth');
  const off = $('auth-off');
  const title = $('auth-title');
  const panels = { login: $('panel-login'), signup: $('panel-signup'), reset: $('panel-reset') };
  const tabs = { login: $('tab-login'), signup: $('tab-signup') };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const TITLES = { login: 'Log in', signup: 'Create account', reset: 'Reset password' };

  const show = (name, focus = true) => {
    Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== name; });
    Object.entries(tabs).forEach(([k, t]) => {
      const on = k === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    title.textContent = TITLES[name];
    document.title = `${TITLES[name]} — Hyard Records`;
    $('google-btn').hidden = name === 'reset';
    document.querySelector('.auth-or').hidden = name === 'reset';
    if (focus) { const first = panels[name].querySelector('input'); if (first) first.focus(); }
  };
  Object.entries(tabs).forEach(([k, t]) => t.addEventListener('click', () => show(k)));
  document.querySelector('.auth-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = document.activeElement === tabs.login ? 'signup' : 'login';
    show(next, false);
    tabs[next].focus();
  });
  document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const email = b.closest('form').querySelector('[name=email]');
    show(b.dataset.show);
    if (email && email.value) panels[b.dataset.show].querySelector('[name=email]').value = email.value;
  }));

  const setError = (input, msg) => {
    const field = input.closest('.field');
    const out = field ? field.querySelector('.field-error') : input.closest('form').querySelector(`[data-for="${input.name}"]`);
    if (field) field.classList.toggle('has-error', !!msg);
    if (out) out.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  const check = (form) => {
    let firstBad = null;
    form.querySelectorAll('input').forEach((i) => {
      let msg = '';
      const v = i.type === 'checkbox' ? i.checked : i.value.trim();
      if (i.required && !v) {
        msg = i.type === 'checkbox' ? 'Please agree before creating your account.' : i.name === 'email' ? 'Enter your email first.' : i.name === 'password' ? 'Enter your password.' : 'This is required.';
      } else if (i.name === 'email' && !EMAIL.test(v)) msg = 'Enter an email like you@gmail.com.';
      else if (i.name === 'password' && i.minLength > 0 && v.length < i.minLength) msg = 'Use at least 8 characters for your password.';
      setError(i, msg);
      if (msg && !firstBad) firstBad = i;
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  };
  document.querySelectorAll('.auth-form input').forEach((i) => i.addEventListener('input', () => setError(i, '')));

  const busy = (form, on, text = '') => {
    const btn = form.querySelector('.submit');
    btn.disabled = on;
    btn.classList.toggle('is-sending', on);
    form.querySelector('.form-status').textContent = text;
  };
  const done = () => { location.replace(H.nextPage()); };

  H.ready.then(async (fb) => {
    if (!fb.configured) { off.hidden = false; return; }
    const { A, F, auth, db } = fb;
    const user = await H.userReady;
    if (user) { done(); return; }
    box.hidden = false;
    const mode = new URLSearchParams(location.search).get('mode');
    show(mode === 'signup' ? 'signup' : 'login', false);
    if (window.hyardObserve) window.hyardObserve();

    // Creates the artist profile the first time someone signs in
    const ensureProfile = async (u, extra = {}) => {
      const ref = F.doc(db, 'users', u.uid);
      const snap = await F.getDoc(ref);
      if (snap.exists()) return;
      await F.setDoc(ref, {
        name: extra.name || u.displayName || '',
        stageName: extra.stage || '',
        email: u.email || '',
        links: {},
        createdAt: F.serverTimestamp(),
      });
    };
    const verifyLink = { url: `${location.origin}/dashboard`, handleCodeInApp: false };

    panels.login.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!check(f)) return;
      busy(f, true, 'Logging you in…');
      try {
        await A.signInWithEmailAndPassword(auth, f.elements.email.value.trim(), f.elements.password.value);
        done();
      } catch (err) { busy(f, false, H.message(err)); }
    });

    panels.signup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!check(f)) return;
      busy(f, true, 'Creating your account…');
      try {
        const cred = await A.createUserWithEmailAndPassword(auth, f.elements.email.value.trim(), f.elements.password.value);
        await A.updateProfile(cred.user, { displayName: f.elements.name.value.trim() });
        await ensureProfile(cred.user, { name: f.elements.name.value.trim(), stage: f.elements.stage.value.trim() });
        try { await A.sendEmailVerification(cred.user, verifyLink); } catch { /* the dashboard offers to resend */ }
        done();
      } catch (err) { busy(f, false, H.message(err)); }
    });

    panels.reset.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!check(f)) return;
      busy(f, true, 'Sending…');
      try {
        await A.sendPasswordResetEmail(auth, f.elements.email.value.trim(), { url: `${location.origin}/account` });
      } catch (err) {
        if (err.code !== 'auth/user-not-found') { busy(f, false, H.message(err)); return; }
      }
      // Same answer either way, so nobody can test which emails have accounts
      busy(f, false, 'If there\'s an account for that email, a reset link is on its way. Check your inbox and spam folder.');
    });

    $('google-btn').addEventListener('click', async () => {
      const btn = $('google-btn');
      const status = panels[panels.signup.hidden ? 'login' : 'signup'].querySelector('.form-status');
      btn.disabled = true;
      status.textContent = '';
      try {
        const cred = await A.signInWithPopup(auth, new A.GoogleAuthProvider());
        await ensureProfile(cred.user);
        done();
      } catch (err) {
        btn.disabled = false;
        status.textContent = H.message(err);
      }
    });
  });
})();
