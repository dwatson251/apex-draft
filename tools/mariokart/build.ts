import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Pt } from "../circuits/osm.ts";
import { fit, length, measure, resample, smoothLoop, straighten, type Limits } from "../circuits/process.ts";

/**
 * shapes/<game>.json (the waypoints of each course, hand-placed over the wiki's map and described by its text, in the picture's 0..1000 units, first point on the start
 * line, in driving order) -> packages/sim/src/kartdata.ts (each course as a drivable loop in game units, with its pieces). The waypoints are smoothed, scaled
 * to the lap length the shape asks for, the start straightened for the pit lane, and bent the least that makes a road the game can use (as tools/circuits does);
 * when that cannot be done the lap is made longer until it can. Writing the same shapes again gives the same file.
 *   node --no-warnings tools/mariokart/build.ts [id ...]
 */
interface FxSpec { leg: number; to?: number; a: number; b: number; type: string; power?: number }
interface Shape { pts: [number, number][]; len: number; fx?: FxSpec[]; notes?: string }
const here = (f: string) => new URL(f, import.meta.url);
const LIMITS: Limits = { rMin: 36, gap: 60, near: 170 };
const SPACING = 10, MARGIN = 180;

const shapes: Record<string, Shape> = {};
for (const f of readdirSync(here("./shapes/"))) if (f.endsWith(".json")) Object.assign(shapes, JSON.parse(readFileSync(here(`./shapes/${f}`), "utf8")));
const only = process.argv.slice(2);
const roster: { id: string }[] = JSON.parse(readFileSync(here("./roster.json"), "utf8"));
const known = new Set(roster.map((r) => r.id));

export interface Built { points: number[]; fx: { at: number; len: number; type: string; power?: number }[]; len: number; grew: number; report: string; ok: boolean }

export function buildShape(id: string, sh: Shape): Built {
  const raw: Pt[] = sh.pts.map(([x, y]) => ({ x, y }));
  // where each waypoint is along the authored loop, as a fraction of it (the pieces are placed against these)
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) cum.push(cum[i - 1]! + Math.hypot(raw[i % raw.length]!.x - raw[i - 1]!.x, raw[i % raw.length]!.y - raw[i - 1]!.y));
  const total = cum.at(-1)!;
  const frac = (leg: number, t: number): number => (cum[leg]! + t * (cum[leg + 1]! - cum[leg]!)) / total;
  const fx = (sh.fx ?? []).map((f) => {
    const at = frac(f.leg, f.a), end = frac(f.to ?? f.leg, f.b);
    return { at: Math.round(at * 10000) / 10000, len: Math.round(Math.max(end - at, 0.002) * 10000) / 10000, type: f.type, ...(f.power !== undefined ? { power: f.power } : {}) };
  });
  const smooth = smoothLoop(resample(raw, 240), 6, 0.5);
  let len = sh.len, grew = 0, best: Built | undefined;
  for (; grew < 8; grew++) {
    const k = len / length(smooth);
    const n = Math.round(len / SPACING);
    let loop = resample(smooth.map((p) => ({ x: p.x * k, y: p.y * k })), n);
    loop = straighten(loop, 0, 18, 14);
    const { points, report } = fit(loop, LIMITS, 60, 18);
    const minX = Math.min(...points.map((p) => p.x)), minY = Math.min(...points.map((p) => p.y));
    const game = points.map((p) => ({ x: p.x - minX + MARGIN, y: p.y - minY + MARGIN }));
    const r = measure(game, loop.map((p) => ({ x: p.x - minX + MARGIN, y: p.y - minY + MARGIN })), LIMITS);
    const ok = r.minRadius >= LIMITS.rMin * 0.9 && r.minGap >= LIMITS.gap * 0.95;
    best = { points: game.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]), fx, len: Math.round(length(game)), grew, ok, report: `${Math.round(length(game))} units, R>=${report.minRadius.toFixed(0)} gap>=${report.minGap.toFixed(0)} drift mean ${r.meanDrift.toFixed(0)} max ${r.worstDrift.toFixed(0)}` };
    if (ok) break;
    len *= 1.08;
  }
  return best!;
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
