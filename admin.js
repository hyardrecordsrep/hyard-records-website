// Label-only admin: review demos, move orders along, upload finished files, edit services and prices.
// Access comes from the "admin" flag on the account, given by the claimAdmin server function to the
// emails in functions/.env (ADMIN_EMAILS). The database rules check the same flag.
(() => {
  const H = window.HyardFirebase;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;
  const pill = (t, k) => `<span class="pill mono${k ? ` pill-${k}` : ''}">${esc(t)}</span>`;
  const shortId = (id) => `HYO-${String(id).slice(0, 6).toUpperCase()}`;

  const TABS = ['a-demos', 'a-orders', 'a-services'];
  const showTab = () => {
    const name = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'a-demos';
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.id !== name; });
    document.querySelectorAll('.dash-nav [data-tab]').forEach((a) => {
      if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  };
  window.addEventListener('hashchange', showTab);

  const filterGroup = (el, onChange) => el.addEventListener('click', (e) => {
    const b = e.target.closest('.filter');
    if (!b) return;
    el.querySelectorAll('.filter').forEach((x) => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); });
    onChange(b.dataset.f);
  });

  H.ready.then(async (fb0) => {
    if (!fb0.configured) { $('adm-loading').hidden = true; $('adm-denied').hidden = false; $('adm-denied-text').textContent = 'Accounts aren\'t set up yet.'; return; }
    const { fb, user } = await H.requireUser();
    const { F, S, Fn, db, storage, functions } = fb;

    let ok = await H.isAdmin(user);
    if (!ok) {
      try {
        const res = await Fn.httpsCallable(functions, 'claimAdmin')();
        if (res.data && res.data.admin) { await user.getIdToken(true); ok = await H.isAdmin(user); }
      } catch (err) { console.warn('claimAdmin', err); }
    }
    $('adm-loading').hidden = true;
    if (!ok) { $('adm-denied').hidden = false; return; }
    $('adm').hidden = false;
    showTab();
    if (TABS.includes(location.hash.slice(1))) {
      requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, $('adm').getBoundingClientRect().top + window.scrollY - 110) }));
    }

    // ---------- Demos ----------
    let demos = [];
    let demoFilter = 'open';
    const DEMO_OPTS = ['submitted', 'listening', 'shortlisted', 'signed', 'declined'];
    const demoKind = (s) => (s === 'signed' ? 'on' : s === 'declined' ? 'off' : '');
    const renderDemos = () => {
      const list = demos.filter((d) => demoFilter === 'all' || (demoFilter === 'open' ? ['submitted', 'listening', 'shortlisted'].includes(d.status) : d.status === demoFilter));
      $('adm-demos-empty').hidden = list.length > 0;
      $('adm-demo-list').innerHTML = list.map((d) => `
        <li class="item" data-id="${esc(d.id)}">
          <div class="item-head">
            <div><h3 class="display item-title">${esc(d.title)}</h3>
            <p class="mono muted">${esc(d.artist)} · <a href="mailto:${esc(d.email)}">${esc(d.email)}</a> · ${esc(H.fmtDate(d.createdAt))}</p>
            <p class="mono muted">${esc([d.genre, d.bpm && `${d.bpm} BPM`, d.key].filter(Boolean).join(' · '))}</p></div>
            ${pill(H.DEMO_STATUS[d.status] || d.status, demoKind(d.status))}
          </div>
          ${d.message ? `<p class="item-message">${esc(d.message)}</p>` : ''}
          <ul class="item-files">
            ${(d.files || []).map((f, i) => `<li><span class="mono">${esc(f.name)}</span><span class="mono muted">${H.bytes(f.size || 0)}</span><button type="button" class="link-btn mono" data-play="${i}">Play</button><button type="button" class="link-btn mono" data-get="${i}">Download</button></li>`).join('')}
            ${d.link ? `<li><a class="mono" href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.link)}</a></li>` : ''}
          </ul>
          <div class="adm-edit">
            <label class="field"><span class="field-label mono">Status</span>
              <select data-status>${DEMO_OPTS.map((o) => `<option value="${o}"${o === d.status ? ' selected' : ''}>${esc(H.DEMO_STATUS[o])}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label mono">Note to the artist <em class="muted">They see this</em></span>
              <textarea rows="2" maxlength="2000" data-note>${esc(d.note || '')}</textarea></label>
            <div class="quick"><button type="button" class="more" data-save>Save</button><button type="button" class="link-btn mono" data-delete>Delete demo and files</button></div>
            <p class="form-status mono muted" aria-live="polite"></p>
          </div>
        </li>`).join('');
    };
    F.onSnapshot(F.query(F.collection(db, 'demos'), F.orderBy('createdAt', 'desc')), (snap) => {
      demos = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      $('adm-count-demos').textContent = demos.filter((d) => d.status === 'submitted').length || '';
      if (!document.activeElement || !document.activeElement.closest('#adm-demo-list .adm-edit')) renderDemos();
    }, (err) => { $('adm-demos-empty').hidden = false; $('adm-demos-empty').textContent = H.message(err); });
    filterGroup($('demo-filters'), (f) => { demoFilter = f; renderDemos(); });

    $('adm-demo-list').addEventListener('click', async (e) => {
      const li = e.target.closest('.item');
      if (!li) return;
      const d = demos.find((x) => x.id === li.dataset.id);
      const out = li.querySelector('.form-status');
      const play = e.target.closest('[data-play]');
      const get = e.target.closest('[data-get]');
      if (play || get) {
        const f = d.files[Number((play || get).dataset.play ?? (play || get).dataset.get)];
        try {
          const url = await S.getDownloadURL(S.ref(storage, f.path));
          if (get) { window.open(url, '_blank', 'noopener'); return; }
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = url;
          audio.setAttribute('aria-label', f.name);
          play.replaceWith(audio);
          audio.play().catch(() => {});
        } catch (err) { out.textContent = H.message(err); }
        return;
      }
      if (e.target.closest('[data-save]')) {
        try {
          await F.updateDoc(F.doc(db, 'demos', d.id), {
            status: li.querySelector('[data-status]').value,
            note: li.querySelector('[data-note]').value.trim(),
            updatedAt: F.serverTimestamp(),
          });
          document.activeElement.blur();
          renderDemos();
          const again = document.querySelector(`#adm-demo-list [data-id="${li.dataset.id}"] .form-status`);
          if (again) again.textContent = 'Saved. The artist sees the new status.';
        } catch (err) { out.textContent = H.message(err); }
      }
      if (e.target.closest('[data-delete]')) {
        if (!window.confirm(`Delete "${d.title}" and its files for good?`)) return;
        try {
          await Promise.all((d.files || []).map((f) => S.deleteObject(S.ref(storage, f.path)).catch(() => {})));
          await F.deleteDoc(F.doc(db, 'demos', d.id));
        } catch (err) { out.textContent = H.message(err); }
      }
    });

    // ---------- Orders ----------
    let orders = [];
    let orderFilter = 'open';
    const ORDER_OPTS = ['paid', 'in_progress', 'delivered'];
    const orderKind = (s) => (s === 'delivered' ? 'on' : ['payment_failed', 'cancelled', 'refunded'].includes(s) ? 'off' : '');
    const renderOrders = () => {
      const list = orders.filter((o) => {
        if (orderFilter === 'all') return true;
        if (orderFilter === 'open') return ['paid', 'in_progress'].includes(o.status);
        if (orderFilter === 'unpaid') return ['awaiting_payment', 'payment_failed', 'cancelled'].includes(o.status);
        return o.status === orderFilter;
      });
      $('adm-orders-empty').hidden = list.length > 0;
      $('adm-order-list').innerHTML = list.map((o) => {
        const editable = ORDER_OPTS.includes(o.status);
        return `
        <li class="item" data-id="${esc(o.id)}">
          <div class="item-head">
            <div><h3 class="display item-title">${esc(shortId(o.id))} · ${esc(H.euro(o.total) || '')}</h3>
            <p class="mono muted">${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : 'Account deleted'} · ${esc(H.fmtDate(o.paidAt || o.createdAt))}</p></div>
            ${pill(H.ORDER_STATUS[o.status] || o.status, orderKind(o.status))}
          </div>
          <ul class="item-lines">${(o.items || []).map((i) => `<li><span class="mono">${esc(i.label)}${i.notes ? `<br><span class="muted">${esc(i.notes)}</span>` : ''}</span><span class="mono muted">${esc(H.euro(i.amount) || '')}</span></li>`).join('')}</ul>
          ${o.brief ? `<div class="item-note"><span class="mono muted">Brief</span><p>${esc(o.brief)}</p></div>` : ''}
          ${(o.uploads || []).length ? `<h4 class="mono muted">Artist's files</h4><ul class="item-files">${o.uploads.map((f, i) => `<li><span class="mono">${esc(f.name)}</span><span class="mono muted">${H.bytes(f.size || 0)}</span><button type="button" class="link-btn mono" data-up="${i}">Download</button></li>`).join('')}</ul>` : ''}
          ${(o.deliverables || []).length ? `<h4 class="mono muted">Finished files</h4><ul class="item-files">${o.deliverables.map((f) => `<li><span class="mono">${esc(f.name)}</span><span class="mono muted">${H.bytes(f.size || 0)}</span></li>`).join('')}</ul>` : ''}
          ${o.paymentIntent ? `<p class="mono muted"><a href="https://dashboard.stripe.com/payments/${esc(o.paymentIntent)}" target="_blank" rel="noopener">Open in Stripe (refunds)</a></p>` : ''}
          ${editable ? `
          <div class="adm-edit">
            <label class="field"><span class="field-label mono">Status</span>
              <select data-status>${ORDER_OPTS.map((s) => `<option value="${s}"${s === o.status ? ' selected' : ''}>${esc(H.ORDER_STATUS[s])}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label mono">Note to the artist <em class="muted">They see this</em></span>
              <textarea rows="2" maxlength="2000" data-note>${esc(o.adminNote || '')}</textarea></label>
            <div class="quick"><button type="button" class="more" data-save>Save</button>
            <label class="more file-btn">Upload finished files<input type="file" multiple data-deliver hidden></label></div>
            <span class="drop-progress upload-bar" hidden aria-hidden="true"><span></span></span>
            <p class="form-status mono muted" aria-live="polite"></p>
          </div>` : ''}
        </li>`;
      }).join('');
    };
    F.onSnapshot(F.query(F.collection(db, 'orders'), F.orderBy('createdAt', 'desc')), (snap) => {
      orders = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      $('adm-count-orders').textContent = orders.filter((o) => o.status === 'paid').length || '';
      if (!document.activeElement || !document.activeElement.closest('#adm-order-list .adm-edit')) renderOrders();
    }, (err) => { $('adm-orders-empty').hidden = false; $('adm-orders-empty').textContent = H.message(err); });
    filterGroup($('order-filters'), (f) => { orderFilter = f; renderOrders(); });

    $('adm-order-list').addEventListener('click', async (e) => {
      const li = e.target.closest('.item');
      if (!li) return;
      const o = orders.find((x) => x.id === li.dataset.id);
      const out = li.querySelector('.form-status') || li;
      const up = e.target.closest('[data-up]');
      if (up) {
        try { window.open(await S.getDownloadURL(S.ref(storage, o.uploads[Number(up.dataset.up)].path)), '_blank', 'noopener'); } catch (err) { out.textContent = H.message(err); }
        return;
      }
      if (e.target.closest('[data-save]')) {
        try {
          await F.updateDoc(F.doc(db, 'orders', o.id), {
            status: li.querySelector('[data-status]').value,
            adminNote: li.querySelector('[data-note]').value.trim(),
            updatedAt: F.serverTimestamp(),
          });
          document.activeElement.blur();
          renderOrders();
          const again = document.querySelector(`#adm-order-list [data-id="${li.dataset.id}"] .form-status`);
          if (again) again.textContent = 'Saved. The artist sees the new status.';
        } catch (err) { out.textContent = H.message(err); }
      }
    });
    $('adm-order-list').addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-deliver]');
      if (!inp) return;
      const li = inp.closest('.item');
      const o = orders.find((x) => x.id === li.dataset.id);
      const out = li.querySelector('.form-status');
      const bar = li.querySelector('.upload-bar');
      bar.hidden = false;
      try {
        const files = [...inp.files];
        for (let i = 0; i < files.length; i += 1) {
          const f = files[i];
          out.textContent = `Uploading ${i + 1} of ${files.length}…`;
          const path = `orders/${o.uid}/${o.id}/deliverables/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
          await new Promise((resolve, reject) => {
            const task = S.uploadBytesResumable(S.ref(storage, path), f);
            task.on('state_changed', (s) => { bar.firstElementChild.style.width = `${Math.round((s.bytesTransferred / s.totalBytes) * 100)}%`; }, reject, resolve);
          });
          await F.updateDoc(F.doc(db, 'orders', o.id), { deliverables: F.arrayUnion({ name: f.name, path, size: f.size }), updatedAt: F.serverTimestamp() });
        }
        out.textContent = 'Uploaded. Set the status to Delivered when everything is there.';
      } catch (err) { out.textContent = H.message(err); }
      bar.hidden = true;
    });

    // ---------- Services and prices ----------
    const editor = $('svc-editor');
    const num = (v) => (String(v).trim() === '' ? null : Math.round(Number(String(v).replace(',', '.')) * 100) / 100);
    const pkgRow = (p) => `
      <div class="pkg-row" data-pkg>
        <label class="field"><span class="field-label mono">Package</span><input type="text" data-k="name" value="${esc(p.name || '')}" placeholder="EP"></label>
        <label class="field"><span class="field-label mono">Tracks</span><input type="text" inputmode="numeric" data-k="tracks" value="${esc(p.tracks ?? '')}"></label>
        <label class="field"><span class="field-label mono">Price €</span><input type="text" inputmode="decimal" data-k="price" value="${esc(p.price ?? '')}" placeholder="empty = coming soon"></label>
        <input type="hidden" data-k="id" value="${esc(p.id || '')}">
        <button type="button" class="link-btn mono" data-rm-pkg>Remove</button>
      </div>`;
    const svcForm = (s) => `
      <form class="form svc-edit" data-id="${esc(s.id)}" novalidate>
        <fieldset>
          <legend class="mono muted">${esc(s.name)} <span class="muted">(${esc(s.id)})</span></legend>
          <div class="field-row">
            <label class="field"><span class="field-label mono">Name</span><input type="text" name="name" value="${esc(s.name)}" required></label>
            <label class="field"><span class="field-label mono">Price per track €</span><input type="text" inputmode="decimal" name="pricePerTrack" value="${esc(s.pricePerTrack ?? '')}" placeholder="empty = coming soon"></label>
          </div>
          <label class="field"><span class="field-label mono">Summary</span><textarea name="summary" rows="2">${esc(s.summary || '')}</textarea></label>
          <label class="field"><span class="field-label mono">What's included <em class="muted">One per line</em></span><textarea name="includes" rows="4">${esc((s.includes || []).join('\n'))}</textarea></label>
          <div class="field-row field-row-3">
            <label class="field"><span class="field-label mono">Turnaround</span><input type="text" name="turnaround" value="${esc(s.turnaround || '')}"></label>
            <label class="field"><span class="field-label mono">Revisions</span><input type="text" name="revisions" value="${esc(s.revisions || '')}"></label>
            <label class="field"><span class="field-label mono">Order on page</span><input type="text" inputmode="numeric" name="order" value="${esc(s.order ?? '')}"></label>
          </div>
          <div class="pkg-list">${(s.packages || []).map(pkgRow).join('')}</div>
          <button type="button" class="link-btn mono" data-add-pkg>Add a package</button>
          <label class="check"><input type="checkbox" name="active"${s.active !== false ? ' checked' : ''}><span class="check-box" aria-hidden="true"></span><span class="mono">Show this service</span></label>
        </fieldset>
        <div class="quick"><button class="more" type="submit">Save ${esc(s.name)}</button></div>
        <p class="form-status mono muted" aria-live="polite"></p>
      </form>`;
    const loadServices = async () => {
      const snap = await F.getDocs(F.collection(db, 'services'));
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.order || 0) - (b.order || 0));
      $('svc-seed').hidden = list.length > 0;
      editor.innerHTML = list.map(svcForm).join('');
    };
    loadServices().catch((err) => { $('svc-editor-status').textContent = H.message(err); });

    $('svc-seed-btn').addEventListener('click', async () => {
      try {
        const d = await fetch('data/services.json', { cache: 'no-cache' }).then((r) => r.json());
        await Promise.all(d.services.map(({ id, ...rest }) => F.setDoc(F.doc(db, 'services', id), { ...rest, updatedAt: F.serverTimestamp() })));
        await loadServices();
        $('svc-editor-status').textContent = 'Default services loaded. Add prices to open bookings.';
      } catch (err) { $('svc-editor-status').textContent = H.message(err); }
    });
    editor.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-pkg]')) {
        e.target.closest('form').querySelector('.pkg-list').insertAdjacentHTML('beforeend', pkgRow({}));
      }
      if (e.target.closest('[data-rm-pkg]')) e.target.closest('[data-pkg]').remove();
    });
    editor.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const el = f.elements;
      const out = f.querySelector('.form-status');
      const per = num(el.pricePerTrack.value);
      if (per !== null && !(per > 0)) { out.textContent = 'The per-track price must be a number, like 49 or 49.50.'; return; }
      const packages = [...f.querySelectorAll('[data-pkg]')].map((row) => {
        const v = (k) => row.querySelector(`[data-k="${k}"]`).value.trim();
        const name = v('name');
        return { id: v('id') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `pkg-${Date.now()}`, name, tracks: Math.max(1, Number(v('tracks')) || 1), price: num(v('price')) };
      }).filter((p) => p.name);
      if (packages.some((p) => p.price !== null && !(p.price > 0))) { out.textContent = 'Package prices must be numbers, like 199.'; return; }
      try {
        await F.setDoc(F.doc(db, 'services', f.dataset.id), {
          name: el.name.value.trim(),
          summary: el.summary.value.trim(),
          includes: el.includes.value.split('\n').map((x) => x.trim()).filter(Boolean),
          turnaround: el.turnaround.value.trim(),
          revisions: el.revisions.value.trim(),
          order: Number(el.order.value) || 0,
          pricePerTrack: per,
          packages,
          active: el.active.checked,
          updatedAt: F.serverTimestamp(),
        });
        out.textContent = 'Saved. It shows on the site straight away.';
      } catch (err) { out.textContent = H.message(err); }
    });
  });
})();
