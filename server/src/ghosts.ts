export interface Timed { time: number }

/**
 * Pick `limit` entries that put a player mid-pack: about half just faster than `target`, half just slower, nearest first on each side.
 * If one side runs short the other fills in. Without a target the median time is used. Pure, so it can be tested without a database.
 */
export function pickAround<T extends Timed>(entries: T[], target: number | null, limit: number): T[] {
  const n = Math.max(0, Math.floor(limit));
  if (!n || !entries.length) return [];
  const sorted = [...entries].sort((a, b) => a.time - b.time);
  const t = target !== null && Number.isFinite(target) ? target : sorted[Math.floor((sorted.length - 1) / 2)]!.time;
  const below = sorted.filter((e) => e.time < t).reverse(); // nearest first
  const above = sorted.filter((e) => e.time >= t);
  const want = Math.min(n, sorted.length);
  let nb = Math.min(below.length, Math.floor(n / 2));
  let na = Math.min(above.length, n - Math.floor(n / 2));
  // top up from whichever side has more left
  while (nb + na < want) {
    if (above.length - na > 0 && (below.length - nb === 0 || na <= nb)) na++;
    else if (below.length - nb > 0) nb++;
    else break;
  }
  return [...below.slice(0, nb).reverse(), ...above.slice(0, na)];
}
