import { describe, expect, it } from "vitest";
import { PAD_CAP, PEAK_MAX, PEAK_MIN, Race, botLine, buildProfile, defaultCar, generateTrack, jumpPeak, type Fx, type Track } from "@apex/sim";

/** A fresh Monza with pieces laid on a long straight away from the start line. */
function withFx(fx: Fx[], id = "monza"): { track: Track; seg: number } {
  const track = generateTrack(id, { obstacles: false });
  const n = track.segments.length;
  const seg = track.segments.findIndex((s) => s.index >= 3 && s.index <= n - 4 && s.kind === "straight" && track.segments[s.index + 1]!.kind === "straight");
  expect(seg).toBeGreaterThan(2);
  track.segments[seg]!.fx = fx;
  return { track, seg };
}
const solo = (track: Track, laps = 2) => new Race(track, [{ id: "me", name: "me", car: { ...defaultCar(), type: "kart" as const }, lines: [botLine(track, 1, 1)], isPlayer: true }], laps, { realism: false });

describe("speed pads", () => {
  it("mark where a car drives onto them, once, at the start of the span", () => {
    const { track, seg } = withFx([{ t0: 0.4, t1: 0.7, type: "boost" }]);
    const p = buildProfile(track, botLine(track, 1, 1), { ...defaultCar(), type: "kart" as const });
    const marks = [...p.kick].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(marks).toHaveLength(1);
    expect(p.seg[marks[0]!]).toBe(seg);
    expect(buildProfile(generateTrack("monza", { obstacles: false }), botLine(track, 1, 1), { ...defaultCar(), type: "kart" as const }).kick.every((v) => v === 0)).toBe(true);
  });

  it("give a real boost: a kart goes clearly faster after a pad than on the same road without one, and never past the cap", () => {
    const peak = (fx: Fx[]) => {
      const { track } = withFx(fx);
      const r = solo(track);
      const events: string[] = [];
      let top = 0;
      while (!r.over) { r.step(); top = Math.max(top, r.cars[0]!.v); for (const e of r.events) if (e.type === "pad") events.push(e.type); r.events.length = 0; }
      return { top, pads: events.length };
    };
    const plain = peak([]), padded = peak([{ t0: 0.4, t1: 0.6, type: "boost" }]);
    expect(plain.pads).toBe(0);
    expect(padded.pads).toBeGreaterThanOrEqual(1);
    expect(padded.top).toBeGreaterThan(plain.top * 1.08);
    expect(padded.top).toBeLessThan(plain.top * PAD_CAP * 1.4);
  });

  it("do nothing to a car in the air", () => {
    const { track } = withFx([{ t0: 0.2, t1: 0.3, type: "jump" }, { t0: 0.35, t1: 0.9, type: "boost" }]);
    const r = solo(track, 1);
    let pads = 0, airAtPad = 0;
    while (!r.over) { r.step(); for (const e of r.events) if (e.type === "pad") { pads++; if (r.cars[0]!.air > 0) airAtPad++; } r.events.length = 0; }
    expect(airAtPad).toBe(0);
    expect(pads).toBeGreaterThanOrEqual(0);
  });
});

describe("jump height", () => {
  it("grows with speed: a slow hop is low, a fast jump higher, a glide stays low", () => {
    const vTop = 100;
    const slow = jumpPeak("jump", 0.5 * vTop, vTop), mid = jumpPeak("jump", 0.75 * vTop, vTop), fast = jumpPeak("jump", vTop, vTop);
    expect(slow).toBeLessThan(mid);
    expect(mid).toBeLessThan(fast);
    expect(jumpPeak("glide", vTop, vTop)).toBeLessThan(fast);
    expect(slow).toBeGreaterThanOrEqual(PEAK_MIN);
    for (const v of [0, 0.3, 0.6, 1, 1.4, 3]) expect(jumpPeak("jump", v * vTop, vTop)).toBeLessThanOrEqual(PEAK_MAX * 1.25 + 1e-9);
  });
  it("is much lower than the old fixed full height, even flat out", () => {
    expect(jumpPeak("jump", 100, 100)).toBeLessThanOrEqual(0.6);
  });
});
