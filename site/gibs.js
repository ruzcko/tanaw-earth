// NASA GIBS (Global Imagery Browse Services): layer catalogue, tile and time
// list URLs, the shared timeline, disc coverage and the stamp's text.
// Pure functions plus one fetch helper; no DOM access.

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

// lon: sub-satellite longitude of a geostationary source.
// bounds: [west, south, east, north] used to limit tile requests; tiles stop
// at the antimeridian, so a source never draws on the far side of it.
export const SOURCES = {
  himawari: { key: "himawari", name: "Himawari-9", lon: 140.7, bounds: [60, -81, 180, 81] },
  goesWest: { key: "goesWest", name: "GOES-West", lon: -137.0, bounds: [-180, -81, -57, 81] },
  goesEast: { key: "goesEast", name: "GOES-East", lon: -75.2, bounds: [-155, -81, 5, 81] },
  viirs: { key: "viirs", name: "NOAA-21" },
  lights: { key: "lights", name: "Black Marble" },
};

const DAILY_WORDS = "one pass a day";
const LIGHTS_WORDS = "city lights";

const VIIRS = { source: "viirs", layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", level: 9, ext: "jpg" };
const geo = (source, layer, band, level) => ({ source, layer, band, level, ext: "png" });

// `live` is listed in draw order, bottom to top.
export const MODES = {
  clouds: {
    key: "clouds",
    label: "Clouds",
    live: [
      geo("goesEast", "GOES-East_ABI_GeoColor", "GeoColor", 7),
      geo("goesWest", "GOES-West_ABI_GeoColor", "GeoColor", 7),
      geo("himawari", "Himawari_AHI_Band3_Red_Visible_1km", "visible", 7),
    ],
    underlay: VIIRS,
    kind: "loop",
  },
  infrared: {
    key: "infrared",
    label: "Infrared",
    live: [
      geo("goesEast", "GOES-East_ABI_Band13_Clean_Infrared", "infrared", 6),
      geo("goesWest", "GOES-West_ABI_Band13_Clean_Infrared", "infrared", 6),
      geo("himawari", "Himawari_AHI_Band13_Clean_Infrared", "infrared", 6),
    ],
    underlay: VIIRS,
    kind: "loop",
  },
  colour: {
    key: "colour",
    label: "Colour",
    live: [{ ...VIIRS, band: DAILY_WORDS }],
    underlay: null,
    kind: "daily",
  },
  lights: {
    key: "lights",
    label: "Lights",
    live: [{ source: "lights", layer: "VIIRS_Black_Marble", band: LIGHTS_WORDS, level: 8, ext: "png" }],
    underlay: null,
    kind: "single",
  },
};

// The one time of the Black Marble picture.
export const LIGHTS_TIME = "2016-01-01";

// Geostationary pictures are usable up to this great-circle distance (degrees)
// from the sub-satellite point. Measured on GIBS tiles: GeoColor turns
// transparent from about 76.5 degrees, the other layers from about 78.5, and
// pixels are visibly stretched beyond about 75.
const DISC_LIMIT = 75;

// Top of the drawing first.
const TOP_FIRST = ["himawari", "goesWest", "goesEast"];

// GIBS times have no milliseconds: 2026-11-21T04:00:00Z.
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// time: epoch ms for live layers, or a "YYYY-MM-DD" string for daily layers.
export function tileUrl(layer, time, level, ext) {
  const t = typeof time === "number" ? iso(time) : time;
  return `${GIBS}/${layer}/default/${t}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;
}

export function domainUrl(layer, level, startMs, endMs) {
  return `${GIBS}/1.0.0/${layer}/default/GoogleMapsCompatible_Level${level}/all/${iso(startMs)}--${iso(endMs)}.xml`;
}

// "PT10M" -> ms. Only the hour, minute and second parts GIBS uses.
function periodMs(text) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text);
  const ms = m ? ((+m[1] || 0) * 60 + (+m[2] || 0)) * MIN + (+m[3] || 0) * 1000 : 0;
  if (!ms) throw new Error(`Bad period: ${text}`);
  return ms;
}

// A bare date means midnight UTC.
function timeMs(text) {
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(ms)) throw new Error(`Bad time: ${text}`);
  return ms;
}

// DescribeDomains XML -> ascending epoch ms. The <Domain> holds comma-separated
// "start/end/period" ranges, with gaps between ranges for missing frames.
export function parseDomain(xmlText) {
  const m = /<Domain>([^<]*)<\/Domain>/.exec(xmlText);
  if (!m) throw new Error("No <Domain> in the time list");
  const times = new Set();
  for (const range of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
    const parts = range.split("/");
    if (parts.length === 1) {
      times.add(timeMs(parts[0]));
      continue;
    }
    if (parts.length !== 3) throw new Error(`Bad range: ${range}`);
    const start = timeMs(parts[0]);
    const end = timeMs(parts[1]);
    const step = periodMs(parts[2]);
    for (let t = start; t <= end; t += step) times.add(t);
  }
  return [...times].sort((a, b) => a - b);
}

export async function fetchTimes(layer, level, nowMs, hours = 3.5, fetcher = fetch) {
  const res = await fetcher(domainUrl(layer, level, nowMs - hours * 60 * MIN, nowMs));
  if (!res.ok) throw new Error(`Time list failed: HTTP ${res.status}`);
  return parseDomain(await res.text());
}

// timesBySource: { sourceKey: [ms, ...] }, only for sources whose list loaded.
// Slots run every stepMin minutes back from the newest time of any source.
// Each source gets its newest time at or before the slot and at most
// maxGapMin older, else null. Slots where no source has a frame are dropped.
export function buildTimeline(timesBySource, { stepMin = 10, hours = 3, maxGapMin = 20 } = {}) {
  const keys = Object.keys(timesBySource);
  const newest = Math.max(...keys.flatMap((k) => timesBySource[k]));
  const frames = Object.fromEntries(keys.map((k) => [k, []]));
  const slots = [];
  if (!Number.isFinite(newest)) return { slots, frames };

  for (let i = Math.floor((hours * 60) / stepMin); i >= 0; i--) {
    const slot = newest - i * stepMin * MIN;
    const row = keys.map((k) => {
      let best = null;
      for (const t of timesBySource[k]) {
        if (t <= slot && slot - t <= maxGapMin * MIN && (best === null || t > best)) best = t;
      }
      return best;
    });
    if (row.every((t) => t === null)) continue;
    slots.push(slot);
    keys.forEach((k, j) => frames[k].push(row[j]));
  }
  return { slots, frames };
}

// The last `days` full UTC days, oldest to newest, ending yesterday.
export function dailyDates(nowMs, days = 7) {
  const today = Math.floor(nowMs / DAY);
  return Array.from({ length: days }, (_, i) => iso((today - days + i) * DAY).slice(0, 10));
}

const rad = (deg) => (deg * Math.PI) / 180;

// Whether a geostationary source draws a usable picture at the point:
// inside its disc limit and on its side of the antimeridian (see bounds).
// lon is in -180..180. Global sources cover everywhere.
export function covers(sourceKey, lon, lat) {
  const s = SOURCES[sourceKey];
  if (s.lon === undefined) return true;
  if (lon < s.bounds[0] || lon > s.bounds[2]) return false;
  const cos = Math.cos(rad(lat)) * Math.cos(rad(lon - s.lon));
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI <= DISC_LIMIT;
}

export function topSourceAt(liveSourceKeys, lon, lat) {
  return TOP_FIRST.find((k) => liveSourceKeys.includes(k) && covers(k, lon, lat)) ?? null;
}

// Stamp age. parts split numbers (mono) from words (sans).
export function ageText(frameMs, nowMs, kind) {
  if (kind === "single") {
    const year = String(new Date(frameMs).getUTCFullYear());
    return { text: year, parts: [{ num: year, unit: "" }] };
  }
  if (kind === "daily") {
    const days = Math.floor(nowMs / DAY) - Math.floor(frameMs / DAY);
    const unit = days === 1 ? "day ago" : "days ago";
    return { text: `${days} ${unit}`, parts: [{ num: String(days), unit }] };
  }
  const mins = Math.floor((nowMs - frameMs) / MIN);
  if (mins < 1) return { text: "Just now", parts: [{ num: "", unit: "Just now" }] };
  if (mins < 60) return { text: `${mins} min ago`, parts: [{ num: String(mins), unit: "min ago" }] };
  const h = String(Math.floor(mins / 60));
  const m = String(mins % 60);
  if (m === "0") return { text: `${h} h ago`, parts: [{ num: h, unit: "h ago" }] };
  return {
    text: `${h} h ${m} min ago`,
    parts: [
      { num: h, unit: "h" },
      { num: m, unit: "min ago" },
    ],
  };
}

// "Himawari-9 · visible · 11:50 AM", "NOAA-21 · one pass a day · 20 Nov",
// "Black Marble · city lights". The clock is in the visitor's time zone
// unless one is given; the daily date is the UTC day of the picture.
export function sourceLine(sourceKey, band, frameMs, kind, locale, timeZone) {
  const name = SOURCES[sourceKey].name;
  if (kind === "single") return `${name} · ${LIGHTS_WORDS}`;
  if (kind === "daily") {
    const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(frameMs);
    const part = (type) => parts.find((p) => p.type === type).value;
    return `${name} · ${DAILY_WORDS} · ${part("day")} ${part("month")}`;
  }
  const clock = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone })
    .format(frameMs)
    .replace(/[  ]/g, " ");
  return `${name} · ${band} · ${clock}`;
}
