// Home page release grid, built from data/releases.json (kept fresh by the daily Spotify sync)
(() => {
  const C = window.HyardCatalog;
  const grid = document.getElementById('home-releases');
  const filtersEl = document.getElementById('home-filters');
  const moreWrap = document.querySelector('.more-wrap');
  const moreBtn = document.querySelector('.more');
  if (!grid) return;

  const INITIAL = 12;
  let filter = 'all';
  let expanded = false;
  let cards = [];

  const slideIn = (el, i) => {
    el.classList.remove('in');
    el.style.setProperty('--d', `${(i % 8) * 60}ms`);
    void el.offsetWidth;
    el.classList.add('in');
  };

  const apply = (animate) => {
    const matches = cards.filter((c) => filter === 'all' || c.dataset.artist.split(' ').includes(filter));
    cards.forEach((c) => { c.hidden = true; });
    matches.forEach((c, i) => {
      const show = expanded || i < INITIAL;
      c.hidden = !show;
      if (show && animate) slideIn(c, i);
    });
    moreWrap.hidden = expanded || matches.length <= INITIAL;
  };

  C.load().then(({ releases, artists }) => {
    const list = C.sort(releases.filter(C.onLabel));
    grid.innerHTML = list.map((r, i) => C.card(r, artists, i)).join('');
    cards = [...grid.querySelectorAll('.release')];

    // One filter button per roster artist who has releases
    artists
      .filter((a) => list.some((r) => C.rosterFor(r, artists).includes(a)))
      .forEach((a) => {
        const b = document.createElement('button');
        b.className = 'filter';
        b.dataset.filter = a.slug;
        b.setAttribute('aria-pressed', 'false');
        b.textContent = a.name;
        filtersEl.appendChild(b);
      });

    filtersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter');
      if (!btn || btn.dataset.filter === filter) return;
      filter = btn.dataset.filter;
      filtersEl.querySelectorAll('.filter').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      apply(true);
    });

    moreBtn.addEventListener('click', () => {
      const before = cards.filter((c) => !c.hidden).length;
      expanded = true;
      moreBtn.setAttribute('aria-expanded', 'true');
      apply(false);
      cards.filter((c) => !c.hidden).slice(before).forEach(slideIn);
    });

    apply(false);
    if (window.hyardObserve) window.hyardObserve();
  }).catch(() => {
    document.getElementById('home-releases-error').hidden = false;
    moreWrap.hidden = true;
  });
})();

// News block: the featured (pinned) post big on the left, the next latest posts beside it
(() => {
  const N = window.HyardNews;
  const box = document.getElementById('nw-home');
  if (!N || !box) return;
  N.presave(document.body);
  N.load().then((posts) => {
    if (!posts.length) { box.closest('section').hidden = true; return; }
    const featured = posts.find((p) => p.pinned) || posts[0];
    const side = posts.filter((p) => p !== featured).slice(0, 3);
    box.classList.toggle('has-side', side.length > 0);
    box.innerHTML = N.featureCard(featured) + (side.length ? `<div class="nw-side">${side.map((p, i) => N.miniCard(p, i)).join('')}</div>` : '');
    if (window.hyardObserve) window.hyardObserve();
  }).catch((err) => console.warn('News did not load', err));
})();

// Hero: logo intro first, then fade to the latest release from the catalog (kept fresh by the Spotify sync)
(() => {
  const C = window.HyardCatalog;
  const hero = document.querySelector('.hero');
  const latest = document.getElementById('hero-latest');
  const intro = document.querySelector('.hero-intro');
  if (!hero || !latest || !intro) return;

  const INTRO_MS = 2000; // when the switch starts, counted from opening the page
  const HOLD_MS = 0;     // how long the finished logo stays before switching (0 = switch as soon as it's done)
  const $ = (id) => document.getElementById(id);

  const pageLoaded = new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  const introDone = new Promise((resolve) => setTimeout(resolve, INTRO_MS));

  C.load().then(({ releases }) => {
    const list = releases.filter(C.onLabel).filter((r) => r.releaseDate);
    if (!list.length) return;
    const r = [...list].sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))[0];

    const today = new Date().toISOString().slice(0, 10);
    $('hl-kicker').textContent = r.releaseDate > today ? 'Coming soon · Latest release' : 'Out now · Latest release';
    $('hl-title').textContent = r.title;
    $('hl-artists').textContent = (r.artists || []).join(' × ');
    $('hl-meta').textContent = [r.catalog, r.type, C.fmtDate(r.releaseDate, true)].filter(Boolean).join(' · ');
    const cover = $('hl-cover');
    cover.src = r.coverLarge || r.cover;
    cover.alt = `${r.title} cover`;
    $('hl-bg').style.backgroundImage = `url("${String(r.coverLarge || r.cover).replace(/"/g, '%22')}")`;
    $('hl-cover-link').href = C.href(r);
    $('hl-cover-link').setAttribute('aria-label', `${r.title}: open the release page`);
    $('hl-listen').href = C.href(r);
    if (r.url) $('hl-spotify').href = r.url; else $('hl-spotify').hidden = true;
    // Reserve the banner's space now (it stays invisible) so nothing jumps when it fades in
    latest.hidden = false;
    latest.setAttribute('aria-hidden', 'true');

    // Wait for the page and the logo animation, hold the logo, then swap
    // Give the cover a moment to arrive, but never let a slow image hold the switch back
    const coverReady = Promise.race([
      new Promise((resolve) => {
        if (cover.complete) resolve();
        else { cover.addEventListener('load', resolve, { once: true }); cover.addEventListener('error', resolve, { once: true }); }
      }),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    return Promise.all([pageLoaded, introDone, coverReady])
      .then(() => new Promise((resolve) => setTimeout(resolve, HOLD_MS)))
      .then(() => {
        latest.removeAttribute('aria-hidden');
        hero.classList.add('is-latest');
        intro.setAttribute('aria-hidden', 'true');
        setTimeout(() => { if (window.hyardStopGlobe) window.hyardStopGlobe(); }, 1200);
      });
  }).catch(() => { /* keep the logo if the catalog can't load */ });
})();

