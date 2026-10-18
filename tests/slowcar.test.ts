import { describe, expect, it } from "vitest";
import { Race, botLine, cachedTrack, defaultCar, makeBots, placeFor, type Entrant } from "@apex/sim";

/** A car far slower than the rest, on the grid in front of them: the field behind should go round it and not queue behind it for the race. */
describe("cars held up by a far slower one", () => {
  const run = (phrase: string, seconds: number) => {
    const t = cachedTrack(phrase);
    const v = placeFor(phrase).vehicle;
    const slow: Entrant = { id: "slow", name: "Slow", car: { ...defaultCar(), type: v }, lines: [botLine(t, 3, 0.9)], bot: { seed: 3, skill: 0.9 }, pace: 0.12, gridSlot: 0 };
    const fast = makeBots(t, v, 0, 7, "hard").map((e, i) => ({ ...e, gridSlot: i + 1 }));
    const r = new Race(t, [slow, ...fast], 3, { realism: false, weather: false });
    for (let i = 0; i < seconds * 60; i++) r.step();
    return r;
  };

  it("pass it and get on with the race, without touching it hard", () => {
    for (const phrase of ["alpha", "quiet-lynx-needs-clocks"]) {
      const r = run(phrase, 45);
      const slow = r.cars.find((c) => c.entrant.id === "slow")!;
      const ahead = r.cars.filter((c) => c !== slow && r.progress(c) > r.progress(slow) + 8);
      expect(ahead.length, phrase).toBeGreaterThanOrEqual(5);
      // nobody is left stopped in a queue behind it
      expect(r.cars.filter((c) => c !== slow && c.v < 3).length, phrase).toBeLessThanOrEqual(1);
      expect(r.events.filter((e) => e.type === "bump" && (e.strength ?? 0) >= 12), phrase).toHaveLength(0);
    }
  }, 60000);

  it("go back to their line once past", () => {
    const r = run("alpha", 60);
    const slow = r.cars.find((c) => c.entrant.id === "slow")!;
    const passed = r.cars.filter((c) => c !== slow && c.finishTime === null && r.progress(c) > r.progress(slow) + 120);
    expect(passed.length).toBeGreaterThanOrEqual(4);
    for (const c of passed) expect(Math.abs(c.aim), c.entrant.id).toBeLessThan(2);
  }, 60000);

  it("leave the player's car behind it: getting past is the player's to do, by drawing a line round it", () => {
    const phrase = "alpha", t = cachedTrack(phrase), v = placeFor(phrase).vehicle, line = botLine(t, 3, 0.9);
    const slow: Entrant = { id: "slow", name: "Slow", car: { ...defaultCar(), type: v }, lines: [line], bot: { seed: 3, skill: 0.9 }, pace: 0.12, gridSlot: 0 };
    // on the very line of the slow car, so nothing but steering out of it would get past
    const me: Entrant = { id: "me", name: "Me", car: { ...defaultCar(), type: v }, lines: [line], isPlayer: true, gridSlot: 1 };
    const bot: Entrant = { id: "bot", name: "Bot", car: { ...defaultCar(), type: v }, lines: [line], bot: { seed: 3, skill: 0.9 }, gridSlot: 2 };
    const r = new Race(t, [slow, me, bot], 3, { realism: false, weather: false });
    for (let i = 0; i < 45 * 60; i++) r.step();
    const at = (id: string) => r.progress(r.cars.find((c) => c.entrant.id === id)!);
    expect(at("me")).toBeLessThan(at("slow"));
    expect(Math.abs(r.cars.find((c) => c.entrant.id === "me")!.aim)).toBeLessThan(1);
  }, 60000);
});
