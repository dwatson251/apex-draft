import { describe, expect, it } from "vitest";
import { Race, cachedTrack, makeBots, placeFor } from "@apex/sim";

describe("overtaking (RaceRules.overtake)", () => {
  it("is taken in turn, committed to one car, and finished before the car goes back to its line", () => {
    const phrase = "quiet-fox-hugs-kites", t = cachedTrack(phrase), v = placeFor(phrase).vehicle;
    const r = new Race(t, makeBots(t, v, 0, 15, "hard"), 3, { realism: false, weather: false, overtake: true });
    let started = 0, chained = 0, cutIn = 0;
    const was = new Map<string, boolean>();
    for (let tick = 1; tick <= 60 * 60; tick++) {
      r.step();
      for (const c of r.cars) {
        const on = c.passOn !== null;
        if (on && !was.get(c.entrant.id)) started++;
        // a car whose pass has just ended has the car it passed clear behind it
        if (!on && was.get(c.entrant.id) && c.passTo === null && c.lastPassed) {
          const o = c.lastPassed, along = (o.x - c.x) * Math.cos(c.hp) + (o.y - c.y) * Math.sin(c.hp);
          if (along > 0 && !c.rec && tick < c.passUntil) cutIn++;
        }
        was.set(c.entrant.id, on);
        // nobody passes a car that is itself passing, or is being passed
        if (c.passOn && c.passOn.passOn) chained++;
      }
    }
    expect(started).toBeGreaterThan(5);
    expect(chained).toBe(0);
    expect(cutIn).toBe(0);
  }, 60000);

  it("changes nothing when it is off", () => {
    const phrase = "quiet-fox-hugs-kites", t = cachedTrack(phrase), v = placeFor(phrase).vehicle;
    const run = (rules: object) => { const r = new Race(t, makeBots(t, v, 0, 7, "hard"), 3, { realism: false, weather: false, ...rules }); for (let i = 0; i < 20 * 60; i++) r.step(); return r.hash(); };
    expect(run({ overtake: false })).toBe(run({}));
  }, 60000);
});
