import { describe, expect, it } from "vitest";
import { contact, impact, type Body } from "@apex/sim";

const car = (o: Partial<Body>): Body => ({ x: 0, y: 0, hp: 0, v: 0, off: 0, offV: 0, s: 100, radius: 3.5, mass: 1, anchored: false, ...o });

describe("a hit from behind", () => {
  it("takes speed off the car behind and puts it on the car in front", () => {
    const rear = car({ x: 0, v: 80 }), front = car({ x: 6, s: 106, v: 50 });
    const j = impact(rear, front);
    expect(j).toBeGreaterThan(0);
    expect(rear.v).toBeLessThan(80);
    expect(front.v).toBeGreaterThan(50);
    expect(rear.v).toBeLessThan(front.v + 1);                 // the one behind carries on, no faster than the one in front
    expect(80 - rear.v).toBeCloseTo(front.v - 50, 5);          // equal cars swap the same amount of speed
    expect(Math.abs(rear.offV) + Math.abs(front.offV)).toBeLessThan(1e-6); // head on, so no sideways kick
  });
  it("is gentler for a smaller speed difference", () => {
    const a = car({ x: 0, v: 60 }), b = car({ x: 6, v: 55 });
    const c = car({ x: 0, v: 90 }), d = car({ x: 6, v: 55 });
    expect(impact(a, b)).toBeLessThan(impact(c, d));
  });
  it("does nothing if they are not touching, or are already moving apart", () => {
    expect(impact(car({ x: 0, v: 80 }), car({ x: 20, v: 50 }))).toBe(-1);
    const apart = impact(car({ x: 0, v: 40 }), car({ x: 6, v: 60 }));
    expect(apart).toBe(0);
  });
});

describe("side by side", () => {
  it("kicks both cars apart equally and costs them the same small amount of speed", () => {
    // two cars driving the same way, one beside the other, drifting together
    const left = car({ y: 0, v: 70, offV: 3 }), right = car({ y: 6, v: 70, offV: -3 });
    const j = impact(left, right);
    expect(j).toBeGreaterThan(0);
    // the line normal is +y at heading 0, so "right" is +y
    expect(left.offV).toBeLessThan(0);
    expect(right.offV).toBeGreaterThan(0);
    expect(left.offV).toBeCloseTo(-right.offV, 6);
    expect(left.v).toBeCloseTo(right.v, 6);
    expect(70 - left.v).toBeLessThan(10);
  });
});

describe("a T-bone", () => {
  // the striker heads east at 70; the struck car heads north at 60 (a heading of 90 degrees) and is hit on its side
  const setup = () => ({ striker: car({ x: 0, y: 0, hp: 0, v: 70 }), struck: car({ x: 6, y: 0, hp: Math.PI / 2, v: 60 }) });
  it("throws the struck car sideways, in the direction it was hit, and takes a lot of its speed", () => {
    const { striker, struck } = setup();
    impact(striker, struck);
    // east is the struck car's right-hand side when it faces north, which is -offV for a path normal pointing west
    expect(Math.abs(struck.offV)).toBeGreaterThan(25);
    expect(struck.v).toBeLessThan(50);
  });
  it("costs the striker a lot of speed too but barely moves it off its line", () => {
    const { striker, struck } = setup();
    impact(striker, struck);
    expect(striker.v).toBeLessThan(45);
    expect(Math.abs(striker.offV)).toBeLessThan(1);
  });
  it("conserves momentum along the contact apart from the bounce", () => {
    const { striker, struck } = setup();
    const before = striker.v * striker.mass; // all along x
    impact(striker, struck);
    const after = striker.v * striker.mass + (-Math.sin(struck.hp) * struck.offV + Math.cos(struck.hp) * struck.v) * struck.mass;
    expect(after).toBeLessThan(before * 1.01);
    expect(after).toBeGreaterThan(before * 0.55);
  });
});

describe("slippery roads and high speed", () => {
  const swipe = (grip: number, v: number) => {
    const left = car({ y: 0, v, offV: 3, grip }), right = car({ y: 6, v, offV: -3, grip });
    impact(left, right);
    return { left, right };
  };
  it("a car with less grip is thrown further sideways and loses more speed in a side-swipe", () => {
    const dry = swipe(1, 70), wet = swipe(0.5, 70);
    expect(Math.abs(wet.left.offV)).toBeGreaterThan(Math.abs(dry.left.offV));
    expect(wet.left.v).toBeLessThan(dry.left.v);
  });
  it("both cars in a side-swipe are recipients, each by its own grip", () => {
    const left = car({ y: 0, v: 70, offV: 3, grip: 1 }), right = car({ y: 6, v: 70, offV: -3, grip: 0.4 });
    impact(left, right);
    expect(70 - right.v).toBeGreaterThan(70 - left.v);
    expect(70 - left.v).toBeGreaterThan(0);
  });
  it("a hit at speed costs far more than a nudge", () => {
    const slow = swipe(1, 30), fast = swipe(1, 90);
    expect(90 - fast.left.v).toBeGreaterThan((30 - slow.left.v) * 2);
  });
});

