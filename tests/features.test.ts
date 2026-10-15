import { describe, expect, it } from "vitest";
import {
  CIRCUITS, Race, Rng, badSegments, beginLine, botLine, checkTrack, completeLine, defaultCar, drawSegment, generateTrack, isComplete, lapCurve,
  randomPhrase, setSegment, validateLine, type Entrant, type Line, type Track,
} from "@apex/sim";

const phrases = (n: number, seed = 1) => Array.from({ length: n }, (_, i) => randomPhrase(new Rng(i + seed)));

describe("chicanes", () => {
  const halves = (t: Track) => t.segments.flatMap((s, i) => (s.kind === "chicaneA" || s.kind === "chicaneB" ? [i] : []));
  const paired = (t: Track) => {
    const n = t.segments.length;
    return t.segments.every((s, i) => (s.kind === "chicaneA" ? t.segments[(i + 1) % n]!.kind === "chicaneB" : s.kind === "chicaneB" ? t.segments[(i + n - 1) % n]!.kind === "chicaneA" : true));
  };
  it("are two cells, one after the other, on random tracks", () => {
    let seen = 0;
    for (const p of phrases(300, 40)) {
      const t = generateTrack(p);
      expect(paired(t), p).toBe(true);
      seen += halves(t).length;
    }
    expect(seen).toBeGreaterThan(40);
  });
  it("are two cells, one after the other, on every circuit, and the halves swing opposite ways", () => {
    for (const c of CIRCUITS) {
      const t = generateTrack(c.id);
      expect(paired(t), c.id).toBe(true);
      t.segments.forEach((s, i) => {
        if (s.kind !== "chicaneA") return;
        const mid = (q: Track["segments"][number]) => { const m = q.center[12]!, a = q.entry.mid, b = q.exit.mid; return (m.x - (a.x + b.x) / 2) * q.normals[12]!.x + (m.y - (a.y + b.y) / 2) * q.normals[12]!.y; };
        expect(Math.sign(mid(s)), `${c.id} ${i}`).toBe(-Math.sign(mid(t.segments[i + 1]!)));
      });
    }
  });
});

describe("random tracks", () => {
  it("are mostly straights and fast bends, with the corners the exception", () => {
    let cells = 0, tight = 0;
    for (const p of phrases(200, 900)) {
      const t = generateTrack(p);
      for (const s of t.segments) { cells++; if (s.kind === "corner" || s.kind === "sharp") tight++; }
    }
    expect(tight / cells).toBeLessThan(0.3);
  });
  it("still have hairpins, tight 90s, sweepers and technical sections", () => {
    const seen = new Set<string>();
    for (const p of phrases(200, 900)) for (const s of generateTrack(p).segments) seen.add(s.kind);
    for (const k of ["sharp", "corner", "sweeper", "uturn", "kink", "esses", "chicaneA"]) expect(seen.has(k), k).toBe(true);
  });
  it("never contain a crossroads", () => {
    for (const p of phrases(400, 5)) expect(generateTrack(p).segments.some((s) => s.kind === "cross"), p).toBe(false);
  });
});

describe("the demolition derby", () => {
  const t = generateTrack("demolition-derby");
  const crossings = () => {
    const by = new Map<string, number[]>();
    t.segments.forEach((s, i) => { if (s.kind === "cross") by.set(`${s.cx},${s.cy}`, [...(by.get(`${s.cx},${s.cy}`) ?? []), i]); });
    return [...by.values()].filter((v) => v.length === 2);
  };
  it("crosses itself at least twice, each time with the two roads at right angles", () => {
    const x = crossings();
    expect(x.length).toBeGreaterThanOrEqual(2);
    for (const [a, b] of x) {
      const da = t.segments[a!]!.entry.dir, db = t.segments[b!]!.entry.dir;
      expect(da.x * db.x + da.y * db.y).toBeCloseTo(0, 6);
    }
    expect(checkTrack(t)).toEqual([]);
  });
  it("has road under a car in both directions at the junction", () => {
    for (const [a, b] of crossings()) {
      const c = t.segments[a!]!.center[12]!;
      expect(t.cellSegments.get(`${t.segments[a!]!.cx},${t.segments[a!]!.cy}`)).toEqual([a, b]);
      expect(c.x).toBeCloseTo(t.segments[b!]!.center[12]!.x, 3);
      expect(c.y).toBeCloseTo(t.segments[b!]!.center[12]!.y, 3);
    }
  });
  it("gets a field of cars round, crossing each other's path, without anyone stopping for good", () => {
    const es: Entrant[] = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 4 + i, 0.8)], isPlayer: i === 0 }));
    const r = new Race(t, es, 3, { realism: false });
    r.runToEnd();
    expect(r.results().every((x) => x.finishTime !== null && x.lapTimes.length === 3)).toBe(true);
  });
});

