(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Footer year
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // ---------- Hamburger menu ----------
  const burger = $('.burger');
  const menu = document.getElementById('menu');
  let closeTimer = null;
  // While the menu is open, the rest of the page can't be reached with Tab or a screen reader
  const outside = () => [document.querySelector('main'), document.querySelector('footer'), document.querySelector('.nav-search'),
    document.querySelector('.nav-search-toggle'), document.querySelector('.nav-account'), document.querySelector('.lockup'), document.querySelector('.skip-link')].filter(Boolean);
  const setInert = (on) => outside().forEach((el) => { el.inert = on; });

  const openMenu = () => {
    clearTimeout(closeTimer);
    menu.hidden = false;
    document.body.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    void menu.offsetWidth; // commit the closed state so the slide-in transition runs
    menu.classList.add('is-open');
    setInert(true);
    setTimeout(() => { const first = $('.menu-link', menu); if (first) first.focus({ preventScroll: true }); }, 350);
  };
  const closeMenu = (returnFocus = true) => {
    menu.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    setInert(false);
    closeTimer = setTimeout(() => { menu.hidden = true; }, reduce.matches ? 0 : 700);
    if (returnFocus) burger.focus({ preventScroll: true });
  };

  if (burger && menu) {
    burger.addEventListener('click', () => {
      if (menu.classList.contains('is-open')) closeMenu(); else openMenu();
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeMenu(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) closeMenu();
      // Keep Tab inside the menu and its close button
      if (e.key === 'Tab' && menu.classList.contains('is-open')) {
        const items = [burger, ...$$('a, button', menu).filter((el) => !el.closest('[hidden]') && el.offsetParent !== null)];
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    $$('a.menu-link', menu).forEach((a) => a.addEventListener('click', () => closeMenu(false)));

    // Merch: no shop yet, so the menu item reveals "coming soon" in place
    const soonBtn = $('.menu-soon', menu);
    const soon = document.getElementById('merch-soon');
    if (soonBtn && soon) {
      soonBtn.addEventListener('click', () => {
        const open = soon.hidden;
        soon.hidden = !open;
        soonBtn.setAttribute('aria-expanded', String(open));
        soonBtn.classList.toggle('is-open', open);
      });
    }
  }

  // ---------- Account and cart in the menu ----------
  // firebase.js (on account pages) leaves a small hint, so every page can show "Dashboard"
  // without loading Firebase. The account pages themselves check the real sign-in.
  const readHint = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  window.hyardMenuAccount = () => {
    const signedIn = readHint('hyard-signed-in') === '1';
    const admin = signedIn && readHint('hyard-admin') === '1';
    const count = admin ? 0 : Number(readHint('hyard-cart-count')) || 0;
    const page = admin ? 'admin' : signedIn ? 'dashboard' : 'account';
    const label = admin ? 'Admin' : signedIn ? 'Dashboard' : 'Log in / Sign up';
    const ACC = /(account|dashboard|admin)$/;
    const ARTIST_ONLY = /(dashboard#services|dashboard#submit|cart)$/;
    // Footer "For artists" links: the account link follows the sign-in, artist-only links hide for the label
    $$('.footer-col a').forEach((a) => {
      const h = a.getAttribute('href') || '';
      if (ACC.test(h)) { a.setAttribute('href', h.replace(ACC, page)); a.textContent = label; }
      if (ARTIST_ONLY.test(h)) a.hidden = admin;
    });
    $$('.menu-link').forEach((a) => {
      if (/(dashboard#services|dashboard#submit)$/.test(a.getAttribute('href') || '')) a.hidden = admin;
    });
    $$('[data-account-link]').forEach((a) => {
      const num = a.querySelector('.mono');
      a.textContent = label;
      if (num) a.prepend(num);
      a.setAttribute('href', a.getAttribute('href').replace(ACC, page));
    });
    $$('[data-account-icon]').forEach((a) => {
      a.setAttribute('href', a.getAttribute('href').replace(ACC, page));
      a.setAttribute('aria-label', admin ? 'Admin page' : signedIn ? 'Your dashboard' : 'Log in or sign up');
      a.classList.toggle('is-signed-in', signedIn);
      const badge = a.querySelector('.nav-account-count');
      if (badge) { badge.hidden = !count; badge.textContent = count || ''; }
    });
    $$('[data-cart-link]').forEach((a) => {
      a.hidden = !count;
      const c = a.querySelector('[data-cart-count]');
      if (c) c.textContent = String(count);
    });
  };
  window.hyardMenuAccount();
  window.addEventListener('storage', (e) => { if (/^hyard-(signed-in|cart-count|admin)$/.test(e.key || '')) window.hyardMenuAccount(); });

  // ---------- Header search with live suggestions ----------
  const navSearch = $('.nav-search');
  if (navSearch) {
    const q = $('#nav-q', navSearch);
    const box = $('#nav-suggest', navSearch);
    const toggle = $('.nav-search-toggle');
    const base = (navSearch.getAttribute('action') || 'releases.html').replace(/releases(\.html)?$/, '');
    const nrm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let data = null;
    let active = -1;

    const load = () => {
      data = data || fetch(`${base}data/releases.json`, { cache: 'no-cache' })
        .then((r) => r.json())
        .then((d) => (d.releases || []).map((r) => ({
          ...r,
          hay: nrm([r.catalog, String(r.catalog).replace('-', ''), r.title, (r.artists || []).join(' '), (r.tracks || []).map((t) => t.title).join(' ')].join(' ')),
        })))
        .catch(() => []);
      return data;
    };

    const close = () => {
      box.hidden = true;
      q.setAttribute('aria-expanded', 'false');
      active = -1;
    };
    const items = () => $$('.nav-suggest-item', box);
    const highlight = (i) => {
      const list = items();
      list.forEach((el, n) => el.setAttribute('aria-selected', String(n === i)));
      active = i;
    };

    const suggest = async () => {
      const words = nrm(q.value).split(' ').filter(Boolean);
      if (!words.length) { close(); return; }
      const all = await load();
      const hits = all.filter((r) => words.every((w) => r.hay.includes(w))).slice(0, 5);
      box.innerHTML = hits.length
        ? hits.map((r, i) => `
            <li role="option" aria-selected="false" id="nav-opt-${i}">
              <a class="nav-suggest-item" href="${base}release-${String(r.catalog).toLowerCase()}">
                <img src="${esc(/^https?:/.test(r.cover) ? r.cover : base + r.cover)}" alt="" width="40" height="40" loading="lazy">
                <span><span class="nav-suggest-title">${esc(r.title)}</span><span class="mono muted">${esc(r.catalog)} · ${esc((r.artists || []).join(' × '))}</span></span>
              </a>
            </li>`).join('') + `<li class="nav-suggest-all"><a class="mono" href="${base}releases?q=${encodeURIComponent(q.value.trim())}">See all results →</a></li>`
        : `<li class="nav-suggest-none mono muted">No releases match. Press Enter to search anyway.</li>`;
      box.hidden = false;
      q.setAttribute('aria-expanded', 'true');
      active = -1;
    };

    let timer;
    q.addEventListener('focus', load, { once: true });
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(suggest, 90); });
    q.addEventListener('keydown', (e) => {
      const list = items();
      if (e.key === 'ArrowDown' && list.length) { e.preventDefault(); highlight((active + 1) % list.length); }
      else if (e.key === 'ArrowUp' && list.length) { e.preventDefault(); highlight((active - 1 + list.length) % list.length); }
      else if (e.key === 'Enter' && active >= 0 && list[active]) { e.preventDefault(); location.href = list[active].href; }
      else if (e.key === 'Escape') { close(); if (navSearch.classList.contains('is-open')) toggle.click(); }
    });
    navSearch.addEventListener('submit', (e) => { if (!q.value.trim()) e.preventDefault(); });
    document.addEventListener('click', (e) => { if (!navSearch.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) close(); });

    // Phones: the icon opens the search field over the header
    toggle.addEventListener('click', () => {
      const open = !navSearch.classList.contains('is-open');
      navSearch.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close search' : 'Search releases');
      if (open) q.focus(); else close();
    });

    // On the search page, keep the header box in step with the page's own search
    const pageQ = document.getElementById('q');
    if (pageQ && /\/releases(\.html)?$/.test(location.pathname)) {
      q.value = new URLSearchParams(location.search).get('q') || '';
      navSearch.addEventListener('submit', (e) => {
        e.preventDefault();
        pageQ.value = q.value;
        pageQ.dispatchEvent(new Event('input'));
        close();
        pageQ.scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
      });
    }
  }

  // ---------- Newsletter and pre-save sign-ups (MailerLite) ----------
  // Settings live in data/site.json → newsletter. Until a form address is set there,
  // the boxes check the email and say sign-ups aren't live yet.
  const siteBase = ($('.nav-search')?.getAttribute('action') || 'releases.html').replace(/releases(\.html)?$/, '');
  let siteConfig = null;
  const loadSite = () => {
    siteConfig = siteConfig || fetch(`${siteBase}data/site.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return siteConfig;
  };
  const ML_FORM = /^https:\/\/assets\.mailerlite\.com\/jsonp\/\d+\/forms\/\d+\/subscribe$/;

  // kind: 'newsletter' or 'presave'. Resolves to 'sent', 'not-live' or 'error'.
  window.hyardSubscribe = async (email, kind) => {
    const { newsletter = {} } = await loadSite();
    const action = kind === 'presave' ? (newsletter.presaveAction || newsletter.newsletterAction) : newsletter.newsletterAction;
    if (!action || !ML_FORM.test(action)) return 'not-live';
    const body = new FormData();
    body.append('fields[email]', email);
    body.append('ml-submit', '1');
    body.append('anticsrf', 'true');
    try {
      const res = await fetch(action, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      return res.ok && data.success !== false ? 'sent' : 'error';
    } catch {
      // If the browser can't read MailerLite's answer, send it anyway without reading it
      try {
        await fetch(action, { method: 'POST', body, mode: 'no-cors' });
        return 'sent';
      } catch {
        return 'error';
      }
    }
  };

  // Show the newsletter paragraphs in the privacy policy only once sign-ups are live
  loadSite().then(({ newsletter = {} }) => {
    const live = ML_FORM.test(newsletter.newsletterAction || '') || ML_FORM.test(newsletter.presaveAction || '');
    document.querySelectorAll('[data-newsletter]').forEach((el) => { el.hidden = el.dataset.newsletter !== (live ? 'on' : 'off'); });
  });

  document.querySelectorAll('.news-form').forEach((form) => {
    const input = form.querySelector('input[type=email]');
    const status = form.querySelector('.news-status');
    const btn = form.querySelector('button[type=submit]');
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
      form.classList.remove('has-error');
      btn.disabled = true;
      status.textContent = 'Signing you up…';
      const result = await window.hyardSubscribe(v, 'newsletter');
      btn.disabled = false;
      if (result === 'error') {
        form.classList.add('has-error');
        status.textContent = 'Something went wrong. Try again in a moment.';
        return;
      }
      form.classList.add('is-done');
      status.textContent = result === 'sent'
        ? 'Almost done! Check your inbox and confirm your email to join the newsletter.'
        : "Thanks! The newsletter isn't live yet, so nothing was saved. Sign-ups open soon.";
      input.value = '';
    });
  });

  // ---------- Visitor stats (off until data/site.json names a provider) ----------
  {
    const base = ($('.nav-search')?.getAttribute('action') || 'releases.html').replace(/releases(\.html)?$/, '');
    fetch(`${base}data/site.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then(({ analytics = {} }) => {
        const on = analytics.provider === 'plausible' || (analytics.provider === 'cloudflare' && analytics.cloudflareToken);
        // The privacy policy shows whichever paragraph is true right now
        document.querySelectorAll('[data-analytics]').forEach((el) => {
          el.hidden = el.dataset.analytics !== (on ? analytics.provider : 'off');
        });
        if (!on || /^(localhost|127\.)/.test(location.hostname)) return;
        const s = document.createElement('script');
        s.defer = true;
        if (analytics.provider === 'plausible') {
          s.src = 'https://plausible.io/js/script.outbound-links.file-downloads.js';
          s.dataset.domain = analytics.domain || location.hostname;
        } else {
          s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
          s.dataset.cfBeacon = JSON.stringify({ token: analytics.cloudflareToken });
        }
        document.head.appendChild(s);
      })
      .catch(() => {});
  }

  // ---------- Back to top ----------
  document.querySelectorAll('.to-top').forEach((b) => b.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    const target = document.querySelector('.lockup');
    if (target) target.focus({ preventScroll: true });
  }));

  // ---------- Nav hide on scroll + progress bar ----------
  const nav = $('.nav');
  const bar = $('.progress span');
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (nav && !document.body.classList.contains('menu-open')) nav.classList.toggle('is-hidden', y > lastY && y > 200);
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Slide-in on scroll ----------
  $$('.track').forEach((t, i) => t.style.setProperty('--d', `${i * 70}ms`));

  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      revealObs.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  window.hyardObserve = () => {
    $$('[data-slide]:not(.in), .reveal:not(.in), .featured-media:not(.in)').forEach((el) => revealObs.observe(el));
  };

  window.hyardObserve();

  // ---------- Spinning wireframe globe + arc text (home hero) ----------
  const spin = document.getElementById('globe-spin');
  const arcText = document.getElementById('hero-arc-text');
  if (spin && arcText) {
    const NS = 'http://www.w3.org/2000/svg';
    const R = 112, CX = 200, CY = 210, MERIDIANS = 6;
    const meridians = [];
    for (let i = 0; i < MERIDIANS; i++) {
      const el = document.createElementNS(NS, 'ellipse');
      el.setAttribute('cx', CX);
      el.setAttribute('cy', CY);
      el.setAttribute('ry', R);
      spin.appendChild(el);
      meridians.push(el);
    }
    [28, 66].forEach((ry) => {
      const el = document.createElementNS(NS, 'ellipse');
      el.setAttribute('cx', CX);
      el.setAttribute('cy', CY);
      el.setAttribute('rx', R);
      el.setAttribute('ry', ry);
      spin.appendChild(el);
    });
    const draw = (t) => meridians.forEach((el, i) => {
      el.setAttribute('rx', Math.abs(Math.cos(t + (i * Math.PI) / MERIDIANS) * R).toFixed(2));
    });

    const ARC_DELAY = 500, ARC_DUR = 1400;
    const easeOut = (x) => 1 - Math.pow(1 - x, 4);
    let raf = null, t0 = null, arcDone = false;
    const loop = (now) => {
      if (t0 === null) t0 = now;
      draw(now / 4000);
      if (!arcDone) {
        const p = Math.min(Math.max((now - t0 - ARC_DELAY) / ARC_DUR, 0), 1);
        const e = easeOut(p);
        arcText.setAttribute('startOffset', `${(-30 + 80 * e).toFixed(2)}%`);
        arcText.parentNode.style.opacity = String(Math.min(1, e * 1.6));
        if (p >= 1) arcDone = true;
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (reduce.matches) {
        draw(0.35);
        arcText.setAttribute('startOffset', '50%');
        arcText.parentNode.style.opacity = '1';
      } else {
        raf = requestAnimationFrame(loop);
      }
    };
    reduce.addEventListener('change', start);
    start();
    // Lets the home page pause the spinning globe once it's hidden
    window.hyardStopGlobe = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      reduce.removeEventListener('change', start);
    };
  }

  // ---------- Radio: Spotify player, loaded only on request ----------
  const radioEmbed = document.getElementById('radio-embed');
  const radioLoad = document.getElementById('radio-load');
  if (radioEmbed && radioLoad) {
    radioLoad.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = 'https://open.spotify.com/embed/playlist/0gdYCFCfcTTYMiKOccVvGl?utm_source=generator&theme=0';
      frame.title = 'Hyard Radio playlist on Spotify';
      frame.loading = 'lazy';
      frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      frame.className = 'radio-frame';
      radioEmbed.classList.add('is-loaded');
      radioEmbed.replaceChildren(frame);
      frame.focus();
    });
  }

  // ---------- Radio player ----------
  const tracks = $$('.track');
  if (tracks.length) {
    const audio = new Audio();
    audio.preload = 'none';
    let current = null;
    const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '--:--');
    const setPlaying = (track, playing) => {
      track.classList.toggle('is-playing', playing);
      const title = $('.track-title', track).textContent;
      const artist = $('.track-artist', track).textContent;
      $('.play', track).setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title} by ${artist}`);
    };
    tracks.forEach((track) => {
      $('.play', track).addEventListener('click', () => {
        if (current === track) {
          if (audio.paused) audio.play(); else audio.pause();
          return;
        }
        if (current) {
          setPlaying(current, false);
          $('.track-bar span', current).style.width = '0';
        }
        current = track;
        audio.src = track.dataset.src;
        audio.play();
      });
    });
    audio.addEventListener('play', () => current && setPlaying(current, true));
    audio.addEventListener('pause', () => current && setPlaying(current, false));
    audio.addEventListener('loadedmetadata', () => {
      if (current) $('.track-time', current).textContent = fmt(audio.duration);
    });
    audio.addEventListener('timeupdate', () => {
      if (!current || !audio.duration) return;
      $('.track-bar span', current).style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    });
    audio.addEventListener('ended', () => {
      if (!current) return;
      $('.track-bar span', current).style.width = '0';
      setPlaying(current, false);
      const next = current.nextElementSibling;
      if (next) $('.play', next).click();
    });
  }
})();
