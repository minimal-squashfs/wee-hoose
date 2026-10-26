// Wee Hoose's helper. It serves the panel (public/) and is the only thing that talks
// to Home Assistant. The token stays here and never reaches the browser, and only the entities
// named in the config file can be read or changed, whatever the page asks for. (A Home
// Assistant token can call any service, so this list is the real guard.)
//
// With no Home Assistant address, no token, or no config.jsonc yet, it runs in demo mode: a
// pretend house that remembers taps for a while, so the panel can be tried with nothing set up.
//
// Needs Node 20 or newer, and no packages. Settings from the environment:
//   PORT           where to serve the panel (8080)
//   CONFIG_FILE    the config (config.jsonc, next to this file)
//   HA_TOKEN       Home Assistant's long-lived token, or...
//   HA_TOKEN_FILE  ...a file holding it (secrets/ha-token, next to this file)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sunAt } from "./public/sky.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = resolve(HERE, "public");

/* ---------- The config ---------- */

// JSON with // and /* */ comments allowed (strings, with any // in them, are left alone)
export const parseJsonc = text => JSON.parse(text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s) => s || ""));

// Each kind of entity, and the domains it may be. Anything else is treated as not set.
const DOMAINS = { sun: ["sun"], weather: ["weather"], calendar: ["calendar"], light: ["light", "switch"], speaker: ["media_player"], goodnight_script: ["script"] };
const entityOk = (id, kind) => typeof id === "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(id) && DOMAINS[kind].includes(id.split(".")[0]);

// The config as the helper uses it: every entity checked, and null wherever it's not set
export function loadConfig(raw, warn = console.warn) {
  const pick = (id, kind) => {
    if (!id) return null;
    if (entityOk(id, kind)) return id;
    warn(`Config: "${id}" isn't a ${DOMAINS[kind].join(" or ")} entity, so ${kind} is left out.`);
    return null;
  };
  const text = (v, fallback = "") => (typeof v === "string" ? v.slice(0, 120) : fallback);
  const favourites = (Array.isArray(raw.speaker?.favourites) ? raw.speaker.favourites : [])
    .filter(f => f && typeof f.name === "string" && (typeof f.source === "string" || typeof f.media_content_id === "string"))
    .slice(0, 6);
  return {
    url: text(raw.home_assistant_url).replace(/\/$/, ""),
    welcome: text(raw.welcome),
    sun: pick(raw.sun, "sun"),
    weather: pick(raw.weather, "weather"),
    calendar: pick(raw.calendar, "calendar"),
    birthdayMatch: text(raw.birthday_match, "birthday").toLowerCase(),
    light: pick(raw.light?.entity, "light") && { entity: raw.light.entity, name: text(raw.light.name, "Light") },
    speaker: pick(raw.speaker?.entity, "speaker") && { entity: raw.speaker.entity, name: text(raw.speaker.name, "Music"), favourites },
    goodnightScript: pick(raw.goodnight_script, "goodnight_script"),
    cat: raw.cat !== false,
  };
}

/* ---------- Home Assistant, or the pretend house ---------- */

