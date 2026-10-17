import { describe, expect, it } from "vitest";
import { COMPOUNDS, QUIRKS, Race, TACTIC_INFO, TEMP_START, botLine, buildProfile, cachedTrack, cornerCap, defaultCar, makeBots, tempGrip, tyreGrip, type Entrant } from "@apex/sim";

const solo = (phrase: string, over: Partial<Entrant> = {}, laps = 3, rules = { realism: true, weather: false }): Race => {
  const t = cachedTrack(phrase);
  const me: Entrant = { id: "me", name: "Me", car: defaultCar(), lines: [botLine(t, 5, 1)], isPlayer: true, startTyre: "medium", gridSlot: 0, ...over };
  const r = new Race(t, [me], laps, rules);
  r.runToEnd();
  return r;
};

describe("tyre temperature", () => {
  it("is best inside a compound's window and loses a little outside it", () => {
    for (const c of ["soft", "medium", "wet"] as const) {
      const [lo, hi] = COMPOUNDS[c].window;
      expect(tempGrip(c, (lo + hi) / 2)).toBe(1);
      expect(tempGrip(c, lo - 0.3)).toBeLessThan(1);
      expect(tempGrip(c, hi + 0.3)).toBeLessThan(1);
      expect(tempGrip(c, lo - 0.3)).toBeGreaterThan(0.9);
    }
  });
  it("rubber helps the dry road and only that", () => {
    expect(tyreGrip("medium", 0, 0, 1)).toBeGreaterThan(tyreGrip("medium", 0, 0, 0));
    expect(tyreGrip("medium", 0.9, 0, 1)).toBe(tyreGrip("medium", 0.9, 0, 0));
  });
  it("warms from cold and stays in a sensible range over a race", () => {
    const c = solo("alpha").cars[0]!;
    expect(c.tmtrace[0]).toBe(TEMP_START);
    const hot = Math.max(...c.tmtrace), cold = Math.min(...c.tmtrace);
    expect(hot).toBeLessThan(1); expect(cold).toBeGreaterThan(0.2);
    expect(hot).toBeGreaterThan(c.tmtrace[0]!);
  });
  it("is not touched when tyres are not in play", () => {
    const c = solo("alpha", {}, 2, { realism: false, weather: false }).cars[0]!;
    expect(new Set(c.tmtrace).size).toBe(1);
  });
});

describe("tactics", () => {
  const pace = (tactic: "attack" | "balanced" | "defend") => solo("alpha", { startTactic: tactic }, 3).results()[0]!;
  it("attack is quicker, defend slower", () => {
    const a = pace("attack"), b = pace("balanced"), d = pace("defend");
    expect(a.finishTime!).toBeLessThan(b.finishTime!);
    expect(d.finishTime!).toBeGreaterThan(b.finishTime!);
  });
  it("attack wears the tyres and burns the fuel faster, and runs hotter", () => {
    const a = solo("alpha", { startTactic: "attack" }, 3).cars[0]!, d = solo("alpha", { startTactic: "defend" }, 3).cars[0]!;
    expect(a.tyre).toBeLessThan(d.tyre);
    expect(a.fuel).toBeLessThan(d.fuel);
    expect(Math.max(...a.tmtrace)).toBeGreaterThan(Math.max(...d.tmtrace));
    expect(TACTIC_INFO.attack.wear).toBeGreaterThan(TACTIC_INFO.defend.wear);
  });
  it("changes at a pit stop and not before", () => {
    const r = solo("alpha", { startTactic: "defend", pitPlan: [{ lap: 1, tyre: "soft", tactic: "attack" }] }, 5);
    expect(r.cars[0]!.tactic).toBe("attack");
    expect(r.cars[0]!.pits).toBe(1);
    expect(solo("alpha", { startTactic: "defend" }, 3).cars[0]!.tactic).toBe("defend");
  });
});

describe("dirty air", () => {
  it("costs a car following closely through bends, and never helps", () => {
    const t = cachedTrack("alpha");
    const mk = (id: string, gap: number): Entrant => ({ id, name: id, car: defaultCar(), lines: [botLine(t, 5, 1)], gridSlot: gap });
    const withTraffic = new Race(t, [mk("a", 0), mk("b", 1)], 3, { realism: false, weather: false });
    withTraffic.runToEnd();
    const alone = new Race(t, [mk("b", 0)], 3, { realism: false, weather: false });
    alone.runToEnd();
    const b = withTraffic.results().find((r) => r.id === "b")!, c = alone.results()[0]!;
    expect(b.finishTime!).toBeGreaterThanOrEqual(c.finishTime! - 1); // never faster than alone, bar the draft on the straights
  });
});

describe("vehicle quirks", () => {
  const t = cachedTrack("river bend");
  const line = botLine(t, 5, 1);
  const ideal = (type: string, on: boolean) => {
    const saved = { ...QUIRKS };
    if (!on) for (const k of Object.keys(QUIRKS)) delete (QUIRKS as Record<string, unknown>)[k];
    try { return buildProfile(t, line, { ...defaultCar(), type: type as never }).ideal; } finally { Object.assign(QUIRKS, saved); }
  };
  it("downforce makes a formula car and a prototype quicker round a lap", () => {
    expect(ideal("formula", true)).toBeLessThan(ideal("formula", false));
    expect(ideal("prototype", true)).toBeLessThan(ideal("prototype", false));
  });
  it("weight transfer makes heavy machines slower into bends", () => {
    expect(ideal("truck", true)).toBeGreaterThan(ideal("truck", false));
    expect(ideal("muscle", true)).toBeGreaterThan(ideal("muscle", false));
  });
  it("leaves machines without quirks exactly as they were", () => {
    expect(ideal("kart", true)).toBe(ideal("kart", false));
    expect(cornerCap("kart", 100, 80)).toBe(100);
    expect(cornerCap("formula", 100, 80)).toBeGreaterThan(100);
  });
});

describe("a stable roster", () => {
  it("is not needed yet: bots are the same every time", () => {
    const t = cachedTrack("alpha");
    expect(makeBots(t, "rally", 0, 4)).toEqual(makeBots(t, "rally", 0, 4));
  });
});
