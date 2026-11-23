// Label-only admin: sales overview, review demos, move orders along, upload finished files, edit services,
// products and prices, add events and write news posts.
// Access comes from the "admin" flag on the account, given by the claimAdmin server function to the
// emails in functions/.env (ADMIN_EMAILS). The database rules check the same flag.
(() => {
  const H = window.HyardFirebase;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;
  const pill = (t, k) => `<span class="pill mono${k ? ` pill-${k}` : ''}">${esc(t)}</span>`;
  const shortId = (id) => `HYO-${String(id).slice(0, 6).toUpperCase()}`;

  const TABS = ['a-overview', 'a-demos', 'a-orders', 'a-services', 'a-products', 'a-events', 'a-news'];
  const showTab = () => {
    const name = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'a-overview';
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
    const { A, F, S, Fn, db, storage, functions, auth } = fb;
    $('adm-logout').addEventListener('click', async () => { await A.signOut(auth); location.replace('./'); });

    let ok = await H.isAdmin(user);
    if (!ok) {
      try {
        const res = await Fn.httpsCallable(functions, 'claimAdmin')();
        if (res.data && res.data.admin) { await user.getIdToken(true); ok = await H.isAdmin(user); }
      } catch (err) { console.warn('claimAdmin', err); }
    }
    $('adm-loading').hidden = true;
    H.setAdminHint(ok);
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
          ${o.filesDeletedAt ? `<p class="mono muted">Files deleted ${esc(H.fmtDate(o.filesDeletedAt))}</p>` : ''}
          ${o.paymentIntent ? `<p class="mono muted"><a href="https://dashboard.stripe.com/payments/${esc(o.paymentIntent)}" target="_blank" rel="noopener">Open in Stripe (refunds)</a></p>` : ''}
          ${editable ? `
          <div class="adm-edit">
            <label class="field"><span class="field-label mono">Status</span>
              <select data-status>${ORDER_OPTS.map((s) => `<option value="${s}"${s === o.status ? ' selected' : ''}>${esc(H.ORDER_STATUS[s])}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label mono">Note to the artist <em class="muted">They see this</em></span>
              <textarea rows="2" maxlength="2000" data-note>${esc(o.adminNote || '')}</textarea></label>
            <div class="quick"><button type="button" class="more" data-save>Save</button>
            <label class="more file-btn">Upload finished files<input type="file" multiple data-deliver hidden></label>
            ${o.status === 'delivered' && ((o.uploads || []).length || (o.deliverables || []).length) ? '<button type="button" class="link-btn mono" data-wipe>Close order and delete files</button>' : ''}</div>
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
      if (e.target.closest('[data-wipe]')) {
        if (!window.confirm(`Close ${shortId(o.id)} and delete all its files for good? The artist can't download them after this.`)) return;
        try {
          const paths = [...(o.uploads || []), ...(o.deliverables || [])].map((f) => f.path);
          await Promise.all(paths.map((p) => S.deleteObject(S.ref(storage, p)).catch(() => {})));
          await F.updateDoc(F.doc(db, 'orders', o.id), { uploads: [], deliverables: [], filesDeletedAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
        } catch (err) { out.textContent = H.message(err); }
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
    // The services show as cards, like artists see them. Click one to edit it, or add a new one.
    const svcGrid = $('svc-grid');
    const editor = $('svc-editor');
    const svcStatus = $('svc-editor-status');
    let services = [];
    const num = (v) => (String(v).trim() === '' ? null : Math.round(Number(String(v).replace(',', '.')) * 100) / 100);
    const priced = (v) => (v !== null && v !== undefined && v !== '' && Number(v) > 0 ? H.euro(v) : 'Price coming soon');
    const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const pkgRow = (p) => `
      <div class="pkg-row" data-pkg>
        <label class="field"><span class="field-label mono">Package</span><input type="text" data-k="name" value="${esc(p.name || '')}" placeholder="EP"></label>
        <label class="field"><span class="field-label mono">Tracks</span><input type="text" inputmode="numeric" data-k="tracks" value="${esc(p.tracks ?? '')}"></label>
        <label class="field"><span class="field-label mono">Price €</span><input type="text" inputmode="decimal" data-k="price" value="${esc(p.price ?? '')}" placeholder="empty = coming soon"></label>
        <input type="hidden" data-k="id" value="${esc(p.id || '')}">
        <button type="button" class="link-btn mono" data-rm-pkg>Remove</button>
      </div>`;
    const svcCard = (s) => `
      <article class="svc svc-admin${s.active === false ? ' is-off' : ''}" data-svc="${esc(s.id)}" tabindex="0" role="button" aria-label="Edit ${esc(s.name)}">
        <div class="svc-admin-head">
          <h3 class="display svc-name">${esc(s.name)}</h3>
          ${s.active === false ? pill('Hidden', 'off') : ''}
        </div>
        <p class="svc-summary">${esc(s.summary || '')}</p>
        <ul class="svc-includes">${(s.includes || []).map((x) => `<li class="mono">${esc(x)}</li>`).join('')}</ul>
        <p class="mono muted svc-meta">${esc([s.turnaround, s.revisions].filter(Boolean).join(' · '))}</p>
        <ul class="svc-prices">
          <li><span class="mono">Per track</span><span class="mono muted">${esc(priced(s.pricePerTrack))}</span></li>
          ${(s.packages || []).map((p) => `<li><span class="mono">${esc(p.name)} package · ${esc(p.tracks)} tracks</span><span class="mono muted">${esc(priced(p.price))}</span></li>`).join('')}
        </ul>
        <span class="mono svc-admin-edit">Edit <svg aria-hidden="true"><use href="#i-arrow"/></svg></span>
      </article>`;
    const addCard = '<button type="button" class="svc svc-new" data-new-svc><span class="display">+</span><span class="mono">Add a service</span></button>';
    const svcForm = (s, isNew) => `
      <form class="form svc-edit" data-id="${esc(s.id || '')}" novalidate>
        <button type="button" class="link-btn mono svc-back" data-back>← All services</button>
        <fieldset>
          <legend class="display svc-edit-title">${isNew ? 'New service' : esc(s.name)}</legend>
          <div class="field-row">
            <label class="field"><span class="field-label mono">Name</span><input type="text" name="name" value="${esc(s.name || '')}" required maxlength="80"></label>
            <label class="field"><span class="field-label mono">Price per track €</span><input type="text" inputmode="decimal" name="pricePerTrack" value="${esc(s.pricePerTrack ?? '')}" placeholder="empty = coming soon"></label>
          </div>
          <label class="field"><span class="field-label mono">Summary</span><textarea name="summary" rows="2">${esc(s.summary || '')}</textarea></label>
          <label class="field"><span class="field-label mono">What's included <em class="muted">One per line</em></span><textarea name="includes" rows="4">${esc((s.includes || []).join('\n'))}</textarea></label>
          <div class="field-row field-row-3">
            <label class="field"><span class="field-label mono">Turnaround</span><input type="text" name="turnaround" value="${esc(s.turnaround ?? (isNew ? '1 week per track' : ''))}"></label>
            <label class="field"><span class="field-label mono">Revisions</span><input type="text" name="revisions" value="${esc(s.revisions || '')}"></label>
            <label class="field"><span class="field-label mono">Order on page</span><input type="text" inputmode="numeric" name="order" value="${esc(s.order ?? '')}"></label>
          </div>
          <div class="pkg-list">${(s.packages || []).map(pkgRow).join('')}</div>
          <button type="button" class="link-btn mono" data-add-pkg>Add a package</button>
          <label class="check"><input type="checkbox" name="active"${s.active !== false ? ' checked' : ''}><span class="check-box" aria-hidden="true"></span><span class="mono">Show this service</span></label>
        </fieldset>
        <div class="quick">
          <button class="more" type="submit">${isNew ? 'Add service' : 'Save changes'}</button>
          <button type="button" class="link-btn mono" data-back>Cancel</button>
          ${isNew ? '' : '<button type="button" class="link-btn mono" data-delete-svc>Delete service</button>'}
        </div>
        <p class="form-status mono muted" aria-live="polite"></p>
      </form>`;
    const showSvcGrid = (msg) => {
      editor.hidden = true;
      editor.innerHTML = '';
      svcGrid.hidden = false;
      svcGrid.innerHTML = services.map(svcCard).join('') + addCard;
      svcStatus.textContent = msg || '';
    };
    const openSvc = (s, isNew) => {
      svcGrid.hidden = true;
      $('svc-seed').hidden = true;
      editor.hidden = false;
      editor.innerHTML = svcForm(s, isNew);
      svcStatus.textContent = '';
      const top = $('a-services').getBoundingClientRect().top + window.scrollY - 110;
      if (window.scrollY > top) window.scrollTo({ top });
      editor.querySelector('[name="name"]').focus({ preventScroll: true });
    };
    const loadServices = async (msg) => {
      const snap = await F.getDocs(F.collection(db, 'services'));
      services = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.order || 0) - (b.order || 0));
      $('svc-seed').hidden = services.length > 0;
      showSvcGrid(msg);
    };
    loadServices().catch((err) => { svcStatus.textContent = H.message(err); });

    $('svc-seed-btn').addEventListener('click', async () => {
      try {
        const d = await fetch('data/services.json', { cache: 'no-cache' }).then((r) => r.json());
        await Promise.all(d.services.map(({ id, ...rest }) => F.setDoc(F.doc(db, 'services', id), { ...rest, updatedAt: F.serverTimestamp() })));
        await loadServices('Default services loaded. Add prices to open bookings.');
      } catch (err) { svcStatus.textContent = H.message(err); }
    });
    const pickSvc = (e) => {
      if (e.target.closest('[data-new-svc]')) {
        openSvc({ order: services.reduce((n, s) => Math.max(n, Number(s.order) || 0), 0) + 1, packages: [] }, true);
        return;
      }
      const card = e.target.closest('[data-svc]');
      if (card) openSvc(services.find((s) => s.id === card.dataset.svc), false);
    };
    svcGrid.addEventListener('click', pickSvc);
    svcGrid.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-svc]')) { e.preventDefault(); pickSvc(e); } });
    editor.addEventListener('click', async (e) => {
      if (e.target.closest('[data-add-pkg]')) e.target.closest('form').querySelector('.pkg-list').insertAdjacentHTML('beforeend', pkgRow({}));
      if (e.target.closest('[data-rm-pkg]')) e.target.closest('[data-pkg]').remove();
      if (e.target.closest('[data-back]')) showSvcGrid();
      if (e.target.closest('[data-delete-svc]')) {
        const f = e.target.closest('form');
        const s = services.find((x) => x.id === f.dataset.id);
        if (!window.confirm(`Delete "${s.name}"? Artists can't book it any more. To hide it for a while instead, untick "Show this service".`)) return;
        try {
          await F.deleteDoc(F.doc(db, 'services', s.id));
          await loadServices(`${s.name} deleted.`);
        } catch (err) { f.querySelector('.form-status').textContent = H.message(err); }
      }
    });
    editor.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const el = f.elements;
      const out = f.querySelector('.form-status');
      const name = el.name.value.trim();
      if (!name) { out.textContent = 'Give the service a name.'; el.name.focus(); return; }
      const per = num(el.pricePerTrack.value);
      if (per !== null && !(per > 0)) { out.textContent = 'The per-track price must be a number, like 49 or 49.50.'; return; }
      const packages = [...f.querySelectorAll('[data-pkg]')].map((row) => {
        const v = (k) => row.querySelector(`[data-k="${k}"]`).value.trim();
        const pname = v('name');
        return { id: v('id') || slug(pname) || `pkg-${Date.now()}`, name: pname, tracks: Math.max(1, Number(v('tracks')) || 1), price: num(v('price')) };
      }).filter((p) => p.name);
      if (packages.some((p) => p.price !== null && !(p.price > 0))) { out.textContent = 'Package prices must be numbers, like 199.'; return; }
      if (new Set(packages.map((p) => p.id)).size !== packages.length) { out.textContent = 'Two packages have the same name. Give each one its own name.'; return; }
      let id = f.dataset.id;
      if (!id) {
        const base = slug(name) || 'service';
        id = base;
        for (let i = 2; services.some((s) => s.id === id); i += 1) id = `${base}-${i}`;
      }
      try {
        await F.setDoc(F.doc(db, 'services', id), {
          name,
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
        await loadServices(f.dataset.id ? `${name} saved. It shows on the site straight away.` : `${name} added. It shows on the site straight away.`);
      } catch (err) { out.textContent = H.message(err); }
    });

    // ---------- Overview: revenue, latest sales, most popular (from Stripe via adminStats) ----------
    const ov = { data: null, range: 30, base: 'https://dashboard.stripe.com' };
    const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const seriesFor = (range) => {
      const daily = (ov.data && ov.data.daily) || {};
      const out = [];
      if (range === 365) {
        const now = new Date();
        for (let i = 11; i >= 0; i -= 1) {
          const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
          let revenue = 0; let sales = 0;
          Object.entries(daily).forEach(([k, v]) => { if (k.startsWith(key)) { revenue += v.revenue; sales += v.sales; } });
          out.push({ label: m.toLocaleDateString('en-GB', { month: 'short' }), long: m.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), revenue, sales });
        }
        return out;
      }
      for (let i = range - 1; i >= 0; i -= 1) {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const v = daily[isoDay(d)] || { revenue: 0, sales: 0 };
        out.push({ label: d.toLocaleDateString('en-GB', range === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }), long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), revenue: v.revenue, sales: v.sales });
      }
      return out;
    };
    const niceMax = (v) => {
      if (v <= 0) return 100;
      const p = 10 ** Math.floor(Math.log10(v));
      const n = v / p;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    };
    const money0 = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);
    const drawChart = () => {
      const box = $('ov-chart');
      const data = seriesFor(ov.range);
      const W = Math.max(280, box.clientWidth || 640);
      const CH = 240;
      const padL = 56; const padR = 8; const padT = 12; const padB = 30;
      const iw = W - padL - padR; const ih = CH - padT - padB;
      const max = niceMax(Math.max(...data.map((d) => d.revenue)));
      const slot = iw / data.length;
      const bw = Math.max(2, Math.min(28, slot - 2));
      const y = (v) => padT + ih - (v / max) * ih;
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
      const every = Math.ceil(data.length / Math.max(2, Math.floor(iw / 64)));
      const bar = (d, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        const top = y(d.revenue);
        const h = padT + ih - top;
        if (d.revenue <= 0) return '';
        const r = Math.min(4, bw / 2, h);
        return `<path class="ov-bar" d="M${x},${padT + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${padT + ih} Z"/>`;
      };
      box.innerHTML = `
        <svg width="${W}" height="${CH}" viewBox="0 0 ${W} ${CH}" role="img" aria-label="Revenue per ${ov.range === 365 ? 'month' : 'day'}">
          ${ticks.map((t) => `<line class="ov-grid${t === 0 ? ' is-base' : ''}" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="ov-axis" x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${esc(money0(t))}</text>`).join('')}
          ${data.map(bar).join('')}
          ${data.map((d, i) => (i % every === 0) ? `<text class="ov-axis" x="${padL + slot * i + slot / 2}" y="${CH - 10}" text-anchor="middle">${esc(d.label)}</text>` : '').join('')}
          ${data.map((d, i) => `<rect class="ov-hit" data-i="${i}" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${ih}" tabindex="0" aria-label="${esc(`${d.long}: ${money0(d.revenue)}, ${d.sales} ${d.sales === 1 ? 'sale' : 'sales'}`)}"/>`).join('')}
        </svg>
        <div class="ov-tip" hidden></div>`;
      const tip = box.querySelector('.ov-tip');
      const show = (rect) => {
        const d = data[Number(rect.dataset.i)];
        box.querySelectorAll('.ov-hit').forEach((h) => h.classList.toggle('is-on', h === rect));
        tip.innerHTML = `<span class="mono muted">${esc(d.long)}</span><strong class="display">${esc(money0(d.revenue))}</strong><span class="mono muted">${d.sales} ${d.sales === 1 ? 'sale' : 'sales'}</span>`;
        tip.hidden = false;
        const cx = Number(rect.getAttribute('x')) + slot / 2;
        tip.style.left = `${Math.min(Math.max(cx, 70), W - 70)}px`;
        tip.style.top = `${Math.max(0, y(d.revenue) - 8)}px`;
      };
      const hide = () => { tip.hidden = true; box.querySelectorAll('.ov-hit.is-on').forEach((h) => h.classList.remove('is-on')); };
      box.querySelectorAll('.ov-hit').forEach((h) => {
        h.addEventListener('mouseenter', () => show(h));
        h.addEventListener('focus', () => show(h));
        h.addEventListener('blur', hide);
      });
      box.querySelector('svg').addEventListener('mouseleave', hide);
      const total = data.reduce((n, d) => n + d.revenue, 0);
      const sales = data.reduce((n, d) => n + d.sales, 0);
      const label = ov.range === 365 ? 'last 12 months' : `last ${ov.range} days`;
      $('ov-rev-label').textContent = `Revenue, ${label}`;
      $('ov-rev').textContent = H.euro(total);
      $('ov-sales').textContent = String(sales);
      $('ov-chart-title').textContent = `Revenue per ${ov.range === 365 ? 'month' : 'day'}`;
    };
    const renderOverview = () => {
      const d = ov.data;
      const base = d.stripeBase || ov.base;
      $('ov-stripe').href = `${base}/payments`;
      $('ov-tile-rev').href = `${base}/payments`;
      $('ov-tile-sales').href = `${base}/payments`;
      $('ov-tile-bal').href = `${base}/balance/overview`;
      $('ov-latest-all').href = `${base}/payments`;
      $('ov-pop-all').href = `${base}/payments`;
      $('ov-bal').textContent = d.balance ? H.euro(d.balance.available) : '—';
      $('ov-pending').textContent = d.balance ? `${H.euro(d.balance.pending)} on the way` : '';
      $('ov-latest').innerHTML = (d.latest || []).length ? d.latest.map((s) => `
        <li><a class="ov-row" href="${esc(s.paymentIntent ? `${base}/payments/${s.paymentIntent}` : `${base}/payments`)}" target="_blank" rel="noopener">
          <span class="ov-row-main"><span class="ov-row-title">${esc((s.items || []).join(', '))}</span>
          <span class="mono muted">${esc([s.name || s.email, new Date(s.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · '))}</span></span>
          <span class="ov-row-side"><span class="display">${esc(H.euro(s.amount))}</span>${s.refunded ? `<span class="mono muted">${esc(H.euro(s.refunded))} refunded</span>` : ''}</span>
        </a></li>`).join('') : '<li class="mono muted ov-none">No sales yet.</li>';
      $('ov-popular').innerHTML = (d.popular || []).length ? d.popular.map((p, i) => `
        <li><a class="ov-row" href="${esc(`${base}/search?query=${encodeURIComponent(p.name)}`)}" target="_blank" rel="noopener">
          <span class="mono muted ov-rank">0${i + 1}</span>
          <span class="ov-row-main"><span class="ov-row-title">${esc(p.name)}</span><span class="mono muted">${esc(p.kind === 'product' ? 'Product' : 'Service')} · ${p.sold} sold</span></span>
          <span class="ov-row-side"><span class="display">${esc(H.euro(p.revenue))}</span></span>
        </a></li>`).join('') : '<li class="mono muted ov-none">Nothing sold yet.</li>';
      ['ov-tiles', 'ov-chart-card', 'ov-cols'].forEach((id) => { $(id).hidden = false; });
      drawChart();
    };
    const loadOverview = async () => {
      try {
        const res = await Fn.httpsCallable(functions, 'adminStats')();
        ov.data = res.data || {};
        $('ov-status').textContent = '';
        renderOverview();
      } catch (err) {
        console.error('Overview', err);
        $('ov-status').innerHTML = `Couldn't load sales from Stripe (${esc(H.message(err))}). <a href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener">Open Stripe</a>`;
      }
    };
    loadOverview();
    filterGroup($('ov-range'), (r) => { ov.range = Number(r); if (ov.data) drawChart(); });
    let ovResize = null;
    window.addEventListener('resize', () => { clearTimeout(ovResize); ovResize = setTimeout(() => { if (ov.data && !$('a-overview').hidden) drawChart(); }, 150); });
    window.addEventListener('hashchange', () => { if (ov.data && location.hash === '#a-overview') requestAnimationFrame(drawChart); });

    // ---------- Products (drum kits, sample packs…) ----------
    // Shown to artists on their dashboard. The picture and preview are public; the product file is
    // private and only reaches buyers through the download link in their email.
    const pGrid = $('prod-grid');
    const pEditor = $('prod-editor');
    const pStatus = $('prod-editor-status');
    const DEFAULT_CATS = ['Drum kits', 'Sample packs', 'Plugins', 'Presets', 'MIDI packs', 'Loops'];
    // Plugins (category "Plugins") get a Windows and a Mac file instead of one product file
    const isPluginCat = (c) => /^plugins?$/i.test(String(c || '').trim());
    const FILE_KEYS = ['file', 'fileWin', 'fileMac'];
    const fileLabel = (f) => (f && f.name ? `${f.name} · ${H.bytes(f.size || 0)}` : '');
    let products = [];
    let pend = {}; // files picked in the form: { image, preview, file } or { removeImage: true, removePreview: true }
    let gal = []; // extra pictures in the form: { path, url } already saved, or { file, url } picked now
    let galRemoved = []; // storage paths of saved extra pictures removed in the form
    const GALLERY_MAX = 8;
    const galHtml = () => gal.map((g, i) => `
      <li class="gal-edit-item">
        <img src="${esc(g.url)}" alt="">
        <div class="gal-edit-tools">
          <button type="button" class="link-btn mono" data-gal-move="${i}" data-dir="-1"${i === 0 ? ' disabled' : ''} aria-label="Move picture ${i + 1} left">←</button>
          <button type="button" class="link-btn mono" data-gal-move="${i}" data-dir="1"${i === gal.length - 1 ? ' disabled' : ''} aria-label="Move picture ${i + 1} right">→</button>
          <button type="button" class="link-btn mono" data-gal-rm="${i}">Remove</button>
        </div>
      </li>`).join('');
    const renderGal = () => {
      const list = pEditor.querySelector('[data-gal]');
      if (!list) return;
      list.innerHTML = galHtml();
      pEditor.querySelector('[data-gal-add]').hidden = gal.length >= GALLERY_MAX;
      pEditor.querySelector('[data-gal-count]').textContent = `${gal.length} of ${GALLERY_MAX}`;
    };
    const picCount = (p) => {
      const n = (p.image && p.image.url ? 1 : 0) + (p.gallery || []).length;
      return n === 1 ? '1 picture' : `${n} pictures`;
    };
    const prodCard = (p) => `
      <article class="prod prod-admin${p.active === false ? ' is-off' : ''}" data-prod="${esc(p.id)}" tabindex="0" role="button" aria-label="Edit ${esc(p.title)}">
        <div class="ev-pic prod-pic">${p.image && p.image.url ? `<img src="${esc(p.image.url)}" alt="" loading="lazy">` : '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">No picture yet</span>'}</div>
        <div class="prod-body">
          <div class="svc-admin-head">${p.category ? `<span class="mono muted prod-cat">${esc(p.category)}</span>` : '<span></span>'}${p.active === false ? pill('Hidden', 'off') : ''}</div>
          <h3 class="display prod-title">${esc(p.title)}</h3>
          ${p.description ? `<p class="prod-desc">${esc(p.description)}</p>` : ''}
          <p class="mono muted">${esc([p.plugin ? [p.fileWin && p.fileWin.path ? 'Windows' : null, p.fileMac && p.fileMac.path ? 'Mac' : null].filter(Boolean).join(' + ') || 'No files yet' : p.file && p.file.name ? `${p.file.name} · ${H.bytes(p.file.size || 0)}` : 'No file yet', p.preview && p.preview.url ? 'Preview' : 'No preview', picCount(p)].join(' · '))}</p>
          <div class="prod-foot"><span class="display prod-price">${esc(priced(p.price))}</span><span class="mono svc-admin-edit">Edit <svg aria-hidden="true"><use href="#i-arrow"/></svg></span></div>
        </div>
      </article>`;
    const prodAdd = '<button type="button" class="prod svc-new" data-new-prod><span class="display">+</span><span class="mono">Add a product</span></button>';
    const fileRow = (key, label, hint, accept, current) => `
      <div class="field">
        <span class="field-label mono">${label} <em class="muted">${hint}</em></span>
        <div class="quick prod-file">
          <span class="mono" data-cur="${key}">${current ? esc(current) : '<span class="muted">Nothing uploaded</span>'}</span>
          <label class="more file-btn">${current ? 'Replace' : 'Choose file'}<input type="file" accept="${accept}" data-pick="${key}" hidden></label>
          ${key !== 'file' ? `<button type="button" class="link-btn mono" data-unpick="${key}"${current ? '' : ' hidden'}>Remove</button>` : ''}
        </div>
      </div>`;
    const prodForm = (p, isNew) => `
      <form class="form ev-edit" data-id="${esc(p.id || '')}" novalidate>
        <button type="button" class="link-btn mono svc-back" data-back>← All products</button>
        <fieldset>
          <legend class="display svc-edit-title">${isNew ? 'New product' : esc(p.title)}</legend>
          <label class="field"><span class="field-label mono">Title</span><input type="text" name="title" value="${esc(p.title || '')}" required maxlength="100" placeholder="Hyard Drum Kit Vol. 1"></label>
          <div class="field-row field-row-3">
            <label class="field"><span class="field-label mono">Category</span><input type="text" name="category" value="${esc(p.category || '')}" list="prod-cats" maxlength="40" placeholder="Drum kits"></label>
            <label class="field"><span class="field-label mono">Price €</span><input type="text" inputmode="decimal" name="price" value="${esc(p.price ?? '')}" placeholder="empty = coming soon"></label>
            <label class="field"><span class="field-label mono">Order on page</span><input type="text" inputmode="numeric" name="order" value="${esc(p.order ?? '')}"></label>
          </div>
          <datalist id="prod-cats">${[...new Set([...products.map((x) => x.category).filter(Boolean), ...DEFAULT_CATS])].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
          <label class="field"><span class="field-label mono">Description</span><textarea name="description" rows="4" maxlength="2000" placeholder="What's inside: 120 one-shots, 40 loops, 140–150 BPM…">${esc(p.description || '')}</textarea></label>
          <div class="field">
            <span class="field-label mono">Image <em class="muted">JPG, PNG or WebP, up to 8 MB. Square works best.</em></span>
            <div class="ev-pic-edit">
              <div class="ev-pic prod-pic" data-pic-preview>${p.image && p.image.url ? `<img src="${esc(p.image.url)}" alt="">` : '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">Picture placeholder</span>'}</div>
              <div class="quick">
                <label class="more file-btn">${p.image && p.image.url ? 'Change image' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" data-pick="image" hidden></label>
                <button type="button" class="link-btn mono" data-unpick="image"${p.image && p.image.url ? '' : ' hidden'}>Remove image</button>
              </div>
            </div>
          </div>
          <div class="field">
            <span class="field-label mono">More pictures <em class="muted">Shown in the gallery on the product page, after the main image. Up to 8, JPG, PNG or WebP under 8 MB each.</em></span>
            <ul class="gal-edit" data-gal></ul>
            <div class="quick">
              <label class="more file-btn" data-gal-add>Add pictures<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-gal-pick hidden></label>
              <span class="mono muted" data-gal-count></span>
            </div>
          </div>
          <div class="field">
            <span class="field-label mono">MP3 preview <em class="muted">A short demo artists can play before buying. MP3, up to 20 MB.</em></span>
            <div class="quick prod-file">
              <audio controls preload="none" data-audio${p.preview && p.preview.url ? ` src="${esc(p.preview.url)}"` : ' hidden'}></audio>
              <span class="mono muted" data-cur="preview"${p.preview && p.preview.url ? ' hidden' : ''}>No preview yet</span>
              <label class="more file-btn">${p.preview && p.preview.url ? 'Replace preview' : 'Upload preview'}<input type="file" accept="audio/mpeg,.mp3" data-pick="preview" hidden></label>
              <button type="button" class="link-btn mono" data-unpick="preview"${p.preview && p.preview.url ? '' : ' hidden'}>Remove preview</button>
            </div>
          </div>
          <div data-files="single"${isPluginCat(p.category) ? ' hidden' : ''}>
            ${fileRow('file', 'Product file', 'What buyers download, usually a ZIP. Up to 2 GB. Only buyers can get it.', '.zip,.rar,.7z,application/zip,application/x-zip-compressed,application/octet-stream,*/*', fileLabel(p.file))}
          </div>
          <div data-files="plugin"${isPluginCat(p.category) ? '' : ' hidden'}>
            <p class="mono muted nw-card-text">Plugin: buyers get a Windows and a Mac download button.</p>
            ${fileRow('fileWin', 'Windows version', 'Installer or ZIP for Windows. Up to 2 GB.', '.zip,.exe,.msi,.rar,.7z,application/zip,application/octet-stream,*/*', fileLabel(p.fileWin))}
            ${fileRow('fileMac', 'Mac version', 'Installer or ZIP for Mac. Up to 2 GB.', '.zip,.pkg,.dmg,.rar,.7z,application/zip,application/octet-stream,*/*', fileLabel(p.fileMac))}
          </div>
          <label class="check"><input type="checkbox" name="active"${p.active !== false ? ' checked' : ''}><span class="check-box" aria-hidden="true"></span><span class="mono">Show this product to artists</span></label>
        </fieldset>
        <span class="drop-progress upload-bar" hidden aria-hidden="true"><span></span></span>
        <div class="quick">
          <button class="more" type="submit">${isNew ? 'Add product' : 'Save changes'}</button>
          <button type="button" class="link-btn mono" data-back>Cancel</button>
          ${isNew ? '' : `<a class="link-btn mono" href="product?p=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">View page</a>`}
          ${isNew ? '' : '<button type="button" class="link-btn mono" data-delete-prod>Delete product</button>'}
        </div>
        <p class="form-status mono muted" aria-live="polite"></p>
      </form>`;
    const showProdGrid = (msg) => {
      pEditor.hidden = true;
      pEditor.innerHTML = '';
      pGrid.hidden = false;
      pGrid.innerHTML = products.map(prodCard).join('') + prodAdd;
      pStatus.textContent = msg || '';
    };
    const openProd = (p, isNew) => {
      pend = {};
      gal = (p.gallery || []).filter((g) => g && g.url).map((g) => ({ ...g }));
      galRemoved = [];
      pGrid.hidden = true;
      pEditor.hidden = false;
      pEditor.innerHTML = prodForm(p, isNew);
      renderGal();
      pStatus.textContent = '';
      const top = $('a-products').getBoundingClientRect().top + window.scrollY - 110;
      if (window.scrollY > top) window.scrollTo({ top });
      pEditor.querySelector('[name="title"]').focus({ preventScroll: true });
    };
    const loadProducts = async (msg) => {
      const snap = await F.getDocs(F.collection(db, 'products'));
      products = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title)));
      showProdGrid(msg);
    };
    loadProducts().catch((err) => { pStatus.textContent = H.message(err); });

    const pickProd = (e) => {
      if (e.target.closest('[data-new-prod]')) { openProd({ order: products.reduce((n, p) => Math.max(n, Number(p.order) || 0), 0) + 1 }, true); return; }
      const card = e.target.closest('[data-prod]');
      if (card) openProd(products.find((x) => x.id === card.dataset.prod), false);
    };
    pGrid.addEventListener('click', pickProd);
    pGrid.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-prod]')) { e.preventDefault(); pickProd(e); } });
    const LIMITS = {
      image: { types: /^image\/(jpeg|png|webp)$/, max: 8 * 1024 * 1024, bad: 'Use a JPG, PNG or WebP image under 8 MB.' },
      preview: { types: /^audio\/(mpeg|mp3)$/, max: 20 * 1024 * 1024, bad: 'Use an MP3 preview under 20 MB.' },
      file: { types: /.*/, max: 2 * 1024 * 1024 * 1024, bad: 'The product file must be under 2 GB.' },
      fileWin: { types: /.*/, max: 2 * 1024 * 1024 * 1024, bad: 'The product file must be under 2 GB.' },
      fileMac: { types: /.*/, max: 2 * 1024 * 1024 * 1024, bad: 'The product file must be under 2 GB.' },
    };
    pEditor.addEventListener('input', (e) => {
      if (!e.target.matches('[name="category"]')) return;
      const plugin = isPluginCat(e.target.value);
      pEditor.querySelector('[data-files="single"]').hidden = plugin;
      pEditor.querySelector('[data-files="plugin"]').hidden = !plugin;
    });
    pEditor.addEventListener('change', (e) => {
      const gp = e.target.closest('[data-gal-pick]');
      if (gp) {
        const out = pEditor.querySelector('.form-status');
        const files = [...gp.files];
        gp.value = '';
        const bad = files.filter((f) => !LIMITS.image.types.test(f.type) || f.size > LIMITS.image.max);
        const good = files.filter((f) => !bad.includes(f)).slice(0, GALLERY_MAX - gal.length);
        good.forEach((f) => gal.push({ file: f, url: URL.createObjectURL(f) }));
        out.textContent = bad.length ? LIMITS.image.bad : files.length > good.length ? `Only ${GALLERY_MAX} extra pictures fit.` : '';
        renderGal();
        return;
      }
      const inp = e.target.closest('[data-pick]');
      if (!inp || !inp.files[0]) return;
      const key = inp.dataset.pick;
      const f = inp.files[0];
      const out = pEditor.querySelector('.form-status');
      const type = f.type || (/\.mp3$/i.test(f.name) ? 'audio/mpeg' : '');
      if (!LIMITS[key].types.test(type) || f.size > LIMITS[key].max) { out.textContent = LIMITS[key].bad; inp.value = ''; return; }
      out.textContent = '';
      pend[key] = f;
      delete pend[`remove_${key}`];
      const un = pEditor.querySelector(`[data-unpick="${key}"]`);
      if (un) un.hidden = false;
      if (key === 'image') {
        const prev = pEditor.querySelector('[data-pic-preview]');
        prev.innerHTML = '<img alt="">';
        prev.firstChild.src = URL.createObjectURL(f);
      } else if (key === 'preview') {
        const a = pEditor.querySelector('[data-audio]');
        a.src = URL.createObjectURL(f);
        a.hidden = false;
        pEditor.querySelector('[data-cur="preview"]').hidden = true;
      } else {
        pEditor.querySelector(`[data-cur="${key}"]`).textContent = `${f.name} · ${H.bytes(f.size)} (uploads when you save)`;
      }
    });
    pEditor.addEventListener('click', async (e) => {
      if (e.target.closest('[data-back]')) { showProdGrid(); return; }
      const mv = e.target.closest('[data-gal-move]');
      if (mv) {
        const i = Number(mv.dataset.galMove);
        const j = i + Number(mv.dataset.dir);
        if (j >= 0 && j < gal.length) [gal[i], gal[j]] = [gal[j], gal[i]];
        renderGal();
        return;
      }
      const rm = e.target.closest('[data-gal-rm]');
      if (rm) {
        const [g] = gal.splice(Number(rm.dataset.galRm), 1);
        if (g && g.path) galRemoved.push(g.path);
        renderGal();
        return;
      }
      const un = e.target.closest('[data-unpick]');
      if (un) {
        const key = un.dataset.unpick;
        delete pend[key];
        pend[`remove_${key}`] = true;
        un.hidden = true;
        if (FILE_KEYS.includes(key)) pEditor.querySelector(`[data-cur="${key}"]`).innerHTML = '<span class="muted">Nothing uploaded</span>';
        if (key === 'image') pEditor.querySelector('[data-pic-preview]').innerHTML = '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">Picture placeholder</span>';
        if (key === 'preview') {
          const a = pEditor.querySelector('[data-audio]');
          a.pause(); a.removeAttribute('src'); a.hidden = true;
          pEditor.querySelector('[data-cur="preview"]').hidden = false;
        }
        return;
      }
      if (e.target.closest('[data-delete-prod]')) {
        const f = e.target.closest('form');
        const p = products.find((x) => x.id === f.dataset.id);
        if (!window.confirm(`Delete "${p.title}" and its files? People who already bought it can't download it any more. To hide it from the shop instead, untick "Show this product to artists".`)) return;
        try {
          await Promise.all([p.image, p.preview, p.file, p.fileWin, p.fileMac, ...(p.gallery || [])].filter((x) => x && x.path).map((x) => S.deleteObject(S.ref(storage, x.path)).catch(() => {})));
          await F.deleteDoc(F.doc(db, 'products', p.id));
          await loadProducts(`${p.title} deleted.`);
        } catch (err) { f.querySelector('.form-status').textContent = H.message(err); }
      }
    });
    pEditor.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const el = f.elements;
      const out = f.querySelector('.form-status');
      const title = el.title.value.trim();
      if (!title) { out.textContent = 'Give the product a title.'; el.title.focus(); return; }
      const price = num(el.price.value);
      if (price !== null && !(price >= 0.5)) { out.textContent = 'The price must be a number of at least 0.50, like 19 or 24.99.'; el.price.focus(); return; }
      const old = products.find((x) => x.id === f.dataset.id) || {};
      const plugin = isPluginCat(el.category.value);
      const has = (k) => !!pend[k] || (!pend[`remove_${k}`] && !!(old[k] && old[k].path));
      if (el.active.checked && !plugin && !has('file')) { out.textContent = 'Upload the product file before showing it to artists, or untick "Show this product to artists" to save it as a draft.'; return; }
      if (el.active.checked && plugin && !has('fileWin') && !has('fileMac')) { out.textContent = 'Upload the Windows or the Mac version (or both) before showing the plugin to artists, or untick "Show this product to artists" to save it as a draft.'; return; }
      const ref = f.dataset.id ? F.doc(db, 'products', f.dataset.id) : F.doc(F.collection(db, 'products'));
      const btn = f.querySelector('[type="submit"]');
      const bar = f.querySelector('.upload-bar');
      btn.disabled = true;
      try {
        const kept = { image: old.image || null, preview: old.preview || null, file: old.file || null, fileWin: old.fileWin || null, fileMac: old.fileMac || null };
        const uploads = ['image', 'preview', ...(plugin ? ['fileWin', 'fileMac'] : ['file'])].filter((k) => pend[k]);
        const galNew = gal.filter((g) => g.file);
        const totalBytes = uploads.reduce((n, k) => n + pend[k].size, 0) + galNew.reduce((n, g) => n + g.file.size, 0) || 1;
        let doneBytes = 0;
        for (const k of ['image', 'preview', ...FILE_KEYS]) {
          if ((pend[k] || pend[`remove_${k}`]) && kept[k] && kept[k].path) {
            await S.deleteObject(S.ref(storage, kept[k].path)).catch(() => {});
            kept[k] = null;
          }
        }
        for (const k of uploads) {
          const file = pend[k];
          const folder = FILE_KEYS.includes(k) ? 'files' : 'public';
          const path = `products/${ref.id}/${folder}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
          bar.hidden = false;
          out.textContent = `Uploading ${k === 'fileWin' ? 'the Windows version' : k === 'fileMac' ? 'the Mac version' : k === 'file' ? 'the product file' : k === 'preview' ? 'the preview' : 'the image'}…`;
          const type = file.type || (k === 'preview' ? 'audio/mpeg' : 'application/octet-stream');
          await new Promise((resolve, reject) => {
            const task = S.uploadBytesResumable(S.ref(storage, path), file, { contentType: type });
            task.on('state_changed', (s) => { bar.firstElementChild.style.width = `${Math.round(((doneBytes + s.bytesTransferred) / totalBytes) * 100)}%`; }, reject, resolve);
          });
          doneBytes += file.size;
          kept[k] = FILE_KEYS.includes(k)
            ? { path, name: file.name, size: file.size }
            : { path, url: await S.getDownloadURL(S.ref(storage, path)) };
        }
        const gallery = [];
        for (const g of gal) {
          if (!g.file) { gallery.push({ path: g.path, url: g.url }); continue; }
          const path = `products/${ref.id}/public/${Date.now()}-${g.file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
          bar.hidden = false;
          out.textContent = `Uploading picture ${gallery.length + 1} of ${gal.length}…`;
          await new Promise((resolve, reject) => {
            const task = S.uploadBytesResumable(S.ref(storage, path), g.file, { contentType: g.file.type });
            task.on('state_changed', (s) => { bar.firstElementChild.style.width = `${Math.round(((doneBytes + s.bytesTransferred) / totalBytes) * 100)}%`; }, reject, resolve);
          });
          doneBytes += g.file.size;
          gallery.push({ path, url: await S.getDownloadURL(S.ref(storage, path)) });
        }
        await Promise.all(galRemoved.map((x) => S.deleteObject(S.ref(storage, x)).catch(() => {})));
        bar.hidden = true;
        await F.setDoc(ref, {
          title,
          category: el.category.value.trim(),
          price,
          order: Number(el.order.value) || 0,
          description: el.description.value.trim(),
          image: kept.image,
          gallery,
          preview: kept.preview,
          file: plugin ? null : kept.file,
          fileWin: plugin ? kept.fileWin : null,
          fileMac: plugin ? kept.fileMac : null,
          plugin,
          active: el.active.checked,
          createdAt: old.createdAt || F.serverTimestamp(),
          updatedAt: F.serverTimestamp(),
        });
        await loadProducts(f.dataset.id ? `${title} saved. Artists see it straight away.` : `${title} added. Artists see it straight away.`);
      } catch (err) {
        bar.hidden = true;
        out.textContent = err && err.code === 'storage/unauthorized' ? 'That file couldn\'t be uploaded. Check its type and size.' : H.message(err);
        btn.disabled = false;
      }
    });

    // ---------- Events ----------
    // Saved in the "events" collection and shown on the Events page next to data/events.json.
    const evGrid = $('ev-grid');
    const evEditor = $('ev-editor');
    const evStatus = $('ev-status');
    const EV_STATUS = { announced: 'Announced', 'on-sale': 'Tickets on sale', free: 'Free entry', 'sold-out': 'Sold out' };
    const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    let events = [];
    let roster = [];
    fetch('data/artists.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => { roster = d.artists || []; }).catch(() => {});
    const artistNames = (e) => [...(e.artists || []).map((s) => (roster.find((a) => a.slug === s) || {}).name || s), ...(e.otherArtists ? [e.otherArtists] : [])].join(' · ');
    const evDate = (e) => {
      if (!e.date) return '';
      const d = new Date(`${e.date}T12:00:00`);
      return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${e.time ? ` · ${e.time}` : ''}`;
    };
    const evCard = (e) => `
      <article class="ev-card${e.date < todayIso ? ' is-past' : ''}" data-ev="${esc(e.id)}" tabindex="0" role="button" aria-label="Edit ${esc(e.title)}">
        <div class="ev-pic">${e.image && e.image.url ? `<img src="${esc(e.image.url)}" alt="" loading="lazy">` : '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">No picture yet</span>'}</div>
        <div class="ev-card-body">
          <p class="mono muted">${esc(evDate(e))}${e.date < todayIso ? ' · Past' : ''}</p>
          <h3 class="display ev-card-title">${esc(e.title)}</h3>
          ${e.location ? `<p class="mono">${esc(e.location)}</p>` : ''}
          ${artistNames(e) ? `<p class="mono muted">${esc(artistNames(e))}</p>` : ''}
          <div class="ev-card-foot">${pill(EV_STATUS[e.status] || 'Announced')}<span class="mono svc-admin-edit">Edit <svg aria-hidden="true"><use href="#i-arrow"/></svg></span></div>
        </div>
      </article>`;
    const evAdd = '<button type="button" class="ev-card ev-new" data-new-ev><span class="display">+</span><span class="mono">Add an event</span></button>';
    const evForm = (e, isNew) => `
      <form class="form ev-edit" data-id="${esc(e.id || '')}" novalidate>
        <button type="button" class="link-btn mono svc-back" data-back>← All events</button>
        <fieldset>
          <legend class="display svc-edit-title">${isNew ? 'New event' : esc(e.title)}</legend>
          <label class="field"><span class="field-label mono">Title</span><input type="text" name="title" value="${esc(e.title || '')}" required maxlength="120" placeholder="Hyard Records Night"></label>
          <div class="field-row">
            <label class="field"><span class="field-label mono">Date</span><input type="date" name="date" value="${esc(e.date || '')}" required></label>
            <label class="field"><span class="field-label mono">Start time <em class="muted">Optional</em></span><input type="time" name="time" value="${esc(e.time || '')}"></label>
          </div>
          <label class="field"><span class="field-label mono">Location</span><input type="text" name="location" value="${esc(e.location || [e.venue, e.city, e.country].filter(Boolean).join(', '))}" required maxlength="160" placeholder="Venue, city, country"></label>
          <div class="field">
            <span class="field-label mono">Artists</span>
            <div class="ev-artist-picks">${roster.map((a) => `<label class="check"><input type="checkbox" name="artist" value="${esc(a.slug)}"${(e.artists || []).includes(a.slug) ? ' checked' : ''}><span class="check-box" aria-hidden="true"></span><span class="mono">${esc(a.name)}</span></label>`).join('')}</div>
          </div>
          <label class="field"><span class="field-label mono">Other artists <em class="muted">Guests not on the label, separated by commas</em></span><input type="text" name="otherArtists" value="${esc(e.otherArtists || '')}" maxlength="200"></label>
          <label class="field"><span class="field-label mono">Description</span><textarea name="description" rows="4" maxlength="2000" placeholder="Line-up, set times, age limit…">${esc(e.description || e.note || '')}</textarea></label>
          <div class="field">
            <span class="field-label mono">Picture <em class="muted">JPG, PNG or WebP, up to 8 MB. Square or landscape works best.</em></span>
            <div class="ev-pic-edit">
              <div class="ev-pic" data-pic-preview>${e.image && e.image.url ? `<img src="${esc(e.image.url)}" alt="">` : '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">Picture placeholder</span>'}</div>
              <div class="quick">
                <label class="more file-btn">${e.image && e.image.url ? 'Change picture' : 'Upload picture'}<input type="file" accept="image/jpeg,image/png,image/webp" data-pic hidden></label>
                <button type="button" class="link-btn mono" data-rm-pic${e.image && e.image.url ? '' : ' hidden'}>Remove picture</button>
              </div>
            </div>
          </div>
          <div class="field-row field-row-3">
            <label class="field"><span class="field-label mono">Status</span><select name="status">${Object.entries(EV_STATUS).map(([k, v]) => `<option value="${k}"${(e.status || 'announced') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label mono">Ticket link <em class="muted">Optional</em></span><input type="url" name="ticketUrl" value="${esc(e.ticketUrl || '')}" placeholder="https://"></label>
            <label class="field"><span class="field-label mono">More info link <em class="muted">Optional</em></span><input type="url" name="infoUrl" value="${esc(e.infoUrl || '')}" placeholder="https://"></label>
          </div>
        </fieldset>
        <span class="drop-progress upload-bar" hidden aria-hidden="true"><span></span></span>
        <div class="quick">
          <button class="more" type="submit">${isNew ? 'Add event' : 'Save changes'}</button>
          <button type="button" class="link-btn mono" data-back>Cancel</button>
          ${isNew ? '' : '<button type="button" class="link-btn mono" data-delete-ev>Delete event</button>'}
        </div>
        <p class="form-status mono muted" aria-live="polite"></p>
      </form>`;
    const showEvGrid = (msg) => {
      evEditor.hidden = true;
      evEditor.innerHTML = '';
      evGrid.hidden = false;
      const upcoming = events.filter((e) => e.date >= todayIso).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
      const past = events.filter((e) => e.date < todayIso).sort((a, b) => b.date.localeCompare(a.date));
      evGrid.innerHTML = evAdd + [...upcoming, ...past].map(evCard).join('');
      evStatus.textContent = msg || '';
    };
    let pic = null; // { file } for a new upload, { remove: true } to clear the picture
    const openEv = (e, isNew) => {
      pic = null;
      evGrid.hidden = true;
      evEditor.hidden = false;
      evEditor.innerHTML = evForm(e, isNew);
      evStatus.textContent = '';
      const top = $('a-events').getBoundingClientRect().top + window.scrollY - 110;
      if (window.scrollY > top) window.scrollTo({ top });
      evEditor.querySelector('[name="title"]').focus({ preventScroll: true });
    };
    const loadEvents = async (msg) => {
      const snap = await F.getDocs(F.collection(db, 'events'));
      events = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      $('adm-count-events').textContent = events.filter((e) => e.date >= todayIso).length || '';
      showEvGrid(msg);
    };
    loadEvents().catch((err) => { evStatus.textContent = H.message(err); });

    const pickEv = (e) => {
      if (e.target.closest('[data-new-ev]')) { openEv({ status: 'announced', artists: [] }, true); return; }
      const card = e.target.closest('[data-ev]');
      if (card) openEv(events.find((x) => x.id === card.dataset.ev), false);
    };
    evGrid.addEventListener('click', pickEv);
    evGrid.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ev]')) { e.preventDefault(); pickEv(e); } });
    const placeholder = '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">Picture placeholder</span>';
    evEditor.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-pic]');
      if (!inp || !inp.files[0]) return;
      const f = inp.files[0];
      const out = evEditor.querySelector('.form-status');
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { out.textContent = 'Use a JPG, PNG or WebP picture.'; inp.value = ''; return; }
      if (f.size > 8 * 1024 * 1024) { out.textContent = 'That picture is over 8 MB. Use a smaller one.'; inp.value = ''; return; }
      out.textContent = '';
      pic = { file: f };
      const prev = evEditor.querySelector('[data-pic-preview]');
      prev.innerHTML = '<img alt="">';
      prev.firstChild.src = URL.createObjectURL(f);
      evEditor.querySelector('[data-rm-pic]').hidden = false;
    });
    evEditor.addEventListener('click', async (e) => {
      if (e.target.closest('[data-back]')) { showEvGrid(); return; }
      if (e.target.closest('[data-rm-pic]')) {
        pic = { remove: true };
        evEditor.querySelector('[data-pic-preview]').innerHTML = placeholder;
        evEditor.querySelector('[data-pic]').value = '';
        e.target.closest('[data-rm-pic]').hidden = true;
        return;
      }
      if (e.target.closest('[data-delete-ev]')) {
        const f = e.target.closest('form');
        const ev = events.find((x) => x.id === f.dataset.id);
        if (!window.confirm(`Delete "${ev.title}"? It disappears from the Events page.`)) return;
        try {
          if (ev.image && ev.image.path) await S.deleteObject(S.ref(storage, ev.image.path)).catch(() => {});
          await F.deleteDoc(F.doc(db, 'events', ev.id));
          await loadEvents(`${ev.title} deleted.`);
        } catch (err) { f.querySelector('.form-status').textContent = H.message(err); }
      }
    });
    const validUrl = (u) => !u || /^https?:\/\/\S+\.\S+/.test(u);
    evEditor.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const el = f.elements;
      const out = f.querySelector('.form-status');
      const title = el.title.value.trim();
      const location = el.location.value.trim();
      if (!title) { out.textContent = 'Give the event a title.'; el.title.focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(el.date.value)) { out.textContent = 'Pick the date of the event.'; el.date.focus(); return; }
      if (!location) { out.textContent = 'Add where the event is.'; el.location.focus(); return; }
      const ticketUrl = el.ticketUrl.value.trim();
      const infoUrl = el.infoUrl.value.trim();
      if (!validUrl(ticketUrl) || !validUrl(infoUrl)) { out.textContent = 'Links must start with https://'; return; }
      const old = events.find((x) => x.id === f.dataset.id) || {};
      const ref = f.dataset.id ? F.doc(db, 'events', f.dataset.id) : F.doc(F.collection(db, 'events'));
      const btn = f.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        let image = old.image || null;
        if (pic && (pic.remove || pic.file) && image && image.path) {
          await S.deleteObject(S.ref(storage, image.path)).catch(() => {});
          image = null;
        }
        if (pic && pic.file) {
          const bar = f.querySelector('.upload-bar');
          bar.hidden = false;
          out.textContent = 'Uploading the picture…';
          const path = `events/${ref.id}/${Date.now()}-${pic.file.name.replace(/[^\w.-]+/g, '_').slice(-60)}`;
          await new Promise((resolve, reject) => {
            const task = S.uploadBytesResumable(S.ref(storage, path), pic.file, { contentType: pic.file.type });
            task.on('state_changed', (s) => { bar.firstElementChild.style.width = `${Math.round((s.bytesTransferred / s.totalBytes) * 100)}%`; }, reject, resolve);
          });
          image = { path, url: await S.getDownloadURL(S.ref(storage, path)) };
          bar.hidden = true;
        }
        await F.setDoc(ref, {
          title,
          date: el.date.value,
          time: el.time.value,
          location,
          artists: [...f.querySelectorAll('[name="artist"]:checked')].map((x) => x.value),
          otherArtists: el.otherArtists.value.trim(),
          description: el.description.value.trim(),
          image,
          status: el.status.value,
          ticketUrl,
          infoUrl,
          createdAt: old.createdAt || F.serverTimestamp(),
          updatedAt: F.serverTimestamp(),
        });
        await loadEvents(f.dataset.id ? `${title} saved. It shows on the Events page straight away.` : `${title} added. It shows on the Events page straight away.`);
      } catch (err) {
        out.textContent = err && err.code === 'storage/unauthorized' ? 'That picture couldn\'t be uploaded. Use a JPG, PNG or WebP under 8 MB.' : H.message(err);
        btn.disabled = false;
      }
    });

    // ---------- News ----------
    // Posts live in the "posts" collection. data/news.json holds starter posts: saving one here writes
    // your version to the database, and deleting one leaves a "deleted" marker so it stays hidden.
    const N = window.HyardNews;
    const nwGrid = $('nw-grid');
    const nwEditor = $('nw-editor');
    const nwStatus = $('nw-status');
    let posts = [];
    let starters = [];
    let nwCover = null; // { file, url } picked now, or { remove: true }
    let nwImages = []; // pictures in the text: { path, url }
    let nwFolder = '';
    let savedRange = null;
    const POST_STATUS = { published: 'Published', draft: 'Draft' };
    const COVER_STYLE = { banner: 'Banner behind the title, fading into black', inline: 'Picture under the title', none: 'Only on the cards' };
    const COVER_SIZE = { s: 'Small', m: 'Medium', l: 'Large', xl: 'Full screen' };
    const COVER_FOCUS = { top: 'Top', center: 'Middle', bottom: 'Bottom' };
    const FIG_POS = { left: 'Left', center: 'Center', right: 'Right', wide: 'Full width' };
    const FIG_SIZE = { s: 'Small', m: 'Medium', l: 'Large' };
    let selFig = null;
    const coverHtml = (c) => (c && c.url ? `<img src="${esc(c.url)}" alt="">` : '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">No cover yet</span>');
    const nwCard = (p) => `
      <article class="ev-card nw-card${p.status === 'draft' ? ' is-past' : ''}" data-post="${esc(p.id)}" tabindex="0" role="button" aria-label="Edit ${esc(p.title)}">
        <div class="ev-pic">${coverHtml(p.cover)}</div>
        <div class="ev-card-body">
          <p class="mono muted">${esc(N.fmt(p.date))}</p>
          <h3 class="display ev-card-title">${esc(p.title)}</h3>
          <p class="mono muted nw-card-text">${esc(N.summary(p, 120))}</p>
          <div class="ev-card-foot"><span class="nw-pills">${p.pinned ? pill('Featured', 'on') : ''}${pill(POST_STATUS[p.status] || 'Published', p.status === 'draft' ? 'off' : '')}</span><span class="mono svc-admin-edit">Edit <svg aria-hidden="true"><use href="#i-arrow"/></svg></span></div>
        </div>
      </article>`;
    const nwAdd = '<button type="button" class="ev-card ev-new" data-new-post><span class="display">+</span><span class="mono">Add a post</span></button>';
    const TOOLS = [
      ['h2', 'Heading', 'H'], ['h3', 'Subheading', 'h'], ['p', 'Paragraph', '¶'], ['bold', 'Bold', 'B'], ['italic', 'Italic', 'I'],
      ['quote', 'Quote', '“'], ['ul', 'Bulleted list', '•'], ['ol', 'Numbered list', '1.'], ['hr', 'Divider', '—'],
      ['link', 'Link', 'Link'], ['page', 'Link to a Hyard page', 'Hyard page'], ['unlink', 'Remove link', 'Unlink'], ['image', 'Picture', 'Picture'],
    ];
    const nwForm = (p, isNew) => `
      <form class="form ev-edit nw-edit" data-id="${esc(p.id || '')}" novalidate>
        <button type="button" class="link-btn mono svc-back" data-back>← All posts</button>
        <fieldset>
          <legend class="display svc-edit-title">${isNew ? 'New post' : esc(p.title)}</legend>
          <label class="field"><span class="field-label mono">Title</span><input type="text" name="title" value="${esc(p.title || '')}" required maxlength="140" placeholder="New single out now"></label>
          <div class="field-row">
            <label class="field"><span class="field-label mono">Date</span><input type="date" name="date" value="${esc(p.date || todayIso)}" required></label>
            <label class="field"><span class="field-label mono">Status</span><select name="status">${Object.entries(POST_STATUS).map(([k, v]) => `<option value="${k}"${(p.status || 'published') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          </div>
          <label class="field"><span class="field-label mono">Short summary <em class="muted">Shown on the cards and under the title. Optional: without it, the start of the text is used.</em></span><textarea name="excerpt" rows="2" maxlength="300">${esc(p.excerpt || '')}</textarea></label>
          <div class="field">
            <span class="field-label mono">Cover picture <em class="muted">JPG, PNG or WebP, up to 8 MB. Landscape or square works best.</em></span>
            <div class="ev-pic-edit">
              <div class="ev-pic" data-pic-preview>${coverHtml(p.cover)}</div>
              <div class="quick">
                <label class="more file-btn">${p.cover && p.cover.url ? 'Change cover' : 'Upload cover'}<input type="file" accept="image/jpeg,image/png,image/webp" data-cover hidden></label>
                <button type="button" class="link-btn mono" data-rm-cover${p.cover && p.cover.url ? '' : ' hidden'}>Remove cover</button>
              </div>
              <label class="field"><span class="field-label mono">Cover description <em class="muted">For screen readers: what's in the picture</em></span><input type="text" name="coverAlt" value="${esc((p.cover && p.cover.alt) || '')}" maxlength="200"></label>
            </div>
            <div class="field-row field-row-3 nw-cover-opts">
              <label class="field"><span class="field-label mono">On the article page</span><select name="coverStyle">${Object.entries(COVER_STYLE).map(([k, v]) => `<option value="${k}"${(p.coverStyle || 'banner') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
              <label class="field"><span class="field-label mono">Size</span><select name="coverSize">${Object.entries(COVER_SIZE).map(([k, v]) => `<option value="${k}"${(p.coverSize || 'l') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
              <label class="field"><span class="field-label mono">Show which part</span><select name="coverFocus">${Object.entries(COVER_FOCUS).map(([k, v]) => `<option value="${k}"${(p.coverFocus || 'center') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
            </div>
            <div class="nw-banner-prev" data-banner-prev aria-hidden="true">
              <div class="nw-banner-prev-pic"></div>
              <span class="display nw-banner-prev-title"></span>
              <span class="mono muted nw-banner-prev-label">Preview of the top of the article</span>
            </div>
          </div>
          <div class="field">
            <span class="field-label mono">Content</span>
            <div class="rte">
              <div class="rte-bar" role="toolbar" aria-label="Formatting">${TOOLS.map(([k, label, txt]) => `<button type="button" class="rte-btn mono${k === 'bold' ? ' is-b' : k === 'italic' ? ' is-i' : ''}" data-cmd="${k}" title="${esc(label)}" aria-label="${esc(label)}">${esc(txt)}</button>`).join('')}</div>
              <div class="rte-pop" data-pop="link" hidden>
                <label class="field"><span class="field-label mono">Link address <em class="muted">https://… or a hyardrecords.com address</em></span><input type="url" data-link-url placeholder="https://"></label>
                <label class="field"><span class="field-label mono">Link text <em class="muted">Only when no text is selected</em></span><input type="text" data-link-text maxlength="200"></label>
                <div class="quick"><button type="button" class="more" data-link-ok>Add link</button><button type="button" class="link-btn mono" data-pop-close>Cancel</button></div>
              </div>
              <div class="rte-pop" data-pop="page" hidden>
                <label class="field"><span class="field-label mono">Link to a Hyard page <em class="muted">Pages, releases, artists, events, products and posts</em></span><input type="search" data-page-q placeholder="Search, e.g. Mass Hypnosis" autocomplete="off"></label>
                <ul class="rte-pages" data-page-list role="listbox" aria-label="Hyard pages"></ul>
                <div class="quick"><button type="button" class="link-btn mono" data-pop-close>Cancel</button></div>
              </div>
              <div class="rte-area post-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Post content" data-rte>${N.clean(p.body || '') || '<p><br></p>'}</div>
              <div class="rte-figbar" data-figbar hidden role="toolbar" aria-label="Picture">
                <span class="mono muted">Position</span>${Object.entries(FIG_POS).map(([k, v]) => `<button type="button" class="rte-btn mono" data-fig-pos="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}
                <span class="mono muted">Size</span>${Object.entries(FIG_SIZE).map(([k, v]) => `<button type="button" class="rte-btn mono" data-fig-size="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}
                <span class="rte-figbar-sep"></span>
                <button type="button" class="rte-btn mono" data-fig-move="-1" aria-label="Move picture up">↑ Up</button>
                <button type="button" class="rte-btn mono" data-fig-move="1" aria-label="Move picture down">↓ Down</button>
                <button type="button" class="rte-btn mono" data-fig-rm>Remove</button>
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-rte-pic hidden>
              <div class="rte-foot mono muted"><span data-words></span><span>Select text, then press Link or Hyard page to link it.</span></div>
            </div>
          </div>
          <label class="check"><input type="checkbox" name="pinned"${p.pinned ? ' checked' : ''}><span class="check-box" aria-hidden="true"></span><span class="mono">Featured: pin to the top of the News page and the home page (only one post can be featured)</span></label>
          <label class="check"><input type="checkbox" name="presave"${p.presave ? ' checked' : ''}><span class="check-box" aria-hidden="true"></span><span class="mono">Show the Pre-save button for Beginning and The End</span></label>
        </fieldset>
        <span class="drop-progress upload-bar" hidden aria-hidden="true"><span></span></span>
        <div class="quick">
          <button class="more" type="submit">${isNew ? 'Add post' : 'Save changes'}</button>
          <button type="button" class="link-btn mono" data-back>Cancel</button>
          ${isNew ? '' : `<a class="link-btn mono" href="post?p=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Preview</a>`}
          ${isNew ? '' : '<button type="button" class="link-btn mono" data-delete-post>Delete post</button>'}
        </div>
        <p class="form-status mono muted" aria-live="polite"></p>
      </form>`;

    // Pages on the site the editor can link to
    let pageIndex = [
      ['Home', './', 'Page'], ['About the label', 'about', 'Page'], ['Artists', 'artists', 'Page'], ['Events', 'events', 'Page'],
      ['News', 'news', 'Page'], ['Search releases', 'releases', 'Page'], ['Send your demo', 'contact', 'Page'], ['Contact', 'get-in-touch', 'Page'],
      ['Press kit', 'press', 'Page'], ['Store', 'store', 'Page'], ['Services', 'store#services', 'Page'], ['Products', 'store#products', 'Page'],
      ['Log in / Sign up', 'account', 'Page'], ['Terms of service', 'terms', 'Page'], ['Privacy policy', 'privacy', 'Page'],
    ].map(([name, href, kind]) => ({ name, href, kind }));
    const extraPages = Promise.all([
      fetch('data/releases.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})),
      fetch('data/artists.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})),
    ]).then(([rel, art]) => {
      const names = (r) => (r.artists || []).map((a) => (typeof a === 'string' ? a : a.name)).filter(Boolean).join(', ');
      pageIndex = pageIndex
        .concat((art.artists || []).map((a) => ({ name: a.name, href: `artist-${a.slug}`, kind: 'Artist' })))
        .concat((rel.releases || []).map((r) => ({ name: r.title, sub: [names(r), r.catalog].filter(Boolean).join(' · '), href: `release-${String(r.catalog).toLowerCase()}`, kind: 'Release' })));
    });
    const allPages = () => pageIndex
      .concat(events.map((e) => ({ name: e.title, sub: e.date, href: 'events', kind: 'Event' })))
      .concat(products.filter((x) => x.active !== false).map((x) => ({ name: x.title, sub: x.category, href: `product?p=${encodeURIComponent(x.id)}`, kind: 'Product' })))
      .concat(posts.map((x) => ({ name: x.title, sub: x.date, href: N.url(x), kind: 'Post' })));

    const updateWords = () => {
      const area = nwEditor.querySelector('[data-rte]');
      const n = N.text(area.innerHTML).split(' ').filter(Boolean).length;
      nwEditor.querySelector('[data-words]').textContent = `${n} ${n === 1 ? 'word' : 'words'}`;
    };
    const showNwGrid = (msg) => {
      nwEditor.hidden = true;
      nwEditor.innerHTML = '';
      nwGrid.hidden = false;
      nwGrid.innerHTML = nwAdd + N.order(posts).map(nwCard).join('');
      nwStatus.textContent = msg || '';
    };
    const openPost = (p, isNew) => {
      nwCover = null;
      nwImages = (p.images || []).slice();
      nwFolder = p.folder || F.doc(F.collection(db, 'posts')).id;
      savedRange = null;
      nwGrid.hidden = true;
      nwEditor.hidden = false;
      nwEditor.innerHTML = nwForm(p, isNew);
      nwStatus.textContent = '';
      selFig = null;
      prepFigures();
      updateBannerPrev();
      updateWords();
      const top = $('a-news').getBoundingClientRect().top + window.scrollY - 110;
      if (window.scrollY > top) window.scrollTo({ top });
      nwEditor.querySelector('[name="title"]').focus({ preventScroll: true });
    };
    // Pictures in the text: the picture itself can't be typed into, its caption can
    const prepFigures = () => {
      const a = nwEditor.querySelector('[data-rte]');
      if (!a) return;
      a.querySelectorAll('figure').forEach((fig) => {
        // A picture inside a paragraph moves out to its own block
        let top = fig;
        while (top.parentElement && top.parentElement !== a) top = top.parentElement;
        if (top !== fig) top.after(fig);
        fig.setAttribute('contenteditable', 'false');
        if (![...fig.classList].some((c) => c.startsWith('pos-'))) fig.classList.add('pos-center');
        if (![...fig.classList].some((c) => c.startsWith('size-'))) fig.classList.add('size-l');
        const cap = fig.querySelector('figcaption');
        if (cap) cap.setAttribute('contenteditable', 'true');
      });
    };
    const figBar = () => nwEditor.querySelector('[data-figbar]');
    const placeFigBar = () => {
      const bar = figBar();
      if (!bar) return;
      if (!selFig || !nwEditor.contains(selFig)) { bar.hidden = true; selFig = null; return; }
      bar.hidden = false;
      const rte = nwEditor.querySelector('.rte');
      bar.style.top = `${selFig.getBoundingClientRect().top - rte.getBoundingClientRect().top - bar.offsetHeight - 8}px`;
      const pos = (([...selFig.classList].find((c) => c.startsWith('pos-')) || 'pos-center').slice(4));
      const size = (([...selFig.classList].find((c) => c.startsWith('size-')) || 'size-l').slice(5));
      bar.querySelectorAll('[data-fig-pos]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.figPos === pos)));
      bar.querySelectorAll('[data-fig-size]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.figSize === size)); b.disabled = pos === 'wide'; });
    };
    const selectFig = (fig) => {
      nwEditor.querySelectorAll('[data-rte] figure.is-selected').forEach((f) => f.classList.remove('is-selected'));
      selFig = fig;
      if (fig) fig.classList.add('is-selected');
      placeFigBar();
    };
    const setFigClass = (prefix, value) => {
      if (!selFig) return;
      [...selFig.classList].filter((c) => c.startsWith(prefix)).forEach((c) => selFig.classList.remove(c));
      selFig.classList.add(`${prefix}${value}`);
      placeFigBar();
    };
    // Live preview of the banner at the top of the article
    const updateBannerPrev = () => {
      const box = nwEditor.querySelector('[data-banner-prev]');
      if (!box) return;
      const f = nwEditor.querySelector('form').elements;
      const img = nwEditor.querySelector('[data-pic-preview] img');
      const style = f.coverStyle.value;
      box.hidden = !img || style === 'none';
      box.dataset.style = style;
      box.dataset.size = f.coverSize.value;
      box.dataset.focus = f.coverFocus.value;
      box.querySelector('.nw-banner-prev-pic').innerHTML = img ? `<img src="${esc(img.src)}" alt="">` : '';
      box.querySelector('.nw-banner-prev-title').textContent = f.title.value.trim() || 'Post title';
      f.coverSize.closest('.field').hidden = style === 'none';
      f.coverFocus.closest('.field').hidden = style === 'none';
    };
    const loadPosts = async (msg) => {
      if (!starters.length) starters = await N.starter();
      const snap = await F.getDocs(F.collection(db, 'posts'));
      const live = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      const byId = new Map(starters.map((x) => [x.id, { ...x, starter: true }]));
      live.forEach((x) => byId.set(x.id, x));
      posts = [...byId.values()].filter((x) => x.status !== 'deleted');
      $('adm-count-news').textContent = posts.filter((x) => x.status === 'draft').length || '';
      showNwGrid(msg);
    };
    loadPosts().catch((err) => { nwStatus.textContent = H.message(err); });

    const pickPost = (e) => {
      if (e.target.closest('[data-new-post]')) { openPost({ status: 'published', date: todayIso }, true); return; }
      const card = e.target.closest('[data-post]');
      if (card) openPost(posts.find((x) => x.id === card.dataset.post), false);
    };
    nwGrid.addEventListener('click', pickPost);
    nwGrid.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-post]')) { e.preventDefault(); pickPost(e); } });

    // ---------- Editor ----------
    const area = () => nwEditor.querySelector('[data-rte]');
    const keepRange = () => {
      const sel = window.getSelection();
      if (sel.rangeCount && area() && area().contains(sel.getRangeAt(0).commonAncestorContainer)) savedRange = sel.getRangeAt(0).cloneRange();
    };
    const restoreRange = () => {
      area().focus({ preventScroll: true });
      const sel = window.getSelection();
      sel.removeAllRanges();
      if (savedRange) sel.addRange(savedRange);
      else { const r = document.createRange(); r.selectNodeContents(area()); r.collapse(false); sel.addRange(r); }
    };
    const exec = (cmd, value) => { restoreRange(); document.execCommand(cmd, false, value); keepRange(); updateWords(); };
    const closePops = () => nwEditor.querySelectorAll('.rte-pop').forEach((x) => { x.hidden = true; });
    const openPop = (name) => {
      closePops();
      const pop = nwEditor.querySelector(`[data-pop="${name}"]`);
      pop.hidden = false;
      return pop;
    };
    const selectedText = () => (savedRange ? savedRange.toString() : '');
    const insertLink = (href, text) => {
      const clean = N.safeHref(href);
      if (!clean) return false;
      restoreRange();
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.isCollapsed) {
        document.execCommand('createLink', false, clean);
      } else {
        document.execCommand('insertHTML', false, `<a href="${esc(clean)}">${esc(text || clean)}</a>&nbsp;`);
      }
      keepRange();
      updateWords();
      return true;
    };
    const renderPages = (q) => {
      const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
      const list = allPages().filter((x) => words.every((w) => `${x.name} ${x.sub || ''} ${x.kind}`.toLowerCase().includes(w))).slice(0, 40);
      nwEditor.querySelector('[data-page-list]').innerHTML = list.length
        ? list.map((x) => `<li><button type="button" class="rte-page" data-href="${esc(x.href)}" data-name="${esc(x.name)}"><span class="mono muted">${esc(x.kind)}</span><span class="rte-page-name">${esc(x.name)}</span>${x.sub ? `<span class="mono muted">${esc(x.sub)}</span>` : ''}</button></li>`).join('')
        : '<li class="mono muted rte-none">Nothing matches.</li>';
    };

    nwEditor.addEventListener('mousedown', (e) => { if (e.target.closest('.rte-btn')) e.preventDefault(); });
    document.addEventListener('selectionchange', () => { if (!nwEditor.hidden && area()) keepRange(); });
    window.addEventListener('resize', () => { if (selFig) placeFigBar(); });
    nwEditor.addEventListener('input', (e) => { if (e.target.matches('[name="title"]')) updateBannerPrev(); if (e.target.closest('[data-rte]')) { updateWords(); placeFigBar(); } if (e.target.matches('[data-page-q]')) renderPages(e.target.value); });
    nwEditor.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-link-url], [data-link-text]') && e.key === 'Enter') { e.preventDefault(); nwEditor.querySelector('[data-link-ok]').click(); }
      if (e.target.matches('[data-page-q]') && e.key === 'Enter') { e.preventDefault(); const first = nwEditor.querySelector('.rte-page'); if (first) first.click(); }
      if (e.key === 'Escape' && e.target.closest('.rte-pop')) { closePops(); restoreRange(); }
      // A selected picture can be removed with Backspace or Delete
      if (selFig && (e.key === 'Backspace' || e.key === 'Delete') && e.target.closest('[data-rte]') && !e.target.closest('figcaption') && window.getSelection().isCollapsed) {
        const sel = window.getSelection();
        if (!sel.rangeCount || !e.target.closest('[data-rte]').contains(sel.anchorNode) || sel.anchorNode === selFig || selFig.contains(sel.anchorNode)) { e.preventDefault(); selFig.remove(); selectFig(null); updateWords(); }
      }
    });
    // Pasted text keeps only the basic formatting the site shows
    nwEditor.addEventListener('paste', (e) => {
      if (!e.target.closest('[data-rte]')) return;
      e.preventDefault();
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      const out = html ? N.clean(html) : text.split(/\n\s*\n/).map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('');
      document.execCommand('insertHTML', false, out);
      updateWords();
    });

    const uploadImage = async (file, folderPath, bar, out) => {
      const path = `${folderPath}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-60)}`;
      bar.hidden = false;
      await new Promise((resolve, reject) => {
        const task = S.uploadBytesResumable(S.ref(storage, path), file, { contentType: file.type });
        task.on('state_changed', (s) => { bar.firstElementChild.style.width = `${Math.round((s.bytesTransferred / s.totalBytes) * 100)}%`; }, reject, resolve);
      });
      bar.hidden = true;
      if (out) out.textContent = '';
      return { path, url: await S.getDownloadURL(S.ref(storage, path)) };
    };
    const goodPic = (f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type) && f.size <= 8 * 1024 * 1024;

    nwEditor.addEventListener('change', async (e) => {
      if (e.target.matches('[name="coverStyle"], [name="coverSize"], [name="coverFocus"]')) { updateBannerPrev(); return; }
      const out = nwEditor.querySelector('.form-status');
      const cov = e.target.closest('[data-cover]');
      if (cov && cov.files[0]) {
        const f = cov.files[0];
        if (!goodPic(f) || f.type === 'image/gif') { out.textContent = 'Use a JPG, PNG or WebP picture under 8 MB.'; cov.value = ''; return; }
        out.textContent = '';
        nwCover = { file: f };
        const prev = nwEditor.querySelector('[data-pic-preview]');
        prev.innerHTML = '<img alt="">';
        prev.firstChild.src = URL.createObjectURL(f);
        nwEditor.querySelector('[data-rm-cover]').hidden = false;
        updateBannerPrev();
        return;
      }
      const pic = e.target.closest('[data-rte-pic]');
      if (pic && pic.files[0]) {
        const f = pic.files[0];
        pic.value = '';
        if (!goodPic(f)) { out.textContent = 'Use a JPG, PNG, WebP or GIF picture under 8 MB.'; return; }
        out.textContent = 'Uploading the picture…';
        try {
          const img = await uploadImage(f, `posts/${nwFolder}`, nwEditor.querySelector('.upload-bar'), out);
          nwImages.push(img);
          restoreRange();
          document.execCommand('insertHTML', false, `<figure class="pos-center size-l"><img src="${esc(img.url)}" alt=""><figcaption>Caption (optional)</figcaption></figure><p><br></p>`);
          keepRange();
          prepFigures();
          out.textContent = 'Picture added. Click it to choose its position and size, and click the caption under it to write one.';
        } catch (err) {
          nwEditor.querySelector('.upload-bar').hidden = true;
          out.textContent = err && err.code === 'storage/unauthorized' ? 'That picture couldn\'t be uploaded. Use a JPG, PNG, WebP or GIF under 8 MB.' : H.message(err);
        }
      }
    });

    nwEditor.addEventListener('click', async (e) => {
      if (e.target.closest('[data-back]')) { showNwGrid(); return; }
      const out = nwEditor.querySelector('.form-status');
      const fp = e.target.closest('[data-fig-pos]');
      if (fp) { setFigClass('pos-', fp.dataset.figPos); return; }
      const fs = e.target.closest('[data-fig-size]');
      if (fs) { setFigClass('size-', fs.dataset.figSize); return; }
      const fm = e.target.closest('[data-fig-move]');
      if (fm && selFig) {
        const dir = Number(fm.dataset.figMove);
        const sib = dir < 0 ? selFig.previousElementSibling : selFig.nextElementSibling;
        if (sib) { if (dir < 0) sib.before(selFig); else sib.after(selFig); }
        placeFigBar();
        selFig.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      if (e.target.closest('[data-fig-rm]') && selFig) { selFig.remove(); selectFig(null); updateWords(); return; }
      if (e.target.closest('[data-rte]')) {
        const fig = e.target.closest('figure');
        if (fig && !e.target.closest('figcaption')) { selectFig(fig); return; }
        if (!fig) selectFig(null);
      }
      const tool = e.target.closest('[data-cmd]');
      if (tool) {
        const k = tool.dataset.cmd;
        const BLOCK = { h2: 'H2', h3: 'H3', p: 'P', quote: 'BLOCKQUOTE' };
        if (BLOCK[k]) exec('formatBlock', BLOCK[k]);
        else if (k === 'bold') exec('bold');
        else if (k === 'italic') exec('italic');
        else if (k === 'ul') exec('insertUnorderedList');
        else if (k === 'ol') exec('insertOrderedList');
        else if (k === 'hr') exec('insertHorizontalRule');
        else if (k === 'unlink') exec('unlink');
        else if (k === 'image') { keepRange(); nwEditor.querySelector('[data-rte-pic]').click(); }
        else if (k === 'link') {
          keepRange();
          const pop = openPop('link');
          const t = selectedText();
          pop.querySelector('[data-link-text]').value = t;
          pop.querySelector('[data-link-text]').closest('.field').hidden = !!t;
          pop.querySelector('[data-link-url]').value = '';
          pop.querySelector('[data-link-url]').focus();
        } else if (k === 'page') {
          keepRange();
          const pop = openPop('page');
          await extraPages;
          pop.querySelector('[data-page-q]').value = '';
          renderPages('');
          pop.querySelector('[data-page-q]').focus();
        }
        return;
      }
      if (e.target.closest('[data-pop-close]')) { closePops(); restoreRange(); return; }
      if (e.target.closest('[data-link-ok]')) {
        const pop = nwEditor.querySelector('[data-pop="link"]');
        const href = pop.querySelector('[data-link-url]').value.trim();
        const t = pop.querySelector('[data-link-text]').value.trim();
        if (!insertLink(/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(href) ? `https://${href}` : href, t)) { out.textContent = 'Enter a full link starting with https://'; return; }
        out.textContent = '';
        closePops();
        return;
      }
      const page = e.target.closest('.rte-page');
      if (page) {
        insertLink(page.dataset.href, page.dataset.name);
        closePops();
        out.textContent = `Linked to ${page.dataset.name}.`;
        return;
      }
      if (e.target.closest('[data-rm-cover]')) {
        nwCover = { remove: true };
        nwEditor.querySelector('[data-pic-preview]').innerHTML = coverHtml(null);
        nwEditor.querySelector('[data-cover]').value = '';
        e.target.closest('[data-rm-cover]').hidden = true;
        updateBannerPrev();
        return;
      }
      if (e.target.closest('[data-delete-post]')) {
        const f = e.target.closest('form');
        const p = posts.find((x) => x.id === f.dataset.id);
        if (!window.confirm(`Delete "${p.title}"? It disappears from the News page and the home page. This can't be undone.`)) return;
        try {
          await Promise.all([p.cover, ...(p.images || [])].filter((x) => x && x.path).map((x) => S.deleteObject(S.ref(storage, x.path)).catch(() => {})));
          if (starters.some((x) => x.id === p.id)) await F.setDoc(F.doc(db, 'posts', p.id), { status: 'deleted', title: p.title, date: p.date, updatedAt: F.serverTimestamp() });
          else await F.deleteDoc(F.doc(db, 'posts', p.id));
          await loadPosts(`${p.title} deleted.`);
        } catch (err) { out.textContent = H.message(err); }
      }
    });

    nwEditor.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const el = f.elements;
      const out = f.querySelector('.form-status');
      const title = el.title.value.trim();
      if (!title) { out.textContent = 'Give the post a title.'; el.title.focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(el.date.value)) { out.textContent = 'Pick the date of the post.'; el.date.focus(); return; }
      // Tidy the content: drop empty or untouched captions, use captions as picture descriptions
      const box = document.createElement('div');
      box.innerHTML = area().innerHTML;
      box.querySelectorAll('figure').forEach((fig) => fig.classList.remove('is-selected'));
      box.querySelectorAll('figure').forEach((fig) => {
        const cap = fig.querySelector('figcaption');
        const img = fig.querySelector('img');
        if (!img) { fig.remove(); return; }
        if (cap && (!cap.textContent.trim() || cap.textContent.trim() === 'Caption (optional)')) cap.remove();
        else if (cap && !img.getAttribute('alt')) img.setAttribute('alt', cap.textContent.trim());
      });
      const body = N.clean(box.innerHTML);
      if (!N.text(body) && !/<img/i.test(body)) { out.textContent = 'Write something in the content first.'; area().focus(); return; }
      const old = posts.find((x) => x.id === f.dataset.id) || {};
      let id = f.dataset.id;
      if (!id) {
        const base = slug(title).slice(0, 60).replace(/-$/, '') || 'post';
        id = base;
        for (let n = 2; posts.some((x) => x.id === id) || starters.some((x) => x.id === id); n += 1) id = `${base}-${n}`;
      }
      const ref = F.doc(db, 'posts', id);
      const btn = f.querySelector('[type="submit"]');
      const bar = f.querySelector('.upload-bar');
      btn.disabled = true;
      try {
        let cover = old.cover ? { ...old.cover } : null;
        if (nwCover && (nwCover.remove || nwCover.file) && cover) {
          if (cover.path) await S.deleteObject(S.ref(storage, cover.path)).catch(() => {});
          cover = null;
        }
        if (nwCover && nwCover.file) {
          out.textContent = 'Uploading the cover…';
          cover = await uploadImage(nwCover.file, `posts/${nwFolder}`, bar, out);
        }
        if (cover) cover.alt = el.coverAlt.value.trim();
        // Pictures taken out of the text are deleted from storage
        const images = nwImages.filter((x) => body.includes(x.url));
        await Promise.all(nwImages.filter((x) => !images.includes(x) && x.path).map((x) => S.deleteObject(S.ref(storage, x.path)).catch(() => {})));
        const pinned = el.pinned.checked;
        await F.setDoc(ref, {
          title,
          date: el.date.value,
          status: el.status.value,
          excerpt: el.excerpt.value.trim(),
          cover,
          body,
          images,
          folder: nwFolder,
          pinned,
          presave: el.presave.checked,
          coverStyle: el.coverStyle.value,
          coverSize: el.coverSize.value,
          coverFocus: el.coverFocus.value,
          createdAt: old.createdAt || F.serverTimestamp(),
          updatedAt: F.serverTimestamp(),
        });
        // Only one featured post: unpin the others
        if (pinned) {
          await Promise.all(posts.filter((x) => x.id !== id && x.pinned).map((x) => {
            const r = F.doc(db, 'posts', x.id);
            if (x.starter) {
              const { starter, ...rest } = x;
              return F.setDoc(r, { ...rest, pinned: false, updatedAt: F.serverTimestamp() });
            }
            return F.updateDoc(r, { pinned: false, updatedAt: F.serverTimestamp() });
          }));
        }
        const where = el.status.value === 'draft' ? 'It\'s a draft, so only you can see it.' : 'It shows on the News page straight away.';
        await loadPosts(`${title} ${f.dataset.id ? 'saved' : 'added'}. ${where}`);
      } catch (err) {
        bar.hidden = true;
        out.textContent = err && err.code === 'storage/unauthorized' ? 'That picture couldn\'t be uploaded. Use a JPG, PNG or WebP under 8 MB.' : H.message(err);
        btn.disabled = false;
      }
    });
  });
})();
