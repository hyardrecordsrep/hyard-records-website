// One news post: /post?p={id}
(() => {
  const N = window.HyardNews;
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('p') || '';

  const setMeta = (sel, attr, v) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, v); };

  // Drafts aren't public: the label can still preview them while logged in to admin
  const draftForAdmin = async () => {
    let admin = false;
    try { admin = localStorage.getItem('hyard-admin') === '1'; } catch { /* private mode */ }
    if (!admin || !id) return null;
    if (!window.HyardFirebase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'firebase.js';
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
      });
    }
    const fb = await window.HyardFirebase.ready;
    if (!fb.configured) return null;
    await window.HyardFirebase.userReady;
    try {
      const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'posts', id));
      return snap.exists() ? { ...snap.data(), id: snap.id, preview: true } : null;
    } catch { return null; }
  };

  const show = (p, posts) => {
    $('post-loading').hidden = true;
    $('post').hidden = false;
    document.title = `${p.title} — Hyard Records`;
    const desc = N.summary(p, 160);
    const link = `https://hyardrecords.com/post?p=${encodeURIComponent(p.id)}`;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', `${p.title} — Hyard Records`);
    setMeta('meta[name="twitter:title"]', 'content', `${p.title} — Hyard Records`);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('meta[property="og:url"]', 'content', link);
    setMeta('link[rel="canonical"]', 'href', link);
    setMeta('meta[property="og:type"]', 'content', 'article');

    const kicker = [p.preview ? `Preview · ${p.status === 'draft' ? 'Draft' : 'Not public'}` : null, p.pinned ? 'Featured' : 'News', N.fmt(p.date)].filter(Boolean).join(' · ');
    $('post-kicker').textContent = kicker;
    $('post-title').textContent = p.title;
    $('post-lead').textContent = String(p.excerpt || '').trim();
    $('post-lead').hidden = !String(p.excerpt || '').trim();
    $('post-date-foot').textContent = `Posted ${N.fmt(p.date)}`;
    const c = N.cover(p);
    if (c) {
      $('post-cover-img').src = c.url;
      $('post-cover-img').alt = c.alt || '';
      $('post-cover').hidden = false;
      setMeta('meta[property="og:image"]', 'content', /^https?:/.test(c.url) ? c.url : `https://hyardrecords.com/${c.url}`);
      setMeta('meta[name="twitter:image"]', 'content', /^https?:/.test(c.url) ? c.url : `https://hyardrecords.com/${c.url}`);
    }
    $('post-body').innerHTML = N.clean(p.body);
    // Headings, paragraphs and pictures slide in like the rest of the site
    [...$('post-body').children].forEach((el) => el.setAttribute('data-slide', 'up'));
    if (p.presave) {
      $('post-actions').innerHTML = '<button class="news-btn display presave-open" type="button" aria-haspopup="dialog" aria-controls="presave">Pre-save <svg aria-hidden="true"><use href="#i-arrow"/></svg></button>';
      $('post-body').insertAdjacentHTML('beforeend', '<p class="post-cta" data-slide="up"><button class="news-btn display presave-open" type="button" aria-haspopup="dialog" aria-controls="presave">Pre-save Beginning and The End <svg aria-hidden="true"><use href="#i-arrow"/></svg></button></p>');
      N.presave(document.body);
    }

    const more = posts.filter((x) => x.id !== p.id).slice(0, 3);
    if (more.length) {
      $('post-more-list').innerHTML = more.map((x, i) => N.miniCard(x, i)).join('');
      $('post-more').hidden = false;
    }
    if (window.hyardObserve) window.hyardObserve();
  };

  $('post-share').addEventListener('click', async () => {
    const link = location.href;
    const out = $('post-share-status');
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url: link }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(link); out.textContent = 'Link copied.'; } catch { out.textContent = link; }
  });

  N.load().then(async (posts) => {
    let p = posts.find((x) => x.id === id);
    if (!p) p = await draftForAdmin().catch(() => null);
    if (!p || (p.status === 'deleted')) {
      $('post-loading').hidden = true;
      $('post-missing').hidden = false;
      return;
    }
    show(p, posts);
  }).catch(() => {
    $('post-loading').hidden = true;
    $('post-missing').hidden = false;
  });
})();
