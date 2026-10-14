import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack, type Entrant } from "@apex/sim";

const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
const field = (n: number): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 3 + i, 0.4 + i / 10)], isPlayer: i === 0 }));

describe("after the flag", () => {
  const r = new Race(t, field(4), 2, { realism: false });
  r.runToEnd();
  const winner = r.results()[0]!, car = r.cars.find((c) => c.entrant.id === winner.id)!;
  const tr = car.trace, n = tr.length / 3, tick = Math.round(car.finishTime! * 60);

  it("keeps the finished cars driving, at about half speed", () => {
    expect(n - 1 - tick).toBeGreaterThan(200);
    const moved = Math.hypot(tr[(n - 1) * 3]! - tr[tick * 3]!, tr[(n - 1) * 3 + 1]! - tr[tick * 3 + 1]!);
    expect(moved).toBeGreaterThan(20);
    const speeds = car.vtrace.slice(tick + 120);
    expect(Math.max(...speeds)).toBeLessThan(80);
    expect(Math.min(...speeds)).toBeGreaterThan(5);
  });
  it("lets the race end a few seconds after the last car finishes, not before", () => {
    const last = Math.max(...r.cars.map((c) => c.finishTime!));
    expect(r.time).toBeGreaterThanOrEqual(last + 5);
    expect(r.time).toBeLessThan(last + 6);
  });
  it("does not change anyone's result", () => {
    expect(r.results().every((x) => x.finishTime !== null && x.lapTimes.length === 2)).toBe(true);
  });
  it("keeps the coasting cars out of the way of those still racing (they are ghosts)", () => {
    expect(car.gtrace[n - 1]).toBe(1);
  });
});
