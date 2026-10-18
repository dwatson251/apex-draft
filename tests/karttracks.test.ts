import { describe, expect, it } from "vitest";
import { validateLine, CIRCUITS, KART_DATA, KART_INFO, KART_ROSTER, KART_THEMES, Race, ROAD_HALF, botLine, checkTrack, defaultCar, generateTrack, isCrossing, isRamp, trackLength, circuitFor, type Segment } from "@apex/sim";

/**
 * Every Mario Kart course (the cheap checks on all of them; the full-grid races on a sample, and on a third of the courses with ramps. KART_FULL=1 races them all).
 * KART_COMPLETE=1 (set it once the pack is finished) also fails on any roster course without a shape.
 */
const MIN_GAP = 2 * ROAD_HALF + 4 - 0.5;
const courses = CIRCUITS.filter((c) => c.kart);

function separation(t: ReturnType<typeof generateTrack>): number {
  const n = t.segments.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (isCrossing(t.segments[i]!.kind) && isCrossing(t.segments[j]!.kind)) continue;
    for (const p of t.segments[i]!.center) for (const q of t.segments[j]!.center) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return best;
}
function joinsSmoothly(a: Segment, b: Segment): boolean {
  if (Math.hypot(a.exit.mid.x - b.entry.mid.x, a.exit.mid.y - b.entry.mid.y) > 1e-6) return false;
  if (a.exit.dir.x * b.entry.dir.x + a.exit.dir.y * b.entry.dir.y < 0.999) return false;
  const ea = a.center.at(-1)!, pa = a.center.at(-2)!;
  const d = { x: ea.x - pa.x, y: ea.y - pa.y };
  return (d.x * a.exit.dir.x + d.y * a.exit.dir.y) / Math.hypot(d.x, d.y) > 0.8;
}

describe("the Mario Kart courses", () => {
  it("are all in the roster, and the roster is all here once the pack is complete", () => {
    const ids = new Set(KART_ROSTER.map((r) => r.id));
    for (const id of Object.keys(KART_DATA)) expect(ids.has(id), id).toBe(true);
    if (process.env.KART_COMPLETE) expect(Object.keys(KART_DATA).sort()).toEqual([...ids].sort());
    expect(courses.length).toBe(Object.keys(KART_DATA).length);
  });

  it("are reached by name and alias, never by a four-word phrase, and are not hidden by a real circuit", () => {
    const seen = new Map<string, string>();
    for (const r of KART_ROSTER) {
      if (!KART_DATA[r.id]) continue;
      for (const a of [r.id, ...r.aliases]) {
        expect(circuitFor(a)?.id, a).toBe(r.id);
        expect(seen.has(a), a).toBe(false);
        seen.set(a, r.id);
      }
    }
    for (const c of CIRCUITS.filter((x) => !x.kart)) expect(seen.has(c.id), c.id).toBe(false);
  });

  for (const c of courses) {
    describe(c.name, () => {
      const t = generateTrack(c.id);
      const info = KART_INFO.get(c.id)!;
      it("is a valid closed loop, with room between roads, smooth joins, a sane lap and its pieces in order", () => {
        expect(checkTrack(t)).toEqual([]);
        expect(t.biome).toBe(c.biome);
        expect(separation(t)).toBeGreaterThan(MIN_GAP);
        t.segments.forEach((s, i) => expect(joinsSmoothly(s, t.segments[(i + 1) % t.segments.length]!), `segment ${i} to ${i + 1}`).toBe(true));
        expect(trackLength(t)).toBeGreaterThan(1200);
        expect(trackLength(t)).toBeLessThan(5000);
        expect(trackLength(generateTrack(c.id))).toBe(trackLength(t));
        expect(KART_THEMES).toContain(info.theme);
        expect(t.circuit?.theme).toBe(info.theme);
        for (const f of info.fx) { expect(f.at).toBeGreaterThanOrEqual(0); expect(f.at + f.len).toBeLessThanOrEqual(1.0001); }
      });
      it("gives the bots a line they can drive, whatever their skill", () => {
        for (const skill of [0.3, 0.7, 1]) expect(validateLine(t, botLine(t, 5, skill)).ok, `skill ${skill}`).toBe(true);
      });
      it("keeps its pit lane inside the map", () => {
        const g = t.segments[0]!.entry;
        const probe = { x: g.mid.x + t.pit.n.x * 60 + t.pit.dir.x * 60, y: g.mid.y + t.pit.n.y * 60 + t.pit.dir.y * 60 };
        expect(probe.x).toBeGreaterThan(0); expect(probe.y).toBeGreaterThan(0);
        expect(probe.x).toBeLessThan(t.cols * 100); expect(probe.y).toBeLessThan(t.rows * 100);
      });
      it("lays its pieces on straight road with straight road after every ramp", () => {
        const ramps = t.segments.filter((s) => s.fx?.some((f) => isRamp(f.type)));
        for (const s of ramps) expect(["straight", "kink"]).toContain(s.kind);
        expect(info.fx.length === 0 || t.segments.some((s) => s.fx)).toBe(true);
      });
      const idx = courses.indexOf(c);
      const ramps = info.fx.some((f) => isRamp(f.type));
      const heavy = process.env.KART_FULL || idx % 8 === 0 || (ramps && idx % 3 === 0);
      (heavy ? it : it.skip)("starts a full grid of 32 and an 8-car race, and every car gets home", () => {
        const es = Array.from({ length: 32 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: { ...defaultCar(), type: "kart" as const }, lines: [botLine(t, 5 + i, 0.4 + (i % 10) / 18)], isPlayer: i === 0 }));
        const r = new Race(t, es, 2, { realism: false });
        r.runToEnd();
        expect(r.results().every((x) => x.finishTime !== null && !x.dnf)).toBe(true);
      }, 120000);
    });
  }
});
