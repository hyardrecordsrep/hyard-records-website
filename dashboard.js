// Artist dashboard: overview, demo submission, demo status, services, orders, profile and security
(() => {
  const H = window.HyardFirebase;
  const SV = window.HyardServices;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const URLISH = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i;
  const MAX_FILES = 3;
  const MAX_BYTES = 200 * 1024 * 1024;
  const AUDIO = /\.(mp3|wav)$/i;

  // ---------- Small form helpers ----------
  const setError = (input, msg) => {
    const field = input.closest('.field');
    const out = field ? field.querySelector('.field-error') : input.form && input.form.querySelector(`[data-for="${input.name}"]`);
    if (field) field.classList.toggle('has-error', !!msg);
    if (out) out.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  const status = (form, text) => { const s = form.querySelector('.form-status'); if (s) s.textContent = text || ''; };
  const busy = (form, on) => {
    const b = form.querySelector('[type=submit]');
    if (b) { b.disabled = on; b.classList.toggle('is-sending', on); }
  };
  document.addEventListener('input', (e) => { if (e.target.matches('.dash input, .dash textarea')) setError(e.target, ''); });

  // ---------- Tabs (the address hash picks the section) ----------
  const TABS = ['overview', 'submit', 'demos', 'services', 'orders', 'profile', 'security'];
  const showTab = (focus) => {
    const name = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.id !== name; });
    document.querySelectorAll('.dash-nav [data-tab]').forEach((a) => {
      if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const panel = $(name);
    if (focus && panel) {
      const h = panel.querySelector('.dash-h');
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
      const top = document.querySelector('.dash').getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
    }
  };
  window.addEventListener('hashchange', () => showTab(true));

  const pill = (text, kind) => `<span class="pill mono${kind ? ` pill-${kind}` : ''}">${esc(text)}</span>`;
  const shortId = (id) => `HYO-${String(id).slice(0, 6).toUpperCase()}`;

  H.ready.then(async (fb0) => {
    $('dash-loading').hidden = true;
    if (!fb0.configured) { $('dash-off').hidden = false; return; }
    const { fb, user } = await H.requireUser();
    const { A, F, S, db, auth, storage } = fb;
    const uid = user.uid;

    // The label account doesn't use the artist dashboard: it only has the admin page
    if (await H.isAdmin(user)) { H.setAdminHint(true); location.replace('admin'); return; }
    $('dash').hidden = false;
    showTab(false);
    // Opened on a section (dashboard#services): line up the dashboard below the header
    if (TABS.includes(location.hash.slice(1))) {
      requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, $('dash').getBoundingClientRect().top + window.scrollY - 110) }));
    }
    const first = (user.displayName || '').split(' ')[0];
    $('dash-hello').textContent = first ? `Hi, ${first}` : 'Dashboard';
    $('dash-kicker').textContent = `Artist dashboard · ${user.email}`;
    if (window.hyardObserve) window.hyardObserve();

    // ---------- Email confirmation ----------
    const needsVerify = () => !user.emailVerified;
    const refreshVerify = () => {
      $('verify-banner').hidden = !needsVerify();
      $('verify-email').textContent = user.email;
    };
    refreshVerify();
    user.getIdTokenResult().then((t) => { if (user.emailVerified && t.claims.email_verified !== true) user.getIdToken(true); }).catch(() => {});
    $('verify-resend').addEventListener('click', async () => {
      try {
        await A.sendEmailVerification(user, { url: `${location.origin}/dashboard` });
        $('verify-status').textContent = 'Sent. Check your inbox and spam folder.';
      } catch (err) { $('verify-status').textContent = H.message(err); }
    });
    $('verify-check').addEventListener('click', async () => {
      await user.reload();
      if (user.emailVerified) {
        await user.getIdToken(true); // the database rules read the fresh "confirmed" flag from the token
        refreshVerify();
      } else {
        $('verify-status').textContent = 'Not confirmed yet. Open the link in the email first.';
      }
    });

    // ---------- Log out ----------
    const logout = async () => { await A.signOut(auth); location.replace('./'); };
    $('logout').addEventListener('click', logout);
    $('logout-2').addEventListener('click', logout);

    // ---------- Profile ----------
    const pf = $('profile-form');
    const userRef = F.doc(db, 'users', uid);
    F.getDoc(userRef).then((snap) => {
      const d = snap.exists() ? snap.data() : {};
      const links = d.links || {};
      pf.elements.name.value = d.name || user.displayName || '';
      pf.elements.stageName.value = d.stageName || '';
      pf.elements.phone.value = d.phone || '';
      pf.elements.country.value = d.country || '';
      ['spotify', 'soundcloud', 'instagram', 'youtube'].forEach((k) => { pf.elements[k].value = links[k] || ''; });
      const artist = $('demo-form').elements.artist;
      if (!artist.value) artist.value = d.stageName || d.name || user.displayName || '';
    }).catch(() => {});
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      let bad = null;
      ['spotify', 'soundcloud', 'instagram', 'youtube'].forEach((k) => {
        const i = pf.elements[k];
        const v = i.value.trim();
        const msg = v && !URLISH.test(v) ? 'Paste the full link, starting with https://' : '';
        setError(i, msg);
        if (msg && !bad) bad = i;
      });
      if (bad) { bad.focus(); return; }
      busy(pf, true);
      status(pf, 'Saving…');
      try {
        const name = pf.elements.name.value.trim();
        await F.setDoc(userRef, {
          name,
          stageName: pf.elements.stageName.value.trim(),
          phone: pf.elements.phone.value.trim(),
          country: pf.elements.country.value.trim(),
          email: user.email,
          links: Object.fromEntries(['spotify', 'soundcloud', 'instagram', 'youtube'].map((k) => [k, pf.elements[k].value.trim()])),
          updatedAt: F.serverTimestamp(),
        }, { merge: true });
        if (name && name !== user.displayName) await A.updateProfile(user, { displayName: name });
        status(pf, 'Saved.');
      } catch (err) { status(pf, H.message(err)); }
      busy(pf, false);
    });

    // ---------- Submit a demo ----------
    const df = $('demo-form');
    const input = $('demo-files');
    const drop = $('drop');
    let files = [];
    const renderFiles = () => {
      $('file-list').innerHTML = files.map((f, i) => `
        <li><span class="mono">${esc(f.name)}</span><span class="mono muted">${H.bytes(f.size)}</span>
        <button type="button" class="drop-clear mono" data-remove="${i}" aria-label="Remove ${esc(f.name)}">Remove</button></li>`).join('');
      drop.classList.toggle('has-file', files.length > 0);
    };
    const addFiles = (list) => {
      const err = $('files-error');
      err.textContent = '';
      [...list].forEach((f) => {
        if (!AUDIO.test(f.name)) { err.textContent = `${f.name} isn't an MP3 or WAV.`; return; }
        if (f.size > MAX_BYTES) { err.textContent = `${f.name} is over 200 MB. Send a link for it instead.`; return; }
        if (files.length >= MAX_FILES) { err.textContent = 'Up to 3 tracks per demo.'; return; }
        if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
      });
      renderFiles();
      $('music-hint').classList.remove('is-error');
    };
    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    $('file-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (!b) return;
      files.splice(Number(b.dataset.remove), 1);
      renderFiles();
    });

    const safeName = (n) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);
    df.addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = df.elements;
      let bad = null;
      const need = (i, msg) => { setError(i, msg); if (msg && !bad) bad = i; };
      need(el.title, el.title.value.trim() ? '' : 'Give your demo a title.');
      need(el.artist, el.artist.value.trim() ? '' : 'Add your artist name.');
      need(el.bpm, !el.bpm.value.trim() || /^\d{2,3}(\.\d)?$/.test(el.bpm.value.trim()) ? '' : 'Use a number, like 140.');
      need(el.link, !el.link.value.trim() || URLISH.test(el.link.value.trim()) ? '' : 'Paste the full link, starting with https://');
      need(el.rights, el.rights.checked ? '' : 'Please confirm before sending.');
      const hasMusic = files.length > 0 || el.link.value.trim();
      $('music-hint').classList.toggle('is-error', !hasMusic);
      if (!hasMusic && !bad) bad = input;
      if (bad) { bad.focus(); return; }
      // The upload rules read "email confirmed" from the login token, so make sure it's fresh
      await user.reload().catch(() => {});
      refreshVerify();
      if (needsVerify()) { status(df, 'Confirm your email first (see the message at the top).'); $('verify-banner').scrollIntoView({ behavior: 'smooth' }); return; }
      await user.getIdToken(true).catch(() => {});

      busy(df, true);
      const bar = $('upload-bar');
      const ref = F.doc(F.collection(db, 'demos'));
      const uploaded = [];
      try {
        const total = files.reduce((n, f) => n + f.size, 0) || 1;
        const done = new Array(files.length).fill(0);
        bar.hidden = files.length === 0;
        for (let i = 0; i < files.length; i += 1) {
          const f = files[i];
          const path = `demos/${uid}/${ref.id}/${i + 1}-${safeName(f.name)}`;
          status(df, `Uploading ${i + 1} of ${files.length}…`);
          await new Promise((resolve, reject) => {
            const task = S.uploadBytesResumable(S.ref(storage, path), f, { contentType: f.type || (/\.wav$/i.test(f.name) ? 'audio/wav' : 'audio/mpeg') });
            task.on('state_changed', (snap) => {
              done[i] = snap.bytesTransferred;
              const pct = Math.round((done.reduce((a, b) => a + b, 0) / total) * 100);
              bar.firstElementChild.style.width = `${pct}%`;
            }, reject, resolve);
          });
          uploaded.push({ name: f.name, path, size: f.size, type: f.type || '' });
        }
        status(df, 'Saving…');
        await F.setDoc(ref, {
          uid,
          email: user.email,
          title: el.title.value.trim(),
          artist: el.artist.value.trim(),
          genre: el.genre.value.trim(),
          bpm: el.bpm.value.trim(),
          key: el.key.value.trim(),
          link: el.link.value.trim(),
          message: el.message.value.trim(),
          files: uploaded,
          status: 'submitted',
          note: '',
          createdAt: F.serverTimestamp(),
          updatedAt: F.serverTimestamp(),
        });
        const artistName = el.artist.value;
        df.reset();
        el.artist.value = artistName; // keep the artist name for the next demo
        files = [];
        renderFiles();
        status(df, '');
        df.hidden = true;
        $('demo-sent').hidden = false;
        $('demo-sent').querySelector('a').focus();
      } catch (err) {
        // Don't leave orphan files behind if the demo couldn't be saved
        uploaded.forEach((u) => S.deleteObject(S.ref(storage, u.path)).catch(() => {}));
        console.error('Demo upload failed', err.code, err.message);
        status(df, H.message(err));
      }
      bar.hidden = true;
      bar.firstElementChild.style.width = '0';
      busy(df, false);
    });
    $('demo-another').addEventListener('click', () => {
      $('demo-sent').hidden = true;
      df.hidden = false;
      df.elements.title.focus();
    });

    // ---------- My demos ----------
    const STEPS = ['submitted', 'listening', 'shortlisted', 'decision'];
    const STEP_NAMES = { submitted: 'Received', listening: 'Listening', shortlisted: 'Shortlisted', decision: 'Decision' };
    const stepOf = (s) => (s === 'declined' || s === 'signed' ? 3 : Math.max(0, STEPS.indexOf(s)));
    const demoItem = (d) => {
      const at = stepOf(d.status);
      const kind = d.status === 'signed' ? 'on' : d.status === 'declined' ? 'off' : '';
      return `
        <li class="item" data-id="${esc(d.id)}">
          <div class="item-head">
            <div><h3 class="display item-title">${esc(d.title)}</h3>
            <p class="mono muted">${esc(d.artist)} · Sent ${esc(H.fmtDate(d.createdAt) || 'just now')}</p></div>
            ${pill(H.DEMO_STATUS[d.status] || d.status, kind)}
          </div>
          <ol class="steps" aria-label="Demo progress">
            ${STEPS.map((s, i) => `<li class="${i < at ? 'is-done' : i === at ? 'is-now' : ''}"${i === at ? ' aria-current="step"' : ''}><span class="mono">${esc(i === 3 && (d.status === 'signed' || d.status === 'declined') ? H.DEMO_STATUS[d.status] : STEP_NAMES[s])}</span></li>`).join('')}
          </ol>
          ${d.note ? `<div class="item-note"><span class="mono muted">Note from the label</span><p>${esc(d.note)}</p></div>` : ''}
          <ul class="item-files">
            ${(d.files || []).map((f, i) => `<li><span class="mono">${esc(f.name)}</span><span class="mono muted">${H.bytes(f.size || 0)}</span><button type="button" class="link-btn mono" data-play="${i}">Play</button></li>`).join('')}
            ${d.link ? `<li><a class="mono" href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.link)}</a></li>` : ''}
          </ul>
          ${d.status === 'submitted' ? '<button type="button" class="link-btn mono item-action" data-withdraw>Withdraw this demo</button>' : ''}
        </li>`;
    };
    let demos = [];
    F.onSnapshot(F.query(F.collection(db, 'demos'), F.where('uid', '==', uid)), (snap) => {
      demos = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (b.createdAt?.seconds || Infinity) - (a.createdAt?.seconds || Infinity));
      $('demo-list').innerHTML = demos.map(demoItem).join('');
      $('demos-empty').hidden = demos.length > 0;
      $('count-demos').textContent = demos.length || '';
      $('stat-demos').textContent = String(demos.length);
      $('stat-demo-last').textContent = demos[0] ? `${demos[0].title} · ${H.DEMO_STATUS[demos[0].status] || ''}` : 'No demos yet';
    }, (err) => { $('demos-empty').hidden = false; $('demos-empty').textContent = H.message(err); });

    $('demo-list').addEventListener('click', async (e) => {
      const li = e.target.closest('.item');
      if (!li) return;
      const d = demos.find((x) => x.id === li.dataset.id);
      const play = e.target.closest('[data-play]');
      if (play) {
        const f = d.files[Number(play.dataset.play)];
        play.disabled = true;
        try {
          const url = await S.getDownloadURL(S.ref(storage, f.path));
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = url;
          audio.setAttribute('aria-label', f.name);
          play.replaceWith(audio);
          audio.play().catch(() => {});
        } catch (err) { play.disabled = false; play.textContent = H.message(err); }
        return;
      }
      if (e.target.closest('[data-withdraw]')) {
        if (!window.confirm(`Withdraw "${d.title}"? Its files will be deleted.`)) return;
        try {
          await F.deleteDoc(F.doc(db, 'demos', d.id));
          (d.files || []).forEach((f) => S.deleteObject(S.ref(storage, f.path)).catch(() => {}));
        } catch (err) { window.alert(H.message(err)); }
      }
    });

    // ---------- Services ----------
    const grid = $('svc-grid');
    let services = [];
    const optionPrice = (svc, opt, tracks) => SV.linePrice(svc, { option: opt, tracks });
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
          <button type="button" class="news-btn display svc-add">Add to cart <svg aria-hidden="true"><use href="#i-arrow"/></svg></button>
        </div>
      </article>`;
    };
    const updateCard = (card) => {
      const s = services.find((x) => x.id === card.dataset.svc);
      const opt = card.querySelector('input[type=radio]:checked').value;
      const tracksBox = card.querySelector('.svc-tracks');
      tracksBox.hidden = opt !== 'track';
      const n = Math.min(30, Math.max(1, Number(tracksBox.querySelector('input').value) || 1));
      const price = optionPrice(s, opt, n);
      card.querySelector('.svc-total').textContent = price == null ? 'Price coming soon' : H.euro(price);
      const add = card.querySelector('.svc-add');
      add.disabled = price == null;
      add.title = price == null ? 'Bookings open once prices are set' : '';
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
      if (!btn) return;
      const card = btn.closest('.svc');
      const opt = card.querySelector('input[type=radio]:checked').value;
      const tracks = Number(card.querySelector('.svc-tracks input').value) || 1;
      btn.disabled = true;
      try {
        const items = await SV.addToCart(fb, uid, { serviceId: card.dataset.svc, option: opt, tracks });
        $('stat-cart').textContent = String(items.length);
        $('svc-status').innerHTML = `Added to your cart. <a href="cart">Go to cart (${items.length})</a>`;
      } catch (err) { $('svc-status').textContent = err.code === 'cart/full' ? err.message : H.message(err); }
      btn.disabled = false;
    });
    SV.getCart(fb, uid).then((items) => { $('stat-cart').textContent = String(items.length); }).catch(() => {});

    // ---------- Orders ----------
    const OPEN = ['awaiting_payment', 'paid', 'in_progress'];
    const orderKind = (s) => (s === 'delivered' ? 'on' : ['payment_failed', 'cancelled', 'refunded'].includes(s) ? 'off' : '');
    const orderItem = (o) => {
      const working = ['paid', 'in_progress', 'delivered'].includes(o.status) && !o.filesDeletedAt;
      return `
      <li class="item" data-id="${esc(o.id)}">
        <div class="item-head">
          <div><h3 class="display item-title">Order ${esc(shortId(o.id))}</h3>
          <p class="mono muted">${esc(H.fmtDate(o.createdAt) || 'just now')} · ${esc(H.euro(o.total) || '')}</p></div>
          ${pill(H.ORDER_STATUS[o.status] || o.status, orderKind(o.status))}
        </div>
        <ul class="item-lines">${(o.items || []).map((i) => `<li><span class="mono">${esc(i.label)}</span><span class="mono muted">${esc(H.euro(i.amount) || '')}</span></li>`).join('')}</ul>
        ${o.status === 'awaiting_payment' && o.checkoutUrl && o.expiresAt && o.expiresAt.seconds * 1000 > Date.now()
          ? `<a class="more" href="${esc(o.checkoutUrl)}">Finish payment</a>` : ''}
        ${o.filesDeletedAt ? `<p class="mono muted">Order closed. Files deleted ${esc(H.fmtDate(o.filesDeletedAt))}.</p>` : ''}
        ${o.adminNote ? `<div class="item-note"><span class="mono muted">Note from the label</span><p>${esc(o.adminNote)}</p></div>` : ''}
        ${working ? `
        <div class="order-work">
          <label class="field"><span class="field-label mono">Brief <em class="muted">References, what you want, deadlines</em></span>
            <textarea rows="4" maxlength="5000" data-brief>${esc(o.brief || '')}</textarea></label>
          <div class="quick"><button type="button" class="more" data-save-brief>Save brief</button>
          <label class="more file-btn">Upload stems or files<input type="file" multiple data-upload hidden></label></div>
          <span class="drop-progress upload-bar" hidden aria-hidden="true"><span></span></span>
          <p class="form-status mono muted" aria-live="polite"></p>
          ${(o.uploads || []).length ? `<h4 class="mono muted">Your files</h4><ul class="item-files">${o.uploads.map((f) => `<li><span class="mono">${esc(f.name)}</span><span class="mono muted">${H.bytes(f.size || 0)}</span></li>`).join('')}</ul>` : ''}
          ${(o.deliverables || []).length ? `<h4 class="mono muted">Finished files</h4><p class="mono muted">Download them now: files are deleted when the order is closed.</p><ul class="item-files">${o.deliverables.map((f, i) => `<li><span class="mono">${esc(f.name)}</span><span class="mono muted">${H.bytes(f.size || 0)}</span><button type="button" class="link-btn mono" data-download="${i}">Download</button></li>`).join('')}</ul>` : ''}
        </div>` : ''}
      </li>`;
    };
    let orders = [];
    F.onSnapshot(F.query(F.collection(db, 'orders'), F.where('uid', '==', uid)), (snap) => {
      orders = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        .filter((o) => !(o.status === 'cancelled' && !o.paidAt)) // left the payment page: nothing to show
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      // Don't redraw while someone is typing a brief
      if (document.activeElement && document.activeElement.matches('[data-brief]')) return;
      $('order-list').innerHTML = orders.map(orderItem).join('');
      $('orders-empty').hidden = orders.length > 0;
      const open = orders.filter((o) => OPEN.includes(o.status) && o.status !== 'awaiting_payment');
      $('count-orders').textContent = open.length || '';
      $('stat-orders').textContent = String(open.length);
      $('stat-order-last').textContent = orders[0] ? `${shortId(orders[0].id)} · ${H.ORDER_STATUS[orders[0].status] || ''}` : 'No orders yet';
    }, (err) => { $('orders-empty').hidden = false; $('orders-empty').textContent = H.message(err); });

    $('order-list').addEventListener('click', async (e) => {
      const li = e.target.closest('.item');
      if (!li) return;
      const o = orders.find((x) => x.id === li.dataset.id);
      const out = li.querySelector('.form-status');
      if (e.target.closest('[data-save-brief]')) {
        try {
          await F.updateDoc(F.doc(db, 'orders', o.id), { brief: li.querySelector('[data-brief]').value.trim(), updatedAt: F.serverTimestamp() });
          out.textContent = 'Brief saved.';
        } catch (err) { out.textContent = H.message(err); }
      }
      const dl = e.target.closest('[data-download]');
      if (dl) {
        try {
          const f = o.deliverables[Number(dl.dataset.download)];
          window.open(await S.getDownloadURL(S.ref(storage, f.path)), '_blank', 'noopener');
        } catch (err) { out.textContent = H.message(err); }
      }
    });
    $('order-list').addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-upload]');
      if (!inp) return;
      const li = inp.closest('.item');
      const o = orders.find((x) => x.id === li.dataset.id);
      const out = li.querySelector('.form-status');
      const bar = li.querySelector('.upload-bar');
      const list = [...inp.files];
      if (list.some((f) => f.size > 2 * 1024 * 1024 * 1024)) { out.textContent = 'Files must be under 2 GB each. Zip your stems or send a link in the brief.'; return; }
      bar.hidden = false;
      try {
        for (let i = 0; i < list.length; i += 1) {
          const f = list[i];
          out.textContent = `Uploading ${i + 1} of ${list.length}…`;
          const path = `orders/${uid}/${o.id}/uploads/${Date.now()}-${safeName(f.name)}`;
          await new Promise((resolve, reject) => {
            const task = S.uploadBytesResumable(S.ref(storage, path), f);
            task.on('state_changed', (s) => { bar.firstElementChild.style.width = `${Math.round((s.bytesTransferred / s.totalBytes) * 100)}%`; }, reject, resolve);
          });
          await F.updateDoc(F.doc(db, 'orders', o.id), { uploads: F.arrayUnion({ name: f.name, path, size: f.size }), updatedAt: F.serverTimestamp() });
        }
        out.textContent = 'Uploaded.';
      } catch (err) { out.textContent = H.message(err); }
      bar.hidden = true;
    });

    // ---------- Security ----------
    const usesPassword = user.providerData.some((p) => p.providerId === 'password');
    $('sec-email').textContent = user.email;
    if (!usesPassword) {
      document.querySelectorAll('[data-password-only]').forEach((el) => { el.hidden = true; });
      $('sec-provider').textContent = 'You log in with Google, so your password and email are managed in your Google account.';
    }
    const reauth = async (password) => {
      try {
        if (usesPassword) return await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, password));
        return await A.reauthenticateWithPopup(user, new A.GoogleAuthProvider());
      } catch (err) {
        if (['auth/invalid-credential', 'auth/wrong-password'].includes(err.code)) {
          throw Object.assign(new Error('wrong password'), { code: 'hyard/wrong-current-password' });
        }
        throw err;
      }
    };

    const pw = $('pw-form');
    pw.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { current, next } = pw.elements;
      setError(current, current.value ? '' : 'Enter your current password.');
      setError(next, next.value.length >= 8 ? '' : 'Use at least 8 characters for your password.');
      if (!current.value || next.value.length < 8) return;
      busy(pw, true);
      status(pw, 'Changing…');
      try {
        await reauth(current.value);
        await A.updatePassword(user, next.value);
        pw.reset();
        status(pw, 'Password changed.');
      } catch (err) { status(pw, H.message(err)); }
      busy(pw, false);
    });

    const em = $('email-form');
    em.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { email, current } = em.elements;
      const v = email.value.trim();
      setError(email, EMAIL.test(v) ? '' : 'Enter an email like you@gmail.com.');
      setError(current, current.value ? '' : 'Enter your current password.');
      if (!EMAIL.test(v) || !current.value) return;
      busy(em, true);
      try {
        await reauth(current.value);
        await A.verifyBeforeUpdateEmail(user, v, { url: `${location.origin}/dashboard` });
        em.reset();
        status(em, `We sent a link to ${v}. Your email changes once you open it.`);
      } catch (err) { status(em, H.message(err)); }
      busy(em, false);
    });

    const del = $('delete-form');
    del.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { confirm, current } = del.elements;
      if (confirm.value.trim() !== 'DELETE') { setError(confirm, 'Type DELETE in capitals to confirm.'); confirm.focus(); return; }
      if (usesPassword && !current.value) { setError(current, 'Enter your current password.'); current.focus(); return; }
      busy(del, true);
      status(del, 'Deleting your account…');
      try {
        await reauth(current.value);
        await A.deleteUser(user); // the server then removes the profile, demos and files
        H.setCartHint(0);
        location.replace('./');
      } catch (err) { status(del, H.message(err)); busy(del, false); }
    });
  });
})();
