import { SAMPLES } from "./pieces.ts";
import { ROAD_HALF, halfIdx, type Segment } from "./track.ts";

/**
 * A rough time, in seconds, to drive a chain of segments along their centre lines with a standard car: each point's speed is the
 * most the bend allows (a radius-50 corner is taken at about 66 units a second), narrow road takes a little more off, and the car
 * accelerates and brakes into it. It is only used to compare the two ways at a fork (and to say how much a crossing costs), so it
 * does not need to be exact, only to rank a short twisty way against a long flowing one the way a driver would.
 */
const TOP = 118;
const A_LAT = 87;
const ACCEL = 40;
const BRAKE = 110;
/** Seconds a crossing costs: cars have to give way and the line is crowded. */
export const CROSSING_COST = 0.8;

/** What a car can do, in the sim's units: top speed, lateral and forward acceleration, braking. */
export interface Pace { top: number; aLat: number; accel: number; brake: number }
const STANDARD: Pace = { top: TOP, aLat: A_LAT, accel: ACCEL, brake: BRAKE };

export function estimateTime(segs: Segment[], entrySpeed = 80, crossingCost = CROSSING_COST, pace: Pace = STANDARD): number {
  const pts: { x: number; y: number; half: number }[] = [];
  for (const s of segs) for (let i = pts.length ? 1 : 0; i <= SAMPLES; i++) pts.push({ x: s.center[i]!.x, y: s.center[i]!.y, half: halfIdx(s, i) });
  const n = pts.length;
  if (n < 3) return 0;
  const ds: number[] = [], lim: number[] = [];
  for (let i = 0; i < n - 1; i++) ds.push(Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y));
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 2)]!, b = pts[i]!, c = pts[Math.min(n - 1, i + 2)]!;
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
    const cr = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const R = cr < 1e-9 ? Infinity : (ab * bc * ca) / (2 * cr);
    const narrow = Math.min(1, Math.sqrt(b.half / ROAD_HALF));
    lim.push(Math.min(pace.top, Math.sqrt(pace.aLat * R)) * narrow);
  }
  const v = lim.slice();
  v[0] = Math.min(v[0]!, entrySpeed);
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i]!, Math.sqrt(v[i - 1]! ** 2 + 2 * pace.accel * ds[i - 1]!));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i]!, Math.sqrt(v[i + 1]! ** 2 + 2 * pace.brake * ds[i]!));
  let t = 0;
  for (let i = 0; i < n - 1; i++) t += (2 * ds[i]!) / (v[i]! + v[i + 1]! || 1);
  return t + crossingCost * segs.filter((s) => s.kind === "cross").length;
}
