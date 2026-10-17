/**
 * Pieces that sit on part of a segment: ramps, speed pads and patches of ice, sand, mud and water. Everything is optional on a segment and a
 * missing `fx` means the road is as it always was. Positions are fractions (0 to 1) of the segment's length.
 */
export type FxType = "jump" | "glide" | "boost" | "ice" | "sand" | "mud" | "water";

export interface Fx {
  t0: number;
  t1: number;
  type: FxType;
  /** boost: how much extra top speed and acceleration (1 = BOOST_FX); glide: how much longer the flight is than a jump's (1 = GLIDE_AIR) */
  power?: number;
}

export interface FxInfo {
  name: string;
  /** grip, top speed and acceleration of the road under the span, relative to tarmac, before the machine's own `terrain` takes some back */
  grip: number;
  top: number;
  accel: number;
  brake: number;
  /** colour of the span when drawn */
  color: number;
}

/** The ground-like pieces (a ramp or a pad does not change the road under it). */
export const FX_GROUND: Partial<Record<FxType, FxInfo>> = {
  ice: { name: "Ice", grip: 0.45, top: 1, accel: 0.8, brake: 0.5, color: 0xcfe9f5 },
  sand: { name: "Sand", grip: 0.7, top: 0.8, accel: 0.85, brake: 0.75, color: 0xd9c48b },
  mud: { name: "Mud", grip: 0.6, top: 0.7, accel: 0.8, brake: 0.7, color: 0x5a4330 },
  water: { name: "Shallow water", grip: 0.8, top: 0.85, accel: 0.9, brake: 0.8, color: 0x4a86b8 },
};

/** A speed pad: top speed and acceleration, a little like a boost power-up but short. */
export const BOOST_FX_TOP = 1.2;
export const BOOST_FX_ACCEL = 1.5;

/** A car must be going at least this fraction of its top speed to leave the ground at a ramp; slower, it rides over as a bump. */
export const JUMP_MIN_V = 0.45;
/** Flight time, ticks (60 a second): AIR_BASE + AIR_K · v / vTop, clamped to AIR_MIN..AIR_MAX. A glide ramp multiplies it by GLIDE_AIR · power. */
export const AIR_BASE = 18;
export const AIR_K = 30;
export const AIR_MIN = 12;
export const AIR_MAX = 70;
export const GLIDE_AIR = 2;
/** Speed lost to the air per tick, as a fraction of the speed. */
export const AIR_DRAG = 0.002;
/** Speed lost on landing, as a fraction, for the longest flight (less for a shorter one). */
export const LAND_LOSS = 0.06;
/** The straight road a jump needs after it, in seconds at top speed: the author-time check on a course (see checkFx in track.ts). */
export const LANDING_SECS = AIR_MAX / 60;

export const isRamp = (t: FxType): boolean => t === "jump" || t === "glide";

/** Flight time in ticks for a car taking a ramp at speed v. */
export function airTicks(type: FxType, v: number, vTop: number, power = 1): number {
  const base = Math.min(AIR_MAX, Math.max(AIR_MIN, AIR_BASE + (AIR_K * v) / Math.max(vTop, 1)));
  return Math.round(type === "glide" ? base * GLIDE_AIR * power : base);
}
