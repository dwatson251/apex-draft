import { phraseToSeed, normalizePhrase } from "./seed.ts";
import { Rng } from "./rng.ts";
import { add, dist, distToSegment, lerp, mul, norm, perp, sub, v2, type Vec2 } from "./vec.ts";

/** A grid cell is CELL units wide; the road is 2 * ROAD_HALF wide; the car is a disc of CAR_R. */
export const CELL = 100;
export const ROAD_HALF = 22;
export const CAR_R = 3;
const SAMPLES = 24;

export type SegmentKind = "straight" | "bendy" | "corner" | "sharp";
export type PowerupKind = "boost" | "grip" | "ghost";

export interface Gate {
  /** Midpoint of the road edge shared with the neighbouring segment. */
  mid: Vec2;
  /** Unit vector across the road (left of travel). */
  n: Vec2;
  /** Direction of travel through the gate. */
  dir: Vec2;
}

export interface Obstacle { kind: "box" | "water"; x: number; y: number; r: number }
export interface Powerup { kind: PowerupKind; x: number; y: number; r: number }

export interface Segment {
  index: number;
  cx: number;
  cy: number;
  kind: SegmentKind;
  /** Centreline, SAMPLES + 1 points from entry to exit. */
  center: Vec2[];
  normals: Vec2[];
  entry: Gate;
  exit: Gate;
  obstacles: Obstacle[];
  powerup?: Powerup;
}

export interface Track {
  phrase: string;
  seed: number;
  cols: number;
  rows: number;
  segments: Segment[];
  /** "cx,cy" -> segment index */
  cellIndex: Map<string, number>;
}

const DIRS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const key = (cx: number, cy: number) => `${cx},${cy}`;

