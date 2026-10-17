import { describe, expect, it } from "vitest";
import { Race, bestPlace, cachedTrack, highestUnlocked, isUnlocked, makeBots, normaliseRecords, recordFinish, recordKey, starsFor, type Records } from "@apex/sim";

describe("records and unlocks", () => {
  const k = recordKey("  Alpha  Beta ", "kart");
  it("keys ignore case and spacing", () => expect(k).toBe("alpha beta:kart"));
  it("only easy is open at the start", () => {
    expect(isUnlocked("easy", {})).toBe(true);
    expect(isUnlocked("medium", {})).toBe(false);
    expect(isUnlocked("hard", {})).toBe(false);
    expect(highestUnlocked({})).toBe("easy");
  });
  it("a win opens the next one, a podium does not", () => {
    let r: Records = recordFinish({}, k, "easy", 2);
    expect(isUnlocked("medium", r)).toBe(false);
    r = recordFinish(r, "other:kart", "easy", 1);
    expect(isUnlocked("medium", r)).toBe(true);
    expect(isUnlocked("hard", r)).toBe(false);
    r = recordFinish(r, k, "medium", 1);
    expect(isUnlocked("hard", r)).toBe(true);
    expect(highestUnlocked(r)).toBe("hard");
  });
  it("keeps the best place and the most stars", () => {
    let r = recordFinish({}, k, "easy", 4);
    r = recordFinish(r, k, "easy", 6);
    expect(r[k]!.easy).toBe(4);
    r = recordFinish(r, k, "easy", 1);
    expect(starsFor(r, k)).toBe(1);
    r = recordFinish(r, k, "hard", 5);
    expect(starsFor(r, k)).toBe(3);
    expect(bestPlace(r, k)).toBe(1);
    expect(bestPlace(r, "nope")).toBeNull();
  });
  it("drops junk from storage", () => {
    expect(normaliseRecords({ a: { easy: 1, medium: "x", hard: 0 }, b: 3, c: {} })).toEqual({ a: { easy: 1 } });
    expect(normaliseRecords(null)).toEqual({});
  });
});

describe("rival difficulty", () => {
  const track = cachedTrack("difficulty test");
  const meanTime = (d: "easy" | "medium" | "hard") => {
    const race = new Race(track, makeBots(track, "kart", 0, 5, d), 2, { realism: false, weather: false });
    race.runToEnd();
    const t = race.results().map((r) => r.finishTime!);
    return t.reduce((a, b) => a + b, 0) / t.length;
  };
  it("is slower the easier it is, near 66, 80 and 100 percent of the hard pace", () => {
    const e = meanTime("easy"), m = meanTime("medium"), h = meanTime("hard");
    expect(h / e).toBeGreaterThan(0.58); expect(h / e).toBeLessThan(0.74);
    expect(h / m).toBeGreaterThan(0.72); expect(h / m).toBeLessThan(0.88);
  });
  it("is the same every time, and hard is the field it has always been", () => {
    expect(makeBots(track, "kart", 0, 4, "easy")).toEqual(makeBots(track, "kart", 0, 4, "easy"));
    expect(makeBots(track, "kart", 0, 4)).toEqual(makeBots(track, "kart", 0, 4, "hard"));
    expect(makeBots(track, "kart", 0, 4, "hard").every((b) => b.pace === undefined)).toBe(true);
  });
  it("varies between rivals, even on hard", () => {
    const s = makeBots(track, "kart", 0, 7, "hard").map((b) => b.bot!.skill);
    expect(Math.max(...s) - Math.min(...s)).toBeGreaterThan(0.05);
  });
});
