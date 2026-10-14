import { CELL, ROAD_HALF, type Track } from "./track.ts";
import { tyreGrip, type Compound } from "./tyres.ts";

/** Each segment is cut into this many bins along it and across it. */
export const WET_LONG = 6;
export const WET_LAT = 8;
const PER = WET_LONG * WET_LAT;

const RAIN_RATE = 0.02;   // per second at full rain: a soaking in about a minute
const DRY_RATE = 0.0016;  // per second with no traffic: the better part of ten minutes
const PASS_DRY = 0.006;   // each car passing a bin takes this much off its wetness...
const USE_GAIN = 0.05;    // ...and this much onto its use
const USE_DECAY = 0.0004; // use fades slowly
const USE_WASH = 0.004;   // and rain washes it off

export interface WetBody { x: number; y: number }

/**
 * How wet each bit of the road is, and how much it has been driven. Every segment is cut into 6 x 8 bins. Rain wets
 * them; they dry slowly; and a bin that cars keep driving over dries much faster, so the line the field takes becomes
 * the dry line. In the wet that same worn line is polished and slippery (see `tyreGrip`).
 */
export class WetField {
  readonly wet: Float32Array;
  readonly use: Float32Array;
  readonly cells: number;

  constructor(private track: Track) {
    this.cells = track.segments.length * PER;
    this.wet = new Float32Array(this.cells);
    this.use = new Float32Array(this.cells);
  }

  /** Which bin a point on the road is in, or -1 off the road (the pit lane counts as dry). */
  cellAt(x: number, y: number): number {
    const si = this.track.cellIndex.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
    if (si === undefined) return -1;
    const seg = this.track.segments[si]!;
    let best = 0, bd = Infinity;
    for (let i = 0; i < seg.center.length; i++) {
      const c = seg.center[i]!, d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    const n = seg.normals[best]!, c = seg.center[best]!;
    const lat = (x - c.x) * n.x + (y - c.y) * n.y;
    if (Math.abs(lat) > ROAD_HALF + 2) return -1;
    const lo = Math.min(WET_LONG - 1, Math.floor((best * WET_LONG) / seg.center.length));
    const la = Math.min(WET_LAT - 1, Math.max(0, Math.floor(((lat + ROAD_HALF) / (2 * ROAD_HALF)) * WET_LAT)));
    return si * PER + lo * WET_LAT + la;
  }

  wetAt(x: number, y: number): number { const c = this.cellAt(x, y); return c < 0 ? 0 : this.wet[c]!; }
  useAt(x: number, y: number): number { const c = this.cellAt(x, y); return c < 0 ? 0 : this.use[c]!; }

  /** Grip a tyre has at this spot, relative to a standard tyre on dry tarmac. */
  gripAt(compound: Compound, x: number, y: number): number {
    const c = this.cellAt(x, y);
    return c < 0 ? tyreGrip(compound, 0, 0) : tyreGrip(compound, this.wet[c]!, this.use[c]!);
  }

  /** Move the weather on by `dt` seconds with this much rain, and these cars driving over the road. */
  update(dt: number, rain: number, bodies: WetBody[]): void {
    const dry = DRY_RATE * (rain > 0.05 ? 0.3 : 1);
    for (let i = 0; i < this.cells; i++) {
      let w = this.wet[i]! + rain * RAIN_RATE * dt;
      let u = this.use[i]!;
      w -= dry * (1 + 10 * u) * dt;
      u -= (USE_DECAY + rain * USE_WASH) * dt;
      this.wet[i] = w < 0 ? 0 : w > 1 ? 1 : w;
      this.use[i] = u < 0 ? 0 : u;
    }
    const seen = new Set<number>();
    for (const b of bodies) {
      const c = this.cellAt(b.x, b.y);
      if (c < 0) continue;
      this.use[c] = Math.min(1, this.use[c]! + USE_GAIN);
      this.wet[c] = Math.max(0, this.wet[c]! - PASS_DRY);
      seen.add(c);
    }
  }

  /** Mean wetness along a set of points, for a driver sizing up the road ahead. */
  meanWet(points: WetBody[]): number {
    let sum = 0, n = 0;
    for (const p of points) { const c = this.cellAt(p.x, p.y); if (c >= 0) { sum += this.wet[c]!; n++; } }
    return n ? sum / n : 0;
  }

  /** A copy of the state for replay: wetness then use, one byte each. */
  snapshot(): Uint8Array {
    const out = new Uint8Array(this.cells * 2);
    for (let i = 0; i < this.cells; i++) { out[i] = Math.round(this.wet[i]! * 255); out[this.cells + i] = Math.round(this.use[i]! * 255); }
    return out;
  }
}
