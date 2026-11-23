// Receipt email for paid orders, in English or Croatian (the language the buyer used on the site).
// Orders with products (drum kits, sample packs…) get a "Thank you for your purchase" version with a
// download button for each product.
// The label gets its own version ("You received an order") with the buyer's details, what to do
// next on the admin page, and a link straight to the orders list.
// Styles are inline and the layout is tables, so it looks right in Gmail, Apple Mail and Outlook.

const T = {
  en: {
    subject: (no) => `Your Hyard Records receipt ${no}`,
    kicker: 'Payment received',
    title: 'Thanks for<br>your order',
    intro: (name) => `${name ? `Hi ${name}, w` : 'W'}e've received your payment. Here's your receipt. Send us your files and a short brief from your dashboard and we'll get started.`,
    order: 'Order',
    date: 'Date',
    paid: 'Paid',
    method: 'Payment',
    methodValue: 'Online through Stripe',
    item: 'Item',
    amount: 'Amount',
    notes: 'Your notes',
    total: 'Total paid',
    button: 'Open your order',
    next: 'What happens next',
    steps: [
      'Upload your stems or tracks and a short brief on the order in your dashboard.',
      'We start work and keep the order status up to date.',
      'Your finished files appear on the order for you to download.',
    ],
    credit: 'Everything we make for you is credited to Lovro Bedenk.',
    files: 'Files are deleted when the order is closed, so download them when they arrive.',
    questions: 'Questions about this order? Just reply to this email.',
    legal: 'Terms of service',
    pSubject: (no) => `Thank you for your purchase ${no}`,
    pTitle: 'Thank you for<br>your purchase',
    pIntro: (name) => `${name ? `Hi ${name}, t` : 'T'}hank you for your purchase! Here's your receipt, and your download is ready below.`,
    downloads: 'Your downloads',
    download: 'Download',
    pSteps: [
      'Click Download next to each product to get the files.',
      'The same links are on your order in the dashboard if you need them again.',
      'Each link works up to 10 times. Reply to this email if you run out.',
    ],
  },
  hr: {
    subject: (no) => `Vaš račun Hyard Records ${no}`,
    kicker: 'Uplata primljena',
    title: 'Hvala na<br>narudžbi',
    intro: (name) => `${name ? `Bok ${name}, p` : 'P'}rimili smo vašu uplatu. Ovo je vaša potvrda. Pošaljite nam datoteke i kratak opis na nadzornoj ploči i krećemo s radom.`,
    order: 'Narudžba',
    date: 'Datum',
    paid: 'Plaćeno',
    method: 'Plaćanje',
    methodValue: 'Online putem Stripea',
    item: 'Stavka',
    amount: 'Iznos',
    notes: 'Vaše napomene',
    total: 'Ukupno plaćeno',
    button: 'Otvori narudžbu',
    next: 'Što slijedi',
    steps: [
      'Na narudžbi na nadzornoj ploči prenesite stemove ili pjesme i kratak opis.',
      'Počinjemo s radom i ažuriramo status narudžbe.',
      'Gotove datoteke pojavit će se na narudžbi za preuzimanje.',
    ],
    credit: 'Sve što napravimo za vas potpisuje se kao Lovro Bedenk.',
    files: 'Datoteke se brišu kad se narudžba zatvori, pa ih preuzmite čim stignu.',
    questions: 'Pitanja o narudžbi? Samo odgovorite na ovaj e-mail.',
    legal: 'Uvjeti korištenja',
    pSubject: (no) => `Hvala na kupnji ${no}`,
    pTitle: 'Hvala na<br>kupnji',
    pIntro: (name) => `${name ? `Bok ${name}, h` : 'H'}vala na kupnji! Ovo je vaša potvrda, a preuzimanje vas čeka ispod.`,
    downloads: 'Vaša preuzimanja',
    download: 'Preuzmi',
    pSteps: [
      'Kliknite Preuzmi pokraj svakog proizvoda da biste dobili datoteke.',
      'Iste poveznice nalaze se na vašoj narudžbi na nadzornoj ploči ako vam ponovno zatrebaju.',
      'Svaka poveznica radi do 10 puta. Odgovorite na ovaj e-mail ako vam ponestane.',
    ],
  },
};

