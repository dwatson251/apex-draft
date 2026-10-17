import { describe, expect, it } from "vitest";
import { FIELD_SIZES, LAP_UNITS, MAX_RIVALS, Race, SAFE_GAP, TYRE_WEAR_PER_UNIT, botLine, defaultCar, fuelPerLap, fuelPerUnit, generateTrack, makeBots, placeFor, snapRivals, trackLength } from "@apex/sim";

describe("field sizes", () => {
  it("are the round numbers of a real race, and rivals are one fewer", () => {
    expect([...FIELD_SIZES]).toEqual([2, 4, 8, 16, 24, 32, 64, 128, 256]);
    expect(MAX_RIVALS).toBe(255);
    expect(snapRivals(1)).toBe(1);
    expect(snapRivals(5)).toBe(3);      // an old save with 5 rivals (6 players) is as near 4 as 8: the smaller field
    expect(snapRivals(6)).toBe(7);
    expect(snapRivals(31)).toBe(31);
    expect(snapRivals(1000)).toBe(255);
    expect(snapRivals(0)).toBe(1);
    for (const n of FIELD_SIZES) expect(snapRivals(n - 1)).toBe(n - 1);
  });

  it("start without anybody on top of anybody, and all of them on the road behind the line, up to 256 players", () => {
    for (const phrase of ["quiet-lynx-needs-clocks", "calm-owl-sleeps"]) {
      const t = generateTrack(phrase, { obstacles: false });
      for (const n of [64, 256]) {
        const r = new Race(t, makeBots(t, placeFor(phrase).vehicle, 0, n), 2, { realism: false });
        expect(r.cars).toHaveLength(n);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(r.cars[i]!.x - r.cars[j]!.x, r.cars[i]!.y - r.cars[j]!.y), `${phrase} ${n}: ${i} and ${j}`).toBeGreaterThan(SAFE_GAP - 1);
        const back = Math.max(...r.cars.filter((c) => c.slot > 0).map((c) => r.cars[0]!.prof.length - c.s));
        expect(back).toBeLessThan(trackLength(t) * 0.95);
      }
    }
  }, 60000);
});

describe("working a race out a stretch at a time", () => {
  it("gives exactly the race that working it out in one go gives", () => {
    const t = generateTrack("quiet-lynx-needs-clocks", { obstacles: false });
    const mk = () => new Race(t, makeBots(t, placeFor("quiet-lynx-needs-clocks").vehicle, 0, 12), 2, { realism: true });
    const whole = mk(); whole.runToEnd();
    const parts = mk(), stage = { toEnd: false };
    let state = parts.advance("bot0", stage, 37), calls = 1;
    while (state !== "end") { state = parts.advance("bot0", stage, 37); calls++; if (state === "stop") throw new Error("nobody asked for a stop"); }
    expect(calls).toBeGreaterThan(10);
    expect(parts.hash()).toBe(whole.hash());
    expect(parts.tick).toBe(whole.tick);
  }, 60000);
});

describe("tyres and fuel go by distance", () => {
  it("cost a lap in proportion to its length", () => {
    const wear = (phrase: string) => {
      const t = generateTrack(phrase, { biome: "grass", obstacles: false });
      const line = botLine(t, 5, 1);
      const r = new Race(t, [{ id: "b0", name: "b0", car: defaultCar(), lines: [line, line], isPlayer: true, startTyre: "medium" }], 3);
      r.runLap("b0", 0);
      const c = r.cars[0]!;
      return { len: trackLength(t), tyre: 1 - c.tyre, fuel: 100 - c.fuel };
    };
    const names = Array.from({ length: 40 }, (_, i) => `long-and-short-${i}-tracks`).map((p) => ({ p, len: trackLength(generateTrack(p, { obstacles: false })) })).sort((x, y) => x.len - y.len);
    const a = wear(names[0]!.p), b = wear(names.at(-1)!.p);
    expect(Math.abs(a.len - b.len)).toBeGreaterThan(100); // two tracks of different lengths
    // wear and burn per unit driven agree between them (within a bend or two's difference), and not per lap
    expect(a.tyre / a.len / (b.tyre / b.len)).toBeGreaterThan(0.7);
    expect(a.tyre / a.len / (b.tyre / b.len)).toBeLessThan(1.45);
    // (per lap they would differ by the ratio of the lengths)
    expect(Math.abs(b.len / a.len - 1)).toBeGreaterThan(0.15);
    expect(a.fuel / a.len / (b.fuel / b.len)).toBeGreaterThan(0.95);
    expect(a.fuel / a.len / (b.fuel / b.len)).toBeLessThan(1.05);
  });

  it("have a lap of an ordinary track as the unit the numbers are quoted in", () => {
    const car = defaultCar();
    expect(fuelPerLap(car, 3, LAP_UNITS)).toBeCloseTo(fuelPerUnit(car, 3 * LAP_UNITS) * LAP_UNITS, 9);
    expect(fuelPerLap(car, 3, 2 * LAP_UNITS)).toBeCloseTo(2 * fuelPerLap(car, 3, LAP_UNITS), 3);
    expect(TYRE_WEAR_PER_UNIT * LAP_UNITS).toBeCloseTo(0.076, 9);
  });
});
