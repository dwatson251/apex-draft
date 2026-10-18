import { describe, expect, it } from "vitest";
import { Race, SC_PACE, generateTrack, makeBots, placeFor, type RaceCar } from "@apex/sim";

describe("yellow flags and the safety car", () => {
  const phrase = "brave-owl-rides-melons";
  const t = generateTrack(phrase), v = placeFor(phrase).vehicle;
  const race = (flags: boolean) => new Race(t, makeBots(t, v, 0, 8, "hard"), 5, { realism: false, weather: false, flags });
  const spin = (r: Race, c: RaceCar) => (r as unknown as { startRecovery(c: RaceCar, kick: number, yaw: number): void }).startRecovery(c, 1.6, 6);
  const spread = (r: Race, skip: RaceCar[] = []) => { const p = r.cars.filter((c) => c.finishTime === null && !skip.includes(c)).map((c) => r.progress(c)); return Math.max(...p) - Math.min(...p); };

  it("comes out when two cars are in trouble at once, holds the leader to its pace, closes the field up and goes in again", () => {
    const r = race(true);
    while (r.time < 25) r.step();
    // the last two spin, so nobody is stuck behind them: the field ahead is what closes up
    const [a, b] = [...r.cars].sort((x, y) => r.progress(x) - r.progress(y));
    const before = spread(r, [a!, b!]);
    spin(r, a!); spin(r, b!);
    for (let i = 0; i < 3; i++) r.step();
    expect(r.events.some((e) => e.type === "sc")).toBe(true);
    // twenty seconds on: the leader is at the safety car's pace, and the field is closer together than it was
    for (let i = 0; i < 1200; i++) r.step();
    const leader = [...r.cars].sort((x, y) => r.progress(y) - r.progress(x))[0]!;
    const vTop = (r as unknown as { stats(c: RaceCar): { vTop: number } }).stats(leader).vTop;
    expect(leader.v).toBeLessThanOrEqual(SC_PACE * vTop * 1.02);
    expect(spread(r, [a!, b!])).toBeLessThan(before * 0.6);
    r.runToEnd();
    expect(r.events.some((e) => e.type === "scEnd")).toBe(true);
    expect(r.results().every((x) => x.finishTime !== null)).toBe(true);
  });

  it("stays in when nothing happens, and a race without flags never calls it", () => {
    const quiet = race(true); quiet.runToEnd();
    expect(quiet.events.some((e) => e.type === "sc")).toBe(false);
    const off = race(false);
    while (off.time < 25) off.step();
    spin(off, off.cars[3]!); spin(off, off.cars[5]!);
    off.runToEnd();
    expect(off.events.some((e) => e.type === "sc")).toBe(false);
  });
});
