// Hyard Records server functions (Firebase Cloud Functions, region europe-west1)
//
//   createCheckoutSession  prices the signed-in artist's cart from Firestore and opens Stripe Checkout
//   cancelCheckout         closes an unpaid order when the artist leaves the Stripe page
//   stripeWebhook          Stripe tells us a payment succeeded, failed, expired or was refunded
//   download               sends a buyer to the file of a product they paid for (link in their email)
//   adminStats             revenue, latest sales and most popular items for the admin overview
//   demoSubmitted          emails the label and the artist when a demo comes in
//   demoUpdated            emails the artist when the label changes a demo's status
//   claimAdmin             gives the label's own account(s) access to the admin page
//   cleanUpDeletedUser     removes a deleted account's profile, demos and files
//
// Secrets (set once with the Firebase CLI, never committed):
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//   firebase functions:secrets:set SMTP_PASSWORD      (Google app password of SMTP_USER, for receipts)
// Settings (functions/.env): ADMIN_EMAILS, SITE_URL, SMTP_USER, RECEIPT_FROM, RECEIPT_COPY_TO, RECEIPT_NOTE,
//   DEMO_FROM, DEMO_NOTIFY_TO, PRODUCT_FROM, PRODUCT_NOTIFY_TO
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const functionsV1 = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const { buildReceipt } = require('./receipt');
const { demoForLabel, demoReceived, demoStatus } = require('./demo-emails');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const ADMIN_EMAILS = defineString('ADMIN_EMAILS', { default: '' });
const SITE_URL = defineString('SITE_URL', { default: 'https://hyardrecords.com' });
// Receipts: sent through Google Workspace (smtp.gmail.com) as SMTP_USER, from RECEIPT_FROM.
// RECEIPT_FROM must be a "Send mail as" address of SMTP_USER in Gmail, or Gmail swaps it back.
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
const SMTP_USER = defineString('SMTP_USER', { default: '' });
const RECEIPT_FROM = defineString('RECEIPT_FROM', { default: 'payments@hyardrecords.com' });
const RECEIPT_COPY_TO = defineString('RECEIPT_COPY_TO', { default: '' });
const RECEIPT_NOTE = defineString('RECEIPT_NOTE', { default: '' });
// Demo emails: from DEMO_FROM (also a "Send mail as" address of SMTP_USER), label copy to DEMO_NOTIFY_TO
const DEMO_FROM = defineString('DEMO_FROM', { default: 'product@hyardrecords.com' });
const DEMO_NOTIFY_TO = defineString('DEMO_NOTIFY_TO', { default: '' });
// Products (drum kits, sample packs…): the buyer's email with the download links comes from
// PRODUCT_FROM, and PRODUCT_NOTIFY_TO gets told about every sale
const PRODUCT_FROM = defineString('PRODUCT_FROM', { default: 'product@hyardrecords.com' });
const PRODUCT_NOTIFY_TO = defineString('PRODUCT_NOTIFY_TO', { default: '' });
const DOWNLOAD_LIMIT = 10; // times each bought product can be downloaded from its link
const downloadUrl = (orderId, token) => `https://europe-west1-${process.env.GCLOUD_PROJECT || 'hyardrecords'}.cloudfunctions.net/download?o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`;

// One Gmail connection for all emails. Returns null (and logs) when the login isn't set up.
const mailer = () => {
  const user = SMTP_USER.value();
  let pass = '';
  try { pass = SMTP_PASSWORD.value(); } catch { pass = ''; }
  if (!user || !pass) { logger.warn('Email not sent: SMTP_USER or SMTP_PASSWORD missing'); return null; }
  return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: pass.replace(/\s+/g, '') } });
};

const orderNumber = (id) => `HYO-${String(id).slice(0, 6).toUpperCase()}`;

