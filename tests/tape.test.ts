import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack } from "@apex/sim";
import { Tape, f32, u8 } from "../packages/sim/src/tape.ts";

describe("tapes", () => {
  it("grow past their first size and read back what was pushed", () => {
    const t = new Tape(f32, 4);
    for (let i = 0; i < 1000; i++) t.push(i / 4);
    t.push3(1, 2, 3);
    expect(t.length).toBe(1003);
    const v = t.values();
    expect(v.length).toBe(1003);
    expect(v[999]).toBe(999 / 4);
    expect([...v.slice(-3)]).toEqual([1, 2, 3]);
  });
  it("hand out a fresh view after a push, and the same one when nothing changed", () => {
    const t = new Tape(u8, 2);
    t.push(1);
    const a = t.values();
    expect(t.values()).toBe(a);
    t.push(2); t.push(3);
    expect(t.values().length).toBe(3);
    expect(a.length).toBe(1);
  });
  it("keep a race's records compact: one value a tick per car, in typed arrays", () => {
    const track = generateTrack("alpha");
    const race = new Race(track, [{ id: "me", name: "Me", car: defaultCar(), lines: [botLine(track, 1, 1)] }], 1, { realism: true, weather: false });
    while (!race.over) race.step();
    const c = race.cars[0]!;
    expect(c.trace).toBeInstanceOf(Float32Array);
    expect(c.prog).toBeInstanceOf(Float64Array); // progress needs the precision: laps are counted in it
    expect(c.ptrace).toBeInstanceOf(Uint8Array);
    expect(c.trace.length).toBe(c.vtrace.length * 3);
    expect(c.prog.length).toBe(c.vtrace.length);
    expect(Object.keys(c)).toContain("trace"); // still reads like a field
  });
});