// The label's own email (always English)
const LABEL = {
  subject: (no, total) => `You received an order: ${no} · ${total}`,
  kicker: 'New order',
  title: 'You received<br>an order',
  intro: (who, total) => `${who} just paid ${total}. The order is in the admin page, waiting for their files and brief.`,
  customer: 'Customer',
  email: 'Email',
  language: 'Language',
  languages: { en: 'English', hr: 'Croatian' },
  button: 'Open in admin',
  next: 'Your next steps',
  steps: [
    'Wait for their files and brief on the order (or reply to this email to ask for them).',
    'Set the order to In progress when you start.',
    'Upload the finished files and set it to Delivered.',
    'Once they have downloaded everything, close the order to delete the files.',
  ],
  footer: 'The customer got their own receipt. Reply to this email to write to them directly.',
  pSubject: (no, total) => `You made a sale: ${no} · ${total}`,
  pTitle: 'You made<br>a sale',
  pIntro: (who, total, titles) => `${who} just bought ${titles} for ${total}. Their download link was emailed to them automatically.`,
  pSteps: ['Nothing to do: the buyer already has their download link.', 'You can see the sale in the admin overview and in Stripe.'],
};

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  hr: ['siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja', 'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca'],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const euro = (n, lang) => {
  const v = Number(n || 0).toFixed(2);
  return lang === 'hr' ? `${v.replace('.', ',')} €` : `€${v}`;
};

// Dates in Croatian time, whichever server sends the email
const fmtDate = (d, lang) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zagreb', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const m = MONTHS[lang][Number(p.month) - 1];
  return lang === 'hr' ? `${p.day}. ${m} ${p.year}. u ${p.hour}:${p.minute}` : `${p.day} ${m} ${p.year}, ${p.hour}:${p.minute}`;
};

// Item labels are written in English by the server ("Mastering · EP package (4 tracks)")
const itemLabel = (label, lang) => {
  if (lang !== 'hr') return label;
  return String(label)
    .replace(/(\d+) tracks?\)/, (m, n) => `${n} ${n === '1' ? 'pjesma' : (+n % 10 >= 2 && +n % 10 <= 4 && (+n % 100 < 12 || +n % 100 > 14)) ? 'pjesme' : 'pjesama'})`)
    .replace(/· (\d+) tracks?$/, (m, n) => `· ${n} ${n === '1' ? 'pjesma' : (+n % 10 >= 2 && +n % 10 <= 4 && (+n % 100 < 12 || +n % 100 > 14)) ? 'pjesme' : 'pjesama'}`)
    .replace(' package', ' paket');
};

const MONO = "font:12px/1.6 Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;";
const BODY = "font:15px/1.7 Helvetica,Arial,sans-serif;";
const DISPLAY = "font:900 30px/1.1 'Arial Black',Helvetica,Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase;";

/**
 * @param {object} o
 * @param {string} o.orderNo     e.g. HYO-AB12CD
 * @param {string} o.orderId     Firestore id, for the dashboard link
 * @param {Array}  o.items       [{ label, amount, notes }]
 * @param {number} o.total       euros
 * @param {Date}   o.paidAt
 * @param {string} o.email       buyer email
 * @param {string} [o.name]      buyer first name
 * @param {string} [o.lang]      'en' | 'hr'
 * @param {string} o.site        https://hyardrecords.com
 * @param {boolean} [o.forLabel] the label's copy
 * @param {string} [o.footerNote] extra line under the total (VAT wording, once known)
 */
