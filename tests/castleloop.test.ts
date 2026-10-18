import { describe, expect, it } from "vitest";
import { KART_INFO, Race, botLine, defaultCar, generateTrack, levelsOf } from "@apex/sim";

const ID = "mk64-bowsers-castle";

/** Bowser's Castle (Mario Kart 64): the road climbs a 270 degree counter-clockwise loop round a tower and passes over the road it came in on. */
describe("Bowser's Castle (MK64): the climbing tower loop", () => {
  const t = generateTrack(ID, { obstacles: false });
  const centre = t.segments.flatMap((s) => s.center);

  it("crosses itself on two levels: the road out of the loop goes over the road in", () => {
    expect(levelsOf(t)).not.toBeNull();
    const under = t.segments.filter((s) => s.kind === "under"), over = t.segments.filter((s) => s.kind === "bridge");
    expect(under.length).toBeGreaterThanOrEqual(1);
    expect(over.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...under.map((s) => s.index))).toBeLessThan(Math.min(...over.map((s) => s.index))); // the later run goes over
  });

  it("turns three quarters of a circle the same way within a short stretch of road", () => {
    // heading change along the centre line, summed over every window of about 700 units
    const pts = centre;
    const turn: number[] = [];
    let prev = Math.atan2(pts[1]!.y - pts[0]!.y, pts[1]!.x - pts[0]!.x);
    for (let i = 1; i < pts.length - 1; i++) {
      const h = Math.atan2(pts[i + 1]!.y - pts[i]!.y, pts[i + 1]!.x - pts[i]!.x);
      let d = h - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      turn.push(d); prev = h;
    }
    const step = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y) || 1;
    const win = Math.round(700 / step);
    let best = 0;
    for (let i = 0; i + win < turn.length; i++) { let s = 0; for (let j = i; j < i + win; j++) s += turn[j]!; if (Math.abs(s) > Math.abs(best)) best = s; }
    expect(Math.abs(best)).toBeGreaterThan(1.5 * Math.PI * 0.9); // 270 degrees, a little less for the smoothing
  });

  it("gains height round the tower, comes back down, and the lap closes at the height it began", () => {
    const elev = t.segments.map((s) => s.elev ?? []);
    const all = elev.flat();
    expect(Math.max(...all)).toBeCloseTo(10, 0);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    expect(elev[0]![0]).toBeCloseTo(0, 1);
    expect(elev.at(-1)!.at(-1)).toBeCloseTo(0, 0);
    // the road over is higher than the road under it
    const top = (kind: string) => Math.max(...t.segments.filter((s) => s.kind === kind).flatMap((s) => s.elev ?? [0]));
    expect(top("bridge")).toBeGreaterThan(top("under") + 5);
    expect(KART_INFO.get(ID)!.climb.reduce((a, c) => a + c.h, 0)).toBeCloseTo(0, 6);
  });

  it("can be raced: a kart finishes two laps of it", () => {
    const car = { ...defaultCar(), type: "kart" as const };
    const r = new Race(t, [{ id: "me", name: "me", car, lines: [botLine(t, 1, 1)], isPlayer: true }], 2, { realism: false });
    r.runToEnd();
    const res = r.results()[0]!;
    expect(res.lapTimes.length).toBe(2);
    expect(res.lapTimes.every((x) => x > 20 && x < 200)).toBe(true);
  });
});
