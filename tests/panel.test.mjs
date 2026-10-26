// The page's own rules, without a browser: the sky by the sun and the clock, the weather,
// the greeting, the lamps by the clock, the celebrations by date, and that every
// decoration they ask for is one the house can draw.
process.env.TZ = "Europe/London";              // the sun by the clock depends on the time zone
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { skyPhase, sunAt, clockParts, weatherFor, weatherWords, greeting, lampsFor, tvOn, WEATHER } from "../public/sky.js";
import { celebrationsToday, between, CELEBRATIONS, DECOR_NAMES } from "../public/celebrations.js";

const at = (date, time = "12:00") => new Date(`${date}T${time}:00`);

test("the sky follows the sun's height", () => {
  assert.equal(skyPhase({ elevation: 30, rising: true }), "day");
  assert.equal(skyPhase({ elevation: 2, rising: true }), "dawn");
  assert.equal(skyPhase({ elevation: 2, rising: false }), "dusk");
  assert.equal(skyPhase({ elevation: -20, rising: false }), "night");
});

test("without sun.sun, the sun is worked out from the date, so the evenings draw in", () => {
  const London = { latitude: 52, longitude: 0 };
  assert.equal(skyPhase(null, at("2026-01-15", "13:00"), London), "day");
  assert.equal(skyPhase(null, at("2026-01-15", "08:00"), London), "dawn");    // sunrise about 08:00
  assert.equal(skyPhase(null, at("2026-01-15", "20:00"), London), "night");   // dark long before 8 in January...
  assert.equal(skyPhase(null, at("2026-06-21", "20:00"), London), "day");     // ...and light at 8 in June (summer time)
  assert.equal(skyPhase(null, at("2026-06-21", "21:45"), London), "dusk");
  assert.equal(skyPhase(null, at("2026-06-21", "23:59"), London), "night");
  assert.equal(skyPhase(null, at("2026-12-21", "16:15"), London), "dusk");
  assert.equal(skyPhase({ elevation: undefined }, at("2026-01-15", "20:00")), "night");   // no place: about 52° north
  // The other side of the world: a January evening is a summer evening
  assert.equal(skyPhase(null, at("2026-01-15", "18:00"), { latitude: -34, longitude: 0 }), "day");
  // The highest it gets at midsummer: 90 - 52 + 23.4
  assert.ok(Math.abs(sunAt(at("2026-06-21", "13:00"), London).elevation - 61.4) < 1);
  assert.equal(sunAt(at("2026-06-21", "09:00"), London).rising, true);
});

test("every Home Assistant weather condition has words, and unknown ones are a clear sky", () => {
  const ha = ["clear-night", "cloudy", "exceptional", "fog", "hail", "lightning", "lightning-rainy", "partlycloudy",
    "pouring", "rainy", "snowy", "snowy-rainy", "sunny", "windy", "windy-variant"];
  assert.deepEqual(Object.keys(WEATHER).sort(), ha);
  for (const c of ha) assert.ok(weatherFor(c).words, c);
  assert.equal(weatherFor("pouring").rain, 2);
  assert.deepEqual(weatherFor("made-up"), { clouds: 0, rain: 0, snow: 0, fog: false, flash: false, wind: false, words: "" });
  assert.equal(weatherWords({ condition: "rainy", temperature: 8.6 }), "Rain, 9°");
  assert.equal(weatherWords({ condition: "sunny" }), "Sunny");
  assert.equal(weatherWords(null), "");
});

test("the greeting changes through the day", () => {
  assert.equal(greeting(at("2026-01-01", "09:00")), "Good morning");
  assert.equal(greeting(at("2026-01-01", "15:00")), "Good afternoon");
  assert.equal(greeting(at("2026-01-01", "20:00")), "Good evening");
  assert.equal(greeting(at("2026-01-01", "02:00")), "Hello, night owl");
});