// Radio: "Now featured" track (picked in data/radio.json, or the newest release) and the newest tracks
(() => {
  const C = window.HyardCatalog;
  const wrap = document.getElementById('radio-top');
  if (!wrap) return;
  const $ = (id) => document.getElementById(id);

  Promise.all([C.load(), fetch('data/radio.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({}))])
    .then(([{ releases }, radio]) => {
      const list = releases.filter(C.onLabel).filter((r) => r.releaseDate)
        .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)) || String(b.catalog).localeCompare(String(a.catalog)));
      if (!list.length) return;

      // Featured: the label's pick if set and found, otherwise the newest release
      const pick = radio && radio.featured;
      const rel = (pick && list.find((r) => String(r.catalog).toUpperCase() === String(pick.catalog || '').toUpperCase())) || list[0];
      const tracks = rel.tracks || [];
      const track = (pick && pick.track && tracks.find((t) => C.norm(t.title) === C.norm(pick.track))) || tracks[0];

      $('ft-cover').src = rel.cover;
      $('ft-cover').alt = `${rel.title} cover`;
      $('ft-cover-link').href = C.href(rel);
      $('ft-title').textContent = track ? track.title : rel.title;
      $('ft-artists').textContent = `${(track?.artists?.length ? track.artists : rel.artists || []).join(' × ')} · ${rel.catalog}`;
      const usedPick = pick && String(rel.catalog).toUpperCase() === String(pick.catalog || '').toUpperCase();
      if (usedPick && pick.note) {
        $('ft-note').textContent = pick.note;
        $('ft-note').hidden = false;
      }
      $('ft-release').href = C.href(rel);
      const embed = track?.spotifyId
        ? `https://open.spotify.com/embed/track/${track.spotifyId}?utm_source=generator&theme=0`
        : C.embedUrl(rel.url)?.src;
      if (embed) {
        $('ft-play').addEventListener('click', () => {
          const frame = document.createElement('iframe');
          frame.src = embed;
          frame.title = `${track ? track.title : rel.title} on Spotify`;
          frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
          $('ft-player').replaceChildren(frame);
          $('ft-player').hidden = false;
          $('ft-play').hidden = true;
          frame.focus();
        }, { once: true });
      } else {
        $('ft-play').hidden = true;
      }

      // Newest tracks first, one per release
      const n = Math.max(1, Math.min(10, Number(radio?.freshCount) || 5));
      $('fresh').innerHTML = list.slice(0, n).map((r, i) => {
        const t = (r.tracks || [])[0];
        const url = t?.url || r.url;
        return `
          <li data-slide="right" style="--d:${i * 60}ms">
            <a class="tl-row" href="${C.esc(url || C.href(r))}"${url ? ' target="_blank" rel="noopener"' : ''}>
              <span class="mono muted tl-no">${String(i + 1).padStart(2, '0')}</span>
              <span class="tl-main"><span class="tl-title">${C.esc(t ? t.title : r.title)}</span><span class="mono muted">${C.esc((r.artists || []).join(' × '))} · ${C.esc(C.fmtDate(r.releaseDate))}</span></span>
              <svg class="tl-go" aria-hidden="true"><use href="#i-arrow"/></svg>
            </a>
          </li>`;
      }).join('');

      wrap.hidden = false;
      if (window.hyardObserve) window.hyardObserve();
    })
    .catch(() => { /* Radio still works with just the playlist */ });
})();
