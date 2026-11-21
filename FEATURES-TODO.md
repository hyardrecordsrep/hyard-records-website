# Hyard Records website — features to do

Last updated: 20 November 2026

Legend: **(you)** needs something only you can provide or set up · **(me)** I can build it once you say go

---

## 1. Legal and contact details

- [ ] **Fill in the legal notice** (name, legal entity, OIB, VAT wording, consumer complaints body; address Ulica Hermana Bužana 10 and info@hyardrecords.com are known) **(you)**
- [ ] **VAT line in the terms of service**: whether you charge VAT or are exempt **(you)**
- [ ] **Send the remaining socials**: TikTok, YouTube **(you)**

## 2. Paid services: going live

Setup steps: `SETUP-ACCOUNTS.md`.

- [ ] **Upgrade Google Cloud to a full account** before the 90-day free trial ends, or Google pauses logins and uploads **(you)**
- [ ] **Before/after audio examples** on each service **(you + me)**
- [ ] **Testimonials and credits list** from artists you've worked with **(you + me)**
- [ ] Suggestions, not built yet:
  - Email the artist when their finished files are delivered **(me)**
  - Discount codes (Stripe promotion codes) **(me)**
  - Automatic VAT with Stripe Tax, once you know if you charge VAT **(you + me)**
  - Messages between artist and label on each order **(me)**
  - Spam protection on sign-up and uploads (Firebase App Check) **(me)**
  - Newsletter tick box on sign-up **(me)**
  - More admin accounts, e.g. a Hyard address **(you + me)**

## 3. Fans and community

- [ ] **Add your first events** to `data/events.json` (or send me the details) **(you)**

## 4. Later

- [ ] **Open the merch store** when products are ready; the menu already shows "Merch · Coming soon" **(you + me)**

---

## Done

- [x] Emails reach Outlook inboxes instead of Junk
- [x] Real low-value purchase and refund tested end to end
- [x] Artist and label bios in Croatian when the site is switched to HR (artist pages and press kit)
- [x] Service prices entered (mastering from €35, mixing from €110, production from €300, all three from €400), 1 week per track, 2 revision rounds
- [x] Brand guide and brand board (`brand/`); Archivo confirmed as the display font
- [x] Animated home page: logo intro that fades into the latest release banner, marquee, slide-in animations
- [x] Latest release banner: newest release from the Spotify catalog, updates itself with the daily sync
- [x] Featured album: Beginning and The End (coming soon) with a pre-save box
- [x] 29 releases numbered HYD-001 to HYD-029, with tracklists, dates and covers from Spotify (Mass Hypnosis credited to Rave Saint)
- [x] Release page for every release: cover, player, tracklist, facts, all-platform link, previous/next, more from the artist
- [x] Home page, search and artist pages all read from the catalog the Spotify sync updates
- [x] Release search with filters by artist, type and year, plus sorting
- [x] Artist pages: Blurfnes, Rave Saint, Nick., with socials, top tracks (list + player) and a "Worked with" row from Spotify credits
- [x] About the label page and demo guidelines (text approved)
- [x] Radio: "Now featured" track (auto newest, or your pick in `data/radio.json`), "Fresh on Hyard" newest tracks, Hyard Radio playlist + "Listen to radio" button
- [x] Events page in the menu: upcoming and past events, artist filter, tickets and add-to-calendar (fed from `data/events.json`)
- [x] Send your demo page: demo guidelines plus a link to send demos from an artist account
- [x] Press kit page (footer only): logos, artist photos, bios with copy buttons, fact sheet, one-click zip
- [x] Merch in the menu with "Coming soon"
- [x] Search bar next to the menu button with live suggestions (search icon on phones); Search releases removed from the menu
- [x] Contact page for press, bookings, business and privacy, separate from Send your demo
- [x] Hamburger menu and full footer with all pages, Instagram, SoundCloud, Spotify
- [x] Newsletter and album pre-save connected to MailerLite (double opt-in, separate groups)
- [x] Thank-you page after confirming (`/confirmed`, pre-save version `/confirmed?list=presave`), set as MailerLite's thank-you page for both forms
- [x] Confirmation email designs for newsletter and pre-save (`brand/email/`)
- [x] Privacy policy filled in (address, info@ as label email, privacy@ for privacy requests, GitHub Pages hosting, demos deleted after the decision, order files deleted when the order closes)
- [x] Legal notice (draft with blanks)
- [x] 404 page, link previews, sitemap.xml, robots.txt
- [x] Daily Spotify sync running (04:17 UTC): 29 releases matched Spotify on the first run
- [x] Published on GitHub Pages from github.com/hyardrecordsrep/hyard-records-website; every push republishes
- [x] hyardrecords.com connected (bought at name.com), HTTPS certificate from GitHub, http and www redirect to https://hyardrecords.com
- [x] Clean addresses without .html (hyardrecords.com/about, /release-hyd-020…), home links go to the bare domain, old .html addresses redirect
- [x] Covers and artist photos stored on the site; the sync downloads new ones automatically
- [x] Own page per release (`release-hyd-020.html`) and per artist (`artist-blurfnes.html`) with their own cover in link previews; sitemap lists them all
- [x] Accessibility: skip link, page heading on home, readable placeholders, focus kept inside the open menu, named cover link
- [x] Visitor stats: Cloudflare Web Analytics, cookie-free
- [x] Croatian version with an EN/HR switch in the header (remembers the choice; Croatian browsers get it automatically)
- [x] Artist accounts live: sign up and log in with email or Google, confirmation email, password reset
- [x] Artist dashboard: send demos (MP3/WAV up to 200 MB each, full quality), demo status with notes from the label, profile, change password or email, delete account
- [x] Services: production, mixing, mastering and all three, with per-track prices and EP/album packages
- [x] Cart, Stripe Checkout, order confirmed and payment failed pages, orders and file exchange in the dashboard
- [x] Admin page (label account only): review demos, move orders along, upload finished files, close orders and delete files, edit services and prices
- [x] Firebase project, security rules and server functions deployed; Stripe connected in test mode and a test purchase worked
- [x] Terms of service: credit to Lovro Bedenk, any track length, files deleted when an order closes
- [x] Company email addresses (info@, press@, bookings@, business@, privacy@hyardrecords.com) as Google Groups, shown on the Contact page
- [x] The label account only uses the admin page: the dashboard sends it there and the menu shows Admin
- [x] Stripe live: activated, live webhook, live restricted key on the server, functions redeployed; hyardrecords.com is an authorized domain in Firebase
- [x] MailerLite sends from newsletter@hyardrecords.com (domain verified: DKIM and SPF)
- [x] Receipt email after each paid order from payments@ to the customer (English or Croatian), plus a "You received an order" email to you
- [x] Demo emails from product@: "ready for review" to you with all the details, "we've got your demo" to the artist, and an update to the artist whenever you change the status
- [x] DMARC record added for hyardrecords.com
