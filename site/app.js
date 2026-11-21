// Tanaw Earth: the globe, the four picture modes, the time bar, the stamp and the URL hash.
// Pictures come from NASA GIBS (gibs.js); places and the sun from geo.js.

import * as maplibregl from "./vendor/maplibre-gl/6.16.0/maplibre-gl.mjs";
import { SOURCES, MODES, LIGHTS_TIME, tileUrl, fetchTimes, buildTimeline, dailyDates, topSourceAt, ageText, sourceLine } from "./gibs.js";
import { loadCities, nearestPlace, formatCoords, lonFromTimezone, sunElevation, parseHash, formatHash } from "./geo.js";

// Draw order, bottom to top. Each source has an empty anchor layer on top of its pictures,
// so pictures created later still land in the right place.
const ORDER = ["viirs", "lights", "goesEast", "goesWest", "himawari"];
const STEP_MS = 500; // time per picture while playing
const HOLD_MS = 1500; // pause on the newest picture before the loop repeats
const WAIT_MS = 100; // how often to check whether the next picture has loaded
const TICK_MS = 30000; // how often the age is rewritten
// GIBS lists a new time before all its tiles are served; frames younger than this often have holes.
const SETTLE_MS = 40 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const els = {
  place: $("stamp-place"),
  age: $("stamp-age"),
  source: $("stamp-source"),
  play: $("play-button"),
  playIcon: document.querySelector(".icon-play"),
  pauseIcon: document.querySelector(".icon-pause"),
  track: $("track"),
  modes: document.querySelectorAll(".switch button"),
};
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

let mode = null; // one of MODES
let status = "loading"; // "loading" | "ready" | "failed" (every live time list failed)
let timeline = { slots: [], frames: {} }; // loop: times in ms; daily and single: "YYYY-MM-DD"
let slot = 0;
let underlay = null; // the daily colour picture under the live pictures
let shown = []; // ids of the pictures visible in the current slot
const onMap = new Set(); // ids of every picture on the map (each is a source and a layer)
let loadId = 0;
let playing = false;
let playTimer = 0;
let cities = [];
let lastPlace = "";

// ---- Opening view ----

// Zoom at which the globe fills the screen, as if seen up close through a window.
function fitZoom(lat) {
  const size = Math.max(innerWidth, innerHeight);
  const zoom = Math.log2((size * Math.PI * Math.cos((lat * Math.PI) / 180)) / 512);
  return Math.min(8, Math.max(1, Math.round(zoom * 100) / 100));
}

function openingView() {
  const fromHash = parseHash(location.hash);
  if (fromHash) return fromHash;
  const lat = 12;
  const lon = lonFromTimezone(new Date().getTimezoneOffset());
  // At night (sun more than 6 degrees below the horizon) the visible picture is dark, so start on Infrared.
  const night = sunElevation(Date.now(), lon, lat) < -6;
  return { mode: night ? "infrared" : "clouds", lat, lon, zoom: fitZoom(lat) };
}

const view = openingView();

// ---- Map ----

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    projection: { type: "globe" },
    sources: {
      coast: { type: "geojson", data: new URL("data/coastline.json", location.href).href },
    },
    layers: [
      { id: "space", type: "background", paint: { "background-color": token("--space") } },
      ...ORDER.map((key) => ({ id: `top-${key}`, type: "background", layout: { visibility: "none" } })),
      {
        id: "coast",
        type: "line",
        source: "coast",
        paint: {
          "line-color": token("--pic-line"),
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 1.2],
        },
      },
    ],
  },
  center: [view.lon, view.lat],
  zoom: view.zoom,
  minZoom: 1,
  maxZoom: 8,
  maxPitch: 0,
  renderWorldCopies: false,
  attributionControl: false,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});
map.touchZoomRotate.disableRotation();
map.keyboard.disableRotation();
// A tile GIBS fails to serve only leaves a gap in that picture; report any other error.
map.on("error", (e) => {
  if (!e.sourceId) console.error(e.error);
});

// ---- Pictures ----

// A picture is one GIBS layer at one time (epoch ms, or "YYYY-MM-DD" for daily layers);
// its source and map layer share the id.
const picture = (entry, time) => ({ ...entry, id: `${entry.layer}@${time}`, time });