test("celebrations fall on their days, birthdays from the calendar first", () => {
  const none = { birthdays: [] };
  assert.deepEqual(celebrationsToday(at("2026-03-03"), none), []);
  assert.deepEqual(celebrationsToday(at("2026-10-31"), none).map(c => c.id), ["halloween"]);
  assert.deepEqual(celebrationsToday(at("2026-12-25"), none).map(c => c.id), ["christmas"]);
  assert.deepEqual(celebrationsToday(at("2026-12-31"), none).map(c => c.id), ["new_year"]);
  assert.deepEqual(celebrationsToday(at("2027-01-01"), none).map(c => c.id), ["new_year"]);
  const party = celebrationsToday(at("2026-10-31"), { birthdays: ["Sam's birthday"] });
  assert.deepEqual(party.map(c => c.id), ["birthday", "halloween"]);
  assert.ok(party[0].decor.includes("confetti"));
  assert.match(party[0].words, /Sam's birthday/);
  assert.deepEqual(celebrationsToday(at("2026-03-03"), none, "christmas").map(c => c.id), ["christmas"]);   // a preview
});

test("date ranges work over the new year, and every celebration is well formed", () => {
  assert.ok(between(at("2026-12-31"), "12-30", "01-02"));
  assert.ok(between(at("2027-01-02"), "12-30", "01-02"));
  assert.ok(!between(at("2027-01-03"), "12-30", "01-02"));
  for (const c of CELEBRATIONS) {
    assert.match(c.id, /^[a-z_]+$/);
    for (const name of c.decor) assert.ok(DECOR_NAMES.includes(name), `${c.id}: no decoration called ${name}`);
    assert.equal(typeof c.when, "function");
  }
  assert.equal(new Set(CELEBRATIONS.map(c => c.id)).size, CELEBRATIONS.length, "ids are unique");
});

test("the page can draw every decoration, and nothing it can't", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const block = app.slice(app.indexOf("const DECOR = {"), app.indexOf("\n};", app.indexOf("const DECOR = {")));
  const drawn = [...block.matchAll(/^  ([a-z_]+)\(/gm)].map(m => m[1]);
  assert.deepEqual(drawn.sort(), [...DECOR_NAMES].sort());
});

test("the house looks lived in: lamps on in the evening, off overnight and by day", () => {
  assert.deepEqual(lampsFor(at("2026-01-01", "13:00"), "day"), { living: false, kitchen: false, bedroom: false, bathroom: false });
  assert.deepEqual(lampsFor(at("2026-01-01", "18:00"), "night"), { living: true, kitchen: true, bedroom: false, bathroom: false });
  assert.deepEqual(lampsFor(at("2026-01-01", "22:00"), "night"), { living: true, kitchen: false, bedroom: true, bathroom: true });
  assert.deepEqual(lampsFor(at("2026-01-01", "03:00"), "night"), { living: false, kitchen: false, bedroom: false, bathroom: false });
  assert.equal(lampsFor(at("2026-01-01", "07:15"), "dawn").kitchen, true);
  assert.equal(tvOn(at("2026-01-01", "20:00"), "night"), true);
  assert.equal(tvOn(at("2026-06-21", "20:00"), "day"), false);              // a light summer evening
  assert.equal(tvOn(at("2026-01-01", "23:00"), "night"), false);
});

test("the clock follows the tablet's language, with a 12-hour clock's AM/PM kept small", () => {
  // (browsers put a narrow no-break space before AM/PM; any space will do here)
  const said = (d, locale) => clockParts(d, locale).map(p => (p.small ? `[${p.text}]` : p.text)).join("").replace(/\s/g, " ");
  assert.equal(said(at("2026-10-26", "13:05"), "en-GB"), "13:05");
  assert.equal(said(at("2026-10-26", "09:05"), "en-GB"), "09:05");
  assert.equal(said(at("2026-10-26", "13:05"), "en-US"), "1:05[ ][PM]");      // no leading zero, and a small space
  assert.equal(said(at("2026-10-26", "09:05"), "en-US"), "9:05[ ][AM]");
  assert.match(said(at("2026-10-26", "13:05"), "ko-KR"), /^\[.+\]\[ \]1:05$/);  // before the time, in Korean
});
