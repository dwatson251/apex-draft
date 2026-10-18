import { describe, expect, it } from "vitest";
import { BEAM_CAR_LEN, beamBlock, type BeamCar } from "../src/renderer/beams.ts";

const car = (x: number, y: number, lift = 0, visible = true): BeamCar => ({ root: { x, y, visible }, lift });
// the lamps at the origin, pointing along +x (left is +y)
const hit = (self: BeamCar, others: BeamCar[]) => beamBlock(self, others, 0, 0, 1, 0, 0, 1);

describe("headlights are masked by a car in front", () => {
  const me = car(-4, 0);
  it("stop at the tail of a car ahead in the beam", () => {
    const b = hit(me, [car(20, 0.5)]);
    expect(b).not.toBeNull();
    expect(b!.d).toBeCloseTo(20 - BEAM_CAR_LEN / 2, 6);
    expect(b!.lat).toBeCloseTo(0.5, 6);
  });
  it("are not blocked by a car beside, behind, far ahead or out to the side of the beam", () => {
    expect(hit(me, [car(5, 14)])).toBeNull(); // alongside, well off to the side
    expect(hit(me, [car(-20, 0)])).toBeNull(); // behind
    expect(hit(me, [car(90, 0)])).toBeNull(); // beyond the reach
    expect(hit(me, [car(30, 30)])).toBeNull(); // far outside the cone
  });
  it("go over a car that is in the air, and a car in the air shines over everything", () => {
    expect(hit(me, [car(20, 0, 0.5)])).toBeNull();
    expect(hit(car(-4, 0, 0.5), [car(20, 0)])).toBeNull();
  });
  it("ignore the car itself and cars that are hidden", () => {
    expect(hit(me, [me])).toBeNull();
    expect(hit(me, [car(20, 0, 0, false)])).toBeNull();
  });
  it("are stopped by the nearest of several cars", () => {
    const b = hit(me, [car(35, 0), car(15, 1), car(25, -1)]);
    expect(b!.d).toBeCloseTo(15 - BEAM_CAR_LEN / 2, 6);
  });
  it("catch a car at the edge of the cone only when it is within the cone's width at that distance", () => {
    // 20 ahead the cone is 11 * 20 / 40 = 5.5 either side, plus the car's own half width 2.6
    expect(hit(me, [car(20, 8)])).not.toBeNull();
    expect(hit(me, [car(20, 8.3)])).toBeNull();
    // close in the cone is narrow
    expect(hit(me, [car(8, 5)])).toBeNull();
  });
});
