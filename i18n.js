// English / Croatian switch.
// The pages are written in English. When Croatian is chosen, this swaps visible text for the
// translations in data/i18n/hr.json, including text the other scripts add later (counts, dates,
// form messages). Release titles, artist names and artist bios stay as they are.
(() => {
  const KEY = 'hyard-lang';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode: choice lasts this page only */ } },
  };
  const prefersHr = (navigator.languages || [navigator.language || '']).some((l) => /^hr\b/i.test(l));
  const lang = store.get() || (prefersHr ? 'hr' : 'en');
  const root = document.documentElement;
  root.lang = lang;

  // Hide the page for a moment while Croatian loads, so English doesn't flash first
  if (lang === 'hr') {
    root.classList.add('i18n-loading');
    setTimeout(() => root.classList.remove('i18n-loading'), 1500);
  }

  const script = document.currentScript;
  const base = (script && script.getAttribute('src') || 'i18n.js').replace(/i18n\.js.*$/, '');
  const dictPromise = lang === 'hr'
    ? fetch(`${base}data/i18n/hr.json`, { cache: 'no-cache' }).then((r) => r.json()).catch(() => null)
    : Promise.resolve(null);

  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());

  // ---------- Switch button ----------
  ready(() => {
    document.querySelectorAll('.lang-toggle').forEach((btn) => {
      const other = lang === 'hr' ? 'en' : 'hr';
      btn.querySelector('.lang-current').textContent = lang.toUpperCase();
      btn.querySelector('.lang-other').textContent = other.toUpperCase();
      btn.setAttribute('aria-label', other === 'hr' ? 'Prebaci na hrvatski' : 'Switch to English');
      btn.setAttribute('lang', other);
      btn.addEventListener('click', () => { store.set(other); location.reload(); });
    });
  });

  if (lang !== 'hr') return;

  // ---------- Croatian ----------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const GEN = ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'];
  const NOM = ['siječanj', 'veljača', 'ožujak', 'travanj', 'svibanj', 'lipanj', 'srpanj', 'kolovoz', 'rujan', 'listopad', 'studeni', 'prosinac'];
  const SHORT_HR = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
  const DAYS = { Monday: 'ponedjeljak', Tuesday: 'utorak', Wednesday: 'srijeda', Thursday: 'četvrtak', Friday: 'petak', Saturday: 'subota', Sunday: 'nedjelja' };
  const monthIndex = (m) => {
    const i = MONTHS.indexOf(m);
    if (i >= 0) return i;
    return SHORT.findIndex((s) => s === m || s.slice(0, 3) === m);
  };
  // Croatian plurals: 1 izdanje, 2–4 izdanja, 5+ izdanja
  const plural = (n, one, few, many) => {
    const t = n % 10;
    const h = n % 100;
    if (t === 1 && h !== 11) return one;
    if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return few;
    return many;
  };

  let S = {};
  let A = {};
  const PATTERNS = [
    [/^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/, (m, d, mo, y) => (monthIndex(mo) >= 0 ? `${d}. ${GEN[monthIndex(mo)]} ${y}.` : null)],
    [/^([A-Z][a-z]+) (\d{4})$/, (m, mo, y) => {
      const i = monthIndex(mo);
      if (i < 0) return null;
      return MONTHS.includes(mo) ? `${NOM[i]} ${y}.` : `${SHORT_HR[i]} ${y}.`;
    }],
    [/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/, (m, d) => DAYS[d]],
    [/^(\d+) of (\d+) releases$/, (m, a, b) => `${a} od ${b} izdanja`],
    [/^(\d+) releases?$/, (m, n) => `${n} ${plural(+n, 'izdanje', 'izdanja', 'izdanja')}`],
    [/^(\d+) on Hyard Records$/, (m, n) => `${n} na Hyard Records`],
    [/^(\d+) tracks?$/, (m, n) => `${n} ${plural(+n, 'pjesma', 'pjesme', 'pjesama')}`],
    [/^(\d+) dates?$/, (m, n) => `${n} ${plural(+n, 'datum', 'datuma', 'datuma')}`],
    [/^(\d+) events?$/, (m, n) => `${n} ${plural(+n, 'događaj', 'događaja', 'događaja')}`],
    [/^(\d+) releases? together$/, (m, n) => `${n} ${plural(+n, 'izdanje', 'izdanja', 'izdanja')} zajedno`],
    [/^More from (.+)$/, (m, a) => `Još: ${a}`],
    [/^View (.+)$/, (m, a) => `Profil: ${a}`],
    [/^with (.+)$/, (m, a) => `uz ${a}`],
    [/^Synced with Spotify (.+)$/, (m, d) => `Sinkronizirano sa Spotifyjem ${d}`],
    [/^(\d+) \((HYD-\d+) to (HYD-\d+)\)$/, (m, n, a, b) => `${n} (${a} do ${b})`],
    [/^MP3 (\d+) kbps, shrunk from (.+)\. Your original stays on your device\.$/, (m, k, s) => `MP3 ${k} kbps, smanjeno s ${s}. Vaš original ostaje na vašem uređaju.`],
    [/^That file is (.+) and couldn't be shrunk enough\. Add a demo link below instead\.$/, (m, s) => `Datoteka ima ${s} i nije se mogla dovoljno smanjiti. Umjesto toga dodajte link na demo.`],
    [/^(.+) cover$/, (m, t) => `Naslovnica: ${t}`],
    [/^(.+) profile picture$/, (m, t) => `Profilna slika: ${t}`],
    [/^(.+) press photo$/, (m, t) => `Press fotografija: ${t}`],
    [/^(.+) on (Instagram|X|SoundCloud|Apple Music|Website|Facebook|Spotify)$/, (m, a, s) => `${a} na ${s === 'Website' ? 'webu' : s}`],
    [/^(.+): open the release page$/, (m, t) => `${t}: otvori stranicu izdanja`],
    [/^(.+) →$/, (m, t) => (S[t] !== undefined ? `${S[t]} →` : null)],
    // Accounts, dashboard and services
    [/^Hi, (.+)$/, (m, n) => `Bok, ${n}`],
    [/^Sent (.+)$/, (m, d) => `Poslano ${translate(d, S) || d}`],
    [/^Order (HYO-[A-Z0-9]+)$/, (m, n) => `Narudžba ${n}`],
    [/^(.+) package$/, (m, n) => `${n} paket`],
    [/^(.+) package \((\d+) tracks\)$/, (m, n, t) => `${n} paket (${t} ${plural(+t, 'pjesma', 'pjesme', 'pjesama')})`],
    [/^(€[\d.,]+) per track$/, (m, p) => `${p} po pjesmi`],
    [/^Uploading (\d+) of (\d+)…$/, (m, a, b) => `Prenosimo ${a} od ${b}…`],
    [/^Remove (.+)$/, (m, f) => `Ukloni ${f}`],
    [/^Go to cart \((\d+)\)$/, (m, n) => `Idi u košaricu (${n})`],
    [/^(.+) isn't an MP3 or WAV\.$/, (m, f) => `${f} nije MP3 ni WAV.`],
    [/^(.+) is over 200 MB\. Send a link for it instead\.$/, (m, f) => `${f} ima više od 200 MB. Umjesto toga pošaljite poveznicu.`],
    [/^We sent a link to (.+)\. Your email changes once you open it\.$/, (m, e) => `Poslali smo poveznicu na ${e}. E-adresa se mijenja kad je otvorite.`],
    [/^(.+) doesn't have a price yet, so it can't be bought\.$/, (m, s) => `${s} još nema cijenu pa se ne može kupiti.`],
    [/^Choose an option for (.+)$/, (m, s) => `Odaberite opciju: ${s}`],
  ];

  const translate = (text, map) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t || !/[A-Za-z]/.test(t)) return null;
    if (map[t] !== undefined) return map[t];
    for (const [re, fn] of PATTERNS) {
      const m = t.match(re);
      if (m) { const out = fn(...m); if (out != null) return out; }
    }
    // Pieces joined by " · " or " — " are translated one by one ("HYD-003 · Single · 25 September 2026")
    for (const sep of [' · ', ' — ', ' | ']) {
      if (t.includes(sep)) {
        const parts = t.split(sep);
        let changed = false;
        const out = parts.map((p) => { const r = translate(p, map); if (r != null) { changed = true; return r; } return p; });
        if (changed) return out.join(sep);
      }
    }
    return null;
  };

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'svg', 'TITLE']);
  const ATTRS = ['placeholder', 'aria-label', 'alt', 'title'];
  const skipped = (el) => !el || el.closest?.('[translate="no"], .lang-toggle, svg');

  const doText = (node) => {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.tagName) || skipped(parent)) return;
    const out = translate(node.nodeValue, S);
    if (out == null) return;
    const lead = node.nodeValue.match(/^\s*/)[0];
    const tail = node.nodeValue.match(/\s*$/)[0];
    const next = lead + out + tail;
    if (next !== node.nodeValue) node.nodeValue = next;
  };
  const doAttrs = (el) => {
    if (skipped(el)) return;
    ATTRS.forEach((a) => {
      const v = el.getAttribute(a);
      if (!v) return;
      const out = translate(v, A) ?? translate(v, S);
      if (out != null && out !== v) el.setAttribute(a, out);
    });
  };
  const walk = (rootNode) => {
    if (rootNode.nodeType === 3) { doText(rootNode); return; }
    if (rootNode.nodeType !== 1) return;
    doAttrs(rootNode);
    const it = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = it.nextNode();
    while (n) {
      if (n.nodeType === 3) doText(n); else doAttrs(n);
      n = it.nextNode();
    }
  };

  dictPromise.then((dict) => {
    if (!dict) { root.classList.remove('i18n-loading'); return; }
    S = dict.strings || {};
    A = dict.attributes || {};
    ready(() => {
      walk(document.body);
      const title = translate(document.title, S);
      if (title) document.title = title;
      root.classList.remove('i18n-loading');

      // Keep translating whatever the other scripts add or change
      new MutationObserver((list) => {
        list.forEach((m) => {
          if (m.type === 'childList') m.addedNodes.forEach(walk);
          else if (m.type === 'characterData') doText(m.target);
          else if (m.type === 'attributes') doAttrs(m.target);
        });
      }).observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS });
    });
  });
})();
