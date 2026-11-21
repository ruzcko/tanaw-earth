import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOURCES,
  MODES,
  tileUrl,
  domainUrl,
  parseDomain,
  fetchTimes,
  buildTimeline,
  dailyDates,
  covers,
  topSourceAt,
  ageText,
  sourceLine,
} from "../site/gibs.js";

const MIN = 60 * 1000;
const utc = (h, m = 0) => Date.UTC(2026, 10, 21, h, m);
const xml = (domain) =>
  `<Domains xmlns:ows='http://www.opengis.net/ows/1.1'><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>${domain}</Domain><Size>2</Size></DimensionDomain></Domains>`;

// Two real DescribeDomains responses.
const DOMAIN_A = "2026-11-21/2026-11-21T02:30:00Z/PT10M,2026-11-21T02:50:00Z/2026-11-21T04:00:00Z/PT10M";
const DOMAIN_B = "2026-11-21T01:30:00Z/2026-11-21T02:30:00Z/PT10M,2026-11-21T02:50:00Z/2026-11-21T03:50:00Z/PT10M";
const steps = (from, to) => Array.from({ length: (to - from) / (10 * MIN) + 1 }, (_, i) => from + i * 10 * MIN);

test("MODES list live layers bottom to top with the fields the app needs", () => {
  assert.deepEqual(MODES.clouds.live.map((l) => l.source), ["goesEast", "goesWest", "himawari"]);
  assert.deepEqual(MODES.infrared.live.map((l) => l.band), ["infrared", "infrared", "infrared"]);
  for (const mode of Object.values(MODES)) {
    for (const l of mode.live) {
      assert.ok(SOURCES[l.source] && l.layer && l.band && l.level && l.ext, `${mode.key} ${l.layer}`);
    }
  }
  assert.equal(MODES.clouds.underlay.source, "viirs");
  assert.equal(MODES.colour.underlay, null);
  assert.equal(MODES.lights.kind, "single");
});

test("tileUrl formats epoch ms without milliseconds and keeps date strings", () => {
  assert.equal(
    tileUrl("Himawari_AHI_Band13_Clean_Infrared", utc(3, 50), 6, "png"),
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/2026-11-21T03:50:00Z/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
  );
  assert.equal(
    tileUrl("VIIRS_NOAA21_CorrectedReflectance_TrueColor", "2026-11-20", 9, "jpg"),
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/2026-11-20/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
  );
});

test("domainUrl asks for the time range", () => {
  assert.equal(
    domainUrl("GOES-East_ABI_GeoColor", 7, utc(0, 30), utc(4)),
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/GOES-East_ABI_GeoColor/default/GoogleMapsCompatible_Level7/all/2026-11-21T00:30:00Z--2026-11-21T04:00:00Z.xml",
  );
});

test("parseDomain reads a bare-date range start as midnight UTC and keeps gaps", () => {
  const times = parseDomain(xml(DOMAIN_A));
  assert.deepEqual(times, [...steps(utc(0), utc(2, 30)), ...steps(utc(2, 50), utc(4))]);
  assert.equal(times[0], utc(0));
  assert.ok(!times.includes(utc(2, 40)));
});

test("parseDomain handles the second real response", () => {
  assert.deepEqual(parseDomain(xml(DOMAIN_B)), [...steps(utc(1, 30), utc(2, 30)), ...steps(utc(2, 50), utc(3, 50))]);
});

test("parseDomain returns ascending times without duplicates", () => {
  const times = parseDomain(xml("2026-11-21T02:00:00Z/2026-11-21T02:20:00Z/PT10M,2026-11-21T01:50:00Z/2026-11-21T02:10:00Z/PT10M"));
  assert.deepEqual(times, steps(utc(1, 50), utc(2, 20)));
});

test("parseDomain rejects malformed XML and ranges", () => {
  assert.throws(() => parseDomain("<html><title>500 Internal Server Error</title></html>"), /No <Domain>/);
  assert.throws(() => parseDomain(""), /No <Domain>/);
  assert.throws(() => parseDomain(xml("2026-11-21T01:00:00Z/2026-11-21T02:00:00Z")), /Bad range/);
  assert.throws(() => parseDomain(xml("yesterday/2026-11-21T02:00:00Z/PT10M")), /Bad time/);
  assert.throws(() => parseDomain(xml("2026-11-21T01:00:00Z/2026-11-21T02:00:00Z/P1D")), /Bad period/);
  assert.throws(() => parseDomain(xml("2026-11-21T01:00:00Z/2026-11-21T02:00:00Z/PT0M")), /Bad period/);
});

