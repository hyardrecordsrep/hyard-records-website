(() => {
  const LABEL = 'hyard records';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const getJson = (url) => fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const observe = () => window.hyardObserve && window.hyardObserve();

  // Only releases on the label, credited to this artist (by Spotify id once synced, by name before)
  const releasesFor = (artist, releases) => releases.filter((r) => {
    if (norm(r.label) !== LABEL) return false;
    if (Array.isArray(r.artistIds) && r.artistIds.length) return r.artistIds.includes(artist.spotifyId);
    return (r.artists || []).some((n) => norm(n) === norm(artist.name));
  });

  const grid = document.getElementById('artist-grid');
  const profile = document.getElementById('profile');

  // ---------- Artists index ----------
  if (grid) {
    Promise.all([getJson('data/artists.json'), getJson('data/releases.json').catch(() => ({ releases: [] }))])
      .then(([a, r]) => {
        grid.innerHTML = a.artists.map((artist, i) => {
          const n = releasesFor(artist, r.releases || []).length;
          return `
            <li class="artist-card" data-slide="up" style="--d:${i * 120}ms">
              <a href="artist-${artist.slug}">
                <span class="artist-photo"><img src="${esc(artist.image)}" alt="${esc(artist.name)}" loading="lazy" width="640" height="640"></span>
                <span class="artist-meta">
                  <span class="display artist-name">${esc(artist.name)}</span>
                  <span class="mono muted">${n} ${n === 1 ? 'release' : 'releases'}</span>
                </span>
                <svg class="artist-go" aria-hidden="true"><use href="#i-arrow"/></svg>
              </a>
            </li>`;
        }).join('');
        observe();
      })
      .catch(() => { document.getElementById('artists-error').hidden = false; });
  }

  // ---------- Artist profile ----------
  if (profile) {
    const slug = new URLSearchParams(location.search).get('a') || document.querySelector('meta[name="hyard-artist"]')?.content;
    Promise.all([getJson('data/artists.json'), getJson('data/releases.json').catch(() => ({ releases: [] }))])
      .then(([a, r]) => {
        const artist = a.artists.find((x) => x.slug === slug);
        if (!artist) {
          document.getElementById('p-missing').hidden = false;
          return;
        }
        document.title = `${artist.name} — Hyard Records`;
        const photo = document.getElementById('p-photo');
        photo.src = artist.image;
        photo.alt = `${artist.name} profile picture`;
        document.getElementById('p-name').textContent = artist.name;
        document.getElementById('p-spotify-name').textContent = artist.spotifyName || artist.name;
        document.getElementById('p-spotify').href = artist.spotifyUrl;

        const about = Array.isArray(artist.about) ? artist.about : [artist.about].filter(Boolean);
        document.getElementById('p-about').innerHTML = about.length
          ? about.map((p) => `<p>${esc(p)}</p>`).join('')
          : '<p class="muted">Bio coming soon.</p>';

        // ---------- Socials ----------
        const socials = (artist.socials || []).filter((s) => s.url);
        const socialsEl = document.getElementById('p-socials');
        socialsEl.innerHTML = socials.map((s) => `
          <li><a class="social-chip mono" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(artist.name)} on ${esc(s.label)}">
            <svg aria-hidden="true"><use href="#i-${esc(s.icon)}"/></svg><span>${esc(s.label)}</span>
          </a></li>`).join('');
        socialsEl.hidden = !socials.length;

        // ---------- Top tracks ----------
        const fmtDur = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '');
        const top = artist.topTracks || [];
        if (top.length) {
          document.getElementById('p-top-wrap').hidden = false;
          document.getElementById('p-top').innerHTML = top.map((t, i) => {
            const others = (t.artists || []).filter((n) => norm(n) !== norm(artist.spotifyName || artist.name) && norm(n) !== norm(artist.name));
            return `
              <li data-slide="right" style="--d:${i * 50}ms">
                <a class="tl-row" href="${esc(t.url)}" target="_blank" rel="noopener">
                  <span class="mono muted tl-no">${String(i + 1).padStart(2, '0')}</span>
                  <span class="tl-main"><span class="tl-title">${esc(t.title)}</span>${others.length ? `<span class="mono muted">with ${esc(others.join(', '))}</span>` : ''}</span>
                  <span class="mono muted tl-time">${fmtDur(t.durationMs)}</span>
                  <svg class="tl-go" aria-hidden="true"><use href="#i-arrow"/></svg>
                </a>
              </li>`;
          }).join('');
          document.getElementById('p-top-load').addEventListener('click', () => {
            const frame = document.createElement('iframe');
            frame.src = `https://open.spotify.com/embed/artist/${encodeURIComponent(artist.spotifyId)}?utm_source=generator&theme=0`;
            frame.title = `${artist.name} top tracks on Spotify`;
            frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
            frame.className = 'radio-frame';
            const box = document.getElementById('p-top-embed');
            box.classList.add('is-loaded');
            box.replaceChildren(frame);
            frame.focus();
          });
        }

        // ---------- Collaborators (from Spotify credits) ----------
        const collabs = artist.collaborators || [];
        if (collabs.length) {
          const byTitle = new Map((r.releases || []).map((x) => [norm(x.title), x]));
          document.getElementById('p-collab-wrap').hidden = false;
          document.getElementById('p-collabs').innerHTML = collabs.map((c, i) => {
            const onLabel = a.artists.find((x) => x.spotifyId === c.spotifyId);
            const link = onLabel ? `artist-${onLabel.slug}` : c.url;
            const ext = onLabel ? '' : ' target="_blank" rel="noopener"';
            const works = (c.works || []).map((w) => {
              const rel = byTitle.get(norm(w));
              return rel ? `<a href="release-${String(rel.catalog).toLowerCase()}">${esc(w)}</a>` : esc(w);
            }).join(', ');
            return `
              <li class="collab" data-slide="up" style="--d:${(i % 4) * 90}ms">
                <a class="collab-head" href="${esc(link)}"${ext}>
                  <span class="collab-photo">${c.image ? `<img src="${esc(c.image)}" alt="" width="160" height="160" loading="lazy">` : '<svg aria-hidden="true"><use href="#globe"/></svg>'}</span>
                  <span class="display collab-name">${esc(c.name)}</span>
                  <span class="mono muted">${c.count} ${c.count === 1 ? 'release' : 'releases'} together${onLabel ? ' · Hyard artist' : ''}</span>
                </a>
                ${works ? `<p class="mono collab-works">${works}</p>` : ''}
              </li>`;
          }).join('');
        }

        const list = releasesFor(artist, r.releases || [])
          .sort((x, y) => String(y.releaseDate || '').localeCompare(String(x.releaseDate || '')) || String(x.catalog).localeCompare(String(y.catalog)));
        document.getElementById('p-release-count').textContent = `${list.length} on Hyard Records`;
        document.getElementById('p-releases').innerHTML = list.map((rel, i) => {
          const Tag = 'a';
          const href = ` href="release-${String(rel.catalog).toLowerCase()}"`;
          return `
            <${Tag} class="release" data-slide="up" style="--d:${(i % 4) * 90}ms"${href}>
              <div class="release-art">
                <img src="${esc(rel.cover)}" alt="${esc(rel.title)} cover" width="300" height="300" loading="lazy">
                <svg class="release-go" aria-hidden="true"><use href="#i-arrow"/></svg>
              </div>
              <div class="release-meta">
                <span class="mono muted">${esc(rel.catalog)} · ${esc(rel.type)}</span>
                <h3 class="display">${esc(rel.title)}</h3>
                <span class="mono">${esc((rel.artists || []).join(' × '))}</span>
              </div>
            </${Tag}>`;
        }).join('');
        document.getElementById('p-no-releases').hidden = list.length > 0;

        document.getElementById('profile-body').hidden = false;
        document.getElementById('p-releases-wrap').hidden = false;
        observe();
      })
      .catch(() => { document.getElementById('p-missing').hidden = false; });
  }
})();
