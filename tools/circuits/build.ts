import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadWays, projector, type Pt } from "./osm.ts";
import { graph, cyclesThrough, bridgeGaps, type Edge } from "./loop.ts";
import { dist, fit, length, measure, radii, resample, smoothLoop, straighten, type Limits } from "./process.ts";
import { SOURCES, type Source } from "./sources.ts";

/**
 * OpenStreetMap -> game track. For each circuit: find the lap among the mapped ways, scale it, bend it the least that makes a
 * road the game can use (no tighter turns, no parts of the road closer than two cars need), and write the points to
 * packages/sim/src/circuitData.ts. Also writes an SVG of real against game for a look, and prints how close they are.
 */
const here = (f: string) => new URL(f, import.meta.url);
const LIMITS: Limits = { rMin: 36, gap: 60, near: 170 };
const SPACING = 10;
const margin = 180;

interface Built { src: Source; real: Pt[]; startReal: number; game: Pt[]; report: ReturnType<typeof measure>; scale: number }

function loopOf(src: Source): { pts: Pt[]; startArc: number } {
  const proj = projector(src.ref[0], src.ref[1]);
  const all = loadWays(fileURL(src.id));
  if (src.closed) {
    const w = all.find((x) => x.id === src.closed!.way)!;
    let pts = w.geometry.map(proj);
    if (dist(pts[0]!, pts.at(-1)!) < 3) pts = pts.slice(0, -1);
    const area = pts.reduce((a, p, i) => a + (p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y), 0);
    const clockwise = area > 0; // y points down on screen
    if (clockwise !== (src.closed.direction === "cw")) pts = [...pts].reverse();
    return { pts, startArc: 0 };
  }
  // (a mapped circuit's relation lists only its own ways, so only the ones named in `avoid` are left out; elsewhere, drop pit lanes and karts)
  const ways = all.filter((w) => !(src.avoid ?? []).includes(w.id) && (src.relation || (!/pit lane|kart|support|moto layout/i.test(w.tags.name ?? "") && w.tags.sport !== "karting" && w.tags.raceway !== "pit_lane")));
  const rel = src.relation;
  const { edges, nodes } = graph(ways, proj, rel?.tolerance ?? 4, !rel);
  if (rel?.bridge) { const made = bridgeGaps(edges, nodes, rel.bridge); if (made) console.log(`  ${made} gap(s) in the map joined up`); }
  let cycles = cyclesThrough(edges, src.via);
  cycles = cycles.filter((c) => (src.require ?? []).every((id) => c.some((e) => e.way.id === id)));
  if (!cycles.length) throw new Error(`${src.id}: no lap found`);
  cycles.sort((a, b) => Math.abs(total(a) - src.km * 1000) - Math.abs(total(b) - src.km * 1000));
  const lap = cycles[0]!;
  let pts: Pt[] = [];
  let arc = 0, startArc = 0;
  const startAt = src.startWay ? lap.find((e) => e.way.id === src.startWay!.way) : undefined;
  for (const e of lap) {
    if (startAt === e) startArc = arc + e.len * src.startWay!.at;
    for (let i = pts.length ? 1 : 0; i < e.pts.length; i++) pts.push(e.pts[i]!);
    arc += e.len;
  }
  if (dist(pts[0]!, pts.at(-1)!) < 3) pts.pop();
  if (rel) {
    // the map does not say which way round it is driven: turn it to face the right way
    const area = pts.reduce((a, p, i) => a + (p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y), 0);
    if ((area > 0) !== (rel.direction === "cw")) pts = [...pts].reverse();
  }
  if (src.startPit) {
    const pit = all.find((w) => w.id === src.startPit)!.geometry.map(proj);
    const mid = pit[Math.floor(pit.length / 2)]!;
    let best = Infinity, bi = 0;
    pts.forEach((p, i) => { const d = dist(p, mid); if (d < best) { best = d; bi = i; } });
    startArc = arcAt(pts, bi);
  }
  console.log(`${src.id}: lap of ${(arc / 1000).toFixed(3)} km (${lap.length} ways; real ${src.km} km)`);
  return { pts, startArc };
}
const total = (c: Edge[]) => c.reduce((s, e) => s + e.len, 0);
const fileURL = (id: string) => here(`./cache/${id}.json`).pathname;
function arcAt(p: Pt[], idx: number): number { let s = 0; for (let i = 1; i <= idx; i++) s += dist(p[i - 1]!, p[i]!); return s; }

