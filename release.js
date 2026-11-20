(() => {
  const C = window.HyardCatalog;
  const $ = (id) => document.getElementById(id);
  const code = (new URLSearchParams(location.search).get('c') || document.querySelector('meta[name="hyard-release"]')?.content || '').toUpperCase();

  const setMeta = (sel, attr, value) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, value); };

  C.load().then(({ releases, artists }) => {
    const list = C.sort(releases.filter(C.onLabel));
    const r = list.find((x) => String(x.catalog).toUpperCase() === code);
    if (!r) {
      $('r-missing').hidden = false;
      return;
    }

    // ---------- Header ----------
    const names = (r.artists || []).join(' × ');
    document.title = `${r.title} — ${names} — Hyard Records`;
    const desc = `${r.title} by ${names}. ${r.type} on Hyard Records (${r.catalog})${r.releaseDate ? `, released ${C.fmtDate(r.releaseDate, true)}` : ''}.`;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', `${r.title} — ${names}`);
    setMeta('meta[property="og:description"]', 'content', desc);

    const cover = $('r-cover');
    cover.src = r.coverLarge || r.cover;
    cover.alt = `${r.title} cover`;
    $('r-kicker').textContent = `${r.catalog} · ${r.type}`;
    $('r-title').textContent = r.title;

    const roster = C.rosterFor(r, artists);
    $('r-artists').innerHTML = (r.artists || []).map((n, i) => {
      const a = roster.find((x) => (r.artistIds?.[i] && x.spotifyId === r.artistIds[i]) || C.norm(x.name) === C.norm(n));
      return a ? `<a href="artist-${a.slug}">${C.esc(n)}</a>` : C.esc(n);
    }).join(' <span class="muted">×</span> ');

    if (r.url) {
      $('r-spotify').href = r.url;
      $('r-spotify').hidden = false;
      $('r-all').href = `https://song.link/${r.url}`;
      $('r-all').hidden = false;
    }

    $('r-cat').textContent = r.catalog;
    $('r-type').textContent = r.type;
    $('r-date').textContent = r.releaseDate ? C.fmtDate(r.releaseDate, true) : 'Not listed yet';
    $('r-label').textContent = r.label || 'Hyard Records';

    // ---------- Player (loads only when asked) ----------
    const embed = C.embedUrl(r.url);
    if (embed) {
      $('r-player-wrap').hidden = false;
      $('r-load').addEventListener('click', () => {
        const frame = document.createElement('iframe');
        frame.src = embed.src;
        frame.title = `${r.title} on Spotify`;
        frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        frame.className = 'radio-frame';
        const tracks = (r.tracks || []).length;
        frame.style.height = embed.kind === 'track' || tracks <= 1 ? '152px' : `${Math.min(152 + tracks * 52, 452)}px`;
        $('r-embed').classList.add('is-loaded');
        $('r-embed').replaceChildren(frame);
        frame.focus();
      });
    }

    // ---------- Tracklist ----------
    const tracks = r.tracks || [];
    if (tracks.length) {
      $('r-tracks-wrap').hidden = false;
      const total = tracks.reduce((s, t) => s + (t.durationMs || 0), 0);
      $('r-track-count').textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}${total ? ` · ${C.fmtDuration(total)}` : ''}`;
      $('r-tracks').innerHTML = tracks.map((t, i) => {
        const extra = (t.artists || []).join(', ');
        const Tag = t.url ? 'a' : 'div';
        const link = t.url ? ` href="${C.esc(t.url)}" target="_blank" rel="noopener"` : '';
        return `
          <li data-slide="right" style="--d:${i * 70}ms">
            <${Tag} class="tl-row"${link}>
              <span class="mono muted tl-no">${String(t.number || i + 1).padStart(2, '0')}</span>
              <span class="tl-main"><span class="tl-title">${C.esc(t.title)}</span>${extra && extra !== names.replace(/ × /g, ', ') ? `<span class="mono muted">${C.esc(extra)}</span>` : ''}</span>
              <span class="mono muted tl-time">${C.fmtDuration(t.durationMs)}</span>
              ${t.url ? '<svg class="tl-go" aria-hidden="true"><use href="#i-arrow"/></svg>' : ''}
            </${Tag}>
          </li>`;
      }).join('');
    }

    // ---------- Previous / next in the catalog ----------
    const byCat = [...list].sort((a, b) => String(a.catalog).localeCompare(String(b.catalog)));
    const idx = byCat.indexOf(r);
    const prev = byCat[idx - 1];
    const next = byCat[idx + 1];
    $('r-nav').innerHTML = `
      ${prev ? `<a class="rel-step" href="${C.href(prev)}" data-slide="left"><span class="mono muted">← ${C.esc(prev.catalog)}</span><span class="display">${C.esc(prev.title)}</span></a>` : '<span></span>'}
      ${next ? `<a class="rel-step rel-step-next" href="${C.href(next)}" data-slide="right"><span class="mono muted">${C.esc(next.catalog)} →</span><span class="display">${C.esc(next.title)}</span></a>` : '<span></span>'}`;

    // ---------- More from the first roster artist ----------
    const lead = roster.find((a) => a.spotifyId === r.artistIds?.[0])
      || roster.find((a) => C.norm(a.name) === C.norm(r.artists?.[0]))
      || roster[0];
    if (lead) {
      const more = list.filter((x) => x !== r && C.rosterFor(x, artists).some((a) => a.slug === lead.slug)).slice(0, 4);
      if (more.length) {
        $('r-more-wrap').hidden = false;
        $('r-more-heading').textContent = `More from ${lead.name}`;
        $('r-more-link').href = `artist-${lead.slug}`;
        $('r-more-link').textContent = `View ${lead.name}`;
        $('r-more').innerHTML = more.map((x, i) => C.card(x, artists, i)).join('');
      }
    }

    $('rel').hidden = false;
    if (window.hyardObserve) window.hyardObserve();
  }).catch(() => { $('r-missing').hidden = false; });
})();
