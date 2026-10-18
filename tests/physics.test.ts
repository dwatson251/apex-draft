import { describe, expect, it } from "vitest";
import { Race, TYRE_GRIP_LOSS, botLine, buildProfile, combined, defaultCar, generateTrack, wornGrip } from "@apex/sim";

describe("the tyre cliff", () => {
  it("fades gently for most of a tyre's life and falls away at the end", () => {
    expect(wornGrip(1)).toBe(1);
    expect(wornGrip(0)).toBeCloseTo(1 - TYRE_GRIP_LOSS, 9);
    const lost = (h: number) => 1 - wornGrip(h);
    expect(lost(0.5) / TYRE_GRIP_LOSS).toBeCloseTo(0.25, 2); // half worn: a quarter of the loss
    expect(lost(0) - lost(0.25)).toBeGreaterThan(2 * (lost(0.5) - lost(0.75))); // the last quarter costs far more than the one before
    for (let h = 0; h < 1; h += 0.05) expect(wornGrip(h)).toBeLessThanOrEqual(wornGrip(h + 0.05) + 1e-12);
  });
});

describe("the friction circle", () => {
  it("leaves a tyre less to brake with the harder it is turning", () => {
    expect(combined(0)).toBe(1);
    expect(combined(0.6)).toBeCloseTo(0.8, 6);
    expect(combined(1)).toBeGreaterThan(0); // at the limit there is still a little
  });
  it("still lets a car reach the speed limit of the tightest bend (braking for it is done before it, with grip to spare)", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const p = buildProfile(t, botLine(t, 1, 1), defaultCar());
    // the slowest point of a bend is still where the speed limit of the bend is
    let k = 0; for (let i = 0; i < p.n; i++) if (p.vLim[i]! < p.vLim[k]!) k = i;
    expect(p.vFly[k]).toBeCloseTo(p.vLim[k]!, 6);
  });
});

describe("wear during a lap", () => {
  it("costs speed as it happens, not all at the start of the next lap", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const race = (wear: number) => {
      const r = new Race(t, [{ id: "a", name: "a", car: defaultCar(), lines: [botLine(t, 1, 1)], isPlayer: true }], 1, { realism: true, weather: false, wearMult: { fuel: 1, tyre: wear } });
      r.runToEnd(); return r.results()[0]!.lapTimes[0]!;
    };
    // heavy wear within the very first lap now slows that lap (its path was built on new tyres)
    expect(race(40)).toBeGreaterThan(race(1) + 0.2);
  });
});
