import { add, dot, mul, sub, v2, type Vec2 } from "./vec.ts";
import { WORLD_TIME } from "./scale.ts";
import { vehicleOf, type VehicleId } from "./vehicles.ts";

/** The pit lane runs alongside the two straights either side of the start line. Distances are along the road from
 *  the start line (negative = before it) and across it, toward the pit side. */
export const PIT_LAT = 36;
export const PIT_HALF = 6;
/** where the cars leave the road, drive at the lane speed, stop, and rejoin */
export const PIT_ENTRY_A = -60;
export const PIT_LANE_FROM = -32;
export const PIT_LANE_TO = 32;
export const PIT_EXIT_A = 60;
export const PIT_BOX_A = -3;
/** Every car that pulls in gets its own bay: the first in is nearest the line, the next one sits this far behind it, and so on. */
export const PIT_BAY_GAP = 11;
export const PIT_BAYS = 4;

/**
 * The first lap (0-based) on which a car would run dry, if it has `fuel` at the start of lap `next`, uses `perLap` a lap, and refuels to `tank` at the end
 * of each lap in `stops`; null if it gets home. `fuel` is what the car will have when it sets off: after a stop in the pits, a full tank (the stop it
 * is in the middle of refuels it, so it is not the tank it came in with), not what was left when it pulled in.
 */
export function firstDryLap(perLap: number, laps: number, next: number, fuel: number, stops: readonly number[], tank: number): number | null {
  let left = fuel;
  for (let lap = next; lap < laps; lap++) {
    if (left < perLap * 1.03) return lap;
    left -= perLap;
    if (stops.includes(lap)) left = tank;
  }
  return null;
}
/** speed limit between a = -38 and a = +38, units/s */
export const PIT_SPEED = 40;
export const PIT_LIMIT_A = 38;
/** Sim seconds stopped in the box for tyres and fuel, for a vehicle class: its real service time (`pitSecs`, in shown seconds) on the sim's clock. */
export const pitStopTime = (type?: VehicleId): number => vehicleOf(type).pitSecs / WORLD_TIME;
/** The standard car's stop, sim seconds. */
export const PIT_STOP_TIME = pitStopTime("rally");
/** Time added to a finish if the car never pitted (with tyres and fuel on): two stops' worth. */
export const pitPenalty = (type?: VehicleId): number => 2 * pitStopTime(type);
export const PIT_PENALTY = pitPenalty("rally");

export interface Pit {
  /** the start line, middle of the road */
  origin: Vec2;
  /** direction of travel over the line */
  dir: Vec2;
  /** unit vector across the road toward the pit lane */
  n: Vec2;
  side: 1 | -1;
}

export function makePit(origin: Vec2, dir: Vec2, gateNormal: Vec2, side: 1 | -1): Pit {
  return { origin, dir, n: mul(gateNormal, side), side };
}

export const along = (pit: Pit, p: Vec2): number => dot(sub(p, pit.origin), pit.dir);
export const across = (pit: Pit, p: Vec2): number => dot(sub(p, pit.origin), pit.n);

export function pitPoint(pit: Pit, a: number, lat: number): Vec2 {
  return add(add(pit.origin, mul(pit.dir, a)), mul(pit.n, lat));
}

const smooth01 = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };

/** Lateral position of the pit lane's middle at `a`, as a blend from where the car was (`from`) into the lane. */
export function laneIn(a: number, aFrom: number, from: number): number {
  return from + (PIT_LAT - from) * smooth01((a - aFrom) / (PIT_LANE_FROM - aFrom));
}
/** ...and back out to `to` by the end of the exit ramp. */
export function laneOut(a: number, to: number): number {
  return PIT_LAT + (to - PIT_LAT) * smooth01((a - PIT_LANE_TO) / (PIT_EXIT_A - PIT_LANE_TO));
}

/** Centre of the lane for drawing, 0 where it has merged into the road. */
export function laneCentre(a: number): number {
  return a < PIT_LANE_FROM ? laneIn(a, PIT_ENTRY_A, 0) : a <= PIT_LANE_TO ? PIT_LAT : laneOut(a, 0);
}

export const pitBox = (pit: Pit): Vec2 => pitPoint(pit, PIT_BOX_A, PIT_LAT);
export { v2 };
