import { describe, expect, it } from "vitest";
import { botLine, buildProfile, defaultCar, generateTrack, golfPar, golfPhrase, golfReference, golfStars, golfTarget, linePoints, placeFor, validateLine } from "@apex/sim";

describe("Line Golf", () => {
  const phrase = golfPhrase("2026-10-18");
  const t = generateTrack(phrase), car = { ...defaultCar(), type: placeFor(phrase).vehicle };
  it("has a course a day, the same for everyone, not the Daily's", () => {
    expect(golfPhrase("2026-10-18")).toBe(phrase);
    expect(golfPhrase("2026-10-19")).not.toBe(phrase);
  });
  it("counts the points placed inside segments, not the joins", () => {
    expect(linePoints({ start: { x: 0, y: 0 }, segs: [[{ x: 1, y: 1 }], [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }]] } as never)).toBe(2);
  });
  it("sets par and the target from a line that can be drawn: it stays on the road, makes the target at par, and a slow line misses", () => {
    for (let d = 1; d <= 6; d++) {
      const ph = golfPhrase(`2026-10-0${d}`), tr = generateTrack(ph), c = { ...defaultCar(), type: placeFor(ph).vehicle };
      const ref = golfReference(tr), target = golfTarget(tr, c);
      expect(validateLine(tr, ref).ok, ph).toBe(true);
      expect(linePoints(ref)).toBe(golfPar(tr));
      expect(buildProfile(tr, ref, c).ideal).toBeLessThan(target);
      expect(buildProfile(tr, botLine(tr, 5, 0.3), c).ideal, ph).toBeGreaterThan(target);
    }
  });
  it("gives par from the shape of the lap, and stars for points against it", () => {
    const par = golfPar(t);
    expect(par).toBeGreaterThan(0);
    expect(golfStars(par, par, true)).toBe(3);
    expect(golfStars(par + 1, par, true)).toBe(par >= 2 ? 2 : 1);
    expect(golfStars(par * 3, par, true)).toBe(1);
    expect(golfStars(0, par, false)).toBe(0);
  });
});
