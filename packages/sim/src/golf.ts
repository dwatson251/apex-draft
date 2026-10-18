import { botLine } from "./bots.ts";
import type { CarConfig } from "./car.ts";
import { dailyPhrase } from "./daily.ts";
import { idAt, validateLine, type Line } from "./line.ts";
import type { Vec2 } from "./vec.ts";
import { buildProfile } from "./profile.ts";
import type { SegmentKind, Track } from "./track.ts";

/**
 * Line Golf: draw a lap that beats a target flying lap with as few points as you can. The points are the ones the player places inside segments (the
 * join at the end of each is the course, not a stroke). Par and the target come from a reference line (`golfReference`): the best computer line thinned
 * to the fewest points that keep it on the road, so par is a line that can be drawn and the target one that a sparse line can make. The target is in
 * the player's own car, so a better car does not make it easier. All of it is worked out from the line, not from a race, so it is the same every time.
 */

/** How many points a segment of this shape starts with in the reference line (more are added where it would leave the road). */
const PAR: Record<SegmentKind, number> = {
  straight: 0, cross: 0, bridge: 0, under: 0, fork: 1, merge: 1, kink: 1, bendy: 1, corner: 1, sharp: 1, sweeper: 1,
  chicaneA: 1, chicaneB: 1, esses: 2, sweepS: 2, uturn: 2,
};

/** The target is this much slower than the reference line. */
export const GOLF_SLACK = 1.02;

/** The points the player placed: every waypoint of every segment but the last one of each (that is where the segment ends). */
export function linePoints(line: Line): number {
  return line.segs.reduce((a, s) => a + Math.max(0, s.length - 1), 0);
}

/**
 * The reference line: the best computer line with only a few of its points kept in each segment (by its shape: none on a straight, one in a bend, two
 * in an S or a hairpin), and one more at a time in any segment where that leaves the road. Kept per track: it takes a few validations to make.
 */
export function golfReference(track: Track): Line {
  const hit = REF.get(track);
  if (hit) return hit;
  const bl = botLine(track, 5, 1);
  const counts = bl.segs.map((_, k) => PAR[track.allSegments[idAt(bl, k)]!.kind]);
  const pick = (k: number): Vec2[] => {
    const s = bl.segs[k]!, inner = s.slice(0, -1), p = Math.min(counts[k]!, inner.length);
    return [...Array.from({ length: p }, (_, i) => inner[Math.floor(((i + 0.5) / p) * inner.length)]!), s.at(-1)!];
  };
  let line: Line = { ...bl, segs: bl.segs.map((_, k) => pick(k)) };
  for (let round = 0; round < 60; round++) {
    const bad = validateLine(track, line).badSegs;
    if (!bad.length) break;
    for (const id of bad) { const k = bl.segs.findIndex((_, j) => idAt(bl, j) === id); if (k >= 0) counts[k]!++; }
    line = { ...line, segs: bl.segs.map((_, k) => pick(k)) };
  }
  if (!validateLine(track, line).ok) line = bl; // (never seen: the full line is always a fallback)
  REF.set(track, line);
  return line;
}
const REF = new WeakMap<Track, Line>();

/** Par: the points of the reference line. */
export function golfPar(track: Track): number {
  return Math.max(1, linePoints(golfReference(track)));
}

/** The flying lap to beat, sim seconds: the reference line in this car, and a little slack. */
export function golfTarget(track: Track, car: CarConfig): number {
  return buildProfile(track, golfReference(track), car).ideal * GOLF_SLACK;
}

/** Stars for a line: none if it misses the target, one for making it, two within half as many points again as par, three at par or under. */
export function golfStars(points: number, par: number, made: boolean): number {
  if (!made) return 0;
  return points <= par ? 3 : points <= Math.ceil(par * 1.5) ? 2 : 1;
}

/** The day's course: a phrase of its own, not the Daily's. */
export const golfPhrase = (dateKey: string): string => dailyPhrase(`golf:${dateKey}`);
