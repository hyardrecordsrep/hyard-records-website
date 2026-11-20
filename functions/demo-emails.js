// Demo emails, sent from product@hyardrecords.com:
//   demoForLabel     "A demo is ready for review" to the label, with everything the artist filled in
//   demoReceived     "We've got your demo" to the artist (English or Croatian)
//   demoStatus       "Your demo status changed" to the artist when the label changes the status
// Same look as the receipts: black card, white type, inline styles and tables for every mail app.

const MONO = 'font:12px/1.6 Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;';
const BODY = 'font:15px/1.7 Helvetica,Arial,sans-serif;';
const DISPLAY = "font:900 30px/1.1 'Arial Black',Helvetica,Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase;";

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS = {
  en: { submitted: 'Received', listening: 'Listening', shortlisted: 'Shortlisted', declined: 'Not for us', signed: 'Signed' },
  hr: { submitted: 'Primljeno', listening: 'Slušamo', shortlisted: 'U užem izboru', declined: 'Nije za nas', signed: 'Potpisano' },
};

// What each new status means, in a sentence the artist reads
const MEANING = {
  en: {
    submitted: "Your demo is back in our inbox, waiting for a listen.",
    listening: "We're listening to your demo now.",
    shortlisted: "Your demo made our shortlist. We'll be in touch about what happens next.",
    declined: "This one isn't for us right now. Thanks for sending it, and you're welcome to send us new music any time.",
    signed: "We'd love to release it. We'll contact you about the next steps.",
  },
  hr: {
    submitted: 'Vaš demo je ponovno među primljenima i čeka slušanje.',
    listening: 'Upravo slušamo vaš demo.',
    shortlisted: 'Vaš demo je ušao u uži izbor. Javit ćemo vam se oko sljedećih koraka.',
    declined: 'Ovaj trenutno nije za nas. Hvala što ste ga poslali, a novu glazbu nam možete poslati bilo kad.',
    signed: 'Željeli bismo ga izdati. Javit ćemo vam se oko sljedećih koraka.',
  },
};

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  hr: ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'],
};
const fmtDate = (d, lang) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zagreb', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const m = MONTHS[lang][Number(p.month) - 1];
  return lang === 'hr' ? `${p.day}. ${m} ${p.year}. u ${p.hour}:${p.minute}` : `${p.day} ${m} ${p.year}, ${p.hour}:${p.minute}`;
};
const bytes = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1e3))} KB`);
const demoNo = (id) => `HYD-DEMO-${String(id).slice(0, 6).toUpperCase()}`;

// ---------- Shared layout ----------
function shell({ lang, title, preheader, kicker, heading, intro, rows = [], blocks = '', button, closing, site }) {
  const detailRows = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '').map(([k, v, opts = {}]) => `
            <tr>
              <td style="padding:5px 0;vertical-align:top;color:#8a8a8a;${MONO}white-space:nowrap;">${esc(k)}</td>
              <td align="right" style="padding:5px 0 5px 16px;vertical-align:top;color:#ffffff;${opts.plain ? BODY : MONO}${String(v).includes('@') || opts.plain ? 'text-transform:none;letter-spacing:.02em;' : ''}word-break:break-word;">${opts.html ? v : esc(v)}</td>
            </tr>`).join('');

  const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#1a1a1a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr><td align="center" style="padding:32px 16px 48px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#000000;border:1px solid #2a2a2a;">
        <tr><td align="center" style="padding:40px 32px 8px;">
          <img src="${site}/assets/email/hyard-logo-600.jpg" width="120" height="120" alt="Hyard Records" style="display:block;width:120px;height:120px;border:0;">
        </td></tr>
        <tr><td align="center" style="padding:16px 32px 0;">
          <p style="margin:0;color:#8a8a8a;${MONO}letter-spacing:.2em;">${esc(kicker)}</p>
        </td></tr>
        <tr><td align="center" style="padding:14px 32px 0;">
          <h1 style="margin:0;color:#ffffff;${DISPLAY}">${heading}</h1>
        </td></tr>
        <tr><td align="center" style="padding:20px 40px 0;">
          <p style="margin:0;color:#d6d6d6;${BODY}">${esc(intro)}</p>
        </td></tr>
        ${detailRows ? `
        <tr><td style="padding:32px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a;">
            <tr><td style="padding:12px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows}
              </table>
            </td></tr>
          </table>
        </td></tr>` : ''}
        ${blocks}
        ${button ? `
        <tr><td align="center" style="padding:32px 32px 0;">
          <a href="${esc(button.url)}" style="display:inline-block;background:#ffffff;color:#000000;font:900 15px/1 'Arial Black',Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;text-decoration:none;padding:18px 34px;">${esc(button.label)}</a>
        </td></tr>` : ''}
        ${closing ? `
        <tr><td style="padding:28px 32px 0;">
          <p style="margin:0;color:#8a8a8a;font:13px/1.7 Helvetica,Arial,sans-serif;">${esc(closing)}</p>
        </td></tr>` : ''}
        <tr><td style="padding:36px 32px 0;"><div style="border-top:1px solid #2a2a2a;font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td align="center" style="padding:22px 32px 36px;">
          <p style="margin:0 0 10px;${MONO}">
            <a href="${site}/" style="color:#ffffff;text-decoration:none;">Website</a>
            <span style="color:#444;">&nbsp;·&nbsp;</span>
            <a href="https://www.instagram.com/hyardrecords/" style="color:#ffffff;text-decoration:none;">Instagram</a>
            <span style="color:#444;">&nbsp;·&nbsp;</span>
            <a href="${site}/contact" style="color:#ffffff;text-decoration:none;">${lang === 'hr' ? 'Pošalji demo' : 'Send a demo'}</a>
          </p>
          <p style="margin:0;color:#5f5f5f;font:11px/1.6 Helvetica,Arial,sans-serif;">Hyard Records · product@hyardrecords.com · hyardrecords.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return html;
}

const block = (label, body) => `
        <tr><td style="padding:28px 32px 0;">
          <p style="margin:0 0 10px;color:#8a8a8a;${MONO}">${esc(label)}</p>
          ${body}
        </td></tr>`;
const quote = (text) => `<p style="margin:0;padding:16px 18px;border-left:2px solid #ffffff;background:#0d0d0d;color:#d6d6d6;${BODY}white-space:pre-wrap;">${esc(text)}</p>`;

const textLines = (pairs) => pairs.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '').map(([k, v]) => `${k}: ${v}`).join('\n');
const clean = (s) => s.replace(/\n{3,}/g, '\n\n').trim();

// ---------- 1. To the label: a new demo to review ----------
function demoForLabel({ id, demo, site, sentAt }) {
  site = site.replace(/\/$/, '');
  const files = demo.files || [];
  const who = demo.artist || demo.email;
  const subject = `New demo to review: ${demo.title}${demo.artist ? ` by ${demo.artist}` : ''}`;
  const url = `${site}/admin#a-demos`;
  const date = fmtDate(sentAt, 'en');
  const link = demo.link ? `<a href="${esc(demo.link)}" style="color:#ffffff;">${esc(demo.link.replace(/^https?:\/\//, '').slice(0, 48))}${demo.link.replace(/^https?:\/\//, '').length > 48 ? '…' : ''}</a>` : '';

  const fileList = files.length ? files.map((f, i) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="36" style="padding:8px 0;vertical-align:top;color:#ffffff;${MONO}">0${i + 1}</td>
            <td style="padding:8px 0;color:#ffffff;font:14px/1.5 Helvetica,Arial,sans-serif;word-break:break-all;">${esc(f.name)}</td>
            <td align="right" style="padding:8px 0 8px 12px;white-space:nowrap;color:#8a8a8a;${MONO}">${esc(bytes(f.size))}</td>
          </tr></table>`).join('') : `<p style="margin:0;color:#8a8a8a;${BODY}">No files uploaded, only a link.</p>`;

  const html = shell({
    lang: 'en', site, title: subject,
    preheader: `${demo.title} · ${who} · ready for review`,
    kicker: 'New demo',
    heading: 'Ready for<br>review',
    intro: `${who} just sent "${demo.title}". It's in the admin page with the status Received, waiting for your listen.`,
    rows: [
      ['Title', demo.title],
      ['Artist', demo.artist],
      ['Email', demo.email],
      ['Genre', demo.genre],
      ['BPM', demo.bpm],
      ['Key', demo.key],
      ['Link', link, { html: true, plain: true }],
      ['Sent', date],
      ['Demo', demoNo(id)],
    ],
    blocks: block(files.length ? `Files (${files.length})` : 'Files', fileList)
      + (demo.message ? block('Their message', quote(demo.message)) : ''),
    button: { label: 'Review in admin', url },
    closing: 'The artist got an email saying their demo arrived. They get another one whenever you change its status. Reply to this email to write to them directly.',
  });

  const text = clean([
    'NEW DEMO · READY FOR REVIEW', '',
    `${who} just sent "${demo.title}".`, '',
    textLines([['Title', demo.title], ['Artist', demo.artist], ['Email', demo.email], ['Genre', demo.genre], ['BPM', demo.bpm], ['Key', demo.key], ['Link', demo.link], ['Sent', date], ['Demo', demoNo(id)]]), '',
    files.length ? `Files:\n${files.map((f, i) => `${i + 1}. ${f.name} (${bytes(f.size)})`).join('\n')}` : 'No files uploaded, only a link.', '',
    demo.message ? `Their message:\n${demo.message}` : '', '',
    `Review in admin: ${url}`,
  ].join('\n'));
  return { subject, html, text };
}