// Sends the receipt to the buyer and a copy to the label. Never throws: a mail problem must not
// make Stripe retry the webhook. receiptSentAt stops a second copy if Stripe sends the event twice.
async function sendReceipt(ref, extra = {}) {
  const claimed = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const o = s.data();
    if (!o || o.receiptSentAt || o.receiptSending) return null;
    tx.update(ref, { receiptSending: true });
    return o;
  });
  if (!claimed) return;
  try {
    const transport = mailer();
    if (!transport) {
      await ref.update({ receiptSending: FieldValue.delete(), receiptError: 'not configured' });
      return;
    }
    const downloads = (claimed.downloads || []).map((d) => ({ title: d.title, url: downloadUrl(ref.id, d.token) }));
    const hasProducts = downloads.length > 0;
    const hasServices = claimed.hasServices !== false;
    const from = (hasProducts ? PRODUCT_FROM.value() : RECEIPT_FROM.value()) || SMTP_USER.value();
    const base = {
      downloads,
      hasServices,
      fromAddress: from,
      orderNo: orderNumber(ref.id),
      orderId: ref.id,
      items: (claimed.items || []).map((i) => ({ label: i.label, amount: i.amount, notes: i.notes })),
      total: extra.amountPaid ?? claimed.amountPaid ?? claimed.total,
      paidAt: new Date(),
      email: claimed.email,
      name: extra.name || '',
      lang: claimed.lang,
      site: SITE_URL.value(),
      footerNote: RECEIPT_NOTE.value(),
    };
    const sent = [];
    if (claimed.email) {
      const r = buildReceipt(base);
      await transport.sendMail({ from: { name: 'Hyard Records', address: from }, replyTo: from, to: claimed.email, subject: r.subject, html: r.html, text: r.text });
      sent.push('buyer');
    }
    const copyTo = [...new Set([
      ...(hasServices ? [RECEIPT_COPY_TO.value()] : []),
      ...(hasProducts ? [PRODUCT_NOTIFY_TO.value()] : []),
    ].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))];
    if (copyTo.length) {
      const r = buildReceipt({ ...base, forLabel: true });
      await transport.sendMail({ from: { name: 'Hyard Records', address: from }, replyTo: claimed.email || from, to: copyTo.join(', '), subject: r.subject, html: r.html, text: r.text });
      sent.push('label');
    }
    await ref.update({ receiptSentAt: FieldValue.serverTimestamp(), receiptSending: FieldValue.delete(), receiptError: FieldValue.delete() });
    logger.info('Receipt sent', { order: ref.id, sent });
  } catch (err) {
    logger.error('Receipt failed', { order: ref.id, message: err.message });
    await ref.update({ receiptSending: FieldValue.delete(), receiptError: String(err.message || err).slice(0, 300) }).catch(() => {});
  }
}

const stripeClient = () => new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: '2024-06-20' });
const hasPrice = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
const cents = (euros) => Math.round(Number(euros) * 100);

// Works out each cart line from the prices in Firestore (never from the browser)
const priceCart = (items, services, products) => items.map((it) => {
  if (it.productId) {
    const p = products[it.productId];
    if (!p || p.active === false || !p.file || !p.file.path) throw new HttpsError('failed-precondition', 'One of the products in your cart is no longer available. Remove it and try again.');
    if (!hasPrice(p.price)) throw new HttpsError('failed-precondition', `${p.title} doesn't have a price yet, so it can't be bought.`);
    const unit = cents(p.price);
    return {
      productId: it.productId, kind: 'product', notes: '',
      label: p.title, category: p.category || '',
      unitAmount: unit, quantity: 1, amount: unit / 100,
      stripeName: `${p.title} (digital download)`,
    };
  }
  const svc = services[it.serviceId];
  if (!svc || svc.active === false) throw new HttpsError('failed-precondition', 'One of the services in your cart is no longer offered. Remove it and try again.');
  if (it.option === 'track') {
    const tracks = Math.min(30, Math.max(1, Math.round(Number(it.tracks) || 1)));
    if (!hasPrice(svc.pricePerTrack)) throw new HttpsError('failed-precondition', `${svc.name} doesn't have a price yet, so it can't be bought.`);
    const unit = cents(svc.pricePerTrack);
    return {
      serviceId: it.serviceId, option: 'track', tracks, notes: String(it.notes || '').slice(0, 500),
      label: `${svc.name} · ${tracks} ${tracks === 1 ? 'track' : 'tracks'}`,
      unitAmount: unit, quantity: tracks, amount: (unit * tracks) / 100,
      stripeName: `${svc.name} (per track)`,
    };
  }
  const pkg = (svc.packages || []).find((p) => p.id === it.option);
  if (!pkg) throw new HttpsError('failed-precondition', `That ${svc.name} package is no longer offered. Remove it and try again.`);
  if (!hasPrice(pkg.price)) throw new HttpsError('failed-precondition', `${svc.name} · ${pkg.name} doesn't have a price yet, so it can't be bought.`);
  const unit = cents(pkg.price);
  return {
    serviceId: it.serviceId, option: pkg.id, tracks: pkg.tracks || null, notes: String(it.notes || '').slice(0, 500),
    label: `${svc.name} · ${pkg.name} package (${pkg.tracks} tracks)`,
    unitAmount: unit, quantity: 1, amount: unit / 100,
    stripeName: `${svc.name}: ${pkg.name} package (${pkg.tracks} tracks)`,
  };
});

