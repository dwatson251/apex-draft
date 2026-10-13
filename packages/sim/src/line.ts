import { CAR_R, ROAD_HALF, isDrivable, type Gate, type Track } from "./track.ts";
import { add, clamp, dist, dot, mul, sub, type Vec2 } from "./vec.ts";

/**
 * One lap's racing line. `start` sits on the start/finish gate. `segs[i]` holds the waypoints drawn in segment i,
 * in order; the last one is where the line leaves the segment, and so where the next segment begins. In the last
 * segment the line must end back on `start`, so a lap is a closed loop.
 */
export interface Line {
  start: Vec2;
  segs: Vec2[][];
}

const GATE_LIMIT = ROAD_HALF - CAR_R - 0.5;

/** Snap a point onto a gate, inside the drivable width. */
export function projectToGate(g: Gate, p: Vec2): Vec2 {
  const l = clamp(dot(sub(p, g.mid), g.n), -GATE_LIMIT, GATE_LIMIT);
  return add(g.mid, mul(g.n, l));
}

export function beginLine(track: Track, p: Vec2): Line {
  return { start: projectToGate(track.segments[0]!.entry, p), segs: [] };
}

/** Where segment i starts. */
export function joinBefore(line: Line, i: number): Vec2 {
  return i === 0 ? line.start : line.segs[i - 1]!.at(-1)!;
}

export function isComplete(track: Track, line: Line): boolean {
  return line.segs.length === track.segments.length && line.segs.every((s) => s.length > 0);
}

/** Draw segment i (the next one to draw): `pts` are clicks; the last is snapped to the exit gate. */
export function drawSegment(track: Track, line: Line, i: number, pts: Vec2[]): Line {
  const last = i === track.segments.length - 1;
  const inner = pts.slice(0, -1);
  const end = last ? line.start : projectToGate(track.segments[i]!.exit, pts.at(-1)!);
  const segs = line.segs.slice(0, i);
  segs.push([...inner, end]);
  return { start: line.start, segs };
}

/** Redraw the middle of an already drawn segment. Both joins stay where they are. */
export function amendSegment(line: Line, i: number, inner: Vec2[]): Line {
  const segs = line.segs.map((s, k) => (k === i ? [...inner, s.at(-1)!] : s));
  return { start: line.start, segs };
}

/** How many segments differ between two complete lines of the same track. */
export function changedSegments(a: Line, b: Line): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(a.segs.length, b.segs.length); i++) {
    const x = a.segs[i];
    const y = b.segs[i];
    const same = x && y && x.length === y.length && x.every((p, k) => p.x === y[k]!.x && p.y === y[k]!.y);
    if (!same) out.push(i);
  }
  return out;
}

export const MAX_AMENDS = 3;

interface Wp { p: Vec2; seg: number }

/** The waypoints of a complete line as a closed loop. The duplicate end (== start) is dropped. */
function loopWaypoints(line: Line): Wp[] {
  const wps: Wp[] = [{ p: line.start, seg: 0 }];
  line.segs.forEach((s, i) => s.forEach((p) => wps.push({ p, seg: i })));
  wps.pop();
  return wps;
}

/** Centripetal Catmull-Rom between p1 and p2, with p0 and p3 as neighbours. */
function crPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const a = (p: Vec2, q: Vec2) => Math.max(Math.sqrt(dist(p, q)), 1e-3);
  const t0 = 0;
  const t1 = t0 + a(p0, p1);
  const t2 = t1 + a(p1, p2);
  const t3 = t2 + a(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (p: Vec2, q: Vec2, ta: number, tb: number, tt: number) => {
    const w = (tt - ta) / (tb - ta);
    return { x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w };
  };
  const A1 = mix(p0, p1, t0, t1, t);
  const A2 = mix(p1, p2, t1, t2, t);
  const A3 = mix(p2, p3, t2, t3, t);
  const B1 = mix(A1, A2, t0, t2, t);
  const B2 = mix(A2, A3, t1, t3, t);
  return mix(B1, B2, t1, t2, t);
}

export interface DensePoint { p: Vec2; seg: number }

/** A smooth curve through the points, about one sample per unit of length. */
export function smooth(points: Vec2[], closed: boolean, segOf: (spanEnd: number) => number = () => 0): DensePoint[] {
  const n = points.length;
  const out: DensePoint[] = [];
  if (n < 2) return points.map((p) => ({ p, seg: 0 }));
  const at = (i: number): Vec2 => {
    if (closed) return points[((i % n) + n) % n]!;
    if (i < 0) return sub(mul(points[0]!, 2), points[1]!);
    if (i >= n) return sub(mul(points[n - 1]!, 2), points[n - 2]!);
    return points[i]!;
  };
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const steps = Math.max(2, Math.ceil(dist(at(i), at(i + 1))));
    for (let k = 0; k < steps; k++) {
      out.push({ p: crPoint(at(i - 1), at(i), at(i + 1), at(i + 2), k / steps), seg: segOf(i + 1) });
    }
  }
  out.push({ p: closed ? points[0]! : points[n - 1]!, seg: segOf(spans) });
  return out;
}

/** Dense closed curve of a complete lap, each sample tagged with its segment. */
export function lapCurve(line: Line, segmentCount: number): DensePoint[] {
  const wps = loopWaypoints(line);
  return smooth(wps.map((w) => w.p), true, (end) => (end < wps.length ? wps[end]!.seg : segmentCount - 1));
}

export interface LineCheck {
  ok: boolean;
  /** Segments where the smoothed line leaves the road or touches an obstacle. */
  badSegs: number[];
}

export function validateLine(track: Track, line: Line): LineCheck {
  const bad = new Set<number>();
  if (!isComplete(track, line)) return { ok: false, badSegs: [] };
  for (const d of lapCurve(line, track.segments.length)) if (!isDrivable(track, d.p)) bad.add(d.seg);
  return { ok: bad.size === 0, badSegs: [...bad].sort((a, b) => a - b) };
}

/** Does a part of a lap being drawn stay drivable? Used for live feedback; `from` is the join. */
export function previewSegment(track: Track, from: Vec2, pts: Vec2[]): { curve: Vec2[]; ok: boolean } {
  const curve = smooth([from, ...pts], false).map((d) => d.p);
  return { curve, ok: curve.every((p) => isDrivable(track, p)) };
}
