// News posts, shared by the home page, /news, /post and the admin News tab.
// Posts written in admin live in Firestore ("posts"); data/news.json holds the starter posts.
// A Firestore post with the same id replaces the starter one, and status "deleted" hides it.
// Public pages read Firestore over its REST API, so they don't need the full Firebase SDK.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const getJson = (url) => fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let mock = false;
  try { mock = local && localStorage.getItem('hyard-mock') === '1'; } catch { /* private mode */ }

  // ---------- Firestore REST ----------
  const val = (v) => {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('mapValue' in v) return obj(v.mapValue.fields || {});
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
    return null;
  };
  const obj = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v)]));

  const site = getJson('data/site.json').catch(() => ({}));
  const fromFirestore = async () => {
    const s = await site;
    if (mock) {
      const fb = await (await import('./scripts/dev/firebase-mock.js')).create(s);
      const snap = await fb.F.getDocs(fb.F.collection(fb.db, 'posts'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((p) => ['published', 'deleted'].includes(p.status));
    }
    const c = s && s.firebase;
    if (!c || !c.apiKey || !c.projectId) return [];
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(c.projectId)}/databases/(default)/documents:runQuery?key=${encodeURIComponent(c.apiKey)}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'posts' }],
        where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'published' }, { stringValue: 'deleted' }] } } } },
      },
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`posts ${r.status}`);
    const rows = await r.json();
    return rows.filter((x) => x.document).map((x) => ({ ...obj(x.document.fields || {}), id: x.document.name.split('/').pop() }));
  };

  const starter = () => getJson('data/news.json').then((d) => d.posts || []).catch(() => []);

  // Pinned post first, then newest first
  const order = (list) => list.slice().sort((a, b) => (b.pinned === true) - (a.pinned === true) || String(b.date || '').localeCompare(String(a.date || '')) || String(a.title).localeCompare(String(b.title)));

  // Everything visitors can see
  let cache = null;
  const load = () => {
    if (!cache) {
      cache = Promise.all([starter(), fromFirestore().catch((err) => { console.warn('News from admin did not load', err); return []; })])
        .then(([base, live]) => {
          const byId = new Map(base.map((p) => [p.id, { ...p, starter: true }]));
          live.forEach((p) => byId.set(p.id, p));
          // Only one featured post: the newest pinned one wins
          const all = order([...byId.values()].filter((p) => p && p.title && p.status !== 'deleted' && p.status !== 'draft' && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '')));
          let seen = false;
          all.forEach((p) => { if (p.pinned) { if (seen) p.pinned = false; seen = true; } });
          return order(all);
        });
    }
    return cache;
  };

  // ---------- Content cleaner ----------
  // Post content is HTML from the admin editor. Only these tags and attributes are shown.
  const KEEP = new Set(['P', 'H2', 'H3', 'STRONG', 'EM', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'FIGURE', 'IMG', 'FIGCAPTION', 'HR', 'BR']);
  const RENAME = { B: 'STRONG', I: 'EM', H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3', DIV: 'P' };
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META', 'HEAD', 'TITLE', 'VIDEO', 'AUDIO', 'CANVAS']);
  const SITE = /^https?:\/\/(www\.)?hyardrecords\.com(\/|$)/i;
  const internal = (href) => /^(\.\/|#|[a-z0-9-]+(\.html)?([?#][^\s]*)?$)/i.test(href);
  const safeHref = (raw) => {
    let h = String(raw || '').trim();
    if (!h) return null;
    if (SITE.test(h)) h = h.replace(SITE, '').replace(/^\//, '') || './';
    if (/^(https?:|mailto:)/i.test(h) || internal(h)) return h;
    return null;
  };
  const safeSrc = (raw) => {
    const s = String(raw || '').trim();
    return /^https:\/\//i.test(s) || /^assets\/[\w./-]+$/i.test(s) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s) ? s : null;
  };
  const clean = (html) => {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        let el = n;
        if (DROP.has(el.tagName)) { el.remove(); return; }
        if (RENAME[el.tagName]) {
          const r = doc.createElement(RENAME[el.tagName]);
          while (el.firstChild) r.appendChild(el.firstChild);
          el.replaceWith(r);
          el = r;
        }
        if (!KEEP.has(el.tagName)) {
          walk(el);
          el.replaceWith(...el.childNodes);
          return;
        }
        const keep = {};
        if (el.tagName === 'A') {
          const h = safeHref(el.getAttribute('href'));
          if (h) keep.href = h;
        }
        if (el.tagName === 'IMG') {
          const s = safeSrc(el.getAttribute('src'));
          if (!s) { el.remove(); return; }
          keep.src = s;
          keep.alt = el.getAttribute('alt') || '';
        }
        [...el.attributes].forEach((a) => el.removeAttribute(a.name));
        Object.entries(keep).forEach(([k, v]) => el.setAttribute(k, v));
        if (el.tagName === 'A') {
          if (!keep.href) { walk(el); el.replaceWith(...el.childNodes); return; }
          if (/^(https?:)/i.test(keep.href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
        }
        if (el.tagName === 'IMG') el.setAttribute('loading', 'lazy');
        walk(el);
      });
    };
    walk(doc.body);
    // Drop empty paragraphs and headings
    doc.body.querySelectorAll('p, h2, h3, li, blockquote').forEach((el) => { if (!el.textContent.replace(/\u00a0/g, ' ').trim() && !el.querySelector('img')) el.remove(); });
    return doc.body.innerHTML.trim();
  };

  // Plain text of a post, for summaries and word counts
  const text = (html) => new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
  const summary = (p, max = 180) => {
    const t = String(p.excerpt || '').trim() || text(p.body);
    return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
  };

  const fmt = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', opts) : '');
  const url = (p) => `post?p=${encodeURIComponent(p.id)}`;
  const cover = (p) => (p.cover && p.cover.url ? p.cover : null);

  // ---------- Pre-save ----------
  // The pre-save box for Beginning and The End, shown on posts with "presave" ticked
  const PRESAVE_HTML = `
      <dialog class="presave" id="presave" aria-labelledby="presave-title">
        <button class="presave-close" type="button" aria-label="Close" data-close-presave>
          <span></span><span></span>
        </button>
        <div class="presave-form-view">
          <span class="mono muted">Blurfnes · Album · Coming soon</span>
          <h2 class="display" id="presave-title">Pre-save Beginning and The End</h2>
          <p class="mono muted">Leave your email and we'll keep you posted on the album and its release.</p>
          <form class="presave-form" novalidate>
            <label class="news-field">
              <span class="visually-hidden">Email address</span>
              <input type="email" name="email" placeholder="you@gmail.com" autocomplete="email" required>
            </label>
            <button class="news-btn display" type="submit">Pre-save <svg aria-hidden="true"><use href="#i-arrow"/></svg></button>
            <p class="news-status mono" aria-live="polite"></p>
            <p class="news-consent mono muted">By signing up you agree to get emails about this album and Hyard Records news. Unsubscribe anytime. <a href="privacy">Privacy policy</a></p>
          </form>
        </div>
        <div class="presave-done" hidden>
          <svg class="presave-globe" aria-hidden="true"><use href="#globe"/></svg>
          <h2 class="display">You're on the list</h2>
          <p class="mono">You'll receive updates on Beginning and The End and its release.</p>
          <p class="mono muted presave-confirm" hidden>Check your inbox and confirm your email to finish.</p>
          <button class="more" type="button" data-close-presave>Close</button>
        </div>
      </dialog>`;
  const presave = (mount) => {
    if (!document.getElementById('presave')) mount.insertAdjacentHTML('beforeend', PRESAVE_HTML);
    const dialog = document.getElementById('presave');
    if (!dialog || typeof dialog.showModal !== 'function' || dialog.dataset.wired) return;
    dialog.dataset.wired = '1';
    const formView = dialog.querySelector('.presave-form-view');
    const done = dialog.querySelector('.presave-done');
    const form = dialog.querySelector('.presave-form');
    const input = form.querySelector('input');
    const status = form.querySelector('.news-status');
    let opener = null;

    const reset = () => {
      formView.hidden = false;
      done.hidden = true;
      form.classList.remove('has-error');
      status.textContent = '';
    };
    const close = () => {
      dialog.classList.add('is-closing');
      setTimeout(() => { dialog.classList.remove('is-closing'); dialog.close(); }, 260);
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.presave-open');
      if (!b) return;
      opener = b;
      reset();
      dialog.showModal();
      input.focus();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-presave]')) { close(); return; }
      // Clicks on the dimmed backdrop land on the dialog element but outside its box
      const r = dialog.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (e.target === dialog && outside && e.detail > 0) close();
    });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (opener) opener.focus(); });
    input.addEventListener('input', () => { form.classList.remove('has-error'); status.textContent = ''; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        form.classList.add('has-error');
        status.textContent = v ? 'Enter an email like you@gmail.com.' : 'Enter your email first.';
        input.focus();
        return;
      }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      status.textContent = 'Signing you up…';
      // Goes to the MailerLite pre-save form set in data/site.json
      const result = window.hyardSubscribe ? await window.hyardSubscribe(v, 'presave') : 'not-live';
      btn.disabled = false;
      if (result === 'error') {
        form.classList.add('has-error');
        status.textContent = 'Something went wrong. Try again in a moment.';
        return;
      }
      status.textContent = '';
      input.value = '';
      done.querySelector('.presave-confirm').hidden = result !== 'sent';
      formView.hidden = true;
      done.hidden = false;
      done.querySelector('.more').focus();
    });
  };

  // ---------- Cards ----------
  const picHtml = (p, eager) => {
    const c = cover(p);
    return c
      ? `<img src="${esc(c.url)}" alt="${esc(c.alt || '')}"${eager ? '' : ' loading="lazy"'}>`
      : '<svg aria-hidden="true"><use href="#globe"/></svg>';
  };
  // Big card for the featured post (home page and /news)
  const featureCard = (p, headingTag = 'h3') => `
      <article class="nw-feature" aria-labelledby="nwf-${esc(p.id)}">
        <a class="nw-feature-media ev-pic" href="${url(p)}" tabindex="-1" aria-hidden="true" data-slide="left">${picHtml(p, true)}</a>
        <div class="nw-feature-copy">
          <span class="mono muted nw-kicker" data-slide="right">${p.pinned ? 'Featured · ' : ''}${esc(fmt(p.date))}</span>
          <${headingTag} class="display nw-feature-title" id="nwf-${esc(p.id)}" data-slide="up" style="--d:120ms"><a href="${url(p)}">${esc(p.title)}</a></${headingTag}>
          <p class="nw-feature-text" data-slide="up" style="--d:200ms">${esc(summary(p, 260))}</p>
          <div class="nw-feature-actions" data-slide="up" style="--d:280ms">
            <a class="news-btn display" href="${url(p)}">Read more <svg aria-hidden="true"><use href="#i-arrow"/></svg></a>
            ${p.presave ? '<button class="more presave-open" type="button" aria-haspopup="dialog" aria-controls="presave">Pre-save</button>' : ''}
          </div>
        </div>
      </article>`;
  // Small card: picture, date, title (home page side column, "More news")
  const miniCard = (p, i = 0) => `
      <article class="nw-mini" data-slide="up" style="--d:${(i % 4) * 90}ms">
        <a class="nw-mini-pic ev-pic" href="${url(p)}" tabindex="-1" aria-hidden="true">${picHtml(p)}</a>
        <div class="nw-mini-copy">
          <span class="mono muted nw-kicker">${esc(fmt(p.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
          <h3 class="display nw-mini-title"><a href="${url(p)}">${esc(p.title)}</a></h3>
          <p class="nw-mini-text">${esc(summary(p, 110))}</p>
        </div>
      </article>`;
  // Row on /news, in the style of the Events list
  const row = (p, i = 0) => {
    const d = new Date(`${p.date}T12:00:00`);
    return `
      <li class="ev has-pic nw-row" data-slide="up" style="--d:${(i % 6) * 70}ms">
        <div class="ev-date">
          <span class="display ev-day">${d.toLocaleDateString('en-GB', { day: '2-digit' })}</span>
          <span class="mono ev-month">${esc(d.toLocaleDateString('en-GB', { month: 'short' }))} ${d.getFullYear()}</span>
        </div>
        <a class="ev-pic ev-media" href="${url(p)}" tabindex="-1" aria-hidden="true">${picHtml(p)}</a>
        <div class="ev-main">
          ${p.pinned ? '<span class="mono ev-status">Featured</span>' : ''}
          <h3 class="display ev-title"><a class="nw-row-link" href="${url(p)}">${esc(p.title)}</a></h3>
          <p class="ev-desc">${esc(summary(p, 200))}</p>
        </div>
        <div class="ev-actions"><a class="more" href="${url(p)}">Read</a></div>
      </li>`;
  };

  window.HyardNews = { load, starter, order, clean, text, summary, fmt, url, cover, esc, presave, safeHref, featureCard, miniCard, row };
})();