export function house({ config, token, log = console.log, fetchImpl = fetch }) {
  const live = !!(config.url && token);
  const entities = [config.sun, config.weather, config.light?.entity, config.speaker?.entity].filter(Boolean);

  async function ha(method, path, body) {
    const r = await fetchImpl(config.url + path, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    if (r.status === 404) return undefined;                  // no such entity
    if (!r.ok) throw new Error(`Home Assistant said ${r.status}`);
    return r.json();
  }

  // Live: the states, read at most every 10 seconds however many screens ask, and the
  // calendar every 15 minutes. undefined means it doesn't exist; null, no answer.
  let states = {}, statesAt = 0, ok = true, birthdays = [], calendarAt = 0, place = null, placeAt = 0;
  // Where the house is, from Home Assistant's own settings, for working out the sun when the
  // page has no sun.sun to go by (previews, say). Whole degrees are plenty, and say less.
  async function readPlace() {
    if (place || Date.now() - placeAt < 3600e3) return;          // asked once, then hourly if it didn't answer
    placeAt = Date.now();
    const c = await ha("GET", "/api/config").catch(() => null);
    if (Number.isFinite(c?.latitude) && Number.isFinite(c?.longitude)) place = { latitude: Math.round(c.latitude), longitude: Math.round(c.longitude) };
  }
  async function readStates() {
    if (Date.now() - statesAt < 10e3) return;
    statesAt = Date.now();
    const got = await Promise.all(entities.map(e => ha("GET", `/api/states/${e}`).catch(() => null)));
    ok = entities.length === 0 || got.some(g => g !== null);
    states = Object.fromEntries(entities.map((e, i) => [e, got[i] === null ? states[e] : got[i]]));   // keep the last answer through a hiccup
  }
  async function readBirthdays() {
    if (!config.calendar || Date.now() - calendarAt < 15 * 60e3) return;
    calendarAt = Date.now();
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    const q = `start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`;
    const events = await ha("GET", `/api/calendars/${config.calendar}?${q}`).catch(() => null);
    if (events === null) { calendarAt = 0; return; }             // try again next time
    birthdays = (events || []).map(e => String(e.summary || "").slice(0, 60))
      .filter(t => t && t.toLowerCase().includes(config.birthdayMatch)).slice(0, 4);
  }

  // The pretend house: a light, a speaker, a mild partly cloudy day, and the sun worked out from the date
  const pretend = {
    light: { on: true, brightness: 60 }, speaker: { state: "paused", volume: 30, title: null },
  };


  const pct = b => Math.max(10, Math.round((b / 255) * 10) * 10);   // HA's 0 to 255, as 10% steps (on is never 0%)
  async function status() {
    const base = { welcome: config.welcome, cat: config.cat, goodnight: !!(config.light || config.speaker || config.goodnightScript) };
    if (!live) return {
      ...base, mode: "pretend", ok: true, birthdays: [],
      sun: config.sun ? sunAt(new Date()) : null,
      weather: config.weather ? { condition: "partlycloudy", temperature: 14 } : null,
      light: config.light && { name: config.light.name, dimmable: config.light.entity.startsWith("light."), ...pretend.light },
      speaker: config.speaker && { name: config.speaker.name, favourites: config.speaker.favourites.map(f => f.name), ...pretend.speaker },
    };
    await Promise.all([readStates(), readBirthdays(), readPlace()]);
    const s = e => (e ? states[e] : undefined);
    const sun = s(config.sun), w = s(config.weather), l = s(config.light?.entity), m = s(config.speaker?.entity);
    const there = x => x && x.state !== "unavailable";
    return {
      ...base, mode: "live", ok, birthdays, ...(place ? { place } : {}),
      sun: sun ? { elevation: sun.attributes?.elevation, rising: !!sun.attributes?.rising } : null,
      weather: there(w) ? { condition: w.state, temperature: w.attributes?.temperature, unit: w.attributes?.temperature_unit } : null,
      light: there(l) ? {
        name: config.light.name, on: l.state === "on",
        dimmable: l.entity_id.startsWith("light.") && !(l.attributes?.supported_color_modes || []).every(c => c === "onoff"),
        brightness: l.state === "on" && Number.isFinite(l.attributes?.brightness) ? pct(l.attributes.brightness) : l.state === "on" ? 100 : 0,
      } : null,
      speaker: there(m) ? {
        name: config.speaker.name, state: m.state, title: m.attributes?.media_title || null,
        volume: Number.isFinite(m.attributes?.volume_level) ? Math.round(m.attributes.volume_level * 100) : null,
        favourites: config.speaker.favourites.map(f => f.name),
      } : null,
    };
  }

  // What each action may do: what it needs, how often it may run (ms, per screen), and the
  // Home Assistant calls it makes, as [domain, service, data]. A check returns an error, or nothing.
  const pctOk = v => Number.isInteger(v) && v >= 0 && v <= 100;
  const L = () => config.light?.entity, M = () => config.speaker?.entity;
  const ACTIONS = {
    light_on: { needs: L, every: 300, check: v => (v === undefined || (pctOk(v) && v >= 10) ? null : "Brightness is 10 to 100."),
      calls: v => [L().startsWith("light.") && v !== undefined ? ["light", "turn_on", { entity_id: L(), brightness_pct: v }] : ["homeassistant", "turn_on", { entity_id: L() }]],
      pretend: v => Object.assign(pretend.light, { on: true, brightness: v ?? (pretend.light.brightness || 100) }) },
    light_off: { needs: L, every: 300, calls: () => [["homeassistant", "turn_off", { entity_id: L() }]],
      pretend: () => Object.assign(pretend.light, { on: false }) },
    play: { needs: M, every: 500, calls: () => [["media_player", "media_play", { entity_id: M() }]],
      pretend: () => Object.assign(pretend.speaker, { state: "playing" }) },
    pause: { needs: M, every: 500, calls: () => [["media_player", "media_pause", { entity_id: M() }]],
      pretend: () => Object.assign(pretend.speaker, { state: "paused" }) },
    volume: { needs: M, every: 300, check: v => (pctOk(v) ? null : "Volume is 0 to 100."),
      calls: v => [["media_player", "volume_set", { entity_id: M(), volume_level: v / 100 }]],
      pretend: v => Object.assign(pretend.speaker, { volume: v }) },
    favourite: { needs: M, every: 1000, check: v => (Number.isInteger(v) && config.speaker?.favourites[v] ? null : "No such favourite."),
      calls: v => {
        const f = config.speaker.favourites[v];
        return [f.source ? ["media_player", "select_source", { entity_id: M(), source: f.source }]
          : ["media_player", "play_media", { entity_id: M(), media_content_id: f.media_content_id, media_content_type: f.media_content_type || "music" }]];
      },
      pretend: v => Object.assign(pretend.speaker, { state: "playing", title: config.speaker.favourites[v].name }) },
    goodnight: { needs: () => config.light || config.speaker || config.goodnightScript, every: 3000,
      calls: () => [L() && ["homeassistant", "turn_off", { entity_id: L() }], M() && ["media_player", "media_pause", { entity_id: M() }],
        config.goodnightScript && ["script", "turn_on", { entity_id: config.goodnightScript }]].filter(Boolean),
      pretend: () => { pretend.light.on = false; if (pretend.speaker.state === "playing") pretend.speaker.state = "paused"; } },
  };

  const last = new Map();                      // `${who} ${action}`: when it last ran
  // Runs one action. Returns [status, body] for the helper to send.
  async function run(who, body) {
    const a = Object.hasOwn(ACTIONS, body?.action) ? ACTIONS[body.action] : null;   // not "constructor" and the like
    if (!a) return [400, { error: "No such action." }];
    if (!a.needs()) return [404, { error: "That isn't set up on this panel." }];
    const problem = a.check?.(body.value);
    if (problem) return [400, { error: problem }];
    const key = `${who} ${body.action}`;
    if (Date.now() - (last.get(key) || 0) < a.every) return [429, { error: "One moment..." }];
    last.set(key, Date.now());
    const calls = a.calls(body.value);
    if (!live) {
      log("Pretend:", calls.map(([d, s, data]) => `${d}.${s} ${JSON.stringify(data)}`).join("; "));
      a.pretend(body.value);
      return [200, { ok: true, mode: "pretend" }];
    }
    // One at a time, in order. Goodnight carries on past one that fails (a speaker that's off
    // can't pause), but says so
    const results = [];
    for (const [d, s, data] of calls) results.push(await ha("POST", `/api/services/${d}/${s}`, data).then(() => "ok", () => "failed"));
    statesAt = 0;                                // read again next time, to show the change
    if (!results.includes("ok")) return [503, { error: "Home Assistant isn't answering just now." }];
    return [200, { ok: true, mode: "live", ...(results.includes("failed") ? { partly: true } : {}) }];
  }
  return { status, run, live };
}

/* ---------- Serving it ---------- */

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let text = "";
  for await (const chunk of req) { text += chunk; if (text.length > 2000) throw new Error("too big"); }
  return JSON.parse(text || "{}");
}
async function serveFile(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(PUBLIC, path || "index.html");
  if (!file.startsWith(PUBLIC + sep) && file !== PUBLIC) return send(res, 404, { error: "Not found." });
  try {
    const data = await readFile(file.endsWith(sep) ? join(file, "index.html") : file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch { send(res, 404, { error: "Not found." }); }
}

export function startServer({ port = 8080, config, token, log = console.log, fetchImpl } = {}) {
  const h = house({ config, token, log, fetchImpl });
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/api/state") return send(res, 200, await h.status());
      if (req.method === "POST" && req.url === "/api/action") {
        const [status, body] = await h.run(req.socket.remoteAddress, await readBody(req).catch(() => null));
        return send(res, status, body);
      }
      if (req.url.startsWith("/api/")) return send(res, 404, { error: "Not found." });
      if (req.method === "GET" || req.method === "HEAD") return await serveFile(req, res);
      send(res, 405, { error: "Not allowed." });
    } catch (err) {
      log("Oops:", err.message);
      send(res, 500, { error: "Something went wrong." });
    }
  });
  server.listen(port);
  return { server, live: h.live };
}

// Run directly (node server.mjs): read the config and the token, and start
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const configFile = process.env.CONFIG_FILE || join(HERE, "config.jsonc");
  const haveConfig = existsSync(configFile);
  const raw = parseJsonc(readFileSync(haveConfig ? configFile : join(HERE, "config.example.jsonc"), "utf8"));
  const config = loadConfig(raw);
  const tokenFile = process.env.HA_TOKEN_FILE || join(HERE, "secrets", "ha-token");
  const token = haveConfig ? (process.env.HA_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8") : "")).trim() || null : null;
  const port = Number(process.env.PORT) || 8080;
  const { live } = startServer({ port, config, token });
  console.log(`Wee Hoose on http://localhost:${port}/ ` + (live ? `joined up to ${config.url}.`
    : !haveConfig ? "in demo mode (no config.jsonc yet: copy config.example.jsonc to start)."
    : !config.url ? "in demo mode (no home_assistant_url in the config)." : "in demo mode (no token: see README.md)."));
}