describe("the bots' lines", () => {
  const weave = (t: Track, line: Line) => {
    const c = lapCurve(line, t.segments.length).map((d) => d.p);
    let flips = 0, last = 0;
    const step = 6;
    for (let k = step; k + step < c.length; k += step) {
      const cr = (c[k]!.x - c[k - step]!.x) * (c[k + step]!.y - c[k]!.y) - (c[k]!.y - c[k - step]!.y) * (c[k + step]!.x - c[k]!.x);
      const sg = Math.abs(cr) < 8 ? 0 : Math.sign(cr);
      if (sg !== 0) { if (last !== 0 && sg !== last) flips++; last = sg; }
    }
    return flips;
  };
  it("do not weave, whatever the skill", () => {
    for (const p of phrases(25, 700)) {
      const t = generateTrack(p);
      for (const skill of [0.2, 0.6, 1]) {
        const line = botLine(t, 5, skill);
        expect(validateLine(t, line).ok, `${p} ${skill}`).toBe(true);
        expect(weave(t, line), `${p} ${skill}`).toBeLessThan(14);
      }
    }
  });
  it("are barely slower for a worse driver than for the best one, so the field races", () => {
    const t = generateTrack("brave-owl-rides-melons");
    const lap = (skill: number) => { const r = new Race(t, [{ id: "x", name: "x", car: defaultCar(), lines: [botLine(t, 9, skill)], isPlayer: true }], 2, { realism: false }); r.runToEnd(); return r.results()[0]!.lapTimes[1]!; };
    expect(lap(0.6) / lap(1)).toBeLessThan(1.08);
  });
});

describe("finish track for me", () => {
  const t = generateTrack("brave-owl-rides-melons");
  const guide = botLine(t, 99, 0.9);
  const partial = (k: number): Line => {
    let line = beginLine(t, guide.start);
    for (let i = 0; i < k; i++) line = setSegment(line, i, guide.segs[i]!.slice(0, -1), guide.segs[i]!.at(-1)!, true);
    return line;
  };
  it("draws a whole valid lap from nothing", () => {
    const line = completeLine(t, null);
    expect(isComplete(t, line)).toBe(true);
    expect(validateLine(t, line).ok).toBe(true);
  });
  it("keeps the segments already drawn and draws the rest", () => {
    const p = partial(4);
    const line = completeLine(t, p);
    expect(validateLine(t, line).ok).toBe(true);
    expect(line.start).toEqual(p.start);
    for (let i = 0; i < 4; i++) expect(line.segs[i]).toEqual(p.segs[i]);
  });
  it("repairs a drawn segment that leaves the road", () => {
    const p = partial(5);
    const s = p.segs[2]!;
    p.segs[2] = [...s.slice(0, -2), { x: s[0]!.x + 90, y: s[0]!.y + 90 }, s.at(-1)!];
    expect(badSegments(t, p)).toContain(2);
    const line = completeLine(t, p);
    expect(validateLine(t, line).ok).toBe(true);
    expect(badSegments(t, line)).toEqual([]);
  });
  it("completes a lap on tracks of every shape, from any point", () => {
    for (const ph of phrases(12, 33)) {
      const tr = generateTrack(ph);
      const g = botLine(tr, 99, 0.9);
      for (const k of [0, 1, Math.floor(tr.segments.length / 2)]) {
        let part = beginLine(tr, g.start);
        for (let i = 0; i < k; i++) part = drawSegment(tr, part, i, g.segs[i]!);
        const line = completeLine(tr, k ? part : null);
        expect(validateLine(tr, line).ok, `${ph} ${k}`).toBe(true);
      }
    }
  });
});
