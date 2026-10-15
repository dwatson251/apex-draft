import { describe, expect, it } from "vitest";
import { Race, Rng, botLine, checkTrack, defaultCar, generateTrack, randomPhrase, ROAD_HALF } from "@apex/sim";

const funPhrases = (n: number, seed = 5) => { const r = new Rng(seed); return Array.from({ length: n }, () => `fun-${randomPhrase(r)}`); };

function crossings(p: string) {
  const t = generateTrack(p);
  return { t, crosses: t.segments.filter((s) => s.kind === "cross").length };
}

describe("fun tracks", () => {
  it("are deterministic, valid, and mostly run over themselves", () => {
    let crossed = 0;
    const N = 150;
    for (const p of funPhrases(N)) {
      const { t, crosses } = crossings(p);
      expect(t.fun).toBe(true);
      expect(checkTrack(t), p).toEqual([]);
      expect(JSON.stringify(generateTrack(p).segments)).toBe(JSON.stringify(t.segments));
      if (crosses > 0) {
        crossed++;
        expect(crosses % 2).toBe(0);                           // each crossing has two cells
        // a crossing is two cells in the same place
        const cells = new Map<string, number>();
        for (const s of t.segments) cells.set(`${s.cx},${s.cy}`, (cells.get(`${s.cx},${s.cy}`) ?? 0) + 1);
        expect([...cells.values()].filter((v) => v === 2).length).toBe(crosses / 2);
      }
    }
    expect(crossed).toBeGreaterThan(N * 0.9);
  });
  it("keep the start line on plain straights, with no road close by", () => {
    for (const p of funPhrases(60, 9)) {
      const t = generateTrack(p);
      expect(t.segments[0]!.kind).toBe("straight");
      expect(t.segments.at(-1)!.kind).toBe("straight");
    }
  });
  it("give every kind of surface, and boats exactly on the water ones", () => {
    const seen = new Set<string>();
    for (const p of funPhrases(200, 13)) seen.add(generateTrack(p).biome);
    expect(seen.has("water")).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
  it("race: a full grid gets round a crossed track", () => {
    for (const p of funPhrases(8, 21)) {
      const t = generateTrack(p);
      const es = Array.from({ length: 16 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, car: defaultCar(), lines: [botLine(t, i + 1, 0.5 + 0.03 * i)], isPlayer: i === 0 }));
      const r = new Race(t, es, 3, { realism: false });
      r.runToEnd();
      expect(r.cars.every((c) => c.finishTime !== null), p).toBe(true);
      expect(ROAD_HALF).toBe(22);
    }
  });
});

import { rerollPhrase } from "@apex/sim";
describe("random on a fun phrase", () => {
  it("keeps the fun- prefix and changes the rest", () => {
    let p = "fun-healthy-bear-eats-tuna";
    for (let i = 0; i < 20; i++) {
      const q = rerollPhrase(p, new Rng(i + 1));
      expect(q.startsWith("fun-")).toBe(true);
      expect(q).not.toBe(p);
      p = q;
    }
    expect(rerollPhrase("healthy-bear-eats-tuna", new Rng(3)).startsWith("fun-")).toBe(false);
    expect(rerollPhrase("  Fun Healthy Bear ", new Rng(3)).startsWith("fun-")).toBe(true);
  });
});
