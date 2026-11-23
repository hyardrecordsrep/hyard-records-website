// Label-only admin: sales overview, review demos, move orders along, upload finished files, edit services,
// products and prices, add events.
// Access comes from the "admin" flag on the account, given by the claimAdmin server function to the
// emails in functions/.env (ADMIN_EMAILS). The database rules check the same flag.
(() => {
  const H = window.HyardFirebase;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;
  const pill = (t, k) => `<span class="pill mono${k ? ` pill-${k}` : ''}">${esc(t)}</span>`;
  const shortId = (id) => `HYO-${String(id).slice(0, 6).toUpperCase()}`;

  const TABS = ['a-overview', 'a-demos', 'a-orders', 'a-services', 'a-products', 'a-events'];
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
    const DEFAULT_CATS = ['Drum kits', 'Sample packs', 'Presets', 'MIDI packs', 'Loops'];
    let products = [];
    let pend = {}; // files picked in the form: { image, preview, file } or { removeImage: true, removePreview: true }
    const prodCard = (p) => `
      <article class="prod prod-admin${p.active === false ? ' is-off' : ''}" data-prod="${esc(p.id)}" tabindex="0" role="button" aria-label="Edit ${esc(p.title)}">
        <div class="ev-pic prod-pic">${p.image && p.image.url ? `<img src="${esc(p.image.url)}" alt="" loading="lazy">` : '<svg aria-hidden="true"><use href="#globe"/></svg><span class="mono muted">No picture yet</span>'}</div>
        <div class="prod-body">
          <div class="svc-admin-head">${p.category ? `<span class="mono muted prod-cat">${esc(p.category)}</span>` : '<span></span>'}${p.active === false ? pill('Hidden', 'off') : ''}</div>
          <h3 class="display prod-title">${esc(p.title)}</h3>
          ${p.description ? `<p class="prod-desc">${esc(p.description)}</p>` : ''}
          <p class="mono muted">${esc([p.file && p.file.name ? `${p.file.name} · ${H.bytes(p.file.size || 0)}` : 'No file yet', p.preview && p.preview.url ? 'Preview' : 'No preview'].join(' · '))}</p>
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
            <span class="field-label mono">MP3 preview <em class="muted">A short demo artists can play before buying. MP3, up to 20 MB.</em></span>
            <div class="quick prod-file">
              <audio controls preload="none" data-audio${p.preview && p.preview.url ? ` src="${esc(p.preview.url)}"` : ' hidden'}></audio>
              <span class="mono muted" data-cur="preview"${p.preview && p.preview.url ? ' hidden' : ''}>No preview yet</span>
              <label class="more file-btn">${p.preview && p.preview.url ? 'Replace preview' : 'Upload preview'}<input type="file" accept="audio/mpeg,.mp3" data-pick="preview" hidden></label>
              <button type="button" class="link-btn mono" data-unpick="preview"${p.preview && p.preview.url ? '' : ' hidden'}>Remove preview</button>
            </div>
          </div>
          ${fileRow('file', 'Product file', 'What buyers download, usually a ZIP. Up to 2 GB. Only buyers can get it.', '.zip,.rar,.7z,application/zip,application/x-zip-compressed,application/octet-stream,*/*', p.file && p.file.name ? `${p.file.name} · ${H.bytes(p.file.size || 0)}` : '')}
          <label class="check"><input type="checkbox" name="active"${p.active !== false ? ' checked' : ''}><span class="check-box" aria-hidden="true"></span><span class="mono">Show this product to artists</span></label>
        </fieldset>
        <span class="drop-progress upload-bar" hidden aria-hidden="true"><span></span></span>
        <div class="quick">
          <button class="more" type="submit">${isNew ? 'Add product' : 'Save changes'}</button>
          <button type="button" class="link-btn mono" data-back>Cancel</button>
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
      pGrid.hidden = true;
      pEditor.hidden = false;
      pEditor.innerHTML = prodForm(p, isNew);
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
    };
    pEditor.addEventListener('change', (e) => {
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
        pEditor.querySelector('[data-cur="file"]').textContent = `${f.name} · ${H.bytes(f.size)} (uploads when you save)`;
      }
    });
    pEditor.addEventListener('click', async (e) => {
      if (e.target.closest('[data-back]')) { showProdGrid(); return; }
      const un = e.target.closest('[data-unpick]');
      if (un) {
        const key = un.dataset.unpick;
        delete pend[key];
        pend[`remove_${key}`] = true;
        un.hidden = true;
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
          await Promise.all([p.image, p.preview, p.file].filter((x) => x && x.path).map((x) => S.deleteObject(S.ref(storage, x.path)).catch(() => {})));
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
      if (el.active.checked && !pend.file && !(old.file && old.file.path)) { out.textContent = 'Upload the product file before showing it to artists, or untick "Show this product to artists" to save it as a draft.'; return; }
      const ref = f.dataset.id ? F.doc(db, 'products', f.dataset.id) : F.doc(F.collection(db, 'products'));
      const btn = f.querySelector('[type="submit"]');
      const bar = f.querySelector('.upload-bar');
      btn.disabled = true;
      try {
        const kept = { image: old.image || null, preview: old.preview || null, file: old.file || null };
        const uploads = ['image', 'preview', 'file'].filter((k) => pend[k]);
        const totalBytes = uploads.reduce((n, k) => n + pend[k].size, 0) || 1;
        let doneBytes = 0;
        for (const k of ['image', 'preview', 'file']) {
          if ((pend[k] || pend[`remove_${k}`]) && kept[k] && kept[k].path) {
            await S.deleteObject(S.ref(storage, kept[k].path)).catch(() => {});
            kept[k] = null;
          }
        }
        for (const k of uploads) {
          const file = pend[k];
          const folder = k === 'file' ? 'files' : 'public';
          const path = `products/${ref.id}/${folder}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
          bar.hidden = false;
          out.textContent = `Uploading ${k === 'file' ? 'the product file' : k === 'preview' ? 'the preview' : 'the image'}…`;
          const type = file.type || (k === 'preview' ? 'audio/mpeg' : 'application/octet-stream');
          await new Promise((resolve, reject) => {
            const task = S.uploadBytesResumable(S.ref(storage, path), file, { contentType: type });
            task.on('state_changed', (s) => { bar.firstElementChild.style.width = `${Math.round(((doneBytes + s.bytesTransferred) / totalBytes) * 100)}%`; }, reject, resolve);
          });
          doneBytes += file.size;
          kept[k] = k === 'file'
            ? { path, name: file.name, size: file.size }
            : { path, url: await S.getDownloadURL(S.ref(storage, path)) };
        }
        bar.hidden = true;
        await F.setDoc(ref, {
          title,
          category: el.category.value.trim(),
          price,
          order: Number(el.order.value) || 0,
          description: el.description.value.trim(),
          image: kept.image,
          preview: kept.preview,
          file: kept.file,
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
  });
})();
