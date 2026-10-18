import { execFileSync } from "node:child_process";
import { length, resample } from "./process.ts";
import type { Pt } from "./osm.ts";

/**
 * How high the ground is along a lap, from the Open-Meteo elevation API (Copernicus GLO-90, a height every 90 m): enough for the
 * hills of a circuit (Eau Rouge, the Corkscrew, the Nordschleife's climbs), not for a kerb. Used by build.ts when RELIEF=1.
 * Data: Copernicus DEM (c) ESA / the European Union, via Open-Meteo.com (CC BY 4.0); see docs/CIRCUIT_CREDITS.md.
 */
const API = "https://api.open-meteo.com/v1/elevation";
const BATCH = 100;

/** `real` is the lap in metres east and south of `ref` (the projection of osm.ts), driven from the start line round to it again. Returns heights in metres above the lowest point, a sample every `spacing` metres, the first at the start line. */
export function heightsAlong(real: Pt[], ref: [number, number], spacing = 40): number[] {
  const m = Math.max(24, Math.round(length([...real, real[0]!]) / spacing));
  const pts = resample(real, m);
  const kx = 111320 * Math.cos((ref[0] * Math.PI) / 180), ky = 110574;
  const lat = pts.map((p) => ref[0] - p.y / ky), lon = pts.map((p) => ref[1] + p.x / kx);
  const h: number[] = [];
  for (let i = 0; i < m; i += BATCH) {
    const la = lat.slice(i, i + BATCH).map((x) => x.toFixed(5)).join(","), lo = lon.slice(i, i + BATCH).map((x) => x.toFixed(5)).join(",");
    let body = "";
    const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    for (let attempt = 0; attempt < 8; attempt++) {
      try { body = execFileSync("curl", ["-s", "-m", "40", `${API}?latitude=${la}&longitude=${lo}`], { encoding: "utf8" }); if (JSON.parse(body).elevation) break; } catch { /* try again */ }
      sleep(/limit/i.test(body) ? 65_000 : 2000 * (attempt + 1)); // (the free tier allows so many requests a minute)
    }
    const got: number[] | undefined = JSON.parse(body || "{}").elevation;
    if (!got || got.length !== Math.min(BATCH, m - i)) throw new Error(`elevation: bad answer for samples ${i}..${i + BATCH}: ${body.slice(0, 120)}`);
    h.push(...got);
  }
  // the 90 m grid is blocky: smooth over three samples (round a closed lap), then measure from the lowest point
  const sm = h.map((_, i) => (h[(i - 1 + m) % m]! + 2 * h[i]! + h[(i + 1) % m]!) / 4);
  const low = Math.min(...sm);
  return sm.map((x) => Math.round((x - low) * 10) / 10);
}