test("fetchTimes requests the last 3.5 hours and parses the answer", async () => {
  let asked;
  const fetcher = async (url) => {
    asked = url;
    return { ok: true, text: async () => xml(DOMAIN_B) };
  };
  const times = await fetchTimes("GOES-West_ABI_Band13_Clean_Infrared", 6, utc(4), undefined, fetcher);
  assert.match(asked, /GoogleMapsCompatible_Level6\/all\/2026-11-21T00:30:00Z--2026-11-21T04:00:00Z\.xml$/);
  assert.equal(times.at(-1), utc(3, 50));
});

test("fetchTimes throws on an HTTP error or a body without <Domain>", async () => {
  const fail = async () => ({ ok: false, status: 503, text: async () => "" });
  await assert.rejects(fetchTimes("L", 6, utc(4), 3.5, fail), /HTTP 503/);
  const html = async () => ({ ok: true, text: async () => "<html>Not Found</html>" });
  await assert.rejects(fetchTimes("L", 6, utc(4), 3.5, html), /No <Domain>/);
});

test("buildTimeline ends at the newest time of any source and fills gaps up to 20 minutes", () => {
  const { slots, frames } = buildTimeline({ himawari: parseDomain(xml(DOMAIN_A)), goesWest: parseDomain(xml(DOMAIN_B)) });
  assert.equal(slots.length, 19);
  assert.equal(slots.at(-1), utc(4));
  assert.equal(slots[0], utc(1));
  const at = (key, h, m) => frames[key][slots.indexOf(utc(h, m))];
  assert.equal(at("himawari", 2, 40), utc(2, 30)); // missing frame, 10 min back
  assert.equal(at("goesWest", 1, 0), null); // its list starts at 01:30
  assert.equal(at("goesWest", 1, 30), utc(1, 30));
  assert.equal(at("goesWest", 4, 0), utc(3, 50));
  assert.equal(frames.himawari.length, 19);
});

test("buildTimeline allows exactly 20 minutes, hides older frames and drops empty slots", () => {
  const t0 = utc(1);
  const { slots, frames } = buildTimeline({ himawari: [t0, t0 + 40 * MIN, t0 + 180 * MIN] });
  assert.deepEqual(
    slots.map((s) => (s - t0) / MIN),
    [0, 10, 20, 40, 50, 60, 180],
  );
  assert.deepEqual(
    frames.himawari.map((t) => (t - t0) / MIN),
    [0, 0, 0, 40, 40, 40, 180],
  );
});

test("buildTimeline leaves out a source whose time list failed", () => {
  const { slots, frames } = buildTimeline({ goesWest: parseDomain(xml(DOMAIN_B)) });
  assert.deepEqual(Object.keys(frames), ["goesWest"]);
  assert.equal(slots.at(-1), utc(3, 50));
  assert.ok(frames.goesWest.every((t) => t !== null));
});

test("buildTimeline with every source failed has no slots", () => {
  assert.deepEqual(buildTimeline({}), { slots: [], frames: {} });
  assert.deepEqual(buildTimeline({ himawari: [] }), { slots: [], frames: { himawari: [] } });
});

test("dailyDates ends on yesterday in UTC, around midnight", () => {
  const atMidnight = dailyDates(utc(0));
  assert.equal(atMidnight.length, 7);
  assert.equal(atMidnight[0], "2026-11-14");
  assert.equal(atMidnight.at(-1), "2026-11-20");
  assert.equal(dailyDates(utc(0) - 1000).at(-1), "2026-11-19");
  assert.deepEqual(dailyDates(utc(23, 59), 2), ["2026-11-19", "2026-11-20"]);
});

test("covers uses the disc limit around the sub-satellite point", () => {
  assert.equal(covers("himawari", 140.7, 77), true);
  assert.equal(covers("himawari", 140.7, 79), false);
  assert.equal(covers("goesEast", -75.2, -77), true);
  assert.equal(covers("goesEast", 0, 51.5), false); // London
  assert.equal(covers("viirs", 0, 51.5), true);
});

