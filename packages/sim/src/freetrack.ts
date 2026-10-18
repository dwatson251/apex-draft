import { Rng } from "./rng.ts";
import { SAMPLES } from "./pieces.ts";
import { CELL, ROAD_HALF, normalsOf, placeFeatures, indexCells, type Gate, type Segment, type SegmentKind, type Track } from "./track.ts";
import { isRamp, type FxType } from "./fx.ts";
import { LANDING_SEGMENTS } from "./features.ts";
import { makePit } from "./pit.ts";
import { phraseToSeed } from "./seed.ts";
import { dist, norm, perp, sub, v2, type Vec2 } from "./vec.ts";
import type { Circuit } from "./circuits.ts";
import { KART_INFO } from "./karts.ts";

/**
 * A real circuit as a line of points rather than a loop of cells: the line is smoothed, and cut into segments of about
 * `SEGMENT_LENGTH` units, each between two gates square to the road, so everything that works on a segment (drawing a lap, a bot's
 * line, the wet patches, the pit lane) works the same. The first point is the start line, in the middle of a straight.
 */
/** 100 units, the same as a straight piece of a grid track: about 110 m (see scale.ts). */
export const SEGMENT_LENGTH = 100;

/** A closed uniform cubic B-spline over the points: smooth to the second derivative, so no bend is sharper than the points say. About one sample a unit. */
function bspline(points: Vec2[]): Vec2[] {
  const n = points.length, out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n]!, p1 = points[i]!, p2 = points[(i + 1) % n]!, p3 = points[(i + 2) % n]!;
    const steps = Math.max(2, Math.ceil(dist(p1, p2)));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const b0 = (1 - t) ** 3 / 6, b1 = (3 * t3 - 6 * t2 + 4) / 6, b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, b3 = t3 / 6;
      out.push(v2(b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x, b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y));
    }
  }
  return out;
}

/** Cut a closed line into `n` segments of equal length starting at its first point. */
export function freeSegments(points: Vec2[], index0 = 0): { segments: Segment[]; length: number } {
  const dense = bspline(points);
  const m = dense.length;
  const at: number[] = [0];
  for (let i = 1; i <= m; i++) at.push(at[i - 1]! + dist(dense[i - 1]!, dense[i % m]!));
  const L = at[m]!;
  const n = Math.max(8, Math.round(L / SEGMENT_LENGTH));
  const pointAt = (s: number): Vec2 => {
    const u = ((s % L) + L) % L;
    let lo = 0, hi = m;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (at[mid]! <= u) lo = mid; else hi = mid; }
    const a = dense[lo]!, b = dense[(lo + 1) % m]!, f = (u - at[lo]!) / Math.max(1e-9, at[lo + 1]! - at[lo]!);
    return v2(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
  };
  const gates: Gate[] = Array.from({ length: n }, (_, k) => {
    const s = (k * L) / n, mid = pointAt(s);
    const dir = norm(sub(pointAt(s + 2), pointAt(s - 2)));
    return { mid, dir, n: perp(dir) };
  });
  const segments: Segment[] = gates.map((entry, k) => {
    const exit = gates[(k + 1) % n]!;
    const s0 = (k * L) / n, s1 = ((k + 1) * L) / n;
    const center: Vec2[] = [];
    for (let i = 0; i <= SAMPLES; i++) center.push(i === 0 ? entry.mid : i === SAMPLES ? exit.mid : pointAt(s0 + ((s1 - s0) * i) / SAMPLES));
    const mid = center[SAMPLES >> 1]!;
    return { index: k + index0, cx: Math.floor(mid.x / CELL), cy: Math.floor(mid.y / CELL), kind: "straight" as SegmentKind, center, normals: normalsOf(center), entry, exit, obstacles: [] };
  });
  return { segments, length: L };
}

/** What a segment is, from how far its road turns: a straight, a kink, a fast sweep, a corner or a sharp one. */
export function kindOf(s: Segment): SegmentKind {
  let turn = 0;
  for (let i = 1; i < s.center.length - 1; i++) {
    const a = sub(s.center[i]!, s.center[i - 1]!), b = sub(s.center[i + 1]!, s.center[i]!);
    turn += Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  }
  const t = Math.abs(turn);
  return t < 0.07 ? "straight" : t < 0.25 ? "kink" : t < 0.75 ? "sweeper" : t < 1.2 ? "corner" : "sharp";
}

/** Every cell a segment's road touches (its centre line and a little to each side), for the lookup by cell. */
function touchedCells(s: Segment): [number, number][] {
  const out = new Map<string, [number, number]>();
  const reach = ROAD_HALF + 6;
  for (const [i, c] of s.center.entries()) {
    for (const o of [-reach, 0, reach]) {
      const x = c.x + s.normals[i]!.x * o, y = c.y + s.normals[i]!.y * o;
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      out.set(`${cx},${cy}`, [cx, cy]);
    }
  }
  return [...out.values()];
}

/**
 * Lay a course's pieces on its segments: a piece at a fraction of the lap becomes a span of each segment it crosses (fractions of that segment), and nothing
 * stands in the road of a ramp's take-off and landing.
 */