function slotPictures(i) {
  if (mode.kind !== "loop") return [picture(mode.live[0], timeline.slots[i])];
  return mode.live
    .filter((entry) => timeline.frames[entry.source]?.[i] != null)
    .map((entry) => picture(entry, timeline.frames[entry.source][i]));
}

function addPicture(p) {
  if (onMap.has(p.id)) return;
  map.addSource(p.id, {
    type: "raster",
    tiles: [tileUrl(p.layer, p.time, p.level, p.ext)],
    tileSize: 256,
    maxzoom: p.level,
    // Only ask for tiles where a satellite can see (checked per tile, so the edges are fine).
    ...(SOURCES[p.source].bounds && { bounds: SOURCES[p.source].bounds }),
  });
  map.addLayer(
    {
      id: p.id,
      type: "raster",
      source: p.id,
      paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 0, delay: 0 }, "raster-fade-duration": 0 },
    },
    `top-${p.source}`,
  );
  onMap.add(p.id);
}

function removePictures(keep) {
  for (const id of onMap) {
    if (id === keep) continue;
    map.removeLayer(id);
    map.removeSource(id);
    onMap.delete(id);
  }
  shown = [];
}

const setOpacity = (id, value) => map.setPaintProperty(id, "raster-opacity", value);

function showSlot(i) {
  slot = i;
  const ids = slotPictures(i).map((p) => (addPicture(p), p.id));
  for (const id of shown) if (!ids.includes(id)) setOpacity(id, 0);
  for (const id of ids) setOpacity(id, 1);
  shown = ids;
  els.track.value = String(i);
  els.track.setAttribute("aria-valuetext", slotText(i));
  renderPicture();
}

const slotLoaded = (i) => slotPictures(i).every((p) => map.getSource(p.id) && map.isSourceLoaded(p.id));

function slotText(i) {
  const t = timeline.slots[i];
  if (mode.kind === "loop") return clock.format(t);
  if (mode.kind === "daily") return dayMonth.format(Date.parse(t));
  return t.slice(0, 4);
}

// ---- Modes ----

async function setMode(key) {
  pause();
  mode = MODES[key];
  const id = ++loadId;
  const now = Date.now();
  underlay = mode.kind === "loop" && mode.underlay ? picture(mode.underlay, dailyDates(now).at(-1)) : null;
  removePictures(underlay?.id);
  if (underlay) {
    addPicture(underlay);
    setOpacity(underlay.id, 1);
  }
  status = "loading";
  timeline = { slots: [], frames: {} };
  slot = 0;
  els.modes.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === key)));
  writeHash();
  updateTimebar();
  renderPicture();

  if (mode.kind === "loop") {
    const lists = await Promise.allSettled(
      mode.live.map((entry) => fetchTimes(entry.layer, entry.level, now).then((times) => times.filter((t) => t <= now - SETTLE_MS))),
    );
    if (id !== loadId) return; // the mode changed while the time lists loaded
    const times = {};
    lists.forEach((r, i) => {
      if (r.status === "fulfilled") times[mode.live[i].source] = r.value;
    });
    timeline = buildTimeline(times);
  } else {
    timeline = { slots: mode.kind === "daily" ? dailyDates(now) : [LIGHTS_TIME], frames: {} };
  }
  status = timeline.slots.length ? "ready" : "failed";
  updateTimebar();
  if (status === "ready") showSlot(timeline.slots.length - 1);
  else renderPicture();
}

// ---- Time bar and playback ----

const playLabel = () => (mode.kind === "daily" ? "Play the last 7 days" : "Play the last 3 hours");

function updateTimebar() {
  const still = mode.kind === "single" || status === "failed";
  els.play.hidden = still;
  els.track.hidden = still;
  els.track.max = String(Math.max(0, timeline.slots.length - 1));
  els.track.value = String(slot);
  if (!playing) els.play.setAttribute("aria-label", playLabel());
}

function setPlaying(on) {
  playing = on;
  els.playIcon.hidden = on;
  els.pauseIcon.hidden = !on;
  els.play.setAttribute("aria-label", on ? "Pause" : playLabel());
}

function play() {
  if (status !== "ready" || timeline.slots.length < 2) return;
  for (let i = 0; i < timeline.slots.length; i++) slotPictures(i).forEach(addPicture);
  setPlaying(true);
  advance();
}

