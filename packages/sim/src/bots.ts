import { CAR_R, ROAD_HALF, centreAt, type Segment, type Track } from "./track.ts";
import { validateLine, type Line } from "./line.ts";
import { Rng } from "./rng.ts";
import { tyreGrip, type Compound } from "./tyres.ts";
import type { WetField } from "./trackwet.ts";
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
export interface BotLineOpts {
  /** the tyre the car is on, and the state of the road: the line then leans toward the grippiest bit of road */
  compound?: Compound;
  field?: WetField;
}

export function botLine(track: Track, seed: number, skill: number, opts: BotLineOpts = {}): Line {
  const rng = new Rng(seed);
  const build = (noise: number, iterations: number, prune = true): Line | null => {
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
    // on a wet or a rubbered road the best line is not always the shortest: lean toward the grip this tyre wants
    const { compound, field } = opts;
    if (compound && field) {
      for (const w of wps) {
        let best = w.l, bestScore = -Infinity;
        for (let l = Math.max(w.lo, w.l - 14); l <= Math.min(w.hi, w.l + 14); l += 2) {
          const q = position(track, { ...w, l }), c = field.cellAt(q.x, q.y);
          const g = c < 0 ? 1 : tyreGrip(compound, field.wet[c]!, field.use[c]!);
          const score = g - 0.004 * Math.abs(l - w.l);
          if (score > bestScore) { bestScore = score; best = l; }
        }
        w.l = best;
      }
    }
    if (noise > 0) for (const w of wps) w.l = Math.min(w.hi, Math.max(w.lo, w.l + rng.range(-noise, noise)));
    const pts = wps.map((w) => position(track, w));
    const start = pts[pts.length - 1]!;
    const segs: Vec2[][] = [];
    let k = 0;
    for (const s of track.segments) { segs.push(pts.slice(k, k + TS.length)); k += TS.length; void s; }
    const line: Line = { start, segs: prune ? pruneKinks(start, segs) : segs };
    return validateLine(track, line).ok ? line : null;
  };
  const iterations = Math.round(8 + 60 * skill);
  const noise = (1 - skill) * 6;
  return build(noise, iterations) ?? build(0, iterations) ?? build(0, iterations, false) ?? build(0, 0, false) ?? fallbackLine(track);
}

const turn = (a: Vec2, b: Vec2, c: Vec2): number => {
  const u = sub(b, a), v = sub(c, b);
  return Math.abs(Math.atan2(u.x * v.y - u.y * v.x, dot(u, v)));
};

/** Drop inner waypoints that make the line double back on itself (sharp corners can leave one just past a gate). */
function pruneKinks(start: Vec2, segs: Vec2[][]): Vec2[][] {
  // first merge inner waypoints crowded up against the one before them (or the gate) into their midpoint
  let prevEnd = start;
  const out = segs.map((s) => {
    const gate = s[s.length - 1]!;
    const kept: Vec2[] = [];
    for (let k = 0; k < s.length - 1; k++) {
      const p = s[k]!, ref = kept.at(-1) ?? prevEnd;
      if (Math.hypot(p.x - ref.x, p.y - ref.y) < 7 && kept.length) kept[kept.length - 1] = { x: (ref.x + p.x) / 2, y: (ref.y + p.y) / 2 };
      else if (Math.hypot(p.x - ref.x, p.y - ref.y) >= 7 && Math.hypot(p.x - gate.x, p.y - gate.y) >= 7) kept.push(p);
    }
    kept.push(gate);
    prevEnd = gate;
    return kept;
  });
  const MAX_TURN = 1.0;
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    const flat: { si: number; ki: number; p: Vec2 }[] = [];
    out.forEach((s, si) => s.forEach((p, ki) => flat.push({ si, ki, p })));
    for (let i = flat.length - 2; i >= 0; i--) {
      const cur = flat[i]!;
      if (cur.ki === out[cur.si]!.length - 1) continue; // gates stay
      const before = i > 0 ? flat[i - 1]!.p : start;
      const after = flat[i + 1]!.p;
      const beforeBefore = i > 1 ? flat[i - 2]!.p : start;
      if (turn(before, cur.p, after) > MAX_TURN || (i > 0 && turn(beforeBefore, before, cur.p) > MAX_TURN)) {
        out[cur.si]!.splice(cur.ki, 1);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return out;
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

