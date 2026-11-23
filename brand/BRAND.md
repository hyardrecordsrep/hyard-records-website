# Hyard Records — brand guide

Visual reference: [brand-board.svg](brand-board.svg)

## Identity

- **Name:** HYARD RECORDS — always set in caps in the display face.
- **Established:** 2024 (shown as `EST 2024`).
- **Mark:** wireframe globe. Source files live in `../../Branding/`:
  - `Logo/HyardLogo1.jpg` — primary lockup (globe, arched wordmark, EST 2024)
  - `Logo/HyardLogo2.jpg` — globe only (icon, avatars, favicons)
  - `Banner/HyardBanner1.jpg` / `HyardBanner2.jpg` — 16:9 versions of the above
- **Horizontal lockup:** small globe left, `HYARD` over a letter-spaced `RECORDS`. Use for headers and anywhere the round lockup doesn't fit.

## Color

Strictly monochrome. No accent colors.

| Token    | Hex       | Use                                  |
| -------- | --------- | ------------------------------------ |
| black    | `#000000` | Primary background                   |
| white    | `#FFFFFF` | Logo, headlines, inverted tiles      |
| graphite | `#1A1A1A` | Cards, raised surfaces, dividers     |
| ash      | `#8A8A8A` | Secondary text, labels, metadata     |

```css
:root {
  --hyard-black: #000000;
  --hyard-white: #ffffff;
  --hyard-graphite: #1a1a1a;
  --hyard-ash: #8a8a8a;
}
```

## Type

- **Display:** wide, black-weight grotesk, all caps: Archivo, width 125, weight 800–900 (Google Fonts). Confirmed by the label.
- **Detail:** monospace, small, for catalog numbers, BPM, key, dates. Web: JetBrains Mono 400.

## Roster

- Rave Saint
- Nick.

Sound: dark electronic.

## Release tiles

- White tile, black cropped globe in the lower right.
- Catalog number top left in mono: `HYD-001`, `HYD-002`, …
- Title in display caps, artist in mono below.
- Example: `HYD-001` — MASS HYPNOSIS — Rave Saint.
