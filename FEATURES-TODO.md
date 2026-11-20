# Hyard Records website — features to do

Last updated: 20 November 2026

Legend: **(you)** needs something only you can provide or set up · **(me)** I can build it once you say go

---

## 1. Before launch

- [ ] **Fill in the legal notice** (8 blanks: name, address, legal entity, OIB, label email…) **(you)**
- [ ] **Fill in the privacy policy** blanks (address, label email, hosting provider, how long you keep logs and demos) **(you)**
- [ ] **Create the company email addresses** on hyardrecords.com (e.g. info@, press@, bookings@, business@, privacy@) **(you)**
  - Then add them to `data/contacts.json` (or send them to me) and they appear on the Contact page as mail buttons; also fill them into the legal notice and privacy policy **(me)**
- [ ] **Send the remaining socials**: TikTok, YouTube **(you)**

## 2. Catalog and releases

Nothing open. Release pages, the catalog-fed home page, search filters and the latest release banner are done.

## 3. Artists

Nothing open. Socials, bios, top tracks and collaborators are done.

## 4. Fans and community

- [ ] **Point MailerLite's "thank you page" to the site** for both forms (free plan) **(you)**
  - Newsletter: `https://hyardrecords.com/confirmed`
  - Pre-save: `https://hyardrecords.com/confirmed?list=presave`
  - Steps in `brand/email/README.md`
- [ ] **Rebuild the new confirmation emails in MailerLite** from the design in `brand/email/` (needs a paid plan or the 14-day trial) **(you)**
- [ ] **Connect a Hyard email address to MailerLite** so confirmations and newsletters come from e.g. newsletter@hyardrecords.com **(you + me)**
  - Needs the domain plus a mailbox on it (e.g. Zoho Mail free or Google Workspace)
  - Then verify hyardrecords.com in MailerLite (Account settings → Domains, SPF/DKIM DNS records) and set it as the From address on both forms
- [ ] **Add your first events** to `data/events.json` (or send me the details) **(you)**

## 5. Accounts and services (paid)

Built: log in / sign up (email or Google), artist dashboard (demos with status, profile, security), services with
per-track prices and EP/album packages, cart, Stripe Checkout, order confirmed and payment failed pages, orders in the
dashboard, label-only admin page, terms of service, privacy and legal updates. Setup steps: `SETUP-ACCOUNTS.md`.

- [ ] **Create the Firebase project** and send me the web config **(you)**
- [ ] **Install the Firebase CLI and log in** so I can deploy the rules and server functions **(you)**
- [ ] **Create the Stripe account** (test mode first) and add the keys as Firebase secrets **(you + me)**
- [ ] **Deploy** database rules, storage rules and functions, then switch on accounts on the site **(me)**
- [ ] **Decide prices and packages** and enter them on the admin page (Services and prices) **(you)**
- [ ] **Fill the blanks in the terms of service** (VAT, track length, file storage time, production credits) **(you)**
- [ ] **Test purchase** in Stripe test mode, then one real low-value purchase and refund before going live **(you + me)**
- [ ] **Before/after audio examples** on each service **(you + me)**
- [ ] **Testimonials and credits list** from artists you've worked with **(you + me)**
- [ ] Suggestions, not built yet:
  - Email notifications when a demo status changes or an order is paid or delivered **(me)**
  - Discount codes (Stripe promotion codes) **(me)**
  - Automatic VAT with Stripe Tax, once you know if you charge VAT **(you + me)**
  - Messages between artist and label on each order **(me)**
  - Spam protection on sign-up and uploads (Firebase App Check) **(me)**
  - Newsletter tick box on sign-up **(me)**

## 6. Press and business

- [ ] **Open the merch store** when products are ready; the menu already shows "Merch · Coming soon" **(you + me)**
- [ ] **Full-quality WAV uploads** (optional): today big files are shrunk to an MP3 before sending; true WAV delivery needs file storage once the site is hosted **(you + me)**

## 7. Polish and growth

- [ ] **Check visitor stats once the site is live** (Cloudflare Web Analytics is switched on; it only runs on hyardrecords.com) **(you)**
- [ ] **Have a native speaker read the Croatian version**, especially the privacy policy and legal notice **(you)**
- [ ] **Croatian artist bios** (optional): bios stay in English for now **(you + me)**

---

## Done

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
- [x] Contact page: demo form with file upload, message box and demo guidelines
- [x] Big demo uploads: files over 10 MB are shrunk to an MP3 (up to 320 kbps) in the browser before sending
- [x] Press kit page (footer only): logos, artist photos, bios with copy buttons, fact sheet, one-click zip
- [x] Merch in the menu with "Coming soon"
- [x] Search bar next to the menu button with live suggestions (search icon on phones); Search releases removed from the menu
- [x] Contact page for press, bookings, business and privacy (email slots ready), separate from Send your demo
- [x] Hamburger menu and full footer with all pages, Instagram, SoundCloud, Spotify
- [x] Newsletter and album pre-save connected to MailerLite (double opt-in, separate groups)
- [x] Thank-you page after confirming (`/confirmed`, pre-save version `/confirmed?list=presave`) linking back to the site
- [x] Confirmation email designs for newsletter and pre-save (`brand/email/`)
- [x] Privacy policy and legal notice (drafts with blanks)
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
