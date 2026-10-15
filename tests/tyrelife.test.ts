import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack, type Compound } from "@apex/sim";

/** Laps a set of tyres would last on a rally car going round at the limit, from the wear over two laps. */
function life(comp: Compound, soaked: boolean): number {
  let tot = 0;
  const phrases = ["brave-owl-rides-melons", "calm-fox-plants-mittens", "oval"];
  for (const ph of phrases) {
    const t = generateTrack(ph, { biome: "grass" });
    const r = new Race(t, [{ id: "a", name: "a", car: { ...defaultCar(), type: "rally" }, lines: [botLine(t, 7, 0.9)], isPlayer: true, startTyre: comp }], 2, { realism: true, weather: false });
    while (!r.over) { r.cars[0]!.fuel = 100; if (soaked) r.field.wet.fill(1); r.step(); }
    tot += (1 - r.cars[0]!.tyre) / r.results()[0]!.lapTimes.length;
  }
  return phrases.length / tot;
}

describe("tyre life at 1x wear", () => {
  it("is about 5 laps for softs and 10 for mediums on a dry track", () => {
    const soft = life("soft", false), medium = life("medium", false);
    expect(soft).toBeGreaterThan(4); expect(soft).toBeLessThan(6);
    expect(medium).toBeGreaterThan(8.5); expect(medium).toBeLessThan(11.5);
  });
  it("is about 15 laps for wets on a wet track, and much less on a dry one", () => {
    const wet = life("wet", true), dry = life("wet", false);
    expect(wet).toBeGreaterThan(13.5); expect(wet).toBeLessThan(16.5);
    expect(dry).toBeLessThan(wet * 0.6);
  });
});