exports.createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY], enforceAppCheck: false }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Log in first.');
  if (!auth.token.email_verified) throw new HttpsError('failed-precondition', 'Confirm your email before paying.');
  if (req.data?.consent !== true) throw new HttpsError('failed-precondition', 'Agree to the terms and the early start first.');

  const cartSnap = await db.doc(`carts/${auth.uid}`).get();
  const items = (cartSnap.exists && cartSnap.data().items) || [];
  if (!items.length) throw new HttpsError('failed-precondition', 'Your cart is empty.');
  if (items.length > 20) throw new HttpsError('failed-precondition', 'Too many items in your cart.');

  const [servicesSnap, productsSnap] = await Promise.all([db.collection('services').get(), db.collection('products').get()]);
  const services = Object.fromEntries(servicesSnap.docs.map((d) => [d.id, d.data()]));
  const products = Object.fromEntries(productsSnap.docs.map((d) => [d.id, d.data()]));
  // Each product only once per order
  const seen = new Set();
  const unique = items.filter((it) => !it.productId || (!seen.has(it.productId) && seen.add(it.productId)));
  const lines = priceCart(unique, services, products);
  const hasProducts = lines.some((l) => l.productId);
  const hasServices = lines.some((l) => !l.productId);
  const totalCents = lines.reduce((n, l) => n + l.unitAmount * l.quantity, 0);
  if (totalCents < 50) throw new HttpsError('failed-precondition', 'The total is too small to pay by card.');

  const site = SITE_URL.value().replace(/\/$/, '');
  const orderRef = db.collection('orders').doc();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60; // unpaid checkout pages close after an hour

  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: auth.token.email,
    client_reference_id: orderRef.id,
    metadata: { orderId: orderRef.id, uid: auth.uid },
    payment_intent_data: { metadata: { orderId: orderRef.id, uid: auth.uid }, description: `Hyard Records order HYO-${orderRef.id.slice(0, 6).toUpperCase()}` },
    line_items: lines.map((l) => ({
      quantity: l.quantity,
      price_data: { currency: 'eur', unit_amount: l.unitAmount, product_data: { name: l.stripeName } },
    })),
    locale: req.data?.lang === 'hr' ? 'hr' : 'en',
    expires_at: expiresAt,
    success_url: `${site}/order-confirmed?order=${orderRef.id}`,
    cancel_url: `${site}/payment-failed?order=${orderRef.id}&reason=cancelled`,
    custom_text: {
      submit: {
        message: [
          hasServices ? 'You asked us to start within the 14-day withdrawal period.' : '',
          hasProducts ? 'Digital downloads are emailed to you as soon as the payment goes through, and you agreed that this ends your right to withdraw from them.' : '',
          'See the terms of service at hyardrecords.com/terms.',
        ].filter(Boolean).join(' '),
      },
    },
  });

  await orderRef.set({
    uid: auth.uid,
    email: auth.token.email,
    items: lines.map(({ stripeName, unitAmount, quantity, ...rest }) => rest),
    total: totalCents / 100,
    currency: 'eur',
    status: 'awaiting_payment',
    hasServices,
    hasProducts,
    lang: req.data?.lang === 'hr' ? 'hr' : 'en',
    consent: { terms: true, earlyStart: hasServices, digitalDelivery: hasProducts, at: FieldValue.serverTimestamp() },
    stripeSessionId: session.id,
    checkoutUrl: session.url,
    expiresAt: Timestamp.fromMillis(expiresAt * 1000),
    brief: '',
    uploads: [],
    deliverables: [],
    adminNote: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { url: session.url, orderId: orderRef.id };
});

