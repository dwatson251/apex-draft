import { describe, expect, it } from "vitest";
import {
  MAX_WEAR_MULT, PIT_PENALTY, Race, botLine, clampWear, defaultCar, finishSession, generateTrack, gridFromTimes, newWeekend,
  quickGridTime, sessionBest, sessionLaps, sessionRules, skipTo, trialKey, type Entrant,
} from "@apex/sim";

const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
const field = (n: number, extra: (i: number) => Partial<Entrant> = () => ({})): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 3 + i, 0.5 + i / 20)], isPlayer: i === 0, ...extra(i) }));

describe("wear multipliers", () => {
  it("clamp to 1..40", () => {
    expect([clampWear(0), clampWear(2.4), clampWear(99), clampWear(NaN), clampWear(undefined)]).toEqual([1, 2, MAX_WEAR_MULT, 1, 1]);
  });
  it("burn fuel and tyres faster", () => {
    const run = (m: number) => { const r = new Race(t, field(1), 2, { realism: true, weather: false, wearMult: { fuel: m, tyre: m } }); r.runLap("c0", 0); return r.cars[0]!; };
    const a = run(1), b = run(3);
    expect(1 - b.tyre).toBeGreaterThan((1 - a.tyre) * 2.5);
    expect(100 - b.fuel).toBeGreaterThan((100 - a.fuel) * 2.5);
  });
});

describe("mandatory compounds", () => {
  it("cost a penalty for each one never run", () => {
    const r = new Race(t, field(1), 2, { realism: true, weather: false, mandatory: ["soft", "wet"] });
    r.runToEnd();
    const res = r.results()[0]!;
    expect(res.missing).toEqual(["soft", "wet"]);
    expect(res.penalty).toBe(PIT_PENALTY * 3); // never pitted, plus two missing
  });
  it("are met by starting on one", () => {
    const r = new Race(t, field(1, () => ({ startTyre: "soft" })), 2, { realism: true, weather: false, mandatory: ["soft"] });
    r.runToEnd();
    expect(r.results()[0]!.missing).toEqual([]);
  });
  it("do nothing without realism", () => {
    const r = new Race(t, field(1), 2, { realism: false, mandatory: ["wet"] });
    r.runToEnd();
    expect(r.results()[0]!.penalty).toBe(0);
  });
});

describe("grid control", () => {
  it("honours fixed grid slots and fills the rest in order", () => {
    const r = new Race(t, field(5, (i) => (i === 3 ? { gridSlot: 0 } : i === 0 ? { gridSlot: 4 } : {})), 2, { realism: false });
    const slot = (id: string) => r.cars.find((c) => c.entrant.id === id)!.slot;
    expect(slot("c3")).toBe(0);
    expect(slot("c0")).toBe(4);
    expect(new Set(r.cars.map((c) => c.slot)).size).toBe(5);
  });
  it("puts a car with no time at the back", () => {
    const r = new Race(t, field(6, (i) => (i === 0 ? { gridTime: quickGridTime(null) } : {})), 2, { realism: false });
    expect(r.cars.find((c) => c.entrant.isPlayer)!.slot).toBe(5);
  });
  it("puts a car with a very quick time on pole", () => {
    const r = new Race(t, field(6, (i) => (i === 0 ? { gridTime: quickGridTime(1) } : {})), 2, { realism: false });
    expect(r.cars.find((c) => c.entrant.isPlayer)!.slot).toBe(0);
  });
  it("spreads other drivers round the track and keeps the player on the line", () => {
    const r = new Race(t, field(5, (i) => (i === 0 ? { gridSlot: 0 } : { startFrac: i / 5 })), 3, { realism: false });
    expect(r.cars.find((c) => c.entrant.isPlayer)!.slot).toBe(0);
    const pole = r.cars[0]!;
    for (const c of r.cars.slice(1)) expect(Math.hypot(c.x - pole.x, c.y - pole.y)).toBeGreaterThan(20);
    r.runToEnd();
    expect(r.results().every((x) => x.finishTime !== null)).toBe(true);
  });
});

describe("sessions", () => {
  it("run an outlap, timed laps and a cooldown", () => {
    expect([sessionLaps("trial"), sessionLaps("practice"), sessionLaps("qualifying")]).toEqual([3, 3, 5]);
    expect(sessionRules("trial").realism).toBe(false);
    expect(sessionRules("race", { wearMult: { fuel: 5, tyre: 999 } }).wearMult).toEqual({ fuel: 5, tyre: 40 });
  });
  it("time the best lap between the outlap and the cooldown", () => {
    expect(sessionBest([30, 20, 21, 19, 40], "qualifying")).toBe(19);
    expect(sessionBest([30, 22, 10], "trial")).toBe(22);
    expect(sessionBest([30], "trial")).toBeNull();
  });
  it("produce a real time trial through the sim", () => {
    const r = new Race(t, field(1), sessionLaps("trial"), sessionRules("trial"));
    r.runToEnd();
    const lt = r.results()[0]!.lapTimes;
    expect(lt).toHaveLength(3);
    expect(sessionBest(lt, "trial")).toBe(lt[1]);
  });
  it("key the time trial by normalised phrase", () => {
    expect(trialKey("Brave Owl")).toBe(trialKey("brave-owl"));
  });
  it("order a grid by time with the untimed last", () => {
    const g = gridFromTimes([{ id: "a", time: null }, { id: "b", time: 20 }, { id: "c", time: 19 }]);
    expect([g.get("c"), g.get("b"), g.get("a")]).toEqual([0, 1, 2]);
  });
});

describe("a race weekend", () => {
  it("goes practice, qualifying, race, done, and sets the grid from qualifying", () => {
    let w = newWeekend();
    expect(w.phase).toBe("practice");
    w = finishSession(w, "practice", 21);
    expect(w).toMatchObject({ phase: "qualifying", practice: 21 });
    w = finishSession(w, "qualifying", 20, [{ id: "me", time: 20 }, { id: "x", time: 19 }]);
    expect(w).toMatchObject({ phase: "race", qualifying: 20, grid: { x: 0, me: 1 } });
    w = finishSession(w, "race", null);
    expect(w.phase).toBe("done");
  });
  it("ignores a session out of order and lets practice be skipped", () => {
    const w = newWeekend();
    expect(finishSession(w, "race", null)).toBe(w);
    expect(skipTo(w, "qualifying").phase).toBe("qualifying");
    expect(skipTo(skipTo(w, "race"), "practice").phase).toBe("race");
  });
});
