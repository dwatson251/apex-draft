import { Rng } from "./rng.ts";
import { nearbySegments, type Segment, type SegmentKind, type Track } from "./track.ts";

/**
 * What the ground is like beyond its shape: hills, patches of rough surface, banked corners and tunnels. Added to a finished
 * track by a pass of its own, on a random stream of its own, so the layout (and every other draw) of a phrase stays as it was.
 * Everything is optional on a segment and a missing field means a flat, ordinary tarmac road in the open. The hidden circuits are left alone.
 */

export type Surface = "gravel" | "dirt" | "cobbles";
export interface SurfaceInfo {
  name: string;
  /** what the surface does to grip, braking and acceleration before the machine's `terrain` and `rough` take their share back */
  grip: number;
  brake: number;
  accel: number;
  /** colour of the strip when drawn */
  color: number;
}

export const SURFACES: Record<Surface, SurfaceInfo> = {
  gravel: { name: "Gravel", grip: 0.8, brake: 0.78, accel: 0.88, color: 0x8d8b84 },
  dirt: { name: "Dirt", grip: 0.86, brake: 0.84, accel: 0.93, color: 0x9a7b55 },
  cobbles: { name: "Cobbles", grip: 0.92, brake: 0.95, accel: 0.97, color: 0x77716c },
};

/** How hard the hills push on a car: the grade (height gained per unit driven) scales acceleration, braking and top speed. */
export const GRADE_ACCEL = 4;
export const GRADE_BRAKE = 4;
export const GRADE_TOP = 1.2;

const LANDSCAPE_SALT = 0x1a2d5c07;
const NIGHT_SALT = 0x6e1c4a7d;
export const HILL_CHANCE = 0.45;
export const SURFACE_CHANCE = 0.18;
export const BANK_CHANCE = 0.2;
export const TUNNEL_CHANCE = 0.25;
export const NIGHT_CHANCE = 1 / 6;

/** Whether a track is run in the dark: from its seed only, so every player sees the same. The sim itself does not care; it is for the look and the sound. */
export const isNight = (seed: number): boolean => new Rng((seed ^ NIGHT_SALT) >>> 0).chance(NIGHT_CHANCE);

const FLAT_KINDS: readonly SegmentKind[] = ["straight", "bendy"];
const CORNER_KINDS: readonly SegmentKind[] = ["corner", "sharp", "sweeper", "uturn"];
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Height (world units) at each of a segment's centre points, easing from `h0` at its entry to `h1` at its exit. */
const ease = (n: number, h0: number, h1: number): number[] => Array.from({ length: n }, (_, i) => h0 + (h1 - h0) * smoothstep(i / (n - 1)));

/** Add hills, surfaces, banking and tunnels to a finished track, in place. */
export function landscape(t: Track): Track {
  if (t.circuit && t.circuit.id !== "oval") return t;
  const segs = t.segments;
  const n = segs.length;
  const r = new Rng((t.seed ^ LANDSCAPE_SALT) >>> 0);
  // every draw is made whether or not it is used, so what one feature does never changes another
  const hills = r.chance(HILL_CHANCE), amp = 3 + 4 * r.next(), ph1 = r.next() * 2 * Math.PI, ph2 = r.next() * 2 * Math.PI, mix = 0.3 + 0.4 * r.next();
  const surfaced = r.chance(SURFACE_CHANCE), surfAt = r.int(n), surfLen = 1 + r.int(2), surfPick = r.next();
  const banked = r.chance(BANK_CHANCE), bank = 1.15 + 0.1 * r.next();
  const bankPick = segs.map(() => r.chance(0.5));
  const tunnelled = r.chance(TUNNEL_CHANCE), tunAt = r.int(n), tunLen = 1 + r.int(2);

  const special = (s: Segment) => s.kind === "cross" || s.kind === "bridge" || s.kind === "under" || s.kind === "fork" || s.kind === "merge";
  const simple = t.branches.length === 0 && !segs.some(special) && !t.free;

  if (t.circuit?.id === "oval") {
    // the oval is two banked turns
    for (const s of segs) if (CORNER_KINDS.includes(s.kind)) s.bank = 1.22;
    return t;
  }

  // hills: heights at the gates are a mix of the ring's two lowest waves, so the loop closes, and the road eases between them
  if (hills && simple && t.biome !== "water") {
    const gate = (j: number) => amp * ((1 - mix) * Math.sin((2 * Math.PI * j) / n + ph1) + mix * Math.sin((4 * Math.PI * j) / n + ph2));
    for (let j = 0; j < n; j++) segs[j]!.elev = ease(segs[j]!.center.length, gate(j), gate((j + 1) % n)).map((h) => Math.round(h * 100) / 100);
  }

  // the pit lane runs beside the start line: the two segments each side of it stay plain
  const nearStart = (j: number) => j <= 1 || j >= n - 2;
  const runOf = (at: number, len: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < len; k++) {
      const j = (at + k) % n;
      if (nearStart(j) || !FLAT_KINDS.includes(segs[j]!.kind)) break;
      out.push(j);
    }
    return out;
  };
  let used: number[] = [];
  if (surfaced && simple) {
    const choices: Surface[] = t.biome === "city" ? ["cobbles"] : t.biome === "grass" || t.biome === "desert" ? ["dirt", "gravel"] : t.biome === "moon" ? ["dirt"] : [];
    if (choices.length) {
      used = runOf(surfAt, surfLen);
      const sf = choices[Math.floor(surfPick * choices.length)]!;
      for (const j of used) segs[j]!.surface = sf;
    }
  }
  if (tunnelled && simple && t.biome !== "water" && t.biome !== "snow") {
    for (const j of runOf(tunAt, tunLen)) if (!used.includes(j)) segs[j]!.tunnel = true;
  }
  if (banked && simple && t.biome !== "water") {
    segs.forEach((s, j) => { if (bankPick[j] && CORNER_KINDS.includes(s.kind) && !nearStart(j)) s.bank = Math.round(bank * 100) / 100; });
  }
  return t;
}

/** The rough surface under a point, if the point is on a segment that has one. */
export function surfaceAt(t: Track, x: number, y: number): Surface | undefined {
  let best: Segment | undefined, bd = Infinity;
  for (const s of nearbySegments(t, { x, y })) {
    for (const c of s.center) { const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
  }
  return best && bd < 60 * 60 ? best.surface : undefined;
}
