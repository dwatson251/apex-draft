import { describe, expect, it } from "vitest";
import {
  MAX_AMENDS, Race, amendSegment, moveJoin, setSegment, beginLine, botLine, changedSegments, defaultCar, drawSegment, generateTrack, isComplete,
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
    for (const i of [2, 3, 4]) next = amendSegment(next, i, clicksFor(guide, i).slice(0, -1).map((q) => ({ x: q.x + 0.5, y: q.y })));
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

describe("moving points that are already drawn", () => {
  const t = generateTrack("brave-owl-rides-melons");
  const guide = botLine(t, 5, 1);
  const n = t.segments.length;

  it("slides a join along its gate and keeps both neighbours joined", () => {
    const moved = moveJoin(t, guide, 4, { x: guide.segs[3]!.at(-1)!.x + 3, y: guide.segs[3]!.at(-1)!.y + 3 });
    const q = moved.segs[3]!.at(-1)!;
    const g = t.segments[4]!.entry;
    // still on the gate line
    expect(Math.abs((q.x - g.mid.x) * g.dir.x + (q.y - g.mid.y) * g.dir.y)).toBeLessThan(1e-6);
    expect(changedSegments(guide, moved)).toEqual([3]);
  });

  it("moves the start line and the end of the last segment together", () => {
    const g0 = t.segments[0]!.entry;
    const moved = moveJoin(t, guide, 0, { x: g0.mid.x + g0.n.x * 9, y: g0.mid.y + g0.n.y * 9 });
    expect(moved.segs[n - 1]!.at(-1)).toEqual(moved.start);
    expect(moved.start).not.toEqual(guide.start);
    expect(changedSegments(guide, moved)).toEqual([n - 1]);
  });

  it("sets a segment's end node, which becomes the next segment's start", () => {
    const g = t.segments[6]!.exit;
    const end = { x: g.mid.x + g.n.x * 5, y: g.mid.y + g.n.y * 5 };
    const next = setSegment(guide, 6, guide.segs[6]!.slice(0, -1), end, false);
    expect(next.segs[6]!.at(-1)).toEqual(end);
    expect(next.segs.length).toBe(n);
  });
});
