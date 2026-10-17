import { carStats, type CarConfig } from "./car.ts";
import { quirksOf } from "./quirks.ts";
import { terrainMul } from "./biomes.ts";
import { BOOST_FX_ACCEL, BOOST_FX_TOP, FX_GROUND, isRamp } from "./fx.ts";
import { GRADE_ACCEL, GRADE_BRAKE, GRADE_TOP, SURFACES } from "./landscape.ts";
import { vehicleOf } from "./vehicles.ts";
import { lapCurve, type Line } from "./line.ts";
import { PIT_SPEED } from "./pit.ts";
import { applyPit } from "./pitpath.ts";
import { ROAD_HALF, ringCum, type Track } from "./track.ts";
import { dist } from "./vec.ts";

/** Spacing of the resampled path, in units. */
export const DS = 2;

export const BOOST_TOP = 1.3;
export const BOOST_ACCEL = 1.6;
export const GRIP_BONUS = 1.45;

/** A closed lap sampled evenly, with the speed the car can carry at every sample. */
export interface Profile {
  n: number;
  ds: number;
  length: number;
  x: Float64Array;
  y: Float64Array;
  /** heading in radians */
  h: Float64Array;
  seg: Int32Array;
  /** half the width of the road at each sample */
  half: Float64Array;
  /** how far round the ring the car is at each sample, whichever line it is on and whichever way it went (for ranking) */
  canon: Float64Array;
  /** speed limit after braking for what is ahead */
  vLim: Float64Array;
  accelMul: Float64Array;
  /** braking at each sample relative to the car's own (hills, rough surface); 1 on the flat and on tarmac */
  brakeMul: Float64Array;
  /** grip at each sample relative to tarmac (rough surface, banking); 1 on ordinary road */
  gripMul: Float64Array;
  ghost: Uint8Array;
  /** 1 at the sample where a ramp launches a car, with the ramp's power in `jumpPower`; 0 elsewhere (a lap with no ramp has none of this) */
  jump: Uint8Array;
  jumpPower: Float64Array;
  /** time for a flying lap on this line, seconds */
  ideal: number;
  /** powerup segments whose pickup the line drives through */
  pickups: number[];
  /** curvature at each sample, 1/units */
  kap: Float64Array;
  /** inside the speed-limited part of the pit lane */
  lane: Uint8Array;
  /** a lap that starts in the pit lane or ends in it: its end does not join its start, so it is not a loop */
  open: boolean;
  /** where the car stops in its pit box, when this lap pits */
  pitS?: number;
  /** distance along the lap where the pit lane starts, when this lap pits */
  pitFromS?: number;
}

export interface ProfileOpts {
  /** this lap ends by driving into the pit lane */
  pitIn?: boolean;
  /** this lap starts by driving out of the pit lane */
  pitOut?: boolean;
  /** multiplies cornering grip: worn tyres */
  grip?: number;
  /** multiplies acceleration: a heavy tank */
  accel?: number;
  /** multiplies braking: slippery surfaces */
  brake?: number;
  /** grip of the tyres at each point of the road (wet and dry patches); defaults to 1 everywhere */
  gripAt?: (x: number, y: number) => number;
  /** drive at this fraction of what the car can do (1 if left out): top speed and acceleration scale with it, and cornering with its square, so corners go by at that fraction too */
  pace?: number;
}

/** Road narrower than this (half width) slows the cars: the speed limit is PINCH_SPEED per unit of half-width. */
const PINCH_FREE = 18;
const PINCH_SPEED = 5.2;

