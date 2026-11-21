// Tanaw Earth: Save picture. Draws the current view as a 1080 x 1920 Story picture
// with the wordmark, the place, the picture's time and its source, then shares or downloads it.

import { map, pause, getStampState } from "./app.js";
import { toast } from "./sheets.js";

const W = 1080;
const H = 1920;
// Stories cover the top 14% and the bottom 20%; keep the words between these lines.
const TEXT_BOTTOM = 1520;
const WORDMARK_Y = 300; // centre of the wordmark
const SCALE = 3; // wordmark size relative to the page's top bar
const HALO = 3; // text halo blur on the page, in CSS px; scaled with the text below

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const pad = (n) => String(n).padStart(2, "0");

// ---- The picture's time ----

// Date and time lines as on the page: "20 Nov 2026 · 2:50 PM"; daily pictures show the date only (UTC days).
function timeLine({ frameMs, kind }) {
  if (frameMs == null) return "";
  if (kind === "single") return String(new Date(frameMs).getUTCFullYear());
  const timeZone = kind === "daily" ? "UTC" : undefined;
  const parts = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone }).formatToParts(frameMs);
  const part = (type) => parts.find((p) => p.type === type).value;
  const date = `${part("day")} ${part("month")} ${part("year")}`;
  if (kind === "daily") return date;
  const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(frameMs).replace(/[  ]/g, " ");
  return `${date} · ${clock}`;
}

// tanaw-earth-YYYYMMDD-HHMM.png, in the picture's time (UTC days for daily pictures).
function fileName({ frameMs, kind }) {
  const d = new Date(frameMs ?? Date.now());
  const local = kind === "loop";
  const [y, m, day, h, min] = local
    ? [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]
    : [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
  return `tanaw-earth-${y}${pad(m)}${pad(day)}-${pad(h)}${pad(min)}.png`;
}

// ---- Drawing ----

// The map canvas right after its next frame, so the drawing buffer holds the current view.
function mapFrame() {
  return new Promise((resolve) => {
    map.once("render", () => resolve(map.getCanvas()));
    map.triggerRepaint();
  });
}

function drawCover(ctx, src) {
  const scale = Math.max(W / src.width, H / src.height);
  const w = W / scale;
  const h = H / scale;
  ctx.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, W, H);
}

function drawScrims(ctx) {
  const scrim = token("--scrim");
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  top.addColorStop(0, scrim);
  top.addColorStop(1, "transparent");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.3);
  const bottom = ctx.createLinearGradient(0, H * 0.68, 0, H);
  bottom.addColorStop(0, "transparent");
  bottom.addColorStop(1, scrim);
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.68, W, H * 0.32);
}

// The dark halo the page puts under every word, scaled by k.
function halo(ctx, k) {
  ctx.shadowColor = token("--space");
  ctx.shadowBlur = HALO * k;
  ctx.shadowOffsetY = k;
}

async function fontDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// The page's wordmark SVG as a standalone image: its colours and the Michroma font set inside it,
// because an SVG drawn as an image can't see the page's styles or fonts.
async function wordmarkImage() {
  const svg = document.querySelector(".wordmark svg").cloneNode(true);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", 102 * SCALE);
  svg.setAttribute("height", 20 * SCALE);
  const font = await fontDataUrl(new URL("fonts/michroma-tanaw.woff2", location.href));
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent =
    `@font-face { font-family: "Michroma"; src: url(${font}) format("woff2"); }` +
    `svg { color: ${token("--pic-ink")}; --m-el: ${token("--pic-ink")}; --m-sun: ${token("--pic-ink")}; --m-glow: ${token("--brand-arc-on-space")}; }`;
  svg.prepend(style);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await img.decode();
  return img;
}

