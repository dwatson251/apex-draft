import { ROAD_HALF, halfIdx, type Segment } from "./track.ts";
import { SAMPLES } from "./pieces.ts";
import { Rng } from "./rng.ts";

/**
 * Road that narrows and widens. Only `fun-` tracks have it. A segment's `half` is half the road width at each of its centre
 * points; two segments that meet agree at the gate between them, so the road never steps.
 *  - a pinch squeezes one cell to a bottleneck (single file) and opens out again
 *  - a wide run opens out over one to three cells into an arena, with room to pass three or four abreast, and closes again
 * Neither touches the cells beside the start line, a crossing, or anything that would bring the road closer to other road than
 * two cars can pass.
 */
export const WIDE_MAX = 44;
export const PINCH_MIN = 9;
/** Room that must be left between the edge of one road and the edge of the next. */
const MIN_CLEAR = 4;

const smooth01 = (x: number): number => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };

/** Gap between the edges of segment i and the edges of every segment that is not next to it (crossings are allowed to meet). */
export function clearanceFrom(segs: Segment[], i: number): number {
  const n = segs.length, a = segs[i]!;
  let best = Infinity;
  for (let j = 0; j < n; j++) {
    const gap = Math.min((i - j + n) % n, (j - i + n) % n);
    if (gap <= 1) continue;
    const b = segs[j]!;
    if (a.kind === "cross" && b.kind === "cross" && a.cx === b.cx && a.cy === b.cy) continue;
    for (let p = 0; p <= SAMPLES; p++) {
      const pa = a.center[p]!, ha = halfIdx(a, p);
      for (let q = 0; q <= SAMPLES; q++) {
        const pb = b.center[q]!;
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y) - ha - halfIdx(b, q);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** Give a segment a half-width profile: from `h0` at the entry to `h1` at the exit, plus a bump (negative narrows) in between. */
function shape(s: Segment, h0: number, h1: number, bump: (t: number) => number): void {
  const half: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    half.push(h0 + (h1 - h0) * smooth01(t) + bump(t));
  }
  s.half = half;
  s.entry = { ...s.entry, half: half[0]! };
  s.exit = { ...s.exit, half: half[SAMPLES]! };
}

const reset = (s: Segment): void => { delete s.half; s.entry = { ...s.entry, half: undefined }; s.exit = { ...s.exit, half: undefined }; };

/** Make neighbours agree at a gate: the entry of segs[i + 1] copies the exit of segs[i]. */
function joinGates(segs: Segment[], i: number): void {
  const n = segs.length, a = segs[i]!, b = segs[(i + 1) % n]!;
  b.entry = { ...b.entry, half: a.exit.half };
}

function plain(s: Segment): boolean {
  return s.kind === "straight" || s.kind === "bendy" || s.kind === "kink" || s.kind === "esses" || s.kind === "chicaneA" || s.kind === "chicaneB";
}

/** Lay pinches and wide runs over a freshly built loop. A separate random stream, so nothing else about the track moves. */
export function applyWidths(segs: Segment[], seed: number): void {
  const n = segs.length;
  const rng = new Rng((seed ^ 0x57a1d7e3) >>> 0);
  const taken = new Set<number>();
  // keep clear of the start line, its pit lane and any crossing
  const ok = (i: number) => i >= 2 && i <= n - 3 && !taken.has(i) && segs[i]!.kind !== "cross" && segs[i - 1]!.kind !== "cross" && segs[(i + 1) % n]!.kind !== "cross";
  const fits = (idx: number[]) => idx.every((i) => clearanceFrom(segs, i) >= MIN_CLEAR);
  for (let i = 2; i <= n - 3; i++) {
    if (!ok(i)) continue;
    const r = rng.next();
    if (r < 0.14 && plain(segs[i]!)) {
      // a bottleneck
      const depth = ROAD_HALF - rng.pick([PINCH_MIN, 11, 13]);
      shape(segs[i]!, ROAD_HALF, ROAD_HALF, (t) => -depth * Math.sin(Math.PI * t) ** 4);
      segs[i]!.obstacles = [];
      taken.add(i);
    } else if (r < 0.14 + 0.16) {
      // an arena: one to three cells
      const len = 1 + rng.int(3);
      const idx = Array.from({ length: len }, (_, k) => i + k);
      if (idx.some((k) => !ok(k) || k > n - 3)) continue;
      const wanted = rng.pick([WIDE_MAX, 38, 32]);
      let done = false;
      for (const W of [wanted, 36, 30, 26]) {
        if (W > wanted) continue;
        const ramp = (k: number) => {
          const s = segs[idx[k]!]!;
          if (len === 1) shape(s, ROAD_HALF, ROAD_HALF, (t) => (W - ROAD_HALF) * Math.sin(Math.PI * t) ** 2);
          else shape(s, k === 0 ? ROAD_HALF : W, k === len - 1 ? ROAD_HALF : W, () => 0);
        };
        idx.forEach((_, k) => ramp(k));
        if (fits(idx)) { done = true; break; }
      }
      if (!done) { for (const k of idx) reset(segs[k]!); continue; }
      for (const k of idx) taken.add(k);
      i += len - 1;
    }
  }
  // neighbours agree at each gate
  for (let i = 0; i < n; i++) joinGates(segs, i);
  for (const s of segs) if (s.half && s.half.every((h) => h === ROAD_HALF)) delete s.half;
}

/** Squeeze one segment into a bottleneck whose half-width bottoms out at `min`, and clear its obstacles. */
export function pinchSegment(s: Segment, min: number): void {
  const depth = ROAD_HALF - min;
  shape(s, ROAD_HALF, ROAD_HALF, (t) => -depth * Math.sin(Math.PI * t) ** 4);
  s.obstacles = [];
}
