/** How many rows the race standings show. */
export const STANDINGS_ROWS = 5;

/**
 * Which positions (0-based, in order) the standings list shows for a field of `n` with the player in position `me`: the leader, last
 * place, the car just ahead of the player, the player, and the car just behind. In the first or last place, or next to either, some of
 * those are the same row, so the list is filled up to STANDINGS_ROWS with the cars nearest the player (then nearest the ends), and so
 * always has that many rows when the field is that big.
 */
export function standingsRows(n: number, me: number): number[] {
  if (n <= STANDINGS_ROWS) return Array.from({ length: n }, (_, i) => i);
  const picked = new Set<number>([0, n - 1, me, me - 1, me + 1].filter((i) => i >= 0 && i < n));
  // fill the rest from the player outward (ahead before behind), so a leader sees the next cars back and a tail-ender the ones in front
  for (let d = 2; picked.size < STANDINGS_ROWS && d < n; d++) {
    for (const i of [me - d, me + d]) if (picked.size < STANDINGS_ROWS && i >= 0 && i < n) picked.add(i);
  }
  return [...picked].sort((a, b) => a - b);
}

/** Ticks between updates of the split times (half a second of sim time): they are read, not watched. */
export const SPLIT_EVERY = 30;

/** Smallest index in 0..hi whose value is at least `v` (the values only ever go up), or hi when none is. */
function firstAtLeast(arr: ArrayLike<number>, v: number, hi: number): number {
  let lo = 0, top = hi;
  while (lo < top) { const mid = (lo + top) >> 1; if (arr[mid]! >= v) top = mid; else lo = mid + 1; }
  return lo;
}

/** Progress counts a lap as 1e5; this is how far apart two progress values really are, in units of track: whole laps are LAP apart, not 1e5. */
function trackGap(raw: number, lapLength: number): number {
  return raw - Math.round(raw / 1e5) * (1e5 - lapLength);
}

/**
 * How many whole laps the other car is ahead of the player (negative: behind), counting only real laps: a car just across the start line
 * while the player is just short of it is a few yards ahead, not a lap. 0 when they are within a lap of each other.
 */
export function lapsApart(me: ArrayLike<number>, other: ArrayLike<number>, k: number, lapLength: number): number {
  const pm = me[k], po = other[k];
  if (pm === undefined || po === undefined) return 0;
  return Math.trunc(trackGap(po - pm, lapLength) / lapLength) || 0;
}

/**
 * How many sim seconds the other car is ahead of the player at tick `k` (negative: behind), as a time and not a distance: how long ago the
 * car in front was where the player is now, or how long ago the player was where the car behind is. `prog` is each car's progress at
 * every tick (whole laps first, then the way round). Null when the other car is a lap or more away, or there is no data yet.
 */
export function splitSeconds(me: ArrayLike<number>, other: ArrayLike<number>, k: number, lapLength: number): number | null {
  const pm = me[k], po = other[k];
  if (pm === undefined || po === undefined) return null;
  if (lapsApart(me, other, k, lapLength) !== 0) return null;
  if (po >= pm) return (k - firstAtLeast(other, pm, k)) / 60;
  return -(k - firstAtLeast(me, po, k)) / 60;
}
