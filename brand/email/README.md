# Hyard Records — confirmation emails and thank-you page

Preview: open `confirmation-email-preview.html` in a browser.

MailerLite only lets you edit the double opt-in email on a **paid plan** (or during the 14-day trial).
The thank-you page redirect is a separate setting.

---

## 1. Thank-you page (do this for both forms)

The site has its own page for after people click **Confirm**:

| Form | "Use your own landing page" URL |
|---|---|
| Website newsletter | `https://hyardrecords.com/confirmed` |
| Beginning and The End pre-save | `https://hyardrecords.com/confirmed?list=presave` |


In MailerLite: **Forms → Embedded forms → (form) → Double opt-in** (may be under **Settings**) →
**Confirmation thank you page** → choose **Or use your own landing page** → paste the URL → **Save**.

---

## 2. Confirmation email — build it in MailerLite's editor

Keep MailerLite's own **Confirm** button (it carries the confirmation link). Style it as below.

**Global settings**
- Email background: `#1A1A1A`
- Content background: `#000000`, width 560 px, 1 px border `#2A2A2A`
- Headings font: Arial Black (or Helvetica bold), uppercase
- Body font: Helvetica / Arial, 15 px, colour `#D6D6D6`, line height 1.7

### Newsletter email

- **Subject:** Confirm your Hyard Records subscription
- **Preheader:** One click and you're on the list.
- **From name:** Hyard Records

Blocks, top to bottom:

1. **Image:** `https://hyardrecords.com/assets/email/hyard-logo-600.jpg`. Width 220 px, centred, link to the website.
2. **Text:** `ONE CLICK LEFT`. Monospace font, 12 px, colour `#8A8A8A`, letter spacing wide, centred.
3. **Heading:** `CONFIRM YOUR SUBSCRIPTION`. 30 px, white, uppercase, centred.
4. **Text:** "Thanks for signing up to the Hyard Records newsletter. Confirm your email and you'll get new releases and label news straight to your inbox." Centred.
5. **Button (MailerLite's Confirm button):** text `CONFIRM MY EMAIL`. Background `#FFFFFF`, text `#000000`, bold, uppercase, no rounded corners (radius 0), padding 18 × 34 px.
6. **Text:** "Didn't sign up? Just ignore this email and you won't hear from us." 13 px, `#8A8A8A`.
7. **Divider:** 1 px, `#2A2A2A`.
8. **Footer links (text):** WEBSITE · INSTAGRAM · SOUNDCLOUD · SPOTIFY, white, 12 px, uppercase:
   - Website: `https://hyardrecords.com/`
   - Instagram: `https://www.instagram.com/hyardrecords/`
   - SoundCloud: `https://soundcloud.com/hyardrecords`
   - Spotify: `https://open.spotify.com/playlist/0gdYCFCfcTTYMiKOccVvGl`
9. **Footer text:** "Hyard Records · Independent dark electronic label · Est 2024" plus your postal address (MailerLite adds it automatically from your account details). 11 px, `#5F5F5F`.

### Pre-save email (Beginning and The End)

Same as the newsletter email, with these changes:

- **Subject:** Confirm your pre-save: Beginning and The End
- **Preheader:** Be the first to hear it.
- Block 1 image: `https://hyardrecords.com/assets/covers/beginning-and-the-end.jpg`, width 300 px
- Block 2 text: `BLURFNES · ALBUM · COMING SOON`
- Block 3 heading: `CONFIRM YOUR PRE-SAVE`
- Block 4 text: "You're one click away from hearing about **Beginning and The End** first. Confirm your email and we'll let you know the moment it's out."
- Block 5 button text: `CONFIRM MY PRE-SAVE`
- Block 8 links: WEBSITE · INSTAGRAM · BLURFNES ON SPOTIFY (`https://open.spotify.com/artist/4wik1BSfL1Vh3rOHdGxsCt`)


---

## 3. Sending from a Hyard address

Confirmation emails and newsletters should come from a `@hyardrecords.com` address, for example `newsletter@hyardrecords.com`. MailerLite won't send from a Gmail address because Gmail blocks it.

1. Buy hyardrecords.com and set up email on it (for example Zoho Mail free, Google Workspace, or the registrar's mailbox).
2. In MailerLite: **Account settings → Domains → Add domain** → hyardrecords.com → add the DNS records it shows (SPF/DKIM) at your registrar → **Verify**.
3. In each form's double opt-in email, set **From email** to the new address and **From name** to Hyard Records.
