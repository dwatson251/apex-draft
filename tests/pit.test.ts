import { describe, expect, it } from "vitest";
import {
  PIT_PENALTY, PIT_STOP_TIME, Race, Rng, TANK, TYRE_WEAR_PER_LAP, botLine, checkTrack, defaultCar, fuelPerLap, generateTrack,
  randomPhrase, type Entrant,
} from "@apex/sim";

const phrases = (n: number, seed = 1) => Array.from({ length: n }, (_, i) => randomPhrase(new Rng(i + seed)));
const field = (t: ReturnType<typeof generateTrack>, n: number, pit?: (i: number) => boolean[] | undefined): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, car: defaultCar(), lines: [botLine(t, i + 1, 0.55 + 0.05 * i)], isPlayer: i === 0, pit: pit?.(i) }));

describe("tracks with a pit lane", () => {
  it("always have a clear straight either side of the start line", () => {
    for (const p of phrases(300, 50)) expect(checkTrack(generateTrack(p)), p).toEqual([]);
  });
  it("keep the same layout with obstacles off", () => {
    const a = generateTrack("quiet-fox-hugs-kites"), b = generateTrack("quiet-fox-hugs-kites", { obstacles: false });
    expect(b.segments.every((s) => s.obstacles.length === 0)).toBe(true);
    expect(b.segments.map((s) => [s.cx, s.cy, s.kind, s.powerup?.kind])).toEqual(a.segments.map((s) => [s.cx, s.cy, s.kind, s.powerup?.kind]));
  });
});

describe("tyres and fuel", () => {
  const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
  it("wear tyres by about the stated amount a lap, and burn about a third of a tank", () => {
    const r = new Race(t, field(t, 1), 2); r.runLap("b0", 0);
    const c = r.cars[0]!;
    expect(1 - c.tyre).toBeGreaterThan(TYRE_WEAR_PER_LAP * 0.6);
    expect(1 - c.tyre).toBeLessThan(TYRE_WEAR_PER_LAP * 1.5);
    expect(c.fuel).toBeCloseTo(TANK - fuelPerLap(defaultCar()), -1);
  });
  it("slow the car as the tyres wear (grip changes at the start of each lap)", () => {
    const worn = new Race(t, field(t, 1), 3); worn.cars[0]!.tyre = 0.05; worn.runToEnd();
    const fresh = new Race(t, field(t, 1), 3); fresh.runToEnd();
    expect(worn.results()[0]!.lapTimes[1]!).toBeGreaterThan(fresh.results()[0]!.lapTimes[1]! + 0.3);
  });
  it("can be switched off", () => {
    const r = new Race(t, field(t, 2), 3, { realism: false }); r.runToEnd();
    expect(r.cars.every((c) => c.fuel === TANK && c.tyre === 1 && c.pits === 0)).toBe(true);
    expect(r.results().every((x) => x.penalty === 0 && !x.dnf)).toBe(true);
  });
});

