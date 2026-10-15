import { Rng } from "./rng.ts";
import { SAMPLES } from "./pieces.ts";
import { buildSegment, halfIdx, nextOf, type Branch, type Segment, type Track } from "./track.ts";
import { pinchSegment } from "./width.ts";
import { estimateTime } from "./routetime.ts";

/**
 * Shortcuts for `fun-` tracks. A shortcut leaves the ring at a straight cell (the junction: the road goes on along the ring, or
 * turns off to one side through a corner that starts from the same gate) and runs through free cells to the side of a later
 * straight cell, where it turns back in and joins the ring. It is shorter than the way round the ring, but it is not free:
 * it has tight corners, and sometimes a bottleneck.
 *
 * Every shortcut piece is an ordinary segment with its own id (from the ring's length up), a `next` that says where it leads,
 * and, for the piece in the fork cell, an `alt` naming the ring segment it shares its entry gate with.
 */

type Cell = [number, number];
const key = (c: Cell) => `${c[0]},${c[1]}`;

/** How much shorter, in cells, a shortcut must be than the ring road it replaces. */
const MIN_SAVING = 2;
const MAX_BRANCHES = 2;

/**
 * The way a shortcut is judged: how long it takes, against the ring road it replaces, for a standard car (`estimateTime`). A shortcut
 * that is much quicker would always be taken and one that is much slower never, so neither is a choice. Between these the driver has to
 * weigh a shorter but tighter or narrower way against a longer, faster one (or a way that avoids a crossing).
 */
const MIN_RATIO = 0.74;
const MAX_RATIO = 1.2;
/** A shortcut may be this much quicker still where it avoids a crossing the ring road has to go through: that is what makes it worth less than it looks. */
const MIN_RATIO_AVOIDING = 0.62;
/** Before any road is laid: a shortcut that is under this share of the cells of the ring it replaces is not worth trying (it would always win). */
const MIN_CELL_RATIO = 0.3;

/** Gap between road edges, below which two bits of road that are not connected count as touching. */
export const MIN_CLEAR = 4;

/** Segments that lead into one another, share a gate, or meet at a fork or a merge: allowed to be close. */
function related(t: { allSegments: Segment[]; segments: Segment[] }, a: Segment, b: Segment): boolean {
  if (a.index === b.index) return true;
  const nx = (s: Segment) => s.next ?? (s.index + 1) % t.segments.length;
  const exits = (s: Segment): number[] => { const x = nx(s); return [x, ...(t.allSegments[x]!.alt ?? [])]; };
  return exits(a).includes(b.index) || exits(b).includes(a.index) || !!a.alt?.includes(b.index) || nx(a) === nx(b);
}

