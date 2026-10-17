import { describe, expect, it } from "vitest";
import { Race, botLine, defaultCar, generateTrack, makeBots, placeFor, type Entrant } from "@apex/sim";

function duo(sameLine = false): { r: Race; a: any; b: any } {
  const t = generateTrack("quiet-lynx-needs-clocks", { obstacles: false });
  const shared = botLine(t, 3, 0.9);
  const ents: Entrant[] = [0, 1].map((i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [sameLine ? shared : botLine(t, 3 + i, 0.9)], isPlayer: i === 0 }));
  const r = new Race(t, ents, 3, { realism: false });
  return { r, a: r.cars.find((c) => c.entrant.id === "c0")!, b: r.cars.find((c) => c.entrant.id === "c1")! };
}

describe("a car that has been spun round", () => {
  it("turns itself round and drives off, instead of swapping between forward and reverse for ever", () => {
    const { r, a, b } = duo();
    // car b is a long way off, so nobody is in the way
    for (let i = 0; i < 600; i++) r.step();
    b.finishTime = 1; // out of the picture
    a.rec = true; a.psi = 3.0; a.phi = 0; a.yaw = 0; a.v = 1; a.off = 2;
    let flips = 0, last = a.back;
    for (let i = 0; i < 60 * 15 && a.rec; i++) { r.step(); if (a.back !== last) { flips++; last = a.back; } }
    expect(a.rec).toBe(false);
    expect(flips).toBeLessThan(6);
  });
});

describe("steering a recovering car", () => {
  it("needs the car to be moving, and swings its middle out as the nose comes round (it turns about its rear axle)", () => {
    const { r, a, b } = duo();
    for (let i = 0; i < 600; i++) r.step();
    b.finishTime = 1;
    // stopped, nose a quarter turn off the road: the first instant it cannot turn at all
    a.rec = true; a.psi = 1.2; a.phi = 1.2; a.yaw = 0; a.v = 0; a.off = 0; a.offV = 0;
    r.step();
    expect(Math.abs(a.yaw)).toBeLessThan(0.05);
    // rolling, it turns, and as it does the middle of the car moves across the road
    const off0 = a.off;
    let moved = 0;
    for (let i = 0; i < 40; i++) { r.step(); moved = Math.max(moved, Math.abs(a.off - off0)); }
    expect(Math.abs(a.psi)).toBeLessThan(1.1);
    expect(moved).toBeGreaterThan(0.5);
  });
});

describe("the turning circle of a recovering car", () => {
  it("is much tighter when it is crawling than when it is at speed", () => {
    // the time to swing the nose a quarter turn round with nothing in the way
    const quarter = (v: number) => {
      const { r, a, b } = duo();
      for (let i = 0; i < 600; i++) r.step();
      b.finishTime = 1;
      a.rec = true; a.psi = 1.57; a.phi = 0; a.yaw = 0; a.v = v; a.off = 0; a.offV = 0;
      let k = 0, travelled = 0;
      for (; k < 60 * 10 && Math.abs(a.psi) > 0.3; k++) { const x = a.x, y = a.y; r.step(); travelled += Math.hypot(a.x - x, a.y - y); }
      return { seconds: k / 60, travelled };
    };
    const slow = quarter(4), fast = quarter(60);
    expect(slow.seconds).toBeLessThan(1.4);
    expect(slow.travelled).toBeLessThan(fast.travelled / 3);
  });
});

describe("a car stopped on the road ahead", () => {
  it("is steered round by the car coming up behind it, with no touch, not queued behind", () => {
    const { r, a, b } = duo(true);
    for (let i = 0; i < 900; i++) r.step();
    // a sits dead on the line, stuck; b is coming up behind it flat out on the same line
    const hold = (): void => { a.v = 0; a.off = 0; a.offV = 0; a.stuck = 400; };
    a.s = 520; b.s = 400; b.v = 70; b.off = 0; b.offV = 0; b.stuck = 0; b.aim = 0;
    a.lap = b.lap; hold();
    const bumps = r.events.length;
    let passed = false;
    for (let i = 0; i < 60 * 8; i++) { hold(); r.step(); if (b.s > a.s + 25) { passed = true; break; } }
    expect(passed).toBe(true);
    expect(r.events.slice(bumps).filter((e) => e.type === "bump")).toHaveLength(0);
  });
});

describe("a pile-up at a junction", () => {
  it("clears itself: nobody is stopped for ever, and everyone gets home", () => {
    for (const phrase of ["fun-one-two"]) {
      const t = generateTrack(phrase, { obstacles: false });
      const r = new Race(t, makeBots(t, placeFor(phrase).vehicle, 0, 24), 2, { realism: true });
      const run = new Map<string, number>();
      let worst = 0, ghosts = 0;
      while (!r.over) {
        r.step();
        ghosts += r.cars.filter((c) => c.finishTime === null && c.ghost).length;
        for (const c of r.cars) {
          const stopped = c.finishTime === null && !c.out && c.dwell === 0 && c.bay === undefined && c.v < 2 && r.time > 6;
          const n = stopped ? (run.get(c.entrant.id) ?? 0) + 1 : 0;
          run.set(c.entrant.id, n);
          worst = Math.max(worst, n);
        }
      }
      expect(worst / 60, `${phrase}: the longest any car sat still`).toBeLessThan(12);
      expect(ghosts, "nobody goes ghost in a jam or after a collision").toBe(0);
      expect(r.results().every((x) => x.finishTime !== null)).toBe(true);
    }
  }, 240000);
});
