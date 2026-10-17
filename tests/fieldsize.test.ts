import { describe, expect, it } from "vitest";
import { FIELD_SIZES, contact, LAP_UNITS, MAX_RIVALS, Race, SAFE_GAP, TYRE_WEAR_PER_UNIT, botLine, defaultCar, fuelPerLap, fuelPerUnit, generateTrack, makeBots, placeFor, snapRivals, trackLength } from "@apex/sim";

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

describe("big fields keep to lanes and do not pile up", () => {
  it("give every computer driver of a field of more than 32 the lane of its grid column, and leave smaller fields alone", () => {
    const phrase = "quiet-fox-hugs-kites", t = generateTrack(phrase, { obstacles: false }), v = placeFor(phrase).vehicle;
    const big = new Race(t, makeBots(t, v, 0, 63), 2, { realism: false });
    const lanes = new Set(big.cars.map((c) => c.entrant.bot?.lane));
    expect([...lanes].sort()).toEqual([-16 / 22, -5.4 / 22, 5.4 / 22, 16 / 22].sort());
    const small = new Race(t, makeBots(t, v, 0, 15), 2, { realism: false });
    expect(small.cars.every((c) => c.entrant.bot?.lane === undefined)).toBe(true);
  });

  it("start 128 cars without a hard hit or a spin in the first half minute", () => {
    for (const [phrase, d] of [["quiet-fox-hugs-kites", "easy"], ["brave-owl-rides-melons", "medium"]] as const) {
      const t = generateTrack(phrase, { obstacles: false });
      const r = new Race(t, makeBots(t, placeFor(phrase).vehicle, 0, 127, d), 2, { realism: false, weather: false });
      for (let i = 0; i < 30 * 60; i++) r.step();
      expect(r.events.filter((e) => e.type === "bump" && (e.strength ?? 0) >= 12), phrase).toHaveLength(0);
      expect(r.events.filter((e) => e.type === "spin"), phrase).toHaveLength(0);
    }
  }, 120000);
});

describe("cars are as big as they are drawn", () => {
  it("never sit inside each other by more than a sliver, in a long machine or a short one", () => {
    for (const vehicle of ["tank", "truck", "kart"] as const) {
      const t = generateTrack("calm-owl-sleeps", { obstacles: false });
      const r = new Race(t, makeBots(t, vehicle, 0, 23), 2, { realism: false, weather: false });
      let worst = 0;
      for (let i = 0; i < 25 * 60; i++) {
        r.step();
        if (i % 6) continue;
        for (let a = 0; a < r.cars.length; a++) for (let b = a + 1; b < r.cars.length; b++) {
          const A = r.cars[a]!, B = r.cars[b]!;
          if (A.ghost || B.ghost) continue;
          worst = Math.max(worst, contact(A, B)?.depth ?? 0);
        }
      }
      expect(worst, vehicle).toBeLessThan(2.5);
    }
  }, 120000);
});
