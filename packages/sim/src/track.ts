import { landscape, type Surface } from "./landscape.ts";
import type { Fx } from "./fx.ts";
import { checkFx, funPieces } from "./features.ts";
import { phraseToSeed, normalizePhrase } from "./seed.ts";
import { Rng } from "./rng.ts";
import { biomeForSeed, biomeOf, type BiomeId } from "./biomes.ts";
import { CIRCUIT_VEHICLES, KART_CIRCUITS, vehicleChoices, vehicleForSeed, type VehicleId } from "./vehicles.ts";
import { applyWidths } from "./width.ts";
import { funLayout } from "./fun.ts";
import { MIN_CLEAR, makeBranches, minClearance } from "./branches.ts";
import { circuitFor, type Circuit } from "./circuits.ts";
import { buildFreeCircuit } from "./freetrack.ts";
import { makePit, type Pit } from "./pit.ts";
import { gateAt, straightCentre, sweeperWindow, uturnWindow, type GateGeom, type StraightShape } from "./pieces.ts";
import { add, dist, distToSegment, lerp, mul, norm, perp, sub, v2, type Vec2 } from "./vec.ts";

/**
 * Power-ups are switched off for now: tracks still draw the same random numbers, so nothing else about them changes, but no
 * pickup is laid. Flip this to bring them back.
 */
export const POWERUPS_ENABLED = false;

/** A grid cell is CELL units wide; the road is 2 * ROAD_HALF wide; the car is a disc of CAR_R. */
export const CELL = 100;
export const ROAD_HALF = 22;
export const CAR_R = 3;
/**
 * How far a car may run over the kerb at the road edge: its centre may reach the edge, with the outer wheels on the kerb and the inner two on the
 * track. Everything else (rocks, walls) still keeps the whole car clear.
 */
export const KERB_ALLOW = 2.5;
const SAMPLES = 24;

export type SegmentKind = "straight" | "bendy" | "kink" | "chicaneA" | "chicaneB" | "esses" | "cross" | "bridge" | "under" | "fork" | "merge" | "corner" | "sharp" | "sweeper" | "uturn";

/**
 * A cell the road passes through twice is a crossing: a `cross` (the cars meet in the box and can hit each other), or a bridge, where one
 * visit is the `bridge` that carries the road over the other, the `under`, and the cars on the two never touch.
 */
export const isCrossing = (k: SegmentKind): boolean => k === "cross" || k === "bridge" || k === "under";
export type PowerupKind = "boost" | "grip" | "ghost";

export interface Gate {
  /** Midpoint of the road edge shared with the neighbouring segment. */
  mid: Vec2;
  /** Unit vector across the road (left of travel). */
  n: Vec2;
  /** Direction of travel through the gate. */
  dir: Vec2;
  /** half the road width here; ROAD_HALF when left out */
  half?: number;
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
  /** half the road width at each centre point; ROAD_HALF all the way when left out (only `fun-` tracks narrow and widen) */
  half?: number[];
  /** height of the road at each centre point, in world units (a hill: see landscape.ts); flat when left out */
  elev?: number[];
  /** rough surface laid on the whole segment; tarmac when left out */
  surface?: Surface;
  /** grip multiplier of a banked corner above 1; flat when left out */
  bank?: number;
  /** the segment runs through a tunnel: roofed, and rain never reaches the road */
  tunnel?: boolean;
  /** ramps, speed pads and patches of ice, sand, mud or water on part of the segment (see fx.ts); none when left out */
  fx?: Fx[];
  /** the segment that follows this one when it is not the next in the ring: set on every segment of a shortcut */
  next?: number;
  /** segments that start from the same gate as this one: where the road forks, the two ways on from a junction cell */
  alt?: number[];
}

/**
 * A shortcut. It leaves the ring in the cell of segment `fork` (a straight, which becomes a junction with two exits: on along the
 * ring, or off to the side) and meets it again in the cell of segment `rejoin`. `segs` are the ids of its pieces in driving order,
 * the first in the fork cell and the last in the rejoin cell. It replaces ring segments `fork` to `rejoin`, which are longer.
 */
export interface Branch {
  id: number;
  fork: number;
  rejoin: number;
  segs: number[];
}

/** Half the road width at centre point i of a segment. */
export const halfIdx = (s: Segment, i: number): number => s.half?.[i] ?? ROAD_HALF;
/** Half the road width a fraction t of the way along a segment. */
export function halfAt(s: Segment, t: number): number {
  if (!s.half) return ROAD_HALF;
  const f = Math.min(Math.max(t, 0), 1) * SAMPLES, i = Math.min(SAMPLES - 1, Math.floor(f)), u = f - i;
  return s.half[i]! + (s.half[i + 1]! - s.half[i]!) * u;
}
/** The segment that follows segment `id` along the road (for a ring segment, usually the next one round). */
export const nextOf = (t: Track, id: number): number => t.allSegments[id]!.next ?? (id + 1) % t.segments.length;
/** Every segment a car can take after `id`: the next one, and any that start from the same gate. */
export function exitsAfter(t: Track, id: number): number[] {
  const nx = nextOf(t, id);
  return [nx, ...(t.allSegments[nx]!.alt ?? [])];
}
const RING_CUM = new WeakMap<Track, number[]>();
/** Distance round the ring to the start of each ring segment, with the lap length at the end (n + 1 values). */
export function ringCum(t: Track): number[] {
  let c = RING_CUM.get(t);
  if (!c) {
    c = [0];
    for (const s of t.segments) {
      let len = 0;
      for (let k = 0; k < s.center.length - 1; k++) len += dist(s.center[k]!, s.center[k + 1]!);
      c.push(c[c.length - 1]! + len);
    }
    RING_CUM.set(t, c);
  }
  return c;
}
/** The narrowest the road gets anywhere on a segment. */
export const narrowest = (s: Segment): number => (s.half ? Math.min(...s.half) : ROAD_HALF);