test("covers and topSourceAt across the antimeridian", () => {
  const all = ["himawari", "goesWest", "goesEast"];
  assert.equal(covers("himawari", 175, 0), true);
  assert.equal(covers("goesWest", 175, 0), false);
  assert.equal(covers("himawari", -175, 0), false);
  assert.equal(covers("goesWest", -175, 0), true);
  assert.equal(covers("himawari", 180, 0), true);
  assert.equal(topSourceAt(all, 175, 0), "himawari");
  assert.equal(topSourceAt(all, -175, 0), "goesWest");
  assert.equal(topSourceAt(all, -157.9, 21.3), "goesWest"); // Honolulu
});

test("topSourceAt follows draw order and only the given sources", () => {
  const all = ["himawari", "goesWest", "goesEast"];
  assert.equal(topSourceAt(all, 121, 14.6), "himawari"); // Manila
  assert.equal(topSourceAt(all, -74, 40.7), "goesEast"); // New York: GOES-West stops at 106° W
  assert.equal(topSourceAt(all, -118.2, 34.1), "goesWest"); // Los Angeles: both GOES cover it
  assert.equal(topSourceAt(["goesEast"], -74, 40.7), "goesEast");
  assert.equal(topSourceAt(["goesWest", "goesEast"], 121, 14.6), null);
  assert.equal(topSourceAt(all, 36.8, -1.3), null); // Nairobi
  assert.equal(topSourceAt([], 121, 14.6), null);
});

test("ageText for loop pictures", () => {
  const now = utc(5);
  assert.deepEqual(ageText(now - 20 * 1000, now, "loop"), { text: "Just now", parts: [{ num: "", unit: "Just now" }] });
  assert.deepEqual(ageText(now - 34 * MIN, now, "loop"), { text: "34 min ago", parts: [{ num: "34", unit: "min ago" }] });
  assert.deepEqual(ageText(now - 65 * MIN, now, "loop"), {
    text: "1 h 5 min ago",
    parts: [
      { num: "1", unit: "h" },
      { num: "5", unit: "min ago" },
    ],
  });
  assert.equal(ageText(now - 59 * MIN - 59 * 1000, now, "loop").text, "59 min ago");
  assert.equal(ageText(now - 23 * 60 * MIN, now, "loop").text, "23 h ago");
});

test("ageText for daily and single pictures", () => {
  const now = utc(5);
  assert.deepEqual(ageText(Date.UTC(2026, 10, 20), now, "daily"), { text: "1 day ago", parts: [{ num: "1", unit: "day ago" }] });
  assert.deepEqual(ageText(Date.UTC(2026, 10, 18), now, "daily"), { text: "3 days ago", parts: [{ num: "3", unit: "days ago" }] });
  assert.deepEqual(ageText(Date.UTC(2016, 0, 1), now, "single"), { text: "2016", parts: [{ num: "2016", unit: "" }] });
});

test("sourceLine for each kind of source", () => {
  const t = utc(3, 50);
  const tz = "Asia/Manila";
  assert.equal(sourceLine("himawari", "visible", t, "loop", "en-US", tz), "Himawari-9 · visible · 11:50 AM");
  assert.equal(sourceLine("goesEast", "GeoColor", t, "loop", "en-US", tz), "GOES-East · GeoColor · 11:50 AM");
  assert.equal(sourceLine("goesWest", "infrared", t, "loop", "en-US", tz), "GOES-West · infrared · 11:50 AM");
  assert.equal(sourceLine("viirs", undefined, Date.UTC(2026, 10, 20), "daily", "en-US"), "NOAA-21 · one pass a day · 20 Nov");
  // The daily date is the picture's UTC day wherever the visitor is.
  assert.equal(
    sourceLine("viirs", "one pass a day", Date.UTC(2026, 10, 20), "daily", "en-US", "America/Los_Angeles"),
    "NOAA-21 · one pass a day · 20 Nov",
  );
  assert.equal(sourceLine("lights", undefined, Date.UTC(2016, 0, 1), "single", "en-US"), "Black Marble · city lights");
});

test("sourceLine works with only the documented positional arguments", () => {
  assert.match(sourceLine("himawari", "visible", utc(3, 50), "loop"), /^Himawari-9 · visible · \d{1,2}[:.]\d{2}/);
});