describe("pit stops", () => {
  it("a lap with a stop is slower by roughly the stop plus the slow lane, and the car stops in its box", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const plain = new Race(t, field(t, 1), 3); plain.runToEnd();
    const pitted = new Race(t, field(t, 1, () => [true, false, false]), 3); pitted.runToEnd();
    const p = pitted.cars[0]!;
    expect(p.pits).toBe(1);
    expect(p.fuel).toBeGreaterThan(TANK - 2 * fuelPerLap(defaultCar()) - 1);
    const cost = pitted.cars[0]!.finishTime! - plain.cars[0]!.finishTime!;
    expect(cost).toBeGreaterThan(PIT_STOP_TIME);
    expect(cost).toBeLessThan(PIT_STOP_TIME + 5);
    expect(pitted.events.filter((e) => e.type === "pitStart").length).toBe(1);
    expect(pitted.events.filter((e) => e.type === "pitEnd").length).toBe(1);
    const stopped = p.vtrace.filter((v, k) => v === 0 && p.ptrace[k] === 2).length;
    expect(stopped / 60).toBeGreaterThanOrEqual(PIT_STOP_TIME - 0.1);
  });
  it("never pitting costs the penalty, pitting does not", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const r = new Race(t, field(t, 2, (i) => (i === 0 ? [true, false, false] : undefined)), 3); r.runToEnd();
    const res = r.results();
    expect(res.find((x) => x.id === "b0")!.penalty).toBe(0);
    expect(res.find((x) => x.id === "b1")!.penalty).toBe(PIT_PENALTY);
  });
  it("running dry sends the car limping to the pits for an emergency refuel, and it carries on and finishes", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const r = new Race(t, field(t, 4), 5); // five laps is more than a tank, and the player never queues a stop
    r.runToEnd();
    const res = r.results();
    const me = res.find((x) => x.id === "b0")!;
    expect(me.dnf).toBe(false);
    expect(me.finishTime).not.toBeNull();
    expect(me.emergencies).toBeGreaterThanOrEqual(1);
    expect(me.pits).toBeGreaterThanOrEqual(1);
    expect(r.events.some((e) => e.id === "b0" && e.type === "dry")).toBe(true);
    expect(r.events.some((e) => e.id === "b0" && e.type === "out")).toBe(false);
    // it limped at the limp speed, then was refuelled
    const c = r.cars.find((x) => x.entrant.id === "b0")!;
    expect(Math.min(...c.ftrace)).toBeLessThan(0.5);
    expect(c.fuel).toBeGreaterThan(0);
    expect(res.every((x) => !x.dnf)).toBe(true);
  });
  it("the emergency stop is slower than a planned one, and gives no new tyres", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const dwell = (plan: boolean) => {
      const e: Entrant[] = [{ id: "b0", name: "B", car: defaultCar(), lines: [botLine(t, 1, 0.9)], isPlayer: true, pitPlan: plan ? [{ lap: 3 }] : [] }];
      const r = new Race(t, e, 6);
      let start = -1, end = -1, tyreBefore = 1, tyreAfter = 1;
      while (!r.over) {
        r.step();
        const c = r.cars[0]!;
        if (start < 0 && c.dwell > 0) { start = r.tick; tyreBefore = c.tyre; }
        if (start >= 0 && end < 0 && c.dwell === 0) { end = r.tick; tyreAfter = c.tyre; }
      }
      return { len: (end - start) / 60, tyreBefore, tyreAfter, emergencies: r.cars[0]!.emergencies };
    };
    const planned = dwell(true), emergency = dwell(false);
    expect(planned.emergencies).toBe(0);
    expect(emergency.emergencies).toBeGreaterThanOrEqual(1);
    expect(emergency.len).toBeGreaterThan(planned.len + 0.5);
    expect(planned.tyreAfter).toBeGreaterThan(planned.tyreBefore + 0.2);   // fresh tyres
    expect(emergency.tyreAfter).toBeLessThan(emergency.tyreBefore + 0.01); // the same ones
  });
  it("a full field with stops sorts out its contacts: no failsafe, everyone finishes", () => {
    for (const p of phrases(8, 300)) {
      const t = generateTrack(p);
      const r = new Race(t, field(t, 8, (i) => (i % 2 ? undefined : [false, true, false, false])), 4);
      r.runToEnd();
      expect(r.cars.filter((c) => c.freeUntil > 0).map((c) => c.entrant.id), p).toEqual([]);
      expect(r.cars.filter((c) => !c.out && c.finishTime === null), p).toEqual([]);
    }
  });
});

import { VEHICLES, VEHICLE_IDS, carStats, vehicleForSeed, parseLineFile, serializeLineFile } from "@apex/sim";

