import { describe, expect, it } from "vitest";
import {
  MAX_AMENDS, Race, amendSegment, beginLine, botLine, changedSegments, defaultCar, drawSegment, generateTrack, isComplete,
  validateLine, type Line, type Vec2,
} from "@apex/sim";

/** A player's clicks for a segment: the bot's waypoints, minus the exit that the game snaps to the gate itself. */
const clicksFor = (guide: Line, i: number): Vec2[] => guide.segs[i]!;

describe("a whole game, the way the UI drives the sim", () => {
  it("draws a lap by hand, races, amends up to 3 segments, races on, and finishes", () => {
    const t = generateTrack("brave-owl-rides-melons");
    const guide = botLine(t, 5, 1);
    let line: Line = beginLine(t, guide.start);
    for (let i = 0; i < t.segments.length; i++) line = drawSegment(t, line, i, clicksFor(guide, i));
    expect(isComplete(t, line)).toBe(true);
    expect(validateLine(t, line).ok).toBe(true);

    const me = { id: "me", name: "You", car: defaultCar(), lines: [line], isPlayer: true };
    const bots = [1, 2, 3].map((i) => ({ id: `b${i}`, name: `B${i}`, car: defaultCar(), lines: [botLine(t, i, 0.7)] }));
    const race = new Race(t, [me, ...bots], 3);
    race.runLap("me", 0);
    expect(race.over).toBe(false);

    // amend three segments: the joins stay, so the lap stays closed
    let next = line;
    for (const i of [2, 3, 4]) next = amendSegment(next, i, clicksFor(guide, i).filter((_, k) => k % 2 === 0 || k === 6).slice(0, -1));
    expect(changedSegments(line, next)).toEqual([2, 3, 4]);
    expect(changedSegments(line, next).length).toBeLessThanOrEqual(MAX_AMENDS);
    expect(validateLine(t, next).ok).toBe(true);
    me.lines[1] = next;
    race.runLap("me", 1);
    me.lines[2] = next;
    race.runLap("me", 2);
    race.runToEnd();
    const res = race.results();
    expect(res).toHaveLength(4);
    expect(res.every((r) => r.finishTime !== null && r.lapTimes.length === 3)).toBe(true);
  });
});
