import { Rng } from "./rng.ts";
import { isRamp, type Fx, type FxType } from "./fx.ts";
import type { BiomeId } from "./biomes.ts";
import type { Segment, Track } from "./track.ts";

/**
 * The new pieces on a track: where ramps, speed pads and patches of ice, sand, mud and water may go (`checkFx`, which a circuit's data must pass), and the
 * pass that lays some of them on a `fun-` track (`funPieces`). Neither touches the geometry, so every saved line, share link and ghost of a `fun-` phrase still fits.
 */

/** A segment whose road is (nearly) straight: where a ramp may start, and the road a car comes down on. */
const flat = (s: Segment): boolean => s.kind === "straight" || s.kind === "kink" || s.kind === "sweepS";
const crossing = (s: Segment): boolean => s.kind === "cross" || s.kind === "bridge" || s.kind === "under" || s.kind === "fork" || s.kind === "merge";

/** Straight road a ramp needs after its lip, in units: a jump flies about this far at the top speed of an ordinary class, a glide about half as far again. */
export const LANDING_UNITS = 110;
export const GLIDE_LANDING_UNITS = 170;
/** Segments checked after a ramp for stones in the way (a glide lands further out). */
export const LANDING_SEGMENTS = 2;

const segLen = (s: Segment): number => {
  let len = 0;
  for (let i = 1; i < s.center.length; i++) len += Math.hypot(s.center[i]!.x - s.center[i - 1]!.x, s.center[i]!.y - s.center[i - 1]!.y);
  return len;
};

/** How much straight road lies after a ramp that ends `t1` of the way along segment `i`: what is left of its own segment, and the flat segments that follow it. */
export function landingRoom(segments: Segment[], i: number, t1: number): number {
  const n = segments.length;
  let room = (1 - t1) * segLen(segments[i]!);
  for (let k = 1; k < n; k++) {
    const o = segments[(i + k) % n]!;
    if (!flat(o) || crossing(o) || o.index === 0 || o.index === n - 1) break;
    room += segLen(o);
    if (room > GLIDE_LANDING_UNITS * 2) break;
  }
  return room;
}

/** Why a track's ramps will not do, if they will not: the ramp's segment is bent or crossed, the road after it is not straight for long enough, the pit lane is under it, or something stands in the way. */
export function checkFx(t: Track): string[] {
  const problems: string[] = [];
  const n = t.segments.length;
  for (const s of t.segments) {
    for (const fx of s.fx ?? []) {
      if (fx.t0 < 0 || fx.t1 > 1 || fx.t1 <= fx.t0) problems.push(`segment ${s.index}: ${fx.type} spans ${fx.t0}..${fx.t1}`);
      if (!isRamp(fx.type)) continue;
      const need = fx.type === "glide" ? GLIDE_LANDING_UNITS : LANDING_UNITS;
      if (!flat(s)) problems.push(`segment ${s.index}: a ${fx.type} on a ${s.kind}`);
      if (s.index < 2 || s.index > n - 3) problems.push(`segment ${s.index}: a ${fx.type} beside the pit straight`);
      const room = landingRoom(t.segments, s.index, fx.t1);
      if (room < need) problems.push(`segment ${s.index}: only ${Math.round(room)} units of straight road after the ${fx.type} (needs ${need})`);
      if (s.obstacles.length) problems.push(`segment ${s.index}: an obstacle on the ${fx.type}`);
      for (let k = 1; k <= LANDING_SEGMENTS + (fx.type === "glide" ? 1 : 0); k++) if (t.segments[(s.index + k) % n]!.obstacles.length) problems.push(`segment ${(s.index + k) % n}: an obstacle where a ${fx.type} lands`);
    }
  }
  return problems;
}

/** The odds of each piece on a `fun-` track. */
export const FUN_PIECES = { jumps: [0, 1, 1, 2, 3], boosts: [0, 1, 1, 2], glide: 0.2, patch: 0.65 } as const;

/** The patch of ground a biome gets on a fun track, if any. */
const PATCH: Partial<Record<BiomeId, FxType[]>> = { snow: ["ice"], desert: ["sand"], grass: ["mud", "water"], city: ["water"], moon: ["sand"], alpine: ["mud", "water"], coast: ["sand", "water"], jungle: ["mud", "water"], volcano: ["sand"] };

const FUN_SALT = 0x6b61727d;

/**
 * Lay ramps, speed pads and a patch of ground on a `fun-` track, from a random stream of its own (the layout was drawn from the phrase's, and stays as it was).
 * One piece to a segment, none by the pit straight, none beside a junction, a bridge or a shortcut, and a ramp only where the road after it is straight (`checkFx`).
 */
export function funPieces(t: Track): void {
  const rng = new Rng((t.seed ^ FUN_SALT) >>> 0);
  const n = t.segments.length;
  const forked = new Set<number>();
  for (const b of t.branches) { forked.add(b.fork); forked.add(b.rejoin); }
  const near = (i: number, k: number): Segment => t.segments[(i + k + n) % n]!;
  const ok = (i: number): boolean => {
    const s = t.segments[i]!;
    if (s.fx || s.powerup || !flat(s) || i < 2 || i > n - 3) return false;
    for (const k of [-1, 0, 1]) { const o = near(i, k); if (crossing(o) || forked.has(o.index)) return false; }
    return true;
  };
  const rampOk = (i: number, glide: boolean): boolean => {
    if (!ok(i) || landingRoom(t.segments, i, 0.5) < (glide ? GLIDE_LANDING_UNITS : LANDING_UNITS)) return false;
    for (let k = 1; k <= LANDING_SEGMENTS + (glide ? 1 : 0); k++) {
      const o = near(i, k);
      if (crossing(o) || forked.has(o.index) || o.fx || o.powerup) return false;
    }
    return true;
  };
  const put = (i: number, fx: Fx): void => {
    const s = t.segments[i]!;
    s.fx = [fx];
    // nothing stands where a car takes off or comes down
    s.obstacles = [];
    if (isRamp(fx.type)) for (let k = 1; k <= LANDING_SEGMENTS + (fx.type === "glide" ? 1 : 0); k++) near(i, k).obstacles = [];
  };
  // every draw is made whether or not it can be used, so what one piece does never moves another
  const jumps = rng.pick(FUN_PIECES.jumps), boosts = rng.pick(FUN_PIECES.boosts);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const glideAt = rng.next(), patchAt = rng.next(), patchPick = rng.next();
  let placed = 0;
  for (const i of order) {
    if (placed >= jumps) break;
    const glide = glideAt < FUN_PIECES.glide && placed === 0;
    if (!rampOk(i, glide)) continue;
    // the ramp ends at the middle of its segment, so there is road behind it to build speed on
    put(i, { t0: 0.35, t1: 0.5, type: glide ? "glide" : "jump" });
    placed++;
  }
  let pads = 0;
  for (const i of order) {
    if (pads >= boosts) break;
    if (!ok(i)) continue;
    put(i, { t0: 0.3, t1: 0.7, type: "boost" });
    pads++;
  }
  const kinds = PATCH[t.biome];
  if (kinds && patchAt < FUN_PIECES.patch) {
    const type = kinds[Math.floor(patchPick * kinds.length)]!;
    for (const i of order) if (ok(i)) { put(i, { t0: 0.1, t1: 0.9, type }); break; }
  }
}