function layFx(segments: Segment[], pieces: { at: number; len: number; type: FxType; power?: number }[]): void {
  const n = segments.length;
  for (const p of pieces) {
    const a = p.at * n, b = (p.at + p.len) * n;
    for (let k = Math.floor(a); k < Math.ceil(b) && k < n; k++) {
      const t0 = Math.max(0, a - k), t1 = Math.min(1, b - k);
      if (t1 - t0 < 0.02) continue;
      const s = segments[k]!;
      (s.fx ??= []).push({ t0: Math.round(t0 * 1000) / 1000, t1: Math.round(t1 * 1000) / 1000, type: p.type, ...(p.power !== undefined ? { power: p.power } : {}) });
      s.obstacles = [];
      if (isRamp(p.type)) for (let j = 1; j <= LANDING_SEGMENTS + (p.type === "glide" ? 1 : 0); j++) segments[(k + j) % n]!.obstacles = [];
    }
  }
}

/** Two roads closer than this (centre to centre) are crossing: a mapped circuit's roads are kept at least 53 apart everywhere else. */
const CROSSING = 50;

/**
 * Where a mapped circuit crosses itself, one road goes over the other on a bridge. Segments whose roads come within `CROSSING` of each other are one
 * crossing; the two runs of segments that make it are the road under (`under`, level -k) and the road over (`bridge`, level +k), so cars on the two never
 * touch or give way to each other (see `levelsOf`). The later run goes over.
 */
export function markCrossings(segments: Segment[]): number {
  const n = segments.length, parent = segments.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const near = new Set<number>();
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    let best = Infinity;
    for (const p of segments[i]!.center) for (const q of segments[j]!.center) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    if (best < CROSSING) { parent[find(i)] = find(j); near.add(i); near.add(j); }
  }
  const groups = new Map<number, number[]>();
  for (const i of near) { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); }
  let k = 0;
  for (const g of [...groups.values()].sort((a, b) => a[0]! - b[0]!)) {
    g.sort((a, b) => a - b);
    // the runs of consecutive segments in the group
    const runs: number[][] = [];
    for (const i of g) { const last = runs.at(-1); if (last && i - last.at(-1)! <= 1) last.push(i); else runs.push([i]); }
    if (runs.length < 2) continue;
    k++;
    runs.forEach((run, r) => { for (const i of run) { const s = segments[i]!; s.level = r === 0 ? -k : k; s.kind = r === 0 ? "under" : "bridge"; } });
  }
  return k;
}

export function buildFreeCircuit(c: Circuit, typed: string, opts: { obstacles?: boolean; biome?: Track["biome"] }): Track {
  const seed = phraseToSeed(c.id);
  const flat = c.free!;
  const pts: Vec2[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(v2(flat[i]!, flat[i + 1]!));
  const { segments } = freeSegments(pts);
  const n = segments.length;
  const rng = new Rng(seed);
  for (const s of segments) {
    s.kind = kindOf(s);
    // the two segments either side of the start line are straights, with the pit lane beside them
    if (s.index === 0 || s.index === n - 1) s.kind = "straight";
    placeFeatures(s, rng, s.index === 0 || s.index === n - 1);
  }
  if (c.kart) markCrossings(segments);
  const kart = c.kart ? KART_INFO.get(c.id) : undefined;
  if (kart) layFx(segments, kart.fx);
  if (opts.obstacles === false) for (const s of segments) s.obstacles = [];
  const g = segments[0]!.entry;
  // the pit lane goes on the side of the start straight with no other road close beside it
  const crowding = (side: 1 | -1): number => {
    let near = 0;
    for (const q of segments.slice(1, -1)) for (const p of q.center) {
      const along = (p.x - g.mid.x) * g.dir.x + (p.y - g.mid.y) * g.dir.y, across = ((p.x - g.mid.x) * g.n.x + (p.y - g.mid.y) * g.n.y) * side;
      if (Math.abs(along) < 90 && across > 0 && across < 80) near++;
    }
    return near;
  };
  let cx = 0, cy = 0;
  for (const s of segments) for (const p of s.center) { cx += p.x; cy += p.y; }
  cx /= n * (SAMPLES + 1); cy /= n * (SAMPLES + 1);
  const inward: 1 | -1 = (cx - g.mid.x) * g.n.x + (cy - g.mid.y) * g.n.y >= 0 ? 1 : -1;
  const side = crowding(inward) <= crowding(-inward as 1 | -1) ? inward : (-inward as 1 | -1);
  const pit = makePit(g.mid, g.dir, g.n, side);
  let maxX = 0, maxY = 0;
  for (const p of pts) { maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const index = indexCells(segments);
  // a segment is found from every cell its road touches
  index.cellSegments.clear();
  index.cellIndex.clear();
  for (const s of segments) for (const [x, y] of touchedCells(s)) {
    const k = `${x},${y}`;
    if (!index.cellIndex.has(k)) index.cellIndex.set(k, s.index);
    index.cellSegments.set(k, [...(index.cellSegments.get(k) ?? []), s.index]);
  }
  return {
    phrase: typed, seed, cols: Math.ceil((maxX + 180) / CELL), rows: Math.ceil((maxY + 180) / CELL), segments, pit, obstacles: opts.obstacles !== false,
    biome: opts.biome ?? c.biome, fun: false, free: true, circuit: { id: c.id, name: c.name, lengthKm: c.lengthKm, blurb: c.blurb, ...(kart ? { theme: kart.theme, laps: kart.laps } : {}) }, ...index,
  };
}
