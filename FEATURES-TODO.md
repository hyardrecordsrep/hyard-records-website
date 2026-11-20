# Hyard Records website — features to do

Last updated: 20 November 2026

Legend: **(you)** needs something only you can provide or set up · **(me)** I can build it once you say go

---

## 1. Before launch

- [ ] **Buy and connect the domain** hyardrecords.com **(you)**
- [ ] **Connect hyardrecords.com to GitHub Pages** once the domain is bought **(you + me)**
  - Add the DNS records at your registrar, then I add the domain in the repo's Pages settings
  - The site is live meanwhile at https://hyardrecordsrep.github.io/hyard-records-website/
- [ ] **Activate the contact form** **(you)**
  - Send one real test demo → click the FormSubmit confirmation email in blurfnes@gmail.com
  - Then I swap the visible email in the page code for FormSubmit's hidden code **(me)**
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

- [ ] **Send newsletters from your own domain**: sign-ups already go to MailerLite; to email the list, add a hyardrecords.com sender address in MailerLite once the domain is bought **(you)**
- [ ] **Add your first events** to `data/events.json` (or send me the details) **(you)**

## 5. Services (paid)

- [ ] **Services page in the menu**: mixing, mastering and production by the label **(me)**
  - One section per service: what's included, turnaround time, number of revisions, before/after audio examples
- [ ] **Decide prices and packages** (e.g. per track / per EP, stem mixing vs. stereo mastering, rush fee) **(you)**
- [ ] **Enquiry and booking form**: service, number of tracks, deadline, reference tracks, file links **(me)**
- [ ] **Online payment**, e.g. Stripe or PayPal payment links per package, or a deposit to book **(you + me)**
  - Needs a business/payout account in your name **(you)**
- [ ] **Terms of service** for paid work: payment, deadlines, revisions, refunds, file delivery, credits and rights **(you + me)**
- [ ] **Update the legal notice and privacy policy** for selling services (VAT/OIB, payment provider) **(me)**
- [ ] **Testimonials and credits list** from artists you've worked with **(you + me)**

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
- [x] Privacy policy and legal notice (drafts with blanks)
- [x] 404 page, link previews, sitemap.xml, robots.txt
- [x] Daily Spotify sync running (04:17 UTC): 29 releases matched Spotify on the first run
- [x] Published on GitHub Pages from github.com/hyardrecordsrep/hyard-records-website; every push republishes
- [x] Clean addresses without .html (hyardrecords.com/about, /release-hyd-020…), home links go to the bare domain, old .html addresses redirect
- [x] Covers and artist photos stored on the site; the sync downloads new ones automatically
- [x] Own page per release (`release-hyd-020.html`) and per artist (`artist-blurfnes.html`) with their own cover in link previews; sitemap lists them all
- [x] Accessibility: skip link, page heading on home, readable placeholders, focus kept inside the open menu, named cover link
- [x] Visitor stats: Cloudflare Web Analytics, cookie-free
- [x] Croatian version with an EN/HR switch in the header (remembers the choice; Croatian browsers get it automatically)