/** A simple cycle of grid cells, grown by pushing edges outward. Every cell has exactly two road neighbours. */
function growCycle(rng: Rng, cols: number, rows: number, target: number): [number, number][] {
  const x0 = rng.int(cols - 1);
  const y0 = rng.int(rows - 1);
  let cyc: [number, number][] = [[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1]];
  const used = new Set(cyc.map(([x, y]) => key(x, y)));
  for (let attempt = 0; attempt < 4000 && cyc.length < target; attempt++) {
    const k = rng.int(cyc.length);
    const a = cyc[k]!;
    const b = cyc[(k + 1) % cyc.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const side = rng.chance(0.5) ? 1 : -1;
    const px = -dy * side;
    const py = dx * side;
    const a2: [number, number] = [a[0] + px, a[1] + py];
    const b2: [number, number] = [b[0] + px, b[1] + py];
    const inGrid = (c: [number, number]) => c[0] >= 0 && c[1] >= 0 && c[0] < cols && c[1] < rows;
    if (!inGrid(a2) || !inGrid(b2) || used.has(key(...a2)) || used.has(key(...b2))) continue;
    cyc = [...cyc.slice(0, k + 1), a2, b2, ...cyc.slice(k + 1)];
    used.add(key(...a2));
    used.add(key(...b2));
  }
  return cyc;
}

/** Cubic Bezier, so the road leaves and enters every gate square-on. */
function bezier(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return v2(a * p0.x + b * c1.x + c * c2.x + d * p3.x, a * p0.y + b * c1.y + c * c2.y + d * p3.y);
}

function makeGate(mid: Vec2, dir: Vec2): Gate {
  return { mid, dir, n: perp(dir) };
}

function buildSegment(rng: Rng, index: number, cell: [number, number], prev: [number, number], next: [number, number], _total: number): Segment {
  const [cx, cy] = cell;
  const C = v2((cx + 0.5) * CELL, (cy + 0.5) * CELL);
  const toPrev = v2(prev[0] - cx, prev[1] - cy);
  const toNext = v2(next[0] - cx, next[1] - cy);
  const p0 = add(C, mul(toPrev, CELL / 2));
  const p2 = add(C, mul(toNext, CELL / 2));
  const straight = toPrev.x === -toNext.x && toPrev.y === -toNext.y;
  let kind: SegmentKind;
  if (straight) kind = rng.chance(0.3) ? "bendy" : "straight";
  else kind = rng.chance(0.4) ? "sharp" : "corner";

  const center: Vec2[] = [];
  const bendSign = rng.chance(0.5) ? 1 : -1;
  // handle length: 27.6 draws a quarter circle; longer handles squeeze the bend toward the cell corner
  const handle = kind === "sharp" ? 36 : 27.6;
  const c1 = add(p0, mul(toPrev, -handle));
  const c2 = sub(p2, mul(toNext, handle));
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    if (kind === "straight") center.push(lerp(p0, p2, t));
    else if (kind === "bendy") {
      const base = lerp(p0, p2, t);
      const n = perp(norm(sub(p2, p0)));
      center.push(add(base, mul(n, bendSign * 20 * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t))));
    } else center.push(bezier(p0, c1, c2, p2, t));
  }
  const normals = center.map((_, i) => {
    const a = center[Math.max(0, i - 1)]!;
    const b = center[Math.min(SAMPLES, i + 1)]!;
    return perp(norm(sub(b, a)));
  });
  const seg: Segment = {
    index, cx, cy, kind, center, normals,
    entry: makeGate(p0, mul(toPrev, -1)),
    exit: makeGate(p2, toNext),
    obstacles: [],
  };
  // The start/finish segment is kept clear.
  if (index > 0 && rng.chance(0.4)) {
    const t = rng.range(0.35, 0.65);
    const o = rng.range(-0.25, 0.25) * ROAD_HALF;
    const r = rng.range(0.25, 0.4) * ROAD_HALF;
    const c = centreAt(seg, t);
    const pos = add(c.p, mul(c.n, o));
    seg.obstacles.push({ kind: rng.chance(0.5) ? "box" : "water", x: pos.x, y: pos.y, r });
  }
  if (index > 0 && rng.chance(0.22)) {
    const t = rng.range(0.25, 0.75);
    const c = centreAt(seg, t);
    const pos = add(c.p, mul(c.n, rng.range(-0.4, 0.4) * ROAD_HALF));
    // keep the pickup off any obstacle
    if (seg.obstacles.every((o) => dist(pos, o) > o.r + 12)) {
      seg.powerup = { kind: rng.pick(["boost", "grip", "ghost"] as const), x: pos.x, y: pos.y, r: 6 };
    }
  }
  return seg;
}

/** Centreline point and normal at t in [0, 1]. */
export function centreAt(seg: Segment, t: number): { p: Vec2; n: Vec2 } {
  const f = Math.min(Math.max(t, 0), 1) * SAMPLES;
  const i = Math.min(SAMPLES - 1, Math.floor(f));
  const u = f - i;
  return { p: lerp(seg.center[i]!, seg.center[i + 1]!, u), n: norm(lerp(seg.normals[i]!, seg.normals[i + 1]!, u)) };
}

/** The same phrase always gives the same track. */
export function generateTrack(phrase: string): Track {
  const norm_ = normalizePhrase(phrase);
  const seed = phraseToSeed(norm_);
  const rng = new Rng(seed);
  const cols = 7;
  const rows = 5;
  const target = 2 * rng.int(5) + 14; // 14..22 cells, even
  let cyc = growCycle(rng, cols, rows, target);
  if (rng.chance(0.5)) cyc = [...cyc].reverse();
  // rotate so segment 0 (start/finish) is a straight
  const n = cyc.length;
  const isStraight = (i: number) => {
    const a = cyc[(i + n - 1) % n]!;
    const c = cyc[(i + 1) % n]!;
    return a[0] + c[0] === 2 * cyc[i]![0] && a[1] + c[1] === 2 * cyc[i]![1];
  };
  const candidates = cyc.map((_, i) => i).filter(isStraight);
  const startAt = candidates.length ? rng.pick(candidates) : 0;
  cyc = [...cyc.slice(startAt), ...cyc.slice(0, startAt)];
  const segments = cyc.map((cell, i) => buildSegment(rng, i, cell, cyc[(i + n - 1) % n]!, cyc[(i + 1) % n]!, n));
  const cellIndex = new Map<string, number>();
  segments.forEach((s) => cellIndex.set(key(s.cx, s.cy), s.index));
  return { phrase: norm_, seed, cols, rows, segments, cellIndex };
}

