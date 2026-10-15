import { CAR_R, centreAt, halfAt, type Segment, type Track } from "./track.ts";
import { makeLine, validateLine, type Line } from "./line.ts";
import { routesOf } from "./branches.ts";
import { buildProfile } from "./profile.ts";
import { defaultCar } from "./car.ts";
import { Rng } from "./rng.ts";
import { tyreGrip, type Compound } from "./tyres.ts";
import type { WetField } from "./trackwet.ts";
import { add, dot, mul, sub, type Vec2 } from "./vec.ts";

const TS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
/** How far from the centre line a car may be put, given half the road width there. */
const limitOf = (half: number): number => half - CAR_R - 1.5;

interface Wp { seg: number; t: number; lo: number; hi: number; l: number }

/** Obstacle clearance along the lateral axis, so waypoints near a rock take the free side. */
function constraintsFor(seg: Segment, t: number): { lo: number; hi: number } {
  const LIMIT = limitOf(halfAt(seg, t));
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
  const c = centreAt(track.allSegments[w.seg]!, w.t);
  return add(c.p, mul(c.n, w.l));
};

/**
 * A racing line from the track geometry: waypoints along every segment relaxed toward a smooth, quick path (wide in, clip
 * the apex, wide out), kept clear of obstacles. Each pass pulls a waypoint toward the middle of its neighbours (the shortest
 * path) and away from kinks (the path of least curvature); `curve` blends the two. `skill` in [0, 1]: lower drifts further
 * from the ideal line, but only ever as a slow wander, never as jitter, so a bad driver is slow and not a weaver.
 */
export interface BotLineOpts {
  /** the segment ids to drive, in order (a complete route round the track); left out, the driver picks one */
  route?: number[];
  /** the tyre the car is on, and the state of the road: the line then leans toward the grippiest bit of road */
  compound?: Compound;
  field?: WetField;
}

/** How much of the pull is toward least curvature rather than the shortest path: 0.6 laps quickest on most tracks. */
const CURVE = 0.6;
/** Waypoints are about this far apart, so a wander of this many of them is a slow one. */
const WANDER_SPAN = 36;
const WANDER_MAX = 7;

const TIMES = new WeakMap<Track, number[]>();

/** Flying-lap time of the quickest bot line on every complete route round the track, in the order `routesOf` gives them. */
function routeTimes(track: Track): number[] {
  let t = TIMES.get(track);
  if (!t) {
    t = routesOf(track).map((route) => buildProfile(track, botLine(track, 0x51ed, 1, { route }), defaultCar()).ideal);
    TIMES.set(track, t);
  }
  return t;
}

/**
 * The way a driver goes round a track with shortcuts: usually the quickest, and the better the driver the more often. A weaker
 * one sometimes takes another way (from the same seed, the same every time). `prefix` is a part of a route already fixed.
 */
export function chooseRoute(track: Track, seed: number, skill: number, prefix: number[] = []): number[] {
  const routes = routesOf(track);
  if (routes.length === 1) return routes[0]!;
  const times = routeTimes(track);
  const ok = routes.map((_, i) => i).filter((i) => prefix.every((id, k) => routes[i]![k] === id));
  const pool = ok.length ? ok : routes.map((_, i) => i);
  const best = pool.reduce((a, i) => (times[i]! < times[a]! ? i : a), pool[0]!);
  const rng = new Rng((seed ^ 0x2f1d9a53) >>> 0);
  if (pool.length === 1 || rng.next() < 0.55 + 0.45 * skill) return routes[best]!;
  const others = pool.filter((i) => i !== best);
  return routes[others[rng.int(others.length)]!]!;
}