// Draws text in runs: numbers in the mono face, words in the sans. Returns the width when draw is false.
function runs(ctx, text, x, y, sansFont, monoFont, draw = true) {
  let width = 0;
  for (const [i, s] of text.split(/(\d[\d:.]*)/).entries()) {
    if (!s) continue;
    ctx.font = i % 2 ? monoFont : sansFont;
    if (draw) ctx.fillText(s, x + width, y);
    width += ctx.measureText(s).width;
  }
  return width;
}

async function drawWordmark(ctx) {
  const img = await wordmarkImage();
  // As in the top bar: mark 102 x 20, an 8 px gap, EARTH at 13 px with .32em spacing (trailing space dropped).
  const size = 13 * SCALE;
  const spacing = 0.32 * size;
  ctx.font = `400 ${size}px Michroma`;
  const letters = [..."EARTH"].map((c) => ctx.measureText(c).width);
  const earthWidth = letters.reduce((a, b) => a + b + spacing, 0) - spacing;
  const markW = 102 * SCALE;
  const markH = 20 * SCALE;
  const gap = 8 * SCALE;
  const left = (W - (markW + gap + earthWidth)) / 2;
  // The mark's bottom edge sits 2.5 px below the TANAW baseline; EARTH shares that baseline.
  const baseline = WORDMARK_Y + markH / 2 - 2.5 * SCALE;
  halo(ctx, SCALE);
  ctx.drawImage(img, left, WORDMARK_Y - markH / 2, markW, markH);
  ctx.fillStyle = token("--pic-ink");
  let x = left + markW + gap;
  [..."EARTH"].forEach((c, i) => {
    ctx.fillText(c, x, baseline);
    x += letters[i] + spacing;
  });
}

function drawWords(ctx, state) {
  const k = 2.5; // the page's text halo, at this picture's text size
  const sans = (weight, size) => `${weight} ${size}px Onest`;
  const mono = (size) => `600 ${size}px "Spline Sans Mono"`;
  const time = timeLine(state);
  // The time line already has the clock or date, so the source line drops its last part.
  const source = state.kind === "single" ? state.sourceLine : state.sourceLine.replace(/ · [^·]*$/, "");
  // Bottom up, centred: source line, date and time, place.
  const lines = [
    { text: source, sans: sans(400, 32), mono: sans(400, 32), color: "--pic-muted", lead: 0 },
    { text: time, sans: sans(600, 40), mono: mono(40), color: "--pic-ink", lead: 56 },
    { text: state.place, sans: sans(700, 56), mono: mono(56), color: "--pic-ink", lead: 60 },
  ];
  halo(ctx, k);
  ctx.textBaseline = "alphabetic";
  let y = TEXT_BOTTOM - 10; // room for descenders below the last baseline
  for (const line of lines) {
    y -= line.lead;
    if (!line.text) continue;
    ctx.fillStyle = token(line.color);
    const width = runs(ctx, line.text, 0, 0, line.sans, line.mono, false);
    runs(ctx, line.text, (W - width) / 2, y, line.sans, line.mono);
  }
}

// Builds the Story picture of the current view; resolves to a PNG blob.
export async function makePicture() {
  const state = getStampState();
  const time = timeLine(state);
  // Load each face with the real text, so subsets past basic Latin (and Michroma's letters) are fetched.
  await Promise.all([
    document.fonts.load("400 39px Michroma", "EARTH"),
    document.fonts.load("700 56px Onest", state.place || "A"),
    document.fonts.load("600 40px Onest", time || "A"),
    document.fonts.load('600 40px "Spline Sans Mono"', time || "0"),
    document.fonts.load("400 32px Onest", state.sourceLine || "A"),
  ]);
  const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = token("--space");
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, await mapFrame());
  drawScrims(ctx);
  await drawWordmark(ctx);
  drawWords(ctx, state);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return { blob, name: fileName(state) };
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast("Picture saved");
}

async function save() {
  pause();
  const { blob, name } = await makePicture();
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // closed the share sheet
      // Some browsers refuse to share once the tap is a few seconds old; download instead.
    }
  }
  download(blob, name);
}

document.getElementById("save-button").addEventListener("click", save);