exports.cancelCheckout = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Log in first.');
  const id = String(req.data?.orderId || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new HttpsError('invalid-argument', 'Unknown order.');
  const ref = db.doc(`orders/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== req.auth.uid) throw new HttpsError('not-found', 'Unknown order.');
  const o = snap.data();
  if (o.status !== 'awaiting_payment') return { status: o.status };
  try {
    await stripeClient().checkout.sessions.expire(o.stripeSessionId);
  } catch (err) {
    // Already paid or expired: the webhook has the final word
    logger.info('Session not expired', { id, message: err.message });
    return { status: o.status };
  }
  await ref.update({ status: 'cancelled', checkoutUrl: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  return { status: 'cancelled' };
});

// Stripe → us. Set the endpoint in Stripe: Developers → Webhooks → Add endpoint
//   https://europe-west1-<project-id>.cloudfunctions.net/stripeWebhook
// Events: checkout.session.completed, checkout.session.async_payment_succeeded,
//         checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SMTP_PASSWORD] }, async (req, res) => {
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
  } catch (err) {
    logger.warn('Webhook signature check failed', { message: err.message });
    res.status(400).send('Bad signature');
    return;
  }

  const obj = event.data.object;
  const orderFor = async () => {
    const id = obj.metadata?.orderId || obj.client_reference_id;
    if (id) return db.doc(`orders/${id}`);
    if (obj.payment_intent) {
      const q = await db.collection('orders').where('paymentIntent', '==', obj.payment_intent).limit(1).get();
      if (!q.empty) return q.docs[0].ref;
    }
    return null;
  };

  try {
    const ref = await orderFor();
    if (!ref) { res.json({ received: true, note: 'no matching order' }); return; }
    const snap = await ref.get();
    if (!snap.exists) { res.json({ received: true, note: 'order missing' }); return; }
    const order = snap.data();
    const now = FieldValue.serverTimestamp();

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (obj.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') {
          if (['awaiting_payment', 'payment_failed', 'cancelled'].includes(order.status)) {
            const productLines = (order.items || []).filter((i) => i.productId);
            await ref.update({
              status: order.hasServices === false ? 'delivered' : 'paid', paidAt: now, updatedAt: now,
              paymentIntent: obj.payment_intent || null,
              amountPaid: (obj.amount_total || 0) / 100,
              checkoutUrl: FieldValue.delete(),
              ...(productLines.length ? {
                downloads: productLines.map((i) => ({ productId: i.productId, title: i.label, token: crypto.randomBytes(24).toString('hex'), count: 0 })),
              } : {}),
            });
            await db.doc(`carts/${order.uid}`).delete().catch(() => {});
            await sendReceipt(ref, { amountPaid: (obj.amount_total || 0) / 100, name: obj.customer_details?.name || '' });
          }
        } else {
          // Bank transfer style payments: paid later, Stripe sends async_payment_succeeded
          await ref.update({ paymentIntent: obj.payment_intent || null, checkoutUrl: FieldValue.delete(), updatedAt: now });
        }
        break;
      }
      case 'checkout.session.async_payment_failed':
        if (order.status === 'awaiting_payment') await ref.update({ status: 'payment_failed', updatedAt: now });
        break;
      case 'checkout.session.expired':
        if (order.status === 'awaiting_payment') await ref.update({ status: 'cancelled', checkoutUrl: FieldValue.delete(), updatedAt: now });
        break;
      case 'charge.refunded':
        await ref.update({
          status: obj.amount_refunded >= obj.amount ? 'refunded' : order.status,
          amountRefunded: (obj.amount_refunded || 0) / 100,
          updatedAt: now,
        });
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook failed', err);
    res.status(500).send('Webhook handler failed');
  }
});

// ---------- Product downloads ----------
// The link in the buyer's email (and on their order) lands here. We check the order is paid and the
// link hasn't been used up, then send the browser to the file for 15 minutes.
const page = (res, code, title, text) => {
  const site = SITE_URL.value().replace(/\/$/, '');
  res.status(code).set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | Hyard Records</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font:15px/1.7 Helvetica,Arial,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div style="max-width:460px"><p style="font:12px Menlo,monospace;letter-spacing:.2em;text-transform:uppercase;color:#8a8a8a">Hyard Records</p>
<h1 style="font:900 30px/1.1 'Arial Black',Helvetica,sans-serif;text-transform:uppercase;margin:0 0 16px">${title}</h1><p style="color:#d6d6d6">${text}</p>
<p><a href="${site}/dashboard#orders" style="color:#fff">Open your orders</a> · <a href="mailto:${PRODUCT_FROM.value()}" style="color:#fff">${PRODUCT_FROM.value()}</a></p></div></body></html>`);
};