describe("vehicle classes", () => {
  it("are picked by the phrase, the same every time, with every class turning up", () => {
    const seen = new Set<string>();
    for (const p of phrases(200, 900)) {
      const t = generateTrack(p);
      expect(vehicleForSeed(t.seed)).toBe(vehicleForSeed(generateTrack(p).seed));
      seen.add(vehicleForSeed(t.seed));
    }
    expect([...seen].sort()).toEqual([...VEHICLE_IDS].sort());
  });
  it("drive like what they are", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const lap = (type: (typeof VEHICLE_IDS)[number]) => {
      const car = { ...defaultCar(), type };
      const r = new Race(t, [{ id: "x", name: "x", car, lines: [botLine(t, 3, 1)], isPlayer: true }], 2, { realism: false });
      r.runToEnd();
      return r.results()[0]!.lapTimes[1]!;
    };
    const times = Object.fromEntries(VEHICLE_IDS.map((id) => [id, lap(id)]));
    expect(times["formula"]).toBeLessThan(times["rally"]!);
    expect(times["rally"]).toBeLessThan(times["truck"]!);
    expect(times["truck"]).toBeLessThan(times["tank"]!);
    // the kart is slow on the straights but quick in the bends: a lower top speed, better grip than the rally car
    expect(carStats({ ...defaultCar(), type: "kart" }).vTop).toBeLessThan(carStats(defaultCar()).vTop);
    expect(carStats({ ...defaultCar(), type: "kart" }).aLat).toBeGreaterThan(carStats(defaultCar()).aLat);
    expect(VEHICLES.tank.wear).toBeLessThan(VEHICLES.formula.wear);
    expect(VEHICLES.tank.fuel).toBeGreaterThan(VEHICLES.kart.fuel);
  });
  it("burn fuel and wear tyres at their own rate", () => {
    const t = generateTrack("brave-owl-rides-melons", { biome: "grass" });
    const used = (type: (typeof VEHICLE_IDS)[number]) => {
      const car = { ...defaultCar(), type };
      const r = new Race(t, [{ id: "x", name: "x", car, lines: [botLine(t, 3, 1)], isPlayer: true }], 2);
      r.runLap("x", 0);
      return { fuel: TANK - r.cars[0]!.fuel, wear: 1 - r.cars[0]!.tyre };
    };
    expect(used("kart").fuel).toBeLessThan(used("rally").fuel);
    expect(used("tank").fuel).toBeGreaterThan(used("rally").fuel);
    expect(used("formula").wear).toBeGreaterThan(used("kart").wear);
  });
  it("travel in line files", () => {
    const t = generateTrack("quiet-fox-hugs-kites");
    const back = parseLineFile(serializeLineFile({ phrase: t.phrase, name: "me", car: { ...defaultCar(), type: "tank" }, lines: [botLine(t, 1, 1)] }));
    expect(typeof back === "object" && back.car.type).toBe("tank");
  });
});

import { BIOME_IDS, BIOMES, biomeForSeed } from "@apex/sim";

describe("biomes", () => {
  it("are picked by the phrase, the same every time, and every place turns up", () => {
    const seen = new Set<string>();
    for (const p of phrases(300, 2000)) {
      const t = generateTrack(p);
      expect(t.biome).toBe(generateTrack(p).biome);
      expect(t.biome).toBe(biomeForSeed(t.seed));
      seen.add(t.biome);
    }
    expect([...seen].sort()).toEqual([...BIOME_IDS].sort());
  });
  it("change how the surface behaves, and not the layout", () => {
    const base = generateTrack("quiet-fox-hugs-kites", { biome: "grass" });
    const lapOn = (biome: (typeof BIOME_IDS)[number]) => {
      const t = generateTrack("quiet-fox-hugs-kites", { biome });
      expect(t.segments.map((s) => [s.cx, s.cy, s.kind])).toEqual(base.segments.map((s) => [s.cx, s.cy, s.kind]));
      const r = new Race(t, [{ id: "x", name: "x", car: defaultCar(), lines: [botLine(base, 3, 1)], isPlayer: true }], 2);
      r.runToEnd();
      const c = r.cars[0]!;
      return { lap: r.results()[0]!.lapTimes[1]!, wear: 1 - c.tyre, fuel: TANK - c.fuel };
    };
    const g = lapOn("grass"), snow = lapOn("snow"), moon = lapOn("moon"), desert = lapOn("desert"), city = lapOn("city");
    expect(snow.lap).toBeGreaterThan(g.lap + 0.5);
    expect(moon.lap).toBeGreaterThan(g.lap);
    expect(city.lap).toBeLessThan(g.lap + 0.01);
    expect(snow.wear).toBeLessThan(g.wear);
    expect(desert.wear).toBeGreaterThan(g.wear);
    expect(moon.wear).toBeLessThan(snow.wear);
    expect(desert.fuel).toBeGreaterThan(g.fuel);
    expect(BIOMES.moon.accel).toBeGreaterThan(1);
  });
});
