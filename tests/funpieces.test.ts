import { describe, expect, it } from "vitest";
import { Race, checkTrack, generateTrack, makeBots, isRamp, type FxType } from "@apex/sim";

const phrases = Array.from({ length: 160 }, (_, i) => `fun-quiet-fox-${i}-hugs`);

describe("fun-track pieces", () => {
  const tracks = phrases.map((p) => generateTrack(p, { obstacles: false }));

  it("lays every kind of piece on some fun tracks", () => {
    const seen = new Set<FxType>();
    for (const t of tracks) for (const s of t.segments) for (const f of s.fx ?? []) seen.add(f.type);
    for (const k of ["jump", "glide", "boost", "ice", "sand", "mud", "water"] as FxType[]) expect(seen.has(k), k).toBe(true);
  });

  it("keeps every fun track valid, with at most one piece to a segment and none by the pit straight", () => {
    for (const [i, t] of tracks.entries()) {
      expect(checkTrack(t), phrases[i]).toEqual([]);
      const n = t.segments.length;
      for (const s of t.segments) {
        expect((s.fx ?? []).length).toBeLessThanOrEqual(1);
        if (s.fx) expect(s.index >= 2 && s.index <= n - 3).toBe(true);
      }
    }
  });

  it("changes nothing about the layout", () => {
    for (const p of phrases.slice(0, 60)) {
      const a = generateTrack(p), b = generateTrack(p, { fx: false });
      expect(a.segments.map((s) => [s.kind, s.center, s.half])).toEqual(b.segments.map((s) => [s.kind, s.center, s.half]));
      expect(b.segments.every((s) => !s.fx)).toBe(true);
    }
  });

  it("is the same for the same phrase, and leaves ordinary tracks alone", () => {
    for (const p of phrases.slice(0, 20)) {
      const a = generateTrack(p), b = generateTrack(p);
      expect(JSON.stringify(a.segments.map((s) => s.fx))).toBe(JSON.stringify(b.segments.map((s) => s.fx)));
    }
    for (let i = 0; i < 80; i++) expect(generateTrack(`quiet-fox-${i}-hugs`).allSegments.every((s) => !s.fx)).toBe(true);
    for (const id of ["monza", "oval", "demolition-derby"]) expect(generateTrack(id).allSegments.every((s) => !s.fx)).toBe(true);
  });

  it("races on a fun track with ramps to the flag", () => {
    const p = phrases.find((_, i) => tracks[i]!.segments.some((s) => s.fx?.some((f) => isRamp(f.type))))!;
    const t = generateTrack(p, { obstacles: false });
    const bots = makeBots(t, "rally", 0, 12);
    const r = new Race(t, bots, 2, { realism: false });
    r.runToEnd();
    expect(r.results().filter((x) => x.rawTime !== null).length).toBe(12);
  }, 120000);
});