/** Where along a closed loop (arc length) the point nearest `arc` ends up in a resampled copy: index. */
function build(src: Source): Built {
  const { pts, startArc } = loopOf(src);
  const L = length(pts);
  const fine = smoothLoop(resample(pts, Math.round(L / 3)), 6, 0.5);
  const units = L * src.scale;
  const n = Math.round(units / SPACING);
  const real = resample(fine, n);
  const scaled = real.map((p) => ({ x: p.x * src.scale, y: p.y * src.scale }));
  // the start line has to be on a straight (the pit lane runs beside it): near where the real one is, take the straightest stretch
  const nominal = Math.round(((startArc / L) * n)) % n;
  const half = 14; // samples each side of the line: a segment and a bit
  const bend = (at: number): number => {
    const a = scaled[(at - half + n) % n]!, b = scaled[(at + half) % n]!, len = dist(a, b) || 1;
    let worst = 0;
    for (let k = -half; k <= half; k++) {
      const q = scaled[(at + k + n) % n]!;
      worst = Math.max(worst, Math.abs(((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / len));
    }
    return worst;
  };
  let startIdx = nominal, bestScore = Infinity;
  for (let off = -90; off <= 90; off++) {
    const at = (nominal + off + n) % n, score = bend(at) + 0.01 * Math.abs(off);
    if (score < bestScore) { bestScore = score; startIdx = at; }
  }
  console.log(`  start line moved ${((startIdx - nominal + n + n / 2) % n) - n / 2} samples, bend ${bend(startIdx).toFixed(2)} units over ${2 * half} samples`);
  // start there, with the road dead straight beside the pit lane, then bend the whole loop to fit the game
  const fromStart = (a: Pt[]) => [...a.slice(startIdx), ...a.slice(0, startIdx)];
  const start = straighten(fromStart(scaled), 0, 18, 14);
  const { points, report } = fit(start, LIMITS, 60, 18);
  const minX = Math.min(...points.map((p) => p.x)), minY = Math.min(...points.map((p) => p.y));
  const game = points.map((p) => ({ x: p.x - minX + margin, y: p.y - minY + margin }));
  return { src, real: fromStart(real), startReal: 0, game, report, scale: src.scale };
}

/** Mean and 90th percentile of the distance from each of `a` to the nearest point of the polyline `b` (closed). */
export function chamfer(a: Pt[], b: Pt[]): { mean: number; p90: number } {
  const d = a.map((p) => {
    let best = Infinity;
    for (let i = 0; i < b.length; i++) {
      const q = b[i]!, r = b[(i + 1) % b.length]!;
      const vx = r.x - q.x, vy = r.y - q.y, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - q.x) * vx + (p.y - q.y) * vy) / l2));
      best = Math.min(best, Math.hypot(p.x - q.x - vx * t, p.y - q.y - vy * t));
    }
    return best;
  }).sort((x, y) => x - y);
  return { mean: d.reduce((s, x) => s + x, 0) / d.length, p90: d[Math.floor(d.length * 0.9)]! };
}

/** How close a shape is to the real one once turned, mirrored and moved to fit it as well as it can (scale fixed by length). */
export function bestFit(shape: Pt[], real: Pt[]): { mean: number; p90: number; aligned: Pt[] } {
  const k = length(real) / length(shape);
  const cen = (p: Pt[]) => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
  const cs = cen(shape), cr = cen(real);
  const sub = (p: Pt[], n: number) => Array.from({ length: n }, (_, i) => p[Math.floor((i * p.length) / n)]!);
  const move = (p: Pt[], ang: number, mir: boolean, dx = 0, dy = 0) => p.map((q) => {
    const x = (q.x - cs.x) * k, y = (q.y - cs.y) * k * (mir ? -1 : 1);
    return { x: cr.x + dx + x * Math.cos(ang) - y * Math.sin(ang), y: cr.y + dy + x * Math.sin(ang) + y * Math.cos(ang) };
  });
  const realFine = sub(real, 240), shapeFine = sub(shape, 200);
  let best = { s: Infinity, ang: 0, mir: false, dx: 0, dy: 0 };
  for (const mir of [false, true]) for (let a = 0; a < 360; a += 4) {
    const s = chamfer(move(shapeFine, (a * Math.PI) / 180, mir), realFine).mean + chamfer(realFine, move(shapeFine, (a * Math.PI) / 180, mir)).mean;
    if (s < best.s) best = { s, ang: (a * Math.PI) / 180, mir, dx: 0, dy: 0 };
  }
  // refine rotation and slide
  for (let round = 0; round < 3; round++) {
    const step = [0.03, 0.01, 0.004][round]!, slide = [40, 15, 6][round]!;
    for (let iter = 0; iter < 12; iter++) {
      let improved = false;
      for (const [da, dx, dy] of [[step, 0, 0], [-step, 0, 0], [0, slide, 0], [0, -slide, 0], [0, 0, slide], [0, 0, -slide]] as const) {
        const cand = { ...best, ang: best.ang + da, dx: best.dx + dx, dy: best.dy + dy };
        const m = move(shapeFine, cand.ang, cand.mir, cand.dx, cand.dy);
        cand.s = chamfer(m, realFine).mean + chamfer(realFine, m).mean;
        if (cand.s < best.s) { best = cand; improved = true; }
      }
      if (!improved) break;
    }
  }
  const aligned = move(shape, best.ang, best.mir, best.dx, best.dy);
  const c1 = chamfer(aligned, real), c2 = chamfer(real, aligned);
  return { mean: (c1.mean + c2.mean) / 2, p90: Math.max(c1.p90, c2.p90), aligned };
}

