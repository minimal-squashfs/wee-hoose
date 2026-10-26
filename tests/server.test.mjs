// The helper: the config, demo mode, and against a pretend Home Assistant. Runs on spare
// ports and never needs a real Home Assistant.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { parseJsonc, loadConfig, startServer } from "../server.mjs";

const quiet = () => {};
const example = parseJsonc(readFileSync(new URL("../config.example.jsonc", import.meta.url), "utf8"));
const servers = [];
after(() => servers.forEach(s => s.close()));

// Starts the helper on a spare port; returns its address
async function helper(opts) {
  const { server } = startServer({ port: 0, log: quiet, ...opts });
  servers.push(server);
  await new Promise(r => server.once("listening", r));
  return `http://127.0.0.1:${server.address().port}`;
}
const getState = base => fetch(base + "/api/state").then(r => r.json());
const post = (base, action, value) => fetch(base + "/api/action", { method: "POST", body: JSON.stringify({ action, value }) })
  .then(async r => [r.status, await r.json()]);

test("the example config reads, with comments and the address's // left alone", () => {
  const c = loadConfig(example, quiet);
  assert.equal(c.url, "http://homeassistant.local:8123");
  assert.equal(c.light.entity, "light.living_room");
  assert.equal(c.speaker.entity, "media_player.speaker");
  assert.equal(c.speaker.favourites.length, 2);
  assert.equal(c.goodnightScript, null);
  assert.equal(c.cat, true);
  assert.equal(loadConfig({ cat: false }, quiet).cat, false);
});

test("entities that aren't set, or are the wrong kind, are left out", () => {
  const warned = [];
  const c = loadConfig({ sun: "", weather: "light.oops", light: { entity: "switch.lamp_plug" }, speaker: {} }, w => warned.push(w));
  assert.equal(c.sun, null);
  assert.equal(c.weather, null);
  assert.equal(c.light.entity, "switch.lamp_plug");                      // a smart plug counts as a light
  assert.equal(c.speaker, null);
  assert.equal(warned.length, 1);
});

test("demo mode: every card shows, taps are remembered, and bad ones are refused", async () => {
  const base = await helper({ config: loadConfig(example, quiet), token: null });
  let s = await getState(base);
  assert.equal(s.mode, "pretend");
  assert.ok(s.light && s.speaker && s.goodnight && s.weather && s.sun);
  assert.deepEqual(s.speaker.favourites, ["Radio", "Chill"]);
  assert.deepEqual(await post(base, "light_on", 40), [200, { ok: true, mode: "pretend" }]);
  assert.equal((await getState(base)).light.brightness, 40);
  assert.equal((await post(base, "light_on", 5))[0], 400);                 // 10 to 100: off is its own button
  assert.equal((await post(base, "volume", 101))[0], 400);
  assert.equal((await post(base, "favourite", 9))[0], 400);
  assert.equal((await post(base, "explode"))[0], 400);
  assert.equal((await post(base, "constructor"))[0], 400);
  await post(base, "favourite", 0);
  s = await getState(base);
  assert.equal(s.speaker.state, "playing");
  await post(base, "goodnight");
  s = await getState(base);
  assert.equal(s.light.on, false);
  assert.equal(s.speaker.state, "paused");
});

test("with nothing set up but the sky, there are no cards and the controls refuse", async () => {
  const base = await helper({ config: loadConfig({ sun: "sun.sun", weather: "weather.home" }, quiet), token: null });
  const s = await getState(base);
  assert.equal(s.light, null);
  assert.equal(s.speaker, null);
  assert.equal(s.goodnight, false);
  assert.equal((await post(base, "light_on"))[0], 404);
  assert.equal((await post(base, "goodnight"))[0], 404);
});

test("the panel's files are served, and nothing outside public/", async () => {
  const base = await helper({ config: loadConfig({}, quiet), token: null });
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<svg id="house"/);
  assert.match((await fetch(base + "/app.js")).headers.get("content-type"), /javascript/);
  const manifest = await fetch(base + "/manifest.webmanifest");                 // the icon, for Add to Home Screen
  assert.match(manifest.headers.get("content-type"), /manifest\+json/);
  for (const icon of (await manifest.json()).icons) assert.equal((await fetch(base + "/" + icon.src)).status, 200, icon.src);
  assert.equal((await fetch(base + "/apple-touch-icon.png")).headers.get("content-type"), "image/png");
  for (const sneaky of ["/../server.mjs", "/%2e%2e/config.example.jsonc", "/..%2fserver.mjs"])
    assert.equal((await fetch(base + sneaky)).status, 404, sneaky);
});

