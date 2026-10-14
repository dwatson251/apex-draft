import { STATS, STAT_MAX, STAT_MIN, type CarConfig } from "./car.ts";
import type { Line } from "./line.ts";
import { normalizePhrase } from "./seed.ts";
import { COMPOUND_IDS, type Compound } from "./tyres.ts";
import type { Vec2 } from "./vec.ts";

/**
 * Everything needed to come back to the same track and the same drawing, and nothing about a race: no lap, no time,
 * no standings. Reloading a link always starts the race afresh.
 *
 * Binary layout (version 4), then base64url. Versions 1 to 3 links still open.
 *   u8 version (4)
 *   u8 flags: 1 obstacles, 2 realism, 4 race mode (else time trial), 8 in a game (else menu), 16 has points
 *   u8 laps (1 to 50)
 *   u8 rivals (1 to 31), u8 start tyre (0 soft, 1 medium, 2 wet)
 *   (versions 1 to 3 had rivals in the low nibble of one byte and the tyre in the high nibble: at most 7 rivals)
 *   u8 stops queued, then per stop: u8 lap, u8 tyre
 *   (version 2 also had a byte, after the tyre byte, for edit-every-N-laps: no longer a thing, and ignored.
 *    version 1 had a single byte of laps (low nibble) and rivals (high nibble) and none of the lines above)
 *   u16 car levels: accel, top, grip, brake, 4 bits each
 *   u8 length + utf-8: car name
 *   u8 length + utf-8: track phrase
 *   if has points: varint count of segments drawn, u16 start x, u16 start y (tenths of a unit), then per segment
 *     varint point count, and each point as zigzag varint deltas (tenths of a unit) from the point before it
 */
export interface ShareState {
  phrase: string;
  laps: number;
  mode: "trial" | "race";
  rivals: number;
  car: CarConfig;
  obstacles: boolean;
  realism: boolean;
  /** in a game rather than on the menu */
  playing: boolean;
  startTyre: Compound;
  /** pit stops queued before and during the race */
  pitPlan: { lap: number; tyre: Compound }[];
  /** the start point and the segments drawn so far (all of them when the lap is complete) */
  line?: Line;
}

export const SHARE_VERSION = 4;
/** A grid is at most 32 cars: you and 31 rivals. */
export const MAX_RIVALS = 31;
const Q = 10;

class Writer {
  bytes: number[] = [];
  u8(n: number) { this.bytes.push(n & 255); }
  u16(n: number) { this.u8(n); this.u8(n >> 8); }
  varint(n: number) { while (n >= 128) { this.bytes.push((n & 127) | 128); n = Math.floor(n / 128); } this.bytes.push(n); }
  zigzag(n: number) { this.varint(n < 0 ? -2 * n - 1 : 2 * n); }
  str(s: string) { const b = new TextEncoder().encode(s).slice(0, 60); this.u8(b.length); this.bytes.push(...b); }
}

class Reader {
  i = 0;
  constructor(readonly b: Uint8Array) {}
  u8(): number { if (this.i >= this.b.length) throw new Error("truncated"); return this.b[this.i++]!; }
  u16(): number { return this.u8() | (this.u8() << 8); }
  varint(): number { let n = 0, m = 1; for (;;) { const x = this.u8(); n += (x & 127) * m; if (x < 128) return n; m *= 128; if (m > 2 ** 35) throw new Error("bad number"); } }
  zigzag(): number { const n = this.varint(); return n % 2 ? -(n + 1) / 2 : n / 2; }
  str(): string { const n = this.u8(); if (this.i + n > this.b.length) throw new Error("truncated"); const s = new TextDecoder().decode(this.b.slice(this.i, this.i + n)); this.i += n; return s; }
}

