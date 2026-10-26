/* =====================================================================
   The panel: a little cottage, cut away so you can see into its four rooms, under a sky
   that follows the sun and the weather. Its lamps glow in the evening, a cat wanders from
   room to room, and it dresses up for birthdays and holidays. Tap a room to look inside;
   the controls are things in the rooms: the living room's lamp and speaker, and the bed
   for Goodnight.

   It reads the house from the helper (server.mjs) every 20 seconds and sends taps back. It
   never talks to Home Assistant itself and never sees the token.

   To try any day: ?date=2026-12-25&time=21:30&weather=snowy&celebrate=birthday&room=living
   (a preview never changes anything in the house).
   ===================================================================== */
import { skyPhase, weatherFor, weatherWords, greeting, lampsFor, tvOn } from "./sky.js";
import { celebrationsToday } from "./celebrations.js";

const Q = new URLSearchParams(location.search);
const NS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PREVIEW = ["date", "time", "weather", "celebrate", "room"].some(k => Q.has(k));
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).split(",").map(s => s.trim());
const paint = name => `fill:var(${name})`;            // a colour from theme.css

/* ---------- When it is: real, or set by the address for trying things out ---------- */
function now() {
  const d = new Date();
  const [y, m, day] = (Q.get("date") || "").split("-").map(Number);
  if (day) d.setFullYear(y, m - 1, day);
  const [h, min] = (Q.get("time") || "").split(":").map(Number);
  if (Q.has("time") && Number.isFinite(h)) d.setHours(h, min || 0, 0);
  return d;
}
const season = d => ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][d.getMonth()];

/* ---------- Talking to the helper ---------- */
let state = null;                    // the house as the helper last said, or null if it hasn't answered
async function refresh() {
  if (document.visibilityState === "hidden") return;    // only while someone can see it
  const s = await fetch("api/state").then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (s) state = s;
  else if (state) state.ok = false;
  update();
}
// Sends one tap. Returns true if it worked; if not, the toast says why.
async function act(action, value) {
  if (PREVIEW) { say("Just a preview, so nothing changed."); return false; }
  const r = await fetch("api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, value }) })
    .then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) })).catch(() => ({ status: 0, data: {} }));
  if (r.status === 200) { setTimeout(refresh, 1000); return true; }
  say(r.data.error || "Home Assistant isn't answering just now.");
  return false;
}
// Changes the picture straight away, then puts it back if the house said no
async function change(what, edit, action, value) {
  if (!state?.[what]) return false;
  const was = { ...state[what] };
  Object.assign(state[what], edit);
  update();
  if (await act(action, value)) return true;
  state[what] = was; update();
  return false;
}
let toastTimer = 0;
function say(text) {
  $("toast").textContent = text; $("toast").hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}

/* =====================================================================
   The drawing. The cottage stands on the ground at y 1000, with the garden and the header's
   patch of sky on its left and the tree on its right. Rooms are laid out from ROOMS below
   (x, y, width, height, wall colour), and each room's things are placed from its own corner,
   so a room can be moved or resized by changing one line.
   ===================================================================== */
const ROOMS = {
  //            x    y    w    h   wall
  bedroom:  [ 600, 520, 340, 240, "--wall-bedroom"],
  bathroom: [ 940, 520, 280, 240, "--wall-bathroom"],
  living:   [ 600, 760, 360, 240, "--wall-living"],
  kitchen:  [ 960, 760, 260, 240, "--wall-kitchen"],
};
const ROOM_SAID = { bedroom: "The bedroom", bathroom: "The bathroom", living: "The living room", kitchen: "The kitchen" };
const ROOF = { left: 568, right: 1252, eaves: 526, apexX: 910, apexY: 320 };
const WALLS = { left: 588, right: 1232 };      // the house's outside walls, either side of the rooms
const ROOF_EDGE = [[ROOF.left, ROOF.eaves], [ROOF.apexX, ROOF.apexY], [ROOF.right, ROOF.eaves]];
const inRoom = (id, dx, dy = 0) => [ROOMS[id][0] + dx, ROOMS[id][1] + dy];
const sky = $("sky"), garden = $("garden"), building = $("building"), decor = $("decor");
const wb = $("weatherBack"), wf = $("weatherFront"), overlay = $("overlay");
const R = {};                                  // each room: its lamp glow and dark cover
const T = {};                                  // the things you can tap, to switch on and off as the house allows

function drawSky() {
  el("rect", { id: "skyRect", x: -1500, y: -1600, width: 4500, height: 2800, fill: "#7ec4ee" }, sky);
  const sun = el("g", { id: "sun" }, sky);
  el("circle", { cx: 1420, cy: 250, r: 36, fill: "#ffd75e" }, sun);
  const moon = el("g", { id: "moon" }, sky);
  el("circle", { cx: 1410, cy: 250, r: 26, fill: "#f5f1d6" }, moon);
  el("circle", { cx: 1423, cy: 241, r: 24, fill: "#0d1634", id: "moonShade" }, moon);
  const stars = el("g", { id: "stars" }, sky);
  for (let i = 0; i < 26; i++) el("circle", { cx: (i * 157) % 1500, cy: 180 + (i * 89) % 320, r: 1.8, fill: "#fff", class: "twinkle", style: `animation-delay:${-i * .4}s` }, stars);
  const clouds = el("g", { id: "clouds" }, sky);
  [[200, ""], [270, "slow"], [390, ""], [330, "slow"], [230, ""], [430, "slow"]].forEach(([y, cls], i) => {   // each crosses the sky from off one side to off the other
    const c = el("g", { class: "drift " + cls, style: `animation-delay:${-[10, 70, 75, 150, 110, 30][i]}s` }, clouds);
    const g = el("g", { transform: `translate(0 ${y})` }, c);
    el("ellipse", { cx: 0, cy: 20, rx: 50, ry: 19, fill: "#ffffff", opacity: .92 }, g);
    el("ellipse", { cx: 28, cy: 8, rx: 32, ry: 21, fill: "#ffffff", opacity: .92 }, g);
    el("ellipse", { cx: -24, cy: 10, rx: 24, ry: 16, fill: "#ffffff", opacity: .92 }, g);
  });
}

function drawGarden() {
  // Hills in the distance
  el("path", { d: "M-1500 1000 V930 Q-200 860 260 905 T980 900 T1700 890 T3000 900 V1000 Z", fill: "#9cc98a" }, garden);
  el("path", { d: "M-1500 1000 V960 Q100 905 520 950 T1500 945 T3000 950 V1000 Z", fill: "#8bbf78" }, garden);
  // The tree, on the right, as tall as the house, changing with the seasons
  const tree = el("g", { id: "tree" }, garden);
  el("path", { d: "M1376 1000 C1382 880 1372 720 1382 600 L1402 600 C1410 720 1402 880 1408 1000 Z", fill: "#7a5236" }, tree);
  el("path", { d: "M1390 740 L1336 650 M1392 700 L1450 620 M1388 640 L1370 540", stroke: "#7a5236", "stroke-width": 11, "stroke-linecap": "round" }, tree);
  [[1392, 520, 80], [1325, 575, 54], [1460, 575, 52], [1392, 440, 66], [1332, 480, 50], [1450, 482, 48], [1392, 615, 56]]
    .forEach(([x, y, r]) => el("circle", { cx: x, cy: y, r, class: "leafball" }, tree));
  el("g", { id: "blossom" }, tree);
  el("g", { id: "falling" }, wf);
  el("rect", { x: -1500, y: 998, width: 4500, height: 1500, style: paint("--grass"), id: "grass" }, garden);
  el("rect", { x: -1500, y: 998, width: 4500, height: 6, fill: "#000", opacity: .08 }, garden);
  // A picket fence along the front garden, its rails behind the pickets
  el("rect", { x: 24, y: 962, width: 552, height: 6, fill: "#e6dfd2" }, garden); el("rect", { x: 24, y: 984, width: 552, height: 6, fill: "#e6dfd2" }, garden);
  for (let x = 24; x <= 562; x += 22) el("path", { d: `M${x} 1000 V952 l7 -8 l7 8 V1000 Z`, fill: "#f4efe6" }, garden);
  // The path to the front door
  const door = ROOMS.living[0] + 44;
  el("path", { d: `M${door - 34} 1000 L${door - 50} 1050 H${door + 50} L${door + 34} 1000 Z`, fill: "#d9c7a5" }, garden);
  // A bird bath
  el("rect", { x: 292, y: 930, width: 12, height: 70, fill: "#c9c3b8" }, garden);
  el("path", { d: "M264 930 q34 22 68 0 z", fill: "#d9d4ca" }, garden); el("rect", { x: 266, y: 926, width: 64, height: 5, rx: 2, fill: "#8fd0f5" }, garden);
  el("rect", { x: 282, y: 996, width: 32, height: 6, rx: 2, fill: "#c9c3b8" }, garden);
  // Flowers in front of the fence, and by the house
  const flowers = el("g", { id: "flowers" }, garden);
  [...Array(18).keys()].map(i => [[60, 380, 1262][Math.floor(i / 6)] + (i % 6) * 20, i]).forEach(([x, i]) => {
    el("line", { x1: x, y1: 1000, x2: x, y2: 987, stroke: "#4c8a3f", "stroke-width": 2 }, flowers);
    el("circle", { cx: x, cy: 985, r: 4.5, fill: ["#f28ab2", "#ffd75e", "#b38be0"][i % 3] }, flowers);
  });
}