/* ---------- Against a pretend Home Assistant ---------- */
const TOKEN = "pretend-token-not-real";
function pretendHA(states) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body && JSON.parse(body) });
    const reply = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return reply(401, {});
    const state = req.url.match(/^\/api\/states\/(.+)$/);
    if (state) return states[state[1]] ? reply(200, { entity_id: state[1], ...states[state[1]] }) : reply(404, {});
    if (req.url === "/api/config") return reply(200, { latitude: 48.86, longitude: 2.35, location_name: "Pretend" });
    if (req.url.startsWith("/api/calendars/")) return reply(200, [{ summary: "Sam's Birthday" }, { summary: "Bins out" }]);
    if (req.url === "/api/services/media_player/media_pause") return reply(500, {});   // a speaker that's switched off
    if (req.url.startsWith("/api/services/")) return reply(200, []);
    reply(404, {});
  });
  servers.push(server);
  return new Promise(r => server.listen(0, () => r({ url: `http://127.0.0.1:${server.address().port}`, calls })));
}

test("live: reads only the configured entities, hides what's missing, and never gives out the token", async () => {
  const ha = await pretendHA({
    "sun.sun": { state: "above_horizon", attributes: { elevation: 20, rising: false } },
    "weather.home": { state: "rainy", attributes: { temperature: 9.4, temperature_unit: "°C" } },
    "light.living_room": { state: "on", attributes: { brightness: 128, supported_color_modes: ["brightness"] } },
    "light.secret_room": { state: "on", attributes: {} },
  });
  const config = loadConfig({ ...example, home_assistant_url: ha.url + "/", weather: "weather.home", calendar: "calendar.family" }, quiet);
  const base = await helper({ config, token: TOKEN });
  const res = await fetch(base + "/api/state"), text = await res.text(), s = JSON.parse(text);
  assert.ok(!text.includes(TOKEN));
  assert.equal(s.mode, "live");
  assert.deepEqual(s.sun, { elevation: 20, rising: false });
  assert.deepEqual(s.weather, { condition: "rainy", temperature: 9.4, unit: "°C" });
  assert.deepEqual(s.light, { name: "Living room light", on: true, dimmable: true, brightness: 50 });
  assert.equal(s.speaker, null, "media_player.speaker doesn't exist, so its card hides");
  assert.deepEqual(s.birthdays, ["Sam's Birthday"]);
  assert.deepEqual(s.place, { latitude: 49, longitude: 2 });                // whole degrees, and nothing else from HA's settings                       // "birthday" in any case; the bins don't count
  assert.ok(!ha.calls.some(c => c.url.includes("secret_room")));
  assert.ok(ha.calls.every(c => c.auth === `Bearer ${TOKEN}`));
});

test("live: taps become the right service calls, and Goodnight carries on past a failure", async () => {
  const ha = await pretendHA({ "light.living_room": { state: "off", attributes: {} }, "media_player.speaker": { state: "idle", attributes: {} } });
  const config = loadConfig({ ...example, home_assistant_url: ha.url, goodnight_script: "script.bedtime" }, quiet);
  const base = await helper({ config, token: TOKEN });
  const services = () => ha.calls.filter(c => c.method === "POST").map(c => [c.url.replace("/api/services/", ""), c.body]);

  assert.equal((await post(base, "light_on", 30))[0], 200);
  assert.equal((await post(base, "volume", 45))[0], 200);
  assert.equal((await post(base, "favourite", 1))[0], 200);
  const [status, body] = await post(base, "goodnight");
  assert.equal(status, 200);
  assert.equal(body.partly, true);
  assert.deepEqual(services(), [
    ["light/turn_on", { entity_id: "light.living_room", brightness_pct: 30 }],
    ["media_player/volume_set", { entity_id: "media_player.speaker", volume_level: .45 }],
    ["media_player/select_source", { entity_id: "media_player.speaker", source: "Chill playlist" }],
    ["homeassistant/turn_off", { entity_id: "light.living_room" }],
    ["media_player/media_pause", { entity_id: "media_player.speaker" }],
    ["script/turn_on", { entity_id: "script.bedtime" }],
  ]);
  assert.equal((await post(base, "light_on", 40))[0], 429, "too soon after the last one");
});
