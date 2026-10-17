import { describe, expect, it } from "vitest";
import { DRAFT_ACCEL, DRAFT_RANGE, DRAFT_TOP, Race, botLine, defaultCar, generateTrack, carStats } from "@apex/sim";

const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });

/** Cars placed by hand on lap 0, on the same line (seg 0 is a straight). */
function lab(spots: { s: number; v: number }[], rules: { realism: boolean; draft?: boolean } = { realism: false }) {
  const es = spots.map((_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 4, 1)], isPlayer: i === 0 }));
  const r = new Race(t, es, 3, rules);
  const any = r as any;
  any.trafficLimit = () => Infinity; // these cars are placed by hand, close together, and not here to be held back
  r.cars.forEach((c, i) => {
    c.lap = 0; c.s = spots[i]!.s; c.v = spots[i]!.v; c.gridOff = 0;
    c.prof = any.profile(c.entrant, 0);
    any.place(c);
  });
  return { r, any, racing: r.cars };
}
const behind = (gap: number, v: number) => lab([{ s: 30, v }, { s: 30 + gap, v }]);

describe("the slipstream", () => {
  it("helps a car tucked in behind another", () => {
    const { r, any, racing } = behind(12, 90);
    expect(any.draft(r.cars[0]!, racing)).toBeGreaterThan(0.3);
  });
  it("does nothing for the car in front, or for one far back, or one beside", () => {
    const { r, any, racing } = behind(12, 90);
    expect(any.draft(r.cars[1]!, racing)).toBe(0);                                    // the leader
    const far = behind(DRAFT_RANGE + 8, 90);
    expect(far.any.draft(far.r.cars[0]!, far.racing)).toBe(0);
    const side = lab([{ s: 30, v: 90 }, { s: 30, v: 90 }]);
    side.r.cars[1]!.off = 12; (side.any as any).place(side.r.cars[1]!);
    expect(side.any.draft(side.r.cars[0]!, side.racing)).toBe(0);
  });
  it("is worth more the closer the car is", () => {
    const d = (gap: number) => { const l = behind(gap, 90); return l.any.draft(l.r.cars[0]!, l.racing); };
    expect(d(8)).toBeGreaterThan(d(20));
    expect(d(20)).toBeGreaterThan(d(38));
    expect(d(38)).toBeGreaterThan(0);
  });
  it("is worth more the faster the follower is going, and nothing when crawling", () => {
    const d = (v: number) => { const l = behind(12, v); return l.any.draft(l.r.cars[0]!, l.racing); };
    expect(d(110)).toBeGreaterThan(d(80));
    expect(d(80)).toBeGreaterThan(d(50));
    expect(d(50)).toBeGreaterThan(d(25));
    expect(d(10)).toBe(0);
  });
  it("never needs realism, and can be switched off", () => {
    const on = lab([{ s: 30, v: 90 }, { s: 42, v: 90 }], { realism: false });
    expect(on.any.draft(on.r.cars[0]!, on.racing)).toBeGreaterThan(0);
    const off = lab([{ s: 30, v: 90 }, { s: 42, v: 90 }], { realism: false, draft: false });
    expect(off.any.draft(off.r.cars[0]!, off.racing)).toBe(0);
    const real = lab([{ s: 30, v: 90 }, { s: 42, v: 90 }], { realism: true });
    expect(real.any.draft(real.r.cars[0]!, real.racing)).toBeGreaterThan(0);
  });
  it("makes the follower pick up speed quicker than the same car on its own", () => {
    const speedAfter = (draft: boolean) => {
      const { r } = lab([{ s: 30, v: 60 }, { s: 46, v: 60 }], { realism: false, draft });
      for (let k = 0; k < 15; k++) { r.step(); r.cars[1]!.v = Math.min(r.cars[1]!.v, 66); }
      return r.cars[0]!.v;
    };
    expect(speedAfter(true)).toBeGreaterThan(speedAfter(false) + 0.1);
  });
  it("lets the follower go a little beyond its own top speed on a straight, not far beyond", () => {
    const st = carStats(defaultCar());
    const { r } = lab([{ s: 5, v: st.vTop * 0.995 }, { s: 19, v: st.vTop * 0.995 }], { realism: false });
    let best = 0;
    for (let k = 0; k < 20; k++) { r.step(); r.cars[1]!.v = Math.min(r.cars[1]!.v, st.vTop * 0.995); best = Math.max(best, r.cars[0]!.v); }
    expect(best).toBeLessThanOrEqual(st.vTop * (1 + DRAFT_TOP) + 0.5);
    expect(DRAFT_ACCEL).toBeGreaterThan(0);
  });
  it("is not given in the bends: a corner-limited speed is not raised", () => {
    const { r } = lab([{ s: 0, v: 0 }, { s: 0, v: 0 }]);
    const c = r.cars[0]!, p = c.prof;
    let at = 0; for (let i = 0; i < p.n; i++) if (p.kap[i]! > p.kap[at]!) at = i;
    c.s = at * p.ds; c.v = p.vLim[at]! * 0.99;
    const lead = r.cars[1]!; lead.s = c.s + 10; lead.v = c.v; (r as any).place(c); (r as any).place(lead);
    (r as any).step();
    expect(c.v).toBeLessThan(p.vLim[at]! * 1.1);
  });
});