// A room from ROOMS: walls, floor, and the dark cover and lamp glow the lighting uses.
// Returns a group for its things and the room's corner, so things are placed relative to it.
function room(id, lamp) {
  const [x, y, w, h, wall] = ROOMS[id];
  const g = el("g", { id, "data-room": id }, building);
  g.addEventListener("click", e => { e.stopPropagation(); if (VIEW.room !== id) zoomTo(id); });
  el("rect", { x, y, width: w, height: h, style: paint(wall) }, g);
  el("rect", { x, y: y + h - 14, width: w, height: 14, fill: "#a87452" }, g);
  const things = el("g", { class: "things" }, g);
  const dark = el("rect", { x, y, width: w, height: h, fill: "#0b1030", opacity: 0, class: "fade", "pointer-events": "none" }, g);
  const glow = el("ellipse", { cx: x + lamp[0], cy: y + lamp[1], rx: w * .8, ry: h * .7, fill: "url(#lampGlow)", opacity: 0, class: "fade", "pointer-events": "none" }, g);
  R[id] = { dark, glow };
  return [things, x, y, w, h];
}
// Something you can tap: a group with an invisible hit box. Tapped from the whole house, it
// zooms into its room first; tapped in its room, it does its thing.
function tappable(parent, box, label, onTap, { caption } = {}) {
  const g = el("g", { class: "tap", tabindex: 0, role: "button", "aria-label": label }, parent);
  el("rect", { class: "hit", x: box[0], y: box[1], width: box[2], height: box[3], rx: 8 }, g);
  const go = () => { const r = g.closest("[data-room]")?.dataset.room; if (r && VIEW.room !== r) zoomTo(r); else onTap(); };
  g.addEventListener("click", e => { e.stopPropagation(); if (g.dataset.off !== "true") go(); });
  g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  // The caption: what it does, just above it and kept inside its room, seen close up
  const what = caption || (label.split(":")[1] || label).trim(), half = what.length * 1.8 + 2;
  const rm = ROOMS[parent.closest("[data-room]")?.dataset.room];
  let cx = box[0] + box[2] / 2;
  if (rm) cx = Math.min(Math.max(cx, rm[0] + half + 2), rm[0] + rm[2] - half - 2);
  g.caption = el("text", { class: "detail caption", x: cx, y: box[1] - 3, "text-anchor": "middle" }, parent);
  g.caption.textContent = what[0].toUpperCase() + what.slice(1);
  return g;
}
// A tappable thing the house hasn't got (no light set up, say): drawn, but not tappable
function allow(g, on) {
  g.dataset.off = !on;
  g.classList.toggle("tap", on);
  g.setAttribute("tabindex", on ? 0 : -1);
  g.setAttribute("aria-hidden", !on);
  g.caption.style.display = on ? "" : "none";
}

/* ---------- Zooming into a room, and back out to the whole house ---------- */
const WHOLE = [0, 200, 1500, 900];
const VIEW = { box: [...WHOLE], room: null, anim: 0 };
function setBox(b) { $("house").setAttribute("viewBox", b.map(v => v.toFixed(1)).join(" ")); VIEW.box = b; }
// A room's box, a little margin round it, widened or heightened to the screen's shape
function roomBox(id) {
  let [x, y, w, h] = ROOMS[id];
  x -= 14; y -= 14; w += 28; h += 28;
  const svg = $("house"), ratio = (svg.clientWidth / svg.clientHeight) || (5 / 3);
  if (w / h < ratio) { const nw = h * ratio; x -= (nw - w) / 2; w = nw; } else { const nh = w / ratio; y -= (nh - h) / 2; h = nh; }
  return [x, y, w, h];
}
function zoomTo(id) {
  const to = id ? roomBox(id) : WHOLE, from = [...VIEW.box], t0 = performance.now(), dur = reduce ? 0 : 500;
  document.querySelectorAll("[data-room].current").forEach(r => r.classList.remove("current"));
  if (id) document.querySelector(`[data-room="${id}"]`).classList.add("current");
  VIEW.room = id; $("whole").hidden = !id;
  document.body.classList.toggle("zoomed", !!id);
  $("news").textContent = id ? `${ROOM_SAID[id]}. Tap something in it, or Whole house to go back.` : "The whole house";
  cancelAnimationFrame(VIEW.anim);
  const step = t => {
    const k = dur ? Math.min(1, (t - t0) / dur) : 1, e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    setBox(from.map((v, i) => v + (to[i] - v) * e));
    if (k < 1) VIEW.anim = requestAnimationFrame(step);
  };
  VIEW.anim = requestAnimationFrame(step);
}
$("whole").addEventListener("click", () => zoomTo(null));
$("house").addEventListener("click", () => { if (VIEW.room) zoomTo(null); });          // a tap outside the room
addEventListener("keydown", e => { if (e.key === "Escape" && VIEW.room && $("card").hidden) zoomTo(null); });
addEventListener("resize", () => setBox(VIEW.room ? roomBox(VIEW.room) : [...WHOLE]));

/* ---------- Bits of furniture ---------- */
// A window onto the weather: its pane takes the sky's colour, and rain streaks it when it's raining
function windowPane(parent, x, y, w, h) {
  el("rect", { x: x - 5, y: y - 5, width: w + 10, height: h + 10, rx: 4, fill: "#ffffff" }, parent);
  el("rect", { x, y, width: w, height: h, rx: 2, fill: "#7ec4ee", class: "pane" }, parent);
  const streaks = el("g", { class: "paneRain" }, parent);
  for (let i = 0; i < 5; i++) el("line", { x1: x + 6 + i * (w - 12) / 4, y1: y + 6 + (i % 2) * 10, x2: x + 3 + i * (w - 12) / 4, y2: y + 18 + (i % 2) * 10, stroke: "#e6f0fb", "stroke-width": 1.5, "stroke-linecap": "round", opacity: .8 }, streaks);
  el("rect", { x: x + w / 2 - 1.5, y, width: 3, height: h, fill: "#ffffff" }, parent);
  el("rect", { x: x - 8, y: y + h + 4, width: w + 16, height: 5, rx: 2, fill: "#ffffff" }, parent);
}
// A standing lamp, its shade lighting up with the room
function standLamp(parent, x, floorY, height, shade = "#f3e3c3") {
  el("rect", { x: x - 2, y: floorY - height, width: 4, height, fill: "#555" }, parent);
  el("ellipse", { cx: x, cy: floorY, rx: 10, ry: 3, fill: "#555" }, parent);
  el("path", { d: `M${x - 14} ${floorY - height} h28 l-6 -18 h-16 z`, fill: shade, "data-off": shade, class: "shade" }, parent);
}
// A light hanging from the ceiling
function pendant(parent, cx, top, len, shade = "#f3e3c3") {
  el("rect", { x: cx - 1, y: top, width: 2, height: len, fill: "#555" }, parent);
  el("path", { d: `M${cx - 12} ${top + len + 12} h24 l-5 -12 h-14 z`, fill: shade, "data-off": shade, class: "shade" }, parent);
}

