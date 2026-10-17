import { describe, expect, it } from "vitest";
import { standingsRows } from "../src/renderer/standings.ts";

describe("the five rows of the standings", () => {
  it("are the leader, last place, the car ahead, you and the car behind", () => {
    expect(standingsRows(32, 10)).toEqual([0, 9, 10, 11, 31]);
  });
  it("always come to five, whoever you are: first, second, last, next to last", () => {
    for (const n of [5, 6, 8, 32, 256]) for (const me of [0, 1, 2, Math.floor(n / 2), n - 3, n - 2, n - 1]) {
      const rows = standingsRows(n, me);
      expect(rows, `n=${n} me=${me}`).toHaveLength(5);
      expect(new Set(rows).size).toBe(5);
      expect(rows).toEqual([...rows].sort((a, b) => a - b));
      expect(rows).toContain(0); expect(rows).toContain(n - 1); expect(rows).toContain(me);
      if (me > 0) expect(rows).toContain(me - 1);
      if (me < n - 1) expect(rows).toContain(me + 1);
    }
  });
  it("fills from the player outward when the player is at an end", () => {
    expect(standingsRows(32, 0)).toEqual([0, 1, 2, 3, 31]);
    expect(standingsRows(32, 31)).toEqual([0, 28, 29, 30, 31]);
  });
  it("shows everyone in a field of five or fewer", () => {
    expect(standingsRows(3, 1)).toEqual([0, 1, 2]);
    expect(standingsRows(5, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(standingsRows(1, 0)).toEqual([0]);
  });
});

import { lapsApart, splitSeconds } from "../src/renderer/standings.ts";

describe("split times", () => {
  // two cars on a straight: the leader runs at 60 units/s, the other at 50 units/s, 12 units back to begin with
  const leader = Array.from({ length: 601 }, (_, k) => 100 + (60 * k) / 60), chaser = Array.from({ length: 601 }, (_, k) => 88 + (50 * k) / 60);
  it("is how long ago the car in front was where you are now", () => {
    // at tick 300 the leader is at 400 and the chaser at 338: the leader was at 338 when 238/60... (338-100)/60*60 = 238 ticks in
    const t = splitSeconds(chaser, leader, 300, 1600)!;
    expect(t).toBeCloseTo((300 - 238) / 60, 2);
    expect(t).toBeGreaterThan(0);
  });
  it("is negative, and the same size seen from the other car, for the car behind", () => {
    const behind = splitSeconds(leader, chaser, 300, 1600)!;
    expect(behind).toBeLessThan(0);
    // how long ago the leader was where the chaser is now, as seen from the chaser, against how long ago the leader was where the chaser is: one is the gap the other way round
    expect(Math.abs(behind)).toBeCloseTo(splitSeconds(chaser, leader, 300, 1600)!, 0);
  });
  it("has nothing to say about a car a whole lap away, or before there is data", () => {
    expect(splitSeconds([700], [700 + 1e5], 0, 1600)).toBeNull();   // a car that has lapped you
    expect(splitSeconds([5], [5], 3, 1600)).toBeNull();
  });
  it("is not fooled by the start line: a car just across it is a few yards ahead, not a lap", () => {
    // the player is 30 units short of the line on lap 0; the other car is 5 past it on lap 1
    expect(lapsApart([1570], [1e5 + 5], 0, 1600)).toBe(0);
    expect(lapsApart([1e5 + 5], [1570], 0, 1600)).toBe(0);
    const t = splitSeconds([1570], [1e5 + 5], 0, 1600);
    expect(t).not.toBeNull();
    // and the gap is real laps only when it is: a lap and a bit ahead is 1, a lap and a bit behind is -1
    expect(lapsApart([300], [1e5 + 900], 0, 1600)).toBe(1);
    expect(lapsApart([1e5 + 900], [300], 0, 1600)).toBe(-1);
    expect(lapsApart([300], [2e5 + 500], 0, 1600)).toBe(2);
  });
});