export interface Track {
  phrase: string;
  seed: number;
  cols: number;
  rows: number;
  segments: Segment[];
  /** the pit lane around the start line */
  pit: Pit;
  obstacles: boolean;
  /** where it is: scenery and surface */
  biome: BiomeId;
  /** a `fun-` phrase: open water, crossings, narrows and wide pieces, shortcuts */
  fun: boolean;
  /** a real circuit laid out from a mapped line rather than a loop of cells: its segments are not tied to the grid */
  free?: boolean;
  /** a real circuit this track is a copy of, when the phrase named one */
  circuit?: { id: string; name: string; lengthKm: number; blurb: string };
  /** shortcuts; their segments have ids from segments.length up */
  branches: Branch[];
  /** every segment by id: the ring first, then the shortcuts */
  allSegments: Segment[];
  /** "cx,cy" -> segment index (the first one, where a cell is used twice) */
  cellIndex: Map<string, number>;
  /** "cx,cy" -> every segment in that cell: two where the road crosses itself, one anywhere else */
  cellSegments: Map<string, number[]>;
}

const DIRS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const key = (cx: number, cy: number) => `${cx},${cy}`;

/** Corner cells in a cycle: the ones where the road turns. */
function countTurns(cyc: [number, number][]): number {
  const n = cyc.length;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const a = cyc[(i + n - 1) % n]!, b = cyc[i]!, c = cyc[(i + 1) % n]!;
    if (a[0] + c[0] !== 2 * b[0] || a[1] + c[1] !== 2 * b[1]) t++;
  }
  return t;
}

/** How often a track grows by the push that adds the fewest corners, rather than by any push at all. */
const STRAIGHT_BIAS = 0.9;

/**
 * A simple cycle of grid cells, grown by pushing edges outward. Most pushes are the ones that add the fewest corners (they
 * lengthen a straight, or deepen a bend that is already there), so corners are the exception and the road runs in long
 * stretches; now and then a push anywhere makes a notch, a hairpin or an S.
 */
