// Shared helpers for anything that shows releases from data/releases.json
window.HyardCatalog = (() => {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJson = (url) => fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

  let cache = null;
  const load = () => {
    cache = cache || Promise.all([getJson('data/releases.json'), getJson('data/artists.json')])
      .then(([r, a]) => ({ releases: r.releases || [], syncedAt: r.syncedAt, artists: a.artists || [] }));
    return cache;
  };

  const onLabel = (r) => norm(r.label) === 'hyard records';

  // Roster artists credited on a release (by Spotify id, or by name before a sync)
  const rosterFor = (release, artists) => artists.filter((a) => (
    Array.isArray(release.artistIds) && release.artistIds.length
      ? release.artistIds.includes(a.spotifyId)
      : (release.artists || []).some((n) => norm(n) === norm(a.name))
  ));

  // Newest first once every release has a date; catalog order before that
  const sort = (list) => {
    const dated = list.every((r) => r.releaseDate);
    return [...list].sort(dated
      ? (a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)) || String(b.catalog).localeCompare(String(a.catalog))
      : (a, b) => String(a.catalog).localeCompare(String(b.catalog)));
  };

  const href = (r) => `release-${String(r.catalog).toLowerCase()}`;

  const embedUrl = (url) => {
    const m = /open\.spotify\.com\/(album|track)\/([A-Za-z0-9]+)/.exec(url || '');
    return m ? { kind: m[1], src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` } : null;
  };

  const fmtDate = (d, long = false) => {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length === 1) return parts[0];
    const date = new Date(`${d.length === 7 ? `${d}-01` : d}T00:00:00Z`);
    return date.toLocaleDateString('en-GB', parts.length === 2
      ? { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }
      : { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const fmtDuration = (ms) => {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const card = (r, artists, i = 0) => {
    const slugs = rosterFor(r, artists).map((a) => a.slug).join(' ');
    return `
      <a class="release" href="${href(r)}" data-artist="${esc(slugs)}" data-slide="up" style="--d:${(i % 4) * 90}ms">
        <div class="release-art">
          <img src="${esc(r.cover)}" alt="${esc(r.title)} cover" width="300" height="300" loading="lazy">
          <svg class="release-go" aria-hidden="true"><use href="#i-arrow"/></svg>
        </div>
        <div class="release-meta">
          <span class="mono muted">${esc(r.catalog)} · ${esc(r.type)}</span>
          <h3 class="display">${esc(r.title)}</h3>
          <span class="mono">${esc((r.artists || []).join(' × '))}</span>
        </div>
      </a>`;
  };

  return { norm, esc, load, onLabel, rosterFor, sort, href, embedUrl, fmtDate, fmtDuration, card };
})();
