import { readFileSync } from "node:fs";
import { fit, length, measure, resample, smoothLoop, straighten } from "../circuits/process.ts";
const id = process.argv[2]!;
const sh = JSON.parse(readFileSync(new URL("./shapes/smk.json", import.meta.url), "utf8"))[id];
const raw = sh.pts.map(([x, y]: number[]) => ({ x, y }));
const dense = resample(raw, 600);
const dev = (p: { x: number; y: number }[], k: number, ox = 0, oy = 0): string => {
  // mean / max distance from each point to the nearest point of the raw loop (scaled by k, shifted so the centroids agree)
  const cx = p.reduce((a, q) => a + q.x, 0) / p.length, cy = p.reduce((a, q) => a + q.y, 0) / p.length;
  const rx = dense.reduce((a, q) => a + q.x * k, 0) / dense.length, ry = dense.reduce((a, q) => a + q.y * k, 0) / dense.length;
  let sum = 0, mx = 0;
  for (const q of p) { let b = Infinity; for (const r of dense) b = Math.min(b, Math.hypot(q.x - cx - (r.x * k - rx), q.y - cy - (r.y * k - ry))); sum += b; mx = Math.max(mx, b); }
  return `mean ${(sum / p.length).toFixed(1)} max ${mx.toFixed(1)}`;
};
const smooth = smoothLoop(resample(raw, 240), 5, 0.5);
const len = sh.len * 1.2;
const k = len / length(smooth);
let loop = resample(smooth.map((p) => ({ x: p.x * k, y: p.y * k })), Math.round(len / 10));
const kk = len / length(raw);
console.log(id, "raw scale", kk.toFixed(3), "smoothed:", dev(loop, kk));
loop = straighten(loop, 0, 11, 7);
console.log("  straightened:", dev(loop, kk));
const r = fit(loop, { rMin: 26, gap: 56, near: 150 }, 60, 18);
console.log("  fitted:", dev(r.points, kk), "R", r.report.minRadius.toFixed(0), "iterations", r.report.iterations);