// ---------- 2. To the artist: we've got it ----------
const RECEIVED = {
  en: {
    subject: (t) => `We've got your demo: ${t}`,
    kicker: 'Demo received',
    heading: "We've got<br>your demo",
    intro: (name, t) => `${name ? `Hi ${name}, t` : 'T'}hanks for sending "${t}". It reached us safely and is now waiting for a listen. We listen to every demo, so give us a little time.`,
    title: 'Title', artist: 'Artist', files: 'Files', link: 'Link', sent: 'Sent', status: 'Status', demo: 'Demo',
    next: 'What happens next',
    steps: [
      'We listen to your demo. Its status changes to Listening.',
      'You get an email every time the status changes.',
      "If it's a fit, we'll contact you about releasing it.",
    ],
    button: 'Follow your demo',
    closing: "Please don't send the same tracks again while this one is open. Questions? Just reply to this email.",
  },
  hr: {
    subject: (t) => `Primili smo vaš demo: ${t}`,
    kicker: 'Demo primljen',
    heading: 'Primili smo<br>vaš demo',
    intro: (name, t) => `${name ? `Bok ${name}, h` : 'H'}vala što ste poslali „${t}”. Stigao je do nas i čeka slušanje. Slušamo svaki demo, pa nam dajte malo vremena.`,
    title: 'Naslov', artist: 'Izvođač', files: 'Datoteke', link: 'Poveznica', sent: 'Poslano', status: 'Status', demo: 'Demo',
    next: 'Što slijedi',
    steps: [
      'Slušamo vaš demo. Status se mijenja u Slušamo.',
      'Svaki put kad se status promijeni, dobit ćete e-mail.',
      'Ako nam odgovara, javit ćemo vam se oko izdavanja.',
    ],
    button: 'Prati svoj demo',
    closing: 'Molimo ne šaljite iste pjesme ponovno dok je ovaj demo otvoren. Pitanja? Samo odgovorite na ovaj e-mail.',
  },
};

