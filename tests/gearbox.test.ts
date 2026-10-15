import { describe, expect, it } from "vitest";
import { GEARS, Gearbox } from "../src/renderer/gearbox.ts";

const box = (id: string) => { const g = GEARS[id]!; return new Gearbox(g.hi, g.idle, g.gap, g.up, g.down); };

/** Drive 0 -> top speed at full throttle over `secs`, then back to a stop braking. */
function run(id: string, secs = 20) {
  const b = box(id), log: { t: number; x: number; rev: number; gear: number; shift: number }[] = [];
  const dt = 1 / 60, n = Math.round(secs / dt);
  for (let i = 0; i <= n; i++) {
    const t = i * dt, up = i < n / 2, x = up ? i / (n / 2) : 1 - (i - n / 2) / (n / 2);
    const r = b.step(x, up ? 0.9 : -0.5, t);
    log.push({ t, x, rev: r.rev, gear: b.gear, shift: r.shift });
  }
  return log;
}

describe("gearbox", () => {
  for (const id of Object.keys(GEARS)) {
    it(`${id}: revs stay in range, and the top gear is reached at top speed`, () => {
      const log = run(id), n = GEARS[id]!.hi.length;
      for (const l of log) { expect(l.rev).toBeGreaterThan(0.1); expect(l.rev).toBeLessThanOrEqual(1.04); }
      const peak = log.find((l) => l.x >= 0.999)!;
      expect(peak.gear).toBe(n);
      expect(peak.rev).toBeGreaterThan(0.95);
    });

    it(`${id}: goes up through every gear one at a time and comes back down to first`, () => {
      const log = run(id), n = GEARS[id]!.hi.length;
      const ups = log.filter((l) => l.shift > 0).length, downs = log.filter((l) => l.shift < 0).length;
      expect(ups).toBeGreaterThanOrEqual(n - 1);
      expect(downs).toBeGreaterThanOrEqual(n - 1);
      expect(log[log.length - 1]!.gear).toBe(1);
    });
  }

  it("drops the revs suddenly on a change up and snaps them up on a change down", () => {
    const log = run("rally");
    const ups = log.map((l, i) => ({ l, p: log[i - 1] })).filter((o) => o.l.shift > 0 && o.p);
    const downs = log.map((l, i) => ({ l, p: log[i - 1] })).filter((o) => o.l.shift < 0 && o.p);
    for (const o of ups) expect(o.p!.rev - o.l.rev).toBeGreaterThan(0.08);
    for (const o of downs) expect(o.l.rev - o.p!.rev).toBeGreaterThan(0.04);
  });

  it("a kart has two gears: one change up on the way to top speed, and the revs climb all the way in the last", () => {
    const log = run("kart");
    expect(log.filter((l) => l.shift > 0).length).toBe(1);
    const top = log.find((l) => l.x >= 0.999)!;
    expect(top.gear).toBe(2);
    expect(top.rev).toBeGreaterThan(0.95);
  });

  it("does not hunt between gears at a steady speed once it has settled", () => {
    const b = box("formula"), late: number[] = [];
    for (let i = 0; i < 900; i++) { const r = b.step(0.55, 0.05, i / 60); if (r.shift && i > 300) late.push(i); } // 5 s to climb to the right gear
    expect(late).toEqual([]);
    expect(b.gear).toBeGreaterThanOrEqual(2);
  });
});
