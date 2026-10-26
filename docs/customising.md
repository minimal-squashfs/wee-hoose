# Making it yours

Everything here is plain HTML, CSS and JavaScript, with no build step. Change a file, reload the
tablet, and you'll see it. (After changing `config.jsonc` or `server.mjs`, restart the panel.)

Previews let you see any day without waiting for it. Add them to the address:

| Preview | Shows |
|---|---|
| `?time=21:30` | that time today (the sun is worked out for that date and time, so a January evening is dark and a June one light) |
| `?date=2026-12-25` | that day |
| `?weather=snowy` | that weather, using any of Home Assistant's conditions: `sunny`, `clear-night`, `partlycloudy`, `cloudy`, `fog`, `rainy`, `pouring`, `lightning`, `lightning-rainy`, `snowy`, `snowy-rainy`, `hail`, `windy` |
| `?celebrate=halloween` | that celebration, whatever the date |
| `?room=bedroom` | starts zoomed into that room: `living`, `kitchen`, `bedroom` or `bathroom` |

They mix: `?date=2026-10-31&time=19:00&weather=rainy`. While previewing, tapping things
doesn't change anything in the house.

## Repainting

Everything to do with the look is in [`public/theme.css`](../public/theme.css). Change the
values there; you shouldn't need to touch anything else.

- **The house:** `--brick`, `--roof`, `--front-door`, and a wall colour for each room
  (`--wall-living`, `--wall-kitchen`, `--wall-bedroom`, `--wall-bathroom`).
- **The cat:** `--cat` and `--cat-stripes`. A black cat is `#2b2b30` and `#1d1d22`. Set
  `"cat": false` in the config for no cat.
- **The sky:** each of `--sky-day`, `--sky-dawn`, `--sky-dusk` and `--sky-night` is two
  colours, top to bottom.
- **The cards** that open when something's tapped: `--card`, `--accent`, `--button-height`...
- **A different font:** change the `@import` line to another
  [Google Font](https://fonts.google.com/) and set `--font` to match. To keep the tablet
  working without the internet, delete the `@import` and use a font it already has, such as
  `system-ui`.

`public/panel.css` is the layout and the animations: where things go, not what they look like.

## Adding a celebration

Celebrations are in [`public/celebrations.js`](../public/celebrations.js). Each is one line in
`CELEBRATIONS`:

```js
{ id: "valentines", decor: ["hearts"], when: d => monthDay(d) === "02-14", words: "💖 Happy Valentine's Day!" },
```

- `id`: a short name in lower case. Preview it with `?celebrate=valentines`.
- `decor`: how the house dresses up, any mix of `bunting`, `balloons`, `confetti`,
  `party_hat`, `pumpkin`, `bats`, `cobweb`, `witch_hat`, `tree`, `roof_lights`, `wreath`,
  `snow`, `santa_hat`, `fireworks` (only after dark) and `hearts`. The hats are for the cat.
- `when`: true on its days. `monthDay(d)` is the date as `"MM-DD"`, and `between(d, "12-24",
  "12-26")` covers a run of days (even over the new year).
- `words`: the banner under the clock.

A few more examples:

```js
// Burns Night
{ id: "burns", decor: ["bunting"], when: d => monthDay(d) === "01-25", words: "🥃 Happy Burns Night!" },
// A whole week
{ id: "pride", decor: ["bunting", "confetti"], when: d => between(d, "06-01", "06-07"), words: "🏳️‍🌈 Happy Pride!" },
// A day that moves: the last Friday of July
{ id: "sysadmin", decor: ["balloons"], when: d => d.getMonth() === 6 && d.getDay() === 5 && d.getDate() > 24, words: "🖥️ Happy SysAdmin Day!" },
```

For days that move from year to year (Easter, Diwali, Eid), the simplest way is often a
calendar in Home Assistant. See how the birthday line reads one.

When several fall on the same day, all their decorations go up and every banner shows.

**A new decoration** is a drawing function in `DECOR` in `public/app.js`, named in
`DECOR_NAMES` in `celebrations.js`. The tests check the two lists match. Look at `wreath` for a
small one: it draws SVG shapes into the group it's given, using the house's coordinates (the
ground is at y 1000, and `inRoom("living", x, y)` gives a point in a room).

## The rooms and the things in them

The cottage is drawn in `drawHouse()` in `public/app.js`, one block per room. `ROOMS` at the
top says where each room is, and everything in a room is placed from the room's corner, so a
room can be moved or resized by changing one line. Things in the `detail` class only show
when you're zoomed in.

**Something new to tap** takes three small steps. For example, a second lamp in the bedroom:

1. **The config:** add a setting to `config.example.jsonc` (with a comment) and read it in
   `loadConfig` in `server.mjs`. Check the entity's kind there, like the others.
2. **The helper:** in `house()` in `server.mjs`, read its state in `status()` (sending `null`
   if it isn't there) and add its actions to `ACTIONS`. Each action names exactly which Home
   Assistant service it calls and checks any value it's given. The page never sends an entity
   id itself. That's what stops the page being able to do anything else in your house.
3. **The page:** draw it with `tappable(...)` in its room (look at the bedroom's bedside lamp
   and the living room's `T.lamp`), call `allow(...)` for it in `update()` so it's only
   tappable when the helper says it's there, and give it a card like `openLamp()`.

Then add it to `tests/server.test.mjs`: one check in demo mode and one against the pretend
Home Assistant.

## Changing what Goodnight does

Tapping the bed turns off the lamp and pauses the speaker. For anything more, write a script in
Home Assistant (*Settings > Automations & scenes > Scripts*) and put its id in
`goodnight_script` in the config. For example, a script could:

- turn off the other downstairs lights
- turn the heating down
- dim the tablet (with the Fully Kiosk integration: see [tablet-setup.md](tablet-setup.md))