const steps = (items) => items.map((s, i) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="36" style="padding:6px 0;vertical-align:top;color:#ffffff;${MONO}">0${i + 1}</td>
            <td style="padding:6px 0;color:#d6d6d6;font:14px/1.6 Helvetica,Arial,sans-serif;">${esc(s)}</td>
          </tr></table>`).join('');

function demoReceived({ id, demo, site, sentAt, name }) {
  const lang = demo.lang === 'hr' ? 'hr' : 'en';
  const t = RECEIVED[lang];
  site = site.replace(/\/$/, '');
  const url = `${site}/dashboard#demos`;
  const first = String(name || '').trim().split(/\s+/)[0];
  const files = (demo.files || []).map((f) => f.name).join(', ');
  const date = fmtDate(sentAt, lang);
  const rows = [
    [t.title, demo.title],
    [t.artist, demo.artist],
    [t.files, files, { plain: true }],
    [t.link, demo.link ? (lang === 'hr' ? 'Dodana' : 'Added') : ''],
    [t.sent, date],
    [t.status, STATUS[lang].submitted],
    [t.demo, demoNo(id)],
  ];
  const html = shell({
    lang, site, title: t.subject(demo.title),
    preheader: t.intro(first, demo.title),
    kicker: t.kicker, heading: t.heading, intro: t.intro(first, demo.title),
    rows,
    blocks: block(t.next, steps(t.steps)),
    button: { label: t.button, url },
    closing: t.closing,
  });
  const text = clean([
    t.kicker.toUpperCase(), '', t.intro(first, demo.title), '',
    textLines(rows.map(([k, v]) => [k, v])), '',
    `${t.next}:`, ...t.steps.map((s, i) => `${i + 1}. ${s}`), '',
    `${t.button}: ${url}`, '', t.closing, '', 'Hyard Records · hyardrecords.com',
  ].join('\n'));
  return { subject: t.subject(demo.title), html, text };
}

