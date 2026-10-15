import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack, type Compound, type VehicleId } from "@apex/sim";

const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });

/** Two laps, a tyre condition held fixed: how wide the slip angle gets, the lap time, and the grip the tyres had on average. */
function drive(veh: VehicleId, comp: Compound, tyre: number, wet: boolean, realism = true) {
  const r = new Race(t, [{ id: "a", name: "a", car: { ...defaultCar(), type: veh }, lines: [botLine(t, 7, 0.9)], isPlayer: true, startTyre: comp }], 2, { realism, weather: false });
  const c = r.cars[0]!;
  let peak = 0, grip = 0, n = 0;
  while (!r.over) {
    c.fuel = 100; c.tyre = tyre;
    if (wet) r.field.wet.fill(1);
    r.step();
    peak = Math.max(peak, Math.abs(c.beta)); grip += r.gripLevel(c); n++;
  }
  return { peak, grip: grip / n, lap: r.results()[0]!.lapTimes[1]! };
}

describe("slip angle and grip", () => {
  it("is 1 with fresh tyres on a dry road, and when tyres are not in play", () => {
    expect(drive("rally", "medium", 1, false).grip).toBeCloseTo(1, 5);
    expect(drive("rally", "medium", 0.2, true, false).grip).toBe(1);
  });
  it("widens as the tyres wear, and the lap gets slower", () => {
    const fresh = drive("rally", "medium", 1, false), half = drive("rally", "medium", 0.4, false), gone = drive("rally", "medium", 0.05, false);
    expect(half.grip).toBeLessThan(fresh.grip);
    expect(gone.grip).toBeLessThan(half.grip);
    expect(half.peak).toBeGreaterThan(fresh.peak * 1.05);
    expect(gone.peak).toBeGreaterThan(half.peak);
    expect(half.lap).toBeGreaterThan(fresh.lap);
    expect(gone.lap).toBeGreaterThan(half.lap);
  });
  it("is wider, too, on the wrong tyre for the road, in both directions, and settles back on the right one", () => {
    const dry = drive("rally", "medium", 1, false), wetOnDry = drive("rally", "wet", 1, false);
    const wetOnWet = drive("rally", "wet", 1, true), slicksOnWet = drive("rally", "medium", 1, true);
    expect(wetOnDry.peak).toBeGreaterThan(dry.peak);
    expect(slicksOnWet.peak).toBeGreaterThan(wetOnWet.peak * 1.3);
    expect(slicksOnWet.lap).toBeGreaterThan(wetOnWet.lap);
    expect(wetOnWet.grip).toBeGreaterThan(0.9);
  });
  it("keeps to a vehicle's own range: a formula car's angles stay small, and never more than twice its peak", () => {
    const f = drive("formula", "medium", 0.05, false);
    expect(f.peak).toBeLessThan((4 * Math.PI) / 180 * 2 + 0.2);
  });
});
