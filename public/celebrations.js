// Celebrations: what the house celebrates, and how it dresses up. To add one, add a line to
// CELEBRATIONS (docs/customising.md has examples). Each one has:
//   id      a short name, used in ?celebrate=<id> to preview it
//   when    (date, state) => true on its days. state.birthdays is today's birthday events.
//   words   the banner, or (state) => the banner
//   decor   how the house dresses up, from DECOR_NAMES below
// When more than one falls on the same day, all their decorations go up and all their
// banners show.

// Everything the house can put up (drawn by DECOR in public/app.js)
export const DECOR_NAMES = [
  "bunting", "balloons", "confetti", "party_hat",                      // a party
  "pumpkin", "bats", "cobweb", "witch_hat",                            // Halloween
  "tree", "roof_lights", "wreath", "snow", "santa_hat",                // Christmas
  "fireworks", "hearts",                                               // anything else (fireworks only after dark)
];

// "10-31" for 31 October, to compare dates without the year
export const monthDay = d => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// True from one month-day to another, both included ("12-24" to "12-26"), even over the new year
export const between = (d, from, to) => {
  const md = monthDay(d);
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
};

export const CELEBRATIONS = [
  { id: "birthday", decor: ["bunting", "balloons", "confetti", "party_hat"],
    when: (d, s) => (s?.birthdays?.length ?? 0) > 0,
    words: s => s.birthdays.map(b => `🎂 ${b}`).join("  ·  ") },
  { id: "halloween", decor: ["pumpkin", "bats", "cobweb", "witch_hat"],
    when: d => monthDay(d) === "10-31", words: "🎃 Happy Halloween!" },
  { id: "christmas", decor: ["tree", "roof_lights", "wreath", "snow", "santa_hat"],
    when: d => between(d, "12-24", "12-26"), words: "🎄 Merry Christmas!" },
  { id: "new_year", decor: ["fireworks", "party_hat"],
    when: d => between(d, "12-31", "01-01"), words: "🎆 Happy New Year!" },
];

// Today's celebrations, in the list's order. ?celebrate=<id> (passed as preview) shows one
// whatever the date.
export function celebrationsToday(d, state, preview = null) {
  return CELEBRATIONS.filter(c => (preview ? c.id === preview : c.when(d, state)))
    .map(c => ({ id: c.id, decor: c.decor || [], words: typeof c.words === "function" ? c.words(state) : c.words }));
}
