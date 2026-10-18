import { G } from "./scale.ts";
import { vehicleOf, type VehicleId } from "./vehicles.ts";

/**
 * The stat formulas below were written when 1 g was 87.77 units/s²; accelerations are scaled to the real g of the current scale.
 * PACE then lifts accel, grip and braking together by what lap times need: with the spec-sheet figures a bot on a clean line laps
 * about 17% slower than the real pole laps of the real circuits (see docs/DESIGN.md, "Lap-time calibration"), because real cars
 * carry more speed than their static figures (aero, banking, kerbs, a better line). It is one factor for every vehicle.
 */
export const PACE = 1.46;
const ACC = (G / 87.77) * PACE;

export type Stat = "accel" | "top" | "grip" | "brake";
export const STATS: readonly Stat[] = ["accel", "top", "grip", "brake"];
export const STAT_MIN = 1;
export const STAT_MAX = 10;
/** Total levels a car may spend across its four stats. */
export const CAR_BUDGET = 24;

export interface CarConfig {
  name: string;
  accel: number;
  top: number;
  grip: number;
  brake: number;
  /** what it is: set from the track's seed. Plain stats mean a rally car. */
  type?: VehicleId;
}

export const defaultCar = (): CarConfig => ({ name: "Standard", accel: 6, top: 6, grip: 6, brake: 6 });

export function carCost(c: CarConfig): number { return c.accel + c.top + c.grip + c.brake; }

/** Returns an error message, or null when the config is legal. */
export function validateCar(c: CarConfig): string | null {
  for (const s of STATS) {
    const v = c[s];
    if (!Number.isInteger(v) || v < STAT_MIN || v > STAT_MAX) return `${s} must be a whole number from ${STAT_MIN} to ${STAT_MAX}`;
  }
  if (carCost(c) > CAR_BUDGET) return `uses ${carCost(c)} points, the budget is ${CAR_BUDGET}`;
  return null;
}

export interface CarStats {
  /** Forward acceleration, units/s². */
  accel: number;
  /** Top speed, units/s. */
  vTop: number;
  /** Lateral acceleration limit in corners, units/s². */
  aLat: number;
  /** Braking deceleration, units/s². */
  brake: number;
}

export function carStats(c: CarConfig): CarStats {
  const v = vehicleOf(c.type);
  return { accel: (30 + 6 * c.accel) * v.accel * ACC, vTop: (70 + 8 * c.top) * v.top, aLat: (40 + 10 * c.grip) * v.grip * ACC, brake: (60 + 10 * c.brake) * v.brake * ACC };
}

/**
 * Acceleration at speed `v` for a machine with launch acceleration `accel` and top speed `vTop`. Up to `share` of top speed the tyres are the limit and the
 * car puts down all of `accel`; above it the engine's power is (it pushes with less force the faster it goes) and the air pushes back harder, so the pull
 * fades toward top speed, as a real car's does. The curve is a power-limited push less drag, `P / v - D v²`, fitted to meet `accel` where traction gives
 * out and to stop gaining a little above `vTop` (`DRAG_HEADROOM`), so the cap at `vTop` is reached in a finite time. A machine with more downforce has
 * the power to match its drag (see `tractionShare`).
 */
export function accelAt(accel: number, vTop: number, v: number, share = TRACTION_SHARE): number {
  const vEnd = vTop * DRAG_HEADROOM, v1 = share * vEnd;
  if (v <= v1) return accel;
  const d = accel / (vEnd ** 3 / v1 - v1 * v1);
  return Math.max(0, (d * vEnd ** 3) / v - d * v * v);
}
export const TRACTION_SHARE = 0.42;
export const DRAG_HEADROOM = 1.04;
/** Where a machine's pull starts to fade. (The cars with the most downforce also have the most power to push their wings through the air, so it is the same for all.) */
export const tractionShare = (_downforce = 0): number => TRACTION_SHARE;
/** A tyre has one grip to share between turning and braking or accelerating (the friction circle). Working at the limit sideways it still has this much left for the rest. */
export const COMBINED_FLOOR = 0.5;
/** The share of its braking or acceleration a tyre has left when it is using `lat` (0 to 1) of its grip to turn. */
export const combined = (lat: number): number => Math.max(COMBINED_FLOOR, Math.sqrt(Math.max(0, 1 - lat * lat)));