exports.download = onRequest(async (req, res) => {
  const orderId = String(req.query.o || '');
  const token = String(req.query.t || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(orderId) || !/^[a-f0-9]{48}$/.test(token)) {
    page(res, 404, 'Link not found', 'This download link isn\'t right. Use the link in your email, or the Download button on your order.');
    return;
  }
  const ref = db.doc(`orders/${orderId}`);
  let item;
  try {
    item = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: 'missing' };
      const o = snap.data();
      const downloads = o.downloads || [];
      const i = downloads.findIndex((d) => d.token === token);
      if (i < 0) return { error: 'missing' };
      if (!['paid', 'in_progress', 'delivered'].includes(o.status)) return { error: 'refunded' };
      if ((downloads[i].count || 0) >= DOWNLOAD_LIMIT) return { error: 'used' };
      downloads[i] = { ...downloads[i], count: (downloads[i].count || 0) + 1, lastAt: Timestamp.now() };
      tx.update(ref, { downloads });
      return downloads[i];
    });
  } catch (err) {
    logger.error('Download check failed', { orderId, message: err.message });
    page(res, 500, 'Try again', 'Something went wrong on our side. Try the link again in a minute.');
    return;
  }
  if (item.error === 'missing') { page(res, 404, 'Link not found', 'This download link isn\'t right. Use the link in your email, or the Download button on your order.'); return; }
  if (item.error === 'refunded') { page(res, 410, 'Link closed', 'This order was refunded or isn\'t paid, so its downloads are closed.'); return; }
  if (item.error === 'used') { page(res, 410, 'Link used up', `This link has been used ${DOWNLOAD_LIMIT} times. Write to us and we'll send you a fresh one.`); return; }

  const prod = await db.doc(`products/${item.productId}`).get();
  const f = prod.exists && prod.data().file;
  if (!f || !f.path) { page(res, 404, 'File missing', 'We can\'t find this product\'s file right now. Write to us and we\'ll sort it out.'); return; }
  const file = admin.storage().bucket().file(f.path);
  const name = String(f.name || f.path.split('/').pop()).replace(/["\\\r\n]/g, '');
  let url;
  try {
    [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 15 * 60 * 1000, responseDisposition: `attachment; filename="${name}"` });
  } catch (err) {
    // No permission to sign URLs: fall back to the file's Firebase download token
    logger.info('Signed URL not available, using a download token', { message: err.message });
    try {
      const [meta] = await file.getMetadata();
      let tok = String((meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || '').split(',')[0];
      if (!tok) { tok = crypto.randomUUID(); await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: tok } }); }
      url = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(f.path)}?alt=media&token=${tok}`;
    } catch (err2) {
      logger.error('Download link failed', { orderId, message: err2.message });
      page(res, 500, 'Try again', 'Something went wrong on our side. Try the link again in a minute.');
      return;
    }
  }
  logger.info('Download', { orderId, productId: item.productId, count: item.count });
  res.redirect(302, url);
});

// ---------- Admin overview ----------
// Revenue from Stripe (last 12 months, refunds taken off), the latest sales with what was bought,
// and the most popular products and services from the paid orders.
exports.adminStats = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth || req.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admins only.');
  const stripe = stripeClient();
  const since = Math.floor(Date.now() / 1000) - 366 * 86400;
  const charges = [];
  for await (const c of stripe.charges.list({ created: { gte: since }, limit: 100 })) {
    if (c.status === 'succeeded' && c.paid) charges.push(c);
    if (charges.length >= 3000) break;
  }
  const day = (sec) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sec * 1000));
  const daily = {};
  charges.forEach((c) => {
    const k = day(c.created);
    const d = daily[k] || (daily[k] = { revenue: 0, sales: 0 });
    d.revenue += (c.amount - (c.amount_refunded || 0)) / 100;
    d.sales += 1;
  });

  const latestCharges = charges.slice(0, 8);
  const pis = latestCharges.map((c) => c.payment_intent).filter(Boolean);
  const byPi = {};
  if (pis.length) {
    const q = await db.collection('orders').where('paymentIntent', 'in', pis.slice(0, 10)).get();
    q.forEach((d) => { byPi[d.data().paymentIntent] = { id: d.id, ...d.data() }; });
  }
  const latest = latestCharges.map((c) => {
    const o = byPi[c.payment_intent];
    return {
      amount: c.amount / 100,
      refunded: (c.amount_refunded || 0) / 100,
      created: c.created * 1000,
      email: (c.billing_details && c.billing_details.email) || c.receipt_email || (o && o.email) || '',
      name: (c.billing_details && c.billing_details.name) || '',
      items: o ? (o.items || []).map((i) => i.label) : [c.description || 'Payment'],
      orderId: o ? o.id : null,
      paymentIntent: c.payment_intent || null,
    };
  });

  // Most popular: from paid orders (products and services)
  const paid = await db.collection('orders').where('status', 'in', ['paid', 'in_progress', 'delivered']).get();
  const pop = {};
  paid.forEach((d) => (d.data().items || []).forEach((i) => {
    const key = i.productId ? `p:${i.productId}` : `s:${i.serviceId}`;
    const name = i.productId ? i.label : String(i.label || '').split(' · ')[0];
    const e = pop[key] || (pop[key] = { name, kind: i.productId ? 'product' : 'service', sold: 0, revenue: 0 });
    e.sold += 1;
    e.revenue += Number(i.amount) || 0;
  }));
  const popular = Object.values(pop).sort((a, b) => b.sold - a.sold || b.revenue - a.revenue).slice(0, 6);

  let balance = null;
  try {
    const b = await stripe.balance.retrieve();
    const sum = (list) => (list || []).filter((x) => x.currency === 'eur').reduce((n, x) => n + x.amount, 0) / 100;
    balance = { available: sum(b.available), pending: sum(b.pending) };
  } catch (err) { logger.warn('Balance not read', { message: err.message }); }

  // Live keys start with sk_live_ or rk_live_ (restricted); a charge also says which mode it came from
  const live = charges.length ? charges[0].livemode === true : /^(sk|rk)_live_/.test(String(STRIPE_SECRET_KEY.value()));
  return { daily, latest, popular, balance, stripeBase: live ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test' };
});

// ---------- Demo emails ----------
const artistName = async (uid) => {
  try { const u = await db.doc(`users/${uid}`).get(); return (u.exists && u.data().name) || ''; } catch { return ''; }
};
const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : new Date());

// A demo came in: tell the label (with every detail) and tell the artist it arrived
exports.demoSubmitted = onDocumentCreated({ document: 'demos/{id}', secrets: [SMTP_PASSWORD] }, async (event) => {
  const demo = event.data && event.data.data();
  if (!demo) return;
  const transport = mailer();
  if (!transport) return;
  const id = event.params.id;
  const site = SITE_URL.value();
  const from = { name: 'Hyard Records', address: DEMO_FROM.value() || SMTP_USER.value() };
  const sentAt = toDate(demo.createdAt);

  const label = DEMO_NOTIFY_TO.value();
  if (label) {
    const m = demoForLabel({ id, demo, site, sentAt });
    await transport.sendMail({ from, to: label, replyTo: demo.email || from.address, subject: m.subject, html: m.html, text: m.text })
      .catch((err) => logger.error('Demo email to label failed', { id, message: err.message }));
  }
  if (demo.email) {
    const m = demoReceived({ id, demo, site, sentAt, name: await artistName(demo.uid) });
    await transport.sendMail({ from, to: demo.email, replyTo: from.address, subject: m.subject, html: m.html, text: m.text })
      .then((info) => logger.info('Demo email to artist sent', { id, to: demo.email, accepted: info.accepted, rejected: info.rejected }))
      .catch((err) => logger.error('Demo email to artist failed', { id, to: demo.email, message: err.message }));
  }
  logger.info('Demo emails sent', { id });
});

// The label changed a demo's status: tell the artist what changed, with the label's note
exports.demoUpdated = onDocumentUpdated({ document: 'demos/{id}', secrets: [SMTP_PASSWORD] }, async (event) => {
  const before = event.data && event.data.before.data();
  const demo = event.data && event.data.after.data();
  if (!before || !demo || before.status === demo.status || !demo.email) return;
  const transport = mailer();
  if (!transport) return;
  const id = event.params.id;
  const from = { name: 'Hyard Records', address: DEMO_FROM.value() || SMTP_USER.value() };
  const m = demoStatus({ id, demo, before, site: SITE_URL.value(), name: await artistName(demo.uid), at: toDate(demo.updatedAt) });
  await transport.sendMail({ from, to: demo.email, replyTo: from.address, subject: m.subject, html: m.html, text: m.text })
    .then((info) => logger.info('Demo status email sent', { id, status: demo.status, to: demo.email, accepted: info.accepted, rejected: info.rejected }))
    .catch((err) => logger.error('Demo status email failed', { id, to: demo.email, message: err.message }));
});

// The label's own accounts (ADMIN_EMAILS, comma separated) get the admin flag the first time
// they open the admin page. The email has to be confirmed, so nobody can claim it by typing it.
exports.claimAdmin = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Log in first.');
  const allowed = ADMIN_EMAILS.value().split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = String(req.auth.token.email || '').toLowerCase();
  const ok = req.auth.token.email_verified === true && allowed.includes(email);
  if (!ok) return { admin: false };
  if (req.auth.token.admin !== true) await admin.auth().setCustomUserClaims(req.auth.uid, { admin: true });
  return { admin: true };
});

// When someone deletes their account: remove the profile, cart, demos and demo files.
// Paid orders are kept for bookkeeping, with the name and email removed.
exports.cleanUpDeletedUser = functionsV1.region('europe-west1').auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const bucket = admin.storage().bucket();
  const batch = db.batch();
  batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`carts/${uid}`));
  const demos = await db.collection('demos').where('uid', '==', uid).get();
  demos.forEach((d) => batch.delete(d.ref));
  const orders = await db.collection('orders').where('uid', '==', uid).get();
  orders.forEach((o) => {
    const paid = ['paid', 'in_progress', 'delivered', 'refunded'].includes(o.data().status);
    if (paid) batch.update(o.ref, { uid: 'deleted', email: FieldValue.delete(), brief: FieldValue.delete(), accountDeletedAt: FieldValue.serverTimestamp() });
    else batch.delete(o.ref);
  });
  await batch.commit();
  await bucket.deleteFiles({ prefix: `demos/${uid}/` }).catch((err) => logger.warn('Demo files not removed', err));
  await bucket.deleteFiles({ prefix: `orders/${uid}/` }).catch((err) => logger.warn('Order files not removed', err));
});
