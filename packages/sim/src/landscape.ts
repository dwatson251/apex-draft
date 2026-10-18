import { Rng } from "./rng.ts";
import { nearbySegments, type Segment, type SegmentKind, type Track } from "./track.ts";
import { CIRCUIT_RELIEF } from "./circuitRelief.ts";
import { METRES_PER_UNIT } from "./scale.ts";

/**
 * What the ground is like beyond its shape: hills, patches of rough surface, banked corners and tunnels. Added to a finished
 * track by a pass of its own, on a random stream of its own, so the layout (and every other draw) of a phrase stays as it was.
 * Everything is optional on a segment and a missing field means a flat, ordinary tarmac road in the open. The hidden circuits are left alone, apart from
 * what is known of the real ground (`CIRCUIT_RELIEF`, heights read off a map, and `CIRCUIT_FEATURES`, the banked turns and tunnels); the Mario Kart courses are not touched.
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
/** A crest (or dip) on a straight, as at Eau Rouge: the chance a track has them, and how high or deep one is (units). A `fun-` track has more. */
export const CREST_CHANCE = 0.3, FUN_CREST_CHANCE = 0.65, CREST_HEIGHT = 4;
export const NIGHT_CHANCE = 1 / 6;

/** Whether a track is run in the dark: from its seed only, so every player sees the same. The sim itself does not care; it is for the look and the sound. */
export const isNight = (seed: number): boolean => new Rng((seed ^ NIGHT_SALT) >>> 0).chance(NIGHT_CHANCE);

const FLAT_KINDS: readonly SegmentKind[] = ["straight", "bendy"];
const CORNER_KINDS: readonly SegmentKind[] = ["corner", "sharp", "sweeper", "uturn"];
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Height (world units) at each of a segment's centre points, easing from `h0` at its entry to `h1` at its exit. */
const ease = (n: number, h0: number, h1: number): number[] => Array.from({ length: n }, (_, i) => h0 + (h1 - h0) * smoothstep(i / (n - 1)));

/**
 * How much of a circuit's real climb the game keeps. The road is not the real width or the real surface, and a car that slows a quarter on a
 * hill the real car hardly noticed makes a bad race: three fifths of the height gives Eau Rouge a real push without making the Nordschleife a mountain pass.
 */
export const RELIEF_SCALE = 0.6;

/** Banked turns and tunnels of the real circuits, as the part of the lap (0 at the start line, 1 back at it) they cover. Approximate: read off the laps, not surveyed. */
export const CIRCUIT_FEATURES: Record<string, { banks?: { from: number; to: number; bank: number }[]; tunnels?: { from: number; to: number }[] }> = {
  // the tri-oval and its banking at each end of the start straight
  daytona: { banks: [{ from: 0, to: 0.1, bank: 1.25 }, { from: 0.9, to: 1, bank: 1.25 }] },
  // Hugenholtzbocht (turn 3) and the last turn, Arie Luyendykbocht, both banked
  zandvoort: { banks: [{ from: 0.05, to: 0.12, bank: 1.2 }, { from: 0.92, to: 1, bank: 1.2 }] },
  // the tunnel under the Fairmont, between the Portier and the chicane
  monaco: { tunnels: [{ from: 0.5, to: 0.58 }] },
};

/** Heights of a circuit from its real ground, banked turns and tunnels. */
function circuitLandscape(t: Track): Track {
  const id = t.circuit!.id, segs = t.segments, n = segs.length;
  const relief = CIRCUIT_RELIEF[id];
  if (relief && relief.length > 3 && Math.max(...relief) > 3) {
    const m = relief.length, k = RELIEF_SCALE / METRES_PER_UNIT;
    const gate = (j: number): number => { const f = ((j % n) / n) * m, i = Math.floor(f), u = f - i; return (relief[i % m]! * (1 - u) + relief[(i + 1) % m]! * u) * k; };
    for (let j = 0; j < n; j++) segs[j]!.elev = ease(segs[j]!.center.length, gate(j), gate(j + 1)).map((h) => Math.round(h * 100) / 100);
  }
  const f = CIRCUIT_FEATURES[id];
  if (f) {
    const within = (j: number, r: { from: number; to: number }): boolean => (j + 0.5) / n >= r.from && (j + 0.5) / n < r.to;
    for (let j = 0; j < n; j++) {
      const s = segs[j]!;
      for (const b of f.banks ?? []) if (within(j, b) && (CORNER_KINDS.includes(s.kind) || s.kind === "kink")) s.bank = b.bank;
      for (const r of f.tunnels ?? []) if (within(j, r)) s.tunnel = true;
    }
  }
  return t;
}

/** Add hills, surfaces, banking and tunnels to a finished track, in place. */
export function landscape(t: Track): Track {
  if (t.circuit && t.circuit.id !== "oval") return circuitLandscape(t); // (a Mario Kart course has no entry in either table, so it comes back as it was)
  const segs = t.segments;
  const n = segs.length;
  const r = new Rng((t.seed ^ LANDSCAPE_SALT) >>> 0);
  // every draw is made whether or not it is used, so what one feature does never changes another
  const hills = r.chance(HILL_CHANCE), amp = 3 + 4 * r.next(), ph1 = r.next() * 2 * Math.PI, ph2 = r.next() * 2 * Math.PI, mix = 0.3 + 0.4 * r.next();
  const surfaced = r.chance(SURFACE_CHANCE), surfAt = r.int(n), surfLen = 1 + r.int(2), surfPick = r.next();
  const banked = r.chance(BANK_CHANCE), bank = 1.15 + 0.1 * r.next();
  const bankPick = segs.map(() => r.chance(0.5));
  const tunnelled = r.chance(TUNNEL_CHANCE), tunAt = r.int(n), tunLen = 1 + r.int(2);
  // (drawn last, so every draw above is what it was before crests existed)
  const crested = r.chance(t.fun ? FUN_CREST_CHANCE : CREST_CHANCE), crestAt = [r.int(n), r.int(n), r.int(n)], crestSign = [r.chance(0.5) ? 1 : -1, r.chance(0.5) ? 1 : -1, r.chance(0.5) ? 1 : -1], crestH = [r.next(), r.next(), r.next()];

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
    // a wide sweeper is always banked, and a banked tight corner is a matter of chance
    segs.forEach((s, j) => { if ((bankPick[j] || s.kind === "sweeper") && CORNER_KINDS.includes(s.kind) && !nearStart(j)) s.bank = Math.round(bank * 100) / 100; });
  }
  // crests and dips: a straight that rises and falls within its length (the height is zero at both gates, so it joins the road either side). One on an ordinary track, up to three on a fun one
  if (crested && !t.free && t.biome !== "water") { // (a fun track with crossings or shortcuts can have them too: the height is zero at the gates, so every road that meets there agrees)
    const count = t.fun ? 3 : 1, done = new Set<number>();
    for (let c = 0; c < count; c++) {
      for (let k = 0; k < n; k++) {
        const j = (crestAt[c]! + k) % n, s = segs[j]!;
        if (done.has(j) || nearStart(j) || !(FLAT_KINDS.includes(s.kind) || s.kind === "kink" || s.kind === "sweepS") || s.tunnel || s.surface) continue;
        const h = crestSign[c]! * CREST_HEIGHT * (0.6 + 0.8 * crestH[c]!), m = s.center.length;
        const bump = Array.from({ length: m }, (_, i) => h * Math.sin((Math.PI * i) / (m - 1)) ** 2);
        s.elev = (s.elev ?? bump.map(() => 0)).map((e, i) => Math.round((e + bump[i]!) * 100) / 100);
        done.add(j);
        break;
      }
    }
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
