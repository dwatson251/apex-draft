import { carStats, type CarConfig } from "./car.ts";
import { lapCurve, type Line } from "./line.ts";
import { PIT_SPEED } from "./pit.ts";
import { applyPit } from "./pitpath.ts";
import type { Track } from "./track.ts";
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
  /** speed limit after braking for what is ahead */
  vLim: Float64Array;
  accelMul: Float64Array;
  ghost: Uint8Array;
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
}

export function buildProfile(track: Track, line: Line, car: CarConfig, opts: ProfileOpts = {}): Profile {
  const st = carStats(car);
  st.aLat *= opts.grip ?? 1;
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

  // power-ups: collected where the line passes through the pickup; they last to the end of that segment
  const accelMul = new Float64Array(n).fill(opts.accel ?? 1);
  const topMul = new Float64Array(n).fill(1);
  const gripMul = new Float64Array(n).fill(1);
  const ghost = new Uint8Array(n);
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
    vLim[i] = Math.min(st.vTop * topMul[i]!, Math.sqrt((st.aLat * gripMul[i]!) / Math.max(kk, 1e-4)));
    if (lane[i]) vLim[i] = Math.min(vLim[i]!, PIT_SPEED);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let k = n - 1; k >= 0; k--) {
      const nxt = vLim[(k + 1) % n]!;
      vLim[k] = Math.min(vLim[k]!, Math.sqrt(nxt * nxt + 2 * st.brake * ds));
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
  return { n, ds, length: total, x, y, h, seg, vLim, accelMul, ghost, ideal, pickups, kap, lane, open: wrapBreak, pitS, pitFromS };
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