export function botLine(track: Track, seed: number, skill: number, opts: BotLineOpts = {}): Line {
  const route = opts.route ?? chooseRoute(track, seed, skill);
  const rng = new Rng(seed);
  const phase = [rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI)];
  const wps: Wp[] = [];
  for (const id of route) {
    const s = track.allSegments[id]!;
    for (const t of TS) {
      const { lo, hi } = constraintsFor(s, t);
      wps.push({ seg: s.index, t, lo, hi, l: Math.min(Math.max(0, lo), hi) });
    }
  }
  const m = wps.length;
  // where each waypoint sits on the centre line, and which way is across the road
  const base = wps.map((w) => centreAt(track.allSegments[w.seg]!, w.t));
  const px = new Float64Array(m), py = new Float64Array(m);
  const place = () => { for (let k = 0; k < m; k++) { const w = wps[k]!, c = base[k]!; px[k] = c.p.x + c.n.x * w.l; py[k] = c.p.y + c.n.y * w.l; } };
  const relax = (iterations: number, curve: number) => {
    const dx = new Float64Array(m), dy = new Float64Array(m);
    for (let it = 0; it < iterations; it++) {
      place();
      for (let k = 0; k < m; k++) {
        const a = (k + m - 1) % m, b = (k + 1) % m;
        dx[k] = px[a]! - 2 * px[k]! + px[b]!;
        dy[k] = py[a]! - 2 * py[k]! + py[b]!;
      }
      for (let k = 0; k < m; k++) {
        const w = wps[k]!, n = base[k]!.n;
        const a = (k + m - 1) % m, b = (k + 1) % m;
        // along the normal: how far the midpoint of the neighbours lies (shortest path), and the bending-energy gradient
        const toMid = (dx[k]! * n.x + dy[k]! * n.y) / 2;
        const bend = (dx[a]! - 2 * dx[k]! + dx[b]!) * n.x + (dy[a]! - 2 * dy[k]! + dy[b]!) * n.y;
        const step = (1 - curve) * 0.5 * toMid * 2 - curve * 0.07 * bend;
        w.l = Math.min(w.hi, Math.max(w.lo, w.l + step));
      }
    }
  };
  const lean = () => {
    // on a wet or a rubbered road the best line is not always the shortest: lean toward the grip this tyre wants
    const { compound, field } = opts;
    if (!compound || !field) return;
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
  };
  const emit = (prune: boolean): Line | null => {
    const pts = wps.map((w) => position(track, w));
    const start = pts[pts.length - 1]!;
    const segs: Vec2[][] = [];
    let k = 0;
    for (let s = 0; s < route.length; s++) { segs.push(pts.slice(k, k + TS.length)); k += TS.length; }
    const line: Line = makeLine(start, prune ? pruneKinks(start, segs) : segs, route);
    return validateLine(track, line).ok ? line : null;
  };
  const iterations = 220;
  // a slow wander, the same shape every lap, whose size is the driver's lack of skill
  const wander = (amount: number) => {
    if (amount <= 0) return;
    for (let k = 0; k < m; k++) {
      const w = wps[k]!;
      const f = Math.sin((2 * Math.PI * k) / WANDER_SPAN + phase[0]!) * 0.65 + Math.sin((2 * Math.PI * k) / (WANDER_SPAN * 2.3) + phase[1]!) * 0.35;
      w.l = Math.min(w.hi, Math.max(w.lo, w.l + f * amount));
    }
  };
  const amount = (1 - skill) * WANDER_MAX;
  const initial = wps.map((w) => w.l);
  const fresh = () => wps.forEach((w, k) => { w.l = initial[k]!; });
  // the wander is dropped if it spoils the line; so is the pruning, as a last resort
  relax(iterations, CURVE);
  lean();
  const saved = wps.map((w) => w.l);
  for (const wob of [amount, 0]) {
    wps.forEach((w, k) => { w.l = saved[k]!; });
    wander(wob);
    const line = emit(true) ?? emit(false);
    if (line) return line;
  }
  fresh();
  relax(iterations, 0);
  const plain = emit(true) ?? emit(false);
  if (plain) return plain;
  return fallbackLine(track, route);
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
function fallbackLine(track: Track, route: number[]): Line {
  const pts: Vec2[][] = route.map((id) => track.allSegments[id]!).map((s) =>
    TS.map((t) => {
      const { lo, hi } = constraintsFor(s, t);
      const c = centreAt(s, t);
      return add(c.p, mul(c.n, Math.min(Math.max(0, lo), hi)));
    }));
  return makeLine(pts.at(-1)!.at(-1)!, pts, route);
}

