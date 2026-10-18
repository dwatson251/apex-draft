import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack, makeBots, placeFor, type Entrant, type RaceRules } from "@apex/sim";

/** A replay is the race run again from what went into it: the entrants (with every line they drove), the rules, and the replans made at the stops. */
describe("replays", () => {
  const phrase = "brave-owl-rides-melons";
  const t = generateTrack(phrase), v = placeFor(phrase).vehicle;
  const rules: RaceRules = { realism: true, weather: true, wearMult: { fuel: 3, tyre: 3 } };

  it("give the same race, stops, replans and all", () => {
    const me: Entrant = { id: "me", name: "Me", car: { ...defaultCar(), type: v }, lines: Array.from({ length: 6 }, () => botLine(t, 5, 1)), isPlayer: true, pitPlan: [{ lap: 2, tyre: "soft" }] };
    const entrants = [me, ...makeBots(t, v, 0, 7, "hard")];
    const start = JSON.stringify(entrants); // the entrants as they were at the start
    const race = new Race(t, entrants, 6, rules);
    // run to the player's stop, change the line for the laps after it and have the bots read the road again, as the game does
    expect(race.runToStop("me")).toBe(true);
    const next = race.cars.find((c) => c.entrant.isPlayer)!.lap + 1;
    race.setLines("me", next, 6 - next, botLine(t, 9, 0.95));
    race.setPlan("me", [{ lap: 2, tyre: "soft" }, { lap: 4, tyre: "medium" }]);
    race.replanBots(next, 6 - next);
    race.runToEnd();
    const edits = JSON.parse(JSON.stringify(race.edits));
    const again = new Race(t, JSON.parse(start), 6, rules); // (in the order the race was given them: the grid breaks ties by it)
    again.replay(edits);
    again.runToEnd();
    expect(again.hash()).toBe(race.hash());
    expect(again.results().map((r) => [r.id, r.finishTime, r.pits])).toEqual(race.results().map((r) => [r.id, r.finishTime, r.pits]));
    expect(race.results().find((r) => r.id === "me")!.pits).toBe(2);
  });
});
