import { describe, expect, it } from "vitest";
import { ROAD_HALF, isDrivable, VEHICLES, PACE, Race, botLine, carStats, defaultCar, generateTrack, trackLength, type VehicleId } from "@apex/sim";
import { SEGMENT_LENGTH } from "../packages/sim/src/freetrack.ts";
import { METRES_PER_UNIT, SEGMENT_MILES, WORLD_TIME } from "../src/renderer/scale.ts";

const mph = (unitsPerSimSecond: number) => (unitsPerSimSecond * METRES_PER_UNIT) / WORLD_TIME * 2.23694;
const g = (unitsPerSimSecond2: number) => (unitsPerSimSecond2 * METRES_PER_UNIT) / (WORLD_TIME * WORLD_TIME) / 9.81;

describe("real-world scale", () => {
  it("a segment (100 units, a straight piece or a piece of a real circuit) is about 110 m", () => {
    expect(SEGMENT_LENGTH).toBe(100);
    expect(SEGMENT_LENGTH * METRES_PER_UNIT).toBeGreaterThan(100); expect(SEGMENT_LENGTH * METRES_PER_UNIT).toBeLessThan(120);
    expect(SEGMENT_MILES).toBeCloseTo((SEGMENT_LENGTH * METRES_PER_UNIT) / 1609.344, 9);
  });

  it("a unit is the same length on every real circuit: the game's laps measure within 15% of the real lengths", () => {
    for (const [id, km] of [["silverstone", 5.89], ["monza", 5.79], ["daytona", 5.73], ["donington-park-gp", 4.02], ["donington-park", 3.17], ["laguna-seca", 3.6], ["willow-springs", 4.0]] as const) {
      const got = (trackLength(generateTrack(id)) * METRES_PER_UNIT) / 1000;
      expect(got / km, id).toBeGreaterThan(0.85); expect(got / km, id).toBeLessThan(1.15);
    }
  });

  // real pole / record laps (seconds) on the real circuits, one per class: a level-10 car on a clean line must land within 10%
  it("laps the real circuits in about the real time", () => {
    const cases: [string, VehicleId, number][] = [["silverstone", "formula", 84.3], ["donington-park-gp", "touring", 93.15], ["daytona", "prototype", 92.7], ["donington-park-gp", "gt3", 84.5], ["willow-springs", "gt4", 83.0]];
    for (const [id, veh, real] of cases) {
      const t = generateTrack(id);
      const car = { name: veh, accel: 10, top: 10, grip: 10, brake: 10, type: veh };
      const r = new Race(t, [{ id: "a", name: "a", car, lines: [botLine(t, 1, 1)], isPlayer: true }], 2, { realism: false });
      r.runToEnd();
      const lap = Math.min(...r.results()[0]!.lapTimes) * WORLD_TIME;
      expect(lap / real, `${id} ${veh}`).toBeGreaterThan(0.9); expect(lap / real, `${id} ${veh}`).toBeLessThan(1.1);
    }
  }, 60000);

  // level 10 is the real machine: top speed (mph) exactly, and launch, peak lateral and braking g lifted by PACE (and a small per-class
  // calibration of at most about 10%) because lap times need it (see DESIGN.md)
  const REAL: Record<VehicleId, [number, number, number, number]> = {
    kart: [80, 0.9, 1.6, 1.0], formula: [230, 1.05, 4.0, 4.0], rally: [125, 0.8, 1.2, 1.3], muscle: [180, 0.75, 1.0, 1.05],
    truck: [110, 0.7, 0.8, 0.9], tank: [45, 0.13, 0.4, 0.5], superbike: [186, 1.05, 1.5, 1.3], buggy: [110, 0.7, 0.9, 0.9],
    electric: [190, 1.4, 1.2, 1.3], dragster: [335, 4.0, 0.6, 1.0], jetski: [67, 0.75, 0.8, 0.4], speedboat: [120, 0.55, 0.5, 0.3],
    hovercraft: [70, 0.7, 0.25, 0.2], airboat: [70, 0.45, 0.3, 0.2],
    touring: [160, 0.7, 1.5, 1.5], prototype: [205, 1.1, 3.0, 3.0], gt3: [190, 0.85, 1.9, 1.9], gt4: [155, 0.65, 1.4, 1.4], hypercar: [225, 1.15, 3.3, 3.3], stock: [190, 0.8, 1.6, 1.7],
  };
  it("a level-10 stat is the real machine's top speed, acceleration, lateral grip and braking", () => {
    for (const id of Object.keys(VEHICLES) as VehicleId[]) {
      const s = carStats({ name: id, accel: 10, top: 10, grip: 10, brake: 10, type: id });
      const [top, acc, lat, brk] = REAL[id];
      expect(mph(s.vTop) / top, `${id} top`).toBeCloseTo(1, 1);
      for (const [what, got, want] of [["accel", g(s.accel), acc], ["grip", g(s.aLat), lat], ["brake", g(s.brake), brk]] as const) {
        expect(got / want / PACE, `${id} ${what}`).toBeGreaterThan(0.9); expect(got / want / PACE, `${id} ${what}`).toBeLessThan(1.15);
      }
    }
  });

  it("every vehicle has a plausible peak slip angle, widest on the water", () => {
    for (const id of Object.keys(VEHICLES) as VehicleId[]) {
      const v = VEHICLES[id];
      expect(v.slipDeg, id).toBeGreaterThan(0); expect(v.slipDeg, id).toBeLessThanOrEqual(45);
    }
    expect(VEHICLES.hovercraft.slipDeg).toBeGreaterThan(VEHICLES.formula.slipDeg * 5);
  });

  it("every vehicle takes at least three real seconds to reach top speed, so the gears are distinct", () => {
    for (const id of Object.keys(VEHICLES) as VehicleId[]) {
      const s = carStats({ ...defaultCar(), type: id });
      expect((s.vTop / s.accel) * WORLD_TIME, id).toBeGreaterThan(3);
    }
  });

  it("a line may run over the kerb: the centre can reach the road edge (two wheels on the track), and no further", () => {
    const t = generateTrack("brave-owl-rides-melons");
    const seg = t.segments[0]!;
    const c = seg.center[12]!, n = seg.normals[12]!;
    const at = (d: number) => ({ x: c.x + n.x * d, y: c.y + n.y * d });
    expect(isDrivable(t, at(ROAD_HALF - 1))).toBe(true);   // wheels on the kerb, the car still on the track
    expect(isDrivable(t, at(ROAD_HALF + 2))).toBe(false);  // the whole car off the road
  });
});
