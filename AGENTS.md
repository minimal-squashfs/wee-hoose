# Working on Wee Hoose

Instructions for anyone, human or coding agent, changing this repo. What it is and how to set
it up is in `README.md`.

## What it is

A wee hoose for your hallway tablet, joined up with Home Assistant: an illustrated cottage, cut away
to show four rooms, under a sky that follows the sun and the weather. Its lamps come on in the
evening, a cat wanders about, and it dresses up for celebrations. The house is also the
controls: guests tap a room to zoom in, then tap the lamp, the speaker or the bed (Goodnight).
The picture is the point, so keep it cute. There are two tiers:

- **Minimal** (this one, 0.x): one light, one speaker, Goodnight, in a fixed four-room
  cottage. It works with only `sun.sun`, a `weather.*` and a `calendar.*`, and even with none
  of them.
- **Full** (planned): more rooms, TVs and scenes. It builds on the minimal tier and must
  not break it.

## Layout

```
server.mjs              the helper: serves public/, holds the token, and is the only thing that talks to HA
config.example.jsonc    every setting, with comments (copied to config.jsonc, which is gitignored)
public/
  index.html            the page's markup: the house's SVG layers, the header, the card
  app.js                the page: draws the house (SVG), reads /api/state, sends taps to /api/action
  sky.js                pure functions: the sky's phase, the sun by the date, the weather's look, the greeting, the clock's lamps
  celebrations.js       the celebrations list and the decorations' names (pure)
  theme.css             the cosy theme: colours, fonts, sizes, the sky, the house's paint, the cat
  panel.css             layout and animations, using theme.css's names
tests/                  node --test, no packages
docs/                   tablet setup, customising, screenshots
```

- **Config** is `config.jsonc` (JSON with comments), read once at start-up. Every new
  setting goes in `config.example.jsonc` too, with a comment, and is optional.
- **The theme** is `public/theme.css`. Anything someone might want to restyle belongs there as
  a custom property, not hard-coded in `panel.css` or `app.js`.
- **The drawing's layout:** the house is drawn in world units (about 1500 x 900, the ground at
  y 1000). Rooms come from `ROOMS`, and their things are placed from the room's corner with
  `inRoom()`. The header sits over the empty sky on the left, so keep that area clear. Things
  that only show when zoomed in have the `detail` class.

## Rules

- **Never commit personal data or secrets.** No real names, rooms, entity ids, addresses,
  hostnames, IPs, tokens, user names, emails or calendar contents, in code, docs, tests,
  screenshots or commit messages. Use placeholders such as `light.living_room`,
  `media_player.speaker` and `homeassistant.local`. `config.jsonc` and `secrets/` are
  gitignored. Keep it that way.
- **The token never reaches the browser.** Only `server.mjs` uses it. `/api/state` sends
  only what the page needs to draw.
- **The helper is the gatekeeper.** It only reads and changes the entities in the config,
  through the actions in `ACTIONS`, with checked values. Don't add a route that passes an
  entity or service through from the page.
- **The minimal tier must keep working with only `sun`, `weather` and `calendar`**, or with
  nothing at all (a clock and a sky).
- **Missing things fade into the picture.** If an entity isn't set, doesn't exist or is
  `unavailable`, the helper sends `null` for it. The thing in the house then stops being
  tappable (the lamp just follows the clock, the bed is just a bed) or isn't drawn (the
  speaker), and nothing else breaks.
- **No build step and no packages.** Plain HTML, CSS and ES modules, and Node's own
  modules on the server.
- **Mind reduced motion.** Nothing animates when the tablet asks for less motion.
- **Everything tappable is keyboard-reachable** (`tappable()` does this) and its card traps focus.

## Running and testing

```sh
node server.mjs                     # http://localhost:8080/, in demo mode until there's a config and a token
PORT=8090 node server.mjs           # another port
node --test "tests/*.test.mjs"      # all the tests, about a second
```

- `tests/panel.test.mjs` runs the page's pure code: the sky, the weather, the clock's lamps and
  the celebrations. It also checks that every decoration a celebration asks for is drawn in `DECOR`.
- `tests/server.test.mjs` runs the helper in demo mode and against a pretend Home Assistant.
  It checks that missing things come back as `null`, which calls reach HA, and that the token
  isn't sent to the page.
- When you add a celebration, a decoration or an action, add it to the tests.
- To see a day or weather without waiting: `?date=2026-12-25&time=21:00&weather=snowy&celebrate=birthday&room=living`.
- The tests can't show how it looks. Look at it in a browser, at a landscape tablet size
  (about 1000 x 600), by day and by night, before you call a visual change done.
- If a change alters the picture, retake the README's screenshots in `docs/screenshots/`:
  1340 x 800, in demo mode, with `?date=2026-10-26&time=13:00` (day.png),
  `?date=2026-10-26&time=22:10&weather=snowy` (night.png),
  `?date=2026-10-26&celebrate=birthday&time=16:00&weather=sunny` (birthday.png) and
  `?room=living&date=2026-12-25&time=20:00` (room.png).

## House style

- UK English (colour, favourite, centre).
- Plain, friendly language in the docs and on the panel: short sentences, no jargon a guest
  wouldn't know. Messages on the panel say what happened, not what went wrong inside.
- Code comments explain *why*, in the same plain style.
- Keep `CHANGELOG.md` up to date with each change people would notice.
