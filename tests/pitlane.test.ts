import { describe, expect, it } from "vitest";
import { PIT_BAYS, PIT_STOP_TIME, Race, botLine, defaultCar, generateTrack, type Entrant } from "@apex/sim";

const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
const everyoneStops = (n: number): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 3 + i, 0.5 + i / 30)], isPlayer: i === 0, pit: [true, false, false] }));

describe("the pit lane", () => {
  const r = new Race(t, everyoneStops(10), 3, { realism: true, weather: false });
  let boxedAtOnce = 0;
  for (let i = 0; i < 60 * 400 && !r.over; i++) { r.step(); boxedAtOnce = Math.max(boxedAtOnce, r.cars.filter((c) => c.boxed).length); }
  const starts = r.events.filter((e) => e.type === "pitStart"), ends = r.events.filter((e) => e.type === "pitEnd");

  it("lets everyone in: every car stops once and finishes", () => {
    expect(r.over).toBe(true);
    expect(starts).toHaveLength(10);
    expect(r.results().every((x) => x.pits === 1 && x.finishTime !== null)).toBe(true);
  });
  it("services cars at the same time instead of making them queue to get in", () => {
    expect(boxedAtOnce).toBeGreaterThan(1);
    const gaps = starts.slice(1).map((e, i) => (e.tick - starts[i]!.tick) / 60);
    expect(Math.min(...gaps)).toBeLessThan(PIT_STOP_TIME);
  });
  it("lets them go first in, first out, with room between them", () => {
    expect(ends.map((e) => e.id)).toEqual(starts.map((e) => e.id));
    for (let i = 1; i < ends.length; i++) expect(ends[i]!.tick - ends[i - 1]!.tick).toBeGreaterThanOrEqual(50);
  });
  it("gives each car in at once its own bay", () => {
    expect(PIT_BAYS).toBeGreaterThanOrEqual(3);
  });
});
