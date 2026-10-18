import { describe, expect, it } from "vitest";
import { CIRCUITS, CIRCUIT_DATA, ROAD_HALF, botLine, checkTrack, generateTrack, trackLength, validateLine, type Track } from "@apex/sim";

const free = CIRCUITS.filter((c) => c.free && !c.kart);

/** Radius of the circle through points `hop` samples apart along the road, the smallest of them all. */
function tightest(t: Track, hop = 2): number {
  const pts = t.segments.flatMap((s) => s.center.slice(0, -1));
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + pts.length - hop) % pts.length]!, b = pts[i]!, c = pts[(i + hop) % pts.length]!;
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
    const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    if (cross > 1e-9) best = Math.min(best, (ab * bc * ca) / (2 * cross));
  }
  return best;
}

describe("circuits laid out from a map", () => {
  it("are the real ones that were mapped: every line of data is a circuit and every mapped circuit has its line", () => {
    expect(free.map((c) => c.id).sort()).toEqual(Object.keys(CIRCUIT_DATA).sort());
    expect(free.length).toBeGreaterThanOrEqual(11);
    for (const id of ["spa-francorchamps", "monza", "silverstone", "circuit-de-barcelona-catalunya", "laguna-seca", "monaco", "le-mans", "daytona", "donington-park", "donington-park-gp", "willow-springs"]) expect(CIRCUIT_DATA[id], id).toBeTruthy();
  });
  for (const c of free) {
    describe(c.name, () => {
      const t = generateTrack(c.id);
      it("is a valid loop with a straight start line, cut into segments about a hundred units long", () => {
        expect(checkTrack(t)).toEqual([]);
        expect(t.free).toBe(true);
        const len = trackLength(t) / t.segments.length;
        expect(len).toBeGreaterThan(90);
        expect(len).toBeLessThan(150);
        for (const s of [t.segments[0]!, t.segments.at(-1)!]) {
          const off = Math.max(...s.center.map((p) => Math.abs((p.x - s.entry.mid.x) * s.entry.n.x + (p.y - s.entry.mid.y) * s.entry.n.y)));
          expect(off).toBeLessThan(12);
        }
      });
      it("has no bend tighter than a car can take, and room between its roads", () => {
        expect(tightest(t)).toBeGreaterThan(ROAD_HALF + 6);
      });
      it("is the right size for the real circuit (about a tenth to a unit and a half of a unit a metre)", () => {
        const perMetre = trackLength(t) / (c.lengthKm * 1000);
        expect(perMetre).toBeGreaterThan(0.35);
        expect(perMetre).toBeLessThan(1.5);
      });
      it("gives the bots a line they can drive, whatever their skill", () => {
        for (const skill of [0.3, 0.7, 1]) expect(validateLine(t, botLine(t, 5, skill)).ok, `skill ${skill}`).toBe(true);
      });
    });
  }
});