/** Structural rules from the brief: a closed loop of adjacent cells, no repeats, no dead ends. Returns problems. */
export function checkTrack(t: Track): string[] {
  const problems: string[] = [];
  const n = t.segments.length;
  const seen = new Set<string>();
  t.segments.forEach((s, i) => {
    const k = key(s.cx, s.cy);
    if (seen.has(k)) problems.push(`cell ${k} used twice`);
    seen.add(k);
    if (s.cx < 0 || s.cy < 0 || s.cx >= t.cols || s.cy >= t.rows) problems.push(`cell ${k} outside the grid`);
    const nx = t.segments[(i + 1) % n]!;
    if (Math.abs(nx.cx - s.cx) + Math.abs(nx.cy - s.cy) !== 1) problems.push(`segment ${i} does not touch segment ${(i + 1) % n}`);
    if (dist(s.exit.mid, nx.entry.mid) > 1e-6) problems.push(`gate ${i} does not join`);
    for (const o of s.obstacles) {
      // a car must be able to pass on at least one side
      const lat = lateralOf(s, o);
      const gap = Math.max(ROAD_HALF - (lat + o.r), ROAD_HALF - (-lat + o.r));
      if (gap < 2 * CAR_R + 2) problems.push(`obstacle in segment ${i} leaves no way through`);
    }
  });
  if (n < 4 || n % 2) problems.push(`loop has ${n} cells`);
  if (t.segments[0] && t.segments[0].kind !== "straight" && t.segments[0].kind !== "bendy") problems.push("start segment is a corner");
  return problems;
}

/** Signed distance of an obstacle from the centreline of its segment. */
function lateralOf(s: Segment, o: Obstacle): number {
  let best = Infinity;
  let signed = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const c = s.center[i]!;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < best) {
      best = d;
      signed = (o.x - c.x) * s.normals[i]!.x + (o.y - c.y) * s.normals[i]!.y;
    }
  }
  return signed;
}

/** Segments near a point: its cell and the eight around it. */
function nearbySegments(t: Track, p: Vec2): Segment[] {
  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  const out: Segment[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const i = t.cellIndex.get(key(cx + dx, cy + dy));
      if (i !== undefined) out.push(t.segments[i]!);
    }
  }
  return out;
}

/** Distance from p to the nearest road centreline. */
export function roadDistance(t: Track, p: Vec2): number {
  let best = Infinity;
  for (const s of nearbySegments(t, p)) {
    for (let i = 0; i < SAMPLES; i++) best = Math.min(best, distToSegment(p, s.center[i]!, s.center[i + 1]!));
  }
  return best;
}

export function inObstacle(t: Track, p: Vec2, margin: number): Obstacle | undefined {
  for (const s of nearbySegments(t, p)) {
    for (const o of s.obstacles) if (Math.hypot(p.x - o.x, p.y - o.y) < o.r + margin) return o;
  }
  return undefined;
}

/** True when a car centred at p stays on the road and clear of obstacles. */
export function isDrivable(t: Track, p: Vec2, margin = CAR_R): boolean {
  return roadDistance(t, p) <= ROAD_HALF - margin && !inObstacle(t, p, margin);
}

export function trackBounds(t: Track): { w: number; h: number } {
  return { w: t.cols * CELL, h: t.rows * CELL };
}
