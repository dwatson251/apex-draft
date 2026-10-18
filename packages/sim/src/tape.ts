/**
 * A growing record of one number per tick (or a few), in a typed array. A race keeps a dozen of these per car for playback, and as plain arrays of
 * doubles they cost about 130 bytes a car a tick: a 50-lap race at Spa with 32 cars would hold well over a gigabyte. In typed arrays of the width each
 * value needs it is about a third of that.
 */
type Typed = Float32Array | Float64Array | Int8Array | Uint8Array;

export class Tape<T extends Typed> {
  private buf: T;
  private n = 0;
  private view: T;
  private viewN = 0;

  constructor(private readonly make: (n: number) => T, capacity = 4096) {
    this.buf = make(capacity);
    this.view = make(0);
  }

  get length(): number { return this.n; }

  push(a: number): void {
    if (this.n === this.buf.length) this.grow(1);
    this.buf[this.n++] = a;
  }

  push3(a: number, b: number, c: number): void {
    if (this.n + 3 > this.buf.length) this.grow(3);
    this.buf[this.n++] = a; this.buf[this.n++] = b; this.buf[this.n++] = c;
  }

  /** What has been recorded so far: a view of the store (no copy), good until the next push. */
  values(): T {
    if (this.viewN !== this.n) { this.view = this.buf.subarray(0, this.n) as T; this.viewN = this.n; }
    return this.view;
  }

  private grow(need: number): void {
    const next = this.make(Math.max(this.n + need, Math.ceil(this.buf.length * 1.5)));
    next.set(this.buf.subarray(0, this.n));
    this.buf = next;
    this.viewN = -1;
  }
}

export const f32 = (n: number): Float32Array => new Float32Array(n);
export const f64 = (n: number): Float64Array => new Float64Array(n);
export const i8 = (n: number): Int8Array => new Int8Array(n);
export const u8 = (n: number): Uint8Array => new Uint8Array(n);
