import { describe, expect, it } from "vitest";
import {
  CHALLENGES, POINTS, Race, addDays, applyRound, botLine, cachedTrack, challengeById, contactCount, dailyPhrase, dailyStreak, defaultCar, evaluate, isDateKey,
  isOver, makeBots, newChampionship, normaliseChallenges, normaliseChampionship, normaliseDaily, nextPhrase, overtakeCount, placeFor, pointsFor, recordChallenge, recordDaily, referenceTime,
  rosterOf, standings, withinDays, type CarResult, type Entrant,
} from "@apex/sim";

describe("daily", () => {
  it("is the same phrase for a date and a different one the next day", () => {
    expect(dailyPhrase("2026-10-17")).toBe(dailyPhrase("2026-10-17"));
    expect(dailyPhrase("2026-10-17")).not.toBe(dailyPhrase("2026-10-18"));
    for (let i = 0; i < 30; i++) expect(placeFor(dailyPhrase(addDays("2026-01-01", i))).choices.length).toBeGreaterThan(0);
  });
  it("checks dates and the server's window", () => {
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-10-17")).toBe(true);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(withinDays("2026-10-18", "2026-10-17")).toBe(true);
    expect(withinDays("2026-10-20", "2026-10-17")).toBe(false);
  });
  it("keeps the best time per day, a streak, and drops junk", () => {
    let r = recordDaily({ days: {} }, "2026-10-15", 60);
    r = recordDaily(r, "2026-10-15", 70);
    r = recordDaily(r, "2026-10-16", 61);
    expect(r.days["2026-10-15"]).toBe(60);
    expect(dailyStreak(r, "2026-10-17")).toBe(2); // today not run yet: counts back from yesterday
    r = recordDaily(r, "2026-10-17", 59);
    expect(dailyStreak(r, "2026-10-17")).toBe(3);
    expect(normaliseDaily({ days: { "2026-10-15": 60, bad: 3, "2026-10-16": -1 } }).days).toEqual({ "2026-10-15": 60 });
    expect(normaliseDaily(null).days).toEqual({});
  });
});

describe("championship", () => {
  const c0 = newChampionship(1234, "medium", "rally");
  it("draws the same rounds for a seed, all on tracks that offer the machine", () => {
    expect(newChampionship(1234, "medium", "rally").rounds).toEqual(c0.rounds);
    expect(c0.rounds.length).toBe(5);
    for (const p of c0.rounds) expect(placeFor(p).choices).toContain("rally");
  });
  it("scores places, keeps a table and ends after the last round", () => {
    let c = c0;
    const field = (order: string[]) => order.map((id, i) => ({ id, name: id.toUpperCase(), position: i + 1 }));
    while (!isOver(c)) c = applyRound(c, field(c.done % 2 ? ["me", "bot0", "bot1"] : ["bot0", "me", "bot1"]));
    expect(nextPhrase(c)).toBeNull();
    const t = standings(c);
    expect(t[0]!.points).toBe(Math.max(...t.map((r) => r.points)));
    expect(t.find((r) => r.id === "me")!.points).toBe(2 * POINTS[0]! + 3 * POINTS[1]!);
    expect(pointsFor(11)).toBe(0);
    expect(applyRound(c, field(["me"]))).toBe(c);
  });
  it("round-trips through storage and rejects nonsense", () => {
    const mid = applyRound(c0, [{ id: "me", name: "Me", position: 1 }]);
    expect(normaliseChampionship(JSON.parse(JSON.stringify(mid)))).toEqual(mid);
    expect(normaliseChampionship({ v: 9 })).toBeNull();
    expect(normaliseChampionship(null)).toBeNull();
  });
  it("keeps the same rivals on every track, and different ones for another season", () => {
    const a = cachedTrack(c0.rounds[0]!), b = cachedTrack(c0.rounds[1]!);
    const ra = makeBots(a, "rally", 0, 6, "medium", rosterOf(c0)), rb = makeBots(b, "rally", 0, 6, "medium", rosterOf(c0));
    expect(ra.map((e) => [e.name, e.car, e.bot!.skill])).toEqual(rb.map((e) => [e.name, e.car, e.bot!.skill]));
    expect(new Set(ra.map((e) => e.name)).size).toBe(6);
    const other = makeBots(a, "rally", 0, 6, "medium", rosterOf(newChampionship(99, "medium", "rally")));
    expect(other.map((e) => e.name)).not.toEqual(ra.map((e) => e.name));
    expect(makeBots(a, "rally", 0, 3, "hard")).toEqual(makeBots(a, "rally", 0, 3, "hard", undefined)); // no roster: as always
  });
});