const b64 = (bytes: number[]): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (t: string): Uint8Array => {
  const s = atob(t.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export function encodeShare(st: ShareState): string {
  const w = new Writer();
  w.u8(SHARE_VERSION);
  const hasLine = !!st.line && st.line.start !== undefined;
  w.u8((st.obstacles ? 1 : 0) | (st.realism ? 2 : 0) | (st.mode === "race" ? 4 : 0) | (st.playing ? 8 : 0) | (hasLine ? 16 : 0));
  w.u8(Math.min(50, Math.max(1, st.laps)));
  w.u8(Math.min(MAX_RIVALS, Math.max(1, st.rivals)));
  w.u8(Math.max(0, COMPOUND_IDS.indexOf(st.startTyre)));
  const plan = st.pitPlan.slice(0, 5);
  w.u8(plan.length);
  for (const p of plan) { w.u8(Math.min(255, Math.max(0, p.lap))); w.u8(Math.max(0, COMPOUND_IDS.indexOf(p.tyre))); }
  w.u16(STATS.reduce((acc, s, i) => acc | ((st.car[s] & 15) << (4 * i)), 0));
  w.str(st.car.name);
  w.str(normalizePhrase(st.phrase));
  if (hasLine) {
    const line = st.line!;
    w.varint(line.segs.length);
    let px = Math.round(line.start.x * Q), py = Math.round(line.start.y * Q);
    w.u16(px); w.u16(py);
    for (const seg of line.segs) {
      w.varint(seg.length);
      for (const p of seg) {
        const x = Math.round(p.x * Q), y = Math.round(p.y * Q);
        w.zigzag(x - px); w.zigzag(y - py);
        px = x; py = y;
      }
    }
  }
  return b64(w.bytes);
}

/** Returns the state, or a message saying why the link is no good. */
export function decodeShare(code: string): ShareState | string {
  try {
    const r = new Reader(unb64(code.replace(/^#/, "")));
    const version = r.u8();
    if (version < 1 || version > 4) return "this link was made by a different version";
    const flags = r.u8();
    let laps: number, rivals: number, startTyre: Compound = "medium";
    const pitPlan: { lap: number; tyre: Compound }[] = [];
    if (version === 1) { const ln = r.u8(); laps = ln & 15; rivals = ln >> 4; }
    else {
      laps = r.u8();
      if (version >= 4) { rivals = r.u8(); startTyre = COMPOUND_IDS[r.u8()] ?? "medium"; }
      else { const rt = r.u8(); rivals = rt & 15; startTyre = COMPOUND_IDS[rt >> 4] ?? "medium"; }
      if (version === 2) r.u8(); // edit-every-N-laps, which no longer exists
      for (let n = r.u8(), i = 0; i < n && i < 5; i++) { const lap = r.u8(), tyre = COMPOUND_IDS[r.u8()] ?? "medium"; pitPlan.push({ lap, tyre }); }
    }
    const levels = r.u16();
    const car: CarConfig = { name: "", accel: 0, top: 0, grip: 0, brake: 0 };
    STATS.forEach((s, i) => { car[s] = (levels >> (4 * i)) & 15; });
    if (STATS.some((s) => car[s] < STAT_MIN || car[s] > STAT_MAX)) return "the car in this link is not legal";
    car.name = r.str();
    const phrase = normalizePhrase(r.str());
    if (!phrase) return "the link has no track phrase";
    const st: ShareState = {
      phrase, laps: Math.min(50, Math.max(1, laps)), mode: flags & 4 ? "race" : "trial", rivals: Math.min(MAX_RIVALS, Math.max(1, rivals)),
      car, obstacles: !!(flags & 1), realism: !!(flags & 2), playing: !!(flags & 8),
      startTyre, pitPlan,
    };
    if (flags & 16) {
      const count = r.varint();
      if (count > 64) return "too many segments";
      let px = r.u16(), py = r.u16();
      const start: Vec2 = { x: px / Q, y: py / Q };
      const segs: Vec2[][] = [];
      for (let i = 0; i < count; i++) {
        const n = r.varint();
        if (n < 1 || n > 2000) return "a segment has the wrong number of points";
        const seg: Vec2[] = [];
        for (let k = 0; k < n; k++) { px += r.zigzag(); py += r.zigzag(); seg.push({ x: px / Q, y: py / Q }); }
        segs.push(seg);
      }
      st.line = { start, segs };
    }
    return st;
  } catch (e) {
    return `the link could not be read (${(e as Error).message})`;
  }
}
