import { describe, expect, it } from "vitest";
import {
  Rng, Race, HARD_GAP, botLine, buildProfile, checkTrack, defaultCar, generateTrack, normalizePhrase, parseLineFile,
  phraseToSeed, randomPhrase, serializeLineFile, validateCar, validateLine, type Entrant,
} from "@apex/sim";

const phrases = (n: number) => Array.from({ length: n }, (_, i) => randomPhrase(new Rng(i + 1)));

describe("seeds", () => {
  it("makes memorable four-word phrases", () => {
    expect(randomPhrase(new Rng(1))).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/);
  });
  it("normalises phrases", () => {
    expect(normalizePhrase("  Healthy Bear  eats_TUNA ")).toBe("healthy-bear-eats-tuna");
    expect(phraseToSeed("Healthy Bear eats tuna")).toBe(phraseToSeed("healthy-bear-eats-tuna"));
  });
});

describe("tracks", () => {
  it("are the same for the same phrase", () => {
    expect(JSON.stringify(generateTrack("healthy-bear-eats-tuna").segments)).toBe(JSON.stringify(generateTrack("Healthy Bear Eats Tuna").segments));
  });
  it("are valid closed loops for 1000 phrases", () => {
    for (const p of phrases(1000)) {
      const t = generateTrack(p);
      expect(checkTrack(t), p).toEqual([]);
    }
  });
});

describe("bots", () => {
  it("draw valid lines on many tracks, at every skill", () => {
    for (const p of phrases(60)) {
      const t = generateTrack(p);
      for (const skill of [0.2, 0.6, 1]) expect(validateLine(t, botLine(t, 7, skill)).ok, `${p} ${skill}`).toBe(true);
    }
  });
  it("sharper cars lap faster with more grip", () => {
    const t = generateTrack("quiet-fox-hugs-kites");
    const line = botLine(t, 1, 1);
    const slow = buildProfile(t, line, { ...defaultCar(), grip: 3 }).ideal;
    const fast = buildProfile(t, line, { ...defaultCar(), grip: 9 }).ideal;
    expect(fast).toBeLessThan(slow);
  });
});

function entrants(t: ReturnType<typeof generateTrack>, n: number): Entrant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, car: defaultCar(), lines: [botLine(t, i + 1, 0.4 + 0.1 * i)], isPlayer: i === 0 }));
}

describe("racing", () => {
  const t = generateTrack("brave-owl-rides-melons");
  it("is deterministic", () => {
    const a = new Race(t, entrants(t, 5), 2); a.runToEnd();
    const b = new Race(t, entrants(t, 5), 2); b.runToEnd();
    expect(a.hash()).toBe(b.hash());
    expect(a.over).toBe(true);
  });
  it("gives every car a time and one winner", () => {
    const r = new Race(t, entrants(t, 8), 2); r.runToEnd();
    const res = r.results();
    expect(res.every((x) => x.finishTime !== null && x.lapTimes.length === 2)).toBe(true);
    expect(res.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("never lets solid cars touch, and never needs the deadlock failsafe", () => {
    let worst = Infinity;
    for (const phrase of phrases(15)) {
      const tr = generateTrack(phrase);
      const r = new Race(tr, entrants(tr, 8), 3);
      while (!r.over) {
        r.step();
        for (let a = 0; a < r.cars.length; a++) for (let b = a + 1; b < r.cars.length; b++) {
          const A = r.cars[a]!, B = r.cars[b]!;
          if (A.finishTime !== null || B.finishTime !== null || A.ghost || B.ghost) continue;
          worst = Math.min(worst, Math.hypot(A.x - B.x, A.y - B.y));
        }
      }
      expect(r.cars.filter((c) => c.freeUntil > 0), phrase).toEqual([]);
    }
    expect(worst).toBeGreaterThanOrEqual(HARD_GAP - 0.1);
  });
  it("gives the same car a different time against different rivals", () => {
    const solo = new Race(t, entrants(t, 1), 2); solo.runToEnd();
    const crowd = new Race(t, entrants(t, 8), 2); crowd.runToEnd();
    const me = (r: Race) => r.results().find((x) => x.id === "b0")!.finishTime!;
    expect(me(crowd)).not.toBeCloseTo(me(solo), 1);
  });
});

describe("line files and cars", () => {
  it("round trip", () => {
    const t = generateTrack("quiet-fox-hugs-kites");
    const f = { phrase: t.phrase, name: "me", car: defaultCar(), lines: [botLine(t, 1, 1)] };
    const back = parseLineFile(serializeLineFile(f));
    expect(typeof back).toBe("object");
    if (typeof back === "string") return;
    expect(back.phrase).toBe(t.phrase);
    expect(validateLine(t, back.lines[0]!).ok).toBe(true);
  });
  it("rejects garbage and overspent cars", () => {
    expect(typeof parseLineFile("{")).toBe("string");
    expect(validateCar({ name: "x", accel: 10, top: 10, grip: 10, brake: 10 })).toMatch(/budget/);
  });
});

describe("bot lines", () => {
  it("never reverse direction (a tight bend is fine, a cusp is not)", () => {
    for (const p of phrases(40)) {
      const t = generateTrack(p);
      const prof = buildProfile(t, botLine(t, 3, 0.9), defaultCar());
      let worst = 0;
      for (let i = 0; i < prof.n; i++) {
        let d = Math.abs(prof.h[(i + 1) % prof.n]! - prof.h[i]!);
        if (d > Math.PI) d = 2 * Math.PI - d;
        worst = Math.max(worst, d);
      }
      expect(worst, p).toBeLessThan(1.2);
    }
  });
});