function drawHouse() {
  const { left, right, eaves, apexX, apexY } = ROOF;
  // The walls, the chimney and the roof
  el("rect", { x: WALLS.left, y: 512, width: WALLS.right - WALLS.left, height: 492, style: paint("--brick"), rx: 4 }, building);
  el("rect", { x: 1110, y: 350, width: 50, height: 120, fill: "#9a5a46" }, building);
  for (let i = 0; i < 3; i++) el("rect", { x: 1113, y: 362 + i * 18, width: 44, height: 2, fill: "#86493a" }, building);
  el("rect", { x: 1104, y: 340, width: 62, height: 12, fill: "#7a4334" }, building);
  el("rect", { x: 1116, y: 324, width: 14, height: 18, fill: "#c0662f" }, building); el("rect", { x: 1140, y: 328, width: 14, height: 14, fill: "#c0662f" }, building);
  el("polygon", { points: `${left},${eaves} ${apexX},${apexY} ${right},${eaves}`, style: paint("--roof"), id: "roof" }, building);
  for (let i = 1; i < 6; i++) {                                                                  // rows of tiles
    const t = i / 6, y = apexY + (eaves - apexY) * t;
    el("line", { x1: apexX - (apexX - left) * t, y1: y, x2: apexX + (right - apexX) * t, y2: y, style: "stroke:var(--roof-lines)", "stroke-width": 2 }, building);
  }
  el("circle", { cx: apexX, cy: 440, r: 40, fill: "#f3e3c3", style: "stroke:var(--roof-lines)", "stroke-width": 4, class: "pane" }, building);   // a round window in the roof
  el("line", { x1: apexX - 40, y1: 440, x2: apexX + 40, y2: 440, style: "stroke:var(--roof-lines)", "stroke-width": 2 }, building);
  el("line", { x1: apexX, y1: 400, x2: apexX, y2: 480, style: "stroke:var(--roof-lines)", "stroke-width": 2 }, building);

  /* ---- Upstairs ---- */
  { // The bedroom: the bed (tap it for Goodnight), a chest of drawers under the window, a bedside lamp
    const [g, x, y, , h] = room("bedroom", [320, 190]), fl = y + h - 14;
    windowPane(g, x + 30, y + 48, 54, 58);
    el("rect", { x: x + 14, y: fl - 56, width: 86, height: 56, rx: 3, fill: "#a8795a" }, g);                 // the chest of drawers
    [0, 1, 2].forEach(i => { el("rect", { x: x + 19, y: fl - 51 + i * 17, width: 76, height: 13, rx: 2, fill: "#b98b6a" }, g); el("circle", { cx: x + 57, cy: fl - 44.5 + i * 17, r: 2, fill: "#e7c98c" }, g); });
    el("rect", { x: x + 190, y: y + 62, width: 66, height: 46, rx: 2, fill: "#8a5a3e" }, g);                 // a picture of the hills over the bed
    el("rect", { x: x + 194, y: y + 66, width: 58, height: 38, fill: "#bfe3f7" }, g);
    el("path", { d: `M${x + 194} ${y + 104} l15 -17 l13 10 l11 -8 l19 15 z`, fill: "#4c8a3f" }, g);
    T.bed = tappable(g, [x + 146, fl - 82, 160, 82], "The bed: goodnight", openGoodnight);
    el("rect", { x: x + 288, y: fl - 78, width: 12, height: 78, rx: 4, fill: "#8a5a3e" }, T.bed);          // headboard, frame and legs
    el("rect", { x: x + 150, y: fl - 28, width: 146, height: 20, rx: 3, fill: "#8a5a3e" }, T.bed);
    el("rect", { x: x + 152, y: fl - 8, width: 6, height: 8, fill: "#6d4a33" }, T.bed);
    el("rect", { x: x + 152, y: fl - 42, width: 140, height: 16, rx: 5, fill: "#ffffff" }, T.bed);          // mattress, duvet, pillow
    el("rect", { x: x + 150, y: fl - 46, width: 116, height: 22, rx: 8, fill: "#6f97b8" }, T.bed);
    el("rect", { x: x + 268, y: fl - 54, width: 22, height: 13, rx: 5, fill: "#ffffff" }, T.bed);
    el("rect", { x: x + 306, y: fl - 36, width: 28, height: 36, rx: 2, fill: "#a8795a" }, g);                // the bedside table and its lamp
    el("rect", { x: x + 317, y: fl - 44, width: 6, height: 8, fill: "#8a6f5a" }, g);
    el("path", { d: `M${x + 312} ${fl - 44} h16 l-4 -14 h-8 z`, fill: "#c9a7f2", "data-off": "#c9a7f2", class: "shade" }, g);
    { const d = el("g", { class: "detail" }, g);                                                   // close up: slippers, a book, a plant on the drawers
      el("ellipse", { cx: x + 200, cy: fl - 2, rx: 9, ry: 3.5, fill: "#f28ab2" }, d); el("ellipse", { cx: x + 216, cy: fl - 2, rx: 9, ry: 3.5, fill: "#f28ab2" }, d);
      el("rect", { x: x + 308, y: fl - 41, width: 8, height: 5, fill: "#2f6f62" }, d);
      el("rect", { x: x + 22, y: fl - 72, width: 14, height: 16, rx: 2, fill: "#d9776b" }, d);
      el("path", { d: `M${x + 29} ${fl - 72} q-8 -10 -2 -20 M${x + 29} ${fl - 72} q8 -12 2 -22`, stroke: "#4c8a3f", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, d); }
  }
  { // The bathroom: a bath with a rubber duck (tap it), the sink and mirror, a towel
    const [g, x, y, , h] = room("bathroom", [130, 40]), fl = y + h - 14;
    windowPane(g, x + 170, y + 40, 50, 50);
    pendant(g, x + 130, y, 24);
    el("rect", { x: x + 22, y: y + 72, width: 40, height: 50, rx: 18, fill: "#dff1f8", stroke: "#b8c2c8", "stroke-width": 3 }, g);   // the mirror
    el("rect", { x: x + 34, y: fl - 62, width: 16, height: 62, fill: "#f4f4f4" }, g);                      // the sink
    el("path", { d: `M${x + 16} ${fl - 74} h52 q-4 14 -26 14 q-22 0 -26 -14 z`, fill: "#f4f4f4" }, g);
    el("path", { d: `M${x + 42} ${fl - 74} v-10 h8`, stroke: "#b8c2c8", "stroke-width": 3, fill: "none" }, g);
    el("rect", { x: x + 80, y: y + 128, width: 26, height: 4, fill: "#b8c2c8" }, g);                       // a towel on its rail
    el("rect", { x: x + 82, y: y + 130, width: 22, height: 34, rx: 2, fill: "#f2c3cf" }, g);
    el("path", { d: `M${x + 112} ${fl - 50} h138 v26 q0 20 -24 20 h-90 q-24 0 -24 -20 z`, fill: "#ffffff" }, g);   // the bath, on its feet
    el("rect", { x: x + 116, y: fl - 46, width: 130, height: 6, rx: 3, fill: "#8fd0f5" }, g);
    [x + 126, x + 236].forEach(fx => el("rect", { x: fx - 3, y: fl - 6, width: 6, height: 6, fill: "#c9a56a" }, g));
    el("path", { d: `M${x + 244} ${fl - 50} v-16 h-8`, stroke: "#b8c2c8", "stroke-width": 3, fill: "none" }, g);
    el("rect", { x: x + 60, y: fl - 3, width: 44, height: 3, rx: 1, fill: "#5bcefa" }, g);                 // a bath mat
    T.duck = tappable(g, [x + 140, fl - 76, 30, 30], "A rubber duck: quack", quack);
    const duck = el("g", { id: "duck" }, T.duck);
    el("ellipse", { cx: x + 155, cy: fl - 54, rx: 11, ry: 7, fill: "#ffd75e" }, duck);
    el("circle", { cx: x + 161, cy: fl - 64, r: 6, fill: "#ffd75e" }, duck);
    el("path", { d: `M${x + 166} ${fl - 64} l6 1.5 l-6 2.5 z`, fill: "#f08a24" }, duck);
    el("circle", { cx: x + 162, cy: fl - 66, r: 1.3, fill: "#2d2a26" }, duck);
    { const d = el("g", { class: "detail" }, g);                                                   // close up: bubbles, a toothbrush mug
      [[130, 54, 4], [140, 58, 3], [200, 55, 5], [214, 58, 3], [226, 54, 4]].forEach(([dx, up, r]) => el("circle", { cx: x + dx, cy: fl - up, r, fill: "#ffffff", stroke: "#cfe8f6" }, d));
      el("rect", { x: x + 20, y: fl - 84, width: 8, height: 10, rx: 2, fill: "#5bcefa" }, d); el("rect", { x: x + 23, y: fl - 92, width: 2, height: 10, fill: "#e8604c" }, d); }
  }

  /* ---- Downstairs ---- */
  { // The living room: the front door, the lamp and the speaker (both Home Assistant's), the TV, the sofa
    const [g, x, y, , h] = room("living", [348, 96]), fl = y + h - 14;
    el("ellipse", { cx: x + 230, cy: fl + 4, rx: 110, ry: 7, fill: "#d98c6e", opacity: .8 }, g);      // a rug
    el("rect", { x: x + 10, y: fl - 180, width: 68, height: 180, rx: 3, style: paint("--front-door"), id: "frontDoor" }, g);   // the front door
    el("rect", { x: x + 20, y: fl - 166, width: 48, height: 28, rx: 3, fill: "#bfe3f7", class: "pane" }, g);
    el("rect", { x: x + 20, y: fl - 124, width: 48, height: 50, rx: 3, fill: "none", stroke: "rgba(0,0,0,.2)", "stroke-width": 3 }, g);
    el("rect", { x: x + 20, y: fl - 60, width: 48, height: 46, rx: 3, fill: "none", stroke: "rgba(0,0,0,.2)", "stroke-width": 3 }, g);
    el("rect", { x: x + 32, y: fl - 70, width: 24, height: 4, rx: 1, fill: "#e7c98c" }, g);
    el("circle", { cx: x + 70, cy: fl - 90, r: 3.5, fill: "#e7c98c" }, g);
    windowPane(g, x + 262, y + 50, 64, 56);
    // The TV on its low unit, facing the sofa. Just part of the picture for now: it's on in the
    // evenings so the house looks lived in. (The full version will make it a remote.)
    el("rect", { x: x + 132, y: fl - 30, width: 82, height: 30, rx: 3, fill: "#7a5038" }, g);
    el("rect", { x: x + 137, y: fl - 25, width: 34, height: 20, rx: 2, fill: "#8d6047" }, g); el("rect", { x: x + 175, y: fl - 25, width: 34, height: 20, rx: 2, fill: "#8d6047" }, g);
    el("ellipse", { cx: x + 173, cy: fl - 56, rx: 70, ry: 46, fill: "#8fd0f5", opacity: 0, id: "tvGlow", class: "fade", "pointer-events": "none" }, g);
    el("rect", { x: x + 136, y: fl - 80, width: 74, height: 46, rx: 4, fill: "#1d1d22" }, g);
    el("rect", { x: x + 140, y: fl - 76, width: 66, height: 38, rx: 2, fill: "#2b2f3a", id: "tvScreen" }, g);
    el("rect", { x: x + 169, y: fl - 34, width: 8, height: 4, fill: "#1d1d22" }, g);
    el("rect", { x: x + 238, y: fl - 34, width: 96, height: 30, rx: 12, fill: "#5f86a6" }, g);            // the sofa, and a cushion
    el("rect", { x: x + 234, y: fl - 18, width: 104, height: 18, rx: 9, fill: "#6f97b8" }, g);
    el("rect", { x: x + 312, y: fl - 30, width: 18, height: 14, rx: 4, fill: "#f2c94c" }, g);
    T.lamp = tappable(g, [x + 332, fl - 150, 28, 150], "The lamp: light", openLamp);
    standLamp(T.lamp, x + 346, fl, 130, "#4f9a8a");
    T.speaker = tappable(g, [x + 94, y + 60, 30, 30], "The speaker: music", openMusic);            // on a wee shelf
    el("rect", { x: x + 94, y: y + 86, width: 30, height: 4, fill: "#8a5a3e" }, T.speaker);
    el("rect", { x: x + 100, y: y + 64, width: 16, height: 22, rx: 3, fill: "#3a3a40" }, T.speaker);
    el("circle", { cx: x + 108, cy: y + 78, r: 5, fill: "#5a5a62" }, T.speaker); el("circle", { cx: x + 108, cy: y + 69, r: 2, fill: "#5a5a62" }, T.speaker);
    const notes = el("g", { id: "notes", class: "bob", "pointer-events": "none" }, g);
    el("text", { x: x + 118, y: y + 60, "font-size": 11, fill: "#3a3a40" }, notes).textContent = "♪";
    el("text", { x: x + 124, y: y + 52, "font-size": 9, fill: "#3a3a40" }, notes).textContent = "♫";
    { const d = el("g", { class: "detail" }, g);                                                   // close up: a clock on the wall, the remote on the sofa
      el("circle", { cx: x + 200, cy: y + 52, r: 13, fill: "#fffaf0", stroke: "#8a5a3e", "stroke-width": 3 }, d);
      el("path", { d: `M${x + 200} ${y + 52} v-8 M${x + 200} ${y + 52} h6`, stroke: "#2d2a26", "stroke-width": 2, "stroke-linecap": "round" }, d);
      el("rect", { x: x + 262, y: fl - 21, width: 16, height: 5, rx: 2, fill: "#2b2b30" }, d); }
  }
  { // The kitchen: the fridge with today's date on it (tap it for today), the kettle, the oven
    const [g, x, y, , h] = room("kitchen", [140, 60]), fl = y + h - 14;
    pendant(g, x + 140, y, 30);
    T.fridge = tappable(g, [x + 6, fl - 172, 56, 172], "The fridge: today", openToday);
    el("rect", { x: x + 10, y: fl - 168, width: 48, height: 168, rx: 6, fill: "#eef2f4" }, T.fridge);
    el("rect", { x: x + 10, y: fl - 110, width: 48, height: 2, fill: "#c9d2d7" }, T.fridge);
    el("rect", { x: x + 51, y: fl - 150, width: 3, height: 28, rx: 1.5, fill: "#b8c2c8" }, T.fridge);
    el("rect", { x: x + 15, y: fl - 100, width: 38, height: 42, rx: 2, fill: "#ffffff", stroke: "#c9d2d7" }, T.fridge);   // a wee calendar
    el("rect", { x: x + 15, y: fl - 100, width: 38, height: 10, rx: 2, fill: "#e8604c" }, T.fridge);
    el("text", { x: x + 34, y: fl - 92.5, "text-anchor": "middle", "font-size": 7, "font-weight": 700, fill: "#fff", id: "fridgeDay" }, T.fridge);
    el("text", { x: x + 34, y: fl - 64, "text-anchor": "middle", "font-size": 22, "font-weight": 700, fill: "#2d2a26", id: "fridgeDate" }, T.fridge);
    windowPane(g, x + 120, y + 50, 54, 56);
    el("rect", { x: x + 66, y: fl - 60, width: 186, height: 60, rx: 2, fill: "#c9a77c" }, g);             // cupboards and worktop
    el("rect", { x: x + 64, y: fl - 64, width: 190, height: 6, rx: 2, fill: "#e6dccb" }, g);
    [96, 130, 218].forEach(dx => el("rect", { x: x + dx, y: fl - 54, width: 2, height: 50, fill: "#a5835b" }, g));
    el("rect", { x: x + 126, y: fl - 64, width: 44, height: 4, rx: 1, fill: "#b8c2c8" }, g);               // the sink, and its tap
    el("path", { d: `M${x + 148} ${fl - 64} v-14 h10 v5`, stroke: "#b8c2c8", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, g);
    el("rect", { x: x + 174, y: fl - 54, width: 40, height: 46, rx: 3, fill: "#3a3a40" }, g);              // the oven, and the hob on top
    el("rect", { x: x + 179, y: fl - 44, width: 30, height: 22, rx: 2, fill: "#5a5a62" }, g);
    el("rect", { x: x + 180, y: fl - 51, width: 28, height: 3, rx: 1.5, fill: "#b8c2c8" }, g);
    el("ellipse", { cx: x + 184, cy: fl - 65, rx: 7, ry: 2, fill: "#3a3a40" }, g); el("ellipse", { cx: x + 204, cy: fl - 65, rx: 7, ry: 2, fill: "#3a3a40" }, g);
    el("rect", { x: x + 70, y: fl - 84, width: 20, height: 20, rx: 6, fill: "#d9534f" }, g);             // the kettle, steaming
    el("path", { d: `M${x + 90} ${fl - 78} q6 2 0 8`, stroke: "#d9534f", "stroke-width": 3, fill: "none" }, g);
    const steam = el("g", { class: "bob" }, g);
    el("path", { d: `M${x + 78} ${fl - 90} q-5 -8 0 -14 q5 -6 0 -12`, stroke: "#ffffff", "stroke-width": 2.5, fill: "none", opacity: .8, "stroke-linecap": "round" }, steam);
    el("rect", { x: x + 98, y: fl - 80, width: 22, height: 16, rx: 3, fill: "#f2c94c" }, g);            // the bread bin
    { const d = el("g", { class: "detail" }, g);                                                   // close up: fridge magnets, a recipe book
      [["#e8604c", 18, 150], ["#5bcefa", 30, 144], ["#ffd75e", 42, 152]].forEach(([c, dx, dy]) => el("circle", { cx: x + dx, cy: fl - dy, r: 3.5, fill: c }, d));
      el("rect", { x: x + 226, y: fl - 82, width: 14, height: 18, rx: 1, fill: "#2f6f62" }, d); el("rect", { x: x + 228, y: fl - 79, width: 10, height: 2, fill: "#fff" }, d); }
  }

  // The floors and walls, cut away
  for (const [x, y, , h] of Object.values(ROOMS)) if (x > WALLS.left + 12) el("rect", { x: x - 4, y, width: 8, height: h, fill: "#a87d5c" }, building);
  for (const y of [512, 754, 994]) el("rect", { x: WALLS.left, y, width: WALLS.right - WALLS.left, height: 12, style: paint("--beams") }, building);
  for (const x of [WALLS.left, WALLS.right - 12]) el("rect", { x, y: 512, width: 12, height: 494, style: paint("--beams") }, building);
}

/* ---------- Decorations for celebrations (the names in celebrations.js) ---------- */
const roofPoint = t => {             // a point along the roof's edge, 0 at the left eave to 1 at the right
  const lens = ROOF_EDGE.slice(1).map((p, i) => Math.hypot(p[0] - ROOF_EDGE[i][0], p[1] - ROOF_EDGE[i][1]));
  let d = t * lens.reduce((a, b) => a + b), i = 0;
  while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
  const [a, b] = [ROOF_EDGE[i], ROOF_EDGE[i + 1]], k = Math.min(1, d / lens[i]);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
};
const PARTY = ["#e8504c", "#ffd75e", "#5bcefa", "#9b59b6", "#5be37d"];
const DECOR = {
  bunting(g) {   // along both slopes of the roof
    el("path", { d: "M" + ROOF_EDGE.map(p => p.join(" ")).join(" L"), stroke: "#888", fill: "none" }, g);
    for (let i = 0; i < 26; i++) { const [x, y] = roofPoint((i + .5) / 26); el("polygon", { points: `${x - 8},${y} ${x + 8},${y} ${x},${y + 16}`, fill: PARTY[i % PARTY.length] }, g); }
  },
  balloons(g) {  // tied to the fence
    [[PARTY[0], 488, 900], [PARTY[2], 500, 890], [PARTY[1], 512, 902]].forEach(([c, x, y], i) => {
      const b = el("g", { class: "bob", style: `animation-delay:${-i * .5}s` }, g);
      el("path", { d: `M${x} ${y + 13} q4 34 -2 ${84 - (y - 890)}`, stroke: "#888", fill: "none" }, b);
      el("ellipse", { cx: x, cy: y, rx: 10, ry: 13, fill: c }, b);
    });
  },
  confetti(g) {
    const c = el("g", { class: "confetti", "pointer-events": "none" }, g);
    for (let i = 0; i < 70; i++) el("rect", { x: (i * 97) % 1500, y: 150 + (i * 61) % 820, width: 8, height: 5, fill: PARTY[i % PARTY.length], style: `animation-delay:${-(i % 14) * .5}s` }, c);
  },
  party_hat() { CAT.hat = "party"; },
  pumpkin(g) {   // either side of the path
    [ROOMS.living[0] - 22, ROOMS.living[0] + 110].forEach(x => {
      el("ellipse", { cx: x, cy: 1010, rx: 14, ry: 10, fill: "#f08a24" }, g);
      el("path", { d: `M${x - 7} 1008 l3 -4 l3 4 z M${x + 2} 1008 l3 -4 l3 4 z M${x - 6} 1014 q6 3 12 0`, fill: "#3a2a12", stroke: "#3a2a12" }, g);
      el("rect", { x: x - 2, y: 997, width: 3, height: 5, fill: "#4c8a3f" }, g);
    });
  },
  bats(g) {
    [[150, 520], [1150, 260], [420, 560], [1300, 380]].forEach(([x, y], i) => {     // each loops about its own patch of sky, flapping
      const b = el("g", { class: "batFly", style: `animation-delay:${-i * 3.7}s; animation-duration:${12 + i * 2}s` }, g);
      const at = el("g", { transform: `translate(${x} ${y}) scale(1.5)` }, b);
      el("path", { d: "M0 0 q-8 -8 -16 0 q4 0 6 3 q3 -3 4 0 q2 -3 6 0 q2 -3 4 0 q2 -3 6 -3 q-8 -8 -16 0 z", fill: "#2b2b30", class: "flap", style: `animation-delay:${-i * .1}s` }, at);
    });
  },
  cobweb(g) {    // in the bathroom's top corner
    const [x, y] = inRoom("bathroom", ROOMS.bathroom[2] - 4, 10);
    el("path", { d: `M${x} ${y} l-30 0 M${x} ${y} l0 30 M${x} ${y} l-24 22 M${x - 10} ${y} q-4 8 2 10 q6 4 6 -8 M${x - 18} ${y} q-2 14 12 16`, stroke: "#ffffff", "stroke-width": 1.2, fill: "none", opacity: .85 }, g);
  },
  witch_hat() { CAT.hat = "witch"; },
  tree(g) {      // in the living room, between the door and the sofa
    const [x, top] = inRoom("living", 99), fl = top + ROOMS.living[3] - 14;
    el("polygon", { points: `${x - 21},${fl - 10} ${x},${fl - 92} ${x + 21},${fl - 10}`, fill: "#2f7a4a" }, g);
    el("rect", { x: x - 4, y: fl - 10, width: 8, height: 10, fill: "#7a5236" }, g);
    [[-10, 26, "#e8504c"], [8, 44, "#ffd75e"], [-4, 60, "#5bcefa"], [12, 18, "#f28ab2"], [1, 74, "#e8504c"]].forEach(([dx, up, c], i) => el("circle", { cx: x + dx, cy: fl - up, r: 3.4, fill: c, class: "twinkle", style: `animation-delay:${-i * .6}s` }, g));
    el("path", { d: `M${x} ${fl - 102} l2 5 l5 0 l-4 3 l2 5 l-5 -3 l-5 3 l2 -5 l-4 -3 l5 0 z`, fill: "#ffd75e" }, g);
  },
  roof_lights(g) {
    for (let i = 0; i <= 26; i++) { const [x, y] = roofPoint(i / 26); el("circle", { cx: x, cy: y + 5, r: 3.8, fill: ["#e8504c", "#ffd75e", "#5be37d", "#5bcefa"][i % 4], class: "twinkle", style: `animation-delay:${-i * .3}s` }, g); }
  },
  wreath(g) {    // on the front door
    const x = ROOMS.living[0] + 44;
    el("circle", { cx: x, cy: 862, r: 13, fill: "none", stroke: "#2f7a4a", "stroke-width": 7 }, g);
    el("circle", { cx: x, cy: 875, r: 3.2, fill: "#e8504c" }, g);
  },
  snow() { /* falling snow and snow on the roof: update() shows them */ },
  santa_hat() { CAT.hat = "santa"; },
  fireworks(g) {
    [[1200, 280, "#ffd75e"], [420, 560, "#f28ab2"], [1430, 360, "#8fe3ff"], [1000, 240, "#5be37d"]].forEach(([x, y, c], i) => {
      const f = el("g", { class: "firework", style: `animation-delay:${-i * .7}s` }, g);
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; el("line", { x1: x, y1: y, x2: x + Math.cos(a) * 24, y2: y + Math.sin(a) * 24, stroke: c, "stroke-width": 2.5, "stroke-linecap": "round" }, f); }
    });
  },
  hearts(g) {    // in the windows
    [inRoom("bedroom", 57, 70), inRoom("bathroom", 195, 58), inRoom("living", 294, 72), inRoom("kitchen", 147, 72)].forEach(([x, y], i) => el("path", {
      d: `M${x} ${y + 8} c-10 -7 -9 -15 -3 -15 c2 0 3 2 3 3 c0 -1 1 -3 3 -3 c6 0 7 8 -3 15 z`, fill: "#e8506e", class: "bob", style: `animation-delay:${-i * .6}s`,
    }, g));
  },
};

/* ---------- The cat, wandering from room to room ---------- */
// Where it might be: a spot on each room's floor (or the bed, or the lawn), and how it is
// there (x, from and to are from the room's corner, or the page for the garden; y is down the page)
const CAT_SPOTS = [
  { room: "living", x: 200, y: 969, pose: "walk", from: 130, to: 320 },
  { room: "kitchen", x: 120, y: 979, pose: "sit" },
  { room: "bedroom", x: 220, y: 694, pose: "sleep" },
  { room: "bathroom", x: 82, y: 739, pose: "sit" },
  { room: null, x: 150, y: 1020, pose: "walk", from: 60, to: 440, outside: true },     // on the lawn, by day
].map(s => (s.room ? { ...s, x: inRoom(s.room, s.x)[0], from: s.from && inRoom(s.room, s.from)[0], to: s.to && inRoom(s.room, s.to)[0] } : s));
const CAT = { spot: 0, x: CAT_SPOTS[0].x, dir: 1, until: 0, hat: null, legs: null };
const CAT_SIZE = .85;
function drawCat() {
  const g = $("cat");
  g.replaceChildren();
  if (state && state.cat === false) return;
  const s = CAT_SPOTS[CAT.spot], F = paint("--cat"), S = "var(--cat-stripes)", B = "#2b2523";
  const c = el("g", { transform: `translate(${CAT.x} ${s.y}) scale(${CAT.dir * CAT_SIZE} ${CAT_SIZE})` }, g);
  const stripes = (d, w = 3) => el("path", { d, stroke: S, style: `stroke:${S}`, "stroke-width": w, "stroke-linecap": "round", fill: "none" }, c);
  CAT.legs = null;
  if (s.pose === "sleep") {
    el("ellipse", { cx: 0, cy: 0, rx: 26, ry: 14, style: F }, c);
    stripes("M-12 -12 q3 6 0 12 M-2 -14 q3 7 0 14 M8 -12 q3 6 0 11");
    el("circle", { cx: 22, cy: 2, r: 10, style: F }, c);
    el("path", { d: "M15 -5 l2 -9 l6 6 z", style: F }, c); el("path", { d: "M26 -7 l5 -8 l2 10 z", style: F }, c);
    el("path", { d: "M19 3 q2 2 4 0 M25 3 q2 2 4 0", stroke: B, "stroke-width": 1.5, fill: "none" }, c);
    stripes("M-24 6 q20 14 40 6", 6);
    el("text", { x: 34, y: -14, "font-size": 14, fill: "#ffffff", class: "bob", "font-family": "Fredoka, sans-serif" }, c).textContent = "z";
  } else if (s.pose === "sit") {
    stripes("M-12 8 q-18 4 -16 -16", 6).setAttribute("class", "tail");
    el("ellipse", { cx: 0, cy: -6, rx: 15, ry: 16, style: F }, c);
    stripes("M-10 -14 q5 3 10 0 M-11 -6 q6 3 12 0 M-10 2 q5 3 10 0");
    el("circle", { cx: 2, cy: -28, r: 11, style: F }, c);
    el("path", { d: "M-7 -34 l1 -11 l8 7 z", style: F }, c); el("path", { d: "M6 -38 l7 -8 l2 11 z", style: F }, c);
    el("circle", { cx: 6, cy: -29, r: 1.8, fill: B }, c); el("circle", { cx: -2, cy: -29, r: 1.8, fill: B }, c);
  } else {
    stripes("M-26 -6 q-14 -6 -10 -26", 6).setAttribute("class", "tail");
    el("ellipse", { cx: 0, cy: 0, rx: 28, ry: 13, style: F }, c);
    stripes("M-14 -12 q3 6 0 12 M-4 -13 q3 7 0 13 M6 -12 q3 6 0 12");
    CAT.legs = [el("rect", { x: -20, y: 6, width: 6, height: 14, rx: 3, style: F }, c), el("rect", { x: 14, y: 6, width: 6, height: 14, rx: 3, style: F }, c)];
    el("circle", { cx: 30, cy: -10, r: 12, style: F }, c);
    el("path", { d: "M21 -18 l3 -12 l7 9 z", style: F }, c); el("path", { d: "M33 -20 l7 -10 l2 12 z", style: F }, c);
    el("circle", { cx: 34, cy: -11, r: 1.8, fill: B }, c);
  }
  // Hats for the occasion
  const hx = s.pose === "walk" ? 30 : s.pose === "sit" ? 2 : 22, hy = s.pose === "walk" ? -22 : s.pose === "sit" ? -38 : -8;
  if (CAT.hat === "santa") { el("path", { d: `M${hx - 9} ${hy} q9 -20 20 -6 z`, fill: "#e8504c" }, c); el("rect", { x: hx - 10, y: hy - 2, width: 22, height: 5, rx: 2, fill: "#fff" }, c); el("circle", { cx: hx + 12, cy: hy - 7, r: 3, fill: "#fff" }, c); }
  if (CAT.hat === "party") { el("polygon", { points: `${hx - 7},${hy} ${hx + 7},${hy} ${hx},${hy - 18}`, fill: "#9b59b6" }, c); el("circle", { cx: hx, cy: hy - 18, r: 3, fill: "#ffd75e" }, c); }
  if (CAT.hat === "witch") { el("rect", { x: hx - 13, y: hy - 2, width: 26, height: 4, rx: 2, fill: "#2b2b30" }, c); el("path", { d: `M${hx - 7} ${hy - 1} l5 -20 l9 -4 l-4 6 l4 18 z`, fill: "#2b2b30" }, c); el("rect", { x: hx - 7, y: hy - 6, width: 14, height: 3, fill: "#9b59b6" }, c); }
}
function moveCat(t) {
  if (t > CAT.until) {           // every minute or two it finds somewhere else to be (the garden only by day)
    const outside = ["day", "dawn"].includes(update.phase);
    const spots = CAT_SPOTS.map((s, i) => i).filter(i => i !== CAT.spot && (outside || !CAT_SPOTS[i].outside));
    CAT.spot = spots[Math.floor(Math.random() * spots.length)];
    CAT.x = CAT_SPOTS[CAT.spot].x; CAT.dir = Math.random() < .5 ? 1 : -1;
    CAT.until = t + 60000 + Math.random() * 60000;
    drawCat();
  }
  const s = CAT_SPOTS[CAT.spot];
  if (s.pose === "walk" && !reduce) {
    CAT.x += .3 * CAT.dir;
    if (CAT.x > s.to || CAT.x < s.from) CAT.dir *= -1;
    $("cat").firstChild?.setAttribute("transform", `translate(${CAT.x} ${s.y}) scale(${CAT.dir * CAT_SIZE} ${CAT_SIZE})`);
    const step = Math.sin(t / 160) * 3;
    if (CAT.legs) { CAT.legs[0].setAttribute("y", 6 + Math.max(0, step)); CAT.legs[1].setAttribute("y", 6 + Math.max(0, -step)); }
  }
}

/* ---------- Weather in the scene ---------- */
function drawWeather() {
  const rain = el("g", { id: "rain", class: "rain" }, wb);
  for (let i = 0; i < 150; i++) el("line", { x1: (i * 53) % 1600 - 50, y1: 150 + (i * 97) % 900, x2: (i * 53) % 1600 - 56, y2: 166 + (i * 97) % 900, class: i % 2 ? "heavy" : "", style: `animation-delay:${-(i % 10) * .08}s` }, rain);
  const snow = el("g", { id: "snow", class: "snow" }, wb);
  for (let i = 0; i < 130; i++) el("circle", { cx: (i * 61) % 1560 - 30, cy: 150 + (i * 89) % 900, r: 2 + (i % 3), style: `animation-delay:${-(i % 12) * .5}s` }, snow);
  const { left, right, eaves, apexX, apexY } = ROOF;
  el("polygon", { id: "roofSnow", points: `${left - 6},${eaves + 2} ${apexX},${apexY - 10} ${right + 6},${eaves + 2} ${right - 18},${eaves + 2} ${apexX},${apexY + 10} ${left + 18},${eaves + 2}`, fill: "#ffffff" }, wf);
  el("rect", { id: "fog", x: -1500, y: -1600, width: 4500, height: 4200, fill: "#e6ecef", opacity: .45, "pointer-events": "none" }, overlay);
  el("rect", { id: "lightning", x: -1500, y: -1600, width: 4500, height: 4200, fill: "#ffffff", class: "flash", "pointer-events": "none" }, overlay);
}

/* ---------- Putting it together, and keeping it current ---------- */
function update() {
  const d = now(), s = state || {};
  const clockOnly = Q.has("date") || Q.has("time");               // a made-up time can't use today's sun.sun
  const phase = update.phase = skyPhase(clockOnly ? null : s.sun, d, s.place || {});
  const condition = Q.get("weather") || s.weather?.condition;
  const w = weatherFor(condition), grey = w.clouds >= 3;
  const preview = Q.get("celebrate");
  const forCelebrations = preview === "birthday" && !s.birthdays?.length ? { ...s, birthdays: ["Happy birthday!"] } : s;
  const today = celebrationsToday(d, forCelebrations, preview), decorNames = today.flatMap(c => c.decor);

  // The sky
  const [top, bottom] = css(phase === "night" ? (grey ? "--sky-grey-night" : "--sky-night") : grey && phase === "day" ? "--sky-grey" : `--sky-${phase}`);
  $("skyRect").setAttribute("fill", top);
  document.body.style.background = `linear-gradient(${top}, ${bottom})`;
  $("sun").style.display = phase !== "night" && !grey ? "" : "none";
  $("sun").setAttribute("transform", phase === "dawn" || phase === "dusk" ? "translate(0 150)" : "");
  $("moon").style.display = phase === "night" && !grey ? "" : "none";
  $("moonShade").setAttribute("fill", top);
  $("stars").style.display = phase === "night" && w.clouds < 2 ? "" : "none";
  [...$("clouds").children].forEach((c, i) => (c.style.display = i < w.clouds * 2 ? "" : "none"));
  $("clouds").setAttribute("opacity", phase === "night" ? .35 : grey ? .85 : 1);
  document.body.classList.toggle("windy", w.wind);
  $("rain").style.display = w.rain ? "" : "none";
  $("rain").querySelectorAll(".heavy").forEach(l => (l.style.display = w.rain > 1 ? "" : "none"));
  const snowing = w.snow || decorNames.includes("snow");
  $("snow").style.display = snowing ? "" : "none";
  $("roofSnow").style.display = snowing ? "" : "none";
  $("fog").style.display = w.fog ? "" : "none";
  $("lightning").style.display = w.flash ? "" : "none";
  // The garden through the year
  const se = season(d);
  garden.style.filter = phase === "night" ? "brightness(.5) saturate(.8)" : phase === "dusk" ? "brightness(.8)" : "";   // the garden in the dark
  document.querySelectorAll(".leafball").forEach(b => b.setAttribute("fill", { spring: "#8fcf6a", summer: "#4f9a44", autumn: "#e0913a", winter: "none" }[se]));
  if (update.season !== se) {                     // only when the season changes, or the leaves restart their fall
    update.season = se;
    const bl = $("blossom"); bl.replaceChildren();
    if (se === "spring") for (let i = 0; i < 30; i++) el("circle", { cx: 1290 + (i * 37) % 200, cy: 400 + (i * 23) % 230, r: 4, fill: "#f7b7c8" }, bl);
    const fall = $("falling"); fall.replaceChildren();
    if (se === "autumn" && !reduce) for (let i = 0; i < 12; i++) {
      const x = 1290 + (i * 53) % 210, y = 470 + (i * 37) % 160, dir = i % 2 ? 1 : -1;
      el("ellipse", { cx: x, cy: y, rx: 4.5, ry: 2.8, fill: ["#e0913a", "#c9552c", "#f2c94c"][i % 3], class: "leaf",
        style: `animation-delay:${-i * 1.1}s; animation-duration:${10 + (i % 4)}s; --dx:${dir * (30 + (i * 23) % 60)}px; --dy:${990 - y}px` }, fall);
    }
  }
  $("flowers").style.display = se === "winter" ? "none" : "";
  document.querySelectorAll(".pane").forEach(p => p.setAttribute("fill", top));
  document.querySelectorAll(".paneRain").forEach(p => (p.style.display = w.rain ? "" : "none"));

  // The lamps, and the rooms going dark at night. The living room's lamp is the real one.
  const lamps = lampsFor(d, phase), night = phase === "night" || phase === "dusk";
  const real = s.light ? { living: { on: s.light.on, level: (s.light.on ? s.light.brightness || 100 : 0) / 100 } } : {};
  for (const [id, r] of Object.entries(R)) {
    const lit = real[id] ? real[id].on : lamps[id], level = real[id]?.level || 1;
    r.dark.setAttribute("opacity", night && !lit ? .62 : night ? .12 : 0);
    r.glow.setAttribute("opacity", lit ? (night ? level : .35 * level) : 0);
    document.querySelectorAll(`[data-room="${id}"] .shade`).forEach(sh => sh.setAttribute("fill", lit ? "#fff1b8" : sh.dataset.off));
  }

  const tv = tvOn(d, phase);
  $("tvScreen").classList.toggle("tv", tv);                     // the pictures change, unless the tablet asks for less motion
  $("tvScreen").setAttribute("fill", tv ? "#4fb3d9" : "#2b2f3a");
  $("tvGlow").setAttribute("opacity", tv ? .3 : 0);

  // The things you can tap: the lamp, the speaker and the bed only if the house has them
  allow(T.lamp, !!s.light);
  allow(T.speaker, !!s.speaker);
  T.speaker.style.display = s.speaker ? "" : "none";
  $("notes").style.display = s.speaker?.state === "playing" ? "" : "none";
  allow(T.bed, !!s.goodnight);
  $("fridgeDay").textContent = d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  $("fridgeDate").textContent = d.getDate();

  // The header
  $("greeting").textContent = greeting(d);
  $("date").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  $("weather").textContent = weatherWords(Q.has("weather") ? { condition } : s.weather);
  $("welcome").textContent = s.welcome || "";
  $("welcome").hidden = !s.welcome;
  $("banner").textContent = today.map(c => c.words).join("  ·  ");
  $("banner").hidden = !today.length;
  $("note").textContent = !state ? "Can't reach the panel's helper just now."
    : s.mode === "pretend" ? "Demo mode: not joined up to Home Assistant yet."
    : s.ok === false ? "Home Assistant isn't answering just now." : "";
  $("note").hidden = !$("note").textContent;

  // The decorations for the day (redrawn only when they change)
  const key = decorNames.join("|") + "/" + phase + "/" + s.cat;
  if (key !== update.decor) {
    update.decor = key;
    decor.replaceChildren(); CAT.hat = null;
    for (const name of new Set(decorNames)) {
      if (name === "fireworks" && !night) continue;                     // fireworks only in the dark
      DECOR[name]?.(el("g", {}, decor));
    }
    drawCat();
  }
}
function tick() { $("clock").textContent = now().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }

/* ---------- Cards: what opens when something's tapped ---------- */
// A card over the house. Focus moves into it (and Tab stays inside), and goes back to
// whatever opened it when it closes, so a keyboard or switch user isn't left behind it.
let cardFrom = null;
function card(html, wire) {
  const c = $("card");
  if (c.hidden) cardFrom = document.activeElement;
  c.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="cardTitle" tabindex="-1">${html}</div>`;
  c.querySelector("h2")?.setAttribute("id", "cardTitle");
  c.hidden = false;
  c.onclick = e => { if (e.target === c) closeCard(); };
  c.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeCard));
  wire?.(c);
  (c.querySelector("[autofocus], input, .main") || c.querySelector(".card")).focus();
}
function closeCard() {
  $("card").hidden = true;
  if (cardFrom?.isConnected) cardFrom.focus?.();
  cardFrom = null;
}
$("card").addEventListener("keydown", e => {
  if (e.key === "Escape") { e.stopPropagation(); closeCard(); return; }
  if (e.key !== "Tab") return;
  const all = [...$("card").querySelectorAll("button, input, a[href], [tabindex='0']")];
  if (!all.length) return;
  const first = all[0], last = all.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const demoNote = () => (state?.mode === "pretend" ? `<p class="small">(Demo mode: not joined up to Home Assistant yet.)</p>` : "");
function tone(f, at = 0) { try { const a = tone.ctx ||= new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.setValueAtTime(.05, a.currentTime + at); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + at + .12); o.connect(g).connect(a.destination); o.start(a.currentTime + at); o.stop(a.currentTime + at + .13); } catch { /* no sound */ } }

// The lamp: a slider for how bright, or On and Off for a smart plug
function openLamp() {
  const l = state?.light;
  if (!l) return;
  if (!l.dimmable) return card(`<h2>${esc(l.name)}</h2>
    <p id="said" aria-live="polite">${l.on ? "On" : "Off"}</p>
    <div class="row"><button class="main" id="on">On</button><button id="off">Off</button></div>
    <div class="row"><button data-close>Done</button></div>${demoNote()}`, c => {
    const go = async on => { c.querySelector("#said").textContent = on ? "On" : "Off"; tone(on ? 760 : 440); if (!(await change("light", { on }, on ? "light_on" : "light_off"))) c.querySelector("#said").textContent = state.light.on ? "On" : "Off"; };
    c.querySelector("#on").onclick = () => go(true);
    c.querySelector("#off").onclick = () => go(false);
  });
  const level = l.on ? l.brightness || 100 : 0;
  card(`<h2>${esc(l.name)}</h2>
    <input type="range" id="level" min="0" max="100" step="10" value="${level}" aria-label="Brightness">
    <p id="said" aria-live="polite">${level ? level + "%" : "Off"}</p>
    <div class="row"><button id="off">Off</button><button id="full">Full</button><button class="main" data-close>Done</button></div>
    ${demoNote()}`, c => {
    const r = c.querySelector("#level"), said = c.querySelector("#said");
    const go = async v => {
      r.value = v; said.textContent = v ? v + "%" : "Off"; tone(v ? 660 + v * 3 : 440);
      const ok = v ? await change("light", { on: true, brightness: v }, "light_on", v) : await change("light", { on: false }, "light_off");
      if (!ok) { const b = state.light.on ? state.light.brightness || 100 : 0; r.value = b; said.textContent = b ? b + "%" : "Off"; }
    };
    r.addEventListener("input", () => { said.textContent = +r.value ? r.value + "%" : "Off"; });
    r.addEventListener("change", () => go(+r.value));
    c.querySelector("#off").onclick = () => go(0);
    c.querySelector("#full").onclick = () => go(100);
  });
}

// The speaker: play and pause, how loud, and the favourites
function speakerWords(sp) {
  return sp.state === "playing" ? (sp.title ? `Playing: ${sp.title}` : "Playing")
    : sp.state === "paused" ? "Paused" : sp.state === "off" ? "Switched off" : "Nothing playing";
}
function openMusic() {
  const sp = state?.speaker;
  if (!sp) return;
  const playing = sp.state === "playing";
  card(`<h2>${esc(sp.name)}</h2>
    <p id="said" aria-live="polite">${esc(speakerWords(sp))}</p>
    <div class="row"><button class="main" id="play">${playing ? "Pause" : "Play"}</button></div>
    ${Number.isFinite(sp.volume) ? `<label class="volume"><span aria-hidden="true">🔈</span><input type="range" id="volume" min="0" max="100" step="5" value="${sp.volume}" aria-label="Volume"><span aria-hidden="true">🔊</span></label>` : ""}
    ${sp.favourites.length ? `<p>Favourites:</p><div class="row">${sp.favourites.map((f, i) => `<button data-fav="${i}">${esc(f)}</button>`).join("")}</div>` : ""}
    <div class="row"><button data-close>Close</button></div>${demoNote()}`, c => {
    c.querySelector("#play").onclick = async () => { if (await change("speaker", { state: playing ? "paused" : "playing" }, playing ? "pause" : "play")) openMusic(); };
    c.querySelector("#volume")?.addEventListener("change", e => change("speaker", { volume: +e.target.value }, "volume", +e.target.value));
    c.querySelectorAll("[data-fav]").forEach(b => (b.onclick = async () => {
      if (await change("speaker", { state: "playing", title: b.textContent }, "favourite", +b.dataset.fav)) openMusic();
    }));
  });
}

// The bed: off to bed?
function openGoodnight() {
  if (!state?.goodnight) return;
  const what = [state.light && `turns off the ${esc(state.light.name.toLowerCase())}`, state.speaker && "pauses the music"].filter(Boolean);
  card(`<h2>Off to bed?</h2>
    <p>${what.length ? "Goodnight " + what.join(" and ") + "." : "Goodnight gets the house ready for bed."}</p>
    <div class="row"><button class="main goodnight" id="night">🌙 Goodnight</button><button data-close>Not yet</button></div>${demoNote()}`, c => {
    c.querySelector("#night").onclick = async () => {
      if (!(await act("goodnight"))) return;
      if (state.light) state.light.on = false;
      if (state.speaker?.state === "playing") state.speaker.state = "paused";
      closeCard(); zoomTo(null); update();
      say("Goodnight, sleep well 🌙");
    };
  });
}

// The fridge's calendar: today
function openToday() {
  const d = now(), s = state || {}, today = celebrationsToday(d, s, Q.get("celebrate"));
  const weather = weatherWords(Q.has("weather") ? { condition: Q.get("weather") } : s.weather);
  card(`<h2>${esc(d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</h2>
    ${weather ? `<p>Outside: ${esc(weather)}</p>` : ""}
    ${today.map(c => `<p>${esc(c.words)}</p>`).join("")}
    ${s.welcome ? `<p>${esc(s.welcome)}</p>` : ""}
    <div class="row"><button class="main" data-close>OK</button></div>`);
}

// The duck: quack
function quack() {
  tone(520); tone(440, .14);
  const d = $("duck");
  d.classList.remove("quack"); void d.getBoundingClientRect(); d.classList.add("quack");
  $("news").textContent = "Quack!";
}

/* ---------- Off we go ---------- */
drawSky(); drawGarden(); drawHouse(); drawWeather();
setBox([...WHOLE]);
tick(); setInterval(tick, 1000);
update();
if (ROOMS[Q.get("room")]) zoomTo(Q.get("room"));        // ?room=kitchen starts zoomed in, for screenshots
refresh(); setInterval(refresh, 20e3);
document.addEventListener("visibilitychange", refresh);
setInterval(update, 60e3);                     // the sky and the lamps move on with the clock
const frame = t => { moveCat(t); requestAnimationFrame(frame); };
requestAnimationFrame(frame);
