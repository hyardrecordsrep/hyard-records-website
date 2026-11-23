// Label-only admin: review demos, move orders along, upload finished files, edit services and prices, add events.
// Access comes from the "admin" flag on the account, given by the claimAdmin server function to the
// emails in functions/.env (ADMIN_EMAILS). The database rules check the same flag.
(() => {
  const H = window.HyardFirebase;
  const $ = (id) => document.getElementById(id);
  const esc = H.esc;
  const pill = (t, k) => `<span class="pill mono${k ? ` pill-${k}` : ''}">${esc(t)}</span>`;
  const shortId = (id) => `HYO-${String(id).slice(0, 6).toUpperCase()}`;

  const TABS = ['a-demos', 'a-orders', 'a-services', 'a-events'];
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
