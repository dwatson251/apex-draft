import { G } from "./scale.ts";
import { vehicleOf, type VehicleId } from "./vehicles.ts";

/**
 * The stat formulas below were written when 1 g was 87.77 units/s²; accelerations are scaled to the real g of the current scale.
 * PACE then lifts accel, grip and braking together by what lap times need: with the spec-sheet figures a bot on a clean line laps
 * about 17% slower than the real pole laps of the real circuits (see docs/DESIGN.md, "Lap-time calibration"), because real cars
 * carry more speed than their static figures (aero, banking, kerbs, a better line). It is one factor for every vehicle.
 */
export const PACE = 1.35;
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