function buildReceipt(o) {
  const lang = o.lang === 'hr' && !o.forLabel ? 'hr' : 'en';
  const t = o.forLabel ? { ...T.en, ...LABEL } : T[lang];
  const downloads = o.downloads || [];
  const productsOnly = downloads.length > 0 && o.hasServices === false;
  const productTitles = downloads.map((d) => d.title).join(', ');
  const site = o.site.replace(/\/$/, '');
  const total = euro(o.total, lang);
  const date = fmtDate(o.paidAt, lang);
  const orderUrl = o.forLabel ? `${site}/admin#a-orders` : `${site}/dashboard#orders`;
  const first = String(o.name || '').trim().split(/\s+/)[0];
  const who = String(o.name || '').trim() || o.email || 'A customer';
  let intro = o.forLabel ? LABEL.intro(who, total) : t.intro(first);
  if (downloads.length) {
    if (o.forLabel) intro = productsOnly ? LABEL.pIntro(who, total, productTitles) : `${LABEL.pIntro(who, total, productTitles)} The order also has a service, waiting for their files and brief.`;
    else intro = productsOnly ? t.pIntro(first) : `${t.pIntro(first)} ${t.intro(first).replace(/^[^.]*\. /, '')}`;
  }
  const subject = downloads.length ? (o.forLabel ? LABEL.pSubject(o.orderNo, total) : t.pSubject(o.orderNo)) : t.subject(o.orderNo, total);
  const heading = downloads.length ? (o.forLabel ? LABEL.pTitle : t.pTitle) : t.title;
  const steps = productsOnly ? (o.forLabel ? LABEL.pSteps : t.pSteps) : downloads.length && !o.forLabel ? [...t.pSteps.slice(0, 1), ...t.steps] : t.steps;
  const fromAddress = o.fromAddress || 'payments@hyardrecords.com';
  const dlBlock = downloads.length && !o.forLabel ? `
        <tr><td style="padding:32px 32px 0;">
          <p style="margin:0 0 12px;color:#8a8a8a;${MONO}">${esc(t.downloads)}</p>
          ${downloads.map((d) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a2a;margin:0 0 10px;"><tr>
            <td style="padding:14px 16px;color:#ffffff;${BODY}">${esc(d.title)}</td>
            <td align="right" style="padding:10px 12px;white-space:nowrap;"><a href="${esc(d.url)}" style="display:inline-block;background:#ffffff;color:#000000;font:900 13px/1 'Arial Black',Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;text-decoration:none;padding:12px 18px;">${esc(t.download)}</a></td>
          </tr></table>`).join('')}
        </td></tr>` : '';

  const rows = o.items.map((it) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #2a2a2a;vertical-align:top;">
            <p style="margin:0;color:#ffffff;${BODY}">${esc(itemLabel(it.label, lang))}</p>
            ${it.notes ? `<p style="margin:6px 0 0;color:#8a8a8a;font:13px/1.6 Helvetica,Arial,sans-serif;">${esc(o.forLabel ? 'Their notes' : t.notes)}: ${esc(it.notes)}</p>` : ''}
          </td>
          <td align="right" style="padding:14px 0 14px 16px;border-bottom:1px solid #2a2a2a;vertical-align:top;white-space:nowrap;color:#ffffff;${BODY}">${esc(euro(it.amount, lang))}</td>
        </tr>`).join('');

  const meta = [
    ...(o.forLabel ? [
      ...(o.name ? [[LABEL.customer, o.name]] : []),
      [LABEL.email, o.email || '-'],
      [LABEL.language, LABEL.languages[o.lang === 'hr' ? 'hr' : 'en']],
    ] : []),
    [t.order, o.orderNo],
    [t.date, date],
    [t.method, t.methodValue],
  ].map(([k, v]) => `
          <tr>
            <td style="padding:4px 0;color:#8a8a8a;${MONO}">${esc(k)}</td>
            <td align="right" style="padding:4px 0 4px 16px;color:#ffffff;${MONO}${String(v).includes('@') ? 'text-transform:none;letter-spacing:.04em;' : ''}">${esc(v)}</td>
          </tr>`).join('');


  const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#1a1a1a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(`${t.order} ${o.orderNo} · ${t.paid} ${total}`)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr><td align="center" style="padding:32px 16px 48px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#000000;border:1px solid #2a2a2a;">
        <tr><td align="center" style="padding:40px 32px 8px;">
          <img src="${site}/assets/email/hyard-logo-600.jpg" width="120" height="120" alt="Hyard Records" style="display:block;width:120px;height:120px;border:0;">
        </td></tr>
        <tr><td align="center" style="padding:16px 32px 0;">
          <p style="margin:0;color:#8a8a8a;${MONO}letter-spacing:.2em;">${esc(t.kicker)}</p>
        </td></tr>
        <tr><td align="center" style="padding:14px 32px 0;">
          <h1 style="margin:0;color:#ffffff;${DISPLAY}">${heading}</h1>
        </td></tr>
        <tr><td align="center" style="padding:20px 40px 0;">
          <p style="margin:0;color:#d6d6d6;${BODY}">${esc(intro)}</p>
        </td></tr>

        <tr><td style="padding:32px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a;">
            <tr><td style="padding:12px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${meta}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:8px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:16px 0 8px;color:#8a8a8a;${MONO}">${esc(t.item)}</td>
              <td align="right" style="padding:16px 0 8px;color:#8a8a8a;${MONO}">${esc(t.amount)}</td>
            </tr>${rows}
            <tr>
              <td style="padding:18px 0 0;color:#ffffff;font:900 16px/1.3 'Arial Black',Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;">${esc(t.total)}</td>
              <td align="right" style="padding:18px 0 0 16px;white-space:nowrap;color:#ffffff;font:900 22px/1.2 'Arial Black',Helvetica,Arial,sans-serif;">${esc(total)}</td>
            </tr>
            ${o.footerNote ? `<tr><td colspan="2" style="padding:10px 0 0;color:#8a8a8a;font:12px/1.6 Helvetica,Arial,sans-serif;">${esc(o.footerNote)}</td></tr>` : ''}
          </table>
        </td></tr>

