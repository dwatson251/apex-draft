import { describe, expect, it } from "vitest";
import { CIRCUITS, Race, ROAD_HALF, botLine, centreAt, checkTrack, defaultCar, generateTrack, randomPhrase, Rng, trackLength, type Segment } from "@apex/sim";

const MIN_GAP = 2 * ROAD_HALF + 4 - 0.5;

function separation(t: ReturnType<typeof generateTrack>): number {
  const n = t.segments.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    for (const p of t.segments[i]!.center) for (const q of t.segments[j]!.center) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return best;
}

/** The gates meet, face the same way, and the road at each end heads roughly the way the gate says. */
function joinsSmoothly(a: Segment, b: Segment): boolean {
  if (Math.hypot(a.exit.mid.x - b.entry.mid.x, a.exit.mid.y - b.entry.mid.y) > 1e-6) return false;
  if (a.exit.dir.x * b.entry.dir.x + a.exit.dir.y * b.entry.dir.y < 0.999) return false;
  const ea = a.center.at(-1)!, pa = a.center.at(-2)!;
  const d = { x: ea.x - pa.x, y: ea.y - pa.y };
  return (d.x * a.exit.dir.x + d.y * a.exit.dir.y) / Math.hypot(d.x, d.y) > 0.8;
}

describe("hidden circuits", () => {
  it("are named by their phrase, however it is typed", () => {
    expect(generateTrack("Donington Park").circuit?.id).toBe("donington-park");
    expect(generateTrack("  OVAL ").circuit?.id).toBe("oval");
    expect(generateTrack("daytona").circuit?.name).toBe("Daytona");
    expect(generateTrack("Willow_Springs!").circuit?.id).toBe("willow-springs");
    expect(generateTrack("big willow").circuit?.id).toBe("willow-springs");
  });

  it("are never found by a random phrase", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) expect(generateTrack(randomPhrase(rng)).circuit).toBeUndefined();
  });

  for (const c of CIRCUITS) {
    describe(c.name, () => {
      const t = generateTrack(c.id);
      it("is a valid closed loop with a straight start line, a fixed setting and room between roads", () => {
        expect(checkTrack(t)).toEqual([]);
        expect(t.segments.length).toBe(c.cells.length);
        expect(t.biome).toBe(c.biome);
        expect(separation(t)).toBeGreaterThan(MIN_GAP);
      });
      it("joins every segment to the next without a kink in the heading", () => {
        t.segments.forEach((s, i) => expect(joinsSmoothly(s, t.segments[(i + 1) % t.segments.length]!), `segment ${i} to ${i + 1}`).toBe(true));
      });
      it("keeps its pit lane beside the start straight clear of the road", () => {
        const g = t.segments[0]!.entry;
        const probe = { x: g.mid.x + t.pit.n.x * 60 + t.pit.dir.x * 60, y: g.mid.y + t.pit.n.y * 60 + t.pit.dir.y * 60 };
        expect(probe.x).toBeGreaterThan(0);
        expect(probe.y).toBeGreaterThan(0);
        expect(probe.x).toBeLessThan(t.cols * 100);
        expect(probe.y).toBeLessThan(t.rows * 100);
      });
      it("gives the same track every time and a sane lap", () => {
        expect(trackLength(generateTrack(c.id))).toBe(trackLength(t));
        expect(trackLength(t)).toBeGreaterThan(1200);
        expect(trackLength(t)).toBeLessThan(3200);
      });
      it("runs an 8-car race to the flag with every car finishing", () => {
        const es = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 2 + (i % 4), 1)], isPlayer: false }));
        const r = new Race(t, es, 3, { realism: false });
        r.runToEnd();
        const res = r.results();
        expect(res).toHaveLength(8);
        expect(res.every((x) => x.finishTime !== null && x.lapTimes.length === 3)).toBe(true);
      });
    });
  }
});

describe("the new pieces in random tracks", () => {
  const rng = new Rng(11);
  const phrases = Array.from({ length: 400 }, () => randomPhrase(rng));
  it("keep every track valid, with room between roads and smooth joins", () => {
    for (const p of phrases) {
      const t = generateTrack(p);
      expect(checkTrack(t), p).toEqual([]);
      expect(separation(t), p).toBeGreaterThan(MIN_GAP);
      t.segments.forEach((s, i) => expect(joinsSmoothly(s, t.segments[(i + 1) % t.segments.length]!), `${p} ${i}`).toBe(true));
    }
  });
  it("turn up, and never on the start straights", () => {
    const seen = new Set<string>();
    for (const p of phrases) {
      const t = generateTrack(p);
      t.segments.forEach((s) => seen.add(s.kind));
      expect(t.segments[0]!.kind).toBe("straight");
      expect(t.segments.at(-1)!.kind).toBe("straight");
    }
    for (const k of ["kink", "chicane", "sweeper", "uturn"]) expect(seen.has(k), k).toBe(true);
  });
  it("leave the layout of the cells exactly as it was", () => {
    for (const p of phrases.slice(0, 80)) {
      const a = generateTrack(p), b = generateTrack(p, { pieces: false });
      expect(a.segments.map((s) => [s.cx, s.cy])).toEqual(b.segments.map((s) => [s.cx, s.cy]));
      expect(a.pit.side).toBe(b.pit.side);
    }
  });
  it("keep centre lines within reach of their own cell", () => {
    for (const p of phrases.slice(0, 80)) {
      for (const s of generateTrack(p).segments) {
        const c = centreAt(s, 0.5).p;
        expect(Math.abs(c.x - (s.cx + 0.5) * 100)).toBeLessThan(120);
        expect(Math.abs(c.y - (s.cy + 0.5) * 100)).toBeLessThan(120);
      }
    }
  });
});
