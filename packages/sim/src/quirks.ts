import type { VehicleId } from "./vehicles.ts";

/**
 * What sets a machine apart beyond its four stats. Every field is optional and a missing one means none of it, so a machine
 * with no entry drives exactly as it always has.
 */
export interface Quirks {
  /** aerodynamic grip: extra cornering force of `downforce * v²` (units are per world unit of corner radius), so it only matters fast */
  downforce?: number;
  /** a leaning machine corners harder, by this share of its tyre grip (but see `rough`: a lean needs a good road) */
  lean?: number;
  /** weight transfer: braking into a bend that is already at the limit costs up to this share of the braking */
  shift?: number;
  /** 0 to 1: how much of a rough surface's (gravel, dirt, cobbles) penalty it ignores, on top of the vehicle's own `terrain` */
  rough?: number;
}

export const QUIRKS: Partial<Record<VehicleId, Quirks>> = {
  formula: { downforce: 0.0022, shift: 0.05 },
  prototype: { downforce: 0.0022 },
  hypercar: { downforce: 0.002, shift: 0.05 },
  stock: { downforce: 0.0004, shift: 0.2, rough: 0.1 },
  gt3: { downforce: 0.0014, shift: 0.08 },
  gt4: { downforce: 0.0006, shift: 0.1 },
  touring: { downforce: 0.0003, shift: 0.12 },
  electric: { downforce: 0.0004, shift: 0.2 },
  superbike: { lean: 0.06, shift: 0.05 },
  muscle: { shift: 0.25, rough: 0.1 },
  truck: { shift: 0.3, rough: 0.5 },
  tank: { shift: 0.15, rough: 0.9 },
  dragster: { shift: 0.3 },
  rally: { rough: 0.5, shift: 0.1 },
  rallycross: { rough: 0.6, shift: 0.1, downforce: 0.0002 },
  classic: { shift: 0.12 },
  buggy: { rough: 0.8 },
  kart: { rough: 0.1 },
};

const NONE: Quirks = {};
export const quirksOf = (type: VehicleId | undefined): Quirks => QUIRKS[type ?? "rally"] ?? NONE;

/** The cornering force a machine can hold at speed `v`, given the tyre grip `aLat` already worked out: the tyres plus whatever the wings add. */
export const cornerCap = (type: VehicleId | undefined, aLat: number, v: number): number => {
  const q = quirksOf(type);
  return aLat * (1 + (q.lean ?? 0)) + (q.downforce ?? 0) * v * v;
};
