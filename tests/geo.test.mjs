import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  loadCities,
  nearestPlace,
  searchPlaces,
  formatCoords,
  lonFromTimezone,
  sunElevation,
  parseHash,
  formatHash,
} from "../site/geo.js";

const CITIES = loadCities(JSON.parse(readFileSync(new URL("../site/data/cities.json", import.meta.url), "utf8")));

const SMALL = loadCities({
  scale: 100,
  countries: ["Dominican Republic", "Costa Rica", "Puerto Rico", "Guam"],
  admin1: [],
  cities: [
    ["San Juan", 2, 0, -6606, 1846, 10],
    ["Asan", 3, 0, 14471, 1347, 13],
    ["Santo Domingo", 0, 0, -6990, 1848, 12],
    ["San José", 1, 0, -8408, 993, 10],
    ["Broken row"],
  ],
});

test("loadCities reads the compact format and scales coordinates", () => {
  assert.equal(SMALL.length, 4);
  assert.deepEqual(SMALL[0], { name: "San Juan", country: "Puerto Rico", lon: -66.06, lat: 18.46, rank: 10 });
  const manila = CITIES.find((c) => c.name === "Manila");
  assert.deepEqual(manila, { name: "Manila", country: "Philippines", lon: 120.98, lat: 14.61, rank: 14 });
});

test("loadCities rejects data that is not the cities format", () => {
  assert.throws(() => loadCities(null), /expected countries and cities/);
  assert.throws(() => loadCities({ cities: [] }), /expected countries and cities/);
});

test("nearestPlace finds Manila and returns null over open ocean", () => {
  assert.deepEqual(nearestPlace(CITIES, 121.0, 14.6), { name: "Manila", country: "Philippines" });
  assert.equal(nearestPlace(CITIES, -130, -45), null); // South Pacific
  assert.equal(nearestPlace(SMALL, -66.06, 21), null); // San Juan is about 280 km away
  assert.deepEqual(nearestPlace(SMALL, -66.06, 21, 300), { name: "San Juan", country: "Puerto Rico" });
});

test("searchPlaces ignores accents and case", () => {
  assert.equal(searchPlaces(CITIES, "osaka")[0].name, "Ōsaka");
  assert.equal(searchPlaces(CITIES, "  SAO PAULO ")[0].name, "São Paulo");
  assert.equal(searchPlaces(SMALL, "jose")[0].name, "San José");
});

test("searchPlaces puts prefix matches first, then bigger cities, then names", () => {
  assert.deepEqual(
    searchPlaces(SMALL, "san").map((c) => c.name),
    ["Santo Domingo", "San José", "San Juan", "Asan"],
  );
  assert.equal(searchPlaces(CITIES, "a").length, 8);
  assert.equal(searchPlaces(CITIES, "a", 3).length, 3);
  assert.deepEqual(searchPlaces(CITIES, "   "), []);
  assert.deepEqual(searchPlaces(CITIES, "zzzz"), []);
});

test("formatCoords names each hemisphere", () => {
  assert.deepEqual(formatCoords(121.0, 14.6), { text: "14.6° N, 121.0° E" });
  assert.deepEqual(formatCoords(-74.04, 40.71), { text: "40.7° N, 74.0° W" });
  assert.deepEqual(formatCoords(151.21, -33.87), { text: "33.9° S, 151.2° E" });
  assert.deepEqual(formatCoords(-58.38, -34.6), { text: "34.6° S, 58.4° W" });
  assert.deepEqual(formatCoords(0, 0), { text: "0.0° N, 0.0° E" });
});

test("lonFromTimezone turns the offset into a longitude", () => {
  assert.equal(lonFromTimezone(-480), 120);
  assert.equal(lonFromTimezone(300), -75);
  assert.equal(lonFromTimezone(0), 0);
  assert.equal(lonFromTimezone(-840), 180); // UTC+14, clamped
});

test("sunElevation is high at noon and low at midnight", () => {
  // Manila, 21 Nov 2026: noon and midnight local time.
  const noon = sunElevation(Date.UTC(2026, 10, 21, 4), 121.0, 14.6);
  const midnight = sunElevation(Date.UTC(2026, 10, 21, 16), 121.0, 14.6);
  assert.ok(noon > 50 && noon < 60, `noon ${noon}`);
  assert.ok(midnight < -50, `midnight ${midnight}`);
  // March equinox, noon UTC on the equator at Greenwich: the sun is near overhead.
  assert.ok(sunElevation(Date.UTC(2026, 2, 20, 12, 7), 0, 0) > 88);
  // June solstice at the North Pole: the sun stays up at about 23.4 degrees.
  assert.ok(Math.abs(sunElevation(Date.UTC(2026, 5, 21, 0), 0, 90) - 23.4) < 0.2);
});

test("formatHash and parseHash round trip", () => {
  const hash = formatHash({ mode: "clouds", lat: 14.6, lon: 121, zoom: 3.2 });
  assert.equal(hash, "#clouds/14.60/121.00/3.2");
  assert.deepEqual(parseHash(hash), { mode: "clouds", lat: 14.6, lon: 121, zoom: 3.2 });
  assert.deepEqual(parseHash("infrared/-33.87/-151.21/8"), { mode: "infrared", lat: -33.87, lon: -151.21, zoom: 8 });
  assert.equal(formatHash({ mode: "lights", lat: -0.004, lon: -180, zoom: 1 }), "#lights/-0.00/-180.00/1.0");
  assert.deepEqual(parseHash("#lights/-0.00/-180.00/1.0"), { mode: "lights", lat: -0, lon: -180, zoom: 1 });
});

test("parseHash rejects bad input", () => {
  for (const bad of [
    "",
    "#",
    "#clouds",
    "#clouds/14.6/121",
    "#clouds/14.6/121/3/1",
    "#rain/14.6/121/3",
    "#__proto__/14.6/121/3",
    "#clouds/86/121/3",
    "#clouds/14.6/181/3",
    "#clouds/14.6/121/0.5",
    "#clouds/14.6/121/9",
    "#clouds/abc/121/3",
    "#clouds/1e1/121/3",
    "#clouds//121/3",
    "#clouds/ 14.6/121/3",
  ]) {
    assert.equal(parseHash(bad), null, bad);
  }
});
