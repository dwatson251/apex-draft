import { CAR_R, ROAD_HALF, centreAt, type Segment, type Track } from "./track.ts";
import { validateLine, type Line } from "./line.ts";
import { Rng } from "./rng.ts";
import { add, dot, mul, sub, type Vec2 } from "./vec.ts";

const TS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
const LIMIT = ROAD_HALF - CAR_R - 1.5;

interface Wp { seg: number; t: number; lo: number; hi: number; l: number }

/** Obstacle clearance along the lateral axis, so waypoints near a rock take the free side. */
function constraintsFor(seg: Segment, t: number): { lo: number; hi: number } {
  let lo = -LIMIT, hi = LIMIT;
  for (const o of seg.obstacles) {
    // find the obstacle's t and lateral offset on the centreline
    let bi = 0, bd = Infinity;
    seg.center.forEach((c, i) => { const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < bd) { bd = d; bi = i; } });
    const ot = bi / (seg.center.length - 1);
    const lat = (o.x - seg.center[bi]!.x) * seg.normals[bi]!.x + (o.y - seg.center[bi]!.y) * seg.normals[bi]!.y;
    if (Math.abs(t - ot) * 100 > o.r + 14) continue;
    const need = o.r + CAR_R + 4;
    const upper = lat + need, lower = lat - need;
    // pick the side that needs the smaller lateral swing
    if (Math.abs(upper) <= Math.abs(lower) && upper <= LIMIT) lo = Math.max(lo, upper);
    else if (lower >= -LIMIT) hi = Math.min(hi, lower);
    else lo = Math.max(lo, upper);
  }
  return { lo, hi };
}

const position = (track: Track, w: Wp): Vec2 => {
  const c = centreAt(track.segments[w.seg]!, w.t);
  return add(c.p, mul(c.n, w.l));
};

/**
 * A racing line from the track geometry: waypoints along every segment relaxed toward the shortest path
 * (wide in, clip the apex, wide out), kept clear of obstacles. `skill` in [0, 1]: lower is sloppier.
 */
export function botLine(track: Track, seed: number, skill: number): Line {
  const rng = new Rng(seed);
  const build = (noise: number, iterations: number): Line | null => {
    const wps: Wp[] = [];
    for (const s of track.segments) {
      for (const t of TS) {
        const { lo, hi } = constraintsFor(s, t);
        const mid = Math.min(Math.max(0, lo), hi);
        wps.push({ seg: s.index, t, lo, hi, l: mid });
      }
    }
    // the final waypoint is the start; keep it on the gate
    for (let it = 0; it < iterations; it++) {
      for (let k = 0; k < wps.length; k++) {
        const w = wps[k]!;
        const prev = position(track, wps[(k + wps.length - 1) % wps.length]!);
        const next = position(track, wps[(k + 1) % wps.length]!);
        const c = centreAt(track.segments[w.seg]!, w.t);
        const want = dot(sub({ x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 }, c.p), c.n);
        w.l = Math.min(w.hi, Math.max(w.lo, w.l + (want - w.l) * 0.5));
      }
    }
    if (noise > 0) for (const w of wps) w.l = Math.min(w.hi, Math.max(w.lo, w.l + rng.range(-noise, noise)));
    const pts = wps.map((w) => position(track, w));
    const start = pts[pts.length - 1]!;
    const segs: Vec2[][] = [];
    let k = 0;
    for (const s of track.segments) { segs.push(pts.slice(k, k + TS.length)); k += TS.length; void s; }
    const line: Line = { start, segs };
    return validateLine(track, line).ok ? line : null;
  };
  const iterations = Math.round(8 + 60 * skill);
  const noise = (1 - skill) * 6;
  return build(noise, iterations) ?? build(0, iterations) ?? build(0, 0) ?? fallbackLine(track);
}

/** Centreline detouring around obstacles: always valid by construction of the track. */
function fallbackLine(track: Track): Line {
  const pts: Vec2[][] = track.segments.map((s) =>
    TS.map((t) => {
      const { lo, hi } = constraintsFor(s, t);
      const c = centreAt(s, t);
      return add(c.p, mul(c.n, Math.min(Math.max(0, lo), hi)));
    }));
  return { start: pts.at(-1)!.at(-1)!, segs: pts };
}

