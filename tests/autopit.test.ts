import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack, placeFor, runRace, type Entrant } from "@apex/sim";

/** With `autoPit`, the player's car is brought in by the same calls the computer drivers' are, and a stop the player queued still comes first. */
describe("the pit wall calling the player's stops", () => {
  const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
  const me = (extra: Partial<Entrant> = {}): Entrant => ({ id: "me", name: "Me", car: defaultCar(), lines: [botLine(t, 1, 0.8)], isPlayer: true, ...extra });
  const rules = { realism: true, weather: false, wearMult: { fuel: 6, tyre: 6 } };

  it("never lets the car run dry when the tank cannot reach the flag", () => {
    const left = new Race(t, [me()], 6, rules); left.runToEnd();
    const auto = new Race(t, [me({ autoPit: true })], 6, rules); auto.runToEnd();
    expect(left.results()[0]!.emergencies).toBeGreaterThan(0); // the case is real: alone it runs dry
    expect(auto.results()[0]!.emergencies).toBe(0);
    expect(auto.results()[0]!.pits).toBeGreaterThan(0);
  });

  it("still makes the stops the player queued, on their laps", () => {
    const r = new Race(t, [me({ autoPit: true, pitPlan: [{ lap: 1, tyre: "soft" }] })], 6, rules);
    r.runToEnd();
    expect(r.cars[0]!.used).toContain("soft");
  });

  it("is replayed the same way by the server's headless race", () => {
    const phrase = "brave-owl-rides-melons", track = generateTrack(phrase), line = botLine(track, 1, 0.8);
    const base = { phrase, vehicle: placeFor(phrase).vehicle, car: defaultCar(), lines: [line], lapLine: [0, 0, 0, 0, 0, 0], laps: 6, realism: true, wearFuel: 4.5, wearTyre: 4.5, ghosts: [], rivals: 1, playerTime: null };
    const a = runRace({ ...base, autoPit: true }), b = runRace({ ...base });
    expect(a.ok ? "" : a.error).toBe(""); expect(b.ok ? "" : b.error).toBe("");
    if (a.ok && b.ok) expect(a.player.finishTime!).toBeLessThan(b.player.finishTime!); // the wall brings it in before it runs dry
  });

  it("(and the computer drivers count the fuel multiplier too: with fuel use turned up they used to run dry)", () => {
    const field: Entrant[] = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, car: defaultCar(), lines: [botLine(t, i + 1, 0.6 + 0.05 * i)]}));
    const r = new Race(t, field, 8, { realism: true, weather: false, wearMult: { fuel: 4, tyre: 1 } });
    r.runToEnd();
    expect(r.results().reduce((a, x) => a + x.emergencies, 0)).toBe(0);
    expect(r.results().every((x) => x.pits > 0)).toBe(true);
  });
});
