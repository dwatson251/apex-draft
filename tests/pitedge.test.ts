import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack, type Entrant } from "@apex/sim";

/** Pit-lane laps are "open" (they start or end in the lane): the awkward cases are a car that runs dry on the lap out of the pits, and a stop planned right after an emergency one. */
describe("pit lane edge cases", () => {
  const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
  const me = (extra: Partial<Entrant> = {}): Entrant => ({ id: "me", name: "Me", car: defaultCar(), lines: [botLine(t, 1, 0.8)], isPlayer: true, ...extra });

  it("a car that keeps running dry, out lap after out lap, still limps round to the flag", () => {
    // the tank is all but empty on every lap out of the pits: each one starts in the pit lane and runs dry before it is over
    // (fuel use turned up cannot do it any more: a full tank always lasts a lap and a half)
    const r = new Race(t, [me()], 4, { realism: true, weather: false });
    const c = r.cars[0]!;
    c.fuel = 6;
    let lap = c.lap;
    while (!r.over) { r.step(); if (c.lap !== lap) { lap = c.lap; if (c.pitOut) c.fuel = Math.min(c.fuel, 6); } }
    const res = r.results()[0]!;
    expect(c.finishTime, "finished").not.toBeNull();
    expect(res.emergencies).toBeGreaterThanOrEqual(3);
    expect(res.lapTimes.length).toBe(4);
    expect(r.time).toBeLessThan(r["maxTime"] as number);
  });

  it("a planned stop on the lap after an emergency refuel is still made, with its tyres", () => {
    const r = new Race(t, [me({ pitPlan: [{ lap: 2, tyre: "soft" }] })], 4, { realism: true, weather: false });
    r.cars[0]!.fuel = 8; // runs dry on the first lap
    r.runToEnd();
    const c = r.cars[0]!, res = r.results()[0]!;
    expect(c.finishTime).not.toBeNull();
    expect(res.emergencies).toBe(1);
    expect(res.pits).toBeGreaterThanOrEqual(2);
    expect(c.used).toContain("soft");
  });
});