export function buildProfile(track: Track, line: Line, car: CarConfig, opts: ProfileOpts = {}): Profile {
  const st = carStats(car);
  const q = quirksOf(car.type);
  st.aLat *= opts.grip ?? 1;
  st.brake *= opts.brake ?? 1;
  const pace = opts.pace ?? 1;
  if (pace !== 1) { st.vTop *= pace; st.accel *= pace; st.aLat *= pace * pace; }
  const pitIn = !!opts.pitIn, pitOut = !!opts.pitOut;
  const lapPit = applyPit(track, lapCurve(line, track.segments.length), pitIn, pitOut);
  const dense = lapPit.dense;
  // cumulative length
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1]! + dist(dense[i - 1]!.p, dense[i]!.p));
  const total = cum.at(-1)!;
  const pitS = pitIn && lapPit.boxIdx >= 0 ? cum[lapPit.boxIdx]! : undefined;
  const n = Math.max(8, Math.round(total / DS));
  const ds = total / n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const seg = new Int32Array(n);
  const lane = new Uint8Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (j < dense.length - 2 && cum[j + 1]! < s) j++;
    const span = cum[j + 1]! - cum[j]!;
    const u = span < 1e-9 ? 0 : (s - cum[j]!) / span;
    const a = dense[j]!.p;
    const b = dense[j + 1]!.p;
    x[i] = a.x + (b.x - a.x) * u;
    y[i] = a.y + (b.y - a.y) * u;
    seg[i] = dense[j + 1]!.seg;
    lane[i] = lapPit.lane[j + 1] ? 1 : 0;
  }
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    h[i] = Math.atan2(y[b]! - y[a]!, x[b]! - x[a]!);
  }

  // how wide the road is under each sample (only fun tracks change it)
  const half = new Float64Array(n).fill(ROAD_HALF);
  if (track.segments.some((s) => s.half)) {
    for (let i = 0; i < n; i++) {
      const sg = track.segments[seg[i]!];
      if (!sg?.half) continue;
      let bd = Infinity;
      for (let q = 0; q < sg.center.length; q++) {
        const d = (sg.center[q]!.x - x[i]!) ** 2 + (sg.center[q]!.y - y[i]!) ** 2;
        if (d < bd) { bd = d; half[i] = sg.half[q]!; }
      }
    }
  }

  // Rank cars by where they are on the ring, not by how far along their own line they are: lines are different lengths (an inside line, a lane, a line
  // someone drew), and over a lap the difference is tens of units, which is a good few places in a field. Inside each segment a car's place is the share of
  // its own stretch of line there is behind it, taken of the segment's own length on the ring, so every line agrees at every gate. With shortcuts, laps are
  // different lengths as well, and a shortcut counts as the stretch it replaces.
  const canon = new Float64Array(n);
  {
    const ring = ringCum(track), nr = track.segments.length;
    const first = new Map<number, number>(), lastAt = new Map<number, number>();
    for (let i = 0; i < n; i++) { const q = seg[i]!; if (!first.has(q)) first.set(q, i * ds); lastAt.set(q, i * ds); }
    const inBranch = new Map<number, { s0: number; s1: number; c0: number; c1: number }>();
    for (const b of track.branches) {
      let s0 = Infinity, s1 = -Infinity;
      for (const id of b.segs) { if (first.has(id)) { s0 = Math.min(s0, first.get(id)!); s1 = Math.max(s1, lastAt.get(id)!); } }
      if (s1 < s0) continue;
      const span = { s0, s1, c0: ring[b.fork]!, c1: ring[b.rejoin + 1]! };
      for (const id of b.segs) inBranch.set(id, span);
    }
    for (let i = 0; i < n; i++) {
      const q = seg[i]!, s = i * ds, br = inBranch.get(q);
      if (br) canon[i] = br.c0 + (br.c1 - br.c0) * Math.min(1, Math.max(0, (s - br.s0) / Math.max(br.s1 - br.s0, 1e-6)));
      else if (q < nr) {
        const f0 = first.get(q) ?? s, f1 = Math.max(lastAt.get(q) ?? s, f0 + ds);
        canon[i] = ring[q]! + (ring[q + 1]! - ring[q]!) * Math.min(1, Math.max(0, (s - f0) / (f1 - f0)));
      } else canon[i] = ring[nr]!;
    }
  }

  // power-ups: collected where the line passes through the pickup; they last to the end of that segment
  const accelMul = new Float64Array(n).fill(opts.accel ?? 1);
  const topMul = new Float64Array(n).fill(1);
  const gripMul = new Float64Array(n).fill(1);
  const ghost = new Uint8Array(n);
  const brakeFx = new Float64Array(n).fill(1);
  const pickups: number[] = [];
  for (const sgm of track.segments) {
    const pu = sgm.powerup;
    if (!pu) continue;
    let from = -1;
    for (let i = 0; i < n; i++) {
      if (seg[i] === sgm.index && Math.hypot(x[i]! - pu.x, y[i]! - pu.y) <= pu.r + 1) { from = i; break; }
    }
    if (from < 0) continue;
    pickups.push(sgm.index);
    for (let i = from; i < n && seg[i] === sgm.index; i++) {
      if (pu.kind === "boost") { topMul[i] = BOOST_TOP; accelMul[i] = BOOST_ACCEL; }
      else if (pu.kind === "grip") gripMul[i] = GRIP_BONUS;
      else ghost[i] = 1;
    }
  }

  // ramps, speed pads and patches of ice, sand, mud and water on part of a segment
  const jump = new Uint8Array(n), jumpPower = new Float64Array(n);
  if (track.allSegments.some((g) => g.fx)) {
    const veh = vehicleOf(car.type);
    const ability = Math.max(veh.terrain, q.rough ?? 0);
    // where along its segment each sample lies, by the segment's own samples (first and last sample of the lap on it)
    const firstAt = new Map<number, number>(), lastAt = new Map<number, number>();
    for (let i = 0; i < n; i++) { const k = seg[i]!; if (!firstAt.has(k)) firstAt.set(k, i); lastAt.set(k, i); }
    for (let i = 0; i < n; i++) {
      const g = track.allSegments[seg[i]!];
      if (!g?.fx) continue;
      const f0 = firstAt.get(seg[i]!)!, f1 = Math.max(lastAt.get(seg[i]!)!, f0 + 1);
      const t = (i - f0) / (f1 - f0);
      for (const fx of g.fx) {
        if (t < fx.t0 || t > fx.t1) continue;
        if (fx.type === "boost") { topMul[i] = topMul[i]! * (1 + (BOOST_FX_TOP - 1) * (fx.power ?? 1)); accelMul[i] = accelMul[i]! * (1 + (BOOST_FX_ACCEL - 1) * (fx.power ?? 1)); }
        else if (isRamp(fx.type)) {
          // the car leaves the ground at the end of the ramp: the last sample inside the span
          if (i === f0 + Math.min(f1 - f0, Math.floor(fx.t1 * (f1 - f0)))) { jump[i] = fx.type === "glide" ? 2 : 1; jumpPower[i] = fx.power ?? 1; }
        } else {
          const f = FX_GROUND[fx.type]!;
          gripMul[i] = gripMul[i]! * terrainMul(f.grip, ability); accelMul[i] = accelMul[i]! * terrainMul(f.accel, ability);
          topMul[i] = topMul[i]! * terrainMul(f.top, ability); brakeFx[i] = Math.min(brakeFx[i]!, terrainMul(f.brake, ability));
        }
      }
    }
  }

  // the ground: hills change how hard it is to speed up and to stop, a rough surface takes grip, a bank adds it
  const brakeMul = new Float64Array(n).fill(1);
  for (let i = 0; i < n; i++) brakeMul[i] = brakeFx[i]!;
  if (track.allSegments.some((g) => g.elev || g.surface || g.bank)) {
    const veh = vehicleOf(car.type);
    const ability = Math.max(veh.terrain, q.rough ?? 0);
    const z = new Float64Array(n);
    let hilly = false;
    for (let i = 0; i < n; i++) {
      const g = track.allSegments[seg[i]!]!;
      if (g.surface) {
        const f = SURFACES[g.surface];
        gripMul[i] = gripMul[i]! * terrainMul(f.grip, ability); accelMul[i] = accelMul[i]! * terrainMul(f.accel, ability); brakeMul[i] = brakeMul[i]! * terrainMul(f.brake, ability);
      }
      if (g.bank) gripMul[i] = gripMul[i]! * g.bank;
      if (g.elev) { z[i] = heightAt(g.center, g.elev, x[i]!, y[i]!); hilly = true; }
    }
    if (hilly) {
      for (let i = 0; i < n; i++) {
        const slope = (z[(i + 3) % n]! - z[(i + n - 3) % n]!) / (6 * ds);
        topMul[i] = topMul[i]! * Math.min(1.06, Math.max(0.92, 1 - GRADE_TOP * slope));
        accelMul[i] = accelMul[i]! * Math.min(1.3, Math.max(0.6, 1 - GRADE_ACCEL * slope));
        brakeMul[i] = brakeMul[i]! * Math.min(1.3, Math.max(0.6, 1 + GRADE_BRAKE * slope));
      }
    }
  }

  // speed limits: top speed and cornering grip, then braking ahead of slow parts (twice round, it is a loop)
  const vLim = new Float64Array(n);
  const kap = new Float64Array(n);
  // a lap that pits ends where the next one starts, not where it started: no corner at the join
  const wrapBreak = pitIn !== pitOut;
  for (let i = 0; i < n; i++) {
    const a = (i + n - 3) % n;
    const b = (i + 3) % n;
    const ax = x[i]! - x[a]!, ay = y[i]! - y[a]!;
    const bx = x[b]! - x[i]!, by = y[b]! - y[i]!;
    const cx = x[b]! - x[a]!, cy = y[b]! - y[a]!;
    const area2 = Math.abs(ax * by - ay * bx);
    const kappa = (2 * area2) / Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by) * Math.hypot(cx, cy), 1e-9);
    const kk = wrapBreak && (i < 4 || i >= n - 4) ? 0 : kappa;
    kap[i] = kk;
    const here = opts.gripAt ? opts.gripAt(x[i]!, y[i]!) : 1;
    // (with downforce the cornering force grows with the square of the speed, so v² · kap = grip + df · v², which solves directly)
    const bend = Math.max(kk - (q.downforce ?? 0), 1e-4);
    vLim[i] = Math.min(st.vTop * topMul[i]!, Math.sqrt((st.aLat * (1 + (q.lean ?? 0)) * gripMul[i]! * here) / bend));
    // a bottleneck is taken carefully
    if (half[i]! < PINCH_FREE) vLim[i] = Math.min(vLim[i]!, PINCH_SPEED * half[i]!);
    if (lane[i]) vLim[i] = Math.min(vLim[i]!, PIT_SPEED);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let k = n - 1; k >= 0; k--) {
      const nxt = vLim[(k + 1) % n]!;
      // (braking into a bend that is already at the limit costs a heavy machine some of its braking: its weight is on the wrong wheels)
      const brake0 = st.brake * brakeMul[k]!;
      const brake = q.shift ? brake0 * (1 - q.shift * Math.min(1, (kap[(k + 1) % n]! * nxt * nxt) / (st.aLat * (1 + (q.lean ?? 0)) * (gripMul[(k + 1) % n]!) + (q.downforce ?? 0) * nxt * nxt))) : brake0;
      vLim[k] = Math.min(vLim[k]!, Math.sqrt(nxt * nxt + 2 * brake * ds));
    }
  }
  // flying-lap time with the acceleration limit
  const v = Float64Array.from(vLim);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < n; k++) {
      const prev = v[(k + n - 1) % n]!;
      v[k] = Math.min(v[k]!, Math.sqrt(prev * prev + 2 * st.accel * accelMul[k]! * ds));
    }
  }
  let ideal = 0;
  for (let k = 0; k < n; k++) ideal += ds / Math.max((v[k]! + v[(k + 1) % n]!) / 2, 1);
  let pitFromS: number | undefined;
  if (pitIn) for (let i = 0; i < n; i++) if (lane[i] && i > n / 2) { pitFromS = i * ds; break; }
  return { n, ds, length: total, x, y, h, seg, half, canon, vLim, accelMul, brakeMul, gripMul, ghost, jump, jumpPower, ideal, pickups, kap, lane, open: wrapBreak, pitS, pitFromS };
}