${dlBlock}
        <tr><td align="center" style="padding:32px 32px 0;">
          <a href="${esc(orderUrl)}" style="display:inline-block;background:#ffffff;color:#000000;font:900 15px/1 'Arial Black',Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;text-decoration:none;padding:18px 34px;">${esc(t.button)}</a>
        </td></tr>

        <tr><td style="padding:36px 32px 0;">
          <p style="margin:0 0 12px;color:#8a8a8a;${MONO}">${esc(t.next)}</p>
          ${steps.map((s, i) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="36" style="padding:6px 0;vertical-align:top;color:#ffffff;${MONO}">0${i + 1}</td>
            <td style="padding:6px 0;color:#d6d6d6;font:14px/1.6 Helvetica,Arial,sans-serif;">${esc(s)}</td>
          </tr></table>`).join('')}
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0;color:#8a8a8a;font:13px/1.7 Helvetica,Arial,sans-serif;">${o.forLabel ? esc(LABEL.footer) : productsOnly ? esc(t.questions) : `${esc(t.credit)} ${esc(t.files)}<br>${esc(t.questions)}`}</p>
        </td></tr>

        <tr><td style="padding:36px 32px 0;"><div style="border-top:1px solid #2a2a2a;font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td align="center" style="padding:22px 32px 36px;">
          <p style="margin:0 0 10px;${MONO}">
            <a href="${site}/" style="color:#ffffff;text-decoration:none;">Website</a>
            <span style="color:#444;">&nbsp;·&nbsp;</span>
            <a href="https://www.instagram.com/hyardrecords/" style="color:#ffffff;text-decoration:none;">Instagram</a>
            <span style="color:#444;">&nbsp;·&nbsp;</span>
            <a href="${site}/terms" style="color:#ffffff;text-decoration:none;">${esc(t.legal)}</a>
          </p>
          <p style="margin:0;color:#5f5f5f;font:11px/1.6 Helvetica,Arial,sans-serif;">Hyard Records · ${esc(fromAddress)} · hyardrecords.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Plain-text version for mail apps that don't show HTML
  const text = [
    `${(downloads.length && !o.forLabel ? t.pTitle.replace('<br>', ' ') : t.kicker).toUpperCase()}`,
    '',
    intro,
    '',
    ...(o.forLabel ? [...(o.name ? [`${LABEL.customer}: ${o.name}`] : []), `${LABEL.email}: ${o.email || '-'}`, `${LABEL.language}: ${LABEL.languages[o.lang === 'hr' ? 'hr' : 'en']}`] : []),
    `${t.order}: ${o.orderNo}`,
    `${t.date}: ${date}`,
    `${t.method}: ${t.methodValue}`,
    '',
    ...o.items.map((it) => `${itemLabel(it.label, lang)}  ${euro(it.amount, lang)}${it.notes ? `\n  ${o.forLabel ? 'Their notes' : t.notes}: ${it.notes}` : ''}`),
    '',
    `${t.total}: ${total}`,
    o.footerNote || '',
    '',
    ...(downloads.length && !o.forLabel ? [`${t.downloads}:`, ...downloads.map((d) => `${d.title}: ${d.url}`), ''] : []),
    `${t.button}: ${orderUrl}`,
    '',
    `${t.next}:`,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    ...(o.forLabel ? [LABEL.footer] : productsOnly ? [t.questions] : [`${t.credit} ${t.files}`, t.questions]),
    '',
    'Hyard Records · hyardrecords.com',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    subject,
    html,
    text,
  };
}

module.exports = { buildReceipt };
