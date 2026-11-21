// Places, coordinate text, time-zone longitude, sun elevation and the URL hash.
// Pure functions; no DOM access.

import { MODES } from "./gibs.js";

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// cities.json: { scale, countries, cities: [[name, countryIndex, admin1Index, lon * scale, lat * scale, rank]] }.
// A higher rank is a bigger city (Natural Earth population rank, 0 to 14).
export function loadCities(json) {
  if (!json || !Array.isArray(json.countries) || !Array.isArray(json.cities)) {
    throw new Error("cities.json: expected countries and cities arrays");
  }
  const scale = json.scale ?? 100;
  return json.cities
    .filter((c) => Array.isArray(c) && typeof c[0] === "string" && [c[3], c[4], c[5]].every(Number.isFinite))
    .map(([name, ci, , lon, lat, rank]) => ({
      name,
      country: json.countries[ci] ?? "",
      lon: lon / scale,
      lat: lat / scale,
      rank,
    }));
}

function km(lon1, lat1, lon2, lat2) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function nearestPlace(cities, lon, lat, maxKm = 250) {
  let best = null;
  let bestKm = maxKm;
  for (const c of cities) {
    const d = km(lon, lat, c.lon, c.lat);
    if (d <= bestKm) {
      best = c;
      bestKm = d;
    }
  }
  return best && { name: best.name, country: best.country };
}

// "Ōsaka" -> "osaka"
const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Names that start with the query first, then names that contain it;
// bigger cities first within each group, then by name.
export function searchPlaces(cities, query, limit = 8) {
  const q = fold(query.trim());
  if (!q) return [];
  const hits = [];
  for (const c of cities) {
    const n = fold(c.name);
    if (n.startsWith(q)) hits.push([0, c]);
    else if (n.includes(q)) hits.push([1, c]);
  }
  hits.sort(([ta, a], [tb, b]) => ta - tb || b.rank - a.rank || a.name.localeCompare(b.name));
  return hits.slice(0, limit).map(([, c]) => c);
}

// { text: "14.6° N, 121.0° E" }
export function formatCoords(lon, lat) {
  const ns = `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? "S" : "N"}`;
  const ew = `${Math.abs(lon).toFixed(1)}° ${lon < 0 ? "W" : "E"}`;
  return { text: `${ns}, ${ew}` };
}

// Date#getTimezoneOffset minutes (-480 for UTC+8) -> a longitude near the
// visitor (120).
export function lonFromTimezone(offsetMinutes) {
  return Math.max(-180, Math.min(180, -offsetMinutes / 4)) + 0;
}

// Sun elevation above the horizon in degrees, from the low-precision solar
// position formulas of the Astronomical Almanac (good to about 0.1 degree).
export function sunElevation(ms, lon, lat) {
  const n = (ms - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = rad(357.528 + 0.9856003 * n);
  const lambda = rad(280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = rad(23.439 - 0.0000004 * n);
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = rad((280.46061837 + 360.98564736629 * n) % 360);
  const hourAngle = gmst + rad(lon) - ra;
  const phi = rad(lat);
  return deg(Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle)));
}

const NUMBER = /^-?\d+(\.\d+)?$/;

// "#clouds/14.60/121.00/3.2" -> { mode, lat, lon, zoom }, or null if any part
// is unknown or out of range.
export function parseHash(hash) {
  const parts = String(hash).replace(/^#/, "").split("/");
  if (parts.length !== 4 || !Object.hasOwn(MODES, parts[0])) return null;
  if (!parts.slice(1).every((p) => NUMBER.test(p))) return null;
  const [lat, lon, zoom] = parts.slice(1).map(Number);
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180 || zoom < 1 || zoom > 8) return null;
  return { mode: parts[0], lat, lon, zoom };
}

export function formatHash({ mode, lat, lon, zoom }) {
  return `#${mode}/${lat.toFixed(2)}/${lon.toFixed(2)}/${zoom.toFixed(1)}`;
}
