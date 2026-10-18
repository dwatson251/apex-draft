import type { VehicleId } from "./vehicles.ts";

/**
 * Gearboxes. A machine pulls along one smooth curve (`accelAt`), but on every change up the drive is gone for a moment while
 * the clutch is in (a manual), the next gear is knocked in (a sequential), or barely at all (a seamless shift). Changes down
 * happen under braking and cost nothing. Machines with no gearbox (an electric motor, a kart's centrifugal clutch, the boats
 * and the fans) have no entry and never lose drive.
 */
export type GearboxKind = "manual" | "sequential" | "seamless";
export interface Gearbox { kind: GearboxKind; gears: number }

/** How long the drive is gone on a change up, in seconds. */
export const SHIFT_CUT: Record<GearboxKind, number> = { manual: 0.2, sequential: 0.06, seamless: 0.015 };

export const GEARBOXES: Partial<Record<VehicleId, Gearbox>> = {
  // H-pattern manuals: the clutch goes in on every change
  classic: { kind: "manual", gears: 5 },
  muscle: { kind: "manual", gears: 4 },
  stock: { kind: "manual", gears: 4 },
  buggy: { kind: "manual", gears: 4 },
  truck: { kind: "manual", gears: 8 },
  tank: { kind: "manual", gears: 5 },
  // sequentials, dog boxes and paddles: a short cut while the next gear goes in
  rally: { kind: "sequential", gears: 6 },
  rallycross: { kind: "sequential", gears: 6 },
  touring: { kind: "sequential", gears: 6 },
  gt3: { kind: "sequential", gears: 6 },
  gt4: { kind: "sequential", gears: 6 },
  superbike: { kind: "sequential", gears: 6 },
  dragster: { kind: "sequential", gears: 2 },
  // seamless shifts: the next gear is in before the last one is out
  formula: { kind: "seamless", gears: 8 },
  prototype: { kind: "seamless", gears: 7 },
  hypercar: { kind: "seamless", gears: 7 },
};

/** The lower gears are shorter: gear g of n runs out at this share of top speed. */
const GEAR_SPREAD = 0.75;

/** The speeds (units/s) where a machine with top speed `vTop` changes up: one fewer than its gears. */
export function shiftSpeeds(type: VehicleId | undefined, vTop: number): number[] {
  const box = type ? GEARBOXES[type] : undefined;
  if (!box) return [];
  const out: number[] = [];
  for (let g = 1; g < box.gears; g++) out.push(vTop * (g / box.gears) ** GEAR_SPREAD);
  return out;
}

/** A change down waits until the speed is this share below the change-up point, so a car holding a speed near one does not hunt between gears. */
export const DOWNSHIFT_SLACK = 0.9;

/**
 * The gear (0-based) a machine is in at speed `v`, from the gear it was in: up as soon as the speed passes a change-up point,
 * down only once it is well below it. (The change-up points are those of shiftSpeeds, worked out directly so a tick allocates nothing.)
 */
export function nextGear(box: Gearbox, vTop: number, v: number, gear: number): number {
  const at = (x: number) => Math.min(box.gears - 1, Math.floor(box.gears * Math.max(0, x / vTop) ** (1 / GEAR_SPREAD) + 1e-9));
  const up = at(v);
  if (up > gear) return up;
  const down = at(v / DOWNSHIFT_SLACK);
  return down < gear ? down : gear;
}

/** How long the drive goes on a change up for this machine, in seconds (0 for none). */
export const shiftCut = (type: VehicleId | undefined): number => {
  const box = type ? GEARBOXES[type] : undefined;
  return box ? SHIFT_CUT[box.kind] : 0;
};
