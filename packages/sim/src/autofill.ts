import { botLine, chooseRoute } from "./bots.ts";
import { idAt, isComplete, makeLine, smooth, validateLine, type Line } from "./line.ts";
import { isDrivable, type Track } from "./track.ts";
import type { Vec2 } from "./vec.ts";

/** Segments of a lap (finished or not) where the smoothed line leaves the road or touches an obstacle. */
export function badSegments(track: Track, line: Line): number[] {
  if (isComplete(track, line)) return validateLine(track, line).badSegs;
  const pts: Vec2[] = [line.start];
  const tag: number[] = [0];
  line.segs.forEach((s, i) => s.forEach((p) => { pts.push(p); tag.push(idAt(line, i)); }));
  const bad = new Set<number>();
  for (const d of smooth(pts, false, (end) => tag[Math.min(end, tag.length - 1)]!)) if (!isDrivable(track, d.p)) bad.add(d.seg);
  return [...bad].sort((a, b) => a - b);
}

/**
 * Finish a lap for the player. Segments already drawn are kept when they are sound; the ones still to draw, and any drawn
 * segment that leaves the road, come from a clean racing line. Where a replacement changes a join, the neighbours of a
 * segment that no longer works are replaced too, until the whole lap is valid (at worst it is the racing line throughout).
 */
export function completeLine(track: Track, partial: Line | null, seed = 99): Line {
  // the route is whatever the player has drawn so far, then the quickest way on
  const prefix = partial ? partial.segs.map((_, k) => idAt(partial, k)) : [];
  const route = chooseRoute(track, seed, 0.95, prefix);
  const guide = botLine(track, seed, 0.95, { route });
  if (!partial || !partial.segs.length) return guide;
  const n = route.length;
  const start = partial.start;
  const replace = new Set<number>();
  for (let i = partial.segs.length; i < n; i++) replace.add(i);
  for (const i of badSegments(track, partial)) replace.add(i);
  for (let pass = 0; pass <= n; pass++) {
    const segs = Array.from({ length: n }, (_, i) => (replace.has(i) || !partial.segs[i]?.length ? guide.segs[i]! : partial.segs[i]!));
    // the last segment must end back on the start, and a replaced segment follows the join the line already has
    const last = segs[n - 1]!;
    const line: Line = makeLine(start, [...segs.slice(0, n - 1), [...last.slice(0, -1), start]], route);
    const bad = validateLine(track, line).badSegs;
    if (!bad.length) return line;
    for (const i of bad) { replace.add(i); replace.add((i + 1) % n); replace.add((i + n - 1) % n); }
    if (replace.size >= n) break;
  }
  return guide;
}
