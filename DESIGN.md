# Tanaw Earth design system

The rules for how Tanaw Earth looks and sounds. Read this before you change the stylesheet, the picture overlays or the saved-picture code, and update it when a rule changes.

The values below come from `site/style.css` as of 2026-11-21.

**Contrast rule:** text needs at least **4.5:1** against its background (3:1 for text 24 px and up, or 19 px bold and up). Icons need **3:1**. Check both themes.

## 1. The idea

**Cabin lights off at the cupola window (chosen 2026-11-21).** You float at the space station's window with the lights out, face to the glass, and the real Earth fills the view. The satellite picture fills the screen edge to edge, and the few words and controls float on it. It should feel quiet and close, like looking, not like operating something. It should not feel like a control room, a sci-fi HUD or a dashboard: no glowing edges, no grid lines, no panels around the picture.

- **Two tones (chosen 2026-11-21).** The interface is black and white only. The satellite picture is the only colour on screen: Earth is the colourful thing, so the interface never competes with it. There is no accent colour for now; the selected state is a white fill with black text.
- **The age of the picture is the big number.** The first thing you read is how old the view is ("45 min ago"), because a live picture is only worth looking at if you know it's fresh.
- **Space stays black in both themes.** The picture and its overlays look the same in light and dark. The light theme only changes what sits away from the picture: the About page, dialogs and sheets.
- **Brand mark (chosen 2026-11-21):** the Tanaw series wordmark, shared with the other Tanaw apps: TANAW in Michroma with open chevron A's, the series arc over the middle, the Sun in the right A, and EARTH set under it (beside it in the app bar). Earth's own parts: the arc is airglow green, the green line astronauts see along Earth's edge at night, and the left A holds a small cupola drawn as window cutouts, lower windows solid (Earth), upper ones faint (space), its round centre window in airglow green.
- **App icon (chosen 2026-11-21):** the space station's cupola seen from inside with the lights off, turned 30° so a corner points up. Only the windows are drawn; the frame is the tile. Through them runs the series arc, the same shape, fade and height as on Tanaw Weather and Tanaw Moon (peak at 44.7 of 100, a little above centre), in airglow green.
- **Deliberate exceptions:** the airglow green in the mark (the arc and the cupola's centre window) and in the icon's arc is the only colour outside the pictures.

**What stays fixed whatever the look:** nothing covers the middle of the picture. Words sit at the top, controls at the bottom.

## 2. Colour

Design tokens are the CSS variables in `:root`. Always use a token, never a raw hex, so both themes keep working.

### Base (away from the picture: About, dialogs, sheets)

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--bg` | `#ffffff` | `#080808` | Page background |
| `--surface` | `#f0f0f0` | `#131313` | Dialogs, sheets, inputs |
| `--ink` | `#111111` | `#eeeeee` | Main text |
| `--muted` | `#555555` | `#a0a0a0` | Secondary text (passes 4.5:1 on `--bg` and `--surface`) |
| `--line` | `#dadada` | `#222222` | Borders and dividers |

### On the picture (same in both themes)

| Token | Value | Use for |
|---|---|---|
| `--space` | `#000000` | Behind the picture, and the dark halo under text |
| `--scrim` | `rgba(10, 10, 10, .72)` | The fades at the top (30% of the screen) and bottom (32%), and the backing of every control |
| `--pic-ink` | `#f2f2f2` | Place, age, buttons; the selected button's fill |
| `--pic-muted` | `#c4c4c4` | The source line ("Himawari-9 · visible · 2:50 PM") |
| `--brand-arc-on-space` | `#6fe08a` | The arc and the cupola's centre window in the wordmark on the picture and in the saved picture |
| `--halo` | `0 1px 3px` and `0 0 1px` in `--space` | The dark halo (a soft shadow around the letters) under every word on the picture, and under the slider thumb |
| `--pic-line` | `rgba(242, 242, 242, .28)` | The time bar's track |

### Accent

None for now. `--accent`, `--accent-ink` and `--on-accent` point at `--ink` / `--bg`, so adding an accent later is a one-line change.

### Brand

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--brand-arc` | `#1d7a44` | `#6fe08a` | The arc and the cupola's centre window in the mark, and the arc in the app icon. On space it is always the dark value, through `--brand-arc-on-space` |

### Picture colours

The pictures keep their source's colours: visible is grey, infrared uses the source's colour enhancement for cold cloud tops, city lights are gold on black. The interface never adds colour on top of them.

## 3. Type

**Fonts (chosen 2026-11-21):** **Michroma** for the wordmark only, **Onest** for words and **Spline Sans Mono** for numbers. Onest is round and calm, which suits looking out of a window; the mono keeps the ticking age steady. Licence: OFL (Google Fonts). Self-hosted in `site/fonts/` as WOFF2 files, split into Latin and Latin Extended subsets (Michroma holds only the letters of TANAW EARTH).

**Change these together** when a font changes: the `@font-face` rules and the `--sans`, `--mono`, `--logo` tokens in `site/style.css`; the two `preload` links in `site/index.html` (Michroma and Onest Latin); and `site/save.js`, which draws with Onest, Spline Sans Mono and Michroma on a canvas, loads each of them first, and embeds Michroma in the wordmark image it draws.

| Token | Use for |
|---|---|
| `--sans` | Everything by default |
| `--mono` | The numbers in the picture's age, clock times, coordinates |
| `--logo` | Michroma, for EARTH beside the wordmark |

Labels stay in the sans; only numbers are mono. The age ticks, so it uses `font-variant-numeric: tabular-nums` and the digits don't jump.

### Sizes

| Role | Size | Weight |
|---|---|---|
| Picture age | 30 / line 1.1 | 600; the digits mono, "min ago" sans |
| Place name | 20 | 700 |
| Body | 15 | 400 |
| Wordmark | 13, `letter-spacing: .32em` | Michroma 400 |
| Source line, button labels | 12 | 400 / 600 |

**Weights:** Onest 400, 600, 700; Spline Sans Mono 500, 600.

## 4. Shape and space

| | Value |
|---|---|
| Corner radius | `--radius-control` 10 px for buttons, inputs and the toast · `--radius-card` 6 px for sheets (top corners only on phones) |
| Spacing | Steps of 4: 4, 8, 12, 16 |
| Layout | Full screen on phones; the picture always fills the viewport |
| Shadow | None. Depth comes from the scrims and the text halo |

## 5. Components

- **Top:** wordmark on the left; search and About on the right, two 44 px icon buttons on `--scrim`.
- **Picture stamp:** place name, then the age, then the source line. Sits under the top bar, over the top scrim.
- **Picture switch:** four equal buttons, Clouds · Infrared · Colour · Lights. Unselected: `--scrim` backing with `--pic-ink` text. Selected: `--pic-ink` fill with `--space` text.
- **Time bar:** play, the track (a slider) with a round thumb, go to my location, save picture. Clouds and Infrared play the last 3 hours, 10 minutes a step, with a pause on the newest picture before the loop repeats. Colour steps over the last 7 days, one picture a day. Lights is one picture, so play and the track are hidden and only My location and Save picture stay.
- **Sheets:** a sheet is a panel that slides up from the bottom on phones and sits centred as a dialog from 600 px wide. Sheets are away from the picture, so they follow the theme: `--surface` background, `--ink` text, a `--line` divider under the sticky head, a 44 px close button.
- **Search sheet:** the head is the search field ("Search a city"); results are a list of 48 px rows split by `--line`. It keeps a fixed height so the field stays above a phone's keyboard while results change.
- **About sheet:** what each picture type is, the credits, a link to Tanaw Weather, and the **Theme** setting: three equal buttons, Device · Light · Dark. The selected one is filled with `--accent` and `--on-accent` text. The choice is kept in the browser.
- **Toast:** a short message centred above the controls on `--scrim`, 15 px 600, gone after 3 seconds.
- **Icons:** Tabler outline icons, stroke 2, 22 px, inline SVG with `currentColor`. New icons come from the same pack; never hand-drawn.

## 6. Share cards and link previews

- **Saved picture.** "Save picture" draws the current view as a 1080 × 1920 PNG, the size of a Story, and shares it or downloads it. The globe fills the picture with the same top and bottom scrims as the page. The wordmark sits near the top, centred at 300 px, just below the 14% line (269 px). Centred lines, read upwards from 1520 px (the 20% line): the source line in `--pic-muted`, then the date and time, then the place, all with the halo. The source line drops its clock, because the time line above already says it. Nothing goes in the top 14% or bottom 20%, where Stories put their buttons.
- **Link preview.** `og.png`, 1200 × 630, is the picture shown when the link is shared in a chat app.
- **Icons.** `favicon.svg` plus 16 and 32 px PNGs, `apple-touch-icon.png`, and `icon-192.png` and `icon-512.png` for `site.webmanifest`, all from the cupola app icon.

## 7. Voice

- **Plain and specific.** "45 min ago", "1 h 10 min ago", "Himawari-9 · visible · 2:50 PM", "NOAA-21 · one pass a day · 20 Nov".
- **Short states.** "Loading pictures", "Search a city", "No city by that name", "Location is off", "Picture saved".
- **Plain names for picture types.** Clouds, Infrared, Colour, Lights; the satellite and band go in the source line.
- **Short buttons that say what happens.** "Save picture", "Play the last 3 hours", "Play the last 7 days", "Go to my location".
- **Avoid:** "seamless", "unlock", "journey", "elevate", "game-changer", "Get started", exclamation marks, and emoji in the interface.

## 8. Accessibility

Most visitors are on phones, often outdoors.

### Tap targets

- Every control has a hit area of at least **44 × 44 px**, and neighbouring areas don't overlap.

### Text on the picture

Satellite pictures have bright white clouds anywhere, so text never sits on the bare picture. Every word on the picture has both a scrim behind it and a dark halo (`text-shadow` in `--space`). The automatic contrast check measures against `--space` and can't see the picture, so check this by eye over the brightest cloud frame.

### How to check

2026-11-21, on the built site: both themes, 375 px and 1100 px wide, with the page, the search sheet (with results) and the About sheet open. Design lint: 0 errors, 0 warnings. 12 text elements and icons on the page, 22 with search open, 33 with About open: 0 contrast failures. 11 controls on the page, 10 in search, 5 in About: 0 under 44 px, 0 overlaps. Text over bright cloud checked by eye. Re-run after adding a colour, component or dialog; the snippets are in the `design-brief` skill's `references/` folder.
