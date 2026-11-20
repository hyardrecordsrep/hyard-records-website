// Hyard Records server functions (Firebase Cloud Functions, region europe-west1)
//
//   createCheckoutSession  prices the signed-in artist's cart from Firestore and opens Stripe Checkout
//   cancelCheckout         closes an unpaid order when the artist leaves the Stripe page
//   stripeWebhook          Stripe tells us a payment succeeded, failed, expired or was refunded
//   claimAdmin             gives the label's own account(s) access to the admin page
//   cleanUpDeletedUser     removes a deleted account's profile, demos and files
//
// Secrets (set once with the Firebase CLI, never committed):
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//   firebase functions:secrets:set SMTP_PASSWORD      (Google app password of SMTP_USER, for receipts)
// Settings (functions/.env): ADMIN_EMAILS, SITE_URL, SMTP_USER, RECEIPT_FROM, RECEIPT_COPY_TO, RECEIPT_NOTE
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const functionsV1 = require('firebase-functions/v1');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const { buildReceipt } = require('./receipt');

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
    const user = SMTP_USER.value();
    let pass = '';
    try { pass = SMTP_PASSWORD.value(); } catch { pass = ''; }
    if (!user || !pass) {
      logger.warn('Receipt not sent: SMTP_USER or SMTP_PASSWORD missing', { order: ref.id });
      await ref.update({ receiptSending: FieldValue.delete(), receiptError: 'not configured' });
      return;
    }
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: pass.replace(/\s+/g, '') } });
    const from = RECEIPT_FROM.value() || user;
    const base = {
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
    const copyTo = RECEIPT_COPY_TO.value();
    if (copyTo) {
      const r = buildReceipt({ ...base, forLabel: true });
      await transport.sendMail({ from: { name: 'Hyard Records', address: from }, replyTo: claimed.email || from, to: copyTo, subject: r.subject, html: r.html, text: r.text });
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
const priceCart = (items, services) => items.map((it) => {
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

  const servicesSnap = await db.collection('services').get();
  const services = Object.fromEntries(servicesSnap.docs.map((d) => [d.id, d.data()]));
  const lines = priceCart(items, services);
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
      submit: { message: 'You asked us to start within the 14-day withdrawal period. See the terms of service at hyardrecords.com/terms.' },
    },
  });

  await orderRef.set({
    uid: auth.uid,
    email: auth.token.email,
    items: lines.map(({ stripeName, unitAmount, quantity, ...rest }) => rest),
    total: totalCents / 100,
    currency: 'eur',
    status: 'awaiting_payment',
    lang: req.data?.lang === 'hr' ? 'hr' : 'en',
    consent: { terms: true, earlyStart: true, at: FieldValue.serverTimestamp() },
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
            await ref.update({
              status: 'paid', paidAt: now, updatedAt: now,
              paymentIntent: obj.payment_intent || null,
              amountPaid: (obj.amount_total || 0) / 100,
              checkoutUrl: FieldValue.delete(),
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
