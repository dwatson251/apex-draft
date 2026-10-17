import { describe, expect, it } from "vitest";
import { Race, botLine, checkTrack, defaultCar, generateTrack, levelsOf, makeBots, minClearance, placeFor, type Entrant } from "@apex/sim";

const normal = (i: number) => `quiet-fox-${i}-run`;
const fun = (i: number) => `fun-quiet-fox-${i}`;
const hasBridge = (phrase: string) => levelsOf(generateTrack(phrase, { obstacles: false })) !== null;

describe("bridges", () => {
  it("turn up on about one ordinary track in ten, and far more often on fun ones", () => {
    const n = 150, f = 40;
    const ord = Array.from({ length: n }, (_, i) => hasBridge(normal(i))).filter(Boolean).length;
    const funny = Array.from({ length: f }, (_, i) => hasBridge(fun(i))).filter(Boolean).length;
    expect(ord / n).toBeGreaterThan(0.03);
    expect(ord / n).toBeLessThan(0.2);
    expect(funny / f).toBeGreaterThan(ord / n + 0.2);
  });

  it("make a sound loop: a bridge and the road under it share a cell, at right angles, and nothing else does", () => {
    let seen = 0;
    for (let i = 0; seen < 4 && i < 200; i++) {
      const t = generateTrack(normal(i), { obstacles: false });
      const lv = levelsOf(t);
      if (!lv) continue;
      seen++;
      expect(checkTrack(t)).toEqual([]);
      expect(minClearance(t)).toBeGreaterThan(3);
      expect(t.fun).toBe(false);
      expect(t.circuit).toBeUndefined();
      expect(placeFor(normal(i)).fun).toBe(false);
      const decks = t.segments.filter((s) => s.kind === "bridge"), unders = t.segments.filter((s) => s.kind === "under");
      expect(decks.length).toBeGreaterThan(0);
      expect(decks.length).toBe(unders.length);
      expect(t.segments.filter((s) => s.kind === "cross")).toHaveLength(0);
      for (const d of decks) {
        const u = unders.find((o) => o.cx === d.cx && o.cy === d.cy)!;
        expect(u).toBeDefined();
        expect(lv[d.index]).toBe(-lv[u.index]!);
        expect(d.entry.dir.x * u.entry.dir.x + d.entry.dir.y * u.entry.dir.y).toBeCloseTo(0, 9);
      }
    }
    expect(seen).toBe(4);
  });

  it("are the same every time, and leave every other phrase with the track it had", () => {
    const a = generateTrack(normal(3), { obstacles: false }), b = generateTrack(normal(3), { obstacles: false });
    expect(b.segments.map((s) => s.kind)).toEqual(a.segments.map((s) => s.kind));
    const plain = Array.from({ length: 30 }, (_, i) => normal(i)).filter((p) => !hasBridge(p));
    // an ordinary track without a bridge is still the closed loop of the 7 by 5 grid it always was
    for (const p of plain) { const t = generateTrack(p, { obstacles: false }); expect([t.cols, t.rows]).toEqual([7, 5]); expect(levelsOf(t)).toBeNull(); }
  });

  it("let cars pass through each other: no touch between the bridge and the road under it, and nobody waits", () => {
    let phrase = "";
    for (let i = 0; !phrase && i < 300; i++) if (hasBridge(normal(i))) phrase = normal(i);
    const t = generateTrack(phrase, { obstacles: false });
    const bots = makeBots(t, placeFor(phrase).vehicle, 0, 20);
    const r = new Race(t, bots, 3, { realism: false });
    let overlaps = 0, bumps = 0;
    while (!r.over) {
      r.step();
      for (let i = 0; i < r.cars.length; i++) for (let j = i + 1; j < r.cars.length; j++) {
        const a = r.cars[i]!, b = r.cars[j]!;
        if (r.levelOf(a) !== 0 && r.levelOf(a) === -r.levelOf(b) && Math.hypot(a.x - b.x, a.y - b.y) < 6) overlaps++;
      }
    }
    // cars did drive through the same spot on the two levels, and not one of those meetings was a bump
    expect(overlaps).toBeGreaterThan(0);
    bumps = r.events.filter((e) => e.type === "bump").length;
    expect(bumps).toBeLessThan(40);
    for (const e of r.events) {
      if (e.type !== "bump") continue;
      const a = r.cars.find((c) => c.entrant.id === e.id)!, b = r.cars.find((c) => c.entrant.id === e.other)!;
      const separated = a.ltrace[e.tick]! !== 0 && a.ltrace[e.tick] === -b.ltrace[e.tick]!;
      expect(separated, `bump between ${e.id} and ${e.other}`).toBe(false);
    }
    expect(r.results().every((x) => x.finishTime !== null)).toBe(true);
  }, 120000);
});
