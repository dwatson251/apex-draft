import type { Circuit, CircuitKind } from "./circuits.ts";
import { Rng } from "./rng.ts";

/**
 * The layouts of `fun-` tracks: loops that run over themselves. A cell used twice is a crossing, and it is only allowed where one
 * visit runs straight across the other (the `cross` piece). Two families, drawn on the cell grid with random sizes, mirrored and
 * turned at random:
 *  - a figure of eight: two lobes meeting at one crossing
 *  - a chain of three lobes with two crossings, like the Demolition Derby
 * `funLayout` hands back a loop as a `Circuit` (its cells, the kind of each, and wide arcs to lay over some of them); the track
 * builder in track.ts does the rest, and tries again with the next attempt if the result will not do.
 */

type Cell = [number, number];

const MAX_COLS = 13;
const MAX_ROWS = 8;

/** A route written as runs from a start cell: [direction, length] pairs. */
function walk(from: Cell, runs: [string, number][]): Cell[] {
  const d: Record<string, Cell> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
  const out: Cell[] = [];
  let [x, y] = from;
  for (const [dir, len] of runs) for (let k = 0; k < len; k++) { out.push([x, y]); x += d[dir]![0]; y += d[dir]![1]; }
  if (x !== from[0] || y !== from[1]) throw new Error("the route does not close");
  return out;
}

function eight(rng: Rng): Cell[] {
  const a = 2 + rng.int(3), b = 2 + rng.int(3), h1 = 2 + rng.int(2), h2 = 2 + rng.int(2);
  // from the crossing: east round the lobe below-right, north through the crossing, west round the lobe above-left, and back east into it
  return walk([b, h2], [["E", a], ["S", h1], ["W", a], ["N", h1 + h2], ["W", b], ["S", h2], ["E", b]]);
}

function chain(rng: Rng): Cell[] {
  const a = 4 + rng.int(3), c = 1 + rng.int(a - 2), d = a - c + 1 + rng.int(4), e = 2 + rng.int(2);
  const h1 = 1 + rng.int(2), h2 = 1 + rng.int(2), h3 = 1 + rng.int(2), f = c + d + e - a;
  return walk([f, h2], [["E", a], ["S", h1], ["W", c], ["N", h1 + h2], ["W", d], ["S", h2 + h3], ["W", e], ["N", h3], ["E", f]]);
}

const key = (c: Cell) => `${c[0]},${c[1]}`;

/** Every cell used twice is a straight-across crossing; no cell is used three times; neighbours touch. */
function valid(cells: Cell[]): boolean {
  const n = cells.length;
  const at = new Map<string, number[]>();
  cells.forEach((c, i) => at.set(key(c), [...(at.get(key(c)) ?? []), i]));
  for (let i = 0; i < n; i++) {
    const a = cells[i]!, b = cells[(i + 1) % n]!;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return false;
  }
  const dir = (i: number): Cell => { const a = cells[(i + n - 1) % n]!, b = cells[(i + 1) % n]!; return [b[0] - a[0], b[1] - a[1]]; };
  for (const [, idx] of at) {
    if (idx.length === 1) continue;
    if (idx.length > 2) return false;
    const u = dir(idx[0]!), v = dir(idx[1]!);
    const straight = (i: number) => { const a = cells[(i + n - 1) % n]!, b = cells[(i + 1) % n]!, c = cells[i]!; return a[0] + b[0] === 2 * c[0] && a[1] + b[1] === 2 * c[1]; };
    if (!straight(idx[0]!) || !straight(idx[1]!) || u[0] * v[0] + u[1] * v[1] !== 0) return false;
  }
  return true;
}

