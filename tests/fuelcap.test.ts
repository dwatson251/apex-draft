import { describe, expect, it } from "vitest";
import { MIN_TANK_LAPS, Race, TANK, botLine, defaultCar, fuelMultFor, fuelPerLap, generateTrack, makeBots, placeFor, trackLength } from "@apex/sim";

describe("the fuel multiplier", () => {
  it("is held to what leaves a full tank good for a lap and a half", () => {
    const t = generateTrack("spa"), car = { ...defaultCar(), type: placeFor("spa").vehicle }, len = trackLength(t);
    const m = fuelMultFor(car, 3, len, 1, 4);
    expect(m).toBeLessThan(4);
    expect(TANK / (fuelPerLap(car, 3, len) * m * 1.1)).toBeGreaterThanOrEqual(MIN_TANK_LAPS - 1e-9);
    expect(fuelMultFor(car, 40, len, 1, 4)).toBe(4); // a long race has range enough: what was asked for
  });
  it("lets a field with stops planned by the pit wall get round Spa at 4x without anyone running dry", () => {
    const t = generateTrack("spa"), v = placeFor("spa").vehicle;
    const me = { id: "me", name: "Me", car: { ...defaultCar(), type: v }, lines: [botLine(t, 5, 1)], isPlayer: true, autoPit: true };
    const r = new Race(t, [me, ...makeBots(t, v, 0, 5, "hard")], 3, { realism: true, weather: false, wearMult: { fuel: 4, tyre: 4 } });
    r.runToEnd();
    expect(r.results().reduce((a, x) => a + x.emergencies, 0)).toBe(0);
  });
});
