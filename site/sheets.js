// Tanaw Earth: the search and About sheets, the theme setting, the toast and My location.

import { map, citiesReady } from "./app.js";
import { searchPlaces } from "./geo.js";

const $ = (id) => document.getElementById(id);
const PLACE_ZOOM = 5;
const TOAST_MS = 3000;
const THEME_KEY = "tanaw-earth-theme";

// ---- Toast ----

const toastEl = $("toast");
let toastTimer = 0;

export function toast(text) {
  clearTimeout(toastTimer);
  toastEl.textContent = text;
  toastEl.classList.add("shown");
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("shown");
    toastEl.textContent = "";
  }, TOAST_MS);
}

// ---- Sheets ----

for (const sheet of document.querySelectorAll(".sheet")) {
  sheet.querySelector(".sheet-close").addEventListener("click", () => sheet.close());
  // Backdrop clicks land on the dialog itself, outside its box (its padding is inside).
  sheet.addEventListener("click", (e) => {
    if (e.target !== sheet) return;
    const r = sheet.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) sheet.close();
  });
}

const flyTo = (lon, lat) => map.flyTo({ center: [lon, lat], zoom: PLACE_ZOOM });

// ---- Search ----

const searchSheet = $("search-sheet");
const input = $("search-input");
const results = $("search-results");
const empty = $("search-empty");
let cities = [];
let hits = [];
citiesReady.then((list) => {
  cities = list;
  if (searchSheet.open) showResults();
});

function pick(city) {
  searchSheet.close();
  flyTo(city.lon, city.lat);
}

function showResults() {
  const query = input.value.trim();
  hits = query ? searchPlaces(cities, query, 8) : [];
  results.replaceChildren(
    ...hits.map((city) => {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: `${city.name}, ${city.country}` });
      button.addEventListener("click", () => pick(city));
      const li = document.createElement("li");
      li.append(button);
      return li;
    }),
  );
  empty.hidden = !query || hits.length > 0 || cities.length === 0;
}

$("search-button").addEventListener("click", () => {
  searchSheet.showModal();
  input.focus();
  input.select();
});
input.addEventListener("input", showResults);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && hits.length) {
    e.preventDefault();
    pick(hits[0]);
  }
});

// ---- About and theme ----

const aboutSheet = $("about-sheet");
const themeButtons = aboutSheet.querySelectorAll("[data-theme-choice]");

function applyTheme(choice) {
  if (choice === "device") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  themeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice)));
}

themeButtons.forEach((b) =>
  b.addEventListener("click", () => {
    const choice = b.dataset.themeChoice;
    applyTheme(choice);
    try {
      if (choice === "device") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch {
      // Storage is off (private window): the choice lasts until the page closes.
    }
  }),
);
applyTheme(document.documentElement.dataset.theme ?? "device");

$("about-button").addEventListener("click", () => aboutSheet.showModal());

// ---- My location ----

$("locate-button").addEventListener("click", () => {
  navigator.geolocation.getCurrentPosition(
    (pos) => flyTo(pos.coords.longitude, pos.coords.latitude),
    (err) => toast(err.code === err.PERMISSION_DENIED ? "Location is off" : "Couldn't find your location"),
    { timeout: 10000 },
  );
});