/** Linear lookup into a per-sample array at arclength s (wrapping, unless the lap is open: then it stops at the ends). */
export function sampleAt(p: Profile, arr: Float64Array, s: number): number {
  if (p.open) {
    const f = Math.min(Math.max(s, 0), p.length - 1e-6) / p.ds;
    const i = Math.min(Math.floor(f), p.n - 1), j = Math.min(i + 1, p.n - 1);
    return arr[i]! + (arr[j]! - arr[i]!) * (f - Math.floor(f));
  }
  const f = (((s % p.length) + p.length) % p.length) / p.ds;
  const i = Math.floor(f) % p.n;
  const u = f - Math.floor(f);
  return arr[i]! + (arr[(i + 1) % p.n]! - arr[i]!) * u;
}

/** Nearest-sample lookup for flags. */
export function indexAt(p: Profile, s: number): number {
  if (p.open) return Math.min(p.n - 1, Math.max(0, Math.floor(s / p.ds + 0.5)));
  return Math.floor((((s % p.length) + p.length) % p.length) / p.ds + 0.5) % p.n;
}


/** Height at a point near a segment's centreline: the nearest bit of the centreline, eased between its two neighbouring centre points. */
function heightAt(center: { x: number; y: number }[], elev: number[], x: number, y: number): number {
  let k = 0, bd = Infinity;
  for (let i = 0; i < center.length; i++) {
    const d = (center[i]!.x - x) ** 2 + (center[i]!.y - y) ** 2;
    if (d < bd) { bd = d; k = i; }
  }
  const side = (j: number): number => {
    if (j < 0 || j >= center.length) return NaN;
    const a = center[k]!, b = center[j]!, ex = b.x - a.x, ey = b.y - a.y, len2 = ex * ex + ey * ey;
    return len2 < 1e-9 ? 0 : ((x - a.x) * ex + (y - a.y) * ey) / len2;
  };
  const tp = side(k + 1), tm = side(k - 1);
  if (tp >= 0 && tp <= 1) return elev[k]! + (elev[k + 1]! - elev[k]!) * tp;
  if (tm >= 0 && tm <= 1) return elev[k]! + (elev[k - 1]! - elev[k]!) * tm;
  return elev[k]!;
}
