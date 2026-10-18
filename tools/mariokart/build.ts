import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Pt } from "../circuits/osm.ts";
import type { Vec2 } from "../../packages/sim/src/vec.ts";
import { freeSegments, kindOf } from "../../packages/sim/src/freetrack.ts";
import { GLIDE_LANDING_UNITS, LANDING_UNITS, landingRoom } from "../../packages/sim/src/features.ts";
import { v2 } from "../../packages/sim/src/vec.ts";
import { fit, length, measure, resample, smoothLoop, straighten, type Limits } from "../circuits/process.ts";

/**
 * shapes/<game>.json (the waypoints of each course, hand-placed over the wiki's map and described by its text, in the picture's 0..1000 units, first point on the start
 * line, in driving order) -> packages/sim/src/kartdata.ts (each course as a drivable loop in game units, with its pieces). The waypoints are smoothed, scaled
 * to the lap length the shape asks for, the start straightened for the pit lane, and bent the least that makes a road the game can use (as tools/circuits does);
 * when that cannot be done the lap is made longer until it can. Writing the same shapes again gives the same file.
 *   npx vite-node tools/mariokart/build.ts [id ...]      (vite-node, not node: it reads the sim's own sources)
 */
/** A piece is placed either by two points in the picture (`p` to `q`: the nearest points on the road) or by a leg of the waypoint list (`leg`, `a`..`b` of it, to leg `to`). */
interface FxSpec { p?: [number, number]; q?: [number, number]; leg?: number; to?: number; a?: number; b?: number; type: string; power?: number }
interface Shape { pts: [number, number][]; len: number; fx?: FxSpec[]; notes?: string }
const here = (f: string) => new URL(f, import.meta.url);
/** Looser than the real circuits (36 and 60): a kart takes a tighter turn, and the lap stays short enough to be a kart lap. */
const LIMITS: Limits = { rMin: 26, gap: 56, near: 150 };
const SPACING = 10, MARGIN = 180;
/** the tightest corner (radius, units) a scaled loop may start with before `fit` and the longest lap it is grown to */
const PRE_R = 24, MAX_LEN = 3000;

const shapes: Record<string, Shape> = {};
for (const f of readdirSync(here("./shapes/"))) if (f.endsWith(".json")) Object.assign(shapes, JSON.parse(readFileSync(here(`./shapes/${f}`), "utf8")));
const only = process.argv.slice(2);
const roster: { id: string }[] = JSON.parse(readFileSync(here("./roster.json"), "utf8"));
const known = new Set(roster.map((r) => r.id));

export interface Built { points: number[]; fx: { at: number; len: number; type: string; power?: number }[]; len: number; grew: number; report: string; ok: boolean }

/** Where the loop crosses itself: pairs of edge indices (k, m) whose segments intersect. */
function crossingsOf(loop: Pt[]): [number, number][] {
  const n = loop.length, out: [number, number][] = [];
  const side = (a: Pt, b: Pt, c: Pt): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let k = 0; k < n; k++) for (let m = k + 3; m < n; m++) {
    if (k === 0 && m >= n - 2) continue;
    const a = loop[k]!, b = loop[(k + 1) % n]!, c = loop[m]!, d = loop[(m + 1) % n]!;
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) out.push([k, m]);
  }
  return out;
}
const CROSS_WINDOW = 11;
/** The pairs of points near a crossing, which may lie on each other (two roads, one over the other). */
const exemptFor = (loop: Pt[]): ((i: number, j: number) => boolean) | undefined => {
  const cr = crossingsOf(loop), n = loop.length;
  if (!cr.length) return undefined;
  const d = (a: number, b: number): number => Math.min(Math.abs(a - b), n - Math.abs(a - b));
  return (i, j) => cr.some(([k, m]) => (d(i, k) <= CROSS_WINDOW && d(j, m) <= CROSS_WINDOW) || (d(j, k) <= CROSS_WINDOW && d(i, m) <= CROSS_WINDOW));
};

const RAMPS = new Set(["jump", "glide"]);
const RAMP_FROM = 0.3, RAMP_TO = 0.62;

/**
 * Turn where the pieces are wanted (fractions of the lap, read off the picture) into where they can go on the road as the game cuts it. A speed pad or a patch goes
 * where it is wanted. A ramp has to be on a straight with straight road after it (features.ts checkFx), so it goes on the nearest segment that qualifies, within a
 * fifth of a lap; when there is none it is left out (and said so).
 */
