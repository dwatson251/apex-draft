import type { DensePoint } from "./line.ts";
import {
  PIT_BOX_A, PIT_ENTRY_A, PIT_EXIT_A, PIT_LANE_TO, PIT_LIMIT_A, PIT_LAT, along, across, laneIn, laneOut, pitPoint, type Pit,
} from "./pit.ts";
import type { Track } from "./track.ts";

export interface PitLap {
  dense: DensePoint[];
  /** per point: inside the speed-limited part of the lane */
  lane: boolean[];
  /** index of the stopping box, when this lap pits */
  boxIdx: number;
}

/**
 * Swap parts of a lap for the pit lane. `pitIn` replaces the end of the lap (the road before the start line) with the
 * way into the lane, ending in the lane at the line; `pitOut` replaces the start of the lap with the way back out.
 * A lap that pits is followed by one that starts in the lane, so the joins match.
 */
export function applyPit(track: Track, dense: DensePoint[], pitIn: boolean, pitOut: boolean): PitLap {
  const pit: Pit = track.pit;
  const last = track.segments.length - 1;
  const lane = new Array<boolean>(dense.length).fill(false);
  if (!pitIn && !pitOut) return { dense, lane, boxIdx: -1 };

  let iOut = 0;
  while (iOut < dense.length && dense[iOut]!.seg === 0 && along(pit, dense[iOut]!.p) <= PIT_EXIT_A) iOut++;
  let iIn = dense.length;
  while (iIn > iOut && dense[iIn - 1]!.seg === last && along(pit, dense[iIn - 1]!.p) >= PIT_ENTRY_A) iIn--;

  const out: DensePoint[] = [];
  const flags: boolean[] = [];
  if (pitOut) {
    const to = across(pit, dense[Math.min(iOut, dense.length - 1)]!.p);
    for (let a = 0; a <= PIT_EXIT_A; a += 1) {
      out.push({ p: pitPoint(pit, a, laneOut(a, to)), seg: 0 });
      flags.push(a <= PIT_LIMIT_A);
    }
  } else for (let i = 0; i < iOut; i++) { out.push(dense[i]!); flags.push(false); }
  for (let i = iOut; i < iIn; i++) { out.push(dense[i]!); flags.push(false); }
  let boxIdx = -1;
  if (pitIn) {
    const first = dense[Math.min(iIn, dense.length - 1)]!;
    const aFrom = Math.min(along(pit, first.p), PIT_ENTRY_A + 1), from = across(pit, first.p);
    for (let a = aFrom; a < 0; a += 1) {
      if (boxIdx < 0 && a >= PIT_BOX_A) boxIdx = out.length;
      out.push({ p: pitPoint(pit, a, laneIn(a, aFrom, from)), seg: last });
      flags.push(a >= -PIT_LIMIT_A);
    }
    out.push({ p: pitPoint(pit, 0, PIT_LAT), seg: last });
    flags.push(true);
  } else for (let i = iIn; i < dense.length; i++) { out.push(dense[i]!); flags.push(false); }
  void PIT_LANE_TO;
  return { dense: out, lane: flags, boxIdx };
}
