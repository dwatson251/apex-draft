/** mulberry32: the whole state is one u32, so it serialises into saved state. */
export class Rng {
  constructor(public state: number) { this.state = state >>> 0; }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [0, n). */
  int(n: number): number { return Math.floor(this.next() * n); }
  range(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)] as T; }
}

/** FNV-1a over a string, to a u32. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
