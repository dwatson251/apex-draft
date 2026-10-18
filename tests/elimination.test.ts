import { describe, expect, it } from "vitest";
import { Race, generateTrack, makeBots, placeFor } from "@apex/sim";

describe("an elimination race", () => {
  const phrase = "brave-owl-rides-melons";
  const run = () => {
    const t = generateTrack(phrase);
    const r = new Race(t, makeBots(t, placeFor(phrase).vehicle, 0, 6, "medium"), 5, { realism: false, weather: false, elimination: true });
    r.runToEnd();
    return r;
  };
  it("puts the last car out each time the leader starts a lap, down to a duel on the last lap", () => {
    const r = run(), res = r.results();
    expect(res.filter((x) => x.eliminated > 0).length).toBe(4); // laps 2 to 5 each start with one car going out
    expect(r.events.filter((e) => e.type === "elim").length).toBe(4);
    expect(res.slice(0, 2).every((x) => x.eliminated === 0 && x.finishTime !== null)).toBe(true);
    // classified behind the two still in at the end, the last to go out first
    expect(res.slice(2).map((x) => x.eliminated)).toEqual([4, 3, 2, 1]);
    // a car put out part of the way round has no time for that lap: the first out was still on its first lap when the leader finished it
    expect(res.at(-1)!.lapTimes.length).toBe(0);
    for (const x of res) for (const l of x.lapTimes) expect(l).toBeGreaterThan(5);
  });
  it("is the same race every time", () => {
    expect(run().hash()).toBe(run().hash());
  });
  it("leaves an ordinary race alone", () => {
    const t = generateTrack(phrase);
    const r = new Race(t, makeBots(t, placeFor(phrase).vehicle, 0, 6, "medium"), 3, { realism: false, weather: false });
    r.runToEnd();
    expect(r.results().every((x) => x.eliminated === 0)).toBe(true);
  });
});