// Step oldest to newest, holding the newest; only step to a slot whose pictures have loaded.
function advance() {
  const last = timeline.slots.length - 1;
  const next = slot === last ? 0 : slot + 1;
  if (!slotLoaded(next)) {
    playTimer = setTimeout(advance, WAIT_MS);
    return;
  }
  showSlot(next);
  playTimer = setTimeout(advance, next === last ? HOLD_MS : STEP_MS);
}

function pause() {
  clearTimeout(playTimer);
  if (playing) setPlaying(false);
}

// ---- Stamp ----

const numSpan = (text) => Object.assign(document.createElement("span"), { className: "num", textContent: text });

// Puts text in el with its numbers in the mono face.
function setWithNumbers(el, text) {
  const nodes = text.split(/(\d[\d.]*)/).map((s, i) => (i % 2 ? numSpan(s) : s));
  el.replaceChildren(...nodes.filter((n) => n !== ""));
}

function renderPlace() {
  const { lng, lat } = map.getCenter().wrap();
  const near = nearestPlace(cities, lng, lat);
  const text = near ? `${near.name}, ${near.country}` : formatCoords(lng, lat).text;
  if (text === lastPlace) return; // the place is a live region: only write it when it changes
  lastPlace = text;
  if (near) els.place.textContent = text;
  else setWithNumbers(els.place, text);
}

// The picture under the view centre: the topmost live source that covers it, else the daily picture.
function pictureInfo() {
  if (status === "loading") return null;
  if (mode.kind !== "loop") {
    const { source, band } = mode.live[0];
    return { source, band, frameMs: Date.parse(timeline.slots[slot]), kind: mode.kind };
  }
  const { lng, lat } = map.getCenter().wrap();
  const live = status === "ready" ? mode.live.filter((entry) => timeline.frames[entry.source]?.[slot] != null) : [];
  const top = topSourceAt(live.map((entry) => entry.source), lng, lat);
  if (top) {
    const entry = live.find((e) => e.source === top);
    return { source: top, band: entry.band, frameMs: timeline.frames[top][slot], kind: "loop" };
  }
  return { source: underlay.source, band: "", frameMs: Date.parse(underlay.time), kind: "daily" };
}

function renderPicture() {
  const info = pictureInfo();
  if (!info) {
    els.age.replaceChildren();
    els.source.textContent = "Loading pictures";
    return;
  }
  const age = ageText(info.frameMs, Date.now(), info.kind);
  const nodes = [];
  for (const { num, unit } of age.parts) {
    if (num) nodes.push(numSpan(num));
    if (unit) nodes.push(unit);
  }
  els.age.replaceChildren(...nodes.flatMap((n, i) => (i ? [" ", n] : [n])));
  const line = sourceLine(info.source, info.band, info.frameMs, info.kind);
  els.source.textContent = status === "failed" ? `Live pictures didn't load · ${line}` : line;
}

function renderStamp() {
  renderPlace();
  renderPicture();
}

// ---- URL hash ----

function writeHash() {
  const { lng, lat } = map.getCenter().wrap();
  history.replaceState(null, "", formatHash({ mode: mode.key, lat, lon: lng, zoom: map.getZoom() }));
}

// ---- Start ----

// Cities for the stamp (and for search).
export const citiesReady = fetch("data/cities.json")
  .then((r) => r.json())
  .then(loadCities)
  .catch(() => []);
citiesReady.then((list) => {
  cities = list;
  lastPlace = "";
  renderPlace();
});

// Start as soon as the style is ready, without waiting for the first tiles.
map.once("style.load", () => {
  renderPlace();
  setMode(view.mode);
});
map.on("moveend", () => {
  if (!mode) return;
  renderStamp();
  writeHash();
});

els.modes.forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.mode !== mode?.key) setMode(b.dataset.mode);
  }),
);
els.play.addEventListener("click", () => (playing ? pause() : play()));
els.track.addEventListener("input", () => {
  pause();
  showSlot(Number(els.track.value));
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
setInterval(() => mode && renderPicture(), TICK_MS);

// ---- For the other page scripts (search, About, location, Save picture) ----

// What the stamp shows now: place, the picture's time and kind, and the source line.
export function getStampState() {
  return { mode: mode?.key, place: els.place.textContent, ...pictureInfo(), sourceLine: els.source.textContent };
}

export { map, pause };
