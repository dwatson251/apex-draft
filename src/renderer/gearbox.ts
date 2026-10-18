/** A gearbox for the engine sound. It watches speed and throttle and says what the revs are doing; it has no audio in it.
 *
 *  `hi[g]` is the speed (as a fraction of the car's top speed) at which gear g+1 hits the redline. The last entry is
 *  1, so the top gear runs out of revs exactly at top speed. Revs in a gear are speed / hi, from idle up to 1. */
export class Gearbox {
  gear = 1;
  private since = -10;

  constructor(
    private readonly hi: readonly number[],
    private readonly idle: number,
    /** least time between shifts, seconds */
    private readonly gap: number,
    /** revs at which to change up */
    private readonly up = 0.97,
    /** revs below which to change down when cruising */
    private readonly down = 0.42,
  ) {}

  get count(): number { return this.hi.length; }

  /** x is speed / top speed (0 to about 1), lift is throttle (+1) to braking (-0.6), now is in seconds.
   *  Returns revs (0 idle-ish to 1 redline) and which way we shifted this call: +1 up, -1 down, 0 none. */
  step(x: number, lift: number, now: number): { rev: number; shift: number } {
    const n = this.hi.length, at = (g: number) => this.hi[g - 1]!;
    let shift = 0, rev = x / at(this.gear);
    const lost = rev > 1.08 || rev < 0.25; // far out of range, e.g. after a jump in time: do not wait
    if (now - this.since >= this.gap || lost) {
      if (this.gear < n && rev >= this.up && lift > -0.2) { this.gear++; shift = 1; }
      else if (this.gear > 1) {
        const lower = x / at(this.gear - 1), braking = lift < -0.15, hard = lift > 0.6;
        if (rev < this.down || ((braking || hard) && lower < 0.92 && rev < (hard ? 0.6 : 0.8))) { this.gear--; shift = -1; }
      }
    }
    if (shift) this.since = now;
    rev = Math.max(this.idle + 0.12 * Math.max(0, lift), x / at(this.gear));
    return { rev: Math.min(rev, 1.04), shift };
  }
}

/** Gear ratios: speed at redline in each gear, as a fraction of top speed.
 *  First gear tops out near the slowest speeds cars hold on track (about a third of top speed; below that is the standing
 *  start), and the last gear ends at exactly 1, so every gear is used on the way to top speed. Steps are wide in the low
 *  gears and close at the top, as in a real box. */
export interface GearSet {
  hi: number[];
  idle: number;
  gap: number;
  up?: number;
  down?: number;
}

export const GEARS: Record<string, GearSet> = {
  // a two-speed kart: a short first gear, then one long run up the revs
  kart: { hi: [0.6, 1], idle: 0.28, gap: 0.2 },
  // 8 tall gears, held right up to the limiter before each quick shift
  formula: { hi: [0.4, 0.47, 0.55, 0.64, 0.74, 0.84, 0.93, 1], idle: 0.3, gap: 0.12, up: 0.99, down: 0.5 },
  // a 1960s five-speed Hewland: tall, well-spaced gears, a slow shift
  classic: { hi: [0.38, 0.52, 0.67, 0.83, 1], idle: 0.28, gap: 0.3 },
  // rallycross: a short sequential six, flat-shifted
  rallycross: { hi: [0.3, 0.42, 0.55, 0.69, 0.84, 1], idle: 0.3, gap: 0.15, up: 0.98 },
  // 6-speed manual
  rally: { hi: [0.36, 0.47, 0.59, 0.73, 0.88, 1], idle: 0.25, gap: 0.3 },
  // a classic 4-speed: big steps, big drops in revs
  muscle: { hi: [0.34, 0.53, 0.77, 1], idle: 0.2, gap: 0.4 },
  // a lorry gearbox: lots of close gears, revs that never get very high
  truck: { hi: [0.32, 0.39, 0.48, 0.58, 0.68, 0.8, 0.91, 1], idle: 0.26, gap: 0.5, up: 0.95 },
  // an automatic with four ranges, slow and heavy
  tank: { hi: [0.5, 0.66, 0.85, 1], idle: 0.22, gap: 0.8 },
  // 6 close gears, revved right out
  superbike: { hi: [0.3, 0.46, 0.62, 0.77, 0.9, 1], idle: 0.3, gap: 0.08, up: 0.99, down: 0.5 },
  // 3 gears, relaxed
  buggy: { hi: [0.42, 0.72, 1], idle: 0.25, gap: 0.16 },
  // a single-speed motor: revs (the whine) simply follow speed
  electric: { hi: [1], idle: 0.12, gap: 1 },
  // 3 long gears, the first one a drag-strip launch
  dragster: { hi: [0.45, 0.75, 1], idle: 0.3, gap: 0.12, up: 0.98 },
  // sequential 6-speed with a flat-shift: quick changes
  touring: { hi: [0.38, 0.5, 0.62, 0.75, 0.88, 1], idle: 0.26, gap: 0.1, up: 0.97, down: 0.5 },
  // 6-speed sequential, revved out
  prototype: { hi: [0.37, 0.49, 0.62, 0.75, 0.88, 1], idle: 0.28, gap: 0.08, up: 0.98, down: 0.5 },
  // 7-speed sequential, quick and revved out
  hypercar: { hi: [0.35, 0.45, 0.56, 0.67, 0.78, 0.89, 1], idle: 0.27, gap: 0.07, up: 0.98, down: 0.5 },
  // a 4-speed H-pattern or sequential box, long gears and a slow shift
  stock: { hi: [0.38, 0.58, 0.78, 1], idle: 0.24, gap: 0.22, up: 0.96 },
  // 6-speed sequential paddle shift
  gt3: { hi: [0.36, 0.48, 0.61, 0.74, 0.87, 1], idle: 0.25, gap: 0.12, up: 0.97, down: 0.5 },
  // 6-speed sequential, slower shifts
  gt4: { hi: [0.35, 0.47, 0.6, 0.73, 0.87, 1], idle: 0.24, gap: 0.2, up: 0.95 },
  jetski: { hi: [1], idle: 0.3, gap: 1 },
  speedboat: { hi: [0.5, 0.78, 1], idle: 0.22, gap: 0.2 },
  hovercraft: { hi: [1], idle: 0.35, gap: 1 },
  airboat: { hi: [1], idle: 0.3, gap: 1 },
};
