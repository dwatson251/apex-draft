import { describe, expect, it } from "vitest";
import { CAREER_TIERS, PROMOTE_PLACE, finishSeason, newCareer, normaliseCareer, placeFor, startSeason } from "@apex/sim";

describe("the career", () => {
  it("starts in karts with a season of tracks that all offer the rung's machine", () => {
    for (let tier = 0; tier < CAREER_TIERS.length; tier++) {
      const c = startSeason({ ...newCareer(), tier }, 1234 + tier);
      const t = CAREER_TIERS[tier]!;
      expect(c.current!.vehicle).toBe(t.vehicle);
      expect(c.current!.rounds.length, t.id).toBeGreaterThanOrEqual(3);
      for (const p of c.current!.rounds) expect(placeFor(p).choices, `${t.id} ${p}`).toContain(t.vehicle);
    }
  });
  it("moves up a rung for a top-three season, and runs the rung again otherwise", () => {
    let c = startSeason(newCareer(), 1);
    c = finishSeason(c, PROMOTE_PLACE + 1);
    expect(c.tier).toBe(0); expect(c.best[0]).toBe(PROMOTE_PLACE + 1);
    c = finishSeason(startSeason(c, 2), 1);
    expect(c.tier).toBe(1); expect(c.best[0]).toBe(1); expect(c.current).toBeNull(); expect(c.seasons).toBe(2);
    let top = { ...newCareer(), tier: CAREER_TIERS.length - 1 };
    top = finishSeason(startSeason(top, 3), 1);
    expect(top.tier).toBe(CAREER_TIERS.length - 1);
  });
  it("survives a save that went wrong", () => {
    expect(normaliseCareer(null).tier).toBe(0);
    expect(normaliseCareer({ v: 1, tier: 99, best: ["x"] }).tier).toBe(CAREER_TIERS.length - 1);
    const c = startSeason(newCareer(), 5);
    expect(normaliseCareer(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });
});
