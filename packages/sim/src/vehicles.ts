import { Rng } from "./rng.ts";

export type VehicleId = "kart" | "formula" | "rally" | "muscle" | "truck" | "tank";

/** What kind of machine this is. Multipliers apply on top of the car's four stat levels. */
export interface Vehicle {
  id: VehicleId;
  name: string;
  /** plural, for "Race day: tanks" */
  plural: string;
  blurb: string;
  accel: number;
  top: number;
  grip: number;
  brake: number;
  /** tyre (or track) wear per lap */
  wear: number;
  /** fuel use per lap */
  fuel: number;
  /** drawn size, units */
  length: number;
  width: number;
  /** engine sound: pitch multiplier and how buzzy it is, 0 to 1 */
  pitch: number;
  buzz: number;
  /** relative odds when a phrase picks the field */
  weight: number;
}

export const VEHICLES: Record<VehicleId, Vehicle> = {
  kart: { id: "kart", name: "Go-kart", plural: "go-karts", blurb: "Tiny, sticky and slow in a straight line. Sips fuel, barely wears its tyres.", accel: 1.15, top: 0.72, grip: 1.3, brake: 1, wear: 0.6, fuel: 0.55, length: 6.5, width: 4.2, pitch: 1.5, buzz: 0.9, weight: 20 },
  formula: { id: "formula", name: "Formula car", plural: "formula cars", blurb: "Huge grip, huge brakes, huge top speed. Eats tyres and fuel.", accel: 1.25, top: 1.3, grip: 1.35, brake: 1.25, wear: 1.6, fuel: 1.2, length: 10, width: 4.6, pitch: 2, buzz: 0.6, weight: 15 },
  rally: { id: "rally", name: "Rally car", plural: "rally cars", blurb: "A good all-rounder with nothing to apologise for.", accel: 1, top: 1, grip: 1, brake: 1, wear: 1, fuel: 1, length: 8.6, width: 5.2, pitch: 1, buzz: 0.4, weight: 20 },
  muscle: { id: "muscle", name: "Muscle car", plural: "muscle cars", blurb: "Fast in a line, loose in the corners, and thirsty.", accel: 1.1, top: 1.12, grip: 0.8, brake: 0.85, wear: 1.2, fuel: 1.3, length: 9.6, width: 5.6, pitch: 0.7, buzz: 0.3, weight: 15 },
  truck: { id: "truck", name: "Truck", plural: "trucks", blurb: "Slow to get going and slow to stop, but it keeps going.", accel: 0.7, top: 0.88, grip: 0.72, brake: 0.7, wear: 0.8, fuel: 1.4, length: 9.6, width: 6.2, pitch: 0.55, buzz: 0.2, weight: 15 },
  tank: { id: "tank", name: "Tank", plural: "tanks", blurb: "Crawls. Barely wears its tracks. Drinks fuel.", accel: 0.55, top: 0.55, grip: 0.6, brake: 0.85, wear: 0.1, fuel: 1.5, length: 9.6, width: 7, pitch: 0.4, buzz: 0.1, weight: 15 },
};

export const VEHICLE_IDS = Object.keys(VEHICLES) as VehicleId[];
export const vehicleOf = (type: VehicleId | undefined): Vehicle => VEHICLES[type ?? "rally"] ?? VEHICLES.rally;
export const isVehicleId = (x: unknown): x is VehicleId => typeof x === "string" && x in VEHICLES;

/** The machines for a track's race day. The same seed always gives the same answer. */
export function vehicleForSeed(seed: number): VehicleId {
  const rng = new Rng((seed ^ 0x7e41c1e5) >>> 0);
  rng.next();
  const total = VEHICLE_IDS.reduce((a, id) => a + VEHICLES[id].weight, 0);
  let r = rng.next() * total;
  for (const id of VEHICLE_IDS) { r -= VEHICLES[id].weight; if (r < 0) return id; }
  return "rally";
}
