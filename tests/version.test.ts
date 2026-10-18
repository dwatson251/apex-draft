import { describe, expect, it } from "vitest";
import { Race, SIM_VERSION, botLine, defaultCar, generateTrack, placeFor, sessionLaps, sessionRules } from "@apex/sim";

/**
 * The online server ranks lap times only within one SIM_VERSION. This fingerprints a fixed solo race: if it changes, the sim
 * (physics, track generation, bots, cars, circuits) now gives different times, so bump SIM_VERSION in packages/sim/src/version.ts
 * and update GOLDEN. Times set under the old version stop being ranked, which is the point.
 */
const GOLDEN = { version: 8, hash: "8c146c0b", time: 50.883 };

function fingerprint(phrase: string) {
  const t = generateTrack(phrase, { obstacles: false }), p = placeFor(phrase);
  const line = botLine(t, 5, 1), laps = sessionLaps("trial");
  const me = { id: "me", name: "x", car: { ...defaultCar(), type: p.vehicle }, lines: Array.from({ length: laps }, () => line), isPlayer: true, startTyre: "soft" as const, gridSlot: 0 };
  const race = new Race(t, [me], laps, sessionRules("trial"));
  race.runToEnd();
  return { hash: race.hash(), time: race.results()[0]!.lapTimes[1]! };
}

describe("sim version", () => {
  it("is bumped whenever a fixed race changes", () => {
    const f = fingerprint("monza");
    expect({ version: SIM_VERSION, hash: f.hash, time: Math.round(f.time * 1000) / 1000 }).toEqual(GOLDEN);
  });
  it("is repeatable", () => { expect(fingerprint("oval")).toEqual(fingerprint("oval")); });
});