function placeFx(id: string, flat: number[], want: { at: number; end: number; type: string; power?: number }[]): Built["fx"] {
  const pts: Vec2[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(v2(flat[i]!, flat[i + 1]!));
  const { segments } = freeSegments(pts);
  const n = segments.length;
  segments.forEach((sg) => { sg.kind = kindOf(sg); if (sg.index === 0 || sg.index === n - 1) sg.kind = "straight"; });
  const taken = new Set<number>();
  const out: Built["fx"] = [];
  for (const w of want) {
    const r = (x: number) => Math.round(x * 10000) / 10000;
    if (!RAMPS.has(w.type)) { out.push({ at: r(w.at), len: r(Math.max(w.end - w.at, 0.002)), type: w.type, ...(w.power !== undefined ? { power: w.power } : {}) }); continue; }
    const need = w.type === "glide" ? GLIDE_LANDING_UNITS : LANDING_UNITS;
    const mid = (w.at + w.end) / 2;
    let best = -1, bestD = Infinity;
    for (let k = 2; k <= n - 3; k++) {
      if (taken.has(k) || taken.has(k - 1) || taken.has(k + 1)) continue;
      if (segments[k]!.kind !== "straight" && segments[k]!.kind !== "kink") continue;
      if (landingRoom(segments, k, RAMP_TO) < need) continue;
      const d = Math.min(Math.abs((k + 0.5) / n - mid), 1 - Math.abs((k + 0.5) / n - mid));
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best < 0 || bestD > 0.2) { console.log(`   ${id}: no room for the ${w.type} near ${(mid * 100).toFixed(0)}% of the lap (nearest ${best < 0 ? "none" : (bestD * 100).toFixed(0) + "% away"}): left out`); continue; }
    taken.add(best);
    out.push({ at: r((best + RAMP_FROM) / n), len: r((RAMP_TO - RAMP_FROM) / n), type: w.type, ...(w.power !== undefined ? { power: w.power } : {}) });
  }
  return out;
}

export function buildShape(id: string, sh: Shape): Built {
  const raw: Pt[] = sh.pts.map(([x, y]) => ({ x, y }));
  // where each waypoint is along the authored loop, as a fraction of it (the pieces are placed against these)
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) cum.push(cum[i - 1]! + Math.hypot(raw[i % raw.length]!.x - raw[i - 1]!.x, raw[i % raw.length]!.y - raw[i - 1]!.y));
  const total = cum.at(-1)!;
  const frac = (leg: number, t: number): number => (cum[leg]! + t * (cum[leg + 1]! - cum[leg]!)) / total;
  // where the point of the picture nearest (px, py) is along the loop, as a fraction of it
  const near = (px: number, py: number): number => {
    let best = Infinity, at = 0;
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i]!, b = raw[(i + 1) % raw.length]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const u = Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / l2)), d = Math.hypot(a.x + dx * u - px, a.y + dy * u - py);
      if (d < best) { best = d; at = (cum[i]! + u * Math.sqrt(l2)) / total; }
    }
    return at;
  };
  const want = (sh.fx ?? []).map((f) => {
    let at: number, end: number;
    if (f.p && f.q) { at = near(f.p[0], f.p[1]); end = near(f.q[0], f.q[1]); if (end < at) end += 1; if (end > 1) end = 1; }
    else { at = frac(f.leg!, f.a!); end = frac(f.to ?? f.leg!, f.b!); }
    return { at, end, type: f.type, power: f.power };
  });
  let smooth = smoothLoop(resample(raw, 240), 5, 0.5);
  // The start line needs a straight run (the pit lane beside it) clear of any crossing: keep the author's start if it will do, else begin at the straightest such place.
  const N = smooth.length, W = 13;
  const bends = (i: number): number => {
    const a = smooth[(i - W + N) % N]!, b = smooth[(i + W) % N]!, len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let worst = 0;
    for (let j = -W; j <= W; j++) { const q = smooth[(i + j + N) % N]!; worst = Math.max(worst, Math.abs(((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / len)); }
    return worst / (length(smooth) / N * 2 * W);
  };
  const crs = crossingsOf(smooth), cd = (a: number, b: number): number => Math.min(Math.abs(a - b), N - Math.abs(a - b));
  const margin = (i: number): number => crs.reduce((m, [k, q]) => Math.min(m, cd(i, k), cd(i, q)), N);
  const clear = (i: number): boolean => margin(i) > W + 13;
  let dev = Array.from({ length: N }, (_, i) => (clear(i) ? bends(i) : Infinity));
  // when no place is clear of every crossing, begin as far from them as there is
  if (dev.every((d) => !Number.isFinite(d))) { const far = Math.max(...Array.from({ length: N }, (_, i) => margin(i))); dev = Array.from({ length: N }, (_, i) => (margin(i) >= far - 1 ? bends(i) : Infinity)); }
  const bestDev = Math.min(...dev);
  if (dev[0]! > Math.max(bestDev * 1.5, 0.02)) {
    const pick = dev.indexOf(bestDev);
    if (Number.isFinite(bestDev)) {
      smooth = [...smooth.slice(pick), ...smooth.slice(0, pick)];
      for (const w of want) { w.at = (((w.at - pick / N) % 1) + 1) % 1; w.end = w.at + Math.min(0.2, Math.max(0.002, w.end - w.at)); }
    }
  }
  // Scale it up until its own corners are wide enough (a tight corner at a small scale would be bent wide by `fit`, and the course with it) and the roads are
  // far enough apart; then let `fit` take out what is left.
  let len = sh.len, grew = 0, best: Built | undefined;
  for (; grew < 14; grew++) {
    const k = len / length(smooth);
    const n = Math.round(len / SPACING);
    let loop = resample(smooth.map((p) => ({ x: p.x * k, y: p.y * k })), n);
    const limits: Limits = { ...LIMITS, exempt: exemptFor(loop) };
    const pre = measure(loop, loop, limits);
    loop = straighten(loop, 0, 11, 7);
    if ((pre.minRadius < PRE_R || pre.minGap < limits.gap * 1.02) && len < MAX_LEN && grew < 13) { len *= 1.05; continue; }
    const { points, report } = fit(loop, limits, 60, 11);
    const minX = Math.min(...points.map((p) => p.x)), minY = Math.min(...points.map((p) => p.y));
    const game = points.map((p) => ({ x: p.x - minX + MARGIN, y: p.y - minY + MARGIN }));
    const r = measure(game, loop.map((p) => ({ x: p.x - minX + MARGIN, y: p.y - minY + MARGIN })), limits);
    const ok = r.minRadius >= limits.rMin * 0.9 && r.minGap >= limits.gap * 0.92;
    const flatPts = game.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
    best = { points: flatPts, fx: placeFx(id, flatPts, want), len: Math.round(length(game)), grew, ok, report: `${Math.round(length(game))} units, R>=${report.minRadius.toFixed(0)} gap>=${report.minGap.toFixed(0)} drift mean ${r.meanDrift.toFixed(0)} max ${r.worstDrift.toFixed(0)}` };
    if (ok) break;
    len *= 1.05;
  }
  return best!;
}

{
  const dataFile = here("../../packages/sim/src/kartdata.ts");
  const text = readFileSync(dataFile, "utf8");
  const out: Record<string, { points: number[]; fx?: Built["fx"] }> = {};
  let bad = 0;
  for (const [id, sh] of Object.entries(shapes)) {
    if (!known.has(id)) { console.log(`${id}: not in the roster`); bad++; continue; }
    if (only.length && !only.includes(id)) {
      // keep what is already built
      const prev = JSON.parse(text.slice(text.indexOf("= ", text.indexOf("/* data */")) + 2).replace(/;\s*$/, ""))[id];
      if (prev) out[id] = prev;
      continue;
    }
    const b = buildShape(id, sh);
    console.log(`${b.ok ? "ok " : "BAD"} ${id.padEnd(28)} ${b.report}${b.grew ? ` (grown ${b.grew}x)` : ""}`);
    if (!b.ok) bad++;
    out[id] = { points: b.points, ...(b.fx.length ? { fx: b.fx } : {}) };
  }
  // roster order, so the file does not depend on the order the shapes were written in
  const sorted: typeof out = {};
  for (const r of roster) if (out[r.id]) sorted[r.id] = out[r.id]!;
  writeFileSync(dataFile, text.slice(0, text.indexOf("/* data */")) + `/* data */\nexport const KART_DATA: Record<string, KartShape> = ${JSON.stringify(sorted)};\n`);
  console.log(`${Object.keys(sorted).length} courses in kartdata.ts, ${bad} problems`);
  process.exit(bad ? 1 : 0);
}
void existsSync;