describe("weight", () => {
  it("a heavier car moves a lighter one more than the reverse", () => {
    const tank = car({ x: 0, v: 40, mass: 4 }), kart = car({ x: 6, v: 40, mass: 0.45 });
    const tankStill = car({ x: 0, v: 40, mass: 4 }), kartStill = car({ x: 6, v: 0, mass: 0.45 });
    impact(tank, kart);
    impact(tankStill, kartStill);
    expect(kartStill.v).toBeGreaterThan(40);      // pushed along faster than the tank
    expect(tankStill.v).toBeGreaterThan(30);      // and the tank hardly notices
    const light = car({ x: 0, v: 40, mass: 0.45 }), heavy = car({ x: 6, v: 0, mass: 4 });
    impact(light, heavy);
    expect(heavy.v).toBeLessThan(10);
    expect(light.v).toBeLessThan(25);             // bounces off
  });
  it("cannot shift a car that is stopped in its box", () => {
    const a = car({ x: 0, v: 60 }), box = car({ x: 6, v: 0, anchored: true });
    impact(a, box);
    expect(box.v).toBe(0);
    expect(a.v).toBeLessThan(40);
  });
});

describe("overlap", () => {
  it("is prised apart", () => {
    const a = car({ x: 0, v: 0 }), b = car({ x: 3, v: 0 });
    impact(a, b);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(5.5);
  });
});

import { Race, botLine, defaultCar, generateTrack } from "@apex/sim";

/** A race with cars placed by hand on lap 0: planning off, so they cannot dodge. */
function lab(n: number, spots: { s: number; v: number; off?: number; offV?: number }[]) {
  const t = generateTrack("brave-owl-rides-melons", { biome: "grass", pieces: false });
  const es = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `c${i}`, car: defaultCar(), lines: [botLine(t, 4, 1)], isPlayer: i === 0 }));
  const r = new Race(t, es, 3, { realism: false });
  const any = r as any;
  r.cars.forEach((c, i) => {
    const sp = spots[i]!;
    c.lap = 0; c.s = sp.s; c.v = sp.v; c.gridOff = 0; c.off = sp.off ?? 0; c.offV = sp.offV ?? 0; c.freeUntil = 1e9;
    c.prof = any.profile(c.entrant, 0);
    any.place(c);
  });
  return { r, t, run: (secs: number) => { for (let k = 0; k < secs * 60; k++) r.step(); } };
}

describe("in a race", () => {
  it("a car knocked off its line comes back to it", () => {
    const { r, run } = lab(1, [{ s: 40, v: 60, off: 7, offV: 25 }]);
    run(0.1);
    expect(Math.abs(r.cars[0]!.off)).toBeGreaterThan(5);   // really was displaced
    run(2.5);
    expect(Math.abs(r.cars[0]!.off)).toBeLessThan(0.5);
    expect(Math.abs(r.cars[0]!.offV)).toBeLessThan(1); // (a rally car may still be sliding a little in a bend)
  });

  it("a shunt from behind slows the rear car, speeds up the front one, and both stay on their line", () => {
    // seg 0 is a straight, so a few units along it both cars are on the same stretch of road
    const { r, run } = lab(2, [{ s: 30, v: 72 }, { s: 36.4, v: 48 }]);
    const [rear, front] = r.cars as [typeof r.cars[0], typeof r.cars[0]];
    const events0 = r.events.length;
    run(0.05);
    expect(r.events.slice(events0).some((e) => e.type === "bump" && (e.strength ?? 0) > 6)).toBe(true);
    expect(rear.v).toBeLessThan(72);
    expect(front.v).toBeGreaterThan(48);
    run(2.5);
    expect(Math.abs(rear.off)).toBeLessThan(0.5);
    expect(Math.abs(front.off)).toBeLessThan(1);
  });

  it("two cars side by side are shoved apart and return", () => {
    const { r, run } = lab(2, [{ s: 40, v: 60, off: -2.5, offV: 2 }, { s: 40, v: 60, off: 2.5, offV: -2 }]);
    run(0.1);
    const [a, b] = r.cars as [typeof r.cars[0], typeof r.cars[0]];
    expect(Math.abs(a.off - b.off)).toBeGreaterThan(3.4);   // pushed apart by more than a car is wide, not sitting inside each other
    expect(Math.sign(a.offV)).toBe(-Math.sign(b.offV));
  });

  it("a car carried into a bend faster than it allows runs wide, then slows and rejoins", () => {
    const { r, t, run } = lab(1, [{ s: 0, v: 0 }]);
    const c = r.cars[0]!, p = c.prof;
    // the tightest ordinary bend of the lap (not a pinch, which a car can brake for in time)
    let at = 0;
    for (let i = 0; i < p.n; i++) if (p.kap[i]! < 0.1 && p.kap[i]! > p.kap[at]!) at = i;
    // already braking on the limit, 20 units before it, then shoved forward by a shunt from behind
    c.s = Math.max(0, at * p.ds - 20);
    c.v = p.vLim[Math.round(c.s / p.ds)]! + 18;
    (r as any).place(c);
    let widest = 0;
    for (let k = 0; k < 240; k++) { r.step(); widest = Math.max(widest, Math.abs(c.off)); }
    expect(widest).toBeGreaterThan(1.0);
    run(3);
    expect(Math.abs(c.off)).toBeLessThan(0.6);
    expect(t.segments.length).toBeGreaterThan(8);
  });
});

