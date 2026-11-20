# Switching on accounts, demos and paid services

The pages are built and live, but they say "Accounts open soon" until Firebase is connected.
Follow these steps in order. Steps marked **(me)** are ones I do once you've done yours.

## 1. Firebase project (you)

1. Go to https://console.firebase.google.com → **Add project** → name it `hyard-records`. Google Analytics: off.
2. **Build → Authentication → Get started**:
   - **Sign-in method**: turn on **Email/Password** and **Google**.
   - **Settings → Authorized domains**: add `hyardrecords.com`.
   - **Templates**: set the sender name to *Hyard Records* (and later your own domain).
3. **Build → Firestore Database → Create database** → location **eur3 (Europe)** → start in **production mode**.
4. **Build → Storage → Get started** → same EU location.
5. **Upgrade to Blaze** (bottom left, the plan name). The server functions need it. At your volume it stays free.
   Then **Usage and billing → Details → Budget alert**: set €5.
6. **Project settings (gear) → Your apps → Web (</>)** → name it `website` → copy the `firebaseConfig` block and send it to me.

## 2. Firebase CLI (you)

In Terminal:

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

Then tell me the project ID (shown in Project settings).

## 3. Stripe (you)

1. Create an account at https://dashboard.stripe.com (Croatia is supported). Fill in business details and your payout bank account.
2. Stay in **Test mode** for now.
3. **Settings → Payment methods**: turn on Cards, Apple Pay, Google Pay and PayPal.
4. **Settings → Public details**: add `https://hyardrecords.com/terms` as the terms of service URL.
5. **Developers → API keys**: you'll paste the **Secret key** into Terminal in step 4 (never send it in chat or email).

## 4. Deploy (me, with you pasting the secrets)

```bash
firebase use --add                                   # pick hyard-records
cp functions/.env.example functions/.env             # set ADMIN_EMAILS to the label address
firebase functions:secrets:set STRIPE_SECRET_KEY     # paste the Stripe secret key
firebase deploy --only firestore:rules,storage,functions
```

Then in Stripe: **Developers → Webhooks → Add endpoint**
- URL: `https://europe-west1-<project-id>.cloudfunctions.net/stripeWebhook`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
- Copy the **signing secret** and run `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`, then deploy functions again.

Finally I paste the web config into `data/site.json → firebase` and push. Accounts are live.

## 5. Prices (you)

1. Create your account on the site with the admin email from `functions/.env` and confirm it.
2. Open **hyardrecords.com/admin → Services and prices → Load default services**.
3. Enter prices (empty = "Price coming soon"). They show straight away.

## 6. Test, then go live (you + me)

1. In test mode, buy something with card `4242 4242 4242 4242` (any future date, any CVC). Check the order shows as Paid.
2. Try `4000 0000 0000 0002` (declined) and the Back button on the Stripe page.
3. When everything works: switch Stripe to **Live mode**, replace both secrets with the live ones, add a live webhook, deploy functions again.
4. Make one real low-value purchase and refund it from Stripe. The order should show **Refunded**.

## Local test mode (for me)

On `localhost`, set `localStorage.setItem('hyard-mock', '1')` to click through every page with test data
from `scripts/dev/firebase-mock.js` (no Firebase needed, never published). Test login: `artist@example.com` / `testtest1`.
