(() => {
  const C = window.HyardCatalog;
  const $ = (id) => document.getElementById(id);
  const input = $('q');
  const list = $('results');
  const count = $('count');
  const synced = $('synced');
  const empty = $('empty');
  const artistEl = $('f-artist');
  const typeEl = $('f-type');
  const yearEl = $('f-year');
  const sortEl = $('f-sort');
  const clearBtn = $('f-clear');

  const state = { q: '', artist: '', type: '', year: '', sort: 'newest' };
  let releases = [];
  let artists = [];

  // Highlight query words, escaping everything else
  const mark = (text, words) => {
    const src = String(text ?? '');
    const usable = words.filter((w) => w.length >= 2);
    if (!usable.length) return C.esc(src);
    const re = new RegExp(usable.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'ig');
    let out = '';
    let last = 0;
    src.replace(re, (m, offset) => {
      out += C.esc(src.slice(last, offset)) + `<mark>${C.esc(m)}</mark>`;
      last = offset + m.length;
      return m;
    });
    return out + C.esc(src.slice(last));
  };

  const index = (r) => {
    r._hay = C.norm([
      r.catalog, String(r.catalog).replace('-', ''), r.title, r.type,
      (r.artists || []).join(' '),
      (r.tracks || []).map((t) => `${t.title} ${(t.artists || []).join(' ')}`).join(' '),
      r.releaseDate,
    ].join(' '));
    r._slugs = C.rosterFor(r, artists).map((a) => a.slug);
    r._year = (r.releaseDate || '').slice(0, 4);
    return r;
  };

  const sorters = {
    newest: (a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')) || String(b.catalog).localeCompare(String(a.catalog)),
    oldest: (a, b) => String(a.releaseDate || '9999').localeCompare(String(b.releaseDate || '9999')) || String(a.catalog).localeCompare(String(b.catalog)),
    catalog: (a, b) => String(a.catalog).localeCompare(String(b.catalog)),
    title: (a, b) => String(a.title).localeCompare(String(b.title), 'en', { sensitivity: 'base' }),
  };

  const pill = (value, label) => `<button class="filter" type="button" data-value="${C.esc(value)}" aria-pressed="false">${C.esc(label)}</button>`;

  const syncPills = (el, value) => el.querySelectorAll('.filter').forEach((b) => {
    const on = b.dataset.value === value;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });

  const render = () => {
    const words = C.norm(state.q).split(' ').filter(Boolean);
    const hits = releases
      .filter((r) => words.every((w) => r._hay.includes(w)))
      .filter((r) => !state.artist || r._slugs.includes(state.artist))
      .filter((r) => !state.type || r.type === state.type)
      .filter((r) => !state.year || r._year === state.year)
      .sort(sorters[state.sort] || sorters.newest);

    const narrowed = words.length || state.artist || state.type || state.year;
    count.textContent = narrowed ? `${hits.length} of ${releases.length} releases` : `${releases.length} releases`;
    empty.hidden = hits.length > 0;
    clearBtn.hidden = !(narrowed || state.sort !== 'newest');

    list.innerHTML = hits.map((r, i) => {
      const matchingTracks = words.length ? (r.tracks || []).filter((t) => words.some((w) => C.norm(t.title).includes(w))) : [];
      const showTracks = (r.tracks || []).length > 1 || matchingTracks.length;
      const tracksHtml = showTracks ? `
        <ol class="result-tracks">
          ${(r.tracks || []).map((t) => `
            <li class="${matchingTracks.includes(t) ? 'is-match' : ''}">
              <span class="mono muted">${String(t.number || '').padStart(2, '0')}</span>
              <span>${mark(t.title, words)}</span>
              <span class="mono muted">${C.fmtDuration(t.durationMs)}</span>
            </li>`).join('')}
        </ol>` : '';
      return `
        <li class="result" style="--d:${Math.min(i, 12) * 45}ms">
          <a class="result-row" href="${C.href(r)}">
            <span class="result-art">${r.cover ? `<img src="${C.esc(r.cover)}" alt="" loading="lazy" width="96" height="96">` : ''}</span>
            <span class="result-cat mono">${mark(r.catalog || '', words)}</span>
            <span class="result-main">
              <span class="result-title display">${mark(r.title, words)}</span>
              <span class="mono muted">${mark((r.artists || []).join(' × '), words)}</span>
            </span>
            <span class="result-type mono muted">${C.esc(r.type || '')}</span>
            <span class="result-date mono muted">${C.esc(C.fmtDate(r.releaseDate))}</span>
            <svg class="result-go" aria-hidden="true"><use href="#i-arrow"/></svg>
          </a>
          ${tracksHtml}
        </li>`;
    }).join('');

    void list.offsetWidth; // commit the hidden state so rows slide in
    list.querySelectorAll('.result').forEach((el) => el.classList.add('in'));
  };

  const syncUrl = () => {
    const url = new URL(location.href);
    ['q', 'artist', 'type', 'year', 'sort'].forEach((k) => {
      const v = k === 'q' ? state.q.trim() : state[k];
      if (v && !(k === 'sort' && v === 'newest')) url.searchParams.set(k, v); else url.searchParams.delete(k);
    });
    history.replaceState(null, '', url);
  };

  const update = () => { render(); syncUrl(); };

  // ---------- Events ----------
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = input.value; update(); }, 80);
  });
  const pillGroup = (el, key) => el.addEventListener('click', (e) => {
    const b = e.target.closest('.filter');
    if (!b) return;
    state[key] = b.dataset.value;
    syncPills(el, state[key]);
    update();
  });
  pillGroup(artistEl, 'artist');
  pillGroup(typeEl, 'type');
  yearEl.addEventListener('change', () => { state.year = yearEl.value; update(); });
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; update(); });

  const clearAll = () => {
    Object.assign(state, { q: '', artist: '', type: '', year: '', sort: 'newest' });
    input.value = '';
    yearEl.value = '';
    sortEl.value = 'newest';
    syncPills(artistEl, '');
    syncPills(typeEl, '');
    update();
    input.focus();
  };
  clearBtn.addEventListener('click', clearAll);
  $('empty-clear').addEventListener('click', clearAll);

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      input.focus();
    }
  });

  // ---------- Load ----------
  const params = new URLSearchParams(location.search);
  ['q', 'artist', 'type', 'year', 'sort'].forEach((k) => { if (params.get(k)) state[k] = params.get(k); });
  input.value = state.q;

  C.load().then((data) => {
    artists = data.artists;
    releases = data.releases.filter(C.onLabel).map(index);

    // Filter options come from what's actually in the catalog
    artists.filter((a) => releases.some((r) => r._slugs.includes(a.slug)))
      .forEach((a) => artistEl.insertAdjacentHTML('beforeend', pill(a.slug, a.name)));
    const typeOrder = ['Single', 'EP', 'Album', 'Compilation'];
    [...new Set(releases.map((r) => r.type).filter(Boolean))]
      .sort((a, b) => (typeOrder.indexOf(a) + 1 || 99) - (typeOrder.indexOf(b) + 1 || 99))
      .forEach((ty) => typeEl.insertAdjacentHTML('beforeend', pill(ty, `${ty}s`)));
    [...new Set(releases.map((r) => r._year).filter(Boolean))].sort().reverse()
      .forEach((y) => yearEl.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`));

    syncPills(artistEl, state.artist);
    syncPills(typeEl, state.type);
    yearEl.value = state.year;
    if (!sorters[state.sort]) state.sort = 'newest';
    sortEl.value = state.sort;

    synced.textContent = data.syncedAt
      ? `Synced with Spotify ${new Date(data.syncedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : 'From Spotify · daily sync not running yet';
    render();
  }).catch(() => {
    count.textContent = "Couldn't load releases. Refresh to try again.";
  });
})();
