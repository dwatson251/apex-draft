import { describe, expect, it } from "vitest";
import { Race, botLine, cachedTrack, defaultCar, makeBots, placeFor } from "@apex/sim";

/** A big field piles into the last pit bay. A car still driving in must never hold up the ones already in it and done. */
describe("the pit lane release", () => {
  const lab = () => {
    const t = cachedTrack("alpha"), v = placeFor("alpha").vehicle;
    const r = new Race(t, makeBots(t, v, 0, 3), 3, { realism: true, weather: false });
    return r as unknown as { cars: { pitIn: boolean; bay?: number; boxed: boolean; ready: boolean; pitDone: boolean; pits: number }[]; releaseCars(): void; lastRelease: number };
  };

  it("lets a boxed car that is ready go even when a car still arriving is first in line for the same bay", () => {
    const r = lab();
    for (const c of r.cars) { c.pitIn = true; c.bay = 3; c.pitDone = false; }
    r.cars[0]!.boxed = false;                       // still driving in, first in the list
    r.cars[1]!.boxed = true; r.cars[1]!.ready = false; // being serviced
    r.cars[2]!.boxed = true; r.cars[2]!.ready = true;  // done and waiting
    r.lastRelease = -1000;
    r.releaseCars();
    expect(r.cars[2]!.pits).toBe(1);
    expect(r.cars[0]!.pits).toBe(0);
    expect(r.cars[1]!.pits).toBe(0);
  });

  it("still lets the lowest bay go first", () => {
    const r = lab();
    for (const c of r.cars) { c.pitIn = true; c.pitDone = false; c.boxed = true; c.ready = true; }
    r.cars[0]!.bay = 2; r.cars[1]!.bay = 0; r.cars[2]!.bay = 3;
    r.lastRelease = -1000;
    r.releaseCars();
    expect(r.cars[1]!.pits).toBe(1);
    expect(r.cars[0]!.pits + r.cars[2]!.pits).toBe(0);
  });
});
