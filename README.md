# Tanaw Earth

Live satellite pictures of Earth on a 3D globe in the browser. Clouds and Infrared
play the last 3 hours from Himawari-9, GOES-East and GOES-West; Colour shows the daily
picture from NOAA-21; Lights shows city lights at night. Europe, Africa and the Indian
Ocean, which no live satellite here covers, show the daily colour picture under the
live loops. Part of the Tanaw series, next to
[Tanaw Weather](https://tanaw-weather.ruzcko.dev).

Plain HTML, CSS and JavaScript: no build step.

## Run locally

```sh
python3 -m http.server 8000 -d site
```

Open http://localhost:8000/.

## Tests

Node 22 or later:

```sh
npm test
```

(or `node --test`).

## Deploy

`site/` is a static site; serve it with any static host. For Cloudflare Pages:

```sh
npx wrangler pages deploy site --project-name tanaw-earth
```

`site/_headers` sets caching.

## Files

- `site/index.html`: the page, the About and search sheets, and the wordmark.
- `site/style.css`: fonts, colour tokens and layout.
- `site/app.js`: the globe, the four picture modes, the time bar, the stamp and the URL hash.
- `site/gibs.js`: NASA GIBS layers, tile and time-list URLs, the shared timeline and the stamp's text.
- `site/geo.js`: places, coordinates, time-zone longitude, sun elevation and the URL hash format.
- `site/sheets.js`: search, the About sheet, the theme setting, the toast and My location.
- `site/save.js`: Save picture, which draws the current view as a 1080 × 1920 Story picture.
- `site/data/`: coastlines and cities.
- `site/fonts/`: self-hosted fonts.
- `site/vendor/`: MapLibre GL JS.

## Data sources and licences

- **NASA GIBS.** We acknowledge the use of imagery provided by services from NASA's
  Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and
  Information System (ESDIS).
- **Himawari-9** (JMA), **GOES-East** and **GOES-West** (NOAA), **NOAA-21 VIIRS** and
  **Black Marble** (NASA, NOAA), served through GIBS.
- **Natural Earth** coastlines and cities, public domain.
- **MapLibre GL JS** 6.16.0 in `site/vendor/maplibre-gl/6.16.0/`, BSD-3-Clause
  (`LICENSE.txt` there).
- **Tabler Icons**, [MIT](https://github.com/tabler/tabler-icons/blob/main/LICENSE).
- Fonts Onest, Spline Sans Mono and Michroma in `site/fonts/`: SIL Open Font License
  (`OFL.txt`).

## Licence

The code is released under the MIT licence; see [LICENSE](LICENSE). Data, fonts and
libraries keep their own licences, listed above.