describe("challenges", () => {
  const res = (over: Partial<CarResult>): CarResult => ({ id: "me", name: "Me", isPlayer: true, slot: 5, position: 2, finishTime: 100, rawTime: 100, penalty: 0, missing: [], dnf: false, pits: 0, emergencies: 0, lapTimes: [], ...over } as CarResult);
  it("judges each kind of goal by its tiers", () => {
    expect(evaluate({ kind: "win", tiers: [3, 2, 1] }, res({ position: 1 }), { overtakes: 0, contacts: 0 }).stars).toBe(3);
    expect(evaluate({ kind: "win", tiers: [3, 2, 1] }, res({ position: 3 }), { overtakes: 0, contacts: 0 }).stars).toBe(1);
    expect(evaluate({ kind: "win", tiers: [3, 2, 1] }, res({ position: 4 }), { overtakes: 0, contacts: 0 }).stars).toBe(0);
    expect(evaluate({ kind: "gain", tiers: [2, 4, 6] }, res({ slot: 7, position: 2 }), { overtakes: 0, contacts: 0 }).stars).toBe(3); // from P8 to P2
    expect(evaluate({ kind: "clean", tiers: [4, 2, 0] }, res({}), { overtakes: 0, contacts: 2 }).stars).toBe(2);
    expect(evaluate({ kind: "overtakes", tiers: [4, 7, 10] }, res({}), { overtakes: 8, contacts: 0 }).stars).toBe(2);
    expect(evaluate({ kind: "nopit", tiers: [4, 2, 1] }, res({ pits: 1, position: 1 }), { overtakes: 0, contacts: 0 }).stars).toBe(0);
    expect(evaluate({ kind: "pace", tiers: [1.25, 1.12, 1] }, res({ finishTime: 105 }), { overtakes: 0, contacts: 0, reference: 100 }).stars).toBe(2);
    expect(evaluate({ kind: "win", tiers: [3, 2, 1] }, res({ dnf: true, finishTime: null }), { overtakes: 0, contacts: 0 }).stars).toBe(0);
  });
  it("keeps stars apart from the track's, only ever raising them", () => {
    let s = recordChallenge({ stars: {} }, "first-win", 2);
    s = recordChallenge(s, "first-win", 1);
    expect(s.stars["first-win"]).toBe(2);
    expect(recordChallenge(s, "nope", 3)).toBe(s);
    expect(normaliseChallenges({ stars: { "first-win": 9, junk: 2, "from-the-back": 0 } }).stars).toEqual({ "first-win": 3 });
  });
  it("has unique ids and tracks that offer their machine", () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) { expect(challengeById(c.id)).toBe(c); if (c.vehicle) expect(placeFor(c.phrase).choices).toContain(c.vehicle); }
  });
  it("counts passes and contacts from a real race", () => {
    const t = cachedTrack("alpha");
    const me: Entrant = { id: "me", name: "Me", car: defaultCar(), lines: [botLine(t, 5, 1)], isPlayer: true, gridSlot: 7 };
    const race = new Race(t, [me, ...makeBots(t, "rally", 0, 7, "easy")], 3, { realism: false, weather: false });
    race.runToEnd();
    const mine = race.results().find((r) => r.isPlayer)!;
    expect(overtakeCount(race, "me")).toBeGreaterThanOrEqual(Math.max(0, mine.slot - mine.position + 1 - 0) > 0 ? 1 : 0);
    expect(contactCount(race, "me")).toBeGreaterThanOrEqual(0);
    expect(referenceTime("alpha", "rally", 2)).toBeGreaterThan(30);
    expect(referenceTime("alpha", "rally", 2)).toBe(referenceTime("alpha", "rally", 2));
  });
});