const svgPath = (p: Pt[], close = true) => `M${p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join("L")}${close ? "Z" : ""}`;

function main(): void {
  const only = process.argv.slice(2);
  const grid: Record<string, number[][]> | null = existsSync(here("./grid.json")) ? JSON.parse(readFileSync(here("./grid.json"), "utf8")) : null;
  const dataFile = here("../../packages/sim/src/circuitData.ts");
  const existing = existsSync(dataFile) ? readFileSync(dataFile, "utf8") : "";
  const out: Record<string, number[]> = existing.includes("/* data */") ? JSON.parse(existing.slice(existing.indexOf("= ", existing.indexOf("/* data */")) + 2).replace(/;\s*$/, "")) : {};
  const rows: string[] = [];
  for (const src of SOURCES) {
    if (only.length && !only.includes(src.id)) continue;
    if (!existsSync(fileURL(src.id))) { console.log(src.id, "no data yet"); continue; }
    const b = build(src);
    const gameM = b.game.map((p) => ({ x: p.x / src.scale, y: p.y / src.scale }));
    const fitQ = bestFit(gameM, b.real); // the game shape against the real one, in metres
    let gridQ: ReturnType<typeof bestFit> | null = null;
    const g = grid?.[src.id];
    if (g) gridQ = bestFit(g.map(([x, y]) => ({ x: x!, y: y! })), b.real);
    const r = b.report;
    rows.push(`${src.id.padEnd(32)} ${(length(b.game) / 1000).toFixed(2).padStart(5)}k units  R>=${r.minRadius.toFixed(0).padStart(3)} gap>=${r.minGap.toFixed(0).padStart(3)}  vs real: mean ${fitQ.mean.toFixed(0).padStart(3)} m p90 ${fitQ.p90.toFixed(0).padStart(3)} m   old grid: ${gridQ ? `mean ${gridQ.mean.toFixed(0).padStart(3)} m p90 ${gridQ.p90.toFixed(0).padStart(3)} m` : "-"}`);
    out[src.id] = b.game.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
    // a picture: real (blue), game track (white), old grid (grey), scaled to the same frame
    const pad = 30, W = Math.max(...b.game.map((p) => p.x)) + pad, H = Math.max(...b.game.map((p) => p.y)) + pad;
    const realFit = bestFit(b.real.map((p) => ({ x: p.x * src.scale, y: p.y * src.scale })), b.game); // the real shape laid over the game one
    const gridDraw = g && gridQ ? bestFit(g.map(([x, y]) => ({ x: x!, y: y! })), b.game) : null;
    writeFileSync(here(`./cache/${src.id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${Math.round(800)}" height="${Math.round((800 * H) / W)}"><rect width="100%" height="100%" fill="#1b1e26"/>${gridDraw ? `<path d="${svgPath(gridDraw.aligned)}" fill="none" stroke="#8a8f9c" stroke-width="3" stroke-dasharray="6 6"/>` : ""}<path d="${svgPath(realFit.aligned)}" fill="none" stroke="#4aa8ff" stroke-width="2"/><path d="${svgPath(b.game)}" fill="none" stroke="#fff" stroke-width="4" stroke-opacity="0.85"/><circle cx="${b.game[0]!.x}" cy="${b.game[0]!.y}" r="8" fill="#ffd84a"/></svg>`);
  }
  const header = `/**
 * Real circuits, as lines of points in game units (x, y, x, y, ...) in driving order, the first point being the start line.
 * Made by tools/circuits (npm run circuits) from OpenStreetMap highways, (c) OpenStreetMap contributors, ODbL: scaled, then bent the
 * least that makes a road the cars can use (see docs/CIRCUIT_CREDITS.md). Do not edit by hand.
 */
`;
  writeFileSync(dataFile, `${header}\n/* data */\nexport const CIRCUIT_DATA: Record<string, number[]> = ${JSON.stringify(out)};\n`);
  console.log(rows.join("\n"));
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) main();
void radii;
