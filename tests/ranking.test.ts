import { describe, expect, it } from "vitest";
import { botLine, buildProfile, cachedTrack, defaultCar, placeFor, ringCum, sampleAt } from "@apex/sim";

/** Position in the race is where a car is on the ring, not how far along its own line it has come: lines are different lengths. */
describe("ranking cars on lines of different lengths", () => {
  for (const phrase of ["spa", "river bend", "brave-owl-rides-melons"]) {
    it(`agrees at every gate of ${phrase}, whichever line the car is on`, () => {
      const t = cachedTrack(phrase), car = { ...defaultCar(), type: placeFor(phrase).vehicle }, ring = ringCum(t);
      const lines = [botLine(t, 3, 1), botLine(t, 3, 0.9, { lane: -17 }), botLine(t, 3, 0.9, { lane: 17 })];
      const profiles = lines.map((l) => buildProfile(t, l, car));
      // the lines really are different lengths (this is what used to put one car ahead of another that was beside it)
      expect(Math.max(...profiles.map((p) => p.length)) - Math.min(...profiles.map((p) => p.length))).toBeGreaterThan(20);
      for (const p of profiles) {
        const first = new Map<number, number>();
        for (let i = 0; i < p.n; i++) if (!first.has(p.seg[i]!)) first.set(p.seg[i]!, i);
        for (const [q, i] of first) if (q < t.segments.length) expect(Math.abs(p.canon[i]! - ring[q]!), `segment ${q}`).toBeLessThan(ring[q + 1]! - ring[q]! + 1);
        // from nothing to the whole ring, and never backwards
        expect(p.canon[0]).toBeLessThan(5);
        expect(ring[t.segments.length]! - p.canon[p.n - 1]!).toBeLessThan(ring[1]! + 5);
        for (let i = 1; i < p.n; i++) expect(p.canon[i]!).toBeGreaterThanOrEqual(p.canon[i - 1]! - 1e-6);
      }
      // at the same place on the ring the three lines give the same position, within a few units, though they have come very different distances
      const probe = Math.floor(t.segments.length / 2);
      const at = profiles.map((p) => { for (let i = 0; i < p.n; i++) if (p.seg[i] === probe) return sampleAt(p, p.canon, i * p.ds); return NaN; });
      const along = profiles.map((p) => { for (let i = 0; i < p.n; i++) if (p.seg[i] === probe) return i * p.ds; return NaN; });
      expect(Math.max(...at) - Math.min(...at)).toBeLessThan(2);
      expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(8);
    });
  }
});
