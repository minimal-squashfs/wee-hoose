// The sky's mood and the header's words, worked out from Home Assistant's sun.sun and
// weather.* states. Plain functions with no page in sight, so the tests can run them too.

// day, dawn, dusk or night, from the sun's height. That's Home Assistant's sun.sun when
// there is one; otherwise (and for previews of a made-up time) it's worked out from the date
// and time with sunAt, so the evenings draw in through the year.
export function skyPhase(sun, d = new Date(), place = {}) {
  const s = sun && Number.isFinite(Number(sun.elevation)) ? sun : sunAt(d, place);
  const e = Number(s.elevation);
  if (e > 6) return "day";
  if (e < -6) return "night";
  return s.rising ? "dawn" : "dusk";
}

// Where the sun is at a date and time: its height in degrees, and whether it's rising.
// place is { latitude, longitude } in degrees (the helper sends Home Assistant's, rounded).
// Without a latitude it guesses 52° north; without a longitude, that noon is at 12:00 in
// the time zone's standard time. Near enough for the sky's colours: within a few minutes.
export function sunAt(d, { latitude = 52, longitude = null } = {}) {
  const rad = Math.PI / 180, year = d.getFullYear();
  const day = Math.round((Date.UTC(year, d.getMonth(), d.getDate()) - Date.UTC(year, 0, 0)) / 864e5);
  const tilt = 23.44 * Math.sin(2 * Math.PI * (284 + day) / 365) * rad;          // how far north or south the sun is today
  // Standard time's offset from UTC, in hours (summer time is the smaller of the two offsets)
  const standard = -Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset()) / 60;
  const solar = (((d.getUTCHours() + d.getUTCMinutes() / 60 + (longitude ?? standard * 15) / 15) % 24) + 24) % 24;
  const lat = latitude * rad, angle = (solar - 12) * 15 * rad;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(tilt) + Math.cos(lat) * Math.cos(tilt) * Math.cos(angle)) / rad;
  return { elevation: Math.round(elevation * 10) / 10, rising: solar < 12 };
}

// Each of Home Assistant's weather conditions: the words for it, and what the sky does.
// rain and snow are 0 (none) to 2 (heavy); clouds 0 to 3.
export const WEATHER = {
  "clear-night":     { words: "Clear",         clouds: 0 },
  sunny:             { words: "Sunny",         clouds: 0 },
  partlycloudy:      { words: "Partly cloudy", clouds: 1 },
  cloudy:            { words: "Cloudy",        clouds: 3 },
  fog:               { words: "Foggy",         clouds: 2, fog: true },
  rainy:             { words: "Rain",          clouds: 3, rain: 1 },
  pouring:           { words: "Pouring",       clouds: 3, rain: 2 },
  "lightning":       { words: "Thunder",       clouds: 3, flash: true },
  "lightning-rainy": { words: "Thunderstorms", clouds: 3, rain: 2, flash: true },
  snowy:             { words: "Snow",          clouds: 2, snow: 1 },
  "snowy-rainy":     { words: "Sleet",         clouds: 3, rain: 1, snow: 1 },
  hail:              { words: "Hail",          clouds: 3, snow: 2 },
  windy:             { words: "Windy",         clouds: 1, wind: true },
  "windy-variant":   { words: "Windy",         clouds: 2, wind: true },
  exceptional:       { words: "Wild weather",  clouds: 3, wind: true },
};
// What the sky does for a condition; anything unknown is a plain, clear sky with no words.
export function weatherFor(condition) {
  return { clouds: 0, rain: 0, snow: 0, fog: false, flash: false, wind: false, words: "", ...WEATHER[condition] };
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "Hello, night owl";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  if (h < 23) return "Good evening";
  return "Sleep well";
}

// "Sunny, 14°" (or just the one that's known)
export function weatherWords(w) {
  if (!w) return "";
  const t = Number.isFinite(w.temperature) ? `${Math.round(w.temperature)}°` : "";
  return [weatherFor(w.condition).words, t].filter(Boolean).join(", ");
}

// The lamps by the clock, so the house looks lived in. The rooms without a real lamp light up
// in the evening and early on dark mornings, and go dark overnight. (The living room's lamp
// follows Home Assistant instead, when there's one set up.)
export function lampsFor(d, phase) {
  const h = d.getHours() + d.getMinutes() / 60, dark = phase !== "day";
  const evening = dark && h >= 12, morning = dark && h >= 6 && h < 12;
  return {
    living: evening && h < 23,
    kitchen: (evening && h < 21.5) || (morning && h >= 7),
    bedroom: (evening && h >= 21 && h < 23.5) || (morning && h < 7.5),
    bathroom: (evening && h >= 21.75 && h < 22.25) || (morning && h >= 6.5 && h < 7.25),
  };
}

// The living room's TV, on in the evening (just part of the picture, for now)
export function tvOn(d, phase) {
  const h = d.getHours() + d.getMinutes() / 60;
  return phase !== "day" && h >= 19 && h < 22.5;
}