/** The least gap between the edges of two unconnected bits of road, or Infinity. Crossings are allowed to meet. */
export function minClearance(t: { allSegments: Segment[]; segments: Segment[] }, only?: number[]): number {
  let best = Infinity;
  const all = t.allSegments;
  for (const a of only ? only.map((i) => all[i]!) : all) {
    for (const b of all) {
      if (only ? a.index === b.index : b.index <= a.index) continue;
      if (related(t, a, b)) continue;
      if (a.kind === "cross" && b.kind === "cross" && a.cx === b.cx && a.cy === b.cy) continue;
      for (let p = 0; p <= SAMPLES; p++) {
        const pa = a.center[p]!, ha = halfIdx(a, p);
        for (let q = 0; q <= SAMPLES; q++) {
          const d = Math.hypot(pa.x - b.center[q]!.x, pa.y - b.center[q]!.y) - ha - halfIdx(b, q);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

/** Shortest path through free cells from `a` to `b` (both free), as a list of cells including both ends. */
function route(a: Cell, b: Cell, free: (c: Cell) => boolean): Cell[] | null {
  const prev = new Map<string, Cell | null>([[key(a), null]]);
  const queue: Cell[] = [a];
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]!;
    if (c[0] === b[0] && c[1] === b[1]) {
      const out: Cell[] = [];
      for (let q: Cell | null | undefined = c; q; q = prev.get(key(q))) out.push(q);
      return out.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Cell[]) {
      const nx: Cell = [c[0] + dx, c[1] + dy];
      if (prev.has(key(nx)) || !free(nx)) continue;
      prev.set(key(nx), c);
      queue.push(nx);
    }
  }
  return null;
}

const plainStraight = (s: Segment) => s.kind === "straight" && !s.half && s.obstacles.length === 0;

/** Lay shortcuts over a built ring. The ring itself is not changed, except that the two junction cells get an `alt`. */
export function makeBranches(segs: Segment[], cols: number, rows: number, seed: number): { branches: Branch[]; extra: Segment[] } {
  const n = segs.length;
  const rng = new Rng((seed ^ 0xb7a9c4e1) >>> 0);
  const branches: Branch[] = [];
  const extra: Segment[] = [];
  const used = new Set<string>(segs.map((s) => key([s.cx, s.cy])));
  const taken = new Set<number>();
  const inGrid = (c: Cell) => c[0] >= 0 && c[1] >= 0 && c[0] < cols && c[1] < rows;
  const cellOf = (s: Segment): Cell => [s.cx, s.cy];
  const want = rng.chance(0.25) ? 1 : MAX_BRANCHES;

  for (let b = 0; b < want; b++) {
    const options: { i: number; j: number; mid: Cell[]; saving: number }[] = [];
    for (let i = 3; i <= n - 7; i++) {
      const F = segs[i]!;
      if (!plainStraight(F) || taken.has(i) || taken.has(i - 1) || taken.has(i + 1)) continue;
      for (let j = i + 4; j <= n - 4; j++) {
        const R = segs[j]!;
        if (!plainStraight(R) || taken.has(j) || taken.has(j - 1) || taken.has(j + 1)) continue;
        if ([...taken].some((k) => k >= i - 1 && k <= j + 1)) continue;
        for (const sF of [1, -1]) for (const sR of [1, -1]) {
          const pf = { x: -F.entry.dir.y * sF, y: F.entry.dir.x * sF }, pr = { x: -R.entry.dir.y * sR, y: R.entry.dir.x * sR };
          const cF: Cell = [F.cx + pf.x, F.cy + pf.y], cR: Cell = [R.cx + pr.x, R.cy + pr.y];
          if (!inGrid(cF) || !inGrid(cR) || used.has(key(cF)) || used.has(key(cR))) continue;
          const mid = route(cF, cR, (c) => inGrid(c) && !used.has(key(c)));
          if (!mid) continue;
          const saving = (j - i + 1) - (mid.length + 2);
          if (saving >= MIN_SAVING && (mid.length + 2) / (j - i + 1) >= MIN_CELL_RATIO) options.push({ i, j, mid, saving });
        }
      }
    }
    if (!options.length) break;
    // try the options in a random order until one fits with room to spare
    for (let tries = 0; tries < 60 && options.length; tries++) {
      const o = options.splice(rng.int(options.length), 1)[0]!;
      const F = segs[o.i]!, R = segs[o.j]!;
      const cells: Cell[] = [cellOf(F), ...o.mid, cellOf(R)];
      const first = n + extra.length;
      const made: Segment[] = cells.map((cell, k) => {
        const prev = k === 0 ? cellOf(segs[o.i - 1]!) : cells[k - 1]!;
        const next = k === cells.length - 1 ? cellOf(segs[(o.j + 1) % n]!) : cells[k + 1]!;
        const s = buildSegment(rng, first + k, cell, prev, next, n);
        s.next = k === cells.length - 1 ? (o.j + 1) % n : first + k + 1;
        return s;
      });
      // nothing sits in a junction: the corner leaving the ring shares its first stretch of road with the ring
      made[0]!.obstacles = []; made[made.length - 1]!.obstacles = [];
      // a shortcut should cost something: a bottleneck in the middle now and then, and as many more as it takes to make it a real
      // choice (a short way that is much quicker than the ring road would always be taken)
      const mids = made.slice(1, -1);
      const ringSegs = segs.slice(o.i, o.j + 1);
      const avoidsCrossing = ringSegs.some((s) => s.kind === "cross");
      const minRatio = avoidsCrossing ? MIN_RATIO_AVOIDING : MIN_RATIO;
      const ringTime = estimateTime(ringSegs, 80, 0);
      const squeezable = mids.filter((s) => !s.half);
      if (squeezable.length && rng.chance(0.5)) pinchSegment(squeezable.splice(rng.int(squeezable.length), 1)[0]!, rng.pick([10, 12]));
      while (squeezable.length && estimateTime(made, 80, 0) / ringTime < minRatio) pinchSegment(squeezable.splice(rng.int(squeezable.length), 1)[0]!, rng.pick([9, 10]));
      const all = [...segs, ...extra, ...made];
      F.alt = [first]; made[0]!.alt = [o.i];
      const view = { allSegments: all, segments: segs };
      if (minClearance(view, made.map((s) => s.index)) < MIN_CLEAR - 0.01) { delete F.alt; continue; }
      // it has to be a real decision: close in time to the road it replaces, in one direction or the other
      const ratio = estimateTime(made, 80, 0) / ringTime;
      if (ratio < minRatio || ratio > MAX_RATIO) { delete F.alt; continue; }
      // the two cells where the road splits and where it comes together are pieces of their own
      F.kind = "fork"; made[0]!.kind = "fork";
      R.kind = "merge"; made.at(-1)!.kind = "merge";
      extra.push(...made);
      branches.push({ id: branches.length, fork: o.i, rejoin: o.j, segs: made.map((s) => s.index) });
      for (const c of o.mid) used.add(key(c));
      for (let k = o.i - 1; k <= o.j + 1; k++) taken.add(k);
      break;
    }
  }
  return { branches, extra };
}

/** Complete routes round the track: every way of choosing at the forks, as lists of segment ids from segment 0 back to it. */
export function routesOf(t: Track): number[][] {
  const cached = ROUTES.get(t);
  if (cached) return cached;
  const out: number[][] = [];
  const walk = (path: number[]): void => {
    const last = path[path.length - 1]!;
    const nx = nextOf(t, last);
    if (nx === 0) { out.push(path); return; }
    for (const id of [nx, ...(t.allSegments[nx]!.alt ?? [])]) walk([...path, id]);
  };
  walk([0]);
  ROUTES.set(t, out);
  return out;
}
const ROUTES = new WeakMap<Track, number[][]>();