// ---------- 3. To the artist: the status changed ----------
const CHANGED = {
  en: {
    subject: (t, s) => `Demo update: ${t} is now ${s}`,
    kicker: 'Demo update',
    heading: 'Your demo<br>has an update',
    intro: (name, t) => `${name ? `Hi ${name}, t` : 'T'}he status of "${t}" has changed.`,
    was: 'Was', now: 'Now', title: 'Title', demo: 'Demo', updated: 'Updated',
    note: 'Note from the label',
    button: 'See your demo',
    closing: 'You get an email like this every time the status changes. Questions? Just reply to this email.',
  },
  hr: {
    subject: (t, s) => `Novosti o demu ${t}: ${s}`,
    kicker: 'Novosti o demu',
    heading: 'Vaš demo<br>ima novosti',
    intro: (name, t) => `${name ? `Bok ${name}, s` : 'S'}tatus demoa „${t}” se promijenio.`,
    was: 'Prije', now: 'Sada', title: 'Naslov', demo: 'Demo', updated: 'Ažurirano',
    note: 'Poruka izdavača',
    button: 'Pogledaj svoj demo',
    closing: 'Ovakav e-mail dobivate svaki put kad se status promijeni. Pitanja? Samo odgovorite na ovaj e-mail.',
  },
};

function demoStatus({ id, demo, before, site, name, at }) {
  const lang = demo.lang === 'hr' ? 'hr' : 'en';
  const t = CHANGED[lang];
  site = site.replace(/\/$/, '');
  const url = `${site}/dashboard#demos`;
  const first = String(name || '').trim().split(/\s+/)[0];
  const now = STATUS[lang][demo.status] || demo.status;
  const was = STATUS[lang][before.status] || before.status;
  const meaning = MEANING[lang][demo.status] || '';

  const statusBlock = `
        <tr><td style="padding:28px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a2a;">
            <tr>
              <td width="50%" style="padding:18px 20px;border-right:1px solid #2a2a2a;vertical-align:top;">
                <p style="margin:0 0 6px;color:#8a8a8a;${MONO}">${esc(t.was)}</p>
                <p style="margin:0;color:#8a8a8a;font:900 18px/1.2 'Arial Black',Helvetica,Arial,sans-serif;text-transform:uppercase;text-decoration:line-through;">${esc(was)}</p>
              </td>
              <td width="50%" style="padding:18px 20px;vertical-align:top;background:#ffffff;">
                <p style="margin:0 0 6px;color:#555555;${MONO}">${esc(t.now)}</p>
                <p style="margin:0;color:#000000;font:900 18px/1.2 'Arial Black',Helvetica,Arial,sans-serif;text-transform:uppercase;">${esc(now)}</p>
              </td>
            </tr>
          </table>
          ${meaning ? `<p style="margin:18px 0 0;color:#ffffff;${BODY}">${esc(meaning)}</p>` : ''}
        </td></tr>`;

  const html = shell({
    lang, site, title: t.subject(demo.title, now),
    preheader: `${was} → ${now}`,
    kicker: t.kicker, heading: t.heading, intro: t.intro(first, demo.title),
    blocks: statusBlock
      + (demo.note ? block(t.note, quote(demo.note)) : '')
      + `
        <tr><td style="padding:28px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a;"><tr><td style="padding:12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${[[t.title, demo.title], [t.demo, demoNo(id)], [t.updated, fmtDate(at, lang)]].map(([k, v]) => `
              <tr>
                <td style="padding:5px 0;color:#8a8a8a;${MONO}">${esc(k)}</td>
                <td align="right" style="padding:5px 0 5px 16px;color:#ffffff;${MONO}">${esc(v)}</td>
              </tr>`).join('')}
            </table>
          </td></tr></table>
        </td></tr>`,
    button: { label: t.button, url },
    closing: t.closing,
  });
  const text = clean([
    t.kicker.toUpperCase(), '', t.intro(first, demo.title), '',
    `${t.was}: ${was}`, `${t.now}: ${now}`, meaning, '',
    demo.note ? `${t.note}:\n${demo.note}` : '', '',
    `${t.title}: ${demo.title}`, `${t.demo}: ${demoNo(id)}`, '',
    `${t.button}: ${url}`, '', t.closing, '', 'Hyard Records · hyardrecords.com',
  ].join('\n'));
  return { subject: t.subject(demo.title, now), html, text };
}

module.exports = { demoForLabel, demoReceived, demoStatus };
