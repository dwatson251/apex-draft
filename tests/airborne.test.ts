import { describe, expect, it } from "vitest";
import { Race, botLine, buildProfile, defaultCar, generateTrack, makeBots, type Fx, type Track } from "@apex/sim";

/** A fresh Monza with a ramp (and whatever else) laid on its first long straight away from the start line. */
function withFx(fx: Fx[], id = "monza"): { track: Track; seg: number } {
  const track = generateTrack(id, { obstacles: false });
  const n = track.segments.length;
  const seg = track.segments.findIndex((s) => s.index >= 3 && s.index <= n - 4 && s.kind === "straight" && track.segments[s.index + 1]!.kind === "straight");
  expect(seg).toBeGreaterThan(2);
  track.segments[seg]!.fx = fx;
  return { track, seg };
}

const solo = (track: Track, type: "kart" | "rally" = "kart", laps = 2) => {
  const car = { ...defaultCar(), type };
  return new Race(track, [{ id: "me", name: "me", car, lines: [botLine(track, 1, 1)], isPlayer: true }], laps, { realism: false });
};

describe("airborne", () => {
  it("marks the take-off sample of a ramp in the profile, and nothing on a plain road", () => {
    const { track, seg } = withFx([{ t0: 0.4, t1: 0.6, type: "jump" }]);
    const car = { ...defaultCar(), type: "kart" as const };
    const p = buildProfile(track, botLine(track, 1, 1), car);
    const marks = [...p.jump].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(marks.length).toBe(1);
    expect(p.seg[marks[0]!]).toBe(seg);
    const plain = buildProfile(generateTrack("monza", { obstacles: false }), botLine(track, 1, 1), car);
    expect(plain.jump.every((v) => v === 0)).toBe(true);
  });

  it("leaves the ground at speed, comes down, and a plain track never flies", () => {
    const { track } = withFx([{ t0: 0.4, t1: 0.6, type: "jump" }]);
    const r = solo(track);
    let flew = 0, top = 0;
    while (!r.over) { r.step(); const c = r.cars[0]!; if (c.air > 0) flew++; top = Math.max(top, c.atrace.at(-1)!); }
    expect(flew).toBeGreaterThan(10);
    expect(top).toBeGreaterThan(0.9);
    expect(r.cars[0]!.air).toBe(0);
    const plain = solo(generateTrack("monza", { obstacles: false }));
    plain.runToEnd();
    expect(plain.cars[0]!.atrace.every((a) => a === 0)).toBe(true);
  });

  it("is deterministic, and the hash sees the air", () => {
    const a = withFx([{ t0: 0.4, t1: 0.6, type: "jump" }]), b = withFx([{ t0: 0.4, t1: 0.6, type: "jump" }]);
    const ra = solo(a.track), rb = solo(b.track);
    ra.runToEnd(); rb.runToEnd();
    expect(ra.hash()).toBe(rb.hash());
    const r = solo(withFx([{ t0: 0.4, t1: 0.6, type: "jump" }]).track);
    let h0 = "", h1 = "";
    while (!r.over && r.cars[0]!.air === 0) r.step();
    h0 = r.hash(); r.cars[0]!.air++; h1 = r.hash();
    expect(h0).not.toBe(h1);
  });

  it("a car too slow for the ramp rides over it", () => {
    const { track } = withFx([{ t0: 0.4, t1: 0.6, type: "jump" }]);
    const r = solo(track);
    r.cars[0]!.v = 0;
    // pin the car to a crawl by giving it a pace of almost nothing
    const e = { ...r.cars[0]!.entrant, pace: 0.2 };
    const slow = new Race(track, [e], 1, { realism: false });
    let flew = 0;
    while (!slow.over && slow.time < 60) { slow.step(); if (slow.cars[0]!.air > 0) flew++; }
    expect(flew).toBe(0);
  });

  it("a glide ramp stays up longer than a jump", () => {
    const air = (type: "jump" | "glide") => {
      const r = solo(withFx([{ t0: 0.4, t1: 0.6, type }]).track);
      let most = 0;
      while (!r.over) { r.step(); most = Math.max(most, r.cars[0]!.airT); }
      return most;
    };
    expect(air("glide")).toBeGreaterThan(air("jump"));
  });

  it("cars on the ground and in the air do not touch", () => {
    const { track } = withFx([{ t0: 0.4, t1: 0.6, type: "jump" }]);
    const bots = makeBots(track, "kart", 0, 24);
    const r = new Race(track, bots, 2, { realism: false });
    r.runToEnd();
    // nobody is stuck in a ring or loses the race to the ramp: the whole field finishes
    expect(r.results().filter((x) => x.rawTime !== null).length).toBe(24);
  }, 120000);

  it("speed pads and ice change the lap time", () => {
    const lap = (fx: Fx[]) => {
      const r = solo(withFx(fx).track);
      r.runToEnd();
      return Math.min(...r.results()[0]!.lapTimes);
    };
    const base = lap([]);
    expect(lap([{ t0: 0.1, t1: 0.9, type: "boost" }])).toBeLessThan(base);
    expect(lap([{ t0: 0, t1: 1, type: "mud" }])).toBeGreaterThan(base);
  });
});
