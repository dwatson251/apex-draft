import { BIOMES, ROAD_HALF, SIM_VERSION, VEHICLES, WORLD_TIME, METRES_PER_UNIT, cachedTrack, circuitFor, forecast, forecastText, isVehicleId, normalizePhrase, placeFor, raceDuration, trackLength, weatherFor, type Track, type VehicleId } from "@apex/sim";
import type { Db } from "./db.ts";

export interface Page { status: number; type: string; body: string }

const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A time from the sim as the game shows it: real seconds (see scale.ts), m:ss.mmm. */
export function fmtTime(sim: number | null | undefined): string {
  if (sim === null || sim === undefined || !Number.isFinite(sim)) return "–";
  const t = sim * WORLD_TIME, m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`;
}

const ago = (ms: number, now = Date.now()): string => {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

const CSS = `
:root{color-scheme:dark light;--bg:#12151c;--card:#1b2030;--line:#2b3247;--text:#e8ecf5;--dim:#9aa4bd;--accent:#ffcf3f;--good:#4fd28a;--fun:#b48cff;--circ:#5aa9ff}
@media (prefers-color-scheme:light){:root{--bg:#eef1f7;--card:#fff;--line:#d5dbe8;--text:#1b2030;--dim:#5c6580;--accent:#b88700;--good:#1f8f57;--fun:#7a4fd6;--circ:#2a74c9}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header{border-bottom:1px solid var(--line);background:var(--card)}header .in,main{max-width:1000px;margin:0 auto;padding:12px 16px}
header .in{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}header b{font-size:20px;letter-spacing:.02em}header nav{display:flex;gap:14px}
h1{font-size:26px;margin:8px 0 4px}h2{font-size:18px;margin:28px 0 8px}p{margin:6px 0}.dim{color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.card h3{margin:0 0 4px;font-size:16px;word-break:break-word}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:7px 12px;text-align:left;border-bottom:1px solid var(--line)}th{font-size:12px;text-transform:uppercase;color:var(--dim);letter-spacing:.05em}tr:last-child td{border-bottom:0}
td.t,th.t{text-align:right;font-variant-numeric:tabular-nums}
.badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:middle;border:1px solid currentColor}
.badge.fun{color:var(--fun)}.badge.circuit{color:var(--circ)}
details.spoiler{background:var(--card);border:1px dashed var(--line);border-radius:10px;padding:12px 14px}
details.spoiler summary{cursor:pointer;color:var(--dim);list-style:none}details.spoiler summary::-webkit-details-marker{display:none}
details.spoiler[open] summary{display:none}
.svg{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px}.svg svg{width:100%;height:auto;max-height:480px;display:block}
.row{display:flex;gap:20px;flex-wrap:wrap}.row>*{flex:1 1 300px}
code{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:2px 8px;word-break:break-all}
button.copy{margin-left:8px;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:2px 10px;cursor:pointer}
footer{max-width:1000px;margin:30px auto;padding:0 16px;color:var(--dim);font-size:13px}
`;

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>${CSS}</style></head><body><header><div class="in"><b>Apex Draft</b><nav><a href="/">Home</a><a href="/tracks">Tracks</a></nav></div></header><main>${body}</main>
<footer>Times are made by running each line through the game's own simulation (ruleset ${SIM_VERSION}), so they can't be faked. Real-circuit layouts use OpenStreetMap data (ODbL).</footer>
<script>document.querySelectorAll("button.copy").forEach(function(b){b.addEventListener("click",function(){navigator.clipboard&&navigator.clipboard.writeText(b.dataset.text||"");b.textContent="Copied"})})</script></body></html>`;
}

const badges = (fun: number | boolean, special: number | boolean): string => `${fun ? '<span class="badge fun" title="A fun track: crossings, bridges, shortcuts, water">Fun</span>' : ""}${special ? '<span class="badge circuit" title="A hidden circuit">Circuit</span>' : ""}`;

/** A track's name: the circuit's own for a real circuit, otherwise its phrase. */
function trackTitle(key: string): string {
  const c = circuitFor(normalizePhrase(key));
  return c ? c.name : key;
}

/** A Mario Kart course is a known name, not a secret: its card shows its name, and its badge says what it is. */
const isKart = (key: string): boolean => !!circuitFor(normalizePhrase(key))?.kart;
/** What a hidden circuit is called until it is clicked: a made-up one is not a real one. */
const spoilerKind = (key: string): string => (circuitFor(normalizePhrase(key))?.fictional ? "a fictional circuit" : "a real circuit");

function trackCard(t: { key: string; fun: number; special: number; plays: number; drivers: number }): string {
  const inner = `<h3><a href="/tracks/${encodeURIComponent(t.key)}">${esc(trackTitle(t.key))}</a>${badges(t.fun, 0)}${isKart(t.key) ? '<span class="badge circuit" title="A Mario Kart course (fan approximation)">Kart</span>' : ""}</h3><div class="dim">${t.drivers} driver${t.drivers === 1 ? "" : "s"} · ${t.plays} run${t.plays === 1 ? "" : "s"}</div>`;
  // real circuits are the game's hidden tracks: their names stay out of sight until clicked
  return t.special && !isKart(t.key)
    ? `<details class="spoiler"><summary>Spoiler: ${spoilerKind(t.key)}${badges(0, 1)} <span class="dim">· click to reveal</span></summary><div class="card">${inner}</div></details>`
    : `<div class="card">${inner}</div>`;
}

// ---------- the track drawn as SVG ----------
const svgCache = new Map<string, string>();
const BIOME_SKIN: Record<string, { ground: string; road: string; edge: string }> = {
  grass: { ground: "#4c7f45", road: "#3c404c", edge: "#d8d8d0" }, desert: { ground: "#c9a35e", road: "#4a4038", edge: "#efe2c0" },
  snow: { ground: "#dbe6f2", road: "#4b5160", edge: "#ffffff" }, city: { ground: "#6d7380", road: "#33363f", edge: "#d6d6d0" },
  moon: { ground: "#8a8a92", road: "#50505a", edge: "#c8c8d0" }, water: { ground: "#2f78b7", road: "#4a5060", edge: "#e8f1fa" },
};

export function trackSvg(track: Track): string {
  const hit = svgCache.get(track.phrase);
  if (hit) return hit;
  const skin = BIOME_SKIN[track.biome] ?? BIOME_SKIN["grass"]!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const polys: { d: string; main: boolean; deck: boolean }[] = [];
  const all = track.allSegments ?? track.segments;
  all.forEach((s, i) => {
    const main = i < track.segments.length;
    const left: string[] = [], right: string[] = [];
    s.center.forEach((c, k) => {
      const n = s.normals[k]!, h = s.half?.[k] ?? ROAD_HALF;
      const l = { x: c.x + n.x * h, y: c.y + n.y * h }, r = { x: c.x - n.x * h, y: c.y - n.y * h };
      for (const p of [l, r]) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      left.push(`${l.x.toFixed(1)},${l.y.toFixed(1)}`); right.push(`${r.x.toFixed(1)},${r.y.toFixed(1)}`);
    });
    polys.push({ d: `M${left.join("L")}L${right.reverse().join("L")}Z`, main, deck: s.kind === "bridge" });
  });
  const m = 40, w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
  const g = track.segments[0]!.entry, half = g.half ?? ROAD_HALF;
  const a = { x: g.mid.x + g.n.x * half, y: g.mid.y + g.n.y * half }, b = { x: g.mid.x - g.n.x * half, y: g.mid.y - g.n.y * half };
  const centre = track.segments.map((s) => `M${s.center.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("L")}`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(x0 - m).toFixed(0)} ${(y0 - m).toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" role="img" aria-label="Track layout">
<rect x="${(x0 - m).toFixed(0)}" y="${(y0 - m).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="12" fill="${skin.ground}"/>
${[...polys.filter((p) => !p.deck), ...polys.filter((p) => p.deck)].map((p) => `<path d="${p.d}" fill="${skin.road}" stroke="${p.deck ? "#d9dce4" : skin.edge}" stroke-width="${p.deck ? 4 : 2}" stroke-linejoin="round" ${p.main ? "" : 'opacity=".55" stroke-dasharray="6 4"'}/>`).join("")}
<path d="${centre}" fill="none" stroke="${skin.edge}" stroke-width="1.2" stroke-dasharray="7 9" opacity=".6"/>
<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#fff" stroke-width="5"/>
<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#111" stroke-width="5" stroke-dasharray="5 5"/>
</svg>`;
  svgCache.set(track.phrase, svg);
  if (svgCache.size > 200) svgCache.delete(svgCache.keys().next().value!);
  return svg;
}

// ---------- pages ----------
function indexPage(db: Db): Page {
  const s = db.stats(), pop = db.popularTracks(12), rec = db.recentRecords(10);
  const body = `<h1>Apex Draft</h1><p class="dim">Draw the racing line, then watch your car follow it. Lines uploaded from the game are run through the same simulation here, and other players' lines come back as rivals.</p>
<p class="dim">${s.players} drivers · ${s.tracks} tracks · ${s.times} times</p>
<h2>Popular tracks</h2>${pop.length ? `<div class="grid">${pop.map(trackCard).join("")}</div>` : '<p class="dim">No times yet. Upload one from the game.</p>'}
<h2>Latest times</h2>${rec.length ? `<table><tr><th>Track</th><th>Car</th><th>Driver</th><th class="t">Time</th><th class="t">When</th></tr>${rec.map((r) => `<tr><td>${r.special && !isKart(r.track_key) ? `<details class="spoiler"><summary>Spoiler: ${spoilerKind(r.track_key)}${badges(0, 1)}</summary><a href="/tracks/${encodeURIComponent(r.track_key)}">${esc(trackTitle(r.track_key))}</a></details>` : `<a href="/tracks/${encodeURIComponent(r.track_key)}">${esc(r.track_key)}</a>${badges(r.fun, 0)}`}</td><td>${esc(isVehicleId(r.vehicle) ? VEHICLES[r.vehicle].name : r.vehicle)}</td><td><a href="/players/${esc(r.player_id)}">${esc(r.name)}</a></td><td class="t">${fmtTime(r.time)}</td><td class="t dim">${ago(r.created_at)}</td></tr>`).join("")}</table>` : '<p class="dim">Nothing yet.</p>'}`;
  return { status: 200, type: "text/html; charset=utf-8", body: layout("Apex Draft", body) };
}

function tracksPage(db: Db): Page {
  const pop = db.popularTracks(100);
  return { status: 200, type: "text/html; charset=utf-8", body: layout("Tracks · Apex Draft", `<h1>Tracks</h1><div class="grid">${pop.map(trackCard).join("")}</div>${pop.length ? "" : '<p class="dim">No tracks yet.</p>'}`) };
}

function trackPage(db: Db, key: string): Page | null {
  const row = db.track(key);
  if (!row) return null;
  const place = placeFor(row.key), track = cachedTrack(row.key);
  const circuit = track.circuit;
  const km = circuit ? circuit.lengthKm : (trackLength(track) * METRES_PER_UNIT) / 1000;
  const biome = BIOMES[track.biome];
  const laps = 3;
  const duration = raceDuration(track, place.vehicle, laps);
  const rain = forecastText(forecast(weatherFor(place.seed, duration, track.biome), duration));
  const boards = place.choices.map((v: VehicleId) => {
    const top = db.topTimes(row.key, v, 10);
    const rows = top.map((t, i) => {
      let car = ""; try { const c = JSON.parse(t.car_json); car = `${c.accel}/${c.top}/${c.grip}/${c.brake}`; } catch { /* old row */ }
      return `<tr><td>${i + 1}</td><td><a href="/players/${esc(t.player_id)}">${esc(t.name)}</a></td><td class="dim">${esc(car)}</td><td class="t">${fmtTime(t.time)}</td></tr>`;
    }).join("");
    return `<div><h3>${esc(VEHICLES[v].name)}${v === place.vehicle ? ' <span class="dim">(the track\'s own)</span>' : ""}</h3>${top.length ? `<table><tr><th>#</th><th>Driver</th><th title="acceleration / top speed / cornering / braking">Car</th><th class="t">Best lap</th></tr>${rows}</table>` : '<p class="dim">No times yet.</p>'}</div>`;
  }).join("");
  const body = `<h1>${esc(circuit ? circuit.name : row.key)}${badges(row.fun, row.special)}</h1>
<p class="dim">${esc(circuit?.blurb ?? "")}</p>
<div class="row"><div class="svg">${trackSvg(track)}</div><div>
<p><b>Track code</b><br><code>${esc(row.key)}</code><button class="copy" data-text="${esc(row.key)}">Copy</button></p>
<p class="dim">Type it into the game's track box to drive it.</p>
<p><b>Length</b> ${km.toFixed(2)} km · ${track.segments.length} segments</p>
<p><b>Surface</b> ${esc(biome.name)} <span class="dim">${esc(biome.blurb)}</span></p>
<p><b>Weather</b> ${esc(rain)} <span class="dim">(a ${laps}-lap race with realism on; timed laps are always dry)</span></p>
<p><b>Cars</b> ${place.choices.map((v: VehicleId) => esc(VEHICLES[v].name)).join(", ")}</p>
<p class="dim">${row.plays} run${row.plays === 1 ? "" : "s"}</p></div></div>
<h2>Top 10 by car</h2><div class="row">${boards}</div>`;
  return { status: 200, type: "text/html; charset=utf-8", body: layout(`${circuit ? circuit.name : row.key} · Apex Draft`, body) };
}

function playerPage(db: Db, id: string): Page | null {
  const p = db.player(id);
  if (!p) return null;
  const entries = db.playerEntries(id), results = db.playerResults(id);
  const link = (key: string, fun: number, special: number) => `<a href="/tracks/${encodeURIComponent(key)}">${esc(trackTitle(key))}</a>${badges(fun, special)}`;
  const body = `<h1>${esc(p.name)}</h1><p class="dim">Driving since ${new Date(p.created_at).toISOString().slice(0, 10)}</p>
<h2>Best times</h2>${entries.length ? `<table><tr><th>Track</th><th>Car</th><th class="t">Time</th><th class="t">Rank</th><th class="t">When</th></tr>${entries.map((e) => `<tr><td>${link(e.track_key, e.fun, e.special)}</td><td>${esc(isVehicleId(e.vehicle) ? VEHICLES[e.vehicle].name : e.vehicle)}</td><td class="t">${fmtTime(e.time)}</td><td class="t">${e.rank}</td><td class="t dim">${ago(e.created_at)}</td></tr>`).join("")}</table>` : '<p class="dim">No times yet.</p>'}
<h2>Races</h2>${results.length ? `<table><tr><th>Track</th><th>Mode</th><th>Car</th><th class="t">Result</th><th class="t">Time</th><th class="t">When</th></tr>${results.map((r) => `<tr><td>${link(r.track_key, r.fun, r.special)}</td><td>${r.kind === "weekend" ? "Race weekend" : "Quick race"}</td><td>${esc(isVehicleId(r.vehicle) ? VEHICLES[r.vehicle].name : r.vehicle)}</td><td class="t">${r.status === "done" ? `P${r.position}` : r.status === "rejected" ? "not counted" : "pending…"}</td><td class="t">${r.status === "done" ? fmtTime(r.finish_time) : "–"}</td><td class="t dim">${ago(r.created_at)}</td></tr>`).join("")}</table>` : '<p class="dim">No races yet.</p>'}`;
  return { status: 200, type: "text/html; charset=utf-8", body: layout(`${p.name} · Apex Draft`, body) };
}

/** The website. null means no such page. */
export function renderPage(db: Db, path: string): Page | null {
  if (path === "/") return indexPage(db);
  if (path === "/tracks") return tracksPage(db);
  let m = /^\/tracks\/([^/]+)$/.exec(path);
  if (m) { try { return trackPage(db, decodeURIComponent(m[1]!)); } catch { return null; } }
  m = /^\/players\/([0-9a-f]{12})$/.exec(path);
  if (m) return playerPage(db, m[1]!);
  return null;
}