describe("recovering from a hit", () => {
  // a car on a straight at speed is knocked hard sideways: it must turn and steer back, not slide into place
  it("turns to get back to its line and rejoins pointing along it", () => {
    const { r, run } = lab(1, [{ s: 40, v: 60, off: 0, offV: 0 }]);
    const c = r.cars[0] as any;
    c.offV = 24; (r as any).startRecovery(c, 0.3, 0.5);
    let widest = 0, turned = 0, rec = 0;
    for (let k = 0; k < 60 * 8; k++) { r.step(); widest = Math.max(widest, Math.abs(c.off)); turned = Math.max(turned, Math.abs(c.psi)); if (c.rec) rec++; }
    expect(turned).toBeGreaterThan(0.3);        // it really pointed off its line
    expect(widest).toBeGreaterThan(4);          // and travelled off it
    expect(rec).toBeGreaterThan(60);            // it took a while to sort out (not instantly)
    expect(c.rec).toBe(false);                  // and then it rejoined
    expect(Math.abs(c.off)).toBeLessThan(1);
    expect(c.v).toBeGreaterThan(20);
  });
  it("a spin goes round and the car drives off again, slower, with its tyres sliding", () => {
    const { r } = lab(1, [{ s: 40, v: 70, off: 0, offV: 0 }]);
    const c = r.cars[0] as any;
    (r as any).startRecovery(c, 2.8, 7);
    let slid = 0, slowest = 70;
    for (let k = 0; k < 60 * 10; k++) { r.step(); slid = Math.max(slid, Math.abs(c.beta)); slowest = Math.min(slowest, c.v); }
    expect(slid).toBeGreaterThan(0.6);          // a big slip angle: the screech
    expect(slowest).toBeLessThan(40);
    expect(c.rec).toBe(false);
    expect(Math.abs(c.off)).toBeLessThan(1.5);
  });
  it("a car stuck nose-first against the wall reverses out and rejoins", () => {
    const { r } = lab(1, [{ s: 40, v: 0, off: 25, offV: 0 }]);
    const c = r.cars[0] as any;
    c.rec = true; c.psi = 1.5; c.phi = 0; c.yaw = 0; c.v = 0;
    let backed = false, farthest = 0;
    for (let k = 0; k < 60 * 14; k++) { r.step(); if (c.back) backed = true; farthest = Math.max(farthest, Math.abs(c.off)); }
    expect(backed).toBe(true);
    expect(c.rec).toBe(false);
    expect(Math.abs(c.off)).toBeLessThan(1.5);
  });
});

describe("touching means the car's own size", () => {
  const sized = (o: Partial<Body>): Body => car({ length: 8, width: 3.2, h: 0, radius: 2.8, ...o });
  it("counts a nose and a tail: two cars 8 long, 7 apart nose to tail, are in each other", () => {
    expect(contact(sized({ x: 0 }), sized({ x: 7 }))).not.toBeNull();
    expect(contact(sized({ x: 0 }), sized({ x: 8.2 }))).toBeNull(); // the old discs (5.6) would have called 7 clear
  });
  it("counts their width: side by side, 3 apart touches, 3.4 does not", () => {
    expect(contact(sized({ x: 0, y: 0 }), sized({ x: 0, y: 3 }))).not.toBeNull();
    expect(contact(sized({ x: 0, y: 0 }), sized({ x: 0, y: 3.4 }))).toBeNull();
  });
  it("follows the way each car points, and pushes along the shortest way out", () => {
    const hit = contact(sized({ x: 0 }), sized({ x: 7.2, y: 0.3 }))!;
    expect(Math.abs(hit.nx)).toBeGreaterThan(0.99); // a nose-to-tail touch pushes along the cars
    expect(hit.depth).toBeCloseTo(0.8, 1);
    const crossed = contact(sized({ x: 0 }), sized({ x: 4, y: 0, h: Math.PI / 2 }))!; // a T-bone: the striker's nose into the other's flank
    expect(crossed).not.toBeNull();
    expect(contact(sized({ x: 0 }), sized({ x: 9.2, y: 0, h: Math.PI / 2 }))).toBeNull();
  });
  it("separates two overlapping cars by their depth and no more", () => {
    const a = sized({ x: 0, v: 10 }), b = sized({ x: 7, v: 0 });
    impact(a, b);
    expect(contact(a, b)?.depth ?? 0).toBeLessThan(0.6);
  });
  it("still treats a body with no size as a disc", () => {
    expect(contact(car({ x: 0 }), car({ x: 6.5 }))).not.toBeNull();
    expect(contact(car({ x: 0 }), car({ x: 7.5 }))).toBeNull();
  });
});
