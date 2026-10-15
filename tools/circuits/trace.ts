import { readFileSync, writeFileSync } from "node:fs";
import type { Pt } from "./osm.ts";
import { dist, fit, length, measure, resample, smoothLoop, straighten, type Limits } from "./process.ts";

/**
 * A fictional circuit from a track-map image: trace_image.py turns the picture into cache/<id>.trace.json (pixels, round the loop),
 * and this scales it to the circuit's length, puts the start line on its longest straight, and bends it the least that makes a road
 * the game can use, as build.ts does for the mapped ones. The result is merged into packages/sim/src/circuitData.ts.
 * The picture is a reference only and stays out of the repository (tools/circuits/cache is not committed).
 *   node --no-warnings tools/circuits/trace.ts lago-maggiore 5809 0.9
 */
const here = (f: string) => new URL(f, import.meta.url);
const LIMITS: Limits = { rMin: 36, gap: 60, near: 170 };
const SPACING = 10;
const margin = 180;

const [id, metresText, scaleText] = process.argv.slice(2);
if (!id || !metresText) throw new Error("usage: trace.ts <id> <lap metres> [units per metre]");
const metres = Number(metresText), scale = Number(scaleText ?? 0.9);
const raw: number[][] = JSON.parse(readFileSync(here(`./cache/${id}.trace.json`), "utf8"));
let pts: Pt[] = raw.map(([x, y]) => ({ x: x!, y: y! }));
// the picture is in pixels: scale the loop to the real lap length, then to game units
const k = metres / length(pts);
pts = pts.map((p) => ({ x: p.x * k, y: p.y * k }));
const fine = smoothLoop(resample(pts, Math.round(metres / 3)), 8, 0.5);
const n = Math.round((metres * scale) / SPACING);
let loop = resample(fine, n).map((p) => ({ x: p.x * scale, y: p.y * scale }));

// the straightest stretch of 600 m (the longest straight is about 800) is where the start line goes, at its middle
const win = Math.round((600 * scale) / SPACING);
const bend = (at: number): number => {
  const a = loop[(at - win / 2 + n) % n]!, b = loop[(at + win / 2) % n]!, len = dist(a, b) || 1;
  let worst = 0;
  for (let j = -win / 2; j <= win / 2; j++) {
    const q = loop[(at + j + n) % n]!;
    worst = Math.max(worst, Math.abs(((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / len));
  }
  return worst;
};
let startIdx = 0, best = Infinity;
for (let i = 0; i < n; i++) { const b = bend(i); if (b < best) { best = b; startIdx = i; } }
console.log(`${id}: start on the straightest ${600} m (bend ${best.toFixed(1)} units), sample ${startIdx} of ${n}`);

// driven so that the first corner after the straight is a left (screen y points down, so a left turn has a negative cross product)
const turnAfter = (p: Pt[], at: number): number => {
  const nn = p.length, step = Math.round(60 / (SPACING / scale));
  let sum = 0;
  for (let j = Math.round(win / 2); j < Math.round(win / 2) + 80; j++) {
    const a = p[(at + j) % nn]!, b = p[(at + j + step) % nn]!, c = p[(at + j + 2 * step) % nn]!;
    sum += (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  }
  return sum;
};
// the start line is at the end of the straight, with the run-up behind it: begin half a window before the middle
if (turnAfter(loop, startIdx) > 0) { loop = [...loop].reverse(); startIdx = n - 1 - startIdx; }
const at = (startIdx - Math.round(win / 2) + n) % n;
const fromStart = [...loop.slice(at), ...loop.slice(0, at)];
const start = straighten(fromStart, 0, 18, 14);
const { points, report } = fit(start, LIMITS, 60, 18);
const minX = Math.min(...points.map((p) => p.x)), minY = Math.min(...points.map((p) => p.y));
const game = points.map((p) => ({ x: p.x - minX + margin, y: p.y - minY + margin }));
const r = measure(game, start, LIMITS);
console.log(`${id}: ${(length(game) / 1000).toFixed(2)}k units, R>=${report.minRadius.toFixed(0)} gap>=${report.minGap.toFixed(0)}, drift mean ${r.meanDrift.toFixed(0)} max ${r.worstDrift.toFixed(0)} units`);

const dataFile = here("../../packages/sim/src/circuitData.ts");
const text = readFileSync(dataFile, "utf8");
const out: Record<string, number[]> = JSON.parse(text.slice(text.indexOf("= ", text.indexOf("/* data */")) + 2).replace(/;\s*$/, ""));
out[id] = game.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
writeFileSync(dataFile, text.slice(0, text.indexOf("/* data */")) + `/* data */\nexport const CIRCUIT_DATA: Record<string, number[]> = ${JSON.stringify(out)};\n`);
const W = Math.max(...game.map((p) => p.x)) + 30, H = Math.max(...game.map((p) => p.y)) + 30;
const path = `M${game.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join("L")}Z`;
writeFileSync(here(`./cache/${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="800" height="${Math.round((800 * H) / W)}"><rect width="100%" height="100%" fill="#1b1e26"/><path d="${path}" fill="none" stroke="#fff" stroke-width="4"/><circle cx="${game[0]!.x}" cy="${game[0]!.y}" r="8" fill="#ffd84a"/></svg>`);
