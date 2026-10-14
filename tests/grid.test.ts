import { describe, expect, it } from "vitest";
import { MAX_RIVALS, POWERUPS_ENABLED, Race, SAFE_GAP, botLine, decodeShare, defaultCar, encodeShare, generateTrack, type Entrant } from "@apex/sim";

function field(t: ReturnType<typeof generateTrack>, n: number, extra: Partial<Entrant> = {}): Entrant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 3 + i, 0.4 + (i % 10) / 18)], isPlayer: i === 0, ...(i === 0 ? extra : {}) }));
}

describe("a grid of 32", () => {
  const t = generateTrack("quiet-lynx-needs-clocks", { biome: "grass" });
  it("allows 31 rivals and keeps them in a share link", () => {
    expect(MAX_RIVALS).toBe(31);
    const st = decodeShare(encodeShare({ phrase: "x-y", laps: 3, mode: "race", rivals: 31, car: defaultCar(), obstacles: true, realism: false, playing: false, startTyre: "soft", pitPlan: [] }));
    expect(typeof st).not.toBe("string");
    if (typeof st !== "string") { expect(st.rivals).toBe(31); expect(st.startTyre).toBe("soft"); }
  });
  it("starts in two staggered columns with nobody on top of anybody", () => {
    const r = new Race(t, field(t, 32), 3, { realism: false });
    expect(r.cars).toHaveLength(32);
    for (let i = 0; i < 32; i++) for (let j = i + 1; j < 32; j++) {
      const a = r.cars[i]!, b = r.cars[j]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${i} and ${j}`).toBeGreaterThan(SAFE_GAP - 1);
    }
    // on the straight, neighbours in a row sit on opposite sides of the road
    const g = t.segments[0]!.entry;
    const lateral = (c: (typeof r.cars)[number]) => (c.x - g.mid.x) * g.n.x + (c.y - g.mid.y) * g.n.y;
    for (let i = 0; i < 6; i += 2) expect(Math.sign(lateral(r.cars[i]!))).not.toBe(Math.sign(lateral(r.cars[i + 1]!)));
  });
  it("is ordered by the fastest lap each car can set", () => {
    const r = new Race(t, field(t, 12), 2, { realism: false });
    const ideal = (id: string) => (r as any).profile(r.cars.find((c) => c.entrant.id === id)!.entrant, 0).ideal as number;
    const bySlot = [...r.cars].sort((a, b) => a.slot - b.slot).map((c) => ideal(c.entrant.id));
    expect(bySlot).toEqual([...bySlot].sort((a, b) => a - b));
  });
  it("puts the player on pole when their best lap on this track is faster than anyone's", () => {
    const weak = { name: "Weak", accel: 3, top: 3, grip: 3, brake: 3 };
    const slow = new Race(t, field(t, 8, { car: weak }), 2, { realism: false });
    const behind = slow.cars.find((c) => c.entrant.isPlayer)!.slot;
    const quick = new Race(t, field(t, 8, { car: weak, bestLap: 1 }), 2, { realism: false });
    expect(quick.cars.find((c) => c.entrant.isPlayer)!.slot).toBe(0);
    expect(behind).toBeGreaterThan(0);
  });
  it("races to the flag with every car home", () => {
    const r = new Race(t, field(t, 32), 2, { realism: false });
    r.runToEnd();
    const res = r.results();
    expect(res).toHaveLength(32);
    expect(res.every((x) => x.finishTime !== null && !x.dnf && x.lapTimes.length === 2)).toBe(true);
  });
  it("drives off in a full pit-stop race too", () => {
    const r = new Race(t, field(t, 32), 3, { realism: true });
    r.runToEnd();
    expect(r.results().every((x) => x.finishTime !== null)).toBe(true);
  });
});

describe("power-ups", () => {
  it("are switched off: no track lays a pickup", () => {
    expect(POWERUPS_ENABLED).toBe(false);
    for (let i = 0; i < 100; i++) expect(generateTrack(`phrase-${i}-a-b`).segments.every((s) => !s.powerup)).toBe(true);
  });
});
