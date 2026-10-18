import { describe, expect, it } from "vitest";
import { botLine, buildProfile, defaultCar, generateTrack, makeBots, placeFor, validateLine, type Profile } from "@apex/sim";

/** How far apart two lines run on average: from points along one to the nearest point of the other. */
const apart = (a: Profile, b: Profile): number => {
  let tot = 0, n = 0;
  for (let i = 0; i < a.n; i += 10) { let best = Infinity; for (let j = 0; j < b.n; j += 2) best = Math.min(best, Math.hypot(a.x[i]! - b.x[j]!, a.y[i]! - b.y[j]!)); tot += best; n++; }
  return tot / n;
};

describe("computer drivers' own styles", () => {
  for (const phrase of ["silverstone", "quiet-fox-hugs-kites"]) {
    it(`spread the field over the road on ${phrase}, and cost a good driver little`, () => {
      const t = generateTrack(phrase), car = { ...defaultCar(), type: placeFor(phrase).vehicle };
      const field = (vary: number) => Array.from({ length: 6 }, (_, i) => { const l = botLine(t, 1000 + i * 7919, 0.65 + 0.06 * i, { vary }); expect(validateLine(t, l).ok).toBe(true); return buildProfile(t, l, car); });
      const spread = (ps: Profile[]) => { let s = 0, n = 0; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { s += apart(ps[i]!, ps[j]!); n++; } return s / n; };
      const plain = field(0), styled = field(1);
      expect(spread(styled)).toBeGreaterThan(2 * spread(plain));
      const best = buildProfile(t, botLine(t, 5, 1), car).ideal;
      expect(styled.reduce((a, p) => a + p.ideal, 0) / styled.length / best).toBeLessThan(1.04);
    }, 60000);
  }
  it("are the same every time, and leave a reference line exact", () => {
    const t = generateTrack("brave-owl-rides-melons");
    expect(botLine(t, 42, 0.8, { vary: 1 })).toEqual(botLine(t, 42, 0.8, { vary: 1 }));
    expect(botLine(t, 42, 0.8)).toEqual(botLine(t, 42, 0.8, { vary: 0 }));
    expect(botLine(t, 42, 0.8, { vary: 1 })).not.toEqual(botLine(t, 42, 0.8));
    // and the rivals a race is given are styled
    const [b] = makeBots(t, placeFor("brave-owl-rides-melons").vehicle, 0, 1, "hard");
    expect(b!.lines[0]).toEqual(botLine(t, b!.bot!.seed, b!.bot!.skill, { vary: 1 }));
  });
});