export function funLayout(phrase: string, seed: number, attempt: number): Circuit | null {
  const rng = new Rng((seed ^ 0xf00dcafe ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0);
  let cells = rng.chance(0.5) ? eight(rng) : chain(rng);
  // turn and mirror it
  const flip = rng.int(8);
  cells = cells.map(([x, y]): Cell => {
    if (flip & 1) [x, y] = [y, x];
    if (flip & 2) x = -x;
    if (flip & 4) y = -y;
    return [x, y];
  });
  if (rng.chance(0.5)) cells.reverse();
  const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
  cells = cells.map(([x, y]): Cell => [x - minX, y - minY]);
  const cols = Math.max(...cells.map((c) => c[0])) + 1, rows = Math.max(...cells.map((c) => c[1])) + 1;
  if (cols > MAX_COLS || rows > MAX_ROWS || !valid(cells)) return null;
  const n = cells.length;
  if (n % 2) return null;

  const turn = (i: number): boolean => { const a = cells[(i + n - 1) % n]!, b = cells[i]!, c = cells[(i + 1) % n]!; return a[0] + c[0] !== 2 * b[0] || a[1] + c[1] !== 2 * b[1]; };
  const seen = new Map<string, number>();
  const crossing = new Set<number>();
  cells.forEach((c, i) => { const k = key(c), o = seen.get(k); if (o !== undefined) { crossing.add(i); crossing.add(o); } seen.set(k, i); });
  // the start line sits between two straight cells, on a run of four in a line, as far from a crossing as it can be
  const straightRun = (i: number) => !crossing.has(i) && !crossing.has((i + n - 1) % n);
  const ring = (i: number) => { let best = n; for (const c of crossing) best = Math.min(best, Math.abs(c - i), n - Math.abs(c - i)); return best; };
  const starts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = cells[(i + n - 2) % n]!, b = cells[(i + n - 1) % n]!, c = cells[i]!, d = cells[(i + 1) % n]!;
    const line = b[0] - a[0] === c[0] - b[0] && b[1] - a[1] === c[1] - b[1] && d[0] - c[0] === c[0] - b[0] && d[1] - c[1] === c[1] - b[1];
    if (line && straightRun(i)) starts.push(i);
  }
  if (!starts.length) return null;
  const best = Math.max(...starts.map(ring));
  const start = rng.pick(starts.filter((i) => ring(i) >= Math.min(best, 3)));
  cells = [...cells.slice(start), ...cells.slice(0, start)];
  const turned = (i: number) => turn(i);
  const cross = new Set<number>([...crossing].map((i) => (i - start + n) % n));

  // the kind of each cell: corners are sometimes tight, a few straights have a kink or esses; never beside the start line
  const out: [number, number, CircuitKind][] = cells.map(([x, y], i) => {
    if (cross.has(i)) return [x, y, "cross"];
    if (turned(i)) return [x, y, rng.chance(0.35) ? "sharp" : "corner"];
    if (i > 0 && i < n - 1 && rng.chance(0.15)) return [x, y, rng.chance(0.5) ? "kink" : "esses"];
    return [x, y, "straight"];
  });

  // wide arcs where a corner sits between two straights (a sweeper), or a run of corner, straight, corner the same way (a uturn)
  const windows: { at: number; piece: "uturn" | "sweeper" }[] = [];
  const turnSign = (i: number): number => { const a = cells[(i + n - 1) % n]!, b = cells[i]!, c = cells[(i + 1) % n]!; const x = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); return Math.sign(x); };
  for (let i = 1; i + 2 <= n - 2; i++) {
    if ([0, 1, 2].some((k) => cross.has(i + k))) continue;
    const t0 = turnSign(i), t1 = turnSign(i + 1), t2 = turnSign(i + 2);
    const sweeper = t0 === 0 && t1 !== 0 && t2 === 0, uturn = t0 !== 0 && t1 === 0 && t2 === t0;
    if (!sweeper && !uturn) continue;
    if (!rng.chance(sweeper ? 0.6 : 0.4)) continue;
    // a window replaces the kinds of its cells
    for (let k = 0; k < 3; k++) out[i + k]![2] = turned(i + k) ? "corner" : "straight";
    windows.push({ at: i, piece: sweeper ? "sweeper" : "uturn" });
    i += 2;
  }
  return { id: phrase, name: "Fun", lengthKm: Math.round(n * 0.2 * 10) / 10, blurb: "", cols, rows, biome: "grass", cells: out, start: 0, windows };
}
