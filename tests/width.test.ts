import { describe, expect, it } from "vitest";
import { ROAD_HALF, Race, botLine, checkTrack, defaultCar, generateTrack, halfIdx, isDrivable, roadMargin, randomPhrase, Rng } from "@apex/sim";
import { SAMPLES } from "../packages/sim/src/pieces.ts";
import { PINCH_MIN, WIDE_MAX, clearanceFrom } from "../packages/sim/src/width.ts";

const funPhrases = (n: number, seed = 1) => { const r = new Rng(seed); return Array.from({ length: n }, () => `fun-${randomPhrase(r)}`); };

describe("narrow and wide road", () => {
  it("only fun tracks have it, and plain tracks are left exactly as they were", () => {
    for (let i = 0; i < 60; i++) {
      const t = generateTrack(randomPhrase(new Rng(i + 1)));
      expect(t.fun).toBe(false);
      expect(t.segments.every((s) => !s.half)).toBe(true);
    }
  });
  it("turns up on fun tracks, within limits, and the joins agree", () => {
    let narrow = 0, wide = 0;
    for (const p of funPhrases(120)) {
      const t = generateTrack(p);
      expect(t.fun).toBe(true);
      expect(checkTrack(t), p).toEqual([]);
      const n = t.segments.length;
      t.segments.forEach((s, i) => {
        if (s.half) {
          expect(s.half.length).toBe(SAMPLES + 1);
          for (const h of s.half) { expect(h).toBeGreaterThanOrEqual(PINCH_MIN - 1e-9); expect(h).toBeLessThanOrEqual(WIDE_MAX + 1e-9); }
          if (Math.min(...s.half) < ROAD_HALF - 3) narrow++;
          if (Math.max(...s.half) > ROAD_HALF + 3) wide++;
        }
        const nx = t.segments[(i + 1) % n]!;
        expect(halfIdx(nx, 0)).toBeCloseTo(halfIdx(s, SAMPLES), 6);
        expect(clearanceFrom(t.segments, i), `${p} segment ${i}`).toBeGreaterThanOrEqual(3.99);
      });
      // never beside the start line
      for (const i of [0, 1, n - 2, n - 1]) expect(t.segments[i]!.half, `${p} ${i}`).toBeUndefined();
    }
    expect(narrow).toBeGreaterThan(10);
    expect(wide).toBeGreaterThan(10);
  });
  it("measures the road by its local width", () => {
    for (const p of funPhrases(40, 7)) {
      const t = generateTrack(p);
      for (const s of t.segments) {
        if (!s.half) continue;
        const k = s.half.indexOf(Math.max(...s.half));
        const edge = { x: s.center[k]!.x + s.normals[k]!.x * (s.half[k]! - 5), y: s.center[k]!.y + s.normals[k]!.y * (s.half[k]! - 5) };
        expect(roadMargin(t, edge)).toBeGreaterThan(4);
        expect(isDrivable(t, edge)).toBe(true);
        const out = { x: s.center[k]!.x + s.normals[k]!.x * (s.half[k]! + 6), y: s.center[k]!.y + s.normals[k]!.y * (s.half[k]! + 6) };
        // outside this road: either off the road altogether or on another bit of it
        if (roadMargin(t, out) < 0) expect(isDrivable(t, out)).toBe(false);
      }
    }
  });
  it("is driven by the bots, who finish the race and stay on the road", () => {
    for (const p of funPhrases(6, 11)) {
      const t = generateTrack(p);
      const es = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, car: defaultCar(), lines: [botLine(t, i + 1, 0.6 + 0.05 * i)], isPlayer: i === 0 }));
      const r = new Race(t, es, 3, { realism: false });
      r.runToEnd();
      expect(r.cars.every((c) => c.finishTime !== null), p).toBe(true);
    }
  });
});
