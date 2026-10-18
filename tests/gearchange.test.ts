import { describe, expect, it } from "vitest";
import { GEARBOXES, Race, SHIFT_CUT, TICK, botLine, buildProfile, carStats, defaultCar, generateTrack, nextGear, sessionRules, shiftSpeeds, type VehicleId } from "@apex/sim";

/** A solo race on a fixed track in one machine: its speed and gear every tick of the first lap and a half. */
function drive(type: VehicleId, ticks = 2400) {
  const t = generateTrack("monza", { obstacles: false });
  const line = botLine(t, 5, 1);
  const me = { id: "me", name: "x", car: { ...defaultCar(), type }, lines: [line, line], isPlayer: true, startTyre: "soft" as const, gridSlot: 0 };
  const race = new Race(t, [me], 2, sessionRules("trial"));
  const log: { v: number; gear: number }[] = [];
  for (let i = 0; i < ticks; i++) { race.step(); const c = race.cars[0]!; log.push({ v: c.v, gear: c.gear }); }
  return log;
}

/** With a machine's gearbox taken out for the length of `fn`. */
function without<T>(type: VehicleId, fn: () => T): T {
  const box = GEARBOXES[type];
  delete GEARBOXES[type];
  try { return fn(); } finally { if (box) GEARBOXES[type] = box; }
}

describe("gear changes", () => {
  it("change up at each point and down only well below it", () => {
    const box = GEARBOXES.classic!, top = 100, pts = shiftSpeeds("classic", top);
    expect(pts).toHaveLength(box.gears - 1);
    expect(nextGear(box, top, pts[0]! - 0.01, 0)).toBe(0);
    expect(nextGear(box, top, pts[0]! + 0.01, 0)).toBe(1);
    expect(nextGear(box, top, pts[0]! * 0.95, 1)).toBe(1); // (just below: it holds the gear)
    expect(nextGear(box, top, pts[0]! * 0.85, 1)).toBe(0);
    expect(nextGear(box, top, top, 0)).toBe(box.gears - 1);
  });

  it("a manual loses its drive for the clutch on each change up, and the car rolls without gaining speed", () => {
    const log = drive("classic"), cut = Math.round(SHIFT_CUT.manual / TICK);
    const ups = log.flatMap((x, i) => (i > 0 && x.gear > log[i - 1]!.gear ? [i] : []));
    expect(ups.length).toBeGreaterThan(3);
    for (const i of ups.slice(0, 3)) {
      // through the cut the speed does not rise; straight after it, it does again
      for (let k = i + 1; k <= i + cut; k++) expect(log[k]!.v).toBeLessThanOrEqual(log[k - 1]!.v + 1e-9);
      expect(log[i + cut + 2]!.v).toBeGreaterThan(log[i + cut]!.v);
    }
  });

  it("costs a manual more time than a seamless box, and a machine with no gearbox none", () => {
    const t = generateTrack("monza", { obstacles: false }), line = botLine(t, 5, 1);
    const lap = (type: VehicleId) => buildProfile(t, line, { ...defaultCar(), type }).ideal;
    const loss = (type: VehicleId) => lap(type) / without(type, () => lap(type)) - 1;
    expect(loss("classic")).toBeGreaterThan(0.003);
    expect(loss("classic")).toBeLessThan(0.03); // (a slight loss, not a different car)
    expect(loss("formula")).toBeLessThan(loss("classic") / 3);
    expect(buildProfile(t, line, { ...defaultCar(), type: "electric" }).ideal).toBe(without("electric", () => buildProfile(t, line, { ...defaultCar(), type: "electric" }).ideal));
  });

  it("every gearbox changes up below its machine's top speed", () => {
    for (const [type, box] of Object.entries(GEARBOXES) as [VehicleId, NonNullable<(typeof GEARBOXES)[VehicleId]>][]) {
      const top = carStats({ ...defaultCar(), type }).vTop, pts = shiftSpeeds(type, top);
      expect(pts).toHaveLength(box.gears - 1);
      expect(Math.max(...pts)).toBeLessThan(top);
    }
  });
});
