import { describe, expect, it } from "vitest";
import { Rng, estimateTime, generateTrack, randomPhrase, ROAD_HALF, type Segment, type Track } from "@apex/sim";
import { pinchSegment } from "../packages/sim/src/width.ts";

const funPhrases = (n: number, seed = 31) => { const r = new Rng(seed); return Array.from({ length: n }, () => `fun-${randomPhrase(r)}`); };
const ringOf = (t: Track, i: number, j: number): Segment[] => t.segments.slice(i, j + 1);

describe("splits in fun tracks", () => {
  const tracks = funPhrases(40).map((p) => generateTrack(p));
  it("almost every fun track has a shortcut in it", () => {
    expect(tracks.filter((t) => t.branches.length > 0).length).toBeGreaterThanOrEqual(36);
  });
  it("mark the cell where the road splits and the cell where it comes together as pieces of their own", () => {
    for (const t of tracks) for (const b of t.branches) {
      const F = t.segments[b.fork]!, R = t.segments[b.rejoin]!, first = t.allSegments[b.segs[0]!]!, last = t.allSegments[b.segs.at(-1)!]!;
      expect([F.kind, first.kind], t.phrase).toEqual(["fork", "fork"]);
      expect([R.kind, last.kind], t.phrase).toEqual(["merge", "merge"]);
      // and nothing else is a fork or a merge
      expect(t.allSegments.filter((s) => s.kind === "fork").length).toBe(2 * t.branches.length);
      expect(t.allSegments.filter((s) => s.kind === "merge").length).toBe(2 * t.branches.length);
    }
  });
  it("are a real decision: the shortcut is shorter in distance, but a driver would not always take it, or never", () => {
    for (const t of tracks) for (const b of t.branches) {
      const ring = ringOf(t, b.fork, b.rejoin), short = b.segs.map((id) => t.allSegments[id]!);
      const ratio = estimateTime(short, 80, 0) / estimateTime(ring, 80, 0);
      const avoidsCrossing = ring.some((s) => s.kind === "cross");
      expect(ratio, t.phrase).toBeGreaterThanOrEqual(avoidsCrossing ? 0.6 : 0.72);
      expect(ratio, t.phrase).toBeLessThanOrEqual(1.21);
    }
  });
});

describe("estimateTime", () => {
  const t = generateTrack("quiet-fox-hugs-kites");
  const straight = t.segments.find((s, i) => s.kind === "straight" && i > 1)!;
  it("is the time a straight takes at about the speed a car has there, and more for the same road with a bottleneck in it", () => {
    const s = estimateTime([straight]);
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(2);
    const copy: Segment = { ...straight, obstacles: [] };
    pinchSegment(copy, 9);
    expect(estimateTime([copy])).toBeGreaterThan(s);
    expect(ROAD_HALF).toBeGreaterThan(9);
  });
  it("puts a hairpin behind a sweeper, and counts a crossing as a cost", () => {
    const sweeper = t.segments.find((s) => s.kind === "sweeper"), corner = t.segments.find((s) => s.kind === "sharp");
    if (sweeper && corner) expect(estimateTime([corner])).toBeGreaterThan(estimateTime([sweeper]) * 0.9);
    const cross = { ...straight, kind: "cross" as const };
    expect(estimateTime([cross])).toBeGreaterThan(estimateTime([straight]));
  });
});
