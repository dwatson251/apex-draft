import { describe, expect, it } from "vitest";
import { ROOM_LEVELS, Race, cachedTrack, makeBots, placeFor } from "@apex/sim";

describe("racing room", () => {
  it("gets tighter with each level", () => {
    for (let i = 1; i < ROOM_LEVELS.length; i++) {
      expect(ROOM_LEVELS[i]!.side).toBeLessThan(ROOM_LEVELS[i - 1]!.side);
      expect(ROOM_LEVELS[i]!.cut).toBeGreaterThan(ROOM_LEVELS[i - 1]!.cut);
      expect(ROOM_LEVELS[i]!.head).toBeLessThan(ROOM_LEVELS[i - 1]!.head);
    }
  });

  it("puts the cars closer together in the tightest, and is the same race as always at the default", () => {
    const phrase = "quiet-fox-hugs-kites", t = cachedTrack(phrase), v = placeFor(phrase).vehicle;
    const gaps = (room?: 0 | 1 | 2) => {
      const r = new Race(t, makeBots(t, v, 0, 23, "hard"), 3, { realism: false, weather: false, ...(room === undefined ? {} : { room }) });
      let sum = 0, n = 0;
      for (let tick = 1; tick <= 40 * 60; tick++) {
        r.step();
        if (tick < 900 || tick % 30) continue;
        for (const c of r.cars) {
          let best = Infinity;
          for (const o of r.cars) if (o !== c) { const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < best) best = d; }
          if (best < 40) { sum += best; n++; }
        }
      }
      return { mean: sum / n, hash: r.hash() };
    };
    const normal = gaps(), explicit = gaps(0), tight = gaps(2);
    expect(explicit.hash).toBe(normal.hash);
    expect(tight.mean).toBeLessThan(normal.mean);
  }, 60000);
});