function growCycle(rng: Rng, cols: number, rows: number, target: number): [number, number][] {
  // start from a ring of cells round the edge of a w x h block, as big as fits, so the road has room for wide bends
  const rings: [number, number][] = [];
  for (let w = 3; w <= cols; w++) for (let h = 3; h <= Math.min(w, rows); h++) {
    const perimeter = 2 * (w + h) - 4;
    if (perimeter <= target && perimeter >= target - RING_SLACK) rings.push([w, h]);
  }
  const [rw, rh] = rings.length ? rings[rng.int(rings.length)]! : [2, 2];
  const x0 = rng.int(cols - rw + 1);
  const y0 = rng.int(rows - rh + 1);
  let cyc: [number, number][] = [];
  for (let x = 0; x < rw; x++) cyc.push([x0 + x, y0]);
  for (let y = 1; y < rh; y++) cyc.push([x0 + rw - 1, y0 + y]);
  for (let x = rw - 2; x >= 0; x--) cyc.push([x0 + x, y0 + rh - 1]);
  for (let y = rh - 2; y >= 1; y--) cyc.push([x0, y0 + y]);
  const inGrid = (c: [number, number]) => c[0] >= 0 && c[1] >= 0 && c[0] < cols && c[1] < rows;
  while (cyc.length < target) {
    const used = new Set(cyc.map(([x, y]) => key(x, y)));
    const options: { cyc: [number, number][]; turns: number }[] = [];
    for (let k = 0; k < cyc.length; k++) {
      const a = cyc[k]!;
      const b = cyc[(k + 1) % cyc.length]!;
      for (const side of [1, -1]) {
        const px = -(b[1] - a[1]) * side;
        const py = (b[0] - a[0]) * side;
        const a2: [number, number] = [a[0] + px, a[1] + py];
        const b2: [number, number] = [b[0] + px, b[1] + py];
        if (!inGrid(a2) || !inGrid(b2) || used.has(key(...a2)) || used.has(key(...b2))) continue;
        const next: [number, number][] = [...cyc.slice(0, k + 1), a2, b2, ...cyc.slice(k + 1)];
        options.push({ cyc: next, turns: countTurns(next) });
      }
    }
    if (!options.length) break;
    let pool = options;
    if (rng.chance(STRAIGHT_BIAS)) {
      const fewest = Math.min(...options.map((o) => o.turns));
      pool = options.filter((o) => o.turns === fewest);
    }
    cyc = pool[rng.int(pool.length)]!.cyc;
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

export const normalsOf = (center: Vec2[]): Vec2[] => center.map((_, i) => {
  const a = center[Math.max(0, i - 1)]!;
  const b = center[Math.min(SAMPLES, i + 1)]!;
  return perp(norm(sub(b, a)));
});

/** Boxes, water and power-ups on a segment (never on the two straights beside the start line). */
export function placeFeatures(seg: Segment, rng: Rng, pitStraight: boolean): void {
  seg.obstacles = [];
  seg.powerup = undefined;
  if (!pitStraight && rng.chance(0.4)) {
    const t = rng.range(0.35, 0.65);
    const o = rng.range(-0.25, 0.25) * ROAD_HALF;
    const r = rng.range(0.25, 0.4) * ROAD_HALF;
    const c = centreAt(seg, t);
    const pos = add(c.p, mul(c.n, o));
    seg.obstacles.push({ kind: rng.chance(0.5) ? "box" : "water", x: pos.x, y: pos.y, r });
  }
  if (!pitStraight && rng.chance(0.22)) {
    const t = rng.range(0.25, 0.75);
    const c = centreAt(seg, t);
    const pos = add(c.p, mul(c.n, rng.range(-0.4, 0.4) * ROAD_HALF));
    // keep the pickup off any obstacle
    if (POWERUPS_ENABLED && seg.obstacles.every((o) => dist(pos, o) > o.r + 12)) {
      seg.powerup = { kind: rng.pick(["boost", "grip", "ghost"] as const), x: pos.x, y: pos.y, r: 6 };
    }
  }
}

/** `force` fixes the kind (circuits do), but the same random draws are made either way. */
export function buildSegment(rng: Rng, index: number, cell: [number, number], prev: [number, number], next: [number, number], total: number, force?: SegmentKind): Segment {
  const [cx, cy] = cell;
  const C = v2((cx + 0.5) * CELL, (cy + 0.5) * CELL);
  const toPrev = v2(prev[0] - cx, prev[1] - cy);
  const toNext = v2(next[0] - cx, next[1] - cy);
  const p0 = add(C, mul(toPrev, CELL / 2));
  const p2 = add(C, mul(toNext, CELL / 2));
  const straight = toPrev.x === -toNext.x && toPrev.y === -toNext.y;
  let kind: SegmentKind;
  // the two segments either side of the start line are plain straights, with the pit lane beside them
  const pitStraight = index === 0 || index === total - 1;
  if (straight) kind = rng.chance(0.3) && !pitStraight ? "bendy" : "straight";
  else kind = rng.chance(0.4) ? "sharp" : "corner";
  const bendSign: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  if (force) {
    if (straight !== (force === "straight" || force === "bendy" || force === "kink" || force === "chicaneA" || force === "chicaneB" || force === "esses" || isCrossing(force))) throw new Error(`a ${force} cell at ${cx},${cy} does not fit the way the road runs`);
    kind = force;
  }

  // handle length: 27.6 draws a quarter circle; longer handles squeeze the bend toward the cell corner
  const handle = kind === "sharp" ? 36 : 27.6;
  const c1 = add(p0, mul(toPrev, -handle));
  const c2 = sub(p2, mul(toNext, handle));
  let center: Vec2[];
  if (kind === "corner" || kind === "sharp") {
    center = [];
    for (let i = 0; i <= SAMPLES; i++) center.push(bezier(p0, c1, c2, p2, i / SAMPLES));
  } else center = straightCentre(isCrossing(kind) ? "straight" : (kind as StraightShape), p0, p2, bendSign);
  const seg: Segment = {
    index, cx, cy, kind, center, normals: normalsOf(center),
    entry: makeGate(p0, mul(toPrev, -1)),
    exit: makeGate(p2, toNext),
    obstacles: [],
  };
  // nothing sits in a junction, and nothing is laid on the road just before it
  placeFeatures(seg, rng, pitStraight || isCrossing(kind));
  return seg;
}

/** Smallest distance between a segment's centre line and those of every segment that is not next to it. */
function separationFrom(segs: Segment[], i: number): number {
  const n = segs.length;
  let best = Infinity;
  for (let j = 0; j < n; j++) {
    const gap = Math.min((i - j + n) % n, (j - i + n) % n);
    if (gap <= 1) continue;
    for (const p of segs[i]!.center) for (const q of segs[j]!.center) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return best;
}

/** Enough room between road and road that two cars on different bits of track can never touch. */
export const MIN_SEPARATION = 2 * ROAD_HALF + 4;

interface Saved { center: Vec2[]; normals: Vec2[]; entry: Gate; exit: Gate; kind: SegmentKind; obstacles: Obstacle[]; powerup: Powerup | undefined }
const save = (s: Segment): Saved => ({ center: s.center, normals: s.normals, entry: s.entry, exit: s.exit, kind: s.kind, obstacles: s.obstacles, powerup: s.powerup });
const restore = (s: Segment, v: Saved) => { Object.assign(s, v); };

/**
 * Lay a three-cell arc piece (a `uturn` or a `sweeper`) over cells i, i + 1 and i + 2 of a built loop: the outer gates stay
 * where they are, the two gates inside move onto the arc. Returns false (and changes nothing) if it would bring the road
 * closer to the rest of the track than it already was, or than two cars can pass.
 */
function applyWindow(segs: Segment[], i: number, piece: "uturn" | "sweeper", rng: Rng | null): boolean {
  const a = segs[i]!, b = segs[i + 1]!, c = segs[i + 2]!;
  const E: GateGeom = a.entry, X: GateGeom = c.exit;
  const w = piece === "uturn" ? uturnWindow(E, X) : sweeperWindow(E, X);
  const before = Math.min(separationFrom(segs, i), separationFrom(segs, i + 1), separationFrom(segs, i + 2));
  const old = [save(a), save(b), save(c)];
  const g0 = gateAt(w.gates[0]!.mid, w.gates[0]!.dir), g1 = gateAt(w.gates[1]!.mid, w.gates[1]!.dir);
  const mk = (g: GateGeom): Gate => ({ mid: g.mid, dir: g.dir, n: g.n });
  const set = (s: Segment, centre: Vec2[], entry: Gate, exit: Gate) => { s.center = centre; s.normals = normalsOf(centre); s.entry = entry; s.exit = exit; s.kind = piece; };
  set(a, w.centres[0]!, a.entry, mk(g0));
  set(b, w.centres[1]!, mk(g0), mk(g1));
  set(c, w.centres[2]!, mk(g1), c.exit);
  const after = Math.min(separationFrom(segs, i), separationFrom(segs, i + 1), separationFrom(segs, i + 2));
  if (after < Math.min(MIN_SEPARATION, before) - 0.5) { restore(a, old[0]!); restore(b, old[1]!); restore(c, old[2]!); return false; }
  if (rng) for (const s of [a, b, c]) placeFeatures(s, rng, false);
  return true;
}

/** A corner cell's centre line: `sharp` squeezes the bend toward the cell corner for a tight, square 90. */
function cornerCentre(s: Segment, kind: "corner" | "sharp"): Vec2[] {
  const handle = kind === "sharp" ? 36 : 27.6;
  const c1 = add(s.entry.mid, mul(s.entry.dir, handle));
  const c2 = sub(s.exit.mid, mul(s.exit.dir, handle));
  const out: Vec2[] = [];
  for (let i = 0; i <= SAMPLES; i++) out.push(bezier(s.entry.mid, c1, c2, s.exit.mid, i / SAMPLES));
  return out;
}

/**
 * The extra pieces for a random track, chosen from a stream of their own so that the layout and the rest of the random
 * draws are exactly what they always were. Corners are meant to be the exception, so the work here is to give the road
 * character:
 *  - a corner between two straights is often a long fast `sweeper` (radius 1.5 cells), and a corner, a straight and a corner
 *    in the same direction sometimes a wide `uturn`;
 *  - two corners in a row the same way are a tight hairpin, so those corners are made `sharp`;
 *  - plenty of the straights get a `kink` or `esses`, and some a chicane: two cells, one swinging each way.
 */
function enrich(segs: Segment[], cyc: [number, number][], seed: number): void {
  const n = segs.length;
  const rng = new Rng((seed ^ 0x91ec3b5d) >>> 0);
  const turn = (i: number): number => {
    const a = cyc[(i + n - 1) % n]!, b = cyc[i]!, c = cyc[(i + 1) % n]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    return cross === 0 ? 0 : cross > 0 ? 1 : -1;
  };
  // wide arcs first: windows of three cells that stay clear of the two pit straights (indices 0 and n - 1)
  const used = new Set<number>();
  for (let i = 1; i + 2 <= n - 2; i++) {
    if (used.has(i) || used.has(i + 1) || used.has(i + 2)) continue;
    const t0 = turn(i), t1 = turn(i + 1), t2 = turn(i + 2);
    const sweeper = t0 === 0 && t1 !== 0 && t2 === 0;
    const uturn = t0 !== 0 && t1 === 0 && t2 === t0;
    if (!sweeper && !uturn) continue;
    if (!rng.chance(sweeper ? SWEEPER_CHANCE : UTURN_CHANCE)) continue;
    if (applyWindow(segs, i, sweeper ? "sweeper" : "uturn", rng)) { used.add(i); used.add(i + 1); used.add(i + 2); }
  }
  // hairpins: corners that follow each other the same way are squeezed tight
  for (let i = 1; i < n - 1; i++) {
    const s = segs[i]!;
    if (used.has(i) || (s.kind !== "corner" && s.kind !== "sharp")) continue;
    const t = turn(i);
    const pair = (j: number) => j >= 0 && j < n && !used.has(j) && turn(j) === t;
    if ((pair(i - 1) || pair(i + 1)) && rng.chance(HAIRPIN_CHANCE) && s.kind !== "sharp") { s.kind = "sharp"; s.center = cornerCentre(s, "sharp"); s.normals = normalsOf(s.center); }
  }
  // then the straight-cell pieces: a bendy cell is always something else, and so are many plain straights. A chicane is two
  // cells, a swing one way and a swing back, so it needs the next cell to be a plain straight too
  const free = (k: number) => k > 0 && k < n - 1 && !used.has(k) && turn(k) === 0 && (segs[k]!.kind === "straight" || segs[k]!.kind === "bendy");
  const reshape = (s: Segment, kind: StraightShape, sign: 1 | -1) => {
    s.center = straightCentre(kind, s.entry.mid, s.exit.mid, sign);
    s.normals = normalsOf(s.center);
    s.kind = kind;
    used.add(s.index);
    placeFeatures(s, rng, false);
  };
  for (const s of segs) {
    if (!free(s.index)) continue;
    if (s.kind !== "bendy" && !(rng.chance(TECHNICAL_STRAIGHT))) continue;
    const r = rng.next();
    const sign: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    if (r >= 1 - CHICANE_SHARE && free(s.index + 1)) { reshape(s, "chicaneA", sign); reshape(segs[s.index + 1]!, "chicaneB", sign); continue; }
    reshape(s, r < 0.35 ? "kink" : "esses", sign);
  }
}

/** Chances, for the pieces `enrich` lays. */
const SWEEPER_CHANCE = 0.85;
const UTURN_CHANCE = 0.45;
const HAIRPIN_CHANCE = 0.25;
const TECHNICAL_STRAIGHT = 0.12;
/** Of the technical straights, the share that are the start of a chicane (when the cell after it is free for the other half). */
const CHICANE_SHARE = 0.4;
/** How many cells shorter than the target the starting ring may be; the rest of the length comes from bumps. */
const RING_SLACK = 4;

/** The lookup tables from cells to segments. */
export function indexCells(segments: Segment[], branches: Branch[] = [], extra: Segment[] = []): Pick<Track, "cellIndex" | "cellSegments" | "branches" | "allSegments"> {
  const cellIndex = new Map<string, number>();
  const cellSegments = new Map<string, number[]>();
  const allSegments = [...segments, ...extra];
  for (const s of allSegments) {
    const k = key(s.cx, s.cy);
    if (!cellIndex.has(k)) cellIndex.set(k, s.index);
    cellSegments.set(k, [...(cellSegments.get(k) ?? []), s.index]);
  }
  return { cellIndex, cellSegments, branches, allSegments };
}

/** Centreline point and normal at t in [0, 1]. */
export function centreAt(seg: Segment, t: number): { p: Vec2; n: Vec2 } {
  const f = Math.min(Math.max(t, 0), 1) * SAMPLES;
  const i = Math.min(SAMPLES - 1, Math.floor(f));
  const u = f - i;
  return { p: lerp(seg.center[i]!, seg.center[i + 1]!, u), n: norm(lerp(seg.normals[i]!, seg.normals[i + 1]!, u)) };
}

export interface TrackOptions {
  /** boxes and water; off leaves the same track with clear roads */
  obstacles?: boolean;
  /** leave out to let the seed choose */
  biome?: BiomeId;
  /** false leaves out kinks, chicanes and the wide arcs (tests compare with and without) */
  pieces?: boolean;
  /** false leaves out hills, rough surfaces, banking and tunnels (tests compare with and without) */
  landscape?: boolean;
  /** false leaves the ramps, speed pads and patches off a `fun-` track (tests compare with and without) */
  fx?: boolean;
}

/** Fun tracks are asked for by name: the phrase starts with `fun-`. */
export const isFunPhrase = (normalised: string): boolean => normalised.startsWith("fun-");

/** What a phrase says about a track without building it: its place and the machines on it. */
export function placeFor(phrase: string): { phrase: string; seed: number; fun: boolean; biome: BiomeId; vehicle: VehicleId; choices: VehicleId[] } {
  const norm_ = normalizePhrase(phrase);
  const circuit = circuitFor(norm_);
  const seed = phraseToSeed(circuit ? circuit.id : norm_);
  const fun = !circuit && isFunPhrase(norm_);
  const biome = circuit ? circuit.biome : biomeForSeed(seed, fun);
  const choices = vehicleChoices(seed, biomeOf(biome).domain, circuit?.id);
  return { phrase: norm_, seed, fun, biome, vehicle: choices[0]!, choices };
}

/** The machines for a track. */
export const vehicleForTrack = (t: Track): VehicleId => (t.circuit && KART_CIRCUITS.has(t.circuit.id) ? "kart" : t.circuit && CIRCUIT_VEHICLES[t.circuit.id]) || vehicleForSeed(t.seed, biomeOf(t.biome).domain);

/** Every machine a track offers, its own first. */
export const vehicleChoicesForTrack = (t: Track): VehicleId[] => vehicleChoices(t.seed, biomeOf(t.biome).domain, t.circuit?.id);

/** The same phrase (and options) always give the same track. */
export function generateTrack(phrase: string, opts: TrackOptions = {}): Track {
  const t = generateLayout(phrase, opts);
  if (t.fun && !t.circuit && opts.fx !== false) funPieces(t);
  return opts.landscape === false ? t : landscape(t);
}

function generateLayout(phrase: string, opts: TrackOptions): Track {
  const norm_ = normalizePhrase(phrase);
  const named = circuitFor(norm_);
  if (named) return buildCircuit(named, norm_, opts);
  const seed = phraseToSeed(norm_);
  if (isFunPhrase(norm_)) {
    // fun tracks run over themselves; a layout that does not come out well is thrown away for the next one
    // a fun track is meant to have a choice in it: the first layout that comes out well and has a shortcut wins, and if none has one,
    // the first that comes out well at all
    let plain: Track | null = null;
    for (let attempt = 0; attempt < FUN_ATTEMPTS; attempt++) {
      const lay = funLayout(norm_, seed, attempt);
      if (!lay) continue;
      for (const windows of [lay.windows, undefined]) {
        try {
          const t = buildCircuit({ ...lay, windows }, norm_, opts, true);
          if (checkTrack(t).length !== 0 || minClearance(t) < MIN_CLEAR - 0.01) continue;
          if (t.branches.length) return t;
          plain ??= t;
          break;
        } catch { /* try the layout without its wide arcs, then the next layout */ }
      }
    }
    if (plain) return plain;
  }
  // now and then an ordinary track is a figure of eight with a bridge: decided from a stream of its own, so every other phrase keeps its track
  const bridged = bridgedTrack(norm_, seed, opts);
  if (bridged) return bridged;
  const rng = new Rng(seed);
  const cols = 7;
  const rows = 5;
  const target = 2 * rng.int(5) + 14; // 14..22 cells, even
  let cyc: [number, number][] = [];
  let candidates: number[] = [];
  // the start line sits between two straight cells in a row, so the pit lane has room: grow again until one has
  for (let attempt = 0; attempt < 80; attempt++) {
    cyc = growCycle(rng, cols, rows, target);
    if (rng.chance(0.5)) cyc = [...cyc].reverse();
    const n = cyc.length;
    const straightAt = (i: number) => {
      const a = cyc[(i + n - 1) % n]!;
      const c = cyc[(i + 1) % n]!;
      return a[0] + c[0] === 2 * cyc[i]![0] && a[1] + c[1] === 2 * cyc[i]![1];
    };
    candidates = cyc.map((_, i) => i).filter((i) => straightAt(i) && straightAt((i + n - 1) % n));
    if (candidates.length) break;
  }
  const n = cyc.length;
  const startAt = candidates.length ? rng.pick(candidates) : 0;
  cyc = [...cyc.slice(startAt), ...cyc.slice(0, startAt)];
  const segments = cyc.map((cell, i) => buildSegment(rng, i, cell, cyc[(i + n - 1) % n]!, cyc[(i + 1) % n]!, n));
  if (opts.pieces !== false) enrich(segments, cyc, seed);
  // the layout is drawn from the same random stream either way, so switching obstacles off keeps the track
  if (opts.obstacles === false) for (const s of segments) s.obstacles = [];
  const fun = isFunPhrase(norm_);
  let branches: Branch[] = [], extra: Segment[] = [];
  if (fun) {
    applyWidths(segments, seed);
    ({ branches, extra } = makeBranches(segments, cols, rows, seed));
    if (opts.obstacles === false) for (const s of extra) s.obstacles = [];
  }
  const g = segments[0]!.entry;
  const pit = makePit(g.mid, g.dir, g.n, rng.chance(0.5) ? 1 : -1);
  return { phrase: norm_, seed, cols, rows, segments, pit, obstacles: opts.obstacles !== false, biome: opts.biome ?? biomeForSeed(seed, fun), fun, ...indexCells(segments, branches, extra) };
}

/** Of the ordinary tracks, the share that run over themselves on a bridge (a fun track has them far more often). */
export const NORMAL_BRIDGE_CHANCE = 0.1;
/** How many layouts an ordinary phrase tries for its bridge before it settles for an ordinary loop. */
const BRIDGE_ATTEMPTS = 40;

/**
 * An ordinary track (not a hidden circuit, not a fun phrase) that crosses itself on a bridge: a figure of eight or a chain of lobes
 * drawn on the usual 7 by 5 grid, with every crossing a bridge, so nobody can run into anybody there. Null for most phrases.
 */
function bridgedTrack(phrase: string, seed: number, opts: TrackOptions): Track | null {
  if (!new Rng((seed ^ 0x6b1d9e57) >>> 0).chance(NORMAL_BRIDGE_CHANCE)) return null;
  for (let attempt = 0; attempt < BRIDGE_ATTEMPTS; attempt++) {
    const lay = funLayout(phrase, seed ^ 0x2c1b3c6d, attempt, { cols: 7, rows: 5, bridges: 1 });
    if (!lay || lay.cells.length < 14 || lay.cells.length > 22) continue;
    for (const windows of [lay.windows, undefined]) {
      try {
        const t = buildCircuit({ ...lay, windows }, phrase, opts, false, true);
        if (checkTrack(t).length !== 0 || minClearance(t) < MIN_CLEAR - 0.01) continue;
        return t;
      } catch { /* try the layout without its wide arcs, then the next layout */ }
    }
  }
  return null;
}

/** A track copied from a real circuit: its cells in driving order, with the kind of each, and its wide arcs. `plain`: not a circuit at all, an ordinary track laid out from cells. */
function buildCircuit(c: Circuit, typed: string, opts: TrackOptions, fun = false, plain = false): Track {
  if (c.free) return buildFreeCircuit(c, typed, opts);
  const seed = phraseToSeed(c.id);
  const rng = new Rng(seed);
  const n = c.cells.length;
  const rot = (i: number) => (i + c.start) % n;
  const cyc = c.cells.map((_, i) => [c.cells[rot(i)]![0], c.cells[rot(i)]![1]] as [number, number]);
  const segments = cyc.map((cell, i) => buildSegment(rng, i, cell, cyc[(i + n - 1) % n]!, cyc[(i + 1) % n]!, n, c.cells[rot(i)]![2]));
  // the two halves of a chicane swing opposite ways; which way it starts is fixed by where it is
  segments.forEach((q, i) => {
    if (q.kind !== "chicaneA" && q.kind !== "chicaneB") return;
    const start = q.kind === "chicaneA" ? i : i - 1;
    q.center = straightCentre(q.kind, q.entry.mid, q.exit.mid, start % 2 === 0 ? 1 : -1);
    q.normals = normalsOf(q.center);
    placeFeatures(q, new Rng(seed ^ (i + 1)), false);
  });
  for (const w of c.windows ?? []) {
    const i = (w.at - c.start + n) % n;
    if (i + 2 > n - 1) throw new Error(`${c.id}: the ${w.piece} at cell ${w.at} runs past the end of the loop`);
    if (!applyWindow(segments, i, w.piece, rng)) throw new Error(`${c.id}: the ${w.piece} at cell ${w.at} does not fit`);
  }
  let branches: Branch[] = [], extra: Segment[] = [];
  if (fun) {
    applyWidths(segments, seed);
    ({ branches, extra } = makeBranches(segments, c.cols, c.rows, seed));
  }
  if (opts.obstacles === false) for (const s of [...segments, ...extra]) s.obstacles = [];
  const g = segments[0]!.entry;
  // the pit lane goes on the infield side of the start straight, unless other road runs close beside it there
  const mx = segments.reduce((a, q) => a + q.center[12]!.x, 0) / n, my = segments.reduce((a, q) => a + q.center[12]!.y, 0) / n;
  const inward = (mx - g.mid.x) * g.n.x + (my - g.mid.y) * g.n.y;
  const crowding = (side: 1 | -1): number => {
    let near = 0;
    for (const q of segments.slice(1, -1)) for (const p of q.center) {
      const along = (p.x - g.mid.x) * g.dir.x + (p.y - g.mid.y) * g.dir.y, across = ((p.x - g.mid.x) * g.n.x + (p.y - g.mid.y) * g.n.y) * side;
      if (Math.abs(along) < 90 && across > 0 && across < 80) near++;
    }
    return near;
  };
  const inwardSide: 1 | -1 = inward >= 0 ? 1 : -1;
  const pit = makePit(g.mid, g.dir, g.n, crowding(inwardSide) <= crowding(-inwardSide as 1 | -1) ? inwardSide : (-inwardSide as 1 | -1));
  const track: Track = {
    phrase: typed, seed, cols: c.cols, rows: c.rows, segments, pit, obstacles: opts.obstacles !== false,
    biome: opts.biome ?? (fun ? biomeForSeed(seed, true) : plain ? biomeForSeed(seed, false) : c.biome), fun, ...indexCells(segments, branches, extra),
    ...(fun || plain ? {} : { circuit: { id: c.id, name: c.name, lengthKm: c.lengthKm, blurb: c.blurb } }),
  };
  return track;
}

/** How many layouts a fun phrase tries before it settles for an ordinary loop. */
const FUN_ATTEMPTS = 40;

/** Length of one lap along the centreline, units. */
export function trackLength(t: Track): number {
  let len = 0;
  for (const s of t.segments) for (let k = 0; k < s.center.length - 1; k++) len += dist(s.center[k]!, s.center[k + 1]!);
  return len;
}

/** Structural rules from the brief: a closed loop of adjacent cells, no repeats, no dead ends. Returns problems. */
export function checkTrack(t: Track): string[] {
  const problems: string[] = [];
  const n = t.segments.length;
  const seen = new Map<string, number>();
  t.segments.forEach((s, i) => {
    const k = key(s.cx, s.cy);
    // only a crossing may use a cell twice, and then both visits are crossing pieces going different ways: two crosses, or a bridge and the road under it
    const other = seen.get(k);
    if (other !== undefined && !t.free) {
      const o = t.segments[other]!;
      const pairOk = (s.kind === "cross" && o.kind === "cross") || (s.kind === "bridge" && o.kind === "under") || (s.kind === "under" && o.kind === "bridge");
      if (!pairOk || s.entry.dir.x * o.entry.dir.x + s.entry.dir.y * o.entry.dir.y !== 0) problems.push(`cell ${k} used twice`);
    }
    seen.set(k, i);
    if (s.cx < 0 || s.cy < 0 || s.cx >= t.cols || s.cy >= t.rows) problems.push(`cell ${k} outside the grid`);
    const nx = t.segments[(i + 1) % n]!;
    // (a mapped circuit's segments are cut along the road, not laid in cells)
    if (!t.free && Math.abs(nx.cx - s.cx) + Math.abs(nx.cy - s.cy) !== 1) problems.push(`segment ${i} does not touch segment ${(i + 1) % n}`);
    if (dist(s.exit.mid, nx.entry.mid) > 1e-6) problems.push(`gate ${i} does not join`);
    for (const o of s.obstacles) {
      // a car must be able to pass on at least one side
      const lat = lateralOf(s, o);
      const hh = narrowestNear(s, o);
      const gap = Math.max(hh - (lat + o.r), hh - (-lat + o.r));
      if (gap < 2 * CAR_R + 2) problems.push(`obstacle in segment ${i} leaves no way through`);
    }
  });
  // shortcuts: they start at the fork cell's entry gate, join up piece by piece, and end at the rejoin cell's exit gate
  for (const b of t.branches) {
    const F = t.segments[b.fork]!, R = t.segments[b.rejoin]!;
    const ids = b.segs, first = t.allSegments[ids[0]!]!, last = t.allSegments[ids.at(-1)!]!;
    if (first.cx !== F.cx || first.cy !== F.cy || dist(first.entry.mid, F.entry.mid) > 1e-6) problems.push(`shortcut ${b.id} does not leave from its fork`);
    if (last.cx !== R.cx || last.cy !== R.cy || dist(last.exit.mid, R.exit.mid) > 1e-6) problems.push(`shortcut ${b.id} does not rejoin the road`);
    ids.forEach((id, k) => {
      const s = t.allSegments[id]!;
      if (s.index !== id) problems.push(`shortcut piece ${id} has the wrong index`);
      const nx = k + 1 < ids.length ? t.allSegments[ids[k + 1]!]! : t.segments[(b.rejoin + 1) % n]!;
      if (dist(s.exit.mid, nx.entry.mid) > 1e-6) problems.push(`shortcut piece ${id} does not join the next`);
      if (k > 0 && k < ids.length - 1 && seen.has(key(s.cx, s.cy))) problems.push(`shortcut piece ${id} is on the ring`);
    });
  }
  problems.push(...checkFx(t));
  if (n < 4 || (n % 2 && !t.free)) problems.push(`loop has ${n} cells`);
  const first = t.segments[0], last = t.segments.at(-1);
  if (first && last && (first.kind !== "straight" || last.kind !== "straight")) problems.push("the pit straight is not straight");
  if (first && last && (first.entry.dir.x !== last.exit.dir.x || first.entry.dir.y !== last.exit.dir.y)) problems.push("the pit straight bends at the start line");
  return problems;
}

/** Half the road width at the centre point nearest an obstacle. */
function narrowestNear(s: Segment, o: Obstacle): number {
  let best = Infinity, h = ROAD_HALF;
  for (let i = 0; i <= SAMPLES; i++) {
    const d = Math.hypot(o.x - s.center[i]!.x, o.y - s.center[i]!.y);
    if (d < best) { best = d; h = halfIdx(s, i); }
  }
  return h;
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

const LEVELS = new WeakMap<Track, Int16Array | null>();
/**
 * Which level each segment is on, by segment id, or null when the track has no bridge. A bridge and the road under it are
 * +k and -k (k counts the bridges from 1); every other segment is 0. Cars on +k and -k never touch or give way to each other.
 */
export function levelsOf(t: Track): Int16Array | null {
  let l = LEVELS.get(t);
  if (l === undefined) {
    l = null;
    let k = 0;
    for (const s of t.allSegments) {
      if (s.kind !== "bridge") continue;
      const under = t.allSegments.find((o) => o.kind === "under" && o.cx === s.cx && o.cy === s.cy);
      if (!under) continue;
      l ??= new Int16Array(t.allSegments.length);
      k++;
      l[s.index] = k; l[under.index] = -k;
    }
    LEVELS.set(t, l);
  }
  return l;
}

const NEAR = new WeakMap<Track, Map<number, Segment[]>>();
/** Segments near a point: its cell and the eight around it. A track never changes, so the answer for each cell is worked out once. */
export function nearbySegments(t: Track, p: Vec2): Segment[] {
  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  let memo = NEAR.get(t);
  if (!memo) { memo = new Map(); NEAR.set(t, memo); }
  const k = (cx + 64) * 4096 + (cy + 64);
  let out = memo.get(k);
  if (!out) {
    out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of t.cellSegments.get(key(cx + dx, cy + dy)) ?? []) out.push(t.allSegments[i]!);
      }
    }
    memo.set(k, out);
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

/** How far inside the road p is: the best of (half the road width there minus the distance from its centre line) over the nearby road. Negative off the road. */
export function roadMargin(t: Track, p: Vec2): number {
  let best = -Infinity;
  for (const s of nearbySegments(t, p)) {
    for (let i = 0; i < SAMPLES; i++) {
      const a = s.center[i]!, b = s.center[i + 1]!;
      const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby;
      const u = l2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
      const d = Math.hypot(p.x - (a.x + abx * u), p.y - (a.y + aby * u));
      const h = s.half ? s.half[i]! + (s.half[i + 1]! - s.half[i]!) * u : ROAD_HALF;
      if (h - d > best) best = h - d;
    }
  }
  return best;
}

export function inObstacle(t: Track, p: Vec2, margin: number): Obstacle | undefined {
  for (const s of nearbySegments(t, p)) {
    for (const o of s.obstacles) if (Math.hypot(p.x - o.x, p.y - o.y) < o.r + margin) return o;
  }
  return undefined;
}

/** True when a car centred at p stays on the road (two wheels on the track at the least, so the kerb is allowed) and clear of obstacles. */
export function isDrivable(t: Track, p: Vec2, margin = CAR_R): boolean {
  return roadMargin(t, p) >= margin - KERB_ALLOW && !inObstacle(t, p, margin);
}

export function trackBounds(t: Track): { w: number; h: number } {
  return { w: t.cols * CELL, h: t.rows * CELL };
}
