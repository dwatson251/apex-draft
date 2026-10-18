import { describe, expect, it } from "vitest";
import { TROPHIES, newTrophies, rewardsOf, type RunSummary } from "@apex/sim";

const base: RunSummary = { mode: "race", position: 3, field: 8, grid: 4, laps: 3, difficulty: "easy", realism: false, pits: 0, emergencies: 0, safetyCar: false, rain: false, golfStars: 0, careerTier: 0 };
const ids = (r: Partial<RunSummary>, t = { races: 1, wins: 0, circuits: 0 }, have = {}) => newTrophies({ ...base, ...r }, t, have).map((x) => x.id);

describe("trophies", () => {
  it("have distinct ids and say what earns them", () => {
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(TROPHIES.length);
    for (const t of TROPHIES) expect(t.blurb.length).toBeGreaterThan(5);
  });
  it("come from what happened", () => {
    expect(ids({})).toEqual(["lights-out"]);
    expect(ids({ position: 1, grid: 8, difficulty: "hard" })).toEqual(expect.arrayContaining(["top-step", "flat-out", "from-the-back"]));
    expect(ids({ mode: "elim", position: 1 })).toContain("last-standing");
    expect(ids({ mode: "golf", position: null, golfStars: 3 })).toEqual(["par"]);
    expect(ids({ position: null, mode: "trial" }, { races: 0, wins: 0, circuits: 10 })).toEqual(["tourist"]);
  });
  it("are earned once", () => {
    expect(ids({}, undefined, { "lights-out": 1 })).toEqual([]);
  });
  it("open livery rewards", () => {
    expect([...rewardsOf({ "flat-out": 1, globetrotter: 1 })].sort()).toEqual(["chrome", "gold"]);
  });
});
